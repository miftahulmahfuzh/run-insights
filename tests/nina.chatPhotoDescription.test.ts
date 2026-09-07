import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The one statement R2 adds, read as SQL rather than as a spy.**
 *
 * `tests/admin.chatPhotos.test.ts` asserts the ACTION's branching with `@/lib/nina/queries` mocked,
 * which by construction cannot answer "was `kind = 'generated'` in the WHERE". That clause is the
 * whole difference between a write reachable from `/admin/photos`'s set and a write reachable from
 * the whole table, so it is asserted here, against generated SQL.
 *
 * The split — and the reason it is a second FILE and not a second `describe` — is
 * `tests/nina.softDelete.test.ts`'s, verbatim in shape: `installFakeDb()` seeds
 * `globalThis.__runInsightsDb` BEFORE `lib/db` is first imported, and two owners of `@/lib/db` in
 * one file is not a thing.
 *
 * ── IT ASSERTS THE PREDICATE AND THE SET LIST, AND NOT THE RETURNED ROW ───────────────────
 * `.returning(imageColumns)` is a positional projection, so a fixture row would have to encode
 * `imageColumns`'s arity — and phase 1 of this plan set adds two columns to it. Enqueuing NO rows
 * asserts the MISS branch instead, which is the branch the action's refusal depends on, and it stays
 * true whatever phase 1 does to the projection. Do not "fix" this by adding a fixture row.
 *
 * ── THE UNQUALIFIED SPELLINGS ARE DELIBERATE ──────────────────────────────────────────────
 * `'"user_id" = $'` matches both `"user_id" = $1` and `"nina_message_images"."user_id" = $1`,
 * because drizzle qualifies a column in a SELECT and may not in an UPDATE and neither spelling is
 * the point. `tests/nina.softDelete.test.ts:56-60` makes the same note about `HIDDEN_SKIPPED`.
 */

type Queries = typeof import('@/lib/nina/queries')

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'

let fake: FakeDb
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

describe('updateNinaChatPhotoDescription', () => {
  it('is owner-scoped, id-scoped and generated-only, in ONE statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'she is underwater, fins on')

    const { sql, params } = fake.only()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"id" = $')
    // The clause `setNinaMessageImageDescription` does NOT have, and the reason this is a second
    // statement rather than a wider signature on that one: /admin/photos lists only hers.
    expect(sql).toContain('"kind" = $')
    expect(params).toContain('generated')
    expect(params).toContain(USER)
    expect(params).toContain(ID)
  })

  it('touches `description` and nothing else', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'x')

    const { sql } = fake.only()
    expect(sql).toContain('set "description" = $')
    // Correcting a sentence about a photograph is not taking a new one, and it is not re-pointing
    // the row at new bytes either. `created_at` in particular orders /nina/about and /admin/photos.
    expect(sql).not.toContain('"created_at" =')
    expect(sql).not.toContain('"blob_url" =')
    expect(sql).not.toContain('"pathname" =')
    expect(sql).not.toContain('"prompt" =')
    expect(sql).not.toContain('"sort_order" =')
  })

  it('carries a NULL through as a bound parameter — the clear (D1)', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, null)

    const { sql, params } = fake.only()
    expect(sql).toContain('set "description" = $')
    expect(params[0]).toBeNull()
  })

  it('returns null when no row matched, so the action can refuse', async () => {
    fake.enqueue([])
    await expect(queries.updateNinaChatPhotoDescription(USER, ID, 'x')).resolves.toBeNull()
  })
})
