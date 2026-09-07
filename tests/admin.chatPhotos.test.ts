import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN_CHAT_PHOTO_LONG_EDGE_PX } from '@/components/admin/chatPhotoUpload'
import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import {
  chatPhotoAddSchema,
  chatPhotoDescriptionSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import {
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  adminChatPhotoPathname,
  blobUrlMatchesPathname,
  isAdminChatPhotoPathname,
  isHttpsBlobUrl,
  isNinaPhotoCarrierMessage,
} from '@/lib/admin/chatPhotos'
import { NINA_IMAGE_CAPTIONS, ninaImageCaption } from '@/lib/nina/imagefail'
import {
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_PATHNAME_RE,
  ninaImagePathname,
} from '@/lib/nina/imagerecipe'
import { NINA_CHAT_MAX_UPLOAD_BYTES, ninaChatPathname } from '@/lib/nina/images'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * `admin-memory-and-chat-photos` phase 3's boundary logic — the half that needs no database and no
 * DOM: the pathname agreement with her own writer, the URL predicates, the empty-bubble rule, the
 * three Zod payloads, and the cross-module agreements that would otherwise only fail in production.
 */

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/**
 * Vercel's random suffix, copied VERBATIM from the prod store rather than invented:
 * `nina/…/selfie-Q8lWbmk0LG7W-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.jpg`, the object the R2 reproduction
 * wrote. This constant used to read `Xy7kQ2p` — 7 symbols, id segment 20, comfortably inside the
 * old `{12,24}` window — while every real upload, id segment 43, was being refused. Inventing it
 * was the defect; measuring it is the fix.
 */
const BLOB_SUFFIX = 'yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ'

/** What Blob hands back: the requested pathname plus its random suffix. 12 + 1 + 30 = 43. */
const storedPathname = `nina/${USER}/selfie-${ID}-${BLOB_SUFFIX}.jpg`
const storedUrl = `${STORE}/${storedPathname}`

const goodBlob = {
  blobUrl: storedUrl,
  pathname: storedPathname,
  width: 768,
  height: 1024,
  bytes: 240_000,
}

describe('adminChatPhotoPathname — the shape is HERS, with a different container', () => {
  it('is `ninaImagePathname(_, "selfie", _)` up to the extension', () => {
    // The duplication is CHECKED rather than merely intended — `tests/nina.imagerecipe.test.ts`'s
    // mitigation for `NINA_BLOB_PREFIX`, applied to the one string this phase re-spells.
    expect(adminChatPhotoPathname(USER, ID)).toBe(
      ninaImagePathname(USER, 'selfie', ID).replace(/\.png$/, '.jpg'),
    )
    expect(adminChatPhotoPathname(USER, ID)).toBe(`nina/${USER}/selfie-${ID}.jpg`)
  })

  it('is admitted by the pattern the blob reaper reads', () => {
    // The whole reason `.jpg` under `selfie-` was chosen over a new admin-only prefix.
    expect(NINA_IMAGE_PATHNAME_RE.test(adminChatPhotoPathname(USER, ID))).toBe(true)
  })

  it('is NOT the runner composer shape', () => {
    expect(adminChatPhotoPathname(USER, ID)).not.toBe(ninaChatPathname(USER, ID))
    expect(isAdminChatPhotoPathname(ninaChatPathname(USER, ID), USER)).toBe(false)
  })
})

describe('isAdminChatPhotoPathname', () => {
  it('accepts the requested form and the stored form the branch will actually see', () => {
    expect(isAdminChatPhotoPathname(adminChatPhotoPathname(USER, ID), USER)).toBe(true)
    expect(isAdminChatPhotoPathname(storedPathname, USER)).toBe(true)
  })

  it('is checked against a REAL stored id — 43 symbols, not an invented short one', () => {
    // The fixture IS the test. This assertion exists so a later edit cannot quietly shorten the
    // suffix back to something the requested-form pattern would have accepted on its own, which is
    // exactly how a predicate that refused every production upload shipped green.
    expect(BLOB_SUFFIX).toHaveLength(30)
    const id = storedPathname.slice(`nina/${USER}/selfie-`.length, -'.jpg'.length)
    expect(id).toBe(`${ID}-${BLOB_SUFFIX}`)
    expect(id).toHaveLength(43)
  })

  it('accepts a stored id whose requested half ENDS in a dash', () => {
    // `newId()` draws from the 64 URL-safe symbols, so a 12-symbol id can both contain and end
    // with `-`. Real object: `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`, note the
    // doubled `--`. The separator has to be found by position; splitting on `-` mis-reads this.
    const dashy = 'Ve394_KsZZ7-'
    expect(dashy).toHaveLength(12)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${dashy}-${BLOB_SUFFIX}.jpg`, USER)).toBe(
      true,
    )
  })

  it('refuses another user folder, traversal, and the album prefix', () => {
    expect(isAdminChatPhotoPathname(storedPathname, 'someoneelse')).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/../selfie-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/avatar-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/thumb-${ID}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`shots/${ID}.jpg`, USER)).toBe(false)
  })

  it('refuses the worker PNG container and a double extension', () => {
    expect(isAdminChatPhotoPathname(ninaImagePathname(USER, 'selfie', ID), USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}.jpg.html`, USER)).toBe(false)
  })

  it('refuses a requested id that is not exactly 12, and a non-id user', () => {
    // TIGHTER than the window this replaced. `{12,24}` admitted 13-24, which `newId()` cannot
    // produce and which no caller in the repo ever asked for; the mint-time check must not get
    // looser in order for the action-time one to start working.
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-short.jpg`, USER)).toBe(false)
    for (const n of [11, 13, 18, 24, 25]) {
      expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${'a'.repeat(n)}.jpg`, USER)).toBe(false)
    }
    expect(isAdminChatPhotoPathname(storedPathname, '../evil')).toBe(false)
  })

  it('refuses a suffix outside the recorded 16-64 bound, and one that is not a suffix', () => {
    // `{16,64}` is `SHOT_STORED_PATHNAME_RE`'s bound, deliberately loose around the 30 observed.
    // Loose is not unbounded: the alphabet, the separator and the shape are still ours to enforce.
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}-${'b'.repeat(15)}.jpg`, USER)).toBe(
      false,
    )
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}-${'b'.repeat(65)}.jpg`, USER)).toBe(
      false,
    )
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${ID}.${BLOB_SUFFIX}.jpg`, USER)).toBe(
      false,
    )
  })
})

describe('isHttpsBlobUrl', () => {
  it('accepts an https store URL', () => {
    expect(isHttpsBlobUrl(storedUrl)).toBe(true)
  })

  it('refuses plaintext, a non-URL, an empty string and an absurd length', () => {
    expect(isHttpsBlobUrl(`http://${storedPathname}`)).toBe(false)
    expect(isHttpsBlobUrl('not a url')).toBe(false)
    expect(isHttpsBlobUrl('')).toBe(false)
    expect(isHttpsBlobUrl(`${STORE}/${'a'.repeat(4000)}.jpg`)).toBe(false)
  })
})

