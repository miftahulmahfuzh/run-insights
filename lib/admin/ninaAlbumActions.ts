/**
 * The album's write side — F33 R23, plus this phase's share of R25 (the describe pre-pass).
 *
 * Every action opens with `requireAdmin()` and is scoped to the id it returns. `proxy.ts` governs
 * Server Actions only incidentally (they POST to the page they are used on) and does not match
 * `/admin` at all (ruling D3), so this line is the authorization, exactly as `requireUserId()` is
 * everywhere else in the app.
 *
 * ── ONE PATH, SIX MODULES ────────────────────────────────────────────────────────────────────
 * This file is the layer's entry point: every client component, page and test imports its actions
 * from here, and the implementations live behind it in four modules split along the layer's own
 * seams, plus the two plain modules the `'use server'` rule forces out of them:
 *
 *   · `ninaAlbumDescribeActions.ts` — earning and rewriting `nina_avatars.description`: the
 *     describe button, the hand edit, the in-band ensure.
 *   · `ninaAlbumAvatarActions.ts` — the face itself: make current, adopt a chat photograph, crop,
 *     delete one photo.
 *   · `ninaAlbumUploadActions.ts` — the folder-upload bookkeeping: batch register, manifest read.
 *   · `ninaAlbumFolderActions.ts` — folder maintenance and the bulk photo moves and removes.
 *   · `ninaAlbumDeferredDescribe.ts` — `scheduleDescribe`, the `after()` pre-pass, in a PLAIN
 *     module because a `'use server'` module may export only async functions
 *     (`lib/nina/album.ts:144-148`).
 *   · `ninaAlbumSearchActions.ts` — the album's semantic search: one READ action, the layer's only
 *     one, which stores nothing and revalidates nothing.
 *
 * The barrel carries no `'use server'` of its own: each action is a Server Action of the module
 * that defines it, and the re-exports below are plain ESM. `AdminActionResult` — the one shape
 * every action returns — is defined HERE, so the contract sits at the path every client already
 * imports and no action module needs a runtime edge back to this file (they import it `type`-only,
 * which erases).
 *
 * ── WHAT THIS LAYER DOES NOT DO ──────────────────────────────────────────────────────────────
 *  · It writes no `nina_messages` row and composes no line of Nina's dialogue. A new current
 *    avatar is left with `announced_at = NULL`, which is phase 10's `avatar_changed` trigger
 *    (RU-17). Writing her line here would put words in her mouth from a file that has never read
 *    her persona.
 *  · It does not touch `assets/nina/_anchor.png`. It CANNOT: that is a committed repo file and
 *    this runs on a read-only serverless filesystem. Since RU-18 dropped the reference image from
 *    generation the anchor is inert anyway — `/update-nina-profpic` re-seeds it for the deferred
 *    consistent-face feature, and nothing reads it at runtime today.
 *  · It generates nothing. Phase 12 owns image generation.
 */

import type { NinaCropInput } from '@/lib/nina/crop'

/** One shape for every action, so the client has one branch and no `unknown`. */
export interface AdminActionResult {
  ok: boolean
  error?: string
  /** Set by the describe actions, so a caller can tie the prose back to its row. */
  id?: string
  /** Set by the describe actions, so the card can show the prose without a refetch. */
  description?: string
  /**
   * Phase 6. The folder the explorer should be looking at once this operation has landed: the
   * folder just created, the folder's new path after a rename or a move, or the deleted folder's
   * parent. The explorer's `?folder=` may name a folder that no longer exists the moment a delete
   * or a rename succeeds, so the action that changed it is the thing that knows where to go.
   */
  folder?: string
  /**
   * Phase 6. How many rows the operation actually touched — moved, or deleted. Reported rather
   * than assumed from the input, because the current photo can be left behind and a row can have
   * gone away between the read and the write.
   */
  count?: number
  /**
   * Phase 6. A true thing about the outcome that is not a failure: what a `keepCurrent` delete
   * left behind, and why. Separate from `error` because `ok` is still `true` — the operation did
   * what was asked, and the operator needs the sentence anyway.
   */
  note?: string
}

/** Which arms of the query actually ran. Echoed back so a results header can name it. */
export type AdminSearchMode = 'text' | 'image' | 'both'

