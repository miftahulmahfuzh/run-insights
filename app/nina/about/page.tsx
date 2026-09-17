import { cookies } from 'next/headers'

import { AppShell } from '@/components/ui/AppShell'
import { NinaAboutScreen } from '@/components/nina/NinaAboutScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import {
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  NINA_ABOUT_RETURN_PARAM,
  NINA_ABOUT_TAB_PARAM,
  aboutPhotoIdOutsideGallery,
  albumPhotos,
  clampNinaAboutPage,
  decodeAboutReturnTo,
  decodeAboutTab,
  galleryPhotos,
  ninaAvatarView,
  type NinaAlbumPhoto,
} from '@/lib/nina/album'
import {
  getCurrentNinaAvatar,
  getNinaMessageImage,
  listNinaAvatarsPage,
  listNinaMediaPhotos,
} from '@/lib/nina/queries'

/**
 * `/nina/about` — her detail page (R17), reached by tapping her avatar in the chat header.
 *
 * ── FOUR READS, ONE OF THEM A SINGLE ROW, AND A FIFTH ONLY WHEN A DEEP LINK NEEDS IT ──────────
 * `listNinaAvatarsPage` and `listNinaMediaPhotos` are each a real `?page=` window now (2026-09-17,
 * nina-about-pagination) — every photograph in the system is reachable through Previous/Next
 * (`components/nina/NinaAboutScreen.tsx`'s client-side pager), not just the newest render-capped
 * batch `listNinaAvatars`/`listNinaMessageImages` used to read in full. `getCurrentNinaAvatar` is
 * the one true single-row lookup: the hero's face and, when the current avatar is not on the
 * loaded profile page, the resolver that keeps the hero's viewer correct (see below).
 * `getNinaMessageImage`, unchanged, is the `?photo=chat.<id>` deep-link resolver — it runs ONLY
 * when `aboutPhotoIdOutsideGallery` finds the id outside the loaded media page.
 *
 * ── WHICH PAGE OF EACH TAB — THE COOKIE, NOT ALWAYS PAGE 1 ────────────────────────────────────
 * A runner who left off on Media page 3 should not land back on page 1 every time they reopen
 * this screen — "so we don't keep reloading everything from zero every time" was the ask. The two
 * fetch actions (`lib/nina/aboutPageActions.ts`) write a cookie on every page change; this render
 * reads it back to seed the FIRST fetch. A missing or garbled cookie (`clampNinaAboutPage`) reads
 * as page 1, never an error.
 *
 * ── THE HERO'S CURRENT-AVATAR RESOLVER (pagination's one correctness cost) ───────────────────
 * Before pagination, `listNinaAvatars` read the whole album, so the current avatar was always in
 * memory and the hero's tap could always find it by `findIndex`. Now the loaded page may not hold
 * it. `resolvedCurrentAvatar` is `null` when the current avatar IS on the loaded page (the common
 * case — a fresh generation is also the newest row) and otherwise the single row
 * `getCurrentNinaAvatar` already fetched, mapped through `albumPhotos([row])[0]` so it strips
 * `description` the same way every other album row does. `aboutViewerLists` appends it to the
 * album arm, exactly the way the chat side's `resolvedPhoto` has worked since R3.
 *
 * `PageProps<'/nina/about'>` is Next 16's globally available helper — not an import — and
 * `searchParams` is a PROMISE that must be awaited, same as `cookies()`.
 *
 * ── WHY THERE IS NO `loading.tsx`, HERE OR AT `app/nina/` ─────────────────────────────────────
 * D-4. One at `app/nina/` would wrap this route too, which is the specific thing phase 4 declined
 * to impose on a page it did not own; and this page's index lookups resolve inside one paint, so a
 * skeleton would flash and be replaced. `app/(app)/loading.tsx`'s docstring records the measured
 * cost of getting that wrong in the other direction.
 */

export default async function NinaAboutPage({ searchParams }: PageProps<'/nina/about'>) {
  const userId = await requireUserId()
  const {
    [NINA_ABOUT_PHOTO_PARAM]: photoParam,
    [NINA_ABOUT_RETURN_PARAM]: returnParam,
    [NINA_ABOUT_TAB_PARAM]: tabParam,
  } = await searchParams
  const cookieStore = await cookies()
  const profilePage = clampNinaAboutPage(cookieStore.get(NINA_ABOUT_PROFILE_PAGE_COOKIE)?.value)
  const mediaPage = clampNinaAboutPage(cookieStore.get(NINA_ABOUT_MEDIA_PAGE_COOKIE)?.value)

  const [avatarPage, mediaPageResult, currentRow] = await Promise.all([
    listNinaAvatarsPage(userId, {
      limit: NINA_ABOUT_PAGE_SIZE,
      offset: (profilePage - 1) * NINA_ABOUT_PAGE_SIZE,
    }),
    listNinaMediaPhotos(userId, {
      limit: NINA_ABOUT_PAGE_SIZE,
      offset: (mediaPage - 1) * NINA_ABOUT_PAGE_SIZE,
    }),
    getCurrentNinaAvatar(userId),
  ])

  const album = albumPhotos(avatarPage.rows)
  const gallery = galleryPhotos(mediaPageResult.rows)

  const resolvedCurrentAvatar: NinaAlbumPhoto | null =
    currentRow == null || avatarPage.rows.some((row) => row.id === currentRow.id)
      ? null
      : (albumPhotos([currentRow])[0] ?? null)

  /*
   * ── THE MEMBERSHIP CHECK RUNS OVER ROWS ALREADY READ, BEFORE THE SINGLE-ROW READ ────────────
   * `aboutPhotoIdOutsideGallery` is pure: parse, section, shape, membership — no query. Only a
   * MISS reaches `getNinaMessageImage`, so the common page view costs zero extra round trips,
   * and a hand-typed id that cannot be one of ours (`isValidId`) costs not even that. `gallery`
   * is the LOADED media page, so the check and the Media grid can never disagree about what "in
   * the window" means — a smaller window than before pagination, so this single-row fallback now
   * fires more often, which is exactly what it exists for.
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

  return (
    <AppShell>
      {/*
        The deep link's own answer. `null` unless `?photo=` named a `chat.<id>` the gallery window
        missed AND the row still exists — the mapping that stripped `description` happened above,
        so this prop is safe to hand down by construction, not by review.
      */}
      <NinaAboutScreen
        avatar={ninaAvatarView(currentRow)}
        initialTab={decodeAboutTab(tabParam)}
        album={album}
        albumTotal={avatarPage.total}
        albumPage={profilePage}
        gallery={gallery}
        galleryTotal={mediaPageResult.total}
        galleryPage={mediaPage}
        resolvedPhoto={resolvedPhoto}
        resolvedCurrentAvatar={resolvedCurrentAvatar}
        returnTo={returnTo}
      />
    </AppShell>
  )
}
