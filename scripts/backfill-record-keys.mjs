/**
 * Write the records a NEWLY ADDED catalog key would already hold, for users who have not
 * committed a run since it shipped.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-record-keys.mjs
 *   node --experimental-strip-types --env-file=.env.local scripts/backfill-record-keys.mjs --apply
 *
 *   npm run records:backfill            # the dry run
 *   npm run records:backfill -- --apply
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and with `--apply` it
 * writes to it. The same line `scripts/backfill-badge-run-ids.mjs` and `scripts/blob-reap.mjs`
 * draw.
 *
 * ── THE GAP THIS FILLS, MEASURED ──────────────────────────────────────────────────────────────
 * `records` is a derived table with exactly one writer: `recomputeRecords`, called from
 * `onRunCommitted`, i.e. **only when a run is committed or corrected** (`lib/records/recompute.ts`
 * — "Records change only in response to a write to `runs`"). That is the right trigger for a key
 * that already exists, and it is silent about a key that has just been *added to the catalog*.
 *
 * F32 shipped `earliest_start` on 2026-09-03 and the shelf did not show it. Nothing was wrong with
 * the deploy and there was no migration to run — `records` is `(user_id, key, value)`, so a new key
 * needs no DDL. The rows were simply the ten written at the last review commit, twenty minutes
 * before the deploy, and the eleventh key would not have appeared until the runner next reviewed a
 * run. The account had 22 reviewed runs, every one of them carrying a `started_at`, and the record
 * it should have been holding — 05:05 — was sitting in the `runs` table the whole time.
 *
 * So this script exists to be run **once, right after a catalog key ships**, and to be worth
 * nothing the rest of the time. Adding it to the catalog and then to CI would be worse than
 * useless: it would run on every push and find nothing, which is how a check stops being read.
 *
 * ── IT INSERTS WHAT IS MISSING AND TOUCHES NOTHING ELSE ───────────────────────────────────────
 * The app's writer is a wholesale REPLACE — `replaceRecords` deletes the user's rows and inserts
 * the new set in one batch (R-10), because only a full re-derive can express "this key no longer
 * qualifies". This script deliberately does **not** do that, and the difference is the whole safety
 * argument:
 *
 *   - it computes a winner only for keys the user has **no row for at all**;
 *   - it writes with `on conflict do nothing`, so a row that appeared between the read and the
 *     write survives;
 *   - it never deletes and never updates.
 *
 * A backfill that replaced the set would be a second implementation of the app's most careful
 * write path, running outside a transaction, from a laptop. Insert-only cannot corrupt a value it
 * does not compute, which is what makes running it safe when you are not certain it is needed.
 *
 * ── IT USES THE REAL CATALOG, NOT A COPY OF IT ────────────────────────────────────────────────
 * `lib/records/catalog.ts` is imported directly, under `--experimental-strip-types`. It can be:
 * every one of its imports is `import type`, so stripping the types leaves a module with no
 * runtime dependency and no `@/` alias for node to resolve. `qualifies`, `valueOf` and `direction`
 * therefore come from the same table the app compares against — a backfill that restated even one
 * threshold would be R-42's second source of truth, in the one place nobody would think to check.
 *
 * `compute.ts` cannot be imported the same way (it pulls `@/lib/metrics/session` at runtime, for
 * `toRecordCandidate`), so the four lines of tie-break below are restated from its `beats`. They
 * are the one duplicated rule in this file and they are load-bearing: **a challenger must beat the
 * holder strictly**, and an exact tie goes to the earliest `occurred_on`, then to the lower run id.
 * Keep them identical to `compute.ts` or a backfilled row will disagree with the next recompute.
 *
 * ── THE TWO KEYS IT WILL NOT ATTEMPT, AND WHY THAT NEEDS NO LIST ──────────────────────────────
 * `fastest_km_split` and `best_paced_run` are computed from `computeSessionMetrics` — a fastest-km
 * scan over `run_splits` and the decoupling formula — and re-deriving either here would be exactly
 * the duplication the paragraph above refuses. So the candidates this script builds carry
 * `fastestFullKmPaceSec: null` and `decouplingBp: null`, and **those two keys then exclude
 * themselves through their own qualifiers**, which already say `!= null`. No allow-list, no key
 * names hardcoded: a future key whose input this script cannot honestly supply is skipped by the
 * same mechanism, and is reported under `needsFullRecompute` rather than silently omitted.
 *
 * If one of those two is ever genuinely missing, the fix is the app's own path — correct any run in
 * the review screen and `recomputeRecords` writes all eleven keys from the full history.
 *
 * ── EVERY DATE IS `::text`, AND SECONDS COME FROM POSTGRES ────────────────────────────────────
 * `occurred_on::text`, for the reason `backfill-badge-run-ids.mjs` sets out at length: the driver
 * hands a `date` back as a JS `Date` at LOCAL midnight, and a round trip through that can land on
 * the adjacent day. `DateISO` is a string everywhere in `lib/`, and a script is not exempt.
 *
 * The start time is read as `extract(epoch from started_at)::int` rather than parsed from
 * `'HH:MM:SS'` in JS. Postgres already knows what a `time` is worth in seconds, so the encoding
 * `earliest_start` stores is produced by the database rather than by a third regex — after
 * `lib/records/compute.ts`'s `clockToSeconds` and `lib/badges/rules.ts`'s `startTimeOf`, a third
 * one would be one too many.
 */
