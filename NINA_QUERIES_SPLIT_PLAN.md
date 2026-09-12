# Plan: Split lib/nina/queries.ts into domain modules behind the barrel

**Slug:** nina-queries-split
**Date:** 2026-09-12 20:19 (reconciled 2026-09-12)
**Analysis:** `20260912-201916_code_analyzer.md`
**Worktree:** none — planned in place at `/home/miftah/.worktrees/run-insights/tokenmax-2026-09-12-nina-queries-split`
**Branch:** `token-maxxing-2026-09-12-nina-queries-split` (base: origin/main @ `2c823eb`; `--no-worktree`)
**Phases:** 8
**Status:** planned
**Coordinator:** —

## Why

The single biggest maintainability lever available in the codebase right now: every Nina
conversation/image/memory/avatar/tuning read and write lives in one 4.5k-line module
(`lib/nina/queries.ts`, 4573 lines, 113 exported symbols — 83 runtime values + 30 types — the
single largest file in the repo) with twenty banner-delimited sections; consumers import a
handful of symbols each but pay for the whole file in navigation and merge-conflict surface.
The split moves each domain into its own module under `lib/nina/queries/` while
`lib/nina/queries.ts` stays the unchanged public barrel, so no importer changes and every
prose contract that cites the file by name stays true.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Split `lib/nina/queries.ts` into domain-grouped modules under `lib/nina/queries/` | 1–7 |
| R2 | Barrel keeps re-exporting all 113 public symbols (83 values + 30 types); importers, scripts' contracts and the `vi.mock` stay untouched | 1–8 |
| R3 | Layer-wide invariants live on the barrel header | 1–7 (header never moves), 8 (module map added) |
| R4 | Section banner prose travels verbatim with its code, plus provenance notes | 2–7 |
| R5 | §1 Shapes and §2 Column lists become shared foundation modules | 1 |
| R6 | The 27 internal §x cross-references are rewritten to module names | 2–7 (in moved code), 8 (sweep) |
| R7 | Historical records not rewritten; only live prose that becomes false is fixed | 4 (script/test pointers), 8 (sweep + verify); invariant everywhere |
| R8 | `lib/nina/.workflows/package_readme.md` updated (8 edits — rules not state, dated counts); `lib/.workflows/package_readme.md` verified no-op (grep evidence recorded) | 8 |
| R9 | Domain modules under `lib/nina/queries/` (flat names taken) | 1 |
| R10 | Gates: scoped vitest+typecheck+eslint per phase; real install + `next build` smoke at phase 1; full vitest, typegen+tsc, eslint, prettier, knip, build at phase 8 | 1, 8 (full); 2–7 (scoped) |
| R11 | Zero behavior change — identical SQL, every existing test green | invariant; byte-proof per phase; 1's snapshot test + 8's full sweep verify |

## Scope

**In scope:** redistributing `lib/nina/queries.ts` §1–§12 into 13 modules under
`lib/nina/queries/` (shapes, columns, sessions, messages, images, memory, shortcuts, nags,
turns, avatars, tuning, imageprefs, jobphotos); barrel conversion ending at header + exactly
12 `export *` lines + zero imports; the new barrel contract snapshot test (83 names, grown to
85 in phase 4); repointing the two operator scripts' live line-pointer comments; the
`lib/nina` package_readme update; a real `node_modules` install in this worktree for the
build gate.

**Out of scope:** any SQL or behavior change; any change to the 14 importers; renaming or
rewording any moved banner prose; `lib/nina/*.ts` sibling modules (memory.ts, sessions.ts,
shortcuts.ts, tuning.ts, imageprefs.ts — the model/matcher layers); `.workflows/plan/**` and
`docs/plans/archive/**`; CHANGELOG.md (recent nina refactor commits do not add entries;
package_readme is the living doc).

## Invariants

1. **Zero behavior change.** SQL text, function signatures, return shapes, and error behavior
   are byte-identical. The refactor moves code; it does not write code.
2. **Tree is green at the end of every phase** — scoped vitest + `npm run typecheck` + eslint
   on the touched scope; full gates at phases 1 and 8.
3. **A moved module imports foundations and already-moved siblings only** — never
   `@/lib/nina/queries` (the barrel) — so the final state has no cycle through the barrel.
