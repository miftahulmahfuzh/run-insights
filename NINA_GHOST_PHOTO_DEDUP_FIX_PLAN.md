# Plan: Nina Media dedup — promote orphaned references before their parent is deleted

**Slug:** nina-ghost-photo-dedup-fix
**Date:** 2026-09-16
**Analysis:** `20260916-104336-G7K2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix`
**Branch:** `feature/nina-ghost-photo-dedup-fix` (base: `origin/main` @ `a4ae729`)
**Phases:** 2
**Status:** phase 1/2 complete
**Coordinator:** —

---

## Why

Turn 1 of this session found that `/nina/about`'s Media grid shows the same generated photograph
twice (photo 1/86 and 4/86). Root cause, verified against production data: a `nina_message_images`
row can be a **reference** (`source_avatar_id` or `source_image_id` set, no measurements of its
own — by design) whose parent (`nina_avatars` row, or another `nina_message_images` row) is later
deleted. The FK's `ON DELETE SET NULL` (deliberate — see `lib/db/schema/nina/chat.ts:614-618`)
then reclassifies the row as an "original" via `isOriginalPhoto()`, but it was never given
`content_hash`/`perceptual_hash`/`perceptual_sig`/measurements — so it is permanently invisible to
both dedup mechanisms, which both require those columns to be non-NULL to participate. Separately,
none of the three avatar-delete call sites check `isBlobPathnameReferenced` before deleting the
underlying Blob object, unlike the chat-photo delete path — which is almost certainly how the
specific row found went to a dead `blob_url` (404).

The fix: before a parent row is deleted, find its dependents and promote them — write real
`content_hash`/`perceptual_hash`/`perceptual_sig`/`width`/`height`/`bytes` by fetching the shared
Blob object once — so that the moment `ON DELETE SET NULL` fires, the row is already a fully
measured, dedup-eligible original. Then, only after the parent row is gone, check
`isBlobPathnameReferenced` before deleting the Blob object — which will now correctly refuse to
delete it for as long as any promoted dependent survives.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Implement a robust fix for the dedup gap: a reference row losing its provenance must never become a permanently-invisible, potentially-broken duplicate in Media | 1, 2 |

## Scope

**In scope:**
- A shared "promote dependents before parent delete" helper, and its call sites: the three
  avatar-delete paths (single, folder-subtree, bulk-by-id) and the two
  `deleteNinaMessageImage` callers (admin chat-photo remove, runner remove-from-bubble).
- Closing the missing `isBlobPathnameReferenced` guard on all three avatar-delete blob deletes.
- A remediation pass **inside the existing `nina-dedupe-plan.mjs` / `nina-dedupe-media.mjs` sweep**
  (not a standalone script — settled during reconciliation, see Phase 2) that finds existing
  unmeasured "phantom original" rows in production, repairs the ones whose Blob object is still
  alive, and reports (never silently deletes) the ones that are not — plus the `fill-dimensions` op
  that pass turns out to require, because `isPerceptualTwin` refuses a row with NULL
  `width`/`height` and nothing in that family has ever filled those columns.

