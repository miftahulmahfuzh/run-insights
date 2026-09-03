import { badgeTitle, BADGE_KEYS } from '@/lib/badges/catalog'
import { BADGE_META } from '@/lib/badges/meta'
import type { BadgeKey, StoredBadge } from '@/lib/badges/types'
import { daysBetween, isoWeekKeyOf, jakartaDayOf } from '@/lib/date/ranges'
import type { DateISO, IsoWeekKey } from '@/lib/date/ranges'
import type { RunIntent, Sex } from '@/lib/db/schema'
import { flagCopy } from '@/lib/flags/copy'
import {
  formatBpm,
  formatCadence,
  formatClock,
  formatClockSec,
  formatDay,
  formatDayShort,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
  formatPaceDelta,
  formatPercent,
} from '@/lib/format'
import { ageFromBirthYear } from '@/lib/metrics/age'
import type { Flag } from '@/lib/metrics/flags'
import type { HrMax, HrMaxSource } from '@/lib/metrics/hrMax'
import type { SessionMetrics } from '@/lib/metrics/types'
import { isRecordKey, RECORD_KEYS } from '@/lib/records/catalog'
import { formatRecordValue, RECORD_LABELS } from '@/lib/records/labels'
import type { RecordKey } from '@/lib/records/types'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE BOUNDARY. Everything Nina is allowed to know is built here, and nothing else exists to
 *  her. Pure functions, no I/O, no `server-only` — `lib/nina/load.ts` does the fetching and
 *  hands the rows in, exactly the split `lib/llm/facts.ts` and `lib/insights/load.ts` use.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `lib/llm/facts.ts` is the specification for this file and its two hard rules carry over
 * verbatim (plan index, invariants 2 and 3):
 *
 *  1. **ANYTHING REQUIRING ARITHMETIC TO ANSWER DOES NOT EXIST TO HER.** If F06 has not
 *     precomputed it as a field, it is not here. MEASURED: asked to compute aerobic decoupling
 *     from raw splits, `glm-5.3` returned −14.1% against a true +12.3% — a flipped sign, on a
 *     calculation easier than most of the ones a "she can probably manage this" exception would
 *     cover. Every day-gap in this file is precomputed as `daysAgo` for the same reason.
 *
 *  2. **EVERY STRING COMES FROM `lib/format.ts`.** A pace is `formatPace(442, true)`, the same
 *     call the run detail page makes, so she reads the exact characters he reads. Two spellings
 *     of one number is how a reply ends up quoting `7:22` at someone looking at `7'22"/km`.
 *
 * ── THREE DELIBERATE DIVERGENCES FROM `lib/llm/facts.ts` ──────────────────────────────────────
 *
 *  · **`weightKg` and `sex` ARE IN.** RU-1 repeals D15/R-28 app-wide: *"exposing user details
 *    like weight to ai analysis will 100% make the analysis much more accurate"*. They are here
 *    so her physiology is right for HIM rather than for an average adult. `NEVER_SAY_BLOCK` and
 *    `NUMBERS_RULE` are what keep that from becoming an opinion about his body, and `NUMBERS_RULE`
 *    is what keeps it from becoming a BMI — see the next note.
 *
 *  · **`recentRuns[].note` IS IN.** R6: *"nina can access EVERYTHING saved in the app"*.
 *    `lib/llm/facts.ts` excludes it, and its reason is still true: a runner's own words can
 *    contain numbers ("did 15k today") that disagree with the reviewed record. The exclusion is
 *    not the only way to handle that, and it is not the way R6 allows. So it is in, and
 *    `NUMBERS_RULE` labels it as HIS WORDS rather than as data, with the tie-break stated: when
 *    the note and the numbers disagree, the numbers are what the app measured and the note is
 *    what he remembers. Do not "restore consistency" by deleting the field.
 *
 *  · **NO SPLITS, and the conversation window instead.** F07 §1.1 admits one full child inclusion
 *    per payload; F07 spends it on the narrated run's eleven splits. Nina spends it on the last
 *    `CONTEXT_MESSAGE_WINDOW` messages, which is the inclusion that makes her a friend rather
 *    than a report. A per-run split table is what `lookup_runs` is for.
 *
 * ── WHY NOT REUSE `NarrativeProfile` ─────────────────────────────────────────────────────────
 * Phase 1 widens `lib/llm/facts.ts`'s `NarrativeProfile` with `weightKg` and `sex`, and it would
 * be tempting to import it here. `NinaProfile` below is separate on purpose: `NarrativeProfile`
 * is deliberately a RESTRICTION ("a two-field type rather than F03's `Profile` so that passing it
 * is a compile error"), and any future narrowing of F07's coach payload would silently narrow
 * Nina's. She reads the whole profile; F07 reads a subset of it. Two intents, two types.
 *
 * ── WHAT IS STILL NOT HERE ───────────────────────────────────────────────────────────────────
 * **No BMI, no calorie target, no macro split, no VO2max, no race prediction.** F06 computes none
 * of them, and the plan index's Scope is explicit: *"A number she needs that F06 does not compute
 * is a change to F06, in its own card, not a calculation in a prompt."* Computing one here would
 * put a health claim in her mouth that nothing in this repository tested.
 */

/* ============================================================================
 * Now — R16
 * ==========================================================================*/

export const JAKARTA_TIME_ZONE = 'Asia/Jakarta'

export type PartOfDay = 'pagi' | 'siang' | 'sore' | 'malam'

/**
 * The Indonesian parts of day, as data, because `pagi` is load-bearing: `"pagi mif"` at four in
 * the afternoon is the single most obvious way she stops sounding human. Precomputed rather than
 * left to the model for the same reason every day-gap is — a greeting derived from a clock string
 * is arithmetic, and rule 1 does not have a size exemption.
 *
 * `malam` wraps midnight: everything from 18:30 to 03:59 is night.
 */
export const PART_OF_DAY_BOUNDS = {
  /** 04:00 */ pagiFromMin: 4 * 60,
  /** 11:00 */ siangFromMin: 11 * 60,
  /** 15:00 */ soreFromMin: 15 * 60,
  /** 18:30 */ malamFromMin: 18 * 60 + 30,
} as const

/**
 * Monday-first, matching `lib/date/ranges.ts`'s `(getUTCDay() + 6) % 7` convention throughout.
 *
 * **Weekday names live here and not in `lib/format.ts` on purpose.** R-23 makes that file the one
 * formatting authority, and D10 makes its copy English — `formatDay` already gives
 * `'Thu, 20 Aug 2026'`. `'Selasa'` is not an English string and has no business in an
 * English-copy module; it exists because R2 requires her to say `"selasa ini"`. This is the only
 * place in the app that spells a weekday in Indonesian.
 */
export const WEEKDAY_EN = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export const WEEKDAY_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const

export interface NowFacts {
  /** Always `'Asia/Jakarta'`. Named in the payload so a reader can see which clock this is. */
  timeZone: typeof JAKARTA_TIME_ZONE
  /** `'2026-09-03'`. The day SHE emits into `lookup_runs` (RU-13), and the origin of every gap. */
  todayISO: DateISO
  /** `'Thu, 3 Sep 2026'` — `formatDay`, the spelling every screen uses. */
  dayLabel: string
  /** `'Thursday'`. */
  weekday: (typeof WEEKDAY_EN)[number]
  /** `'Kamis'` — so `"jadi ga lari selasa ini?"` names the right day. */
  weekdayId: (typeof WEEKDAY_ID)[number]
  /** `'14:03'`, 24-hour, Asia/Jakarta. */
  clock: string
  /** Precomputed from `clock`. See `PART_OF_DAY_BOUNDS`. */
  partOfDay: PartOfDay
  /** `'2026-W36'` — the same key `insights.scope_key` uses, so it joins with everything else. */
  isoWeek: IsoWeekKey
}

/* ============================================================================
 * The runner — R6
 * ==========================================================================*/

/**
 * Phase 1 owns `profiles.sex` **and** its type: `Sex` is exported from `lib/db/schema.ts` with
 * exactly `'male' | 'female' | 'other' | 'unspecified'`, alongside `SEX_VALUES`. So this module
 * imports it and re-exports it rather than declaring a second union with the same four members —
 * a column domain has one declaration, and the alias this phase originally planned would have
 * been a place for the two to drift apart. The import is type-only, so `context.ts` stays pure
 * and I/O-free: nothing from Drizzle survives compilation.
 *
 * Re-exported so that `load.ts`, and phase 3 after it, keep reading every fact type from the
 * boundary module instead of reaching around it into the schema. (`Sex` itself is imported at the
 * top of the file, beside `RunIntent`, from the same module.)
 */
export type { Sex }

/** The whole profile, as Nina reads it. See the header on why this is not `NarrativeProfile`. */
export interface NinaProfile {
  birthYear: number | null
  heightCm: number | null
  /** RU-1. `profiles.weight_kg` is the schema's one non-integer measured column. */
  weightKg: number | null
  /** RU-1 / R6 — the column phase 1 adds, typed by phase 1's `Sex`. */
  sex: Sex | null
  restingHr: number | null
}

export interface RunnerFacts {
  /** `users.name` as the OAuth provider gave it, or null. */
  fullName: string | null
  /** The confirmed short form (R7 / RU-8). Null until she has asked — phase 5 fills it. */
  nickname: string | null
  /**
   * Derived from `birthYear` at build time and never stored, exactly as `ProfileFacts` does it.
   *
   * The five scalars below stay RAW NUMBERS with their unit in the field name, matching
   * `ProfileFacts.heightCm`. They are not run measurements and `lib/format.ts` has no formatter
   * for any of them, so inventing one here would add a second formatting authority to satisfy a
   * rule (invariant 3) that is about paces, distances, durations and dates.
   */
  age: number | null
  heightCm: number | null
  weightKg: number | null
  sex: Sex | null
  restingHr: number | null
  /**
   * Carries its `source` into the prompt, and `NUMBERS_RULE` has a rule about it: an `estimated`
   * HRmax is a Tanaka formula and must be called a formula whenever a percentage leans on it.
   * The estimate was measured wrong by 2 bpm on the very first run this app analysed.
   */
  hrMax: { bpm: number; source: HrMaxSource } | null
}

/* ============================================================================
 * Memory — RU-6, written by phase 5
 * ==========================================================================*/

export interface MemorySlotInput {
  key: string
  /** Already a display string. Phase 5 writes prose here, not JSON. */
  value: string
  updatedAt: Date
}

export interface MemoryFactInput {
  id: string
  text: string
  /** RU-6 — the message she learned it from, so she can quote herself accurately. */
  sourceMessageId: string | null
  createdAt: Date
}

export interface MemorySlotFact {
  /** Phase 5 owns this vocabulary. She is handed the slots that exist; she never coins a key. */
  key: string
  value: string
  updatedOn: DateISO
  /** Whole days from `updatedOn` to today. Precomputed — rule 1. */
  daysAgo: number
}

export interface MemoryFact {
  id: string
  text: string
  sourceMessageId: string | null
  learnedOn: DateISO
  daysAgo: number
}

export interface MemoryFacts {
  /** The upserted standing facts that drive proactivity. */
  slots: MemorySlotFact[]
  /** The append-only ledger, **newest first**, that gives her colour. */
  facts: MemoryFact[]
}

/* ============================================================================
 * The conversation — RU-14
 * ==========================================================================*/

export type MessageRole = 'runner' | 'nina'

/**
 * **The prompt layer's spelling, and it is not the data layer's (RULING A1).** Phase 1's
 * `lib/nina/queries.ts` DTO calls these two fields `body` and `createdAt`, uniformly, in every
 * function. Phase 3's `dbNinaSourceGateway` is the single mapper —
 * `{ text: row.body, sentAt: row.createdAt }` — and neither side gets "fixed" to match the other:
 * a data-access name inside the boundary defeats the point of having a boundary.
 */
export interface MessageInput {
  id: string
  role: MessageRole
  text: string
  sentAt: Date
  /** Phase 7. Null until then. */
  replyToId: string | null
  /** Phase 8. Null until then. */
  runId: string | null
  /** Phase 6 — `glm-4.6v`'s private descriptions. `[]`, never null. */
  imageDescriptions: readonly string[]
}

export interface ConversationTurn {
  id: string
  role: MessageRole
  text: string
  sentOnISO: DateISO
  /** `'Tue 2 Sep 07:14'` — `formatDayShort` plus the Jakarta clock. */
  sentAtLabel: string
  daysAgo: number
  replyToId: string | null
  runId: string | null
  imageDescriptions: string[]
}

export interface ConversationFacts {
  /**
   * **OLDEST FIRST** — reading order, so she reads the conversation forwards the way he did.
   * `[]` (never null) when they have never spoken; `CONTEXT_GUIDE` says what empty means so it
   * cannot be read as a runner who never replies.
   */
  window: ConversationTurn[]
  /** How many messages exist before the window. 0 when the window is the whole history. */
  olderMessageCount: number
  /** Whole days since HE last said anything. null when he never has. Drives RU-15's silence. */
  daysSinceRunnerSpoke: number | null
  /** Whole days since SHE last said anything. null when she never has. */
  daysSinceNinaSpoke: number | null
}

/* ============================================================================
 * Runs
 * ==========================================================================*/

export interface NinaRunInput {
  runId: string
  occurredOn: DateISO
  /** `runs.started_at`, Postgres `time`: `'HH:MM:SS'`, or null. */
  startedAt: string | null
  location: string | null
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  activeKcal: number | null
  elevationM: number | null
  intent: RunIntent | null
  /** HIS OWN WORDS. See the header's second divergence. */
  note: string | null
  /** F06's output. Every number below is copied from it; none is recomputed here. */
  metrics: SessionMetrics
  /** F06's codes that fired. She is handed them and never coins one. */
  flags: readonly Flag[]
}

export interface NinaFlagFact {
  /** F06 owns the catalog. She is handed codes that fired; she never coins one. */
  code: string
  severity: 'info' | 'warn'
  /**
   * `lib/flags/copy.ts` — **the same two strings the run detail page shows him**, so the number
   * inside `detail` is already spelled through `lib/format.ts` and already agrees with his
   * screen. Reused rather than re-spelled: a second sentence per flag would be a second source of
   * truth for its threshold, which is R-42's exact failure.
   */
  title: string
  detail: string
}

export interface NinaRunFact {
  /** Tools take this. */
  runId: string
  /** `'2026-08-20'` — what she puts into `lookup_runs` / `compare_runs` (RU-13). */
  dateISO: DateISO
  /** `'Thu, 20 Aug 2026'`. */
  date: string
  weekday: (typeof WEEKDAY_EN)[number]
  weekdayId: (typeof WEEKDAY_ID)[number]
  /** Whole days from this run to today. Always >= 0. Precomputed — rule 1. */
  daysAgo: number
  /** `'07:07'`, or null when the screenshot had no time. Never `'—'`. */
  startedAt: string | null
  location: string | null
  distance: string
  duration: string
  avgPace: string
  avgHr: string | null
  maxHr: string | null
  avgCadence: string | null
  activeKcal: string | null
  elevationGain: string | null
  /** Ground truth once answered. null means never asked or never answered. */
  intent: RunIntent | null
  avgHrPctOfMax: string | null
  aerobicDecoupling: string | null
  timeInZone4And5: string | null
  flags: NinaFlagFact[]
  note: string | null
}

/* ============================================================================
 * Records — all 11
 * ==========================================================================*/

export interface StoredRecordInput {
  key: string
  value: number
  previousValue: number | null
  achievedOn: DateISO
  runId: string
}

/**
 * One record key. **All eleven are always present, in catalog order**, because absence and zero
 * are different facts and she must be able to say "lo belum pernah" about a key nothing qualified
 * for. A `null` `value` means no run has ever qualified — it is emphatically not 0 and never
 * `'—'`, which is a character for a screen and not a value she may quote.
 */
export interface RecordFact {
  key: RecordKey
  /** `RECORD_LABELS[key]` — carries the qualifier, so "fastest 10 km+ run", never "10k PB". */
  label: string
  /** `formatRecordValue` — `'10.67 km'`, `'07:07'`, `'12.3%'`. */
  value: string | null
  /** What it was worth before the current holder took it, same spelling. */
  previousValue: string | null
  achievedOn: DateISO | null
  achievedOnLabel: string | null
  daysAgo: number | null
  runId: string | null
}

/* ============================================================================
 * Badges — all 22
 * ==========================================================================*/

export interface HeldBadgeFact {
  key: BadgeKey
  title: string
  /** `BADGE_META[key].condition` — R-42: never a hand-written threshold. */
  condition: string
  /** `StoredBadge.count`, the summed ledger column. */
  count: number
  firstEarnedOn: DateISO
  lastEarnedOn: DateISO
  lastEarnedLabel: string
  daysAgo: number
  /**
   * How many earnings have a date on record. **May be fewer than `count`** — a row predating F13
   * carries an aggregate with one day attached. Carried explicitly so she cannot list three dates
   * and call it five times; `lib/badges/types.ts` holds the full argument.
   */
  earnedDaysOnRecord: number
}

export interface LockedBadgeFact {
  key: BadgeKey
  title: string
  condition: string
}

export interface BadgeFacts {
  /** Held keys, in catalog order. */
  held: HeldBadgeFact[]
  /** The keys he has never earned, in catalog order, with their condition so she can dare him. */
  locked: LockedBadgeFact[]
}

/* ============================================================================
 * Patterns — phase 9's shape, defined here because this layer formats them
 * ==========================================================================*/

/**
 * Which `lib/format.ts` call spells a pattern's value. Phase 9 emits the unit; this layer applies
 * it, so `lib/nina/patterns.ts` contains no formatting at all and invariant 3 has exactly one
 * home per payload.
 *
 * `count` and `days` are bare integers on purpose: `lib/format.ts` has no formatter for a count
 * and should not gain one — "5 runs" is a sentence the model writes, not a quantity with a unit
 * convention.
 */
export type PatternUnit =
  'clock' | 'bpm' | 'pace' | 'paceDelta' | 'percent' | 'metres' | 'count' | 'days'

export const PATTERN_VALUE_FORMAT: Record<PatternUnit, (value: number) => string> = {
  clock: (v) => formatClockSec(v),
  bpm: (v) => formatBpm(v),
  pace: (v) => formatPace(v, true),
  paceDelta: (v) => formatPaceDelta(v),
  percent: (v) => formatPercent(v, 1),
  metres: (v) => formatDistanceM(v),
  count: (v) => String(Math.round(v)),
  days: (v) => String(Math.round(v)),
}

/**
 * **Phase 9's output shape, and it is fixed here.** `lib/nina/patterns.ts` computes named
 * longitudinal codes in the exact shape of `lib/metrics/flags.ts` — thresholds exported as data,
 * every threshold strict, one test at the line that does not fire and one just past it that does.
 * What it must NOT do is round or format: `value` is raw, and `PATTERN_VALUE_FORMAT` above is the
 * only place it becomes characters.
 */
export interface FiredPattern {
  /** Phase 9 owns the vocabulary. She is handed codes that fired; **she never coins one.** */
  code: string
  severity: 'info' | 'warn'
  /** The metric that tripped it, raw and unrounded — same contract as `Flag.value`. */
  value: number
  /** Which formatter spells `value`. */
  unit: PatternUnit
  /** How many runs in the window tripped it. */
  occurrences: number
  /** How many runs the window held, so "3 of your last 5" is a fact and not arithmetic. */
  windowRuns: number
}

/** Phase 9's escalation ledger row (`nina_nags`), as this layer reads it. */
export interface NagState {
  code: string
  /** 0 = never raised, 1 = raised once, 2 = twice, 3+ = shouting. Drives the anger ladder. */
  level: number
  lastMentionedOn: DateISO | null
}

export interface PatternFact {
  code: string
  severity: 'info' | 'warn'
  /** Spelled through `PATTERN_VALUE_FORMAT`. */
  value: string
  occurrences: number
  windowRuns: number
  /** From `nina_nags`, defaulting to 0 when she has never raised this code. */
  nagLevel: number
  /** Whole days since she last raised it. null when never. */
  daysSinceLastMentioned: number | null
}

/* ============================================================================
 * The context
 * ==========================================================================*/

export interface NinaContext {
  now: NowFacts
  runner: RunnerFacts
  memory: MemoryFacts
  conversation: ConversationFacts
  /** **Newest first**, so index 0 is his most recent run and `daysAgo` ascends down the array. */
  recentRuns: NinaRunFact[]
  /** All eleven keys, catalog order. */
  records: RecordFact[]
  badges: BadgeFacts
  /** Phase 9's codes that fired, with their nag level. `[]` when nothing fired. */
  patterns: PatternFact[]
  /** Bumped by hand whenever the system text or any tool schema changes. Logged, never sent. */
  promptVersion: number
}

export interface BuildNinaContextInput {
  /** Injected so a test can pin the Jakarta clock rather than mock global time. */
  now: Date
  fullName: string | null
  nickname: string | null
  profile: NinaProfile | null
  hrMax: HrMax | null
  /** Newest first. */
  recentRuns: readonly NinaRunInput[]
  records: readonly StoredRecordInput[]
  /** `foldAwards`' output — one entry per held key. */
  badges: readonly StoredBadge[]
  slots: readonly MemorySlotInput[]
  /** Newest first. */
  facts: readonly MemoryFactInput[]
  /** Oldest first. */
  messages: readonly MessageInput[]
  olderMessageCount: number
  firedPatterns: readonly FiredPattern[]
  nags: readonly NagState[]
  promptVersion: number
}

/**
 * `MISSING` is for a screen. A prompt must not carry an em dash the model can quote back as a
 * value, so an absent quantity is `null` here and `CONTEXT_GUIDE` says what null means.
 */
function orNull<T>(value: T | null | undefined, format: (v: T) => string): string | null {
  return value == null ? null : format(value)
}

/**
 * `'14:03'` in Asia/Jakarta.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter renders midnight as `'24:00'` under
 * some ICU versions, and `'24:00'` in front of a model is a wrong hour rather than a formatting
 * quirk. `lib/date/ranges.ts` spends the timezone decision once for the DAY; this is the same
 * decision for the CLOCK, and it lives here because nothing else in the app needs a wall clock.
 */
function jakartaClockOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JAKARTA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}

