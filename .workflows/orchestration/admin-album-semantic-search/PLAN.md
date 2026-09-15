# Plan: Admin Album Semantic Image Search

**Slug:** admin-album-semantic-search
**Date:** 2026-09-15 08:59:28
**Analysis:** `20260915-085928-9RVY_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-album-semantic-search`
**Branch:** `feature/admin-album-semantic-search` (base: `origin/main` @ `c1a3d9e`)
**Phases:** 4
**Status:** landed — all 4 phases merged to `main` @ `81c101f`
**Coordinator:** —

---

## Why

> 1. implement an image search system :
> for admin:
> in image collection, above "Album" text. put a search field, plus a button to upload image:
> - admin can search using text only. we use semantic search to search to every image description we have, and we output similar images
> - admin can search using image only. think of a way so we can output the most similar images (semantic image search)
> - admin can search using both text and image. think of a way to resolve the scoring between these 2.
>
> use any means necessary in our arsenal, z's api key, openrouter api key, etc.
>
> note: the problem is, our image collection is getting crowded now, i am struggling to see the image i want.

Mid-turn addendum: "we also have full screen image view. the images search result must support this, so if admin click one of the result, it will pop up the full screen image view."

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Search field + image-upload button above "Album"; clicking a result opens the existing full-screen viewer | 4 |
| R2 | Text-only semantic search over image descriptions | 1, 2, 3 |
| R3 | Image-only semantic search (upload an image, find similar) | 1, 2, 3 |
| R4 | Combined text+image search with resolved scoring | 1, 2, 3 |

