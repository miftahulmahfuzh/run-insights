import { daysBetween, type DateISO } from '@/lib/date/ranges'
import type { FiredPattern, NagState } from '@/lib/nina/context'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  RU-9, second half: **"records what she has already said so the third time escalates instead
 *  of repeating."** This is the whole difference between a friend and a nagging alarm clock.
 *
 *  `patterns.ts` decides that something KEPT happening. This decides what to do about the fact
 *  that she has mentioned it before — and, just as importantly, that she should stop mentioning it
 *  once he fixes it. A pattern with no ledger produces the same sentence every morning forever,
 *  which is how a runner learns to ignore his best friend.
 *
 *  Nothing here writes prose. `persona.ts`'s `ANGER_LADDER` (phase 2) maps a level to a tone; this
 *  module produces the integer, and she is handed it rather than choosing a mood. That is what
 *  stops rung 4 from becoming her personality.
 *
 *  ── ONE CLOCK, AND IT IS "DAYS SINCE SHE LAST SAID IT" ──────────────────────────────────────
 *  `nina_nags.last_mentioned_on` is the only time input. Compliance is read THROUGH it rather
 *  than measured separately, and the two coincide by construction: a pattern that is still firing
 *  gets raised on the first turn past the cooldown, so its `last_mentioned_on` keeps moving and it
 *  never decays; a pattern he has fixed stops firing, so she stops raising it, so the date stops
 *  moving and the level walks back down. One column, one clock, and no second table recording
 *  compliance that could disagree with the first.
 *
 *  The honest limitation: a long silence from Nina cools a still-live pattern. Phase 10's cron
 *  runs daily, so the case needs an eleven-day outage to appear, and the cost when it does is one
 *  rung of anger — which is the direction to be wrong in.
 *
 *  **No SQL here either.** Phase 1 owns `getNinaNags` / `upsertNinaNag`; phase 10 owns the call
 *  sites. A `server-only` import in this file would put the thresholds a human argues with in the
 *  same module as a query, which is exactly the split invariant 6 exists to prevent.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The rules, as data, for the same reason `PATTERN_THRESHOLDS` is data: a reader checks them
 * against this plan without reading a branch. Both day counts are compared **strictly**.
 */
export const NAG_RULES = {
  /**
   * The ledger's ceiling. `ANGER_LADDER` saturates at nagLevel 3 ("shouting"), so levels 3 and 4
   * sound identical — the cap exists so the integer cannot grow unbounded over years of the same
   * habit, not to add a sixth rung.
   */
  maxLevel: 4,
  /**
   * She will not raise the same code again inside this many days. **Strict**: on day 3 exactly she
   * is still silent; on day 4 she speaks. Three days is the smallest gap at which "udah gw bilang"
   * is a memory rather than a repetition — at one day it is the same conversation.
   */
  cooldownDays: 3,
  /**
   * Every full run of more than this many quiet days drops one level. **Strict**: at day 10 the
   * level holds, at day 11 it falls by one. Ten days is long enough that two or three runs have
   * happened without the pattern firing, which is the smallest thing that deserves to be called
   * a change of behaviour.
   */
  decayDays: 10,
} as const

export const MAX_NAG_LEVEL = NAG_RULES.maxLevel

/** Why a decision came out the way it did. Logged by phase 10; never shown to the model. */
export type NagReason =
  /** No ledger row at all — she has never raised this. */
  | 'first_time'
  /** Raised before, cooldown is past, the level goes up. */
  | 'escalated'
  /** Raised before, and already at `maxLevel`. She still speaks; she cannot get angrier. */
  | 'capped'
  /** Raised inside `cooldownDays`. She stays quiet about it this turn. */
  | 'cooldown'

export interface NagDecision {
  code: string
  /**
   * How many times she has ALREADY raised this, after decay — the number that goes into
   * `buildNinaContext`'s `nags` and drives the anger ladder. 0 means "she is about to raise it for
   * the first time", which the ladder renders as rung 1 and not rung 0.
   */
  level: number
  /** Whether she may raise it at all this turn. False means the cooldown is still running. */
  shouldRaise: boolean
  /**
   * The row to persist — **only if she actually raised it.** Writing this when `shouldRaise` is
   * false would restart the cooldown on a sentence she never said.
   */
  next: NagState
  reason: NagReason
}

