import { describe, expect, it } from 'vitest'

import {
  MISSED_DAY_EVENING_HOUR,
  MISSED_DAY_LATEST_HOUR,
  MISSED_DAY_MARKER_CODE,
  SILENCE_COOLDOWN_DAYS,
  SILENCE_MARKER_CODE,
  SILENCE_NO_CHAT_DAYS,
  SILENCE_NO_RUN_DAYS,
  decideProactive,
  evaluateAvatarChanged,
  evaluateMissedUsualDay,
  evaluatePatternCrossed,
  evaluateSilence,
  jakartaHourOf,
  jakartaWeekdayOf,
  markerFor,
  parseRunningDays,
  triggerBlock,
  type ProactiveFacts,
} from '@/lib/nina/proactive'

/**
 * F33 phase 10 — the decision layer, with no database and no model.
 *
 * Everything worth testing in this phase is a pure function over a `ProactiveFacts` object
 * (invariant 6), and the one property the whole phase exists to guarantee is here as a PAIR:
 * `evaluateMissedUsualDay` fires with an empty ledger and refuses with a marker dated today, on
 * otherwise identical facts. That is "fires once on the day, however many times the cron runs",
 * and it is the difference between a friend and a cron job.
 *
 * Dates are pinned rather than derived from the clock. `'2026-09-01'` is a **Tuesday** and
 * `'2026-09-03'` a **Thursday** — asserted directly in the weekday test below, so a wrong
 * assumption fails there rather than mysteriously three cases later.
 */

const TUESDAY = '2026-09-01'

function facts(overrides: Partial<ProactiveFacts> = {}): ProactiveFacts {
  return {
    todayISO: TUESDAY,
    jakartaHour: 19,
    runningDays: [2],
    hasRunToday: false,
    lastRunOn: '2026-08-31',
    daysSinceRunnerSpoke: 0,
    patterns: [],
    nags: [],
    unannouncedAvatarId: null,
    ...overrides,
  }
}

describe('parseRunningDays — phase 5 owns the vocabulary, this is the 0-6 view', () => {
  it('reads both languages and both spellings into Sunday-first numbers', () => {
    expect(parseRunningDays('Selasa, Kamis, Sabtu')).toEqual([2, 4, 6])
    expect(parseRunningDays('Tue, Thu, Sat')).toEqual([2, 4, 6])
    expect(parseRunningDays('tuesdays and thursdays')).toEqual([2, 4])
  })

  it('expands a range, which is the behaviour RULING E4 bought by deleting the local parser', () => {
    // "Senin sampe Jumat" is five days. This phase's own draft table read it as two.
    expect(parseRunningDays('Senin sampe Jumat')).toEqual([1, 2, 3, 4, 5])
  })

  it('treats a negation as "no usual days", which DISABLES the trigger', () => {
    // The other half of E4: the draft parser would have seen "senin" and nagged every Monday.
    expect(parseRunningDays('tiap hari kecuali senin')).toEqual([])
  })

  it('does not confuse senin with sunday, or minggu with monday', () => {
    // One letter apart in two languages. Prefix matching gets this wrong in a way no test would
    // notice until a Tuesday nag arrived on a Sunday.
    expect(parseRunningDays('senin')).toEqual([1])
    expect(parseRunningDays('sun')).toEqual([0])
    expect(parseRunningDays('minggu')).toEqual([0])
    expect(parseRunningDays('mon')).toEqual([1])
  })

  it('yields [] for absent or unreadable text rather than guessing a schedule', () => {
    expect(parseRunningDays(null)).toEqual([])
    expect(parseRunningDays(undefined)).toEqual([])
    expect(parseRunningDays('')).toEqual([])
    expect(parseRunningDays('whenever I feel like it')).toEqual([])
  })
})

describe('the two timezone helpers', () => {
  it('reads a Jakarta calendar day as the right weekday, independently of the server zone', () => {
    // Asserted against the literal value, NOT against `new Date(iso).getDay()` — that is the bug
    // this function exists to prevent, and comparing against it would encode the bug in the test.
    expect(jakartaWeekdayOf('2026-09-01')).toBe(2) // Tuesday
    expect(jakartaWeekdayOf('2026-09-03')).toBe(4) // Thursday
    expect(jakartaWeekdayOf('2026-09-06')).toBe(0) // Sunday
  })

  it('converts an instant to the Jakarta wall-clock hour', () => {
    // The cron's own instant: "0 12 * * *" UTC is 19:00 WIB on the SAME calendar day.
    expect(jakartaHourOf(new Date('2026-09-01T12:00:00Z'))).toBe(19)
    // The rollup's, for contrast: 20:00 UTC is 03:00 WIB the NEXT day, which is why copying that
    // schedule would have been wrong for a trigger that asks about "today".
    expect(jakartaHourOf(new Date('2026-09-01T20:00:00Z'))).toBe(3)
  })
})

