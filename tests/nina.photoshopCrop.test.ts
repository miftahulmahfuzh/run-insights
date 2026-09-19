import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  NINA_IMAGE_ASPECT_RATIOS,
  nearestNinaImageAspectRatio,
  ninaImageAspectRatioValue,
} from '@/lib/nina/imagerecipe'
import {
  clampPhotoshopCrop,
  isFullFramePhotoshopCropBox,
  maxPhotoshopCropOffset,
  NINA_PHOTOSHOP_CROP_IDENTITY,
  NINA_PHOTOSHOP_CROP_KEY_STEP,
  NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET,
  NINA_PHOTOSHOP_CROP_MAX_SCALE,
  NINA_PHOTOSHOP_CROP_MIN_SCALE,
  ninaPhotoshopCropStyle,
  nudgePhotoshopCrop,
  panPhotoshopCrop,
  photoshopCropBox,
  photoshopCropSpanPct,
  resolvePhotoshopCrop,
  zoomPhotoshopCrop,
  type NinaPhotoshopCrop,
} from '@/lib/nina/photoshopCrop'

/**
 * The rectangle crop's arithmetic. R1 of the photoshop-aspect-ratio-crop plan set.
 *
 * `photoshopCropBox` gets the heaviest scrutiny in here on purpose: it is the one function whose
 * being wrong is invisible — an off-by-one crops the wrong region, the model happily re-renders it,
 * and nothing anywhere fails.
 */

const IDENTITY: NinaPhotoshopCrop = { ...NINA_PHOTOSHOP_CROP_IDENTITY }

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')
}

describe('the module stays loadable from a client component and from a strip-types script', () => {
  it('has no imports at all, and nothing server-only', () => {
    // `tests/nina.imageprefs.test.ts`'s assertion, for the same reason: `scripts/photoshop.ts` and
    // the image worker load lib/nina modules by relative path under --experimental-strip-types,
    // which resolves neither `server-only` nor the `@/` alias.
    const source = readSource('lib/nina/photoshopCrop.ts')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('server-only')
    expect(code).not.toContain('@/lib/')
    expect(code).not.toContain('require(')
  })

  it('imagerecipe.ts keeps its own zero-import property after the export', () => {
    const source = readSource('lib/nina/imagerecipe.ts')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
  })
})

describe('ninaImageAspectRatioValue — one enum, two questions', () => {
  it('resolves every catalogued label to its own ratio', () => {
    expect(NINA_IMAGE_ASPECT_RATIOS.length).toBe(23)
    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      expect(ninaImageAspectRatioValue(entry.label)).toBe(entry.ratio)
    }
  })

  it('spells the ratios the provider spells', () => {
    expect(ninaImageAspectRatioValue('5:4')).toBe(1.25)
    expect(ninaImageAspectRatioValue('16:9')).toBe(16 / 9)
    expect(ninaImageAspectRatioValue('2.35:1')).toBe(2.35)
  })

  it('is null for anything not in the table, including near misses', () => {
    // Exact match only: the label goes on the wire verbatim as `aspect_ratio`, so anything this
    // accepts must be something the provider accepts. This is also phase 4's closed-set check.
    expect(ninaImageAspectRatioValue('auto')).toBeNull()
    expect(ninaImageAspectRatioValue('5:4 ')).toBeNull()
    expect(ninaImageAspectRatioValue('5x4')).toBeNull()
    expect(ninaImageAspectRatioValue('')).toBeNull()
    expect(ninaImageAspectRatioValue('1:3')).toBeNull()
  })

  it('agrees with the default the crop step opens on', () => {
    // Phase 5 opens the picker on `nearestNinaImageAspectRatio`'s pick; that label must therefore
    // always be one this function can price.
    expect(ninaImageAspectRatioValue(nearestNinaImageAspectRatio(832, 732))).toBe(1.25)
    expect(ninaImageAspectRatioValue(nearestNinaImageAspectRatio(768, 1024))).toBe(0.75)
    for (const [w, h] of [
      [832, 732],
      [4000, 3000],
      [1080, 1920],
      [5000, 417],
    ] as const) {
      expect(ninaImageAspectRatioValue(nearestNinaImageAspectRatio(w, h))).not.toBeNull()
    }
  })
})

