import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAllTimeTotals, getReviewedRunWindow } from '@/lib/db/queries'
import { resolveHrMax } from '@/lib/metrics'
import { dbNinaSourceGateway } from '@/lib/nina/gateway'
import { PATTERN_RUN_FETCH_LIMIT } from '@/lib/nina/patterns'
import { getNinaMemorySlots, getNinaMessageWindow, getNinaNags } from '@/lib/nina/queries'

/**
 * **RULING G6's exit test, and it is a phase-boundary assertion rather than a unit test.**
 *
 * `readFiredPatterns` and `readNags` shipped as `() => []` while phase 9 was unlanded — the
 * interface's own documented empty case, which is what let phase 2 land green. Phase 9 then
 * shipped `evaluatePatterns` as a PURE function, so nothing in the app actually resolved its
 * inputs, and `NinaContext.patterns` stayed permanently empty. That is invisible: every type
 * checks, every test passes, and phase 10's `pattern_crossed` trigger is dead code that never
 * fires and never errors.
 *
 * So the property under test is not "the arithmetic is right" — `tests/nina.patterns.test.ts`
 * owns that, at every threshold, on both sides. It is **"a seeded offender comes back non-empty
 * through this gateway"**: the stub is gone, the wiring exists, and it cannot silently return to
 * `[]` without failing here.
 *
 * Every source is mocked. The real ones reach Neon, and `dbNinaSourceGateway` opens with
 * `import 'server-only'` — aliased by `vitest.config.ts`, so importing it is safe; querying
 * through it would not be.
 */

vi.mock('@/lib/db/queries', () => ({
  getAllTimeTotals: vi.fn(),
  getReviewedRunWindow: vi.fn(),
  getReviewedRunsWithChildren: vi.fn(),
}))
vi.mock('@/lib/metrics', () => ({
  resolveHrMax: vi.fn(),
  computeSessionMetrics: vi.fn(),
  evaluateSessionFlags: vi.fn(),
}))
vi.mock('@/lib/nina/queries', () => ({
  appendNinaMemoryFacts: vi.fn(),
  getNinaIdentity: vi.fn(),
  getNinaMemorySlot: vi.fn(),
  getNinaMemorySlots: vi.fn(),
  getNinaMessageWindow: vi.fn(),
  getNinaNags: vi.fn(),
  insertNinaTurn: vi.fn(),
  listNinaMemoryFacts: vi.fn(),
  upsertNinaMemorySlot: vi.fn(),
}))

const window = vi.mocked(getReviewedRunWindow)
const totals = vi.mocked(getAllTimeTotals)
const hrMax = vi.mocked(resolveHrMax)
const slots = vi.mocked(getNinaMemorySlots)
const nags = vi.mocked(getNinaNags)

/** A run that started after 07:00 — `PATTERN_THRESHOLDS.lateStartAfterSec`, strictly exceeded. */
function lateRun(id: string, occurredOn: string) {
  return {
    id,
    occurredOn,
    startedAt: '07:45:00',
    distanceM: 5000,
    durationSec: 1800,
    avgHr: 150,
    avgPaceSec: 360,
    splits: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.mockResolvedValue([])
  totals.mockResolvedValue({
    runCount: 0,
    distanceM: 0,
    durationSec: 0,
    firstRunOn: null,
    lastRunOn: null,
  })
  hrMax.mockResolvedValue(null)
  slots.mockResolvedValue([])
  nags.mockResolvedValue([])
})

describe('readFiredPatterns — the phase 9 stub is gone', () => {
  it('returns a fired code for a seeded offender, rather than the empty array it used to', async () => {
    // Three late starts in the last five runs. `repeatedRuns` is 2 and strictly exceeded, so this
    // is the smallest window that fires — the same "3 of your last 5" the rule's own test reads.
    window.mockResolvedValue([
      lateRun('r5', '2026-09-01'),
      lateRun('r4', '2026-08-30'),
      lateRun('r3', '2026-08-28'),
      { ...lateRun('r2', '2026-08-26'), startedAt: '05:30:00' },
      { ...lateRun('r1', '2026-08-24'), startedAt: '05:30:00' },
    ] as never)
    totals.mockResolvedValue({
      runCount: 5,
      distanceM: 25000,
      durationSec: 9000,
      firstRunOn: '2026-08-24',
      lastRunOn: '2026-09-01',
    })

    const fired = await dbNinaSourceGateway.readFiredPatterns('user_1')

    expect(fired.length).toBeGreaterThan(0)
    expect(fired.map((pattern) => pattern.code)).toContain('REPEATED_LATE_START')
  })

  it('asks for the number of runs phase 9 says it needs, not a number it guessed', async () => {
    await dbNinaSourceGateway.readFiredPatterns('user_1')
    expect(window).toHaveBeenCalledWith(
      'user_1',
      // Inclusive end-of-day, because the comparison is `<=` on (occurred_on, started_at).
      expect.objectContaining({ startedAt: '23:59:59' }),
      PATTERN_RUN_FETCH_LIMIT,
    )
  })

  it('feeds the running_days slot through phase 5s parser, so MISSED_USUAL_DAY can fire at all', async () => {
    slots.mockResolvedValue([
      { key: 'running_days', value: 'Selasa, Kamis', updatedAt: new Date() },
    ] as never)
    // No throw and no crash on a real slot value is the assertion — the rule's own arithmetic is
    // `tests/nina.patterns.test.ts`'s. What matters here is that the value reaches it parsed.
    await expect(dbNinaSourceGateway.readFiredPatterns('user_1')).resolves.toBeInstanceOf(Array)
    expect(slots).toHaveBeenCalledWith('user_1')
  })

  it('is scoped to the caller (invariant 7) — every read takes the same userId', async () => {
    await dbNinaSourceGateway.readFiredPatterns('user_1')
    for (const source of [totals, hrMax, slots]) {
      expect(source).toHaveBeenCalledWith('user_1')
    }
  })
})

