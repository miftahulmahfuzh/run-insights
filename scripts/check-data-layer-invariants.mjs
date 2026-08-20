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
//    exported query in lib/db/queries.ts takes `userId` as its first parameter. This check counts
//    the exceptions and fails if a new one appears — a signed-in user reading another user's runs
//    is the one bug in this codebase that has no recoverable failure mode.
//
// Fix the code, never silence the check.
import { readFileSync } from 'node:fs'

const QUERIES = 'lib/db/queries.ts'
const source = readFileSync(QUERIES, 'utf8')
const failures = []

const deletePath = /\.delete\(\s*extractions\s*\)/.exec(source)
if (deletePath) {
  failures.push(
    `${QUERIES} contains a delete path for extractions ("${deletePath[0]}"). ` +
      'The audit trail is append-only — see docs/plans/F03-data-layer.md D3.',
  )
}

// Deliberate exceptions, each documented at its definition:
//   getRunByShareToken — roadmap D9, the token IS the credential
//   fillZeroMonths     — pure function, no database access at all
//   isUniqueViolation  — pure predicate over an error object
const ALLOWED_UNSCOPED = new Set(['getRunByShareToken', 'fillZeroMonths', 'isUniqueViolation'])

const unscoped = [...source.matchAll(/export (?:async )?function (\w+)\(([^)]*)/g)]
  .filter(([, , args]) => !/^\s*userId/.test(args))
  .map(([, name]) => name)
  .filter((name) => !ALLOWED_UNSCOPED.has(name))

if (unscoped.length > 0) {
  failures.push(
    `${QUERIES} exports ${unscoped.length} function(s) that do not take userId first: ` +
      `${unscoped.join(', ')}. Every query is ownership-scoped; the only sanctioned exception is ` +
      'getRunByShareToken. See docs/plans/F03-data-layer.md §8.',
  )
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`)
  process.exit(1)
}

console.log('OK    extractions has no delete path')
console.log('OK    getRunByShareToken is still the only unscoped read')
