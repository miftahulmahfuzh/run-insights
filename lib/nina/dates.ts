/**
 * R15 — the date half. **She emits ISO strings (RU-13) and this module is what checks them.**
 *
 * ── WHY NINA RESOLVES THE INDONESIAN AND THIS FILE DOES NOT ──────────────────────────────────
 * "coba compare run gw tanggal 3 vs 1 bulan ini" and "lari gw kemaren gimana" are resolved by the
 * MODEL, not here, because `NinaContext.now` already puts `todayISO`, `weekday`, `weekdayId`,
 * `clock` and `isoWeek` in front of her on every turn. Writing a second Indonesian date parser
 * server-side would mean two things that can disagree about what "kemaren" means, and the one
 * without the clock in its context would be the one that is wrong.
 *
 * What this file owns is the half a model cannot be trusted with: that the string is a real day,
 * that it is not in the future, and that "there is no run on that day" is an ANSWER rather than an
 * empty collection. `lib/nina/dates.test.ts` pins the user's own two cases against today =
 * 2026-09-03, so a prompt edit that breaks them fails a test instead of a conversation.
 *
 * ── NOTHING HERE FORMATS A NUMBER ─────────────────────────────────────────────────────────────
 * Invariant 3: every string a run contributes comes from `buildNinaRunFact`, which is phase 2's
 * one spelling authority and already routes through `lib/format.ts`. This file adds day labels
 * and day counts and nothing else.
 */
import { daysBetween, isValidDateISO, type DateISO } from '@/lib/date/ranges'
import { formatDay } from '@/lib/format'

import {
  buildNinaRunFact,
  WEEKDAY_EN,
  WEEKDAY_ID,
  type NinaRunFact,
  type NinaRunInput,
} from './context'

/** Matches `LOOKUP_RUNS_TOOL.input_schema.properties.dates.maxItems`. Kept in sync by hand. */
export const MAX_LOOKUP_DATES = 5

export interface DateInvalid {
  kind: 'invalid'
  /** Echoed back verbatim so the tool result can name what she actually sent. */
  input: string
  /** One plain clause, addressed to her: "not a real calendar day". */
  reason: string
}

export interface DateFuture {
  kind: 'future'
  dateISO: DateISO
  dayLabel: string
  /** Always >= 1. */
  daysAhead: number
}

export interface DateAbsence {
  kind: 'no_run'
  dateISO: DateISO
  /** `'Tue, 1 Sep 2026'` — `formatDay`, the spelling every screen uses. */
  dayLabel: string
  weekday: (typeof WEEKDAY_EN)[number]
  weekdayId: (typeof WEEKDAY_ID)[number]
  /** Whole days from that day to today. 0 means today. Always >= 0. */
  daysAgo: number
}

export interface DateHit {
  kind: 'runs'
  dateISO: DateISO
  dayLabel: string
  weekday: (typeof WEEKDAY_EN)[number]
  weekdayId: (typeof WEEKDAY_ID)[number]
  daysAgo: number
  /**
   * One entry per run that day, earliest start first. **Two entries is a real state** — the
   * `two_a_days` badge exists — and `lookup_runs` returns both. Only `compare_runs` narrows it,
   * via `ambiguousFrom`.
   */
  runs: NinaRunFact[]
}

export type DateResolution = DateInvalid | DateFuture | DateAbsence | DateHit

/** What `compare_runs` answers with when one side of the comparison names two runs. */
export interface DateAmbiguous {
  kind: 'ambiguous'
  dateISO: DateISO
  dayLabel: string
  /** Enough to ask the question, and no more. She asks; she does not guess. */
  runs: Array<{ runId: string; startedAt: string | null; distance: string; duration: string }>
}

/** `occurred_on` -> that day's runs, earliest start first. Built once per turn. */
export type RunsByDate = Map<DateISO, NinaRunInput[]>

/**
 * A real calendar day, not just four-two-two digits.
 *
 * `new Date('2026-02-30T00:00:00Z')` does not throw — it rolls forward to 2 March — so the check
 * is a round trip: parse, re-render, compare. `'2026-13-45'` fails the shape test first;
 * `'2026-02-30'` fails only here, and it is the one Nina can actually produce by counting
 * backwards off the end of a month.
 */