4. **The barrel's public surface never changes.** After each phase, every symbol importable
   from `@/lib/nina/queries` before is importable after, verified by `lib/nina/queries.test.ts`
   (value exports; 83 names at phase 1, 85 from phase 4 — the two documented additions) and
   tsc against the live importers (type exports). The four column lists are NOT on the
   surface: `queries/columns.ts` is imported by the barrel, never re-exported.
5. **Banner prose moves byte-identical.** Rewording a WHY note is out of scope even where it
   could be improved; each moved section gains only a short provenance header naming its origin
   section and the split.
6. **Phases run strictly sequentially** — each phase rewrites `lib/nina/queries.ts` (section
   removal + barrel line), so no two phases can run concurrently, and the order topologically
   sorts the code-level DAG (`messages` after `sessions`; `imageprefs` after `images` and
   `avatars`; foundations first).
7. **Historical records are untouched.** No edit under any `*/.workflows/plan/` directory or
   `docs/plans/archive/`.
8. **`db.batch`, never `db.transaction`; no `server-only` import anywhere new** — the moved
   code keeps the layer's runtime contract (the barrel header continues to document both).

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Foundations: shapes + columns modules, barrel contract test, real install + build smoke | R1, R2, R3, R5, R9, R10, R11 | `lib/nina` | 4 | — | NORMAL | `.workflows/plan/nina-queries-split/phase-1.md` | — | — |
| 2 | Sessions module (§3 + §4 group banner + §4a) | R1, R2, R4, R6, R11 | `lib/nina` | 2 | 1 | NORMAL | `.workflows/plan/nina-queries-split/phase-2.md` | — | — |
| 3 | Messages module (§4b + §4c) | R1, R2, R4, R6, R11 | `lib/nina` | 2 | 2 | NORMAL | `.workflows/plan/nina-queries-split/phase-3.md` | — | — |
| 4 | Images module (§5 + §5a-2 + §5b) + script/test pointer fixes | R1, R2, R4, R6, R7, R11 | `lib/nina`, `scripts`, `tests` | 6 | 3 | HARD | `.workflows/plan/nina-queries-split/phase-4.md` | — | — |
| 5 | Memory, shortcuts, nags, turns modules (§6, §6b, §7, §8) | R1, R2, R4, R6, R11 | `lib/nina` | 5 | 4 | NORMAL | `.workflows/plan/nina-queries-split/phase-5.md` | — | — |
| 6 | Avatars module (§9 + §9b) | R1, R2, R4, R6, R11 | `lib/nina` | 2 | 5 | HARD | `.workflows/plan/nina-queries-split/phase-6.md` | — | — |
| 7 | Tuning, imageprefs, jobphotos modules (§10, §10b, §11, §12) | R1, R2, R4, R6, R11 | `lib/nina`, `tests` | 6 | 6 | NORMAL | `.workflows/plan/nina-queries-split/phase-7.md` | — | — |
| 8 | Final sweep: §-ref audit, package readme, barrel module map, full gates incl. build | R2, R3, R6, R7, R8, R10 | `lib/nina`, `lib/admin` | 10 | 7 | NORMAL | `.workflows/plan/nina-queries-split/phase-8.md` | — | — |

### Phase 1 — Foundations
**Satisfies:** R1, R2, R3, R5, R9, R10, R11
**Owns:** creates `lib/nina/queries/` with `shapes.ts` (§1, old lines 122–611 moved
byte-identical — the 27 §1 type declarations incl. the ruling A1 banner; the file's 3 other
type exports stay with §5b/§12) and `columns.ts` (§2, old 613–683; the four private column
lists become module exports for sibling import — the barrel IMPORTS them, never re-exports
them); converts `lib/nina/queries.ts`'s §1/§2 into the barrel block
(`export * from './queries/shapes'`) plus import-backs in the import block (the 27-name
`import type` from `./queries/shapes` that §3+'s annotations need, and the `./queries/columns`
value import); prunes the five §1-only schema type imports; adds `lib/nina/queries.test.ts`
freezing the exact 83-name barrel value-export set; replaces the worktree's symlinked
`node_modules` with a real install and runs a `next build` smoke.
**Does not touch:** §3–§12 bodies.
**Exit criteria:** all sections §3+ compile unchanged against the foundation imports; barrel
snapshot test green at 83; full vitest + typecheck + eslint + `next build` pass.

