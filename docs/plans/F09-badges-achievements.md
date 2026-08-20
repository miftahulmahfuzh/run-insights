# F09 — Badges, achievements & profile

**Depends on:** F06 (`lib/metrics/*` — session metrics, flags, and `lib/records/*` — the
full-recompute record set F09 reads rather than re-derives), F03 (the `badges`, `records`,
`runs`, `run_splits`, `run_zones` tables and every query against them), F02 (`resolveHrMax()`,
though F09 only touches it indirectly — see §6).
**Unblocks:** F10 (badge art — `gen_badge_art.py` refuses to start unless its key set equals
`BADGE_KEYS` here; the catalog is the interface, not a suggestion), F11 (a shared run may render
`long_way_home` / `new_ceiling` inline — F09 exposes a pure `badgesForRun()` read for that).
**Contract sections this plan is bound by:** roadmap D1 (review-only evaluation), D12 (badge art
is offline, F09 never generates images), §4.3 (`badges` and `records` DDL — F09 does not alter
either), §4.5 (record keys, read-only from F09's side), §4.6 (**the 20-key catalog — see §11,
no deltas**), §4.8 (`/me` route), §4.9 (fires-test + non-fires-test per badge, fixture-based).
**Does not own:** badge artwork (F10), the metrics themselves (`lib/metrics/*`, F06), HRmax
resolution (`lib/metrics/hrMax.ts`, F02).

---

## 0. What this feature is, in one paragraph

22 small facts about a runner's history, evaluated in TypeScript against rows a human has
already confirmed, never against a raw extraction. F09 owns three things that must never drift
apart: the **catalog** (`lib/badges/catalog.ts`, the 22 keys — F10's hard interface), the
**rules** (`lib/badges/rules.ts`, one predicate per key, pure functions with no DB and no
ambient clock — mirroring the `daily-words` `evaluateBadges(ctx)` contract cited in the brief),
and the **`/me` page**, which is the only place any of this becomes visible. The genuinely hard
part is not any single predicate — most are one-line comparisons against numbers F06 already
computed — it is deciding *when* a rule runs and *what survives a correction*. §1 takes a
position on that before a single predicate is written, because every predicate's evaluation
moment depends on the answer.

---

## 1. The hard question first: trigger point, and what a correction does to an earned badge

### 1.1 The trigger point, precisely

Badge evaluation is one step inside the **F05 review-commit Server Action**, run in this fixed
order, in the same request (not necessarily the same DB transaction as the write, but the same
call graph — no queueing, no background job; unlike F04's extraction, this is cheap and
synchronous):

```
1. F05 writes runs + run_splits + run_zones, sets runs.reviewed_at = now()
2. F06 computes session metrics + flags for the just-committed run
3. F06 recomputes records/* — a FULL recompute over every reviewed run the user has
   (roadmap §4.5: "recomputed, never incremented" — 17 runs/month, this is free)
4. F09 builds BadgeContext for session/week/month/lifetime scopes and calls
   evaluateSessionBadges / evaluateWeekBadges / evaluateMonthBadges / evaluateLifetimeBadges
5. F09 upserts every returned key into `badges` (insert, or count += 1 on an existing row)
6. The Server Action's return value carries `newlyEarned: BadgeKey[]` — the diff between what
   existed before step 5 and after — so the review screen can show "you earned X" without a
   second round trip
```

**Step ordering 2→3→4 is load-bearing.** `new_ceiling` and `long_way_home` are implemented as
one-line reads of the record F06 *just* recomputed (§6) rather than as independent comparisons
— two implementations of "is this the longest run" is exactly the kind of drift D2 already
warns against for metrics, and F09 must not reproduce it for records.

**Only reviewed data ever reaches step 2.** There is no code path from `extractions` into
`BadgeContext` — the context is built from `runs`/`run_splits`/`run_zones` rows, which by
schema only exist once `reviewed_at` is set (F05 never writes an unreviewed run into `runs`).
This is the literal implementation of D1 for this feature: a badge cannot be "evaluated against
an unreviewed extraction" because the evaluator has no argument type that could hold one.

### 1.2 What a later correction does — take a position

Roadmap D1 says extraction never auto-saves; it says nothing about what happens if a *reviewed*
run turns out to be wrong later. v0.1.0's route table (§4.8) has no "edit a committed run"
route — `/r/[id]/review` is pre-commit, `/r/[id]` is read-only detail — so in the shipped
product, a `runs` row is immutable once `reviewed_at` is set. That makes this section mostly
forward-looking, but F09 must still take a position, because the schema already has an opinion
baked into it and a later feature will eventually test it.

**Position: badges are never revoked. Records are always recomputed. This asymmetry is
deliberate, not a shortcut.**

The evidence that this is the *intended* reading, not just F09's preference:

- `badges.run_id` is declared `NULL → runs.id ON DELETE SET NULL` (§4.3), not
  `ON DELETE CASCADE`. If a badge's earning run is ever deleted — a duplicate-upload cleanup,
  a future "remove this run" feature — the schema's own foreign key is written so **the badge
  row survives**, orphaned from its run but not deleted with it. A schema that wanted badges to
  die with their run would cascade. It doesn't. F09 is implementing what §4.3 already decided.
- `records`, by contrast, has no such protection: "recomputed, never incremented... the only
  safe implementation is a full recompute" (§4.5) is explicit that records are *current truth*,
  re-derived from whatever rows exist right now.
- The product's own tenet ("a reading app, not a dashboard... no streaks-as-anxiety") argues
  against revocation on taste grounds too: silently removing an already-shown achievement is a
  worse experience than a slightly stale one, and it is the kind of thing a "gamification"
  product does that this one explicitly opts out of being.
- Practically, a badge earned from *reviewed* data being wrong requires a human to have
  confirmed a number and *then* separately corrected it — D1's review step exists precisely to
  catch extraction errors before they poison anything, so this is already a rare compound
  failure, not a routine occurrence worth building a revocation pipeline for.

**The corollary this position forces:** badges and records tell two different stories about the
same fact, on purpose. `records.longest_distance` answers "what is my longest run, right now."
`badges.long_way_home`'s `earned_on` answers "on what date did a run first feel like my
longest." If a correction later demotes that run, the *record* moves on to whoever is now
longest — but the *badge* stays exactly where it was earned, the same way a newspaper prints a
correction without recalling the copies already delivered.

**If a post-review edit route ever ships** (out of scope for v0.1.0, but worth pre-committing
to, since F09 will be the feature everyone assumes handles it): re-run step 2–5 above for that
one run's session-scoped badges only — this allows a correction to make a run **newly** earn a
badge it hadn't (e.g., a `redline_republic` percentage corrected upward past 40%), because the
data is still human-reviewed, just reviewed twice. It must never *remove* a row from `badges`
that the correction now makes ineligible. Same asymmetry, just stated for the retroactive case.
This is documented here so it does not have to be re-litigated when that route is proposed.

---

## 2. The typed catalog — `lib/badges/catalog.ts`

Mirrors `expense-tracking/lib/categories.ts`'s convention (a frozen `as const` list is the
single source of truth; a lookup map derives everything else) crossed with `daily-words`'
`BADGE_CATALOG` shape (key + title as the *only* thing that ships to every page; scope added
here because F09, unlike `daily-words`, has four distinct evaluation moments that every caller
needs to branch on).

