import { describe, expect, it } from 'vitest'

import { TRUTH } from '../research/schema.mjs'
import { canonicalRecordRun, canonicalSession } from './fixtures/canonicalRun'

/**
 * **The drift guard for D13.** `research/schema.mjs`'s `TRUTH` is the 108-field hand-transcribed
 * ground truth; `tests/fixtures/canonicalRun.ts` is its production-shaped port, and every metric
 * acceptance value in F06 is asserted against the port, not against `TRUTH` directly.
 *
 * That split is deliberate — production types are DB-row-shaped so no adapter sits between a query
 * result and `computeSessionMetrics` — but it creates exactly one way to lose the guarantee: edit
 * one file and not the other. Then `score.mjs` still reports 108/108, every metric test still
 * passes, and the two are quietly describing different runs.
 *
 * This file is the tripwire. It re-derives the port from `TRUTH` field by field, using the §1.1
 * remap table, and fails if a single number has moved on either side.
 */
describe('the canonical fixture port matches research/schema.mjs’s TRUTH', () => {
  it('scalars survive the remap', () => {
    expect(canonicalSession.distanceM).toBe(Math.round(TRUTH.distanceKm * 1000))
    expect(canonicalSession.durationSec).toBe(TRUTH.durationSec)
    expect(canonicalSession.avgHrBpm).toBe(TRUTH.avgHrBpm)
    expect(canonicalRecordRun.maxHr).toBe(TRUTH.maxHrBpm)
    expect(canonicalRecordRun.avgPaceSec).toBe(TRUTH.avgPaceSecPerKm)
    expect(canonicalRecordRun.activeKcal).toBe(TRUTH.activeKcal)
    expect(canonicalRecordRun.elevationM).toBe(TRUTH.elevationGainM)
    expect(canonicalRecordRun.avgCadence).toBe(TRUTH.avgCadenceSpm)
  })

  it('the date label and location still describe Thu 20 Aug in Tangerang', () => {
    // occurredOn is the one field the port states rather than derives — TRUTH carries only the
    // screenshot's 'Thu, 20 Aug' label, with no year on it.
    expect(TRUTH.dateLabel).toBe('Thu, 20 Aug')
    expect(TRUTH.location).toBe('Tangerang')
    expect(canonicalSession.occurredOn).toBe('2026-08-20')
  })

  it('every split row maps across, including the partial eleventh', () => {
    expect(canonicalSession.splits).toHaveLength(TRUTH.splits.length)
    expect(canonicalSession.splits.map((s) => ({ ...s }))).toEqual(
      TRUTH.splits.map((t) => ({
        km: t.km,
        timeSec: t.timeSec,
        paceSec: t.paceSecPerKm,
        hr: t.hrBpm,
        cadence: t.cadenceSpm,
        partial: t.partial,
      })),
    )
  })

  it('exactly one split is partial, and it is the last one (D14)', () => {
    const partials = canonicalSession.splits.filter((s) => s.partial)
    expect(partials).toHaveLength(1)
    expect(partials[0]!.km).toBe(11)
  })

  it('zone rows need no remap at all — the field names already match', () => {
    expect(canonicalSession.zones.map((z) => ({ ...z }))).toEqual(TRUTH.hrZones)
  })

  it('the recovery pair is postWorkoutHr[0] and [1], and the +2 min reading is dropped (R-9)', () => {
    expect(TRUTH.postWorkoutHr).toHaveLength(3)
    expect(canonicalSession.recovery).toEqual({
      endHrBpm: TRUTH.postWorkoutHr[0]!.bpm,
      hrAt1MinBpm: TRUTH.postWorkoutHr[1]!.bpm,
    })
    // No metric consumes the 2-minute reading and no column stores it. Stated as a test so a
    // future reader does not "fix" the fixture by adding a third field.
    expect(TRUTH.postWorkoutHr[2]!.label).toBe('2 MIN')
    expect(Object.keys(canonicalSession.recovery!)).toEqual(['endHrBpm', 'hrAt1MinBpm'])
  })
})
