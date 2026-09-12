# Package: the photo/extract upload pipeline (`lib/extract` · `lib/photos` · `components/extract`)

**Locations**: `lib/extract` (this file's owner), `lib/photos`, `components/extract`
**Last Updated**: 2026-09-12 — initial creation. Every constant, signature, consumer and route
below was re-read from the tree at commit `6759f26` on this date; the reverse-dependency counts
are measured, not remembered, and carry the same stamp.
**Documentation Created**: 2026-09-12 (token-maxxing session `pkg-readme-extract-photos`)

## Why one map for three packages

These three directories are one user-facing path — pick 1–3 Apple Fitness screenshots, have them
read into a run — that no single directory owns. `components/extract` is what the runner taps;
`lib/photos` turns each pick into the exact bytes the vision model was scored on; `lib/extract`
is the dependency-free vocabulary the whole path speaks (screens kinds, the measured recipe, the
time budgets) plus the server-side read that publishes the result. A reader opening any one of
the three alone is missing the contract that makes the other two correct, so the map lives in
one file.

`lib/extract` hosts it because it is the hub: every other file in the map imports something from
it, and the repo's convention is one `package_readme.md` per package directory
(`<pkg>/.workflows/package_readme.md`). `lib/photos` and `components/extract` deliberately have
no readme of their own — two maps of one pipeline would drift. Per-package READMEs that already
cover adjacent ground: `.workflows/package_readme.md` (application root, the shell contract),
`lib/nina/.workflows/package_readme.md`, `lib/db/.workflows/package_readme.md`.

One honest caveat: **`lib/photos` is shared.** Half of it serves this pipeline
(`compressForExtraction`, `resizeTarget`), and half serves other photo paths that merely live in
the same folder — Nina chat photos (`compressForNina`, `contentHash`) and the swipeable photo
overlay with its save button (`gallery`, `save`, consumed by `components/ui`). Section
*The second family* makes that split explicit, because assuming `lib/photos` means
"extraction photos" is the map's first trap.

## Overview

The pipeline reads running screenshots into structured data. The runner picks 1–3 screenshots on
`/upload`; each is compressed **in the browser** to a measured recipe (JPEG q80, short edge
560 px — the variant that scored 108/108 on the extraction benchmark); each PUT lands directly in
Vercel Blob through a short-lived signed token (the server route never sees image bytes); a
"Read this run" tap creates the extraction row and returns `202 { extractionId }` immediately;
the vision call runs in the same invocation's `after()`; the client polls a read-only endpoint
until a terminal status; and `/x/[extractionId]` hands the server-resolved result to the review
screen. The whole path is designed around one number: the extraction's **33.7 s measured median
against Vercel Hobby's 60 s function ceiling**.

**Key responsibilities, by package:**

- `lib/extract` — the shared vocabulary and the read side. Every tunable the pipeline argues
  about (`constants.ts`, pure and import-free on purpose); the pick planner and kind-swap logic
  as pure functions (`planPicked.ts`, `reassignKind.ts`, `rejectionReason.ts`); and the single
  read `readExtractionResult` that both the poll endpoint and the `/x/…` server render use, with
  the lazy stale-pending self-heal inside it (`readExtraction.ts`).
- `lib/photos` — bytes and gestures. Browser-side compression for both photo pipelines
  (`compressForExtraction`, `compressForNina`), the short-edge arithmetic the compressors exist
  to get right (`resizeTarget`), the three-host sha-256 every dedup layer agrees on
  (`contentHash`), and the pure decisions of the photo overlay and its save button (`gallery`,
  `save`).
- `components/extract` — the two client screens. The picker with its per-tile compress-and-upload
  state machine (`UploadPicker`), the poll hook with its backoff schedule and give-up
  (`useExtractionStatus`), the honest progress screen (`ExtractingSkeleton`), the pending→terminal
  hand-off (`ExtractionGate`), and the per-tile kind control (`KindSelector`).

## The standing map: one upload, end to end

```
 /upload (app/upload/page.tsx)
   │
   ▼
 UploadPicker.onPick ──► planPicked() ──► rejectionReason()        lib/extract (pure)
   │  room, rejections, kind defaults; ONE message; no side effects
   ▼
 per tile: compressForExtraction() ──► longEdgeTargetFor()         lib/photos
   │  JPEG q80, SHORT edge 560 (web worker, EXIF stripped)
   ▼
 upload() @vercel/blob/client ──► POST /api/upload (token mint)    app/api/upload/route.ts
   │  NEVER carries bytes: getUserId() → SHOT_REQUEST_PATHNAME_RE
   │  → kind parsed → signed token (10 min) → browser PUTs to Blob
   ▼
 tile ready (blob ref: url, pathname, kind, w, h, bytes)
   │
   ▼  "Read this run"
 POST /api/extract ──► ExtractRequestSchema (1–3, distinct kinds)  app/api/extract/route.ts
   │  createExtraction + attachExtractionPhotos → 202 {extractionId}
   ▼
 after(): runExtractionJob()                                       lib/llm (neighbour)
   │  fetch blobs back as data URIs → ONE vision call → Zod
   │  → (optional text-only repair) → terminal extractions row
   ▼
 /x/[extractionId] (server render) ──► readExtractionResult()      lib/extract
   │  pending? → ExtractionGate                                    components/extract
   │                 └─ useExtractionStatus: poll 2s/3s/5s
   │                    GET /api/extract/[id] → readExtractionResult()
   │                    + stale self-heal (flip → failed/stale_timeout)
   │                 └─ ExtractingSkeleton: elapsed, no fake progress
   │  terminal? → router.refresh() → ReviewScreen (F05, out of scope)
   ▼
 committed run at /r/[id]
```

Steps, with the seams spelled out:

1. **Pick.** `UploadPicker.onPick` (`components/extract/UploadPicker.tsx`) reads the file input,
   clears `event.target.value` so re-picking the same file fires again, and hands the pure
   decision to `planPicked` (`lib/extract/planPicked.ts`): room against `MAX_IMAGES` (3),
   per-file rejection copy from `rejectionReason` (`lib/extract/rejectionReason.ts`), and a
   default kind per pick order from `DEFAULT_KIND_BY_INDEX` (heartrate → splits → summary — the
   order the device hands files over, F29), skipping kinds already claimed. Rejections do not
   abort a batch: a good screenshot plus a 40 MB one adds the good one and explains the other.
2. **Tile mint.** The picker — not the planner — mints `id` (`newId()`), `gen` (0) and a
   `previewUrl` (`URL.createObjectURL`, revoked on unmount). The planner stays pure; this split
   is what makes the pick logic unit-testable under `environment: 'node'`.
3. **Compress.** Per tile, immediately (not on submit): `compressForExtraction`
   (`lib/photos/compressForExtraction.ts`) decodes once for real dimensions, computes the long
   edge that lands the **short** edge on `TARGET_SHORT_EDGE_PX` via `longEdgeTargetFor`
   (`lib/photos/resizeTarget.ts`), and runs `browser-image-compression` in a web worker at
   `TARGET_QUALITY` (0.8), `maxIteration: 1`, EXIF stripped, output always JPEG. A source that
   will not decode (HEIC picked from Files) throws the one message that names the fix.
4. **Token mint + PUT.** `upload()` from `@vercel/blob/client` calls `POST /api/upload`
   (`app/api/upload/route.ts`) to mint a signed token. The route authenticates (`getUserId()` —
   the only boundary, because `proxy.ts` deliberately does not match `/api/*`), pins the pathname
   to `SHOT_REQUEST_PATHNAME_RE` (`^shots/[A-Za-z0-9_-]{12,24}\.jpg$` — the path-traversal
   defence), parses `clientPayload`'s `kind`, and bakes `{ userId, kind }` into the signed token.
   The browser then PUTs the bytes straight to Blob (10-minute token, 600 KB ceiling, JPEG only,
   `addRandomSuffix: true`, `allowOverwrite: false`, 1-year cache). **The route never receives
   image bytes.** The same route's other branch serves Nina chat photos, discriminated by
   pathname (`isNinaChatRequestPathname`), which binds the path to the authenticated user.
5. **Submit.** "Read this run" is enabled only when every tile is `ready` with a blob ref. It
   POSTs the blob refs to `/api/extract`, where `ExtractRequestSchema`
   (`lib/schema/extractionResult.ts` — a neighbour, but the wire contract is part of this
   pipeline) enforces 1–3 images, **no duplicate kinds**, an absolute
   `*.public.blob.vercel-storage.com` URL (SSRF guard), and the **stored** pathname pattern
   (`SHOT_STORED_PATHNAME_RE` — Vercel's random suffix is part of the echoed pathname).
6. **Accept.** The route writes the `extractions` row (`pending`) and attaches `run_photos`,
   schedules `runExtractionJob` in `after()`, and returns `202 { extractionId }`. The client
   pushes `/x/[extractionId]`.
7. **The job.** `runExtractionJob` (`lib/llm/runExtractionJob.ts` — interface only here) fetches
   each blob back as a base64 data URI, makes ONE vision call carrying all images, validates the
   session with Zod, optionally runs a text-only repair, and always writes a terminal
   `ok` / `repaired` / `failed` row. Its budget arithmetic (`JOB_DEADLINE_MS` 55 s,
   `PRIMARY_TIMEOUT_MS` 45 s, `REPAIR_TIMEOUT_MS` 36 s, `MIN_REPAIR_BUDGET_MS` 28 s) lives in
   `lib/extract/constants.ts` and is documented there, including what it honestly implies on
   Hobby: the repair is best-effort and usually skipped.
8. **Wait.** `/x/[extractionId]` renders server-side. `pending` → `ExtractionGate`
   (`components/extract/ExtractionGate.tsx`) mounts `useExtractionStatus`
   (`components/extract/useExtractionStatus.ts`): poll `GET /api/extract/[id]` at 2 s, 3 s from
   the 4th attempt, 5 s from the 10th (`pollDelayFor`); a single failed poll is transport noise,
   not a failed extraction; after `STALE_PENDING_MS` (90 s) the hook gives up with a
   "check again / start over" affordance. `ExtractingSkeleton` shows only true things: one pass,
   the measured ~35 s median, a live elapsed count anchored to the row's `createdAt`, and the
   screenshots as participants — no per-image states, no percentages (R-41).
9. **The self-heal.** Every read goes through `readExtractionResult`
   (`lib/extract/readExtraction.ts`). A `pending` row older than `STALE_PENDING_MS` is flipped to
   `failed` / `stale_timeout` on that read (`failStalePendingExtractions`) — lazy, pull-based,
   no cron — because `after()` has no resume: an invocation killed at the wall or by a deploy
   leaves `pending` forever, and ~17 runs a month cannot justify a queue. The poll that gives up
   client-side is the same threshold that closes the row server-side, on purpose.
10. **Hand-off.** On terminal status the hook stops, `ExtractionGate` calls `router.refresh()`
    exactly once, and the server re-render takes the review branch (`ReviewScreen`, F05 — a
    neighbour). `failed` renders the same review screen with a blank form; there is no second
    manual-entry UI, and the screen stays keyed to the extraction so `runs.extraction_id`
    records that the pipeline broke here.

## The standing rules of the pipeline

1. **`constants.ts` imports NOTHING.** No `server-only`, no `lib/env`, no value import of any
   kind. It is read by the browser compressor, a `'use client'` picker, Route Handlers, the
   background job, the prompt builder and the unit suite alike; one import from `lib/env` breaks
   the client half of the build. Anything shared with the Nina path lives there too
   (`COMPRESSION_LIB_URL`), not in `lib/nina/images.ts`, when the client compressor needs it.
2. **The recipe is a measurement, not a preference.** 560 px SHORT edge / JPEG q80 scored 108/108
   five times (`research/downscale.mjs`); `MAX_IMAGES = 3` because a fourth was never scored;
   `maxIteration: 1` because an iterative byte-budget search could silently settle on a quality
   nobody measured. Re-tuning any of these without re-scoring is a silent accuracy regression.
3. **The short-edge trap is the bug the image layer exists around.**
   `browser-image-compression`'s `maxWidthOrHeight` clamps the LONG edge; portrait screenshots
   (739×1600 fixture) passed 560 directly come out ~259 px wide — outside the measured envelope,
   no error anywhere. `longEdgeTargetFor` computes the long-edge value that lands the short edge
   on target, never upscales, and is symmetric in orientation. The two compressors share it and
   are otherwise deliberately NOT parameterised into one (see rule 12).
4. **Kinds are declared by the runner, never inferred.** Not by the model, not from pixels
   (plan §5.3). `KindSelector` renders all three kinds live on every tile; distinctness is kept
   by **swapping, never subtracting** — `reassignKind` hands the displaced kind to whoever held
   the new one, so a full three-screen upload never freezes, and `KINDS_MATCH_SLOTS`
   (`MAX_IMAGES === SCREEN_KINDS.length`) is exported so the suite can pin the equality the
   design rests on. The server re-enforces distinctness in `ExtractRequestSchema`.
5. **The kind is baked into the signed upload token, so changing a kind re-compresses and
   re-PUTs from the original bytes.** `changeKind` bumps the tile's `gen`, clears its blob, and
   restarts `process` for exactly the ids `reassignKind` reports in `changed` — both tiles of a
   swap or neither (a tile must never sit in `compressing` with no upload running). An
   already-uploaded blob cannot be relabelled. The token's `kind` is read by nothing *today*
   (`onUploadCompleted` is inert under R-1); relabelling in place would be a trap for whoever
   makes that webhook a writer.
6. **No side effect may run inside a state updater.** Strict Mode double-invokes updaters in dev;
   the F04 original minted two tokens and two blobs per pick (one orphaned — measured, card #6).
   Hence: pure decisions in `lib/extract` (`planPicked`), `setTiles` always handed a value not an
   updater, effects run after, plus a `(tile, gen)` `started` set as a second line of defence.
   The guard's `catch` **deletes** the key so a failed attempt stays retryable; a success is not
   repeatable.
7. **A superseded upload's result is dropped, not clobbered in.** `patchIfCurrent` writes only
   when the tile's `gen` still matches, compared *inside* the updater against the state React is
   about to reduce over. The dropped upload's bytes sit unreferenced in Blob — the same fate as
   the blob a kind change abandons; there is no reaper for these, by the same ~17-runs-a-month
   arithmetic that forbids a queue.
8. **`/api/upload` never receives bytes, and `getUserId()` is the whole boundary.** A Vercel
   Function rejects ~4.5 MB bodies; relaying bills wall-clock for nothing; only a direct PUT can
   report honest progress. `proxy.ts` deliberately skips `/api/*` (a 307 to HTML is a terrible
   answer to `fetch()`), so the route's own auth check is all there is. Terse error messages
   echo nothing a probe could learn from.
9. **The wire contract validates what Vercel STORED, not what was asked for.** `addRandomSuffix`
   rewrites the pathname, so the client echoes `pathname` matching `SHOT_STORED_PATHNAME_RE`
   (requested: `SHOT_REQUEST_PATHNAME_RE` — the two are different regexes on purpose). `url`
   must be absolute and on this project's Blob host — it is fetched server-side by the job, so
   an attacker-supplied URL would be an SSRF primitive.
10. **The read side never re-parses vendor output.** `readExtractionResult` returns the session
    stored pre-validated in `extractions.raw_response.parsedSession` (for `ok`/`repaired` only).
    A pure read cannot disagree with what was written at completion time — "the numbers changed
    while I was looking at them" is the one thing this pipeline may never do.
11. **One JSON poll, not a stream.** The result is one object delivered once; R-41 forbids
    fabricated per-image progress, and SSE would poll the database internally anyway (the work
    runs in a different invocation's `after()`). Polling also survives closing the tab. Poll
    transport failures are shown quietly as "still working"; only the 90 s rule ends the wait.
12. **Siblings, not abstractions.** `compressForNina` duplicates ~15 lines of library call rather
    than parameterising `compressForExtraction`, because that module reproduces a measured
    recipe and an options bag would make it possible to run extraction at a recipe nobody
    scored. They share exactly one thing worth sharing: `longEdgeTargetFor`, where the actual
    bug lives. `maxIteration` differs on purpose (Nina has no scored recipe but does have a byte
    ceiling iteration exists for).
13. **EXIF is stripped, for reasons stated where it matters.** Extraction: these blobs sit on an
    unauthenticated `/s/[token]` page, so strip on principle. Nina: phone photos carry GPS and
    sit on a public CDN URL — stripping is the point, not a principle.
14. **Segment `maxDuration` values are literals.** `export const maxDuration = 60` is
    statically analysed at build time; an imported constant is invisible to the analyser and
    `next build` rejects the route. `tests/extract.pollSchedule.test.ts` asserts the literal
    agrees with `FUNCTION_MAX_DURATION_S` so the two cannot drift.
15. **Ownership is inside the read, and it answers 404, not 403.** `getExtraction` filters on
    `user_id`; guessing another user's id is indistinguishable from a nonexistent one, so neither
    the poll nor the page can be used to learn which ids exist.

## The second family: what `lib/photos` also serves

`lib/photos` is named for photos, not for extraction. Four of its six modules serve other paths
and are documented here because they share the package:

| Module | Serves | One-line contract |
|---|---|---|
| `compressForExtraction.ts` | **This pipeline** | One screenshot → the exact measured recipe. Throws on undecodable sources and on >`MAX_UPLOAD_BYTES` after compression. |
| `resizeTarget.ts` | **This pipeline** + admin thumbnails + Nina | `longEdgeTargetFor` — the short-edge arithmetic (rule 3). Pure, zero imports. |
| `contentHash.ts` | Nina chat photos, admin uploads, backfill scripts | `contentHashOf` — sha-256 over bytes **exactly as stored**, 64 lowercase hex, via `crypto.subtle` so the browser, the server and strip-types scripts compute identical answers. `isValidContentHash` gates client *claims*: a claim that fails the `[0-9a-f]{64}` check is stored as NULL — dedup silently inactive for that row — never a send error, and never rewritten into shape. |
| `compressForNina.ts` | Nina chat (`components/nina/Composer.tsx`) | The sibling compressor (rule 12): `createImageBitmap` fast path with an `<img>` Safari fallback, Nina's own 768 px/q75 recipe from `lib/nina/images.ts`, iteration left at the library default. |
| `gallery.ts` | `components/ui/PhotoViewer.tsx` (all photo overlays) | `stepIndex` (double-modulo wrap — `%` keeps the dividend's sign, so a backwards swipe off the first photo must normalise) and `decideSwipe` (the three rules that keep native pinch-zoom alive: multi-touch, zoom >1+ε, horizontally pannable image — then 48 px travel at 1.2× dominance over vertical). |
| `save.ts` | `components/ui/useSavePhoto.ts` | `chooseSaveStrategy` — gated on `(pointer: coarse)`, never on a browser name: touch+canShareFiles → `share` (iOS Save Image lands in Photos), everything else → `download` (fetch → `blob:` URL → synthetic anchor; `<a download>` is ignored cross-origin, which is why the strategy is chosen at all). `saveFilenameFor` derives a collision-proof name from the blob's own last path segment; never throws. |

`gallery.ts` and `save.ts` exist as separate modules for the reason the whole repo extracts pure
logic: `vitest` runs `environment: 'node'` and there is no `TouchEvent`, no share sheet and no
download bar — the impure halves stay in the components, and everything decidable without a
browser is decided here, where it can be proved.

## Exported API

### `lib/extract/constants.ts` — the vocabulary (types + every tunable)

Types: `ScreenKind` (`'summary' | 'splits' | 'heartrate'`), `ExtractionErrorCode`
(`'token_floor' | 'transport' | 'timeout' | 'validation' | 'stale_timeout'`).

| Symbol | Value / shape | Why it is what it is |
|---|---|---|
| `SCREEN_KINDS` | `['summary','splits','heartrate']` | The kinds extraction understands. `run_photos.kind` also allows `'other'` (roadmap); F04 never produces it. |
| `SCREEN_KIND_LABEL` | Record → `'Summary' / 'Splits' / 'Heart rate'` | One place, so prompt, picker and review strip cannot drift. |
| `DEFAULT_KIND_BY_INDEX` | `['heartrate','splits','summary']` `satisfies` | Default by PICK order (the device's order, F29). **Deliberately a literal, not an alias of `SCREEN_KINDS`** — re-aliasing restores the Fitness-app-order defect. |
| `MAX_IMAGES` / `MIN_IMAGES` | 3 / 1 | The measured envelope; a fourth image was never scored. |
| `TARGET_SHORT_EDGE_PX` / `TARGET_QUALITY` | 560 / 0.8 | MEASURED — the scored recipe. Input tokens track pixels, not bytes; only the resize saves money. |
| `TARGET_MAX_MB` / `COMPRESSION_MAX_ITERATION` | 0.5 / 1 | Ceiling, not target; one pass, protecting the scored recipe. |
| `COMPRESSION_LIB_URL` | `'/vendor/browser-image-compression.js'` | Self-hosted (`scripts/copy-image-compression-worker.mjs`); the library default is a third-party CDN on every upload's hot path. |
| `MAX_SOURCE_BYTES` / `MAX_UPLOAD_BYTES` | 25 MB / 600 000 | Reject before decode / server ceiling ≈10× the expected 55–60 KB, so "upload the raw original" fails loudly at token-mint. |
| `UPLOAD_CONTENT_TYPE` / `ALLOWED_UPLOAD_CONTENT_TYPES` | `image/jpeg` / `['image/jpeg']` | Compression always outputs JPEG; exactly one type through. |
| `SHOT_PREFIX` | `'shots/'` | Blob prefix for run screenshots. |
| `SHOT_REQUEST_PATHNAME_RE` / `SHOT_STORED_PATHNAME_RE` | `^shots/[A-Za-z0-9_-]{12,24}\.jpg$` / `…-[A-Za-z0-9_-]{16,64}\.jpg$` | Asked-for vs stored (random suffix). The store regex is deliberately loose about the suffix length — its job is prefix and alphabet, not a Vercel internal. |
| `BLOB_CACHE_MAX_AGE` | 1 year | Blobs are immutable (random suffix). |
| `UPLOAD_TOKEN_TTL_MS` | 10 min | Client upload tokens are short-lived. |
| `FUNCTION_MAX_DURATION_S` | 60 | The honest Hobby ceiling; the routes repeat it as a literal (rule 14). |
| `JOB_DEADLINE_MS` / `PRIMARY_TIMEOUT_MS` | 55 000 / 45 000 | Soft deadline 5 s under the wall, so the job always writes a terminal row. Primary covers the measured tail without eating the budget. |
| `REPAIR_TIMEOUT_MS` / `MIN_REPAIR_BUDGET_MS` | 36 000 / 28 000 | The repair re-emits ~1,070 completion tokens at ~26–33 ms each — measured; "cheap in tokens is not cheap in wall-clock". Below 28 s remaining, no repair starts: a round-trip that cannot finish risks the invocation dying before a terminal row, strictly worse than failing cleanly. On Hobby the primary's median leaves less than that — the repair is **usually skipped by design**, and `constants.ts` says so in full. |
| `POLL_INTERVALS_MS` / `POLL_MID_AFTER_ATTEMPTS` / `POLL_LATE_AFTER_ATTEMPTS` | `{2s, 3s, 5s}` / 4 / 10 | Measured-derived backoff around the 33.7 s median. |
| `STALE_PENDING_MS` | 90 000 | Client give-up AND server self-heal threshold — the same number on purpose (rule 9 of the map): the poll that gives up is the one that closes the row. |
| `EXTRACTION_ERROR_CODES` | the five codes | What F04 writes; F05 branches on these; runner-facing copy in `EXTRACTION_ERROR_COPY` (`lib/schema/extractionResult.ts`). |
| `TYPICAL_EXTRACTION_SECONDS` | 35 | Elapsed-time copy, stated as "about"; `ExtractingSkeleton` flags "running long" past 1.6×. |

### `lib/extract/planPicked.ts`

```ts
planPicked(existing: readonly KindHolder[], picked: readonly File[]):
  { accepted: Array<{ file: File; kind: ScreenKind }>; error: string | null }
```

The pick decision as a total function: room, rejections, kind defaults, and **the one message**
(`error` is `string | null`, never an array — last message wins, which is what lets the caller
write `setFormError(plan.error)` unconditionally; `null` clears). Mints nothing random and
touches no browser API, so every branch is deterministic with no test doubles. `KindHolder` here
is `{ kind }` only — structurally, and deliberately, the minimum.

### `lib/extract/reassignKind.ts`

```ts
reassignKind<T extends { id: string; kind: ScreenKind }>(
  entries: readonly T[], targetId: string, next: ScreenKind,
): { entries: T[]; changed: readonly string[] }
```

Swap, not subtract (rule 4). `changed` is the load-bearing half: one id (free kind), two (swap),
or none (no-op) — it is exactly the set the picker must re-compress and re-PUT. Never mutates
input; never returns duplicate kinds. The holder lookup is a `find` not a filter, because
distinctness is maintained by construction (a second holder cannot exist; a loop would be dead
code pretending to be a safety net). `KINDS_MATCH_SLOTS` is exported for the suite to pin the
equality that makes the design possible. Note the **two distinct `KindHolder` interfaces** (this
file's adds `id`); they are structural, not shared, on purpose.

### `lib/extract/rejectionReason.ts`

```ts
rejectionReason(file: File): string | null
```

Worth decoding at all? Not-an-image, empty, or >`MAX_SOURCE_BYTES` → runner-facing copy (quoted
verbatim in its test — a silent rewording is a product change); otherwise `null`. Lives in
`lib/extract`, not beside the compressor it guards, so `planPicked` can use it without pulling a
`'use client'` module into a node test.

### `lib/extract/readExtraction.ts`

```ts
isStalePending(status: ExtractionStatus, createdAt: Date, now?: number): boolean
readExtractionResult(userId: string, extractionId: string): Promise<ExtractionResult | null>
```

`server-only`. The one read behind both `GET /api/extract/[id]` and the `/x/…` server render, so
page and poll cannot disagree about what a status means. Publishes `ExtractionResult`
(`lib/schema/extractionResult.ts`) with `photos` guaranteed ordered by `sort_order` — load-bearing
for R-45's provenance fallback on 1–2-screenshot runs. The self-heal flips ALL stale pending rows
for the user, then reports honestly only if this id was among them. Type-only import from
`lib/llm/runExtractionJob` (`RawResponseColumn`) — no runtime dependency on the job.

### `lib/photos` — signatures

```ts
// contentHash.ts — imports NOTHING (strip-types script host)
contentHashOf(input: Blob | ArrayBuffer | Uint8Array): Promise<string>   // 64 lowercase hex
isValidContentHash(value: unknown): value is string

// resizeTarget.ts — pure, zero imports
longEdgeTargetFor(width: number, height: number, shortEdgeTarget: number): number  // throws on implausible dims; never upscales

// compressForExtraction.ts / compressForNina.ts — 'use client'
compressForExtraction(file: File): Promise<{ file: File; width; height; compressedBytes }>
compressForNina(file: File): Promise<{ file: File; width; height; compressedBytes }>

// gallery.ts — pure
stepIndex(current: number, delta: number, count: number): number
decideSwipe(gesture: SwipeGesture): 'next' | 'prev' | 'none'
SWIPE_MIN_DISTANCE = 48; SWIPE_DOMINANCE = 1.2
// SwipeGesture: { dx, dy, touches (MAX seen), canPanHorizontally, zoomScale }

// save.ts — pure
chooseSaveStrategy(env: { canShareFiles: boolean; coarsePointer: boolean }): 'share' | 'download'
saveFilenameFor(url: string, prefix: string): string
```

`'open'` is a runtime fallback inside the save component (bytes never arrived / sheet refused),
named in `save.ts`'s strategy type so the ladder stays one type — never a return value of
`chooseSaveStrategy`. `contentHashOf` hashes the view, never `view.buffer` (a pooled Node Buffer
would hash unrelated heap); `isValidContentHash` is lowercase-only on purpose — a failed claim
is stored as NULL, not rewritten.

### `components/extract` — the client surface

| Export | Kind | Contract |
|---|---|---|
| `UploadPicker` | component (`'use client'`) | The whole `/upload` picker. Owns the per-tile state machine (`compressing → uploading → ready \| error`), `filesRef` (originals out of state, so a kind change can re-run from them), the `(id:gen)` `started` guard, `patchIfCurrent`, preview-URL cleanup on unmount. Compression starts on pick, not on submit. |
| `KindSelector` | component | Segmented radiogroup, three live options, nothing dimmed (rule 4). Knows nothing of its neighbours — distinctness lives in `reassignKind` + the server schema. |
| `useExtractionStatus` | hook | The poll. Requires the server render's `initial` (a reload lands right, and `createdAt` anchors the elapsed counter — a `Date.now()` origin in render is impure and jumps). Returns `{ result, pollError, gaveUp, elapsedSec, refresh }`. |
| `pollDelayFor(attempts)` | fn | The backoff schedule as a pure function (2 s → 3 s @4 → 5 s @10). |
| `ExtractingSkeleton` | component | The honest progress screen (R-41): one-pass truth, ~35 s median, live elapsed, participants not sequence; `gaveUp` → "Check again" / "Start over". |
| `ExtractionGate` | component | Pending-only mount. On terminal → `router.refresh()` once (ref-guarded) and holds "Opening the numbers…" until the server re-render takes over. |

## Dependencies

**External:** `browser-image-compression` (both compressors; self-hosted worker file),
`@vercel/blob/client` (`UploadPicker`'s `upload`, the route's `handleUpload`),
`zod` (the wire schemas in `lib/schema`), `next/navigation` (router push/refresh).
**Internal (inbound):** `lib/extract` ← nothing but its own tests; `lib/photos/compressForNina`
→ `lib/nina/images` (the Nina recipe constants); `lib/extract/readExtraction` → `lib/db/queries`
(`getExtraction`, `listExtractionPhotos`, `failStalePendingExtractions`) and type-only →
`lib/llm/runExtractionJob`. **Internal (outbound, the neighbours this map deliberately does not
own):** `lib/llm` (the job, the prompt, the vision call), `lib/db` (the rows), `lib/schema`
(the wire DTO + error copy), `lib/review/loadReview` (the review branch).

## Reverse dependencies — measured 2026-09-12 at `6759f26`

**`lib/extract` (29 importing files, all via `@/lib/extract/…` submodule paths — no barrel, and
constants is the workhorse):**

- Pipeline core: `components/extract/*` (4 files — labels, kinds, planPicked, reassignKind, poll
  constants), `app/api/upload/route.ts` (pathname regex, ceilings, TTL), `app/api/extract/route.ts`
  (schema constants), `app/api/extract/[id]/route.ts` + `app/x/[extractionId]/page.tsx`
  (`readExtractionResult`), `lib/photos/compressForExtraction.ts` (the recipe),
  `lib/schema/extractionResult.ts` + `lib/schema/extractedSession.ts` (kinds, MAX/MIN, stored
  regex, error-code type), `lib/llm/extract.ts` (time budgets), `lib/llm/runExtractionJob.ts`
  (`JOB_DEADLINE_MS`, `UPLOAD_CONTENT_TYPE`), `lib/llm/prompts/extraction.ts` (`SCREEN_KINDS`),
  `lib/llm/vision.ts` (`ScreenKind` type).
- Review/share surface: `components/review/ScreenshotStrip.tsx`,
  `components/share/PhotoInclusionList.tsx`, `components/ui/PhotoViewer.tsx`
  (`SCREEN_KIND_LABEL`), `lib/share/rotateBlobs.ts` (`SHOT_PREFIX`, `BLOB_CACHE_MAX_AGE`,
  `UPLOAD_CONTENT_TYPE` — the share feature's blob rotation).
- Tests: `tests/extract.{planPicked,reassignKind,pollSchedule,readExtraction}.test.ts`,
  `tests/live/vision.live.test.ts`, `app/api/upload/route.test.ts`,
  `app/api/extract/[id]/route.test.ts`, `lib/llm/extract.test.ts`,
  `lib/photos/resizeTarget.test.ts`, `lib/schema/extractionResult.test.ts`.

**`lib/photos` (11 importing files):**

- This pipeline: `components/extract/UploadPicker.tsx` (`compressForExtraction`).
- Nina family: `components/nina/Composer.tsx` (`compressForNina`, `contentHashOf`),
  `lib/nina/imagerun.ts` (`contentHashOf`), `lib/nina/dedupe.ts` + `lib/nina/queries.ts` +
  `lib/admin/chatPhotoActions.ts` (`isValidContentHash`), `components/admin/explorer/chatPhotoUpload.ts`
  (`contentHashOf`).
- UI family: `components/ui/PhotoViewer.tsx` (`stepIndex`, `decideSwipe`),
  `components/ui/useSavePhoto.ts` (`chooseSaveStrategy`, `saveFilenameFor`),
  `components/admin/explorer/thumbnail.ts` (`longEdgeTargetFor`).
- Strip-types scripts, by RELATIVE path (they cannot build an import graph):
  `scripts/nina-image-worker.ts` imports `contentHashOf` from `../lib/photos/contentHash.ts`.
  `scripts/shipped-image-recipe.py` re-implements `longEdgeTargetFor` as literals rather than
  importing (a Python host cannot import TS — the mirror is documented at both ends).
- Tests: `lib/photos/{contentHash,gallery,resizeTarget,save}.test.ts` (co-located),
  `tests/nina.dedupeMedia.test.ts`, `tests/ui.photoViewer.test.ts`.

**`components/extract` (2 importers):** `app/upload/page.tsx` (`UploadPicker`) and
`app/x/[extractionId]/page.tsx` (`ExtractionGate`). Nothing else — these screens are terminal
consumers, not a library.

## Test topology

**No component tests, by design.** `vitest.config.ts` runs `environment: 'node'` with an
`include` matching `*.test.ts` only — no jsdom, no testing library, no `TouchEvent`. The
consequence shapes all three packages: any behaviour worth proving is extracted into `lib/` as a
pure function, and the components are thin impure shells around it.

- **Behavioural halves, proved as pure logic:** `tests/extract.planPicked.test.ts` (room,
  rejection copy quoted verbatim, kind defaults + fallback search, totality of the free-kind
  invariant), `tests/extract.reassignKind.test.ts` (the swap table, `changed`, no-mutation),
  `lib/photos/{contentHash,gallery,resizeTarget,save}.test.ts`, `tests/ui.photoViewer.test.ts`.
- **Source-property halves, proved as text scans:** `tests/extract.onPickPurity.test.ts` ("can
  an effect run inside a state updater?" — asserted for EVERY `setTiles` call in the file,
  which is strictly stronger than one rendered scenario) and `tests/extract.kindSelector.test.ts`
  ("can this control disable itself?" / "can a superseded upload still write?"). Both read the
  module source with comments stripped (`readRepoCode`), which is why the components discuss
  StrictMode and dimming in comments without tripping the assertions.
- **Cross-layer agreement:** `tests/extract.pollSchedule.test.ts` pins the backoff schedule and
  asserts the routes' literal `maxDuration = 60` agrees with `FUNCTION_MAX_DURATION_S`.
  `tests/extract.readExtraction.test.ts` covers the self-heal. `lib/extract` itself has no
  co-located tests — its suite lives in `tests/extract.*.test.ts`.

## Failure map

| Stage | Failure | Where it surfaces | Aftermath |
|---|---|---|---|
| pick | not an image / empty / >25 MB | `planPicked.error` → `formError` (one line) | good files in the batch still added |
| pick | 4th file | "Only the first N…" | first three added |
| compress | undecodable source (HEIC via Files) | tile `error` state + the Photos-app advice | retryable (guard key deleted) |
| compress | still >600 KB after compression | tile `error`, client-side, before any bytes move | no token minted |
| token mint | 401 / bad pathname / bad payload | tile `error` (terse server message) | retryable |
| PUT | network / token expiry (10 min) | tile `error` | retryable; no blob written |
| submit | schema violation (dup kinds, 4th image, foreign URL) | 400 → `formError` | nothing created |
| job | `token_floor` / `transport` / `timeout` / `validation` | terminal `failed` row → review screen, blank form, runner-facing copy | nothing saved; manual entry keyed to this extraction |
| invocation death | killed at the wall / deploy recycle / OOM | row stays `pending` → self-heal flips it on the first read after 90 s → `failed`/`stale_timeout` | the one case the job cannot cover (rule 9 of the map) |
| poll | single fetch failure | quiet "still working" line | polling continues; not a failed extraction |
| poll | 90 s, no terminal status | `gaveUp` → Check again / Start over | same poll server-side closes the row |

## Concurrency

Client: one compress-and-upload chain per `(tile, gen)`; the `started` set blocks replays
(StrictMode or otherwise), `patchIfCurrent` makes a superseded chain's late writes no-ops, and
`previewsRef` revokes every object URL on unmount. Object URLs and `File`s are the only manual-
lifetime resources. Server: `after()` gives exactly one promise per invocation — no queue, no
worker, no locks; the DB rows are the state, and the stale self-heal is the recovery path. No
mutex-style shared mutable state exists anywhere in the three packages.

## Gotchas

- **Never "simplify" `560` into the compressor.** `maxWidthOrHeight: 560` on a portrait
  screenshot ships a 259 px-wide image — silent, accuracy-only, no error anywhere. Always via
  `longEdgeTargetFor`.
- **`DEFAULT_KIND_BY_INDEX` is not `SCREEN_KINDS` and must never be re-aliased.** The order is
  the device's pick order (F29); the alias was the Fitness-app-order defect.
- **Two `KindHolder` interfaces exist** (`planPicked`'s has no `id`). Structural, deliberate,
  documented at both sites.
- **The stored regex ≠ the request regex.** Validating an echoed pathname against the wrong one
  fails every upload (suffix) or worse, accepts one (no suffix check).
- **`onUploadCompleted` is observability, never a writer.** It does not fire on localhost (Blob
  cannot reach a laptop), and under R-1 there is no row to write to at upload time. Making it a
  writer breaks local development first.
- **`error` on a pick plan is `string | null`, not `string[]`** — a batch can trip several rules
  and the UI has one line. Clearing first and setting later is the bug it prevents.
- **`STALE_PENDING_MS` is one number with two jobs.** Changing the client's give-up silently
  changes the server's self-heal threshold, and vice versa.
- **Hash claims are gated, not normalised.** `Content-Security`-style "fix it into shape" (e.g.
  lowercasing on store) would manufacture agreement where there was none; a failed claim is NULL
  and dedup goes quietly inactive for that row.
- **The repair path is rationed, not broken.** On Hobby the 28 s gate usually refuses it; a
  `repaired` session may have a field dropped (text-only repair cannot re-read pixels) — F05
  treats it as "valid, but check the human's screenshots", which is what they are for.

## Notes / historical context

The pipeline is F04 (ingest + extraction) with F05's review seam, amended by the numbered fix
sessions its sources cite: F16/F16b (kind swap replaces dimming; source-property text-scan
tests), F17 (`onPick` purity — the measured two-blob bug), F18 (circular gallery navigation,
both handlers through one `stepIndex`), F29 (default kind order = device pick order), F33
(Nina chat photos as the upload route's second branch; gallery/save serving the photo overlay),
and the media-dedupe phases (P1-SC: `contentHash` and the backfill sweep, whose worker imports
it by relative path). The measured numbers (`research/downscale.mjs`, the repair-latency samples
in `constants.ts`) are the pipeline's constitution: the doc preserves the rules they produced
and leaves the numbers beside their measurements, dated, in source. This file replaces no
existing readme — `lib/photos` and `components/extract` previously had none — and the intent is
that it stays one map: update it here, not by forking per-package copies.
