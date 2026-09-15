> Adopted from `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` phase 3. Source: `.workflows/plan/dup-image-push-notify/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: Wire runner-side upload routes

**Plan set:** `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`
**Analysis:** `20260915-090023-K7Q2_code_analyzer.md`
**Satisfies:** R1 — a push notification fires when an image uploaded through a *runner-side* route already exists somewhere in this user's collection
**Depends on:** Phase 1
**Difficulty:** NORMAL
**Package:** `app/api/extract`, `components/extract`, `lib/db/queries`, `lib/nina/actions`

---

## Goal

After this phase the two runner-side (client-app) upload paths detect a duplicate against the
user's **whole** image collection and buzz the phone once when they find one. The shots path
(`/upload` → `POST /api/extract`) gains a content hash for the first time — computed in the browser
over the exact bytes it PUTs, stored on `run_photos.content_hash`, then checked cross-table. The
chat path keeps every byte of its existing dedup decision logic untouched and merely *reports*:
the duplicates it already finds silently (exact-hash keeper, same-send twin, perceptual twin,
composer pre-check) now also produce a `duplicate_image` push, and the claims it decides are
genuinely new are additionally asked whether their bytes live in `run_photos` or `nina_avatars`.

## Interface Contract

**Deletes:** none
**Renames:** none

**Creates:**

- `ExtractionBlobRefSchema.contentHash` — new wire field on `POST /api/extract`'s image entries
  (`lib/schema/extractionResult.ts:29-42`), `string | null`, defaulting to `null`
- `NewPhotoInput.contentHash?: string | null` (`lib/db/queries/photos.ts:15-23`)
- `notifyDuplicateShots(userId, photoIds, images)` — module-private helper in
  `app/api/extract/route.ts`, not exported
- `notifyDuplicateChatImages(userId, hits, scan)` — module-private helper in
  `lib/nina/actions/send.ts`, not exported

**Signature changes:**

- `attachExtractionPhotos(userId, extractionId, photos)` — parameter type widens by one optional
  field; the return shape (`{ ids }`) is unchanged, and its **input-order guarantee is now
  contractual** (documented, already true by construction)
- `POST /api/extract` now registers **two** `after()` callbacks instead of one (duplicate scan
  first, extraction job second)
- `sendNinaMessage` registers **one additional** `after()` callback, **last** (after
  `startNinaBackgroundTurn`), and only when there is something to notify or scan

**Requires (from earlier phases) — Phase 1. Reconciled round 1: the names and shapes below are now
copied verbatim from phase 1's plan, not assumed.**

```ts
// lib/db/schema/runs.ts — runPhotos gains this column (phase 1)
contentHash: text('content_hash')            // nullable; drizzle field name `contentHash`

// lib/photos/pointer.ts (phase 1) — the pointer vocabulary lives HERE, not in globalDuplicate.ts
export type PhotoPointerKind = 'shot' | 'avatar' | 'image'
export interface PhotoPointer { kind: PhotoPointerKind; id: string }
export interface ResolvedPhotoPointer extends PhotoPointer { url: string }

// lib/photos/globalDuplicate.ts (phase 1)
export interface GlobalDuplicateOptions {
  exclude?: PhotoPointer | readonly PhotoPointer[] | null
}
export async function findGlobalDuplicatePhoto(
  userId: string,
  contentHash: string | readonly string[],
  options?: GlobalDuplicateOptions,
): Promise<ResolvedPhotoPointer | null>

