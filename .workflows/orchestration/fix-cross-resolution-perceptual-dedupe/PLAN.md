# Plan: Cross-resolution perceptual twin detection

**Slug:** fix-cross-resolution-perceptual-dedupe
**Date:** 2026-09-11 15:34:27
**Analysis:** `20260911-153427-B7K2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe`
**Branch:** `feature/fix-cross-resolution-perceptual-dedupe` (base: `origin/main` @ `94fdb1a`)
**Phases:** 1
**Status:** planned
**Coordinator:** —

---

## Why

User (verbatim, prior turn): *"kita sudah berkali-berkali berusaha memperbaiki sistem image
deduplication kita. tapi coba lihat production, di section Media di /nina/about. gambar ke 3/20
dan 4/20 duplikat. coba trace root cause nya"* — then, this turn: *"it and fix it based on your
own expert decision."*

The root-cause trace (this conversation) found: `isPerceptualTwin` (`lib/nina/perceptual.ts`,
mirrored in `scripts/nina-dedupe-plan.mjs`) requires exact `width`/`height` equality before it
ever compares dHash/mean-abs. Two production rows — `QbZH2v65ZeKE` (714×1270, upload) and
`VW04cyH9omoX` (576×1024, generated) — are the same photograph (measured: dHash 2/64, 16×16
mean-abs 1.52/255, aspect ratio 0.5622 vs 0.5625) at two different final resolutions, so this
gate rejects the pair before ever reading how close the hashes are. All four existing dedup
layers share this same gate and so all four missed it identically — this is not a "the sweep
wasn't run" defect ([[backfill-fills-must-be-ops]]-adjacent territory), it is a gate that cannot
see this class of duplicate at all.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Fix the dedup gate to catch same-photo/different-resolution duplicates (write-time and sweep), and merge the two live production rows as part of the fix | 1 |

## Scope

**In scope:**
- `lib/nina/perceptual.ts`: extend `isPerceptualTwin` with a cross-resolution path (aspect-ratio
  tolerance + minimum size-ratio guard + a stricter, separately-pinned dHash ceiling), new
  exported constants, updated header comment.
- `scripts/nina-dedupe-plan.mjs`: the identical rewrite (both files must stay verbatim per their
  own "if one number moves, move BOTH" rule).
