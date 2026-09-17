> Adopted from `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md` phase 4. Source: `.workflows/plan/media-album-unified-search/phase-4.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 4: Backfill + test coverage

**Plan set:** `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md`
**Analysis:** `20260917-091446-W0FK_code_analyzer.md`
**Satisfies:** R1 (the 112 Media originals that already exist become searchable, not just the ones written from now on), R2 (the keyword columns Phase 2 fills get a vector to ride on), R3 (the link's two invariants — one hit per photograph, one place the prose lives — are proven rather than asserted)
**Depends on:** Phase 1, Phase 2, Phase 3
**Difficulty:** NORMAL
**Package:** `app/api/admin/nina`, `scripts`, `tests`

---

## Goal

After this phase every `nina_message_images` row that already existed carries a
`description_embedding`, so R1 is true for the photographs the operator has *already* taken and not
only for the ones taken after Phase 2 shipped. A media twin of the album backfill route exists for
the rows that will keep arriving unembedded, a one-off script drains the backlog that exists today,
and the two invariants nobody's unit tests can reach — a physical photograph appearing once in a
merged search, and a pointer row's prose living in exactly one place — are covered by real-Postgres
tests plus the one operator-facing refusal Phase 2 shipped without a test.

---

## Measured ground truth (read-only, against the one Neon database, 2026-09-17)

Every number below was taken with `SELECT` only, before any code in this plan set landed. They
replace the analysis document's estimate of "154 existing Media rows", which is the raw table count
rather than the row set this phase acts on.

| Fact | Value |
|---|---|
| `nina_message_images` rows, total | 155 |
| — originals (`source_avatar_id IS NULL AND source_image_id IS NULL`) | **112** |
| — of those, `description IS NULL` | **0** |
| — of those, `description IS NOT NULL` | **112** |
| — reference rows (either provenance column set) | **43** (33 `generated`, 10 `upload`; 6 have no description) |
| originals by kind | 105 `generated`, 7 `upload` |
| `nina_avatars` rows / no description / no embedding | 70 / 0 / 0 |
| `nina_avatars` rows with `source_key LIKE 'chat-photo:%'` | 18 |
| Phase 1's four new columns present in the database | **none yet** |

Three consequences this phase is built around:

1. **The backfill needs zero vision calls today.** All 112 originals already carry `glm-4.6v` prose,
   written by `scheduleChatPhotoCaption`'s HALF ONE. The entire backlog is `missingEmbedding`, so one
   slice drains it and no row is at risk of a token-floor refusal or a second describe bill.
2. **Excluding reference rows from the backlog is load-bearing, and Phase 2 already does it.**
   There are 43 of them right now. `countNinaMessageImageDescribeBacklog` and
   `listNinaMessageImageDescribeBacklog` both carry `isOriginalPhoto()` in their `WHERE`
   (phase-2.md, §`imageEmbeddings.ts`) — **verified by reading Phase 2's code, not assumed.** Without
   it this route would spend 6 vision calls on photographs that are re-shows of images that already
   exist elsewhere, and would then report 43 rows of backlog that no run could ever legitimately
   clear. Nothing is needed here beyond not undoing it; Step 3's test pins it.
3. **`remaining` will reach exactly 0**, so the plan index's Phase 4 exit criterion is literally
   checkable rather than "explain what is left".

---

## Interface Contract

**Creates:**
- `app/api/admin/nina/backfill-media-descriptions/route.ts` — `GET` (counts, spends nothing) and
  `POST` (one slice), plus `export const maxDuration = 300`. A 1:1 mirror of
  `app/api/admin/nina/backfill-descriptions/route.ts`.
- `scripts/backfill-media-embeddings.mjs` — the one-off embed-only drain, plain node.
- `package.json` → `scripts["nina:backfill-media-embeddings"]` — one additive line.
- `tests/admin.mediaBackfillRoute.test.ts` — the route's own suite.
- `tests/integration/mediaAlbumUnifiedSearch.int.test.ts` — Invariants 3 and 4 against real Postgres.

**Deletes:** nothing.

**Renames:** nothing. **In particular `NINA_ALBUM_BACKFILL_BUDGET_MS` / `NINA_ALBUM_BACKFILL_SLICE`
are NOT renamed to a shared `NINA_*_BACKFILL_*`** — Phase 2 already settled the naming fork by
declaring media-specific twins (`NINA_MEDIA_BACKFILL_BUDGET_MS`, `NINA_MEDIA_BACKFILL_SLICE`) in
`lib/admin/ninaMediaDeferredDescribe.ts`, on `lib/admin/avatars.ts:192`'s stated ground that "the two
columns' bounds happening to agree today is not a promise that they always will." This phase consumes
those twins and renames nothing on the album side, so the album route and its suite are untouched.

**Signature changes:** none.

**Modifies (test files only — no behaviour change anywhere):**
- `tests/admin.chatPhotos.test.ts` — four new `removeChatPhotoAction` cases for the pointer refusal.
  The mock-factory line that keeps the file's eleven *existing* cases alive was **reassigned to
  Phase 2 (Step 14l)** by the reconciler, since Phase 2 is the phase that breaks without it; Step 4a
  here is now a check, not an edit. **This file is edited by two phases — Phase 2 first (three
  mechanical lines), then this phase (four cases) — and Step 4c quotes it as it looks AFTER Phase
  2's edit.**

**Requires (from earlier phases):**
- Phase 1: `nina_message_images.search_keywords`, `.negative_search_keywords`,
  `.description_embedding` (+ HNSW index); `nina_avatars.source_image_id` FK `ON DELETE RESTRICT`.
- Phase 2, exported and named exactly as its Interface Contract states — **quoted from
  phase-2.md's "To Phase 4 (backfill)" handoff, not guessed**:
  - `listNinaMessageImageDescribeBacklog(userId, limit)` and
    `countNinaMessageImageDescribeBacklog(userId)` from `@/lib/nina/queries`
  - `fillNinaMessageImageDescribeTargets(userId, targets, budgetMs)`,
    `NINA_MEDIA_BACKFILL_BUDGET_MS`, `NINA_MEDIA_BACKFILL_SLICE` from
    `@/lib/admin/ninaMediaDeferredDescribe`
  - `NinaImageDescribeTarget` projected in the order `id, blobUrl, pathname, kind, description,
    searchKeywords, embedded` (Phase 2's `imageDescribeTargetColumns`) — Step 3's fixtures are
    positional and break if this order changes.
  - `countNinaAvatarsLinkedToImage(userId, imageId)` from `@/lib/nina/queries`, called by
    `removeChatPhotoAction`, with the two refusal sentences Phase 2 wrote verbatim:
    `'An album entry shows this photo — remove it from the album first.'` and
    `` `${linked} album entries show this photo — remove them from the album first.` ``
- Phase 3: nothing. This phase imports no component and renders nothing.

**Leaves alone (owned by others):**
- `lib/db/schema/nina/*`, `drizzle/*` (Phase 1)
- `lib/nina/queries/*`, `lib/nina/*`, `lib/admin/*` (Phase 2) — **no behaviour edit of any kind**
- `components/admin/explorer/*`, `app/admin/nina/page.tsx`, and every co-located
  `components/**/*.test.tsx` (Phase 3)
- `app/api/admin/nina/backfill-descriptions/route.ts` and `tests/admin.albumDescribeEmbed.test.ts`
  (the album twin — untouched, so the album sweep keeps working exactly as it does today)
- `tests/db.schema.nina.test.ts` — **Phase 1 extends it itself** (phase-1.md says so in as many
  words: "Phase 4 must not re-add the same assertions"). This phase adds nothing there.
- `tests/admin.albumAvatarDelete.test.ts` — **Phase 2's step 14g already adds the pointer-delete
  case** (Invariant 5). Deliberately not duplicated; see Handoff H3.

---

## What Phases 1-3 already cover, and the three gaps that are left

The brief for this phase named four candidate tests. Reading the three sibling plans in full shows
two of them are already owned, one is half-owned, and one is genuinely missing — plus a fourth
problem the brief did not anticipate. Each verdict below cites the sibling step that settles it.

| Candidate | Verdict | Evidence |
|---|---|---|
| **Invariant 5** — `deleteNinaAvatarAction` on a pointer calls no `del()` / no blob release | **Already covered — do not duplicate** | phase-2.md step **14g**: "a row whose `getNinaAvatar` read returns `sourceImageId` non-null still runs the dependent promotion and still runs the row DELETE, and runs **no** `isBlobPathnameReferenced` statement and **no** `del`." |
| **Invariant 4** — a merged search never returns both a pointer Album row and its linked Media row | **Half-covered — the composition is the gap** | phase-2.md **14a** pins `"source_image_id" is null` on the album arm; **14b** pins the media arm's `NOT EXISTS` qualifier. Both are single-arm assertions over the *generated SQL*, and `tests/support/fakeDb.ts` never executes a predicate — it replays enqueued rows. Nothing anywhere proves the two predicates are **complementary**: that for one real pointer pair, exactly one of the two rows survives. That claim is about Postgres semantics, which is precisely what `tests/integration/` exists for. → **Step 5.** |
| **Invariant 3** — a keyword saved from the Album pane on a pointer row reads back on the Media row | **Half-covered — the round trip is the gap** | phase-2.md **14h** covers the write half ("the write lands on `nina_message_images`"); **14c** covers `resolveNinaAvatarLinkedText`'s statement shape. Neither reads back what the other wrote. phase-3.md's assumption **A5** flags this as "the only assumption whose failure makes shipped copy wrong rather than merely not compiling" and asks the reconciler to verify it. A round trip through one real database is the verification. → **Step 5.** |
| **`removeChatPhotoAction` refuses when a pointer names the row** | **Genuinely uncovered** | Phase 2 writes the guard (`lib/admin/chatPhotoActions.ts:623`) and asserts it in its **exit criterion 4** — but `tests/admin.chatPhotos.test.ts` appears in **neither** Phase 2's Files table nor any of its test steps 14a-14k. The behaviour ships untested. → **Step 4.** |

### The fourth problem: Phase 2 ends RED unless this is fixed

`tests/admin.chatPhotos.test.ts:420` mocks `@/lib/nina/queries` **wholesale**, with a factory that
enumerates every name it forwards:

```ts
vi.mock('@/lib/nina/queries', () => ({
  deleteNinaMessage: vi.fn(),
  deleteNinaMessageImage: vi.fn(),
  …
}))
```

A `vi.mock` factory **replaces** the module, so a name the factory omits is `undefined` for every
importer in the graph. Phase 2 adds `countNinaAvatarsLinkedToImage` to `chatPhotoActions.ts`'s import
block from that exact module and calls it inside `removeChatPhotoAction` — and does not list this test
file anywhere. The result is `TypeError: countNinaAvatarsLinkedToImage is not a function` in all
eleven existing `removeChatPhotoAction` cases, which breaks the plan's invariant 1 ("passes `vitest`
at the end of every phase") **for Phase 2, not for this one**.

**RECONCILED (2026-09-17): this finding was correct, and it has been MOVED to Phase 2.** The
factory line, the `vi.fn()` handle and the `beforeEach` default now live in **Phase 2's Step 14l**,
with `tests/admin.chatPhotos.test.ts` added to Phase 2's Files table — because Phase 2 is the phase
that must not land broken. This phase keeps the finding on the record (it is why Phase 2 has that
step at all) and keeps the four behavioural cases in Step 4c, which are genuinely this phase's:
Phase 2 adds only the minimum that keeps its own tree green and writes no case for the new refusal.

Step 4a is therefore expected to be a **no-op check** by the time this phase runs. It stays written
out so that if the phases are executed out of order, or Phase 2 lands without it, this phase can
still repair the tree rather than inheriting eleven red cases.

---

## Files

| File | Action | What changes |
|---|---|---|
| `app/api/admin/nina/backfill-media-descriptions/route.ts` | create | the media twin of the album backfill route — `GET` counts, `POST` does one slice |
| `scripts/backfill-media-embeddings.mjs` | create | the one-off embed-only drain, plain node over `DATABASE_URL` |
| `package.json` (`scripts` block, after `:38`) | modify | one additive `nina:backfill-media-embeddings` line |
| `tests/admin.mediaBackfillRoute.test.ts` | create | the route's gate, its counts, its re-read, and the reference exclusion |
| `tests/admin.chatPhotos.test.ts` (after `:1537`) | modify | four `removeChatPhotoAction` cases. The `:420` factory name and the `:1390` default are **Phase 2's Step 14l**; Step 4a only verifies they landed |
| `tests/integration/mediaAlbumUnifiedSearch.int.test.ts` | create | Invariants 3 and 4 against real Postgres |

---

## Implementation Steps

### Step 0: Make the worktree runnable

**File:** none (environment).
**Change:** measured 2026-09-17 — this worktree has **no `node_modules` and no `.env.local`**. Phase 1
declares the same Step 0; if it has already run, skip this. A **real install** is required, not a
symlink into the main checkout: a symlinked `node_modules` satisfies vitest but Turbopack's build
rejects it.

```bash
cd /home/miftah/.worktrees/run-insights/media-album-unified-search
cp /home/miftah/run-insights/.env.local .env.local
npm install
```

**Impact:** `tsc`, `vitest` and `node --env-file=.env.local` all become available. Nothing in the
repository changes (`node_modules/` and `.env.local` are both ignored).

---

### Step 1: The media backfill route

**File:** `app/api/admin/nina/backfill-media-descriptions/route.ts` (new)

**Change:** a 1:1 mirror of `app/api/admin/nina/backfill-descriptions/route.ts`, calling Phase 2's
four media exports instead of the album's.

**Why a second route file and not a query parameter on the existing one.** Judged after reading the
album route in full, as the brief asked. Three reasons, and the second is decisive:

1. The album route's `GET()` and `POST()` take **no arguments at all**. Branching on a query
   parameter means giving both handlers a `Request` parameter, which changes the signature the album
   suite already calls (`route.GET()`, `route.POST()` — `tests/admin.albumDescribeEmbed.test.ts:379`,
   `:388`, `:397`, `:411`). That is a Phase-2-owned-file edit for no gain.
2. The route's entire 66-line docstring is an argument about `nina_avatars` specifically — the
   three-way split of album rows, the album's pre-pass history, `NINA_ALBUM_BACKFILL_BUDGET_MS`'s
   derivation. A branch would make half of it false for half of its own calls.
3. `app/**/route.ts` is an entry point by file convention, so a second route costs knip nothing
   (`knip.ts`'s header lists the Next plugin's conventions among the entries it finds on its own) —
   the same argument the album route's docstring already makes for existing at all.

**Code — the complete file:**

```ts
import {
  fillNinaMessageImageDescribeTargets,
  NINA_MEDIA_BACKFILL_BUDGET_MS,
  NINA_MEDIA_BACKFILL_SLICE,
} from '@/lib/admin/ninaMediaDeferredDescribe'
import { AdminForbiddenError, forbiddenJson, requireAdminApi } from '@/lib/admin/requireAdmin'
import { UnauthorizedError, unauthorizedJson } from '@/lib/auth/requireUserId'
import {
  countNinaMessageImageDescribeBacklog,
  listNinaMessageImageDescribeBacklog,
} from '@/lib/nina/queries'

