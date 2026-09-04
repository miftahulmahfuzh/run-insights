import { addDays, todayInJakarta } from '@/lib/date/ranges'
import { listActiveUserIds } from '@/lib/db/queries'
import { cronEnv } from '@/lib/env'
import { evaluateAndEmitForUser } from '@/lib/nina/proactive'
import { resolveNinaPromises } from '@/lib/nina/promises'

/**
 * `GET /api/cron/nina` — the evening proactivity pass. Triggers 2–5 of RU-15/RU-17; trigger 1
 * (`run_committed`) fires from `after()` at the moment of the commit and never comes through here.
 *
 * **The fifth sanctioned route handler** (roadmap §4.1 / D7, whose count goes four → five with
 * this file). It is a cron, guarded by the same `CRON_SECRET` as the fourth, and D7's reasoning for
 * keeping the list short is unchanged by it.
 *
 * ── WHY 19:00 ASIA/JAKARTA, AND HOW THE SCHEDULE SPELLS IT ──────────────────────────────────────
 * Vercel cron `schedule` strings are UTC, always, regardless of `regions`. Asia/Jakarta is UTC+7
 * with no DST, ever. 19:00 WIB is therefore `"0 12 * * *"`, and because 12 + 7 = 19 < 24 the
 * Jakarta calendar day at cron time is the same date as the UTC date — no rollover, unlike
 * `/api/cron/rollup`'s `"0 20 * * *"`, which lands at 03:00 WIB the *following* day. That is why
 * copying the rollup's schedule would have been wrong here, and why the two jobs are eight hours
 * apart on the clock and never contend for the same connection pool or z.ai rate window.
 * `todayInJakarta()` is still the only thing asked what day it is; nothing here does its own
 * offset arithmetic on a date.
 *
 * The Hobby plan triggers a cron within the hour of its schedule and caps the account at two jobs
 * — which is exactly `rollup` + `nina`, and exactly why a second Nina pass (a morning one, say) is
 * not proposed. The real firing window is therefore 19:00–20:00 WIB, so
 * `MISSED_DAY_EVENING_HOUR` is 18 rather than 19: the guard admits the whole window instead of
 * demanding an exact hour. It lives in `lib/nina/proactive.ts` precisely so this route contains no
 * time-of-day logic at all.
 *
 * ── AT MOST ONE MESSAGE PER USER PER INVOCATION ─────────────────────────────────────────────────
 * `evaluateAndEmitForUser` resolves the four candidates by priority and emits one. Two proactive
 * openers in one evening is not twice as proactive, it is spam.
 *
 * ── IT IS ALSO THE NUDGE ENDPOINT ───────────────────────────────────────────────────────────────
 * Phase 14's `/update-nina-profpic` skill GETs this route with `Authorization: Bearer $CRON_SECRET`
 * after it pushes a hand-uploaded avatar, as a best-effort "say something about it now" rather than
 * waiting for the evening. That works because `avatar_changed` is the highest-priority trigger and
 * because its marker is `nina_avatars.announced_at`, so the nudge is safe to repeat: the second
 * call finds nothing unannounced and emits nothing. **Any authenticated caller may hit this route
 * as often as they like; idempotence is what makes that harmless, not rate limiting.**
 *
 * ── SEQUENTIAL, AND ONE USER'S FAILURE STOPS NOTHING ────────────────────────────────────────────
 * Same two reasons as the rollup, unchanged: there is no evidence z.ai's rate limit tolerates a
 * burst and a personal app is not where to find out; and a cron that aborts on the first bad row
 * silently stops serving everyone after it in the list.
 */

export const runtime = 'nodejs'
/**
 * A LITERAL, not an imported constant: segment config exports are statically analysed at build
 * time and `next build` rejects an identifier here (the trap `/api/extract` and
 * `/api/cron/rollup` both document).
 */
export const maxDuration = 60