describe('blobUrlMatchesPathname', () => {
  it('ties the URL to the pathname it claims', () => {
    expect(blobUrlMatchesPathname(storedUrl, storedPathname)).toBe(true)
  })

  it('refuses a URL that points somewhere else entirely', () => {
    // The whole reason this exists: a Server Action is a separate entry point from the token mint,
    // so without it a well-formed payload could hang a foreign image on one of her rows — and the
    // D5 reference check would then be answering a question about a pathname nothing ever wrote.
    expect(blobUrlMatchesPathname('https://example.com/cat.jpg', storedPathname)).toBe(false)
    expect(blobUrlMatchesPathname(`${STORE}/nina/other/selfie-${ID}.jpg`, storedPathname)).toBe(
      false,
    )
  })

  it('refuses a suffix match that is not a whole-path match', () => {
    expect(blobUrlMatchesPathname(`${STORE}/evil/${storedPathname}`, storedPathname)).toBe(false)
  })
})

describe('the byte ceiling is a deliberate fourth number', () => {
  it('sits strictly between the runner cap and the album cap', () => {
    // Neither inherited. See `lib/admin/chatPhotos.ts` for the argument; this asserts the ordering
    // so a later edit to any of the three cannot silently collapse two of them into one.
    expect(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES).toBeGreaterThan(NINA_CHAT_MAX_UPLOAD_BYTES)
    expect(ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES).toBeLessThan(ADMIN_AVATAR_MAX_UPLOAD_BYTES)
  })

  it('encodes into the same size class as her generated photographs', () => {
    expect(ADMIN_CHAT_PHOTO_LONG_EDGE_PX).toBe(NINA_IMAGE_HEIGHT)
  })
})