// lib/push/duplicateImage.ts (phase 1)
/** Sets the payload url to `/photo/<kind>/<id>` via `photoViewerPath`. */
export async function notifyDuplicateImagePush(
  userId: string,
  pointer: PhotoPointer,
): Promise<void>
```

Three properties of that contract this phase leans on:

1. **`exclude` takes a LIST as well as a single pointer, and this phase passes lists.** A single
   upload event writes up to three `run_photos` rows (or several `nina_message_images` rows) in one
   batch; excluding only "the row just written" makes two identical shots in one batch each match
   *the other* and fire a push for one event that has no "already" in it. **The draft of this plan
   flagged this as a risk against a single-pointer `exclude`; the reconciler widened phase 1's
   signature in round 1** — `exclude?: PhotoPointer | readonly PhotoPointer[] | null` — and phase 1's
   two per-table finders now take `excludeIds?: readonly string[]` and use `notInArray`. Both of
   this phase's call sites pass arrays and need no change.
2. **`findGlobalDuplicatePhoto` takes `string | readonly string[]` for the hash**, so passing a
   single hash string (which both call sites do) is correct, and it validates the claims itself with
   `isValidContentHash` — a malformed claim costs no round trip.
3. **`notifyDuplicateImagePush` inherits `notifyNinaPush`'s swallow-everything contract**, but does
   not add a third catch of its own. Both call sites here still wrap it, which is phase 1's stated
   expectation, and the "notification failure never fails the write" invariant is kept at both ends.

**Naming note (reconciler round 1).** This plan's draft guessed three names and got all three wrong.
Every occurrence below has been rewritten to phase 1's real ones:

| draft (wrong) | phase 1 (use this) |
|---|---|
| `findGlobalDuplicateImage` | `findGlobalDuplicatePhoto` |
| `notifyDuplicateImage` | `notifyDuplicateImagePush` |
| `GlobalDuplicatePointer` | `ResolvedPhotoPointer` |
| `GlobalPhotoKind` | `PhotoPointerKind` |

The two type names are exported by **`@/lib/photos/pointer`**, not by
`@/lib/photos/globalDuplicate` — that module imports them too. The module paths themselves
(`@/lib/photos/globalDuplicate`, `@/lib/push/duplicateImage`) were guessed correctly and are
unchanged, so the `vi.mock` specifiers in Steps 7 and 8 still name the right files; only the
exported symbol inside each factory moves.

**Leaves alone (owned by others):**

- `lib/admin/chatPhotoActions.ts`, `lib/admin/ninaAlbumUploadActions.ts`,
  `components/admin/explorer/*` (Phase 4)
- `app/photo/[kind]/[id]/page.tsx` and `lib/nina/attach.ts` (Phase 2)
- `lib/photos/globalDuplicate.ts`, `lib/photos/pointer.ts`, `lib/push/duplicateImage.ts`,
  `lib/push/payload.ts`, `lib/push/send.ts`, `lib/db/schema/runs.ts`, the migration (Phase 1) —
  imported, never edited. **This phase never builds a `/photo/...` URL**; it hands a pointer to
  `notifyDuplicateImagePush` and that helper calls `photoViewerPath`.
- `lib/nina/dedupe.ts`, `lib/nina/perceptual.ts`, `lib/nina/perceptualSign.ts`,
  `lib/nina/actions/duplicateCheck.ts` — the intra-table decision and its gates are read, never
  changed
- `lib/db/schema/runs.ts`'s `ExtractionBlobRefRow` — deliberately does **not** gain `contentHash`
  (see Step 4's rationale)

## Files

| File | Action | What changes |
|---|---|---|
| `lib/schema/extractionResult.ts` | modify | `ExtractionBlobRefSchema` (`:29-42`) gains a validated, nullable `contentHash` claim |
| `lib/schema/extractionResult.test.ts` | modify | three new cases for the new field (accept / reject / default) |
| `components/extract/UploadPicker.tsx` | modify | `process` (`:118-161`) hashes the compressed bytes and carries the hash on the blob ref |
| `components/extract/UploadPicker.test.tsx` | modify | mock `contentHashOf`; the strict body assertion at `:428-435` gains the field; two new cases |
| `lib/db/queries/photos.ts` | modify | `NewPhotoInput` (`:15-23`) + `attachExtractionPhotos` (`:30-50`) write `content_hash` through the `isValidContentHash` door |
| `app/api/extract/route.ts` | modify | strip the hash from the audit column, keep the returned photo ids, scan + notify under `after()` |
| `app/api/extract/route.test.ts` | modify | two `after` callbacks now; photo/job assertions gain `contentHash`; four new cases for the scan |
| `lib/nina/actions/send.ts` | modify | collect duplicate pointers in STEP 0d-bis / STEP 1b; one `after()` notify task at the end; new module-private helper |
| `tests/nina.chatDedupe.test.ts` | modify | two `afterTasks` length assertions (`:197`, `:472`) go from 1 to 2 |
| `components/nina/useComposerPhotos.ts` | **no change** | verified: it already hashes every pick and already sends both `contentHashes` and `dedupedImageIds`. See Step 6. |

Nine files modified (the tenth row is a verified no-change).

**`lib/db/queries/photos.ts` is shared with phases 1 and 2, and this is the agreed sequence**
(reconciler round 1): **phase 1** lands first — it appends `findRunPhotoByContentHash` after
`listExtractionPhotos` and rewrites the file's `drizzle-orm` import line in full; **phase 2** then
inserts `RunPhotoPoint` + `getRunPhoto` after *that* function; **this phase** edits `NewPhotoInput`
and `attachExtractionPhotos`, which sit *above* both of those, and adds one
`@/lib/photos/contentHash` import. Three disjoint regions, and this phase's is the topmost — but
**the `:15-23` and `:30-50` line numbers in the table above are base-commit numbers and will be
correct only because this phase's region is above the other two's insertions.** Do not touch the
`drizzle-orm` import line; phase 1 owns it. If phases 2 and 3 run concurrently (they may — both
depend only on phase 1), expect git to merge them cleanly and verify with `npm run typecheck` in the
land worktree rather than assuming it.

## Implementation Steps

### Step 1: Accept a content-hash claim on the extract wire

**File:** `lib/schema/extractionResult.ts:29-43`
**Change:** add one field to `ExtractionBlobRefSchema`, and one import. The field is a *claim* in
exactly the trust class `width`/`height`/`bytes` already are — format-checked here, never
signature-checked — so a malformed value is a 400 on that field only when the client sends one at
all, and an absent value defaults to `null` (dedup silently inactive for that shot). That keeps an
older deployed client, and `RetryExtraction`'s stored rows, valid requests.

**Code:** the import to add at the top of the file, after the `zod` import:

```ts
import { isValidContentHash } from '@/lib/photos/contentHash'
```

and the schema, complete:

```ts
const ExtractionBlobRefSchema = z.object({
  url: z
    .url('blob url must be absolute')
    .refine(
      (u) =>
        u.startsWith('https://') && new URL(u).hostname.endsWith('.public.blob.vercel-storage.com'),
      'blob url must point at this project’s Vercel Blob store',
    ),
  pathname: z.string().regex(SHOT_STORED_PATHNAME_RE, 'unexpected blob pathname'),
  kind: ScreenKindSchema,
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  bytes: z.number().int().positive().nullable().default(null),
  /**
   * **The duplicate-image push's key (R1).** `contentHashOf` over the EXACT bytes the browser
   * PUT — the compressed output, never the picked file (`lib/photos/contentHash.ts`'s stated
   * contract, and the same rule `useComposerPhotos` follows for chat photos).
   *
   * A CLAIM, in the trust class `width`/`height`/`bytes` are already in: format-checked here,
   * never signature-checked (`/api/upload`'s token payload is deliberately untouched). Absent —
   * an older client, or `RetryExtraction` re-POSTing rows stored before this field existed —
   * defaults to `null`, the shot lands with `content_hash = NULL`, and duplicate detection is
   * silently inactive for it. A shot must never fail to upload because a hash could not be
   * computed or could not be trusted.
   */
  contentHash: z
    .string()
    .refine(isValidContentHash, 'content hash must be 64 lowercase hex characters')
    .nullable()
    .default(null),
})
export type ExtractionBlobRef = z.infer<typeof ExtractionBlobRefSchema>
```

**Impact:** `ExtractionBlobRef` gains a required-on-output, optional-on-input `contentHash:
string | null`. `lib/llm/runExtractionJob.ts` takes `ExtractionBlobRef[]` and reads only
`url`/`pathname`/`kind`, so it is unaffected. Every existing test of this schema uses
`toMatchObject`, so none of them breaks.

### Step 2: Prove the new field in the wire suite

**File:** `lib/schema/extractionResult.test.ts:92-99` (append inside the
`describe('ExtractRequestSchema')` block, after the existing defaults case)
**Change:** three cases. The hash is a boundary a hostile client reaches, so its refusal is a
refusal that matters — the same standard the rest of that file states.
**Code:**

```ts
  it('defaults the content hash to null — an older client is still a valid client', () => {
    // `RetryExtraction` re-POSTs rows persisted before this field existed, so "absent" has to
    // mean "dedup inactive for this shot", never "invalid request".
    const parsed = ExtractRequestSchema.parse({ images: [ref()] })
    expect(parsed.images[0]).toMatchObject({ contentHash: null })
  })

  it('accepts a well-formed content hash', () => {
    const hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    const parsed = ExtractRequestSchema.parse({ images: [ref({ contentHash: hash })] })
    expect(parsed.images[0]).toMatchObject({ contentHash: hash })
  })

  it('rejects a malformed content hash rather than storing a value nothing can match', () => {
    // Uppercase included: `contentHashOf` emits lowercase only, so anything else did not come
    // from our util and must not reach the column in a second spelling.
    for (const contentHash of [
      'not-a-hash',
      '9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B2B0B822CD15D6C15B0F00A08',
      '9f86d081',
    ]) {
      expect(ExtractRequestSchema.safeParse({ images: [ref({ contentHash })] }).success).toBe(false)
    }
  })
