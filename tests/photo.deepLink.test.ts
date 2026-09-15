import { describe, expect, it } from 'vitest'

import { parsePhotoViewerSegments, photoViewerPath } from '@/lib/photos/pointer'

import { isClientModule, readRepoCode, repoFileExists } from './support/importGraph'

/**
 * R2's deep link: the shape of the route that serves it.
 *
 * The URL `/photo/<kind>/<id>` is a contract between two things that never import each other — the
 * push payload the duplicate-image notify helper mints (phase 1), and this route's DIRECTORY NAME.
 * A drift is otherwise SILENT: the worker navigates, the page refuses to parse, and the runner
 * lands on `/` with nothing logged anywhere. `lib/photos/pointer.test.ts` pins the codec; this file
 * pins the other end of it.
 */

/** 12 chars, so `isValidId` accepts it and `newId()` could have produced it. */
const ID = 'photoAAAAAAA'

const ROUTE = 'app/photo/[kind]/[id]/page.tsx'
const SCREEN = 'components/photo/PhotoDeepLinkScreen.tsx'

describe('the URL phase 1 mints is the URL this route is handed', () => {
  it('round-trips through the segments Next hands the page', () => {
    // What Next hands the page is the path split on '/', minus the leading empty segment and the
    // literal 'photo'. Asserting the round trip is what makes the builder and the route one thing.
    for (const kind of ['shot', 'avatar', 'image'] as const) {
      const [, base, kindSegment, idSegment] = photoViewerPath({ kind, id: ID }).split('/')
      expect(base).toBe('photo') // the literal segment this route's parent directory spells
      expect(parsePhotoViewerSegments(kindSegment, idSegment)).toEqual({ kind, id: ID })
    }
  })
})

describe('the route the href names', () => {
  it('exists at the path the builder spells', () => {
    expect(repoFileExists(ROUTE)).toBe(true)
  })

  it('opens with requireUserId and answers every miss with a redirect, never an error page', () => {
    const source = readRepoCode(ROUTE)
    expect(source).toContain('requireUserId')
    expect(source).toContain('redirect')
    // A stale notification naming a deleted photo must not paint an error screen — the argument
    // parseNinaPhotoParam's docstring makes for the other deep link.
    expect(source).not.toContain('notFound')
    expect(source).not.toContain('throw new')
  })

  it('reads each table through its own ownership-scoped point read', () => {
    const source = readRepoCode(ROUTE)
    expect(source).toContain('getRunPhoto')
    expect(source).toContain('getNinaAvatar')
    expect(source).toContain('getNinaMessageImage')
  })

  it("strips glm-4.6v's private image text before it can reach a prop (invariant 5)", () => {
    // Both Nina point reads project `description`; albumPhotos/galleryPhotos are the mappers that
    // drop it, and the route must not name the field itself.
    const source = readRepoCode(ROUTE)
    expect(source).toContain('albumPhotos')
    expect(source).toContain('galleryPhotos')
    expect(source).not.toContain('description')
  })

  it('is a Server Component that mounts the viewer through one client wrapper', () => {
    expect(isClientModule(ROUTE)).toBe(false)
    expect(isClientModule(SCREEN)).toBe(true)
    expect(readRepoCode(SCREEN)).toContain("from '@/components/ui/PhotoViewer'")
    // The one overlay stays the one overlay: this is a caller, never a second definition.
    expect(readRepoCode(SCREEN)).not.toContain('function PhotoViewer')
  })
})
