import { redirect } from 'next/navigation'

import { PhotoDeepLinkScreen } from '@/components/photo/PhotoDeepLinkScreen'
import type { ViewerPhoto } from '@/components/ui/PhotoViewer'
import { resolveAdminLinkOrigin } from '@/lib/admin/adminLinkOrigin'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getRunPhoto } from '@/lib/db/queries'
import { NINA_ABOUT_HREF, albumPhotos, galleryPhotos } from '@/lib/nina/album'
import { getNinaAvatar, getNinaMessageImage } from '@/lib/nina/queries'
import { parsePhotoViewerSegments, type PhotoPointerKind } from '@/lib/photos/pointer'

/**
 * `/photo/[kind]/[id]` — R2. One photograph, full screen, from a cold load.
 *
 * ── WHAT THIS ROUTE IS FOR ────────────────────────────────────────────────────────────────────
 * It is the click target of the `duplicate_image` push: the runner is told the image he just
 * uploaded is already in his collection, and tapping the notification must show him THE ONE HE
 * ALREADY HAS. The service worker's `notificationclick` handler is already generic — it focuses the
 * matching window and `postMessage`s any same-origin path off the payload's `url`
 * (`lib/service-worker.js`), which `components/push/PushTapNavigator.tsx` turns into a
 * `router.push` — so nothing there changes; this page is the other end of that navigation and the
 * reason the payload's `url` may finally be something other than `/nina`.
 *
 * ── WHY IT IS A NEW ROUTE AND NOT ONE OF THE TWO EXISTING `photo` DEEP LINKS ──────────────────
 * `/nina?photo=<kind>:<id>` arms the composer, not a viewer. `/nina/about?photo=<section>.<id>`
 * does open `PhotoViewer`, but over a LIST — the album grid or the 200-newest Media window — and
 * neither grammar has an arm for `run_photos`, which is where a runner's screenshots live and where
 * two of the five upload routes write. `lib/photos/pointer.ts`'s header carries the full argument.
 *
 * ── ONE READ, AND IT IS THE OWNERSHIP CHECK ───────────────────────────────────────────────────
 * Each arm is a single-row lookup scoped to the signed-in user — `getRunPhoto` through
 * `runPhotoOwnedBy`'s correlated EXISTS, `getNinaAvatar`/`getNinaMessageImage` through their
 * `user_id` predicate. There is no separate authorization step because there is nothing to
 * authorize separately: a row that is not his does not come back. A miss of ANY kind — malformed
 * segment, foreign id, deleted id — is one answer, `/`, so the page cannot be used to learn which
 * ids exist.
 *
 * ── NO `AppShell` ─────────────────────────────────────────────────────────────────────────────
 * `PhotoViewer` is `fixed inset-0 z-60` and covers the tab bar completely. Rendering the shell
 * beneath it would ship a nav the runner can never see and reserve safe-area padding nothing
 * occupies. `app/x/[extractionId]/page.tsx` sets the precedent that a route may own its own chrome.
 *
 * ── NO `maxDuration` ──────────────────────────────────────────────────────────────────────────
 * Unlike `/nina`, `/r/[id]` and `/x/[extractionId]`, this page hosts no Server Action and calls no
 * model. One indexed read and a render; the platform default is more than it needs.
 */

/** Where every miss lands: the runs list, which is also the signed-out sign-in screen (R-24). */
const DEEP_LINK_MISS_HREF = '/'

/** What the client half needs, all of it resolved server-side off a row proved to be his. */
interface ResolvedDeepLinkPhoto {
  photo: ViewerPhoto
  subject: string
  closeHref: string
}

export default async function PhotoDeepLinkPage({ params }: PageProps<'/photo/[kind]/[id]'>) {
  const userId = await requireUserId()
  const { kind, id } = await params

  /*
   * Parsed BEFORE the read, because which table to read is what the grammar decides — the same
   * ordering `app/nina/page.tsx:157-160` states for its own parameter. Pure, so a hand-typed
   * `/photo/run/xyz` costs this page not one round trip.
   */
  const pointer = parsePhotoViewerSegments(kind, id)
  if (pointer === null) redirect(DEEP_LINK_MISS_HREF)

  const resolved = await resolveDeepLinkPhoto(userId, pointer.kind, pointer.id)
  if (resolved === null) redirect(DEEP_LINK_MISS_HREF)

  /*
   * R4. AFTER the miss, so a stale notification costs nothing extra, and never before the read it
   * has no bearing on. `resolveAdminLinkOrigin` answers `null` both for a non-admin and where
   * `ADMIN_EMAILS` is unconfigured — which is every preview deployment and every plain local run,
   * and is why this is not a bare `getAdminIdentity()` (plan invariant 7). A `null` reaches the
   * screen as "no control at all"; see `lib/admin/adminLinkOrigin.ts`.
   */
  const adminLinkOrigin = await resolveAdminLinkOrigin()

  return (
    <PhotoDeepLinkScreen
      photo={resolved.photo}
      subject={resolved.subject}
      closeHref={resolved.closeHref}
      adminLinkOrigin={adminLinkOrigin}
    />
  )
}

