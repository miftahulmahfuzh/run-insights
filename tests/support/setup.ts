/**
 * Shared Vitest setup. F01 created this file so F03/F04/F07 have one place to put process-wide
 * test defaults instead of each writing their own.
 *
 * DATABASE_URL: lib/db/index.ts constructs the Neon client eagerly at import time, so that a
 * missing connection string is a loud boot crash in production rather than a silent `undefined`
 * that fails on the first query. `neon()` performs no I/O at construction, so a syntactically
 * valid dummy URL lets every unit test import the query modules and inspect the SQL they build
 * without ever touching a network. Tests that need a REAL database (tests/integration/**) read
 * TEST_DATABASE_URL instead and skip themselves when it is absent.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://unit:test@ep-unit-test-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
}

/**
 * F04: `lib/env.ts` parses the core group EAGERLY at import, which is exactly what we want in
 * production (a missing key fails the build, not the first upload) and exactly what makes
 * `lib/llm/vision.ts` unimportable under Vitest without these. They are dummies, and no unit test
 * ever reaches the network — every call goes through an injected `fetch` or an injected client, so
 * the base URL below is never resolved and the key below is never sent anywhere.
 *
 * They mirror the CI workflow's env block deliberately. If these two lists ever disagree, one of
 * `npm test` and CI is testing something the other is not.
 *
 * `tests/live/**` is the exception, and it is excluded from every default run (see
 * vitest.config.ts): it reads the real values from `.env.local` and calls the real endpoint.
 */
const LLM_DEFAULTS: Record<string, string> = {
  LLM_API_KEY: 'unit-test-key-never-sent',
  LLM_VISION_BASE_URL: 'https://api.z.ai/api/coding/paas/v4',
  LLM_VISION_MODEL: 'glm-4.6v',
  LLM_BASE_URL: 'https://api.z.ai/api/anthropic',
  LLM_MODEL: 'glm-5.3',
  DATABASE_URL_UNPOOLED: 'postgresql://unit:test@ep-unit-test.ap-southeast-1.aws.neon.tech/neondb',
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_unit_test',
}
for (const [key, value] of Object.entries(LLM_DEFAULTS)) {
  process.env[key] ??= value
}