describe('isNinaPhotoCarrierMessage — the empty-bubble rule', () => {
  it('recognises every caption the worker can write', () => {
    for (const caption of NINA_IMAGE_CAPTIONS) {
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: caption })).toBe(true)
    }
  })

  it('recognises every caption an admin ADD can write', () => {
    // The round-trip that keeps `addChatPhotoAction` and `removeChatPhotoAction` from disagreeing:
    // ADD seeds `ninaImageCaption` with a fresh nanoid(12) instead of a job id, and the result must
    // always be a string this predicate accepts.
    for (const seed of ['aaaaaaaaaaaa', 'zZ9_-0000000', 'aB3_dEf-hI9k', 'QQQQQQQQQQQQ']) {
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: ninaImageCaption(seed) })).toBe(true)
    }
  })

  it('refuses HIS message even when it carries one of her photographs', () => {
    // The R26 re-attach path: a `kind = 'generated'` row on a `role = 'runner'` message. That
    // message is his and carries his text; removing the photo must not delete it.
    expect(isNinaPhotoCarrierMessage({ role: 'runner', body: NINA_IMAGE_CAPTIONS[0]! })).toBe(false)
  })

  it('refuses a message of hers that carries real words', () => {
    expect(isNinaPhotoCarrierMessage({ role: 'nina', body: 'lu abis lari berapa km tadi?' })).toBe(
      false,
    )
  })
})

describe('isNinaPhotoCarrierMessage — the marker', () => {
  it('is true for a marked message whatever its text says', () => {
    // This is the case phases 3 and 4 create and the whole reason the column exists.
    expect(
      isNinaPhotoCarrierMessage({
        role: 'nina',
        body: 'eh gw nyelam tadi, airnya bening banget',
        photoOnly: true,
      }),
    ).toBe(true)
  })

  it('is true for an unmarked legacy bubble carrying one of the five', () => {
    for (const caption of NINA_IMAGE_CAPTIONS) {
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: caption })).toBe(true)
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: caption, photoOnly: false })).toBe(
        true,
      )
    }
  })

  it('is false for HIS message however it is marked', () => {
    // The R26 re-attach path: a generated image row on a runner message that carries his words.
    expect(isNinaPhotoCarrierMessage({ role: 'runner', body: 'nih', photoOnly: true })).toBe(false)
    expect(isNinaPhotoCarrierMessage({ role: 'runner', body: NINA_IMAGE_CAPTIONS[0]! })).toBe(false)
  })

  it('is false for an unmarked nina message carrying her own sentence', () => {
    expect(isNinaPhotoCarrierMessage({ role: 'nina', body: 'eh gimana lutut lo hari ini' })).toBe(
      false,
    )
  })
})

describe('chatPhotoAddSchema', () => {
  it('accepts what the uploader actually produces', () => {
    expect(chatPhotoAddSchema.safeParse(goodBlob).success).toBe(true)
  })

  it('refuses a blobUrl that disagrees with the pathname', () => {
    expect(
      chatPhotoAddSchema.safeParse({ ...goodBlob, blobUrl: 'https://example.com/cat.jpg' }).success,
    ).toBe(false)
  })

  it('refuses bytes over the ceiling and dimensions that are not positive integers', () => {
    expect(
      chatPhotoAddSchema.safeParse({ ...goodBlob, bytes: ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES + 1 })
        .success,
    ).toBe(false)
    expect(chatPhotoAddSchema.safeParse({ ...goodBlob, width: 0 }).success).toBe(false)
    expect(chatPhotoAddSchema.safeParse({ ...goodBlob, height: 1024.5 }).success).toBe(false)
  })
})

describe('chatPhotoReplaceSchema', () => {
  it('accepts a nanoid(12) plus the same claims', () => {
    expect(chatPhotoReplaceSchema.safeParse({ id: ID, ...goodBlob }).success).toBe(true)
  })

  it('refuses an id that is not nanoid(12)', () => {
    expect(chatPhotoReplaceSchema.safeParse({ id: 'short', ...goodBlob }).success).toBe(false)
    expect(chatPhotoReplaceSchema.safeParse({ id: `${ID}x`, ...goodBlob }).success).toBe(false)
    expect(chatPhotoReplaceSchema.safeParse({ id: '../../etc/passw', ...goodBlob }).success).toBe(
      false,
    )
  })
})

