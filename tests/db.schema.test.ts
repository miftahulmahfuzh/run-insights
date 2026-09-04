import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from '@/lib/db/schema'

/**
 * The schema is a transcription of ROADMAP_v0.1.0.md §4.3 plus the RECONCILIATION rulings that
 * amend it. This file re-derives the contract FROM THE ROADMAP, so that a typo in schema.ts
 * fails here rather than surfacing as a wrong number in a rollup six features later.
 */

type AnyTable = PgTable

function cfg(table: AnyTable) {
  return getTableConfig(table)
}
function columnMap(table: AnyTable): Map<string, ReturnType<typeof cfg>['columns'][number]> {
  return new Map(cfg(table).columns.map((c) => [c.name, c]))
}
function sqlType(table: AnyTable, column: string): string {
  const col = columnMap(table).get(column)
  if (!col) throw new Error(`no column ${column} on ${cfg(table).name}`)
  return col.getSQLType()
}
function fkFor(table: AnyTable, column: string) {
  return cfg(table).foreignKeys.find((fk) =>
    fk
      .reference()
      .columns.map((c) => c.name)
      .includes(column),
  )
}
function indexNames(table: AnyTable): string[] {
  return cfg(table).indexes.map((i) => i.config.name ?? '(unnamed)')
}
function compositePk(table: AnyTable): string[] {
  return cfg(table).primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name))
}

describe('SQL table names', () => {
  it('names the 4 Auth.js tables the adapter expects and the 10 app tables the roadmap lists', () => {
    expect(cfg(schema.users).name).toBe('user')
    expect(cfg(schema.accounts).name).toBe('account')
    expect(cfg(schema.sessions).name).toBe('session')
    expect(cfg(schema.verificationTokens).name).toBe('verificationToken')

    expect(cfg(schema.profiles).name).toBe('profiles')
    expect(cfg(schema.extractions).name).toBe('extractions')
    expect(cfg(schema.runs).name).toBe('runs')
    expect(cfg(schema.runSplits).name).toBe('run_splits')
    expect(cfg(schema.runZones).name).toBe('run_zones')
    expect(cfg(schema.runPhotos).name).toBe('run_photos')
    expect(cfg(schema.insights).name).toBe('insights')
    expect(cfg(schema.records).name).toBe('records')
    expect(cfg(schema.badges).name).toBe('badges')
    expect(cfg(schema.shares).name).toBe('shares')
  })
})

describe('Auth.js adapter tables', () => {
  it('keeps the adapter camelCase column names — these are not ours to snake_case', () => {
    expect([...columnMap(schema.users).keys()].sort()).toEqual(
      ['email', 'emailVerified', 'id', 'image', 'name'].sort(),
    )
    expect(columnMap(schema.accounts).has('providerAccountId')).toBe(true)
    expect(columnMap(schema.accounts).has('refresh_token')).toBe(true) // adapter's own snake case
    expect(columnMap(schema.sessions).has('sessionToken')).toBe(true)
  })

  it('user.email is unique — the adapter relies on it for account linking', () => {
    expect(columnMap(schema.users).get('email')?.isUnique).toBe(true)
  })

  it('account and verificationToken carry composite primary keys', () => {
    expect(compositePk(schema.accounts)).toEqual(['provider', 'providerAccountId'])
    expect(compositePk(schema.verificationTokens)).toEqual(['identifier', 'token'])
  })

  it('cascades account and session deletion from user', () => {
    expect(fkFor(schema.accounts, 'userId')?.onDelete).toBe('cascade')
    expect(fkFor(schema.sessions, 'userId')?.onDelete).toBe('cascade')
  })
})

