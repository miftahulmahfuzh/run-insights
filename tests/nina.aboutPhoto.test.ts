import { describe, expect, it } from 'vitest'

import { readRepoCode } from './support/importGraph'
import {
  NINA_ABOUT_HREF,
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ABOUT_RETURN_PARAM,
  aboutPhotoHref,
  aboutPhotoIdOutsideGallery,
  aboutViewerLists,
  decodeAboutPhoto,
  decodeAboutReturnTo,
  encodeAboutPhoto,
  type NinaAlbumPhoto,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'

/** 12 chars, so `isValidId` accepts it and `newId()` could have produced it. */
const IMAGE_ID = 'imgAAAAAAAAA'
const OLD_ID = 'imgOld000001'

/** A `NinaGalleryPhoto` fixture; `kind` decides the side, exactly as `photoSideOf` does. */
function photo(id: string, kind: 'upload' | 'generated' = 'upload'): NinaGalleryPhoto {
  const side = kind === 'generated' ? 'hers' : 'his'
  return {
    id,
    messageId: 'msgAAAAAAAAA',
    url: `https://x.example/${id}.png`,
    kind,
    side,
    label: side === 'hers' ? 'Foto Nina' : 'Foto kamu',
  }
}

const album: NinaAlbumPhoto[] = [
  {
    id: 'avatarAAAAAA',
    url: 'https://x.example/a.png',
    kind: 'avatar',
    label: 'Foto profil Nina',
    isCurrent: true,
    description: null,
  },
]

describe('the /nina/about photo codec round-trips', () => {
  it('decode inverts encode, for both sections', () => {
    for (const section of ['album', 'chat'] as const) {
      expect(decodeAboutPhoto(encodeAboutPhoto(section, IMAGE_ID))).toEqual({
        section,
        id: IMAGE_ID,
      })
    }
  })

  it('the encoded value is section-dot-id — never the attach grammar’s colon', () => {
    const encoded = encodeAboutPhoto('chat', IMAGE_ID)
    expect(encoded).toBe(`chat.${IMAGE_ID}`)
    expect(encoded).not.toContain(':')
  })

  it('refuses every shape that is not one section and one id', () => {
    expect(decodeAboutPhoto(null)).toBeNull()
    expect(decodeAboutPhoto(undefined)).toBeNull()
    expect(decodeAboutPhoto(['chat', IMAGE_ID])).toBeNull() // a repeated ?photo=a&photo=b
    expect(decodeAboutPhoto('')).toBeNull()
    expect(decodeAboutPhoto('no-dot')).toBeNull()
    expect(decodeAboutPhoto('.leading-dot')).toBeNull() // empty section
    expect(decodeAboutPhoto('chat.')).toBeNull() // empty id
    expect(decodeAboutPhoto('grid.aaaaaaaaaaaa')).toBeNull() // a section the viewer does not have
  })
})

describe('aboutPhotoHref builds the deep link Detail foto will navigate to', () => {
  it('names the about route and the photo parameter, and nothing else', () => {
    const href = aboutPhotoHref('chat', OLD_ID)
    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe('/nina/about')
    expect(url.pathname).toBe(NINA_ABOUT_HREF)
    expect([...url.searchParams.keys()]).toEqual([NINA_ABOUT_PHOTO_PARAM])
  })

  it('survives the platform’s own URL parse and the screen’s decode', () => {
    const url = new URL(aboutPhotoHref('chat', OLD_ID), 'https://example.test')
    expect(decodeAboutPhoto(url.searchParams.get(NINA_ABOUT_PHOTO_PARAM))).toEqual({
      section: 'chat',
      id: OLD_ID,
    })
  })
})

describe('the RETURN leg — where closing a deep-linked viewer lands', () => {
  it('decodeAboutReturnTo keeps an in-app absolute path, verbatim, query included', () => {
    /* Detail foto's link is the shape this exists for: the origin page, spelled as a path. A
     * query string rides along (`/nina/jobs/x?tab=1`) — it is one in-app route naming another. */
    expect(decodeAboutReturnTo('/nina/jobs/jobAAAAAAAAA')).toBe('/nina/jobs/jobAAAAAAAAA')
    expect(decodeAboutReturnTo('/nina/jobs/x?tab=1')).toBe('/nina/jobs/x?tab=1')
    expect(decodeAboutReturnTo('/')).toBe('/')
  })

  it('refuses every shape that is not an in-app absolute path', () => {
    expect(decodeAboutReturnTo('//evil.test/x')).toBeNull() // protocol-relative: the open-redirect shape
    expect(decodeAboutReturnTo('/\\evil.test/x')).toBeNull() // the backslash twin of the same shape
    expect(decodeAboutReturnTo('https://evil.test')).toBeNull() // off-app outright
    expect(decodeAboutReturnTo('nina/jobs/x')).toBeNull() // relative: resolves against wherever close runs
    expect(decodeAboutReturnTo('')).toBeNull()
    expect(decodeAboutReturnTo(null)).toBeNull()
    expect(decodeAboutReturnTo(undefined)).toBeNull()
    expect(decodeAboutReturnTo(['/nina/jobs/x'])).toBeNull() // a repeated ?return=a&return=b
  })

  it('aboutPhotoHref writes the leg only when the decoder would keep it', () => {
    /* The builder refuses what the decoder refuses, so an href this module mints cannot carry an
     * off-app target even from a caller bug — and the refused value costs the caller nothing: no
     * guard, no throw, just the parameter absent. */
    const good = new URL(
      aboutPhotoHref('chat', OLD_ID, '/nina/jobs/jobAAAAAAAAA'),
      'https://x.test',
    )
    expect([...good.searchParams.keys()]).toEqual([NINA_ABOUT_PHOTO_PARAM, NINA_ABOUT_RETURN_PARAM])
    expect(good.searchParams.get(NINA_ABOUT_RETURN_PARAM)).toBe('/nina/jobs/jobAAAAAAAAA')
    const bad = new URL(aboutPhotoHref('chat', OLD_ID, '//evil.test/x'), 'https://x.test')
    expect([...bad.searchParams.keys()]).toEqual([NINA_ABOUT_PHOTO_PARAM])
  })

  it('the href round-trips the origin through the platform’s own URL parse', () => {
    const url = new URL(
      aboutPhotoHref('chat', OLD_ID, '/nina/jobs/jobAAAAAAAAA'),
      'https://example.test',
    )
    expect(decodeAboutPhoto(url.searchParams.get(NINA_ABOUT_PHOTO_PARAM))).toEqual({
      section: 'chat',
      id: OLD_ID,
    })
    expect(decodeAboutReturnTo(url.searchParams.get(NINA_ABOUT_RETURN_PARAM))).toBe(
      '/nina/jobs/jobAAAAAAAAA',
    )
  })
})

describe('aboutViewerLists is the rule for which list the viewer renders', () => {
  it('with nothing resolved, the chat arm IS the gallery — the viewer over the grid’s own list', () => {
    const gallery = [photo(IMAGE_ID)]
    const lists = aboutViewerLists({ album, gallery, resolvedChatPhoto: null })
    expect(lists.chat).toEqual(gallery)
    expect(lists.chat).toHaveLength(1)
  })

  it('a resolved photo is APPENDED, so every grid index still addresses the same photo', () => {
    /*
     * This is invariant 8 made mechanical: the grid maps `gallery` alone, and because the
     * resolved row lands at index `gallery.length`, cell `i` and viewer index `i` agree for
     * every cell the grid draws. The append is the whole reason the grid cannot drift.
     */
    const gallery = [photo(IMAGE_ID), photo('imgOld000002')]
    const resolved = photo(OLD_ID, 'generated')
    const lists = aboutViewerLists({ album, gallery, resolvedChatPhoto: resolved })
    expect(lists.chat).toEqual([...gallery, resolved])
    expect(lists.chat[lists.chat.length - 1]).toEqual(resolved)
  })

  it('the album arm never carries the resolved photo', () => {
    const lists = aboutViewerLists({ album, gallery: [], resolvedChatPhoto: photo(OLD_ID) })
    expect(lists.album).toEqual(album)
    expect(lists.album).toHaveLength(1)
  })
})

describe('aboutPhotoIdOutsideGallery is the membership-miss predicate', () => {
  const gallery = [photo(IMAGE_ID)]

  it('answers the id the server must resolve, and only that id', () => {
    expect(aboutPhotoIdOutsideGallery(`chat.${OLD_ID}`, gallery)).toBe(OLD_ID)
  })

  it('answers null when the gallery holds it — the common case costs zero queries', () => {
    expect(aboutPhotoIdOutsideGallery(`chat.${IMAGE_ID}`, gallery)).toBeNull()
  })

  it('answers null for the album section — an album miss is not the R3 window', () => {
    expect(aboutPhotoIdOutsideGallery(`album.${OLD_ID}`, gallery)).toBeNull()
  })

  it('answers null for every malformed shape — a hand-typed URL buys no query', () => {
    expect(aboutPhotoIdOutsideGallery(null, gallery)).toBeNull()
    expect(aboutPhotoIdOutsideGallery(undefined, gallery)).toBeNull()
    expect(aboutPhotoIdOutsideGallery(['chat', OLD_ID], gallery)).toBeNull()
    expect(aboutPhotoIdOutsideGallery('chat.', gallery)).toBeNull()
    expect(aboutPhotoIdOutsideGallery('no-dot', gallery)).toBeNull()
  })

  it('answers null for a well-formed but impossible id — isValidId gates the read', () => {
    expect(aboutPhotoIdOutsideGallery('chat.short', gallery)).toBeNull()
    expect(aboutPhotoIdOutsideGallery('chat.not-an-id-!!', gallery)).toBeNull()
  })
})

/**
 * The wiring, as source claims — `environment: 'node'` cannot render a server page or a client
 * component, so what is testable is the shape (`tests/nina.galleryDelete.test.ts`'s pattern, whose
 * claims are worded to rot loudly: each is a design decision someone could silently undo, asserted
 * on the exact spelling that decision ships as).
 */
describe('the about page resolves the miss on the server, as source claims', () => {
  const PAGE = 'app/nina/about/page.tsx'

  it('awaits the Next 16 searchParams promise under the generated helper', () => {
    const source = readRepoCode(PAGE)
    expect(source).toContain("PageProps<'/nina/about'>")
    expect(source).toContain('await searchParams')
  })

  it('gates the single-row read on the membership miss — no query when the gallery holds it', () => {
    const source = readRepoCode(PAGE)
    expect(source).toContain('aboutPhotoIdOutsideGallery(photoParam, gallery)')
    expect(source).toContain('deepLinkId === null')
  })

  it('strips description at the boundary — the row crosses only through galleryPhotos', () => {
    /* Invariant 5. `readRepoCode` strips comments, so this sees the CODE alone: the raw row
     * (`resolvedRow`, which carries `glm-4.6v`'s prose) never becomes a prop; the mapped value
     * does. */
    const source = readRepoCode(PAGE)
    expect(source).toContain('galleryPhotos([resolvedRow])')
    expect(source).toContain('resolvedPhoto={resolvedPhoto}')
    expect(source).not.toContain('description')
  })
})

describe('the screen renders the viewer over the merged list and the grid over the gallery', () => {
  const SCREEN = 'components/nina/NinaAboutScreen.tsx'

  it('derives every viewer list through aboutViewerLists', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toContain('aboutViewerLists({ album, gallery, resolvedChatPhoto })')
    expect(source).toContain('const resolvedChatPhoto = resolvedPhoto ?? null')
  })

  it('reads the open photo by index out of the SAME list the viewer shows', () => {
    /* The delete control and both sends key off `openChatPhoto`; if it read the raw gallery prop
     * while the viewer shows the merged list, the delete button would silently vanish for a
     * resolved out-of-window photo. */
    const source = readRepoCode(SCREEN)
    expect(source).toContain('viewerLists.chat[open.index]')
  })

  it('the Media grid keeps mapping the gallery prop — the URL never changes the grid', () => {
    /* Invariant 8. `viewerLists.chat` would typecheck here and still be the bug. */
    const source = readRepoCode(SCREEN)
    expect(source).toContain('cells={gallery.map(toCell)}')
  })

  it('parses the URL through the shared codec, and imports nothing from the attach grammar', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toContain('decodeAboutPhoto(searchParams.get(NINA_ABOUT_PHOTO_PARAM))')
    expect(source).not.toContain('@/lib/nina/attach')
  })
})

