/**
 * **Tool DISPATCH.** The schemas are phase 2's (`lib/nina/prompts/tools.ts`); what a call MEANS is
 * here. No `server-only` and no database import: every read arrives through `NinaToolGateway`, so
 * `lib/nina/tools.test.ts` drives all three handlers against a hand-written fake and no connection
 * — the `RecordsGateway` idiom, and the same reason phase 2 gave for `NinaSourceGateway`.
 *
 * ── INVARIANT 2, AT THE ONE PLACE IT WOULD OTHERWISE BREAK ────────────────────────────────────
 * `compare_runs` returns DIFFERENCES, already worked out, spelled through `lib/format.ts`. It
 * never returns two run objects and an instruction to subtract. The measurement behind the rule is
 * in the analysis: a flipped sign on aerobic decoupling, which a model restated confidently. Two
 * numbers and a minus sign is the same bet with more steps.
 *
 * ── HOW PHASES 12 AND 13 ADD A TOOL WITHOUT TOUCHING THIS FILE ────────────────────────────────
 * `NINA_CORE_TOOL_SET` is a VALUE, and `runNinaTurn` takes a tool set in its deps. Phase 12 writes
 *
 *     const toolSet = extendToolSet(NINA_CORE_TOOL_SET, [
 *       { tool: GENERATE_IMAGE_TOOL, handler: handleGenerateImage },
 *     ])
 *
 * in `lib/nina/imagegen.ts` and passes it through. No edit here, no edit to `turn.ts`, and this
 * phase stays revertable on its own. It is also what makes ruling (b)'s empirical exit cheap: if
 * `save_memory` never fires, it leaves `NINA_CORE_TOOL_SET` in one line.
 */
import type { DateISO } from '@/lib/date/ranges'
import type { NinaFactCategory, NinaMemorySource, NinaSlotValue } from '@/lib/db/schema'
import {
  formatBpm,
  formatCadence,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
  formatPaceDelta,
  formatPercent,
} from '@/lib/format'
import type { SplitRow, ZonePctRow } from '@/lib/metrics'
import type Anthropic from '@anthropic-ai/sdk'

import type { NinaRunFact, NinaRunInput } from './context'
import {
  ambiguousFrom,
  resolveDate,
  resolveDates,
  type DateAmbiguous,
  type DateResolution,
  type RunsByDate,
} from './dates'
import { COMPARE_RUNS_TOOL, LOOKUP_RUNS_TOOL, SAVE_MEMORY_TOOL, SEND_TOOL } from './prompts'
import {
  CompareRunsArgsSchema,
  LookupRunsArgsSchema,
  SaveMemoryArgsSchema,
  describeNinaIssues,
} from './schema'

/* ============================================================================
 * The reads a tool needs
 * ==========================================================================*/

/**
 * `NinaRunInput` plus its split rows. Phase 2 leaves splits off `NinaRunFact` on purpose — 20 runs
 * of split table in front of every turn is ~200 rows of noise — and ruling (d) puts them here,
 * which is the point of a tool under RU-4: the expensive detail, fetched when she asks for it.
 */
export interface NinaDetailedRunInput extends NinaRunInput {
  splits: readonly SplitRow[]
}

/**
 * Built ONCE per turn, before the first model call, and reused by every tool round. Building it
 * lazily inside a handler would put a database round trip inside the model's latency budget, and
 * `getReviewedRunsWithChildren` is one `db.batch` for the whole history anyway — the same premise
 * `lib/insights/load.ts`, `recomputeRecords` and phase 2's `load.ts` all rest on (~200 runs a
 * year, one user). All four need the same rethink together if it ever stops holding.
 */
export interface NinaRunHistory {
  /** The whole reviewed history, oldest first, as `getReviewedRunsWithChildren` returns it. */
  runs: readonly NinaDetailedRunInput[]
  /** `occurred_on` -> that day's runs. `indexRunsByDate(runs)`. */
  index: RunsByDate
  /** `runId` -> its split rows, so a hit can be enriched without a second scan. */
  splitsByRunId: ReadonlyMap<string, readonly SplitRow[]>
  /** `runId` -> F06's zone shares, copied from `metrics.zonePct`. Never recomputed here. */
  zonesByRunId: ReadonlyMap<string, readonly ZonePctRow[]>
}

