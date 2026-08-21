/**
 * **R-23: this is the single formatting authority.** Every distance, duration, pace, heart rate
 * and cadence the app renders comes from a function in this file. No component formats a number
 * inline, and no second helper module exists.
 *
 * Roadmap §4.2 is the contract, one rule per quantity, no exceptions:
 *
 * | Quantity  | Stored as              | Rendered as                       |
 * |-----------|------------------------|-----------------------------------|
 * | Distance  | int metres — `10670`   | `10.67 km`, two decimals, PERIOD  |
 * | Duration  | int seconds            | `1:18:36` or `41:23`              |
 * | Pace      | int sec/km — `442`     | `7'22"/km`                        |
 * | Cadence   | int                    | `144 spm`                         |
 * | HR        | int                    | `173 bpm`                         |
 * | Energy    | int kcal               | `646 kcal`                        |
 * | Elevation | int metres             | `15 m`                            |
 *
 * Apple renders `10,67KM` with a comma. **We render `10.67 km` with a period**, because the copy
 * is English (D10). Parsing Apple's comma is the extractor's job; being internally consistent is
 * this file's. Both decisions live here and nowhere else.
 *
 * OWNERSHIP NOTE: F08 owns this module. F04 seeded it with the five functions the extraction
 * hand-off screen needs, written to §4.2 rather than to that screen's convenience, so F08 extends
 * it instead of finding a competing set of helpers to delete.
 *
 * PURE MODULE — client- and server-importable, testable without a DOM. Its one import is
 * `lib/date/ranges.ts`, which is equally pure: F03 already owns the ISO-week arithmetic (roadmap
 * §4.3's `scope_key` format), and F08's plan §5 asked for `isoWeekLabel` here. Labelling a week
 * needs that week's first day, so this file imports the calculation rather than re-deriving it —
 * two implementations of "which Monday owns 2026-W34" is exactly the drift R-23 exists to stop.
 */

import { isoWeekRange, type IsoWeekKey, type MonthKey } from '@/lib/date/ranges'

/** A number, or an em dash. Every formatter degrades through here so a null never renders "NaN". */
export const MISSING = '—'