**Out of scope, and why:**
- Changing the FK's `ON DELETE SET NULL` behavior itself — it is deliberate
  (`chat.ts:614-618`'s own doctrine: "the collection KEEPS the picture instead of losing it") and
  correct; this plan makes the row it produces trustworthy, not different.
- Running the sweep's `--apply` mode against the production database as part of this plan's
  execution. The extended sweep ships tested, dry-run-by-default, and demonstrated against
  fixtures/a read-only production dry-run; actually mutating production rows is a manual follow-up
  the user performs afterward, on the sweep's own report — the same posture the family already
  takes, and one Phase 2's choice to extend rather than fork leaves unchanged. Note for whoever
  eventually runs it: because the census lives inside the sweep, an `--apply` there also carries the
  sweep's pre-existing merge/release behavior. Read the dry run first.
- Retroactively fixing the one already-broken row (`Tdw_AkrJT0ks`) as part of `/implement` — the
  script from Phase 2 is what finds and reports it; deciding to run `--apply` (or to hand-delete
  an unrecoverable row) is the user's call once they have that report.
- The `message_id` FK's apparent `ON DELETE SET NULL` vs. a docstring elsewhere claiming
  `CASCADE` (noticed in passing during investigation, unrelated to this dedup gap) — flagged here
  for awareness, not addressed by this plan.

## Invariants

1. The tree builds (`npx tsc --noEmit`) and the full test suite passes at the end of each phase.
2. No user-visible behavior change for the common case: deleting an avatar/photo that nothing
   else references works exactly as it does today.
3. A dedup optimization failing (a fetch/hash/sign failure during promotion) must never block or
   fail the operator's actual delete request — it degrades to today's behavior (dependent stays
   unmeasured), logged, never thrown. Same ladder as every other dedup write in this codebase
   (`lib/nina/imagerun.ts`'s `storeNinaImage`, `lib/nina/dedupe.ts`'s header doctrine).
4. Every promotion write is idempotent and race-safe: **each write is guarded on a column it is
   itself filling**, so a concurrent writer wins and the write degrades to zero rows rather than
   clobbering. There are two write paths, and they spell that rule differently on purpose — both
   spellings satisfy this invariant and neither is to be "made consistent" with the other:
   - **Phase 1, app layer** (`promoteNinaImageMeasurements`): all six columns in ONE statement, so
     ONE guard covers the write — `content_hash IS NULL` — plus `pathname = $n`, because it runs
     inside a Server Action where an admin Replace can repoint the row between the read and the
     write (the 2026-09-15 ghost-signature lesson).
   - **Phase 2, sweep** (`fill-hash` / `fill-perceptual` / `fill-dimensions`): three separate ops in
     one op list, each guarded on its own column — `content_hash is null`, `perceptual_hash is
     null`, `width is null and height is null`. A shared `content_hash IS NULL` guard would make the
     two later ops permanent no-ops, since `fill-hash` fills that column earlier in the same run.
     No pathname clause: a sweep is one linear pass over rows it loaded itself.

   Both paths write the same six columns with the same meaning, so a row Phase 1 promotes going
   forward and a row Phase 2 repairs retroactively are indistinguishable in the database afterward.
5. Promotion runs strictly before the parent row's DELETE statement (the dependent lookup needs
   the parent's id, which is only usable before the FK fires); the blob-reference guard runs
   strictly after the parent row's DELETE (so it observes the dependents' final, post-SET-NULL
   state) and before any `del()` call.
6. Phase 2's script never writes to the database or calls Blob `del()` without an explicit
   `--apply` flag, and it never deletes a row automatically — an unrecoverable ghost (dead blob)
   is reported, not removed.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Promote dependents before delete, guard the blob delete | R1 | `lib/nina`, `lib/admin` | 15 (+2 conditional) | — | HARD | `.workflows/plan/nina-ghost-photo-dedup-fix/phase-1.md` | P1-NIN-A051 | — |
| 2 | Phantom-original census + `fill-dimensions` in the existing sweep | R1 | `scripts` | 3 | 1 | NORMAL | `.workflows/plan/nina-ghost-photo-dedup-fix/phase-2.md` | P1-SC-A003 | — |

**On the `Depends on` edge — read this before treating it as a build order.** Phase 2 imports
nothing from Phase 1, touches none of its files, and would build and test green against
`origin/main` alone (reconciler-verified, 2026-09-16). The two phases have **zero file overlap**:
Phase 1 is `lib/nina/**`, `lib/admin/**` and their suites; Phase 2 is `scripts/nina-dedupe-plan.mjs`,
`scripts/nina-dedupe-media.mjs` and `tests/nina.dedupeMedia.test.ts`. The edge is kept as a hard one
because the two phases land into one worktree and one git index, and because Phase 1 is what fixes
the promoted-column set Phase 2 must match — it is sequencing and semantics, never a compile order.
Nothing in Phase 2 should wait on a Phase 1 symbol; there is none to wait for.

### Phase 1 — Promote dependents before delete, guard the blob delete

