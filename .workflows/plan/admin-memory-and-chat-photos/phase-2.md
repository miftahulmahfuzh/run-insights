# Phase 2: Her chat photographs, listed in `/admin`

**Plan set:** `ADMIN_MEMORY_AND_CHAT_PHOTOS_PLAN.md`
**Analysis:** `20260905-045430-M7Q2_code_analyzer.md`
**Satisfies:** R2 — *"make sure all the photos in in user chat collection with nina (nina generated images) are shown in admin page as well. just put them into a folder or something"*
**Depends on:** none (runs concurrently with phase 1; they share no file)
**Difficulty:** NORMAL
**Package:** `app/admin/photos`, `components/admin`, `lib/nina`

---

## Goal

`/admin/photos` exists and lists **every** `nina_message_images` row where `kind = 'generated'` for
the signed-in admin, newest first, paginated, presented as one named collection — a folder-shaped
surface over a table that has no folder column. It is reachable from the admin sidebar and from a
fourth hub card that shows the count. It is **read-only**: it renders no control that writes, and it
lays out a details rail with a named seam so phase 3 can hang replace / add / remove on it without
restructuring anything.

The set is defined by `kind`, never by `message.role`, so the listing includes the rows the R26
re-attach path hangs off **runner** messages and therefore cannot disagree with `/nina/about`'s
gallery about which photographs are hers.

---

## Framework docs read before writing any page code

Per `AGENTS.md` ("This is NOT the Next.js you know") and because this repo runs **Next.js 16.3.1**
(`node_modules/next/package.json`), the page below was written against the docs in the tree, not
from memory:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  - **"Page Props Helper"** (`:123-140`): *"You can type pages with `PageProps` to get strongly
    typed `params` and `searchParams` from the route literal. `PageProps` is a globally available
    helper."* And: *"Types are generated during `next dev`, `next build`, or with `next typegen`.
    After type generation, the `PageProps` helper is globally available. It doesn't need to be
    imported."*
    → **Consequence for verification:** `PageProps<'/admin/photos'>` does not typecheck until
    typegen has seen the new route. The verification command is therefore `npm run typecheck`
    (`next typegen && tsc --noEmit`), never a bare `tsc --noEmit`. This is not optional here — the
    route literal is brand new in this phase.
  - **`searchParams` (`:69-121`)**: *"A promise that resolves to an object containing the search
    parameters of the current URL"*, *"you must use `async/await` or React's `use` function to
    access the values"*, the repeated-parameter table (`/shop?a=1&a=2` → `Promise<{ a: ['1','2'] }>`
    — hence `readOne` below), and *"`searchParams` is a **Request-time API** whose values cannot be
    known ahead of time. Using it will opt the page into **dynamic rendering** at request time."*
    → `force-dynamic` is therefore **not** here because of `searchParams`; it is here for the reason
    `app/admin/nina/page.tsx:33-36` states, quoted at the page's docstring.

`app/admin/layout.tsx:165` already uses the sibling `LayoutProps<'/admin'>`, so the helper is live in
this repo today.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Route chosen:** `/admin/photos` — `app/admin/photos/page.tsx`.

> **Why this segment and not `/admin/chat-photos` or `/admin/nina/photos`.** Three arguments, in
> order of weight. (1) The plan index already writes `app/admin/photos/page.tsx` into phase 2's
> *Owns* and `app/admin/photos` into the phase table's Package column, and phase 3's plan will hang
> `revalidatePath('/admin/photos')` off it — renaming the segment costs two other plan files an edit
> to buy nothing. (2) The ambiguity people fear here (*"but `/admin/nina` is also photos"*) is a
> **label** problem, not a **path** problem, and it is solved by the nav label "Chat photos" and the
> page heading, which is exactly how `/admin/memory` distinguishes itself from `/admin` without a
> two-word slug. (3) Nesting under `/admin/nina` would be actively wrong: it would put a
> `nina_message_images` surface inside the route whose entire subtree means `nina_avatars`, and
> phase 3's `revalidatePath` would then have to reason about whether it also invalidates the album.

**Creates:**

- `NINA_CHAT_PHOTO_PAGE_SIZE` = `48` (`lib/nina/album.ts`, appended after `NINA_ADMIN_PAGE_SIZE:75`)
- `NinaChatPhotoPage` (`lib/nina/queries.ts`, after `NinaImageInsert` ends at `:202`)
- `listNinaChatPhotos(userId, opts?): Promise<NinaChatPhotoPage>` (`lib/nina/queries.ts`, appended to
  §5 after `getNinaMessageImagesForMessages` ends at `:1302`)
- `countNinaChatPhotos(userId): Promise<number>` (same place)
- `generatedChatPhotoScope(userId)` — **private**, not exported (same place)
- `ChatPhoto`, `ChatPhotoPageInfo` (`components/admin/chatPhotoModel.ts` — new, types only)
- `ChatPhotoGrid` (`components/admin/ChatPhotoGrid.tsx` — new, `'use client'`)
- `CHAT_PHOTO_COLLECTION_LABEL` = `'Nina generated'` (`components/admin/ChatPhotoGrid.tsx`)
- `ChatPhotoDetail` (`components/admin/ChatPhotoDetail.tsx` — new, `'use client'`) — **the seam**
- `AdminChatPhotosPage` (`app/admin/photos/page.tsx` — new, default export)

