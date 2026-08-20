# F02 — Auth, profile & onboarding

**Depends on:** F01 (Next 16 scaffold, `lib/env.ts` core group, Tailwind, Vercel project — auth
env vars are reserved there behind a lazy accessor, following `expense-tracking/lib/env.ts`).
F02 also specifies the `profiles` table shape for F03 to migrate (F02 does not own DDL).
**Unblocks:** F04 (extraction needs `requireUserId()`), F05 (review screen), F06 (run detail
shows HRmax provenance), F07 (`lib/metrics` calls `resolveHrMax()`), F08 (narrative reads the
profile), F09/F10 (rollups + badges call `resolveHrMax()` for zone-relative rules).
**Contract sections this plan is bound by:** roadmap §3 (pinned versions), §4.1 (env vars),
§4.3 (the `profiles` columns — F02 specifies the read/write surface, F03 writes the migration),
§4.4 (the HRmax resolver — F02 owns this function entirely), §4.8 (routes: `/onboarding`, `/me`,
protection list), §7 of `IMPLEMENTATION_PLAN.md` (onboarding fields and skippability), D8
(any Google account, per-`user_id` scoping), D11 (observed-first HRmax), D15 (no weight-based
coaching claims).

---

## 0. What this feature is, in one paragraph

Google-only sign-in via Auth.js v5, ported from `expense-tracking` with the same JWT-session /
Drizzle-adapter split that made `requireUserId()` a zero-round-trip cookie decrypt there. On top
of that, F02 owns the **`profiles`** table's read/write surface (birth year, height, weight,
resting HR, measured max HR), a one-time skippable `/onboarding` flow, a `/me` profile-edit
surface, and — the part that outlives this feature file the moment it ships —
**`lib/metrics/hrMax.ts`**, the single function every later feature calls to answer "what is
this runner's max heart rate, and how confident are we." Every zone percentage, every
`%HRmax` figure, every `VERY_HIGH_AVG_HR` flag, and every badge that references heart rate
(`redlineRepublic`, `newCeiling`) traces back to this one resolver. Get its degradation right
and every later feature is honest by construction; get it wrong and the dishonesty is invisible
until someone checks the math on a bad day.

---

## 1. The security invariant (unchanged from expense-tracking, restated for this app)