/**
 * `/api/admin/nina/backfill-media-descriptions` — the sweep that makes the MEDIA half searchable.
 *
 *     GET   how much work is left; spends nothing
 *     POST  do one slice of it
 *
 * ── WHY THIS EXISTS BESIDE THE ALBUM'S TWIN ─────────────────────────────────────────────────
 * `media-album-unified-search` R1 widens semantic search from `nina_avatars` to BOTH tables, and
 * `nina_message_images.description_embedding` is new in Phase 1. Every row that existed before that
 * migration has a NULL vector and is therefore invisible to the merged search — which is the whole
 * of R1's "every single picture in any directory", for the pictures that already exist.
 *
 * ── THE TWO HALVES SPLIT DIFFERENTLY HERE THAN THEY DO FOR THE ALBUM ────────────────────────
 * The album's backlog was mostly `missingDescription`: those rows had never been shown to a vision
 * model. This table's is not. `scheduleChatPhotoCaption` (`lib/admin/chatPhotoActions.ts`) has been
 * describing every chat photograph since 2026-09-07, so the prose is already there and only the
 * vector is missing. MEASURED 2026-09-17, before Phase 1's migration: of 112 original rows, 112
 * carry a description and 0 do not. So in practice this route embeds and does not describe, and a
 * full drain costs 112 embedding calls and zero vision calls.
 *
 * That is a fact about today's data, not a guarantee, and the route does NOT encode it: the backlog
 * read is `description IS NULL OR description_embedding IS NULL` exactly as the album's is, so a row
 * whose caption pass failed still earns a describe. Phase 2's own handoff names the standing source
 * of such rows — `setNinaMessageImageDescription` keeps its one caller in `scheduleChatPhotoCaption`
 * HALF ONE, which writes prose with no vector — so this route is a permanent tool, not a one-off.
 *
 * ── A REFERENCE ROW IS NOT BACKLOG, AND THAT IS ENFORCED ONE LAYER DOWN ─────────────────────
 * `listNinaMessageImageDescribeBacklog` and `countNinaMessageImageDescribeBacklog` both carry
 * `isOriginalPhoto()` in their WHERE (Phase 2, `lib/nina/queries/imageEmbeddings.ts`). A reference
 * row re-shows a photograph that lives elsewhere; the merged search ranks the original, never the
 * re-show, so a reference can never carry a vector of its own by design. Counting one as backlog
 * would report permanent, unfixable work forever — 43 rows of it, measured on 2026-09-17. The
 * predicate lives in the query layer rather than here for `isOriginalPhoto`'s own stated reason:
 * every statement that reads this set must read the same set by construction.
 *
 * ── THE SECURITY BOUNDARY, THE SLICE, AND THE LOOP ──────────────────────────────────────────
 * All three are the album route's, verbatim in shape: `proxy.ts` matches neither `/admin` nor
 * `/api/*`, so `requireAdminApi()` below is the only thing between the open internet and a route
 * that spends vendor money per call, and it runs FIRST, before any read. `userId` comes from the
 * session and is never read from the request. One POST does what fits in
 * `NINA_MEDIA_BACKFILL_BUDGET_MS` and reports `remaining`; it is safe to re-POST immediately and
 * safe to POST twice by accident, because the backlog read is oldest-first and the UPDATE is
 * idempotent.
 *
 *     # how big is it
 *     curl -s -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-media-descriptions
 *
 *     # drain it
 *     while :; do
 *       out=$(curl -s -X POST -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-media-descriptions)
 *       echo "$out"
 *       [ "$(printf '%s' "$out" | node -pe 'JSON.parse(require("fs").readFileSync(0)).remaining')" -gt 0 ] || break
 *     done
 *
 * For the one-off drain of the rows that exist TODAY — all of which need an embedding and none of
 * which need a describe — `npm run nina:backfill-media-embeddings` is the cheaper path and needs no
 * session at all. See that script's header for why both exist.
 */

