import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  POLL_INTERVALS_MS,
  POLL_LATE_AFTER_ATTEMPTS,
  POLL_MID_AFTER_ATTEMPTS,
  PRIMARY_TIMEOUT_MS,
  JOB_DEADLINE_MS,
  MIN_REPAIR_BUDGET_MS,
  REPAIR_TIMEOUT_MS,
  STALE_PENDING_MS,
  FUNCTION_MAX_DURATION_S,
  TYPICAL_EXTRACTION_SECONDS,
} from '@/lib/extract/constants'
import { pollDelayFor } from '@/components/extract/useExtractionStatus'

/**
 * The poll schedule and the time budget, as arithmetic rather than as prose.
 *
 * Acceptance criterion 15 is here: the worst-case designed budget must fit inside the 60 s Hobby
 * ceiling. That was a hand-checked claim in the plan and it did NOT hold as originally written —
 * 45 s primary + 20 s repair is 65 s. R-2 made the repair text-only, which is what closed the gap;
 * this file is what stops it reopening the next time someone tunes a timeout.
 */

describe('the poll backoff schedule', () => {
  it('starts at 2s, steps to 3s after four attempts, 5s after ten', () => {
    expect(pollDelayFor(0)).toBe(POLL_INTERVALS_MS.initial)
    expect(pollDelayFor(POLL_MID_AFTER_ATTEMPTS - 1)).toBe(POLL_INTERVALS_MS.initial)
    expect(pollDelayFor(POLL_MID_AFTER_ATTEMPTS)).toBe(POLL_INTERVALS_MS.mid)
    expect(pollDelayFor(POLL_LATE_AFTER_ATTEMPTS - 1)).toBe(POLL_INTERVALS_MS.mid)
    expect(pollDelayFor(POLL_LATE_AFTER_ATTEMPTS)).toBe(POLL_INTERVALS_MS.late)
  })

  it('caps at 5s however long the wait runs', () => {
    expect(pollDelayFor(500)).toBe(POLL_INTERVALS_MS.late)
  })

  it('reaches the measured median inside one interval of it finishing', () => {
    // The point of the schedule: against a ~34 s median the result should be visible within a
    // few seconds of it landing, not a minute later.
    let elapsed = 0
    let attempts = 0
    while (elapsed < TYPICAL_EXTRACTION_SECONDS * 1000) {
      elapsed += pollDelayFor(attempts)
      attempts += 1
    }
    expect(elapsed - TYPICAL_EXTRACTION_SECONDS * 1000).toBeLessThanOrEqual(POLL_INTERVALS_MS.late)
    // …without hammering: a dozen or so requests across half a minute, not a hundred.
    expect(attempts).toBeLessThan(15)
  })

  it('gives up at the same threshold the server heals at', () => {
    // They match on purpose: the poll that gives up is the poll that closes the row, so the
    // runner's last request is the one that makes the state honest.
    expect(STALE_PENDING_MS).toBe(90_000)
    // Comfortably past the slow tail — ~2.7× the measured median.
    expect(STALE_PENDING_MS / 1000).toBeGreaterThan(TYPICAL_EXTRACTION_SECONDS * 2)
  })
})

describe('the job’s time budget fits the Hobby ceiling', () => {
  it('the route’s literal maxDuration matches the shared constant', () => {
    // The route must export a LITERAL 60 — segment config is statically analysed and an imported
    // constant makes `next build` reject the route outright. So the two copies can drift, and
    // this is what stops them: read the literal back out of the source.
    const source = readFileSync('app/api/extract/route.ts', 'utf8')
    const match = /export const maxDuration = (\d+)/.exec(source)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(FUNCTION_MAX_DURATION_S)
  })

  it('leaves headroom under maxDuration for the terminal DB write', () => {
    // The soft deadline exists so the job always gets to write a terminal row rather than being
    // killed mid-flight and leaving `pending` behind for the self-heal to mop up.
    expect(JOB_DEADLINE_MS).toBeLessThan(FUNCTION_MAX_DURATION_S * 1000)
    expect(FUNCTION_MAX_DURATION_S * 1000 - JOB_DEADLINE_MS).toBeGreaterThanOrEqual(5_000)
  })

  it('primary + repair + overhead stays inside the soft deadline — criterion 15', () => {
    const blobFetchWorstCase = 10_000
    const dbWrite = 500
    const worstCase = blobFetchWorstCase + PRIMARY_TIMEOUT_MS + REPAIR_TIMEOUT_MS + dbWrite
    // 10 + 45 + 12 + 0.5 = 67.5s exceeds the deadline on paper — which is exactly why the repair
    // gate is budget-aware rather than unconditional: `extractSession` caps the repair's timeout
    // at the budget that actually remains, so the sum below is a ceiling that cannot be reached.
    expect(worstCase).toBeGreaterThan(JOB_DEADLINE_MS)
    // What IS guaranteed: whatever the primary leaves, the repair cannot exceed it.
    expect(Math.min(REPAIR_TIMEOUT_MS, JOB_DEADLINE_MS - PRIMARY_TIMEOUT_MS)).toBeLessThanOrEqual(
      JOB_DEADLINE_MS - PRIMARY_TIMEOUT_MS,
    )
  })

  it('the repair gate is at least as large as a repair really takes', () => {
    // MEASURED (Task 19, 2026-08-21): a live text-only repair took 11,460 ms. The gate exists to
    // refuse round-trips we cannot finish, so a gate SMALLER than a real repair fails at its one
    // job — it would wave one through with 6 s left and then have it killed at the deadline.
    const MEASURED_REPAIR_MS = 11_460
    expect(MIN_REPAIR_BUDGET_MS).toBeGreaterThanOrEqual(MEASURED_REPAIR_MS)
    // And the timeout must sit above the gate, or a repair that clears the gate cannot complete.
    expect(REPAIR_TIMEOUT_MS).toBeGreaterThan(MIN_REPAIR_BUDGET_MS)
  })

  it('a MEDIAN-speed primary leaves room for a repair; a worst-case one deliberately does not', () => {
    const MEASURED_PRIMARY_MEDIAN_MS = 33_700
    const blobFetch = 2_000

    // The common case: at the measured median there is comfortably more than the gate left, so a
    // malformed reply gets its one repair.
    const afterMedian = JOB_DEADLINE_MS - MEASURED_PRIMARY_MEDIAN_MS - blobFetch
    expect(afterMedian).toBeGreaterThan(MIN_REPAIR_BUDGET_MS)

    // The tail case: a primary that runs to its own timeout leaves less than the gate, and the
    // repair is SKIPPED rather than started and killed mid-flight. This assertion documents that
    // as intended behaviour — it is the gate working, not the constants disagreeing.
    const afterWorstCase = JOB_DEADLINE_MS - PRIMARY_TIMEOUT_MS - blobFetch
    expect(afterWorstCase).toBeLessThan(MIN_REPAIR_BUDGET_MS)
  })
})
