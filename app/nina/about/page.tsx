import { AppShell } from '@/components/ui/AppShell'
import { NinaAboutScreen } from '@/components/nina/NinaAboutScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import {
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ABOUT_RETURN_PARAM,
  NINA_GALLERY_LIMIT,
  aboutPhotoIdOutsideGallery,
  albumPhotos,
  decodeAboutReturnTo,
  galleryPhotos,
  ninaAvatarView,
} from '@/lib/nina/album'
import { listNinaImageJobs } from '@/lib/nina/imagejobs'
import { toNinaJobListItems } from '@/lib/nina/jobview'
import { getNinaMessageImage, listNinaAvatars, listNinaMessageImages } from '@/lib/nina/queries'

/**
 * `/nina/about` — her detail page (R17), reached by tapping her avatar in the chat header.
 *
 * ── THREE INDEXED READS — AND A FOURTH, ONLY WHEN A DEEP LINK NEEDS IT ────────────────────────
 * It was two until R3 put the image-generation tracking section below Media, and the claim it
 * replaces is the one worth keeping intact: every read here is an index lookup, none of them
 * joins, and none of them writes. The fourth read, `getNinaMessageImage`, is a single-row lookup
 * scoped to `(user_id, id)` — and it runs ONLY when `?photo=chat.<id>` names an id the gallery
 * window (the newest `NINA_GALLERY_LIMIT`) does not hold, decided by `aboutPhotoIdOutsideGallery`
 * over rows already in hand. The common case — no parameter, or a parameter the gallery holds —
 * costs exactly the three reads it always cost.
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
 * ── THE DEEP LINK IS RESOLVED ON THE SERVER, AND `description` STAYS HERE ─────────────────────
 * `?photo=chat.<id>` used to open only when the id sat inside the gallery list, so a photograph
 * older than the newest 200 resolved to a closed viewer — the one silent miss R3 cannot afford.
 * The miss now falls through to `getNinaMessageImage` (`lib/nina/queries.ts`), whose own docstring
 * names it the `?photo=` deep-link read and which never filters `isOriginalPhoto()`: an album face
 * re-attached into the conversation re-opens here too, which is correct — the viewer re-shows
 * bytes that exist, and the render reads must not hide what a bubble can show (the four-reads rule
 * in `queries.ts`).
 *
 * The resolved row is mapped through `galleryPhotos([row])[0]` before it crosses into client
 * props, and that mapping is the invariant, not a nicety: the read projects `imageColumns`, so
 * the row carries `description` — `glm-4.6v`'s private prose (invariant 5) — and `galleryPhotos`
 * is the step that strips it. A deleted or foreign id resolves to `null`, and the screen treats
 * `null` exactly as it treated the old `index < 0`: a closed viewer, never an error.
 *
 * `PageProps<'/nina/about'>` is Next 16's globally available helper — not an import — and
 * `searchParams` is a PROMISE that must be awaited: the shape `app/nina/jobs/[id]/page.tsx`
 * documents for `params` and `app/nina/page.tsx` destructures for its own parameters.
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
 * under a three-column grid — the head of a single day's output at the daily cap
 * (`ninaImageDailyCap()`, env-tunable), which is the window a runner who just asked for a photo is
 * actually looking at.
 *
 * Module-local on purpose. `NINA_GALLERY_LIMIT` lives in `lib/nina/album.ts` because it is tied by
 * its own docstring to `CHAT_HISTORY_LIMIT`, so that the gallery and the chat describe the same
 * conversation. This number has no second reader and no such coupling: it is one route's render
 * budget, and a constant with one caller belongs beside that caller.
 */
const ABOUT_JOB_LIMIT = 5

export default async function NinaAboutPage({ searchParams }: PageProps<'/nina/about'>) {
  const userId = await requireUserId()
  const { [NINA_ABOUT_PHOTO_PARAM]: photoParam, [NINA_ABOUT_RETURN_PARAM]: returnParam } =
    await searchParams

  const [avatars, images, jobs] = await Promise.all([
    listNinaAvatars(userId),
    listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }),
    listNinaImageJobs(userId, { limit: ABOUT_JOB_LIMIT }),
  ])

  const current = avatars.find((row) => row.isCurrent) ?? null
  const gallery = galleryPhotos(images)

  /*
   * ── THE MEMBERSHIP CHECK RUNS OVER ROWS ALREADY READ, BEFORE THE SINGLE-ROW READ ────────────
   * `aboutPhotoIdOutsideGallery` is pure: parse, section, shape, membership — no query. Only a
   * MISS reaches `getNinaMessageImage`, so the common page view costs zero extra round trips,
   * and a hand-typed id that cannot be one of ours (`isValidId`) costs not even that. `gallery`
   * is the exact list this render is about to show, so the check and the Media grid can never
   * disagree about what "in the window" means.
   *
   * A row that resolves is mapped through `galleryPhotos([row])[0]` HERE, on the server, because
   * that mapping is what strips `description` (invariant 5) — the read's projection carries it,
   * and it must not cross into client props in any shape. `[0] ?? null`: `galleryPhotos` maps a
   * one-row array to a one-row array, but `noUncheckedIndexedAccess` is the repo's setting, and
   * the `?? null` is the same "absent, not broken" answer a miss gets.
   */
  const deepLinkId = aboutPhotoIdOutsideGallery(photoParam, gallery)
  const resolvedRow = deepLinkId === null ? null : await getNinaMessageImage(userId, deepLinkId)
  const resolvedPhoto = resolvedRow == null ? null : (galleryPhotos([resolvedRow])[0] ?? null)

  /*
   * The deep link's RETURN leg, decoded where every other URL fact on this page is decoded. The
   * value is sanitized by `decodeAboutReturnTo` itself — an off-app or malformed target degrades
   * to `null`, which the screen reads as "close in place", the behaviour the link had before the
   * leg existed. So a hand-edited `?return=` can never steer the close anywhere but inside the
   * app, and the prop needs no guard of its own.
   */
  const returnTo = decodeAboutReturnTo(returnParam)

  /*
   * ── THE DIRECTIVE THAT USED TO SIT ON THIS BINDING ──────────────────────────────────────────
   * From `3912cec` until 2026-09-12 this read carried `eslint-disable-next-line
   * react-hooks/purity`, on the argument `app/nina/jobs/page.tsx` makes for its identical
   * binding: the rule guards render IDEMPOTENCY, and an async Server Component runs once per
   * request and is never re-rendered, so there is no second render for the value to differ
   * between. The directive is gone because eslint reports it UNUSED here — nothing to
   * suppress, under the same plugin version (7.1.1) it was written under — while jobs' own
   * suppression still holds a live flag. Why the same shape flags there and not here is
   * undiagnosed (this function's analysis is the suspect, not an exemption) and left so: the
   * operative check is one lint run, not a mechanism story. If the flag ever fires here, that
   * file's comment block is the argument for restoring the directive.
   */
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

      {/*
        The deep link's own answer. `null` unless `?photo=` named a `chat.<id>` the gallery window
        missed AND the row still exists — the mapping that stripped `description` happened above,
        so this prop is safe to hand down by construction, not by review.
      */}
      <NinaAboutScreen
        avatar={ninaAvatarView(current)}
        album={albumPhotos(avatars)}
        gallery={gallery}
        jobs={toNinaJobListItems(jobs)}
        jobsNowMs={jobsNowMs}
        resolvedPhoto={resolvedPhoto}
        returnTo={returnTo}
      />
    </AppShell>
  )
}
