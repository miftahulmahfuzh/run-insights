# Token-Maxxing Session — 2026-09-12: Lib Nina Package Readme Compaction

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `pkg-readme-nina-lib`), pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`): compact
  `lib/nina/.workflows/package_readme.md` — at 3,767 lines the worst-bloated package doc
  in the repo — the way `scripts/.workflows/package_readme.md` got compacted to 226 lines
  on 2026-09-11 (commit `b049bb7`, the previous day's `scripts-package-hygiene` session):
  cut stale/redundant prose, verify every remaining claim against current code, keep only
  load-bearing context. Why it was chosen: every future session touching `lib/nina` reads
  this file as context, so its size is a direct recurring token cost and maintainability
  drag — 3,767 lines of pre-flight reading on every nina idea, growing after every set.
- **Concrete changes:** 1 file, +516/−3,726, one commit (`0b7020e`) —
  `lib/nina/.workflows/package_readme.md`, 3,767 → 557 lines (**−85%**).
- **Real value delivered:**
  - **~2,700 lines of dead weight cut** — per-phase implementation narratives (plan-set
    writeups quoting plan invariants, user requirements verbatim, "what this phase did not
    touch" ledgers) accreted after every set since 2026-09-05, duplicating the plan files
    under `lib/nina/.workflows/plan/` and the session docs under `docs/token_maxxing/`.
    The narratives moved nowhere: they were already duplicated there, which is exactly
    what made them safe to cut.
  - **The session's core value beyond size: stale claims caught and corrected.** The
    compacted file would have been a lie at 557 lines if it had simply been *trimmed* —
    the verification pass falsified the old file's claims mid-rewrite. Two outright false
    "no importer" claims cut (tuning-aware exports, `captionNinaPhoto` — both wired long
    ago); the live tuning/shortcut reads re-anchored from `actions.ts` into
    `turnrun.ts` STEP 2's four-way `Promise.all`; image budgets corrected (anchored
    timeout 220s→235s, run budget 240s→255s); "six generations a day" replaced with
    `NINA_IMAGE_DAILY_CAP` fallback 30, env-tunable via `ninaImageDailyCap()` clamped
    1..200 and counting failures; `maxDuration=300` now on FOUR segments (admin
    image-generation joined); reverse deps 68→101 files; ChatScreen 6→10 submodules;
    24 server-only modules (was 29); drizzle tip now 0020.
  - **A calibration target set for the next doc-compaction session:** 557 lines over a
    90-file package is ~6.2 lines per file — tighter than the scripts readme's 8.4 — so
    the dense-per-file style demonstrably scales past a 27-file package.
  - **The per-migration applied/not-applied table dropped entirely** — it rots per
    deploy; the *rule* it documented stays.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-nina-lib`
- **Merge status:** on branch, **NOT merged** — this is a worker session; the coordinator
  owns landing worker branches.
- **Approx token burn:** high — the diff is one doc file, but the burn went into reading
  the full 3,767-line target, yesterday's 226-line calibration file, and ~40 exhaustive
  verification greps across the package (no head cutoffs). 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
a pre-assigned idea. This worker's assignment was doc compaction for `lib/nina/` — the
package whose readme had become the repo's worst-bloated one.

The failure mode the readme exhibited is structural, not accidental: under the
`/implement`-per-phase workflow, each landed set appended its implementation narrative to
`package_readme.md`, so the file doubled as a changelog. Nothing ever pruned it, and the
narratives duplicated two authoritative records — the adopted plan files under
`lib/nina/.workflows/plan/` and the session docs under `docs/token_maxxing/`. The result
was a 3,767-line context file that every future nina session pays for on every read, and
whose older sections had silently rotted (see the stale-claims list below) because a file
nobody reads is a file nobody corrects.

