// Does the database actually LOOK like the schema this repo committed?
//
// Nothing else in the toolchain answers that question, and on 2026-09-13 an audit found that the
// answer had been "no" for six days without a single gate going red.
//
// ── THE INCIDENT THIS SCRIPT EXISTS FOR ──────────────────────────────────────────────────────
// `drizzle/0011_rare_blockbuster.sql` is one statement — `ALTER TABLE "nina_memory_facts" DROP
// COLUMN "confidence"`. It is committed, it is in `_journal.json` at idx 11, its `.sql` file is
// present, `db:check` passes over it, and `db:migrate` exits 0. It has never run in production.
//
// The cause is `drizzle-orm`'s migrator, which is what `drizzle-kit migrate` delegates to
// (node_modules/drizzle-orm/pg-core/dialect.js):
//
//     select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1
//     ...
//     if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { apply }
//
// The watermark is `max(created_at)`, and `created_at` is the journal's `when`, not the wall clock
// of the run. A migration applies ONLY if its `when` is strictly greater than that watermark. So
// when two branches each generate a migration and the one with the LATER `when` lands and migrates
// first, the earlier one is stranded below the watermark **permanently**. Every future
// `db:migrate` walks straight past it and exits 0, forever.
//
// That is not a hypothetical ordering: it is the forked-snapshot-chain case, and it left
// production with an `integer NOT NULL DEFAULT 100` column that the committed schema has not
// declared since 2026-09-07. It stayed invisible because the DEFAULT meant inserts that omit the
// column still succeed — the drift had no symptom, only a latent one.
//
// ── WHY THE EXISTING GATES CANNOT SEE IT ─────────────────────────────────────────────────────
// `db:check` validates the migration folder against ITSELF (journal, snapshots, collisions). It
// never opens a connection, so it cannot know what was applied. `db:migrate` reports what it
// decided to do, and its decision is the bug. Both are green. Both answer a different question
// than "is production what we think it is" — so this script asks that question directly, against
// `information_schema`, and makes the answer an exit code.
//
// ── TWO HALVES, AND ONLY ONE OF THEM NEEDS A DATABASE ────────────────────────────────────────
// STATIC half (always runs, no connection): the migration folder's own internal integrity —
// journal/file bijection, duplicate tags, `when` monotonicity, and an unbroken snapshot `prevId`
// chain. CI runs this half, because CI's DATABASE_URL is a dummy string (see .github/workflows/ci.yml).
//
// LIVE half (runs only when a reachable database is configured): the ledger comparison that would
// have caught the incident, plus a full column/constraint/index diff of the snapshot tip against
// `information_schema`.
//
// With no usable DATABASE_URL the script runs the static half, says plainly that it skipped the
// live half, and exits 0 — the same "passes on an empty deck and says so" posture as
// `badges:check`. A gate that fails when it simply could not look is a gate people delete.
//
// This script only ever READS. It never applies a migration and never writes to the ledger:
// remediation is a human decision, because the repair for a stranded DROP COLUMN destroys data.
//
// Fix the database, or fix the schema — never silence the check.
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Resolved from this file, not from the shell's cwd: the guard is run by `npm run` from the repo
// root, by hand from anywhere, and imported by tests/db.schemaDrift.test.ts from vitest's root.
const REPO_ROOT = join(import.meta.dirname, '..')

const MIGRATIONS_DIR = 'drizzle'
const META_DIR = `${MIGRATIONS_DIR}/meta`
const JOURNAL = `${META_DIR}/_journal.json`

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Type normalisation
 *
 * The snapshot and `information_schema` spell the same type differently, and a naive string
 * compare reports eight false positives on this repo's 309 columns. Both sides are folded to one
 * canonical spelling instead. Each rule below is an ALIAS — a pair of spellings Postgres itself
 * treats as identical — never a widening that could hide a real difference.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

// `serial` is not a type: it is `integer` plus a sequence DEFAULT. The sequence is checked
// separately (see checkSerialBacking) so that folding the type here cannot hide a lost default.
const SERIAL_BASE = { smallserial: 'smallint', serial: 'integer', bigserial: 'bigint' }