import { neon } from '@neondatabase/serverless'

import { RECORD_CATALOG } from '../lib/records/catalog.ts'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('FAIL  DATABASE_URL is not set. Run with `node --env-file=.env.local`.')
  process.exit(1)
}
const sql = neon(url)

/** `compute.ts`'s `beats`, restated. A challenger must win STRICTLY; ties go to whoever was first. */
function beats(direction, value, holder, candidate) {
  if (value !== holder.value)
    return direction === 'max' ? value > holder.value : value < holder.value
  if (candidate.occurredOn !== holder.achievedOn) return candidate.occurredOn < holder.achievedOn
  return candidate.runId < holder.runId
}

function winnerFor(def, candidates) {
  let best = null
  for (const c of candidates) {
    if (!def.qualifies(c)) continue
    const value = def.valueOf(c)
    if (value == null) continue
    if (best === null || beats(def.direction, value, best, c)) {
      best = { key: def.key, runId: c.runId, value, achievedOn: c.occurredOn }
    }
  }
  return best
}

const users = await sql`
  select distinct user_id from runs where reviewed_at is not null order by user_id
`
if (users.length === 0) {
  console.log('no user has a reviewed run; nothing to backfill')
  process.exit(0)
}

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'} — ${RECORD_CATALOG.length} catalog keys, ${users.length} user(s)\n`,
)

let inserted = 0
let alreadyHeld = 0
const needsFullRecompute = new Set()

for (const { user_id: userId } of users) {
  const runs = await sql`
    select id,
           occurred_on::text                        as occurred_on,
           extract(epoch from started_at)::int      as started_at_sec,
           distance_m, duration_sec, avg_pace_sec,
           active_kcal, elevation_m, avg_cadence, max_hr
      from runs
     where user_id = ${userId} and reviewed_at is not null
  `
  /* The two derived fields are null ON PURPOSE — see the header. Their keys' own qualifiers are
     what skip them, so this file names no key at all. */
  const candidates = runs.map((r) => ({
    runId: r.id,
    occurredOn: r.occurred_on,
    distanceM: r.distance_m,
    durationSec: r.duration_sec,
    avgPaceSec: r.avg_pace_sec,
    activeKcal: r.active_kcal,
    elevationM: r.elevation_m,
    avgCadence: r.avg_cadence,
    maxHr: r.max_hr,
    startedAtSec: r.started_at_sec,
    fastestFullKmPaceSec: null,
    decouplingBp: null,
  }))

  const existing = new Set(
    (await sql`select key from records where user_id = ${userId}`).map((r) => r.key),
  )

  console.log(`user ${userId} — ${runs.length} reviewed run(s), ${existing.size} record(s) held`)

  for (const def of RECORD_CATALOG) {
    if (existing.has(def.key)) {
      alreadyHeld++
      continue
    }
    const winner = winnerFor(def, candidates)
    if (!winner) {
      /* Either nothing qualifies (a runner with no 10 km run — the honest empty case, R-10) or the
         key needs `computeSessionMetrics` and this script declined to re-derive it. */
      needsFullRecompute.add(def.key)
      console.log(`  ..  ${def.key.padEnd(18)} no qualifying run here`)
      continue
    }
    console.log(
      `  +   ${def.key.padEnd(18)} ${String(winner.value).padStart(7)}  on ${winner.achievedOn}  (run ${winner.runId})`,
    )
    inserted++
    if (apply) {
      /* `previous_value` stays null: this key has never changed hands, which is precisely what a
         first-ever holder's null means in `recomputeRecords`. Inventing a predecessor here would
         make the panel say "beat X to get here" about a contest that never happened. */
      await sql`
        insert into records (user_id, key, run_id, value, achieved_on, previous_value)
        values (${userId}, ${winner.key}, ${winner.runId}, ${winner.value}, ${winner.achievedOn}::date, null)
        on conflict (user_id, key) do nothing
      `
    }
  }
}

console.log(
  `\n${apply ? 'inserted' : 'would insert'} ${inserted} row(s); left ${alreadyHeld} existing row(s) untouched`,
)
if (needsFullRecompute.size > 0) {
  console.log(
    `keys with no row and no winner here: ${[...needsFullRecompute].join(', ')}\n` +
      '  — either nothing qualifies, or the key needs computeSessionMetrics, which this script\n' +
      '    does not re-derive. Correct any run in the review screen and recomputeRecords writes\n' +
      '    the whole set from full history.',
  )
}
if (!apply) console.log('\nnothing was written. Re-run with --apply.')
