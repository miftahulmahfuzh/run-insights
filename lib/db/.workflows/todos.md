# Todos: db

**Package Path**: `lib/db`
**Package Code**: DB
**Last Updated**: 2026-09-10
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 5

---

## Active Tasks

### [P1] High


- [ ] **P1-DB-A002** Phase 2: The carrier marker: a photo bubble free text cannot hide
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: The schema half, shippable and behaviour-neutral on its own — **no caption text changes in this phase at all**. Spans four packages and is filed here because the generated migration is its irreversible half: `lib/db` (a generated migration adding `nina_messages.photo_only boolean NOT NULL DEFAULT false` plus a backfill of the rows that are carriers under today's rule, and `lib/db/schema.ts` carrying the column with the argument for it beside the `source` docstring explaining why it is not a sixth `NinaMessageSource`); `lib/nina` (`queries.ts` — `NinaMessageInsert.photoOnly`, `messageColumns`/`NinaMessageRow`; `imagerun.ts` — `finishSelfie` sets `photoOnly: true`); `lib/admin` (`chatPhotos.ts` — `isNinaPhotoCarrierMessage` reads the marker, with the caption-array test kept as the **legacy** clause for pre-migration rows; `chatPhotoActions.ts` — `addChatPhotoAction` sets `photoOnly: true`); and `scripts` (`nina-image-worker.ts`'s raw `INSERT` sets `photo_only = true`). Plus `tests/admin.chatPhotos.test.ts`. Does not touch `lib/nina/imagefail.ts`, `caption.ts`, `vision.ts` or `prompts/*`. Exit: `npm run db:generate` produced the migration (not hand-written); `npm run db:check` passes; `isNinaPhotoCarrierMessage` returns `true` for a marked message with any text whatsoever, `true` for an unmarked legacy message whose text is one of the five, and `false` for a `role: 'runner'` message however marked; remove still deletes the message when the last photo goes, for a message carrying free text. **Merge hazard:** `nina-job-redo-and-soft-delete` is in flight from the same base `f839116` and both sets mint `0008` — whoever merges second deletes this branch's `0008_*.sql` and re-runs `db:generate` against the merged `schema.ts`. Never rename a migration; `when` is the ordering key and a renamed entry is skipped silently.
  - **Status**: pending
  - **Plan Set**: `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R1 — A photo added to the Chat photos collection must arrive with a chat message that says something true about **that** photograph; R2 — "can we make llm understand multi modal?" — every path that posts a photo of hers captions it from what is in the picture, not only the admin one
  - **Plan**: `.workflows/plan/P1-DB-A002.md`

---

## Completed Tasks

### [P1] High

- [x] **P1-DB-A006** Phase 1: Foundation: content_hash kolom, util hash, plumbing data
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns: migrasi 0018 (kolom `content_hash text` nullable + partial index `(user_id, content_hash) WHERE content_hash IS NOT NULL` di `nina_message_images`); modul murni BARU `lib/photos/contentHash.ts` (WebCrypto sha-256 → hex); `NinaImageInsert` + `insertNinaMessageImages` menerima `contentHash` opsional (pass-through); lookup baru `findNinaImageByContentHash(userId, hash)` di `lib/nina/queries.ts`; pass-through kolom di raw-SQL insert `scripts/nina-image-worker.ts` (+ shape test). Tanpa perubahan perilaku. Exit: migrasi apply bersih (additif), `db:check` hijau, util hash teruji unit, insert menerima & mengabaikan hash tanpa pemanggil baru, worker menulis kolom bila diberi.
  - **Status**: completed
  - **Plan Set**: `MEDIA_DEDUPE_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R1 — Satu mekanisme agar semua foto di Media unik (write-time + backfill yang sudah ada).
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A006.md`
  - **Completed**: 2026-09-10 12:12
  - **Method**: /do
  - **Files**: lib/db/schema.ts, drizzle/0018_real_madame_web.sql, drizzle/meta/0018_snapshot.json, drizzle/meta/_journal.json, lib/photos/contentHash.ts, lib/photos/contentHash.test.ts, lib/nina/queries.ts, scripts/nina-image-worker.ts, tests/nina.photoRefs.test.ts, tests/nina.imageworker.test.ts, tests/db.schema.nina.test.ts
  - **Drift**:
    - Plan's contentHash.ts body did not typecheck under this repo's TS + @types/node (TS2345 BufferSource strictness on the digest arg; TS2322 Blob not eliminated in the instanceof false branch) → replaced with an `isBlob` type-predicate + one compile-time-only `as BufferSource` assertion at the digest call. Runtime semantics byte-identical; contract (zero imports, view-not-buffer, lowercase hex) unchanged.
    - Plan quoted the photoRefs insert describe as ending at :192; in the current tree it ends at :171 (plan's line numbers slightly stale). Text anchors used; no semantic change.
    - tests/db.schema.nina.test.ts is not in the plan's Files table, but its absence-guard ('adds no index for them — adding one is a decision somebody makes on purpose') trips on the plan-mandated partial index. Expectation extended to the three-index list with a comment naming media-dedupe P1 and where the decision is documented (schema column header).
  - **Decided**:
    - Plan's contentHash.ts code block vs this repo's TS lib types → type-predicate + compile-time assertion, runtime unchanged (rung 1: invariant 1 tree-green outranks rung 3 code block on a mechanical typing detail)
    - Schema-guard expectation of exactly 2 indexes on nina_message_images → extended to 3 with the plan-mandated `nina_message_images_user_content_hash_idx` (guard's stated purpose is to force the addition to be written down; the plan + schema header write it in full; not a relaxed check)
    - db:migrate applied to PRODUCTION per the plan's explicit direction (additive: nullable column + partial index over 23 rows) and verified by an information_schema/pg_indexes catalog query rather than by migrate's output wording

- [x] **P1-DB-A004** Phase 1: The table and the matcher
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema.ts`'s new `ninaShortcuts` `pgTable` placed beside `ninaMemoryFacts` (`schema.ts:1306`) with its two indexes (`nina_shortcuts_user_match_unq` on `(user_id, match_key)`, `nina_shortcuts_user_enabled_idx` on `(user_id, enabled)`), its inferred types and its `relations` entry; the generated migration pair under `drizzle/` and `drizzle/meta/`; a new **zero-import** `lib/nina/shortcuts.ts` — the bounds (`NINA_TRIGGER_MAX` 16, `NINA_SHORTCUT_LABEL_MAX` 80, `NINA_SHORTCUT_EXPANSION_MAX` 2000, `NINA_SHORTCUT_MAX_FIRED` 4, `NINA_SHORTCUT_LOOKBACK` 6, `NINA_SHORTCUT_BLOCK_MAX_CHARS` 5000) plus `normalizeNinaTrigger`, `classifyNinaTrigger`, `matchNinaShortcuts` and `renderNinaShortcutBlock` (which returns `null` only when BOTH `fired` and `inPlay` are empty); five statements in `lib/nina/queries.ts` (`listNinaShortcuts`, `insertNinaShortcut` — a duplicate **THROWS** 23505, `updateNinaShortcut`, `deleteNinaShortcut`, `bumpNinaShortcutUses`), with `match_key` and `kind` derived INSIDE the query layer by one private `derivedTrigger` so the input types have nowhere for a caller to mislabel a row; a new `lib/nina/shortcuts.test.ts`; and `tests/db.schema.nina.test.ts`. Eight files, the three generated `drizzle/` artefacts included — committed together or not at all. Does not touch `turn.ts`, `actions.ts`, any prompt file, `lib/admin/`, `components/`, `app/` or `scripts/`. This phase fixes the contract phases 2, 3 and 4 build against. Exit: `npm run db:generate` has produced a migration; `npm run db:check` passes; the matcher's test drives every real production trigger as a fixture plus the `✌️`/`✌` variation-selector pair, `yummy`, `Plak!`, `nomnom`, a disabled row, an empty message and a null message; `npm test` green. **No count is asserted anywhere.** Migration hazard: `drizzle/` ends at `0010_nina_image_provenance.sql` with three peer worktrees live — if `main` has moved, delete the generated `.sql` and its `drizzle/meta/*_snapshot.json`, `git checkout drizzle/meta/_journal.json`, rebase and regenerate. Never rename a migration: `drizzle-kit migrate` keys on the journal tag and a renamed file is skipped in silence.
  - **Status**: completed
  - **Plan Set**: `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R1 — An explicit shortcuts mechanism, separate from memory: an admin surface to add, edit, disable and remove shortcuts, each standing for a situation or for something Miftah and Nina were doing; R2 — Typing a single emoji character in the chat makes Nina understand the whole long context that emoji stands for; R3 — The shortcut-shaped rows already in the production memory ledger carry over into the new mechanism instead of being retyped
  - **Plan**: `.workflows/plan/P1-DB-A004.md`
  - **Completed**: 2026-09-07 22:28
  - **Method**: /do (swarm phase 1 of 4)
  - **Files**: lib/db/schema.ts, lib/nina/shortcuts.ts, lib/nina/shortcuts.test.ts, lib/nina/queries.ts, tests/db.schema.nina.test.ts, drizzle/0012_nina_shortcuts.sql, drizzle/meta/0012_snapshot.json, drizzle/meta/_journal.json
  - **Drift**:
    - `origin/main` moved from the plan's base `a92780f` to `5ed3b76` (6 commits) and had ALREADY minted `0011_rare_blockbuster`. Applied the phase plan's Step 2 migration-hazard recipe: rebased onto `origin/main`, then generated. The migration is **`0012_nina_shortcuts`, not `0011`**. Branch history rewritten `d792c86` -> `3f0bbd8` (that one commit is plan files only; the rebase was conflict-free). Phases 2-4 were unspawned, so no peer was sitting on the branch.
    - task-135 (`b27a033`, "remove confidence from the memory pipeline entirely") landed on `origin/main` and shifted every line anchor the plan quotes in `lib/db/schema.ts` and `lib/nina/queries.ts` — `NinaFactInsert` lost its `confidence?: number` field. All six code insertions were therefore re-applied by **content** anchor rather than line number; every inserted byte is still the plan's code block verbatim, extracted programmatically from `phase-1.md`.
    - The local `main` ref in this repo is **STALE and divergent** (`8f1a10d`, diverged at `f03a3bc`, does not even contain the plan's own base `a92780f`; its `drizzle/` stops at `0008`). `origin/main` @ `5ed3b76` is the real trunk — the merge at the end of this set must target `origin/main`, not local `main`.
    - Minor: the plan's shapes-insert anchor said `NinaFactInsert` closes at `:305` and `NinaNagRow` opens at `:307`; the real offsets were 304/306 even before the rebase. One blank line, no semantic effect.
    - prettier re-wrapped 3 statements in `lib/nina/shortcuts.test.ts` (cosmetic line-wrapping only). Fixed by pathspec: `npx prettier --write lib/nina/shortcuts.test.ts` — deliberately not a repo-wide `npm run format`, which would have swept 11 unrelated pre-existing violations into this commit.
  - **Decided**:
    - `normalizeNinaTrigger`'s docstring claimed phase 4's importer "reimplements these rules in plain JS" -> corrected to say it **imports this very function** under `--experimental-strip-types`, with `tests/nina.shortcutsImport.test.ts` asserting function identity. (Rung 1, a stated invariant: invariant 4 says phase 4 imports the module directly, inherited decision D5 says the same, and the file's own header already contradicted the docstring.)
    - `origin/main` had moved and `0011` was already taken -> **rebase onto `origin/main` and generate as `0012`** rather than mint a colliding `0011`. (Rung 3: the phase plan's Step 2 MIGRATION HAZARD block names this exact condition and prescribes rebase-then-regenerate, never rename.)
    - `db:generate` auto-named the file `0012_narrow_vivisector.sql` -> deleted the `.sql` + snapshot, `git checkout`'d `_journal.json`, and regenerated with `--name nina_shortcuts` to match the plan's Files table (`00NN_nina_shortcuts.sql`) and the `0009`/`0010` convention. (Rung 3: the plan's Files table.) Verified the regenerated SQL is byte-identical to the auto-named one, so no generated content was lost — and byte-identical to the SQL the plan's Interface Contract predicted.
- [x] **P1-DB-A005** Phase 1: `nina_image_prefs` — the row, the vocabulary, the reads
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns the `ninaImagePrefs` table in `lib/db/schema.ts` and its generated migration; a new zero-import `lib/nina/imageprefs.ts` holding the focus-key vocabulary, the prompt-length scale, the free-text bounds, `NINA_IMAGE_PREFS_DEFAULTS`, the coercers and `NinaImagePrefs`; `readNinaImagePrefs` / `writeNinaImagePrefs` / `listNinaPhotoReferences` / `resolveNinaPhotoReference` in `lib/nina/queries.ts`; the union read that feeds the picker (album rows + **original** `kind='generated'` chat rows, one bounded page, newest first); a data step that copies each existing `nina_tuning.wardrobe` into the new row, hand-appended after `db:generate`; `tests/nina.imageprefs.test.ts` and the `tests/db.schema.nina.test.ts` additions. **This phase's vocabulary is the authority for the whole set** — `NINA_IMAGE_PROMPT_LENGTH_*`, `NINA_PROMPT_LENGTH_RUNGS` / `ninaPromptLengthRungFor`, focus keys `face|skin|boobs|butt|thighs|calves`, `NINA_IMAGE_REFERENCE_SOURCES`, and `NinaImageReference { source, id }` with `''` as the empty id. Does not touch: `nina_tuning` (not one column, not one test — phase 7 owns its retirement); `lib/nina/imagegen.ts`; `lib/nina/persona.ts`; anything under `app/`, `components/` or `lib/admin/`. Exit criteria: `npm run db:generate` produces exactly one new `drizzle/0011_*.sql` (the watermark is `0010` after the `origin/main` merge), it is **not** renamed, and the hand-written backfill is appended **after** the generator ran, under the same banner comment `0009_nina_message_photo_only.sql` and `0010_nina_image_provenance.sql` both carry; `npm run db:migrate` applies it against the dev database; `readNinaImagePrefs` on a user with no row returns `NINA_IMAGE_PREFS_DEFAULTS` with `revision: 0`; `writeNinaTuning` is untouched and every existing test still passes; `lib/nina/imageprefs.ts` has an empty import list; **the picker union contains no reference row and therefore no duplicate photograph (invariant 13), proved by a source-level assertion that the chat side calls `generatedChatPhotoScope` rather than spelling a `kind` comparison itself.**
  - **Status**: completed
  - **Plan Set**: `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 1 of 7)
  - **Satisfies**: R4 — Prompt-length slider: longer ⇒ more detailed prompt; R5 — "Focus on" multi-select; R6 — Wardrobe (free text); R7 — Venue (free text); R8 — Time (free text); R9 — Notes (free text); R10 — Photo reference grid over Nina's album and Chat photos (storage only)
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A005.md`
  - **Completed**: 2026-09-07 22:33
  - **Method**: /do (swarm phase 1 of 7)
  - **Files**: lib/nina/imageprefs.ts, lib/db/schema.ts, lib/nina/queries.ts, drizzle/0011_natural_nico_minoru.sql, drizzle/meta/0011_snapshot.json, drizzle/meta/_journal.json, tests/nina.imageprefs.test.ts, tests/db.schema.nina.test.ts
  - **Verified**: `npm run db:generate` produced exactly one new migration, `drizzle/0011_natural_nico_minoru.sql`, not renamed, its DDL matching the plan's predicted block byte-for-byte; the hand-written wardrobe backfill was appended AFTER generation under the `0009`/`0010` banner discipline. `npm run db:check` "Everything's fine"; `npm run db:migrate` applied; `npm run typecheck` clean; `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched); `prettier --check` clean on all phase-1 files; `npm test` 154 files / 3126 tests passing; `ci:data-layer-guard`, `ci:openrouter-guard`, `ci:llm-payload-guard` all pass. Live DB: `nina_image_prefs` has 16 columns, PK only (no extra index), no CHECK, FK to `user` with ON DELETE cascade; the one `nina_tuning` row with a non-empty wardrobe produced exactly one prefs row carrying "long pants" with `prompt_length` 50, `reference_source` 'none', `revision` 1. Runtime smoke: `readNinaImagePrefs` on a user with no row returns `NINA_IMAGE_PREFS_DEFAULTS` by object identity with `revision: 0`; `listNinaPhotoReferences` returns 21 rows / total 21, newest-first, all keys and all blob URLs unique (invariant 13 holds on real data - 21 album rows, zero chat images); `resolveNinaPhotoReference` round-trips a real tile and returns `null` for a dangling id and for 'none'. `git diff --numstat` confirms `schema.ts`, `queries.ts` and `tests/db.schema.nina.test.ts` are purely additive (0 deleted lines) and that `writeNinaTuning`/`readNinaTuning`/`tuningFromRow`/`tuningToColumns` are byte-identical to HEAD (exit criterion 6).
  - **Drift**:
    - Plan prose says the table has "fifteen columns"; the declaration and the plan's own predicted DDL both have sixteen (the fifteen contract columns plus `updated_at`, which the table header explicitly calls "not part of the contract"). The generated DDL matched the plan's code block byte-for-byte, so this is a prose miscount, not drift in the code.
    - Plan Step 5 prose promises nine `describe` blocks but its code block contained eight; the missing one is the invariant-13 source assertion, whose exact code exit criterion 7 supplies. Added it (see Decided).
    - The plan's exit-criterion-7 snippet references an undefined constant `QUERIES`; the test file's own helper is `readSource(relative)`. Substituted `readSource('lib/nina/queries.ts')` and left all three assertions byte-identical.
  - **Decided**:
    - Step 3's task creation was scoped to phase 1 alone rather than all seven phases - a concurrent set (`nina-emoji-shortcuts`) has a live phase-1 session minting from the same package counters (rung 6, plus the sibling set's recorded precedent).
    - The TaskID was **not** written back into the tracked orchestration `PLAN.md` - it is a git-tracked file in the primary checkout shared by all seven sessions of this set; reported over the swarm ledger instead (rung 6).
    - Added the invariant-13 source assertion that Step 5's code block omitted - rung 1 (plan invariant 13) and rung 2 (phase 1 exit criterion 7, which supplies the code verbatim) both outrank the code block's omission.
    - Exit criterion 3's write half was verified by source inspection of the upsert's SQL-side `revision + 1` rather than by executing a write - tie-break: reversible option / narrower blast radius, since the dev database holds the operator's only real prefs row and peers 2-7 are about to run against it.
    - The 12 repo-wide prettier warnings were left alone - none are this phase's files, and a repo-wide format would sweep files phases 2-7 own and buy merge conflicts (rung 6).
    - At completion, the shared plan index `NINA_IMAGE_GENERATION_TAB_PLAN.md` was **not** ticked - it is a root-level tracked file outside this phase's owned-file list, shared by all seven sessions of the set; ticking it here would leave a stray modification a peer's pathspec commit cannot sweep. Reported to the coordinator instead, on the same rung-6 reasoning as the TaskID decision above.