export interface NinaToolGateway {
  /** One `db.batch`, every reviewed run with children, metrics and flags already computed. */
  loadRunHistory(userId: string): Promise<NinaRunHistory>
  /**
   * Ruling (b): the ONE write path for a standing fact. `save_memory` and
   * `send.memoryWrites` both land here, so there is no second implementation of "upsert a slot".
   * Phase 5 owns the vocabulary; this method owns the row.
   *
   * **Widened by phase 5, additively.** `value` takes `NinaSlotValue` because `pending_promises`
   * (R19) is a structured slot and `string` is a member of that union, so this file's own callers
   * are unaffected. `source` exists for phase 5's admin-row rule — a merge that preserved an
   * admin-written value writes the row back as `'admin'` rather than relabelling it.
   */
  saveMemorySlot(
    userId: string,
    row: {
      key: string
      value: NinaSlotValue
      source?: NinaMemorySource
      sourceMessageId?: string | null
    },
  ): Promise<void>
  /**
   * The append-only ledger (RU-6). `sourceMessageId` is the runner message this turn answers.
   *
   * **Widened by phase 5, additively.** `category` and `confidence` are phase 1's own columns and
   * phase 5's distiller supplies both; omitted, they take the row's defaults (`'other'` and 100),
   * which is exactly what `save_memory` wants.
   */
  appendMemoryFact(
    userId: string,
    row: {
      text: string
      sourceMessageId: string | null
      category?: NinaFactCategory
      confidence?: number
    },
  ): Promise<void>
}

/* ============================================================================
 * The dispatch table
 * ==========================================================================*/

export interface NinaToolContext {
  userId: string
  /** `NinaContext.now.todayISO`. The origin of every gap this file reports. */
  todayISO: DateISO
  history: NinaRunHistory
  gateway: NinaToolGateway
  /**
   * The runner message this turn is answering, for `nina_memory_facts.source_message_id` (RU-6).
   * Null on a proactive turn (phase 10), where she started the conversation.
   */
  sourceMessageId: string | null
}

/**
 * What a tool call becomes. `answer` is JSON-serialised straight into a `tool_result` block.
 *
 * `isError` is `true` for "you asked for something I cannot answer" — a bad date, an ambiguous
 * comparison, arguments that failed Zod. It is **still a `tool_result`**, and it deliberately does
 * NOT consume the repair budget (ruling g): telling a model its call was wrong through the
 * protocol's own channel costs one already-budgeted round, and the repair exists for exactly one
 * thing, a malformed `send`.
 */
export interface NinaToolAnswer {
  answer: unknown
  isError: boolean
}

export type NinaToolHandler = (args: unknown, ctx: NinaToolContext) => Promise<NinaToolAnswer>

/** Keyed by the tool's `name`. `send` is deliberately absent — it terminates the loop. */
export type NinaToolTable = Readonly<Record<string, NinaToolHandler>>

export interface NinaToolSet {
  /** Sent as `body.tools`, `send` first so it is the most available thing in the list. */
  tools: readonly Anthropic.Tool[]
  handlers: NinaToolTable
}

/**
 * The four tools phase 3 ships. `GENERATE_IMAGE_TOOL` and `SET_AVATAR_TOOL` exist in phase 2's
 * module and are **deliberately not here**: a tool she can call and this file cannot dispatch
 * would return an error she then has to apologise for, which is R22's failure mode arriving two
 * phases early.
 */
export const NINA_CORE_TOOL_SET: NinaToolSet = {
  tools: [SEND_TOOL, LOOKUP_RUNS_TOOL, COMPARE_RUNS_TOOL, SAVE_MEMORY_TOOL],
  handlers: {
    [LOOKUP_RUNS_TOOL.name]: handleLookupRuns,
    [COMPARE_RUNS_TOOL.name]: handleCompareRuns,
    [SAVE_MEMORY_TOOL.name]: handleSaveMemory,
  },
}

