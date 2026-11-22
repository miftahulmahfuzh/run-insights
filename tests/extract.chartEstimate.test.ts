import { readFileSync } from 'node:fs'

import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { decodeToRgb } from '@/lib/extract/chart/decode'
import {
  estimateFromCharts,
  type ChartEstimateInput,
  type RgbImage,
} from '@/lib/extract/chart/estimate'

/**
 * The Workout Details chart estimator against the two real runs it was calibrated on
 * (`research/fixtures/workout-details/README.md`). Every test goes through the public contract
 * phase 3 consumes — `decodeToRgb` then `estimateFromCharts` — on the committed bytes: the 739 px
 * originals and the 560 px JPEG q80 re-encodes the browser actually uploads.
 */

const DIR = 'research/fixtures/workout-details'

const FRIDAY: ChartEstimateInput = {
  durationSec: 2773, // 0:46:13
  paceSlowestSecPerKm: 497, // 8'17"
  paceFastestSecPerKm: 365, // 6'05"
  hrMinBpm: 101,
  hrMaxBpm: 186,
  knownDistanceKm: null,
}
/** The Splits screen of the same run (2026-11-20-splits.png): 6.04 km. */
const FRIDAY_TRUTH = {
  distanceKm: 6.04,
  splitSec: [446, 468, 458, 450, 463, 466], // 7:26 7:48 7:38 7:30 7:43 7:46
  splitHr: [148, 158, 167, 174, 181, 180],
}

const SUNDAY: ChartEstimateInput = {
  durationSec: 3046, // 0:50:46
  paceSlowestSecPerKm: 552, // 9'12"
  paceFastestSecPerKm: 407, // 6'47"
  hrMinBpm: 116,
  hrMaxBpm: 177,
  knownDistanceKm: null,
}

async function load(path: string): Promise<RgbImage> {
  return decodeToRgb(readFileSync(path))
}

/** A copy of `image` with the rectangle [x0, x1) × [y0, y1) painted one colour. */
function paint(
  image: RgbImage,
  rect: { x0: number; y0: number; x1: number; y1: number },
  rgb: [number, number, number],
): RgbImage {
  const data = new Uint8Array(image.data)
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * image.width + x) * 3
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
    }
  }
  return { width: image.width, height: image.height, data }
}

/** Rows and columns measured at 739 px, scaled to `image`'s width. */
function at(image: RgbImage, px739: number): number {
  return Math.round((px739 * image.width) / 739)
}

const TEAL: [number, number, number] = [72, 230, 228]
const BACKGROUND: [number, number, number] = [28, 28, 30]

let images: Record<string, RgbImage>

beforeAll(async () => {
  images = {
    fridayJpeg: await load(`${DIR}/shipped/2026-11-20-details.jpg`),
    fridayPng: await load(`${DIR}/2026-11-20-details.png`),
    sundayJpeg: await load(`${DIR}/shipped/2026-11-22-details.jpg`),
    sundayPng: await load(`${DIR}/2026-11-22-details.png`),
    summaryPng: await load(`${DIR}/2026-11-20-summary.png`),
    summaryJpeg: await load(`${DIR}/shipped/2026-11-22-summary.jpg`),
    splitsJpeg: await load(`${DIR}/shipped/2026-11-20-splits.jpg`),
    heartrateJpeg: await load(`${DIR}/shipped/2026-11-20-heartrate.jpg`),
  }
})

describe('R2.2 — the 2026-11-20 run against its own Splits screen', () => {
  for (const [label, key] of [
    ['560 px JPEG q80 (what the browser uploads)', 'fridayJpeg'],
    ['739 px original PNG', 'fridayPng'],
  ] as const) {
    it(`${label}: distance within 2 %, every full km within 15 s and 3 bpm`, () => {
      const estimate = estimateFromCharts(images[key]!, FRIDAY)
      expect(estimate).not.toBeNull()
      if (estimate === null) return

      expect(Math.abs(estimate.distanceKm - FRIDAY_TRUTH.distanceKm)).toBeLessThanOrEqual(
        0.02 * FRIDAY_TRUTH.distanceKm,
      )
      expect(estimate.distanceWasEstimated).toBe(true)
      expect(estimate.slotCount).toBe(90)

      const full = estimate.splits.filter((s) => !s.partial)
      expect(full.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6])
      full.forEach((split, i) => {
        expect(Math.abs(split.timeSec - FRIDAY_TRUTH.splitSec[i]!)).toBeLessThanOrEqual(15)
        expect(split.paceSecPerKm).toBe(split.timeSec)
        expect(split.hrBpm).not.toBeNull()
        expect(Math.abs(split.hrBpm! - FRIDAY_TRUTH.splitHr[i]!)).toBeLessThanOrEqual(3)
      })
    })
  }
})