describe('resolvePhotoshopCrop — a row, however partial, becomes a usable crop', () => {
  it('reads nothing at all as the identity', () => {
    expect(resolvePhotoshopCrop(null)).toEqual(IDENTITY)
    expect(resolvePhotoshopCrop(undefined)).toEqual(IDENTITY)
    expect(resolvePhotoshopCrop({ scale: null, x: null, y: null })).toEqual(IDENTITY)
  })

  it('reads a partial triple as the identity in the missing parts', () => {
    expect(resolvePhotoshopCrop({ scale: 2, x: null, y: null })).toEqual({ scale: 2, x: 0, y: 0 })
    expect(resolvePhotoshopCrop({ scale: null, x: 120, y: -40 })).toEqual({
      scale: NINA_PHOTOSHOP_CROP_MIN_SCALE,
      x: 120,
      y: -40,
    })
  })

  it('folds garbage into the identity rather than throwing', () => {
    expect(
      resolvePhotoshopCrop({ scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: -0.4 }),
    ).toEqual({ scale: NINA_PHOTOSHOP_CROP_MIN_SCALE, x: 0, y: -0 })
    expect(resolvePhotoshopCrop({ scale: 0.25, x: 0, y: 0 }).scale).toBe(
      NINA_PHOTOSHOP_CROP_MIN_SCALE,
    )
  })

  it('rounds offsets to the integer the column stores', () => {
    expect(resolvePhotoshopCrop({ scale: 1, x: 12.4, y: -7.6 })).toEqual({ scale: 1, x: 12, y: -8 })
  })
})

