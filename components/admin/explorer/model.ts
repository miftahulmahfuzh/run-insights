import type { UploadRefusal } from '@/lib/admin/filetree'
import type { NinaCropInput } from '@/lib/nina/crop'

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

export interface ExplorerPhoto {
  id: string
  /**
   * The ORIGINAL blob. Deliberately not what the grid renders.
   * `components/admin/UploadAvatar.tsx:26-33` is why it exists un-re-encoded ("a 4x zoom on a
   * 768 px source would show her face at 192 px of real detail"), and this is the URL the framing
   * studio, the sanity circles and phase 13's full-screen viewer all read.
   */
  url: string
  /**
   * The 256 px derived JPEG, or `null`.
   *
   * **`null` is not an edge case, it is the migration path.** Every row that existed before phase 1
   * added the column has no thumbnail, and a browser without `OffscreenCanvas` uploads none. Every
   * consumer therefore falls back to `url`, and the grid is correct-but-heavy rather than broken.
   */
  thumbUrl: string | null
  /** `''` is the album root. `'2026/bali'` is two levels down. Never a blob prefix — a column. */
  folder: string
  /** The name the file had on his laptop, or a fallback built from the id for a pre-phase-1 row. */
  filename: string
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  /** Read by nothing in `components/` — invariant 5. Shown as present/absent, never rendered. */
  description: string | null
  crop: NinaCropInput
  createdAt: string
}

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