describe('R2.1 — the shape of an estimate', () => {
  it('ends with one partial row, cadence is always null, and the rows sum to the duration', () => {
    const estimate = estimateFromCharts(images.fridayJpeg!, FRIDAY)!
    const last = estimate.splits.at(-1)!
    expect(last.partial).toBe(true)
    expect(last.km).toBe(7)
    expect(estimate.splits.filter((s) => s.partial)).toHaveLength(1)
    expect(estimate.splits.every((s) => s.cadenceSpm === null)).toBe(true)
    expect(estimate.splits.every((s) => Number.isInteger(s.timeSec) && s.timeSec > 0)).toBe(true)
    expect(estimate.splits.reduce((sum, s) => sum + s.timeSec, 0)).toBe(FRIDAY.durationSec)
  })

  it('is deterministic: the same pixels and inputs give the same estimate', () => {
    expect(estimateFromCharts(images.fridayJpeg!, FRIDAY)).toEqual(
      estimateFromCharts(images.fridayJpeg!, FRIDAY),
    )
  })

  it('the 2026-11-22 run (no Splits screen) reads as ~6.1 km with six full splits', () => {
    for (const image of [images.sundayJpeg!, images.sundayPng!]) {
      const estimate = estimateFromCharts(image, SUNDAY)!
      expect(estimate.distanceKm).toBeGreaterThanOrEqual(5.9)
      expect(estimate.distanceKm).toBeLessThanOrEqual(6.3)
      expect(estimate.splits.filter((s) => !s.partial)).toHaveLength(6)
      for (const split of estimate.splits) {
        expect(split.hrBpm).toBeGreaterThanOrEqual(116)
        expect(split.hrBpm).toBeLessThanOrEqual(177)
      }
    }
  })

  it('a transcribed distance wins: speeds scale to it and distance is not estimated', () => {
    const estimate = estimateFromCharts(images.fridayJpeg!, { ...FRIDAY, knownDistanceKm: 6.04 })!
    expect(estimate.distanceKm).toBe(6.04)
    expect(estimate.distanceWasEstimated).toBe(false)
    // The 0.04 km remainder is below CHK-4's 0.05 km partial rule (lib/review/checks.ts), so it
    // is folded away: six full rows, no partial row, and no full row absorbs its seconds.
    expect(estimate.splits.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6])
    expect(estimate.splits.some((s) => s.partial)).toBe(false)
    const sum = estimate.splits.reduce((total, s) => total + s.timeSec, 0)
    expect(sum).toBeLessThan(FRIDAY.durationSec)
    expect(FRIDAY.durationSec - sum).toBeLessThanOrEqual(
      Math.ceil(0.05 * FRIDAY.paceSlowestSecPerKm),
    )
    estimate.splits.forEach((split, i) => {
      expect(Math.abs(split.timeSec - FRIDAY_TRUTH.splitSec[i]!)).toBeLessThanOrEqual(15)
    })
  })

  it('a remainder above 0.05 km keeps its partial row, priced on the real remainder', () => {
    // Unscaled Friday reads 6.08 km: remainder 0.08 km > 0.05.
    const estimate = estimateFromCharts(images.fridayJpeg!, FRIDAY)!
    const last = estimate.splits.at(-1)!
    expect(last.partial).toBe(true)
    const remainderKm = Math.round((estimate.distanceKm - 6) * 100) / 100
    expect(remainderKm).toBeGreaterThan(0.05)
    expect(
      Math.abs(last.paceSecPerKm - Math.round(last.timeSec / remainderKm)),
    ).toBeLessThanOrEqual(15)
  })

  it('without a printed HR range the splits carry no HR, and the distance is unchanged', () => {
    const withHr = estimateFromCharts(images.fridayJpeg!, FRIDAY)!
    const withoutHr = estimateFromCharts(images.fridayJpeg!, {
      ...FRIDAY,
      hrMinBpm: null,
      hrMaxBpm: null,
    })!
    expect(withoutHr.splits.every((s) => s.hrBpm === null)).toBe(true)
    expect(withoutHr.distanceKm).toBe(withHr.distanceKm)
    expect(withoutHr.splits.map((s) => s.timeSec)).toEqual(withHr.splits.map((s) => s.timeSec))
  })
})