**Satisfies:** R1
**Owns:**
- New shared helper `lib/nina/provenancePromotion.ts` exporting `promoteNinaAvatarDependents(userId,
  avatarIds)` and `promoteNinaImageDependents(userId, imageIds)`. **It takes parent ids only** — not
  the `{ id, blobUrl, pathname }` refs this index sketched before reconciliation. The parent's blob
  refs are an input to the *blob-delete* step, not to promotion: the dependents carry their own
  `blob_url`/`pathname` and the helper reads them off the dependent rows. It finds every
  `nina_message_images` row whose `source_avatar_id`/`source_image_id` is **in the exact id set
  about to be deleted** and whose `content_hash IS NULL`, fetches each distinct pathname's bytes at
  most once, computes `content_hash` (`contentHashOf`) and the perceptual pair + dimensions
  (`signImageBytes` — the one signer, unchanged), and writes them onto the dependent rows guarded by
  `content_hash IS NULL` **and** `pathname = $n`. A fetch/hash/sign failure for one pathname must not
  block promotion of dependents on other pathnames, and must never throw out to the caller
  (invariant 3).
- New query functions: `listUnmeasuredNinaImageDependents` and `promoteNinaImageMeasurements` in
  `lib/nina/queries/images.ts` (both query `nina_message_images`, which is why they live there and
  not in `avatars.ts` as the analysis's impact point 2 guessed), and `listNinaAvatarIdsInFolderTree`
  in `lib/nina/queries/avatars.ts` — the folder delete's pre-read, which must carry
  `deleteNinaAvatarsInFolderTree`'s WHERE clause for clause, `is_current = false` included. The
  promotion UPDATE is batched per distinct object, not one statement per row. Barrel surface
  `93 → 96`.
- Wiring the helper into, in this exact order relative to each site's existing statements:
  `deleteNinaAvatarAction` (`lib/admin/ninaAlbumAvatarActions.ts`),
  `deleteNinaAlbumFolderAction` + `removeNinaAvatarsAction` via `reapAvatarBlobs`
  (`lib/admin/ninaAlbumFolderActions.ts`), and the two `deleteNinaMessageImage` callers
  (`lib/admin/chatPhotoActions.ts`, `lib/nina/albumActions.ts`).
- Adding the missing `isBlobPathnameReferenced` guard to the three avatar-delete blob-deletion
  sites (single delete's inline `del(orphans)`, and `reapAvatarBlobs`'s batched `del()`) — checked
  per-pathname, after the row delete, skipping only the pathnames still referenced.
- Unit tests: the promotion helper's pure decision logic (which dependents qualify, one fetch per
  distinct pathname, failure degrades cleanly), and an integration-shaped test per call site
  proving the order (promote → delete row → guarded blob delete).
- **Three prose sites that this phase makes false, fixed in the same commit as the code:**
  `generatedChatPhotoScope`'s parenthetical in `lib/nina/queries/images.ts`,
  `setChatPhotoAsAvatarAction`'s `── THE BYTES ARE COPIED, NOT SHARED ──` paragraph in
  `lib/admin/ninaAlbumAvatarActions.ts`, and the header sentence in
  `tests/admin.chatPhotoAdoption.test.ts`. All three currently assert, in the present tense, that
  the album-side deletes call `del` with no reference check.
- **The new import edge.** `provenancePromotion.ts` statically imports `perceptualSign.ts`, whose
  own first lines are `import 'server-only'` and `import sharp from 'sharp'`. Wiring the helper into
  the album actions therefore puts a native module into the graph of the four suites that import the
  real `@/lib/admin/ninaAlbumActions` barrel. Phase 1 owns that (its Step 12): the barrel suite gets
  the edge mock by its own stated rule, the other three get one only if they actually trip.
