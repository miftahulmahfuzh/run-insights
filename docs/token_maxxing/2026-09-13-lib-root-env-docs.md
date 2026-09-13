# Token-Maxxing Session — 2026-09-13: Lib Root Env Docs

## 🎯 Achievement / End Result
- **Goal of the burn:** Fix `lib/env.ts`'s stale doc citations to two files confirmed dead
  repo-wide (`ROADMAP_v0.1.0.md`, `IMPLEMENTATION_PLAN.md`), and compact/verify
  `lib/.workflows/package_readme.md` (the combined readme for `lib/date`, `lib/flags`,
  `lib/derived`).
- **Concrete changes:**
  - `lib/env.ts` — four dead-pointer comments retargeted to the docs that now actually
    carry the cited content, each verified by grep/read before citing.
  - `lib/.workflows/package_readme.md` — one real staleness defect found and fixed (a
    reverse-dependency count that went stale the same day it was written), every other
    claim in the doc independently re-verified as still accurate, prose lightly tightened.
  - One commit on this branch: `5165bf4`.
- **Real value delivered:**
  - Removed the last two citations in the repo pointing at files that no longer exist
    anywhere on disk — a load-bearing config-validation file (`lib/env.ts`, read at
    process start) no longer sends a future reader chasing a renamed-away doc.
  - `lib/env.ts`'s citation style is now internally consistent with `lib/llm/vision.ts`,
    which already cited the correct surviving doc for the same fact.
  - Caught and corrected a reverse-dependency count that drifted to stale on the very day
    it was authored (2026-09-12), the same day a sibling session's `db/queries.ts` split
    silently invalidated it — the kind of one-day-old drift that's easy to miss because
    the doc "looks fresh."
- **Branch:** `token-maxxing-2026-09-13-lib-root-env-docs` (worktree:
  `/home/miftah/.worktrees/run-insights/tokenmax-2026-09-13-lib-root-env-docs`)
- **Coordinator:** `tokenmax-orch-2026-09-13` (this was a worker session with a
  pre-assigned idea, not a solo session choosing from a generated menu)
- **Merge status:** on branch, not yet merged
- **Approx token burn:** low-to-moderate — a scoped, single-file-pair fix with careful
  citation verification rather than a wide sweep 🔥

## Context & Motivation
This session was spawned by coordinator `tokenmax-orch-2026-09-13` as one worker among
several running in parallel, each handed a pre-vetted idea rather than generating and
picking from its own menu. The assigned idea, verbatim:

> "Fix lib/env.ts's stale doc citations to ROADMAP_v0.1.0.md and IMPLEMENTATION_PLAN.md,
> both confirmed to not exist anywhere in the repo, and compact lib/.workflows/package_readme.md."

The motivating fact: `lib/env.ts` is the repo's environment-variable validation module,
read at process start for every request. Its header and inline comments carried section
citations into two planning documents — `ROADMAP_v0.1.0.md` and `IMPLEMENTATION_PLAN.md`
— that a 2026-09-11 docs archival session (see
`docs/token_maxxing/2026-09-11-docs-plans-archive.md`) had renamed away entirely, with
their content redistributed into `docs/architecture.md` and `docs/plans/archive/`. A
verified-dead pointer sitting in a load-bearing config file is exactly the class of drift
this campaign exists to close, and it's a two-week-old wound (roadmap docs don't survive
that kind of archival by accident, they get replaced).

The second half of the idea — compacting `lib/.workflows/package_readme.md` — was bundled
in because it's the combined readme covering the same lib area (`lib/date`, `lib/flags`,
`lib/derived`) and was flagged as a candidate for tightening.

## What We Did (blow-by-blow)

### 1. Confirmed the two files are actually dead
Ran a repo-wide filename search before touching anything:

```
find . -iname "ROADMAP_v0.1.0.md" -o -iname "IMPLEMENTATION_PLAN.md"
```

Zero hits. This matches the 2026-09-11 archival record: both files were renamed away,
their content now living under `docs/plans/archive/` (per-feature plan files) and
`docs/architecture.md` (the synthesized architecture reference written the same day).

