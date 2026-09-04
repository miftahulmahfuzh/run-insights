'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { folderAncestors, folderParent, isInFolderTree } from '@/lib/admin/filetree'
import {
  currentPhotoKeptNote,
  currentPhotoRefusal,
  folderCreateSchema,
  folderDeleteSchema,
  folderMoveSchema,
  folderRenameSchema,
  photoMoveSchema,
  photoRemoveSchema,
  planFolderCreate,
  planFolderMove,
  planFolderRename,
  type CurrentPhotoRef,
} from '@/lib/admin/folderOps'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  albumManifestSchema,
  avatarBatchRegisterSchema,
  avatarIdSchema,
  cropWriteSchema,
  type AvatarBatchRecord,
} from '@/lib/admin/schema'
import { NINA_ADMIN_MANIFEST_MAX } from '@/lib/nina/album'
import { clampCrop, cropForWrite, resolveCrop } from '@/lib/nina/crop'
import {
  declareNinaFolders,
  deleteNinaAvatar,
  deleteNinaAvatars,
  deleteNinaAvatarsInFolderTree,
  deleteNinaFolderSubtree,
  getCurrentNinaAvatar,
  getNinaAvatar,
  insertNinaAvatars,
  listNinaAvatarFolders,
  listNinaAvatarManifest,
  moveNinaAvatarsToFolder,
  renameNinaAvatarFolder,
  renameNinaFolderSubtree,
  setCurrentNinaAvatar,
  setNinaAvatarDescription,
  updateNinaAvatarCrop,
  type NinaAvatarBlobRef,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The album's write side — F33 R23, plus this phase's share of R25 (the describe pre-pass).
 *
 * Every action opens with `requireAdmin()` and is scoped to the id it returns. `proxy.ts` governs
 * Server Actions only incidentally (they POST to the page they are used on) and does not match
 * `/admin` at all (ruling D3), so this line is the authorization, exactly as `requireUserId()` is
 * everywhere else in the app.
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────────────────────
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

/**
 * Describe one album row with `glm-4.6v` and stamp `nina_avatars.description`. R25's raw material.
 *
 * RU-12 is why this exists at all: `glm-5.3` is never sent an image, so the only way she can say
 * anything true about a photograph is for a vision model to have written down what is in it. Also
 * the retry button for a failed pre-pass.
 */
export async function describeNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  try {
    const { description } = await describeNinaImages([
      { blobUrl: row.blobUrl, pathname: row.pathname },
    ])
    await setNinaAvatarDescription(userId, row.id, description)
    revalidatePath('/admin/nina')
    return { ok: true, description }
  } catch (cause) {
    console.error('[f33] admin describe failed', cause)
    return { ok: false, error: 'The description call failed. Try again.' }
  }
}

/**
 * "Set as her profile photo" — R23, verbatim. Re-arms `announced_at`, so she comments on the
 * change (RU-17) via phase 10's trigger. Idempotent when the row is already current.
 *
 * ── AND IT IS NOW ONE OF THE TWO PLACES A DESCRIPTION IS EARNED ─────────────────────────────
 * The describe pre-pass used to run on upload. It runs here instead, because this is the moment
 * `nina_avatars.description` becomes readable by anything: invariant 5 says the description is her
 * prompt's private input, and her prompt reads the CURRENT avatar. A photo sitting in a folder is
 * read by nobody. `scheduleDescribe` is `after()`-based and skips a row that already has a
 * description, so promoting an old, already-described photo costs one indexed read and no vendor
 * call.
 */
export async function setCurrentNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const changed = await setCurrentNinaAvatar(userId, parsed.data)
  if (!changed) return { ok: false, error: 'That photo is not in the album.' }

  scheduleDescribe(userId, parsed.data)

  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Save the framing the operator just dragged — R23's whole point.
 *
 * **`clampCrop` runs again here, server-side, against the row's real `width`/`height`.** The Zod
 * schema cannot know the aspect ratio, so it can only reject nonsense; this is what guarantees the
 * stored numbers keep the circle covered no matter what a hand-crafted POST claims. An identity
 * crop is written as three NULLs by `cropForWrite`, which is how "Reset framing" and "Save
 * framing" stay one code path — phase 1's `updateNinaAvatarCrop` docstring promises exactly that.
 */
