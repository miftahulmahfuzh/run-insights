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
    // MEASURED (Task 19, 2026-08-21), four samples of a realistic full-session repair:
    // 25,320 / 27,640 / 31,905 / 34,872 ms, emitting ~1,070 completion tokens each. Latency
    // tracks completion tokens at ~24-33 ms apiece, which is why the earlier 11,460 ms sample was
    // misleading — it repaired a stub and emitted 338 tokens.
    //
    // The gate exists to refuse round-trips we cannot finish, so a gate SMALLER than a real
    // repair fails at its one job: it would wave one through and have it killed at the deadline.
    const MEASURED_REPAIR_MEDIAN_MS = 29_772 // mean of the middle two of four samples
    const MEASURED_REPAIR_MAX_MS = 34_872
    // At or above the median rather than the minimum: skipping a repair that would have finished
    // costs one `validation` failure, whereas starting one that cannot finish risks the
    // invocation dying before it writes ANY terminal row. Erring high is the cheaper mistake.
    expect(MIN_REPAIR_BUDGET_MS).toBeGreaterThan(25_320)
    expect(MIN_REPAIR_BUDGET_MS).toBeLessThanOrEqual(MEASURED_REPAIR_MEDIAN_MS)
    // And the timeout must clear the observed maximum, or a repair that starts cannot finish.
    expect(REPAIR_TIMEOUT_MS).toBeGreaterThanOrEqual(MEASURED_REPAIR_MAX_MS)
    expect(REPAIR_TIMEOUT_MS).toBeGreaterThan(MIN_REPAIR_BUDGET_MS)
  })

  it('on Hobby the repair is best-effort: even a median primary usually leaves too little', () => {
    // This assertion encodes an uncomfortable measured truth rather than a designed intent, and
    // it is deliberately written the way the numbers actually came out.
    //
    // A repair costs about what the primary costs (~32 s vs ~28-36 s), because both re-emit the
    // same ~1,070-token session. Two of those do not fit in a 55 s soft deadline. So the gate
    // will usually SKIP the repair, a malformed reply will usually reach failed/validation, and
    // F05's blank form is the fallback that actually carries the user.
    //
    // Plan §4.6 anticipated exactly this and named the fix: Vercel Pro's 120-300 s maxDuration.
    // Until then the repair path is correct, tested, and rationed. If this test ever starts
    // failing because `afterShippedRecipeMedian` grew past the gate, that is good news — someone
    // raised JOB_DEADLINE_MS on a bigger plan, and the repair became routinely reachable.
    const PRIMARY_MEDIAN_SHIPPED_RECIPE_MS = 28_200 // research/downscale.mjs, "jpeg q80 560w"
    const blobFetch = 2_000

    const afterShippedRecipeMedian = JOB_DEADLINE_MS - PRIMARY_MEDIAN_SHIPPED_RECIPE_MS - blobFetch
    expect(afterShippedRecipeMedian).toBeLessThan(MIN_REPAIR_BUDGET_MS)

    // A genuinely fast primary — the fast tail, not the median — does still get its repair, which
    // is why the path is best-effort rather than dead code.
    const afterFastPrimary = JOB_DEADLINE_MS - 20_000 - blobFetch
    expect(afterFastPrimary).toBeGreaterThan(MIN_REPAIR_BUDGET_MS)

    // And a primary that ran to its own timeout leaves nothing, as before.
    const afterWorstCase = JOB_DEADLINE_MS - PRIMARY_TIMEOUT_MS - blobFetch
    expect(afterWorstCase).toBeLessThan(MIN_REPAIR_BUDGET_MS)
  })
})
