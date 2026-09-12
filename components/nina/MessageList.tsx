'use client'

import { useMemo } from 'react'

import { formatDayCompact } from '@/lib/format'
import { groupIntoDays } from '@/lib/nina/chatview'
import { resolveQuote, type QuoteCandidate } from '@/lib/nina/reply'
import type { ChatScrollMark } from '@/lib/nina/scroll'
import { ChatImages } from './ChatImages'
import { MessageBubble } from './MessageBubble'
import { RunAttachmentCard } from './RunAttachmentCard'
import { TypingIndicator } from './TypingIndicator'
import type { ChatAvatar, ChatMessage } from './types'
import { useChatPageScroll } from './useChatPageScroll'

/**
 * The conversation, grouped by day, newest at the bottom.
 *
 * ── WHY THE PAGE SCROLLS AND NOT A PANEL ──────────────────────────────────────────────────────
 * There is no `overflow-y-auto` container here. A chat pane sized in `dvh` has to fight two things
 * iOS does to the document and does correctly: the collapsing URL bar, and the keyboard changing
 * the visible area without changing the layout viewport. Letting the document scroll hands both
 * back to the platform, and it is also the reading-app answer — a conversation is a document with
 * the composer as its last row, not a viewport with a feed inside it.
 *
 * ── WHAT THE SPLIT MOVED (2026-09-12) ─────────────────────────────────────────────────────────
 * The scroll machinery — the reader-position sampler, the R14 restore-to-mark, and the
 * follow-new-content effect — lives in `useChatPageScroll`, fed primitives (`messageCount`,
 * `lastMessageIsFromUser`) rather than the messages array, so this stays the one module that
 * knows `ChatMessage`'s field names (RULING E2b, and it is still true: the quote candidates below
 * are the only field derivation left here). The arithmetic is `lib/nina/chatview.ts`'s, the URL
 * mark is `useChatScroll.ts`'s; see the hook's header for the three-way split.
 *
 * The day divider reuses `RunList`'s week-divider recipe exactly — `text-[11px] font-semibold
 * tracking-[0.06em] text-ink-3 uppercase`, and "Today" in place of a date for the current day for
 * the same reason that file gives: a reader at the bottom of his own conversation knows what day
 * it is, and the date is noise there but only there.
 *
 * **There is no per-message timestamp**, deliberately. See `app/nina/page.tsx`.
 */
