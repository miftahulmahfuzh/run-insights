import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from '@/lib/db/schema'
import { NINA_IMAGE_FOCUS_KEYS, NINA_IMAGE_TEXT_KEYS } from '@/lib/nina/imageprefs'
import { NINA_DIALS, NINA_TRAITS, NINA_TUNING_KEYS } from '@/lib/nina/tuning'

/**
 * F33's eight tables and two `profiles` columns, asserted against the names the phase plans were
 * written against. `tests/db.schema.test.ts` does this for F03 and explains why: a typo here
 * surfaces as a wrong number in a rollup — or, for Nina, as a phase-6 image with no description —
 * six features later.
 *
 * Deliberately NOT a copy of that file's helpers: this suite asks different questions (an
 * emission-order column, a partial unique index, a nullable provenance pointer) and sharing the
 * helpers would mean one of the two files owning them.
 */
function cfg(table: PgTable) {
  return getTableConfig(table)
}
function columns(table: PgTable): Map<string, ReturnType<typeof cfg>['columns'][number]> {
  return new Map(cfg(table).columns.map((c) => [c.name, c]))
}
function sqlType(table: PgTable, column: string): string {
  const col = columns(table).get(column)
  if (!col) throw new Error(`no column ${column} on ${cfg(table).name}`)
  return col.getSQLType()
}
function names(table: PgTable): string[] {
  return [...columns(table).keys()].sort()
}
function indexNames(table: PgTable): string[] {
  return cfg(table)
    .indexes.map((i) => i.config.name ?? '(unnamed)')
    .sort()
}
/** `photoEagerness` -> `photo_eagerness`. The one spelling difference between model and column. */
function snake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
function fkFor(table: PgTable, column: string) {
  return cfg(table).foreignKeys.find((fk) =>
    fk
      .reference()
      .columns.map((c) => c.name)
      .includes(column),
  )
}

describe('profiles gains sex and last_seen_on', () => {
  it('sex is a nullable text column, and SEX_VALUES is its domain in the same order', () => {
    expect(sqlType(schema.profiles, 'sex')).toBe('text')
    expect(columns(schema.profiles).get('sex')?.notNull).toBe(false)
    expect(schema.SEX_VALUES).toEqual(['male', 'female', 'other', 'unspecified'])
  })

  it('last_seen_on is a nullable DATE — a Jakarta calendar day, like runs.occurred_on', () => {
    expect(sqlType(schema.profiles, 'last_seen_on')).toBe('date')
    expect(sqlType(schema.runs, 'occurred_on')).toBe('date')
    expect(columns(schema.profiles).get('last_seen_on')?.notNull).toBe(false)
  })
})

describe('the eight table names', () => {
  it('are exactly what the plan index promised', () => {
    expect(cfg(schema.ninaMessages).name).toBe('nina_messages')
    expect(cfg(schema.ninaMessageImages).name).toBe('nina_message_images')
    expect(cfg(schema.ninaMemorySlots).name).toBe('nina_memory_slots')
    expect(cfg(schema.ninaMemoryFacts).name).toBe('nina_memory_facts')
    expect(cfg(schema.ninaAvatars).name).toBe('nina_avatars')
    expect(cfg(schema.ninaNags).name).toBe('nina_nags')
    expect(cfg(schema.ninaTurns).name).toBe('nina_turns')
    expect(cfg(schema.pushSubscriptions).name).toBe('push_subscriptions')
  })

  it('all eight cascade from user, so deleting the account leaves no conversation behind', () => {
    for (const table of [
      schema.ninaMessages,
      schema.ninaMessageImages,
      schema.ninaMemorySlots,
      schema.ninaMemoryFacts,
      schema.ninaAvatars,
      schema.ninaNags,
      schema.ninaTurns,
      schema.pushSubscriptions,
    ]) {
      expect(fkFor(table, 'user_id')?.onDelete, cfg(table).name).toBe('cascade')
    }
  })
})

describe('nina_messages', () => {
  it('spells the columns phase 2 and phase 4 were written against', () => {
    expect(names(schema.ninaMessages)).toEqual(
      [
        'id',
        'seq',
        'user_id',
        'session_id',
        'role',
        'text',
        'source',
        /* The carrier marker. `isNinaPhotoCarrierMessage` reads it instead of reading the caption
         * text, which is what lets the caption become a sentence about the photograph. */
        'photo_only',
        'turn_id',
        'reply_to_id',
        'run_id',
        'sent_at',
        'delivered_at',
        'read_at',
      ].sort(),
    )
  })

  it('photo_only is NOT NULL DEFAULT false, so no reader needs a null branch', () => {
    // Additive and defaulted on purpose: a revert of the code leaves a column nothing consults,
    // and every row that predates migration 0008 reads `false` rather than `null`.
    expect(sqlType(schema.ninaMessages, 'photo_only')).toBe('boolean')
    expect(columns(schema.ninaMessages).get('photo_only')?.notNull).toBe(true)
    expect(columns(schema.ninaMessages).get('photo_only')?.hasDefault).toBe(true)
    expect(columns(schema.ninaMessages).get('photo_only')?.default).toBe(false)
  })

  it('seq is a bigserial — the emission order phase 4 cannot solve for itself', () => {
    // `bigserial` is what makes a four-bubble turn read back in the order Nina emitted it: four
    // rows written in one transaction share `sent_at` to the microsecond, so a timestamp cannot
    // order them and a per-turn integer cannot order two turns in the same instant.
    expect(sqlType(schema.ninaMessages, 'seq')).toBe('bigserial')
    expect(columns(schema.ninaMessages).get('seq')?.notNull).toBe(true)
    expect(columns(schema.ninaMessages).get('id')?.primary).toBe(true)
  })

  it('reply_to_id references itself and run_id references runs, both SET NULL', () => {
    expect(fkFor(schema.ninaMessages, 'reply_to_id')?.onDelete).toBe('set null')
    expect(fkFor(schema.ninaMessages, 'run_id')?.onDelete).toBe('set null')
  })

  it('turn_id carries no FK — an audit pointer must not be able to block a delete', () => {
    expect(fkFor(schema.ninaMessages, 'turn_id')).toBeUndefined()
  })

  it('has the six indexes the reads need — four F33 and two F35', () => {
    expect(indexNames(schema.ninaMessages)).toEqual([
      'nina_messages_reply_to_idx',
      'nina_messages_session_seq_idx',
      'nina_messages_user_run_idx',
      'nina_messages_user_seq_idx',
      'nina_messages_user_session_runner_idx',
      'nina_messages_user_unread_idx',
    ])
  })
})

