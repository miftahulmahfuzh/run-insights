/**
 * The seeded demo dataset — F19 §7.
 *
 * A table of 27 run specs and a builder that turns one into an `ExtractedSession` payload which
 * passes all four of `lib/review/checks.ts`'s cross-checks. That property is the whole point: a
 * green consistency banner is what makes confirming a run a single tap, and a single tap is what
 * lets `shoot.mjs` commit 26 runs through the real review screen without filling 108 fields each.
 *
 * NOTHING HERE INVENTS A METRIC. The payload is the shape of a transcribed screenshot and no
 * more. Every derived number in the screenshots — records, badge awards, decoupling, zone
 * percentages, the rolling mean — is computed by the app when the run is committed, exactly as it
 * would be for a real upload. This file's only job is to be arithmetically honest input.
 *
 * The four checks it must satisfy, with their real tolerances:
 *
 *   splits_sum_vs_duration    |sum(split.timeSec) - durationSec|          <= max(10, 0.5% dur)
 *   zones_sum_vs_duration     |sum(zone.durationSec) - durationSec|       <= max(90, 3.5% dur)
 *   distance_pace_vs_duration |distanceKm * avgPaceSecPerKm - durationSec| <= max(5, 0.5% dur)
 *   partial_consistency       round(lastTime / remainderKm) vs its pace   <= 15 s
 *
 * The builder hits the first and third exactly and the fourth by construction, which leaves the
 * banner green for a reason rather than by luck.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/* ============================================================================
 * Zones. Five rows or none (ReviewDraftSchema refuses three), and the bpm bounds are what
 * `warmup_who` and `redline_republic` read against.
 * ==========================================================================*/

const ZONE_BOUNDS = [
  { zone: 1, minBpm: null, maxBpm: 139 },
  { zone: 2, minBpm: 140, maxBpm: 155 },
  { zone: 3, minBpm: 156, maxBpm: 170 },
  { zone: 4, minBpm: 171, maxBpm: 185 },
  { zone: 5, minBpm: 186, maxBpm: null },
]

/** Zone 4's floor — `warmup_who` fires when km 1's HR is at or above it. */
export const ZONE4_FLOOR = 171

/* ============================================================================
 * Run shapes. One name selects the pace profile, the heart-rate profile, the cadence profile and
 * the zone mix together, so a spec line cannot accidentally pair a hard effort's pace fade with an
 * easy run's zone distribution.
 *
 * Every profile returns an OFFSET from the run's own average, in that field's units, for
 * kilometre `i` of `n` rows. Offsets rather than absolutes because the spec table sets the
 * averages, and a profile that also set them would be two places to change one run.
 * ==========================================================================*/

/** A linear drift of `amplitude` across the run, centred on zero: negative first, positive last. */
const drift = (amplitude) => (i, n) =>
  Math.round(-amplitude / 2 + (i / Math.max(1, n - 1)) * amplitude)

/** A linear decline of `amplitude`: positive first, negative last. The cadence fade. */
const decline = (amplitude) => (i, n) =>
  Math.round(amplitude / 2 - (i / Math.max(1, n - 1)) * amplitude)

/** A fixed wobble, cycled. Population sd stays under `metronome`'s 10 s bar by construction. */
const wobble = (offsets) => (i) => offsets[i % offsets.length]