describe('units — roadmap §4.2 / D5: integers in the smallest sensible unit', () => {
  it('every measured run column is integer', () => {
    for (const column of [
      'duration_sec',
      'distance_m',
      'active_kcal',
      'total_kcal',
      'elevation_m',
      'avg_cadence',
      'avg_pace_sec',
      'avg_hr',
      'max_hr',
      'resting_hr',
      'end_hr_bpm',
      'hr_1min_post_bpm',
    ]) {
      expect(sqlType(schema.runs, column), column).toBe('integer')
    }
  })

  it('split, zone and record measurements are integer too', () => {
    for (const column of ['km', 'time_sec', 'pace_sec', 'hr', 'cadence']) {
      expect(sqlType(schema.runSplits, column), column).toBe('integer')
    }
    for (const column of ['zone', 'duration_sec', 'min_bpm', 'max_bpm']) {
      expect(sqlType(schema.runZones, column), column).toBe('integer')
    }
    // best_paced_run stores basis points precisely so this column can stay an integer.
    expect(sqlType(schema.records, 'value')).toBe('integer')
    expect(sqlType(schema.records, 'previous_value')).toBe('integer')
    expect(sqlType(schema.badges, 'count')).toBe('integer')
  })

  it('weight_kg is the one and only numeric column among the F03 tables', () => {
    expect(sqlType(schema.profiles, 'weight_kg')).toBe('numeric(4, 1)')
    const numericColumns = [
      schema.profiles,
      schema.extractions,
      schema.runs,
      schema.runSplits,
      schema.runZones,
      schema.runPhotos,
      schema.insights,
      schema.records,
      schema.badges,
      schema.shares,
    ].flatMap((t) =>
      cfg(t)
        .columns.filter((c) => /^numeric|^real|^double/.test(c.getSQLType()))
        .map((c) => `${cfg(t).name}.${c.name}`),
    )
    expect(numericColumns).toEqual(['profiles.weight_kg'])
  })

  it('calendar days are date, clock times are time — never timestamp (roadmap D6)', () => {
    expect(sqlType(schema.runs, 'occurred_on')).toBe('date')
    expect(sqlType(schema.records, 'achieved_on')).toBe('date')
    expect(sqlType(schema.badges, 'earned_on')).toBe('date')
    expect(sqlType(schema.runs, 'started_at')).toBe('time')
    expect(sqlType(schema.runs, 'ended_at')).toBe('time')
  })

  it('every instant column is timestamptz — a run reviewed at 01:00 WIB is not a UTC yesterday', () => {
    for (const [table, column] of [
      [schema.runs, 'reviewed_at'],
      [schema.runs, 'corrected_at'],
      [schema.runs, 'created_at'],
      [schema.runs, 'updated_at'],
      [schema.extractions, 'created_at'],
      [schema.extractions, 'completed_at'],
      [schema.profiles, 'onboarded_at'],
      [schema.profiles, 'updated_at'],
      [schema.runPhotos, 'created_at'],
      [schema.insights, 'created_at'],
      [schema.records, 'updated_at'],
      [schema.badges, 'created_at'],
      [schema.shares, 'revoked_at'],
      [schema.shares, 'created_at'],
    ] as const) {
      expect(sqlType(table, column), `${cfg(table).name}.${column}`).toBe(
        'timestamp with time zone',
      )
    }
  })
})

