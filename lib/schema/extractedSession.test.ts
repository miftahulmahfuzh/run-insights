import { describe, expect, it } from 'vitest'

import { TRUTH } from '../../research/schema.mjs'
import {
  ALL_SESSION_FIELDS,
  FIELD_SOURCES,
  emptyExtractedSession,
  fieldIsReachable,
  makeExtractedSessionSchema,
  normalizeClockTime,
  RawExtractedSession,
  sectionForField,
  type ScreenKind,
} from './extractedSession'

const ALL_KINDS: ReadonlySet<ScreenKind> = new Set(['summary', 'splits', 'heartrate'])
const schemaFor = (...kinds: ScreenKind[]) => makeExtractedSessionSchema(new Set(kinds))

describe('the ground truth round-trips', () => {
  it('accepts all 108 hand-transcribed fields of the canonical fixture unchanged', () => {
    const parsed = schemaFor('summary', 'splits', 'heartrate').safeParse(TRUTH)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    // Every scalar, verbatim. If the schema ever narrows a range past a real fixture value, this
    // is where it shows up — not in production on the next unflattering run.
    expect(parsed.data.distanceKm).toBe(10.67)
    expect(parsed.data.durationSec).toBe(4716)
    expect(parsed.data.avgPaceSecPerKm).toBe(442)
    expect(parsed.data.avgHrBpm).toBe(173)
    expect(parsed.data.maxHrBpm).toBe(189)
    expect(parsed.data.restingHrBpm).toBe(72)
    expect(parsed.data.avgCadenceSpm).toBe(144)
    expect(parsed.data.activeKcal).toBe(646)
    expect(parsed.data.totalKcal).toBe(747)
    expect(parsed.data.elevationGainM).toBe(15)
    expect(parsed.data.location).toBe('Tangerang')
    expect(parsed.data.startTime).toBe('07:07')

    expect(parsed.data.splits).toHaveLength(11)
    expect(parsed.data.hrZones).toHaveLength(5)
    expect(parsed.data.postWorkoutHr).toHaveLength(3)
  })

  it('keeps D14’s partial final kilometre flagged as partial and nothing else', () => {
    const parsed = schemaFor('summary', 'splits', 'heartrate').parse(TRUTH)
    const partials = parsed.splits.filter((s) => s.partial)
    expect(partials).toHaveLength(1)
    // km 11 is 0.67 km: 288 s elapsed at a 429 s/km pace. Averaging it in makes the fade look
    // like a sprint, which is exactly why it is stored and excluded rather than dropped.
    expect(partials[0]).toMatchObject({ km: 11, timeSec: 288, paceSecPerKm: 429 })
  })

  it('accepts zone 1’s null floor and zone 5’s null ceiling', () => {
    const parsed = schemaFor('heartrate').parse(TRUTH)
    expect(parsed.hrZones[0]).toMatchObject({ zone: 1, minBpm: null, maxBpm: 140 })
    expect(parsed.hrZones[4]).toMatchObject({ zone: 5, minBpm: 175, maxBpm: null })
  })
})

describe('the vendor does not enforce `required` — so Zod does', () => {
  it('rejects a split row missing hrBpm rather than defaulting it', () => {
    // The measured failure (IMPLEMENTATION_PLAN §1.6): a field listed as required, simply absent.
    // Defaulting it to null here would put a hole in the splits table that a human then confirms
    // without ever being told something was lost. It must fail and trigger the repair instead.
    const broken = {
      ...TRUTH,
      splits: TRUTH.splits.map((s, i) =>
        i === 3
          ? {
              km: s.km,
              timeSec: s.timeSec,
              paceSecPerKm: s.paceSecPerKm,
              cadenceSpm: s.cadenceSpm,
              partial: s.partial,
            }
          : s,
      ),
    }
    const parsed = schemaFor('summary', 'splits', 'heartrate').safeParse(broken)
    expect(parsed.success).toBe(false)
  })

  it('rejects an out-of-range heart rate — a misread axis label, not a fast runner', () => {
    expect(RawExtractedSession.safeParse({ ...TRUTH, maxHrBpm: 1890 }).success).toBe(false)
    expect(RawExtractedSession.safeParse({ ...TRUTH, maxHrBpm: 19 }).success).toBe(false)
  })

  it('rejects a non-integer duration or pace — every stored unit is an integer (D5)', () => {
    expect(RawExtractedSession.safeParse({ ...TRUTH, durationSec: 4716.5 }).success).toBe(false)
    expect(RawExtractedSession.safeParse({ ...TRUTH, avgPaceSecPerKm: 442.3 }).success).toBe(false)
  })

  it('defaults an entirely absent scalar to null instead of failing', () => {
    // The scalar half degrades: "this field was not visible" is legitimate for all of them, and
    // the prompt's RULE 1 says so. Only the row-shaped data has to be complete.
    const parsed = RawExtractedSession.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.distanceKm).toBeNull()
      expect(parsed.data.splits).toEqual([])
    }
  })
})

