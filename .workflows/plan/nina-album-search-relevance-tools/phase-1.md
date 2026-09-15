# Phase 1: Viewer button + cross-folder navigation to the description panel

**Plan set:** `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md`
**Analysis:** `20260915-140828-SBI4_code_analyzer.md`
**Satisfies:** R1 — an icon button in the full-screen viewer that lands the operator on that exact
photo's description-edit panel, whatever folder and page the photo is filed on.
**Depends on:** none (phases 2 and 3 are disjoint; see **Interface Contract → Leaves alone**)
**Difficulty:** HARD
**Package:** `components/admin` (with `components/ui`, `app/admin/nina`, `lib/nina/queries`, `lib/admin`)

---

## Goal

An operator looking at an irrelevant search result in the full-screen viewer gets one icon button,
beside the close ✕, that takes them straight to that photograph's description panel — already
selected, with the right folder and the right page loaded underneath it. Today that path does not
exist at all: the search grid opens no pane, and the description editor only exists on
`PhotoGrid`'s tiles via `AlbumSelectionPane`, over a folder page the search result may not be on.

After this phase the album understands one new URL, `/admin/nina?avatar=<id>`, whose id the server
resolves into a folder and a page before the client renders — because the explorer holds exactly one
folder-page of rows and its selection is a `photos.find(...)` over that array
(`components/admin/FileExplorer.tsx:196`), so a search hit from another folder cannot be selected by
the client alone.

## Interface Contract

**Creates:**
- `lib/admin/albumDeepLink.ts` (new, pure, zero-import) — `NINA_AVATAR_PARAM` (`'avatar'`),
  `hrefForAvatar(id: string): string`
- `lib/admin/albumDeepLink.test.ts` (new)
- `lib.nina.queries.locateNinaAvatar` (`lib/nina/queries/avatars.ts`, new export, re-exported by the
  `@/lib/nina/queries` barrel)
- `lib.nina.queries.NinaAvatarLocation` (type, declared in `lib/nina/queries/avatars.ts` beside its
  function, **not** in `lib/nina/queries/shapes.ts` — see Step 3's note)
- `ViewerPhoto.id?: string` (`components/ui/PhotoViewer.tsx`)
- `PhotoViewer` prop `headerAction?: (photo: ViewerPhoto) => React.ReactNode`
- `FileExplorer` prop `deepLinkId: string | null` (**required**, not optional — see Step 7)
- module-private `FileTextIcon` in `components/admin/explorer/SearchResultsGrid.tsx`
- module-private `readAvatarId` and `pageOfOffset` in `app/admin/nina/page.tsx`

**Deletes:** nothing.
**Renames:** nothing.
**Signature changes:** none to any existing function. `PhotoViewer`'s and `ViewerPhoto`'s additions
are all optional, so every existing caller compiles untouched. `FileExplorer`'s new prop is the one
breaking edit, and it has exactly two call sites: `app/admin/nina/page.tsx` and
`components/admin/FileExplorer.test.tsx`'s `baseProps`.

**Frozen-surface lists this phase must edit in the same commit:**
- `lib/nina/queries.test.ts`'s `BARREL_VALUE_EXPORTS` gains exactly ONE name (`locateNinaAvatar`).
  That file's own header requires the list be updated in the same commit, sorted, with a pointer to
  the reason.
  **RECONCILED (do not restate a count from memory):** the list holds **94** entries on
  `origin/main` @ `751e034` — counted, not inferred. That file's header prose still says
  "85 → 92", which is stale and is NOT the baseline; this plan's first draft inherited the stale
  number. Phase 2 adds one name to the SAME list (`setNinaAvatarSearchKeywordsAndEmbedding`) and the
  two phases are concurrent, so **neither phase may assert a total**: whichever lands first takes it
  94 → 95, the second 95 → 96. Count the array when you edit it, add your one name in sorted
  position, and write the count you actually observe.
- `tests/admin.filetreeBarrel.test.ts`'s `EXPECTED_RUNTIME_EXPORTS` is **not** touched — which is
  precisely why the deep-link grammar gets its own module instead of joining `lib/admin/filetree`.

**Requires (from earlier phases):** none.

**Leaves alone (owned by others):**
- `components/admin/explorer/PhotoDescription.tsx`, `components/admin/explorer/SelectionPane.tsx`,
  `lib/admin/schema.ts`, `lib/admin/ninaAlbumDescribeActions.ts`,
  `lib/admin/ninaAlbumDeferredDescribe.ts`, `lib/nina/queries/columns.ts`,
  `lib/nina/queries/avatarEmbeddings.ts`, `lib/db/schema/**`, `drizzle/**` (Phase 2)
- `scripts/**`, `.claude/skills/**` (Phases 2 and 3)
- `components/admin/explorer/PhotoSearchBar.tsx` — read, not edited (see Handoffs)
- `lib/nina/queries/shapes.ts` — deliberately untouched so Phase 2's `NinaAvatarRow` edit has no
  conflict surface here.
- `components/admin/explorer/model.ts` — Phase 2's file (`AlbumExplorerPhoto.searchKeywords`). This
  phase neither reads nor edits it.
- **`app/admin/nina/page.tsx`'s album row→prop mapping (the `listed.rows.map((row): AlbumExplorerPhoto => ({…}))`
  literal, `:229-243`).** RECONCILED: this phase OWNS the file but NOT that region. Phase 2 inserts
  one additive line there (`searchKeywords: row.searchKeywords,` after `description: row.description,`
  at `:241`). Do not add it here and do not remove it if it is already present — see Handoffs.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/albumDeepLink.ts` | create | the `?avatar=` grammar: param name + href builder, zero imports |
| `lib/admin/albumDeepLink.test.ts` | create | four assertions on that grammar |
| `lib/nina/queries/avatars.ts` | modify | `NinaAvatarLocation` + `locateNinaAvatar`, inserted after `listNinaAvatarsInFolder` (`:476`) |
| `lib/nina/queries.test.ts` | modify | frozen barrel list +1 name (`:29-136`, 94 entries today), header note (`:26-28`) — **co-edited by Phase 2**, see the Interface Contract |
| `components/ui/PhotoViewer.tsx` | modify | `ViewerPhoto.id` (`:47-67`), `headerAction` prop (`:69-103`), header control cluster (`:218-238`) |
| `components/ui/PhotoViewer.test.tsx` | modify | new `describe` for the header slot (append, after `:186`) |
| `components/admin/explorer/SearchResultsGrid.tsx` | modify | thread `id` (`:64-73`), `headerAction` link (`:128-136`), inline icon (append) |
| `components/admin/explorer/SearchResultsGrid.test.tsx` | modify | new `describe` for R1 (append, after `:137`) |
| `components/admin/FileExplorer.tsx` | modify | `deepLinkId` prop (`:89-121`), the landing effect (after `:196`) |
| `components/admin/FileExplorer.test.tsx` | modify | `baseProps` (`:176-187`), richer `PhotoSearchBar` mock (`:96-98`), new `describe` (append) — **co-edited by Phase 2**, which adds `searchKeywords: null` to the album-photo helper at `:167`; disjoint regions |
| `app/admin/nina/page.tsx` | modify | resolve `?avatar=` (`:112-128`), pass `deepLinkId` (`:311-319`), two helpers (append). **NOT the album row→prop literal at `:229-243`** — that region is Phase 2's one additive line |
| `tests/admin.photoSearch.test.ts` | modify | new `describe` pinning the R1 wiring (append, after `:155`) |

---

## Implementation Steps

### Step 1: The deep-link grammar, in one pure module

**File:** `lib/admin/albumDeepLink.ts` (new)
**Change:** One place spells `?avatar=`, so the `'use client'` component that mints the link and the
Server Component that reads it cannot drift. It is **not** added to `lib/admin/filetree` because
`tests/admin.filetreeBarrel.test.ts:73-113` freezes that barrel at exactly 35 runtime names and
explicitly forbids growth.

**Code:**

```ts
/**
 * The album's one deep link: "open `/admin/nina` with THIS photograph selected".
 *
 * ── WHY A MODULE FOR TWO EXPORTS ────────────────────────────────────────────────────────────
 * Because the writer and the reader of a URL parameter sit on opposite sides of the client
 * boundary, and a parameter spelled in two places is a parameter that will one day be spelled two
 * ways. `components/admin/explorer/SearchResultsGrid.tsx` (a `'use client'` module) MINTS the
 * link; `app/admin/nina/page.tsx` (a Server Component) READS it and resolves the id into a folder
 * and a page. That is exactly the split `NINA_MEDIA_VIEW_PARAM` / `readExplorerView` already keeps
 * in `lib/admin/filetree/mediaView.ts`, kept the same way.
 *
 * ── WHY NOT IN `lib/admin/filetree` ─────────────────────────────────────────────────────────
 * That barrel's runtime surface is FROZEN by `tests/admin.filetreeBarrel.test.ts` at the 35 names
 * the pre-split single file had — no fewer, and explicitly no more, because a barrel that lazily
 * grows would undo the 2026-09-11 dead-export audit through the back door. So the deep link gets
 * its own module rather than a 36th name there.
 *
 * ── ZERO IMPORTS, WHICH IS THE RULE THIS FILE INHERITS ──────────────────────────────────────
 * `lib/admin/filetree/`'s purity rule, restated for one file: a client component and a Server
 * Component both import this, so it may not reach anything server-only. The id's SHAPE check is
 * deliberately NOT here — `ADMIN_AVATAR_ID_RE` (`lib/admin/avatars.ts`) is applied by the page,
 * beside the `?folder=` and `?page=` validation that already lives there, so this module stays a
 * grammar and never becomes a validator.
 */

