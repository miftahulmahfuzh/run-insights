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
export interface PhotoReferenceTile {
  key: string
  /** `thumbUrl` when the row has one, the original when it does not. */
  src: string
  /** The button's accessible name. There is no visible text on a tile. */
  label: string
  selected: boolean
}

/** Everything the component needs to render, derived in one pass. */
export interface PhotoReferenceView {
  tiles: PhotoReferenceTile[]
  /** Index into the **items**, not into `tiles`. `null` when nothing is selected. */
  selectedIndex: number | null
  /** The selected tile's accessible name, for the status line. `null` when nothing is selected. */
  selectedLabel: string | null
  /** How many tiles are in the DOM. Equal to `tiles.length`; named so the caller can read intent. */
  revealed: number
  /** How many photographs the union holds beyond this page. `0` when the page is the whole set. */
  hidden: number
  /**
   * The saved selection matches no photograph in the list — it was deleted, or it is older than
   * this page. The grid draws nothing as selected and says so; it does **not** self-heal.
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
 * How many tiles enter the DOM at once, and how many each **Show more** adds.
 *
 * `NINA_CHAT_PHOTO_PAGE_SIZE`'s number, for `lib/nina/album.ts:80-102`'s recorded reason: the chat
 * half of this union has no thumbnail column, so those tiles fetch ~1 MB originals. 48 of them is
 * a page; 120 of them *"is not a page, it is a download"*. If phase 1's union page is itself 48
 * this constant never shows a button — it exists for the larger page, and it is a reveal over rows
 * already in hand, never a read.
 */
export const PHOTO_REFERENCE_REVEAL_STEP = 48

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
 * How many tiles to draw: what was asked for, never more than there are, and never so few that the
 * selected photograph is off the end.
 *
 * The clamp-up is the rule that keeps the check badge visible. Without it a saved selection at
 * index 60 of a 120-row page would be invisible until the operator pressed **Show more**, and the
 * grid would look as though nothing were chosen while the form said otherwise. `viewerIndex`
 * (`lib/nina/chatphotos.ts:79-83`) is the precedent for clamping a window rather than trusting it.
 */
export function photoReferenceReveal(
  reveal: number,
  count: number,
  selectedIndex: number | null,
): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  const asked = Number.isFinite(reveal) ? Math.trunc(reveal) : PHOTO_REFERENCE_REVEAL_STEP
  const floor = selectedIndex === null ? 0 : selectedIndex + 1
  return Math.min(count, Math.max(asked, floor, 1))
}

/**
 * The whole render, derived in one pass so the component branches on data and not on rules.
 *
 * `total` is the union's full count and may legitimately exceed `items.length` — phase 1 hands one
 * bounded page of *"hundreds of profile pics"*. A `total` smaller than the page in hand is
 * nonsense (a concurrent delete between the count and the page, or a caller passing the wrong
 * number), so it is floored at `items.length` rather than allowed to make `hidden` negative.
 */
export function photoReferenceView({
  items,
  value,
  reveal,
  total,
}: {
  items: readonly PhotoReferenceItem[]
  value: string
  reveal: number
  total: number
}): PhotoReferenceView {
  const selectedIndex = photoReferenceIndex(items, value)
  const revealed = photoReferenceReveal(reveal, items.length, selectedIndex)
  const tiles = items.slice(0, revealed).map((item, index) => ({
    key: item.key,
    src: photoReferenceTileSrc(item),
    label: photoReferenceLabel(index),
    selected: index === selectedIndex,
  }))
  const counted = Number.isFinite(total) ? Math.max(Math.trunc(total), items.length) : items.length

  return {
    tiles,
    selectedIndex,
    selectedLabel: selectedIndex === null ? null : photoReferenceLabel(selectedIndex),
    revealed,
    hidden: counted - items.length,
    missing: value !== PHOTO_REFERENCE_NONE && selectedIndex === null,
  }
}
