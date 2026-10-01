import { describe, expect, it } from 'vitest'

import {
  NINA_PHOTO_STALL_DEADLINE_MS,
  NINA_PHOTO_STALL_GAP_MS,
  NINA_PHOTO_STALL_MAX,
  NINA_PHOTO_STALL_RESERVE_MS,
  NINA_PHOTO_STALL_STEERS,
  NINA_PHOTO_STALL_INSTRUCTION,
  ninaPhotoStallSteer,
  shouldStallAgain,
  stallBudgetLeft,
} from '@/lib/nina/imagestall'
import { NINA_TURN_STALE_MS } from '@/lib/nina/turnflight'

/**
 * Task #76, the pure half: the copy, the four constants, and the stop rule.
 *
 * Everything here runs with no database, no model and no clock — which is the point of the module
 * being pure. `tests/nina.photostall.test.ts` drives the loop that reads these.
 */

describe('the stall steers (R4)', () => {
  it('offers three distinct steers, not three paraphrases of one', () => {
    expect(NINA_PHOTO_STALL_STEERS).toHaveLength(3)
    expect(new Set(NINA_PHOTO_STALL_STEERS).size).toBe(3)
  })

  /*
   * The runner's own three examples are three different STORIES about where the photograph is —
   * already taken and being looked for, lost, not taken yet. A set of paraphrases would make the
   * model write one bubble three ways, which is the thing R4 exists to stop, so the axis is
   * asserted rather than the wording.
   */
  it('covers the three stories the card asked for', () => {
    const all = NINA_PHOTO_STALL_STEERS.join(' | ').toLowerCase()
    expect(all).toContain('album')
    expect(all).toContain('cannot find')
    expect(all).toContain('take the photo right now')
  })

  it('never asserts anything about the picture she has not seen', () => {
    for (const steer of NINA_PHOTO_STALL_STEERS) {
      expect(steer.toLowerCase()).not.toContain('describe')
      expect(steer).not.toMatch(/\b(wearing|running|smiling|outfit)\b/i)
    }
  })

  it('picks deterministically by job id, so a job read twice says the same thing', () => {
    expect(ninaPhotoStallSteer('job-abc')).toBe(ninaPhotoStallSteer('job-abc'))
    expect(NINA_PHOTO_STALL_STEERS).toContain(ninaPhotoStallSteer('job-abc'))
  })

  it('does not collapse to one steer across ids', () => {
    const picked = new Set(Array.from({ length: 60 }, (_, i) => ninaPhotoStallSteer(`job-${i}`)))
    expect(picked.size).toBeGreaterThan(1)
  })
})

describe('the filler instruction', () => {
  /* Each of the four prohibitions has a failure behind it — see the module header. */
  it('carries all four prohibitions and the one positive instruction', () => {
    const text = NINA_PHOTO_STALL_INSTRUCTION
    expect(text).toContain('Do NOT mention the photo')
    expect(text).toContain('Do NOT describe the photo')
    expect(text).toContain('Do not promise a time')
    expect(text).toContain('Do not take another photo')
    expect(text).toContain('Ask him something he has to answer')
  })
})

describe('the constants', () => {
  /*
   * THE PAIRING THAT BITES. The stall works by holding the dispatching turn's `nina_turns` chat
   * claim open, and a claim older than `NINA_TURN_STALE_MS` is swept as dead — at which point the
   * poll stops believing it and every filler after that lands unobserved. Raise the deadline past
   * the stale window and the feature silently half-works, which is the direction worth failing on.
   */
  it('finishes before a held-open chat claim is swept as dead', () => {
    expect(NINA_PHOTO_STALL_DEADLINE_MS).toBeLessThan(NINA_TURN_STALE_MS)
  })

  /* A reserve bigger than the deadline would mean no filler ever starts. */
  it('leaves room for at least one filler', () => {
    expect(NINA_PHOTO_STALL_RESERVE_MS).toBeLessThan(NINA_PHOTO_STALL_DEADLINE_MS)
    expect(NINA_PHOTO_STALL_GAP_MS).toBeLessThan(NINA_PHOTO_STALL_RESERVE_MS)
  })

  it('caps the fillers at a number a person would not exceed', () => {
    expect(NINA_PHOTO_STALL_MAX).toBe(2)
  })
})

describe('shouldStallAgain', () => {
  const go = {
    jobOpen: true,
    newestRowIsHis: false,
    elapsedMs: 10_000,
    emitted: 0,
  }

  it('goes when the camera is running, he is quiet, and there is time', () => {
    expect(shouldStallAgain(go)).toEqual({ go: true })
  })

  it('stops when the photograph (or the apology) has landed', () => {
    expect(shouldStallAgain({ ...go, jobOpen: false })).toEqual({
      go: false,
      reason: 'job-closed',
    })
  })

  /*
   * The one that must never be wrong: the chain at the bottom of `runNinaBackgroundTurn` is
   * already opening a turn for his message, and a filler emitted now talks over an answer he is
   * waiting for. It is also the success case — the filler asked him something and he replied.
   */
  it('stops the moment the newest row is his', () => {
    expect(shouldStallAgain({ ...go, newestRowIsHis: true })).toEqual({
      go: false,
      reason: 'he-spoke',
    })
  })

  it('stops at the cap', () => {
    expect(shouldStallAgain({ ...go, emitted: NINA_PHOTO_STALL_MAX })).toEqual({
      go: false,
      reason: 'enough',
    })
  })

  it('stops when a whole filler no longer fits before the deadline', () => {
    const tooLate = NINA_PHOTO_STALL_DEADLINE_MS - NINA_PHOTO_STALL_RESERVE_MS + 1
    expect(shouldStallAgain({ ...go, elapsedMs: tooLate })).toEqual({
      go: false,
      reason: 'out-of-time',
    })
    expect(shouldStallAgain({ ...go, elapsedMs: tooLate - 1 })).toEqual({ go: true })
  })

  /*
   * The free half, which the loop asks first so the last iteration pays for no reads. It is the
   * same two rules, not a second copy — `shouldStallAgain` is defined in terms of it, and these
   * two assertions are what would fail if someone split them apart.
   */
  it('agrees with the free half it is built from', () => {
    expect(stallBudgetLeft({ elapsedMs: 10_000, emitted: NINA_PHOTO_STALL_MAX })).toEqual(
      shouldStallAgain({ ...go, emitted: NINA_PHOTO_STALL_MAX }),
    )
    const tooLate = NINA_PHOTO_STALL_DEADLINE_MS - NINA_PHOTO_STALL_RESERVE_MS + 1
    expect(stallBudgetLeft({ elapsedMs: tooLate, emitted: 0 })).toEqual(
      shouldStallAgain({ ...go, elapsedMs: tooLate }),
    )
  })

  /*
   * ORDER MATTERS WHEN TWO RULES BOTH SAY STOP. The job closing is the ordinary end of a wait and
   * the one an operator reading a log wants to see; "he spoke" is the interesting one and must not
   * be reported for a wait that was already over.
   */
  it('reports the job closing ahead of everything else', () => {
    expect(
      shouldStallAgain({ jobOpen: false, newestRowIsHis: true, elapsedMs: 10_000_000, emitted: 9 }),
    ).toEqual({ go: false, reason: 'job-closed' })
  })
})