export async function saveNinaAvatarCropAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = cropWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That framing is out of range.' }

  const row = await getNinaAvatar(userId, parsed.data.id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  const clamped = clampCrop(
    { width: row.width, height: row.height },
    resolveCrop({ scale: parsed.data.scale, x: parsed.data.x, y: parsed.data.y }),
  )
  const saved = await updateNinaAvatarCrop(userId, row.id, cropForWrite(clamped))
  if (!saved) return { ok: false, error: 'That photo is not in the album.' }
  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Remove a photo from the album, and its blob with it.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * A failed `del` leaves an orphaned object, which is recoverable (and is what
 * `scripts/blob-reap.mjs` exists for, once it is taught the `nina/` prefix — ruling D4's one
 * follow-up card). A deleted blob under a live row is a permanently broken image in her album. So
 * the row goes first and the `del` is best-effort, logged rather than surfaced.
 *
 * The current photo cannot be removed: `deleteNinaAvatar`'s WHERE clause refuses it, which is what
 * makes "zero current avatars" unreachable rather than repaired.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  /*
   * ROW FIRST, BLOB SECOND, BEST-EFFORT — and TWO objects now, not one.
   *
   * The order and the swallow are unchanged and the original argument still holds: a failed `del`
   * leaves an orphaned object, which is recoverable (and is what `scripts/blob-reap.mjs` exists
   * for, once it is taught the `nina/` prefix — ruling D4's one follow-up card), while a deleted
   * blob under a live row is a permanently broken image in her album.
   *
   * What is new is the thumbnail (F34 R1). `nina_avatars.thumb_url` is written by
   * `registerNinaAvatarsAction` below, and the ROW is the only record that the object exists — its
   * stored pathname carries Blob's random suffix and is not derivable — so a delete that removed
   * one ref would leak an object nothing could ever find again. Both fields are NULL for every
   * pre-F34 row and for any row whose canvas encode failed, and NULL means "there is nothing to
   * delete" rather than "something went wrong".
   *
   * One `del([...])` and not two calls: `del` takes an array, both objects belong to the same
   * photo, and a partial success here has no meaning worth reporting separately — either the
   * photo's objects are gone or a `[f34]` line names the ones that are not.
   */
  const orphans = removed.thumbUrl == null ? [removed.blobUrl] : [removed.blobUrl, removed.thumbUrl]
  try {
    await del(orphans)
  } catch (cause) {
    console.error('[f34] row deleted, blob(s) left behind', orphans, cause)
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}

/* ============================================================================
 * admin-album-file-manager phase 4 — folder-aware upload. Appended; every
 * signature above is unchanged. Phase 6 appends below this block.
 * ==========================================================================*/

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE DESCRIBE PRE-PASS IS OFF THE UPLOAD PATH. THIS IS THE ARGUMENT.
 *
 *  What it used to be: `registerNinaAvatarAction` awaited `describeNinaImages` on EVERY upload.
 *  That was correct, and its own comment said why — an uploaded image has no generation prompt,
 *  so `glm-4.6v` is the only way `nina_avatars.description` ever gets filled for it, and R25's
 *  "asked where she is in her new profile photo, Nina invents a story true to the photo" has
 *  nothing to work from otherwise.
 *
 *  What changed is the scale, and the user stated it as a requirement rather than an aside:
 *  *"i will put hundreds of profile pics in there."*
 *
 *  The measurement, from `lib/nina/vision.ts`'s own constants: a describe call is ~8-11 s typical
 *  (`NINA_DESCRIBE_TIMEOUT_MS = 25_000`, derived there from ~26-33 ms per completion token over
 *  ~220 output tokens plus 2-3 s of fixed overhead). Awaited once per upload, three hundred
 *  uploads is 40 minutes to 1.4 hours of wall clock the operator sits through, three hundred
 *  serverless invocations held open, and three hundred vendor bills — for descriptions of
 *  photographs Nina may never be shown. And Server Actions dispatch one at a time per client, so
 *  those latencies do not overlap. They add.
 *
 *  Where the description comes from instead. `description` has exactly one reader (invariant 5:
 *  it reaches Nina as text and is never rendered to the runner), and that reader is her prompt.
 *  So it is needed at two moments, and it is now produced at exactly those two:
 *    · IT BECOMES HER FACE — `setCurrentNinaAvatarAction`, plus the two paths in this file that
 *      make a row current without going through it (`registerNinaAvatarAction` with
 *      `makeCurrent`, and this batch's empty-album promotion).
 *    · IT IS HANDED TO HER — the share-to-Nina path, via `ensureNinaAvatarDescriptionAction`,
 *      which phase 7 calls before opening the chat tab.
 *  Plus on demand, forever: `describeNinaAvatarAction` is the button that was always there.
 *
 *  Both automatic triggers are NON-FATAL, exactly as the register path's pre-pass was: the row
 *  exists, the album renders, and a failure leaves a visible "Describe it" button rather than a
 *  lost upload or a refused promotion. That property is inherited, not re-litigated.
 *
 *  What is knowingly given up: a photo uploaded and never promoted or shared has
 *  `description = null` indefinitely. `resolveAttachment` (`lib/nina/actions.ts:141`) copies null
 *  happily, so a send still works — she simply has no words about it, which is exactly why phase
 *  7 fires the ensure before opening the tab.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Fill in a missing description AFTER the response has gone out. Not exported: a `'use server'`
 * module may export only async functions, and this is a synchronous scheduler.
 *
 * ── WHY `after()` AND NOT `await` ───────────────────────────────────────────────────────────
 * The repo's own idiom for a second model call the caller must not wait on
 * (`lib/nina/actions.ts:782` schedules distillation the same way, for the same reason). It also
 * keeps invariant 4 trivially true: this is a Server Action, never a render, and the model call is
 * not even on the action's clock.
 *
 * ── WHY IT RE-READS THE ROW INSIDE THE CALLBACK ─────────────────────────────────────────────
 * So the caller pays nothing. `setCurrentNinaAvatarAction` would otherwise need an extra
 * `getNinaAvatar` on its hot path just to discover whether a describe is needed; here the read
 * happens after the operator already has their answer, and the skip is authoritative at the moment
 * the work would actually run.
 *
 * ── NO `revalidatePath` IN HERE, DELIBERATELY ───────────────────────────────────────────────
 * `after()` runs once the response is finished, so there is no re-render left to attach to — an
 * action's revalidation is what makes the framework include a fresh RSC payload in the SAME
 * response (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "A single response
 * carries data and UI"). `/admin/nina` is `force-dynamic` and its reads are not cached, so the
 * operator's next navigation shows the description with nothing to invalidate.
 * `ensureNinaAvatarDescriptionAction` is the in-band variant for a caller that needs the prose in
 * its own return value.
 */
function scheduleDescribe(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaAvatar(userId, id)
      if (row == null) return
      if (row.description != null) return // already described; not a vendor call
      const { description } = await describeNinaImages([
        { blobUrl: row.blobUrl, pathname: row.pathname },
      ])
      await setNinaAvatarDescription(userId, row.id, description)
    } catch (cause) {
      // Non-fatal, exactly as the old register-path pre-pass was. The "Describe it" button on the
      // card is the recovery, and it always was the recovery.
      console.error('[f34] deferred describe failed', id, cause)
    }
  })
}