/**
 * Purely additive composition, and the reason phases 12 and 13 need no edit here. Returns a new
 * set; nothing is mutated, so `NINA_CORE_TOOL_SET` is safe to share across requests.
 *
 * A duplicate tool name throws — at module load, in the phase that added it, which is the only
 * time anyone can fix it. Two schemas under one name is a silent dispatch coin-flip otherwise.
 */
export function extendToolSet(
  base: NinaToolSet,
  additions: ReadonlyArray<{ tool: Anthropic.Tool; handler: NinaToolHandler }>,
): NinaToolSet {
  const handlers: Record<string, NinaToolHandler> = { ...base.handlers }
  const tools = [...base.tools]
  for (const { tool, handler } of additions) {
    if (handlers[tool.name] != null || tools.some((t) => t.name === tool.name)) {
      throw new Error(`Nina tool "${tool.name}" is already registered`)
    }
    handlers[tool.name] = handler
    tools.push(tool)
  }
  return { tools, handlers }
}

/**
 * One `tool_use` block to one `tool_result`. **Never throws** — a handler that rejects becomes an
 * `isError` answer, because a thrown exception here would take down a whole chat turn over one bad
 * tool call, and the loop's contract (like `narrate.ts`') is that nothing fails loudly for a model
 * problem.
 */
export async function dispatchNinaTool(
  name: string,
  args: unknown,
  ctx: NinaToolContext,
  table: NinaToolTable,
): Promise<NinaToolAnswer> {
  const handler = table[name]
  if (handler == null) {
    return { answer: { error: `There is no tool called "${name}".` }, isError: true }
  }
  try {
    return await handler(args, ctx)
  } catch (cause) {
    // Warn, never error: see `logLlmFailure` in narrate.ts. A tool that failed is a state of this
    // feature, and the turn continues with her told about it.
    console.warn('[nina] tool dispatch failed', { tool: name, error: String(cause) })
    return {
      answer: { error: `The "${name}" tool could not answer just now. Reply without it.` },
      isError: true,
    }
  }
}

/* ============================================================================
 * lookup_runs — ruling (d): splits live here
 * ==========================================================================*/

export interface NinaSplitFact {
  km: number
  /** `'04:32'` — `formatDuration`. */
  time: string
  /** `'4:32 /km'` — `formatPace(paceSec, true)`. */
  pace: string
  hr: string | null
  cadence: string | null
  /** True for the trailing part-kilometre. Its pace is not comparable to a full km's. */
  partial: boolean
}

export interface NinaZoneFact {
  zone: 1 | 2 | 3 | 4 | 5
  duration: string
  /** `'34%'` — `formatPercent(pct, 0)`. Copied from F06's raw float, rounded once, here. */
  share: string
}

/** Phase 2's run fact, plus the detail that only a tool call is worth paying for. */
export interface NinaLookupRunFact extends NinaRunFact {
  splits: NinaSplitFact[]
  fastestKm: { km: number; pace: string } | null
  slowestKm: { km: number; pace: string } | null
  zones: NinaZoneFact[]
}

/**
 * One day's answer. **There is no shape here that means "nothing".** `situation` restates the
 * `kind` as a clause addressed to her, so an absence cannot be read as a run with no numbers —
 * which is R15's actual requirement and the reason this tool does not simply return an array.
 */
export type LookupDay =
  | { kind: 'invalid'; input: string; situation: string }
  | { kind: 'future'; dateISO: DateISO; dayLabel: string; daysAhead: number; situation: string }
  | {
      kind: 'no_run'
      dateISO: DateISO
      dayLabel: string
      weekday: string
      weekdayId: string
      daysAgo: number
      situation: string
    }
  | {
      kind: 'runs'
      dateISO: DateISO
      dayLabel: string
      weekday: string
      weekdayId: string
      daysAgo: number
      /** Earliest start first. **Two entries is a real state** — the `two_a_days` badge. */
      runs: NinaLookupRunFact[]
      situation: string
    }

export interface LookupRunsAnswer {
  /** Repeated so the answer is self-contained if she re-reads it three turns later. */
  todayISO: DateISO
  days: LookupDay[]
}

