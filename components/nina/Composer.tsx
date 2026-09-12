'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { newId } from '@/lib/id'
import { describeNinaImage, findNinaDuplicateChatImage } from '@/lib/nina/actions'
import { planNinaPickUpload } from '@/lib/nina/dedupe'
import {
  NINA_MAX_CHAT_IMAGES,
  ninaChatPathname,
  planNinaPicked,
  type NinaPickRejectionReason,
} from '@/lib/nina/images'
import type { NinaExistingPhoto, RunAttachment } from '@/lib/nina/attach'
import type { QuoteView } from '@/lib/nina/reply'
import { compressForNina } from '@/lib/photos/compressForNina'
import { contentHashOf } from '@/lib/photos/contentHash'
import { AttachmentChip } from './AttachmentChip'
import { PhotoAttachmentChip } from './PhotoAttachmentChip'
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
 * ── AND WHY EVERY PICK IS HASHED, AND WHAT THE HASH BUYS (media-dedupe P2) ────────────────────
 * After `compressForNina` returns, this composer hashes the compressed bytes — the exact bytes a
 * PUT would carry — with `contentHashOf`, for EVERY pick, before anything is uploaded. The hash is a
 * millisecond over ~150 KB; the PUT it can save is a round trip and a permanent object. It is
 * spent in two places:
 *
 *   · a pre-check (`findNinaDuplicateChatImage`) BEFORE the upload: when the owner's collection
 *     already holds an original with these bytes, the tile never uploads and never describes — it
 *     switches to the existing photograph and is sent as a reference to it. The duplicate pick
 *     that started this whole set (the arrival card, picked twice) stops here: one object, one
 *     original, and the 8-11 s describe is not paid a second time.
 *   · the send claim (`contentHashes`, keyed by the STORED pathname): `sendNinaMessage` re-checks
 *     immediately before its insert, closing the race this composer cannot see — the same file
 *     picked in two tabs, or re-picked while the first send is still in flight.
 *
 * The dedup is deliberately INVISIBLE to him: a deduplicated tile shows the same thumbnail, joins
 * `ready` like any other, and sends like any other. Nothing to learn, nothing to explain. When
 * the pre-check itself fails — network, a cold action — the tile uploads as it always did: dedup
 * may degrade to inactive on any single pick, but a pick never fails BECAUSE of dedup. The same
 * tolerance runs on the server, where an invalid hash is written as NULL rather than an error.
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
 * offset (the tab bar's outer height, or the keyboard). One `getBoundingClientRect().top` on this
 * element answers all of it exactly, and every alternative re-derives what the browser already
 * knows.
 *
 * ── `userId` IS A PROP AND IT IS NOT A CAPABILITY ────────────────────────────────────────────
 * The client needs it to build `nina/<userId>/chat/<id>.jpg`. `/api/upload` re-derives the owner
 * from the session and refuses any pathname that does not match it, so a tampered value buys a
 * 400, not a write. Invariant 10 is about `NEXT_PUBLIC_`, not about props.
 */

/** Roughly five lines at 16px, after which the textarea scrolls instead of growing. */
const TEXTAREA_MAX_PX = 132

/**
 * Whether the return key in question is a phone's: `(pointer: coarse)`, resolved once on first
 * use. Never at module scope — a `'use client'` component still renders on the server for the
 * initial HTML, and `matchMedia` does not exist there.
 *
 * The pointer type and not a user-agent string, because it is the honest question: the rule below
 * is about WHICH RETURN KEY THE USER HAS, not about which browser shipped the device. A laptop
 * with a touchscreen reports a fine primary pointer and keeps Enter-to-send, which is right.
 */
let phoneReturn: boolean | null = null
function isPhoneReturn(): boolean {
  if (phoneReturn === null) {
    phoneReturn = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  }
  return phoneReturn
}

type TileState = 'compressing' | 'checking' | 'uploading' | 'describing' | 'ready' | 'error'

interface Tile {
  id: string
  /** `URL.createObjectURL` of the ORIGINAL pick, so the thumbnail appears instantly. */
  previewUrl: string
  state: TileState
  error: string | null
  /** Set once describe returns — success or handled failure. A tile without one cannot be sent. */
  ticket: string | null
  /**
   * The public Blob URL for the optimistic bubble — set when an upload's result names it. A
   * deduplicated tile never uploads, so its bubble URL rides on `existing` instead and this
   * stays null.
   */
  blobUrl: string | null
  /**
   * media-dedupe P2. The STORED pathname (Vercel's suffix included) of an uploaded tile's bytes —
   * the key the send's `contentHashes` is keyed by, matching the pathname inside the ticket.
   * Null until the upload returns; a deduplicated tile never uploads, so it stays null there.
   */
  pathname: string | null
  /**
   * media-dedupe P2. `contentHashOf` over the exact bytes this tile would PUT — computed for EVERY
   * pick, because hashing is a millisecond and the branch is a bug waiting to be re-decided.
   * Cleared to null when the tile turns out to be a duplicate: a deduplicated tile sends a
   * pointer, and the hash belongs to whichever row ends up owning the bytes.
   */
  contentHash: string | null
  /**
   * media-dedupe P2. Set when the pre-check matched: these bytes are already in the collection
   * behind this photograph, so the tile will send a REFERENCE to it instead of a ticket for
   * fresh bytes. A tile with one has no ticket and needs no describe — the keeper's description
   * rides along through `resolveAttachment` on the server.
   */
  existing: NinaExistingPhoto | null
}

/**
 * One photograph the composer is handing to the send, in tile order — the payload's unit since
 * phase 6, a discriminated union since media-dedupe P2, because a tile can now be one of two
 * things:
 *
 *   · `upload` — this composer PUT the bytes; the signed describe ticket carries them, and
 *     `contentHash` (null when hashing failed) lets the server race-close a duplicate it cannot
 *     see yet. `pathname` is the STORED form, which is the key `contentHashes` is keyed by.
 *   · `deduped` — the pre-check proved the bytes are already in the collection behind
 *     `imageId`; the message references them, and `url` (the keeper's CDN URL) exists only for
 *     the optimistic bubble. No ticket, no hash, no bytes on the wire.
 */
export type ComposerDraftImage =
  | {
      source: 'upload'
      ticket: string
      url: string
      pathname: string
      contentHash: string | null
    }
  | {
      source: 'deduped'
      url: string
      imageId: string
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
  /** Needed to build `nina/<userId>/chat/<id>.jpg`. Not a capability — see the header. */
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

  const ready = tiles.filter(
    (t) => t.state === 'ready' && (t.ticket !== null || t.existing !== null),
  )
  const inFlight = tiles.some((t) => t.state !== 'ready' && t.state !== 'error')
  /* `|| attachment !== null` is phase 8's clause and `|| photo !== null` is F34 R2's — the fourth
   * and final one. Phase 6's image clause was already in the disjunction when it landed; nobody
   * rewrites this condition, they extend it. Mirrors the server rule in `sendNinaMessage`
   * (`lib/nina/actions/send.ts`) exactly, clause for clause: text, tickets, run, existing blob. */
  const canSend =
    (value.trim().length > 0 || ready.length > 0 || attachment !== null || photo !== null) &&
    !inFlight &&
    !busy

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
        patch(tile.id, { state: 'checking' })

        /*
         * media-dedupe P2. Hash the EXACT bytes a PUT would carry — `compressed.file`, never the
         * original pick (invariant 4: the hash describes the stored bytes, and only these bytes
         * are stored). Every pick is hashed; the millisecond is cheaper than the branch. A hash
         * that cannot be computed degrades to null and the tile uploads as it always has.
         */
        let contentHash: string | null = null
        try {
          contentHash = await contentHashOf(compressed.file)
        } catch {
          contentHash = null
        }

        /*
         * The SECOND key, over the pick itself (2026-09-10's measured defect): a photograph that
         * was downloaded out of the collection and re-uploaded re-encodes here into bytes nobody
         * has ever stored, so the encode hash above can never match — but the picked file's own
         * bytes ARE a stored row's object, byte for byte, and `content_hash` holds "sha-256 over
         * a row's stored bytes" for every row. Asking both keys in one lookup is what turns
         * "download → re-upload" from a second Blob object into an attach. Same degradation rule
         * as the encode hash: a miss costs nothing, a photograph is never blocked on it.
         */
        let sourceHash: string | null = null
        try {
          sourceHash = await contentHashOf(file)
        } catch {
          sourceHash = null
        }

        /*
         * The pre-check, BEFORE any upload: one indexed, owner-scoped lookup over BOTH keys. A
         * transport failure degrades to "no duplicate" — the pick uploads, the race-close at send
         * time still holds the encode's hash, and a photograph never fails to send because dedup
         * had a bad round trip.
         */
        const duplicate =
          contentHash === null && sourceHash === null
            ? null
            : await findNinaDuplicateChatImage({ contentHash, sourceHash }).catch(() => null)

        const step = planNinaPickUpload({ contentHash, duplicate })
        if (step.outcome === 'attach-existing') {
          /* The bytes are already in the collection. No PUT, no mint, no describe — the tile is
           * simply DONE, holding the existing photograph it will attach. */
          patch(tile.id, {
            state: 'ready',
            contentHash: null,
            existing: step.existing,
          })
          return
        }

        patch(tile.id, { state: 'uploading' })

        const requested = ninaChatPathname(userId, newId())
        const result = await upload(requested, compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          // Nothing to declare: the chat branch of the route parses no client payload.
        })
        patch(tile.id, { state: 'describing', blobUrl: result.url, pathname: result.pathname })

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
        patch(tile.id, { state: 'ready', ticket: described.ticket, contentHash: step.contentHash })
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
          pathname: null,
          contentHash: null,
          existing: null,
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
      images: ready.map((tile) =>
        tile.existing !== null
          ? { source: 'deduped' as const, url: tile.existing.url, imageId: tile.existing.id }
          : {
              source: 'upload' as const,
              ticket: tile.ticket as string,
              url: tile.blobUrl as string,
              pathname: tile.pathname as string,
              contentHash: tile.contentHash,
            },
      ),
    })
    setValue('')
    for (const tile of tiles) URL.revokeObjectURL(tile.previewUrl)
    setTiles([])
    setNotice(null)
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      /*
       * Then RELEASE the composer, on the repo owner's explicit ask: "can you automatically hide
       * the keyboard after user press send? right now i have to manually click Done everytime to
       * hide this stupid keyboard". The line here used to keep focus — "he is going to type again —
       * that is what a conversation is" — and keeping it had a second cost the owner had already
       * reported as a bug: `ChatChrome` hides the floating `<` and `^` while focus is anywhere
       * inside this bar, so a send that left focus behind (Enter leaves it in the textarea; a
       * click leaves it on the Send button) also left the conversation without its controls until
       * something else was tapped — and on desktop Chrome, reading her reply taps nothing. Blurring
       * whatever INSIDE this bar holds focus folds the keyboard and puts the controls back in the
       * same frame. The reply-arming effect above still focuses the box, because arming a reply is
       * the start of typing, which is a different moment than the end of sending one.
       */
      const host = el.closest('#nina-composer')
      const active = document.activeElement
      if (host != null && active instanceof HTMLElement && host.contains(active)) active.blur()
    }
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
            onChange={(event) => {
              setValue(event.target.value)
              resize()
            }}
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