**Exact component signatures** (reconciled 2026-09-05 — phase 3 quotes these verbatim, so a change
here is a change to phase 3's Step 9):

```tsx
export function ChatPhotoGrid(props: {
  photos: readonly ChatPhoto[]
  page: ChatPhotoPageInfo
  /**
   * The signed-in admin's `user.id`, threaded from the SERVER page (`requireAdmin()` returns it).
   * Phase 3's upload handshake builds `adminChatPhotoPathname(userId, id)` from it, and a user id
   * that goes into a Blob pathname must come from the server — never from a client-side session
   * read. Phase 2 renders it nowhere; it exists solely to be handed down.
   */
  userId: string
}): JSX.Element

export function ChatPhotoDetail(props: {
  photo: ChatPhoto
  /** Forwarded from the grid, unread by this phase. Same reason as above. */
  userId: string
  onClose: () => void
  /**
   * Called when the row is GONE — a different event from closing the rail. It carries the action's
   * `note` (or `null`) so the grid can render the sentence somewhere that survives the rail
   * unmounting; see the seam table.
   */
  onRemoved: (note: string | null) => void
}): JSX.Element
```

**Exact exported query signatures** (the caller-facing half of the contract):

```ts
export interface NinaChatPhotoPage {
  rows: NinaImageRow[]
  total: number
}

export async function listNinaChatPhotos(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<NinaChatPhotoPage>

export async function countNinaChatPhotos(userId: string): Promise<number>
```

**Deliberate deviation from the analysis's sketch, flagged for the reconciler.** The analysis's
impact list (`20260905-045430-M7Q2_code_analyzer.md:507`) sketched
`listNinaChatPhotos(userId, {kind, limit, offset})`. **`kind` is not a parameter.** It is
`'generated'`, baked into one private predicate shared by both exports, because: R2's set is
*"nina generated images"* and nothing on this surface has a use for his uploads; a `kind` parameter
is an invitation for a later caller to widen the admin listing into "the whole conversation" without
anyone deciding to; and two exports that could disagree about the predicate are exactly the drift
`generatedChatPhotoScope` exists to make impossible. If phase 3 ever needs his uploads it should add
its own reader, not widen this one.

**Modifies (additive only, no existing symbol changes shape):**

- `lib/nina/queries.ts` — the `@/lib/nina/album` import block at `:40-44` gains
  `NINA_CHAT_PHOTO_PAGE_SIZE`. No existing exported function is touched. `imageColumns:469`,
  `listNinaMessageImages:1240`, `getNinaMessageImage:1266`, `getNinaMessageImagesForMessages:1287`
  are read-only references.
- `lib/nina/album.ts` — one new exported const appended. **APPROVED at reconciliation and added to
  phase 2's OWNS in the plan index.** It is the correct home: every other Nina photo-surface cap
  lives there (`NINA_GALLERY_LIMIT`, `NINA_ALBUM_MAX`, `NINA_ADMIN_PAGE_SIZE`,
  `NINA_ADMIN_MANIFEST_MAX`, `NINA_ADMIN_BATCH_MAX`) and the whole argument for 48 is a contrast
  with the 120 sitting eight lines above it. No other phase touches the file: phase 1 does not enter
  `lib/nina/**`, and phase 3 lists `lib/nina/album.ts` under *Leaves alone*. The
  declare-it-in-`queries.ts` fallback is **not** taken.
- `components/admin/AdminNav.tsx` — one entry appended to `LINKS` (`:20-24`).
- `app/admin/page.tsx` — one import, one entry in the existing `Promise.all` (`:69-79`), one fourth
  `<Card>` in the existing `sm:grid-cols-2` grid (`:90-118`).

**Deletes:** none.
**Renames:** none.
**Signature changes:** none.

**Requires (from earlier phases):** nothing. Phase 2 has no `depends_on` and assumes no prior
landing.

**Leaves alone (owned by others):**

- `lib/admin/schema.ts`, `lib/admin/memory*`, `components/admin/Memory*`, `app/admin/memory/**` —
  phase 1, running concurrently. **Not opened for editing at any point in this plan.**
- Every Server Action, every mutation, `app/api/**` — phase 3. This phase is read-only.
- `components/admin/explorer/**`, `components/admin/FileExplorer.tsx`, `app/admin/nina/page.tsx`,
  `lib/admin/ninaAlbumActions.ts` — a different table.
- `scripts/nina-image-worker.ts`, `lib/nina/images.ts`, `lib/nina/imagerecipe.ts`,
  `lib/nina/chatphotos.ts`, `app/nina/**`, `components/nina/**`.

### THE SEAM — where phase 3 attaches its three controls

Named once, precisely, so phase 3's diff is additive:

| Control | Attaches at | Needs |
|---|---|---|
| **Replace** | `components/admin/ChatPhotoDetail.tsx`, inside the `{/* SEAM — PHASE 3 */}` block at the bottom of the rail, first entry in the action stack | `photo.id`, `photo.pathname`, `userId` — all three already props |
| **Remove** | same block, last entry | `photo.id`, `userId`; plus `onRemoved(note)` — **the callback exists as a prop and is wired end to end**, and phase 3's `ChatPhotoControls` CALLS it on success (see below) |
| **Add** | `components/admin/ChatPhotoGrid.tsx`, in the `{/* SEAM — PHASE 3 */}` block on the collection header row, beside the photo count | `userId`, and nothing from a selection — it is a collection-level action |

Three structural affordances are built **now** so phase 3 does not have to restructure:

1. **`userId` is threaded from the server page into both components.** `AdminChatPhotosPage` already
   has it from `requireAdmin()`; it passes `userId` to `ChatPhotoGrid`, which forwards it to
   `ChatPhotoDetail`. Neither component renders it. This is `app/admin/nina/page.tsx:57-59`'s own
   pattern for `shareOrigin`, and it exists because phase 3 builds a Blob pathname out of it — a
   user id that reaches a pathname must come from the server, never from a client-side session read.
2. `ChatPhotoDetail` takes `onClose: () => void` **and** `onRemoved: (note: string | null) => void`,
   and `ChatPhotoGrid` passes both. `onRemoved` clears `selectedId` **and** stores the note in the
   grid's `notice` state, which renders under the collection header — a place that does not unmount
   when the rail does. **Reconciled 2026-09-05:** phase 3's remove action returns a `note` (*"The
   file is still used elsewhere, so it was kept in the store."*) whose only render site in phase 3's
   own code is inside the rail, and the rail unmounts the instant `revalidatePath`'s RSC payload
   drops the removed row. Without this the operator can never read the sentence phase 3's D5 promises
   him. `onRemoved` is not decorative and has a caller from the moment phase 3 lands.
3. The rail's `<dl>` and its action stack are separated by a `border-t border-rule pt-4` divider that
   exists in this phase with an empty stack under it. Phase 3 fills the stack; the layout does not
   move.

Phase 3 must also read the two facts in **Handoffs** below before writing its blob paths or its
delete path. Both are load-bearing and neither is in the analysis document.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/album.ts` | modify (`:75`, append after) | new `NINA_CHAT_PHOTO_PAGE_SIZE = 48` |
| `lib/nina/queries.ts` | modify (`:40-44`, `:202`, `:1302`) | import the const; `NinaChatPhotoPage`; `generatedChatPhotoScope` + `listNinaChatPhotos` + `countNinaChatPhotos` |
| `components/admin/chatPhotoModel.ts` | create | `ChatPhoto`, `ChatPhotoPageInfo` — types only |
| `components/admin/ChatPhotoGrid.tsx` | create | the collection header, the grid, the pager, selection state, `userId` pass-through, the notice line — **a seam; phase 3 edits it** |
| `components/admin/ChatPhotoDetail.tsx` | create | the read-only details rail — **a seam; phase 3 edits it too** (its action stack is where Replace and Remove land) |
| `app/admin/photos/page.tsx` | create | the route: gate, read, row→prop map, render |
| `components/admin/AdminNav.tsx` | modify (`:20-24`) | a fourth link |
| `app/admin/page.tsx` | modify (`:1-6`, `:69-79`, `:90-118`) | a fourth hub card with the count |

Eight files where the index estimated ~6; the extra two are `lib/nina/album.ts` (one const, argued
above) and `ChatPhotoDetail.tsx` split out of `ChatPhotoGrid.tsx`. The index's phase table now says
eight.

**Both new components are edited again by phase 3**, which depends on this phase and therefore
rebases rather than races: `ChatPhotoGrid.tsx` gains the Add control at the header seam, and
`ChatPhotoDetail.tsx` gains `<ChatPhotoControls>` in its action stack. Phase 3's Files table names
both (reconciled 2026-09-05 — it originally named only the grid).

---

## Implementation Steps

### Step 1: The page size, and why it is not `NINA_ADMIN_PAGE_SIZE`

**File:** `lib/nina/album.ts:75` — insert immediately after the `NINA_ADMIN_PAGE_SIZE` declaration
and before the `NINA_ADMIN_MANIFEST_MAX` docstring.

**Change:** add one exported constant.

The scope asked me to *"reuse `NINA_ADMIN_PAGE_SIZE` from `lib/nina/album.ts` if it fits; say so
either way."* **It does not fit, and the reason is a column that does not exist.** `NINA_ADMIN_PAGE_SIZE`
is 120 and `lib/nina/album.ts:66-70` states its own arithmetic: 120 tiles is survivable *because*
`nina_avatars.thumb_url` exists and each tile is a 256 px derived JPEG. `nina_message_images` has no
`thumb_url` column at all (analysis, "No thumbnails"), so this grid loads **originals**, and hers are
768×1024 PNGs written by the worker (`scripts/nina-image-worker.ts:445` writes `NINA_IMAGE_WIDTH` /
`NINA_IMAGE_HEIGHT` from `lib/nina/imagerecipe.ts:60-63`, with `NINA_IMAGE_CONTENT_TYPE = 'image/png'`).
Reusing 120 would mean a nine-figure byte count for one page view of an admin screen.

> **Reconciled 2026-09-05 — the "PNG" in that arithmetic is a size argument, not a format
> assumption.** Phase 3 writes admin-supplied photographs as `selfie-<id>.**jpg**` (its D4), so once
> that lands the collection is mixed-container. Nothing in this phase parses a pathname or infers a
> container — `pathname` is displayed, never decoded — and 48 only gets *safer* as JPEGs enter the
> page. The number stands; the sentence describes what the worker writes today.

**Code:**

```ts
/**
 * How many of HER conversation photographs `/admin/photos` renders per page — this round's R2.
 *
 * ── DELIBERATELY NOT `NINA_ADMIN_PAGE_SIZE`, AND THE DIFFERENCE IS A MISSING COLUMN ─────────
 * Eight lines up, 120 is defensible because `nina_avatars.thumb_url` exists: an album page is 120
 * derived 256 px JPEGs, a few megabytes. `nina_message_images` has NO thumbnail column, so this
 * grid loads originals, and hers are 768x1024 PNGs (`NINA_IMAGE_WIDTH`/`NINA_IMAGE_HEIGHT`, written
 * by `finishSelfie`) on the order of a megabyte each. 120 of those is not a page, it is a download.
 *
 * 48 is about seven rows in the admin shell's grid, and roughly a week of generations at phase 12's
 * six-a-day cap — so the common case is one page and the pager is there for the archive, which is
 * the same shape `/admin/nina` bought and not the same number.
 *
 * It is both the DEFAULT and the CEILING in `listNinaChatPhotos`, for the reason
 * `NINA_ADMIN_PAGE_SIZE` is in `listNinaAvatarsInFolder`: a caller may ask for fewer and cannot ask
 * for more, so no hand-edited limit can turn one page into the unpaginated read this constant
 * exists to prevent.
 *
 * ── NO THUMBNAIL IS BEING ADDED TO CLOSE THIS GAP, AND `next/image` IS NOT THE WAY OUT ──────
 * A `thumb_url` column is a migration, which invariant 10 forbids in this plan.
 * `components/nina/NinaPhotoGrid.tsx:56-58` already ruled out `next/image` for Blob-hosted photos
 * outright — it re-optimises finished files on a paid transform quota — and
 * `components/admin/explorer/PhotoGrid.tsx:29-34` reaffirmed it. So the cost here is known, paid,
 * and bounded by this number plus `loading="lazy"`.
 */
export const NINA_CHAT_PHOTO_PAGE_SIZE = 48
```

**Impact:** additive; nothing imports it yet after this step.

---

### Step 2: The paginated read and the count

**File:** `lib/nina/queries.ts` — three edits.

#### 2a — the import block

**File:** `lib/nina/queries.ts:40-44`
**Change:** add `NINA_CHAT_PHOTO_PAGE_SIZE` to the existing `@/lib/nina/album` import, alphabetically.

**Code — the complete replacement for lines 40-44:**

```ts
import {
  NINA_ADMIN_BATCH_MAX,
  NINA_ADMIN_MANIFEST_MAX,
  NINA_ADMIN_PAGE_SIZE,
  NINA_CHAT_PHOTO_PAGE_SIZE,
} from '@/lib/nina/album'
```

#### 2b — the page type

**File:** `lib/nina/queries.ts:202` — insert after the closing `}` of `NinaImageInsert` and before
the `NinaSlotRow` docstring that begins at `:205`.

**Code:**

```ts
/**
 * One page of `/admin/photos` — R2's *"all the photos in in user chat collection with nina (nina
 * generated images)"*.
 *
 * The mirror of `NinaAvatarFolderPage` (:379) and the same argument for `total` being here rather
 * than inferred: the pager renders "1-48 of 137" and offers Newer as well as Older, and an
 * over-shot `?page=` has to be distinguishable from an empty collection. `rows` is `NinaImageRow`
 * unchanged — `imageColumns` is the projection, so the admin surface reads exactly what every
 * other reader of this table reads and no second row shape enters the module.
 */
