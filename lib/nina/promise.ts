import { addDays, daysBetween, type DateISO } from '@/lib/date/ranges'
import type {
  NinaPendingPromise,
  NinaPendingPromisesSlot,
  NinaPromiseReward,
} from '@/lib/db/schema'
import { ninaBand } from '@/lib/nina/tuning'

/**
 * Did she keep her promise? — F33 R19, the pure half.
 *
 * ── WHY THIS IS A PURE MODULE AND NOT A METHOD ON THE SWEEP ───────────────────────────────────
 * Invariant 6, and the brief's own list of edge cases: the condition's date is Jakarta time; "besok"
 * was already resolved to a concrete day when the promise was made; a run can be COMMITTED days
 * after it happened; a deadline can pass unfulfilled; and there can be two runs on the day. Every
 * one of those is a question about strings and numbers, and `vitest` is `environment: 'node'` —
 * so all of it lives here and `promises.ts` does nothing but fetch and write.
 *
 * ── EVERY DATE IS A JAKARTA CALENDAR DAY, AS A STRING ─────────────────────────────────────────
 * `runs.occurred_on` is a Postgres `date` read in string mode (roadmap D6), `promisedOn` /
 * `byDate` / `resolvedOn` are the same, and `lib/date/ranges.ts` owns every conversion. There is
 * no `Date` in this file's logic and no `new Date()` anywhere in it — a `Date` here would put the
 * server's UTC midnight between him and credit for an evening run.
 *
 * ── WHAT THIS FILE DOES NOT DECIDE ────────────────────────────────────────────────────────────
 * It never creates a promise (phase 5), never calls a generator (Step 7), never posts a message
 * (phase 10 announces — D-3), and never edits a promise's `text`, `condition`, `metric`, `target`,
 * `targetKey`, `byDate`, `promisedOn` or `sourceMessageId`. It reads those and writes only
 * `status`, `resolvedOn`, `jobId`, `firedOn`, `attempts` and — since R5 — `reward`.
 */

/**
 * How many times a met promise may ask for a photograph before it gives up.
 *
 * Three, with a one-Jakarta-day cooldown between attempts, so a promise that keeps hitting phase
 * 12's cap or a dead GitHub Actions runner is done inside four days rather than dispatching a job
 * every five minutes forever. Under RU-20 an attempt costs a `workflow_dispatch` and one of six
 * daily generations, which is exactly the resource a runaway retry would burn.
 */
export const PROMISE_MAX_ATTEMPTS = 3

/**
 * How long after a deadline a run may still arrive and count.
 *
 * **This exists because of `reviewed_at` (invariant 9).** A run only becomes visible to
 * `getRunsBetween` once the runner has reviewed its extraction, and he reviews on his own schedule
 * — the analysis records screenshots sitting unreviewed for a day or more. Expiring at midnight on
 * the deadline would mean a 10 km he really ran on the 4th, uploaded on the 5th and reviewed on the
 * 6th, silently failing a promise he kept. Two days is generous enough to cover that and short
 * enough that she is not still watching for a promise he has forgotten making.
 */
export const PROMISE_EXPIRY_GRACE_DAYS = 2

/**
 * How long an open-ended promise (`byDate: null`) waits before it expires.
 *
 * Sixty days, because an open-ended promise is a standing intention — *"kalau lo pecahin PR 10k,
 * gw ganti foto"* — and a two-month-old one she is still tracking is a friend who keeps score.
 */
export const PROMISE_OPEN_ENDED_TTL_DAYS = 60