/**
 * **300, and it must be a literal**, for `app/admin/nina/page.tsx`'s stated reason: segment config
 * is statically analysed, and the lanes below run on this route's clock — not in `after()`, because
 * this handler's whole job IS the slow work and there is no response to get out of the way of.
 * `NINA_MEDIA_BACKFILL_BUDGET_MS` (240 s) reserves 60 s under it so a describe that is in flight at
 * the deadline finishes and writes its row.
 */
export const maxDuration = 300

/** How much is left, and which half of the work it is. Reads two counts; spends nothing. */
export async function GET(): Promise<Response> {
  let userId: string
  try {
    ;({ userId } = await requireAdminApi())
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return unauthorizedJson()
    if (cause instanceof AdminForbiddenError) return forbiddenJson()
    throw cause
  }

  const backlog = await countNinaMessageImageDescribeBacklog(userId)
  return Response.json({
    ok: true,
    ...backlog,
    remaining: backlog.missingDescription + backlog.missingEmbedding,
  })
}

/** One slice. Returns what it did and what is left. */
export async function POST(): Promise<Response> {
  let userId: string
  try {
    ;({ userId } = await requireAdminApi())
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return unauthorizedJson()
    if (cause instanceof AdminForbiddenError) return forbiddenJson()
    throw cause
  }

  /*
   * Read MORE than the budget can finish (`NINA_MEDIA_BACKFILL_SLICE`), deliberately: the read is
   * one indexed statement over `nina_message_images_user_created_idx` and costs nothing next to a
   * single vendor call, and over-reading is what keeps the lanes busy right up to the deadline
   * instead of idling because the slice ran dry with two minutes left.
   */
  const targets = await listNinaMessageImageDescribeBacklog(userId, NINA_MEDIA_BACKFILL_SLICE)
  const outcome = await fillNinaMessageImageDescribeTargets(
    userId,
    targets,
    NINA_MEDIA_BACKFILL_BUDGET_MS,
  )

  /*
   * The remaining count is RE-READ, not computed from `targets.length - done`. A count derived from
   * this run's own arithmetic would be wrong the moment an add's `after()` filled a row in parallel,
   * and "how many are left" is the number the operator's loop condition reads.
   */
  const backlog = await countNinaMessageImageDescribeBacklog(userId)

  return Response.json({
    ok: true,
    ...outcome,
    ...backlog,
    remaining: backlog.missingDescription + backlog.missingEmbedding,
  })
}
```

> **Import-order note:** the four import blocks above are in the order ESLint's `import/order` rule
> produces for this repo (`@/lib/admin/*`, then `@/lib/auth/*`, then `@/lib/nina/*`), matching
> `app/api/admin/nina/backfill-descriptions/route.ts:1-8`. `npm run lint` is a gate in Step 7.

**Impact:** one new admin-gated endpoint. No existing route, action or query changes. The album
backfill route is untouched and keeps working.

---

### Step 2: The one-off drain script

**File:** `scripts/backfill-media-embeddings.mjs` (new), plus one line in `package.json`.

**Change:** the embed-only sweep, modelled directly on `scripts/backfill-avatar-embeddings.mjs`.

**Why a script as well as a route, and why the script is what actually gets run.** The brief asked me
to follow the established invocation pattern rather than invent one. There are two established
patterns in this repo and they are split by *what the work needs*:

- **A route** (`/api/admin/nina/backfill-descriptions`) when the sweep needs `describeNinaImages` —
  both it and `embedNinaText` open with `import 'server-only'` and resolve `@/` aliases, so a plain
  node process cannot load them, and a second spelling of a vendor call is what that route's own
  docstring refuses.
- **A script** (`scripts/backfill-avatar-embeddings.mjs`, `npm run nina:backfill-embeddings`) when
  the sweep is **embed-only** — it duplicates the embeddings URL, model id and vector width, with the
  duplication reasoned in its header, and imports the one thing whose correctness is the point
  (`buildNinaAvatarEmbedText`, deliberately zero-import so `--experimental-strip-types` can load it).

This phase's actual workload is the second shape exactly: 112 rows, all with prose, none needing a
vision call. Measured blocker for the route path: `.env.local` carries **no `ADMIN_EMAILS`** (checked
2026-09-17 — `lib/env.ts:180` requires it non-empty) and this repo has **no session-cookie minting
script**, so driving the route locally means supplying an admin email by hand, starting a dev server
on a non-3000 port (port 3000 is held by an unrelated process that 302s everything to `/login`), and
hand-minting an Auth.js cookie. That is a lot of ceremony for 112 embeddings the established script
pattern does without a session at all.

**Deliberate deviation from the album script's default, and why.** `backfill-avatar-embeddings.mjs`
re-embeds **every** row with a description, on purpose — it was written at the moment
`search_keywords` was introduced, and re-embedding everything was the *proof* that one combine
function governs every vector. Here the column is brand new, so every row's vector is missing and
there is nothing to prove by recomputing one; re-embedding a filled vector is pure spend. So this
script defaults to `description_embedding IS NULL` and takes `--all` to force the album script's
behaviour. The header states the difference so the two are not "fixed" into agreement.

**Code — the complete file:**

```js
// Embed every ORIGINAL media row that has a description and no vector, through the SAME
// combine-then-embed path the app uses.
//
//   npm run nina:backfill-media-embeddings                 # every row missing a vector
//   npm run nina:backfill-media-embeddings -- --dry-run    # read + report only, no vendor call, no write
//   npm run nina:backfill-media-embeddings -- --limit 20   # the oldest 20 of them
//   npm run nina:backfill-media-embeddings -- --all        # re-embed even rows that already have one
//
// WRITES. It UPDATEs `nina_message_images.description_embedding` and nothing else — it never writes
// prose, never deletes, and never touches `search_keywords`. Re-running it is safe.
//
// WHY IT EXISTS: `media-album-unified-search` R1 makes both tables searchable, and Phase 1 adds this
// column. Every row written before that migration has a NULL vector and is invisible to the merged
// search. MEASURED 2026-09-17: 112 of the 155 rows are originals, and all 112 already carry
// `glm-4.6v` prose from `scheduleChatPhotoCaption` — so the whole backlog is embed-only and this
// script can drain it without a vision model, without a session and without a dev server.
//
// WHY IT IS NOT THE ONLY SURFACE: a row whose caption pass FAILED has no prose, and inventing prose
// is a vision call this script deliberately cannot make. Those rows are skipped here and belong to
// `app/api/admin/nina/backfill-media-descriptions/route.ts`, which can describe them. There are zero
// such rows today; there will be more, because `scheduleChatPhotoCaption` HALF ONE still writes
// prose with no vector (Phase 2's handoff says so).
//
// ── THE SCOPE IS `isOriginalPhoto()`, AND IT MUST STAY THAT WAY ──────────────────────────────
// `source_avatar_id IS NULL AND source_image_id IS NULL`, matching
// `listNinaMessageImageDescribeBacklog` exactly, so this script and the route's `remaining` count
// agree about what "done" means. A REFERENCE row re-shows a photograph that lives elsewhere; the
// merged search ranks the original and never the re-show, so a reference can never carry its own
// vector by design. There are 43 of them (measured 2026-09-17) and embedding them would spend money
// on rows no query will ever rank.
//
// ── WHAT IS IMPORTED AND WHAT IS DUPLICATED, AND WHY ────────────────────────────────────────
// The split is `scripts/backfill-avatar-embeddings.mjs`'s, for its reasons, restated only where they
// differ. IMPORTED: `buildNinaAvatarEmbedText` — the one function whose correctness this script
// exists to exercise, and the reason a media vector is comparable to an album vector at all (the
// merged ranking rests on both corpora being embedded from the same text shape). It is deliberately
// zero-import so `--experimental-strip-types` can load it. DUPLICATED: the embeddings URL, the model
// id, the vector width and the SQL, because `lib/nina/embedding.ts` opens with `import 'server-only'`
// and neither it nor the deferred worker survives a plain node run. If the model or the width
// migrates, this file's copy must move with it.
//
// SEQUENTIAL, one row at a time — a burst against one broker buys minutes and risks a 429 mid-run.
import { buildNinaAvatarEmbedText } from '../lib/nina/avatarEmbedText.ts'

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const all = argv.includes('--all')
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
 * Oldest first, the sweep order `listNinaMessageImageDescribeBacklog` uses and for its reason: a
 * repeated or interrupted run is monotone and there is no cursor to carry. A NULL description is not
 * read at all — there is nothing to embed, and inventing prose is the route's job, never this
 * script's. */
