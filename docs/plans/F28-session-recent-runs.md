# F28 — Recent-run history in the session narrative

**Card:** [#36](https://github.com/miftahulmahfuzh/run-insights/issues/36) · round 1 · 2026-08-22

## The defect

On the 22 Aug 2026 run the session narrative hung three of its four prose fields on one
scalar:

> 91% of the run in zones 4-5 **on a once-a-week schedule** … **With only one run per
> week**, that's a lot of intensity … **At roughly one run per week**, this is nearly an
> hour and 18 minutes almost entirely at high intensity.

The scalar is `weeklyContext.runsPerWeek` — `runs in the trailing 28 days ÷ 4`, from
`loadWeeklyContext()`. Two things are wrong, and only the second is the model's fault:

1. **It is the only history the session prompt gets.** Three aggregate scalars over 28
   days, and nothing else. The model cannot see a single other run, so it cannot tell
   whether this hard effort is the fourth in a row or the first in a month — the two
   readings deserve opposite advice and the payload cannot distinguish them.
2. **It is a cadence, narrated as a schedule.** Five runs bunched into one week and then
   three weeks off is also "1.3 runs/week". `SESSION_SYSTEM_PROMPT` never mentions
   `weeklyContext` at all, so there is no rule saying what the number means or how often
   to cite it.

## What ships

The last **8 reviewed runs before this one**, each carrying its own date and the gap in
days, added to the session facts as `recentRuns`. Plus the prompt rules that tell the
model what the new array is and what `runsPerWeek` is not.

## Approaches considered

| # | Approach | Why it lost |
|---|---|---|
| A | Emit the prior runs from the rows `loadWeeklyContext` **already** fetches (`getRunsBetween`, trailing 28 days). Zero new I/O. | Bounded at 28 days, so this runner — the one in the bug report — sees **three** prior runs. Three is not enough to read a pattern, and the card's whole ask is that the model be able to. It also carries no zone rows, so no `percentTimeInZone4And5`, which is the single most decision-relevant field for *this* bug: "your fourth consecutive all-out effort" is the sentence the payload currently cannot support. |
| B | **Chosen.** A new thin query `getReviewedRunsBefore(userId, upTo, limit)`, shaped exactly like the existing `getReviewedRunWindow` — same R-5 row-value position predicate, same two-statement no-join pattern — batched with a zone read. | — |
| C | Switch `loadSessionFacts` to `getReviewedRunsWithChildren` and filter in TypeScript, matching the "one query for a period" convention stated at the top of `lib/insights/load.ts`. | That convention is written for *period* rollups, which need the whole history anyway. The session path is the hot one: it runs on every run detail page, and this would pull every split and every zone the user has ever logged (~2,200 split rows a year) to use eight runs of it. It also drags `loadWeeklyContext` into the rewrite, for a worse blast radius and a worse undo. |

**B against the four criteria.** *Convention:* it is a copy of a query this repo already
has, down to the `coalesce(started_at, '00:00:00')` total order. *Scope:* one query, one
fact type, one prompt block — nothing existing is removed. *Verifiability:* the query gets
a `reviewed_at` assertion in `tests/db.queries.reviewedOnly.test.ts` (whose completeness
test **fails on its own** until the new `^getReviewedRun` export is listed — the gate
catches the omission for us), and the fact builder is pure, so `tests/llm.facts.test.ts`
pins the shape without a database. *Reversibility:* purely additive; one revert.

## Two decisions the card left open

**N = 8, and no calendar bound.** The card suggested "last N *within* some bound, so a run
after a 6-month layoff doesn't get last winter's block as 'recent'". Building the narrower
half of that on purpose — the count only:

- A calendar bound would hand back an **empty** array precisely in the layoff case, which
  reproduces exactly the blindness this card exists to fix. The model seeing *"previous run:
  Sat, 14 Feb 2026 — 189 days before this one"* is far better informed than the model
  seeing nothing, and it needs no bound to reach the right conclusion, because
  `daysBefore` is right there in the row.
- One knob instead of two. 8 runs is ~2 months of history for this runner (~1/week) and
  ~8 days for a daily runner — enough to read a pattern at either end without a second
  constant to justify.

If the layoff case does turn out to read badly, the fix is a bound on `daysBefore` at the
fact-builder layer and it is a two-line change.

**`daysBefore` is precomputed, not left to the model.** HARD RULE #1 of the session prompt
is *"Do NOT compute new numbers"*. Handing over dates and expecting date arithmetic would
be asking the model to break the rule that keeps it honest, so the gap ships as an integer.

## Payload

Newest first — index 0 is the run immediately before this one, and `daysBefore` therefore
ascends. Eight fields, no splits: §1.1 admits exactly one full inclusion and this run's
splits already spend it.

```ts
interface RecentRunFact {
  date: string                          // 'Fri, 14 Aug 2026'
  daysBefore: number                    // 8
  distanceKm: number
  duration: string
  avgPace: string
  avgHr: number | null
  percentTimeInZone4And5: number | null
  intent: RunIntent | null
}
```

`[]`, never `null`, when there is no earlier reviewed run — matching `splits` and `flags`
rather than `weeklyContext`. The prompt says what an empty array means so it cannot be read
as "this runner never runs".

`weeklyContext` **stays**. Removing it is scope the card did not ask for, and the three
scalars are still true; what changes is that the prompt now says what they are.

## Steps

1. `lib/db/queries.ts` — `getReviewedRunsBefore(userId, upTo, limit)`. Strictly `<` the
   committing run's R-5 position (the run itself is excluded, unlike `getReviewedRunWindow`
   which includes it), `reviewed_at is not null`, newest first, `limit` validated 1..50.
   Zones read in a second statement scoped to the returned ids, skipped entirely when the
   first returns nothing.