export interface NinaChatPhotoPage {
  rows: NinaImageRow[]
  total: number
}
```

#### 2c — the queries

**File:** `lib/nina/queries.ts:1302` — insert after the closing `}` of
`getNinaMessageImagesForMessages` and before the `§6 Memory` banner comment at `:1304`.

**Code:**

```ts
/**
 * The predicate that DEFINES "her chat photographs", written once so the listing and the count
 * cannot drift apart.
 *
 * ── `kind`, NEVER `message.role`. THIS IS THE PHASE'S WHOLE CORRECTNESS ──────────────────────
 * R2 says *"nina generated images"*, and `kind = 'generated'` is what that means. It is NOT the
 * same set as "images on messages where role = 'nina'": `lib/nina/actions.ts:512-531` is R26's
 * re-attach path, and when the runner re-attaches one of her selfies it writes
 * `kind: attached.kind` — resolved to `'generated'` at `:167-172` — onto a message whose `role` is
 * `'runner'`. `photoSideOf` (`lib/nina/album.ts:146`) exists for that case and
 * `lib/nina/chatphotos.ts:30-37` documents it in as many words. A `role`-filtered admin listing
 * would silently omit those rows and would then disagree with `/nina/about`'s gallery about which
 * photographs are hers, which is the one failure mode this surface cannot have.
 *
 * ── `kind` IS A RESIDUAL PREDICATE AND THAT IS CORRECT HERE ──────────────────────────────────
 * There is no `(user_id, kind, created_at)` index. Both statements below read
 * `nina_message_images_user_created_idx` — equality on `user_id`, `(created_at desc, id desc)`
 * already in index order — and filter `kind` on the rows that come back. At this table's size (one
 * user, phase 12's six generations a day, single-digit thousands of rows at the horizon) that is a
 * bounded index range scan and the correct read. **An index is not being added:** invariant 10 of
 * this plan forbids a migration, and nothing has measured a need for one.
 */
function generatedChatPhotoScope(userId: string) {
  return and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.kind, 'generated'))
}

/**
 * One page of HER photographs in the conversation, newest first, plus the total — the read behind
 * `/admin/photos`.
 *
 * The paginated sibling of `listNinaMessageImages` (:1240) and NOT a replacement for it: that one
 * is "the newest N, his and hers together" and `/nina/about` needs exactly that. This one is a
 * different question — one page of one side of the collection, with a total — and the analysis
 * recorded that no existing read of this table could answer it (there is no `count` query and no
 * `offset` reader on `nina_message_images`).
 *
 * `kind` is NOT a parameter; see `generatedChatPhotoScope`. Widening this function is how an admin
 * listing quietly becomes "the whole conversation" without anyone deciding to.
 *
 * ── TWO STATEMENTS, RUN CONCURRENTLY ────────────────────────────────────────────────────────
 * Same call as `listNinaAvatarsInFolder` (:1902-1908): a `count(*) OVER ()` window would be one
 * round trip and would report `total: 0` for an over-shot `?page=`, which the pager has to tell
 * apart from an empty collection. So the count is its own statement, in the same `Promise.all`,
 * and it is literally `countNinaChatPhotos` rather than a second copy of the predicate.
 *
 * `NINA_CHAT_PHOTO_PAGE_SIZE` is both the default and the ceiling for `limit`; `offset` is floored
 * at 0 because a negative offset is a Postgres error, not a query.
 */
export async function listNinaChatPhotos(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaChatPhotoPage> {
  const limit = Math.max(
    1,
    Math.min(opts.limit ?? NINA_CHAT_PHOTO_PAGE_SIZE, NINA_CHAT_PHOTO_PAGE_SIZE),
  )
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))

  const [rows, total] = await Promise.all([
    db
      .select(imageColumns)
      .from(ninaMessageImages)
      .where(generatedChatPhotoScope(userId))
      .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(limit)
      .offset(offset),
    countNinaChatPhotos(userId),
  ])

  return { rows, total }
}

/**
 * How many photographs the collection holds, as a number rather than as a list of rows.
 *
 * Two callers, and they are different questions asked of the same predicate: `/admin`'s hub card
 * needs the integer and nothing else — the mistake `countNinaAvatars` (:2336) was written to undo —
 * and `listNinaChatPhotos` needs it beside a page of rows.
 *
 * `id` is the final tiebreak in the sibling's ORDER BY because `created_at` ties for rows written
 * in one statement; it has no bearing here, and is noted so the two are not "fixed" into agreement.
 */
export async function countNinaChatPhotos(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessageImages)
    .where(generatedChatPhotoScope(userId))
  return counted[0]?.total ?? 0
}
```

**Impact:** `lib/nina/queries.ts` gains two exports and one private function. No existing function
changes. `scripts/check-data-layer-invariants.mjs` reads only `lib/db/queries.ts` and is unaffected;
both new exports take `userId` first regardless, which is invariant 3 of the plan.

---

### Step 3: The prop model

**File:** `components/admin/chatPhotoModel.ts` — new file.

**Change:** the serializable shape the RSC boundary carries. Types only, no runtime export — the
same property `components/admin/explorer/model.ts:11-14` relies on, so a Server Component that
imports `ChatPhoto` does not drag a client module into its graph.

**Why this is not `ExplorerPhoto`:** that type carries `folder`, `filename`, `crop`, `isCurrent` and
`thumbUrl` — five fields `nina_message_images` has no counterpart for (no folder column, no filename
column, no crop columns, no `is_current`, no `thumb_url`). Reusing it would mean five permanently
null or fabricated fields, and `PhotoGrid`/`SelectionPane` read four of them.

**Code — the complete file:**

```ts
import type { NinaPhotoSide } from '@/lib/nina/album'

/**
 * What `/admin/photos` knows about one of Nina's chat photographs, and nothing more.
 *
 * Narrower than `NinaImageRow` in one direction and wider in another, and both edges are
 * deliberate. Narrower: `createdAt` is an ISO string here, because a `Date` does not cross the RSC
 * serialization boundary as a `Date` and `app/admin/nina/page.tsx:105` already made this call for
 * the album. Wider than `ExplorerPhoto` would allow: `description` and `prompt` are carried in FULL
 * rather than as a present/absent boolean — see `ChatPhotoDetail` for the argument, which is that
 * `/admin` is the one surface where reading them is the point.
 *
 * Types only. Nothing here is a runtime export, so the Server Component that builds these objects
 * does not pull a client module in with it — `components/admin/explorer/model.ts:11-14`'s property,
 * and the reason the page can `import type { ChatPhoto }` freely.
 */
