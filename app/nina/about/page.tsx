import { AppShell } from '@/components/ui/AppShell'
import { NinaAboutScreen } from '@/components/nina/NinaAboutScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import { albumPhotos, galleryPhotos, NINA_GALLERY_LIMIT, ninaAvatarView } from '@/lib/nina/album'
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'
import { listNinaAvatars, listNinaMessageImages } from '@/lib/nina/queries'

/**
 * `/nina/about` — her detail page (R17), reached by tapping her avatar in the chat header.
 *
 * ── THREE INDEXED READS AND NOTHING ELSE ──────────────────────────────────────────────────────
 * It was two until R3 put the image-generation tracking section below Media, and the claim it
 * replaces is the one worth keeping intact: every read here is an index lookup, none of them
 * joins, and none of them writes.
 *
 * `listNinaAvatars` reads `nina_avatars_user_created_idx`; `listNinaMessageImages` reads
 * `nina_message_images_user_created_idx` with no join, which is phase 1's stated reason for that
 * table existing rather than a `jsonb` column; `listNinaImageJobs` reads `nina_turns` scoped to
 * `(user_id, kind = 'image')` and bounded by `ABOUT_JOB_LIMIT`. No model call, so invariant 4 is
 * satisfied structurally: there is nothing here for the payload-boundary grep to object to.
 *
 * **The job read is deliberately the non-sweeping one.** `listOpenNinaImageJobs` sweeps stale jobs
 * before it answers, and `app/nina/page.tsx` awaits it for exactly that side effect — but a page
 * reached by tapping her face is not a place to write terminal UPDATEs and an apology message. The
 * sweep already runs on every `/nina` render and on the backstop schedule; this page only looks.
 *
 * ── WHY THERE IS NO `loading.tsx`, HERE OR AT `app/nina/` ─────────────────────────────────────
 * D-4. One at `app/nina/` would wrap this route too, which is the specific thing phase 4 declined
 * to impose on a page it did not own; and this page's index lookups resolve inside one paint, so a
 * skeleton would flash and be replaced. `app/(app)/loading.tsx`'s docstring records the measured
 * cost of getting that wrong in the other direction.
 *
 * ── THE CURRENT PHOTO IS TAKEN FROM THE ALBUM, NOT RE-QUERIED ─────────────────────────────────
 * `listNinaAvatars` already returns the row with `is_current`, so calling `getCurrentNinaAvatar`
 * here as well would be a second round trip for a row we are holding. `ninaAvatarView(null)` is
 * what an empty album means (D-2) and it is the same function the chat header uses, so the two
 * surfaces cannot disagree about which face is hers.
 */

/**
 * How many image jobs the tracking section shows before deferring to `/nina/jobs`.
 *
 * **A summary, not the list.** `/nina/jobs` is the full history with its stages, elapsed times and
 * errors; this is the head of it on a page whose subject is her album. Five is one screen-third
 * under a three-column grid, and at `NINA_IMAGE_DAILY_CAP`'s six a day it is today and a little of
 * yesterday — the window a runner who just asked for a photo is actually looking at.
 *
 * Module-local on purpose. `NINA_GALLERY_LIMIT` lives in `lib/nina/album.ts` because it is tied by
 * its own docstring to `CHAT_HISTORY_LIMIT`, so that the gallery and the chat describe the same
 * conversation. This number has no second reader and no such coupling: it is one route's render
 * budget, and a constant with one caller belongs beside that caller.
 */
const ABOUT_JOB_LIMIT = 5

export default async function NinaAboutPage() {
  const userId = await requireUserId()

  const [avatars, images, jobs] = await Promise.all([
    listNinaAvatars(userId),
    listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }),
    listNinaImageJobs(userId, { limit: ABOUT_JOB_LIMIT }),
  ])

  const current = avatars.find((row) => row.isCurrent) ?? null

  /*
   * ── `react-hooks/purity` IS A FALSE POSITIVE ON AN ASYNC SERVER COMPONENT ────────────────────
   * Identical to `app/nina/jobs/page.tsx:41-56`, which phase 4 argued in full: the rule guards
   * render IDEMPOTENCY, and this function is an async Server Component that runs once per request
   * and is never re-rendered, so there is no second render for the value to differ between.
   * Hoisting is also what makes one reading of the clock shared by every ticking row — the reason
   * the prop exists at all. The plan's draft wrote `jobsNowMs={Date.now()}` inline; the rule flags
   * a JSX prop where it lets `ninaFlightView(rows, Date.now())` past on `app/nina/page.tsx`, so
   * this is phase 4's shape rather than a new one.
   */
  // eslint-disable-next-line react-hooks/purity -- server render, once per request; see above.
  const jobsNowMs = Date.now()

  return (
    <AppShell>
      {/*
        **The mapping happens HERE, on the server, and it is not plumbing.**
        `NinaImageJobRecord.createdAt` is a `Date`; `NinaJobListItem.createdAtMs` is a number.
        `NinaAboutScreen` is a Client Component and never sees a `Date`, so `toNinaJobListItems` is
        what makes the rows crossable — and calling phase 4's mapper rather than writing a second
        one is what keeps this section and `/nina/jobs` from ever naming the same stage two ways.

        `jobsNowMs` is ONE reading of the clock for this render, shared by every ticking row, so two
        rows a millisecond apart cannot show two different elapsed times for jobs opened in the same
        second. It is the SERVER's clock on purpose: phase 4's `NinaJobElapsed` uses it for its
        first render on both sides of the boundary, and reading `Date.now()` in the browser instead
        is a hydration mismatch on a component whose whole content is a number. The same move
        `app/nina/page.tsx` makes with `todayInJakarta()`.
      */}
      <NinaAboutScreen
        avatar={ninaAvatarView(current)}
        album={albumPhotos(avatars)}
        gallery={galleryPhotos(images)}
        jobs={toNinaJobListItems(jobs)}
        jobsNowMs={jobsNowMs}
      />
    </AppShell>
  )
}
