import { describe, expect, it } from 'vitest'

import { BADGE_KEYS } from '@/lib/badges/catalog'
import {
  formatBpm,
  formatDistanceM,
  formatDuration,
  formatPace,
  formatPercent,
  MISSING,
} from '@/lib/format'
import { buildNinaContext } from '@/lib/nina/context'
import { RECORD_KEYS } from '@/lib/records/catalog'
import { NINA_FIXTURE_TODAY, ninaFixtureInput } from './fixtures/ninaContext'

/**
 * Phase 2's exit criteria, as three describes, plus the rules that only review would otherwise
 * catch. Every assertion here is about the payload BEFORE a model is involved: the "every number
 * she says must appear verbatim in the JSON" rule can only be honest if the JSON actually carries
 * those characters.
 */

describe('buildNinaContext — the Jakarta clock (R16)', () => {
  const ctx = buildNinaContext(ninaFixtureInput())

  it('reports the Asia/Jakarta day, not the UTC day, across the midnight boundary', () => {
    /* 17:03 UTC on 3 Sep is 00:03 on 4 Sep in Jakarta. */
    expect(ctx.now.todayISO).toBe(NINA_FIXTURE_TODAY)
    expect(ctx.now.timeZone).toBe('Asia/Jakarta')
  })

  it('reports the weekday in both languages, for the Jakarta day', () => {
    expect(ctx.now.weekday).toBe('Friday')
    expect(ctx.now.weekdayId).toBe('Jumat')
  })

  it('reports a 24-hour Jakarta wall clock and never 24:00', () => {
    expect(ctx.now.clock).toBe('00:03')
  })

  it('precomputes the Indonesian part of day, so "pagi" is never guessed from the clock', () => {
    expect(ctx.now.partOfDay).toBe('malam')
  })

  it('names the ISO week the same way insights.scope_key does', () => {
    expect(ctx.now.isoWeek).toBe('2026-W36')
  })

  it('walks all four parts of day at their documented bounds', () => {
    const at = (utcISO: string) =>
      buildNinaContext(ninaFixtureInput({ now: new Date(utcISO) })).now.partOfDay
    /* Jakarta is UTC+7 and has no DST, so each of these is the bound minus seven hours. */
    expect(at('2026-09-03T21:00:00Z')).toBe('pagi') // 04:00
    expect(at('2026-09-04T04:00:00Z')).toBe('siang') // 11:00
    expect(at('2026-09-04T08:00:00Z')).toBe('sore') // 15:00
    expect(at('2026-09-04T11:30:00Z')).toBe('malam') // 18:30
  })
})

describe('buildNinaContext — the runner (R6, RU-1)', () => {
  const ctx = buildNinaContext(ninaFixtureInput())

  it('CARRIES BODY WEIGHT. RU-1 repealed D15/R-28 and this is the assertion that proves it', () => {
    expect(ctx.runner.weightKg).toBe(63.5)
  })

  it('carries sex, the column phase 1 adds', () => {
    expect(ctx.runner.sex).toBe('male')
  })

  it('carries height and resting HR', () => {
    expect(ctx.runner.heightCm).toBe(169)
    expect(ctx.runner.restingHr).toBe(54)
  })

  it('derives age from birth_year against the injected instant, and never stores it', () => {
    expect(ctx.runner.age).toBe(30)
    expect(ctx.runner).not.toHaveProperty('birthYear')
  })

  it('labels the HRmax it divided by, with its source', () => {
    expect(ctx.runner.hrMax).toEqual({ bpm: 187, source: 'estimated' })
  })

  it('computes NO derived body number — no BMI under any spelling', () => {
    const json = JSON.stringify(ctx)
    expect(json).not.toMatch(/bmi/i)
    expect(json).not.toMatch(/vo2/i)
  })

  it('degrades a missing profile to nulls rather than to zeroes', () => {
    const bare = buildNinaContext(ninaFixtureInput({ profile: null, hrMax: null }))
    expect(bare.runner.weightKg).toBeNull()
    expect(bare.runner.sex).toBeNull()
    expect(bare.runner.age).toBeNull()
    expect(bare.runner.hrMax).toBeNull()
  })
})

