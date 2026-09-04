import 'server-only'

import { addDays, jakartaDayOf, todayInJakarta, type DateISO } from '@/lib/date/ranges'
import { getBadgeAwards, getRecords, getRunsBetween } from '@/lib/db/queries'
import {
  NINA_SLOT_PENDING_PROMISES,
  type NinaMemorySource,
  type NinaPendingPromise,
  type NinaPendingPromisesSlot,
} from '@/lib/db/schema'
import { generateNinaAvatar } from './avatargen'
import {
  evaluatePromises,
  resolvePromiseSlot,
  type PromiseDecision,
  type PromiseEarnedMarker,
  type PromiseFacts,
  type PromiseVerdict,
} from './promise'
import { getCurrentNinaAvatar, getNinaMemorySlot, upsertNinaMemorySlot } from './queries'

/**
 * The promise sweep — F33 R19, the impure half.
 *
 * ── WHY THIS IS NOT IN A RENDER PATH, AND CANNOT BE ───────────────────────────────────────────
 * It calls a generator, which is a model call, which invariant 4 forbids anywhere a page renders.
 * Its one caller is phase 10's cron route (`app/api/cron/nina/route.ts`), which already runs
 * per-user on a schedule and already owns "notice something and make her speak". `/nina/about`
 * renders the album; it never evaluates a promise.
 *
 * ── WHY THE CRON AND NOT A POST-TURN HOOK ─────────────────────────────────────────────────────
 * A promise's deadline passes whether or not he opens the app, and the run that satisfies it is
 * committed on `/upload`, not on `/nina`. A post-turn hook would only ever notice a kept promise
 * during a conversation, which is the one moment she is least likely to be told about the run.
 * Phase 5 already owns the post-turn `after()`; adding a second consumer there would also make the
 * distillation and the sweep race for the same slot.
 *
 * ── WHY IT NEVER POSTS A MESSAGE ──────────────────────────────────────────────────────────────
 * D-3. `insertNinaAvatarAsCurrent` (called inside `generateNinaAvatar`) leaves `announced_at`
 * NULL, and that NULL is phase 10's `avatar_changed` trigger. One announcer, reached identically
 * by the promise path, the admin path and phase 14's CLI. So this module writes to exactly one
 * place: the `pending_promises` slot.
 *
 * ── WHY `source` IS READ BACK OUT AND WRITTEN BACK IN ─────────────────────────────────────────
 * Phase 5's handoff, verbatim: *"carry the row's existing `source` through, exactly as this
 * phase's merge does. If it says `'admin'`, write `'admin'` back … relabelling a human's row as
 * distilled is the one way to lose the R24 guarantee from your side."* `getNinaMemorySlot` returns
 * it, so it costs nothing, and `upsertNinaMemorySlot` takes it.
 */

/**
 * How long the sweep may spend. Under RU-20 a `fire` is a `workflow_dispatch` and returns in
 * hundreds of milliseconds, not the 78 s the generation itself takes, so twelve open promises
 * still fit comfortably inside phase 10's route budget of 60 s.
 */
export const NINA_PROMISE_SWEEP_BUDGET_MS = 20_000

/** Injected so the whole sweep is drivable from a test with no database and no network. */
export interface NinaPromiseDeps {
  readSlot: (userId: string) => Promise<{ value: unknown; source: NinaMemorySource } | null>
  writeSlot: (
    userId: string,
    input: { key: string; value: NinaPendingPromisesSlot; source: NinaMemorySource },
  ) => Promise<void>
  readRuns: (
    userId: string,
    startISO: DateISO,
    endExclusiveISO: DateISO,
  ) => Promise<ReadonlyArray<{ occurredOn: string; distanceM: number }>>
  readRecordMarkers: (userId: string) => Promise<PromiseEarnedMarker[]>
  readBadgeMarkers: (userId: string) => Promise<PromiseEarnedMarker[]>
  /** The current avatar, for the landing test. Null when there is none (D-2). */
  readCurrentAvatar: (userId: string) => Promise<{ source: string; createdAt: Date } | null>
  /**
   * The generator port. **Only `ok` and `jobId` are read**, deliberately: phase 12 is being
   * rewritten around GitHub Actions (RU-20) and this is the narrowest surface that survives it.
   * If its result gains or loses an `avatar` field, nothing here changes.
   */
  generateAvatar: (input: {
    userId: string
    scene: string
  }) => Promise<{ ok: boolean; jobId?: string | null }>
  now: () => Date
}

