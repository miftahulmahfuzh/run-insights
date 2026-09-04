'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

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
  getCurrentNinaAvatar,
  getNinaAvatar,
  insertNinaAvatars,
  listNinaAvatarManifest,
  setCurrentNinaAvatar,
  setNinaAvatarDescription,
  updateNinaAvatarCrop,
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
