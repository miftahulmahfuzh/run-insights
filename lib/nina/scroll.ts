/**
 * Where a returning chat screen starts. R14: *"back-swipe will return to the chat at the exact
 * scroll position (not at the most recent message)"*.
 *
 * ── WHY THIS IS A SIBLING OF `chatview.ts` AND NOT PART OF IT ─────────────────────────────────
 * `lib/nina/chatview.ts` answers "a bubble just arrived — should the page move?". This module
 * answers "the screen just came back — where does it start?". Same units, opposite direction of
 * causation, and they must not share a decision function: phase 4's `decideAutoScroll({ cause:
 * 'mount' })` deliberately jumps to the newest message, which is exactly the behaviour R14 forbids
 * on a back-swipe. Two rules, two modules, one caller that picks between them.
 *
 * ── WHY AN ANCHOR AND AN OFFSET, NOT A `scrollTop` ────────────────────────────────────────────
 * A raw pixel offset is only correct if the document is exactly as tall as it was when we left, and
 * it will not be: Nina may have written while the runner was away (phase 10), a font may settle, an
 * image may load (phase 6). So the mark records **which message was at the top of the viewport and
 * how far below the viewport's top edge it sat**, and restoration re-derives the pixel from wherever
 * that message is now. This is the standard anchor-and-offset restoration, and it degrades honestly:
 * if the anchor is gone, `resolveRestoreTop` returns null and the caller does the ordinary thing.
 *
 * ── WHY IT LIVES IN A URL PARAM ───────────────────────────────────────────────────────────────
 * The back-swipe is a history POP nobody in our code initiated, and `cacheComponents` is off in
 * this app, so `<Activity>` does not keep the chat mounted — the screen really does unmount. The
 * only state that survives a POP for free is the history entry itself, so the mark is encoded into
 * the chat entry's query. Encoding is therefore part of the arithmetic — `~` as the separator
 * (unreserved in a query string, so no percent-encoding, and not a character `lib/id.ts`'s alphabet
 * can produce), a decimal integer for the offset, and a decoder that treats anything it does not
 * recognise as "no mark" rather than throwing. The precedent is `components/ui/usePanelParam.ts`,
 * which encodes a panel selection the same way and for the same gesture (F24).
 */

/** The chat entry's query parameter. `?at=<messageId>~<offset>`. */
export const CHAT_SCROLL_PARAM = 'at'

/**
 * A sanity bound on the decoded offset. The anchor is chosen to be at or just below the viewport's
 * top edge, so a legitimate offset is at most one viewport tall (plus a partial bubble); 20 000 px
 * is far past any phone and still small enough that a hand-edited URL cannot ask us to scroll to a
 * position no document has. Out of range is treated as no mark, never as a clamp — a nonsense mark
 * should produce the default screen, not a silently corrected one.
 */
export const MAX_CHAT_SCROLL_OFFSET_PX = 20000

export interface ChatScrollMark {
  /** `nina_messages.id` of the message that was at the top of the viewport. */
  messageId: string
  /**
   * Signed pixels from the viewport's top edge to that message's top edge. Non-negative in the
   * ordinary case; negative when the runner had scrolled past the last message's top.
   */
  offset: number
}

/** One message's position in *document* coordinates: `rect.top + window.scrollY`. */
export interface ScrollAnchorRow {
  messageId: string
  top: number
}

export interface ScrollGeometry {
  /** `document.documentElement.scrollHeight`. */
  scrollHeight: number
  /** `window.innerHeight`. */
  clientHeight: number
}

export interface RestoreInput {
  mark: ChatScrollMark
  /**
   * The anchor message's current top in document coordinates, or null when no element with that id
   * is in the document any more.
   */
  anchorTop: number | null
  geometry: ScrollGeometry
}

/** `<messageId>~<offset>`. The offset is rounded, because a fractional pixel is noise in a URL. */
export function encodeChatScrollMark(mark: ChatScrollMark): string {
  return `${mark.messageId}~${Math.round(mark.offset)}`
}

/**
 * Tolerant by design. A missing param, a truncated one, an id with a `~` in it, a float, a
 * hand-typed word — all of them mean "no mark", which means "start where you normally would".
 */
export function decodeChatScrollMark(raw: string | null | undefined): ChatScrollMark | null {
  if (raw == null) return null
  const separator = raw.lastIndexOf('~')
  if (separator <= 0 || separator === raw.length - 1) return null

  const messageId = raw.slice(0, separator)
  const offsetText = raw.slice(separator + 1)

  // `nina_messages.id` is nanoid-shaped (lib/id.ts) or the client's own `local-…` id; either way it
  // is short and URL-safe. Anything with a slash, a space or a percent in it did not come from us.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(messageId)) return null
  if (!/^-?\d{1,6}$/.test(offsetText)) return null

  const offset = Number(offsetText)
  if (!Number.isFinite(offset)) return null
  if (Math.abs(offset) > MAX_CHAT_SCROLL_OFFSET_PX) return null

  return { messageId, offset }
}

/**
 * Which message to remember, given where the reader is.
 *
 * The topmost message whose top edge is at or below the viewport's top edge — so the offset is
 * non-negative and small, and the message the runner was reading is the one that comes back to the
 * same place. When the reader is below every message's top (the ordinary "scrolled to the bottom of
 * a long last bubble" case) the last row wins and the offset goes negative, which restores just as
 * exactly.
 *
 * `rows` must be in document order; the DOM produces them that way and sorting here would hide a
 * caller bug.
 */
export function pickScrollAnchor(
  rows: readonly ScrollAnchorRow[],
  scrollTop: number,
): ChatScrollMark | null {
  if (rows.length === 0) return null

  for (const row of rows) {
    if (row.top >= scrollTop) return { messageId: row.messageId, offset: row.top - scrollTop }
  }

  const last = rows[rows.length - 1]
  if (last == null) return null
  return { messageId: last.messageId, offset: last.top - scrollTop }
}

/** The furthest the document can be scrolled. Never negative — a short page clamps to 0. */
export function clampScrollTop(top: number, geometry: ScrollGeometry): number {
  const max = Math.max(0, geometry.scrollHeight - geometry.clientHeight)
  if (!Number.isFinite(top)) return 0
  return Math.min(Math.max(0, top), max)
}

/**
 * The one number the effect needs, or null for "I cannot honour this mark — do the ordinary thing".
 *
 * Null on a missing anchor, and **only** on a missing anchor. Everything else is arithmetic: the
 * anchor's current document position, minus the offset it had, clamped into the document. A
 * conversation that grew while the runner was away therefore still lands on the message they left,
 * with the new messages below them — which is the right answer to both halves of R14 at once.
 */
export function resolveRestoreTop(input: RestoreInput): number | null {
  if (input.anchorTop == null) return null
  return clampScrollTop(input.anchorTop - input.mark.offset, input.geometry)
}
