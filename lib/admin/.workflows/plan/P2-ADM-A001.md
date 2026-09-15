> Adopted from `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md` phase 2. Source: `.workflows/plan/admin-album-semantic-search/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: Description coverage: deferred describe+embed wiring + backfill

**Plan set:** `ADMIN_ALBUM_SEMANTIC_SEARCH_PLAN.md`
**Analysis:** `20260915-085928-9RVY_code_analyzer.md`
**Satisfies:** R2, R3, R4 — every semantic search mode reads `nina_avatars.description_embedding`; this phase is the only thing that ever writes one. Without it phase 3's query ranks an empty column.
**Depends on:** Phase 1 (the `description_embedding` column + `embedNinaText`)
**Difficulty:** NORMAL
**Package:** `lib/admin`

---

## Goal

After this phase, every code path that can put prose into `nina_avatars.description` also puts a
vector into `nina_avatars.description_embedding`, and a folder upload describes+embeds **every**
row it inserted instead of only `rows[0]` — still through one non-blocking `after()` per batch,
still with zero added latency on the upload response. A one-time admin-gated backfill sweeps the
rows that already exist (description NULL, or description present with no embedding), so phase 3's
search covers the whole album on day one rather than the handful of rows that were promoted,
shared or hand-described.

## Interface Contract

**Creates:**
- `lib/nina/queries/avatarEmbeddings.ts` (new module) exporting, through the `lib/nina/queries`
  barrel: `listNinaAvatarDescribeTargets`, `listNinaAvatarDescribeBacklog`,
  `countNinaAvatarDescribeBacklog`, `setNinaAvatarDescriptionAndEmbedding`, and the type
  `NinaAvatarDescribeTarget`.
- `lib/admin/ninaAlbumDeferredDescribe.ts`: `scheduleDescribeAll(userId, ids)`,
  `scheduleEmbed(userId, id)`, `fillNinaAvatarDescribeTargets(userId, targets, budgetMs)`,
  `embedNinaAvatarDescription(text, userId)`, `NINA_DEFERRED_DESCRIBE_CONCURRENCY`,
  `NINA_DEFERRED_DESCRIBE_BUDGET_MS`, `NINA_ALBUM_BACKFILL_BUDGET_MS`,
  `NINA_ALBUM_BACKFILL_SLICE`, and the type `NinaDescribeFillOutcome`.
- `app/api/admin/nina/backfill-descriptions/route.ts` (new): `GET` (counts only, spends nothing),
  `POST` (one bounded slice), `export const maxDuration = 300`.
- `tests/admin.albumDescribeEmbed.test.ts` (new).

**Signature changes:** none. `scheduleDescribe(userId, id)` keeps its exact signature and becomes a
one-id wrapper over `scheduleDescribeAll`, so its three existing call sites compile untouched.

**Deletes:** the caller-side guard `if (avatar.description == null)` at
`lib/admin/ninaAlbumAvatarActions.ts:155` (the scheduler decides, as its own docstring already
argues). No symbol is deleted.

**Renames:** none.

**Modifies (one line each, additive):**
- `lib/nina/queries.ts:67` — one `export * from './queries/avatarEmbeddings'` line, inserted
  **immediately after `export * from './queries/avatars'`**, plus one header-map line. Phase 3 adds
  `./queries/avatarsearch` immediately after this phase's line; the reconciled final order is
  `avatars`, `avatarEmbeddings`, `avatarsearch`. See Step 2 for the block both plans now quote.
- `lib/nina/queries.test.ts:26-114` — four names added to `BARREL_VALUE_EXPORTS`, sorted.
  **RECONCILED (2026-09-15): this phase owns the header's prose counts** (`:11` and the ADDED-name
  note at `:21-24`) and writes the post-both-phases number **92** (85 today + 4 here + 3 in phase 3).
  Phase 3 adds its three names to the array and does **not** touch those prose lines, so the one
  same-line collision between the two concurrent phases is gone. The array insertions themselves are
  additive to one sorted list and reconcile by union — Step 2 quotes the final state of the region
  the two phases share.
- `app/admin/nina/page.tsx:80` — adds `export const maxDuration = 300` beside the existing
  `export const dynamic = 'force-dynamic'`. Segment config only; not a render change. **Flagged for
  phase 4, which may also touch this file.**

**Requires (from Phase 1):**
1. `lib/db/schema/nina/avatars.ts` declares the column as drizzle property **`descriptionEmbedding`**
   mapping to SQL **`description_embedding`**, nullable.
2. `lib/nina/embedding.ts` exports
   `embedNinaText(text: string, opts?: { userId?: string | null; timeoutMs?: number }): Promise<number[]>`,
   which **throws** on vendor failure (mirroring `lib/nina/vision.ts`'s idiom) and does its own
   `logNinaError`. This phase never inspects the error, only catches it.
3. Phase 1 **must not** add `descriptionEmbedding` to `avatarColumns`
   (`lib/nina/queries/columns.ts`) or to `NinaAvatarRow` (`lib/nina/queries/shapes.ts`). Two
   reasons, both load-bearing: (a) `listNinaAvatarsInFolder` returns `NINA_ADMIN_PAGE_SIZE = 120`
   rows per render and a vector of ~1536 floats per row is ~1.5 MB of wire per page for a value no
   renderer reads; (b) `avatarColumns` is a positional projection frozen by hand-written
   `projectedRow(...)` helpers in `tests/admin.albumAvatarActions.test.ts`,
   `tests/admin.chatPhotoAdoption.test.ts` and siblings — widening it breaks four suites this
   phase does not own. Every read of the vector in this phase is a narrow projection that selects
   `description_embedding IS NOT NULL`, never the vector itself.

**Leaves alone (owned by others):**
- `lib/db/schema/nina/avatars.ts`, `drizzle/**`, `lib/nina/openrouter.ts`, `lib/nina/embedding.ts`
  (Phase 1).
- Any new `lib/nina/queries/*` search module, `lib/admin/ninaAlbumSearchActions.ts` (Phase 3).
- `components/**` in its entirety (Phase 4). This phase adds **no UI**; its backfill is reached by
  HTTP, not by a button.
- `lib/nina/vision.ts` — called, never edited.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/avatarEmbeddings.ts` | create | the four narrow reads/writes over `description_embedding` |
| `lib/nina/queries.ts` | modify (`:72`) | one `export *` line for the new module |
| `lib/nina/queries.test.ts` | modify (`:26-114`) | four names into the frozen barrel surface, **and both prose counts (`:11`, `:21-24`) — this phase owns them and writes 92 for the finished set; phase 3 writes none** |
| `lib/admin/ninaAlbumDeferredDescribe.ts` | rewrite | batch + embed + wall-clock budget; `scheduleDescribe` kept as a wrapper |
| `lib/admin/ninaAlbumUploadActions.ts` | modify (`:179-183`) | schedule every inserted row, one `after()` per batch |
| `lib/admin/ninaAlbumDescribeActions.ts` | modify (`:54-66`, `:104-116`) | describe writes the embedding in band; a hand edit NULLs it and schedules a re-embed |
| `lib/admin/ninaAlbumAvatarActions.ts` | modify (`:155`) | drop the caller-side `description == null` guard |
| `app/admin/nina/page.tsx` | modify (`:80`) | `export const maxDuration = 300` — `after()` inherits the SEGMENT's budget |
| `app/api/admin/nina/backfill-descriptions/route.ts` | create | the one-time backfill entry point |
| `tests/admin.albumAvatarActions.test.ts` | modify (`:44-57`, `:230-290`, `:381-500`) | mock the embedding client; the deferred assertions move to the batch shape |
| `tests/admin.chatPhotoAdoption.test.ts` | modify (`:57-70`, `:300-330`) | same, plus adoption now schedules an embed for a copied description |
| `tests/admin.albumDescribeEmbed.test.ts` | create | the phase's own suite |

---

## Implementation Steps

### Step 1: The query module — four narrow reads/writes that never pull a vector

**File:** `lib/nina/queries/avatarEmbeddings.ts` (new)
**Change:** A sibling module in the 2026-09-12 `lib/nina/queries/` split, holding everything the
describe+embed pipeline needs. It is a separate module rather than four more functions in
`avatars.ts` so that phase 3's search module and this one do not edit the same file.

**Code:**

```ts
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaAvatars } from '@/lib/db/schema'

/**
 * §9c Avatar description embeddings — the derived column the album's semantic search ranks by,
 * and the four statements that fill it. `admin-album-semantic-search` phase 2.
 *
 * ── WHY A MODULE OF ITS OWN, BESIDE `queries/avatars.ts` ────────────────────────────────────
 * Two reasons, and the second is the one that matters. First, these four reads exist for one
 * pipeline (`lib/admin/ninaAlbumDeferredDescribe.ts`) rather than for the album's file-manager
 * surface. Second, and load-bearing: **none of them may go through `avatarColumns`.**
 * `description_embedding` is ~1536 float4s. `listNinaAvatarsInFolder` returns
 * `NINA_ADMIN_PAGE_SIZE = 120` rows per render, and adding the vector to the shared projection
 * would put ~1.5 MB of numbers on the wire per page for a value no renderer reads and no prompt
 * is shown. So every statement below either selects `IS NOT NULL` (a boolean fact) or writes the
 * column — the vector itself is never SELECTed anywhere in this repo except by the search query,
 * where it stays inside Postgres as an operand of `<=>`.
 *
 * ── THE ONE THING A CALLER MAY CONCLUDE FROM `hasEmbedding` ─────────────────────────────────
 * `hasEmbedding === false` means "this row's prose is not searchable yet". It does NOT mean the
 * stored vector is stale: a description that is REWRITTEN has its embedding set to NULL in the
 * same UPDATE (`editNinaAvatarDescriptionAction`), precisely so that this boolean stays the whole
 * truth and nothing has to compare a hash of the prose against the vector.
 *
 * Ownership scoping (the layer's invariant 1) is unconditional here as everywhere: `user_id` is in
 * the WHERE of all four.
 */

