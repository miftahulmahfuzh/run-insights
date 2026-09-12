import type { NinaResendRefusal } from '@/lib/nina/actions'

/**
 * Every sentence `ChatScreen` says, in one module.
 *
 * This is the copy's home rather than the sheet's for the reason `NOTICE_TEXT`'s original header
 * gave: the sheet must not learn the action's vocabulary, and this module owns every sentence the
 * screen says. `MessageActionsSheet` receives finished sentences through callbacks' return values
 * and renders them; it never branches on which one it got.
 */

export type Notice =
  | 'send-failed'
  | 'no-reply'
  | 'quote-missing'
  | 'edit-failed'
  | 'delete-failed'
  | 'edit-unavailable'

export const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  /* Raised by the POLL, not by the send (F36 R6). Three states read the same to the runner and are
   * deliberately not told apart in the copy: she answered with nothing, the model was unavailable,
   * or the background turn died and the sweep closed it. He does not care which; he cares that his
   * message is safe and that one more tap gets him an answer. Both halves are now literally true. */
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
  /* R12's honest end of the degradation. The quote rendered, so the target existed when the page
   * loaded; it is simply not among the rows on screen — deleted since, or further back than this
   * screen goes. Saying so beats a tap that does nothing. */
  'quote-missing': 'That message isn’t on this screen any more, so there’s nowhere to jump to.',
  /* R8. Both of these mean the WRITE did not happen, so the bubble on screen is still the truth.
   * They are told apart because a failed edit leaves something to try again and a failed delete
   * leaves the message where it was — different next actions, different sentences. */
  'edit-failed': 'That edit didn’t save. The message is unchanged — try it again.',
  'delete-failed': 'That message could not be deleted. It is still here, and still in her context.',
  /* The one refusal that is not a failure: an optimistic row has no database row behind it yet. */
  'edit-unavailable':
    'Give that one a moment to send — there is nothing to edit until Nina has it.',
}

/**
 * R5's five refusals, in the runner's language.
 *
 * ── WHY THIS IS NOT A `Notice` ────────────────────────────────────────────────────────────────
 * `Notice` gains no member, and that is a decision rather than an omission. Every sentence here is
 * read while the actions sheet is covering the screen, and the notice strip renders underneath it —
 * a notice raised from a sheet interaction is a sentence delivered to nobody until the sheet
 * closes. So these go back to the sheet, through `handleResendMessage`'s return value, and land in
 * the `refusal` line the sheet already had for locally-decided refusals.
 *
 * 'turn-live' is the one that is not a failure, and its wording says so: nothing went wrong, and
 * the message he is looking at is going to be answered without him doing anything else.
 */
export const RESEND_REFUSAL_TEXT: Record<NinaResendRefusal, string> = {
  'not-found': 'That message isn’t on the server any more, so there’s nothing to resend.',
  'not-mine': 'Only your own messages can be resent.',
  empty: 'There’s nothing left in that message for her to answer.',
  'turn-live': 'She’s already working on this chat — that one is next, give her a moment.',
  failed: 'That couldn’t be resent just now. Try it again in a moment.',
}