const SHAPES = {
  easy: {
    pace: wobble([-4, 2, -3, 4, 1, -5, 3, 2, -2, 2]),
    hr: drift(10),
    cadence: wobble([1, 0, -1, 0, 1, -1, 0, 1, -1, 0]),
    zones: [12, 30, 43, 13, 2],
  },
  /** Flat pace AND flat heart rate: `boring_excellence` needs decoupling under 5%. */
  even: {
    pace: wobble([-2, 1, -1, 2, 0, -3, 2, 1, -1, 1]),
    hr: drift(4),
    cadence: wobble([1, 0, -1, 0, 1, -1, 0, 1, -1, 0]),
    zones: [5, 18, 44, 28, 5],
  },
  steady: {
    pace: drift(20),
    hr: drift(14),
    cadence: decline(6),
    zones: [5, 18, 44, 28, 5],
  },
  /** The ordinary long-run fade. POSITIVE_SPLIT territory in F06; no badge either way. */
  fade: {
    pace: drift(46),
    hr: drift(18),
    cadence: decline(9),
    zones: [4, 16, 42, 31, 7],
  },
  /** Second half quicker than the first, which is what `negative_split` reads off the drift. */
  negative: {
    pace: drift(-34),
    hr: drift(12),
    cadence: drift(7),
    zones: [3, 14, 36, 37, 10],
  },
  tempo: {
    pace: drift(8),
    hr: drift(16),
    cadence: wobble([1, -1, 0, 1, -1, 0, 1, 0]),
    zones: [3, 12, 33, 40, 12],
  },
  /**
   * THE HARD ONE. Km 1 far under the run's own mean — `fast_start_fool` wants 30 s or more — then
   * a long fade after it: the canonical fixture's 6'36" out, 8'00" home. Heart rate opens at or
   * above zone 4's floor, which is what `warmup_who` reads, and stays pinned, which is what turns
   * the fade into decoupling. Cadence sheds 25 spm against `cadence_collapse`'s 15 spm bar, and
   * zone 5 holds 45% against `redline_republic`'s 40%.
   */
  hard: {
    pace: (i, n) => (i === 0 ? -52 : Math.round(-18 + (i / Math.max(1, n - 1)) * 58)),
    hr: (i, n) => Math.round(-6 + (i / Math.max(1, n - 1)) * 20),
    cadence: (i, n) => Math.round(10 - (i / Math.max(1, n - 1)) * 28),
    zones: [1, 4, 14, 36, 45],
  },
  /**
   * `sandbagger` reads zones **3, 4 and 5** — not just 4 and 5 — so a recovery run only counts as
   * suspiciously sensible if nothing at all lands at or above 156 bpm. The first version of this
   * mix put 29% in zone 3 and the badge never fired; that was this table's bug, not the rule's.
   */
  recovery: {
    pace: wobble([3, -2, 1, -1, 2, -3, 0, 1]),
    hr: drift(6),
    cadence: wobble([0, 1, 0, -1, 0, 1, -1, 0]),
    zones: [45, 55, 0, 0, 0],
  },
}

/* ============================================================================
 * The builder
 * ==========================================================================*/

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function round2(value) {
  return Math.round(value * 100) / 100
}

/**
 * `resolveOccurredOn` (lib/review/draft.ts) reads the day, the month name and — crucially — an
 * explicit four-digit year out of this label. With the year present the guess is exact, so every
 * seeded run lands on its own date instead of on today's, which is what keeps 27 of them from
 * colliding on the R-5 one-run-per-day dedupe index.
 */
function dateLabelOf(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${dow}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

function addSeconds(clock, seconds) {
  const [h, m] = clock.split(':').map(Number)
  const total = (h * 3600 + m * 60 + seconds) % 86_400
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Largest-remainder apportionment: the parts sum to `total` exactly, never to total ± 1. */
function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (total * w) / sum)
  const floors = exact.map(Math.floor)
  let left = total - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  const out = floors.slice()
  for (let k = 0; k < order.length && left > 0; k++, left--) out[order[k].i] += 1
  return out
}

/**
 * One spec → one `ExtractedSession`.
 *
 * The order matters. Duration comes from distance × pace, so CHK-3 is satisfied by definition.
 * The partial row's pace is then computed from its own time and its own remainder, which is
 * precisely the arithmetic CHK-4 re-runs. The full-km times are only adjusted at the end, into
 * the *last full* row, so the split total lands on `durationSec` exactly — CHK-1 with zero slack
 * spent.
 */
