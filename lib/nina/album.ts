import type { NinaCropInput } from './crop'
import { isValidId } from '@/lib/id'

/**
 * Her album and the conversation's photographs, as the screens need them — F33 R17/R19/R26.
 *
 * ── WHY THIS FILE IS PURE, AND ITS IMPORTS COUNTED ────────────────────────────────────────────
 * Invariant 6: vitest runs `environment: 'node'` with no jsdom, so UI behaviour worth testing has
 * to be a pure function in `lib/`. Everything below is read by a client grid, a Server Component
 * and a unit suite, which is exactly the `lib/photos/gallery.ts` and `lib/nina/images.ts` shape.
 * Two imports, and both earn the file's purity: `./crop` is a TYPE, so it erases, and `@/lib/id`
 * is one regex predicate with no dependency behind it — the same file `lib/nina/jobview.ts`
 * reaches for when a URL-borne id must be shape-checked before it is allowed to become a query.
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
 * How many album photos `/nina/about`'s mobile grid renders at once.
 *
 * **A RENDER CAP OVER AN UNPAGINATED READ, and after F34 that is a narrower claim than it used to
 * be.** `listNinaAvatars` still reads the whole album in one statement and still has three
 * callers, so for `albumPhotos` below the rows are already in hand and this is a `slice`. What
 * changed is that it is no longer the album's ONLY read: `/admin/nina` is a file manager over
 * hundreds of photos (F34 R1) and pages a folder at a time through
 * `listNinaAvatarsInFolder`, whose bound is `NINA_ADMIN_PAGE_SIZE` below and is a real `LIMIT`.
 *
 * So: 60 is what a phone scrolls, and it is not a statement about how large the album may get.
 * Six generations a day (phase 12's cap) is ten days of flat-out use; a dropped folder is ten days
 * of it in one gesture, which is exactly why the admin screen does not share this number.
 */
export const NINA_ALBUM_MAX = 60

/**
 * One page of `/admin/nina`'s content pane — F34 R1's *"hundreds of profile pics"*.
 *
 * The admin layout is the app's only deliberately-desktop shell (`app/admin/layout.tsx`,
 * `max-w-[1400px]`), so the grid draws roughly seven thumbnails across; 120 is about seventeen
 * rows, which is two scrolls of content and two or three pages for the album the requirement
 * describes. That is the shape being bought: a numbered pager over an `OFFSET`, not
 * virtualisation for a dataset a human assembled by hand.
 *
 * The number is small because of what a page COSTS, and that cost is the whole argument for
 * `nina_avatars.thumb_url` existing: 120 derived thumbnails is a few megabytes, and 120 untouched
 * originals — which is what a grid of `blob_url` would fetch — is closer to half a gigabyte.
 *
 * It is both the default and the CEILING in `listNinaAvatarsInFolder`: a caller may ask for fewer
 * and cannot ask for more, so a hand-edited `?limit=` in a URL cannot turn one page into the
 * unpaginated read this constant exists to avoid.
 */
export const NINA_ADMIN_PAGE_SIZE = 120

/**
 * How many of HER conversation photographs `/admin/photos` renders per page — this round's R2.
 *
 * ── DELIBERATELY NOT `NINA_ADMIN_PAGE_SIZE`, AND THE DIFFERENCE IS A MISSING COLUMN ─────────
 * Eight lines up, 120 is defensible because `nina_avatars.thumb_url` exists: an album page is 120
 * derived 256 px JPEGs, a few megabytes. `nina_message_images` has NO thumbnail column, so this
 * grid loads originals, and hers are 768x1024 PNGs (`NINA_IMAGE_WIDTH`/`NINA_IMAGE_HEIGHT`, written
 * by `finishSelfie`) on the order of a megabyte each. 120 of those is not a page, it is a download.
 *
 * 48 is about seven rows in the admin shell's grid, and roughly a week of generations at phase 12's
 * six-a-day cap — so the common case is one page and the pager is there for the archive, which is
 * the same shape `/admin/nina` bought and not the same number.
 *
 * It is both the DEFAULT and the CEILING in `listNinaChatPhotos`, for the reason
 * `NINA_ADMIN_PAGE_SIZE` is in `listNinaAvatarsInFolder`: a caller may ask for fewer and cannot ask
 * for more, so no hand-edited limit can turn one page into the unpaginated read this constant
 * exists to prevent.
 *
 * ── NO THUMBNAIL IS BEING ADDED TO CLOSE THIS GAP, AND `next/image` IS NOT THE WAY OUT ──────
 * A `thumb_url` column is a migration, which invariant 10 forbids in this plan.
 * `components/nina/NinaPhotoGrid.tsx:56-58` already ruled out `next/image` for Blob-hosted photos
 * outright — it re-optimises finished files on a paid transform quota — and
 * `components/admin/explorer/PhotoGrid.tsx:29-34` reaffirmed it. So the cost here is known, paid,
 * and bounded by this number plus `loading="lazy"`.
 */
export const NINA_CHAT_PHOTO_PAGE_SIZE = 48