describe('nina_message_images', () => {
  it('is its own table with a description column, because phase 13 queries it directly', () => {
    expect(sqlType(schema.ninaMessageImages, 'description')).toBe('text')
    expect(columns(schema.ninaMessageImages).get('description')?.notNull).toBe(false)
  })

  it('message_id is NULLABLE and SETS NULL, so a deleted session orphans a photograph (R1)', () => {
    // The reversal this whole plan set exists for. The column's comment used to read "an image with
    // no message is nothing"; the runner measured that as loss — "photos collection that were
    // painstakingly generated by llm, will be deleted if user delete chat session … just let the
    // photos be". `set null` rather than `no action` because a session delete must not be BLOCKED
    // by its photographs, which would be a worse bug than the one being fixed.
    expect(columns(schema.ninaMessageImages).get('message_id')?.notNull).toBe(false)
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('set null')
  })

  it('carries F37 provenance: two nullable pointers, so a reference is representable', () => {
    for (const column of ['source_avatar_id', 'source_image_id']) {
      expect(sqlType(schema.ninaMessageImages, column), column).toBe('text')
      expect(columns(schema.ninaMessageImages).get(column)?.notNull, column).toBe(false)
      /* NULLABLE is what let these be added to a populated table with no backfill of their own —
       * `nina_avatars.source_key`'s recorded property, and the reason drizzle/0010 rewrites no
       * rows. It is also the DEFINITION: both NULL means "these bytes are this row's own". */
      expect(columns(schema.ninaMessageImages).get(column)?.hasDefault, column).toBe(false)
    }
  })

  it('points source_avatar_id at the album and source_image_id at itself', () => {
    const avatarFk = fkFor(schema.ninaMessageImages, 'source_avatar_id')
    const imageFk = fkFor(schema.ninaMessageImages, 'source_image_id')
    expect(cfg(avatarFk!.reference().foreignTable).name).toBe('nina_avatars')
    /* Self-referencing, on nina_messages.reply_to_id's precedent — the repo's other nullable
     * pointer from a row to an earlier row of the same table. */
    expect(cfg(imageFk!.reference().foreignTable).name).toBe('nina_message_images')
  })

  it('SETS NULL on both, so deleting an original keeps the picture instead of losing it', () => {
    /* THE decision of phase 1, and the one a "consistency" edit would get wrong. CASCADE here
     * would delete a photograph out of a live conversation because an unrelated row was tidied
     * away — the exact data loss `isBlobPathnameReferenced` exists to prevent. SET NULL instead
     * demotes the copy to an original, which is honest: the bytes are still there and are now
     * nobody else's. */
    expect(fkFor(schema.ninaMessageImages, 'source_avatar_id')?.onDelete).toBe('set null')
    expect(fkFor(schema.ninaMessageImages, 'source_image_id')?.onDelete).toBe('set null')
  })

  it('adds no index for them — they are residual predicates, like kind', () => {
    // `generatedChatPhotoScope` argues this in full for `kind` at the same table size. An index
    // asserted as an ABSENCE so that adding one is a decision somebody makes on purpose. One
    // such decision since media-dedupe P1: `…_user_content_hash_idx` — the write-time dedup
    // lookup, partial (content_hash IS NOT NULL) and non-unique; the column's header carries the
    // reasoning in full.
    expect(indexNames(schema.ninaMessageImages)).toEqual([
      'nina_message_images_message_idx',
      'nina_message_images_user_content_hash_idx',
      'nina_message_images_user_created_idx',
    ])
  })
})

describe('memory: the slots, the ledger, and R26 hand-editing', () => {
  it('is keyed (user_id, key) for slots and by id for the ledger', () => {
    expect(cfg(schema.ninaMemorySlots).primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'user_id',
      'key',
    ])
    expect(columns(schema.ninaMemoryFacts).get('id')?.primary).toBe(true)
  })

  it('slot values are jsonb, so one column holds a phrase and pending_promises alike', () => {
    expect(sqlType(schema.ninaMemorySlots, 'value')).toBe('jsonb')
    expect(schema.NINA_SLOT_PENDING_PROMISES).toBe('pending_promises')
  })

  it('source_message_id is NULLABLE on both, because the admin editor types rows the chat never said', () => {
    expect(columns(schema.ninaMemorySlots).get('source_message_id')?.notNull).toBe(false)
    expect(columns(schema.ninaMemoryFacts).get('source_message_id')?.notNull).toBe(false)
    /*
     * And neither is an FK — still true after R8, and now for a sharper reason than "provenance
     * must not block a delete". `removeNinaSession` purges these rows itself, in the same
     * transaction as the session delete (`tests/nina.sessionPurge.test.ts` proves it), precisely so
     * that a SESSION delete takes the memory while a MESSAGE delete does not. An
     * `ON DELETE CASCADE` cannot express that difference, and it would also reach a row an admin
     * asserted. The NULL this test insists on is what makes an admin row structurally unreachable
     * by the purge: `source_message_id IS NULL` never matches an `IN`.
     */
    expect(fkFor(schema.ninaMemorySlots, 'source_message_id')).toBeUndefined()
    expect(fkFor(schema.ninaMemoryFacts, 'source_message_id')).toBeUndefined()
  })

  it('both carry a source discriminator defaulting to distilled', () => {
    expect(sqlType(schema.ninaMemorySlots, 'source')).toBe('text')
    expect(columns(schema.ninaMemorySlots).get('source')?.notNull).toBe(true)
    expect(columns(schema.ninaMemoryFacts).get('source')?.notNull).toBe(true)
  })

  // This replaces "confidence is an integer percent, not a float probability". Task #135 dropped
  // that column (`drizzle/0011`), and the column list is asserted WHOLE rather than the removal
  // being asserted as one absence — same reasoning as `ninaMessageImages`'s index assertion
  // above: re-adding `confidence`, or any other column, becomes a decision somebody makes on
  // purpose instead of a diff nobody notices.
  it('carries exactly the seven columns the ledger needs, and no confidence', () => {
    expect(names(schema.ninaMemoryFacts)).toEqual(
      ['id', 'user_id', 'category', 'text', 'source', 'source_message_id', 'created_at'].sort(),
    )
  })
})

