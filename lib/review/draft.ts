import { todayInJakarta, type DateISO } from '@/lib/date/ranges'
import type { CorrectionEvent, ExtractionCorrections, RunIntent } from '@/lib/db/schema'
import type { ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * The **review draft** — the one object the correction screen edits, and the one object the
 * commit action validates.
 *
 * It mirrors `ExtractedSession` field-for-field (same names, same units, same nullability) so
 * that a correction's field path is literally the extractor's own field path, which is what makes
 * `extractions.corrections` (R-7) analysable against the prompt that produced the error. Three
 * fields are additions rather than mirrors, and each is a column F05 is the only writer of:
 *
 *   - `occurredOn` — `runs.occurred_on` is a NOT NULL `date`, and the extraction only ever sees a
 *     year-less label ("Thu, 20 Aug"). §`resolveOccurredOn` guesses; the human confirms. The guess
 *     is diffed like any other field, so "how often is the date guess wrong" is a measurable
 *     question rather than a hunch.
 *   - `intent` and `note` — `runs.intent` / `runs.note` have no other writer anywhere in the
 *     product. Without them here those columns are dead schema.
 *
 * PURE MODULE. No `server-only`, no db client — the review screen is a client component and
 * imports this directly.
 */

/* ============================================================================
 * §1 The draft shape
 * ==========================================================================*/

export interface DraftSplit {
  km: number
  timeSec: number
  paceSecPerKm: number
  hrBpm: number | null
  cadenceSpm: number | null
  /** D14 — the final sub-kilometre row. Never averaged into a pace. */
  partial: boolean
}

export interface DraftZone {
  zone: number
  durationSec: number
  /** null is legitimate for zone 1 only — Apple prints "< 140", not a floor. */
  minBpm: number | null
  /** null is legitimate for zone 5 only. */
  maxBpm: number | null
}

export interface DraftPostWorkoutHr {
  label: string
  /**
   * Nullable, unlike the extractor's own `ExtractedPostWorkoutHr`, and the array is POSITIONAL:
   * R-9 gives `[0]` and `[1]` two named columns, so clearing the end-of-run reading must leave a
   * hole rather than promote the one-minute reading into its place and mislabel it.
   */
  bpm: number | null
}

export interface ReviewDraft {
  /** F05 addition — `runs.occurred_on`. Always present; see `resolveOccurredOn`. */
  occurredOn: DateISO
  activityType: string | null
  goal: string | null
  /** The extractor's year-less label, kept verbatim as evidence for `occurredOn`. */
  dateLabel: string | null
  /** 'HH:MM' as the screenshot prints it. Widened to 'HH:MM:SS' only at the DB boundary. */
  startTime: string | null
  endTime: string | null
  location: string | null
  durationSec: number | null
  /** Kilometres, as Apple prints them. Converted to integer metres (D5) at commit. */
  distanceKm: number | null
  activeKcal: number | null
  totalKcal: number | null
  elevationGainM: number | null
  avgCadenceSpm: number | null
  avgPaceSecPerKm: number | null
  avgHrBpm: number | null
  maxHrBpm: number | null
  restingHrBpm: number | null
  splits: DraftSplit[]
  hrZones: DraftZone[]
  /** R-9 — `[0]` becomes `runs.end_hr_bpm`, `[1]` becomes `runs.hr_1min_post_bpm`. */
  postWorkoutHr: DraftPostWorkoutHr[]
  /** F05 addition — `runs.intent`. */
  intent: RunIntent | null
  /** F05 addition — `runs.note`. */
  note: string | null
}

export const RUN_INTENTS: readonly RunIntent[] = ['easy', 'tempo', 'long', 'race', 'unspecified']

export const RUN_INTENT_LABEL: Record<RunIntent, string> = {
  easy: 'Easy',
  tempo: 'Tempo',
  long: 'Long',
  race: 'Race',
  unspecified: 'Not sure',
}

/* ============================================================================
 * §2 Hydration — the three ways a draft comes into existence
 * ==========================================================================*/

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

/**
 * `'Thu, 20 Aug'` → `'2026-08-20'`, and `null` when the label cannot be read.
 *
 * Apple's summary screen prints no year. Guessing one is unavoidable — `runs.occurred_on` is NOT
 * NULL — so the guess is made in the only direction that can be right: **a run cannot have
 * happened in the future**, so the year is this Jakarta year, stepped back one if that lands
 * after today. A screenshot of a run from last December, reviewed in January, resolves correctly;
 * a run from three years ago does not, which is why the field is an editable date input on the
 * review screen rather than a value the commit trusts.
 *
 * Deliberately permissive about the shape around the day and the month (`Thu, 20 Aug`,
 * `20 August`, `Aug 20, 2025` all parse) and deliberately strict about the two things it reads:
 * a 1–31 day number and a recognisable month name. It never falls back to `Date.parse`, which
 * would happily accept "Tangerang" as a date in some runtimes.
 */
export function resolveOccurredOn(
  dateLabel: string | null | undefined,
  now: Date = new Date(),
): DateISO | null {
  if (!dateLabel) return null
  const text = dateLabel.toLowerCase()

  const monthIndex = MONTHS.findIndex((m) => text.includes(m.slice(0, 3)))
  if (monthIndex < 0) return null

  const dayMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])\b/)
  if (!dayMatch) return null
  const day = Number(dayMatch[1])

  const today = todayInJakarta(now)
  const explicitYear = text.match(/\b(20\d{2})\b/)
  const year = explicitYear ? Number(explicitYear[1]) : Number(today.slice(0, 4))

  const candidate = toISODate(year, monthIndex + 1, day)
  if (candidate === null) return null
  if (explicitYear) return candidate

  // No year on the screen: the only safe reading is "not in the future".
  if (candidate <= today) return candidate
  const previous = toISODate(year - 1, monthIndex + 1, day)
  return previous ?? candidate
}