### 2. Inventoried every dead citation in `lib/env.ts`
Found four:
- A header comment naming `ROADMAP_v0.1.0.md §4.1` as the authority for the file's
  variable-naming conventions.
- An inline comment naming `IMPLEMENTATION_PLAN.md §1.1` next to the vision-endpoint
  validation, explaining the "200 OK but silently drops the image" trap that motivates a
  specific env check.
- Two bare `(roadmap §3)` / `(roadmap §4.1)` citations with no filename attached at all —
  these had presumably always been shorthand for the same now-dead roadmap file.

### 3. Retargeted each citation, verifying the replacement before writing it
Discipline used throughout: grep/read the candidate replacement doc first, confirm it
actually contains the claimed content, only then cite it. No citation was retargeted on
assumption.

- **Variable-naming authority** → `docs/architecture.md` (F01 section). Read the section
  to confirm it documents the same naming rule the old roadmap section covered.
- **Vision-endpoint silent-drop trap + "no SDK, plain fetch" reasoning** →
  `docs/plans/archive/F04-ingest-extraction.md` (§1 and §2). This was cross-checked
  against `lib/llm/vision.ts`, which already cites this exact file correctly for the same
  underlying fact — so this fix also makes `lib/env.ts`'s citation style consistent with
  a sibling file that got it right, rather than inventing a new convention.
- **`AUTH_URL` production-only rule** → `docs/plans/archive/F02-auth-profile.md` (item 7).
  Verified that file states exactly this ruling before citing it.

### 4. Deliberately left three sibling files untouched
`lib/llm/vision.ts`, `lib/llm/client.ts`, and `lib/llm/factsHash.ts` all carry their own
bare `(roadmap §N)`-style citations of the same dead-pointer class. These were left alone
on purpose — they're outside the assigned scope (different files entirely), and touching
them risked colliding with other coordinator-spawned workers who might be assigned
`lib/llm` in this same wave. Recorded under Follow-ups below rather than fixed
opportunistically.

### 5. Read and verified `lib/.workflows/package_readme.md` claim-by-claim
Rather than assuming the doc needed compaction (the "compact" framing in the assigned
idea), read it in full and independently re-verified every factual claim against the
current tree:

