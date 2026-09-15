# Phase 1: Schema + embedding client

**Plan set:** `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md`
**Analysis:** `20260915-085928-9RVY_code_analyzer.md`
**Satisfies:** R2, R3, R4 — the shared infrastructure all three search modes rank against. This phase ships no user-visible behaviour; it ships the column the ranking reads and the client that fills it.
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/db/schema` (primary), `lib/nina`

---

## Goal

After this phase, `nina_avatars` carries a nullable `description_embedding vector(N)` column with an HNSW cosine index, the `vector` extension exists in the database, and `lib/nina/embedding.ts` turns a string into an `N`-dimension `number[]` through one `fetch` against a **probe-confirmed** embeddings endpoint. Nothing writes the column and nothing reads it yet — phase 2 fills it, phase 3 ranks by it. The dimension `N` is a single named constant that the column, the client's response validator and the schema test all read from one place.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**
- `lib/db/schema/nina/avatars.ts` → `ninaAvatars.descriptionEmbedding` (column `description_embedding`, `vector(NINA_EMBEDDING_DIMENSIONS)`, **nullable**, no default)
- `lib/db/schema/nina/avatars.ts` → `export const NINA_EMBEDDING_DIMENSIONS` (re-exported through the `@/lib/db/schema` barrel by the existing `export * from './schema/nina/avatars'` at `lib/db/schema.ts:55` — **no barrel edit needed**)
- `lib/db/schema/nina/avatars.ts` → index `nina_avatars_description_embedding_hnsw_idx` (`using('hnsw', …op('vector_cosine_ops'))`)
- `lib/nina/openrouter.ts` → `OPENROUTER_EMBEDDINGS_URL`, `NINA_EMBEDDING_MODEL`
- `lib/nina/embedding.ts` (new file) → `embedNinaText`, `embedNinaTextWithFetch`, `NinaEmbeddingError`, `NinaEmbedOptions`, `NINA_EMBEDDING_TIMEOUT_MS`, `NINA_EMBEDDING_MAX_CHARS`, `clampEmbedInput`
- `lib/nina/embedding.test.ts` (new file)
- `drizzle/0022_nina_avatar_embedding.sql` + `drizzle/meta/0022_snapshot.json` + one `_journal.json` entry at idx 22

**Signature changes:** none.
**Renames:** none.
**Deletes:** none.

**Modifies (shared files — the reconciler should check no peer phase touches these):**
- `lib/db/schema/nina/avatars.ts` — import list (`:2-12`), header doc, column block, index block
- `lib/nina/openrouter.ts` — two new exported constants appended after `:34`
- `tests/db.schema.nina.test.ts` — the twenty-column pin at `:267-294` becomes twenty-one; the four-index pin at `:315-320` becomes five; one new type assertion
- `scripts/check-schema-drift.mjs` — one rule added to `normalizeSnapshotType` (`:80-92`)
- `tests/db.schemaDrift.test.ts` — one row added to the `it.each` table (`:78-95`), one negative control added (`:97-110`)

**Requires (from earlier phases):** none. This is the root of the set.

**Provides (what phases 2 and 3 may assume):**
- `import { embedNinaText } from '@/lib/nina/embedding'` — `(text: string, opts?: NinaEmbedOptions) => Promise<number[]>`. **Throws** `NinaEmbeddingError` on any failure (empty input, transport, non-2xx, bad JSON, wrong dimension). It writes its own `nina_error_logs` row before throwing; callers must not log a second one.
- `import { NINA_EMBEDDING_DIMENSIONS } from '@/lib/db/schema'`
- `ninaAvatars.descriptionEmbedding` accepts and returns `number[] | null` through drizzle — no manual `'[1,2,3]'` string formatting at any call site.

**Leaves alone (owned by others):**
- `lib/admin/ninaAlbumDeferredDescribe.ts`, `lib/admin/ninaAlbumUploadActions.ts`, `lib/admin/ninaAlbumDescribeActions.ts`, `lib/admin/ninaAlbumAvatarActions.ts`, `lib/nina/queries/avatarEmbeddings.ts`, and any backfill entry point (Phase 2)
- `lib/nina/queries/**` (Phases 2 and 3 each add one module there), `lib/admin/ninaAlbumSearchActions.ts`, `lib/admin/ninaAlbumActions.ts` barrel (Phase 3)
- **`lib/nina/queries/columns.ts` and `lib/nina/queries/shapes.ts` in particular.** Phases 2 and 3 both state as a hard Requires that `descriptionEmbedding` is **NOT** added to `avatarColumns` or to `NinaAvatarRow`: `listNinaAvatarsInFolder` returns 120 rows per render and a 1536-float vector per row is ~1.5 MB of wire for a value no renderer reads, and `avatarColumns` is a positional projection frozen by hand-written `projectedRow(...)` fixtures in four suites this phase does not own. Declare the column on the table and stop there.
- `components/**`, `app/**` (Phase 4)
- `lib/nina/vision.ts` and `lib/nina/prompts/describe.ts` — read as a model, **not edited**
- `lib/db/schema/admin.ts`'s `NinaErrorCategory` / `NINA_ERROR_CATEGORIES` — see Step 4's note on why no `'embedding'` category is added

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/openrouter.ts` | modify | `:34` — add `OPENROUTER_EMBEDDINGS_URL` and `NINA_EMBEDDING_MODEL` beside `OPENROUTER_CHAT_URL` |
| `lib/db/schema/nina/avatars.ts` | modify | `:2-12` add `vector` to the pg-core import; header gains a `description_embedding` section; `:198` gains the column; `:222` gains the HNSW index; new exported `NINA_EMBEDDING_DIMENSIONS` |
| `lib/nina/embedding.ts` | create | the `server-only` embeddings client — one `fetch`, no SDK |
| `lib/nina/embedding.test.ts` | create | eight cases against an injected `fetch`; no network, no database |
| `drizzle/0022_nina_avatar_embedding.sql` | create (generated, then hand-prefixed) | `CREATE EXTENSION IF NOT EXISTS vector;` then the generated ADD COLUMN + CREATE INDEX |
| `drizzle/meta/0022_snapshot.json` | create (generated) | drizzle-kit writes it |
| `drizzle/meta/_journal.json` | modify (generated) | drizzle-kit appends idx 22 |
| `tests/db.schema.nina.test.ts` | modify | `:267`, `:315` pins updated; one new `sqlType` assertion |
| `scripts/check-schema-drift.mjs` | modify | `:80-92` — fold `vector(N)` to `vector` so the live half does not false-fail |
| `tests/db.schemaDrift.test.ts` | modify | `:78-95` one new pair; `:97-110` one negative control |

---

## Pre-flight (the worktree is not runnable as it stands)

**`/home/miftah/.worktrees/run-insights/admin-album-semantic-search` has no `node_modules` and no `.env.local`.** Nothing in this plan — not `npm test`, not `npx tsc --noEmit`, not `db:generate` — runs until both exist. A `node_modules` symlink passes vitest and tsc but Turbopack's build rejects it, so do the real install.

```bash
cd /home/miftah/.worktrees/run-insights/admin-album-semantic-search
cp /home/miftah/run-insights/.env.local .env.local
npm install
```

Also confirm nobody else has claimed migration 0022 while this set was planned — a renamed migration is skipped silently, so the number has to be free on the remote and not merely on local `main`:

```bash
git -C /home/miftah/run-insights fetch origin main -q
git -C /home/miftah/run-insights ls-tree --name-only origin/main drizzle/ | tail -3
```

Verified at planning time (2026-09-15): the tip of `origin/main` is `c1a3d9e`, the last migration is `0021_nina_error_logs.sql`, journal idx 21. **0022 is free.** If a peer set has taken it by the time you run, regenerate — never rename.

---

## Implementation Steps

### Step 1: Probe the embeddings endpoint and decide `N` — BEFORE anything else

**File:** none (a scratch probe; no repo file is created)
**Change:** The dimension is baked into the migration, so it cannot be a guess corrected later — a wrong `N` means a second migration that rewrites a populated column. The plan index's Decisions table says the model id and dimension are "confirmed by a live probe at Phase 1 implementation time, not assumed", and this is that step.

Send **exactly the body `lib/nina/embedding.ts` will send** (Step 4). A request shape that differs from the probed one is an unprobed shape, which is this module family's standing rule against (`lib/nina/vision.ts:481-492`, `toDataUri`'s note).

```bash
cd /home/miftah/.worktrees/run-insights/admin-album-semantic-search
node --env-file=.env.local -e '
const body = {
  model: process.argv[1],
  input: "A woman in a red jacket standing on a mountain trail at sunrise.",
  encoding_format: "float",
};
const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log("status", res.status);
let j; try { j = JSON.parse(text); } catch { console.log(text.slice(0, 600)); process.exit(1); }
const vec = j?.data?.[0]?.embedding;
console.log("dimensions", Array.isArray(vec) ? vec.length : "NOT AN ARRAY");
console.log("first3", Array.isArray(vec) ? vec.slice(0, 3) : null);
console.log("allFinite", Array.isArray(vec) && vec.every((n) => Number.isFinite(n)));
console.log("usage", JSON.stringify(j?.usage ?? null));
if (!Array.isArray(vec)) console.log(text.slice(0, 600));
' openai/text-embedding-3-small
```

**Candidate order, and the hard constraint that orders it.** pgvector's HNSW index refuses a column of **more than 2000 dimensions** (`CREATE INDEX` fails with "column cannot have more than 2000 dimensions for hnsw index"). The `vector` type itself allows 16000, so a large model would store fine and then fail at the index — at migration time, on production. So the candidate list is ordered by "≤ 2000 dimensions" first:

| Order | Candidate | Expected dims | Note |
|---|---|---|---|
| 1 | `openai/text-embedding-3-small` | 1536 | HNSW-legal. The plan's written default. |
| 2 | `mistralai/mistral-embed` | 1024 | HNSW-legal. |
| 3 | `google/gemini-embedding-001` | 3072 | **Exceeds the HNSW limit** — if this is the only one that answers, drop the index (see the branch below). |
| 4 | `qwen/qwen3-embedding-8b` | 4096 | Same problem, worse. |

Take the **first candidate that returns HTTP 200 with a finite `number[]`**, and record its measured dimension as `N`.

**Branch A — OpenRouter answers.** Normal path. Write the measured id into `NINA_EMBEDDING_MODEL` and the measured length into `NINA_EMBEDDING_DIMENSIONS`. Continue to Step 2.

**Branch B — OpenRouter has no embeddings surface** (404 on `/api/v1/embeddings`, or every candidate 400s). Probe z.ai with the same script body, swapping the URL and credential:

```bash
node --env-file=.env.local -e '
for (const base of [process.env.LLM_VISION_BASE_URL, "https://api.z.ai/api/paas/v4"]) {
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({ model: "embedding-3", input: "a test sentence", encoding_format: "float" }),
  });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = null; }
  console.log(base, res.status, Array.isArray(j?.data?.[0]?.embedding) ? j.data[0].embedding.length : t.slice(0, 200));
}'
```

z.ai's embeddings surface is OpenAI-shaped — same `{ model, input }` request, same `{ data: [{ embedding: [...] }] }` response — so **only three lines change** and no code in Step 4 is restructured:
1. `OPENROUTER_EMBEDDINGS_URL` becomes `NINA_EMBEDDINGS_URL = \`${env.LLM_VISION_BASE_URL}/embeddings\`` (built at call time inside the function, not at module scope, and moved out of `lib/nina/openrouter.ts` into `lib/nina/embedding.ts`, since `openrouter.ts` is a zero-import module and must stay one).
2. The credential read becomes `env.LLM_API_KEY` instead of `ninaEnv().OPENROUTER_API_KEY`, and the `try/catch` around `ninaEnv()` disappears (the core group is eager and already validated).
3. `provider` in the error-log row becomes `'zai'`.

**Branch C — no candidate answers anywhere.** Only after **all four OpenRouter candidates in the table above have been tried and both z.ai base URLs in Branch B's loop have been tried** — six attempts, and that is the whole ladder this repo's arsenal has. This is an operational failure, not a design fork: nothing in the repo has been written yet — Step 1 creates no file, and the migration is generated in Step 7 *after* `N` is known — so the phase stops with a clean tree and resumes unchanged the moment any endpoint answers. Post the raw status/body of every attempt in the phase's report and stop. **Do not invent a local embedding, do not guess a dimension, and do not generate the migration.**

> **This is not an Open Question and it does not block the plan set.** Every branch here is reversible: A and B both proceed with a probe-confirmed `N`; C writes nothing at all. Even the worst *wrong* outcome — picking a model and later wanting a different one — costs one additional additive migration plus a re-embed sweep (phase 2's backfill route already exists for exactly that), which is why this plan probes first rather than parking the decision. **Probe, pick the first candidate that answers, proceed.**

**Impact:** Fixes `N` and the model id. Everything downstream in this phase, and the search query in Phase 3, is written against them. **Record the raw probe output (status, model id, dimensions, usage) verbatim in the `NINA_EMBEDDING_MODEL` doc comment in Step 2** — the exit criteria require it, and a number nobody can date is a number nobody can re-check.

---

### Step 2: Declare the endpoint and the model

**File:** `lib/nina/openrouter.ts:34` (immediately after `OPENROUTER_CHAT_URL`)
**Change:** Two constants in the repo's zero-import constants module, for the reason its own header gives: an endpoint declared twice is an endpoint that drifts apart from itself (RULING A6). The dimension does **not** live here — see Step 3.

**Code:** insert after line 34.

```ts
/**
 * **OpenRouter's embeddings surface.** Sibling of `OPENROUTER_CHAT_URL` above, and declared here
 * for the same reason that one is: an endpoint spelled in two files is an endpoint that drifts
 * apart from itself. `lib/nina/embedding.ts` is its only reader today; the search query layer
 * reaches it through that module and never spells the URL.
 *
 * Unlike the chat and vision paths, this endpoint has **no z.ai primary in front of it**. Neither
 * configured z.ai base URL (`LLM_VISION_BASE_URL`, `LLM_BASE_URL`) exposes an embeddings surface
 * that this repo has confirmed, so there is nothing to fall back FROM. A failure here is a single
 * failed attempt and one `nina_error_logs` row, not a two-provider ladder.
 */