describe('runs', () => {
  it('carries exactly the roadmap §4.3 column list, including R-8 and R-9', () => {
    expect([...columnMap(schema.runs).keys()].sort()).toEqual(
      [
        'id',
        'user_id',
        'occurred_on',
        'started_at',
        'ended_at',
        'activity_type',
        'location',
        'duration_sec',
        'distance_m',
        'active_kcal',
        'total_kcal',
        'elevation_m',
        'avg_cadence',
        'avg_pace_sec',
        'avg_hr',
        'max_hr',
        'resting_hr',
        'intent',
        'end_hr_bpm', // R-9
        'hr_1min_post_bpm', // R-9
        'note',
        'source',
        'extraction_id',
        'reviewed_at',
        'corrected_at', // R-8
        'created_at',
        'updated_at',
      ].sort(),
    )
  })

  it('makes NOT NULL exactly the columns a committed run cannot lack', () => {
    const notNull = cfg(schema.runs)
      .columns.filter((c) => c.notNull)
      .map((c) => c.name)
      .sort()
    expect(notNull).toEqual(
      [
        'id',
        'user_id',
        'occurred_on',
        'activity_type',
        'duration_sec',
        'distance_m',
        'avg_pace_sec',
        'source',
        'created_at',
        'updated_at',
      ].sort(),
    )
    // reviewed_at is nullable BY DESIGN (D16) — a NOT NULL here would make the invariant
    // unexpressible and would let a future importer bypass review by construction.
    expect(columnMap(schema.runs).get('reviewed_at')?.notNull).toBe(false)
  })

  it('defaults activity_type to Outdoor Run', () => {
    expect(columnMap(schema.runs).get('activity_type')?.default).toBe('Outdoor Run')
  })

  it('R-5: the dedupe guard is a unique index over an EXPRESSION, not a plain column list', () => {
    const idx = cfg(schema.runs).indexes.find(
      (i) => i.config.name === 'runs_user_occurred_started_unq',
    )
    expect(idx?.config.unique).toBe(true)
    const columns = idx?.config.columns ?? []
    expect(columns).toHaveLength(3)
    // The third entry is a raw SQL expression (coalesce(...)), not a column reference. If a
    // later edit "simplifies" it to the bare column, Postgres stops guarding NULL start times.
    expect('name' in (columns[2] as object)).toBe(false)
    expect(cfg(schema.runs).uniqueConstraints).toHaveLength(0)
  })

  it('R-12: has the three indexes every hot read needs and no more', () => {
    expect(indexNames(schema.runs).sort()).toEqual([
      'runs_user_maxhr_idx',
      'runs_user_occurred_idx',
      'runs_user_occurred_started_unq',
    ])
  })

  it('cascades from user, and deliberately does NOT cascade from extraction', () => {
    expect(fkFor(schema.runs, 'user_id')?.onDelete).toBe('cascade')
    // extractions are never deleted (D3), so this FK never fires — but it must not be a
    // cascade either, or deleting the audit trail would delete the run it documents.
    expect(fkFor(schema.runs, 'extraction_id')?.onDelete).toBe('no action')
  })
})

describe('child tables of runs', () => {
  it('run_splits and run_zones use natural composite primary keys and carry no user_id', () => {
    expect(compositePk(schema.runSplits)).toEqual(['run_id', 'km'])
    expect(compositePk(schema.runZones)).toEqual(['run_id', 'zone'])
    expect(columnMap(schema.runSplits).has('user_id')).toBe(false)
    expect(columnMap(schema.runZones).has('user_id')).toBe(false)
    expect(columnMap(schema.runPhotos).has('user_id')).toBe(false)
  })

  it('cascades split, zone and photo rows when their run is deleted', () => {
    expect(fkFor(schema.runSplits, 'run_id')?.onDelete).toBe('cascade')
    expect(fkFor(schema.runZones, 'run_id')?.onDelete).toBe('cascade')
    expect(fkFor(schema.runPhotos, 'run_id')?.onDelete).toBe('cascade')
  })

  it('D14: run_splits.partial exists, is NOT NULL and defaults false', () => {
    const partial = columnMap(schema.runSplits).get('partial')
    expect(partial?.getSQLType()).toBe('boolean')
    expect(partial?.notNull).toBe(true)
    expect(partial?.default).toBe(false)
  })
})