**Does not touch:** the FK definitions/schema, `resolveAttachment`'s write path (already correct),
`lib/nina/perceptualSign.ts` / `lib/nina/perceptual.ts` / `lib/photos/contentHash.ts` (consumed
as-is — the one-signer rule forbids a second pipeline and this phase adds none), `scripts/**`
(Phase 2's, entirely).
**Exit criteria:** `npx tsc --noEmit` and the full test suite pass; a fixture reproducing the
observed bug (reference row, parent deleted, object still referenced elsewhere) ends with the
dependent carrying real `content_hash`/`perceptual_hash`/`perceptual_sig`/measurements and the
shared blob object surviving; a fixture with no dependents behaves exactly as before; the barrel
contract test passes with exactly 96 names; no line in the tree still states the reference-check gap
in the present tense.

### Phase 2 — Phantom-original census + `fill-dimensions` in the existing sweep

**Satisfies:** R1
**The open choice in this section's draft is now settled:** the phase **extends the existing
`scripts/nina-dedupe-plan.mjs` + `scripts/nina-dedupe-media.mjs` pair** rather than adding a
standalone script. The deciding reason is that a standalone script would stand up a *second*
sha-256 + sharp pipeline, which is exactly what `lib/nina/perceptualSign.ts`'s one-signer rule
forbids; the phase plan argues three more. Nothing new is registered in `package.json` or `knip.ts`.

**Owns:**
- `isPhantomOriginal(row)` / `classifyPhantomOriginals(rows)` in `nina-dedupe-plan.mjs`: the census
  of rows that are an **original** by `isOriginalRow`'s definition yet arrived with
  `content_hash IS NULL` — the exact shape of the row Phase 1 now prevents going forward, and the
  shape `Tdw_AkrJT0ks` already is. The predicate is `isOriginalRow(row) && hadNullHashAtLoad`, so a
  live *reference* with a null hash is never miscounted as a phantom. This matters concretely:
  production carried three `content_hash IS NULL` rows on 2026-09-16 and only one is a phantom —
  `ETtycd0IgLMZ` and `9uMGPIZBIWwR` are working references and must stay out of the census.
  Three buckets, every row named: **recovered**, **partial** (says which fact is missing),
  **unrecoverable** (the GET failed; reported with its reason, never removed).
- A new `fill-dimensions` op and `buildFillDimensionOps(rows)` — the measurement **nothing in this
  family has ever filled**. `isPerceptualTwin` refuses any row with a NULL `width`/`height` on its
  first line, and the perceptual pass is the *only* pass that can ever match a phantom (a phantom
  names the avatar object's bytes while its twin names a separately-encoded selfie object, so their
  content hashes legitimately differ). Without this op a recoverable phantom is hashed, signed, and
  still permanently invisible. This is the phase's central finding, not a side errand.
- `signBytes` gains `width`/`height` from an `img.metadata()` read added to its existing
  `Promise.all` — which **converges** the sweep's signer onto `lib/nina/perceptualSign.ts:50-56`
  rather than forking it, and so honours the one-pipeline rule without editing that file (Phase 1's).
- The three fills together write exactly Phase 1's six columns — `content_hash` (`fill-hash`),
  `perceptual_hash` + `perceptual_sig` (`fill-perceptual`), `width` + `height` + `bytes`
  (`fill-dimensions`) — each guarded on a column it is itself filling. See invariant 4 for why that
  guard shape differs from Phase 1's single-statement one, and why neither is to be changed to match
  the other.
- Restates its primitives locally: `scripts/*.mjs` in this family build no import graph
  (`--experimental-strip-types`), exactly as `nina-dedupe-plan.mjs` already restates
  `dhashHexOf`/`parseDhashHex`/`sig16FromBase64` rather than importing `lib/nina/perceptual.ts`.
- Adds no flag, no `del()`, and no `DELETE` under any flag. `--apply`'s blast radius is exactly what
  it already was.
**Does not touch:** `lib/**` in its entirety — Phase 1 owns every app-layer file, and this phase
imports none of it. Does not run `--apply` against production as part of its own exit criteria
(see Scope).
**Exit criteria:** `npx tsc --noEmit` green and the full suite green; the read-only production dry
run prints `0 recovered / 0 partial / 1 unrecoverable`, names `Tdw_AkrJT0ks` with its GET reason,
shows **zero** `fill-dimensions` ops (the only dimensionless original today is the unrecoverable
one), and lists `ETtycd0IgLMZ`/`9uMGPIZBIWwR` **only** under the pre-existing hash lines and never
under the census; the run ends with `DRY RUN — nothing written.`; `classifyPhantomOriginals` and
`buildFillDimensionOps` are unit-tested, which is the fixture-level demonstration that `--apply`
would write the same six columns Phase 1's helper writes.

## Reconciliation Log

Round 1, 2026-09-16. Nine conflicts found, nine resolved by editing the plan files. Every claim
below was checked against the worktree's actual source, not against the planners' summaries.

| # | Class | Conflict | Resolution |
|---|---|---|---|
| 1 | Contract drift | The index described Phase 1's helper as taking `{ id, blobUrl, pathname }` refs; the phase takes **parent ids only** and had recorded the deviation in its own contract, where nothing downstream would read it. | Index rewritten to the ids-only signature, with the reason (the dependents carry their own blob refs; the parent's are an input to the *blob-delete* step). Phase 1 unchanged — it was right. |
| 2 | Contract drift | The index left Phase 2's form as an open choice ("a new script under `scripts/` **or** a new pass in the pair"); Phase 2 had decided to extend the pair, and the index's prose still described a standalone promoter. | Index's Phase 2 section rewritten to the decided form, including the deciding reason (a standalone script would stand up a second sha-256 + sharp pipeline, which `perceptualSign.ts`'s one-signer rule forbids). Scope's "In scope" bullet 3 updated to match. |
| 3 | Contract drift | Index invariant 4 (`guarded by content_hash IS NULL`) was Phase 1's language for its own single-statement write, and read as a flat contradiction of Phase 2's three per-column guards. | Invariant 4 rewritten to state the shared rule (*each write is guarded on a column it is itself filling*) and then name the two write paths and both correct spellings, with an explicit "neither is to be made consistent with the other". |
| 4 | Gap | `provenancePromotion.ts` statically imports `perceptualSign.ts`, whose first lines are `import 'server-only'` and `import sharp from 'sharp'`. Wiring it into the album actions puts a native module into the graph of four suites that import the real `@/lib/admin/ninaAlbumActions` barrel; Phase 1's Files table named none of them. | Assigned to Phase 1 (it owns `lib/admin`) as a new **Step 12**, plus Files rows and two additions to the verification command. Verified first that none of the four has a delete-action case, so the edge is the only effect — no statement-order or FIFO breakage. |
| 5 | Contract drift | Phase 1's Step 11 edit to `tests/admin.chatPhotoAdoption.test.ts` gave a `Replace:` heading followed by a single block containing the **new** text, with no old text and no `with:` — unapplicable as written. | Rewritten with the file's current `:10-13` text quoted verbatim as the `Replace` half and the new text as the `With` half, and tied to the other two prose sites so all three land together. |
| 6 | Ordering | Phase 2 declared `Depends on: Phase 1` while importing nothing from it, touching none of its files, and building green against `origin/main` alone — an edge that reads as a compile order it is not. | Edge **kept** (one worktree, one git index; and the column semantics are fixed by Phase 1), but relabelled as sequencing-only in Phase 2's header and under the index's phase table, with an explicit "there is no Phase 1 symbol to wait for". |
| 7 | Duplicate work / gap | Phase 1's Files count was stated as `~8` in the index and is 15; Phase 2's `~2-3` is 3. | Phase table corrected to `15 (+2 conditional)` and `3`, and Phase 1's Files table given an explicit count line explaining that the two conditional rows are Step 12's branches. |
| 8 | Contract drift | The index's Phase 2 exit criterion demanded the script write "the same values Phase 1's helper would have written, **guarded the same way**" — false by design after Phase 2's per-column guard decision. | Exit criterion rewritten: same six columns, same semantics, guards deliberately different (invariant 4 carries the argument). |
| 9 | Contract drift | Phase 2's `fill-dimensions` docstring argued only against a `content_hash is null` guard, leaving the *absent pathname clause* (which Phase 1 carries, for the 2026-09-15 ghost-signature lesson) unexplained and open to a later "consistency" fix. | One paragraph added to that docstring and a verification block added to Phase 2's `Requires` section, stating why a sweep needs no pathname clause and instructing that it must not be added. |