describe('chatPhotoRemoveSchema', () => {
  it('takes an object so a later field is additive', () => {
    expect(chatPhotoRemoveSchema.safeParse({ id: ID }).success).toBe(true)
    expect(chatPhotoRemoveSchema.safeParse(ID).success).toBe(false)
  })
})

describe('chatPhotoDescriptionSchema', () => {
  const CEILING = 'x'.repeat(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS)

  it('accepts prose at the ceiling and refuses one character more', () => {
    expect(chatPhotoDescriptionSchema.safeParse({ id: ID, description: CEILING }).success).toBe(
      true,
    )
    expect(
      chatPhotoDescriptionSchema.safeParse({ id: ID, description: `${CEILING}x` }).success,
    ).toBe(false)
  })

  it('refuses rather than truncates, so half a sentence never reaches her prompt', () => {
    // `.max()` BEFORE `.transform()`, asserted rather than reviewed. `coerceNinaNotes` slices,
    // because it coerces a stored blob and has nobody to tell; this has an operator to tell.
    const parsed = chatPhotoDescriptionSchema.safeParse({ id: ID, description: `${CEILING}x` })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('unreachable')
  })

  it('normalises the way coerceNinaNotes does, minus the slice', () => {
    const parsed = chatPhotoDescriptionSchema.parse({
      id: ID,
      description: '  she is underwater\r\n\r\n\r\n\r\nfins on  ',
    })
    expect(parsed.description).toBe('she is underwater\n\nfins on')
  })

  it('accepts an empty box, because the clear is the action policy and not the schema shape', () => {
    // No `.min(1)`. Whitespace normalises to '' and parses; the action turns that into NULL (D1).
    expect(chatPhotoDescriptionSchema.parse({ id: ID, description: '   \n  ' }).description).toBe(
      '',
    )
  })

  it('refuses an id that is not nanoid(12), a missing description and a non-string', () => {
    expect(chatPhotoDescriptionSchema.safeParse({ id: 'short', description: 'x' }).success).toBe(
      false,
    )
    expect(chatPhotoDescriptionSchema.safeParse({ id: ID }).success).toBe(false)
    expect(chatPhotoDescriptionSchema.safeParse({ id: ID, description: 7 }).success).toBe(false)
  })

  it('does not police what the model was told to write', () => {
    // The describe prompt forbids digits, caps the length at 140 words and demands one paragraph.
    // Those are instructions to a VENDOR. Here the operator is the witness, and he is allowed to
    // write a number if the number is true.
    const parsed = chatPhotoDescriptionSchema.safeParse({
      id: ID,
      description: 'his watch reads 42.2 km\n\nand the sign behind him says Tebet',
    })
    expect(parsed.success).toBe(true)
  })
})

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE CAPTION PASS — phase 3, and the only half of this file that mocks anything.
 *
 *  Everything above is pure and needs no store. `scheduleChatPhotoCaption` is not: it is a
 *  DECISION TREE over four edges (the row, the eyes, the voice, the write), and every branch of it
 *  is a failure branch that must leave the canned line standing. So the edges are mocked and the
 *  calls are asserted — `tests/share.actions.test.ts`'s shape, dynamic `import()` after the
 *  factories so the module under test picks the mocks up.
 *
 *  The mocks are file-wide, which is why they name only modules NOTHING above imports:
 *  `@/lib/admin/chatPhotos`, `@/lib/admin/chatPhotoSchema`, `@/lib/nina/imagefail` and `@/lib/id`
 *  stay REAL, so the placeholder those tests assert on is the placeholder this one writes.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const MESSAGE_ID = 'msg123XYZ_-9'
const IMAGE_ID = 'img123XYZ_-9'
const SESSION_ID = 'ses123XYZ_-9'
const STORED_DESCRIPTION = 'A woman underwater in a black swimsuit and fins, mid-kick, light above.'
const CAPTION = 'eh gw nyelam tadi'

/** `instanceof` is the whole point of the class, so the mock exports a real one to be an instance of. */
class FakeVisionTokenFloorError extends Error {
  override name = 'NinaVisionTokenFloorError'
}

