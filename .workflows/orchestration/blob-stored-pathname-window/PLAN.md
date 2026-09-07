# Plan: The stored-pathname window — `/admin/photos` refuses every upload

**Slug:** `blob-stored-pathname-window`
**Date:** 2026-09-07 07:25:34 +07
**Analysis:** `20260907-072534-B10B_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/blob-stored-pathname-window`
**Branch:** `feature/blob-stored-pathname-window` (base: `origin/main` @ `3902c58`)
**Phases:** 1
**Status:** landed — 1/1 phases complete, merged to `main` at `1708932`. Exit criterion 6 (the prod probe of `enina5.png` through `/admin/photos`) was run by phase 1 against a local production build of `c7752e5` wired to the production Neon database and the production blob store `ptezanncca27s5kn`: `nina_message_images` went 0 → 1 and the stored id segment measured 43 = 12 + `-` + 30. A Vercel *preview* cannot serve `/admin/photos` on this project — `ADMIN_EMAILS`, `VAPID_*` and `AUTH_URL` are Production-scope only, so `requireAdmin()` 500s.
**Coordinator:** `orch-blob-stored-pathname-window`
**Card:** [miftahulmahfuzh/run-insights#104](https://github.com/miftahulmahfuzh/run-insights/issues/104)

---

## Why

> bug: in /admin/photos i cannot upload any image. try uploadin @enina5.png to prod yourself

The bytes land in the Blob store and then the Server Action refuses the pathname Blob handed back.
`ADMIN_CHAT_PHOTO_ID_RE` is `{12,24}`; the stored id segment is **43** symbols — a 12-symbol
`newId()`, a `-`, and Vercel's **30**-symbol random suffix. The comment in the source states the
arithmetic that was intended (*"12 requested, up to 24 stored"*) and nobody checked it against a
real object. `NINA_CHAT_ID_RE` repeats the mistake verbatim, which is why the runner's camera
photo also fails, one screen over, as *"Nina could not take this one."*

Both suites assert the stored form and both **invented** a short suffix — 7 symbols in
`tests/admin.chatPhotos.test.ts:36`, 3 in `lib/nina/images.test.ts:38` — so the defect shipped
green. The fix is not done until those fixtures carry the measured 30.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | In `/admin/photos`, uploading an image must work — today no image can be uploaded | 1 |
| R2 | Upload `enina5.png` to prod myself rather than reasoning from the code | 1 |

R2 is already **satisfied and recorded** in the analysis document's "R2 — the prod reproduction,
run end to end": the browser path was driven against `runins.site` with a locally minted Auth.js
cookie, the stored pathname measured at 43 symbols, the refusal reproduced, and the probe's orphan
deleted. Phase 1 re-runs the same probe after the fix, as its exit criterion.

## Scope

**In scope**
- `lib/admin/chatPhotos.ts` — the id window and the paragraph that states the wrong arithmetic
- `lib/nina/images.ts` — `NINA_CHAT_ID_RE`, the same defect reached from the runner composer
- `tests/admin.chatPhotos.test.ts`, `lib/nina/images.test.ts` — real 30-symbol suffixes
- A regression case per predicate that would have failed before this change
- Two prose references that this change makes false, comment-only and separable (phase 1, Step 5):
  `components/admin/chatPhotoUpload.ts:103-105` and `lib/nina/actions.ts:1234-1235`, both of which
  still say "12-24"

**Out of scope, and why**
- `isAdminAvatarRequestPathname` / `isAdminAvatarThumbRequestPathname` (`lib/admin/avatars.ts`),
  `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts`), `SHOT_REQUEST_PATHNAME_RE`
  (`lib/extract/constants.ts`) — each is `{12}` exactly, **request-only**, and never applied to a
  stored pathname. Verified by reference list. Do not "helpfully" widen them: their tightness is
  the mint-time defence.
- `SHOT_STORED_PATHNAME_RE` — already correct, and the precedent this fix follows.
- `lib/nina/imagerecipe.ts:92` — a third "12-24" prose reference, but that file is on the
  must-not-touch list above and a comment is not worth breaching a boundary for. Left as-is.
- Renaming `isNinaChatRequestPathname`, which this change makes a misnomer (it now answers both
  windows). Three files outside this scope; not worth coupling to a bug fix.
- `scripts/blob-reap.mjs` — matches by prefix, reads no id regex.
- **Reaping the 15 orphaned objects** (~7.6 MB) the bug left in prod. Real, counted in the
  analysis, and it belongs to the `reap-orphaned-blobs` skill, not to a code change. Note it in
  the PR body; do not script it here.
- The wording of `'That file did not land in her photo folder.'` — it is factually inverted (the
  file *did* land), but once the predicate is right this branch stops being reachable by a
  well-formed upload, and changing user-visible copy is not what was asked.
- No migration. No schema change. No new column.

## Invariants

1. **The tree builds green and `npm test` passes.** `npm run typecheck`, `npm run lint`,
   `npm test`.
2. **The mint-time check does not get looser.** `isAdminChatPhotoPathname` and
   `isNinaChatRequestPathname` are each called at *two* sites with two meanings — the token mint
   sees the REQUESTED pathname, the Server Action sees the STORED one. After this change the
   requested form must be accepted at exactly 12 symbols and **not** at 13–24, which is *tighter*
   than today. A fix that merely raises the ceiling to 48 is refused by review.
3. **The suffix stays in its own group.** The two windows are two shapes;
   `SHOT_STORED_PATHNAME_RE` models them as two groups and that is the shape to follow. Do not
   express this as one widened range.
4. **A 12-symbol id may itself contain and end with `-`.** Real prod object:
   `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`. The pattern must anchor the first 12
   symbols positionally rather than splitting on `-`.
