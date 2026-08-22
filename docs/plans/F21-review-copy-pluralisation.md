# F21 — `1 check still disagrees`, and a harness that can re-take one photograph

**Card:** [#16](https://github.com/miftahulmahfuzh/run-insights/issues/16) · round 1
**Base:** `origin/main` at `109eb51`

> **Was F20 until the label collided.** This card and card 17 (`prefers-reduced-motion`) were
> worked in parallel worktrees, both branched off `109eb51`, and both read `F19` as the highest
> plan and minted `F20`. Card 17 landed first as [#19](https://github.com/miftahulmahfuzh/run-insights/pull/19),
> so `docs/plans/F20-reduced-motion.md` has the number and this file renumbered to F21 rather than
> renaming a plan already on `main`. The commits below still carry a `fix(f20):` prefix; they were
> written before the race resolved and are left alone, because rewriting them would hide the one
> thing worth knowing — that `F<N+1>` is not race-safe when two sessions branch off the same
> commit. The next such pair should check `origin/main` for the label immediately before
> committing, not at plan time.

---

## 1. The bug, stated exactly

The review screen's sticky bar reads:

> **1 check still disagree** — save anyway if the screenshots say otherwise.

`components/review/ReviewClient.tsx` builds that sentence from two pieces, and only one of
them was ever taught to count:

```tsx
{failing === 1 ? '1 check' : `${failing} checks`} still disagree
```

The **noun** is inside the ternary. The **verb** is outside it, in the JSX that follows, where
no count can reach it. So the plural reading is correct and the singular reading has a
subject-verb disagreement — on the one screen in the app whose entire purpose is careful
reading of small numbers.

This is not a general pluralisation weakness in the codebase. Fourteen other count strings
were checked (`RunList`, `DeltaLine`, `ProvenanceMark`, `BadgeShelf`, `WeeksInMonthChart`,
`ConsistencyBanner`, and the `edits` string two lines above the bug itself) and every one of
them pluralises correctly. It is one site, and it is one site because of where the ternary
ends.

### It is also on the front page, three times

F19 captured the review screen against the canonical fixture with its real misread injected
(`breakSplitOne` — one failing check, `splits_sum_vs_duration`). The sticky bar is
`position: fixed`, so **every** photograph of that screen carries the sentence:

| File | Where the string appears |
|---|---|
| `docs/media/03-review-banner.png` | sticky bar, bottom of frame |
| `docs/media/04-review-split.png` | same bar — it is fixed, so scrolling does not lose it |
| `docs/media/review.gif` | visible for the whole recording |

And `README.md:39` **quotes it as if it were the intended copy**:

> the banner says which block to look at — `1 check still disagree`.

So the fix is four files of content, not one line of code.

---

## 2. Decisions

**D1 — Re-shoot the media in this card rather than deferring it.** The alternative was to fix
the code and open a follow-up card for the capture, keeping this one small. Rejected: the
repo's front page would keep showing the bug for an unbounded time, and the whole reason F19
framed every still by selector was so a still could be re-taken cheaply.

**D2 — Re-shoot selectively, via a new `--only` flag, rather than running the full passes.**
The review artifacts are the cheapest three in the set: both stills and the GIF read only
`manifest.flagged.extractionId`, an extraction the seed deliberately leaves **uncommitted**.
They need a seed and a dev server and nothing else.

Running `--stills --gifs` wholesale would have been much worse than it looks. Those passes
read a *committed* dataset, so they pull in `--commit`; and keeping `05-run-detail`,
`06-insight`, `09-trends` and `10-trends-chart` coherent pulls in `--hero` (a real vision
call, ~$0.006) and `--warm` (10–35 s insight generations). Twelve PNGs and three GIFs would
churn, with fresh non-deterministic model prose in four of them, to fix a verb.

**D3 — Move the copy to a pure function.** This repo has no jsdom and no
`@testing-library/react`; vitest runs node-env only. A private JSX function inside a
`'use client'` file is therefore unreachable from a test, which is the structural reason this
bug shipped. `CommitStatusLine` renders five plain-text states and no markup, so it did not
need to be a component at all.

**D4 — Fix the ternary's shape, not just the missing `s`.** Adding `s` to the singular branch
leaves the verb outside the ternary, one edit away from the same bug. The whole clause moves
inside, so singular and plural are two complete strings.

**D5 — Leave `docs/plans/F19-readme-and-capture.md:308` alone.** It lists this as a finding
"for its own card". That is a retrospective: it records what was true then, the same way this
repo treats a checkbox in a rolling-summary section. This file records the fix.

---

## 3. The copy, as a pure function

New `lib/review/copy.ts`, following `lib/flags/copy.ts`'s precedent of copy-as-pure-function:

```ts
export function commitStatusLine({
  failingCount, editedCount, mode, hasNumbers,
}: {
  failingCount: number
  editedCount: number
  mode: 'review' | 'edit'
  hasNumbers: boolean
}): string
```

Five states, unchanged in wording except for the verb:

| Condition | Sentence |
|---|---|
| `!hasNumbers` | `Fill in at least the distance and the duration.` |
| `failingCount > 0` | `1 check still disagrees` / `N checks still disagree`, `· N corrections` if any, then `— save anyway if the screenshots say otherwise.` |
| clean, no edits, `edit` mode | `Nothing changed yet.` |
| clean, no edits, `review` mode | `Everything checks out. Nothing corrected.` |
| clean, with edits | `Everything checks out · N corrections.` |

`ReviewClient` drops `CommitStatusLine` and renders `{commitStatusLine({...})}` inside the
existing `aria-live="polite"` paragraph. The `checks` prop becomes a count at the call site —
`checks.filter((c) => !c.ok).length` — which is all the sentence ever used it for.

`tests/review.copy.test.ts` covers each state, plus an **agreement invariant** over counts
0–5: a sentence naming `1 check` must say `disagrees`, and any other count must say
`disagree`. That is the assertion the original code could not have failed, because there was
nothing to assert against.

---

## 4. `--only`, and the failure it has to refuse

```
node --env-file=.env.local scripts/capture/shoot.mjs --stills --gifs \
  --only 03-review-banner,04-review-split,review
```

`ARTIFACTS` names all fifteen things the harness produces — twelve stills plus `hero`,
`review`, `trends`. An unknown name exits 2 with the list.

**Two levels of guard, for two different reasons.**

*Inside `shot()` and `record()`* — correctness. Anything unrequested is not written, and
`record()` returns before opening a recording context, so a skipped GIF costs zero seconds
rather than twelve plus an encode.

*At each segment of `stills()`* — necessity. The `05`–`08` segment reads run cards off `/` and
**throws** `expected at least 2 runs on /` when the dataset is not committed. Guarding the
segment is what lets the review stills be shot against a seed-only database, which is the
entire point of D2.

**And the check that makes the flag trustworthy.** `shot()` and `record()` record what they
wrote, and at exit, if `--only` was given and any requested name was never produced, the run
**fails**. Without that, `--only review --stills` — a plausible mistake, a GIF name handed to
the stills pass — writes nothing and prints `OK docs/media/ is up to date`. Silent success is
the failure mode F19's own retrospective is mostly made of; a selective flag is a new way to
manufacture it, so it ships with the check.

One footgun closed in passing: with `--only` set and no pass flags, all five passes run,
including `hero` and its real vision call. The `hero` pass now runs only when `hero` is in
`--only`.

`assertNoDuplicateStills()` is untouched. It hashes every PNG in `docs/media/`, so it still
validates two fresh stills against the ten it did not take.

---

## 5. The capture run

The F19 seed was purged — `capture:status` reports `no demo user in the database`, and
`scripts/capture/.manifest.json` is gitignored and gone. So there is no warm state to shoot
against and the seed is a prerequisite, not an option.

```bash
npm run capture:seed                       # demo user, 25 extractions + the flagged one
npm run dev -- -p 3210                     # the harness's default origin
node --env-file=.env.local scripts/capture/shoot.mjs --stills --gifs \
  --only 03-review-banner,04-review-split,review
npm run capture:purge                      # then npm run blob:reap as the backstop
```

Nothing here costs a model call. `review.gif` was 317 KB against
`webm-to-gif.mjs`'s 2 MB per-GIF budget, so the re-record lands on the ladder's top rung.

### The acceptance check

Nothing UI-facing has landed since F19 took these photographs — this card is the first change
on top of `109eb51`. So the re-shot `03` and `04` must differ from the committed ones **only
in the sticky bar's one line**.

If either comes back reframed, that is a finding to report rather than something to commit
quietly. `04-review-split` seeks a leaf element whose text is exactly `'7'`, and F19 was
bitten twice by exactly this kind of selector — once by `querySelector('table')` finding
`ChartFrame`'s table twin, once by `.pop()` scrolling past the splits table to the share
controls.

The new stills will read **`1 check still disagrees`** — the singular case, which is precisely
the string the README points at.

---

## 6. Files

| File | Change |
|---|---|
| `lib/review/copy.ts` | new — `commitStatusLine`, the five states, the fixed ternary |
| `components/review/ReviewClient.tsx` | drop `CommitStatusLine`, call the pure function |
| `tests/review.copy.test.ts` | new — five states + the agreement invariant |
| `scripts/capture/shoot.mjs` | `--only`, `ARTIFACTS`, the two guard levels, the produced-what-was-asked check |
| `README.md` | line 39 — the quoted string gains its `s` |
| `docs/media/03-review-banner.png` | re-shot |
| `docs/media/04-review-split.png` | re-shot |
| `docs/media/review.gif` | re-recorded |

## 7. Gate

`.github/workflows/ci.yml` — 14 commands: `npm i -g npm@12.0.1`, `npm ci`, seven bespoke
guards (`ci:openrouter-guard`, `badges:check`, `ci:data-layer-guard`,
`ci:client-secret-guard`, `ci:f08-guard`, `ci:llm-payload-guard`, `ci:f11-guard`),
`format:check`, `lint`, `typecheck`, `test`, `build`.