/**
 * The reward a promise pays out, given the operator's `steamy` dial: at band **`high`** or above —
 * a score of 60 or more — she SENDS him the photograph instead of changing her profile picture.
 * Below that, nothing about the promise mechanism changes at all.
 *
 * ── THE THRESHOLD IS PHASE 1'S BAND, NOT A LOCAL CONSTANT ─────────────────────────────────────
 * Reconciled: the draft had `PROMISE_SELFIE_STEAMY_FLOOR = 60` here, which was *already* the band
 * edge (`NINA_BAND_WIDTH = 20`, so `high` starts at 60) — a private constant that agreed with the
 * shared one by coincidence. `/admin/nina` shows the operator the band name, so the band is the
 * only threshold he can actually see. `ninaBand` is imported from `./tuning`, which is zero-import
 * plain data; this module keeps its independence from the tuning TYPE by still taking the raw
 * number, and `ninaBand` never throws on anything, so garbage folds to band `off`.
 *
 * ── WHY THE DIAL AND NOT THE DISTILLER ────────────────────────────────────────────────────────
 * R5's exploit only works if turning the dial up changes the promises she is ALREADY tracking. A
 * reward frozen into each promise when it was made would apply only to promises made after the
 * slider moved, which is the opposite of what a slider is for. And the distiller's job is to record
 * what was said; which camera pays it out is the operator's decision, and the operator's decisions
 * live in the tuning row.
 */
export function promiseRewardFor(steamy: number): NinaPromiseReward {
  return ninaBand(steamy).index >= 3 ? 'selfie' : 'avatar'
}

/** One reviewed run, reduced to what a condition can be about. */
export interface PromiseRunFact {
  /** Jakarta calendar day, `'YYYY-MM-DD'`. */
  occurredOn: DateISO
  /** `runs.distance_m`. Metres, as stored — the conversion to km happens once, below. */
  distanceM: number
}

/** A record or badge he holds, and the day he took it. */
export interface PromiseEarnedMarker {
  key: string
  earnedOn: DateISO
}

/**
 * Everything reality has to say. Loaded by `promises.ts`; assembled from `getRunsBetween`,
 * `StoredRecord` and `StoredBadge`, none of which this file imports.
 */
export interface PromiseFacts {
  /** Reviewed runs covering the union of every open promise's window. Order irrelevant. */
  runs: readonly PromiseRunFact[]
  records: readonly PromiseEarnedMarker[]
  badges: readonly PromiseEarnedMarker[]
}

export interface PromiseEvalInput {
  todayISO: DateISO
  facts: PromiseFacts
  /**
   * **The landing test for an `'avatar'` reward (Stage B).** True when a `nina_avatars` row with
   * `source = 'generated'` was created on or after `dayISO`. Injected as a predicate rather than as
   * a row so this module stays free of the schema and so the test can pin it.
   *
   * Its one tolerance is stated in the plan: a *different* generated avatar landing the same day
   * settles this promise. The cost is a mis-attributed true event, not a false one.
   */
  avatarLandedOnOrAfter: (dayISO: DateISO) => boolean
  /**
   * **The landing test for a `'selfie'` reward (Stage B).** True when the photograph dispatched
   * under `jobId` has actually reached the conversation — a `nina_message_images` row whose
   * message carries `turn_id = jobId`.
   *
   * ── WHY THIS ONE IS EXACT AND THE AVATAR ONE IS NOT ───────────────────────────────────────────
   * A *generated avatar* essentially only ever comes from a promise or from an operator clicking
   * Generate, so a same-day match mis-attributes a true event at worst. Chat selfies are different:
   * `generate_image` is a tool she calls whenever he asks for a photo, up to six times a day. A
   * same-day match would let a selfie HE asked for settle a promise he had not kept — a false
   * event, not a mis-attributed true one. The worker already writes the job id into
   * `nina_messages.turn_id`, so the exact test costs the same single indexed read.
   *
   * **Optional, and absent means "no selfie has landed".** A caller that supplies no selfie port
   * can never settle a selfie promise: it waits, retries, and eventually expires. That is the safe
   * failure direction, and it is why this is an added port rather than a rename of the one above.
   */
  selfieLandedForJob?: (jobId: string) => boolean
}