function splitFacts(splits: readonly SplitRow[]): NinaSplitFact[] {
  return splits.map((split) => ({
    km: split.km,
    time: formatDuration(split.timeSec),
    pace: formatPace(split.paceSec, true),
    hr: split.hr == null ? null : formatBpm(split.hr),
    cadence: split.cadence == null ? null : formatCadence(split.cadence),
    partial: split.partial,
  }))
}

function zoneFacts(zones: readonly ZonePctRow[]): NinaZoneFact[] {
  return zones.map((zone) => ({
    zone: zone.zone,
    duration: formatDuration(zone.durationSec),
    share: formatPercent(zone.pct, 0),
  }))
}

/**
 * `NinaRunFact` -> `NinaLookupRunFact`. **Everything added is copied or formatted, nothing is
 * computed** — `fastestKm` and `slowestKm` come straight off F06's `SessionMetrics`, which is the
 * only thing allowed to decide which kilometre was fastest.
 */
function enrich(
  fact: NinaRunFact,
  source: NinaDetailedRunInput,
  history: NinaRunHistory,
): NinaLookupRunFact {
  const fastest = source.metrics.fastestKm
  const slowest = source.metrics.slowestKm
  return {
    ...fact,
    splits: splitFacts(history.splitsByRunId.get(fact.runId) ?? source.splits),
    fastestKm: fastest == null ? null : { km: fastest.km, pace: formatPace(fastest.paceSec, true) },
    slowestKm: slowest == null ? null : { km: slowest.km, pace: formatPace(slowest.paceSec, true) },
    zones: zoneFacts(history.zonesByRunId.get(fact.runId) ?? source.metrics.zonePct),
  }
}

function toLookupDay(resolved: DateResolution, history: NinaRunHistory): LookupDay {
  switch (resolved.kind) {
    case 'invalid':
      return {
        kind: 'invalid',
        input: resolved.input,
        situation: `"${resolved.input}" is ${resolved.reason}. Send YYYY-MM-DD worked out from todayISO.`,
      }
    case 'future':
      return {
        kind: 'future',
        dateISO: resolved.dateISO,
        dayLabel: resolved.dayLabel,
        daysAhead: resolved.daysAhead,
        situation: `${resolved.dayLabel} is ${resolved.daysAhead} day(s) in the future. It has not happened yet.`,
      }
    case 'no_run':
      return {
        kind: 'no_run',
        dateISO: resolved.dateISO,
        dayLabel: resolved.dayLabel,
        weekday: resolved.weekday,
        weekdayId: resolved.weekdayId,
        daysAgo: resolved.daysAgo,
        /* R15's whole point. This clause is why an absence gets SAID rather than skipped. */
        situation: `NO RUN on ${resolved.dayLabel} (${resolved.weekdayId}). He did not run that day. Say so.`,
      }
    case 'runs': {
      const byId = new Map(history.runs.map((run) => [run.runId, run]))
      const runs = resolved.runs.map((fact) => {
        const source = byId.get(fact.runId)
        // Unreachable: `resolved.runs` was built from this same history. Kept because the
        // alternative is a non-null assertion on a Map read.
        return source == null
          ? ({
              ...fact,
              splits: [],
              fastestKm: null,
              slowestKm: null,
              zones: [],
            } satisfies NinaLookupRunFact)
          : enrich(fact, source, history)
      })
      return {
        kind: 'runs',
        dateISO: resolved.dateISO,
        dayLabel: resolved.dayLabel,
        weekday: resolved.weekday,
        weekdayId: resolved.weekdayId,
        daysAgo: resolved.daysAgo,
        runs,
        situation:
          runs.length === 1
            ? `One run on ${resolved.dayLabel}.`
            : `${runs.length} runs on ${resolved.dayLabel} — a two-a-day. Both are below.`,
      }
    }
  }
}