export interface ChatPhoto {
  id: string
  /**
   * The message this photograph hangs off. `nina_message_images.message_id` is `NOT NULL` with
   * `ON DELETE CASCADE` and the column's own comment says why — *"an image with no message is
   * nothing"* — so this is never absent, and it is the field phase 3's "add" has to mint a row for.
   */
  messageId: string
  /** The ORIGINAL blob. There is no thumbnail on this table; see `NINA_CHAT_PHOTO_PAGE_SIZE`. */
  url: string
  /** Always `'generated'` on this surface — the listing's predicate. Rendered, not assumed. */
  kind: string
  /**
   * `photoSideOf(kind)`, computed on the server exactly as `galleryPhotos` computes it.
   *
   * Always `'hers'` here, which is the point of carrying it: it is a rendered assertion that the
   * `kind` filter and `/nina/about`'s his/hers discriminator agree. A tile reading "his" on this
   * page means the predicate and `photoSideOf` have diverged.
   */
  side: NinaPhotoSide
  /**
   * The blob path. Read-only here; phase 3's replace needs it and it is already a prop.
   *
   * **Never parse it, and never infer a container or a MIME type from it.** It is DISPLAYED — in a
   * `title=` and in the rail's header — and nothing more. On `main` every row here is
   * `nina/<userId>/selfie-<id>.png` from the worker; after phase 3 the same collection also holds
   * `nina/<userId>/selfie-<id>.jpg`, because an admin-supplied photograph is re-encoded to JPEG
   * (phase 3's D4). The collection is mixed-container by design, `NINA_IMAGE_PATHNAME_RE` admits
   * both, and the served content type is the only authority — `lib/nina/vision.ts`'s `toDataUri`
   * reads it back rather than guessing, and says why.
   */
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  /**
   * `glm-4.6v`'s scene prose. **Rendered in full, and only here.** Invariant 6 forbids it reaching
   * a runner-facing caption (`lib/nina/chatphotos.ts:14-19`), not an operator's admin screen.
   */
  description: string | null
  /** The generation sidecar `finishSelfie` wrote. Same reasoning as `description`. */
  prompt: string | null
  /** Position within its message's bubble. `0` for everything the worker wrote. */
  sortOrder: number
  /** ISO 8601. A `Date` does not survive the boundary. */
  createdAt: string
}

/**
 * Where in the collection we are.
 *
 * Offsets rather than a keyset cursor, for `ExplorerPageInfo`'s stated reason: the pager says
 * "1-48 of 137" and offers Newer as well as Older, which a cursor cannot do without a second
 * mechanism. The cost is the same and is the same size — during a concurrent write a tile can
 * repeat across two consecutive pages; nothing is ever skipped.
 */
export interface ChatPhotoPageInfo {
  /** 1-based, clamped by the page before it ever reaches a query. */
  page: number
  pageSize: number
  /** Every `kind = 'generated'` row for this user, not just this page. */
  total: number
}
```

**Impact:** new module; imported by the page (as a type) and by both new client components.

---

### Step 4: The collection, the grid and the pager

**File:** `components/admin/ChatPhotoGrid.tsx` — new file.

**Change:** the client component the page hands its page of rows to. It owns exactly one piece of
state — which tile is selected — and lays the rail out beside the grid the way `FileExplorer.tsx:275-279`
does.

**"A folder or something", read literally and not over-built.** The header row below is a
**folder-shaped surface**: a folder glyph, the collection's name, and its size — the same visual line
`FileExplorer.tsx:216-238` draws for a breadcrumb, marked `aria-current="page"` because it is the
only node there is. It is deliberately **not** a tree: `nina_message_images` has no folder column,
invariant 10 forbids the migration that would add one, and a second folder path grammar for a set
the user described as one bucket is exactly the over-build the scope warned against.
`components/admin/explorer/FolderTree` is not imported and neither is anything else under
`explorer/` — the look is borrowed, the components are not.

**Code — the complete file:**

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

import { ChatPhotoDetail } from '@/components/admin/ChatPhotoDetail'
import { ButtonLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { ChatPhoto, ChatPhotoPageInfo } from './chatPhotoModel'

/**
 * `/admin/photos` — every photograph Nina has put in the conversation, as one collection.
 *
 * ── "JUST PUT THEM INTO A FOLDER OR SOMETHING" ──────────────────────────────────────────────
 * R2's own words, and the honest reading of them is a NAMED COLLECTION, not a tree. `nina_avatars`
 * has a real `folder` column and a `nina_folders` table, which is what earns `/admin/nina` a
 * `FolderTree`. This table has neither, invariant 10 of the plan forbids the migration that would
 * add them, and a second folder-path grammar over a set the user described as one bucket would be
 * a vocabulary nobody asked for. So: one folder row at the top, one grid under it, no nesting.
 *
 * The line borrows `FileExplorer.tsx:216-238`'s breadcrumb LOOK on purpose — the two admin photo
 * surfaces should read as one product — and imports nothing from `components/admin/explorer/`.
 *
 * ── THE GRID LOADS ORIGINALS, KNOWINGLY ─────────────────────────────────────────────────────
 * There is no `thumb_url` on `nina_message_images`, so `photo.url` is all there is.
 * `components/nina/NinaPhotoGrid.tsx:56-58` ruled `next/image` out for Blob-hosted photos — it
 * re-optimises finished files on a paid transform quota — and this follows that precedent rather
 * than re-opening it. `loading="lazy"` plus `NINA_CHAT_PHOTO_PAGE_SIZE` (48, argued at its
 * declaration) is the whole mitigation, and it is a known cost, not an oversight.
 *
 * ── READ-ONLY, THIS PHASE ───────────────────────────────────────────────────────────────────
 * Nothing here writes. No Server Action is imported, no form is submitted, no `useTransition`
 * exists. Phase 3 adds replace / remove in `ChatPhotoDetail` and add at the SEAM below.
 */

/** The collection's name, spelled once. The folder row and the page heading both read it. */
export const CHAT_PHOTO_COLLECTION_LABEL = 'Nina generated'

/**
 * The only search parameter this route has. Built here rather than passed in as a `hrefForPage`
 * prop the way `PhotoGrid` takes one: the explorer needs the page's help because its links also
 * carry `?folder=`, and this one has nothing to carry.
 */
function hrefForPage(page: number): string {
  return page <= 1 ? '/admin/photos' : `/admin/photos?page=${page}`
}

export function ChatPhotoGrid({
  photos,
  page,
  userId,
}: {
  photos: readonly ChatPhoto[]
  page: ChatPhotoPageInfo
  /**
   * SEAM — PHASE 3. The signed-in admin's `user.id`, straight from the server page's
   * `requireAdmin()`. **Phase 2 renders it nowhere**; it exists so phase 3's Add and Replace can
   * build `adminChatPhotoPathname(userId, id)` without a client-side session read — a user id that
   * ends up inside a Blob pathname has to come from the server. `app/admin/nina/page.tsx:57-59`
   * threads `shareOrigin` into `FileExplorer` the same way and for the same class of reason.
   */
  userId: string
}) {
  /*
   * The ONE piece of state on this screen, and there is deliberately no optimistic copy of the
   * rows: `SelectionPane`'s docstring calls that *"the one class of bug this screen could plausibly
   * have shipped"*, and the same defence applies here for the same reason — the page is
   * `force-dynamic`, so the rows arrive from the server on every render and there is nothing to
   * keep in sync.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /*
   * One sentence about the last removal, held HERE rather than in the rail.
   *
   * SEAM — PHASE 3, and the reason it is at this level: phase 3's remove action can answer *"the
   * file is still used elsewhere, so it was kept in the store"* (its D5 — a Blob object shared with
   * another row or with her avatar must not be deleted). The rail unmounts the moment
   * `revalidatePath`'s RSC payload arrives without the removed row, so a note rendered inside the
   * rail is destroyed before it can be read. This component does not unmount, so the note survives.
   *
   * Empty and unwritten in phase 2 — nothing here removes anything — and rendered under the
   * collection header below so the layout does not move when phase 3 starts writing it.
   */
  const [notice, setNotice] = useState<string | null>(null)

  /*
   * Resolved against THIS page's rows, so a selection made before a pager click simply falls away
   * rather than pointing at a row that is no longer on screen. `FileExplorer` behaves the same way
   * and for the same reason.
   */
  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))

  return (
    <div>
      {/*
       * THE FOLDER ROW. One node, always current, never a link — there is nowhere else to go.
       *
       * SEAM — PHASE 3. "Add a photo" belongs here, at the right of this row, beside the count: it
       * is a collection-level action and needs nothing from a selection. Its handler mints the
       * `nina_messages` + `nina_message_images` pair `finishSelfie` writes; nothing about this row
       * has to change to hold a button.
       */}
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-rule pb-3">
        <nav aria-label="Collection" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
            <li className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="text-ink-3">
                &#128193;
              </span>
              <span className="truncate font-semibold text-ink" aria-current="page">
                {CHAT_PHOTO_COLLECTION_LABEL}
              </span>
            </li>
          </ol>
        </nav>
        <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
          {page.total} photo{page.total === 1 ? '' : 's'}
        </span>
      </div>

      {/* SEAM — PHASE 3. The notice line. Never rendered in phase 2 (`notice` is always null), so
          it costs nothing and moves nothing until phase 3's Remove writes it. */}
      {notice !== null && (
        <p className="mb-4 text-[12px] font-medium text-ink-2">{notice}</p>
      )}

      <div
        className={cn(
          'grid items-start gap-5',
          selected != null ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'lg:grid-cols-1',
        )}
      >
        {/* `min-w-0` is load-bearing on any track holding a wide grid — `app/admin/layout.tsx:172`
            makes the same note about the layout's own main column. */}
        <div className="min-w-0">
          {photos.length === 0 ? (
            <EmptyState
              title={page.page > 1 ? 'Nothing on this page' : 'She has not sent a photo yet'}
              description={
                page.page > 1
                  ? 'The collection is not that long any more.'
                  : 'Every photo Nina generates in the chat lands here automatically.'
              }
              action={
                page.page > 1 ? (
                  /* `ButtonLink`, not a `Button` inside a `Link`: a <button> nested in an <a> is
                     invalid HTML and the barrel exports this exact component for this exact case. */
                  <ButtonLink href={hrefForPage(1)} size="md" variant="secondary">
                    Go to the first page
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {photos.map((photo) => {
                  const isSelected = photo.id === selectedId
                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : photo.id)}
                        aria-pressed={isSelected}
                        title={photo.pathname}
                        className={cn(
                          'block w-full rounded-chip border p-1 text-left transition-[opacity,transform] active:scale-[0.985]',
                          isSelected
                            ? 'border-accent bg-accent-soft'
                            : 'border-rule bg-card hover:bg-paper-2',
                        )}
                      >
                        <span className="relative block aspect-[3/4] overflow-hidden rounded-[6px] bg-paper-2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted,
                              deliberately un-transformed, and this table has no thumbnail column;
                              see the header. */}
                          <img
                            src={photo.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            className="size-full object-cover"
                          />
                        </span>
                        <span className="mt-1 block truncate text-[10px] font-medium text-ink-3 tabular-nums">
                          {photo.createdAt.slice(0, 10)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-3">
                {page.page > 1 ? (
                  <Link
                    href={hrefForPage(page.page - 1)}
                    className="text-[12px] font-semibold text-accent"
                    rel="prev"
                  >
                    &lsaquo; Newer
                  </Link>
                ) : (
                  <span className="text-[12px] font-semibold text-ink-3">&lsaquo; Newer</span>
                )}

                <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
                  {first}&ndash;{last} of {page.total}
                </span>

                {page.page < lastPage ? (
                  <Link
                    href={hrefForPage(page.page + 1)}
                    className="text-[12px] font-semibold text-accent"
                    rel="next"
                  >
                    Older &rsaquo;
                  </Link>
                ) : (
                  <span className="text-[12px] font-semibold text-ink-3">Older &rsaquo;</span>
                )}
              </div>
            </>
          )}
        </div>

        {selected != null && (
          <ChatPhotoDetail
            photo={selected}
            userId={userId}
            onClose={() => setSelectedId(null)}
            onRemoved={(note) => {
              setSelectedId(null)
              setNotice(note)
            }}
          />
        )}
      </div>
    </div>
  )
}
```

