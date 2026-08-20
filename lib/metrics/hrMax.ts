import type { DateISO } from '@/lib/date/ranges'
import { getObservedMaxHrRun, getPreviousReviewedRun, getProfile, getRun } from '@/lib/db/queries'
import type { Profile } from '@/lib/db/schema'
import { ageFromBirthYear } from './age'

/**
 * THE HRmax resolver. Roadmap §4.4: *"No feature may compute HRmax any other way."*
 *
 * Every metric, chart, flag and badge rule that needs a max heart rate calls this — never
 * `profiles.max_hr` or `runs.max_hr` directly, and never re-implements Tanaka inline. Get its
 * degradation right and every later feature is honest by construction; get it wrong and the
 * dishonesty is invisible until someone checks the math on a bad day.
 */

export type HrMaxSource = 'measured' | 'observed' | 'estimated'

export interface HrMax {
  bpm: number
  source: HrMaxSource
  /**
   * Only set when `source === 'observed'`: which run produced the reading, for the "your watch has
   * seen X bpm" copy and for §4.5's transition detection.
   */
  observedRunId?: string
  observedOn?: DateISO
}

/** Tanaka: 208 − 0.7 × age. The only formula in this app, and it lives in exactly one place. */
export function tanakaEstimate(birthYear: number, now: Date = new Date()): number {
  return Math.round(208 - 0.7 * ageFromBirthYear(birthYear, now))
}

/**
 * Resolution order (D11 — observed-first, never formula-first):
 *
 *   1. `profiles.max_hr`          -> 'measured'   the runner typed a real, measured number
 *   2. `MAX(runs.max_hr)`         -> 'observed'   only if it EXCEEDS the Tanaka estimate
 *   3. Tanaka 208 − 0.7 × age     -> 'estimated'  only if `birth_year` is set
 *   4. `null`                                     no birth year AND no qualifying observation
 *
 * **Returns `null`, not a fallback constant.** A hardcoded "assume 190" is a false claim: it makes
 * a %HRmax figure look authoritative when the app has zero evidence for it. Silence is more honest
 * than a wrong number that looks exactly like a right one. §4.6 of the plan enumerates what every
 * caller must do instead; the one thing no caller may do is substitute `220 − age`, `190`, or any
 * other constant.
 *
 * **Why step 2 compares rather than just existing.** "If any run recorded a max_hr, use it" is
 * wrong: a slipped strap or an easy run's low peak would clobber a better signal. Comparing the
 * observation against the *estimate* picks the more informative of two lower-bound-ish signals
 * instead of whichever number happened to load. Concretely, on the author's data Tanaka says 187
 * and the watch has recorded 189, so this returns `{ bpm: 189, source: 'observed' }` — and R-3
 * makes that ruling explicit: 91.5% against a demonstrated 189 is a truer statement than 92.5%
 * against a contradicted 187.
 *
 * **Why `measured` wins even when it is lower than `observed`.** A runner can measure a real max in
 * a controlled test that a training run never approached. A number a human typed is assumed
 * intentional until they change it; a stale self-report does not auto-upgrade to a fresher watch
 * reading. Deliberate asymmetry, documented so nobody "fixes" it.
 *
 * **No caching, deliberately.** This is two indexed queries — effectively free at 17 runs a month —
 * and it is called at most once per page render, per rollup, per badge evaluation. A request-scoped
 * cache would save a query count that is already 1, and this module has no request or session
 * boundary to key a cache on. If a future caller genuinely needs it in a hot loop (recomputing every
 * historical run's %HRmax after a profile edit, say), that caller resolves ONCE and reuses the
 * value across the loop. Do not "fix" this non-problem.
 */
export async function resolveHrMax(userId: string): Promise<HrMax | null> {
  const profile = await getProfile(userId)
  return resolveFromProfile(userId, profile)
}

/**
 * `resolveHrMax` as of a cutoff date — "what was true then". A thin wrapper, not a new algorithm:
 * the only difference is one more predicate on the observed-max query, so there is exactly one
 * place in the codebase that defines what HRmax resolution means.
 *
 * The Tanaka branch still uses the *current* wall clock rather than the runner's age on `asOf`.
 * That is deliberate: making the estimate drift with the cutoff would make `hrMaxTransitionAt`
 * fire on birthdays, reporting a rounding artefact as if the runner's physiology had changed.
 */
