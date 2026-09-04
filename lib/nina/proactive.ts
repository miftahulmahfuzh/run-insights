import 'server-only'

import { badgeDefinition } from '@/lib/badges/catalog'
import { daysBetween, todayInJakarta, type DateISO } from '@/lib/date/ranges'
import { pushNotifier } from '@/lib/push/send'
import { isRecordKey } from '@/lib/records/catalog'
import { RECORD_LABELS } from '@/lib/records/labels'

import type { NinaContext } from './context'
import { dbNinaSourceGateway, dbNinaToolGateway } from './gateway'
import { loadNinaContext } from './load'
import { parseRunningDaysAsJsWeekday, type NinaSlotKey } from './memory'
import { decideNag, type NagDecision } from './nags'
import { PROACTIVE_INSTRUCTIONS, type ProactiveTriggerKind } from './prompts'
import {
  getNinaNags,
  getUnannouncedCurrentNinaAvatar,
  hasProactiveMessageForRun,
  insertNinaMessages,
  markNinaAvatarAnnounced,
  upsertNinaNag,
} from './queries'
import { resolveNinaWriteSession } from './sessionResolve'
import { runNinaTurn } from './turn'

export type { ProactiveTriggerKind }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * PROACTIVITY — R3's iron rule, made mechanical
 *
 * Five reasons Nina opens a conversation (RU-15's four plus RU-17's avatar). Phase 2 owns the
 * words (`PROACTIVE_INSTRUCTIONS`); this module owns WHEN, ONCE, and WHICH ONE.
 *
 * ── THE THING THAT MATTERS MOST HERE IS IDEMPOTENCE ─────────────────────────────────────────────
 * Firing "jadi ga lari selasa ini?" twice on one Tuesday is the exact failure that makes her feel
 * like a cron job instead of a friend, and it is the failure a naive in-memory guard cannot
 * prevent: a serverless invocation has no memory of the previous one. Every trigger therefore has
 * a DURABLE marker, and the marker is checked against the Jakarta calendar day rather than against
 * a clock interval:
 *
 *   run_committed     a `nina_messages` row with source='run_committed' and run_id = that run
 *   missed_usual_day  nina_nags['trigger:missed_usual_day'].last_mentioned_on = today
 *   pattern_crossed   phase 9's own nag row for that code (so escalation lives in ONE ledger)
 *   silence           nina_nags['trigger:silence'].last_mentioned_on, plus a 3-day cooldown
 *   avatar_changed    nina_avatars.announced_at IS NULL means "not said yet"
 *
 * No new table. `nina_nags` is phase 1's, phase 9 fills it with pattern codes, and this module
 * reserves the `trigger:` prefix for the two schedule-driven nags that are not patterns. The
 * namespace split is the reconciliation: a `trigger:*` code can never collide with a pattern code
 * because phase 9's codes name conditions (`REPEATED_LATE_START`, `ACWR_SPIKE`), not schedules.
 *
 * ── AT MOST ONE PROACTIVE MESSAGE PER USER PER EVALUATION ───────────────────────────────────────
 * `decideProactive` resolves the four cron candidates by `PROACTIVE_PRIORITY` and returns ONE. Two
 * openers in one evening is not twice as proactive, it is spam — and it is also twice the model
 * cost for a personal app on a Hobby plan. Ordering: the avatar first because it is the one the
 * runner just caused and is waiting on; then the pattern, because tough love that arrives late is
 * worthless; then the missed day, which is time-boxed to this evening; then silence, which by
 * definition is not urgent.
 *
 * ── THE PURE HALF IS EVERYTHING WORTH TESTING (INVARIANT 6) ─────────────────────────────────────
 * Down to `decideProactive` this file is pure functions over a plain `ProactiveFacts` object, and
 * `tests/nina.proactive.test.ts` drives all of it with no database and no model. The impure half
 * below loads the facts, runs the turn, persists the rows and writes the marker — and decides
 * nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/** Sunday = 0, matching `Date#getUTCDay()`, so no mapping table is needed anywhere here. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const JAKARTA_UTC_OFFSET_HOURS = 7

export const PROACTIVE_PRIORITY: readonly ProactiveTriggerKind[] = [
  'avatar_changed',
  'pattern_crossed',
  'missed_usual_day',
  'silence',
  /* `run_committed` is never a cron candidate — it fires from `after()` at the moment of the
   * commit, so it is listed for completeness of the union and never reached by `decideProactive`. */
  'run_committed',
]

