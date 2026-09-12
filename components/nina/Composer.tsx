'use client'

import { useRef } from 'react'

import { cn } from '@/lib/cn'
import { NINA_MAX_CHAT_IMAGES } from '@/lib/nina/images'
import type { NinaExistingPhoto, RunAttachment } from '@/lib/nina/attach'
import type { QuoteView } from '@/lib/nina/reply'
import { AttachmentChip } from './AttachmentChip'
import { PhotoAttachmentChip } from './PhotoAttachmentChip'
import { QuoteStub } from './QuoteStub'
import { isPhoneReturn, useComposerDraft } from './useComposerDraft'
import { useComposerPhotos, type ComposerDraftImage } from './useComposerPhotos'

/**
 * The message composer: a fixed bar above the tab bar, an auto-growing textarea, one send button —
 * and, since phase 6, an eye.
 *
 * ── IT OWNS ITS OWN TEXT, AND THAT IS A BUG FIX WRITTEN IN ADVANCE ────────────────────────────
 * `value` lives in this component's tree — in `useComposerDraft`, this file's text hook — not in
 * `ChatScreen`, so a keystroke re-renders this component and nothing above it. `components/ui/Sheet.tsx` carries the report of what happens otherwise: an unstable
 * dependency reaching a focused input made "focus leave the input and iOS dropped the keyboard —
 * one digit per keyboard". A composer is that bug's natural habitat. The rules that follow from it:
 * this component is never given a `key` that changes, and `onSend` is a `useCallback` upstream.
 *
 * ── THE FIXED BAR'S GEOMETRY: TWO PROPS, AND THE INSET IS IN EXACTLY ONE OF THEM ─────────────
 * `bottomCss` is computed by `composerBottomCss` in `lib/nina/chatview.ts` and clears 40 px of
 * chrome: the tab bar's OUTER height, which is its 39 px grid plus the 1 px `border-t` the grid
 * sits under. The border is not a rounding error — it is the bar's top edge, so a clearance of 39
 * leaves this bar floating one pixel above the bar below it with the conversation visible through
 * the seam. 40 is what makes the two flush.
 *
 * `padBottomCss` is its partner, from `composerPadBottomCss` in the same file, and the pair is
 * what makes this bar paint to the bottom of the screen. The home-indicator inset USED to ride in
 * the offset alone, "because the tab bar below already pads by it and counting it twice would open
 * a gap" — which is true while the bar is showing and is exactly what left the inset UNPAINTED
 * when it is not. `/nina`'s resting state is a hidden bar (`lib/nina/chrome.ts`), so at rest the
 * bar's bottom edge sat one inset above the bottom of the viewport with the conversation showing
 * through underneath. That was the reported gap.
 *
 * So the inset moved into this element's own `padding-bottom`, gated on the same
 * `--nina-bar-visible` flag as the offset and by its complement: the offset carries the inset when
 * the bar is showing, the padding carries it when it is not, the keyboard branch carries it in
 * neither because the indicator is behind the keyboard. The inset appears exactly once in every
 * state — the rule the old comment was defending, in the state it did not cover. Both functions
 * are pure and both are asserted in `lib/nina/chatview.test.ts`; do not compute either here.
 *
 * The floor's SIZE is a later owner ask and the pair's second number worth knowing here: the gap
 * under the field's bottom line was `py-2` (8 px) plus the whole inset — 42 px on an XS Max — and
 * after "just 30% of the original" and a pixel back, the owner anchored it to the tab bar's
 * captions: the same distance he had just called right. `composerPadBottomCss` carries the
 * arithmetic; the `py-2` on the row below is untouched, because the top of this bar and the
 * keyboard state's floor share it.
 *
 * One consequence to know before touching `ChatChrome`: this element's MEASURED height now
 * includes the inset while the bar is hidden. `controlBottomCss` gates its own inset term on the
 * same flag for that reason, and its docstring carries the arithmetic.
 *
 * `z-40` matches `ReviewClient`'s sticky action bar, the app's only other second fixed bar, and
 * leaves `Sheet` (`z-50`) and `PhotoViewer` (`z-60`) covering it.
 *
 * ── THE GLASS IS THE FLOATING CONTROLS' GLASS, VERBATIM ──────────────────────────────────────
 * `bg-card/40 backdrop-blur-md backdrop-saturate-150`, which is `NINA_CHROME_CONTROL_CLASS`'s
 * fill, blur and saturation exactly — asked for in those words: *"bikin backgroundnya frosted
 * glass, persis kaya small buttons < and up"*. It was `bg-paper/90 backdrop-blur-md`, and that
 * file's own argument applies here unchanged: at 90 % opacity the blur is decorative, since almost
 * nothing shows through it. `backdrop-saturate-150` is what keeps the conversation's colour from
 * going grey behind the glass, which is the difference between frosted and merely dim.
 *
 * A HAIRLINE AND NOT A RING, which is the one place this deliberately departs from the discs.
 * `border-t border-rule/50` rather than `ring-1 ring-rule/50`: the controls are free-floating and
 * need an edge on all sides, while this bar spans the viewport and has exactly one exposed edge.
 * A ring would draw a hairline down both screen edges and across the bottom, where there is
 * nothing on the other side of it. The `/50` weight is carried over so the pair still reads as one
 * system, and `border-rule` at full weight — what this had — reads as chrome rather than as glass.
 *
 * ── 16px, AND WHY IT IS NOT NEGOTIABLE ────────────────────────────────────────────────────────
 * `app/globals.css` sets `input, select, textarea { font-size: max(16px, 1rem) }` because Safari
 * zooms the viewport when you focus anything smaller, and the design brief makes that one of the
 * iOS rules that beat the design. So this is the one place on the screen where text is 16px rather
 * than the bubble's 15px, and no `text-[15px]` may be added here to "fix" it.
 *
 * `CONTROL_CLASS` from `components/ui/Field.tsx` is not reused: it is `h-[52px]` and
 * `tabular-nums`, built for a fixed-height numeric field. An auto-growing prose textarea shares
 * its radius and its fill and nothing else, so it borrows those two literally rather than
 * inheriting a shape that fights it.
 *
 * ── THE SEND BUTTON IS 44px, AND DISABLING IT IS NOT A VALIDATION MESSAGE ─────────────────────
 * `size-11` is the iOS floor, the same as every other icon-only button in the app.
 * `ReviewClient`'s rule — "NEVER disabled for validation… a greyed-out button with no explanation
 * is the least useful message an app can send" — is about a rule the user has broken and cannot
 * see. This is not that: an empty box is the explanation, and there is nothing to send. The picker
 * button's own disabled state at the three-photo cap is explained by the tile strip beside it.
 *
 * ── THE REPLY STRIP LIVES IN HERE, NOT ABOVE IT (PHASE 7) ────────────────────────────────────
 * R12's draft quote has to be inside this same `fixed` container as the textarea, or it scrolls
 * away from the thing it describes and the keyboard covers it. That is two props on this component
 * rather than a sibling element in `ChatScreen`, and the alternative — a second fixed element
 * tracking `composerBottomCss` independently — would be two sources of truth for one bar's
 * position.
 *
 * The wrapper also gains `id="nina-composer"`, which `ChatScreen` measures. `planQuoteScroll`
 * needs `obstructedBottomPx`, and that number is not a constant: it is this bar's own height
 * (which grows with the reply strip, with a tile row and with a multi-line draft) plus its `bottom`
 * offset (the tab bar's outer height, or the keyboard). One `getBoundingClientRect().top` on this
 * element answers all of it exactly, and every alternative re-derives what the browser already
 * knows.
 *
 * The photograph pipeline — everything between a picked `File` and the ready draft images the
 * send carries — lives in `useComposerPhotos`, beside this file, with the picker-latency,
 * hashing and `planNinaPicked` arguments that went with it.
 */

