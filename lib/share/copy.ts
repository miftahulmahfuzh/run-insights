/**
 * Owner-side strings. One module, because the sentences below are the feature's actual position on
 * what sharing does and does not do, and a position that lives inline in three components drifts.
 *
 * PURE — imported by Client Components, so no `server-only` and no env.
 *
 * The public page's own strings live in `app/s/[token]/copy.ts` and this file is never imported
 * from there: owner copy speaks to the runner ("your screenshots", "stop sharing"), public copy
 * speaks to a stranger, and one module holding both is how a "your" ends up on a page whose reader
 * is not you.
 */

export const SHARE_TITLE = 'Share this run'

/** The button, before a link exists and after. Same verb; the panel below it carries the state. */
export const SHARE_ACTION = 'Share'

export const SHARE_LINK_LIVE = 'This run has a live link.'
export const SHARE_LINK_NONE = 'Not shared. Tap Share to create a link.'

export const SHARE_COPY_LINK = 'Copy link'
export const SHARE_COPIED = 'Copied'
/** The clipboard can be refused (permission, insecure context, an in-app browser). Then: show it. */
export const SHARE_COPY_FAILED = 'Copy did not work — here is the link.'

export const SHARE_WHO_CAN_SEE =
  'Anyone with the link can see this run — no account needed. They cannot reach any other run, ' +
  'and they see nothing about you beyond this session.'

/* ── Revocation ───────────────────────────────────────────────────────────────────────────── */

export const REVOKE_ACTION = 'Stop sharing'

/**
 * **R-38, verbatim. Do not rewrite this, do not soften it, do not move it into a tooltip.**
 *
 * Three properties the reconciliation demanded and this text has: it says what revocation *does*
 * (the link dies, the images are replaced so old image links break too), it says plainly what it
 * *cannot* do, and it does not apologise for the limitation.
 *
 * The second sentence is the one no other sharing feature in either of these two codebases had to
 * write. A Vercel Blob URL is its own bearer secret, minted at upload and never rotated by anything
 * except R-15's rotation on this exact code path — and even that cannot reach a copy already saved
 * to somebody's phone. The runner is told so at the moment they are deciding, which is the only
 * moment the sentence is worth anything.
 */
export const REVOKE_TITLE = 'Stop sharing this run'
export const REVOKE_BODY =
  'The link stops working and the photos are replaced with new ones, so old image links break ' +
  'too. Anyone who already opened it may have saved what they saw — that part no revocation can ' +
  'reach.'
export const REVOKE_CONFIRM = 'Stop sharing'
export const REVOKE_CANCEL = 'Keep sharing'
export const REVOKE_DONE = 'Sharing stopped.'
/**
 * Revocation is two steps and the first one is the promise. The link is dead the instant the row is
 * updated; the blob rotation that follows is a sweep, and if the blob store is having a bad minute
 * the honest report is "the page is dead, the old image links may not be yet" — not silence, and
 * not a rolled-back revoke that would leave the page live.
 */
export const REVOKE_PARTIAL =
  'The link is dead. Some old image links could not be replaced just now — try Stop sharing again ' +
  'to retry them.'
export const REVOKE_FAILED = 'Could not stop sharing just now. The link is still live.'

/* ── Per-photo inclusion ──────────────────────────────────────────────────────────────────── */

export const PHOTOS_TITLE = 'Screenshots in the shared page'
export const PHOTO_INCLUDED = 'Included'
export const PHOTO_EXCLUDED = 'Not shared'
export const PHOTO_TOGGLE_FAILED = 'Could not save that just now.'

/**
 * The hint that teaches the split target on each row (card #8): the left of the row opens the
 * screenshot, the right of it toggles whether the screenshot is shared.
 *
 * Worded identically to the hint `components/review/SheetSource` already shows, so the two places
 * a screenshot can be tapped teach the same gesture in the same words rather than each inventing
 * a phrasing. It sits on the status line because that line is already per-row and already reads as
 * a description of this row rather than an instruction for the list.
 */
export const PHOTO_ZOOM_HINT = 'tap to zoom'

/**
 * Why this control exists at all, in one line under the heading: the flag is a property of the
 * photo, not of any one link, so it survives revoke-and-re-share and can be set before a link has
 * ever existed.
 */
export const PHOTOS_NOTE =
  'This sticks to the photo, not to the link — a screenshot you exclude stays excluded the next ' +
  'time you share this run.'
