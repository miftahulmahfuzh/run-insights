/**
 * The album's write side — F33 R23, plus this phase's share of R25 (the describe pre-pass).
 *
 * Every action opens with `requireAdmin()` and is scoped to the id it returns. `proxy.ts` governs
 * Server Actions only incidentally (they POST to the page they are used on) and does not match
 * `/admin` at all (ruling D3), so this line is the authorization, exactly as `requireUserId()` is
 * everywhere else in the app.
 *
 * ── ONE PATH, FIVE MODULES ──────────────────────────────────────────────────────────────────
 * This file is the layer's entry point: every client component, page and test imports its actions
 * from here, and the implementations live behind it in four modules split along the layer's own
 * seams, plus the one plain module the `'use server'` rule forces out of them:
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

export {
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
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