export function isRealCalendarDate(value: unknown): value is DateISO {
  if (!isValidDateISO(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

/** `null` rather than a throw: every caller here is answering a model, not a programmer. */
export function parseCalendarDate(value: unknown): DateISO | null {
  return isRealCalendarDate(value) ? value : null
}

/**
 * Mon=0 .. Sun=6, matching the order of `WEEKDAY_EN` / `WEEKDAY_ID`.
 *
 * Three lines of UTC arithmetic over a string, identical to the opening of `isoWeekKeyOf`. Not
 * imported from phase 2 on purpose: asking that phase for a second export to save three
 * deterministic lines is a worse trade than the duplication, and `dates.test.ts` pins Monday and
 * Sunday so a drift fails loudly.
 */
function weekdayIndex(dateISO: DateISO): number {
  const d = new Date(`${dateISO}T00:00:00Z`)
  return (d.getUTCDay() + 6) % 7
}

/**
 * Group the reviewed history by day. Within a day, earliest `started_at` first; a run with no
 * `started_at` (the screenshot had no clock) sorts last, because an unknown time cannot be
 * asserted to be the morning one.
 */
export function indexRunsByDate(runs: readonly NinaRunInput[]): RunsByDate {
  const index: RunsByDate = new Map()
  for (const run of runs) {
    const bucket = index.get(run.occurredOn)
    if (bucket) bucket.push(run)
    else index.set(run.occurredOn, [run])
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => {
      if (a.startedAt === b.startedAt) return 0
      if (a.startedAt == null) return 1
      if (b.startedAt == null) return -1
      return a.startedAt < b.startedAt ? -1 : 1
    })
  }
  return index
}

/**
 * One ISO string to one answer. **Never returns an empty success**: the four `kind`s are
 * exhaustive and each one is a sentence she can say.
 */
export function resolveDate(input: string, index: RunsByDate, todayISO: DateISO): DateResolution {
  const dateISO = parseCalendarDate(input)
  if (dateISO == null) {
    return {
      kind: 'invalid',
      input,
      reason: 'not a real calendar day in YYYY-MM-DD form',
    }
  }

  const daysAgo = daysBetween(dateISO, todayISO)
  if (daysAgo < 0) {
    return { kind: 'future', dateISO, dayLabel: formatDay(dateISO), daysAhead: -daysAgo }
  }

  const dow = weekdayIndex(dateISO)
  const common = {
    dateISO,
    dayLabel: formatDay(dateISO),
    weekday: WEEKDAY_EN[dow]!,
    weekdayId: WEEKDAY_ID[dow]!,
    daysAgo,
  }

  const found = index.get(dateISO)
  if (found == null || found.length === 0) return { kind: 'no_run', ...common }

  return { kind: 'runs', ...common, runs: found.map((run) => buildNinaRunFact(run, todayISO)) }
}

/**
 * The array form, with the cap and the de-duplication applied here rather than trusted to the
 * schema. `maxItems: 5` in a tool schema is a request — the same endpoint returned HTTP 200 for a
 * call that omitted a `required` field from every array entry — so the cap that holds is this one.
 * Duplicates collapse because "compare 3 Sep with 3 Sep" should cost one lookup, not two.
 */
export function resolveDates(
  inputs: readonly string[],
  index: RunsByDate,
  todayISO: DateISO,
): DateResolution[] {
  const seen = new Set<string>()
  const out: DateResolution[] = []
  for (const input of inputs) {
    if (out.length >= MAX_LOOKUP_DATES) break
    if (seen.has(input)) continue
    seen.add(input)
    out.push(resolveDate(input, index, todayISO))
  }
  return out
}

/**
 * A `DateHit` with more than one run, narrowed to the question she must ask. Ruling (c): the app
 * never picks. Picking the longer run silently would have her talk confidently about a run he did
 * not mean, and nothing in the transcript would ever show it.
 */
export function ambiguousFrom(hit: DateHit): DateAmbiguous {
  return {
    kind: 'ambiguous',
    dateISO: hit.dateISO,
    dayLabel: hit.dayLabel,
    runs: hit.runs.map((run) => ({
      runId: run.runId,
      startedAt: run.startedAt,
      distance: run.distance,
      duration: run.duration,
    })),
  }
}
