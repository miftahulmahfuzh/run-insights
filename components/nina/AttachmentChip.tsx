import type { RunAttachment } from '@/lib/nina/attach'

/**
 * The run the next message will carry, sitting on top of the composer until it is sent (R13).
 *
 * ── WHY IT IS ON THE COMPOSER AND NOT IN THE MESSAGE LIST ─────────────────────────────────────
 * It is not part of the conversation yet. Rendering it as a bubble would be a message that does not
 * exist — the same fabrication `ChatScreen` refuses when it declines to put app-authored words in
 * Nina's mouth. It is composer state, so it lives in the composer's chrome, above the text box,
 * where every other messaging app puts it.
 *
 * ── NO `'use client'` OF ITS OWN ──────────────────────────────────────────────────────────────
 * It takes a callback and renders, so it compiles into whichever graph imports it — `Composer`,
 * which is already a client component. Same reasoning `MessageBubble` carried before phase 7's
 * gesture forced the directive on it.
 *
 * ── WHY THE CLEAR BUTTON IS AN X AND THIS ONE IS NOT AN ARGUMENT ──────────────────────────────
 * Removing a pinned attachment is the one gesture on this screen that is universal. It is also
 * `aria-label`led, like the attach icon, so it is named for anyone who cannot see it.
 *
 * The run is NOT a link here. Tapping it should not throw the runner off a message they are in the
 * middle of writing — and if they want to look at the run again, they were just on it.
 *
 * The geometry — `max-w-[470px]`, `px-5` — belongs to the composer's own inner wrapper, which this
 * sits inside. Only the bottom margin between it and the input row is this component's.
 */
export function AttachmentChip({
  attachment,
  onClear,
}: {
  attachment: RunAttachment
  onClear: () => void
}) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <div className="min-w-0 flex-1 rounded-field bg-card px-3.5 py-2.5">
        <span className="block truncate text-[11px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
          {[attachment.day, attachment.location].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-semibold text-ink">
          {[attachment.distance, attachment.duration, attachment.pace].join(' · ')}
        </span>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove the attached run"
        className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
