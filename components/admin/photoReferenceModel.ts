/**
 * The photo-reference picker's rules, as pure functions — R10's UI half.
 *
 * `lib/nina/chatphotos.ts`'s carve-out applied to an operator control: the grid that uses these
 * holds no rules of its own, so every one of them is reachable from `environment: 'node'` vitest
 * with no DOM. `components/admin/chatPhotoUpload.ts` is the precedent for such a module living
 * beside its component rather than in `lib/`, and the reason it is not in `lib/nina/` is
 * ownership: that directory is the image pipeline's, and this is a control's view model.
 *
 * ── NO `'use client'`, DELIBERATELY ─────────────────────────────────────────────────────────────
 * `components/admin/touch.ts`'s rule: nothing here is a hook or an effect, so the module compiles
 * into whichever graph imports it. The picker is a client component and imports the functions; the
 * Server Component that maps the union read into `PhotoReferenceItem[]` imports only the type, and
 * a type erases.
 *
 * ── INVARIANT 5, STRUCTURALLY ───────────────────────────────────────────────────────────────────
 * `lib/nina/chatphotos.ts:13-17` says of its own shape: *"There is no caption field here and there
 * must never be one."* The same sentence governs this file, and here it is load-bearing rather than
 * decorative, because R10 is *"a simple photos grid without any captions"* in the user's own words.
 * `PhotoReferenceItem` therefore carries three fields and no fourth: a tile that never receives a
 * date cannot render one. `ChatPhotoGrid`'s tile renders `photo.createdAt.slice(0, 10)` under the
 * image — that is precisely the line this shape makes unwritable, and
 * `tests/admin.photoReference.test.ts` asserts the field list so a later edit cannot add it back.
 *
 * ── THE SELECTION IS AN OPAQUE STRING, AND THAT IS THE POINT ────────────────────────────────────
 * Phase 1 owns how a chosen reference is stored — a composite of id and source set, or the blob URL
 * itself. Nothing here parses `key`, compares it to a pattern, splits it or builds it. The server
 * computes the same string for a row that it persists for a selection, and the picker's whole
 * contract is `item.key === value`. That keeps this file correct under either of phase 1's choices
 * and keeps the storage vocabulary in the phase that owns it.
 */

/**
 * One photograph, as a tile needs it, and nothing more.
 *
 * Three fields. Do not add a fourth without re-reading the invariant above: every plausible
 * addition — `createdAt`, `filename`, `description`, `folder`, `kind` — is a caption waiting for a
 * `<span>`, and two of them would also announce which set the photograph came from, which R10
 * forbids.
 */
export interface PhotoReferenceItem {
  /**
   * The exact string phase 4's save persists for this photograph, computed on the server from
   * phase 1's storage vocabulary. Opaque here: never parsed, never built, only compared.
   */
  key: string
  /** The original blob. Rendered only when there is no thumbnail. */
  url: string
  /**
   * The album's 256 px derived JPEG, or `null`.
   *
   * **`null` is the common case, not an edge case.** `nina_avatars` has `thumb_url`;
   * `nina_message_images` has no such column at all (`lib/nina/album.ts:80-84`), so every chat
   * photograph in this union arrives with `null` here and renders its original. An empty string is
   * treated as absent too — see `photoReferenceTileSrc`.
   */
  thumbUrl: string | null
}

/** What the grid draws. Built by `photoReferenceView`; the component adds no field to it. */
interface PhotoReferenceTile {
  key: string
  /** `thumbUrl` when the row has one, the original when it does not. */
  src: string
  /** The button's accessible name. There is no visible text on a tile. */
  label: string
  selected: boolean
}

/** Everything the component needs to render, derived in one pass. */
export interface PhotoReferenceView {
  /** One tile per item, in the server's order. Every page is now a real `?page=` window, so the
   * component draws everything it was handed — there is nothing left to reveal in stages. */
  tiles: PhotoReferenceTile[]
  /** Index into the **items**, not into `tiles`. `null` when nothing is selected. */
  selectedIndex: number | null
  /** The selected tile's accessible name, for the status line. `null` when nothing is selected. */
  selectedLabel: string | null
  /**
   * The saved selection matches no photograph on THIS page — it was deleted, or it is on a
   * different page (the picker now reaches the whole deduplicated collection, so a photograph is
   * never permanently out of reach, only ever a `Next`/`Previous` tap away). The grid draws nothing
   * as selected and says so; it does **not** self-heal.
   */
  missing: boolean
}

