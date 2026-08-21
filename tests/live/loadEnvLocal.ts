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

export {}