/** A ledger row's `level`, defended against a hand-edited or stale integer. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.max(0, Math.min(NAG_RULES.maxLevel, Math.trunc(level)))
}

/**
 * The stored level walked back down by however long she has been quiet.
 *
 * `Math.floor(elapsed / decayDays)` steps, gated by `elapsed > decayDays` so day 10 exactly does
 * not decay. The gate makes the first step 11 days and every later step 10, which is a deliberate
 * asymmetry: it keeps the boundary test readable ("10 does not decay, 11 does") and the function
 * monotone, and a decay schedule of 11/21/31/41 days is not meaningfully different from
 * 10/20/30/40 to a runner.
 *
 * Pure, and a function of the **stored** row only. **Never feed it its own output.** The decay is
 * anchored on `lastMentionedOn`, which the projection deliberately preserves so phase 2's
 * `daysSinceLastMentioned` stays truthful — which means re-projecting a projection decays a second
 * time from the same anchor. Read the row, decay it once, hand it to the context builder, and
 * never write the decayed level back to `nina_nags`: the stored level is the count of times she
 * said it, and only `decideNag`'s `next` may change it.
 *
 * A null `lastMentionedOn` never decays: it means the row exists but no date was recorded, and
 * inventing elapsed time from that would silently forgive a habit.
 */
export function decayedNagLevel(state: NagState | null, asOf: DateISO): number {
  if (state == null) return 0
  const level = clampLevel(state.level)
  if (level <= 0 || state.lastMentionedOn == null) return level

  const elapsed = daysBetween(state.lastMentionedOn, asOf)
  if (elapsed <= NAG_RULES.decayDays) return level

  return Math.max(0, level - Math.floor(elapsed / NAG_RULES.decayDays))
}

/**
 * Every ledger row, decayed. **This is what phase 10 hands to `buildNinaContext` as `nags`** —
 * never the raw rows, or she shouts about a habit he fixed a month ago.
 *
 * `lastMentionedOn` is preserved unchanged so phase 2's `daysSinceLastMentioned` stays truthful:
 * the level cooled, but the date she said it is still the date she said it.
 */
export function applyDecay(states: readonly NagState[], asOf: DateISO): NagState[] {
  return states.map((state) => ({
    code: state.code,
    level: decayedNagLevel(state, asOf),
    lastMentionedOn: state.lastMentionedOn,
  }))
}

/**
 * One code's verdict. `state` is the row as stored — this applies the decay itself, so a caller
 * cannot forget to.
 */
export function decideNag(code: string, state: NagState | null, asOf: DateISO): NagDecision {
  const level = decayedNagLevel(state, asOf)
  const elapsed =
    state == null || state.lastMentionedOn == null ? null : daysBetween(state.lastMentionedOn, asOf)
  const shouldRaise = elapsed == null || elapsed > NAG_RULES.cooldownDays
  const raisedLevel = Math.min(level + 1, NAG_RULES.maxLevel)

  const reason: NagReason = !shouldRaise
    ? 'cooldown'
    : state == null
      ? 'first_time'
      : level >= NAG_RULES.maxLevel
        ? 'capped'
        : 'escalated'

  return {
    code,
    level,
    shouldRaise,
    next: { code, level: raisedLevel, lastMentionedOn: asOf },
    reason,
  }
}

/**
 * The whole set, in the order `evaluatePatterns` returned them.
 *
 * `states` may hold rows for codes that did not fire; those are simply not decided about. Missing
 * rows are `null`, which `decideNag` reads as `first_time`.
 */
export function decideNags(
  patterns: readonly FiredPattern[],
  states: readonly NagState[],
  asOf: DateISO,
): NagDecision[] {
  const byCode = new Map<string, NagState>(states.map((s) => [s.code, s]))
  return patterns.map((p) => decideNag(p.code, byCode.get(p.code) ?? null, asOf))
}
