> Adopted from `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md` phase 2. Source: `.workflows/plan/nina-album-search-relevance-tools/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.
# Phase 2: `search_keywords` field, embedding combine, and backfill

**Plan set:** `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md`
**Analysis:** `20260915-140828-SBI4_code_analyzer.md`
**Satisfies:** R2 — a second, hand-written relevance signal per photo (`"tete, putih"`) that feeds
the album's semantic search, editable beside the description, and never clobbered by a re-describe.
**Depends on:** none (runs concurrently with Phase 1)
**Difficulty:** NORMAL
**Package:** `lib/nina`, `lib/admin`, `lib/db/schema`, `components/admin/explorer`, `scripts`

---

## Goal

`nina_avatars` gains a nullable `search_keywords` text column. Every path that turns a photo's prose
into a vector now embeds `description` alone, or `description + "\n\nKeywords: " + searchKeywords`
when the row carries keywords — decided in ONE place, `embedNinaAvatarDescription`, so no caller can
disagree. The operator can write and clear keywords from the same rail that already edits the
description, with the same draft/dirty/one-flight rules; a re-describe rewrites the prose and leaves
the keywords untouched. A one-off backfill re-embeds every row with a description through that same
combine function, proving the pipeline is uniform and reporting per-row counts.

## Interface Contract

**Creates:**

- Column `nina_avatars.search_keywords` — `text`, NULLABLE, no default, no index.
  Drizzle field name: `searchKeywords: text('search_keywords')` (`lib/db/schema/nina/avatars.ts`).
- Migration `drizzle/0024_nina_avatar_search_keywords.sql` (generated; tag may differ — see Step 2).
- `lib/nina/avatarEmbedText.ts` (NEW, zero-import, pure):
  - `NINA_AVATAR_KEYWORDS_PREFIX = '\n\nKeywords: '`
  - `buildNinaAvatarEmbedText(description: string, searchKeywords: string | null): string`
- `lib/admin/avatars.ts`: `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS = 500`
- `lib/admin/schema.ts`: `avatarSearchKeywordsField`, `avatarSearchKeywordsSchema`
- `lib/nina/queries/avatarEmbeddings.ts`:
  `setNinaAvatarSearchKeywordsAndEmbedding(userId, id, searchKeywords, embedding)`
- `lib/admin/ninaAlbumDescribeActions.ts`: `editNinaAvatarSearchKeywordsAction(input: unknown)`
  (re-exported by the `lib/admin/ninaAlbumActions.ts` barrel)
- `scripts/backfill-avatar-embeddings.mjs` + npm script `nina:backfill-embeddings`
- `AlbumExplorerPhoto.searchKeywords: string | null` (`components/admin/explorer/model.ts`)
- `PhotoDescription` props `searchKeywords?: string | null`, `onSaveKeywords?: (text) => Promise<DescribeOutcome>`

**Signature changes:**

- `embedNinaAvatarDescription(description: string, userId: string)`
  → `embedNinaAvatarDescription(description: string, searchKeywords: string | null, userId: string)`
  (`lib/admin/ninaAlbumDeferredDescribe.ts:138`). Both call sites updated in this phase.
- `NinaAvatarDescribeTarget` gains `searchKeywords: string | null`
  (`lib/nina/queries/avatarEmbeddings.ts:35`).
- `avatarColumns` gains `searchKeywords`, inserted **immediately after `description`**
  (`lib/nina/queries/columns.ts:72`) — this changes the SELECT projection ORDER, which four
  `projectedRow(...)` test helpers positionally depend on (Step 15).

**THE EXACT COMBINE FORMAT (Phase 3 reads this):**

```
trimmed keywords empty or null  ->  description
otherwise                       ->  description + "\n\nKeywords: " + searchKeywords
```

One `\n\n` (blank line), the literal word `Keywords`, a colon, ONE space, then the stored
`search_keywords` string verbatim. No trailing newline. No per-phrase splitting, no re-ordering, no
de-duplication — the column is free text and the embedder sees it as written.

**Deletes:** none.
**Renames:** none.

**Requires (from earlier phases):** none.

**Leaves alone (owned by others):** `components/ui/PhotoViewer.tsx`,
`components/admin/explorer/SearchResultsGrid.tsx`, `components/admin/FileExplorer.tsx` (source; its
*test* helper is touched — see the conflict note), `lib/nina/queries/avatarsearch.ts`,
`lib/admin/ninaAlbumSearchActions.ts`, `.claude/skills/*`.

**✅ CROSS-PHASE, RESOLVED — `app/admin/nina/page.tsx:241` is THIS phase's line.**
This phase needs ONE additive line in the album row→prop mapping at `page.tsx:241`
(`searchKeywords: row.searchKeywords,`). Without it `tsc` fails: `AlbumExplorerPhoto` gains a
required field and that is the only place in `app/`, `components/` or `lib/` that constructs one
(verified: `grep -rn "origin: 'album'"` → `page.tsx:230` plus three test helpers). Phase 1's work in
this file is `?avatar=` resolution and folder/page selection — a different region (`:1-24`,
`:124-128`, `:311-319`, the file's tail).

**Reconciler's ruling (build-green wins): the line stays here, and Phase 1 must not take it.**
Moving it to Phase 1 would break Phase 1's own build — the phases are concurrent, and if Phase 1
landed first `row.searchKeywords` would not exist yet (`avatarColumns` gains it in Step 5 of THIS
phase) and `AlbumExplorerPhoto` would not want it (Step 11, also this phase). The column, the type
and this construction site are one atomic compile unit and must ship in one commit. Phase 1's plan
has been edited to list this region under its **Leaves alone**. Step 12 below is unchanged and is
the whole of the edit.

**⚠ CROSS-PHASE HANDOFF — `AdminSearchHit`.** `AdminSearchHit` (`lib/admin/ninaAlbumActions.ts:94`)
deliberately does NOT gain `searchKeywords` in this phase. If Phase 1 builds an
`AlbumExplorerPhoto` out of a hit (`{ ...hit, origin: 'album' as const }`, the shape
`ninaAlbumActions.ts:88` describes as possible), it must supply `searchKeywords: null` explicitly,
or add the field to `AdminSearchHit` + `toHit` in its own commit.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema/nina/avatars.ts` | modify | new `searchKeywords` column after `description` (~:255) + a header section (~:162) |
| `drizzle/0024_nina_avatar_search_keywords.sql` | create (generated) | `ALTER TABLE … ADD COLUMN "search_keywords" text;` + hand-added header comment |
| `drizzle/meta/_journal.json`, `drizzle/meta/0024_snapshot.json` | generated | drizzle-kit writes both; never hand-edited |
| `lib/nina/avatarEmbedText.ts` | create | the one combine function + its prefix constant, zero-import |
| `lib/admin/avatars.ts` | modify | `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS` (appended) |
| `lib/nina/queries/columns.ts` | modify | `avatarColumns` gains `searchKeywords` after `description` (:87) |
| `lib/nina/queries/avatarEmbeddings.ts` | modify | target shape (:35), projection (:56), `toTarget` (:64), new sibling writer (after :195) |
| `lib/admin/ninaAlbumDeferredDescribe.ts` | modify | `embedNinaAvatarDescription` (:138), `fillOne` (:186) |
| `lib/admin/schema.ts` | modify | `avatarSearchKeywordsField` / `avatarSearchKeywordsSchema` after `avatarDescriptionSchema` (:101) |
| `lib/admin/ninaAlbumDescribeActions.ts` | modify | `describeNinaAvatarAction` (:78) reads+preserves; new `editNinaAvatarSearchKeywordsAction` |
| `lib/admin/ninaAlbumActions.ts` | modify | re-export the new action (:136) |
| `components/admin/explorer/model.ts` | modify | `AlbumExplorerPhoto.searchKeywords` (:69) |
| `app/admin/nina/page.tsx` | modify (Phase 1's file, this phase's line — reconciled) | one additive line at `:241`; Phase 1 edits only `:1-24`, `:124-128`, `:311-319` and the tail |
| `components/admin/explorer/PhotoDescription.tsx` | modify | new optional keywords control + docstring |
| `components/admin/explorer/SelectionPane.tsx` | modify | two new props on the `PhotoDescription` mount (:402) + import |
| `scripts/backfill-avatar-embeddings.mjs` | create | the one-off re-embed, per-row counts |
| `package.json` | modify | one additive `nina:backfill-embeddings` line in the `scripts` block — **co-edited by Phase 3** (`nina:search-analysis`); independent lines, keep both on conflict |
| `lib/nina/queries.test.ts` | modify | frozen barrel surface +1 name (94 entries today) — **co-edited by Phase 1**, see Step 15a |
| `tests/admin.albumActionsBarrel.test.ts` | modify | barrel + describe-module surfaces |
| `tests/admin.albumDescribeEmbed.test.ts` | modify | projection helpers 18→19 / 5→6; new cases |
| `tests/admin.albumAvatarActions.test.ts` | modify | `avatarRow` projection 18→19 |
| `tests/nina.avatarSearch.test.ts` | modify | `projectedRow` positional list 19→20 |
| `components/admin/explorer/PhotoDescription.test.tsx` | modify | new cases for the keywords control |
| `components/admin/explorer/SelectionPane.test.tsx` | modify | `albumPhoto` helper + new action mock + a wiring case |
| `components/admin/FileExplorer.test.tsx` | modify | album photo helper gains `searchKeywords: null` |
| `components/admin/explorer/PhotoGrid.test.tsx` | modify | album photo helper gains `searchKeywords: null` |

---

## Decisions (made here, with their reasons — the reconciler should not re-open these)

**D1 — the combine lives in a zero-import module, not inside the deferred-describe file.**
`embedNinaAvatarDescription` is the choke point and stays the choke point, but the *string building*
is pulled out into `lib/nina/avatarEmbedText.ts` because two more consumers need the exact same
bytes: the backfill script (Step 16) and Phase 3's diagnostic script. A second spelling of the join
would silently embed a different text than the app does, producing a corpus half in one space —
the exact failure `lib/db/schema/nina/avatars.ts`'s own header names ("two embedding models do not
share a vector space … it randomises it, silently, with no error anywhere"). The module has ZERO
imports, so `node --experimental-strip-types` can load it from `scripts/` — the rule
`scripts/backfill-record-keys.mjs` already runs under (its header: *"a `lib/` module can be imported
from `scripts/` when stripping its types leaves no runtime dependency and no `@/` alias to resolve"*).

**D2 — a SIBLING action, not a widened `editNinaAvatarDescriptionAction`.**
`editNinaAvatarSearchKeywordsAction` writes `search_keywords` + a NULL vector in one UPDATE, exactly
as the description action writes `description` + a NULL vector in one UPDATE. Reasons, in order:
(a) the "never two derived things disagree" invariant is kept by the *same* mechanism in both paths,
so there is one argument to check rather than two; (b) the panel has two independent save buttons
with two independent drafts — a merged action would make saving the description silently overwrite
keywords the operator had typed but not saved (and vice versa); (c) a merged action would have to
accept a partial payload, and this repo's schema file argues against exactly that
(`shortcutCellSchema`'s header: *"one control per cell … the three fields have three different
caps"*).

**D2b — the re-describe READS the keywords; the plan index's invariant 2b was corrected to say so
(reconciler, round 1).** The index as drafted read *"Re-describe … must never read, clear, or
overwrite `searchKeywords`"*, and Step 9b reads `row.searchKeywords` to hand it to
`embedNinaAvatarDescription`. The word **read** was the drafting error, not the step: invariant 2
requires that whichever input changes, the vector is recomputed from *everything that should be
embedded* — so a re-describe that did not read the keywords would write a vector that silently drops
them, and every re-describe would quietly undo R2 for that row. What the invariant is protecting is
the WRITE: `setNinaAvatarDescriptionAndEmbedding` sets two columns and `search_keywords` is not one
of them, so the omission is structural. The index's invariant 2b now reads *"may read them, and
must; must never clear or overwrite them."* Nothing in this phase changes.

**D3 — keywords alone never produce an embedding.**
The embedded text is ANCHORED on `description`. A row with keywords and a NULL description gets no
vector, because `fillOne`'s `describe: false` path already refuses to invent prose for an empty box
(*"the empty box IS the clear (D1) does not mean 'and now go invent something'"*), and the backlog
read `or(isNull(description), isNull(descriptionEmbedding))` will hand that row to the
`describe: true` sweep, which describes it and then embeds description+keywords. So the state
self-heals through the path that already exists, and no new branch is added to the worker. The
keywords action therefore only schedules a re-embed when the row HAS prose.

**D4 — the bound is 500 characters, and it is a measured ceiling rather than a taste.**
`NINA_EMBEDDING_MAX_CHARS = 8_000` is the embedder's silent-truncation point
(`lib/nina/embedding.ts:79`). description (≤ 2000) + `'\n\nKeywords: '` (13) + keywords (≤ 500) =
2513 — two-and-a-half times of margin, so the combined text can never be truncated mid-sentence, and
the operator never sees keywords silently not participate. 500 characters is ~30 comma-separated
phrases, far past what a human tags one photograph with. It is NOT
`ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`: that constant is shared with `nina_message_images`, which
has no keywords column, and importing it here would assert a kinship that does not exist.

**D5 — the backfill script IMPORTS the combine and DUPLICATES the transport.**
Plan invariant 5 asks for the choice and its reason, so here it is, split by what is at stake:

- **Imported:** `buildNinaAvatarEmbedText` from `../lib/nina/avatarEmbedText.ts`. This is the thing
  whose correctness the backfill exists to prove. A duplicated join would make the script's whole
  claim ("the pipeline is uniform") unfalsifiable — it would be testing its own copy.
- **Duplicated (probe convention):** `EMBEDDINGS_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`,
  the `fetch`, and the SQL. Importing `lib/nina/embedding.ts` is impossible in a plain node run —
  it opens with `import 'server-only'`, reads the zod env group `@/lib/env`, and imports
  `@/lib/db/schema` through a `@/` alias. Importing `lib/admin/ninaAlbumDeferredDescribe.ts` is
  worse: its first line is `import { after } from 'next/server'`. So the transport is spelled in
  `scripts/album-search-probe.mjs`'s shape, with that file's own warning repeated: if the model ever
  migrates, this copy must move with it.

The residual risk invariant 5 exists to prevent — a second spelling of the thing that matters — is
eliminated by the import; what is duplicated is the thing the probe already duplicates and that
`scripts/check-schema-drift.mjs`-style drift would surface loudly (a wrong-width vector is a refused
INSERT, not a bad ranking).

---

## Implementation Steps

### Step 1: The column

**File:** `lib/db/schema/nina/avatars.ts` — header section inserted before line 162 (`*/` of the
table's big docstring), column inserted at line 256 (immediately after `description`).

**Change:** Add the column and the header section the file's own style demands (every column with a
non-obvious migration story gets one).

**Code (header — insert immediately after the `description_embedding` block that ends at line 161,
i.e. before the closing `*/` on line 162):**

```ts
 * ── `search_keywords` (2026-09-15, nina-album-search-relevance-tools R2) ─────────────────────
 * A SECOND relevance signal, written by hand: comma-separated free-text phrases the operator adds
 * when a photograph keeps surfacing for the wrong query, or keeps not surfacing for the right one.
 * The user's own example is the whole specification — *"search_keywords (contoh value string:
 * 'tete', 'putih')"* — so it is free text of the same kind as `description`, in a form a human
 * types, and nothing here parses it into phrases. The column stores what was typed.
 *
 * **It is an INPUT to `description_embedding`, never a second thing to rank by.** There is no
 * exact-match path, no keyword boost and no second vector: `embedNinaAvatarDescription`
 * (`lib/admin/ninaAlbumDeferredDescribe.ts`) builds `description`, or
 * `description + "\n\nKeywords: " + search_keywords`, and embeds THAT. One column, one space, one
 * score — the same argument `description_embedding` above makes for captioning an image query into
 * the text space rather than keeping two incomparable rankings.
 *
 * **The two columns are independent writers of one derived column, and that is the invariant.**
 * `description` is rewritten by the vision model and by hand; `search_keywords` is only ever
 * written by hand. A re-describe must NOT touch it — it is the operator's correction of the
 * model's opinion, and a model pass that erased it would erase the correction every time it was
 * needed. What both writers share is the obligation `setNinaAvatarDescriptionAndEmbedding`'s
 * docstring already states for prose: whichever of them changes, the vector changes in the SAME
 * UPDATE, so there is no window in which the row is a lie.
 *
 * Nullable, no default, no backfill, no index — the `source_key` argument applied to a third
 * fact. Every existing row carries NULL, NULL means "no keywords" forever, and a NULL keyword
 * makes the combined text exactly the description, so every already-computed vector stays
 * numerically correct. The one-off backfill re-embeds them anyway, to prove the path is uniform
 * rather than to change a number.
