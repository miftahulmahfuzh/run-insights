# Phase 3: Repair existing production rows and delete freed files

**Plan set:** `PROFPIC_POINTER_SYNC_PLAN.md`
**Analysis:** `20261003-143305-P7Q2_code_analyzer.md`
**Satisfies:** R1, R2, R3. Every existing album row made from a Media photo ends up pointing at that photo's current file (R1). `jWWu8vkl09fT`'s v2 shows on `/nina/about` with no click needed (R2). The v1 objects those rows were keeping alive get deleted (R3).
**Depends on:** none. The script reads and writes production rows directly and imports nothing from `lib/`. Phases 1–2 stop *new* staleness. This phase repairs what already exists. See "Ordering against deploys" under Verification.
**Difficulty:** NORMAL
**Package:** `scripts`

---

## Goal

A one-off, idempotent repair script, `scripts/nina-profpic-pointer-repair.mjs`, does three things:
- relinks every legacy album copy whose Media original is still alive
- refreshes every stale album pointer
- refreshes every stale chat reference

It writes all of these in **one** Postgres transaction. Then it deletes each object those rows stopped naming, but only when no row still names it. After this phase runs against production:
- 0 legacy copies with a live original remain
- 0 stale pointers and 0 stale references remain
- current avatar `Daofejusg4Xa` shows `jWWu8vkl09fT`'s v2
- a JSON backup of every changed row's old values sits outside the repo

## Interface Contract

**Deletes:** nothing in code. At run time it deletes Vercel Blob objects that no row names any more after the repair (see Step 1, §8).
**Renames:** none.
**Creates:**
- `scripts/nina-profpic-pointer-repair.mjs`, which exports these pure helpers: `CHAT_PHOTO_SOURCE_KEY_PREFIX`, `parseRepairArgs`, `isInside`, `resolveBackupPath`, `isOriginalImage`, `planRepair`, `collectReleaseCandidates`, `summarizePlan`
- `package.json` script `nina:profpic-pointer-repair`
- `tests/nina.profpicPointerRepair.test.ts`

**Signature changes:** none.
**Requires (from earlier phases):** nothing. `depends_on` is empty, and the script works on today's schema (`lib/db/schema/nina/avatars.ts:266`, `lib/db/schema/nina/chat.ts:606`).
**Column semantics this script writes.** Reconciled: these are the plan set's ONE column contract
(index Decisions D1/D2). Phase 1's `relinkNinaAvatarToImage` and Phase 2's replace propagation write
the same shapes.
- **Pointer contract — legacy relink and stale pointer refresh** (`nina_avatars`), one SET list:
  - `blob_url, pathname, width, height, bytes` ← Media row
  - `source_image_id` ← Media id (`relink-legacy`; on `refresh-pointer` the WHERE already pins it)
  - NULL: `description, search_keywords, negative_search_keywords, description_embedding, content_hash, thumb_url, thumb_pathname`
  - `crop_scale/x/y` ← NULL **iff** `(width, height)` differs from the Media row's, otherwise kept
  - untouched: `id, is_current, folder, source_key, source, filename, announced_at, created_at`
- **Reference contract — stale reference refresh** (`nina_message_images`). Matched via `source_image_id`, or via `source_avatar_id` when `source_image_id` is NULL. A reference mirrors its target's post-repair values:
  - `blob_url, pathname, width, height, bytes, content_hash, description` ← the target
  - `perceptual_hash, perceptual_sig` ← the target image row's, or NULL when the target is a plain album row (which has no perceptual columns)
  - When the referenced album row is a legacy copy or a pointer, the target is **that album row's Media original after this run's repair**, not the album row's pre-repair bytes (and its prose is the Media row's — a pointer's own prose is dead).
  - provenance columns untouched
  - Why `description` is copied rather than nulled or left: readers read a reference's OWN `description` (the `gateway.ts` history read, `send.ts`/`turnrevive.ts`; no provenance redirect), and a reference is born by copying its target's (`resolveAttachment`). Copying gives her the prose that matches the bytes the row now shows; the old prose described the old bytes. Phase 2's replace uses the same rule, which there yields NULL because the original's prose was just retracted.
- "Stale" means `pathname IS DISTINCT FROM target.pathname OR blob_url IS DISTINCT FROM target.blob_url`. A row is not stale just because its dims or bytes differ: 13 production references carry NULL `width/height/bytes` with the correct pathname, and they are left alone (see Handoffs).