/**
 * The hard ceiling on one folder-subtree manifest — the `source_key` set the client-side diff
 * compares a walked folder against.
 *
 * A key is ~120 bytes, so 2000 of them is ~240 KB crossing a Server Action boundary in one
 * response. That is the real bound; the album is expected to be smaller.
 *
 * **What happens when it truncates is the reason it is allowed to truncate at all.** A short
 * manifest makes the diff over-report: a file that IS already uploaded looks new, gets uploaded
 * again, and its insert hits `nina_avatars_user_source_key_unq` and is discarded by
 * `ON CONFLICT DO NOTHING`. The user pays for bytes they did not need to send; the album does not
 * gain a duplicate row. A cap whose failure mode is "slower" rather than "wrong" is a cap that can
 * be a constant instead of a paging protocol — and it is only true because the dedupe key is a
 * constraint. Without the unique index this number would have to be unbounded.
 */
export const NINA_ADMIN_MANIFEST_MAX = 2000

/**
 * The largest batch one register call may carry, and therefore the largest single `INSERT` the
 * data layer will run.
 *
 * Each row binds eleven parameters, so 50 rows is ~550 of Postgres's 65535-parameter limit — the
 * bound is not the protocol, it is the blast radius. A 300-file drop becomes six calls instead of
 * one, which is also what gives the upload queue its progress granularity: one failed request
 * loses 50 files' worth of registration and the other five batches are already committed, where a
 * single 300-row statement loses all of it.
 *
 * `lib/admin/schema.ts` (phase 4) bounds the batch with this number in Zod, at the boundary where
 * a browser's claim is checked. `insertNinaAvatars` re-checks it and throws, which should be
 * unreachable — the `assertPathSegment` posture in `lib/nina/images.ts`: the cheap loud defence at
 * the one place that would otherwise do the damage.
 */
export const NINA_ADMIN_BATCH_MAX = 50

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
  /** NULL once the photograph has outlived its bubble (R1). See `galleryPhotos`. */
  messageId: string | null
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
  /**
   * The bubble to jump to, or NULL for an orphan — a photograph whose conversation was deleted
   * (R1). A consumer that offers "go to the message" must hide the affordance on a NULL rather than
   * link into a session that does not exist. Nothing renders it today; see `galleryPhotos`.
   */
  messageId: string | null
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
 * `messageId` is carried because it is the only thing that could make a gallery photo reachable:
 * the viewer's "go to the message" affordance would need phase 8's `?at=` idiom rather than a
 * second scroll mechanism. **It is nullable and, today, unread.** No component consumes it —
 * `NinaAboutScreen`'s `toCell` takes `id`, `url` and `label` — so a NULL reaches no JSX and there is
 * nothing to degrade yet. The field is passed through unchanged, NULL included, so that whoever
 * builds the affordance is handed the orphan case in the type instead of discovering it: an
 * orphaned photograph has no bubble to jump to, and the affordance must be absent rather than
 * broken. `photoSideOf` still decides his-or-hers from `kind` alone, which is what keeps an orphan
 * in the gallery on the correct side of the conversation it no longer belongs to.
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

/* ── THE `/nina/about` VIEWER'S `?photo=` PARAMETER ──────────────────────────────────────────────
 * The codec that was private to `NinaAboutScreen.tsx`, lifted into this file because it now has
 * TWO parsers: the screen derives the viewer's open state from the URL on every render, and the
 * page (`app/nina/about/page.tsx`) has to resolve a `chat.<id>` the gallery window missed before
 * it can render. One grammar, one home — the same argument `JOB_JUMP_PARAM` makes for itself in
 * `lib/nina/jobview.ts`, and the same reason it is testable here rather than inside a component.
 *
 * ── THE OTHER `?photo=` GRAMMAR IS NOT THIS ONE ────────────────────────────────────────────────
 * `/nina?photo=avatar:<id>|image:<id>` (`lib/nina/attach.ts`, colon) is the composer-attach
 * pointer on a different route, and it stays byte-identical. The two parameters share the KEY
 * `photo` — `ChatScreen` deletes both in one `replaceState` for exactly that reason — but their
 * VALUE grammars differ (`section.id` here, `kind:id` there), so each module owns its whole round
 * trip and neither can drift into the other's route. That is also why this module's constant is
 * `NINA_ABOUT_PHOTO_PARAM` and not a second `PHOTO_PARAM`: a file that imports both must never be
 * left to guess which grammar a bare `PHOTO_PARAM` spells.
 *
 * `.` and not `:` between section and id because `URLSearchParams` leaves `.` unencoded — the
 * reason the screen-private codec gave, and the reason it survives the move unchanged.
 */

/** The about route itself, so the href builder below does not bury the path in a template. */
export const NINA_ABOUT_HREF = '/nina/about'

/** The parameter's KEY. The same `'photo'` string `lib/nina/attach.ts` exports; see the header. */
export const NINA_ABOUT_PHOTO_PARAM = 'photo'

/**
 * Which list the parameter's section names: `album` is her profile album, `chat` is the Media
 * gallery. The screen's own word for it, exported because the page now parses the same union the
 * screen renders.
 */
export type NinaViewerSection = 'album' | 'chat'

