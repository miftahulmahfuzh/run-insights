import { describe, expect, it } from 'vitest'

import { readRepoCode, repoFileExists } from './support/importGraph'

/**
 * **The five structural claims F18 makes that no unit test can reach** (F18 §7).
 *
 * The arithmetic and the gesture rules are proven in `lib/photos/gallery.test.ts`, where they are
 * pure functions. What is left over is a set of claims about *shape* — one overlay and not two, a
 * handler that never calls `preventDefault`, a row that is no longer a single label — and those are
 * properties of the source, not of any one rendered scenario.
 *
 * Same reasoning, and the same helper, as `tests/ui.sheetFocus.test.ts`: this repo has no component
 * tests by design (`vitest.config.ts` runs `environment: 'node'` with an `include` matching
 * `*.test.ts` only), and a text scan proves the rule for every consumer rather than for the one
 * interaction a DOM test happened to simulate.
 *
 * Comments are stripped by `readRepoCode`, and that is load-bearing here more than anywhere: the
 * doc comment on `PhotoViewer` explains at length *why* it never calls `preventDefault`, and it
 * quotes the word. A scan of the raw file would fail its own explanation.
 */

const VIEWER = 'components/ui/PhotoViewer.tsx'
const STRIP = 'components/review/ScreenshotStrip.tsx'
const INCLUSION = 'components/share/PhotoInclusionList.tsx'
const PUBLIC_PAGE = 'app/(public)/s/[token]/page.tsx'

describe('there is exactly one full-screen image overlay', () => {
  it('lives in components/ui, where three screens can reach it', () => {
    expect(repoFileExists(VIEWER)).toBe(true)
    expect(readRepoCode(VIEWER)).toContain('export function PhotoViewer')
  })

  it('is no longer defined inside the review strip', () => {
    // It was module-private here, which is the whole reason card #8's four requests were one:
    // PhotoInclusionList could not reach it, and its prop type named this file's ReviewPhoto.
    // A second definition reappearing here is the drift this asserts against.
    const source = readRepoCode(STRIP)
    expect(source).not.toContain('function PhotoViewer')
    expect(source).toContain("from '@/components/ui/PhotoViewer'")
  })

  it('is opened by all three surfaces that show a screenshot', () => {
    const strip = readRepoCode(STRIP)
    // ScreenshotStrip (the top strip) and SheetSource (a sheet's evidence panel) both live in
    // this file, so two occurrences is the count that proves both got it.
    expect(strip.match(/<PhotoViewer/g)?.length).toBe(2)
    expect(readRepoCode(INCLUSION)).toContain('<PhotoViewer')
  })

  it('stays out of the public shared page, which has no lightbox on purpose', () => {
    // app/(public)/s/[token]/page.tsx is a Server Component with plain links, so a viewer gets the
    // platform's own image viewer — real pinch-zoom, real save, real back. Importing a client
    // overlay there would quietly take all three away.
    expect(readRepoCode(PUBLIC_PAGE)).not.toContain('PhotoViewer')
  })
})

describe('the swipe never fights the native pinch-zoom', () => {
  const source = readRepoCode(VIEWER)

  it('never calls preventDefault, on any handler', () => {
    // The load-bearing property. The pan container is `touch-action: pinch-zoom` so the browser
    // owns the two-finger zoom and the momentum panning; the handlers only READ the gesture and
    // change state. A follow-the-finger transform would need preventDefault on touchmove to stop
    // the container scrolling under the drag, and that call is what would swallow the zoom.
    expect(source).not.toContain('preventDefault')
  })

  it('still declares the container that gives the browser the zoom', () => {
    expect(source).toContain('touch-pinch-zoom')
  })

  it('feeds decideSwipe the MAXIMUM touch count, not the count at touchend', () => {
    // Rule 1 of decideSwipe only works if onTouchMove widens the count: a pinch whose second
    // finger lands after the first looks single-fingered at the end of the gesture.
    expect(source).toMatch(/Math\.max\(\s*drag\.current\.touches,\s*event\.touches\.length\s*\)/)
  })

  it('asks decideSwipe rather than deciding inline', () => {
    expect(source).toContain('decideSwipe(')
  })
})