export async function handleLookupRuns(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = LookupRunsArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: {
        error: 'lookup_runs needs { dates: ["YYYY-MM-DD", …] }.',
        issues: describeNinaIssues(parsed.error),
      },
      isError: true,
    }
  }

  const days = resolveDates(parsed.data.dates, ctx.history.index, ctx.todayISO).map((resolved) =>
    toLookupDay(resolved, ctx.history),
  )

  const answer: LookupRunsAnswer = { todayISO: ctx.todayISO, days }
  /*
   * `isError` stays FALSE when every date resolved to `no_run`. An absence is a correct, complete
   * answer to a well-formed question — flagging it as an error would invite her to apologise for
   * the tool instead of telling him he did not run.
   */
  return { answer, isError: days.every((day) => day.kind === 'invalid') }
}

/* ============================================================================
 * save_memory — ruling (b)'s explicit path
 * ==========================================================================*/

export interface SaveMemoryAnswer {
  saved: true
  kind: 'slot' | 'fact'
  /** Echoed so her reply can quote the write, which is the only reason this tool exists. */
  text: string
  slotKey?: string
}

/**
 * The write that has to land BEFORE she speaks — ruling (b). A `send.memoryWrites` entry is
 * applied after the reply is composed, so a reply that leans on a corrected slot would be composed
 * against the stale one. This tool exists for that ordering and nothing else.
 */
export async function handleSaveMemory(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = SaveMemoryArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: {
        error: 'save_memory needs { kind: "slot" | "fact", text, slotKey? }.',
        issues: describeNinaIssues(parsed.error),
      },
      isError: true,
    }
  }

  const { kind, text, slotKey } = parsed.data
  if (kind === 'slot') {
    if (slotKey == null) {
      return {
        answer: {
          error: 'kind "slot" needs a slotKey, e.g. usual_running_days. Or use kind "fact".',
        },
        isError: true,
      }
    }
    await ctx.gateway.saveMemorySlot(ctx.userId, { key: slotKey, value: text })
    const answer: SaveMemoryAnswer = { saved: true, kind, text, slotKey }
    return { answer, isError: false }
  }

  await ctx.gateway.appendMemoryFact(ctx.userId, { text, sourceMessageId: ctx.sourceMessageId })
  const answer: SaveMemoryAnswer = { saved: true, kind, text }
  return { answer, isError: false }
}

/* ============================================================================
 * compare_runs — INVARIANT 2, at the one place it would otherwise break
 * ==========================================================================*/

/** B relative to A. `'unknown'` when either side has no value — never conflated with `'same'`. */
export type DeltaDirection = 'up' | 'down' | 'same' | 'unknown'

export interface RunDelta {
  /** Stable machine key, so a later phase can pick one delta out without string matching a label. */
  key: string
  /** `'Average pace'`. */
  label: string
  /** A's value, spelled. null when the run has no reading for it. */
  a: string | null
  b: string | null
  /** **B minus A, already spelled and signed.** null when either side is null. */
  delta: string | null
  direction: DeltaDirection
  /** `'a rise means he ran slower'` — so she never has to infer what the sign means. */
  higherMeans: string
}

interface CompareField {
  key: string
  label: string
  read: (run: NinaDetailedRunInput) => number | null
  /** Spelling for an absolute value. Always an existing `lib/format.ts` call. */
  format: (value: number) => string
  /**
   * Spelling for a difference. `lib/format.ts` has exactly one delta formatter,
   * `formatPaceDelta`, and pace uses it. Everything else gets `signed()` wrapped around its own
   * absolute formatter — a sign prefix, not a second formatter, so invariant 3 still holds and
   * `lib/format.ts` gains nothing (R-23).
   */
  formatDelta: (delta: number) => string
  higherMeans: string
}

/**
 * `+1.20 km`, `−14 bpm`. A prefix on an existing spelling; never a new number format.
 *
 * **The minus is U+2212 MINUS SIGN, not a hyphen**, which is one character away from the plan's
 * code block and deliberate: `formatPaceDelta` is the repo's one existing delta formatter and it
 * spells a negative that way for a stated reason. `deltas` puts fifteen fields side by side and
 * two of them (`avgPace`, `splitDrift`) come from `formatPaceDelta`, so an ASCII hyphen here would
 * have the same array spell a negative two ways — exactly the divergence invariant 3 forbids.
 */
function signed(delta: number, format: (abs: number) => string): string {
  if (delta === 0) return format(0)
  return `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`
}

