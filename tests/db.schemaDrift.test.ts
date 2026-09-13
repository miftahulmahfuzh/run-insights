import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  checkFolderIntegrity,
  checkSnapshotChain,
  classifyMigrations,
  collectSnapshotObjects,
  diffColumns,
  diffNamedObjects,
  normalizePgType,
  normalizeSnapshotType,
  readJournal,
} from '@/scripts/check-schema-drift.mjs'

/**
 * The guard in `scripts/check-schema-drift.mjs`, exercised against synthetic drift.
 *
 * WHY EVERY CASE HERE IS A POSITIVE CONTROL. This gate's whole reason to exist is that the two
 * gates beside it (`db:check`, `db:migrate`) are green while production is wrong — so a drift
 * checker that silently detects nothing would be strictly worse than none at all: it would add a
 * third green light to the pile. Each `describe` below therefore INJECTS the defect it claims to
 * catch and asserts the finding fires, rather than only asserting that the clean tree passes.
 *
 * The one exception is the last block, which asserts the real `drizzle/` folder against the static
 * rules. That block is allowed to be a pure negative — it is the regression guard for the folder
 * itself, and the positive controls above already prove the rules have teeth.
 */

/** A minimal `information_schema.columns` row. */
function pgCol(
  table: string,
  name: string,
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    table_name: table,
    column_name: name,
    data_type: 'text',
    udt_name: 'text',
    is_nullable: 'YES',
    column_default: null,
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    ...over,
  }
}

/** A minimal drizzle snapshot table. */
function snapTable(
  name: string,
  columns: Array<{ name: string; type: string; notNull?: boolean }>,
  extra: Record<string, unknown> = {},
) {
  return {
    [`public.${name}`]: {
      name,
      schema: '',
      columns: Object.fromEntries(columns.map((c) => [c.name, { primaryKey: false, ...c }])),
      indexes: {},
      foreignKeys: {},
      uniqueConstraints: {},
      compositePrimaryKeys: {},
      ...extra,
    },
  }
}

describe('type normalisation', () => {
  /**
   * Every pair here is a spelling difference Postgres itself treats as identical, and every one of
   * them was a false positive on a first naive run over this repo's 309 columns. A comparator that
   * reports eight findings on a clean database gets ignored, so these are pinned: the failure mode
   * being guarded against is the gate becoming noise, not the gate missing something.
   */
  it.each([
    ['timestamp', { dataType: 'timestamp without time zone' }],
    ['timestamp with time zone', { dataType: 'timestamp with time zone' }],
    ['time', { dataType: 'time without time zone' }],
    ['bigserial', { dataType: 'bigint' }],
    ['serial', { dataType: 'integer' }],
    ['smallserial', { dataType: 'smallint' }],
    ['numeric(5, 3)', { dataType: 'numeric', numericPrecision: 5, numericScale: 3 }],
    ['numeric(4, 1)', { dataType: 'numeric', numericPrecision: 4, numericScale: 1 }],
    ['varchar(255)', { dataType: 'character varying', charMaxLength: 255 }],
    ['text', { dataType: 'text' }],
    ['jsonb', { dataType: 'jsonb' }],
    ['boolean', { dataType: 'boolean' }],
    ['date', { dataType: 'date' }],
    ['integer', { dataType: 'integer' }],
  ])('folds snapshot %s and its information_schema spelling to one string', (snap, pg) => {
    expect(normalizeSnapshotType(snap)).toBe(normalizePgType(pg as never))
  })

  it('does NOT fold genuinely different types together', () => {
    expect(normalizeSnapshotType('integer')).not.toBe(
      normalizePgType({ dataType: 'bigint' } as never),
    )
    expect(normalizeSnapshotType('timestamp')).not.toBe(
      normalizePgType({ dataType: 'timestamp with time zone' } as never),
    )
    // Precision is part of the type: numeric(5,3) is not numeric(4,1).
    expect(
      normalizePgType({ dataType: 'numeric', numericPrecision: 5, numericScale: 3 } as never),
    ).not.toBe(
      normalizePgType({ dataType: 'numeric', numericPrecision: 4, numericScale: 1 } as never),
    )
  })

  it('reads an enum through its udt_name and an array through its element type', () => {
    expect(normalizePgType({ dataType: 'USER-DEFINED', udtName: 'mood' } as never)).toBe('mood')
    expect(normalizePgType({ dataType: 'ARRAY', udtName: '_text' } as never)).toBe('text[]')
  })
})

