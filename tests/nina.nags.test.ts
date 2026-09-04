import { describe, expect, it } from 'vitest'

import { addDays, type DateISO } from '@/lib/date/ranges'
import type { FiredPattern, NagState } from '@/lib/nina/context'
import {
  applyDecay,
  decayedNagLevel,
  decideNag,
  decideNags,
  MAX_NAG_LEVEL,
  NAG_RULES,
} from '@/lib/nina/nags'

const ASOF: DateISO = '2026-09-03'
const CODE = 'REPEATED_LATE_START'

const ledger = (level: number, lastMentionedOn: DateISO | null, code = CODE): NagState => ({
  code,
  level,
  lastMentionedOn,
})

describe('the first mention', () => {
  it('no ledger row means level 0, and she is free to speak', () => {
    const d = decideNag(CODE, null, ASOF)
    expect(d.level).toBe(0)
    expect(d.shouldRaise).toBe(true)
    expect(d.reason).toBe('first_time')
    expect(d.next).toEqual({ code: CODE, level: 1, lastMentionedOn: ASOF })
  })
})

describe('the third time she raises it, she escalates rather than repeating', () => {
  it('three mentions four days apart come out at levels 0, 1 and 2', () => {
    let state: NagState | null = null
    let day: DateISO = ASOF
    /* The day of the LAST mention, which is where `next.lastMentionedOn` must land — `day` has
     * already advanced to the next candidate turn by the time the loop exits. */
    let lastSaid: DateISO = ASOF
    const levels: number[] = []

    for (let i = 0; i < 3; i += 1) {
      const d = decideNag(CODE, state, day)
      expect(d.shouldRaise).toBe(true)
      levels.push(d.level)
      state = d.next
      lastSaid = day
      day = addDays(day, NAG_RULES.cooldownDays + 1)
    }

    // 0 → rung 1 "sharp", 1 → rung 2 "pointed", 2 → rung 3 "irritated" on phase 2's ANGER_LADDER.
    // Level 2 is where "udah gw bilang" is literally true, and it is true because of this ledger.
    expect(levels).toEqual([0, 1, 2])
    expect(state).toEqual({ code: CODE, level: 3, lastMentionedOn: lastSaid })
    expect(lastSaid).toBe(addDays(ASOF, 8))
  })

  it('caps at MAX_NAG_LEVEL — she still speaks, she just cannot get angrier', () => {
    const d = decideNag(CODE, ledger(MAX_NAG_LEVEL, addDays(ASOF, -4)), ASOF)
    expect(d.level).toBe(MAX_NAG_LEVEL)
    expect(d.shouldRaise).toBe(true)
    expect(d.reason).toBe('capped')
    expect(d.next.level).toBe(MAX_NAG_LEVEL)
  })

  it('MAX_NAG_LEVEL is 4, one past the highest rung the ladder distinguishes', () => {
    expect(MAX_NAG_LEVEL).toBe(4)
  })
})

describe('the cooldown is strict', () => {
  it('three days after saying it she is still quiet; four days after, she speaks', () => {
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -3)), ASOF).shouldRaise).toBe(false)
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -3)), ASOF).reason).toBe('cooldown')
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -4)), ASOF).shouldRaise).toBe(true)
    expect(decideNag(CODE, ledger(1, addDays(ASOF, -4)), ASOF).reason).toBe('escalated')
  })

  it('a same-day repeat is refused — that is the same conversation, not a reminder', () => {
    expect(decideNag(CODE, ledger(2, ASOF), ASOF).shouldRaise).toBe(false)
  })

  it('the level is still reported while on cooldown, so context stays truthful', () => {
    const d = decideNag(CODE, ledger(2, ASOF), ASOF)
    expect(d.level).toBe(2)
  })
})

