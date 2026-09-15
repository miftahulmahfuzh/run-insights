# Package: extract (route handlers)

**Location**: `app/api/extract`
**Last Updated**: 2026-09-15
**Documentation Created**: 2026-09-15

## Overview

`app/api/extract` is the two-route HTTP seam between the runner's browser and the vision
extraction pipeline: `POST /` opens an extraction and hands back a 202 immediately, and
`GET /[id]` is the poll the client walks until that extraction reaches a terminal status. Neither
route contains extraction logic — the model call lives in `lib/llm/runExtractionJob.ts`, the read
shaping in `lib/extract/readExtraction.ts`, and the request/response grammar in
`lib/schema/extractionResult.ts`. What lives *here* is the decision about **what the client is
allowed to wait for**, and everything the routes defer so that it doesn't have to.

The package's whole shape follows from one measured fact recorded in `route.ts`: extraction is a
~33.7 s median against a 60 s Hobby ceiling, and that median excludes the repair round-trip, cold
start and network variance. `fetch → model → Zod → repair → DB write` does not reliably fit inside
one request, so the POST writes two rows, schedules the rest through `after()`, and returns. The
GET exists only because the POST returns before the answer does.

**Key responsibilities:**
- Authenticate, validate and persist an upload batch, then answer `202 { extractionId }` after
  exactly two INSERTs — never after the model.
- Own the `after()` schedule for this invocation: what is deferred, in what order, and under whose
  clock.
- Detect, off the response path, that an uploaded screenshot's bytes already exist somewhere in
  this runner's image collection, and fire the duplicate-image push (R1).
- Serve the poll as a point-in-time, uncacheable, ownership-scoped read, with 404 as the single
  answer to both "not yours" and "does not exist".

## Module Map

| File | Route | Role |
| --- | --- | --- |
| `route.ts` | `POST /api/extract` | Auth → validate → two writes → two `after()` callbacks → 202 |
| `[id]/route.ts` | `GET /api/extract/[id]` | Auth → id shape check → ownership-scoped read → `no-store` JSON |
| `route.test.ts` | — | Refusals, the happy path, and the duplicate-image scan driven directly |
| `[id]/route.test.ts` | — | Refusals, the 404-for-both rule, and the cache header |

## Exported API

### `POST /api/extract`

```ts
export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request): Promise<Response>
```

**Request body**: `ExtractRequestSchema` (`@/lib/schema/extractionResult`) — `{ images:
ExtractionBlobRef[] }`, between `MIN_IMAGES` and `MAX_IMAGES` entries, **no two sharing a `kind`**.
Array order is display order and is the order the model sees.

**Responses**:

| Status | Body | Condition |
| --- | --- | --- |
| `202` | `ExtractAcceptedResponse` = `{ extractionId }` | Accepted; work is deferred |
| `400` | `{ error: 'Invalid JSON body' }` | Body is not JSON |
| `400` | `{ error: 'Invalid request', issues: string[] }` | Schema or duplicate-kind refusal |
| `401` | `unauthorizedJson()` | Signed out — returned before any database work |

A non-auth failure raised by the auth layer is rethrown rather than converted into a 401.

**Side effects, in order**: `createExtraction` (the audit row, opened `pending`) →
`attachExtractionPhotos` (the `run_photos` rows) → `after()` × 2 → response. The id returned is an
**extraction id, never a run id**: no `runs` row exists yet by design, and `run_photos.run_id`
stays NULL until the review commit backfills it.

### `GET /api/extract/[id]`

```ts
export const runtime = 'nodejs'
export async function GET(_request: Request, ctx: RouteContext<'/api/extract/[id]'>): Promise<Response>
```

**Responses**: `200` with an `ExtractionResult` and `Cache-Control: no-store`; `404`
`{ error: 'Not found' }`; `401` when signed out. Default `maxDuration` is correct here — this is
two indexed SELECTs, not the extraction.

## Internal Architecture

### The two `after()` callbacks, and why their order is fixed

`POST` registers exactly two deferred callbacks, and the registration order is load-bearing:

1. **The duplicate-image scan** (`notifyDuplicateShots`, module-private). Registered **first** so a
   notification is never queued behind a ~33.7 s model call.
2. **The extraction job** (`runExtractionJob`). It measures its own soft deadline from
   `invocationStartedAt` — captured at the very top of `POST`, before auth — so if the platform
   runs the callbacks in order the job *sees* the budget the scan consumed rather than overshooting
   it. That is why putting the scan first is safe rather than a gamble.

