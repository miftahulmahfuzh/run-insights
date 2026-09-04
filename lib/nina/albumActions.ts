'use server'

import { sendNinaMessage } from './actions'
import { NINA_ATTACH_MAX_CHARS } from './album'

/**
 * "Attach to chat", from the album's zoomed-photo state — F33 R26.
 *
 * ── WHY THIS FILE EXISTS AT ALL, GIVEN IT IS ONE CALL ─────────────────────────────────────────
 * Isolation. `lib/nina/actions.ts` is phase 3's file and phases 5, 6, 12 and 13 all edit it; the
 * album importing from here instead means the only thing this phase asks of that file is one
 * optional input field and one word of tool set. If the reconciler moves `sendNinaMessage`, this
 * is the single call site that follows it.
 *
 * ── WHY THERE IS NO REVEAL ANIMATION ON THIS PATH ─────────────────────────────────────────────
 * `ChatScreen`'s staggered reveal (RU-5) is for bubbles arriving while he is watching the
 * conversation. Here he is on `/nina/about`, and the WhatsApp behaviour he described is that
 * attaching takes you to the chat. So the action persists everything and the caller navigates:
 * `/nina` is a Server Component reading `listNinaMessages`, so her reply is simply there when it
 * paints, with no client state to hand across a route change.
 *
 * ── WHY THE CLAMP IS IMPORTED AND NOT DECLARED ────────────────────────────────────────────────
 * A `'use server'` module may export only async functions, so `NINA_ATTACH_MAX_CHARS` cannot be a
 * `const` in this file. It lives in `lib/nina/album.ts`, which is the pure module the screen
 * already imports for its `maxLength` — so the input's cap and the server's clamp are one number,
 * which is the only arrangement in which they cannot disagree.
 */

export interface NinaAttachInput {
  kind: 'avatar' | 'image'
  id: string
  /** May be empty — a text-free attach is a valid send, exactly as phase 8's run attachment is. */
  body: string
}

export interface NinaAttachResult {
  ok: boolean
  userMessageId: string | null
  /** True when the turn could not reach the model. His message is still saved. */
  unavailable: boolean
}

export async function attachNinaPhotoToChat(input: NinaAttachInput): Promise<NinaAttachResult> {
  const body = input.body.trim().slice(0, NINA_ATTACH_MAX_CHARS)
  const result = await sendNinaMessage({
    body,
    attachExisting: { kind: input.kind, id: input.id },
    /*
     * F35 phase 3 (R2). `null`, and it is the right answer rather than a placeholder: he is on
     * `/nina/about` with the album open, there is no session in view, and "no session in view"
     * resolves to his most recent conversation (assumption A3). The caller then navigates to
     * `/nina`, which resolves the SAME session — so the photo he just sent is on the screen he
     * lands on. Naming a session here would mean the album knowing about a parameter that belongs
     * to the chat.
     */
    sessionId: null,
  })
  return {
    ok: result.ok,
    userMessageId: result.userMessageId,
    unavailable: result.unavailable,
  }
}