```

**Code (the column — replace line 254-255's `description` block so the new column sits directly
beneath it):**

```ts
    /** What the picture shows, in prose (R25). See the header for its three writers. */
    description: text('description'),
    /**
     * **Hand-written search phrases, comma-separated** — R2, 2026-09-15. `"tete, putih"`.
     *
     * NULL means the operator has not tagged this photograph, and it is the value every row
     * written before today carries. NOT a second ranking column: it is folded into the text that
     * becomes `description_embedding` (`buildNinaAvatarEmbedText`, `lib/nina/avatarEmbedText.ts`),
     * and nothing in the app SELECTs it to compare against a query. See the header.
     *
     * Bounded by `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS` at the boundary rather than by the
     * column, exactly as `description` is — a `text` column with a Zod bound in front of it is
     * this repo's shape for prose a human types.
     */
    searchKeywords: text('search_keywords'),
```

**Impact:** `typeof ninaAvatars.$inferSelect` gains `searchKeywords: string | null`. No existing
read widens (every SELECT in this repo spells its projection — `columns.ts`'s own banner).

---

### Step 2: The migration

**File:** `drizzle/0024_nina_avatar_search_keywords.sql` (+ `drizzle/meta/*`) — GENERATED.

**Change:** Do not hand-write or hand-number this file. Run, from the worktree root:

```bash
npm run db:generate -- --name nina_avatar_search_keywords
```

(If this drizzle-kit version rejects `--name`, drop the flag and accept the random tag it emits;
`drizzle/0023_dry_kabuki.sql` is a random tag and `drizzle/0021_nina_error_logs.sql` a named one, so
both are precedented.)

Expected emitted body — verify it is EXACTLY this one statement, and nothing else:

```sql
ALTER TABLE "nina_avatars" ADD COLUMN "search_keywords" text;
```

If drizzle-kit emits anything beyond that single `ALTER TABLE` (a DROP, an index, a second table),
STOP: the schema tree is not what this plan read, and the extra statement is drift that belongs in
its own decision.

Then hand-add the header comment above it — `0023_dry_kabuki.sql` establishes that a generated file
gets a hand-written header explaining the migration's story:

```sql
-- nina-album-search-relevance-tools R2. Additive only: ONE nullable text column, no default, no
-- index, no backfill.
--
-- Nullable is the entire migration story, and it is `source_key`'s argument applied to a third
-- fact: Postgres adds a nullable column without rewriting the table, every existing row gets NULL,
-- and NULL is a legal state forever ("this photograph has not been tagged"). It is also why the
-- already-computed `description_embedding` values stay CORRECT rather than merely tolerable —
-- `buildNinaAvatarEmbedText` returns the description unchanged when keywords are NULL, so a
-- re-embed of an untagged row produces the identical vector. The one-off backfill
-- (`npm run nina:backfill-embeddings`) re-embeds them anyway, to prove the path is uniform.
--
-- No index: nothing ranks by this column, queries it, or joins on it. It is an INPUT to the text
-- that becomes the vector, and the vector already has its HNSW index (0023).
--
-- BEFORE RUNNING: check `git log origin/main -- drizzle/` for a migration numbered 0024 that landed
-- while this branch was in flight. If one has, REGENERATE from the merged schema — never renumber
-- this file by hand. `drizzle/0023_dry_kabuki.sql`'s own header records that exact repair, and
-- `scripts/check-schema-drift.mjs` explains why a renamed file strands itself below the ledger
-- watermark permanently.
```

**Applying it** (this repo has ONE database — `.env.local`'s `DATABASE_URL` IS what production
reads):

```bash
npm run db:migrate            # drizzle-kit migrate, over DATABASE_URL_UNPOOLED
npm run ci:schema-drift-guard # proves the database now looks like the committed schema
```

This is additive-only, so migrate-before-deploy is the correct order: old code that does not know
the column keeps working (every SELECT is an explicit projection), and new code finds the column
waiting.

**Impact:** Production gains a nullable column. Nothing else changes until the code lands.

---

### Step 3: The one combine function

**File:** `lib/nina/avatarEmbedText.ts` — NEW.

**Change:** Create the file. It must stay zero-import: three consumers in three different runtimes
depend on that (a Server Action, a `node --experimental-strip-types` script, and Phase 3's script).

**Code (complete file):**

```ts
/**
 * **What an album photograph's vector is computed FROM** — one function, so no two runtimes can
 * disagree about it. `nina-album-search-relevance-tools` R2.
 *
 * ── WHY IT IS NOT INSIDE `embedNinaAvatarDescription` ───────────────────────────────────────
 * That function is still the one place an album vector is MADE, and this does not change it: it
 * calls this and then calls `embedNinaText`. What moved out is the string, because three callers
 * in three runtimes need the identical bytes — the app's deferred describe pass, the one-off
 * backfill script, and the `/search-analysis` diagnostic. A second spelling of the join would
 * embed a text the app never embeds, and the corpus would end up half in one space and half in
 * another with no error anywhere. `lib/db/schema/nina/avatars.ts`'s header names that failure mode
 * for the model id; it is the same failure mode for the input text.
 *
 * ── ZERO IMPORTS, AND THAT IS A CONTRACT ────────────────────────────────────────────────────
 * `lib/id.ts`'s rule, restated: *"it exists to be importable from Vitest, from `research/*.mjs`
 * and from a Route Handler alike, with nothing to resolve."* `scripts/` reaches this module as
 * `../lib/nina/avatarEmbedText.ts` under `node --experimental-strip-types`
 * (`scripts/backfill-record-keys.mjs`'s precedent), which works only while stripping the types
 * leaves no runtime dependency and no `@/` alias behind. Do not add an import here.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ─────────────────────────────────────────────────────
 * A BLANK LINE and a labelled line, not a comma-append. Embedding models weight a coherent
 * paragraph differently from a bag of words, and appending `", tete, putih"` to the last sentence
 * of a description reads to the model as part of that sentence — the phrases would inherit its
 * subject. A blank line and a label is the plainest way to say "these are separate, and they are
 * keywords", using an English word the model has seen a great many times in exactly that role.
 *
 * Nothing is parsed. The user's requirement is free text — *"bentuk nya sama dengan existing image
 * description (free text), cuma bentuk nya kumpulan phrase dipisah dengan koma"* — so the commas
 * are a human's convention and not a grammar this function enforces. It does not split, sort,
 * de-duplicate or re-punctuate. What the operator typed is what the model reads.
 */

