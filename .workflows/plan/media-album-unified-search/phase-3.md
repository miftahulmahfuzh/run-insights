# Phase 3: UI — Media keyword box, merged search results, pointer-row messaging

**Plan set:** `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md`
**Analysis:** `20260917-091446-W0FK_code_analyzer.md`
**Satisfies:** R1 (merged search is *visible* and navigable), R2 (a Media photo gets the keyword and negative-keyword boxes), R3 (a pointer album row says so, and edits there write through)
**Depends on:** Phase 1, Phase 2
**Difficulty:** NORMAL
**Package:** `components/admin/explorer` (plus `app/admin/nina`, and one line of `lib/admin/albumDeepLink.ts`)

---

## What Phase 2 actually provides (RECONCILED 2026-09-17 — these are no longer assumptions)

`.workflows/plan/media-album-unified-search/phase-2.md` **did not exist on disk while this plan was
written** (the phase planners ran concurrently), so this section was originally eight assumptions.
The reconciler has since read Phase 2's file in full and settled every one of them. **Two were
wrong, one was a gap in Phase 2, and the rest were right.** The table below is now a statement of
fact, and every step in this plan has been rewritten to match it — do not "repair" a step back
toward the old assumption.

| # | Phase 2's ACTUAL contract | Where this phase consumes it | Verdict |
|---|---|---|---|
| A1 | **`editNinaMessageImageSearchKeywordsAction(input: { id: string; searchKeywords: string })`, exported from the NEW module `lib/admin/chatPhotoKeywordActions.ts`**, returning `ChatPhotoActionResult` (`{ ok, error?, id?, note? }`) | `MediaPane.tsx` import block + the `onSaveKeywords` closure (Step 3); `MediaPane.test.tsx` (Step 9) | **WAS WRONG.** This plan assumed `editChatPhotoSearchKeywordsAction` on `chatPhotoActions.ts`. Both the NAME and the MODULE differ. Steps 3a, 3c, 9a, 9c, 9d and the `model.ts` comments in Steps 1–2 are corrected. |
| A2 | **`editNinaMessageImageNegativeSearchKeywordsAction(input: { id: string; negativeSearchKeywords: string })`**, same new module, same result shape | same | **WAS WRONG**, same correction. |
| A3 | `listNinaMediaPhotos`' rows carry `searchKeywords: string \| null` and `negativeSearchKeywords: string \| null` | `app/admin/nina/page.tsx` media arm (Step 8a) | **WAS A GAP IN PHASE 2, NOW CLOSED.** Phase 2's original plan widened `avatarColumns` only and left `imageColumns` alone, so this phase would not have compiled. The reconciler added both columns to `imageColumns`/`NinaImageRow` in **Phase 2's Step 1** — the phase that owns `lib/nina/queries/*`. Nothing changes in this step. |
| A4 | `listNinaAvatarsInFolder`' rows carry `sourceImageId: string \| null` — Phase 2 appends it to `avatarColumns` **after `createdAt`** | `app/admin/nina/page.tsx` album arm (Step 8b): `isPointer: row.sourceImageId !== null` | **CORRECT.** Phase 2 Step 1 does exactly this. There is no computed `row.isPointer`. |
| A5 | **The read redirection is a SECOND, EXPLICIT CALL, not something `listNinaAvatarsInFolder` does.** Phase 2 provides `resolveNinaAvatarLinkedText(userId, rows) → Map<avatarId, { description, searchKeywords, negativeSearchKeywords }>` (`lib/nina/queries/avatarPointer.ts`), and **`app/admin/nina/page.tsx` must call it and apply `linked.get(row.id) ?? row`.** The WRITE half is real: all four album actions branch on `row.sourceImageId` and land on the media row (Phase 2 Step 12). | `app/admin/nina/page.tsx` album arm (Step 8b) — and the sentence `SelectionPane.tsx` renders depends on it | **WAS WRONG IN THE HALF THAT MATTERS.** The write-through is implemented, so Step 4's copy is TRUE and stays. But the read does NOT arrive for free: without the call added to Step 8b, a pointer row renders three EMPTY boxes under a sentence saying its values live in Media. This was the failure A5 itself flagged; Step 8b now makes the call. |
| A6 | `AdminSearchHit` (`lib/admin/ninaAlbumActions.ts:94`) gains `origin: 'album' \| 'media'` — that exact name and those exact values | `SearchResultsGrid.tsx` (Steps 5–6), fixtures (Steps 11–12) | **CORRECT.** |
| A6b | `AdminSearchHit` ALSO gains **`searchKeywords: string \| null` and `negativeSearchKeywords: string \| null`, both REQUIRED** | every `AdminSearchHit` fixture literal in this phase | **NEW — this phase did not anticipate it.** Steps 11a and 12's fixtures omit them and would fail `tsc --noEmit`. Both steps are corrected. No component reads either field. |
| A7 | `isCurrent` is `false` for every media-origin hit (`rankMedia` writes the literal) and a pointer album row is never ranked (`albumSearchScope`'s `source_image_id IS NULL`) | `SearchResultsGrid.tsx` keeps `hit.isCurrent` unbranched | **CORRECT.** The "Hers" pill needs no `origin` guard. |
| A8 | `deleteNinaAvatarAction(id)` on a POINTER row runs the dependent promotion and the row DELETE, skips the blob release entirely, and adds **no new refusal** | `SelectionPane.tsx` — the delete button is left **byte-for-byte unchanged** | **CORRECT.** |

**Phase 1 is CONFIRMED, not assumed.** `.workflows/plan/media-album-unified-search/phase-1.md` HAD
landed and was read. Its Interface Contract creates exactly the three names A3/A4 above depend on,
spelled the way they are spelled here: `ninaAvatars.sourceImageId` (`nina_avatars.source_image_id`,
`text`, nullable, FK → `nina_message_images.id` `ON DELETE RESTRICT`),
`ninaMessageImages.searchKeywords` and `ninaMessageImages.negativeSearchKeywords` (both
`text`, nullable). So the only open question in A3/A4 is whether Phase 2 threads those columns into
`imageColumns` / `avatarColumns` — not what they are called.

Phase 1 also states, in its own Leaves-alone line, that it adds **no reader or writer** of the four
new columns: `components/admin/explorer/*` and `app/admin/nina/page.tsx` are named as this phase's.
There is no overlap to reconcile between Phases 1 and 3.

**Phase 1 is consumed only through Phase 2.** This phase imports nothing from `lib/db/schema` and
never reaches `lib/nina/queries` from a client module — see Step 8's boundary note.

---

## Goal

After this phase a Media photograph has the same Search-keywords and Negative-keywords boxes an
Album photograph has, wired to Phase 2's media actions; a merged search result set draws media-origin
hits with an honest "in Media" name and a working header link instead of a broken album deep link;
and an Album row that is a pointer at a Media original says so in one sentence, above the boxes whose
values it borrows. No verb anywhere changes behaviour, and no component gains a database import.

## Interface Contract

**Deletes:** none.

**Renames:** none.

**Creates:**
- `AlbumExplorerPhoto.isPointer: boolean` (`components/admin/explorer/model.ts`)
- `MediaExplorerPhoto.searchKeywords: string | null` (`components/admin/explorer/model.ts`)
- `MediaExplorerPhoto.negativeSearchKeywords: string | null` (`components/admin/explorer/model.ts`)
- `hrefForMediaView(): string` (`lib/admin/albumDeepLink.ts`) — `/admin/nina?view=media`
- `whereLabel(hit)` (module-private, `components/admin/explorer/SearchResultsGrid.tsx`)

**Signature changes:** none. Every `PhotoDescription` prop this phase newly passes is already
optional on that component (`PhotoDescription.tsx:112-132`); its contract is unchanged and its only
edit here is a doc correction.

**Requires (from earlier phases):** the nine rows of the "What Phase 2 actually provides" table
above — reconciled against Phase 2's own plan file, not assumed.

**Leaves alone (owned by others, or deliberately out of scope):**
- `lib/db/schema/nina/*` (Phase 1)
- `lib/nina/queries/*`, `lib/admin/chatPhotoActions.ts`,
  `lib/admin/chatPhotoKeywordActions.ts` (Phase 2's new module — imported here, never edited),
  `lib/admin/ninaAlbum*Actions.ts`, `lib/admin/schema.ts`, `lib/admin/chatPhotoSchema.ts`,
  `lib/admin/ninaAlbumSearchActions.ts` (Phase 2)
- `tests/**` (Phase 4) — **including `tests/admin.photoSearch.test.ts` and
  `tests/admin.mediaPane.test.ts`, both of which this phase is deliberately shaped to keep green
  without editing.** See "Two pinned source assertions that shape this phase" below.
- `components/admin/FileExplorer.tsx` — **not touched, on purpose.** See Handoffs H1.
- `components/admin/explorer/PhotoGrid.test.tsx`, `components/admin/FileExplorer.test.tsx` — **no
  edit needed.** Both build their fixture with a trailing `as ExplorerPhoto` assertion
  (`PhotoGrid.test.tsx:27`, `FileExplorer.test.tsx:190`), and a TypeScript assertion tolerates a
  literal missing a required property; neither file has a `origin: 'media'` fixture at all
  (verified by grep). Adding required fields to either arm therefore leaves both compiling.

### Two pinned source assertions that shape this phase

`tests/admin.photoSearch.test.ts` reads these components as TEXT and asserts on the result. Two of
its assertions are load-bearing for the design chosen below, and both belong to a suite this phase
may not edit:

1. **`:162` — `expect(codeLines(grid)).not.toContain('/admin/nina?')`.** The results grid may not
   hand-build a route. This is why `hrefForMediaView()` is added to the grammar module
   (`lib/admin/albumDeepLink.ts`) rather than spelled inline, and why the media link is not a
   template string in the component.
2. **`:160` — `expect(codeLines(grid)).toContain('hrefForAvatar(photo.id)')`.** That exact substring
   must survive. Step 6's ternary preserves it verbatim; do not refactor it into a helper that takes
   the id as a differently-named argument.

Also pinned, and satisfied by construction: `:59` (`'{!isMediaView && ('` in `FileExplorer.tsx` —
untouched, H1), `:90` (the tile slice starts at `<li key={hit.id}` — kept), `:100-103` (no
`border`, no `rounded-chip`, no `p-1` inside the `<li>` — nothing is added inside it),
`:112` (`'hit.thumbUrl ?? hit.url'` — kept), `:128` (`'photos[viewerIndex] != null'` — kept),
`:152` (`not.toContain('hit.description')` — kept), `:166`/`:171` (`headerAction={` and
`onClick={() => setViewerIndex(null)}` — both kept verbatim).

## Files

| File | Action | What changes |
|---|---|---|
| `components/admin/explorer/model.ts` | modify | `AlbumExplorerPhoto` gains `isPointer`; both arms' keyword doc comments lose the now-false "ALBUM-ONLY / the other table has no such column" premise; `MediaExplorerPhoto` gains `searchKeywords`/`negativeSearchKeywords`; its `isCurrent` comment stops claiming adoption copies bytes |
| `components/admin/explorer/MediaPane.tsx` | modify | header doc: the draft's consumer LINKS rather than copies; `<PhotoDescription>` gains the four keyword props wired to Phase 2's two media actions |
| `components/admin/explorer/SelectionPane.tsx` | modify | one-sentence pointer note above the describe section; the two keyword comments lose the "a media row's table has neither" premise. **No verb changes.** |
| `components/admin/explorer/PhotoDescription.tsx` | modify | **comment only** — the "absent, not disabled" docstring's stated reason is no longer true for Media |
| `components/admin/explorer/PhotoSearchBar.tsx` | modify | **comment only** — the docstring's "the search is ALBUM-WIDE" section now also says which TABLES are searched |
| `components/admin/explorer/SearchResultsGrid.tsx` | modify | per-origin `where` label via `whereLabel`; per-origin header-link destination and accessible name |
| `lib/admin/albumDeepLink.ts` | modify | add `hrefForMediaView()`; amend the "zero imports" header with its one reasoned exception |
| `app/admin/nina/page.tsx` | modify | album arm calls `resolveNinaAvatarLinkedText` once and maps the three redirected fields through it, plus `isPointer`; media arm maps the two new keyword columns; three stale comments corrected |
| `components/admin/explorer/MediaPane.test.tsx` | modify | fixture gains the two fields; two new cases for the keyword boxes |
| `components/admin/explorer/SelectionPane.test.tsx` | modify | both fixtures gain their new fields; two new cases for the pointer note |
| `components/admin/explorer/SearchResultsGrid.test.tsx` | modify | fixtures gain `origin`; three new cases for the media-origin tile and link |
| `components/admin/explorer/PhotoSearchBar.test.tsx` | modify | the hit fixture gains `origin: 'album'` (honesty; no behaviour asserted) |

---

## Implementation Steps

### Step 1: `model.ts` — `AlbumExplorerPhoto` gains `isPointer`, and both keyword comments stop claiming exclusivity

**File:** `components/admin/explorer/model.ts:68-94`
**Change:** replace the whole `AlbumExplorerPhoto` block. The reasoning about *why* the two keyword
fields sit on the arm rather than on `ExplorerPhotoBase` survives — but the reason changes from "the
other table has no such column" (false as of Phase 1) to "the two columns are on two tables with two
write paths". The decision to keep them per-arm is deliberate and recorded: **no consumer reads
either field off the `ExplorerPhoto` union.** Verified by grep — the only readers are
`SelectionPane.tsx:416,421` (already narrowed to `AlbumExplorerPhoto` by the dispatcher) and, after
Step 3, `MediaPane.tsx` (already narrowed to `MediaExplorerPhoto` by its prop type). Promoting them
to the base would gain nothing and would cost each arm's comment the ability to name its own table's
action.

**Code:**

```ts
/** One row of the album: an `nina_avatars` row, narrowed to what a browser needs. */
export interface AlbumExplorerPhoto extends ExplorerPhotoBase {
  origin: 'album'
  /**
   * TRUE when this album row is a POINTER at a Media photograph rather than a file of its own —
   * `nina_avatars.source_image_id IS NOT NULL` (media-album-unified-search R3, 2026-09-17).
   *
   * The pane reads it for exactly ONE purpose: to say, in a sentence, that this photograph's
   * description and keywords live on the linked `nina_message_images` row, and that editing them
   * here edits that row. It gates NO verb. Crop, folder move, delete and "make current" all behave
   * for a pointer exactly as they do for an ordinary album row, because the promotion changed where
   * the BYTES and the PROSE live — not what an album row can do.
   *
   * A `boolean` and not the linked id: no link is minted from that id and no second read is issued,
   * so carrying a `nina_message_images` primary key across the serialization boundary would be a
   * field with no reader — the same argument `announcedAt` and `pathname` lose in this file's
   * header.
   */
  isPointer: boolean
  /**
   * The operator's hand-written search phrases, or `null`. R2, 2026-09-15.
   *
   * On the ARM rather than on `ExplorerPhotoBase`, and the reason changed on 2026-09-17 without the
   * conclusion changing. It used to be "`nina_message_images` has no such column"; since
   * media-album-unified-search R2 that table HAS one and `MediaExplorerPhoto` carries the pair too.
   * What still forces the split is that these are two columns on two tables with two write paths —
   * an album row's is `editNinaAvatarSearchKeywordsAction`, a media row's is
   * `editNinaMessageImageSearchKeywordsAction` — so a consumer that read the field off the `ExplorerPhoto`
   * union without narrowing on `origin` first would be a consumer that does not yet know which
   * action it is allowed to call. No shared component reads it off the union today: both mounts
   * (`AlbumSelectionPane` here, `MediaPane` there) receive an already-narrowed row.
   *
   * For a POINTER row (`isPointer`) this value is the LINKED MEDIA ROW's. The read layer redirects
   * it (plan invariant 3: a pointer never independently stores one), so the box shows what the media
   * photograph stores and the save writes back to that same row — which is what makes *"editing in
   * one place will automatically synchronize it with other location"* true by construction rather
   * than by a sync mechanism.
   *
   * Unlike `description` this IS rendered — the rail's keyword box shows and edits it. Invariant 5
   * is untouched: it is an ADMIN surface, nothing runner-facing reads it, and it never reaches a
   * model except as part of the text this row's vector is computed from, server-side.
   */
  searchKeywords: string | null
  /**
   * The operator's hand-written EXCLUSION phrases, or `null`. R2 follow-up, 2026-09-15.
   *
   * Same per-arm placement, for `searchKeywords`' revised reason above, and the same pointer
   * redirection. Unlike `searchKeywords` this value is never folded into the vector — it is read
   * only by the ranker, against the operator's typed query — but it IS rendered and edited here for
   * the identical reason: the rail is where the operator looks at the photo while deciding what it
   * should never answer to.
   */
  negativeSearchKeywords: string | null
}
```

**Impact:** `isPointer` is required, so every construction site of an `AlbumExplorerPhoto` must
supply it: `app/admin/nina/page.tsx:260` (Step 7) and `SelectionPane.test.tsx:87` (Step 10).
`PhotoGrid.test.tsx` and `FileExplorer.test.tsx` are unaffected — both cast with `as ExplorerPhoto`.

---

### Step 2: `model.ts` — `MediaExplorerPhoto` gains the two keyword fields, and its `isCurrent` comment stops claiming a byte copy

**File:** `components/admin/explorer/model.ts:96-139`
**Change:** replace the whole `MediaExplorerPhoto` block. Two edits beyond the new fields: the
`isCurrent` doc asserts *"Adoption (`setChatPhotoAsAvatarAction`) COPIES the bytes into
`nina_avatars`"*, which Phase 2 reverses; and the fields are placed directly after `crop` so the
describe-family fields sit together exactly as they do on the album arm.

**Code:**

```ts
/**
 * One row of the Media view: an original `nina_message_images` row, the superset
 * `listNinaMediaPhotos` reads. Everything the Chat-photos surface knew about such a row
 * (`components/admin/chatPhotoModel.ts`) collapses into this arm as that surface merges away —
 * including its two load-bearing docstrings: `pathname` is never parsed, and an orphan
 * (`messageId: null`) is a first-class member, not an error.
 */
export interface MediaExplorerPhoto extends ExplorerPhotoBase {
  origin: 'media'
  /**
   * Always `null`, and typed as the LITERAL so a media row cannot grow a thumbnail by accident:
   * the table has no thumbnail column (`lib/nina/album.ts:80-105`'s argument), so the grid's
   * `photo.thumbUrl ?? photo.url` fallback is the only render path — the accepted cost behind
   * `NINA_CHAT_PHOTO_PAGE_SIZE = 48`.
   */
  thumbUrl: null
  /**
   * Always `false`. Adoption (`setChatPhotoAsAvatarAction`) mints an `nina_avatars` row, and it is
   * THAT row which carries `is_current` — a message image is never itself her face.
   *
   * Since media-album-unified-search R3 (2026-09-17) the minted row is a POINTER at this one rather
   * than a byte copy, which changes nothing about this field: the pointer is still the album row,
   * `is_current` is still that row's column, and this row still answers `false`.
   */
  isCurrent: false
  /** Identity (all three null): `resolveCrop` folds it to centred `object-cover`. Framing begins
   * only when an adoption mints an avatar row that can store one. */
  crop: NinaCropInput
  /**
   * The operator's hand-written search phrases for THIS photograph, or `null`.
   * media-album-unified-search R2, 2026-09-17 — `nina_message_images.search_keywords`, the column
   * Phase 1 added so that *"every single picture in any directory"* can carry them.
   *
   * On the arm and not on `ExplorerPhotoBase` for the reason `AlbumExplorerPhoto.searchKeywords`
   * spells out: two tables, two write paths. This one's is
   * `editNinaMessageImageSearchKeywordsAction` (`lib/admin/chatPhotoKeywordActions.ts`).
   *
   * Rendered and edited by `MediaPane`'s `PhotoDescription` mount, which is the whole of R2's UI
   * half. When an album pointer names this row, this is the single stored value BOTH panes show.
   */
  searchKeywords: string | null
  /**
   * The operator's hand-written EXCLUSION phrases for this photograph, or `null`. Same round, same
   * column family (`nina_message_images.negative_search_keywords`), same per-arm reasoning.
   *
   * Never folded into the vector — the ranker reads it fresh against the typed query, exactly as it
   * does for an album row.
   */
  negativeSearchKeywords: string | null
  /** The table's own kind: `'generated'` (her worker) or `'upload'` (his composer). */
  kind: NinaImageKind
  /** `photoSideOf(kind)`, computed on the server exactly as `galleryPhotos` computes it. */
  side: NinaPhotoSide
  /**
   * The generation sidecar, carried in full — `/admin` is the one surface where reading it is the
   * point. Non-null only while the generated bytes are still the ones the prompt produced:
   * `updateNinaChatPhotoBlob` nulls it on replace, which is why a replaced row offers no prompt
   * affordance in the phase that renders one.
   */
  prompt: string | null
  /**
   * The bubble this photograph hangs off, or NULL once it has outlived one — a session delete
   * orphans the row instead of destroying it. An ORPHAN is a first-class member of the Media
   * collection; the pane says so in words rather than printing an empty cell.
   */
  messageId: string | null
  /** Position within its message's bubble. `0` for everything the worker wrote. */
  sortOrder: number
}
```

**Impact:** both fields are required, so every `MediaExplorerPhoto` construction site must supply
them: `app/admin/nina/page.tsx:195` (Step 7), `MediaPane.test.tsx:57` (Step 9),
`SelectionPane.test.tsx:109` (Step 10).

---

### Step 3: `MediaPane.tsx` — wire the keyword boxes, and correct the header's copy premise

**File:** `components/admin/explorer/MediaPane.tsx:11-21` (imports), `:31-40` (header doc),
`:283-293` (the mount)

**Change 3a — imports.** Replace lines 11-14:

```tsx
import {
  describeChatPhotoAction,
  editChatPhotoDescriptionAction,
} from '@/lib/admin/chatPhotoActions'
import {
  editNinaMessageImageNegativeSearchKeywordsAction,
  editNinaMessageImageSearchKeywordsAction,
} from '@/lib/admin/chatPhotoKeywordActions'
```

**TWO import statements, and that is not a style choice.** Phase 2 put the two media keyword actions
in a **new** `'use server'` module, `lib/admin/chatPhotoKeywordActions.ts`, rather than appending
them to the 1 148-line `chatPhotoActions.ts` — the same seam-per-module split the album side already
has (`ninaAlbumDescribeActions.ts` beside `ninaAlbumAvatarActions.ts`). The describe/edit pair still
comes from `chatPhotoActions`. Both blocks are alphabetical within themselves and the two modules
sort in the order shown.

*(Names verified against Phase 2's plan file, 2026-09-17. This phase originally guessed
`editChatPhotoSearchKeywordsAction` / `editChatPhotoNegativeSearchKeywordsAction` on
`chatPhotoActions.ts`; both halves of that guess were wrong — see A1/A2.)*

**Change 3b — the header's framing paragraph.** Replace the block currently at `:31-40`
(`── THE FRAMING HALF IS ADOPTION, AND THE DRAFT HAS NOWHERE TO PERSIST ──` through the `worn` latch
sentence) with the text below. The crop half of the claim is still true — `nina_message_images` has
no crop columns and Phase 1 added none — so only the "copies the bytes into a fresh `avatar-`
object" clause changes:

```tsx
/**
 * ── THE FRAMING HALF IS ADOPTION, AND THE DRAFT HAS NOWHERE TO PERSIST ──────────────────────
 * A media row has no crop columns (`nina_message_images` has none — and
 * media-album-unified-search Phase 1 added keyword and embedding columns to this table, not crop
 * ones), so there is nothing for a "Save framing" to write to. `CropStudio` + the two sanity
 * circles render with a DRAFT crop that starts at identity and resets to identity, and the draft's
 * ONE consumer is `setChatPhotoAsAvatarAction`, which receives `scale`/`x`/`y` at click time.
 *
 * What that action does with them changed on 2026-09-17 (R3): it no longer fetches these bytes and
 * `put()`s a second Blob object. It mints an `nina_avatars` row that POINTS at this one — same
 * bytes, one object, and the album row stores the crop while this row stores the photograph. The
 * pane is unchanged by that: the draft it hands over is the same three numbers, and the album row
 * is still the only side that can keep them.
 *
 * The `worn` latch disables the button once the action answered `ok` — a live button under a face
 * she already wears would be a lie; a second click would not duplicate anything (the source-key
 * lookup sees to that), but the operator should not have to know that.
 */
```

**Change 3c — the mount.** Replace `:283-293` (the `THE DESCRIBE SECTION (R3)` comment and the
`<PhotoDescription>` element) with:

```tsx
      {/*
       * THE DESCRIBE SECTION (R3) — the media arm's twin of `AlbumSelectionPane`'s mount. Same
       * component, same section, this table's actions; after an Add or Replace the `after()` pass
       * fills the field in moments, which is what the empty note promises.
       *
       * ── THE KEYWORD BOXES ARE NEW HERE, AND THAT IS THE WHOLE OF R2's UI ──────────────────
       * media-album-unified-search R2, 2026-09-17, in the user's words: *"every single picture in
       * any directory must be able to be image searched and we must be able to add search keyword
       * and negative search keyword to each of them."* Until Phase 1 this table had no such
       * columns, so this mount passed neither prop and `PhotoDescription` rendered neither block —
       * absent, not disabled. It has them now, so the props travel, and the shape of the wiring is
       * `AlbumSelectionPane`'s verbatim (`SelectionPane.tsx`): the value prop and its save closure
       * are handed in together, and the closure names THIS table's action so a rename in either
       * action family fails at this call site rather than inside a component that guessed.
       */}
      <PhotoDescription
        description={photo.description}
        emptyNote="She cannot talk about this photo until it is described — reload in a moment if it was just added or replaced, or write it yourself."
        onSave={(text) => editChatPhotoDescriptionAction({ id: photo.id, description: text })}
        onRedescribe={() => describeChatPhotoAction({ id: photo.id })}
        searchKeywords={photo.searchKeywords}
        onSaveKeywords={(text) =>
          editNinaMessageImageSearchKeywordsAction({ id: photo.id, searchKeywords: text })
        }
        negativeSearchKeywords={photo.negativeSearchKeywords}
        onSaveNegativeKeywords={(text) =>
          editNinaMessageImageNegativeSearchKeywordsAction({
            id: photo.id,
            negativeSearchKeywords: text,
          })
        }
      />
```

**Impact:** a Media selection now shows three boxes instead of one. `PhotoDescription`'s single
`busy` lock already serialises all four verbs across the row (`PhotoDescription.tsx:56-68`), so no
new concurrency question arises. `tests/admin.mediaPane.test.ts` stays green: its assertions are
`<PhotoDescription` present, `describeChatPhotoAction` present, the `photo.prompt != null` regexes,
and the absence of `MediaDescription`/`EyeIcon`/`prompt == null` — none of which this step touches.

---

### Step 4: `SelectionPane.tsx` — the pointer note, and two corrected comments

**File:** `components/admin/explorer/SelectionPane.tsx:396-425`

**Change:** replace the block from the `THE DESCRIBE SECTION (R3)` JSX comment through the closing
`/>` of `<PhotoDescription>`. Three things happen and nothing else in the file changes — in
particular the icon row (`:295-395`) is untouched: crop save, reset, "make current", share, download
and delete all keep their current shape for a pointer row, per A8 and the plan's invariant 2.

The note is placed ABOVE `<PhotoDescription>`, in the gap between the icon row and the section's own
`mt-5 border-t` hairline, so it reads as the opening line of the describe area it is about rather
than as a footnote under boxes the operator has already typed into. Styling is
`PhotoDescription`'s own note idiom verbatim (`text-[12px] leading-relaxed font-medium text-ink-3` —
see `PhotoDescription.tsx:341,401,465`): plain, factual, one sentence, no exclamation, no icon, no
colour. It is **not** a `role="alert"` and **not** a warning: nothing is blocked, and Phase 2's
redirection means a save from here is correct.

**Code:**

```tsx
      {/*
       * ── R3, 2026-09-17: A POINTER ROW SAYS WHAT IT IS ─────────────────────────────────────
       * When this album entry was minted by "Set as her profile picture" over a Media photograph it
       * is a LINK, not a file of its own (`nina_avatars.source_image_id`): the bytes, the
       * description and both keyword lines live on the `nina_message_images` row it names, and the
       * read layer hands them here already redirected. So the three boxes below are showing the
       * MEDIA photograph's values, and saving any of them writes to that row — which is exactly the
       * user's ask, *"editing image description, search keyword, negative keyword in one place will
       * automatically synchronize it with other location"*, and is therefore worth one sentence
       * rather than being left to be discovered.
       *
       * Informational and nothing else. Editing is not blocked, no control is disabled, and no
       * confirmation is added — the write-through is the feature, not a hazard. The pane's own
       * verbs (framing, make current, share, download, remove) are untouched for a pointer: R3
       * changed where the bytes and the prose live, not what an album row can do.
       */}
      {photo.isPointer && (
        <p className="mt-4 text-[12px] leading-relaxed font-medium text-ink-3">
          This one is a link to a photo in Media — its description and keywords are stored there, so
          editing them here changes that photo too.
        </p>
      )}

      {/*
       * THE DESCRIBE SECTION (R3 of the explorer round). The stored prose, editable by hand, and
       * the vision model one click away — always available, overwriting, no confirmation. The
       * ALBUM closures are spelled here because this component already knows its table:
       * `AlbumSelectionPane` receives an `AlbumExplorerPhoto` (Phase 2's dispatcher narrowed it),
       * so no `origin` read and no branch is needed — the media arm's twin mount lives in
       * `MediaPane.tsx`.
       *
       * R2 added the keyword box to this arm and R2's follow-up the negative-keyword box beside it.
       * Since media-album-unified-search R2 (2026-09-17) the media arm mounts BOTH boxes too, from
       * its own table's columns and its own table's actions — so these props are no longer what
       * distinguishes the two arms, and the closures below are what does: they name
       * `nina_avatars`' actions, and for a pointer row those actions redirect the write to the
       * linked media row rather than storing anything here.
       */}
      <PhotoDescription
        description={photo.description}
        emptyNote="She cannot talk about this photo until it is described — it fills in on its own once the photo is hers, or write it yourself."
        onSave={(text) => editNinaAvatarDescriptionAction({ id: photo.id, description: text })}
        onRedescribe={() => describeNinaAvatarAction(photo.id)}
        searchKeywords={photo.searchKeywords}
        onSaveKeywords={(text) =>
          editNinaAvatarSearchKeywordsAction({ id: photo.id, searchKeywords: text })
        }
        negativeSearchKeywords={photo.negativeSearchKeywords}
        onSaveNegativeKeywords={(text) =>
          editNinaAvatarNegativeSearchKeywordsAction({ id: photo.id, negativeSearchKeywords: text })
        }
      />
```

**Impact:** one new conditional paragraph for pointer rows; zero change for every existing album row
(`isPointer: false`). `tests/admin.mediaPane.test.ts:31-37` still passes — it asserts
`isMediaRow(photo)`, `<MediaPane key={photo.id}`, the `onRemoved` prop signature and the presence of
`<PhotoDescription` / `editNinaAvatarDescriptionAction`, all of which survive verbatim.

---

### Step 5: `SearchResultsGrid.tsx` — the per-origin "where" label

**File:** `components/admin/explorer/SearchResultsGrid.tsx:8-9` (imports), `:36-41` (the docstring's
third difference), `:94` (the `where` line), and a new module-private helper after the component.

**Change 5a — imports.** Replace lines 8-9:

```tsx
import { hrefForAvatar, hrefForMediaView } from '@/lib/admin/albumDeepLink'
import { NINA_FOLDER_ROOT_LABEL, NINA_MEDIA_NODE_LABEL } from '@/lib/admin/filetree'
```

`NINA_MEDIA_NODE_LABEL` is `'Media'` (`lib/admin/filetree/mediaView.ts`), already re-exported by the
barrel and already the word this screen prints for that collection — `FileExplorer.tsx:484` renders
`${page.total} in ${NINA_MEDIA_NODE_LABEL}`, and the breadcrumb's second crumb is the same constant.
Reusing it is what keeps the tile's name in the app's existing voice instead of minting new copy.

**Change 5b — the docstring's item 3.** Replace `:36-41`:

```tsx
 *   3. **Where the photograph is, in the accessible name.** *"i am struggling to see the image i
 *      want"* is a complaint about not knowing where a photograph is filed, and the search answers
 *      it — so the tile says `<filename> in 2026/bali`, and the album root says `Album`
 *      (`NINA_FOLDER_ROOT_LABEL`, the same string the breadcrumb and the tree print). Since
 *      media-album-unified-search R1 (2026-09-17) the ranked set also holds `nina_message_images`
 *      rows, which are filed in no folder at all — those say `in Media`
 *      (`NINA_MEDIA_NODE_LABEL`, the same string the breadcrumb and the tree badge print for that
 *      collection), because a media hit labelled `in Album` would name a folder it is not in and a
 *      media hit labelled with an empty folder would name nothing. It stays out of the VISIBLE
 *      tile for `PhotoGrid`'s own reason: a text label under every tile is what broke the sheet.
```

**Change 5c — the `where` line.** Replace `:94`:

```tsx
          const where = whereLabel(hit)
```

**Change 5d — the helper.** Add immediately after the `SearchResultsGrid` function's closing brace
(before the `FileTextIcon` block's comment), so it stays outside the `<li>` slice
`tests/admin.photoSearch.test.ts:90` reads:

```tsx
/**
 * Where a hit LIVES, in one phrase, for the tile's accessible name and tooltip.
 *
 * Two collections, two grammars, and this function is the only place they meet. An album hit is
 * filed in a folder, so the folder's path is the answer and the root's own name is
 * `NINA_FOLDER_ROOT_LABEL` — the identical fold the breadcrumb and the folder tree apply, which is
 * why "Album" needs no special case anywhere else. A media hit is filed NOWHERE (`folder` is `''`
 * on that arm by construction — `app/admin/nina/page.tsx`'s media mapping sets it to the album root
 * only to keep one shape serving both arms, and nothing links into it), so folding its `''` through
 * the album rule would print `Album` over a photograph that is not in the album. It gets the name
 * its collection actually has.
 */
function whereLabel(hit: AdminSearchHit): string {
  if (hit.origin === 'media') return NINA_MEDIA_NODE_LABEL
  return hit.folder === '' ? NINA_FOLDER_ROOT_LABEL : hit.folder
}
```

**Impact:** a media hit's tile reads `2026-09-01 m1 in Media` instead of `... in Album`. Album hits
are byte-identical to today. The `<li>` body is unchanged, so every class-shape assertion in
`tests/admin.photoSearch.test.ts:88-135` holds.

---

### Step 6: `SearchResultsGrid.tsx` — the per-origin header link

**File:** `components/admin/explorer/SearchResultsGrid.tsx:140-174` (the `headerAction` slot)

**Change:** replace the slot's comment and body. `hits[viewerIndex]` rather than a lookup by
`photo.id`: `photos` is built 1:1 from `hits` in the same `useMemo`, `PhotoViewer` is a CONTROLLED
overlay (`index` is this component's `viewerIndex`, and paging goes out through `onIndex` —
`PhotoViewer.tsx:89-91,164`), so the index is the one handle that cannot drift. `viewerIndex` is a
`const` binding narrowed to `number` by the enclosing `viewerIndex !== null &&` guard, and the
narrowing survives into this closure; `hits[viewerIndex]` is still `AdminSearchHit | undefined` under
`noUncheckedIndexedAccess`, which the optional chain answers.

**Code:**

```tsx
          /*
           * R1. The way out of *"saya liat search result irrelevant, saya bisa langsung ke
           * deskripsinya"*: a link, in the header, to where this photograph's description is read
           * and edited.
           *
           * A `<Link>` and not a `router.push` button, which is the split `FileExplorer` already
           * keeps: a folder OPERATION needs a navigator because it learns where to go only once
           * the server answers, and this one knows its destination up front. So the operator also
           * gets middle-click and open-in-new-tab — which on this screen is worth having, because
           * a new tab keeps the ranked result set alive in this one while the description gets
           * fixed in the other.
           *
           * ── TWO DESTINATIONS SINCE THE SET MERGED (2026-09-17) ─────────────────────────────
           * An ALBUM hit keeps the deep link it has always had: `?avatar=<id>`, which the server
           * resolves into a folder and a page and hands back as `deepLinkId` so the row arrives
           * SELECTED, with its pane open.
           *
           * A MEDIA hit has no such parameter, and minting one is not this phase's work: resolving
           * a `nina_message_images` id into a page of `listNinaMediaPhotos` is a database read, and
           * the only place that can run is the query layer. So the media link is the collection and
           * not the row — `/admin/nina?view=media`, page one, nothing pre-selected. That is a
           * deliberate and recorded trim (see this phase's plan, Handoffs H2): a slightly less
           * precise destination is worth having, and dropping the control for half the result set
           * — leaving the operator an overlay with no way out of it — is not.
           *
           * Which is why the accessible name differs with it. "Open this photo's description"
           * would be a promise the media branch does not keep, and a control whose name overstates
           * where it goes is worse than one that says plainly what it opens.
           *
           * `photo.id == null` is unreachable from this file (every hit has one) and is still
           * checked, because `ViewerPhoto.id` is optional for the review surfaces and a `!` here
           * would be an assertion about a shared type this file does not own. `hits[viewerIndex]`
           * and not a lookup by id: `photos` is built 1:1 from `hits`, the overlay's index is this
           * component's own state, and an index that is the source of truth for the picture on
           * screen is the source of truth for the link beside it.
           *
           * The overlay is closed on the way out for IMMEDIATE feedback. It is not the guarantee:
           * an album landing clears the search (`FileExplorer`'s deep-link effect), which unmounts
           * this whole component and the overlay with it. Both, so the lightbox is never left
           * hanging over the page the link just opened during the navigation.
           */
          headerAction={(photo) => {
            if (photo.id == null) return null
            const media = hits[viewerIndex]?.origin === 'media'
            const name = media
              ? 'Open Media, where this photo lives'
              : "Open this photo's description"
            return (
              <Link
                href={media ? hrefForMediaView() : hrefForAvatar(photo.id)}
                onClick={() => setViewerIndex(null)}
                aria-label={name}
                title={name}
                className="grid size-11 place-items-center rounded-pill text-card"
              >
                <FileTextIcon className="size-5" />
              </Link>
            )
          }}
```

**Impact:** album behaviour is identical (same href, same name, same close-on-click), so
`SearchResultsGrid.test.tsx:139-172` passes unchanged. `tests/admin.photoSearch.test.ts:160` still
finds the literal `hrefForAvatar(photo.id)`; `:162` still finds no `/admin/nina?`; `:166` still
finds `headerAction={`; `:171` still finds `onClick={() => setViewerIndex(null)}` inside the slot.

---

### Step 7: `lib/admin/albumDeepLink.ts` — `hrefForMediaView()`

**File:** `lib/admin/albumDeepLink.ts:1-24` (header) and end of file

**Change:** the route may not be spelled in the grid (`tests/admin.photoSearch.test.ts:162`), so the
media destination joins the album one in the module that already owns this screen's URL grammar. The
file's stated zero-imports rule gains exactly one exception, and the exception's reason is the rule's
own: a URL grammar that spelled `view=media` itself would be the second spelling of a parameter this
repo deliberately keeps in one place.

**Code 7a — header, replacing `:12-24`:**

```ts
/**
 * ── WHY NOT IN `lib/admin/filetree` ─────────────────────────────────────────────────────────
 * That barrel's runtime surface is FROZEN by `tests/admin.filetreeBarrel.test.ts` at the 35 names
 * the pre-split single file had — no fewer, and explicitly no more, because a barrel that lazily
 * grows would undo the 2026-09-11 dead-export audit through the back door. So the deep link gets
 * its own module rather than a 36th name there — and, since 2026-09-17, so does the media arm's
 * view link, for the same reason and in the same file.
 *
 * ── ONE IMPORT, AND IT IS THE RULE RATHER THAN AN EXCEPTION TO IT ────────────────────────────
 * This module was written with zero imports, under `lib/admin/filetree/`'s purity rule: a client
 * component and a Server Component both import it, so it may not reach anything server-only. That
 * rule is intact — `lib/admin/filetree` is the import-pure grammar directory, checked as such by
 * `tests/admin.filetreeBarrel.test.ts`'s purity half — and taking the two `?view=media` constants
 * from it is what the rule is FOR: `hrefForMediaView` below writes the parameter that
 * `readExplorerView` reads, and a grammar that re-spelled the key or the value here would be
 * exactly the drift this module's header opens by arguing against.
 *
 * The id's SHAPE check is deliberately NOT here — `ADMIN_AVATAR_ID_RE` (`lib/admin/avatars.ts`) is
 * applied by the page, beside the `?folder=` and `?page=` validation that already lives there, so
 * this module stays a grammar and never becomes a validator.
 */

import { NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE } from '@/lib/admin/filetree'
```

**Code 7b — the new export, appended after `hrefForAvatar`:**

```ts
/**
 * `/admin/nina?view=media` — the Media collection, page one, with nothing pre-selected.
 *
 * The media arm's answer to `hrefForAvatar`, and deliberately NOT its twin. An album hit can be
 * deep-linked to the row because `locateNinaAvatar` turns an id into a folder and an offset; there
 * is no such read for `nina_message_images`, and adding one is a query-layer change rather than a
 * URL grammar. So this names the COLLECTION: the operator lands where the photograph is, on the
 * page the pager calls one, and finds it there.
 *
 * No `?page=`, for `FileExplorer`'s `hrefForMediaView(1)`'s reason: page 1 is the ABSENCE of the
 * parameter, so the canonical `/admin/nina?view=media` and a navigated-back-to first page are one
 * URL rather than two that mean the same thing.
 */
export function hrefForMediaView(): string {
  const params = new URLSearchParams()
  params.set(NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE)
  return `/admin/nina?${params.toString()}`
}
```

**Impact:** one new export on a module with no frozen surface (grepped: the only assertions naming
it are `tests/admin.photoSearch.test.ts:159-161`, which pin the grid's import of it and the
`hrefForAvatar(photo.id)` call — both preserved). The barrel import is pure in both directions:
`FileExplorer.tsx:12` already imports `NINA_MEDIA_VIEW_PARAM` from the same barrel inside a
`'use client'` module, and `app/admin/nina/page.tsx:11` imports from it on the server.

**Reconciler note:** this is a `lib/admin/` file. It is **not** an action module and not named in
Phase 2's Owns line, but if Phase 2 turns out to touch it, this step is the one to merge by hand.

---

### Step 8: `app/admin/nina/page.tsx` — both arms map the new fields

**File:** `app/admin/nina/page.tsx:195-226` (media arm) and `:260-282` (album arm)

**The boundary this file keeps.** It is the only module in this phase that imports
`@/lib/nina/queries`, and it stays that way: it is a Server Component, the mapping from row to prop
happens here, and the client components below it receive plain serializable objects. No client module
in `components/` gains a query import — `tests/admin.photoSearch.test.ts:144-149` asserts exactly
that for the three search modules, and Step 3/4/5's edits import only action modules and pure
grammar.

**The pointer redirect is an EXPLICIT second read, and forgetting it is the one way this phase ships
a lie.** (Reconciler, 2026-09-17 — this plan originally assumed, in A5, that
`listNinaAvatarsInFolder` returned a pointer row's borrowed prose already. It does not, and Phase 2
never intended it to: that read is the file-manager projection over `avatarColumns` and stays one
indexed statement.) Phase 2 provides
`resolveNinaAvatarLinkedText(userId, rows) → Map<avatarId, { description, searchKeywords,
negativeSearchKeywords }>` (`lib/nina/queries/avatarPointer.ts`), a batched `inArray` over only the
rows that ARE pointers — zero statements when the page has none, which is the common case today.
This page calls it once per album render and applies `linked.get(row.id) ?? row`.

Without the call, `SelectionPane`'s new sentence ("its description and keywords are stored there")
sits above three EMPTY boxes, because a pointer row's own four columns are NULL by construction. The
write half already works — Phase 2's four album actions branch on `row.sourceImageId` — so the
symptom would be "I typed keywords, saved, and they vanished on reload", which is the worst shape
this bug could take.

**One disambiguation the implementer must not get wrong.** `imageColumns` ALREADY carries a field
named `sourceImageId` (`lib/nina/queries/columns.ts:63` → `nina_message_images.source_image_id`),
and it means something completely different: that a CHAT row re-shares another chat photo (F37). The
pointer flag comes from the AVATAR row's new column of the same name
(`nina_avatars.source_image_id`), read on the album arm. Two tables, two columns, one spelling — do
not read the media row's.

**Change 8a — media arm.** Replace `:195-226`:

```tsx
    photos = listed.rows.map((row): MediaExplorerPhoto => ({
      origin: 'media',
      id: row.id,
      url: row.blobUrl,
      /* `null`, permanently: the table has no thumbnail column (`lib/nina/album.ts:80-105`), so
         the grid's `thumbUrl ?? url` fallback is the only render path. */
      thumbUrl: null,
      /* A message image is filed nowhere. The value is the album root's path — but nothing links
         into it: the breadcrumb and the pane draw their trail from `view`, folder verbs never see a
         media row, and the search sheet names this arm `Media` rather than folding `''` through the
         album root's label (`SearchResultsGrid`'s `whereLabel`). */
      folder: NINA_FOLDER_ROOT,
      filename: `${row.createdAt.toISOString().slice(0, 10)} ${row.id}`,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      /* On this table the kind IS the provenance: 'generated' from her worker, 'upload' from his
         composer. Rendered as the pane's Source row, never assumed. */
      source: row.kind,
      /* Never her current face: adoption mints an `nina_avatars` row — since 2026-09-17 a POINTER
         at this one rather than a byte copy — and it is that row which carries `is_current`. */
      isCurrent: false,
      description: row.description,
      /* media-album-unified-search R2, 2026-09-17. `nina_message_images` carries both keyword
         columns now (Phase 1), so the Media pane mounts the same two boxes the album rail has and
         this arm has a value to put in them. When an album pointer names this row, these are the
         single stored values BOTH panes show. */
      searchKeywords: row.searchKeywords,
      negativeSearchKeywords: row.negativeSearchKeywords,
      /* Identity crop — `resolveCrop` folds the three nulls to centred object-cover. Framing
         arrives only when adoption mints an avatar row that can store one. */
      crop: { scale: null, x: null, y: null },
      createdAt: row.createdAt.toISOString(),
      kind: row.kind,
      side: photoSideOf(row.kind),
      prompt: row.prompt,
      messageId: row.messageId,
      sortOrder: row.sortOrder,
    }))
```

**Change 8b — album arm.** Two edits: the redirect read, then the map.

**First**, immediately above the `photos = listed.rows.map(...)` at `:260` — after the
`Promise.all([...])` at `:242-247` has produced `listed` — insert the batch resolve:

```tsx
    /*
     * media-album-unified-search R3, 2026-09-17. A POINTER album row
     * (`nina_avatars.source_image_id` non-null) stores NO description and NO keywords of its own —
     * all four of those columns are permanently NULL on it, and the operator's real values live on
     * the `nina_message_images` row it names (plan invariant 3). This is the one read that follows
     * the link, and the map below is where it is applied.
     *
     * ONE statement for the whole page, not one per row: `resolveNinaAvatarLinkedText` filters to
     * the pointers itself, de-duplicates the image ids and issues a single `inArray`. A page with no
     * pointer on it — every page in the album today — issues ZERO statements and costs nothing, so
     * this is not paid for by the common case.
     *
     * It is NOT folded into `listNinaAvatarsInFolder`: that read is the file-manager projection over
     * `avatarColumns` and stays one indexed statement. The redirect is a property of how this SCREEN
     * renders a pointer, not of what an album row is.
     */
    const linked = await resolveNinaAvatarLinkedText(userId, listed.rows)
```

and add `resolveNinaAvatarLinkedText` to the existing `@/lib/nina/queries` import block at `:19-26`.

**Second**, replace `:260-282`:

```tsx
    photos = listed.rows.map((row): AlbumExplorerPhoto => ({
      origin: 'album',
      id: row.id,
      url: row.blobUrl,
      thumbUrl: row.thumbUrl,
      folder: row.folder,
      filename: row.filename ?? row.id,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      source: row.source,
      isCurrent: row.isCurrent,
      /*
       * media-album-unified-search R3, 2026-09-17. `nina_avatars.source_image_id` non-null is what
       * makes this row a POINTER at a `nina_message_images` original: same bytes, no second Blob
       * object, and the description and both keyword lines stored on that row rather than this one.
       * The rail reads it to say so in a sentence and for nothing else — every verb is unchanged.
       *
       * The BOOLEAN crosses the boundary, not the id: no link is minted from it and no second read
       * is issued, so the id would be a field with no reader — the same argument `pathname`,
       * `announcedAt`, `sourceKey` and `thumbPathname` lose two comments above.
       *
       * NOT the same column as `nina_message_images.source_image_id` (`imageColumns`, the media arm
       * above), which is F37's chat-row re-share provenance. Two tables, two meanings, one spelling.
       */
      isPointer: row.sourceImageId !== null,
      /*
       * ── THE THREE REDIRECTED FIELDS ─────────────────────────────────────────────────────────
       * `linked.get(row.id)` is present ONLY for a pointer row, and when it is, its three values
       * are the linked `nina_message_images` row's. `?? row` is therefore not a fallback for a
       * failure — it is the ordinary-album-row path, which is almost every row: an ordinary row's
       * own columns ARE the truth, so there is nothing to look up and nothing to override.
       *
       * Spelled as one `text` binding rather than three `linked.get(row.id)?.x ?? row.x` reads so
       * the three fields cannot drift apart — a pointer must borrow all three or none. A pointer
       * whose target has somehow gone is absent from the map and degrades to its own NULL columns,
       * i.e. "not described yet", which is a state this pane has always rendered. (The FK is
       * `ON DELETE RESTRICT`, so that is unreachable while the constraint holds.)
       *
       * This is what makes the pane's new sentence true: the value shown and the value a save
       * writes are the same row's, by construction rather than by a sync mechanism.
       */
      ...(() => {
        const text = linked.get(row.id) ?? row
        return {
          description: text.description,
          /* R2, 2026-09-15. Rendered and edited by the rail's keyword box. For an ordinary row this
           * is `avatarColumns`' own column; for a pointer it is the media row's. */
          searchKeywords: text.searchKeywords,
          /* R2 follow-up, 2026-09-15. Rendered and edited by the rail's negative-keyword box; same
           * per-row story as `searchKeywords` directly above. */
          negativeSearchKeywords: text.negativeSearchKeywords,
        }
      })(),
      crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
      createdAt: row.createdAt.toISOString(),
    }))
```

*(If the IIFE spread reads badly against this file's house style, the equivalent is to hoist
`const text = linked.get(row.id) ?? row` into a block-bodied arrow — `(row): AlbumExplorerPhoto => {
const text = …; return { … } }`. Same three bindings, same single lookup; pick whichever the
surrounding map already looks like. What must NOT happen is three separate `linked.get` calls.)*

**Impact:** both arms satisfy their (now wider) interfaces. If assumption A3 or A4 is unmet the
build fails here with a named missing property, which is the correct place for that failure.

---

### Step 9: `MediaPane.test.tsx` — fixture plus two keyword cases

**File:** `components/admin/explorer/MediaPane.test.tsx:34-41` (the mock), `:57-80` (the fixture),
and two new cases appended before the closing `})` of the `describe('MediaPane')` block.

Style matched exactly to the file as it stands: `@vitest-environment happy-dom` at the top,
`vi.hoisted` for every action, a `vi.mock` of the whole action module, `userEvent.setup()` per case,
`mockReset().mockResolvedValue({ ok: true })` in `beforeEach`.

**Change 9a — the action mocks. TWO `vi.mock` calls, one per module.** Phase 2 put the keyword
actions in their own `'use server'` module, so mocking `chatPhotoActions` alone would leave the real
`chatPhotoKeywordActions` loaded (and with it the real query layer). Replace `:34-41`:

```tsx
const {
  describeChatPhotoAction,
  editChatPhotoDescriptionAction,
  editNinaMessageImageNegativeSearchKeywordsAction,
  editNinaMessageImageSearchKeywordsAction,
} = vi.hoisted(() => ({
  describeChatPhotoAction: vi.fn(),
  editChatPhotoDescriptionAction: vi.fn(),
  editNinaMessageImageNegativeSearchKeywordsAction: vi.fn(),
  editNinaMessageImageSearchKeywordsAction: vi.fn(),
}))
vi.mock('@/lib/admin/chatPhotoActions', () => ({
  describeChatPhotoAction,
  editChatPhotoDescriptionAction,
}))
vi.mock('@/lib/admin/chatPhotoKeywordActions', () => ({
  editNinaMessageImageNegativeSearchKeywordsAction,
  editNinaMessageImageSearchKeywordsAction,
}))
```

**A `vi.mock` factory REPLACES the module**, so each factory must list every name this file's import
graph pulls from that module and no more. `chatPhotoActions` is mocked down to the two names
`MediaPane` imports; if another module in the mounted tree imports a third name from it, add that
name to the factory rather than dropping the mock — the failure mode is a silent `undefined`, which
is exactly what bit `tests/admin.chatPhotos.test.ts` in this same set (Phase 2, Step 14l).

**Change 9b — the fixture.** Insert the two fields after `description: null,` at `:66`:

```tsx
    description: null,
    searchKeywords: null,
    negativeSearchKeywords: null,
```

**Change 9c — `beforeEach`.** Add two lines after `:89`:

```tsx
    editNinaMessageImageSearchKeywordsAction.mockReset().mockResolvedValue({ ok: true })
    editNinaMessageImageNegativeSearchKeywordsAction.mockReset().mockResolvedValue({ ok: true })
```

**Change 9d — two new cases**, appended after the `'shows the empty note naming a media row
specifically, not the album wording'` case:

```tsx
  /*
   * media-album-unified-search R2, 2026-09-17. The Media arm used to mount `PhotoDescription`
   * WITHOUT the keyword props, so the block did not render at all — absent, not disabled. Its
   * table has the columns now, so the boxes are here and they save to THIS table's actions. The
   * album twin of this assertion lives in `SelectionPane.test.tsx`, and neither may drift.
   */
  it('wires the keyword box to the media keyword action with the row id', async () => {
    const user = userEvent.setup()
    render(
      <MediaPane {...baseProps()} photo={mediaPhoto({ id: 'kw-me', searchKeywords: 'tete' })} />,
    )

    const box = screen.getByLabelText('Search keywords')
    await user.type(box, ', putih')
    await user.click(screen.getByRole('button', { name: /save the search keywords/i }))

    expect(editNinaMessageImageSearchKeywordsAction).toHaveBeenCalledWith({
      id: 'kw-me',
      searchKeywords: 'tete, putih',
    })
    // The album action family must never be reachable from this arm.
    expect(setChatPhotoAsAvatarAction).not.toHaveBeenCalled()
  })

  it('wires the negative-keyword box to its own media action with the row id', async () => {
    const user = userEvent.setup()
    render(
      <MediaPane
        {...baseProps()}
        photo={mediaPhoto({ id: 'neg-me', negativeSearchKeywords: 'tete' })}
      />,
    )

    const box = screen.getByLabelText('Negative keywords')
    await user.type(box, ', payudara')
    await user.click(screen.getByRole('button', { name: /save the negative keywords/i }))

    expect(editNinaMessageImageNegativeSearchKeywordsAction).toHaveBeenCalledWith({
      id: 'neg-me',
      negativeSearchKeywords: 'tete, payudara',
    })
  })
```

**Impact:** covers the whole of R2's media UI. Note the existing `'wires PhotoDescription to the
media describe/edit actions'` case is untouched and still passes — `PhotoDescription`'s single
`busy` lock is per-verb, not per-mount.

---

### Step 10: `SelectionPane.test.tsx` — fixtures plus two pointer cases

**File:** `components/admin/explorer/SelectionPane.test.tsx:87-107` and `:109-132` (fixtures), and
two new cases appended to the `describe('AlbumSelectionPane (via SelectionPane)')` block.

**Change 10a — `albumPhoto`.** Insert after `negativeSearchKeywords: null,` at `:99`:

```tsx
    isPointer: false,
```

**Change 10b — `mediaPhoto`.** Insert after `description: null,` at `:119`:

```tsx
    searchKeywords: null,
    negativeSearchKeywords: null,
```

**Change 10c — two new cases**, appended after the `'wires the negative-keyword box to its own album
action with the row id'` case:

```tsx
  /*
   * media-album-unified-search R3, 2026-09-17. A pointer album row borrows its description and both
   * keyword lines from the media photograph it names, and the pane says so in one sentence. It is
   * INFORMATIONAL: every control stays live, because a save from here writes through to that row.
   */
  it('tells the operator when this album row is a link to a Media photo', () => {
    render(<SelectionPane {...baseProps()} photo={albumPhoto({ isPointer: true })} />)
    expect(screen.getByText(/link to a photo in Media/)).toBeInTheDocument()
  })

  it('says nothing of the sort for an ordinary album row, and never disables a verb for a pointer', () => {
    const { rerender } = render(
      <SelectionPane {...baseProps()} photo={albumPhoto({ isPointer: false })} />,
    )
    expect(screen.queryByText(/link to a photo in Media/)).not.toBeInTheDocument()

    // The note is the whole change: a pointer keeps every verb an ordinary row has.
    rerender(
      <SelectionPane {...baseProps()} photo={albumPhoto({ isPointer: true, isCurrent: false })} />,
    )
    expect(screen.getByRole('button', { name: 'Remove this photo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Set as her profile picture' })).toBeEnabled()
    expect(screen.getByLabelText('Search keywords')).toBeEnabled()
  })
```

**Impact:** pins both halves of the decision — the sentence appears for a pointer, and nothing else
changes for one.

---

### Step 11: `SearchResultsGrid.test.tsx` — fixtures plus three merged-result cases

**File:** `components/admin/explorer/SearchResultsGrid.test.tsx:25-51` (fixtures), plus three new
cases.

**Change 11a — fixtures.** Add `origin` to both, and add a third for the media arm. Replace
`:18-51`:

```tsx
/*
 * EVERY field of `AdminSearchHit`, not only the seven this grid reads: the type is
 * `ExplorerPhotoBase` + `score` + `origin` + the two keyword columns (phase 2 widened it), and all
 * of them are REQUIRED, so a partial literal does not typecheck. The unread ones are set to
 * plausible values and asserted nowhere — `description` in particular is carried and never
 * rendered, which is `model.ts:49`'s rule and worth one fixture proving the grid ignores it. The
 * two keyword fields are the same story: the search action carries them so a result opened in the
 * pane needs no second round trip, and this grid never reads either one.
 */
const HIT: AdminSearchHit = {
  id: 'a1',
  origin: 'album',
  url: 'https://blob.example/nina/avatar-a1.jpg',
  thumbUrl: 'https://blob.example/nina/avatar-a1-thumb.jpg',
  folder: '2026/bali',
  filename: 'DSC_0031.jpg',
  width: 1536,
  height: 2048,
  bytes: 412_003,
  source: 'upload',
  isCurrent: false,
  description: 'She is on a trail at sunrise.',
  searchKeywords: 'trail, sunrise',
  negativeSearchKeywords: null,
  crop: { scale: null, x: null, y: null },
  createdAt: '2026-09-01T02:30:00.000Z',
  score: 0.81,
}

const SECOND: AdminSearchHit = {
  ...HIT,
  id: 'a2',
  url: 'https://blob.example/nina/avatar-a2.jpg',
  thumbUrl: null,
  folder: '',
  filename: 'DSC_0044.jpg',
  isCurrent: true,
  score: 0.64,
}

/*
 * media-album-unified-search R1, 2026-09-17: the ranked set is merged across both tables now, so a
 * hit can be a `nina_message_images` row. `folder` is `''` on that arm by construction (a message
 * image is filed nowhere) and `isCurrent` is `false` by the query layer's contract — a media row is
 * never itself her face, and a pointer album row is never itself ranked.
 */
const MEDIA_HIT: AdminSearchHit = {
  ...HIT,
  id: 'm1',
  origin: 'media',
  url: 'https://blob.example/nina/selfie-m1.jpg',
  thumbUrl: null,
  folder: '',
  filename: '2026-09-01 m1',
  source: 'generated',
  isCurrent: false,
  score: 0.72,
}
```

**Change 11b — three new cases.** Append a new `describe` block at the end of the file:

```tsx
describe('R1 — a merged set holds both collections, and says which is which', () => {
  it('names a media hit by its collection, never by a folder it is not in', () => {
    render(<SearchResultsGrid hits={[MEDIA_HIT]} />)
    // `in Album` would name the album root, where this photograph is not.
    expect(screen.getByRole('button', { name: '2026-09-01 m1 in Media' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /in Album/ })).toBeNull()
  })

  it('draws both origins in one sheet, in the order the ranker gave them', () => {
    render(<SearchResultsGrid hits={[HIT, MEDIA_HIT]} />)
    const tiles = screen.getAllByRole('listitem')
    expect(tiles).toHaveLength(2)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['DSC_0031.jpg in 2026/bali', '2026-09-01 m1 in Media'])
  })

  it('sends a media hit to the Media collection, not to a dead ?avatar= deep link', () => {
    render(<SearchResultsGrid hits={[HIT, MEDIA_HIT]} />)
    fireEvent.click(screen.getByRole('button', { name: '2026-09-01 m1 in Media' }))

    const link = screen.getByRole('link', { name: 'Open Media, where this photo lives' })
    expect(link).toHaveAttribute('href', '/admin/nina?view=media')
    // The album's own name must not be borrowed for a destination that does not open a pane.
    expect(screen.queryByRole('link', { name: "Open this photo's description" })).toBeNull()

    // And the album branch is unchanged, in the same mounted set: paging back proves it.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(
      screen.getByRole('link', { name: "Open this photo's description" }),
    ).toHaveAttribute('href', '/admin/nina?avatar=a1')
  })
})
```

Note the last case's paging step: `MEDIA_HIT` is index 1 of two, so one `ArrowRight` wraps to index
0 (`stepIndex` is circular — the existing `'pages between results, and only between results'` case
pins that), which is the album hit. This proves the link follows `viewerIndex` across an origin
change, which is the one thing the index-based lookup could get wrong.

---

### Step 12: `PhotoSearchBar.test.tsx` — the fixture gains `origin`

**File:** `components/admin/explorer/PhotoSearchBar.test.tsx:34-53`

**Change:** the bar itself needs NO source change (verified by reading it in full: it holds the
draft, calls `searchNinaAvatarsAction`, counts `result.hits.length` and forwards the array — it
reads no field of a hit, so a wider hit type passes through untouched). Only the fixture's honesty
changes, so the literal still describes a real `AdminSearchHit`. Replace `:34-53`:

```tsx
    // A whole `AdminSearchHit` — the type is `ExplorerPhotoBase` + `score` + `origin` + the two
    // keyword columns (phase 2 widened it, all required), and a literal handed to `onResults` as
    // `readonly AdminSearchHit[]` must satisfy all of it. `origin` is what the merged set
    // (media-album-unified-search R1) discriminates on; this component never reads it — nor either
    // keyword field — which is exactly why one album-origin fixture is enough here.
    const hits = [
      {
        id: 'a1',
        origin: 'album',
        url: 'https://blob.example/a1.jpg',
        thumbUrl: null,
        folder: '',
        filename: 'a1.jpg',
        width: 1024,
        height: 1024,
        bytes: 180_000,
        source: 'upload',
        isCurrent: false,
        description: null,
        searchKeywords: null,
        negativeSearchKeywords: null,
        crop: { scale: null, x: null, y: null },
        createdAt: '2026-09-01T02:30:00.000Z',
        score: 0.77,
      },
    ]
```

**Impact:** none on behaviour; the existing six cases pass unchanged.

---

### Step 13: two comment-only corrections to files whose behaviour does not change

Both are docstrings that will be FALSE the moment Step 3 lands. This repo treats its docstrings as
load-bearing, and a comment that argues for an absence the code no longer has is worse than no
comment. **Neither file's exported contract, props, or rendered output changes.**

**13a — `components/admin/explorer/PhotoDescription.tsx:70-75`.** Replace:

```tsx
 * ── THE KEYWORD BOXES ARE OPTIONAL, AND ABSENT IS NOT DISABLED ───────────────────────────────
 * R2, 2026-09-15. The rule stands and the example that motivated it retired. It was: `search_keywords`
 * is a `nina_avatars` column, `nina_message_images` had no counterpart, so the Media arm mounted this
 * panel WITHOUT `onSaveKeywords` and the whole block did not render — the same call
 * `FileExplorer.tsx:368` makes for the search field: *"a search field over it would be a field that
 * cannot answer — absent, not disabled."* Since media-album-unified-search R2 (2026-09-17) BOTH
 * tables carry both columns and both arms pass both pairs, so no caller exercises the absence today.
 * The props stay optional and the blocks stay conditional anyway: the contract is "a box that shows a
 * value it cannot save is worse than no box", and the next table to mount this panel should inherit
 * that rule rather than rediscover it.
```

**13b — `components/admin/explorer/PhotoSearchBar.tsx:30-35`.** Replace:

```tsx
 * ── THE SEARCH IS WIDE, AND THAT IS THE POINT ───────────────────────────────────────────────
 * `?folder=` is not sent. The complaint is *"i am struggling to see the image i want"*, which is
 * not a complaint about one folder — it is not knowing which folder. Since
 * media-album-unified-search R1 (2026-09-17) it is not a complaint about one TABLE either: the one
 * action behind this row ranks `nina_avatars` and `nina_message_images` together and hands back a
 * single deduplicated list, so *"every single picture in any directory"* is one query's answer.
 * This component is unchanged by that — it holds the draft, counts what came back and forwards the
 * array; it reads no field of a hit, which is why widening the hit reached it as nothing at all.
 * The breadcrumb above still says where browsing would resume; the summary line below says how many
 * photographs matched, anywhere.
```

**Impact:** `tests/admin.photoSearch.test.ts`'s `codeLines()` filter strips every line beginning with
`*`, `//`, `/*` or `{/*`, so both edits are invisible to that suite by construction.

---

## Verification

**Typegen (required in a fresh worktree — `PageProps<'/admin/nina'>` is generated):**
```
cd /home/miftah/.worktrees/run-insights/media-album-unified-search && npx next typegen
```

**Build / typecheck:**
```
cd /home/miftah/.worktrees/run-insights/media-album-unified-search && npx tsc --noEmit
```
`vitest` does not typecheck; `tsc --noEmit` is the gate that catches a missing `isPointer` or a
missing keyword field at a construction site.

**Tests — this phase's own surface first:**
```
cd /home/miftah/.worktrees/run-insights/media-album-unified-search && npx vitest run \
  components/admin/explorer \
  components/admin/FileExplorer.test.tsx \
  tests/admin.photoSearch.test.ts \
  tests/admin.mediaPane.test.ts \
  tests/admin.filetreeBarrel.test.ts
```
The last three are the suites this phase is shaped NOT to break; run them explicitly so a violation
of a pinned source assertion is an immediate, named failure rather than a surprise in the full sweep.

**Then the full suite:**
```
cd /home/miftah/.worktrees/run-insights/media-album-unified-search && npm test
```
A red in `components/admin/explorer/*.test.tsx` with varying counts under a parallel sweep is the
known `MemoryTable`-family flake pattern; re-run the single file with
`npx vitest run --no-file-parallelism <file>` before treating it as a real failure.

**Manual check** (dev server, `/admin/nina`):
1. Open the Media view, select any photograph — **Search keywords** and **Negative keywords** boxes
   are there below the description, each with its own Save glyph and character counter.
2. Type into Search keywords, save, reload — the value is still there.
3. From the Album view, run a text search that should match a chat photo. A media hit's tile
   tooltip and accessible name read `… · Media · #<id>`; opening it and clicking the header glyph
   lands on `/admin/nina?view=media` rather than on an album folder with nothing selected.
4. Promote a Media photo with "Set as her profile picture", then select the new Album row: the
   sentence *"This one is a link to a photo in Media …"* is above the description box, every control
   in the icon row is live, and the keyword box already holds whatever the Media photo held.
5. Edit the keywords from the Album pointer, then open the Media original — the same text is there.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green; a Media selection renders three
editable boxes wired to `editNinaMessageImage*KeywordsAction` from
`@/lib/admin/chatPhotoKeywordActions`; a merged result set draws media-origin tiles named `in Media`
with a working header link; a pointer Album row renders the note and no disabled control; **and a
pointer Album row's three boxes are NOT empty — they hold the linked Media row's values, which is
manual check 4 and is the whole point of the `resolveNinaAvatarLinkedText` call in Step 8b.**

## Handoffs

**H1 — `components/admin/FileExplorer.tsx` is deliberately not touched, and the search bar therefore
stays absent on the Media view.** Two facts drive this:

- `tests/admin.photoSearch.test.ts:58-60` pins the literal `'{!isMediaView && ('` in that file, and
  `tests/**` belongs to Phase 4. Mounting the bar on both views turns that suite red at the end of
  this phase, which violates the plan's invariant 1 ("passes `vitest` at the end of every phase").
- R1 is satisfied without it: the merged search runs from the Album view — the default view, the one
  the bare `/admin/nina` URL opens — and returns both origins in one list. What is missing is a
  convenience (starting a search while standing in Media), not a capability.

Two things are left for whoever takes it (Phase 4, or a follow-up): (a) mount `PhotoSearchBar`
unconditionally and drop `const activeSearch = isMediaView ? null : search` (`FileExplorer.tsx:182`),
which requires editing `tests/admin.photoSearch.test.ts:58-60` in the same commit; (b) the JSX
comment at `FileExplorer.tsx:423-425` — *"The Media arm's photographs are a different table with no
description column … a search field over it would be a field that cannot answer"* — is false on both
clauses now (that table has had a `description` column all along, and has an embedding since Phase 1)
and should be corrected whether or not (a) is done.

**H2 — there is no per-photo deep link into the Media pane, and this phase does not build one.**
A media hit's header control lands on `/admin/nina?view=media`, page one, nothing pre-selected
(Step 6/7). Building the precise twin of `?avatar=` needs a `locateNinaMediaPhoto(userId, id)` that
turns an id into an offset inside `listNinaMediaPhotos`' ordering — a query-layer function, i.e.
Phase 2's package, which this phase may not write. The follow-up shape, if it is ever wanted, is
exactly the album's: a `NINA_MEDIA_PHOTO_PARAM` beside `NINA_AVATAR_PARAM` in
`lib/admin/albumDeepLink.ts`, the locate call beside `locateNinaAvatar` in `app/admin/nina/page.tsx`,
and `deepLinkId` reused on the media arm in `FileExplorer.tsx` (whose current comment at `:240-241`
correctly states that it is never non-null under `?view=media` and would need updating).

**H3 — the 18 pre-existing `source_key LIKE 'chat-photo:%'` Album rows are ordinary rows, not
pointers,** per the plan's Scope. They will render with `isPointer: false` and no note, which is
correct: they really do own their own bytes and their own prose. Nothing to do; recorded so a future
reader does not file it as a bug.

**H4 — Phase 4's test gaps this phase leaves open:** no test covers `app/admin/nina/page.tsx`'s two
mappings (there is no suite for that file today, and adding one means standing up the query layer);
and no test covers `hrefForMediaView()` directly — it is exercised only through
`SearchResultsGrid.test.tsx`'s third new case.

## Rollback

Every change in this phase is additive at the type level and conditional at the render level, so
reverting it alone is a clean `git revert` of this phase's commit(s):

- `model.ts` loses three fields; the two construction sites in `app/admin/nina/page.tsx` and the
  three test fixtures lose the lines that fill them. Nothing that existed before read any of them.
- `MediaPane.tsx` loses four props on an already-optional contract, so `PhotoDescription` stops
  rendering the two blocks — the exact pre-phase state, not a broken one.
- `SelectionPane.tsx` loses one conditional `<p>`. No verb, no handler, no class on any control
  changes in either direction.
- `SearchResultsGrid.tsx` returns to the unconditional `hrefForAvatar` and the album-only `where`
  fold; a media hit then gets a dead `?avatar=` link, which is the state the phase exists to fix and
  is survivable for as long as a revert lasts.
- `lib/admin/albumDeepLink.ts` loses one export and one import. Nothing else imports
  `hrefForMediaView`.

Reverting this phase does NOT require reverting Phase 1 or 2: the new columns simply go unread by
the UI again, which is the state they shipped in.
