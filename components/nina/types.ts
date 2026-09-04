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
   * Phase 9 (R10). The image row's id, parallel to `imageUrls`.
   *
   * ── WHY AN ID HAS TO REACH THE CLIENT AT ALL ─────────────────────────────────────────────────
   * Because "attach this image to his new chat" is `sendNinaMessage`'s `attachExisting: { kind,
   * id }`, and the whole point of that field is that the photo is NOT re-uploaded: what crosses is
   * an id, and `resolveAttachment` proves ownership against `user_id` before a row is written.
   * Without the id the alternative is a re-upload, which would duplicate the blob and throw away
   * the private prose `glm-4.6v` has already been paid for.
   *
   * ── WHY THREE PARALLEL ARRAYS AND NOT ONE `{ id, url, kind }[]` ──────────────────────────────
   * The honest shape is an array of objects, and it was rejected on one hard constraint: replacing
   * `imageUrls` is a BREAKING change to `app/nina/page.tsx`'s mapping, and that file belongs to
   * phases 3, 5 and 8 as well. A phase whose tree does not compile until another phase lands is
   * not a phase. Both fields here are additive and optional, so the tree builds with the mapping
   * untouched and the feature degrades in a named way until it widens.
   * `ChatImages`'s own `kinds?: readonly string[]` is the precedent for a parallel array at exactly
   * this boundary, and it was chosen deliberately by F33 phase 13.
   *
   * Absent on `ChatScreen`'s optimistic row, because the rows it describes do not exist yet: the
   * id is minted server-side by `insertNinaMessageImages`. Tap-to-view and download work on such a
   * photo; the attach control does not render until a load brings the ids.
   */
  imageIds?: readonly string[]
  /**
   * Phase 9 (R10). The image row's `kind` — `'upload'` or `'generated'` — parallel to `imageUrls`.
   * Fed straight into `ChatImages`'s existing `kinds` prop and into `chatViewerPhotos`, both of
   * which read it through `photoSideOf` to decide whose photograph it is.
   *
   * NOT derivable from `message.role`, which is the whole reason it is here: a runner who
   * re-attaches one of Nina's selfies writes a `kind: 'generated'` row onto a `role: 'user'`
   * message (`lib/nina/actions.ts:183-189`), and reading the role would announce her photograph as
   * his. R10's attach control makes that case common rather than theoretical.
   *
   * This is the KIND COLUMN, not `NinaPhotoKind`. `attachExisting` takes `'avatar' | 'image'`,
   * which names a TABLE; a chat photo is always `'image'` there, whatever this column says.
   *
   * The private prose is still NOT here and must never be (invariant 5).
   */
  imageKinds?: readonly string[]
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