2. `lib/llm/facts.ts` — `RecentRunFact`, `recentRuns` on `SessionNarrateFacts`,
   `recentRuns` on `BuildSessionFactsInput`, built in `buildSessionFacts` with the same
   `round1` boundary rounding every other computed number gets.
3. `lib/insights/load.ts` — `loadRecentRuns()` beside `loadWeeklyContext()`, wired into
   `loadSessionFacts`. Both run inside the existing `Promise.all` shape.
4. `lib/llm/prompts/narrate.ts` — a RECENT HISTORY block in `SESSION_SYSTEM_PROMPT`, and
   **`SESSION_PROMPT_VERSION` 1 → 2 in the same commit** (header comment, lines 20–31: an
   edit without the bump serves the stale insight forever and no test catches it).
5. Tests: the `reviewed_at` assertion plus the completeness-list entry in
   `tests/db.queries.reviewedOnly.test.ts`; `recentRuns` shape, ordering, `daysBefore`,
   empty-case and hash-sensitivity in `tests/llm.facts.test.ts`.

## The prompt rules being added

Aimed at the observed failure, not at the general topic:

- `recentRuns` is newest-first; `daysBefore` is the gap in days from this run.
- `runsPerWeek` is an **average over the trailing 28 days, not a schedule** — cite it at
  most once, and never as a description of the runner's routine. Use the dates in
  `recentRuns` when talking about spacing.
- Compare this run to the runs in `recentRuns`, not to an imagined baseline.
- **Do not hang more than one prose field on the same contextual fact.** This is the
  literal defect: three of four fields repeated one number.
- An empty `recentRuns` means no earlier reviewed run, not a runner who does not run.

## Cost

Input side only, and bounded: 8 rows × 8 short fields. The research baseline for a session
narrative is 1,743 in / 546 out; expect roughly +250–400 input tokens. Every existing
session insight re-narrates once, because `recentRuns` and the bumped `promptVersion` both
land in `facts_hash` — which is the intended behaviour, not a regression.