describe('classifyMigrations — the stranded-migration detector', () => {
  const hashOf = (tag: string) => `hash-${tag}`

  /**
   * The 2026-09-13 incident, reproduced in miniature. Two branches generate a migration; the one
   * with the LATER `when` lands and migrates first, lifting the watermark above the other. The
   * earlier one is then permanently unreachable — `drizzle-kit migrate` compares against
   * max(created_at) and will exit 0 without it forever.
   */
  it('calls an unapplied migration below the watermark STRANDED, not pending', () => {
    const journal = [
      { idx: 0, tag: 'a', when: 100 },
      { idx: 1, tag: 'b', when: 200 }, // generated second, never applied
      { idx: 2, tag: 'c', when: 300 }, // landed first, lifted the watermark to 300
    ]
    const ledger = [
      { hash: 'hash-a', created_at: 100 },
      { hash: 'hash-c', created_at: 300 },
    ]

    const { applied, pending, stranded, watermark } = classifyMigrations(journal, ledger, hashOf)

    expect(watermark).toBe(300)
    expect(applied.map((e: { tag: string }) => e.tag)).toEqual(['a', 'c'])
    expect(pending).toEqual([])
    expect(stranded.map((e: { tag: string }) => e.tag)).toEqual(['b'])
  })

  it('calls an unapplied migration ABOVE the watermark merely pending', () => {
    const journal = [
      { idx: 0, tag: 'a', when: 100 },
      { idx: 1, tag: 'b', when: 400 },
    ]
    const ledger = [{ hash: 'hash-a', created_at: 100 }]

    const { pending, stranded } = classifyMigrations(journal, ledger, hashOf)

    expect(pending.map((e: { tag: string }) => e.tag)).toEqual(['b'])
    expect(stranded).toEqual([])
  })

  /**
   * The watermark is max(created_at), NOT the highest ledger id — the migrator's query is
   * `order by created_at desc limit 1`. A ledger whose rows were inserted out of timestamp order
   * (exactly what a hand-repaired ledger looks like) must not lower it.
   */
  it('takes the watermark from the maximum created_at, not the last row', () => {
    const journal = [{ idx: 0, tag: 'x', when: 50 }]
    const ledger = [
      { hash: 'other', created_at: 900 },
      { hash: 'another', created_at: 100 }, // inserted later, older timestamp
    ]
    const { stranded, watermark } = classifyMigrations(journal, ledger, hashOf)
    expect(watermark).toBe(900)
    expect(stranded.map((e: { tag: string }) => e.tag)).toEqual(['x'])
  })

  it('flags a ledger row whose hash matches no migration file', () => {
    const journal = [{ idx: 0, tag: 'a', when: 100 }]
    const ledger = [
      { hash: 'hash-a', created_at: 100 },
      { hash: 'hash-of-a-migration-that-was-edited', created_at: 150 },
    ]
    const { foreign } = classifyMigrations(journal, ledger, hashOf)
    expect(foreign).toHaveLength(1)
    expect(foreign[0].hash).toBe('hash-of-a-migration-that-was-edited')
  })

  it('treats a completely empty ledger as everything pending, nothing stranded', () => {
    const journal = [
      { idx: 0, tag: 'a', when: 100 },
      { idx: 1, tag: 'b', when: 200 },
    ]
    const { pending, stranded, applied } = classifyMigrations(journal, [], hashOf)
    expect(applied).toEqual([])
    expect(stranded).toEqual([])
    expect(pending).toHaveLength(2)
  })
})