### Phase 2 — Sessions module
**Satisfies:** R1, R2, R4, R6, R11
**Owns:** moves §3 (old 685–710) + the §4 group banner (712–714) + §4a (716–1131; delete
684–1132) into `queries/sessions.ts` (9 exports incl. `getNinaIdentity`; private
`readNinaSessionsWithActivity`) with exactly three pointer rewrites; barrel gains its second
`export *` line plus the `getNinaSession` import-back (sole §4b+ call :1327); prunes
`ne`/`exists`/`max` from drizzle-orm (all §4a-only), `NINA_SLOT_PENDING_PROMISES`/
`ninaChatSessions`/`users` from schema, the whole `@/lib/nina/sessions` statement, and the
3 session types + `sessionColumns` from phase 1's import-backs; moved §-refs rewritten to
module names.
**Does not touch:** §4b onward.
**Exit criteria:** scoped gates green; phase 1's snapshot test green unmodified; barrel
surface unchanged.

### Phase 3 — Messages module
**Satisfies:** R1, R2, R4, R6, R11
**Owns:** moves §4b (old 1133–1427; 7 exports + private `messageScope`) + §4c (1429–1565;
2 exports) into `queries/messages.ts` (imports `getNinaSession` from `./sessions`,
`messageColumns` from `./columns`; `hasProactiveMessageForRun` :1581 is §5's, NOT §4b's);
two §-pointer rewrites (Rewrite A intra-module docstring, Rewrite B the :1433 §5 pointer);
third `export *` line; removes the `getNinaSession` import-back and prunes `gt`,
`messageColumns`, `NinaMessageInsert`, `NinaMessageRow`.
**Does not touch:** §5 onward.
**Exit criteria:** scoped gates green; snapshot green unmodified; barrel surface unchanged.

### Phase 4 — Images module
**Satisfies:** R1, R2, R4, R6, R7, R11
**Owns:** moves §5 (old 1567–2105) + §5a-2 (2107–2197) + §5b (2199–2491; delete 1566–2491)
into `queries/images.ts` (19 exports: 18 functions + the `NinaChatPhotoBlobPatch` interface);
`isOriginalPhoto` and `generatedChatPhotoScope` become module exports (internal-shared, doc
noted) because §10b needs them in phase 7 — the frozen snapshot grows by exactly those two
names (83 → 85); fourth `export *` line + the
`import { countNinaChatPhotos, generatedChatPhotoScope } from './queries/images'` import-back
for §10b; repoints the live line-pointer comments in `scripts/nina-dedupe-media.mjs:60` and
`scripts/nina-dedupe-plan.mjs:71,93`; repoints `tests/nina.imageprefs.test.ts:566–567`
(path + `export `-keyword anchor); rewrites the two §9 §-pointers inside the moved span.
**Does not touch:** §6 onward; any script logic (comments only).
**Exit criteria:** scoped gates green; snapshot green with exactly the two documented
additions; script comments cite the new module.

### Phase 5 — Memory, shortcuts, nags, turns modules
**Satisfies:** R1, R2, R4, R6, R11
**Owns:** moves §6 (old 2493–2674) → `queries/memory.ts` (8 exports), §6b (2676–2878) →
`queries/shortcuts.ts` (5), §7 (2880–2926) → `queries/nags.ts` (2), §8 (2928–2989) →
`queries/turns.ts` (2); zero prose rewrites (the span's only § occurrences are banner
titles); NO import-backs (comment-stripped scan: zero code-level callers in §9–§12); each
module keeps its private helpers (`renderSlotValue`, `shortcutColumns`, `toShortcutRecord`,
`derivedTrigger`) module-private; four barrel lines (block reaches 8); prunes 9 schema
members + the whole `@/lib/nina/shortcuts` statement + the 10 moved types from the shapes
back-import.
**Does not touch:** §9 onward.
**Exit criteria:** scoped gates green; snapshot green unmodified; barrel surface unchanged.

