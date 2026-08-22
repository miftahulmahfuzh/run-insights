import { describe, expect, it } from 'vitest'

import {
  BADGE_CATALOG,
  BADGE_KEYS,
  BADGE_THRESHOLDS,
  badgeDefinition,
  badgeScope,
  badgeTitle,
  catalogIndex,
  isBadgeKey,
} from '@/lib/badges/catalog'
import { BADGE_META } from '@/lib/badges/meta'

/**
 * The catalog is roadmap §4.6 (as amended by R-33) encoded as data, so this file reads the roadmap's
 * table back out of the code: **22 keys, in the roadmap's order, each with a title and a scope.**
 *
 * This is the test F10 depends on most. `gen_badge_art.py` refuses to start unless its scene list
 * equals `BADGE_KEYS`, and it spends ~$0.04 per image — a silent drift here is a wrong shelf and a
 * wasted generation run, discovered after the money is gone.
 */
describe('the catalog is the §4.6 table', () => {
  it('has exactly the 22 keys, in roadmap order', () => {
    expect(BADGE_KEYS).toEqual([
      'early_bird',
      'late_start',
      'self_reward',
      'negative_split',
      'metronome',
      'fast_start_fool',
      'redline_republic',
      'sandbagger',
      'cadence_collapse',
      'warmup_who',
      'groundhog_day',
      'tourist',
      'century_club',
      'double_century',
      'half_ish',
      'sweat_equity',
      'new_ceiling',
      'consistency_gremlin',
      'dawn_patrol',
      'long_way_home',
      'two_a_days',
      'boring_excellence',
    ])
  })

  it('keeps the three R-33 restorations and the two R-33 adoptions, and no rain_tax', () => {
    // R-33 in full: the design dropped three and invented three; two were adopted and `rain_tax`
    // was cut because Apple Fitness screenshots carry no weather data, so it could never fire.
    for (const key of [
      'sandbagger',
      'warmup_who',
      'double_century',
      'two_a_days',
      'boring_excellence',
    ])
      expect(BADGE_KEYS).toContain(key)
    expect(BADGE_KEYS).not.toContain('rain_tax')
  })

  it('names each key’s title and scope', () => {
    const spec = Object.fromEntries(BADGE_CATALOG.map((b) => [b.key, `${b.scope}/${b.title}`]))
    expect(spec).toEqual({
      early_bird: 'session/Early Bird',
      late_start: 'session/Fashionably Late',
      self_reward: 'week/Self-Reward Achieved',
      negative_split: 'session/Finished the Job',
      metronome: 'session/Metronome',
      fast_start_fool: 'session/Went Out Like a Hero',
      redline_republic: 'session/Citizen of Redline Republic',
      sandbagger: 'session/Suspiciously Sensible',
      cadence_collapse: 'session/Legs Have Left the Chat',
      warmup_who: 'session/Warm-Up? Never Met Her',
      groundhog_day: 'session/Groundhog Day',
      tourist: 'session/Tourist',
      century_club: 'month/Century Club',
      double_century: 'month/Double Century',
      half_ish: 'session/Half-ish',
      sweat_equity: 'session/Sweat Equity',
      new_ceiling: 'session/New Ceiling',
      consistency_gremlin: 'week/Consistency Gremlin',
      dawn_patrol: 'lifetime/Dawn Patrol',
      long_way_home: 'session/The Long Way Home',
      two_a_days: 'session/Two-a-Days',
      boring_excellence: 'session/Boring Excellence',
    })
  })

  it('has no duplicate key', () => {
    expect(new Set(BADGE_KEYS).size).toBe(BADGE_KEYS.length)
  })

  it('resolves a retired or unknown key to null rather than throwing', () => {
    // §2's retirement mechanism: a `badges` row from a key the catalog no longer defines must drop
    // out of the shelf quietly, never take the /me page down with it.
    expect(badgeTitle('rain_tax')).toBeNull()
    expect(badgeDefinition('rain_tax')).toBeNull()
    expect(isBadgeKey('rain_tax')).toBe(false)
    expect(isBadgeKey('early_bird')).toBe(true)
    expect(isBadgeKey(42)).toBe(false)
    // And it sorts to the end rather than to the front, which a -1 index would do.
    expect(catalogIndex('rain_tax')).toBeGreaterThan(catalogIndex('boring_excellence'))
  })

  it('exposes each key’s scope for the isNews decision', () => {
    expect(badgeScope('early_bird')).toBe('session')
    expect(badgeScope('self_reward')).toBe('week')
    expect(badgeScope('century_club')).toBe('month')
    expect(badgeScope('dawn_patrol')).toBe('lifetime')
  })
})

