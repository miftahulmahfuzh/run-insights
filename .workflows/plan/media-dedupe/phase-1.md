# Phase 1: Foundation: content_hash column, hash util, data plumbing

**Plan set:** `MEDIA_DEDUPE_PLAN.md`
**Analysis:** `20260910-103604_code_analyzer.md`
**Satisfies:** R1 — the dedup mechanism's substrate: the column, the hash, the lookup, the plumbing
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/db`, `lib/photos`, `lib/nina` (+ `scripts` pass-through)

---

## Goal

After this phase, `nina_message_images` has a nullable `content_hash` column (sha-256 hex of the
stored bytes) with a partial `(user_id, content_hash)` index, and production has that migration
applied. A new pure module `lib/photos/contentHash.ts` computes the identical hash in the browser,
on the server, and in strip-types scripts, and guards claims with `isValidContentHash`.
`insertNinaMessageImages` accepts an optional `contentHash` (validated at the shared door, NULL
otherwise) and a new owner-scoped `findNinaImageByContentHash` answers "does this user already
store these bytes?" — and **no caller sends a hash yet and no behavior changes**: everything later
phases consume now exists.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none
**Renames:** none
**Creates:**

- `lib/photos/contentHash.ts` (new file):
  - `export type ContentHashInput = Blob | ArrayBuffer | Uint8Array`
  - `export async function contentHashOf(input: ContentHashInput): Promise<string>` — 64-char
    lowercase hex, sha-256 over the exact bytes; runs in browser, Node ≥22, strip-types scripts
  - `export function isValidContentHash(value: unknown): value is string` — `true` iff 64
    lowercase hex
- `lib/nina/queries.ts`: `export async function findNinaImageByContentHash(userId: string,
  contentHash: string): Promise<NinaImageRow | null>` — newest ORIGINAL row (both provenance
  columns NULL) with that `(user_id, content_hash)`, `null` for not-found / not-yours / no-match
- `NinaImageInsert.contentHash?: string | null` (`lib/nina/queries.ts`)
- `NinaImageRow.contentHash: string | null` (`lib/nina/queries.ts`) — `imageColumns` selects it,
  so **every reader of `nina_message_images` now carries the field** (additive)
- `lib/db/schema.ts`: `ninaMessageImages.contentHash` column + partial index
  `nina_message_images_user_content_hash_idx` on `(user_id, content_hash) WHERE content_hash IS
  NOT NULL`
- `drizzle/0018_<drizzle-minted-name>.sql` + `drizzle/meta/0018_snapshot.json` + journal idx 18 —
  the file NAME is minted by `npm run db:generate`; never hand-renamed

**Signature changes:** `scripts/nina-image-worker.ts` `finishSelfie` — its `image` parameter type
gains `contentHash?: string | null`:
`image: { blobUrl: string; pathname: string; bytes: number; contentHash?: string | null }`.
Call sites and arity unchanged (`contentHash` optional, so `runOneJob`'s `store()` result still
compiles). Phase 3 fills the value.

**Requires (from earlier phases):** none — first phase.

**Behavior notes that bind later phases (reconciler: phases 2/3 plans must not contradict these):**

1. **Invariant 9 is enforced HERE, at the shared insert, not only at the call sites.**
   `insertNinaMessageImages` coerces any `contentHash` that fails `isValidContentHash` to NULL
   (silently — dedup inactive for that row, never a send error). Phases 2 and 3 still validate
   EARLY with `isValidContentHash`, because they need the answer to DECIDE (skip the upload vs
   proceed), not to protect the column — the column is already protected. Phase 2's wrapper
   `normalizeClaimedContentHash` additionally TRIMS before the same predicate: a decision-input
   convenience that can only turn a whitespace-wrapped valid claim into a valid one, never widen
   what this door accepts. This door remains the one normative backstop for the column.
2. The worker's raw-SQL INSERT now names `content_hash` and binds `image.contentHash ?? null`
   (NULL while nothing hashes). `REQUIRED_COLUMNS['nina_message_images'].columns` gains
   `'content_hash'` so the preflight existence check covers the name. If phase 3's plan assumed
   `finishSelfie`'s signature unchanged, this is the change it must build on.
3. The index is **non-unique, by decision** (plan Decisions row 4: the latecomer row becomes a
   REFERENCE, not an error). A reference row MAY carry the same `content_hash` as its keeper;
   `findNinaImageByContentHash` filters to originals via `isOriginalPhoto()`, so references never
   satisfy a dedup lookup.
4. `findNinaImageByContentHash` takes `contentHash: string` — NOT `string | null`. A caller
   holding no hash wants the no-match answer without a query; callers validate first with
   `isValidContentHash` and simply don't call on failure. Phase 4's sweep does NOT use this
   function (the script is a raw-SQL `.mjs` and cannot import `lib/nina/queries.ts`).
5. **The worker INSERT written in Step 7c is the PHASE-1 LANDING STATE, not the final form.**
   Phase 3's contract (its Requires: "the worker's raw INSERT already names `content_hash` …
   This phase REPLACES that statement") supersedes it — the replacement gains `source_image_id`
   and binds the shared write plan's values, while keeping the two properties this phase asserts
   in Step 8: the hash bound as a PARAMETER, never a literal, and one statement shape. Step 8's
   assertions are deliberately shape-level so they survive that replacement; phase 3 owns keeping
   them green (it widens the `image` fixture to five fields).
6. **`lib/nina/queries.ts` has a second, later editor.** Phase 3 edits `NinaChatPhotoBlobPatch`
   + `updateNinaChatPhotoBlob` (~:1926-2000 in the current tree — a Replace byte-swap must move
   or retract the hash) in the SAME file as this phase's five edits (:221, :257, :603, :1595-1621,
   after :1774). The hunks are disjoint, neither quotes the other's lines, and the order is
   phase 1 first — phase 3 builds on the file as phase 1 left it.

**Leaves alone (owned by others):** `components/nina/Composer.tsx`, `lib/nina/actions.ts`,
`lib/nina/imagerun.ts`, `components/admin/chatPhotoUpload.ts`, `lib/admin/chatPhotoActions.ts`,
`app/api/upload/route.ts`, `app/api/admin/nina/upload/route.ts`, the blob store, `package.json`
scripts, all four reads that must not filter (`getNinaMessageImagesForMessages`,
`getNinaMessageImage`, source gateway, `isBlobPathnameReferenced` — none of their predicates
change; they only gain the projected field).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema.ts` | modify | `contentHash` column (~:1145, after `sourceImageId`) + partial index (~:1150-1155) |
| `drizzle/0018_*.sql` + `drizzle/meta/*` | create | generated by `npm run db:generate` — column + partial index; applied by `db:migrate` (writes production) |
| `lib/photos/contentHash.ts` | create | pure WebCrypto sha-256 → hex + claim validator; zero imports |
| `lib/photos/contentHash.test.ts` | create | known-answer vectors, shape-agreement, view-offset pitfall, Blob path, validator cases |
| `lib/nina/queries.ts` | modify | `NinaImageRow` (:221), `NinaImageInsert` (:257), `imageColumns` (:603), insert values (:1598), new finder (after :1774). Phase 3 later edits `updateNinaChatPhotoBlob` in this same file (~:1926-2000) — disjoint hunks, lands after this phase (note 6) |
| `tests/nina.photoRefs.test.ts` | modify | insert describe (:167+): names `content_hash`, binds NULL, binds a valid claim, coerces a bad claim. Phase 3 later appends an unrelated Replace case — different describe |
| `scripts/nina-image-worker.ts` | modify | `REQUIRED_COLUMNS` (:199), `finishSelfie` signature (:768) + raw-SQL INSERT (:807) + DEPLOY ORDER note (:795). The INSERT form written here is the PHASE-1 LANDING STATE — phase 3 replaces it (note 5) |
| `tests/nina.imageworker.test.ts` | modify | `finishSelfie` describe (:290): SQL-shape assertions for the new column, written to survive phase 3's fixture widening and INSERT replacement (note 5) |

