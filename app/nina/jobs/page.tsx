import { NinaJobList } from '@/components/nina/NinaJobList'
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'

/**
 * `/nina/jobs` — R1's tracking page: every image generation, newest first, with its stage, its
 * elapsed time and its error at a glance.
 *
 * ── ONE INDEXED READ AND NOTHING ELSE ─────────────────────────────────────────────────────────
 * `listNinaImageJobs` reads `nina_turns_user_created_idx` with `kind` as a heap filter and a real
 * `LIMIT`. No model call, so invariant 4 is satisfied structurally — there is nothing here for
 * `scripts/check-llm-payload-boundary.mjs` to object to — and `app/nina/about/page.tsx` is the
 * precedent for the whole shape.
 *
 * **NO SWEEP.** `listOpenNinaImageJobs` runs `sweepStaleNinaImageJobs` for its side effect and
 * `/nina` still awaits it; this page deliberately does not. See the block above `listNinaImageJobs`
 * for why a tracking screen must not change what it is describing by being looked at.
 *
 * ── WHY THERE IS NO `loading.tsx` ─────────────────────────────────────────────────────────────
 * `app/nina/about/page.tsx`'s D-4, unchanged: one index lookup resolves inside one paint, so a
 * skeleton would flash and be replaced. One at `app/nina/` would wrap the conversation too, which
 * is the specific thing that page declined to impose on a route it did not own.
 *
 * ── NO `maxDuration` ──────────────────────────────────────────────────────────────────────────
 * That export exists on `/nina` and `/r/[id]` because a Server Action's timeout is the page
 * SEGMENT's. This route calls no action and awaits no model; the platform default is correct and an
 * export claiming otherwise would be cargo.
 *
 * ── `nowMs` IS READ ONCE, HERE ────────────────────────────────────────────────────────────────
 * One reading of the clock for this render, shared by every ticking row, so two rows a millisecond
 * apart cannot show two different elapsed times for jobs opened in the same second.
 * `app/nina/page.tsx` hoists `todayInJakarta()` out of `<ChatScreen>` for exactly this reason.
 */
export default async function NinaJobsPage() {
  const userId = await requireUserId()
  const jobs = await listNinaImageJobs(userId)

  /*
   * ── `react-hooks/purity` IS A FALSE POSITIVE ON AN ASYNC SERVER COMPONENT, AND IT IS DISABLED
   *    RATHER THAN WORKED AROUND ─────────────────────────────────────────────────────────────────
   * The rule guards render IDEMPOTENCY: an impure read makes a re-render produce a different tree.
   * This function is an async Server Component. It runs once per request, on the server, and is
   * never re-rendered — there is no second render for this value to differ between. The repo
   * already relies on that fact one route over: `app/nina/page.tsx` reads `Date.now()` in its own
   * render (`ninaFlightView(rows, Date.now())`), which the rule lets past only because the value
   * is consumed in an argument position rather than bound to a name. Hiding this behind a helper
   * the linter cannot see through would satisfy the rule and tell the next reader less.
   *
   * Hoisted to one binding for a second, independent reason: one reading of the clock is the only
   * way every ticking row can agree about what "now" was. `app/nina/page.tsx` hoists
   * `todayInJakarta()` out of `<ChatScreen>`'s prop for exactly that and says so.
   */
  // eslint-disable-next-line react-hooks/purity -- server render, once per request; see above.
  const nowMs = Date.now()

  return (
    <AppShell>
      <ScreenHeader title="Proses foto" />
      <NinaJobList
        items={toNinaJobListItems(jobs)}
        nowMs={nowMs}
        emptyText="Belum ada foto yang pernah digenerate. Minta Nina kirim satu di chat."
      />
    </AppShell>
  )
}