**Leaves alone (owned by others):**
- `lib/nina/queries/avatars.ts`, `lib/admin/ninaAlbumAvatarActions.ts`, `lib/nina/avatarAdopt.ts` (Phase 1)
- `lib/nina/queries/images.ts`, `lib/nina/photoshopResolve.ts`, `updateNinaAvatarBlob` (Phase 2)
- everything else under `lib/` and `app/`

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-profpic-pointer-repair.mjs` | create | the repair script: pure planner plus I/O `main()`, dry-run by default |
| `package.json:37` | modify | add `"nina:profpic-pointer-repair"` after `"nina:dedupe-avatars"` |
| `tests/nina.profpicPointerRepair.test.ts` | create | unit tests for the pure planner, argument parser and backup-path guard. No DB and no network, following the precedent of `tests/nina.chatPhotoAudit.test.ts` |

The test file is a third file beyond the index's "~2". It covers only the pure half of a script that writes production, which `tests/nina.dedupeMedia.test.ts` does for its sibling script. It is not scope creep.

## Production facts this plan was validated against (read-only SELECTs, 2026-10-03)

The queries were run from the main repo root through the Neon HTTP driver, with no writes:

| Class | Count | Notes |
|---|---|---|
| Legacy copies (`source_key LIKE 'chat-photo:%' AND source_image_id IS NULL`) | 21 | all 21 have a live **original** Media row. 0 have a thumbnail. 3 have different dims from their Media row. 18 have a crop. 1 is current (`Daofejusg4Xa` → `jWWu8vkl09fT`) |
| Stale pointers (pathname/url differs) | 11 | all 11 differ in pathname. 3 differ in dims. 8 have a crop. 0 point at a non-original |
| Stale image→image references (pathname/url differs) | 13 | 0 point at a non-original. 0 rows carry both provenance columns |
| Image→avatar references (`source_image_id IS NULL`) | 28 | 0 are stale *today*. **7 become stale the moment their album row is repaired** (6 point at legacy copies, 1 at a stale pointer), so the same transaction must move them. This is why the planner resolves avatar references against post-repair bytes |
| Legacy objects also named by a chat row | 5 objects, 6 rows | exactly those 6 cascade references. Without the cascade, those 5 objects would stay `shared` and R3 would fail for them |
| Current avatar vs `jWWu8vkl09fT` | `Daofejusg4Xa`, `blob_url` differs | expected to match after `--apply` |

`crop_scale` comes back from the driver as a `numeric` string (e.g. `'1.204'`), and `description_embedding` comes back as a `vector` string. Both are carried verbatim into the backup.

Driver mechanics, checked on `@neondatabase/serverless` 1.1.0 in a `readOnly: true` transaction against production:
- nested `sql` fragments (`${mediaGuard}`) compose
- `<> all(${[]}::int[])` with an empty array is `true`
- `= any(${ids}::text[])` binds a JS array
- `sql.transaction([...])` returns one row-array per statement, which is what the `RETURNING id` check reads

## Implementation Steps

### Step 1: Create the repair script
**File:** `scripts/nina-profpic-pointer-repair.mjs` (new)
**Change:** A new script in the shape of `scripts/nina-dedupe-media.mjs`:
- raw SQL through `@neondatabase/serverless` and `del` from `@vercel/blob`, both via `createRequire`
- `--env-file=.env.local` for env loading
- dry run by default
- entry-point guard so the test can import the pure half

It reuses `isStoreUrl` and `releaseDecision` from `./nina-dedupe-plan.mjs`, so "may this object be deleted" has one definition across the repair scripts. Its gate is the six-column, user-scoped check that `isBlobPathnameReferenced` (`lib/nina/queries/images.ts:1336`) and `scripts/blob-reap.mjs` use, plus the `nina_turns.args` / `nina_memory_slots.value` jsonb backstop from `scripts/nina-dedupe-media.mjs:582-596`. The backstop only makes the gate stricter; it never makes it looser.

**Code:**
```js
#!/usr/bin/env node
/**
 * One-off production repair: make every album row that came from a Media photo point at that
 * photo's CURRENT file, move every chat reference that re-shows one along with it, and delete the
 * objects those rows stop naming.
 *
 *   npm run nina:profpic-pointer-repair                          # dry run, always — writes nothing
 *   npm run nina:profpic-pointer-repair -- --apply               # backup JSON, one transaction, deletes
 *   npm run nina:profpic-pointer-repair -- --apply --backup /abs/path/outside/the/repo.json
 *
 * NOT A TEST, and never part of `npm test`. With `--apply` it rewrites production rows and
 * DESTROYS Blob objects irreversibly. Same line `scripts/blob-reap.mjs` and
 * `scripts/nina-dedupe-media.mjs` draw.
 *
 * DATABASE_URL IS PRODUCTION. There is one database in this repo. Every number this prints is a
 * production number and every `--apply` write is a production write. Read the dry run first.
 *
 * ── WHAT IS BROKEN (profpic-pointer-sync, 2026-10-03) ────────────────────────────────────────
 *  1. LEGACY COPIES. Before 2026-09-17 "Set as her profile picture" `put` a second object and wrote
 *     an album row with `source_key 'chat-photo:<imageId>'` and `source_image_id NULL`. Adoption
 *     finds that row by `source_key` and re-currents it, so a replaced Media photo's v1 comes back.
 *  2. STALE POINTERS. A pointer (`source_image_id` set) copies the Media row's bytes columns once,
 *     at link time. Replace moves only the Media row.
 *  3. STALE REFERENCES. A chat row with `source_image_id` (or `source_avatar_id`) copied its
 *     original's `blob_url`/`pathname` the same way.
 * Each of those rows still NAMES the old object, so `releaseBlobIfUnreferenced` answers 'shared'
 * and v1 is kept forever. Repairing the rows is what makes the old objects deletable.
 *
 * ── WHAT IT DOES, IN ORDER ────────────────────────────────────────────────────────────────────
 *  1. pre-flight: args, env, non-empty album, backup path outside the repo (`--apply` only)
 *  2. load every `nina_avatars` and `nina_message_images` row's bytes + provenance columns
 *  3. plan (pure — `planRepair`): legacy relinks, pointer refreshes, then reference refreshes
 *     resolved against the album rows' POST-repair bytes (an image→avatar reference to a legacy
 *     copy is not stale today and becomes stale the instant the copy is relinked)
 *  4. report every op and every release candidate with a predicted verdict. DRY RUN STOPS HERE.
 *  5. `--apply`: write the backup JSON of every row about to change (full rows, `select *`) and
 *     read it back BEFORE any write
 *  6. ONE `sql.transaction([...])` — all-or-nothing. Every UPDATE is guarded on the row's old
 *     `pathname`/`blob_url` and on the target still holding the planned bytes, and RETURNs its id,
 *     so a row a concurrent writer moved is skipped (reported), never clobbered
 *  7. ROW FIRST, BLOB SECOND: for each object an APPLIED op dropped, ask the six reference columns
 *     (+ the jsonb backstop) again, now that the transaction is committed, and `del` only at zero
 *  8. print every current avatar against its Media original
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────────────────────────
 * A second run plans 0 ops: every relinked row is now a pointer whose bytes equal its Media row's,
 * and every reference equals its target. A legacy copy whose Media original is gone (or is itself
 * a reference) is reported as skipped and left exactly as it is — it owns the only copy of its
 * bytes.
 *
 * ── WHY RAW SQL ───────────────────────────────────────────────────────────────────────────────
 * Same reason `scripts/nina-dedupe-media.mjs`'s header gives: a `.mjs` under plain `node` cannot
 * resolve `@/` or load anything coupled to `next/*`, so `lib/nina/queries/*` is out of reach.
 * The column semantics are spelled out on each statement instead, and mirror Phase 1's relink and
 * Phase 2's replace propagation.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { isStoreUrl, releaseDecision } from './nina-dedupe-plan.mjs'

const require = createRequire(import.meta.url)

/** Mirrors `NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX` (`lib/nina/avatarAdopt.ts:63`); kept in step by hand. */
export const CHAT_PHOTO_SOURCE_KEY_PREFIX = 'chat-photo:'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ── pure half ──────────────────────────────────────────────────────────────────────────────── */

/** `--apply` and `--backup <path>`; anything else is refused rather than ignored. */
export function parseRepairArgs(argv) {
  let apply = false
  let backup = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') {
      apply = true
    } else if (arg === '--backup') {
      const value = argv[i + 1]
      if (value == null || value.startsWith('--')) {
        throw new Error('--backup needs a file path')
      }
      backup = value
      i++
    } else {
      throw new Error(`unknown flag ${arg} — this script takes --apply and --backup <path> only`)
    }
  }
  return { apply, backup }
}

/** Is `child` the directory `parent` or anything under it. */
export function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Where the backup goes. The file holds production rows — private prose and embeddings included —
 * so it must never land somewhere `git add -A` would pick it up.
 */
export function resolveBackupPath(requested, now = new Date(), repoRoot = REPO_ROOT) {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const target = path.resolve(
    requested ?? path.join(os.tmpdir(), `nina-profpic-pointer-repair-${stamp}.json`),
  )
  if (isInside(target, repoRoot)) {
    throw new Error(
      `refusing to write the backup inside the repository (${target}) — it holds production rows`,
    )
  }
  return target
}

/** Mirrors `isOriginalPhoto()` (`lib/nina/queries/images.ts:525`): neither provenance column set. */
export function isOriginalImage(row) {
  return row.sourceImageId == null && row.sourceAvatarId == null
}

const bytesOf = (row) => ({
  blobUrl: row.blobUrl,
  pathname: row.pathname,
  width: row.width,
  height: row.height,
  bytes: row.bytes,
})

const namesSameObject = (a, b) => a.pathname === b.pathname && a.blobUrl === b.blobUrl