/**
 * **Every comparison Nina can make, and therefore every comparison she can make AT ALL.**
 *
 * A field is in this table only if F06 already computes it. That is invariant 2 as a data
 * structure: adding a row here is impossible without a `SessionMetrics` field to read, so a
 * comparison F06 does not support cannot be added to a prompt — it has to be added to F06 first,
 * in F06's own card. Comparisons that were wanted and are NOT here are named in the plan's
 * *Decisions on the open items* item 6, each as its own F06 card: grade-adjusted pace, weather,
 * per-run training load, VO2max, a full side-by-side split table, and anything derived from body
 * weight.
 *
 * `paceSd` is spelled with `formatDuration` because a spread in seconds has exactly one spelling
 * in `lib/format.ts` and that is it. `'0:12'` for a 12-second spread reads oddly and is still the
 * right call: a second seconds-formatter invented here is precisely the divergence R-42 punished.
 */
export const COMPARE_FIELDS: readonly CompareField[] = [
  {
    key: 'distance',
    label: 'Distance',
    read: (run) => run.distanceM,
    format: (v) => formatDistanceM(v),
    formatDelta: (d) => signed(d, (abs) => formatDistanceM(abs)),
    higherMeans: 'a rise means he covered more ground',
  },
  {
    key: 'duration',
    label: 'Moving time',
    read: (run) => run.durationSec,
    format: (v) => formatDuration(v),
    formatDelta: (d) => signed(d, (abs) => formatDuration(abs)),
    higherMeans: 'a rise means he was out longer',
  },
  {
    key: 'avgPace',
    label: 'Average pace',
    read: (run) => run.avgPaceSec,
    format: (v) => formatPace(v, true),
    /* The one existing delta formatter in the repo. `+12 s/km` = slower. */
    formatDelta: (d) => formatPaceDelta(d),
    higherMeans: 'a rise means he ran SLOWER — pace is seconds per km, so bigger is worse',
  },
  {
    key: 'avgHr',
    label: 'Average heart rate',
    read: (run) => run.avgHr,
    format: (v) => formatBpm(v),
    formatDelta: (d) => signed(d, (abs) => formatBpm(abs)),
    higherMeans: 'a rise means his heart worked harder for the same outing',
  },
  {
    key: 'maxHr',
    label: 'Peak heart rate',
    read: (run) => run.maxHr,
    format: (v) => formatBpm(v),
    formatDelta: (d) => signed(d, (abs) => formatBpm(abs)),
    higherMeans: 'a rise means a harder peak effort',
  },
  {
    key: 'avgHrPctOfMax',
    label: 'Average HR as % of max',
    read: (run) => run.metrics.avgHrPctMax,
    format: (v) => formatPercent(v, 0),
    formatDelta: (d) => signed(d, (abs) => formatPercent(abs, 0)),
    higherMeans: 'a rise means a bigger share of his ceiling. If his HRmax is estimated, say so',
  },
  {
    key: 'aerobicDecoupling',
    label: 'Aerobic decoupling (Pa:Hr)',
    read: (run) => run.metrics.decouplingPct,
    format: (v) => formatPercent(v, 1),
    formatDelta: (d) => signed(d, (abs) => formatPercent(abs, 1)),
    higherMeans: 'POSITIVE decoupling is drift — a rise means he faded more, not less',
  },
  {
    key: 'splitDrift',
    label: 'First-half to second-half pace drift',
    read: (run) => run.metrics.splitDriftSecPerKm,
    format: (v) => formatPaceDelta(v),
    formatDelta: (d) => formatPaceDelta(d),
    higherMeans: 'a rise means he slowed down more over the run',
  },
  {
    key: 'paceSd',
    label: 'Pace spread across kilometres',
    read: (run) => run.metrics.paceSdSec,
    format: (v) => formatDuration(v),
    formatDelta: (d) => signed(d, (abs) => formatDuration(abs)),
    higherMeans: 'a rise means the kilometres were less even',
  },
  {
    key: 'cadenceFade',
    label: 'Cadence fade, last full km minus first',
    read: (run) => run.metrics.cadenceFadeSpm,
    format: (v) => formatCadence(v),
    formatDelta: (d) => signed(d, (abs) => formatCadence(abs)),
    higherMeans: 'NEGATIVE fade is the bad direction — a rise means he held his cadence better',
  },
  {
    key: 'avgCadence',
    label: 'Average cadence',
    read: (run) => run.avgCadence,
    format: (v) => formatCadence(v),
    formatDelta: (d) => signed(d, (abs) => formatCadence(abs)),
    higherMeans: 'a rise means quicker turnover',
  },
  {
    key: 'hardPct',
    label: 'Time in zones 4 and 5',
    read: (run) => run.metrics.hardPct,
    format: (v) => formatPercent(v, 0),
    formatDelta: (d) => signed(d, (abs) => formatPercent(abs, 0)),
    higherMeans: 'a rise means more of the run was genuinely hard',
  },
  {
    key: 'hrRecovery1Min',
    label: 'Heart-rate drop one minute after finishing',
    read: (run) => run.metrics.hrRecovery1MinBpm,
    format: (v) => formatBpm(v),
    formatDelta: (d) => signed(d, (abs) => formatBpm(abs)),
    higherMeans: 'a rise is GOOD — a bigger drop is better recovery',
  },
  {
    key: 'activeKcal',
    label: 'Active calories',
    read: (run) => run.activeKcal,
    format: (v) => formatKcal(v),
    formatDelta: (d) => signed(d, (abs) => formatKcal(abs)),
    higherMeans: 'a rise means more energy spent, as the watch reported it',
  },
  {
    key: 'elevationGain',
    label: 'Elevation gain',
    read: (run) => run.elevationM,
    format: (v) => formatElevation(v),
    formatDelta: (d) => signed(d, (abs) => formatElevation(abs)),
    higherMeans: 'a rise means more climbing, which makes a slower pace expected',
  },
]