/** Canonical spelling for a type as the drizzle snapshot writes it. */
export function normalizeSnapshotType(type) {
  const t = String(type).trim()
  if (SERIAL_BASE[t]) return SERIAL_BASE[t]
  if (t === 'timestamp') return 'timestamp without time zone'
  if (t === 'time') return 'time without time zone'
  // drizzle writes `numeric(5, 3)` with a space; information_schema has no spelling at all.
  const numeric = /^numeric\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(t)
  if (numeric) return `numeric(${numeric[1]},${numeric[2]})`
  const varchar = /^varchar\s*\(\s*(\d+)\s*\)$/.exec(t)
  if (varchar) return `character varying(${varchar[1]})`
  if (t === 'varchar') return 'character varying'
  return t
}

/** Canonical spelling for a type as `information_schema.columns` reports it. */
export function normalizePgType({
  dataType,
  udtName,
  charMaxLength,
  numericPrecision,
  numericScale,
}) {
  if (dataType === 'USER-DEFINED') return String(udtName)
  // An array's udt_name is the element type with a leading underscore (`_text` for `text[]`).
  if (dataType === 'ARRAY') return `${String(udtName).replace(/^_/, '')}[]`
  if (dataType === 'numeric') {
    return numericPrecision == null
      ? 'numeric'
      : `numeric(${numericPrecision},${numericScale ?? 0})`
  }
  if (dataType === 'character varying' || dataType === 'character') {
    return charMaxLength == null ? dataType : `${dataType}(${charMaxLength})`
  }
  return String(dataType)
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Static half — the migration folder against itself
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export function readJournal(root = REPO_ROOT) {
  return JSON.parse(readFileSync(`${root}/${JOURNAL}`, 'utf8'))
}

/**
 * `drizzle-kit` identifies an applied migration by the SHA-256 of the migration file's text, and
 * that is the only join key between the repo and the ledger. The filename is NOT in the ledger —
 * which is exactly why a stranded migration is invisible to a `grep` over anything.
 */
export function hashMigration(root, tag) {
  return createHash('sha256')
    .update(readFileSync(`${root}/${MIGRATIONS_DIR}/${tag}.sql`))
    .digest('hex')
}

export function checkFolderIntegrity(journal, sqlTags, snapshotNames) {
  const failures = []
  const tags = journal.entries.map((e) => e.tag)

  const seen = new Set()
  for (const tag of tags) {
    if (seen.has(tag)) failures.push(`_journal.json lists "${tag}" more than once.`)
    seen.add(tag)
  }

  for (const tag of tags) {
    if (!sqlTags.has(tag)) {
      failures.push(
        `_journal.json references "${tag}" but drizzle/${tag}.sql does not exist. ` +
          'A journalled migration with no file aborts `db:migrate` on a fresh database.',
      )
    }
  }
  for (const tag of [...sqlTags].sort()) {
    if (!seen.has(tag)) {
      failures.push(
        `drizzle/${tag}.sql is not listed in _journal.json, so it will NEVER run — on ` +
          'production or on a fresh database. A migration renamed by hand lands here.',
      )
    }
  }

  // `when` must rise with `idx`. The migrator walks the journal in order against a single
  // max(created_at) watermark, so a journal that goes backwards has a window in which an entry
  // can never be applied. This is the static shadow of the 0011_rare_blockbuster incident: it
  // cannot prove a live database is clean, but a violation here guarantees a future one.
  for (let i = 1; i < journal.entries.length; i++) {
    const prev = journal.entries[i - 1]
    const cur = journal.entries[i]
    if (Number(cur.when) <= Number(prev.when)) {
      failures.push(
        `_journal.json is not strictly increasing in "when": idx ${prev.idx} (${prev.tag}, ` +
          `${prev.when}) is followed by idx ${cur.idx} (${cur.tag}, ${cur.when}). The migrator ` +
          'applies only entries whose `when` exceeds max(created_at), so the later entry can be ' +
          'stranded unapplied forever.',
      )
    }
  }

  if (snapshotNames.length !== journal.entries.length) {
    failures.push(
      `drizzle/meta has ${snapshotNames.length} snapshot(s) but _journal.json has ` +
        `${journal.entries.length} entr(ies). \`db:generate\` writes one snapshot per entry.`,
    )
  }

  return failures
}

/**
 * Every snapshot must point at its predecessor. Two branches that each add a table FORK this
 * chain, and a forked chain makes the next `db:generate` diff against the wrong parent — which is
 * how a migration ends up describing changes that were already applied, or missing ones that were not.
 */
export function checkSnapshotChain(snapshots) {
  const failures = []
  const byId = new Map(snapshots.map((s) => [s.id, s.file]))
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i]
    if (i === 0) continue
    const expected = snapshots[i - 1].file
    const actual = byId.get(snap.prevId)
    if (actual === undefined) {
      failures.push(
        `${snap.file} has prevId ${snap.prevId}, which matches no snapshot in drizzle/meta ` +
          '(a dangling link — the chain is broken).',
      )
    } else if (actual !== expected) {
      failures.push(
        `${snap.file} links back to ${actual}, but ${expected} is the snapshot before it. ` +
          'The snapshot chain has forked.',
      )
    }
  }
  return failures
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Live half — the ledger, and then the schema
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Split the journal against `drizzle.__drizzle_migrations`, reproducing the migrator's own rule.
 *
 * The distinction that matters is between PENDING and STRANDED. Both are "in the journal, not in
 * the ledger", and they look identical to every other tool — but a pending migration is one
 * `db:migrate` away from being applied, and a stranded one will not be applied by any number of
 * them. Only the watermark separates the two.
 */