The assignment explicitly pointed at yesterday's calibration: `scripts/.workflows/
package_readme.md` had been rewritten to 226 lines on 2026-09-11 with a specific style —
dense per-file paragraphs of load-bearing facts, no signature dumps, measured numbers with
dates, stale claims replaced with measured truth. This session applied the same style to a
package 3× larger.

## What We Did (blow-by-blow)
1. **Loaded the `/update-readme` skill** for the canonical `package_readme` structure, then
   **read yesterday's calibration target in full**: `scripts/.workflows/package_readme.md`
   at 226 lines (commit `b049bb7`). The style contract taken from it: dense per-file
   paragraphs of load-bearing facts; no signature dumps; measured numbers stamped with
   their measure date; stale claims replaced with measured truth, never propagated.
2. **Read the full 3,767-line target.** Not skimmed — read, because the rewrite's
   justification for keeping any claim is having seen what surrounds it. Triaged the body:
   **~2,700 lines were per-phase implementation narratives** — plan-set writeups quoting
   plan invariants, user requirements verbatim, and "what this phase did not touch"
   ledgers — accreted after every set since 2026-09-05, duplicating the plan files under
   `lib/nina/.workflows/plan/` and the session docs under `docs/token_maxxing/`. Those
   narratives were cut, not moved.
3. **Verified every surviving claim against current code before writing it down.** The
   verification pass ran as exhaustive greps — **no head cutoffs** (a prior session's
   memory: an inventory grep piped through `head -N` silently dropped one live ref) —
   roughly **40 checks** across the package, including:
   - the **zero-import roster**: `tuning`, `shortcuts`, `images`, `imagefail`,
     `imageDedupe`, `perceptual`, `turnflight`, `imagerecipe`, `imageprefs`, `crop` —
     each confirmed with zero `^import` hits repo-wide;
   - **`NINA_PROMPT_VERSION=7`**;
   - **tuning defaults**: 7 traits at 0, profanity at 30, eight traits at 50;
   - **six relationships**, including the Instructor relationship;
   - the **five `PERCEPTUAL_*` constants identical in both copies** — `perceptual.ts` and
     `scripts/nina-dedupe-plan.mjs` (1 / 2 / 0.01 / 0.5 / 3);
   - **`NINA_CHAT_ID_RE` `{12}` vs `NINA_CHAT_STORED_ID_RE` `{12}-{16,64}`**;
   - **`NINA_TURN_REVIVE_ATTEMPT_CAP=3`**, **`NINA_BURST_MAX_MESSAGES=6`**, and
     **`NINA_TURN_POLL_GIVE_UP_MS = NINA_BACKGROUND_BUDGET_MS`** literally aliased in
     `turnflight.ts`;
   - the **soft-delete predicate census**: ten `deleted_at IS NULL` WHERE clauses across
     nine functions — and `countNinaTurnsSince` confirmed to have **no** `deleted_at`
     filter (documented as such, since the omission is load-bearing for the revive path);
   - the **replaceState guard**: the test strips comments and counts exactly 2 code
     writers, so the guard's shape is pinned by its own test;
   - **`GIRLFRIEND_VOICE_EXAMPLES=5`**;
   - **caption model `glm-5.3` via `narrativeModel()`**; **describe model `glm-4.6v`**.
4. **Caught the stale claims mid-verification** (this is the session's core value beyond
   size — the full list with the corrections is under Code / Design Details). The pattern:
   every claim the old file made about *absence* ("no importer", "X happens in actions.ts",
   "220s", "six a day", "four segments") was re-derived from the tree, and the ones the
   tree disagreed with were replaced with the measured truth plus the measure date.
5. **Rewrote the file: 3,767 → 557 lines (−85%)**. Structure as landed: overview →
   **eleven standing rules** → character layer → prompts & version constants → the chat
   turn (send / claim / flight / revive / resend / burst / shortcuts) → chat UI logic →
   images (generation / budgets / pathname windows / jobs / dedup / perceptual / captions)
   → memory & proactive → module map → dataflow → dependencies → reverse deps →
   concurrency → error handling → gotchas → tests. Every volatile count is stamped with
   its measure date (2026-09-12), so the next reader can tell at a glance which numbers
   are snapshots and when they were taken.
6. **Committed as `0b7020e`** — one file, 516 insertions / 3,726 deletions, verified via
   `git show --stat` — and stopped: no merge, no push; the coordinator lands worker
   branches.

## Code / Design Details

**The stale-claims ledger** — what the old 3,767-line file asserted vs what the tree
measured on 2026-09-12:

| Old claim (as written) | Measured truth (2026-09-12) |
|---|---|
| "tuning-aware exports have no importer" | wired long ago — claim cut |
| "`captionNinaPhoto` has no importer" | wired long ago — claim cut |
| live tuning/shortcut reads happen in `actions.ts` | moved to `turnrun.ts` STEP 2's four-way `Promise.all` (context / history / tuning / shortcuts) |
| anchored image timeout 220s | 235s |
| run budget 240s | 255s (plus 150s unanchored, 290s worker) |
| "six generations a day" | `NINA_IMAGE_DAILY_CAP` fallback 30, env-tunable via `ninaImageDailyCap()`, clamped 1..200, counting failures |
| `maxDuration=300` on three segments | FOUR (admin image-generation joined) |
| soft-delete predicate census | ten WHEREs across nine functions |
| `removeNinaSession` four statements over one snapshot | five statements over one snapshot |
| (imageprefs unimported) | `persona.ts` carries a type-only `./imageprefs` import |
| reverse deps 68 files | 101 files |
| ChatScreen 6 submodules | 10 submodules |
| 29 server-only modules | 24 |
| an earlier drizzle tip | now 0020 |
| per-migration applied/not-applied state | **dropped entirely** — it rots per deploy; the rule stays |

**The new readme's shape** (sections as landed):
```
# Package: lib/nina
## Overview                        — what the package is + the ELEVEN standing rules
## Character layer
## Prompts & version constants
## The chat turn                   — send / claim / flight / revive / resend / burst / shortcuts
## Chat UI logic
## Images                          — generation / budgets / pathname windows / jobs /
                                     dedup / perceptual / captions