describe('the level decays after compliance', () => {
  const raised = ledger(3, ASOF)

  it('decay is strict at ten quiet days, and steps once per further ten', () => {
    expect(decayedNagLevel(raised, addDays(ASOF, 10))).toBe(3)
    expect(decayedNagLevel(raised, addDays(ASOF, 11))).toBe(2)
    expect(decayedNagLevel(raised, addDays(ASOF, 21))).toBe(1)
    expect(decayedNagLevel(raised, addDays(ASOF, 31))).toBe(0)
  })

  it('never goes below zero, however long he behaves', () => {
    expect(decayedNagLevel(raised, addDays(ASOF, 400))).toBe(0)
  })

  it('a fixed habit that returns is met at the cooled level, not the old one', () => {
    // He was shouted at, complied for a month, and has started sleeping in again.
    const d = decideNag(CODE, ledger(3, ASOF), addDays(ASOF, 31))
    expect(d.level).toBe(0)
    expect(d.reason).toBe('escalated')
    expect(d.next.level).toBe(1)
  })

  it('a row with no last_mentioned_on never decays — an absent date is not elapsed time', () => {
    expect(decayedNagLevel(ledger(3, null), addDays(ASOF, 400))).toBe(3)
  })

  it('a null state is level 0', () => {
    expect(decayedNagLevel(null, ASOF)).toBe(0)
  })

  it('a corrupt stored level is clamped rather than trusted', () => {
    expect(decayedNagLevel(ledger(99, ASOF), ASOF)).toBe(MAX_NAG_LEVEL)
    expect(decayedNagLevel(ledger(-3, ASOF), ASOF)).toBe(0)
    expect(decayedNagLevel(ledger(Number.NaN, ASOF), ASOF)).toBe(0)
    expect(decayedNagLevel(ledger(2.7, ASOF), ASOF)).toBe(2)
  })
})

describe('applyDecay is the projection phase 10 hands to buildNinaContext', () => {
  it('cools every level and preserves every date', () => {
    const rows: NagState[] = [ledger(3, ASOF), ledger(1, null, 'ACWR_SPIKE')]
    expect(applyDecay(rows, addDays(ASOF, 21))).toEqual([
      { code: CODE, level: 1, lastMentionedOn: ASOF },
      { code: 'ACWR_SPIKE', level: 1, lastMentionedOn: null },
    ])
  })

  it('is NOT idempotent, and must be applied to the stored rows only', () => {
    // Pinned as a warning, not as a feature. The anchor is `lastMentionedOn`, which the projection
    // preserves on purpose, so projecting a projection decays a second time from the same anchor.
    const once = applyDecay([ledger(3, ASOF)], addDays(ASOF, 21))
    const twice = applyDecay(once, addDays(ASOF, 21))
    expect(once[0]!.level).toBe(1)
    expect(twice[0]!.level).toBe(0)
  })
})

describe('decideNags over a whole evaluation', () => {
  const pattern = (code: string): FiredPattern => ({
    code,
    severity: 'warn',
    value: 1,
    unit: 'count',
    occurrences: 3,
    windowRuns: 5,
  })

  it('decides one code per fired pattern, in the order they arrived', () => {
    const out = decideNags(
      [pattern(CODE), pattern('ACWR_SPIKE')],
      [ledger(2, addDays(ASOF, -4))],
      ASOF,
    )
    expect(out.map((d) => d.code)).toEqual([CODE, 'ACWR_SPIKE'])
    expect(out[0]!.level).toBe(2)
    expect(out[0]!.reason).toBe('escalated')
    // No row for ACWR_SPIKE: she has never raised it.
    expect(out[1]!.level).toBe(0)
    expect(out[1]!.reason).toBe('first_time')
  })

  it('ignores ledger rows for codes that did not fire', () => {
    const out = decideNags(
      [pattern(CODE)],
      [ledger(4, ASOF), ledger(2, ASOF, 'PACE_REGRESSION')],
      ASOF,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.code).toBe(CODE)
  })
})