/**
 * `?avatar=<id>` — "load whichever folder and page this photograph is on, and select it".
 *
 * A parameter of its own rather than a third spelling of `?folder=`/`?page=`: the link is minted
 * from a search result, which knows the row id and nothing at all about where the row is filed.
 * Turning the id into a folder and a page is a database read, and the only place that can run is
 * the server.
 */
export const NINA_AVATAR_PARAM = 'avatar'

/**
 * The link the viewer's header control points at.
 *
 * Deliberately carries NO `folder`/`page`: both are derived from the id server-side, and a stale
 * pair travelling beside the id would be two opinions about where the photograph is — the one that
 * loses is the id, and the operator lands in the wrong folder. The id is a `newId()` nanoid(12)
 * over `A-Za-z0-9_-`, none of which `encodeURIComponent` touches; it is applied anyway, because a
 * function that builds a URL out of an argument and trusts that argument's alphabet is one
 * refactor away from being wrong.
 */
export function hrefForAvatar(id: string): string {
  return `/admin/nina?${NINA_AVATAR_PARAM}=${encodeURIComponent(id)}`
}
```

**Impact:** new public module under `lib/admin/`. Nothing else changes yet.

---

### Step 2: Pin the grammar

**File:** `lib/admin/albumDeepLink.test.ts` (new)
**Change:** `lib/**/*.test.ts` is in `vitest.config.ts`'s `include`, `environment: 'node'`.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { hrefForAvatar, NINA_AVATAR_PARAM } from './albumDeepLink'

/**
 * The `?avatar=` grammar, from both ends at once: `SearchResultsGrid` writes it and
 * `app/admin/nina/page.tsx` reads it, and neither can be asserted against the other without a
 * running app. Pinning the grammar itself is what keeps the pair honest — the same job
 * `tests/admin.filetree.test.ts` does for `readExplorerView` / `NINA_MEDIA_VIEW_PARAM`.
 */
describe('the album deep link', () => {
  it('names the parameter the page reads', () => {
    expect(NINA_AVATAR_PARAM).toBe('avatar')
  })

  it('points at /admin/nina, carrying the id', () => {
    expect(hrefForAvatar('Rm2NGabc1234')).toBe('/admin/nina?avatar=Rm2NGabc1234')
  })

  it('carries no folder and no page — the server derives both from the id', () => {
    const href = hrefForAvatar('Rm2NGabc1234')
    expect(href).not.toContain('folder=')
    expect(href).not.toContain('page=')
  })

  it('escapes an id outside the alphabet we mint rather than trusting it', () => {
    expect(hrefForAvatar('a b&c')).toBe('/admin/nina?avatar=a%20b%26c')
  })
})
```

**Impact:** one new test file, four assertions.

---

### Step 3: The id → folder(+offset) read

**File:** `lib/nina/queries/avatars.ts`, inserted immediately after `listNinaAvatarsInFolder` ends
(`:476`) and before `listNinaAvatarManifest`'s docstring (`:478`).
**Change:** the one genuinely new server capability this phase needs. It mirrors
`listNinaAvatarsInFolder`'s ordering exactly, so the offset it reports and the page that read
returns cannot disagree.

Note on placement of the type: `NinaAvatarLocation` is declared **here**, not in
`lib/nina/queries/shapes.ts`. That file's own header records the precedent —
*"(The layer's three other exported types — `NinaChatPhotoBlobPatch` in §5b and
`NinaJobPhotoRow`/`NinaJobPhotoBubbleRow` in §12 — travel with their sections, not here.)"* — and it
also keeps `shapes.ts` out of this phase's diff entirely, which matters because Phase 2 has business
there (`NinaAvatarRow` gains `searchKeywords` when `avatarColumns` does).

**Code:**