> **INVARIANT A — Ownership scoping.**
> D8: any Google account may sign in, no allowlist. The only thing separating runner A's data
> from runner B's is that **every read and write is filtered by `user_id`**.
>
> 1. Every Server Action's first statement is `const userId = await requireUserId()`.
> 2. Every query against `profiles`, `runs`, and every run-child table carries `user_id` (or,
>    for a child table, a join back to `runs` filtered by `runs.user_id`) in its `WHERE`.
> 3. `profiles.user_id` is the table's **primary key**, not a foreign-keyed row with its own
>    id — there is exactly one profile per user, so "does this profile belong to me" is
>    structurally the same question as "is this the row keyed by my own id." There is no id to
>    guess.
> 4. `proxy.ts` is a convenience redirect, not the security boundary (same lesson
>    expense-tracking's reconciliation R-5 already paid for). `requireUserId()` is.
>
> **INVARIANT B — the public exception.**
> `/s/[token]` (F09/F10) reads a *run*, never a profile. A shared run detail page must render
> without touching `profiles` at all, or must resolve HRmax through a **snapshot stored on the
> run/insight at creation time**, never a live profile lookup — a stranger with a share link
> must not be able to see whether the runner filled in their weight. §6.3 pins this down.

F03 owns query-level enforcement on `profiles`' physical columns; F02 owns the identity that
enforcement is keyed on, and every function in this file assumes `requireUserId()` already ran.

---

## 2. Auth: port expense-tracking's shape as-is

Nothing about auth changes between the two apps — same provider, same session strategy, same
split-config reasoning, same env var names (roadmap §4.1 matches expense-tracking §4.8
verbatim for the `AUTH_*` block). Port these five files with only cosmetic changes (route names,
app title, redirect targets):

| expense-tracking source | run-insights destination | Change |
|---|---|---|
| `auth.config.ts` | `auth.config.ts` | Google provider block identical. `pages.signIn` stays `'/'` if `/` is the sign-in landing (confirm against F01/F11's route plan — see Task 1). |
| `auth.ts` | `auth.ts` | Table names come from F03's `lib/db/schema.ts`: `users`, `accounts`, `sessions`, `verificationTokens`. Call `authEnv()` at module scope here, same as expense-tracking's R-64 fix — do not wait for a "Task 4" style deferred edit; write it correctly the first time. |
| `proxy.ts` | `proxy.ts` | **Positive matcher differs — see §2.1.** |
| `lib/auth/requireUserId.ts` | `lib/auth/requireUserId.ts` | Copy verbatim. `getUserId`, `requireUserId`, `requireUserIdApi`, `UnauthorizedError`, `unauthorizedJson` — no changes needed, the contract is identical. |
| `lib/auth/actions.ts` + `lib/auth/safeNext.ts` | same paths | Copy verbatim. The open-redirect guard and the `'use server'`-must-be-async split (R-63 in expense-tracking) apply unchanged. |
| `types/next-auth.d.ts` | same path | Copy verbatim — `session.user.id: string` augmentation. |

**Do not re-derive the JWT-vs-database tradeoff from scratch.** It is not app-specific: the
argument ("`requireUserId()` runs on every action; a stateless cookie makes that free; we have
no product requirement for server-side revocation") holds for a personal running app at least as
well as it does for an expense tracker with sharing. Reuse it; cite it; do not relitigate it.

### 2.1 What differs from the expense-tracking proxy: the matcher

Roadmap §4.8's route table, translated into protected vs. public:

```ts
// proxy.ts
export const config = {
  // Protected — every route that reads or writes user-scoped data.
  matcher: [
    '/upload',
    '/r/:path*',        // NOTE: /r/[id] AND /r/[id]/review both match this prefix
    '/trends',
    '/me',
    '/onboarding',
  ],
}
```

```
NOT matched: /                sign-in landing (or the runs list, if F01/F11 route it there —
                               see Task 1's open question)
NOT matched: /s/:token*        public share pages — INVARIANT B. Never add this.
NOT matched: /api/auth/*       the sign-in flow itself
NOT matched: /api/cron/*       guarded by CRON_SECRET, not a session (F04/F09 own this)
```

`/r/:path*` covers both `/r/[id]` and `/r/[id]/review` in one line — same trick expense-tracking
used for `/m/:path*`. One route that must NOT be swept into this matcher: `/api/extract/[id]`
poll endpoint (F04) is a Route Handler, not a page — it authenticates via `requireUserIdApi()`,
not the proxy, exactly per INVARIANT A point 4.

### 2.2 The sign-in / landing page question F02 must resolve, not defer

Roadmap §4.8 lists `/` with no annotation, unlike `/onboarding` which is explicitly "first
login only." Two candidate shapes:

- **(a)** `/` is always the sign-in/marketing page (expense-tracking's shape); signed-in users
  are redirected to `/` → wherever the runs list lives.
- **(b)** `/` *is* the runs list (roadmap §4.8's first line: "runs list, newest first, grouped
  by week"), and it renders a sign-in prompt in place of the list when signed out.

**Decision for F02: (b).** The roadmap's route table names `/` as the runs list, not as a
sign-in page — unlike expense-tracking, where `/` was reserved for `(bare)` marketing content.
F02 ships:

```
app/page.tsx        -- signed out: sign-in prompt (structure ported from expense-tracking's
                        app/(bare)/page.tsx). signed in + onboarded_at IS NULL: redirect to
                        /onboarding. signed in + onboarded: render <RunsList/> (F09's component;
                        F02 renders a placeholder "No runs yet — upload one" until F09 lands).
```

This makes `/` a **conditional boundary that only F02 can own**, because it is the one place
that must check both "signed in" and "onboarded" before deciding what to render. F09 replaces
the placeholder body; it must not touch the auth/onboarding gate above it.

---

## 3. Store `birth_year`, never `age` — and why this is not a stylistic choice

**The bug this avoids:** an app that stores `age: 30` on 2026-08-20 is *correct on that date and
wrong on every other date it is read.* The author turns 31 within the year. If `age` is a stored
column, either (a) nobody updates it and every HRmax estimate from that day forward silently
uses last year's age, quietly making Tanaka's already-imperfect estimate *more* wrong for no
reason, or (b) something has to remember to update it, which means a cron job or a login-time
side effect whose only job is to fix a bug that storing the right thing in the first place would
have made impossible.

**`birth_year` is stable.** It does not need updating, ever, and "how old are you *right now*"
becomes a pure function of `birth_year` and the wall clock:

```ts
// lib/metrics/age.ts
import { TZDate } from '@date-fns/tz'   // or the project's existing Asia/Jakarta helper —
                                          // reuse whatever F01/F03 already exports from
                                          // lib/format.ts (roadmap §4.6 pattern) rather than
                                          // adding a second date library.

/**
 * Age in whole years, evaluated against "today" in Asia/Jakarta (roadmap §4.6 — the app has
 * one timezone). Deliberately takes `now` as a parameter, defaulted to `new Date()`, so
 * lib/metrics tests can pin a date without mocking global time.
 */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  // Whole-year subtraction is enough: onboarding asks for a YEAR, not a birthdate, so there
  // is no month/day to compare against. This intentionally cannot be more precise than the
  // input — asking for a birth year and then pretending to compute exact age would be false
  // precision.
  const currentYear = now.getFullYear()
  return currentYear - birthYear
}
```

**Onboarding asks for age, in the UI, because "how old are you" is what a human types.** It
converts to `birth_year` at the boundary and never round-trips back: `birth_year = currentYear -
enteredAge`. This means the moment the app crosses a birthday, the displayed age (if ever shown)
recomputes correctly with zero writes, and the HRmax estimate recomputes correctly right along
with it. The column the schema stores and the value the UI collects are deliberately not the
same shape — that conversion happens in exactly one place (`lib/profile/schema.ts`, §5) so it
can be tested once instead of trusted at every call site.

---

## 4. `lib/metrics/hrMax.ts` — the single HRmax resolver

### 4.1 Why this file gets the most design attention in this plan

Roadmap §4.4 states the order — measured → observed → estimated → null — as a two-line comment.
That comment is correct and also incomplete as an implementation spec: it does not say how
"observed" queries without scanning every run on every call, what the caller does with `null`,
how a rising observed max gets *announced* rather than silently swapped in, or how a shared
page (INVARIANT B) resolves HRmax without leaking a stranger's profile. All four are answered
below because every one of F06–F10 depends on this file being right once rather than each
re-deriving a piece of it.

### 4.2 Exact signature

```ts
// lib/metrics/hrMax.ts
import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { profiles, runs } from '@/lib/db/schema'
import { ageFromBirthYear } from './age'

export type HrMaxSource = 'measured' | 'observed' | 'estimated'

export interface HrMax {
  bpm: number
  source: HrMaxSource
  /** Only set when source === 'observed': which run produced it, for the "your watch has
   *  seen X" UI copy and for detecting a NEW observed max (§4.5). */
  observedRunId?: string
  observedOn?: string // ISO date, runs.occurred_on
}

/**
 * THE HRmax resolver. Roadmap §4.4: "No feature may compute HRmax any other way." Every
 * metric, chart, flag, and badge rule that needs a max heart rate calls this — never
 * `profiles.max_hr` or `runs.max_hr` directly, and never re-implements Tanaka inline.
 *
 * Resolution order (D11 — observed-first, never formula-first):
 *   1. profiles.max_hr           -> 'measured'   (the runner typed a real number)
 *   2. MAX(runs.max_hr)          -> 'observed'   (only if it EXCEEDS the Tanaka estimate —
 *                                                  see §4.4 for why the comparison, not just
 *                                                  "if it exists", is load-bearing)
 *   3. Tanaka 208 - 0.7*age      -> 'estimated'  (only if birth_year is set)
 *   4. null                      -- no birth_year AND no qualifying observed max. The caller
 *                                    must degrade honestly (§4.6), never substitute a default.
 *
 * Returns null, not a fallback constant. A hardcoded "assume 190" is a false claim: it would
 * make a %HRmax figure look authoritative when the app has zero evidence for it. Silence is
 * more honest than a wrong number that looks exactly like a right one.
 */
export async function resolveHrMax(userId: string): Promise<HrMax | null> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  })

  if (profile?.maxHr != null) {
    return { bpm: profile.maxHr, source: 'measured' }
  }

  const estimated = profile?.birthYear != null
    ? Math.round(208 - 0.7 * ageFromBirthYear(profile.birthYear))
    : null

  // §4.3: ONE indexed query, never N+1. Only fetch the single highest observed max, and only
  // pull the columns the caller needs to attribute it.
  const observed = await db.query.runs.findFirst({
    columns: { id: true, maxHr: true, occurredOn: true },
    where: and(eq(runs.userId, userId), gt(runs.maxHr, estimated ?? 0)),
    orderBy: [desc(runs.maxHr)],
  })

  if (observed?.maxHr != null) {
    return {
      bpm: observed.maxHr,
      source: 'observed',
      observedRunId: observed.id,
      observedOn: observed.occurredOn,
    }
  }

  if (estimated != null) {
    return { bpm: estimated, source: 'estimated' }
  }

  return null
}
```

### 4.3 The "observed" query, without an N+1

The naive version — `SELECT MAX(runs.max_hr)` then a second query to find *which* run holds
that max — is two round trips and still doesn't let you compare against the estimate in SQL.
The version above does it in **one indexed query**:

```sql
-- Conceptually what Drizzle emits:
SELECT id, max_hr, occurred_on
FROM runs
WHERE user_id = $1 AND max_hr > $2   -- $2 = the Tanaka estimate, or 0 if no birth_year
ORDER BY max_hr DESC
LIMIT 1
```

This needs `runs (user_id, max_hr)` as a composite index — **F02 requests this from F03** (see
§7, "What F02 needs from F03's migration"). Roadmap §4.3 already indexes `(user_id, occurred_on
DESC)` for the runs list; this is a second, separate index for a different access pattern and
must not be conflated with it. At the fixture's scale (17 runs/month) this is free either way,
but the query shape is correct regardless of scale, which is the point — a resolver called from
every run detail page, every rollup, and every badge evaluation must not become the thing that
makes `/trends` slow once a user has three years of history.

**Never loop over runs in application code to find a max.** If a future feature needs "the
three highest observed max-HR runs" or similar, extend this query (`LIMIT 3`) rather than
fetching all runs and reducing in TypeScript — the whole reason this file exists is to be the
one place that gets the query right so nobody re-derives it badly under deadline pressure.

### 4.4 Why "observed" must beat the *estimate*, not just exist

A tempting simplification: "if any run recorded a max_hr, that's the observed value — use it."
That is wrong. Apple Watch HR readings have noise; a single spurious low-teens spike or a strap
that slipped could theoretically produce a max_hr reading that is *lower* than a runner's true
max. Comparing observed against the *estimate* rather than unconditionally preferring it isn't
about distrust of the watch (the opposite, in fact — §4.5 shows the watch was right and Tanaka
was wrong) — it's about picking the more *informative* of two lower-bound-ish signals rather
than an arbitrary "always prefer whichever number happened to load."

Concretely, on the author's data: Tanaka estimates 187. The watch has recorded 189. 189 > 187,
so `resolveHrMax` returns `{ bpm: 189, source: 'observed' }`. If a future run recorded, say, 180
(a genuinely easy run with a low peak), that 180 does **not** overwrite anything — the query's
`ORDER BY max_hr DESC LIMIT 1` always surfaces the highest qualifying observation, and "highest
ever, filtered to exceed the formula" is exactly the resolution rule roadmap §4.4 specifies.

### 4.5 The moment "observed" first overtakes "estimated" — design it, don't let it happen silently

This is D11 and roadmap §4.1's central worked example, and the roadmap is explicit: **"tell the
runner."** A denominator that silently changes between two runs makes every historical `%HRmax`
figure incomparable without the reader knowing why — someone glancing at last month's 92% and
this month's 89% would reasonably read "effort went down," when the true story is "the
denominator went up because the watch saw a higher peak, and nothing about the effort changed."

**Detection, not storage.** F02 does not add a `hrmax_source_changed` table. It detects the
transition at read time by comparing the *previous* resolution to the *current* one, using data
that already exists:

```ts
// lib/metrics/hrMax.ts (continued)

/**
 * Did resolving HRmax for `runId`'s occurred_on date use a DIFFERENT source/value than
 * resolving it as of the PREVIOUS run? Called once, when F06 renders a run detail page, never
 * in a loop over history.
 *
 * Implementation: re-run the resolver with a `asOf` cutoff (the run's own occurred_on) against
 * the run immediately before it, and diff. This reuses resolveHrMax's own query rather than a
 * bespoke comparison, so there is exactly one place that defines "what HRmax was true then."
 */
export async function hrMaxTransitionAt(
  userId: string,
  runId: string,
): Promise<{ from: HrMax; to: HrMax } | null> {
  const current = await db.query.runs.findFirst({ where: eq(runs.id, runId) })
  if (!current) return null

  const previous = await db.query.runs.findFirst({
    where: and(eq(runs.userId, userId), lt(runs.occurredOn, current.occurredOn)),
    orderBy: [desc(runs.occurredOn)],
  })
  if (!previous) return null // this is the runner's first run — nothing to transition FROM

  const [asOfPrevious, asOfCurrent] = await Promise.all([
    resolveHrMaxAsOf(userId, previous.occurredOn),
    resolveHrMaxAsOf(userId, current.occurredOn),
  ])

  if (!asOfCurrent) return null
  if (asOfPrevious?.source === asOfCurrent.source && asOfPrevious?.bpm === asOfCurrent.bpm) {
    return null // no change — the overwhelmingly common case, resolved in two cheap queries
  }
  return { from: asOfPrevious ?? { bpm: 0, source: 'estimated' }, to: asOfCurrent }
}
```

`resolveHrMaxAsOf` is `resolveHrMax` with an added `runs.occurredOn <= cutoff` predicate — a
thin wrapper, not a new algorithm; F02 factors the shared logic into one internal function
parameterised by an optional cutoff date rather than duplicating the query.

**The UI moment (F06's run detail page owns the rendering; F02 specifies what it renders):**
a one-line banner, shown once, on the specific run whose analysis first used the new value:

> *Your watch recorded 189 bpm on this run — higher than the 187 bpm your age predicts. Heart
> rate percentages on this run, and going forward, now use 189 bpm. Earlier runs still show the
> numbers calculated at the time.*

Two things this copy deliberately does:
- It **does not retroactively rewrite older insights**. `insights.facts_hash` (roadmap §4.3)
  already keys the narrative cache on the metrics fed in; a metrics recompute after a new
  observed max naturally produces a new hash and a new insight next time that scope is viewed,
  without F02 needing to invalidate anything explicitly. Old cached insights simply stop being
  regenerated with stale numbers going forward — they are not silently rewritten in place,
  which would misrepresent what the app told the runner *at the time*.
- It **names both numbers**. Saying only "we updated your max heart rate" hides the fact that a
  formula was overridden by a real measurement, which is the single most trust-building thing
  this app can say to a runner who has any skepticism about algorithmic health claims.

### 4.6 What every caller must do when `resolveHrMax` returns `null`

This is the enforcement half of D11's promise: a resolver that can return `null` is only honest
if every caller actually branches on it instead of assuming a number.

| Caller | With `null` |
|---|---|
| `lib/metrics/session.ts` (`avgHrPctMax`, F07) | Omit the field entirely from the metrics object — not `0`, not `undefined` silently coerced to `NaN` in a template string. The Zod schema for session metrics marks it optional; omission is the schema's only valid encoding of "unknowable." |
| `VERY_HIGH_AVG_HR` flag (F07) | Does not fire. A flag that needs a denominator it doesn't have must not fire using some other denominator instead — that would report a made-up thing as observed fact. |
| Run detail chart, zone bar (F06) | Render zones by raw bpm, unlabelled by percentage. Show a one-line inline prompt: "Add your age or a max heart rate in your profile to see this run in %HRmax." — a call to action, not an error state. |
| Narrative prompt (F08) | The metrics JSON handed to glm-5.3 simply does not contain a `hrMaxPct` key. Roadmap §5's rule ("every number stated must appear verbatim in the supplied JSON") already forbids the model inventing one — omission at the source is what makes that rule enforceable rather than aspirational. |
| Badges referencing HR zones (`redlineRepublic`, `newCeiling`, F09) | Do not evaluate; a badge earned from an unknowable zone is not truthfully earned. `newCeiling` specifically only fires when `resolveHrMax` returns `source: 'observed'` **and** `hrMaxTransitionAt` reports a change — see §4.5. |
| `/s/[token]` share page (F10, INVARIANT B) | Never calls `resolveHrMax` live. See §6.3. |

**The one thing no caller may do:** substitute `220 - age`, `190`, or any other constant when
this returns `null`. That is precisely the "silently substitute a default" roadmap §7 forbids.

### 4.7 Caching

`resolveHrMax` is two indexed queries — cheap enough (at 17 runs/month, effectively free) that
**F02 does not add a cache layer for it.** The temptation to memoize per-request is real but
premature: this function is already called at most once per page render (run detail, rollup,
badge evaluation each call it exactly once, not per-split or per-metric), so a request-scoped
cache would save a query count that is already 1. If a future feature calls it in a genuine hot
loop (e.g., recomputing every historical run's %HRmax after a profile edit — see §6.2), that
caller should fetch the profile and the observed-max query **once** and reuse the resolved
`HrMax` value across the loop, rather than this file growing memoization it cannot itself scope
correctly (it has no request or session boundary to key a cache on). Document this decision
inline in the file so a future contributor doesn't "fix" a non-problem.

### 4.8 Unit tests (`lib/metrics/hrMax.test.ts`)

Against the canonical fixture profile (birth year for a 30-year-old as of 2026-08-20 → 1996)
and the real run's observed max of 189:

1. `profiles.max_hr = 172` set → returns `{ bpm: 172, source: 'measured' }` regardless of any
   observed run data (measured always wins, even if lower than observed — a runner can measure
   a real max in a controlled test that a training run never approached).
2. No `max_hr`, `birth_year = 1996`, one run with `max_hr = 189` → estimate is 187, 189 > 187 →
   returns `{ bpm: 189, source: 'observed', observedRunId, observedOn }`.
3. Same profile, a run with `max_hr = 180` (below the 187 estimate) → returns
   `{ bpm: 187, source: 'estimated' }` — the lower observation must not win.
4. No `max_hr`, `birth_year = 1996`, zero runs → `{ bpm: 187, source: 'estimated' }`.
5. No `max_hr`, no `birth_year`, zero qualifying runs → `null`.
6. No `max_hr`, no `birth_year`, but a run with `max_hr = 189` exists → returns
   `{ bpm: 189, source: 'observed' }` — §4.2's `gt(runs.maxHr, estimated ?? 0)` means an
   unset estimate compares against `0`, so any real observed max qualifies. This is
   deliberate: birth year is unknown, but a real watch reading is still better than nothing.
7. `hrMaxTransitionAt` on the run that produced the 189 observation → non-null, `from.source ===
   'estimated'`, `to.source === 'observed'`, `to.bpm === 189`.
8. `hrMaxTransitionAt` on any run before or after that one (no change) → `null`.
9. `hrMaxTransitionAt` on a runner's very first run → `null` (nothing to transition from).

---

## 5. Onboarding: fields, Zod schemas, skippability

### 5.1 Fields (`IMPLEMENTATION_PLAN.md` §7)

| Field | Collected as | Stored as | Required? |
|---|---|---|---|
| Age | integer years, a number input | `birth_year = currentYear - age` | optional |
| Height | integer cm | `height_cm` | optional |
| Weight | one decimal, kg | `weight_kg numeric(4,1)` | optional |
| Resting HR | integer bpm | `resting_hr` | optional, explicitly de-emphasised in copy |
| Measured max HR | integer bpm | `max_hr` | optional, explicitly de-emphasised in copy |

**Every field is optional — there is no submit-blocking validation that requires a value,
only format validation on values actually entered.** This is the mechanism behind "onboarding
is skippable": skipping is not a separate code path, it's the normal path with every field left
blank.

### 5.2 Zod schemas (`lib/profile/schema.ts`)

```ts
import { z } from 'zod'

const currentYear = () => new Date().getFullYear()

/**
 * What the onboarding FORM collects. Age, not birth year — a human types "I'm 30", not
 * "I was born in 1996". The conversion to birth_year happens once, at the Server Action
 * boundary (§5.3), never inside a component and never round-tripped back into a form.
 */
export const onboardingFormSchema = z.object({
  age: z.coerce.number().int().min(10).max(100).optional(),
  heightCm: z.coerce.number().int().min(100).max(250).optional(),
  weightKg: z.coerce.number().min(20).max(300).multipleOf(0.1).optional(),
  restingHr: z.coerce.number().int().min(30).max(120).optional(),
  maxHr: z.coerce.number().int().min(100).max(230).optional(),
})
export type OnboardingFormInput = z.infer<typeof onboardingFormSchema>

/**
 * What lib/db writes to `profiles`. birth_year replaces age; everything else passes through.
 * This is the ONLY place `age -> birth_year` conversion happens (§3).
 */
export const profileWriteSchema = z.object({
  birthYear: z.number().int().min(currentYear() - 100).max(currentYear() - 10).nullable(),
  heightCm: z.number().int().min(100).max(250).nullable(),
  weightKg: z.number().min(20).max(300).multipleOf(0.1).nullable(),
  restingHr: z.number().int().min(30).max(120).nullable(),
  maxHr: z.number().int().min(100).max(230).nullable(),
})
export type ProfileWrite = z.infer<typeof profileWriteSchema>

/**
 * Converts a validated onboarding (or profile-edit) form into the DB write shape. Pure
 * function, unit-tested — this is the single conversion point roadmap §3 depends on.
 */
export function toProfileWrite(input: OnboardingFormInput, now: Date = new Date()): ProfileWrite {
  return {
    birthYear: input.age != null ? now.getFullYear() - input.age : null,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    restingHr: input.restingHr ?? null,
    maxHr: input.maxHr ?? null,
  }
}
```

**Why `maxHr`'s upper bound is 230, not something tighter:** the field is explicitly *measured*
(roadmap §4.3: "MEASURED only. Never write an estimate here.") — a lab VO2max test or a hard
interval session can genuinely produce values in the low 200s for young athletes. The bound
exists to catch fat-fingering ("1890" instead of "189"), not to second-guess a real reading.

**Sanity, not cross-field coaching:** `restingHr < maxHr` is a reasonable format check to add at
the schema level (`.refine()`), but resist the temptation to add anything that looks like
advice here (e.g. flagging "that resting HR looks high") — Zod schemas in this file validate
*shape*, not fitness. Coaching commentary belongs to F08's narrative layer, working from stored
values, never to the profile form.

### 5.3 The onboarding Server Action

```ts
// lib/profile/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { onboardingFormSchema, toProfileWrite } from './schema'

export async function saveOnboardingAction(formData: FormData) {
  const userId = await requireUserId() // ALWAYS FIRST — INVARIANT A

  const raw = Object.fromEntries(formData)
  // Empty strings from unfilled optional fields must become `undefined`, not `NaN` — FormData
  // gives you "" for a blank number input, and z.coerce.number() on "" throws.
  const cleaned = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === '' ? undefined : v]),
  )
  const parsed = onboardingFormSchema.safeParse(cleaned)
  if (!parsed.success) return { error: 'Some values look off — check the numbers.' }

  const write = toProfileWrite(parsed.data)

  await db
    .insert(profiles)
    .values({ userId, ...write, onboardedAt: new Date() })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { ...write, onboardedAt: new Date(), updatedAt: new Date() },
    })

  revalidatePath('/')
  revalidatePath('/me')
}

/** Bound to the "Skip for now" button — a request with every field empty. */
export async function skipOnboardingAction() {
  const userId = await requireUserId()
  // onboarded_at is set with every column left NULL. This is not a special code path — it's
  // saveOnboardingAction's normal behaviour on an empty form, exposed as its own affordance so
  // "skip" doesn't require the user to tab through five blank fields to find a submit button.
  await db
    .insert(profiles)
    .values({ userId, onboardedAt: new Date() })
    .onConflictDoUpdate({ target: profiles.userId, set: { onboardedAt: new Date() } })
  revalidatePath('/')
}
```

`onboarded_at` is what `/` (§2.2) checks to decide whether to redirect to `/onboarding`. It is
set on *both* a filled-in and a skipped form — "onboarded" means "made a decision about
onboarding," not "filled in every field." A later profile edit (§6) never touches
`onboarded_at`; only the onboarding flow itself sets it, and only once meaningfully (the
`onConflictDoUpdate` re-sets it on a second visit to `/onboarding` only because Next may render
that route again if the user navigates back — it is idempotent, not re-triggerable in a way that
matters).

### 5.4 The onboarding page

`app/onboarding/page.tsx` — a single form, all fields optional, in the order age → height →
weight → (visually de-emphasised divider) → resting HR → measured max HR. One line of
explanation per the roadmap: *"This calibrates your heart-rate zones and effort estimates. All
optional — skip anything you don't know."* A "Skip for now" link/button posts
`skipOnboardingAction`; the primary submit posts `saveOnboardingAction`. Both redirect to `/`
on success (Next's default Server Action behavior with `revalidatePath` — no explicit
`redirect()` needed since `/` will now see `onboarded_at` set on next render).

---

## 6. Profile editing and the degradation matrix

### 6.1 `/me` — profile editing (roadmap §4.8: "profile: totals, records, badge shelf")

F02 owns only the *profile editing* slice of `/me`; totals/records/badges are F09/F10's
components rendered alongside it. F02 ships:

```
app/me/page.tsx           -- reads the profile, renders <ProfileForm/> pre-filled, plus
                              placeholders for the sections F09/F10 will fill in
components/profile/ProfileForm.tsx
lib/profile/actions.ts    -- adds updateProfileAction, same schema as onboarding, no
                              onboarded_at side effect (it's already set)
```

`ProfileForm` renders **age**, not birth year, converting back via `ageFromBirthYear` for
display — the same one-way relationship as onboarding, just read instead of write. It never
lets a user edit "age" as a persisted field; every submit re-derives `birth_year` fresh from
whatever age is currently typed, so editing the form twice in the same year is idempotent and
editing it a year later correctly shifts the stored birth year only if the user retypes a
now-different age (which they would, since the form always shows the *current*, correctly
computed age — nothing goes stale).

### 6.2 Editing max HR after an "observed" value has been showing

If a runner has been seeing `source: 'observed'` at 189, and later measures a real max of, say,
195 in a lab test, and types 195 into `/me`, `resolveHrMax` immediately returns `{ bpm: 195,
source: 'measured' }` on the very next call — no migration, no backfill, because §4.7 already
established the resolver is cheap enough to just re-run. **This is also a second, subtler
transition worth the same §4.5 treatment**: going from `observed` to `measured` changes the
*meaning* of the number even when the bpm is close, and a future enhancement could extend
`hrMaxTransitionAt` to fire on a `measured` write too (comparing against whatever the resolver
returned immediately before the edit). F02 does not build this UI now — profile edits are rare
and self-directed, unlike the passive "watch recorded a new peak" case §4.5 targets — but the
resolver's design already supports it for free; note it in the file as a documented non-goal
rather than silently forgetting it.

### 6.3 Never a live profile lookup on the public share page (INVARIANT B)

`/s/[token]` (F10) must render a run's analysis to a stranger without exposing whether the
runner filled in their age, height, weight, or measured max HR — none of that is the stranger's
business, and a live `resolveHrMax(userId)` call from a route that takes no session would also
be a second, unguarded read path into `profiles`, undermining INVARIANT A's "every read is
scoped" rule by construction (the route has no `userId` to scope with — it has a `token`).

**F02's requirement on F10:** the shared page must render from **already-computed, stored
values** — the `insights.payload` JSON and the run's own `avg_hr` / `max_hr` columns — never
by calling `resolveHrMax` at share-view time. If `insights.payload` carries a `%HRmax` figure,
it was computed once, server-side, at insight-generation time, by a session-scoped call to
`resolveHrMax`, and the HRmax `source` label travels with it into the stored JSON. This is a
constraint F02 hands to F10, not code F02 writes — flagged here because getting it wrong is a
privacy leak, not a display bug.

### 6.4 The degradation matrix

What is lost at each level of missing onboarding data. Read top-to-bottom as strictly additive
loss — each row loses everything the row above it lost, plus one more thing.

| Data present | HRmax resolves to | What works | What is lost |
|---|---|---|---|
| Nothing at all | `null` (unless a run's `max_hr` alone exceeds 0 — see §4.8 test 6) | Distance, pace, duration, cadence, elevation, splits, zone *durations* by raw bpm, non-HR badges (`half_ish`, `century_club`, `groundhog_day`, `tourist`, etc.), non-HR flags (`POSITIVE_SPLIT`, `CADENCE_FADE`) | Every `%HRmax` figure, `VERY_HIGH_AVG_HR` flag, HR-zone-relative badges (`redline_republic`, `sandbagger`, `new_ceiling`, `warmup_who`), any narrative sentence referencing effort-relative-to-max |
| + `birth_year` only | `estimated` (Tanaka), clearly labelled | Everything above, plus `%HRmax`, `VERY_HIGH_AVG_HR`, zone-relative badges — all computed against a labelled *estimate* | The "estimated" label is mandatory everywhere it's shown (roadmap §7); an unlabelled estimate is treated as a bug, not a missing-feature |
| + a run with `max_hr` exceeding the Tanaka estimate | `observed`, sourced from that run | Same set as above, now against a real measurement instead of a formula; §4.5's transition banner fires once | Nothing new lost — this is a strict upgrade in confidence, not a tradeoff |
| + `profiles.max_hr` (measured) | `measured` | Same set, now against the runner's own entered number, immune to being overtaken by a single spurious high reading (though see §6.2 for what happens if a later watch reading legitimately exceeds it — **`measured` always wins regardless**, per §4.2; a stale self-reported number does not auto-upgrade to a fresher watch reading, which is a deliberate asymmetry: a number the runner typed is assumed intentional until they change it) | — |
| + `height_cm`, `weight_kg` | (no effect on HRmax) | BMI-adjacent calorie sanity-checks only (F07); nothing coaching-facing | **Never a coaching claim of any kind** (D15) — weight never appears in narrative prose, never gates a badge, never appears in a flag. If a future metric wants "kcal per kg," treat that as a private sanity check in `lib/metrics`, not a rendered figure. |
| + `resting_hr` | (no effect on HRmax; feeds HRR only) | Heart-rate-reserve-based metrics if F07 chooses to add them (roadmap §4 leaves HRR optional and not yet in the flag list) | Nothing HRmax-related |

**The one row that is not "loses a feature" but "loses honesty if done wrong":** the null row.
An app that has *no* signal for HRmax must show *no* HRmax-derived number — not a number
computed against a hardcoded 190, not a number computed against "average adult," nothing. §4.6
is the enforcement mechanism; this row is the acceptance criterion.

---

## 7. What F02 needs from F03's migration

F02 does not write DDL (F03 owns it), but specifies the exact shape needed, matching roadmap
§4.3 verbatim plus one addition:

```
profiles
  user_id      text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
  birth_year   int NULL
  height_cm    int NULL
  weight_kg    numeric(4,1) NULL
  resting_hr   int NULL
  max_hr       int NULL          -- MEASURED only, never an estimate
  onboarded_at timestamptz NULL
  updated_at   timestamptz NOT NULL DEFAULT now()
```

Plus, for `lib/metrics/hrMax.ts` §4.3's query:

```sql
CREATE INDEX runs_user_id_max_hr_idx ON runs (user_id, max_hr DESC);
```

This is additive to roadmap §4.3's `runs` table, not a replacement for its existing
`(user_id, occurred_on DESC)` index — the two serve different access patterns (chronological
listing vs. max-seeking) and both should exist. Call this out explicitly in the F03 hand-off so
it isn't dropped as a perceived duplicate of the existing index.

---

## 8. File inventory

| Path | Purpose |
|---|---|
| `auth.config.ts` | Edge-safe Auth.js config — ported from expense-tracking, Google provider only |
| `auth.ts` | Node-runtime Auth.js instance with Drizzle adapter, `authEnv()` call at module scope |
| `app/api/auth/[...nextauth]/route.ts` | Re-exports `handlers` |
| `proxy.ts` | Route protection — matcher per §2.1 |
| `lib/auth/requireUserId.ts` | Ported verbatim |
| `lib/auth/actions.ts`, `lib/auth/safeNext.ts` | Ported verbatim |
| `types/next-auth.d.ts` | `session.user.id: string` augmentation |
| `lib/metrics/age.ts` | `ageFromBirthYear()` |
| `lib/metrics/hrMax.ts` | `resolveHrMax()`, `hrMaxTransitionAt()`, `resolveHrMaxAsOf()` — §4 |
| `lib/metrics/hrMax.test.ts` | The nine cases in §4.8 |
| `lib/profile/schema.ts` | `onboardingFormSchema`, `profileWriteSchema`, `toProfileWrite()` |
| `lib/profile/actions.ts` | `saveOnboardingAction`, `skipOnboardingAction`, `updateProfileAction` |
| `app/onboarding/page.tsx` | The onboarding form |
| `app/me/page.tsx` | Profile display + edit (totals/records/badges are F09/F10 slots) |
| `components/profile/ProfileForm.tsx` | Shared by onboarding and `/me`, parameterised by mode |
| `app/page.tsx` | `/` — sign-in prompt / onboarding redirect / runs-list placeholder, §2.2 |
| `components/auth/SignOutButton.tsx`, `AccountMenu.tsx` | Ported verbatim |

---

## 9. Task breakdown

1. **Preconditions.** Confirm F01 landed `lib/env.ts` core group, `tsconfig.json` `@/*` alias,
   and F03 landed `db`, `users/accounts/sessions/verificationTokens`, and a `profiles` table
   matching §7 (including the new index). If `profiles` isn't there yet, stop and hand F03 §7
   rather than inlining ad hoc SQL.
2. Extend `lib/env.ts` with the `AUTH_*` group (`authEnv()` accessor), matching roadmap §4.1
   names exactly. Reuse expense-tracking's Zod shape.
3. Port `auth.config.ts`, `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`
   from expense-tracking. Update table names/paths only.
4. Port `lib/auth/requireUserId.ts`, `lib/auth/actions.ts`, `lib/auth/safeNext.ts` verbatim.
5. Write `proxy.ts` with the matcher from §2.1. Verify no DB code lands in the proxy bundle
   (same `.next/server/middleware*` grep check expense-tracking used).
6. Write `lib/metrics/age.ts` + `ageFromBirthYear` test.
7. Write `lib/metrics/hrMax.ts` per §4.2–§4.5, plus `lib/metrics/hrMax.test.ts` per §4.8. This
   task blocks on F03's `profiles` + `runs` schema and the new index existing, even against an
   empty table — write the tests against a seeded test DB or Drizzle's in-memory/pg-mem harness
   per whatever F01/F03 set up for `lib/metrics` testing generally.
8. Write `lib/profile/schema.ts` (§5.2) with its own unit tests: age↔birth_year round trip for
   at least three ages, empty-form → all-null write, out-of-range values rejected.
9. Write `lib/profile/actions.ts`: `saveOnboardingAction`, `skipOnboardingAction`,
   `updateProfileAction`. Each opens with `requireUserId()`.
10. Build `app/onboarding/page.tsx` + `ProfileForm` (onboarding mode: empty, "Skip" visible).
11. Build `app/me/page.tsx` + `ProfileForm` (edit mode: pre-filled, no "Skip", shows current
    HRmax source inline via `resolveHrMax()` so a runner can see *why* a number is what it is
    without visiting a run detail page).
12. Build `app/page.tsx` per §2.2's three-way branch (signed out / not onboarded / onboarded).
13. Port `components/auth/SignOutButton.tsx`, `AccountMenu.tsx`.
14. Hand off to F06: the §4.5 transition-banner copy and the `hrMaxTransitionAt` contract, so
    the run detail page can call it without re-deriving the comparison logic.
15. Build gate: `tsc --noEmit`, lint, `next build`, confirm the proxy bundle stays DB-free,
    confirm `research/score.mjs` (unrelated to F02 but shares the CI job) is untouched.

---

## 10. Verification

```bash
cd /home/miftah/run-insights

# Env
node -e "require('./lib/env.ts')" 2>&1 | grep -q AUTH && echo "auth env wired"

# Auth handshake
npm run dev &
sleep 4
curl -s http://localhost:3000/api/auth/providers | grep -q '"google"' && echo "google provider live"
curl -s http://localhost:3000/api/auth/session   # expect: null, signed out

# Route protection — every one of these should 307 to / when signed out
for p in /upload /trends /me /onboarding /r/abc123; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$p")
  echo "$p -> $code"   # expect 307 (or whatever Next reports for a redirect via curl -I)
done
# And this one must NOT redirect:
curl -s -o /dev/null -w '/s/faketoken -> %{http_code}\n' http://localhost:3000/s/faketoken

# Proxy bundle stays DB-free
grep -rl 'drizzle-orm\|@neondatabase' .next/server/middleware* .next/server/chunks/*root-of-the-server* 2>/dev/null | head
# expect: no output

# Unit tests
npx vitest run lib/metrics/hrMax.test.ts lib/metrics/age.test.ts lib/profile/schema.test.ts
```

**Manual walk (needs a real Google account + a seeded run with `max_hr = 189`):**

1. Sign in fresh → land on `/onboarding` (not `/`).
2. Click "Skip for now" → land on `/` → confirm `profiles.onboarded_at` is set, every other
   column NULL.
3. Visit `/me` → confirm every field renders empty, no HRmax section shows a number, and the
   copy explains why ("add your age or a measured max heart rate to see effort as %HRmax").
4. Edit `/me`: enter age 30 (→ `birth_year` should be `2026 - 30 = 1996`), leave the rest blank.
   Save. Reload `/me` → age field shows `30` again (round trip through `ageFromBirthYear`).
5. With the seeded run's `max_hr = 189` present, call `resolveHrMax` (via a debug route or the
   run detail page once F06 exists) → expect `{ bpm: 189, source: 'observed' }`, since Tanaka
   at age 30 gives 187 and 189 exceeds it.
6. Enter a measured `max_hr = 172` in `/me` (deliberately lower than the observed 189) → confirm
   `resolveHrMax` now returns `{ bpm: 172, source: 'measured' }` — measured wins even when
   lower, per §4.2/§6.2's documented asymmetry.

---

## Contract deltas

None. This plan implements roadmap §4.4 and §4.3's `profiles` shape as written, and §4.8's
route list as written. The two points that needed a decision the roadmap left implicit —
whether `/` is a marketing page or the runs list (§2.2), and the additional `runs (user_id,
max_hr DESC)` index needed to make §4.4's resolver query non-degenerate (§7) — are both
**additive clarifications, not changes**: neither contradicts anything roadmap §4 states, and
both were already the only reading consistent with §4.8's literal route table and §4.4's literal
resolution order, respectively. Flagging them here so F03 and F09 don't have to re-derive the
same reasoning independently.