/**
 * Describe a photo **only if it has no description yet**, and return the prose in band. The
 * share-to-Nina half of the describe move.
 *
 * Phase 7 calls this before opening the chat tab so that *"nina will respond to it accordingly"*
 * has something true to work from. It delegates to `describeNinaAvatarAction` rather than repeating
 * its body: two spellings of one vendor call is how one of them ends up not writing the row.
 *
 * ── THE FAST PATH IS THE COMMON PATH ────────────────────────────────────────────────────────
 * A photo that is already her face, or that was already shared once, returns after ONE indexed
 * single-row read with no model call at all. Only a never-promoted, never-shared photo pays the
 * ~8-11 s. That is the shape that makes it safe for phase 7 to await — and phase 7 must still open
 * the tab BEFORE awaiting it, because `window.open` after an `await` has lost the user gesture.
 */
export async function ensureNinaAvatarDescriptionAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }
  if (row.description != null) return { ok: true, id: row.id, description: row.description }

  return describeNinaAvatarAction(row.id)
}

/**
 * One already-uploaded file, as the client's diff needs it.
 *
 * Structurally identical to phase 1's `NinaAvatarManifestEntry` and declared here anyway, so that
 * `lib/nina/queries.ts` — a module that imports `db` — never appears in a client component's import
 * graph, not even as an erased `import type`. `app/admin/nina/page.tsx:26-28` states the same rule
 * for `NinaAvatarRow` and `AlbumPhoto`: the client gets a view model, not the row.
 */
export interface AdminManifestEntry {
  id: string
  folder: string
  sourceKey: string
}

/** `registerNinaAvatarsAction`'s result. Its own shape, because the client needs two counts. */
export interface AdminBatchRegisterResult extends AdminActionResult {
  /**
   * The rows actually INSERTED, keyed by the dedupe key the client sent, so phase 5 can mark
   * exactly those tiles done without depending on array order. A submitted key that is absent from
   * this array was already in the album.
   */
  inserted?: { sourceKey: string; id: string }[]
  /** How many submitted records wrote nothing — duplicates, in the batch or already in the table. */
  skipped?: number
}

/** `listNinaAlbumManifestAction`'s result. */
export interface AdminManifestResult extends AdminActionResult {
  entries?: AdminManifestEntry[]
  /** The subtree is at or over `NINA_ADMIN_MANIFEST_MAX`. See the action's docstring. */
  truncated?: boolean
}

/**
 * Register a whole chunk of a folder upload in ONE action call. R1's *"i very much prefer we can
 * upload folders"*, server side.
 *
 * ── WHY THIS EXISTS AT ALL: THE PARALLEL / SERIAL SPLIT ─────────────────────────────────────
 * The blob PUTs go through `app/api/admin/nina/upload/route.ts`, a Route Handler, and are genuinely
 * parallel — phase 5 runs them through a bounded-concurrency queue. Server Actions are NOT: Next
 * dispatches them one at a time per client
 * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`). So the bytes fan out and the
 * bookkeeping batches, and `NINA_ADMIN_BATCH_MAX` is where that line is drawn.
 *
 * ── WHY NOT `insertNinaAvatarAsCurrent`, THE ONE INSERT THAT EXISTED ────────────────────────
 * Because it un-currents and re-currents on EVERY insert (`lib/nina/queries.ts:955`), and it has
 * to: `nina_avatars_user_current_unq` is a partial unique index on `(user_id) WHERE is_current`, so
 * the statement order is load-bearing. Three hundred calls would rewrite the current row three
 * hundred times, re-arm `announced_at` three hundred times, and make her comment on a face nobody
 * chose. Phase 1's `insertNinaAvatars` writes `isCurrent: false` for every row and never reads that
 * column, and that is the whole reason it was asked for.
 *
 * ── IDEMPOTENCE IS A CONSTRAINT, NOT A CONVENTION ───────────────────────────────────────────
 * `insertNinaAvatars` is `ON CONFLICT (user_id, source_key) DO NOTHING ... RETURNING`, so the array
 * it returns contains ONLY the rows that were really new. A re-sent batch — a retry after a network
 * blip, a double-clicked drop, the same Explorer folder dragged in twice, two tabs — returns `[]`
 * and writes nothing. Nothing is compared in application code and nothing races: the unique index
 * decides, and `skipped` is just `submitted - rows.length`.
 *
 * The intra-batch dedupe below is separate and deliberate. Two records with the same key inside one
 * `VALUES` list is a client bug (phase 2's `planFolderUpload` cannot produce it), and rather than
 * depend on how Postgres resolves a speculative-insertion conflict against a tuple from the same
 * command, the duplicate is dropped here, where the behaviour is obvious and testable.
 *
 * ── WHY THE RESULT JOINS ON `pathname` AND NOT ON `sourceKey` ───────────────────────────────
 * Phase 1 deliberately did NOT add `sourceKey` to `NinaAvatarRow`, so the rows coming back cannot
 * be keyed by it directly. `pathname` is the STORED Blob pathname: `addRandomSuffix: true` plus
 * `allowOverwrite: false` make it unique per object, and it is the same string the client already
 * holds for the file it just PUT. So it is a sound join key and it costs one `Map`. Array position
 * would also work today and is not used, because "the order `RETURNING` gives back after skipping
 * conflicts" is not a promise worth depending on.
 *
 * ── `is_current` IS TOUCHED IN EXACTLY ONE CASE, AND IT UPHOLDS INVARIANT 7 ─────────────────
 * If the album has no current row at all — a fresh database, before any seed or
 * `/update-nina-profpic` run — a plain batch insert would leave it with none, and invariant 7 is
 * "exactly one current avatar, always". So the current row is read ONCE per batch (a single-row
 * lookup on the partial unique index, not once per file) and, only if it was absent, one inserted
 * row is promoted through `setCurrentNinaAvatar` — the function that owns the un-current/current
 * ordering, so this path adds no third opinion about that index. Which row hardly matters: any of
 * the new photos is an equally valid first face, and the operator re-picks in one click.
 *
 * ── THE ORPHAN WINDOW, NAMED RATHER THAN INHERITED ──────────────────────────────────────────
 * A blob that is PUT and then never registered — the tab is closed, this call fails, the token
 * outlives the page — is an orphan in the store. That is the same exposure the album has today, and
 * ruling D4 already carries the open card for it: `scripts/blob-reap.mjs` still does not know the
 * `nina/` prefix. A folder upload WIDENS the window from one object to hundreds, and to TWO objects
 * per file now that a thumbnail rides along. This plan does not close it; it says so out loud here
 * so the next person finds the card instead of rediscovering the hole.
 */