## Implementation Steps

### Step 0: Preconditions (the worktree is a fresh checkout)

**File:** —
**Change:** Before anything: copy `.env.local` from the main checkout
(`/home/miftah/run-insights/.env.local`) into the worktree root and run `npm install` there.
`lib/env.ts` validates its variables at import and there is no `node_modules` yet — `npm run
typecheck`, `npm test`, `npm run build` and every `db:*` script die until both exist. Note that
this repo has ONE database: `.env.local`'s URLs are the instance production reads, so every
`db:*` command below is a production command. Also skim `node_modules/next/dist/docs/` per
`AGENTS.md` if you touch anything Next-specific — this phase introduces no Next API (pure TS
module, drizzle migration, raw-SQL script), so the duty is discharged vacuously.

### Step 1: Schema — the `content_hash` column and its partial index

**File:** `lib/db/schema.ts:1143` (insert the new column between `sourceImageId`'s closing `})` at
:1145 and the `sortOrder` line at :1147)

**Change:** Add the column with a contract doc-comment, and add the partial index to the table's
index array at :1150-1155.

**Code — the column** (shown in position; insert exactly the `contentHash` entry below, leaving
`sourceImageId` and `sortOrder` as they are):

```ts
    sourceImageId: text('source_image_id').references((): AnyPgColumn => ninaMessageImages.id, {
      onDelete: 'set null',
    }),
    /**
     * ── CONTENT HASH: WHAT MAKES "THESE BYTES ARE ALREADY STORED" AN INDEXED QUESTION ──────────
     *
     * sha-256 over the EXACT bytes this row's Blob object stores, as 64 lowercase hex characters.
     * `lib/photos/contentHash.ts` is the only intended producer. One semantics, stated once:
     * **equal hash ⟺ equal stored bytes.** Not a hash of the file he picked (the server never
     * sees it — the upload PUT goes browser → Blob directly), and not a perceptual hash (plan
     * Decisions — cross-encoding dedup is YAGNI; the measured duplicates were the same file picked
     * twice). A recompression that lands on different bytes is two objects that are honestly
     * different at the only level this table can see, which is storage.
     *
     * **User-scoped, never global.** The lookup key is `(user_id, content_hash)` and the partial
     * index below serves exactly that shape. Dedup must not link one user's bytes to another's —
     * ownership is per-user, and the Blob release path (`isBlobPathnameReferenced`) is
     * user-scoped, so a shared pointer would let one user's delete free bytes another user still
     * renders.
     *
     * **NULL is a real, permanent state, not a gap to fill on the next write.** A row predating
     * this column, and any write whose path had no bytes in hand to hash, both store NULL — and
     * NULL means "dedup is INACTIVE for this row": SQL `=` against NULL never matches, so no
     * consumer needs a special case, and none may invent one that treats NULL as "definitely
     * unique". The backfill sweep (media-dedupe phase 4) fills the historical rows once, from the
     * Blob itself; nothing writes this column after insert.
     *
     * **Why a plain index and not UNIQUE.** The duplicate row this mechanism writes is a
     * REFERENCE — copy `blob_url`/`pathname`, set `source_image_id`, the F37 shape — because the
     * plan's decision is that the latecomer row STAYS (a bubble must not be emptied to save
     * storage). A unique index would turn that race-close into a thrown INSERT, and would force
     * reference rows either to lie (NULL hash) or to collide. Uniqueness here is a decision the
     * write path makes after a lookup; the index makes the lookup cheap, nothing more.
     */
    contentHash: text('content_hash'),
```

