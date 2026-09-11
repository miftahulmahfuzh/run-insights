import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ADMIN_CHAT_PHOTO_LONG_EDGE_PX } from '@/components/admin/explorer/chatPhotoUpload'
import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import {
  chatPhotoAddSchema,
  chatPhotoDescribeSchema,
  chatPhotoDescriptionField,
  chatPhotoDescriptionSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import {
  ADMIN_CHAT_PHOTOS_PATH,
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

/**
 * `instanceof` is the whole point of the class, so the mock exports a real one to be an instance of.
 * Hoisted because media-dedupe P3 gave `components/admin/explorer/chatPhotoUpload` a server-action
 * import, so this file's static import of that client module now transitively loads
 * `chatPhotoActions` → `vision` while the module body is still evaluating — and the `vi.mock`
 * factory needs the class to exist by then, not by `beforeEach`.
 */
const { FakeVisionTokenFloorError } = vi.hoisted(() => ({
  FakeVisionTokenFloorError: class extends Error {
    override name = 'NinaVisionTokenFloorError'
  },
}))

const requireAdmin = vi.fn()
const getNinaMessageImage = vi.fn()
const findNinaImageByContentHash = vi.fn()
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
  findNinaImageByContentHash: (...args: unknown[]) => findNinaImageByContentHash(...args),
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
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: vi.fn() }))

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
  findNinaImageByContentHash.mockResolvedValue(null)
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

  it('replaces one of HIS uploads — the row, not its kind, is the address (R1)', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })

    const result = await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(updateNinaChatPhotoBlob).toHaveBeenCalledWith(
      USER,
      IMAGE_ID,
      expect.objectContaining({ blobUrl: storedUrl, pathname: storedPathname }),
    )
  })

  it('describes HIS upload with the runner witness — subject follows the side', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })

    await actions.replaceChatPhotoAction({ id: IMAGE_ID, ...goodBlob })
    await runTheAfterCallback()

    expect(describeNinaImages).toHaveBeenCalledWith(expect.anything(), { subject: 'runner' })
  })
})