export async function registerNinaAvatarsAction(input: unknown): Promise<AdminBatchRegisterResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarBatchRegisterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That batch did not describe itself properly.' }

  const submitted = parsed.data.records.length

  // Intra-batch dedupe on the key, first writer wins. See the docstring.
  const seen = new Set<string>()
  const records: AvatarBatchRecord[] = []
  for (const record of parsed.data.records) {
    if (seen.has(record.sourceKey)) continue
    seen.add(record.sourceKey)
    records.push(record)
  }

  // ONE read per batch, not one per file. Only its null-ness is used.
  const hadCurrent = (await getCurrentNinaAvatar(userId)) != null

  /*
   * Declare the folders this batch lands in, so a folder that arrived by being DROPPED is a
   * declared folder too (F34 R1, `nina_folders`).
   *
   * Without this the folder still appears — `listNinaAvatarFolders` UNIONs the photograph rows in,
   * so a populated folder needs no declaration to be visible — but it would silently cease to
   * exist the moment its last photograph was removed, which is a surprising way for a directory
   * the operator dragged in to disappear. `declareNinaFolders` is `ON CONFLICT DO NOTHING` on the
   * composite primary key, so calling it on every batch costs one statement and never conflicts.
   *
   * BEFORE the insert, deliberately: if the insert throws, a declared-but-empty folder is a
   * harmless (and now legal) leftover the operator can see and delete, where the reverse order
   * would leave photographs in a folder nothing declared. `Set` because a batch is usually one
   * folder and never needs the same declaration twice; the root is filtered inside
   * `declareNinaFolders`, so a batch of root-level files passes `['']` and writes nothing.
   */
  await declareNinaFolders(userId, [...new Set(records.map((record) => record.folder))])

  const rows = await insertNinaAvatars(
    userId,
    records.map((record) => ({
      blobUrl: record.blobUrl,
      pathname: record.pathname,
      source: 'admin' as const,
      folder: record.folder,
      filename: record.filename,
      sourceKey: record.sourceKey,
      width: record.width,
      height: record.height,
      bytes: record.bytes,
      thumbUrl: record.thumb?.url ?? null,
      thumbPathname: record.thumb?.pathname ?? null,
    })),
  )

  const first = rows[0]
  if (!hadCurrent && first != null) {
    await setCurrentNinaAvatar(userId, first.id)
    scheduleDescribe(userId, first.id)
  }

  revalidatePath('/admin/nina')

  const keyByPathname = new Map(records.map((record) => [record.pathname, record.sourceKey]))
  return {
    ok: true,
    inserted: rows.flatMap((row) => {
      const sourceKey = keyByPathname.get(row.pathname)
      return sourceKey == null ? [] : [{ sourceKey, id: row.id }]
    }),
    skipped: submitted - rows.length,
  }
}

