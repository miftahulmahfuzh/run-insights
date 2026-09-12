# Token-Maxxing Session — 2026-09-12: Nina Queries Split

## 🎯 Achievement / End Result
- **Goal of the burn:** split `lib/nina/queries.ts` — the repo's largest file (4573 lines,
  113 exported symbols: 83 runtime values + 30 types, twenty banner-delimited sections) —
  into 13 domain modules under `lib/nina/queries/` behind an unchanged public barrel, with
  **zero behavior change** proven per phase by byte-identity diffs. Coordinator-assigned as
  the worker idea of set `tokenmax-orch-2026-09-12`, slug `nina-queries-split`.
- **Concrete changes:** ten commits on `token-maxxing-2026-09-12-nina-queries-split` —
  - `2f07416` — `analyze(nina): plan the queries.ts split — 8 reconciled phases` (the
    analysis + reconciled plan set, written to `./NINA_QUERIES_SPLIT_PLAN.md` + 8 phase
    plans under `lib/nina/.workflows/plan/P1-NIN-A040..047.md`).
  - `1adfd74` — phase 1: §1 Shapes + §2 Column lists → `queries/{shapes,columns}.ts`;
    queries.ts drops to §3+; **new barrel contract test** `lib/nina/queries.test.ts`
    freezing the 83-name runtime surface; real `node_modules` install (the worktree's
    symlink was replaced by a genuine install so `next build` could ever gate).
  - `60ffea7` — bookkeeping: phase-1 completion record (drift + decisions, P1-NIN-A040).
  - `20b4c15` — phase 2: §3 Identity + §4a Sessions → `queries/sessions.ts` (9 exports +
    private `readNinaSessionsWithActivity`; 3 sanctioned pointer rewrites).
  - `374353c` — phase 3: §4b Messages + §4c mutation → `queries/messages.ts` (9 functions +
    private `messageScope`; 2 sanctioned pointer rewrites).
  - `13072ab` — phase 4: §5 Images + §5a-2 media view + §5b admin photo writes →
    `queries/images.ts` (19 exports); barrel grows 83→85 — the set's only documented
    surface growth (`generatedChatPhotoScope` + `isOriginalPhoto` become internal-shared,
    plan-index Decision); dedupe scripts' line-pointer comments repointed.
  - `76c7c33` — phase 5: §6 Memory + §6b Shortcuts + §7 Nags + §8 Turns → four modules
    (17 exports + 4 private helpers, zero prose rewrites, zero import-backs).
  - `8c82eb4` — phase 6: §9 Avatars + §9b album file manager → `queries/avatars.ts`
    (23 exports + private `folderSubtree`; import block replaced with the exact minimal
    §10–§12 requirement, preserving phase 4's images import-back).
  - `d07c554` — phase 7: §10 + §10b + §11 + §12 → `queries/{tuning,imageprefs,jobphotos}.ts`
    — **the barrel completes**: header + exactly 12 `export *` lines, zero imports, zero
    SQL (49 lines at this point); the DAG's two cross edges land in `imageprefs.ts`.
  - `802d3a1` — phase 8: final sweep — the barrel header gains the 13-module map
    (invariant prose byte-identical, final barrel: 70 lines measured 2026-09-12); every
    line-pointer and §-pointer the split made false is repointed (16 across the layer and
    4 in live code outside it); `lib/nina/.workflows/package_readme.md` restated over the
    layer layout; `lib/.workflows/package_readme.md` verified NO-OP with grep evidence.
- **Real value delivered:**
  - **The single biggest maintainability lever in the codebase is pulled.** Merge-conflict
    surface drops from one 4.5k-line file (where every Nina conversation/image/memory/
    avatar/tuning change collided) to 13 focused domain modules. Navigation cost drops
    with it: a reader opens the 250-line module they need, not a 4.5k file.
  - **Zero behavior change, proven not asserted.** Every phase's moved bytes were verified
    identical by diff (modulo a small, enumerated set of sanctioned pointer rewrites per
    phase); SQL text, signatures, return shapes and error behavior are untouched; the 14
    source importers needed no edits — the barrel contract held by construction.
  - **The public surface is now frozen by a test.** `lib/nina/queries.test.ts` asserts
    `Object.keys(barrel).sort()` equals the exact 85-name list (83 original + the two
    documented internal-shared helpers) and that everything exported is a function —
    `export *` can no longer change the surface by accident. It stayed green unmodified
    through phases 2, 3, 5, 6 and 7, which is the split's strongest single signal.
  - **The plan set itself is a reusable artifact:** 8 phases, each with byte-proof
    verification steps, explicit Does-not-touch boundaries, and a reconciled cross-phase
    decision log — executed end to end without a single behavior-change escape.
- **Branch:** `token-maxxing-2026-09-12-nina-queries-split` (worker does NOT merge — the
  coordinator set `tokenmax-orch-2026-09-12` lands it).
- **Merge status:** on branch (worker session; coordinator lands).
- **Approx token burn:** very high (est. ~2.5M, input-dominated) 🔥 — the burn went into
  `/analyze` with 8 parallel planner subagents (6 of them rate-limited and resumed
  staggered), a plan-reconciler over 15 cross-plan conflicts, then 8 sequential implement
  phases each re-reading multi-hundred-line file regions, building byte-proof diffs, and
  running scoped gates — plus three full vitest sweeps (4358, then 5388 tests), a real
  `npm ci`, and a Turbopack production build at the end.

## Context & Motivation

Every Nina read and write — identity, sessions, messages, images, memory slots, shortcuts,
nags, turns, avatars, tuning, image-gen prefs, job-photo links — lived in one file:
`lib/nina/queries.ts`, 4573 lines, 113 exported symbols, organized as twenty
banner-delimited `§` sections. Consumers import a handful of symbols each but pay for the
whole file in navigation, and any two Nina features touching the file in parallel collide
in merge conflicts. The file also carried a famous pair of layer-wide invariants in its
header (userId scoping on every function; never writing her own SQL against `runs`) that
deserved to stay in one authoritative place.

The idea was **coordinator-assigned** — the worker of set `tokenmax-orch-2026-09-12` was
told to execute the queries split — but the worker's own survey confirmed the assignment:
it is the single largest file in the repo, its sections are already domain-shaped (the §
banners map almost one-to-one onto target modules), and its 14 importers all go through
the single module path, so a barrel keeps every consumer and every prose contract that
cites the file by name true for free.

The approach follows the pattern of prior session `2026-09-11-lib-nina-queries-yagni`
(which had removed the layer's one truly dead export) and the repo's standing
"move-behind-a-barrel" playbook: shrink the file section by section, re-exporting what
moved, so the public surface never moves at all.

## What We Did (blow-by-blow)

### Planning: /analyze --no-worktree, 8 parallel planners, one reconciler

The session ran `/analyze --no-worktree` (planned in place in the worktree, branch based
on origin/main @ `2c823eb`). The analysis produced an 8-phase cut of the file (foundation
first, then domains in file order, then the documentation sweep), and 8 planner subagents
wrote the phase plans in parallel.

The planners tripped the model router's burst rate limit — 6 of the 8 hit glm-429s. The
fix was not concurrency reduction but **staggered resume in pairs**: resuming all six at
once re-tripped the limiter; resuming two at a time let all eight complete.

A plan-reconciler then resolved **15 cross-plan conflicts** across the 8 plans. The
notable ones:

- **The barrel is 12 `export *` lines, not 13.** `columns.ts` (the four shared column
  lists) is deliberately module-internal and never re-exported — it was private before
  the split and stays private after. Several plans had assumed one re-export per module.
- **Phase 1 was missing the 27-name import-type back-import.** `shapes.ts`'s §1 types
  reference schema members and the remaining sections reference the §1 types; without the
  type-only back-import into the shrinking barrel, phase 1's tree would have failed
  `tsc`. Caught at reconcile time, not at implement time.
- **Two analysis-doc DAG edges were proven comment-only.** The claimed §12→§2 edge
  (jobphotos needing columns) exists only in a docstring — so `jobphotos.ts` imports
  nothing from `./columns`. Chasing phantom DAG edges would have manufactured real
  imports out of prose.

### Phase 1 (1adfd74): foundation + the contract test

§1 Shapes → `queries/shapes.ts` (520 lines, the DTO types, ruling A1's home) and §2
Column lists → `queries/columns.ts` (91 lines, four internal-shared lists). The barrel
kept §3+ and its byte-identical layer-invariant header, gained
`export * from './queries/shapes'` and a local import of the column lists (imported,
never re-exported). Two pieces of plan drift were resolved **in favor of the plans' own
heredocs** (rung 3: a code block is complete by construction):

- `shapes.ts`'s header is 30 lines, not the 28 its arithmetic commentary derived —
  body starts at :31, file is 520.
- `queries.ts` landed at 4051 lines, not 4052 — the plan's assembly double-blanked the
  import seam (heredoc trailing blank + `head -b` leading blank); prettier flagged it,
  one blank removed by hand. The commit records the measured seams (rest at 163–4051,
  layer header at 110–145, barrel block at 147–162) and warns later phases to use
  content anchors, not stale offsets.

The phase also installed `node_modules` for real: the worktree had a symlinked
node_modules (passes vitest + tsc) but Turbopack's build rejects symlinks — so the
session's end-of-set build gate required a genuine `npm ci`.

One more near-miss from the record: `/tmp/p1-*` capture-file names nearly collided with
another concurrent session's files; namespacing the capture directory fixed it.

### Phases 2–6 (20b4c15 → 8c82eb4): the domains move

Each phase: lift the § span into its module, run the byte-proof diff (moved bytes must be
identical except the phase's enumerated sanctioned rewrites), update the barrel (add the
`export *` line, prune now-dead imports and import-backs that have zero remaining
callers — each verified by a comment-stripped scan), run scoped gates
(typecheck + scoped vitest + eslint + prettier), commit.

- **Phase 2** — sessions: 9 exports + private `readNinaSessionsWithActivity`; 3 sanctioned
  pointer rewrites (this-module → barrel citations). Barrel gained its single
  `getNinaSession` import-back (§4b's `insertNinaMessages` still needs it at this point).
- **Phase 3** — messages: 9 functions + private `messageScope`; 2 sanctioned rewrites
  (a docstring self-reference and §4c's forward §5 pointer). The `getNinaSession`
  import-back was pruned — zero code-level callers remained in §5+.
- **Phase 4** — images (the big one, 984 lines): 19 exports + private
  `mediaCollectionScope`; 4 sanctioned lines — `isOriginalPhoto` and
  `generatedChatPhotoScope` gain `export` as internal-shared helpers per the reconciled
  plan-index decision, and two §9 pointers rewrite to the avatars module. The barrel's
  frozen surface grew 83→85 **in the same commit** as the test-list update, with a
  pointer to the decision — exactly the protocol the contract test's header prescribes.
  Also repointed three already-stale line-pointer citations in the dedupe scripts
  (comments only) and the `generatedChatPhotoScope` source-slice test.
- **Phase 5** — memory/shortcuts/nags/turns, four modules in one phase (17 exports + 4
  private helpers): zero prose rewrites needed — the span's only § occurrences are the
  four banner titles, proven by grep. Barrel reached 8 `export *` lines, no import-backs.
- **Phase 6** — avatars: 23 exports + private `folderSubtree`; §9b's six §9 mentions
  proven intra-module prose (comment-only, zero code calls — no import manufactured).
  The barrel's import block was wholesale-replaced with the exact minimal §10–§12
  requirement, preserving phase 4's images import-back and adding `countNinaAvatars`
  (§10b's only code-level reference into moved symbols).

### The one real mistake: wrong byte ranges, caught by byte-proof

Mid-set, a shell-variable-persistence slip (variables not surviving a subshell boundary)
briefly extracted **wrong byte ranges into 3 modules**. The byte-proof diffs caught it —
empty-diff-or-die did exactly its job — and the extraction was redone cleanly **before
any commit**. Nothing erroneous ever landed. (Related zsh sharp edge from the same
stretch: `$BASE:path` in a double-quoted reference ate the `:path` modifier — braced
`${BASE}:path`-style refs fixed it.)

### Phase 7 (d07c554): the barrel completes

§10 tuning, §10b imageprefs, §11+§12 jobphotos move verbatim (byte-proof diffs empty).
`imageprefs.ts` carries the DAG's two real cross edges (`countNinaChatPhotos` +
`generatedChatPhotoScope` from `./images`, `countNinaAvatars` from `./avatars`);
`jobphotos.ts` imports nothing from `./columns` (the docstring-only edge). Three
source-reading tests repointed to the new module paths. The barrel reached its end-state:
**49 lines** — byte-identical header + exactly 12 `export *` lines, zero imports, zero
function bodies, zero SQL. Full vitest gate: 4358 tests / 220 files green.

### Phase 8 (802d3a1): the documentation sweep

- The barrel header gained the **13-module map** (which § lives where) while the
  invariant prose stayed byte-identical (one wording change: "in one module" → "in one
  layer", required by the split itself). Final barrel: **70 lines** (measured 2026-09-12;
  49 was the phase-7 waypoint before the map).
- Pointer audit: repointed every line-pointer and §-pointer the split made false —
  1 in `shapes.ts`, 2 in `messages.ts`, 2 in `images.ts` (stale-on-arrival line numbers
  that now resolve into the wrong file entirely), 7 in `queries/imageprefs.ts`, and 4
  live-code pointers outside the layer (`lib/nina/searchActions.ts` §4, `folderOps.ts`,
  `ninaAlbumActions.ts`, model-layer `imageprefs.ts`). Audit gate: zero
  `nina/queries.ts:NNN` pointers survive in live code; all § hits inside the layer are
  banners, provenance, or intra-module prose.
- `lib/nina/.workflows/package_readme.md` restated over the layer layout — rules not
  state, counts re-measured and dated, the barrel test named, the
  `admin.memory` one-level-walk blind spot documented.
- `lib/.workflows/package_readme.md` verified NO-OP (it documents lib/date+flags+derived;
  its two nina mentions remain true).
- Knip: no findings on the internal-shared exports (the annotation follow-up stays
  hypothetical).
- Full final gates: prettier clean, typecheck green, **FULL vitest 5388 tests / 293
  files green**, knip observed, `next build` green under Turbopack.

## Code / Design Details

### The end state

`lib/nina/queries/` — 13 modules, 4819 lines total (measured 2026-09-12):

| Module | § sections | Lines | Contents |
|---|---|---|---|
| `shapes.ts` | §1 | 520 | the DTO types — ruling A1 lives here |
| `columns.ts` | §2 | 91 | four shared column lists — module-internal, never re-exported |
| `sessions.ts` | §3 + §4a | 488 | identity and the sessions |
| `messages.ts` | §4b + §4c | 450 | the messages and their mutation |
| `images.ts` | §5, §5a-2, §5b | 984 | images, the media view, the admin photo writes |
| `memory.ts` | §6 | 212 | memory slots and the facts ledger |
| `shortcuts.ts` | §6b | 231 | the trigger → expansion registry |
| `nags.ts` | §7 | 67 | the escalation ledger |
| `turns.ts` | §8 | 83 | the turn audit trail |
| `avatars.ts` | §9 + §9b | 906 | her album and its file-manager reads |
| `tuning.ts` | §10 | 188 | character tuning |
| `imageprefs.ts` | §10b | 350 | image-gen prefs + photo references |
| `jobphotos.ts` | §11 + §12 | 249 | the job → photograph link |

`lib/nina/queries.ts` itself is the public barrel: the byte-identical
layer-invariant header (userId scoping on every function with no credential-addressed
exception; never writing her own SQL against `runs`; `db.batch` never `db.transaction`;
`ORDER BY seq` needs no tiebreak; no `import 'server-only'` so Vitest and
`scripts/*.mjs` can import it), plus the module map, plus exactly 12 re-export lines —
zero imports of its own. The § numbers persist inside the modules as banners: "a §4b
title inside `messages.ts` is by design, not staleness."

### The barrel contract test (the split's safety net)

`lib/nina/queries.test.ts` (written in phase 1, grown once in phase 4, green unmodified
in every other phase):

```ts
const BARREL_VALUE_EXPORTS = [ /* 85 names, sorted */ ]

it('exposes exactly the frozen public surface — nothing more, nothing less', () => {
  expect(Object.keys(barrel).sort()).toEqual(BARREL_VALUE_EXPORTS)
})
it('exposes nothing at runtime except functions (the §1 shapes are types only)', () => {
  for (const name of Object.keys(barrel).sort()) {
    expect(typeof (barrel as unknown as Record<string, unknown>)[name]).toBe('function')
  }
})
```

Derived mechanically by a TypeScript-AST walk of `queries.ts` **before any section
moved**. Type-only exports (the 30 — 27 §1 interfaces plus three riding in §5b/§12) are
invisible at runtime by nature and are covered by `npm run typecheck` against the live
importers. The header spells out the growth protocol: a failure because a name was
ADDED is legitimate only as a documented decision, recorded in the same commit, sorted,
with a pointer to the decision — never weaken the assertion to a `toContain`.

### The byte-proof discipline

Every phase's verification is a diff of moved bytes against their source range; the diff
must be empty except for the phase's enumerated sanctioned rewrites (docstring
self-references, this-module citations, `export` keywords on plan-sanctioned
internal-shared helpers). Content anchors, not line offsets — after phase 1's drift
proved plan arithmetic can be off by one or two even when its heredoc is exact, the
commit records the rule explicitly: "later phases: content-anchor, don't trust stale
offsets."

## Decisions & Trade-offs

- **Barrel, not path-rewrites.** The 14 source importers keep importing
  `@/lib/nina/queries`; nothing consumer-side changes, and prose contracts that cite
  `lib/nina/queries.ts` by name stay literally true. The cost — a barrel indirection —
  is zero at runtime (static re-exports) and the surface is now test-frozen.
- **12 re-export lines, not 13.** `columns.ts` stays module-internal (private before,
  private after). Re-exporting it would have widened the public surface as a side
  effect of a refactor — exactly what the contract test exists to prevent.
- **83→85, the only surface growth, paid for with a decision.** `generatedChatPhotoScope`
  and `isOriginalPhoto` needed to cross module boundaries as code (not copy-paste), and
  surfacing through `export *` was accepted rather than manufacturing a private
  cross-module channel — recorded as plan-index Decisions, encoded in the test list
  with a comment, verified absent from knip's findings.
- **One `shapes.ts`, not types-co-located.** All §1 DTO types stay in one foundation
  module (mirroring the flat model layers' naming). Co-locating types into domain
  modules is recorded as a possible future refinement, not done now.
- **Heredoc wins over arithmetic.** Where a plan's derived line-count commentary
  contradicted the plan's own code block, the code block was trusted (it is complete by
  construction); the drift was recorded in the phase commit so later phases wouldn't
  inherit the stale offsets.
- **Historical records are not rewritten.** Only live prose that became false was fixed
  (R7): the dedupe scripts' line-pointer comments were repointed because they are live
  navigation aids; archived plans and completed todos were left alone.
- **The pre-existing repo-wide lint error was recorded, not fixed.**
  `components/review/MoreDetails.test.tsx` (`prefer-const`) predates this branch
  (present on origin/main) and is outside the set's scope — fixing unrelated files
  inside a zero-behavior-change refactor would pollute the byte-proof story.
- **readme-updater not dispatched per-phase.** All `package_readme` updates belong to
  phase 8 (R8 boundary); running it in phases 1–7 would have violated each phase's
  Does-not-touch list.

## Follow-ups & YAGNI notes

1. **`tests/admin.memory.test.ts`'s one-level `readdirSync` walk doesn't see `queries/`
   subdirs** — its source-inventory check needs a recursive walk. Small follow-up;
   documented in the restated `lib/nina` package_readme so it isn't forgotten.
2. **Pre-existing "ON DELETE CASCADE" prose rot in `queries/images.ts`** — false before
   the split (the code never had it), now easier to find; one-line follow-up.
3. **knip annotation for the 2 internal-shared exports** (`generatedChatPhotoScope`,
   `isOriginalPhoto`) if they ever get flagged — they weren't, as of phase 8's knip run.
4. **Co-locating `shapes.ts` types into domain modules** — possible future refinement;
   the single foundation module was the deliberate, recorded choice for this pass.
5. **Pre-existing repo-wide lint error** in `components/review/MoreDetails.test.tsx`
   (`prefer-const`) predates this branch (verified on origin/main) — belongs to a
   generic cleanup pass, not this set.

## Appendix

### Commits (worker branch, oldest first)

| Commit | What |
|---|---|
| `2f07416` | analyze: the 8-phase reconciled plan set (`NINA_QUERIES_SPLIT_PLAN.md` + `lib/nina/.workflows/plan/P1-NIN-A040..047.md`) |
| `1adfd74` | phase 1: shapes + columns behind the barrel; contract test; real node_modules |
| `60ffea7` | bookkeeping: phase-1 completion record (drift + decisions) |
| `20b4c15` | phase 2: sessions (P1-NIN-A041) |
| `374353c` | phase 3: messages (P1-NIN-A042) |
| `13072ab` | phase 4: images; surface 83→85 documented (P1-NIN-A043) |
| `76c7c33` | phase 5: memory/shortcuts/nags/turns (P1-NIN-A044) |
| `8c82eb4` | phase 6: avatars (P1-NIN-A045) |
| `d07c554` | phase 7: tuning/imageprefs/jobphotos — barrel completes (P1-NIN-A046) |
| `802d3a1` | phase 8: module map, pointer audit, readme restated (P1-NIN-A047) |

### Measured numbers (2026-09-12, this worktree)

- Pre-split: `lib/nina/queries.ts` = 4573 lines, 113 top-level exports
  (`git show 2f07416:lib/nina/queries.ts | wc -l` / `grep -c '^export'`).
- Post-split: 13 modules in `lib/nina/queries/` = 4819 lines total; barrel = 70 lines
  (49 at phase 7 + phase 8's 22-line module map).
- Barrel runtime surface: 85 exported functions (83 original + 2 internal-shared),
  frozen by `lib/nina/queries.test.ts`.
- Final gates: FULL vitest **5388 tests / 293 files** green; typecheck green;
  `next build` green under Turbopack; knip no new findings; eslint 0 errors on the
  touched scope (1 pre-existing repo-wide error recorded above).

### Notable events for the record

- **8 concurrent planners vs the router's burst rate limit:** 6 hit glm-429s; resuming
  all at once re-tripped it; **staggering resume in pairs** let all eight complete.
- **`/tmp/p1-*` capture-name near-collision** with another concurrent session's files —
  a namespaced capture directory fixed it.
- **zsh `$BASE:path`** ate the `:path` modifier inside an unbraced reference — braced
  refs fixed it.
- **Two plan-arithmetic off-by-twos** (shapes header 30-vs-28; queries.ts 4051-vs-4052
  from a double-blanked import seam) — both resolved in favor of the plans' own
  heredocs, both recorded in the phase-1 commit.
- **A shell-variable-persistence slip** briefly extracted wrong byte ranges into 3
  modules — caught by the byte-proof diffs and redone cleanly before any commit.

### References

- Plan set: `./NINA_QUERIES_SPLIT_PLAN.md` (repo root), phases at
  `lib/nina/.workflows/plan/P1-NIN-A040.md` … `P1-NIN-A047.md`.
- Barrel contract test: `lib/nina/queries.test.ts`.
- Restated readme: `lib/nina/.workflows/package_readme.md`.
- Prior related session: `2026-09-11-lib-nina-queries-yagni.md` (the layer's dead-export
  sweep that preceded this split).
