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

  it('gives up at the background budget, not at the stale deadline', () => {
    /* The pairing, and it is new. The give-up spent its life identical to NINA_TURN_STALE_MS on
     * the argument that the poll that gives up has already been told the row is dead. A chained
     * burst honestly runs past 90 s, so the notice was a lie for a live chain (analysis G2). The
     * server's `awaiting: false` — the claim read — stops a dead turn's poll; the backstop's
     * remaining job is the poll that cannot reach the server at all, and it now spans the
     * server's full honest wall clock. */
    expect(NINA_TURN_POLL_GIVE_UP_MS).toBe(NINA_BACKGROUND_BUDGET_MS)
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

describe('the cold load and the poll agree on "unanswered"', () => {
  /**
   * `pollNinaReply`'s disjunct, transcribed from `lib/nina/actions.ts:2045` and `:2052`:
   *
   *     const expired = pending !== null && now - pending.createdAt.getTime() >= NINA_TURN_STALE_MS
   *     const live = pending !== null && !expired
   *     const awaiting = live || ninaAwaitingByMessage(newest, now)
   *
   * A pure unit test cannot import a `'use server'` module, so this transcription stands in for
   * the action. **If you change the poll's disjunct, change this helper in the same commit** —
   * this file is what asserts the page and the poll cannot disagree (plan invariant 5).
   */
  const pollAwaiting = (claimCreatedAt: Date | null, newest: NinaFlightRow | null): boolean => {
    const expired = claimCreatedAt !== null && NOW - claimCreatedAt.getTime() >= NINA_TURN_STALE_MS
    const live = claimCreatedAt !== null && !expired
    return live || ninaAwaitingByMessage(newest, NOW)
  }

  /** The page's half: `ninaFlightView(rows, Date.now(), pendingTurn?.createdAt ?? null)`. */
  const pageAwaiting = (
    rows: readonly NinaFlightRow[],
    claimCreatedAt: Date | null,
  ): boolean => ninaFlightView(rows, NOW, claimCreatedAt).awaiting

  /** A claim opened `ageMs` ago, or `null` for "no pending row for this session". */
  const claim = (ageMs: number | null): Date | null =>
    ageMs === null ? null : new Date(NOW - ageMs)

  it('a FRESH claim says awaiting even with the message window expired — the G1 case', () => {
    /* Reopen at t ∈ (90 s, 240 s), mid-turn or mid-chain. The heuristic alone says quiet; the
     * claim is the disjunct that starts the poll and lands her bubbles without a refresh. */
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 3)]
    expect(pageAwaiting(rows, claim(60_000))).toBe(true)
    expect(pollAwaiting(claim(60_000), rows[rows.length - 1] ?? null)).toBe(true)
  })

  it('no claim and an old message says quiet — the dead turn, which only phase 2 revives', () => {
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 3)]
    expect(pageAwaiting(rows, null)).toBe(false)
    expect(pollAwaiting(null, rows[rows.length - 1] ?? null)).toBe(false)
  })

  it('an EXPIRED claim is trusted by neither side — getPendingNinaChatTurn returns one anyway', () => {
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 3)]
    expect(pageAwaiting(rows, claim(NINA_TURN_STALE_MS + 1_000))).toBe(false)
    expect(pollAwaiting(claim(NINA_TURN_STALE_MS + 1_000), rows[rows.length - 1] ?? null)).toBe(
      false,
    )
  })

  it('with no claim at all, the message window alone answers — both directions', () => {
    const fresh = [row('runner', 5_000, 3)]
    expect(pageAwaiting(fresh, null)).toBe(true)
    expect(pollAwaiting(null, fresh[fresh.length - 1] ?? null)).toBe(true)

    const hers = [row('nina', 1_000)]
    expect(pageAwaiting(hers, null)).toBe(false)
    expect(pollAwaiting(null, hers[hers.length - 1] ?? null)).toBe(false)
  })

  it('a fresh claim outranks her newest row — the persisting tail, where both are true', () => {
    /* Reachable for a moment while her rows are going in: her bubbles exist, the claim is still
     * `pending`+`persisting`. The window alone would say "answered"; the claim says "not yet". */
    const rows = [row('runner', NINA_TURN_STALE_MS + 30_000, 2), row('nina', 1_000, 3)]
    expect(pageAwaiting(rows, claim(5_000))).toBe(true)
    expect(pollAwaiting(claim(5_000), rows[rows.length - 1] ?? null)).toBe(true)
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

  it('flips awaiting on a FRESH claim alone, cursor unmoved', () => {
    /* The G1 case as a unit: window expired, claim live, poll starts. */
    const view = ninaFlightView(
      [row('runner', NINA_TURN_STALE_MS + 30_000, 7)],
      NOW,
      new Date(NOW - 60_000),
    )
    expect(view).toEqual({ awaiting: true, cursor: 7 })
  })

  it('ignores an EXPIRED claim — the read hands one back deliberately', () => {
    /* Exclusive at the boundary, exactly like the message window: at exactly STALE the claim is
     * not fresh. */
    const view = ninaFlightView(
      [row('runner', NINA_TURN_STALE_MS + 30_000, 7)],
      NOW,
      new Date(NOW - NINA_TURN_STALE_MS),
    )
    expect(view).toEqual({ awaiting: false, cursor: 7 })
  })

  it('defaults the claim to null, so every two-argument call behaves exactly as before', () => {
    expect(ninaFlightView([row('runner', 5_000, 7)], NOW)).toEqual({ awaiting: true, cursor: 7 })
  })
})