```

**Impact:** none on shipping code.

### Step 3: Hash the shot in the browser

**File:** `components/extract/UploadPicker.tsx:118-161` (the `process` callback) and the import
block at `:19`
**Change:** one import, and one hash between the "Uploading" patch and the PUT.

**The ordering is deliberate and load-bearing for the suite:** the `state: 'uploading'` patch stays
*immediately* after the compress `await`, so no extra microtask hop is inserted between the
compressor resolving and the tile showing "Uploading" — which is exactly what
`UploadPicker.test.tsx:160-162` asserts after a single `await flush()`. The hash's own hop lands
between that patch and `upload()`, where two flushes already cover it.

**Code:** the import to add (alphabetically after `compressForExtraction`):

```ts
import { contentHashOf } from '@/lib/photos/contentHash'
```

and the complete replacement for `process`:

```ts
  const process = useCallback(
    async (tile: Tile, file: File) => {
      const key = `${tile.id}:${tile.gen}`
      if (started.current.has(key)) return
      started.current.add(key)
      try {
        const compressed = await compressForExtraction(file)
        patchIfCurrent(tile.id, tile.gen, {
          state: 'uploading',
          compressedBytes: compressed.compressedBytes,
        })

        /*
         * The duplicate-image push's key (R1). Hash the bytes THIS PUT CARRIES —
         * `compressed.file`, never the picked file: `lib/photos/contentHash.ts`'s contract is
         * "sha-256 over the bytes exactly as stored", and a different re-encode is honestly two
         * objects. Same rule, same util, same failure policy as the chat composer
         * (`useComposerPhotos`): a hash that cannot be computed degrades to null, the shot
         * uploads exactly as it always has, and duplicate detection is simply inactive for it.
         *
         * It sits AFTER the "Uploading" patch on purpose — the patch must not be pushed a
         * microtask further from the compressor resolving, and hashing ~55 KB is a millisecond
         * the runner will never see.
         */
        let contentHash: string | null = null
        try {
          contentHash = await contentHashOf(compressed.file)
        } catch {
          contentHash = null
        }

        // The client picks its own pathname; the route validates it against
        // SHOT_REQUEST_PATHNAME_RE and Vercel appends a random suffix on top.
        const requested = `${SHOT_PREFIX}${newId()}.jpg`
        const result = await upload(requested, compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          // Read back inside the signed token, so the webhook cannot be spoofed into claiming a
          // different kind than this authenticated session declared.
          clientPayload: JSON.stringify({ kind: tile.kind }),
        })

        patchIfCurrent(tile.id, tile.gen, {
          state: 'ready',
          blob: {
            url: result.url,
            pathname: result.pathname,
            kind: tile.kind,
            width: compressed.width,
            height: compressed.height,
            bytes: compressed.compressedBytes,
            contentHash,
          },
        })
      } catch (cause) {
        started.current.delete(key) // a failure is retryable; a success is not repeatable
        patchIfCurrent(tile.id, tile.gen, {
          state: 'error',
          error: cause instanceof Error ? cause.message : 'Upload failed.',
        })
      }
    },
    [patchIfCurrent],
  )
```

**Impact:** `submit` already posts `tiles.map((t) => t.blob)` verbatim, so the hash reaches
`/api/extract` with no change to `submit`. A kind swap re-runs `process` from the original bytes
and therefore re-hashes — correct, since it re-compresses and re-PUTs too. `Tile` gains no field.

### Step 4: Pin the new wire field in the picker suite

**File:** `components/extract/UploadPicker.test.tsx` — the mock block (`:26-33`), the strict body
assertion (`:428-435`), and two new cases at the end of the
`describe('UploadPicker — “Read this run”')` block
**Change:** mock `@/lib/photos/contentHash` for the same reason the suite already mocks the
compressor — `crypto.subtle` is a platform capability happy-dom does not reliably provide, and a
deterministic hash is what lets the wire assertion be an equality rather than a regex.

**Code:** add beside the existing hoisted mocks:

```ts
/*
 * Mocked for the same reason `compressForExtraction` is: it is a platform capability, not a
 * decision. `contentHashOf` needs `crypto.subtle`, which happy-dom does not reliably provide, and
 * a fixed answer is what lets the POST-body assertion below be an equality. What is under test
 * here is that the component HASHES THE COMPRESSED BYTES and carries the answer onto the blob
 * ref — the hash function itself is proved in `lib/photos/contentHash`'s own suite.
 */
const { contentHashOf } = vi.hoisted(() => ({ contentHashOf: vi.fn() }))
vi.mock('@/lib/photos/contentHash', () => ({ contentHashOf }))

/** sha256("test") — a known-answer vector, the same one the chat-dedupe suite uses. */
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
```

and seed it in the existing `beforeEach` (`:115-118`), which becomes:

```ts
beforeEach(() => {
  compressForExtraction.mockResolvedValue(shot)
  contentHashOf.mockResolvedValue(HASH)
  upload.mockImplementation(async (pathname: string) => uploadedAt(pathname))
})
```

The strict assertion at `:428-435` becomes:

```ts
    expect(body.images[0]).toEqual({
      url: `https://cblob.test/${upload.mock.calls[0]![0]}`,
      pathname: upload.mock.calls[0]![0],
      kind: 'heartrate',
      width: 560,
      height: 1214,
      bytes: 55_000,
      contentHash: HASH,
    })
```

and two cases appended inside the same `describe`:

```ts
  it('hashes the COMPRESSED bytes, not the picked file — the dedup key describes what is stored', async () => {
    const { container } = renderPicker()
    await readyPicker(container)

    expect(contentHashOf).toHaveBeenCalledTimes(2)
    expect(contentHashOf).toHaveBeenCalledWith(shot.file)
  })

  it('a hash that cannot be computed still uploads, and says so as null', async () => {
    // Invariant: dedup may go inactive for a shot; a shot may never fail to upload because of it.
    contentHashOf.mockRejectedValue(new Error('crypto.subtle unavailable'))
    const { container } = renderPicker()
    await readyPicker(container)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ extractionId: 'ext000000009' }), { status: 202 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.click(screen.getByRole('button', { name: 'Read this run' }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/x/ext000000009'))

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body)
    expect(body.images[0]).toMatchObject({ contentHash: null })
  })
```

**Impact:** none on shipping code. `readyPicker` is already defined in that `describe` and picks
two files, which is why the call count is 2.

### Step 5: Store the hash on `run_photos`

**File:** `lib/db/queries/photos.ts:1-50`
**Change:** one import, one optional field, one coalescing write, and one sentence of contract on
the return value. The `isValidContentHash` gate here is the **insert door** — the same role
`insertNinaMessageImages` plays for `nina_message_images` — so a claim that slipped past the route
(or a future non-HTTP caller) can only ever write `NULL`, never a second spelling of the column.

**Code:** the import to add after `newPhotoId`:

```ts
import { isValidContentHash } from '@/lib/photos/contentHash'
```

and the complete replacement for the interface and the function:

```ts
export interface NewPhotoInput {
  blobUrl: string
  pathname: string
  kind: PhotoKind
  width?: number | null
  height?: number | null
  bytes?: number | null
  sortOrder?: number
  /**
   * **The duplicate-image push's key (R1).** `contentHashOf` over the bytes this row's blob
   * holds, as claimed by the browser that PUT them. THIS FUNCTION IS THE INSERT DOOR: anything
   * that is not 64 lowercase hex is written as NULL — dedup silently inactive for that row —
   * which is the same rule, for the same reason, that `insertNinaMessageImages` applies to
   * `nina_message_images.content_hash`. One spelling in the column, or nothing.
   */
  contentHash?: string | null
}