export function buildSession(spec) {
  const { date, start, km, pace, shape, location, hrAvg, hrMax, cadence, kcal, elevation } = spec

  const durationSec = Math.round(km * pace)
  const fullKm = Math.floor(round2(km))
  const remainderKm = round2(km - fullKm)
  const hasPartial = remainderKm > 0.05 && remainderKm < 0.95

  const profile = SHAPES[shape]
  if (!profile) throw new Error(`unknown run shape '${shape}' on ${date}`)
  const paceAt = profile.pace
  const hrAt = profile.hr
  const cadAt = profile.cadence
  const rows = fullKm + (hasPartial ? 1 : 0)

  /* Full kilometres. For a 1 km row the time and the pace are the same number, which is why the
   * splits table can be checked against the duration at all. */
  const splits = []
  for (let i = 0; i < fullKm; i++) {
    const p = Math.max(120, pace + paceAt(i, rows))
    splits.push({
      km: i + 1,
      timeSec: p,
      paceSecPerKm: p,
      hrBpm: Math.min(hrMax, Math.max(40, hrAvg + hrAt(i, rows))),
      cadenceSpm: Math.max(0, cadence + cadAt(i, rows)),
      partial: false,
    })
  }

  /* The partial row. Its time is what is left of the run; its pace is that time over its own
   * fraction of a kilometre — the exact quantity `partialConsistency` recomputes. */
  if (hasPartial) {
    const lastFullPace = splits.length > 0 ? splits[splits.length - 1].paceSecPerKm : pace
    const timeSec = Math.max(1, Math.round(remainderKm * lastFullPace))
    splits.push({
      km: fullKm + 1,
      timeSec,
      paceSecPerKm: Math.round(timeSec / remainderKm),
      hrBpm: Math.min(hrMax, Math.max(40, hrAvg + hrAt(rows - 1, rows))),
      cadenceSpm: Math.max(0, cadence + cadAt(rows - 1, rows)),
      partial: true,
    })
  }

  /* CHK-1 to the second. The drift is Apple's own MM:SS rounding in real life; here it is the
   * rounding in the two lines above, and it is absorbed by the last FULL kilometre so the partial
   * row's pace-vs-time identity — CHK-4 — stays exact. */
  const sum = splits.reduce((t, s) => t + s.timeSec, 0)
  const drift = durationSec - sum
  if (drift !== 0 && fullKm > 0) {
    const target = splits[fullKm - 1]
    target.timeSec += drift
    target.paceSecPerKm = target.timeSec
  }

  const zoneMix = spec.zones ? SHAPES[spec.zones].zones : profile.zones
  const hrZones = apportion(durationSec, zoneMix).map((durationSec, i) => ({
    zone: ZONE_BOUNDS[i].zone,
    durationSec,
    minBpm: ZONE_BOUNDS[i].minBpm,
    maxBpm: ZONE_BOUNDS[i].maxBpm,
  }))

  return {
    activityType: 'Outdoor Run',
    goal: spec.goal ?? null,
    dateLabel: dateLabelOf(date),
    startTime: start,
    endTime: addSeconds(start, durationSec),
    location,
    durationSec,
    distanceKm: km,
    activeKcal: kcal,
    totalKcal: kcal + 90,
    elevationGainM: elevation,
    avgCadenceSpm: cadence,
    /* CHK-3: distance x this must imply the duration. Deriving it from the duration rather than
     * restating `pace` is what makes that true after the rounding above. */
    avgPaceSecPerKm: Math.round(durationSec / km),
    avgHrBpm: hrAvg,
    maxHrBpm: hrMax,
    restingHrBpm: 52,
    splits,
    hrZones,
    postWorkoutHr: [
      { label: 'End', bpm: Math.min(hrMax, hrAvg + 6) },
      { label: '1 min', bpm: Math.max(60, hrAvg - 34) },
    ],
  }
}

/* ============================================================================
 * The 27 runs — F19 §7. Designed, not random: every line exists to put something specific on a
 * screen. The badge column names what the rules in lib/badges/rules.ts should award, and it is a
 * prediction, not an instruction — nothing here writes a badge row.
 * ==========================================================================*/

const HOME = 'Bintaro, South Tangerang'
const AWAY = 'Senayan, Jakarta'