/** Rejects 31 February rather than rolling it into March, which `new Date()` would do silently. */
function toISODate(year: number, month: number, day: number): DateISO | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

/** The all-blank draft — §8's manual-entry path, which is this screen and not a second one. */
export function emptyDraft(now: Date = new Date()): ReviewDraft {
  return {
    occurredOn: todayInJakarta(now),
    activityType: 'Outdoor Run',
    goal: null,
    dateLabel: null,
    startTime: null,
    endTime: null,
    location: null,
    durationSec: null,
    distanceKm: null,
    activeKcal: null,
    totalKcal: null,
    elevationGainM: null,
    avgCadenceSpm: null,
    avgPaceSecPerKm: null,
    avgHrBpm: null,
    maxHrBpm: null,
    restingHrBpm: null,
    splits: [],
    hrZones: [],
    postWorkoutHr: [],
    intent: null,
    note: null,
  }
}

/** `/x/[extractionId]`'s baseline: what the reader said, before a human touched it. */
export function hydrateDraftFromExtraction(
  session: ExtractedSession | null,
  now: Date = new Date(),
): ReviewDraft {
  const blank = emptyDraft(now)
  if (!session) return blank

  return {
    ...blank,
    occurredOn: resolveOccurredOn(session.dateLabel, now) ?? blank.occurredOn,
    activityType: session.activityType ?? blank.activityType,
    goal: session.goal,
    dateLabel: session.dateLabel,
    startTime: session.startTime,
    endTime: session.endTime,
    location: session.location,
    durationSec: session.durationSec,
    distanceKm: session.distanceKm,
    activeKcal: session.activeKcal,
    totalKcal: session.totalKcal,
    elevationGainM: session.elevationGainM,
    avgCadenceSpm: session.avgCadenceSpm,
    avgPaceSecPerKm: session.avgPaceSecPerKm,
    avgHrBpm: session.avgHrBpm,
    maxHrBpm: session.maxHrBpm,
    restingHrBpm: session.restingHrBpm,
    splits: session.splits.map((s) => ({ ...s })),
    hrZones: session.hrZones.map((z) => ({ ...z })),
    postWorkoutHr: session.postWorkoutHr.map((p) => ({ ...p })),
  }
}

/** Just enough of a committed run to rebuild its draft. Structural, so tests need no DB. */
export interface StoredRunShape {
  occurredOn: string
  activityType: string
  location: string | null
  startedAt: string | null
  endedAt: string | null
  durationSec: number
  distanceM: number
  activeKcal: number | null
  totalKcal: number | null
  elevationM: number | null
  avgCadence: number | null
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  restingHr: number | null
  endHrBpm: number | null
  hr1MinPostBpm: number | null
  intent: RunIntent | null
  note: string | null
}

export interface StoredSplitShape {
  km: number
  timeSec: number
  paceSec: number
  hr: number | null
  cadence: number | null
  partial: boolean
}

export interface StoredZoneShape {
  zone: number
  durationSec: number
  minBpm: number | null
  maxBpm: number | null
}