```ts
// lib/badges/catalog.ts
/**
 * The 22 badges. AUTHORITATIVE — roadmap §4.6. F10's `gen_badge_art.py` refuses to start
 * unless BADGE_KEYS below equals the key set inside `style.md`'s `<!-- SCENES -->` block —
 * this array is a hard interface, not an implementation detail. Order below IS shelf order
 * and IS the order `evaluateSessionBadges` etc. push into, following `daily-words`' precedent
 * that catalog order, shelf order and evaluator-return order are the same order on purpose.
 *
 * Do not delete a key. Retire it in place (see §7) the way `daily-words` retired `christmas` —
 * removed from the catalog, its rows in `badges` left inert and dropped by the shelf renderer,
 * never backfilled out of the table.
 */
export const BADGE_CATALOG = [
  { key: 'early_bird',           title: 'Early Bird',                      scope: 'session'  },
  { key: 'late_start',           title: 'Fashionably Late',                scope: 'session'  },
  { key: 'self_reward',          title: 'Self-Reward Achieved',            scope: 'week'     },
  { key: 'negative_split',       title: 'Finished the Job',                scope: 'session'  },
  { key: 'metronome',            title: 'Metronome',                       scope: 'session'  },
  { key: 'fast_start_fool',      title: 'Went Out Like a Hero',            scope: 'session'  },
  { key: 'redline_republic',     title: 'Citizen of Redline Republic',     scope: 'session'  },
  { key: 'sandbagger',           title: 'Suspiciously Sensible',           scope: 'session'  },
  { key: 'cadence_collapse',     title: 'Legs Have Left the Chat',         scope: 'session'  },
  { key: 'warmup_who',           title: 'Warm-Up? Never Met Her',          scope: 'session'  },
  { key: 'groundhog_day',        title: 'Groundhog Day',                   scope: 'session'  },
  { key: 'tourist',              title: 'Tourist',                         scope: 'session'  },
  { key: 'century_club',         title: 'Century Club',                    scope: 'month'    },
  { key: 'double_century',       title: 'Double Century',                  scope: 'month'    },
  { key: 'half_ish',             title: 'Half-ish',                        scope: 'session'  },
  { key: 'sweat_equity',         title: 'Sweat Equity',                    scope: 'session'  },
  { key: 'new_ceiling',          title: 'New Ceiling',                     scope: 'session'  },
  { key: 'consistency_gremlin',  title: 'Consistency Gremlin',             scope: 'week'     },
  { key: 'dawn_patrol',          title: 'Dawn Patrol',                     scope: 'lifetime'  },
  { key: 'long_way_home',        title: 'The Long Way Home',               scope: 'session'  },
] as const

export type BadgeKey = (typeof BADGE_CATALOG)[number]['key']
export type BadgeScope = (typeof BADGE_CATALOG)[number]['scope']

/** The interface F10's `gen_badge_art.py` diffs against `style.md`. Order is shelf order. */
export const BADGE_KEYS: readonly BadgeKey[] = BADGE_CATALOG.map((b) => b.key)

const TITLE_BY_KEY = new Map<string, string>(BADGE_CATALOG.map((b) => [b.key, b.title]))
const SCOPE_BY_KEY = new Map<string, BadgeScope>(BADGE_CATALOG.map((b) => [b.key, b.scope]))

export function isBadgeKey(value: unknown): value is BadgeKey {
  return typeof value === 'string' && (BADGE_KEYS as readonly string[]).includes(value)
}

/** Null for a retired or unrecognised key — a `badges` row from a removed key must not throw
 *  the shelf, it just drops out of it (same contract as `daily-words`' `badgeTitle`). */
export function badgeTitle(key: string): string | null {
  return TITLE_BY_KEY.get(key) ?? null
}

export function badgeScope(key: BadgeKey): BadgeScope {
  return SCOPE_BY_KEY.get(key)!
}
```