/** Monday = 0, matching `lib/date/ranges.ts`. Timezone-free: the input is a calendar day. */
function weekdayIndex(dateISO: DateISO): number {
  return (new Date(`${dateISO}T00:00:00Z`).getUTCDay() + 6) % 7
}

function partOfDayFor(clock: string): PartOfDay {
  const [hours, minutes] = clock.split(':')
  const total = Number(hours) * 60 + Number(minutes)
  const b = PART_OF_DAY_BOUNDS
  if (total >= b.malamFromMin || total < b.pagiFromMin) return 'malam'
  if (total >= b.soreFromMin) return 'sore'
  if (total >= b.siangFromMin) return 'siang'
  return 'pagi'
}

function nowFacts(now: Date, today: DateISO): NowFacts {
  const clock = jakartaClockOf(now)
  const index = weekdayIndex(today)
  return {
    timeZone: JAKARTA_TIME_ZONE,
    todayISO: today,
    dayLabel: formatDay(today),
    weekday: WEEKDAY_EN[index]!,
    weekdayId: WEEKDAY_ID[index]!,
    clock,
    partOfDay: partOfDayFor(clock),
    isoWeek: isoWeekKeyOf(today),
  }
}

function runnerFacts(input: BuildNinaContextInput): RunnerFacts {
  const profile = input.profile
  return {
    fullName: input.fullName,
    nickname: input.nickname,
    age: profile?.birthYear == null ? null : ageFromBirthYear(profile.birthYear, input.now),
    heightCm: profile?.heightCm ?? null,
    weightKg: profile?.weightKg ?? null,
    sex: profile?.sex ?? null,
    restingHr: profile?.restingHr ?? null,
    hrMax: input.hrMax == null ? null : { bpm: input.hrMax.bpm, source: input.hrMax.source },
  }
}

