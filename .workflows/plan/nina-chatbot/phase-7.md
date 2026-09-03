# Phase 7: Reply-to and scroll-to-message

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R12 — either party can reply to a specific message, the quoted message is real
context for that turn, and tapping the quote scrolls to the message it names.
**Depends on:** Phase 3 (turn engine, `lib/nina/actions.ts`, `NinaSendPayload.replyToMessageId`),
Phase 4 (the chat screen, `MessageBubble`'s `above` slot and its `id="nina-msg-*"` anchor,
`lib/nina/chatview.ts`)
**Difficulty:** NORMAL
**Package:** `lib/nina`, `components/nina` (plus one field on phase 3's action and one on its turn
input — both additive, both declared below)

---

## Goal

After this phase a reply is a real relationship rather than a nullable column. The runner swipes a
bubble to the right — his own or Nina's — and the composer grows a quoted strip naming who said
what; the message he then sends carries `reply_to_id`, renders a WhatsApp-style quote stub above
its own text, and **arrives at `glm-5.3` with the quoted message spelled out in the user turn**, so
"send a message with this reply as context" is context and not decoration. Tapping any quote stub
scrolls its target into the readable band of the viewport and holds a brief tint on it so the eye
lands on the right line. A quote whose target is no longer in the conversation renders as plain
text and says so if tapped, instead of throwing. Every decision that is arithmetic — how a preview
is truncated, which message a quote resolves to, whether a drag is a reply gesture or the page
scrolling, and how far to scroll and in which direction — is a pure function in
`lib/nina/reply.ts` with a `*.test.ts` beside it, because invariant 6 and `vitest.config.ts`
(`environment: 'node'`, `include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', …]`) leave no other
way to prove it.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates — `lib/nina/reply.ts`** (no `server-only`; imported by both a Server Action and client
components, which is why it holds no DOM types and no db access):

- quote resolution: `quotePreview`, `quoteMediaOf`, `buildQuote`, `resolveQuote`
- the prompt block: `quoteContextBlock`
- the gesture gate: `decideReplySwipe`
- the scroll-target rule: `planQuoteScroll`
- constants: `QUOTE_PREVIEW_MAX_CHARS = 120`, `QUOTE_CONTEXT_MAX_CHARS = 700`,
  `QUOTE_MEDIA_LABEL`, `QUOTE_EMPTY_LABEL = 'Message'`, `REPLY_SWIPE_MIN_DISTANCE = 44`,
  `REPLY_SWIPE_DOMINANCE = 1.6`, `QUOTE_SCROLL_TOLERANCE_PX = 8`,
  `QUOTE_SCROLL_TOP_MARGIN_PX = 16`, `QUOTE_FLASH_MS = 1600`
- types: `QuoteMedia`, `QuoteAuthor`, `QuoteCandidate`, `QuoteView`, `QuotedMessageInput`,
  `ReplySwipeGesture`, `ReplySwipeDecision`, `QuoteScrollGeometry`, `QuoteScroll`

**Creates — `lib/nina/reply.test.ts`.**

**Creates — `components/nina/QuoteStub.tsx`:** `QuoteStub`.

**Signature changes — every input change is additive with a default, so nothing that compiles today
stops compiling; the one return-shape change is item 8 and is called out there:**