/** 05:00–05:30 earns `early_bird`; anything before 06:00 counts toward `dawn_patrol` (10 needed). */
export const RUNS = [
  // ── June: six runs, easing in. `tourist` fires on the first one — no location seen before.
  {
    date: '2026-06-09',
    start: '05:14',
    km: 5.2,
    pace: 375,
    shape: 'easy',
    location: HOME,
    hrAvg: 152,
    hrMax: 166,
    cadence: 168,
    kcal: 372,
    elevation: 24,
  },
  {
    date: '2026-06-12',
    start: '05:22',
    km: 8.0,
    pace: 365,
    shape: 'steady',
    location: HOME,
    hrAvg: 161,
    hrMax: 174,
    cadence: 170,
    kcal: 578,
    elevation: 41,
  },
  {
    date: '2026-06-16',
    start: '05:18',
    km: 5.4,
    pace: 380,
    shape: 'easy',
    location: HOME,
    hrAvg: 150,
    hrMax: 163,
    cadence: 167,
    kcal: 389,
    elevation: 22,
  },
  {
    date: '2026-06-19',
    start: '05:09',
    km: 10.2,
    pace: 390,
    shape: 'fade',
    location: HOME,
    hrAvg: 164,
    hrMax: 179,
    cadence: 169,
    kcal: 742,
    elevation: 63,
  },
  {
    date: '2026-06-24',
    start: '06:35',
    km: 5.1,
    pace: 355,
    shape: 'tempo',
    location: AWAY,
    hrAvg: 172,
    hrMax: 186,
    cadence: 176,
    kcal: 366,
    elevation: 18,
  },
  {
    date: '2026-06-30',
    start: '05:26',
    km: 10.4,
    pace: 382,
    shape: 'fade',
    location: HOME,
    hrAvg: 166,
    hrMax: 181,
    cadence: 168,
    kcal: 756,
    elevation: 58,
  },

  // ── July. ISO week 28 (6–12 Jul) is deliberately EMPTY, so /trends' 4-week rolling mean has a
  //    visible gap on camera instead of only in the code that draws one.
  {
    date: '2026-07-02',
    start: '05:12',
    km: 5.3,
    pace: 370,
    shape: 'easy',
    location: HOME,
    hrAvg: 153,
    hrMax: 167,
    cadence: 168,
    kcal: 381,
    elevation: 25,
  },
  {
    date: '2026-07-04',
    start: '05:31',
    km: 10.6,
    pace: 388,
    shape: 'fade',
    location: HOME,
    hrAvg: 165,
    hrMax: 180,
    cadence: 169,
    kcal: 771,
    elevation: 60,
  },
  {
    date: '2026-07-14',
    start: '05:16',
    km: 5.0,
    pace: 362,
    shape: 'even',
    location: HOME,
    hrAvg: 158,
    hrMax: 170,
    cadence: 172,
    kcal: 358,
    elevation: 19,
  },
  {
    date: '2026-07-17',
    start: '05:07',
    km: 10.1,
    pace: 378,
    shape: 'fade',
    location: HOME,
    hrAvg: 163,
    hrMax: 178,
    cadence: 169,
    kcal: 734,
    elevation: 55,
  },
  // `negative_split` — the second half quicker than the first.
  {
    date: '2026-07-21',
    start: '05:20',
    km: 5.5,
    pace: 350,
    shape: 'negative',
    location: HOME,
    hrAvg: 170,
    hrMax: 184,
    cadence: 175,
    kcal: 397,
    elevation: 21,
  },
  {
    date: '2026-07-24',
    start: '05:11',
    km: 11.0,
    pace: 395,
    shape: 'fade',
    location: HOME,
    hrAvg: 167,
    hrMax: 182,
    cadence: 168,
    kcal: 801,
    elevation: 68,
  },
  {
    date: '2026-07-28',
    start: '05:05',
    km: 5.2,
    pace: 365,
    shape: 'even',
    location: HOME,
    hrAvg: 157,
    hrMax: 169,
    cadence: 173,
    kcal: 374,
    elevation: 20,
  },
  {
    date: '2026-07-31',
    start: '05:24',
    km: 10.8,
    pace: 384,
    shape: 'fade',
    location: HOME,
    hrAvg: 166,
    hrMax: 181,
    cadence: 169,
    kcal: 786,
    elevation: 62,
  },

  // ── August, the heavy month: it clears 100 km, which is what `century_club` reads.
  //    Runs 15–17 sit inside 100 m of each other — `groundhog_day`'s window — and their paces sit
  //    inside 10 s with low decoupling, which is `boring_excellence` reading the same three runs.
  {
    date: '2026-08-03',
    start: '05:13',
    km: 10.5,
    pace: 372,
    shape: 'even',
    location: HOME,
    hrAvg: 160,
    hrMax: 173,
    cadence: 171,
    kcal: 763,
    elevation: 52,
  },
  {
    date: '2026-08-05',
    start: '05:19',
    km: 10.55,
    pace: 374,
    shape: 'even',
    location: HOME,
    hrAvg: 161,
    hrMax: 174,
    cadence: 171,
    kcal: 767,
    elevation: 54,
  },
  {
    date: '2026-08-07',
    start: '05:08',
    km: 10.58,
    pace: 377,
    shape: 'even',
    location: HOME,
    hrAvg: 162,
    hrMax: 175,
    cadence: 170,
    kcal: 769,
    elevation: 53,
  },
  // Two runs on one calendar day — `two_a_days`.
  {
    date: '2026-08-10',
    start: '05:15',
    km: 8.4,
    pace: 371,
    shape: 'steady',
    location: HOME,
    hrAvg: 162,
    hrMax: 176,
    cadence: 170,
    kcal: 611,
    elevation: 44,
  },
  {
    date: '2026-08-10',
    start: '19:40',
    km: 5.1,
    pace: 386,
    shape: 'recovery',
    location: HOME,
    hrAvg: 141,
    hrMax: 152,
    cadence: 164,
    kcal: 366,
    elevation: 17,
    zones: 'recovery',
  },
  // After 07:00 — `late_start`.
  {
    date: '2026-08-12',
    start: '07:35',
    km: 5.4,
    pace: 348,
    shape: 'negative',
    location: AWAY,
    hrAvg: 171,
    hrMax: 185,
    cadence: 176,
    kcal: 390,
    elevation: 23,
  },
  {
    date: '2026-08-14',
    start: '05:10',
    km: 12.4,
    pace: 386,
    shape: 'fade',
    location: HOME,
    hrAvg: 168,
    hrMax: 183,
    cadence: 168,
    kcal: 903,
    elevation: 74,
  },
  /*
   * THE HARD ONE. This is the canonical fixture's shape and the reason F07 has anything to say:
   * out at 6'36", home at 8'00", heart rate pinned near max the whole way. It should trip
   * HIGH_DECOUPLING, TOO_MUCH_HARD, POSITIVE_SPLIT, CADENCE_FADE and FAST_START in F06, and earn
   * `fast_start_fool`, `redline_republic`, `cadence_collapse` and `warmup_who` in F09.
   */
  {
    date: '2026-08-16',
    start: '05:12',
    km: 10.67,
    pace: 412,
    shape: 'hard',
    location: HOME,
    hrAvg: 178,
    hrMax: 193,
    cadence: 174,
    kcal: 812,
    elevation: 71,
    goal: 'Open goal',
  },
  // Entirely below zone 4 — `sandbagger`.
  {
    date: '2026-08-17',
    start: '05:28',
    km: 5.1,
    pace: 400,
    shape: 'recovery',
    location: HOME,
    hrAvg: 138,
    hrMax: 149,
    cadence: 163,
    kcal: 366,
    elevation: 16,
    zones: 'recovery',
  },
  {
    date: '2026-08-18',
    start: '05:17',
    km: 10.9,
    pace: 380,
    shape: 'even',
    location: HOME,
    hrAvg: 163,
    hrMax: 176,
    cadence: 171,
    kcal: 792,
    elevation: 57,
  },
  // 21.2 km — `half_ish`, `long_way_home`, and over 1,000 kcal for `sweat_equity`.
  {
    date: '2026-08-19',
    start: '05:02',
    km: 21.2,
    pace: 400,
    shape: 'fade',
    location: HOME,
    hrAvg: 169,
    hrMax: 184,
    cadence: 167,
    kcal: 1543,
    elevation: 118,
  },
]

