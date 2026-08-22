/**
 * Give every pre-round-3 period award the run that earned it.
 *
 *   node --env-file=.env.local scripts/backfill-badge-run-ids.mjs            # dry run, always
 *   node --env-file=.env.local scripts/backfill-badge-run-ids.mjs --apply
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and with `--apply` it writes
 * to it. Same line `scripts/blob-reap.mjs` and `scripts/f04-e2e-probe.mjs` draw.
 *
 * ── WHY THESE ROWS EXIST ──────────────────────────────────────────────────────────────────────
 * F27 round 3 established the count-threshold rule (`lib/badges/evaluate.ts`): a badge whose
 * condition is "at least N of something" is earned by the run that reached N, and the award records
 * it. Before round 3 every week, month and lifetime award was written with `run_id = NULL` on the
 * argument that "no single run earned `century_club`". So the badge panel shows those rows as dates
 * that cannot be opened — which is the report that opened the round, and which no code change can
 * reach, because the information was never written down.
 *
 * It can be recovered, though, and exactly: `earned_on` has ALWAYS been the committing run's own
 * `occurred_on` (`evaluate.ts` stamps `earnedOn: facts.session.run.occurredOn`). So the run that
 * fired the award is a reviewed run of that user on that day.
 *
 * ── IT SKIPS RATHER THAN GUESSES ──────────────────────────────────────────────────────────────
 * If that day holds exactly one reviewed run, the answer is certain and the row is filled. If it
 * holds two — a `two_a_days` sort of day — then which of them was the commit that crossed the
 * threshold depends on the order they were REVIEWED, and that order is not recorded anywhere the
 * badge row can see. `badges.created_at` is the award's timestamp, not the run's, and comparing it
 * to `runs.reviewed_at` would be a plausible-looking guess rather than a fact.
 *
 * So those rows are left alone and counted under `ambiguous`. A date that does not open is a small
 * disappointment; a date that opens the WRONG run is the app lying about the runner's own history,
 * and §1.2's whole position on badges is that they are facts about the past.
 *
 * Session awards are never touched: their `run_id` was always set, and a null one means R-22 fired
 * because the run was deleted — there is nothing to restore.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless')

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run with `node --env-file=.env.local`.')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)

/* The period keys, spelled out rather than derived: this script runs outside the bundler, so it
 * cannot import `lib/badges/catalog.ts`'s TypeScript. `tests/badges.catalog.test.ts` asserts that
 * these five are exactly the non-session badges, so a sixth cannot appear without that test
 * failing first — which is the guard that keeps this literal honest. */
const PERIOD_KEYS = [
  'self_reward',
  'consistency_gremlin',
  'century_club',
  'double_century',
  'dawn_patrol',
]

const rows = await sql`
  select user_id, key, dedupe_key, earned_on
  from badges
  where run_id is null and key = any(${PERIOD_KEYS})
  order by user_id, key, earned_on
`

console.log(`${rows.length} period award(s) with no run recorded.`)
if (rows.length === 0) process.exit(0)

let filled = 0
let ambiguous = 0
let noRun = 0

for (const row of rows) {
  /* Reviewed only — R-1. An unreviewed row cannot have fired a badge, so it cannot be the answer,
   * and offering it would link a badge to numbers no human vouched for (D16). */
  const candidates = await sql`
    select id from runs
    where user_id = ${row.user_id} and occurred_on = ${row.earned_on} and reviewed_at is not null
    order by started_at nulls last, id
  `

  const label = `${row.key} @ ${row.earned_on} (${row.dedupe_key})`

  if (candidates.length === 0) {
    noRun += 1
    console.log(`  skip   ${label} — no reviewed run on that day (swept, or the run was deleted)`)
    continue
  }
  if (candidates.length > 1) {
    ambiguous += 1
    console.log(
      `  skip   ${label} — ${candidates.length} reviewed runs that day; review order is not recorded`,
    )
    continue
  }

  const runId = candidates[0].id
  filled += 1
  console.log(`  ${APPLY ? 'set   ' : 'would '} ${label} -> ${runId}`)

  if (APPLY) {
    /* Keyed on the primary key `(user_id, key, dedupe_key)`, and `run_id is null` again so a
     * concurrent commit that filled it in the meantime wins rather than being overwritten. */
    await sql`
      update badges set run_id = ${runId}
      where user_id = ${row.user_id}
        and key = ${row.key}
        and dedupe_key = ${row.dedupe_key}
        and run_id is null
    `
  }
}

console.log(
  `\n${APPLY ? 'filled' : 'would fill'} ${filled}, skipped ${ambiguous} ambiguous, ${noRun} with no reviewed run that day.`,
)
if (!APPLY && filled > 0) console.log('Dry run. Re-run with --apply to write.')