describe('buildNinaContext — every string comes from lib/format.ts', () => {
  const ctx = buildNinaContext(ninaFixtureInput())
  const run = ctx.recentRuns[0]!

  it('spells the run the way the run detail page spells it', () => {
    expect(run.distance).toBe(formatDistanceM(10_670))
    expect(run.distance).toBe('10.67 km')
    expect(run.duration).toBe(formatDuration(4_716))
    expect(run.duration).toBe('1:18:36')
    expect(run.avgPace).toBe(formatPace(442, true))
    expect(run.avgPace).toBe('7\'22"/km')
    expect(run.avgHr).toBe(formatBpm(173))
  })

  it('spells the pinned §4.9 percentages to one decimal, as F07 does', () => {
    expect(run.timeInZone4And5).toBe(formatPercent(90.6, 1))
    expect(run.avgHrPctOfMax).toBe(formatPercent(92.5, 1))
  })

  it('renders a start time as a clock and never as a duration', () => {
    expect(run.startedAt).toBe('07:07')
  })

  /**
   * The rule is that an absent quantity is `null`, never `MISSING`. It is asserted per VALUE and
   * not by grepping the serialised payload for the character, because `flags[].detail` is
   * `lib/flags/copy.ts`'s own prose and that copy uses an em dash as PUNCTUATION — "…fell 12.3%
   * between the first half and the second — above 5%…". R-42 requires this phase to reuse that
   * sentence rather than re-spell it, so the character is legitimately in the payload and only
   * its use as a value is forbidden.
   */
  it('leaves an absent quantity NULL rather than rendering the em dash', () => {
    const input = ninaFixtureInput()
    const noHr = { ...input.recentRuns[0]!, avgHr: null, maxHr: null, activeKcal: null }
    const ctx2 = buildNinaContext(ninaFixtureInput({ recentRuns: [noHr] }))
    const run2 = ctx2.recentRuns[0]!
    expect(run2.avgHr).toBeNull()
    expect(run2.maxHr).toBeNull()
    expect(run2.activeKcal).toBeNull()

    const missingValues: string[] = []
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        if (node === MISSING) missingValues.push(path)
        return
      }
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`))
        return
      }
      if (node != null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
      }
    }
    walk(ctx2, 'ctx')
    expect(missingValues).toEqual([])
  })

  it('precomputes every day gap, so no date arithmetic is left to the model', () => {
    /* 2026-08-20 to 2026-09-04. */
    expect(run.daysAgo).toBe(15)
    expect(ctx.records.find((r) => r.key === 'longest_distance')!.daysAgo).toBe(15)
    expect(ctx.badges.held.find((b) => b.key === 'late_start')!.daysAgo).toBe(15)
    expect(ctx.memory.facts[0]!.daysAgo).toBe(3)
  })

  it('names the run day in both languages', () => {
    expect(run.date).toBe('Thu, 20 Aug 2026')
    expect(run.weekday).toBe('Thursday')
    expect(run.weekdayId).toBe('Kamis')
  })

  it('reuses lib/flags/copy.ts rather than re-spelling a flag', () => {
    const hard = run.flags.find((f) => f.code === 'TOO_MUCH_HARD')!
    expect(hard.title).toBe('Mostly hard')
    expect(hard.detail).toContain('90.6%')
  })

  it("carries the runner's own note UNALTERED, even when it contradicts the record (R6)", () => {
    expect(run.note).toBe('easy 12k, felt fine')
    expect(run.distance).toBe('10.67 km')
  })

  it("carries no splits — the conversation window is this payload's one child inclusion", () => {
    expect(run).not.toHaveProperty('splits')
  })
})

describe('buildNinaContext — records and badges (R6)', () => {
  const ctx = buildNinaContext(ninaFixtureInput())

  it('carries ALL ELEVEN record keys, in catalog order', () => {
    expect(ctx.records.map((r) => r.key)).toEqual([...RECORD_KEYS])
  })

  it('renders a held record through formatRecordValue, previous value included', () => {
    const longest = ctx.records.find((r) => r.key === 'longest_distance')!
    expect(longest.value).toBe('10.67 km')
    expect(longest.previousValue).toBe('9.80 km')
    expect(longest.label).toBe('Longest distance')
  })

  it('renders earliest_start as a wall clock and never as a duration', () => {
    expect(ctx.records.find((r) => r.key === 'earliest_start')!.value).toBe('07:07')
  })

  it('reports an unheld key as null, never as zero and never as the em dash', () => {
    const never = ctx.records.find((r) => r.key === 'most_kcal')!
    expect(never.value).toBeNull()
    expect(never.daysAgo).toBeNull()
    expect(never.runId).toBeNull()
  })

  it('drops a key the catalog no longer defines', () => {
    expect(ctx.records.some((r) => (r.key as string) === 'retired_key')).toBe(false)
  })

  it('accounts for all 22 badge keys across held and locked', () => {
    const seen = [...ctx.badges.held.map((b) => b.key), ...ctx.badges.locked.map((b) => b.key)]
    expect(seen.sort()).toEqual([...BADGE_KEYS].sort())
    expect(seen).toHaveLength(22)
  })

  it('renders the condition from BADGE_META, never a hand-written threshold (R-42)', () => {
    const late = ctx.badges.held.find((b) => b.key === 'late_start')!
    expect(late.title).toBe('Fashionably Late')
    expect(late.condition).toBe('A start after 07:00.')
  })

  it('keeps count and dated earnings separate, so she cannot invent an earn date', () => {
    const late = ctx.badges.held.find((b) => b.key === 'late_start')!
    expect(late.count).toBe(5)
    expect(late.earnedDaysOnRecord).toBe(2)
  })
})

describe('buildNinaContext — memory and the conversation (RU-6, RU-14)', () => {
  const ctx = buildNinaContext(ninaFixtureInput())

  it('keeps the message window oldest first, as reading order', () => {
    expect(ctx.conversation.window.map((t) => t.id)).toEqual(['msg_1', 'msg_2', 'msg_3'])
  })

  it('labels each message with its Jakarta day and clock', () => {
    expect(ctx.conversation.window[0]!.sentAtLabel).toBe('Thu 20 Aug 07:14')
  })

  it('precomputes how long each party has been silent', () => {
    expect(ctx.conversation.daysSinceRunnerSpoke).toBe(3)
    expect(ctx.conversation.daysSinceNinaSpoke).toBe(15)
  })

  it('reports an empty history as empty, never as null', () => {
    const fresh = buildNinaContext(ninaFixtureInput({ messages: [], olderMessageCount: 0 }))
    expect(fresh.conversation.window).toEqual([])
    expect(fresh.conversation.daysSinceRunnerSpoke).toBeNull()
    expect(fresh.conversation.daysSinceNinaSpoke).toBeNull()
  })

  it('carries the slots and the ledger with their own ages', () => {
    expect(ctx.memory.slots[0]!.key).toBe('usual_running_days')
    expect(ctx.memory.slots[0]!.daysAgo).toBe(3)
    expect(ctx.memory.facts[0]!.sourceMessageId).toBe('msg_3')
  })
})

describe('buildNinaContext — patterns and the anger ladder (RU-9)', () => {
  const ctx = buildNinaContext(ninaFixtureInput())

  it('spells a clock-unit pattern as a wall clock', () => {
    const late = ctx.patterns.find((p) => p.code === 'REPEATED_LATE_START')!
    expect(late.value).toBe('07:22')
  })

  it('spells a percent-unit pattern to one decimal', () => {
    expect(ctx.patterns.find((p) => p.code === 'REPEATED_HIGH_AVG_HR')!.value).toBe('91.5%')
  })

  it('carries the nag level, so the rung is computed and never chosen', () => {
    expect(ctx.patterns.find((p) => p.code === 'REPEATED_LATE_START')!.nagLevel).toBe(3)
    expect(ctx.patterns.find((p) => p.code === 'REPEATED_LATE_START')!.daysSinceLastMentioned).toBe(
      4,
    )
  })

  it('defaults an unnagged code to level 0 rather than dropping it', () => {
    const hr = ctx.patterns.find((p) => p.code === 'REPEATED_HIGH_AVG_HR')!
    expect(hr.nagLevel).toBe(0)
    expect(hr.daysSinceLastMentioned).toBeNull()
  })

  it('carries the window size, so "3 of your last 5" is a fact and not arithmetic', () => {
    const hr = ctx.patterns.find((p) => p.code === 'REPEATED_HIGH_AVG_HR')!
    expect(hr.occurrences).toBe(3)
    expect(hr.windowRuns).toBe(5)
  })
})