/**
 * Every dedupe key already stored under a folder subtree. The client calls this BEFORE walking a
 * dropped folder, so phase 2's `planFolderUpload` has something to diff against — which is how
 * *"it automatically upload only the new folders and files as optimization"* is actually decided.
 *
 * ── A SERVER ACTION AND NOT A ROUTE HANDLER, EVEN THOUGH IT IS A READ ───────────────────────
 * The Next guide's advice is to reach for a Route Handler for non-mutation requests when you need
 * them to run in PARALLEL. This one runs exactly once per drop, before any upload starts, so serial
 * dispatch costs nothing — and an action keeps `requireAdmin()` as the gate with no new `/api`
 * surface to secure. `proxy.ts` matches neither `/admin` nor `/api/*`
 * (`lib/admin/requireAdmin.ts:13-16`), so every new route is a boundary in its own right; not
 * adding one is the cheaper correctness.
 *
 * ── IT RETURNS A VIEW MODEL, NOT ROWS ───────────────────────────────────────────────────────
 * `AdminManifestEntry`, mapped from phase 1's `NinaAvatarManifestEntry`. The diff matches on
 * `sourceKey`; `id` and `folder` ride along for phase 1's stated reason — *"so that a skipped file
 * can be reported as where it already is rather than as a silent omission: a drop that uploads
 * nothing has to say so, or it looks broken."*
 *
 * ── `truncated` IS `>=` AND NOT `>`, AND THAT IS NOT A BUG ──────────────────────────────────
 * `listNinaAvatarManifest` clamps its own `limit` to `NINA_ADMIN_MANIFEST_MAX`, so there is no
 * "ask for one more than the cap" trick available to distinguish "exactly at the cap" from "over
 * it" — that would take a second `COUNT(*)`. So a subtree holding exactly 2000 photos reports
 * `truncated: true` when it was not. The error is in the safe direction, and phase 1 already
 * documented why truncation is survivable at all: a short manifest makes the diff OVER-report, the
 * extra files are re-PUT, and their inserts are discarded by `ON CONFLICT DO NOTHING`. Slower,
 * never wrong — and only because the dedupe key is a constraint.
 */
export async function listNinaAlbumManifestAction(input: unknown): Promise<AdminManifestResult> {
  const { userId } = await requireAdmin()
  const parsed = albumManifestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a folder path this album accepts.' }

  const entries = await listNinaAvatarManifest(userId, parsed.data.folder)

  return {
    ok: true,
    entries: entries.map((entry) => ({
      id: entry.id,
      folder: entry.folder,
      sourceKey: entry.sourceKey,
    })),
    truncated: entries.length >= NINA_ADMIN_MANIFEST_MAX,
  }
}

/* ============================================================================
 * Phase 6 — folder maintenance. Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * Folder maintenance: create, rename, move, delete, and the bulk move and remove that go with
 * them. R1's second half — *"make the photos much more structured and easier to maintain."*
 *
 * ── EVERY DECISION THAT DOES NOT NEED THE DATABASE IS IN `lib/admin/folderOps.ts` ────────────
 * This module carries `'use server'`, so it may export only async functions and cannot hold a Zod
 * schema or a pure predicate at all (`lib/nina/album.ts:49-62` states the rule). That constraint
 * turns out to be the right architecture anyway: the collision, cycle and depth refusals are the
 * part of this phase most worth testing, and `tests/admin.folderOps.test.ts` tests them without a
 * database. What is left here per action is four moves — gate, validate, plan, run — and it is
 * meant to stay that thin.
 *
 * ── MOVING A PHOTO OR A FOLDER IS AN UPDATE OF THE FOLDER COLUMN. NO BLOB IS COPIED. ────────
 * The plan's Scope section: *"Blob layout stays flat. Folders are a column, not a blob prefix — so
 * a rename is one UPDATE rather than an O(files) copy-and-delete."* So `renameNinaAvatarFolder`
 * rewrites the `folder` cell of every row in a subtree and touches no object in the store; the
 * blob pathnames stay the flat `nina/<userId>/avatar-<id>.<ext>` that `lib/admin/avatars.ts`
 * documents and `isAdminAvatarRequestPathname` guards, and neither the tree nor the grid can tell.
 * Renaming a folder of four hundred photographs is therefore one statement rather than four
 * hundred copies and four hundred deletes, each of which could half-fail — and a half-failed
 * O(files) rename is a folder that exists twice with the photos split between the two.
 *
 * ── ROW FIRST, BLOB SECOND, BEST-EFFORT AND LOGGED ──────────────────────────────────────────
 * `deleteNinaAvatarAction` sets the rule and the reason: *"A failed `del` leaves an orphaned
 * object, which is recoverable... A deleted blob under a live row is a permanently broken image in
 * her album."* Both halves of it get bigger here and both stay right. See `reapAvatarBlobs` for
 * what a *batch* of `del`s makes of it.
 *
 * ── THE FOLDER LIST HAS TWO SOURCES AND NEITHER IS AUTHORITATIVE ────────────────────────────
 * A folder exists if a photograph is filed in it **or** if it is declared in `nina_folders`, and
 * `listNinaAvatarFolders` is the one function that answers the question — it UNIONs both, so
 * disagreement between them degrades instead of corrupting (invariant 11). Every planner below is
 * therefore handed that unioned listing via `existingFolders`, and the corollary is the one
 * ordering rule the table adds: **undeclare a subtree only when it is actually empty.**
 */

/**
 * How many blob URLs go into one `del` call. `del` takes an array, so the whole reap could be one
 * request — and that is exactly what makes the chunk worth having: `del` is all-or-nothing per
 * call, so a single 800-URL request that fails orphans 800 objects, while eight 100-URL requests
 * that fail on the fourth orphan 100 and delete 700. Since the failure mode of a blob reap is
 * "objects nothing references survive in the store", smaller batches are strictly less exposure
 * for the same number of bytes moved.
 */
const ADMIN_BLOB_DEL_BATCH = 100

