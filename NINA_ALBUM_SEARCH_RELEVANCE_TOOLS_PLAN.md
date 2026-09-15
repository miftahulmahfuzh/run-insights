# Plan: Nina album search — relevance tools

**Slug:** nina-album-search-relevance-tools
**Date:** 2026-09-15
**Analysis:** `20260915-140828-SBI4_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-album-search-relevance-tools`
**Branch:** `feature/nina-album-search-relevance-tools` (base: `origin/main` @ `751e034`)
**Phases:** 3
**Status:** phase 2/3 complete (phases 1 and 2 landed on this branch; phase 2's migration is applied to the production database and its backfill has run; phase 3 `P1-SC-V2XN` is now unblocked and runnable). Not yet merged — a plan set is reviewed and merged as a whole.
**Coordinator:** —

---

## Why

commit 751e034 sudah dideploy ke vercel prod. tapi saya masih melihat hasil image search (text
only) yang tidak akurat. test flow saya: 1. saya ketik query "tete" 2. ada beberapa gambar
irrelevant muncul sebagai search result. 3. saya klik gambar #Rm2NG.. saya masuk ke full screen
image view.

pertama: tambah tombol icon di full screen image view. tombol yang mengarahkan user ke UI yang
bisa melihat image description. kita punya panel ini, dimana user bisa langsung ngedit image
description nya juga. tujuannya: kalo misalnya saya liat search result irrelevant, saya bisa
langsung ke deskripsinya dan ngedit deskripsi nya.

kedua: wait wait wait.. akan lebih bagus lagi, kalo selain image description, kita tambah satu
field baru, search_keywords (contoh value string: "tete", "putih"). field search_keywords ini bisa
di utilize untuk meningkatkan akurasi search juga. bentuk nya sama dengan existing image
description (free text), cuma bentuk nya kumpulan phrase dipisah dengan koma.

ketiga: tolong buat satu claude skill untuk project ini "/search-analysis <text-query>
<part-of-image-id>". misal: "/search-analysis tete #Rm2NG". anda akan melakukan sendiri search ini
dan mencoba infer kenapa image #Rm2NG tergolong relevan untuk text-query. skill ini akan membantu
kita karena dengan begini kita akan punya streamlined workflow untuk menganalisis irrelevant search
results.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Icon button in the full-screen viewer that jumps to that photo's description panel | 1 |
| R2 | New `search_keywords` field (comma-separated), editable, feeds search relevance | 2 |
| R3 | `/search-analysis <query> <part-of-id>` skill — diagnose, never auto-edit | 3 |

Final after reconciliation: **R1 → 1 · R2 → 2 · R3 → 3**. No step moved between phases, so no
requirement id moved either; every `R` has exactly one owning phase and no phase's steps serve an
`R` outside its own **Satisfies** line. 41 files across `components/ui`, `components/admin`,
`app/admin/nina`, `lib/nina`, `lib/admin`, `lib/db/schema`, `drizzle`, `scripts`, `.claude/skills`,
`package.json` (12 in phase 1, 26 in phase 2, 3 in phase 3; five of those paths are touched by two
phases each — see the Reconciliation Log).

## Scope

**In scope:**
- R1: threading a real `id` through `ViewerPhoto`, a new icon button in `PhotoViewer`'s header, and
  the server-side id→folder(+page) resolution `?avatar=<id>` needs so the target photo is loaded
  and selected regardless of which folder it lives in.
- R2: a new nullable `searchKeywords` text column on `ninaAvatars`, its migration, the UI control
  in `PhotoDescription`, the save path, folding it into the one embedding choke point
  (`embedNinaAvatarDescription`), and a one-off backfill re-embedding every row with the same
  combine-then-embed path.
- R3: a new diagnostic script (raw-SQL, unfiltered, following `scripts/album-search-probe.mjs`'s
  convention) plus a `.claude/skills/search-analysis/SKILL.md` that runs it and writes the
  inference. Analysis and suggestion only. The `<part-of-image-id>` argument resolves by
  **substring match, `strpos(id, $1) > 0`** — which subsumes prefix, suffix and interior — with
  zero matches and ambiguous matches both refused rather than guessed at. (Not suffix-only, and not
  `LIKE`: see Decisions.)

**Out of scope:**
- Any change to `NINA_SEARCH_MIN_SCORE` or `NINA_SEARCH_LIMIT`, or to the weighting in
  `searchNinaAvatarsByTextAndCaption` — R3 is diagnostic, not a scoring change.
- Any UI for browsing/searching by `search_keywords` directly (it only enters through the
  embedding); no exact/substring keyword-match boost path.
- Any change to how `description` is captioned by the vision model.
- Retuning the 0.2 threshold itself (a separate, already-tracked concern per
  `avatarsearch.ts`'s own docstring).

## Invariants

1. The tree builds (`npx tsc --noEmit`) and existing tests pass at the end of every phase.
2. `description`/`descriptionEmbedding` (and, after phase 2, `searchKeywords`) never disagree for
   any window an operator could observe: a write to any of them that changes what should be
   embedded must also invalidate or recompute the embedding in the same transaction/step — the
   existing rule `setNinaAvatarDescriptionAndEmbedding`'s docstring already states for `description`.
2b. Re-describe (`describeNinaAvatarAction`) **writes** `description` and the embedding only. It
   **may read `searchKeywords`, and must** — the vector it recomputes has to carry the operator's
   tags or every re-describe silently undoes R2 for that row. It must never clear or overwrite the
   column, and the omission is structural rather than remembered:
   `setNinaAvatarDescriptionAndEmbedding` sets two columns and `search_keywords` is not one of them.
   *(Corrected by the reconciler — the draft said "never read", which contradicted invariant 2 and
   R2. See Decisions.)*
3. No phase changes `NINA_SEARCH_LIMIT`, `NINA_SEARCH_MIN_SCORE`, or the text/caption weighting.
   Phase 3 **mirrors** both constants in its script to report against them, and never applies them.
4. Every new server-side read/write stays scoped to `userId` (the existing rule every query in
   `lib/nina/queries/*` already follows). Phase 3's script takes no `userId` argument: it reads
   `user_id` off the resolved target row and scopes its ranking to that owner.
5. `scripts/` files added in phases 2 and 3 do not import `server-only` app code
   (`lib/nina/embedding.ts`, `lib/admin/ninaAlbumDeferredDescribe.ts`, any `'use server'` module) —
   the existing rule `scripts/album-search-probe.mjs`'s header states for itself. **The carve-out
   both phases take, and it is not an exception to this invariant:** a `lib/` module that is
   provably ZERO-IMPORT may be imported from `scripts/` under
   `node --experimental-strip-types`, which is the precedent `scripts/backfill-record-keys.mjs` and
   `scripts/nina-shortcuts-import.mjs` already run under. Phase 2 creates
   `lib/nina/avatarEmbedText.ts` to that contract and both scripts import
   `buildNinaAvatarEmbedText` from it; everything else (the embeddings URL, the model id, the vector
   width, the SQL) is duplicated per the probe convention. Both phases state the split in writing.
   **Do not add an import to `lib/nina/avatarEmbedText.ts`** — doing so breaks phase 3's script at
   load time.
6. `.claude/skills/search-analysis/SKILL.md` (phase 3) never calls an edit/write action — it may
   only read and report.
7. **The drizzle migration (phase 2) is generated at implement-time, never hand-written and never
   renumbered.** Before generating, check `git log origin/main -- drizzle/` for a migration that
   took the next number while this branch was in flight; if one has, **regenerate from the merged
   schema — never rename the file.** A renamed migration is skipped silently and strands itself
   below the ledger watermark permanently (`scripts/check-schema-drift.mjs` explains why;
   `drizzle/0023_dry_kabuki.sql`'s own header records the repair). Verify by effect —
   `npm run ci:schema-drift-guard` after `npm run db:migrate` — never by reading
   `drizzle/meta/_journal.json`.
8. **This repo has ONE database: `.env.local`'s `DATABASE_URL` is what production reads.** Phase 2's
   `db:migrate` and its backfill both write production. The migration is additive-only (one nullable
   column, no default, no backfill), which is what makes migrate-before-deploy the correct order:
   every SELECT in this repo is an explicit projection, so old code keeps working. No phase issues a
   `DROP COLUMN` — that applies AFTER the deploy and would break the still-running old one.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | [x] Viewer button + cross-folder navigation to the description panel | R1 | `components/ui`, `components/admin`, `app/admin/nina`, `lib/nina/queries`, `lib/admin` | 12 | — | HARD | `.workflows/plan/nina-album-search-relevance-tools/phase-1.md` | P1-RI-K3JQ | — |
| 2 | [x] `search_keywords` field, embedding combine, and backfill | R2 | `lib/db/schema`, `drizzle`, `lib/nina`, `lib/admin`, `components/admin/explorer`, `app/admin/nina`, `scripts` | 26 | — | HARD | `.workflows/plan/nina-album-search-relevance-tools/phase-2.md` | P1-ADM-T8RM | — |
| 3 | `/search-analysis` skill and its diagnostic script | R3 | `scripts`, `.claude/skills` | 3 | 2 | NORMAL | `.workflows/plan/nina-album-search-relevance-tools/phase-3.md` | P1-SC-V2XN | — |

Phases 1 and 2 are concurrent (`depends_on: []` both). Phase 3 waits on 2. Phase 2's difficulty was
raised NORMAL → HARD at reconciliation: its reconciled scope is 26 files, a schema migration against
the production database, a signature change with two call sites, and a projection-order change four
positional test helpers depend on.

### Phase 1 — Viewer button + cross-folder navigation to the description panel
**Satisfies:** R1
**Owns:** `lib/admin/albumDeepLink.ts` (new, + test) — the `?avatar=` grammar;
`lib/nina/queries/avatars.ts` (`locateNinaAvatar`, `NinaAvatarLocation`);
`components/ui/PhotoViewer.tsx` (+test) — `ViewerPhoto.id`, the `headerAction` slot;
`components/admin/explorer/SearchResultsGrid.tsx` (+test) — the link and its glyph;
`components/admin/FileExplorer.tsx` (+test) — the `deepLinkId` prop and the landing effect;
`app/admin/nina/page.tsx` — **the `?avatar=` resolution only** (`:1-24`, `:124-128`, `:311-319`, the
file's tail); `tests/admin.photoSearch.test.ts`; one name in `lib/nina/queries.test.ts`'s frozen
barrel list.
**Does not touch:** `components/admin/explorer/PhotoDescription.tsx`,
`components/admin/explorer/SelectionPane.tsx`, `components/admin/explorer/model.ts`,
`lib/nina/queries/shapes.ts`, `lib/nina/queries/columns.ts`, `lib/nina/queries/avatarEmbeddings.ts`,
`lib/admin/schema.ts`, `lib/admin/ninaAlbum*Actions.ts`, `lib/db/schema/**`, `drizzle/**`,
`package.json`, anything under `scripts/` or `.claude/skills/`; **and `app/admin/nina/page.tsx`'s
album row→prop literal at `:229-243`, which is phase 2's one additive line.**
**Exit criteria:** clicking the new button in the open viewer, for a search hit from any folder,
lands the operator on `/admin/nina` with that exact photo selected and its description panel open
— verified for a hit in a folder other than the one currently open, and for a hit that would fall
on a page other than page 1 of its folder; the `?avatar=` parameter is spent (replaced, not pushed)
and the URL that replaces it reloads to the same place; a well-formed id naming no row lands on the
album root with nothing selected and no error; `npm run typecheck` and `npm test` green.

### Phase 2 — `search_keywords` field, embedding combine, and backfill
**Satisfies:** R2
**Owns:** `lib/db/schema/nina/avatars.ts`; the generated migration under `drizzle/` (+ `drizzle/meta/*`);
`lib/nina/avatarEmbedText.ts` (new, zero-import — the one combine function);
`lib/admin/avatars.ts` (the 500-char bound); `lib/nina/queries/columns.ts`;
`lib/nina/queries/avatarEmbeddings.ts` (target shape + the sibling writer);
`lib/admin/ninaAlbumDeferredDescribe.ts` (the `embedNinaAvatarDescription` choke point);
`lib/admin/ninaAlbumDescribeActions.ts` (+ the `lib/admin/ninaAlbumActions.ts` re-export);
`lib/admin/schema.ts`; `components/admin/explorer/model.ts` (`AlbumExplorerPhoto.searchKeywords`);
**`app/admin/nina/page.tsx:241` — the one additive row→prop line** (reconciled: phase 1 owns the
file, phase 2 owns this region — see the Reconciliation Log);
`components/admin/explorer/PhotoDescription.tsx` (+test);
`components/admin/explorer/SelectionPane.tsx` (+test);
`scripts/backfill-avatar-embeddings.mjs` + its `package.json` script; and the projection-order test
helpers in `tests/admin.albumDescribeEmbed.test.ts`, `tests/admin.albumAvatarActions.test.ts`,
`tests/nina.avatarSearch.test.ts`, `tests/admin.albumActionsBarrel.test.ts`,
`components/admin/explorer/PhotoGrid.test.tsx` and `components/admin/FileExplorer.test.tsx:167`.
**Does not touch:** `components/ui/PhotoViewer.tsx`, `components/admin/explorer/SearchResultsGrid.tsx`,
`components/admin/FileExplorer.tsx` (**source**; its test's album-photo helper IS touched),
`lib/nina/queries/avatarsearch.ts`, `lib/admin/ninaAlbumSearchActions.ts` (`AdminSearchHit` does
NOT gain the field), `lib/admin/chatPhotoSchema.ts`, `.claude/skills/**`,
`scripts/search-analysis.mjs`, and **every region of `app/admin/nina/page.tsx` except `:241`**.
**Exit criteria:** `nina_avatars.search_keywords` exists and `ci:schema-drift-guard` is green; a
photo's keywords save and persist independently of `description`, and an emptied box stores NULL;
saving EITHER column nulls `description_embedding` in the same UPDATE and re-earns it from the
combined text (`description` alone, or `description + "\n\nKeywords: " + searchKeywords` when the
trimmed keywords are non-empty); `describeNinaAvatarAction` **reads** the keywords into the new
vector and its generated UPDATE does not contain `search_keywords`; the Media arm renders no keyword
box at all; `npm run nina:backfill-embeddings` re-embeds every row with a description through
`buildNinaAvatarEmbedText` and prints `embedded N · failed 0 · skipped M`; `npm run typecheck` and
`npm test` green.

### Phase 3 — `/search-analysis` skill and its diagnostic script
**Satisfies:** R3
**Owns:** `scripts/search-analysis.mjs`, `.claude/skills/search-analysis/SKILL.md`, and one
additive `nina:search-analysis` line in `package.json`'s `scripts` block.
**Does not touch:** anything under `components/`, `app/` or `lib/` — including
`lib/nina/queries/avatarsearch.ts` (read and mirrored, never edited) and
`lib/nina/avatarEmbedText.ts` (phase 2's, **imported** and never edited);
`scripts/album-search-probe.mjs` and `scripts/backfill-avatar-embeddings.mjs` stay byte-identical;
no test file changes.
**Depends on phase 2** for two things, both hard: the `search_keywords` column **with its migration
applied** (the script `SELECT`s it by SQL name), and `lib/nina/avatarEmbedText.ts` existing and
staying zero-import (the script imports `buildNinaAvatarEmbedText` under
`--experimental-strip-types`; an added import there breaks this phase at module load). Neither can
be stubbed.
**Exit criteria:** `/search-analysis tete #Rm2NG`-shaped invocation resolves the partial id by
**substring** (`strpos`), refusing zero matches with exit 3 and ambiguity with exit 4 (listing the
candidates) — never guessing; runs the unfiltered ranking query (no 48-row cap, no 0.2 floor,
scoped to the target row's owner, carrying the app's `(created_at desc, id desc)` tiebreak) and
emits ONE JSON document on stdout carrying the target's true rank/score, `description`,
`searchKeywords`, `embeddedText` (produced by phase 2's function, not a local copy), `hasEmbedding`,
a `wouldAppearInApp` verdict with `cutBy` reasons, the candidate count and the top 10 competing
rows; a row past rank 48 or under 0.2 is REPORTED with its rank and score; the skill's output is a
written inference and the session makes zero write calls; `git diff --stat` shows exactly three
paths.

## Reconciliation Log

Round 1, over all three phase plans. 9 conflicts found, 9 resolved, 0 deferred. Every resolution
below was written into the phase files themselves — none of them is advice.

| # | Class | Conflict | Resolution (and where it was edited) |
|---|---|---|---|
| 1 | File collision + broken-build | `app/admin/nina/page.tsx`: phase 1 owns the file; phase 2 needs one additive line at `:241` (`searchKeywords: row.searchKeywords,`) or `tsc` fails, because `AlbumExplorerPhoto` gains a required field and this is the only non-test construction site (verified: `grep -rn "origin: 'album'"` → `page.tsx:230` + 3 test helpers). Phase 2's own plan asked the reconciler to decide. | **Line stays in phase 2.** Build-green wins: the phases are concurrent, and a phase-1 commit carrying the line would not compile — `row.searchKeywords` does not exist until phase 2's `avatarColumns` change and `AlbumExplorerPhoto` does not want it until phase 2's `model.ts` change. Column + type + construction site are one atomic compile unit. Regions are disjoint (phase 1: `:1-24`, `:124-128`, `:311-319`, tail; phase 2: `:241` only) so git merges either order. Edited: phase 1's **Leaves alone**, Files table and Handoffs now name the region as phase 2's; phase 2's `⚠ CROSS-PHASE CONFLICT` block and Step 12 heading are now `RESOLVED`, with the "reconciler may move it" escape hatch deleted. |
| 2 | Gap (ownership) | `components/admin/explorer/model.ts` — `AlbumExplorerPhoto`'s declaration. Named in neither phase's *index* entry; the analysis's impact list does not name it either. | **Not actually ungoverned:** phase 2's own Files table and Step 11 own it, and phase 1 touches it for no other reason. Assigned to **phase 2** and added to its **Owns** line in this index; added to phase 1's **Leaves alone**. |
| 3 | File collision + factual error | `lib/nina/queries.test.ts`'s frozen `BARREL_VALUE_EXPORTS`: **both** phases add one name (phase 1 `locateNinaAvatar`, phase 2 `setNinaAvatarSearchKeywordsAndEmbedding`) and **both** state the growth as "92 → 93". Applying both as written leaves the list wrong and one phase red. Worse, **the baseline is wrong**: the list holds **94** entries on `751e034` (counted), not 92 — both planners read the file header's stale "85 → 92" prose instead of the array. | Both phase plans rewritten to state **one name each, no total asserted**: whichever lands first takes it 94 → 95, the second 95 → 96; count the array when you edit it. Both header-comment edits changed from *replace* to *append*, leaving the historical `admin-album-semantic-search` sentence byte-identical, and each now names the other phase's name so the second arrival is expected. Conflict rule stated in both: **keep both names, sorted.** |
| 4 | File collision | `components/admin/FileExplorer.test.tsx`: phase 1 edits the `PhotoSearchBar` mock (`:96-98`), `baseProps` (`:176-187`) and appends a `describe`; phase 2 adds `searchKeywords: null` to the album-photo helper (`:167`). | Disjoint regions, both additive, no quoted state invalidated — phase 1's new deep-link cases build rows through the very helper phase 2 widens and inherit the field for free. Co-edit notes added to both Files tables and both Handoffs; resolution rule **keep both sides**. |
| 5 | File collision | `package.json` `scripts` block: phase 2 adds `nina:backfill-embeddings`, phase 3 adds `nina:search-analysis`. Phase 3 flagged it; **phase 2 did not mention phase 3 at all** (one-sided handoff). | Verified both are stated as independent, order-insensitive single lines and neither is a diff assuming the other's absence. Phase 3's step reworded so its `:37` anchor is explicitly *not* load-bearing. Phase 2's Step 16 and Files table gained the reciprocal ⚠ note and the same **keep both lines** rule. |
| 6 | Contract drift (index vs. plan) | Index invariant **2b** read *"Re-describe … must never **read**, clear, or overwrite `searchKeywords`"*. Phase 2's Step 9b **does** read `row.searchKeywords`, and must — see Decisions row 1. Left as drafted, a phase-2 session meets an invariant that forbids its own step. | Invariant 2b rewritten: *may read, and must; never clear or overwrite.* Phase 2 gained a **D2b** decision block recording the correction. Phase 2's steps unchanged — the index was the side that was wrong. |
| 7 | Contract drift (brief vs. shipped code) | Phase 1's brief and the draft index's framing implied a **suffix** id lookup for R3; phase 3 independently implemented a **substring** match and flagged the correction. | Phase 3 is right, and re-verified from source at reconciliation: the viewer header renders the **full** id, `_` really is the last symbol of `lib/id.ts`'s alphabet (so `LIKE` is a live bug), and the analysis says "suffix/substring", never suffix-only. Index **Scope**, **Decisions** and the phase-3 exit criteria rewritten to say substring-via-`strpos`; phase 3's D1 marked RATIFIED with the three checks. Phase 1's plan says "suffix" nowhere — nothing to fix there. Nothing downstream now says suffix-only. |
| 8 | Contract drift (index counts) | Index phase table: file counts 7 / 12 / 2 against the plans' actual 12 / 26 / 3; phase 2's **Does not touch** listed `app/admin/nina/page.tsx` (contradicting its own Step 12); phase 1's **Owns** omitted `lib/admin/albumDeepLink.ts` and the frozen-list file; phase 3's omitted `package.json`. | Phase table, all three **Owns** / **Does not touch** / **Exit criteria** blocks rewritten against the plans as reconciled. Phase 2's difficulty raised NORMAL → HARD for its reconciled scope. |
| 9 | Gap (invariants) | Phase 2 flagged the migration-number collision risk in its own step; the index's **Invariants** and **Rollback** carried it only implicitly (Rollback mentioned additive-only, nothing said regenerate-never-rename, and nothing said this repo has one database). | Added index invariants **7** (generate, never hand-number; check `origin/main` first; regenerate never rename; verify by `ci:schema-drift-guard`, never by the journal) and **8** (one database — `db:migrate` and the backfill write production; additive-only is what makes migrate-before-deploy correct; no `DROP COLUMN`). Rollback's phase-2 entry extended to match. |

**Verified after the edits:** dependencies point backward only (1 ⟂ 2 concurrent, 3 → 2); no symbol
is deleted anywhere in the set (all three phases declare `Deletes: nothing`), so there is no
deleted-then-used class to check; every impact point 1-17 in the analysis has exactly one owning
phase; every `R` has exactly one owning phase; each phase compiles on its own — phase 1 adds only
optional interface members plus one required prop with two call sites it owns, phase 2 ships column
+ type + construction site + both `embedNinaAvatarDescription` call sites in one commit, and phase 3
adds no TypeScript at all.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| R1's "part-of-image-id" display format | No new display format — `751e034` already renders the full id + score in the viewer header; R1 only adds navigation from it | 1: this analysis's Correction 1, confirmed against `origin/main` |
| How R3 sees ranks the app's own search can't return (>48 rows, <0.2 score) | A new script mirrors `scripts/album-search-probe.mjs`'s raw-SQL, unfiltered pattern rather than calling `searchNinaAvatarsByText` (whose `clampLimit`/`NINA_SEARCH_MIN_SCORE` make that structurally impossible) | 1: this analysis's Correction 1 / Key Considerations |
| Where R2's embedding-combine logic lives | Inside `embedNinaAvatarDescription` (the single measured choke point), not duplicated at each call site | 1: this analysis's Correction 3 |
| Phase boundary between R1 and R2 | Fully disjoint file sets (verified in exploration — R1 never touches `PhotoDescription.tsx`/`SelectionPane.tsx`'s description wiring beyond what's stated), so phases 1 and 2 have no `depends_on` edge and may run concurrently | 1: this analysis's Impact Points |

Settled at reconciliation (round 1) — each of these was a fork between two behaviours that the
phase plans, or a plan and this index, disagreed about. Executors read these instead of asking.

| Fork | Chosen | Rung |
|---|---|---|
| Does `describeNinaAvatarAction` **read** `searchKeywords`? Invariant 2b said "never read"; phase 2 Step 9b reads it and passes it to the embedder. | **It reads them, and must.** It still never writes them — structurally, because `setNinaAvatarDescriptionAndEmbedding` sets two columns and this is not one of them. Invariant 2b was reworded; phase 2's steps are unchanged, and it gained a **D2b** block recording why. | **A stated invariant, against another stated invariant** — resolved on the higher one: invariant 2 requires the vector to be recomputed from everything that should be embedded, and R2 is "keywords feed search relevance". A re-describe that did not read them would write a vector that silently drops the tags, undoing R2 for that row on every vision pass. "Never read" was drafting slippage for "never write". |
| Suffix vs. substring id lookup for R3 | **Substring**, `strpos(id, $1) > 0` — it subsumes prefix, suffix and interior, and zero/ambiguous matches are both refused (exit 3 / exit 4) rather than guessed, which is what makes the widening safe. | **The surrounding code, re-verified at reconciliation:** `SearchResultsGrid.tsx` renders `` `#${hit.id} · …` `` — the full 12-char id, untruncated — so the operator pastes a *prefix* and a suffix-only lookup returns zero rows for the requirement's own worked example (`#Rm2NG..`, where `..` is the user's own elision). The analysis document agrees in as many words ("suffix/substring lookup is kept"). |
| `strpos` vs. `LIKE '%' \|\| $1` for that lookup | **`strpos`.** | **The surrounding code:** `lib/id.ts:11`'s alphabet ends `…-_`, so **`_` is both a legal id character and `LIKE`'s single-character wildcard** — `id LIKE '%a_c'` matches `abc` and `axc` as well as `a_c`, which would make the ambiguity guard refuse a fragment that names one row, or silently pick the wrong one. `strpos` has no metacharacters. (`LIKE … ESCAPE` would also work; two more moving parts for the same answer.) |
| Which phase writes `app/admin/nina/page.tsx:241` | **Phase 2.** | **Build-green (resolution rule 1).** The phases are concurrent; a phase-1 commit carrying that line would not compile, because the column and the type it depends on are both phase 2's. |
| Who owns the `BARREL_VALUE_EXPORTS` growth when both phases add a name | **Both, one name each, neither asserting a total.** | **The surrounding code:** the array holds 94 entries, counted at `751e034`; the file header's "85 → 92" is stale prose. A plan that hard-codes a total makes the second phase to land wrong by construction. |

## Open Questions

_(empty — and that is the normal outcome, not luck. Every fork above was decidable from the shipped
code, the analysis, or one invariant standing over another. No `R` is unowned: R1 → 1, R2 → 2,
R3 → 3. Nothing in this set is irreversible-either-way: the only production write is one additive
nullable column plus an idempotent re-embed that reproduces identical vectors for untagged rows.)_

## Rollback

- **Phase 1:** revert the commit. No schema or data change, so a plain `git revert` is complete. A
  stale `/admin/nina?avatar=<id>` link minted before the revert reads as an unknown parameter and is
  ignored — the correct degradation.
- **Phase 2 — code:** `git revert`. The reverted tree embeds `description` alone exactly as today.
- **Phase 2 — schema: do NOT drop the column.** The migration is additive and nullable, so reverted
  code simply stops projecting it and the column sits inert. A `DROP COLUMN` applies *after* the
  deploy and would break the still-running old deployment (invariant 8); if the column is genuinely
  unwanted, drop it in a separate, later migration once the reverting deploy is live.
- **Phase 2 — the migration file itself.** Generated, never hand-numbered (invariant 7). If
  `origin/main` took the next number while this branch was in flight, **regenerate from the merged
  schema — never rename**: a renamed migration is skipped silently and strands itself below the
  ledger watermark permanently. Verify by effect (`npm run ci:schema-drift-guard` after
  `npm run db:migrate`), never by reading `drizzle/meta/_journal.json`.
- **Phase 2 — vectors:** the backfill is idempotent (re-derives from current column state) and safe
  to re-run or to leave un-run. Rows never tagged get a vector numerically identical to the
  pre-backfill one, so a revert leaves ranking where it was. Rows that *were* tagged carry a vector
  for the combined text; after a revert that is the old behaviour plus the keyword words — harmless,
  and correctable by clearing the column or re-running the describe sweep.
- **Phase 3:** `git rm -r .claude/skills/search-analysis`, `git rm scripts/search-analysis.mjs`,
  revert the one `package.json` line. Nothing imports either file, nothing tests them, and the
  script never wrote a byte to the database or the blob store — no data to undo, and phase 2's
  `lib/nina/avatarEmbedText.ts` keeps its other two consumers.

## Next

Execute the phases one at a time. Phases 1 and 2 are independent and may run in either order;
phase 3 needs phase 2 landed **and its migration applied**:

    /implement -f NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md