describe('the provenance guard (§5.2) — a hard null-out, not a warning', () => {
  it('discards heart-rate data the model invented for a screen that was never uploaded', () => {
    // Acceptance criterion 12. The model here returns a FULLY populated heart-rate section for an
    // upload that contained no heart-rate screenshot. There is no legitimate way for those
    // numbers to be real, so there is no legitimate reason to show them to a reviewer.
    const parsed = schemaFor('summary', 'splits').parse(TRUTH)

    expect(parsed.hrZones).toEqual([])
    expect(parsed.postWorkoutHr).toEqual([])
    expect(parsed.maxHrBpm).toBeNull()
    expect(parsed.restingHrBpm).toBeNull()

    // Everything the summary really does show survives untouched.
    expect(parsed.distanceKm).toBe(10.67)
    expect(parsed.avgPaceSecPerKm).toBe(442)
    expect(parsed.splits).toHaveLength(11)
  })

  it('discards a splits table transcribed from a summary-only upload', () => {
    // R-4 found the summary screen previews the first three split rows. Three rows for an
    // eleven-km run is a silently truncated table — the exact failure score.mjs guards against —
    // and completeness is load-bearing for every pace average. So `splits` needs its own screen.
    const parsed = schemaFor('summary').parse(TRUTH)
    expect(parsed.splits).toEqual([])
    expect(parsed.durationSec).toBe(4716)
  })

  it('keeps avgHrBpm on a heart-rate-only upload — R-4’s one two-screen field', () => {
    // A single-owner ownership table would have wrongly nulled this out. R-4 read the screenshots:
    // avgHrBpm is on BOTH the summary and the heart-rate screen, and they agreed at 173.
    const parsed = schemaFor('heartrate').parse(TRUTH)
    expect(parsed.avgHrBpm).toBe(173)
    expect(parsed.maxHrBpm).toBe(189)
    // …while everything that only the summary shows is gone.
    expect(parsed.distanceKm).toBeNull()
    expect(parsed.durationSec).toBeNull()
  })

  it('is undefeatable by the model claiming to have seen more than it was given', () => {
    // `kindsPresent` comes from our own upload records. Nothing in the model's reply feeds it,
    // which is why a lying response cannot widen its own permissions.
    const liar = { ...TRUTH, activityType: 'Outdoor Run (all three screens attached, honest)' }
    const parsed = schemaFor('summary').parse(liar)
    expect(parsed.hrZones).toEqual([])
    expect(parsed.splits).toEqual([])
  })

  it('lets a full three-screen upload through unchanged', () => {
    const parsed = schemaFor('summary', 'splits', 'heartrate').parse(TRUTH)
    expect(parsed.splits).toHaveLength(11)
    expect(parsed.hrZones).toHaveLength(5)
  })
})

describe('FIELD_SOURCES is complete and consistent', () => {
  it('names a source screen for every field in the session shape', () => {
    // If a field is added to the schema without a row here, `fieldIsReachable` would throw at
    // runtime on a partial upload — inside the background job, where nobody is watching.
    const schemaKeys = Object.keys(RawExtractedSession.shape).sort()
    expect(ALL_SESSION_FIELDS.slice().sort()).toEqual(schemaKeys)
  })

  it('gives every field at least one source, and only real screen kinds', () => {
    for (const field of ALL_SESSION_FIELDS) {
      expect(FIELD_SOURCES[field].length).toBeGreaterThan(0)
      for (const kind of FIELD_SOURCES[field]) {
        expect(['summary', 'splits', 'heartrate']).toContain(kind)
      }
      // With all three screens uploaded, nothing is ever nulled out.
      expect(fieldIsReachable(field, ALL_KINDS)).toBe(true)
    }
  })

  it('R-45: resolves a field’s provenance section, preferring the summary for avgHrBpm', () => {
    expect(sectionForField('avgHrBpm')).toBe('summary')
    expect(sectionForField('maxHrBpm')).toBe('heartrate')
    expect(sectionForField('restingHrBpm')).toBe('heartrate')
    expect(sectionForField('splits')).toBe('splits')
    expect(sectionForField('distanceKm')).toBe('summary')
  })
})

describe('emptyExtractedSession', () => {
  it('is a valid session with nothing in it — §8.1’s all-blank review form', () => {
    const empty = emptyExtractedSession()
    expect(RawExtractedSession.safeParse(empty).success).toBe(true)
    expect(empty.splits).toEqual([])
    expect(empty.distanceKm).toBeNull()
  })

  it('returns a fresh object each call, so one caller cannot mutate another’s blank form', () => {
    const a = emptyExtractedSession()
    a.splits.push({
      km: 1,
      timeSec: 1,
      paceSecPerKm: 1,
      hrBpm: null,
      cadenceSpm: null,
      partial: false,
    })
    expect(emptyExtractedSession().splits).toEqual([])
  })
})