const requireAdmin = vi.fn()
const getNinaMessageImage = vi.fn()
const insertNinaMessages = vi.fn()
const insertNinaMessageImages = vi.fn()
const setNinaMessageImageDescription = vi.fn()
const updateNinaChatPhotoBlob = vi.fn()
const updateNinaChatPhotoDescription = vi.fn()
const updateNinaMessage = vi.fn()
const readNinaTuning = vi.fn()
const describeNinaImages = vi.fn()
const captionNinaPhoto = vi.fn()
const resolveNinaWriteSession = vi.fn()
const revalidatePath = vi.fn()

/**
 * `after()` is captured rather than executed, because the thing under test is precisely that the
 * action does NOT wait for it. `runTheAfterCallback` is the second half of every case below.
 */
const afterCallbacks: Array<() => Promise<void>> = []

vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/nina/sessionResolve', () => ({
  resolveNinaWriteSession: (userId: string) => resolveNinaWriteSession(userId),
}))
vi.mock('@/lib/nina/vision', () => ({
  NinaVisionTokenFloorError: FakeVisionTokenFloorError,
  describeNinaImages: (...args: unknown[]) => describeNinaImages(...args),
}))
vi.mock('@/lib/nina/caption', () => ({
  captionNinaPhoto: (...args: unknown[]) => captionNinaPhoto(...args),
}))
vi.mock('@/lib/nina/queries', () => ({
  deleteNinaMessage: vi.fn(),
  deleteNinaMessageImage: vi.fn(),
  getNinaMessageImage: (...args: unknown[]) => getNinaMessageImage(...args),
  getNinaMessageImagesForMessages: vi.fn(),
  getNinaMessagesByIds: vi.fn(),
  insertNinaMessageImages: (...args: unknown[]) => insertNinaMessageImages(...args),
  insertNinaMessages: (...args: unknown[]) => insertNinaMessages(...args),
  isBlobPathnameReferenced: vi.fn(),
  readNinaTuning: (...args: unknown[]) => readNinaTuning(...args),
  setNinaMessageImageDescription: (...args: unknown[]) => setNinaMessageImageDescription(...args),
  updateNinaChatPhotoBlob: (...args: unknown[]) => updateNinaChatPhotoBlob(...args),
  updateNinaChatPhotoDescription: (...args: unknown[]) => updateNinaChatPhotoDescription(...args),
  updateNinaMessage: (...args: unknown[]) => updateNinaMessage(...args),
}))

type Actions = typeof import('@/lib/admin/chatPhotoActions')
let actions: Actions

/** The row `getNinaMessageImage` hands the callback: no description yet, so the eyes run. */
const imageRow = {
  id: IMAGE_ID,
  messageId: MESSAGE_ID,
  kind: 'generated' as const,
  blobUrl: storedUrl,
  pathname: storedPathname,
  width: 768,
  height: 1024,
  bytes: 240_000,
  description: null as string | null,
  prompt: null,
  sortOrder: 0,
  createdAt: new Date(0),
}

async function runTheAfterCallback(): Promise<void> {
  const cb = afterCallbacks.at(-1)
  if (cb == null) throw new Error('no after() callback was scheduled')
  return cb()
}

