# Code Analysis: Nina media dedupe — cross-resolution perceptual twins

**Type:** Bug Investigation
**Date:** 2026-09-11 15:34:27
**Session ID:** 20260911-153427-B7K2
**Plan:** `FIX_CROSS_RESOLUTION_PERCEPTUAL_DEDUPE_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/fix-cross-resolution-perceptual-dedupe` @ `feature/fix-cross-resolution-perceptual-dedupe` (base `origin/main` @ `94fdb1a`)

---

## User Input

### Original User Request
> it and fix it based on your own expert decision

(`/analyze` invocation with no target/type named in the slash command itself — both are carried
over from the immediately preceding turn of this same conversation, reproduced in full below,
per Step 0's instruction to preserve raw input rather than re-derive it.)

### User-Provided Context

The preceding turn's request, verbatim: *"kita sudah berkali-berkali berusaha memperbaiki sistem
image deduplication kita. tapi coba lihat production, di section Media di /nina/about. gambar ke
3/20 dan 4/20 duplikat. coba trace root cause nya"* — "we've tried many times to fix our image
dedup system, but look at production, in the Media section at /nina/about, image 3/20 and 4/20
are duplicates, trace the root cause."

That root-cause trace (this session, same conversation) is the finding this plan fixes. Restated
here because the plan index must stand alone:

- Production rows `QbZH2v65ZeKE` (kind `upload`, 714×1270, created `2026-09-11T08:00:03.653Z`)
  and `VW04cyH9omoX` (kind `generated`, 576×1024, created `2026-09-11T07:18:19.280Z`) are gallery
  positions 3/20 and 4/20 at `/nina/about` (`listNinaMessageImages` ordered `created_at desc, id
  desc`, `isOriginalPhoto()` — both rows are originals, neither is a reference).
- Both blobs were fetched and viewed: same photograph (same pose, framing, lighting). Verified
  with a measurement, not an eyeball ([[image-compare-measure-dont-eyeball]]-style): resizing
  both to the exact grids `lib/nina/perceptualSign.ts` uses (`fit:'fill'` → 16×16 and 9×8,
  grayscale) gives **dHash Hamming = 2** and **16×16 mean-abs = 1.52/255**. Aspect ratios: 0.5622
  (714/1270) vs 0.5625 (576/1024) — 0.05% apart, i.e. the same crop at a different final
  resolution (scale factor ≈1.24×).
- `content_hash` differs for the two rows (genuinely different bytes — this is not a byte-exact
  duplicate; `content_hash` correctly does not match).
- `perceptual_hash`/`perceptual_sig` are both present and correctly measured on each row
  (`9f9f3b4a8e0f5333` / `0e868e8ec6499c94` — confirmed by re-signing the live blobs and comparing
  to the stored values; not stale, so the STEP 1b repair pass is not implicated).
- Every write-time and sweep-time comparison between these two rows requires their `width` and
  `height` to be EXACTLY equal before any hash is ever compared (`lib/nina/perceptual.ts`'s
  `isPerceptualTwin`, mirrored verbatim in `scripts/nina-dedupe-plan.mjs`). 714×1270 ≠ 576×1024,
  so the gate rejects the pair before the (very close) dHash/mean-abs values are ever read. This
  is why the pair survived all four existing dedup layers.

### User-Provided Files
(none named with `@`; all files below were located via Step 2 exploration)

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Fix the dedup system so this class of duplicate (same photograph, two different final resolutions) is caught — both going forward (write-time) and for the sweep — and, since the two specific production rows are a real, currently-live duplicate, merge them in production as part of the fix. The exact code approach is left to the assistant's judgment ("based on your own expert decision"). |

---

## Detailed Requirements Understanding

**Problem statement.** `lib/nina/perceptual.ts`'s `isPerceptualTwin` (and its verbatim mirror in
`scripts/nina-dedupe-plan.mjs`) is the ONE predicate every dedup layer downstream of
`content_hash` uses to decide "these two original photographs are the same picture." Its first
gate is `a.width === b.width && a.height === b.height`. This is correct for the class of
duplicate the layer was built and measured against — a photograph saved out of the app and
picked again, which re-encodes bytes but (measured: `bjNniaR6_0dY`/`IGwGhWzPNmaR`, both 736×981)
preserves pixel dimensions. It is wrong for a photograph that reaches the collection twice
through two paths that each resize to their OWN target resolution (a generation pipeline's output
size vs. `compressForNina`'s upload target, or two independent resize passes) — same content,
same aspect ratio, different final width/height. That pair is structurally invisible to the gate:
`a.width !== b.width` short-circuits before any hash is read, regardless of how close the hashes
would be.

**Why relaxing the dimension check is sound, not just permissive.** The signatures themselves
(`dhashHexOf`'s 9×8 pass, `sig16` 's 16×16 pass) are already resolution-independent by
construction: `signImageBytes` resizes with `fit:'fill'` to a FIXED target grid regardless of the
source's pixel dimensions. What `fit:'fill'` is NOT invariant to is the source's **aspect
ratio** — stretching a 0.75-ratio photo and a 0.56-ratio photo onto the same 16×16 grid distorts
each differently, so their thumbnails stop being comparable. Two photographs with the same
content but different final resolutions and (nearly) the same aspect ratio are exactly the case
where the existing signatures remain comparable despite the dimension mismatch — aspect-ratio
closeness, not dimension equality, is the real precondition the hash comparison needs.

**Success criteria.**
1. `isPerceptualTwin` (both copies) accepts a pair whose aspect ratios are close (within a small,
   explicit tolerance) even when width/height differ outright, gated by a stricter — not looser —
   hash threshold than the same-dimensions path, since a cross-resolution comparison carries more
   resize noise and less certainty.
2. The already-working same-dimensions path is untouched: same thresholds, same behavior, zero
   regression risk to the case the layer was originally measured against.
3. A minimum size-ratio guard prevents a small thumbnail from spuriously matching a much larger
   photo of the same aspect ratio (a case this codebase has never produced or measured, but the
   aspect-only relaxation would otherwise admit it unbounded).
4. Both existing test suites (`tests/nina.perceptual.test.ts`, `tests/nina.dedupeMedia.test.ts`)
   are updated: the two "different dimensions ⇒ not a twin" cases they currently assert are still
   true (their dimension pairs also differ in aspect ratio, so they remain `false` under the new
   rule) and gain the new measured cross-resolution vector as a known-answer test, mirroring how
   the existing suite already pins the `bjNniaR6_0dY`/`IGwGhWzPNmaR` vector.
5. The two live production rows (`QbZH2v65ZeKE`, `VW04cyH9omoX`) are actually merged — this is a
   single-user app, the rows are real, and this codebase's established playbook for a dedup fix
   is to run `npm run nina:dedupe-media -- --apply` against production once the code change lands
   (see `scripts/nina-dedupe-media.mjs`'s own docstring: "DATABASE_URL IS PRODUCTION... every
   `--apply` write is a production write" — this is a known, intentional, already-existing
   maintenance operation, not a new class of action).

**Constraints / things that must not change.**
- `PERCEPTUAL_MAX_DHASH` and `PERCEPTUAL_MAX_SIG16` (the same-dimensions thresholds) stay `1` and
  `2` — unchanged, per the file-pair comment that says "if one number moves, move BOTH" (still
  true; neither moves).
- `lib/nina/perceptual.ts` and `scripts/nina-dedupe-plan.mjs` must keep the SAME gate, verbatim,
  per both files' own header comments ("a write-time twin that only the sweep's gates would
  reject is a row the sweep would refuse to merge; the two answers must not disagree").
- `perceptualVerifyCandidates` (`scripts/nina-dedupe-plan.mjs`, the STEP 1b stale-signature
  repair pass) is explicitly OUT OF SCOPE. It answers a different question — "is a STORED
  signature stale" — and both production rows already carry freshly-correct, non-stale
  signatures (confirmed above), so this pass has nothing to repair for this pair. Its
  `(userId, width, height)` candidate-shortlisting comment becomes narrower in scope after this
  fix (it will not surface a cross-resolution stale-signature case), which is a real but
  pre-existing and separate gap — extending it is unrelated backfill work, not this bug.
- No schema/migration change: `content_hash`, `perceptual_hash`, `perceptual_sig` columns and
  their formats are untouched; this is a comparison-logic change only.

**Edge cases.**
- Null/undefined width or height on either side: already `false` (existing gate 0), unchanged.
- Same width/height (the common case): unchanged code path, unchanged thresholds.
- Different width/height, very different aspect ratio (e.g. the existing tests' 576×981 and
  736×800 vectors): must remain `false`.
- Different width/height, close aspect ratio, but wildly different absolute size (e.g. a 40×70
  icon vs. a 4000×7000 photo, same ratio): must be `false` via the size-ratio guard, even though
  no such row exists in production today — the guard is defense against a case the relaxed gate
  would otherwise admit unbounded.

---

## Analysis Scope

### Explicitly Mentioned Files
(none — inferred from Step 2 exploration and this session's prior root-cause trace)

### Discovered Related Files
- `lib/nina/perceptual.ts` — the pure gate functions (`isPerceptualTwin`, `dhashHamming`,
  `sig16MeanAbs`, the parse/encode helpers), zero imports, shared by write-time and (by mirrored
  copy) the sweep.
- `lib/nina/perceptualSign.ts` — the one signer (`sharp`, `fit:'fill'` resize to 16×16/9×8); not
  changed by this fix, but its resize behavior is why the fix is sound (see above).
- `lib/nina/actions.ts:1080-1130` (`findNinaPerceptualKeepers` or equivalent — the write-time
  race-close) — the one write-time caller of `isPerceptualTwin`, called with
  `{ width, height, dhash, sig16 }` built from `findNinaSignedOriginals`'s rows, which are NOT
  filtered by dimensions in SQL (confirmed — `lib/nina/queries.ts:1927-1957`), so this call site
  needs no change beyond the gate function itself.
- `scripts/nina-dedupe-plan.mjs:400-470` — the sweep's mirrored `isPerceptualTwin`,
  `PERCEPTUAL_MAX_DHASH`/`PERCEPTUAL_MAX_SIG16` constants, and the header comment documenting the
  three gates — all three must be edited together with `lib/nina/perceptual.ts`.
- `scripts/nina-dedupe-plan.mjs:490-500` (`perceptualVerifyCandidates`) — reads the same
  `(userId, width, height)` grouping; explicitly NOT touched (see constraints above), but its
  header comment's claim "a row whose dimensions are unique... has no candidate twin" becomes
  slightly narrower in scope and should get one clarifying line.
- `scripts/nina-dedupe-plan.mjs:520-610` (`buildPerceptualMergePlan`) — calls `isPerceptualTwin`
  to cluster originals and elect a keeper; no change needed beyond the gate function it calls
  (clustering, `electKeeper`, and the merge-op shape are dimension-agnostic already — they copy
  the KEEPER's `width`/`height`/`bytes` onto the loser row regardless of what the loser's own
  dimensions were).
- `tests/nina.perceptual.test.ts:98-131` — pure-function tests for `isPerceptualTwin`, incl. the
  two "different dimensions" cases that must keep passing and the known-answer vector to extend.
- `tests/nina.dedupeMedia.test.ts:472-509` — the sweep's own `isPerceptualTwin` tests, same shape,
  same two things to preserve/extend.
- `scripts/nina-dedupe-media.mjs` — unchanged; this is the CLI wrapper that calls
  `buildPerceptualMergePlan`/`buildMergePlan` and is what actually applies a merge to production.
  Used, not edited, as the last step of this fix (see R1).

---

## Current Dataflow

### Entry Point 1: write-time perceptual twin check (STEP 1b, "layer 4")

**Location:** `lib/nina/actions.ts`'s send-time path, which fetches each open claim's just-landed
blob back, signs it with `fetchAndSignImage`/`signImageBytes` (`lib/nina/perceptualSign.ts`), and
compares against every other signed original for the user (`findNinaSignedOriginals` — no
dimension filter in SQL) via `isPerceptualTwin` (call site `lib/nina/actions.ts:1113`).
**Trigger:** any new original photograph write (`kind: 'upload'` from a chat send, or `kind:
'generated'` from Nina's selfie pipeline) that the byte-hash pass did not already resolve to a
keeper.
**Transform:** `isPerceptualTwin(newCandidate, existingCandidate)` for each existing signed
original — gate 1 (dims), gate 2 (dHash ≤ 1), gate 3 (mean-abs ≤ 2), ALL required, first match
wins.
**Exit:** twin found → the new row lands as a REFERENCE to the twin (`sourceImageId` set, no
bytes/signature of its own — `ninaUploadInsertRow`'s reference arm); no twin → the row lands
fresh, with its own signature.
**Defect:** `VW04cyH9omoX` (576×1024) landed first (07:18); when `QbZH2v65ZeKE` (714×1270) landed
at 08:00, this check ran candidate-vs-`VW04cyH9omoX` and returned `false` at gate 1 (714≠576),
never reaching the dHash/mean-abs comparison that would have measured 2/64 and 1.52/255.

### Entry Point 2: the sweep (`npm run nina:dedupe-media -- --apply`)

**Location:** `scripts/nina-dedupe-media.mjs` → `scripts/nina-dedupe-plan.mjs`'s
`buildPerceptualMergePlan`.
**Trigger:** manually run maintenance sweep.
**Transform:** groups all of a user's signed originals; per-user, clusters rows into connected
components over the `isPerceptualTwin` edge (pairwise, same predicate as Entry Point 1); elects a
keeper per cluster (`electKeeper`); emits `merge-row` + `release-blob` ops.
**Exit (dry run):** a printed report, no writes. **Exit (`--apply`):** rows repointed to the
keeper's `blobUrl`/`pathname`/`content_hash`/`width`/`height`/`bytes`; the loser's original blob
released if nothing else references it.
**Defect:** identical to Entry Point 1 — `isPerceptualTwin(QbZH2v65ZeKE, VW04cyH9omoX)` is `false`
at gate 1 regardless of when the sweep runs, so re-running the existing sweep today would NOT
merge this pair (this is the `[[backfill-fills-must-be-ops]]`-adjacent check worth stating
plainly: this is not a "the op was never run" defect, it is a "the op's gate cannot see this
pair" defect).

### State Changes
- `nina_message_images.source_image_id` — set on the loser when a merge (write-time or sweep)
  finds a twin; both production rows have this `NULL` today (neither was ever recognized as the
  other's twin).
- `nina_message_images.blob_url`/`pathname`/`content_hash`/`width`/`height`/`bytes` — overwritten
  on the loser row by a sweep merge, copied from the keeper.
- Vercel Blob store — a `release-blob` op deletes the loser's original object once no row
  references its pathname/URL.

---

## Key Data Structures

### `PerceptualCandidate` (`lib/nina/perceptual.ts:116`)
```ts
export interface PerceptualCandidate {
  width: number | null
  height: number | null
  dhash: bigint
  sig16: Uint8Array
}
```
Used identically by the write-time caller (`lib/nina/actions.ts`) and, in object-literal form
(no imported type — the sweep is `.mjs`), by `scripts/nina-dedupe-plan.mjs`'s rows (`row.sig =
{ dhash, sig16 }`).

### `nina_message_images` columns (`lib/db/schema.ts:1057-1234`)
`width`, `height` (nullable integers, measured at write time — never trusted from a client
claim); `content_hash` (text, nullable, byte-exact); `perceptual_hash` (16 lowercase hex chars,
64-bit dHash); `perceptual_sig` (base64, 256-byte 16×16 grayscale thumbnail).

---

## Dependencies

### Configuration / Environment
None new. `sharp` is already a runtime dependency (`dependencies`, `serverExternalPackages`);
this fix touches no import boundary.

### External Services
Vercel Blob (read via public URL for signing; delete on a sweep `--apply` release). Neon
Postgres, single production database (`DATABASE_URL` in `.env.local` — the only database this
repo has; sweep is a production write).

---

## Reference List

| Symbol | File:line | Kind | Package |
|---|---|---|---|
| `isPerceptualTwin` | `lib/nina/perceptual.ts:136` | def | `lib/nina` |
| `isPerceptualTwin` | `scripts/nina-dedupe-plan.mjs:459` | def (mirror) | `scripts` |
| `PERCEPTUAL_MAX_DHASH` | `lib/nina/perceptual.ts:31` | def | `lib/nina` |
| `PERCEPTUAL_MAX_DHASH` | `scripts/nina-dedupe-plan.mjs:435` | def (mirror) | `scripts` |
| `PERCEPTUAL_MAX_SIG16` | `lib/nina/perceptual.ts:34` | def | `lib/nina` |
| `PERCEPTUAL_MAX_SIG16` | `scripts/nina-dedupe-plan.mjs:436` | def (mirror) | `scripts` |
| `isPerceptualTwin(...)` call | `lib/nina/actions.ts:1113` | call | `lib/nina` |
| `isPerceptualTwin(...)` call | `scripts/nina-dedupe-plan.mjs:562` | call | `scripts` |
| `perceptualVerifyCandidates` | `scripts/nina-dedupe-plan.mjs:490` | def (unchanged; comment note only) | `scripts` |
| `isPerceptualTwin` tests | `tests/nina.perceptual.test.ts:98-131` | test | `tests` |
| `isPerceptualTwin` tests | `tests/nina.dedupeMedia.test.ts:472-509` | test | `tests` |
| `signImageBytes` | `lib/nina/perceptualSign.ts:48` | def (unchanged; cited for why the fix is sound) | `lib/nina` |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/perceptual.ts` — rewrite `isPerceptualTwin` to add the cross-resolution path; add
   `PERCEPTUAL_ASPECT_TOLERANCE`, `PERCEPTUAL_MIN_SIZE_RATIO`, `PERCEPTUAL_CROSS_RES_MAX_DHASH`
   constants; update the file header comment. Phase 1.
2. `scripts/nina-dedupe-plan.mjs` — the same rewrite, verbatim, per the "if one number moves, move
   BOTH" rule; update its header comment identically. Phase 1.
3. `tests/nina.perceptual.test.ts` — extend the `isPerceptualTwin` describe block with the new
   cross-resolution known-answer vector and the size-ratio-guard case. Phase 1.
4. `tests/nina.dedupeMedia.test.ts` — same extension, sweep-side. Phase 1.
5. Production database — run `npm run nina:dedupe-media` (dry run, confirm the report proposes
   merging `QbZH2v65ZeKE` into `VW04cyH9omoX` or vice versa per `electKeeper`), then `-- --apply`.
   Phase 1 (final step, after the code change is verified by tests).

**This document describes. The plan file prescribes.**
