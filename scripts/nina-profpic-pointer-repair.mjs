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
    console.error(
      'nina_avatars holds 0 rows. That is what a DATABASE_URL pointed at the wrong Neon',
    )
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
    console.log(
      `DRY RUN — nothing written, nothing deleted. ${ops.length} row op(s). Re-run with --apply.`,
    )
    process.exit(0)
  }

  if (ops.length === 0) {
    console.log('Nothing to repair.')
    await printCurrentAvatars(sql)
    process.exit(0)
  }

  /* ── 5. backup, BEFORE any write ───────────────────────────────────────────────────────────── */
  const backupAvatars =
    await sql`select * from nina_avatars where id = any(${excludeAll.avatarIds}::text[])`
  const backupImages =
    await sql`select * from nina_message_images where id = any(${excludeAll.imageIds}::text[])`
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
    console.error(
      `backup ${backupPath} does not hold every row about to change. Refusing to write.`,
    )
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
    console.error(
      'TRANSACTION FAILED — nothing was written, nothing will be deleted:',
      error.message,
    )
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
