import { describe, expect, it } from 'vitest'

import { NINA_TURN_BUDGET } from './turn'
import {
  NINA_BACKGROUND_BUDGET_MS,
  NINA_TURN_CHAIN_MAX,
  NINA_TURN_POLL_GIVE_UP_MS,
  NINA_TURN_POLL_INTERVALS_MS,
  NINA_TURN_POLL_LATE_AFTER_ATTEMPTS,
  NINA_TURN_POLL_MID_AFTER_ATTEMPTS,
  NINA_TURN_STALE_MS,
  ninaAwaitingByMessage,
  ninaFlightView,
  ninaPollDelayFor,
  type NinaFlightRow,
} from './turnflight'

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0)
const row = (role: 'runner' | 'nina', ageMs: number, seq = 1): NinaFlightRow => ({
  role,
  seq,
  createdAt: new Date(NOW - ageMs),
})

describe('the poll backoff schedule', () => {
  it('starts at 1.5 s, steps to 2.5 s after six attempts and 4 s after fourteen', () => {
    expect(ninaPollDelayFor(0)).toBe(NINA_TURN_POLL_INTERVALS_MS.initial)
    expect(ninaPollDelayFor(NINA_TURN_POLL_MID_AFTER_ATTEMPTS - 1)).toBe(
      NINA_TURN_POLL_INTERVALS_MS.initial,
    )
    expect(ninaPollDelayFor(NINA_TURN_POLL_MID_AFTER_ATTEMPTS)).toBe(
      NINA_TURN_POLL_INTERVALS_MS.mid,
    )
    expect(ninaPollDelayFor(NINA_TURN_POLL_LATE_AFTER_ATTEMPTS)).toBe(
      NINA_TURN_POLL_INTERVALS_MS.late,
    )
    expect(ninaPollDelayFor(9_999)).toBe(NINA_TURN_POLL_INTERVALS_MS.late)
  })

  it('sees a typical 16 s turn land within one interval of it landing', () => {
    let elapsed = 0
    let attempts = 0
    while (elapsed < 16_000) {
      elapsed += ninaPollDelayFor(attempts)
      attempts += 1
    }
    expect(elapsed - 16_000).toBeLessThanOrEqual(NINA_TURN_POLL_INTERVALS_MS.mid)
    /* …without hammering. A dozen or so requests, not a hundred. */
    expect(attempts).toBeLessThan(14)
  })

  it('gives up exactly where the server declares the turn dead', () => {
    /* They are the same number on purpose: the poll that gives up is the poll that has already
     * been told the row is stale, so the notice it raises is a fact and not a timeout. */
    expect(NINA_TURN_POLL_GIVE_UP_MS).toBe(NINA_TURN_STALE_MS)
  })

  it('does not stop asking before a healthy turn could possibly have finished', () => {
    /* The failure this guards: someone tunes NINA_TURN_BUDGET up and the client starts calling a
     * working turn dead. 45 s of model budget plus loads and inserts must fit inside 90 s. */
    expect(NINA_TURN_STALE_MS).toBeGreaterThan(NINA_TURN_BUDGET.overall + 20_000)
  })

  it('keeps every FOLLOW-UP link inside what is left of the background budget', () => {
    /*
     * One link is a turn plus a distillation. The inequality is about the CHAINED links only, and
     * it is `runNinaBackgroundTurn`'s own guard written as arithmetic:
     *
     *     if (Date.now() - startedAtMs >= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall)
     *
     * The FIRST link is not counted, because nothing gates it on this budget — `runNinaTurn`
     * bounds itself with NINA_TURN_BUDGET and the response went out before it started.
     *
     * Branch A: 2 * 70_000 = 140_000 <= 240_000 - 45_000 = 195_000.
     * Branch B: 0            <=  45_000 - 45_000 =       0.
     *
     * This is the tripwire for phase 2's probe failing and only ONE of the two literals moving.
     * Lower the budget to 45_000 and leave the chain at 2 and it reads 140_000 <= 0 and fails —
     * which is the dangerous direction: a chain that starts links the invocation cannot finish
     * spends $0.00 on tokens that get killed mid-flight and leaves a `pending` row for the sweep.
     */
    const perLink = NINA_TURN_BUDGET.overall + 25_000
    expect(NINA_TURN_CHAIN_MAX * perLink).toBeLessThanOrEqual(
      NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall,
    )
  })

  it('never claims a background budget smaller than one turn', () => {
    /* The other half of the pair, and it is what stops the budget being lowered ALONE into
     * something that cannot hold even the first link. Branch A: 240_000 >= 45_000. Branch B:
     * 45_000 >= 45_000, which is the exact statement "there is room for the turn and nothing
     * after it". */
    expect(NINA_BACKGROUND_BUDGET_MS).toBeGreaterThanOrEqual(NINA_TURN_BUDGET.overall)
  })
})

describe('ninaAwaitingByMessage', () => {
  it('is false for an empty conversation', () => {
    expect(ninaAwaitingByMessage(null, NOW)).toBe(false)
  })

  it('is false when the newest row is hers — she has answered', () => {
    expect(ninaAwaitingByMessage(row('nina', 1_000), NOW)).toBe(false)
  })

  it('is true when the newest row is his and it is fresh', () => {
    expect(ninaAwaitingByMessage(row('runner', 5_000), NOW)).toBe(true)
  })

  it('is FALSE for an old unanswered message, so an ancient screen does not poll forever', () => {
    /* The one that would have shipped as a bug: without the age bound, every load of a
     * conversation whose last word was his would start a 90 s poll, for ever. */
    expect(ninaAwaitingByMessage(row('runner', NINA_TURN_STALE_MS + 1), NOW)).toBe(false)
  })

  it('is exclusive at the boundary', () => {
    expect(ninaAwaitingByMessage(row('runner', NINA_TURN_STALE_MS), NOW)).toBe(false)
    expect(ninaAwaitingByMessage(row('runner', NINA_TURN_STALE_MS - 1), NOW)).toBe(true)
  })
})

describe('ninaFlightView', () => {
  it('reads the LAST row, because the page renders oldest first', () => {
    const view = ninaFlightView([row('runner', 5_000, 7), row('nina', 4_000, 8)], NOW)
    expect(view).toEqual({ awaiting: false, cursor: 8 })
  })

  it('carries the newest seq as the cursor even while awaiting', () => {
    const view = ninaFlightView([row('nina', 9_000, 11), row('runner', 2_000, 12)], NOW)
    expect(view).toEqual({ awaiting: true, cursor: 12 })
  })

  it('answers cursor 0 for an empty conversation — below every seq a bigserial can assign', () => {
    expect(ninaFlightView([], NOW)).toEqual({ awaiting: false, cursor: 0 })
  })
})