/**
 * Delete the objects behind rows that are already gone. **Never called before the rows are
 * deleted**, and never allowed to fail an action.
 *
 * ── WHY A BATCH MAKES THE ORPHAN EXPOSURE BIGGER, AND WHY IT IS STILL THE RIGHT ORDER ───────
 * `deleteNinaAvatarAction` weighed one object: *"A failed `del` leaves an orphaned object, which
 * is recoverable (and is what `scripts/blob-reap.mjs` exists for, once it is taught the `nina/`
 * prefix — ruling D4's one follow-up card). A deleted blob under a live row is a permanently
 * broken image in her album."* A recursive folder delete weighs hundreds, and a batch of `del`s is
 * where a partial failure is most likely: the store is a network service, the call is not
 * transactional with Postgres, and nothing about it is atomic across chunks. So what happens when
 * it half-fails is stated here rather than discovered:
 *
 *   · The rows are already gone, which is the outcome the operator asked for. The album is
 *     correct, the tree is correct, and nothing renders a broken image.
 *   · The objects for the chunks that failed stay in the store, referenced by nothing. They cost
 *     storage and they show up in the free tier's usage number; they cannot corrupt anything.
 *   · Every failed chunk is logged with its URLs, so the orphans are *named* in the function log
 *     and not merely inferable from a diff of the store against the table.
 *   · Reaping them is `scripts/blob-reap.mjs`'s job — and it **still does not know the `nina/`
 *     prefix** (ruling D4's open card, restated in the plan's Rollback section). This phase widens
 *     the exposure that card describes from "a failed single delete" to "a failed chunk of a
 *     hundred", which is worth saying out loud and is not a reason to reverse the order: the
 *     reverse order trades a recoverable orphan for a permanently broken image.
 *
 * The thumbnail is reaped beside the original because phase 4 wrote it as a second object and
 * nothing else references it. A row with no thumbnail (anything that predates phase 1) simply
 * contributes one URL instead of two.
 */
async function reapAvatarBlobs(rows: readonly NinaAvatarBlobRef[]): Promise<void> {
  const urls = rows.flatMap((row) =>
    row.thumbUrl == null ? [row.blobUrl] : [row.blobUrl, row.thumbUrl],
  )
  if (urls.length === 0) return

  for (let start = 0; start < urls.length; start += ADMIN_BLOB_DEL_BATCH) {
    const chunk = urls.slice(start, start + ADMIN_BLOB_DEL_BATCH)
    try {
      await del(chunk)
    } catch (cause) {
      console.error(
        `[f34] ${chunk.length} album rows deleted, blobs left behind ` +
          '(blob:reap does not know the nina/ prefix yet — ruling D4)',
        chunk,
        cause,
      )
    }
  }
}

/** Her current photo, but only when it is inside `folder`'s tree. `null` otherwise. */
async function currentPhotoInFolder(
  userId: string,
  folder: string,
): Promise<CurrentPhotoRef | null> {
  const row = await getCurrentNinaAvatar(userId)
  if (row == null || !isInFolderTree(row.folder, folder)) return null
  return { id: row.id, folder: row.folder, filename: row.filename }
}

/** Her current photo, but only when its id is in `ids`. `null` otherwise. */
async function currentPhotoAmong(
  userId: string,
  ids: readonly string[],
): Promise<CurrentPhotoRef | null> {
  const row = await getCurrentNinaAvatar(userId)
  if (row == null || !ids.includes(row.id)) return null
  return { id: row.id, folder: row.folder, filename: row.filename }
}

/**
 * Every folder the album knows about — the planners' collision universe.
 *
 * `listNinaAvatarFolders` UNIONs the folders the photograph rows imply with the declarations in
 * `nina_folders`, and that is exactly the list a collision must be decided against: the
 * declarations alone would let "create" claim a folder that already holds three hundred
 * photographs, and the photograph rows alone would let the same empty folder be created twice.
 * A `photos: 0` entry is a legal result and is deliberately not filtered out here.
 */
async function existingFolders(userId: string): Promise<string[]> {
  return (await listNinaAvatarFolders(userId)).map((row) => row.folder)
}

/**
 * "New folder".
 *
 * ── AN EMPTY FOLDER IS DURABLE, AND THAT IS WHAT THIS ACTION WRITES ─────────────────────────
 * This docstring used to argue the opposite, and the argument was honest about the design it was
 * written against: a folder was only the `folder` column of the rows in it, so an empty one had
 * nothing to store and "create" could not insert anything. **The owner overruled that**, phase 1
 * added the `nina_folders` table, and a folder is now a thing that can be *declared* as well as
 * implied. So this action writes: one declaration per folder, and the folder survives a reload
 * with nothing in it.
 *
 * The rest of what it does was always the real work and is unchanged: it agrees with the server on
 * the normalised path (so the client and the server cannot spell the same folder two ways), it
 * bounds the depth against phase 2's constant, and it refuses a collision **against the folders
 * that exist right now** rather than against the list the page happened to render with.
 *
 * `revalidatePath` then makes the tree agree with that list — the folder list is a server read, a
 * concurrent upload may have added folders since this page rendered, and the re-render that ships
 * in the action's own response (see the Next.js Server Actions guide: `revalidatePath` includes a
 * fresh RSC payload in the same roundtrip) is the cheapest way to deliver both the new declaration
 * and whatever else has appeared.
 */