**Code — the index** (the table's second callback entry list becomes):

```ts
  (t) => [
    /** "the images on these messages" — phase 4's list hydration. */
    index('nina_message_images_message_idx').on(t.messageId),
    /** Phase 13's gallery, newest first, without a join. */
    index('nina_message_images_user_created_idx').on(t.userId, t.createdAt.desc()),
    /**
     * The write-time dedup lookup — "does THIS user already store these bytes?" — as one indexed
     * question instead of a per-write scan. Partial on purpose: a NULL row (everything written
     * before this column, and any write that could not hash) can never be a match, so leaving it
     * out keeps the index down to the rows the mechanism can answer about. Non-unique; the
     * column's header carries the argument for why the schema does not enforce uniqueness here.
     */
    index('nina_message_images_user_content_hash_idx')
      .on(t.userId, t.contentHash)
      .where(sql`${t.contentHash} is not null`),
  ],
```

(`sql` is already imported from `drizzle-orm` at :1; the `.where(sql\`${t.col} is not null\`)`
spelling is `shares_run_id_active_unq`'s (:518-520) and `nina_avatars_user_current_unq`'s
(:1684-1686), both of which generate a qualified `WHERE "nina_message_images"."content_hash" is
not null` — see the generated SQL in Step 2.)

**Impact:** Typecheck-only until Step 2; drizzle-kit reads this file to mint the migration. No
runtime reader changes (the column is new and nullable).

### Step 2: Migration — generate, check, apply (production)

**File:** `drizzle/0018_<minted>.sql`, `drizzle/meta/0018_snapshot.json`, `drizzle/meta/_journal.json`

**Change:** Generate the migration from the schema change, verify the chain, apply it.

**Implement-time hazards (project memory — these are steps, not footnotes):**

1. **Check `origin/main` FIRST, before generating.** `git fetch origin && git show
   origin/main:drizzle/meta/_journal.json | tail -25`. If origin/main already has an `idx: 18`
   whose tag starts `0018_`, the number is taken by another set. REGENERATE, never rename: merge
   or rebase origin/main into the branch, delete your locally generated `0018_*` files and
   journal entry, re-run `npm run db:generate` — drizzle mints the next free number from the
   MERGED journal. Diff old generated file vs new before deleting (regeneration silently drops
   hand-written SQL) — this migration is pure `db:generate` output with no hand-written tail, so
   regeneration is lossless, but the diff is the proof.
2. **Never rename a generated migration file.** A renamed migration is skipped silently by
   `db:migrate` — the number in the filename is the identity, and drizzle matches the journal's
   `tag` against it.
3. **`db:migrate` writes PRODUCTION** (one database; `drizzle.config.ts` uses
   `DATABASE_URL_UNPOOLED` from `.env.local`). This migration is additive — a nullable column
   (Postgres fast-adds it, no table rewrite, brief metadata lock) plus a partial index over 23
   rows (milliseconds) — so it is safe to apply now, while the dedup code itself lands in phases
   2-4. Say so in the phase report rather than skipping the step.

**Commands and expected outputs:**

```
npm run db:generate
```
Expect drizzle-kit to print a two-item diff for `nina_message_images` (a column added, an index
added) and write `drizzle/0018_<minted>.sql` + `drizzle/meta/0018_snapshot.json` + a journal
entry with `"idx": 18`. The generated SQL must be EXACTLY this shape (column first, then index;
qualified WHERE column, per the 0000/0002 partial-index precedents):

```sql
ALTER TABLE "nina_message_images" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "nina_message_images_user_content_hash_idx" ON "nina_message_images" USING btree ("user_id","content_hash") WHERE "nina_message_images"."content_hash" is not null;
```

If the generated file says anything else (a NOT NULL clause, a different WHERE spelling, extra
statements), STOP — the schema edit in Step 1 is wrong. Do not hand-edit the file to fix it; fix
the schema and regenerate.

```
npm run db:check
```
Expect exit 0 and no failure lines — drizzle-kit validates the journal ↔ snapshot chain and the
new migration's relations. (Wording of the success line varies by drizzle-kit version; the gate
is exit 0, red for a broken chain.)

```
npm run db:migrate
```
Expect output showing exactly `0018_<minted>` being applied (0000-0017 are already recorded on
production), then exit 0. If it reports applying anything beyond 0018, another set's migration
landed between your fetch and your migrate — re-read what it applied before continuing.

**Impact:** Production schema gains the column immediately; the app writes NULL into it on every
insert until phases 2-4 send hashes. No reader is affected.

### Step 3: The hash util — `lib/photos/contentHash.ts` (new file)

**File:** `lib/photos/contentHash.ts` (new)

**Change:** One pure module, zero imports, the only intended producer of the column's values.

**Code:**