describe('addChatPhotoAction write-time dedup (media-dedupe P3)', () => {
  const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  /** A RUNNER-upload pathname — valid for the store, INVALID for the admin predicate. */
  const keeperUploadPathname = `nina/${USER}/chat/${ID}-${BLOB_SUFFIX}.jpg`
  /* The keeper's object is NOT goodBlob's: the race path means the client PUT fresh bytes whose
   * pathname cannot equal the keeper's (`addRandomSuffix`), and the release assertion below rides
   * on the two being different strings. */
  const keeperPathname = `nina/${USER}/selfie-keep123XYZ_9-KeeperSuffix0123456789abcd.jpg`
  const KEEPER = {
    id: 'keep123XYZ_9',
    messageId: null,
    kind: 'generated' as const,
    blobUrl: `${STORE}/${keeperPathname}`,
    pathname: keeperPathname,
    width: 768,
    height: 1024,
    bytes: 240_000,
    description: 'Keeper prose, already paid for.',
    prompt: null,
    sourceAvatarId: null,
    sourceImageId: null,
    contentHash: HASH,
    sortOrder: 0,
    createdAt: new Date(0),
  }

  it('writes the add as a REFERENCE to the keeper and copies its description', async () => {
    // The race path: the client PUT fresh bytes (goodBlob's pathname passes the admin predicate)
    // and the hash lookup found the keeper at action time.
    findNinaImageByContentHash.mockResolvedValue(KEEPER)

    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(insertNinaMessageImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({
        blobUrl: KEEPER.blobUrl,
        pathname: KEEPER.pathname,
        sourceImageId: KEEPER.id,
        sourceAvatarId: null,
        contentHash: HASH,
        description: KEEPER.description,
      }),
    ])
  })

  it('releases the fresh loser bytes after the reference row is in (row first, blob second)', async () => {
    findNinaImageByContentHash.mockResolvedValue(KEEPER)
    const { releaseBlobIfUnreferenced } = await import('@/lib/nina/blobRelease')

    await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: goodBlob.blobUrl,
      pathname: goodBlob.pathname,
    })
  })

  it('the skip path pins the row, skips the admin pathname guard, and releases NOTHING', async () => {
    // The pre-check path: the client never PUT, so the payload echoes the keeper's object — a
    // RUNNER-upload pathname here, which the admin predicate would refuse. The pin is why the
    // guard is skipped, and the echo is why nothing may be released.
    const { releaseBlobIfUnreferenced } = await import('@/lib/nina/blobRelease')
    getNinaMessageImage.mockResolvedValue({
      ...KEEPER,
      pathname: keeperUploadPathname,
      blobUrl: `${STORE}/${keeperUploadPathname}`,
    })

    const result = await actions.addChatPhotoAction({
      blobUrl: `${STORE}/${keeperUploadPathname}`,
      pathname: keeperUploadPathname,
      width: 768,
      height: 1024,
      bytes: 240_000,
      contentHash: HASH,
      duplicateOfId: KEEPER.id,
    })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(insertNinaMessageImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({ pathname: keeperUploadPathname, sourceImageId: KEEPER.id }),
    ])
  })

  it('a pinned row that vanished between pre-check and action is a refusal, not a dead row', async () => {
    getNinaMessageImage.mockResolvedValue(null)

    const result = await actions.addChatPhotoAction({
      ...goodBlob,
      contentHash: HASH,
      duplicateOfId: KEEPER.id,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/pick it again/)
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('a pinned row that is itself a reference flattens to its original', async () => {
    getNinaMessageImage.mockResolvedValue({
      ...KEEPER,
      sourceImageId: 'origin12XYZ_',
    })

    await actions.addChatPhotoAction({
      ...goodBlob,
      contentHash: HASH,
      duplicateOfId: KEEPER.id,
    })

    expect(insertNinaMessageImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({ sourceImageId: 'origin12XYZ_' }),
    ])
  })

  it('a malformed hash claim is a NULL and a normal add, never an error (invariant 9)', async () => {
    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: 'not-a-hash' })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(findNinaImageByContentHash).not.toHaveBeenCalled()
    expect(insertNinaMessageImages).toHaveBeenCalledWith(USER, [
      expect.objectContaining({ contentHash: null, sourceImageId: null }),
    ])
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
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
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

  it('describes one of HIS uploads — the kind refusal is lifted (R1)', async () => {
    // `getNinaMessageImage` does not filter on `kind`, and nothing above the write does either
    // now: every ORIGINAL row is describable, which is the merge's whole point. The write's own
    // `isOriginalPhoto()` clause is what still stops a reference.
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(updateNinaChatPhotoDescription).toHaveBeenCalledWith(USER, IMAGE_ID, PROSE)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
    expect(result).toEqual({ ok: true, id: IMAGE_ID })
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

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 *  THE THREE ACTIONS THE CAPTION SUITE NEVER RAN — 2026-09-11's follow-up, closed.
 *
 *  `addChatPhotoAction`, `replaceChatPhotoAction` and `editChatPhotoDescriptionAction` execute
 *  above. `removeChatPhotoAction`, `describeChatPhotoAction` and `findChatPhotoDuplicateAction`
 *  had only mock-only cameos in component tests (or nothing at all), and Remove is the one
 *  DESTRUCTIVE action on this surface. What only execution pins:
 *
 *    - the empty-bubble rule fires as a DELETE OF THE MESSAGE, not a second statement — and a
 *      RUNNER message survives even when its last photograph is being removed, because the
 *      message is his and carries his words;
 *    - an ORPHAN (message_id NULL — every photograph from every deleted conversation) skips the
 *      carrier lookups entirely rather than passing a null id into an owner-scoped query;
 *    - a reference row is refused ABOVE the carrier load, so even an orphaned reference cannot
 *      slide into the plain-delete branch;
 *    - the blob is released only after the row is gone, and a SHARED object is kept with a note;
 *    - the describe button follows the PHOTO'S SIDE — her photograph gets the self prompt, HIS
 *      upload the runner prompt — and overwrites, because the panel's textarea is the correction.
 * ═════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Loose vi.fn handles, retrieved from the mock module: the fixture rows below are PARTIAL (the
 * actions read three fields, and `isNinaPhotoCarrierMessage` needs role/body only), and typing
 * these as the full `NinaMessageRow`/`NinaImageRow` would force fixtures of eleven columns to
 * assertions that never read them.
 */
const queriesMock = (await import('@/lib/nina/queries')) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>
const { releaseBlobIfUnreferenced } = (await import('@/lib/nina/blobRelease')) as unknown as {
  releaseBlobIfUnreferenced: ReturnType<typeof vi.fn>
}

/** The mock factory's vi.fn by name — a missing name is a suite bug, and fails loudly here. */
function handle(name: string): ReturnType<typeof vi.fn> {
  const fn = queriesMock[name]
  if (fn == null) throw new Error(`the queries mock factory has no ${name}`)
  return fn
}

const deleteNinaMessage = handle('deleteNinaMessage')
const deleteNinaMessageImage = handle('deleteNinaMessageImage')
const getNinaMessagesByIds = handle('getNinaMessagesByIds')
const getNinaMessageImagesForMessages = handle('getNinaMessageImagesForMessages')

const HASH = 'a'.repeat(64)
const SOURCE_HASH = 'b'.repeat(64)

beforeEach(() => {
  // The caption suite's shared beforeEach leaves `setNinaMessageImageDescription` resolving
  // `undefined` (its callback never reads the answer); these actions DO, so they need the row.
  setNinaMessageImageDescription.mockResolvedValue({ id: IMAGE_ID })
  releaseBlobIfUnreferenced.mockResolvedValue('deleted')
  deleteNinaMessage.mockResolvedValue({ id: MESSAGE_ID })
  deleteNinaMessageImage.mockResolvedValue({ id: IMAGE_ID })
  getNinaMessagesByIds.mockResolvedValue([
    { id: MESSAGE_ID, role: 'nina', body: NINA_IMAGE_CAPTIONS[0] },
  ])
  getNinaMessageImagesForMessages.mockResolvedValue([{ ...imageRow }])
})

describe('findChatPhotoDuplicateAction — the pre-PUT diff key', () => {
  it('hands the finder both valid keys and answers with the keeper triplet', async () => {
    findNinaImageByContentHash.mockResolvedValue({
      id: IMAGE_ID,
      blobUrl: storedUrl,
      pathname: storedPathname,
    })

    const found = await actions.findChatPhotoDuplicateAction(HASH, SOURCE_HASH)

    expect(found).toEqual({ id: IMAGE_ID, blobUrl: storedUrl, pathname: storedPathname })
    expect(findNinaImageByContentHash).toHaveBeenCalledWith(USER, [HASH, SOURCE_HASH])
  })

  it('filters a malformed source hash rather than refusing both', async () => {
    findNinaImageByContentHash.mockResolvedValue(null)

    await actions.findChatPhotoDuplicateAction(HASH, 'not-a-hash')

    expect(findNinaImageByContentHash).toHaveBeenCalledWith(USER, [HASH])
  })

  it('answers null for hashes that are not hashes, without reaching the store', async () => {
    expect(await actions.findChatPhotoDuplicateAction('', undefined)).toBeNull()
    expect(findNinaImageByContentHash).not.toHaveBeenCalled()
  })

  it('answers null when nothing matches, and gates on requireAdmin', async () => {
    findNinaImageByContentHash.mockResolvedValue(null)
    expect(await actions.findChatPhotoDuplicateAction(HASH)).toBeNull()

    requireAdmin.mockRejectedValue(new Error('not an admin'))
    await expect(actions.findChatPhotoDuplicateAction(HASH)).rejects.toThrow('not an admin')
  })
})

describe('removeChatPhotoAction — the one destructive action on this surface', () => {
  it('removes one of several siblings: the image row, and the blob if nothing points at it', async () => {
    getNinaMessageImagesForMessages.mockResolvedValue([
      { ...imageRow },
      { ...imageRow, id: 'otherImg1234' },
    ])

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(deleteNinaMessageImage).toHaveBeenCalledWith(USER, IMAGE_ID)
    expect(deleteNinaMessage).not.toHaveBeenCalled() // her message keeps its other photograph
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ id: IMAGE_ID }),
    )
    expect(revalidatePath).toHaveBeenCalledWith(ADMIN_CHAT_PHOTOS_PATH)
  })

  it('the LAST image on her caption-only bubble deletes the MESSAGE — no empty bubble, ever', async () => {
    // beforeEach's carrier message is hers carrying a caption: the whole definition of carrier.
    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result.ok).toBe(true)
    expect(deleteNinaMessage).toHaveBeenCalledWith(USER, MESSAGE_ID)
    expect(deleteNinaMessageImage).not.toHaveBeenCalled()
    // The row is gone by cascade inside the same transaction — the release is asked about the
    // ROW's object either way, after the rows are gone.
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
  })

  it('the last image on a RUNNER message never takes his words with it', async () => {
    getNinaMessagesByIds.mockResolvedValue([
      { id: MESSAGE_ID, role: 'runner', body: 'nih fotonya' },
    ])

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result.ok).toBe(true)
    expect(deleteNinaMessageImage).toHaveBeenCalledWith(USER, IMAGE_ID)
    expect(deleteNinaMessage).not.toHaveBeenCalled()
  })

  it('an ORPHAN skips the carrier lookups — no null id reaches an owner-scoped query', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, messageId: null })

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result.ok).toBe(true)
    expect(getNinaMessagesByIds).not.toHaveBeenCalled()
    expect(getNinaMessageImagesForMessages).not.toHaveBeenCalled()
    expect(deleteNinaMessageImage).toHaveBeenCalledWith(USER, IMAGE_ID)
  })

  it('refuses a photo that is not in the collection before anything is deleted', async () => {
    getNinaMessageImage.mockResolvedValue(null)

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
    expect(deleteNinaMessage).not.toHaveBeenCalled()
    expect(deleteNinaMessageImage).not.toHaveBeenCalled()
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a REFERENCE row is refused above the carrier load — even an orphaned one', async () => {
    getNinaMessageImage.mockResolvedValue({
      ...imageRow,
      messageId: null,
      sourceAvatarId: 'avaOrigin12',
    })

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Remove the original instead.',
    })
    expect(getNinaMessagesByIds).not.toHaveBeenCalled()
    expect(deleteNinaMessageImage).not.toHaveBeenCalled()
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('a row that vanished between the read and the delete is the miss sentence, not a crash', async () => {
    // Two siblings so the plain delete branch runs; then the delete finds nothing.
    getNinaMessageImagesForMessages.mockResolvedValue([
      { ...imageRow },
      { ...imageRow, id: 'otherImg1234' },
    ])
    deleteNinaMessageImage.mockResolvedValue(null)

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled() // and the object is NOT released
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('a blob something else points at is KEPT, and the operator is told', async () => {
    releaseBlobIfUnreferenced.mockResolvedValue('shared')

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({
      ok: true,
      id: IMAGE_ID,
      note: 'The file is still used elsewhere, so it was kept in the store.',
    })
  })

  it('refuses a malformed payload, and gates on requireAdmin first', async () => {
    expect(await actions.removeChatPhotoAction({ id: 'nope' })).toEqual({
      ok: false,
      error: 'Not a photo id.',
    })
    expect(getNinaMessageImage).not.toHaveBeenCalled()

    requireAdmin.mockRejectedValue(new Error('not an admin'))
    await expect(actions.removeChatPhotoAction({ id: IMAGE_ID })).rejects.toThrow('not an admin')
  })
})