export interface NinaPromiseSweep {
  /** Every verdict, for the log. */
  verdicts: PromiseVerdict[]
  /** How many generations were dispatched. */
  fired: number
  /** How many promises reached `met`. */
  settled: number
  /** How many reached `expired`. */
  expired: number
  /** Whether the slot was written. False on the common no-op sweep. */
  wrote: boolean
}

export function productionPromiseDeps(): NinaPromiseDeps {
  return {
    readSlot: (userId) => getNinaMemorySlot(userId, NINA_SLOT_PENDING_PROMISES),
    writeSlot: (userId, input) => upsertNinaMemorySlot(userId, input),
    readRuns: (userId, startISO, endExclusiveISO) =>
      getRunsBetween(userId, startISO, endExclusiveISO),
    /* `records.achieved_on` is the day of the RUN that holds the key, which is exactly what a
     * promise about breaking a record is about. `getRecords` is the reviewed-gated read
     * (invariant 9); this phase writes no SQL. */
    readRecordMarkers: async (userId) =>
      (await getRecords(userId)).map((row) => ({ key: row.key, earnedOn: row.achievedOn })),
    /* Raw award rows, not `foldAwards`: a folded `StoredBadge` reports only the LATEST earn day,
     * and a promise about a badge he has earned before needs the award that lands INSIDE the
     * window. One row per award is what `badges` stores and what this needs. */
    readBadgeMarkers: async (userId) =>
      (await getBadgeAwards(userId)).map((row) => ({ key: row.key, earnedOn: row.earnedOn })),
    readCurrentAvatar: (userId) => getCurrentNinaAvatar(userId),
    generateAvatar: async ({ userId, scene }) => {
      const result = await generateNinaAvatar({ userId, scene, source: 'generated' })
      /* `NinaAvatarResult` carries `jobId` on BOTH branches as phase 12 shipped it, so the
       * structural cast this plan wrote against an unlanded module is no longer needed — and a
       * cast that asserts less than the type knows is worse than none. Still only `ok` and
       * `jobId` are read, which is the narrow surface the port exists for. */
      return { ok: result.ok, jobId: result.jobId }
    },
    now: () => new Date(),
  }
}

/** A slot value that is not the shape we expect is an empty slot, never an exception. */
function parseSlot(value: unknown): NinaPendingPromisesSlot {
  if (value == null || typeof value !== 'object') return { promises: [] }
  const promises = (value as { promises?: unknown }).promises
  if (!Array.isArray(promises)) return { promises: [] }
  return {
    promises: promises.filter((p): p is NinaPendingPromise => p != null && typeof p === 'object'),
  }
}

/**
 * One read per fact family, over the UNION of every open promise's window.
 *
 * A per-promise query would be up to twelve round trips for twelve promises; the union is one
 * indexed range scan on `(user_id, occurred_on)`. `conditionMet` re-filters per promise, so
 * over-fetching is free and under-fetching is the only failure mode there is.
 */
export async function loadPromiseFacts(
  userId: string,
  promises: readonly NinaPendingPromise[],
  todayISO: DateISO,
  deps: NinaPromiseDeps,
): Promise<PromiseFacts> {
  const open = promises.filter((promise) => promise.status === 'pending')
  if (open.length === 0) return { runs: [], records: [], badges: [] }

  let startISO = todayISO
  let lastISO = todayISO
  for (const promise of open) {
    if (promise.promisedOn < startISO) startISO = promise.promisedOn
    const end = promise.byDate ?? todayISO
    if (end > lastISO) lastISO = end
  }

  const [runs, records, badges] = await Promise.all([
    deps.readRuns(userId, startISO, addDays(lastISO, 1)),
    deps.readRecordMarkers(userId),
    deps.readBadgeMarkers(userId),
  ])

  return {
    runs: runs.map((run) => ({ occurredOn: run.occurredOn, distanceM: run.distanceM })),
    records,
    badges,
  }
}

/**
 * The whole of R19's mechanism, in one idempotent call.
 *
 * **Idempotent** is the property that matters: phase 10's cron runs every five minutes, and a
 * second call inside the same Jakarta day fires nothing new, settles nothing twice and writes
 * nothing when no verdict changed. That is what makes "consumed exactly once" true of the system
 * and not merely of one code path.
 */
