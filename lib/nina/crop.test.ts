import { describe, expect, it } from 'vitest'

import {
  NINA_CROP_IDENTITY,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
  clampCrop,
  cropForWrite,
  cropSpanPct,
  isIdentityCrop,
  maxCropOffset,
  ninaCropStyle,
  nudgeCrop,
  panCrop,
  resolveCrop,
  zoomCrop,
  zoomFactorForWheel,
} from './crop'

/** Her anchor, and therefore the shape of every generated and hand-uploaded photo so far. */
const PORTRAIT = { width: 1792, height: 2400 }
const LANDSCAPE = { width: 4000, height: 3000 }
const SQUARE = { width: 1024, height: 1024 }

describe('resolveCrop', () => {
  it('reads all-NULL as the identity — phase 1 s "no transform" row', () => {
    expect(resolveCrop({ scale: null, x: null, y: null })).toEqual(NINA_CROP_IDENTITY)
    expect(resolveCrop(null)).toEqual(NINA_CROP_IDENTITY)
    expect(resolveCrop(undefined)).toEqual(NINA_CROP_IDENTITY)
  })

  it('reads a PARTIAL triple as offsets of zero, not as an error', () => {
    expect(resolveCrop({ scale: 1.5, x: null, y: null })).toEqual({ scale: 1.5, x: 0, y: 0 })
    expect(resolveCrop({ scale: null, x: 40, y: -10 })).toEqual({ scale: 1, x: 40, y: -10 })
  })

  it('folds nonsense into the identity rather than throwing', () => {
    expect(resolveCrop({ scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: 0 })).toEqual(
      NINA_CROP_IDENTITY,
    )
    expect(resolveCrop({ scale: 0.25, x: 0, y: 0 }).scale).toBe(NINA_CROP_MIN_SCALE)
  })
})

describe('cropSpanPct — the aspect fit', () => {
  it('puts the SHORT edge at exactly 100% at cover scale', () => {
    expect(cropSpanPct(PORTRAIT, NINA_CROP_IDENTITY).widthPct).toBeCloseTo(100, 6)
    expect(cropSpanPct(PORTRAIT, NINA_CROP_IDENTITY).heightPct).toBeCloseTo(133.9286, 4)
    expect(cropSpanPct(LANDSCAPE, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 400 / 3,
      heightPct: 100,
    })
    expect(cropSpanPct(SQUARE, NINA_CROP_IDENTITY)).toEqual({ widthPct: 100, heightPct: 100 })
  })

  it('scales both axes together', () => {
    const span = cropSpanPct(PORTRAIT, { scale: 2, x: 0, y: 0 })
    expect(span.widthPct).toBeCloseTo(200, 6)
    expect(span.heightPct).toBeCloseTo(267.8571, 4)
  })

  it('degrades an unknown natural size to a square instead of dividing by zero', () => {
    expect(cropSpanPct({ width: null, height: null }, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
    expect(cropSpanPct({ width: 0, height: 900 }, NINA_CROP_IDENTITY)).toEqual({
      widthPct: 100,
      heightPct: 100,
    })
  })
})

describe('maxCropOffset — the image can never leave its frame', () => {
  it('allows NO horizontal travel on a portrait at cover scale', () => {
    expect(maxCropOffset(PORTRAIT, NINA_CROP_IDENTITY)).toEqual({ x: 0, y: 169 })
  })

  it('allows NO vertical travel on a landscape at cover scale', () => {
    expect(maxCropOffset(LANDSCAPE, NINA_CROP_IDENTITY)).toEqual({ x: 166, y: 0 })
  })

  it('pins a square at cover scale completely', () => {
    expect(maxCropOffset(SQUARE, NINA_CROP_IDENTITY)).toEqual({ x: 0, y: 0 })
  })

  it('opens up as the scale rises', () => {
    expect(maxCropOffset(PORTRAIT, { scale: 2, x: 0, y: 0 })).toEqual({ x: 500, y: 839 })
  })
})

describe('clampCrop', () => {
  it('holds the scale inside [1, MAX] and rounds to the column s three decimals', () => {
    expect(clampCrop(PORTRAIT, { scale: 0.2, x: 0, y: 0 }).scale).toBe(NINA_CROP_MIN_SCALE)
    expect(clampCrop(PORTRAIT, { scale: 99, x: 0, y: 0 }).scale).toBe(NINA_CROP_MAX_SCALE)
    expect(clampCrop(PORTRAIT, { scale: 1.23456, x: 0, y: 0 }).scale).toBe(1.235)
  })

  it('clamps offsets to the frame, symmetrically', () => {
    expect(clampCrop(PORTRAIT, { scale: 1, x: 900, y: 900 })).toEqual({ scale: 1, x: 0, y: 169 })
    expect(clampCrop(PORTRAIT, { scale: 1, x: -900, y: -900 })).toEqual({ scale: 1, x: 0, y: -169 })
  })

  it('clamps offsets against the NEW scale, not the old one', () => {
    // The regression this ordering exists to prevent: legal at 2x, illegal at 1x.
    expect(clampCrop(PORTRAIT, { scale: 1, x: 0, y: 800 }).y).toBe(169)
  })

  it('returns integer offsets, because the columns are integers', () => {
    const crop = clampCrop(PORTRAIT, { scale: 2, x: 12.6, y: -4.2 })
    expect(Number.isInteger(crop.x)).toBe(true)
    expect(crop).toEqual({ scale: 2, x: 13, y: -4 })
  })
})

describe('panCrop', () => {
  it('converts pointer px to thousandths of the frame and follows the pointer', () => {
    // 51.2px on a 512px frame is 100 thousandths; x is pinned at cover, y is free.
    expect(panCrop(PORTRAIT, { scale: 1, x: 0, y: 0 }, 51.2, 51.2, 512)).toEqual({
      scale: 1,
      x: 0,
      y: 100,
    })
    expect(panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 51.2, 0, 512).x).toBe(100)
  })

  it('is size-independent — the same fraction of any frame is the same crop', () => {
    const big = panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 128, 0, 512)
    const small = panCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 7, 0, 28)
    expect(big.x).toBe(250)
    expect(small.x).toBe(250)
  })

  it('is a no-op before the frame has been measured', () => {
    const crop = { scale: 2, x: 10, y: 10 }
    expect(panCrop(PORTRAIT, crop, 40, 40, 0)).toBe(crop)
    expect(panCrop(PORTRAIT, crop, 40, 40, Number.NaN)).toBe(crop)
  })
})

