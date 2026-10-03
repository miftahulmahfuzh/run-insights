import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * profpic-pointer-sync phase 2, against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled neon url> npm run test:int
 *
 * Skipped without `TEST_DATABASE_URL`; `DATABASE_URL` is deliberately NOT a fallback (it is
 * production). Every row hangs off one throwaway user, removed in `afterAll` —
 * `mediaAlbumUnifiedSearch.int.test.ts`' posture exactly.
 *
 * The recording driver proves the batches' SHAPE (`tests/nina.replacePropagation.test.ts`). Only
 * Postgres can prove the three things R3 rests on: the dependents really move, the gate really
 * holds on a refused write, and afterwards no row names the old pathname.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const USER = `rpp-u1-${SUFFIX}`
const IMAGE_ID = `rpp-img-${SUFFIX}`
const POINTER_ID = `rpp-ptr-${SUFFIX}`
const IMAGE_REF_ID = `rpp-iref-${SUFFIX}`
const POINTER_REF_ID = `rpp-pref-${SUFFIX}`
const REF_OF_REF_ID = `rpp-rr-${SUFFIX}`
const ALBUM_ID = `rpp-alb-${SUFFIX}`
const ALBUM_REF_ID = `rpp-aref-${SUFFIX}`

const STORE = 'https://example.public.blob.vercel-storage.com'
const url = (pathname: string): string => `${STORE}/${pathname}`
const OLD = `nina/${USER}/selfie-${IMAGE_ID}-old.jpg`
const NEW = `nina/${USER}/selfie-${IMAGE_ID}-new.jpg`
const NEWER = `nina/${USER}/selfie-${IMAGE_ID}-newer.jpg`
const REF_OF_REF_PATH = `nina/${USER}/chat-${REF_OF_REF_ID}.jpg`
const ALBUM_OLD = `nina/${USER}/avatar-${ALBUM_ID}-old.jpg`
const ALBUM_NEW = `nina/${USER}/avatar-${ALBUM_ID}-new.jpg`
const ALBUM_THUMB = `nina/${USER}/thumb-${ALBUM_ID}-old.webp`

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

  /* The Media ORIGINAL, v1. */
  await db.insert(s.ninaMessageImages).values({
    id: IMAGE_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: url(OLD),
    pathname: OLD,
    width: 576,
    height: 1024,
    bytes: 100,
    description: 'v1 prose',
  })

  /* Its album POINTER — what `linkChatPhotoIntoAlbum` writes — with a non-identity crop. */
  await db.insert(s.ninaAvatars).values({
    id: POINTER_ID,
    userId: USER,
    source: 'admin',
    blobUrl: url(OLD),
    pathname: OLD,
    folder: '',
    sourceKey: `chat-photo:${IMAGE_ID}`,
    sourceImageId: IMAGE_ID,
    width: 576,
    height: 1024,
    bytes: 100,
    cropScale: 1.5,
    cropX: 0.1,
    cropY: -0.1,
  })

  /* A chat REFERENCE to the original, and one to the pointer (`resolveAttachment`'s two shapes). */
  await db.insert(s.ninaMessageImages).values([
    {
      id: IMAGE_REF_ID,
      userId: USER,
      messageId: null,
      kind: 'generated',
      blobUrl: url(OLD),
      pathname: OLD,
      width: 576,
      height: 1024,
      bytes: 100,
      description: 'v1 prose',
      sourceImageId: IMAGE_ID,
    },
    {
      id: POINTER_REF_ID,
      userId: USER,
      messageId: null,
      kind: 'generated',
      blobUrl: url(OLD),
      pathname: OLD,
      width: 576,
      height: 1024,
      bytes: 100,
      sourceAvatarId: POINTER_ID,
    },
  ])

  /* A row whose `source_image_id` names a REFERENCE — the gate's case. Its own bytes. */
  await db.insert(s.ninaMessageImages).values({
    id: REF_OF_REF_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: url(REF_OF_REF_PATH),
    pathname: REF_OF_REF_PATH,
    sourceImageId: IMAGE_REF_ID,
  })

  /* An album ORIGINAL with a folder-upload thumbnail, and a chat reference to it. */
  await db.insert(s.ninaAvatars).values({
    id: ALBUM_ID,
    userId: USER,
    source: 'admin',
    blobUrl: url(ALBUM_OLD),
    pathname: ALBUM_OLD,
    folder: '',
    thumbUrl: url(ALBUM_THUMB),
    thumbPathname: ALBUM_THUMB,
    width: 1000,
    height: 1000,
    bytes: 200,
  })
  await db.insert(s.ninaMessageImages).values({
    id: ALBUM_REF_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: url(ALBUM_OLD),
    pathname: ALBUM_OLD,
    sourceAvatarId: ALBUM_ID,
  })
})

afterAll(async () => {
  if (!enabled) return
  /* Pointers first: `nina_avatars.source_image_id` is ON DELETE RESTRICT (see the sibling int test). */
  await db.delete(s.ninaAvatars).where(eq(s.ninaAvatars.userId, USER))
  await db.delete(s.ninaMessageImages).where(eq(s.ninaMessageImages.userId, USER))
  await db.delete(s.users).where(eq(s.users.id, USER))
})

