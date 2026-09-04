import type { NinaCropInput } from './crop'

/**
 * Her album and the conversation's photographs, as the screens need them — F33 R17/R19/R26.
 *
 * ── WHY THIS FILE IS PURE AND IMPORT-FREE ─────────────────────────────────────────────────────
 * Invariant 6: vitest runs `environment: 'node'` with no jsdom, so UI behaviour worth testing has
 * to be a pure function in `lib/`. Everything below is read by a client grid, a Server Component
 * and a unit suite, which is exactly the `lib/photos/gallery.ts` and `lib/nina/images.ts` shape.
 * The single import is a TYPE, so it erases.
 *
 * ── THE ALBUM IS DELIBERATELY A SET OF DIFFERENT FACES ────────────────────────────────────────
 * RU-18 dropped the face anchor: *"i only want successful image generation"*. So her generated
 * photos do not look like each other, and nothing here tries to hide that — no grouping by
 * likeness, no "current face" section, no ordering that buries the odd one out. Newest first, that
 * is all. She also never remarks on it; see `CONTEXT_GUIDE` in Step 9.
 */

/**
 * The committed seed, spelled ONCE.
 *
 * Phase 4 defined `NINA_AVATAR_SRC` in `components/nina/NinaAvatar.tsx` and phase 15 defined
 * `NINA_AVATAR_FALLBACK_SRC` in `components/admin/CircleFrame.tsx`, each because importing across
 * the other's boundary looked worse than a second string. Phase 15 filed the collapse as its
 * handoff 3 and this is it: the constant lives in `lib/`, both components import it, and a third
 * copy has nowhere to appear from.
 *
 * It is a `public/` path and not a Blob URL, which is the whole of why `getCurrentNinaAvatar()`
 * returning null does not need a database row to mean something — see `ninaAvatarView`.
 */
export const NINA_AVATAR_FALLBACK_SRC = '/nina/avatar-001.png'

/**
 * How many conversation photographs the gallery renders.
 *
 * Matched to phase 4's `CHAT_HISTORY_LIMIT` of 200 for one reason: the gallery is a view of the
 * conversation, and a photo visible in the gallery whose message has scrolled out of the chat is a
 * dead end for the runner. Equal limits keep the two surfaces describing the same conversation.
 */
export const NINA_GALLERY_LIMIT = 200

/**
 * How many album photos render at once. Six generations a day (phase 12's cap) is ten days of
 * flat-out use, and `listNinaAvatars` is unpaginated by design, so this is a render cap and not a
 * query cap: the rows are already in hand.
 */
export const NINA_ALBUM_MAX = 60

/**
 * How long a question typed into the album's zoomed-photo box may be — R26.
 *
 * It lives HERE and not in `albumActions.ts` because that file carries `'use server'`, and a
 * `'use server'` module may export **only async functions**: a runtime `const` there is rejected
 * by the Server Actions compiler, not merely frowned upon. Types are fine (they erase), which is
 * why `lib/nina/actions.ts` can declare interfaces beside its action and this cannot declare a
 * number beside its own.
 *
 * 600 is generous for one line and far short of `MAX_RUNNER_MESSAGE_CHARS` (4000), which is the
 * point of clamping at all: without it a paste of an entire article reaches the model labelled "a
 * question about this photo".
 */
export const NINA_ATTACH_MAX_CHARS = 600

/** Whose photograph it is. `kind` is phase 6's his/hers discriminator; this names it. */
export type NinaPhotoSide = 'his' | 'hers'

/**
 * Deliberately shown in the viewer's title, so it is a phrase and not a word:
 * `SCREEN_KIND_LABEL[kind] ?? kind` used to render the literal string "generated".
 */
export const NINA_SIDE_LABEL: Readonly<Record<NinaPhotoSide, string>> = {
  his: 'Foto kamu',
  hers: 'Foto Nina',
}

/** The album's own label. Not a `NinaPhotoSide`: an avatar is not a chat photograph. */
export const NINA_ALBUM_LABEL = 'Foto profil Nina'

/**
 * `'generated'` is phase 12's kind and `'upload'` is phase 6's. Anything else — a kind added
 * later, or a string from a row written by hand — reads as his, because the app's uploads are his
 * and defaulting an unknown kind to "hers" would put a stranger's photo under her name.
 */
export function photoSideOf(kind: string): NinaPhotoSide {
  return kind === 'generated' ? 'hers' : 'his'
}

