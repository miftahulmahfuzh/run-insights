/**
 * How a refreshed server list becomes the list on screen, without stepping on a reveal.
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