5. **The suffix bound is loose on purpose.** 30 is observed, `{16,64}` is the repo's recorded
   bound (`lib/extract/constants.ts:103-107`); it is an internal of Vercel's that we do not
   control. Do not pin it at 30.
6. **No user id is interpolated into a RegExp.** Both predicates are segment-by-segment today
   (`lib/admin/chatPhotos.ts:110-120`'s stated rule: *"a user id is data, and data does not belong
   in a pattern"*). Keep it that way.
7. **Every fixture that claims to be a stored pathname carries a real 30-symbol suffix.** Copy one
   from the analysis document rather than inventing one — inventing one is the defect.
8. No new dependency, no new env var, no change to any Blob upload option.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Model the random suffix as its own group, in both predicates, and pin the fixtures to a measured one | R1, R2 | `lib/admin`, `lib/nina`, `tests` | 4 + 2 | — | NORMAL | `.workflows/plan/blob-stored-pathname-window/phase-1.md` | `P1-NIN-A013` | `miftahulmahfuzh/run-insights#104` |

### Phase 1 — Model the random suffix as its own group, in both predicates, and pin the fixtures to a measured one

**Satisfies:** R1, R2
**Owns:** `ADMIN_CHAT_PHOTO_ID_RE` and its docstring; `NINA_CHAT_ID_RE` and its docstring; the two
`{12,24}` windows; the `storedPathname` fixture in `tests/admin.chatPhotos.test.ts` and the stored
case in `lib/nina/images.test.ts`; a regression case per predicate.
**Does not touch:** `lib/admin/avatars.ts`, `lib/nina/imagerecipe.ts`, `lib/extract/constants.ts`,
`scripts/blob-reap.mjs`, any Blob `put`/`upload` option, any Zod schema, any action body below the
pathname check, any user-visible copy.
**Exit criteria:**
- `npm run typecheck`, `npm run lint` and `npm test` are green.
- A test asserts each predicate accepts a stored pathname whose suffix is **30** symbols, and that
  case fails on `origin/main`.
- A test asserts each predicate still **refuses** a requested id of 13–24 symbols (invariant 2).
- A test asserts a 12-symbol id ending in `-` followed by a 30-symbol suffix is accepted
  (invariant 4).
- The prod probe from the analysis document's R2 section is re-run against the deployed branch and
  `enina5.png` appears in "Nina generated" on `/admin/photos`, with a row in
  `nina_message_images`.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Two constants or one shared suffix pattern? | Fix each constant in place; do **not** introduce a shared `BLOB_RANDOM_SUFFIX_RE`. `lib/nina/images.ts` is zero-import by RULING A6 and `lib/admin/chatPhotos.ts` imports only `NINA_BLOB_PREFIX` from it; a third shared module for one regex would be the fourth definition of a Vercel internal, and `lib/extract/constants.ts` already keeps its own. | 6: surrounding convention (RULING A6, and `lib/extract/constants.ts`'s standing local copy) |
| Widen the range to `{12,48}` or split the suffix into its own group? | Split. A widened range also admits a 30-symbol *requested* id at mint time, which invariant 2 forbids, and it would drift again the day Vercel changes the suffix length. | 1: plan invariants 2 and 3 |
| Fix `NINA_CHAT_ID_RE` too, or only the reported `/admin/photos` bug? | Fix both, in one commit. It is the same arithmetic in the same shape, measured broken against four real orphaned `chat/` objects in prod, and shipping half of it leaves a known-broken camera path behind a green build. | 5: the user's raw input — *"i cannot upload any image"* is the class, and the analysis found the second route to it |
| Two named constants (`*_ID_RE` + `*_STORED_ID_RE`, OR-ed in the predicate) or one pattern with an optional suffix group? | Two named constants. Both read `true` for a legitimate reason and the predicate says which is which at its return; one optional group hides the fact that the mint and the action are asking different questions. Verified equivalent on all 4 real prod pathnames plus the doubled-`--` case. | 3: the plan's code blocks, checked against the measured ids |
| Narrow the mint window from `{12,24}` to `{12}`, or leave it? | Narrow. Invariant 2 requires it, and the planner verified no in-tree caller passes anything but a bare `newId()` (`components/admin/chatPhotoUpload.ts:112`, `components/nina/Composer.tsx:243`). A third-party client asking for 13-24 symbols would newly 400 — which is the correct answer, since nothing legitimate asks for one. | 1: plan invariant 2 |
| Reap the 15 orphaned blobs here? | No — note it in the PR body and leave it to the `reap-orphaned-blobs` skill. A data-deleting sweep is not a bug fix and does not belong in the same commit. | 6: surrounding convention (the skill exists for exactly this) |

## Open Questions

*(empty — nothing here was a fork where every branch is irreversible)*

## Setup

**The worktree has no `node_modules`.** `npx vitest` resolves a stray npx copy and dies with
`MODULE_NOT_FOUND` on `vitest.config.ts:2`. Run `npm ci` in the worktree before any verification
command — phase 1, Step 0. `.env.local` was copied in when the worktree was cut, so `lib/env.ts`'s
14-variable load-time validation is already satisfied.

## Rollback

`git revert` the single commit. Nothing is persisted, no migration runs, no blob is written or
deleted by this change, and the predicates return to refusing every stored pathname — i.e. back to
today's behaviour exactly.

## Next

Execute the phase:

    /implement -f BLOB_STORED_PATHNAME_WINDOW_PLAN.md --phase 1

Or run the set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f BLOB_STORED_PATHNAME_WINDOW_PLAN.md

Or put it on the board first (GitHub repos only):

    /create-task --from-plan BLOB_STORED_PATHNAME_WINDOW_PLAN.md
