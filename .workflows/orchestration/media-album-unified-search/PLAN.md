# Plan: Unified semantic search + keyword tagging across Album and Media, with a link-not-copy promotion path

**Slug:** media-album-unified-search
**Date:** 2026-09-17
**Analysis:** `20260917-091446-W0FK_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/media-album-unified-search`
**Branch:** `feature/media-album-unified-search` (base: `origin/main` @ `b8b4aeb`)
**Phases:** 4
**Status:** complete (phase 4/4 complete)
**Coordinator:** —

---

## Why

The operator's own words (verbatim, see the analysis document's User Input for the full exchange):

> every single picture in any directory must be able to be image searched and we must be able to add search keyword and negative search keyword to each of them.

> i think we need to refactor how we save profile picture. make it so, if admin set a picture from Media, we wouldn't copy paste a new duplicate image into Album directory. i keep thinking about this a lot. i think the best way is just using somekind of dynamic link (so the image in Album is just a pointer to the real file in Media) this will solve this duplicate problem in our cross-table search. we will also have many subfolders... make sure this dynamic link mechanism is used for every subfolders as well... this way, storage usage will be lower, and editing image description, search keyword, negative keyword in one place will automatically synchronize it with other location

## Requirements

Final after reconciliation — this maps each `R` to the phases that ended up serving it, and matches
the phase files rather than the draft.

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Every picture, in every directory (Album and Media), is semantically searchable, merged into one deduplicated ranked result set. | 1, 2, 3, 4 |
| R2 | Every picture, in every directory, can carry hand-written search keywords and negative search keywords. | 1, 2, 3, 4 |
| R3 | Promoting a Media photo to Album creates a pointer (no byte copy, no independent description/keywords) instead of a copy, for every folder including new subfolders; editing description/keywords in one place is automatically visible in the other. | 1, 2, 3, 4 |

Phase 4 was added to all three rows (the draft stopped at 3). It is not a widening to legalise
creep: Phase 4's own **Satisfies** line already claimed all three, and its steps serve them
concretely — R1 because the 112 Media originals that already exist are invisible to search until the
backfill runs, R2 because those keyword columns have no vector to ride on until then, and R3 because
the two invariants the link rests on (one hit per photograph, one place the prose lives) are proven
there against a real Postgres rather than asserted.

## Scope

**In scope:**
- New columns: `nina_message_images.search_keywords`, `.negative_search_keywords`, `.description_embedding` (+ HNSW index); `nina_avatars.source_image_id` (FK → `nina_message_images.id`, `ON DELETE RESTRICT`) + index.
- A merged, deduplicated semantic search across both tables, reusing the existing `isOriginalPhoto()` convention symmetrically.
- Media-side keyword actions and UI, mirroring Album's `PhotoDescription` wiring exactly.
- Rewriting `copyChatPhotoIntoAlbum` into a link (no `fetch`+`put`, no new Blob object), and the description/keyword read+write redirection that makes a pointer row's data live only on its linked Media row.
- A refusal (not a cascade, not a silent orphan) when deleting a Media original that an Album pointer still names.
- A one-time embedding backfill for the existing Media rows, mirroring the existing Album backfill route. **Measured against the one Neon database on 2026-09-17, before any of this landed: 155 `nina_message_images` rows, of which 112 are originals (`source_avatar_id IS NULL AND source_image_id IS NULL`) and 43 are reference rows. All 112 originals already carry `glm-4.6v` prose, so the entire backlog is embed-only — 112 embedding calls, zero vision calls.** The analysis document's "154" was the raw table count at an earlier moment; 112 is the row set the backfill acts on.
- Test coverage for every new/changed module.

