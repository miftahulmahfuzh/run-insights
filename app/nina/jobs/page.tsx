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
 * ── `maxDuration = 300`, AND IT USED TO SAY THE OPPOSITE ──────────────────────────────────────
 * This block used to argue that the export would be cargo, on the true premise that the route
 * "calls no action and awaits no model". **R1 made that premise false.** `NinaJobActions` calls
 * `redoNinaImageJob`, which registers a generation in `after()`; a Server Action's timeout is the
 * page SEGMENT's — Next 16.3.1's `maxDuration` reference: *"If using Server Actions, set the
 * `maxDuration` at the page level to change the default timeout of all Server Actions used on the
 * page"* — and `after()` inherits the same budget: *"`after` will run for the platform's default
 * or configured max duration of your route"*.
 *
 * `lib/nina/imagerun.ts`'s header predicted this exact edit: `app/nina/page.tsx` and
 * `app/api/cron/nina/route.ts` are the two segments that can start a generation, and *"a third
 * caller would need the same line"*. This is the third caller. Without it the platform default
 * kills the invocation partway through a 78 s generation and the runner gets a job that is
 * `pending` forever until a sweep apologises for it — which is the failure this whole feature
 * exists to let him recover from.
 *
 * See `app/nina/page.tsx`'s own `maxDuration` block for why the number is 300 and not 60, and for
 * why it is a LITERAL: segment config exports are statically analysed at build time and an
 * imported constant is not a value the analyser can see.
 *
 * ── `nowMs` IS READ ONCE, HERE ────────────────────────────────────────────────────────────────
 * One reading of the clock for this render, shared by every ticking row, so two rows a millisecond
 * apart cannot show two different elapsed times for jobs opened in the same second.
 * `app/nina/page.tsx` hoists `todayInJakarta()` out of `<ChatScreen>` for exactly this reason.
 */
export const maxDuration = 300

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
        /* The one caller that sets it. `components/nina/NinaAboutScreen.tsx` renders the same
           component as a read-only summary and deliberately does not — see `NinaJobList`'s header
           and the plan's invariant 5. */
        actions
      />
    </AppShell>
  )
}