/**
 * Plan the repair. Pure: two arrays of camelCase rows in, ops out.
 *
 * `avatars`: `{ id, userId, sourceKey, sourceImageId, isCurrent, blobUrl, pathname, width, height,
 *   bytes, thumbUrl, thumbPathname, cropScale, cropX, cropY, contentHash, description }`
 * `images`: `{ id, userId, blobUrl, pathname, width, height, bytes, contentHash, description,
 *   perceptualHash, perceptualSig, sourceImageId, sourceAvatarId }`
 *
 * Returns `{ avatarOps, refOps, skipped }`. Every op carries `drops`: the `{ userId, pathname,
 * blobUrl }` objects the row stops naming once the op is applied.
 */
export function planRepair({ avatars, images }) {
  const imageById = new Map(images.map((row) => [row.id, row]))
  const avatarById = new Map(avatars.map((row) => [row.id, row]))
  const avatarOps = []
  const refOps = []
  const skipped = []
  /** album row id → the Media original whose bytes it shows AFTER this run. */
  const avatarMedia = new Map()

  for (const a of avatars) {
    let op
    let mediaId
    if (a.sourceImageId != null) {
      op = 'refresh-pointer'
      mediaId = a.sourceImageId
    } else if (
      typeof a.sourceKey === 'string' &&
      a.sourceKey.startsWith(CHAT_PHOTO_SOURCE_KEY_PREFIX)
    ) {
      op = 'relink-legacy'
      mediaId = a.sourceKey.slice(CHAT_PHOTO_SOURCE_KEY_PREFIX.length)
    } else {
      continue
    }

    const media = imageById.get(mediaId)
    if (media == null || media.userId !== a.userId) {
      skipped.push({ table: 'nina_avatars', id: a.id, reason: `media ${mediaId} is gone` })
      continue
    }
    if (!isOriginalImage(media)) {
      skipped.push({
        table: 'nina_avatars',
        id: a.id,
        reason: `media ${mediaId} is a reference, not an original`,
      })
      continue
    }
    avatarMedia.set(a.id, media)

    if (op === 'refresh-pointer' && namesSameObject(a, media)) continue

    const drops = []
    if (a.pathname !== media.pathname) {
      drops.push({ userId: a.userId, pathname: a.pathname, blobUrl: a.blobUrl })
    }
    if (a.thumbPathname != null) {
      drops.push({ userId: a.userId, pathname: a.thumbPathname, blobUrl: a.thumbUrl })
    }
    avatarOps.push({
      op,
      id: a.id,
      userId: a.userId,
      sourceKey: a.sourceKey,
      isCurrent: a.isCurrent === true,
      mediaId: media.id,
      from: bytesOf(a),
      to: bytesOf(media),
      dimsChanged: a.width !== media.width || a.height !== media.height,
      hadCrop: a.cropScale != null || a.cropX != null || a.cropY != null,
      drops,
    })
  }

  for (const r of images) {
    let target
    let op
    let sourceId
    if (r.sourceImageId != null) {
      op = 'refresh-image-ref'
      sourceId = r.sourceImageId
      const original = imageById.get(r.sourceImageId)
      if (original == null || original.userId !== r.userId) {
        skipped.push({
          table: 'nina_message_images',
          id: r.id,
          reason: `source image ${r.sourceImageId} is gone`,
        })
        continue
      }
      if (!isOriginalImage(original)) {
        skipped.push({
          table: 'nina_message_images',
          id: r.id,
          reason: `source image ${r.sourceImageId} is itself a reference`,
        })
        continue
      }
      target = { table: 'nina_message_images', row: original }
    } else if (r.sourceAvatarId != null) {
      op = 'refresh-avatar-ref'
      sourceId = r.sourceAvatarId
      const album = avatarById.get(r.sourceAvatarId)
      if (album == null || album.userId !== r.userId) {
        skipped.push({
          table: 'nina_message_images',
          id: r.id,
          reason: `source avatar ${r.sourceAvatarId} is gone`,
        })
        continue
      }
      const media = avatarMedia.get(album.id)
      target =
        media != null
          ? { table: 'nina_message_images', row: media }
          : { table: 'nina_avatars', row: album }
    } else {
      continue
    }

    const t = target.row
    if (namesSameObject(r, t)) continue

    const fromImage = target.table === 'nina_message_images'
    refOps.push({
      op,
      id: r.id,
      userId: r.userId,
      sourceId,
      guard: { table: target.table, id: t.id },
      from: { blobUrl: r.blobUrl, pathname: r.pathname },
      to: {
        ...bytesOf(t),
        contentHash: t.contentHash ?? null,
        /* A reference mirrors its target's prose — readers read the row's own column. */
        description: t.description ?? null,
        perceptualHash: fromImage ? (t.perceptualHash ?? null) : null,
        perceptualSig: fromImage ? (t.perceptualSig ?? null) : null,
      },
      drops:
        r.pathname !== t.pathname
          ? [{ userId: r.userId, pathname: r.pathname, blobUrl: r.blobUrl }]
          : [],
    })
  }

  return { avatarOps, refOps, skipped }
}