describe('zoomCrop', () => {
  it('scales the offsets with the zoom, so the frame centre holds still', () => {
    expect(zoomCrop(PORTRAIT, { scale: 1, x: 0, y: 100 }, 2)).toEqual({ scale: 2, x: 0, y: 200 })
  })

  it('pulls an offset back inside the frame when zooming OUT', () => {
    // y=800 is legal at 2x (max 839) and must not survive the return to 1x (max 169).
    expect(zoomCrop(PORTRAIT, { scale: 2, x: 0, y: 800 }, 0.5)).toEqual({ scale: 1, x: 0, y: 169 })
  })

  it('refuses a non-positive factor rather than inverting the image', () => {
    const crop = { scale: 2, x: 0, y: 0 }
    expect(zoomCrop(PORTRAIT, crop, 0)).toBe(crop)
    expect(zoomCrop(PORTRAIT, crop, -1)).toBe(crop)
  })
})

describe('zoomFactorForWheel', () => {
  it('zooms in on a negative delta and out on a positive one', () => {
    expect(zoomFactorForWheel(-100)).toBeCloseTo(1.284, 3)
    expect(zoomFactorForWheel(100)).toBeCloseTo(0.7788, 4)
    expect(zoomFactorForWheel(0)).toBe(1)
  })

  it('caps a momentum trackpad s huge delta at 2x / 0.5x per event', () => {
    expect(zoomFactorForWheel(-4000)).toBe(2)
    expect(zoomFactorForWheel(4000)).toBe(0.5)
    expect(zoomFactorForWheel(Number.NaN)).toBe(1)
  })
})

describe('nudgeCrop', () => {
  it('is the keyboard path to the same clamp', () => {
    expect(nudgeCrop(PORTRAIT, { scale: 2, x: 0, y: 0 }, 10, -10)).toEqual({
      scale: 2,
      x: 10,
      y: -10,
    })
    expect(nudgeCrop(PORTRAIT, { scale: 1, x: 0, y: 169 }, 0, 10).y).toBe(169)
  })
})

describe('ninaCropStyle — the one mapping', () => {
  it('renders the identity exactly as centred object-cover', () => {
    expect(ninaCropStyle(SQUARE, NINA_CROP_IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
      objectFit: 'cover',
    })
    expect(ninaCropStyle(PORTRAIT, NINA_CROP_IDENTITY)).toEqual({
      position: 'absolute',
      width: '100%',
      height: '133.9286%',
      left: '0%',
      top: '-16.9643%',
      objectFit: 'cover',
    })
  })

  it('moves the image right and down for positive offsets', () => {
    const style = ninaCropStyle(PORTRAIT, { scale: 2, x: 100, y: -200 })
    expect(style).toEqual({
      position: 'absolute',
      width: '200%',
      height: '267.8571%',
      left: '-40%', // 50 + 10 - 100
      top: '-103.9286%', // 50 - 20 - 133.9286
      objectFit: 'cover',
    })
  })

  it('always covers the frame for any clamped crop — the property that matters', () => {
    for (const natural of [PORTRAIT, LANDSCAPE, SQUARE, { width: 6000, height: 1000 }]) {
      for (const scale of [1, 1.001, 1.5, 2.75, 4]) {
        /* Tupled, not `number[][]`: `noUncheckedIndexedAccess` widens a destructured element of
         * a `number[]` to `number | undefined`, which `clampCrop` rightly refuses. */
        const offsets: ReadonlyArray<readonly [number, number]> = [
          [0, 0],
          [9999, 9999],
          [-9999, -9999],
          [9999, -9999],
        ]
        for (const [x, y] of offsets) {
          const crop = clampCrop(natural, { scale, x, y })
          const style = ninaCropStyle(natural, crop)
          const left = Number.parseFloat(style.left)
          const top = Number.parseFloat(style.top)
          const width = Number.parseFloat(style.width)
          const height = Number.parseFloat(style.height)
          expect(left).toBeLessThanOrEqual(0.0001)
          expect(top).toBeLessThanOrEqual(0.0001)
          expect(left + width).toBeGreaterThanOrEqual(99.9999)
          expect(top + height).toBeGreaterThanOrEqual(99.9999)
        }
      }
    }
  })
})

describe('cropForWrite', () => {
  it('writes an identity crop as three NULLs, so Reset needs no second query', () => {
    expect(cropForWrite(NINA_CROP_IDENTITY)).toEqual({ scale: null, x: null, y: null })
    expect(isIdentityCrop(NINA_CROP_IDENTITY)).toBe(true)
  })

  it('writes a real crop as itself', () => {
    expect(cropForWrite({ scale: 1.75, x: -120, y: 40 })).toEqual({ scale: 1.75, x: -120, y: 40 })
  })
})
