'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { newId } from '@/lib/id'
import { describeNinaImage } from '@/lib/nina/actions'
import {
  NINA_MAX_CHAT_IMAGES,
  ninaChatPathname,
  planNinaPicked,
  type NinaPickRejectionReason,
} from '@/lib/nina/images'
import type { QuoteView } from '@/lib/nina/reply'
import { compressForNina } from '@/lib/photos/compressForNina'
import { QuoteStub } from './QuoteStub'

/**
 * The message composer: a fixed bar above the tab bar, an auto-growing textarea, one send button —
 * and, since phase 6, an eye.
 *
 * ── IT OWNS ITS OWN TEXT, AND THAT IS A BUG FIX WRITTEN IN ADVANCE ────────────────────────────
 * `value` lives here, not in `ChatScreen`, so a keystroke re-renders this component and nothing
 * above it. `components/ui/Sheet.tsx` carries the report of what happens otherwise: an unstable
 * dependency reaching a focused input made "focus leave the input and iOS dropped the keyboard —
 * one digit per keyboard". A composer is that bug's natural habitat. The rules that follow from it:
 * this component is never given a `key` that changes, and `onSend` is a `useCallback` upstream.
 *
 * ── THE FIXED BAR'S GEOMETRY ──────────────────────────────────────────────────────────────────
 * `bottomCss` is computed by `composerBottomCss` in `lib/nina/chatview.ts` and clears 78 px of
 * chrome: the tab bar's 58 px plus the Upload FAB's 20 px overhang above the bar's top edge. The
 * FAB is not optional to clear — the composer is at `z-40` and the bar at `z-30`, so a bar sitting
 * flush on the tab bar's top edge would slice the top off the coral circle. The home-indicator
 * inset rides in that same offset rather than in this element's padding, because the tab bar below
 * already pads by it and counting it twice would open a gap.
 *
 * `z-40` matches `ReviewClient`'s sticky action bar, the app's only other second fixed bar, and
 * leaves `Sheet` (`z-50`) and `PhotoViewer` (`z-60`) covering it. `bg-paper/90 backdrop-blur-md` is
 * that file's recipe too.
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
 * ── THE PICKER, AND WHY IT UPLOADS IMMEDIATELY (PHASE 6) ─────────────────────────────────────
 * A picked photo is compressed, PUT straight to Blob, and DESCRIBED before he taps send. That is
 * not eagerness for its own sake: the describe call costs ~8-11 s, the turn is budgeted at 45 s,
 * and 45 + 11 does not fit in a 60 s function. Doing it while he types is the only shape that
 * fits. See the phase-6 plan's latency verdict.
 *
 * The compress-and-PUT half really is parallel across tiles — it goes through `/api/upload`, a
 * Route Handler. The describe half is **not**: Next dispatches Server Actions one at a time per
 * client (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`), so three photos cost
 * three describe latencies end to end, not one. That is accepted rather than worked around — each
 * call keeps its own invocation and its own 25 s budget, the wait is client-side behind these
 * spinners while he types, and `sendNinaMessage` still makes zero model calls. See
 * `describeNinaImage`'s own docstring for why batching is not the repair.
 *
 * ── AND WHY `planNinaPicked` IS A PURE FUNCTION IN `lib/` ────────────────────────────────────
 * F17 measured what happens otherwise: `UploadPicker` decided from inside a `setState` updater,
 * Strict Mode double-invoked it, and one picked file minted two upload tokens and left a blob
 * orphaned in the store for good. Decide purely, hand `setTiles` a value, run the effects after.
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
 * offset (the tab bar and FAB clearance, or the keyboard). One `getBoundingClientRect().top` on
 * this element answers all of it exactly, and every alternative re-derives what the browser
 * already knows.
 *
 * ── `userId` IS A PROP AND IT IS NOT A CAPABILITY ────────────────────────────────────────────
 * The client needs it to build `nina/<userId>/chat/<id>.jpg`. `/api/upload` re-derives the owner
 * from the session and refuses any pathname that does not match it, so a tampered value buys a
 * 400, not a write. Invariant 10 is about `NEXT_PUBLIC_`, not about props.
 */

/** Roughly five lines at 16px, after which the textarea scrolls instead of growing. */
const TEXTAREA_MAX_PX = 132

type TileState = 'compressing' | 'uploading' | 'describing' | 'ready' | 'error'

interface Tile {
  id: string
  /** `URL.createObjectURL` of the ORIGINAL pick, so the thumbnail appears instantly. */
  previewUrl: string
  state: TileState
  error: string | null
  /** Set once describe returns — success or handled failure. A tile without one cannot be sent. */
  ticket: string | null
  /** The public Blob URL, for the optimistic bubble. */
  blobUrl: string | null
}

export interface ComposerDraftImage {
  ticket: string
  url: string
}

const REJECTION_TEXT: Record<NinaPickRejectionReason, string> = {
  not_an_image: 'That is not a photo.',
  too_large: 'That photo is too big.',
  too_many: `Nina takes ${NINA_MAX_CHAT_IMAGES} photos at a time.`,
}