**Metadata is a separate file, `lib/badges/meta.ts`, for the same reason `daily-words` split
`badge-meta.ts` from `badges.ts`:** `catalog.ts` is imported by the review-commit path (every
run review, hot) and by `/me` (cold, full page). 22 condition sentences plus 22 glosses
is a few KB that has no business riding along on every review commit. `meta.ts` is imported
only by the `/me` page and by the test suite.

```ts
// lib/badges/meta.ts
import type { BadgeKey } from './catalog'

export type BadgeMeta = {
  /** The rule, one sentence, present tense, impersonal — see §10.2 for why. */
  condition: string
  /** Colour and, where the badge is a joke, the joke — about the run, never the runner. */
  gloss: string
}

/** A total Record, deliberately — a 21st key with no entry here is a build-time type error,
 *  the same discipline `daily-words`' BADGE_META uses and for the same reason: it is a
 *  stronger, earlier guard than any test. */
export const BADGE_META: Record<BadgeKey, BadgeMeta> = {
  /* full copy in §3 */
} as const
```

---

## 3. Badge copy — all 20, in full

**Register, enforced the same way `daily-words` enforces its own:** impersonal, present tense,
no second person, no exclamation, no flattery. This is not a style preference — it is what lets
**one string describe both the earned and the locked state** on `/me` (§10.2), and it is what
keeps the funny ones on the right side of the tone rule: a sentence that states a fact about
*the run's data* cannot accidentally become a sentence that judges the runner, because it never
grammatically has a "you" to aim at.

| key | condition | gloss |
|---|---|---|
| `early_bird` | Started between 5:00 and 5:30 in the morning. | Before the world has much of an opinion about anything, this run already had legs moving. |
| `late_start` | Started after 7:00 in the morning. | The morning had other plans. The run happened anyway, fashionably late to itself. |
| `self_reward` | Four runs land inside the same Monday-to-Sunday week. | Four is a real week of running, not a coincidence of the calendar. |
| `negative_split` | The second half of the run, kilometre for kilometre, is faster than the first. | Most runs start strong and fade. This one saved something for later and actually spent it. |
| `metronome` | Every full kilometre's pace lands within about ten seconds of the others. | A pacing plan, or an extraordinarily consistent watch. Either way, the splits look machine-made. |
| `fast_start_fool` | Kilometre one beats the run's own average pace by 30 seconds or more, and every kilometre after it is slower. | Whatever kilometre one believed about the pace, kilometres two through ten filed a formal disagreement. |
| `redline_republic` | 40 percent or more of the run sits in heart-rate zone 5. | Not a redline touched in passing — a redline held, for the better part of an hour. |
| `sandbagger` | The entire run stays inside heart-rate zones 1 and 2. | Every minute of this one played it sensible. Either a deliberate easy day, or the most disciplined run on file. |
| `cadence_collapse` | Cadence drops by 15 steps per minute or more from the first kilometre to the last. | The legs clocked out well before the watch did, and kept moving anyway on muscle memory alone. |
| `warmup_who` | The first kilometre is already in heart-rate zone 4 or above. | No warm-up on record — this run opened at what should have been its cruising effort. |
| `groundhog_day` | The last three runs land within about 100 metres of each other's distance. | Same loop, same number, three times running. The route knows the way even when nothing else does. |
| `tourist` | The run's location has never appeared in this log before. | New ground, first entry. The map just got one point wider. |
| `century_club` | 100 kilometres or more logged inside one calendar month. | A hundred kilometres is a hundred kilometres, however many runs it took to add up. |
| `double_century` | 200 kilometres or more logged inside one calendar month. | Century Club, but the month asked for it twice. |
| `half_ish` | A single run of 21.1 kilometres or more. | Whether or not it was meant to be a half marathon, the distance didn't ask permission. |
| `sweat_equity` | 1,000 active kilocalories or more burned in one run. | The watch counted every one of them. The legs are the ones who paid the bill. |
| `new_ceiling` | The watch records a higher maximum heart rate than any run before it. | The ceiling just moved, and nobody voted on it — the heart doesn't take suggestions. |
| `consistency_gremlin` | Four or more runs a week, four consecutive weeks running. | Not a streak that demands anything of the next week — just four that happened to look the same. |
| `dawn_patrol` | Ten runs, across this account's whole history, started before 6am. | The early ones don't feel like much on their own. They add up eventually, one dark morning at a time. |
| `long_way_home` | This run is now the longest on record for this account. | Somewhere past the old marker there's a new farthest point, and this run is the one that found it. |

`cadence_collapse` and `fast_start_fool` were written and re-read against the tone rule
specifically: neither sentence has a grammatical slot for the runner to be the subject of a
joke. "The legs clocked out" and "kilometres two through ten filed a formal disagreement" put
the comedy in the data's own contradiction of itself — the run is funny; the runner is not
mentioned.

---

## 4. Rule-by-rule predicate table

Column **moment** names when the predicate is evaluated (§8 gives the full trigger wiring);
**source** names which layer owns the input — `run`/`run_splits`/`run_zones` are raw F03 rows,
`metrics` is F06's `sessionMetrics()` output, `records` is F06's post-recompute `records` rows.

