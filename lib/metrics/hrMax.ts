import type { DateISO } from '@/lib/date/ranges'
import { getObservedMaxHrRun, getProfile } from '@/lib/db/queries'
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
   * Only set when `source === 'observed'`: the day the reading came from, for the "from your run
   * of X" attribution copy on the run detail page and /me.
   */
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

async function resolveFromProfile(
  userId: string,
  profile: Profile | null,
): Promise<HrMax | null> {
  if (profile?.maxHr != null) return { bpm: profile.maxHr, source: 'measured' }

  const estimated = profile?.birthYear != null ? tanakaEstimate(profile.birthYear) : null

  // ONE indexed query, never an N+1 and never a reduce in TypeScript. `minBpm` of 0 when there is
  // no birth year is deliberate: the runner's age is unknown, but a real watch reading is still
  // better than nothing.
  const observed = await getObservedMaxHrRun(userId, { minBpm: estimated ?? 0 })
  if (observed) {
    return {
      bpm: observed.maxHr,
      source: 'observed',
      observedOn: observed.occurredOn,
    }
  }

  if (estimated != null) return { bpm: estimated, source: 'estimated' }
  return null
}

/**
 * DOCUMENTED NON-GOAL, so it is not silently forgotten. Going from `observed` to `measured` — the
 * runner takes a lab test and types the result into `/me` — changes the *meaning* of the number
 * even when the bpm barely moves, and no UI announces it: the passive "your watch saw a new peak"
 * banner (F06 §4.5) was planned but never shipped, and its detection machinery
 * (`hrMaxTransitionAt` / `resolveHrMaxAsOf`) was removed on 2026-09-12 — the full contract lives
 * in the F02 plan archive and in git history if a future feature ever resurrects it. Profile
 * edits are rare and self-directed, so the runner already knows. The resolver supports announcing
 * a measured change for free if a later feature wants it: compare `resolveHrMax` before and after
 * the write.
 */