const rows = await sql`
  select id, user_id, kind, description, search_keywords
  from nina_message_images
  where source_avatar_id is null
    and source_image_id is null
    and description is not null
    ${all ? sql`` : sql`and description_embedding is null`}
  order by created_at asc
  ${limit == null ? sql`` : sql`limit ${limit}`}
`

console.log(
  `${rows.length} original row(s) with prose and ${all ? 'any' : 'no'} vector` +
    `${limit == null ? '' : ` (limit ${limit})`}` +
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
  /* The width guard `lib/nina/embedding.ts` argues for, restated for the same reason: a wrong-width
   * vector is a refused UPDATE deep inside a loop, not a worse ranking. */
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
  const where = `${row.kind}/${row.id}`
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
    console.log(`  would  ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`)
    continue
  }

  try {
    const vector = await embed(text)
    await sql`
      update nina_message_images
      set description_embedding = ${JSON.stringify(vector)}::vector
      where id = ${row.id} and user_id = ${row.user_id}
    `
    embedded += 1
    console.log(`  ok     ${row.id}  ${where}  ${text.length} chars${tagged ? '  +keywords' : ''}`)
  } catch (cause) {
    failed += 1
    failures.push({ id: row.id, where, error: String(cause) })
    /* Non-fatal, the same posture the deferred worker takes: the row keeps whatever vector it had,
     * and the next run picks it up. One vendor hiccup must not abandon a hundred rows. */
    console.log(`  FAIL   ${row.id}  ${where}  ${String(cause).slice(0, 160)}`)
  }
}

/* ── 3. The counts, which are the deliverable ──────────────────────────────────────────────── */

console.log(
  `\nembedded ${embedded} · failed ${failed} · skipped ${skipped} · of ${rows.length} candidate row(s)`,
)
if (failures.length > 0) {
  console.log('failures:')
  for (const f of failures) console.log(`  ${f.id}  ${f.where}  ${f.error.slice(0, 200)}`)
}

/* A non-zero exit on failures, so a wrapper or a re-run loop can see it. A dry run is never a
 * failure. */
process.exit(failed > 0 ? 1 : 0)
```

**Code — the `package.json` edit.** One additive line in the `scripts` block, immediately after
`nina:backfill-embeddings` (`package.json:38`). Position is not load-bearing; adjacency to its twin
is the only reason for this spot.

```json
    "nina:backfill-embeddings": "node --experimental-strip-types --no-warnings --env-file=.env.local scripts/backfill-avatar-embeddings.mjs",
    "nina:backfill-media-embeddings": "node --experimental-strip-types --no-warnings --env-file=.env.local scripts/backfill-media-embeddings.mjs",
```

**Impact:** a new npm script. No existing script changes. `knip` sees `scripts/*.mjs` through the
`package.json` entry, as it does the six existing ones.

---

### Step 3: The route's own suite

**File:** `tests/admin.mediaBackfillRoute.test.ts` (new)

**Why this filename.** `tests/admin.mediaDescribeEmbed.test.ts` is **taken by Phase 2** (its step
14d, for `ninaMediaDeferredDescribe.ts`). This file covers only the route, so it is named for the
route.

**Change:** the album route suite's posture, verbatim — real query functions against
`tests/support/fakeDb.ts`, with only the edges mocked.

**Code — the complete file:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `media-album-unified-search` phase 4's route: `/api/admin/nina/backfill-media-descriptions`.
 *
 * Posture is `tests/admin.albumDescribeEmbed.test.ts`'s route block, one table over: the real
 * `listNinaMessageImageDescribeBacklog` / `countNinaMessageImageDescribeBacklog` /
 * `fillNinaMessageImageDescribeTargets` run against the recording driver, so the assertions are
 * about GENERATED SQL and execution order rather than about spies. Only the edges are mocked —
 * `requireAdminApi`, `next/server`'s `after`, `@/lib/nina/vision` and `@/lib/nina/embedding`.
 *
 * The album route has its own suite and is not re-tested here.
 */

const USER = 'usr123XYZ_-9'
const ID = 'img123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/selfie-${ID}-Tu6HvWq2m0k3rB8nQ1zXeRfYdGjL.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`
/** A stand-in vector. Its length is irrelevant here; only its identity is asserted. */
const EMBEDDING = [0.1, 0.2, 0.3]

const requireAdminApi = vi.fn()
const describeNinaImages = vi.fn()
const embedNinaText = vi.fn()

class AdminForbiddenError extends Error {}
class UnauthorizedError extends Error {}

vi.mock('@/lib/admin/requireAdmin', () => ({
  requireAdmin: vi.fn(),
  requireAdminApi: () => requireAdminApi(),
  forbiddenJson: () => Response.json({ error: 'Not found' }, { status: 404 }),
  AdminForbiddenError,
}))
vi.mock('@/lib/auth/requireUserId', () => ({
  UnauthorizedError,
  unauthorizedJson: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}))
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    void cb
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/nina/vision', () => ({
  describeNinaImages: (...args: unknown[]) => describeNinaImages(...args),
}))
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))

type Route = typeof import('@/app/api/admin/nina/backfill-media-descriptions/route')
let route: Route
let fake: FakeDb

/**
 * Phase 2's `imageDescribeTargetColumns` in projection order — SEVEN values. The album twin has six;
 * the extra one is `kind`, which is what lets the media worker pick the vision witness per row.
 */
function describeTargetRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'kind' in overrides ? overrides.kind : 'generated',
    'description' in overrides ? overrides.description : null,
    'searchKeywords' in overrides ? overrides.searchKeywords : null,
    'embedded' in overrides ? overrides.embedded : 0,
  )
}

beforeEach(async () => {
  vi.resetModules()
  requireAdminApi.mockReset().mockResolvedValue({ userId: USER, email: 'ops@example.com' })
  describeNinaImages
    .mockReset()
    .mockResolvedValue({ description: 'fresh prose', completionTokens: 60 })
  embedNinaText.mockReset().mockResolvedValue(EMBEDDING)
  fake = installFakeDb()
  route = await import('@/app/api/admin/nina/backfill-media-descriptions/route')
})

afterEach(() => {
  vi.useRealTimers()
  uninstallFakeDb()
  vi.resetModules()
})

/* ── the gate, and it runs before anything is read ─────────────────────────────────────────── */