/** The whole delta table for one ordered pair. Pure — the unit test calls it directly. */
export function compareRunFacts(a: NinaDetailedRunInput, b: NinaDetailedRunInput): RunDelta[] {
  return COMPARE_FIELDS.map((field) => {
    const rawA = field.read(a)
    const rawB = field.read(b)
    if (rawA == null || rawB == null) {
      return {
        key: field.key,
        label: field.label,
        a: rawA == null ? null : field.format(rawA),
        b: rawB == null ? null : field.format(rawB),
        /* null, never 0. A missing reading and an unchanged reading are different facts, and F06
         * makes the same distinction for exactly this reason. */
        delta: null,
        direction: 'unknown' as DeltaDirection,
        higherMeans: field.higherMeans,
      }
    }
    const diff = rawB - rawA
    return {
      key: field.key,
      label: field.label,
      a: field.format(rawA),
      b: field.format(rawB),
      delta: field.formatDelta(diff),
      direction: (diff === 0 ? 'same' : diff > 0 ? 'up' : 'down') as DeltaDirection,
      higherMeans: field.higherMeans,
    }
  })
}

export interface CompareSide {
  dateISO: DateISO
  dayLabel: string
  weekdayId: string
  daysAgo: number
  runId: string
  startedAt: string | null
  location: string | null
  intent: NinaRunFact['intent']
  flags: NinaRunFact['flags']
  note: string | null
}

export interface CompareRunsAnswer {
  kind: 'comparison'
  todayISO: DateISO
  a: CompareSide
  b: CompareSide
  /** One entry per `COMPARE_FIELDS` row, in that order. Already subtracted, already spelled. */
  deltas: RunDelta[]
  situation: string
}

/** Every answer `compare_runs` can give. Union, so no branch can return "nothing". */
export type CompareRunsResult =
  | CompareRunsAnswer
  | DateAmbiguous
  | { kind: 'invalid'; input: string; situation: string }
  | { kind: 'future'; dateISO: DateISO; dayLabel: string; situation: string }
  | { kind: 'no_run'; dateISO: DateISO; dayLabel: string; weekdayId: string; situation: string }
  | { kind: 'same_day'; dateISO: DateISO; situation: string }

