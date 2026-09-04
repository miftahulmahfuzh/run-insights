import 'server-only'

import { todayInJakarta } from '@/lib/date/ranges'
import {
  getAllTimeTotals,
  getReviewedRunsWithChildren,
  getReviewedRunWindow,
} from '@/lib/db/queries'
import {
  computeSessionMetrics,
  evaluateSessionFlags,
  resolveHrMax,
  type ZoneRow,
} from '@/lib/metrics'

import type {
  FiredPattern,
  MemoryFactInput,
  MemorySlotInput,
  MessageInput,
  MessageRole,
  NagState,
} from './context'
import { indexRunsByDate } from './dates'
import type { NinaMemoryGateway } from './distill'
import type { NinaSourceGateway } from './load'
import { parseRunningDays, type NinaSlotKey } from './memory'
import { evaluatePatterns, PATTERN_RUN_FETCH_LIMIT } from './patterns'
import {
  appendNinaMemoryFacts,
  getNinaIdentity,
  getNinaMemorySlot,
  getNinaMemorySlots,
  getNinaMessageWindow,
  getNinaNags,
  insertNinaTurn,
  listNinaMemoryFacts,
  upsertNinaMemorySlot,
} from './queries'
import type { NinaDetailedRunInput, NinaRunHistory, NinaToolGateway } from './tools'
import type { NinaTurnRow, NinaTurnSource, NinaTurnStore } from './turn'
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaPendingPromisesSlot,
  type NinaRole,
  type NinaTurnStatus,
} from '@/lib/db/schema'

/**
 * The three real gateways. `lib/records/gateway.ts` is the model, down to the rule in its header:
 * every decision about what a fact IS lives in `context.ts`, `dates.ts` and `tools.ts`, none of
 * which import this file.
 *
 * ── THE PHASE 9 STUBS ARE GONE (PHASE 10, RULING G6) ──────────────────────────────────────────
 * `readFiredPatterns` and `readNags` returned `[]` while phase 9 was unlanded — the interface's
 * own documented empty case, which bought a green tree at that boundary (RU-11) for one comment
 * each. Phase 9 then shipped `evaluatePatterns` as a PURE function over resolved inputs, so the
 * resolving had to land somewhere, and ruling G6 put it here: phase 10 is the phase that needs the
 * codes to actually fire, because `pattern_crossed` is one of its five triggers. Both bodies are
 * below, and `tests/nina.gateway.patterns.test.ts` is the exit test that they no longer stub.
 * `imageDescriptions` is still `[]` here — phase 6 populates it from `nina_message_images`.
 */

/* ============================================================================
 * Phase 2's NinaSourceGateway
 * ==========================================================================*/

/**
 * Phase 5's key for the days he usually runs. Typed as `NinaSlotKey` rather than left a bare
 * string so a typo fails the build against phase 5's vocabulary instead of silently reading a slot
 * that does not exist and disabling a pattern rule for good. Phase 10 spells the same key in
 * `proactive.ts` and checks it the same way — the authority is `NINA_SLOT_KEYS`, in both places.
 */
const RUNNING_DAYS_SLOT: NinaSlotKey = 'running_days'

/*
 * **There is no `toRole`, and its absence is a decision.** This file's draft carried a
 * `toRole(value: string): MessageRole` that narrowed by string comparison, on the assumption that
 * phase 1 might ship `role` as a bare `text`. It does not: phase 1 exports
 * `NinaRole = 'runner' | 'nina'` and `NinaMessageRow.role` is already that type. So the narrowing
 * function is deleted rather than kept "for safety" — a runtime coercion in front of a type the
 * database layer already guarantees is a second, weaker definition of the same domain, and the
 * `?? 'runner'` inside it would silently rewrite a genuinely bad row into a plausible one instead
 * of failing where someone would see it.
 *
 * What replaces it is a type-level assertion that costs nothing at runtime and fails the build the
 * day the two layers disagree. `role` is the one field that crosses this boundary UNCHANGED, so it
 * is the one field a mapper cannot document by mapping it; this line documents it instead. If
 * phase 1 ever widens `NinaRole` — an `'operator'` role, say — this fails first and points
 * straight at phase 2's `MessageRole`, which is exactly the behaviour wanted.
 *
 * `NinaRole` and `NinaTurnStatus` are imported from `@/lib/db/schema` rather than from
 * `./queries`, because that is where phase 1 declares them: both are **column domains**, and
 * `queries.ts` imports them too rather than re-exporting. One declaration, read from its owner.
 */
type _RolesAgree = [NinaRole] extends [MessageRole]
  ? [MessageRole] extends [NinaRole]
    ? true
    : never
  : never
const _rolesAgree: _RolesAgree = true
void _rolesAgree

