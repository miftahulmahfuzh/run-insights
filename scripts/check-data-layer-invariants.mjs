// The two F03 invariants that are cheaper to grep than to test, checked with a real exit code.
//
// 1. `extractions` is APPEND-ONLY (F03 D3). Every field a human corrects in review is a labelled
//    extraction failure — model said X, truth was Y, for a known field against a known image.
//    `runs` keeps only the corrected value, so `extractions.raw_response` + `corrections` are the
//    only place the model's wrongness survives. A DELETE path throws away the one signal that can
//    tighten the prompt. Rows leave this table exactly one way: the user_id cascade when an
//    account is deleted.
//
// 2. `getRunByShareToken` is the ONLY unscoped read in the app (roadmap D8/D9). Every other
//    exported query in lib/db/queries takes `userId` as its first parameter. This check counts
//    the exceptions and fails if a new one appears — a signed-in user reading another user's runs
//    is the one bug in this codebase that has no recoverable failure mode.
//
// Fix the code, never silence the check.
import { readdirSync, readFileSync } from 'node:fs'

// The query layer is the barrel plus the domain modules behind it (db-queries-split, 2026-09-12).
// Both invariants are checked against EVERY module file: a check against the barrel alone would
// pass vacuously, because the barrel re-exports and declares nothing.
const BARREL = 'lib/db/queries.ts'
const MODULES_DIR = 'lib/db/queries'

const sources = [{ file: BARREL, source: readFileSync(BARREL, 'utf8') }]
for (const entry of readdirSync(MODULES_DIR, { recursive: true })) {
  if (entry.endsWith('.ts')) {
    sources.push({
      file: `${MODULES_DIR}/${entry}`,
      source: readFileSync(`${MODULES_DIR}/${entry}`, 'utf8'),
    })
  }
}
sources.sort((a, b) => a.file.localeCompare(b.file))

const failures = []

for (const { file, source } of sources) {
  const deletePath = /\.delete\(\s*extractions\s*\)/.exec(source)
  if (deletePath) {
    failures.push(
      `${file} contains a delete path for extractions ("${deletePath[0]}"). ` +
        'The audit trail is append-only — see docs/plans/archive/F03-data-layer.md D3.',
    )
  }
}

// Deliberate exceptions, each documented at its definition:
//   getRunByShareToken — roadmap D9, the token IS the credential
//   isUniqueViolation  — pure predicate over an error object
//   listActiveUserIds  — F07's cron has no session; it returns ids and nothing else, and every
//                        read inside its loop is scoped to one of them
//   runBatch           — queries/internal.ts plumbing: it executes caller-built statements and
//                        scopes nothing itself
const ALLOWED_UNSCOPED = new Set([
  'getRunByShareToken',
  'isUniqueViolation',
  'listActiveUserIds',
  'runBatch',
])

const unscoped = sources.flatMap(({ file, source }) =>
  [...source.matchAll(/export (?:async )?function (\w+)\(([^)]*)/g)]
    .filter(([, , args]) => !/^\s*userId/.test(args))
    .map(([, name]) => name)
    .filter((name) => !ALLOWED_UNSCOPED.has(name))
    .map((name) => `${file}: ${name}`),
)

if (unscoped.length > 0) {
  failures.push(
    `lib/db/queries exports ${unscoped.length} function(s) that do not take userId first: ` +
      `${unscoped.join(', ')}. Every query is ownership-scoped; the only sanctioned exception is ` +
      'getRunByShareToken. See docs/plans/archive/F03-data-layer.md §8.',
  )
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`)
  process.exit(1)
}

console.log(`OK    extractions has no delete path (barrel + ${sources.length - 1} modules)`)
console.log('OK    getRunByShareToken is still the only unscoped read')