```ts
/**
 * Where one photograph sits in the explorer — the answer `?avatar=<id>` needs before a page can be
 * rendered. See `locateNinaAvatar`.
 */
export interface NinaAvatarLocation {
  /** Echoed back, so a caller holds an id proven to exist rather than the string it asked with. */
  id: string
  /** `''` is the album root, exactly as the column stores it. */
  folder: string
  /** 0-based position within `folder`, under `(created_at desc, id desc)`. A row count, not a page. */
  offset: number
}

/**
 * Which folder a photograph is filed in, and how many rows of that folder sort before it.
 *
 * ── WHY THIS READ HAS TO EXIST AT ALL ───────────────────────────────────────────────────────
 * `/admin/nina` holds ONE folder and ONE page of photographs at a time, and the explorer's
 * selection is a `photos.find(...)` over that array (`components/admin/FileExplorer.tsx:196`). The
 * album search, by contrast, ranks across EVERY folder (`queries/avatarsearch.ts`'s header) — so
 * "open this search result's description panel" names a row the client cannot select, because the
 * row is not in the array the client has. Only the server can turn an id into the folder and the
 * page that hold it, and that is the whole of what this answers.
 *
 * ── THE OFFSET IS COUNTED, NOT PAGED ────────────────────────────────────────────────────────
 * `listNinaAvatarsInFolder` orders `(created_at desc, id desc)`, so a row's position inside its
 * folder is exactly how many rows of the same folder sort BEFORE it — which under a DESCENDING
 * order is how many compare GREATER as the tuple `(created_at, id)`. Postgres compares row values
 * left to right, so `(earlier.created_at, earlier.id) > (a.created_at, a.id)` is that predicate in
 * one expression, and it cannot drift from the `ORDER BY` the way a hand-expanded
 * `created_at > … OR (created_at = … AND id > …)` could.
 *
 * ── ONE STATEMENT, AND NO BOUND PARAMETER IN THE COMPARISON ─────────────────────────────────
 * The correlated subquery reads the target's own columns rather than values fetched by a first
 * round trip. That saves a round trip, and — the reason it is written this way rather than as a
 * read-then-count — it leaves Postgres comparing `timestamptz` to `timestamptz` and `text` to
 * `text` with no parameter whose type it has to infer, so there is no cast to get right and no
 * driver-side `Date` serialisation anywhere in the path. Both halves are served by
 * `nina_avatars_user_folder_created_idx` (`user_id`, `folder`, `created_at desc`).
 *
 * **The page SIZE is the caller's policy, not this module's.** `NINA_ADMIN_PAGE_SIZE` is the
 * `limit` `app/admin/nina/page.tsx` spends, and asserting it here would be a second opinion about
 * it — so the division lives at that call site, beside the `offset` it is about to compute.
 *
 * `null` for "not yours" and for "no such row" alike, per `lib/nina/queries.ts`'s rule 1: a deleted
 * photograph and a stranger's photograph are the same answer, and the caller's handling is the same
 * either way.
 */
export async function locateNinaAvatar(
  userId: string,
  id: string,
): Promise<NinaAvatarLocation | null> {
  const rows = await db
    .select({
      id: ninaAvatars.id,
      folder: ninaAvatars.folder,
      offset: sql<number>`(
        select count(*)
        from ${ninaAvatars} as earlier
        where earlier.user_id = ${ninaAvatars.userId}
          and earlier.folder = ${ninaAvatars.folder}
          and (earlier.created_at, earlier.id) > (${ninaAvatars.createdAt}, ${ninaAvatars.id})
      )`.mapWith(Number),
    })
    .from(ninaAvatars)
    .where(and(eq(ninaAvatars.userId, userId), eq(ninaAvatars.id, id)))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:** `and`, `eq`, `sql`, `db` and `ninaAvatars` are already imported at the top of this file
(`:1-34`); no import line changes. The function surfaces through the barrel's
`export * from './queries/avatars'`, which is what Step 4 accounts for.

---

### Step 4: Unfreeze the barrel by one name

**File:** `lib/nina/queries.test.ts`
**Change:** two edits — the header's count sentence, and one sorted entry. The file's own header
demands both: *"If this fails because a name was ADDED, the barrel grew. That is legitimate only as
a documented decision … and the list is updated in the same commit, sorted, with a pointer to that
decision."*

> **RECONCILED — count the array, do not quote a number.** The list holds **94** entries on
> `origin/main` @ `751e034`; the header's own "85 → 92" sentence is stale prose and the first draft
> of this plan inherited it. **Phase 2 adds one name to this same list and runs concurrently with
> this phase.** So: add your one name, count the array as you actually find it, and write that pair
> (94 → 95 if you land first, 95 → 96 if Phase 2 already did). If both names are present when you
> arrive, the list is at 96 and your entry is already there — verify and move on. A textual git
> conflict here is resolved by **keeping both names**, sorted.

**Edit A** — `:26-28`, append a paragraph to the header comment, leaving the existing
`admin-album-semantic-search` sentence byte-identical (it is a historical record, stale count and
all — do not "fix" it, the file's convention is one sentence per plan set):

```
 *
 * nina-album-search-relevance-tools phase 1 adds `locateNinaAvatar`, the id → folder(+offset) read
 * R1's `?avatar=` deep link needs: the explorer holds one folder-page and selects by
 * `photos.find(...)`, so a search hit from another folder cannot be selected without the server
 * saying where it lives first. (Phase 2 of the same set adds
 * `setNinaAvatarSearchKeywordsAndEmbedding`; the two are independent and land in either order.)
```

**Edit B** — `:100-101`, between `'listNinaShortcuts',` and `'markNinaAvatarAnnounced',`
(`'listNinaShortcuts' < 'locateNinaAvatar' < 'markNinaAvatarAnnounced'` under the plain sort this
list uses):

```ts
  'listNinaShortcuts',
  // nina-album-search-relevance-tools phase 1 (R1): the id -> folder(+offset) read the album's
  // `?avatar=` deep link resolves through. Documented growth, one name.
  'locateNinaAvatar',
  'markNinaAvatarAnnounced',