export const dbNinaSourceGateway: NinaSourceGateway = {
  async readIdentity(userId) {
    return getNinaIdentity(userId)
  },

  async readMemorySlots(userId): Promise<MemorySlotInput[]> {
    const rows = await getNinaMemorySlots(userId)
    return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt }))
  },

  async readMemoryFacts(userId, limit): Promise<MemoryFactInput[]> {
    /* An OPTIONS OBJECT, not a positional limit — phase 1's signature. */
    const rows = await listNinaMemoryFacts(userId, { limit })
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      sourceMessageId: row.sourceMessageId,
      createdAt: row.createdAt,
    }))
  },

  async readMessageWindow(userId, limit) {
    /*
     * ── ONE CALL. This is the DTO boundary, and this map is the whole of it. ──────────────────
     *
     * `getNinaMessageWindow` returns `{ messages, olderCount }` — which is *exactly* the shape
     * phase 2's `readMessageWindow` declares, so there is nothing to assemble. This file's draft
     * ran `listNinaMessages` and a `countNinaMessages` concurrently and subtracted; the second of
     * those does not exist, and the first is now redundant, because phase 1 already does the
     * `COUNT` inside this one query. The property the draft cared about is preserved and is now
     * phase 1's to keep: `olderCount` is a SQL `COUNT`, not `all.length - limit`, which would need
     * the whole history in memory to answer a question about its size and would report 0 for a
     * 500-message history the moment the window happened to be short.
     *
     * **The three-spelling translation happens here and ONLY here** (RULING A1): the columns are
     * `text` / `sent_at`, `queries.ts`'s DTO is `body` / `createdAt` uniformly in every function
     * because they all select through one shared `messageColumns`, and phase 2's `MessageInput` is
     * `text` / `sentAt`. Two lines below are that boundary. Neither side is to be "fixed" to match
     * the other.
     */
    const { messages: rows, olderCount } = await getNinaMessageWindow(userId, limit)
    const messages: MessageInput[] = rows.map((row) => ({
      id: row.id,
      role: row.role,
      text: row.body,
      sentAt: row.createdAt,
      replyToId: row.replyToId,
      runId: row.runId,
      /* Phase 6 populates this from `nina_message_images.description`. `[]`, never null — phase
       * 2's `MessageInput` says so, and an empty array is what "no images on this message" is. */
      imageDescriptions: [],
    }))
    return { messages, olderCount }
  },

  /**
   * **Phase 10 (RULING G6) — the stub is gone.** Phase 9 shipped `evaluatePatterns` as a pure
   * function over resolved inputs; this is the only place that resolves them, so it is the only
   * place the five longitudinal codes actually fire. Until this body existed, `context.patterns`
   * was permanently `[]` and phase 10's `pattern_crossed` trigger was unreachable code.
   *
   * Four reads, all indexed, all `userId`-scoped, none of them a recomputation of anything:
   *
   *   runs             `getReviewedRunWindow` at `PATTERN_RUN_FETCH_LIMIT` — phase 9 exports that
   *                    number precisely so the caller does not guess it, and its row shape is a
   *                    structural superset of `PatternRun`, so there is no mapping step
   *   hrMaxBpm         `resolveHrMax` — the app's ONE definition of HRmax. Null disables the
   *                    heart-rate code rather than reassuring about it
   *   usualRunningDays phase 5's `running_days` slot through phase 5's parser, in ISO 1-7, which
   *                    is the view `PatternInput` asks for (phase 10 takes the 0-6 view)
   *   firstRunOn       `getAllTimeTotals` — `computeAcwr`'s insufficient-history guard cannot see
   *                    the first run from a 40-run window
   *
   * `upTo` is today at `23:59:59` rather than the newest run: `getReviewedRunWindow` compares
   * `(occurred_on, coalesce(started_at, '00:00'))` with `<=`, so an inclusive end-of-day bound is
   * what "every reviewed run up to now" spells. `asOf` is `todayInJakarta()` for the same reason
   * every other date decision in this app is: it is the only sanctioned answer to what day it is.
   *
   * A runner with no reviewed history gets `[]` from `evaluatePatterns` itself — a first-week
   * runner has no habits to judge — so there is no empty-case branch here.
   */
  async readFiredPatterns(userId): Promise<FiredPattern[]> {
    const asOf = todayInJakarta()

    const [runs, hrMax, totals, slots] = await Promise.all([
      getReviewedRunWindow(
        userId,
        { occurredOn: asOf, startedAt: '23:59:59' },
        PATTERN_RUN_FETCH_LIMIT,
      ),
      resolveHrMax(userId),
      getAllTimeTotals(userId),
      /* `getNinaMemorySlots`, not `getNinaMemorySlot`: the plural is the one that RENDERS the
       * stored JSON value to the display text phase 5's parser reads back. The singular returns
       * the parsed structure and its renderer is private to `queries.ts`. Same PK-prefix scan. */
      getNinaMemorySlots(userId),
    ])

    return evaluatePatterns({
      runs,
      asOf,
      hrMaxBpm: hrMax?.bpm ?? null,
      /* The slot stores DISPLAY text (RU-6). Phase 5 owns the vocabulary and the parser; an
       * unreadable or absent value yields `[]`, which disables `MISSED_USUAL_DAY` rather than
       * guessing a schedule he never told her about. */
      usualRunningDays: parseRunningDays(
        slots.find((slot) => slot.key === RUNNING_DAYS_SLOT)?.value,
      ),
      firstRunOn: totals.firstRunOn,
    })
  },

  /**
   * **Phase 10 (RULING G6).** Phase 1's rows, in phase 2's shape. `level` is the STORED count of
   * times she has raised the code; the decay that turns it into a current rung is
   * `decayedNagLevel`'s, applied by `buildNinaContext` — never here, and never written back (see
   * `lib/nina/nags.ts`, which says why re-projecting a projection decays twice from one anchor).
   */
  async readNags(userId): Promise<NagState[]> {
    const rows = await getNinaNags(userId)
    return rows.map((row) => ({
      code: row.code,
      level: row.level,
      lastMentionedOn: row.lastMentionedOn,
    }))
  },
}

