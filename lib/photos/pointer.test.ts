import { describe, expect, it } from 'vitest'

import {
  isPhotoPointerKind,
  parsePhotoViewerSegments,
  photoViewerPath,
  PHOTO_POINTER_KINDS,
} from './pointer'

/**
 * ── WHY THIS FILE EXISTS AT ALL FOR A ONE-LINE TEMPLATE STRING ────────────────────────────────
 * Because four things must agree on it and only one of them can be type-checked against the
 * others: `photoViewerPath` writes it, `lib/push/duplicateImage.ts` ships it inside an encrypted
 * payload, `lib/service-worker.js` navigates to it with no type system at all, and phase 2's
 * `app/photo/[kind]/[id]/page.tsx` is a DIRECTORY NAME. A route directory renamed to `[type]` or
 * a path built as `/photos/...` produces no compile error anywhere — it produces a notification
 * that opens a 404. This test is the pin.
 */

const ID = 'aB3_xYz01234' // 12 chars from lib/id.ts's alphabet

describe('photoViewerPath — the notification click target', () => {
  it('is /photo/<kind>/<id>, for each of the three kinds', () => {
    expect(photoViewerPath({ kind: 'shot', id: ID })).toBe(`/photo/shot/${ID}`)
    expect(photoViewerPath({ kind: 'avatar', id: ID })).toBe(`/photo/avatar/${ID}`)
    expect(photoViewerPath({ kind: 'image', id: ID })).toBe(`/photo/image/${ID}`)
  })

  it('is same-origin, absolute-path, and has no trailing slash or query', () => {
    /* `NinaPushPayload.url`'s contract and `lib/service-worker.js`'s FALLBACK_URL both require a
     * path beginning with `/`. An absolute URL here would be silently replaced by `/nina`. */
    for (const kind of PHOTO_POINTER_KINDS) {
      const path = photoViewerPath({ kind, id: ID })
      expect(path.startsWith('/')).toBe(true)
      expect(path).not.toContain('://')
      expect(path).not.toContain('?')
      expect(path.endsWith('/')).toBe(false)
      expect(path.split('/')).toHaveLength(4) // '', 'photo', kind, id
    }
  })
})

describe('PHOTO_POINTER_KINDS', () => {
  it('is exactly the three tables, in a stable order — this order IS the lookup priority', () => {
    expect([...PHOTO_POINTER_KINDS]).toEqual(['shot', 'avatar', 'image'])
  })

  it('agrees with isPhotoPointerKind in both directions', () => {
    for (const kind of PHOTO_POINTER_KINDS) expect(isPhotoPointerKind(kind)).toBe(true)
    expect(isPhotoPointerKind('run')).toBe(false)
    expect(isPhotoPointerKind('photo')).toBe(false)
    expect(isPhotoPointerKind('')).toBe(false)
    expect(isPhotoPointerKind(undefined)).toBe(false)
    expect(isPhotoPointerKind(['shot'])).toBe(false)
  })
})

describe('parsePhotoViewerSegments — phase 2 route segments in, a pointer or null out', () => {
  it('round-trips everything photoViewerPath writes', () => {
    for (const kind of PHOTO_POINTER_KINDS) {
      const [, , rawKind, rawId] = photoViewerPath({ kind, id: ID }).split('/')
      expect(parsePhotoViewerSegments(rawKind, rawId)).toEqual({ kind, id: ID })
    }
  })

  it('refuses an unknown kind, a malformed id, and the wrong shapes — ALL as null, never a throw', () => {
    /* A miss must not be distinguishable from "not yours": the route that consumes this degrades
     * silently, the way `/nina?photo=` already does (lib/nina/attach.ts's parse docstring). */
    expect(parsePhotoViewerSegments('run', ID)).toBeNull()
    expect(parsePhotoViewerSegments('shot', 'too-short')).toBeNull()
    expect(parsePhotoViewerSegments('shot', `${ID}extra`)).toBeNull()
    expect(parsePhotoViewerSegments('shot', undefined)).toBeNull()
    expect(parsePhotoViewerSegments(['shot'], ID)).toBeNull()
    expect(parsePhotoViewerSegments('shot', ['a', 'b'])).toBeNull()
  })
})