```

**Impact:** `lib/nina/queries.test.ts` goes green again. Nothing else reads this list.

---

### Step 5: The viewer grows a header slot and a structured id

**File:** `components/ui/PhotoViewer.tsx`

**Edit A** — `:47-67`, add `id` to `ViewerPhoto`, above `label`:

```ts
export interface ViewerPhoto {
  url: string
  kind: string
  /**
   * The row id this photograph came from, when the caller has one — the handle `headerAction`
   * needs in order to link to the photograph's own screen.
   *
   * Deliberately separate from `meta` below, which is the DISPLAY string (`#<id> · <score>`) and is
   * already formatted for a human: parsing an id back out of it would make a printed format
   * load-bearing. Optional, because the review surfaces have no such id and never will —
   * `ReviewPhoto` is `{url, kind, width, height}` (`lib/review/loadReview.ts:34-39`) and assigns to
   * this type with no adapter, which is the promise this interface's header makes.
   */
  id?: string
  /**
   * What to call this photo, when `kind` is not a `ScreenKind`. F33's album and chat gallery pass
   * a human phrase here; the review surfaces pass nothing and keep `SCREEN_KIND_LABEL`.
   *
   * Without it the header renders `SCREEN_KIND_LABEL[kind] ?? kind`, which for an album photo is
   * the literal word `avatar` and for one of her selfies the literal word `generated` — and the
   * dot row then announces "generated screenshot".
   */
  label?: string
  /**
   * A short identifying line shown beside the name in the header — the search grid passes each
   * hit's row id and similarity score, so an operator can cite a photograph ("that one, id X,
   * scored 0.30") without leaving the viewer. Absent renders NOTHING, same promise as `label`:
   * the review surfaces keep the header they have always drawn
   * (`components/ui/PhotoViewer.test.tsx` holds both halves).
   */
  meta?: string
}
```

**Edit B** — `:69-103`, add the `headerAction` prop to the signature. Insert it after `actions`
(keeping `actions`'s existing docstring byte-identical), so the destructure and the type read:

```tsx
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  subject = 'screenshot',
  actions,
  headerAction,
}: {
  photos: readonly ViewerPhoto[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  /**
   * The noun in the dialog's accessible name. `'screenshot'` for the three review surfaces,
   * `'foto'` for F33's album and gallery — "avatar screenshot" is not a thing.
   */
  subject?: string
  /**
   * F35 R10. Controls to float at the bottom right, over the image and clear of the dot row —
   * a download and an attach, on the chat surface. **Absent renders NOTHING**, which is what keeps
   * `ScreenshotStrip`, `SheetSource` and `PhotoInclusionList` byte-identical.
   *
   * ── WHY A SLOT AND NOT `onDownload` / `onAttach` ─────────────────────────────────────────────
   * Because a download that works is not one callback. It needs a `pointerdown` warm to survive
   * Safari's transient-activation window, an in-flight boolean, and a two-state notice for the
   * paths where the platform cannot save — five props, three of them about a fetch this file has
   * no business knowing exists. `components/nina/ChatPhotoActions.tsx` owns all of it, and this
   * component stays what its header says it is: a shared overlay that three review surfaces must
   * not grow an F33 button on (`NinaAboutScreen.tsx:255-259`).
   *
   * The **public** shared page must still never become a caller, slot or no slot: a viewer there
   * gets the platform's own image viewer, with real pinch-zoom, real save and real back.
   */
  actions?: React.ReactNode
  /**
   * A control for the HEADER, drawn immediately left of the close ✕ — R1 of
   * nina-album-search-relevance-tools: *"tambah tombol icon di full screen image view. tombol yang
   * mengarahkan user ke UI yang bisa melihat image description."*
   *
   * ── WHY A SLOT, AND WHY IT TAKES THE PHOTO ───────────────────────────────────────────────────
   * The slot half is `actions`'s argument above, unchanged: the album's control is a `<Link>` into
   * `/admin/nina?avatar=<id>`, and a shared overlay that six non-admin surfaces also open has no
   * business knowing that route exists.
   *
   * What differs is the ARGUMENT. `actions` is mounted over one chat photograph the caller opened;
   * this overlay PAGES across a whole result set — arrow keys, the dot row, a swipe — so a header
   * control that acts on "the photograph on screen" has to be derived from the photograph on
   * screen. Handing the slot `photos[index]` makes that structural instead of a discipline every
   * caller has to keep, and it is why `ViewerPhoto.id` exists rather than the caller re-deriving
   * the row from an index it also holds.
   *
   * **Absent renders NOTHING**, the same promise `label`, `meta` and `actions` make:
   * `ScreenshotStrip`, `SheetSource`, `PhotoInclusionList`, `ChatScreen`, `NinaAboutScreen`,
   * `ErrorLogList` and `PhotoDeepLinkScreen` draw the header they always have.
   */
  headerAction?: (photo: ViewerPhoto) => React.ReactNode
}) {
```

**Edit C** — `:218-238`, the header row. Replace the whole block with:

```tsx
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3">
        <span className="text-[13px] font-semibold text-card">
          {nameOf(photo)}
          {photo.meta != null && (
            <span className="ml-2 font-mono text-[11px] font-medium opacity-60">{photo.meta}</span>
          )}
          {photos.length > 1 && (
            <span className="ml-2 font-medium opacity-60">
              {index + 1} / {photos.length}
            </span>
          )}
        </span>
        {/*
          The header's control cluster. `shrink-0` so a long name truncates against the controls
          rather than squeezing them off the edge. No gap class: both controls are 44 px tap targets
          whose glyphs are already inset, so a gap would only push ✕ away from the edge it is
          aligned to. An absent `headerAction` renders nothing at all and this row is the single
          close button it has always been — `components/ui/PhotoViewer.test.tsx` holds that half.
        */}
        <div className="flex shrink-0 items-center">
          {headerAction?.(photo)}
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-pill text-[19px] font-semibold text-card"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
```

**Impact:** every existing caller is untouched and byte-identical in behaviour (both additions are
optional). `tests/ui.photoViewer.test.ts`'s five structural claims still hold — nothing here adds a
`preventDefault`, changes `stepIndex`, or moves the arrow-key lines.

---

### Step 6: Prove the slot

**File:** `components/ui/PhotoViewer.test.tsx`, appended after the existing
`describe('the header meta line', …)` block (`:186`), inside the outer `describe('PhotoViewer', …)`.

**Code:**

```tsx
  describe('the header action slot', () => {
    it('renders the caller’s control beside Close, and hands it the photo on screen', () => {
      const seen: (string | undefined)[] = []
      renderViewer({
        index: 1,
        photos: [
          { url: 'blob:photo-a', kind: 'avatar', label: 'One', id: 'id-a' },
          { url: 'blob:photo-b', kind: 'avatar', label: 'Two', id: 'id-b' },
        ],
        headerAction: (photo) => {
          seen.push(photo.id)
          return (
            <button type="button" aria-label={`Inspect ${photo.id}`}>
              i
            </button>
          )
        },
      })

      expect(screen.getByRole('button', { name: 'Inspect id-b' })).toBeInTheDocument()
      expect(seen).toContain('id-b')
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('follows the paging, so the control never acts on the photo that just left', () => {
      const photos: ViewerPhoto[] = [
        { url: 'blob:photo-a', kind: 'avatar', label: 'One', id: 'id-a' },
        { url: 'blob:photo-b', kind: 'avatar', label: 'Two', id: 'id-b' },
      ]
      const headerAction = (photo: ViewerPhoto) => (
        <button type="button" aria-label={`Inspect ${photo.id}`}>
          i
        </button>
      )
      renderViewer({ photos, index: 0, headerAction })
      expect(screen.getByRole('button', { name: 'Inspect id-a' })).toBeInTheDocument()

      cleanup()
      renderViewer({ photos, index: 1, headerAction })
      expect(screen.getByRole('button', { name: 'Inspect id-b' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Inspect id-a' })).toBeNull()
    })

    it('absent renders nothing — the review surfaces keep the header they have always drawn', () => {
      // One photo, so there is no dot row either: the close button is the only control in the DOM.
      renderViewer({ photos: [PHOTOS[0]!] })

      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })
  })
```

The second test uses `cleanup()` + a fresh render rather than `rerender`, because `renderViewer`
builds the element itself; add `cleanup` to the existing `@testing-library/react` import at `:2`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
```

**Impact:** three new assertions; no existing test in the file changes.

---

### Step 7: The search result links to its own description panel

**File:** `components/admin/explorer/SearchResultsGrid.tsx`

**Edit A** — `:1-9`, the import block. `next/*` leads, as in `FileExplorer.tsx:3-5`:

```tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/ui'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { hrefForAvatar } from '@/lib/admin/albumDeepLink'
import { NINA_FOLDER_ROOT_LABEL } from '@/lib/admin/filetree'

import type { AdminSearchHit } from '@/lib/admin/ninaAlbumActions'
```

**Edit B** — `:64-73`, thread the id through the mapping:

```tsx
  const photos = useMemo<ViewerPhoto[]>(
    () =>
      hits.map((hit) => ({
        /* The row id as a FIELD, beside the printed `meta` line below that also carries it. The
         * header control builds a link out of this one; parsing the id back out of `#id · score`
         * would make a display format load-bearing (`PhotoViewer.tsx`'s `id` note). */
        id: hit.id,
        url: hit.url,
        kind: hit.source,
        label: hit.filename,
        meta: `#${hit.id} · ${hit.score.toFixed(3)}`,
      })),
    [hits],
  )
```

**Edit C** — `:128-136`, the overlay. Replace with:

```tsx
      {viewerIndex !== null && photos[viewerIndex] != null && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          subject="foto"
          /*
           * R1. The way out of *"saya liat search result irrelevant, saya bisa langsung ke
           * deskripsinya"*: a link, in the header, to the panel where this photograph's
           * description is read and edited.
           *
           * A `<Link>` and not a `router.push` button, which is the split `FileExplorer` already
           * keeps: a folder OPERATION needs a navigator because it learns where to go only once
           * the server answers, and this one knows its destination up front. So the operator also
           * gets middle-click and open-in-new-tab — which on this screen is worth having, because
           * a new tab keeps the ranked result set alive in this one while the description gets
           * fixed in the other.
           *
           * `photo.id == null` is unreachable from this file (every hit has one) and is still
           * checked, because `ViewerPhoto.id` is optional for the review surfaces and a `!` here
           * would be an assertion about a shared type this file does not own.
           *
           * The overlay is closed on the way out for IMMEDIATE feedback. It is not the guarantee:
           * the landing clears the search (`FileExplorer`'s deep-link effect), which unmounts this
           * whole component and the overlay with it. Both, so the lightbox is never left hanging
           * over the page the link just opened during the navigation.
           */
          headerAction={(photo) =>
            photo.id == null ? null : (
              <Link
                href={hrefForAvatar(photo.id)}
                onClick={() => setViewerIndex(null)}
                aria-label="Open this photo's description"
                title="Open this photo's description"
                className="grid size-11 place-items-center rounded-pill text-card"
              >
                <FileTextIcon className="size-5" />
              </Link>
            )
          }
        />
      )}
```

**Edit D** — append at the end of the file:

```tsx
/*
 * The header control's glyph, inlined rather than imported — `FileExplorer.tsx:640-649`'s standing
 * ruling for this screen's icons, which `PhotoSearchBar.tsx` and `ErrorLogList.tsx` both follow:
 * **Lucide** (lucide-static, ISC), `file-text`, copied verbatim with Lucide's `class`/`width`/
 * `height` dropped and `stroke-width` normalised to `strokeWidth` on the root `svg`, where the
 * `stroke*` presentation attributes inherit to every child. `aria-hidden`, because the accessible
 * name is the link's `aria-label` and never the picture.
 *
 * A document with lines on it, and not a pencil: the destination is the panel where the
 * description is READ as well as edited, and the operator goes there to look before they type.
 */
function FileTextIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}
```

**Impact:** `tests/admin.photoSearch.test.ts`'s existing assertions all still hold — the `<li>` slice
is untouched, no `SelectionPane`, no `data-photo-id`, no `hit.description`, no `next/image`, no
`lib/nina/queries` import, no pager words.

---

### Step 8: Prove the link

**File:** `components/admin/explorer/SearchResultsGrid.test.tsx`, appended after the existing final
`describe` (`:137`).

`next/link` renders in this harness with no mock and no router context —
`components/admin/explorer/PhotoGrid.test.tsx` asserts `getByRole('link')` hrefs the same way, with
no `next/navigation` mock at all. The link is therefore asserted by its `href`, never clicked (no
test in this repo clicks a `next/link`); the `onClick` is pinned as a source claim in Step 12.

**Code:**

```tsx
describe('R1 — the open result links to its own description panel', () => {
  it('offers the link only while the overlay is open, pointing at /admin/nina?avatar=<id>', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    expect(screen.queryByRole('link', { name: "Open this photo's description" })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    expect(screen.getByRole('link', { name: "Open this photo's description" })).toHaveAttribute(
      'href',
      '/admin/nina?avatar=a1',
    )
  })

  it('follows the paging — the link always names the photo on screen', () => {
    render(<SearchResultsGrid hits={[HIT, SECOND]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('link', { name: "Open this photo's description" })).toHaveAttribute(
      'href',
      '/admin/nina?avatar=a2',
    )
  })

  it('carries no folder and no page: the server resolves both from the id', () => {
    render(<SearchResultsGrid hits={[HIT]} />)
    fireEvent.click(screen.getByRole('button', { name: 'DSC_0031.jpg in 2026/bali' }))

    const href =
      screen.getByRole('link', { name: "Open this photo's description" }).getAttribute('href') ?? ''
    expect(href).not.toContain('folder=')
    expect(href).not.toContain('page=')
  })
})
```

**Impact:** three new assertions. The `toHaveAttribute` matcher is already available through
`tests/support/setup.ts` (`FileExplorer.test.tsx` uses it).

---

### Step 9: The explorer spends the landing

**File:** `components/admin/FileExplorer.tsx`

**Edit A** — `:89-121`, the prop list. Add `deepLinkId` to the destructure (after `photos`) and to
the type (after the `photos` line):

```tsx
export function FileExplorer({
  userId,
  folders,
  photos,
  deepLinkId,
  page,
  view,
  mediaCount,
  shareOrigin,
}: {
  userId: string
  folders: readonly ExplorerFolder[]
  photos: readonly ExplorerPhoto[]
  /**
   * R1. The id of a photograph the URL asked to have SELECTED — already resolved by the server to
   * the folder and page this render is showing (`app/admin/nina/page.tsx`'s `?avatar=` arm) — or
   * `null` on an ordinary visit.
   *
   * A RESOLVED id and not the raw parameter, on purpose. The client cannot select a row it does
   * not hold (`selected` below is a `photos.find(...)` over ONE folder-page), and which folder that
   * is, is a database read. So the page resolves and this component selects — the same division
   * `view` already keeps: the parameter is parsed once, upstream, and this component never has a
   * second opinion about the URL.
   */
  deepLinkId: string | null
  /**
   * Which collection the URL has open — the tree's active row, the pager's target and the
   * toolbar's copy all follow it. `app/admin/nina/page.tsx` reads `?view=` and hands it down; this
   * component never parses the parameter itself, for the same reason it never parses `?folder=`.
   */
  view: ExplorerView
  /**
   * How many original conversation photographs exist in total. The tree pane's Media badge shows
   * it on BOTH views, so the album view pays one aggregate for a number its grid never uses — the
   * badge is the rail's whole point, and a badge without a count is decoration.
   */
  mediaCount: number
  /**
   * Phase 7 / R2. Where a "Share link to Nina" link points — `shareOrigin()`'s output, resolved in
   * `app/admin/nina/page.tsx` because `lib/share/origin.ts` is `server-only` and invariant 9
   * forbids a build-time public environment variable for it. Threaded through, UNREAD, to
   * `SelectionPane`; nothing in the explorer itself may substitute `window.location.origin` for it.
   */
  shareOrigin: string
}) {
```

Required rather than optional, deliberately: there are exactly two call sites and an optional prop
here would let a third one forget the landing and look like it worked.

**Edit B** — insert immediately after `const selected = photos.find((photo) => photo.id === selectedId) ?? null`
(`:196`) and before the focus-restoration block's comment (`:198`):

```tsx
  /*
   * ── R1: THE DEEP LINK LANDS HERE ────────────────────────────────────────────────────────────
   * The viewer over a search result links to `/admin/nina?avatar=<id>`; the page resolved that id
   * to the folder and page this render is already showing, and handed the id back as `deepLinkId`.
   * Three things happen on arrival and all three are needed:
   *
   *   1. **The photograph is selected**, which is what mounts `SelectionPane` and its description
   *      editor — the requirement, in one line.
   *   2. **The search is cleared.** A landed search is what the content pane draws (`activeSearch`
   *      above), so leaving it up would put the operator's ranked sheet over the folder the link
   *      just opened, and would break this file's standing pairing that a selection and a result
   *      set are never on screen together (`onSearchResults`, and the reason `PhotoMoveBar` needs
   *      no branch of its own). It is also what makes the landing IDENTICAL whether or not React
   *      preserved this component's state across the navigation — a soft navigation to the same
   *      route keeps it, a remount does not, and a feature must not depend on which.
   *   3. **The parameter is spent**, replaced with the canonical URL of where we actually are, so a
   *      reload, a copied link and the back button all describe this folder and this page rather
   *      than re-running a resolution that has already happened. `history.replaceState` and not
   *      `router.replace` for `components/ui/usePanelParam.ts`'s measured reason: the page is two
   *      database reads, and rewriting its own URL must not re-run them. REPLACE and never push —
   *      a spent parameter that became a history entry would cost the operator a back press to get
   *      past a URL that no longer means anything.
   *
   * The ref is what makes this idempotent, and that is load-bearing rather than tidy: a
   * `history.replaceState` re-runs parameter watchers synchronously, so this effect can be entered
   * a second time for the same id — and a second entry must not re-open a pane the operator has
   * since closed. For the same reason there is **no cleanup here that undoes anything**: a cleanup
   * that cleared the selection would cancel the landing on that second pass.
   *
   * `hrefForFolder` and not `hrefForMediaView`: the page resolves `?avatar=` on the ALBUM arm only
   * (a message image is not an album row), so `deepLinkId` is never non-null under `?view=media`.
   */
  const spentDeepLink = useRef<string | null>(null)
  useEffect(() => {
    if (deepLinkId === null) return
    if (spentDeepLink.current === deepLinkId) return
    spentDeepLink.current = deepLinkId
    setSelectedId(deepLinkId)
    setSearch(null)
    window.history.replaceState(null, '', hrefForFolder(page.folder, page.page))
  }, [deepLinkId, page.folder, page.page])
```

`useRef` and `useEffect` are already imported (`:5`); `hrefForFolder` is a hoisted module-level
function declaration (`:618`), reachable from here.

**Impact:** a photograph named by the URL is selected without a click, and a landed search steps
aside for it.

---

### Step 10: Prove the landing

**File:** `components/admin/FileExplorer.test.tsx`

**Edit A** — `:96-98`, make the `PhotoSearchBar` mock able to land a search, so the "clears the
search" claim is a behaviour and not a source scan:

```tsx
vi.mock('./explorer/PhotoSearchBar', () => ({
  PhotoSearchBar: ({
    onResults,
  }: {
    onResults: (state: {
      hits: readonly { id: string }[]
      text: string
      withImage: boolean
    }) => void
  }) => (
    <div data-testid="photo-search-bar">
      {/* Lands a search the way the real bar does, so the deep-link tests below can prove that the
          landing REPLACES a result set rather than opening a pane beside one. */}
      <button
        type="button"
        onClick={() => onResults({ hits: [{ id: 'p1' }], text: 'tete', withImage: false })}
      >
        land-search
      </button>
    </div>
  ),
}))
```

**Edit B** — `:176-187`, add the new prop to `baseProps`:

```tsx
function baseProps(overrides?: Partial<Parameters<typeof FileExplorer>[0]>) {
  return {
    userId: 'user1',
    folders: [],
    photos: [],
    deepLinkId: null,
    page: page(),
    view: 'album' as const,
    mediaCount: 0,
    shareOrigin: 'https://example.com',
    ...overrides,
  }
}
```

**Edit C** — append a new top-level `describe` at the end of the file:

```tsx
/*
 * R1's landing. `app/admin/nina/page.tsx` resolves `?avatar=<id>` into the folder and page that
 * hold the row and hands the id back as `deepLinkId`; everything below is what this component owes
 * in return — select it, get the result set out of the way, and spend the parameter.
 */
describe('FileExplorer — R1’s deep link (?avatar=<id>)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/admin/nina?avatar=p1')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('selects the resolved photograph on arrival, with no click', () => {
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: 'p1' })} />)
    expect(screen.getByTestId('selection-pane')).toHaveAttribute('data-photo', 'p1')
  })

  it('spends the parameter: the URL becomes the canonical folder+page we actually landed on', () => {
    render(
      <FileExplorer
        {...baseProps({
          photos: [photo({ id: 'p1' })],
          page: page({ folder: 'bali', page: 3 }),
          deepLinkId: 'p1',
        })}
      />,
    )
    expect(window.location.search).toBe('?folder=bali&page=3')
  })

  it('drops a landed search, so the folder the link opened is what the operator sees', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: null })} />,
    )
    await user.click(screen.getByRole('button', { name: 'land-search' }))
    expect(screen.getByTestId('search-results-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('photo-grid')).not.toBeInTheDocument()

    rerender(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: 'p1' })} />)

    expect(screen.queryByTestId('search-results-grid')).not.toBeInTheDocument()
    expect(screen.getByTestId('photo-grid')).toBeInTheDocument()
    expect(screen.getByTestId('selection-pane')).toHaveAttribute('data-photo', 'p1')
  })

  it('a spent link stays spent — it does not re-open a pane the operator closed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: 'p1' })} />,
    )
    await user.click(screen.getByRole('button', { name: 'close-pane' }))
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()

    // A re-render carrying the same resolved id is exactly what the `replaceState` above provokes.
    rerender(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: 'p1' })} />)
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
  })

  it('an ordinary visit selects nothing and leaves the URL alone', () => {
    window.history.replaceState(null, '', '/admin/nina?folder=bali')
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: null })} />)

    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
    expect(window.location.search).toBe('?folder=bali')
  })

  it('a resolved id the loaded page does not hold opens nothing, rather than throwing', () => {
    // The race: the row moved folder between the resolution and this render. `photos.find(...)`
    // answers `null` and the pane simply does not mount — this file's standing handling.
    render(<FileExplorer {...baseProps({ photos: [photo({ id: 'p1' })], deepLinkId: 'gone' })} />)
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
  })
})
```

Add `afterEach` to the vitest import at `:4`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

**Impact:** six new assertions over the landing; the existing suite is unchanged apart from
`baseProps` and the richer search-bar mock (which no existing test reads).

---

### Step 11: Resolve the parameter on the server

**File:** `app/admin/nina/page.tsx`

**Edit A** — `:1-24`, the import block. Two additions, alphabetical inside the `@/lib/admin/` run,
and `locateNinaAvatar` folded into the existing `@/lib/nina/queries` import:

```tsx
import { FileExplorer } from '@/components/admin/FileExplorer'
import type {
  AlbumExplorerPhoto,
  ExplorerFolder,
  ExplorerPageInfo,
  ExplorerPhoto,
  MediaExplorerPhoto,
} from '@/components/admin/explorer/model'
import { NINA_AVATAR_PARAM } from '@/lib/admin/albumDeepLink'
import { ADMIN_AVATAR_ID_RE } from '@/lib/admin/avatars'
import { NINA_FOLDER_ROOT, readExplorerView, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  NINA_ADMIN_PAGE_SIZE,
  NINA_AVATAR_FALLBACK_SRC,
  NINA_CHAT_PHOTO_PAGE_SIZE,
  photoSideOf,
} from '@/lib/nina/album'
import {
  countNinaMediaPhotos,
  listNinaAvatarFolders,
  listNinaAvatarsInFolder,
  listNinaMediaPhotos,
  locateNinaAvatar,
  type NinaAvatarFolderCount,
} from '@/lib/nina/queries'
import { shareOrigin } from '@/lib/share/origin'
```

**Edit B** — `:124-128`, replace the three parameter reads with:

```tsx
  const view = readExplorerView(params.view)
  const requested = validateFolderPath(readOne(params.folder) ?? NINA_FOLDER_ROOT)

  /*
   * ── R1's DEEP LINK ──────────────────────────────────────────────────────────────────────────
   * `?avatar=<id>` says "open whichever folder and page this photograph is on, and select it", and
   * only the server can answer it: the album search ranks across every folder
   * (`lib/nina/queries/avatarsearch.ts`) while the explorer holds one folder and one page, so the
   * id has to become a folder and an offset before the client has a row to select at all
   * (`components/admin/FileExplorer.tsx:196`'s `photos.find(...)`).
   *
   * Validated, not trusted, exactly like the two parameters above it: a value that is not the shape
   * `newId()` mints is not an id, and is dropped rather than handed to a query. Ignored on the
   * MEDIA arm by construction, for the reason that arm ignores `?folder=`: a message image is not
   * an album row and has no folder to open.
   */
  const wantedAvatarId = view === 'media' ? null : readAvatarId(readOne(params[NINA_AVATAR_PARAM]))
  const located = wantedAvatarId === null ? null : await locateNinaAvatar(userId, wantedAvatarId)

  /*
   * A RESOLVED deep link wins over `?folder=` and `?page=`; a failed one changes nothing.
   *
   * The link carries only an id — where the row is filed is DERIVED — so any folder or page
   * travelling beside it is a leftover from wherever the operator happened to be, and honouring it
   * would open the wrong folder and then fail to find the photograph in it. `locateNinaAvatar`
   * answering `null` means "not yours, or gone" (that module's rule 1): the ordinary parameters
   * take over, nothing is selected, and the operator lands on the folder the URL names — which is
   * what an id naming no row should look like. Silent, deliberately: a page that distinguished
   * "deleted" from "not yours" would be telling a stranger which ids exist.
   */
  const folder = located?.folder ?? (requested.ok ? requested.path : NINA_FOLDER_ROOT)
  const page = located != null ? pageOfOffset(located.offset) : readPage(readOne(params.page))