/** `chat.<id>` — section and id, joined by the dot the header above argues for. */
export function encodeAboutPhoto(section: NinaViewerSection, id: string): string {
  return `${section}.${id}`
}

/**
 * `unknown -> { section, id } | null`, on `parseNinaPhotoParam`'s precedent and for its stated
 * reason: a `searchParams` value is `string | string[] | undefined` and `URLSearchParams.get` is
 * `string | null`, and a shape check that refuses to be handed the wrong shape is a shape check
 * with a second bug in it. A repeated `?photo=a&photo=b` is a malformed link, not an interesting
 * case.
 *
 * A miss is `null`, and `null` is "no viewer" — never an error. The id is NOT shape-checked here
 * on purpose: the codec's only job is to split the string, and both consumers answer an
 * unresolvable id with a closed viewer anyway — the screen by `findIndex` missing, the page by
 * `aboutPhotoIdOutsideGallery`'s `isValidId` gate. Leniency here cannot open anything.
 */
export function decodeAboutPhoto(raw: unknown): { section: NinaViewerSection; id: string } | null {
  if (typeof raw !== 'string') return null
  const dot = raw.indexOf('.')
  if (dot <= 0) return null
  const section = raw.slice(0, dot)
  const id = raw.slice(dot + 1)
  if (id.length === 0) return null
  if (section !== 'album' && section !== 'chat') return null
  return { section, id }
}

/**
 * The deep link itself: `/nina/about?photo=chat.<id>`. This is what Phase 2's Detail-foto photo
 * button navigates to. The screen's own taps do NOT go through it — `urlWithPhoto` sets the key
 * on `window.location` because it must PRESERVE whatever else is on the current URL, while a
 * `<Link href>` has no current URL to preserve and gets this builder instead.
 */
export function aboutPhotoHref(section: NinaViewerSection, id: string): string {
  const params = new URLSearchParams()
  params.set(NINA_ABOUT_PHOTO_PARAM, encodeAboutPhoto(section, id))
  return `${NINA_ABOUT_HREF}?${params.toString()}`
}

/** What `aboutViewerLists` hands back: one list per section, each already in render order. */
export interface NinaAboutViewerLists {
  album: readonly NinaAlbumPhoto[]
  chat: readonly NinaGalleryPhoto[]
}

/**
 * **Which list the viewer renders over — the one decision the URL is allowed to change.**
 *
 * The chat arm is `gallery` PLUS the server-resolved photo appended at the END, and the append
 * position is load-bearing twice:
 *
 *   - the Media grid maps the `gallery` prop itself, so grid cell `i` and viewer index `i` still
 *     address the same photograph for every `i < gallery.length` — a deep link never changes what
 *     the grid shows (plan-set invariant 8) — and
 *   - a resolved out-of-window photograph is by definition OLDER than everything in the window,
 *     so last is also where newest-first order says it belongs.
 *
 * The album arm never carries the resolved photo. An `album.<id>` deep link has no resolver
 * behind it on purpose: nothing outside a tap on the album grid itself mints one, the album read
 * is unpaginated (`albumPhotos` slices only for the render), and an avatar id is not a
 * `nina_message_images` row — the read that would resolve it does not exist. Refusing the
 * `album` section is `aboutPhotoIdOutsideGallery`'s business, not this function's.
 */
export function aboutViewerLists(input: {
  album: readonly NinaAlbumPhoto[]
  gallery: readonly NinaGalleryPhoto[]
  resolvedChatPhoto: NinaGalleryPhoto | null
}): NinaAboutViewerLists {
  if (input.resolvedChatPhoto == null) return { album: input.album, chat: input.gallery }
  return { album: input.album, chat: [...input.gallery, input.resolvedChatPhoto] }
}

/**
 * **The membership-miss predicate: does this `?photo=` value name a chat photograph the gallery
 * window does not hold — the one case where the single-row deep-link read is worth a query?**
 *
 * Runs on the page over the SAME `galleryPhotos` output it is about to render, BEFORE any extra
 * read, so the common case costs zero queries and the check can never disagree with the grid
 * about what "in the window" means. Answers `null` — "nothing to resolve" — for every shape that
 * is not a well-formed `chat.<id>` of one of ours outside the list: no parameter, a repeated
 * parameter (`unknown`'s array arm), the `album` section, a malformed split, and an id that
 * cannot be one of ours (`isValidId` — the cheap shape check before a query, `app/nina/jobs/[id]`'s
 * stated rule, so a hand-typed URL costs the page nothing at all).
 *
 * The `album` section is refused HERE and not by the codec on purpose: `decodeAboutPhoto` must
 * keep parsing `album.<id>` — the screen opens album photos through it — while the RESOLVER has
 * no album arm, because an album miss is a render-cap artifact and not the R3 window.
 */
export function aboutPhotoIdOutsideGallery(
  raw: unknown,
  gallery: readonly NinaGalleryPhoto[],
): string | null {
  const parsed = decodeAboutPhoto(raw)
  if (parsed === null || parsed.section !== 'chat') return null
  if (!isValidId(parsed.id)) return null
  return gallery.some((photo) => photo.id === parsed.id) ? null : parsed.id
}