/**
 * One row as the describe+embed worker needs it: enough to call the vision model, plus the two
 * facts that decide whether it has to.
 */
export interface NinaAvatarDescribeTarget {
  id: string
  blobUrl: string
  pathname: string
  /** NULL means the vision model has never been asked about this photograph. */
  description: string | null
  /** `description_embedding IS NOT NULL` — the vector itself is deliberately not selected. */
  hasEmbedding: boolean
}

/**
 * `(… IS NOT NULL)::int` and `.mapWith(Number)` rather than a bare `sql<boolean>`.
 *
 * `count(*)` in `countNinaAvatars` already spells the numeric form for the same reason: what a
 * driver hands back for a Postgres `bool` is a driver detail, and an `int` that is mapped through
 * `Number` is one this layer decides. A `sql<boolean>` that arrives as the STRING `'f'` is truthy,
 * and the bug it would cause — "already embedded, skip" for every unembedded row — is silent.
 */
const hasEmbeddingExpr = sql<number>`(${ninaAvatars.descriptionEmbedding} is not null)::int`.mapWith(
  Number,
)

const describeTargetColumns = {
  id: ninaAvatars.id,
  blobUrl: ninaAvatars.blobUrl,
  pathname: ninaAvatars.pathname,
  description: ninaAvatars.description,
  embedded: hasEmbeddingExpr,
}

function toTarget(row: {
  id: string
  blobUrl: string
  pathname: string
  description: string | null
  embedded: number
}): NinaAvatarDescribeTarget {
  return {
    id: row.id,
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    description: row.description,
    hasEmbedding: row.embedded === 1,
  }
}

/**
 * The rows named by `ids`, as describe+embed targets. ONE statement for a whole upload batch —
 * `scheduleDescribeAll` reads fifty rows here rather than running fifty `getNinaAvatar` calls, and
 * the read still happens inside the `after()` callback so the caller pays nothing for it.
 *
 * An id that is not in the album, or not this user's, is simply absent from the result: "not
 * yours" and "does not exist" are the same outcome in this layer, and the worker's job is the rows
 * that came back, not the ones that did not.
 *
 * `ids` is empty-safe: `inArray(col, [])` generates a `false` predicate in drizzle 0.45, but a
 * round trip to say nothing is still a round trip, so it short-circuits.
 */
export async function listNinaAvatarDescribeTargets(
  userId: string,
  ids: readonly string[],
): Promise<NinaAvatarDescribeTarget[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select(describeTargetColumns)
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), inArray(ninaAvatars.id, [...ids])))
  return rows.map(toTarget)
}

/**
 * The album's unfinished work, oldest first: every row that has no description, plus every row
 * that has one and no embedding. The backfill route's read.
 *
 * ── OLDEST FIRST, AND WHY THAT IS THE SWEEP ORDER ───────────────────────────────────────────
 * `created_at asc` makes a repeated slice monotone: each POST finishes the oldest unfinished rows
 * and the next POST starts where the last one stopped, with no cursor to carry and no chance of a
 * slice re-picking rows a concurrent `after()` is already working on for long. (Two workers racing
 * the same row is harmless anyway — the UPDATE is idempotent and the second describe is wasted
 * money, not a wrong row.) `nina_avatars_user_created_idx` is declared DESC; a b-tree scans either
 * direction, so this is still an index range scan on `user_id`.
 */
export async function listNinaAvatarDescribeBacklog(
  userId: string,
  limit: number,
): Promise<NinaAvatarDescribeTarget[]> {
  const capped = Math.max(1, Math.trunc(limit))
  const rows = await db
    .select(describeTargetColumns)
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        or(isNull(ninaAvatars.description), isNull(ninaAvatars.descriptionEmbedding)),
      ),
    )
    .orderBy(ninaAvatars.createdAt)
    .limit(capped)
  return rows.map(toTarget)
}

/** How much work is left, split by which half of it is left. The backfill route's `GET`. */
export interface NinaAvatarDescribeBacklogCount {
  /** No prose yet — needs a vision call AND an embedding call. */
  missingDescription: number
  /** Prose but no vector — needs an embedding call only. */
  missingEmbedding: number
}

/**
 * Both counts in ONE statement, with `FILTER`. Two `count(*)` statements would be two round trips
 * for a number the operator reads once, and a `GET` that spends nothing should also not cost two.
 */
export async function countNinaAvatarDescribeBacklog(
  userId: string,
): Promise<NinaAvatarDescribeBacklogCount> {
  const counted = await db
    .select({
      missingDescription: sql<number>`count(*) filter (where ${ninaAvatars.description} is null)`.mapWith(
        Number,
      ),
      missingEmbedding: sql<number>`count(*) filter (where ${ninaAvatars.description} is not null and ${ninaAvatars.descriptionEmbedding} is null)`.mapWith(
        Number,
      ),
    })
    .from(ninaAvatars)
    .where(eq(ninaAvatars.userId, userId))
  return {
    missingDescription: counted[0]?.missingDescription ?? 0,
    missingEmbedding: counted[0]?.missingEmbedding ?? 0,
  }
}

/**
 * Write the prose and its vector in ONE UPDATE. The only writer of `description_embedding` that
 * fills it.
 *
 * ── WHY NOT A SECOND CALL BESIDE `setNinaAvatarDescription` ─────────────────────────────────
 * Because two statements have an order, and every order has a window in which the row is a lie:
 * prose-then-vector leaves a row whose vector describes the PREVIOUS prose (search returns the
 * photo for words it no longer matches), and vector-then-prose leaves the mirror. One `SET` of two
 * columns has no window. `setNinaAvatarDescription` is untouched and keeps its three callers — it
 * is still the right function for a write that is deliberately NOT accompanied by a vector.
 *
 * `embedding: null` is a real, expected argument, not a degenerate case: it is what a failed
 * embedding call writes, and it leaves the row in the exact state
 * `listNinaAvatarDescribeBacklog` picks up next time. The prose is never lost to a vendor that
 * would not answer.
 */
export async function setNinaAvatarDescriptionAndEmbedding(
  userId: string,
  id: string,
  description: string | null,
  embedding: number[] | null,
): Promise<boolean> {
  const updated = await db
    .update(ninaAvatars)
    .set({ description, descriptionEmbedding: embedding })
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .returning({ id: ninaAvatars.id })
  return updated.length > 0
}

/* `isNotNull` is imported for the FILTER predicates' drizzle-side twin in a future read; it is
 * referenced by `countNinaAvatarDescribeBacklog`'s raw template only. Remove the import if lint
 * flags it — nothing else in this module needs it. */