| key | scope | moment | predicate | source |
|---|---|---|---|---|
| `early_bird` | session | commit | `05:00 <= run.started_at <= 05:30` | `run` |
| `late_start` | session | commit | `run.started_at > 07:00` | `run` |
| `self_reward` | week | commit | count of reviewed runs with `occurred_on` in the same ISO week as `run.occurred_on` **crosses** 3→4 (fires once per qualifying week; `>4` does not re-fire) | query, §5 |
| `negative_split` | session | commit | `metrics.negativeSplit === true` (`splitDriftSec < 0`, full km only, D14) | `metrics` |
| `metronome` | session | commit | `metrics.paceSdSec < 10` | `metrics` |
| `fast_start_fool` | session | commit | `(avgOfFullKmPaces - run_splits[km=1].pace_sec) >= 30 AND metrics.negativeSplit === false` — reproduces the roadmap's own worked figure: `442 − 396 = 46 s` on the fixture | `run_splits`, `metrics` |
| `redline_republic` | session | commit | `zone5.duration_sec / zoneTotal >= 0.40` (`metrics.zonePct` filtered to `zone === 5`) | `metrics` |
| `sandbagger` | session | commit | `(zone1.duration_sec + zone2.duration_sec) === zoneTotal` (zones 3–5 all zero) | `run_zones` |
| `cadence_collapse` | session | commit | `run_splits[km=1].cadence_spm - run_splits[lastFullKm].cadence_spm >= 15` (`metrics.cadenceFade <= -15`) | `metrics` |
| `warmup_who` | session | commit | `run_splits[km=1].hr_bpm >= zone4.min_bpm` — the run's **own** `run_zones` table, not a fixed bpm or %HRmax cutoff (see §9.2 for why this matters) | `run_splits`, `run_zones` |
| `groundhog_day` | session | commit | last 3 reviewed runs (this one + 2 prior, by `occurred_on DESC`) all pairwise within 100 m of each other's `distance_m`, **and** the window ending at the previous run did not already satisfy it (edge-fire, see §5) | query, §5 |
| `tourist` | session | commit | no other reviewed run for this user has `location = run.location` | query, §5 |
| `century_club` | month | commit | sum of `distance_m` for reviewed runs in `run`'s calendar month **crosses** 100,000 m | query, §5 |
| `double_century` | month | commit | same sum **crosses** 200,000 m (independent of `century_club` — both can fire on the same commit) | query, §5 |
| `half_ish` | session | commit | `run.distance_m >= 21100` | `run` |
| `sweat_equity` | session | commit | `run.active_kcal >= 1000` | `run` |
| `new_ceiling` | session | commit | `records.highest_max_hr.run_id === run.id` (read after F06's step-3 recompute — §6, never re-derived) | `records` |
| `consistency_gremlin` | week | commit + cron | consecutive-qualifying-week streak (weeks with ≥4 reviewed runs, ending at the current week) **crosses a multiple of 4** — fires at 4, 8, 12… consecutive weeks, mirroring `daily-words`' `crossedMultipleOf` convention | query, §5 |
| `dawn_patrol` | lifetime | commit + cron | count of reviewed runs with `started_at < 06:00` **crosses** 10 (once only — see §7) | query, §5 |
| `long_way_home` | session | commit | `records.longest_distance.run_id === run.id` (same recompute dependency as `new_ceiling`) | `records` |

**No qualifying minimum distance on `sandbagger`.** A 200 m recovery jog that never leaves
zone 2 trivially earns it under §4.6's literal text, and §4.6 does not set a floor the way
`records.ts` does for `fastest_pace_5k` etc. Flagging this rather than fixing it: adding an
unstated distance floor is itself an unannounced change to the catalog's `earns-when` column,
and this plan does not introduce one (§11). Worth a one-line follow-up once the badge has
actually fired a few times and someone has an opinion about whether it should.

---

## 5. The four history-backed rules — queries and cost

`lib/badges/queries.ts`. All four run against the existing `(user_id, occurred_on DESC)` index
from §4.3; at 17 runs/month none of these approach a cost worth caching.

**`groundhog_day`** — trailing window, no aggregation:
```sql
SELECT distance_m FROM runs
WHERE user_id = $1 AND reviewed_at IS NOT NULL
ORDER BY occurred_on DESC, started_at DESC
LIMIT 4   -- 3 for the window this commit closes, 1 more to edge-detect the PRIOR window
```
Index-only range scan, `LIMIT 4` — effectively O(1) regardless of history length. The 4th row
is read purely to check whether the window ending one run earlier *already* qualified, so a
5-run stretch of near-identical loops fires once (on run 3) and not again on run 4 or 5.

**`tourist`**:
```sql
SELECT 1 FROM runs
WHERE user_id = $1 AND reviewed_at IS NOT NULL AND location = $2 AND id <> $3
LIMIT 1
```
No index on `location` exists in §4.3 and this plan does not add one — a personal app's run
table tops out in the low thousands of rows even after years of daily running, and a `LIMIT 1`
existence check over `user_id`'s partition (already narrowed by the primary access pattern) is
a full-table-for-one-user scan measured in single-digit milliseconds. Revisit only if `/me`'s
own query load ever shows otherwise.

**`consistency_gremlin`** — bounded aggregate, walked in TypeScript:
```sql
SELECT date_trunc('week', occurred_on) AS wk, count(*) AS n
FROM runs
WHERE user_id = $1 AND reviewed_at IS NOT NULL
  AND occurred_on >= $1_cutoff   -- 12 weeks back is enough to detect a break in a 4-week streak
GROUP BY wk ORDER BY wk DESC
```
Walk the rows newest-first, counting consecutive weeks with `n >= 4` until one breaks the
streak; compare that length against the length one commit ago to detect a crossing of a
multiple of 4. Bounded by the cutoff, uses the same index, cheap.

**`dawn_patrol`** — a single count:
```sql
SELECT count(*) FROM runs
WHERE user_id = $1 AND reviewed_at IS NOT NULL AND started_at < '06:00'
```
Same index prefix (`user_id`), cheap regardless of history length; this is also the query the
nightly cron sweep (§8.2) re-runs verbatim.

---

## 6. `new_ceiling` and `long_way_home` read records, they do not re-derive them

Both predicates in §4 are one-line checks against the **freshly recomputed** `records` row's
`run_id` — not an independent `run.max_hr > previousMax` or `run.distance_m > previousLongest`
comparison. This is deliberate: F06 already owns "is this the new record," has already run the
full recompute the moment F09's evaluator executes (§1.1 step 3), and a second implementation
of the same comparison is exactly the class of drift D2 calls out for metrics — two answers to
"is this the longest run" that can disagree is worse than one slow answer.

**On a user's very first reviewed run, both badges fire.** `records.longest_distance` and
`records.highest_max_hr` are recomputed over exactly one run, so that run trivially holds both
records, and both badges' `run_id === run.id` checks are trivially true. `tourist` fires
trivially for the same structural reason (no prior run can share its location). This plan takes
the position that this is correct, not a bug to special-case away: a first run *is* a new
longest run, a new max heart rate on file, and a new location, in exactly the same sense that a
first purchase in a loyalty app is a real first purchase. `IMPLEMENTATION_PLAN.md` §4.1 already
frames the canonical fixture this way — "the very first run analysed recorded an observed max of
189" — so §9 below verifies the fixture as this account's first-ever run for exactly this
reason. Nothing here requires a "skip the first run" carve-out; the fixture is the proof.

---

## 7. `count` and re-earning — which badges accumulate, and why the default is "all of them"

`badges` has one row per `(user_id, key)` — the schema forecloses "one row per occurrence," so
`count` is the only way an accumulating badge is legible at all. The default position: **every
badge accumulates.** `count += 1`, `earned_on` and `run_id`/`scope_key` move forward to the
*most recent* qualifying occurrence, on every re-earn. `created_at` is set once, at insert, and
is never touched again — it is the row's true "first earned" timestamp (standard
`DEFAULT now()` semantics), and it is what `/me` uses to show "earned since." This split
(`created_at` = first ever, `earned_on`/`run_id` = most recent) gets both questions a shelf
plausibly wants answered — "when did I first get this" and "which run was that, most recently"
— out of the four columns the table already has, with no schema change.

