/**
 * **Nina's camera, off-platform.** RU-19 and RU-20: the shipping generation is 78.2 s measured and
 * Vercel Hobby caps a function at 60 s in `sin1`, so the call cannot happen in the app at all. This
 * script is the generator, and GitHub Actions is the host.
 *
 *   node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts --job <jobId>
 *   node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts
 *   node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --dry-run
 *
 *   npm run nina:worker            # the sweep, against whatever .env.local points at
 *   npm run nina:worker:dry        # preflight only: no OpenRouter call, no writes
 *
 * With `--job` it does that one job — the `workflow_dispatch` path, and the normal one. With no
 * `--job` it drains up to `NINA_IMAGE_SWEEP_BUDGET` actionable jobs — the `schedule:` backstop path,
 * which exists because a dispatch can be lost and because Vercel Hobby caps crons at two and phase
 * 10 spent the second on `/api/cron/nina`. That backstop is the single best property of RU-20's
 * choice: it is the third cron the platform would not give us.
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database, spends real money and writes
 * real bytes. The same line `scripts/blob-reap.mjs` and `scripts/backfill-record-keys.mjs` draw. It
 * is nonetheless IMPORTABLE by a test — `main()` runs only when this file is the process entry point
 * — so `tests/nina.imageworker.test.ts` can drive `parseArgv` and `generate` with no network.
 *
 * ── WHERE THE CODE LIVES ───────────────────────────────────────────────────────────────────────
 * The implementation lives in `scripts/nina-image-worker/`, one module per responsibility; this file
 * is what npm and the workflow execute, the test's import path, and a re-export barrel — its
 * published surface is exactly what the single file used to export, so no importer changed. Each
 * module's header states its responsibility and re-points here; every module obeys this file's
 * import rules (`.ts`-suffixed relative imports, no `@/` aliases, no `server-only`, CJS packages
 * through `createRequire`).
 *
 *   sql.ts        `NeonSql` and `connectSql` — the client, and the one place it is built
 *   preflight.ts  `REQUIRED_COLUMNS`, `findSchemaDrift`, `preflight` — the ground it stands on
 *   claim.ts      `dispatchCutoffFor`, `claimJob` — the only lock in the system
 *   dedupe.ts     `findContentDuplicate` — the worker's spelling of the app's content lookup
 *   generate.ts   `fetchReference`, `generate` — one OpenRouter call, never throws
 *   store.ts      `store` — hash before put, in lockstep with the app side
 *   session.ts    `resolveWorkerSessionId` — FINDING 1's session policy
 *   finish.ts     `finishSelfie`, `finishAvatar`, `closeFailed` — the ledger writes
 *   cleanup.ts    `releaseBlobIfUnreferenced` — row first, blob second
 *   run.ts        `runOneJob` — claim, generate, close
 *   main.ts       `parseArgv`, `main` — argv, preflight, the sweep budget
 *
 * (`finishAvatar` is exported by `finish.ts` for `run.ts` but deliberately not re-exported here —
 * the barrel's surface is the old file's surface, and the old file did not export it.)
 *
 * ── WHY IT IS `.ts`, AND WHAT THAT COSTS ──────────────────────────────────────────────────────
 * `package.json`'s `records:backfill` already runs
 * `node --experimental-strip-types --no-warnings scripts/backfill-record-keys.mjs`, and that script
 * imports `../lib/records/catalog.ts` directly (its line 85). Its header states the rule it obeys: a
 * `lib/` module can be imported from `scripts/` when stripping its types leaves no runtime
 * dependency and no `@/` alias to resolve. This worker obeys the same rule and imports three such
 * modules — `../lib/nina/imagefail.ts`, `../lib/nina/imagerecipe.ts` and `../lib/id.ts` (whose own
 * header says it exists to be importable "from Vitest, from `research/*.mjs` and from a Route
 * Handler alike, with nothing to resolve"). **That is why R22's copy, the payload shape, the
 * pathname convention, the cap and every threshold are not duplicated here.**
 *
 * The extension is `.ts` rather than `.mjs` because this file is itself annotated and a test imports
 * its exports. The one cost, measured rather than assumed: `tsconfig.json` includes `**\/*.ts`, so
 * `tsc --noEmit` typechecks this file, and a `.ts` import specifier is `error TS5097` unless
 * `allowImportingTsExtensions` is on. That flag is therefore set — it requires `noEmit`, which this
 * project already has, and it changes nothing else. `backfill-record-keys.mjs` escaped the same
 * error only by being invisible to `tsc`.
 *
 * ── WHAT IT CANNOT IMPORT, AND WHAT THAT COSTS ────────────────────────────────────────────────
 * `lib/nina/queries.ts` and `lib/db/*` import `server-only` and use `@/` aliases, so the worker
 * writes its own SQL through `@neondatabase/serverless` — exactly as `scripts/blob-reap.mjs`,
 * `scripts/db-smoke.mjs` and both backfill scripts do. `lib/env.ts` is unreachable for the same
 * reason, so the worker reads `process.env` directly and validates by hand in `preflight`. The cost
 * is that column names are written twice, in `lib/db/schema.ts` and here; the mitigation is the
 * `information_schema` preflight, which turns a drift into a loud failure on the very next
 * scheduled run rather than a silent one at 3am. That trade is the plan's Risk 1.
 *
 * ── WHY IT MAY RUN ON A LAPTOP TOO ────────────────────────────────────────────────────────────
 * `npm run nina:worker` against `.env.local` is a fully supported manual runner: it is how a stuck
 * job gets drained during development and how the setup checklist is verified. It is NOT the
 * shipping mechanism — RU-21 forbids anything needing the user present — but it means the mechanism
 * is swappable. If GitHub ever becomes the wrong host, the replacement (a Fly machine, a Railway
 * worker, a cron on a box) runs this same file with the same three environment variables and
 * nothing else in the phase changes.
 */
export type { NeonSql } from './nina-image-worker/sql.ts'
export { parseArgv, main, type WorkerArgv } from './nina-image-worker/main.ts'
export {
  REQUIRED_COLUMNS,
  findSchemaDrift,
  preflight,
  type SchemaColumn,
} from './nina-image-worker/preflight.ts'
export { findContentDuplicate, type WorkerContentDuplicate } from './nina-image-worker/dedupe.ts'
export { dispatchCutoffFor, claimJob, type ClaimedJob } from './nina-image-worker/claim.ts'
export { fetchReference, generate, type WorkerOutcome } from './nina-image-worker/generate.ts'
export { store, type WorkerStoredImage } from './nina-image-worker/store.ts'
export { releaseBlobIfUnreferenced } from './nina-image-worker/cleanup.ts'
export { resolveWorkerSessionId } from './nina-image-worker/session.ts'
export { finishSelfie, closeFailed } from './nina-image-worker/finish.ts'
export { runOneJob } from './nina-image-worker/run.ts'

import { fileURLToPath } from 'node:url'

import { main } from './nina-image-worker/main.ts'

/* Run only as a script, so a test can import everything above. Removing this guard makes
 * `tests/nina.imageworker.test.ts` open a database connection on import. The guard MUST stay in
 * THIS file: it compares `import.meta.url` against `process.argv[1]`, and the barrel's path is the
 * only one either npm or the workflow ever puts in `argv[1]`. */
if (process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('[nina-worker] fatal', error)
      process.exit(1)
    })
}