/**
 * The stored value that means *no reference*.
 *
 * `''` and not `null`, because `nina_tuning.wardrobe` already made this call for this table's
 * sibling — *"`''` is the one empty value, never null"* — and one empty value cannot be confused
 * with the other.
 */
export const PHOTO_REFERENCE_NONE = ''

/**
 * The accessible-name stem, spelled once.
 *
 * `NINA_SIDE_LABEL`'s principle and not its string. The principle is that a photograph's
 * accessible name says *whose* it is and nothing about what is in it
 * (`lib/nina/chatphotos.ts:16-17`). The string is Indonesian and runner-facing, and every other
 * word on `/admin` is English — `ChatPhotoDetail.tsx:121` renders `Hers` / `His` — so importing it
 * would put the one Indonesian phrase in the admin shell into a screen-reader announcement.
 *
 * It is deliberately the SAME for both sets. Album photograph or chat photograph, the tile
 * announces "Nina photo N": nothing in this grid, visible or announced, says which set a
 * photograph came from.
 */
export const PHOTO_REFERENCE_TILE_LABEL = 'Nina photo'

/**
 * The narrowest a tile may ever be, in CSS pixels — the `minmax()` floor in the grid template.
 *
 * This is how a dense iOS-style grid and `docs/design-brief.md`'s 44 pt minimum are reconciled:
 * `auto-fill` drops a column rather than let a tile go under this number, so 92 px is a floor and
 * not an average. At 414 px the admin shell leaves 382 px of content (`app/admin/layout.tsx:109`),
 * which resolves to three or four columns at 112 px or 93 px depending on the panel's own padding —
 * both more than double the minimum. `tests/admin.photoReference.test.ts` asserts both that this
 * number clears 44 and that the class literal is built from it.
 */
export const PHOTO_REFERENCE_MIN_TILE_PX = 92

/**
 * What a tile actually loads.
 *
 * `explorer/PhotoGrid.tsx:22-28`'s expression, with an empty-string guard added because this union
 * crosses a serialization boundary and a column that is `''` rather than `NULL` would otherwise
 * render as a broken image. The fallback half is not defensive padding: every chat photograph in
 * this union has no thumbnail at all.
 */
export function photoReferenceTileSrc(item: PhotoReferenceItem): string {
  const thumb = item.thumbUrl
  return typeof thumb === 'string' && thumb.length > 0 ? thumb : item.url
}

/** The tile's accessible name. 1-based, because it is spoken to a person. */
export function photoReferenceLabel(index: number): string {
  return `${PHOTO_REFERENCE_TILE_LABEL} ${index + 1}`
}

/**
 * Which photograph the stored value points at, or `null`.
 *
 * `null` has two meanings and the caller distinguishes them with `PHOTO_REFERENCE_NONE`: nothing
 * was ever chosen, or what was chosen is not in this list. See `PhotoReferenceView.missing`.
 */
export function photoReferenceIndex(
  items: readonly PhotoReferenceItem[],
  value: string,
): number | null {
  if (value === PHOTO_REFERENCE_NONE) return null
  const at = items.findIndex((item) => item.key === value)
  return at < 0 ? null : at
}

/**
 * What tapping a tile means: choose it, or — if it is already the choice — choose nothing.
 *
 * *"user can select one out of all these photos"* implies one, and an operator who wants no
 * reference at all must have a way back. This is that way, and the **Clear reference** button is
 * the discoverable one beside it.
 */
export function nextPhotoReferenceValue(current: string, key: string): string {
  return current === key ? PHOTO_REFERENCE_NONE : key
}

/**
 * The whole render, derived in one pass so the component branches on data and not on rules.
 *
 * No `reveal`/`total` any more: the server now hands over exactly one `?page=` window (at most
 * `NINA_PHOTO_REF_PAGE_SIZE` rows), so every item in `items` is drawn — there is no larger page to
 * stage a reveal over. Paging further is a real navigation, handled by the component's `page` /
 * `pageCount` props, not by this view.
 */
export function photoReferenceView({
  items,
  value,
}: {
  items: readonly PhotoReferenceItem[]
  value: string
}): PhotoReferenceView {
  const selectedIndex = photoReferenceIndex(items, value)
  const tiles = items.map((item, index) => ({
    key: item.key,
    src: photoReferenceTileSrc(item),
    label: photoReferenceLabel(index),
    selected: index === selectedIndex,
  }))

  return {
    tiles,
    selectedIndex,
    selectedLabel: selectedIndex === null ? null : photoReferenceLabel(selectedIndex),
    missing: value !== PHOTO_REFERENCE_NONE && selectedIndex === null,
  }
}