export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'

/**
 * **The album's text-embedding model, and the ONE thing that fixes the vector column's width.**
 *
 * PROBED LIVE on <DATE>, not assumed — the plan set's own exit criterion, and the same posture
 * `NINA_CHAT_FALLBACK_MODEL_IDS` records for `nvidia/nemotron-3.5-lightning`. Paste the probe's
 * raw reading here and date it:
 *
 *     POST https://openrouter.ai/api/v1/embeddings
 *     { model: '<id>', input: '<one sentence>', encoding_format: 'float' }
 *     -> 200, data[0].embedding.length = <N>, every element finite, usage = <usage>
 *
 * **Not admin-configurable, and it cannot become so without a migration.** The chat fallback got a
 * dropdown (see the header) because swapping a chat model changes only the prose. Swapping THIS
 * model changes the width of `nina_avatars.description_embedding` and invalidates every vector
 * already stored — two different models do not share an embedding space, so a mixed column ranks
 * nonsense. Changing it is: a new dimension constant, a new migration, and a full re-embed of the
 * album. A dropdown would be a control that silently corrupts a ranking.
 *
 * **Bounded above at 2000 dimensions by pgvector**, which is why a bigger model is not simply
 * better here: HNSW refuses to index a wider column, and the index is declared in
 * `lib/db/schema/nina/avatars.ts`. See `NINA_EMBEDDING_DIMENSIONS` there.
 */