export async function resolveHrMaxAsOf(userId: string, asOf: DateISO): Promise<HrMax | null> {
  const profile = await getProfile(userId)
  return resolveFromProfile(userId, profile, asOf)
}

async function resolveFromProfile(
  userId: string,
  profile: Profile | null,
  asOf?: DateISO,
): Promise<HrMax | null> {
  if (profile?.maxHr != null) return { bpm: profile.maxHr, source: 'measured' }

  const estimated = profile?.birthYear != null ? tanakaEstimate(profile.birthYear) : null

  // ONE indexed query, never an N+1 and never a reduce in TypeScript. `minBpm` of 0 when there is
  // no birth year is deliberate: the runner's age is unknown, but a real watch reading is still
  // better than nothing.
  const observed = await getObservedMaxHrRun(userId, { minBpm: estimated ?? 0, asOf })
  if (observed) {
    return {
      bpm: observed.maxHr,
      source: 'observed',
      observedRunId: observed.runId,
      observedOn: observed.occurredOn,
    }
  }

  if (estimated != null) return { bpm: estimated, source: 'estimated' }
  return null
}

export interface HrMaxTransition {
  /** `null` when the previous run resolved to nothing at all — no birth year, no observation. */
  from: HrMax | null
  to: HrMax
}

/**
 * Did HRmax resolve differently for this run than it did for the one before it?
 *
 * D11 and roadmap §4.4 are explicit that when `observed` first overtakes `estimated`, **the runner
 * must be told**. A denominator that changes silently between two runs makes every historical
 * %HRmax figure incomparable without the reader knowing why: last month's 92% next to this month's
 * 89% reads as "effort went down", when the true story is "the denominator went up because the
 * watch saw a higher peak, and nothing about the effort changed."
 *
 * DETECTION, NOT STORAGE. There is no `hrmax_source_changed` table. This compares two resolutions
 * over data that already exists, and F06's run detail page calls it once per render — never in a
 * loop over history.
 *
 * The copy F06 renders, which names BOTH numbers on purpose:
 *
 *   > Your watch recorded 189 bpm on this run — higher than the 187 bpm your age predicts. Heart
 *   > rate percentages on this run, and going forward, now use 189 bpm. Earlier runs still show
 *   > the numbers calculated at the time.
 *
 * Saying only "we updated your max heart rate" would hide that a formula was overridden by a real
 * measurement, which is the single most trust-building thing this app can say to a runner with any
 * skepticism about algorithmic health claims. And nothing is retroactively rewritten:
 * `insights.facts_hash` already keys the narrative cache on the metrics fed in, so a recompute
 * produces a new hash and a new insight rather than silently editing what the app said at the time
 * (R-11 freezes `hrMaxUsed` / `hrMaxSource` into the payload for exactly this reason).
 *
 * The five statements below run sequentially rather than in a `Promise.all`. At two rows and an
 * index scan each the parallelism buys nothing measurable, and a deterministic statement order is
 * what lets the unit suite assert this function's SQL without a database.
 */
export async function hrMaxTransitionAt(
  userId: string,
  runId: string,
): Promise<HrMaxTransition | null> {
  const current = await getRun(userId, runId)
  if (!current) return null

  const previous = await getPreviousReviewedRun(userId, current.occurredOn)
  if (!previous) return null // the runner's first run — nothing to transition FROM

  const before = await resolveHrMaxAsOf(userId, previous.occurredOn)
  const after = await resolveHrMaxAsOf(userId, current.occurredOn)

  if (!after) return null
  // The overwhelmingly common case, and the reason this is cheap enough to call on every render.
  if (before?.source === after.source && before?.bpm === after.bpm) return null

  return { from: before, to: after }
}

/**
 * DOCUMENTED NON-GOAL, so it is not silently forgotten. Going from `observed` to `measured` — the
 * runner takes a lab test and types the result into `/me` — changes the *meaning* of the number
 * even when the bpm barely moves, and deserves the same announcement. F02 does not build that UI:
 * profile edits are rare and self-directed, unlike the passive "your watch saw a new peak" case
 * above, so the runner already knows. The resolver supports it for free if a later feature wants
 * it: compare `resolveHrMax` before and after the write.
 */
