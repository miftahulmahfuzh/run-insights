/**
 * Calendar-range math for the rollup queries. Two rules govern this file:
 *
 * 1. **Half-open ranges, never a functional predicate.** `getRunsInMonth` filters
 *    `occurred_on >= '2026-08-01' AND occurred_on < '2026-09-01'`, which the
 *    `(user_id, occurred_on DESC)` index can scan. `to_char(occurred_on, 'YYYY-MM') = '2026-08'`
 *    returns the same rows and cannot use that index at all.
 *
 * 2. **No timezone reasoning happens here.** `runs.occurred_on` is already the correct
 *    Asia/Jakarta calendar day by the time it is written (roadmap D6, enforced upstream by
 *    F04/F05). These helpers are string/integer math over that day; the only `Date` objects are
 *    UTC-only scratch values used for ISO-week day arithmetic, which is why the results are
 *    identical under any ambient `TZ`.
 */

/** 'YYYY-MM-DD' — the shape of `runs.occurred_on`, which is a Postgres `date`, read as a string. */
export type DateISO = string
/** 'YYYY-MM' — `insights.scope_key` for month scope, and the month-badge scope key. */
export type MonthKey = string
/** 'YYYY-Www', e.g. '2026-W34' — `insights.scope_key` for week scope. */
export type IsoWeekKey = string

const MONTH_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/
const WEEK_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && MONTH_RE.test(v)
}

export function isValidIsoWeekKey(v: unknown): v is IsoWeekKey {
  return typeof v === 'string' && WEEK_RE.test(v)
}

export function isValidDateISO(v: unknown): v is DateISO {
  return typeof v === 'string' && DATE_RE.test(v)
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

function toISO(d: Date): DateISO {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function utcDay(dateISO: DateISO): Date {
  if (!isValidDateISO(dateISO)) {
    throw new RangeError(`Invalid ISO date: ${JSON.stringify(dateISO)}`)
  }
  return new Date(`${dateISO}T00:00:00Z`)
}

/** addMonths('2026-01', -1) === '2025-12'. Integer math on a month ordinal; no Date involved. */
export function addMonths(month: MonthKey, delta: number): MonthKey {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1
  return `${pad(ny, 4)}-${pad(nm)}`
}

/** monthRange('2026-08') -> { startISO: '2026-08-01', endExclusiveISO: '2026-09-01' } */
export function monthRange(month: MonthKey): { startISO: DateISO; endExclusiveISO: DateISO } {
  if (!isValidMonthKey(month)) throw new RangeError(`Invalid month key: ${JSON.stringify(month)}`)
  return { startISO: `${month}-01`, endExclusiveISO: `${addMonths(month, 1)}-01` }
}

/**
 * ISO 8601: weeks run Monday..Sunday, and week 1 is the week containing the year's first
 * Thursday — equivalently, the week containing January 4th. Walking back from Jan 4 to its
 * Monday gives week 1's start; every other week is a multiple of seven days from there.
 *
 * This is why `isoWeekRange('2026-W01').startISO` is `2025-12-29`: 2026-01-01 is a Thursday, so
 * the week that owns it begins in the previous calendar year.
 */
export function isoWeekRange(week: IsoWeekKey): { startISO: DateISO; endExclusiveISO: DateISO } {
  if (!isValidIsoWeekKey(week)) {
    throw new RangeError(`Invalid ISO week key: ${JSON.stringify(week)}`)
  }
  const isoYear = Number(week.slice(0, 4))
  const weekNum = Number(week.slice(6, 8))

  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow)

  const start = new Date(week1Monday)
  start.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7)
  const endExclusive = new Date(start)
  endExclusive.setUTCDate(start.getUTCDate() + 7)

  return { startISO: toISO(start), endExclusiveISO: toISO(endExclusive) }
}

/**
 * The ISO week key that owns a given day. The Thursday of a day's own week decides the
 * week-YEAR — that single hop is what makes `2025-12-29` report `2026-W01` and
 * `2027-01-03` report `2026-W53`, instead of naively reading the calendar year off the day.
 */
export function isoWeekKeyOf(dateISO: DateISO): IsoWeekKey {
  const d = utcDay(dateISO)
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() - dow + 3)
  const isoYear = thursday.getUTCFullYear()
  const jan1 = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.floor((+thursday - +jan1) / (7 * 86_400_000)) + 1
  return `${pad(isoYear, 4)}-W${pad(week)}`
}

/** monthKey('2026-08-20') === '2026-08'. A slice, deliberately — no Date, no TZ. */
export function monthKey(dateISO: DateISO): MonthKey {
  if (!isValidDateISO(dateISO)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(dateISO)}`)
  return dateISO.slice(0, 7)
}

/** The day `n` days after `dateISO`, as a date string. Used by badge streak rules (F09). */
export function addDays(dateISO: DateISO, delta: number): DateISO {
  const d = utcDay(dateISO)
  d.setUTCDate(d.getUTCDate() + delta)
  return toISO(d)
}

/** Whole days between two calendar days, `b - a`. Timezone-free by construction. */
export function daysBetween(a: DateISO, b: DateISO): number {
  return Math.round((+utcDay(b) - +utcDay(a)) / 86_400_000)
}
