import type { UploadRefusal } from '@/lib/admin/filetree'
import type { NinaCropInput } from '@/lib/nina/crop'
import type { NinaPhotoSide } from '@/lib/nina/album'
import type { NinaImageKind } from '@/lib/db/schema'

/**
 * What `/admin/nina`'s explorer knows about the album, and nothing more.
 *
 * The successor to `AlbumManager`'s `AlbumPhoto`, and narrower than `NinaAvatarRow` for the reason
 * `app/admin/nina/page.tsx` has always given: `announcedAt` and `pathname` are of no use to a
 * browser, so they never cross the serialization boundary. Three fields are new — `thumbUrl`,
 * `folder` and `filename` — and each is the whole point of one part of this phase.
 *
 * Types only. Nothing here is a runtime export, so the module compiles into whichever graph imports
 * it and the Server Component that builds these objects does not drag a client module in with it.
 */

/**
 * Fields every explorer row has, whatever table it came from. The four that VARY between the two
 * arms (`thumbUrl`, `folder`, `isCurrent`, `crop`) are typed generally HERE and narrowed on the
 * media arm, so a consumer reading them off the `ExplorerPhoto` union gets the general type and
 * compiles either way — while a consumer reading a MEDIA-ONLY field must narrow on `origin` first,
 * which is the compiler refusing to let album code assume a message image.
 */
interface ExplorerPhotoBase {
  id: string
  /**
   * The ORIGINAL blob. Deliberately not what the grid renders.
   * `components/admin/UploadAvatar.tsx:26-33` is why it exists un-re-encoded ("a 4x zoom on a
   * 768 px source would show her face at 192 px of real detail"), and this is the URL the framing
   * studio, the sanity circles and the full-screen viewer all read.
   */
  url: string
  /**
   * The name a tile and the pane header print. Album rows: the file's name on his laptop, or the
   * id for a row written before the column existed. Media rows: DERIVED, because
   * `nina_message_images` has no filename column — the page builds one from the row's date and id
   * (see `app/admin/nina/page.tsx`'s media arm).
   */
  filename: string
  width: number | null
  height: number | null
  bytes: number | null
  /** Album: the `nina_avatars.source` column. Media: the row's own `kind`, which on that table
   * IS the provenance — `'generated'` came from her worker, `'upload'` came from his composer. */
  source: string
  /** Album: the row's `is_current`. Media: always `false` — see `MediaExplorerPhoto`. */
  isCurrent: boolean
  /** Read by nothing in `components/` — invariant 5. Shown as present/absent, never rendered. */
  description: string | null
  crop: NinaCropInput
  /** ISO 8601. A `Date` does not survive the RSC boundary. */
  createdAt: string
  /** `''` is the album root, `'2026/bali'` is two levels down, and `''` is also the only value a
   * media row ever carries — it is filed nowhere. Never a blob prefix — a column. */
  folder: string
  /**
   * The 256 px derived JPEG, or `null`.
   *
   * **`null` is not an edge case, it is the migration path.** Every row that existed before the
   * column was added has no thumbnail, and a browser without `OffscreenCanvas` uploads none. Every
   * consumer therefore falls back to `url`, and the grid is correct-but-heavy rather than broken.
   * Media rows are `null` PERMANENTLY — see `MediaExplorerPhoto`.
   */
  thumbUrl: string | null
}

/** One row of the album: an `nina_avatars` row, narrowed to what a browser needs. */
export interface AlbumExplorerPhoto extends ExplorerPhotoBase {
  origin: 'album'
}

/**
 * One row of the Media view: an original `nina_message_images` row, the superset
 * `listNinaMediaPhotos` reads. Everything the Chat-photos surface knew about such a row
 * (`components/admin/chatPhotoModel.ts`) collapses into this arm as that surface merges away —
 * including its two load-bearing docstrings: `pathname` is never parsed, and an orphan
 * (`messageId: null`) is a first-class member, not an error.
 */
