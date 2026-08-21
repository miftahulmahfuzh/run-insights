/**
 * Text in, integers out — the edge between what a reviewer types and what `ReviewDraft` holds.
 *
 * The draft is integers in the smallest sensible unit (D5), which is the right thing to store and
 * an unusable thing to type. Nobody proofreading a splits table wants to convert `04:48` into
 * `288` in their head, and the moment they have to, the review stops being a glance at the
 * screenshot and becomes arithmetic — which is exactly the work D2 took away from the model and
 * has no business handing to the human instead.
 *
 * So every editable control shows the value the way the screenshot shows it (`04:48`, `7'09"`,
 * `10.67`) and these functions do the conversion, once, in a module a unit test can reach.
 *
 * ── THE PARSE CONTRACT ──────────────────────────────────────────────────────────────────────
 * Three outcomes, and the middle one is the one that matters:
 *
 *   `''`              → `{ value: null }`     a cleared field is a null, not a zero
 *   unparseable       → `{ value: null, invalid: true }`
 *   parseable         → `{ value: <int> }`
 *
 * An unparseable entry must never silently become `null`, because `null` is a legitimate value
 * for most of these fields — a blank cadence cell is normal. Collapsing "I typed nonsense" into
 * "there was nothing there" would let a typo erase a number the screenshot plainly shows, with no
 * error and no trace. `invalid` is what keeps the two apart.
 *
 * PURE MODULE.
 */

export interface ParseResult {
  value: number | null
  invalid?: true
}

const EMPTY: ParseResult = { value: null }
const INVALID: ParseResult = { value: null, invalid: true }

function blank(text: string): boolean {
  return text.trim() === ''
}

/**
 * `'4:48'` / `'04:48'` / `'1:18:36'` / `'288'` → seconds.
 *
 * A bare number is read as seconds, not as minutes: the splits table's cells are always MM:SS on
 * screen, so a lone integer means the reviewer is entering the stored unit deliberately.
 */
export function parseDurationInput(text: string): ParseResult {
  if (blank(text)) return EMPTY
  const parts = text.trim().split(':')
  if (parts.length > 3) return INVALID

  const numbers = parts.map((p) => (/^\d{1,3}$/.test(p.trim()) ? Number(p.trim()) : NaN))
  if (numbers.some((n) => Number.isNaN(n))) return INVALID

  // Only the leading field may exceed 59 — '90:00' is a legitimate ninety minutes.
  if (numbers.slice(1).some((n) => n > 59)) return INVALID

  const seconds = numbers.reduce((total, n) => total * 60 + n, 0)
  return { value: seconds }
}

/** `288` → `'4:48'`. The editable spelling; `formatDuration` owns the display spelling. */
export function toDurationInput(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return ''
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * `"7'09\""` / `'7:09'` / `'709'`?  — no. Apostrophes and quotes are accepted because that is
 * what the screenshot prints and what a keyboard will produce; a bare number is seconds per km.
 */
export function parsePaceInput(text: string): ParseResult {
  if (blank(text)) return EMPTY
  const normalised = text
    .trim()
    .replace(/['’]/g, ':')
    .replace(/["”\s]/g, '')
  const cleaned = normalised.replace(/\/?km$/i, '').replace(/:$/, '')
  return parseDurationInput(cleaned)
}

/** `429` → `'7:09'`. Colon, not `7'09"`, because a colon is one keystroke on a phone keyboard. */
export function toPaceInput(secPerKm: number | null): string {
  return toDurationInput(secPerKm)
}

/** A whole number in a range. Out of range is `invalid`, not clamped — clamping hides a typo. */
export function parseIntInput(text: string, min = 0, max = 1_000_000): ParseResult {
  if (blank(text)) return EMPTY
  const trimmed = text.trim()
  if (!/^-?\d+$/.test(trimmed)) return INVALID
  const value = Number(trimmed)
  if (value < min || value > max) return INVALID
  return { value }
}

export function toIntInput(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '' : String(Math.round(value))
}

/**
 * Distance, in kilometres, to two decimals.
 *
 * **A comma is accepted and read as a decimal point.** Apple prints `10,67KM` and the reviewer is
 * copying from that screen; refusing their comma would be the app being pedantic about a
 * convention it chose for itself (roadmap §4.2 — we render a period because the copy is English,
 * not because a comma is wrong). Reading it is free; rendering it is what stays consistent.
 */
export function parseDistanceInput(text: string): ParseResult {
  if (blank(text)) return EMPTY
  const trimmed = text.trim().replace(',', '.')
  if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(trimmed)) return INVALID
  const km = Number(trimmed)
  if (!Number.isFinite(km)) return INVALID
  // Two decimals is the stored resolution: distance becomes integer metres at commit (D5), so
  // rounding here means the value shown is exactly the value saved.
  return { value: Math.round(km * 100) / 100 }
}

export function toDistanceInput(km: number | null): string {
  return km === null || !Number.isFinite(km) ? '' : km.toFixed(2)
}

/** `'07:07'`, `'7:07'`, `'0707'` → `'07:07'`; anything else is invalid. */
export function parseClockInput(text: string): { value: string | null; invalid?: true } {
  if (blank(text)) return { value: null }
  const trimmed = text.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length !== 3 && digits.length !== 4) return { value: null, invalid: true }
  const h = Number(digits.slice(0, digits.length - 2))
  const m = Number(digits.slice(-2))
  if (h > 23 || m > 59) return { value: null, invalid: true }
  return { value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
}
