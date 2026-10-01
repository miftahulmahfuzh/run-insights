'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { CopyAdminLinkButton } from '@/components/ui/CopyAdminLinkButton'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'

/**
 * `/photo/[kind]/[id]` — R2's whole client surface. One photograph, full screen, and a way out.
 *
 * ── WHY THIS IS A NEW CALLER AND NOT `usePhotoViewer` ─────────────────────────────────────────
 * `components/nina/usePhotoViewer.ts` opens by `{messageId, index}` derived from the in-memory
 * chat `messages` array, and derives rather than snapshots precisely because that array changes
 * under an open overlay. On a cold load from a notification tap there IS no array — the page has
 * one row, read by id. The hook's whole design is the reason it cannot serve this route, and it is
 * left untouched.
 *
 * ── THE PROPS ARE ALL SERVER-RESOLVED STRINGS ────────────────────────────────────────────────
 * `photo` is already a `ViewerPhoto` — url, kind, label — mapped on the server off a row it proved
 * is his. Nothing here fetches, and `description` (`glm-4.6v`'s private text, invariant 5) was
 * stripped before the prop was built; see the page.
 *
 * ── `onIndex` IS A NO-OP, DELIBERATELY ───────────────────────────────────────────────────────
 * With `photos.length === 1`, `PhotoViewer`'s `stepIndex(0, ±1, 1)` is 0 and the dot row does not
 * render, so the arrow keys have nowhere to page to. Accepting the call and doing nothing is the
 * honest spelling; a `useState` here would be an index that can only ever hold one value.
 */
export function PhotoDeepLinkScreen({
  photo,
  subject,
  closeHref,
  adminLinkOrigin,
}: {
  photo: ViewerPhoto
  /** The noun in the dialog's accessible name — `'foto'` for Nina's two tables, `'screenshot'`
   * for a run photo, matching `NinaAboutScreen` and `ScreenshotStrip` respectively. */
  subject: string
  /**
   * Where closing lands — the page the photograph actually lives on, decided by the server.
   *
   * ── WHY NOT `router.back()` ──────────────────────────────────────────────────────────────
   * `lib/nina/album.ts:380-388` already records the finding this route inherits: a deep link can
   * be opened with no in-app history beneath it. A notification tap reaches this page through
   * `clients.openWindow(target)` when the app is closed (`lib/service-worker.js:167`), and
   * `back()` from there navigates off the app entirely. `NinaAboutScreen` answers that by
   * carrying the origin IN the link; this route cannot, because the link is minted by a push
   * payload written minutes or days earlier, which knows no origin. So the destination is
   * derived from the PHOTO instead, which is a fact the server holds.
   *
   * `replace` and not `push`: the viewer page is spent once it is closed, and pushing would leave
   * a back-swipe that re-opens it on top of the page the runner just asked to be taken to.
   */
  closeHref: string
  /**
   * **R4. The origin an admin may mint a `/admin/nina` link from, or `null` for everyone else.**
   *
   * Resolved on the server by `resolveAdminLinkOrigin()` and threaded as ONE nullable value, the
   * same shape `ChatScreen` and `NinaAboutScreen` take. `null` renders no control at all, so a
   * non-admin's payload carries nothing to hide.
   *
   * **Which photograph it points at is NOT decided here.** `photo.rowPointer` is set by the page
   * on the `avatar` and `image` arms and deliberately left absent on the `shot` arm — `run_photos`
   * has no collection under `/admin/nina`, so there is no destination to link to, and the overlay
   * draws nothing. That keeps this screen free of any opinion about which tables are admin-visible.
   *
   * **Never `window.location.origin`** (repo invariant 9): the link is pasted into WhatsApp and
   * opened on a desktop later.
   */
  adminLinkOrigin: string | null
}) {
  const router = useRouter()

  /*
   * `useCallback` because `PhotoViewer`'s Escape/keydown effect lists `onClose` in its deps
   * (`PhotoViewer.tsx:139`): a fresh closure every render would tear down and re-add the document
   * listener on each one. Nothing re-renders this component today; the hook costs a line and
   * removes the question.
   */
  const close = React.useCallback(() => {
    router.replace(closeHref)
  }, [closeHref, router])

  return (
    <PhotoViewer
      photos={[photo]}
      index={0}
      onIndex={() => undefined}
      onClose={close}
      subject={subject}
      /*
       * 2026-10-01, R1/R3/R4. The fourth and last client entry point onto a full-view Nina
       * photograph. Both halves must be present: a `null` origin is every non-admin, and an absent
       * `rowPointer` is the `shot` arm, which has no admin destination. Either way the header is
       * the one this route has always drawn — `headerAction`'s own "absent renders nothing"
       * promise, kept by construction rather than by a second code path.
       *
       * No `onClick` that closes: this control performs no navigation, and closing would replace
       * the page out from under the tick that confirms the copy.
       */
      headerAction={(viewed) =>
        adminLinkOrigin === null || viewed.rowPointer == null ? null : (
          <CopyAdminLinkButton pointer={viewed.rowPointer} origin={adminLinkOrigin} />
        )
      }
    />
  )
}
