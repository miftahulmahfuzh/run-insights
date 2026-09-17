import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { NINA_TOOLS, SET_AVATAR_FROM_PHOTO_TOOL } from '@/lib/nina/prompts/tools'

/**
 * **R2: an existing photograph becomes her profile picture, from inside a chat turn.**
 *
 * The production turn this is written against is on the record (2026-09-17 02:43 WIB): "ganti profpic
 * lu pake foto ini" reached `set_avatar`, the only avatar tool that existed, which invented a scene
 * and started a generation. The properties below are what makes that impossible now, in the order
 * they would hurt if they were wrong:
 *
 *   1. **No generation, ever.** The adoption is a `fetch` + `put` + two row writes inside the
 *      request. Nothing in this file may reach `avatargen.ts` or a job row.
 *   2. **The referent is resolved from STRUCTURE.** The current message's attachment first; failing
 *      that, the most recent original photograph in the same session — a JOIN, not a guess.
 *   3. **A reference row is never copied.** The core refuses one outright; the resolver flattens one
 *      to whatever it points at, so a Media attach promotes the album row it re-shows and copies
 *      nothing at all.
 *   4. **Re-adoption is a constraint decision.** `source_key = 'chat-photo:<imageId>'`, found before
 *      any bytes move.
 *   5. **`announced_at` is written in the same operation.** The adoption is synchronous, she says so
 *      in the same reply, and the `avatar_changed` cron must not say it again tomorrow.
 */

const USER = 'abc123XYZ_-9'
const IMAGE_ID = 'img123XYZ_-9'
const ORIGINAL_ID = 'org123XYZ_-9'
const MESSAGE_ID = 'msg123XYZ_-9'
const SESSION_ID = 'ses123XYZ_-9'
const AVATAR_ID = 'ava123XYZ_-9'
const ALBUM_ID = 'alb123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const SOURCE_DESCRIPTION = 'A woman in ripped jeans leaning on a brick wall in an alleyway.'

const sourcePathname = `nina/${USER}/selfie-${IMAGE_ID}.png`
const sourceUrl = `${STORE}/${sourcePathname}`
const adoptedPathname = `nina/${USER}/avatar-${AVATAR_ID}-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.png`
const adoptedUrl = `${STORE}/${adoptedPathname}`

const put = vi.fn()
const fetchMock = vi.fn()

vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args) }))

type AvatarTools = typeof import('@/lib/nina/avatartools')
type AvatarAdopt = typeof import('@/lib/nina/avatarAdopt')

let avatarTools: AvatarTools
let avatarAdopt: AvatarAdopt
let fake: FakeDb

/**
 * An override that can express NULL. `overrides.key ?? fallback` would read a deliberate
 * `{ description: null }` as "no opinion" — `in` is the only honest test.
 */
function pick<T>(overrides: Record<string, unknown>, key: string, fallback: T): T {
  return (key in overrides ? overrides[key] : fallback) as T
}

/** `imageColumns` in projection order — SEVENTEEN values. See the header's fixture note. */
function imageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', IMAGE_ID),
    pick(overrides, 'messageId', MESSAGE_ID),
    pick(overrides, 'kind', 'generated'),
    pick(overrides, 'blobUrl', sourceUrl),
    pick(overrides, 'pathname', sourcePathname),
    pick(overrides, 'width', 768),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 240_000),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'prompt', 'a selfie in an alleyway'),
    pick(overrides, 'sourceAvatarId', null),
    pick(overrides, 'sourceImageId', null),
    pick(overrides, 'contentHash', null),
    pick(overrides, 'perceptualHash', null),
    pick(overrides, 'perceptualSig', null),
    pick(overrides, 'sortOrder', 0),
    pick(overrides, 'createdAt', '2026-09-17 02:41:08+00'),
  )
}