/**
 * Phase 5's key for the days he usually runs. Typed as `NinaSlotKey` rather than left a bare
 * string so a typo fails the build against phase 5's vocabulary instead of silently disabling
 * trigger 2 for good. `lib/nina/gateway.ts` spells the same key the same way, for the same reason.
 */
export const RUNNING_DAYS_SLOT_KEY: NinaSlotKey = 'running_days'

/**
 * The window in which "by evening, and there is still no run" is a fair thing to ask. The cron is
 * scheduled for 19:00 WIB but Vercel's Hobby plan triggers within the hour, so the floor is 18 and
 * not 19 — see the timezone note on `app/api/cron/nina/route.ts`. The ceiling stops a manual 02:00
 * invocation asking about a day that has barely begun.
 */
export const MISSED_DAY_EVENING_HOUR = 18
export const MISSED_DAY_LATEST_HOUR = 23

/** Silence, in the two units it comes in. Either alone is enough; neither is a hair trigger. */
export const SILENCE_NO_RUN_DAYS = 5
export const SILENCE_NO_CHAT_DAYS = 4
export const SILENCE_COOLDOWN_DAYS = 3

export const TRIGGER_MARKER_PREFIX = 'trigger:'
export const MISSED_DAY_MARKER_CODE = `${TRIGGER_MARKER_PREFIX}missed_usual_day`
export const SILENCE_MARKER_CODE = `${TRIGGER_MARKER_PREFIX}silence`

/**
 * A `nina_nags` row, read structurally so that phase 2's `NagState` and phase 1's `NinaNagRow`
 * both assign to it without an import in either direction.
 */
export interface TriggerMarker {
  code: string
  level: number
  lastMentionedOn: DateISO | null
}

/**
 * A pattern phase 9 says has fired, read structurally: only these three fields are used here, so
 * phase 2's `PatternFact` assigns without a cast.
 *
 * **`value` is a STRING and that is not a typo.** Phase 2 spells the number through
 * `PATTERN_VALUE_FORMAT` on the way into `PatternFact`, which is invariant 3 — one authority on
 * how a quantity is written. The plan for this phase assumed a raw number plus a `unit`; taking
 * the already-spelled value instead means this module never formats anything and the value she
 * quotes is character-for-character the value the context gave her.
 */
export interface ProactivePattern {
  code: string
  value: string
  nagLevel: number
}

export interface ProactiveFacts {
  /** Jakarta calendar day, from `todayInJakarta()`. Never the server's local day. */
  todayISO: DateISO
  /** 0–23, Jakarta wall clock. */
  jakartaHour: number
  /** Parsed from phase 5's `running_days` slot. Empty disables trigger 2 rather than guessing. */
  runningDays: readonly Weekday[]
  hasRunToday: boolean
  lastRunOn: DateISO | null
  /** `null` when he has never sent a message — a fresh account is not a silent one. */
  daysSinceRunnerSpoke: number | null
  patterns: readonly ProactivePattern[]
  nags: readonly TriggerMarker[]
  unannouncedAvatarId: string | null
}

export interface RunCommittedDetail {
  kind: 'run_committed'
  runId: string
  occurredOn: DateISO
  /** From `onRunCommitted`'s own answer. NOTHING is recomputed to produce these. */
  recordKeys: readonly string[]
  badgeKeys: readonly string[]
}

export interface MissedUsualDayDetail {
  kind: 'missed_usual_day'
  todayISO: DateISO
  weekday: Weekday
}

export interface PatternCrossedDetail {
  kind: 'pattern_crossed'
  code: string
  value: string
  /**
   * **How many times she has ALREADY raised this, decayed — `decideNag`'s `level`, not its
   * `next.level`.** Phase 2's `PatternFact.nagLevel` is spelled the same way ("0 when she has never
   * raised this code") and `PROACTIVE_INSTRUCTIONS.pattern_crossed` reads it that way: *"if
   * `nagLevel` is 1 or more then say plainly that you have told him this before — because you
   * have."* Sending the post-mention rung here would make her say that the very first time, which
   * is the one thing R11's ladder exists to get right.
   */
  nagLevel: number
  /** The row to persist if, and only if, the message actually lands. `decideNag`'s `next`. */
  marker: TriggerMarker
}