describe('nina_avatars', () => {
  it('carries exactly the twenty columns phases 12-15 and F34 were written against', () => {
    expect(names(schema.ninaAvatars)).toEqual(
      [
        'id',
        'user_id',
        'blob_url',
        'pathname',
        // F34 R1: the album is a file manager, so a photo knows its folder, its name on the
        // laptop, the dedupe key it was registered under, and where its grid thumbnail lives.
        'folder',
        'filename',
        'source_key',
        'thumb_url',
        'thumb_pathname',
        'width',
        'height',
        'bytes',
        'source',
        'crop_scale',
        'crop_x',
        'crop_y',
        'description',
        'is_current',
        'announced_at',
        'created_at',
      ].sort(),
    )
  })

  it('folder is NOT NULL DEFAULT — which is what puts every pre-F34 row at the root (F34 R1)', () => {
    // The whole migration story, asserted: a constant default rather than a backfill script.
    // `419167d` is the precedent for the other case, where a value had to be derived per row.
    expect(sqlType(schema.ninaAvatars, 'folder')).toBe('text')
    expect(columns(schema.ninaAvatars).get('folder')?.notNull).toBe(true)
    expect(columns(schema.ninaAvatars).get('folder')?.hasDefault).toBe(true)
  })

  it('the other four F34 columns are nullable, which is what made the unique index safe to add', () => {
    // Postgres unique indexes treat NULLs as DISTINCT, so every pre-F34 row carries NULL
    // `source_key` and coexists with every other. `NULLS NOT DISTINCT` would have made the
    // migration fail on the second existing row.
    for (const column of ['filename', 'source_key', 'thumb_url', 'thumb_pathname']) {
      expect(columns(schema.ninaAvatars).get(column)?.notNull, column).toBe(false)
      expect(columns(schema.ninaAvatars).get(column)?.hasDefault, column).toBe(false)
    }
  })

  it('has the folder page index and the dedupe-key unique index beside the two it already had', () => {
    expect(indexNames(schema.ninaAvatars)).toEqual([
      'nina_avatars_user_created_idx',
      'nina_avatars_user_current_unq',
      'nina_avatars_user_folder_created_idx',
      'nina_avatars_user_source_key_unq',
    ])
    // Two indexes, two reads: the folder index does NOT subsume the created index, because
    // "the whole album, newest first" puts no equality on `folder` and would have to sort.
    const unq = cfg(schema.ninaAvatars).indexes.find(
      (i) => i.config.name === 'nina_avatars_user_source_key_unq',
    )
    expect(unq?.config.unique).toBe(true)
    // NOT partial, unlike `nina_avatars_user_current_unq`: NULLs being DISTINCT is what exempts
    // the pre-F34 rows, so no WHERE clause is needed to do it.
    expect(unq?.config.where).toBeUndefined()
  })

  it('has a PARTIAL unique index on (user_id) where is_current, so two current avatars cannot exist', () => {
    const unq = cfg(schema.ninaAvatars).indexes.find(
      (i) => i.config.name === 'nina_avatars_user_current_unq',
    )
    expect(unq).toBeDefined()
    expect(unq?.config.unique).toBe(true)
    // The WHERE is what makes an ALBUM possible at all — a plain unique index would allow one
    // avatar per user, ever. Same shape as shares_run_id_active_unq.
    expect(unq?.config.where).toBeDefined()
  })

  it('announced_at and the crop triple are nullable — NULL is the pre-phase-15 answer', () => {
    for (const column of ['announced_at', 'crop_scale', 'crop_x', 'crop_y', 'description']) {
      expect(columns(schema.ninaAvatars).get(column)?.notNull, column).toBe(false)
    }
  })

  it('crop_scale is numeric(5, 3) and the offsets are integers (per-mille of the frame)', () => {
    expect(sqlType(schema.ninaAvatars, 'crop_scale')).toBe('numeric(5, 3)')
    expect(sqlType(schema.ninaAvatars, 'crop_x')).toBe('integer')
    expect(sqlType(schema.ninaAvatars, 'crop_y')).toBe('integer')
  })
})