function memoryFacts(input: BuildNinaContextInput, today: DateISO): MemoryFacts {
  return {
    slots: input.slots.map((slot) => {
      const updatedOn = jakartaDayOf(slot.updatedAt)
      return {
        key: slot.key,
        value: slot.value,
        updatedOn,
        daysAgo: daysBetween(updatedOn, today),
      }
    }),
    facts: input.facts.map((fact) => {
      const learnedOn = jakartaDayOf(fact.createdAt)
      return {
        id: fact.id,
        text: fact.text,
        sourceMessageId: fact.sourceMessageId,
        learnedOn,
        daysAgo: daysBetween(learnedOn, today),
      }
    }),
  }
}

function conversationFacts(input: BuildNinaContextInput, today: DateISO): ConversationFacts {
  const window: ConversationTurn[] = input.messages.map((message) => {
    const sentOnISO = jakartaDayOf(message.sentAt)
    return {
      id: message.id,
      role: message.role,
      text: message.text,
      sentOnISO,
      sentAtLabel: `${formatDayShort(sentOnISO)} ${jakartaClockOf(message.sentAt)}`,
      daysAgo: daysBetween(sentOnISO, today),
      replyToId: message.replyToId,
      runId: message.runId,
      imageDescriptions: [...message.imageDescriptions],
    }
  })

  /* Walked from the newest end so the answer is the LAST time that party spoke, not the first. */
  const daysSince = (role: MessageRole): number | null => {
    for (let i = window.length - 1; i >= 0; i -= 1) {
      const turn = window[i]!
      if (turn.role === role) return turn.daysAgo
    }
    return null
  }

  return {
    window,
    olderMessageCount: input.olderMessageCount,
    daysSinceRunnerSpoke: daysSince('runner'),
    daysSinceNinaSpoke: daysSince('nina'),
  }
}