1. `components/nina/types.ts` — `ChatMessage` gains **exactly one** field:
   `replyToId: string | null` (**required**, set by `app/nina/page.tsx` and by the optimistic row
   in `ChatScreen`).

   **This phase declares nothing else on that type (ruling E2b).** Its earlier
   `imageUrl?: string | null` and `runId?: string | null` declarations are **deleted**. The image
   field is phase 6's `imageUrls?: readonly string[]` — plural, because a message carries up to
   `NINA_MAX_CHAT_IMAGES`, which is the argument phase 6 made and won — and the run field is phase
   8's `attachment?: RunAttachment | null`, a display-ready object, which phase 8 already says
   supersedes phase 4's `runId` note. Two phases declaring the same field two ways is the conflict
   the ruling exists to prevent, and one optional field declared "so it compiles before phase 6
   lands" is not worth it when phase 6 lands first anyway.

   **What that costs this phase, and how it is paid: `quoteMediaOf` reads booleans the CALLER
   computes.** Phase 7 lands before phase 8, so it cannot name `RunAttachment` — and it does not
   have to. `QuoteCandidate` carries `hasImage: boolean` and `hasRun: boolean`, and `MessageList`
   fills them from whichever fields exist at its landing:
   `hasImage: (m.imageUrls?.length ?? 0) > 0` and `hasRun: m.attachment != null` (`false` at this
   phase's landing, wired by phase 8). `QuoteMedia` keeps **both** `'photo'` and `'run'`: the photo
   path ships live, the run path ships reachable, and phase 8 flips one boolean.

   **The consequence, stated explicitly because it is the point of the whole arrangement: no later
   phase ever edits `lib/nina/reply.ts`.** No type crosses backwards from a later phase into this
   one, and the pure module — the file this phase's whole test suite is about — is finished when
   this phase lands.
2. `components/nina/MessageBubble.tsx` — `MessageBubble({ message, above })` ->
   `MessageBubble({ message, above, quote, flash, onReply, onJumpToQuote })`, and the module gains
   a `'use client'` directive because it now owns a touch gesture.

   **`quote` is rendered ABOVE the `above` slot, and this phase won that argument (ruling E2).**
   The quote gets its own prop rather than competing for `above`, because it must always sit at the
   very top of the bubble — above an image, above a run card — which is where every chat app puts
   it and is not a guarantee an unordered slot can make. Phase 8's printed expression, which
   nested `ReplyQuote` inside `above`, is overruled and has been removed from phase 8's plan.
   `above` carries **images (phase 6) then the run card (phase 8)**, in that order, so the render
   order inside the bubble is:

   > **quote stub → images → run card → text**

   The quote says what he is answering; the images and the card are what he is handing over; the
   text is the message. The final composition, owned by `MessageList` and printed here so the two
   later phases widen one expression instead of writing three:

   ```tsx
   <MessageBubble
     message={m}
     quote={resolveQuote(m, index)}          // phase 7 — its own prop, rendered ABOVE `above`
     above={
       m.imageUrls?.length || m.attachment != null ? (
         <div className="space-y-2">
           {m.imageUrls?.length ? <ChatImages urls={m.imageUrls} /> : null}   {/* phase 6 */}
           {m.attachment != null ? <RunAttachmentCard attachment={m.attachment} /> : null}  {/* phase 8 */}
         </div>
       ) : undefined
     }
   />
   ```

   `resolveQuote(m, index)` is the ruling's shorthand for this file's call, which is
   `resolveQuote(m.replyToId, candidates)` — the resolver takes the pointer and the candidate set,
   for the reason Step 4 gives. Each inset block owns its own bottom margin (`ChatImages`'s
   `mb-2`, `RunAttachmentCard`'s), so the stack needs none.
3. `components/nina/MessageList.tsx` — `MessageList({ messages, typing, todayISO,
   keyboardOverlapPx })` -> `+ { flashId, onReply, onJumpToQuote }`. It also becomes the phase that
   computes `hasImage` / `hasRun` for `quoteMediaOf`, and it keeps passing phase 6's `above`
   untouched.
4. `components/nina/Composer.tsx` — `Composer({ onSend, busy, bottomCss })` ->
   `+ { reply, onCancelReply }`, and its fixed wrapper gains `id="nina-composer"` (measured by
   `ChatScreen` to know how much viewport the chrome is eating).
5. `lib/nina/actions.ts` (**phase 3's file**) — this phase adds exactly one optional field to
   `sendNinaMessage`: `replyToMessageId?: string | null`.

   **The ONE final signature (ruling B1), printed so the head is written once and not four
   times.** Phase 3 creates it; phases 6, 7, 8 and 13 each add exactly one optional field, each in
   its own commit. **Phase 8 adds `runId?: string | null` to this same object** — both plans asked
   for one change rather than two rewrites of the head, and this is it:

   ```ts
   // lib/nina/actions.ts — phase 3 creates it; 6, 7, 8 and 13 each add exactly one optional field.
   export async function sendNinaMessage(input: {
     body: string
     /** phase 6 — signed describe tickets for images already in Blob. */
     imageTickets?: readonly string[]
     /** phase 7 — a `nina_messages.id` this message answers. */
     replyToMessageId?: string | null
     /** phase 8 — a run pinned to this message. */
     runId?: string | null
     /** phase 13 — a blob the server already owns (R26). */
     attachExisting?: { kind: 'avatar' | 'image'; id: string } | null
   }): Promise<SendNinaMessageResult>
   ```

   **At THIS phase's landing the head carries `body`, `imageTickets` (phase 6, which lands first)
   and `replyToMessageId`.** `runId` arrives with phase 8, `attachExisting` with phase 13.

   **The ONE final refusal rule (ruling B1).** An empty `body` is refused unless the message
   carries something else:

   ```ts
   const hasAttachment =
     (input.imageTickets?.length ?? 0) > 0 ||        // phase 6
     input.runId != null ||                           // phase 8
     input.attachExisting != null                     // phase 13
   if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
   ```

   **At this phase's landing the clauses present are phase 6's `imageTickets` one and nothing
   else, and `replyToMessageId` adds NO clause — a quote alone is not a message.** Replying to
   something without typing anything and without attaching anything is a gesture, not a send, and
   the refusal it earns is the plain empty-body one. That is why this phase touches the rule
   nowhere: it adds a field to the head and leaves the condition monotone for phases 8 and 13.

   The return type `SendNinaMessageResult` is unchanged **in shape but not in content**: see
   change 8 below — `SentBubble` gains one field, and this phase owns it.
6. `lib/nina/turn.ts` (**phase 3's file**) — `NinaTurnInput` gains
   `quoted?: QuotedMessageInput | null`, and `userTurnText` gains one branch that renders it
   through `quoteContextBlock`. Nothing else in `turn.ts` moves.

   **The ONE final `NinaTurnInput` (ruling B2).** Phase 3 creates it; phases 6, 7 and 8 each add
   one optional field:

   ```ts
   // lib/nina/turn.ts — phase 3 creates it; 6, 7 and 8 each add one optional field.
   export interface NinaTurnInput {
     /* phase 3's base fields, unchanged */
     imageDescriptions?: readonly string[]          // phase 6 — glm-4.6v's text, never an image block
     quoted?: QuotedMessageInput | null             // phase 7
     attachedRunId?: string | null                  // phase 8
   }
   ```

   Two things that are **not** on this type and must not be put here. Phase 13's `avatar` goes on
   **`NinaContext`** (and `BuildNinaContextInput`), which is correct and stays there — it is
   standing state about who she looks like, not an input to one turn. And phase 10's
   `NinaTurnOptions.runId` is **a different field from phase 8's `attachedRunId`, and both
   survive**: `NinaTurnOptions.runId` is written to `nina_messages.run_id` on every row the turn
   persists, while `attachedRunId` is resolved through `buildNinaRunFact` and rendered into the
   prompt. For a chat attachment they happen to carry the same id; for phase 10's `run_committed`
   turn they need not, which is exactly why collapsing them would be wrong.
7. `components/nina/ChatScreen.tsx` — no prop change. `NOTICE_TEXT` gains a third key,
   `'quote-missing'`.
8. `SentBubble` (`lib/nina/actions.ts`, **phase 3's return type**) gains
   `replyToId: string | null` — **and this phase owns that edit (ruling B1).** This plan's earlier
   handoff asked whether it should land in phase 3 or as a follow-up card; **decided: phase 7**,
   because this phase already modifies `lib/nina/actions.ts` where the type is declared, and it is
   two lines. Step 11 adds the field and populates it from the persisted first bubble; Step 9 reads
   it in `ChatScreen`'s reveal loop. Without it, Nina's own quote renders only on the next server
   render of `/nina` and not on the optimistic reveal, which is R12's UI lagging the database by a
   page load for no reason. It is the one change here that widens a **return** shape rather than an
   input, so it is called out separately: every consumer of `SentBubble` gains a field, and there is
   exactly one, in `ChatScreen`.

**Requires (from earlier phases).** Four things, all of them already promised in writing:

1. **Phase 1** — `getNinaMessagesByIds(userId, ids: readonly string[]): Promise<NinaMessageRow[]>`
   (`phase-1.md:1488`, whose own docstring says *"Phase 7 resolves a quote target"*). Scoped by
   `userId`, so a foreign id simply does not come back — that is the whole ownership check and it
   is one query.
2. **Phase 1** — `NinaMessageRow` is `{ id, seq, role, body, createdAt, source, turnId, replyToId,
   runId, readAt }` (`phase-1.md:1155`) and `listNinaMessages` returns it, so `replyToId` is
   already on the rows `app/nina/page.tsx` maps.

   **`body` and `createdAt` are settled, not incidental (ruling A1).** Items 1 and 2 above quote
   phase 1 correctly, and the reason they look like they disagree with `lib/db/schema.ts` is that
   the seam has **three layers, three spellings and exactly one mapper**:

   | layer | owner | the message fields |
   |---|---|---|
   | `lib/db/schema.ts` — the columns | phase 1 | `text`, `sent_at` (Drizzle: `ninaMessages.text`, `ninaMessages.sentAt`) |
   | `lib/nina/queries.ts` — the data-access DTO (`NinaMessageRow`, `NinaMessageInsert`) | phase 1 | **`body`, `createdAt`** — uniformly, in **every** function, because they all `select(messageColumns)` |
   | `lib/nina/context.ts` — the prompt-layer input (`MessageInput`) | phase 2 | `text`, `sentAt` |

   The single translation point is `lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3), which
   maps `NinaMessageRow → MessageInput` with `text: row.body` and `sentAt: row.createdAt`. **No
   side is to be "fixed" to match the other.** So Step 10's `row.body` and Step 11's
   `quotedRow.body` are correct as written and are not a spelling this phase got lucky with —
   `getNinaMessagesByIds` returns the same DTO as `listNinaMessages`, which is what makes reading
   `.body` off either of them the same read.
3. **Phase 1** — `nina_messages.reply_to_id` is a real self-FK with `ON DELETE SET NULL`
   (`phase-1.md:499`, decision D-5). A deleted target therefore nulls the pointer in the database;
   this phase's *degrade to plain text* path covers the other case — a target that is alive but
   outside the rendered window.
4. **Phase 4** — `MessageBubble` renders `id={`nina-msg-${message.id}`}` on its `<li>` and accepts
   an `above` slot (`phase-4.md:1264`), `lib/nina/chatview.ts` exports the `ScrollGeometry`
   interface (`phase-4.md:439`), and `ChatScreen` adopts the server's id for the runner's own row
   as soon as the action returns (`phase-4.md:1868` — *"so phase 7 can quote it"*). All three are
   used exactly as written.

**Leaves alone (owned by others):**

- `lib/nina/chatview.ts`, `lib/nina/reveal.ts` — Phase 4. `reply.ts` *imports* `ScrollGeometry`
  from `chatview.ts` and re-declares none of `groupIntoDays` / `isNearBottom` /
  `decideAutoScroll` / `keyboardOverlapPx`.
- `lib/nina/scroll.ts` — Phase 8. Scroll *restoration* across a navigation is not this phase, and
  the "get me back to where I was before the jump" affordance is handed to it in Handoffs.
- `lib/nina/prompts/*`, `lib/nina/context.ts`, `lib/nina/load.ts` — Phase 2. `SEND_TOOL` already
  carries `replyToMessageId`; no schema, persona or tool text is edited here.
- `lib/nina/queries.ts`, `lib/db/schema.ts`, `drizzle/*` — Phase 1. No column, index or migration
  is added; `reply_to_id` already exists.
- `nina_message_images`, `app/api/upload` (Phase 6), the run attachment card and
  `app/r/[id]/page.tsx` (Phase 8), the unread dot (Phase 10), `lib/nina/imagegen.ts` (Phase 12),
  the album (Phase 13). This phase **declares** neither the image field nor the run field —
  ruling E2b gives `imageUrls?: readonly string[]` to phase 6 and `attachment?: RunAttachment |
  null` to phase 8. `MessageList` reads them once each, collapses them to `hasImage` / `hasRun`,
  and renders a word; nothing here populates them, and nothing here renders a thumbnail or a run
  card.
- `lib/format.ts`. The quote stub carries no timestamp, for the reason `app/nina/page.tsx` gives
  for having no per-message clock.
- `app/globals.css`. **No keyframe is added** — see Step 5 on why the flash is a colour
  transition, and what `tests/motion.reducedMotion.test.ts` would demand if it were not.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/reply.ts` | create | quote resolution, the prompt block, the swipe gate, the scroll rule — all pure |
| `lib/nina/reply.test.ts` | create | ~40 cases over the five exported rules |
| `components/nina/types.ts` | modify | `ChatMessage` gains `replyToId` — and nothing else; ruling E2b gives the image field to phase 6 and the run field to phase 8 (`phase-4.md:1144`) |
| `components/nina/QuoteStub.tsx` | create | the WhatsApp-style quoted strip, used in two places |
| `components/nina/MessageBubble.tsx` | modify | `'use client'`, the `above` slot filled with a stub, the swipe gesture, the flash tint, the keyboard reply button (`phase-4.md:1264`) |
| `components/nina/MessageList.tsx` | modify | resolve each row's quote, pass `flashId` and both handlers down (`phase-4.md:1423`) |
| `components/nina/Composer.tsx` | modify | the reply draft strip above the input row, `id="nina-composer"`, focus on arm (`phase-4.md:1587`) |
| `components/nina/ChatScreen.tsx` | modify | draft-quote state, the jump effect, the flash timer, `replyToMessageId` on send (`phase-4.md:1776`) |
| `app/nina/page.tsx` | modify | one field in the row mapping (`phase-4.md:2015`) |
| `lib/nina/actions.ts` | modify | accept `replyToMessageId`, resolve it through `getNinaMessagesByIds`, pass the quoted row into the turn, **and add `replyToId: string | null` to `SentBubble`** (ruling B1 — this phase owns it) (`phase-3.md:2447`) |
| `lib/nina/turn.ts` | modify | `NinaTurnInput.quoted` and one branch in `userTurnText` (`phase-3.md:1951` and `:1995`) |

Eleven files where the index estimated ~6. The extra five are all one-field edits to phase 3's and
phase 4's seams — the alternative is a second action and a second bubble component, which is worse.

## Implementation Steps

### Step 1: `lib/nina/reply.ts` — the five rules, as pure functions

**File:** `lib/nina/reply.ts` (new)
**Change:** the whole file. This is where R12 actually lives; the components below are markup and
event plumbing around it.

**Why every one of these is here and not in a component.** Invariant 6, and the precedent is
exact: `lib/photos/gallery.ts` was carved out of `components/ui/PhotoViewer.tsx` so that
`decideSwipe`'s three zoom-protection rules could be asserted without a browser, and its header
argues the case better than this one can. `tests/ui.sheetFocus.test.ts` makes the fuller argument.
`decideReplySwipe` below is the same shape as `decideSwipe` for the same reason — it is a gate that
must not eat the chat log's vertical scroll, and "must not" is a claim that has to be provable.
`planQuoteScroll` is the one the phase brief names: *where* to scroll and *how far* is arithmetic,
even though the scrolling itself is a browser effect.

**Code:**

```ts
import type { ScrollGeometry } from './chatview'

/**
 * Reply-to (R12), as the four decisions it actually is: what a quote says, which message it
 * points at, whether a drag was a reply gesture, and where the page has to move to show the
 * target.
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────────────────────────
 * `vitest.config.ts` is `environment: 'node'` with an `include` matching `*.test.ts` only: there
 * is no jsdom, no `TouchEvent`, no `scrollHeight`. `lib/photos/gallery.ts` was split out of
 * `PhotoViewer.tsx` for exactly this reason and its header states it; `lib/nina/reveal.ts` and
 * `lib/nina/chatview.ts` did the same for phase 4's timing and auto-scroll. A rendered-scenario
 * test would prove one gesture; these prove the rules.
 *
 * `ScrollGeometry` is IMPORTED from `chatview.ts` rather than re-declared. The two modules answer
 * different questions — "should this new bubble move the page" versus "move the page to this old
 * one" — but they measure the same three numbers off the same document, and two structurally
 * identical interfaces would eventually disagree.
 *
 * No `import 'server-only'`, deliberately: `lib/nina/actions.ts` (a Server Action) and
 * `components/nina/*` (client) both import this, which is only safe because there is nothing in
 * here but arithmetic and string handling — no db, no env, no DOM types in any signature.
 */

/* ── what a quote says ─────────────────────────────────────────────────────────────────────── */

/**
 * How much of the quoted message the stub carries into the DOM.
 *
 * 120 characters is about two lines at the stub's 13px, which is what `line-clamp-2` will show,
 * and the cap exists so a 700-character bubble (`MAX_BUBBLE_CHARS`) is not shipped four times over
 * in a conversation full of replies. The clamp is the visual truth and this is the payload truth;
 * they agree at two lines, and if they ever disagree the clamp wins, which is the safe direction.
 */
export const QUOTE_PREVIEW_MAX_CHARS = 120

/**
 * The cap on the same text when it goes to `glm-5.3` instead of to the screen. Equal to phase 3's
 * `MAX_BUBBLE_CHARS`, i.e. a whole bubble, because the model needs the message and not a taste of
 * it — this is the difference between "reply as context" and reply as decoration.
 */
export const QUOTE_CONTEXT_MAX_CHARS = 700

/**
 * What the quoted message carries besides text.
 *
 * **Both members survive this phase (ruling E2b).** `'photo'` ships LIVE — phase 6 lands first, so
 * a quote whose target is an image-only message says "Photo" the day this phase lands. `'run'`
 * ships REACHABLE — nothing sets `hasRun` yet, and phase 8 flips one boolean at its call site in
 * `MessageList`. Shipping the dead branch now is what buys the guarantee below: **no later phase
 * edits `lib/nina/reply.ts`.**
 */
export type QuoteMedia = 'none' | 'photo' | 'run'

/**
 * The word the stub shows for a target whose own text is empty — an image-only message (phase 6)
 * or a bare run attachment (phase 8).
 *
 * **This is the coordination point with phases 6, 8, 12 and 13**, and it is a WORD rather than a
 * thumbnail on purpose. A 28px image thumbnail inside a quote inside a bubble needs the blob URL,
 * a second `next/image` sizing decision and a fallback for a dead blob — all of which belong to
 * the phase that owns images. A quote that reads "You · Photo" is honest, costs nothing, and
 * needs no edit when those phases land: `MessageList` computes `hasImage` / `hasRun` off
 * `ChatMessage.imageUrls` (phase 6) and `.attachment` (phase 8), and this stub starts saying so by
 * itself. If phase 6 later wants the thumbnail, `QuoteStub` takes one optional prop and this
 * constant stays as its fallback.
 */
export const QUOTE_MEDIA_LABEL: Record<Exclude<QuoteMedia, 'none'>, string> = {
  photo: 'Photo',
  run: 'Run',
}

/** The last-resort label: a target with no text and no media. Should not exist; is not a crash. */
export const QUOTE_EMPTY_LABEL = 'Message'

/** Whose message is being quoted, from the runner's point of view. */
export type QuoteAuthor = 'you' | 'nina'

/**
 * A message a quote could point at. Structural, so `lib/` never imports from `components/` — the
 * same rule `groupIntoDays` follows.
 *
 * **`hasImage` and `hasRun` are BOOLEANS THE CALLER COMPUTES, and that is ruling E2b's whole
 * mechanism.** This phase lands before phase 8, so it cannot name `RunAttachment`; and phase 6
 * owns `ChatMessage.imageUrls` (plural), so naming a URL field here would be this file declaring
 * another phase's type. `MessageList` fills both — `hasImage: (m.imageUrls?.length ?? 0) > 0`,
 * `hasRun: m.attachment != null` — and this module never learns what a blob URL or a run is.
 * Nothing crosses backwards from a later phase, and no later phase edits this file.
 */
export interface QuoteCandidate {
  id: string
  /** True when the quoted message is the runner's own. */
  mine: boolean
  text: string
  /** Phase 6's `imageUrls`, collapsed by the caller. */
  hasImage: boolean
  /** Phase 8's `attachment`, collapsed by the caller. `false` until phase 8 lands. */
  hasRun: boolean
}

/** What the stub renders. Everything it needs, nothing it does not. */
export interface QuoteView {
  /** The `nina_messages.id` to scroll to. Also the DOM anchor: `nina-msg-${targetId}`. */
  targetId: string
  author: QuoteAuthor
  /** Never empty — see `buildQuote`. */
  preview: string
  media: QuoteMedia
}

/**
 * One line of text, whatever the source did with whitespace.
 *
 * ── WHY THE NEWLINES GO ───────────────────────────────────────────────────────────────────────
 * The bubble itself is `whitespace-pre-wrap`, because her line breaks are part of how she talks.
 * A quote is not the message, it is a reference to it, and a two-line stub that spends both lines
 * on a blank line and a "hm" is useless. Collapsing first also makes the character cap mean
 * something: 120 characters of prose, not 120 characters of `\n`.
 *
 * ── WHY IT CUTS AT A WORD ─────────────────────────────────────────────────────────────────────
 * `slice(0, 120)` lands mid-word four times out of five and reads as a rendering fault. The cut
 * retreats to the last space, but only if that space is in the final 40% of the budget — for a
 * pasted URL or an Indonesian compound with no spaces there is no good break, and losing 70% of
 * the preview to find one is worse than cutting cleanly.
 */
export function quotePreview(text: string, max: number = QUOTE_PREVIEW_MAX_CHARS): string {
  if (typeof text !== 'string') return ''
  if (!Number.isFinite(max) || max <= 0) return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat

  const hard = flat.slice(0, max)
  const lastSpace = hard.lastIndexOf(' ')
  const body = lastSpace >= Math.floor(max * 0.6) ? hard.slice(0, lastSpace) : hard
  return `${body.trimEnd()}…`
}

/**
 * Which media word a message earns. **A photo wins over a run**, and the case that decides it is
 * phase 13's: a message can carry both a generated photo and the run it is about, and the photo
 * is the thing a reader recognises in a one-line quote.
 *
 * Takes two BOOLEANS and not a `ChatMessage`, per ruling E2b. The caller — `MessageList`, the one
 * module that already imports `ChatMessage` — does the collapsing, so phase 6 owns the plural
 * `imageUrls` and phase 8 owns `attachment` and neither field name appears in this file. That is
 * what makes it true that no later phase edits `lib/nina/reply.ts`.
 */
export function quoteMediaOf(message: { hasImage: boolean; hasRun: boolean }): QuoteMedia {
  if (message.hasImage) return 'photo'
  if (message.hasRun) return 'run'
  return 'none'
}

/**
 * The view model for one candidate. `preview` is guaranteed non-empty: text if there is text, the
 * media word if there is not, and `QUOTE_EMPTY_LABEL` if there is neither — because a stub that
 * renders an empty string is a 44px tap target with nothing in it, which reads as a bug rather
 * than as a quote.
 *
 * The media word is derived HERE, from the candidate's two booleans, rather than passed in — one
 * fewer thing for the two call sites (`MessageList`'s candidate map and `ChatScreen`'s
 * `handleReply`) to get inconsistently right.
 */
export function buildQuote(candidate: QuoteCandidate): QuoteView {
  const preview = quotePreview(candidate.text)
  const media = quoteMediaOf(candidate)
  const fallback = media === 'none' ? QUOTE_EMPTY_LABEL : QUOTE_MEDIA_LABEL[media]
  return {
    targetId: candidate.id,
    author: candidate.mine ? 'you' : 'nina',
    preview: preview.length > 0 ? preview : fallback,
    media,
  }
}

/**
 * The quote a message shows, or `null` for "render it as a plain message".
 *
 * ── NULL IS A FEATURE, AND IT IS THE PHASE'S EXIT CRITERION ───────────────────────────────────
 * Three real cases end here. `reply_to_id` was nulled by the database when its target was deleted
 * (phase 1's `ON DELETE SET NULL`, decision D-5). The target is alive but older than the 200 rows
 * `app/nina/page.tsx` renders, so there is nothing on this screen to point at. Or a client-side
 * optimistic row referenced an id that the send failed to confirm. In all three the message itself
 * is intact and gets rendered exactly as it would have been without a reply — no empty stub, no
 * "message unavailable" placeholder, and above all no thrown render.
 *
 * A linear `find` over at most 200 candidates, called once per quoted message. Building a `Map`
 * would be faster asymptotically and slower in practice at this size; if the history window ever
 * grows past a few thousand, index it at the call site and pass the lookup in.
 */
export function resolveQuote(
  replyToId: string | null | undefined,
  candidates: readonly QuoteCandidate[],
): QuoteView | null {
  if (replyToId == null || replyToId.length === 0) return null
  const target = candidates.find((candidate) => candidate.id === replyToId)
  return target === undefined ? null : buildQuote(target)
}
```

**Impact:** new module. Nothing imports it until Step 3.

---

### Step 2: `lib/nina/reply.ts` (part 2) — the prompt block, the gesture, the scroll

**File:** `lib/nina/reply.ts` (appended below Step 1's code)
**Change:** the three remaining rules. Same file, split for reading.

**On the prompt block.** Phase 3 serialises the whole `NinaContext` as JSON into the user turn, and
`conversation.window[]` already carries a `replyToId` per turn — so in the lucky case the model
*could* join the ids itself. `quoteContextBlock` exists because that case is not the only one and
because a join is not an instruction. Two things it fixes: RU-14's window is 40 messages, so a
reply to something older is a dangling id in the JSON and the quoted text is genuinely absent; and
even when it is present, nothing in the payload tells her *that this turn is a reply* rather than a
turn that happens to contain an id. The block says both, in the register the rest of the user turn
is written in (`'HE JUST SAID:'`, `'HE SENT AN IMAGE.'` — `phase-3.md:1995`).

**On the gesture.** WhatsApp swipes right on a bubble to reply, on both incoming and outgoing
messages, and R12's own words are *"just like whatsapp"* — so the gesture is the default and it is
what muscle memory will try first. The design brief backs it twice over: this is *"a phone app that
happens to run in Safari"*, and *"if you're deciding between adding something and leaving it out,
leave it out"* — a swipe adds nothing to the quiet reading surface, where a per-bubble menu button
on 200 rows would be 200 pieces of permanent furniture in an app whose whole thesis is a coach's
notebook. The two rejected alternatives, on the record: a **long-press** collides with iOS text
selection and the native callout menu on a `<div>` full of selectable prose, which is a real
capability in a chat (copying what she said) and not one worth trading; a **tap** collides with
nothing today but would make the bubble itself a button, which breaks text selection just as
thoroughly. What a gesture cannot do is be discovered by a keyboard or by VoiceOver, so Step 5 adds
a focus-revealed `<button>` per bubble as the non-gesture path — the skip-link pattern, invisible
until focused.

**Code (appended):**

```ts
/* ── the quoted message, as Nina reads it ──────────────────────────────────────────────────── */

/**
 * What the action hands the turn. Deliberately not `QuoteCandidate`: the model needs the whole
 * message and a time, and does not need a media enum it cannot see. `sentAtLabel` is phase 2's
 * `'Tue 2 Sep 07:14'` spelling — the same string `ConversationTurn.sentAtLabel` carries, so the
 * quoted message is timestamped the way every other message in the payload is (invariant 3).
 */
export interface QuotedMessageInput {
  id: string
  /** True when the quoted message is the RUNNER's. False when it is one of Nina's own. */
  mine: boolean
  text: string
  sentAtLabel: string | null
}

/**
 * The block that makes `reply_to_id` mean something to `glm-5.3`.
 *
 * Rendered into the user turn immediately BEFORE `'HE JUST SAID:'`, so she reads the thing being
 * answered before she reads the answer — which is the order he saw it in, and the order the screen
 * shows it in.
 *
 * The last line is an instruction and not a fact, which is the one liberty this block takes.
 * Without it the measured failure mode of a quoted turn is a full re-answer of the quoted message
 * as though it had just arrived; naming the relationship is what turns it into a reply.
 */
export function quoteContextBlock(quoted: QuotedMessageInput): string {
  const whose = quoted.mine ? 'one of HIS earlier messages' : 'one of YOUR earlier messages'
  const when = quoted.sentAtLabel == null ? '' : `, sent ${quoted.sentAtLabel}`
  const text = quotePreview(quoted.text, QUOTE_CONTEXT_MAX_CHARS)
  return [
    `HE IS REPLYING TO A SPECIFIC MESSAGE — ${whose}${when}. This is it:`,
    `"${text}"`,
    'Answer what he says next AS A REPLY TO THAT MESSAGE. Do not answer that message again from scratch.',
  ].join('\n')
}

/* ── the gesture ───────────────────────────────────────────────────────────────────────────── */

/**
 * The minimum rightward travel, in CSS px, before a drag counts as a reply.
 *
 * 44 rather than `gallery.ts`'s 48, and the difference is the competing gesture. There, the other
 * gesture was a vertical scroll through a 1600px screenshot inside a fixed overlay; here it is the
 * document scroll of the whole conversation, which the dominance ratio below rejects far more
 * aggressively — so the distance itself can sit at the 44pt tap floor the design brief makes
 * non-negotiable, which is also about the width of a thumb's comfortable drag on a 414px screen.
 */
export const REPLY_SWIPE_MIN_DISTANCE = 44

/**
 * How much more horizontal than vertical the drag must be.
 *
 * 1.6, deliberately stricter than `gallery.ts`'s 1.2. That file was protecting a pan container;
 * this is protecting **the primary interaction of the screen** — scrolling a conversation. A
 * thumb-flick up the chat log arcs sideways, and every false positive here is a reply draft the
 * runner did not ask for while he was trying to read. The failure directions are not symmetric: a
 * rejected swipe costs one more swipe, an accepted scroll costs a dismissal and a lost scroll
 * position.
 */
export const REPLY_SWIPE_DOMINANCE = 1.6

/**
 * `visualViewport.scale` is a float and settles on 1.0000000000000002-style values after a
 * pinch-and-release, so "is the page zoomed" cannot be `> 1`. Same value and same reason as
 * `gallery.ts`'s `ZOOM_EPSILON`.
 */
const ZOOM_EPSILON = 0.01

/** What the bubble measures from a `touchend`, with no DOM types in the signature. */
export interface ReplySwipeGesture {
  /** `end.clientX - start.clientX`. Positive when the finger moved right. */
  dx: number
  /** `end.clientY - start.clientY`. */
  dy: number
  /** The MAXIMUM concurrent touches seen at any point in the gesture, not the count at the end. */
  touches: number
  /** `visualViewport.scale` at the end of the gesture; 1 when the page is not zoomed. */
  zoomScale: number
}

export type ReplySwipeDecision = 'reply' | 'none'

/**
 * Whether a finished drag on a bubble should arm a reply.
 *
 * ── THE FOUR RULES, IN THE ORDER THEY MATTER ──────────────────────────────────────────────────
 *   1. more than one finger is a pinch, never a reply — and the count is the MAXIMUM seen during
 *      the gesture, because a pinch that begins with one finger down still has to lose;
 *   2. a zoomed page means a horizontal drag is the reader panning around;
 *   3. RIGHTWARD ONLY. `dx <= 0` is never a reply: a leftward drag from near the screen edge is
 *      how iOS Safari does forward navigation, and WhatsApp's own reply gesture is rightward on
 *      both sides of the conversation, so this is muscle memory rather than a preference;
 *   4. far enough, and dominantly horizontal, or the chat log keeps its scroll.
 *
 * There is no live drag-follow transform, and that is a decision rather than an omission. It would
 * be the first sustained animation in the codebase outside `ri-pulse`, whose reduced-motion escape
 * `tests/motion.reducedMotion.test.ts` guards; and the feedback a swipe actually needs is
 * confirmation that the reply was armed, which is the draft strip appearing in the composer, 44px
 * from the thumb that did it.
 */
export function decideReplySwipe(gesture: ReplySwipeGesture): ReplySwipeDecision {
  const { dx, dy, touches, zoomScale } = gesture
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'none'
  if (touches > 1) return 'none'
  if (Number.isFinite(zoomScale) && zoomScale > 1 + ZOOM_EPSILON) return 'none'
  if (dx < REPLY_SWIPE_MIN_DISTANCE) return 'none'
  if (dx < Math.abs(dy) * REPLY_SWIPE_DOMINANCE) return 'none'
  return 'reply'
}

/* ── the scroll target ─────────────────────────────────────────────────────────────────────── */

/** Under this much movement the page is left alone; the flash alone identifies the target. */
export const QUOTE_SCROLL_TOLERANCE_PX = 8

/** The gap above a target too tall to centre. One 4pt step up from the bubble gap. */
export const QUOTE_SCROLL_TOP_MARGIN_PX = 16

/** How long the tint holds on the message a quote landed on. See Step 5 for why 1600ms. */
export const QUOTE_FLASH_MS = 1600

/**
 * What the component measures, extending phase 4's three document numbers with the target's own
 * geometry and the chrome that is covering the viewport.
 */
export interface QuoteScrollGeometry extends ScrollGeometry {
  /** Document-space top of the target element: `rect.top + scrollTop`. */
  targetTop: number
  /** `rect.height`. */
  targetHeight: number
  /** Fixed chrome eating the TOP of the viewport. 0 on this screen — its header scrolls away. */
  obstructedTopPx: number
  /** Composer + tab bar + FAB overhang + software keyboard. Measured, not assumed. */
  obstructedBottomPx: number
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches`. */
  reducedMotion: boolean
}

export type QuoteScroll =
  | { kind: 'none' }
  | { kind: 'scroll'; top: number; behavior: 'smooth' | 'instant' }

/**
 * Where the document has to be so the quoted message is comfortably readable.
 *
 * ── THE BAND, NOT THE VIEWPORT ────────────────────────────────────────────────────────────────
 * `scrollIntoView({ block: 'center' })` would be one line and would be wrong here, because on this
 * screen the bottom ~150px of the viewport is a fixed composer over a fixed tab bar with a raised
 * FAB, and up to another 300px is the software keyboard when it is open. Centring in the *viewport*
 * therefore centres in a strip that is partly under the chrome. The readable band is
 * `clientHeight - obstructedTop - obstructedBottom`, and the target is centred in THAT.
 *
 * ── THE THREE CASES ───────────────────────────────────────────────────────────────────────────
 *   - a target shorter than the band is centred in it, which is what a reader jumping backwards
 *     wants: the quoted message plus some of what surrounded it;
 *   - a target taller than the band is aligned to the band's top with a 16px margin, because
 *     centring a tall bubble hides its beginning, and the beginning is the part being quoted;
 *   - a band of zero or less — the keyboard open on a short viewport — degrades to "put the target
 *     at the top of the document viewport", which is the only remaining honest answer.
 *
 * Then it is CLAMPED to `[0, scrollHeight - clientHeight]`, so a quote near either end of the
 * conversation lands at the end rather than asking for a scroll position that does not exist. A
 * move smaller than the tolerance returns `'none'`: the target is already on screen, and the
 * caller's flash is what identifies it. `'instant'` under reduced motion, matching
 * `decideAutoScroll`'s treatment of the same setting.
 */
export function planQuoteScroll(geometry: QuoteScrollGeometry): QuoteScroll {
  const {
    targetTop,
    targetHeight,
    scrollTop,
    scrollHeight,
    clientHeight,
    obstructedTopPx,
    obstructedBottomPx,
    reducedMotion,
  } = geometry

  const measured = [
    targetTop,
    targetHeight,
    scrollTop,
    scrollHeight,
    clientHeight,
    obstructedTopPx,
    obstructedBottomPx,
  ]
  if (!measured.every(Number.isFinite)) return { kind: 'none' }

  const top = Math.max(0, obstructedTopPx)
  const bottom = Math.max(0, obstructedBottomPx)
  const band = clientHeight - top - bottom

  let desired: number
  if (band <= 0) desired = targetTop - QUOTE_SCROLL_TOP_MARGIN_PX
  else if (targetHeight >= band) desired = targetTop - top - QUOTE_SCROLL_TOP_MARGIN_PX
  else desired = targetTop - top - (band - targetHeight) / 2

  const maxTop = Math.max(0, scrollHeight - clientHeight)
  const next = Math.round(Math.min(Math.max(desired, 0), maxTop))

  if (Math.abs(next - scrollTop) <= QUOTE_SCROLL_TOLERANCE_PX) return { kind: 'none' }
  return { kind: 'scroll', top: next, behavior: reducedMotion ? 'instant' : 'smooth' }
}
```

**Impact:** `lib/nina/reply.ts` is complete. `turn.ts` imports `quoteContextBlock` and
`QuotedMessageInput` from it in Step 11; the components import the rest.

---

### Step 3: `lib/nina/reply.test.ts`

**File:** `lib/nina/reply.test.ts` (new)
**Change:** the whole suite. Matched by `include: ['… , 'lib/**/*.test.ts', …]`, so `npm test`
picks it up with no config change.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  QUOTE_EMPTY_LABEL,
  QUOTE_PREVIEW_MAX_CHARS,
  QUOTE_SCROLL_TOP_MARGIN_PX,
  REPLY_SWIPE_MIN_DISTANCE,
  buildQuote,
  decideReplySwipe,
  planQuoteScroll,
  quoteContextBlock,
  quoteMediaOf,
  quotePreview,
  resolveQuote,
  type QuoteCandidate,
  type QuoteScrollGeometry,
  type ReplySwipeGesture,
} from './reply'

/* ── quotePreview ──────────────────────────────────────────────────────────────────────────── */

describe('quotePreview', () => {
  it('collapses every kind of whitespace into single spaces', () => {
    expect(quotePreview('pagi   mif\n\nlari\tlagi?')).toBe('pagi mif lari lagi?')
  })

  it('trims the ends', () => {
    expect(quotePreview('  hm  ')).toBe('hm')
  })

  it('leaves a message shorter than the cap exactly alone', () => {
    const text = 'lari gw kemaren gimana menurut lo?'
    expect(quotePreview(text)).toBe(text)
  })

  it('keeps a message of exactly the cap length whole, with no ellipsis', () => {
    const text = 'a'.repeat(QUOTE_PREVIEW_MAX_CHARS)
    expect(quotePreview(text)).toBe(text)
    expect(quotePreview(text)).not.toContain('…')
  })

  it('cuts at a word boundary and marks the cut', () => {
    const preview = quotePreview('satu dua tiga empat lima enam tujuh delapan', 20)
    expect(preview).toBe('satu dua tiga empat…')
  })

  it('cuts mid-word rather than lose most of the budget to find a space', () => {
    // The only space is at index 2, well inside the first 60% of a 20-char budget, so retreating
    // to it would spend 90% of the preview on the word "ok".
    const preview = quotePreview(`ok ${'a'.repeat(32)}`, 20)
    expect(preview).toBe(`ok ${'a'.repeat(17)}…`)
  })

  it('handles a single unbroken token longer than the cap', () => {
    const preview = quotePreview('https://runins.site/r/abcdefghijklmnopqrstuvwxyz', 20)
    expect(preview).toHaveLength(21)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('returns empty for empty, whitespace-only and non-positive budgets', () => {
    expect(quotePreview('')).toBe('')
    expect(quotePreview('   \n  ')).toBe('')
    expect(quotePreview('anything', 0)).toBe('')
    expect(quotePreview('anything', Number.NaN)).toBe('')
  })
})

/* ── quoteMediaOf ──────────────────────────────────────────────────────────────────────────── */

describe('quoteMediaOf', () => {
  it('is none when the message carries neither — an ordinary text bubble', () => {
    expect(quoteMediaOf({ hasImage: false, hasRun: false })).toBe('none')
  })

  it('names a photo, and a photo beats a run', () => {
    expect(quoteMediaOf({ hasImage: true, hasRun: false })).toBe('photo')
    expect(quoteMediaOf({ hasImage: true, hasRun: true })).toBe('photo')
  })

  it('names a run when that is all there is — the branch phase 8 turns on', () => {
    expect(quoteMediaOf({ hasImage: false, hasRun: true })).toBe('run')
  })
})

/* ── buildQuote / resolveQuote ─────────────────────────────────────────────────────────────── */

const PLAIN = { hasImage: false, hasRun: false } as const

const HIS: QuoteCandidate = { id: 'm1', mine: true, text: 'gw lari 10k pagi ini', ...PLAIN }
const HERS: QuoteCandidate = { id: 'm2', mine: false, text: 'lo telat lagi tah', ...PLAIN }
const PHOTO: QuoteCandidate = { id: 'm3', mine: true, text: '', hasImage: true, hasRun: false }
const RUN: QuoteCandidate = { id: 'm4', mine: true, text: '', hasImage: false, hasRun: true }
const BLANK: QuoteCandidate = { id: 'm5', mine: false, text: '   ', ...PLAIN }

describe('buildQuote', () => {
  it('names the runner as "you" and Nina as "nina"', () => {
    expect(buildQuote(HIS).author).toBe('you')
    expect(buildQuote(HERS).author).toBe('nina')
  })

  it('carries the target id, which is also the DOM anchor', () => {
    expect(buildQuote(HIS).targetId).toBe('m1')
  })

  it('falls back to the media word when the message has no text of its own', () => {
    expect(buildQuote(PHOTO).preview).toBe('Photo')
    expect(buildQuote(RUN).preview).toBe('Run')
  })

  it('never renders an empty preview', () => {
    expect(buildQuote(BLANK).preview).toBe(QUOTE_EMPTY_LABEL)
  })

  it('prefers the text over the media word when there is both', () => {
    expect(buildQuote({ ...PHOTO, text: 'liat ini' }).preview).toBe('liat ini')
    expect(buildQuote({ ...PHOTO, text: 'liat ini' }).media).toBe('photo')
  })

  it('derives the media word from the two booleans, not from a passed-in enum', () => {
    // Ruling E2b: `QuoteCandidate` carries `hasImage` / `hasRun` and `buildQuote` collapses them,
    // so `MessageList` and `ChatScreen` cannot disagree about what a candidate's media is.
    expect(buildQuote(RUN).media).toBe('run')
    expect(buildQuote(BLANK).media).toBe('none')
  })
})

describe('resolveQuote', () => {
  const candidates = [HIS, HERS, PHOTO]

  it('finds either party’s message', () => {
    expect(resolveQuote('m1', candidates)?.author).toBe('you')
    expect(resolveQuote('m2', candidates)?.author).toBe('nina')
  })

  it('degrades to null — plain text — when the target is not on the screen', () => {
    // The three real cases: ON DELETE SET NULL, older than the rendered window, unconfirmed send.
    expect(resolveQuote(null, candidates)).toBeNull()
    expect(resolveQuote(undefined, candidates)).toBeNull()
    expect(resolveQuote('', candidates)).toBeNull()
    expect(resolveQuote('m404', candidates)).toBeNull()
    expect(resolveQuote('m1', [])).toBeNull()
  })
})

/* ── quoteContextBlock ─────────────────────────────────────────────────────────────────────── */

describe('quoteContextBlock', () => {
  it('tells her the quoted message is his, and quotes it verbatim', () => {
    const block = quoteContextBlock({
      id: 'm1',
      mine: true,
      text: 'gw lari 10k pagi ini',
      sentAtLabel: 'Tue 2 Sep 07:14',
    })
    expect(block).toContain('one of HIS earlier messages')
    expect(block).toContain('sent Tue 2 Sep 07:14')
    expect(block).toContain('"gw lari 10k pagi ini"')
    expect(block).toContain('AS A REPLY TO THAT MESSAGE')
  })

  it('tells her when the quoted message is one of her own', () => {
    const block = quoteContextBlock({ id: 'm2', mine: false, text: 'lo telat', sentAtLabel: null })
    expect(block).toContain('one of YOUR earlier messages')
    expect(block).not.toContain('sent ')
  })

  it('gives the model the whole bubble, not the stub’s two lines', () => {
    const long = 'a'.repeat(400)
    expect(quoteContextBlock({ id: 'm', mine: true, text: long, sentAtLabel: null })).toContain(
      long,
    )
  })
})

/* ── decideReplySwipe ──────────────────────────────────────────────────────────────────────── */

const drag = (over: Partial<ReplySwipeGesture> = {}): ReplySwipeGesture => ({
  dx: 60,
  dy: 4,
  touches: 1,
  zoomScale: 1,
  ...over,
})

describe('decideReplySwipe', () => {
  it('arms a reply on a clean rightward drag', () => {
    expect(decideReplySwipe(drag())).toBe('reply')
  })

  it('refuses a leftward drag, however long — that is iOS navigation territory', () => {
    expect(decideReplySwipe(drag({ dx: -200 }))).toBe('none')
  })

  it('refuses a tap and anything under the 44px floor', () => {
    expect(decideReplySwipe(drag({ dx: 0 }))).toBe('none')
    expect(decideReplySwipe(drag({ dx: REPLY_SWIPE_MIN_DISTANCE - 1 }))).toBe('none')
    expect(decideReplySwipe(drag({ dx: REPLY_SWIPE_MIN_DISTANCE }))).toBe('reply')
  })

  it('yields to the chat log: a thumb-flick that arcs sideways is still a scroll', () => {
    expect(decideReplySwipe(drag({ dx: 50, dy: -200 }))).toBe('none')
    expect(decideReplySwipe(drag({ dx: 50, dy: 20 }))).toBe('reply')
    // 1.6 dominance: 48/30 = 1.6 passes, 48/31 does not.
    expect(decideReplySwipe(drag({ dx: 48, dy: 30 }))).toBe('reply')
    expect(decideReplySwipe(drag({ dx: 48, dy: 31 }))).toBe('none')
  })

  it('loses to a pinch, counted at its maximum', () => {
    expect(decideReplySwipe(drag({ touches: 2 }))).toBe('none')
  })

  it('loses on a zoomed page, and tolerates float noise at scale 1', () => {
    expect(decideReplySwipe(drag({ zoomScale: 1.8 }))).toBe('none')
    expect(decideReplySwipe(drag({ zoomScale: 1.0000000000000002 }))).toBe('reply')
  })

  it('refuses non-finite geometry rather than guessing', () => {
    expect(decideReplySwipe(drag({ dx: Number.NaN }))).toBe('none')
    expect(decideReplySwipe(drag({ dy: Number.POSITIVE_INFINITY }))).toBe('none')
  })
})

/* ── planQuoteScroll ───────────────────────────────────────────────────────────────────────── */

const geometry = (over: Partial<QuoteScrollGeometry> = {}): QuoteScrollGeometry => ({
  targetTop: 4_000,
  targetHeight: 80,
  scrollTop: 9_000,
  scrollHeight: 12_000,
  clientHeight: 800,
  obstructedTopPx: 0,
  obstructedBottomPx: 150,
  reducedMotion: false,
  ...over,
})

describe('planQuoteScroll', () => {
  it('centres the target in the band the chrome leaves readable', () => {
    // band = 800 - 0 - 150 = 650; slack = (650 - 80) / 2 = 285; top = 4000 - 285 = 3715.
    expect(planQuoteScroll(geometry())).toEqual({ kind: 'scroll', top: 3_715, behavior: 'smooth' })
  })

  it('accounts for the keyboard by shrinking the band, not by ignoring it', () => {
    // band = 800 - 0 - 480 = 320; slack = 120; top = 3880 — lower than the unobstructed answer,
    // which is the point: the readable strip has moved up the screen.
    expect(planQuoteScroll(geometry({ obstructedBottomPx: 480 })).kind).toBe('scroll')
    expect(planQuoteScroll(geometry({ obstructedBottomPx: 480 }))).toEqual({
      kind: 'scroll',
      top: 3_880,
      behavior: 'smooth',
    })
  })

  it('aligns a target taller than the band to the top of it', () => {
    expect(planQuoteScroll(geometry({ targetHeight: 900 }))).toEqual({
      kind: 'scroll',
      top: 4_000 - QUOTE_SCROLL_TOP_MARGIN_PX,
      behavior: 'smooth',
    })
  })

  it('respects a fixed header when one exists', () => {
    // band = 800 - 60 - 150 = 590; slack = 255; top = 4000 - 60 - 255 = 3685.
    expect(planQuoteScroll(geometry({ obstructedTopPx: 60 })).kind).toBe('scroll')
    expect(planQuoteScroll(geometry({ obstructedTopPx: 60 }))).toEqual({
      kind: 'scroll',
      top: 3_685,
      behavior: 'smooth',
    })
  })

  it('clamps at the top of the conversation', () => {
    expect(planQuoteScroll(geometry({ targetTop: 40, scrollTop: 5_000 }))).toEqual({
      kind: 'scroll',
      top: 0,
      behavior: 'smooth',
    })
  })

  it('clamps at the bottom, never asking for a position that does not exist', () => {
    expect(planQuoteScroll(geometry({ targetTop: 11_900, scrollTop: 0 }))).toEqual({
      kind: 'scroll',
      top: 11_200,
      behavior: 'smooth',
    })
  })

  it('does nothing when the target is already where it would be put', () => {
    expect(planQuoteScroll(geometry({ scrollTop: 3_715 }))).toEqual({ kind: 'none' })
    expect(planQuoteScroll(geometry({ scrollTop: 3_710 }))).toEqual({ kind: 'none' })
    expect(planQuoteScroll(geometry({ scrollTop: 3_700 })).kind).toBe('scroll')
  })

  it('jumps instead of gliding when the reader asked for less motion', () => {
    expect(planQuoteScroll(geometry({ reducedMotion: true })).kind).toBe('scroll')
    expect(planQuoteScroll(geometry({ reducedMotion: true }))).toEqual({
      kind: 'scroll',
      top: 3_715,
      behavior: 'instant',
    })
  })

  it('degrades to a top-aligned jump when the band collapses', () => {
    expect(planQuoteScroll(geometry({ clientHeight: 120, obstructedBottomPx: 400 }))).toEqual({
      kind: 'scroll',
      top: 4_000 - QUOTE_SCROLL_TOP_MARGIN_PX,
      behavior: 'smooth',
    })
  })

  it('refuses non-finite geometry rather than scrolling to NaN', () => {
    expect(planQuoteScroll(geometry({ targetTop: Number.NaN }))).toEqual({ kind: 'none' })
    expect(planQuoteScroll(geometry({ scrollHeight: Number.POSITIVE_INFINITY }))).toEqual({
      kind: 'none',
    })
  })
})
```

**Impact:** `npm test` gains ~40 cases. No runtime code depends on this file.

---

### Step 4: `components/nina/types.ts` — one field on `ChatMessage`

**File:** `components/nina/types.ts` (phase 4's Step 7 file — the change lands inside the
`ChatMessage` interface, `phase-4.md:1144`)
**Change:** one required field, and **only** one. Phase 4's own Handoffs anticipated this exact
edit ("widen `ChatMessage` … `imageUrl` / `replyTo` / `runId`"); the difference is that the field
is `replyToId` — the raw pointer — and not a resolved `replyTo` object.

**Ruling E2b: this phase no longer declares an image field or a run field.** It used to declare
`imageUrl?: string | null` and `runId?: string | null` here, so that a quote stub could name an
image-bearing or run-bearing target without waiting for phases 6 and 8. Both declarations are
**deleted**. The image field is phase 6's `imageUrls?: readonly string[]` — plural, because a
message carries up to `NINA_MAX_CHAT_IMAGES`, and phase 6 both owns it and argued it — and the run
field is phase 8's `attachment?: RunAttachment | null`, a display-ready object rather than an id.
Declaring a thinner version of another phase's field to buy a compile is a false economy when
phase 6 lands first: what it actually buys is two authors for one field.

**And nothing is lost, because the stub never needed the values.** `quoteMediaOf` takes
`hasImage` / `hasRun` booleans and `MessageList` computes them at its own call site (Step 7). The
one file whose type surface would have had to change when phases 6 and 8 land — `lib/nina/reply.ts`
— is the one file that now cannot: **no later phase edits it.**

**Why the raw id and not a nested quote object.** The quote a message shows depends on *which other
messages are on the screen*, so it cannot be a property of the message: the same row renders with a
quote when its target is in the window and without one when it is not. `MessageList` resolves it
once per render through `resolveQuote`, which keeps the degradation in one place and keeps
`app/nina/page.tsx`'s mapping to one column per field.

**Code** — the interface in full, replacing phase 4's version:

```ts
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
   * `nina_messages.reply_to_id` (R12). The message this one answers, or null.
   *
   * A raw id and not a resolved quote, on purpose: whether it renders as a quote depends on
   * whether the target is among the rows on screen, which is `MessageList`'s question and not this
   * type's. Null covers three cases that all render as a plain message — the target was deleted
   * (phase 1's `ON DELETE SET NULL`), the target is older than the 200 rows the page renders, or
   * this is an optimistic row whose send has not been confirmed.
   */
  replyToId: string | null
  /*
   * NOT DECLARED HERE (ruling E2b): the image field is phase 6's `imageUrls?: readonly string[]`
   * and the run field is phase 8's `attachment?: RunAttachment | null`. This phase READS both
   * — once each, in `MessageList`, collapsed to booleans for `quoteMediaOf` — and declares
   * neither. Phase 6 lands before this one, so `imageUrls` is already here by the time this edit
   * is made; `attachment` arrives with phase 8 and needs no edit to this phase's files.
   */
}
```

**Impact:** `app/nina/page.tsx` and `ChatScreen`'s optimistic row must both set `replyToId`, or
`tsc` fails. Both are edited below. Phase 6's `imageUrls` is untouched by this edit and phase 8's
`attachment` slots in beside it later; nothing here has to move for either.

---

### Step 5: `components/nina/QuoteStub.tsx` — the quoted strip

**File:** `components/nina/QuoteStub.tsx` (new)
**Change:** the whole file. One component, two callers: above a message's own text (the persisted
quote) and inside the composer (the draft being composed).

**THE COLOUR PROBLEM PHASE 4 LEFT, AND THE ANSWER — WHICH IS NOW A RULING, NOT THIS PHASE'S
CHOICE.** Phase 4 pointed at `InsightCard`'s inset recipe — `rounded-field bg-paper-2 p-3.5` — and
then flagged that `bg-paper-2` inside a `bg-ink` bubble inverts between colour schemes. It does,
and the reason generalises: `--paper-2` is a *page-level* token (`#f1f7fb` light, `#162834` dark)
chosen to sit just off `--paper`. Inside the runner's bubble the ground is not paper, it is
`--ink` — near-navy in light, near-white in dark — so the two schemes swap which end of the range
the bubble sits at, and any fixed page token dropped in there is readable in one scheme and
invisible in the other.

**RULING E1: the inset surface inside a bubble is `bg-ink-3/20`.** This phase needed an inset
colour, phase 6 needed one for its image grid, phase 8 for its run card and phase 13 for hers, and
the four of them are now one class. The verification is a value and not a hope: `app/globals.css`
sets `--ink-3` to **`#93a2b0` in light and `#7c8d9b` in dark** — a mid-grey in *both* schemes. An
alpha of a token that never swaps ends of the range composites *toward* whatever it sits on, so
`bg-ink-3/20` reads as a recessed panel over `bg-ink` and over `bg-card`, in light and in dark,
**with no per-side branch at all**. That last part is the practical win over this plan's earlier
answer, which was a two-branch `bg-card/12` / `bg-paper-2` pair: the fill stops being a conditional
and only the left rule's colour stays one, because that is a deliberate accent and not a surface.

`bg-current/10` — phase 8's proposal — loses, and not on taste: phase 8's own plan admitted the
arbitrary-opacity-on-`currentColor` support was **unverified in this Tailwind setup**, and an
unverified mechanism must not be the shared answer for four phases. If it turned out not to compile
as assumed, it would fail in four places at once and in the one property nobody catches in review.

**The rest of the visual argument.** The left rule is 2px of `border-l`, which is the blockquote
convention every reader already knows and the single strongest "this is a quote and not a message"
signal available without an icon. It is not the border the token file forbids — that rule is about
outlining *surfaces* instead of using fill and shadow, and this is a mark inside a surface, not an
outline around one. The author line is 12px `font-semibold`: `text-accent` on Nina's bubble, which
is exactly where `Button`'s docstring says the accent earns its keep ("on labels and links, where
it sits on paper"), and plain inherited `text-card` on the runner's, because cyan on near-white ink
in dark mode is the contrast failure that same docstring measured. The preview is 13px — the app's
body size — deliberately one step below the bubble's 15px, so the quote reads as subordinate to the
message quoting it. `line-clamp-2` is the visual cap that agrees with `QUOTE_PREVIEW_MAX_CHARS`.

**Code:**

```tsx
'use client'

import { cn } from '@/lib/cn'
import { QUOTE_MEDIA_LABEL, type QuoteView } from '@/lib/nina/reply'

/**
 * The WhatsApp-style quoted strip (R12), in two places: above a message's text, and above the
 * composer's input while a reply is being composed.
 *
 * ── IT IS A BUTTON, AND THAT IS THE WHOLE INTERACTION ─────────────────────────────────────────
 * R12: "clicking this reply to will automatically scroll to that message in history". So the stub
 * is a real `<button>` — tappable, focusable, reachable by VoiceOver and by a keyboard, with
 * `min-h-11` because the design brief's 44pt floor "wins over any conflicting design output". In
 * the composer there is nothing to scroll to yet, so `onJump` is omitted and it renders as an
 * inert `<div>` with the cancel control beside it.
 *
 * ── WHY THERE IS NO THUMBNAIL ─────────────────────────────────────────────────────────────────
 * A quoted image says "Photo" and a quoted run says "Run", from `QUOTE_MEDIA_LABEL`. Phases 6, 8,
 * 12 and 13 all produce such messages, and every one of them can land without touching this file.
 * A 28px thumbnail needs the blob URL, its own sizing decision and a dead-blob fallback, all of
 * which belong to the phase that owns images — and this phase must not touch them. If phase 6
 * wants it later, it adds one optional prop here and this stays as the fallback.
 */
export function QuoteStub({
  quote,
  mine,
  onJump,
  className,
}: {
  quote: QuoteView
  /**
   * Whose bubble the stub is sitting INSIDE — not whose message is quoted. It no longer picks the
   * FILL (ruling E1: `bg-ink-3/20` is correct on both grounds), only the left rule's colour and
   * the two text colours, because the accent and the body copy do have to know which ground they
   * are on. The composer passes `false`: its ground is `--paper`, the same side of the range as
   * Nina's `--card` bubble.
   */
  mine: boolean
  /** Omitted in the composer, where the target is not on screen to be scrolled to. */
  onJump?: (targetId: string) => void
  className?: string
}) {
  const author = quote.author === 'you' ? 'You' : 'Nina'
  const label =
    quote.media === 'none' ? author : `${author} · ${QUOTE_MEDIA_LABEL[quote.media]}`

  const body = (
    <>
      <span
        className={cn(
          'block text-[12px] leading-none font-semibold',
          mine ? 'text-card' : 'text-accent',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'mt-1 block line-clamp-2 text-[13px] leading-[1.35] font-medium break-words',
          mine ? 'text-card/85' : 'text-ink-2',
        )}
      >
        {quote.preview}
      </span>
    </>
  )

  /* ONE fill for both grounds (ruling E1): `bg-ink-3/20`. `--ink-3` is `#93a2b0` in light and
   * `#7c8d9b` in dark — a mid-grey in both schemes — so an alpha of it composites correctly over
   * `--ink` (his bubble) and over `--card` (hers) without a per-side branch. A paper token cannot
   * do this: `--paper-2` is chosen against `--paper`, and his bubble is `--ink`, whose relationship
   * to `--paper` flips between the two schemes. Phases 6, 8 and 13 use the same class.
   *
   * Only the left rule still branches, and deliberately: the accent is a mark, not a surface, and
   * cyan on near-white ink in dark mode is the contrast failure `Button`'s docstring measured. */
  const skin = cn(
    'w-full rounded-field border-l-2 bg-ink-3/20 px-3 py-2 text-left',
    mine ? 'border-card/40' : 'border-accent',
    className,
  )

  if (onJump === undefined) return <div className={skin}>{body}</div>

  return (
    <button
      type="button"
      onClick={() => onJump(quote.targetId)}
      aria-label={`Go to the message from ${author}: ${quote.preview}`}
      className={cn(
        skin,
        /* The pressed state deepens the same alpha rather than switching token, for the same
         * reason the fill does not branch: one class, correct on both grounds. */
        'min-h-11 transition-colors active:bg-ink-3/35',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
      )}
    >
      {body}
    </button>
  )
}
```

**Impact:** new component. `min-h-11` inside a bubble makes a quoted message about 44px taller
than a plain one, which is what the quoted strip costs in every chat app that has one.

---

### Step 6: `components/nina/MessageBubble.tsx` — the swipe, the stub, the flash

**File:** `components/nina/MessageBubble.tsx` (phase 4's Step 7 file; the whole component is
replaced, `phase-4.md:1264`)
**Change:** four additions to a component that keeps every colour, radius and type decision phase
4 argued for. Its long docstring stays as written; the block below is what this phase appends to it
and the new body.

**The one thing that genuinely changes about the module: it becomes `'use client'`.** Phase 4 left
it directive-free on purpose ("nothing here uses a hook, so the module compiles into whichever
graph imports it"), and a touch gesture ends that. The practical cost is nil today — `MessageList`
is already a client component and is the only importer — and the note phase 4 wrote about phase
13 rendering a bubble on a server page is recorded in Handoffs rather than silently invalidated.

**Why the flash is a colour transition and not an animation.** A one-off tint that fades is
`transition-colors` on a `data-` attribute: no keyframe, no `[animation:…]` call site, and
therefore nothing for `tests/motion.reducedMotion.test.ts` to guard — which is the good outcome,
because that suite would otherwise require a fifth keyframe *and* a still redefinition of it under
`@media (prefers-reduced-motion: reduce)`, and `app/globals.css` is explicit that the only keyframe
in the app is one the codebase argued its way into. It is also the honest reading of that file's
own line: the `transition-*` utilities in `Chip`, `KindSelector` and `Button` are "deliberately
untouched" by the reduced-motion escape because they "animate colour only, which is not motion".
1600ms is long enough to survive a smooth scroll (~500ms) plus the eye finding the line, and short
enough that it is gone before it becomes decoration.

**Code:**

```tsx
'use client'

import { useRef } from 'react'
import type * as React from 'react'

import { cn } from '@/lib/cn'
import { decideReplySwipe } from '@/lib/nina/reply'
import type { QuoteView } from '@/lib/nina/reply'
import { QuoteStub } from './QuoteStub'
import type { ChatMessage } from './types'

/* … phase 4's docstring, unchanged, plus: …
 *
 * ── R12: THE GESTURE, THE STUB, THE FLASH ─────────────────────────────────────────────────────
 * Swipe a bubble to the RIGHT to reply to it — either side of the conversation, as in WhatsApp.
 * The decision is `decideReplySwipe`, in `lib/nina/reply.ts`, because a gate that must not eat the
 * chat log's vertical scroll is a rule and rules get asserted (`lib/photos/gallery.ts`'s
 * `decideSwipe` is the precedent, and this file is its second caller-shaped sibling).
 *
 * A gesture is invisible to a keyboard and to VoiceOver, so every bubble also carries a `<button>`
 * that is `sr-only` until it takes focus — the skip-link pattern. It costs one tab stop per
 * message and nothing at all visually, which is the trade this app's design language wants: 200
 * permanently visible reply buttons would be 200 pieces of furniture in a reading surface.
 */
export function MessageBubble({
  message,
  above,
  quote,
  flash = false,
  onReply,
  onJumpToQuote,
}: {
  message: ChatMessage
  /**
   * Rendered inside the bubble, above the text, and BELOW `quote`. Phase 6's images hang here
   * first, phase 8's run card second, stacked in that order by `MessageList`.
   *
   * **The reply quote is not in this slot** — it has its own `quote` prop, because it must always
   * sit at the very top of the bubble, above an image or a run card, which is where every chat app
   * puts it and is not a guarantee an unordered slot can make. **Ruling E2 settled this in this
   * phase's favour**: phase 8's competing expression, which nested its `ReplyQuote` inside
   * `above`, is overruled and removed from its plan. The render order inside the bubble is
   * therefore fixed at **quote stub → images → run card → text**, and the JSX below is what fixes
   * it.
   */
  above?: React.ReactNode
  /** Resolved by `MessageList` through `resolveQuote`. Null renders a plain message. */
  quote?: QuoteView | null
  /** True while this is the message a quote just scrolled to. */
  flash?: boolean
  /** Arm a reply to this message. Omitted makes the bubble inert, as on a read-only page. */
  onReply?: (message: ChatMessage) => void
  /** Tap on the quote: scroll to `targetId`. */
  onJumpToQuote?: (targetId: string) => void
}) {
  const mine = message.role === 'user'

  /*
   * The gesture, measured in the component and decided in `lib/`. `touches` is the MAXIMUM seen
   * during the drag and not the count at `touchend`, because a pinch that starts with one finger
   * down must still lose — the same reason `PhotoViewer` tracks it that way.
   */
  const start = useRef<{ x: number; y: number; touches: number } | null>(null)

  function onTouchStart(event: React.TouchEvent<HTMLLIElement>) {
    const touch = event.touches[0]
    if (touch === undefined) return
    start.current = { x: touch.clientX, y: touch.clientY, touches: event.touches.length }
  }

  function onTouchMove(event: React.TouchEvent<HTMLLIElement>) {
    const from = start.current
    if (from === null) return
    from.touches = Math.max(from.touches, event.touches.length)
  }

  function onTouchEnd(event: React.TouchEvent<HTMLLIElement>) {
    const from = start.current
    start.current = null
    if (from === null || onReply === undefined) return
    const touch = event.changedTouches[0]
    if (touch === undefined) return

    const decision = decideReplySwipe({
      dx: touch.clientX - from.x,
      dy: touch.clientY - from.y,
      touches: from.touches,
      zoomScale: window.visualViewport?.scale ?? 1,
    })
    if (decision === 'reply') onReply(message)
  }

  return (
    <li
      /*
       * A stable DOM id per message: `ChatScreen` reads it with `getElementById` to measure a
       * quote's target before scrolling to it. Phase 4 put it here for this.
       */
      id={`nina-msg-${message.id}`}
      data-role={message.role}
      data-flash={flash ? 'true' : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] px-4 py-2.5 text-[15px] leading-[1.5] font-medium break-words whitespace-pre-wrap',
          mine
            ? 'rounded-card rounded-br-chip bg-ink text-card'
            : 'rounded-card rounded-bl-chip bg-card text-ink shadow-card',
          message.state === 'sending' && 'opacity-60',
          message.state === 'failed' && 'ring-1 ring-red',
          /*
           * The landing tint (R12: "clicking … will automatically scroll to that message"; a scroll
           * that does not say WHICH message it landed on has done half the job). A colour
           * transition rather than a keyframe — see the header. `ring` rather than a background
           * swap so the bubble's own fill, and therefore its text contrast, never moves.
           */
          'transition-shadow duration-300',
          flash && 'ring-2 ring-accent',
        )}
      >
        {quote != null && (
          <QuoteStub
            quote={quote}
            mine={mine}
            onJump={onJumpToQuote}
            className="mb-2 -mx-1"
          />
        )}
        {above}
        {message.body}

        {/*
          The non-gesture path. Invisible until focused, so a keyboard and VoiceOver can do what a
          thumb does with a swipe. `-mt-1` keeps the focused state from shifting the text above it
          more than one step.
        */}
        {onReply !== undefined && (
          <button
            type="button"
            onClick={() => onReply(message)}
            className={cn(
              'sr-only focus:not-sr-only focus:relative focus:mt-2 focus:inline-block',
              'focus:rounded-chip focus:px-2 focus:py-1 focus:text-[12px] focus:font-semibold',
              mine ? 'focus:bg-card/20 focus:text-card' : 'focus:bg-paper-2 focus:text-accent',
              'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            )}
          >
            Reply to this message
          </button>
        )}
      </div>
    </li>
  )
}
```

**Impact:** the module is now client-only. Every bubble gains one focusable button and three touch
handlers; nothing gains a network call, a hook subscription or a timer. `ring-2 ring-accent` under
`transition-shadow` is the only new visual state.

---

### Step 7: `components/nina/MessageList.tsx` — resolve the quotes, pass the handlers

**File:** `components/nina/MessageList.tsx` (phase 4's Step 8 file; the props, the `useMemo` and
the `<MessageBubble>` call site change — `phase-4.md:1423` and `:1511`)
**Change:** three new props, one memo, four new attributes on the bubble. The scroll effect phase 4
wrote is untouched: this phase's scroll is a different question with a different trigger, and it
lives in `ChatScreen`.

**Code** — the changed parts, in place:

```tsx
export function MessageList({
  messages,
  typing,
  todayISO,
  keyboardOverlapPx,
  flashId = null,
  onReply,
  onJumpToQuote,
}: {
  messages: readonly ChatMessage[]
  typing: boolean
  todayISO: string
  keyboardOverlapPx: number
  /** The message a quote tap just landed on; it holds a tint for `QUOTE_FLASH_MS`. */
  flashId?: string | null
  onReply?: (message: ChatMessage) => void
  onJumpToQuote?: (targetId: string) => void
}) {
  /* … phase 4's five refs and two effects, unchanged … */

  /*
   * The candidate set every quote resolves against: the rows on this screen and nothing else. A
   * `reply_to_id` pointing outside it — deleted, or older than `CHAT_HISTORY_LIMIT` — resolves to
   * null and the message renders as plain text, which is the documented degradation and the reason
   * `resolveQuote` returns null instead of throwing.
   *
   * Memoised on `messages` because it is O(n) and `messages` changes on every keystroke-free
   * state update the screen makes (typing, keyboard, reveal), not just when a row arrives.
   */
  /*
   * `hasImage` / `hasRun` are computed HERE and nowhere else (ruling E2b). This is the one module
   * that already imports `ChatMessage`, so it is the one module that may know the field names:
   * phase 6's `imageUrls` is plural and phase 8's `attachment` is an object, and `lib/nina/reply.ts`
   * knows about neither.
   *
   * `hasRun` is the LITERAL `false` at this phase's landing, because `ChatMessage.attachment` does
   * not exist yet and `tsc` would say so. Phase 8's one-line edit here is
   * `hasRun: message.attachment != null` — it flips one boolean and the run branch of
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
        hasRun: false, // phase 8: `message.attachment != null`
      })),
    [messages],
  )

  return (
    <div className="space-y-5">
      {groupIntoDays(messages).map((day) => (
        <section key={day.dayISO}>
          <h2 className="text-center text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {day.dayISO === todayISO ? 'Today' : formatDayCompact(day.dayISO)}
          </h2>
          <ul className="mt-3 space-y-2">
            {day.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                quote={resolveQuote(message.replyToId, candidates)}
                /* Phase 6's expression, carried through UNCHANGED. Ruling E2's final composition
                 * puts images then the run card in `above` and the quote in its own prop; this
                 * phase adds the prop and does not touch the slot. Phase 8 widens the ternary
                 * below into the two-branch stack. */
                above={
                  message.imageUrls != null && message.imageUrls.length > 0 ? (
                    <ChatImages urls={message.imageUrls} />
                  ) : undefined
                }
                flash={message.id === flashId}
                onReply={onReply}
                onJumpToQuote={onJumpToQuote}
              />
            ))}
          </ul>
        </section>
      ))}

      {typing && (
        <ul className="space-y-2">
          <TypingIndicator />
        </ul>
      )}
    </div>
  )
}
```

**Imports to add** at the top of the file:

```tsx
import { useMemo } from 'react'