```ts
/**
 * sha-256 over image bytes, as the one string every dedup layer agrees on.
 *
 * ── WHY WEBCRYPTO AND NOT NODE'S `crypto` ────────────────────────────────────────────────────
 * This module runs in THREE hosts and must produce byte-identical answers in all of them:
 *   · the browser — the composer hashes the compressed bytes it is about to PUT, because the
 *     server never sees upload bytes (`/api/upload` mints a token; the PUT goes browser → Blob);
 *   · the server — the generated path hashes bytes before `put`, and the actions validate what
 *     the client claimed;
 *   · strip-types scripts — the backfill sweep hashes by GETting each Blob, and the worker
 *     (`scripts/nina-image-worker.ts`) can only import modules that import nothing.
 * `globalThis.crypto.subtle` is that one primitive: native in every browser, native in Node ≥19
 * (this repo's floor is 22), and reachable from a script that may not build an import graph. The
 * repo's other sha-256 (`lib/llm/factsHash.ts`) uses node:crypto and is therefore server-only —
 * fine for a cache key computed and consumed in one process, wrong for a value a browser must be
 * able to compute too.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────────────────────────
 * The input is the bytes EXACTLY AS STORED — for the upload path that is the compressed output,
 * not the picked file (`compressForNina` re-encodes; a different re-encode is different bytes,
 * which is "honestly two objects", not a dedup miss). The output is 64 lowercase hex.
 * `isValidContentHash` is the gate on the OTHER side: a hash a client CLAIMS goes through it
 * before it is stored, and a claim that fails is written as NULL — dedup silently inactive for
 * that row — never a send error (plan invariant 9).
 *
 * ── THE VIEW PITFALL, STATED WHERE THE BUG WOULD BE MADE ─────────────────────────────────────
 * `digest` respects a Uint8Array's `byteOffset`/`byteLength`, so a subarray view hashes exactly
 * the view's bytes. Never "simplify" an input by passing `view.buffer` instead: that hashes the
 * WHOLE underlying allocation, and a Node `Buffer` is pooled — you would hash a chunk of
 * unrelated heap and call it the file's identity. This module passes the view itself, always.
 *
 * Deliberately imports NOTHING: the script-host constraint above is a hard one, and a single
 * dependency would silently break `--experimental-strip-types`.
 */

/** One hash input. `Blob` covers the browser (`File` IS a Blob); the array forms cover server and script. */
export type ContentHashInput = Blob | ArrayBuffer | Uint8Array

/** sha-256 over these exact bytes, as 64 lowercase hex characters. Rejects only if the platform has no `crypto.subtle`. */
export async function contentHashOf(input: ContentHashInput): Promise<string> {
  const bytes = await toBytes(input)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}

async function toBytes(input: ContentHashInput): Promise<ArrayBuffer | Uint8Array> {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return input.arrayBuffer()
  }
  return input
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

const CONTENT_HASH_RE = /^[0-9a-f]{64}$/

/**
 * The gate for a hash CLAIM — a value that arrived from a client and is about to reach
 * `nina_message_images.content_hash`. Lowercase only, on purpose: lowercase is the only spelling
 * `contentHashOf` produces, the column should hold one spelling, and the only client in this repo
 * is ours. A claim in another casing fails here and is stored as NULL — dedup goes inactive for
 * that row, which is the honest reading of "this claim is not one of ours" — rather than being
 * silently rewritten into shape.
 */
export function isValidContentHash(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_HASH_RE.test(value)
}
```

**Impact:** None by itself — nothing imports it yet. Phases 2/3 import `contentHashOf` and
`isValidContentHash`.

### Step 4: Unit tests for the util — `lib/photos/contentHash.test.ts` (new file)

**File:** `lib/photos/contentHash.test.ts` (new; co-located tests are this repo's pattern for
`lib/**` — `lib/photos/resizeTarget.test.ts` is the sibling)

**Change:** Known-answer vectors plus the two properties the hosts depend on.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { contentHashOf, isValidContentHash } from './contentHash'

/**
 * Known-answer + shape-agreement tests for the one string all three dedup hosts must agree on.
 *
 * `crypto.subtle` IS available in Vitest's `node` environment (Node ≥22 exposes it globally), so
 * the real algorithm runs here — no stubbing, no browser. What is NOT reachable in `node` is a
 * real image decode; that is fine, because the function's only inputs are bytes and its only
 * decision is the digest.
 */

// NIST FIPS 180-4 test vectors for SHA-256.
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('contentHashOf', () => {
  it('reproduces the FIPS 180-4 vectors', async () => {
    await expect(contentHashOf(new ArrayBuffer(0))).resolves.toBe(EMPTY_SHA256)
    await expect(contentHashOf(new TextEncoder().encode('abc'))).resolves.toBe(ABC_SHA256)
  })

  it('is the same hash whatever host shape carried the bytes', async () => {
    // The whole mechanism rests on this: a hash the browser computed for the bytes it PUT must
    // equal the hash the sweep computes later by GETting those bytes back. If Blob, view,
    // ArrayBuffer or a copy ever disagreed, dedup would silently never match.
    const bytes = new TextEncoder().encode('kartu kedatangan 2608160020321')
    const fromView = await contentHashOf(bytes)
    const fromCopy = await contentHashOf(bytes.slice())
    const fromWholeBuffer = await contentHashOf(bytes.buffer)
    const fromBlob = await contentHashOf(new Blob([bytes]))
    expect(new Set([fromView, fromCopy, fromWholeBuffer, fromBlob]).size).toBe(1)
    expect(fromView).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes the VIEW, not the buffer behind it — the offset pitfall', async () => {
    // A Node Buffer is pooled and a subarray view shares its parent's allocation. Hashing
    // `view.buffer` would fold unrelated heap into the digest. The contract is the view's bytes
    // and only the view's bytes.
    const whole = new Uint8Array([1, 2, 3, 4, 5])
    const view = whole.subarray(2, 4) // [3, 4], offset 2 into a 5-byte buffer
    await expect(contentHashOf(view)).resolves.toBe(await contentHashOf(new Uint8Array([3, 4])))
    await expect(contentHashOf(view)).resolves.not.toBe(await contentHashOf(whole))
  })

  it('reads a Blob — and a File, which is the shape the composer holds — by its bytes', async () => {
    const bytes = new TextEncoder().encode('abc')
    await expect(contentHashOf(new Blob([bytes]))).resolves.toBe(ABC_SHA256)
    await expect(contentHashOf(new File([bytes], 'a.jpg'))).resolves.toBe(ABC_SHA256)
  })
})