void isNotNull
```

> **Implementer note:** if `npm run lint` flags the trailing `void isNotNull`, delete both that
> line and `isNotNull` from the import list. It is there only because the two `FILTER` clauses are
> raw templates; the module is correct without it.

**Impact:** four new barrel exports; no existing query changes behaviour.

---

### Step 2: Wire the module into the barrel and its frozen surface test

**File:** `lib/nina/queries.ts:72`
**Change:** one `export *` line, in the module order the header documents.

**Code:** replace the export block's tail so it reads:

```ts
export * from './queries/shapes'
export * from './queries/sessions'
export * from './queries/messages'
export * from './queries/images'
export * from './queries/memory'
export * from './queries/shortcuts'
export * from './queries/nags'
export * from './queries/turns'
export * from './queries/avatars'
export * from './queries/avatarEmbeddings'
export * from './queries/tuning'
export * from './queries/imageprefs'
export * from './queries/jobphotos'
```

> **Reconciled shared region (2026-09-15).** Phase 3 of this set adds
> `export * from './queries/avatarsearch'` to the same block, **immediately after this phase's
> line**. The set's final order is `avatars`, `avatarEmbeddings`, `avatarsearch`. If phase 3 has
> already landed when you run, its line is present — insert yours **above** it and change nothing
> else; if git hands you a conflict here, the resolution is the union in that order, never a choice
> between the two lines.

And add one line to the module map in that file's header, directly under the `queries/avatars.ts`
row (phase 3 adds `queries/avatarsearch.ts §9d` directly under yours — one section number each, so
the two banners do not collide):

```
 *   queries/avatarEmbeddings.ts §9c    the description_embedding writes (semantic search)
```

**File:** `lib/nina/queries.test.ts:26-114`
**Change:** the frozen list grows by four, in sorted position, with the pointer the test's own
header demands. Insert `'countNinaAvatarDescribeBacklog'` immediately **before** `'countNinaAvatars'`
(line 30 today — `'D' < 's'` at the sixteenth character), and the two `list…` names immediately
**before** `'listNinaAvatarFolders'` (line 76).

**Code:** the four insertions, each with the same marker comment on the first of a run:

```ts
  'bumpNinaShortcutUses',
  // admin-album-semantic-search phase 2: the description_embedding writers, documented growth.
  // See `lib/nina/queries/avatarEmbeddings.ts`'s header for why they are a module of their own.
  'countNinaAvatarDescribeBacklog',
  'countNinaAvatars',
```

```ts
  'listNinaAvatarDescribeBacklog',
  'listNinaAvatarDescribeTargets',
  'listNinaAvatarFolders',
```

The third insertion lands in the one region **phase 3 also edits**. Its reconciled final state, once
both phases have landed, is exactly this — your one name plus phase 3's three, all sorted:

```ts
  'resolveNinaPhotoReference',
  // admin-album-semantic-search phase 3: the album's semantic search (R2/R3/R4).
  'searchNinaAvatarsByImageCaption',
  'searchNinaAvatarsByText',
  'searchNinaAvatarsByTextAndCaption',
  'setCurrentNinaAvatar',
  'setNinaAvatarDescription',
  // admin-album-semantic-search phase 2: writes prose and vector in one UPDATE.
  'setNinaAvatarDescriptionAndEmbedding',
```

If phase 3 has not landed yet, add only `'setNinaAvatarDescriptionAndEmbedding'` and leave the rest
of the region alone — the array must match the barrel **at your commit**, and the test compares the
array against `Object.keys(barrel)`, not against the prose. On a git conflict in this region, the
resolution is the union above.

**The header prose is THIS phase's to write, and it is written for the finished set.** At
`lib/nina/queries.test.ts:11`, `the 83 exported functions below` (already stale by two — the array
carries 85 today) becomes:

```
 * RUNTIME surface — the 92 exported functions below, sorted — derived mechanically from