/** Every object the given ops drop, once per `(userId, pathname)`, in first-seen order. */
export function collectReleaseCandidates(ops) {
  const seen = new Set()
  const out = []
  for (const op of ops) {
    for (const drop of op.drops) {
      const key = `${drop.userId}\u0000${drop.pathname}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...drop })
    }
  }
  return out
}

/** The four counts the phase checks against the analysis, plus the skips. */
export function summarizePlan(plan) {
  const count = (ops, name) => ops.filter((op) => op.op === name).length
  return {
    legacyRelinks: count(plan.avatarOps, 'relink-legacy'),
    pointerRefreshes: count(plan.avatarOps, 'refresh-pointer'),
    imageRefRefreshes: count(plan.refOps, 'refresh-image-ref'),
    avatarRefRefreshes: count(plan.refOps, 'refresh-avatar-ref'),
    skipped: plan.skipped.length,
  }
}

/* ── I/O half ───────────────────────────────────────────────────────────────────────────────── */

const tail = (p) => (typeof p === 'string' ? p.slice(p.lastIndexOf('/') + 1) : String(p))

function avatarStatement(sql, op) {
  const mediaGuard = sql`
    exists (select 1 from nina_message_images i
             where i.id = ${op.mediaId} and i.user_id = ${op.userId}
               and i.pathname = ${op.to.pathname} and i.blob_url = ${op.to.blobUrl}
               and i.source_image_id is null and i.source_avatar_id is null)`
  if (op.op === 'relink-legacy') {
    /* A legacy copy becomes a pointer: the Media row's bytes, its id, and none of the copy's own
     * prose/keywords/embedding/hash/thumbnail — the Media row is the only place a pointer's prose
     * lives (`avatarPointer.ts`). id, is_current, folder, source_key survive. */
    return sql`
      update nina_avatars
         set blob_url = ${op.to.blobUrl}, pathname = ${op.to.pathname},
             width = ${op.to.width}, height = ${op.to.height}, bytes = ${op.to.bytes},
             source_image_id = ${op.mediaId},
             description = null, search_keywords = null, negative_search_keywords = null,
             description_embedding = null, content_hash = null,
             thumb_url = null, thumb_pathname = null,
             crop_scale = case when ${op.dimsChanged}::boolean then null else crop_scale end,
             crop_x = case when ${op.dimsChanged}::boolean then null else crop_x end,
             crop_y = case when ${op.dimsChanged}::boolean then null else crop_y end
       where id = ${op.id} and user_id = ${op.userId}
         and source_image_id is null and source_key = ${op.sourceKey}
         and pathname = ${op.from.pathname} and blob_url = ${op.from.blobUrl}
         and ${mediaGuard}
      returning id`
  }
  /* A stale pointer takes the Media row's current bytes under the SAME SET list as a relink (the
   * plan set's one pointer contract, shared with `relinkNinaAvatarToImage` and
   * `updateNinaChatPhotoBlob`): prose/keywords/embedding are NULL on a pointer by doctrine (so this
   * changes nothing in practice), and its hash and any thumbnail described the old bytes. */
  return sql`
    update nina_avatars
       set blob_url = ${op.to.blobUrl}, pathname = ${op.to.pathname},
           width = ${op.to.width}, height = ${op.to.height}, bytes = ${op.to.bytes},
           description = null, search_keywords = null, negative_search_keywords = null,
           description_embedding = null, content_hash = null,
           thumb_url = null, thumb_pathname = null,
           crop_scale = case when ${op.dimsChanged}::boolean then null else crop_scale end,
           crop_x = case when ${op.dimsChanged}::boolean then null else crop_x end,
           crop_y = case when ${op.dimsChanged}::boolean then null else crop_y end
     where id = ${op.id} and user_id = ${op.userId}
       and source_image_id = ${op.mediaId}
       and pathname = ${op.from.pathname} and blob_url = ${op.from.blobUrl}
       and ${mediaGuard}
    returning id`
}

function refStatement(sql, op) {
  const targetGuard =
    op.guard.table === 'nina_message_images'
      ? sql`exists (select 1 from nina_message_images s
                     where s.id = ${op.guard.id} and s.user_id = ${op.userId}
                       and s.pathname = ${op.to.pathname} and s.blob_url = ${op.to.blobUrl})`
      : sql`exists (select 1 from nina_avatars s
                     where s.id = ${op.guard.id} and s.user_id = ${op.userId}
                       and s.pathname = ${op.to.pathname} and s.blob_url = ${op.to.blobUrl})`
  const provenanceGuard =
    op.op === 'refresh-image-ref'
      ? sql`source_image_id = ${op.sourceId}`
      : sql`source_image_id is null and source_avatar_id = ${op.sourceId}`
  return sql`
    update nina_message_images
       set blob_url = ${op.to.blobUrl}, pathname = ${op.to.pathname},
           width = ${op.to.width}, height = ${op.to.height}, bytes = ${op.to.bytes},
           content_hash = ${op.to.contentHash}, description = ${op.to.description},
           perceptual_hash = ${op.to.perceptualHash}, perceptual_sig = ${op.to.perceptualSig}
     where id = ${op.id} and user_id = ${op.userId}
       and ${provenanceGuard}
       and pathname = ${op.from.pathname} and blob_url = ${op.from.blobUrl}
       and ${targetGuard}
    returning id`
}

/**
 * The reference count `isBlobPathnameReferenced` (`lib/nina/queries/images.ts:1336`) and
 * `scripts/blob-reap.mjs` define — six columns over two tables, user-scoped — plus the jsonb
 * backstop `scripts/nina-dedupe-media.mjs` adds. `exclude` lets the dry run predict the verdict
 * as if the planned rows had already moved; `--apply` asks with no exclusions, after commit.
 */
async function referenceCounts(sql, c, exclude = { avatarIds: [], imageIds: [] }) {
  const urlLike = `%${c.blobUrl ?? c.pathname}%`
  const pathLike = `%${c.pathname}%`
  const [row] = await sql`
    select
      (select count(*)::int from nina_message_images
        where user_id = ${c.userId}
          and id <> all(${exclude.imageIds}::text[])
          and (pathname = ${c.pathname} or blob_url = ${c.blobUrl})) as image_refs,
      (select count(*)::int from nina_avatars
        where user_id = ${c.userId}
          and id <> all(${exclude.avatarIds}::text[])
          and (pathname = ${c.pathname} or thumb_pathname = ${c.pathname}
               or blob_url = ${c.blobUrl} or thumb_url = ${c.blobUrl})) as avatar_refs,
      ((select count(*) from nina_turns
         where args is not null and (args::text like ${pathLike} or args::text like ${urlLike}))
       + (select count(*) from nina_memory_slots
           where value is not null
             and (value::text like ${pathLike} or value::text like ${urlLike})))::int as jsonb_refs
  `
  return {
    imageRefs: row?.image_refs,
    avatarRefs: row?.avatar_refs,
    jsonbRefs: row?.jsonb_refs,
  }
}

async function printCurrentAvatars(sql) {
  const rows = await sql`
    select a.id, a.source_key, a.source_image_id, a.blob_url, i.blob_url as media_blob_url
      from nina_avatars a
      left join nina_message_images i on i.id = a.source_image_id and i.user_id = a.user_id
     where a.is_current`
  for (const r of rows) {
    if (r.source_image_id == null) {
      console.log(
        `current avatar ${r.id}  owns its bytes (source_key ${r.source_key ?? '—'})  ${tail(r.blob_url)}`,
      )
    } else {
      const same = r.blob_url === r.media_blob_url
      console.log(
        `current avatar ${r.id}  → media ${r.source_image_id}  blob_url ${same ? 'MATCHES' : 'DIFFERS'}` +
          `  (${tail(r.blob_url)}${same ? '' : ` vs ${tail(r.media_blob_url)}`})`,
      )
    }
  }
}

async function main() {
  /* ── 1. pre-flight ─────────────────────────────────────────────────────────────────────────── */
  let args
  try {
    args = parseRepairArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  const { apply } = args

  if (!process.env.DATABASE_URL) {
    console.error('needs DATABASE_URL — run with --env-file=.env.local')
    process.exit(2)
  }
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('--apply needs BLOB_READ_WRITE_TOKEN (only `del` uses it; a dry run does not)')
    process.exit(2)
  }
  let backupPath = null
  if (apply) {
    try {
      backupPath = resolveBackupPath(args.backup)
    } catch (error) {
      console.error(error.message)
      process.exit(2)
    }
  }

  const { neon } = require('@neondatabase/serverless')
  const { del } = require('@vercel/blob')
  const sql = neon(process.env.DATABASE_URL)
  const token = process.env.BLOB_READ_WRITE_TOKEN

  /* ── 2. load ───────────────────────────────────────────────────────────────────────────────── */
  const rawAvatars = await sql`
    select id, user_id, source_key, source_image_id, is_current, blob_url, pathname,
           width, height, bytes, thumb_url, thumb_pathname, crop_scale, crop_x, crop_y,
           content_hash, description
      from nina_avatars
     order by user_id, created_at, id`
  if (rawAvatars.length === 0) {
    console.error('nina_avatars holds 0 rows. That is what a DATABASE_URL pointed at the wrong Neon')
    console.error('branch looks like — the same refusal scripts/blob-reap.mjs makes. Refusing.')
    process.exit(2)
  }
  const rawImages = await sql`
    select id, user_id, blob_url, pathname, width, height, bytes, content_hash, description,
           perceptual_hash, perceptual_sig, source_image_id, source_avatar_id
      from nina_message_images
     order by user_id, created_at, id`

  const avatars = rawAvatars.map((r) => ({
    id: r.id,
    userId: r.user_id,
    sourceKey: r.source_key,
    sourceImageId: r.source_image_id,
    isCurrent: r.is_current,
    blobUrl: r.blob_url,
    pathname: r.pathname,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    thumbUrl: r.thumb_url,
    thumbPathname: r.thumb_pathname,
    cropScale: r.crop_scale,
    cropX: r.crop_x,
    cropY: r.crop_y,
    contentHash: r.content_hash,
    description: r.description,
  }))
  const images = rawImages.map((r) => ({
    id: r.id,
    userId: r.user_id,
    blobUrl: r.blob_url,
    pathname: r.pathname,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    contentHash: r.content_hash,
    description: r.description,
    perceptualHash: r.perceptual_hash,
    perceptualSig: r.perceptual_sig,
    sourceImageId: r.source_image_id,
    sourceAvatarId: r.source_avatar_id,
  }))

  /* ── 3. plan ───────────────────────────────────────────────────────────────────────────────── */
  const plan = planRepair({ avatars, images })
  const summary = summarizePlan(plan)
  const ops = [...plan.avatarOps, ...plan.refOps]
  const candidates = collectReleaseCandidates(ops)

  /* ── 4. report ─────────────────────────────────────────────────────────────────────────────── */
  console.log(`nina profpic pointer repair   ${apply ? 'APPLY' : 'dry run'}`)
  console.log(`album rows                    ${avatars.length}`)
  console.log(`media/chat rows               ${images.length}`)
  console.log(`legacy copies to relink       ${summary.legacyRelinks}`)
  console.log(`stale pointers to refresh     ${summary.pointerRefreshes}`)
  console.log(`stale image→image references  ${summary.imageRefRefreshes}`)
  console.log(
    `image→avatar references       ${summary.avatarRefRefreshes}  (stale, or made stale by this run's album repair)`,
  )
  console.log(`skipped                       ${summary.skipped}`)
  for (const s of plan.skipped) console.log(`  ~ ${s.table} ${s.id}  ${s.reason}`)

  console.log('')
  for (const op of plan.avatarOps) {
    console.log(
      `${op.op.padEnd(18)} ${op.id}${op.isCurrent ? ' [CURRENT]' : ''}  ← media ${op.mediaId}  ` +
        `${tail(op.from.pathname)} → ${tail(op.to.pathname)}  ` +
        `${op.to.width}x${op.to.height}  ` +
        `${op.hadCrop ? (op.dimsChanged ? 'crop RESET (dims changed)' : 'crop kept') : 'no crop'}`,
    )
  }
  for (const op of plan.refOps) {
    console.log(
      `${op.op.padEnd(18)} ${op.id}  ← ${op.guard.table === 'nina_avatars' ? 'avatar' : 'image'} ${op.guard.id}` +
        ` (via ${op.sourceId})  ${tail(op.from.pathname)} → ${tail(op.to.pathname)}`,
    )
  }

  const excludeAll = {
    avatarIds: plan.avatarOps.map((op) => op.id),
    imageIds: plan.refOps.map((op) => op.id),
  }
  console.log('')
  console.log(`objects these rows stop naming ${candidates.length}`)
  if (!apply) {
    const tally = {}
    for (const c of candidates) {
      const verdict = releaseDecision(await referenceCounts(sql, c, excludeAll))
      tally[verdict] = (tally[verdict] ?? 0) + 1
      console.log(`  ${verdict.padEnd(13)} ${c.pathname}`)
    }
    console.log(
      `  predicted: ${
        Object.entries(tally)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ') || 'none'
      }`,
    )
    console.log('')
    await printCurrentAvatars(sql)
    console.log('')
    console.log(`DRY RUN — nothing written, nothing deleted. ${ops.length} row op(s). Re-run with --apply.`)
    process.exit(0)
  }

  if (ops.length === 0) {
    console.log('Nothing to repair.')
    await printCurrentAvatars(sql)
    process.exit(0)
  }

  /* ── 5. backup, BEFORE any write ───────────────────────────────────────────────────────────── */
  const backupAvatars = await sql`select * from nina_avatars where id = any(${excludeAll.avatarIds}::text[])`
  const backupImages = await sql`select * from nina_message_images where id = any(${excludeAll.imageIds}::text[])`
  const backup = {
    script: 'scripts/nina-profpic-pointer-repair.mjs',
    createdAt: new Date().toISOString(),
    databaseHost: new URL(process.env.DATABASE_URL).host,
    summary,
    ops,
    candidates,
    rows: { nina_avatars: backupAvatars, nina_message_images: backupImages },
  }
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' })
  const readBack = JSON.parse(readFileSync(backupPath, 'utf8'))
  if (
    readBack.rows?.nina_avatars?.length !== excludeAll.avatarIds.length ||
    readBack.rows?.nina_message_images?.length !== excludeAll.imageIds.length
  ) {
    console.error(`backup ${backupPath} does not hold every row about to change. Refusing to write.`)
    process.exit(1)
  }
  console.log(`backup written                ${backupPath}`)

  /* ── 6. one transaction ────────────────────────────────────────────────────────────────────── */
  const statements = [
    ...plan.avatarOps.map((op) => avatarStatement(sql, op)),
    ...plan.refOps.map((op) => refStatement(sql, op)),
  ]
  let results
  try {
    results = await sql.transaction(statements)
  } catch (error) {
    console.error('TRANSACTION FAILED — nothing was written, nothing will be deleted:', error.message)
    process.exit(1)
  }
  const applied = []
  const missed = []
  ops.forEach((op, i) => {
    if (Array.isArray(results[i]) && results[i].length === 1) applied.push(op)
    else missed.push(op)
  })
  console.log(`rows written                  ${applied.length} of ${ops.length}`)
  for (const op of missed) {
    console.log(`  ! ${op.op} ${op.id} — guard missed (a concurrent writer moved it); re-run`)
  }

  /* ── 7. row first, blob second ─────────────────────────────────────────────────────────────── */
  let deleted = 0
  let kept = 0
  let failed = 0
  for (const c of collectReleaseCandidates(applied)) {
    if (!isStoreUrl(c.blobUrl)) {
      kept++
      console.log(`  kept (not a store URL) ${c.pathname}`)
      continue
    }
    let verdict
    try {
      verdict = releaseDecision(await referenceCounts(sql, c))
    } catch (error) {
      kept++
      console.log(`  kept (could not count references: ${error.message}) ${c.pathname}`)
      continue
    }
    if (verdict !== 'released') {
      kept++
      console.log(`  kept (${verdict}) ${c.pathname}`)
      continue
    }
    try {
      await del(c.blobUrl, { token })
      deleted++
      console.log(`  deleted ${c.pathname}`)
    } catch (error) {
      failed++
      console.error(`  FAILED to delete ${c.pathname}:`, error.message)
    }
  }
  console.log(`objects deleted               ${deleted}  (kept ${kept}, failed ${failed})`)

  /* ── 8. what she shows now ─────────────────────────────────────────────────────────────────── */
  console.log('')
  await printCurrentAvatars(sql)
  console.log('')
  console.log(
    `DONE. backup: ${backupPath}` +
      (missed.length || failed
        ? `  — ${missed.length} missed row(s), ${failed} failed delete(s): re-run (dry run first).`
        : ''),
  )
  process.exit(missed.length > 0 || failed > 0 ? 1 : 0)
}

/* Run only as the process entry point, so `tests/nina.profpicPointerRepair.test.ts` can import the
 * pure half without executing any of this — `scripts/nina-dedupe-media.mjs`'s precedent. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
```
**Impact:**
- No code path in the app changes.
- Importing the module has no side effects. `@neondatabase/serverless` and `@vercel/blob` are `require`d inside `main()`, so the unit test loads neither.
- After `prettier --write`, the long `console.log`/`console.error` lines may wrap differently. Run `npm run format` on the file before committing.

### Step 2: Wire the npm script
**File:** `package.json:37` (insert a new line after `"nina:dedupe-avatars": …`)
**Change:** Add the entry with the same shape as its siblings: plain `node`, no strip-types, because the file is `.mjs` with no TypeScript.
**Code:**
```json
    "nina:dedupe-avatars": "node --env-file=.env.local scripts/nina-dedupe-avatars.mjs",
    "nina:profpic-pointer-repair": "node --env-file=.env.local scripts/nina-profpic-pointer-repair.mjs",
    "nina:memory-reap": "node --env-file=.env.local scripts/nina-memory-reap.mjs",
```
(Only the middle line is new. The two around it are shown to anchor where it goes.)
**Impact:** knip sees the script as an entry (`knip.ts:21`), so its exports do not count as unused.

### Step 3: Unit tests for the pure half
**File:** `tests/nina.profpicPointerRepair.test.ts` (new)
**Change:** Tests for the planner's classification, the crop rule, the post-repair cascade of avatar references, candidate de-duplication, argument parsing and the backup-path guard. No DB, no network.
**Code:**
```ts
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectReleaseCandidates,
  isInside,
  parseRepairArgs,
  planRepair,
  resolveBackupPath,
  summarizePlan,
} from '@/scripts/nina-profpic-pointer-repair.mjs'

/**
 * The pure half of `scripts/nina-profpic-pointer-repair.mjs`. The I/O half writes production and is
 * exercised by the phase's own dry-run → apply → dry-run sequence, not here — the same line
 * `tests/nina.dedupeMedia.test.ts` draws for its sibling script.
 */

const U = 'user-1'
const store = (p: string) => `https://abc.public.blob.vercel-storage.com/${p}`

function media(id: string, file: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: U,
    blobUrl: store(`nina/${U}/${file}`),
    pathname: `nina/${U}/${file}`,
    width: 576,
    height: 1024,
    bytes: 1000,
    contentHash: `hash-${file}`,
    description: `prose about ${file}` as string | null,
    perceptualHash: `ph-${file}`,
    perceptualSig: `ps-${file}`,
    sourceImageId: null as string | null,
    sourceAvatarId: null as string | null,
    ...overrides,
  }
}

function album(id: string, file: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: U,
    sourceKey: null as string | null,
    sourceImageId: null as string | null,
    isCurrent: false,
    blobUrl: store(`nina/${U}/${file}`),
    pathname: `nina/${U}/${file}`,
    width: 576,
    height: 1024,
    bytes: 900,
    thumbUrl: null as string | null,
    thumbPathname: null as string | null,
    cropScale: '1.204' as string | null,
    cropX: 10 as number | null,
    cropY: 20 as number | null,
    contentHash: 'legacy-hash' as string | null,
    description: 'album prose' as string | null,
    ...overrides,
  }
}