R2/R3/R4 share phases 1-3 because they share one schema column, one embedding client, and one query function family — splitting the infra by search *mode* would be an artificial slice of work that is genuinely one piece (analysis's Key Consideration 4).

**Phase 4 is the surface that makes R2/R3/R4 usable, and it satisfies R1.** Reconciled 2026-09-15 (see Decisions): every ranking decision R2/R3/R4 name is implemented and tested in phases 1-3, and phase 4 calls one Server Action as a black box. The board's cards for R2-R4 therefore point at 1-3; **none of those three requirements is *reachable by the operator* until phase 4 lands**, which is why phase 4 depends on phase 3 and why no phase of this set ships alone.

## Scope

**In scope:** semantic search (text, image, combined) over `nina_avatars` (the Album), across the whole album regardless of folder; the search UI above "Album"; wiring search results to the existing `PhotoViewer` full-screen overlay; closing the description-coverage gap (Decision 6) so search actually covers "hundreds of profile pics," not just promoted/shared/described rows.

**Out of scope, and why:**
- The Media view (`nina_message_images`, chat photographs) — the user's ask names "Album" specifically and the pain point ("hundreds of profile pics... crowded") is the Album's own documented history (F34 R1); Media is a separate, already-distinct arm throughout this codebase (Decision 1).
- Adding SelectionPane-style actions (make current / delete / move / share) to the search-results full-screen viewer — the user asked only for viewing a result full-screen; normal grid browsing keeps its existing SelectionPane click behavior unchanged.
- Making the embedding model or the text/image score weights operator-configurable via a dropdown — no such ask was made; both are code constants, easy to change later.
- Re-embedding on every read or building a generic "similar photos" recommender outside the search bar.

## Invariants

1. The tree builds, typechecks (`npx tsc --noEmit`), and the test suite passes at the end of every phase (per this repo's own `vitest-does-not-typecheck-next-build-does` convention — vitest alone does not catch a type error).
2. No new synchronous vendor call is added to the upload request path — every describe/embed call this feature adds runs through the existing non-blocking `after()` pattern (`lib/admin/ninaAlbumDeferredDescribe.ts`'s documented constraint) or through a Server Action invoked directly by a search, never through the folder-upload path.
3. Search is scoped by `user_id` exactly like every existing avatar query (`and(eq(ninaAvatars.userId, userId), ...)`) — no cross-user leakage.
4. Every new admin Server Action starts with `requireAdmin()`.
5. A row's `description` remains the single source of truth Nina's prompt reads (invariant 5 in the existing codebase docs) — the embedding is a derived, read-only-by-search column; nothing about how `description` is used elsewhere changes.
6. `next/image` stays unused for these Blob-hosted photographs (existing repo-wide rule); any new tile or viewer instance uses a plain `<img>`.

## Decisions

Pre-decided during analysis (Step 8 rung ladder applied up front, since these are architecture calls this analysis is best-placed to make — not conflicts between parallel phase plans). Phase planners and the reconciler should treat these as settled; only genuine NEW conflicts between phase plans get added here at reconciliation.

| Fork | Chosen | Rung |
|---|---|---|
| Search scope: Album vs. Media vs. both | Album (`nina_avatars`) only | 5: user's raw input names "Album" + surrounding convention (Media is already a distinct arm) |
| Search breadth: current folder vs. whole album | Whole album, every folder | 5: user's raw input ("struggling to see the image i want" implies not knowing the folder) |
| Image-only search mechanism | Caption the query image via the existing `glm-4.6v` describe pipeline (`describeNinaImagesWithFallback`), then run the SAME text-embedding search — no CLIP-style image embedding model | 5: user's raw input ("think of a way... use any means necessary") + 6: surrounding convention (reuse proven, already-measured vision infra; zero new vendor integration) |
| Combined-score resolution | Weighted average of the two cosine similarities against `description_embedding` (default 0.5/0.5, one named constant), computed in a single SQL query — not reciprocal rank fusion, not a second embedding column | 5: user's raw input ("think of a way to resolve the scoring") — both scores already live in the same embedding space, so a weighted average is as principled as rank fusion and simpler |
| Embedding provider | OpenRouter's `/api/v1/embeddings` (existing validated `OPENROUTER_API_KEY`) as the primary path; exact model id + dimension confirmed by a live probe at Phase 1 implementation time, not assumed | 5: user's raw input (explicit latitude: "z's api key, openrouter api key... use any means necessary") + 6: neither z.ai base URL configured today (`LLM_VISION_BASE_URL`, `LLM_BASE_URL`) is confirmed to expose an embeddings surface |
| Description-coverage gap | Extend the existing non-blocking `after()` deferred-describe pattern to cover every uploaded row (bounded concurrency) instead of only the first; add a one-time backfill for existing NULL rows. Do NOT revert to an awaited per-upload describe call | 1: stated invariant (`ninaAlbumDeferredDescribe.ts`'s documented "off the upload path" reasoning) + 5: user's raw input ("to every image description we have" requires descriptions to exist) |
| Search-results click behavior | Open the existing `components/ui/PhotoViewer.tsx`, scoped to the result set; normal (non-search) grid clicks keep today's `SelectionPane` behavior unchanged | 5: user's raw input (mid-turn addendum, verbatim) |
| Where the embedding column lives | `description_embedding vector(N)`, nullable, directly on `nina_avatars` — not a separate `nina_avatar_embeddings` table | 6: surrounding convention (`description` itself is stored the same way; a 1:1 derived fact needs no join) |

### Added at reconciliation (2026-09-15)

Forks that only appeared once the four phase plans could be read against each other. Each one was settled and the losing side was **edited out of its plan file**, so no phase session meets the fork.

| Fork | Chosen | Rung |
|---|---|---|
| The embeddings probe's "no vendor answers" branch: park it as an Open Question, or make the procedure decisive | **Decisive.** Phase 1 probes the full ladder (four OpenRouter candidates, then z.ai's two base URLs), takes the first endpoint that returns a finite `number[]`, and proceeds. "No endpoint anywhere answered" is an operational failure that stops with a **clean tree** — Step 1 writes no repo file and the migration is generated afterwards — not a design fork. **Not an Open Question**, and it does not gate launching the set | 1: the stated Decision above ("confirmed by a live probe at Phase 1 implementation time") is an instruction to probe, not a licence to defer; and no branch is irreversible — the worst wrong outcome is one more additive migration plus a re-embed, for which phase 2's backfill route already exists |
| Phase 4's `Satisfies`: R1-R4, or R1 alone | **R1 alone.** R2/R3/R4 map to phases 1, 2, 3 in the Requirements table, with phase 4 named there as the surface that makes them reachable | 2: the phases' own exit criteria. Phase 4's are placement, the overlay and Clear — not one of them is a ranking claim; it calls one action as a black box and reads seven fields. Widening its Satisfies would put four ids on a phase that implements one |
| Where the search result types live, and what they are called | **`AdminSearchHit` / `AdminSearchResult` / `AdminSearchMode`, exported from the plain barrel `lib/admin/ninaAlbumActions.ts`.** Phase 3 drafted them module-private with `Awaited<ReturnType<…>>` as phase 4's recovery path; phase 4 was written importing them by name from the barrel | 6: surrounding convention — `AdminActionResult` already lives in that barrel for exactly this reason, and a `'use server'` module may not export a type at all. Names follow that neighbour (`Admin*`), so phase 4's `NinaAvatarSearchHit` was renamed |
| The hit's field set: phase 4's seven fields, or phase 3's `ExplorerPhotoBase` + `score` | **Phase 3's wider shape.** Phase 4 reads seven and ignores the rest; its fixtures were widened | 6: surrounding convention — that field set *is* `ExplorerPhotoBase` (`components/admin/explorer/model.ts:25-66`), so a hit plus `origin: 'album'` is an `AlbumExplorerPhoto`. `description` crossing the boundary carried-but-never-rendered is that model's own documented rule (`:49`), not a new exposure |
| The ranked top-N cap: 60 (phase 3) or ≤ 48 (phase 4) | **48** | 6: the surrounding code decides it — `components/ui/PhotoViewer.tsx:264-280` draws one pager dot per photo and phase 4 scopes the overlay to the whole result set, so the cap *is* the dot-row length. Phase 3's 60 rested on "relevance decays", which argues for 48 just as well |
| The query image's client re-encode: phase 3's handoff (1024 px long edge, q0.9) or phase 4's module (768 px **short** edge, q0.75) | **Phase 4's.** Phase 3's handoff prose was rewritten to name those numbers so neither session "corrects" the other | 6: surrounding convention + measurement — `lib/nina/images.ts:28-31` measured 768/0.75 for this exact `glm-4.6v` reader, and a 768 px short edge is ≥ a 1024 px long edge on any 4:3-or-narrower frame. Both plans already agreed on the two hard numbers: the 700 000-char data-URI ceiling, and staying well above the ~640 px short edge below which the describe path's token floor false-trips |

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | [x] Schema + embedding client | R2, R3, R4 | `lib/db/schema`, `lib/nina` | 10 | — | NORMAL | `.workflows/plan/admin-album-semantic-search/phase-1.md` | `P2-DB-A001` | — |
| 2 | [x] Description coverage: deferred describe+embed wiring + backfill | R2, R3, R4 | `lib/admin`, `lib/nina/queries` | 12 | 1 | NORMAL | `.workflows/plan/admin-album-semantic-search/phase-2.md` | `P2-ADM-A001` | — |
| 3 | [x] Search query layer + Server Action | R2, R3, R4 | `lib/nina/queries`, `lib/admin` | 10 | 1 | HARD | `.workflows/plan/admin-album-semantic-search/phase-3.md` | `P2-NIN-A001` | — |
| 4 | [x] Admin UI: search bar, results grid, full-screen viewer | R1 | `components/admin` | 7 | 3 | NORMAL | `.workflows/plan/admin-album-semantic-search/phase-4.md` | `P2-CA-A001` | — |

Phases 2 and 3 both depend only on phase 1 and run concurrently. Phase 4 needs phase 3's Server Action to call. Phase 4 does not code-depend on phase 2, but the *operator* should run phase 2's backfill after deploy for search results to be meaningful on day one — an operational note, not a build dependency.

**Phases 2 and 3 are NOT file-disjoint** (the draft above said they were; reconciliation found otherwise). They share exactly two files, both additively:

| Shared file | Phase 2 writes | Phase 3 writes | Reconciled rule |
|---|---|---|---|
| `lib/nina/queries.ts` | `export * from './queries/avatarEmbeddings'` + header map line §9c | `export * from './queries/avatarsearch'` + header map line §9d | Final order `avatars`, `avatarEmbeddings`, `avatarsearch`. Both plans quote that block. A conflict here resolves to the union in that order, never to a choice. |
| `lib/nina/queries.test.ts` | 4 names into `BARREL_VALUE_EXPORTS`, **and both prose counts (`:11`, `:21-24`), written once for the finished set: 85 → 92** | 3 names into `BARREL_VALUE_EXPORTS`, **no prose edit** | One owner per region. The array assertion compares against `Object.keys(barrel)` at each commit, so each phase's names arrive with the exports that back them; the prose is a comment and is written for the end state. |

Everything else they touch is disjoint: phase 2 owns `lib/admin/ninaAlbum{DeferredDescribe,UploadActions,DescribeActions,AvatarActions}.ts`, `lib/nina/queries/avatarEmbeddings.ts`, `app/admin/nina/page.tsx` and `app/api/admin/nina/backfill-descriptions/route.ts`; phase 3 owns `lib/nina/queries/{avatarsearch,shapes}.ts`, `lib/admin/ninaAlbumSearch{Schema,Actions}.ts` and `lib/admin/ninaAlbumActions.ts`.

### Phase 1 — Schema + embedding client
**Satisfies:** R2, R3, R4
**Owns:**
- `lib/db/schema/nina/avatars.ts` — add a nullable `descriptionEmbedding` `vector` column (+ an HNSW cosine index) to `ninaAvatars`.
- A new migration under `drizzle/` (next number after `0021_nina_error_logs.sql`) that runs `CREATE EXTENSION IF NOT EXISTS vector;` before adding the column.
- `lib/nina/openrouter.ts` — add the embeddings endpoint URL + model id constant(s), same zero-import style as the existing chat constants.
- A new `lib/nina/embedding.ts` (`server-only`) — `embedNinaText(text, opts?): Promise<number[]>`, one `fetch` to the probe-confirmed embeddings endpoint, no SDK, mirroring `lib/nina/vision.ts`'s fetch/error-handling idiom (including `logNinaError` on failure). It **throws** on every failure; both callers catch.
- The schema-drift guard's `vector(N)` → `vector` fold (`scripts/check-schema-drift.mjs`) and the two schema pins this phase falsifies. No peer phase touches `scripts/`.
**Does not touch:** any `lib/admin/*` action file, any UI file, the upload path, and — stated as a hard Requires by **both** phases 2 and 3 — `lib/nina/queries/columns.ts` (`avatarColumns`) and `lib/nina/queries/shapes.ts` (`NinaAvatarRow`). The vector is declared on the table and nowhere else; widening the shared 120-rows-per-page projection would put ~1.5 MB of floats on the wire for a value no renderer reads and would break four suites' `projectedRow(...)` fixtures.
**Exit criteria:** `npm run db:check` passes and the **database, asked directly**, reports the `vector` extension, the nullable `description_embedding` column and the HNSW cosine index (`db:migrate`'s exit code is not the gate); `embedNinaText` is unit-testable against a mocked fetch and returns a `number[]` of the documented dimension; the embedding model id + dimension have been confirmed by a live probe (not assumed) and pasted, dated, into the module's doc comment. **The probe is decisive: try the candidate ladder, take the first endpoint that answers, proceed** — it creates no repo file, so the only stop condition is "no endpoint anywhere answered", which is an operational failure that leaves a clean tree, not a design fork.

### Phase 2 — Description coverage: deferred describe+embed wiring + backfill
**Satisfies:** R2, R3, R4
**Owns:**
- `lib/admin/ninaAlbumDeferredDescribe.ts` — extend `scheduleDescribe` to also compute and store the embedding right after a description is written; extend it (or add a batch sibling) to accept multiple ids with bounded concurrency.
- `lib/admin/ninaAlbumUploadActions.ts:162-196` — schedule describe+embed for every inserted row in a batch, not only `rows[0]`, still via one non-blocking `after()` callback per batch.
- `lib/admin/ninaAlbumDescribeActions.ts`, `lib/admin/ninaAlbumAvatarActions.ts` — every other site that writes `description` also (re)computes the embedding.
- A one-time backfill entry point for existing rows with `description IS NULL` (and/or `description` set but `description_embedding` still NULL, covering rows written before this phase) — `app/api/admin/nina/backfill-descriptions/route.ts`, `requireAdminApi()`-gated, `GET` counts / `POST` one bounded slice.
- `lib/nina/queries/avatarEmbeddings.ts` — the four narrow reads/writes over the column (never SELECTing the vector itself), plus the barrel line for it.
- **Both prose counts in `lib/nina/queries.test.ts`** (`:11`, `:21-24`), written once for the finished set: 85 → 92. Phase 3 adds names to that array but touches no prose line.
- `app/admin/nina/page.tsx` — `export const maxDuration = 300` beside `dynamic`, because `after()` inherits the ROUTE SEGMENT's budget. Phase 4 does not open this file.
**Does not touch:** the schema file itself (phase 1 owns it), the search query layer (`lib/nina/queries/avatarsearch.ts`, `lib/admin/ninaAlbumSearch*.ts`, `lib/admin/ninaAlbumActions.ts` — phase 3's), any UI.
**Exit criteria:** every code path that writes `nina_avatars.description` also writes `description_embedding` in the same non-blocking step; a fresh multi-file folder upload leaves every row's description/embedding filled in within a bounded time window with no added latency on the upload response; the backfill can be run once against existing data and reports how many rows it filled.

### Phase 3 — Search query layer + Server Action
**Satisfies:** R2, R3, R4
**Owns:**
- A new query module under `lib/nina/queries/` — text-only, image-caption-only, and combined-weighted cosine-similarity search over `nina_avatars`, scoped to `user_id`, returning the same shape `listNinaAvatarsInFolder` returns (rows + total) so the existing page.tsx-style row-to-view-model mapping can be reused.
- A new `lib/admin/ninaAlbumSearchActions.ts` — `searchNinaAvatarsAction(input: unknown): Promise<AdminSearchResult>`, Zod-validated `{ text?: string; imageDataUri?: string }` (its own `lib/admin/ninaAlbumSearchSchema.ts`), `requireAdmin()`-gated; calls `describeNinaImagesWithFallback` for the image-query caption step and `embedNinaText(…, { userId })` (phase 1) for both query types; re-exported from the `lib/admin/ninaAlbumActions.ts` barrel.
- **`AdminSearchHit`, `AdminSearchResult` and `AdminSearchMode`, declared on the plain barrel `lib/admin/ninaAlbumActions.ts`** beside `AdminActionResult` — a `'use server'` module may export only async functions, and phase 4 imports the hit type by name in three files. `AdminSearchHit` is `ExplorerPhotoBase`'s field set + `score`, so `{ ...hit, origin: 'album' }` is an `AlbumExplorerPhoto`.
- The top-N cap: `NINA_SEARCH_LIMIT = 48`, module-private. It is also the length of `PhotoViewer`'s dot row once phase 4 opens the overlay over the result set.
**Does not touch:** `lib/admin/ninaAlbumDeferredDescribe.ts` or the upload path (phase 2's territory); `lib/nina/queries.test.ts`'s prose counts (phase 2 owns them); any component file.
**Exit criteria:** the Server Action returns ranked, `user_id`-scoped results for text-only, image-only, and combined queries; the generated SQL for all three carries `user_id = $n` **and** `description_embedding is not null` in both statements, orders by the raw distance **ascending** (the only spelling an HNSW `vector_cosine_ops` index can answer), and the combined read carries both vectors and both weights in ONE statement; an empty query image or empty text is rejected by the Zod schema with **zero** calls to `describeNinaImagesWithFallback` and `embedNinaText`.

### Phase 4 — Admin UI: search bar, results grid, full-screen viewer
**Satisfies:** R1
**Owns:**
- A new `components/admin/explorer/PhotoSearchBar.tsx` — text input, an "upload image to search" button (hidden file input, client-side canvas re-encode to a small JPEG per `components/admin/explorer/chatPhotoUpload.ts`'s precedent, converted to a data URI — never written to Blob), a Search action calling `searchNinaAvatarsAction`, and a way to clear back to normal folder browsing.
- A new results-grid component mirroring `PhotoGrid.tsx`'s borderless-tile idiom but fed by the search action's ranked results instead of a folder page (no folder pager — a flat top-N list).
- `components/admin/FileExplorer.tsx` — insert the search bar as the first element of the returned tree, above the existing breadcrumb/toolbar `div` (`:338`) so it renders above the "Album" text in both the breadcrumb and the folder tree; branch the content pane between the normal `PhotoGrid` and the new results grid depending on whether a search is active.
- Wire a result tile's click to `components/ui/PhotoViewer.tsx` (`photos: hits.map(h => ({url: h.url, kind: h.source, label: h.filename}))`), scoped to the result set. **Correction (2026-09-15): this is `PhotoViewer`'s SECOND caller under `components/admin/`, not its first** — `components/admin/ErrorLogList.tsx:7` already imports it, and `ErrorLogList.tsx:41-67,167-175` is the in-repo precedent for the exact wiring (a `viewerIndex: number | null`, a `useMemo`'d `ViewerPhoto[]`, a conditional render, a `photos[i] != null` guard). The analysis's Key Consideration 6 and this index's own earlier wording were wrong; the plan follows the precedent rather than inventing a second shape.
**Does not touch:** any `lib/` file (calls phase 3's action as a black box); `app/admin/nina/page.tsx` (phase 2 adds `maxDuration = 300` there and this phase never opens the file); `components/admin/explorer/PhotoGrid.tsx` and `SelectionPane.tsx` (the browsing path stays byte-identical); `components/ui/PhotoViewer.tsx` itself.
**Exit criteria:** the search bar renders above "Album" on `/admin/nina`; a text search, an image search, and a combined search each produce a visibly re-ranked grid; clicking a result opens the full-screen viewer over the result set with working close/swipe/keyboard paging; clearing the search returns to normal folder browsing untouched.

## Reconciliation Log

Reconciled 2026-09-15, round 1: 14 findings, 14 resolved by editing the phase plans, 0 deferred.
Round 2 (verification): 5 further findings, all in phase 3, all resolved — see the block below the table.

| # | Class | Finding | Resolution (all of these are now IN the plan files) |
|---|---|---|---|
| 1 | File collision (2 ↔ 3) | Both add an `export *` line to `lib/nina/queries.ts` at the same anchor, and both add a header module-map line **under the same section number §9c** | Fixed order `avatars`, `avatarEmbeddings` (§9c, phase 2), `avatarsearch` (§9d, phase 3). Both plans now quote the post-both block and say a conflict there resolves to the union in that order. Phase 3 renumbered to §9d |
| 2 | File collision (2 ↔ 3) | Both add names to `BARREL_VALUE_EXPORTS` in `lib/nina/queries.test.ts`, and both rewrite the **same** header line with a different total (85→89 vs 85→88) | Measured: the array holds **85** today and the header prose already says 83 (stale by two). Union is **92**. One owner per region: phase 2 writes both prose lines once, for the finished set (85 + 4 + 3 = 92, naming both phases); phase 3 writes no prose. The array insertions are additive and sorted, and both plans now quote the final state of the one region they share (`resolveNinaPhotoReference` … `setNinaAvatarDescriptionAndEmbedding`) |
| 3 | Contract drift (3) | Phase 3's Rollback asserted "phase 2 is unaffected (it shares no file with this phase)" — false, they share two | Corrected in phase 3, with a surgical-revert instruction: drop only this phase's one export line, one map line and three array names, never the files wholesale (that would take phase 2's exports with them) |
| 4 | Unmet assumption (4 → 3) | Phase 4 imports `NinaAvatarSearchHit` / `AdminSearchResult` **by name from the barrel**; phase 3 kept them module-private in the `'use server'` module under different names | Types moved to `lib/admin/ninaAlbumActions.ts` beside `AdminActionResult` and renamed `AdminSearchHit` / `AdminSearchResult` / `AdminSearchMode` (Decisions). Phase 3 gained the declarations in Step 6 and imports them; phase 4's ten references renamed |
| 5 | Contract drift (4 ↔ 3) | Phase 4's declared hit was a 7-field subset and its two `.test.tsx` fixtures were typed against it — they would not compile against phase 3's 14-field hit | Phase 3's shape stands (Decisions). Phase 4's Requires block replaced with the real shape, both fixtures widened to every field, and the "no `description` is requested" note rewritten to say it is carried-and-never-rendered per `model.ts:49` |
| 6 | Contract drift (4 ↔ 3) | Cap 60 vs the ≤ 48 phase 4 asked for | `NINA_SEARCH_LIMIT = 48` in phase 3, with the reason at the constant; phase 3's test case, its two "top-60" mentions and both phases' handoffs updated |
| 7 | Contract drift (3 ↔ 4) | Phase 3's handoff prescribed a re-encode budget (1024 long edge, q0.9) that phase 4's module does not use (768 short edge, q0.75) | Phase 4's numbers stand (Decisions); phase 3's handoff rewritten to name them, and to keep the two numbers that must not drift: the 700 000-char ceiling and the ~640 px short-edge token-floor hazard |
| 8 | Unmet assumption (1 → 2, 3) | Phase 1's Provides says "phase 2 and 3 both have the `userId` and should pass it" to `embedNinaText`; neither plan passed it, so every failure row would land with `user_id = null` | Phase 2's `embedNinaAvatarDescription(description, userId)` and both its call sites; phase 3's two `embedNinaText(…, { userId })` calls. Phase 2's Requires now quotes the real `opts` signature |
| 9 | Unmet assumption (2, 3 → 1) | Phases 2 and 3 both state as a **hard** Requires that phase 1 must not widen `avatarColumns` / `NinaAvatarRow`; phase 1's contract never mentioned either file | Added to phase 1's "Leaves alone" with both reasons (1.5 MB/page of wire; four suites' `projectedRow(...)` fixtures) and to its exit criterion 6, which now names `lib/nina/queries/` |
| 10 | Open-Questions candidate, rejected (1) | Phase 1's probe ended on "Branch C — escalate; an irreversible fork the reconciler must record in Open Questions" | Not irreversible; rewritten as a decisive ladder (Decisions). Step 1 creates no repo file and the migration is generated afterwards, so the stop condition leaves a clean tree. **Nothing was added to Open Questions**, and Step 11 is not blocked |
| 11 | Analysis correction | The analysis (`:91`, `:209`) and this index's draft assumed drizzle-orm 0.45.2 exports no `cosineDistance` | **It does** — re-verified here: `typeof require('drizzle-orm').cosineDistance === 'function'`, body `sql\`${column} <=> ${JSON.stringify(value)}\`` (`node_modules/drizzle-orm/sql/functions/vector.js`). Phase 3 read the same source and still hand-rolls the operator, because the helper emits **no `::vector` cast** and all three searches compose the distance into something else anyway. **Left as phase 3 wrote it** — reasoning checked and sound. Phase 1's handoff, which nudged phase 3 toward the helper, was amended so the corrected fact is recorded without re-opening the choice |
| 12 | Analysis correction | The analysis (Key Consideration 6) and this index said phase 4 is `PhotoViewer`'s **first** use under `components/admin/` | False at `c1a3d9e`: `components/admin/ErrorLogList.tsx:7` already imports it. Good news, not a conflict — phase 4 follows that file's wiring shape. Index's phase-4 bullet corrected |
| 13 | Non-collision, confirmed | Phase 2 adds `export const maxDuration = 300` to `app/admin/nina/page.tsx` and asked phase 4 to keep it | **No collision.** Phase 4's contract, Files table and Rollback all exclude that file; it edits only `components/admin/FileExplorer.tsx` plus new files. Phase 4's "Leaves alone" now says so explicitly and warns that deleting the export would silently cap phase 2's `after()` pass at the platform default with no error |
| 14 | Gap sweep | All nine of the analysis's Impact Points and every Reference List entry checked against the four contracts | **No gaps, no duplicate work, no deleted-then-used symbol** (phase 2 removes a caller-side `if` guard, not a symbol; `setNinaAvatarDescription` is deliberately kept for its other caller). Dependencies point backward only: 1 → {2, 3} → 4. Each phase is build-green on its own predecessors: phase 1's red window is internal to its own Step 3→Step 5, phase 2 and 3 are additive after phase 1, phase 4 compiles once phase 3's barrel types exist |

### Round 2 — verification pass (2026-09-15)

Round 1's four interface edits (the `Admin*` renames, the wide hit shape, the 48 cap, the `userId`
argument) were re-checked against all four plan files as they now stand. Three of the four had landed
everywhere. **Five residual spots survived in phase 3 only** — round 1's own log rows 4, 6 and 8 each
claimed a completeness they had not quite reached. All five are fixed; no decision was re-opened, and
no deletion, creation or rename moved between phases, so the contract is unchanged by this round.

| # | Class | Finding | Resolution |
|---|---|---|---|
| 15 | Contract drift (3 → 1) | Phase 3's `Requires` still quoted phase 1's signature as `embedNinaText(text: string): Promise<number[]>` — no `opts` — while phase 3's own Step 5 code calls `embedNinaText(…, { userId })`. A phase-3 session reading its Requires would have found the argument unaccounted for | Phase 3's Requires item 3 now quotes phase 1's real signature, verbatim-identical to phase 2's item 2 (`opts?: { userId?: string \| null; timeoutMs?: number }`), and states that this phase passes `{ userId }` at both call sites and why |
| 16 | New drift, introduced by row 8 | Phase 3's action suite mocked the module as `embedNinaText: (text: string) => embedNinaText(text)` — a one-argument shim that **drops** the `{ userId }` round 1 added, making any assertion on it unfalsifiable | Mock forwards every argument (`(...args) => embedNinaText(...args)`), matching phase 2's own mock, with the reason at the shim |
| 17 | New drift, introduced by row 8 | The two `toHaveBeenCalledExactlyOnceWith('red dress')` / `('she is on a beach')` assertions pinned the OLD one-argument call and would have gone red against the reconciled code | Both now assert `(…, { userId: USER })` |
| 18 | Contract drift (3), lingering 60 | Row 6 said "its two 'top-60' mentions" were updated; **two others were not** — `NinaAvatarSearchPage.total`'s docstring ("60 shown, out of 342 photos") and the action suite's property-4 docstring ("an oversized `limit` comes back as 60"), the latter directly contradicting its own test body three hundred lines below, which asserts 48 | Both read 48. `grep -n '\b60\b'` over phase 3 is now empty; the only remaining `60` in the set outside phase 2's unrelated timeout reserves is phase 4's handoff line recording that 60 *was* phase 3's draft, which is history and correct |
| 19 | Contract drift (3 ↔ 4) | Phase 3's Step 5 preamble still ended "`AdminSearchMode` stays module-private — phase 4 does not read `mode`", contradicting its own Step 6 (which exports the type from the barrel), its own exit criteria and handoff (which name all three), and phase 4's Requires block (which declares it) | Rewritten: the type is exported from the barrel — it is a member of `AdminSearchResult`, so any consumer of the result type reaches it regardless. Phase 4 not *rendering* `mode` is a reason not to draw it, not a reason to hide the type |

**Checked and clean, no edit needed:** no `NinaAvatarSearchHit` survives as a live reference anywhere
(the two remaining occurrences are phase 3's handoff and this log's row 4, both recording the rename);
phase 4's four hit fixtures (`HIT`, `SECOND`, and the two inline literals in `PhotoSearchBar.test.tsx`)
each carry all fourteen fields; no array-length or key-count assertion in either phase pins a field
count (`Object.keys` appears only against the two barrels, whose counts round 1 already reconciled to
92 and 16); phase 2's `embedNinaText` mock already forwards all arguments and asserts only call counts;
phase 1's `NinaEmbedOptions` is optional in exactly the way both callers use it.

## Open Questions

**None.** Every fork found between the four plans was decided above and the losing side was edited out of its plan file. The one candidate — phase 1's "no embeddings endpoint answers" branch — is not an irreversible fork: it writes nothing to the repo, and the reversible alternatives (the next candidate model, the z.ai swap, or at worst a second additive migration and a re-embed through phase 2's backfill) are exactly what the probe exists to choose between. The set is launchable unattended.

## Rollback

- Per phase: each phase is a self-contained commit/PR on `feature/admin-album-semantic-search`; reverting a phase's commit(s) leaves earlier phases intact (phase 1's schema addition is additive-only — a nullable column plus an index — so phases 2-4 can be reverted independently without a destructive migration).
- **Reverting phase 2 or phase 3 alone must be surgical in their two shared files** (`lib/nina/queries.ts`, `lib/nina/queries.test.ts`): drop only the reverted phase's own `export *` line, header-map line and `BARREL_VALUE_EXPORTS` names. A wholesale revert of either file takes the *other* phase's exports with it and leaves that phase's barrel names pointing at nothing. Phase 2 owns the prose count; after a lone phase-3 revert it reads three high, which is a comment, not a failing assertion.
- As a whole: drop `feature/admin-album-semantic-search` without merging; the additive migration can be left in place harmlessly (nullable column, unused) or reverted with a follow-up `DROP COLUMN` migration if desired.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md