```

and the ADDED-name paragraph (`:21-24`) gains:

```
 * admin-album-semantic-search takes it 85 → 92: four names in phase 2 (the
 * description_embedding writers) and three in phase 3 (the album's semantic search).
```

**Phase 3 does not touch either prose line** — that is the reconciled split, and it exists because
`:11` is a single line both phases would otherwise rewrite with a different number. If phase 3 is
reverted and this phase is not, the prose reads three high; correct it then rather than racing over
it now.

**Impact:** `npm test` stays green — the assertion is the array, and the array matches the barrel at
every commit of the set.

---

### Step 3: Rewrite the deferred pipeline — batch, embed, and a wall-clock budget

**File:** `lib/admin/ninaAlbumDeferredDescribe.ts` (whole file replaced)
**Change:** `scheduleDescribe` keeps its signature and becomes a one-id wrapper. The real entry
point takes many ids, reads them in one statement, and runs a fixed number of lanes against a
deadline. The embedding is computed and written in the same UPDATE as the description.

Three facts drive the design and each is argued in the file:

1. **`after()` inherits the ROUTE SEGMENT's `maxDuration`**, not the action's — stated verbatim at
   `app/admin/image-generation/page.tsx:76-79`. Fifty describes in one callback under the platform
   default would be killed mid-flight. Step 7 raises `/admin/nina`'s segment to 300 s; this file
   then refuses to *start* new work past a 240 s deadline, leaving 60 s of reserve.
2. A row that has prose but no vector needs the embedding call and **not** the vision call — which
   is exactly the chat-photo adoption case (`copyChatPhotoIntoAlbum` copies the chat row's
   `description` into the album row) and exactly the pre-phase-2 backlog. One worker covers both.
3. An embedding failure must not cost the prose. It is caught separately from the describe failure
   and writes `embedding: null`, which is precisely the state the backlog read picks up again.

**Code:**

```ts
import { after } from 'next/server'

import { describeSubjectForSide } from '@/lib/nina/album'
import { embedNinaText } from '@/lib/nina/embedding'
import {
  listNinaAvatarDescribeTargets,
  setNinaAvatarDescriptionAndEmbedding,
  type NinaAvatarDescribeTarget,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The deferred describe-and-embed pre-pass: the `after()` schedulers the action modules call when
 * rows land in the album, become her face, or have their prose rewritten. A `'use server'` module
 * may export only async functions (`lib/nina/album.ts:144-148`), and these are synchronous
 * schedulers — the constraint that once kept `scheduleDescribe` unexported beside the actions is
 * what gives it a plain module of its own. Its importers are the action modules behind the
 * `lib/admin/ninaAlbumActions.ts` barrel, plus
 * `app/api/admin/nina/backfill-descriptions/route.ts`, which reuses the per-row worker without
 * the `after()`.
 */

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE DESCRIBE PRE-PASS IS STILL OFF THE UPLOAD PATH. HALF THE ORIGINAL ARGUMENT IS REPEALED.
 *
 *  What it used to be: `registerNinaAvatarAction` awaited `describeNinaImages` on EVERY upload.
 *  That was correct, and its own comment said why — an uploaded image has no generation prompt,
 *  so `glm-4.6v` is the only way `nina_avatars.description` ever gets filled for it, and R25's
 *  "asked where she is in her new profile photo, Nina invents a story true to the photo" has
 *  nothing to work from otherwise.
 *
 *  What changed is the scale, and the user stated it as a requirement rather than an aside:
 *  *"i will put hundreds of profile pics in there."*
 *
 *  The measurement, from `lib/nina/vision.ts`'s own constants: a describe call is ~8-11 s typical
 *  (`NINA_DESCRIBE_TIMEOUT_MS = 25_000`, derived there from ~26-33 ms per completion token over
 *  ~220 output tokens plus 2-3 s of fixed overhead). Awaited once per upload, three hundred
 *  uploads is 40 minutes to 1.4 hours of wall clock the operator sits through, three hundred
 *  serverless invocations held open, and three hundred vendor bills. And Server Actions dispatch
 *  one at a time per client, so those latencies do not overlap. They add.
 *
 *  ── WHAT admin-album-semantic-search REPEALS, AND WHAT IT LEAVES STANDING ───────────────────
 *  The LATENCY argument stands, untouched and non-negotiable: no describe and no embedding call
 *  is ever awaited on the upload request path. The clause that is repealed is the other one —
 *  *"for descriptions of photographs Nina may never be shown."* R2 makes the description the
 *  SEARCH INDEX of the album ("we use semantic search to search to every image description we
 *  have"), so every photograph is now shown, to the search, the moment the operator types. A
 *  description that used to be speculative spend is now the feature. Which is why this file went
 *  from describing ONE row per batch to describing every row in it, and why
 *  `registerNinaAvatarsAction` no longer schedules only for `rows[0]`.
 *
 *  ── THE THREE BOUNDS THAT MAKE THAT SAFE ────────────────────────────────────────────────────
 *  1. It is still `after()`. The operator's upload response is unchanged, to the millisecond.
 *  2. `NINA_DEFERRED_DESCRIBE_CONCURRENCY` lanes, not `Promise.all`. Fifty simultaneous vision
 *     calls is a rate-limit incident; four is the number `EXPLORER_UPLOAD_CONCURRENCY` already
 *     chose for the same vendor exposure on the blob side.
 *  3. A WALL-CLOCK DEADLINE, because `after()` inherits the ROUTE SEGMENT's `maxDuration` and not
 *     the action's (`app/admin/image-generation/page.tsx:76-79` states it). `/admin/nina` declares
 *     300; this file stops STARTING rows at 240, and whatever it did not reach stays NULL —
 *     visibly, in `countNinaAvatarDescribeBacklog`, for the backfill route to finish. A worker
 *     that is killed mid-flight leaves the same state as one that never started, because the row
 *     is written per-row and not per-batch.
 *
 *  Every failure here is NON-FATAL, exactly as the old register-path pre-pass was: the row
 *  exists, the album renders, and a failure leaves a visible "Describe it" button rather than a
 *  lost upload or a refused promotion. That property is inherited, not re-litigated.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * How many rows the pre-pass works on at once.
 *
 * Four, and it is `EXPLORER_UPLOAD_CONCURRENCY`'s number for
 * `components/admin/explorer/useFolderUpload.ts`'s reason, one layer down: the bound exists so a
 * batch of fifty does not become fifty simultaneous vendor requests. It is spelled here rather
 * than imported from that hook because the hook is a client module and this is a server one — a
 * client component's import graph must not reach `lib/nina/queries`, which `app/admin/nina/page.tsx`
 * states as a rule for `NinaAvatarRow`.
 */
export const NINA_DEFERRED_DESCRIBE_CONCURRENCY = 4

/**
 * How long a scheduled batch may keep STARTING rows, in ms.
 *
 * 240_000 against the 300 s `/admin/nina` segment declares (step 7 of this phase), leaving 60 s of
 * reserve — enough for one in-flight describe at its own `NINA_DESCRIBE_TIMEOUT_MS = 25_000` plus
 * the OpenRouter fallback's `NINA_DESCRIBE_FALLBACK_TIMEOUT_MS = 30_000` to finish and write its
 * row rather than being cut off between the vendor answering and the UPDATE landing.
 *
 * It is a START gate, not a cancellation: a row that has begun always gets to finish or time out
 * on the vision client's own clock. Cancelling mid-describe would spend the money and keep none of
 * the answer.
 */
export const NINA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000

/** The backfill route's own budget. Same 300 s ceiling, same 60 s reserve. */
export const NINA_ALBUM_BACKFILL_BUDGET_MS = 240_000

/**
 * How many backlog rows one backfill POST reads. Deliberately larger than the budget can finish:
 * the read is one indexed statement and costs nothing, and over-reading is what lets the lanes
 * keep going right up to the deadline instead of idling because the slice ran dry.
 */
export const NINA_ALBUM_BACKFILL_SLICE = 200

/** What one run of the pre-pass did. Every field is a count of ROWS, not of vendor calls. */
export interface NinaDescribeFillOutcome {
  /** Rows that got prose from `glm-4.6v` (or its OpenRouter fallback) in this run. */
  described: number
  /** Rows whose `description_embedding` was written non-null in this run. */
  embedded: number
  /** Rows that threw. Their prose and vector are unchanged; they stay in the backlog. */
  failed: number
  /** Rows the deadline was reached before. Untouched, still in the backlog. */
  ranOutOfTime: number
  /** Rows that already had both and needed no vendor call at all. */
  alreadyDone: number
}

function emptyOutcome(): NinaDescribeFillOutcome {
  return { described: 0, embedded: 0, failed: 0, ranOutOfTime: 0, alreadyDone: 0 }
}

/**
 * Embed one description, or answer `null`.
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
  /* Passed through to `embedNinaText`'s failure log. Phase 1's contract asks for it in as many
   * words ("Phase 2 and 3 both have the id and should pass it") — `nina_error_logs.user_id` is
   * nullable, and a row that cannot say whose album it came from is a row nobody can act on. */
  userId: string,
): Promise<number[] | null> {
  try {
    return await embedNinaText(description, { userId })
  } catch (cause) {
    console.error('[f34] embedding failed; the description is kept and stays unsearchable', cause)
    return null
  }
}

/**
 * One row. Decides for itself what the row still needs, and writes both columns in one statement.
 *
 * `describe: false` is the rewrite path (`editNinaAvatarDescriptionAction`): the prose is the
 * human's and a vision call would be both wasteful and wrong. A row that has no prose under
 * `describe: false` is simply left alone — an operator who CLEARED the box asked for silence, and
 * "the empty box IS the clear" (D1) does not mean "and now go invent something".
 */
async function fillOne(
  userId: string,
  target: NinaAvatarDescribeTarget,
  describe: boolean,
  outcome: NinaDescribeFillOutcome,
): Promise<void> {
  try {
    let description = target.description

    if (description == null) {
      if (!describe) return
      /* An album row is a photograph of HER — the self witness, exactly as the describe button.
       * See `describeNinaAvatarAction`'s docstring for the wrong-prompt history. */
      const result = await describeNinaImages(
        [{ blobUrl: target.blobUrl, pathname: target.pathname }],
        { subject: describeSubjectForSide('hers') },
      )
      description = result.description
      outcome.described += 1
    } else if (target.hasEmbedding) {
      // Prose and vector both present: authoritative skip, and not one vendor call.
      outcome.alreadyDone += 1
      return
    }

    const embedding = await embedNinaAvatarDescription(description, userId)
    if (embedding != null) outcome.embedded += 1
    await setNinaAvatarDescriptionAndEmbedding(userId, target.id, description, embedding)
  } catch (cause) {
    outcome.failed += 1
    // Non-fatal, exactly as the old register-path pre-pass was. The "Describe it" button on the
    // card is the recovery, and it always was the recovery. The backfill route is the bulk one.
    console.error('[f34] deferred describe failed', target.id, cause)
  }
}

/**
 * A fixed number of lanes drawing from one shared index, stopping at a deadline.
 *
 * `next++` needs no lock: JavaScript is single-threaded and each lane only advances at an `await`
 * boundary, so the read-and-increment is atomic with respect to every other lane. This is
 * `useFolderUpload.ts`'s `runLanes`, one layer down, plus the deadline — and it is four lines
 * rather than a dependency.
 *
 * Past the deadline the lanes keep DRAINING the array without working, so `ranOutOfTime` is a
 * truthful count rather than "the rest, probably".
 */
async function runFillLanes(
  userId: string,
  targets: readonly NinaAvatarDescribeTarget[],
  describe: boolean,
  deadline: number,
): Promise<NinaDescribeFillOutcome> {
  const outcome = emptyOutcome()
  let next = 0
  const lanes = Array.from(
    { length: Math.min(NINA_DEFERRED_DESCRIBE_CONCURRENCY, targets.length) },
    async () => {
      for (;;) {
        const target = targets[next++]
        if (target == null) return
        if (Date.now() >= deadline) {
          outcome.ranOutOfTime += 1
          continue
        }
        await fillOne(userId, target, describe, outcome)
      }
    },
  )
  await Promise.all(lanes)
  return outcome
}

/**
 * Work a list of already-read targets to completion or to the budget. **No `after()`** — this is
 * the entry point for a caller that is already off the request path and wants the outcome in its
 * own return value, which today is `app/api/admin/nina/backfill-descriptions/route.ts`.
 */
export async function fillNinaAvatarDescribeTargets(
  userId: string,
  targets: readonly NinaAvatarDescribeTarget[],
  budgetMs: number,
): Promise<NinaDescribeFillOutcome> {
  return runFillLanes(userId, targets, true, Date.now() + budgetMs)
}

/**
 * Schedule the pre-pass for a set of rows, AFTER the response has gone out.
 *
 * ── WHY `after()` AND NOT `await` ───────────────────────────────────────────────────────────
 * The repo's own idiom for a second model call the caller must not wait on
 * (`lib/nina/actions.ts:782` schedules distillation the same way, for the same reason). It also
 * keeps invariant 4 trivially true: this is a Server Action, never a render, and the model call is
 * not even on the action's clock.
 *
 * ── WHY IT RE-READS THE ROWS INSIDE THE CALLBACK ────────────────────────────────────────────
 * So the caller pays nothing. `setCurrentNinaAvatarAction` would otherwise need an extra
 * `getNinaAvatar` on its hot path just to discover whether a describe is needed; here the read
 * happens after the operator already has their answer, and the skip is authoritative at the moment
 * the work would actually run. ONE statement for the whole batch —
 * `listNinaAvatarDescribeTargets`, not fifty `getNinaAvatar` calls.
 *
 * ── NO `revalidatePath` IN HERE, DELIBERATELY ───────────────────────────────────────────────
 * `after()` runs once the response is finished, so there is no re-render left to attach to — an
 * action's revalidation is what makes the framework include a fresh RSC payload in the SAME
 * response (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "A single response
 * carries data and UI"). `/admin/nina` is `force-dynamic` and its reads are not cached, so the
 * operator's next navigation shows the description with nothing to invalidate.
 * `ensureNinaAvatarDescriptionAction` is the in-band variant for a caller that needs the prose in
 * its own return value.
 */
export function scheduleDescribeAll(userId: string, ids: readonly string[]): void {
  scheduleFill(userId, ids, true)
}

/**
 * The one-row form, unchanged in signature so its three original call sites did not have to move:
 * `setCurrentNinaAvatarAction`, `setChatPhotoAsAvatarAction`, and (before this phase) the upload
 * path's empty-album promotion.
 */
export function scheduleDescribe(userId: string, id: string): void {
  scheduleFill(userId, [id], true)
}

/**
 * Re-embed a row whose prose a HUMAN just rewrote. No vision call, ever.
 *
 * `editNinaAvatarDescriptionAction` writes the new prose with a NULL vector in one UPDATE and then
 * calls this, so the row is never searchable under words it no longer contains — a stale vector is
 * worse than a missing one, because a missing one is visible in the backlog count and a stale one
 * is invisible until a search returns the wrong photo. If this callback never runs, the row is
 * simply in the backlog.
 */
export function scheduleEmbed(userId: string, id: string): void {
  scheduleFill(userId, [id], false)
}

function scheduleFill(userId: string, ids: readonly string[], describe: boolean): void {
  if (ids.length === 0) return
  after(async () => {
    // Measured from inside the callback: `after()` starts when the response is finished, and the
    // budget is about how long THIS work may run, not how long the action took.
    const deadline = Date.now() + NINA_DEFERRED_DESCRIBE_BUDGET_MS
    try {
      const targets = await listNinaAvatarDescribeTargets(userId, ids)
      const outcome = await runFillLanes(userId, targets, describe, deadline)
      if (outcome.ranOutOfTime > 0 || outcome.failed > 0) {
        console.warn('[f34] deferred describe finished short', {
          requested: ids.length,
          ...outcome,
        })
      }
    } catch (cause) {
      console.error('[f34] deferred describe batch failed', { requested: ids.length }, cause)
    }
  })
}
```

**Impact:** `scheduleDescribe`'s observable behaviour changes in two ways its existing call sites
inherit — it now also writes the embedding, and it no longer skips a row that has prose but no
vector. Both are the point. Tests at step 9 are updated for it.

---

### Step 4: Every inserted row in a batch, not only `rows[0]`

**File:** `lib/admin/ninaAlbumUploadActions.ts:179-183`
**Change:** the promotion stays exactly as it was (it is `is_current`'s business and invariant 7's);
the describe schedule moves out from under the `!hadCurrent` branch and covers every row.

**Code:** replace

```ts
  const first = rows[0]
  if (!hadCurrent && first != null) {
    await setCurrentNinaAvatar(userId, first.id)
    scheduleDescribe(userId, first.id)
  }
```

with

```ts
  const first = rows[0]
  if (!hadCurrent && first != null) {
    await setCurrentNinaAvatar(userId, first.id)
  }

  /*
   * EVERY ROW, NOT `rows[0]` — and this is the one line of this action that
   * `admin-album-semantic-search` changed.
   *
   * The promotion above is unchanged and stays exactly where it was: it is about `is_current` and
   * invariant 7, and it has never been about descriptions. What used to ride inside it was a
   * `scheduleDescribe(userId, first.id)` — so a batch of fifty photographs earned ONE description
   * and only when the album happened to have been empty. Under R2 ("semantic search to every image
   * description we have") that is the whole feature missing: the analysis measured it as a search
   * covering the handful of promoted/shared/hand-described rows out of hundreds.
   *
   * ONE `after()` PER BATCH, not one per row. `scheduleDescribeAll` reads all fifty rows in one
   * statement and runs them through four lanes against a wall-clock budget — see that module's
   * header for the three bounds and for why the "descriptions Nina may never be shown" half of the
   * old argument is repealed while the latency half is not. Nothing on this action's clock changed:
   * the response goes out first, as it always did.
   */
  scheduleDescribeAll(
    userId,
    rows.map((row) => row.id),
  )
```

And change the import at `lib/admin/ninaAlbumUploadActions.ts:6`:

```ts
import { scheduleDescribeAll } from '@/lib/admin/ninaAlbumDeferredDescribe'
```

**Impact:** `registerNinaAvatarsAction` now schedules one `after()` on every batch that inserted
anything — including batches into an album that already had a current avatar, which previously
scheduled none. A batch that inserted nothing (`rows.length === 0`, the idempotent re-send) still
schedules none, because `scheduleFill` short-circuits on an empty list.

---

### Step 5: The describe button and the hand edit both keep the vector honest

**File:** `lib/admin/ninaAlbumDescribeActions.ts`

**5a — `describeNinaAvatarAction` (`:54-66`): embed in band.**

Replace the `try` block body:

```ts
  try {
    const { description } = await describeNinaImages(
      [{ blobUrl: row.blobUrl, pathname: row.pathname }],
      { subject: describeSubjectForSide('hers') },
    )
    /*
     * ── AND THE VECTOR, IN THE SAME UPDATE ──────────────────────────────────────────────────
     * `admin-album-semantic-search` R2. This action OVERWRITES whatever was stored (R3, 2026-09-10),
     * so leaving the old vector in place would leave the photo searchable under the prose it just
     * stopped having — the one failure mode a stale derived column has, and the reason both columns
     * move in one statement (`setNinaAvatarDescriptionAndEmbedding`'s docstring argues the window).
     *
     * IN BAND rather than `after()`, unlike the upload path, and the arithmetic is why: the
     * operator is already waiting ~8-11 s for the vision call they clicked, and an embedding is one
     * small text request against a model with no image in it. Deferring it would add a second
     * moving part to save a fraction of the latency the click already costs. `after()` here would
     * also be the wrong shape for `ensureNinaAvatarDescriptionAction`, which delegates to this
     * function precisely BECAUSE it needs the answer in band.
     *
     * `embedNinaAvatarDescription` never throws: an embedding outage must not turn a successful
     * describe into a failed one. It answers `null`, the row is written prose-with-no-vector, and
     * `listNinaAvatarDescribeBacklog` picks it up on the next sweep.
     */
    const embedding = await embedNinaAvatarDescription(description, userId)
    await setNinaAvatarDescriptionAndEmbedding(userId, row.id, description, embedding)
    revalidatePath('/admin/nina')
    return { ok: true, description }
  } catch (cause) {
    console.error('[f33] admin describe failed', cause)
    return { ok: false, error: 'The description call failed. Try again.' }
  }
```

**5b — `editNinaAvatarDescriptionAction` (`:104-116`): NULL the vector, then re-earn it off the clock.**

Replace from the `/* The empty box IS the clear …` comment to the `return`:

```ts
  /* The empty box IS the clear — the same policy line `editChatPhotoDescriptionAction` runs. */
  const next = description.length === 0 ? null : description

  /*
   * ── THE VECTOR IS CLEARED HERE AND RE-EARNED AFTERWARDS ─────────────────────────────────────
   * `admin-album-semantic-search` R2. The docstring above says this action makes NO model call,
   * and that rule is kept for the call that matters — nothing re-describes prose a human just
   * typed. But `description_embedding` is DERIVED from that prose, so leaving the old vector
   * behind would leave the photo searchable under the words the operator just deleted: a stale
   * derived column, invisible until a search returns the wrong photo.
   *
   * So the vector is set to NULL in the SAME UPDATE as the new prose — the row is never, for any
   * window, a pair of columns that disagree — and `scheduleEmbed` re-earns it after the response
   * has gone out. NULL is the honest intermediate state and it is the one the backlog read already
   * looks for, so a callback that never runs costs a sweep, not a correction.
   *
   * `scheduleEmbed` and not `scheduleDescribe`: a CLEARED box must not summon `glm-4.6v` to
   * invent prose the operator just removed. The embed-only worker leaves a NULL description alone.
   */
  await setNinaAvatarDescriptionAndEmbedding(userId, id, next, null)
  if (next != null) scheduleEmbed(userId, id)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    id,
    ...(next === null
      ? { note: 'Cleared. While it is empty she has no words about this photo.' }
      : {}),
  }
```

**5c — imports (`lib/admin/ninaAlbumDescribeActions.ts:6-11`).** Replace the two affected lines:

```ts
import {
  embedNinaAvatarDescription,
  scheduleEmbed,
} from '@/lib/admin/ninaAlbumDeferredDescribe'
```

and change the `@/lib/nina/queries` import to:

```ts
import { getNinaAvatar, setNinaAvatarDescriptionAndEmbedding } from '@/lib/nina/queries'
```

(`setNinaAvatarDescription` is no longer used by this module. It is **not** deleted — it keeps its
other caller and is still the right function for a description write with no vector.)

**5d — `ensureNinaAvatarDescriptionAction` (`:133-143`): unchanged.** It delegates to
`describeNinaAvatarAction` and therefore inherits 5a for free. Its fast path
(`if (row.description != null) return …`) is deliberately left alone: a described-but-unembedded row
returns its prose to the share flow immediately, exactly as before, and the missing vector is the
deferred pipeline's and the backfill's business, not a reason to make the share tab wait. Add one
sentence to its docstring after the `── THE FAST PATH IS THE COMMON PATH ──` paragraph:

```
 * The fast path deliberately does NOT check `description_embedding`. Sharing a photo to Nina is
 * about the prose reaching her prompt; whether the album's search can also find that photo is the
 * backfill's question, and making a share tab wait on an embedding call would answer it in the
 * most expensive possible place.
```

**Impact:** `describeNinaAvatarAction` grows one small vendor call on a path that already costs
~8-11 s. `editNinaAvatarDescriptionAction` grows one `after()` where its docstring previously
promised none — the docstring is amended in the same edit rather than left contradicting the code.

---

### Step 6: Adoption schedules unconditionally

**File:** `lib/admin/ninaAlbumAvatarActions.ts:154-155`
**Change:** drop the caller-side guard. `copyChatPhotoIntoAlbum` seeds the album row with the CHAT
row's `description`, and a chat row has never had an embedding — so under the old guard an adopted,
already-described photograph would be permanently unsearchable.

**Code:** replace

```ts
  await setCurrentNinaAvatar(userId, avatar.id)
  if (avatar.description == null) scheduleDescribe(userId, avatar.id)
```

with

```ts
  await setCurrentNinaAvatar(userId, avatar.id)
  /*
   * UNCONDITIONAL, since `admin-album-semantic-search`. The `if (avatar.description == null)`
   * guard that used to be here was a caller's guess at whether work was needed, and the seeding
   * two paragraphs up is exactly what made it wrong: `copyChatPhotoIntoAlbum` writes the CHAT
   * row's description into the album row, and a chat row has never carried a
   * `description_embedding`. Guarded, that photograph would be described (it already is) and never
   * embedded — permanently invisible to R2's search, with nothing in the album to indicate it.
   *
   * `scheduleDescribe` re-reads the row inside its `after()` and decides for itself: prose and
   * vector both present is an authoritative skip with no vendor call, which is the property its
   * own docstring has always claimed ("the skip is authoritative at the moment the work would
   * actually run"). Deleting the guard restores that claim rather than weakening it.
   */
  scheduleDescribe(userId, avatar.id)
```

**Impact:** `setChatPhotoAsAvatarAction` now always schedules one `after()`. A row that is fully
described and embedded costs one indexed read inside it and nothing else.

`setCurrentNinaAvatarAction` (`:68`) is **unchanged** — it already called `scheduleDescribe`
unconditionally.

---

### Step 7: `/admin/nina` must declare the segment budget its `after()` inherits

**File:** `app/admin/nina/page.tsx:80`
**Change:** add `maxDuration` beside the existing `dynamic`. This is the segment `registerNinaAvatarsAction`
is POSTed to, so it is the ceiling on the deferred describe+embed pass.

**Code:** replace the single line

```ts
export const dynamic = 'force-dynamic'
```

with

```ts
export const dynamic = 'force-dynamic'

/**
 * **300, and it must be a literal.** Segment config exports are statically analysed at build time,
 * so a computed expression is not a value the analyser can see — it would compile, ship, and leave
 * this route on the platform default. `app/nina/page.tsx`, `app/nina/jobs/page.tsx`,
 * `app/admin/image-generation/page.tsx` and `app/api/cron/nina/route.ts` spell the same number the
 * same way for the same reason.
 *
 * ── WHY THE ALBUM SCREEN NEEDS A FIVE-MINUTE CEILING ────────────────────────────────────────
 * `registerNinaAvatarsAction` is POSTed to this segment, and since `admin-album-semantic-search`
 * phase 2 it schedules a describe-and-embed pass over EVERY row a batch inserted (up to
 * `NINA_ADMIN_BATCH_MAX = 50`) rather than over `rows[0]` alone. That pass runs in `after()` — and
 * **`after()` inherits the ROUTE SEGMENT's `maxDuration`, not the action's own wishes**
 * (`app/admin/image-generation/page.tsx` states it for the same reason). At the platform default
 * the pass would be killed after the first row or two, every upload batch would leave forty-eight
 * undescribed photographs, and nothing would say so: the response was already 200 and the rows
 * already exist. The album would simply be unsearchable and look fine.
 *
 * 300 is `NINA_HOST_MAX_DURATION_MS`, the number every other long segment in this repo declares.
 * `lib/admin/ninaAlbumDeferredDescribe.ts` reserves 60 s under it
 * (`NINA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000` is a START gate) so an in-flight describe at its
 * own 25 s + 30 s fallback ceiling gets to finish and write its row rather than being cut off
 * between the vendor answering and the UPDATE landing.
 *
 * It is declared BESIDE `dynamic`, not instead of it: they answer different questions.
 */
export const maxDuration = 300
```

**Impact:** a segment-config-only change. The page's render, its data reads and its markup are
untouched. **Phase 4 also edits this area of the tree; if it touches this file the two edits are in
different regions (its JSX/props, this file's config exports) and merge cleanly.**

---

### Step 8: The backfill entry point

**File:** `app/api/admin/nina/backfill-descriptions/route.ts` (new)
**Change:** a Route Handler, because the backfill must reuse `describeNinaImages` and
`embedNinaText` — both of which `import 'server-only'` and resolve `@/` aliases, so neither is
reachable from a `scripts/*.mjs`. Spelling the two vendor calls a second time in a script is
exactly what `ensureNinaAvatarDescriptionAction`'s docstring refuses ("two spellings of one vendor
call is how one of them ends up not writing the row"), and a one-time sweep is the worst place to
have the second spelling.

A Route Handler rather than a Server Action because a Server Action needs a caller: this phase adds
no UI, phase 4's is fixed to the search bar, and an exported action nothing imports is a dead export
`npm run knip` would (correctly) flag. `app/**/route.ts` is an entry point by convention.

**Code:**

```ts
import {
  fillNinaAvatarDescribeTargets,
  NINA_ALBUM_BACKFILL_BUDGET_MS,
  NINA_ALBUM_BACKFILL_SLICE,
} from '@/lib/admin/ninaAlbumDeferredDescribe'
import {
  AdminForbiddenError,
  forbiddenJson,
  requireAdminApi,
} from '@/lib/admin/requireAdmin'
import { UnauthorizedError, unauthorizedJson } from '@/lib/auth/requireUserId'
import {
  countNinaAvatarDescribeBacklog,
  listNinaAvatarDescribeBacklog,
} from '@/lib/nina/queries'

/**
 * `/api/admin/nina/backfill-descriptions` — the one-time sweep that makes the album searchable.
 *
 *     GET   how much work is left; spends nothing
 *     POST  do one slice of it
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
 * `admin-album-semantic-search` R2 searches `nina_avatars.description`, and the album that exists
 * TODAY was uploaded under a pre-pass that described exactly one row per batch and only when the
 * album had been empty (`lib/admin/ninaAlbumDeferredDescribe.ts`'s header carries the argument that
 * made that right at the time, and the half of it this feature repeals). So the rows already in
 * production split three ways: prose and no vector (promoted, shared, hand-described, or adopted
 * from a chat photo), no prose at all (nearly everything), and both (nothing, before this phase).
 * The first two are this route's backlog. Phase 2's wiring covers every row uploaded from now on;
 * this covers every row that was there first.
 *
 * ── WHY A ROUTE HANDLER AND NOT A SCRIPT, AND NOT AN ACTION ─────────────────────────────────
 * Not a `scripts/*.mjs`: the sweep needs `describeNinaImages` and `embedNinaText`, and both
 * `import 'server-only'` and resolve `@/` aliases, so a plain node process cannot load them. The
 * alternative — a second, script-local spelling of the same two vendor calls — is what
 * `ensureNinaAvatarDescriptionAction`'s docstring refuses in as many words: *"two spellings of one
 * vendor call is how one of them ends up not writing the row."* A one-time sweep over the whole
 * album is the last place to accept the second spelling.
 *
 * Not a Server Action: an action needs an importer, this phase ships no UI, and an exported action
 * nothing calls is a dead export. `app/**\/route.ts` is an entry point by convention (`knip.ts`'s
 * header lists the Next plugin's file conventions among the entries it finds on its own).
 *
 * ── IT IS A SECURITY BOUNDARY IN ITS OWN RIGHT ──────────────────────────────────────────────
 * `proxy.ts` matches neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts`'s header), so
 * `requireAdminApi()` below is the ONLY thing between the open internet and a route that spends
 * vendor money per call. It runs FIRST, before any read, exactly as
 * `app/api/admin/nina/upload/route.ts` runs its gate before `handleUpload`. A signed-in non-admin
 * gets the same 404 the pages give; signed out gets a 401, because `fetch()` deserves a status
 * rather than a redirect to HTML.
 *
 * `userId` comes from the session and is never read from the request. There is one user today; the
 * scoping rule (invariant 7) does not care.
 *
 * ── IT IS A SLICE, AND THE OPERATOR LOOPS IT ────────────────────────────────────────────────
 * A describe is ~8-11 s. Three hundred of them do not fit in any function ceiling, so one POST does
 * what fits in `NINA_ALBUM_BACKFILL_BUDGET_MS` and reports `remaining`. It is safe to re-POST
 * immediately and safe to POST twice by accident: the backlog read is `description IS NULL OR
 * description_embedding IS NULL` ordered oldest-first, so a finished row leaves the backlog and a
 * row two workers race is written twice with equal values. Nothing here is a transaction and
 * nothing needs to be.
 *
 *     # how big is it
 *     curl -s -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-descriptions
 *
 *     # drain it (docs/… the admin-cookie recipe; `scripts/f04-e2e-probe.mjs` is the precedent)
 *     while :; do
 *       out=$(curl -s -X POST -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-descriptions)
 *       echo "$out"
 *       [ "$(printf '%s' "$out" | node -pe 'JSON.parse(require("fs").readFileSync(0)).remaining')" -gt 0 ] || break
 *     done
 */

/**
 * **300, and it must be a literal**, for the reason `app/admin/nina/page.tsx` now spells: segment
 * config is statically analysed, and the lanes below run on this route's clock — not in `after()`,
 * but directly, because this handler's whole job IS the slow work and there is no response to get
 * out of the way of. `NINA_ALBUM_BACKFILL_BUDGET_MS` (240 s) reserves 60 s under it so a describe
 * that is in flight at the deadline finishes and writes its row.
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

  const backlog = await countNinaAvatarDescribeBacklog(userId)
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
   * Read MORE than the budget can finish (`NINA_ALBUM_BACKFILL_SLICE = 200`), deliberately: the
   * read is one indexed statement over `nina_avatars_user_created_idx` and costs nothing next to a
   * single vision call, and over-reading is what keeps the four lanes busy right up to the deadline
   * instead of idling because the slice ran dry at 20 rows with two minutes left.
   */
  const targets = await listNinaAvatarDescribeBacklog(userId, NINA_ALBUM_BACKFILL_SLICE)
  const outcome = await fillNinaAvatarDescribeTargets(
    userId,
    targets,
    NINA_ALBUM_BACKFILL_BUDGET_MS,
  )

  /*
   * The remaining count is RE-READ, not computed from `targets.length - done`. A count derived from
   * this run's own arithmetic would be wrong the moment an upload's `after()` filled a row in
   * parallel, and "how many are left" is the number the operator's loop condition reads. One extra
   * indexed statement per slice is the right price for a loop that terminates for the right reason.
   */
  const backlog = await countNinaAvatarDescribeBacklog(userId)

  return Response.json({
    ok: true,
    ...outcome,
    ...backlog,
    remaining: backlog.missingDescription + backlog.missingEmbedding,
  })
}
```

**Impact:** one new HTTP surface under `/api/admin/`, gated identically to
`app/api/admin/nina/upload/route.ts`. No new environment variable and no new vendor integration.

---

### Step 9: Update the two suites whose assertions this phase falsifies

Both are pre-existing tests that assert the OLD coverage rule. They are updated, not weakened.

**File:** `tests/admin.albumAvatarActions.test.ts`

**9a — mock the embedding client** (beside the existing `@/lib/nina/vision` mock at `:56-58`):

```ts
const embedNinaText = vi.fn()
vi.mock('@/lib/nina/embedding', () => ({
  embedNinaText: (...args: unknown[]) => embedNinaText(...args),
}))
```

Add `embedNinaText` to the `vi.fn()` reset list at `:110` and give it a default in `beforeEach`:

```ts
  embedNinaText.mockResolvedValue(EMBEDDING)