describe('the RETURN leg closes a deep-linked viewer onto its origin page, as source claims', () => {
  const PAGE = 'app/nina/about/page.tsx'
  const SCREEN = 'components/nina/NinaAboutScreen.tsx'

  it('the page decodes the leg on the server and hands it down', () => {
    /* Same boundary discipline as `resolvedPhoto`: decoded ONCE, on the server, so no client
     * code re-derives the sanitization and a second copy of the rule cannot appear. */
    const source = readRepoCode(PAGE)
    expect(source).toContain('decodeAboutReturnTo(returnParam)')
    expect(source).toContain('returnTo={returnTo}')
  })

  it('the close pushes the origin only AFTER the pushed gesture’s back()', () => {
    /* The order IS the design: a grid tap inside about must stay undoable by back(), even when a
     * hand-edited `?return=` sits in the URL — the origin answers where the DEEP LINK came from,
     * not "undo the last tap". Asserted positionally, so swapping the branches fails here. */
    const source = readRepoCode(SCREEN)
    const pushed = source.indexOf('if (pushedRef.current)')
    const origin = source.indexOf('if (returnTo)')
    const inplace = source.indexOf("window.history.replaceState(null, '', urlWithPhoto(null))")
    expect(pushed).toBeGreaterThanOrEqual(0)
    expect(origin).toBeGreaterThan(pushed)
    expect(inplace).toBeGreaterThan(origin)
    expect(source).toContain('router.push(returnTo)')
  })

  it('the origin prop stays optional and nullable — absence is the old close', () => {
    const source = readRepoCode(SCREEN)
    expect(source).toContain('returnTo?: string | null')
  })
})
