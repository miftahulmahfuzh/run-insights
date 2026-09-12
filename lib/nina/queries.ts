/**
 * Every Nina read and write, in one layer — `lib/db/queries.ts` for `lib/nina/`.
 *
 * ## Where each domain lives (the 2026-09-12 split into `lib/nina/queries/`)
 *
 * The layer is `lib/nina/queries/*.ts`, one module per domain; THIS file is the public barrel —
 * one `export * from './queries/<module>'` line per module below, zero imports, no SQL of its
 * own. `queries/columns.ts` (the four shared column lists) is module-internal and deliberately
 * NOT re-exported. The § numbers below are the pre-split section banners, which persist inside
 * each module: a `§4b` title inside `messages.ts` is by design, not staleness.
 *
 *   queries/shapes.ts      §1               the DTO types — ruling A1 lives here
 *   queries/sessions.ts    §3 + §4a         identity and the sessions
 *   queries/messages.ts    §4b + §4c        the messages and their mutation
 *   queries/images.ts      §5, §5a-2, §5b   images, the media view, the admin photo writes
 *   queries/memory.ts      §6               memory slots and the facts ledger
 *   queries/shortcuts.ts   §6b              the trigger → expansion registry
 *   queries/nags.ts        §7               the escalation ledger
 *   queries/turns.ts       §8               the turn audit trail
 *   queries/avatars.ts     §9 + §9b         her album and its file-manager reads
 *   queries/tuning.ts      §10              character tuning
 *   queries/imageprefs.ts  §10b             image-gen prefs + photo references
 *   queries/jobphotos.ts   §11 + §12        the job → photograph link
 *
 * ## The two invariants it inherits
 *
 * **1. userId scoping (roadmap D8, plan invariant 7).** Every exported function takes `userId`
 * as its first parameter and that value is in the `WHERE` of every statement it runs. There is
 * NO exception in this file — `lib/db/queries.ts` has exactly one (`getRunByShareToken`, where a
 * 96-bit token is the credential) and nothing here is credential-addressed. `userId` comes from
 * the session via `requireUserId()`, never from a Server Action argument or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the same outcome. These
 * functions return `null`, `[]` or `false` rather than throwing a `NotFoundError`, because every
 * caller is either Nina's own turn loop (which must degrade, not 500) or an admin screen (which
 * shows "gone" rather than an error page). Nothing here distinguishes absent from forbidden.
 *
 * **2. She never writes her own SQL against `runs` (plan invariant 9).** There is not one
 * reference to `runs`, `records`, `badges` or `insights` below. Nina's view of the training
 * history comes from `lib/db/queries.ts` through `lib/nina/load.ts`, so `reviewed_at IS NOT NULL`
 * keeps gating every aggregate she sees without this file having to remember to.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction. Same rule as `lib/db/queries.ts`, same reason.
 *
 * ## Ordering
 *
 * `nina_messages.seq` is a `bigserial`, so `ORDER BY seq` is the emission order of the whole
 * conversation and nothing in this file needs a composite sort or a tiebreak. See that table's
 * header for why a timestamp could not do the job.
 *
 * **No `import 'server-only'`.** `lib/db/queries.ts` does not have it either, deliberately:
 * adding it would make this module unimportable from Vitest and from `scripts/*.mjs`, and phase
 * 14's operator script is a `scripts/*.mjs`.
 */

export * from './queries/shapes'
export * from './queries/sessions'
export * from './queries/messages'
export * from './queries/images'
export * from './queries/memory'
export * from './queries/shortcuts'
export * from './queries/nags'
export * from './queries/turns'
export * from './queries/avatars'
export * from './queries/tuning'
export * from './queries/imageprefs'
export * from './queries/jobphotos'