describe('/api/admin/nina/backfill-media-descriptions — the gate', () => {
  it('refuses before it reads — a signed-in non-admin gets the same 404 the pages give', async () => {
    requireAdminApi.mockRejectedValue(new AdminForbiddenError())

    const res = await route.POST()

    expect(res.status).toBe(404)
    expect(fake.queries).toHaveLength(0)
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('refuses before it reads — a signed-out caller gets a 401, not a redirect to HTML', async () => {
    requireAdminApi.mockRejectedValue(new UnauthorizedError())

    const res = await route.GET()

    expect(res.status).toBe(401)
    expect(fake.queries).toHaveLength(0)
  })

  it('declares the 300 s ceiling as a literal, so segment config can be statically analysed', () => {
    expect(route.maxDuration).toBe(300)
  })
})

/* ── GET: two counts, one statement, no vendor call ───────────────────────────────────────── */

describe('GET', () => {
  it('spends nothing — one statement, neither vendor mock called', async () => {
    fake.enqueue([projectedRow(3, 2)]) // countNinaMessageImageDescribeBacklog

    const res = await route.GET()
    const body = (await res.json()) as Record<string, unknown>

    expect(body).toEqual({ ok: true, missingDescription: 3, missingEmbedding: 2, remaining: 5 })
    expect(fake.queries).toHaveLength(1)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('counts the MEDIA table, and excludes a reference row from the backlog', async () => {
    fake.enqueue([projectedRow(0, 0)])

    await route.GET()

    const count = fake.only()
    expect(count.sql).toContain('from "nina_message_images"')
    expect(count.sql).not.toContain('"nina_avatars"')
    /*
     * The `isOriginalPhoto()` arm, asserted as a PRESENCE. Without it the 43 reference rows this
     * table holds (measured 2026-09-17) would be permanent, unfixable backlog: the merged search
     * ranks the original a reference re-shows, never the re-show, so a reference can never earn a
     * vector of its own. This assertion is the whole reason the count can reach zero.
     */
    expect(count.sql).toContain('"source_avatar_id" is null')
    expect(count.sql).toContain('"source_image_id" is null')
  })
})

/* ── POST: the slice, the lanes, and the re-read ──────────────────────────────────────────── */

describe('POST', () => {
  it('re-reads `remaining` rather than deriving it — the count runs AFTER the lanes', async () => {
    fake.enqueue([describeTargetRow({ description: 'already written', embedded: 0 })]) // backlog
    fake.enqueue([{ id: ID }]) // setNinaMessageImageDescriptionAndEmbedding RETURNING
    fake.enqueue([projectedRow(1, 0)]) // the count, taken AFTER the lanes

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(body.remaining).toBe(1)
    expect(fake.queries[0]?.sql).toContain('from "nina_message_images"') // the backlog read, first
    expect(fake.queries.at(-1)?.sql).toContain('count(*)') // the re-read count, last
  })

  it('embeds a row that already has prose, and never asks the vision model', async () => {
    /*
     * This is the shape of the ENTIRE backlog as it exists today: measured 2026-09-17, all 112
     * original media rows carry `glm-4.6v` prose from `scheduleChatPhotoCaption` and none lacks it.
     * A full drain is therefore embeddings only — no vision spend, no token-floor exposure.
     */
    fake.enqueue([describeTargetRow({ description: 'she is underwater in fins', embedded: 0 })])
    fake.enqueue([{ id: ID }])
    fake.enqueue([projectedRow(0, 0)])

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).toHaveBeenCalledWith('she is underwater in fins', { userId: USER })
    expect(body.remaining).toBe(0)
    expect(body.described).toBe(0)
    expect(body.embedded).toBe(1)
  })

  it('reports a drained backlog as exactly zero, which is the operator loop condition', async () => {
    fake.enqueue([]) // nothing left to do
    fake.enqueue([projectedRow(0, 0)])

    const res = await route.POST()
    const body = (await res.json()) as Record<string, unknown>

    expect(body).toMatchObject({ ok: true, remaining: 0, missingDescription: 0, missingEmbedding: 0 })
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(embedNinaText).not.toHaveBeenCalled()
  })

  it('the backlog read is the MEDIA table, capped by the media slice constant', async () => {
    fake.enqueue([])
    fake.enqueue([projectedRow(0, 0)])

    await route.POST()

    const read = fake.queries[0]
    expect(read?.sql).toContain('from "nina_message_images"')
    expect(read?.sql).toContain('"source_avatar_id" is null')
    expect(read?.sql).toContain('"source_image_id" is null')
    /* oldest-first, so a repeated slice is monotone and carries no cursor */
    expect(read?.sql).toContain('order by')
    expect(read?.params).toContain(200)
  })
})
```

> **CONFIRMED by the reconciler (2026-09-17): Phase 2 declares `NINA_MEDIA_BACKFILL_SLICE = 200`**
> (and `NINA_MEDIA_BACKFILL_BUDGET_MS = 240_000`), both in `lib/admin/ninaMediaDeferredDescribe.ts`,
> under exactly those names. The `200` literal above is correct and stays pinned deliberately: the
> slice is the one number an operator reasons about when a drain stalls.

**Impact:** new coverage only.

---

### Step 4: Close Phase 2's untested refusal — and keep its suite green

**File:** `tests/admin.chatPhotos.test.ts` (modify, three edits)

**Change 4a — the mock-factory name. RECONCILED: THIS NOW BELONGS TO PHASE 2, AND SHOULD ALREADY BE
DONE WHEN YOU GET HERE.**

The reconciler moved this edit into **Phase 2's Step 14l** — Phase 2 is the phase whose tree goes red
without it, and invariant 1 requires `vitest` green at the end of *every* phase, so the fix has to
land with the change that causes the breakage rather than two phases later. Phase 2's Files table now
lists `tests/admin.chatPhotos.test.ts` for exactly these three lines (the `vi.fn()` handle, the
factory entry, and the `beforeEach` default).

**So: open the file and check first.** If the three lines below are already present — the expected
outcome — change nothing and go straight to 4c, which is this phase's real work. If Phase 2 landed
without them (a green-tree failure that would have shown up as eleven red
`removeChatPhotoAction` cases), add them here; they are reproduced below unchanged so this phase can
still stand alone.

Add one handle beside the others (the block at `:386-410`, alphabetical neighbourhood of
`getNinaMessageImage`):

```ts
const countNinaAvatarsLinkedToImage = vi.fn()
```

and one forwarding entry inside the existing `vi.mock('@/lib/nina/queries', …)` factory (`:420`),
keeping the factory's alphabetical order — it goes first, before `deleteNinaMessage`:

```ts
vi.mock('@/lib/nina/queries', () => ({
  countNinaAvatarsLinkedToImage: (...args: unknown[]) => countNinaAvatarsLinkedToImage(...args),
  deleteNinaMessage: vi.fn(),
  deleteNinaMessageImage: vi.fn(),
  findNinaImageByContentHash: (...args: unknown[]) => findNinaImageByContentHash(...args),
  getNinaMessageImage: (...args: unknown[]) => getNinaMessageImage(...args),
  getNinaMessageImagesForMessages: vi.fn(),
  getNinaMessagesByIds: vi.fn(),
  insertNinaMessageImages: (...args: unknown[]) => insertNinaMessageImages(...args),
  insertNinaMessages: (...args: unknown[]) => insertNinaMessages(...args),
  isBlobPathnameReferenced: vi.fn(),
  readNinaTuning: (...args: unknown[]) => readNinaTuning(...args),
  setNinaMessageImageDescription: (...args: unknown[]) => setNinaMessageImageDescription(...args),
  updateNinaChatPhotoBlob: (...args: unknown[]) => updateNinaChatPhotoBlob(...args),
  updateNinaChatPhotoDescription: (...args: unknown[]) => updateNinaChatPhotoDescription(...args),
  updateNinaChatPhotoPerceptualSignature: (...args: unknown[]) =>
    updateNinaChatPhotoPerceptualSignature(...args),
  updateNinaMessage: (...args: unknown[]) => updateNinaMessage(...args),
}))
```

**Change 4b — the default.** In the `removeChatPhotoAction` section's own `beforeEach` (`:1390-1401`),
add one line beside the other defaults. Zero is "no album entry points at this photograph", which is
what every pre-existing case in the section assumes:

```ts
  countNinaAvatarsLinkedToImage.mockResolvedValue(0)
```

**Change 4c — the four new cases.** Insert them immediately after the existing
`'a REFERENCE row is refused above the carrier load — even an orphaned one'` case (ends `:1537`), so
the two refusals read in the order the function evaluates them.

```ts
  /*
   * `media-album-unified-search` R3. Since the promotion became a LINK, a `nina_avatars` row can
   * name this row through `source_image_id` and show its object without owning a byte. The FK is
   * `ON DELETE RESTRICT`, so Postgres refuses the delete either way; the check the action makes
   * turns that into the sentence shape the operator already knows from `deleteNinaAvatarAction`'s
   * "That is her current photo — make another one current first."
   *
   * These four cases exist because phase 2 shipped the guard and its exit criterion without a test
   * for either — `tests/admin.chatPhotos.test.ts` appears in none of its test steps.
   */
  it('refuses when an album entry still points at the photograph, and measures nothing first', async () => {
    countNinaAvatarsLinkedToImage.mockResolvedValue(1)

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({
      ok: false,
      error: 'An album entry shows this photo — remove it from the album first.',
    })
    /* Nothing may be measured, promoted or deleted on behalf of a remove that is not going to
     * happen — `isChatPhotoReference`'s stated rule, one refusal over. */
    expect(promoteNinaImageDependents).not.toHaveBeenCalled()
    expect(deleteNinaMessage).not.toHaveBeenCalled()
    expect(deleteNinaMessageImage).not.toHaveBeenCalled()
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
  })

  it('pluralises the refusal, and names the count, when several album entries point at it', async () => {
    countNinaAvatarsLinkedToImage.mockResolvedValue(3)

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({
      ok: false,
      error: '3 album entries show this photo — remove them from the album first.',
    })
    expect(deleteNinaMessageImage).not.toHaveBeenCalled()
  })

  it('a zero count is NOT a refusal — the ordinary remove still runs to completion', async () => {
    countNinaAvatarsLinkedToImage.mockResolvedValue(0)

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toMatchObject({ ok: true, id: IMAGE_ID })
    expect(countNinaAvatarsLinkedToImage).toHaveBeenCalledWith(USER, IMAGE_ID)
    expect(releaseBlobIfUnreferenced).toHaveBeenCalledTimes(1)
  })

  it('a REFERENCE row never reaches the pointer count — the cheaper refusal is first', async () => {
    getNinaMessageImage.mockResolvedValue({
      ...imageRow,
      messageId: null,
      sourceAvatarId: 'avaOrigin12',
    })

    const result = await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(result).toEqual({
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Remove the original instead.',
    })
    expect(countNinaAvatarsLinkedToImage).not.toHaveBeenCalled()
  })
```

**Impact:** the file's existing eleven `removeChatPhotoAction` cases go from broken-by-Phase-2 to
passing, and the guard Phase 2's exit criterion 4 claims is now actually asserted — including the
ordering claim (reference refusal before pointer count) that its docstring makes.

---

### Step 5: Invariants 3 and 4, against a real Postgres

**File:** `tests/integration/mediaAlbumUnifiedSearch.int.test.ts` (new)

**Why an integration test and not a unit test.** This is the honest answer to the brief's "even if
mocked at the DB layer" allowance. `tests/support/fakeDb.ts` is a **recording** driver: it returns
enqueued rows and never evaluates a `WHERE`. A unit test that enqueues one album row and one media
row and then asserts "only one came back" would be asserting what the test itself enqueued — it
would pass against a build with both predicates deleted. Phase 2's 14a and 14b already pin each
predicate's *text* individually, which is the most a fake driver can honestly prove; what is left is
whether the two are **complementary**, and that is a claim about Postgres. `tests/integration/`
exists for exactly this, and says so: *"These are the assertions the recording fake cannot make."*

**How it is safe against the shared database.** `tests/integration/hrMax.int.test.ts`'s pattern,
followed exactly: skipped entirely unless `TEST_DATABASE_URL` is set (so `npm test` never touches a
database), every row hangs off one throwaway user whose id carries a unique suffix, and `afterAll`
deletes that user. **`DATABASE_URL` is never used as a fallback** — this repo has one database and it
is production, so an accidental default would write production rows.

**The cleanup order is load-bearing, and it is a real finding.** Phase 1's
`nina_avatars.source_image_id` is `ON DELETE RESTRICT`. Deleting the user cascades to *both*
`nina_avatars` and `nina_message_images` through their own `user_id` FKs, and Postgres does not
specify which cascading table it processes first. If `nina_message_images` goes first while a pointer
`nina_avatars` row still names one of its rows, RESTRICT fires and the whole delete errors. So
`afterAll` deletes the pointer avatar rows **explicitly, first**. See Handoff H4 — the same hazard
exists for real account deletion and is not this phase's to fix.

**Code — the complete file:**

```ts
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * `media-album-unified-search` invariants 3 and 4, against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled neon url> npm run test:int
 *
 * Skipped entirely without `TEST_DATABASE_URL`, so `npm test` never touches a database, and
 * `DATABASE_URL` is deliberately NOT a fallback: this repo has exactly one database and it is
 * production. Safe against a shared database the way `tests/integration/hrMax.int.test.ts` is —
 * every row hangs off one throwaway user with a unique suffix, removed in `afterAll`.
 *
 * ── WHAT THESE TWO CASES PROVE THAT THE UNIT SUITES CANNOT ──────────────────────────────────
 * `tests/support/fakeDb.ts` records statements and replays enqueued rows; it never evaluates a
 * predicate. So phase 2's `tests/nina.mediaSearch.test.ts` and `tests/nina.avatarSearch.test.ts` can
 * prove that each arm's WHERE contains the right text, and nothing more. Whether the two arms are
 * COMPLEMENTARY — whether exactly one of a linked pair survives — is a question about Postgres, and
 * so is whether a write through the album redirect is readable back from the media row. Both are
 * asked here, once, against the real thing.
 *
 * Invariant 4: "Every physical photograph appears in a merged search result at most once."
 * Invariant 3: "A pointer row never independently stores description/keywords; every read and every
 *               write for a pointer redirects to its linked Media row."
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const USER = `mau-u1-${SUFFIX}`
const IMAGE_ID = `mau-img-${SUFFIX}`
const POINTER_ID = `mau-ptr-${SUFFIX}`
const PLAIN_ID = `mau-alb-${SUFFIX}`

const STORE = 'https://example.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/selfie-${IMAGE_ID}.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`

/**
 * A 1536-wide unit vector pointing at axis 0, and a second one pointing at axis 1. Cosine distance
 * between them is 1.0, and between either and itself is 0.0 — so "which row ranks first" is decided
 * by construction and not by a model.
 */
function axisVector(axis: number): number[] {
  return Array.from({ length: 1536 }, (_, i) => (i === axis ? 1 : 0))
}
const QUERY_VECTOR = axisVector(0)

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type Queries = typeof import('@/lib/nina/queries')

let db: Db
let s: Schema
let q: Queries

beforeAll(async () => {
  if (!enabled) return
  vi.resetModules()
  ;({ db } = await import('@/lib/db/index'))
  s = await import('@/lib/db/schema')
  q = await import('@/lib/nina/queries')

  await db.insert(s.users).values({ id: USER, email: `${USER}@example.test` })

  /* The MEDIA original: a real photograph, described, embedded on axis 0 so the query vector
   * matches it exactly. */
  await db.insert(s.ninaMessageImages).values({
    id: IMAGE_ID,
    userId: USER,
    messageId: null,
    kind: 'generated',
    blobUrl: BLOB_URL,
    pathname: PATHNAME,
    description: 'she is underwater in a black swimsuit and fins',
    descriptionEmbedding: axisVector(0),
  })

  /* The POINTER: an album row that borrows those bytes and stores none of its own prose. This is
   * what `linkChatPhotoIntoAlbum` writes — same blob_url, same pathname, NULL description, NULL
   * keywords, NULL vector, and `source_image_id` naming the media row. */
  await db.insert(s.ninaAvatars).values({
    id: POINTER_ID,
    userId: USER,
    blobUrl: BLOB_URL,
    pathname: PATHNAME,
    folder: '',
    sourceKey: `chat-photo:${IMAGE_ID}`,
    sourceImageId: IMAGE_ID,
    description: null,
    searchKeywords: null,
    negativeSearchKeywords: null,
    descriptionEmbedding: null,
  })

  /* An ORDINARY album row, on axis 1 — the control. It must keep ranking exactly as it does today,
   * which is what proves the merge did not simply disable the album arm. */
  await db.insert(s.ninaAvatars).values({
    id: PLAIN_ID,
    userId: USER,
    blobUrl: `${STORE}/nina/${USER}/avatar-${PLAIN_ID}.jpg`,
    pathname: `nina/${USER}/avatar-${PLAIN_ID}.jpg`,
    folder: '',
    description: 'she is on a beach at sunset',
    descriptionEmbedding: axisVector(1),
  })
})

afterAll(async () => {
  if (!enabled) return
  /*
   * ORDER IS LOAD-BEARING. `nina_avatars.source_image_id` is ON DELETE RESTRICT, and deleting the
   * user cascades to BOTH tables through their own user_id FKs in an order Postgres does not
   * specify. If the images go first while the pointer still names one, RESTRICT fires and the whole
   * cleanup errors. Dropping the pointer explicitly first makes the cascade unambiguous.
   */
  await db.delete(s.ninaAvatars).where(eq(s.ninaAvatars.userId, USER))
  await db.delete(s.users).where(eq(s.users.id, USER))
})

describe.skipIf(!enabled)('invariant 4 — one physical photograph, at most one hit', () => {
  it('ranks the MEDIA original and never its album pointer, for a query that matches both bytes', async () => {
    const page = await q.searchNinaPhotosByText(USER, QUERY_VECTOR, null)

    const forThisPhoto = page.rows.filter(
      (row) => row.id === IMAGE_ID || row.id === POINTER_ID,
    )

    /* THE INVARIANT, as a count. Two rows in two tables describe one physical photograph; exactly
     * one of them may be a hit. */
    expect(forThisPhoto).toHaveLength(1)
    expect(forThisPhoto[0]?.id).toBe(IMAGE_ID)
    expect(forThisPhoto[0]?.origin).toBe('media')
  })

  it('the pointer is excluded because it is a pointer, not because it has no vector', async () => {
    /*
     * The sharper form of the same claim, and the one a future "optimisation" would break. Give the
     * pointer a real vector on the matching axis — a state the app never writes, and the database
     * happily accepts — and it must STILL be excluded, because the album arm's predicate is
     * `source_image_id IS NULL` and not merely `description_embedding IS NOT NULL`.
     */
    await db
      .update(s.ninaAvatars)
      .set({ descriptionEmbedding: axisVector(0), description: 'a copy of the prose' })
      .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))

    try {
      const page = await q.searchNinaPhotosByText(USER, QUERY_VECTOR, null)
      expect(page.rows.map((row) => row.id)).not.toContain(POINTER_ID)
      expect(page.rows.map((row) => row.id)).toContain(IMAGE_ID)
    } finally {
      await db
        .update(s.ninaAvatars)
        .set({ descriptionEmbedding: null, description: null })
        .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))
    }
  })

  it('an ordinary album row still ranks — the merge did not disable the album arm', async () => {
    const page = await q.searchNinaPhotosByText(USER, axisVector(1), null)

    const ids = page.rows.map((row) => row.id)
    expect(ids).toContain(PLAIN_ID)
    expect(page.rows.find((row) => row.id === PLAIN_ID)?.origin).toBe('album')
  })
})