## Memory & proactive
## Module map
## Dataflow
## Dependencies
## Reverse dependencies
## Concurrency
## Error handling
## Gotchas
## Tests
```

**Size arithmetic:** 557 lines over a ~90-file package = **~6.2 lines per file**, versus
the scripts readme's 226 lines over 27 files = 8.4 — the calibration style got *tighter
per file* on the larger package, because lib/nina's facts cluster into subsystems rather
than spreading one-paragraph-per-file.

**Commit:**
```
0b7020e docs(lib/nina): compact package_readme 3767 -> 557 lines, every claim re-verified

lib/nina/.workflows/package_readme.md | 516 ++++++++++++ ... −3,726
1 file changed, 516 insertions(+), 3726 deletions(-)
```

## Decisions & Trade-offs
- **Verify-then-write, in that order.** The rewrite was not "trim the old file" — it was
  "re-derive every fact from the tree, then write only the facts that survived." That is
  why the stale-claims ledger above exists: each row is a claim a pure trim would have
  carried forward into the compacted file, enshrining falsehood at 15× the credibility
  density. The extra burn (~40 greps) bought a file that is correct on day one, not merely
  short.
- **Cut the narratives rather than archive them.** The ~2,700 lines of per-phase
  writeups duplicate `lib/nina/.workflows/plan/` (the plan files) and `docs/token_maxxing/`
  (the session docs) — both of which are the authoritative homes for that history. Moving
  the prose somewhere "just in case" would have created a third copy of what already
  exists twice. Nothing was lost; the provenance stays discoverable through the plans and
  session docs it was duplicating.
- **Drop per-migration applied/not-applied state; keep the rule.** A readme that records
  which migration is applied where is a readme that lies after the next deploy — it rots
  on a cadence no doc session can chase. What belongs in the readme is the *rule* (how
  migration state is checked, what to never assume), not a snapshot of its answer.
- **Stamp volatile counts with the measure date.** Every number that will drift (reverse
  dep count, submodule count, server-only module count, drizzle tip) is written as
  "N as of 2026-09-12". This converts inevitable rot from silent falsehood into
  detectable staleness — the same principle yesterday's scripts readme applied with its
  measured DB counts.
- **No code touched.** The assignment was a doc compaction; the follow-ups discovered en
  route (below) are recorded, not fixed. `git show --stat 0b7020e` shows exactly one file.

## Follow-ups & YAGNI notes
- **`gateway.ts` hardcodes `imageDescriptions: []` for every window row** — a recorded
  gap the resend/revive paths work around by rebuilding from the row. Closing it changes
  what she knows in every conversation; pre-existing, deliberately out of scope here.
- **The sweep's `perceptualVerifyCandidates` shortlists by (user, width, height)**, so a
  cross-resolution pair with a stale stored signature is invisible to the repair pass —
  pre-existing, already named in code comments.
- **The GitHub worker's hand-written claim still doesn't know the `deleted_at` column**
  (accepted in writing in both the readme and the code). Anyone re-promoting it to primary
  generator must add the predicate **in the same commit**.
- **The "Instructor" relationship still needs one manual `/admin` selection** to become
  reachable by a real user — deliberately never done by any phase, because `.env.local`
  points at production.
- **Next doc-compaction candidate:** a similar pass over other bloated
  `package_readme.md` files. `lib/db/.workflows/package_readme.md` was named in the old
  nina file as carrying the `nina_shortcuts` table doc — but **verify before assuming
  it's bloated**; yesterday's scripts readme proves small-but-wrong is also possible.
  This session's row and yesterday's `scripts-package-hygiene` doc together are the
  pattern for doc-compaction sessions.
- **The compacted readme will rot too** — same as every snapshot-bearing doc. The
  standing rules are durable; the counts are dated. The next session that materially
  changes a subsystem under `lib/nina/` should re-measure its readme section rather than
  append a new narrative paragraph — appending is exactly how the file got to 3,767 lines.

## Appendix

**Files touched:**
```
lib/nina/.workflows/package_readme.md | 516 +++++++++++++++++++++++++++++---------------------
1 file changed, 516 insertions(+), 3726 deletions(-)
```
(3,767 → 557 lines, −85%.)

**Verification performed:** every surviving claim re-derived from the tree via ~40
exhaustive greps with no head cutoffs (zero-import roster of ten modules via `^import`;
constants `NINA_PROMPT_VERSION=7`, `NINA_TURN_REVIVE_ATTEMPT_CAP=3`,
`NINA_BURST_MAX_MESSAGES=6`, `GIRLFRIEND_VOICE_EXAMPLES=5`, the five `PERCEPTUAL_*`
values 1/2/0.01/0.5/3 cross-checked identical in `perceptual.ts` and
`scripts/nina-dedupe-plan.mjs`; regex width contrast `{12}` vs `{12}-{16,64}`;
`NINA_TURN_POLL_GIVE_UP_MS` literally equal to `NINA_BACKGROUND_BUDGET_MS` in
`turnflight.ts`; the ten-WHERE/nine-function soft-delete census; the no-filter exception
in `countNinaTurnsSince`; the replaceState guard's 2-code-writer test shape; model ids
`glm-5.3` via `narrativeModel()` and `glm-4.6v`); commit verified via `git show --stat`.
No code files touched, no tests run (doc-only change).

**Git evidence:** session commit `0b7020e` on branch
`token-maxxing-2026-09-12-pkg-readme-nina-lib`, parented on `7899385` (the pre-fan-out
prettier commit). Calibration reference: `b049bb7` (2026-09-11,
`scripts/.workflows/package_readme.md` 7 → 226 lines).

**Session identity:** worker session `pkg-readme-nina-lib`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-pkg-readme-nina-lib`; final commit `0b7020e`; not merged
(coordinator lands worker branches). Session interrupted once by a transient 429 rate
limit after the commit landed; doc + index written after resume from the clean tree.