```

with, beside the other fixtures at `:33-39`:

```ts
/** A stand-in vector. Its length is irrelevant to these tests; only its identity is asserted. */
const EMBEDDING = [0.1, 0.2, 0.3]
```

**9b — a fixture for the new narrow projection**, beside `avatarRow()`:

```ts
/**
 * The `describeTargetColumns` projection in order — five values. Same `in`-not-`??` discipline as
 * `avatarRow()` above, for the same reason: a deliberate `{ description: null }` must not read as
 * "no opinion".
 */
function describeTargetRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    'id' in overrides ? overrides.id : ID,
    'blobUrl' in overrides ? overrides.blobUrl : BLOB_URL,
    'pathname' in overrides ? overrides.pathname : PATHNAME,
    'description' in overrides ? overrides.description : null,
    'embedded' in overrides ? overrides.embedded : 0,
  )
}
```

**9c — `setCurrentNinaAvatarAction`'s deferred cases (`:230-290`).** The callback now runs
`listNinaAvatarDescribeTargets` (one SELECT returning a `describeTargetRow`) and then
`setNinaAvatarDescriptionAndEmbedding` (one UPDATE … RETURNING). Replace the `avatarRow(...)`
enqueues inside those cases with `describeTargetRow(...)`, and:
- the "already described" case (`:253-255`) must now enqueue
  `describeTargetRow({ description: DESCRIPTION, embedded: 1 })` for the skip to still hold — with
  `embedded: 0` it correctly embeds and no longer skips. Add a sibling case asserting exactly that:
  `description` present, `embedded: 0` → `describeNinaImages` NOT called, `embedNinaText` called
  once, one UPDATE.

**9d — `registerNinaAvatarsAction` (`:381-500`).** Three assertions invert:
- `:398` `expect(afterCallbacks).toHaveLength(0) // a face already wears the crown; no promotion` →
  `toHaveLength(1)`, with the comment rewritten to
  `// no promotion — but every inserted row still earns its description (R2)`.
