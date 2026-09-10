'use client'

import { SAVE_NOTICE_TEXT, useSavePhoto } from '@/components/ui/useSavePhoto'

/**
 * R10's two controls, floated at the bottom right of `PhotoViewer` through its `actions` slot.
 *
 * Everything that makes a download WORK moved to `components/ui/useSavePhoto.ts` when
 * `/nina/about`'s attach strip and the two admin rails needed the same verbs — the strategy ladder
 * (share / download / open, for the reason `lib/photos/save.ts` spells out: `<a download>` is not a
 * download on a cross-origin blob URL), the `pointerdown` warm that survives Safari's transient
 * activation, the `AbortError` silence, and the no-success-notice rule. This file keeps what is its
 * own: the chat surface's two floating buttons, their `bg-ink/70` discs over the image, the
 * paperclip that is deliberately NOT `Composer`'s photo glyph, and the accessible names built off
 * `label`. Import the hook; never re-grow the machinery here — a second copy is how the next
 * download button ships without the ladder.
 *
 * ── INVARIANT 5 ───────────────────────────────────────────────────────────────────────────────
 * This component renders no image and reads no private prose. Both accessible names come from the
 * `label` prop, which is `NINA_SIDE_LABEL` — a phrase about whose photograph it is, saying nothing
 * about what is in it. `glm-4.6v`'s text on the image row never crosses into `components/`.
 */

export function ChatPhotoActions({
  url,
  label,
  onAttach,
}: {
  /** The public Blob URL of the photo currently on screen. */
  url: string
  /** `'Foto kamu'` or `'Foto Nina'`, from `chatViewerPhotos`. Both accessible names read off it. */
  label: string
  /**
   * Pin this photo to the next message. **`null` means the control does not render** — which is a
   * real state and not a bug: the image row's id reaches the client through `ChatMessage.imageIds`,
   * and an optimistic row for a message sent seconds ago has none, because the rows it describes
   * have not been written yet. Viewing and downloading still work on it.
   */
  onAttach: (() => void) | null
}) {
  const noun = label.toLowerCase()
  const { busy, notice, warm, save } = useSavePhoto(url, 'nina')

  return (
    <>
      {notice !== null && (
        <p
          role="status"
          className="max-w-[15rem] rounded-field bg-ink/85 px-2.5 py-1.5 text-right text-[12px] font-medium text-card/90"
        >
          {SAVE_NOTICE_TEXT[notice]}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={warm}
          onFocus={warm}
          onClick={save}
          disabled={busy}
          aria-busy={busy}
          aria-label={`Unduh ${noun}`}
          className="grid size-11 place-items-center rounded-pill bg-ink/70 text-card active:scale-[0.97] disabled:opacity-50"
        >
          {/* The send arrow's geometry, inverted, plus the tray it lands on. `Composer`'s icon
              idiom: one viewBox="0 0 24 24", one path, currentColor, strokeWidth 2.4. */}
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M12 4v11M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {onAttach !== null && (
          <button
            type="button"
            onClick={onAttach}
            aria-label={`Lampirkan ${noun} ke chat`}
            className="grid size-11 place-items-center rounded-pill bg-ink/70 text-card active:scale-[0.97]"
          >
            {/* A paperclip, and deliberately NOT `Composer`'s photo glyph: that one means "pick a
                photo from the phone", and this means "pin the photo already on screen". */}
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="M13.5 3.5l-8 8a4 4 0 105.7 5.7l8-8a2.5 2.5 0 10-3.5-3.5l-8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