describe('diffColumns', () => {
  it('passes a database that matches the schema', () => {
    const tables = snapTable('runs', [{ name: 'id', type: 'text', notNull: true }])
    const live = [pgCol('runs', 'id', { is_nullable: 'NO' })]
    expect(diffColumns(tables, live)).toEqual([])
  })

  /**
   * The exact shape of the real finding: `nina_memory_facts.confidence`, integer NOT NULL DEFAULT
   * 100, present in the database and absent from the schema. The assertion pins the CONSEQUENCE
   * wording too, because the first version of this message asserted "no default" about a column it
   * had just printed a default for.
   */
  it('reports an undeclared column, and says the drift is latent when it has a default', () => {
    const tables = snapTable('nina_memory_facts', [{ name: 'id', type: 'text', notNull: true }])
    const live = [
      pgCol('nina_memory_facts', 'id', { is_nullable: 'NO' }),
      pgCol('nina_memory_facts', 'confidence', {
        data_type: 'integer',
        udt_name: 'int4',
        is_nullable: 'NO',
        column_default: '100',
      }),
    ]
    const failures = diffColumns(tables, live)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('"nina_memory_facts"."confidence"')
    expect(failures[0]).toContain('NOT declared in the schema')
    expect(failures[0]).toContain('DEFAULT 100')
    expect(failures[0]).toContain('latent')
    expect(failures[0]).not.toContain('failing right now')
  })

  it('escalates an undeclared NOT NULL column with NO default to a live breakage', () => {
    const tables = snapTable('runs', [{ name: 'id', type: 'text', notNull: true }])
    const live = [
      pgCol('runs', 'id', { is_nullable: 'NO' }),
      pgCol('runs', 'mandatory', { is_nullable: 'NO', column_default: null }),
    ]
    const failures = diffColumns(tables, live)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('Every insert the app makes is failing right now')
  })

  it('reports a column the schema declares but the database lacks', () => {
    const tables = snapTable('runs', [
      { name: 'id', type: 'text', notNull: true },
      { name: 'pace', type: 'integer', notNull: false },
    ])
    const live = [pgCol('runs', 'id', { is_nullable: 'NO' })]
    const failures = diffColumns(tables, live)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('MISSING from the database')
  })

  it('reports a type mismatch and a nullability mismatch independently', () => {
    const tables = snapTable('runs', [
      { name: 'a', type: 'integer', notNull: true },
      { name: 'b', type: 'text', notNull: true },
    ])
    const live = [
      pgCol('runs', 'a', { data_type: 'bigint', udt_name: 'int8', is_nullable: 'NO' }),
      pgCol('runs', 'b', { is_nullable: 'YES' }),
    ]
    const failures = diffColumns(tables, live)
    expect(failures).toHaveLength(2)
    expect(failures.find((f: string) => f.includes('"a"'))).toContain('schema says integer')
    expect(failures.find((f: string) => f.includes('"b"'))).toContain('nullability')
  })

  /**
   * Folding `bigserial` to `bigint` is what stops a false positive — so it must not also hide a
   * REAL one. A serial column whose sequence has been dropped still reports `bigint`, and only the
   * missing nextval() default distinguishes it.
   */
  it('catches a serial column that has lost its sequence', () => {
    const tables = snapTable('nina_messages', [{ name: 'seq', type: 'bigserial', notNull: true }])
    const intact = [
      pgCol('nina_messages', 'seq', {
        data_type: 'bigint',
        udt_name: 'int8',
        is_nullable: 'NO',
        column_default: "nextval('nina_messages_seq_seq'::regclass)",
      }),
    ]
    expect(diffColumns(tables, intact)).toEqual([])

    const orphaned = [
      pgCol('nina_messages', 'seq', {
        data_type: 'bigint',
        udt_name: 'int8',
        is_nullable: 'NO',
        column_default: null,
      }),
    ]
    const failures = diffColumns(tables, orphaned)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('sequence is gone')
  })

  it('reports a table present on only one side', () => {
    const tables = snapTable('runs', [{ name: 'id', type: 'text' }])
    expect(diffColumns(tables, []).some((f: string) => f.includes('NOT in the database'))).toBe(
      true,
    )
    expect(
      diffColumns({}, [pgCol('ghost', 'id')]).some((f: string) => f.includes('NOT in the schema')),
    ).toBe(true)
  })
})

