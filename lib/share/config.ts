/**
 * Every decision `/s/[token]` makes about what a stranger may see, as one constant each with the
 * argument attached.
 *
 * PURE ON PURPOSE — no `server-only`, no `@/lib/env`, no database import. The owner-side panel is a
 * Client Component and reads `SHARE_WARNING` from here; the public page is a Server Component and
 * reads the same flags. A constant with no reason next to it invites a careless flip, so every one
 * of these carries the paragraph that put it where it is (docs/plans/F11-sharing.md §3.3–§3.6).
 */

/* ── What the structured fields disclose (plan §3.3.1) ───────────────────────────────────── */

/**
 * `runs.location` — "Tangerang".
 *
 * Hiding this is close to theatre the moment any screenshot ships: Apple prints the same string in
 * the summary shot's own type, and no CSS crop makes the bytes stop serving it. It is off anyway,
 * because it is one field and it is the only real protection in the one case where protection is
 * still available — **a runner who deselects every photo and shares the metrics alone.**
 */
export const SHARE_SHOWS_LOCATION = false

/**
 * `runs.started_at` / `ended_at` — the five-minute window this person was outdoors.
 *
 * Same reasoning as the location, and the same limit. `occurred_on` (the bare date) is always
 * shown: it answers "which run is this", and a date is a far weaker correlation signal than a date
 * plus a clock time.
 */
export const SHARE_SHOWS_TIME_OF_DAY = false

/**
 * `runs.note` — **deliberately the opposite default from expense-tracking's F09.**
 *
 * That plan shipped notes-visible, reasoning that the owner's own text, sitting right above the
 * Share button, is an informed act of publishing. The procedure still holds; the content does not.
 * An expense note is "beli deterjen". A run note is where somebody writes *"knee's been off since
 * Tuesday"* or *"skipped breakfast, bad idea"* — health and life context nobody asked this feature
 * to publish. One boolean, reversible in one line, opposite default.
 */
export const SHARE_SHOWS_NOTE = false

/**
 * `doNext[]` and `questionForRunner` from the session insight — **R-27**.
 *
 * One flag for both, not two: they are the same category of problem — advice and reflection *about
 * the runner*, rather than description *of the run* — and splitting them invites someone to flip
 * one without re-reading why the other exists. `observations[]` sits deliberately on the other
 * side of that line and always ships: "cadence dropped 18 spm" is what the chart already says, in
 * words.
 */
export const SHARE_SHOWS_COACHING_ADVICE = false

/* ── The preview card (plan §3.6) ─────────────────────────────────────────────────────────── */

/**
 * The static Open Graph image every share link gets.
 *
 * **No per-run `opengraph-image.tsx`.** Meta caches a scraped preview on its own CDN for days,
 * beyond the reach of `revokeShareLink` — burning this run's distance, pace and heart rate into a
 * bitmap would put those numbers somewhere revocation cannot follow. One branded thumbnail for
 * every link, forever.
 */
export const SHARE_OG_IMAGE = '/og-default.png'
export const SHARE_OG_IMAGE_WIDTH = 1200
export const SHARE_OG_IMAGE_HEIGHT = 630

/**
 * The warning the owner reads at the moment of sharing, not in a settings page nobody opens.
 *
 * Shown above the per-photo list, once, because the risk is per-photo: the splits screenshot
 * usually carries none of the location/clock/status-bar exposure the summary screenshot does.
 */
export const SHARE_PHOTO_WARNING =
  'Screenshots may show your exact location, the time you ran, or notifications that were on ' +
  'your screen. Review each one before sharing.'