describe('describeChatPhotoAction — the vision button, for both kinds', () => {
  it('her photograph is described with the SELF subject, and the prose is stored', async () => {
    const result = await actions.describeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({ ok: true, id: IMAGE_ID, description: STORED_DESCRIPTION })
    expect(describeNinaImages).toHaveBeenCalledWith(
      [{ blobUrl: storedUrl, pathname: storedPathname }],
      { subject: 'self' },
    )
    expect(setNinaMessageImageDescription).toHaveBeenCalledWith(USER, IMAGE_ID, STORED_DESCRIPTION)
    expect(revalidatePath).toHaveBeenCalledWith(ADMIN_CHAT_PHOTOS_PATH)
    expect(afterCallbacks).toHaveLength(0) // no re-caption: what she SAID is not rewritten
  })

  it('HIS upload gets the RUNNER prompt — the subject follows the photo, there is no kind guard', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' as const })

    const result = await actions.describeChatPhotoAction({ id: IMAGE_ID })

    expect(result.ok).toBe(true)
    expect(describeNinaImages).toHaveBeenCalledWith(
      [{ blobUrl: storedUrl, pathname: storedPathname }],
      { subject: 'runner' },
    )
  })

  it('a reference row is refused with the describe-specific sentence', async () => {
    getNinaMessageImage.mockResolvedValue({ ...imageRow, sourceImageId: 'imgOriginal12' })

    const result = await actions.describeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Describe the original instead.',
    })
    expect(describeNinaImages).not.toHaveBeenCalled()
  })

  it('a write that misses is the not-in-the-collection refusal', async () => {
    setNinaMessageImageDescription.mockResolvedValue(undefined)

    const result = await actions.describeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
  })

  it('a vendor failure — including a tripped token floor — leaves the stored prose untouched', async () => {
    describeNinaImages.mockRejectedValue(new FakeVisionTokenFloorError('floor tripped'))

    const result = await actions.describeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({ ok: false, error: 'The description call failed. Try again.' })
    expect(setNinaMessageImageDescription).not.toHaveBeenCalled()

    describeNinaImages.mockRejectedValue(new Error('vendor 500'))
    expect(await actions.describeChatPhotoAction({ id: IMAGE_ID })).toEqual({
      ok: false,
      error: 'The description call failed. Try again.',
    })
  })

  it('refuses a malformed id and gates on requireAdmin', async () => {
    expect(await actions.describeChatPhotoAction({ id: 'short' })).toEqual({
      ok: false,
      error: 'Not a photo id.',
    })
    expect(getNinaMessageImage).not.toHaveBeenCalled()

    requireAdmin.mockRejectedValue(new Error('not an admin'))
    await expect(actions.describeChatPhotoAction({ id: IMAGE_ID })).rejects.toThrow('not an admin')
  })
})

describe('chatPhotoDescribeSchema and chatPhotoDescriptionField — the shared grammar', () => {
  it('the describe schema is an id and nothing else', () => {
    expect(chatPhotoDescribeSchema.safeParse({ id: IMAGE_ID }).success).toBe(true)
    expect(chatPhotoDescribeSchema.safeParse({ id: 'short' }).success).toBe(false)
    expect(chatPhotoDescribeSchema.safeParse({}).success).toBe(false)
  })

  it('the description field is the one normaliser both tables reuse', () => {
    // CRLF folds to LF, three newlines fold to two — the same sentence written into the same kind
    // of prompt, normalised once, whichever table it lands in.
    expect(chatPhotoDescriptionField.parse('a\r\nb\n\n\n\nc')).toBe('a\nb\n\nc')
  })
})
