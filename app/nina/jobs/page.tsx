import { NinaJobList } from '@/components/nina/NinaJobList'
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'
import { listNinaJobPhotoIds } from '@/lib/nina/queries'

/**
 * `/nina/jobs` — R1's tracking page: every image generation, newest first, with its stage, its
 * elapsed time and its error at a glance.
 *
 * ── TWO INDEXED READS, BOTH BATCHED, AND NOTHING WRITTEN ─────────────────────────────────────
 * `listNinaImageJobs` reads `nina_turns_user_created_idx` with `kind` as a heap filter and a real
 * `LIMIT`. `listNinaJobPhotoIds` then resolves every one of those rows' generated photographs in
 * ONE second query (`nina_message_images.turn_id IN (...)`, scoped by `user_id`), so the full-view
 * link on each row costs the screen one extra round trip total, never one per row — see that
 * function's own header for why the join `getNinaJobPhoto` uses per job is avoidable here. No
 * model call either way, so invariant 4 is satisfied structurally — there is nothing here for
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
 * ── NO `maxDuration` HERE, AND IT USED TO CARRY ONE ───────────────────────────────────────────
 * R1 shipped `maxDuration = 300` on this segment because `NinaJobActions` called
 * `redoNinaImageJob`, which registers a generation in `after()` — a Server Action's timeout is the
 * page SEGMENT's, and `after()` inherits it. That control is gone from this screen: R2 (see
 * `NinaJobActions.tsx`'s header) swapped the redo button for a full-view link, so this list's only
 * remaining mutation is `deleteNinaImageJob`, a soft-delete `UPDATE` with nothing behind it in
 * `after()`. Nothing on this segment starts a generation any more, so the export goes with the
 * call that justified it. Redo itself is unaffected — it still runs from `/nina/jobs/[id]`, whose
 * own `maxDuration = 300` this page never shared and does not need.
 *
 * ── `nowMs` IS READ ONCE, HERE ────────────────────────────────────────────────────────────────
 * One reading of the clock for this render, shared by every ticking row, so two rows a millisecond
 * apart cannot show two different elapsed times for jobs opened in the same second.
 * `app/nina/page.tsx` hoists `todayInJakarta()` out of `<ChatScreen>` for exactly this reason.
 */
export default async function NinaJobsPage() {
  const userId = await requireUserId()
  const jobs = await listNinaImageJobs(userId)
  const photoIds = await listNinaJobPhotoIds(
    userId,
    jobs.map((job) => job.id),
  )

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
        items={toNinaJobListItems(
          jobs.map((job) => ({ ...job, imageId: photoIds.get(job.id) ?? null })),
        )}
        nowMs={nowMs}
        emptyText="Belum ada foto yang pernah digenerate. Minta Nina kirim satu di chat."
        /* The one caller that sets it. `components/nina/NinaAboutScreen.tsx` renders the same
           component as a read-only summary and deliberately does not — see `NinaJobList`'s header
           and the plan's invariant 5. */
        actions
      />
    </AppShell>
  )
}