describe('planRepair — legacy copies', () => {
  it('relinks a chat-photo legacy copy whose original is alive, and drops its own object', () => {
    const m = media('jWWu8vkl09fT', 'selfie-v2.jpg')
    const a = album('Daofejusg4Xa', 'avatar-v1.jpg', {
      sourceKey: 'chat-photo:jWWu8vkl09fT',
      isCurrent: true,
    })
    const plan = planRepair({ avatars: [a], images: [m] })
    expect(plan.avatarOps).toHaveLength(1)
    const op = plan.avatarOps[0]
    expect(op.op).toBe('relink-legacy')
    expect(op.mediaId).toBe('jWWu8vkl09fT')
    expect(op.isCurrent).toBe(true)
    expect(op.to.pathname).toBe(m.pathname)
    expect(op.to.blobUrl).toBe(m.blobUrl)
    expect(op.dimsChanged).toBe(false)
    expect(op.drops).toEqual([{ userId: U, pathname: a.pathname, blobUrl: a.blobUrl }])
  })

  it('marks the crop for reset only when the dimensions differ', () => {
    const m = media('m1', 'selfie.jpg', { width: 768, height: 1024 })
    const a = album('a1', 'avatar.jpg', { sourceKey: 'chat-photo:m1' })
    const [op] = planRepair({ avatars: [a], images: [m] }).avatarOps
    expect(op.dimsChanged).toBe(true)
    expect(op.hadCrop).toBe(true)
  })

  it('drops the thumbnail too', () => {
    const m = media('m1', 'selfie.jpg')
    const a = album('a1', 'avatar.jpg', {
      sourceKey: 'chat-photo:m1',
      thumbPathname: `nina/${U}/thumb-a1.webp`,
      thumbUrl: store(`nina/${U}/thumb-a1.webp`),
    })
    const [op] = planRepair({ avatars: [a], images: [m] }).avatarOps
    expect(op.drops.map((d: { pathname: string }) => d.pathname)).toEqual([
      a.pathname,
      `nina/${U}/thumb-a1.webp`,
    ])
  })

  it('skips a legacy copy whose original is gone, or is itself a reference', () => {
    const ref = media('m2', 'chat-ref.jpg', { sourceImageId: 'm9' })
    const gone = album('a1', 'avatar-1.jpg', { sourceKey: 'chat-photo:missing' })
    const viaRef = album('a2', 'avatar-2.jpg', { sourceKey: 'chat-photo:m2' })
    const plan = planRepair({ avatars: [gone, viaRef], images: [ref] })
    expect(plan.avatarOps).toEqual([])
    expect(plan.skipped.map((s: { id: string }) => s.id)).toEqual(['a1', 'a2'])
  })

  it('ignores album rows with no chat-photo source key', () => {
    const plain = album('a1', 'avatar.jpg', { sourceKey: 'batch:abc' })
    const plan = planRepair({ avatars: [plain], images: [] })
    expect(plan.avatarOps).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('does not drop the object when the copy already names the media object', () => {
    const m = media('m1', 'selfie.jpg')
    const a = album('a1', 'selfie.jpg', { sourceKey: 'chat-photo:m1' })
    const [op] = planRepair({ avatars: [a], images: [m] }).avatarOps
    expect(op.op).toBe('relink-legacy')
    expect(op.drops).toEqual([])
  })
})

describe('planRepair — pointers', () => {
  it('refreshes a stale pointer and leaves a fresh one alone', () => {
    const m1 = media('m1', 'selfie-v2.jpg')
    const m2 = media('m2', 'selfie-b.jpg')
    const stale = album('a1', 'selfie-v1.jpg', { sourceImageId: 'm1', sourceKey: 'chat-photo:m1' })
    const fresh = album('a2', 'selfie-b.jpg', { sourceImageId: 'm2', sourceKey: 'chat-photo:m2' })
    const plan = planRepair({ avatars: [stale, fresh], images: [m1, m2] })
    expect(plan.avatarOps.map((op: { id: string; op: string }) => [op.id, op.op])).toEqual([
      ['a1', 'refresh-pointer'],
    ])
    expect(plan.avatarOps[0].drops).toEqual([
      { userId: U, pathname: stale.pathname, blobUrl: stale.blobUrl },
    ])
  })
})

describe('planRepair — references', () => {
  it('refreshes a stale image→image reference with the original’s byte columns', () => {
    const o = media('o1', 'selfie-v2.jpg')
    const r = media('r1', 'selfie-v1.jpg', {
      sourceImageId: 'o1',
      contentHash: 'old',
      description: 'prose about v1',
    })
    const [op] = planRepair({ avatars: [], images: [o, r] }).refOps
    expect(op.op).toBe('refresh-image-ref')
    expect(op.guard).toEqual({ table: 'nina_message_images', id: 'o1' })
    expect(op.to).toMatchObject({
      pathname: o.pathname,
      blobUrl: o.blobUrl,
      contentHash: o.contentHash,
      // Decision D2: a reference mirrors its target's prose — the v1 prose does not survive.
      description: o.description,
      perceptualHash: o.perceptualHash,
      perceptualSig: o.perceptualSig,
    })
    expect(op.drops).toEqual([{ userId: U, pathname: r.pathname, blobUrl: r.blobUrl }])
  })

  it('moves an image→avatar reference along with a relinked legacy copy (post-repair bytes)', () => {
    const m = media('m1', 'selfie-v2.jpg')
    const a = album('a1', 'avatar-v1.jpg', { sourceKey: 'chat-photo:m1' })
    // Not stale today: it names exactly what the legacy copy names.
    const r = media('r1', 'avatar-v1.jpg', { sourceAvatarId: 'a1', kind: 'generated' })
    const plan = planRepair({ avatars: [a], images: [m, r] })
    expect(plan.refOps).toHaveLength(1)
    expect(plan.refOps[0].op).toBe('refresh-avatar-ref')
    expect(plan.refOps[0].guard).toEqual({ table: 'nina_message_images', id: 'm1' })
    expect(plan.refOps[0].to.pathname).toBe(m.pathname)
    // The prose is the Media row's, not the legacy copy's (a pointer's own prose is dead).
    expect(plan.refOps[0].to.description).toBe(m.description)
    // Both the copy and the reference drop the same object — one candidate, not two.
    expect(collectReleaseCandidates([...plan.avatarOps, ...plan.refOps])).toEqual([
      { userId: U, pathname: a.pathname, blobUrl: a.blobUrl },
    ])
  })

  it('compares a reference to a plain album row against that row, with no perceptual columns', () => {
    const a = album('a1', 'avatar-new.jpg')
    const r = media('r1', 'avatar-old.jpg', { sourceAvatarId: 'a1' })
    const [op] = planRepair({ avatars: [a], images: [r] }).refOps
    expect(op.guard).toEqual({ table: 'nina_avatars', id: 'a1' })
    expect(op.to.perceptualHash).toBeNull()
    expect(op.to.perceptualSig).toBeNull()
    expect(op.to.contentHash).toBe('legacy-hash')
    expect(op.to.description).toBe('album prose')
  })

  it('copies a NULL target description as NULL rather than keeping prose about the old bytes', () => {
    const o = media('o1', 'selfie-v2.jpg', { description: null })
    const r = media('r1', 'selfie-v1.jpg', { sourceImageId: 'o1', description: 'prose about v1' })
    const [op] = planRepair({ avatars: [], images: [o, r] }).refOps
    expect(op.to.description).toBeNull()
  })

  it('leaves a reference that already names its target alone, even with NULL dims', () => {
    const o = media('o1', 'selfie.jpg')
    const r = media('r1', 'selfie.jpg', { sourceImageId: 'o1', width: null, height: null, bytes: null })
    expect(planRepair({ avatars: [], images: [o, r] }).refOps).toEqual([])
  })

  it('never crosses users', () => {
    const o = media('o1', 'selfie.jpg', { userId: 'user-2' })
    const r = media('r1', 'other.jpg', { sourceImageId: 'o1' })
    const plan = planRepair({ avatars: [], images: [o, r] })
    expect(plan.refOps).toEqual([])
    expect(plan.skipped).toHaveLength(1)
  })
})

describe('summarizePlan', () => {
  it('counts each class', () => {
    const m = media('m1', 'v2.jpg')
    const plan = planRepair({
      avatars: [
        album('a1', 'v1.jpg', { sourceKey: 'chat-photo:m1' }),
        album('a2', 'v1b.jpg', { sourceImageId: 'm1', sourceKey: 'x' }),
      ],
      images: [m, media('r1', 'v1.jpg', { sourceImageId: 'm1' })],
    })
    expect(summarizePlan(plan)).toEqual({
      legacyRelinks: 1,
      pointerRefreshes: 1,
      imageRefRefreshes: 1,
      avatarRefRefreshes: 0,
      skipped: 0,
    })
  })
})

describe('parseRepairArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseRepairArgs([])).toEqual({ apply: false, backup: null })
  })
  it('takes --apply and --backup <path>', () => {
    expect(parseRepairArgs(['--apply', '--backup', '/tmp/x.json'])).toEqual({
      apply: true,
      backup: '/tmp/x.json',
    })
  })
  it('refuses unknown flags and a bare --backup', () => {
    expect(() => parseRepairArgs(['--delete'])).toThrow(/unknown flag/)
    expect(() => parseRepairArgs(['--backup'])).toThrow(/needs a file path/)
    expect(() => parseRepairArgs(['--backup', '--apply'])).toThrow(/needs a file path/)
  })
})