describe('R2.4 — the estimator returns null, never throws', () => {
  it('for screens that are not Workout Details', () => {
    for (const key of ['summaryPng', 'summaryJpeg', 'splitsJpeg', 'heartrateJpeg'] as const) {
      expect(estimateFromCharts(images[key]!, FRIDAY)).toBeNull()
    }
  })

  it('for an inverted or zero-width pace range, and for a non-positive duration', () => {
    const image = images.fridayJpeg!
    const bad: ChartEstimateInput[] = [
      { ...FRIDAY, paceSlowestSecPerKm: 365, paceFastestSecPerKm: 497 },
      { ...FRIDAY, paceSlowestSecPerKm: 420, paceFastestSecPerKm: 420 },
      { ...FRIDAY, paceFastestSecPerKm: 0 },
      { ...FRIDAY, durationSec: 0 },
      { ...FRIDAY, durationSec: -60 },
      { ...FRIDAY, durationSec: Number.NaN },
    ]
    for (const input of bad) expect(estimateFromCharts(image, input)).toBeNull()
  })

  it('for an empty, inconsistent or noise image', () => {
    const noise = new Uint8Array(400 * 800 * 3)
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 256
    const cases: RgbImage[] = [
      { width: 0, height: 0, data: new Uint8Array(0) },
      { width: 10, height: 10, data: new Uint8Array(5) },
      { width: 400, height: 800, data: noise },
    ]
    for (const image of cases) {
      expect(() => estimateFromCharts(image, FRIDAY)).not.toThrow()
      expect(estimateFromCharts(image, FRIDAY)).toBeNull()
    }
  })
})

describe('the locator finds the pace chart by its shape, not by its rows', () => {
  for (const key of ['fridayJpeg', 'fridayPng'] as const) {
    it(`${key}: a wide, tall teal band where the route map was is ignored`, () => {
      const image = images[key]!
      const expected = estimateFromCharts(image, FRIDAY)
      // The committed fixtures have the map painted over (privacy). Paint the worst case back:
      // a solid teal block, then 70 thin teal stripes — many thin runs per row, like a bar chart,
      // but ~450 px tall at 739 px where the pace chart is under 100.
      const solid = paint(
        image,
        { x0: at(image, 30), y0: at(image, 210), x1: at(image, 710), y1: at(image, 660) },
        TEAL,
      )
      let striped = image
      for (let k = 0; k < 70; k++) {
        const x0 = at(image, 40 + k * 9)
        striped = paint(
          striped,
          { x0, y0: at(image, 210), x1: x0 + Math.max(2, at(image, 3)), y1: at(image, 660) },
          TEAL,
        )
      }
      expect(estimateFromCharts(solid, FRIDAY)).toEqual(expected)
      expect(estimateFromCharts(striped, FRIDAY)).toEqual(expected)
    })

    it(`${key}: with the pace chart erased, the Cadence chart below it is not taken instead`, () => {
      // 2026-11-20-details.png shows a Cadence chart under the pace chart, cut by the screen
      // edge and the home indicator. Erase the pace bars only; the Cadence bars stay.
      const image = images[key]!
      const erased = paint(
        image,
        { x0: 0, y0: at(image, 1318), x1: image.width, y1: at(image, 1416) },
        BACKGROUND,
      )
      expect(estimateFromCharts(erased, FRIDAY)).toBeNull()
    })
  }

  it('the teal "Average: …/KM" text alone is never read as the chart', () => {
    // 2026-11-22-details has no Cadence chart: with its bars erased, the only teal left is the
    // "Average: 0'00''/KM" line above them.
    const image = images.sundayJpeg!
    const erased = paint(
      image,
      { x0: 0, y0: at(image, 1318), x1: image.width, y1: at(image, 1416) },
      BACKGROUND,
    )
    expect(estimateFromCharts(erased, SUNDAY)).toBeNull()
  })
})

describe('decodeToRgb', () => {
  it('decodes the shipped JPEG and the original PNG to 3 bytes per pixel', () => {
    expect([images.fridayJpeg!.width, images.fridayJpeg!.height]).toEqual([560, 1212])
    expect([images.fridayPng!.width, images.fridayPng!.height]).toEqual([739, 1600])
    for (const image of [images.fridayJpeg!, images.fridayPng!]) {
      expect(image.data.length).toBe(image.width * image.height * 3)
    }
  })

  it('drops alpha and expands greyscale', async () => {
    const rgba = await sharp({
      create: {
        width: 4,
        height: 2,
        channels: 4,
        background: { r: 72, g: 230, b: 228, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()
    const grey = await sharp({
      create: { width: 3, height: 3, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .toColourspace('b-w')
      .png()
      .toBuffer()
    const a = await decodeToRgb(rgba)
    const g = await decodeToRgb(grey)
    expect(a.data.length).toBe(4 * 2 * 3)
    expect(g.data.length).toBe(3 * 3 * 3)
  })

  it('rejects bytes that are not an image', async () => {
    await expect(decodeToRgb(Buffer.from('not an image'))).rejects.toThrow()
  })
})