/** A `nina_avatars` row, structurally. `NinaAvatarRow` assigns to this. */
export interface AvatarLike {
  id: string
  blobUrl: string
  width: number | null
  height: number | null
  description: string | null
  cropScale: number | null
  cropX: number | null
  cropY: number | null
  isCurrent: boolean
  createdAt: Date
  source: string
}

/** A `nina_message_images` row, structurally. `NinaImageRow` assigns to this. */
export interface ImageLike {
  id: string
  messageId: string
  kind: string
  blobUrl: string
  createdAt: Date
}

/** What the header avatar and the detail page's hero need, and nothing more. */
export interface NinaAvatarView {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
  /** What the photograph shows (R25), or null. Rendered nowhere; read by the context builder. */
  description: string | null
  /** True when this is the committed constant rather than an album row. */
  isFallback: boolean
}

/** One album photo, ready for both the grid and `ViewerPhoto`. */
export interface NinaAlbumPhoto {
  id: string
  url: string
  kind: 'avatar'
  label: string
  isCurrent: boolean
  description: string | null
}

/** One conversation photo, ready for both the grid and `ViewerPhoto`. */
export interface NinaGalleryPhoto {
  id: string
  messageId: string
  url: string
  kind: string
  side: NinaPhotoSide
  label: string
}

/**
 * **D-2, and the only implementation of it.** `getCurrentNinaAvatar()` returning null means "use
 * the committed constant" — there is no seed row, so there is no row whose `blob_url` is a
 * repo-relative path, and `blob-reap`, phase 15's delete button and phase 14's re-anchor all see
 * an album containing only real blobs.
 *
 * The fallback carries `crop: null`, which `resolveCrop` folds to the identity, which
 * `ninaCropStyle` renders as plain centred `object-cover` — so the constant looks exactly as it
 * did in phase 4, and `NinaAvatar` can keep its `next/image` branch for it (Step 10).
 */
export function ninaAvatarView(row: AvatarLike | null | undefined): NinaAvatarView {
  if (row == null) {
    return {
      src: NINA_AVATAR_FALLBACK_SRC,
      natural: { width: null, height: null },
      crop: null,
      description: null,
      isFallback: true,
    }
  }
  return {
    src: row.blobUrl,
    natural: { width: row.width, height: row.height },
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    description: row.description,
    isFallback: false,
  }
}

/**
 * The album, newest first, capped. `listNinaAvatars` already orders
 * `(created_at desc, id desc)`, so this preserves rather than imposes an order — re-sorting here
 * would put a second opinion about "newest" next to the index that answers it.
 *
 * An EMPTY album returns one synthetic entry for the committed constant, so the album is never a
 * blank grid on a fresh install: the runner sees the face he is looking at, and tapping it opens
 * the same viewer. Its `id` is `'fallback'`, which is not a nanoid and so cannot collide.
 */
export function albumPhotos(rows: readonly AvatarLike[]): NinaAlbumPhoto[] {
  if (rows.length === 0) {
    return [
      {
        id: 'fallback',
        url: NINA_AVATAR_FALLBACK_SRC,
        kind: 'avatar',
        label: NINA_ALBUM_LABEL,
        isCurrent: true,
        description: null,
      },
    ]
  }
  return rows.slice(0, NINA_ALBUM_MAX).map((row) => ({
    id: row.id,
    url: row.blobUrl,
    kind: 'avatar' as const,
    label: NINA_ALBUM_LABEL,
    isCurrent: row.isCurrent,
    description: row.description,
  }))
}

/**
 * Every photograph in the conversation, both parties, newest first.
 *
 * `listNinaMessageImages` orders `(created_at desc, id desc)` and reads
 * `nina_message_images_user_created_idx` with no join — which is phase 1's stated reason for the
 * table existing at all. So again: preserved, not re-sorted.
 *
 * `messageId` is carried because it is the only thing that makes a gallery photo reachable: the
 * viewer's "go to the message" affordance is Step 12's, and it needs phase 8's `?at=` idiom rather
 * than a second scroll mechanism.
 */
export function galleryPhotos(rows: readonly ImageLike[]): NinaGalleryPhoto[] {
  return rows.slice(0, NINA_GALLERY_LIMIT).map((row) => {
    const side = photoSideOf(row.kind)
    return {
      id: row.id,
      messageId: row.messageId,
      url: row.blobUrl,
      kind: row.kind,
      side,
      label: NINA_SIDE_LABEL[side],
    }
  })
}