describe('paging is circular, from both the swipe and the keyboard', () => {
  const source = readRepoCode(VIEWER)

  it('routes every page change through stepIndex', () => {
    expect(source).toContain('stepIndex(index, delta, photos.length)')
  })

  it('no longer clamps the arrow keys at either end', () => {
    // These two were the bug: `Math.min(index + 1, photos.length - 1)` and
    // `Math.max(index - 1, 0)`. Clamping is the opposite of circular, and clamping here while the
    // swipe wrapped would have been the same bug wearing a keyboard.
    expect(source).not.toMatch(/Math\.min\(\s*index/)
    expect(source).not.toMatch(/Math\.max\(\s*index/)
  })

  it('sends both arrow keys through the same pager as the swipe', () => {
    expect(source).toContain("event.key === 'ArrowRight') page(1)")
    expect(source).toContain("event.key === 'ArrowLeft') page(-1)")
  })
})

describe('a screenshot row has two targets, not one', () => {
  const source = readRepoCode(INCLUSION)

  it('no longer wraps the whole row in a label', () => {
    // The <label> wrapping thumbnail + text + checkbox is exactly WHY a tap anywhere toggled.
    // What is allowed is a label wrapping its own input, which is the implicit association that
    // makes the right-hand column work with no htmlFor/id pair.
    const labels = source.match(/<label[^>]*>/g) ?? []
    expect(labels.length).toBe(1)
    expect(source).toMatch(/<label className="flex w-\[72px\]/)
  })

  it('gives the zoom region its own button, which the old label could not contain', () => {
    // HTML forbids a <button> inside a <label>: a nested interactive control there has no defined
    // activation behaviour. That constraint, not taste, is why the row was restructured.
    expect(source).toContain('onClick={() => setViewing(index)}')
    const labelStart = source.indexOf('<label')
    expect(source.indexOf('<button', labelStart)).toBe(-1)
  })

  it('puts the padding on the button so the toggle spans the full row', () => {
    // With p-2.5 on the <li> instead, a 10px border round the row would belong to neither target.
    expect(source).toMatch(/<li[^>]*className="flex items-stretch rounded-field bg-paper-2"/)
    expect(source).toMatch(/flex min-w-0 flex-1 items-center gap-3 p-2\.5 text-left/)
  })

  it('opens the viewer over every row, so the swipe has somewhere to go', () => {
    expect(source).toContain('photos={viewerPhotos}')
    expect(source).toMatch(/photos\.map\(\(p\) => \(\{ url: p\.blobUrl, kind: p\.kind \}\)\)/)
  })
})

describe('the review thumbnail fills its tile', () => {
  const source = readRepoCode(STRIP)

  it('gives the tile a width of its own', () => {
    // Without this the tile is a flex item sized by its widest child, and the caption — a
    // variable-length SCREEN_KIND_LABEL — always won. That is both reported symptoms at once:
    // "Summary" made a wider tile than "Splits", and the w-auto image left bg-paper-2 showing.
    expect(source).toContain('w-[104px]')
  })

  it('constrains the image so object-cover has a box to cover', () => {
    // object-cover was ALREADY on this image before F18 and did nothing, because cover with an
    // unconstrained width has nothing to crop against. The pair is the fix; either alone is not.
    expect(source).toContain('size-[104px] object-cover object-top')
    expect(source).not.toContain('h-[104px] w-auto')
  })

  it('truncates the caption rather than letting it widen the tile', () => {
    expect(source).toMatch(/block truncate px-2 py-1\.5 text-center/)
  })

  it('leaves the sheet evidence panel at full aspect', () => {
    // SheetSource has no caption, so its tile IS the image width — no gutter, no uneven row, no
    // bug. And it is the panel a reviewer reads a split time off, so cropping half of it away to
    // make a square would remove the thing it exists to show.
    expect(source).toContain('h-[168px] w-auto object-cover')
  })
})