export interface SilenceDetail {
  kind: 'silence'
  daysSinceLastRun: number | null
  daysSinceRunnerSpoke: number | null
}

export interface AvatarChangedDetail {
  kind: 'avatar_changed'
  avatarId: string
}

export type ProactiveDetail =
  | RunCommittedDetail
  | MissedUsualDayDetail
  | PatternCrossedDetail
  | SilenceDetail
  | AvatarChangedDetail

export type ProactiveDecision =
  { fire: false; reason: string } | { fire: true; detail: ProactiveDetail }

const NO = (reason: string): ProactiveDecision => ({ fire: false, reason })

/* ── time, in the one timezone this app has ──────────────────────────────────────────────────── */

/**
 * The Jakarta hour of an instant. Plain arithmetic rather than `Intl` because UTC+7 is fixed for
 * all time: Asia/Jakarta has no DST and no transition inside any date this app can see. The date
 * side still goes through `todayInJakarta` (`lib/date/ranges.ts`), which is where the timezone
 * decision is spent exactly once; this is the HOUR, which that function does not expose and which
 * phase 2 exposes only as the rendered string `NowFacts.clock`. Parsing a rendered clock back into
 * a number to compare it against 18 would be the worse of the two.
 */
export function jakartaHourOf(instant: Date): number {
  return (instant.getUTCHours() + JAKARTA_UTC_OFFSET_HOURS) % 24
}

/**
 * The weekday of a Jakarta calendar day, Sunday = 0. The argument is ALREADY a Jakarta date
 * string, so it is parsed at UTC midnight and read with `getUTCDay()` — no offset is applied twice.
 *
 * **The bug this exists to prevent** is `new Date(dateISO).getDay()`, which applies the server's
 * local zone (UTC on Vercel) to a date-only string and returns the previous day for anyone west of
 * Greenwich. `isoWeekKeyOf` and phase 9's `isoWeekdayOf` avoid it the same way.
 */
export function jakartaWeekdayOf(dateISO: DateISO): Weekday {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay() as Weekday
}

/* ── phase 5's slot, parsed ──────────────────────────────────────────────────────────────────── */

/**
 * Phase 5's `running_days` slot value in this module's Sunday-first view.
 *
 * **RULING E4: this is a re-export, not a parser.** The draft of this phase carried its own
 * `DAY_TOKENS` table and its own tokeniser; phase 5 owns the vocabulary, the range expander
 * ("Senin sampe Jumat" is five days, not two) and the negation rule ("tiap hari kecuali senin"
 * disables the trigger rather than firing every Monday), and supplies both typed views — ISO 1–7
 * for phase 9's pattern rules, 0–6 here. One token table, one set of edge cases, two views.
 *
 * An unparseable or absent slot yields `[]`, which disables trigger 2. That is the whole policy: a
 * nag built on a guess about which days he runs is worse than no nag, because it is a friend
 * confidently misremembering.
 */
export function parseRunningDays(value: string | null | undefined): Weekday[] {
  return [...parseRunningDaysAsJsWeekday(value)] as Weekday[]
}

/* ── the five evaluators ─────────────────────────────────────────────────────────────────────── */

/** RU-17. The marker is the NULL itself, so there is nothing to compare against a date. */
export function evaluateAvatarChanged(facts: ProactiveFacts): ProactiveDecision {
  if (!facts.unannouncedAvatarId) return NO('no unannounced avatar')
  return { fire: true, detail: { kind: 'avatar_changed', avatarId: facts.unannouncedAvatarId } }
}

/**
 * R11's tough love, delivered.
 *
 * **The escalation ladder is phase 9's and is not re-derived here.** `decideNag` owns the decay,
 * the strict 3-day cooldown and the level cap; this function calls it once per fired pattern and
 * keeps only those it says she may raise. The plan for this phase proposed a plainer "not
 * mentioned today" check, which is subsumed by the cooldown and would have put a second, weaker
 * definition of the ladder in a second file.
 *
 * When several are eligible the one with the HIGHEST current level wins — the one she has already
 * raised twice is the one that needs raising a third time, not the novel one. Ties break on `code`
 * so the choice is deterministic and a test can assert it.
 *
 * `marker` travels on the detail because `decideNag` already computed the row to persist, and
 * recomputing it after the model call would mean reading the ledger twice for one decision.
 */