export async function createNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That folder name is out of range.' }

  const plan = planFolderCreate({
    parent: parsed.data.parent,
    name: parsed.data.name,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }

  /*
   * The write that makes the folder real. One row in `nina_folders`, and after it the folder
   * survives a reload with nothing in it — which is the whole reason that table exists.
   *
   * **The ancestors are declared too, and that is not defensive padding.** Creating `a/b/c` when
   * only `a` holds photographs must leave `a/b` existing as well, or the tree pane would show
   * `a`, synthesize `a/b` from `c`'s path, and then lose `a/b` the moment `c` is deleted — an
   * intermediate folder that vanishes while its parent and child both survive. `folderAncestors`
   * is phase 2's and returns every STRICT ancestor shallowest-first **with the album root included
   * as `''`** — which is fine to pass straight through, because `declareNinaFolders` filters the
   * root itself (`nina_folders` never stores it). Do not "tidy" that by slicing the first element
   * off here: the filter belongs in the one function that owns the rule.
   *
   * The return value (how many declarations were NEW) is deliberately dropped: `planFolderCreate`
   * has already refused a collision against the unioned listing, so a zero here means another tab
   * created the same folder between the read and this write — which is the outcome the operator
   * wanted either way, and reporting it as a failure would be a lie about the end state.
   */
  await declareNinaFolders(userId, [...folderAncestors(plan.folder), plan.folder])

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: 0 }
}

/**
 * Rename a folder — one UPDATE over the subtree, no blob touched.
 *
 * The refusals are `planFolderRename`'s and they are argued there: the album root is not a folder,
 * a rename onto an occupied path is an unmergeable merge, and the depth bound is checked against
 * the deepest descendant rather than the destination. A rename of a folder that holds no rows
 * (one the operator just created) updates zero rows, rewrites its declaration, and is still `ok`.
 */
export async function renameNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderRenameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That folder name is out of range.' }

  const plan = planFolderRename({
    folder: parsed.data.folder,
    name: parsed.data.name,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }
  if (plan.folder === parsed.data.folder) return { ok: true, folder: plan.folder, count: 0 }

  /*
   * `renameNinaAvatarFolder` (phase 1's name — rename and move are one statement, because renaming
   * IS moving to a sibling path) returns a discriminated result, not a bare count.
   *
   * Its `'root'` and `'cycle'` refusals are the same two `planRelocation` already refused above,
   * with worse messages, so reaching them here would mean the planner and the statement disagree.
   * They are still handled rather than asserted away — phase 1 kept those guards deliberately, on
   * the `setCurrentNinaAvatar` posture that a cheap guard which could argue it is redundant is
   * still worth having, and the honest way to consume one is to consume it.
   *
   * **`moved: 0` is a SUCCESS**, not a failure: a folder can hold nothing but subfolders that hold
   * nothing, or — since `nina_folders` — can be a declared folder with no photographs in it at all.
   * Either way there are no rows to move and the rename still has to happen. Reporting it as an
   * error would make renaming an empty branch look broken.
   */
  const moved = await renameNinaAvatarFolder(userId, parsed.data.folder, plan.folder)
  if (!moved.ok) return { ok: false, error: 'That folder cannot be renamed to that.' }

  /*
   * The declarations follow the photographs, and BOTH halves are one rename.
   *
   * `renameNinaFolderSubtree` rewrites `nina_folders` with the same `folderSubtree` predicate
   * phase 1 uses for the rows — the same one deliberately, because a rename that matched the
   * photograph rows with `left()` and the declarations with `LIKE` would drift on exactly the
   * folder name (`100%`) that motivated `left()` in the first place.
   *
   * **Not in a transaction, and the failure mode is why that is tolerable.** These are two
   * statements over neon-http; if the second never runs, the photographs have moved and a stale
   * declaration is left at the old path. `listNinaAvatarFolders` UNIONs, so the visible result is
   * the new folder (carried by its photographs) plus an empty folder at the old name — untidy, and
   * fixable by deleting it, which is a state the operator can see and act on. The reverse order
   * would be worse: declarations at the new path with the photographs still at the old one reads
   * as two folders where one is a duplicate. Rows first, declarations second.
   *
   * Its count is dropped for the same reason `count` reports `moved.moved`: the operator asked
   * about photographs, and "0 declarations rewritten" is true of every folder that arrived by
   * being dropped.
   */
  await renameNinaFolderSubtree(userId, parsed.data.folder, plan.folder)

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: moved.moved }
}

/**
 * Move a folder under a different parent — the same UPDATE as a rename, with a different
 * destination, and the same four refusals for the same reasons (`planFolderMove`).
 *
 * `parent: ''` moves it to the album root, which is why the schema takes a `folderPathSchema` and
 * not a non-empty string: the root is a legal destination and an illegal *source*.
 */
export async function moveNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderMoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a folder path.' }

  const plan = planFolderMove({
    folder: parsed.data.folder,
    parent: parsed.data.parent,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }
  if (plan.folder === parsed.data.folder) return { ok: true, folder: plan.folder, count: 0 }

  /* One statement for both verbs — see `renameNinaAlbumFolderAction` above for why `moved: 0` is
   * a success and why the two data-layer refusals are handled rather than asserted away. */
  const moved = await renameNinaAvatarFolder(userId, parsed.data.folder, plan.folder)
  if (!moved.ok) return { ok: false, error: 'That folder cannot be moved there.' }

  /* And the declarations follow, exactly as in a rename — a move IS a rename to a different
   * parent, so an undeclared destination would lose an empty moved folder on the next reload. */
  await renameNinaFolderSubtree(userId, parsed.data.folder, plan.folder)

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: moved.moved }
}

/**
 * Move the selected photos into a folder. **An UPDATE of one column; no blob is copied.**
 *
 * No planner: nothing about this can collide (two photos in one folder is the normal state, not a
 * merge), nothing can cycle, and no descendant moves, so the destination's own bounds — depth,
 * length, grammar — are the whole check and `folderPathSchema` is where they live. This is also
 * the *sanctioned* way to merge two folders, which `planRelocation` refuses to do by rename: the
 * choice is made per photo, in front of the grid, and it is undone the same way.
 *
 * Nothing is declared here, and nothing needs to be: the destination is a folder the tree already
 * offered, and once the rows carry it the photographs are its evidence. A declaration that already
 * existed is left exactly as it was.
 *
 * `count` is what the statement reported, not `ids.length`. An id that has gone away since the
 * page rendered is not an error — the photo is not in that folder either way — and a caller that
 * wants to know reads the number back.
 */