- `:474` stays `toHaveLength(1)`; its comment becomes
  `// the batch's rows earn their descriptions, promotion or not`.
- `:494` stays `toHaveLength(0)` — nothing inserted, so `scheduleFill` short-circuits. Comment:
  `// nothing inserted → no promotion, and an empty id list schedules nothing`.

Add one new case to that describe block:

```ts
  it('describes and embeds EVERY inserted row in a batch, not just the first', async () => {
    requireAdmin.mockResolvedValue({ userId: USER })
    fake.enqueue([]) // getCurrentNinaAvatar — a face already wears the crown
    fake.enqueue([]) // declareNinaFolders
    fake.enqueue([avatarRow({ id: 'ava1' }), avatarRow({ id: 'ava2' })]) // insertNinaAvatars

    await actions.registerNinaAvatarsAction({
      records: [batchRecord(), batchRecord({ sourceKey: 'k2', pathname: `${PATHNAME}-2` })],
    })

    expect(afterCallbacks).toHaveLength(1) // ONE callback for the whole batch
    expect(describeNinaImages).not.toHaveBeenCalled()

    fake.enqueue([describeTargetRow({ id: 'ava1' }), describeTargetRow({ id: 'ava2' })])
    fake.enqueue([{ id: 'ava1' }], [{ id: 'ava2' }])
    await afterCallbacks[0]?.()

    expect(describeNinaImages).toHaveBeenCalledTimes(2)
    expect(embedNinaText).toHaveBeenCalledTimes(2)
  })
```