```

**Edit C** — `:311-319`, the render. Add one prop with its comment (keeping the existing JSX comment
block above it byte-identical, `*`-prefixed continuation lines and all):

```tsx
      <FileExplorer
        userId={userId}
        folders={folderList}
        photos={photos}
        deepLinkId={located?.id ?? null}
        page={pageInfo}
        view={view}
        mediaCount={mediaTotal}
        shareOrigin={shareOrigin()}
      />
```

**Edit D** — append two helpers at the end of the file, after `readPage`:

```tsx
/**
 * The `?avatar=` value if it is the SHAPE an id has, and `null` otherwise.
 *
 * `ADMIN_AVATAR_ID_RE` is `newId()`'s alphabet — nanoid(12) over `A-Za-z0-9_-` — and it has exactly
 * one spelling, in `lib/admin/avatars.ts`, which is why it is imported rather than restated. A
 * shape check and never an existence check: whether the row exists, and whether it is this user's,
 * is `locateNinaAvatar`'s answer and nobody else's.
 */
function readAvatarId(raw: string | null): string | null {
  if (raw === null) return null
  return ADMIN_AVATAR_ID_RE.test(raw) ? raw : null
}

/**
 * Which 1-based page of `listNinaAvatarsInFolder` holds the row at `offset` inside its folder.
 *
 * The page SIZE is this file's policy — it is the `limit` the album arm spends below — which is
 * exactly why `locateNinaAvatar` returns a row count and this division happens here rather than in
 * the query layer. Capped at `PAGE_CEILING` for `readPage`'s reason, so the two ways a page number
 * can arrive cannot disagree about how deep a page may be.
 */