describe('R-44 — progress descriptors exist only where progress is a number', () => {
  it('gives one to exactly the five accumulating badges', () => {
    const withProgress = BADGE_CATALOG.filter((b) => b.progress).map((b) => b.key)
    expect(withProgress).toEqual([
      'self_reward',
      'century_club',
      'double_century',
      'consistency_gremlin',
      'dawn_patrol',
    ])
  })

  it('gives none to any session-scoped shape rule', () => {
    // "You're 12% of the way to spending 40% of a run in zone 5" is the sentence R-44 forbids, and
    // the absence of a descriptor is what makes it unwritable.
    for (const definition of BADGE_CATALOG) {
      if (definition.scope === 'session') expect(definition.progress).toBeUndefined()
    }
  })

  it('points each descriptor at the same threshold its rule uses', () => {
    // R-42's failure was copy that restated a threshold and drifted from it. The descriptor is a
    // third place the number could drift, so it is asserted against the same constant.
    const target = (key: string) => BADGE_CATALOG.find((b) => b.key === key)?.progress?.target
    expect(target('century_club')).toBe(BADGE_THRESHOLDS.centuryM)
    expect(target('double_century')).toBe(BADGE_THRESHOLDS.doubleCenturyM)
    expect(target('self_reward')).toBe(BADGE_THRESHOLDS.weekRunTarget)
    expect(target('dawn_patrol')).toBe(BADGE_THRESHOLDS.dawnRunCount)
    expect(target('consistency_gremlin')).toBe(BADGE_THRESHOLDS.gremlinWeeks)
  })
})

describe('R-32 / R-42 — Century Club is 100 km and the copy says so', () => {
  it('renders its condition from the threshold, not from a hand-written string', () => {
    // The design shipped "Century Club — 200 km in a calendar month", which R-32 ruled wrong and
    // R-42 diagnosed: copy restating a threshold is a second source of truth for it.
    expect(BADGE_THRESHOLDS.centuryM).toBe(100_000)
    expect(BADGE_META.century_club.condition).toContain('100 km')
    expect(BADGE_META.century_club.condition).not.toContain('200 km')
    expect(BADGE_META.double_century.condition).toContain('200 km')
  })
})