**Impact:** new client component. `bg-accent-soft`, `rounded-chip`, `rounded-card`, `border-rule`,
`bg-card`, `bg-paper-2`, `text-ink*` are all in use in `components/admin/explorer/PhotoGrid.tsx`
today, so no new token is introduced.

---

### Step 5: The details rail — and the seam

**File:** `components/admin/ChatPhotoDetail.tsx` — new file.

**Change:** the read-only rail. It shows the whole row, including the two text fields
`SelectionPane` deliberately refuses to print.

**Why `description` and `prompt` are rendered in full here, and why that is not a violation.**
`components/admin/explorer/SelectionPane.tsx:44-49` prints only *whether* a description exists,
citing invariant 5. That is a rule about **the album**, whose descriptions feed the avatar
announcement path. This plan's invariant 6 states the rule precisely: `description` is `glm-4.6v`'s
private prose *whose only consumer is Nina's prompt*, and **`/admin` may display it; nothing it
renders may reach a runner-facing caption**. Nothing on this page reaches a runner-facing caption —
it is `/admin`, gated by `requireAdmin()`, `robots: { index: false }` from
`app/admin/layout.tsx:159-163`. And the scope is explicit that reading them is the point: *"`description`
is glm-4.6v's scene prose and `prompt` is the generation sidecar — /admin is exactly where the
operator reads those."*

**Code — the complete file:**