describe('photoshopCropSpanPct — the aspect fit against a RECTANGLE', () => {
  it('is exactly {100, 100} when the source already is the target ratio', () => {
    expect(photoshopCropSpanPct({ width: 768, height: 1024 }, 0.75, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(photoshopCropSpanPct({ width: 1000, height: 1000 }, 1, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })

  it('overflows the wide axis when the source is wider than the frame', () => {
    // 4000x3000 into a square: the height fits, the width overflows by 4/3. Divided once, so it is
    // exactly 400/3 and the preview and the pixel box agree in the last digit.
    expect(photoshopCropSpanPct({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      widthPct: 400 / 3,
      heightPct: 100,
    })
  })

  it('overflows the tall axis when the source is narrower than the frame', () => {
    // The runner's live source, 832x732 (1.137), into 5:4 (1.25): the width fits, the height
    // overflows by 1.25 / 1.137.
    expect(photoshopCropSpanPct({ width: 832, height: 732 }, 1.25, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: (732 * 1.25 * 100) / 832,
    })
  })

  it('scales both axes with the scale', () => {
    expect(
      photoshopCropSpanPct({ width: 4000, height: 3000 }, 1, { scale: 2, x: 0, y: 0 }),
    ).toEqual({ widthPct: 800 / 3, heightPct: 200 })
  })

  it('degrades to plain cover for an unknown size or an unusable ratio', () => {
    expect(photoshopCropSpanPct({ width: null, height: null }, 1, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(photoshopCropSpanPct({ width: 800, height: 600 }, 0, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(photoshopCropSpanPct({ width: 800, height: 600 }, Number.NaN, IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })
})

describe('maxPhotoshopCropOffset — the axis that already fits cannot slide', () => {
  it('gives zero slack on the fitting axis and real slack on the overflowing one', () => {
    expect(maxPhotoshopCropOffset({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      x: 166,
      y: 0,
    })
    expect(maxPhotoshopCropOffset({ width: 832, height: 732 }, 1.25, IDENTITY)).toEqual({
      x: 0,
      y: 49,
    })
  })

  it('gives slack on both axes once zoomed past cover', () => {
    expect(
      maxPhotoshopCropOffset({ width: 4000, height: 3000 }, 1, { scale: 2, x: 0, y: 0 }),
    ).toEqual({ x: 833, y: 500 })
  })

  it('is zero on both axes for a source that already is the target ratio', () => {
    expect(maxPhotoshopCropOffset({ width: 768, height: 1024 }, 0.75, IDENTITY)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('never exceeds the Server Action’s dimension-free ceiling for a catalogued ratio', () => {
    // Phase 4 bounds an untrusted offset before it knows the source's size; that bound must not be
    // tighter than anything this module can legitimately produce.
    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      const limit = maxPhotoshopCropOffset({ width: 5000, height: 417 }, entry.ratio, {
        scale: NINA_PHOTOSHOP_CROP_MAX_SCALE,
        x: 0,
        y: 0,
      })
      expect(limit.x).toBeLessThanOrEqual(NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET)
      expect(limit.y).toBeLessThanOrEqual(NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET)
    }
  })
})

describe('clampPhotoshopCrop — the only way a crop becomes valid', () => {
  const source = { width: 4000, height: 3000 }

  it('holds the scale inside [MIN, MAX] and rounds it to the column’s three decimals', () => {
    expect(clampPhotoshopCrop(source, 1, { scale: 0.2, x: 0, y: 0 }).scale).toBe(
      NINA_PHOTOSHOP_CROP_MIN_SCALE,
    )
    expect(clampPhotoshopCrop(source, 1, { scale: 99, x: 0, y: 0 }).scale).toBe(
      NINA_PHOTOSHOP_CROP_MAX_SCALE,
    )
    expect(clampPhotoshopCrop(source, 1, { scale: 1.23456, x: 0, y: 0 }).scale).toBe(1.235)
  })

  it('clamps the offsets against the NEW scale, not the old one', () => {
    // Zooming out to cover must pull the offsets back in the same call, or the frame shows a corner
    // of background while the stored triple still looks legal.
    expect(clampPhotoshopCrop(source, 1, { scale: 1, x: 800, y: 400 })).toEqual({
      scale: 1,
      x: 166,
      y: 0,
    })
  })

  it('clamps symmetrically in the negative direction and never stores -0', () => {
    const clamped = clampPhotoshopCrop(source, 1, { scale: 1, x: -800, y: -400 })
    expect(clamped).toEqual({ scale: 1, x: -166, y: 0 })
    expect(Object.is(clamped.y, -0)).toBe(false)
  })

  it('folds non-finite input into something storable', () => {
    expect(
      clampPhotoshopCrop(source, 1, {
        scale: Number.NaN,
        x: Number.POSITIVE_INFINITY,
        y: Number.NaN,
      }),
    ).toEqual({ scale: 1, x: 166, y: 0 })
  })
})

describe('pan, zoom and nudge all land on the same clamp', () => {
  const source = { width: 4000, height: 3000 }

  it('converts a pointer drag into stored units per axis', () => {
    // A 500 px-wide frame at 1:1 is 500 px tall, so 50 px is 100 thousandths on either axis.
    expect(panPhotoshopCrop(source, 1, IDENTITY, 50, 50, 500)).toEqual({ scale: 1, x: 100, y: 0 })
  })

  it('uses the frame’s HEIGHT for the y unit, which is what makes the rectangle work', () => {
    // A 500 px-wide frame at 2:1 is 250 px tall, so the same 50 px drag is 200 thousandths of the
    // frame's height. A module that used the frame's width for y (crop.ts's convention, which is
    // only legal for a square) would say 100 here and the preview would drift from the pixel box.
    const panned = panPhotoshopCrop({ width: 1000, height: 1000 }, 2, IDENTITY, 0, 50, 500)
    expect(panned.y).toBe(200)
  })

  it('returns the crop untouched before the frame has been measured', () => {
    expect(panPhotoshopCrop(source, 1, IDENTITY, 50, 50, 0)).toEqual(IDENTITY)
    expect(panPhotoshopCrop(source, 1, IDENTITY, 50, 50, Number.NaN)).toEqual(IDENTITY)
    expect(panPhotoshopCrop(source, 0, IDENTITY, 50, 50, 500)).toEqual(IDENTITY)
  })

  it('zooms about the frame centre, carrying the offsets with the scale', () => {
    const zoomed = zoomPhotoshopCrop(source, 1, { scale: 1, x: 100, y: 0 }, 2)
    expect(zoomed).toEqual({ scale: 2, x: 200, y: 0 })
  })

  it('never zooms below cover or above the ceiling', () => {
    expect(zoomPhotoshopCrop(source, 1, IDENTITY, 0.1).scale).toBe(NINA_PHOTOSHOP_CROP_MIN_SCALE)
    expect(zoomPhotoshopCrop(source, 1, { scale: 3, x: 0, y: 0 }, 10).scale).toBe(
      NINA_PHOTOSHOP_CROP_MAX_SCALE,
    )
    expect(zoomPhotoshopCrop(source, 1, IDENTITY, 0)).toEqual(IDENTITY)
    expect(zoomPhotoshopCrop(source, 1, IDENTITY, Number.NaN)).toEqual(IDENTITY)
  })

  it('nudges by the key step and stops at the clamp', () => {
    expect(nudgePhotoshopCrop(source, 1, IDENTITY, NINA_PHOTOSHOP_CROP_KEY_STEP, 0)).toEqual({
      scale: 1,
      x: 10,
      y: 0,
    })
    // The y axis already fits at cover: an arrow press there is a no-op, not a sliver of background.
    expect(nudgePhotoshopCrop(source, 1, IDENTITY, 0, NINA_PHOTOSHOP_CROP_KEY_STEP)).toEqual(
      IDENTITY,
    )
    expect(nudgePhotoshopCrop(source, 1, { scale: 1, x: 160, y: 0 }, 100, 0).x).toBe(166)
  })
})

describe('ninaPhotoshopCropStyle — the preview the operator frames against', () => {
  it('is plain centred cover for a source that already is the target ratio', () => {
    expect(ninaPhotoshopCropStyle({ width: 768, height: 1024 }, 0.75, IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      objectFit: 'cover',
    })
  })

  it('centres the overflow of a wider source in a square frame', () => {
    expect(ninaPhotoshopCropStyle({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      position: 'absolute',
      width: '133.3333%',
      height: '100%',
      left: '-16.6667%',
      top: '0%',
      objectFit: 'cover',
    })
  })

  it('moves the image by a tenth of a percent per stored unit, per axis', () => {
    const style = ninaPhotoshopCropStyle({ width: 4000, height: 3000 }, 1, {
      scale: 1,
      x: 100,
      y: 0,
    })
    expect(style.left).toBe('-6.6667%')
  })

  it('agrees with the pixel box on the same window', () => {
    // The property that stops the operator framing one rectangle and the model receiving another:
    // the left edge the CSS puts on screen, read back as a fraction of the image, is the left edge
    // the pixel box names.
    const source = { width: 4000, height: 3000 }
    const crop: NinaPhotoshopCrop = { scale: 2, x: 300, y: -200 }
    const style = ninaPhotoshopCropStyle(source, 1, crop)
    const box = photoshopCropBox(source, 1, crop)!
    const widthPct = Number.parseFloat(style.width)
    const leftPct = Number.parseFloat(style.left)
    expect(Math.round((source.width * -leftPct) / widthPct)).toBe(box.left)
    expect(Math.round((source.width * 100) / widthPct)).toBe(box.width)
  })
})

describe('photoshopCropBox — the function whose being wrong is invisible', () => {
  it('takes the largest centred rectangle at the target ratio, identity crop', () => {
    // 4000x3000 to a square: 3000x3000, centred horizontally, both edges inside the file.
    expect(photoshopCropBox({ width: 4000, height: 3000 }, 1, IDENTITY)).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    })
  })

  it('is the whole file when the source already is the target ratio', () => {
    const source = { width: 768, height: 1024 }
    const box = photoshopCropBox(source, 0.75, IDENTITY)!
    expect(box).toEqual({ left: 0, top: 0, width: 768, height: 1024 })
    expect(isFullFramePhotoshopCropBox(source, box)).toBe(true)
  })

  it('crops the runner’s live source to an exact 5:4, which is the whole point', () => {
    // 832x732 (1.137) is the source that came back ~10% wide through the nearest-bucket path.
    // 832 / 1.25 = 665.6, so the box is 832x666 at the top of the frame's vertical slack.
    const source = { width: 832, height: 732 }
    const box = photoshopCropBox(source, 1.25, IDENTITY)!
    expect(box).toEqual({ left: 0, top: 33, width: 832, height: 666 })
    expect(isFullFramePhotoshopCropBox(source, box)).toBe(false)
    expect(Math.abs(box.width / box.height - 1.25)).toBeLessThan(0.002)
  })

  it('shrinks the window around the frame centre as the scale grows', () => {
    // Zoom 2x on a square frame: half the window, still centred on the image's own centre.
    expect(photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 2, x: 0, y: 0 })).toEqual({
      left: 1250,
      top: 750,
      width: 1500,
      height: 1500,
    })
    expect(photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 4, x: 0, y: 0 })).toEqual({
      left: 1625,
      top: 1125,
      width: 750,
      height: 750,
    })
  })

  it('moves the window with the offsets, in the opposite direction to the image', () => {
    // The image moves right when x grows, so the WINDOW moves left over the source.
    const right = photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 2, x: 200, y: 0 })!
    const left = photoshopCropBox({ width: 4000, height: 3000 }, 1, { scale: 2, x: -200, y: 0 })!
    expect(right.left).toBeLessThan(1250)
    expect(left.left).toBeGreaterThan(1250)
    expect(right.width).toBe(1500)
    expect(left.width).toBe(1500)
  })

  it('stays inside the file at the extreme of the pan, on both sides', () => {
    // The clamp's own limit, driven past on purpose. This is the case that throws inside
    // sharp().extract() if the arithmetic is a pixel out.
    const source = { width: 4000, height: 3000 }
    const far = photoshopCropBox(source, 1, { scale: 1, x: 9_999, y: 9_999 })!
    const near = photoshopCropBox(source, 1, { scale: 1, x: -9_999, y: -9_999 })!
    expect(far).toEqual({ left: 2, top: 0, width: 3000, height: 3000 })
    expect(near).toEqual({ left: 998, top: 0, width: 3000, height: 3000 })
    expect(far.left + far.width).toBeLessThanOrEqual(source.width)
    expect(near.left + near.width).toBeLessThanOrEqual(source.width)
  })

  it('crops the other axis for a portrait target, and an odd source size', () => {
    expect(photoshopCropBox({ width: 1001, height: 1001 }, 21 / 9, IDENTITY)).toEqual({
      left: 0,
      top: 286,
      width: 1001,
      height: 429,
    })
    expect(photoshopCropBox({ width: 1001, height: 1001 }, 9 / 21, IDENTITY)).toEqual({
      left: 286,
      top: 0,
      width: 429,
      height: 1001,
    })
  })

  it('floors a fractional natural size rather than naming a row that is not there', () => {
    expect(photoshopCropBox({ width: 4000.7, height: 3000.9 }, 1, IDENTITY)).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    })
  })

  it('is null when there is nothing to crop', () => {
    expect(photoshopCropBox({ width: null, height: null }, 1, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 0, height: 100 }, 1, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 100, height: -5 }, 1, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 100, height: 100 }, 0, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 100, height: 100 }, Number.NaN, IDENTITY)).toBeNull()
  })

  it('is null rather than a wrong-ratio box when the window is under a pixel', () => {
    // A 3x2 thumbnail cannot hold an 8:1 rectangle. Returning a 1x1 box would be a crop at the
    // wrong ratio, which is the exact failure this whole feature exists to remove; the caller
    // treats null as "no crop" and the job runs as it does today.
    expect(photoshopCropBox({ width: 3, height: 2 }, 8, IDENTITY)).toBeNull()
    expect(photoshopCropBox({ width: 1, height: 1 }, 8, IDENTITY)).toBeNull()
  })

  it('clamps a crop it was handed unclamped', () => {
    // Phase 3 reads these numbers out of a row a browser wrote days earlier. The box must be the
    // same whether or not the caller remembered to clamp first.
    const source = { width: 4000, height: 3000 }
    const wild: NinaPhotoshopCrop = { scale: 99, x: 50_000, y: -50_000 }
    expect(photoshopCropBox(source, 1, wild)).toEqual(
      photoshopCropBox(source, 1, clampPhotoshopCrop(source, 1, wild)),
    )
  })
})

describe('photoshopCropBox holds its two invariants across the whole enum', () => {
  const sources = [
    [832, 732],
    [4000, 3000],
    [1001, 999],
    [768, 1024],
    [1920, 1080],
    [100, 100],
    [2048, 2048],
    [5000, 417],
    [417, 5000],
  ] as const
  const crops: readonly NinaPhotoshopCrop[] = [
    { scale: 1, x: 0, y: 0 },
    { scale: 1.5, x: 200, y: -300 },
    { scale: 4, x: 9_999, y: -9_999 },
    { scale: 2.75, x: -50, y: 75 },
  ]

  it('never names a region outside the source, for any catalogued ratio', () => {
    for (const [width, height] of sources) {
      for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
        for (const crop of crops) {
          const box = photoshopCropBox({ width, height }, entry.ratio, crop)
          if (box == null) continue
          const where = `${width}x${height} @${entry.label} ${JSON.stringify(crop)}`
          expect(Number.isInteger(box.left), where).toBe(true)
          expect(Number.isInteger(box.top), where).toBe(true)
          expect(Number.isInteger(box.width), where).toBe(true)
          expect(Number.isInteger(box.height), where).toBe(true)
          expect(box.left, where).toBeGreaterThanOrEqual(0)
          expect(box.top, where).toBeGreaterThanOrEqual(0)
          expect(box.width, where).toBeGreaterThanOrEqual(1)
          expect(box.height, where).toBeGreaterThanOrEqual(1)
          expect(box.left + box.width, where).toBeLessThanOrEqual(width)
          expect(box.top + box.height, where).toBeLessThanOrEqual(height)
        }
      }
    }
  })

  it('lands within half a pixel of the target ratio on the derived axis', () => {
    // An integer rectangle cannot hit every ratio exactly (832 px at 5:4 wants 665.6 px). The bound
    // the rounding guarantees is half a pixel on the derived axis; this states it as a ratio.
    for (const [width, height] of sources) {
      for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
        for (const crop of crops) {
          const box = photoshopCropBox({ width, height }, entry.ratio, crop)
          if (box == null) continue
          const where = `${width}x${height} @${entry.label} ${JSON.stringify(crop)}`
          const error = Math.abs(box.width / box.height - entry.ratio)
          expect(error, where).toBeLessThanOrEqual(entry.ratio / Math.min(box.width, box.height))
        }
      }
    }
  })

  it('is a no-op box exactly when the source already is the target ratio', () => {
    for (const entry of NINA_IMAGE_ASPECT_RATIOS) {
      // A source built to BE this ratio, at the identity crop, must come back as the whole file.
      const width = 2000
      const height = Math.round(width / entry.ratio)
      const box = photoshopCropBox({ width, height }, entry.ratio, IDENTITY)!
      expect(isFullFramePhotoshopCropBox({ width, height }, box), entry.label).toBe(true)
    }
  })
})

describe('isFullFramePhotoshopCropBox', () => {
  it('is false as soon as any edge has moved', () => {
    const source = { width: 4000, height: 3000 }
    expect(
      isFullFramePhotoshopCropBox(source, { left: 0, top: 0, width: 4000, height: 3000 }),
    ).toBe(true)
    expect(
      isFullFramePhotoshopCropBox(source, { left: 1, top: 0, width: 3999, height: 3000 }),
    ).toBe(false)
    expect(
      isFullFramePhotoshopCropBox(source, { left: 0, top: 0, width: 4000, height: 2999 }),
    ).toBe(false)
  })

  it('is false when the source size is unknown', () => {
    expect(
      isFullFramePhotoshopCropBox(
        { width: null, height: null },
        {
          left: 0,
          top: 0,
          width: 4000,
          height: 3000,
        },
      ),
    ).toBe(false)
  })
})