/**
 * Attaches uploaded screenshots to their extraction (R-1). `run_id` stays NULL until
 * `commitExtractedRun` backfills it, so a photo is never orphaned and no placeholder run is
 * needed to hold it.
 *
 * **`ids` comes back in INPUT ORDER**, and that is a contract rather than an accident: the ids
 * are minted here, one per `photos[i]`, and `POST /api/extract` zips them back against the claims
 * it sent to know which row carries which hash for the duplicate scan. Do not reorder the map.
 */
export async function attachExtractionPhotos(
  userId: string,
  extractionId: string,
  photos: NewPhotoInput[],
): Promise<{ ids: string[] }> {
  await assertExtractionOwned(userId, extractionId)
  if (photos.length === 0) return { ids: [] }
  const rows = photos.map((photo, i) => ({
    id: newPhotoId(),
    extractionId,
    blobUrl: photo.blobUrl,
    pathname: photo.pathname,
    kind: photo.kind,
    width: photo.width ?? null,
    height: photo.height ?? null,
    bytes: photo.bytes ?? null,
    sortOrder: photo.sortOrder ?? i,
    contentHash: isValidContentHash(photo.contentHash) ? photo.contentHash : null,
  }))
  await db.insert(runPhotos).values(rows)
  return { ids: rows.map((r) => r.id) }
}
```

**Impact:** requires phase 1's `runPhotos.contentHash` drizzle field; without it this is a compile
error, which is the intended dependency signal. `tests/db.queries.extractions.test.ts:190-222`
asserts on SQL text and the values' positional params (`values ($1, $2, default,` and the presence
of `0`/`1`/`2`), not on column count, so those cases keep passing with one more column and three
more `null` params. `tests/integration/queries.int.test.ts:130` passes photos with no hash — the
optional field covers it.

### Step 6: Scan and notify on the shots route

**File:** `app/api/extract/route.ts` — complete replacement
**Change:** keep the photo ids, strip the hash from the audit column, and register the duplicate
scan as its own `after()` callback ahead of the job's.

**Why the hash is stripped from `createExtraction`'s argument.** `extractions.blob_urls` is the
immutable audit record of what the vision model was shown; a dedup key is not part of that record
and `run_photos.content_hash` is where it belongs. The second reason is a real false positive that
would otherwise ship: `components/review/RetryExtraction.tsx:45` re-POSTs those stored rows
*verbatim*. If the hash round-tripped through them, every retry of an extraction whose photos are
still attached would find its own earlier `run_photos` rows and buzz the phone for a button the
runner pressed on purpose. `ExtractionBlobRefRow` (`lib/db/schema/runs.ts:129-137`) therefore keeps
exactly the shape it has.

**Why `after()` and not inline.** The route's whole contract is "the client waits for one INSERT,
not for 33.7 seconds". A cross-table lookup plus a `web-push` fan-out is not something the 202 may
wait on. It is registered **before** the job's `after()` so the notification is not queued behind a
33.7 s model call; if the platform runs the two callbacks in registration order, the job's own soft
deadline is computed from `invocationStartedAt` and therefore *measures* the shortened budget
rather than overshooting it, which is the safe direction.

**Code:**

```ts
import { after } from 'next/server'

import { requireUserIdApi, unauthorizedJson, UnauthorizedError } from '@/lib/auth/requireUserId'
import { attachExtractionPhotos, createExtraction } from '@/lib/db/queries'
import type { ExtractionBlobUrls } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { runExtractionJob } from '@/lib/llm/runExtractionJob'
import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'
import { notifyDuplicateImagePush } from '@/lib/push/duplicateImage'
import {
  ExtractRequestSchema,
  type ExtractAcceptedResponse,
  type ExtractionBlobRef,
} from '@/lib/schema/extractionResult'

/**
 * `POST /api/extract` — starts a background extraction and returns immediately (D4, R-20).
 *
 * The client waits for one INSERT, not for 33.7 seconds. `after()` runs its callback once the
 * response has been sent but still inside this invocation, extending its lifetime up to
 * `maxDuration`. That is the right primitive here precisely because it needs no new
 * infrastructure — no queue service, no worker, nothing beyond what Vercel already provides —
 * and `@vercel/functions`' `waitUntil()` is the documented fallback with the same semantics if a
 * future Next.js release ever changes `after()`'s guarantees.
 *
 * Why the work cannot simply happen inline: extraction is a 33.7 s median against a 60 s Hobby
 * ceiling, and that median is the happy path — it excludes the repair round-trip, cold start and
 * network variance. `fetch → 33.7 s → Zod → repair → DB write` does not reliably fit in 60 s.
 */

export const runtime = 'nodejs'
/**
 * The Vercel Hobby ceiling, and the budget `after()` shares.
 *
 * A LITERAL `60`, not `FUNCTION_MAX_DURATION_S`. Segment config exports are statically analysed at
 * build time and an imported constant is not a value the analyser can see — `next build` rejects
 * the whole route with "Invalid segment configuration export detected", the same trap `proxy.ts`'s
 * matcher documents. `lib/extract/constants.ts` keeps the shared copy for the job's own budget
 * arithmetic; `tests/extract.pollSchedule.test.ts` asserts the two agree.
 */
export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  // The whole invocation's clock starts here, not inside the job: the blob fetches and the vision
  // call share one 60 s envelope with the request that scheduled them, and the job's soft
  // deadline has to be measured against the same origin or it will overshoot.
  const invocationStartedAt = Date.now()

  let userId: string
  try {
    userId = await requireUserIdApi()
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedJson()
    throw error
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ExtractRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }
  const { images } = parsed.data

  /*
   * THE AUDIT COLUMN KEEPS EXACTLY THE SHAPE IT HAS ALWAYS HAD, which is why `contentHash` is
   * dropped here rather than passed through. Two reasons, both deliberate:
   *
   *   · `extractions.blob_urls` is the immutable record of what the model was SHOWN. A dedup key
   *     is not part of that record; `run_photos.content_hash` is where it belongs, and the two
   *     tables' deliberate duplication (see the column's own docstring) draws exactly this line.
   *   · `RetryExtraction` re-POSTs those stored rows verbatim. A hash round-tripping through them
   *     would make every retry of a still-attached extraction match its own earlier `run_photos`
   *     rows and buzz the phone for a button the runner pressed on purpose.
   */
  const auditImages: ExtractionBlobUrls = images.map((image) => ({
    url: image.url,
    pathname: image.pathname,
    kind: image.kind,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
  }))

  // Two writes, both scoped to this user:
  //   1. `extractions` — the audit row, opened `pending`, holding what we are about to send.
  //   2. `run_photos` — R-1's attachment point. The photos hang off the EXTRACTION until F05's
  //      commit backfills `run_id`; there is no `runs` row to attach them to and there must not
  //      be one (a placeholder would need a placeholder date and would collide with the R-5
  //      dedupe index on the second upload of any day).
  const { id: extractionId } = await createExtraction(userId, auditImages, env.LLM_VISION_MODEL)
  const { ids: photoIds } = await attachExtractionPhotos(
    userId,
    extractionId,
    images.map((image, index) => ({
      blobUrl: image.url,
      pathname: image.pathname,
      kind: image.kind,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      contentHash: image.contentHash,
      sortOrder: index,
    })),
  )

  /*
   * R1 — THE DUPLICATE-IMAGE PUSH. Registered BEFORE the job's `after()` so the notification is
   * not queued behind a 33.7 s model call. The job measures its own soft deadline from
   * `invocationStartedAt`, so if the platform runs these in order the job SEES the shortened
   * budget rather than overshooting it — the safe direction, and the reason this ordering is not
   * a gamble.
   *
   * It is not inline for the reason the route exists: the client waits for one INSERT, and a
   * cross-table lookup plus a web-push fan-out is not something a 202 may wait on.
   */
  after(async () => {
    try {
      await notifyDuplicateShots(userId, photoIds, images)
    } catch (cause) {
      /* A notification is a courtesy attached to rows that are already committed. There is
       * nothing to retry against and nobody left to tell. */
      console.warn('[extract] duplicate-image notify failed', { error: String(cause) })
    }
  })

  after(async () => {
    await runExtractionJob({ userId, extractionId, images, invocationStartedAt })
  })

  const body: ExtractAcceptedResponse = { extractionId }
  return Response.json(body, { status: 202 })
}