```tsx
'use client'

import type { ChatPhoto } from './chatPhotoModel'

/**
 * One chat photograph, in full — what it is, where it sits in the conversation, and what she was
 * told to draw.
 *
 * ── THE SHAPE IS `SelectionPane`'s, THE CONTENT IS NOT ──────────────────────────────────────
 * Same `<aside>`, same rounded card, same close control, same `<dl>` over a `border-t` divider,
 * same action stack under a second divider. Nothing is imported from
 * `components/admin/explorer/` — the album's rail is about FRAMING a face into a circle
 * (`CropStudio`, two `CircleFrame` sanity checks) and this table has no crop columns and no
 * profile picture to be. The look is shared; the code is not.
 *
 * ── `description` AND `prompt` ARE PRINTED, DELIBERATELY ────────────────────────────────────
 * `SelectionPane.tsx:44-49` prints only whether a description exists. That is the right call for
 * the album. It is the wrong call here, and the plan's invariant 6 says why with precision: the
 * prose is private to Nina's PROMPT, and `/admin` may display it — what is forbidden is it reaching
 * a RUNNER-FACING caption. This page is behind `requireAdmin()` and `robots: { index: false }`, and
 * reading exactly these two fields is why an operator opens this screen: `description` is what
 * `glm-4.6v` says the photograph shows, `prompt` is the sidecar `finishSelfie` recorded. Neither
 * is passed to any surface the runner sees, here or anywhere downstream of here.
 *
 * ── READ-ONLY, THIS PHASE ───────────────────────────────────────────────────────────────────
 * No Server Action import, no `useTransition`, no `Button`. See the SEAM at the bottom.
 */

export function ChatPhotoDetail({
  photo,
  userId,
  onClose,
  onRemoved,
}: {
  photo: ChatPhoto
  /**
   * SEAM — PHASE 3. Forwarded from `ChatPhotoGrid`, which got it from the server page. **Unread by
   * this phase** — phase 3's Replace needs it to build `adminChatPhotoPathname(userId, id)`, and a
   * user id destined for a Blob pathname must come from the server rather than from a client-side
   * session read.
   */
  userId: string
  onClose: () => void
  /**
   * Selection has to be dropped by the owner when the row is GONE, which is a different event from
   * closing the rail — `SelectionPane.tsx:57-60`'s exact split.
   *
   * SEAM — PHASE 3. Nothing calls this in phase 2, on purpose: it is wired end to end now so that
   * phase 3's "Remove" is a button and a handler, not a button plus a prop plus a call-site change
   * plus a state lift.
   *
   * **It carries the action's `note`** (`null` when there is nothing to say). Phase 3's remove can
   * answer *"the file is still used elsewhere, so it was kept in the store"*, and this rail is gone
   * from the tree by the time that sentence would render — so the grid holds it. See the seam table.
   */
  onRemoved: (note: string | null) => void
}) {
  void userId
  void onRemoved

  return (
    <aside className="rounded-card border border-rule bg-card p-5 lg:sticky lg:top-8">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {new Date(photo.createdAt).toLocaleString()}
          </p>
          <p className="truncate text-[12px] font-medium text-ink-3" title={photo.pathname}>
            {photo.pathname}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the details pane"
          className="shrink-0 px-1 text-[13px] font-semibold text-ink-3"
        >
          &times;
        </button>
      </div>

      <div className="overflow-hidden rounded-field bg-paper-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and deliberately
            un-transformed; the same call `components/nina/NinaPhotoGrid.tsx:56-58` recorded. */}
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="block max-h-[320px] w-full object-contain"
        />
      </div>

      <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
        <div className="flex gap-2">
          <dt>Whose</dt>
          {/* `side` is `photoSideOf(kind)`, computed on the server. It reads "hers" for every row
              this page can show; if it ever reads "his", the listing's predicate and the app's
              his/hers discriminator have diverged. */}
          <dd className="text-ink-2">
            {photo.side === 'hers' ? 'Hers' : 'His'} &mdash; {photo.kind}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Pixels</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.width ?? '?'} &times; {photo.height ?? '?'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Size</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.bytes == null ? 'Unrecorded' : `${Math.round(photo.bytes / 1024)} KB`}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Message</dt>
          <dd className="truncate text-ink-2" title={photo.messageId}>
            {photo.messageId}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Position</dt>
          <dd className="text-ink-2 tabular-nums">#{photo.sortOrder} in its bubble</dd>
        </div>
        <div className="flex gap-2">
          <dt>Row</dt>
          <dd className="truncate text-ink-2" title={photo.id}>
            {photo.id}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-3 border-t border-rule pt-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            What she can see in it
          </p>
          {/*
            * The fallback copy is deliberately about the ROW's state and not about a permanent
            * defect. Reconciled 2026-09-05 against phase 3's D2: after an admin Add or Replace this
            * field is NULL for the few seconds `scheduleChatPhotoDescribe`'s `after()` pass takes,
            * and then fills in on the next load. A sentence reading "she cannot talk about this
            * photo" would be a lie during that window — and would read as a bug for a photograph
            * that is about to be fine. On the send path a null description degrades honestly
            * anyway: `lib/nina/actions.ts:604` substitutes `NINA_DESCRIPTION_UNAVAILABLE`.
            */}
          <p className="text-[12px] leading-relaxed font-medium text-ink-2">
            {photo.description ??
              'Not described yet. She cannot talk about this photo until it is — reload in a moment if it was just added or replaced.'}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            What she was asked to draw
          </p>
          {/*
            * `prompt` is NULL forever on a photograph the operator added or replaced — there was no
            * generation, so there is no sidecar, and phase 3's D2 nulls it on Replace rather than
            * leaving prose about bytes that are gone. That is honest and it is invisible to the
            * runner: every `kind = 'upload'` row on `main` is already null here. `/admin` is not
            * downstream of invariant 7, so this is not an "admin marker".
            */}
          <p className="text-[12px] leading-relaxed font-medium break-words text-ink-2">
            {photo.prompt ?? 'No sidecar on this row.'}
          </p>
        </div>
      </div>

      {/*
       * SEAM — PHASE 3. The action stack. Empty in phase 2 and the divider above it exists anyway,
       * so filling it moves nothing on screen.
       *
       * Three controls land here and at the collection header in `ChatPhotoGrid`:
       *   1. Replace  — first in this stack. Needs `photo.id`, `photo.pathname` and `userId`; all
       *      three are props already. It swaps the bytes behind THIS row and keeps the row, its
       *      message, its `created_at` and its place in the conversation.
       *   2. Remove   — last in this stack. Needs `photo.id` and `userId`, and calls
       *      `onRemoved(note)` on success, which is already threaded from the grid.
       *   3. Add      — NOT here. It is a collection-level action and its seam is the header row in
       *      `ChatPhotoGrid`.
       *
       * Phase 3 fills this with a single `<ChatPhotoControls userId={userId} photoId={photo.id}
       * onRemoved={onRemoved} />`, which is what consumes the two `void` statements at the top.
       *
       * No confirmation on any of the three. R1's ruling is a property of this admin surface, not
       * of one page: "i am the only one using this app, no need for all these bullshit
       * confirmation."
       */}
      <div className="mt-4 space-y-2 border-t border-rule pt-4" />
    </aside>
  )
}
```

> **Note on `void userId` / `void onRemoved`.** Two lines, so `@typescript-eslint/no-unused-vars`
> does not fail `npm run lint` on props that exist for phase 3. **Both disappear in phase 3's Step
> 9**, which renders `<ChatPhotoControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />`
> in the seam block below and consumes both. The alternative — omitting the props now — is the
> restructuring this seam exists to avoid. If the repo's eslint config does not flag unused
> destructured props, delete the lines.

**Impact:** new client component. The rail is `lg:sticky lg:top-8`, matching `AdminNav`'s stickiness
so a long grid does not scroll the details out of reach.

---

### Step 6: The route

**File:** `app/admin/photos/page.tsx` — new file.

**Change:** the Server Component. Gate first, read, map rows to props on the server, render.

**Code — the complete file:**

```tsx
import { ChatPhotoGrid, CHAT_PHOTO_COLLECTION_LABEL } from '@/components/admin/ChatPhotoGrid'
import type { ChatPhoto } from '@/components/admin/chatPhotoModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_CHAT_PHOTO_PAGE_SIZE, photoSideOf } from '@/lib/nina/album'
import { listNinaChatPhotos } from '@/lib/nina/queries'

/**
 * `/admin/photos` — R2: *"make sure all the photos in in user chat collection with nina (nina
 * generated images) are shown in admin page as well. just put them into a folder or something."*
 *
 * A Server Component that does two things: gate, and hand one client component what it needs. The
 * same shape as `app/admin/nina/page.tsx`, over a different table.
 *
 * ── IT IS A DIFFERENT TABLE, AND THAT IS THE WHOLE REASON THIS ROUTE EXISTS ─────────────────
 * `/admin/nina` is `nina_avatars` — her PROFILE album, which has a real `folder` column, a
 * `nina_folders` table, thumbnails and an `is_current` row. This is `nina_message_images`, the
 * conversation's photographs, which has none of those. R2 is about the second one and the admin
 * page showed only the first.
 *
 * ── THE SET IS `kind = 'generated'`, NOT `role = 'nina'` ────────────────────────────────────
 * `listNinaChatPhotos` filters on `kind` for the reason its own docstring gives: R26's re-attach
 * path (`lib/nina/actions.ts:512-531`) writes `kind: 'generated'` onto a message whose `role` is
 * `'runner'`, so a role filter would omit her re-attached selfies and this page would disagree with
 * `/nina/about`'s gallery about which photographs are hers.
 *
 * ── `searchParams` IS A PROMISE, AND `PageProps` IS HOW THIS REPO TYPES IT ──────────────────
 * Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" — *"You can type pages with `PageProps` to get strongly typed `params` and `searchParams`
 * from the route literal. `PageProps` is a globally available helper."* The same page states that
 * `searchParams` is a promise that must be awaited, that a repeated parameter arrives as an array
 * (hence `readOne`), and that reading it opts the page into dynamic rendering. Types are generated
 * by `next dev` / `next build` / `next typegen`, so `npm run typecheck` — which runs typegen first
 * — is the command that proves this file, and a bare `tsc --noEmit` is not.
 *
 * `force-dynamic` therefore stays and its job is NOT `searchParams`: it is what
 * `app/admin/nina/page.tsx:33-36` says it is — the collection is per-request state that must
 * reflect the action that just ran, and phase 3's `revalidatePath('/admin/photos')` is what will
 * make that immediate.
 *
 * ── `?page=` IS VALIDATED, NOT TRUSTED ──────────────────────────────────────────────────────
 * Parsed, floored at 1, capped at `PAGE_CEILING`, exactly as `/admin/nina` does it, so a hand-typed
 * `?page=99999999` cannot ask the database for a hundred-million-row offset. It is not a security
 * boundary — `requireAdmin()` on line 1 is, and the read below is scoped to the id it returns.
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is even awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's
 * are the only gates on a read-only page; `app/admin/layout.tsx:150-156` explains why both exist.
 *
 * ── READ-ONLY ───────────────────────────────────────────────────────────────────────────────
 * Phase 2 renders no control that writes. Phase 3 adds replace / add / remove as Server Actions in
 * `lib/admin/chatPhotoActions.ts` and wires them at the seams named in `ChatPhotoDetail` and
 * `ChatPhotoGrid`.
 */

export const dynamic = 'force-dynamic'

/** A hand-typed `?page=` cannot ask for an offset no collection will ever reach. */
const PAGE_CEILING = 1000

export default async function AdminChatPhotosPage(props: PageProps<'/admin/photos'>) {
  const { userId } = await requireAdmin()

  const params = await props.searchParams
  const page = readPage(readOne(params.page))

  const listed = await listNinaChatPhotos(userId, {
    limit: NINA_CHAT_PHOTO_PAGE_SIZE,
    offset: (page - 1) * NINA_CHAT_PHOTO_PAGE_SIZE,
  })

  /*
   * The row -> prop mapping is HERE, on the server, for `app/admin/nina/page.tsx:83-91`'s reason:
   * a client component receives plain serializable props and nothing else. `createdAt` is a `Date`
   * on `NinaImageRow` and does not cross the boundary as one, so it is rendered to ISO here;
   * `side` is `photoSideOf(kind)` computed here rather than in the browser, which is what
   * `galleryPhotos` does with the same field for the same reason. No drizzle type and no zod schema
   * crosses this line.
   */
  const photos: ChatPhoto[] = listed.rows.map((row) => ({
    id: row.id,
    messageId: row.messageId,
    url: row.blobUrl,
    kind: row.kind,
    side: photoSideOf(row.kind),
    pathname: row.pathname,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    description: row.description,
    prompt: row.prompt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Chat photos</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every photograph Nina has generated in the conversation, newest first, in one collection
          called {CHAT_PHOTO_COLLECTION_LABEL}. This is not her profile album &mdash; that lives
          under Nina&rsquo;s album and is a different set of pictures. Click one to read what she
          sees in it and what she was asked to draw.
        </p>
      </header>

      {/*
        * `userId` is handed down from `requireAdmin()` above and is rendered nowhere. SEAM — PHASE
        * 3: its Add and Replace build `adminChatPhotoPathname(userId, id)` out of it, and a user id
        * that reaches a Blob pathname must come from the server. `app/admin/nina/page.tsx:57-59`
        * threads `shareOrigin` into `FileExplorer` the same way.
        */}
      <ChatPhotoGrid
        photos={photos}
        userId={userId}
        page={{
          page,
          pageSize: NINA_CHAT_PHOTO_PAGE_SIZE,
          total: listed.total,
        }}
      />
    </div>
  )
}

/**
 * `searchParams` values are `string | string[] | undefined` — a repeated parameter arrives as an
 * array, which the framework doc's own table spells out (`/shop?a=1&a=2` -> `Promise<{ a: ['1','2'] }>`).
 * The first wins; there is no meaning to assign to a second `?page=`.
 */
function readOne(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** 1-based, floored at 1, capped at `PAGE_CEILING`. Garbage reads as page 1. */
function readPage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, PAGE_CEILING)
}
```