describe('run_photos — R-1 and R-11', () => {
  it('R-1: extraction_id is NOT NULL and run_id is NULLABLE', () => {
    // A photo is uploaded before extraction has produced a date, so no run row can exist yet;
    // the extraction is the only thing that does. run_id is backfilled at commit.
    expect(columnMap(schema.runPhotos).get('extraction_id')?.notNull).toBe(true)
    expect(columnMap(schema.runPhotos).get('run_id')?.notNull).toBe(false)
    expect(fkFor(schema.runPhotos, 'extraction_id')?.onDelete).toBe('cascade')
  })

  it('R-11: excluded_from_share is NOT NULL, defaults false', () => {
    const column = columnMap(schema.runPhotos).get('excluded_from_share')
    expect(column?.getSQLType()).toBe('boolean')
    expect(column?.notNull).toBe(true)
    expect(column?.default).toBe(false)
  })

  it('is indexed by both of its parents', () => {
    expect(indexNames(schema.runPhotos).sort()).toEqual([
      'run_photos_extraction_idx',
      'run_photos_run_idx',
    ])
  })

  it('has a free-standing id, because kind is not a natural key', () => {
    expect(columnMap(schema.runPhotos).get('id')?.primary).toBe(true)
    expect(compositePk(schema.runPhotos)).toEqual([])
  })
})

describe('extractions — the audit trail (D3)', () => {
  it('stores the raw response, the token canary and the corrections log', () => {
    expect(sqlType(schema.extractions, 'blob_urls')).toBe('jsonb')
    expect(sqlType(schema.extractions, 'raw_response')).toBe('jsonb')
    expect(sqlType(schema.extractions, 'corrections')).toBe('jsonb')
    expect(sqlType(schema.extractions, 'prompt_tokens')).toBe('integer')
    expect(columnMap(schema.extractions).get('blob_urls')?.notNull).toBe(true)
    expect(columnMap(schema.extractions).get('status')?.notNull).toBe(true)
  })

  it('is indexed newest-first per user', () => {
    expect(indexNames(schema.extractions)).toEqual(['extractions_user_created_idx'])
  })
})

describe('insights — R-11 and R-12', () => {
  it('is keyed by (user, scope, scope_key, facts_hash) so identical facts cannot bill twice', () => {
    const unique = cfg(schema.insights).indexes.find(
      (i) => i.config.name === 'insights_user_scope_key_hash_unq',
    )
    expect(unique?.config.unique).toBe(true)
    expect(unique?.config.columns.map((c) => (c as { name?: string }).name)).toEqual([
      'user_id',
      'scope',
      'scope_key',
      'facts_hash',
    ])
  })

  it('R-12: has the latest-per-scope index F07 reads', () => {
    expect(indexNames(schema.insights).sort()).toEqual([
      'insights_latest_idx',
      'insights_user_scope_key_hash_unq',
    ])
  })

  it('payload is NOT NULL — an insight row with no prose is not a row worth keeping', () => {
    expect(columnMap(schema.insights).get('payload')?.notNull).toBe(true)
  })
})

