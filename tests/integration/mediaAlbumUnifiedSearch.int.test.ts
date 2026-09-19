import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * `media-album-unified-search` invariants 3 and 4, against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled neon url> npm run test:int
 *
 * Skipped entirely without `TEST_DATABASE_URL`, so `npm test` never touches a database, and
 * `DATABASE_URL` is deliberately NOT a fallback: this repo has exactly one database and it is
 * production. Safe against a shared database the way `tests/integration/hrMax.int.test.ts` is —
 * every row hangs off one throwaway user with a unique suffix, removed in `afterAll`.
 *
 * ── WHAT THESE TWO CASES PROVE THAT THE UNIT SUITES CANNOT ──────────────────────────────────
 * `tests/support/fakeDb.ts` records statements and replays enqueued rows; it never evaluates a
 * predicate. So phase 2's `tests/nina.mediaSearch.test.ts` and `tests/nina.avatarSearch.test.ts` can
 * prove that each arm's WHERE contains the right text, and nothing more. Whether the two arms are
 * COMPLEMENTARY — whether exactly one of a linked pair survives — is a question about Postgres, and
 * so is whether a write through the album redirect is readable back from the media row. Both are
 * asked here, once, against the real thing.
 *
 * Invariant 4: "Every physical photograph appears in a merged search result at most once."
 * Invariant 3: "A pointer row never independently stores description/keywords; every read and every
 *               write for a pointer redirects to its linked Media row."
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const USER = `mau-u1-${SUFFIX}`
const IMAGE_ID = `mau-img-${SUFFIX}`
const POINTER_ID = `mau-ptr-${SUFFIX}`
const PLAIN_ID = `mau-alb-${SUFFIX}`

const STORE = 'https://example.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/selfie-${IMAGE_ID}.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`

/**
 * A 1536-wide unit vector pointing at axis 0, and a second one pointing at axis 1. Cosine distance
 * between them is 1.0, and between either and itself is 0.0 — so "which row ranks first" is decided
 * by construction and not by a model.
 */
function axisVector(axis: number): number[] {
  return Array.from({ length: 1536 }, (_, i) => (i === axis ? 1 : 0))
}
const QUERY_VECTOR = axisVector(0)

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type Queries = typeof import('@/lib/nina/queries')

let db: Db
let s: Schema
let q: Queries

beforeAll(async () => {
  if (!enabled) return
  vi.resetModules()
  ;({ db } = await import('@/lib/db/index'))
  s = await import('@/lib/db/schema')
  q = await import('@/lib/nina/queries')

  await db.insert(s.users).values({ id: USER, email: `${USER}@example.test` })

  /* The MEDIA original: a real photograph, described, embedded on axis 0 so the query vector
   * matches it exactly. */
  await db.insert(s.ninaMessageImages).values({
    id: IMAGE_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: BLOB_URL,
    pathname: PATHNAME,
    description: 'she is underwater in a black swimsuit and fins',
    descriptionEmbedding: axisVector(0),
  })

  /* The POINTER: an album row that borrows those bytes and stores none of its own prose. This is
   * what `linkChatPhotoIntoAlbum` writes — same blob_url, same pathname, NULL description, NULL
   * keywords, NULL vector, and `source_image_id` naming the media row. */
  await db.insert(s.ninaAvatars).values({
    id: POINTER_ID,
    userId: USER,
    source: 'admin',
    blobUrl: BLOB_URL,
    pathname: PATHNAME,
    folder: '',
    sourceKey: `chat-photo:${IMAGE_ID}`,
    sourceImageId: IMAGE_ID,
    description: null,
    searchKeywords: null,
    negativeSearchKeywords: null,
    descriptionEmbedding: null,
  })

  /* An ORDINARY album row, on axis 1 — the control. It must keep ranking exactly as it does today,
   * which is what proves the merge did not simply disable the album arm. */
  await db.insert(s.ninaAvatars).values({
    id: PLAIN_ID,
    userId: USER,
    source: 'admin',
    blobUrl: `${STORE}/nina/${USER}/avatar-${PLAIN_ID}.jpg`,
    pathname: `nina/${USER}/avatar-${PLAIN_ID}.jpg`,
    folder: '',
    description: 'she is on a beach at sunset',
    descriptionEmbedding: axisVector(1),
  })
})

afterAll(async () => {
  if (!enabled) return
  /*
   * ORDER IS LOAD-BEARING. `nina_avatars.source_image_id` is ON DELETE RESTRICT, and deleting the
   * user cascades to BOTH tables through their own user_id FKs in an order Postgres does not
   * specify. If the images go first while the pointer still names one, RESTRICT fires and the whole
   * cleanup errors. Dropping the pointer explicitly first makes the cascade unambiguous.
   */
  await db.delete(s.ninaAvatars).where(eq(s.ninaAvatars.userId, USER))
  await db.delete(s.users).where(eq(s.users.id, USER))
})