describe('nina_folders', () => {
  it('is keyed (user_id, folder), so a double declaration is impossible', () => {
    // The `nina_nags` idiom: there is no second fact about a folder to hang a surrogate id on,
    // and the constraint is what lets `declareNinaFolders` be an ON CONFLICT DO NOTHING upsert
    // instead of a read-then-insert that is correct until two tabs race.
    expect(cfg(schema.ninaFolders).primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'user_id',
      'folder',
    ])
  })

  it('holds one fact and nothing else — no blob_url, no count, no is_current', () => {
    // A stored count would be a cache with two writers, which is the exact failure this table's
    // own header is otherwise about. The tree pane's count comes from nina_avatars at read time.
    expect(names(schema.ninaFolders)).toEqual(['user_id', 'folder', 'created_at'].sort())
    expect(columns(schema.ninaFolders).get('folder')?.notNull).toBe(true)
  })

  it('cascades from users, so deleting an account takes its folder declarations with it', () => {
    expect(fkFor(schema.ninaFolders, 'user_id')?.onDelete).toBe('cascade')
  })
})

describe('nina_chat_sessions — F35 R2', () => {
  it('is a table with exactly the six columns the feature was planned against', () => {
    expect(cfg(schema.ninaChatSessions).name).toBe('nina_chat_sessions')
    expect(names(schema.ninaChatSessions)).toEqual(
      ['id', 'user_id', 'title', 'title_source', 'pinned_at', 'created_at'].sort(),
    )
    expect(columns(schema.ninaChatSessions).get('id')?.primary).toBe(true)
  })

  it('cascades from users, so deleting an account takes its sessions with it', () => {
    expect(fkFor(schema.ninaChatSessions, 'user_id')?.onDelete).toBe('cascade')
  })

  it('title and title_source are nullable, and NULL/NULL is "nobody has named this yet"', () => {
    // The only state phase 4's titler may write into, and the state `sessionTitleFor` renders as
    // "Chat baru". `setNinaSessionTitleIfUntitled`'s `isNull` predicate is its idempotence.
    expect(sqlType(schema.ninaChatSessions, 'title')).toBe('text')
    expect(columns(schema.ninaChatSessions).get('title')?.notNull).toBe(false)
    expect(columns(schema.ninaChatSessions).get('title_source')?.notNull).toBe(false)
  })

  it('pinned_at is a nullable timestamp, not an is_pinned boolean (R4)', () => {
    expect(sqlType(schema.ninaChatSessions, 'pinned_at')).toBe('timestamp with time zone')
    expect(columns(schema.ninaChatSessions).get('pinned_at')?.notNull).toBe(false)
  })

  it('carries no last_user_message_at — R5 derives it, because a watermark is a cache with four writers', () => {
    expect(names(schema.ninaChatSessions)).not.toContain('last_user_message_at')
    // And no archive flag: R11 is a hard delete, or an archived session still answers
    // getNinaMessageWindow and removing it means nothing.
    expect(names(schema.ninaChatSessions)).not.toContain('archived_at')
  })

  it('has one index, (user_id, created_at desc) — the whole of the only read', () => {
    expect(indexNames(schema.ninaChatSessions)).toEqual(['nina_chat_sessions_user_created_idx'])
  })
})

describe('nina_messages.session_id — F35 R2 and R11', () => {
  it('is NOT NULL, so a message with no session is unrepresentable', () => {
    expect(sqlType(schema.ninaMessages, 'session_id')).toBe('text')
    expect(columns(schema.ninaMessages).get('session_id')?.notNull).toBe(true)
  })

  it('CASCADES to the messages — and STOPS at their photographs (R11, then R1)', () => {
    // The cascade takes the messages. It used to chain one hop further through
    // nina_message_images.message_id and destroy the photograph rows, and the schema header stated
    // that as part of what R11 asked for. R1 reversed it: the photographs are orphaned, not
    // deleted, and `removeNinaSession` did not change to get that — the FK did.
    // The Blob bytes are still deliberately left, and are now not even orphaned, because a live row
    // still points at each one. The memory ledger's source_message_id pointers are NOT left: R8
    // made removeNinaSession purge them in the same transaction, without a foreign key — see the
    // schema header and tests/nina.sessionPurge.test.ts.
    expect(fkFor(schema.ninaMessages, 'session_id')?.onDelete).toBe('cascade')
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('set null')
  })
})

