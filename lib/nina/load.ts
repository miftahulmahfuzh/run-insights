import 'server-only'

import { foldAwards } from '@/lib/badges/facts'
import type { BadgeAward } from '@/lib/badges/types'
import {
  getBadgeAwards,
  getProfile,
  getRecords,
  getReviewedRunsWithChildren,
} from '@/lib/db/queries'
import { computeSessionMetrics, evaluateSessionFlags, type ZoneRow } from '@/lib/metrics'
import { resolveHrMax } from '@/lib/metrics/hrMax'
import {
  buildNinaContext,
  type FiredPattern,
  type MemoryFactInput,
  type MemorySlotInput,
  type MessageInput,
  type NagState,
  type NinaContext,
  type NinaProfile,
  type NinaRunInput,
  type Sex,
  type StoredRecordInput,
} from './context'
import { NINA_PROMPT_VERSION } from './prompts'

/**
 * **The fetching half.** `lib/nina/context.ts` decides what a fact IS and does no I/O; this file
 * reads rows and hands them over — the same split `lib/insights/load.ts` uses against
 * `lib/llm/facts.ts`, and the same one `lib/records/{recompute,gateway}.ts` uses. The interesting
 * logic stays unit-testable with no database in sight.
 *
 * ── ONE QUERY FOR THE HISTORY, THE SAME ONE `/trends` AND F06 USE ─────────────────────────────
 * `getReviewedRunsWithChildren` reads the whole reviewed history in one `db.batch` — three
 * statements, one consistent snapshot — and this file takes the tail of it. Right *because this
 * is a single-user app with a bounded history* (~200 runs a year); `lib/insights/load.ts` and
 * `recomputeRecords` rest on the same premise and all three need the same rethink together if it
 * ever stops holding.
 *
 * ── WHY THE NINA TABLES COME THROUGH A GATEWAY ───────────────────────────────────────────────
 * Four of the reads below (identity, memory, messages, patterns/nags) belong to phases 1, 5 and 9.
 * Injecting them, exactly as `recomputeRecords` injects `RecordsGateway`, does three things: this
 * module compiles and is reviewable before those phases land, the exit-criteria test drives it
 * with a hand-written fake and no connection, and the cross-phase contract is ONE interface
 * instead of six import sites that have to agree about function names.
 *
 * **This phase deliberately ships no concrete gateway.** Phase 3 is the first caller and wires
 * `lib/nina/queries.ts` into it. See the plan's Handoffs.
 */

/**
 * **RU-14's N, named.** 40 messages, the plan index's initial value. No rolling summariser — the
 * fact ledger is the long-term memory, and a summariser would be a second, lossy copy of it that
 * can disagree.
 *
 * **Do not lower this below phase 5's `FIRST_CONVERSATION_MESSAGE_LIMIT` (12).** Phase 5 reads
 * `context.conversation.window.length` instead of a real message count, which is only sound while
 * the window is larger than the threshold it is compared against; at 40 vs 12 there is plenty of
 * headroom, and below 12 the first-conversation branch would latch on forever.
 */
export const CONTEXT_MESSAGE_WINDOW = 40

/**
 * Twenty runs — about five weeks at four a week.
 *
 * R1 says tokens are no object and the temptation is to send everything. The reason not to is not
 * cost: a 200-run table is where the memory slots and the conversation stop being noticed, and
 * F07 already measured this model spending three of four prose fields on the one scalar that
 * happened to be in front of it. Five weeks is enough for "lo kemaren kemana tah", enough for the
 * shape of the month, and short enough that the ledger and the window still read as the point.
 * Anything older is what `lookup_runs` and `compare_runs` are for.
 */
export const RECENT_RUN_LIMIT = 20

/** The ledger's newest 60 facts. Older ones stay in the table; she asks or looks them up. */
export const MEMORY_FACT_LIMIT = 60

export interface NinaSourceGateway {
  /** `users.name` as the OAuth provider gave it, plus the nickname phase 5 confirmed. */
  readIdentity(userId: string): Promise<{ fullName: string | null; nickname: string | null }>
  /** The upserted standing facts (RU-6). Phase 5 owns the key vocabulary. */
  readMemorySlots(userId: string): Promise<MemorySlotInput[]>
  /** The append-only ledger, **newest first**, at most `limit` rows. */
  readMemoryFacts(userId: string, limit: number): Promise<MemoryFactInput[]>
  /**
   * The last `limit` messages **oldest first**, plus how many exist before them.
   * `olderCount` is a COUNT in SQL, not `all.length - limit` in TypeScript.
   */
  readMessageWindow(
    userId: string,
    limit: number,
  ): Promise<{ messages: MessageInput[]; olderCount: number }>
  /** Phase 9's computed longitudinal codes. `[]` when none fired. */
  readFiredPatterns(userId: string): Promise<FiredPattern[]>
  /** Phase 9's escalation ledger. `[]` when she has never nagged. */
  readNags(userId: string): Promise<NagState[]>
}