- **Found stale:** the reverse-dependency count for `lib/date/ranges` — the doc said "45
  production importers, db 1." Traced this to commit `c312fb0`, which split the
  monolithic `lib/db/queries.ts` into 14 domain modules, 5 of which import
  `lib/date/ranges`. The doc was written 2026-09-12, the same day as that split, so the
  count was correct at the moment of writing and went stale within the same day as a side
  effect of a concurrent session's work elsewhere in the tree. Actual current count: 50
  importers (db 5, components 4, everything else unchanged — still 11 lib areas total).
  Corrected the number, dated the correction, and added a one-line note explaining why it
  drifted (so a future reader doesn't have to re-derive the cause).
- **Verified and left alone (all found accurate):**
  - `lib/flags`/copy and `lib/derived`/invalidate reverse-dependency counts.
  - The three exported-file line counts (168 / 94 / 239).
  - The YAGNI verdict bullets.
  - The reference to the fixed-defect commit `4d5d270`.
- **Light prose tightening:** the "Why one readme covers three packages" section was
  trimmed for word count only — no facts removed, same claims stated more concisely.

### 6. Verification
Ran the full relevant gate set before calling this done:
- `npx next typegen && npx tsc --noEmit` — no new errors (the file's own remaining errors
  are pre-existing `PageProps`/`LayoutProps` typegen noise, unrelated to this change).
- `npm run ci:openrouter-guard` — OK.
- `npm run ci:client-secret-guard` — OK.
- Five targeted vitest files: `tests/date.month.test.ts`, `tests/date.isoWeek.test.ts`,
  `tests/date.day.test.ts`, `tests/flags.copy.test.ts`, `tests/derived.invalidate.test.ts`
  — 43/43 passed.

## Code / Design Details
The core edit pattern in `lib/env.ts` was a straight citation swap — no logic changed,
only comments:

```diff
- * See ROADMAP_v0.1.0.md §4.1 for the naming rationale.
+ * See docs/architecture.md (F01) for the naming rationale.
```

```diff
- // Vision endpoint can return 200 OK while silently dropping the image —
- // see IMPLEMENTATION_PLAN.md §1.1 for why we validate this explicitly.
+ // Vision endpoint can return 200 OK while silently dropping the image —
+ // see docs/plans/archive/F04-ingest-extraction.md §1-2 for why we validate
+ // this explicitly (same trap lib/llm/vision.ts cites this file for).
```

```diff
- // AUTH_URL is required in production only (roadmap §4.1)
+ // AUTH_URL is required in production only (docs/plans/archive/F02-auth-profile.md, item 7)
```

In `lib/.workflows/package_readme.md`, the reverse-dependency correction followed the
project's established "correct in place, date the correction, explain the drift" pattern
rather than silently overwriting the stale number:

```diff
- lib/date/ranges: 45 production importers (db 1, components 4, ...)
+ lib/date/ranges: 50 production importers (db 5, components 4, ...)
+ <!-- corrected 2026-09-13: db/queries.ts split (c312fb0) same-day as this doc's
+      original count added 4 new db-domain importers -->
```

## Decisions & Trade-offs
- **Verify-then-cite over pattern-match-then-cite.** Every replacement citation was
  confirmed by reading the target section first. This is slower than blindly swapping
  `ROADMAP_v0.1.0.md §4.1` → `docs/architecture.md` everywhere, but a wrong citation is
  worse than a missing one — it looks authoritative while pointing at content that
  doesn't actually cover the claim.
- **Scope discipline over opportunistic fixing.** The three `lib/llm/*.ts` files with the
  same dead-pointer pattern were left untouched despite being trivial one-line fixes,
  because this session's assignment was `lib/env.ts` specifically and other coordinator
  workers may be assigned `lib/llm` concurrently. Touching them risked a landing
  collision for zero net gain (the fix would happen anyway, just attributed to the wrong
  session).
- **Full re-verification over trusting the doc's freshness.** The `package_readme.md`
  was only one day old, which could have been treated as "recently verified, skip it."
  Instead every claim was independently re-checked, which is what caught the
  same-day-stale count — a good illustration of why doc age alone is not a proxy for doc
  accuracy (per the standing project lesson that a doc's drift window is git-derived, not
  calendar-derived).

## Follow-ups & YAGNI notes
- `lib/llm/vision.ts`, `lib/llm/client.ts`, and `lib/llm/factsHash.ts` each still carry
  the same dead-roadmap-citation pattern (`(roadmap §N)`-style, no file, or citing the
  same two now-nonexistent files). Out of this session's scope by design — worth a
  future one-line-fix session, likely fast since the correct replacement docs are already
  known from this session's work (`docs/architecture.md`, `docs/plans/archive/F04-...`,
  `docs/plans/archive/F02-...`).
- Nothing else was deliberately deferred; the `package_readme.md` compaction pass found
  the doc was already tight (only one number was actually wrong), so there was no
  additional YAGNI trim to make beyond the prose tightening already applied.

## Appendix
- Commit: `5165bf4` — `fix(env): retarget dead ROADMAP_v0.1.0.md/IMPLEMENTATION_PLAN.md citations`
- Key verification commands:
  - `find . -iname "ROADMAP_v0.1.0.md" -o -iname "IMPLEMENTATION_PLAN.md"` (confirmed zero hits)
  - `npx next typegen && npx tsc --noEmit`
  - `npm run ci:openrouter-guard`
  - `npm run ci:client-secret-guard`
  - `npx vitest run tests/date.month.test.ts tests/date.isoWeek.test.ts tests/date.day.test.ts tests/flags.copy.test.ts tests/derived.invalidate.test.ts` (43/43 passed)
- Related prior sessions referenced during verification:
  - `docs/token_maxxing/2026-09-11-docs-plans-archive.md` (the archival that renamed the
    two dead-referenced files away)
  - `docs/token_maxxing/2026-09-12-lib-utils-yagni.md` (prior session covering the same
    `lib/date`/`lib/flags`/`lib/derived` area, source of the readme this session
    re-verified)
  - Commit `c312fb0` (the `lib/db/queries.ts` domain split that caused the same-day
    reverse-dependency drift)