- `tests/nina.perceptual.test.ts` and `tests/nina.dedupeMedia.test.ts`: extend the existing
  `isPerceptualTwin` test blocks with the new measured cross-resolution known-answer vector
  (`QbZH2v65ZeKE`/`VW04cyH9omoX`'s real dims/dHash/mean-abs) and a synthetic size-ratio-guard
  case; the two pre-existing "different dimensions ⇒ not a twin" cases must still pass (their
  vectors also differ in aspect ratio, so they are untouched in behavior).
- Running `npm run nina:dedupe-media` (dry run) against production to confirm the new gate
  proposes merging the two rows, then `npm run nina:dedupe-media -- --apply` to actually merge
  them. This is the codebase's existing, already-established maintenance operation for exactly
  this situation (`scripts/nina-dedupe-media.mjs`'s own docstring names production as the target
  every run touches) — not a new category of action.

**Out of scope, and why:**
- `perceptualVerifyCandidates` (`scripts/nina-dedupe-plan.mjs`, the STEP 1b stale-signature
  repair pass) — answers "is a STORED signature stale," a different question. Both production
  rows already carry freshly-correct, non-stale signatures (verified against a fresh GET+sign of
  the live blobs during root-cause tracing), so there is nothing for that pass to repair here.
  Broadening its `(userId, width, height)` candidate shortlist to also consider aspect-ratio
  buckets is real, separate follow-up work, not this bug.
- `lib/nina/perceptualSign.ts` (the signer) — unchanged. Its `fit:'fill'` resize to a fixed grid
  is *why* the fix is sound (signatures are already resolution-independent; only aspect-ratio
  distortion differs), not something that needs to change.
- No schema/migration change — `content_hash`/`perceptual_hash`/`perceptual_sig` formats are
  untouched.

## Invariants

- The tree builds, typechecks, and all tests pass at the end of the phase.
- The same-dimensions path's behavior is byte-for-byte unchanged: `PERCEPTUAL_MAX_DHASH = 1`,
  `PERCEPTUAL_MAX_SIG16 = 2`, same two gates, same order, for any pair where `width === width &&
  height === height`. Zero regression risk to the case the layer was originally measured against.
- `lib/nina/perceptual.ts` and `scripts/nina-dedupe-plan.mjs` implement the identical predicate —
  same constants, same gate order, same tolerances — because both files' own header comments
  require it and downstream code (write-time vs. sweep) must never disagree about what a twin is.
- The cross-resolution path is strictly more conservative than "aspect ratio matches": it also
  requires a minimum size ratio (guards against a thumbnail matching a much larger photo of the
  same aspect ratio) and a dHash ceiling pinned "one step above" the one real measured
  cross-resolution vector, following the exact precedent the same-dimensions threshold was set by
  (measured 0 → pinned 1).
- The production merge (dry run, then `--apply`) runs only after the code change is verified by
  the test suite — never before.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Cross-resolution perceptual twin gate + production merge | R1 | `lib/nina`, `scripts`, `tests` | 4 | — | NORMAL | `.workflows/plan/fix-cross-resolution-perceptual-dedupe/phase-1.md` | — | — |

### Phase 1 — Cross-resolution perceptual twin gate + production merge
**Satisfies:** R1
**Owns:** `lib/nina/perceptual.ts`, `scripts/nina-dedupe-plan.mjs`,
`tests/nina.perceptual.test.ts`, `tests/nina.dedupeMedia.test.ts`, and the production
`nina:dedupe-media` run that merges `QbZH2v65ZeKE`/`VW04cyH9omoX`.
**Does not touch:** `lib/nina/perceptualSign.ts`, `perceptualVerifyCandidates`, any schema file,
`lib/nina/actions.ts` or `lib/nina/queries.ts` (both already call `isPerceptualTwin` generically
with no dimension pre-filter, so they need no edits).
**Exit criteria:** `npx tsc --noEmit` clean; `npx vitest run tests/nina.perceptual.test.ts
tests/nina.dedupeMedia.test.ts` green, including the new cross-resolution vector; production
`npm run nina:dedupe-media` (dry run) report shows the two rows proposed as a perceptual merge;
`-- --apply` executed and a follow-up `select` on `nina_message_images` shows one of the two rows
now carrying the other's `source_image_id`.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Relax dimension-equality outright vs. add a bounded aspect-ratio path | Bounded aspect-ratio + size-ratio + stricter dHash ceiling, same-dims path untouched | 6 (surrounding convention: the existing same-dims threshold was itself "measured, then pinned one step above" — the new path follows the identical methodology rather than loosening the proven path) |
| Whether to also extend `perceptualVerifyCandidates`'s dimension-bucketing | Left out of scope | 5 (user's raw input asks to fix the observed duplicate class; the repair pass answers a different, currently-unaffected question for these two rows) |
| Whether the production `--apply` run belongs in this phase | Included, as the phase's final exit criterion | 6 (surrounding convention: `scripts/nina-dedupe-media.mjs`'s own docstring frames this exact action — code fix, then `--apply` against the one production database — as the established playbook for every prior dedup fix in this repo's history) |

## Open Questions

(none)

## Rollback

Revert the branch / the single commit touching `lib/nina/perceptual.ts`,
`scripts/nina-dedupe-plan.mjs`, and the two test files. The production merge is the harder part
to roll back: a sweep `merge-row` + `release-blob` deletes the loser's original Blob object, which
is not recoverable once deleted. If the merge picks the wrong keeper (unlikely — `electKeeper`'s
standing order is unaffected by this change) the row can be re-pointed back manually from the
DB's own history (Neon point-in-time restore is the last resort), but the blob itself is gone.
Mitigation: read the dry-run report before `--apply` and confirm the keeper is the higher-quality
(here: `content_hash`-having generated PNG rather than the recompressed upload JPEG, if that's
what `electKeeper` picks) side of the pair before applying.

## Next

Execute the phase:

    /implement -f FIX_CROSS_RESOLUTION_PERCEPTUAL_DEDUPE_PLAN.md --phase 1

Or run it as a (single-phase) swarm:

    /analyze-orchestrator -f FIX_CROSS_RESOLUTION_PERCEPTUAL_DEDUPE_PLAN.md