/**
 * `profiles.sex` is a plain `text` column, so `Profile.sex` is `string | null` even though phase 1
 * declares `Sex` as its domain. This narrows it on the way in. It survives phase 1's landing on
 * purpose: the type says four members, the column says any string, and only one of those two is
 * checked at runtime.
 */
function toSex(value: string | null): Sex | null {
  switch (value) {
    case 'male':
    case 'female':
    case 'other':
    case 'unspecified':
      return value
    default:
      return null
  }
}

/**
 * Every run's metrics and flags through F06's own functions, on rows already in memory — the same
 * thing `lib/badges/facts.ts`'s `toWindowRun` does, and for the same reason: a second
 * implementation of decoupling is a second chance to get the sign wrong.
 *
 * `hrMax` is passed in rather than resolved per run: `resolveHrMax` is two queries and
 * `avgHrPctMax` is the single field that depends on it, so resolving once and reusing across the
 * loop is exactly what that function's header asks a hot caller to do.
 */
export async function loadNinaContext(
  userId: string,
  gateway: NinaSourceGateway,
  now: Date = new Date(),
): Promise<NinaContext> {
  const [identity, slots, facts, window, firedPatterns, nags] = await Promise.all([
    gateway.readIdentity(userId),
    gateway.readMemorySlots(userId),
    gateway.readMemoryFacts(userId, MEMORY_FACT_LIMIT),
    gateway.readMessageWindow(userId, CONTEXT_MESSAGE_WINDOW),
    gateway.readFiredPatterns(userId),
    gateway.readNags(userId),
  ])

  const [profileRow, allRuns, recordRows, badgeRows, hrMax] = await Promise.all([
    getProfile(userId),
    getReviewedRunsWithChildren(userId),
    getRecords(userId),
    getBadgeAwards(userId),
    resolveHrMax(userId),
  ])

  const profile: NinaProfile | null =
    profileRow == null
      ? null
      : {
          birthYear: profileRow.birthYear,
          heightCm: profileRow.heightCm,
          /* RU-1. `weight_kg` is `numeric(4,1)` in `mode: 'number'`, so this is already a number. */
          weightKg: profileRow.weightKg,
          /* Phase 1's column, visible on `Profile` now that phase 1 has landed — no structural
           * cast. Still narrowed through `toSex` so an unexpected string degrades to null rather
           * than reaching the prompt as a word she might repeat at him. */
          sex: toSex(profileRow.sex),
          restingHr: profileRow.restingHr,
        }

  /* `getReviewedRunsWithChildren` orders ASC by `occurred_on`; the newest `RECENT_RUN_LIMIT` are
   * the tail, and `recentRuns` is newest-first, so slice then reverse. */
  const recentRuns: NinaRunInput[] = allRuns
    .slice(-RECENT_RUN_LIMIT)
    .reverse()
    .map((run) => {
      const sessionInput = {
        runId: run.id,
        occurredOn: run.occurredOn,
        distanceM: run.distanceM,
        durationSec: run.durationSec,
        avgHrBpm: run.avgHr,
        splits: run.splits.map((s) => ({
          km: s.km,
          timeSec: s.timeSec,
          paceSec: s.paceSec,
          hr: s.hr,
          cadence: s.cadence,
          partial: s.partial,
        })),
        // `run_zones.zone` is a plain int in Postgres; F04's Zod schema enforces the 1..5 domain
        // on the way in, so this narrowing restates a guarantee rather than assuming one.
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
        /* R6 — HIS OWN WORDS. See the divergence note in `context.ts`. */
        note: run.note,
        metrics,
        flags: evaluateSessionFlags(metrics, sessionInput.splits.find((s) => !s.partial) ?? null),
      }
    })

  const records: StoredRecordInput[] = recordRows.map((row) => ({
    key: row.key,
    value: row.value,
    previousValue: row.previousValue,
    achievedOn: row.achievedOn,
    runId: row.runId,
  }))

  const awards: BadgeAward[] = badgeRows.map((row) => ({
    key: row.key,
    runId: row.runId,
    scopeKey: row.scopeKey,
    dedupeKey: row.dedupeKey,
    earnedOn: row.earnedOn,
    createdAt: row.createdAt,
    count: row.count,
  }))

  return buildNinaContext({
    now,
    fullName: identity.fullName,
    nickname: identity.nickname,
    profile,
    hrMax,
    recentRuns,
    records,
    badges: foldAwards(awards),
    slots,
    facts,
    messages: window.messages,
    olderMessageCount: window.olderCount,
    firedPatterns,
    nags,
    promptVersion: NINA_PROMPT_VERSION,
  })
}