/** 50 s against a 60 s ceiling: the response itself plus a call already in flight when it passes. */
const NINA_SOFT_DEADLINE_MS = 50_000
/**
 * A proactive turn is one `glm-5.3` call plus a persist — measured siblings run 13–16 s, and RU-4's
 * pre-injected context makes this one no cheaper. Starting one with less than this left buys a
 * half-finished invocation, a truncated log and no message, so the loop declines instead.
 */
const NINA_MIN_SLOT_MS = 20_000

/** Same 60-day window as the rollup: an evaluation for an inactive user is two indexed reads. */
const ACTIVE_WINDOW_DAYS = 60

export async function GET(request: Request): Promise<Response> {
  // Read inside the handler, never at module scope: `cronEnv()` is lazy so `next build` and CI
  // (which set no CRON_SECRET) can collect this route's page data without the variable set.
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const startedAt = Date.now()
  const deadline = startedAt + NINA_SOFT_DEADLINE_MS

  const todayISO = todayInJakarta()
  const userIds = await listActiveUserIds(addDays(todayISO, -ACTIVE_WINDOW_DAYS))

  let emitted = 0
  let quiet = 0
  let failed = 0
  let skipped = 0
  const kinds: Record<string, number> = {}

  for (const [index, userId] of userIds.entries()) {
    /*
     * The rollup puts its cheap work before its expensive work so a deadline expiry drops the
     * model call. This job has the same shape but the split falls INSIDE
     * `evaluateAndEmitForUser` — the cheap half is the evaluation (two indexed reads and a
     * context load, no model), the expensive half is the emission. So the budget is checked once,
     * against the room a turn would need: a user this stops short of would very likely have said
     * nothing anyway, and starting a turn that cannot finish is the one outcome worth avoiding.
     */
    const remaining = deadline - Date.now()
    if (remaining < NINA_MIN_SLOT_MS) {
      skipped = userIds.length - index
      console.warn('[cron nina] out of budget', { skipped, remaining })
      break
    }

    /*
     * F33 phase 13, R19 — the promise sweep, BEFORE the triggers and deliberately so.
     *
     * A promise that settles here dispatches a generation whose `nina_avatars` row lands with
     * `announced_at` NULL, and phase 10's `avatar_changed` trigger is exactly "a current avatar
     * nobody has mentioned". Running the sweep first means a photograph that arrived since the
     * last tick is announced on THIS tick rather than the next one.
     *
     * It never posts a message itself (phase 13's D-3: there is exactly one announcer, and it is
     * the trigger below). It is idempotent, so the five-minute cadence costs one indexed slot read
     * on the common tick and nothing else — a promise with a job already dispatched is not
     * re-fired inside the same Jakarta day.
     *
     * Its own try, inside the user's: a sweep that throws must not cost this user the four
     * triggers, and the `catch` below would otherwise swallow them together.
     */
    try {
      const sweep = await resolveNinaPromises(userId)
      if (sweep.wrote) {
        console.log('[cron nina] promise sweep', {
          userId,
          fired: sweep.fired,
          settled: sweep.settled,
          expired: sweep.expired,
        })
      }
    } catch (cause) {
      console.warn('[cron nina] promise sweep failed', { userId, error: String(cause) })
    }

    /* Every user in its own try. A user whose context fails to load — a bad memory row, a null
     * where the gateway expected a number — must not cost every user after them their evening. */
    try {
      const result = await evaluateAndEmitForUser(userId)
      if (result.emitted) {
        emitted++
        if (result.kind) kinds[result.kind] = (kinds[result.kind] ?? 0) + 1
      } else {
        quiet++
        console.info('[cron nina] nothing to say', { userId, reason: result.reason })
      }
    } catch (cause) {
      failed++
      console.warn('[cron nina] user failed', { userId, error: String(cause) })
    }
  }

  return Response.json({
    ok: true,
    users: userIds.length,
    emitted,
    quiet,
    failed,
    skipped,
    kinds,
    todayISO,
    elapsedMs: Date.now() - startedAt,
  })
}
