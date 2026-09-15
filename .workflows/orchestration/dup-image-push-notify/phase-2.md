# Phase 2: Full-screen deep-link viewer route

**Plan set:** `DUP_IMAGE_PUSH_NOTIFY_PLAN.md`
**Analysis:** `20260915-090023-K7Q2_code_analyzer.md`
**Satisfies:** R2 — clicking the duplicate-image notification opens the client app on a full-screen view of the image that was already saved
**Depends on:** Phase 1 — **hard, both for the `url` contract and for imported symbols.** This phase
parses its route segments with phase 1's `parsePhotoViewerSegments` and types them with phase 1's
`PhotoPointerKind`, so it does **not** build on a tree where phase 1 has not landed. (The draft of
this plan claimed the opposite and shipped its own copy of the codec as `lib/photos/deepLink.ts`;
the reconciler deleted that module in round 1 — see the note in Step 1.)
**Difficulty:** NORMAL
**Package:** `app` (plus one function in `lib/db/queries` and one client component in `components/photo`)

---

## Goal

After this phase, `GET /photo/<kind>/<id>` — for `kind ∈ {shot, avatar, image}` — resolves the id
against the signed-in user's own rows and paints `components/ui/PhotoViewer.tsx` full-screen on that
one photograph, on a cold page load, with no chat-messages array and no run-detail context beneath
it. A miss of any sort (malformed kind, malformed id, another user's id, a deleted id) redirects to
`/` and never renders an error page. This is the URL the service worker's already-generic
`notificationclick` handler navigates to when phase 1's `duplicate_image` push is tapped.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none
**Renames:** none
**Creates:**
- route `app/photo/[kind]/[id]/page.tsx` — default export `PhotoDeepLinkPage`, module-private
  `resolveDeepLinkPhoto`, module-private const `DEEP_LINK_MISS_HREF = '/'`
- `components/photo/PhotoDeepLinkScreen.tsx` — `'use client'`, exports `PhotoDeepLinkScreen`
  (NEW directory `components/photo/`)
- `lib/db/queries/photos.ts` — `export interface RunPhotoPoint`,
  `export async function getRunPhoto(userId, photoId)` (re-exported by the `lib/db/queries.ts`
  barrel automatically via the existing `export * from './queries/photos'` at `queries.ts:62` — no
  barrel edit)
- `tests/photo.deepLink.test.ts`

**Signature changes:** none

**THE PATH CONTRACT — owned by phase 1, consumed here:**

    /photo/<kind>/<id>          kind ∈ 'shot' | 'avatar' | 'image'   id = /^[0-9A-Za-z_-]{12}$/

No query string, no trailing slash, no url-encoding (neither the kind literals nor `lib/id.ts`'s
alphabet contains a character `encodeURIComponent` would touch). `lib/service-worker.js:161`
compares `new URL(client.url).pathname === target` literally, so a trailing `?x=1` or `/` on
phase 1's minted url silently turns "focus the window already showing this photo" into "navigate it
again" — harmless, but the exact-match branch is why the shape must not drift.

**`lib/photos/pointer.ts` (phase 1) is the single module that spells this grammar** —
`photoViewerPath` writes it, `parsePhotoViewerSegments` reads it, and `lib/photos/pointer.test.ts`
freezes it. **This route's directory name IS half of that contract**, which is why phase 1's test
exists at all: `app/photo/[kind]/[id]/page.tsx` renamed to `[type]`, or a path built as
`/photos/...`, produces no compile error anywhere — it produces a notification that opens a 404.

**Pointer-kind values this phase dispatches on:** the three string literals `'shot'`, `'avatar'`,
`'image'`, parsed from the `[kind]` URL segment by phase 1's `parsePhotoViewerSegments` and typed by
its `PhotoPointerKind`. `lib/nina/attach.ts`'s `NinaPhotoKind` stays the two-way
`'avatar' | 'image'` union — phase 1 deliberately did not widen it (its Step 3 records why widening
it would silently route a shot id into `getNinaMessageImage`), and this phase must not widen it
either.

**Requires (from earlier phases) — Phase 1, all of it verified against phase 1's plan file:**

```ts
// lib/photos/pointer.ts (phase 1) — imported by the route and by this phase's test
export type PhotoPointerKind = 'shot' | 'avatar' | 'image'
export interface PhotoPointer { kind: PhotoPointerKind; id: string }
export function photoViewerPath(pointer: PhotoPointer): string          // '/photo/<kind>/<id>'
export function parsePhotoViewerSegments(kind: unknown, id: unknown): PhotoPointer | null
```

Phase 1's `duplicate_image` push payload sets `url = photoViewerPath(pointer)`, which is the path
this route serves. Nothing else of phase 1's is used here: `findGlobalDuplicatePhoto`,
`notifyDuplicateImagePush` and both `content_hash` columns are phases 3/4's business.

**Leaves alone (owned by others):**
- `lib/nina/attach.ts` — the `/nina?photo=` composer-arming grammar, byte-identical. **Phase 1 does
  not widen `NinaPhotoKind` either** — verified against its plan; its Step 3 explains why widening
  it in place would be unsafe, and its `lib/photos/pointer.ts` is the sibling union instead.
- `lib/photos/pointer.ts` — phase 1's. Imported here, never edited.
- `app/nina/page.tsx` — its existing `?photo=` handling, byte-identical
- `components/nina/usePhotoViewer.ts` and all four pre-existing `PhotoViewer` callers
  (`components/review/ScreenshotStrip.tsx` ×2, `components/share/PhotoInclusionList.tsx`,
  `components/nina/NinaAboutScreen.tsx`, `components/admin/ErrorLogList.tsx`) — this is a new,
  independent fifth/sixth caller; `tests/nina.chatPhoto.test.ts:114-136` pins those files
  byte-identical and this phase must keep them so
- `components/ui/PhotoViewer.tsx` — read and composed, never edited
- `lib/service-worker.js` — verified generic (`:144-170`), no change needed
- `proxy.ts` and `tests/auth.proxy.matcher.test.ts` — see Step 4's note
- `lib/db/schema/runs.ts` — phase 1 owns the `content_hash` column on `run_photos`; the new point
  read projects explicit columns and never names it
- `lib/admin/**`, `app/api/**`, `lib/nina/actions/**` — phases 3 and 4

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/queries/photos.ts` | modify | insert `RunPhotoPoint` + `getRunPhoto` **after phase 1's `findRunPhotoByContentHash`**, before `setPhotoExcludedFromShare` |
| `components/photo/PhotoDeepLinkScreen.tsx` | create | the client half: mounts `PhotoViewer` on a one-element array, owns close |
| `app/photo/[kind]/[id]/page.tsx` | create | the route: `requireUserId()` → parse → one ownership-scoped point read → render or redirect |
| `tests/photo.deepLink.test.ts` | create | the structural claims about the route, plus the round trip from `photoViewerPath` through the route's own segments |

Four files. The draft had five; `lib/photos/deepLink.ts` was deleted by the reconciler in round 1 as
a duplicate of phase 1's `lib/photos/pointer.ts` (see Step 1).

**`lib/db/queries/photos.ts` is shared with phases 1 and 3, and this is the agreed sequence**
(reconciler round 1): phase 1 lands `findRunPhotoByContentHash` immediately after
`listExtractionPhotos` and rewrites the file's `drizzle-orm` import line in full; **this phase
inserts after phase 1's function**, not after `listExtractionPhotos`, so the two additions sit in
one block; phase 3 edits `NewPhotoInput` and `attachExtractionPhotos` near the top of the file and
adds one `@/lib/photos/contentHash` import. Three disjoint regions — but **the `:72` / `:75` line
numbers quoted in the draft are pre-phase-1 and will be ~45 lines off.** Locate the insertion point
by function name.

## Implementation Steps

### Step 1: The `(kind, id)` codec — **nothing to build; import phase 1's**

**File:** none. **This step creates no module.**

**Reconciler note (round 1).** The draft of this plan created `lib/photos/deepLink.ts` —
`PhotoDeepLinkKind`, `parsePhotoDeepLink`, `photoDeepLinkHref` — and asked phase 1 to adopt it.
Phase 1 had independently built the same thing as `lib/photos/pointer.ts`, in the same directory,
with the same three literals and the same `isValidId` gate, and phase 1 is upstream: its push helper
already calls `photoViewerPath`, and its own test file freezes the grammar. Two structurally
identical codecs for one URL is the exact drift both modules' headers were written to prevent, so
the duplicate is gone and **this phase imports phase 1's**:

```ts
import { parsePhotoViewerSegments, type PhotoPointerKind } from '@/lib/photos/pointer'
```

The mapping, for anyone reading the draft's prose elsewhere in this file:

| draft (deleted) | phase 1 (use this) |
|---|---|
| `PhotoDeepLinkKind` | `PhotoPointerKind` |
| `parsePhotoDeepLink(kind, id)` | `parsePhotoViewerSegments(kind, id)` |
| `photoDeepLinkHref(kind, id)` | `photoViewerPath({ kind, id })` |
| `lib/photos/deepLink.ts` | `lib/photos/pointer.ts` |

Behaviour is identical in both directions — the same three literals, the same `isValidId` gate, the
same `null`-not-a-throw rule, the same `unknown` parameter types for `parseNinaPhotoParam`'s stated
reason — so every argument the draft made for its own module still holds; it is simply made once,
in phase 1's file, where the push payload can also reach it.

The draft's substantive point survives and is worth keeping in view: the app already has **two**
other `photo` grammars and neither can answer R2. `/nina?photo=avatar:<id>`
(`lib/nina/attach.ts`) arms the COMPOSER's pending-attachment slot — it opens no viewer and has no
`run_photos` arm. `/nina/about?photo=chat.<id>` (`lib/nina/album.ts`) does open `PhotoViewer`, but
over a LIST (the album grid or the 200-newest Media window), and it has no `run_photos` arm either.
A third grammar is needed, and it is a PATH rather than a query parameter because the service
worker's `notificationclick` handler compares `new URL(client.url).pathname === target`
(`lib/service-worker.js:161`). Both existing grammars stay byte-identical.

---

### Step 2: An ownership-scoped point read for `run_photos`

**File:** `lib/db/queries/photos.ts` — insert **after phase 1's `findRunPhotoByContentHash`** and
before `setPhotoExcludedFromShare`.

**Change:** Verified first, as the phase scope requires: at the base commit
`lib/db/queries/photos.ts` has four exports — `attachExtractionPhotos`, `listExtractionPhotos`,
`setPhotoExcludedFromShare`, `updatePhotoBlobLocation` — and **none of them reads one photo by id**.
`listExtractionPhotos` needs an `extractionId`, which a notification tap does not carry. Phase 1
adds a fifth, `findRunPhotoByContentHash`, which is a **hash** lookup and explicitly not a
substitute (phase 1's Handoffs say so). So the read is added, in this file's own style and next to
the two mutations that already use `runPhotoOwnedBy`.

`and`, `eq`, `db`, `runPhotos`, `PhotoKind` and `runPhotoOwnedBy` are **already imported** — this
step adds no import line, and it must not touch the `drizzle-orm` import line, which phase 1
rewrites in full.

> **Line numbers.** Every `:NN` in this step was read at the base commit. Phase 1 lands first and
> inserts ~45 lines above this insertion point, so **locate the anchors by name**, never by line.

**Code (insert verbatim after `findRunPhotoByContentHash`'s closing `}` and its blank line, before
the `/** R-11 / F11's per-photo opt-out. */` comment):**

```ts
/** What the `/photo/shot/<id>` deep link needs off a screenshot row, and nothing more. */
export interface RunPhotoPoint {
  id: string
  blobUrl: string
  kind: PhotoKind
  /**
   * NULL until the review commit backfills it (R-1's two-parent lifecycle, `attachExtractionPhotos`
   * above). The deep-link route reads it to decide where CLOSING the viewer lands: a committed
   * photo closes onto its run, an uncommitted one onto the runs list.
   */
  runId: string | null
}