**The one deliberate exception: `dawn_patrol` does not re-fire at 20, 30, 40 runs.** Every
other crossing-style rule (`self_reward` weekly, `century_club`/`double_century` monthly,
`consistency_gremlin` every 4th consecutive week) has a natural period to re-cross within — a
new week, a new month, a broken-then-rebuilt streak. `dawn_patrol` is a **lifetime** count with
no such period; letting it re-fire every ten runs turns a single "the early mornings add up"
observation into a running scoreboard, which is exactly the "streak pressure mechanic" the
roadmap's core tenet rules out. It is implemented as a single crossing at 10 and never checked
again once earned — the query in §5 still runs (it is cheap and simpler than special-casing the
evaluator), but `evaluateLifetimeBadges` short-circuits to "no" once the row already exists,
rather than re-testing a threshold that could theoretically be crossed again at 20.

Everything else in §4 uses the default: increment and move forward, no ceiling.

---

## 8. Evaluation trigger — files and wiring

```
lib/badges/
  catalog.ts     §2 — BADGE_CATALOG, BadgeKey, BADGE_KEYS, badgeTitle, badgeScope
  meta.ts        §3 — BADGE_META (condition + gloss), imported only by /me and tests
  queries.ts     §5 — the 4 history queries + week/month aggregate helpers
  rules.ts       §4 — pure evaluateSessionBadges/WeekBadges/MonthBadges/LifetimeBadges(ctx)
  evaluate.ts    orchestration: builds each ctx, calls rules.ts, upserts `badges`, returns
                 { newlyEarned: BadgeKey[] } to the caller
  __tests__/
    rules.fixture.test.ts   §9 — the canonical fixture, one fires-test + one non-fires-test
                             per key per roadmap §4.9
```

### 8.1 Purity contract for `rules.ts`

Every `evaluate*Badges` function takes a fully-built context object and returns `BadgeKey[]`,
with **no DB call, no `new Date()`, no import of `queries.ts`** inside `rules.ts` itself —
identical to the `daily-words` `evaluateBadges(ctx)` contract cited in the brief, and for the
same reason: the live award path (§1.1) and any future backfill/replay tool call the *same*
function, so replaying history can never disagree with what was awarded live. `evaluate.ts` is
the only file allowed to import both `queries.ts` and `rules.ts` and glue them together.