**Out of scope, and why:**
- Retroactively converting the 18 existing `source_key LIKE 'chat-photo:%'` Album rows (already-copied duplicates from before this change) into pointers, or deleting their now-redundant Blob objects. That is a one-off production data migration the user did not ask for; those rows remain ordinary, independent Album rows. Only the promotion action changes *going forward*.
- Any change to `nina_message_images.source_avatar_id`/`.source_image_id` (the existing chat-bubble re-share mechanism, F37) — a different table's column of the same name, a different feature, untouched.
- Any change to how many search results are returned, the relevance floor, or the text/caption weighting (`NINA_SEARCH_LIMIT`, `NINA_SEARCH_MIN_SCORE`, `NINA_SEARCH_TEXT_WEIGHT`) — those constants carry forward unchanged; this plan only widens *which rows* are candidates.
- Unifying the two tables into one (Option B, considered and rejected with the user during design — see the conversation's Decisions).

## Invariants

1. The tree builds, typechecks (`npx tsc --noEmit`) and passes `vitest` at the end of every phase.
2. No existing Album-only workflow (upload, crop, folder move/rename, delete, "make current") changes behavior for a non-pointer row.
3. A pointer row (`nina_avatars.source_image_id IS NOT NULL`) never independently stores `description`, `search_keywords`, `negative_search_keywords` or `description_embedding` — all four are always NULL on that row; every read of "this photo's description/keywords" for a pointer redirects to its linked Media row, and every write does too.
4. Every physical photograph appears in a merged search result at most once, regardless of which table's embedding matched it.
5. No action in this feature ever calls `del()` on a Blob object directly — every delete path goes through `releaseBlobIfUnreferenced` (or, for a pointer row that never owned bytes, no blob call at all).
6. `requireAdmin()` remains the first line of every new/changed Server Action, exactly as every existing one in these files does.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Schema: media keyword/embedding columns + Album pointer FK | R1, R2, R3 | `lib/db/schema/nina`, `drizzle` | 7 | — | NORMAL | `.workflows/plan/media-album-unified-search/phase-1.md` | P2-DB-A002 | — |
| 2 ✅ | Query/action layer: merged search, media embedding pipeline, link-not-copy promotion, deletion guard | R1, R2, R3 | `lib/nina`, `lib/admin` | 23 | 1 | HARD | `.workflows/plan/media-album-unified-search/phase-2.md` | P2-NIN-A002 | — |
| 3 ✅ | UI: Media keyword box, merged search results, pointer-row messaging | R1, R2, R3 | `components/admin/explorer`, `app/admin/nina` | 12 | 1, 2 | NORMAL | `.workflows/plan/media-album-unified-search/phase-3.md` | P2-CA-A006 | — |
| 4 ✅ | Backfill + test coverage | R1, R2, R3 | `app/api/admin/nina`, `scripts`, `tests` | 6 | 1, 2, 3 | NORMAL | `.workflows/plan/media-album-unified-search/phase-4.md` | P2-APP-A001 | — |

File counts are each phase's own Files table after reconciliation, not an estimate. The chain is
strictly linear (1 → 2 → 3 → 4), so no two phases are concurrently runnable; every dependency points
backward and there are no cycles.

### Phase 1 — Schema: media keyword/embedding columns + Album pointer FK
**Satisfies:** R1, R2, R3
**Owns:** `lib/db/schema/nina/avatars.ts`, `lib/db/schema/nina/chat.ts`, the new leaf module `lib/db/schema/nina/embedding.ts`, the new Drizzle migration under `drizzle/` (+ its meta), and `tests/db.schema.nina.test.ts`.
**Does not touch:** any query, action, or UI file — this phase adds nullable columns with no reader or writer yet, so nothing downstream breaks and nothing upstream needs to know yet.
**Note on the one test file it does own:** `tests/db.schema.nina.test.ts` asserts both tables' column and index lists *whole*, so it goes red the moment the columns land. Phase 1 extends those assertions itself and **Phase 4 must not re-add them** — recorded in both phase files.
**Exit criteria:** `npx drizzle-kit generate` produces one migration that is additive-only (no `DROP`, no `ALTER ... SET NOT NULL`); `npx tsc --noEmit` and `vitest` (`tests/db.schema.nina.test.ts` and the full suite) pass against the new schema; the migration applies cleanly to the one Neon database this repo has; `npm run ci:schema-drift-guard` prints OK for both halves.

### Phase 2 — Query/action layer
**Satisfies:** R1, R2, R3
**Owns:** `lib/nina/queries/*` (including the `avatarColumns` **and** `imageColumns` widenings), the media embedding read/write helpers, the merged search ranking, `copyChatPhotoIntoAlbum` → `linkChatPhotoIntoAlbum`, the new media keyword actions in `lib/admin/chatPhotoKeywordActions.ts`, `deleteNinaAvatarAction`'s pointer-row branch, `removeChatPhotoAction`'s pointer-guard refusal, the four album actions' write-redirection for pointer rows, and `AdminSearchHit`'s three new fields.
**Does not touch:** any component under `components/`, `app/admin/nina/page.tsx`, or `lib/admin/albumDeepLink.ts` (Phase 3's).
**Exit criteria:** every new/changed function has the equivalent unit-test coverage `avatarsearch.ts`/`avatarEmbeddings.ts`/`ninaAlbumAvatarActions.ts` already have for their Album twins; `vitest` and `tsc --noEmit` green — **including `tests/admin.chatPhotos.test.ts` in full**, which requires this phase's Step 14l mock-factory line; `lib/nina/queries.test.ts`'s frozen barrel is 104 names; `listNinaMediaPhotos`' rows carry both keyword columns.

### Phase 3 — UI
**Satisfies:** R1, R2, R3
**Owns:** `components/admin/explorer/model.ts`, `MediaPane.tsx`, `SelectionPane.tsx`, `PhotoDescription.tsx` (comment only), `PhotoSearchBar.tsx` (comment only), `SearchResultsGrid.tsx`, their four co-located `*.test.tsx` suites, `lib/admin/albumDeepLink.ts` (`hrefForMediaView`), and `app/admin/nina/page.tsx`.
**Does not touch:** any query/action file — consumes Phase 2's contracts as given; and `tests/**`, `components/admin/FileExplorer.tsx`.
**Exit criteria:** `vitest` component suite green (`MediaPane.test.tsx`, `SelectionPane.test.tsx`, `SearchResultsGrid.test.tsx`, `PhotoSearchBar.test.tsx` updated/passing) and the three pinned suites it must not break (`tests/admin.photoSearch.test.ts`, `tests/admin.mediaPane.test.ts`, `tests/admin.filetreeBarrel.test.ts`) still green; manual verification against the dev server that a Media photo shows the keyword box, that a merged search returns both arms with no duplicate, **and that a pointer Album row's three boxes hold the linked Media row's values rather than being empty** (the `resolveNinaAvatarLinkedText` call).

### Phase 4 — Backfill + test coverage
**Satisfies:** R1, R2, R3
**Owns:** `app/api/admin/nina/backfill-media-descriptions/route.ts`, `scripts/backfill-media-embeddings.mjs` + its `package.json` line, `tests/admin.mediaBackfillRoute.test.ts`, `tests/integration/mediaAlbumUnifiedSearch.int.test.ts`, and the four new `removeChatPhotoAction` cases in `tests/admin.chatPhotos.test.ts`.
**Does not touch:** any behaviour file of Phases 1-3; `tests/db.schema.nina.test.ts` (Phase 1's); `tests/admin.albumAvatarDelete.test.ts` (Phase 2's); the album backfill route or its suite; production data beyond running the backfill itself (additive: fills NULL embeddings, touches no existing description/keyword prose).
**Exit criteria:** a read-only count over `nina_message_images` scoped to the originals reports `missing_description = 0` and `missing_embedding = 0`, and `GET /api/admin/nina/backfill-media-descriptions` reports `remaining: 0`; full `vitest` suite green; the integration suite passes **with `VITEST_INTEGRATION=1` set** (without it vitest matches zero files and exits 0); `npx tsc --noEmit`, `format:check`, `lint` and `knip` green.

## Reconciliation Log

Reconciled 2026-09-17, one round. The four phase planners ran concurrently; only Phase 1's file had
landed when Phases 2-4 were written, so every cross-phase name below was either an assumption or a
gap. Each row was verified against the actual plan files **and, where the claim was about the tree,
against the tree itself** — not taken from a planner's own summary.

| # | Conflict | Class | Phases | Resolution |
|---|---|---|---|---|
| 1 | Phase 2 adds `countNinaAvatarsLinkedToImage` to `chatPhotoActions.ts`'s `@/lib/nina/queries` import and calls it in `removeChatPhotoAction`, but `tests/admin.chatPhotos.test.ts:420` mocks that module **wholesale** with an explicit-key factory that omits it. A `vi.mock` factory replaces the module, so the name resolves to `undefined` and all **eleven** existing `removeChatPhotoAction` cases throw. **Verified against the tree** — the factory is explicit-key and the name is absent. | Broken-build phase | 2, 4 | **Build-green wins, and the fix lands with the breakage.** New **Phase 2 Step 14l** adds the `vi.fn()` handle, the factory entry and the `beforeEach` default; `tests/admin.chatPhotos.test.ts` added to Phase 2's Files table and exit criteria. Phase 4's Step 4a — which had drafted the same fix under the wrong phase — is rewritten as a *check*, keeping the lines for out-of-order execution, and keeps its four behavioural cases, which are genuinely its own. One owner per region: Phase 2 writes the three mechanical lines, Phase 4 quotes the file as it looks afterwards. |
| 2 | Phase 3 imports `editChatPhotoSearchKeywordsAction` / `editChatPhotoNegativeSearchKeywordsAction` from `lib/admin/chatPhotoActions.ts`. Phase 2 actually exports **`editNinaMessageImageSearchKeywordsAction` / `editNinaMessageImageNegativeSearchKeywordsAction`** from a **new** module, `lib/admin/chatPhotoKeywordActions.ts`. Both the name and the module were wrong. | Contract drift | 2, 3 | **Phase 2 is ground truth; Phase 3 corrected**, at all six sites: the `MediaPane.tsx` import block (now two import statements, since the describe/edit pair still comes from `chatPhotoActions`), the two `<PhotoDescription>` closures, `MediaPane.test.tsx`'s `vi.hoisted`/`vi.mock` (now **two** `vi.mock` calls — mocking only `chatPhotoActions` would leave the real keyword module and the real query layer loaded), its `beforeEach` defaults, both new cases' assertions, and the two `model.ts` doc comments naming the media write path. Phase 3's assumption table is rewritten from assumptions into Phase 2's stated contract. |
| 3 | Phase 3's A3 requires `listNinaMediaPhotos`' rows to carry `searchKeywords`/`negativeSearchKeywords`, and `MediaExplorerPhoto` declares both **required**. Phase 2 widened `avatarColumns` only and left `imageColumns` untouched — **verified against `lib/nina/queries/columns.ts`**, which has neither column. Phase 3 may not edit `lib/nina/queries/*`, so nobody owned this. | Gap | 2, 3 | **Assigned to the phase that owns the package.** Phase 2's Step 1 now also adds both columns to `imageColumns` and `NinaImageRow`, with the `imageEmbeddings.ts` "never through `imageColumns`" rule distinguished (that rule is about the 1536-float vector, not two short text columns). **Appended after `createdAt`, not inserted beside `description`** — two positional `imageRow()` fixtures project this list (`tests/admin.chatPhotoAdoption.test.ts:96`, `tests/nina.chatPhotoAdoption.test.ts:48`, both stopping at 14 of 17 values), and an insertion would have shifted `prompt`/`sourceAvatarId`/`sourceImageId` left by two, silently re-assigning the provenance ids the adoption guard reads — in a file **no phase owns**. Appending costs no fixture edit at all and matches the call `avatarColumns` already makes. Phase 2's Interface Contract, Files table and exit criteria updated. |
| 4 | Phase 3's A5 assumed `listNinaAvatarsInFolder` already returns a pointer row's borrowed prose. It does not, and Phase 2 never intended it to — the redirect is a **second, explicit** call, `resolveNinaAvatarLinkedText(userId, rows)`, which Phase 2's handoff assigns to `page.tsx`. Phase 3's Step 8b mapped `row.description` directly and its comment asserted the redirect had already happened. A5 itself flagged this as "the only assumption whose failure makes shipped copy wrong". | Unmet assumption | 2, 3 | **Phase 3 corrected, and this is the most load-bearing fix in the set.** Step 8b now calls `resolveNinaAvatarLinkedText` once above the map (zero statements when the page holds no pointer) and maps the three fields through `linked.get(row.id) ?? row` as one binding so they cannot drift apart; `resolveNinaAvatarLinkedText` added to the page's query import. Without it, `SelectionPane`'s new sentence ("its description and keywords are stored there") would sit above three empty boxes — and since the *write* half does work, the user-visible symptom would be "I typed keywords, saved, and they vanished on reload". Phase 2's handoff now states the split explicitly; Phase 3's exit criteria now name it. |
| 5 | Phase 2 makes `AdminSearchHit.searchKeywords` and `.negativeSearchKeywords` **required**. Phase 3's three `AdminSearchHit` fixtures (`SearchResultsGrid.test.tsx`'s `HIT`, and `PhotoSearchBar.test.tsx`'s literal) carry neither — and Phase 3's own fixture comment says a partial literal does not typecheck. | Contract drift | 2, 3 | Both fixtures given the two fields (the `SECOND`/`MEDIA_HIT` fixtures spread `...HIT` and inherit them); both fixture comments corrected to name the widened type. Added as row **A6b** to Phase 3's contract table, since the phase had not anticipated the fields at all. Phase 2's handoff now states they are required. |
| 6 | Phase 2's Assumption 2 carried a live caveat — *"If Phase 1 could only put the FK in raw SQL, the drizzle column must still exist — flag to the reconciler"* — hedging on a question Phase 1 had already settled. | Contract drift | 1, 2 | **Settled and the losing branch edited out.** Phase 1 declared the FK at the drizzle level with `.references((): AnyPgColumn => …)`, breaking the `avatars ⇄ chat` cycle by moving `NINA_EMBEDDING_DIMENSIONS` into the new leaf module `lib/db/schema/nina/embedding.ts`, and re-probed both module-entry orders green. Phase 2's assumption rewritten as fact; the raw-SQL fallback note removed so no phase session meets the fork. |
| 7 | Phase 2's `countNinaAvatarsLinkedToImage` docstring cites the index as `nina_avatars_user_source_image_idx`; Phase 1 creates `nina_avatars_source_image_id_idx`. | Contract drift | 1, 2 | Phase 2 corrected to Phase 1's spelling, and Phase 2's Assumptions block now pins the index name alongside the column. |
| 8 | Phase 2's Steps 14f/14h/14i prescribe the same `pick(overrides, 'sourceImageId', null)` append across three positional `avatarRow()` fixtures. **`pick` is defined in only one of them** — `tests/admin.chatPhotoAdoption.test.ts`; `tests/admin.albumDescribeEmbed.test.ts` and `tests/admin.albumAvatarActions.test.ts` spell the same idea as `'x' in overrides ? overrides.x : <default>`. Verified in the tree. | Contract drift | 2 | **14f keeps `pick` (it is correct there); 14h and 14i rewritten to their own files' idiom**, each with the exact line to append and the `— 20 values` → `— 21 values` docstring bump, plus an explicit note not to import or re-declare `pick` across files. |
| 9 | Phase 4's Step 7 and Verification run `npx vitest run tests/integration/mediaAlbumUnifiedSearch.int.test.ts` **without `VITEST_INTEGRATION=1`**. `vitest.config.ts` excludes `tests/integration/**` unless that is set, so the command matches zero files and exits 0 — a green that answered a different question, on the one suite carrying invariants 3 and 4. | Contract drift | 4 | Both invocations given `VITEST_INTEGRATION=1`, with a note to confirm the run reports a case count rather than `No test files found`. (`npm run test:int`, which the test file's own header recommends, already sets it.) |
| 10 | Draft Requirements table mapped R1/R2/R3 to phases 1-3 while the phase table and Phase 4's own **Satisfies** line claimed all three for Phase 4. | Unowned requirement / drift | all | Requirements table corrected to `1, 2, 3, 4` for all three, with the reason each `R` genuinely reaches Phase 4 recorded inline. Not a widening to legalise creep — Phase 4's steps serve all three concretely. |
| 11 | Plan index Scope said "the 154 existing Media rows"; Phase 4 measured the database directly and found 155 rows, of which **112** are originals (the set the backfill acts on) and 43 are reference rows, with all 112 already carrying prose. | Contract drift | index, 4 | Scope corrected to the measured numbers with the measurement date stamped, and the 154/112 discrepancy explained rather than silently replaced. |

**Verified and found already correct — no edit made** (recorded so they are not re-litigated):

- **The media search scope's SQL matches its prose.** `mediaSearchScope`'s `NOT EXISTS` subquery does
  contain `and ${ninaAvatars.sourceImageId} is null`, so only a *legacy copy* hides its Media
  original and a *pointer* does not — a promoted photograph keeps its one ranked half. The prose and
  the code block agree; this was the trap Phase 2 flagged on itself, and it is genuinely closed.
- **The three positional `avatarRow()` fixtures are touched by Phase 2 only.** Phase 3 leaves
  `tests/**` alone and Phase 4's Files table lists only `tests/admin.chatPhotos.test.ts`. No
  collision.
- **`NINA_MEDIA_BACKFILL_BUDGET_MS = 240_000` and `NINA_MEDIA_BACKFILL_SLICE = 200`** are declared in
  `lib/admin/ninaMediaDeferredDescribe.ts` under exactly those names, so Phase 4's route imports and
  its pinned `200` literal are correct. `NINA_ALBUM_BACKFILL_*` is correctly left unrenamed.
- **No phase imports `NINA_EMBEDDING_DIMENSIONS`** outside `lib/db/schema/` — its only consumer in
  the tree is `lib/nina/embedding.ts`, through the `@/lib/db/schema` barrel, which Phase 1's
  re-export keeps byte-identical. There is no stale import path to fix in Phase 2.
- **Phase 4's integration-test reasoning is sound and its code is present, not merely described.**
  `tests/support/fakeDb.ts` is confirmed a *recording* driver — it replays enqueued rows and never
  evaluates a `WHERE` — so a unit test of invariant 4 would assert what the test itself enqueued and
  would pass against a build with both predicates deleted. The complete integration file is in the
  plan. Its two open contract questions (`resolveNinaAvatarLinkedText`'s argument shape;
  `searchNinaPhotosByText`'s third parameter) were both checked against Phase 2's code blocks and
  confirmed correct as written.
- **`AdminSearchHit.isCurrent` is safe to read unbranched.** `rankMedia` writes the literal `false`
  for every media hit and `albumSearchScope` excludes pointer rows from ranking entirely, so the
  "Hers" pill needs no `origin` guard (Phase 3's A7).
- **`lib/admin/albumDeepLink.ts` is Phase 3's alone.** It sits in `lib/admin/` but is not an action
  module and Phase 2 does not touch it; ownership is now stated in the index's Phase 3 block.

**Left alone deliberately:** `lib/nina/openrouter.ts:71` and `lib/nina/embedding.ts:292-298` carry
prose pointing at `lib/db/schema/nina/avatars.ts` and naming `nina_avatars.description_embedding`
alone. Both become slightly stale once the constant moves to `./embedding.ts` and a second table
carries a vector. Neither is a build or behaviour issue, both are inside Phase 2's package, and
neither phase's steps reach those lines — recorded here rather than bolted onto a phase, for the
readme-updater at landing.

**All five rows of the Decisions section below were checked against what the phases actually
prescribe, and none is contradicted** — so that section stands exactly as the `/analyze` session
wrote it, untouched. The reverse-the-copy decision is Phase 2 Step 6's `linkChatPhotoIntoAlbum` (no
`fetch`, no `put`, no seeded `description`); "a pointer stores nothing" is enforced by Phase 2's four
redirecting album actions plus `avatarPointer.ts`, and now actually *rendered* by Phase 3 after
conflict 4; `ON DELETE RESTRICT` is Phase 1's FK plus Phase 2's friendly pre-check; the dedup rule is
`albumSearchScope`'s `source_image_id IS NULL` against `mediaSearchScope`'s qualified `NOT EXISTS`,
proven complementary by Phase 4's integration case; and the 18 legacy copies are left alone by every
phase, with each of Phases 2, 3 and 4 carrying a handoff saying so. No fix was needed in either
direction, and **Open Questions stays empty** — every conflict above was decidable from the phase
files, the tree, or the user's own input, and none has an irreversible branch.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Reverse `setChatPhotoAsAvatarAction`'s deliberate "bytes copied, not shared" decision (`lib/admin/ninaAlbumAvatarActions.ts:82-114`)? | Yes — link, not copy, per R3. The old decision's own two stated risks (independent crop/lifetime; shared-delete safety) are both already handled by mechanisms unrelated to whether bytes are copied (crop lives in `nina_avatars`' own columns; `isBlobPathnameReferenced`/`releaseBlobIfUnreferenced` already do reference-checked shared-blob deletion). A live cross-table read with no copy is already proven safe in production by `resolveNinaPhotoReference` (face-anchor). | 5: user's raw input (Step 0), reinforced by in-repo precedent that removes the old convention's own stated risk |
| Where does a pointer row's description/keywords live? | Nowhere on the pointer row itself — always NULL there. Every read/write for a pointer row redirects to its linked `nina_message_images` row. This is what makes "editing in one place syncs the other" true by construction, per R3's literal words, with no dual-write/sync mechanism to get wrong. | 5: user's raw input (R3's explicit synchronization ask) |
| What FK behavior when a Media original that an Album pointer names is deleted? | `ON DELETE RESTRICT` — refuse the delete with an actionable message, mirroring `deleteNinaAvatar`'s existing "can't delete the current avatar" refusal shape. `SET NULL` would produce a pointer row with no bytes (unrecoverable without re-copying, defeating R3); `CASCADE` risks silently losing the "current profile picture" designation. | 6: surrounding convention (the codebase's existing preference for explicit refusals over silent state loss — the `is_current` partial unique index, the reference-checked blob release) |
| How does merged search avoid double-counting a linked photo? | Reuse `isOriginalPhoto()`'s existing convention symmetrically: rank `nina_avatars` rows with `source_image_id IS NULL` UNION `nina_message_images` rows with `isOriginalPhoto()` true. A pointer Album row is never itself ranked (its embedding column stays NULL by the decision above); the Media row it points to is the one hit. | 6: surrounding convention (the existing dedup idiom is the strongest precedent for "count a physical photo once") |
| Retroactively convert the 18 existing copied Album rows into pointers? | No — out of scope. The user asked to fix the promotion *action* going forward, not to run a one-off production data migration on existing rows. | 5: user's raw input scope (R3 is phrased as "make it so, if admin set a picture..." — a future-tense action change) |

## Open Questions

*(none — every fork above was decidable from the ladder; nothing here is irreversible-both-ways)*

## Rollback

- **Per phase:** each phase's migration/code is additive (new nullable columns, new functions, new optional UI props) — reverting a phase's commit(s) and rolling back its migration (if Phase 1) leaves the tree in its pre-phase state with no data loss, because nothing in Phases 1-3 deletes or mutates existing rows.
- **Phase 4's backfill** only fills NULL embedding columns; rolling it back means leaving those rows unembedded again, which is a supported, pre-existing state (`countNinaAvatarDescribeBacklog`'s shape).
- **As a whole:** `git worktree remove` + delete `feature/media-album-unified-search` if abandoned before merge; the migration is the only step that touches the shared (production) database, and it is additive-only per the exit criteria above, so it needs no down-migration to be safe to leave applied even if the code is reverted.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md