/**
 * One screenshot by id, ownership-scoped — the `/photo/shot/<id>` deep-link read (R2).
 *
 * The mirror of `getNinaAvatar` (`lib/nina/queries/avatars.ts:211`) and `getNinaMessageImage`
 * (`lib/nina/queries/images.ts:272`) for the third image table, and it keeps their rule: `null` for
 * "not yours" and for "does not exist" alike. The caller has no legitimate use for the difference,
 * and a surface that distinguishes them is a surface that tells a stranger which ids exist.
 *
 * Ownership goes through `runPhotoOwnedBy` (`./ownership.ts:40`) rather than a `user_id` column,
 * because `run_photos` has none by design — the correlated EXISTS covers BOTH parents, so a photo
 * uploaded minutes ago (extraction only, `run_id` still NULL) is as reachable as one on a committed
 * run. A `runs`-only check would have made every pre-commit screenshot a silent 404.
 *
 * An EXPLICIT PROJECTION, not `select()`: drizzle expands a bare `select().from(t)` into every
 * column it knows about, so the shape of this read would otherwise change under a schema edit it
 * has no opinion about — phase 1 adds `content_hash` to this very table. Four columns are what the
 * viewer needs; `blob_url` is the photograph and `kind` is its label.
 */
export async function getRunPhoto(userId: string, photoId: string): Promise<RunPhotoPoint | null> {
  const rows = await db
    .select({
      id: runPhotos.id,
      blobUrl: runPhotos.blobUrl,
      kind: runPhotos.kind,
      runId: runPhotos.runId,
    })
    .from(runPhotos)
    .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:**
- `npm run ci:data-layer-guard` scans every file under `lib/db/queries/` for exported functions
  whose first parameter is not `userId` (`scripts/check-data-layer-invariants.mjs:62-68`).
  `getRunPhoto(userId: string, photoId: string)` satisfies it; the guard's regex ignores
  `export interface`.
- `rows[0] ?? null` rather than `rows[0]`: `noUncheckedIndexedAccess` is on, and `?? null` is the
  same "absent, not broken" answer the two Nina point reads give.
- Reachable through the `lib/db/queries.ts` barrel with no edit — `queries.ts:62` is already
  `export * from './queries/photos'`.

---

### Step 3: The client half — `PhotoViewer` on one photograph

**File:** `components/photo/PhotoDeepLinkScreen.tsx` (new file in a NEW directory
`components/photo/`)

**Change:** `PhotoViewer` takes two callbacks, so a Server Component cannot mount it directly; it
needs a client wrapper. This is the whole of it — no state, because there is exactly one photo and
therefore no pager (`PhotoViewer.tsx:265` renders the dot row only when `photos.length > 1`).

**Why a new directory and not `components/ui/`:** `components/ui/.workflows/package_readme.md:55`
states the rule for that folder — "the one full-screen overlay (`PhotoViewer`) and the one detail
dialog (`DetailPanel`) — 'one' is the point; a second [must not appear]". A file next to
`PhotoViewer.tsx` whose name reads like a second overlay is exactly the drift that readme guards, so
the wrapper goes where its route lives instead. The name follows the repo's own idiom for the
top-level client component of one route: `ReviewScreen`, `ChatScreen`, `NinaAboutScreen`. `app/`
holds no colocated components anywhere in this repo (verified: every file under `app/` is a
`page.tsx`, `layout.tsx`, `route.ts`, a co-located `*.test.ts`, or an asset), so it does not go
there either.

**Code:**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'

/**
 * `/photo/[kind]/[id]` — R2's whole client surface. One photograph, full screen, and a way out.
 *
 * ── WHY THIS IS A NEW CALLER AND NOT `usePhotoViewer` ─────────────────────────────────────────
 * `components/nina/usePhotoViewer.ts` opens by `{messageId, index}` derived from the in-memory
 * chat `messages` array, and derives rather than snapshots precisely because that array changes
 * under an open overlay. On a cold load from a notification tap there IS no array — the page has
 * one row, read by id. The hook's whole design is the reason it cannot serve this route, and it is
 * left untouched.
 *
 * ── THE PROPS ARE ALL SERVER-RESOLVED STRINGS ────────────────────────────────────────────────
 * `photo` is already a `ViewerPhoto` — url, kind, label — mapped on the server off a row it proved
 * is his. Nothing here fetches, and `description` (`glm-4.6v`'s private text, invariant 5) was
 * stripped before the prop was built; see the page.
 *
 * ── `onIndex` IS A NO-OP, DELIBERATELY ───────────────────────────────────────────────────────
 * With `photos.length === 1`, `PhotoViewer`'s `stepIndex(0, ±1, 1)` is 0 and the dot row does not
 * render, so the arrow keys have nowhere to page to. Accepting the call and doing nothing is the
 * honest spelling; a `useState` here would be an index that can only ever hold one value.
 */
export function PhotoDeepLinkScreen({
  photo,
  subject,
  closeHref,
}: {
  photo: ViewerPhoto
  /** The noun in the dialog's accessible name — `'foto'` for Nina's two tables, `'screenshot'`
   * for a run photo, matching `NinaAboutScreen` and `ScreenshotStrip` respectively. */
  subject: string
  /**
   * Where closing lands — the page the photograph actually lives on, decided by the server.
   *
   * ── WHY NOT `router.back()` ──────────────────────────────────────────────────────────────
   * `lib/nina/album.ts:380-388` already records the finding this route inherits: a deep link can
   * be opened with no in-app history beneath it. A notification tap reaches this page through
   * `clients.openWindow(target)` when the app is closed (`lib/service-worker.js:167`), and
   * `back()` from there navigates off the app entirely. `NinaAboutScreen` answers that by
   * carrying the origin IN the link; this route cannot, because the link is minted by a push
   * payload written minutes or days earlier, which knows no origin. So the destination is
   * derived from the PHOTO instead, which is a fact the server holds.
   *
   * `replace` and not `push`: the viewer page is spent once it is closed, and pushing would leave
   * a back-swipe that re-opens it on top of the page the runner just asked to be taken to.
   */
  closeHref: string
}) {
  const router = useRouter()

  /*
   * `useCallback` because `PhotoViewer`'s Escape/keydown effect lists `onClose` in its deps
   * (`PhotoViewer.tsx:139`): a fresh closure every render would tear down and re-add the document
   * listener on each one. Nothing re-renders this component today; the hook costs a line and
   * removes the question.
   */
  const close = React.useCallback(() => {
    router.replace(closeHref)
  }, [closeHref, router])

  return (
    <PhotoViewer
      photos={[photo]}
      index={0}
      onIndex={() => undefined}
      onClose={close}
      subject={subject}
    />
  )
}
```

**Impact:** A new `PhotoViewer` caller. It passes no `actions` slot, so
`tests/nina.chatPhoto.test.ts:115-120` (which iterates a fixed list of the pre-existing callers) is
untouched, and `tests/ui.photoViewer.test.ts`'s four claims are all about `PhotoViewer.tsx`,
`ScreenshotStrip.tsx`, `PhotoInclusionList.tsx` and the public share page — none of which this
phase edits.

---

### Step 4: The route

**File:** `app/photo/[kind]/[id]/page.tsx` (new)

**Change:** The Server Component. `requireUserId()` on line 1 (`lib/auth/requireUserId.ts`'s rule
1), then the pure parse, then exactly one ownership-scoped point read, then render or redirect.

**Segment naming, confirmed against this repo and Next 16.3.1:** a dynamic segment is a
bracket-wrapped folder (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
§Convention), `params` is a **Promise** that must be awaited (`page.md:64`), and `PageProps<'/route/[a]/[b]'>`
is a globally available generated helper that needs no import (`page.md:125-140`). That is exactly
the shape `app/x/[extractionId]/page.tsx:47-49` and `app/nina/about/page.tsx:64-67` already use, and
this route copies it. Two bracket folders nest normally: `app/photo/[kind]/[id]/page.tsx`.

**Why `redirect('/')` and not `notFound()`:** `/x/[extractionId]` answers a bad id with `notFound()`
because a runner reaches it from inside his own app, where a 404 is honest. This URL arrives from
the notification TRAY — days old, possibly naming a photograph he has since deleted — and
`lib/nina/attach.ts:148-152` already settles what that deserves: *"answering a stale bookmark with
an error page would be the app telling a runner his own chat is broken."* The redirect target is `/`
for the same reason `requireUserId()` redirects there: it is the runs list and the app's front door.
The security property is unchanged either way — wrong-owner, nonexistent and malformed are one
answer, so nothing here leaks which ids exist.

**Why `proxy.ts`'s matcher is NOT extended to `/photo/:path*`:** `proxy.ts`'s own header calls the
matcher a UX redirect and explicitly not the security boundary, and records that `/nina` is
"DELIBERATELY OMITTED, and not an oversight" because `requireUserId()` already protects it. This
route is in exactly that class. Adding a line would also require editing
`tests/auth.proxy.matcher.test.ts`, which is a file no phase in this set owns. A signed-out tap
lands on `/`, the sign-in screen, which is what a signed-out tap on `/nina` does today.

**Code:**

```tsx
import { redirect } from 'next/navigation'

import { PhotoDeepLinkScreen } from '@/components/photo/PhotoDeepLinkScreen'
import type { ViewerPhoto } from '@/components/ui/PhotoViewer'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getRunPhoto } from '@/lib/db/queries'
import { NINA_ABOUT_HREF, albumPhotos, galleryPhotos } from '@/lib/nina/album'
import { getNinaAvatar, getNinaMessageImage } from '@/lib/nina/queries'
import { parsePhotoViewerSegments, type PhotoPointerKind } from '@/lib/photos/pointer'