function pageOfOffset(offset: number): number {
  return Math.min(Math.floor(offset / NINA_ADMIN_PAGE_SIZE) + 1, PAGE_CEILING)
}
```

**Impact:** one extra database read, and only on a request that actually carries a well-formed
`?avatar=`. Every other request runs exactly the statements it ran before.

---

### Step 12: Pin the wiring that no DOM test reaches

**File:** `tests/admin.photoSearch.test.ts`, appended after the final `describe` (`:155`).

**Code:**

```ts
describe('R1 — the viewer links a result to its own description panel', () => {
  it('mints the deep link through the one grammar module, never a hand-built string', () => {
    expect(grid).toContain("from '@/lib/admin/albumDeepLink'")
    expect(codeLines(grid)).toContain('hrefForAvatar(photo.id)')
    // The route is spelled in `lib/admin/albumDeepLink.ts` and nowhere on this screen.
    expect(codeLines(grid)).not.toContain('/admin/nina?')
  })

  it('hands the control the photo on screen, so paging cannot leave it pointing at the last one', () => {
    expect(codeLines(grid)).toContain('headerAction={')
  })

  it('closes the overlay on the way out, so no lightbox is left over the landing page', () => {
    const slot = codeLines(grid.slice(grid.indexOf('headerAction=')))
    expect(slot).toContain('onClick={() => setViewerIndex(null)}')
  })

  it('the explorer spends the parameter: selects, drops the search, and REPLACES the URL', () => {
    const body = codeLines(explorer)
    const effect = body.slice(body.indexOf('const spentDeepLink'), body.indexOf('[deepLinkId,'))
    expect(effect).toContain('setSelectedId(deepLinkId)')
    // A landed search over the folder the link just opened would break the pairing
    // `onSearchResults` keeps: a selection and a result set are never on screen together.
    expect(effect).toContain('setSearch(null)')
    expect(effect).toContain('window.history.replaceState')
    // A spent parameter that became its own history entry would cost a back press to get past.
    expect(body).not.toContain('window.history.pushState')
  })
})
```

**Impact:** four source claims, in the suite that already reads both files.

---

## Verification

**Build / typecheck:** `npm run typecheck` (`next typegen && tsc --noEmit` — typegen first, or
`PageProps<'/admin/nina'>` resolves against a stale route manifest).

**Tests — the touched set first:**

```
npx vitest run \
  lib/admin/albumDeepLink.test.ts \
  lib/nina/queries.test.ts \
  components/ui/PhotoViewer.test.tsx \
  components/admin/explorer/SearchResultsGrid.test.tsx \
  components/admin/FileExplorer.test.tsx \
  tests/admin.photoSearch.test.ts \
  tests/ui.photoViewer.test.ts \
  tests/admin.filetreeBarrel.test.ts