describe.skipIf(!enabled)('invariant 3 — the pointer stores nothing, so one edit is one truth', () => {
  it('a keyword saved through the ALBUM id lands on the MEDIA row, and reads back from both', async () => {
    /*
     * The round trip phase 3's assumption A5 calls "the only assumption whose failure makes shipped
     * copy wrong rather than merely not compiling": the pane tells the operator that editing here
     * edits the original. Phase 2's unit tests prove the write targets `nina_message_images`; this
     * proves the value is then READABLE as that album row's own keywords.
     */
    await q.setNinaMessageImageSearchKeywordsAndEmbedding(USER, IMAGE_ID, 'fins, biru', null)

    const linked = await q.resolveNinaAvatarLinkedText(USER, [
      { id: POINTER_ID, sourceImageId: IMAGE_ID },
    ])

    expect(linked.get(POINTER_ID)?.searchKeywords).toBe('fins, biru')
    expect(linked.get(POINTER_ID)?.description).toBe(
      'she is underwater in a black swimsuit and fins',
    )

    /* And the pointer row itself still stores nothing — the other half of the invariant. */
    const [stored] = await db
      .select({
        description: s.ninaAvatars.description,
        searchKeywords: s.ninaAvatars.searchKeywords,
        negativeSearchKeywords: s.ninaAvatars.negativeSearchKeywords,
        hasVector: sql<number>`(${s.ninaAvatars.descriptionEmbedding} is not null)::int`.mapWith(
          Number,
        ),
      })
      .from(s.ninaAvatars)
      .where(and(eq(s.ninaAvatars.userId, USER), eq(s.ninaAvatars.id, POINTER_ID)))

    expect(stored).toEqual({
      description: null,
      searchKeywords: null,
      negativeSearchKeywords: null,
      hasVector: 0,
    })
  })

  it('the FK refuses to let the original leave while the pointer names it', async () => {
    /*
     * ON DELETE RESTRICT, as the database's own answer rather than the action's sentence.
     * `removeChatPhotoAction`'s friendly refusal is tested in `tests/admin.chatPhotos.test.ts`; this
     * is the backstop underneath it, which is what makes that check a courtesy rather than the only
     * thing standing between the operator and a pointer with no bytes.
     */
    await expect(
      db
        .delete(s.ninaMessageImages)
        .where(and(eq(s.ninaMessageImages.userId, USER), eq(s.ninaMessageImages.id, IMAGE_ID))),
    ).rejects.toThrow()

    /* And the count the action reads agrees with the constraint. */
    await expect(q.countNinaAvatarsLinkedToImage(USER, IMAGE_ID)).resolves.toBe(1)
  })
})
```

> **Both contract points CONFIRMED by the reconciler (2026-09-17), against phase-2.md's own code
> blocks — the file above is correct as written.** (a) `resolveNinaAvatarLinkedText(userId, rows)`
> takes `readonly { id: string; sourceImageId: string | null }[]` and returns
> `Map<avatarId, NinaLinkedPhotoText>` keyed by the AVATAR id, so the call above
> (`[{ id: POINTER_ID, sourceImageId: IMAGE_ID }]`, then `linked.get(POINTER_ID)`) matches exactly.
> (b) `searchNinaPhotosByText(userId, queryEmbedding, queryText = null, opts = {})` — the third
> parameter is the typed query and defaults to `null`, matching `runSearch`.
>
> One addition the reconciler made elsewhere that this file should know about: **Phase 3's
> `app/admin/nina/page.tsx` now calls `resolveNinaAvatarLinkedText` explicitly** (it was assuming the
> redirect happened inside `listNinaAvatarsInFolder`, which it does not). That makes the first
> invariant-3 case here the direct unit-level proof of the read path the page depends on, which is a
> stronger reason for it to exist than when it was written.

**Impact:** new coverage only, excluded from `npm test` by `vitest.config.ts` unless
`VITEST_INTEGRATION=1`.

---

### Step 6: Run the backfill, and confirm it from the database

**File:** none — an operation.

**Change:** drain the 112-row backlog and verify by counting, not by reading the run's own summary.

**Why this is safe to actually execute.** It is additive and idempotent: it fills NULL
`description_embedding` columns from prose that already exists. It writes no description, deletes
nothing, and touches no other column. Re-running it is free.

**Before running — confirm the database is the one you think it is.** `.env.local`'s `DATABASE_URL`
is production; there is no separate dev database. The script refuses a non-Neon host, but confirm the
host by eye first:

```bash
cd /home/miftah/.worktrees/run-insights/media-album-unified-search
node --env-file=.env.local -e "console.log(new URL(process.env.DATABASE_URL).host)"
```

**Then dry-run, then run:**

```bash
npm run nina:backfill-media-embeddings -- --dry-run     # expect ~112 "would" lines, zero writes
npm run nina:backfill-media-embeddings                  # expect "embedded 112 · failed 0"
```

**Confirm from the database, read-only.** The run's own summary is not the verification — a sweep
that computed its numbers for a report and never wrote them would print the same thing. Count the
rows:

```bash
node --env-file=.env.local -e '
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const r = await sql`
  select
    count(*)::int as originals,
    count(*) filter (where description is null)::int as missing_description,
    count(*) filter (where description is not null and description_embedding is null)::int as missing_embedding,
    count(*) filter (where description_embedding is not null)::int as embedded
  from nina_message_images
  where source_avatar_id is null and source_image_id is null`;