/**
 * `/photo/[kind]/[id]` — R2. One photograph, full screen, from a cold load.
 *
 * ── WHAT THIS ROUTE IS FOR ────────────────────────────────────────────────────────────────────
 * It is the click target of the `duplicate_image` push: the runner is told the image he just
 * uploaded is already in his collection, and tapping the notification must show him THE ONE HE
 * ALREADY HAS. The service worker's `notificationclick` handler is already generic — it focuses or
 * navigates any same-origin path off the payload's `url` (`lib/service-worker.js:144-170`) — so
 * nothing there changes; this page is the other end of that navigation and the reason the payload's
 * `url` may finally be something other than `/nina`.
 *
 * ── WHY IT IS A NEW ROUTE AND NOT ONE OF THE TWO EXISTING `photo` DEEP LINKS ──────────────────
 * `/nina?photo=<kind>:<id>` arms the composer, not a viewer. `/nina/about?photo=<section>.<id>`
 * does open `PhotoViewer`, but over a LIST — the album grid or the 200-newest Media window — and
 * neither grammar has an arm for `run_photos`, which is where a runner's screenshots live and where
 * two of the five upload routes write. `lib/photos/pointer.ts`'s header carries the full argument.
 *
 * ── ONE READ, AND IT IS THE OWNERSHIP CHECK ───────────────────────────────────────────────────
 * Each arm is a single-row lookup scoped to the signed-in user — `getRunPhoto` through
 * `runPhotoOwnedBy`'s correlated EXISTS, `getNinaAvatar`/`getNinaMessageImage` through their
 * `user_id` predicate. There is no separate authorization step because there is nothing to
 * authorize separately: a row that is not his does not come back. A miss of ANY kind — malformed
 * segment, foreign id, deleted id — is one answer, `/`, so the page cannot be used to learn which
 * ids exist.
 *
 * ── NO `AppShell` ─────────────────────────────────────────────────────────────────────────────
 * `PhotoViewer` is `fixed inset-0 z-60` and covers the tab bar completely. Rendering the shell
 * beneath it would ship a nav the runner can never see and reserve safe-area padding nothing
 * occupies. `app/x/[extractionId]/page.tsx` sets the precedent that a route may own its own chrome.
 *
 * ── NO `maxDuration` ──────────────────────────────────────────────────────────────────────────
 * Unlike `/nina`, `/r/[id]` and `/x/[extractionId]`, this page hosts no Server Action and calls no
 * model. One indexed read and a render; the platform default is more than it needs.
 */