/** `avatarColumns` in projection order — TWENTY values. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', AVATAR_ID),
    pick(overrides, 'blobUrl', adoptedUrl),
    pick(overrides, 'pathname', adoptedPathname),
    pick(overrides, 'folder', ''),
    pick(overrides, 'filename', null),
    pick(overrides, 'thumbUrl', null),
    pick(overrides, 'thumbPathname', null),
    pick(overrides, 'width', 768),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 240_000),
    pick(overrides, 'source', 'operator'),
    pick(overrides, 'cropScale', null),
    pick(overrides, 'cropX', null),
    pick(overrides, 'cropY', null),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'searchKeywords', null),
    pick(overrides, 'negativeSearchKeywords', null),
    pick(overrides, 'isCurrent', false),
    pick(overrides, 'announcedAt', null),
    pick(overrides, 'createdAt', '2026-09-17 02:44:00+00'),
  )
}

/** `messageColumns` in projection order — TWELVE values. */
function messageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', MESSAGE_ID),
    pick(overrides, 'seq', 42),
    pick(overrides, 'sessionId', SESSION_ID),
    pick(overrides, 'role', 'runner'),
    pick(overrides, 'body', 'ganti profpic lu pake foto ini'),
    pick(overrides, 'createdAt', '2026-09-17 02:43:47+00'),
    pick(overrides, 'source', 'chat'),
    pick(overrides, 'turnId', null),
    pick(overrides, 'replyToId', null),
    pick(overrides, 'runId', null),
    pick(overrides, 'readAt', null),
    pick(overrides, 'photoOnly', false),
  )
}

/** The dispatch context a chat turn hands a handler. Only two fields are read by this tool. */
function ctx(sourceMessageId: string | null = MESSAGE_ID) {
  return {
    userId: USER,
    todayISO: '2026-09-17',
    history: {},
    gateway: {},
    sourceMessageId,
  } as unknown as Parameters<AvatarTools['handleSetAvatarFromPhoto']>[1]
}

function insertStatement() {
  return fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
}

/*
 * `setCurrentNinaAvatar`'s own promotion statement ALSO sets `"announced_at" = $n` (to NULL, as it
 * re-arms the flag) — matching on that alone finds ITS statement first, not
 * `markNinaAvatarAnnounced`'s. The WHERE-clause `is null` guard is what is unique to the latter.
 */
function announceStatement() {
  return fake.queries.find(
    (query) =>
      query.sql.includes('update "nina_avatars"') && query.sql.includes('"announced_at" is null'),
  )
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  put.mockReset().mockResolvedValue({ url: adoptedUrl, pathname: adoptedPathname })
  fetchMock.mockReset().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  fake = installFakeDb()
  avatarAdopt = await import('@/lib/nina/avatarAdopt')
  avatarTools = await import('@/lib/nina/avatartools')
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

describe('SET_AVATAR_FROM_PHOTO_TOOL — the schema the model reads', () => {
  it('is the eighth tool, named set_avatar_from_photo, with no photo-id argument', () => {
    expect(SET_AVATAR_FROM_PHOTO_TOOL.name).toBe('set_avatar_from_photo')
    expect(NINA_TOOLS.at(-1)).toBe(SET_AVATAR_FROM_PHOTO_TOOL)

    const schema = SET_AVATAR_FROM_PHOTO_TOOL.input_schema as unknown as {
      properties: Record<string, unknown>
    }
    /* The model never sees a photograph's id (`lib/nina/context.ts` gives it prose), so an
     * id-shaped property could only ever be hallucinated. `because` is the only one. */
    expect(Object.keys(schema.properties)).toEqual(['because'])
  })

  it('is dispatched by NINA_FULL_TOOL_SET, beside set_avatar and generate_image', () => {
    const names = avatarTools.NINA_FULL_TOOL_SET.tools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['generate_image', 'set_avatar', 'set_avatar_from_photo']),
    )
    expect(Object.keys(avatarTools.NINA_FULL_TOOL_SET.handlers)).toEqual(
      expect.arrayContaining(['generate_image', 'set_avatar', 'set_avatar_from_photo']),
    )
    expect(avatarTools.NINA_FULL_TOOL_SET.handlers).not.toHaveProperty('send')
  })

  it('pins the source-key prefix the album and the picker both spell by hand', () => {
    expect(avatarAdopt.NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX).toBe('chat-photo:')
  })
})