export function Composer({
  onSend,
  busy,
  bottomCss,
  userId,
  reply = null,
  onCancelReply,
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
  /** Needed to build `nina/<userId>/chat/<id>.jpg`. Not a capability — see the header. */
  userId: string
  /** Phase 7 (R12). The message this draft answers. Null is the ordinary composer. */
  reply?: QuoteView | null
  /** Drop the reply and keep the draft text. Required whenever `reply` can be non-null. */
  onCancelReply?: () => void
}) {
  const [value, setValue] = useState('')
  const [tiles, setTiles] = useState<Tile[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  /** Ids removed while their promise was still in flight. Their results are dropped. */
  const dropped = useRef(new Set<string>())

  /*
   * Arming a reply focuses the box, which is the whole point of the gesture: swipe, type, send.
   * Keyed on the target id and not on the object, so re-resolving the same quote during an
   * unrelated re-render does not steal focus back from wherever it has gone.
   */
  const replyTargetId = reply?.targetId ?? null
  useEffect(() => {
    if (replyTargetId !== null) ref.current?.focus()
  }, [replyTargetId])

  const ready = tiles.filter((t) => t.state === 'ready' && t.ticket !== null)
  const inFlight = tiles.some((t) => t.state !== 'ready' && t.state !== 'error')
  const canSend = (value.trim().length > 0 || ready.length > 0) && !inFlight && !busy

  /** `patchIfCurrent`'s spirit: a tile the runner removed must not be written to by its own
   *  in-flight promise. */
  const patch = useCallback((id: string, next: Partial<Tile>) => {
    if (dropped.current.has(id)) return
    setTiles((current) => current.map((t) => (t.id === id ? { ...t, ...next } : t)))
  }, [])

  const process = useCallback(
    async (tile: Tile, file: File) => {
      try {
        const compressed = await compressForNina(file)
        patch(tile.id, { state: 'uploading' })

        const requested = ninaChatPathname(userId, newId())
        const result = await upload(requested, compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          // Nothing to declare: the chat branch of the route parses no client payload.
        })
        patch(tile.id, { state: 'describing', blobUrl: result.url })

        /*
         * Her eyes. A FAILED describe still returns a ticket (carrying `description: null`), so
         * the photo remains sendable and Nina is told honestly that she could not see it — which
         * is why this branch sets `state: 'ready'` on a `!ok` result too, and only a missing
         * ticket is an error.
         */
        const described = await describeNinaImage({
          blobUrl: result.url,
          pathname: result.pathname,
          width: compressed.width,
          height: compressed.height,
          bytes: compressed.compressedBytes,
        })
        if (described.ticket === null) {
          patch(tile.id, { state: 'error', error: 'Nina could not take this one.' })
          return
        }
        patch(tile.id, { state: 'ready', ticket: described.ticket })
      } catch (cause) {
        patch(tile.id, {
          state: 'error',
          error: cause instanceof Error ? cause.message : 'That photo would not upload.',
        })
      }
    },
    [patch, userId],
  )

  /**
   * Decide, then set, then run. Nothing in here is inside an updater, so Strict Mode has nothing
   * to double-invoke. See the header.
   */
  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = '' // so picking the same file twice in a row still fires onChange
    if (picked.length === 0) return

    const plan = planNinaPicked(
      picked.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      { alreadyHeld: tiles.length },
    )

    const fresh: Array<{ tile: Tile; file: File }> = []
    for (const candidate of plan.accepted) {
      const file = picked.find((f) => f.name === candidate.name && f.size === candidate.size)
      if (file == null) continue
      fresh.push({
        tile: {
          id: `tile-${newId()}`,
          previewUrl: URL.createObjectURL(file),
          state: 'compressing',
          error: null,
          ticket: null,
          blobUrl: null,
        },
        file,
      })
    }

    setTiles((current) => [...current, ...fresh.map((f) => f.tile)])
    const firstRejection = plan.rejected[0]
    setNotice(firstRejection != null ? REJECTION_TEXT[firstRejection.reason] : null)
    for (const { tile, file } of fresh) void process(tile, file)
  }

  function removeTile(id: string) {
    dropped.current.add(id)
    setTiles((current) => {
      const going = current.find((t) => t.id === id)
      if (going != null) URL.revokeObjectURL(going.previewUrl)
      return current.filter((t) => t.id !== id)
    })
  }

  function resize() {
    const el = ref.current
    if (el == null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  function submit() {
    if (!canSend) return
    void onSend({
      body: value.trim(),
      images: ready.map((t) => ({ ticket: t.ticket as string, url: t.blobUrl as string })),
    })
    setValue('')
    for (const tile of tiles) URL.revokeObjectURL(tile.previewUrl)
    setTiles([])
    setNotice(null)
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      // Keep the keyboard up. He is going to type again — that is what a conversation is.
      el.focus()
    }
  }

  return (
    <div
      id="nina-composer"
      className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
      style={{ bottom: bottomCss }}
    >
      <div className="mx-auto max-w-[470px] px-5 py-3">
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
            onChange={(event) => {
              setValue(event.target.value)
              resize()
            }}
            onKeyDown={(event) => {
              /*
               * Enter sends; Shift+Enter is a newline. `enterKeyHint="send"` relabels the iOS
               * return key so the phone agrees with the behaviour. `isComposing` is the guard that
               * keeps an IME's own Enter — committing a candidate — from firing the message
               * half-typed.
               */
              if (event.key !== 'Enter' || event.shiftKey) return
              if (event.nativeEvent.isComposing) return
              event.preventDefault()
              submit()
            }}
            enterKeyHint="send"
            placeholder="Message Nina"
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
