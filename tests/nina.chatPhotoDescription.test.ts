import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The admin write side of §5b, read as SQL rather than as a spy.**
 *
 * `tests/admin.chatPhotos.test.ts` asserts the ACTION's branching with `@/lib/nina/queries` mocked,
 * which by construction cannot answer "was the reference backstop in the WHERE". That clause is the
 * whole difference between a write reachable from the Media view's set (every ORIGINAL row, both
 * kinds) and a write reachable from the whole table (references included) — `isOriginalPhoto()` is
 * the clause that holds the line — so it is asserted here, against generated SQL.
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
  it('is owner-scoped, id-scoped and ORIGINAL-only, in ONE statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'she is underwater, fins on')

    const { sql, params } = fake.only()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"id" = $')
    // The clause that replaced `kind = 'generated'`: every original of BOTH kinds is describable
    // since the merge, and a REFERENCE row is what the WHERE still refuses — the second of the
    // two agreeing checks (`tests/nina.photoRefs.test.ts` pins the same pair on the listings).
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    expect(sql).not.toContain('"kind" = $')
    expect(params).toContain(USER)
    expect(params).toContain(ID)
  })

  it('touches `description` and nothing else', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'x')

    const { sql } = fake.only()
    expect(sql).toContain('set "description" = $')
    // Correcting a sentence about a photograph is not taking a new one, and it is not re-pointing
    // the row at new bytes either. `created_at` in particular orders /nina/about and the Media view.
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

describe('updateNinaChatPhotoBlob — the replace write (D-P2-1)', () => {
  it('is original-only and kind-blind: a replaced upload keeps its kind', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob(USER, ID, {
      blobUrl: 'https://x.example/nina/u1/selfie-n.jpg',
      pathname: 'nina/u1/selfie-n.jpg',
      width: 768,
      height: 1024,
      bytes: 240_000,
      contentHash: null,
    })

    const { sql } = fake.only()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    // The old kind clause is gone: one of HIS uploads is replaceable now, and the statement
    // never writes `kind` — the row keeps its side with new bytes.
    expect(sql).not.toContain('"kind" = $')
    expect(sql).not.toContain('set "kind"')
  })

  it('nulls description, prompt and the provenance pair in the same statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob(USER, ID, {
      blobUrl: 'https://x.example/nina/u1/selfie-n.jpg',
      pathname: 'nina/u1/selfie-n.jpg',
      width: 768,
      height: 1024,
      bytes: 240_000,
    })

    const { sql } = fake.only()
    // Drizzle spells the SET clause once and comma-joins the assignments, so the column names,
    // not a repeated `set`, are what proves all five land in the ONE statement.
    expect(sql).toContain('"description" = $')
    expect(sql).toContain('"prompt" = $')
    expect(sql).toContain('"source_avatar_id" = $')
    expect(sql).toContain('"source_image_id" = $')
    // And the R2 mechanic this phase's UI leans on: the sidecar dies with the bytes it
    // produced, so the prompt affordance has nothing to render.
  })
})