**Checked and found consistent — recorded so no one re-derives them:**

- **Zero file overlap.** Phase 1: `lib/nina/{queries/images.ts, queries/avatars.ts,
  provenancePromotion.ts, albumActions.ts, queries.test.ts}`, `lib/admin/{ninaAlbumAvatarActions.ts,
  ninaAlbumFolderActions.ts, chatPhotoActions.ts}` and 7 suites. Phase 2:
  `scripts/nina-dedupe-plan.mjs`, `scripts/nina-dedupe-media.mjs`, `tests/nina.dedupeMedia.test.ts`.
  No file, and no file region, is claimed twice.
- **The column sets are identical.** Phase 1 writes `content_hash` + `bytes` always and
  `perceptual_hash` + `perceptual_sig` + `width` + `height` when the signature survives, in one
  statement. Phase 2 writes the same six across `fill-hash` / `fill-perceptual` / `fill-dimensions`.
  Neither writes a column the other does not.
- **The signing recipes are byte-identical.** Compared `lib/nina/perceptualSign.ts:50-56` against
  Phase 2's Step 7 `signBytes`: same `sharp(bytes, { failOn: 'none' })`, same `Promise.all` of
  `metadata()` + `resize(16,16,{fit:'fill'}).grayscale().raw()` +
  `resize(9,8,{fit:'fill'}).grayscale().raw()`, same 9x8 dhash loop. Step 7's `metadata()` addition
  is what closes the last difference, so Phase 2 converges the two signers instead of forking them.
  The one remaining behavioural difference is narrow and deliberate — see Decisions, D1.