- [x] **P1-DB-A003** Phase 1: A re-attached photo is a reference, not a copy
  - **Difficulty**: HARD
  - **Type**: Bug
  - **Context**: Owns `ninaMessageImages`'s two new provenance columns (`source_avatar_id` -> `nina_avatars(id)`, `source_image_id` -> `nina_message_images(id)`, both nullable, `ON DELETE SET NULL`) and `drizzle/0010_*` (generated `ALTER TABLE` plus a hand-written backfill, on `0009`'s precedent); `imageColumns`; `NinaImageInsert`; `insertNinaMessageImages`; `resolveAttachment`'s return type and the attach INSERT in `sendNinaMessage`; the reference filter in `listNinaMessageImages`, `generatedChatPhotoScope` and `countNinaChatPhotos`. Does not touch any message read used to render a bubble (invariant 2), `components/nina/`, `lib/admin/chatPhotoActions.ts`, `components/admin/ChatPhotoDetail.tsx`, `components/admin/chatPhotoModel.ts`, `app/admin/photos/page.tsx` (all phase 2's, per D8), or anything in phases 3 and 4. Exit: attaching an album face or re-attaching a chat photo leaves `countNinaChatPhotos` unchanged and adds nothing to `galleryPhotos`'s input, while the photo still renders in the bubble and its description still reaches the turn; the backfill marks production's existing duplicates; `npm run db:generate` produces exactly one new file and the meta journal matches it. Hazard D12: `drizzle/0010` is also claimed by the concurrent `nina-image-generation-tab` set - keep `0010`, and whichever set lands second REGENERATES rather than renames (a renamed migration keeps the old `when`, drops below the applied watermark and is skipped in silence), then diffs the discarded file against the new one and re-applies the hand-written backfill by hand.
  - **Status**: completed
  - **Plan Set**: `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 1 of 4)
  - **Satisfies**: R1 — a re-attached photo must not appear as a duplicate in admin Chat photos; R3 — a photo attached from Nina's profile-picture album must not be added to Media
  - **Plan**: `.workflows/plan/P1-DB-A003.md`
  - **Card**: `miftahulmahfuzh/run-insights#129`
  - **Completed**: 2026-09-07 17:59
  - **Method**: /do (swarm phase 1 of 4)
  - **Files**: lib/db/schema.ts, drizzle/0010_nina_image_provenance.sql, drizzle/meta/0010_snapshot.json, drizzle/meta/_journal.json, lib/nina/attach.ts, lib/nina/queries.ts, lib/nina/actions.ts, tests/nina.photoRefs.test.ts, tests/nina.attach.test.ts, tests/db.schema.nina.test.ts
  - **Notes**: Migration `0010` generated first, then a two-statement hand-written backfill appended below a `--> statement-breakpoint` (on `0009_nina_message_photo_only`'s precedent) to mark production's existing duplicates. `npm run db:check` reports "Everything's fine". `ON DELETE SET NULL` on both FKs is deliberate: when the original is deleted the copy stops being a copy and the collection keeps the picture rather than losing it. `ninaPhotoProvenance()` flattens, so a copy of a copy points at the *original* and deleting the middle row cannot resurrect a duplicate. The reference filter `isOriginalPhoto()` has **two call sites covering three reads** — the WHERE of `listNinaMessageImages` and the `and(...)` of `generatedChatPhotoScope`, which `listNinaChatPhotos` and `countNinaChatPhotos` both inherit and which are therefore not edited. `tests/nina.photoRefs.test.ts` asserts against generated SQL that the four bubble/context/reaper reads (`getNinaMessageImagesForMessages`, `getNinaMessageImage`, the gateway reads, `isBlobPathnameReferenced`) do **not** carry the filter — an absence assertion, because a later "consistency" cleanup adding it there would blank a photograph inside a live conversation. Verified: `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched), `npm run typecheck` clean, `npx vitest run` 152 files / 3057 tests passing, `npm run db:check` clean, all phase-1 paths `prettier --check` clean. Production read-only counts taken before any migrate: 0 chat-to-chat duplicates, **2** album faces attached into chat, 5 rows in the collection, 21 album rows — the 2 are exactly the duplicates reported in prod admin.
  - **Decided**:
    - Step 3's task creation was limited to phase 1 alone: peers p2/p3 were live and minting from the same package counters would collide silently.
    - The TaskID was **not** written back into the tracked orchestration `PLAN.md` — it is reported to the coordinator over the swarm ledger instead, because that index is shared by three concurrent sessions and read-modify-write from all three stalls one.
    - `lib/nina/queries.ts` carries phase 1's ten hunks only; phase 2's `updateNinaChatPhotoDescription` in the same file is phase 2's to commit. Per-phase revert is a published property of this plan set's Rollback section.
    - The plan's pre-migrate abort gate ("stop if the R3 count is anywhere near the collection total") was assessed and **not** tripped: 2 of 5 looks like a large fraction only because the table is tiny, the gate's stated failure mode is a *bulk* `blob_url` collision, and 0 chat-to-chat duplicates contradicts that reading. The 2 rows are precisely the defect the user reported.
    - `npm run db:migrate` was deliberately **not** run. Applying a migration with an irreversible hand-written backfill to production is outside what implementing a phase authorises, and the plan files those checks under "Manual check".


- [x] **P1-DB-A001** Phase 1: Session data layer: schema, migration, backfill, scoped queries
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `lib/db/schema.ts` (the new `ninaChatSessions` table, `nina_messages.session_id` and the indexes both need); `drizzle/0004_*.sql` plus `drizzle/meta/`; `lib/nina/queries.ts` §4, where every message read and write gains a session parameter alongside session CRUD and the list query; and a new pure `lib/nina/sessions.ts` for the ordering and title-fallback rules with tests — including `NINA_SESSION_TITLE_MAX_CHARS = 60`, the set's one and only title cap, the `sessionTitleFor` fallback phase 5 renders rather than `session.title`, and `pinnedAt: Date | null` as an instant rather than a boolean. `session_id` is `NOT NULL` (D1) with `ON DELETE CASCADE` (R11), the sort key is derived at read time with no stored column (D3), and pins partition rather than sort (D4). Signatures widen with a defaulted or optional session parameter so the tree still compiles and existing callers keep working; phase 3 then makes them required. The backfill is the risk and is not optional: every existing row must end up in exactly one session per user, in `seq` order, under a deterministic placeholder title rather than an LLM call from a migration. Exit criteria: `npm run db:check` passes; the migration applies to a copy of production and `SELECT count(*) FROM nina_messages WHERE session_id IS NULL` is 0; `listNinaSessions` returns pinned-first then most-recent-user-message-descending, asserted by a unit test on the pure ordering rule; deleting a session row leaves no orphaned `nina_messages` and no orphaned `nina_message_images` (R11); the existing suite is green with no caller changed.
  - **Status**: completed
  - **Plan Set**: `NINA_CHAT_SESSIONS_PLAN.md` (phase 1 of 9)
  - **Satisfies**: R2, R4, R5, R11 — R2: Chat sessions: create a new one, or return to a previous conversation through a session-history list; R4: Pin sessions to the top; R5: Sort sessions by the most recent **user** message, newest first; R11: Remove a session
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A001.md`
  - **Card**: `miftahulmahfuzh/run-insights#78`
  - **Completed**: 2026-09-05 03:26
  - **Method**: /implement (swarm phase 1 of 9)
  - **Commit**: `7a89066`
  - **Files**: lib/db/schema.ts, lib/nina/queries.ts, lib/nina/sessions.ts, lib/nina/sessions.test.ts, tests/db.schema.nina.test.ts, drizzle/0004_nina_chat_sessions.sql, drizzle/meta/0004_snapshot.json, drizzle/meta/_journal.json
  - **Notes**: Migration `0004` generated then hand-edited where generation cannot help — drizzle emits `ADD COLUMN ... NOT NULL`, which fails on a populated table, so the file adds the column nullable, backfills one session per user (`substr(md5(user_id),1,12)`, `created_at = min(sent_at)`, title `'Semua chat sebelumnya'`, `title_source = 'backfill'`), then `SET NOT NULL`. No `ON CONFLICT DO NOTHING` on that insert, deliberately: on an md5-prefix collision it would file the second user's messages into the first user's session. **Verified against a throwaway Postgres 16** (0000-0003 applied, three users — one with no messages — interleaved roles, image rows, a memory fact, a cross-session quote): 0 NULL `session_id`, one session per user with messages, no cross-user filing, cascade left 0 orphaned `nina_messages`/`nina_message_images`, the cross-session quote survived with `reply_to_id` NULL, the `nina_memory_facts` row survived with a deliberately dangling `source_message_id`, `Index Only Scan` on `nina_messages_user_session_runner_idx` and `Index Scan Backward` on `nina_messages_session_seq_idx`, and a session-less INSERT is rejected. **Not applied to production — that is a deploy action** and remains open. `lib/nina/queries.ts` is shared with phases 3 and 7 (§4c is a named seam for phase 7's `updateNinaMessage`/`deleteNinaMessage`); three plan-verbatim lines were reflowed by Prettier (cosmetic).


- [x] **P1-DB-A000** Phase 1: Folder metadata on `nina_avatars`, and the folder-aware data layer
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns five new columns on `ninaAvatars` (`folder`, `filename`, `source_key`, `thumb_url`, `thumb_pathname`) plus `nina_avatars_user_folder_created_idx` and the UNIQUE `nina_avatars_user_source_key_unq`; the new `nina_folders` table; `drizzle/0003_nina_avatar_folders.sql` and its meta snapshot/journal; nine statements in `lib/nina/queries.ts` (folder-scoped page, subtree manifest, distinct-folder listing, album count, plain batch insert, bulk move/rename/recursive-delete/bulk-delete) plus `declareNinaFolders`/`renameNinaFolderSubtree`/`deleteNinaFolderSubtree`; the thumbnail cap/pathname builder/predicate in `lib/admin/avatars.ts`; the three new caps in `lib/nina/album.ts`; and `app/admin/page.tsx` switching to `countNinaAvatars`. Exit criteria: `npm run db:generate` produces exactly one additive migration; `db:check`, `typecheck`, `test` green; `is_current` has exactly three writers in `lib/nina/queries.ts`; `/admin/nina` renders exactly as today; `/admin`'s album card renders the same sentence from a `count(*)`.
  - **Status**: completed
  - **Plan Set**: `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (phase 1 of 7)
  - **Satisfies**: R1 — `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P1-DB-A000.md`
  - **Card**: `#66`
  - **Completed**: 2026-09-04 16:46
  - **Method**: /do
  - **Files**: lib/db/schema.ts, drizzle/0003_nina_avatar_folders.sql, drizzle/meta/0003_snapshot.json, drizzle/meta/_journal.json, lib/nina/album.ts, lib/admin/avatars.ts, lib/nina/queries.ts, app/admin/page.tsx, tests/admin.avatars.test.ts, tests/db.schema.nina.test.ts
  - **Notes**: Migration generated and `db:check`-clean, but **not applied** — applying it is a deploy action. Verification check 5 (the `nina_folders` UNION probe against a live database) must run at deploy time. `lib/nina/queries.ts` is shared with phase 3 (`getNinaMessageImage` in §6).