export function classifyMigrations(journalEntries, ledgerRows, hashOf) {
  const appliedHashes = new Set(ledgerRows.map((r) => r.hash))
  // The migrator reads `order by created_at desc limit 1` — the maximum, not the last inserted.
  const watermark = ledgerRows.reduce((max, r) => Math.max(max, Number(r.created_at)), -Infinity)

  const applied = []
  const pending = []
  const stranded = []
  const knownHashes = new Set()

  for (const entry of journalEntries) {
    const hash = hashOf(entry.tag)
    knownHashes.add(hash)
    if (appliedHashes.has(hash)) {
      applied.push(entry)
    } else if (Number(entry.when) > watermark) {
      pending.push(entry)
    } else {
      stranded.push({ ...entry, watermark })
    }
  }

  // A ledger row whose hash matches no migration file means the database ran SQL this repo can no
  // longer produce — an edited migration, or one deleted after it was applied.
  const foreign = ledgerRows.filter((r) => !knownHashes.has(r.hash))

  return { applied, pending, stranded, foreign, watermark }
}

/** Compare the snapshot tip's tables/columns against what the database actually has. */
export function diffColumns(snapshotTables, liveColumns) {
  const failures = []

  const code = new Map()
  for (const table of Object.values(snapshotTables)) {
    code.set(table.name, new Map(Object.values(table.columns).map((c) => [c.name, c])))
  }

  const live = new Map()
  for (const col of liveColumns) {
    if (!live.has(col.table_name)) live.set(col.table_name, new Map())
    live.get(col.table_name).set(col.column_name, col)
  }

  for (const name of [...code.keys()].sort()) {
    if (!live.has(name)) failures.push(`table "${name}" is in the schema but NOT in the database.`)
  }
  for (const name of [...live.keys()].sort()) {
    if (!code.has(name)) failures.push(`table "${name}" is in the database but NOT in the schema.`)
  }

  for (const name of [...code.keys()].sort()) {
    const codeCols = code.get(name)
    const liveCols = live.get(name)
    if (!liveCols) continue

    for (const col of [...codeCols.keys()].sort()) {
      if (!liveCols.has(col)) {
        failures.push(
          `"${name}"."${col}" is declared in the schema but MISSING from the database — ` +
            'code that reads it will fail at runtime.',
        )
      }
    }
    for (const col of [...liveCols.keys()].sort()) {
      if (!codeCols.has(col)) {
        const c = liveCols.get(col)
        const notNull = c.is_nullable === 'NO'
        const dflt = c.column_default ? `DEFAULT ${c.column_default}` : 'no default'
        // Whether an undeclared column is a live outage or a latent one turns entirely on this
        // pair, so the message says which rather than asserting the worse case. NOT NULL with no
        // default breaks every insert the app makes today; NOT NULL *with* a default breaks
        // nothing until someone drops the default, which is why this class hides for months.
        const consequence = !notNull
          ? 'Harmless to inserts, but the schema and the database disagree.'
          : c.column_default
            ? 'Inserts still succeed because of the default, so this drift has no symptom — it ' +
              'is latent until the default is dropped or the column is made to matter.'
            : 'Every insert the app makes is failing right now.'
        failures.push(
          `"${name}"."${col}" exists in the database but is NOT declared in the schema ` +
            `(${normalizePgType(pgColumnShape(c))}, ${notNull ? 'NOT NULL' : 'nullable'}, ${dflt}). ` +
            consequence,
        )
      }
    }

    for (const col of [...codeCols.keys()].sort()) {
      const want = codeCols.get(col)
      const got = liveCols.get(col)
      if (!got) continue

      const wantType = normalizeSnapshotType(want.type)
      const gotType = normalizePgType(pgColumnShape(got))
      if (wantType !== gotType) {
        failures.push(`"${name}"."${col}" type: schema says ${wantType}, database has ${gotType}.`)
      }

      const wantNotNull = want.notNull === true
      const gotNotNull = got.is_nullable === 'NO'
      if (wantNotNull !== gotNotNull) {
        failures.push(
          `"${name}"."${col}" nullability: schema says ${wantNotNull ? 'NOT NULL' : 'nullable'}, ` +
            `database has ${gotNotNull ? 'NOT NULL' : 'nullable'}.`,
        )
      }

      if (SERIAL_BASE[String(want.type).trim()] && !/nextval\(/.test(got.column_default ?? '')) {
        failures.push(
          `"${name}"."${col}" is ${want.type} in the schema but the database column has no ` +
            `nextval() default (${got.column_default ?? 'none'}) — its sequence is gone.`,
        )
      }
    }
  }

  return failures
}

function pgColumnShape(c) {
  return {
    dataType: c.data_type,
    udtName: c.udt_name,
    charMaxLength: c.character_maximum_length,
    numericPrecision: c.numeric_precision,
    numericScale: c.numeric_scale,
  }
}

/** Compare named relational objects — foreign keys, unique constraints, indexes — by name. */
export function diffNamedObjects(label, wanted, got, hint) {
  const failures = []
  for (const name of [...wanted].sort()) {
    if (!got.has(name))
      failures.push(`${label} "${name}" is in the schema but NOT in the database.`)
  }
  for (const name of [...got].sort()) {
    if (!wanted.has(name)) {
      failures.push(`${label} "${name}" is in the database but NOT in the schema.${hint ?? ''}`)
    }
  }
  return failures
}

export function collectSnapshotObjects(snapshotTables) {
  const foreignKeys = new Set()
  const uniques = new Set()
  const indexes = new Set()
  for (const table of Object.values(snapshotTables)) {
    for (const name of Object.keys(table.foreignKeys ?? {})) foreignKeys.add(name)
    for (const name of Object.keys(table.uniqueConstraints ?? {})) uniques.add(name)
    for (const name of Object.keys(table.indexes ?? {})) indexes.add(name)
  }
  return { foreignKeys, uniques, indexes }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Runner
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  const root = REPO_ROOT
  const journal = readJournal(root)
  const sqlTags = new Set(
    readdirSync(`${root}/${MIGRATIONS_DIR}`)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.slice(0, -4)),
  )
  const snapshotFiles = readdirSync(`${root}/${META_DIR}`)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort()
  const snapshots = snapshotFiles.map((file) => {
    const s = JSON.parse(readFileSync(`${root}/${META_DIR}/${file}`, 'utf8'))
    return { file, id: s.id, prevId: s.prevId, tables: s.tables }
  })

  const failures = [
    ...checkFolderIntegrity(journal, sqlTags, snapshotFiles),
    ...checkSnapshotChain(snapshots),
  ]

  console.log(
    `OK    static   ${journal.entries.length} journal entries, ${sqlTags.size} .sql files, ` +
      `${snapshotFiles.length} snapshots`,
  )

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const reachable = url && !/localhost|127\.0\.0\.1/.test(url)
  if (!reachable) {
    console.log(
      'SKIP  live     no reachable DATABASE_URL — ledger and schema comparison not run. ' +
        '(CI sets a dummy connection string on purpose; run this locally to check production.)',
    )
    report(failures, { liveRan: false })
    return
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const ledger = await sql`
    select hash, created_at from drizzle.__drizzle_migrations order by created_at asc
  `
  const { applied, pending, stranded, foreign, watermark } = classifyMigrations(
    journal.entries,
    ledger,
    (tag) => hashMigration(root, tag),
  )

  console.log(`OK    ledger   ${applied.length}/${journal.entries.length} migrations applied`)

  for (const entry of stranded) {
    failures.push(
      `migration "${entry.tag}" (idx ${entry.idx}, when ${entry.when}) is NOT applied and ` +
        `NEVER WILL BE: the ledger watermark is ${entry.watermark}, and \`drizzle-kit migrate\` ` +
        'applies an entry only when its `when` exceeds that. Every future `db:migrate` will exit ' +
        '0 without running it. Apply its SQL by hand, then insert its (hash, created_at) into ' +
        'drizzle.__drizzle_migrations so the ledger tells the truth.',
    )
  }
  for (const row of foreign) {
    failures.push(
      `the ledger records an applied migration with hash ${String(row.hash).slice(0, 16)}… that ` +
        'matches no file in drizzle/. The database ran SQL this repo can no longer reproduce.',
    )
  }
  if (pending.length > 0) {
    console.log(
      `WARN  ledger   ${pending.length} migration(s) pending but applicable — run \`npm run db:migrate\`: ` +
        pending.map((e) => e.tag).join(', '),
    )
  }

  const tip = snapshots[snapshots.length - 1]
  const columns = await sql`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `
  failures.push(...diffColumns(tip.tables, columns))

  const constraints = await sql`
    select c.conrelid::regclass::text as table_name, c.conname as name, c.contype as type
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public'
  `
  const indexRows = await sql`
    select indexname as name from pg_indexes where schemaname = 'public'
  `

  const want = collectSnapshotObjects(tip.tables)
  const liveFks = new Set(constraints.filter((c) => c.type === 'f').map((c) => c.name))
  const liveUniques = new Set(constraints.filter((c) => c.type === 'u').map((c) => c.name))
  // Postgres materialises a backing index for every primary key and unique constraint. Those are
  // not schema-declared indexes, so they are excluded rather than reported as extras.
  const backing = new Set(
    constraints.filter((c) => c.type === 'p' || c.type === 'u').map((c) => c.name),
  )
  const liveIndexes = new Set(indexRows.map((r) => r.name).filter((n) => !backing.has(n)))

  failures.push(...diffNamedObjects('foreign key', want.foreignKeys, liveFks))
  failures.push(...diffNamedObjects('unique constraint', want.uniques, liveUniques))
  failures.push(...diffNamedObjects('index', want.indexes, liveIndexes))

  console.log(
    `OK    schema   ${Object.keys(tip.tables).length} tables, ${columns.length} columns, ` +
      `${liveFks.size} foreign keys, ${liveIndexes.size} indexes compared against ${tip.file}`,
  )
  void watermark

  report(failures, { liveRan: true })
}

/**
 * The success line must name what was actually checked. A run that never opened a connection
 * saying "no drift against the database" would be this script committing the exact sin it was
 * written to catch: a green light for a question nobody asked. CI only ever runs the static half,
 * so that is the line CI must print.
 */
function report(failures, { liveRan }) {
  if (failures.length === 0) {
    console.log(
      liveRan
        ? 'OK    no drift between the committed schema and the database.'
        : 'OK    migration folder is self-consistent. The database was NOT checked.',
    )
    return
  }
  console.error(`\nFAIL  ${failures.length} drift finding(s):\n`)
  for (const f of failures) console.error(`  - ${f}`)
  console.error('')
  process.exit(1)
}

// Only when run as a command. tests/db.schemaDrift.test.ts imports the pure helpers above, and an
// unconditional call here would open a database connection on every `npm test`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