/** Where every miss lands: the runs list, which is also the signed-out sign-in screen (R-24). */
const DEEP_LINK_MISS_HREF = '/'

/** What the client half needs, all of it resolved server-side off a row proved to be his. */
interface ResolvedDeepLinkPhoto {
  photo: ViewerPhoto
  subject: string
  closeHref: string
}

export default async function PhotoDeepLinkPage({ params }: PageProps<'/photo/[kind]/[id]'>) {
  const userId = await requireUserId()
  const { kind, id } = await params

  /*
   * Parsed BEFORE the read, because which table to read is what the grammar decides — the same
   * ordering `app/nina/page.tsx:157-160` states for its own parameter. Pure, so a hand-typed
   * `/photo/run/xyz` costs this page not one round trip.
   */
  const pointer = parsePhotoViewerSegments(kind, id)
  if (pointer === null) redirect(DEEP_LINK_MISS_HREF)

  const resolved = await resolveDeepLinkPhoto(userId, pointer.kind, pointer.id)
  if (resolved === null) redirect(DEEP_LINK_MISS_HREF)

  return (
    <PhotoDeepLinkScreen
      photo={resolved.photo}
      subject={resolved.subject}
      closeHref={resolved.closeHref}
    />
  )
}

/**
 * The pointer, against the three tables — one arm, one single-row read, or `null`.
 *
 * ── WHY THE TWO NINA ARMS GO THROUGH `albumPhotos` / `galleryPhotos` ─────────────────────────
 * Not for convenience: those two mappers are what STRIP `description`. Both point reads project
 * every column (`avatarColumns`, `imageColumns`), so both rows carry `glm-4.6v`'s private prose,
 * and invariant 5 says nothing in `components/` may read it. `app/nina/about/page.tsx:85-89`
 * records the same reasoning for the same reason — "that mapping is what strips `description`
 * (invariant 5) — the read's projection carries it, and it must not cross into client props in any
 * shape". Going through them also means the viewer's title is spelled in ONE place per table
 * (`NINA_ALBUM_LABEL`, `NINA_SIDE_LABEL`), so this route and `/nina/about` cannot disagree about
 * what a photograph is called.
 *
 * The `shot` arm needs no mapper: `RunPhotoPoint` carries four columns, none of them private, and
 * `PhotoViewer`'s own `SCREEN_KIND_LABEL[kind] ?? kind` fallback names it exactly as
 * `ScreenshotStrip` does — including the `'other'` kind, which has no label and renders as the bare
 * word, which is the behaviour the review surfaces already ship.
 *
 * ── THE CLOSE DESTINATION IS THE PHOTOGRAPH'S OWN HOME ───────────────────────────────────────
 * A run photo closes onto its run (`/r/<runId>`) when the review commit has backfilled one, and
 * onto the runs list when it has not — an uncommitted screenshot's only other home is
 * `/x/<extractionId>`, which is a review screen this page has no business dropping someone into.
 * Both Nina arms close onto `/nina/about`, where her album and the Media gallery live.
 */