describe('nina_tuning', () => {
  it('is one row per user, keyed by user_id alone, cascading from the account', () => {
    // One row per user, so there is no second fact to hang a surrogate id on — the `nina_nags` /
    // `nina_folders` natural-key idiom with one column instead of two. It is also what lets
    // `writeNinaTuning` be a single ON CONFLICT DO UPDATE upsert of the whole row.
    expect(cfg(schema.ninaTuning).name).toBe('nina_tuning')
    expect(columns(schema.ninaTuning).get('user_id')?.primary).toBe(true)
    expect(cfg(schema.ninaTuning).primaryKeys.length).toBe(0)
    expect(fkFor(schema.ninaTuning, 'user_id')?.onDelete).toBe('cascade')
  })

  it('spells exactly the thirty-seven columns phases 3, 4, 5 and R4 were written against', () => {
    expect(names(schema.ninaTuning)).toEqual(
      [
        'user_id',
        'relationship',
        // R1's eleven traits plus R3's `horny`, in the order the user wrote them.
        'anger',
        'chill',
        'sad',
        'flirty',
        'steamy',
        'wise',
        'annoying',
        'funny',
        'happy',
        'anxious',
        'concerned',
        'horny',
        // R3 — the four dials that each name a line of shipping code.
        'profanity',
        'clinginess',
        'photo_eagerness',
        'verbosity',
        'notes',
        // R4 — one enable flag per parameter, in the same order.
        'relationship_enabled',
        'anger_enabled',
        'chill_enabled',
        'sad_enabled',
        'flirty_enabled',
        'steamy_enabled',
        'wise_enabled',
        'annoying_enabled',
        'funny_enabled',
        'happy_enabled',
        'anxious_enabled',
        'concerned_enabled',
        'horny_enabled',
        'profanity_enabled',
        'clinginess_enabled',
        'photo_eagerness_enabled',
        'verbosity_enabled',
        'updated_at',
      ].sort(),
    )
  })

  it('gives every parameter an enable column, derived from NINA_TUNING_KEYS (R4)', () => {
    const declared = new Set(names(schema.ninaTuning))
    for (const key of NINA_TUNING_KEYS) {
      expect(declared.has(`${snake(key)}_enabled`), key).toBe(true)
      expect(sqlType(schema.ninaTuning, `${snake(key)}_enabled`), key).toBe('boolean')
    }
    /* RECONCILED — DERIVED, never the literal 16. This assertion read `toHaveLength(16)` in the
     * draft, and phase 5 adds `horny` to `NINA_TRAITS`, which makes it 17 and turns a passing test
     * into a phase-5 failure that says nothing about phase 5's bug. The point of the case is that
     * the array is the spread and has no duplicates, and that is what it now says. */
    expect(NINA_TUNING_KEYS).toEqual(['relationship', ...NINA_TRAITS, ...NINA_DIALS])
    expect(new Set(NINA_TUNING_KEYS).size).toBe(NINA_TUNING_KEYS.length)
  })

  it('leaves every enable column NULLABLE with no default, which IS the backfill (R4)', () => {
    /* NULL means one thing only — a row written before the toggles existed. `coerceNinaEnabled`
     * reads anything that is not literally `false` as ON, so an existing production row is
     * all-enabled the moment the migration lands, with no UPDATE behind it. A `DEFAULT true` would
     * be `NINA_ENABLED_DEFAULTS` restated in SQL, which this table's own header forbids. */
    for (const key of NINA_TUNING_KEYS) {
      const column = columns(schema.ninaTuning).get(`${snake(key)}_enabled`)
      expect(column?.notNull, key).toBe(false)
      expect(column?.hasDefault, key).toBe(false)
    }
  })

  it('maps every enable column in BOTH directions, which drizzle cannot check for a nullable one', () => {
    /* A nullable column is optional in `NewNinaTuningRow`, so a key forgotten in `tuningToColumns`
     * is not a compile error — it is a toggle that never persists. This is the guard for that, and
     * it is what makes the next dial's toggle land with its row mapping or not at all. */
    const source = readFileSync('lib/nina/queries.ts', 'utf8')
    for (const key of NINA_TUNING_KEYS) {
      /* The READ side nests under `enabled`, so it is keyed by the TUNING key and valued by the
       * COLUMN — `relationship: row.relationshipEnabled`. The write side is flat columns, so it is
       * the other way round. Both spellings are asserted as they are actually written; a key
       * forgotten in either direction still fails here, which is the whole point of the case. */
      expect(source, `${key} is not read out of the row`).toContain(`${key}: row.${key}Enabled`)
      expect(source, `${key} is not written to the row`).toContain(
        `${key}Enabled: tuning.enabled.${key}`,
      )
    }
  })

  it('agrees with lib/nina/tuning.ts about every score column, which is the only duplication', () => {
    // `lib/nina/tuning.ts` must stay importable from a `'use client'` file, so it cannot import
    // this module — and this module must not import UPWARD from `lib/nina/`. So the two spell the
    // same score keys independently — twelve traits and four dials — and THIS is what makes that
    // checked rather than intended.
    // The RULING A6 shape: `tests/nina.imagerecipe.test.ts` does exactly this for NINA_BLOB_PREFIX.
    const declared = new Set(names(schema.ninaTuning))
    for (const trait of NINA_TRAITS) expect(declared.has(trait), trait).toBe(true)
    for (const dial of NINA_DIALS) expect(declared.has(snake(dial)), dial).toBe(true)
    expect(NINA_TRAITS.length + NINA_DIALS.length).toBe(16)
  })

  it('stores every intensity as an integer percent, never a float', () => {
    for (const key of [...NINA_TRAITS, ...NINA_DIALS.map(snake)]) {
      expect(sqlType(schema.ninaTuning, key), key).toBe('integer')
    }
  })

  it('carries NO SQL DEFAULT on any stored value — the defaults live in TypeScript', () => {
    // `NINA_TUNING_DEFAULTS` is the compatibility contract: the setting that reproduces the Nina
    // who ships. A `DEFAULT 50` here would be a second copy of it in a second language, drifting
    // silently. Instead: no row means the defaults, and `writeNinaTuning` always supplies all of
    // them because it takes a whole `NinaTuning`.
    for (const key of [
      'relationship',
      ...NINA_TRAITS,
      ...NINA_DIALS.map(snake),
      'notes',
    ]) {
      expect(columns(schema.ninaTuning).get(key)?.notNull, key).toBe(true)
      expect(columns(schema.ninaTuning).get(key)?.hasDefault, key).toBe(false)
    }
    // The one exception, and it is not part of the contract: a timestamp.
    expect(columns(schema.ninaTuning).get('updated_at')?.hasDefault).toBe(true)
  })

  it('leaves relationship as plain text with no CHECK, so a sixth level is not a migration', () => {
    // The `nina_turns.trigger` argument: the vocabulary belongs to `lib/nina/tuning.ts`, and this
    // table must not become the thing a later phase has to migrate to add a level.
    expect(sqlType(schema.ninaTuning, 'relationship')).toBe('text')
    expect(cfg(schema.ninaTuning).checks.length).toBe(0)
  })

  it('has no index at all, because the only read is a primary-key lookup', () => {
    expect(indexNames(schema.ninaTuning)).toEqual([])
  })
})

/**
 * `nina_tuning`'s sibling, and the second table in this file whose columns are a UI's controls.
 * Every assertion here is one `nina_tuning` already makes, asked of the new table — except the two
 * that are about the DIFFERENCES, which are the ones worth reading: the focus flags are `NOT NULL`
 * where the enable flags are nullable, and the reference pair has no foreign key where every other
 * pointer in this schema does.
 */
