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
