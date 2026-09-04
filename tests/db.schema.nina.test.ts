import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from '@/lib/db/schema'

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
        'turn_id',
        'reply_to_id',
        'run_id',
        'sent_at',
        'delivered_at',
        'read_at',
      ].sort(),
    )
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
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('cascade')
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
    // And neither is an FK: provenance must not be able to block a conversation delete.
    expect(fkFor(schema.ninaMemorySlots, 'source_message_id')).toBeUndefined()
    expect(fkFor(schema.ninaMemoryFacts, 'source_message_id')).toBeUndefined()
  })

  it('both carry a source discriminator defaulting to distilled', () => {
    expect(sqlType(schema.ninaMemorySlots, 'source')).toBe('text')
    expect(columns(schema.ninaMemorySlots).get('source')?.notNull).toBe(true)
    expect(columns(schema.ninaMemoryFacts).get('source')?.notNull).toBe(true)
  })

  it('confidence is an integer percent, not a float probability', () => {
    expect(sqlType(schema.ninaMemoryFacts, 'confidence')).toBe('integer')
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

  it('CASCADES, which is what makes removing a session take its messages (R11)', () => {
    // …and through nina_message_images.message_id's own cascade, their image rows. The blobs and
    // the memory ledger's source_message_id pointers are deliberately left — see the schema header.
    expect(fkFor(schema.ninaMessages, 'session_id')?.onDelete).toBe('cascade')
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('cascade')
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
