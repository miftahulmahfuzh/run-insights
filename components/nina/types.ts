/**
 * What the chat screen renders. **Not a database row** — `app/nina/page.tsx` maps
 * `lib/nina/queries.ts`'s rows onto this on the server, and the mapping is the only place that
 * knows the schema.
 *
 * The indirection buys two things. Phase 1's column names, enum spelling and timestamp type can
 * change without touching a component; and the client never has to reason about a timezone,
 * because `dayISO` is computed once, on the server, by the one function in the codebase that
 * converts an instant into a day.
 */

export type ChatRole = 'user' | 'nina'

export type ChatMessageState =
  /** An optimistic row: the runner pressed send and the action has not answered. */
  | 'sending'
  /** The server has it. Every row the page renders starts here. */
  | 'sent'
  /** The action threw — a network drop, not a model failure. The text is still in the bubble. */
  | 'failed'

export interface ChatMessage {
  /** `nina_messages.id`, or a client-minted `local-…` id until the action returns the real one. */
  id: string
  role: ChatRole
  /** Plain text. There is no markdown renderer in this app; see `MessageBubble`. */
  body: string
  /** The Asia/Jakarta calendar day (D6) this message belongs to, from `jakartaDayOf`. */
  dayISO: string
  state: ChatMessageState
}
