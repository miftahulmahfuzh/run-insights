# Token-Maxxing Session — 2026-09-12: Research Directory Hygiene Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `research-hygiene-audit`) pre-assigned one
  idea by the coordinator (`tokenmax-orch-2026-09-12`, N=5 fan-out). The assignment,
  verbatim: *"Audit the research/ directory (committed .mjs benchmark scripts,
  results-\*.json output files, and fixture images/golden responses) for staleness: are
  the results files current relative to the scripts that produced them, is the README
  accurate, is anything here dead weight that should be gitignored output rather than
  committed source. Why: research/ has never been touched by any of the 81 token-maxxing
  sessions run in this repo across the last two days — it is the one directory nobody has
  looked at."*
- **Concrete changes:** 3 worker commits, 8 files, +52/−15 —
  - `21ea99a` ("fix(research): point the harness at the committed fixtures") — the three
    scripts that read screenshots stopped hardcoding the wiped
    `~/.claude/image-cache/3a4e3940-…` directory (`lib.mjs`, `matrix.mjs`,
    `downscale.mjs`) and now default to `research/fixtures/screenshots/` with an
    `RI_FIXTURE_DIR` override; `downscale.mjs` stopped importing sharp from ANOTHER
    repo's `node_modules` by absolute path; `narrate.mjs`/`control.mjs` stopped
    hardcoding `glm-5.2` and default to the production `glm-5.3` family
    (`LLM_NARRATE_MODEL` reproduces the original runs);
  - `6f44204` ("docs(research): accuracy pass on both READMEs, measured against today's
    tree") — `fixtures/README.md`'s wrong `out=1070` token count corrected to the 940 the
    golden fixture was born with; its prompt-provenance bullet now states today's prompt
    is a superset the frozen capture predates (F30's rule 10 landed five days after the
    capture); `research/README.md` gained the `tests/research/` CI gates and the
    results-file convention (including the narrate-overwrites-a-CI-fixture hazard) and
    lost the instruction to point `lib.mjs` at your own copies;
  - `8135e35` ("chore(research): gitignore run-extract's rerun output") — a scoped
    `research/.gitignore` for the one uncited output file, pattern verified with
    `git check-ignore -v`.
- **Real value delivered:**
  - **The headline verdict is the OPPOSITE of the assignment's suspicion: research/ is
    not dead weight — it is load-bearing.** `results-narrative.json` is `readFileSync`'d
    by `tests/llm.schema.test.ts:30` in CI; `schema.mjs`/`score.mjs` are imported by ~16
    test files; the live vision suite's DEFAULT fixture directory is
    `research/fixtures/screenshots/shipped/`; and archived decision D13 (F01 plan)
    explicitly rules the four `results-*.json` are kept. Gitignoring the directory, as
    the brief floated, would have broken CI.
  - **Results-vs-scripts staleness: CURRENT, proven by re-measurement rather than
    eyeballing.** The golden response re-scored through `research/score.mjs` today:
    **108/108, exact**. The stored merge inside `results-parallel.json` re-scored:
    **102/108 (94.4%)** with the error list reproducing **bit-exact**. `show-metrics.mjs`
    output matched every number in `results-narrative.json`. No script was modified after
    its results were committed. The archived plans' citations are true against today's
    tree (F01's 41.1 s worst latency = the 41071 ms in `results-repeat.json`; F07's
    1743/546 usage figures; F30's all-green downscale variants).
  - **The real finding was one level down: the harness could not run at all.** Every
    documented rerun ("run this first after any z.ai change") died on its first
    `readFileSync` — the fixture directory it hardcoded was wiped from
    `~/.claude/image-cache/` long ago. On top of that, `downscale.mjs` imported sharp
    from `~/expense-tracking/node_modules` by absolute path (sharp 0.35.3 is THIS repo's
    own dependency), and `narrate.mjs`/`control.mjs` hardcoded `glm-5.2` while production
    narrative moved to the glm-5.3 family (`lib/llm/catalog.ts`'s
    `NARRATIVE_TEXT_MODEL_IDS`). All fixed; verified end-to-end without spending an API
    cent (`dataUri('1.png')` builds a valid data URI from the committed PNGs, sharp
    resolves, `node --check` clean on all five touched scripts).
  - **Three README defects found and fixed** — a from-memory transcription (1070 vs the
    true 940 completion tokens, the same error fossilized in archived plan F04 line 1341,
    archive left untouched as history), a provenance claim that retroactively folded
    rule 10 into a capture that predates it by five days, and a main README that told
    readers to supply their own screenshots while the committed fixtures answer that, and
    never mentioned the CI gates that read this directory.
  - **89 tests green** across the six research-consuming files (`tests/research/`,
    `tests/llm.schema.test.ts`, `lib/llm/extractJson.test.ts`, `tests/format.test.ts`,
    `lib/llm/vision.test.ts`). Tree clean.
- **Branch:** `token-maxxing-2026-09-12-research-hygiene-audit`
- **Merge status:** on branch (worker session — the coordinator merges; W4 report went to
  `tokenmax-orch-2026-09-12`)
- **Approx token burn:** high (est. ~1M, input-dominated) — the burn went into reading
  all 24 committed files end to end, deriving every staleness window from git instead of
  trusting headers, re-running the scorers and metrics tooling against the committed
  artifacts, tracing the cross-referenced consumers, and this doc. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed
a pre-assigned idea. This worker drew `research/` — by the coordinator's own census, the
one directory none of the campaign's 81 prior sessions had ever touched.

What `research/` IS, and why "nobody looks at it" was a risk worth a session: it is the
repo's v0.1.0 feasibility lab. Before any of the product existed, these scripts measured
whether the z.ai vision model could read running-workout screenshots and emit structured
JSON — the experiment whose 108/108 result justified the whole product direction, and
whose measurement scripts became the production extract pipeline's ancestors. The entire
directory arrived in three commits: scripts + results on 2026-08-20 (`be3673d`, the plan
v0.1.0 docs commit), fixtures on 2026-08-21 (`4d3a45b`), and a README rewrite on
2026-09-10 (`204fd34`). Nothing else ever — a three-week freeze on everything except the
prose.

The audit's three questions, in the assignment's own framing: (1) are the results files
current relative to the scripts that produced them, (2) is the README accurate, (3) is
any of this dead weight that should be gitignored output rather than committed source.
The economics that made it worth checking: if the results were stale, the archived plans'
feasibility citations were decoration; if the directory were dead weight, it was 1.3 MB
of committed PNG in the clone for nothing; and if it were load-bearing, then a directory
nobody had audited was silently holding up CI.

## What We Did (blow-by-blow)
1. **Inventoried the directory and derived its staleness windows from git.** Measured
   census: 24 committed files — 11 `.mjs` scripts (`lib`, `matrix`, `downscale`,
   `narrate`, `control`, `metrics`, `show-metrics`, `run-extract`, `run-repeat`,
   `schema`, `score`), 4 `results-*.json`, 2 READMEs, 7 fixtures (3 original PNGs, 3
   shipped JPGs, 1 golden response). (The brief's per-class split didn't sum to its own
   24 total; the counts above are today's tree.) `git log -- research/` gave the three
   windows: everything code-shaped froze 2026-08-20/21, prose rewrote 2026-09-10.
2. **Read all 24 files.** Not skimmed — every script, every results file, both READMEs,
   every fixture's metadata.
3. **Re-measured every checkable claim today instead of trusting any of it:**
   - Re-scored `fixtures/golden-response.json` through `research/score.mjs`: **108/108,
     exact**.
   - Re-scored the stored merge inside `results-parallel.json`: **102/108 = 94.4%**, and
     the error list reproduces **bit-exact** — the same checks, in the same order, with
     the same messages.
   - Ran `show-metrics.mjs` and matched every number against `results-narrative.json`.
   - Verified image facts with `file` and byte sizes: original PNGs 739×1600, shipped
     JPEGs 560×1212 — matching what the READMEs and archived plans claim.
   - Traced cross-referenced files: `scripts/shipped-image-recipe.py` (the recipe that
     produced the shipped JPGs), `tests/research/score.test.ts` and
     `tests/research/goldenFixture.test.ts` (CI gates over the scorers),
     `npm run test:live:vision` (whose default fixture dir is this directory's
     `shipped/`), `lib/photos/resizeTarget.ts` (production consumer of the downscale
     findings).
   - Ran the consuming test suites: **89 tests, all green**.
4. **Verdict 1 — results vs scripts: CURRENT.** No script changed after its results were
   committed; everything reproducible was reproduced, everything not reproducible
   (the live 108/108 run itself) is pinned by the golden fixture that re-scores exact
   today. The archived plans' citations all check out against the committed numbers.
5. **Verdict 2 — READMEs: three defects, all fixed** (detail under Code / Design
   Details): the `out=1070` transcription error, the rule-10 provenance anachronism, and
   the main README's missing CI-gate/results-convention sections plus its wrong
   instruction about pointing `lib.mjs` at your own copies.
6. **Verdict 3 — dead weight: the OPPOSITE verdict.** The consumer sweep found:
   `results-narrative.json` read by `tests/llm.schema.test.ts:30` in CI;
   `schema.mjs`/`score.mjs` imported by ~16 test files; the live vision suite's default
   fixture directory inside `research/fixtures/`; D13 (F01 plan) explicitly ruling the
   four `results-*.json` kept. The ONLY uncited output was `run-extract.mjs`'s
   `results-extract.json` — and that one is genuinely output-shaped (rewritten on every
   rerun), so it got the gitignore treatment, not the whole directory.
7. **Fixed the harness** (`21ea99a`) — the three hardcoded DIR constants now default to
   the committed fixtures and honor `RI_FIXTURE_DIR`, deliberately the SAME override
   `tests/live/vision.live.test.ts` already uses; sharp resolves from this repo;
   narrate/control default to the production model with an env var to reproduce the
   original runs. Verified: `dataUri('1.png')` builds a valid data URI from the
   committed PNGs, sharp resolves, `node --check` clean on all five scripts.
8. **Fixed both READMEs** (`6f44204`) — the accuracy pass measured every surviving claim
   against today's tree; Prettier-clean.
9. **Gitignored the one true output file** (`8135e35`) — `research/.gitignore`, scoped,
   with a comment documenting the convention so the next reader knows why exactly one
   results file is ignored and four are committed.
10. **Final gate:** 89 tests green across the six research-consuming files, working tree
    clean, nothing merged (worker discipline — the coordinator lands the set).

## Code / Design Details

**The dead DIR constants (commit `21ea99a`).** Three scripts pointed at a directory that
no longer exists on any machine:

```js
// before — lib.mjs, matrix.mjs, downscale.mjs (identical constant):
const DIR = '/home/miftah/.claude/image-cache/3a4e3940-26e9-4619-8bb5-9e0f6c5e0ad9'
// after — lib.mjs:
const DIR = process.env.RI_FIXTURE_DIR
  ?? fileURLToPath(new URL('./fixtures/screenshots', import.meta.url))
```

The default resolves relative to the module itself, so the harness works from any
checkout on any machine; the `RI_FIXTURE_DIR` override is deliberately the same variable
`tests/live/vision.live.test.ts` already honors — one convention for "point the research
harness at different screenshots", not a second one invented next to an existing one.

**The cross-repo sharp import (same commit).** `downscale.mjs` reached into ANOTHER
project's dependencies by absolute path:

```js
// before:
const sharp = createRequire(import.meta.url)('/home/miftah/expense-tracking/node_modules/sharp/dist/index.cjs')
// after:
const sharp = createRequire(import.meta.url)('sharp')
```

sharp 0.35.3 is this repo's own dependency; the absolute path only ever worked on one
machine, and silently announced it by breaking everywhere else.

**The frozen model default (same commit).** `narrate.mjs` and `control.mjs` hardcoded
`glm-5.2`; production narrative moved to the glm-5.3 family (checked against
`lib/llm/catalog.ts`'s `NARRATIVE_TEXT_MODEL_IDS`):

```js
// after (both scripts):
model: process.env.LLM_NARRATE_MODEL ?? 'glm-5.3',
// with a comment: results-narrative.json was captured against glm-5.2 on 2026-08-20;
// production narrative is the glm-5.3 family since (lib/llm/catalog.ts);
// LLM_NARRATE_MODEL reproduces old runs.
```

The direction of the default follows production — a fresh run measures what the app
actually ships — while `LLM_NARRATE_MODEL=glm-5.2` keeps the original runs reproducible,
which matters because the committed results files were captured against glm-5.2 and the
README now says so.

**README defect (a) — the from-memory transcription** (`6f44204`). `fixtures/README.md`
said the golden fixture's completion was `out=1070`; the fixture was born with
`completion_tokens: 940` (1070 is the total, prompt + completion). The same 1070 sits in
archived plan F04 line 1341 — left as-is, the archive is a historical record of what F04
wrote, not a live claim. The README now carries the true split, and labels the
5,494/3,628 prompt figures as production-prompt numbers with the research-prompt
5,143/3,277 named alongside.

**README defect (b) — the provenance anachronism** (same commit). The bullet described
the capture prompt as "RULES 1-7 + additive 6a/8/9" — but F30's rule 10 landed
2026-08-26 (`8208dfe`), five days AFTER the fixture was captured (2026-08-21). The README
now states the truth in the useful direction: today's production prompt is a SUPERSET,
and the frozen capture predates rule 10 — so anyone re-running the experiment must know
the fixture can't speak for rules that came later.

**README defect (c) — the main README's blind spots** (same commit). It instructed
readers to "point lib.mjs's DIR at your own copies" — advice that made sense when the
fixtures lived in a wiped cache directory and is now wrong, since the committed fixtures
ARE the answer. And it never mentioned that `tests/research/` gates the scorers in CI, or
the results-file convention (four committed because tests and docs read them;
`results-extract.json` ignored because narrate-style reruns overwrite it — the hazard
that `narrate.mjs`'s output lands on a CI-read fixture path is now written down where
the next runner will see it).

**The scoped gitignore (commit `8135e35`), verbatim:**

```
# run-extract.mjs's output: rewritten on every rerun, cited by nothing. The four committed
# results-*.json are the opposite — kept deliberately, tests and docs read them (README.md).
/results-extract.json
```

Scoped to `research/` (a new `research/.gitignore`, not a line in the root file) because
the convention it documents is about this directory. Pattern verified with
`git check-ignore -v`, per the repo's positive-control habit for anything grep/glob-shaped.

**Verification receipts:**

| Check | Result |
|---|---|
| golden fixture re-scored through `score.mjs` | 108/108, exact |
| `results-parallel.json` stored merge re-scored | 102/108 (94.4%), error list bit-exact |
| `show-metrics.mjs` vs `results-narrative.json` | every number matches |
| PNG dims / shipped JPEG dims (`file`) | 739×1600 / 560×1212, as claimed |
| archived plan citations (F01 41.1 s, F07 1743/546, F30 variants) | all true against committed numbers |
| `dataUri('1.png')` from committed fixtures | valid data URI |
| sharp resolution from this repo | resolves |
| `node --check` on the five touched scripts | clean |
| consuming test suites | 89 tests green across 6 files |
| `git check-ignore -v research/results-extract.json` | matches the new pattern |
| working tree after | clean |

## Decisions & Trade-offs
- **Fix the harness rather than delete the directory.** The brief floated "dead weight →
  gitignore", and the consumer sweep inverted it: this directory is CI-load-bearing.
  Given that, the only correct move for a harness that couldn't run was to make it run —
  a feasibility lab you can't re-run isn't a lab, it's a museum plaque.
- **One override variable, borrowed not invented.** `RI_FIXTURE_DIR` already existed as
  the live vision suite's escape hatch; the research scripts now honor the same name.
  Two env vars meaning the same thing in adjacent directories is how conventions rot.
- **Default follows production; reproduction stays one env var away.** `glm-5.3` default
  because a fresh run should measure what ships; `LLM_NARRATE_MODEL` because the
  committed results are glm-5.2 artifacts and the README says so — without the escape
  hatch, "reproduce the original experiment" would have been quietly impossible after
  the fix.
- **No live API calls were spent.** The verification was structural (re-scoring stored
  responses, data-URI construction, sharp resolution, syntax checks) plus the existing
  test suites — proving the harness WOULD run without buying a single inference. The
  trade-off: a genuine API-side regression (prompt drift, model shape change) would not
  surface until the next real run. Accepted — that risk existed before this session too;
  the difference is the harness can now actually be picked up and run.
- **Archive keeps its errors.** F04 line 1341's `out=1070` transcription stays. The
  archive documents what F04 believed when it shipped; correcting it would falsify the
  record. Only living claim sites (the READMEs) were fixed.
- **Gitignore the one output-shaped file; commit the four artifact-shaped ones.** The
  line is not "results files are bad" — it's "files nothing reads and every rerun
  rewrites are output; files tests read are source". The gitignore's own comment carries
  that distinction so the next sweep doesn't re-litigate it.
- **Worker discipline held:** nothing merged, nothing pushed, no files touched outside
  `research/` (session work) and `docs/token_maxxing/` (this doc); the W4 report went to
  the coordinator, who owns the merge.

## Follow-ups & YAGNI notes
- **The narrate-overwrites-a-CI-fixture hazard is documented, not solved.** `narrate.mjs`
  writes its fresh output onto a path the schema test reads. The README now warns the
  runner; the cleaner fix — an explicit output path or a separate `--out` default — was
  deliberately not built until someone actually gets bitten post-warning.
- **The first real post-fix run is still owed.** Everything here is structural proof.
  The natural trigger: next time z.ai changes anything about the vision model, run
  `matrix.mjs`/`run-repeat.mjs` as the README has always said — it now works out of the
  box, and `LLM_NARRATE_MODEL=glm-5.2` reproduces the baseline for comparison.
- **The fixture corpus is 3 screenshots from one run.** A future session could broaden
  it (night runs, treadmill, truncated tables) — but only when a model change makes
  re-measurement necessary; broadening speculatively is exactly the YAGNI this campaign
  prunes.
- **`results-extract.json` was never committed even before the gitignore** — checking
  `git log` shows no history of it, so the ignore codifies existing practice rather than
  untracking anything. No `git rm --cached` needed, no history rewrite temptation.

## Appendix

**Files touched (per commit):**
```
commit 21ea99a — 5 files, +23/−6
M research/control.mjs    (glm-5.3 default + LLM_NARRATE_MODEL)
M research/downscale.mjs  (repo-local sharp; committed-fixture DIR + override)
M research/lib.mjs        (committed-fixture DIR + RI_FIXTURE_DIR override)
M research/matrix.mjs     (same)
M research/narrate.mjs    (glm-5.3 default + LLM_NARRATE_MODEL)

commit 6f44204 — 2 files, +26/−9
M research/README.md          (tests/research gates, results convention, DIR advice dropped)
M research/fixtures/README.md (out=940, rule-10 provenance, prompt-figure labels)

commit 8135e35 — 1 file, +3/−0
A research/.gitignore         (/results-extract.json + the convention comment)

this doc commit — 2 files
A docs/token_maxxing/2026-09-12-research-hygiene-audit.md
M docs/token_maxxing/README.md (index row)
```

**Commands and results (the audit's execution half):**
```
git log --format='%h %ad %s' -- research/  → 3-commit window: be3673d 08-20,
                                             4d3a45b 08-21, 204fd34 09-10
node research/<re-score drivers>           → golden 108/108; stored merge 102/108
show-metrics.mjs                           → matches results-narrative.json
file research/fixtures/screenshots/*.png   → 739x1600 PNGs; shipped JPEGs 560x1212
npm test (6 research-consuming files)      → 89 passed
node --check on 5 touched scripts          → clean
git check-ignore -v research/results-extract.json → matched
git status --porcelain                     → clean after the doc commit
```

**Git evidence chain:** worker commits `21ea99a` → `6f44204` → `8135e35`, then this docs
commit — all on branch `token-maxxing-2026-09-12-research-hygiene-audit`. NOT merged, NOT
pushed; the coordinator session (`tokenmax-orch-2026-09-12`) owns the merge of the
N=5 set.

**Session identity:** worker session `research-hygiene-audit`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; worktree
`/home/miftah/.worktrees/run-insights/tokenmax-2026-09-12-research-hygiene-audit`;
this docs commit was the branch tip at writing time.