/**
 * What to do with one promise. Five kinds, and only three of them write anything:
 *
 *   - `wait`    nothing at all. The common case, and the only one with no write.
 *   - `fire`    the condition is MET and no job is in flight: ask for a photograph.
 *   - `settle`  a job was fired and the photograph has landed: `status: 'met'`.
 *   - `retry`   a job was fired on an earlier day and nothing landed: clear `jobId` so a later
 *               sweep may fire again, if `attempts` allows.
 *   - `expire`  `status: 'expired'`. The deadline plus grace has passed unfulfilled, or the
 *               attempt ceiling is reached, or an open-ended promise has aged out.
 */
export type PromiseVerdictKind = 'wait' | 'fire' | 'settle' | 'retry' | 'expire'

export interface PromiseVerdict {
  id: string
  kind: PromiseVerdictKind
  /** For the log and for the test's failure message. Never shown to anyone. */
  reason: string
}

/** A verdict plus, for an accepted `fire`, the job the generator handed back. */
export interface PromiseDecision {
  verdict: PromiseVerdict
  /** The accepted job's id, or null when the generator refused. Ignored for every other kind. */
  jobId?: string | null
  /**
   * Which camera the sweep actually asked. Recorded on the entry by a `fire` so the settle test
   * reads a stable value; absent means `'avatar'`, which is what a caller that knows nothing about
   * rewards means. Ignored for every other kind.
   */
  reward?: NinaPromiseReward
}

export interface PromiseSlotResolution {
  /** The WHOLE slot, to be written back through `saveMemorySlot`. No entry is ever removed. */
  slot: NinaPendingPromisesSlot
  /** False when nothing changed, so the sweep can skip the write entirely. */
  changed: boolean
}