console.log(r[0]);
' --input-type=module
```

**Expected, given the 2026-09-17 measurement:**
`{ originals: 112, missing_description: 0, missing_embedding: 0, embedded: 112 }`

`missing_description + missing_embedding === 0` is the plan index's Phase 4 exit criterion, stated as
a number.

**If a row legitimately remains unembedded**, say which and why rather than re-running blindly:
- `missing_embedding > 0` with a `FAIL` line in the run output → a vendor error on that row. Re-run;
  the sweep is monotone and picks it up. A row that fails repeatedly gets named in the phase notes.
- `missing_description > 0` → a row whose caption pass never succeeded. It needs a **describe**, which
  this script deliberately cannot do; drive one POST of
  `/api/admin/nina/backfill-media-descriptions` instead, or use the Media pane's "Describe it" button.
  There are zero such rows today.
- A row whose description is only whitespace prints `skip … (description is blank)` and stays
  unembedded. That is correct and permanent until someone writes prose for it; it is not a failure.

**Impact:** production data — 112 rows gain a vector. No prose, no blob, no row is created or
destroyed.

---

### Step 7: The gates

**File:** none.

**Change:** run the full checks against the assembled tree. **These are commands for `/implement` to
run when Phase 4 executes, not results recorded at planning time** — Phases 1-3 had not executed when
this plan was written (`git status` showed only the analysis document, the plan index and two stray
`__cycle_probe_*.ts` files in `lib/db/schema/nina/`, and the database carried none of Phase 1's
columns).

```bash
cd /home/miftah/.worktrees/run-insights/media-album-unified-search
npx next typegen && npx tsc --noEmit      # vitest does NOT typecheck; this is the gate that does
npx vitest run                            # the full default suite
# VITEST_INTEGRATION=1 is REQUIRED: vitest.config.ts EXCLUDES tests/integration/** without it, so
# the bare `npx vitest run tests/integration/...` form matches zero files and exits 0 — a green that
# answered the wrong question. `npm run test:int` already sets it; this is the one-file form.
TEST_DATABASE_URL="$(node --env-file=.env.local -p 'process.env.DATABASE_URL')" \
  VITEST_INTEGRATION=1 npx vitest run tests/integration/mediaAlbumUnifiedSearch.int.test.ts