export interface MediaExplorerPhoto extends ExplorerPhotoBase {
  origin: 'media'
  /**
   * Always `null`, and typed as the LITERAL so a media row cannot grow a thumbnail by accident:
   * the table has no thumbnail column (`lib/nina/album.ts:80-105`'s argument), so the grid's
   * `photo.thumbUrl ?? photo.url` fallback is the only render path — the accepted cost behind
   * `NINA_CHAT_PHOTO_PAGE_SIZE = 48`.
   */
  thumbUrl: null
  /**
   * Always `false`. Adoption (`setChatPhotoAsAvatarAction`) COPIES the bytes into `nina_avatars`,
   * and it is the copy that carries `is_current` — a message image is never itself her face.
   */
  isCurrent: false
  /** Identity (all three null): `resolveCrop` folds it to centred `object-cover`. Framing begins
   * only when an adoption mints an avatar row that can store one. */
  crop: NinaCropInput
  /** The table's own kind: `'generated'` (her worker) or `'upload'` (his composer). */
  kind: NinaImageKind
  /** `photoSideOf(kind)`, computed on the server exactly as `galleryPhotos` computes it. */
  side: NinaPhotoSide
  /**
   * The generation sidecar, carried in full — `/admin` is the one surface where reading it is the
   * point. Non-null only while the generated bytes are still the ones the prompt produced:
   * `updateNinaChatPhotoBlob` nulls it on replace, which is why a replaced row offers no prompt
   * affordance in the phase that renders one.
   */
  prompt: string | null
  /**
   * The bubble this photograph hangs off, or NULL once it has outlived one — a session delete
   * orphans the row instead of destroying it. An ORPHAN is a first-class member of the Media
   * collection; the pane says so in words rather than printing an empty cell.
   */
  messageId: string | null
  /** Position within its message's bubble. `0` for everything the worker wrote. */
  sortOrder: number
}

/**
 * One row of the explorer's content pane — an album avatar OR a Media photograph. Narrow on
 * `photo.origin` (`'album' | 'media'`) to reach an arm's own fields.
 */
export type ExplorerPhoto = AlbumExplorerPhoto | MediaExplorerPhoto

/** One folder that holds at least one row. `buildTree` (phase 2) nests a list of these. */
export interface ExplorerFolder {
  folder: string
  count: number
}

/**
 * Where in the folder we are. Offsets rather than a keyset cursor, because a file manager's pager
 * says "121–240 of 314" and offers Newer as well as Older — see this phase's Requires block, which
 * is also where the one cost of that choice is written down (a tile can repeat across two
 * consecutive pages *during* an upload; nothing is ever skipped).
 */
export interface ExplorerPageInfo {
  /**
   * The folder this page was read from. `''` on the Media arm too — a message image is filed
   * nowhere — but there it is UNREAD: the pager is view-scoped and the breadcrumb draws from
   * `view`, so the value exists only to keep this one shape serving both arms.
   */
  folder: string
  /** 1-based, clamped by the page before it ever reaches a query. */
  page: number
  pageSize: number
  /** Rows in THIS folder, not in its subtree. The grid is not recursive; the tree is. */
  total: number
}

/**
 * One file's progress through the queue.
 *
 * The shape is `components/nina/Composer.tsx:104`'s `TileState` at a different scale, and the
 * difference is instructive: a chat tile ends in `describing` because `glm-4.6v` runs on the upload
 * path there. Here it does not — phase 4 took the describe pre-pass off this path precisely because
 * *"i will put hundreds of profile pics in there"* means hundreds of ~8–11 s vendor round trips —
 * so the terminal state before `done` is `registering`.
 */
export type QueueItemState =
  'waiting' | 'thumbnailing' | 'uploading' | 'registering' | 'done' | 'error'

export interface QueueItem {
  /**
   * Phase 2's dedupe key for this file, which is unique inside one gesture by construction (it
   * folds in the path). Used as the React key and as the patch address, so no second id is minted.
   */
  id: string
  /** The path as it will exist in the album: `2026/bali/DSC_0031.jpg`. */
  path: string
  folder: string
  filename: string
  state: QueueItemState
  error: string | null
}

/**
 * What the gesture decided BEFORE any byte moved — the visible half of *"it automatically upload
 * only the new folders and files as optimization"*.
 *
 * `already` is the number this whole report exists for. A drop of a folder that is fully uploaded
 * enqueues nothing, and without this number on screen that is indistinguishable from a broken page.
 */
export interface QueueReport {
  /**
   * Local files that will not be uploaded because a row with their key exists — already in the
   * album, or repeated inside this same gesture. `plan.counts.existing`.
   */
  already: number
  /** Not an image. Skipped silently per the requirement — but counted here, never hidden. */
  rejected: number
  /**
   * An image we would not take: over the byte cap, zero bytes, unnamed, name too long, or a
   * destination that breaks the path grammar. `name` is the file's own display name, which is what
   * `plan.refused` carries — phase 2 deliberately does not hand back a joined path here, because
   * the whole reason some of these are refused is that the path could not be formed.
   */
  refused: ReadonlyArray<{ name: string; reason: UploadRefusal }>
  /** How many files the walk found in total, before any of the above was decided. */
  found: number
}
