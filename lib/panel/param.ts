/**
 * `/me`'s open detail panel, as a query parameter — F24.
 *
 * ── WHY THE OPEN PANEL IS IN THE URL AT ALL ─────────────────────────────────────────────────
 * `BadgeShelf` used to hold the selection in `React.useState`, and React state is invisible to the
 * phone's back gesture. With a panel open, a back-swipe from the left edge left `/me` altogether;
 * tapping through to a run and coming back landed on a `/me` with no panel. Both are the bug #23
 * describes. A query parameter makes the selection an ordinary history entry, so the gesture
 * closes the panel, and a return from `/r/<id>` restores it.
 *
 * ── ONE PARAMETER, NOT ONE PER SURFACE ──────────────────────────────────────────────────────
 * `/me` will hold two panel surfaces — the badge shelf and, in #25, the personal records table.
 * With `?badge=` and `?record=` as separate parameters, `?badge=tourist&record=most_kcal` is a
 * representable state: two dialogs are told to open at once, and keeping them exclusive means
 * every opener remembering to clear every *other* surface's parameter. That is a registry a later
 * card can silently forget to join, and the failure is two stacked modals rather than a type
 * error.
 *
 * One parameter makes the exclusivity structural — there is one slot, so one panel. Adding a kind
 * is a member on the union below, and an unhandled kind is a `tsc` error at the switch that reads
 * it rather than a second open dialog.
 *
 * ── `.` AND NOT `:` ─────────────────────────────────────────────────────────────────────────
 * `URLSearchParams.toString()` percent-encodes `:` and leaves `.` alone, so the round trip through
 * the address bar reads `?panel=badge.early_bird` rather than `?panel=badge%3Aearly_bird`.
 *
 * ── THE KEY IS A `string`, DELIBERATELY ─────────────────────────────────────────────────────
 * Not `BadgeKey`. This module is shared with the record panel, whose keys come from a different
 * catalog, and narrowing here would import one surface's key union into the other's codec. It also
 * would not buy anything: a URL is user-typed input, so `?panel=badge.nonsense` has to be survivable
 * whatever the type says. `BadgeShelf` already resolves a key against the shelf it was handed and
 * renders nothing when it misses — a stale key closes the panel rather than crashing it, which is
 * the same reasoning that made the shelf hold the key rather than the entry.
 *
 * An unknown *kind*, on the other hand, decodes to null: that is not a stale key, it is not this
 * page's parameter at all.
 */

/** The single query parameter that names the open panel. */
export const PANEL_PARAM = 'panel'

/** Which surface's panel is open. `record` arrives with #25. */
export type PanelKind = 'badge' | 'record'

export interface PanelSelection {
  kind: PanelKind
  /** The catalog key within that surface — unvalidated; see the note above. */
  key: string
}

const KINDS: readonly PanelKind[] = ['badge', 'record']

const SEPARATOR = '.'

export function encodePanelSelection(selection: PanelSelection): string {
  return `${selection.kind}${SEPARATOR}${selection.key}`
}

/**
 * The parameter's value → a selection, or null for "no panel".
 *
 * Split on the FIRST separator only: a key is free to contain a dot, and a value that somehow
 * carries two is still a kind and a key rather than a parse failure.
 */
export function decodePanelSelection(raw: string | null | undefined): PanelSelection | null {
  if (!raw) return null

  const at = raw.indexOf(SEPARATOR)
  if (at <= 0) return null

  const kind = raw.slice(0, at)
  const key = raw.slice(at + 1)
  if (key.length === 0) return null
  if (!isPanelKind(kind)) return null

  return { kind, key }
}

/** The key this surface has open, or null — the shape a list component actually wants. */
export function panelKeyFor(selection: PanelSelection | null, kind: PanelKind): string | null {
  return selection !== null && selection.kind === kind ? selection.key : null
}

function isPanelKind(value: string): value is PanelKind {
  return (KINDS as readonly string[]).includes(value)
}