/* ============================================================================
 * The one run left uncommitted — and it is not synthetic at all.
 * ==========================================================================*/

/** The committed vendor response for the three canonical screenshots. */
const GOLDEN = path.join(REPO, 'research/fixtures/golden-response.json')

/**
 * The canonical fixture: the real `glm-4.6v` reply to the three real Apple Fitness screenshots,
 * as committed in `research/fixtures/golden-response.json` and hand-verified to 108/108 fields.
 *
 * WHY THE FLAGGED RUN IS THIS AND NOT A GENERATED ONE. The review screen renders the uploaded
 * screenshots in a strip above the fields, and `run_photos` points at those three images. A
 * generated payload puts a real screenshot reading `1:18:36` directly above a field reading
 * something else — a discrepancy visible in the screenshot itself, on the one screen whose entire
 * job is catching discrepancies. Using the fixture makes the strip and the fields agree because
 * they describe the same run.
 *
 * It also means the review screenshot shows F05's date guess doing real work: the summary screen
 * says "Thu, 20 Aug" with no year, so `resolveOccurredOn` has to reason about it, and the screen
 * says so in the words the runner actually sees.
 */
export function canonicalFixtureSession() {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'))
  return JSON.parse(golden.choices[0].message.content)
}

/** The vendor JSON itself, so `extractions.raw_response.vendor` is the genuine reply. */
export function canonicalFixtureVendor() {
  return JSON.parse(readFileSync(GOLDEN, 'utf8'))
}

/**
 * Inject the misread that actually happened.
 *
 * `lib/review/checks.ts` records it at CHK-1's tolerance: *"§1.3's observed misread (split 1 read
 * as 436 s where the screenshot says 6'36" = 396 s) moves the sum by 40 s."* That is the error
 * this reproduces — one cell, one row, 40 seconds — and it is why the fixture scored 102/108 on
 * the parallel-call variant while getting the other 101 fields, including the other ten splits,
 * right.
 *
 * Both fields move because in Apple's splits table a full kilometre's time and its pace are one
 * cell: 6'36" is simultaneously how long that kilometre took and the pace it was run at.
 */
export function breakSplitOne(session) {
  const row = session.splits.find((s) => s.km === 1)
  if (!row) throw new Error('the canonical fixture has no km 1 to break')
  if (row.timeSec !== 396) {
    throw new Error(`expected km 1 to read 396 s, found ${row.timeSec} — the fixture moved`)
  }
  row.timeSec = 436
  row.paceSecPerKm = 436
  return session
}