(Adjust the enqueue arity to whatever `batchRecord()`'s helper and `getCurrentNinaAvatar`'s
statement order already require in that file — the point of the case is the two-in-one-callback
count, not the fixture plumbing.)

**File:** `tests/admin.chatPhotoAdoption.test.ts`
- Add the same `@/lib/nina/embedding` mock (`:57-70` block).
- `:306-307` — `expect(afterCallbacks).toHaveLength(0)` for the adopted-with-description case
  becomes `toHaveLength(1)`, and the comment becomes
  `// the prose came from the chat row; the VECTOR still has to be earned`. Drive the callback and
  assert `describeNinaImages` was **not** called while `embedNinaText` was.
- `:323` — `fake.enqueue([{ id: AVATAR_ID }]) // setNinaAvatarDescription RETURNING` becomes a
  `describeTargetRow`-shaped SELECT followed by the UPDATE's RETURNING, and the comment names
  `setNinaAvatarDescriptionAndEmbedding`.

---

### Step 10: The phase's own suite

**File:** `tests/admin.albumDescribeEmbed.test.ts` (new)
**Change:** the behaviour this phase introduces, asserted where it is not incidental to an existing
suite. Posture is `tests/admin.albumAvatarActions.test.ts`'s: real query functions against
`tests/support/fakeDb.ts`, only the edges mocked (`requireAdmin`/`requireAdminApi`, `next/server`'s
`after`, `next/cache`'s `revalidatePath`, `@/lib/nina/vision`, `@/lib/nina/embedding`).

Cases, each one sentence of intent:

1. **`scheduleDescribeAll` reads the whole batch in ONE statement** — 50 ids in, exactly one SELECT
   before the first `describeNinaImages` call (`fake.queries[0].sql` matches `select` and
   `in (` / `= any`).
2. **Concurrency is bounded at four** — with a describe mock that never resolves until released,
   at most `NINA_DEFERRED_DESCRIBE_CONCURRENCY` calls are in flight at once.
3. **One row's failure does not stop the batch** — `describeNinaImages` rejects for the second of
   three targets; the other two are still written.
4. **An embedding failure keeps the prose** — `embedNinaText` rejects; the UPDATE still carries the
   description and carries `null` for the vector.
5. **Prose + vector is a zero-vendor-call skip** — `describeTargetRow({ description, embedded: 1 })`
   produces no `describeNinaImages`, no `embedNinaText`, and no UPDATE.
6. **Prose without a vector embeds and does not re-describe** — the adoption/backlog case.
7. **`scheduleEmbed` never calls the vision model**, including for a target whose description is
   NULL (the cleared box).
8. **The deadline is a START gate** — with `vi.useFakeTimers()` advancing past
   `NINA_DEFERRED_DESCRIBE_BUDGET_MS` mid-batch, the remaining targets are counted as skipped and
   no further `describeNinaImages` fires. (Use `fireEvent`-free plain `vi.setSystemTime`; this suite
   has no user-event chain, so the `userevent-hangs-under-vitest-fake-timers` hazard does not apply.)
9. **`editNinaAvatarDescriptionAction` writes prose and a NULL vector in ONE statement** — assert
   `fake.only()`-style that there is exactly one UPDATE and its params carry both.
10. **`describeNinaAvatarAction` embeds in band** — `afterCallbacks` stays empty and the single
    UPDATE carries the vector.
11. **The backfill route refuses before it reads** — with `requireAdminApi` throwing
    `AdminForbiddenError`, `POST()` answers 404 and `fake.queries` is empty. Same for
    `UnauthorizedError` → 401.
12. **`GET` spends nothing** — one statement, no vendor mock called.
13. **`POST` re-reads `remaining` rather than deriving it** — the counts statement runs AFTER the
    lanes (assert statement order in `fake.queries`).

---

## Verification

**Build:** `npx next typegen && npx tsc --noEmit`
(`npm run typecheck`. Per this repo's `vitest-does-not-typecheck-next-build-does` rule, vitest alone
will not catch a type error in the new route or the new query module.)

**Tests:**
```
npm test
npm test -- tests/admin.albumDescribeEmbed.test.ts tests/admin.albumAvatarActions.test.ts tests/admin.chatPhotoAdoption.test.ts lib/nina/queries.test.ts
```
Re-run any red with `--no-file-parallelism` before attributing it to this diff — this repo has a
documented load-sensitive flake class.

**Guards:** `npm run lint`, `npm run knip`, `npm run ci:openrouter-guard`
(the last one matters: the new route lives under `app/`, which the guard scans. It must reach
OpenRouter only through `lib/nina/embedding.ts` and must never name `OPENROUTER_API_KEY` itself.)

**Manual check (against the real database, after phase 1's migration has been applied):**
1. `curl -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-descriptions` reports a
   non-zero `remaining` roughly equal to the album's size.
2. One `POST` returns `described`/`embedded` counts greater than zero and a `remaining` strictly
   smaller than the `GET` reported.
3. `SELECT count(*) FROM nina_avatars WHERE description_embedding IS NOT NULL;` in `db:studio`
   matches the reported `embedded` running total. **Verify the sweep by a DB count, never by its own
   summary** — this repo has shipped a sweep that computed fills and wrote none.
4. Drop a fresh folder of 3-5 photos into `/admin/nina`. The upload response is as fast as before
   (no added latency — watch the network panel). Reload after ~60 s: every new tile shows a
   description, and the backlog `GET` has not grown.

**Exit criteria:**
- Every code path that writes `nina_avatars.description` writes `description_embedding` in the same
  UPDATE, or deliberately NULLs it and schedules the re-embed (the hand-edit path).
- A multi-file folder upload leaves every inserted row described and embedded within a bounded
  window, through exactly one `after()` per batch, with the upload response unchanged.
- `GET /api/admin/nina/backfill-descriptions` can be driven to `remaining: 0` by repeated `POST`s,
  and a DB count confirms it.

---

## Handoffs

- **Phase 1 — three asks, stated as Requires above.** The drizzle property name
  `descriptionEmbedding`; `embedNinaText` throwing rather than returning null; and above all
  **keeping the vector out of `avatarColumns`/`NinaAvatarRow`**. If phase 1 has already widened the
  shared projection when this phase starts, the fix is to narrow it there, not to widen the four
  test fixtures here — the 120-rows-per-page wire cost is the real argument.
- **Phase 1 — `tests/db.schema.nina.test.ts:266-344`** freezes `nina_avatars`'s column list, its
  index list, and its nullable-column list. The new column and its HNSW index belong in all three.
  Not touched here.
- **Phase 1 — clamping.** A description is ~220 tokens today, well inside any embedding model's
  window, but `editNinaAvatarDescriptionAction` accepts up to
  `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`. `embedNinaText` should clamp rather than let a vendor
  400 become a failed embed. Phase 1's module, phase 1's call.
- **Phase 3 — the barrel and its surface test. RECONCILED, read Step 2 before you touch either
  file.** Both phases add one `export *` line to `lib/nina/queries.ts` (final order: `avatars`,
  `avatarEmbeddings`, `avatarsearch`) and names to `lib/nina/queries.test.ts`'s
  `BARREL_VALUE_EXPORTS` (final total 92). **This phase owns the header's prose counts and writes
  92; phase 3 touches no prose line.** Step 2 quotes the final sorted state of the one array region
  the two phases share, so a conflict there is resolved by transcription, not by judgement.
- **Phase 3 — reading the vector.** Nothing in this phase ever SELECTs `description_embedding`. The
  search query should keep it that way: the vector belongs inside Postgres as an operand of `<=>`,
  never on the wire.
- **Phase 4 — `app/admin/nina/page.tsx`.** This phase adds `export const maxDuration = 300` beside
  the existing `dynamic` export at `:80`. Keep it.
- **Phase 4 (optional, not required by any R).** A "Fill missing descriptions" button in the admin
  explorer that POSTs the backfill route would be friendlier than a curl loop, and this phase
  deliberately did not add one: it ships no UI, and R1 names only the search bar. Left as a card,
  not as a dependency — the route is complete and operable without it.
- **Not done, deliberately:** nothing re-embeds when the embedding MODEL changes. A model swap
  invalidates every stored vector, and the recovery is a `UPDATE nina_avatars SET
  description_embedding = NULL` followed by this route's loop. Worth a line in the ops runbook when
  one exists; not worth a column of model provenance today.
- **Not done, deliberately:** `nina_message_images` (the Media arm) gets no embedding. The plan
  index scopes this feature to the Album (Decision 1).

## Rollback

Phase 2 is additive and reverts alone, with phases 1, 3 and 4 left standing.

1. `git revert` this phase's commit(s). `lib/nina/queries/avatarEmbeddings.ts`, the backfill route
   and `tests/admin.albumDescribeEmbed.test.ts` disappear; `ninaAlbumDeferredDescribe.ts`,
   the three action modules, `app/admin/nina/page.tsx`, the barrel, and the two amended suites
   return to their pre-phase text.
2. **No migration is reverted and no data is destroyed.** `description_embedding` is phase 1's
   nullable column; the vectors this phase wrote stay, and phase 3's search keeps ranking by them —
   it simply stops gaining new ones.
3. The only behaviour that regresses is coverage: uploads go back to describing `rows[0]` of a batch
   into a previously-empty album, and hand-edited prose goes back to leaving a stale vector behind.
   The second is the one to notice — if phases 1 and 3 are staying while this one is reverted, run
   `UPDATE nina_avatars SET description_embedding = NULL WHERE id = <edited row>` for anything
   edited in the interval, or search will answer for words that are no longer there.
4. Partial rollback is available and clean: reverting only step 4 (`ninaAlbumUploadActions.ts`)
   restores the one-row-per-batch pre-pass while keeping the embedding writes and the backfill
   route, which is the right shape if the vendor bill rather than the code is the problem.
