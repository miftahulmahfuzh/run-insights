# Package: photos

**Location**: `lib/photos`
**Last Updated**: 2026-09-15
**Documentation Created**: 2026-09-15

## Overview

`lib/photos` is the host-neutral core of everything this app does with an image that is not
rendering it: the bytes' identity (`contentHash.ts`), the client-side compression recipes that
produce those bytes, the pure decision functions a photo overlay and a "save this" control need,
the `/photo/<kind>/<id>` pointer grammar, and — since 2026-09-15 — the one cross-table read that
answers "does this user already store these bytes anywhere?".

Its shape is set by one constraint stated in `contentHash.ts`'s header and inherited by everything
beside it: **modules in this directory are read by three hosts** — the browser, the server, and
`--experimental-strip-types` scripts with no bundler and no `@/` alias resolution. That is why the
package is overwhelmingly pure functions with zero or near-zero imports, why the two compressors
carry `'use client'` rather than the directory carrying `server-only`, and why the single module
here that *does* touch a database (`globalDuplicate.ts`) declares `server-only` explicitly to keep
an accidental client import a build error rather than a database client in a bundle.

**Key responsibilities:**
- Define image identity: sha-256 over the bytes exactly as stored, computable identically in all
  three hosts (`contentHashOf`), and the gate on a hash a client merely *claims*
  (`isValidContentHash`).
- Own the two client compression recipes — one reproducing a scored extraction measurement, one
  for Nina's chat — and the long-edge arithmetic both depend on.
- Own the `/photo/<kind>/<id>` URL grammar end to end: build it, parse it back, and nothing else
  in the codebase spells it.
- Answer the read-only cross-table question "are these bytes already in this user's collection?",
  per user, exact hash only, without deciding anything about them.
- Hold the pure gesture / save-strategy rules that were carved out of components so a `node`-only
  test runner can prove them.

## Module Map

| File | Boundary | Role |
| --- | --- | --- |
| `contentHash.ts` | **zero imports**, all three hosts | `contentHashOf`, `isValidContentHash` — the one string every dedup layer agrees on |
| `pointer.ts` | **pure**, one import (`@/lib/id`) | The `/photo/<kind>/<id>` grammar, both directions, plus the pointer types |
| `globalDuplicate.ts` | `server-only`, database | `findGlobalDuplicatePhoto` — the cross-table read, and the only impure module here |
| `resizeTarget.ts` | pure, zero imports | `longEdgeTargetFor` — the short-edge/long-edge arithmetic |
| `compressForExtraction.ts` | `'use client'` | The scored 560 px / q80 extraction recipe |
| `compressForNina.ts` | `'use client'` | The chat-photo recipe; a sibling of the above, not a parameterisation |
| `gallery.ts` | pure, zero imports | `stepIndex`, `decideSwipe` — the photo overlay's two rules |
| `save.ts` | pure, zero imports | `chooseSaveStrategy`, `saveFilenameFor` — the two "save this photograph" decisions |
| `*.test.ts` | `environment: 'node'`, no jsdom | Unit coverage; there is no `navigator`, no `File` picker, no `TouchEvent` in a test |

### Why this directory has no `server-only`, and must not gain one

Three of these modules are imported by client components (`compressForNina`, `compressForExtraction`
via `components/nina/useComposerPhotos.ts` and `components/extract/UploadPicker.tsx`), one by a
bundler-less script (`scripts/nina-image-worker/store.ts` reaches `contentHash.ts` through a
relative `../../lib/photos/contentHash.ts` specifier), and one by both plus the server
(`contentHash.ts`). `server-only` belongs on the individual module that genuinely cannot leave the
server — currently `globalDuplicate.ts` alone — never on the directory.

## Exported API

### `pointer.ts` — the URL grammar

```ts
export type PhotoPointerKind = 'shot' | 'avatar' | 'image'
export const PHOTO_POINTER_KINDS: readonly PhotoPointerKind[]
export interface PhotoPointer { kind: PhotoPointerKind; id: string }
export interface ResolvedPhotoPointer extends PhotoPointer { url: string }
```