**Impact:** new route. Renders inside `app/admin/layout.tsx`'s desktop grid — no `AppShell`, no
`TabBar`, no 470 px column. The layout's `<main className="min-w-0">` plus this component's own
`min-w-0` on the grid track are what keep a wide photo grid scrolling inside its track instead of
blowing it out.

---

### Step 7: The fourth nav link

**File:** `components/admin/AdminNav.tsx:20-24`

**Change:** one entry, placed directly after "Nina's album" so the two photo surfaces sit together
and the difference between them is read as a pair rather than discovered.

**Code — the complete replacement for the `LINKS` declaration:**

```tsx
const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/nina', label: "Nina's album" },
  /*
   * R2's route. Deliberately named for the CONVERSATION and not for the person: the entry above it
   * is `nina_avatars` (her profile album) and this one is `nina_message_images` (the photographs in
   * the chat). Two different tables, adjacent in the nav so the distinction is legible, and the
   * labels are the only thing carrying it — which is the reason the segment can stay `/admin/photos`.
   */
  { href: '/admin/photos', label: 'Chat photos' },
  { href: '/admin/memory', label: 'Memory' },
] as const
```

**Impact:** the file's docstring says active-link highlighting can be revisited *"when there are
five"*. There are four. Left alone — that is phase 16's note and not this phase's work.

---

### Step 8: The third hub card

> **Reconciled 2026-09-05.** `app/admin/page.tsx` has **two** `<Card>`s on `7cec803`, so this adds
> the **third**, not the fourth. (The AdminNav change in Step 7 *is* a fourth LINK — three links
> exist today. The two counts are different numbers and both are now stated correctly.) The plan
> index already said "third"; this heading was the drifting half and has been corrected here.

**File:** `app/admin/page.tsx` — three edits, given below as complete replacements.

**8a — the import block (`:1-6`)**

```tsx
import Link from 'next/link'

import { Card } from '@/components/ui'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { getAdminUser } from '@/lib/admin/users'
import { countNinaAvatars, countNinaChatPhotos, getCurrentNinaAvatar } from '@/lib/nina/queries'
```

**8b — the read (`:69-79`)** — complete replacement for the `Promise.all`:

```tsx
  const [albumCount, current, me, chatPhotoCount] = await Promise.all([
    /*
     * A COUNT, not the album. This page renders `albumCount` and nothing else about the rows, and
     * F34 R1 makes the album *"hundreds of profile pics"* — so `listNinaAvatars(userId)` here was
     * fetching every column of every row, including the `description` prose, to print one integer
     * on a `force-dynamic` page the operator opens constantly.
     */
    countNinaAvatars(userId),
    getCurrentNinaAvatar(userId),
    getAdminUser(userId),
    /*
     * R2's count, and it is a count for the same reason the one above it is: this card prints one
     * integer. `countNinaChatPhotos` shares its `kind = 'generated'` predicate with
     * `listNinaChatPhotos` through one private function, so the number here and the number on
     * `/admin/photos` cannot disagree.
     */
    countNinaChatPhotos(userId),
  ])
```

**8c — the card grid (`:90-118`)** — complete replacement, the existing three cards unchanged and a
fourth appended:

```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Nina&rsquo;s album</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {albumCount === 0
              ? 'Empty — she is still using the committed photo.'
              : `${albumCount} photo${albumCount === 1 ? '' : 's'}, ${
                  current ? 'one current' : 'none current'
                }.`}
          </p>
          <Link href="/admin/nina" className="text-[13px] font-semibold text-accent">
            Manage the album &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Chat photos</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {chatPhotoCount === 0
              ? 'She has not sent a photo in the chat yet.'
              : `${chatPhotoCount} photo${
                  chatPhotoCount === 1 ? '' : 's'
                } she has generated in the conversation.`}
          </p>
          <Link href="/admin/photos" className="text-[13px] font-semibold text-accent">
            Open the collection &rarr;
          </Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink">Memory</h2>
          <p className="mt-1 mb-4 text-[13px] font-medium text-ink-2">
            {me === null
              ? 'Nothing kept yet.'
              : `${me.slots} slot${me.slots === 1 ? '' : 's'} and ${me.facts} ledger row${
                  me.facts === 1 ? '' : 's'
                } for your account.`}
          </p>
          <Link href="/admin/memory" className="text-[13px] font-semibold text-accent">
            Read and edit her memory &rarr;
          </Link>
        </Card>
      </div>
```

> **Reconciler note:** this leaves **three** cards, not four. The plan index calls for *"a fourth
> hub card"*; there were two on `main` (album, memory) and this adds the third. The index's count is
> off by one against the file as it exists at `7cec803`. The new card is placed **between** album and
> memory to mirror the nav order from Step 7. The `sm:grid-cols-2` grid holds three cards as 2 + 1,
> which is the same layout `/admin/nina`'s own screens accept and needs no change.
>
> **Phase 1 also reads `app/admin/page.tsx`** — the analysis marks it `1 (read-only)` in R1's
> reference table and phase 1's *Does not touch* list names it explicitly. So this file is phase 2's
> alone and there is no concurrent write. Its Memory card's copy is untouched here.

**Impact:** one extra `count(*)` on the hub, issued inside the existing `Promise.all`, reading
`nina_message_images_user_created_idx`.

---

## Verification

The worktree has **no `node_modules`** (`/home/miftah/.worktrees/run-insights/admin-memory-and-chat-photos/node_modules`
does not exist). Install first or the commands below will not run:

**Setup:** `cd /home/miftah/.worktrees/run-insights/admin-memory-and-chat-photos && npm ci`

**Build / typecheck:**

```
npm run typecheck
```

