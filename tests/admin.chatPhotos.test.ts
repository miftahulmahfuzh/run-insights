import { describe, expect, it } from 'vitest'

import { ADMIN_CHAT_PHOTO_LONG_EDGE_PX } from '@/components/admin/chatPhotoUpload'
import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import {
  chatPhotoAddSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import {
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

/**
 * `admin-memory-and-chat-photos` phase 3's boundary logic — the half that needs no database and no
 * DOM: the pathname agreement with her own writer, the URL predicates, the empty-bubble rule, the
 * three Zod payloads, and the cross-module agreements that would otherwise only fail in production.
 */

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

/** What Blob hands back: the requested pathname plus its random suffix. */
const storedPathname = `nina/${USER}/selfie-${ID}-Xy7kQ2p.jpg`
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

  it('refuses an id outside the 12-24 window and a non-id user', () => {
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-short.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(`nina/${USER}/selfie-${'a'.repeat(25)}.jpg`, USER)).toBe(false)
    expect(isAdminChatPhotoPathname(storedPathname, '../evil')).toBe(false)
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
