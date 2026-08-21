import { sweepPeriodBadges } from '@/lib/badges/evaluate'
import { dbBadgeGateway } from '@/lib/badges/gateway'
import { addDays, monthKey as monthKeyOf, isoWeekKeyOf, todayInJakarta } from '@/lib/date/ranges'
import { listActiveUserIds } from '@/lib/db/queries'
import { cronEnv } from '@/lib/env'
import { loadMonthFacts, loadWeekFacts } from '@/lib/insights/load'
import { getOrCreateInsight } from '@/lib/llm/narrate'

/**
 * `GET /api/cron/rollup` — the nightly week/month refresh. One of D7's four sanctioned route
 * handlers, guarded by `CRON_SECRET` (roadmap §4.1).
 *
 * ── WHY IT IS CHEAP IN STEADY STATE, AND WHY THAT IS THE WHOLE DESIGN ─────────────────────────
 * `getOrCreateInsight` reaches the model only on a `facts_hash` miss. A user who ran nothing since
 * last night produces the same facts, the same hash, and two pure cache hits. **The nightly cost
 * is proportional to new activity, not to user count × 2 calls** — and `tests/insights.cron.test.ts`
 * asserts exactly that, because the claim is worthless if it is only believed.
 *
 * What the job buys: by the time anyone opens `/trends`, the current week and month are already
 * written, so the screen is a single-digit-millisecond read instead of a 20 s wait. The slow path
 * only survives for a period viewed before its first cron run.
 *
 * ── ONLY THE CURRENT WEEK AND MONTH ───────────────────────────────────────────────────────────
 * No back-fill, no "wait until the period closes". A mid-week insight is the point of `/trends`
 * being readable at any time, and caching means it simply refreshes as runs land inside the same
 * period. Yesterday's week is regenerated too on the first run after midnight Sunday — that is
 * the same `isoWeekKeyOf(today)` call, not a special case.
 *
 * ── SEQUENTIAL, AND ONE USER'S FAILURE STOPS NOTHING ──────────────────────────────────────────
 * The loop is deliberately not parallel: there is no evidence yet that z.ai's rate limit tolerates
 * a burst, and a personal app is not where to find out. Every user is wrapped in its own `try`,
 * because a cron that aborts on the first bad row silently stops serving everyone after it in the
 * list — the worst failure mode available to a background job.
 *
 * ── F09'S BADGE SWEEP RIDES ALONG, AND GOES FIRST ─────────────────────────────────────────────
 * `sweepPeriodBadges` re-checks each active user's week, month and lifetime rules — three cheap
 * indexed queries, no model call. F09 §8.2 is candid that v0.1.0 does not strictly need it: every
 * period rule already fires at the commit that satisfies it, whatever order runs are reviewed in.
 * It is a backstop for the day something can change an aggregate WITHOUT a commit (a deleted run, a
 * correction that moves a run across a week boundary), bought for almost nothing because this job
 * already walks the same user list.
 *
 * It runs BEFORE the two insight generations, not after, precisely because it is the cheap half: if
 * the soft deadline expires mid-user, the work that gets skipped should be the 15 s model call that
 * a page view will happily do on demand, not the 30 ms query that nothing else will retry.
 *
 * ── IT STOPS ITSELF BEFORE THE PLATFORM DOES ──────────────────────────────────────────────────
 * A generation measured 13–16 s live, and week + month for one cold user can therefore exceed the
 * 60 s ceiling on its own. Rather than be killed mid-call — which produces a half-finished
 * invocation, a truncated log and no report — the loop checks a soft deadline before starting each
 * scope and stops cleanly, reporting how many users it did not reach. The work is not lost: the
 * cache means tomorrow's run picks up exactly where this one stopped, and a page view generates it
 * sooner than that.
 */

export const runtime = 'nodejs'
/**
 * A LITERAL, not an imported constant: segment config exports are statically analysed at build
 * time and `next build` rejects an identifier here (the same trap `/api/extract` documents).
 *
 * The loop's own 55 s soft deadline is what keeps the job inside this, rather than hope. See the
 * note above on why it stops itself.
 */
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  // Read inside the handler, never at module scope: `cronEnv()` is lazy so that `next build` (and
  // CI, which sets no CRON_SECRET) can collect this route's page data without the variable set.
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  // The whole invocation's clock. 55 s against a 60 s ceiling leaves room for the response
  // itself and for a call that is already in flight when the deadline passes.
  const deadline = Date.now() + 55_000

  const todayISO = todayInJakarta()
  const weekKey = isoWeekKeyOf(todayISO)
  const monthKey = monthKeyOf(todayISO)

  // "Active" is generous on purpose — 60 days. A runner three weeks into a break still wants a
  // readable week when they come back, and the cache makes an inactive user's pass free anyway.
  const userIds = await listActiveUserIds(addDays(todayISO, -60))

  let generated = 0
  let failed = 0
  let skipped = 0
  let badgesEarned = 0

  for (const [index, userId] of userIds.entries()) {
    if (Date.now() > deadline) {
      skipped = userIds.length - index
      console.warn('[cron rollup] out of budget', { skipped })
      break
    }

    try {
      /* Its own try: a badge sweep that fails must not cost this user their insight refresh, and a
       * missing badge is recoverable (tomorrow's sweep, or the next commit) in a way a half-written
       * loop iteration is not. */
      try {
        const swept = await sweepPeriodBadges(userId, todayISO, dbBadgeGateway)
        badgesEarned += swept.newlyEarned.length
      } catch (cause) {
        console.warn('[cron rollup] badge sweep failed', { userId, error: String(cause) })
      }

      const week = await loadWeekFacts(userId, weekKey, todayISO)
      const weekResult = await getOrCreateInsight(userId, 'week', weekKey, week)
      if (weekResult.payload != null && !weekResult.cached) generated++

      // Week first, month second, and the deadline checked between them: the week is the default
      // scope on `/trends`, so if only one of the two fits it should be that one.
      if (Date.now() > deadline) {
        skipped = userIds.length - index
        console.warn('[cron rollup] out of budget mid-user', { userId, skipped })
        break
      }

      const month = await loadMonthFacts(userId, monthKey, todayISO)
      const monthResult = await getOrCreateInsight(userId, 'month', monthKey, month)
      if (monthResult.payload != null && !monthResult.cached) generated++
    } catch (cause) {
      failed++
      console.warn('[cron rollup] user failed', { userId, error: String(cause) })
    }
  }

  return Response.json({
    ok: true,
    users: userIds.length,
    generated,
    failed,
    skipped,
    badgesEarned,
    weekKey,
    monthKey,
  })
}