describe('isValidContentHash', () => {
  it('accepts what contentHashOf produces', async () => {
    expect(isValidContentHash(await contentHashOf(new TextEncoder().encode('abc')))).toBe(true)
    expect(isValidContentHash(ABC_SHA256)).toBe(true)
  })

  it('rejects every spelling we do not produce', () => {
    // Uppercase is the SAME hash mathematically and still rejected: the column holds one
    // spelling, the only client is ours, and a claim not in our spelling is a claim we did not
    // make — it stores as NULL (dedup inactive), it is not rewritten.
    expect(isValidContentHash(ABC_SHA256.toUpperCase())).toBe(false)
    expect(isValidContentHash(ABC_SHA256.slice(1))).toBe(false) // 63 chars
    expect(isValidContentHash(`${ABC_SHA256}0`)).toBe(false) // 65 chars
    expect(isValidContentHash('g'.repeat(64))).toBe(false) // hex-adjacent, not hex
    expect(isValidContentHash('')).toBe(false)
    expect(isValidContentHash(null)).toBe(false)
    expect(isValidContentHash(undefined)).toBe(false)
    expect(isValidContentHash(123)).toBe(false)
    expect(isValidContentHash({ hash: ABC_SHA256 })).toBe(false)
  })
})
```

**Impact:** New test file, picked up by `vitest.config.ts`'s `lib/**/*.test.ts` include.

### Step 5: `lib/nina/queries.ts` — row shape, insert pass-through, and the lookup

**File:** `lib/nina/queries.ts` — four edits. Add the import alongside the others at the top
(with the other `@/lib/...` imports):

```ts
import { isValidContentHash } from '@/lib/photos/contentHash'
```

**5a. `NinaImageRow` (:221-255).** Add the field after `sourceImageId` (:252), before
`sortOrder`. Replacement for the tail of the interface:

```ts
  sourceAvatarId: string | null
  /**
   * F37 R1. The earlier `nina_message_images` row these bytes belong to, or NULL. Always the
   * ORIGINAL rather than the row he tapped — `ninaPhotoProvenance` flattens, and
   * `drizzle/0010`'s backfill wrote the same thing for the rows that predate it.
   */
  sourceImageId: string | null
  /**
   * media-dedupe P1. sha-256 hex of the bytes this row's Blob object stores, or NULL — a row that
   * predates the column, or a write whose path had nothing to hash. NULL means dedup is inactive
   * for this row; see `nina_message_images.content_hash`'s header for the full contract.
   * `findNinaImageByContentHash` is the reader this column exists for.
   */
  contentHash: string | null
  sortOrder: number
  createdAt: Date
}
```

**5b. `NinaImageInsert` (:257-277).** Add the optional field after `sourceImageId?`, before
`sortOrder?`. Replacement for the tail of the interface:

```ts
  sourceAvatarId?: string | null
  sourceImageId?: string | null
  /**
   * media-dedupe P1. **Optional on purpose, and nobody sends one yet** — that is what makes this
   * phase foundation. The value is sha-256 hex over the bytes being stored, computed by
   * `lib/photos/contentHash.ts`; on the upload path it is a CLIENT CLAIM, so the insert
   * coalesces anything that fails `isValidContentHash` to NULL (below) — invariant 9's "gagal
   * validasi = tulis NULL, bukan error", enforced once here at the door every write path shares,
   * rather than re-promised at each of the three callers.
   */
  contentHash?: string | null
  sortOrder?: number
}
```

**5c. `imageColumns` (:603-618).** The projection is the one place a second row shape could be
avoided or duplicated — this module's standing rule is "no second row shape enters the module"
(the `NinaChatPhotoPage` header says so in as many words), so the finder at 5d reuses this
projection rather than picking a narrow `{id, blobUrl, pathname, kind}`. Its caller needs
`id`/`blobUrl`/`pathname`/`kind` and gets the rest of the row for free, exactly like every other
reader. Replacement:

```ts
const imageColumns = {
  id: ninaMessageImages.id,
  messageId: ninaMessageImages.messageId,
  kind: ninaMessageImages.kind,
  blobUrl: ninaMessageImages.blobUrl,
  pathname: ninaMessageImages.pathname,
  width: ninaMessageImages.width,
  height: ninaMessageImages.height,
  bytes: ninaMessageImages.bytes,
  description: ninaMessageImages.description,
  prompt: ninaMessageImages.prompt,
  sourceAvatarId: ninaMessageImages.sourceAvatarId,
  sourceImageId: ninaMessageImages.sourceImageId,
  contentHash: ninaMessageImages.contentHash,
  sortOrder: ninaMessageImages.sortOrder,
  createdAt: ninaMessageImages.createdAt,
}
```

**5d. The insert statement (:1595-1621).** The values map gains the coalescing line. Replacement
for the `.values(...)` argument:

```ts
      rows.map((row) => ({
        id: newId(),
        userId,
        messageId: row.messageId,
        kind: row.kind,
        blobUrl: row.blobUrl,
        pathname: row.pathname,
        width: row.width ?? null,
        height: row.height ?? null,
        bytes: row.bytes ?? null,
        description: row.description ?? null,
        prompt: row.prompt ?? null,
        /*
         * F37 R1/R3. Coalesced rather than spread, so the column appears in EVERY insert this
         * function builds — an original binds NULL, a reference binds an id, and the statement
         * has one shape. The foreign keys are what make an id here safe to trust: the only writer
         * that supplies one has already read the row it names, owner-scoped, in the same request.
         */
        sourceAvatarId: row.sourceAvatarId ?? null,
        sourceImageId: row.sourceImageId ?? null,
        /*
         * media-dedupe P1. Coalesced through the validator rather than trusted, for the same
         * one-shape reason as the two columns above — and because the value is a CLIENT CLAIM on
         * the upload path (invariant 9): a claim that is not 64 lowercase hex binds NULL, dedup
         * goes inactive for that row, and the send does not fail. No caller sends one yet.
         */
        contentHash: isValidContentHash(row.contentHash) ? row.contentHash : null,
        sortOrder: row.sortOrder ?? 0,
      })),