/* ============================================================================
 * This phase's NinaToolGateway
 * ==========================================================================*/

/**
 * One reviewed run into the shape the tools need: phase 2's `NinaRunInput` fields, plus the split
 * rows `NinaRunFact` deliberately omits (ruling d).
 *
 * `computeSessionMetrics` and `evaluateSessionFlags` are called here rather than reimplemented,
 * for the reason `lib/badges/facts.ts` gives about `toWindowRun`: a second implementation of
 * decoupling is a second chance to get the sign wrong, and that sign has been wrong once already.
 */
function toDetailedRun(
  run: Awaited<ReturnType<typeof getReviewedRunsWithChildren>>[number],
  hrMax: Awaited<ReturnType<typeof resolveHrMax>>,
): NinaDetailedRunInput {
  const splits = run.splits.map((s) => ({
    km: s.km,
    timeSec: s.timeSec,
    paceSec: s.paceSec,
    hr: s.hr,
    cadence: s.cadence,
    partial: s.partial,
  }))
  const sessionInput = {
    runId: run.id,
    occurredOn: run.occurredOn,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgHrBpm: run.avgHr,
    splits,
    // `run_zones.zone` is a plain int in Postgres; F04's Zod schema enforces the 1..5 domain on
    // the way in, so this narrowing restates a guarantee rather than assuming one.
    zones: run.zones.map((z) => ({
      zone: z.zone as ZoneRow['zone'],
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
    recovery: { endHrBpm: run.endHrBpm, hrAt1MinBpm: run.hr1MinPostBpm },
  }
  const metrics = computeSessionMetrics(sessionInput, hrMax)
  return {
    runId: run.id,
    occurredOn: run.occurredOn,
    startedAt: run.startedAt,
    location: run.location,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgPaceSec: run.avgPaceSec,
    avgHr: run.avgHr,
    maxHr: run.maxHr,
    avgCadence: run.avgCadence,
    activeKcal: run.activeKcal,
    elevationM: run.elevationM,
    intent: run.intent,
    note: run.note,
    metrics,
    flags: evaluateSessionFlags(metrics, splits.find((s) => !s.partial) ?? null),
    splits,
  }
}

/**
 * **One implementation object, two interface views — and the intersection is what checks it.**
 * Phase 3's `NinaToolGateway` is what the tool dispatch sees; phase 5's `NinaMemoryGateway` adds
 * the two reads its planner needs and sees the same two writers. Annotating the object with both
 * means a later edit that breaks either view fails here, at the definition, rather than in a
 * runtime cast at a call site — and it is why there is still exactly one way to upsert a slot.
 */
export const dbNinaToolGateway: NinaToolGateway & NinaMemoryGateway = {
  async loadRunHistory(userId): Promise<NinaRunHistory> {
    /*
     * `resolveHrMax` is resolved ONCE and reused across the loop, which is exactly what that
     * function's own header asks a hot caller to do: it is two queries and `avgHrPctMax` is the
     * single field that depends on it.
     */
    const [rows, hrMax] = await Promise.all([
      getReviewedRunsWithChildren(userId),
      resolveHrMax(userId),
    ])
    const runs = rows.map((row) => toDetailedRun(row, hrMax))
    return {
      runs,
      index: indexRunsByDate(runs),
      splitsByRunId: new Map(runs.map((run) => [run.runId, run.splits])),
      zonesByRunId: new Map(runs.map((run) => [run.runId, run.metrics.zonePct])),
    }
  },

  async saveMemorySlot(userId, row) {
    /* `NinaSlotUpsert.value` is `NinaSlotValue`, whose common case is a bare JSON string — see
     * `ninaMemorySlots`' header for why one `jsonb` column holds both a phrase and phase 13's
     * promise list. `source` defaults to `'distilled'` when the caller omits it, which is what
     * `save_memory` is; phase 5 passes `'admin'` back for a merge that preserved a human's row. */
    await upsertNinaMemorySlot(userId, {
      key: row.key,
      value: row.value,
      source: row.source,
      sourceMessageId: row.sourceMessageId,
    })
  },

  async appendMemoryFact(userId, row) {
    /*
     * `appendNinaMemoryFacts` is a BATCH — phase 1's name and phase 1's shape. The gateway method
     * stays singular because both callers (the `save_memory` tool and `applyMemoryWrites`) have
     * one fact at a time and a caller-side array-of-one is noise. Wrapping it here costs one pair
     * of brackets; making phase 5 think about batching does not.
     *
     * **`category: 'other'` is the DEFAULT and not the answer.** `NinaFactInsert` requires a
     * category and phase 5 owns the vocabulary — the same division ruling (b) already makes for
     * `slotKey`. Phase 5's distiller classifies every fact it plans and passes one in; the
     * `save_memory` tool does not and takes `'other'`. Guessing `'training'` from a sentence this
     * file never reads would be the arithmetic a gateway is not allowed to do.
     */
    await appendNinaMemoryFacts(userId, [
      {
        category: row.category ?? 'other',
        text: row.text,
        confidence: row.confidence,
        sourceMessageId: row.sourceMessageId,
      },
    ])
  },

  /**
   * Phase 5's admin-row rule (its ruling (c)) is unimplementable without knowing who wrote each
   * slot. `getNinaMemorySlots` already selects `source`; this only reshapes it into the lookup the
   * planner wants.
   */
  async readSlotSources(userId) {
    const rows = await getNinaMemorySlots(userId)
    return new Map(rows.map((row) => [row.key, row.source]))
  },

  /**
   * `pending_promises`, parsed, for phase 5's merge. The shape check is deliberate and belongs
   * here: `value` is `jsonb`, phase 16's editor hand-writes it, and a malformed value must degrade
   * to "no promises" rather than throw inside a distillation pass. This is a boundary, not
   * arithmetic.
   */
  async readPendingPromises(userId) {
    const row = await getNinaMemorySlot(userId, NINA_SLOT_PENDING_PROMISES)
    if (row === null) return null
    const value = row.value
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const promises = (value as { promises?: unknown }).promises
    if (!Array.isArray(promises)) return null
    return { promises } as NinaPendingPromisesSlot
  },
}

/* ============================================================================
 * The turn log
 * ==========================================================================*/

/**
 * **`source` is translated to `status` HERE, and nowhere else.** Phase 1's `nina_turns` has a
 * `status` column whose domain is `NinaTurnStatus = 'pending' | 'ok' | 'repaired' | 'failed'`
 * (`'pending'` is phase 12's, for a queued image job). This phase's `NinaTurnSource` is a
 * different concept — *which mechanism produced the reply*, not *what became of the row* — so the
 * two are not one column under two names, and `source` is never written into `status` raw.
 *
 * The map is three lines and it lives at the single write site, which is the only place that can
 * drift:
 *
 *     'llm'         → status 'ok'
 *     'llm_repair'  → status 'repaired'
 *     'unavailable' → status 'failed', error_code 'unavailable'
 *
 * `kind: 'chat'` and `trigger: null` for every turn this phase writes; phase 10 hands in the other
 * values. `rounds` is deliberately absent — phase 1's table has no such column and this phase does
 * not add one; `tool_calls` carries the names, which is strictly more than a count would say.
 */
const STATUS_BY_SOURCE = {
  llm: 'ok',
  llm_repair: 'repaired',
  unavailable: 'failed',
} as const satisfies Record<NinaTurnSource, NinaTurnStatus>

export const dbNinaTurnStore: NinaTurnStore = {
  async record(userId: string, row: NinaTurnRow): Promise<void> {
    await insertNinaTurn(userId, {
      kind: 'chat',
      trigger: null,
      model: row.model,
      promptVersion: row.promptVersion,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      /* Comma-joined names, `''` when none — ruling (b)'s evidence, and the reason phase 1's
       * column is `text NOT NULL DEFAULT ''` rather than an `integer` count. */
      toolCalls: row.toolCalls,
      latencyMs: row.latencyMs,
      status: STATUS_BY_SOURCE[row.source],
      errorCode: row.source === 'unavailable' ? 'unavailable' : null,
    })
  },
}
