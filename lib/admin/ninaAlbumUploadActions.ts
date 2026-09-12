'use server'

import { revalidatePath } from 'next/cache'

import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { scheduleDescribe } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  albumManifestSchema,
  avatarBatchRegisterSchema,
  type AvatarBatchRecord,
} from '@/lib/admin/schema'
import { NINA_ADMIN_MANIFEST_MAX } from '@/lib/nina/album'
import {
  declareNinaFolders,
  getCurrentNinaAvatar,
  insertNinaAvatars,
  listNinaAvatarManifest,
  setCurrentNinaAvatar,
} from '@/lib/nina/queries'

/**
 * The folder-upload bookkeeping: register a whole chunk of a folder upload in ONE call, and read
 * back the manifest the client diffs a dropped folder against. F34's *"hundreds of profile pics"*
 * and *"it automatically upload only the new folders and files as optimization"*, server side.
 *
 * The blob PUTs themselves go through `app/api/admin/nina/upload/route.ts` and are genuinely
 * parallel; these two actions are the serial bookkeeping half. Their result interfaces
 * (`AdminManifestEntry`, `AdminBatchRegisterResult`, `AdminManifestResult`) stay private here — a
 * `'use server'` module may export only async functions (`lib/nina/album.ts:144-148`) — so the
 * client knows them through the actions' inferred return types, exactly as before the split.
 * Nothing outside the layer imports this module; everything reaches it through the
 * `lib/admin/ninaAlbumActions.ts` barrel.
 */

/**
 * One already-uploaded file, as the client's diff needs it.
 *
 * Structurally identical to phase 1's `NinaAvatarManifestEntry` and declared here anyway, so that
 * `lib/nina/queries.ts` — a module that imports `db` — never appears in a client component's import
 * graph, not even as an erased `import type`. `app/admin/nina/page.tsx:26-28` states the same rule
 * for `NinaAvatarRow` and `AlbumPhoto`: the client gets a view model, not the row.
 */
interface AdminManifestEntry {
  id: string
  folder: string
  sourceKey: string
}

/** `registerNinaAvatarsAction`'s result. Its own shape, because the client needs two counts. */
interface AdminBatchRegisterResult extends AdminActionResult {
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
interface AdminManifestResult extends AdminActionResult {
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
 * Because it un-currents and re-currents on EVERY insert (`lib/nina/queries/avatars.ts`), and it has
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
