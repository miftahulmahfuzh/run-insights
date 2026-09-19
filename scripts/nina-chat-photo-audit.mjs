#!/usr/bin/env node
/**
 * Provenance-based re-audit of the Chat photos collection — READ-ONLY, always.
 *
 *   npm run nina:chat-photo-audit
 *
 * There is no `--apply`, and none is coming: this script deletes nothing and writes nothing,
 * under any flag. It reports four things about `nina_message_images`, per user:
 *
 *   1. reference rows       — `source_avatar_id` or `source_image_id` non-null
 *   2. pathname duplicates  — rows sharing a `pathname` with another row
 *   3. orphans              — `message_id IS NULL` (legitimate since migration 0013)
 *   4. dangling references  — `source_image_id` naming a row that no longer exists
 *
 * and answers the question a 0-row table raises: is the collection genuinely empty, or is a read
 * filtering everything out? It prints the raw table count beside two collection predicates,
 * restated here in plain JS because a `.mjs` script cannot import `lib/nina/queries/images.ts`
 * (the `server-only` boundary `scripts/nina-dedupe-media.mjs`'s header already argues):
 *
 *   · `generatedChatPhotoScope`  — `kind = 'generated' AND isOriginalPhoto() AND NOT EXISTS(an
 *     album row whose source_key is 'chat-photo:' || this row's id)` — the narrower "her chat
 *     photographs" set this card names.
 *   · the `listNinaMediaPhotos` / `countNinaMediaPhotos` predicate (`mediaCollectionScope`,
 *     module-private in `lib/nina/queries/images.ts`) — `isOriginalPhoto()` alone, no `kind` arm.
 *     **This is not what the card asked for** (it named the now-removed `listNinaMessageImages`,
 *     deleted 2026-09-17 when its one caller moved here) — it is that function's live
 *     replacement, so the "is a read over-filtering" question is answered against the predicate
 *     actually running in production today.
 *
 * DATABASE_URL IS PRODUCTION. There is one database in this repo. Every number this prints is a
 * production number, and it is safe to run this any number of times — nothing here writes.
 */
import { pathToFileURL } from 'node:url'

const CHAT_PHOTO_SOURCE_KEY_PREFIX = 'chat-photo:'

/** Mirrors `isOriginalPhoto()` (`lib/nina/queries/images.ts`): neither provenance column is set. */
export function isOriginalPhotoRow(row) {
  return row.sourceAvatarId == null && row.sourceImageId == null
}

/**
 * The set of `nina_message_images.id`s already copied into the album — mirrors
 * `generatedChatPhotoScope`'s correlated `NOT EXISTS` arm, built from `nina_avatars.source_key`
 * values of the form `chat-photo:<image id>`.
 */
export function chatPhotoAdoptedIds(avatarRows) {
  const ids = new Set()
  for (const avatar of avatarRows) {
    if (
      typeof avatar.sourceKey === 'string' &&
      avatar.sourceKey.startsWith(CHAT_PHOTO_SOURCE_KEY_PREFIX)
    ) {
      ids.add(avatar.sourceKey.slice(CHAT_PHOTO_SOURCE_KEY_PREFIX.length))
    }
  }
  return ids
}

/** Mirrors `generatedChatPhotoScope(userId)`, ownership already applied by the caller's grouping. */
export function matchesGeneratedChatPhotoScope(row, adoptedIds) {
  return row.kind === 'generated' && isOriginalPhotoRow(row) && !adoptedIds.has(row.id)
}

/** Mirrors the unexported `mediaCollectionScope(userId)` — no `kind` arm, unlike the scope above. */
export function matchesMediaCollectionScope(row) {
  return isOriginalPhotoRow(row)
}

/**
 * The four row-level reports the card asks for, over one already-loaded set of rows. `rows` must
 * be the WHOLE table (or the whole table for a user) — `danglingSourceImageRows` and
 * `pathnameDuplicateGroups` are both relative to "another row in the set", so a partial load would
 * under-report both.
 */
export function auditChatPhotoRows(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]))

  const referenceRows = rows.filter((row) => !isOriginalPhotoRow(row))
  const orphanRows = rows.filter((row) => row.messageId == null)
  const danglingSourceImageRows = rows.filter(
    (row) => row.sourceImageId != null && !byId.has(row.sourceImageId),
  )

  const byPathname = new Map()
  for (const row of rows) {
    const group = byPathname.get(row.pathname) ?? []
    group.push(row)
    byPathname.set(row.pathname, group)
  }
  const pathnameDuplicateGroups = [...byPathname.values()].filter((group) => group.length > 1)

  return { referenceRows, orphanRows, danglingSourceImageRows, pathnameDuplicateGroups }
}

function groupByUserId(rows) {
  const byUser = new Map()
  for (const row of rows) {
    const group = byUser.get(row.userId) ?? []
    group.push(row)
    byUser.set(row.userId, group)
  }
  return byUser
}

