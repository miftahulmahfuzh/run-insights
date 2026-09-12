# Token-Maxxing Session — 2026-09-12: Badges/Records YAGNI Sweep

## 🎯 Achievement / End Result
- **Goal of the burn:** Hunt and remove dead code in `lib/badges` and `lib/records` —
  the badges/achievements/personal-records feature area, a self-contained pair of
  packages that had never been swept for dead code. Assigned as a worker idea by the
  parallel coordinator `tokenmax-orch-2026-09-12`, with the scope line "strictly within
  lib/badges + lib/records" and two hard constraints: no `package_readme.md` edits
  (moot anyway — neither package has a `.workflows/` directory or readme) and no
  production DB access. The achievement-first framing matters here: the headline is not
  the 93 deleted lines, it is that **every removal and every deliberate non-removal is
  individually verified and recorded**, including two barrels whose deletion is only
  safe because of a repo-wide convention nobody had ever actually proven.
- **Concrete changes:** One commit, `f903ef4` ("refactor(lib/badges,lib/records): YAGNI
  sweep — remove dead export surface"), 4 files, 3 insertions / 96 deletions (net −93):
  - `lib/badges/index.ts` — **deleted** (69 lines): a re-export barrel with zero
    importers anywhere in the repo.
  - `lib/records/index.ts` — **deleted** (24 lines): same verdict, same proof.
  - `lib/badges/evaluate.ts` — `CommitBadgeOptions` un-exported (only externally
    reachable via the dead barrel; self-used as `evaluateBadgesForCommit`'s options
    param).
  - `lib/records/types.ts` — `RecordDirection` and `RecordUnit` un-exported (same
    story; self-used as `RecordDefinition` field types).
- **Real value delivered:**
  - A **whole-repo symbol liveness map** for both packages: all 82 exported symbols plus
    every private top-level declaration, each whole-word-grepped across
    production/tests/scripts/guard-scripts/docs/config and classified self-file /
    cross-package / production / test / script / guard. This is the evidence base any
    future sweep of the area starts from.
  - **The barrel convention is now proven, not assumed.** Both packages shipped `index.ts`
    barrels re-exporting their public surface — and the repo imports exactly none of it.
    Every consumer reaches a direct submodule path (`@/lib/badges/catalog`,
    `@/lib/records/types`, …). Verified via exact-quote import grep, dynamic-import
    grep, `export *` check, and tsconfig/vitest alias check. The only barrel-shaped
    matches left repo-wide are SQL string literals (`delete from "records"`) in tests —
    a pleasing false positive that a dumber grep would have called a caller.
  - The **harvest of deliberate non-removals**, each verified and written down: a
    zero-reference constant that is actually generator output (fix belongs in
    `tools/make_badge_assets.py`, not in the generated file), a shipped-but-unrendered
    derivative set that is the F25 plan's still-open deliberate bet, three test-only
    exports that cannot be un-exported without touching tests, and two
    generator/guard-anchored names that are load-bearing by construction. Section
    below; these findings are the session's durable output.
  - One **tooling bug caught mid-audit**: the two automated liveness passes disagreed on
    `BadgeDefinition`/`RecordDefinition`, and settling it by direct grep at the source
    exposed a counter-key bug (`pkg` vs `pkgx` word-boundary collision) in the second
    script that silently zeroed all cross-file references — had it been trusted, live
    types would have been flagged for deletion. Recorded so the next sweep doesn't
    re-learn it (see Follow-ups).
  - **All gates green on the post-removal tree** (details in Appendix): `next typegen` +
    `tsc --noEmit` exit 0; full vitest sweep 265 files / 5,093 tests passed; eslint +
    prettier clean on both packages; exhaustive final grep hard gate clean; `git diff
    --stat` confirms exactly the 4 files, all inside the two packages.
- **Branch:** `token-maxxing-2026-09-12-badges-records-yagni` (worktree
  `tokenmax-2026-09-12-badges-records-yagni`), head `f903ef4`, one commit ahead of base
  `4fe9d01`.
- **Merge status:** on branch — **NOT merged, deliberately**. The worker does not merge
  to main; the coordinator `tokenmax-orch-2026-09-12` lands it (same contract as the
  other 2026-09-12 worker sessions).
- **Approx token burn:** audit-dominant over a tiny diff, the defining shape of a YAGNI
  session — a liveness map over 82 exports + all private top-level declarations across
  six grep corpora, two automated passes whose disagreement had to be adjudicated by
  hand, per-symbol classification, then the full gate battery (typegen + tsc + 5,093
  tests + eslint + prettier + exhaustive final grep) to justify a commit whose three
  insertions are all the word `export` being deleted. The tokens bought certainty, not
  line count. 🔥🔥🔥

## Context & Motivation
`lib/badges` (badge catalog, evaluation, shelf data, art manifest, facts) and
`lib/records` (personal-record catalog, computation, recompute, labels, art) are the
gamification half of the app: ten-ish files each, importing each other in a few places,
imported by `app/`, `components/`, and the test suite. Both packages grew additively
through the F25 record-patch-art plan and the badge feature work, and neither had ever
had a dead-code pass — unlike `lib/admin` (2026-09-11), `lib/db/queries.ts` and
`lib/nina/queries.ts` (2026-09-11), and `components/*` (2026-09-11), which were swept in
the previous wave. A self-contained feature area with heavy test coverage is the ideal
YAGNI target: removals are cheap to verify and non-removals are cheap to prove.

The idea arrived pre-chosen as a worker assignment from coordinator
`tokenmax-orch-2026-09-12` (one of several parallel worker branches that day; the
coordinator owns landing). Scope was fixed at "strictly within lib/badges + lib/records",
with `package_readme.md` edits and production DB access both ruled out — the former
turning out to be structurally moot, since neither package has a `.workflows/` directory
at all, hence no doc-drift surface to clean up after the removal.

One prior-session lesson shaped the method: the repo's dead-export sweeps have a
documented trap list (twin names, relative imports, barrel re-exports, multiline import
lists), and the 2026-09-11 components session caught its own verifier with a planted
positive control. This session inherited that discipline and needed it — the second
automated liveness pass was itself wrong, and the discrepancy-hunting step is what kept
a live type off the deletion list.

## What We Did (blow-by-blow)
1. **Built a whole-repo symbol liveness map.** All 82 exported symbols of the two
   packages, plus every private top-level declaration (so nothing on the keep list is
   there on trust), each whole-word-grepped across production code, tests, scripts,
   guard-scripts, docs, and config, then classified by its strongest reference:
   self-file (used only where declared), cross-package (used by the sibling package),
   production, test-only, script, or guard. This classification is what makes the two
   removal categories defensible: a symbol is *dead* only when its strongest reference
   is its own declaration.
2. **Ran two automated passes — and treated disagreement as signal, not noise.** When
   the passes disagreed on `BadgeDefinition`/`RecordDefinition`, the tie was settled the
   old-fashioned way: direct grep at the source. The second script turned out to have a
   counter-key bug — its per-package counter keys were `pkg` and `pkgx`, and a
   word-boundary collision silently zeroed all cross-file references — which would have
   flagged live types for deletion had its output been trusted. The manual verdict won;
   the bug is written up as a tooling follow-up, not patched (the script was session
   scaffolding, not shipped tooling).
3. **Deleted the two barrels.** `lib/badges/index.ts` (69 lines) and
   `lib/records/index.ts` (24 lines) re-exported their packages' public surface, but a
   repo-wide import census found zero importers of either: every consumer imports a
   direct submodule path. The verification stack for that claim:
   - exact-quote import grep (`from '@/lib/badges'`, `from './index'`, relative variants);
   - dynamic-import grep (`import('@/lib/badges')` etc.);
   - `export *` re-export check (no barrel re-exports the barrel);
   - tsconfig/vitest path-alias check (no alias maps `@/lib/badges` to the directory
     index behind the code's back).
   The only barrel-shaped matches remaining are SQL string literals —
   `delete from "records"` inside test SQL — which is exactly the code-vs-prose
   classification step doing its job.
4. **Un-exported the three orphaned symbols.** Deleting a barrel orphans anything only
   externally reachable through it, so:
   - `CommitBadgeOptions` (`lib/badges/evaluate.ts`) — self-used as the options param of
     `evaluateBadgesForCommit`; `export` keyword dropped.
   - `RecordDirection`, `RecordUnit` (`lib/records/types.ts`) — self-used as the field
     types of `RecordDefinition`; both `export` keywords dropped.
   TypeScript has no package-private exports: a cross-file sibling use *requires*
   `export`. So the audit's rule is: anything exported with zero cross-file, test, and
   production references is speculative surface — un-export it, keep the declaration
   (they are the files' own internal vocabulary).
5. **Verified each non-removal before leaving it alone** — the harvest (next section but
   one): `RECORD_ART_SMALL_SIZE`, `RECORD_ART[key].small`, the three test-only exports,
   and the generator/guard-anchored names.
6. **Ran the full gate battery on the post-removal tree** — `next typegen` +
   `npx tsc --noEmit` exit 0; full vitest sweep 265 files / 5,093 tests green; eslint +
   prettier clean on both packages; and an exhaustive final grep hard gate: zero barrel
   imports anywhere, and the un-exported trio referenced only in their defining files.
   `git diff --stat` confirms the diff touches exactly the 4 files, all inside the two
   packages. No build was run: no `app/` code changed, so Turbopack had nothing to
   compile differently.

## Code / Design Details

**The shape of the diff** — one file deletion per barrel, three keyword changes:

```ts
// lib/records/types.ts, before → after (types.ts, 2 of the 3 keyword changes)
export type RecordDirection = 'max' | 'min'
type RecordDirection = 'max' | 'min'

export type RecordUnit = 'm' | 's' | 's_per_km' | 'kcal' | 'spm' | 'bpm' | 'bp' | 'clock'
type RecordUnit = 'm' | 's' | 's_per_km' | 'kcal' | 'spm' | 'bpm' | 'bp' | 'clock'
```

**Why deleting a barrel with zero importers is safe.** A barrel is pure re-export: no
runtime behavior of its own. If nothing imports it, deleting it removes a module graph
node with no edges — no emitted JavaScript changes, no import path anywhere breaks. The
risk is never the deletion itself; it is the *census being wrong* (a dynamic import, an
alias, a re-export chain, or a `vi.mock` factory naming the barrel). Hence the
four-way verification stack in step 3, plus the final grep gate re-proving zero barrel
imports on the post-removal tree.

**The barrels were not symmetric junk — they carried a real invariant that now lives in
their history.** `lib/badges/index.ts`'s header documented why `gateway.ts` was
deliberately NOT re-exported: the gateway opens with `import 'server-only'`, so pulling
it into the barrel would have made the catalog — pure data the `/me` shelf wants —
unimportable outside a server component. The deletion doesn't weaken that invariant
(anyone who wants the gateway still imports `@/lib/badges/gateway` explicitly, which is
what every consumer already did); the barrel's absence just means the invariant is
enforced by the import graph itself rather than by a comment on a file nobody imported.

**The liveness map's classification** (what each symbol's strongest reference turned out
to be):

| Classification | Meaning | Examples of the verdict |
|---|---|---|
| self-file only | referenced nowhere but its declaring file | `CommitBadgeOptions`, `RecordDirection`, `RecordUnit` → un-exported |
| cross-package | used by the sibling package | `BadgeDefinition` / `RecordDefinition` (the disputed pair — live) |
| production | imported by `app/` / `components/` / `lib/` | the vast bulk of both catalogs' surfaces |
| test-only | every reference outside its file is a test | `isBadgeKey`, `previousIsoWeek`, `badgesForRun` → kept, recorded |
| script / guard | named by `tools/` or a CI guard | `RecordArt` (decks.json), `badge-art.ts` shape (check-badge-art.mjs) → untouchable |

**The counter-key bug, concretely.** The second liveness script accumulated reference
counts into per-package buckets whose keys were the strings `pkg` and `pkgx`. A
word-boundary-aware substitution mismatch meant references were counted under a key the
report never printed — so every cross-file reference read as zero in the report while
the raw counts were fine. The tell was the disagreement with pass one on
`BadgeDefinition`/`RecordDefinition`, both genuinely cross-package types. Direct grep at
the source settled it in minutes. The lesson generalizes past this script: when two
measurements disagree, the bug is usually in the one with more moving parts — name your
counter keys once and print them from one place (see Follow-ups).

**Notable asymmetry the audit surfaced.** `isBadgeKey` (badges) is test-only — zero
production refs — while its records twin `isRecordKey` has 6 production references. Same
shape, same intent, divergent usage. That is not a defect to fix; it is exactly the kind
of fact that only a per-symbol census surfaces, and it matters to anyone about to
assume the two catalogs mirror each other.

## The Harvest: Deliberate NON-Removals
The removals are 93 lines. The findings are the session's real output — each verified,
each recorded in the commit message:

1. **`RECORD_ART_SMALL_SIZE` (`lib/records/record-art.ts`) — zero references repo-wide,
   kept.** The naive verdict is "dead constant, delete." The true verdict: `record-art.ts`
   is a **generated file** — `tools/make_badge_assets.py:311` emits
   `{deck.const_name}_SMALL_SIZE` unconditionally per deck (the badges deck's twin,
   `BADGE_ART_SMALL_SIZE`, *is* consumed, by `BadgeShelf.tsx`). Hand-deleting the
   constant fights the generator; the next generation run would resurrect it. The fix
   belongs in the generator, which is out of this sweep's scope (recorded as a
   follow-up).
2. **`RECORD_ART[key].small` — shipped but never rendered, kept.** No component renders
   the records deck's `.small` derivative; only the badges deck's is drawn
   (`components/profile/BadgeShelf.tsx:221`, `src={art.small}`). So the 11 records
   `.sm.webp` derivatives ship unrendered. This is the **F25 header's documented
   deliberate bet**: pre-generate the small derivatives now to avoid re-hashing every
   master later if/when the shelf wants them. Left alone — the bet is still open as of
   today, and deleting the derivatives would be a product decision masquerading as a
   dead-code cleanup.
3. **Three test-only exports that cannot be un-exported without touching tests** (out of
   scope): `isBadgeKey` (`lib/badges/catalog.ts`), `previousIsoWeek`
   (`lib/badges/facts.ts`, self-used internally as well), and `badgesForRun`
   (`lib/badges/gateway.ts`, self-used via `dbBadgeGateway`). Tests import them; tests
   were untouchable under the scope line; so the `export` stays. Recorded as
   test-only-but-live, the same category the 2026-09-11 sweeps used.
4. **Generator/guard-anchored names — load-bearing by construction, untouched.**
   `tools/decks.json` names the records art type `"RecordArt"`, and
   `scripts/check-badge-art.mjs` anchors on `badge-art.ts` being a total
   `Record<BadgeKey, BadgeArt>`. Names the generator or a guard emits or enforces are
   contract, not candidate.

## Decisions & Trade-offs
- **Do not merge; the coordinator owns landing.** Worker session in a parallel set —
  merging from inside a worker while siblings run is the concurrent-phase hazard the
  repo has documented more than once (shared index, mid-wave land/verify, plan-name
  collisions). Contract: commit to the worker branch, document, report.
- **Deleted the barrels outright rather than pruning them.** An alternative was to keep
  `index.ts` and drop only its re-exports — but a barrel nobody imports is dead weight
  with a maintenance cost (every new export invites a "should this go in the barrel?"
  decision), and its one documented invariant (the gateway/`server-only` split) is
  preserved by the import graph that already exists. Whole-file deletion is the honest
  expression of "zero importers."
- **Un-exported rather than deleted the three orphaned types.** Same rule as the
  previous sweeps: they are the declaring files' internal vocabulary
  (`evaluateBadgesForCommit`'s param shape; `RecordDefinition`'s field types), so
  deleting them would mean inlining structural types into signatures — a refactor, not
  a dead-code removal. Dropping the keyword shrinks the public API at zero mechanical
  risk.
- **Trusted manual grep over the automated pass on conflict.** Cheap to type, expensive
  to skip: the automated second pass would have put `BadgeDefinition` and
  `RecordDefinition` on a deletion list. The audit's discipline is that a script's
  output is one measurement, not the verdict — and two disagreeing measurements mean at
  least one is wrong, not that the truth is their average.
- **No build gate.** The diff touches two `lib/` packages, no `app/` code; typegen +
  tsc + the full vitest sweep cover the module graph end to end. The symlinked
  `node_modules` in this worktree would break a Turbopack build (known repo memory), so
  spending a build on it would have bought nothing — the gates that could catch a
  regression in this diff all ran and passed.
- **Scope held even where the findings pointed outside it.** The `RECORD_ART_SMALL_SIZE`
  fix lives in `tools/make_badge_assets.py`; the `.small` bet's resolution is a product
  call; the test-only exports need test restructure. All three are follow-ups, not
  drive-bys — the assigned scope was the two packages, and a sweep that edits its own
  scope's neighbors mid-flight is how worker branches grow merge conflicts.

## Follow-ups & YAGNI notes
- **Fix the generator's `*_SMALL_SIZE` emission (cleanest follow-up).**
  `tools/make_badge_assets.py` emits `{deck.const_name}_SMALL_SIZE` unconditionally per
  deck (line ~311), but only the badges deck has a consumer. Either the generator should
  emit it only when a consumer exists, or both decks should consume it (a records
  variant of the shelf would). Until one of those happens, `RECORD_ART_SMALL_SIZE` will
  reappear as a zero-ref constant every time the generator runs — future sweeps should
  not waste a cycle re-litigating it.
- **The F25 `.small` bet is still open for the records deck.** The 11 records `.sm.webp`
  derivatives ship unrendered (only `BadgeShelf.tsx:221` draws a `.small`, and it draws
  the badges deck's). The F25 plan pre-generated them deliberately to avoid re-hashing
  masters later. If the bet is ever called off, the resolution is: stop emitting the
  records `small` URLs/derivatives (generator change again), not a hand-deletion in the
  generated file.
- **Test-only exports are a future cleanup only if tests are ever allowed to move.**
  `isBadgeKey`, `previousIsoWeek`, `badgesForRun` stay exported solely because tests
  import them. If a future session can touch tests: import the internal via the module
  object (or restructure so the test exercises the public surface), then un-export.
  Until then they are recorded, not fought.
- **The liveness script's counter-key bug class needs fixing before any re-use.** Name
  counter keys once and print them from one place — a report whose buckets and a
  word-boundary substitution can silently diverge (`pkg` vs `pkgx`) zeroes references
  without erroring. Any future sweep re-running the script should fix this first and
  re-verify a known-live cross-package symbol as the positive control (the
  `BadgeDefinition` pair is the natural one here).
- **YAGNI: the rest of the gamification-adjacent surface was not swept.** Scope was the
  two packages; `app/profile`, the records recomputation flow's callers, and
  `scripts/check-badge-art.mjs` were only read as evidence. Extending the sweep is an
  obvious next idea and was deliberately not started.
- **YAGNI: no reusable liveness tooling was left behind.** The scripts were session
  scaffolding with a bug in one of them; shipping them as tooling before the counter-key
  fix would launder the bug into repo infrastructure.

## Appendix

**Commit (this branch):**
```
f903ef4 refactor(lib/badges,lib/records): YAGNI sweep — remove dead export surface
```
Branch base: `4fe9d01` (`merge: token-maxxing session pkg-readme-lib-db`). One commit
ahead of base. Working tree clean at doc time.

**Diff stat:**
```
lib/badges/evaluate.ts |  2 +-                                (CommitBadgeOptions un-exported)
lib/badges/index.ts    | 69 ---                                (barrel deleted)
lib/records/index.ts   | 24 ---                                (barrel deleted)
lib/records/types.ts   | 4 +--                                 (RecordDirection, RecordUnit un-exported)
4 files changed, 3 insertions(+), 96 deletions(-)
```

**The audited area:** `lib/badges` — `badge-art.ts` (210), `catalog.ts` (151),
`evaluate.ts` (289), `facts.ts` (202), `gateway.ts` (223), `meta.ts` (150),
`progress.ts` (54), `rules.ts` (321), `shelf.ts` (100), `types.ts` (164);
`lib/records` — `catalog.ts` (141), `compute.ts` (113), `gateway.ts` (80),
`labels.ts` (76), `recompute.ts` (90), `record-art.ts` (137), `types.ts` (98).
82 exported symbols + all private top-level declarations, ~2,599 lines post-removal.
Line counts measured 2026-09-12.

**Verification commands run (all on the post-removal tree):**
```
npx next typegen            # clean (worktree's PageProps types present)
npx tsc --noEmit            # exit 0
npx vitest run              # 265 files / 5,093 tests, all green
eslint lib/badges lib/records   # clean
prettier (both packages)    # clean
# exhaustive final grep hard gate:
#   zero imports of '@/lib/badges' or '@/lib/records' (index barrels gone)
#   CommitBadgeOptions / RecordDirection / RecordUnit referenced only in defining files
git diff --stat             # exactly the 4 in-package files
```

**Environment notes:** the worktree's `node_modules` is a **symlink** — fine for
vitest/tsc/typegen (all three ran), would break a Turbopack build per repo memory; no
build was needed since no `app/` code changed. Neither package has a
`package_readme.md` (no `.workflows/` directory at all), so the removal left zero
doc-drift surface.

**Removals vs. keeps, the complete list:**
- Removed: `lib/badges/index.ts`, `lib/records/index.ts` (dead barrels); un-exported
  `CommitBadgeOptions`, `RecordDirection`, `RecordUnit`.
- Kept as findings: `RECORD_ART_SMALL_SIZE` (generated), `RECORD_ART[key].small` (F25
  bet), `isBadgeKey` / `previousIsoWeek` / `badgesForRun` (test-only), `RecordArt` name
  (decks.json anchor), `badge-art.ts` total-map shape (`check-badge-art.mjs` anchor).

**Related sessions:** method inherited from the 2026-09-11 dead-code wave
(`lib-admin-dead-exports`, `lib-db-queries-yagni`, `lib-nina-queries-yagni`,
`components-dead-code-a/b`); the F25 bet's provenance is
`docs/plans/archive/F25-record-patch-art.md`; the sibling 2026-09-12 worker sessions are
indexed in `docs/token_maxxing/README.md`.
