# Token-Maxxing Session — 2026-09-12: Combined Dashboard-Layer Package Readme

Worker session `pkg-readme-insights-metrics` of coordinator `tokenmax-orch-2026-09-12`.

## 🎯 Achievement / End Result

- **Goal of the burn:** the assigned idea, verbatim: *"Write one combined package_readme.md
  for lib/insights, lib/metrics, lib/panel, and components/insights — swept together via
  insights-metrics-panel-yagni but still fully undocumented."* The four dashboard-layer
  directories were handled as one unit by the same-day dead-exports sweep (commit
  `7f07c41`) and none of the four had a `package_readme.md`; one combined doc fixes that
  without minting four thin ones.
- **Concrete changes:** one commit — `8a6ce16` "docs(metrics): combined package_readme for
  metrics, insights, panel, components/insights" — **2 files, +553/−2**:
  - `lib/metrics/.workflows/package_readme.md` — **new, 549 lines**, following the repo's
    `{pkg}/.workflows/package_readme.md` convention, anchored at `lib/metrics`.
  - `.workflows/package_readme.md` (root) — the index line that enumerated which packages
    have their own readmes updated to list the combined file ("Six packages have
    per-package readmes of their own: … — plus the combined `lib/metrics` readme, which
    also covers `lib/insights`, `components/insights` and `lib/panel`").
- **Real value delivered:**
  - The four documented-nowhere dashboard dirs have **one real readme**: every one of the
    **16 source files read IN FULL** before a line was written (2,155 lines total,
    wc-measured 2026-09-12: `lib/metrics` 11 files / 1,087 lines; `lib/insights` 2 / 655;
    `lib/panel` 1 / 126; `components/insights` 2 / 287), plus a repo-wide grep of reverse
    dependencies, plus the two house-style readmes (`lib/db`, root) read for voice/format
    calibration.
  - The doc records the vertical's **end-to-end data flow** (db rows → `lib/metrics` →
    `lib/insights/load.ts` → `lib/llm` narrate → `insights.payload` → `InsightCard` /
    `InsightTrigger`, with the cron as the third entrance) and `lib/metrics`' **four
    laws** (no LLM computes any number — D2, with the measured −14.1%-vs-+12.35% failure;
    nothing formatted for display — `lib/format.ts` is the only number→text place; raw
    floats before rounding, never `roundSharesTo100` before a threshold; null means
    cannot-compute, never 0).
  - **Per-module API docs with the whys attached**: the hrMax resolution order
    measured→observed→Tanaka→null and its documented asymmetries; D14's partial-split
    filter; the ACWR coupled-formula 0.25-forever trap; the `DistanceBucket` canonical
    enumeration plus the `AssertTrue`/`EveryBucketListed` compile-time completeness
    device; largest-remainder `roundSharesTo100`.
  - The **insights fact pipeline** premises written down: one whole-history snapshot,
    reviewed-only at every scope including session, current-not-as-of HRmax under the
    prose, dominant-bucket pace comparison, and the 10–35 s non-blocking action boundary
    returning `{changed, unavailable}` — never the prose.
  - The **two render components** and the **panel URL codec** documented: tolerant total
    payload parsing (with its measured motivating failure), the StrictMode-guarded
    single-fire trigger; one param not one per surface, `'.'` not `':'`, the unvalidated
    key **by design**, the subordinate dates param, plus consumer `usePanelParam`'s
    history rules.
  - **Grep-measured reverse dependencies** per directory (2026-09-12): `lib/metrics`
    31 source + 21 test files — with `tests/share.bundle.test.ts`'s comment-only mention
    explicitly excluded as the prose-trap; `lib/insights` 2 + 1; `lib/panel` 3 + 1;
    `components/insights` 2 + 0. Plus concurrency, error handling, performance, usage
    patterns, **ten gotchas**, and provenance.
  - The yagni sweep's inherited **known-state finding recorded in the readme**:
    `hrMaxTransitionAt` / `resolveHrMaxAsOf` / `HrMaxTransition` have **zero production
    callers** — the F06 §4.5 banner never shipped, the trio is kept alive only by two
    test suites, and the in-file comment claiming the run page calls it per render is
    **false as of 2026-09-12**. The code comment was deliberately left in place for
    whoever ships or kills the banner.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-insights-metrics` (its own worktree;
  single session commit `8a6ce16` on base `6759f26`).
- **Merge status:** on branch — **NOT merged, deliberately**. Coordinator
  `tokenmax-orch-2026-09-12` owns landing all worker branches (Worker Mode contract).
- **Approx token burn:** 🔥🔥 — and the burn is **reading, not writing**: every line of
  the vertical's source, the full reverse-dep grep across the repo, house-style
  calibration against two existing readmes, and claims verified against the tree — all
  to produce one documentation file.

## Context & Motivation

The 2026-09-12 `insights-metrics-panel-yagni` sweep (commit `7f07c41`, 9 files, +11/−16)
closed the dashboard layer's dead-export debt and, in doing so, became the unit of
account for these four directories: strictly `lib/insights`, `components/insights`,
`lib/metrics`, `lib/panel`. Its session doc recorded the follow-through debt: no
`package_readme.md` existed in any of the four. The repo's convention is one
`{pkg}/.workflows/package_readme.md` per package; four directories that are one
dashboard layer would have meant four thin docs, three of them a screen long, none able
to describe the vertical's data flow because the flow crosses all four. The assigned
idea chose the honest alternative: **one combined readme, swept together, with the
combined-ness stated rather than hidden.**

**Process note, recorded honestly:** the session was launched and went idle **before
starting** — it produced nothing until the coordinator's status ping woke it. It then
rolled from scratch: no half-written file, no lost premise, just a late start. The
sequence below is the whole session.

## What We Did (blow-by-blow)

1. **Read everything first.** All 16 source files across the four directories, in full,
   with a wc-measured census per directory (metrics 11 / 1,087; insights 2 / 655; panel
   1 / 126; components/insights 2 / 287 — measured 2026-09-12). No summary reads, no
   skim: a package readme's value is the whys, and the whys live in the bodies and
   docstrings.
2. **Measured the reverse dependencies.** A repo-wide grep pass classified every file
   that imports from each of the four packages, import-statement hits only — prose
   mentions count as importers exactly never. `tests/share.bundle.test.ts` names
   `computeSessionMetrics` inside a comment; it is recorded as the explicit exclusion so
   the count stays honest rather than lucky.
3. **Calibrated voice and format.** Read the two house-style readmes —
   `lib/db/.workflows/package_readme.md` (the compaction campaign's verified model) and
   the root `.workflows/package_readme.md` — for structure, tense, and the volatile-
   number stamping discipline.
4. **Pulled provenance.** Read the same-day `insights-metrics-panel-yagni` session doc
   (`2026-09-12-insights-metrics-panel-yagni.md`) for the sweep's findings, so the
   readme could inherit them correctly — in particular the recorded-but-unremovable
   `hrMax` transition trio.
5. **Chose the anchor and wrote the charter.** `lib/metrics` is the file's home because
   it is 11 of the 16 files and the **only one of the four the rest of the repo imports
   at large**. The charter states the architecture honestly rather than forcing a false
   unity: three of the four are one vertical (metrics computes, insights narrates,
   components renders); `lib/panel` has **no functional relationship to insights** —
   zero imports of any kind — and rides along **by sweep scope, not architecture**.
6. **Wrote the readme** (content detailed in the next section) — 543 lines as first
   committed; 549 after the session's own pre-landing amend folded in a reverse-deps
   exclusions refinement (see the Appendix amend note).
7. **Updated the root index line** in the same commit — the root readme's package-list
   paragraph enumerated which packages have their own readmes; the combined file is now
   listed there, so tooling and humans scanning the root find all four dirs' doc.
8. **Gated the diff:** `prettier --check` clean on both touched files (the repo's
   `format:check` covers `.md`).

## Code / Design Details

**The charter's honesty clause** (the part a future reader must not misread):

- Three of the four directories are one vertical: `lib/metrics` computes every
  deterministic number, `lib/insights/load.ts` turns reviewed rows + those numbers into
  narration facts, `components/insights` renders the narrative. Data flows through them
  in that order, with `lib/llm` narrate (outside the layer) turning facts into
  `insights.payload`, cached by `facts_hash`, and the rollup cron as the third entrance.
- `lib/panel` is `/me`'s open-panel URL codec. It shares nothing with the other three
  and gets its own part; it is in this file because the sweep swept it.

**`lib/metrics`' four laws**, each with its evidence:

1. **No LLM computes any number** (decision D2) — with the measured failure that
   motivates it (−14.1% vs +12.35%, the two answers a model gave for the same ask).
2. **Nothing is formatted for display** — `lib/format.ts` is the only number→text place.
3. **Raw floats before rounding** — never `roundSharesTo100` before a threshold test.
4. **null means cannot-compute, never 0** — callers distinguish the two.

**Per-module whys now written where the next editor will look:** the hrMax resolution
order (measured → observed → Tanaka → null) and its documented asymmetries; D14's
partial-split filter; the ACWR coupled-formula 0.25-forever trap (a coupled formula fed
a constant stays pinned — why the fixture-based tests exist); the `DistanceBucket`
canonical enumeration guarded by the `AssertTrue`/`EveryBucketListed` compile-time
completeness device (a sixth bucket added without listing it is a compile error, not a
silently unselectable chip); largest-remainder apportionment in `roundSharesTo100`.

**The insights premises:** one whole-history snapshot (no as-of queries), reviewed-only
at every scope including the session scope, current-not-as-of HRmax under the prose, and
the dominant-bucket pace comparison. The action boundary: `ensureInsight` is non-blocking
by design, the 10–35 s model window is survived via `{changed, unavailable}` — the
action returns a status, never the prose.

**The render components:** `InsightCard` parses the total payload **tolerantly** (its
measured motivating failure: a schema-shaped payload that drifted broke a strict parser
and blanked the card); `InsightTrigger` fires once per mount under a StrictMode guard
(the unique index on `insights` settles the rest downstream).

**The panel codec's design decisions, recorded as decisions:** one URL param for all
surfaces rather than one per surface; `'.'` as the kind separator rather than `':'`; the
key is unvalidated **by design** (an unknown key opens the panel empty rather than 404s);
the `dates` param is subordinate to the key. Consumer-side, `usePanelParam`'s history
rules (replace vs push) are written down.

**The root index line, before → after:**

```diff
-harness (excluded from `tsconfig` and `eslint`). Six packages have package readmes of their own:
-`lib/db`, `lib/admin`, `lib/nina`, `components/admin`, `components/nina`, `scripts`.
+harness (excluded from `tsconfig` and `eslint`). Six packages have per-package readmes of their own:
+`lib/db`, `lib/admin`, `lib/nina`, `components/admin`, `components/nina`, `scripts` — plus the
+combined `lib/metrics` readme, which also covers `lib/insights`, `components/insights` and
+`lib/panel`.
```

## Decisions & Trade-offs

- **One combined readme, not four.** The assignment's premise and the day's evidence
  agreed: the four dirs were swept as one unit, three of them are functionally one
  vertical, and none had any doc. Four thin readmes would have quadrupled the
  maintenance surface and still been unable to describe the data flow. The cost is
  accepted and stated: tooling that expects `{pkg}/.workflows/package_readme.md` in the
  other three directories finds nothing — the charter says plainly that this is their
  readme too.
- **Anchor at `lib/metrics`, reasoned in the charter.** 11 of 16 files, and the only one
  of the four imported at large by the rest of the repo. A doc's home should be where
  readers already are.
- **No `/analyze` escalation.** The escalation criterion exists for multi-file
  implementation work with interdependent decisions. This session landed as one new
  markdown file plus a one-line index edit; there were no interdependent decisions to
  plan.
- **Every volatile count stamped "measured 2026-09-12"** — file counts, line counts,
  reverse-dependency counts. Per the package-readme rule: write rules, not state; a
  count without its measure date is a future stale claim.
- **The `hrMax` code comment deliberately left, the finding recorded in the readme.**
  The trio's fate (ship the F06 §4.5 banner or delete the machinery and its two suites)
  is a decision for the session that owns it; editing the comment now would spend the
  breadcrumb the decider needs. The readme carries the truth instead.
- **Prettier as the md gate.** `prettier --check` clean on both touched files — the
  repo's `format:check` covers markdown, so a doc-only diff is still format-gated.
- **Not merged.** The coordinator owns landing; Worker Mode contract.

## Follow-ups & YAGNI notes

- **The `hrMax` transition banner decision is still open** (inherited, not created
  here): ship F06 §4.5 — the code sits tested and waiting — or hold a `tests/`-scoped
  session that removes `hrMaxTransitionAt`, `resolveHrMaxAsOf`, `HrMaxTransition`, their
  two suites, and the false "called once per render" comment. The readme now carries
  this state; the next reader starts from truth.
- **If `lib/panel` ever grows a functional relationship to the vertical**, the combined
  readme should be split then — not before. Splitting now would mint the thin doc the
  assignment rejected.
- **Four thin readmes stay un-minted by design.** If a future session disagrees, the
  charter's three-of-four-one-vertical + one-ride-along decomposition is the natural
  split line (a metrics+insights+components readme and a panel readme).
- **Per-package readme verification passes** (the campaign the same-day compaction
  workers ran) will eventually want to sweep this file too; its volatile counts are
  stamped, so the pass can diff the stamps instead of re-deriving everything.

## Appendix

**Commit (the branch's one session commit):**

```
8a6ce16 docs(metrics): combined package_readme for metrics, insights, panel, components/insights
```

Base: `6759f26` ("fix(tests): derive Nina ticket secret from AUTH_SECRET, not a stray
literal"). One commit ahead of base.

**Full diff stat:**

```
 .workflows/package_readme.md             |   6 +-
 lib/metrics/.workflows/package_readme.md | 549 +++++++++++++++++++++++++++++++
 2 files changed, 553 insertions(+), 2 deletions(-)