/**
 * **"Do these bytes already exist anywhere in this runner's collection?"** — asked once per
 * DISTINCT hash in the upload, against all three image tables, excluding everything this upload
 * itself just wrote.
 *
 * ── WHY THE WHOLE BATCH IS EXCLUDED, NOT JUST "THE ROW ITSELF" ────────────────────────────────
 * One `/upload` submits up to three shots. Two of them CAN be the same file (the kinds must
 * differ, the bytes need not), and with only the asking row excluded each would match the other:
 * two pushes for one upload, both pointing at a photograph from the same batch. Excluding every
 * id this request inserted makes the question the honest one — "already", meaning before now.
 *
 * ── EVERY FAILURE IS SILENT ───────────────────────────────────────────────────────────────────
 * A failed lookup or a failed send warns and moves on. The photos are committed; nothing here may
 * ever be load-bearing for them (the invariant every `notifyNinaPush` call site already keeps).
 */
async function notifyDuplicateShots(
  userId: string,
  photoIds: readonly string[],
  images: readonly ExtractionBlobRef[],
): Promise<void> {
  const inserted = images.flatMap((image, index) => {
    const id = photoIds[index]
    return id === undefined || image.contentHash === null
      ? []
      : [{ id, contentHash: image.contentHash }]
  })
  if (inserted.length === 0) return

  const exclude = inserted.map((row) => ({ kind: 'shot' as const, id: row.id }))
  const asked = new Set<string>()
  for (const row of inserted) {
    if (asked.has(row.contentHash)) continue
    asked.add(row.contentHash)
    try {
      const existing = await findGlobalDuplicatePhoto(userId, row.contentHash, { exclude })
      if (existing === null) continue
      await notifyDuplicateImagePush(userId, existing)
    } catch (cause) {
      console.warn('[extract] duplicate-image check failed', { error: String(cause) })
    }
  }
}
```

**Impact:** the route now makes up to three extra indexed reads and up to three pushes, all after
the response. `createExtraction`'s argument is a new array with identical contents to what it
received before, so nothing downstream of the audit column changes.

### Step 7: Update the route suite

**File:** `app/api/extract/route.test.ts`
**Change:** the two new modules are mocked (they reach Postgres and `web-push` otherwise), the
`after` count and callback index move, two assertions gain the new field, and four cases cover the
scan.

**Code:** add beside the existing mocks (`:34-38`):

```ts
const { findGlobalDuplicatePhoto, notifyDuplicateImagePush } = vi.hoisted(() => ({
  findGlobalDuplicatePhoto: vi.fn(),
  notifyDuplicateImagePush: vi.fn(),
}))
vi.mock('@/lib/photos/globalDuplicate', () => ({ findGlobalDuplicatePhoto }))
vi.mock('@/lib/push/duplicateImage', () => ({ notifyDuplicateImagePush }))
```

extend the fixture (`:49-60`) so a test can give a shot a hash:

```ts
/** sha256("test") — a known-answer vector, the same one the chat-dedupe suite uses. */
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

/** A blob ref that satisfies the real `ExtractionBlobRefSchema`, for one `kind`. */
function image(kind: 'summary' | 'splits' | 'heartrate', contentHash: string | null = null) {
  const pathname = 'shots/abcdefghijkl-abcdefghijklmnop.jpg'
  return {
    url: `https://xyz.public.blob.vercel-storage.com/${pathname}`,
    pathname,
    kind,
    width: 560,
    height: 1200,
    bytes: 58_000,
    ...(contentHash === null ? {} : { contentHash }),
  }
}
```

extend `beforeEach` (`:72-77`):

```ts
beforeEach(() => {
  vi.clearAllMocks()
  requireUserIdApiMock.mockResolvedValue(USER_ID)
  createExtractionMock.mockResolvedValue({ id: EXTRACTION_ID })
  attachExtractionPhotosMock.mockResolvedValue({ ids: [] })
  findGlobalDuplicatePhoto.mockResolvedValue(null)
  notifyDuplicateImagePush.mockResolvedValue(undefined)
})
```

then the three happy-path cases become (note `afterMock` is now two callbacks — [0] the duplicate
scan, [1] the extraction job):

```ts
  it('opens a pending extraction, attaches photos, schedules the job, answers 202', async () => {
    const images = [image('summary')]
    const response = await post({ images })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ extractionId: EXTRACTION_ID })
    // The audit row carries the vision model the session was opened with — and NOT the content
    // hash: `blob_urls` is the immutable record of what the model was shown, and `RetryExtraction`
    // re-POSTs it verbatim.
    expect(createExtractionMock).toHaveBeenCalledWith(USER_ID, images, 'glm-4.6v')
    // Two deferred callbacks now: [0] the duplicate scan, [1] the extraction job.
    expect(afterMock).toHaveBeenCalledTimes(2)
  })

  it('attaches the photos with their sort order, scoped to the user', async () => {
    const images = [image('summary'), image('splits'), image('heartrate')]
    await post({ images })

    expect(attachExtractionPhotosMock).toHaveBeenCalledTimes(1)
    const [userId, extractionId, photos] = attachExtractionPhotosMock.mock.calls[0]!
    expect(userId).toBe(USER_ID)
    expect(extractionId).toBe(EXTRACTION_ID)
    expect(photos).toEqual(
      images.map((img, index) => ({
        blobUrl: img.url,
        pathname: img.pathname,
        kind: img.kind,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        contentHash: null,
        sortOrder: index,
      })),
    )
  })

  it('the scheduled job carries user, extraction id, images and the invocation clock', async () => {
    const images = [image('heartrate')]
    await post({ images })

    const callback = afterMock.mock.calls[1]![0] as () => Promise<void>
    await callback()

    expect(runExtractionJobMock).toHaveBeenCalledTimes(1)
    const jobInput = runExtractionJobMock.mock.calls[0]![0]!
    expect(jobInput.userId).toBe(USER_ID)
    expect(jobInput.extractionId).toBe(EXTRACTION_ID)
    expect(jobInput.images).toEqual(images.map((img) => ({ ...img, contentHash: null })))
    // The invocation clock is stamped in the handler, not inside the job — the job's soft
    // deadline must be measured against the same origin as the request.
    expect(typeof jobInput.invocationStartedAt).toBe('number')
  })