export function evaluatePatternCrossed(facts: ProactiveFacts): ProactiveDecision {
  const byCode = new Map(facts.nags.map((nag) => [nag.code, nag]))

  const candidates = facts.patterns
    .map((pattern) => ({
      pattern,
      decision: decideNag(pattern.code, byCode.get(pattern.code) ?? null, facts.todayISO),
    }))
    .filter((candidate) => candidate.decision.shouldRaise)
    .sort(
      (a, b) => b.decision.level - a.decision.level || a.pattern.code.localeCompare(b.pattern.code),
    )

  const winner = candidates[0]
  if (!winner) return NO('no pattern crossed, or every crossed pattern is inside its cooldown')

  return {
    fire: true,
    detail: {
      kind: 'pattern_crossed',
      code: winner.pattern.code,
      value: winner.pattern.value,
      /* Times already raised, after decay. `decideNag` computes it; `next.level` is the rung the
       * LEDGER moves to once she has spoken, and that one goes on the marker, not in the prompt. */
      nagLevel: winner.decision.level,
      marker: winner.decision.next,
    },
  }
}

/**
 * "Today is one of his usual days and there is still no run on it." Four guards, and every one of
 * them has a failure it prevents:
 *
 *   no usual days      -> she would be inventing a schedule he never told her about
 *   not a usual day    -> she would be nagging about a rest day
 *   a run already      -> she would be asking a question the database has already answered
 *   too early / late   -> "the day is not over" is phase 2's own instruction; honour it
 *
 * The fifth guard is the marker, and it is the one this phase exists to get right.
 */
export function evaluateMissedUsualDay(facts: ProactiveFacts): ProactiveDecision {
  if (facts.runningDays.length === 0) return NO('no running_days slot')

  const weekday = jakartaWeekdayOf(facts.todayISO)
  if (!facts.runningDays.includes(weekday)) return NO('today is not a usual running day')
  if (facts.hasRunToday) return NO('he already ran today')
  if (facts.jakartaHour < MISSED_DAY_EVENING_HOUR) return NO('too early in the day to ask')
  if (facts.jakartaHour > MISSED_DAY_LATEST_HOUR) return NO('past the window')

  const marker = facts.nags.find((nag) => nag.code === MISSED_DAY_MARKER_CODE)
  if (marker?.lastMentionedOn === facts.todayISO) return NO('already asked today')

  return { fire: true, detail: { kind: 'missed_usual_day', todayISO: facts.todayISO, weekday } }
}

/**
 * Prolonged silence, in the two units it actually comes in: no run for `SILENCE_NO_RUN_DAYS`, or
 * nothing said to her for `SILENCE_NO_CHAT_DAYS`. Either alone fires.
 *
 * **"The app unopened for N days" is deliberately read as "he has not spoken to Nina for N days".**
 * There is no last-seen column on `users` or `profiles` and this phase does not add one — a column
 * whose only consumer is one nag threshold is not worth a migration in a phase that already needs
 * five triggers. `daysSinceRunnerSpoke` comes from phase 2's `ConversationFacts` and is the honest
 * proxy: a runner who opens the app daily and never types is a runner she has nothing to react to
 * anyway. If a real last-seen is ever wanted it is a `profiles.last_seen_on` touched by
 * `AppShell`, and it is a separate card (see the plan's Handoffs).
 *
 * `null` on either count means "never" and does NOT fire: a brand-new account is not a silent one.
 * The cooldown is against the marker so this cannot become a daily "you have been quiet" drip.
 */
export function evaluateSilence(facts: ProactiveFacts): ProactiveDecision {
  const daysSinceLastRun =
    facts.lastRunOn === null ? null : daysBetween(facts.lastRunOn, facts.todayISO)

  const quietOnRuns = daysSinceLastRun !== null && daysSinceLastRun >= SILENCE_NO_RUN_DAYS
  const quietInChat =
    facts.daysSinceRunnerSpoke !== null && facts.daysSinceRunnerSpoke >= SILENCE_NO_CHAT_DAYS
  if (!quietOnRuns && !quietInChat) return NO('not quiet enough on either count')

  const marker = facts.nags.find((nag) => nag.code === SILENCE_MARKER_CODE)
  if (
    marker?.lastMentionedOn != null &&
    daysBetween(marker.lastMentionedOn, facts.todayISO) < SILENCE_COOLDOWN_DAYS
  ) {
    return NO('inside the silence cooldown')
  }

  return {
    fire: true,
    detail: {
      kind: 'silence',
      daysSinceLastRun,
      daysSinceRunnerSpoke: facts.daysSinceRunnerSpoke,
    },
  }
}