```ts
// lib/badges/rules.ts (shape)
export type SessionBadgeContext = {
  run: { startedAt: string; distanceM: number; activeKcal: number | null; locationSeenBefore: boolean }
  splits: { km: number; paceSec: number; hrBpm: number | null; cadenceSpm: number | null; partial: boolean }[]
  zones: { zone: number; durationSec: number; minBpm: number | null }[]
  metrics: SessionMetrics           // F06 output, already computed
  isNewLongestDistance: boolean     // records.longest_distance.run_id === run.id, from F06's recompute
  isNewHighestMaxHr: boolean        // records.highest_max_hr.run_id === run.id
  lastThreeDistancesM: number[]     // includes this run; from queries.ts, length 0-4 per §5
  groundhogWindowAlreadyFired: boolean
}
export function evaluateSessionBadges(ctx: SessionBadgeContext): BadgeKey[] { /* §4's 15 session rows */ }

export type WeekBadgeContext = { reviewedRunsThisIsoWeek: number; consecutiveQualifyingWeeks: number; consecutiveQualifyingWeeksBefore: number }
export function evaluateWeekBadges(ctx: WeekBadgeContext): BadgeKey[] { /* self_reward, consistency_gremlin */ }

export type MonthBadgeContext = { monthDistanceMBefore: number; monthDistanceMAfter: number }
export function evaluateMonthBadges(ctx: MonthBadgeContext): BadgeKey[] { /* century_club, double_century */ }

export type LifetimeBadgeContext = { dawnPatrolCount: number; dawnPatrolAlreadyEarned: boolean }
export function evaluateLifetimeBadges(ctx: LifetimeBadgeContext): BadgeKey[] { /* dawn_patrol */ }
```

### 8.2 The cron sweep — honestly scoped