/**
 * The pointer, against the three tables — one arm, one single-row read, or `null`.
 *
 * ── WHY THE TWO NINA ARMS GO THROUGH `albumPhotos` / `galleryPhotos` ─────────────────────────
 * Not for convenience: those two mappers are what STRIP `description`. Both point reads project
 * every column (`avatarColumns`, `imageColumns`), so both rows carry `glm-4.6v`'s private prose,
 * and invariant 5 says nothing in `components/` may read it. `app/nina/about/page.tsx:85-89`
 * records the same reasoning for the same reason — "that mapping is what strips `description`
 * (invariant 5) — the read's projection carries it, and it must not cross into client props in any
 * shape". Going through them also means the viewer's title is spelled in ONE place per table
 * (`NINA_ALBUM_LABEL`, `NINA_SIDE_LABEL`), so this route and `/nina/about` cannot disagree about
 * what a photograph is called.
 *
 * The `shot` arm needs no mapper: `RunPhotoPoint` carries four columns, none of them private, and
 * `PhotoViewer`'s own `SCREEN_KIND_LABEL[kind] ?? kind` fallback names it exactly as
 * `ScreenshotStrip` does — including the `'other'` kind, which has no label and renders as the bare
 * word, which is the behaviour the review surfaces already ship.
 *
 * ── THE CLOSE DESTINATION IS THE PHOTOGRAPH'S OWN HOME ───────────────────────────────────────
 * A run photo closes onto its run (`/r/<runId>`) when the review commit has backfilled one, and
 * onto the runs list when it has not — an uncommitted screenshot's only other home is
 * `/x/<extractionId>`, which is a review screen this page has no business dropping someone into.
 * Both Nina arms close onto `/nina/about`, where her album and the Media gallery live.
 *
 * ── THE ADMIN POINTER IS THE ROUTE'S OWN TWO SEGMENTS ────────────────────────────────────────
 * 2026-10-01, R1/R3. `/admin/nina` holds exactly two collections — `nina_avatars` (the album arm)
 * and `nina_message_images` (`?view=media`) — so the two Nina arms below carry an admin handle and
 * the `shot` arm carries none: `run_photos` has no tile under `/admin/nina` in either collection,
 * and a link to a row no screen can select is worse than no link. Setting it HERE rather than in
 * the client screen keeps the "which tables are admin-visible" judgement on the server, beside the
 * reads that already encode which table each arm touches.
 */
async function resolveDeepLinkPhoto(
  userId: string,
  kind: PhotoPointerKind,
  id: string,
): Promise<ResolvedDeepLinkPhoto | null> {
  if (kind === 'shot') {
    const row = await getRunPhoto(userId, id)
    if (row === null) return null
    return {
      /* No admin handle: `run_photos` is in neither of `/admin/nina`'s collections. */
      photo: { url: row.blobUrl, kind: row.kind },
      subject: 'screenshot',
      closeHref: row.runId === null ? DEEP_LINK_MISS_HREF : `/r/${row.runId}`,
    }
  }

  if (kind === 'avatar') {
    const row = await getNinaAvatar(userId, id)
    if (row === null) return null
    const mapped = albumPhotos([row])[0] ?? null
    if (mapped === null) return null
    return {
      photo: {
        url: mapped.url,
        kind: mapped.kind,
        label: mapped.label,
        rowPointer: { kind: 'avatar', id: mapped.id },
      },
      subject: 'foto',
      closeHref: NINA_ABOUT_HREF,
    }
  }

  const row = await getNinaMessageImage(userId, id)
  if (row === null) return null
  const mapped = galleryPhotos([row])[0] ?? null
  if (mapped === null) return null
  return {
    photo: {
      url: mapped.url,
      kind: mapped.kind,
      label: mapped.label,
      rowPointer: { kind: 'image', id: mapped.id },
    },
    subject: 'foto',
    closeHref: NINA_ABOUT_HREF,
  }
}