### Phase 6 — Avatars module
**Satisfies:** R1, R2, R4, R6, R11
**Owns:** moves §9 (old 2991–3252) + §9b (3254–3843; delete through 3844) into
`queries/avatars.ts` (23 exports; `folderSubtree` stays private — its five callers are
intra-module); §9b's six §9-symbol mentions are COMMENT-ONLY (zero code-level calls —
comment-stripped scan of 3254–3843) so they become intra-module prose with no import;
ninth `export *` line; wholesale replacement of the barrel's import block with the exact
minimal requirement of the remaining §10–§12 code — PRESERVING phase 4's `./queries/images`
import-back (§10b still calls it) and adding `import { countNinaAvatars } from
'./queries/avatars'`; two "this module's rule 1" pointer rewrites + the internal-shared
marker on `countNinaAvatars`.
**Does not touch:** §10 onward.
**Exit criteria:** scoped gates green; snapshot green unmodified; barrel surface unchanged
(no new name — `countNinaAvatars` was already public).

### Phase 7 — Tuning, imageprefs, jobphotos modules
**Satisfies:** R1, R2, R4, R6, R11
**Owns:** moves §10 (old 3845–4018) → `queries/tuning.ts` (2 exports; a code-level leaf),
§10b (4020–4335) → `queries/imageprefs.ts` (4 exports; imports `countNinaChatPhotos` +
`generatedChatPhotoScope` from `./images` and `countNinaAvatars` from `./avatars` — the
DAG's only cross edges), §11 (4337–4385) + §12 (4387–4573) → `queries/jobphotos.ts` (2
functions + 2 interfaces; imports NOTHING from `./columns` — the §12→§2 edge was
docstring-only); deletes the barrel's whole residual import block (incl. both import-backs);
barrel completes with three lines → header + exactly 12 `export *` lines, ZERO imports, no
SQL; repoints `tests/nina.imageprefs.test.ts:546` and `tests/db.schema.nina.test.ts:525,705`
to the new module paths.
**Does not touch:** the sibling model layers (`lib/nina/tuning.ts`, `lib/nina/imageprefs.ts`
— distinct paths, deliberate mirror naming).
**Exit criteria:** scoped gates green; snapshot green unmodified (85 names, column lists
absent); `queries.ts` contains no SQL and no imports.