/** The join. Exported so a test asserts the literal rather than re-typing it. */
export const NINA_AVATAR_KEYWORDS_PREFIX = '\n\nKeywords: '

/**
 * The description, or the description followed by a labelled keyword line.
 *
 * `null`, `''` and an all-whitespace string are ONE case — "no keywords" — and all three answer the
 * description unchanged. That is what makes every vector computed before this column existed still
 * correct: an untagged row re-embeds to the identical text and therefore the identical vector.
 *
 * The description is returned untrimmed and unaltered; `clampEmbedInput` (`lib/nina/embedding.ts`)
 * owns trimming and the 8 000-character ceiling, and owning it twice is how the two disagree.
 */
export function buildNinaAvatarEmbedText(
  description: string,
  searchKeywords: string | null,
): string {
  const keywords = searchKeywords?.trim() ?? ''
  if (keywords.length === 0) return description
  return `${description}${NINA_AVATAR_KEYWORDS_PREFIX}${keywords}`
}
```

**Impact:** New module, no importers yet.

---

### Step 4: The boundary bound

**File:** `lib/admin/avatars.ts` — appended at the end of the file (after the last exported
constant).

**Change:** Add the character ceiling. It lives here and not in `lib/admin/chatPhotos.ts` because
`nina_message_images` has no keywords column — see D4.

**Code (append):**

```ts
/**
 * **How long a hand-written keyword list may be** — `nina-album-search-relevance-tools` R2.
 *
 * 500, and it is derived rather than chosen. `NINA_EMBEDDING_MAX_CHARS` (`lib/nina/embedding.ts`)
 * silently truncates at 8 000 characters, and the combined text is
 * `description + "\n\nKeywords: " + searchKeywords`: 2 000 (the description's own ceiling) + 13 +
 * 500 = 2 513, so a maximal pair still leaves two-and-a-half times of headroom and the keywords can
 * never be the half that gets cut. 500 characters is also ~30 comma-separated phrases, which is
 * already more than a human tags one photograph with.
 *
 * NOT `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`. That constant is shared with the media table
 * because the two tables' descriptions are one kind of sentence reaching one prompt
 * (`chatPhotoDescriptionField`'s header says so); `nina_message_images` has no keywords column at
 * all, so sharing a bound here would assert a kinship that does not exist.
 *
 * The client reads it for `maxLength` and the Zod field for `.max()`, which is this file's whole
 * reason to exist: *"a constant that is agreed rather than shared is a constant that will one day
 * disagree."*
 */
export const ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS = 500
```

**Impact:** None yet.

---

### Step 5: The shared projection

**File:** `lib/nina/queries/columns.ts:87` — inside `avatarColumns`.

**Change:** Insert `searchKeywords` immediately after `description`. Position matters: four test
helpers build rows positionally (Step 15).

**Code (replace lines 87-88):**

```ts
  description: ninaAvatars.description,
  /* R2, 2026-09-15. Read by the album rail (to edit) and by `describeNinaAvatarAction` (to
   * PRESERVE across a re-describe). Not by search — nothing ranks by this column; it is an input
   * to the text that becomes `description_embedding`. Placed beside `description` because the two
   * are read together everywhere they are read at all. */
  searchKeywords: ninaAvatars.searchKeywords,
  isCurrent: ninaAvatars.isCurrent,
```

**Impact:** `getNinaAvatar`, `listNinaAvatarsInFolder`, `listNinaAvatars` and
`searchNinaAvatarsBy*` rows all carry `searchKeywords`. `AdminSearchHit` is built by an explicit
`toHit` mapping (`lib/admin/ninaAlbumSearchActions.ts:87-115`), so the search action's client-facing
shape is UNCHANGED and Phase 1's `SearchResultsGrid` compiles untouched. Text on the wire grows by
one usually-NULL column per row — negligible beside the 120-row page's existing payload, and unlike
`description_embedding` (which `avatarEmbeddings.ts`'s header keeps out of this projection for
exactly that reason) this is a short string.

---

### Step 6: The worker's target, and the sibling writer

**File:** `lib/nina/queries/avatarEmbeddings.ts` — four edits.

**6a. The target shape** (replace lines 35-43):

```ts
export interface NinaAvatarDescribeTarget {
  id: string
  blobUrl: string
  pathname: string
  /** NULL means the vision model has never been asked about this photograph. */
  description: string | null
  /**
   * The operator's hand-written phrases, or NULL. R2, 2026-09-15. Carried here because the worker
   * embeds `description` COMBINED with these (`buildNinaAvatarEmbedText`), and reading them in the
   * same statement is what keeps that one statement per batch. The worker never WRITES this column
   * — only `editNinaAvatarSearchKeywordsAction` does.
   */
  searchKeywords: string | null
  /** `description_embedding IS NOT NULL` — the vector itself is deliberately not selected. */
  hasEmbedding: boolean
}
```

**6b. The projection** (replace lines 56-62):

```ts
const describeTargetColumns = {
  id: ninaAvatars.id,
  blobUrl: ninaAvatars.blobUrl,
  pathname: ninaAvatars.pathname,
  description: ninaAvatars.description,
  searchKeywords: ninaAvatars.searchKeywords,
  embedded: hasEmbeddingExpr,
}
```

**6c. `toTarget`** (replace lines 64-78):

```ts
function toTarget(row: {
  id: string
  blobUrl: string
  pathname: string
  description: string | null
  searchKeywords: string | null
  embedded: number
}): NinaAvatarDescribeTarget {
  return {
    id: row.id,
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    description: row.description,
    searchKeywords: row.searchKeywords,
    hasEmbedding: row.embedded === 1,
  }
}
```

**6d. The sibling writer** (insert after `setNinaAvatarDescriptionAndEmbedding`, i.e. after line
195, before the `void isNotNull` tail):

```ts
/**
 * Write the hand-written keywords and the vector in ONE UPDATE. The twin of
 * `setNinaAvatarDescriptionAndEmbedding`, for the other input to the same derived column.
 *
 * ── WHY A SECOND FUNCTION AND NOT A THIRD PARAMETER ON THE FIRST ────────────────────────────
 * Because the two callers write DIFFERENT columns and must not write each other's. A merged
 * `set({ description, searchKeywords, descriptionEmbedding })` would make the re-describe path
 * carry a `searchKeywords` argument it has no business having — and the first time someone passed
 * the wrong thing there, a vision pass would erase the operator's correction, silently, with the
 * row still looking healthy. Two functions cannot make that mistake: `describeNinaAvatarAction`
 * has no way to spell it.
 *
 * ── WHY THE VECTOR IS A PARAMETER AND NOT ALWAYS NULL ───────────────────────────────────────
 * Symmetry with its twin, and the same reason: `null` is what the hand-edit path writes (the
 * keywords changed, so the stored vector describes a text this row no longer has), and a real
 * vector is what a caller that already computed one would write. Both are legal, both are one
 * statement, and neither leaves a window in which the columns disagree.
 *
 * `searchKeywords: null` is the CLEAR, exactly as `description: null` is on the twin.
 */
export async function setNinaAvatarSearchKeywordsAndEmbedding(
  userId: string,
  id: string,
  searchKeywords: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ searchKeywords, descriptionEmbedding: embedding })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}
```

**Impact:** `NinaAvatarDescribeTarget` is constructed by hand in seven places in
`tests/admin.albumDescribeEmbed.test.ts` — all gain `searchKeywords: null` (Step 15). The module
header at lines 6-29 stays accurate as written; no prose there goes stale.

---

### Step 7: The choke point

**File:** `lib/admin/ninaAlbumDeferredDescribe.ts` — two edits.

**7a. `embedNinaAvatarDescription`** (replace lines 125-151, docstring included):

```ts
/**
 * Embed one description — COMBINED with its hand-written keywords — or answer `null`.
 *
 * **This is the only place in the repo that decides what an album photograph's vector is computed
 * FROM.** R2, 2026-09-15, and it is one function rather than a rule at each call site for the
 * reason the plan set's analysis measured: there are exactly two callers (`fillOne` below, and
 * `describeNinaAvatarAction`), and the day a third arrives it must not have to remember the join.
 * The join itself lives in `buildNinaAvatarEmbedText` (`lib/nina/avatarEmbedText.ts`) because the
 * backfill script and the `/search-analysis` diagnostic need the identical bytes from outside
 * Next's runtime; that module's header argues it.
 *
 * `searchKeywords` of `null` — and of `''`, and of whitespace — all mean "no keywords" and all
 * embed the description unchanged, which is why every vector computed before the column existed is
 * still numerically correct.
 *
 * **Never throws.** An embedding failure must not cost the prose: `describeNinaAvatarAction` is
 * about to return that prose to an operator who is looking at it, and the deferred worker is about
 * to write it to a row that has waited for it. A `null` here writes a NULL vector, which is
 * exactly the state `listNinaAvatarDescribeBacklog` picks up on the next sweep — so the failure
 * degrades into "not searchable yet", which is what it actually is, and never into "the model's
 * words were thrown away".
 *
 * `embedNinaText` does its own `logNinaError` (phase 1), so this adds a console line for the local
 * operator and nothing else.
 */
