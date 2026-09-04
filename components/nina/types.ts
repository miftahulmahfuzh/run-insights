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

import type { RunAttachment } from '@/lib/nina/attach'

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
  /**
   * Phase 7 (R12). `nina_messages.reply_to_id` — the message this one answers, or null.
   *
   * A raw id and not a resolved quote, on purpose: whether it renders as a quote depends on
   * whether the target is among the rows on screen, which is `MessageList`'s question and not this
   * type's. The same row renders with a quote when its target is in the window and without one
   * when it is not, so the quote cannot be a property of the message.
   *
   * Null covers three cases that all render as a plain message — the target was deleted (phase 1's
   * `ON DELETE SET NULL`, decision D-5), the target is older than the 200 rows the page renders,
   * or this is an optimistic row whose send has not been confirmed. `resolveQuote` returns null
   * for all three rather than throwing, and that degradation IS this phase's exit criterion.
   *
   * REQUIRED, per RULING E2b: `app/nina/page.tsx` and `ChatScreen`'s optimistic row both set it,
   * and `tsc` says so if either forgets.
   */
  replyToId: string | null
  /**
   * Phase 6. Public Blob URLs, in `sort_order`, at most `NINA_MAX_CHAT_IMAGES`.
   *
   * PLURAL, where phase 4's handoff note said `imageUrl`: one message carries up to three photos.
   * RULING E2b upheld the plural and deleted phase 7's competing singular `imageUrl?`, so this
   * field has one author. Optional, so phase 7 (`replyToId`) and phase 8 (`attachment`) widen the
   * same interface without collision.
   *
   * Phase 7 reads it exactly once, and not directly: `MessageList` computes
   * `hasImage: (m.imageUrls?.length ?? 0) > 0` for `quoteMediaOf`, so a quote whose target is an
   * image-only message can say "Photo" without `lib/nina/reply.ts` ever knowing what a URL is.
   *
   * The `description` column is NOT here and must never be — it is written in an observational
   * voice that is not Nina's, and rendering it would break the illusion this feature exists for.
   */
  imageUrls?: readonly string[]
  /**
   * Phase 8 (R13). The run this message attached, display-ready, or null/absent for the ordinary
   * message.
   *
   * `attachment.runId` **is** `nina_messages.run_id` — this field replaces the bare `runId` phase
   * 4's handoff note anticipated, because the card needs the run's numbers and those must be
   * formatted by `lib/format.ts` on the server (invariant 3), never in the bubble.
   *
   * RULING E2b makes this phase the SOLE declarer: phase 7's speculative `runId?: string | null`
   * was deleted from its plan, so there is nothing here to reconcile. Phase 7 READS it once, in
   * `MessageList`, collapsed to a `hasRun` boolean for `quoteMediaOf` — which is what keeps
   * `lib/nina/reply.ts` free of any later phase's type, and therefore free of any later phase's
   * edit.
   */
  attachment?: RunAttachment | null
}