/**
 * **EXPORTED, and the export is the point.** Phase 3's `lookup_runs` and `compare_runs` answer
 * about runs *outside* the recent-20 window, and phase 8 attaches an arbitrary run to a message.
 * If this stayed module-local, each of those would re-spell distance, pace, HR and the date for
 * the same run shape — a second formatting authority, which is exactly what invariant 3 forbids
 * and exactly how a reply ends up quoting `7:22` at someone looking at `7'22"/km`. One function,
 * one spelling, three callers. The signature is unchanged from the local version it replaces.
 */
export function buildNinaRunFact(run: NinaRunInput, today: DateISO): NinaRunFact {
  const index = weekdayIndex(run.occurredOn)
  const m = run.metrics
  return {
    runId: run.runId,
    dateISO: run.occurredOn,
    date: formatDay(run.occurredOn),
    weekday: WEEKDAY_EN[index]!,
    weekdayId: WEEKDAY_ID[index]!,
    daysAgo: daysBetween(run.occurredOn, today),
    startedAt: orNull(run.startedAt, (v) => formatClock(v)),
    location: run.location,
    distance: formatDistanceM(run.distanceM),
    duration: formatDuration(run.durationSec),
    avgPace: formatPace(run.avgPaceSec, true),
    avgHr: orNull(run.avgHr, (v) => formatBpm(v)),
    maxHr: orNull(run.maxHr, (v) => formatBpm(v)),
    avgCadence: orNull(run.avgCadence, (v) => formatCadence(v)),
    activeKcal: orNull(run.activeKcal, (v) => formatKcal(v)),
    elevationGain: orNull(run.elevationM, (v) => formatElevation(v)),
    intent: run.intent,
    avgHrPctOfMax: orNull(m.avgHrPctMax, (v) => formatPercent(v, 1)),
    aerobicDecoupling: orNull(m.decouplingPct, (v) => formatPercent(v, 1)),
    timeInZone4And5: orNull(m.hardPct, (v) => formatPercent(v, 1)),
    flags: run.flags.map((flag) => ({
      code: flag.code,
      severity: flag.severity,
      ...flagCopy(flag),
    })),
    note: run.note,
  }
}