/**
 * F30 — the two most-corrected fields in the application.
 *
 * The card that opened this said `startTime`/`endTime` were "always null". Measured across 19
 * production extractions they were null **zero** times and non-`HH:MM` **34 of 38 times**; the
 * blank the runner saw came from a native `<input type="time">` refusing to display Apple's
 * on-screen shape. Every string in the first table below is one the reader really returned.
 */
describe('F30: clock-time normalisation', () => {
  const PRODUCTION_SHAPES: ReadonlyArray<readonly [string, string | null, string]> = [
    // ── Real reader output, with the correction a human actually typed ──────────────────────
    ['5.25AM', '05:25', 'dot separator, meridiem jammed against the minutes'],
    ['6.08AM', '06:08', 'dot separator, no space before AM'],
    ['6.09 AM', '06:09', 'dot separator, spaced AM'],
    ['5.57 AM', '05:57', 'dot separator, spaced AM'],
    ['6.00AM', '06:00', 'on the hour'],
    ['5:10PM', '17:10', 'colon separator, PM — the shift that matters'],
    ['6:27PM', '18:27', 'colon separator, PM'],
    ['07:07', '07:07', 'already the requested shape; passes through untouched'],
    // ── Meridiem dropped by the reader: unrecoverable, so refused rather than guessed ───────
    ['5:37', null, 'bare one-digit hour — could be 05:37 or 17:37'],
    ['5:32', null, 'the measured trap: this run was 5.32 PM, i.e. 17:32'],
    ['6.09', null, 'bare, dot separator'],
    ['5:18', null, 'bare'],

    // ── Meridiem edge cases the 12-hour clock gets wrong if you add 12 blindly ──────────────
    ['12.15 AM', '00:15', 'midnight hour is 00, not 12'],
    ['12.30 PM', '12:30', 'noon hour stays 12, it does not become 24'],
    ['12:00AM', '00:00', 'midnight exactly'],

    // ── Tolerances worth having, since the reader is not consistent run to run ──────────────
    ['  7:45 pm  ', '19:45', 'surrounding whitespace and lower case'],
    ['5.32 P.M.', '17:32', 'dotted meridiem'],
    ['17:32', '17:32', 'a two-digit 24-hour value is the contract, not a guess'],
    ['23:59', '23:59', 'end of day'],
    ['00:00', '00:00', 'start of day'],

    // ── Refusals ───────────────────────────────────────────────────────────────────────────
    ['', null, 'empty string'],
    ['24:00', null, 'no such hour'],
    ['12:60', null, 'no such minute'],
    ['13:15 PM', null, 'a 13 with a meridiem is incoherent, not a 25th hour'],
    ['0:30 PM', null, 'there is no 0 on a 12-hour clock'],
    ['5:3', null, 'one minute digit — a truncated read, not a time'],
    ['Thu, 20 Aug', null, 'a date label landing in the wrong field'],
    ['7', null, 'an hour with no minutes'],
  ]

  it.each(PRODUCTION_SHAPES)('normalises %j to %j (%s)', (input, expected) => {
    expect(normalizeClockTime(input)).toBe(expected)
  })

  it('passes null and undefined through as null', () => {
    expect(normalizeClockTime(null)).toBe(null)
    expect(normalizeClockTime(undefined)).toBe(null)
  })

  it('never returns a shape the review form would blank out', () => {
    // `clockTime` in lib/review/schema.ts, and the native <input type="time">, accept exactly
    // this. Anything else renders as an empty control, which is the whole bug.
    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
    for (const [input] of PRODUCTION_SHAPES) {
      const out = normalizeClockTime(input)
      if (out !== null) expect(out).toMatch(HHMM)
    }
  })

  it('applies the transform through the schema, on both fields, on every screen set', () => {
    const parsed = schemaFor('summary').safeParse({
      ...emptyExtractedSession(),
      startTime: '5.32 PM',
      endTime: '6.46 PM',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.startTime).toBe('17:32')
    expect(parsed.data.endTime).toBe('18:46')
  })

  it('still defaults a missing key to null rather than throwing', () => {
    const parsed = schemaFor('summary').safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.startTime).toBe(null)
    expect(parsed.data.endTime).toBe(null)
  })

  it('leaves the fixture’s already-correct times exactly as they are', () => {
    // The 108/108 fixture is the one thing this change must not move.
    const parsed = schemaFor('summary', 'splits', 'heartrate').parse(TRUTH)
    expect(parsed.startTime).toBe('07:07')
    expect(parsed.endTime).toBe('08:26')
  })
})