The three kinds are the three image tables: `'shot'` → `run_photos`, `'avatar'` → `nina_avatars`,
`'image'` → `nina_message_images`.

`'avatar'` and `'image'` are **not ours to rename** — they are the strings `lib/nina/attach.ts`'s
`/nina?photo=<kind>:<id>` grammar already uses for the same two tables, and a second vocabulary for
one set of tables is how a bug gets written. `'shot'` is new because `run_photos` had never been
addressable by a pointer at all.

**`PhotoPointer` is not `NinaPhotoPointer` widened, and the two unions must not be merged.**
`lib/nina/attach.ts`'s type arms the composer with a photograph the runner is about to send, and
`app/nina/page.tsx` resolves it with a *ternary*, not an exhaustive switch. Adding `'shot'` there
would compile, would parse, and would read a `run_photos` id out of `nina_message_images`.

`ResolvedPhotoPointer` adds the Blob URL read off the row the server has already proved is this
user's — an id resolved against `user_id` is a fact, a URL arriving from a client is a claim.
**`description` is deliberately absent and must never be added**: it is `glm-4.6v`'s private text
and nothing outside Nina's prompt may read it.

```ts
export function isPhotoPointerKind(value: unknown): value is PhotoPointerKind
export function photoViewerPath(pointer: PhotoPointer): string
export function parsePhotoViewerSegments(kind: unknown, id: unknown): PhotoPointer | null
```

`photoViewerPath` is **the URL contract of the duplicate-image feature and the only place it is
spelled**: `{ kind: 'shot', id: 'aB3_xYz01234' }` → `/photo/shot/aB3_xYz01234`. No trailing slash,
no query string, no encoding, and **always a same-origin path, never an absolute URL** —
`NinaPushPayload.url` and `lib/service-worker.js`'s `FALLBACK_URL` both require that, and a
malformed value there means a tap lands on `/nina` instead of the photograph.

The missing `encodeURIComponent` is deliberate, not an oversight: `kind` is one of three literals
and `lib/id.ts`'s alphabet is `[0-9A-Za-z_-]`, so neither segment can contain a character a path
segment cares about. Encoding here would be dead code that hides the invariant rather than stating
it.

`parsePhotoViewerSegments` is the inverse for the viewer route. It takes `unknown` because a
Next.js route param is `string | string[] | undefined`. **`null` is not an error**: a stale
bookmark, a forged id and another user's id must all resolve identically, so the route that
consumes it degrades silently rather than telling anyone which ids exist. One `isValidId` predicate
covers all three tables because all three primary keys are `lib/id.ts` nanoid(12).

### `globalDuplicate.ts` — the cross-table lookup

```ts
export interface GlobalDuplicateOptions {
  exclude?: PhotoPointer | readonly PhotoPointer[] | null
}

export async function findGlobalDuplicatePhoto(
  userId: string,
  contentHash: string | readonly string[],
  options?: GlobalDuplicateOptions,
): Promise<ResolvedPhotoPointer | null>
```

The one question nothing in this codebase could ask before: there is no single image table, there
are three, each with its own dedup mechanism or none, and not one of them ever looked at another.

**It detects; it does not decide.** `lib/nina/dedupe.ts`'s invariant is that the three write-time
*decision* modules — `lib/nina/dedupe.ts`, `lib/nina/imageDedupe.ts`, `lib/admin/chatPhotos.ts` —
must not be merged and a fourth must not be grown. This is not a fourth. It writes nothing,
releases no blob, and never changes which row is a keeper and which is a reference. It runs *after*
whichever of those three has already decided, reads what they wrote, and answers a different
question: "is there a duplicate worth telling the runner about?" **Do not move those three modules
into this package, and do not give this one a write.**

The contract, each clause load-bearing:

