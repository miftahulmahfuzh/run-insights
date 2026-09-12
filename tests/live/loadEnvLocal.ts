import { config } from 'dotenv'

/**
 * Loads the REAL credentials from `.env.local`, for the opt-in live suites only.
 *
 * WHY THIS IS ITS OWN MODULE, IMPORTED FIRST. Two ordering facts collide:
 *
 *  1. `tests/support/setup.ts` fills `LLM_API_KEY` with a dummy, and Vitest runs setup files
 *     before any test module — hence `override: true`.
 *  2. ES module imports are evaluated **before** the importing module's body runs. A
 *     `loadDotenv()` call in the test file's body therefore executes *after* every one of its
 *     `import` statements — including `@/lib/llm/vision`, which pulls `@/lib/env`, which parses
 *     `process.env` **eagerly at import time**. The real key would land in `process.env` a
 *     moment too late, and `env.LLM_API_KEY` would already hold the dummy. The live suite failed
 *     with `401 token expired or incorrect` for exactly this reason before this file existed.
 *
 * Being a separate module in the FIRST import position is what puts the load ahead of that chain.
 * Nothing outside `tests/live/` imports it, and `tests/live/` is excluded from every default run
 * (see `vitest.config.ts`), so no ordinary `npm test` can reach a real credential through it.
 */
config({ path: '.env.local', override: true, quiet: true })

/**
 * The one predicate every live suite gates its `describe.skipIf` on: a key that is present and is
 * neither of the two sentinels `tests/support/setup.ts` fills in — `unit-test-key-never-sent`
 * locally, `ci-dummy-key` mirroring the CI env block. It lives here, next to the load, because
 * the two are a pair: the sentinel is what a key reads as UNTIL the override above replaces it.
 * Each suite used to hand-roll its own copy of this check (a Set in one file, a variadic
 * `realKey` in another); a new sentinel added to one copy and not the others would silently
 * change which suites run where, so they now all ask this one function.
 */
export function hasRealLlmKey(key: string | undefined): boolean {
  return key != null && key !== '' && key !== 'unit-test-key-never-sent' && key !== 'ci-dummy-key'
}