describe('evaluateMissedUsualDay', () => {
  it('THE EXIT CRITERION — fires on an empty ledger and not again the same day', () => {
    const clean = facts()
    expect(evaluateMissedUsualDay(clean)).toEqual({
      fire: true,
      detail: { kind: 'missed_usual_day', todayISO: TUESDAY, weekday: 2 },
    })

    // Same facts, plus the marker the first emission wrote. A second cron invocation — or a
    // tenth — must say nothing, and a serverless invocation cannot remember the first one, so
    // this row is the only thing standing between her and asking twice.
    const asked = facts({
      nags: [{ code: MISSED_DAY_MARKER_CODE, level: 1, lastMentionedOn: TUESDAY }],
    })
    expect(evaluateMissedUsualDay(asked).fire).toBe(false)
  })

  it('fires again on a later usual day — the marker is a date, not a latch', () => {
    const nextTuesday = facts({
      todayISO: '2026-09-08',
      nags: [{ code: MISSED_DAY_MARKER_CODE, level: 1, lastMentionedOn: TUESDAY }],
    })
    expect(nextTuesday.runningDays).toContain(jakartaWeekdayOf('2026-09-08'))
    expect(evaluateMissedUsualDay(nextTuesday).fire).toBe(true)
  })

  it('honours the evening window on both sides', () => {
    expect(evaluateMissedUsualDay(facts({ jakartaHour: MISSED_DAY_EVENING_HOUR - 1 })).fire).toBe(
      false,
    )
    expect(evaluateMissedUsualDay(facts({ jakartaHour: MISSED_DAY_EVENING_HOUR })).fire).toBe(true)
    expect(evaluateMissedUsualDay(facts({ jakartaHour: MISSED_DAY_LATEST_HOUR })).fire).toBe(true)
    // 00:00-01:00 WIB is a manual invocation asking about a day that has barely started.
    expect(evaluateMissedUsualDay(facts({ jakartaHour: 0 })).fire).toBe(false)
  })

  it('says nothing when there is nothing to say', () => {
    expect(evaluateMissedUsualDay(facts({ runningDays: [] })).fire).toBe(false)
    expect(evaluateMissedUsualDay(facts({ runningDays: [4] })).fire).toBe(false)
    expect(evaluateMissedUsualDay(facts({ hasRunToday: true })).fire).toBe(false)
  })
})

describe('evaluateSilence', () => {
  it('fires at the run threshold and not one day short of it', () => {
    const quietFor = (days: number) =>
      evaluateSilence(
        facts({
          lastRunOn: '2026-08-01',
          todayISO: addDaysISO('2026-08-01', days),
          daysSinceRunnerSpoke: 0,
        }),
      ).fire

    expect(quietFor(SILENCE_NO_RUN_DAYS - 1)).toBe(false)
    expect(quietFor(SILENCE_NO_RUN_DAYS)).toBe(true)
  })

  it('fires on chat silence alone, with a run only yesterday', () => {
    expect(
      evaluateSilence(
        facts({ lastRunOn: '2026-08-31', daysSinceRunnerSpoke: SILENCE_NO_CHAT_DAYS }),
      ).fire,
    ).toBe(true)
  })

  it('does not fire for a brand-new account — never is not silence', () => {
    expect(evaluateSilence(facts({ lastRunOn: null, daysSinceRunnerSpoke: null })).fire).toBe(false)
  })

  it('respects the cooldown, so it cannot become a daily "you have been quiet" drip', () => {
    const spoke = (daysAgo: number) =>
      evaluateSilence(
        facts({
          lastRunOn: '2026-08-01',
          daysSinceRunnerSpoke: 30,
          nags: [
            {
              code: SILENCE_MARKER_CODE,
              level: 1,
              lastMentionedOn: addDaysISO(TUESDAY, -daysAgo),
            },
          ],
        }),
      ).fire

    expect(spoke(SILENCE_COOLDOWN_DAYS - 1)).toBe(false)
    expect(spoke(SILENCE_COOLDOWN_DAYS)).toBe(true)
  })
})