```

**5e. The lookup — new function, placed in §5 Images immediately after
`getNinaMessageImagesForMessages` (ends :1774) and before the `isOriginalPhoto` doc-comment
(:1776).** Complete code:

```ts
/**
 * **"Does this user already store these bytes?"** The write-time dedup lookup (media-dedupe P1),
 * and the question every dedup arm — the upload pre-check, the generated store, the worker — asks
 * BEFORE it is allowed to create a second Blob object. Phase 1 ships the question with no
 * callers; the arms are phases 2 and 3.
 *
 * ── ORIGINALS ONLY, BY THE PREDICATE THIS MODULE ALREADY OWNS ────────────────────────────────
 * `isOriginalPhoto()` in the WHERE is not decoration. A REFERENCE row carries the same
 * `content_hash` as the keeper it points at (it renders the same bytes), so counting references
 * would answer "yes" forever after the first copy and point every later dedup arm at a reference
 * instead of the original — and `ninaPhotoProvenance` flattens precisely so pointers name the
 * original. `isOriginalPhoto` is a hoisted function declaration, so calling it from above its
 * definition is this file's normal order, not a trick.
 *
 * ── NEWEST FIRST, AND WHY THE CALLER CARES ───────────────────────────────────────────────────
 * `(created_at desc, id desc)` is `listNinaMessageImages`'s ordering with the same `id` tiebreak
 * (rows written in one statement tie on `created_at`). For a dedup caller any original with the
 * bytes is a correct attach target, but the newest one is the least likely to have been deleted
 * between this read and the write that follows — which is what keeps the attach arm's
 * `source_image_id` pointing at a row that still exists. The partial index
 * `nina_message_images_user_content_hash_idx` serves exactly this shape.
 *
 * ── THE CLAIM IS VALIDATED BEFORE THIS RUNS, NOT INSIDE IT ───────────────────────────────────
 * `contentHash` is a `string`, not `string | null`: NULL means "no dedup" everywhere else in this
 * file's vocabulary, and a caller holding NULL wants the no-match answer, not a query that can
 * only answer no. Callers validate client claims with `isValidContentHash`
 * (`lib/photos/contentHash.ts`) first and simply do not call this on failure — the same shape
 * `resolveAttachment` uses for its provenance source. `insertNinaMessageImages` re-checks the
 * format at the write anyway; the two checks agree by construction because both call the one
 * predicate.
 *
 * `null` for "not yours", "no such bytes" and "no row carries them" — this module's standing rule,
 * which here is also the dedup answer "store it, you are the first": the outcomes want exactly the
 * same next step. The projection is `imageColumns` (one row shape in this module — the caller
 * needs `id`/`blobUrl`/`pathname`/`kind` to attach, and the rest rides along).
 */
export async function findNinaImageByContentHash(
  userId: string,
  contentHash: string,
): Promise<NinaImageRow | null> {
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.contentHash, contentHash),
        isOriginalPhoto(),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:** `contentHash` flows through `imageColumns`, so every reader of this table now returns
the field (additive — no consumer matches on it, no hand-built `NinaImageRow` literal exists
outside this module). The insert still writes NULL everywhere: no caller passes `contentHash`.

### Step 6: Tests for the insert door — `tests/nina.photoRefs.test.ts`

**File:** `tests/nina.photoRefs.test.ts` — add to the existing `describe('insertNinaMessageImages
names both columns on every path')` block (starts :167). The file's method is asserting on the SQL
the fake driver recorded, and `content_hash` is the same class of fact: what the INSERT names and
binds.

**Code** (append inside that describe, after the `'binds the avatar id a re-attach supplies, in
the avatar column'` test ending :192):