beforeEach(async () => {
  afterCallbacks.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  requireAdmin.mockResolvedValue({ userId: USER })
  resolveNinaWriteSession.mockResolvedValue(SESSION_ID)
  insertNinaMessages.mockResolvedValue([{ id: MESSAGE_ID }])
  insertNinaMessageImages.mockResolvedValue([{ id: IMAGE_ID }])
  getNinaMessageImage.mockResolvedValue({ ...imageRow })
  describeNinaImages.mockResolvedValue({
    description: STORED_DESCRIPTION,
    promptTokens: 900,
    completionTokens: 60,
    floor: 500,
    finishReason: 'stop',
  })
  setNinaMessageImageDescription.mockResolvedValue(undefined)
  readNinaTuning.mockResolvedValue(NINA_TUNING_DEFAULTS)
  captionNinaPhoto.mockResolvedValue(CAPTION)
  updateNinaMessage.mockResolvedValue({ id: MESSAGE_ID })
  updateNinaChatPhotoBlob.mockResolvedValue({ id: IMAGE_ID })
  updateNinaChatPhotoDescription.mockResolvedValue({ id: IMAGE_ID })

  actions = await import('@/lib/admin/chatPhotoActions')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('scheduleChatPhotoCaption (through addChatPhotoAction)', () => {
  it('describes with subject: self, then writes the caption to the message', async () => {
    const result = await actions.addChatPhotoAction(goodBlob)
    expect(result).toEqual({ ok: true, id: IMAGE_ID })

    // Exit criterion 7, asserted rather than reviewed: the response path awaited NO model call.
    // The scheduler only handed `after()` a closure, and nothing in it has run yet.
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(captionNinaPhoto).not.toHaveBeenCalled()

    // The bubble the operator sees for the next ~20 s asserts nothing about the picture — that is
    // what makes every failure case below safe rather than merely non-fatal.
    expect(insertNinaMessages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ role: 'nina', photoOnly: true })],
      SESSION_ID,
    )
    const [, [inserted]] = insertNinaMessages.mock.calls[0] as [string, [{ body: string }], string]
    expect(isNinaPhotoCarrierMessage({ role: 'nina', body: inserted.body })).toBe(true)

    await runTheAfterCallback()

    // The subject is the half a runner-subject prompt gets wrong, so it is asserted explicitly.
    expect(describeNinaImages).toHaveBeenCalledWith(
      [{ blobUrl: storedUrl, pathname: storedPathname }],
      { subject: 'self' },
    )
    // The paragraph is stored BEFORE the caption is attempted (exit criterion 5), so a caption
    // failure never costs it.
    expect(setNinaMessageImageDescription).toHaveBeenCalledWith(USER, IMAGE_ID, STORED_DESCRIPTION)
    expect(captionNinaPhoto).toHaveBeenCalledWith({
      seen: STORED_DESCRIPTION,
      seenKind: 'described',
      tuning: NINA_TUNING_DEFAULTS,
    })
    expect(updateNinaMessage).toHaveBeenCalledWith(USER, MESSAGE_ID, CAPTION)
  })

  it('leaves the canned line and writes nothing when the caption is refused', async () => {
    // captionNinaPhoto -> null. The placeholder is one of NINA_IMAGE_CAPTION_POOL's scene-agnostic
    // lines, so keeping it is a true sentence rather than a wrong one.
    captionNinaPhoto.mockResolvedValue(null)
    await actions.addChatPhotoAction(goodBlob)
    await runTheAfterCallback()

    expect(setNinaMessageImageDescription).toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
  })

  it('does not caption when the eyes failed, and still stores no description', async () => {
    describeNinaImages.mockRejectedValue(new FakeVisionTokenFloorError('600 < 500 floor'))
    await actions.addChatPhotoAction(goodBlob)
    await runTheAfterCallback()

    expect(setNinaMessageImageDescription).not.toHaveBeenCalled()
    expect(captionNinaPhoto).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
    // Exit criterion 4: the floor is a dropped image, not a transport failure, and it is LOUD.
    expect(console.error).toHaveBeenCalledWith(
      '[f36] TOKEN FLOOR TRIPPED on a chat photo',
      expect.objectContaining({ pathname: storedPathname }),
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('logs a transport failure separately from the floor, and still captions nothing', async () => {
    describeNinaImages.mockRejectedValue(new Error('socket hang up'))
    await actions.addChatPhotoAction(goodBlob)
    await runTheAfterCallback()

    expect(console.error).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      '[f36] chat photo describe failed; the row keeps a null description',
      expect.objectContaining({ id: IMAGE_ID }),
    )
    expect(captionNinaPhoto).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
  })

  it('skips the vision call but still captions when a description is already stored', async () => {
    // getNinaMessageImage returns a row with description set — the free retry.
    getNinaMessageImage.mockResolvedValue({ ...imageRow, description: STORED_DESCRIPTION })
    await actions.addChatPhotoAction(goodBlob)
    await runTheAfterCallback()

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(setNinaMessageImageDescription).not.toHaveBeenCalled()
    expect(captionNinaPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ seen: STORED_DESCRIPTION, seenKind: 'described' }),
    )
    expect(updateNinaMessage).toHaveBeenCalled()
  })

  it('is a miss, not a failure, when the row is gone', async () => {
    getNinaMessageImage.mockResolvedValue(null)
    await actions.addChatPhotoAction(goodBlob)
    await expect(runTheAfterCallback()).resolves.toBeUndefined()

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(captionNinaPhoto).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
  })

  it('is a miss when the bubble went away before its caption arrived', async () => {
    updateNinaMessage.mockResolvedValue(null)
    await actions.addChatPhotoAction(goodBlob)
    await expect(runTheAfterCallback()).resolves.toBeUndefined()
  })

  it('never rejects, whatever the pass does', async () => {
    // updateNinaMessage throws. The action still resolved { ok: true } and after() saw no rejection.
    updateNinaMessage.mockRejectedValue(new Error('deadlock detected'))
    const result = await actions.addChatPhotoAction(goodBlob)
    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    await expect(runTheAfterCallback()).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith(
      '[f36] chat photo caption pass failed',
      expect.objectContaining({ id: IMAGE_ID }),
    )
  })
})

