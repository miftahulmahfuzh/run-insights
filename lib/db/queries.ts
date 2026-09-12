/* ============================================================================
 * Every read and write the application performs, split into domain modules behind this
 * barrel — the same move `db-schema-split` made for schema.ts. The § numbers in the module
 * headers are this file's original monolith sections, kept so history and old references stay
 * greppable.
 *
 * ## Two invariants govern every module
 *
 * **1. The userId-scoping invariant (roadmap D8).** Every exported function that reads or writes
 * one user's data takes `userId` as its first parameter and that value appears in the `WHERE` of
 * every statement it runs. Exactly TWO exceptions: `getRunByShareToken` (queries/sharedRun.ts),
 * unscoped by contract because the 96-bit token *is* the credential, and `listActiveUserIds`
 * (queries/rollups.ts), a directory read over all users with nothing to scope. Never add a third.
 * `userId` must come from the session (F02's `requireUserId()`), never from a Server Action
 * argument, a form field or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the SAME outcome
 * (`NotFoundError` → 404). Distinguishing them is an id-enumeration oracle.
 *
 * **2. The reviewed-data invariant (roadmap D16 / R-13).** Every rollup, list, chart input,
 * record input and badge input filters `runs.reviewed_at IS NOT NULL`. The split between
 * draft-visible and reviewed-only reads is a contract, not an accident, and
 * `tests/db.queries.reviewedOnly.test.ts` asserts it function by function — because the failure
 * mode (a missing filter on the eleventh query) is silent and produces a plausible wrong number.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction, which buys atomicity AND a single round trip. Every
 * multi-statement write in the modules uses it.
 *
 * THIS file stays the single import path: every consumer imports from '@/lib/db/queries' and none
 * may reach into a domain module directly (same rule as schema.ts). `queries/internal.ts` is the
 * one module this barrel deliberately does NOT re-export — `runBatch` and `Statement` are
 * plumbing for sibling modules, not public surface.
 *
 * Layout (each module owns the queries for its tables):
 *
 *   - `./queries/errors`       — NotFoundError, DuplicateRunError, isUniqueViolation (§1)
 *   - `./queries/ownership`    — the correlated-EXISTS predicates and assert* helpers (§3)
 *   - `./queries/runs`         — the review commit, corrections, intent, run reads, Nina
 *                                attachments (§4)
 *   - `./queries/rollups`      — reviewed-only aggregates, lifetime totals, the cron's user
 *                                directory (§5)
 *   - `./queries/badgeReads`   — F09's badge-rule reads over reviewed runs (§5b)
 *   - `./queries/extractions`  — the append-only audit trail (§6)
 *   - `./queries/photos`       — R-1's two-parent screenshot lifecycle (§7)
 *   - `./queries/profile`      — the runner profile (§8)
 *   - `./queries/insights`     — the LLM insight cache (§8)
 *   - `./queries/records`      — personal records, replaced wholesale (§8)
 *   - `./queries/badges`       — the award ledger (§8)
 *   - `./queries/shares`       — share tokens (§8)
 *   - `./queries/sharedRun`    — THE one unscoped read (§9)
 * ==========================================================================*/

export * from './queries/errors'
export * from './queries/ownership'
export * from './queries/runs'
export * from './queries/rollups'
export * from './queries/badgeReads'
export * from './queries/extractions'
export * from './queries/photos'
export * from './queries/profile'
export * from './queries/insights'
export * from './queries/records'
export * from './queries/badges'
export * from './queries/shares'
export * from './queries/sharedRun'
