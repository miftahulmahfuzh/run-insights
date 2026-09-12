# Token-Maxxing Session — 2026-09-12: Nina Image-Worker Split

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-12`**
> (slug `nina-worker-split`), and the day's first *restructuring* worker —
> every sibling session in the index for this date swept, tested, compacted
> or documented; none of them moved code. The idea was **pre-assigned**
> rather than self-picked, so there was no idea menu: the coordinator
> handed over the target directly, with the reasoning attached — the repo's
> biggest untouched CLI file, and the one thing the day's sweeps never did
> was restructure anything.

## 🎯 Achievement / End Result

- **Goal of the burn:** (assignment, as handed over) split
  `scripts/nina-image-worker.ts` — 1333 lines, 14 distinct
  responsibilities spanning preflight / dedupe / claim / generate / store /
  finish / cleanup — into cohesive modules under a
  `scripts/nina-image-worker/` subdirectory, keeping the original
  `scripts/nina-image-worker.ts` as a thin re-export barrel so **no import
  path changes anywhere**. Why this idea: a real maintainability win on
  the biggest untouched CLI file in the repo, and the day's sweep wave
  never restructured a single file.
- **Concrete changes:** two commits on
  `token-maxxing-2026-09-12-nina-worker-split`:
  - `33a642a` — *"refactor(scripts): split nina-image-worker.ts into a
    barrel + nina-image-worker/ modules"* — **12 files changed, 1489
    insertions(+), 1264 deletions(-)**. The monolith becomes a **114-line
    barrel** plus **11 modules** (sql, preflight, claim, dedupe, generate,
    store, session, finish, cleanup, run, main).
  - `88db375` — *"docs(scripts): package_readme reflects the
    nina-image-worker split"* — `scripts/.workflows/package_readme.md`,
    **+16/−6**: the image-worker section now describes the barrel +
    directory layout and the entry-guard rule, and the "only `.ts` in the
    directory" claim (falsified by the new directory) is fixed.
- **Real value delivered:**
  - **The file a maintainer now opens is the file they need.** The
    monolith's 14 responsibilities became 11 modules of 40–327 lines
    each, each with a header naming its one responsibility. The 327-line
    `finish.ts` is the largest — smaller than a third of the original.
  - **Zero migration cost by construction.** The barrel re-exports
    exactly the old public surface, so the contract test
    (`tests/nina.imageworker.test.ts`, which imports
    `../scripts/nina-image-worker.ts`), the GitHub workflow
    (`.github/workflows/nina-image.yml`) and both npm scripts
    (`nina:worker`, `nina:worker:dry`) keep their paths untouched.
  - **One real bug caught by the gate that matters.** `typecheck` caught
    `finish.ts` using `NinaImageDedupHit` without importing it — the
    split's one genuine defect, found by `tsc`, not by review.
  - **The key judgment call is written into the code, not just made.**
    The `main()` entry guard **stays in the barrel** — it compares
    `import.meta.url` against `process.argv[1]`, and only the barrel's
    path is ever `argv[1]`. Moving it into the directory would have
    silently stopped `npm run nina:worker` from ever running a job while
    every import, test and typecheck stayed green. The comment in the
    barrel spells this out so the next splitter doesn't "tidy" it away.
  - **Every load-bearing comment survived the move verbatim.** 14
    occurrences of the worker's measured-findings markers (Finding 1,
    Finding 2, invariant 9) across the new modules — grep-counted after
    the move, because this repo's comments document measurements and are
    the point of the file, not decoration around it.
  - **Verification was evidence-shaped end to end**: full sweep, all six
    boundary guards (one of them *checked* rather than trusted — see
    below), a knip positive-control against clean HEAD, a live boot of
    the barrel against the real database, and both negative env paths
    re-proven with exit codes.
- **Branch:** `token-maxxing-2026-09-12-nina-worker-split`
  (coordinator-assigned worker worktree).
- **Merge status:** **NOT merged — worker mode.** The coordinator
  (`tokenmax-orch-2026-09-12`) owns the merge to main. (Verify via git,
  not this line — a doc written at session end cannot know the merge that
  follows it.)
- **Approx token burn:** high — one full 1333-line read plus a dependency
  map, an 11-module rewrite with verbatim comment preservation, then a
  5386-test full sweep, six CI guards, a knip baseline control, and three
  live node boots against the real database. The reading was the cheap
  half; the *re-verifying of everything the move could have broken* was
  the burn. 🔥

## Context & Motivation

The 2026-09-12 fan-out (`tokenmax-orch-2026-09-12`) ran a large fleet of
worker sessions across the repo — the index for this date carries the
siblings: YAGNI sweeps, package-readme compactions, test suites, doc
audits. Every one of them shrank, tested or verified. None restructured.
`scripts/nina-image-worker.ts` was the natural restructuring target for
three reasons that were true simultaneously:

1. **Size without cohesion.** 1333 lines and 14 distinct responsibilities
   in one file — the largest CLI file in the repo that no sweep had ever
   touched. It had grown this way honestly: RU-19/RU-20 put Nina's
   generation off-platform (78.2 s measured against Vercel Hobby's 60 s
   cap), and the worker accreted everything that decision required — its
   own SQL (it cannot import `lib/db/*` or `lib/nina/queries.ts`:
   `server-only` and `@/` aliases), its own env validation, its own
   preflight, its own ledger writes — in one place.
2. **A hard external contract to protect.** The file is importable BY the
   test suite (`tests/nina.imageworker.test.ts` pins its SQL shapes), is
   the executable for a GitHub Actions workflow, and backs two npm
   scripts. Any split that changed its path or surface would break all
   three — which is exactly what made the barrel shape the only correct
   one, and made the verification plan obvious: prove nothing about the
   contract moved.
3. **The comments are load-bearing.** The file's comments record measured
   findings (Finding 1's session policy, Finding 2, invariant 9) and the
   reasoning behind the strip-types import rule. A careless split would
   paraphrase or drop them; the session treated them as code.

The coordinator pre-assigned it, and the mandate arrived with its own
acceptance test: `npm run nina:worker` must still run a job afterwards.

## What We Did (blow-by-blow)

1. **Read the full 1333-line worker and mapped its dependency graph.**
   Not skimmed — read, because a split designed from grep output produces
   modules that share hidden state. The map produced the cut lines: the
   Neon client is built in exactly one place; preflight is
   self-contained; claim is the only lock in the system; finish is three
   ledger writers and nothing else.

2. **Designed the 11-module split** (module → contents):
   - `sql.ts` — `NeonSql` type + `connectSql`; the client, and the one
     place it is built (40 lines)
   - `preflight.ts` — `REQUIRED_COLUMNS`, `findSchemaDrift`, `preflight`
     (237)
   - `claim.ts` — `dispatchCutoffFor`, `claimJob` (123)
   - `dedupe.ts` — `findContentDuplicate` (55)
   - `generate.ts` — `fetchReference`, `generate` (219)
   - `store.ts` — private `putBlob` + `store` (120)
   - `session.ts` — `resolveWorkerSessionId` (83)
   - `finish.ts` — `finishSelfie`, `finishAvatar`, `closeFailed` (327)
   - `cleanup.ts` — `releaseBlobIfUnreferenced` (64)
   - `run.ts` — `runOneJob` (107)
   - `main.ts` — `parseArgv`, `main` (69)

   Modules total 1344 lines; add the 114-line barrel and the tree holds
   1558 lines where the monolith held 1333. The +225 is the cost of
   eleven module headers plus the barrel's module map, bought
   deliberately.

3. **Made the barrel the executable, not just a re-export wall.**
   `scripts/nina-image-worker.ts` keeps: the original header comment
   **verbatim** (78.2 s, the RU-19/RU-20 story, the strip-types rule, the
   cannot-import `lib/` trade), a new **"WHERE THE CODE LIVES"** module
   map naming each module and its exports, the full re-export list, and
   the `main()` entry guard. The npm scripts and the workflow execute the
   barrel exactly as they always did.

4. **Kept the entry guard in the barrel — the session's key judgment
   call.** The guard compares `fileURLToPath(import.meta.url)` against
   `process.argv[1]`. When npm runs
   `node --experimental-strip-types scripts/nina-image-worker.ts`,
   `argv[1]` is the **barrel's** path — always, because that is the path
   in `package.json` and in `.github/workflows/nina-image.yml`. A guard
   living in `main.ts` would compare `main.ts`'s URL against the
   barrel's path, never match, and `main()` would simply never fire:
   preflight would not run, no job would be claimed, and the failure
   would be a workflow that "runs green and does nothing." The guard now
   carries a comment stating it MUST stay in THIS file and why.

5. **Preserved every load-bearing comment verbatim through the move, and
   each module got a short header** naming its responsibility and
   restating the worker's import rules (`.ts`-suffixed relative imports,
   no `@/` aliases, no `server-only`, CJS packages via `createRequire`).
   Post-move grep count: 14 occurrences of the Finding 1 / Finding 2 /
   invariant 9 markers across six files (`preflight.ts` carries 5,
   `finish`/`session`/`run`/`claim` 2 each, the barrel's module map 1).

6. **Kept `finishAvatar` deliberately OFF the barrel.** `finish.ts`
   exports it for `run.ts`'s internal use; the barrel does not re-export
   it, because the old single file did not export it. The barrel's
   surface is the old file's surface — including its omissions. The
   module map says so in a parenthetical, so nobody "fixes" it into a
   breaking change later.

7. **Caught and fixed the split's one real bug.** First typecheck:
   `finish.ts` used `NinaImageDedupHit` without importing it — a
   cross-module type reference the monolith never needed because
   everything was one file. Imported; clean. The same first typecheck
   showed `PageProps`/`LayoutProps` errors in `app/` — the known
   fresh-worktree missing-typegen noise, cleared by `next typegen`, not
   defects.

8. **Ran the full gate battery** (details in Code / Design Details):
   typecheck, the full vitest sweep, all six `ci:*` boundary guards,
   knip with a positive control, and the live entry-path smoke including
   both negative env paths.

9. **Updated `scripts/.workflows/package_readme.md`** (`88db375`): the
   image-worker section gained the directory layout and module list, the
   entry-guard rule stated as a MUST, and the falsified "the only `.ts`
   in the directory" claim corrected — the barrel is now the only `.ts`
   at the top level, and the precedent-holder for the strip-types import
   rule is the barrel-plus-directory, not a lone file.

10. **Left the stale line-number citations alone, on purpose** (see
    Follow-ups), and committed as two commits — the split and the readme
    — so each is independently revertible.

## Code / Design Details

**The barrel's shape** (the whole point of the design, compressed):

```ts
// scripts/nina-image-worker.ts — 114 lines
/** ...original header verbatim... +
 * ── WHERE THE CODE LIVES ──
 *   sql.ts        NeonSql and connectSql — the client, and the one place it is built
 *   preflight.ts  REQUIRED_COLUMNS, findSchemaDrift, preflight — the ground it stands on
 *   claim.ts      dispatchCutoffFor, claimJob — the only lock in the system
 *   ... (11 entries)
 * (finishAvatar is exported by finish.ts for run.ts but deliberately not
 *  re-exported here — the barrel's surface is the old file's surface.)
 */