function sideOf(fact: NinaRunFact, resolved: { dayLabel: string; weekdayId: string }): CompareSide {
  return {
    dateISO: fact.dateISO,
    dayLabel: resolved.dayLabel,
    weekdayId: resolved.weekdayId,
    daysAgo: fact.daysAgo,
    runId: fact.runId,
    startedAt: fact.startedAt,
    location: fact.location,
    intent: fact.intent,
    flags: fact.flags,
    note: fact.note,
  }
}

/**
 * R15's comparison. **Answers a question or asks one; it never guesses.**
 *
 * Every non-comparison branch returns `isError: false` except the two that are genuinely her
 * mistake (a malformed date, the same day twice). "There is no run on 1 Sep" and "there were two
 * runs that day" are correct, complete answers she has to relay — marking them as errors would
 * invite an apology about a tool instead of the sentence R15 asked for.
 */
export async function handleCompareRuns(
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> {
  const parsed = CompareRunsArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: {
        error: 'compare_runs needs { dateA: "YYYY-MM-DD", dateB: "YYYY-MM-DD" }.',
        issues: describeNinaIssues(parsed.error),
      },
      isError: true,
    }
  }

  const { dateA, dateB } = parsed.data
  if (dateA === dateB) {
    const result: CompareRunsResult = {
      kind: 'same_day',
      dateISO: dateA,
      situation: `${dateA} is one day. To compare two runs from the same day, use lookup_runs and pick two.`,
    }
    return { answer: result, isError: true }
  }

  const sides = [dateA, dateB].map((input) => resolveDate(input, ctx.history.index, ctx.todayISO))

  for (const resolved of sides) {
    if (resolved.kind === 'invalid') {
      return {
        answer: {
          kind: 'invalid',
          input: resolved.input,
          situation: `"${resolved.input}" is ${resolved.reason}. Send YYYY-MM-DD worked out from todayISO.`,
        } satisfies CompareRunsResult,
        isError: true,
      }
    }
    if (resolved.kind === 'future') {
      return {
        answer: {
          kind: 'future',
          dateISO: resolved.dateISO,
          dayLabel: resolved.dayLabel,
          situation: `${resolved.dayLabel} has not happened yet. Nothing to compare.`,
        } satisfies CompareRunsResult,
        isError: true,
      }
    }
    if (resolved.kind === 'no_run') {
      return {
        answer: {
          kind: 'no_run',
          dateISO: resolved.dateISO,
          dayLabel: resolved.dayLabel,
          weekdayId: resolved.weekdayId,
          /* R15's explicit absence, on the comparison path too. */
          situation: `NO RUN on ${resolved.dayLabel} (${resolved.weekdayId}), so there is nothing to compare it with. Tell him that.`,
        } satisfies CompareRunsResult,
        isError: false,
      }
    }
    if (resolved.runs.length > 1) {
      /* Ruling (c). She asks which one; the app does not pick. */
      return { answer: ambiguousFrom(resolved), isError: false }
    }
  }

  const [left, right] = sides as [
    Extract<DateResolution, { kind: 'runs' }>,
    Extract<DateResolution, { kind: 'runs' }>,
  ]
  const byId = new Map(ctx.history.runs.map((run) => [run.runId, run]))
  const sourceA = byId.get(left.runs[0]!.runId)
  const sourceB = byId.get(right.runs[0]!.runId)
  if (sourceA == null || sourceB == null) {
    // Unreachable: both were resolved out of this same history one statement ago.
    return { answer: { error: 'Those runs could not be read just now.' }, isError: true }
  }

  const answer: CompareRunsAnswer = {
    kind: 'comparison',
    todayISO: ctx.todayISO,
    a: sideOf(left.runs[0]!, left),
    b: sideOf(right.runs[0]!, right),
    deltas: compareRunFacts(sourceA, sourceB),
    situation:
      'Every delta below is B minus A, already worked out. Do NOT subtract anything yourself. ' +
      'Read `higherMeans` before calling a rise good or bad, and `direction: "unknown"` means one ' +
      'of the two runs has no reading for that field — not that nothing changed.',
  }
  return { answer, isError: false }
}