import { resolveQuote, type QuoteCandidate } from '@/lib/nina/reply'
```

`quoteMediaOf` is **not** imported here: `buildQuote` derives the media word from the candidate's
two booleans, so this file's job is only to fill them. `import { ChatImages } from './ChatImages'`
is already present from phase 6 and stays.

**Impact:** one `O(n)` map per render of the list, plus one `O(n)` `find` per quoted message. At
`CHAT_HISTORY_LIMIT = 200` that is noise; the comment in `resolveQuote` says what to do if the
window ever grows.

---

### Step 8: `components/nina/Composer.tsx` — the reply draft strip

**File:** `components/nina/Composer.tsx` (phase 4's Step 9 file; two props, one effect, one
wrapper attribute and one new row above the input — `phase-4.md:1587` and `:1630`)
**Change:** the composer grows a strip that shows what is being replied to, with a cancel control,
and it announces its own geometry.

**Why the strip lives in the composer and not above it.** It has to be inside the same `fixed`
container as the textarea, or it scrolls away from the thing it describes and the keyboard covers
it. That means two props on phase 4's component rather than a sibling element in `ChatScreen` —
additive, defaulted, and the alternative (a second fixed element that has to track
`composerBottomCss` independently) would be two sources of truth for one bar's position.

**Why the wrapper gains `id="nina-composer"`.** `planQuoteScroll` needs `obstructedBottomPx`, and
that number is not a constant: it is the composer's own height (which grows with this strip and
with a multi-line draft) plus its `bottom` offset (which is the tab bar and FAB clearance, or the
keyboard when one is open). One `getBoundingClientRect().top` on this element answers all of it
exactly, and every alternative is arithmetic that re-derives what the browser already knows.

**Code** — the changed parts:

```tsx
export function Composer({
  onSend,
  busy,
  bottomCss,
  reply = null,
  onCancelReply,
}: {
  onSend: (body: string) => void | Promise<void>
  busy: boolean
  bottomCss: string
  /** The message this draft answers (R12). Null is the ordinary composer. */
  reply?: QuoteView | null
  /** Drop the reply and keep the draft text. Required whenever `reply` can be non-null. */
  onCancelReply?: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const canSend = value.trim().length > 0 && !busy

  /*
   * Arming a reply focuses the box, which is the whole point of the gesture: swipe, type, send.
   * Keyed on `reply?.targetId` and not on `reply`, so re-resolving the same quote during an
   * unrelated re-render does not steal focus back from wherever it has gone.
   */
  useEffect(() => {
    if (reply != null) ref.current?.focus()
  }, [reply?.targetId])

  /* … `resize` and `submit`, unchanged from phase 4 … */

  return (
    <div
      id="nina-composer"
      className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
      style={{ bottom: bottomCss }}
    >
      {reply != null && (
        <div className="mx-auto flex max-w-[470px] items-start gap-2 px-5 pt-3">
          {/* `mine={false}`: the ground here is `--paper`, the same side of the range as Nina's
              `--card` bubble, so the paper-token branch is the correct one. `onJump` is omitted
              because the target is not necessarily on screen and the runner is mid-sentence. */}
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

      <div className="mx-auto flex max-w-[470px] items-end gap-2 px-5 py-3">
        {/* … phase 4's textarea and send button, unchanged … */}
      </div>
    </div>
  )
}
```

**Imports to add:**

```tsx
import { useEffect } from 'react'

import type { QuoteView } from '@/lib/nina/reply'
import { QuoteStub } from './QuoteStub'
```

**Impact:** the composer is ~64px taller while a reply is armed, which `ChatScreen` measures rather
than assumes. Phase 4's `composerBottomCss` and `COMPOSER_CLEARANCE_PX` are untouched.

---

### Step 9: `components/nina/ChatScreen.tsx` — arm, send, jump, flash

**File:** `components/nina/ChatScreen.tsx` (phase 4's Step 10 file; `NOTICE_TEXT`, three state
hooks, two new callbacks, one new ref, and the two child call sites — `phase-4.md:1766`,
`:1785`, `:1836`, `:1899`)
**Change:** the four things the screen has to own, and nothing else. Every timed step keeps phase
4's `alive` guard.

**The base this step edits is phase 4's file AFTER phase 6.** Phase 6 lands first and changes
`handleSend`'s parameter from `body: string` to a draft object
(`{ body: string; images: readonly ComposerDraftImage[] }`) and adds `imageTickets` to the
`sendNinaMessage` call; the optimistic row it appends carries `imageUrls`. **None of that moves
here.** The snippets below are written against phase 4's parameter for readability, and the
mechanical translation is exactly two substitutions: `body` becomes `draft.body`, and the
`sendNinaMessage` call keeps phase 6's `imageTickets` beside this phase's `replyToMessageId`. This
phase's edits to `handleSend` are additive to phase 6's — one id read at the top, one field on the
call, one field on the optimistic row — and the two rows' fields do not overlap.

**The one trap worth naming.** Phase 4's `timer` ref is the reveal's `setTimeout` handle and its
unmount cleanup clears exactly that one. The flash needs its own handle: sharing `timer` would mean
a quote tap mid-reveal cancels the reveal's `sleep` and strands the remaining bubbles behind a
typing indicator that never resolves. `flashTimer` is separate and both are cleared on unmount.

**Code** — the changed and added parts:

```tsx
type Notice = 'send-failed' | 'no-reply' | 'quote-missing'

const NOTICE_TEXT: Record<Notice, string> = {
  'send-failed': 'That didn’t send. Check your connection and try it again.',
  'no-reply':
    'Nina went quiet on that one. Your message is saved — send another and she will pick it up.',
  /* R12's honest end of the degradation. The quote rendered, so the target existed when the page
   * loaded; it is simply not among the rows on screen — deleted, or further back than this screen
   * goes. Saying so beats a tap that does nothing. */
  'quote-missing': 'That message isn’t on this screen any more, so there’s nowhere to jump to.',
}

/** Fallback for `obstructedBottomPx` if the composer cannot be measured. Tab bar + FAB + one row. */
const COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68

export function ChatScreen({
  initial,
  todayISO,
}: {
  initial: readonly ChatMessage[]
  todayISO: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
  /** The message being replied to (R12), or null for an ordinary send. */
  const [draftQuote, setDraftQuote] = useState<QuoteView | null>(null)
  /** The message a jump just landed on. Held for `QUOTE_FLASH_MS`, then cleared. */
  const [flashId, setFlashId] = useState<string | null>(null)

  const alive = useRef(true)
  const timer = useRef<number | null>(null)
  /** Separate from `timer` on purpose: a quote tap must not cancel a reveal in flight. */
  const flashTimer = useRef<number | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    }
  }, [])

  /* … phase 4's `visualViewport` effect and `sleep`, unchanged … */

  /**
   * Arm a reply. `buildQuote` rather than `resolveQuote`, because the target is the message in
   * hand — there is nothing to look up.
   */
  const handleReply = useCallback((message: ChatMessage) => {
    setNotice(null)
    setDraftQuote(
      buildQuote({
        id: message.id,
        mine: message.role === 'user',
        text: message.body,
        /* The same two booleans `MessageList` computes, for the same reason (ruling E2b), and
         * spelled the same way so the strip in the composer and the stub in the bubble cannot
         * disagree about whether the target was a photo. */
        hasImage: (message.imageUrls?.length ?? 0) > 0,
        hasRun: false, // phase 8: `message.attachment != null`
      }),
    )
  }, [])

  /**
   * R12's second half: tapping a quote scrolls to the message it names, and says which one it
   * landed on.
   *
   * The DOM read is deliberate and is the only DOM read on this screen besides the keyboard's.
   * `getElementById` on phase 4's `nina-msg-${id}` anchor is the one honest source for where a
   * message actually is: React knows the order of the rows, not their pixel heights, which depend
   * on wrapping, on a quote stub, and later on an image. A missing element is the degradation
   * path, not an error — the row was on screen when the page rendered and is not now.
   *
   * `getBoundingClientRect().top` on the composer, rather than a constant, because the obstruction
   * is the composer's height (which the reply strip and a multi-line draft both change) plus its
   * offset (clearance, or the keyboard).
   */
  const handleJumpToQuote = useCallback((targetId: string) => {
    const element = document.getElementById(`nina-msg-${targetId}`)
    if (element === null) {
      setNotice('quote-missing')
      return
    }

    const composer = document.getElementById('nina-composer')
    const obstructedBottomPx =
      composer === null
        ? COMPOSER_FALLBACK_PX
        : Math.max(0, window.innerHeight - composer.getBoundingClientRect().top)

    const rect = element.getBoundingClientRect()
    const plan = planQuoteScroll({
      targetTop: rect.top + window.scrollY,
      targetHeight: rect.height,
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
      obstructedTopPx: 0,
      obstructedBottomPx,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (plan.kind === 'scroll') window.scrollTo({ top: plan.top, behavior: plan.behavior })

    /* The tint runs whether or not the page moved: `kind: 'none'` means the target was already on
     * screen, which is exactly the case where a scroll alone would identify nothing. */
    setNotice(null)
    setFlashId(targetId)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      if (alive.current) setFlashId(null)
    }, QUOTE_FLASH_MS)
  }, [])

  const handleSend = useCallback(
    async (body: string) => {
      if (busy) return

      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      /* Read once and cleared immediately: the strip must disappear the moment the message is in
       * the log, and the optimistic row has to carry the same pointer the action will persist. */
      const replyToMessageId = draftQuote?.targetId ?? null
      setDraftQuote(null)
      setNotice(null)
      setMessages((current) => [
        ...current,
        {
          id: localId,
          role: 'user',
          body,
          dayISO,
          state: 'sending',
          replyToId: replyToMessageId,
        },
      ])
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({ body, replyToMessageId })
      } catch {
        result = null
      }
      if (!alive.current) return

      if (result === null || !result.ok) {
        setTyping(false)
        setBusy(false)
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return
      }

      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      const bubbles = result.bubbles
      if (bubbles.length === 0) {
        setTyping(false)
        setBusy(false)
        setNotice('no-reply')
        return
      }

      const plan = planReveal(bubbles.map((b) => b.body))
      for (const [index, bubble] of bubbles.entries()) {
        const gap = plan[index] ?? 0
        if (gap > 0) {
          setTyping(true)
          await sleep(gap)
          if (!alive.current) return
        }
        setTyping(index < bubbles.length - 1)
        setMessages((current) => [
          ...current,
          {
            id: bubble.id,
            role: 'nina',
            body: bubble.body,
            dayISO: todayInJakarta(),
            state: 'sent',
            /*
             * HER OWN QUOTE, ON THE OPTIMISTIC REVEAL. She may have replied to a specific message,
             * and phase 3 puts her `reply_to_id` on the FIRST bubble only ("a four-bubble reply is
             * one answer to one message"). This used to be a hard `null` and the quote only
             * appeared on the next server render of `/nina` — R12's UI lagging the database by a
             * page load, for two lines.
             *
             * Ruling B1 assigned those two lines to THIS phase (`SentBubble` gains
             * `replyToId: string | null`; Step 11 populates it), because this phase already edits
             * `lib/nina/actions.ts` where the type is declared. `?? null` rather than a bare read
             * so the bubbles phase 3 emits without a reply are unchanged.
             */
            replyToId: bubble.replyToId ?? null,
          },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy, draftQuote],
  )

  return (
    <>
      {messages.length === 0 && !typing ? (
        <EmptyState
          title="Nina has not started yet"
          description="Say something and she will answer. She has read every run you have logged, so she already has opinions."
        />
      ) : (
        <MessageList
          messages={messages}
          typing={typing}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
          flashId={flashId}
          onReply={handleReply}
          onJumpToQuote={handleJumpToQuote}
        />
      )}

      {notice !== null && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">{NOTICE_TEXT[notice]}</p>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {typing ? 'Nina is typing' : ''}
      </p>

      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        reply={draftQuote}
        onCancelReply={() => setDraftQuote(null)}
      />
    </>
  )
}
```

**Imports to add:**

```tsx
import { QUOTE_FLASH_MS, buildQuote, planQuoteScroll, type QuoteView } from '@/lib/nina/reply'
```

`quoteMediaOf` is not imported: `buildQuote` derives the media word itself from the two booleans.

**Impact:** `handleSend`'s dependency array grows `draftQuote`, so the callback is re-created when
a reply is armed or cleared — which is correct and is why the id is read at the top of the handler
rather than captured. Phase 4's note about `setNotice(result.unavailable ? 'no-reply' : 'no-reply')`
is honoured by collapsing it, as that note invited.

---

### Step 10: `app/nina/page.tsx` — one field in the mapping

**File:** `app/nina/page.tsx` (phase 4's Step 11 file; inside the `rows.map` — `phase-4.md:2015`)
**Change:** carry the column that already exists on the row.

**Code** — the mapping in full:

```tsx
  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
    /*
     * R12. `NinaMessageRow` has carried this since phase 1 (`phase-1.md:1155`); it is the pointer
     * and not a resolved quote, because whether it renders as one depends on whether the target is
     * among these 200 rows — `MessageList`'s question. A target further back than
     * `CHAT_HISTORY_LIMIT` renders as a plain message, which is the documented degradation: the
     * alternative is a second query per quoted row for a target the runner cannot scroll to
     * anyway.
     */
    replyToId: row.replyToId,
  }))
```

**Impact:** none beyond the type. No new query, no change to `CHAT_HISTORY_LIMIT`, no change to the
page's one-read-no-model-call shape (invariant 4).

---

### Step 11: `lib/nina/actions.ts` — accept the reply, resolve it, feed it to the turn

**File:** `lib/nina/actions.ts` (**phase 3's file**; the signature at `phase-3.md:2447`, a new step
between its STEP 1 and STEP 2, and one field on the `runNinaTurn` call at `:2480`)
**Change:** the runner's `replyToMessageId` becomes a validated, owned `reply_to_id` **and** the
quoted text that rides into the prompt. Phase 3's STEP 4 — the re-check of *Nina's* own
`replyToMessageId` against the context window — is untouched.

**Two things this does not do.** It does not duplicate the action: everything below is inside
phase 3's function, in its order, with its comments intact. And it does not reject a send whose
reply target has gone: a dropped quote is a message sent without a quote, never a message lost.

**Code** — the signature and the new step:

```ts
export async function sendNinaMessage(input: {
  body: string
  /**
   * R12. The `nina_messages.id` he swiped, from `ChatScreen`. **Untrusted**: this is a POST
   * endpoint like any other action, so the id is checked against rows THIS user owns before it
   * becomes a foreign key — the same rule phase 3 applies to the id the model produces, by the
   * same reasoning the Server Actions guide gives.
   */
  replyToMessageId?: string | null
}): Promise<SendNinaMessageResult> {
  const userId = await requireUserId()

  const text = typeof input?.body === 'string' ? input.body.trim() : ''
  if (text.length === 0 || text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED

  /*
   * STEP 0 — the reply target (R12). One scoped query, and it answers both questions at once:
   * whether the id is real and his, and what the quoted message actually SAYS. The second half is
   * the point — RU-14's window is 40 messages, so a reply to something older is an id with no text
   * behind it in the context JSON, and the model would be told a reply exists while being unable
   * to read it.
   *
   * A malformed, foreign or vanished id degrades to "no reply" and the message still sends. There
   * is nothing to explain to the runner: the quote he tapped is gone, and losing his sentence over
   * it would be the worse outcome by a wide margin.
   */
  const requestedReplyId =
    typeof input?.replyToMessageId === 'string' && input.replyToMessageId.trim().length > 0
      ? input.replyToMessageId.trim()
      : null

  let quotedRow: NinaMessageRow | null = null
  if (requestedReplyId !== null) {
    try {
      const found = await getNinaMessagesByIds(userId, [requestedReplyId])
      quotedRow = found[0] ?? null
    } catch (cause) {
      console.warn('[nina] could not resolve the reply target', { error: String(cause) })
    }
  }
  const runnerReplyToId = quotedRow?.id ?? null

  /* STEP 1 — his message, first. See the header. `seq: 0`: he sends one message per turn. */
  let runnerMessage: { id: string; sentAt: Date }
  try {
    runnerMessage = await insertNinaMessage(userId, {
      role: 'runner',
      text,
      seq: 0,
      replyToId: runnerReplyToId,
    })
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }
```

**Code** — the `runNinaTurn` call, which is phase 3's STEP 3 with one field added. It sits *after*
STEP 2's `Promise.all`, so `context.conversation.window` is available and is where the label comes
from:

```ts
  /*
   * `sentAtLabel` comes from the context window when the quoted message is in it, and is null when
   * it is not. That is invariant 3 rather than laziness: `'Tue 2 Sep 07:14'` is spelled by phase
   * 2's `conversationFacts`, and formatting a second one here would make this the app's second
   * authority on how an instant is written. A quote with no timestamp reads fine —
   * `quoteContextBlock` simply omits the clause.
   */
  const quotedTurn =
    quotedRow === null
      ? null
      : (context.conversation.window.find((turn) => turn.id === quotedRow.id) ?? null)

  /* STEP 3 — the turn. 13–45 s. Never throws for a model problem. */
  const result = await runNinaTurn({
    userId,
    context,
    history,
    sourceMessageId: runnerMessage.id,
    runnerText: text,
    quoted:
      quotedRow === null
        ? null
        : {
            id: quotedRow.id,
            mine: quotedRow.role === 'runner',
            text: quotedRow.body,
            sentAtLabel: quotedTurn?.sentAtLabel ?? null,
          },
  })
```

**Imports to add:**

```ts
import { getNinaMessagesByIds } from './queries'
import type { NinaMessageRow } from './queries'
```

**Reconciler note on two spellings.** Phase 3 calls `insertNinaMessage(userId, { role, text, seq })`
while phase 1 provides `insertNinaMessages(userId, rows)` taking `{ role, body }` with no `seq`
(`phase-1.md:1461`, where `seq` is a `bigserial`). That conflict is phase 1/3's to settle and this
phase does not touch it: **the field this phase adds is `replyToId` and it is spelled the same in
both plans**, so whichever insert survives, the one added line survives with it. Likewise
`NinaMessageRow.body` versus a `text` column — phase 1's select aliases it, and this step reads
`quotedRow.body` because that is what its own row type declares.

**Impact:** the action gains one query, and only when a reply is armed. `SendNinaMessageResult` is
unchanged, so phase 4's screen compiles without this phase's other edits.

---

### Step 12: `lib/nina/turn.ts` — the quoted message reaches the prompt

**File:** `lib/nina/turn.ts` (**phase 3's file**; one field on `NinaTurnInput` at `phase-3.md:1951`
and one branch in `userTurnText` at `:1995`)
**Change:** twelve lines. This is the edit that makes R12's "send a message with this reply as
context" true rather than decorative, and it is deliberately the smallest possible one.

**Where the block goes, and why there.** Immediately before `'HE JUST SAID:'` and after the image
descriptions. He read the quoted message first, tapped reply, then typed — so the model reads it in
that order too. Putting it after his text would ask her to re-interpret a sentence she has already
answered.

**Code** — the field:

```ts
  /**
   * R12 (phase 7). The message he is replying to, resolved and ownership-checked by
   * `lib/nina/actions.ts`. Null on an ordinary turn and on every proactive turn.
   *
   * It is passed EXPLICITLY rather than left to be joined out of `context.conversation.window[]`
   * by the model, for two reasons: RU-14's window is 40 messages, so a reply to anything older is
   * an id with no text behind it; and even when the text is there, nothing in the JSON says that
   * THIS turn is a reply rather than a turn that happens to contain an id.
   */
  quoted?: QuotedMessageInput | null
```

**Code** — the branch, inside `userTurnText`, between the `imageDescriptions` block and the
`runnerText` block:

```ts
  if (input.quoted != null) {
    parts.push(quoteContextBlock(input.quoted))
  }
```

**Imports to add:**

```ts
import { quoteContextBlock, type QuotedMessageInput } from './reply'
```

**On the import direction.** `turn.ts` opens with `import 'server-only'` and `reply.ts` does not,
which is the correct direction — a server module may import a neutral one, never the reverse.
`reply.ts` reaches no db, no env and no DOM, which is what makes it safe for a `'use client'`
component and a Server Action to share, and `quoteContextBlock` is why they need to: one file
decides what a quote says, whether the reader is a person or `glm-5.3`.

**Impact:** the user turn grows by three lines when a reply is armed and is byte-identical
otherwise, so phase 3's four turn suites and its measured latencies are unaffected. No tool schema,
no system prompt and no `max_tokens` arithmetic moves — `QUOTE_CONTEXT_MAX_CHARS` (700) equals one
bubble, which `NINA_MAX_TOKENS` already budgets for.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint
```

`format` first, not last: `prettier-plugin-tailwindcss` sorts class strings and this phase writes
several, including two conditional palettes. Hand-ordered classes failing `format:check` in review
is noise nobody needs to read.

**Tests:**

```
npm test
npx vitest run lib/nina/reply.test.ts
```

Then the two guards this phase could plausibly trip, both of which must still pass unchanged:

```
node scripts/check-llm-payload-boundary.mjs
npx vitest run tests/motion.reducedMotion.test.ts
```

The first because Step 12 edits a file that builds an LLM payload — the change adds a *string
already in the payload* and reaches nothing new, and `lib/nina/actions.ts` is already in the
sanctioned set from phase 3's Step 8. The second because the flash is the one place this phase was
tempted into a keyframe: that suite fails on a keyframe with no reduced-motion escape *and* on a
keyframe nothing uses, and the reason it stays green here is that no keyframe was added at all.

**Manual check** — the seven things R12 actually asks for, in order:

1. Swipe a bubble of Nina's to the right. The composer grows a strip reading **Nina** over the
   first two lines of what she said, and the keyboard comes up focused.
2. Swipe one of your own. The strip reads **You**. Cancel it with the ×; the draft text survives.
3. Send. The new bubble carries a quote stub at its very top, above its own text.
4. Tap that stub. The page glides to the quoted message and holds a cyan ring on it for about a
   second and a half. Do it again with the keyboard open — the target must land *above* the
   composer, not behind it.
5. Tap a stub whose target is the message directly above it. The page barely moves or does not
   move at all, and the ring still identifies the target. (This is `planQuoteScroll`'s
   `kind: 'none'`.)
6. Ask her something that plainly refers to the quoted message and not to the new sentence — reply
   to a run she praised with just *"beneran?"*. She must answer about that run. This is the whole
   of "reply as context" and it is the one check that cannot be a unit test.
7. Scroll the log hard with a thumb that arcs sideways. No reply strip may appear. Pinch-zoom a
   bubble and release. No reply strip.

Then the degradation, which needs one SQL statement:

```sql
-- against the dev database, with a quoted message on screen
update nina_messages set reply_to_id = null where id = '<the quoting message>';
```

Reload `/nina`: the message renders as plain text with no stub and no gap where one was. Then the
other half — delete the *target* row instead and reload: phase 1's `ON DELETE SET NULL` has already
nulled the pointer, so the same plain message appears. Neither case may log an error or throw.

Finally, tap a quote after scrolling so far back that its target is beyond
`CHAT_HISTORY_LIMIT`: expect the `quote-missing` line under the log, and no jump.

**Exit criteria:**

- either party's message can be quoted, from a swipe or from the focus-revealed button;
- the quoted message reaches `glm-5.3` in the user turn, with its text and (when known) its
  timestamp, and she answers as a reply rather than re-answering;
- tapping a quote scrolls its target into the band the composer and tab bar leave readable, and
  tints it so the reader can see which line it landed on;
- a quote whose target is gone renders as plain text, and tapping one whose target is off-screen
  says so instead of doing nothing;
- `lib/nina/reply.ts` is pure, has no DOM types in any signature, and its five rules are covered by
  `lib/nina/reply.test.ts`;
- no jsdom, no testing library and no new keyframe were added.

## Handoffs

**To Phase 6 (images) — the stub shape, reported as the brief asked.** A quote whose target carries
an image renders as `You · Photo` / `Nina · Photo` in the stub's author line, with the target's own
text as the preview when it has any and the word `Photo` as the preview when it does not
(`QUOTE_MEDIA_LABEL`). Phase 6 gets this for free the moment it populates `ChatMessage.imageUrl` —
this phase declared that field optional and reads it through `quoteMediaOf`. **If phase 6 wants a
thumbnail in the stub**, it adds one optional prop to `QuoteStub` and keeps the word as the
fallback for a dead blob; that is a phase 6 change, not a phase 7 one, because the blob URL, the
`next/image` sizing and the failure path are all its property. The same applies to
`nina_message_images` rows: nothing here reads that table.

**To Phase 8 (run attachments).** Identical treatment: `You · Run`, from `ChatMessage.runId`,
already read. Two more things phase 8 should know. Its attachment card renders in
`MessageBubble`'s `above` slot, which is still free — this phase gave the quote its own prop
precisely so the two do not compete for one slot, and the quote always sits above it. And
**the "get me back to where I was" affordance after a quote jump belongs to phase 8**: it owns
`lib/nina/scroll.ts` and the scroll-restoration arithmetic for R14, and jumping 90 messages back
leaves the runner exactly as stranded as returning from a run detail page does. This phase
deliberately ships without it (the design brief's "if you're deciding between adding something and
leaving it out, leave it out"), and the state it would need — the `window.scrollY` at the moment of
the jump — is one ref in `ChatScreen`.

**To Phase 13 (the album) — one invalidated assumption.** Phase 4's `MessageBubble` docstring said
the module was left directive-free so "phase 13's album page can render a bubble on the server if
it wants one". Step 6 makes it `'use client'`. If phase 13 needs a server-rendered bubble, the
cheap fix is to split the markup into a presentational `BubbleShell` and keep the gesture in the
client wrapper; nobody should discover this by watching a build fail.

**To whoever next touches `SentBubble` (phase 3's type) — the one lag in this phase.** When *Nina*
replies to a specific message, phase 3 persists her `reply_to_id` on the first bubble, but the
action returns only `{ id, body }`, so the optimistic reveal cannot render her quote and it appears
on the next server render of `/nina`. Adding `replyToId: string | null` to `SentBubble` and reading
it in `ChatScreen`'s reveal loop closes it in two lines. It is not done here because `SentBubble` is
phase 3's declared type and changing a *return* shape is a different class of edit from adding an
optional input field — the reconciler should decide whether it lands in phase 3 or as a follow-up
card.

**To Phase 2, optionally.** Nothing in the persona or `SEND_TOOL` was edited: `SEND_TOOL` already
describes `replyToMessageId` as "a conversation.window[].id you are answering, when it is not the
last one", which is enough for her to use it. If a reviewer wants an explicit sentence in
`NINA_SYSTEM_PROMPT` about *when* quoting is worth doing — she should quote when answering
something several messages back, and not otherwise — that is a prompt change and prompts are phase
2's file.

**Out of scope, recorded so it is not mistaken for an oversight.** No "jump to a target outside the
rendered window" — WhatsApp loads the surrounding history on demand, which is a paging feature for
`app/nina/page.tsx` and a second query, not a reply feature. No reply threading, reply counts or
"N replies" affordance: R12 asks for a quote and a jump. No per-message timestamp in the stub,
following `app/nina/page.tsx`'s reasoning about the app's one formatter for instants.

## Rollback

Nothing in this phase creates, alters or migrates a database object, so a rollback is code only and
leaves every row intact — `reply_to_id` simply stops being read and written.

1. `git revert` the phase's commits, or by hand:
2. delete `lib/nina/reply.ts`, `lib/nina/reply.test.ts`, `components/nina/QuoteStub.tsx`;
3. restore phase 4's `MessageBubble.tsx` (dropping `'use client'`), `MessageList.tsx`,
   `Composer.tsx` and `ChatScreen.tsx`;
4. drop `replyToId` / `imageUrl` / `runId` from `ChatMessage` and the one line from
   `app/nina/page.tsx`'s mapping;
5. drop the `replyToMessageId` parameter, STEP 0 and the `quoted` field from `lib/nina/actions.ts`,
   and the field, branch and import from `lib/nina/turn.ts`.

Rows written while the phase was live keep their `reply_to_id`, and a later re-landing of the phase
renders their quotes again with no backfill. **Partial rollback is available and is the useful
one**: reverting only steps 6–9 (the components) leaves the column populated, the quote in Nina's
context and the pure module tested, with no quote UI — i.e. exactly the state phase 3 shipped, plus
a prompt that is honest about replies.