`/api/cron/rollup` (F07's route) is the natural home for a nightly re-check of week/month/
lifetime badges across all users. **Stating plainly: v0.1.0 does not strictly need it.** Every
week/month/lifetime rule in §4 is a crossing detected at the commit that causes the crossing,
in whatever order runs are actually reviewed — reviewing a backfilled Tuesday run today still
correctly fires `self_reward` at commit time if that commit is the one that pushes the week's
count to 4, regardless of calendar order. The sweep only earns its keep once something can
change an aggregate *without* a new commit — a future "delete a run" or "edit a reviewed run"
feature (§1.2). F09 adds the sweep anyway, because `/api/cron/rollup` already runs nightly for
insight refresh and the marginal cost of also calling `evaluateWeekBadges`/`evaluateMonthBadges`
/`evaluateLifetimeBadges` per active user is a handful of the same cheap queries from §5 — it is
a backstop bought essentially for free, not a load-bearing part of correctness today.

---

## 9. Verifying the canonical fixture

Treating the fixture (`research/schema.mjs`'s `TRUTH`, roadmap: 2026-08-20, 07:07 start,
10.67 km, 90.6% Z4+Z5, +41 s/km positive split, −18 spm cadence fade, 646 kcal, observed max HR
189) as **this account's first-ever reviewed run** — consistent with
`IMPLEMENTATION_PLAN.md` §4.1's own framing ("the very first run analysed") and required for
`new_ceiling`/`long_way_home`/`tourist` to be checkable at all (§6).

### 9.1 Full walk of all 20

| key | fires? | why |
|---|---|---|
| `early_bird` | no | started 07:07, outside 05:00–05:30 |
| `late_start` | **yes** | 07:07 > 07:00 |
| `self_reward` | no | one run; needs 4 reviewed runs in the ISO week |
| `negative_split` | no | second half (km 6–10, mean 462.6 s) is slower than the first (km 1–5, mean 421.8 s) — this **is** the +41 s/km positive split, the opposite condition |
| `metronome` | no | pace sd over the 10 full kms is 24.7 s (roadmap's own figure), far over the 10 s bar |
| `fast_start_fool` | **yes** | full-km average pace 442.2 s − km 1's 396 s = 46.2 s ≥ 30, and the split is positive (see `negative_split` row) — reproduces the roadmap's own "46 s" figure exactly |
| `redline_republic` | **yes** | zone 5 is 1998 s of 4595 s zoned = 43.5% ≥ 40% |
| `sandbagger` | no | zones 3–5 together hold 4466 of 4595 s; nowhere near "entire run" |
| `cadence_collapse` | **yes** | cadence km 1 → km 10: 154 → 136 = −18 spm, magnitude ≥ 15 |
| `warmup_who` | **no — see §9.2, this contradicts the brief's hint** | km 1's HR is 154 bpm; this run's own zone table puts zone 4 at 164–174, so km 1 sits in zone 3 (152–163), not zone 4+ |
| `groundhog_day` | no | fewer than 3 prior reviewed runs exist |
| `tourist` | **yes** | first-ever run ⇒ "Tangerang" has never appeared before (§6) |
| `century_club` | no | 10.67 km in the month, nowhere near 100,000 m |
| `double_century` | no | same, more so |
| `half_ish` | no | 10.67 km < 21.1 km |
| `sweat_equity` | no | 646 active kcal < 1000 |
| `new_ceiling` | **yes** | first-ever run ⇒ trivially the new `highest_max_hr` record (§6) |
| `consistency_gremlin` | no | needs 4 consecutive qualifying weeks; one run |
| `dawn_patrol` | no | needs 10 lifetime sub-6am starts; this run isn't even one of them (07:07) |
| `long_way_home` | **yes** | first-ever run ⇒ trivially the new `longest_distance` record (§6) |

**Earned set: `late_start`, `fast_start_fool`, `redline_republic`, `cadence_collapse`,
`tourist`, `new_ceiling`, `long_way_home` — seven badges, not six.** This is the fixture used
by `rules.fixture.test.ts` (§12 task 8): one assertion for the full earned set, plus the
per-key fires/does-not-fire pairs roadmap §4.9 requires.

### 9.2 Why `warmup_who` does not fire here, against the brief's own hint

The task brief that produced this plan listed `warmup_who` among the badges that "look likely."
Worked against the actual zone table, it does not fire, and the reason is worth keeping on
record rather than quietly fixed by picking a different threshold until the fixture agrees.

`run_splits` stores one **average** HR per kilometre — not a continuous stream — so the only
predicate this schema can support is "km 1's average HR falls in zone 4 or above," read against
**this run's own** `run_zones` bounds (164–174 for zone 4, extracted from the same screenshot).
Km 1 averaged 154 bpm, squarely inside zone 3 (152–163). Two alternative readings would have
made it fire, and both are worse:

- **A fixed bpm cutoff** (e.g. "≥ 164") would work for this run by coincidence but breaks the
  moment two runners — or the same runner after a `profiles.max_hr` update — have different
  zone tables; the whole point of storing `run_zones` per run is that zone boundaries are
  run-specific.
- **A %HRmax cutoff** (154⁄189 ≈ 81%, which a generic 80–90% "zone 4" textbook band would
  catch) uses a *different* zone system than the one the runner's own watch computed and
  displayed. Firing a badge that disagrees with the zone chart the runner is looking at on the
  same screen is a worse failure than under-firing once on the canonical fixture.

**Position: the predicate in §4 is correct, and this fixture simply is a case where the first
kilometre — despite being fast — had not yet dragged the heart rate into this runner's own
zone 4.** The badge is exactly as rare as its name implies it should be; a fixture that made it
fire "for free" would have been a weaker test of the rule, not a stronger one. `rules.fixture.
test.ts` asserts the **non**-firing explicitly, with a comment pointing here, so a future
change that makes it pass by loosening the threshold gets caught immediately.

---

## 10. The `/me` page

### 10.1 Wireframe

```
┌──────────────────────────────────────────────────────────────┐
│  /me                                                          │
│                                                                │
│  LIFETIME                                                     │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐        │
│  │  187.4 km      │ │  23 runs      │ │  27:41:05     │        │
│  │  total distance│ │  total runs   │ │  total time   │        │
│  └───────────────┘ └───────────────┘ └───────────────┘        │
│                                                                │
│  PERSONAL RECORDS                              (§4.5)         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Longest distance         10.67 km        20 Aug 2026 → │  │
│  │ Longest duration         1:18:36         20 Aug 2026 → │  │
│  │ Fastest pace (5k+)       7'22"/km        20 Aug 2026 → │  │
│  │ Fastest pace (10k+)      7'22"/km        20 Aug 2026 → │  │
│  │ Fastest km split         6'36"/km        20 Aug 2026 → │  │
│  │ Most kcal (one run)      646 kcal        20 Aug 2026 → │  │
│  │ Most elevation           15 m            20 Aug 2026 → │  │
│  │ Highest cadence (5k+)    144 spm         20 Aug 2026 → │  │
│  │ Highest max HR           189 bpm         20 Aug 2026 → │  │
│  │ Best-paced run (5k+)     12.3% decoup.   20 Aug 2026 → │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  BADGES                              7 earned · 13 to find    │
│  ┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐       │
│  │ [art] ││ [art] ││ [art] ││ [art] ││ gray  ││ gray  │  ...  │
│  │Fashio-││ Went  ││Citizen││ Legs  ││Early  ││Self-  │       │
│  │nably  ││ Out   ││of Red-││ Have  ││Bird   ││Reward │       │
│  │Late   ││ Like  ││line   ││ Left  ││       ││       │       │
│  │20 Aug ││ a Hero││Repub. ││ Chat  ││(locked)│(locked)│      │
│  └───────┘└───────┘└───────┘└───────┘└───────┘└───────┘       │
│  (grid continues, catalog order — §2's order is shelf order)  │
└──────────────────────────────────────────────────────────────┘
```

### 10.2 Unearned badges: visible-but-locked, full title AND explanation — not hidden

Decision, and the reasoning: **show all 20 slots always; earned ones render F10's colour art
with the `earned_on` date; locked ones render the same art desaturated to grayscale at reduced
opacity, with the title and the `condition`/`gloss` text both fully visible.** Nothing about a
locked badge is redacted or teased.

This is the opposite of the "spoiler risk" instinct and is deliberate, for three reasons:

1. **`daily-words` already answered this question, and F09 should not re-litigate it.**
   `BADGE_META`'s own register rule exists specifically "to let one string serve both the
   earned and the unearned state" — the impersonal, present-tense phrasing in §3 was written
   for exactly this reuse. A design that then hides the very sentence engineered for dual use
   defeats the reason it was written that way.
2. **The "no streaks-as-anxiety" tenet argues against a *checklist*, not against
   *information*.** The anxiety pattern is a progress bar nudging the user back to complete a
   set; a static, always-the-same-20-rows reference page a runner can read once and forget
   about is closer to a glossary than a quest log. Nothing on `/me` updates unless a review
   commit changes it, and nothing pushes the user back to look.
3. **Hiding the condition text would change what triggers min-maxing, not remove it.** A
   curious runner who wants to know how to earn `sweat_equity` will find out by running harder
   regardless of whether the number 1,000 is printed on `/me` or discovered after the fact —
   printing it plainly is more honest than pretending the mechanism is a surprise, especially
   for a tool whose entire premise is "read your own data plainly" (roadmap's core tenet).

**Sort order is catalog order (§2), not earned-first.** Earned-first would itself be a subtle
progress-bar effect ("look how many are still at the bottom"); catalog order treats the shelf
as a fixed reference table, which is the framing point 2 above depends on.

### 10.3 What `/me` queries

- Lifetime totals: `SELECT sum(distance_m), count(*), sum(duration_sec) FROM runs WHERE user_id
  = $1 AND reviewed_at IS NOT NULL` — one aggregate, same index.
- Records: `SELECT * FROM records WHERE user_id = $1` — ten rows max, PK scan.
- Badges: `SELECT * FROM badges WHERE user_id = $1` — join catalog order in TypeScript via
  `BADGE_CATALOG`, not `ORDER BY` (the DB has no opinion on shelf order; §2 does).

No new query patterns beyond what F03 already provides; `/me` composes existing rows, it does
not invent access patterns.

---

## 11. Contract deltas

**None.** Every key, title, and scope in §2 is roadmap §4.6 verbatim — nothing here proposes
adding, removing, or renaming a badge, and F10's `gen_badge_art.py` key-diff guard will hold
against `BADGE_KEYS` unchanged. Where §4.6's `earns-when` prose was ambiguous (`fast_start_fool`
's "fastest by 30 s+", `warmup_who`'s "zone 4+"), §4 and §9.2 record the specific
operationalization chosen and why — these are predicate *clarifications* that reproduce the
roadmap's own worked figures (the 46 s example), not changes to what the catalog promises.

---

## 12. Task breakdown

1. `lib/badges/catalog.ts` — §2, `BADGE_CATALOG`, `BadgeKey`, `BadgeScope`, `BADGE_KEYS`,
   `isBadgeKey`, `badgeTitle`, `badgeScope`.
2. `lib/badges/meta.ts` — §3, all 20 `condition`/`gloss` pairs, `Record<BadgeKey, BadgeMeta>`.
3. `lib/badges/queries.ts` — §5's four history queries plus the week/month aggregate helpers
   §8.1's contexts need; every function takes `userId` (never trusts a caller-supplied one —
   same INVARIANT A discipline as F02/F03) and the just-committed run's fields.
4. `lib/badges/rules.ts` — §8.1's four pure `evaluate*Badges` functions plus the
   `crossedMultipleOf`-style edge helper reused by `self_reward`, `century_club`,
   `double_century`, `consistency_gremlin`, `dawn_patrol`, `groundhog_day`.
5. `lib/badges/evaluate.ts` — orchestration: build each context from `queries.ts` + F06's
   metrics/records outputs, call `rules.ts`, upsert into `badges` (insert or `count += 1`,
   `earned_on`/`run_id`/`scope_key` move to the latest occurrence, `created_at` untouched on
   update), return `{ newlyEarned: BadgeKey[] }`.
6. Wire `evaluate.ts` into F05's review-commit Server Action, in the step order fixed in §1.1
   (metrics → records → badges), and thread `newlyEarned` back to the review screen's response.
7. Add the `/api/cron/rollup` sweep call (§8.2) — coordinate the exact call site with F07,
   since F09 does not own that route, only the function it calls.
8. `lib/badges/__tests__/rules.fixture.test.ts` — import `TRUTH` from `research/schema.mjs`
   (D13: it stays in the repo for exactly this), adapt it into the `runs`/`run_splits`/
   `run_zones` shape, assert the full seven-badge earned set from §9.1, then one fires/does-not
   pair per key per roadmap §4.9 (perturbing the fixture minimally per test — e.g. a
   `warmup_who` fires-test raises km 1's HR to 165).
9. `/me` page — server component per §10: lifetime totals, records table, badge shelf in
   catalog order with the grayscale-lock treatment from §10.2.
10. Update `IMPLEMENTATION_PLAN.md`/roadmap cross-references if a later feature review finds
    the §4.6 prose itself needs tightening — file as a `## Contract deltas` amendment to *this*
    plan if it ever happens; §11 stays "none" until it does.

---

## 13. Verification

- `research/score.mjs` stays green — untouched by this feature, but it is the CI trip-wire that
  would show if `run_splits`/`run_zones` field names drift out from under §4 and §5's queries.
- `npm run test` (Vitest) covers:
  - `rules.fixture.test.ts` (task 8) — the full fixture walk from §9.1, plus per-key pairs.
  - A unit test per crossing helper (`self_reward` at exactly 3→4, not 4→5; `century_club` at
    the 100,000 m boundary; `dawn_patrol` firing once at count 10 and never again at count 20).
  - A test that `evaluate.ts` never calls `rules.ts` with data sourced from `extractions` —
    enforced structurally (no such import exists in `rules.ts` or `queries.ts`) rather than by
    a runtime assertion, per §1.1.
- Manual QA on `/me`: confirm the seven-badge fixture account renders seven colour tiles and
  thirteen grayscale tiles in catalog order, confirm the records table matches §4.5's ten keys
  with the fixture's values, confirm lifetime totals equal the single run's own numbers on a
  fresh account.
- **F10's own gate is the strongest verification this catalog gets**: the first time
  `gen_badge_art.py` runs against `style.md`, it either accepts `BADGE_KEYS` unchanged or
  refuses to start — a startup error here is a stronger signal than any test F09 can write
  against its own catalog file.