export async function embedNinaAvatarDescription(
  description: string,
  /* The row's `search_keywords`, verbatim. NOT an option bag: it is as load-bearing as the
   * description for what the vector means, and an optional field is a field a caller forgets. */
  searchKeywords: string | null,
  /* Passed through to `embedNinaText`'s failure log. Phase 1's contract asks for it in as many
   * words ("Phase 2 and 3 both have the id and should pass it") — `nina_error_logs.user_id` is
   * nullable, and a row that cannot say whose album it came from is a row nobody can act on. */
  userId: string,
): Promise<number[] | null> {
  try {
    return await embedNinaText(buildNinaAvatarEmbedText(description, searchKeywords), { userId })
  } catch (cause) {
    console.error('[f34] embedding failed; the description is kept and stays unsearchable', cause)
    return null
  }
}
```

Add the import at the top of the file, after the `describeSubjectForSide` import (line 3):

```ts
import { buildNinaAvatarEmbedText } from '@/lib/nina/avatarEmbedText'
```

**7b. `fillOne`** (replace line 186):

```ts
    const embedding = await embedNinaAvatarDescription(description, target.searchKeywords, userId)
```

And extend `fillOne`'s docstring (lines 153-160) with one paragraph, so the file's prose does not go
stale about what it now embeds:

```ts
/**
 * One row. Decides for itself what the row still needs, and writes both columns in one statement.
 *
 * `describe: false` is the rewrite path (`editNinaAvatarDescriptionAction`): the prose is the
 * human's and a vision call would be both wasteful and wrong. A row that has no prose under
 * `describe: false` is simply left alone — an operator who CLEARED the box asked for silence, and
 * "the empty box IS the clear" (D1) does not mean "and now go invent something".
 *
 * ── IT EMBEDS THE KEYWORDS TOO, AND IT NEVER WRITES THEM ────────────────────────────────────
 * R2, 2026-09-15. `target.searchKeywords` is read in the same statement the rest of the target
 * came from and handed to `embedNinaAvatarDescription`, so a row tagged `"tete, putih"` is
 * searchable under those words. The UPDATE below is still
 * `setNinaAvatarDescriptionAndEmbedding` — two columns, prose and vector — so the worker cannot
 * touch `search_keywords` even by accident. That is also what makes this the re-earn path for
 * `editNinaAvatarSearchKeywordsAction`: the keywords are already written, the vector is NULL, and
 * `describe: false` re-computes the vector from the pair without a vendor image call.
 */
```

**Impact:** `embedNinaAvatarDescription`'s two call sites must both be updated in this same commit
or the tree does not compile. Call site 2 is Step 9.

---

### Step 8: Validation

**File:** `lib/admin/schema.ts` — inserted after `avatarDescriptionSchema` (after line 101).

**Change:** Add the field and its schema. Import the bound.

**Code (extend the existing import block at lines 27-33):**

```ts
import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_ID_RE,
  ADMIN_AVATAR_MAX_EDGE_PX,
  ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
} from './avatars'
```

**Code (insert after line 101, i.e. after `avatarDescriptionSchema`'s closing `})`):**

```ts
/**
 * **The hand-written search phrases, as a field** — `nina-album-search-relevance-tools` R2.
 * `"tete, putih"`.
 *
 * ── WHY IT IS NOT `chatPhotoDescriptionField` WITH A DIFFERENT MAX ──────────────────────────
 * Because it normalises differently, and the difference is the point. A description is a
 * PARAGRAPH: its internal newlines are its formatting, so that field preserves them and only
 * collapses runs of three or more. This is a LINE — a comma-separated list — and it is about to be
 * joined into embedded text under a `"Keywords: "` label. A newline inside it would put a second
 * unlabelled block into the vector's input and read to the model as a new paragraph, so every run
 * of whitespace (newlines included) folds to one space. One line in, one line stored, one line
 * embedded.
 *
 * Nothing else is done to it. No splitting on commas, no sorting, no de-duplication, no case
 * folding: the user's requirement is free text in a human's convention, and
 * `lib/nina/avatarEmbedText.ts` embeds it verbatim. A validator that re-punctuated it would be
 * storing something the operator did not type, which is the `folderPathSchema` refuse-don't-repair
 * argument in a field where there is nothing to refuse.
 *
 * ── AN EMPTY RESULT IS LEGAL AND MEANS SOMETHING TO THE ACTION ──────────────────────────────
 * No `.min(1)`, exactly as `chatPhotoDescriptionField`: an all-whitespace box normalises to `''`,
 * this accepts it, and the action turns it into `NULL`. The schema knows shapes; the action owns
 * policy.
 *
 * `.max()` before the transform, also that field's rule: an over-long paste is REFUSED and
 * reported inline, never silently truncated into range.
 */
export const avatarSearchKeywordsField = z
  .string()
  .max(ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS)
  .transform((value) => value.replace(/\s+/g, ' ').trim())

/**
 * The hand-edit write. Shaped exactly like `avatarDescriptionSchema` one block up — the same id
 * check, one prose field, existence and ownership left to the action — because it IS that action's
 * twin for the album's other free-text column. See `editNinaAvatarSearchKeywordsAction`.
 */