```

and a new `describe` at the end of the file:

```ts
/**
 * R1 — the duplicate-image push. The scan runs in its own deferred callback, so nothing here can
 * delay the 202; these cases drive that callback directly.
 */
describe('POST /api/extract — the duplicate-image push', () => {
  /** Run the deferred duplicate scan — always `after`'s FIRST callback. */
  async function drainScan(): Promise<void> {
    const callback = afterMock.mock.calls[0]![0] as () => Promise<void>
    await callback()
  }

  it('asks the whole collection once per shot and pushes the photograph it finds', async () => {
    attachExtractionPhotosMock.mockResolvedValue({ ids: ['pho000000001'] })
    findGlobalDuplicatePhoto.mockResolvedValue({
      kind: 'image',
      id: 'imgKEEPER001',
      url: 'https://blob.example/nina/u1/chat/keeper.jpg',
    })

    await post({ images: [image('summary', HASH)] })
    await drainScan()

    // The row this upload just wrote is excluded: "already" means before now.
    expect(findGlobalDuplicatePhoto).toHaveBeenCalledWith(USER_ID, HASH, {
      exclude: [{ kind: 'shot', id: 'pho000000001' }],
    })
    expect(notifyDuplicateImagePush).toHaveBeenCalledTimes(1)
    expect(notifyDuplicateImagePush).toHaveBeenCalledWith(USER_ID, {
      kind: 'image',
      id: 'imgKEEPER001',
      url: 'https://blob.example/nina/u1/chat/keeper.jpg',
    })
  })

  it('a genuinely new shot is never announced', async () => {
    attachExtractionPhotosMock.mockResolvedValue({ ids: ['pho000000001'] })

    await post({ images: [image('summary', HASH)] })
    await drainScan()

    expect(findGlobalDuplicatePhoto).toHaveBeenCalledTimes(1)
    expect(notifyDuplicateImagePush).not.toHaveBeenCalled()
  })

  it('a shot with no hash is never looked up — dedup is inactive, not broken', async () => {
    attachExtractionPhotosMock.mockResolvedValue({ ids: ['pho000000001'] })

    await post({ images: [image('summary')] })
    await drainScan()

    expect(findGlobalDuplicatePhoto).not.toHaveBeenCalled()
    expect(notifyDuplicateImagePush).not.toHaveBeenCalled()
  })

  it('a failed lookup is swallowed — the photos are already committed', async () => {
    attachExtractionPhotosMock.mockResolvedValue({ ids: ['pho000000001'] })
    findGlobalDuplicatePhoto.mockRejectedValue(new Error('db down'))

    await post({ images: [image('summary', HASH)] })
    await expect(drainScan()).resolves.toBeUndefined()
    expect(notifyDuplicateImagePush).not.toHaveBeenCalled()
  })
})
```

**Impact:** none on shipping code. `findGlobalDuplicatePhoto`/`notifyDuplicateImagePush` must be
mocked in this suite whatever phase 1 names them — unmocked, the first would open a Neon client and
the second would try to reach a push endpoint.

### Step 8: Report the chat path's duplicates

**File:** `lib/nina/actions/send.ts` — five edits inside `sendNinaMessage` plus one new
module-private helper. **No existing decision changes**: not one line of `partitionNinaUploadClaims`,
`applyPerceptualKeepers`, `ninaUploadInsertRow`, `perceptualTwinsForClaims` or `resolveAttachment`
is touched, and no row's shape moves. This phase only *reads* what those already decided.

**8a — the imports** (`:23-42`, add after the existing `../perceptualSign` import, keeping the
`@/`-prefixed imports with the others at the top of the file):

```ts
import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'
import type { ResolvedPhotoPointer } from '@/lib/photos/pointer'
import { notifyDuplicateImagePush } from '@/lib/push/duplicateImage'
```

**8b — the two collectors**, declared immediately after STEP 0d's pinned-photo resolution
(`:531-532`, the line `if (attach !== null && attached === null) return REFUSED`) and therefore
**above** STEP 0d-bis, which is the first block that writes to them:

```ts
  /*
   * ── R1: THE DUPLICATE-IMAGE PUSH, AND WHY IT IS TWO LISTS ────────────────────────────────────
   * This send already makes a complete duplicate judgement for `nina_message_images` — the
   * composer's pre-check, STEP 1b's exact-hash race-close, the same-send split and the perceptual
   * twin scan. That judgement is UNCHANGED and stays silent in the collection; what is new is
   * that it is now also REPORTED.
   *
   *   · `duplicateHits` — photographs this send proved were ALREADY in the collection. They need
   *     no further lookup: the keeper row is in hand. This is the only way a PERCEPTUAL duplicate
   *     can ever be announced, since its bytes are new by definition and no content-hash lookup
   *     would find it.
   *   · `crossTableScan` — the claims this send decided are genuinely NEW to
   *     `nina_message_images`, paired with the row id each became. Their bytes may still be
   *     sitting in `run_photos` or `nina_avatars`, which is precisely the question no existing
   *     layer asks. Phase 1's cross-table lookup answers it, with these rows excluded.
   *
   * Both are drained in ONE deferred task at the very end of the action (see 8e). Nothing here
   * may delay the response: F36 R6's "it quickly shows that the message is sent" is a claim about
   * everything above STEP 1c being the only synchronous work.
   *
   * The PINNED photo (`attached`, R26's "Kirim ke chat") is deliberately NOT collected. He tapped
   * a specific photograph out of the album; telling him it already exists is telling him what he
   * just did.
   */
  const duplicateHits: ResolvedPhotoPointer[] = []
  const crossTableScan: Array<{ id: string; contentHash: string }> = []
```

**8c — the composer's pre-check hits**, inside STEP 0d-bis's loop (`:549-564`). The complete
replacement for that loop:

```ts
  const dedupedPhotos: ResolvedNinaAttachment[] = []
  for (const pointer of dedupedPointers) {
    try {
      const resolved = await resolveAttachment(userId, pointer)
      if (resolved === null) {
        console.warn('[nina] dropped a deduplicated tile; its keeper is gone', { id: pointer.id })
        continue
      }
      dedupedPhotos.push(resolved)
      /* R1. The composer's pre-check already proved these bytes are in the collection — this
       * pointer IS the photograph that was already saved, and it is the common case by a wide
       * margin (the race-close below only fires when the keeper landed after the pre-check ran). */
      duplicateHits.push({ kind: 'image', id: pointer.id, url: resolved.blobUrl })
    } catch (cause) {
      console.warn('[nina] could not resolve a deduplicated tile', {
        id: pointer.id,
        error: String(cause),
      })
    }
  }