- **Phase 1's dependent lookup is correctly scoped.** `listUnmeasuredNinaImageDependents` filters
  `source_avatar_id IN (:avatarIds)` OR `source_image_id IN (:imageIds)`, owner-scoped, `content_hash
  IS NULL` — the exact id set about to be deleted, never a wider match. The promotion UPDATE then
  re-narrows to `id IN (:groupIds)` from that same read. Verified also that
  `listNinaAvatarIdsInFolderTree`'s WHERE matches `deleteNinaAvatarsInFolderTree`'s clause for clause
  (`user_id`, `is_current = false`, `folderSubtree`) and that `removeNinaAvatarsAction`'s
  `doomed = ids.filter(id => id !== current.id)` matches `deleteNinaAvatars`' own `is_current = false`.
- **The promotion UPDATE's omission of `isOriginalPhoto()` is safe, including under Phase 2.** Its
  rows are references for a few more milliseconds, and both dedup reads that could act on the written
  values (`findNinaImageByContentHash`, `findNinaSignedOriginals`) carry `isOriginalPhoto()` in their
  own WHERE, so nothing can match against the row until it stops being a reference. On Phase 2's
  side: `isPhantomOriginal` and `buildFillDimensionOps` both require `isOriginalRow`, so a promoted
  reference is excluded from the census and from the dimension fill; and the sweep's pre-existing
  PASS 1 already hashes every row including references, so a reference carrying a `content_hash` is
  a state production already produces. The one case where the promotion writes onto a row that is
  *not* about to lose its provenance — `deleteNinaAvatarAction` promoting before a delete that
  `is_current = false` then refuses — is bounded by the same argument and costs only a wasted GET.
- **Phase 2's row selection correctly spares the two live references.** `isPhantomOriginal` is
  `isOriginalRow(row) && hadNullHashAtLoad`, not bare `content_hash IS NULL`, so `ETtycd0IgLMZ`
  (`source_image_id` set) and `9uMGPIZBIWwR` (`source_avatar_id` set) fall out on the first
  conjunct. Phase 2's own test `never counts a reference as a phantom, dead blob or not` pins it,
  and its production exit criterion asserts they appear only under the pre-existing hash lines.
- **Both guards are independently race-safe.** Phase 1: `content_hash IS NULL` + `pathname = $n` +
  owner + `id IN (…)`, returning the written count, where `0` is an ordinary outcome no caller
  treats as failure. Phase 2: `where id = … and width is null and height is null`, with `bytes`
  under `coalesce` so a stored size is never clobbered. Neither can overwrite a concurrent writer.
- **No deleted-then-used, no duplicate work, no broken-build phase.** Phase 1 deletes no symbol; its
  one signature change (`reapAvatarBlobs(rows)` → `reapAvatarBlobs(userId, rows)`) is module-private
  with both call sites in the same file and the same phase. Dropping `del` from
  `ninaAlbumAvatarActions.ts`'s imports is safe — the file's remaining use is `put`, and
  `tests/admin.albumAvatarActions.test.ts` has no `deleteNinaAvatarAction` suite to break (verified:
  its five describes are describe/setCurrent/ensureDescription/register/listManifest).