**This exact command, not `npx tsc --noEmit`.** `typecheck` is `next typegen && tsc --noEmit`, and
`PageProps<'/admin/photos'>` does not exist as a type until typegen has seen the new route directory
— the framework doc says so in as many words (*"Types are generated during `next dev`, `next build`,
or with `next typegen`"*).

**Lint and format** (CI runs `format:check` before `lint`, so an unformatted file fails the build
even when it compiles):

```
npm run format
npm run lint
```

**Tests:**

```
npm test
```

No new test file. Every function this phase adds is either a database read (vitest runs
`environment: 'node'` with no database) or a React component (no jsdom — `lib/nina/album.ts:6-9`
records that constraint), so there is nothing here that the suite's shape can assert. The one pure
thing added is a constant. The existing suite must stay green: nothing this phase touches is under
test, so a red suite means an import cycle or a type error, not a behaviour change.

**The invariant checkers CI runs:**

```
npm run ci:openrouter-guard
npm run ci:data-layer-guard
npm run ci:client-secret-guard
npm run ci:f08-guard
npm run ci:llm-payload-guard
npm run ci:f11-guard
npm run badges:check
```

`ci:data-layer-guard` reads only `lib/db/queries.ts` and is structurally unaffected;
`ci:client-secret-guard` is the one to watch, because both new components are `'use client'` — they
name no secret and no build-time public variable, and every block comment in them uses the leading
`*` continuation style the guard's comment scanner recognises.

**Full build:** `npm run build`

**Manual check** (`npm run dev`, signed in as the admin):

1. `/admin` shows a **Chat photos** card with a count between the album card and the memory card.
2. The sidebar shows four links; "Chat photos" opens `/admin/photos`.
3. `/admin/photos` shows the folder row reading `Nina generated`, the count, and a grid of her
   photographs newest first.
4. Clicking a tile opens the rail on the right; it shows the scene prose and the sidecar prompt in
   full, the pixel dimensions, the size in KB, the message id and the row id. Clicking the same tile
   again, or the `×`, closes it.
5. `?page=2` pages; `?page=0`, `?page=-3` and `?page=abc` all render page 1; `?page=99999999` renders
   page 1000's (empty) result with "Go to the first page", not a database error.
6. **The correctness check that matters:** open `/nina/about`, count the photographs on **her** side
   of the gallery strip, and confirm `/admin/photos`'s total matches — including any selfie the
   runner has re-attached to one of his own messages, which is the row a `role` filter would have
   dropped. If a re-attached photo exists, its `blobUrl` appears twice in the collection (once for
   the worker's original row, once for the re-attached row) with two different row ids. **That is
   correct** — they are two rows in the conversation — and the grid keys on `id`, not on `url`.
7. `/nina`, `/nina/about` and the chat bubbles are unchanged. Nothing on this page writes.

**Exit criteria:** `/admin/photos` lists every `kind = 'generated'` row for the signed-in admin,
newest first, 48 to a page, reachable from both the sidebar and the hub, with a details rail that
shows the whole row. The listing includes rows attached to runner messages. The page renders no
control that writes, imports no Server Action, and holds no `useTransition`. `npm run typecheck`,
`npm run lint`, `npm run format:check`, `npm test`, all six guards and `npm run build` are green.

---

## Handoffs

Work found but deliberately left to another phase. The first two are **findings phase 3 needs and
that are not in the analysis document** — both were read out of the source in this phase and both
would be discovered late and expensively otherwise.

1. **PHASE 3 — her generated blobs are NOT under `nina/<userId>/chat/`.** The analysis states
   (*"Data persistence"*, and again in R2's key considerations) that a chat photo's pathname is
   `nina/<userId>/chat/<id>.jpg` from `ninaChatPathname` (`lib/nina/images.ts:85`), and concludes
   that the upload route needs `isNinaChatRequestPathname` added as a third accepted shape. **That is
   true only for `kind = 'upload'` rows.** The rows this phase lists — the ones phase 3 must replace
   and remove — are written by `finishSelfie`, which calls `ninaImagePathname`
   (`lib/nina/imagerecipe.ts:126`): `nina/<userId>/selfie-<id>.png`, content type
   `NINA_IMAGE_CONTENT_TYPE = 'image/png'` (`:63`), 768×1024 (`:60-61`). Two different path
   grammars, two different content types, two different modules. Phase 3 has to decide which one an
   admin-supplied photograph is written under and say so — and note that `isNinaChatRequestPathname`
   requires exactly four `/`-separated segments ending `.jpg`, so a `selfie-<id>.png` path does not
   satisfy it. This is a design decision phase 3 owns; it is flagged here, not made here.
   **RESOLVED — phase 3 chose `nina/<userId>/selfie-<id>.jpg`**: the worker's prefix and `selfie-`
   segment, JPEG rather than PNG (its D4). Approved at reconciliation. Consequence for this phase:
   the collection becomes mixed-container, and nothing here may infer a container or MIME type from
   a pathname. It does not — `pathname` is displayed and never parsed; the two places that mention
   PNG (Step 1's size arithmetic and the `ChatPhoto.pathname` docstring) now say so explicitly.

2. **PHASE 3 — a re-attached photograph SHARES its blob with another row, so "remove deletes the
   blob" is not unconditionally safe.** `lib/nina/actions.ts:512-531` writes the R26 row with
   `blobUrl: attached.blobUrl` and `pathname: attached.pathname` taken straight off the source row
   (`:167-172` for the avatar branch, `:180+` for the chat-image branch). **No bytes are copied — the
   new row points at the existing object**, and its own docstring says so: *"an ordinary chat photo
   that happens to point at a blob we already had."* So a `del()` on removal can orphan a row that
   is still live: remove the re-attached copy and the worker's original loses its picture, or vice
   versa, or the album's avatar does. Plan invariant 8 (*"no orphaned blobs"*) and this pull in
   opposite directions and phase 3 must resolve it explicitly — the obvious shape is "delete the
   object only when no other `nina_message_images` row and no `nina_avatars` row references this
   `pathname`", which is a query phase 3 has to add. **Not fixed here: this phase is read-only.**

3. **PHASE 3 — the seam.** Named exhaustively in the Interface Contract above. Reconciled
   2026-09-05, and phase 3's Step 9 now quotes these signatures verbatim:
   `ChatPhotoGrid` takes `userId: string`, forwards it to `ChatPhotoDetail`, and holds a `notice`
   line under the collection header; `ChatPhotoDetail`'s `onRemoved` is
   `(note: string | null) => void`. `void userId` and `void onRemoved` both disappear when phase 3
   renders `<ChatPhotoControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />` in the
   action stack.

4. **NOT THIS SET — no thumbnails on `nina_message_images`.** The grid loads originals because there
   is no `thumb_url` column, which is why the page size is 48 and not 120. Adding one is a migration
   and invariant 10 forbids a migration in this plan. If the collection ever grows past a few
   hundred rows this becomes the thing to fix, and the fix has a worked precedent in
   `nina_avatars.thumb_url` + `components/admin/explorer/thumbnail.ts`. Recorded, not scheduled.

5. **NOT THIS SET — `components/admin/AdminNav.tsx`'s docstring says active-link highlighting can be
   revisited *"when there are five"* links.** There are now four. Left exactly as it is: a drive-by
   rewrite of a nav into a client component to bold one word is the scope creep this phase declines.

6. **RESOLVED — the hub card count.** `app/admin/page.tsx` has two `<Card>`s on `7cec803`, so this
   adds the **third**. The index already said "third"; this plan's Step 8 heading said "fourth" and
   has been corrected. The nav change in Step 7 is separately a **fourth link** (three exist today);
   the two counts are different numbers and both now read correctly.

---

## Rollback

This phase is a self-contained commit on `feature/admin-memory-and-chat-photos`. `git revert` it.

Nothing to undo beyond code: **no migration, no data write, no Blob object created or deleted.**
Every statement this phase adds is a `SELECT`. Reverting removes a route, a nav link, a hub card, two
query functions, one constant and three new component/model files, and restores `lib/nina/queries.ts`,
`lib/nina/album.ts`, `components/admin/AdminNav.tsx` and `app/admin/page.tsx` to their `7cec803`
state. No other phase's file is touched, so the revert is independent of phase 1 in both directions.

**It is not independent of phase 3 in one direction:** phase 3 edits `ChatPhotoGrid.tsx` and
`ChatPhotoDetail.tsx` and imports `listNinaChatPhotos`'s neighbours, so if phase 3 has landed,
reverting phase 2 alone breaks the tree. Revert phase 3 first — which the plan index already states
under Rollback.