describe('replaceChatPhotoAction schedules the same captioner', () => {
  it('is the captioner and not the old describe-only pass', async () => {
    // Replace HAD a `scheduleChatPhotoDescribe` call, so the rename reached it too. The bubble's
    // text in the gap is deliberately undesigned — see the note at the call site — but the pass
    // that runs is the same one, which is what keeps the two sites from drifting.
    const result = await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })
    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(describeNinaImages).not.toHaveBeenCalled()

    await runTheAfterCallback()
    expect(describeNinaImages).toHaveBeenCalledWith(expect.anything(), { subject: 'self' })
    expect(updateNinaMessage).toHaveBeenCalledWith(USER, MESSAGE_ID, CAPTION)
  })
})

/**
 * `editChatPhotoDescriptionAction` — R2's write.
 *
 * `@/lib/admin/chatPhotoSchema` stays REAL in this file (the mock header at :304-306 says so and
 * why), so these cases exercise the actual normalisation and the actual ceiling, not a stub of them.
 * The SQL the action ends up issuing is asserted separately, in
 * `tests/nina.chatPhotoDescription.test.ts`, for the reason `tests/nina.softDelete.test.ts`'s header
 * gives: a spy cannot tell "the function was called" from "the predicate was in the WHERE".
 */
describe('editChatPhotoDescriptionAction', () => {
  const PROSE = 'She is sitting on a kerb in low orange light, a bottle in one hand, jacket open.'

  it('writes the trimmed prose and revalidates the collection', async () => {
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: `  ${PROSE}  `,
    })

    expect(updateNinaChatPhotoDescription).toHaveBeenCalledWith(USER, IMAGE_ID, PROSE)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/photos')
    expect(result).toEqual({ ok: true, id: IMAGE_ID })
  })

  it('clears the field to NULL on an empty box, and says what that costs', async () => {
    // D1. NULL is not a new state for the row, and the send path substitutes
    // NINA_DESCRIPTION_UNAVAILABLE for it — so the operator is told, in the `note`.
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: '  \n ',
    })

    expect(updateNinaChatPhotoDescription).toHaveBeenCalledWith(USER, IMAGE_ID, null)
    expect(result.ok).toBe(true)
    expect(result.note).toMatch(/could not see it/)
  })

  it('pays for no model call, schedules no after() pass, and does not re-caption the bubble', async () => {
    // Invariant 5 of the plan set, asserted rather than reviewed. And the last assertion is the
    // phase's own rule: editing what she SAW is not editing what she SAID.
    await actions.editChatPhotoDescriptionAction({ id: IMAGE_ID, description: PROSE })

    expect(afterCallbacks).toHaveLength(0)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(captionNinaPhoto).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
    expect(setNinaMessageImageDescription).not.toHaveBeenCalled()
  })

  it('refuses a row that is not in the collection', async () => {
    getNinaMessageImage.mockResolvedValue(null)
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses one of HIS uploads, because this screen lists only hers', async () => {
    // `getNinaMessageImage` does not filter on `kind`, so this guard is what stops an id for a
    // composer upload reaching a write nobody could see or undo from /admin/photos.
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(result).toEqual({ ok: false, error: 'That one is his upload, not hers.' })
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
  })

  it('refuses an over-long description without reading the row at all', async () => {
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: 'x'.repeat(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS + 1),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain(String(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS))
    expect(getNinaMessageImage).not.toHaveBeenCalled()
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin BEFORE it looks at the payload', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(
      actions.editChatPhotoDescriptionAction({ id: IMAGE_ID, description: PROSE }),
    ).rejects.toThrow('not an admin')

    expect(getNinaMessageImage).not.toHaveBeenCalled()
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
  })

  it('reports a lost race as a miss rather than a success', async () => {
    // The row was there at the re-read and gone (or no longer `generated`) by the write.
    updateNinaChatPhotoDescription.mockResolvedValue(null)
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