/** `attempts` is optional on the entry; absent means zero. */
function attemptsOf(promise: NinaPendingPromise): number {
  const raw = (promise as { attempts?: number }).attempts
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

/**
 * The dispatched job, or null. Exported because `promises.ts` needs it to decide whether the selfie
 * landing read is worth performing at all — a sweep with no fired selfie promise does no extra
 * read.
 */
export function promiseJobId(promise: NinaPendingPromise): string | null {
  const raw = (promise as { jobId?: string | null }).jobId
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * **Which camera this promise pays out with.** Absent, null, or anything that is not the string
 * `'selfie'` reads as `'avatar'` — so a promise written before R5 landed, and a promise
 * hand-edited in the memory editor, both behave exactly as they always did. Same defensive shape
 * as `attemptsOf`, and for the same reason: a slot is `jsonb` a human can edit, and a thrown error
 * here would stop the whole sweep over one bad row.
 */
export function promiseReward(promise: NinaPendingPromise): NinaPromiseReward {
  return (promise as { reward?: unknown }).reward === 'selfie' ? 'selfie' : 'avatar'
}

function firedOnOf(promise: NinaPendingPromise): DateISO | null {
  const raw = (promise as { firedOn?: string | null }).firedOn
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * The half-open day range a condition may be satisfied in, or null when the promise names no
 * window at all (which only `metric: 'free'` with `byDate: null` does).
 *
 * ── WHY `promisedOn` IS INCLUDED AND NOT EXCLUDED ─────────────────────────────────────────────
 * A run on the day of the promise counts. `occurred_on` is a calendar day and `started_at` is a
 * nullable `time`, so there is no reliable way to ask whether that run happened before or after
 * she spoke — and the far more common case is that the run under discussion IS the run she is
 * promising about (*"gw mau lari 10k hari ini na" / "kalo beneran, gw ganti foto"*). Refusing
 * credit for it would make her pedantic about the one run the conversation was about.
 *
 * ── WHY `byDate` IS A DEADLINE AND NOT AN EXACT DAY ───────────────────────────────────────────
 * Phase 1's field comment says *"Deadline, or NULL for open-ended"*, so that is what it is: the
 * window runs from `promisedOn` through `byDate` inclusive, which is why the exclusive end is
 * `byDate + 1`. "Besok" was already resolved to a concrete date when the promise was made (phase
 * 5), so an early finish satisfies it and there is nothing here that re-parses Indonesian.
 */
export function promiseWindow(
  promise: NinaPendingPromise,
  todayISO: DateISO,
): { startISO: DateISO; endExclusiveISO: DateISO } {
  const startISO = promise.promisedOn
  const lastISO = promise.byDate ?? todayISO
  /* A deadline before the promise was made is nonsense the distiller could still emit; treat the
   * window as the single promise day rather than as an empty or inverted range. */
  const endBase = lastISO < startISO ? startISO : lastISO
  return { startISO, endExclusiveISO: addDays(endBase, 1) }
}

function inWindow(
  dayISO: DateISO,
  window: { startISO: DateISO; endExclusiveISO: DateISO },
): boolean {
  return dayISO >= window.startISO && dayISO < window.endExclusiveISO
}

/**
 * Is the condition satisfied by what actually happened?
 *
 * ── TWO RUNS IN A DAY: `distance_km_total` SUMS, DELIBERATELY ─────────────────────────────────
 * Phase 3 hit the same question. The metric is named `distance_km_total`, and total is what it
 * means: a 12 km day made of a 7 km morning and a 5 km evening satisfies "kalo lo lari 10km". A
 * per-run threshold is a different metric and it would be phase 5's to coin, because phase 5 is
 * what decides which metric a sentence becomes. Being generous about HOW he got there is also
 * simply more in character than a friend auditing his split.
 *
 * ── `free` IS NEVER MET HERE ──────────────────────────────────────────────────────────────────
 * Phase 5's handoff is explicit: *"`metric: 'free'` promises cannot be decided by any field. Leave
 * them `'pending'`; she may ask him. That is what the escape hatch is for, and it is not a bug to
 * route into."* So `free` returns false and `evaluatePromise` never fires it. It can still
 * `expire`, but only on the calendar's authority — see the note there.
 */
export function conditionMet(promise: NinaPendingPromise, input: PromiseEvalInput): boolean {
  const window = promiseWindow(promise, input.todayISO)
  const runs = input.facts.runs.filter((run) => inWindow(run.occurredOn, window))

  switch (promise.metric) {
    case 'distance_km_total': {
      if (promise.target == null || !(promise.target > 0)) return false
      const km = runs.reduce((sum, run) => sum + run.distanceM, 0) / 1000
      /* A hair of tolerance: a 10.00 km promise met by a 9.9996 km GPS trace is met, and refusing
       * it over the fourth decimal of a distance he read off a watch is not a judgement anyone
       * would defend out loud. One metre. */
      return km + 0.001 >= promise.target
    }
    case 'run_count': {
      if (promise.target == null || !(promise.target > 0)) return false
      return runs.length >= promise.target
    }
    case 'record': {
      if (promise.targetKey == null) return false
      return input.facts.records.some(
        (marker) => marker.key === promise.targetKey && inWindow(marker.earnedOn, window),
      )
    }
    case 'badge': {
      if (promise.targetKey == null) return false
      return input.facts.badges.some(
        (marker) => marker.key === promise.targetKey && inWindow(marker.earnedOn, window),
      )
    }
    case 'free':
      return false
    default:
      /* An unknown metric from a hand-edited slot (phase 16) is not met, and is not an exception:
       * a thrown error here would stop the whole sweep over one bad row. */
      return false
  }
}

/**
 * Has the calendar run out on this promise?
 *
 * `byDate` plus `PROMISE_EXPIRY_GRACE_DAYS`, or `promisedOn` plus `PROMISE_OPEN_ENDED_TTL_DAYS`
 * when there is no deadline. **Applies to `free` too**, and that is not a contradiction of phase
 * 5's rule: phase 5 forbids DECIDING a free promise from a field, and a deadline that has passed
 * is not a field about the condition, it is the calendar. A free promise with no deadline never
 * expires here, which is phase 5's instruction taken literally and is bounded anyway by its
 * `MAX_PENDING_PROMISES` cap dropping resolved entries first.
 */
function deadlinePassed(promise: NinaPendingPromise, todayISO: DateISO): boolean {
  if (promise.byDate != null) {
    return todayISO > addDays(promise.byDate, PROMISE_EXPIRY_GRACE_DAYS)
  }
  if (promise.metric === 'free') return false
  return daysBetween(promise.promisedOn, todayISO) > PROMISE_OPEN_ENDED_TTL_DAYS
}

/**
 * **Has the reward this promise actually dispatched arrived?** One predicate per reward, chosen by
 * what the `fire` recorded — never by the operator's dial as it stands right now, because the dial
 * may have moved since the dispatch and the photograph that landed is the one that was asked for.
 *
 * A missing `selfieLandedForJob` returns false, so a caller that does not know about selfies cannot
 * settle one. A refused or failed generation lands nothing in either table, so it returns false as
 * well — which is the whole of "a failed generation can never consume a promise".
 */
function rewardLanded(
  promise: NinaPendingPromise,
  jobId: string,
  firedOn: DateISO | null,
  input: PromiseEvalInput,
): boolean {
  if (promiseReward(promise) === 'selfie') {
    return input.selfieLandedForJob?.(jobId) ?? false
  }
  return input.avatarLandedOnOrAfter(firedOn ?? promise.promisedOn)
}

/**
 * One promise, one verdict. The order of the branches IS the state machine, and it is the reason
 * a failed generation can never consume a promise: `settle` is reachable only through
 * `rewardLanded` — that is, only through `avatarLandedOnOrAfter` or `selfieLandedForJob` — and
 * nothing else in this function writes `status: 'met'`.
 *
 * R5 generalised the landing test from one reward to two and changed nothing else about that
 * property. A refused dispatch still returns a null `jobId` and never reaches Stage B; a generation
 * that fails in the worker still writes no `nina_avatars` row and no `nina_message_images` row, so
 * both predicates are false; and a selfie promise evaluated by a caller that supplies no selfie
 * port waits, retries and expires rather than settling. **Do not "simplify" this by settling on
 * `firedOn` alone.**
 */
export function evaluatePromise(
  promise: NinaPendingPromise,
  input: PromiseEvalInput,
): PromiseVerdict {
  const id = promise.id
  const { todayISO } = input

  /* Already resolved. Phase 5's cap ages it out; we never touch it again and never remove it. */
  if (promise.status !== 'pending') {
    return { id, kind: 'wait', reason: `already ${promise.status}` }
  }

  const jobId = promiseJobId(promise)
  const firedOn = firedOnOf(promise)
  const attempts = attemptsOf(promise)

  /* ── STAGE B: a job is on record ─────────────────────────────────────────────────────────── */
  if (jobId != null) {
    /* The photograph landed. This is the ONLY path to 'met'. */
    if (rewardLanded(promise, jobId, firedOn, input)) {
      return { id, kind: 'settle', reason: `${promiseReward(promise)} landed for job ${jobId}` }
    }
    /* Still the same Jakarta day: a GitHub Actions runner takes minutes (RU-20), so waiting is
     * the correct answer and re-firing would be the bug. */
    if (firedOn == null || firedOn >= todayISO) {
      return { id, kind: 'wait', reason: `job ${jobId} in flight` }
    }
    /* A day has passed with nothing to show. Out of attempts, this is over. */
    if (attempts >= PROMISE_MAX_ATTEMPTS) {
      return { id, kind: 'expire', reason: `${attempts} attempts, no ${promiseReward(promise)}` }
    }
    return { id, kind: 'retry', reason: `job ${jobId} produced nothing on ${firedOn}` }
  }

  /* ── STAGE A: nothing fired yet ──────────────────────────────────────────────────────────── */
  if (conditionMet(promise, input)) {
    if (attempts >= PROMISE_MAX_ATTEMPTS) {
      return { id, kind: 'expire', reason: `condition met but ${attempts} attempts spent` }
    }
    /* One attempt per Jakarta day, whether the last one was accepted or refused. This is the whole
     * of the cooldown: without it a five-minute cron would dispatch 288 jobs against a transport
     * error, and phase 12's cap of six a day is the resource that would pay for it. */
    if (firedOn != null && firedOn >= todayISO) {
      return { id, kind: 'wait', reason: `already attempted today (${attempts})` }
    }
    return { id, kind: 'fire', reason: 'condition met' }
  }

  /* Not met. The only remaining question is whether it still can be. */
  if (deadlinePassed(promise, todayISO)) {
    return { id, kind: 'expire', reason: 'deadline passed unfulfilled' }
  }
  return { id, kind: 'wait', reason: 'not met yet' }
}

/** Every promise, in slot order. */
export function evaluatePromises(
  promises: readonly NinaPendingPromise[],
  input: PromiseEvalInput,
): PromiseVerdict[] {
  return promises.map((promise) => evaluatePromise(promise, input))
}

/**
 * The slot, rewritten in place.
 *
 * ── PHASE 5'S FOUR RULES, HONOURED HERE AND NOWHERE ELSE ──────────────────────────────────────
 * *"set `status` and `resolvedOn` IN PLACE and write the whole slot back … Do not remove the
 * entry … carry the row's existing `source` through … `metric: 'free'` stays pending."* This
 * function never filters, never reorders and never touches an entry with no decision. `source`
 * lives on the ROW, not on the entry, so carrying it through is `promises.ts`'s job (Step 7) and
 * it is done there by reading it back out of `getNinaMemorySlot`.
 *
 * `changed` exists so the common sweep — every promise `wait` — performs no write at all. An
 * unconditional upsert would bump `updated_at` on `pending_promises` every five minutes, and phase
 * 2 renders `updatedAt` into her context, so she would see her promise list "change" constantly.
 */
export function resolvePromiseSlot(
  slot: NinaPendingPromisesSlot | null | undefined,
  decisions: readonly PromiseDecision[],
  todayISO: DateISO,
): PromiseSlotResolution {
  const current = slot?.promises ?? []
  const byId = new Map(decisions.map((d) => [d.verdict.id, d]))
  let changed = false

  const promises = current.map((promise) => {
    const decision = byId.get(promise.id)
    if (decision == null) return promise

    switch (decision.verdict.kind) {
      case 'wait':
        return promise
      case 'settle':
        changed = true
        return { ...promise, status: 'met' as const, resolvedOn: todayISO }
      case 'expire':
        changed = true
        return { ...promise, status: 'expired' as const, resolvedOn: todayISO }
      case 'fire':
        changed = true
        /* `reward` is recorded HERE and read by the next sweep's Stage B, so a dial that moves
         * between the dispatch and the landing cannot make the evaluator watch the wrong table.
         * A caller that names no reward means the avatar, which is what every caller meant before
         * R5. A `retry` leaves it alone; the next `fire` overwrites it with the current dial, which
         * is right — the operator changed their mind, so the payout follows. */
        return {
          ...promise,
          reward: decision.reward ?? 'avatar',
          jobId: decision.jobId ?? null,
          firedOn: todayISO,
          attempts: attemptsOf(promise) + 1,
        }
      case 'retry':
        changed = true
        /* `firedOn` is deliberately LEFT ALONE. Clearing the job is what lets a later sweep fire;
         * keeping the day is what stops that sweep being the very next one. */
        return { ...promise, jobId: null }
      default:
        return promise
    }
  })

  return { slot: { promises }, changed }
}