async function resolveDeepLinkPhoto(
  userId: string,
  kind: PhotoPointerKind,
  id: string,
): Promise<ResolvedDeepLinkPhoto | null> {
  if (kind === 'shot') {
    const row = await getRunPhoto(userId, id)
    if (row === null) return null
    return {
      photo: { url: row.blobUrl, kind: row.kind },
      subject: 'screenshot',
      closeHref: row.runId === null ? DEEP_LINK_MISS_HREF : `/r/${row.runId}`,
    }
  }

  if (kind === 'avatar') {
    const row = await getNinaAvatar(userId, id)
    if (row === null) return null
    const mapped = albumPhotos([row])[0] ?? null
    if (mapped === null) return null
    return {
      photo: { url: mapped.url, kind: mapped.kind, label: mapped.label },
      subject: 'foto',
      closeHref: NINA_ABOUT_HREF,
    }
  }

  const row = await getNinaMessageImage(userId, id)
  if (row === null) return null
  const mapped = galleryPhotos([row])[0] ?? null
  if (mapped === null) return null
  return {
    photo: { url: mapped.url, kind: mapped.kind, label: mapped.label },
    subject: 'foto',
    closeHref: NINA_ABOUT_HREF,
  }
}
```

**Impact:**
- `redirect()` returns `never`, so `pointer` and `resolved` are narrowed after each guard without an
  `else` — the shape `app/x/[extractionId]/page.tsx` uses with `notFound()`.
- `albumPhotos([row])[0] ?? null` / `galleryPhotos([row])[0] ?? null`: both mappers map a one-row
  array to a one-row array, so the `null` branch is unreachable; it exists because
  `noUncheckedIndexedAccess` is the repo's setting, and it is the same `?? null` idiom
  `app/nina/about/page.tsx:93` uses at the identical call.
- `albumPhotos` returns the synthetic `'fallback'` entry only for an EMPTY input array. This call
  always passes one row, so that branch is unreachable here — and it could not be addressed anyway,
  since `'fallback'` is not a 12-char nanoid and `parsePhotoViewerSegments`'s `isValidId` gate
  refuses it.
- Three fields are copied out of each mapper's result rather than spreading it: `NinaAlbumPhoto`
  carries `description` and `isCurrent`, `NinaGalleryPhoto` carries `messageId` and `side`, and none
  of those belong in a `ViewerPhoto` prop.

---

### Step 5: The tests

**File:** `tests/photo.deepLink.test.ts` (new)

**Change:** The structural claims about the route, plus the one assertion that ties phase 1's URL
builder to **this route's directory name** — the shape `tests/nina.aboutPhoto.test.ts` already uses
for the `/nina/about` deep link (pure functions imported from `lib/`, structure asserted with
`readRepoCode`/`repoFileExists` from `./support/importGraph`). This repo runs `environment: 'node'`
with no jsdom for `*.test.ts`, so the route's behaviour is proven where it is pure and its shape is
proven by a source scan — the argument `tests/ui.photoViewer.test.ts:5-20` makes at length.

> **Division of labour with phase 1's `lib/photos/pointer.test.ts`** (reconciler round 1). That file
> owns the codec: every kind literal, every malformed id, the `unknown` parameter types, the
> no-query/no-trailing-slash shape. This file does **not** restate any of it. What it owns is the
> half phase 1's test cannot see — that `app/photo/[kind]/[id]/page.tsx` is a real DIRECTORY on
> disk, that the route opens with `requireUserId`, that every miss is a redirect, and that
> `description` never reaches a prop. The one overlapping assertion is deliberate: the round trip
> from `photoViewerPath` through the segments *this route* is handed, which is the seam where a
> renamed route folder becomes visible.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { parsePhotoViewerSegments, photoViewerPath } from '@/lib/photos/pointer'

import { isClientModule, readRepoCode, repoFileExists } from './support/importGraph'

/**
 * R2's deep link: the shape of the route that serves it.
 *
 * The URL `/photo/<kind>/<id>` is a contract between two things that never import each other — the
 * push payload the duplicate-image notify helper mints (phase 1), and this route's DIRECTORY NAME.
 * A drift is otherwise SILENT: the worker navigates, the page refuses to parse, and the runner
 * lands on `/` with nothing logged anywhere. `lib/photos/pointer.test.ts` pins the codec; this file
 * pins the other end of it.
 */

/** 12 chars, so `isValidId` accepts it and `newId()` could have produced it. */
const ID = 'photoAAAAAAA'

const ROUTE = 'app/photo/[kind]/[id]/page.tsx'
const SCREEN = 'components/photo/PhotoDeepLinkScreen.tsx'

describe('the URL phase 1 mints is the URL this route is handed', () => {
  it('round-trips through the segments Next hands the page', () => {
    // What Next hands the page is the path split on '/', minus the leading empty segment and the
    // literal 'photo'. Asserting the round trip is what makes the builder and the route one thing.
    for (const kind of ['shot', 'avatar', 'image'] as const) {
      const [, base, kindSegment, idSegment] = photoViewerPath({ kind, id: ID }).split('/')
      expect(base).toBe('photo') // the literal segment this route's parent directory spells
      expect(parsePhotoViewerSegments(kindSegment, idSegment)).toEqual({ kind, id: ID })
    }
  })
})

describe('the route the href names', () => {
  it('exists at the path the builder spells', () => {
    expect(repoFileExists(ROUTE)).toBe(true)
  })

  it('opens with requireUserId and answers every miss with a redirect, never an error page', () => {
    const source = readRepoCode(ROUTE)
    expect(source).toContain('requireUserId')
    expect(source).toContain('redirect')
    // A stale notification naming a deleted photo must not paint an error screen — the argument
    // parseNinaPhotoParam's docstring makes for the other deep link.
    expect(source).not.toContain('notFound')
    expect(source).not.toContain('throw new')
  })

  it('reads each table through its own ownership-scoped point read', () => {
    const source = readRepoCode(ROUTE)
    expect(source).toContain('getRunPhoto')
    expect(source).toContain('getNinaAvatar')
    expect(source).toContain('getNinaMessageImage')
  })

  it("strips glm-4.6v's private image text before it can reach a prop (invariant 5)", () => {
    // Both Nina point reads project `description`; albumPhotos/galleryPhotos are the mappers that
    // drop it, and the route must not name the field itself.
    const source = readRepoCode(ROUTE)
    expect(source).toContain('albumPhotos')
    expect(source).toContain('galleryPhotos')
    expect(source).not.toContain('description')
  })

  it('is a Server Component that mounts the viewer through one client wrapper', () => {
    expect(isClientModule(ROUTE)).toBe(false)
    expect(isClientModule(SCREEN)).toBe(true)
    expect(readRepoCode(SCREEN)).toContain("from '@/components/ui/PhotoViewer'")
    // The one overlay stays the one overlay: this is a caller, never a second definition.
    expect(readRepoCode(SCREEN)).not.toContain('function PhotoViewer')
  })
})
```