export async function resolveNinaPromises(
  userId: string,
  deps: NinaPromiseDeps = productionPromiseDeps(),
): Promise<NinaPromiseSweep> {
  const empty: NinaPromiseSweep = {
    verdicts: [],
    fired: 0,
    settled: 0,
    expired: 0,
    wrote: false,
  }

  const row = await deps.readSlot(userId)
  if (row == null) return empty

  const slot = parseSlot(row.value)
  if (slot.promises.length === 0) return empty

  const now = deps.now()
  const todayISO = todayInJakarta(now)

  const [facts, avatar] = await Promise.all([
    loadPromiseFacts(userId, slot.promises, todayISO, deps),
    deps.readCurrentAvatar(userId),
  ])

  /*
   * THE LANDING TEST. A generated avatar created on or after the day the job was fired means the
   * photograph arrived — which under RU-20 happened in a GitHub Actions runner, minutes later, in
   * a process that knew nothing about promises. Its one tolerance (a different generated avatar
   * landing the same day) is argued in the plan and costs a mis-attribution of a true event.
   *
   * `source !== 'generated'` is what keeps an ADMIN upload (phase 15) or an OPERATOR push (phase
   * 14) from settling a promise she never took a photograph for.
   */
  const avatarLandedOnOrAfter = (dayISO: DateISO): boolean => {
    if (avatar == null || avatar.source !== 'generated') return false
    return jakartaDayOf(avatar.createdAt) >= dayISO
  }

  const verdicts = evaluatePromises(slot.promises, {
    todayISO,
    facts,
    avatarLandedOnOrAfter,
  })

  const byId = new Map(slot.promises.map((promise) => [promise.id, promise]))
  const decisions: PromiseDecision[] = []
  let fired = 0

  const deadline = now.getTime() + NINA_PROMISE_SWEEP_BUDGET_MS

  for (const verdict of verdicts) {
    if (verdict.kind !== 'fire') {
      decisions.push({ verdict })
      continue
    }

    /* Out of budget: leave it entirely alone. A `fire` recorded without a dispatch would burn an
     * attempt for a job that was never asked for. */
    if (Date.now() > deadline) {
      decisions.push({ verdict: { ...verdict, kind: 'wait', reason: 'sweep budget spent' } })
      continue
    }

    const promise = byId.get(verdict.id)
    if (promise == null) {
      decisions.push({ verdict })
      continue
    }

    /*
     * The scene is HER promise in her own words plus his condition — the two display-ready strings
     * phase 5 already distilled. It becomes `nina_avatars.description` verbatim (phase 12's
     * `NinaAvatarRequest.scene` says so), which is precisely what R25 then reads back out of the
     * row to invent a story about. No prompt engineering happens here: phase 12 owns
     * `buildNinaImagePrompt` and phase 2 owns `NINA_APPEARANCE`.
     */
    const scene = `${promise.text} (${promise.condition})`

    /* `generateNinaAvatar` never throws — phase 12's stated guarantee. The catch is belt and
     * braces: an unexpected throw must degrade to "refused", never to a half-written slot. */
    let outcome: { ok: boolean; jobId?: string | null }
    try {
      outcome = await deps.generateAvatar({ userId, scene })
    } catch (error) {
      console.warn('[nina] promise generation threw', { promiseId: promise.id, error })
      outcome = { ok: false, jobId: null }
    }

    if (outcome.ok) fired += 1
    decisions.push({ verdict, jobId: outcome.ok ? (outcome.jobId ?? null) : null })
  }

  const resolution = resolvePromiseSlot(slot, decisions, todayISO)

  if (resolution.changed) {
    /* Phase 5's rule: the WHOLE slot, and the row's own `source`. */
    await deps.writeSlot(userId, {
      key: NINA_SLOT_PENDING_PROMISES,
      value: resolution.slot,
      source: row.source,
    })
  }

  const applied = decisions.map((decision) => decision.verdict)
  return {
    verdicts: applied,
    fired,
    settled: applied.filter((v) => v.kind === 'settle').length,
    expired: applied.filter((v) => v.kind === 'expire').length,
    wrote: resolution.changed,
  }
}