describe('resolveBackupPath', () => {
  const repo = path.resolve('/work/repo')
  it('defaults outside the repo', () => {
    const p = resolveBackupPath(null, new Date('2026-10-03T00:00:00Z'), repo)
    expect(isInside(p, repo)).toBe(false)
    expect(path.basename(p)).toBe('nina-profpic-pointer-repair-2026-10-03T00-00-00-000Z.json')
  })
  it('refuses a path inside the repo', () => {
    expect(() => resolveBackupPath('/work/repo/backup.json', new Date(), repo)).toThrow(
      /inside the repository/,
    )
  })
  it('accepts an explicit path elsewhere', () => {
    expect(resolveBackupPath('/elsewhere/b.json', new Date(), repo)).toBe(
      path.resolve('/elsewhere/b.json'),
    )
  })
})
```
**Impact:** Adds one unit file to `npm test`. `tsconfig.json` has `allowJs: true` and no `checkJs`, so the JS module's inferred `any`-ish types typecheck, which is how `tests/nina.chatPhotoAudit.test.ts` already imports its `.mjs`. If `tsc` complains about a property on the inferred return type, add a JSDoc `@returns` to `planRepair` rather than casting in the test.

### Step 4: Run it against production (the phase's execution)
**File:** none (operational)
**Change:** Run the script under the protocol below. The worktree has **no `node_modules` and no `.env.local`** (checked 2026-10-03). The worktree's `package-lock.json` is byte-identical to the main repo's at `d4491e5`, so symlink both instead of running `npm ci`. Both paths are git-ignored (`.gitignore`: `/node_modules`, `.env.*`). Phases 1 and 2 state the same setup; the `[ -e … ] ||` guards make it safe when an earlier phase already created the links. Never `git add -f` them; stage this phase's three files by name.
```bash
export PATH=/home/miftah/tools/node-v24.20.0-linux-x64/bin:$PATH
WT=/home/miftah/.worktrees/run-insights/profpic-pointer-sync
[ -e "$WT/node_modules" ] || ln -s /home/miftah/run-insights/node_modules "$WT/node_modules"
[ -e "$WT/.env.local" ]   || ln -s /home/miftah/run-insights/.env.local   "$WT/.env.local"
cd "$WT"