async function imageRows(ids: string[]) {
  return db
    .select({
      id: s.ninaMessageImages.id,
      blobUrl: s.ninaMessageImages.blobUrl,
      pathname: s.ninaMessageImages.pathname,
      width: s.ninaMessageImages.width,
      description: s.ninaMessageImages.description,
      sourceImageId: s.ninaMessageImages.sourceImageId,
      sourceAvatarId: s.ninaMessageImages.sourceAvatarId,
    })
    .from(s.ninaMessageImages)
    .where(and(eq(s.ninaMessageImages.userId, USER), inArray(s.ninaMessageImages.id, ids)))
}

async function avatarRow(id: string) {
  const [row] = await db
    .select({
      id: s.ninaAvatars.id,
      blobUrl: s.ninaAvatars.blobUrl,
      pathname: s.ninaAvatars.pathname,
      width: s.ninaAvatars.width,
      height: s.ninaAvatars.height,
      cropScale: s.ninaAvatars.cropScale,
      cropX: s.ninaAvatars.cropX,
      cropY: s.ninaAvatars.cropY,
      sourceKey: s.ninaAvatars.sourceKey,
      sourceImageId: s.ninaAvatars.sourceImageId,
      thumbUrl: s.ninaAvatars.thumbUrl,
      thumbPathname: s.ninaAvatars.thumbPathname,
    })
    .from(s.ninaAvatars)
    .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, id)))
  return row
}

describe.skipIf(!enabled)('a Media replace moves everything that re-shows it', () => {
  it('moves the pointer and both references, drops the crop on new dims, and frees v1', async () => {
    const written = await q.updateNinaChatPhotoBlob(USER, IMAGE_ID, {
      blobUrl: url(NEW),
      pathname: NEW,
      width: 1024,
      height: 1536,
      bytes: 300,
      contentHash: null,
    })
    expect(written?.pathname).toBe(NEW)

    const pointer = await avatarRow(POINTER_ID)
    expect(pointer?.pathname).toBe(NEW)
    expect(pointer?.blobUrl).toBe(url(NEW))
    expect(pointer?.width).toBe(1024)
    expect(pointer?.height).toBe(1536)
    expect(pointer?.cropScale).toBeNull()
    expect(pointer?.cropX).toBeNull()
    expect(pointer?.cropY).toBeNull()
    expect(pointer?.sourceKey).toBe(`chat-photo:${IMAGE_ID}`)
    expect(pointer?.sourceImageId).toBe(IMAGE_ID)

    const refs = await imageRows([IMAGE_REF_ID, POINTER_REF_ID])
    expect(refs).toHaveLength(2)
    for (const ref of refs) {
      expect(ref.pathname, ref.id).toBe(NEW)
      expect(ref.blobUrl, ref.id).toBe(url(NEW))
      expect(ref.description, ref.id).toBeNull()
    }
    const [imageRef] = refs.filter((ref) => ref.id === IMAGE_REF_ID)
    expect(imageRef?.sourceImageId).toBe(IMAGE_ID)

    await expect(q.isBlobPathnameReferenced(USER, OLD, url(OLD))).resolves.toBe(false)
  })

  it('keeps the pointer crop when the new bytes have the same dimensions', async () => {
    await db
      .update(s.ninaAvatars)
      .set({ cropScale: 1.2, cropX: 0.05, cropY: 0 })
      .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))

    await q.updateNinaChatPhotoBlob(USER, IMAGE_ID, {
      blobUrl: url(NEWER),
      pathname: NEWER,
      width: 1024,
      height: 1536,
      bytes: 310,
      contentHash: null,
    })

    const pointer = await avatarRow(POINTER_ID)
    expect(pointer?.pathname).toBe(NEWER)
    expect(pointer?.cropScale).toBe(1.2)
    expect(pointer?.cropX).toBe(0.05)
    expect(pointer?.cropY).toBe(0)
    await expect(q.isBlobPathnameReferenced(USER, NEW, url(NEW))).resolves.toBe(false)
  })

  it('a refused write (a reference id) moves nothing that re-shows it', async () => {
    const written = await q.updateNinaChatPhotoBlob(USER, IMAGE_REF_ID, {
      blobUrl: url(`nina/${USER}/selfie-never.jpg`),
      pathname: `nina/${USER}/selfie-never.jpg`,
      width: 10,
      height: 10,
      bytes: 1,
      contentHash: null,
    })
    expect(written).toBeNull()

    const [refOfRef] = await imageRows([REF_OF_REF_ID])
    expect(refOfRef?.pathname).toBe(REF_OF_REF_PATH)
  })
})

describe.skipIf(!enabled)(
  'an album replace moves its chat references and frees the old file and thumbnail',
  () => {
    it('moves the reference, nulls the thumbnail pair, and leaves both old objects unreferenced', async () => {
      const written = await q.updateNinaAvatarBlob(USER, ALBUM_ID, {
        blobUrl: url(ALBUM_NEW),
        pathname: ALBUM_NEW,
        width: 1200,
        height: 1600,
        bytes: 400,
        contentHash: null,
      })
      expect(written?.pathname).toBe(ALBUM_NEW)

      const album = await avatarRow(ALBUM_ID)
      expect(album?.thumbUrl).toBeNull()
      expect(album?.thumbPathname).toBeNull()

      const [ref] = await imageRows([ALBUM_REF_ID])
      expect(ref?.pathname).toBe(ALBUM_NEW)
      expect(ref?.sourceAvatarId).toBe(ALBUM_ID)

      await expect(q.isBlobPathnameReferenced(USER, ALBUM_OLD, url(ALBUM_OLD))).resolves.toBe(false)
      await expect(q.isBlobPathnameReferenced(USER, ALBUM_THUMB, url(ALBUM_THUMB))).resolves.toBe(
        false,
      )
    })
  },
)