/**
 * The resolver. Runs the four cron-eligible evaluators in `PROACTIVE_PRIORITY` order and returns
 * the first that fires, or every refusal joined so a cron log line says something useful. Pure, so
 * `tests/nina.proactive.test.ts` asserts the whole priority table without a database.
 */
export function decideProactive(facts: ProactiveFacts): ProactiveDecision {
  const evaluators: Partial<
    Record<ProactiveTriggerKind, (f: ProactiveFacts) => ProactiveDecision>
  > = {
    avatar_changed: evaluateAvatarChanged,
    pattern_crossed: evaluatePatternCrossed,
    missed_usual_day: evaluateMissedUsualDay,
    silence: evaluateSilence,
  }

  const reasons: string[] = []
  for (const kind of PROACTIVE_PRIORITY) {
    const evaluate = evaluators[kind]
    if (!evaluate) continue
    const decision = evaluate(facts)
    if (decision.fire) return decision
    reasons.push(`${kind}: ${decision.reason}`)
  }
  return NO(reasons.join('; '))
}

/**
 * The durable nag row a fired decision earns, or `null` when the marker is not a nag row at all
 * (`avatar_changed` sets `announced_at`; `run_committed` is marked by the message row itself).
 *
 * `level` on a `trigger:*` row is a mention COUNT, not phase 9's escalation rung: nothing reads it
 * yet, and it is incremented rather than pinned so that "how many Tuesdays has she asked about"
 * is answerable later without a schema change. A `pattern_crossed` row is phase 9's rung, computed
 * by `decideNag` and carried on the detail — this function only passes it through, so there is
 * still exactly one place that knows how the ladder climbs.
 */
export function markerFor(detail: ProactiveDetail, facts: ProactiveFacts): TriggerMarker | null {
  const bump = (code: string): TriggerMarker => ({
    code,
    level: (facts.nags.find((nag) => nag.code === code)?.level ?? 0) + 1,
    lastMentionedOn: facts.todayISO,
  })

  switch (detail.kind) {
    case 'missed_usual_day':
      return bump(MISSED_DAY_MARKER_CODE)
    case 'silence':
      return bump(SILENCE_MARKER_CODE)
    case 'pattern_crossed':
      return detail.marker
    case 'avatar_changed':
    case 'run_committed':
      return null
  }
}

/**
 * The structured half of the proactive prompt: the facts the trigger knows that
 * `PROACTIVE_INSTRUCTIONS` can only refer to. Emitted as one JSON line under a heading, exactly
 * the way phase 2's context blocks read, so the model has one parsing convention and not two.
 *
 * **Invariant 2 lives here.** Record and badge KEYS come from the commit path; their LABELS are
 * resolved through the same catalogs the records shelf and the badge shelf render from, so the
 * label she reads is the label he sees. An unknown key falls back to itself rather than to
 * `undefined` — a key in a bubble is ugly, `undefined` is a bug she would read aloud.
 *
 * This function never formats a number. `value` is already spelled by phase 2's
 * `PATTERN_VALUE_FORMAT` and is passed through as characters.
 */
export function triggerBlock(detail: ProactiveDetail): string {
  const body = (() => {
    switch (detail.kind) {
      case 'run_committed':
        return {
          kind: detail.kind,
          runId: detail.runId,
          occurredOn: detail.occurredOn,
          recordsTaken: detail.recordKeys.map((key) =>
            isRecordKey(key) ? RECORD_LABELS[key] : key,
          ),
          badgesEarned: detail.badgeKeys.map((key) => badgeDefinition(key)?.title ?? key),
        }
      case 'missed_usual_day':
        return { kind: detail.kind, date: detail.todayISO, weekday: detail.weekday }
      case 'pattern_crossed':
        return {
          kind: detail.kind,
          code: detail.code,
          value: detail.value,
          nagLevel: detail.nagLevel,
        }
      case 'silence':
        return {
          kind: detail.kind,
          daysSinceLastRun: detail.daysSinceLastRun,
          daysSinceRunnerSpoke: detail.daysSinceRunnerSpoke,
        }
      case 'avatar_changed':
        return { kind: detail.kind }
    }
  })()

  return `TRIGGER\n${JSON.stringify(body)}`
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * The impure half — loading, running the turn, persisting, marking
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/** Implemented by `lib/push/send.ts`. Called AFTER the rows are committed, never instead of writing. */
export type ProactiveNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: ProactiveTriggerKind,
) => Promise<void>