export const NINA_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
```

**Impact:** No behaviour change — nothing imports these yet. `ci:openrouter-guard` is unaffected: the literal `OPENROUTER_API_KEY` does not appear in this file, and this file is under `lib/nina/` anyway, which is one of the guard's two exempt prefixes.

> If Step 1 took **Branch B**, do not add these two constants to `openrouter.ts` at all. `openrouter.ts` is documented as zero-import and a z.ai URL would have to be assembled from `env.LLM_VISION_BASE_URL`, which would break that. Declare `NINA_EMBEDDING_MODEL` inside `lib/nina/embedding.ts` instead and build the URL at call time there.

---

### Step 3: Add the column, the dimension constant, and the HNSW index

**File:** `lib/db/schema/nina/avatars.ts` — four edits: `:2-12` (import), `:148` (header), `:198` (column), `:222` (index)
**Change:** The dimension constant lives **in the schema file, not in `lib/nina/openrouter.ts`**, and the direction matters. `N` is a property of the *column*; the client merely has to agree with it. Every schema module in `lib/db/schema/` imports only from its own siblings (`./auth`, `../runs`, `./avatars`) and nothing else, and drizzle-kit loads `lib/db/schema.ts` outside Next.js — adding the first `@/lib/nina/...` edge into the schema tree would put a path alias in drizzle-kit's resolution path for no gain. `lib/nina/embedding.ts` imports the constant the other way (`@/lib/db/schema`), which is the direction `lib/nina/errorlogs.ts:4` already takes.

**3a — the import at `:2-12`.** Add `vector` to the `drizzle-orm/pg-core` import, keeping the list alphabetical as it already is:

```ts
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core'
import { users } from '../auth'
```

`vector` is a first-class pg-core export in `drizzle-orm@0.45.2` (`pg-core/columns/vector_extension/vector.d.ts`) — verified present in this repo's installed tree. No npm package is added.

**3b — the dimension constant.** Insert immediately above `export const ninaAvatars = pgTable(` (i.e. above the current `:150`, after the table's header comment block closes at `:149`):

```ts
/**
 * **How wide `description_embedding` is, declared once.**
 *
 * It lives here and not beside `NINA_EMBEDDING_MODEL` in `lib/nina/openrouter.ts` because it is a
 * property of the COLUMN — the client has to agree with the column, not the other way round — and
 * because every module under `lib/db/schema/` imports only its own siblings today. `drizzle-kit`
 * loads this tree outside Next.js; a `@/lib/nina/...` edge would be the first path alias in its
 * resolution path, bought for nothing. `lib/nina/embedding.ts` imports THIS, through the
 * `@/lib/db/schema` barrel, exactly as `lib/nina/errorlogs.ts` already imports `ninaErrorLogs`.
 *
 * **It is pinned to whatever `NINA_EMBEDDING_MODEL` returned when it was probed.** Two embedding
 * models do not share a vector space, so changing either one without the other does not degrade
 * the ranking — it randomises it, silently, with no error anywhere. Change them together, in one
 * migration, with a full re-embed.
 *
 * **2000 is pgvector's hard ceiling for an HNSW index** (the `vector` type itself allows 16000).
 * A model wider than that would store fine and then fail at `CREATE INDEX` — at migration time,
 * against production. The probe's candidate order in the phase plan is sorted by this constraint
 * for that reason.
 */
export const NINA_EMBEDDING_DIMENSIONS = 1536
```

> Replace `1536` with Step 1's **measured** value. It is the only place the number is written.

**3c — the column.** Insert immediately after the `description` column at `:197-198`, before `isCurrent`:

```ts
    /** What the picture shows, in prose (R25). See the header for its three writers. */
    description: text('description'),
    /**
     * **`description`, as a vector** — the album's semantic search ranks against this and nothing
     * else (2026-09-15). Derived, read-only-by-search, and never a second source of truth: the
     * prose in `description` above stays the one thing Nina's prompt reads.
     *
     * NULLABLE, and nullable is the entire migration story — the same argument `source_key` makes
     * in the header. Every row in the album today has no embedding, most have no `description`
     * either, and an `ADD COLUMN` of a nullable vector rewrites nothing and backfills nothing.
     * NULL means "not embedded yet", it is the value every pre-search row carries, and it is a
     * legal state forever: a photo whose describe pass failed is simply not in the search index.
     * A cosine-distance predicate skips NULL rows on its own, and the HNSW index below does not
     * index them, so "unsearchable" costs nothing at read time.
     *
     * **Nothing in THIS phase writes it.** The write sites — the deferred describe pass, the three
     * other `description` writers, and the one-time backfill — are the next phase's, and the
     * invariant they must keep is that every path that writes `description` writes this in the
     * same step. A row with a description and a NULL embedding is invisible to search while
     * looking perfectly healthy in the explorer, which is the one failure mode here that has no
     * symptom.
     */
    descriptionEmbedding: vector('description_embedding', {
      dimensions: NINA_EMBEDDING_DIMENSIONS,
    }),
    isCurrent: boolean('is_current').notNull().default(false),
```

**3d — the index.** Append as the fifth entry of the `(t) => [...]` array, after the `nina_avatars_user_source_key_unq` entry that currently ends at `:222`:

```ts
    uniqueIndex('nina_avatars_user_source_key_unq').on(t.userId, t.sourceKey),
    /**
     * **The cosine-similarity index, and it is insurance rather than a requirement.**
     *
     * An album of hundreds of rows would rank fine on a sequential scan — a few hundred
     * 1536-float dot products is sub-millisecond, and `nina_avatars` is per-user and small.
     * The index is here because it is free to declare now and costs a migration later, and
     * because the F34 header's own premise is "hundreds of profile pics" growing.
     *
     * `vector_cosine_ops`, matching the `<=>` operator the search query uses. An HNSW index built
     * for one operator class does not serve another: an `l2` index and a cosine query silently
     * fall back to a seq scan, which is correct and slow — the worst kind of wrong, because
     * nothing reports it. One operator class, named at both ends.
     *
     * NOT partial. `WHERE description_embedding IS NOT NULL` would be redundant — pgvector's HNSW
     * does not index NULL rows anyway — and a partial index is one more predicate the planner has
     * to prove a query matches before it can use it.
     */
    index('nina_avatars_description_embedding_hnsw_idx').using(
      'hnsw',
      t.descriptionEmbedding.op('vector_cosine_ops'),
    ),
  ],
)
```

`using(method, ...columns)` and `.op(opClass)` are both present in `drizzle-orm@0.45.2` (`pg-core/indexes.d.ts:55`, `pg-core/columns/common.d.ts:103`), and `'hnsw'` / `'vector_cosine_ops'` are both in the typed unions — verified in this repo's installed tree.

**3e — the header.** Add a section to the table's doc block, after the `description` (R25) section that ends at `:61`, so the file's own documentation carries the fact rather than only this plan:

```
 * ── `description_embedding` (2026-09-15, the album's semantic search) ─────────────────────────
 * The vector form of `description` above, and the ONLY thing the album's search ranks by. Text
 * queries and image queries both become a vector in the SAME space — an image query is captioned
 * by the existing `glm-4.6v` describe pass first and then embedded as text, so there is one
 * column and not two, and a combined text+image score is a weighted average of two comparable
 * cosine similarities rather than a rank fusion of two incomparable ones.
 *
 * Nullable, derived, and never authoritative: `description` remains the single source of truth
 * that Nina's prompt reads, and this column is a read-only-by-search projection of it. See the
 * column's own note for why NULL is a legal state forever, and `NINA_EMBEDDING_DIMENSIONS` just
 * below this block for why the width cannot change without a re-embed.
```

**Impact:** `npx tsc --noEmit` stays green. `npm test` goes **RED** at `tests/db.schema.nina.test.ts` — two pins (`:267` twenty columns, `:315` four indexes) now describe the old table. Step 5 fixes them; do not run the suite expecting green between here and there.

---

### Step 4: The embeddings client

**File:** `lib/nina/embedding.ts` (new)
**Change:** One `fetch`, no SDK, mirroring `lib/nina/vision.ts`'s structure exactly: an injectable core (`…WithFetch`) that the unit suite drives with a fake, a thin production wrapper that passes the real `fetch`, one error class, and a best-effort `nina_error_logs` row written inside a `try/catch` that cannot itself throw.

Three decisions worth naming before the code:

1. **It throws; it does not return `null`.** Every existing vendor call in this family throws (`describeNinaImages`, `describeNinaImagesWithFallback`) and every caller already has the catch. Phase 2 calls it inside a non-fatal `after()` callback; Phase 3 calls it inside a Server Action that returns `{ ok: false, error }`. A `null` return would make both of those silently produce an unsearchable row or an empty result set with no row in the error log.

2. **The failure log's category is `'text'`, and no fourth category is added.** `NinaErrorCategory` is pinned by name and by order in **three** places — `lib/db/schema/admin.ts:51,54`, `lib/admin/errorLogModel.ts:62,69` (the `/admin/error-logs` tab list and its labels), and two test files (`tests/db.schema.errorlogs.test.ts:157`, `lib/admin/errorLogModel.test.ts:54`). A fourth member is a four-file edit that reaches into an admin UI model this phase has no business in, to give one more tab to a page nobody asked to change. An embedding call **is** a text-model call; the existing `'text'` tab is where an operator would look for one. Recorded in Handoffs as deliberately not done.

3. **There is no fallback provider.** The describe path has z.ai then OpenRouter because both vendors serve chat/completions. Only one confirmed vendor serves embeddings here. One attempt, one row, one throw.

**Code:** the complete file.

```ts
import 'server-only'

import { NINA_EMBEDDING_DIMENSIONS } from '@/lib/db/schema'
import { ninaEnv } from '@/lib/env'
import { logNinaError } from './errorlogs'
import { NINA_EMBEDDING_MODEL, OPENROUTER_EMBEDDINGS_URL } from './openrouter'

/**
 * **One string in, one `number[]` out.** The album's semantic search (2026-09-15) has exactly two
 * jobs for a vendor: turn a photo's stored `description` into a vector at write time, and turn an
 * operator's query into a vector at read time. Both are this one call.
 *
 * One `fetch`, no SDK, the same construction and for the same reason as `lib/nina/vision.ts`:
 * `@anthropic-ai/sdk` cannot be pointed at an OpenAI-shaped embeddings endpoint, and pulling in a
 * second vendor SDK to send one JSON object would be more dependency than request.
 *
 * ── NO FALLBACK LADDER, AND THAT IS NOT AN OMISSION ──────────────────────────────────────────
 * `describeNinaImagesWithFallback` tries z.ai and then OpenRouter because both vendors serve
 * chat/completions and the describe path had a measured two-hour outage to survive
 * (`nina_error_logs`, 2026-09-14 07:40-09:38 UTC). Embeddings have one confirmed door here — the
 * probe in this phase's plan is what established that — so there is nothing to fall back FROM.
 * One attempt, one `nina_error_logs` row, one throw. If a second vendor is ever confirmed, this
 * module gains a `…WithFallback` sibling in `describeNinaImagesWithFallback`'s shape rather than
 * a branch inside the core, for the reason that function's header spells out.
 *
 * ── THE DIMENSION CHECK IS THIS MODULE'S TOKEN FLOOR ─────────────────────────────────────────
 * `lib/nina/vision.ts` refuses a response whose `prompt_tokens` says the image never arrived,
 * because the invented text is exactly what downstream would otherwise believe. The analogue here
 * is width: a vector of the wrong length is not a worse ranking, it is a failed INSERT thrown from
 * deep inside an `after()` callback, where pgvector's own message ("expected 1536 dimensions, not
 * 1024") surfaces as an unattributable warning hours after the model was swapped. So the width is
 * checked HERE, against the same constant the column is declared with, and a mismatch is a named
 * error with both numbers in it.
 */

/**
 * Wrong width, network failure, timeout, non-2xx, non-JSON body, a missing or non-numeric vector,
 * or an empty input. One class, unlike `vision.ts`'s two, because there is no caller that needs to
 * branch on which: phase 2 logs and moves on, phase 3 returns `{ ok: false }`. The distinguishing
 * detail rides in `message` and `detail`, which is what the `nina_error_logs` row carries.
 */
export class NinaEmbeddingError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'NinaEmbeddingError'
  }
}