```

**Amend note:** this doc was written while the worker session was still putting its own
commit in order. The +8/−2 refinement to the readme's reverse-dependency exclusions
paragraph (the alias-grep raw count and the `components/ui/{Flag,SplitsTable}`
co-located-test classification) first appeared as an uncommitted working-tree edit, then
was folded into the session commit by an amend: `0daeee5` → `8a6ce16` (543 → 549 lines,
+547/−2 → +553/−2, same base `6759f26`, same message). The shas and counts in this doc
and in the index row record the amended commit — the branch tip as of this doc's
commit.

**Reading list consumed before writing** (the session's actual token spend):

```
lib/metrics          11 files / 1,087 lines   (week, pace, acwr, flags, hrMax, month,
                                               age, round, types, session, index)
lib/insights          2 files /   655 lines   (actions.ts, load.ts)
lib/panel             1 file  /   126 lines   (param.ts)
components/insights   2 files /   287 lines   (InsightCard.tsx, InsightTrigger.tsx)
                    = 16 files / 2,155 lines, wc-measured 2026-09-12
+ repo-wide reverse-dependency grep (import-statement hits only)
+ lib/db/.workflows/package_readme.md and .workflows/package_readme.md (root) — style calibration
+ docs/token_maxxing/2026-09-12-insights-metrics-panel-yagni.md — provenance
```

**Verification:**

```
npx prettier --check .workflows/package_readme.md lib/metrics/.workflows/package_readme.md
# clean — the repo's format:check gate covers .md
```

**References:** assigned idea from coordinator `tokenmax-orch-2026-09-12` (slug
`pkg-readme-insights-metrics`); predecessor sweep doc
`2026-09-12-insights-metrics-panel-yagni.md` (commit `7f07c41`); house-style readmes
`lib/db/.workflows/package_readme.md` and `.workflows/package_readme.md`; the volatile-
numbers rule and the prose-trap rule from the repo memory
(`package-readme-volatile-numbers-rot`, `adopted-plan-copies-trip-string-guards`).