/** The hermetic default a test passes explicitly. Phase 11 moved the *fallback* to `pushNotifier`. */
export const NOOP_NOTIFIER: ProactiveNotifier = async () => {}

export interface ProactiveDeps {
  now?: () => Date
  notify?: ProactiveNotifier
  /** Overridable so `tests/nina.cron.test.ts` can drive the route without a model or a database. */
  runTurn?: typeof runNinaTurn
}

export interface EmitResult {
  emitted: boolean
  kind: ProactiveTriggerKind | null
  messageIds: string[]
  /** Always populated, including on success — a cron log that says only "false" is useless. */
  reason: string
}

const NOT_EMITTED = (reason: string): EmitResult => ({
  emitted: false,
  kind: null,
  messageIds: [],
  reason,
})

/**
 * Everything the four cron triggers need, from one already-built context plus two cheap indexed
 * reads and no model call.
 *
 * **Almost nothing is queried, and that is the design.** `loadNinaContext` has already read the
 * conversation, the memory slots, the reviewed history and phase 9's patterns and nags — every
 * chat turn needs them, so a proactive evaluation reads them off the context rather than issuing a
 * second copy of the same longitudinal scan. Two facts are not on the context and are read here:
 * the raw nag rows (the context carries phase 2's DECAYED projection, and the marker comparison
 * needs the stored `last_mentioned_on`), and the unannounced avatar.
 *
 * `hasRunToday` and `lastRunOn` come off `context.recentRuns`, which is the newest 20 reviewed
 * runs, newest first. "Is there a run today" and "when was the last one" are both inside a
 * 20-run window by construction, so the two dedicated queries the plan proposed would have
 * re-asked a question the context had already answered.
 */
export async function loadProactiveFacts(
  userId: string,
  context: NinaContext,
  now: Date,
): Promise<ProactiveFacts> {
  const todayISO = todayInJakarta(now)

  const [nagRows, avatar] = await Promise.all([
    getNinaNags(userId),
    getUnannouncedCurrentNinaAvatar(userId),
  ])

  const runningDaysSlot = context.memory.slots.find(
    (slot) => slot.key === RUNNING_DAYS_SLOT_KEY,
  )?.value

  return {
    todayISO,
    jakartaHour: jakartaHourOf(now),
    runningDays: parseRunningDays(runningDaysSlot),
    hasRunToday: context.recentRuns.some((run) => run.dateISO === todayISO),
    lastRunOn: context.recentRuns[0]?.dateISO ?? null,
    daysSinceRunnerSpoke: context.conversation.daysSinceRunnerSpoke,
    patterns: context.patterns.map((pattern) => ({
      code: pattern.code,
      value: pattern.value,
      nagLevel: pattern.nagLevel,
    })),
    nags: nagRows.map((row) => ({
      code: row.code,
      level: row.level,
      lastMentionedOn: row.lastMentionedOn,
    })),
    unannouncedAvatarId: avatar?.id ?? null,
  }
}

/**
 * The one place a proactive message is written. Every trigger goes through here, so the ordering
 * guarantee below is made once rather than five times.
 *
 * ── ORDER OF OPERATIONS, AND WHY ────────────────────────────────────────────────────────────────
 *   1. build the prompt appendix          pure
 *   2. run the turn                       the model call — this is where 13-16 s goes
 *   3. persist the bubbles                one multi-row INSERT, carrying `source` and `run_id`
 *   4. write the durable marker           ONLY after the rows exist
 *   5. notify (phase 11)                  best effort, never fails the write
 *
 * **Step 4 is after steps 2 and 3, and that is the whole idempotence design.** Marking first would
 * make a model failure permanent: the trigger would be spent, the message would not exist, and she
 * would silently skip a Tuesday. Marking after means a failure is retried by the next invocation,
 * and the duplicate risk it opens — two invocations racing to emit the same trigger — is closed by
 * `upsertNinaNag`'s `ON CONFLICT` plus the fact that Vercel runs one cron invocation per day. For a
 * personal app that is the right side of the trade: a repeated nag is annoying, a swallowed one is
 * a friend who forgot.
 *
 * **This function persists, because `runNinaTurn` does not.** Phase 3 kept the turn loop free of
 * writes and put the INSERT in `lib/nina/actions.ts`'s `sendNinaMessage`; this is the proactive
 * counterpart of that STEP 5, down to the one multi-row batch that makes `seq` — and therefore
 * reveal order — a fact Postgres assigns rather than a convention this loop remembers.
 */