describe('nina_image_prefs — how she is photographed (R4-R10)', () => {
  it('is keyed by user_id and cascades from the account', () => {
    expect(cfg(schema.ninaImagePrefs).name).toBe('nina_image_prefs')
    expect(columns(schema.ninaImagePrefs).get('user_id')?.primary).toBe(true)
    expect(fkFor(schema.ninaImagePrefs, 'user_id')?.onDelete).toBe('cascade')
  })

  it('spells exactly the seventeen columns phases 2, 3, 4 and 5 were written against', () => {
    expect(names(schema.ninaImagePrefs)).toEqual(
      [
        'user_id',
        // R4 — the slider, read through the five bands.
        'prompt_length',
        // R5 — the six emphasis flags, in the order the user wrote them.
        'focus_face',
        'focus_skin',
        'focus_boobs',
        'focus_butt',
        'focus_thighs',
        'focus_calves',
        // R6-R9 — the four free-text fields. `time_of_day` and not `time`; see the table header.
        'wardrobe',
        'venue',
        'time_of_day',
        'notes',
        // The editable template shell (the 2026-09-10 ask). `''` = the default.
        'prompt_template',
        // §8's camera (the 2026-09-10 ask). The coerced provider id, not a module constant.
        'model',
        // R10 — the chosen photograph, as a set plus an id. Never a blob URL.
        'reference_source',
        'reference_id',
        'updated_at',
      ].sort(),
    )
  })

  it('gives every focus option a boolean column, derived from NINA_IMAGE_FOCUS_KEYS (R5)', () => {
    // DERIVED, never a literal six: a seventh option must arrive with its column or not at all.
    const declared = new Set(names(schema.ninaImagePrefs))
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      expect(declared.has(`focus_${key}`), key).toBe(true)
      expect(sqlType(schema.ninaImagePrefs, `focus_${key}`), key).toBe('boolean')
    }
    expect(new Set(NINA_IMAGE_FOCUS_KEYS).size).toBe(NINA_IMAGE_FOCUS_KEYS.length)
  })

  it('makes every focus flag NOT NULL — the OPPOSITE of nina_tuning *_enabled, on purpose', () => {
    /* Those columns are nullable so that NULL can mean "a row written before the toggles existed",
     * which is a backfill with no UPDATE behind it. There is no such row here: this table is created
     * with all six columns present, so there is no history for NULL to describe — and NOT NULL makes
     * drizzle's insert type refuse an `imagePrefsToColumns` that forgets one, which for a nullable
     * column it cannot do. */
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      const column = columns(schema.ninaImagePrefs).get(`focus_${key}`)
      expect(column?.notNull, key).toBe(true)
      expect(column?.hasDefault, key).toBe(false)
    }
    expect(columns(schema.ninaTuning).get('flirty_enabled')?.notNull).toBe(false)
  })

  it('gives every free-text field a NOT NULL text column, with "" as the empty value', () => {
    for (const key of NINA_IMAGE_TEXT_KEYS) {
      // The one spelling difference in this table: the model key is `time`, the column is
      // `time_of_day`, because a bare `time` column is a Postgres type name.
      const column = key === 'time' ? 'time_of_day' : key
      expect(sqlType(schema.ninaImagePrefs, column), key).toBe('text')
      expect(columns(schema.ninaImagePrefs).get(column)?.notNull, key).toBe(true)
    }
  })

  it('stores the slider as an integer, never a float', () => {
    expect(sqlType(schema.ninaImagePrefs, 'prompt_length')).toBe('integer')
  })

  it('carries NO SQL DEFAULT on any stored value — the defaults live in TypeScript', () => {
    // `NINA_IMAGE_PREFS_DEFAULTS` is the one definition of "unset". A `DEFAULT 50` here would be a
    // second copy of it in a second language, drifting silently. No row means the defaults, and
    // `writeNinaImagePrefs` always supplies all of them because it takes a whole write value.
    for (const key of [
      'prompt_length',
      ...NINA_IMAGE_FOCUS_KEYS.map((k) => `focus_${k}`),
      'wardrobe',
      'venue',
      'time_of_day',
      'notes',
      'reference_source',
      'reference_id',
    ]) {
      expect(columns(schema.ninaImagePrefs).get(key)?.notNull, key).toBe(true)
      expect(columns(schema.ninaImagePrefs).get(key)?.hasDefault, key).toBe(false)
    }
    // The one exception, and it is not part of the contract: a timestamp.
    expect(columns(schema.ninaImagePrefs).get('updated_at')?.hasDefault).toBe(true)
  })

  it('has NO foreign key on the reference pair, because it has two possible parents', () => {
    /* `'album'` is `nina_avatars`, `'chat'` is `nina_message_images`, and no single FK can point at
     * one of two tables. Nor would one be wanted: a cascade would delete a whole preferences row
     * because one photograph was deleted. A dangling id resolves to null in
     * `resolveNinaPhotoReference` and the generation degrades to unanchored. */
    expect(fkFor(schema.ninaImagePrefs, 'reference_id')).toBeUndefined()
    expect(fkFor(schema.ninaImagePrefs, 'reference_source')).toBeUndefined()
    expect(sqlType(schema.ninaImagePrefs, 'reference_source')).toBe('text')
    expect(cfg(schema.ninaImagePrefs).checks.length).toBe(0)
  })

  it('has no index at all, because the only read is a primary-key lookup', () => {
    expect(indexNames(schema.ninaImagePrefs)).toEqual([])
  })

  it('reads every focus column out of the row, which drizzle cannot check', () => {
    /* The WRITE side is compile-checked: the columns are NOT NULL, so a forgotten one is a type
     * error in `imagePrefsToColumns`. The READ side is not — a key forgotten in
     * `imagePrefsFromRow` is `undefined`, which `coerceNinaImageFocus` reads as `false`: a checkbox
     * that persists and then silently does nothing. This is the guard for that direction, the same
     * shape as the `*_enabled` guard above. */
    const source = readFileSync('lib/nina/queries.ts', 'utf8')
    for (const key of NINA_IMAGE_FOCUS_KEYS) {
      const pascal = key.charAt(0).toUpperCase() + key.slice(1)
      expect(source, `${key} is not read out of the row`).toContain(`${key}: row.focus${pascal}`)
      expect(source, `${key} is not written to the row`).toContain(
        `focus${pascal}: prefs.focus.${key}`,
      )
    }
  })
})