# a. dry run
npm run nina:profpic-pointer-repair
```
- `.env.local` is read with Node's `--env-file`, which strips the trailing `# comments` that make the file unsourceable in zsh. Every existing `npm run nina:*` script relies on this. `.env.local` provides both `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` (checked).
- **Check the dry-run counts before going on.** Expected values as of 2026-10-03:
  - `legacy copies to relink 21`, `stale pointers to refresh 11`, `stale image→image references 13`
  - `image→avatar references 7`: these are the cascades (6 to legacy copies, 1 to a stale pointer). The index's expected counts are 21 / 11 / 13 / 7.
  - `skipped 0`
  - `current avatar Daofejusg4Xa → …` is printed as "owns its bytes" in the dry run
- **Stop if** legacy > 21, pointers > 11, image refs > 13, avatar refs > 7 plus any refreshed pointer's references, or any skip appears. Investigate instead of applying. Lower counts are fine, because someone may have adopted or replaced since.
- **Expected verdicts:** most release candidates should predict `released`. A `kept-jsonb` or `kept-shared` verdict is correct and safe to apply. It means another row or a turn's args still names that object.
```bash
# b. apply, with the backup in the session scratchpad (outside the repo)
npm run nina:profpic-pointer-repair -- --apply \
  --backup /tmp/claude-1000/-home-miftah-run-insights/<session>/scratchpad/nina-profpic-pointer-repair-backup.json

# c. dry run again — expect 0 / 0 / 0 / 0 and "objects these rows stop naming 0"
npm run nina:profpic-pointer-repair
```
- If `--backup` is omitted, the file goes to `os.tmpdir()`.
- **Check in (c):** the line for the current avatar reads `current avatar Daofejusg4Xa → media jWWu8vkl09fT  blob_url MATCHES`.
- **Check the deletions** with an optional `npm run blob:reap` dry run, which only reads. Its `nina/` ORPHANS count must not have *risen* compared with a run before step (b), because every freed object was deleted rather than orphaned.