describe('the copy — all 22, in register', () => {
  it('has a condition and a gloss for every key', () => {
    // BADGE_META is a total Record, so a missing key is already a compile error. What this catches
    // is an EMPTY entry, which types cannot see.
    for (const key of BADGE_KEYS) {
      expect(BADGE_META[key].condition.length).toBeGreaterThan(10)
      expect(BADGE_META[key].gloss.length).toBeGreaterThan(20)
    }
  })

  it('never addresses the runner in the second person, in any condition', () => {
    // §3's register rule, and the reason for it: one string has to serve both the earned and the
    // locked state on /me. A sentence with a "you" in it cannot do that, and — per §4.6's tone rule
    // — a sentence with no "you" in it cannot become a joke at the runner's expense either.
    for (const key of BADGE_KEYS) {
      expect(BADGE_META[key].condition).not.toMatch(/\byou(r|'re|’re)?\b/i)
      expect(BADGE_META[key].condition).not.toContain('!')
      expect(BADGE_META[key].gloss).not.toMatch(/\byou(r|'re|’re)?\b/i)
      expect(BADGE_META[key].gloss).not.toContain('!')
    }
  })

  it('stays inside F12\u2019s length budget \u2014 one clause, one line', () => {
    /*
     * The first cut of `meta.ts` spent 3330 characters on 22 badges, most of it a gloss restating
     * what the condition above it had already said. It was halved on instruction, and this is the
     * mechanism that keeps it halved: every other rule in that file is a rule about *voice*, and a
     * rule about voice does not stop a sentence from growing a second clause.
     *
     * Per-string caps rather than only a total, because a total lets one badge eat another's
     * budget. `boring_excellence` is the outlier and is allowed to be: it genuinely names three
     * separate numbers, which is why the condition cap is not tighter than 100.
     */
    let total = 0
    for (const key of BADGE_KEYS) {
      const { condition, gloss } = BADGE_META[key]
      expect(condition.length, `${key} condition`).toBeLessThanOrEqual(100)
      expect(gloss.length, `${key} gloss`).toBeLessThanOrEqual(70)
      // One sentence, or at most two short ones. Three is a paragraph.
      expect((gloss.match(/[.?]/g) ?? []).length, `${key} gloss sentences`).toBeLessThanOrEqual(2)
      total += condition.length + gloss.length
    }
    // Half of 3330, with nothing to spare. Raising this number is a decision, not a tidy-up.
    expect(total).toBeLessThanOrEqual(1665)
  })

  it('states each threshold once, through lib/format.ts', () => {
    // R-23: the unit comes from the formatter, so a condition can never spell `10,67 km`.
    expect(BADGE_META.sweat_equity.condition).toContain('1000 kcal')
    expect(BADGE_META.cadence_collapse.condition).toContain('15 spm')
    expect(BADGE_META.half_ish.condition).toContain('21.10 km')
    expect(BADGE_META.groundhog_day.condition).toContain('100 m')
    expect(BADGE_META.early_bird.condition).toContain('05:00')
    expect(BADGE_META.early_bird.condition).toContain('05:30')
    expect(BADGE_META.dawn_patrol.condition).toContain('06:00')
  })
})

describe('period scope ⟺ min-count threshold — the invariant F27 round 3 rests on', () => {
  /*
   * `evaluate.ts` stamps EVERY earn with the committing run, period ones included, on one argument:
   * a period badge is a count threshold, and a threshold is crossed by a run. That argument is
   * blanket rather than per-badge, and this is what licenses it.
   *
   * R-44's `progress` spec is defined as an accumulating quantity with a target — precisely a
   * min-count. So if the set of badges carrying one is exactly the set of non-session badges, then
   * "period" and "has a threshold a run can cross" are the same set, and one `runId` is honest for
   * all of them.
   *
   * When this test fails, it is telling the author of a new badge to make a decision rather than
   * inherit one. Two ways it can fail, and what each means:
   *
   *   - a **period badge with no `progress`** — something week/month/lifetime-scoped that is not a
   *     count. There may be no run that "completed" it, and `evaluate.ts`'s blanket `runId` would
   *     then name a run that merely happened to be committed at the time. Decide explicitly.
   *   - a **session badge WITH `progress`** — R-44 forbids it for its own reasons ("you're 12% of
   *     the way to spending 40% of a run in zone 5"), and it would also make this test's shorthand
   *     stop meaning what it says.
   */
  it('gives a progress spec to every non-session badge and to no session badge', () => {
    const period = BADGE_CATALOG.filter((d) => d.scope !== 'session').map((d) => d.key)
    const withProgress = BADGE_CATALOG.filter((d) => d.progress).map((d) => d.key)

    expect([...withProgress].sort()).toEqual([...period].sort())
    // Named, so the failure message says which five rather than only how many.
    expect([...period].sort()).toEqual([
      'century_club',
      'consistency_gremlin',
      'dawn_patrol',
      'double_century',
      'self_reward',
    ])
  })

  it('gives every one of them a positive target — a threshold a run can cross', () => {
    // A target of 0 or below is satisfied before the account has any runs, so no commit "reaches"
    // it and `evaluate.ts` would be naming an arbitrary run.
    for (const definition of BADGE_CATALOG.filter((d) => d.scope !== 'session')) {
      expect(definition.progress).toBeDefined()
      expect(definition.progress!.target).toBeGreaterThan(0)
    }
  })
})