New deferred work should be appended, not spliced: `route.test.ts` reaches the scan as
`afterMock.mock.calls[0]`, and the same index convention is used by the chat path's sibling test.

### The audit column deliberately drops `contentHash`

`ExtractionBlobRef` carries a `contentHash`, but the `ExtractionBlobUrls` value handed to
`createExtraction` is rebuilt field-by-field **without** it. Two independent reasons, both of which
must hold before that is ever changed:

- `extractions.blob_urls` is the immutable record of *what the model was shown*. A dedup key is not
  part of that record; `run_photos.content_hash` is where it belongs.
- `components/review/RetryExtraction.tsx` re-POSTs those stored rows verbatim. A hash
  round-tripping through them would make every retry of a still-attached extraction match its own
  earlier `run_photos` rows and buzz the runner's phone for a button they pressed on purpose.

### `notifyDuplicateShots(userId, photoIds, images)` — module-private

Asks `findGlobalDuplicatePhoto` **once per distinct hash** in the batch and calls
`notifyDuplicateImagePush` on each hit. Three rules it encodes:

- **Claims without a hash are skipped entirely.** `contentHash === null` means dedup is *inactive*
  for that shot, not broken — no lookup is issued at all.
- **The whole batch is excluded from the lookup, not just the asking row.** One upload submits up
  to three shots; their `kind`s must differ but their bytes need not, so with only the asking row
  excluded two identical shots would each match the other — two pushes for one upload, both
  pointing at a photograph from the same batch. Excluding every id this request inserted makes the
  question the honest one: *already*, meaning before now.
- **Every failure is silent.** A failed lookup or send warns to the console and moves on. The
  photos are committed; nothing in this callback may ever be load-bearing for them.

The zip of `photoIds[index]` against `images[index]` depends on `attachExtractionPhotos` returning
its ids in **input order** — a documented contract at that function, not an accident. An entry
whose id is missing is dropped rather than mismatched.

### Data flow

```
UploadPicker (compress → contentHashOf(compressed.file) → PUT blob)
      │  POST { images: [{ url, pathname, kind, w, h, bytes, contentHash }] }
      ▼
POST /api/extract ── auth ── Zod ── createExtraction ── attachExtractionPhotos ──► 202
      │                                         (contentHash filtered through isValidContentHash)
      ├─ after #1 ─► findGlobalDuplicatePhoto (per distinct hash, batch excluded) ─► push
      └─ after #2 ─► runExtractionJob ─► extractions row reaches a terminal status
                                                    │
GET /api/extract/[id] ◄── useExtractionStatus polls ─┘
```

## Dependencies

### Internal
- `@/lib/auth/requireUserId` — `requireUserIdApi`, `unauthorizedJson`, `UnauthorizedError`; the
  Route Handler flavour that throws rather than redirects. Both routes are its named callers.
- `@/lib/db/queries` — `createExtraction`, `attachExtractionPhotos`.
- `@/lib/schema/extractionResult` — `ExtractRequestSchema`, `ExtractAcceptedResponse`,
  `ExtractionBlobRef`.
- `@/lib/llm/runExtractionJob` — the entire body of the second `after()`.
- `@/lib/photos/globalDuplicate` — `findGlobalDuplicatePhoto`, the cross-table read.
- `@/lib/push/duplicateImage` — `notifyDuplicateImagePush`.
- `@/lib/extract/readExtraction` — `readExtractionResult` (GET only).
- `@/lib/id` — `isValidId` (GET only).
- `@/lib/env` — `LLM_VISION_MODEL`.

### Framework
- `next/server`'s `after()` — runs a callback after the response is sent but still inside this
  invocation, extending its lifetime up to `maxDuration`. Chosen because it needs no queue service
  and no worker. `@vercel/functions`' `waitUntil()` is the documented fallback with the same
  semantics if a future Next.js release changes `after()`'s guarantees.

## Reverse Dependencies

### Primary consumers
- `components/extract/UploadPicker.tsx` — the upload flow: compress → hash the compressed bytes →
  PUT → `POST /api/extract` → push `/x/[extractionId]`.
- `components/extract/useExtractionStatus.ts` — polls `GET /api/extract/[id]` with
  `cache: 'no-store'` until `isTerminal(status)`.

### Secondary consumers
- `components/review/RetryExtraction.tsx` — re-POSTs `extractions.blob_urls` verbatim. **The
  reason these rows must not carry a hash** (see above).

## Error Handling

No custom error types. The routes catch exactly three things and let everything else propagate:

- `UnauthorizedError` from the auth layer → `unauthorizedJson()`. Any other error from that layer
  is rethrown deliberately, so an auth outage is a 500 rather than a silent sign-out.
- `request.json()` rejection → `400 Invalid JSON body`.
- Anything thrown inside the duplicate-scan callback → `console.warn`, swallowed. There is nothing
  to retry against and nobody left to tell; the response was sent and the rows are committed.

The extraction job's own failures are not handled here — it records them on the `extractions` row
and the poll surfaces them as `status: 'failed'` plus an `errorCode`.

## Concurrency

Both handlers are plain `async` request handlers with no module-level mutable state and are safe
under any number of concurrent invocations.

The one ordering assumption is inside a single invocation: the two `after()` callbacks share this
request's remaining budget with each other. The duplicate scan is `await`ed sequentially per
distinct hash rather than fanned out — the batch is at most three shots, and serial keeps the
warning output attributable.

Concurrent uploads of the same bytes are handled by the exclusion set, not by a lock: each request
excludes only its own inserted ids, so a genuine race between two uploads resolves as one of them
seeing the other's committed row and announcing it. That is the intended outcome.

## Performance

Response-path cost is fixed and small: two INSERTs. Everything expensive — the blob fetches, the
vision call, the repair round-trip, the cross-table dedup read and the web-push fan-out — is inside
`after()` and cannot delay the 202.

`maxDuration = 60` is a **literal, not an imported constant**. Segment config exports are
statically analysed at build time and an imported constant is not a value the analyser can see:
`next build` rejects the whole route with "Invalid segment configuration export detected" — the
same trap `proxy.ts`'s matcher documents. `lib/extract/constants.ts` keeps the shared copy for the
job's budget arithmetic, and `tests/extract.pollSchedule.test.ts` asserts the two agree.

The ~33.7 s median extraction figure quoted in `route.ts` and above is a **measurement from the
original scoring run, not a live metric**; re-measure before treating it as current.

## Usage

### Gotchas

- **Adding a field to `ExtractionBlobRef` does not add it to the audit column.** `POST` rebuilds
  `auditImages` explicitly. That is deliberate, and a new field must make its own case for which
  side of the line it belongs on.
- **Do not insert an `after()` callback ahead of the duplicate scan.** Tests index the callbacks
  positionally, and the job's deadline arithmetic assumes it runs last.
- **`attachExtractionPhotos` is the insert door for `content_hash`.** A claim that is not 64
  lowercase hex is written as NULL there, not rejected. The route never validates the hash a second
  time and must not start: an unhashable or untrusted shot must still upload.
- **`contentHash` is a claim, in the same trust class as `width`/`height`/`bytes`.** It is
  format-checked, never signature-checked; `/api/upload`'s token payload is deliberately untouched.
- **404 covers both "missing" and "not yours" on the GET.** Ownership is baked into
  `readExtractionResult`'s query. Do not add a 403 — it would let a stranger learn which ids exist.
- **The poll must stay `no-store`.** Any cache in front of it, the browser's included, would serve
  `pending` after the job finished.

## Notes

### Documentation created: 2026-09-15

Written after **P1-EXT-R9WD** (phase 3 of 4 of `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`, "Wire runner-side
upload routes"), which added the duplicate-image push to this route. What that task changed here:

- `POST` now registers a **second `after()` callback ahead of the job's**, running
  `notifyDuplicateShots` — one `findGlobalDuplicatePhoto` per distinct hash, the whole inserted
  batch excluded, `notifyDuplicateImagePush` on a hit, every failure swallowed.
- The audit-column rebuild that drops `contentHash` was added at the same time, and its two
  justifications (the immutability of `blob_urls`, and `RetryExtraction`'s verbatim re-POST) are
  the reason the field is threaded to `attachExtractionPhotos` but not to `createExtraction`.
- Upstream of the route, `UploadPicker` began hashing the **compressed** bytes it PUTs, and
  `ExtractionBlobRefSchema` gained the nullable, default-`null` `contentHash` — nullable
  specifically so older clients and `RetryExtraction`'s stored rows stay valid.

No existing dedup decision logic was changed by that task. The chat-side half of the same phase
lives in `lib/nina/actions/send.ts`, which reports the duplicate judgement it already makes and
additionally asks the cross-table lookup about claims it decided were genuinely new — both drained
in one `after()` task registered **last**, so no existing deferred-task index moved. As of this
writing `lib/nina`'s readme does not yet cover that half.