- **Per user, never global.** Every arm is `user_id`-scoped (`run_photos` through
  `runPhotoOwnedBy`'s correlated EXISTS, since that table has no owner column). Matching across
  users would be a new, unstated, security-relevant capability, and the blob-release path is
  user-scoped too — a cross-user pointer would let one user's delete free bytes another still
  renders.
- **Exact bytes only. No perceptual matching.** `lib/nina/perceptual.ts`'s constants were measured
  on one production pair, are paired with `scripts/nina-dedupe-plan.mjs` ("if one number moves,
  move BOTH"), and are scoped to the chat-photo download-then-reupload case. Widening that gate to
  shots and album faces is a distinct tuning effort with its own measurements, and "already exists"
  does not ask for it.
- **Fixed priority, not chronology:** `image` → `avatar` → `shot`, first hit wins. `image` leads
  because `nina_message_images` is the only table whose `content_hash` is populated for historical
  rows — the only arm that can match anything written before this feature — and because it reuses
  `findNinaImageByContentHash` verbatim, including the `isOriginalPhoto()` filter that is the one
  place knowing an original from a reference. Electing "the oldest row across three tables" would
  need a fourth chat finder with the opposite sort order.
- **Sequential, with an early return**, not `Promise.all`: the contract is "the first match", the
  hit case costs one round trip, and this never runs in a render path.
- **Hashes are validated here, once.** `contentHash` may be one string or a list; invalid claims
  are *dropped*, not rejected. If nothing survives `isValidContentHash` the function returns `null`
  without a single round trip — "dedup is inactive for this row" is the honest reading, never an
  error on a write that already succeeded.
- **`null` is the whole failure vocabulary** — "no duplicate", "not yours", "no usable hash" all
  collapse into the one thing the caller does next: nothing.

#### `exclude`, and why the list form is the load-bearing one

Every caller runs this **after** its own insert, so without an exclusion a genuinely-new upload
finds itself and notifies.

A single pointer is accepted for the two admin chat routes, which write exactly one row per
gesture. **The list is what the other three routes need**: `/api/extract` writes up to three
`run_photos` rows, `sendNinaMessage` writes N `nina_message_images` rows, and one folder drop
registers up to fifty `nina_avatars` rows. Two files in one gesture can carry identical bytes, so
excluding only the asking row makes each of them find the other and announce a photograph *this
very gesture* created. "Already" means before now — which is the whole gesture, not one row of it.

For `'shot'` and `'avatar'` the exclusion is pushed into SQL, so a second, older row with the same
bytes is still found; a post-filter over a `LIMIT 1` would answer "no duplicate" whenever an
excluded row sorted first, which it always does, being the newest. For `'image'` it is applied
after the read, and the case that would lose — two *originals* in `nina_message_images` carrying
one hash — is unreachable by construction, because the chat write path turns the later one into a
reference and `findNinaImageByContentHash` filters references out.

### `contentHash.ts` — identity

```ts
export async function contentHashOf(input: Blob | ArrayBuffer | Uint8Array): Promise<string>
export function isValidContentHash(value: unknown): value is string
```

`globalThis.crypto.subtle`, **not `node:crypto`**, because the same answer must be computable in
the browser (which hashes the compressed bytes it is about to PUT — the server never sees upload
bytes), on the server, and in a strip-types script. 64 lowercase hex out.

The input is **the bytes exactly as stored** — for the upload path that is the compressed output,
not the picked file. A different re-encode is different bytes, which is honestly two objects rather
than a dedup miss.

**Never pass `view.buffer` to "simplify" an input.** `digest` respects a `Uint8Array`'s
`byteOffset`/`byteLength`; the buffer of a pooled Node `Buffer` is a chunk of unrelated heap, and
hashing it would call that chunk the file's identity.

### `resizeTarget.ts`

```ts
export function longEdgeTargetFor(width: number, height: number, shortEdgeTarget: number): number
```

`browser-image-compression`'s only sizing knob, `maxWidthOrHeight`, clamps the **larger** dimension;
fitness screenshots are portrait. Passing the 560 px short-edge target directly to a 739 × 1600
capture ships a 259 px-wide image — outside the measured accuracy envelope entirely, with no error
anywhere in the pipeline. This function computes the long-edge value that lands the short edge on
target. It never upscales, and it throws on implausible dimensions rather than returning a number
nobody can act on.

### `compressForExtraction.ts` / `compressForNina.ts`

Both `'use client'`, both returning `{ file, width, height, compressedBytes }`, both routing their
sizing through `longEdgeTargetFor`.

`compressForExtraction` **reproduces a measurement, not a preference** — JPEG q80 at 560 px on the
short edge, five 108/108 scores in `research/downscale.mjs` — and pins `maxIteration: 1` to protect
it. **Do not add an options bag to it**: that would make it possible to run extraction at a recipe
nobody scored.

`compressForNina` is a deliberate *sibling*, duplicating about fifteen lines of library call rather
than parameterising the above, and leaves `maxIteration` at the library default because it has no
scored recipe and does have a byte ceiling a dense night shot can genuinely hit. Both reuse
`COMPRESSION_LIB_URL` (the self-hosted worker) so the library's jsDelivr default never lands on the
hot path of an upload.

### `gallery.ts`

```ts
export function stepIndex(current: number, delta: number, count: number): number
export const SWIPE_MIN_DISTANCE = 48
export const SWIPE_DOMINANCE = 1.2
export interface SwipeGesture { dx, dy, touches, canPanHorizontally, zoomScale }
export function decideSwipe(gesture: SwipeGesture): 'next' | 'prev' | 'none'
```

`stepIndex` wraps in **both** directions — the double modulo exists because JavaScript's `%` keeps
the dividend's sign, so a single `%` wraps forward only. Both the swipe handler and the arrow-key
handler route through it, which is what stops the swipe wrapping while the keyboard clamps.

`decideSwipe`'s first three rules exist entirely to protect the native pinch-zoom: more than one
finger (counted as the **maximum** seen during the gesture, not the count at the end) is a pinch;
a zoomed viewport means a horizontal drag is a pan; so does an image wider than its box. Rules 4
and 5 then separate a swipe from a tap and from a vertical scroll. Finger-left is `'next'`.

### `save.ts`

```ts
// SaveStrategy = 'share' | 'open' | 'download' — the type is internal on purpose
export function chooseSaveStrategy(env: { canShareFiles: boolean; coarsePointer: boolean }): SaveStrategy
export function saveFilenameFor(url: string, prefix: string): string
```

There is a decision at all because **`<a download href={crossOriginUrl}>` is not a download** — the
attribute is honoured same-origin only, and every photo here lives on a Blob host, so the browser
navigates and nothing is saved.

The gate is `(pointer: coarse)` plus `canShare({ files })`, **not a browser name**: `canShare` is
true on Windows Chrome and macOS Safari too, and the Windows share sheet has no save action at all.
A touch device without file sharing gets `'download'`, not `'open'` — the object-URL anchor is
same-origin and works there too. `'open'` is a `SaveStrategy` member but never a return value; it
is the component's runtime fallback.

`saveFilenameFor` never throws: a malformed URL, an empty path or an unknown extension all degrade
to `<prefix>.jpg`. Only the blob URL's **last** path segment is used, so the user id embedded in
`nina/<userId>/chat/<id>.jpg` never reaches a filename, and a caption is not an option because the
only description a chat photo has is `glm-4.6v`'s private prose.

## Data Flow

**Upload (client half).** Picker → `compressForExtraction` / `compressForNina` (→
`longEdgeTargetFor`) → `contentHashOf` over the *compressed* bytes → PUT to Blob → the hash travels
to the server as a client claim.

**Upload (server half).** The route inserts its rows → `isValidContentHash` gates the claim (a
failing claim is stored as `NULL`, never an error) → `findGlobalDuplicatePhoto(userId, hashes,
{ exclude: <every row this gesture just wrote> })` → on a hit, `ResolvedPhotoPointer` →
`lib/push/duplicateImage.ts`'s `notifyDuplicateImagePush` → `photoViewerPath` → the push's `url`.

**Tap.** Notification → `/photo/<kind>/<id>` → the viewer route's
`parsePhotoViewerSegments(kind, id)` → a per-kind, `user_id`-scoped read → the photograph, or a
silent degradation.

**Viewing.** `components/ui/PhotoViewer.tsx` measures a `touchend` into a `SwipeGesture` →
`decideSwipe` → `stepIndex`. A save control probes the environment → `chooseSaveStrategy` →
`saveFilenameFor`.

## Dependencies

### External
- `browser-image-compression` — the two compressors only; its worker is self-hosted by
  `scripts/copy-image-compression-worker.mjs`.

### Internal
- `@/lib/id` → `isValidId` (`pointer.ts`).
- `@/lib/extract/constants` → the scored extraction recipe and `COMPRESSION_LIB_URL`.
- `@/lib/nina/images` → the chat recipe's constants.
- `@/lib/db/queries` → `findRunPhotoByContentHash`; `@/lib/nina/queries` →
  `findNinaAvatarByContentHash`, `findNinaImageByContentHash`. `globalDuplicate.ts` only.

### Platform
`globalThis.crypto.subtle` (native in every browser and in Node ≥ 19; this repo's floor is 22) is
the only platform primitive `contentHash.ts` will accept. `globalDuplicate.ts` is Node-runtime
server code.

## The three per-table finders

`findGlobalDuplicatePhoto` is a composition over three queries that live in their own packages and
stay there. All three share one signature —
`(userId, contentHash: string | readonly string[], excludeIds?: readonly string[]) =>
Promise<{ id, blobUrl } | null>` — order newest-first (`created_at desc, id desc`; any match is a
correct target and the newest is least likely to be deleted between the read and the
notification), and return `null` for "not yours", "no such bytes" and "nobody stores them" alike.

| Kind | Function | Home | Scoping |
| --- | --- | --- | --- |
| `image` | `findNinaImageByContentHash` | `lib/nina/queries/images.ts` | `user_id` + `isOriginalPhoto()` |
| `avatar` | `findNinaAvatarByContentHash` | `lib/nina/queries/avatars.ts` | `user_id` |
| `shot` | `findRunPhotoByContentHash` | `lib/db/queries/photos.ts` | `runPhotoOwnedBy(userId)` — a correlated double-EXISTS to `extractions` **or** `runs`, in the same statement as the hash predicate |

Both avatar and shot finders project **two columns**, not the full row: the caller needs an id to
point at and a URL to render, and a narrower select is the cheapest way not to hand `description` —
`glm-4.6v`'s private text — to a notification.

`findNinaAvatarByContentHash` does **not** replace `getNinaAvatarBySourceKey`. `source_key` is
`(relative path, size, lastModified)`, a mechanical key backing the batch register's
`ON CONFLICT DO NOTHING`; this asks whether the *bytes* are in the collection under any name. The
two disagree constantly and both are correct about their own question.

## Schema

The feature's columns (migration `drizzle/0022_nostalgic_rachel_grey.sql`, generated 2026-09-15):

| Column | Index |
| --- | --- |
| `run_photos.content_hash` (nullable text) | `run_photos_content_hash_idx` — partial, `where content_hash is not null` |
| `nina_avatars.content_hash` (nullable text) | `nina_avatars_user_content_hash_idx` on `(user_id, content_hash)` — partial, same predicate |

`nina_message_images.content_hash` already existed and is the only one populated for historical
rows. **Both new columns are new-rows-only: there is no backfill**, which is exactly why the lookup
order puts `image` first.

**Generating the migration was phase 1's job; applying it is a deploy-time decision.** `.env.local`'s
`DATABASE_URL` is production, so `npm run db:migrate` here writes production. Until an operator
applies it, `npm run ci:schema-drift-guard` reports these two columns and two indexes as missing —
expected, not drift.

## Reverse Dependencies

*Verified 2026-09-15.*

### Primary consumers
- `components/nina/useComposerPhotos.ts` — `compressForNina` + `contentHashOf`, the composer's
  whole upload half.
- `components/ui/PhotoViewer.tsx` — `decideSwipe`, `stepIndex`, `SwipeGesture`.
- `components/ui/useSavePhoto.ts` — `chooseSaveStrategy`, `saveFilenameFor`.

### Secondary consumers
- `components/extract/UploadPicker.tsx` — `compressForExtraction`.
- `components/admin/explorer/chatPhotoUpload.ts` — `contentHashOf`.
- `components/admin/explorer/thumbnail.ts` — `longEdgeTargetFor`.
- `lib/nina/dedupe.ts`, `lib/nina/queries/images.ts`, `lib/admin/chatPhotoActions.ts` —
  `isValidContentHash`.
- `lib/nina/imagerun.ts` — `contentHashOf`.
- `lib/push/duplicateImage.ts` — `photoViewerPath`, `PhotoPointer`, `PhotoPointerKind`. The only
  consumer of `pointer.ts` outside the viewer route.
- `scripts/nina-image-worker/store.ts` — `contentHashOf` **by relative path**, under
  `--experimental-strip-types`. See the constraint at the top.

### Not yet wired
`globalDuplicate.ts` has **no production caller as of 2026-09-15** — only its own test. Phase 2
(the `/photo/<kind>/<id>` viewer route), phase 3 (runner-side shot and chat uploads) and phase 4
(admin-side chat photo add/replace and the avatar batch) of `DUP_IMAGE_PUSH_NOTIFY_PLAN.md` are the
callers, and are unblocked. That is expected, not dead code.

## Concurrency

Not designed for concurrent use, and mostly incapable of it: every module but one is pure functions
over their arguments with no module state.

`findGlobalDuplicatePhoto` is `async` I/O with no shared mutable state — its three arms run
strictly sequentially with an early return. It holds no lock and takes no transaction: it reads
rows other requests may be writing concurrently, and a duplicate found or missed by one round trip
of racing is a notification sent or not sent, which is the correct amount of wrong for a courtesy.

## Error Handling

No custom error types anywhere in this package, and one deliberate throw.

| Function | On bad input |
| --- | --- |
| `findGlobalDuplicatePhoto` | `null` — for no duplicate, not yours, and no usable hash alike |
| `parsePhotoViewerSegments` | `null` — a stale bookmark and a forged id are indistinguishable on purpose |
| `isValidContentHash`, `isPhotoPointerKind` | `false` |
| `saveFilenameFor` | degrades to `<prefix>.jpg`; never throws |
| `stepIndex`, `decideSwipe` | `0` / `'none'` for non-finite input |
| `contentHashOf` | rejects only if the platform has no `crypto.subtle` |
| `longEdgeTargetFor` | **throws** on implausible dimensions — the one case where a wrong number would silently degrade accuracy downstream |
| the compressors | throw with runner-facing copy (the HEIC case) |

## Performance

Light allocation; the costs are a hash over the file's bytes, the compressors' decode/re-encode in
a worker, and up to three indexed `SELECT`s.

- `findGlobalDuplicatePhoto` costs **one** round trip on a hit against `image`, at most three on a
  miss. Every arm is index-served: `(user_id, content_hash)` partial indexes on both Nina tables,
  `content_hash` on `run_photos`. Each arm is `LIMIT 1`.
- The list forms (`contentHash` and `exclude`) exist to keep a multi-hash, multi-row question at
  one round trip per table: an upload carries two hashes worth asking about — the encode's, and the
  picked file's own, which for a download-then-reupload *is* a stored row's bytes.
- An empty `excludeIds` must never emit `not in ()`; both finders guard on length.
- The compressors run off the main thread in `browser-image-compression`'s worker.

## Testing

`vitest`, `environment: 'node'`, `*.test.ts` only — no jsdom, so no `navigator`, no `File` picker,
no `TouchEvent`, no `visualViewport`. That is why so much of this package is pure: what can be
decided without a browser is decided here and proven here, and the impure halves stay in the
components.

`globalDuplicate.test.ts` mocks the three finders and pins a hit in each table, a miss that
consults all three, and the list-exclusion form. `pointer.test.ts` pins the round trip
`photoViewerPath` → `parsePhotoViewerSegments` across every kind in `PHOTO_POINTER_KINDS`.
`server-only` is aliased to a stub by `vitest.config.ts`, so `globalDuplicate.ts` is tested as
shipped.

*Measured 2026-09-15 (`P1-PHO-Q7XK`):* the phase's targeted suite ran 171/171 green, the full
`npm test` 341 files / 5917 tests, with `npx tsc --noEmit`, `npm run lint` and `npm run db:check`
clean.

## Gotchas

- **Do not put `server-only` on this directory.** Three modules are client-imported and one is
  imported by a bundler-less script through a relative path. It belongs on the individual module.
- **Do not give `globalDuplicate.ts` a write, and do not move `lib/nina/dedupe.ts`,
  `lib/nina/imageDedupe.ts` or `lib/admin/chatPhotos.ts` into this package.** Those three decide
  keeper-vs-reference at write time and must stay three; this one only reads what they wrote.
- **Do not widen `findGlobalDuplicatePhoto` to perceptual matching.** The perceptual constants are
  measured, chat-scoped, and paired with a script that must move with them.
- **Do not drop the list form of `exclude`.** Three of the five upload routes write more than one
  row per gesture, and the single-pointer form makes batch siblings announce each other.
- **Do not merge `PhotoPointer` with `lib/nina/attach.ts`'s `NinaPhotoPointer`.** That union is
  resolved by a ternary; adding `'shot'` reads a `run_photos` id out of `nina_message_images`.
- **Do not add `description` to `ResolvedPhotoPointer`** or widen either finder's projection. It is
  `glm-4.6v`'s private text (invariant 5).
- **Do not build `/photo/...` by hand anywhere.** `photoViewerPath` is the only speller, and its
  test is what keeps the notification and the route agreeing.
- **Do not add `encodeURIComponent` to `photoViewerPath`.** Both segments are alphabet-constrained;
  it would hide the invariant rather than state it.
- **Do not return an absolute URL from `photoViewerPath`.** The push payload and the service worker
  both require a same-origin path.
- **Do not pass `view.buffer` to `contentHashOf`.** A pooled `Buffer`'s backing allocation is not
  the file.
- **Do not give `compressForExtraction` an options bag.** It reproduces a scored measurement.
- **`longEdgeTargetFor` exists because `maxWidthOrHeight` clamps the LONG edge.** Passing a
  short-edge target directly is a silent, accuracy-only regression.

## Notes

Nothing in this package treats a duplicate as a problem. `findGlobalDuplicatePhoto` runs after the
write has already succeeded and its only consumer sends a courtesy notification; a rejection, a
retry or a refused upload is not in this package's vocabulary and should not be added to it.

## Recent Changes

**2026-09-15 — `P1-PHO-Q7XK` (phase 1 of 4, `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`)**
- Added `pointer.ts`: `PhotoPointerKind`, `PHOTO_POINTER_KINDS`, `PhotoPointer`,
  `ResolvedPhotoPointer`, `isPhotoPointerKind`, `photoViewerPath`, `parsePhotoViewerSegments` —
  the `/photo/<kind>/<id>` grammar, owned end to end here.
- Added `globalDuplicate.ts`: `findGlobalDuplicatePhoto` — read-only, per-user, exact-hash,
  `image` → `avatar` → `shot`, list-capable `exclude`. The first `server-only` module in this
  directory.
- Added the two per-table finders it composes (`findRunPhotoByContentHash` in `lib/db/queries`,
  `findNinaAvatarByContentHash` in `lib/nina/queries`) and the two nullable `content_hash` columns
  plus partial indexes they read (migration `0022`, generated not applied).
- No change to any pre-existing module in this package.