```ts
  it('names content_hash and binds NULL while nobody sends a hash yet', async () => {
    // media-dedupe P1: the column pass-through, live before any caller. The F37 tests above
    // assert the same shape for the provenance pair; this is its third member.
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      { messageId: MESSAGE, kind: 'upload', blobUrl: 'https://x/a.jpg', pathname: 'nina/u1/a.jpg' },
    ])

    const insert = fake.sqlAt(1)
    expect(insert).toContain('"content_hash"')
    expect(fake.queries[1]!.params).toContain(null)
  })

  it('binds a valid hash claim as given', async () => {
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      {
        messageId: MESSAGE,
        kind: 'upload',
        blobUrl: 'https://x/a.jpg',
        pathname: 'nina/u1/a.jpg',
        contentHash: ABC_SHA256,
      },
    ])
    expect(fake.queries[1]!.params).toContain(ABC_SHA256)
  })

  it('coerces a malformed hash claim to NULL rather than storing it (invariant 9)', async () => {
    // The claim came from a client; the column only ever holds what isValidContentHash accepts.
    // Dedup going quietly inactive beats a send error, and beats a column that lies.
    fake.enqueue([[MESSAGE]], [])
    await queries.insertNinaMessageImages('u1', [
      {
        messageId: MESSAGE,
        kind: 'upload',
        blobUrl: 'https://x/a.jpg',
        pathname: 'nina/u1/a.jpg',
        contentHash: 'NOT-A-HASH',
      },
    ])
    expect(fake.queries[1]!.params).not.toContain('NOT-A-HASH')
    expect(fake.queries[1]!.params).toContain(null)
  })
```

…with the vector as a file-level constant next to `REFERENCE_SKIPPED` (:48):

```ts
/** NIST FIPS 180-4's SHA-256("abc") — any 64-lowercase-hex literal would do for the shape tests. */
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
```

(The existing `'binds NULL for an original rather than omitting the column'` test keeps passing —
its `params).toContain(null)` is already true and stays true.)

**Impact:** Proves the step-5d behavior and the "column named, original binds NULL" property on
the drizzle side, mirroring what the F37 tests assert for provenance.

### Step 7: The worker — raw-SQL column pass-through

**File:** `scripts/nina-image-worker.ts` — three edits. The worker cannot import `@/`-aliased
modules under `--experimental-strip-types` (its header and `resolveWorkerSessionId`'s comment
state why), so this is a hand-maintained mirror of the drizzle side, kept honest by
`findSchemaDrift` and the tests in Step 8.

**7a. `REQUIRED_COLUMNS['nina_message_images']` (:199-215).** The list's contract is "every
column this file names for the table, in any statement" — the INSERT now names `content_hash`, so
the list must say so or a future rename of the column would not take this workflow red.
Replacement:

```ts
  nina_message_images: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'message_id',
      'kind',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'description',
      'prompt',
      /* media-dedupe P1. Named by finishSelfie's INSERT, so rule 1's existence check covers it.
       * Nullable, so rule 2 does not demand it — the worker binds NULL until P3 teaches `store`
       * to hash before put. Listing it is what makes a future RENAME of the column red here. */
      'content_hash',
      'sort_order',
    ],
  },
```

**7b. `finishSelfie`'s signature (:768-773).** The parameter gains the optional field — the
drizzle-side mirror of `NinaImageInsert.contentHash`:

```ts
export async function finishSelfie(
  sql: NeonSql,
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number; contentHash?: string | null },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
```

(`runOneJob`'s `let image: { blobUrl: string; pathname: string; bytes: number }` at ~:997 still
compiles — the field is optional. Phase 3 widens the `store()` return and fills it.)

**7c. The image INSERT (:807-814).** Replacement:

```ts
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt,
       content_hash, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${image.blobUrl}, ${image.pathname},
      ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${args.scene}, ${args.sidecar},
      ${image.contentHash ?? null}, 0
    )
  `
```

Note the binding is a PARAMETER (`${image.contentHash ?? null}`), not a literal `null` — one
statement shape whether or not a hash ever arrives, which is the same coalescing argument the
drizzle side makes.

**This INSERT is the phase-1 landing state.** Phase 3's Step 5f replaces it with the plan-based
form (it gains `source_image_id` and binds `writePlan.row.*`) — the reconciled sequencing, stated
in both plans: land this version now (the column pass-through, NULL-bound), let phase 3 supersede
it. The two properties asserted in Step 8 — `content_hash` named, value bound as a parameter —
are exactly the ones the replacement keeps, which is why the assertions below are shape-level and
not literal-statement tests.

**7d. The DEPLOY ORDER note (:795-797)** — the paragraph that already exists for migration 0008 —
extend with one sentence after its existing text:

```ts
   * DEPLOY ORDER: this INSERT names a column migration 0008 creates. Additive, and migrations run
   * before the deploy in the normal order — but a worker deployed against an un-migrated database
   * fails this statement, so the order is a requirement here and not an incidental. The same now
   * applies to `content_hash` (migration 0018, media-dedupe P1) — except that preflight's
   * `findSchemaDrift` runs the existence check FIRST, so an un-migrated database takes the
   * workflow red before a job is claimed, rather than dropping a photograph after the money was
   * spent.
```

**Impact:** The worker writes NULL into `content_hash` on every generated row (until phase 3).
Against a pre-migration database it now fails at PREFLIGHT (column named but absent) instead of
mid-job — that is the Finding 1 lesson applied in the safe direction.

### Step 8: Worker tests — `tests/nina.imageworker.test.ts`

**File:** `tests/nina.imageworker.test.ts` — extend the `describe('finishSelfie — Finding 1')`
block (starts :290). The file asserts on the statement the worker BUILT, never on whitespace or
clause order (:63-65).

**Code** (append after the `'still writes the image row and marks the job ok'` test ending :312;
add the constant near `SESSION_ID` at :95):

```ts
/** NIST FIPS 180-4's SHA-256("abc") — the spelling the hash util produces and the column expects. */
const CONTENT_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
```

```ts
  it('names content_hash in the image INSERT and binds NULL while nothing hashes yet', async () => {
    // media-dedupe P1: the column pass-through, mirror of insertNinaMessageImages. The NULL is
    // the whole point for now — P3 replaces it with a store-time hash, and this assertion is
    // what makes the column impossible to forget in between.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), image, result)

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.text).toMatch(/\bcontent_hash\b/)
    expect(insert?.values).toContain(null)
  })

  it('binds the hash the caller supplies, once one exists', async () => {
    // P3's contract, asserted before P3 exists: the parameter is a pass-through, not a constant.
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(sql, jobFixture(), { ...image, contentHash: CONTENT_HASH }, result)

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.values).toContain(CONTENT_HASH)
  })