describe('evaluatePatternCrossed — phase 9 owns the ladder, this only picks', () => {
  const pattern = (code: string, nagLevel = 0) => ({ code, value: '3 of your last 5', nagLevel })

  it('fires for a pattern she has never raised', () => {
    const decision = evaluatePatternCrossed(facts({ patterns: [pattern('REPEATED_LATE_START')] }))
    expect(decision.fire).toBe(true)
    if (!decision.fire) return
    expect(decision.detail.kind).toBe('pattern_crossed')
    if (decision.detail.kind !== 'pattern_crossed') return
    /*
     * **0, not 1.** `nagLevel` is times ALREADY raised, and phase 2's proactive instruction turns
     * "1 or more" into "say plainly that you have told him this before". Sending the post-mention
     * rung would make her claim a conversation that never happened, on the very first nag.
     */
    expect(decision.detail.nagLevel).toBe(0)
    // The ledger, on the other hand, moves to rung 1 — and only once the message actually lands.
    expect(decision.detail.marker.level).toBe(1)
    expect(decision.detail.value).toBe('3 of your last 5')
  })

  it('reports a repeat as a repeat — she has said this twice already', () => {
    const decision = evaluatePatternCrossed(
      facts({
        patterns: [pattern('ACWR_SPIKE', 2)],
        nags: [{ code: 'ACWR_SPIKE', level: 2, lastMentionedOn: null }],
      }),
    )
    if (!decision.fire || decision.detail.kind !== 'pattern_crossed') throw new Error('expected')
    expect(decision.detail.nagLevel).toBe(2)
    expect(decision.detail.marker.level).toBe(3)
  })

  it('picks the one she has already raised most, and breaks ties on code', () => {
    const decision = evaluatePatternCrossed(
      facts({
        patterns: [pattern('ACWR_SPIKE', 2), pattern('REPEATED_HIGH_AVG_HR', 2)],
        nags: [
          { code: 'ACWR_SPIKE', level: 2, lastMentionedOn: null },
          { code: 'REPEATED_HIGH_AVG_HR', level: 2, lastMentionedOn: null },
        ],
      }),
    )
    if (!decision.fire || decision.detail.kind !== 'pattern_crossed') throw new Error('expected')
    expect(decision.detail.code).toBe('ACWR_SPIKE')
  })

  it('stays quiet inside phase 9s cooldown rather than inventing its own rule', () => {
    // `NAG_RULES.cooldownDays` is 3 and strict, so the day after is silent and so is day 3.
    const decision = evaluatePatternCrossed(
      facts({
        patterns: [pattern('REPEATED_LATE_START', 1)],
        nags: [{ code: 'REPEATED_LATE_START', level: 1, lastMentionedOn: addDaysISO(TUESDAY, -1) }],
      }),
    )
    expect(decision.fire).toBe(false)
  })
})

describe('decideProactive — one message, by priority', () => {
  it('returns the avatar when everything is true at once', () => {
    const everything = facts({
      unannouncedAvatarId: 'avatar_1',
      patterns: [{ code: 'ACWR_SPIKE', value: '150%', nagLevel: 0 }],
      lastRunOn: '2026-08-01',
      daysSinceRunnerSpoke: 30,
    })
    // All four evaluators fire on these facts…
    expect(evaluateAvatarChanged(everything).fire).toBe(true)
    expect(evaluatePatternCrossed(everything).fire).toBe(true)
    expect(evaluateMissedUsualDay(everything).fire).toBe(true)
    expect(evaluateSilence(everything).fire).toBe(true)

    // …and exactly one message comes out, the one he just caused and is waiting on.
    const decision = decideProactive(everything)
    if (!decision.fire) throw new Error('expected a decision')
    expect(decision.detail.kind).toBe('avatar_changed')
  })

  it('falls down the priority list as each candidate is exhausted', () => {
    const base = facts({
      patterns: [{ code: 'ACWR_SPIKE', value: '150%', nagLevel: 0 }],
      lastRunOn: '2026-08-01',
      daysSinceRunnerSpoke: 30,
    })
    const kindOf = (f: ProactiveFacts) => {
      const d = decideProactive(f)
      return d.fire ? d.detail.kind : null
    }

    expect(kindOf(base)).toBe('pattern_crossed')
    expect(kindOf({ ...base, patterns: [] })).toBe('missed_usual_day')
    expect(kindOf({ ...base, patterns: [], runningDays: [] })).toBe('silence')
    expect(
      kindOf({
        ...base,
        patterns: [],
        runningDays: [],
        daysSinceRunnerSpoke: 0,
        lastRunOn: TUESDAY,
      }),
    ).toBe(null)
  })

  it('explains itself when nothing fires — a cron log saying only "false" is useless', () => {
    const decision = decideProactive(
      facts({ runningDays: [], daysSinceRunnerSpoke: 0, lastRunOn: TUESDAY }),
    )
    expect(decision.fire).toBe(false)
    if (decision.fire) return
    expect(decision.reason).toContain('avatar_changed')
    expect(decision.reason).toContain('missed_usual_day')
    expect(decision.reason).toContain('silence')
  })
})