/**
 * **MEASURED-DERIVED, and deliberately shorter than the describe path's ceilings.** An embedding is
 * a single forward pass with no autoregressive decode — there are no completion tokens to stream,
 * which is the entire reason `NINA_DESCRIBE_TIMEOUT_MS` is 25 s and its OpenRouter sibling 30 s
 * (~26-33 ms per output token, F04). A few hundred input tokens in, one vector out, over a broker
 * that adds a routing hop: 15 s is a ceiling with room, not a target.
 *
 * It matters that it is short. Phase 2 embeds every row of a folder upload inside one `after()`
 * callback under a route segment's `maxDuration`; a 30 s ceiling per row would halve how many rows
 * fit in that budget for a call that should answer in under a second.
 */
export const NINA_EMBEDDING_TIMEOUT_MS = 15_000

/**
 * The input clamp, and it is a STORAGE-SHAPED GUARD rather than a contract — the same thing
 * `NINA_ERROR_LOG_TEXT_MAX` is, for the same reason.
 *
 * A real description is 60-140 words (~900 characters) because the describe prompt asks for that,
 * and a real search query is a sentence. 8 000 characters is ~2 000 tokens, comfortably inside any
 * candidate model's window, so nothing legitimate is ever truncated. What it actually stops is a
 * caller that hands over something that is not prose — a `data:` URI, a stringified row, a whole
 * file — which `lib/nina/errorlogs.ts`'s header notes is one careless line away on the vision path.
 *
 * Truncated rather than refused: an over-long description is still a describable photo, and half a
 * paragraph embeds to something usefully close to the whole one. An EMPTY input is a different
 * thing and does throw — see `embedNinaTextWithFetch`.
 */
export const NINA_EMBEDDING_MAX_CHARS = 8_000

export interface NinaEmbedOptions {
  /**
   * Whose photo or query this is, for the failure log's `user_id` column. Optional and nullable
   * for the reason `NinaDescribeOptions.userId` is: `nina_error_logs.user_id` is nullable, and a
   * call that genuinely has no runner in hand must not have to invent one. Phase 2 and phase 3
   * both have the id and should pass it.
   */
  userId?: string | null
  /** Override the ceiling. Nothing in the repo passes it; it exists for a probe or a backfill. */
  timeoutMs?: number
}

type FetchLike = typeof fetch

/**
 * Trim, then clamp. Pure, and exported so the suite can assert the ceiling is real rather than
 * aspirational — `clampNinaErrorText`'s precedent.
 *
 * No "[truncated N characters]" marker, unlike that function: this string is sent to a model, not
 * stored for a human, and appending a sentence about truncation to text being embedded would put
 * words into the vector that the photograph does not contain.
 */
export function clampEmbedInput(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= NINA_EMBEDDING_MAX_CHARS
    ? trimmed
    : trimmed.slice(0, NINA_EMBEDDING_MAX_CHARS)
}

/**
 * One `nina_error_logs` row for one failed attempt. **Never throws and never rejects** — the same
 * contract, and the same doubled guard, as `recordDescribeFailure` in `lib/nina/vision.ts`:
 * `logNinaError` is itself specified best-effort, and this second catch is that guarantee held at
 * the place that depends on it, so a logging regression cannot cost an album row its embedding.
 *
 * `category: 'text'` and NOT a fourth `NinaErrorCategory`. An embedding IS a text-model call, the
 * existing Text tab on `/admin/error-logs` is where an operator looks for one, and a fourth member
 * would be a four-file edit reaching into an admin UI model for one more tab nobody asked for.
 * See this phase's plan, Step 4.
 *
 * `imageUrl` is always null here: this path never holds a photo. An image SEARCH reaches this
 * module as the caption text the describe pass already produced, and that describe call logs its
 * own row with its own image link if it fails.
 */
async function recordEmbedFailure(entry: {
  input: string
  timeoutMs: number
  cause: unknown
  opts: NinaEmbedOptions
}): Promise<void> {
  try {
    await logNinaError({
      category: 'text',
      provider: 'openrouter',
      model: NINA_EMBEDDING_MODEL,
      /* The payload actually sent, with the real input in it. No base64 can reach here — the
       * clamp above bounds it and the caller sends prose — so `clampNinaErrorText` downstream is
       * a backstop rather than the thing doing the work. */
      fullInput: JSON.stringify(
        { url: OPENROUTER_EMBEDDINGS_URL, model: NINA_EMBEDDING_MODEL, input: entry.input },
        null,
        2,
      ),
      errorMessage: embedErrorText(entry.cause),
      timeoutMs: entry.timeoutMs,
      imageUrl: null,
      userId: entry.opts.userId ?? null,
    })
  } catch (cause) {
    console.warn('[nina] could not record an embedding failure', { error: String(cause) })
  }
}

/**
 * What the admin log stores as "full LLM error message". Pure, exported for the test.
 *
 * `String(cause)` alone drops `NinaEmbeddingError.detail`, which is where the response snippet or
 * the thrown cause lives — and that snippet is the whole diagnosis six weeks later.
 * `describeErrorText`'s argument, applied to this module's one error class.
 */
export function embedErrorText(cause: unknown): string {
  if (cause instanceof NinaEmbeddingError) {
    return cause.detail === undefined
      ? `${cause.name}: ${cause.message}`
      : `${cause.name}: ${cause.message} — detail: ${String(cause.detail)}`
  }
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  return String(cause)
}

/**
 * The injectable core. Production reaches it through `embedNinaText`; the unit suite hands it a
 * fake `fetch` and never touches the network. DI at exactly this seam for the reason
 * `describeNinaImagesWithFetch` gives: this module is `server-only` and reads `@/lib/env`, so a
 * fake `fetch` is the only honest way to test the validation.
 *
 * @throws {NinaEmbeddingError} on an empty input, a missing credential, a transport failure, a
 *   non-2xx, a non-JSON body, a missing or non-numeric vector, or a wrong dimension. A
 *   `nina_error_logs` row is written before every throw except the empty-input one, which is a
 *   programmer error that never reached a vendor.
 */