function isNum(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `10670` → `10.67 km`. Two decimals always, period separator always. */
export function formatDistanceM(metres: number | null | undefined): string {
  if (!isNum(metres)) return MISSING
  return `${(metres / 1000).toFixed(2)} km`
}

/** For the extraction hand-off, which still holds kilometres as the model read them. */
export function formatDistanceKm(km: number | null | undefined): string {
  if (!isNum(km)) return MISSING
  return `${km.toFixed(2)} km`
}

/**
 * `4716` → `1:18:36`; `2483` → `41:23`. Hours appear only when there are hours, and minutes are
 * zero-padded only when an hours field precedes them — `41:23`, never `41:23` as `0:41:23`.
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!isNum(totalSeconds)) return MISSING
  const s = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** `442` → `7'22"`. The `/km` suffix is opt-in, because a splits column repeats it pointlessly. */
export function formatPace(secPerKm: number | null | undefined, withUnit = false): string {
  if (!isNum(secPerKm)) return MISSING
  const s = Math.max(0, Math.round(secPerKm))
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${minutes}'${String(seconds).padStart(2, '0')}"${withUnit ? '/km' : ''}`
}

/** `173` → `173 bpm`. */
export function formatBpm(bpm: number | null | undefined): string {
  return isNum(bpm) ? `${Math.round(bpm)} bpm` : MISSING
}

/** `144` → `144 spm`. */
export function formatCadence(spm: number | null | undefined): string {
  return isNum(spm) ? `${Math.round(spm)} spm` : MISSING
}

/** `646` → `646 kcal`. */
export function formatKcal(kcal: number | null | undefined): string {
  return isNum(kcal) ? `${Math.round(kcal)} kcal` : MISSING
}

/** `15` → `15 m`. */
export function formatElevation(metres: number | null | undefined): string {
  return isNum(metres) ? `${Math.round(metres)} m` : MISSING
}

/**
 * `'2026-08-20'` → `'Thu, 20 Aug 2026'`.
 *
 * Roadmap §4.2 defines a rule for every measured quantity and says nothing about dates, because
 * until F05 there was no screen that rendered one. This is written to the same spirit: one
 * spelling, decided here, used everywhere.
 *
 * **`timeZone: 'UTC'` is load-bearing, not boilerplate.** `runs.occurred_on` is already the
 * correct Asia/Jakarta calendar day (D6) by the time it is stored — `todayInJakarta` spent that
 * decision once. Parsing it back through a local timezone would spend it a second time and
 * subtract a day for any viewer west of Jakarta. The string is a day, not an instant, and this
 * formats it as one.
 */
export function formatDay(dateISO: string | null | undefined): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return MISSING
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${dateISO}T00:00:00Z`))
}

/** `'07:07:00'` → `'07:07'`. Postgres `time` widens what the screenshot printed; this narrows it. */
export function formatClock(value: string | null | undefined): string {
  if (!value) return MISSING
  const m = value.match(/^(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : value
}

/* ============================================================================
 * F08's additions — plan §5. Everything above was seeded by F04; everything below
 * exists because a chart axis, a week divider or a delta tile needs it.
 * ==========================================================================*/

/**
 * Axis ticks and dividers, where two decimals are noise: `5000` → `5 km`, `45000` → `45 km`.
 *
 * Deliberately NOT a variant of `formatDistanceM`. §4.2's two-decimal rule governs a *measurement*
 * a reader might re-add — a run's distance, a week's total. An axis tick is a scale marker, and
 * `10.67 km` repeated six times down a 180px axis is unreadable. The rule is unchanged; the two
 * cases are genuinely different, and having two named functions is what keeps a caller from
 * "temporarily" rounding a real measurement.
 */
export function formatDistanceCompact(metres: number | null | undefined): string {
  if (!isNum(metres)) return MISSING
  return `${Math.round(metres / 1000)} km`
}

/**
 * `+41` → `+41 s/km`; `-12` → `−12 s/km`; `0` → `0 s/km`.
 *
 * The minus is U+2212 MINUS SIGN, not a hyphen: at Poppins' proportions a hyphen next to a tabular
 * figure reads as a word break. The plus is a plain ASCII `+`, which has no such problem.
 */
export function formatPaceDelta(deltaSec: number | null | undefined): string {
  if (!isNum(deltaSec)) return MISSING
  const s = Math.round(deltaSec)
  if (s === 0) return '0 s/km'
  return s > 0 ? `+${s} s/km` : `−${Math.abs(s)} s/km`
}

/**
 * `formatPercent(90.6, 1)` → `'90.6%'`.
 *
 * **The convention, decided once here: the argument is a percentage on 0–100, never a 0–1
 * fraction.** That matches `ZonePctRow.pct`, `SessionMetrics.hardPct`, `avgHrPctMax` and
 * `VolumeDelta.pct` — every percentage F06 computes — so no call site ever multiplies by 100 on
 * the way in. A caller holding a fraction converts at its own boundary and says so.
 */
export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (!isNum(value)) return MISSING
  return `${value.toFixed(decimals)}%`
}

/**
 * A signed percentage for a period-over-period delta: `12` → `↑ 12%`, `-4.2` → `↓ 4.2%`,
 * `0` → `flat`.
 *
 * The arrow carries the direction and the word "flat" carries the third case, so nothing here
 * depends on colour — the design brief's rule, and dataviz's, and they agree.
 */
export function formatVolumeDelta(pct: number | null | undefined, decimals = 0): string {
  if (!isNum(pct)) return MISSING
  if (Math.abs(pct) < 0.5) return 'flat'
  const arrow = pct > 0 ? '↑' : '↓'
  return `${arrow} ${Math.abs(pct).toFixed(decimals)}%`
}

/**
 * `'2026-08-18'` → `'Tue 18 Aug'`. The runs-list row heading, where the year is already implied by
 * the week divider above it.
 *
 * `en-GB` renders this as `'Tue, 18 Aug'`; the comma is dropped because the wireframe has no comma
 * and because the three fields are unambiguous without one. Same `timeZone: 'UTC'` reasoning as
 * `formatDay` — this is a calendar day, not an instant.
 */
export function formatDayShort(dateISO: string | null | undefined): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return MISSING
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(`${dateISO}T00:00:00Z`))
    .replace(',', '')
}

/** `'2026-08-18'` → `'18 Aug'`. Chart ticks and the compact rollup rows. */
export function formatDayCompact(dateISO: string | null | undefined): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return MISSING
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateISO}T00:00:00Z`))
}

/**
 * `'2026-W34'` → `'Week of 17 Aug 2026'`.
 *
 * The week is named by the Monday that owns it, from F03's `isoWeekRange` — which is why
 * `'2026-W01'` correctly reads `'Week of 29 Dec 2025'` rather than inventing a January date. The
 * year is always printed: a week label with no year is ambiguous the moment you page back past
 * January, and `/trends` pages back.
 */
export function isoWeekLabel(week: IsoWeekKey): string {
  const { startISO } = isoWeekRange(week)
  return `Week of ${formatDay(startISO).replace(/^\w{3},\s/, '')}`
}

/** `'2026-08'` → `'August 2026'`. The month header on `/trends`. */
export function formatMonthLabel(month: MonthKey): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00Z`))
}

/** `'2026-07'` → `'July'`. For "↑ 4% vs July", where the year would be noise. */
export function formatMonthName(month: MonthKey): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
  }).format(new Date(`${month}-01T00:00:00Z`))
}

/**
 * A heart-rate zone's bounds: `'under 140 bpm'`, `'164–174 bpm'`, `'175 bpm and up'`.
 *
 * Zone 1 has no floor and zone 5 no ceiling — Apple prints `< 140` and `175+` — so a null bound is
 * an open interval, never missing data. This lives here rather than in either zone component
 * because there are two of them (F05's editable bar and F08's read-only one) and they were already
 * spelling the range differently, which is R-23's exact failure mode caught in the act.
 *
 * En dash between the bounds, not a hyphen: it is a range, and the hyphen reads as a minus sign
 * next to a tabular figure.
 */
export function formatZoneBounds(
  minBpm: number | null | undefined,
  maxBpm: number | null | undefined,
): string {
  const hasMin = isNum(minBpm)
  const hasMax = isNum(maxBpm)
  if (!hasMin && !hasMax) return 'no range'
  if (!hasMin) return `under ${formatBpm(maxBpm)}`
  if (!hasMax) return `${formatBpm(minBpm)} and up`
  return `${Math.round(minBpm)}–${formatBpm(maxBpm)}`
}
