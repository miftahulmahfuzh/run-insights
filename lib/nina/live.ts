/**
 * How a refreshed server list — and, beside it since the "gj" duplication, the poll's bubbles —
 * becomes the list on screen, without stepping on a reveal.
 *
 * ── WHY A MERGE AND NOT `setMessages([...initial])` ───────────────────────────────────────────
 * `ChatScreen` holds three kinds of row that the server list does not describe the same way:
 *   - an OPTIMISTIC row the runner just sent, which has a client-side id until the action returns;
 *   - a row mid-REVEAL, which is persisted (so it IS in the server list) but must not become
 *     `state: 'sent'` yet — RU-5's staggered reveal is the whole illusion, and re-seeding from the
 *     server would make all four of Nina's bubbles appear at once;
 *   - a row the server has and the client has not, which is the entire point of this refresh.
 *
 * Re-seeding wholesale gets all three wrong. The rule below is: **server order, local content.**
 *
 * Kept in `lib/nina/` and not `lib/push/` because it is about the conversation, not about push —
 * push is only what happens to wake it up.
 *
 * ── TWO DELIVERIES, ONE LIST, BOTH IDEMPOTENT ──────────────────────────────────────────────────
 * The refresh is not the only thing that appends. `revealBubbles` appends the poll's bubbles one
 * `sleep` apart, and on prod session "gj" (2026-09-11) a refresh landed mid-reveal: the merge
 * correctly delivered the rows the reveal had not reached yet, and the reveal then appended the
 * same `nina_messages.id`s again — four rows rendered as seven bubbles. `appendNewBubbles`, below,
 * is the reveal's half of this module's contract: both writers now skip ids the list already
 * holds, so no interleaving of the two can render a row twice.
 */

/** Kept in step with `LIVE_MESSAGE_TYPE` in `lib/service-worker.js`. */
export const SW_MESSAGE_TYPE = 'nina:new'

/** The only property this rule needs. `ChatMessage` (phase 4, widened by 6/7/8) satisfies it. */
export interface LiveMessage {
  id: string
}

/**
 * Server order, local content, local-only rows appended.
 *
 * Returns the **same array reference** when nothing changed, so a `useEffect` that calls
 * `setMessages(mergeServerMessages(current, initial))` on every refresh does not force a render
 * for a refresh that brought nothing new. React bails out of a state update that returns the
 * identical value.
 */
export function mergeServerMessages<T extends LiveMessage>(
  local: readonly T[],
  server: readonly T[],
): T[] | readonly T[] {
  const localById = new Map(local.map((message) => [message.id, message]))
  const merged: T[] = server.map((row) => localById.get(row.id) ?? row)

  const serverIds = new Set(server.map((row) => row.id))
  for (const message of local) {
    if (!serverIds.has(message.id)) merged.push(message)
  }

  const unchanged =
    merged.length === local.length && merged.every((message, i) => message === local[i])
  return unchanged ? local : merged
}

/*
 * ── THE OTHER WRITER: THE REVEAL ───────────────────────────────────────────────────────────────
 * `revealBubbles` (`components/nina/ChatScreen.tsx`) appends the poll's bubbles one `sleep` apart,
 * from inside a state updater — so what it appends must be decided against the list AS REACT WILL
 * COMMIT IT, not as the caller last saw it: a merge can land in any gap between two sleeps. Both
 * shapes below are restated structurally rather than imported, for the same reason `LiveMessage`
 * above is: `SentBubble` lives in the `'server-only'` module `lib/nina/turnrun.ts` — its client-safe
 * address is the `lib/nina/actions` barrel's type re-export — `ChatMessage`
 * in `components/nina/types.ts`, and this file keeps to the conversation's rule with neither.
 */

/**
 * The poll's DTO for one of her rows — `SentBubble` in `lib/nina/turnrun.ts`, restated. A
 * structural twin, held to the real thing by `tsc` at the call site rather than by an import: the
 * caller passes `SentBubble[]`, so if that type ever stops matching, the caller stops compiling.
 */
export interface PollBubble {
  id: string
  body: string
  replyToId: string | null
}

/**
 * The row `revealBubbles` appends for one of her bubbles — the nina half of `ChatMessage`
 * (`components/nina/types.ts`), restated. `appendNewBubbles` returns `(T | RevealRow)[]`, which is
 * assignable to `ChatMessage[]` exactly while every REQUIRED `ChatMessage` field is present here —
 * so widening the component type with a required field fails at the call site instead of silently
 * dropping it from her new bubbles.
 */
export interface RevealRow extends LiveMessage {
  role: 'nina'
  body: string
  dayISO: string
  state: 'sent'
  replyToId: string | null
}

/**
 * Append the poll's bubbles to the list on screen — but only the ones it does not already hold.
 *
 * This is the function the prod "gj" duplication (2026-09-11: four `nina_messages` rows, seven
 * bubbles rendered) bought. `revealBubbles` used to append each polled bubble unconditionally, and
 * a refresh landing mid-reveal left the list with the same id twice — once from
 * `mergeServerMessages`'s pre-delivery, once from the still-running reveal. The fix lives where the
 * second writer lives: the id check runs INSIDE the updater, against the state React will actually
 * commit, so it holds for every interleaving rather than for the ones a caller can foresee.
 *
 * Returns the **same array reference** when nothing is new — an empty batch, or a batch the merge
 * has already delivered — so the state update becomes a no-op for React instead of a re-render:
 * the same bail-out `mergeServerMessages` gives the refresh, on the other channel.
 *
 * `current` is a plain `T[]`, not `readonly`, so the nothing-new branch can return it as the next
 * state with no cast anywhere — `mergeServerMessages` needed `as ChatMessage[]` at its call site
 * because its bail-out type includes its `readonly` input's shape; this function does not inherit
 * that.
 */
export function appendNewBubbles<T extends LiveMessage>(
  current: T[],
  bubbles: readonly PollBubble[],
  dayISO: string,
): (T | RevealRow)[] {
  const seen = new Set(current.map((message) => message.id))
  const fresh = bubbles.filter((bubble) => {
    /* The id joins the set AS IT PASSES, not afterwards: a batch that carried one id twice would
     * otherwise append it twice. `listNinaMessagesAfter` cannot produce that today — row ids are
     * unique — but the promise this function makes is about ids, not about one caller's current
     * impossibility. */
    if (seen.has(bubble.id)) return false
    seen.add(bubble.id)
    return true
  })
  if (fresh.length === 0) return current

  return [
    ...current,
    ...fresh.map((bubble): RevealRow => ({
      id: bubble.id,
      role: 'nina',
      body: bubble.body,
      // An input, not a computation — this stays a pure function `vitest` can prove without a
      // clock. `planReveal` made the same call, for the same reason.
      dayISO,
      state: 'sent',
      /*
       * HER OWN QUOTE. She may have replied to a specific message, and the server puts her
       * `reply_to_id` on the FIRST bubble only ("a four-bubble reply is one answer to one
       * message"). A hard `null` here would mean the quote only appeared on the next server
       * render of `/nina`. (Moved verbatim with the row it described, from the inline literal
       * this function replaced in `revealBubbles`.)
       */
      replyToId: bubble.replyToId,
    })),
  ]
}