function recordFacts(input: BuildNinaContextInput, today: DateISO): RecordFact[] {
  const held = new Map<RecordKey, StoredRecordInput>()
  for (const row of input.records) {
    /* A key the catalog no longer defines is dropped rather than carried — the same rule
     * `dbRecordsGateway.readCurrent` applies, for the same reason: it cannot be formatted. */
    if (isRecordKey(row.key)) held.set(row.key, row)
  }

  return RECORD_KEYS.map((key) => {
    const row = held.get(key)
    if (row == null) {
      return {
        key,
        label: RECORD_LABELS[key],
        value: null,
        previousValue: null,
        achievedOn: null,
        achievedOnLabel: null,
        daysAgo: null,
        runId: null,
      }
    }
    return {
      key,
      label: RECORD_LABELS[key],
      value: formatRecordValue(key, row.value),
      previousValue: row.previousValue == null ? null : formatRecordValue(key, row.previousValue),
      achievedOn: row.achievedOn,
      achievedOnLabel: formatDay(row.achievedOn),
      daysAgo: daysBetween(row.achievedOn, today),
      runId: row.runId,
    }
  })
}

function badgeFacts(input: BuildNinaContextInput, today: DateISO): BadgeFacts {
  const stored = new Map<string, StoredBadge>(input.badges.map((b) => [b.key, b]))
  const held: HeldBadgeFact[] = []
  const locked: LockedBadgeFact[] = []

  /* Iterating `BADGE_KEYS` rather than the stored rows does three things at once: it puts both
   * lists in catalog order (§10.2's shelf order), it drops a retired key the catalog no longer
   * defines, and it makes `locked` exhaustive without a second pass. `buildShelf` iterates the
   * catalog for the same reasons. */
  for (const key of BADGE_KEYS) {
    const title = badgeTitle(key) ?? key
    const condition = BADGE_META[key].condition
    const row = stored.get(key)
    if (row == null) {
      locked.push({ key, title, condition })
      continue
    }
    held.push({
      key,
      title,
      condition,
      count: row.count,
      firstEarnedOn: row.firstEarnedOn,
      lastEarnedOn: row.earnedOn,
      lastEarnedLabel: formatDay(row.earnedOn),
      daysAgo: daysBetween(row.earnedOn, today),
      earnedDaysOnRecord: row.earnedDays.length,
    })
  }

  return { held, locked }
}

