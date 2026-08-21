import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The single test-runner config for this repo (F01 owns it; do not write a second one).
 *
 *   - F03/F04/F06/F07/F09 write co-located `lib/**\/*.test.ts` and `app/**\/*.test.ts`.
 *   - F01 writes `tests/research/*.test.ts` — see docs/plans/F01-foundation.md section 4.
 *   - `tests/integration/**` (F03, opt-in via VITEST_INTEGRATION=1) is excluded by default
 *     so a plain `npm test` never reaches a real database.
 */
const integration = process.env.VITEST_INTEGRATION === '1'
/**
 * `tests/live/**` calls the real `glm-4.6v` endpoint: it costs money, it takes ~35 s per case, and
 * it can flake on vendor availability (`IMPLEMENTATION_PLAN.md` §1.2's overload note). Excluded
 * from every default run; `npm run test:live:vision` sets this and opts in. §4.9's "no test may
 * call a live LLM except the explicitly-tagged live suites" is enforced here, not by convention.
 */
const live = process.env.LLM_LIVE_TEST === '1'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      /*
       * 'server-only' throws on import outside a bundler that selects the react-server
       * condition, which Vitest does not. Any module opening with `import 'server-only'`
       * (lib/env.ts, and later F04's lib/llm/*.ts, F03's lib/db/client.ts) is untestable as
       * shipped without this alias. See expense-tracking/vitest.config.ts for the fuller
       * rationale — same tradeoff, same answer.
       */
      'server-only': fileURLToPath(new URL('./tests/support/serverOnlyStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      '.next/**',
      ...(integration ? [] : ['tests/integration/**']),
      ...(live ? [] : ['tests/live/**']),
    ],
    /** A live vision call is ~35 s; the default 5 s timeout would fail it before it answered. */
    testTimeout: live ? 180_000 : 5_000,
    setupFiles: ['tests/support/setup.ts'],
  },
})