```

**8d — STEP 1b.** Two insertions inside the existing `try`, neither of which changes a decision:

The fresh-row zip (`:733-739`) becomes:

```ts
      /* The same-send originals, by hash, now that they have ids. */
      const sameSend = new Map<string, NinaUploadKeeper>()
      partition.fresh.forEach((claim, index) => {
        const row = freshRows[index]
        if (claim.contentHash !== null && row !== undefined) {
          sameSend.set(claim.contentHash, row)
          /* R1. This claim is NEW to `nina_message_images` — every layer of this file agreed on
           * that. Whether its bytes are already in `run_photos` or `nina_avatars` is a question
           * only phase 1's cross-table lookup can answer, and it is asked after the response. */
          crossTableScan.push({ id: row.id, contentHash: claim.contentHash })
        }
      })
```

and the reference loop (`:745-768`) becomes:

```ts
      for (const { claim, keeper } of partition.references) {
        /* A DB or perceptual reference carries its keeper whole; a SAME-SEND reference resolves
         * the id from the fresh insert's return, which only claims WITH a hash can reach (the
         * same-send path is hash-keyed by construction). The wide claim type
         * (`NinaUploadPartition.references`) is why the null check sits in the expression. */
        const resolved =
          keeper ?? (claim.contentHash !== null ? (sameSend.get(claim.contentHash) ?? null) : null)
        if (resolved === null) {
          /* Unreachable by construction — a reference exists only when a keeper (DB or
           * same-send) existed at partition time. But the degradation ladder's floor is "write
           * the photograph fresh", because this claim's bytes are still sitting in Blob and a
           * row that names nothing is the one outcome worse than a duplicate. */
          referenceRows.push(
            ninaUploadInsertRow({ messageId: runnerMessageId, claim, keeper: null }).row,
          )
          continue
        }
        referenceRows.push(
          ninaUploadInsertRow({ messageId: runnerMessageId, claim, keeper: resolved }).row,
        )
        /*
         * R1. `keeper` and not `resolved`, and the difference is the whole rule: a non-null
         * `keeper` is a row that PREDATES this send — the exact-hash race-close's answer, or the
         * perceptual twin scan's — and is therefore a photograph he already had. A same-send
         * reference (`keeper === null`, resolved out of `sameSend`) points at a row this very
         * send created seconds ago; announcing that as "you already have this" would be a lie
         * about "already", so it is left silent exactly as it is today.
         */
        if (keeper !== null) {
          duplicateHits.push({ kind: 'image', id: keeper.id, url: keeper.blobUrl })
        }
        /* These bytes landed for THIS send and the row now points at the keeper's URL instead —
         * nobody references them. Released below, and only here. */
        releases.push({ blobUrl: claim.blobUrl, pathname: claim.pathname })
      }
```

**8e — the deferred notify**, inserted immediately before the final `return` statement (`:951`):

```ts
  /*
   * R1 — THE DUPLICATE-IMAGE PUSH, DRAINED AFTER THE RESPONSE.
   *
   * Registered LAST, after `startNinaBackgroundTurn`, on purpose: every other `after()` this
   * action registers (the blob releases, the background turn) keeps the index it has always had,
   * so nothing that reasons about deferred-task order — the suites included — shifts underneath
   * it. Registered CONDITIONALLY for the same reason: a send with nothing to report defers
   * nothing, exactly as before.
   */
  if (duplicateHits.length > 0 || crossTableScan.length > 0) {
    after(async () => {
      try {
        await notifyDuplicateChatImages(userId, duplicateHits, crossTableScan)
      } catch (cause) {
        /* The rows are committed and the turn is running; a notification is a courtesy and must
         * never be able to make either look like a failure. */
        console.warn('[nina] duplicate-image notify failed', { error: String(cause) })
      }
    })
  }

  return { ok: true, userMessageId: runnerMessageId, sessionId, cursor: runnerSeq, turnId }
```

**8f — the helper**, appended at the end of the file (after `perceptualTwinsForClaims`):

```ts
/**
 * **The duplicate-image push for one chat send (R1)** — the reporting half of a judgement that
 * was already made, plus the one question no existing layer asks.
 *
 * `hits` are photographs this send PROVED were already in the collection (the composer's
 * pre-check, the exact-hash race-close, the perceptual twin scan). They are announced as they
 * are: the keeper row is the "saved image" the notification's deep link opens.
 *
 * `scan` are the rows this send wrote as genuine originals. Their bytes are new to
 * `nina_message_images` — and may still be sitting in `run_photos` or `nina_avatars`, which is the
 * gap this feature exists to close. One lookup per DISTINCT hash, with EVERY row this send wrote
 * excluded, so "already" keeps meaning "before now" even when the same file was picked twice.
 *
 * ── AT MOST ONE PUSH PER PHOTOGRAPH ───────────────────────────────────────────────────────────
 * Three tiles of the same picture are one duplicate, not three. `notified` is keyed by the
 * pointer, so a keeper announced from `hits` is never announced again from the scan.
 *
 * ── EVERY FAILURE IS SILENT ───────────────────────────────────────────────────────────────────
 * The message, its images and its turn are all committed before this runs. A dead lookup warns
 * and the next hash is asked; nothing here may ever be load-bearing for a send.
 */
async function notifyDuplicateChatImages(
  userId: string,
  hits: readonly ResolvedPhotoPointer[],
  scan: ReadonlyArray<{ id: string; contentHash: string }>,
): Promise<void> {
  const notified = new Set<string>()

  for (const hit of hits) {
    const key = `${hit.kind}:${hit.id}`
    if (notified.has(key)) continue
    notified.add(key)
    await notifyDuplicateImagePush(userId, hit)
  }

  if (scan.length === 0) return
  const exclude = scan.map((row) => ({ kind: 'image' as const, id: row.id }))
  const asked = new Set<string>()
  for (const row of scan) {
    if (asked.has(row.contentHash)) continue
    asked.add(row.contentHash)
    try {
      const existing = await findGlobalDuplicatePhoto(userId, row.contentHash, { exclude })
      if (existing === null) continue
      const key = `${existing.kind}:${existing.id}`
      if (notified.has(key)) continue
      notified.add(key)
      await notifyDuplicateImagePush(userId, existing)
    } catch (cause) {
      console.warn('[nina] cross-table duplicate check failed', {
        hash: row.contentHash,
        error: String(cause),
      })
    }
  }
}
```

**Impact:** the send path gains zero synchronous work — every lookup and every push happens inside
the deferred task. Reference rows carry no `content_hash` (the standing per-path rule in
`lib/nina/dedupe.ts:171-179`), so they can never be found by the cross-table lookup and never need
excluding.

### Step 9: `components/nina/useComposerPhotos.ts` — verified, no change

**File:** `components/nina/useComposerPhotos.ts:165-259`
**Change:** none. Recorded here because the phase scope names the file and a reader will otherwise
assume it was missed.

The composer already does everything this phase needs from the client:

- it hashes **every** pick with `contentHashOf` over `compressed.file` (`:177-182`), plus the
  picked file itself as a second key (`:193-198`);
- it sends the encode hash to the server as `contentHashes[pathname]` (`collectDraft`, `:313-325`),
  which is what STEP 1b's claims and therefore 8d's `crossTableScan` are built from;
- when its pre-check hits, it sends `dedupedImageIds`, which 8c turns into a push.

A chat photo whose bytes exist only in `run_photos` or `nina_avatars` is *not* matched by the
composer's pre-check (`findNinaDuplicateChatImage` is `nina_message_images`-only, and widening it
would change the composer's upload decision — explicitly out of this phase's scope). It uploads as
a genuine original and 8d's cross-table scan catches it afterwards, which is the correct division:
the pre-check decides **whether to PUT**, this feature decides **whether to tell him**.

### Step 10: Two assertions in the chat-dedupe suite

**File:** `tests/nina.chatDedupe.test.ts:197` and `:472`
**Change:** both scenarios end with a confirmed duplicate, so the send now defers a second task.
The release task keeps index `0` (STEP 1b registers it; 8e registers last), so both
`await afterTasks[0]!()` lines are unchanged.

At `:196-198`:

```ts
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    /* Two deferred tasks: [0] the blob release, [1] the duplicate-image push this keeper earned. */
    expect(afterTasks).toHaveLength(2)
    await afterTasks[0]!()