export async function moveNinaAvatarsAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = photoMoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a list of album photos.' }

  const count = await moveNinaAvatarsToFolder(userId, parsed.data.ids, parsed.data.folder)
  revalidatePath('/admin/nina')
  return { ok: true, folder: parsed.data.folder, count }
}

/**
 * Delete a folder and everything under it.
 *
 * ── THE CURRENT PHOTO CANNOT BE REMOVED, AND THIS SURFACES IT INSTEAD OF HALF-SUCCEEDING ────
 * `deleteNinaAvatar`'s WHERE clause has refused her current photo since F33 —
 * *"`eq(ninaAvatars.isCurrent, false)` in the WHERE clause is what makes 'zero current avatars'
 * unreachable rather than repaired"* — and phase 1's recursive delete carries the same clause, so
 * at the SQL layer this cannot take her face no matter what this function does. What it *can* do is
 * be honest, because a recursive delete that silently leaves one row behind looks like a delete
 * that half-worked, and the operator's next move is to try again and watch it half-work
 * identically.
 *
 * So the stand is taken **before any row is deleted**, and `currentPhotoRefusal` owns it: by
 * default the whole operation is refused, naming the photo and both fixes, with nothing deleted
 * and nothing to undo. With `keepCurrent` the operator has read that sentence and answered it; the
 * delete then runs and **leaves the folder holding exactly that one photo**, and `note` says which
 * photo stayed and why. Refusing beats half-succeeding here for a specific reason: a partial
 * delete of hundreds of rows has no inverse, and the rows it took are not coming back.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * `reapAvatarBlobs` runs after the rows are gone and cannot fail this action; its header carries
 * what happens when a chunk of `del`s fails, and points at ruling D4's open card for
 * `scripts/blob-reap.mjs`, which still does not know the `nina/` prefix.
 *
 * The album root is refused outright. `folder: ''` would mean "delete every photo she has", and
 * that button does not belong on a screen whose job is organising them; the folders inside the
 * root are each deletable on their own.
 */
export async function deleteNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a folder path.' }
  const { folder, keepCurrent } = parsed.data

  if (folder === '') {
    return {
      ok: false,
      error: 'The album root is not a folder. Delete the folders inside it one at a time.',
    }
  }

  const current = await currentPhotoInFolder(userId, folder)
  const refusal = currentPhotoRefusal(current, keepCurrent)
  if (refusal != null) return { ok: false, error: refusal }

  const removed = await deleteNinaAvatarsInFolderTree(userId, folder)
  await reapAvatarBlobs(removed)

  /*
   * Undeclare the subtree — but ONLY when it is actually empty, which is exactly `current == null`.
   *
   * This is the one real trap `nina_folders` adds, and phase 1's `deleteNinaFolderSubtree` header
   * states the same rule from the other side. Under `keepCurrent` her current photograph stayed
   * behind, so the folder still holds a row and must go on existing; undeclaring it here would
   * leave a folder with a photograph in it and no declaration — which `listNinaAvatarFolders`
   * would paper over, because the photograph carries the folder, so the bug would stay invisible
   * until that last photograph was moved or made non-current and the folder silently disappeared.
   * A UNION that absorbs disagreement is a reason to be careful about creating it, not a licence.
   *
   * `current == null` is already the discriminator the return value below uses to decide where to
   * send the explorer next, so this is the same fact read twice rather than a second condition to
   * keep in step with the first.
   */
  if (current == null) await deleteNinaFolderSubtree(userId, folder)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    // Where to look next. When her current photo stayed behind the folder still exists, so the
    // explorer stays in it; otherwise the folder is gone and its parent is the nearest thing left.
    folder: current == null ? folderParent(folder) : folder,
    count: removed.length,
    note: current == null ? undefined : currentPhotoKeptNote(current),
  }
}

/**
 * Remove the selected photos. The bulk form of `deleteNinaAvatarAction`, and the same two rules:
 * her current photo is refused up front by `currentPhotoRefusal` rather than silently skipped by
 * the statement's WHERE, and the blobs are reaped after the rows in best-effort chunks.
 *
 * One statement rather than a loop over `deleteNinaAvatar`: 200 selected photos would be 200
 * neon-http round trips inside one Server Action, which is both slow enough to hit the function's
 * duration limit and 200 chances to fail halfway with no record of where.
 *
 * The folders the removed rows were filed in are NOT undeclared. A row-by-row remove says nothing
 * about whether the operator is done with the folder, and an emptied folder that stays on the tree
 * is the outcome they can act on — deleting the folder is the gesture that undeclares it.
 */
export async function removeNinaAvatarsAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = photoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a list of album photos.' }
  const { ids, keepCurrent } = parsed.data

  const current = await currentPhotoAmong(userId, ids)
  const refusal = currentPhotoRefusal(current, keepCurrent)
  if (refusal != null) return { ok: false, error: refusal }

  const removed = await deleteNinaAvatars(userId, ids)
  await reapAvatarBlobs(removed)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    count: removed.length,
    note: current == null ? undefined : currentPhotoKeptNote(current),
  }
}