- **Every analysis impact point is owned.** Impact points 1-6 → Phase 1; impact point 7 → Phase 2.
  Impact point 2 placed the two new query functions in `queries/avatars.ts`; Phase 1 puts them in
  `queries/images.ts` because they query `nina_message_images`. That is a better placement, not a
  gap, and the index now says so.

## Decisions

| # | Fork | Chosen | Rung that decided it |
|---|---|---|---|
| D1 | An image `sharp` can decode but whose `metadata()` reports no `width`/`height`. Phase 1's `signImageBytes` returns `null` outright, so the row gets `content_hash` + `bytes` and no perceptual pair. Phase 2's `signBytes` returns the pair with null dimensions, so `fill-perceptual` still writes the pair. The two layers would leave that row in different states. | **Leave both as they are.** Phase 2 does not tighten `signBytes` to match, and Phase 1 does not loosen `signImageBytes`. | *The plans' code blocks*, then *the surrounding code's convention*. Phase 2 owns no change to `fill-perceptual` — that behaviour is pre-existing in the sweep — and tightening it inside a phase whose contract says "no existing function's behavior changes" would smuggle an unmeasured behaviour change into a dimension fill. The divergence is confined to an image sharp decodes but cannot measure, which is not a shape either planner observed in production's 129 rows. Recorded in Phase 2's `Requires` section so it is not rediscovered as a bug. |
| D2 | Phase 1 guards its write on `content_hash IS NULL` + `pathname = $n`; Phase 2 guards each fill on its own column and carries no pathname clause. Read side by side, invariant 4's draft wording made one of them wrong. | **Both are correct; the invariant was wrong.** Invariant 4 now states the shared rule (guard on a column you are filling) and names the two spellings, and both plan files carry the argument at the write site. | *A stated invariant* — invariant 4 itself, once read as the general rule it was trying to express rather than as Phase 1's particular spelling. The two guard shapes follow from the two execution contexts: a Server Action racing an admin Replace needs the pathname clause; a single linear sweep pass over rows it loaded itself does not, and a shared `content_hash` guard there would make two of the three fills permanent no-ops. |
| D3 | Phase 2's `Depends on: 1` implies a build order that does not exist — it imports nothing from Phase 1 — yet dropping the edge would let two sessions commit into one worktree concurrently. | **Keep the edge, relabel it.** `Depends on` stays `1` in the phase table; both the table and Phase 2's header now state plainly that it is sequencing and semantics, never a compile order. | *The plan index's Why and Requirements table*: both phases serve R1 and the index's Rollback section treats them as one landing. The edge costs a little parallelism; dropping it risks a shared git index, which this repo has been bitten by before. A note is cheaper than either mistake. |
| D4 | Step 12's conditional suites: mock the new `provenancePromotion` edge everywhere it now reaches, or only where it actually breaks? | **Unconditional in `tests/admin.albumActionsBarrel.test.ts`; run-then-mock-if-red in the other three.** | *A stated invariant* — that barrel file's own header: *"importing a real action module still executes its import graph, so the same edges the action-level suites mock are mocked here."* That rule speaks for the barrel suite and only for it; the other three have no such standing rule, and an unused module mock added "for safety" to a structural suite is the drive-by edit the same header exists to prevent. |

## Open Questions

(none — every fork above was decided, and R1 is served by both phases.)

## Rollback

- Phase 1 is a pure addition plus call-site reordering — revert the branch/PR; no data migration,
  no schema change. A row promoted before this fix is reverted stays promoted (harmless: it now
  simply carries a hash/signature it can be correctly matched on).
- Phase 2's script never mutates without `--apply`; a bad `--apply` run's writes are exactly the
  measurement columns (`content_hash`, `perceptual_hash`, `perceptual_sig`, `width`, `height`,
  `bytes`) on specific row ids it prints — reversible by hand (set back to NULL) if ever needed,
  though a correct measurement of real bytes is definitionally not something to revert.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md