export function Composer({
  onSend,
  busy,
  bottomCss,
  padBottomCss,
  userId,
  reply = null,
  onCancelReply,
  attachment = null,
  onClearAttachment,
  photo = null,
  onClearPhoto,
}: {
  /**
   * Receives the trimmed body and whatever photos are ready. Must be referentially stable — see
   * the docstring.
   *
   * `void | Promise<void>` rather than `void`: `ChatScreen`'s handler is async, and while an
   * async function is assignable to a `void`-returning type, spelling the union means nobody has
   * to know that to read this signature.
   */
  onSend: (draft: { body: string; images: readonly ComposerDraftImage[] }) => void | Promise<void>
  /** A turn is in flight. The box stays editable; only sending is held. */
  busy: boolean
  /** From `composerBottomCss`. A CSS length, because `var(--safe-bottom)` is CSS-only. */
  bottomCss: string
  /**
   * From `composerPadBottomCss`, and NOT optional: it is the other half of `bottomCss`. Together
   * they add the home-indicator inset exactly once — see the geometry section of the header. A
   * caller that passes one and not the other either leaves an unpainted strip under this bar or
   * pads it twice, and both are the bug R1 fixed.
   */
  padBottomCss: string
  /** Needed to build `nina/<userId>/chat/<id>.jpg`. Not a capability — see `useComposerPhotos`'s
   *  header, which is what builds it. */
  userId: string
  /** Phase 7 (R12). The message this draft answers. Null is the ordinary composer. */
  reply?: QuoteView | null
  /** Drop the reply and keep the draft text. Required whenever `reply` can be non-null. */
  onCancelReply?: () => void
  /**
   * Phase 8 (R13). The run pinned to the next message, or null. **Its presence is what makes an
   * empty message sendable**: "then user can ask something, or not include any text at all, then
   * nina will respond accordingly."
   *
   * This is the client half of RULING B1's ONE refusal rule, and it must stay the same predicate
   * as the server's: `body.trim() === '' && !hasAttachment`, where `hasAttachment` is
   * `imageTickets.length > 0` (phase 6) `|| runId != null` (this phase) `|| attachExisting != null`
   * (phase 13). Adding a clause on one side only produces an enabled Send button that silently
   * refuses — the exact bug the single-rule ruling exists to prevent. `reply` is deliberately not
   * a clause on either side: a quote with no words is not a message.
   *
   * The attachment itself is NOT passed back through `onSend`. `ChatScreen` owns the state and
   * reads it from there, so the composer's callback keeps the one shape it had.
   */
  attachment?: RunAttachment | null
  /** Unpin it. `ChatScreen` owns the state; this only reports the tap. */
  onClearAttachment?: () => void
  /**
   * F34 R2. The album photo pinned to the next message, or null — a blob the server already owns,
   * arrived on `?photo=avatar:<id>` and resolved owner-scoped by `app/nina/page.tsx`.
   *
   * **This is the FOURTH and LAST disjunct of the refusal rule printed above**, and the rule is
   * now complete on both sides: `attachExisting != null` was already the server's fourth clause
   * (`lib/nina/actions/send.ts`) and had no client counterpart until this phase, because the only
   * caller so far — `/nina/about`'s "Kirim ke chat" — never went through this composer. It does
   * now, so `canSend` gains the matching clause in the same commit. Nobody rewrites that
   * condition, they extend it; there is nothing left to extend it with.
   *
   * Held separately from `attachment` rather than in a union with it: a run and a photo can be
   * pinned to the same message, and `sendNinaMessage` takes both fields in one call.
   *
   * Like `attachment`, it is NOT passed back through `onSend` — `ChatScreen` owns the state and
   * reads it there, so this component's callback keeps the one shape it has had since phase 6.
   */
  photo?: NinaExistingPhoto | null
  /** Unpin it. `ChatScreen` owns the state; this only reports the tap. */
  onClearPhoto?: () => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const {
    value,
    ref,
    handleChange,
    clear: clearDraft,
  } = useComposerDraft({ replyTargetId: reply?.targetId ?? null })
  const {
    tiles,
    notice,
    ready,
    inFlight,
    onPick,
    removeTile,
    collectDraft,
    reset: resetPhotos,
  } = useComposerPhotos({ userId })

  /* `|| attachment !== null` is phase 8's clause and `|| photo !== null` is F34 R2's — the fourth
   * and final one. Phase 6's image clause was already in the disjunction when it landed; nobody
   * rewrites this condition, they extend it. Mirrors the server rule in `sendNinaMessage`
   * (`lib/nina/actions/send.ts`) exactly, clause for clause: text, tickets, run, existing blob. */
  const canSend =
    (value.trim().length > 0 || ready.length > 0 || attachment !== null || photo !== null) &&
    !inFlight &&
    !busy

  function submit() {
    if (!canSend) return
    void onSend({
      body: value.trim(),
      images: collectDraft(),
    })
    /*
     * Both reset halves run here, grouped by owner rather than by the epilogue's old
     * interleaving: `clearDraft` is the text half (empty the draft, collapse the box, release
     * the keyboard), `resetPhotos` the photo half (revoke the previews, drop the tiles and the
     * notice). Every step is synchronous, so the interleaving is unobservable.
     */
    clearDraft()
    resetPhotos()
  }

  return (
    <div
      id="nina-composer"
      className="fixed inset-x-0 z-40 border-t border-rule/50 bg-card/40 backdrop-blur-md backdrop-saturate-150"
      style={{ bottom: bottomCss, paddingBottom: padBottomCss }}
    >
      <div className="mx-auto max-w-[470px] px-5 py-2">
        {reply != null && (
          <div className="mb-2 flex items-start gap-2">
            {/* `mine={false}`: the ground here is `--paper`, the same side of the range as Nina's
                `--card` bubble, so the paper-side branch is the correct one for the rule and the
                text. `onJump` is omitted because the target is not necessarily on screen and he is
                mid-sentence. */}
            <QuoteStub quote={reply} mine={false} className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
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
        )}

        {/* Phase 8 (R13). Below the reply strip and above the tiles, which is the order the bubble
            itself renders in: what he is answering, then what he is handing over. */}
        {attachment !== null && onClearAttachment !== undefined && (
          <AttachmentChip attachment={attachment} onClear={onClearAttachment} />
        )}

        {/* F34 R2. Between the run chip and the picked tiles, because that is the order the message
            carries: the run, then the photo already in the album, then anything picked here — the
            same order `lib/nina/actions/send.ts` writes the image rows in (`sortOrder: images.length`
            puts the pinned one after the picked ones, and this strip is above the tile row). */}
        {photo !== null && onClearPhoto !== undefined && (
          <PhotoAttachmentChip photo={photo} onClear={onClearPhoto} />
        )}

        {tiles.length > 0 && (
          <ul className="mb-2 flex gap-2">
            {tiles.map((tile) => (
              <li key={tile.id} className="relative">
                {/* A plain <img>: the source is a blob: object URL, which next/image cannot
                    optimise and does not need to. Same call as UploadPicker's tile. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.previewUrl}
                  alt=""
                  className={cn(
                    'size-14 rounded-field object-cover',
                    tile.state !== 'ready' && 'opacity-50',
                    tile.state === 'error' && 'ring-1 ring-red',
                  )}
                />
                {tile.state !== 'ready' && tile.state !== 'error' && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="size-2 animate-pulse rounded-pill bg-card" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeTile(tile.id)}
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-pill bg-ink text-[11px] leading-none font-bold text-card"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        )}

        {notice !== null && <p className="mb-2 text-[12px] font-medium text-ink-3">{notice}</p>}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={tiles.length >= NINA_MAX_CHAT_IMAGES}
            aria-label="Add a photo"
            className="grid size-11 shrink-0 place-items-center rounded-pill bg-card text-ink transition-opacity active:scale-[0.97] disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
              <path
                d="M4 17l4.5-4.5 3.5 3.5 3-2.5L20 17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={(event) => {
              /*
               * WhatsApp's split, asked for by name ("can you change the keyboard, so it has a
               * Return button? whatsapp keyboard has it"): on a phone, the return key makes a
               * NEW LINE and the send button sends — so Enter falls through to the browser's
               * default insertion rather than calling `submit()`. On a desktop keyboard Enter
               * still sends and Shift+Enter is a newline, unchanged, because that is also
               * WhatsApp's split and the ask was about the phone's keyboard, not the desktop's.
               * `isComposing` stays the guard it was: an IME's own Enter commits a candidate, and
               * must not fire the message half-typed — which on a phone now means it must not
               * insert a newline either, hence its position above the coarse-pointer check.
               */
              if (event.key !== 'Enter' || event.shiftKey) return
              if (event.nativeEvent.isComposing) return
              if (isPhoneReturn()) return
              event.preventDefault()
              submit()
            }}
            /* NO `enterKeyHint`: the attribute was `"send"`, which relabels the return key (the
               owner read it as the DONE key he "had to manually click everytime to hide this
               stupid keyboard") and makes the key send. With no hint at all the key is iOS's
               default RETURN, which makes a newline (see `onKeyDown` above). There is no
               `"return"` value in the spec's enum, so the only way to ask for the Return key is
               not to ask. */
            /* The placeholder carries the hint; the accessible NAME stays "Message Nina" so the
               field is not renamed under the runner mid-message. With something pinned it becomes
               the requirement's own words — "user can input additional text question / comment
               (optional)" — so the box says out loud that typing is not required. */
            placeholder={
              attachment === null && photo === null ? 'Message Nina' : 'Add a note, or just send it'
            }
            aria-label="Message Nina"
            className={cn(
              'max-h-[132px] min-h-11 w-full resize-none rounded-field bg-card px-4 py-2.5',
              'text-base font-medium text-ink outline-none',
              'placeholder:font-medium placeholder:text-ink-3',
              'focus-visible:ring-2 focus-visible:ring-accent',
            )}
          />

          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-pill bg-ink text-card transition-opacity active:scale-[0.97] disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="M12 19V5M6 11l6-6 6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