### Phase 8 — Final sweep and full gates
**Satisfies:** R2, R3, R6, R7, R8, R10
**Owns:** barrel header gains the 19-line module map (which domain lives where; invariant
prose byte-identical; opening line `module`→`layer`); moved-prose pointer sweep — 9
line-pointer instances in `shapes.ts`/`messages.ts`/`images.ts`/`imageprefs.ts` (rows 3–5,
8–17; rows 6/7/10 are phase 3's/phase 4's own rewrites, verify-only here) plus 3 live-code
pointers outside the moved file (`lib/admin/folderOps.ts:320`,
`lib/admin/ninaAlbumActions.ts:635`, `lib/nina/imageprefs.ts:456`) and the one live §-pointer
(`lib/nina/searchActions.ts:40`) — repoint, never reword the argument;
`lib/nina/.workflows/package_readme.md` updated (8 edits: rules not state, date-stamped
counts, barrel test named); `lib/.workflows/package_readme.md` VERIFIED NO-OP (grep evidence
recorded in the commit body); verifies zero diff under `*/.workflows/plan/` and
`docs/plans/archive/`; runs the audit greps (no `nina/queries.ts:NNN` survivor; §-allowlist
inside the layer) and the full gate set: full vitest, `npm run typecheck`, `npm run lint`,
prettier check, `npm run knip`, `next build`.
**Does not touch:** source semantics; historical records.
**Exit criteria:** every gate green on the finished tree; readme states the new rule; the
barrel is header + map + 12 re-export lines, zero imports.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Barrel line count: phases 2/4/5/6/7 wrote as if `export * from './queries/columns'` were a block line (final barrel "13 lines") | 1 vs 2, 4, 5, 6, 7 | Phase 1's binding contract wins — `columns.ts` is imported, never re-exported, enforced by the snapshot test ("build-green/test-enforced" beats prose). All later phases re-aligned: `export *` line counts after each phase are 1/2/3/4/8/9/12; final barrel = header + exactly 12 `export *` lines (shapes, sessions, messages, images, memory, shortcuts, nags, turns, avatars, tuning, imageprefs, jobphotos), ZERO imports. Index Decision 3 reworded accordingly |
| Phase 1's binding block lacked the shapes `import type` back-import §3+ needs (`export *` creates no local bindings; phase 2/3/4's "import block's relative-import group" language presumed it) | 1 vs 2, 3, 4 | Added to phase 1's contract, Step 5 assembly, arithmetic (file 4052 lines; §3+ at 164–4052; header at 111–146) and verify diffs; prune schedule documented (P2: 3 types + `sessionColumns`; P3: 2 + `messageColumns`; P4: 3 + `imageColumns`; P5: 10; P6: line deleted) |
| Phase 2's prune list missed drizzle `exists` + `max` (sole code calls :1118/:791, both §4a; every other match is `Math.max` or prose) — its own eslint gate would have gone red | 2 (5's count) | Phase 2 prunes all three (`ne`, `exists`, `max`); post-state quote and verification greps updated; phase 5's "max ×3 in §9–§12" count corrected (they were `Math.max` property accesses) |
| Phase 2's post-state schema-import quote re-listed the five §1-only types phase 1 deletes and omitted `ninaMessageImages` (present in the original import) | 1 vs 2 (5's residue note) | Quote fixed to the true post-phase-1/2 state; phase 5's note sharpened: phase 1 owns the deletion, phase 2's quote matches it, later phases must neither re-add nor re-delete |
| Gap: nobody pruned the 10 shapes import-back members whose last users moved with §6–§8 (dead type imports fail phase 5's own eslint gate) | 5 (1's schedule) | New phase 5 Step 6 (iv): remove the 10; the line ends the phase carrying exactly the 9 avatar types, which phase 6 deletes wholesale |
| Phase 6's wholesale import-block replacement dropped phase 4's `countNinaChatPhotos`/`generatedChatPhotoScope` import-back while §10b still calls them (:4253/:4257/:4331) — would not compile | 4 vs 6 | Block fixed to preserve the `./queries/images` line and add the `./queries/avatars` line; Deletes + Handoffs updated (phase 7 deletes both) |
| Duplicate §-pointer edits: phase 8's rows 6/7/10 re-owned phase 3's Rewrite B (:1433) and phase 4's rewrites (c)/(d) (:1763/:2413) with divergent replacement texts | 3, 4 vs 8 | One owner per edit (rule: earlier phase owns; later phase assumes that state). Phase 8 rows 6/7/10 are verify-only skips; preflight greps confirm the landed text |
| Phase 1 claimed `shapes.ts` "declares all 30 §1 type exports"; its own span (122–611) holds 27 — `NinaChatPhotoBlobPatch` lives in §5b, `NinaJobPhotoRow`/`NinaJobPhotoBubbleRow` in §12 | 1 (vs 4, 7) | Phase 1 fixed to 27 + an explicit note; file-wide type surface stays 30; phase 4/7 module contracts were already correct |
| Snapshot-test arithmetic (frozen name set) | 1, 4, 5, 6, 7, 8 | 83 at phase 1; phase 4 grows by exactly `isOriginalPhoto` + `generatedChatPhotoScope` → 85; phases 5/6/7 state "snapshot green unmodified" explicitly (7 now does); phase 8 preflight/gates expect 85; phase 6's "113 names" parenthetical corrected |
| Module header order: phases 2–6 imports-first, phase 7 doc-first | 7 | Phase 7 aligned to imports-first (tuning/imageprefs/jobphotos headers rewritten). Rung: surrounding repo convention — the pattern phases 2–4 set |
| Index bookkeeping: Files counts 4/4/4 for phases 4/7/8 vs contracts' 6/6/10; §-ranges cited title lines | index | Table fixed to 6/6/10; per-phase Owns sections re-measured to banner-open ranges (685–1131, 1133–1565, 1567–2491, 2493–2990, 2991–3844, 3845–4573) |
| Analysis-doc measured-fact errors (the implementation sessions read that doc) | all | Fixed in place, logged in a corrections note at the top of `20260912-201916_code_analyzer.md`: (a) §12→§2 `imageColumns` DAG edge deleted (docstring title at :4448 only); (b) §9b→§9 edge marked COMMENT-ONLY (zero code-level calls, phase 6's scan); (c) line ranges re-measured (§5 opens 1567; §3+§4banner+§4a = 685–1131; §4b+§4c = 1133–1565; §6–§8 = 2493–2990; §9+§9b = 2991–3844; §10–§12 = 3845–4573); (d) §4b = 7 exports, `hasProactiveMessageForRun` at :1581 is §5's; (e) §1 = 27 types in-span / 30 file-wide, barrel = 83 value + 30 type = 113, §6 = 8, §6b = 5, §5 = 9, §5a-2 = 2, §9b = 12, §10 = 2, §10b = 4 |
| R8 scope: `lib/.workflows/package_readme.md` documents date/flags/derived and has NO `queries.ts` mentions — phase 8 verified zero edits needed | 8 | R8 row + Phase 8 Owns updated: R8 lands entirely in `lib/nina/.workflows/package_readme.md` (8 edits) + the explicit no-op verification (grep evidence in the commit body) for the lib readme |
| Gap check on phase 8's pointer inventory | 2–8 | Phase 8 owns every moved-prose line-pointer (rows 3–17: shapes 1, messages 2+1 verify-only, images 2+2 verify-only, imageprefs 7) and all 3 live-code pointers outside the moved file (folderOps.ts:320, ninaAlbumActions.ts:635, imageprefs.ts:456) plus searchActions.ts:40; phases 2–7 own none of the live-code ones. Double-edit risk on rows 6/7/10 is neutralized by phase 8's already-fixed-anchor preflight (skip + record in commit body) |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| §1 types: one `shapes.ts` vs co-locating each type with its domain | one `shapes.ts` foundation module | 6: user constraint R5's own wording ("§1/§2 become shared foundation modules"); co-location is a follow-up, not this refactor |
| Barrel re-export style | `export * from './queries/<m>'` per module — exactly 12 lines at the end | 3: mechanical necessity — `verbatimModuleSyntax` would force `export type` on ~27 names in an explicit list; no name collisions exist (83 unique runtime value names + 30 types, measured). `columns.ts` is never a block line |
| Private helpers that cross module boundaries (`isOriginalPhoto`, `generatedChatPhotoScope`, the 4 column lists) | the two §5 helpers are exported from `queries/images.ts`, marked "internal — shared with sibling query modules", and DO surface through the barrel's `export *` (frozen list grows 83 → 85 in phase 4); the 4 column lists are exported from `queries/columns.ts` for sibling import but the barrel IMPORTS them and never re-exports them — they stay off the public surface, enforced by `lib/nina/queries.test.ts` | 4: phase exit criteria (sibling modules must import them; phase 1's binding contract + snapshot test). An explicit 113-name barrel was rejected under the style decision above |
| Where the barrel's import-backs live | in `queries.ts`'s top import block (relative group), NOT inside the barrel block — the block stays `export *` lines only, so phase 7's "zero imports" is one deletion | 4: phases 2–6's own contract language ("the import block's relative-import group") + house import style |
| CHANGELOG entry | none | 7: surrounding convention — recent nina refactor commits (`3974079`, `0d7ac9d`) add no CHANGELOG rows; package_readme is the living doc |
| Step 11 orchestrator launch | not launched; the phase set is implemented in THIS session via `/implement -f NINA_QUERIES_SPLIT_PLAN.md --phase N`, one at a time | 5: the user's raw input — this is a `/token-maxxing --worker` session; Worker Mode W2 prescribes `/implement` here, and a separate orchestrator would leave the worker idle and double-drive the set |
| Stale line-number pointers in `scripts/*.mjs` comments (all three were already stale pre-split) | repointed to the new module in the phase that moves the symbol (phase 4); argument prose untouched; module-level citations, not recomputed line numbers | 6: user constraint R7 — live prose only |
| §4b's export inventory (the analysis said 8 incl. `hasProactiveMessageForRun`) | 7 exports + private `messageScope`; `hasProactiveMessageForRun` (:1581) belongs to §5 and moves in phase 4 | 2: the code @ `2c823eb` — measured by grep (phase 3's correction, adopted by the analysis doc) |

## Open Questions

(none — every fork the exploration and the reconciliation surfaced is decided above)

## Rollback

- Per phase: `git revert <phase-commit>` — each phase is one commit whose diff is the move plus
  the barrel edit, so its revert restores the previous tree exactly.
- Whole set: the branch is discardable; `main` is never touched until the token-maxxing
  coordinator lands it (Worker Mode W4 — this session does not merge).

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_QUERIES_SPLIT_PLAN.md --phase 1

(Phases 2–8 follow, in order, in this same session — invariant 6 makes the chain strictly
sequential. The `/analyze-orchestrator` swarm launch is deliberately not used; see Decisions.)