```

(The `'still writes the image row and marks the job ok'` assertion at :310 — one
`insert into nina_message_images` statement — keeps passing unchanged.)

**Impact:** Locks the raw-SQL shape the same way the `session_id` tests lock theirs. Both tests
are written to survive phase 3's replacement of the INSERT (note 5): after phase 3, the statement
still names `content_hash` and still binds the value as a parameter — the NULL case holds because
phase 3's fixture carries `contentHash: null`, and the supplied-hash case holds because the plan
binds `writePlan.row.contentHash` (phase 3's added pre-put re-check degrades to no-match under
this file's `sqlResolving` default, so the row still lands as an original).

## Verification

**Setup:** Step 0 done (`.env.local` + `npm install` in the worktree).

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (`next typegen && tsc --noEmit`)
**Tests:** `npm run test` — or, while iterating:
`npx vitest run lib/photos/contentHash.test.ts tests/nina.imageworker.test.ts tests/nina.photoRefs.test.ts`

**Manual checks:**

1. `git status` after Step 2 shows exactly `drizzle/0018_<minted>.sql`,
   `drizzle/meta/0018_snapshot.json`, `drizzle/meta/_journal.json` (idx 18) — and nothing in
   `drizzle/` renamed or hand-edited.
2. The generated SQL matches the shape quoted in Step 2 (nullable ADD COLUMN; CREATE INDEX with
   the qualified `WHERE ... is not null`).
3. `npm run db:migrate` a second time reports nothing left to apply (idempotent at the drizzle
   layer, as `db:migrate` always is once the journal row is written).

**Exit criteria** (from the plan index, phase 1): the migration applies cleanly on production
(additive — stated, not silent); `npm run db:check` is green; the hash util is unit-tested
against known-answer vectors and real byte shapes; `insertNinaMessageImages` accepts a hash and
writes NULL for every existing caller (no new caller introduced); the worker's raw-SQL INSERT
names `content_hash` and binds NULL (or the value when given). `npm run build`, `npm run
typecheck` and `npm run test` are all green — the tree behaves exactly as before, plus the
substrate.

## Handoffs

- **Phase 2 (upload path):** consumes `contentHashOf` (hash `compressed.file` — the bytes about
  to be PUT; the util accepts the `Blob` directly), `isValidContentHash` (validate the claim you
  are about to send and the claim the action receives), and `findNinaImageByContentHash` (the
  pre-check before `upload()`). Note for its planner: the insert already coerces malformed claims
  to NULL (Step 5d) — phase 2's validation is for the DECISION (skip the upload vs proceed), not
  for column safety. Its race-close reference row carries NO `content_hash` (phase 2's locked
  decision, reconciled into the index: a client claim never lands on a reference row); the index
  is non-unique so either spelling would compile, and the finder filters to originals either way.
- **Phase 3 (generated + admin paths):** `finishSelfie` already accepts
  `image.contentHash` — phase 3 widens `store()` to hash-before-put and fill it, and does the
  same in `lib/nina/imagerun.ts`'s `storeNinaImage` (which inserts through
  `insertNinaMessageImages`, so the coalescing door already exists for it). The admin path
  likewise validates with `isValidContentHash` before claiming. RECONCILED sequencing: phase 3
  REPLACES this phase's worker INSERT (its Requires states the supersession) and widens the
  `image` fixture in `tests/nina.imageworker.test.ts`; this phase's two shape-level assertions
  are written to survive both — see notes 5 and 6. Phase 3 also edits `updateNinaChatPhotoBlob`
  in `lib/nina/queries.ts`, disjoint from this phase's five hunks.
- **Phase 4 (backfill sweep):** consumes only the COLUMN, via raw SQL in a `.mjs` script —
  `findNinaImageByContentHash` is intentionally NOT its tool (the script cannot import
  `lib/nina/queries.ts`). It hashes by GET-ing each Blob and UPDATEs `content_hash`; it can use
  `lib/photos/contentHash.mjs`-equivalent logic but must reimplement or inline it (a `.mjs`
  script cannot import this `.ts` module either — it can `node:crypto` instead, which is fine
  for a host that only ever computes, never validates claims).
- **Reconciler:** the two cross-phase assumptions a concurrent planner might have gotten wrong
  are (a) `finishSelfie`'s `image` parameter type changed (Step 7b), and (b) invariant 9's
  format validation now lives in `insertNinaMessageImages` itself (Step 5d). Both are additive
  and neither removes anything phases 2/3 planned to build.

## Rollback

Revert the commit. The tree is green at every step boundary, so a revert restores behavior
exactly. The migration, once applied, is deliberately LEFT in place on rollback: it is additive
(a nullable column and an unused index are harmless to the reverted code), and a migration is a
historical record — removing the column later means a NEW forward migration (`DROP INDEX
...; ALTER TABLE ... DROP COLUMN ...`), never an edit to `0018_*` or a rename (0010's
hand-written banner states the same rule). The reverse migration is safe for the same reason the
forward one is: at rollback time no row carries a non-NULL `content_hash` yet, so nothing is
lost.