export const avatarSearchKeywordsSchema = z.object({
  id: avatarIdSchema,
  searchKeywords: avatarSearchKeywordsField,
})
```

**Impact:** None until the action uses it. `\s+` includes `\r`, so no separate CRLF pass is needed.

---

### Step 9: The two actions

**File:** `lib/admin/ninaAlbumDescribeActions.ts` — three edits.

**9a. Imports** (replace lines 5-12):

```ts
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS } from '@/lib/admin/avatars'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { embedNinaAvatarDescription, scheduleEmbed } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  avatarDescriptionSchema,
  avatarIdSchema,
  avatarSearchKeywordsSchema,
} from '@/lib/admin/schema'
import { describeSubjectForSide } from '@/lib/nina/album'
import {
  getNinaAvatar,
  setNinaAvatarDescriptionAndEmbedding,
  setNinaAvatarSearchKeywordsAndEmbedding,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'
```

**9b. `describeNinaAvatarAction` preserves the keywords** (replace line 78 and extend the comment
block directly above it — insert this paragraph at the end of the existing `── AND THE VECTOR, IN
THE SAME UPDATE ──` comment, before its `*/`):

```
     * ── AND IT READS `search_keywords` WITHOUT WRITING IT ───────────────────────────────────
     * R2, 2026-09-15, and it is an invariant rather than a convenience: this action OVERWRITES the
     * prose, and the keywords are the operator's correction of exactly this model's opinion. A
     * pass that cleared them would erase the correction every single time it was needed. So the
     * row's stored value is read here, handed to `embedNinaAvatarDescription` so the new vector
     * still carries the tags, and never appears in the UPDATE —
     * `setNinaAvatarDescriptionAndEmbedding` sets two columns and `search_keywords` is not one of
     * them, so the omission is structural and not a thing to remember.
```

```ts
    const embedding = await embedNinaAvatarDescription(description, row.searchKeywords, userId)
```

**9c. The new action** (insert after `editNinaAvatarDescriptionAction`, i.e. after line 154, before
`ensureNinaAvatarDescriptionAction`):

```ts
/**
 * **"Tag this photograph with the words it should be findable by."** R2, 2026-09-15, from the
 * user's own framing: *"kalo selain image description, kita tambah satu field baru,
 * search_keywords (contoh value string: 'tete', 'putih')."*
 *
 * ── WHY IT IS A SECOND ACTION AND NOT A SECOND FIELD ON THE ONE ABOVE ───────────────────────
 * Three reasons, and the second is the one that would have bitten. (1) The panel has two
 * independent boxes with two independent drafts, so a merged action would make saving the
 * description overwrite keywords the operator had typed but not saved. (2) The re-describe path
 * must be STRUCTURALLY unable to write this column — see `describeNinaAvatarAction` — and a merged
 * writer would put a `searchKeywords` parameter within reach of it. (3) `shortcutCellSchema`'s
 * header already rules for this shape on this repo's own ground: one control, one field, one
 * action, because the fields have different caps and different meanings.
 *
 * ── SAME POLICY AS THE DESCRIPTION EDIT, LINE FOR LINE ──────────────────────────────────────
 *   · NO model call, NO `after()` vision pass — these are the human's words.
 *   · AN EMPTY BOX CLEARS THE FIELD, and `NULL` is what every untagged row already carries.
 *   · THE VECTOR IS NULLED IN THE SAME UPDATE and re-earned afterwards, because it is derived from
 *     these words too: leaving the old one would keep the photo findable under tags the operator
 *     just deleted, which is the invisible-until-a-search-returns-the-wrong-photo failure
 *     `setNinaAvatarDescriptionAndEmbedding`'s docstring argues about.
 *
 * ── THE ONE ASYMMETRY: A ROW WITH NO PROSE SCHEDULES NOTHING ────────────────────────────────
 * The embedded text is anchored on the description (`buildNinaAvatarEmbedText` returns the
 * description, plus a labelled keyword line). There is no keywords-only vector, deliberately: the
 * embed-only worker refuses to describe a NULL description, so a `scheduleEmbed` here would be a
 * read that finds nothing to do. That row is already in `listNinaAvatarDescribeBacklog` (no
 * description), and the describe sweep will write prose and then embed the pair — so the state
 * heals through the path that already exists rather than through a new branch in the worker.
 */
export async function editNinaAvatarSearchKeywordsAction(
  input: unknown,
): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()

  const parsed = avatarSearchKeywordsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those keywords did not fit the field — ${ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS} characters at most.`,
    }
  }
  const { id, searchKeywords } = parsed.data

  const row = await getNinaAvatar(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* The empty box IS the clear — the same policy line the description edit runs. */
  const next = searchKeywords.length === 0 ? null : searchKeywords

  await setNinaAvatarSearchKeywordsAndEmbedding(userId, id, next, null)
  /* Only a row that HAS prose has a vector to re-earn. See the docstring's last block. */
  if (row.description != null) scheduleEmbed(userId, id)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    id,
    ...(next === null ? { note: 'Cleared. The photo is findable by its description alone.' } : {}),
  }
}
```

Also append one sentence to the module header's bullet list (line 20), so the file's own index of
itself stays true:

```
 *   · `editNinaAvatarSearchKeywordsAction` is the tag: the other free-text input to the vector.
```

**Impact:** The describe module now exports four actions. Two surface-freezing tests must move
(Step 15).

---

### Step 10: The barrel

**File:** `lib/admin/ninaAlbumActions.ts:136-138` — the re-export block.

**Change:**

```ts
export {
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
  editNinaAvatarSearchKeywordsAction,
  ensureNinaAvatarDescriptionAction,
} from './ninaAlbumDescribeActions'
```

(Preserve whatever the existing block's exact member list and `from` clause are — this shows the
describe-module line only; add the one name in alphabetical position.)

**Impact:** `tests/admin.albumActionsBarrel.test.ts` must gain the name (Step 15).

---

### Step 11: The client row shape

**File:** `components/admin/explorer/model.ts:68-71`.

**Change:** Album rows carry the value; media rows must not gain it (that table has no such column —
the same argument `MediaExplorerPhoto.thumbUrl: null` makes).

**Code (replace lines 68-71):**

```ts
/** One row of the album: an `nina_avatars` row, narrowed to what a browser needs. */
export interface AlbumExplorerPhoto extends ExplorerPhotoBase {
  origin: 'album'
  /**
   * The operator's hand-written search phrases, or `null`. R2, 2026-09-15.
   *
   * ALBUM-ONLY, and on the arm rather than on `ExplorerPhotoBase` for the reason `prompt` and
   * `kind` sit on the media arm: `nina_message_images` has no such column, so a media row cannot
   * carry the value and code that reads it must narrow on `origin` first. That is the compiler
   * refusing to let the shared rail assume an album row.
   *
   * Unlike `description` this IS rendered — the rail's keyword box shows and edits it. Invariant 5
   * is untouched: it is an ADMIN surface, nothing runner-facing reads it, and it never reaches a
   * model except as part of the text this row's vector is computed from, server-side.
   */
  searchKeywords: string | null
}
```

**Impact:** Every construction site must supply it — one in `app/` (Step 12) and three test helpers
(Step 15).

---

### Step 12: The server mapping (Phase 1's file, THIS phase's line — reconciled)

**File:** `app/admin/nina/page.tsx:241` — inside the `photos = listed.rows.map((row): AlbumExplorerPhoto => ({ … }))` album arm.

**Change:** Insert one line immediately after `description: row.description,`:

```ts
      description: row.description,
      /* R2, 2026-09-15. Rendered and edited by the rail's keyword box; `avatarColumns` carries it
       * now, and the Media arm has no counterpart because that table has no such column. */
      searchKeywords: row.searchKeywords,
```

**Impact:** This is the ONLY source-tree edit this phase makes in a file the index assigns to Phase
1. It is additive, at line 241, inside the album arm's object literal — Phase 1's declared work in
this file is `?avatar=` resolution and the folder/page it loads, which is above this block, so git
merges the two commits cleanly in either order.

**Reconciled, and no longer a choice:** the line lands HERE, in the same commit as Steps 5 and 11.
It cannot move to Phase 1 — `row.searchKeywords` does not exist until Step 5's projection change and
`AlbumExplorerPhoto` does not want it until Step 11, both of which are this phase's, so a Phase 1
commit carrying this line would not compile. Phase 1's plan now lists `:229-243` under its
**Leaves alone**.

---

### Step 13: The control

**File:** `components/admin/explorer/PhotoDescription.tsx` — whole file replaced.

**Change:** Add an optional keywords block below the description block, sharing the panel's ONE
in-flight lock. Rendered only when the host supplies `onSaveKeywords`, so `MediaPane` is untouched.

**Why one shared lock and not a second independent one** (this is a correctness argument, not
tidiness, and it is written into the docstring below): all three verbs write
`description_embedding`. A keywords save nulls the vector and schedules a re-embed; a re-describe
computes a vector in band and writes it. Run concurrently, the deferred re-embed can land on top of
the in-band describe's vector — or under it — with no meaning attached to the winner. The existing
file already refuses two concurrent flights for the weaker version of this reason ("two writes to
one column with no meaning attached to the winner"); the third verb joins the same lock.

**Code (complete file):**

```tsx
'use client'

import { useState } from 'react'

import { CheckIcon, SparklesIcon } from '@/components/admin/photoIcons'
import { Button, CONTROL_CLASS } from '@/components/ui'
import { ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS } from '@/lib/admin/avatars'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **The one describe control, for every photograph on the page — R3.** The stored prose rendered
 * in full and editable by hand, with the vision model one click away: always available, overwriting
 * whatever is stored, never confirming. Album rows and Media rows get the SAME component; the host
 * picks the actions, this file owns the interaction.
 *
 * ── IT IMPORTS NO SERVER ACTION ──────────────────────────────────────────────────────────────
 * `ChatPhotoDetail`'s rule for `ChatPhotoDescription`, kept because it is what makes the prop
 * renames impossible to miss: `onSave`, `onRedescribe` and `onSaveKeywords` are handed in as
 * closures by the arm that mounts this panel — `AlbumSelectionPane` or `MediaPane`, each of which
 * already knows which table its row is backed by (Phase 2's dispatcher narrowed them). A rename in
 * either action family fails at the call site in that arm, not silently inside a component that
 * guessed.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ─────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write, the distinction `MemoryTable.tsx:553-558` makes
 * in as many words for its own `+`. Commit-on-blur is right for that file (forty cells of 400
 * characters, `Escape` to revert); it is wrong for one 2000-character paragraph, where a stray blur
 * would silently store a half-finished sentence into Nina's prompt with nothing to say it happened.
 * **The keyword box obeys the same rule for the same reason**, and one more besides: an unsaved
 * keyword edit that committed on blur would re-embed the row every time the operator tabbed away.
 *
 * ── NO `<form>`, NO `router.refresh()` ────────────────────────────────────────────────────
 * `ChatPhotoDescription`'s shape and its cited reason. All three actions end in `revalidatePath`,
 * and Next 16 *"re-renders the current route server-side and includes a newly rendered RSC payload
 * in the action's response"*, so the saved (or re-described) prose arrives in the same round trip
 * and the box shows it — a `<form action={…}>` would need `useActionState` to surface the inline
 * error, which is a second error vocabulary on a screen that already has one.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ─────────────────────
 * The box shows the SERVER's prose until the operator types; once he has typed, nothing from the
 * server can overwrite him. This is what makes a re-describe safe to fire while the box holds
 * unsaved text: the fresh prose arrives in the payload and is simply not shown while his draft
 * stands — his typing is never discarded by a machine pass, and the "unsaved" marker stays honest.
 * After a successful SAVE the draft is dropped back to `null`, which is what makes the marker
 * clear itself when the saved text comes back. The host still keys the pane per selection, which
 * covers the other direction: switching tiles with unsaved text in the box. **`keywordsDraft` is a
 * second, independent draft under the identical rule** — the two boxes hold two different columns
 * and neither save may disturb the other's typing, which is also why the album has two actions and
 * not one widened one.
 *
 * ── ONE FLIGHT AT A TIME, ACROSS ALL THREE VERBS ─────────────────────────────────────────────
 * A save and a describe running concurrently would interleave two writes to one column with no
 * meaning attached to the winner, so while any of them is in flight the others are disabled (the
 * in-flight one shows the pulsing dots). R2's keyword save joins the SAME lock rather than getting
 * one of its own, and the reason is sharper than symmetry: all three verbs write
 * `description_embedding`. A keyword save nulls the vector and schedules the re-embed off the
 * response; a re-describe computes a vector in band and writes it. Run together, the deferred
 * re-embed can land on either side of the in-band write, and which one wins is not a thing the
 * operator can see or reason about. One lock makes the sequence a fact.
 *
 * A textarea is disabled during ITS OWN save — the value being written must not change under the
 * write — and every box is left ENABLED during a DESCRIBE: an 8-11 s vendor call must not lock him
 * out of typing, and the draft rule above protects whatever he types.
 *
 * ── THE KEYWORD BOX IS OPTIONAL, AND ABSENT IS NOT DISABLED ──────────────────────────────────
 * R2, 2026-09-15. `search_keywords` is a `nina_avatars` column and `nina_message_images` has no
 * counterpart, so the Media arm mounts this panel WITHOUT `onSaveKeywords` and the whole block is
 * not rendered — the same call `FileExplorer.tsx:368` makes for the search field over the Media
 * view: *"a search field over it would be a field that cannot answer — absent, not disabled."*
 *
 * ── THE FONT SIZE IS `CONTROL_CLASS`'s AND IS NOT SHRUNK ─────────────────────────────────
 * `text-base` comes from `CONTROL_CLASS` and stays. Safari zooms the viewport when a control
 * smaller than 16 px takes focus and leaves it zoomed, and the design brief makes that one of the
 * rules that beats the design. The recipe is `ChatPhotoDescription`'s, verbatim.
 */

/** What either describe verb answers with. Both action result shapes satisfy it structurally. */
export interface DescribeOutcome {
  ok: boolean
  error?: string
  note?: string
}

export function PhotoDescription({
  description,
  emptyNote,
  onSave,
  onRedescribe,
  searchKeywords = null,
  onSaveKeywords,
}: {
  /** The row's stored prose, straight from the server. `null` is "not described yet". */
  description: string | null
  /**
   * The sentence for `description === null`, worded by the host for its table — the media rows
   * fill in from `scheduleChatPhotoCaption`'s `after()` pass moments after an add or a replace;
   * album rows fill in when the photo becomes hers. The panel shows it, and only the host can
   * know which promise is true.
   */
  emptyNote: string
  /** The hand-edit write. Receives the box's current text; an empty string clears the field. */
  onSave: (text: string) => Promise<DescribeOutcome>
  /** The vision-model write. Takes nothing, overwrites everything. */
  onRedescribe: () => Promise<DescribeOutcome>
  /**
   * R2. The row's stored keyword line, or `null`. Read only when `onSaveKeywords` is given —
   * the two travel together, because a box that shows a value it cannot save is worse than no box.
   */
  searchKeywords?: string | null
  /**
   * R2. The keyword write, or ABSENT for a table that has no such column. Absent means the whole
   * block is not rendered; see the docstring. An empty string clears the field.
   */
  onSaveKeywords?: (text: string) => Promise<DescribeOutcome>
}) {
  const stored = description ?? ''
  const storedKeywords = searchKeywords ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [keywordsDraft, setKeywordsDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'describe' | 'keywords' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const text = draft ?? stored
  const dirty = draft !== null && draft !== stored
  /* Mirrors the schema's transform, which trims before it decides, so the label cannot lie. */
  const willClear = text.trim().length === 0

  const keywordsText = keywordsDraft ?? storedKeywords
  const keywordsDirty = keywordsDraft !== null && keywordsDraft !== storedKeywords
  const keywordsWillClear = keywordsText.trim().length === 0

  const save = async () => {
    if (busy !== null || !dirty) return
    setBusy('save')
    setError(null)
    setNote(null)
    try {
      const result = await onSave(text)
      if (!result.ok) {
        setError(result.error ?? 'That description did not stick.')
      } else {
        setNote(result.note ?? null)
        /* Back to "untouched", so the box follows the server again — and so the payload that
         * `revalidatePath` just produced, which carries exactly what was written, does not read as
         * an unsaved edit. */
        setDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(null)
    }
  }

  /**
   * The keyword save. `save()`'s body with its own draft and its own sentences — deliberately not
   * a shared helper parameterised over four things, which would be harder to read than the twenty
   * lines it saves and would have to explain which state each verb touches anyway.
   *
   * The description draft is NOT reset here. The two boxes are two columns, and a keyword save must
   * leave unsaved prose exactly where the operator left it — the same rule a re-describe follows
   * for the same reason.
   */
  const saveKeywords = async () => {
    if (busy !== null || !keywordsDirty || onSaveKeywords == null) return
    setBusy('keywords')
    setError(null)
    setNote(null)
    try {
      const result = await onSaveKeywords(keywordsText)
      if (!result.ok) {
        setError(result.error ?? 'Those keywords did not stick.')
      } else {
        setNote(result.note ?? null)
        setKeywordsDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(null)
    }
  }

  const redescribe = async () => {
    if (busy !== null) return
    setBusy('describe')
    setError(null)
    setNote(null)
    try {
      const result = await onRedescribe()
      if (!result.ok) {
        setError(result.error ?? 'The description call failed. Try again.')
      } else {
        setNote(result.note ?? null)
        /* The draft is deliberately LEFT AS IT IS — see the docstring: his unsaved typing survives
         * the machine pass, and the fresh prose reaches the box the moment he saves or reverts.
         * `keywordsDraft` likewise: a re-describe does not touch that column at all. */
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The description call failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-5 border-t border-rule pt-4">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
        What she can see in it
      </p>

      <textarea
        aria-label="What she can see in it"
        className={cn(CONTROL_CLASS, 'min-h-[104px] resize-y py-2 leading-relaxed')}
        value={text}
        maxLength={ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        disabled={busy === 'save'}
        placeholder="Not described yet."
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
          setNote(null)
        }}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {/*
         * R1: a check glyph, not a word. `Clear` when an emptied box would null a row that HAS
         * prose — the distinction the old label carried moves whole into the accessible name and
         * the tooltip, and stays out of the layout. Still one click, the first click; still not a
         * confirmation.
         */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          className="w-11 px-0"
          aria-label={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          title={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          loading={busy === 'save'}
          disabled={busy !== null || !dirty}
          onClick={() => void save()}
        >
          <CheckIcon className="size-4" />
        </Button>

        {/*
         * ALWAYS rendered — the null guard the pane used to put around this verb was the defect R3
         * exists to remove: a described photo with wrong prose had no way to re-run the eyes. It
         * OVERWRITES, and the accessible name says so once the row has prose; there is no
         * confirmation, because the hand-edit box above is the correction path.
         */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          className="w-11 px-0"
          aria-label={description == null ? 'Describe it' : 'Re-describe it — it overwrites'}
          title={description == null ? 'Describe it' : 'Re-describe it — it overwrites'}
          loading={busy === 'describe'}
          disabled={busy !== null}
          onClick={() => void redescribe()}
        >
          <SparklesIcon className="size-4" />
        </Button>

        <span className="text-[11px] font-medium text-ink-3 tabular-nums">
          {text.length}/{ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        </span>
        {dirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
      </div>

      {/*
       * The honest sentence about the ROW's state, kept from `ChatPhotoDescription` and kept for
       * its original reason: after an add, a replace, or a promotion this field is NULL for the
       * few seconds the `after()` describe pass takes, and then fills in on the next load. A field
       * that is merely empty would read as a permanent defect for a photograph that is about to be
       * fine. The WORDS are the host's, because which promise is true depends on the table.
       */}
      {description === null && !dirty && (
        <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">{emptyNote}</p>
      )}

      {/*
       * ── R2: THE SEARCH KEYWORDS ───────────────────────────────────────────────────────────
       * Rendered only for a table that HAS the column — see the docstring. No re-describe twin:
       * these are the operator's own words by definition, and a model that guessed them would be
       * guessing at the correction the operator came here to make.
       */}
      {onSaveKeywords != null && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Search keywords
          </p>

          <textarea
            aria-label="Search keywords"
            className={cn(CONTROL_CLASS, 'min-h-[56px] resize-y py-2 leading-relaxed')}
            value={keywordsText}
            maxLength={ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS}
            disabled={busy === 'keywords'}
            placeholder="tete, putih"
            onChange={(event) => {
              setKeywordsDraft(event.target.value)
              setError(null)
              setNote(null)
            }}
          />

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="md"
              variant="secondary"
              className="w-11 px-0"
              aria-label={
                keywordsWillClear && searchKeywords !== null
                  ? 'Clear the search keywords'
                  : 'Save the search keywords'
              }
              title={
                keywordsWillClear && searchKeywords !== null
                  ? 'Clear the search keywords'
                  : 'Save the search keywords'
              }
              loading={busy === 'keywords'}
              disabled={busy !== null || !keywordsDirty}
              onClick={() => void saveKeywords()}
            >
              <CheckIcon className="size-4" />
            </Button>

            <span className="text-[11px] font-medium text-ink-3 tabular-nums">
              {keywordsText.length}/{ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS}
            </span>
            {keywordsDirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">
            Phrases, comma-separated. They are embedded with the description, so search can find the
            photo by them — saving re-embeds the row.
          </p>
        </div>
      )}

      {/* Both lines answer an awaited write, so both are live regions — the action resolved
       * after focus already moved on (`MemoryTable`'s result-line rule). */}
      {error !== null && (
        <p role="alert" className="mt-1.5 text-[12px] font-medium text-red">
          {error}
        </p>
      )}
      {note !== null && (
        <p role="status" className="mt-1.5 text-[12px] font-medium text-ink-3">
          {note}
        </p>
      )}
    </section>
  )
}
```

**Impact:** `MediaPane.tsx` is unchanged and its suite is unaffected (no `onSaveKeywords` → no
block). Every existing `PhotoDescription.test.tsx` case still passes: none of them passes
`onSaveKeywords`, so there is exactly one `unsaved` marker, one `getByLabelText`, and the
save/describe button name regexes do not match the new button's names.

---

### Step 14: The wiring

**File:** `components/admin/explorer/SelectionPane.tsx` — two edits.

**14a. Import** (extend the existing block at lines 18-24, alphabetically):

```ts
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
  editNinaAvatarSearchKeywordsAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
```

**14b. The mount** (replace lines 402-407):

```tsx
      <PhotoDescription
        description={photo.description}
        emptyNote="She cannot talk about this photo until it is described — it fills in on its own once the photo is hers, or write it yourself."
        onSave={(text) => editNinaAvatarDescriptionAction({ id: photo.id, description: text })}
        onRedescribe={() => describeNinaAvatarAction(photo.id)}
        /* R2, 2026-09-15. The album arm supplies these; the media arm's twin mount in
         * `MediaPane.tsx` does not, because `nina_message_images` has no keywords column — absent,
         * not disabled. The two props travel together by the component's own contract. */
        searchKeywords={photo.searchKeywords}
        onSaveKeywords={(text) =>
          editNinaAvatarSearchKeywordsAction({ id: photo.id, searchKeywords: text })
        }
      />
```

Also extend the comment block directly above that mount (lines ~396-401) with one sentence:

```
       * R2 adds the keyword box to THIS arm only, and the same fact is what decides it: an album
       * row has `search_keywords`, a media row's table does not.
```

**Impact:** `SelectionPane.test.tsx` mocks `@/lib/admin/ninaAlbumActions` with an exact object, so
the new action must be added there or the import is `undefined` at render (Step 15).

---

### Step 15: The tests that move because a shape moved

These are not new coverage; they are the existing suites kept honest. New coverage is 15f–15h.

**15a. `lib/nina/queries.test.ts`** — add to `BARREL_VALUE_EXPORTS`, sorted, immediately after
`'setNinaAvatarDescriptionAndEmbedding'`:

```ts
  // nina-album-search-relevance-tools phase 2: the search_keywords writer, documented growth under
  // this file's "a name was ADDED" rule. Its twin one line up writes the other input to the same
  // derived column; see `lib/nina/queries/avatarEmbeddings.ts`'s header for why both exist.
  'setNinaAvatarSearchKeywordsAndEmbedding',
```

and append a paragraph to the docstring — leaving the existing `admin-album-semantic-search`
sentence byte-identical (it is a historical record; do not "fix" its number):

```
 *
 * nina-album-search-relevance-tools phase 2 adds `setNinaAvatarSearchKeywordsAndEmbedding`, the
 * writer for the album's second free-text input to `description_embedding`. (Phase 1 of the same
 * set adds `locateNinaAvatar`; the two are independent and land in either order.)
```

> **RECONCILED — count the array, do not quote a number, and expect Phase 1 here too.** The list
> holds **94** entries on `origin/main` @ `751e034` — counted, not inferred. The file header's own
> "85 → 92" sentence is stale prose, and this plan's first draft inherited it. **Phase 1 adds one
> name to this same list (`locateNinaAvatar`) and runs concurrently**, so neither phase may assert a
> total: whichever lands first takes it 94 → 95, the second 95 → 96. Add your one name in sorted
> position, count what you actually see, and write that. A textual git conflict here is resolved by
> **keeping both names**, sorted.

**15b. `tests/admin.albumActionsBarrel.test.ts`** — add `'editNinaAvatarSearchKeywordsAction'` to
`BARREL_ACTIONS` (sorted: between `'editNinaAvatarDescriptionAction'` and
`'ensureNinaAvatarDescriptionAction'`), and update the describe-module assertion:

```ts
it('the describe module exports exactly its four describe actions', async () => {
  const mod = await import('@/lib/admin/ninaAlbumDescribeActions')
  expect(Object.keys(mod).sort()).toEqual([
    'describeNinaAvatarAction',
    'editNinaAvatarDescriptionAction',
    'editNinaAvatarSearchKeywordsAction',
    'ensureNinaAvatarDescriptionAction',
  ])
})
```

**15c. `tests/admin.albumDescribeEmbed.test.ts`** — `avatarRow` becomes 19 values, `describeTargetRow`
becomes 6, and every hand-built `NinaAvatarDescribeTarget` literal gains `searchKeywords`.

```ts
/** `avatarColumns` in projection order — 19 values, `getNinaAvatar`'s own shape. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'folder' in overrides ? overrides.folder : '',
    'filename' in overrides ? overrides.filename : null,
    'thumbUrl' in overrides ? overrides.thumbUrl : null,
    'thumbPathname' in overrides ? overrides.thumbPathname : null,
    'width' in overrides ? overrides.width : 1792,
    'height' in overrides ? overrides.height : 2400,
    'bytes' in overrides ? overrides.bytes : 1_500_000,
    'source' in overrides ? overrides.source : 'admin',
    'cropScale' in overrides ? overrides.cropScale : null,
    'cropX' in overrides ? overrides.cropX : null,
    'cropY' in overrides ? overrides.cropY : null,
    'description' in overrides ? overrides.description : null,
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'isCurrent' in overrides ? overrides.isCurrent : false,
    'announcedAt' in overrides ? overrides.announcedAt : null,
    '2026-09-01 09:00:00+00',
  )
}

/** `describeTargetColumns` in projection order — six values. */
function describeTargetRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'description' in overrides ? overrides.description : null,
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'embedded' in overrides ? overrides.embedded : 0,
  )
}
```

Every inline target literal in this file (lines 161-167, 183-189, 200-208, 219-227, 238-246,
268-274) gains `searchKeywords: null,` after its `description` field. The assertion at line 251 and
line 311 is unchanged — with `searchKeywords: null` the combined text IS the description, which is
the property that makes every pre-existing vector still correct.

**15d. `tests/admin.albumAvatarActions.test.ts`** — the same 18→19 edit to its `avatarRow`, with the
doc comment updated to "19 values".

**15e. `tests/nina.avatarSearch.test.ts`** — the `projectedRow(...)` call at line 127 gains one
positional value after `'she is on a beach', // description`:

```ts
          'she is on a beach', // description
          null, // searchKeywords
          false, // isCurrent
```

**15f. New cases in `tests/admin.albumDescribeEmbed.test.ts`** — the four properties R2 actually
claims:

```ts
/* ── R2: the combine, the preservation, and the keywords writer ────────────────────────────── */

describe('search_keywords feed the embedding', () => {
  it('embeds description + the labelled keyword line when the row is tagged', async () => {
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'she is on a beach',
        searchKeywords: 'tete, putih',
        hasEmbedding: false,
      },
    ]

    await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(embedNinaText).toHaveBeenCalledWith('she is on a beach\n\nKeywords: tete, putih', {
      userId: USER,
    })
  })

  it('embeds the description ALONE when there are no keywords — the pre-existing vector stays valid', async () => {
    const targets = [
      {
        id: ID,
        blobUrl: BLOB_URL,
        pathname: PATHNAME,
        description: 'she is on a beach',
        searchKeywords: null,
        hasEmbedding: false,
      },
    ]

    await deferred.fillNinaAvatarDescribeTargets(USER, targets, 60_000)

    expect(embedNinaText).toHaveBeenCalledWith('she is on a beach', { userId: USER })
  })

  it('a re-describe reads the keywords, embeds with them, and never writes the column', async () => {
    fake.enqueue([avatarRow({ description: 'old prose', searchKeywords: 'tete, putih' })])
    fake.enqueue([{ id: ID }])

    const result = await actions.describeNinaAvatarAction(ID)

    expect(result.ok).toBe(true)
    expect(embedNinaText).toHaveBeenCalledWith('fresh prose\n\nKeywords: tete, putih', {
      userId: USER,
    })
    const update = fake.last()
    /* Two columns and only two: the operator's tags are structurally out of reach here. */
    expect(update.sql).not.toContain('search_keywords')
    expect(update.params).toEqual(['fresh prose', JSON.stringify(EMBEDDING), USER, ID])
  })
})

describe('editNinaAvatarSearchKeywordsAction', () => {
  it('writes the keywords and a NULL vector in ONE statement, then re-earns it', async () => {
    fake.enqueue([avatarRow({ description: 'she is on a beach', searchKeywords: null })])
    fake.enqueue([{ id: ID }])

    const result = await actions.editNinaAvatarSearchKeywordsAction({
      id: ID,
      searchKeywords: 'tete, putih',
    })

    expect(result.ok).toBe(true)
    const update = fake.last()
    expect(update.sql).toContain('update "nina_avatars"')
    expect(update.sql).toContain('search_keywords')
    expect(update.sql).not.toContain('"description" =')
    expect(update.params).toEqual(['tete, putih', null, USER, ID])
    expect(afterCallbacks).toHaveLength(1)
  })

  it('clearing the box writes NULL keywords and a NULL vector', async () => {
    fake.enqueue([avatarRow({ description: 'she is on a beach', searchKeywords: 'tete' })])
    fake.enqueue([{ id: ID }])

    const result = await actions.editNinaAvatarSearchKeywordsAction({ id: ID, searchKeywords: '  ' })

    expect(result.ok).toBe(true)
    expect(fake.last().params).toEqual([null, null, USER, ID])
  })

  it('a row with no prose schedules nothing — there is no keywords-only vector', async () => {
    fake.enqueue([avatarRow({ description: null, searchKeywords: null })])
    fake.enqueue([{ id: ID }])

    await actions.editNinaAvatarSearchKeywordsAction({ id: ID, searchKeywords: 'tete' })

    expect(afterCallbacks).toHaveLength(0)
  })

  it('refuses a keyword line past the ceiling without touching the row', async () => {
    const result = await actions.editNinaAvatarSearchKeywordsAction({
      id: ID,
      searchKeywords: 'x'.repeat(501),
    })

    expect(result.ok).toBe(false)
    expect(fake.queries).toHaveLength(0)
  })
})
```

**15g. New cases in `components/admin/explorer/PhotoDescription.test.tsx`:**

```tsx
function keywordsBox() {
  return screen.getByLabelText('Search keywords') as HTMLTextAreaElement
}
function keywordsButton() {
  return screen.getByRole('button', {
    name: /save the search keywords|clear the search keywords/i,
  })
}

describe('PhotoDescription — search keywords', () => {
  it('renders no keyword block when the host supplies no keyword save', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(screen.queryByLabelText('Search keywords')).not.toBeInTheDocument()
  })

  it('shows the stored keywords and saves the box text', async () => {
    const user = userEvent.setup()
    const onSaveKeywords = vi.fn(async () => OK)
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={onSaveKeywords}
      />,
    )
    expect(keywordsBox().value).toBe('tete')
    expect(keywordsButton()).toBeDisabled()

    await user.type(keywordsBox(), ', putih')
    expect(keywordsButton()).toBeEnabled()
    await user.click(keywordsButton())

    expect(onSaveKeywords).toHaveBeenCalledWith('tete, putih')
  })

  it('labels the keyword save as Clear once an emptied box would null stored keywords', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={vi.fn(async () => OK)}
      />,
    )
    await user.clear(keywordsBox())
    expect(
      screen.getByRole('button', { name: 'Clear the search keywords' }),
    ).toBeInTheDocument()
  })

  it('caps the keyword box at the album ceiling', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords={null}
        onSaveKeywords={vi.fn(async () => OK)}
      />,
    )
    expect(keywordsBox().maxLength).toBe(ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS)
  })

  it('a keyword save in flight locks the description save and the describe button', async () => {
    const user = userEvent.setup()
    const gate = deferred<DescribeOutcome>()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={() => gate.promise}
      />,
    )
    await user.type(textarea(), ' x')
    await user.type(keywordsBox(), ', putih')
    await user.click(keywordsButton())

    expect(saveButton()).toBeDisabled()
    expect(describeButton()).toBeDisabled()
    expect(keywordsBox()).toBeDisabled()
    /* The prose box stays editable — only the box being written is locked. */
    expect(textarea()).toBeEnabled()

    gate.resolve(OK)
  })

  it('a keyword save leaves an unsaved description draft alone', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' unsaved edit')
    await user.type(keywordsBox(), ', putih')
    await user.click(keywordsButton())
    await screen.findByRole('button', { name: /save the search keywords/i })

    expect(textarea().value).toBe('stored unsaved edit')
    expect(screen.getByText('unsaved')).toBeInTheDocument()
  })
})
```

Add `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS` to the file's imports.

**15h. `components/admin/explorer/SelectionPane.test.tsx`:**

- `albumPhoto()` gains `searchKeywords: null,` after `description: null,`.
- the `vi.hoisted` block and the `vi.mock('@/lib/admin/ninaAlbumActions', …)` object both gain
  `editNinaAvatarSearchKeywordsAction: vi.fn()` / `editNinaAvatarSearchKeywordsAction`.
- `beforeEach` gains `editNinaAvatarSearchKeywordsAction.mockReset().mockResolvedValue({ ok: true })`.
- one new case:

```tsx
  it('wires the keyword box to the album keyword action with the row id', async () => {
    const user = userEvent.setup()
    render(<SelectionPane {...baseProps()} photo={albumPhoto({ searchKeywords: 'tete' })} />)

    const box = screen.getByLabelText('Search keywords')
    await user.type(box, ', putih')
    await user.click(screen.getByRole('button', { name: /save the search keywords/i }))

    expect(editNinaAvatarSearchKeywordsAction).toHaveBeenCalledWith({
      id: 'p1',
      searchKeywords: 'tete, putih',
    })
  })
```

**15i. `components/admin/FileExplorer.test.tsx:167`** and
**`components/admin/explorer/PhotoGrid.test.tsx:24`** — each album-photo helper gains
`searchKeywords: null,`.

⚠ **`components/admin/FileExplorer.test.tsx` is co-edited by Phase 1**, which touches the
`PhotoSearchBar` mock (`:96-98`), `baseProps` (`:176-187`) and appends a `describe`. Disjoint
regions — this phase touches only the album-photo helper at `:167`. Keep both sides on any conflict;
Phase 1's new deep-link cases build their rows through that same helper and inherit
`searchKeywords: null` for free.

---

### Step 16: The backfill

**File:** `scripts/backfill-avatar-embeddings.mjs` — NEW. See D5 for the import/duplicate split.

**Code (complete file):**

```js
// Re-embed every album row that has a description, through the SAME combine-then-embed path the
// app uses.
//
//   npm run nina:backfill-embeddings                 # the whole album, writes
//   npm run nina:backfill-embeddings -- --dry-run    # read + report only, no vendor call, no write
//   npm run nina:backfill-embeddings -- --limit 20   # the oldest 20 only
//
// WRITES. Two columns' worth of truth depends on it, so unlike `scripts/album-search-probe.mjs`
// this is not a read-only instrument: it UPDATEs `nina_avatars.description_embedding`.
//
// WHY IT EXISTS: `nina-album-search-relevance-tools` R2 adds `search_keywords`, an input to the
// text that becomes the vector. Every existing row has `search_keywords = NULL`, and
// `buildNinaAvatarEmbedText` returns the description unchanged for a NULL — so every already-stored
// vector is NUMERICALLY IDENTICAL to what this run recomputes. That is the point rather than a
// disappointment: the value of this backfill is the PROOF that one combine function governs every
// vector in the table, taken once, at the moment the second input was introduced. A row whose
// keywords were written before this ran gets a genuinely new vector; a row whose keywords are NULL
// gets its own vector back, and that is what "the pipeline is uniform" means.
//
// ── WHAT IS IMPORTED AND WHAT IS DUPLICATED, AND WHY ────────────────────────────────────────
// IMPORTED: `buildNinaAvatarEmbedText` from `../lib/nina/avatarEmbedText.ts`. It is the one thing
// whose correctness this script exists to demonstrate; a local copy of the join would be testing
// its own copy. That module is deliberately zero-import so `--experimental-strip-types` can load it
// — the rule `scripts/backfill-record-keys.mjs` states and obeys.
//
// DUPLICATED (the `album-search-probe.mjs` convention): the embeddings URL, the model id, the
// vector width and the SQL. `lib/nina/embedding.ts` opens with `import 'server-only'`, reads the
// zod env group and imports `@/lib/db/schema` through a path alias; `lib/admin/ninaAlbumDeferredDescribe.ts`
// opens with `import { after } from 'next/server'`. Neither survives a plain node run. The source
// of truth for the model and the width remains `lib/nina/openrouter.ts` and
// `lib/db/schema/nina/avatars.ts` — if either migrates, this file's copy must move with it, or the
// run writes vectors into a space the album is not stored in.
//
// SEQUENTIAL, one row at a time. An album is hundreds of rows and an embedding is a sub-second
// call; a burst of parallel requests against one broker buys minutes and risks a 429 mid-run, and
// a partially-written table is exactly what this script is meant to rule out.
import { buildNinaAvatarEmbedText } from '../lib/nina/avatarEmbedText.ts'

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const limitFlag = argv.indexOf('--limit')
const limit = limitFlag === -1 ? null : Number.parseInt(argv[limitFlag + 1] ?? '', 10)
if (limitFlag !== -1 && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('--limit takes a positive integer')
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('needs DATABASE_URL — run with --env-file=.env.local')
  process.exit(1)
}
const parsed = new URL(url)
if (!parsed.host.endsWith('neon.tech')) {
  console.error(`FAIL  DATABASE_URL does not point at Neon (host: ${parsed.host})`)
  process.exit(1)
}
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey && !dryRun) {
  console.error('needs OPENROUTER_API_KEY — run with --env-file=.env.local (or pass --dry-run)')
  process.exit(1)
}

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

/* ── 1. The work ────────────────────────────────────────────────────────────────────────────
 * Oldest first, the sweep order `listNinaAvatarDescribeBacklog` uses and for its reason: a
 * repeated or interrupted run is monotone, and there is no cursor to carry. A NULL description is
 * not read at all — there is nothing to embed, and inventing prose is the describe sweep's job,
 * never this script's. */
const rows = await sql`
  select id, user_id, folder, filename, description, search_keywords
  from nina_avatars
  where description is not null
  order by created_at asc
  ${limit == null ? sql`` : sql`limit ${limit}`}
`

console.log(
  `${rows.length} row(s) carry a description${limit == null ? '' : ` (limit ${limit})`}` +
    `${dryRun ? ' — DRY RUN, nothing will be written' : ''}`,
)

/* ── 2. One embedding per row, sequentially ────────────────────────────────────────────────── */

async function embed(text) {
  const res = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, encoding_format: 'float' }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${raw.slice(0, 200)}`)
  const vector = JSON.parse(raw)?.data?.[0]?.embedding
  if (!Array.isArray(vector)) throw new Error(`embeddings returned no vector: ${raw.slice(0, 200)}`)
  /* The width guard `lib/nina/embedding.ts` argues for, restated here for the same reason: a
   * wrong-width vector is a refused INSERT deep inside a loop, not a worse ranking. */
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embeddings returned ${vector.length} values; the column is vector(${EMBEDDING_DIMENSIONS}). ` +
        'The model id and the column width must change together, with a full re-embed.',
    )
  }
  return vector
}

let embedded = 0
let failed = 0
let skipped = 0
const failures = []

for (const row of rows) {
  const where = `${row.folder === '' ? '(root)' : row.folder}/${row.filename ?? row.id}`
  const text = buildNinaAvatarEmbedText(row.description, row.search_keywords)
  const tagged = row.search_keywords != null && row.search_keywords.trim().length > 0

  if (text.trim().length === 0) {
    /* A description that is only whitespace. Nothing to embed and nothing to fix here: the row is
     * indistinguishable from an undescribed one to the model. */
    skipped += 1
    console.log(`  skip   ${row.id}  ${where}  (description is blank)`)
    continue
  }

  if (dryRun) {
    skipped += 1
    console.log(
      `  would  ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`,
    )
    continue
  }

  try {
    const vector = await embed(text)
    await sql`
      update nina_avatars
      set description_embedding = ${JSON.stringify(vector)}::vector
      where id = ${row.id} and user_id = ${row.user_id}
    `
    embedded += 1
    console.log(`  ok     ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`)
  } catch (cause) {
    failed += 1
    failures.push({ id: row.id, where, error: String(cause) })
    /* Non-fatal, the same posture the deferred worker takes: the row keeps whatever vector it had,
     * and the next run picks it up. One vendor hiccup must not abandon four hundred rows. */
    console.log(`  FAIL   ${row.id}  ${where}  ${String(cause).slice(0, 160)}`)
  }
}

/* ── 3. The counts, which are the deliverable ──────────────────────────────────────────────── */

console.log(
  `\nembedded ${embedded} · failed ${failed} · skipped ${skipped} · of ${rows.length} row(s) with a description`,
)
if (failures.length > 0) {
  console.log('failures:')
  for (const f of failures) console.log(`  ${f.id}  ${f.where}  ${f.error.slice(0, 200)}`)
}

/* A non-zero exit on failures, so a wrapper or a re-run loop can see it. A dry run is never a
 * failure. */
process.exit(failed > 0 ? 1 : 0)
```

**File:** `package.json` — add ONE line beside the other `nina:` scripts (they sit at `:31-43`). The
position inside the block is not load-bearing; this is an independent, order-insensitive addition,
not a diff that assumes anything else about the block:

```json
    "nina:backfill-embeddings": "node --experimental-strip-types --no-warnings --env-file=.env.local scripts/backfill-avatar-embeddings.mjs",
```

⚠ **Phase 3 adds `"nina:search-analysis"` to this same block.** The two lines are independent and
neither references the other. If git reports a textual conflict here, the resolution is **keep both
lines** — never drop one, and never reorder the block to "tidy" it.

**Impact:** `knip` sees a new script; it is referenced from `package.json`, which is how the other
`scripts/*.mjs` entries stay live.

---

## Verification

**Build (the union gate — typegen first, or `PageProps` errors are noise):**

```bash
cd /home/miftah/.worktrees/run-insights/nina-album-search-relevance-tools
npm run typecheck          # next typegen && tsc --noEmit
```

**Tests:**

```bash
npx vitest run \
  lib/nina/queries.test.ts \
  tests/admin.albumDescribeEmbed.test.ts \
  tests/admin.albumActionsBarrel.test.ts \
  tests/admin.albumAvatarActions.test.ts \
  tests/nina.avatarSearch.test.ts \
  components/admin/explorer/PhotoDescription.test.tsx \
  components/admin/explorer/SelectionPane.test.tsx \
  components/admin/explorer/MediaPane.test.tsx \
  components/admin/explorer/PhotoGrid.test.tsx \
  components/admin/FileExplorer.test.tsx

npm test                   # the full sweep — the projection change reaches further than the list above
```

**Guards:**

```bash
npm run lint
npm run ci:data-layer-guard      # the new writer takes userId first, as every query must
npm run ci:openrouter-guard      # the new lib module holds no vendor literal
npm run ci:schema-drift-guard    # AFTER db:migrate — proves the column is really there
```

**Migration, against the dev/prod database (this repo has ONE):**

```bash
npm run db:generate -- --name nina_avatar_search_keywords
git log origin/main -- drizzle/    # confirm nobody else took 0024 while this branch ran
npm run db:migrate
npm run ci:schema-drift-guard
```

**Backfill:**

```bash
npm run nina:backfill-embeddings -- --dry-run     # read the plan first
npm run nina:backfill-embeddings                  # then write
```

**Manual check** (`npm run dev`, `/admin/nina`):

1. Select an album photo → the rail shows **Search keywords** below the description box, empty, with
   `0/500` and a disabled check button.
2. Type `tete, putih` → the button enables, `unsaved` appears beside the keyword count only.
3. Click it → the note clears, the box follows the server, and the row is re-embedded off the
   response (visible as one `[f34]`-free round trip; a failure would print in the server log).
4. Click **Re-describe** → the prose changes, the keyword box does NOT.
5. Select a **Media** row → the keyword block is absent entirely.
6. Search for `tete` in the album search bar → the tagged photo ranks, where it did not before.

**Exit criteria:**

- `nina_avatars.search_keywords` exists in the database and `ci:schema-drift-guard` is green.
- A photo's keywords save and persist independently of its description, and clearing the box stores
  NULL.
- Saving EITHER column nulls `description_embedding` in the same UPDATE and re-earns it from the
  combined text; a tagged row's embed input is exactly
  `description + "\n\nKeywords: " + search_keywords`.
- `describeNinaAvatarAction` rewrites `description` only — asserted against generated SQL that does
  not contain `search_keywords`.
- `npm run nina:backfill-embeddings` re-embeds every row with a description through
  `buildNinaAvatarEmbedText` and prints `embedded N · failed 0 · skipped M`.
- `npm run typecheck` and `npm test` are green.

## Handoffs

- **Phase 1 — `app/admin/nina/page.tsx` (RESOLVED, stays here).** The one-line mapping addition
  (Step 12) is in a file Phase 1 owns, in a region Phase 1 does not edit. The reconciler ruled it
  stays in THIS phase: it cannot compile anywhere else, because Steps 5 and 11 — the projection and
  the type — are this phase's and must ship in the same commit. Phase 1's plan lists `:229-243`
  under its **Leaves alone**.
- **Phase 1 — two co-edited test files.** `lib/nina/queries.test.ts` (one new barrel name each;
  Step 15a) and `components/admin/FileExplorer.test.tsx` (Step 15i). Disjoint regions in both. Keep
  both sides on any conflict.
- **Phase 3 — `package.json`.** Both phases append one independent line to the `scripts` block
  (`nina:backfill-embeddings` here, `nina:search-analysis` there). Keep both on conflict.
- **Phase 1 — `AdminSearchHit`.** Unchanged by this phase, deliberately. If Phase 1 builds an
  `AlbumExplorerPhoto` from a search hit, it must pass `searchKeywords: null` (or add the field to
  `toHit` in `lib/admin/ninaAlbumSearchActions.ts`, which this phase does not touch).
- **Phase 3 — the three facts it needs**, exactly as written above: column `search_keywords`
  (`text`, nullable, drizzle field `searchKeywords`); combine format
  `description + "\n\nKeywords: " + search_keywords` when the trimmed keywords are non-empty, else
  `description` alone; and
  `embedNinaAvatarDescription(description: string, searchKeywords: string | null, userId: string)`.
  Phase 3's script may import `buildNinaAvatarEmbedText` from `../lib/nina/avatarEmbedText.ts`
  (zero-import, `--experimental-strip-types`), which is the preferred way for it to report what a
  row's embedded text actually was.
- **Not done here, deliberately (R3/out-of-scope):** no exact-match or substring boost over
  `search_keywords`, no UI for browsing by keyword, no change to `NINA_SEARCH_MIN_SCORE` or the
  text/caption weighting, no index on the new column.
- **Noted, not fixed:** `lib/nina/queries/avatarEmbeddings.ts:198-200`'s `void isNotNull` tail is
  dead weight (the import exists only for a raw-SQL template's sake). Left alone — it is a drive-by
  cleanup and belongs on its own card.

## Rollback

Code: `git revert` the phase's commit(s). Nothing in it is load-bearing for another phase, and the
reverted tree reads `description` alone exactly as it does today.

Data: **do not drop the column.** The migration is additive and nullable, so reverted code simply
stops projecting it (`avatarColumns` returns to 18 members) and the column sits inert — this is the
`drop-column-applies-after-the-deploy` rule: a `DROP COLUMN` lands after the code deploy, which is
the ordering that breaks the still-running old deployment. If the column is genuinely unwanted,
drop it in a separate, later migration once the reverting deploy is live.

Vectors: the backfill is idempotent and re-derives from current column state, so it is safe to
re-run and safe to leave un-run. Rows whose keywords were never written have a vector numerically
identical to the pre-backfill one, so a revert leaves the search ranking exactly where it was. Rows
that WERE tagged carry a vector for the combined text; after a revert their search behaviour is the
old behaviour plus the keyword words — harmless, and correctable by re-running the old describe
sweep or by clearing the keyword column.