describe('readNags — the phase 9 stub is gone', () => {
  it('returns the stored ledger rows in phase 2s shape', async () => {
    nags.mockResolvedValue([
      {
        code: 'REPEATED_LATE_START',
        level: 2,
        count: 4,
        lastMentionedOn: '2026-08-30',
        updatedAt: new Date(),
      },
    ] as never)

    await expect(dbNinaSourceGateway.readNags('user_1')).resolves.toEqual([
      { code: 'REPEATED_LATE_START', level: 2, lastMentionedOn: '2026-08-30' },
    ])
  })

  it('reports the STORED level, undecayed — decaying it here would decay it twice', async () => {
    // `decayedNagLevel`'s own warning: the projection preserves `lastMentionedOn` so phase 2's
    // `daysSinceLastMentioned` stays truthful, which means re-projecting a projection decays a
    // second time from the same anchor. The gateway reads; `buildNinaContext` decays.
    nags.mockResolvedValue([
      {
        code: 'ACWR_SPIKE',
        level: 3,
        count: 9,
        lastMentionedOn: '2020-01-01',
        updatedAt: new Date(),
      },
    ] as never)

    const [row] = await dbNinaSourceGateway.readNags('user_1')
    expect(row?.level).toBe(3)
  })

  it('returns [] for a runner she has never nagged', async () => {
    await expect(dbNinaSourceGateway.readNags('user_1')).resolves.toEqual([])
  })
})

/**
 * **Phase 3's exit test, and it is a phase-boundary assertion exactly as `readFiredPatterns`'s
 * above is.**
 *
 * F35 R2's own words are that a new session exists so he can "focus on a new topic", and assumption
 * A1 reads that as a claim about what Nina is GIVEN TO READ. The path that decides it is
 * `loadNinaContext` -> `readMessageWindow` -> `getNinaMessageWindow`, and the failure mode is
 * silent in the same way the phase-9 stub was: every type checks, every other test passes, and she
 * simply goes on reading the last forty messages of a conversation the screen no longer shows. So
 * the property under test is "the session id survives the gateway", not the mapping — which is one
 * line and obvious, and which would still be one line and obvious with the id dropped.
 *
 * The companion property is the asymmetry (phase 3's D4): the window is scoped, `olderCount` is
 * passed through untouched from a user-wide count, and a test that "tidied" the count into the
 * session would take out the guard that stops her introducing herself in every new session.
 */
describe('readMessageWindow — the session reaches the query (F35 phase 3, R2/A1)', () => {
  const messageWindow = vi.mocked(getNinaMessageWindow)

  it('passes the session id through to getNinaMessageWindow', async () => {
    messageWindow.mockResolvedValue({ messages: [], olderCount: 0 })

    await dbNinaSourceGateway.readMessageWindow('user_1', 40, 'sessionAAAAA')

    expect(messageWindow).toHaveBeenCalledWith('user_1', 40, 'sessionAAAAA')
  })

  it('returns olderCount untouched, so the user-wide count survives the boundary', async () => {
    messageWindow.mockResolvedValue({
      messages: [
        {
          id: 'msgAAAAAAAAA',
          seq: 9,
          sessionId: 'sessionAAAAA',
          role: 'runner',
          body: 'pagi',
          createdAt: new Date('2026-09-04T00:00:00Z'),
          source: 'chat',
          turnId: null,
          replyToId: null,
          runId: null,
          readAt: null,
        },
      ],
      /* Messages of his that this window does not show — including everything in his OTHER
       * sessions. Non-zero with a one-message window is the normal case after a new session is
       * opened, and it is what keeps `prompts/system.ts`'s "you have never spoken to him" branch
       * from firing on a runner she has known for months. */
      olderCount: 312,
    })

    const result = await dbNinaSourceGateway.readMessageWindow('user_1', 40, 'sessionAAAAA')

    expect(result.olderCount).toBe(312)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]?.text).toBe('pagi')
  })
})