export type { NeonSql } from './nina-image-worker/sql.ts'
export { parseArgv, main, type WorkerArgv } from './nina-image-worker/main.ts'
export { REQUIRED_COLUMNS, findSchemaDrift, preflight, type SchemaColumn } from './nina-image-worker/preflight.ts'
// ... full old surface, and nothing else
export { finishSelfie, closeFailed } from './nina-image-worker/finish.ts'  // no finishAvatar
export { runOneJob } from './nina-image-worker/run.ts'

import { fileURLToPath } from 'node:url'
import { main } from './nina-image-worker/main.ts'

/* The guard MUST stay in THIS file: it compares import.meta.url against
 * process.argv[1], and the barrel's path is the only one either npm or
 * the workflow ever puts in argv[1]. */
if (process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code)).catch((error) => { ...; process.exit(1) })
}
```

**The entry-guard failure mode, stated plainly** because it is the kind
of bug that passes every gate: if the guard moved into `main.ts`, then
`import.meta.url` would be `.../nina-image-worker/main.ts` while
`argv[1]` is `.../scripts/nina-image-worker.ts`. The comparison fails.
`main()` never runs. The test suite still passes (it imports and calls
`parseArgv`/`generate` directly, no guard involved), typecheck passes,
the CI guards pass — and the nightly sweep silently stops claiming jobs.
The only thing that would catch it is the live boot, which is why the
smoke test ran the real command.

**Line-count ledger, measured post-move** (`wc -l`):

| Piece | Lines |
|---|---|
| old monolith | 1333 |
| barrel `nina-image-worker.ts` | 114 |
| `finish.ts` | 327 |
| `preflight.ts` | 237 |
| `generate.ts` | 219 |
| `claim.ts` | 123 |
| `store.ts` | 120 |
| `run.ts` | 107 |
| `session.ts` | 83 |
| `main.ts` | 69 |
| `cleanup.ts` | 64 |
| `dedupe.ts` | 55 |
| `sql.ts` | 40 |

Commit `33a642a`: 12 files changed, **+1489/−1264**.

**Verification results, each with its evidence:**

| Gate | Result | Evidence shape |
|---|---|---|
| `npm run typecheck` (typegen + `tsc --noEmit`) | clean | one real fix (missing `NinaImageDedupHit` import in `finish.ts`); `app/` PageProps noise cleared by typegen |
| full vitest sweep | **5386/5386 passed, 292 files** | includes the 55-test contract suite (`nina.imageworker` + `nina.imageDedupe`) that pins the worker's SQL shapes — the barrel path it imports is unchanged |
| six `ci:*` boundary guards | all pass | openrouter guard **checked, not trusted**: its `DIRS = ['app','lib','components']` — it never scanned `scripts/`, so the new directory is correctly out of scope |
| knip | zero findings referencing nina-image-worker | **positive-controlled**: knip at clean HEAD in a throwaway worktree produced identical baselines (31 unused exports / 50 unused exported types / 1 duplicate) — the diff adds no dead exports |
| entry-path smoke | `npm run nina:worker:dry` boots the barrel, loads all 11 modules under `--experimental-strip-types`, passes preflight against the real database: `preflight ok { jobId: null, mode: 'sweep' }`, **exit 0** | the real command, not an import-level test |
| negative path: no `DATABASE_URL` | dies at `neon()`, **exit 1** | identical ordering to the original — the old `main` also built the client before preflight |
| negative path: partial env | reaches preflight's own message (`missing BLOB_READ_WRITE_TOKEN, OPENROUTER_API_KEY`), **exit 1** | proves preflight's hand-rolled validation survived the move |

**The measurement trap worth remembering:** the first negative-path check
piped node's output through `tail` and read **tail's exit code**, not
node's — a green that answered the wrong question. Re-measured with the
redirect pattern (`node ... > out 2>&1; echo $?`) so the exit code came
from the process under test. (Same family as the repo's known lessons:
a green gate must answer *your* question, and a pipe reports its last
stage.)

## Decisions & Trade-offs

- **Barrel-with-directory over pure move, because the path is a
  contract.** Three consumers hold the path: the test's import, the
  workflow's execute step, and two npm scripts. A pure move (delete the
  file, repoint everyone) would have been a smaller diff but a breaking
  one, and would have forfeited the strongest verification available —
  "the contract suite passed unchanged" proves the surface when the
  surface's address did not move. The 114 lines of barrel are the price
  of that proof.
- **The executable role stays with the barrel.** A alternative design —
  barrel exports only, `main.ts` self-executing — is exactly the
  argv[1] trap above. The rule that fell out: **the file whose path
  appears in `package.json` is the file that owns the entry guard.**
- **Surface discipline including omissions.** Not re-exporting
  `finishAvatar` is a decision, not an oversight: exporting it would
  have *widened* the public surface during a refactor, which is how
  refactors acquire permanent API. The old file's exports are the
  barrel's exports, no more.
- **Verbatim comments over cleaner prose.** Rewriting "Finding 1" into
  friendlier wording would have severed the thread between the code and
  the plan documents that define the findings. The comments moved
  byte-for-byte; only module headers are new prose.
- **+225 net lines accepted.** A split that must preserve a verbatim
  header, add eleven module headers, and carry a module map will grow.
  The alternative (no headers, no map) makes the directory
  unnavigable — the map in the barrel is the index a reader opens
  first.
- **Stale line-number references left untouched** (the follow-up, below):
  out of scope, collision surface under a parallel fan-out, and the name
  references remain accurate through the barrel. A docs sweep is the
  right tool, on the right day, with the right owner.
- **Two commits, not one.** `33a642a` (refactor) and `88db375` (docs)
  separate so the readme update is revertible without the code and vice
  versa, and so the refactor commit's message carries the full gate
  results for whoever audits the split from `git log` alone.

## Follow-ups & YAGNI notes

- **Line-number citations into the old monolith now drift.** Doc
  comments across `lib/` and `.workflows/` reference
  `scripts/nina-image-worker.ts:<line>` (e.g. `:383`, `:641`, `:768`).
  Measured 2026-09-12: **18 files** carry such references — mostly
  `.workflows/plan/**` and `.workflows/orchestration/**` prose, two hits
  in lib/nina source comments (`lib/nina/imagerecipe.ts`), one in
  `scripts/nina-profpic.mjs`. The **name** references remain accurate
  (the barrel re-exports every name), but the line numbers point into a
  file that is now 114 lines. Deliberately untouched today: the files
  are outside this session's scope, several sit in trees parallel
  workers may be editing (collision surface), and the orchestration
  records are historical — per convention **never reworded**. A future
  docs sweep can re-point the living ones at the new module paths.
- **Not done, and not wanted yet: narrowing `finish.ts`.** At 327 lines
  it is the largest module, but it is one cohesive thing (the ledger
  writes); splitting it further would trade one navigable file for two
  fragments.
- **The module map in the barrel is hand-maintained.** If a module is
  added or renamed, the map must be edited — a knip run will catch a
  dead module, but not a stale map line. Accepted; eleven entries is
  below the threshold where automation pays for itself.
- **Contract-suite growth opportunity (noted, not acted on):** the 55
  tests pin SQL shapes via the barrel; they deliberately do not care
  where each export lives. That indirection is what made the split
  safe — keep it that way. Any test reaching into
  `scripts/nina-image-worker/<module>.ts` directly would re-couple the
  suite to the layout the barrel exists to absorb.

## Appendix

**Commits (on `token-maxxing-2026-09-12-nina-worker-split`):**

```
88db375 docs(scripts): package_readme reflects the nina-image-worker split
        scripts/.workflows/package_readme.md | 22 +++++++++-----
        1 file changed, 16 insertions(+), 6 deletions(-)

33a642a refactor(scripts): split nina-image-worker.ts into a barrel + nina-image-worker/ modules
        scripts/nina-image-worker.ts           | 1309 ++------...
        scripts/nina-image-worker/{claim,cleanup,dedupe,finish,generate,
          main,preflight,run,session,sql,store}.ts             (new)
        12 files changed, 1489 insertions(+), 1264 deletions(-)
```

**Key commands and checks run this session:**

```bash
npm run typecheck                 # typegen + tsc --noEmit — clean after one fix
npx vitest run                    # 5386/5386 across 292 files
# ci:openrouter-guard et al. — all six pass; DIRS checked = ['app','lib','components']
npx knip                          # 0 findings here; clean-HEAD control identical (31/50/1)
npm run nina:worker:dry           # preflight ok { jobId: null, mode: 'sweep' }, exit 0
node --experimental-strip-types --env-file=.env.local scripts/nina-image-worker.ts --dry-run
                                  # negative paths re-measured with redirect, not a pipe
grep -c "FINDING 1\|Finding 2\|invariant 9" scripts/nina-image-worker/*.ts   # markers survived
wc -l scripts/nina-image-worker.ts scripts/nina-image-worker/*.ts            # the ledger above
```

**The one defect the split introduced, for the record:**
`finish.ts` used `NinaImageDedupHit` without importing it — impossible
in the monolith (one file, one scope), inevitable somewhere in an
eleven-module cut, and caught by the gate designed to catch exactly it.
Typecheck is not optional after a mechanical refactor; it is the
refactor's real reviewer.

**Provenance:** split landed `33a642a`, readme landed `88db375`, both
2026-09-12 (WET, +0700), tree clean at doc-write time. This session doc
and the index row are the only files this session writes beyond those
two commits.