describe('adoptNinaChatPhotoAsAvatar — the fresh adoption', () => {
  it('copies the bytes into a new avatar- object and records the STORED refs as operator', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage
    fake.enqueue([]) // getNinaAvatarBySourceKey — never adopted
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(fetchMock).toHaveBeenCalledWith(sourceUrl)
    expect(put).toHaveBeenCalledTimes(1)

    const [pathname, body, options] = put.mock.calls[0] as unknown as [
      string,
      ArrayBuffer,
      Record<string, unknown>,
    ]
    expect(pathname).toMatch(/^nina\/abc123XYZ_-9\/avatar-[A-Za-z0-9_-]{12}\.png$/)
    expect(body).toBeInstanceOf(ArrayBuffer)
    expect(options).toEqual({ access: 'public', addRandomSuffix: true, contentType: 'image/png' })

    const insert = insertStatement()
    expect(insert).toBeDefined()
    expect(insert?.params).toContain(adoptedUrl) // put's RETURN, not the requested pathname
    expect(insert?.params).toContain(adoptedPathname)
    expect(insert?.params).toContain('operator') // the member with no previous writer
    expect(insert?.params).toContain(`chat-photo:${IMAGE_ID}`)
    expect(insert?.params).toContain(SOURCE_DESCRIPTION) // seeded, no second vendor call
    expect(insert?.params).toContain(768)
    expect(insert?.params).toContain(240_000)
  })

  it('derives the container from the SOURCE pathname, not a hard-coded png', async () => {
    fake.enqueue([imageRow({ pathname: `nina/${USER}/chat-${IMAGE_ID}.jpg` })])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    const options = put.mock.calls[0]?.[2] as Record<string, unknown>
    expect(options.contentType).toBe('image/jpeg')
    expect(String(put.mock.calls[0]?.[0])).toMatch(/\.jpg$/)
  })

  it('sets announced_at in the SAME operation that promotes it, so the cron cannot re-announce', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    /* `setCurrentNinaAvatar` re-arms `announced_at` to NULL inside its batch; this is the statement
     * that closes it, and it must exist and it must run after the batch. */
    const announce = announceStatement()
    expect(announce).toBeDefined()
    expect(announce?.params).toContain(AVATAR_ID)
    expect(announce?.sql).toContain('"announced_at" is null')
    expect(fake.queries.indexOf(announce!)).toBeGreaterThan(
      fake.queries.findIndex((query) => query.batched),
    )
  })

  it('refuses a re-share reference before any byte moves', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: ALBUM_ID })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: false, kind: 'reference' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(insertStatement()).toBeUndefined()
  })

  it('refuses a container the album does not accept, before any byte moves', async () => {
    fake.enqueue([imageRow({ pathname: `nina/${USER}/chat-${IMAGE_ID}.gif` })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: false, kind: 'unsupported' })
    expect(put).not.toHaveBeenCalled()
  })

  it('re-adopting the same photo copies nothing and inserts nothing', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage
    fake.enqueue([avatarRow()]) // getNinaAvatarBySourceKey — already adopted
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(insertStatement()).toBeUndefined()
  })

  it('reports changed: false when that photo is already her current face', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow({ isCurrent: true })])
    fake.enqueue([avatarRow({ isCurrent: true })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: false })
    /* Idempotent: `setCurrentNinaAvatar` returns early on an already-current row, so no batch runs. */
    expect(fake.batches).toHaveLength(0)
  })

  it('answers missing for an id that is not his', async () => {
    fake.enqueue([]) // getNinaMessageImage → null

    expect(await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)).toEqual({
      ok: false,
      kind: 'missing',
    })
  })
})