```

**Then the full sweep:** `npm test`. (If reds appear in files this phase never touched, reproduce
them on clean `HEAD` before treating them as ours, and re-run with `--no-file-parallelism`.)

**Lint / format:** `npm run lint` and `npm run format:check`. Also `npm run ci:client-secret-guard`
— `lib/admin/albumDeepLink.ts` is a new module that a `'use client'` file imports.

**Manual check** (the two cases the index's exit criteria name, both requiring a real album):

1. `npm run dev`, open `/admin/nina`, search for a term that returns a hit filed in a folder OTHER
   than the one currently open. Click the tile, then the new header icon.
   Expect: the overlay closes, the breadcrumb shows the hit's folder, the search results are gone,
   the hit's tile is selected in the grid, the details rail is open on `PhotoDescription`, and the
   address bar reads `/admin/nina?folder=<that folder>` with no `?avatar=`.
2. Repeat for a hit whose folder holds more than `NINA_ADMIN_PAGE_SIZE` (120) rows and which sorts
   onto page 2 or later. Expect the pager to read the right band (`121–240 of N`) and the tile to be
   selected on that page, with `&page=N` in the address bar.
3. Hand-type `/admin/nina?avatar=notanid` and `/admin/nina?avatar=AAAAAAAAAAAA` (well-formed, no such
   row). Expect the album root, nothing selected, no error.

**Exit criteria:** clicking the new header icon over any search hit lands the operator on
`/admin/nina` with that photograph selected and `PhotoDescription` mounted, for a hit in another
folder and for a hit on a later page of its folder; the `?avatar=` parameter is gone from the URL
afterwards and the URL that replaces it reloads to the same place; `npm run typecheck` and
`npm test` are green.

## Handoffs

- **Phase 2** owns `PhotoDescription.tsx` and `SelectionPane.tsx`. This phase lands the operator on
  that pane and changes nothing inside it; when Phase 2 adds the `search_keywords` control, the
  deep link starts delivering the operator to that field too with no edit here.
- **Phase 2 — the one line in `app/admin/nina/page.tsx` (RECONCILED, do not take it).** Phase 2
  makes `AlbumExplorerPhoto.searchKeywords` a REQUIRED field in
  `components/admin/explorer/model.ts` and must therefore add `searchKeywords: row.searchKeywords,`
  to the album arm's object literal here (`:241`) **in its own commit**. It stays Phase 2's line
  because the three edits are one atomic compile unit — the column (`avatarColumns`), the type
  (`model.ts`) and this construction site. Landing the line here instead would not compile at all
  in this phase: `row.searchKeywords` does not exist until Phase 2's projection change lands. The
  regions are disjoint (this phase edits `:1-24`, `:124-128`, `:311-319` and the file's tail; Phase
  2 edits `:241` only), so git merges the two commits cleanly whichever order they land in.
- **Phase 2 — two co-edited test files.** `lib/nina/queries.test.ts`'s frozen barrel list (one new
  name each — see the Interface Contract) and `components/admin/FileExplorer.test.tsx` (this phase
  edits the `PhotoSearchBar` mock, `baseProps` and appends a `describe`; Phase 2 adds
  `searchKeywords: null` to the album-photo helper at `:167`). Disjoint regions in both files. If
  git conflicts, the resolution is **keep both sides** — neither edit subtracts anything.
- **The lingering search summary.** `PhotoSearchBar` keeps its own `summary` line (e.g. *"N foto
  cocok"*) and its typed query in local state. The landing clears `FileExplorer`'s `search`, so the
  results sheet goes away, but the bar's summary sentence stays on screen until the operator clears
  or re-runs the search. Fixing it means a prop into `PhotoSearchBar` (that file is not this phase's
  to edit, and the keep-the-query behaviour is arguably the better half of the trade) — left as a
  follow-up card, not a step.
- **A duplicate `FileTextIcon`.** `components/admin/ErrorLogList.tsx` already has a private copy of
  the same Lucide `file-text`. Consolidating the repo's inline glyphs into
  `components/admin/photoIcons.tsx` is a real cleanup and a real diff across several files; it is
  not R1, and doing it here would put this phase in a file Phase 2's `SelectionPane` also imports.
  Left alone.
- **`?avatar=` on the Media arm.** Ignored by construction. If a future phase wants "jump to this
  message image", that is a second parameter over a second table (`nina_message_images` has no
  folder), not a widening of this one.
- **Knip.** `NinaAvatarLocation` is exported so the barrel can name the return type, and is
  referenced only inside its own module today. If `npm run knip` flags it, annotate at the symbol
  (this repo's rule) rather than un-exporting a type that is part of the query layer's public shape.

## Rollback

Nothing in this phase writes to the database or changes a schema, so a plain `git revert` of the
commit is complete and safe. Reverting by hand means: delete `lib/admin/albumDeepLink.ts` and its
test; remove `locateNinaAvatar` / `NinaAvatarLocation` from `lib/nina/queries/avatars.ts` and the
`'locateNinaAvatar'` entry (and header note) from `lib/nina/queries.test.ts`; drop `id` and
`headerAction` from `components/ui/PhotoViewer.tsx` and their tests; restore
`SearchResultsGrid.tsx`'s `photos` map and `<PhotoViewer>` block and delete its `FileTextIcon`;
remove `deepLinkId` and the landing effect from `FileExplorer.tsx` (and from `baseProps`, plus the
new `describe`); revert the `?avatar=` arm and the two helpers in `app/admin/nina/page.tsx`; drop
the new `describe` in `tests/admin.photoSearch.test.ts`. A stale `/admin/nina?avatar=<id>` link
minted before the revert then reads as an unknown parameter and is ignored, which is the correct
degradation.