describe.skipIf(!enabled)('invariant 4 — one physical photograph, at most one hit', () => {
  it('ranks the MEDIA original and never its album pointer, for a query that matches both bytes', async () => {
    const page = await q.searchNinaPhotosByText(USER, QUERY_VECTOR, null)

    const forThisPhoto = page.rows.filter((row) => row.id === IMAGE_ID || row.id === POINTER_ID)

    /* THE INVARIANT, as a count. Two rows in two tables describe one physical photograph; exactly
     * one of them may be a hit. */
    expect(forThisPhoto).toHaveLength(1)
    expect(forThisPhoto[0]?.id).toBe(IMAGE_ID)
    expect(forThisPhoto[0]?.origin).toBe('media')
  })

  it('the pointer is excluded because it is a pointer, not because it has no vector', async () => {
    /*
     * The sharper form of the same claim, and the one a future "optimisation" would break. Give the
     * pointer a real vector on the matching axis — a state the app never writes, and the database
     * happily accepts — and it must STILL be excluded, because the album arm's predicate is
     * `source_image_id IS NULL` and not merely `description_embedding IS NOT NULL`.
     */
    await db
      .update(s.ninaAvatars)
      .set({ descriptionEmbedding: axisVector(0), description: 'a copy of the prose' })
      .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))

    try {
      const page = await q.searchNinaPhotosByText(USER, QUERY_VECTOR, null)
      expect(page.rows.map((row) => row.id)).not.toContain(POINTER_ID)
      expect(page.rows.map((row) => row.id)).toContain(IMAGE_ID)
    } finally {
      await db
        .update(s.ninaAvatars)
        .set({ descriptionEmbedding: null, description: null })
        .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))
    }
  })

  it('an ordinary album row still ranks — the merge did not disable the album arm', async () => {
    const page = await q.searchNinaPhotosByText(USER, axisVector(1), null)

    const ids = page.rows.map((row) => row.id)
    expect(ids).toContain(PLAIN_ID)
    expect(page.rows.find((row) => row.id === PLAIN_ID)?.origin).toBe('album')
  })
})

describe.skipIf(!enabled)(
  'invariant 3 — the pointer stores nothing, so one edit is one truth',
  () => {
    it('a keyword saved through the ALBUM id lands on the MEDIA row, and reads back from both', async () => {
      /*
       * The round trip phase 3's assumption A5 calls "the only assumption whose failure makes shipped
       * copy wrong rather than merely not compiling": the pane tells the operator that editing here
       * edits the original. Phase 2's unit tests prove the write targets `nina_message_images`; this
       * proves the value is then READABLE as that album row's own keywords.
       */
      await q.setNinaMessageImageSearchKeywordsAndEmbedding(USER, IMAGE_ID, 'fins, biru', null)

      const linked = await q.resolveNinaAvatarLinkedText(USER, [
        { id: POINTER_ID, sourceImageId: IMAGE_ID },
      ])

      expect(linked.get(POINTER_ID)?.searchKeywords).toBe('fins, biru')
      expect(linked.get(POINTER_ID)?.description).toBe(
        'she is underwater in a black swimsuit and fins',
      )

      /* And the pointer row itself still stores nothing — the other half of the invariant. */
      const [stored] = await db
        .select({
          description: s.ninaAvatars.description,
          searchKeywords: s.ninaAvatars.searchKeywords,
          negativeSearchKeywords: s.ninaAvatars.negativeSearchKeywords,
          hasVector: sql<number>`(${s.ninaAvatars.descriptionEmbedding} is not null)::int`.mapWith(
            Number,
          ),
        })
        .from(s.ninaAvatars)
        .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))

      expect(stored).toEqual({
        description: null,
        searchKeywords: null,
        negativeSearchKeywords: null,
        hasVector: 0,
      })
    })

    it('the FK still refuses a bare delete that skips the cascade', async () => {
      /*
       * ON DELETE RESTRICT, as the database's own answer rather than the app's. Since 2026-09-19,
       * `removeChatPhotoAction` no longer asks Postgres this question — it deletes the pointer rows
       * itself first, so the constraint never fires from that path (see `tests/admin.chatPhotos.test.ts`
       * for that cascade). This proves the constraint is still there underneath: a delete that skips
       * the cascade — a hand-run statement, a future writer that forgets it — is still refused rather
       * than silently orphaning or losing a current-photo designation.
       */
      await expect(
        db
          .delete(s.ninaMessageImages)
          .where(and(eq(s.ninaMessageImages.userId, USER), eq(s.ninaMessageImages.id, IMAGE_ID))),
      ).rejects.toThrow()

      /* And the read the cascade uses to decide agrees with the constraint. */
      await expect(q.listNinaAvatarsLinkedToImage(USER, IMAGE_ID)).resolves.toEqual([
        { id: POINTER_ID, isCurrent: false },
      ])
    })
  },
)