**Impact:**
- Production rows are rewritten.
- About 30–45 Blob objects are permanently deleted. The analysis's 8.88 MB of legacy copies plus the stale v1 objects is the upper bound.
- `/nina/about` shows v2 immediately, because `ninaAvatarView` reads `row.blobUrl`.

## Verification

**Build:** `npm run typecheck && npm run lint && npm run format:check && npm run knip`
**Tests:** `npx vitest run tests/nina.profpicPointerRepair.test.ts`, then `npm test`
**Manual check:**
- the three-run sequence in Step 4
- open `https://runins.site/nina/about`. Foto profil should show the same image as `/admin/nina?view=media&image=jWWu8vkl09fT`.
- `node --env-file=.env.local -e` style read-only SELECTs are allowed for spot checks. Example: `select count(*) from nina_avatars where source_key like 'chat-photo:%' and source_image_id is null` should be 0.

**Ordering against deploys (reconciled, index Decision D6):**
- `depends_on` is empty. This phase runs its dry-run → `--apply` → dry-run sequence in its own session, unattended, per the index's Decision on unattended apply. It does not wait for a deploy: Phases 1–2 reach production only when the whole set is merged to `main` and Vercel deploys it, which happens after every phase session has ended. No phase session can observe that deploy.
- Until Phase 2 is deployed, any Media replace done after the repair creates new stale pointers and references. A legacy copy relinked by Phase 1 code before this run is also fine: the planner sees it as a pointer and moves its chat references.
- **Post-deploy re-run is a handoff, not a step of this phase** (see Handoffs). The script is idempotent; a dry run after the deploy that prints all zeros needs no `--apply`.

**Exit criteria:**
- The second dry run prints 0 legacy relinks, 0 pointer refreshes, 0 image→image refreshes, 0 image→avatar refreshes and 0 skips. It shows `Daofejusg4Xa → media jWWu8vkl09fT blob_url MATCHES`.
- The `--apply` run printed `objects deleted N` with `failed 0`, and the backup path it printed exists outside the repo.
- `npm test`, `typecheck`, `lint`, `format:check` and `knip` are green.
- `git status` shows only the three files from this phase. The `node_modules` and `.env.local` symlinks are ignored, and the backup file is not in the tree.

## Handoffs

- **13 references with NULL `width/height/bytes` but the correct pathname** (production, 2026-10-03). This script does not touch them, because they show the right file and are not stale. Filling their dims is a cosmetic data backfill. It belongs to a follow-up card (or `scripts/nina-dedupe-media.mjs`'s `fill-dimensions` pass, which today only targets originals), not to R1–R3.
- **Column contract (settled by the reconciler, index Decisions D1/D2).** The pointer SET list is identical to Phase 1's `relinkNinaAvatarToImage` and Phase 2's `updateNinaChatPhotoBlob` statement 2, including NULL prose on `refresh-pointer` (zero rows differ in practice). The reference SET list mirrors the target's post-write values (`content_hash`, `description`, `perceptual_*`), which is what Phase 2 writes too; there the target's prose and perceptual pair have just been nulled, so Phase 2 writes NULL and this script copies the described original's.
- **Post-deploy re-run (Decision D6) — owner: the completion step / the user, after `main` is deployed.** Once Phases 1–2 are live on Vercel, run `npm run nina:profpic-pointer-repair` (dry run) from the main checkout. Expect all zeros. If any Media replace or adoption happened between this phase's `--apply` and the deploy, the dry run lists the rows it created; then run `--apply` with a `--backup` outside the repo, exactly as in Step 4. The orchestrator's completion handler must copy this line into its close-out note.
- **Legacy copies whose Media original is gone or is a reference** (0 today) are skipped and reported. Turning those into plain album rows (`source_key` cleared) is out of scope for R1–R3.

## Rollback

- **Code:** `git revert` the phase commit. This removes the script, the npm entry and the test. Nothing in the app imports them.
- **Rows:** the backup JSON holds each changed row's full pre-repair state (`select *`). Restoring the **prose/hash/crop/provenance** columns from it is a straightforward per-id `UPDATE … SET`.
- **Do not restore `blob_url`/`pathname`/thumb columns blindly.** Any object the run deleted is gone (Vercel Blob has no undelete), and a restored row would name a dead URL. Restore those columns only for ids whose old pathname appears in the run's `kept (…)` lines.
- **Blobs:** irreversible. Only objects that no row and no jsonb value named *after* the committed repair were deleted, so no visible photo breaks from the deletes themselves.