describe('nina_nags and nina_turns', () => {
  it('nags are keyed (user_id, code) and remember the DAY, not the instant', () => {
    expect(cfg(schema.ninaNags).primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'user_id',
      'code',
    ])
    expect(sqlType(schema.ninaNags, 'last_mentioned_on')).toBe('date')
  })

  it('turns log cost in integer micro-USD, never a float in dollars', () => {
    expect(sqlType(schema.ninaTurns, 'cost_micro_usd')).toBe('integer')
    expect(sqlType(schema.ninaTurns, 'input_tokens')).toBe('integer')
    expect(sqlType(schema.ninaTurns, 'output_tokens')).toBe('integer')
    expect(sqlType(schema.ninaTurns, 'latency_ms')).toBe('integer')
  })

  it('tool_calls is TEXT with a NOT NULL default — tool NAMES, not a count (RULING C8)', () => {
    // Phase 3's ruling (b) drops the `save_memory` tool if it never fires, and that is only
    // decidable if the column says WHICH tools fired. An integer answers a question nobody asked.
    expect(sqlType(schema.ninaTurns, 'tool_calls')).toBe('text')
    expect(columns(schema.ninaTurns).get('tool_calls')?.notNull).toBe(true)
    expect(columns(schema.ninaTurns).get('tool_calls')?.hasDefault).toBe(true)
  })

  it('args is NULLABLE jsonb, which is what makes RU-20 retryable at all (RULING C1)', () => {
    // The repo is public, so a workflow_dispatch input is world-readable and the prompt has to
    // travel in the row with only an opaque job id in the dispatch; and the `schedule:` backstop
    // wakes with no arguments, so a job whose args are not here can never be retried.
    expect(sqlType(schema.ninaTurns, 'args')).toBe('jsonb')
    expect(columns(schema.ninaTurns).get('args')?.notNull).toBe(false)
    expect(columns(schema.ninaTurns).get('args')?.hasDefault).toBe(false)
  })

  it('status is plain text with no CHECK, so adding a member is not a migration', () => {
    // `NinaTurnStatus` gained 'pending' under RULING C2 with no SQL change at all. That property
    // is the reason `kind`, `trigger`, `source` and `status` are all `text` + `.$type<>()`.
    expect(sqlType(schema.ninaTurns, 'status')).toBe('text')
    expect(columns(schema.ninaTurns).get('status')?.notNull).toBe(true)
  })
})

describe('push_subscriptions', () => {
  it('is unique per endpoint but keyed by a nanoid, because an endpoint is a 300-char URL', () => {
    expect(columns(schema.pushSubscriptions).get('id')?.primary).toBe(true)
    const unq = cfg(schema.pushSubscriptions).indexes.find(
      (i) => i.config.name === 'push_subscriptions_endpoint_unq',
    )
    expect(unq?.config.unique).toBe(true)
  })
})

/**
 * R8's three collateral facts, pinned. F35 phase 7 (edit and delete a message) adds no column, so
 * its correctness rests entirely on what these foreign keys already do — asserted here rather than
 * assumed in a plan.
 *
 * Three of the five facts phase 7 depends on were already pinned above and are NOT repeated:
 * `reply_to_id`'s `SET NULL` and `turn_id`'s missing FK are in `nina_messages`, the
 * `nina_message_images.message_id` cascade is in `nina_message_images`, and both memory tables'
 * FK-less `source_message_id` is in the memory block. What is added here is the pair that had no
 * home: that `reply_to_id` points at THIS table (a self-FK — the reason a delete degrades a quote
 * rather than orphaning it), and that `nina_turns` stores no prose for an edited message to
 * contradict.
 */
describe('deleting or editing a nina message: what the database does on its own (F35 R8)', () => {
  it('reply_to_id is a SELF-FK, so a deleted message degrades its own quotes to plain text', () => {
    const fk = fkFor(schema.ninaMessages, 'reply_to_id')
    expect(fk).toBeDefined()
    expect(fk?.reference().foreignTable).toBe(schema.ninaMessages)
    expect(fk?.onDelete).toBe('set null')
  })

  it('nina_turns carries no message text, so an edit contradicts nothing stored', () => {
    // The turn row asserts that a model call happened and what it cost — never what was said. That
    // is why `updateNinaMessage` leaves `turn_id` alone: there is no second copy to disagree with.
    const turnColumns = names(schema.ninaTurns)
    for (const forbidden of ['text', 'request', 'response', 'prompt', 'body', 'bubbles']) {
      expect(turnColumns).not.toContain(forbidden)
    }
  })
})

/**
 * R2's one schema change. The column is additive, nullable and default-less, and each of those
 * three properties is doing a job: additive so no row moves, nullable so NULL means "visible" for
 * every row written before the feature existed, default-less so the migration IS the backfill —
 * the `*_enabled` columns' idiom, asserted the same way they are.
 */