describe('markerFor', () => {
  it('has no nag row for the two triggers marked some other way', () => {
    const f = facts()
    expect(markerFor({ kind: 'avatar_changed', avatarId: 'a' }, f)).toBeNull()
    expect(
      markerFor(
        {
          kind: 'run_committed',
          runId: 'r',
          occurredOn: TUESDAY,
          recordKeys: [],
          badgeKeys: [],
        },
        f,
      ),
    ).toBeNull()
  })

  it('bumps an existing trigger row rather than resetting it', () => {
    const f = facts({
      nags: [{ code: MISSED_DAY_MARKER_CODE, level: 3, lastMentionedOn: '2026-08-25' }],
    })
    expect(markerFor({ kind: 'missed_usual_day', todayISO: TUESDAY, weekday: 2 }, f)).toEqual({
      code: MISSED_DAY_MARKER_CODE,
      level: 4,
      lastMentionedOn: TUESDAY,
    })
  })

  it('passes phase 9s own row through for a pattern, rather than recomputing the rung', () => {
    const marker = { code: 'ACWR_SPIKE', level: 2, lastMentionedOn: TUESDAY }
    expect(
      markerFor(
        { kind: 'pattern_crossed', code: 'ACWR_SPIKE', value: '150%', nagLevel: 2, marker },
        facts(),
      ),
    ).toBe(marker)
  })
})

describe('triggerBlock — R8, and invariant 2 at its boundary', () => {
  it('spells record and badge keys with the labels the shelves render', () => {
    const block = triggerBlock({
      kind: 'run_committed',
      runId: 'run_1',
      occurredOn: TUESDAY,
      recordKeys: ['longest_distance'],
      badgeKeys: ['long_way_home'],
    })
    const body = JSON.parse(block.slice('TRIGGER\n'.length))

    // The labels she reads are the labels he sees on `/me`. Not the keys.
    expect(body.recordsTaken).toEqual(['Longest distance'])
    expect(body.badgesEarned).toEqual(['The Long Way Home'])
    expect(body.recordsTaken[0]).not.toBe('longest_distance')
  })

  it('falls back to the key itself for something it has never heard of', () => {
    // A key in a bubble is ugly; `undefined` is a bug she would read aloud.
    const block = triggerBlock({
      kind: 'run_committed',
      runId: 'run_1',
      occurredOn: TUESDAY,
      recordKeys: ['not_a_record'],
      badgeKeys: ['not_a_badge'],
    })
    const body = JSON.parse(block.slice('TRIGGER\n'.length))
    expect(body.recordsTaken).toEqual(['not_a_record'])
    expect(body.badgesEarned).toEqual(['not_a_badge'])
  })

  it('passes a pattern value through as characters and never formats one', () => {
    const block = triggerBlock({
      kind: 'pattern_crossed',
      code: 'ACWR_SPIKE',
      value: '152%',
      nagLevel: 1,
      marker: { code: 'ACWR_SPIKE', level: 1, lastMentionedOn: TUESDAY },
    })
    expect(JSON.parse(block.slice('TRIGGER\n'.length)).value).toBe('152%')
  })
})

/** Local to the test, so a fixture date is arithmetic a reader can check rather than a constant. */
function addDaysISO(dateISO: string, delta: number): string {
  const at = new Date(`${dateISO}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + delta)
  return at.toISOString().slice(0, 10)
}