function patternFacts(input: BuildNinaContextInput, today: DateISO): PatternFact[] {
  const byCode = new Map<string, NagState>(input.nags.map((n) => [n.code, n]))

  return input.firedPatterns.map((pattern) => {
    const nag = byCode.get(pattern.code) ?? null
    return {
      code: pattern.code,
      severity: pattern.severity,
      value: PATTERN_VALUE_FORMAT[pattern.unit](pattern.value),
      occurrences: pattern.occurrences,
      windowRuns: pattern.windowRuns,
      nagLevel: nag?.level ?? 0,
      daysSinceLastMentioned:
        nag?.lastMentionedOn == null ? null : daysBetween(nag.lastMentionedOn, today),
    }
  })
}

/**
 * **The whole-context builder.** Everything Nina can ever know comes out of here. The module's
 * only other export is `buildNinaRunFact`, which this function calls per run and which phase 3
 * and phase 8 call for runs outside the window — one formatter, not three.
 *
 * `input.now` is a parameter rather than `new Date()` inside, so a test pins the Jakarta clock
 * instead of mocking global time — the same choice `todayInJakarta` and `buildSessionFacts` make.
 */
export function buildNinaContext(input: BuildNinaContextInput): NinaContext {
  const today = jakartaDayOf(input.now)

  return {
    now: nowFacts(input.now, today),
    runner: runnerFacts(input),
    memory: memoryFacts(input, today),
    conversation: conversationFacts(input, today),
    recentRuns: input.recentRuns.map((run) => buildNinaRunFact(run, today)),
    records: recordFacts(input, today),
    badges: badgeFacts(input, today),
    patterns: patternFacts(input, today),
    promptVersion: input.promptVersion,
  }
}