describe('records and badges — the asymmetry is the point (D7 / R-10 / R-22)', () => {
  it('records is keyed (user_id, key); badges is a ledger keyed (user_id, key, dedupe_key)', () => {
    // F13. One record row per key, because a record is a statement about the current best. One
    // badge row per EARN, because a badge is a fact about the past and the count of them is the
    // thing the shelf reports — a count the primary key now enforces instead of an increment.
    expect(compositePk(schema.records)).toEqual(['user_id', 'key'])
    expect(compositePk(schema.badges)).toEqual(['user_id', 'key', 'dedupe_key'])
  })

  it('badges.dedupe_key is a NOT NULL text column, and is NOT generated', () => {
    const column = columnMap(schema.badges).get('dedupe_key')
    expect(sqlType(schema.badges, 'dedupe_key')).toBe('text')
    expect(column?.notNull).toBe(true)
    /* The whole of F13 §2.2. A generated `coalesce(run_id, scope_key, '')` would recompute when
     * R-22's SET NULL fires, collapse every session award for the deleted run onto one key, and
     * make deleting that run fail on a primary-key violation. */
    expect(column?.generated).toBeUndefined()
  })

  it('indexes (user_id, run_id) — the ledger is too long to filter in TypeScript', () => {
    expect(indexNames(schema.badges)).toContain('badges_user_run_idx')
  })

  it('records.run_id is NOT NULL and cascades — a record without its run is meaningless', () => {
    expect(columnMap(schema.records).get('run_id')?.notNull).toBe(true)
    expect(fkFor(schema.records, 'run_id')?.onDelete).toBe('cascade')
  })

  it('R-22: badges.run_id is nullable and SET NULL — the only non-cascade FK among the F03 tables', () => {
    expect(columnMap(schema.badges).get('run_id')?.notNull).toBe(false)
    expect(fkFor(schema.badges, 'run_id')?.onDelete).toBe('set null')

    const nonCascade = [
      schema.profiles,
      schema.extractions,
      schema.runs,
      schema.runSplits,
      schema.runZones,
      schema.runPhotos,
      schema.insights,
      schema.records,
      schema.badges,
      schema.shares,
    ].flatMap((t) =>
      cfg(t)
        .foreignKeys.filter((fk) => fk.onDelete !== 'cascade')
        .map(
          (fk) =>
            `${cfg(t).name}.${fk
              .reference()
              .columns.map((c) => c.name)
              .join('+')}=${fk.onDelete}`,
        ),
    )
    // Exactly two FKs are not cascades, and both are deliberate: badge history survives its
    // run, and a run survives its (never-deleted) extraction.
    expect(nonCascade.sort()).toEqual(['badges.run_id=set null', 'runs.extraction_id=no action'])

    // F33 adds two more `set null` FKs, both on nina_messages, and both deliberate — see that
    // table's header. Asserted here so the count is a fact rather than a comment.
    expect(fkFor(schema.ninaMessages, 'reply_to_id')?.onDelete).toBe('set null')
    expect(fkFor(schema.ninaMessages, 'run_id')?.onDelete).toBe('set null')
  })

  it('badges.count defaults to 1 — every row this app writes is exactly one earn', () => {
    // Post-F13 the column is a fold, not a tally: it reads 1 on every row written since the
    // ledger migration, and carries the pre-ledger aggregate on the rows that predate it.
    expect(columnMap(schema.badges).get('count')?.default).toBe(1)
  })
})

describe('shares — roadmap D9', () => {
  it('the token is the primary key and carries both user_id and run_id', () => {
    expect(columnMap(schema.shares).get('token')?.primary).toBe(true)
    expect(columnMap(schema.shares).get('user_id')?.notNull).toBe(true)
    expect(columnMap(schema.shares).get('run_id')?.notNull).toBe(true)
  })

  it('enforces one ACTIVE share per run with a PARTIAL unique index, so re-sharing works', () => {
    const idx = cfg(schema.shares).indexes.find((i) => i.config.name === 'shares_run_id_active_unq')
    expect(idx?.config.unique).toBe(true)
    // Without the WHERE, revoking a share would permanently forbid ever sharing that run again.
    expect(idx?.config.where).toBeDefined()
    expect(idx?.config.columns.map((c) => (c as { name?: string }).name)).toEqual(['run_id'])
  })
})

describe('profiles', () => {
  it('stores birth_year (not an age) and a measured-only max_hr', () => {
    expect(sqlType(schema.profiles, 'birth_year')).toBe('integer')
    expect(sqlType(schema.profiles, 'max_hr')).toBe('integer')
    expect(columnMap(schema.profiles).get('user_id')?.primary).toBe(true)
    expect(fkFor(schema.profiles, 'user_id')?.onDelete).toBe('cascade')
  })
})

describe('every app table cascades from user', () => {
  it('so deleting an account leaves nothing behind', () => {
    for (const table of [
      schema.profiles,
      schema.extractions,
      schema.runs,
      schema.insights,
      schema.records,
      schema.badges,
      schema.shares,
    ]) {
      expect(fkFor(table, 'user_id')?.onDelete, cfg(table).name).toBe('cascade')
    }
  })
})