describe('nina_turns.deleted_at — the soft delete (R2)', () => {
  it('is a nullable timestamptz with NO default, so every pre-R2 row reads "visible"', () => {
    expect(sqlType(schema.ninaTurns, 'deleted_at')).toBe('timestamp with time zone')
    expect(columns(schema.ninaTurns).get('deleted_at')?.notNull).toBe(false)
    expect(columns(schema.ninaTurns).get('deleted_at')?.hasDefault).toBe(false)
  })

  it('is a TIMESTAMP and not an is_deleted boolean, because "when" is free and answers more', () => {
    // `nina_chat_sessions.pinned_at` made the same call for the same reason (R4). A boolean would
    // hold strictly less and cost exactly the same.
    const turnColumns = names(schema.ninaTurns)
    expect(turnColumns).toContain('deleted_at')
    expect(turnColumns).not.toContain('is_deleted')
    expect(turnColumns).not.toContain('deleted')
  })

  it('is not an archive: there is no trash view, no restored_at and no deleted_by', () => {
    // Nobody asked for an undo screen. What the nullable column buys is `set deleted_at = null`
    // in psql — a recoverable mistake, not a feature surface.
    const turnColumns = names(schema.ninaTurns)
    expect(turnColumns).not.toContain('restored_at')
    expect(turnColumns).not.toContain('deleted_by')
  })

  it('adds NO index — nina_turns still has exactly the one it shipped with', () => {
    /* The arithmetic is in `lib/db/schema.ts` and this is what keeps it honest: the daily cap is
     * six image rows per user, the list read is LIMIT 60 over `(user_id, created_at desc)`, and
     * `deleted_at IS NULL` is a heap predicate on tuples `kind = 'image'` had already fetched. A
     * partial index would cost a write on every turn Nina ever takes to save microseconds on a
     * page opened by hand. */
    expect(indexNames(schema.ninaTurns)).toEqual(['nina_turns_user_created_idx'])
  })
})

describe('nina_shortcuts — the trigger registry (F36)', () => {
  it('is a table with exactly the twelve columns phases 2, 3 and 4 were written against', () => {
    expect(cfg(schema.ninaShortcuts).name).toBe('nina_shortcuts')
    expect(names(schema.ninaShortcuts)).toEqual(
      [
        'id',
        'user_id',
        // Two columns for one trigger: what he typed, and what matching uses. See the header.
        'trigger',
        'match_key',
        'kind',
        'label',
        'expansion',
        'enabled',
        // Telemetry — which codes actually fire. Nothing on the turn path reads them.
        'uses',
        'last_used_at',
        'created_at',
        'updated_at',
      ].sort(),
    )
    expect(columns(schema.ninaShortcuts).get('id')?.primary).toBe(true)
  })

  it('cascades from users, so deleting the account takes the registry with it', () => {
    expect(fkFor(schema.ninaShortcuts, 'user_id')?.onDelete).toBe('cascade')
  })

  it('carries NO source_message_id and NO source — there is no distilled shortcut', () => {
    // Every row is authored by a human on /admin/shortcuts or lifted from the ledger by phase 4.
    // Their absence is also what makes removeNinaSession's memory purge — which matches on
    // `source_message_id IN (…)` — structurally unable to reach this table.
    expect(names(schema.ninaShortcuts)).not.toContain('source_message_id')
    expect(names(schema.ninaShortcuts)).not.toContain('source')
    expect(names(schema.ninaShortcuts)).not.toContain('confidence')
  })

  it('has the unique key on (user_id, match_key), which is the duplicate check itself', () => {
    expect(indexNames(schema.ninaShortcuts)).toEqual([
      'nina_shortcuts_user_enabled_idx',
      'nina_shortcuts_user_match_unq',
    ])
    const unq = cfg(schema.ninaShortcuts).indexes.find(
      (i) => i.config.name === 'nina_shortcuts_user_match_unq',
    )
    expect(unq?.config.unique).toBe(true)
    // NOT partial: every row claims a key, so there is nothing to exempt.
    expect(unq?.config.where).toBeUndefined()
    expect(unq?.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual([
      'user_id',
      'match_key',
    ])
  })

  it('indexes (user_id, enabled) for the every-turn read', () => {
    const idx = cfg(schema.ninaShortcuts).indexes.find(
      (i) => i.config.name === 'nina_shortcuts_user_enabled_idx',
    )
    expect(idx?.config.unique).toBe(false)
  })

  it('leaves kind as plain text with no CHECK, so lib/nina/shortcuts.ts owns the vocabulary', () => {
    // The `nina_tuning.relationship` argument, and here it also buys the client-safety property:
    // `lib/nina/shortcuts.ts` must stay importable from a 'use client' file, so it cannot import
    // this module — and typing the column would mean importing UPWARD or restating the union.
    expect(sqlType(schema.ninaShortcuts, 'kind')).toBe('text')
    expect(cfg(schema.ninaShortcuts).checks.length).toBe(0)
    expect(columns(schema.ninaShortcuts).get('match_key')?.notNull).toBe(true)
    expect(columns(schema.ninaShortcuts).get('trigger')?.notNull).toBe(true)
  })

  it('is enabled by default, has never been used by default, and says so with NULL', () => {
    expect(sqlType(schema.ninaShortcuts, 'enabled')).toBe('boolean')
    expect(columns(schema.ninaShortcuts).get('enabled')?.notNull).toBe(true)
    expect(columns(schema.ninaShortcuts).get('enabled')?.hasDefault).toBe(true)
    expect(sqlType(schema.ninaShortcuts, 'uses')).toBe('integer')
    expect(columns(schema.ninaShortcuts).get('uses')?.notNull).toBe(true)
    expect(columns(schema.ninaShortcuts).get('uses')?.hasDefault).toBe(true)
    // NULL = this code has never fired. A real answer, and the one phase 3 renders as "never".
    expect(sqlType(schema.ninaShortcuts, 'last_used_at')).toBe('timestamp with time zone')
    expect(columns(schema.ninaShortcuts).get('last_used_at')?.notNull).toBe(false)
  })
})
