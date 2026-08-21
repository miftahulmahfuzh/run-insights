import { describe, expect, it } from 'vitest'

import { BADGE_KEYS } from '@/lib/badges/catalog'
import type { PeriodFacts } from '@/lib/badges/evaluate'
import { BADGE_META } from '@/lib/badges/meta'
import { buildShelf } from '@/lib/badges/shelf'
import type { StoredBadge } from '@/lib/badges/types'

/**
 * §10.2's shelf decision, as data: **all 22 slots always, nothing redacted, catalog order** — plus
 * R-44's progress line on exactly the badges that accumulate.
 */

const FACTS: PeriodFacts = {
  week: { weekKey: '2026-W34', runsThisWeek: 2, consecutiveQualifyingWeeks: 1 },
  month: { monthKey: '2026-08', monthDistanceM: 116_000 },
  lifetime: { dawnRunCount: 6 },
}

/** The canonical fixture's seven, as they would sit in `badges` after one commit. */
const FIXTURE_ROWS: StoredBadge[] = [
  'late_start',
  'fast_start_fool',
  'redline_republic',
  'cadence_collapse',
  'tourist',
  'new_ceiling',
  'long_way_home',
].map((key) => ({
  key,
  runId: 'run_canonical',
  scopeKey: null,
  firstEarnedOn: '2026-08-20',
  earnedOn: '2026-08-20',
  count: 1,
}))

describe('buildShelf', () => {
  const shelf = buildShelf(FIXTURE_ROWS, FACTS)

  it('renders all 22 slots in catalog order, whatever is earned', () => {
    expect(shelf.entries.map((e) => e.key)).toEqual([...BADGE_KEYS])
  })

  it('counts seven earned and fifteen to find, on the canonical account', () => {
    expect(shelf.earnedCount).toBe(7)
    expect(shelf.lockedCount).toBe(15)
  })

  it('carries both earned dates and the count on an earned entry', () => {
    const earned = shelf.entries.find((e) => e.key === 'late_start')!
    expect(earned.earned).toEqual({
      firstEarnedOn: '2026-08-20',
      earnedOn: '2026-08-20',
      count: 1,
    })
    expect(earned.progress).toBeNull()
  })

  it('carries the FIRST earning through, so the panel can print a span (F13)', () => {
    // The two dates come off the ledger's extremes and the shelf passes both along untouched —
    // before F13 the first was not recorded anywhere and could only have been invented.
    const span = buildShelf(
      [
        {
          key: 'early_bird',
          runId: 'run_latest',
          scopeKey: null,
          firstEarnedOn: '2026-07-04',
          earnedOn: '2026-08-20',
          count: 12,
        },
      ],
      FACTS,
    )
    expect(span.entries.find((e) => e.key === 'early_bird')!.earned).toEqual({
      firstEarnedOn: '2026-07-04',
      earnedOn: '2026-08-20',
      count: 12,
    })
  })

  it('shows a locked badge its full condition and gloss — nothing is teased', () => {
    // §10.2: `meta.ts`' impersonal register exists so ONE string serves both states. Hiding the
    // sentence engineered for dual use would defeat the reason it reads that way.
    const locked = shelf.entries.find((e) => e.key === 'half_ish')!
    expect(locked.earned).toBeNull()
    expect(locked.condition).toBe(BADGE_META.half_ish.condition)
    expect(locked.gloss).toBe(BADGE_META.half_ish.gloss)
  })

  it('does not sort earned-first — that would be a progress bar in disguise', () => {
    // `early_bird` is locked and first; `late_start` is earned and second. Catalog order treats the
    // shelf as a fixed reference table, which is what §10.2's argument depends on.
    expect(shelf.entries[0]!.key).toBe('early_bird')
    expect(shelf.entries[0]!.earned).toBeNull()
    expect(shelf.entries[1]!.key).toBe('late_start')
    expect(shelf.entries[1]!.earned).not.toBeNull()
  })

  it('drops a retired key rather than throwing on it', () => {
    // §2's retirement mechanism: rows for a removed key stay in the table, inert, and never appear.
    const withGhost = buildShelf(
      [
        ...FIXTURE_ROWS,
        {
          key: 'rain_tax',
          runId: null,
          scopeKey: null,
          firstEarnedOn: '2025-11-01',
          earnedOn: '2026-01-01',
          count: 3,
        },
      ],
      FACTS,
    )
    expect(withGhost.entries.map((e) => e.key)).not.toContain('rain_tax')
    expect(withGhost.earnedCount).toBe(7)
  })
})

describe('R-44 — the locked progress line', () => {
  const shelf = buildShelf(FIXTURE_ROWS, FACTS)
  const entry = (key: string) => shelf.entries.find((e) => e.key === key)!

  it('measures distance for the two month badges, in the design’s own form', () => {
    // The design's example, corrected by R-32: "200 km in a calendar month — you're at 116".
    expect(entry('double_century').progress?.sentence).toBe("You're at 116 km this month.")
    expect(entry('double_century').progress?.target).toBe(200_000)
    expect(entry('century_club').progress?.sentence).toBe("You're at 116 km this month.")
  })

  it('counts runs for the week badge and the lifetime one', () => {
    expect(entry('self_reward').progress?.sentence).toBe("You're at 2 of 4 this week.")
    expect(entry('dawn_patrol').progress?.sentence).toBe("You're at 6 of 10 so far.")
    expect(entry('consistency_gremlin').progress?.sentence).toBe('1 of 4 weeks so far.')
  })

  it('gives no progress line to any session-scoped shape rule', () => {
    // "You're 12% of the way to spending 40% of a run in zone 5" is the sentence R-44 forbids.
    for (const key of [
      'redline_republic',
      'negative_split',
      'tourist',
      'metronome',
      'warmup_who',
    ]) {
      expect(entry(key).progress).toBeNull()
    }
  })

  it('gives no progress line to a badge already earned', () => {
    const earnedCentury = buildShelf(
      [
        ...FIXTURE_ROWS,
        {
          key: 'century_club',
          runId: null,
          scopeKey: '2026-08',
          firstEarnedOn: '2026-08-25',
          earnedOn: '2026-08-25',
          count: 1,
        },
      ],
      FACTS,
    )
    const row = earnedCentury.entries.find((e) => e.key === 'century_club')!
    expect(row.earned).not.toBeNull()
    expect(row.progress).toBeNull()
  })
})