**Impact:** One new suite. The `not.toContain('description')` claim is why the route copies three
fields out of each mapper rather than spreading; the `not.toContain('notFound')` claim is why the
miss path is a redirect. Both are load-bearing on Step 4's code as written.

> Note for the implementer: `readRepoCode` strips comments (`tests/support/importGraph.ts:128`), so
> the prose in Step 4's doc comments — which names `notFound`, `description` and `PhotoViewer` while
> explaining why they are absent — does not fail its own explanation. That is exactly the trap
> `tests/ui.photoViewer.test.ts:18-20` records.

## Verification

**Install first (this worktree has no `node_modules`):**

```
cd /home/miftah/.worktrees/run-insights/dup-image-push-notify
cp /home/miftah/run-insights/.env.local .env.local     # lib/env.ts validates 14 vars at load
npm install                                             # a symlink passes vitest+tsc and fails the real build
```

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`) — the typegen leg is not optional:
`PageProps<'/photo/[kind]/[id]'>` does not exist until it has run, and a bare `tsc --noEmit` reports
it as an unknown name. Then `npm run build` for the real bundle.

**Tests:**
```
npm test
npm run lint
npm run format:check
npm run ci:data-layer-guard        # the new lib/db/queries export must take userId first
npm run ci:client-secret-guard     # a new 'use client' module under components/
```

**Manual check** (needs the dev server and a real signed-in session; `.env.local`'s `DATABASE_URL`
is the PRODUCTION instance, so read-only clicking only — this phase writes nothing):

```
npm run dev -- --port 3100          # port 3000 is held by a stranger that 302s everything to /login
```

1. Pick one real id from each table (`run_photos`, `nina_avatars`, `nina_message_images`) and visit
   `/photo/shot/<id>`, `/photo/avatar/<id>`, `/photo/image/<id>`. Each paints the dark full-screen
   overlay on that exact photograph, with the right title: `Summary screenshot` / `Foto profil Nina
   foto` / `Foto kamu foto` (or `Foto Nina foto` for one of hers).
2. Tap ✕, and press Escape. A shot closes onto `/r/<runId>` (or `/` for an uncommitted one); an
   avatar and a chat photo close onto `/nina/about`. The back button from there does not bounce back
   into the viewer (`replace`, not `push`).
3. `/photo/shot/<a valid 12-char id that does not exist>`, `/photo/avatar/<a chat image's id>`,
   `/photo/run/<id>`, `/photo/shot/short` — all four land on `/` with no error screen and nothing
   in the console.