export async function embedNinaTextWithFetch(
  fetchImpl: FetchLike,
  text: string,
  opts: NinaEmbedOptions = {},
): Promise<number[]> {
  const input = clampEmbedInput(text)
  /* Hoisted above everything that could log, so a programmer error is one throw and zero rows —
   * `describeNinaImagesWithFallback`'s empty-array check, same placement, same reasoning. An empty
   * string is not a degraded query, it is a call that should not have been made: the vendor would
   * either 400 or hand back the embedding of nothing, and the second is worse. */
  if (input.length === 0) {
    throw new NinaEmbeddingError('embedNinaText was given empty text')
  }

  const timeoutMs = opts.timeoutMs ?? NINA_EMBEDDING_TIMEOUT_MS

  /*
   * Read INSIDE the function and inside a `try`, exactly as `lib/nina/vision.ts:493-501` and
   * `lib/nina/imagecall.ts:212-223` do: `ninaEnv()` is a lazy zod group that THROWS when its member
   * is absent, and production was measured once carrying neither of the variables it used to hold.
   * A module-scope read would turn a missing key into an import-time crash of everything that
   * imports this module — which, once phase 2 lands, is the deferred describe pass, and taking the
   * WORKING description path down over a missing search credential would be the wrong trade.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly would pass
   * the grep and break the invariant it stands for.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    const err = new NinaEmbeddingError(
      'nina embedding is not configured (no OPENROUTER_API_KEY)',
      cause,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  let res: Response
  try {
    res = await fetchImpl(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NINA_EMBEDDING_MODEL,
        input,
        /* Explicit, and it is the shape the phase-1 probe sent. Several providers behind this
         * broker default to a base64-packed vector when the field is absent, which would arrive
         * here as a string and fail the array check below with a confusing message. Naming it
         * costs nothing and removes a whole class of "200 OK, wrong shape". */
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    const err = new NinaEmbeddingError('nina embedding request failed or timed out', cause)
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  /* `res.text()` first, then parse — `describeNinaImagesWithOpenRouter`'s idiom rather than
   * `res.json()`. A broker's non-2xx body is frequently HTML or a bare string, and the raw snippet
   * is the single most useful thing the log row can hold. `res.json()` would throw it away. */
  const raw = await res.text()

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (cause) {
    const err = new NinaEmbeddingError(
      `nina embedding response was not valid JSON: ${raw.slice(0, 300)}`,
      cause,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  if (!res.ok) {
    const err = new NinaEmbeddingError(
      `nina embedding endpoint returned ${res.status}: ${raw.slice(0, 300)}`,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  const body = json as { data?: Array<{ embedding?: unknown }> }
  const embedding = body.data?.[0]?.embedding

  if (!Array.isArray(embedding)) {
    const err = new NinaEmbeddingError(
      `nina embedding response carried no vector at data[0].embedding: ${raw.slice(0, 300)}`,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  /* ══ THE WIDTH GUARD ═══════════════════════════════════════════════════════════════════════
   * The analogue of `vision.ts`'s token floor, and it GATES the return rather than validating
   * alongside it: a vector of the wrong length must never reach a column declared at a different
   * width, because the failure then surfaces as an opaque pgvector INSERT error inside an
   * `after()` callback instead of here, with both numbers named. The `every` check is part of it —
   * a `null` or a string inside the array is a vector pgvector will also refuse, and finding out
   * here costs one comparison per element on a vector we already materialised.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */
  if (
    embedding.length !== NINA_EMBEDDING_DIMENSIONS ||
    !embedding.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    const err = new NinaEmbeddingError(
      `nina embedding returned ${embedding.length} value(s) for model ${NINA_EMBEDDING_MODEL}; ` +
        `nina_avatars.description_embedding is vector(${NINA_EMBEDDING_DIMENSIONS}). The model id ` +
        'and NINA_EMBEDDING_DIMENSIONS must be changed together, in one migration, with a full ' +
        're-embed — two embedding models do not share a vector space.',
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  return embedding as number[]
}

/**
 * Production: the real `fetch`. Everything else is `embedNinaTextWithFetch`.
 *
 * The whole public surface of this module for phases 2 and 3 — the deferred describe pass embeds
 * the description it just wrote, and the search action embeds the operator's query (or the caption
 * of their query image). Both call THIS.
 */
export async function embedNinaText(text: string, opts: NinaEmbedOptions = {}): Promise<number[]> {
  return embedNinaTextWithFetch(fetch, text, opts)
}
```

**Impact:** No existing behaviour changes — nothing imports this file yet. `ci:openrouter-guard` stays green (`lib/nina/` is exempt). `npm run knip` may report `embedNinaText`, `NinaEmbeddingError`, `NinaEmbedOptions` and `NINA_EMBEDDING_TIMEOUT_MS` as unused exports until phase 2 and 3 land; that is expected for a foundation phase and is **not** a reason to suppress them — see Verification.

---

### Step 5: Update the two schema pins that this phase falsifies

**File:** `tests/db.schema.nina.test.ts:266-354`
**Change:** Three edits inside the existing `describe('nina_avatars')` block. These are not new tests bolted on; they are the file's existing pins re-stated against the table as it now is, which is what the file's own header says they are for.

**5a — the column pin at `:267-294`.** Change the title's count and add the column:

```ts
  it('carries exactly the twenty-one columns phases 12-15, F34 and the album search were written against', () => {
    expect(names(schema.ninaAvatars)).toEqual(
      [
        'id',
        'user_id',
        'blob_url',
        'pathname',
        // F34 R1: the album is a file manager, so a photo knows its folder, its name on the
        // laptop, the dedupe key it was registered under, and where its grid thumbnail lives.
        'folder',
        'filename',
        'source_key',
        'thumb_url',
        'thumb_pathname',
        'width',
        'height',
        'bytes',
        'source',
        'crop_scale',
        'crop_x',
        'crop_y',
        'description',
        // 2026-09-15: the vector form of `description`, and the only thing the album's semantic
        // search ranks by. Derived and nullable — `description` stays the source of truth.
        'description_embedding',
        'is_current',
        'announced_at',
        'created_at',
      ].sort(),
    )
  })
```

**5b — the index pin at `:314-330`.** Add the fifth name (the array is `.sort()`ed by `indexNames`, so `nina_avatars_description_embedding_hnsw_idx` sorts first):

```ts
  it('has the folder page index and the dedupe-key unique index beside the two it already had', () => {
    expect(indexNames(schema.ninaAvatars)).toEqual([
      'nina_avatars_description_embedding_hnsw_idx',
      'nina_avatars_user_created_idx',
      'nina_avatars_user_current_unq',
      'nina_avatars_user_folder_created_idx',
      'nina_avatars_user_source_key_unq',
    ])
    // Two indexes, two reads: the folder index does NOT subsume the created index, because
    // "the whole album, newest first" puts no equality on `folder` and would have to sort.
    const unq = cfg(schema.ninaAvatars).indexes.find(
      (i) => i.config.name === 'nina_avatars_user_source_key_unq',
    )
    expect(unq?.config.unique).toBe(true)
    // NOT partial, unlike `nina_avatars_user_current_unq`: NULLs being DISTINCT is what exempts
    // the pre-F34 rows, so no WHERE clause is needed to do it.
    expect(unq?.config.where).toBeUndefined()
  })
```

**5c — a new case, immediately after the `crop_scale is numeric(5, 3)` case at `:349-353`**, closing the `describe('nina_avatars')` block. This is the pin that makes the drift guard's narrowing in Step 6 safe: the live guard folds `vector(N)` to bare `vector` because `information_schema` cannot report a dimension, so the dimension is pinned *here* instead, and to the same constant the client validates against.

```ts
  it('description_embedding is a nullable vector of exactly NINA_EMBEDDING_DIMENSIONS', () => {
    // The dimension is pinned HERE and not by `ci:schema-drift-guard`, on purpose: a vector's
    // width lives in `pg_attribute.atttypmod`, which `information_schema.columns` does not carry,
    // so the live guard folds both spellings to bare `vector` and says nothing about the number.
    // That narrowing is declared in scripts/check-schema-drift.mjs; this is the assertion it
    // hands the question to. If the model is ever swapped, this line is the one that goes red.
    expect(sqlType(schema.ninaAvatars, 'description_embedding')).toBe(
      `vector(${schema.NINA_EMBEDDING_DIMENSIONS})`,
    )
    // Nullable and no default: every row in the album today has no embedding, which is what
    // makes the ADD COLUMN a no-rewrite migration and no backfill a legal end state.
    expect(columns(schema.ninaAvatars).get('description_embedding')?.notNull).toBe(false)
    expect(columns(schema.ninaAvatars).get('description_embedding')?.hasDefault).toBe(false)
  })

  it('the HNSW index names the cosine operator class the search query will use', () => {
    // An `l2` index under a `<=>` query does not error — it silently falls back to a seq scan,
    // which is the worst kind of wrong because nothing reports it. One operator class, both ends.
    const hnsw = cfg(schema.ninaAvatars).indexes.find(
      (i) => i.config.name === 'nina_avatars_description_embedding_hnsw_idx',
    )
    expect(hnsw?.config.method).toBe('hnsw')
    expect(hnsw?.config.unique).toBe(false)
    expect(hnsw?.config.where).toBeUndefined()
  })
```

**Impact:** `npm test` returns to green for this file. No other test file references `ninaAvatars`' column or index list.

---

### Step 6: Teach the schema-drift guard about `vector`

**File:** `scripts/check-schema-drift.mjs:80-92` and `tests/db.schemaDrift.test.ts:78-110`
**Change:** This is the first non-builtin column type in the repo, and without this the guard reports a permanent false positive on a clean database. `normalizePgType` reads a `USER-DEFINED` column through `udt_name`, so the live side already says `vector`; `normalizeSnapshotType` passes `vector(1536)` through unchanged. `wantType !== gotType` → a failure line, forever, on every local run after the migration. A gate that reports a finding on a clean database is a gate people stop running — which the guard's own header (`:73-76` of its test) names as the failure mode it is pinned against. It is in scope for this phase because this phase is what causes it, and no peer phase touches `scripts/`.

**6a — the rule.** In `normalizeSnapshotType`, insert after the `numeric` rule and before the `varchar` one:

```js
  // drizzle writes `numeric(5, 3)` with a space; information_schema has no spelling at all.
  const numeric = /^numeric\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(t)
  if (numeric) return `numeric(${numeric[1]},${numeric[2]})`
  /*
   * pgvector (2026-09-15, nina_avatars.description_embedding). The snapshot spells the dimension
   * — `vector(1536)` — and `information_schema.columns` structurally cannot: a vector's width
   * lives in `pg_attribute.atttypmod`, which this script's query does not read. So both sides fold
   * to bare `vector` and this comparator checks the TYPE while saying nothing about the width.
   *
   * That is a NARROWING, and it is declared here rather than hidden: the width is pinned instead
   * by `tests/db.schema.nina.test.ts`, which asserts `vector(NINA_EMBEDDING_DIMENSIONS)` against
   * the schema — and the client validates every response against that same constant before it can
   * reach the column (`lib/nina/embedding.ts`'s width guard). Three places, one number.
   *
   * It is NOT a widening. `halfvec`, `sparsevec` and `bit` are distinct udt_names and stay
   * distinct; the negative control in this script's test pins that.
   */
  const pgvector = /^vector\s*\(\s*\d+\s*\)$/.exec(t)
  if (pgvector) return 'vector'
  const varchar = /^varchar\s*\(\s*(\d+)\s*\)$/.exec(t)
```

No change is needed in `normalizePgType` — `dataType === 'USER-DEFINED'` already returns `udtName`, which is `vector`.

**6b — the test table** at `tests/db.schemaDrift.test.ts:78-95`. Add one row, after the `numeric(4, 1)` row:

```ts
    ['numeric(4, 1)', { dataType: 'numeric', numericPrecision: 4, numericScale: 1 }],
    ['vector(1536)', { dataType: 'USER-DEFINED', udtName: 'vector' }],
    ['varchar(255)', { dataType: 'character varying', charMaxLength: 255 }],
```

**6c — the negative control** at `tests/db.schemaDrift.test.ts:97-110`. Append inside the existing `it('does NOT fold genuinely different types together')`:

```ts
    // The vector fold drops the DIMENSION (information_schema cannot report it) — it must not
    // also drop the TYPE. `halfvec` is half-precision and `sparsevec` is a different storage
    // shape; neither is interchangeable with `vector`, and folding them would hide a real
    // migration mistake behind a rule written for a reporting gap.
    expect(normalizeSnapshotType('vector(1536)')).not.toBe(
      normalizePgType({ dataType: 'USER-DEFINED', udtName: 'halfvec' } as never),
    )
    expect(normalizeSnapshotType('vector(1536)')).toBe(
      normalizePgType({ dataType: 'USER-DEFINED', udtName: 'vector' } as never),
    )
```

**Impact:** `npm run ci:schema-drift-guard` stays truthful. CI runs the static half only (its `DATABASE_URL` is a dummy), so CI is unaffected either way; this is for the operator's local run after Step 7.

---

### Step 7: Generate the migration, hand-prefix the extension, then apply

**Files:** `drizzle/0022_nina_avatar_embedding.sql`, `drizzle/meta/0022_snapshot.json`, `drizzle/meta/_journal.json`
**Change:** `drizzle-kit` does not emit `CREATE EXTENSION` for pgvector — it generates the `ADD COLUMN` and the `CREATE INDEX` and assumes the extension is there. On this database it is not. So the generated file is hand-prefixed, exactly as `0020_image_gen_controls.sql` carries a hand-written header comment. **Edit before applying, never after:** drizzle's ledger joins on the SHA-256 of the file's text, so a post-apply edit makes the drift guard report a foreign ledger row forever.

```bash
cd /home/miftah/.worktrees/run-insights/admin-album-semantic-search
npx drizzle-kit generate --name nina_avatar_embedding
```

Expected generated body (two statements). If drizzle-kit's spelling differs, **keep its output** and only prepend the header and the `CREATE EXTENSION` line:

```sql
-- The 2026-09-15 album semantic search. Additive only: one NULLABLE vector column and its
-- cosine index. Nothing is backfilled here — every existing row keeps a NULL embedding, which
-- is a legal state forever (an unembedded photo is simply not in the search index), and the
-- backfill is its own deliberately-run entry point in the next phase.
--
-- CREATE EXTENSION is hand-written: drizzle-kit emits the column and the index and assumes the
-- extension exists. Neon ships pgvector and `neondb_owner` may create it. IF NOT EXISTS so a
-- re-run, or a database where someone already enabled it, is a no-op rather than an error.
--
-- The HNSW build is instant here because every row is NULL — pgvector does not index NULLs, so
-- there is nothing to build over. This is the cheapest moment this index will ever cost.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "nina_avatars" ADD COLUMN "description_embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "nina_avatars_description_embedding_hnsw_idx" ON "nina_avatars" USING hnsw ("description_embedding" vector_cosine_ops);
```

Statement order is load-bearing and is the order above: extension, then column, then index.

Then the offline gate, then the write:

```bash
npm run db:check    # folder integrity only — no connection, safe to run any time
npm run db:migrate  # WRITES THE DATABASE. Read the note below first.
```

> **`db:migrate` writes production.** This repo has one database: `.env.local`'s `DATABASE_URL` / `DATABASE_URL_UNPOOLED` is the instance the deployed app reads. There is no separate dev instance, and the plan index's "scratch/dev check" wording should be read as `db:check` (which opens no connection) plus this deliberate, additive apply. It is safe to run **before** the code deploys precisely because it is additive — a nullable column and an index that no shipped code names. The rule it must not be confused with is the `DROP COLUMN` rule, which is the opposite (destructive migrations apply *after* the deploy).
>
> `drizzle.config.ts` already pins `DATABASE_URL_UNPOOLED` and refuses a pooled host, which is what this needs — an HNSW `CREATE INDEX` is a heavy operation and belongs on the direct connection.

Then confirm, from the database rather than from the migrator's exit code:

```bash
node --env-file=.env.local -e '
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL_UNPOOLED);
console.log(await sql`select extname, extversion from pg_extension where extname = ${"vector"}`);
console.log(await sql`
  select column_name, data_type, udt_name, is_nullable
  from information_schema.columns
  where table_name = ${"nina_avatars"} and column_name = ${"description_embedding"}`);
console.log(await sql`
  select indexname, indexdef from pg_indexes
  where tablename = ${"nina_avatars"} and indexname like ${"%hnsw%"}`);
'
```

Expect: one `pg_extension` row; one column row reading `USER-DEFINED` / `vector` / `YES`; one index row whose `indexdef` contains `USING hnsw` and `vector_cosine_ops`. `db:migrate` exiting 0 proves only that the migrator *decided* nothing was pending — it is the exact gate that stayed green over `0011_rare_blockbuster` for six days. Ask the database.

**Impact:** `nina_avatars` gains a column in production. No shipped code reads or writes it, so the running app is unaffected.

---

### Step 8: The unit suite

**File:** `lib/nina/embedding.test.ts` (new)
**Change:** Co-located `lib/**/*.test.ts`, matching `lib/nina/vision.test.ts`'s location and its mocking idiom exactly — `./errorlogs` mocked at the module boundary so the log row can be asserted without a database, and `OPENROUTER_API_KEY` defaulted at module scope in this one file rather than in `tests/support/setup.ts` (that list is documented as mirroring CI's env block byte for byte; editing one without the other leaves `npm test` and CI testing different things).

**Code:** the complete file.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NINA_EMBEDDING_DIMENSIONS } from '@/lib/db/schema'
import {
  NINA_EMBEDDING_MAX_CHARS,
  NINA_EMBEDDING_TIMEOUT_MS,
  NinaEmbeddingError,
  clampEmbedInput,
  embedErrorText,
  embedNinaTextWithFetch,
} from './embedding'
import { NINA_EMBEDDING_MODEL, OPENROUTER_EMBEDDINGS_URL } from './openrouter'

/*
 * `OPENROUTER_API_KEY` is NOT in `tests/support/setup.ts`'s `LLM_DEFAULTS`, and this phase
 * deliberately does not add it: that list is documented as mirroring `.github/workflows/ci.yml`'s
 * env block byte for byte. `lib/nina/vision.test.ts` sets the same default at its own module scope
 * for the same reason. The key is read lazily through `ninaEnv()` at call time, so one default in
 * each file that needs it is enough — and `??=` means a real `.env` never loses.
 *
 * Nothing is sent anywhere: every case below drives an injected `fetch`.
 */
process.env.OPENROUTER_API_KEY ??= 'unit-test-openrouter-key-never-sent'

/*
 * `lib/nina/embedding.ts` imports `logNinaError` from `./errorlogs`, which talks to the database.
 * Mocked at the module boundary so the failure cases assert THE ROW THAT WOULD BE WRITTEN without
 * one — `vision.test.ts`'s construction.
 */
const logNinaError = vi.fn<(entry: unknown) => Promise<void>>(async () => {})
vi.mock('./errorlogs', () => ({
  logNinaError: (entry: unknown) => logNinaError(entry),
}))

/** A well-formed vector of exactly the declared width. */
function vectorOf(n = NINA_EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: n }, (_, i) => (i % 7) / 10)
}

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

function okBody(vector: unknown = vectorOf()) {
  return { object: 'list', data: [{ object: 'embedding', index: 0, embedding: vector }] }
}

beforeEach(() => {
  logNinaError.mockClear()
})

describe('clampEmbedInput', () => {
  it('trims, and leaves anything of a realistic length alone', () => {
    // A described photo is 60-140 words (~900 chars) because the describe prompt asks for that,
    // and a search query is a sentence. Nothing legitimate is ever truncated.
    expect(clampEmbedInput('  a woman on a trail  ')).toBe('a woman on a trail')
    const realistic = 'x'.repeat(900)
    expect(clampEmbedInput(realistic)).toBe(realistic)
  })

  it('clamps a caller that hands over something that is not prose', () => {
    // The guard's real job: a data: URI or a stringified row, one careless line away on the
    // vision path — `lib/nina/errorlogs.ts`'s NINA_ERROR_LOG_TEXT_MAX note, same argument.
    const huge = 'y'.repeat(NINA_EMBEDDING_MAX_CHARS + 5_000)
    expect(clampEmbedInput(huge)).toHaveLength(NINA_EMBEDDING_MAX_CHARS)
  })

  it('appends no truncation marker — this string is sent to a model, not shown to a human', () => {
    const clamped = clampEmbedInput('z'.repeat(NINA_EMBEDDING_MAX_CHARS + 10))
    expect(clamped).not.toMatch(/truncated/i)
  })
})

describe('the request this module sends', () => {
  it('posts the probed shape to the embeddings endpoint, with the key and the ceiling', async () => {
    const fetchImpl = respond(okBody())
    await embedNinaTextWithFetch(fetchImpl, '  a woman in a red jacket  ')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(OPENROUTER_EMBEDDINGS_URL)
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
    expect(JSON.parse(String(init.body))).toEqual({
      model: NINA_EMBEDDING_MODEL,
      // TRIMMED — clampEmbedInput runs before the request, not after it.
      input: 'a woman in a red jacket',
      // Explicit, because several providers behind this broker default to base64 packing.
      encoding_format: 'float',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('honours a caller-supplied ceiling, and defaults to the measured one', () => {
    // The constant itself is the contract phase 2 budgets its after() callback against.
    expect(NINA_EMBEDDING_TIMEOUT_MS).toBe(15_000)
  })

  it('refuses empty text BEFORE the vendor, and writes no log row for it', async () => {
    // A programmer error, not a degraded query: one throw, zero rows — the placement
    // `describeNinaImagesWithFallback` uses for its empty-array check.
    const fetchImpl = respond(okBody())
    await expect(embedNinaTextWithFetch(fetchImpl, '   ')).rejects.toBeInstanceOf(
      NinaEmbeddingError,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(logNinaError).not.toHaveBeenCalled()
  })
})

describe('the width guard', () => {
  it('returns the vector when it is exactly the declared width', async () => {
    const vector = vectorOf()
    const got = await embedNinaTextWithFetch(respond(okBody(vector)), 'a trail at sunrise')
    expect(got).toHaveLength(NINA_EMBEDDING_DIMENSIONS)
    expect(got).toEqual(vector)
    expect(logNinaError).not.toHaveBeenCalled()
  })

  it('refuses a vector of the wrong width, naming BOTH numbers', async () => {
    // This is the module's token floor. A wrong width must not reach the column: the failure
    // would otherwise surface as an opaque pgvector INSERT error inside an after() callback,
    // hours after whoever swapped the model has stopped looking.
    const fetchImpl = respond(okBody(vectorOf(NINA_EMBEDDING_DIMENSIONS - 1)))
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(
      new RegExp(String(NINA_EMBEDDING_DIMENSIONS)),
    )
    expect(logNinaError).toHaveBeenCalledTimes(1)
  })

  it('refuses a right-width vector carrying a non-finite element', async () => {
    // pgvector refuses NaN too; finding out here costs one pass over a vector we already have.
    const poisoned = vectorOf()
    poisoned[3] = Number.NaN
    await expect(
      embedNinaTextWithFetch(respond(okBody(poisoned)), 'a trail'),
    ).rejects.toBeInstanceOf(NinaEmbeddingError)
  })

  it('refuses a base64-packed vector rather than reporting a confusing length', async () => {
    // What arrives when `encoding_format` is dropped from the request. A string is not an array.
    await expect(
      embedNinaTextWithFetch(respond(okBody('AAAAgD8AAABA')), 'a trail'),
    ).rejects.toThrow(/no vector at data\[0\]\.embedding/)
  })
})

describe('failures, and the row each one writes', () => {
  it('wraps a thrown fetch and logs it against the text category', async () => {
    const boom = vi.fn(async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch

    await expect(embedNinaTextWithFetch(boom, 'a trail', { userId: 'u1' })).rejects.toBeInstanceOf(
      NinaEmbeddingError,
    )

    expect(logNinaError).toHaveBeenCalledTimes(1)
    const entry = logNinaError.mock.calls[0]?.[0] as Record<string, unknown>
    // 'text' and not a fourth NinaErrorCategory: an embedding IS a text-model call, and the
    // existing Text tab on /admin/error-logs is where an operator looks for one.
    expect(entry.category).toBe('text')
    expect(entry.provider).toBe('openrouter')
    expect(entry.model).toBe(NINA_EMBEDDING_MODEL)
    expect(entry.timeoutMs).toBe(NINA_EMBEDDING_TIMEOUT_MS)
    // This path never holds a photo — an image search arrives here as caption TEXT, and the
    // describe call that produced it logs its own row with its own image link.
    expect(entry.imageUrl).toBeNull()
    expect(entry.userId).toBe('u1')
    expect(String(entry.errorMessage)).toContain('ECONNRESET')
    // The real input, so the row is diagnosable. No base64 can reach it — the clamp bounds it.
    expect(String(entry.fullInput)).toContain('a trail')
  })

  it('reports a non-2xx with the raw body snippet, which a JSON parse would have thrown away', async () => {
    const fetchImpl = respond({ error: { message: 'no endpoints found for this model' } }, 404)
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(
      /returned 404.*no endpoints found/s,
    )
    expect(logNinaError).toHaveBeenCalledTimes(1)
  })

  it('reports a non-JSON body without pretending it parsed', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    ) as unknown as typeof fetch
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(/not valid JSON/)
  })

  it('never lets a logging failure change the call outcome', async () => {
    // The doubled guard `recordDescribeFailure` holds: logNinaError is specified best-effort, and
    // this catch is that guarantee held where it is depended on.
    logNinaError.mockRejectedValueOnce(new Error('neon is down'))
    const fetchImpl = respond({ error: 'nope' }, 500)
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(/returned 500/)
  })

  it('keeps the detail that String(cause) would drop', () => {
    const err = new NinaEmbeddingError('something broke', new Error('the real cause'))
    expect(embedErrorText(err)).toContain('the real cause')
    expect(embedErrorText(new NinaEmbeddingError('bare'))).toBe('NinaEmbeddingError: bare')
    expect(embedErrorText('a string')).toBe('a string')
  })
})
```

**Impact:** `npm test` green. No network, no database, no live vendor call — `vitest.config.ts`'s §4.9 rule ("no test may call a live LLM except the explicitly-tagged live suites") is kept by construction, since every case drives an injected `fetch`.

---

## Verification

**Install (first, once):**
```bash
cd /home/miftah/.worktrees/run-insights/admin-album-semantic-search && cp /home/miftah/run-insights/.env.local .env.local && npm install
```

**Build / typecheck:**
```bash
npm run typecheck            # next typegen && tsc --noEmit — vitest does NOT typecheck
npm run build                # the real Turbopack build; a node_modules symlink fails here
```

**Tests:**
```bash
npm test
npx vitest run lib/nina/embedding.test.ts tests/db.schema.nina.test.ts tests/db.schemaDrift.test.ts
```

**Guards:**
```bash
npm run ci:openrouter-guard     # must stay green: the new file is under lib/nina/
npm run ci:schema-drift-guard   # static half always; live half after Step 7's migrate
npm run format:check
npm run lint
```

**Knip:** `npm run knip` will report `embedNinaText`, `NinaEmbeddingError`, `NinaEmbedOptions`, `NINA_EMBEDDING_TIMEOUT_MS` and `NINA_EMBEDDING_DIMENSIONS` as unused exports — nothing imports them until phases 2 and 3 land. **Do not suppress and do not delete them.** If knip is a hard gate on this branch, annotate at the symbol with a one-line reference to the consuming phase and remove the annotation when that phase lands; a foundation phase whose exports have no consumer yet is the one legitimate case here.

**Manual check (after Step 7's `db:migrate`):** run Step 7's `information_schema` / `pg_indexes` query. Expect the `vector` extension present, `description_embedding` reported as `USER-DEFINED` / `vector` / nullable, and one index whose `indexdef` contains `USING hnsw` and `vector_cosine_ops`. Do not accept `db:migrate`'s exit code as the answer — that is the gate that stayed green over `0011_rare_blockbuster` for six days.

**Exit criteria:**
1. The probe's model id, status, measured dimension and usage are recorded verbatim and dated in `NINA_EMBEDDING_MODEL`'s doc comment, and `NINA_EMBEDDING_DIMENSIONS` equals the measured length.
2. `drizzle/0022_nina_avatar_embedding.sql` exists, begins with `CREATE EXTENSION IF NOT EXISTS vector;`, is journalled at idx 22, and `npm run db:check` passes.
3. The database, asked directly, reports the extension, the nullable `vector` column and the HNSW cosine index.
4. `npm test`, `npm run typecheck`, `npm run build`, `npm run ci:openrouter-guard` and `npm run ci:schema-drift-guard` all pass.
5. `embedNinaText('some prose')` returns a `number[]` of exactly `NINA_EMBEDDING_DIMENSIONS`, proven against a mocked `fetch`; every documented failure mode throws `NinaEmbeddingError` and writes exactly one `nina_error_logs` row (except empty input, which writes none).
6. `git diff --name-only` names no file under `lib/admin/`, `lib/nina/queries/`, `components/` or `app/` — in particular not `lib/nina/queries/columns.ts` or `lib/nina/queries/shapes.ts`, which phases 2 and 3 both depend on being unwidened.

---

## Handoffs

**To Phase 2 (deferred describe + embed + backfill):**
- `embedNinaText(text, { userId })` **throws** on failure and has already written its own `nina_error_logs` row. Catch it, do not log a second row, and leave `description_embedding` NULL — a NULL embedding is a legal state and costs only invisibility in search.
- Write `description` and `description_embedding` in the **same** update. A row with prose and a NULL vector looks healthy in the explorer and is silently missing from every search — the one failure mode here with no symptom. Consider making the backfill's report distinguish "no description" from "description but no embedding"; they need different repairs.
- drizzle maps `descriptionEmbedding` to and from `number[]` itself. Do **not** hand-format a `'[0.1,0.2]'` string.
- Budget the `after()` callback against `NINA_EMBEDDING_TIMEOUT_MS` (15 s), not the describe path's 25/30 s.

**To Phase 3 (search query layer):**
- **The analysis is wrong on one point.** It states (`Reference List`, `Dependencies`) that `drizzle-orm@0.45.2` exports no `cosineDistance` helper and that a raw `sql` template with `<=>` is required. It does: `cosineDistance` is exported from the package root (`node_modules/drizzle-orm/sql/functions/vector.d.ts`, re-exported via `sql/index.d.ts:2`), verified by `require('drizzle-orm').cosineDistance` in this repo's installed tree. `1 - cosineDistance(ninaAvatars.descriptionEmbedding, queryVector)` is the similarity, and it composes into `.orderBy()` and into a select projection.
  **Reconciled (2026-09-15): phase 3 has read the helper's source and still hand-rolls the operator, deliberately.** `cosineDistance`'s body is `sql\`${column} <=> ${JSON.stringify(value)}\`` — it binds the vector with **no `::vector` cast**, and all three of phase 3's searches need the distance composed into something else anyway (a `1 - d` similarity, and for R4 a weighted sum of two distances). Its one private `cosineDistanceTo` helper owns the operator, the cast and the encoding once. Do not "fix" phase 3 to use the import; the fact above is recorded so the analysis's wrong claim does not get re-litigated, not as a change request.
- The index is `vector_cosine_ops`. A query expressed with `l2Distance` or `innerProduct` will not error — it will silently fall back to a sequential scan.
- Vectors are stored **un-normalised**. Cosine distance handles that correctly; do not assume unit length if you switch to inner product.
- `description_embedding IS NOT NULL` is worth an explicit predicate for readability even though the distance predicate skips NULLs anyway — search results must never include an unembedded row.

**To Phase 4 (UI):** nothing from this phase.

**Deliberately not done (and why), for the reconciler:**
- **No `'embedding'` `NinaErrorCategory`.** It is pinned by name and order in `lib/db/schema/admin.ts:51,54`, `lib/admin/errorLogModel.ts:62,69`, `tests/db.schema.errorlogs.test.ts:157` and `lib/admin/errorLogModel.test.ts:54`. Adding one is a four-file edit reaching into an admin UI model for a tab nobody asked for. Embedding failures land under `'text'`, which is where an operator looking for a failed text-model call would look. If a future phase wants the tab, it is a self-contained five-file change.
- **No live-suite case** (`tests/live/embedding.live.test.ts`). The probe in Step 1 is the live confirmation and it is recorded in the doc comment; a permanent live suite would be a second thing to keep in step for a call with no branching logic. If phase 3's ranking ever needs a live end-to-end, that suite belongs there, over the whole search path.
- **No `encoding_format: 'base64'` support, no batch `input: string[]`.** The vendor accepts an array and phase 2's backfill might want one — that is phase 2's call to make against a re-probe, and adding an unused batch path here would be shipping an unprobed request shape.
- **`scripts/check-schema-drift.mjs` is touched by this phase.** No peer phase touches `scripts/`; if the reconciler finds one that does, this edit is the load-bearing one — without it the guard false-fails on every clean database for good.

---

## Rollback

**Code only (phases 2-4 not yet landed, or being reverted with it):**
```bash
git revert <phase-1 commit>
```
Reverts the schema declaration, the two constants, `lib/nina/embedding.ts`, the tests, and the drift-guard rule. Nothing outside this phase imports any of it, so nothing else breaks.

**The database.** The revert does **not** undo the applied migration, and it should not be undone reflexively — the column is nullable and unreferenced, so leaving it costs nothing but a line in `information_schema`. Leaving it, however, makes `ci:schema-drift-guard` report `"nina_avatars"."description_embedding" exists in the database but is NOT declared in the schema` (correctly, and flagged as latent because it has no NOT NULL). Two clean ends:

- **Preferred — leave it and re-land.** The drift line is accurate and harmless, and re-landing the phase silences it.
- **Full removal** — a new forward migration, never a hand-edited or deleted `0022`:
  ```sql
  DROP INDEX IF EXISTS "nina_avatars_description_embedding_hnsw_idx";--> statement-breakpoint
  ALTER TABLE "nina_avatars" DROP COLUMN IF EXISTS "description_embedding";
  -- The extension is left in place: dropping it would fail if anything else ever adopts it,
  -- and an unused extension costs nothing.
  ```
  Generate it (`npx drizzle-kit generate --name drop_nina_avatar_embedding`) after removing the column from the schema file, so the snapshot chain stays unbroken. **Never** delete or renumber `0022` — a renamed migration is skipped silently, and a removed one leaves a ledger row matching no file, which the drift guard reports as "the database ran SQL this repo can no longer reproduce". This is a `DROP COLUMN`, so it applies **after** the code that stopped naming the column is deployed.