describe('diffNamedObjects', () => {
  it('reports objects missing on either side and passes when they match', () => {
    expect(diffNamedObjects('index', new Set(['a']), new Set(['a']))).toEqual([])
    expect(diffNamedObjects('index', new Set(['a']), new Set())).toHaveLength(1)
    expect(diffNamedObjects('index', new Set(), new Set(['a']))).toHaveLength(1)
  })

  it('collects foreign keys, uniques and indexes out of a snapshot', () => {
    const tables = snapTable('runs', [{ name: 'id', type: 'text' }], {
      foreignKeys: { runs_user_fk: {} },
      uniqueConstraints: { runs_slug_uq: {} },
      indexes: { runs_user_idx: {} },
    })
    const { foreignKeys, uniques, indexes } = collectSnapshotObjects(tables)
    expect([...foreignKeys]).toEqual(['runs_user_fk'])
    expect([...uniques]).toEqual(['runs_slug_uq'])
    expect([...indexes]).toEqual(['runs_user_idx'])
  })
})

describe('checkFolderIntegrity', () => {
  const journal = (entries: Array<{ idx: number; tag: string; when: number }>) => ({ entries })

  it('passes a consistent folder', () => {
    const j = journal([
      { idx: 0, tag: 'a', when: 1 },
      { idx: 1, tag: 'b', when: 2 },
    ])
    expect(
      checkFolderIntegrity(j, new Set(['a', 'b']), ['0000_snapshot.json', '0001_snapshot.json']),
    ).toEqual([])
  })

  it('catches a .sql file that is not journalled and will never run', () => {
    const j = journal([{ idx: 0, tag: 'a', when: 1 }])
    const failures = checkFolderIntegrity(j, new Set(['a', 'renamed_by_hand']), [
      '0000_snapshot.json',
    ])
    expect(
      failures.some((f: string) => f.includes('renamed_by_hand') && f.includes('NEVER run')),
    ).toBe(true)
  })

  it('catches a journalled tag with no .sql file', () => {
    const j = journal([
      { idx: 0, tag: 'a', when: 1 },
      { idx: 1, tag: 'deleted', when: 2 },
    ])
    const failures = checkFolderIntegrity(j, new Set(['a']), [
      '0000_snapshot.json',
      '0001_snapshot.json',
    ])
    expect(failures.some((f: string) => f.includes('drizzle/deleted.sql does not exist'))).toBe(
      true,
    )
  })

  it('catches a duplicate journal tag', () => {
    const j = journal([
      { idx: 0, tag: 'a', when: 1 },
      { idx: 1, tag: 'a', when: 2 },
    ])
    const failures = checkFolderIntegrity(j, new Set(['a']), [
      '0000_snapshot.json',
      '0001_snapshot.json',
    ])
    expect(failures.some((f: string) => f.includes('more than once'))).toBe(true)
  })

  /**
   * The static shadow of the stranded-migration bug. A journal that goes backwards in `when`
   * guarantees a future stranding on any database that has already passed the higher value — this
   * cannot see the live ledger, but it can refuse the arrangement that creates the hazard.
   */
  it('catches a journal whose "when" goes backwards', () => {
    const j = journal([
      { idx: 0, tag: 'a', when: 300 },
      { idx: 1, tag: 'b', when: 200 },
    ])
    const failures = checkFolderIntegrity(j, new Set(['a', 'b']), [
      '0000_snapshot.json',
      '0001_snapshot.json',
    ])
    expect(failures.some((f: string) => f.includes('not strictly increasing'))).toBe(true)
  })

  it('catches a snapshot count that does not match the journal', () => {
    const j = journal([
      { idx: 0, tag: 'a', when: 1 },
      { idx: 1, tag: 'b', when: 2 },
    ])
    const failures = checkFolderIntegrity(j, new Set(['a', 'b']), ['0000_snapshot.json'])
    expect(failures.some((f: string) => f.includes('snapshot(s) but'))).toBe(true)
  })
})