/**
 * One ranked photograph, narrowed to what a browser needs — the same field set
 * `app/admin/nina/page.tsx` maps a `NinaAvatarRow` down to for the grid, plus `score`.
 *
 * `pathname`, `sourceKey`, `thumbPathname` and `announcedAt` are absent for that page's stated
 * reason: a browser has no use for them, so they never cross the serialization boundary. Spelled
 * out here rather than imported from `@/lib/nina/queries` so that a client component importing this
 * barrel never has a module that imports `db` in its graph, not even as an erased `import type` —
 * `lib/admin/ninaAlbumUploadActions.ts`'s `AdminManifestEntry` rule.
 *
 * **It is `ExplorerPhotoBase` plus `score`, and that is deliberate**: add `origin: 'album'` and this
 * IS an `AlbumExplorerPhoto` (`components/admin/explorer/model.ts:25-66`), so a result can be fed to
 * anything the browsing grid can draw. `description` rides along under that model's own standing
 * rule — carried, never rendered (`model.ts:49`, invariant 5) — which is why phase 4's results grid
 * reads only seven of these fields and prints none of the prose.
 */
export interface AdminSearchHit {
  /**
   * **Which collection this photograph lives in.** `media-album-unified-search` R1 — search now
   * ranks `nina_avatars` and `nina_message_images` into one list, and the two need different deep
   * links and different pane affordances.
   *
   * It mirrors `ExplorerPhoto`'s own discriminant (`components/admin/explorer/model.ts`) by name
   * and by value, so `{ ...hit }` still lands as a drawable explorer row — which is the property
   * this type's own note calls deliberate: *"add `origin: 'album'` and this IS an
   * `AlbumExplorerPhoto`"*. It is now carried rather than added at the call site.
   */
  origin: 'album' | 'media'
  id: string
  /** The ORIGINAL blob — what the full-screen viewer reads. */
  url: string
  /** The 256 px derived JPEG, or `null`; every consumer falls back to `url`. */
  thumbUrl: string | null
  folder: string
  /** The file's name, or the id for a row written before the column existed. */
  filename: string
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  /** Carried, never rendered — `components/admin/explorer/model.ts:49`, invariant 5. */
  description: string | null
  /**
   * The operator's hand-written search phrases, or `null`. Carried so a result opened in the pane
   * shows the same two boxes the browsing grid does, without a second round trip. For an ALBUM
   * hit this is the row's own column; a POINTER album row never appears in results at all (its
   * vector is permanently NULL — `lib/nina/queries/avatarsearch.ts`'s `albumSearchScope`), so this
   * is never the borrowed value and never NULL-because-linked.
   */
  searchKeywords: string | null
  /** The operator's hand-written EXCLUSION phrases, or `null`. Same carriage, same reason. */
  negativeSearchKeywords: string | null
  crop: NinaCropInput
  /** ISO 8601. A `Date` does not survive the RSC boundary. */
  createdAt: string
  /** Cosine similarity against the query — relative, for ordering and for greying out the tail. */
  score: number
}

/** `searchNinaAvatarsAction`'s result. Its own shape, because the client needs the ranked list. */
export interface AdminSearchResult extends AdminActionResult {
  /**
   * Ranked best-first. **ALWAYS an array** — `[]` on a refusal, on a vendor failure and on a
   * genuine no-match alike — so the results pane never branches on `undefined`. `ok` is what
   * separates "nothing matched" from "the search did not run".
   */
  hits: AdminSearchHit[]
  /**
   * How many album rows carried an embedding and were therefore actually compared. The coverage
   * number, not the album's size: while phase 2's backfill has not run, this is small and the
   * results pane should say so rather than let the operator conclude the photo is not there.
   *
   * Since `media-album-unified-search` it is the SUM across BOTH collections — album rows plus
   * media rows that carry a `description_embedding` and are not superseded by a legacy copy.
   */
  searched: number
  mode: AdminSearchMode
  /** What the vision model saw in the uploaded query image. Present only when one was sent. */
  caption?: string
}

export {
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
  editNinaAvatarNegativeSearchKeywordsAction,
  editNinaAvatarSearchKeywordsAction,
  ensureNinaAvatarDescriptionAction,
} from '@/lib/admin/ninaAlbumDescribeActions'

export {
  deleteNinaAvatarAction,
  saveNinaAvatarCropAction,
  setChatPhotoAsAvatarAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumAvatarActions'

export {
  listNinaAlbumManifestAction,
  registerNinaAvatarsAction,
} from '@/lib/admin/ninaAlbumUploadActions'

export {
  createNinaAlbumFolderAction,
  deleteNinaAlbumFolderAction,
  moveNinaAlbumFolderAction,
  moveNinaAvatarsAction,
  removeNinaAvatarsAction,
  renameNinaAlbumFolderAction,
} from '@/lib/admin/ninaAlbumFolderActions'

export { searchNinaAvatarsAction } from '@/lib/admin/ninaAlbumSearchActions'