export async function emitProactiveMessage(
  userId: string,
  /**
   * **Which conversation she speaks into (assumption A3, F35 phase 3).**
   *
   * Resolved by the CALLER rather than here, because the caller also has to load the context — and
   * the context's window must be the window of this same session, or she measures silence in one
   * conversation while writing into another. One resolution, two uses, no way for them to disagree.
   *
   * A3's reasoning, restated: a proactive message is conversation, so it belongs in a conversation.
   * A session per evening nag would bury the list this feature exists to organise.
   */
  sessionId: string,
  detail: ProactiveDetail,
  facts: ProactiveFacts,
  context: NinaContext,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  /* PHASE 11 LANDED. Was `NOOP_NOTIFIER`; the seam is now wired to the real Web Push sender.
   * `NOOP_NOTIFIER` is still exported and is still what a test passes explicitly, which is why it
   * is not deleted. `pushNotifier` never throws: with no VAPID in the environment `sendNinaPush`
   * catches `pushEnv()` and returns `skipped` before touching the database, so a suite with
   * neither keys nor a network keeps passing against the real sender. */
  const notify = deps.notify ?? pushNotifier
  const runTurn = deps.runTurn ?? runNinaTurn

  const proactive = `${PROACTIVE_INSTRUCTIONS[detail.kind]}\n\n${triggerBlock(detail)}`

  /* The tools need the reviewed history, exactly as a chat turn does — she may look a run up
   * while reacting to another one. One query, the same one `sendNinaMessage` makes. */
  const history = await dbNinaToolGateway.loadRunHistory(userId)

  const result = await runTurn({
    userId,
    context,
    history,
    /* No runner message precedes a proactive turn. `runnerText: null` makes the user turn omit
     * the "HE JUST SAID" block rather than emit an empty one, and `sourceMessageId: null` means a
     * memory write distilled from this turn has nothing of his to point at — because there is
     * nothing of his. She is allowed to speak twice in a row; that is what a trigger IS. */
    sourceMessageId: null,
    runnerText: null,
    proactive,
  })

  if (result.payload == null) {
    return NOT_EMITTED(`turn produced nothing (source=${result.source})`)
  }

  let messageIds: string[] = []
  let bubbles: Array<{ id: string; body: string }> = []
  try {
    const rows = await insertNinaMessages(
      userId,
      result.payload.bubbles.map((body) => ({
        role: 'nina' as const,
        body,
        /* The `source` IS trigger 1's marker and is the reason `hasProactiveMessageForRun` can
         * ask its question at all. Every row of the turn carries it, and `run_id` with it. */
        source: detail.kind,
        runId: detail.kind === 'run_committed' ? detail.runId : null,
      })),
      /* F35 phase 3. The session the caller resolved and loaded her context from. */
      sessionId,
    )
    bubbles = rows.map((row) => ({ id: row.id, body: row.body }))
    messageIds = rows.map((row) => row.id)
  } catch (cause) {
    /* Nothing was written, so nothing is marked, so the next invocation tries again. That is the
     * correct outcome and it is why the marker write is below this and not above it. */
    console.warn('[nina proactive] could not persist her message', {
      userId,
      kind: detail.kind,
      error: String(cause),
    })
    return NOT_EMITTED('could not persist the message')
  }

  /* The marker, in its own try: a written message with a missing marker repeats at worst once,
   * while throwing here would report nothing emitted when something was. */
  try {
    if (detail.kind === 'avatar_changed') {
      await markNinaAvatarAnnounced(userId, detail.avatarId, now())
    } else {
      const marker = markerFor(detail, facts)
      if (marker) {
        await upsertNinaNag(userId, {
          code: marker.code,
          level: marker.level,
          lastMentionedOn: marker.lastMentionedOn,
        })
      }
    }
  } catch (cause) {
    console.warn('[nina proactive] marker write failed', {
      userId,
      kind: detail.kind,
      error: String(cause),
    })
  }

  try {
    await notify(userId, bubbles, detail.kind)
  } catch (cause) {
    console.warn('[nina proactive] notify failed', { userId, error: String(cause) })
  }

  return { emitted: true, kind: detail.kind, messageIds, reason: 'emitted' }
}