describe('checkSnapshotChain', () => {
  it('passes an unbroken chain', () => {
    const snaps = [
      { file: '0000_snapshot.json', id: 'i0', prevId: '00000000-0000-0000-0000-000000000000' },
      { file: '0001_snapshot.json', id: 'i1', prevId: 'i0' },
      { file: '0002_snapshot.json', id: 'i2', prevId: 'i1' },
    ]
    expect(checkSnapshotChain(snaps)).toEqual([])
  })

  /** Two branches that each add a table produce exactly this: both point at the same parent. */
  it('catches a forked chain', () => {
    const snaps = [
      { file: '0000_snapshot.json', id: 'i0', prevId: '00000000-0000-0000-0000-000000000000' },
      { file: '0001_snapshot.json', id: 'i1', prevId: 'i0' },
      { file: '0002_snapshot.json', id: 'i2', prevId: 'i0' }, // should be i1
    ]
    const failures = checkSnapshotChain(snaps)
    expect(failures.some((f: string) => f.includes('forked'))).toBe(true)
  })

  it('catches a dangling prevId', () => {
    const snaps = [
      { file: '0000_snapshot.json', id: 'i0', prevId: '00000000-0000-0000-0000-000000000000' },
      { file: '0001_snapshot.json', id: 'i1', prevId: 'nobody' },
    ]
    const failures = checkSnapshotChain(snaps)
    expect(failures.some((f: string) => f.includes('dangling'))).toBe(true)
  })
})

/**
 * The real folder, against the same rules. This is the regression guard: a future `db:generate`
 * that renames a migration, forks the chain or writes a backwards timestamp fails here on the
 * branch that did it, without needing a database.
 */
describe('the committed drizzle/ folder', () => {
  const journal = readJournal()
  const sqlTags = new Set(
    readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.slice(0, -4)),
  )
  const snapshotFiles = readdirSync('drizzle/meta')
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort()

  it('is internally consistent: bijection, no duplicates, monotonic, one snapshot per entry', () => {
    expect(checkFolderIntegrity(journal, sqlTags, snapshotFiles)).toEqual([])
  })

  it('has an unbroken snapshot chain', () => {
    const snaps = snapshotFiles.map((file) => {
      const s = JSON.parse(readFileSync(`drizzle/meta/${file}`, 'utf8'))
      return { file, id: s.id, prevId: s.prevId }
    })
    expect(checkSnapshotChain(snaps)).toEqual([])
  })

  /**
   * `0011_rare_blockbuster` and `0011_natural_nico_minoru` share a filename prefix — the artefact
   * of the two-branch fork that stranded the first one. Drizzle keys on the journal tag rather
   * than the prefix, so this is survivable and is deliberately NOT failed on; it is pinned here so
   * that the day someone "tidies" the numbering, the rename shows up as a test change and gets
   * read against `drizzle/README.md` rather than done silently.
   */
  it('still carries the duplicated 0011 prefix, on purpose', () => {
    const prefixes = [...sqlTags].map((t) => t.slice(0, 4))
    const duplicated = prefixes.filter((p, i) => prefixes.indexOf(p) !== i)
    expect(duplicated).toEqual(['0011'])
  })
})