4. Sign out in another tab, then reload `/photo/image/<id>` — the sign-in screen, not a crash.

**Exit criteria:** `/photo/<kind>/<id>` opens `PhotoViewer` full-screen on that exact photograph for
all three kinds as the owning user; every miss (bad kind, bad id, foreign id, deleted id) redirects
to `/` with no error page and no distinguishable response; `photoViewerPath({kind:'shot',id})` is
`'/photo/shot/' + id` and the file `app/photo/[kind]/[id]/page.tsx` exists; `npm run typecheck`,
`npm test`, `npm run lint` and `npm run ci:data-layer-guard` all pass.

## Handoffs

1. **The URL is minted by phase 1's `photoViewerPath` (`lib/photos/pointer.ts`) and parsed by its
   `parsePhotoViewerSegments` — one module, both directions.** *(Settled by the reconciler in round
   1. The draft of this handoff had it backwards: it asked phase 1 to adopt this phase's
   `photoDeepLinkHref`. Phase 1 is upstream, its push helper already calls `photoViewerPath`, and
   phases 3/4 were written against its names — so the duplicate `lib/photos/deepLink.ts` was deleted
   and this route imports phase 1's module instead. See Step 1.)*
2. **The pointer type is phase 1's `PhotoPointerKind`, and `lib/nina/attach.ts` stays two-way.**
   Phase 1's Step 3 records the reason at length: widening `NinaPhotoKind` to include `'shot'` would
   make `parseNinaPhotoParam('shot:abc')` succeed and route a `run_photos` id into
   `getNinaMessageImage` with no compile error. Two grammars, two unions, two consumers. Neither
   this phase nor any later one may widen it.
3. **Kinds beyond the three.** If a fourth image table ever appears, `PhotoPointerKind` /
   `PHOTO_POINTER_KINDS` in `lib/photos/pointer.ts` and `resolveDeepLinkPhoto`'s arms in this route
   are the two places to change. Not this phase's work.
4. **`components/ui/.workflows/package_readme.md:140`** records "`PhotoViewer` | 5 | …" callers and
   names them. This phase adds one. Updating that table is the readme-updater's job at the end of
   the set, not a step here — and it is a doc, not a gate.
5. **Phase 3's shot-upload wiring** will want a `content_hash` on the row it just inserted. That is
   phase 1's column and phase 3's call; `getRunPhoto`'s projection deliberately does not read it and
   does not need to be widened for either.
6. **An "open the run" affordance inside the viewer** (a link from a `shot` photo to `/r/<runId>`
   rendered in `PhotoViewer`'s `actions` slot) was considered and dropped: the slot is R10's and
   `tests/nina.chatPhoto.test.ts:115-120` pins the pre-existing callers as not passing it. Closing
   already lands on the run. Not in scope for R2.

## Rollback

Delete the two new files and the two new directories, and revert the one insertion:

```
git rm -r app/photo components/photo
git rm tests/photo.deepLink.test.ts
git checkout HEAD -- lib/db/queries/photos.ts     # NOTE: keeps phase 1's and phase 3's edits only
                                                   # if HEAD already carries them; otherwise revert
                                                   # just the getRunPhoto/RunPhotoPoint block by hand
```

`lib/photos/pointer.ts` is **phase 1's** and stays — nothing here may delete it; phase 1's push
helper and its own test both depend on it.

Nothing else in the tree references any of it. Phase 1's push payload would then name a path that
404s — the service worker's `notificationclick` would navigate to it and Next would render the
default not-found page — so if this phase is rolled back after phases 1/3/4 have landed, phase 1's
`url` should be reverted to `PUSH_TARGET_URL` (`/nina`) in the same commit. No migration, no data,
no behaviour change to any existing surface.