/**
 * `/r/[id]/edit`'s baseline: **the stored run, not the original extraction.**
 *
 * This distinction is the whole reason the function exists. A post-review edit's `from` value has
 * to be what the number was *before this edit* — which, on the second correction of a field, is
 * the first correction's `to`, not the model's original guess. Diffing against the extraction
 * instead would record a `from` that has not been true since the first commit and would make
 * §6.2's "how wrong is the extractor" query count one model error twice.
 *
 * `postWorkoutHr` round-trips lossily on purpose: `runs` keeps only the two readings R-9 gave
 * columns to, so the +2 min entry that was reviewable at extraction time is gone. The labels are
 * regenerated rather than stored, because they are chrome ("1 MIN"), not data.
 */
export function draftFromRun(
  run: StoredRunShape,
  splits: StoredSplitShape[],
  zones: StoredZoneShape[],
): ReviewDraft {
  const postWorkoutHr: DraftPostWorkoutHr[] =
    run.endHrBpm === null && run.hr1MinPostBpm === null
      ? []
      : [
          { label: 'End', bpm: run.endHrBpm },
          { label: '1 MIN', bpm: run.hr1MinPostBpm },
        ]

  return {
    occurredOn: run.occurredOn,
    activityType: run.activityType,
    goal: null,
    dateLabel: null,
    startTime: narrowTime(run.startedAt),
    endTime: narrowTime(run.endedAt),
    location: run.location,
    durationSec: run.durationSec,
    distanceKm: Math.round(run.distanceM) / 1000,
    activeKcal: run.activeKcal,
    totalKcal: run.totalKcal,
    elevationGainM: run.elevationM,
    avgCadenceSpm: run.avgCadence,
    avgPaceSecPerKm: run.avgPaceSec,
    avgHrBpm: run.avgHr,
    maxHrBpm: run.maxHr,
    restingHrBpm: run.restingHr,
    splits: splits.map((s) => ({
      km: s.km,
      timeSec: s.timeSec,
      paceSecPerKm: s.paceSec,
      hrBpm: s.hr,
      cadenceSpm: s.cadence,
      partial: s.partial,
    })),
    hrZones: zones.map((z) => ({
      zone: z.zone,
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
    postWorkoutHr,
    intent: run.intent,
    note: run.note,
  }
}

/** `'07:07:00'` → `'07:07'`. Postgres `time` widens; the screen and the screenshot do not. */
export function narrowTime(value: string | null): string | null {
  if (!value) return null
  const m = value.match(/^(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : value
}

/** `'07:07'` → `'07:07:00'`, the shape the `time` column wants. */
export function widenTime(value: string | null): string | null {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  return `${m[1]!.padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`
}

/* ============================================================================
 * §3 Field paths and the corrections diff (R-7 / plan §6.1)
 * ==========================================================================*/

/**
 * **F05 owns this syntax** (R-7: "path syntax for nested splits and zones stays F05's to
 * define"). Dotted, zero-indexed, and identical to the extractor's own field names:
 *
 *     distanceKm            durationSec            occurredOn
 *     splits.0.timeSec      hrZones.3.durationSec  postWorkoutHr.0.bpm
 *
 * Index, not `km` number, for the array element: a correction that renumbers km 11 to km 10 has
 * to be expressible, and a key that changes identity when its own value changes cannot express
 * it. The index is the row's position in the table the reviewer was looking at.
 */
export type FieldPath = string

const SCALAR_FIELDS = [
  'occurredOn',
  'activityType',
  'goal',
  'dateLabel',
  'startTime',
  'endTime',
  'location',
  'durationSec',
  'distanceKm',
  'activeKcal',
  'totalKcal',
  'elevationGainM',
  'avgCadenceSpm',
  'avgPaceSecPerKm',
  'avgHrBpm',
  'maxHrBpm',
  'restingHrBpm',
  'intent',
  'note',
] as const

const SPLIT_FIELDS = ['km', 'timeSec', 'paceSecPerKm', 'hrBpm', 'cadenceSpm', 'partial'] as const
const ZONE_FIELDS = ['zone', 'durationSec', 'minBpm', 'maxBpm'] as const
const POST_HR_FIELDS = ['label', 'bpm'] as const

/**
 * Every leaf of a draft, keyed by its field path.
 *
 * A flat map is what makes the diff below total: an added split row and a deleted one are the
 * same operation as a changed value (a key present on one side and absent on the other), so no
 * branch of the diff can forget a case. It also means a future field is diffed the moment it is
 * added to `SCALAR_FIELDS`, rather than the day somebody remembers to extend a switch.
 */
export function flattenDraft(draft: ReviewDraft): Map<FieldPath, unknown> {
  const out = new Map<FieldPath, unknown>()
  for (const field of SCALAR_FIELDS) out.set(field, draft[field])
  draft.splits.forEach((split, i) => {
    for (const field of SPLIT_FIELDS) out.set(`splits.${i}.${field}`, split[field])
  })
  draft.hrZones.forEach((zone, i) => {
    for (const field of ZONE_FIELDS) out.set(`hrZones.${i}.${field}`, zone[field])
  })
  draft.postWorkoutHr.forEach((entry, i) => {
    for (const field of POST_HR_FIELDS) out.set(`postWorkoutHr.${i}.${field}`, entry[field])
  })
  return out
}

export interface DiffOptions {
  phase: CorrectionEvent['phase']
  /** ISO instant stamped on every event produced by this commit. */
  correctedAt: string
  /**
   * Which check (if any) was failing on a given path **at the moment the reviewer arrived**.
   * `null` is itself signal (plan §6.1): a field corrected repeatedly with no check firing is a
   * candidate for a new check, and that only reads as a gap if `null` is recorded honestly rather
   * than left off.
   */
  checkIdFor?: (path: FieldPath) => string | undefined
}

/**
 * The edits a commit is making, in R-7's shape — **only the leaves that actually changed.**
 *
 * A field the reviewer read carefully and left alone produces nothing: `corrections` measures
 * edits, not attention (plan §6.1). Values are compared with `Object.is` after both sides have
 * been through `flattenDraft`, so `null` → `null` is not a correction and `false` → `true` is.
 *
 * A deleted split row appears as its leaves going to `null`; an added row appears as its leaves
 * arriving from `null`. That is the price of a flat path syntax and it is the right price: the
 * §6.2 analytics query groups by path and counts events, and both of those work unchanged.
 */
export function diffCorrections(
  before: ReviewDraft,
  after: ReviewDraft,
  options: DiffOptions,
): ExtractionCorrections {
  const from = flattenDraft(before)
  const to = flattenDraft(after)
  const out: ExtractionCorrections = {}

  /**
   * **`manual` is not a diff, it is a transcript** (plan §6.1: "`from` is always null").
   *
   * There is no extracted baseline to compare against — that is what `manual` means. The blank
   * draft the screen starts from is not one either: `emptyDraft` pre-fills today's date and
   * "Outdoor Run", and recording those as `from` values would claim the extractor produced them.
   * §6.2's query would then count our own defaults as model output.
   *
   * So every non-null value the human entered is recorded as arriving from nothing, including the
   * ones they accepted unchanged — because in a manual commit they typed or confirmed all of it.
   */
  if (options.phase === 'manual') {
    for (const [path, value] of to) {
      const entered = normalise(value)
      if (entered === null) continue
      out[path] = [{ from: null, to: entered, phase: 'manual', correctedAt: options.correctedAt }]
    }
    return out
  }

  for (const path of new Set([...from.keys(), ...to.keys()])) {
    const previous = from.has(path) ? from.get(path) : null
    const next = to.has(path) ? to.get(path) : null
    if (Object.is(normalise(previous), normalise(next))) continue

    const event: CorrectionEvent = {
      from: normalise(previous),
      to: normalise(next),
      phase: options.phase,
      correctedAt: options.correctedAt,
    }
    const checkId = options.checkIdFor?.(path)
    if (checkId) event.checkId = checkId
    out[path] = [event]
  }

  return out
}

/** `undefined` cannot survive a jsonb round trip; empty strings are a blank input, not a value. */
function normalise(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

/**
 * Append this commit's events onto whatever the column already holds, oldest first.
 *
 * **Append, never overwrite** — that is the entire point of R-7's array-per-field. A run
 * corrected at review and again a week later has two events on the same path, and losing the
 * first would erase the extraction failure the column exists to record.
 *
 * A pre-R-7 object value (`{from, to}`) is coerced into a one-event array rather than dropped:
 * the same defensive reading `getExtractionErrorProfile`'s `jsonb_typeof` guard takes.
 */
export function mergeCorrections(
  existing: ExtractionCorrections | null | undefined,
  incoming: ExtractionCorrections,
): ExtractionCorrections {
  const out: ExtractionCorrections = {}
  for (const [path, events] of Object.entries(existing ?? {})) {
    out[path] = Array.isArray(events) ? [...events] : [events as CorrectionEvent]
  }
  for (const [path, events] of Object.entries(incoming)) {
    out[path] = [...(out[path] ?? []), ...events]
  }
  return out
}