function printRowList(rows, describe) {
  for (const row of rows) console.log(`      - ${describe(row)}`)
}

function printUserReport(userId, rows, adoptedIds) {
  const generatedScopeCount = rows.filter((row) =>
    matchesGeneratedChatPhotoScope(row, adoptedIds),
  ).length
  const mediaScopeCount = rows.filter((row) => matchesMediaCollectionScope(row)).length

  console.log(`\n  user ${userId}`)
  console.log(`    raw rows: ${rows.length}`)
  console.log(`    generatedChatPhotoScope (her generations, deduped): ${generatedScopeCount}`)
  console.log(`    listNinaMediaPhotos / countNinaMediaPhotos (all originals): ${mediaScopeCount}`)

  const { referenceRows, orphanRows, danglingSourceImageRows, pathnameDuplicateGroups } =
    auditChatPhotoRows(rows)

  console.log(`    reference rows (excluded by isOriginalPhoto()): ${referenceRows.length}`)
  printRowList(referenceRows, (row) => {
    const via =
      row.sourceAvatarId != null
        ? `source_avatar_id=${row.sourceAvatarId}`
        : `source_image_id=${row.sourceImageId}`
    return `${row.id} (kind=${row.kind}, ${via})`
  })

  console.log(`    orphans (message_id IS NULL): ${orphanRows.length}`)
  printRowList(orphanRows, (row) => `${row.id} (kind=${row.kind}, created_at=${row.createdAt})`)

  console.log(`    dangling source_image_id: ${danglingSourceImageRows.length}`)
  printRowList(
    danglingSourceImageRows,
    (row) => `${row.id} -> missing source_image_id=${row.sourceImageId}`,
  )

  console.log(`    pathname duplicate groups: ${pathnameDuplicateGroups.length}`)
  for (const group of pathnameDuplicateGroups) {
    console.log(`      - ${group[0].pathname} (${group.length} rows)`)
    printRowList(group, (row) => `${row.id} (kind=${row.kind})`)
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('needs DATABASE_URL — run with --env-file=.env.local')
    process.exit(2)
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)

  const rawRows = await sql`
    select id, user_id, message_id, kind, source_avatar_id, source_image_id, pathname, created_at
      from nina_message_images
     order by user_id, created_at, id
  `
  const rows = rawRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    messageId: row.message_id,
    kind: row.kind,
    sourceAvatarId: row.source_avatar_id,
    sourceImageId: row.source_image_id,
    pathname: row.pathname,
    createdAt: row.created_at,
  }))

  const avatarRows = (
    await sql`
      select user_id, source_key
        from nina_avatars
       where source_key like ${CHAT_PHOTO_SOURCE_KEY_PREFIX + '%'}
    `
  ).map((row) => ({ userId: row.user_id, sourceKey: row.source_key }))

  console.log(
    'Provenance-based re-audit of the Chat photos collection — read-only, nothing written.\n',
  )

  const rawTotal = rows.length
  const generatedScopeTotal = rows.filter((row) =>
    matchesGeneratedChatPhotoScope(row, chatPhotoAdoptedIds(avatarRows)),
  ).length
  const mediaScopeTotal = rows.filter((row) => matchesMediaCollectionScope(row)).length

  console.log(`raw nina_message_images rows: ${rawTotal}`)
  console.log(`generatedChatPhotoScope (all users): ${generatedScopeTotal}`)
  console.log(
    `listNinaMediaPhotos / countNinaMediaPhotos predicate (all users): ${mediaScopeTotal}`,
  )

  if (rawTotal === 0) {
    console.log(
      '\nVERDICT: the collection is genuinely empty — the raw table holds 0 rows, so there is',
    )
    console.log('nothing for any read to be filtering out.')
  } else if (mediaScopeTotal === 0) {
    console.log(
      `\nVERDICT: ${rawTotal} raw row(s) exist but 0 pass isOriginalPhoto() — every row is a`,
    )
    console.log('reference. The Media view and the picker are both correctly reporting empty; the')
    console.log('bytes are reference-only, not missing.')
  } else {
    console.log(
      `\nVERDICT: ${rawTotal} raw row(s), ${mediaScopeTotal} of them original — reads are not`,
    )
    console.log('zeroing an otherwise non-empty table.')
  }

  const adoptedIdsByUser = new Map()
  for (const avatar of avatarRows) {
    const list = adoptedIdsByUser.get(avatar.userId) ?? []
    list.push(avatar)
    adoptedIdsByUser.set(avatar.userId, list)
  }

  console.log('\nPer user:')
  for (const [userId, userRows] of groupByUserId(rows)) {
    const adoptedIds = chatPhotoAdoptedIds(adoptedIdsByUser.get(userId) ?? [])
    printUserReport(userId, userRows, adoptedIds)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error)
    process.exit(2)
  })
}