/**
 * **R8, trigger 1.** Called from `after()` in `lib/review/actions.ts`, so nothing here is on the
 * commit's critical path — the runner has already been redirected to `/r/[id]` by the time the
 * first token comes back.
 *
 * `recordKeys` and `badgeKeys` are handed in, never derived: `onRunCommitted` recomputed the
 * records and evaluated the badges during the commit and already knows exactly which ones moved to
 * this run. Re-deriving them here would mean a second `recomputeRecords` (a full scan) and a
 * badge query, and worse, it would compute them at a LATER instant than the commit, so a run
 * edited twice in a minute could report a record that had already moved on. The commit's answer is
 * the only correct one.
 */
export async function emitRunCommitted(
  input: {
    userId: string
    runId: string
    occurredOn: DateISO
    recordKeys: readonly string[]
    badgeKeys: readonly string[]
  },
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const at = now()

  /* Idempotence for trigger 1 is the message row itself: two tabs committing the same extraction,
   * or a retried `after()`, must not produce two reactions to one run. BEFORE the session
   * resolution below, because that resolution may CREATE a row and a duplicate trigger must cost
   * nothing. */
  if (await hasProactiveMessageForRun(input.userId, input.runId)) {
    return NOT_EMITTED('already reacted to this run')
  }

  /* F35 phase 3, assumption A3. His most recent conversation, created if R11 left him with none —
   * the cron has to survive a runner who deleted every chat, because a proactive message he never
   * receives is invisible forever. Resolved BEFORE the context load so the window she reads is the
   * window of the conversation she is about to write into. */
  const sessionId = await resolveNinaWriteSession(input.userId)

  const context = await loadNinaContext(input.userId, sessionId, dbNinaSourceGateway, at)
  const facts = await loadProactiveFacts(input.userId, context, at)

  return emitProactiveMessage(
    input.userId,
    sessionId,
    {
      kind: 'run_committed',
      runId: input.runId,
      occurredOn: input.occurredOn,
      recordKeys: input.recordKeys,
      badgeKeys: input.badgeKeys,
    },
    facts,
    context,
    deps,
  )
}

/**
 * One user's whole cron pass: load, decide, and emit at most one message. The route calls this and
 * does nothing else per user, so the deadline logic and the failure isolation stay in the route
 * where they can be read next to each other.
 */
export async function evaluateAndEmitForUser(
  userId: string,
  deps: ProactiveDeps = {},
): Promise<EmitResult> {
  const now = deps.now ?? (() => new Date())
  const at = now()

  /*
   * F35 phase 3, assumption A3. Same resolution as `emitRunCommitted`, and it happens BEFORE
   * `decideProactive` deliberately: `daysSinceRunnerSpoke` comes out of the context window, which
   * is now per-session, so the decision has to be made about the same conversation the message will
   * land in. Resolving after the decision would let her decide "he has been silent for eleven days"
   * from one chat and then say it in another.
   *
   * The one accepted consequence, stated: a runner who removes every session gets a freshly created
   * empty one, whose window is empty, so `daysSinceRunnerSpoke` is `null` and `evaluateSilence`
   * does not fire (it already treats `null` as "do not fire"). She has no conversation to have been
   * silent in, and the nag resumes the moment he speaks.
   */
  const sessionId = await resolveNinaWriteSession(userId)

  const context = await loadNinaContext(userId, sessionId, dbNinaSourceGateway, at)
  const facts = await loadProactiveFacts(userId, context, at)

  const decision = decideProactive(facts)
  if (!decision.fire) return NOT_EMITTED(decision.reason)

  return emitProactiveMessage(userId, sessionId, decision.detail, facts, context, deps)
}

/** Re-exported so a caller can log a decision's reasoning without importing phase 9 as well. */
export type { NagDecision }
