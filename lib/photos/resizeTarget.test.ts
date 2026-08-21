import { describe, expect, it } from 'vitest'

import { TARGET_SHORT_EDGE_PX } from '@/lib/extract/constants'
import { longEdgeTargetFor, shortEdgeOf } from './resizeTarget'

/**
 * **The test the compressor exists for** (plan §3.1, Task 13, acceptance criterion 7).
 *
 * It asserts the arithmetic, not a decoded bitmap. `browser-image-compression` needs a DOM,
 * `Image`, `OffscreenCanvas` and a real JPEG encoder; Vitest here runs in `node` with no jsdom and
 * no `canvas` binding, so decoding the compressor's actual output is not reachable from this suite.
 * See §"Gaps" in the F04 execution record — the pixel-level assertion is a manual QA step, and it
 * is recorded as one rather than quietly claimed.
 *
 * What IS proven here is the whole of the bug: the compressor's only sizing decision is the number
 * this function returns, and every case below is a case that would have shipped a wrong-sized image.
 */
describe('the width-vs-long-edge trap', () => {
  it('a portrait screenshot lands its SHORT edge on the target, not its long edge', () => {
    // The canonical fixture: 739 × 1600. The naive `maxWidthOrHeight: 560` clamps the 1600 and
    // yields a ~259 px-wide image — outside the measured envelope entirely (the smallest width
    // ever scored was 460). This function must return the long-edge value instead.
    const target = longEdgeTargetFor(739, 1600, TARGET_SHORT_EDGE_PX)
    expect(target).toBe(1212) // 560 × 1600/739 = 1212.4

    // What the compressor then actually produces, verified against the ±5 px tolerance the plan
    // asks for: 1212 × (739/1600) = 559.8 → 560.
    const outWidth = Math.round(target * (739 / 1600))
    const outHeight = target
    expect(shortEdgeOf(outWidth, outHeight)).toBeGreaterThanOrEqual(TARGET_SHORT_EDGE_PX - 5)
    expect(shortEdgeOf(outWidth, outHeight)).toBeLessThanOrEqual(TARGET_SHORT_EDGE_PX + 5)
  })

  it('is never the naive value — the bug, stated as an assertion', () => {
    // If this ever passes, someone has "simplified" the compressor back to passing 560 straight
    // through, and every extraction after that point is reading an under-sized image with no
    // error anywhere in the pipeline.
    expect(longEdgeTargetFor(739, 1600, TARGET_SHORT_EDGE_PX)).not.toBe(TARGET_SHORT_EDGE_PX)
  })

  it('is symmetric in orientation, so a rotated capture is not blown up or shrunk wrongly', () => {
    // Should not happen for a Fitness-app screenshot, but a screen-rotated capture is possible.
    // Short edge is width in one branch and height in the other; the formula reads min/max, so
    // both land on 560.
    expect(longEdgeTargetFor(1600, 739, TARGET_SHORT_EDGE_PX)).toBe(1212)
  })

  it('handles every real iPhone screenshot geometry', () => {
    const geometries: Array<[number, number, number]> = [
      [1125, 2436, 1213], // iPhone X / XS at 3x
      [1242, 2688, 1212], // iPhone XS Max at 3x — the design target
      [828, 1792, 1212], // iPhone XR at 2x
      [1179, 2556, 1214], // iPhone 15 at 3x
      [739, 1600, 1212], // the canonical fixture, as captured
    ]
    for (const [w, h, expected] of geometries) {
      const target = longEdgeTargetFor(w, h, TARGET_SHORT_EDGE_PX)
      expect(target).toBe(expected)
      // Every one of them lands within a pixel of 560 on the short edge.
      expect(Math.round(target * (w / h))).toBeGreaterThanOrEqual(TARGET_SHORT_EDGE_PX - 5)
      expect(Math.round(target * (w / h))).toBeLessThanOrEqual(TARGET_SHORT_EDGE_PX + 5)
    }
  })

  it('never upscales a source that is already small enough', () => {
    // Interpolating a 300 px-wide image up to 560 invents detail the model would then read as if
    // it were real. Leave it alone.
    expect(longEdgeTargetFor(300, 650, TARGET_SHORT_EDGE_PX)).toBe(650)
    expect(longEdgeTargetFor(TARGET_SHORT_EDGE_PX, 1200, TARGET_SHORT_EDGE_PX)).toBe(1200)
  })

  it('handles a square image', () => {
    expect(longEdgeTargetFor(1000, 1000, TARGET_SHORT_EDGE_PX)).toBe(TARGET_SHORT_EDGE_PX)
  })

  it('refuses implausible dimensions rather than returning NaN', () => {
    // A zero here would come from a failed decode, and `maxWidthOrHeight: NaN` makes the library
    // behave unpredictably rather than fail — so this throws where the caller can report it.
    expect(() => longEdgeTargetFor(0, 1600, TARGET_SHORT_EDGE_PX)).toThrow(/implausible/)
    expect(() => longEdgeTargetFor(739, Number.NaN, TARGET_SHORT_EDGE_PX)).toThrow(/implausible/)
    expect(() => longEdgeTargetFor(-739, 1600, TARGET_SHORT_EDGE_PX)).toThrow(/implausible/)
  })
})
