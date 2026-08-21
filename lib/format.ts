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
 * PURE MODULE — no imports, client- and server-importable, testable without a DOM.
 */

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
