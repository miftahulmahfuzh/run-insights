/**
 * The 44-pixel rule, spelled once.
 *
 * `docs/design-brief.md` and `components/ui/Button.tsx:13` already name 44 px as the iOS minimum
 * tap target — `Button size="md"` IS `h-11`, and every `Button` in `components/admin/` already
 * passes it. What was left over is everything that is NOT a `Button`: a chevron, a `×`, a `…`, a
 * `✕`, a pager link, a folder row, a filter chip. Those were written against a mouse and land
 * between 16 px and 24 px on their smallest axis. These two strings are what they borrow, so the
 * number lives in one place rather than in fourteen class attributes that will drift.
 *
 * ── `min-h-11` AND NOT `h-11` ───────────────────────────────────────────────────────────────
 * Several of these controls sit in a flex line whose height is decided by a sibling, or hold text
 * that may wrap to two lines. A fixed height would fight both. A minimum cannot.
 *
 * ── WHY THIS IS NOT IN `components/ui/` ─────────────────────────────────────────────────────
 * `DialSlider.tsx`'s header already argues the case and this file follows it unchanged: the UI
 * barrel is a load-bearing bundle boundary, ten `'use client'` files import it, and an
 * operator-only concern does not join it on the strength of one phase. When a runner-facing
 * control needs the same string, that is the moment to make the case, and it is one rename plus
 * one line in the barrel.
 *
 * No `'use client'`, for `Button.tsx`'s reason: nothing here is a hook or an effect, so the module
 * compiles into whichever graph imports it. `UserPicker.tsx` is a Server Component and imports it;
 * `DialSlider.tsx` is a client component and imports it.
 */

/**
 * A control that is already a block or a flex line — a folder row, a menu row, a text link that
 * has to be tappable. Gives it a floor of 44 px and leaves its width alone.
 */
export const TOUCH_TARGET = 'min-h-11'

/**
 * A glyph control — `×`, `…`, `✕`, a chevron, a pager arrow. 44 × 44 of hit area with the glyph
 * centred inside it, so the icon stays the size it was drawn and only the box around it grows.
 * `inline-flex` rather than `flex` because most of these sit inline in a sentence or a table cell.
 */
export const TOUCH_ICON = 'inline-flex min-h-11 min-w-11 items-center justify-center'
