/**
 * Every word on the public page.
 *
 * **This module imports nothing from `lib/share/copy.ts`, deliberately.** That file is owner copy —
 * "your screenshots", "stop sharing", "the link you already sent". This one is read by somebody who
 * has no account, did not upload anything, and cannot change anything. One module holding both is
 * exactly how a "your" ends up in front of a stranger.
 *
 * Straight English, no i18n layer (D10).
 */

/** The only heading. No name, no avatar, no "shared by" — a shared run is a run, not a profile. */
export const PUBLIC_TITLE = 'Run Insights'

export const SECTION_CHART = 'Pace & heart rate'
export const SECTION_ZONES = 'Time in zone'
export const SECTION_SPLITS = 'Splits'
export const SECTION_ANALYSIS = 'What happened'
export const SECTION_PHOTOS = 'Screenshots'

/**
 * Under the photo grid, for the person looking at them.
 *
 * The owner-side version of this sentence (`SHARE_PHOTO_WARNING`) tells the runner what they are
 * about to publish. This one tells the viewer what they are looking at, because a screenshot of
 * somebody's watch is not obviously a thing they should be careful with.
 */
export const PHOTOS_NOTE = 'The screenshots this analysis was read from.'

/** The one outbound link on the page, and it goes to the front door — never into anyone's data. */
export const FOOTER = 'Shared via Run Insights'

/**
 * The neutral 404.
 *
 * A revoked link and a link that never existed produce this identical page, from an identical
 * zero-row query result (§3.2). Saying "this link was revoked" would answer a question a stranger
 * has no right to ask — it confirms that a run existed, that somebody shared it, and that they
 * changed their mind.
 */
export const NOT_FOUND_TITLE = 'Nothing here'
export const NOT_FOUND_BODY =
  'This link does not point to a run. It may never have, or the runner may have stopped sharing it.'