export function MessageList({
  messages,
  typing,
  todayISO,
  keyboardOverlapPx,
  restoreMark,
  flashId = null,
  flashBlinks,
  onReply,
  onJumpToQuote,
  onRequestActions,
  onOpenImage,
  avatar,
}: {
  messages: readonly ChatMessage[]
  /** True while a turn is in flight, and between bubbles of a staggered reveal. */
  typing: boolean
  /** Computed on the server so "Today" cannot disagree between render and hydration. */
  todayISO: string
  /** Changes when the software keyboard opens or closes; a reason to re-check the scroll. */
  keyboardOverlapPx: number
  /**
   * Phase 8 (R14). The position this history entry was left at, or null. **When it is honoured,
   * the mount's jump-to-newest is skipped** — that jump is `decideAutoScroll`'s correct answer for
   * arriving at a conversation and the wrong answer for coming back to one.
   */
  restoreMark: ChatScrollMark | null
  /** Phase 7. The message a quote tap just landed on; it holds a tint for `flashHoldMs(flashBlinks)`. */
  flashId?: string | null
  /**
   * How many times a landed bubble blinks, resolved on the server by `flashBlinkCount` from
   * `NINA_FLASH_BLINKS` (the owner's Vercel tuning knob) and set here as `--nina-flash-count` on
   * the list's container — a custom property INHERITS, so one server-resolved number reaches
   * every bubble's `animation-iteration-count` without threading a prop through each row, and a
   * retune in the dashboard is a redeploy, not a code change. REQUIRED rather than optional, on
   * RULING E2b's habit: `ChatScreen` is the one caller and `tsc` should notice if it stops
   * passing it — the keyframe's own `, 4` fallback is for a var that stopped arriving, not for a
   * caller that never sent one.
   */
  flashBlinks: number
  /** Phase 7. A swipe, or the focus-revealed button, arming a reply to this message. */
  onReply?: (message: ChatMessage) => void
  /** Phase 7. A tap on a quote stub: scroll to the message it names. */
  onJumpToQuote?: (targetId: string) => void
  /**
   * R8. A LEFT swipe, or the second focus-revealed button, asking to edit or delete this message.
   * Threaded straight through, exactly as `onReply` is: this component composes bubbles and does
   * not decide what a bubble's actions are.
   */
  onRequestActions?: (message: ChatMessage) => void
  /**
   * Phase 9 (R10). A tap on a photograph inside a bubble.
   *
   * The MESSAGE ID as well as the index, because `ChatImages`'s `onOpen` is bubble-local: its
   * index counts photos in that one bubble, which is also what the overlay pages across (this
   * phase's plan, D-3). `ChatScreen` holds the viewer state, because it is the component that also
   * holds the `photo` state the attach control arms.
   *
   * Optional, and passed to `ChatImages` only when present — `ChatImages`'s contract is that an
   * absent `onOpen` means the grid is NOT interactive, and an unconditional inline arrow here
   * would quietly turn every photo in every future consumer into a button.
   */
  onOpenImage?: (messageId: string, index: number) => void
  /**
   * R1. Her current face and its saved framing, resolved once on the server by `ninaAvatarView`
   * and passed straight to `TypingIndicator` — this component renders no avatar of its own.
   *
   * REQUIRED, not optional, on RULING E2b's habit: `ChatScreen` is the one caller and `tsc` should
   * be what notices if it stops passing it. An optional prop would silently fall back to the
   * committed PNG, which is precisely the bug this phase fixes.
   */
  avatar: ChatAvatar
}) {
  useChatPageScroll({
    messageCount: messages.length,
    lastMessageIsFromUser: messages[messages.length - 1]?.role === 'user',
    typing,
    keyboardOverlapPx,
    restoreMark,
  })

  /*
   * The candidate set every quote resolves against: the rows on this screen and nothing else. A
   * `reply_to_id` pointing outside it — deleted, or older than `CHAT_HISTORY_LIMIT` — resolves to
   * null and the message renders as plain text, which is the documented degradation and the reason
   * `resolveQuote` returns null instead of throwing.
   *
   * Memoised on `messages` because it is O(n) and this component re-renders on every state change
   * the screen makes (typing, keyboard, reveal), not only when a row arrives.
   *
   * `hasImage` / `hasRun` are computed HERE and nowhere else (RULING E2b). This is the one module
   * that already imports `ChatMessage`, so it is the one module that may know the field names:
   * phase 6's `imageUrls` is plural and phase 8's `attachment` is an object, and
   * `lib/nina/reply.ts` knows about neither. `hasRun` is the LITERAL `false` at phase 7's landing,
   * because `ChatMessage.attachment` does not exist yet and `tsc` would say so. Phase 8's one-line
   * edit here is `hasRun: message.attachment != null` — it flips one boolean and the run branch of
   * `quoteMediaOf`, already shipped and already tested, starts firing. That is the entire cost of
   * shipping a reachable-but-dead branch now, and it is why no later phase touches
   * `lib/nina/reply.ts`.
   */
  const candidates = useMemo<QuoteCandidate[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        mine: message.role === 'user',
        text: message.body,
        hasImage: (message.imageUrls?.length ?? 0) > 0,
        hasRun: message.attachment != null, // phase 8, wired here — see the block above
      })),
    [messages],
  )

  return (
    <div
      className="space-y-5"
      /* The one dynamic value this list gives the cascade: `nina-flash-blink`'s iteration count,
       * inherited by every bubble below. The cast is the usual React-types-vs-custom-properties
       * gap — `style` accepts these at runtime and csstype's `Properties` has no `--*` index. */
      style={{ '--nina-flash-count': flashBlinks } as React.CSSProperties}
    >
      {groupIntoDays(messages).map((day) => (
        <section key={day.dayISO}>
          <h2 className="text-center text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)}
          </h2>
          {/* 8px between bubbles: on the 4pt base (4, 8, 12, 16, 22, 28) even though `space-y-2`
              is a step this codebase had not needed before a conversation existed. */}
          <ul className="mt-3 space-y-2">
            {day.messages.map((message) => (
              /*
               * The `above` slot's two-branch stack (RULING E2), widened here by phase 8 from
               * phase 6's images-only branch. Phase 7's quote gets its own `quote` prop on
               * `MessageBubble` and is never nested in here, so the render order inside the bubble
               * is quote stub -> images -> run card -> text.
               *
               * Each inset block owns its own `mb-2` — the gap to the message text below the slot,
               * which is what lets a single-block `above` render with no wrapper margin — while
               * the wrapper's `space-y-2` is the gap BETWEEN the blocks when there are two.
               */
              <MessageBubble
                key={message.id}
                message={message}
                quote={resolveQuote(message.replyToId, candidates)}
                above={
                  (message.imageUrls != null && message.imageUrls.length > 0) ||
                  message.attachment != null ? (
                    <div className="space-y-2">
                      {message.imageUrls != null && message.imageUrls.length > 0 ? (
                        <ChatImages
                          urls={message.imageUrls}
                          kinds={message.imageKinds}
                          onOpen={
                            onOpenImage == null
                              ? undefined
                              : (index) => onOpenImage(message.id, index)
                          }
                        />
                      ) : null}
                      {message.attachment != null ? (
                        <RunAttachmentCard attachment={message.attachment} />
                      ) : null}
                    </div>
                  ) : undefined
                }
                flash={message.id === flashId}
                onReply={onReply}
                onJumpToQuote={onJumpToQuote}
                onRequestActions={onRequestActions}
              />
            ))}
          </ul>
        </section>
      ))}

      {typing && (
        <ul className="space-y-2">
          <TypingIndicator avatar={avatar} />
        </ul>
      )}
    </div>
  )
}