```

At `:471-473`:

```ts
    expect(spies.releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    /* Two deferred tasks: [0] the blob release, [1] the duplicate-image push the twin earned. */
    expect(afterTasks).toHaveLength(2)
    await afterTasks[0]!()
```

**Every other `afterTasks` assertion in that file stays as it is**, and each for a checkable reason:

| Line | Scenario | Why it is unaffected |
|---|---|---|
| `:249` | same-send twins | no length assertion; `afterTasks[0]` is still the release |
| `:274` | invalid hash | no hash → no scan, no hit → no second task |
| `:292` | failed keeper lookup | lands fresh, but `insertNinaMessageImages` is mocked to return `[]`, so the fresh-row zip yields no scan entry |
| `:501` | non-twin lands fresh | same: the insert mock returns `[]` |
| `:519` | failed sign | same |

That the scan is built from the **returned** rows (8d) rather than from the claims is what keeps
those four honest — the id to exclude only exists once the insert answers, so a send whose insert
answered with nothing has nothing to scan.

**Impact:** none on shipping code. `tests/nina.sendDescriptions.test.ts`'s `drainedTurnInput`
(`:169-176`, asserts exactly one deferred task) is unaffected: its cases attach a pinned album
photo or plain tickets, and its `insertNinaMessageImages` mock also returns `[]`.

## Verification

**Build:** `npx tsc --noEmit` — or `npm run typecheck` (`next typegen && tsc --noEmit`) if
`.next/types` is stale. A fresh worktree needs `npm install` and a copied `.env.local` first;
`lib/env.ts` validates 14 variables at load and there is no `node_modules` in a new worktree.

**Tests:**

```
npx vitest run lib/schema/extractionResult.test.ts app/api/extract/route.test.ts \
  components/extract/UploadPicker.test.tsx tests/nina.chatDedupe.test.ts \
  tests/nina.sendDescriptions.test.ts tests/db.queries.extractions.test.ts
npm test
```

**Known flake watch:** `components/extract/UploadPicker.test.tsx` drives a promise chain through
`await act(async () => {})`. Step 3 deliberately puts the new `await` *after* the `state:
'uploading'` patch so no assertion moves, but if a state assertion in that file goes red with the
previous state rendered, the remedy is one more `await flush()` at that call site — never a
`waitFor` around a `getBy`, and never reordering the patch back.

**Manual check:** with a phone subscribed on `/me`, upload a screenshot on `/upload` that is
byte-identical to one already uploaded (pick the same file twice, in two separate `/upload`
sessions). The second upload should produce exactly one notification whose click target is
`/photo/shot/<the first photo's id>`. Then send that same file as a chat photo on `/nina`: it
should produce exactly one notification too (the composer will have pre-checked it as a *chat*
duplicate only if it was also sent to chat before; otherwise the cross-table scan fires it).

**Exit criteria:**

- A shot whose bytes already exist in any of the three tables produces exactly one
  `duplicate_image` push per upload event; a genuinely new shot produces none; a shot whose hash
  could not be computed produces none and still uploads.
- `run_photos.content_hash` is populated for every new shot uploaded by the current client, and
  `NULL` for anything that arrives without a valid claim.
- `extractions.blob_urls` rows still carry exactly six fields, and pressing "Try again" on a
  failed extraction produces no notification.
- A chat photo that is an exact-hash, same-keeper or perceptual duplicate produces exactly one
  `duplicate_image` push *in addition to* the reference row it already wrote — and the reference
  row, the keeper choice and the blob release are byte-identical to before.
- A chat photo whose bytes exist only in `run_photos`/`nina_avatars` uploads as an original (no
  decision change) and produces one push.
- `npx tsc --noEmit` clean, `npm test` green.

## Handoffs

- **Phase 4** will want the same "scan a batch, notify once per distinct hit" shape for
  `registerNinaAvatarsAction`. This phase deliberately does **not** extract a shared batch-scan
  helper: two phases creating the same new file is a merge conflict, and phase 1 already owns the
  shared layer. If a third call site wants it, extract it *after* both phases land, from the two
  module-private helpers in `app/api/extract/route.ts` and `lib/nina/actions/send.ts`.
- **Backfill of `run_photos.content_hash` for existing rows** is out of scope for the whole set
  (index Decisions). Until a sweep runs, a new upload can only match rows written after this phase
  lands — so the manual check above needs *two* new uploads, not one new one against history.
- **The composer's pre-check stays `nina_message_images`-only.** Widening
  `findNinaDuplicateChatImage` cross-table would let a chat pick attach an existing *shot* or
  *avatar* without uploading — a genuine storage win and a genuine change to the upload decision,
  which this phase is explicitly forbidden to make. Worth a card of its own.
- **`/upload` shows the runner nothing.** R1 asks only for a push; the picker tile still reads
  "Ready". If in-app feedback is wanted later, `ExtractAcceptedResponse` is the seam — it would
  have to carry the verdict, which means the scan could no longer be deferred.
- **`replaceChatPhotoAction`-style informational pushes on the shots path.** A retry of a
  still-attached extraction is deliberately made undetectable here (Step 6). If that is ever
  wanted as a signal, it belongs to `RetryExtraction`, not to this route.

## Rollback

Every change is additive and revertable file by file, in any order:

1. `git checkout -- lib/nina/actions/send.ts tests/nina.chatDedupe.test.ts` — the chat path returns
   to a silent dedup; nothing else depends on it.
2. `git checkout -- app/api/extract/route.ts app/api/extract/route.test.ts` — the shots route stops
   scanning. Hashes keep being written; they are simply unread.
3. `git checkout -- lib/db/queries/photos.ts` — `content_hash` stops being written. The column is
   nullable, so existing values stay and nothing reads them.
4. `git checkout -- lib/schema/extractionResult.ts lib/schema/extractionResult.test.ts components/extract/UploadPicker.tsx components/extract/UploadPicker.test.tsx`
   — the client stops sending a hash. An in-flight client that still sends one gets a 400 **only**
   if zod is configured to strip unknown keys differently than it is today; it is not — zod
   ignores unknown keys by default, so a stale tab degrades to "no hash", not to a failed upload.

No data migration is involved: this phase writes one nullable column that phase 1 created and
sends notifications. Reverting it changes no existing row and no existing dedup decision.