npm run format:check
npm run lint
npm run knip
```

Two notes the implementer will want:
- **`npx tsc --noEmit` alone is not enough** — `next typegen` must run first or `PageProps` errors
  appear that are only missing generated types.
- **A red that is not in this phase's own files is checked against clean `HEAD` before it is
  believed.** Use `--no-file-parallelism` for a flake verdict; `tests/admin.memoryTable` cases in
  particular have a history of load-dependent flakes.

---

## Verification

**Build:** `npx next typegen && npx tsc --noEmit`

**Tests:**
```
npx vitest run tests/admin.mediaBackfillRoute.test.ts tests/admin.chatPhotos.test.ts
npx vitest run
TEST_DATABASE_URL=<neon url> VITEST_INTEGRATION=1 \
  npx vitest run tests/integration/mediaAlbumUnifiedSearch.int.test.ts
```

**`VITEST_INTEGRATION=1` is not optional.** `vitest.config.ts` excludes `tests/integration/**`
unless it is set, so without it the command matches zero files, prints a pass and proves nothing.
Confirm the run reports the case count, not `No test files found`.

**Manual check:** with the dev server up, a text search from `/admin/nina` that matches one of the
backfilled chat photographs returns it as a media-origin hit — the first time any Media row has ever
been returned by that bar. Confirm a promoted (pointer) photograph appears **once**, not twice.

**Exit criteria:**
1. `npx tsc --noEmit`, `npx vitest run`, `npm run format:check`, `npm run lint` and `npm run knip`
   are all green.
2. A read-only count over `nina_message_images` scoped to `source_avatar_id IS NULL AND
   source_image_id IS NULL` reports `missing_description = 0` and `missing_embedding = 0` — or names
   the specific rows that legitimately remain and why.
3. `GET /api/admin/nina/backfill-media-descriptions` reports `remaining: 0`.
4. `tests/admin.chatPhotos.test.ts` passes **in full**, including its eleven pre-existing
   `removeChatPhotoAction` cases (the ones Phase 2 breaks without its own Step 14l).
5. The integration suite passes against a real database, and its throwaway user is gone afterwards
   (`select count(*) from users where id like 'mau-u1-%'` → 0).

---

## Handoffs

**H1 — the search bar is still absent on the Media view, and this phase does not mount it.**
Phase 3's H1 offers the work to Phase 4: mount `PhotoSearchBar` unconditionally, drop
`const activeSearch = isMediaView ? null : search` (`components/admin/FileExplorer.tsx:182`), and edit
the literal `'{!isMediaView && ('` that `tests/admin.photoSearch.test.ts:58-60` pins, in the same
commit. **Declined deliberately**: this phase's scope is tests and the backfill surface, and mounting
a search bar is a UI behaviour change in a Phase-3-owned file. R1 is satisfied without it — the
merged search runs from the Album view, which is what the bare `/admin/nina` URL opens. What is
missing is the convenience of starting a search while standing in Media. Its own card.

**H2 — `components/admin/FileExplorer.tsx:423-425` carries a comment that is now false on both
clauses** — *"The Media arm's photographs are a different table with no description column … a search
field over it would be a field that cannot answer."* That table has always had a `description` column
and has had an embedding since Phase 1. Left for whoever takes H1; correcting it alone would be a
drive-by edit in another phase's file.

**H3 — Invariant 5 is Phase 2's, and is deliberately not re-tested here.** phase-2.md step 14g adds
the pointer-delete case to `tests/admin.albumAvatarDelete.test.ts` (no `isBlobPathnameReferenced`
statement, no `del`). If the reconciler finds that step dropped, it moves here rather than being
written twice — the seam is `tests/admin.albumAvatarDelete.test.ts`, which Phase 2 already lists in
its Files table.

**H4 — deleting a user account may now fail while a pointer row exists, and nobody owns that yet.**
`nina_avatars.source_image_id` is `ON DELETE RESTRICT` (Phase 1). Deleting a `users` row cascades to
`nina_avatars` and `nina_message_images` through separate FKs, in an order Postgres does not specify;
if the images are deleted first while a pointer still names one, RESTRICT aborts the whole delete.
Step 5's `afterAll` works around it for the test fixture by dropping avatars explicitly first, but
**the application's own account-deletion path is not audited here** — it was out of scope and no
phase in this set touches it. Worth its own card: either order the deletes explicitly, or reconsider
whether `RESTRICT` should be `NO ACTION DEFERRABLE`.

**H5 — the 18 legacy `chat-photo:` album copies are still byte-duplicated.** Out of scope per the
plan index, and Phase 2 already hides their Media originals from search so they are not duplicate
hits. Converting them to pointers and releasing the duplicate Blob objects would recover storage and
make R3 retroactive. Its own card, as Phase 2's handoff also says.

**H6 — `app/admin/nina/page.tsx` has no test suite, and this phase does not create one.**
Phase 3's H4 names this: its two new mappings (`isPointer`, and the media arm's two keyword columns)
are untested, and covering them means standing up the query layer for a Server Component. The
integration suite added in Step 5 is the nearest thing — it proves the data those mappings read is
correct, not that the mapping reads it.

**H7 — `hrefForMediaView()` is exercised only transitively**, through
`components/admin/explorer/SearchResultsGrid.test.tsx`. Phase 3 owns that file and judged the
indirect coverage sufficient; recorded here so it is a decision rather than an oversight.

---

## Rollback

This phase is additive in every file it touches, so undoing it is a revert plus one optional data
step.

- **Code and tests:** revert the commit. `app/api/admin/nina/backfill-media-descriptions/route.ts`,
  `scripts/backfill-media-embeddings.mjs`,`tests/admin.mediaBackfillRoute.test.ts` and
  `tests/integration/mediaAlbumUnifiedSearch.int.test.ts` disappear; the `package.json` line and the
  `tests/admin.chatPhotos.test.ts` edits revert with it. **Caveat:** the mock-factory line is
  Phase 2's (its Step 14l), not this phase's, so a revert here must not take it out — if the revert
  is taken as a whole-file checkout rather than a commit revert, re-add the three Step 14l lines or
  Phase 2's eleven `removeChatPhotoAction` cases go red again.
- **The backfilled vectors:** nothing needs undoing. A filled `description_embedding` is exactly the
  state Phase 2's pipeline writes for every new row, so leaving them is not a half-migrated tree. If
  they must go, `UPDATE nina_message_images SET description_embedding = NULL` restores the
  pre-backfill state — a supported, pre-existing state (`countNinaMessageImageDescribeBacklog`'s own
  shape), and one the sweep can re-fill at any time from prose that was never touched.
- **Ordering:** this phase must be rolled back **before** Phase 1, since its route imports Phase 2's
  functions which read Phase 1's columns. Rolling back Phases 1-3 while this phase's route remains
  leaves a route that does not compile.