describe('resolveNinaAdoptTarget — which photograph "ini" is', () => {
  it('prefers the photo attached to the message the turn is answering', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImagesForMessages

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'image',
      imageId: IMAGE_ID,
    })
    /* One statement: no session lookup is bought when the answer is already on the message. */
    expect(fake.queries).toHaveLength(1)
  })

  it('flattens a re-shown chat photo to the ORIGINAL it points at', async () => {
    fake.enqueue([imageRow({ sourceImageId: ORIGINAL_ID })])

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'image',
      imageId: ORIGINAL_ID,
    })
  })

  it('flattens a Media attach to the album row whose bytes it re-shows', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: ALBUM_ID })])

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'avatar',
      avatarId: ALBUM_ID,
    })
  })

  it('falls back to the most recent original photo in the SAME session', async () => {
    fake.enqueue([]) // no attachment on the current message
    fake.enqueue([messageRow()]) // getNinaMessagesByIds
    fake.enqueue([imageRow({ id: ORIGINAL_ID })]) // getLatestOriginalNinaSessionPhoto

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'image',
      imageId: ORIGINAL_ID,
    })

    const sql = fake.sqlAt(2)
    expect(sql).toContain('inner join "nina_messages"')
    expect(sql).toContain('"session_id"')
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    expect(fake.queries[2]?.params).toContain(SESSION_ID)
    expect(fake.queries[2]?.params).toContain(USER)
  })

  it('answers none on a proactive turn, and asks no questions of the database', async () => {
    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, null)).toEqual({ kind: 'none' })
    expect(fake.queries).toHaveLength(0)
  })

  it('answers none when the session has shown no original photograph', async () => {
    fake.enqueue([])
    fake.enqueue([messageRow()])
    fake.enqueue([])

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({ kind: 'none' })
  })
})

describe('handleSetAvatarFromPhoto — what she is told', () => {
  it('adopts the attached photo and tells her it is DONE, never "the camera is running"', async () => {
    fake.enqueue([imageRow()]) // resolve: attachment on the current message
    fake.enqueue([imageRow()]) // core: getNinaMessageImage
    fake.enqueue([]) // getNinaAvatarBySourceKey
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const answer = await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(answer.isError).toBe(false)
    expect(answer.answer).toEqual({
      ok: true,
      note: avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.done,
    })
    expect(avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.done).not.toContain('Kamera')
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('promotes the album row a Media attach re-shows, copying nothing at all', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: ALBUM_ID })]) // resolve → avatar branch
    fake.enqueue([avatarRow({ id: ALBUM_ID, source: 'admin' })]) // getNinaAvatar
    fake.enqueue([avatarRow({ id: ALBUM_ID, source: 'admin' })]) // setCurrentNinaAvatar's pre-read

    const answer = await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(answer).toEqual({
      answer: { ok: true, note: avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.done },
      isError: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(insertStatement()).toBeUndefined()
    expect(announceStatement()?.params).toContain(ALBUM_ID)
  })

  it('refuses cleanly with isError false when nothing in the session can be meant', async () => {
    fake.enqueue([]) // no attachment
    fake.enqueue([messageRow()]) // the message, for its session
    fake.enqueue([]) // no original photo in it

    const answer = await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(answer).toEqual({
      answer: { ok: false, note: avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.none },
      isError: false,
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('tolerates a call with no arguments at all, because `because` reads nothing', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    const answer = await avatarTools.handleSetAvatarFromPhoto({}, ctx())

    expect(answer.isError).toBe(false)
    expect((answer.answer as { ok: boolean }).ok).toBe(true)
  })

  it('answers isError only for a payload that is not an object', async () => {
    const answer = await avatarTools.handleSetAvatarFromPhoto('pakai foto ini', ctx())

    expect(answer.isError).toBe(true)
    expect(fake.queries).toHaveLength(0)
  })

  it('never reaches the generator: no image job row is opened', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(fake.queries.some((query) => query.sql.includes('"nina_turns"'))).toBe(false)
  })
})
