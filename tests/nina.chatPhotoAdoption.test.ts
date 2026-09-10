import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { readRepoCode } from './support/importGraph'

/**
 * **R4 at the statement level, plus the refusal that keeps a re-share out of the operator's hands.**
 *
 * The properties, in the order they would hurt if they were wrong:
 *
 *   1. **Adoption is ONE `UPDATE`, owner-scoped, and only ever reaches an ORPHAN.** `message_id is
 *      null` has to be in the WHERE and not in a branch above it, or a row that gains a message
 *      between the caller's read and this statement is moved out of a live bubble — the same class
 *      of loss R1 exists to stop.
 *   2. **It mutates two columns and no others.** `created_at` (plan invariant 6), the two F37
 *      provenance columns, `description` and `kind` all stay: re-parenting a photograph is not
 *      taking a new one, and says nothing about where its bytes came from.
 *   3. **It writes nothing and deletes nothing else** — plan invariant 2.
 *   4. **Replace and Remove refuse a reference row**, before they read or delete anything.
 *      `getNinaMessageImage` deliberately carries no reference filter (it is the bubble and viewer
 *      read too, `tests/nina.photoRefs.test.ts` asserts that absence), so the two admin actions can
 *      still reach a row `/admin/photos` never listed. The guard is where that stops.
 *
 * Asserted against generated SQL rather than against a spy: a spy passes with the `message_id is
 * null` predicate deleted.
 *
 * The exclusion is spelled `source_avatar_id` / `source_image_id` rather than the `is_reference`
 * column this phase's plan named — coordinator ruling C7 struck that column, because `origin/main`
 * shipped the provenance pair first and `isOriginalPhoto()` is built on it.
 */

type Queries = typeof import('@/lib/nina/queries')

let fake: FakeDb
let q: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  q = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** `imageColumns` in projection order, as an arrayMode row. */
function imageRow(overrides: { id?: string; messageId?: string | null } = {}): unknown[] {
  return projectedRow(
    overrides.id ?? 'imgAAAAAAAAA',
    overrides.messageId === undefined ? 'msgBBBBBBBBB' : overrides.messageId,
    'generated',
    'https://blob.example/nina/u1/selfie-1.jpg',
    'nina/u1/selfie-1.jpg',
    1024,
    1536,
    240_000,
    null,
    null,
    null,
    null,
    0,
    '2026-09-01 09:00:00+00',
  )
}

describe('adoptNinaMessageImage — R4, in one statement', () => {
  const into = { messageId: 'msgRUNNER001', sortOrder: 0 }

  it('is a single owner-scoped UPDATE that only matches an ORPHAN', async () => {
    fake.enqueue([])
    await expect(q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', into)).resolves.toBeNull()

    const update = fake.only()
    expect(update.sql).toMatch(/^update "nina_message_images" set/)
    expect(update.sql).toContain('"message_id" = $')
    expect(update.sql).toContain('"sort_order" = $')
    expect(update.sql).toContain('"user_id" = $')
    expect(update.sql).toContain('"id" = $')
    expect(update.sql).toContain('"message_id" is null')
    expect(update.sql).toContain('returning')
    expect(update.params).toContain('u1')
    expect(update.params).toContain('imgAAAAAAAAA')
    expect(update.params).toContain('msgRUNNER001')
    expect(fake.batches).toEqual([])
  })

  it('never bumps created_at and never rewrites the provenance', async () => {
    fake.enqueue([])
    await q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', { ...into, sortOrder: 3 })

    /* The SET clause only. `"message_id" is null` and the RETURNING list live past the WHERE. */
    const setClause = fake.only().sql.split(' where ')[0]!
    expect(setClause).not.toContain('created_at')
    expect(setClause).not.toContain('source_avatar_id')
    expect(setClause).not.toContain('source_image_id')
    expect(setClause).not.toContain('description')
    expect(setClause).not.toContain('"kind"')
  })

  it('returns the adopted row, so the caller needs no second read', async () => {
    fake.enqueue([imageRow({ id: 'imgAAAAAAAAA', messageId: 'msgRUNNER001' })])
    const adopted = await q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', into)

    expect(adopted?.id).toBe('imgAAAAAAAAA')
    expect(adopted?.messageId).toBe('msgRUNNER001')
    expect(adopted?.sourceAvatarId).toBeNull()
    expect(adopted?.sourceImageId).toBeNull()
  })

  it('inserts nothing and deletes nothing — plan invariant 2', async () => {
    fake.enqueue([])
    await q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', into)
    for (const query of fake.queries) {
      expect(query.sql).not.toContain('insert into')
      expect(query.sql).not.toContain('delete from')
    }
  })
})

describe('a reference row is not a member, so replace and remove refuse it', () => {
  const source = readRepoCode('lib/admin/chatPhotoActions.ts')

  function bodyOf(name: string): string {
    const after = source.split(`export async function ${name}`)[1]
    expect(after).toBeDefined()
    return after!.split('export async function')[0]!
  }

  it('reads the provenance pair, which is isOriginalPhoto() one row at a time', () => {
    expect(source).toContain('row.sourceAvatarId != null || row.sourceImageId != null')
  })

  it('refuses in replace, before the UPDATE is issued', () => {
    const body = bodyOf('replaceChatPhotoAction')
    expect(body).toContain('isChatPhotoReference(existing)')
    expect(body.indexOf('isChatPhotoReference(existing)')).toBeLessThan(
      body.indexOf('updateNinaChatPhotoBlob('),
    )
  })

  it('refuses in remove, before anything is read or deleted', () => {
    const body = bodyOf('removeChatPhotoAction')
    expect(body).toContain('isChatPhotoReference(row)')
    expect(body.indexOf('isChatPhotoReference(row)')).toBeLessThan(
      body.indexOf('loadPhotoCarrier('),
    )
    expect(body.indexOf('isChatPhotoReference(row)')).toBeLessThan(
      body.indexOf('deleteNinaMessage'),
    )
  })

  it('says which of the two "no"s it is, rather than the generic miss', () => {
    expect(source).toContain('lives elsewhere')
  })

  it('media-dedupe P3: the ADD path writes provenance only through planChatPhotoAddWrite', () => {
    // Used to pin "ADD says nothing about provenance — those bytes are an original", true when
    // every add WAS an original. media-dedupe P3 superseded that: an add whose bytes the
    // collection already holds IS a re-share (F37's shape), so the columns are named — but only
    // through the plan helper's values, and a fresh add still binds NULL there (pinned pure in
    // tests/admin.chatPhotoDedupe.test.ts and through the action in tests/admin.chatPhotos.test.ts).
    const body = bodyOf('addChatPhotoAction')
    expect(body).toContain('planChatPhotoAddWrite(')
    expect(body).toContain('sourceAvatarId: plan.sourceAvatarId')
    expect(body).toContain('sourceImageId: plan.sourceImageId')
  })
})
