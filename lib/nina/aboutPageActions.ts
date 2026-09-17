'use server'

import { cookies } from 'next/headers'

import {
  albumPhotos,
  clampNinaAboutPage,
  galleryPhotos,
  NINA_ABOUT_MEDIA_PAGE_COOKIE,
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PROFILE_PAGE_COOKIE,
  type NinaAlbumPhoto,
  type NinaGalleryPhoto,
} from './album'
import { listNinaAvatarsPage, listNinaMediaPhotos } from './queries'
import { requireUserId } from '@/lib/auth/requireUserId'

/**
 * The client-side page fetch for `/nina/about`'s two paginated grids — Next/Previous never
 * navigates (the user's own choice over a real `?page=` link); this is what a tap calls instead.
 *
 * ── ONE COOKIE PER TAB, WRITTEN HERE ─────────────────────────────────────────────────────────
 * `cookies().set` only works in a Server Function or Route Handler (`next/headers`'s own rule —
 * setting a cookie during a Server Component render is unsupported), which is what this file IS.
 * Writing it on every fetch, not only on mount, is what lets a runner leave mid-page-3 and come
 * back to page 3: `app/nina/about/page.tsx` reads the same cookie to seed the first fetch.
 * Non-sensitive — a page number, not a credential — so no `httpOnly`/`secure` is needed beyond
 * `sameSite: 'lax'`.
 *
 * ── WHY TWO FUNCTIONS AND NOT ONE WITH A `section` PARAMETER ─────────────────────────────────
 * The two tabs return different row shapes (`NinaAlbumPhoto` vs `NinaGalleryPhoto`), and a caller
 * always knows which tab it is paging — a runtime `section` argument would need a generic
 * overload or a union return type callers immediately narrow anyway. Two small, fully-typed
 * functions cost less than one that reintroduces the branch its caller already resolved.
 */

export interface NinaAboutPage<T> {
  items: T[]
  total: number
  page: number
}

export async function fetchNinaAlbumPage(page: number): Promise<NinaAboutPage<NinaAlbumPhoto>> {
  const userId = await requireUserId()
  const safePage = clampNinaAboutPage(page)

  const cookieStore = await cookies()
  cookieStore.set(NINA_ABOUT_PROFILE_PAGE_COOKIE, String(safePage), {
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })

  const { rows, total } = await listNinaAvatarsPage(userId, {
    limit: NINA_ABOUT_PAGE_SIZE,
    offset: (safePage - 1) * NINA_ABOUT_PAGE_SIZE,
  })
  return { items: albumPhotos(rows), total, page: safePage }
}

export async function fetchNinaMediaPage(page: number): Promise<NinaAboutPage<NinaGalleryPhoto>> {
  const userId = await requireUserId()
  const safePage = clampNinaAboutPage(page)

  const cookieStore = await cookies()
  cookieStore.set(NINA_ABOUT_MEDIA_PAGE_COOKIE, String(safePage), {
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })

  const { rows, total } = await listNinaMediaPhotos(userId, {
    limit: NINA_ABOUT_PAGE_SIZE,
    offset: (safePage - 1) * NINA_ABOUT_PAGE_SIZE,
  })
  return { items: galleryPhotos(rows), total, page: safePage }
}
