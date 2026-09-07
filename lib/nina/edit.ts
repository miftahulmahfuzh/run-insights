import { isValidId } from '@/lib/id'
import { REPLY_SWIPE_DOMINANCE, REPLY_SWIPE_MIN_DISTANCE } from './reply'

/**
 * Editing and deleting a message (R8), as the five decisions it actually is: what may be edited,
 * how long the new text may be, what an empty edit means, what a delete does to a quote that
 * pointed at it, and whether a finished drag was a request for the action menu.
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────────────────────────
 * The same reason `lib/nina/reply.ts` exists, and it says it best: `vitest.config.ts` is
 * `environment: 'node'` with an `include` matching `*.test.ts` only — no jsdom, no `TouchEvent`,
 * no `scrollHeight`. A rendered-scenario test would prove one gesture; these prove the rules.
 * `reply.ts` is the closest sibling and this file is deliberately shaped like it.
 *
 * ── R8 IS A DATA-LAYER FEATURE WITH A UI ON TOP, AND THAT IS WHY THE RULES ARE HERE ───────────
 * `getNinaMessageWindow` reads the newest `CONTEXT_MESSAGE_WINDOW` (40) rows straight out of
 * `nina_messages` on every turn, and `conversationFacts` puts `message.text` verbatim into
 * `ConversationTurn.text`. So the conversation IS the prompt: an edited row is what he said or
 * what she said as far as every later turn is concerned, and a deleted row is a thing that never
 * happened. The acceptance criterion for this phase is not "the bubble changed on screen" — it is
 * "the next turn's prompt window contains the new text". Editing HER words is not a side effect of
 * the feature; it is the capability R8 asks for, in the user's own words.
 *
 * ── WHY `mine: boolean` AND NOT A ROLE ────────────────────────────────────────────────────────
 * `QuoteCandidate.mine` is the precedent, one file over, for exactly this reason: the database
 * says `'runner' | 'nina'` and `ChatMessage` says `'user' | 'nina'`, and a pure module in `lib/`
 * may not import from `components/`. A boolean is the one spelling both sides can produce without
 * this file learning either vocabulary.
 *
 * No `import 'server-only'`, deliberately, and it matters more here than in `reply.ts`: this module
 * is imported by `lib/nina/messageActions.ts` (a Server Action) AND by
 * `components/nina/MessageBubble.tsx` and `MessageActionsSheet.tsx` (client). That is only safe
 * because there is nothing in here but arithmetic and string handling — no db, no env, no zod, and
 * no DOM type in any signature.
 */

/* ── the two caps ──────────────────────────────────────────────────────────────────────────── */

/**
 * His own message's ceiling. **Equal to `MAX_RUNNER_MESSAGE_CHARS` in `lib/nina/schema.ts`, and
 * `edit.test.ts` pins them together.**
 *
 * Re-declared rather than imported because `lib/nina/schema.ts` imports `zod` and this module is
 * imported by a `'use client'` component. Every other client-reachable pure module on this screen
 * is deliberately dependency-light — `lib/nina/images.ts` opens with "PURE ON PURPOSE… No
 * imports" — and pulling a validation library into the chat bundle to read one integer is the
 * wrong trade. The alternative has a name in this codebase already: `lib/db/schema.ts`'s "ONE
 * VOCABULARY, TWO DECLARATIONS, AND A TEST THAT PINS THEM TOGETHER". The test runs in node, where
 * importing zod costs nothing.
 */
export const EDIT_MAX_CHARS_MINE = 4000

/**
 * Her bubble's ceiling, and it is deliberately NOT his. **Equal to `MAX_BUBBLE_CHARS`**, pinned by
 * the same test.
 *
 * `MAX_BUBBLE_CHARS`'s own docstring is the argument: the staggered reveal "only reads as someone
 * typing if a bubble is the length of a chat message", and a 2000-character bubble "either flashes
 * in instantly (dishonest) or stalls the whole turn behind one typing indicator". Letting an edit
 * raise one of her bubbles to 4000 characters would break that illusion after the fact, on every
 * later render of the conversation, which is worse than breaking it once.
 */
export const EDIT_MAX_CHARS_HERS = 700

/** The role's own ceiling. See both constants for why there are two of them. */
export function editCapFor(mine: boolean): number {
  return mine ? EDIT_MAX_CHARS_MINE : EDIT_MAX_CHARS_HERS
}

/* ── what may be edited ────────────────────────────────────────────────────────────────────── */

/**
 * A message the action menu could act on. Structural, so `lib/` never imports from `components/`.
 *
 * `hasImage` and `hasRun` are BOOLEANS THE CALLER COLLAPSES, on `QuoteCandidate`'s pattern and for
 * its reason: the client computes them off `ChatMessage.imageUrls` and `.attachment`, the server
 * computes them off `nina_message_images` rows and `nina_messages.run_id`, and this module learns
 * neither shape. They exist here for one job only — the empty-edit floor below.
 */
export interface EditTarget {
  /** `nina_messages.id`. A `local-…` id is not one, which is what `canActOnMessage` checks. */
  id: string
  /** True when it is the runner's own message. False for one of Nina's. */
  mine: boolean
  /** The text as stored, or as the bubble currently shows it. */
  body: string
  /** Any `nina_message_images` row on this message. */
  hasImage: boolean
  /** A non-null `nina_messages.run_id`. */
  hasRun: boolean
  /** False for an optimistic row mid-send, and for one whose send threw. */
  confirmed: boolean
}

/**
 * The two `EditTarget` fields `canActOnMessage` actually reads, as a shape a caller can build
 * without knowing what a photo or an attached run is.
 *
 * `EditTarget` satisfies it structurally, so this is a WIDENING and not a change: every existing
 * caller keeps passing the whole target and keeps typechecking. It exists because R4's tap opener
 * has to consult the gate from inside `MessageBubble`, and the alternative was for the bubble to
 * assemble a whole `EditTarget` — which means computing `hasImage` and `hasRun` a second time, in
 * a second file, when RULING E2b deliberately put that computation in `MessageList` and nowhere
 * else.
 */
export type ActionableMessage = Pick<EditTarget, 'id' | 'confirmed'>

/**
 * Whether this message can be edited or deleted at all.
 *
 * Two gates, and the interesting one is the id. `ChatScreen` mints `local-${crypto.randomUUID()}`
 * for an optimistic row, so an unconfirmed message HAS no database row to mutate; checking
 * `isValidId` rather than the `local-` prefix states the real rule — "the id must be a database
 * id" — instead of depending on a client-side naming convention that could change.
 *
 * `confirmed` catches the other half: a row whose send threw keeps its text in the bubble and its
 * `state: 'failed'`, and there is nothing on the server to edit.
 */
export function canActOnMessage(target: ActionableMessage): boolean {
  return target.confirmed && isValidId(target.id)
}

/* ── what an edit means ────────────────────────────────────────────────────────────────────── */

/**
 * The outcome of an attempted edit. A discriminated union rather than a boolean, because three of
 * the five refusals need different words on screen and one of them names a different control.
 */
export type MessageEditPlan =
  /** Write `body`. It is trimmed, non-empty-or-legitimately-empty, and within the role's cap. */
  | { kind: 'edit'; body: string }
  /** The text is the text it already had. Nothing to write, and not an error. */
  | { kind: 'unchanged' }
  /** Over the role's cap. `over` is how many characters to lose. */
  | { kind: 'too-long'; max: number; over: number }
  /** Cleared to nothing, on a message that carries nothing else. Delete is the right control. */
  | { kind: 'delete-instead' }
  /** No database row to edit: an optimistic id, or a send that failed. */
  | { kind: 'not-editable' }

/**
 * Whether an edit may be written, and what exactly gets written.
 *
 * ── THE EMPTY-EDIT RULE IS THE SEND PATH'S FLOOR, EVALUATED AGAINST THE ROW ───────────────────
 * `sendNinaMessage` refuses an empty message unless something is attached, and its comments insist
 * that rule "stays identical on both sides". An edit is that same rule asked of what the row
 * ALREADY CARRIES rather than of what the send carries: clearing the caption of an image-only
 * message leaves a real message, because "an image alone is a valid send" is already true. A run
 * attachment counts for the same reason.
 *
 * Clearing a text-only message leaves nothing at all, and the answer is `'delete-instead'` — a
 * refusal that NAMES the correct control, not a silent conversion into a delete. A delete is
 * irreversible and takes the message's photo rows with it (`nina_message_images` cascades), so
 * turning a mis-edit into that is the worst surprise available here. Refuse rather than degrade.
 *
 * The written text is TRIMMED, matching `sendNinaMessage`'s `input.body.trim()`, so an edit cannot
 * introduce leading whitespace a send could not have produced.
 */
export function planMessageEdit(target: EditTarget, next: string): MessageEditPlan {
  if (!canActOnMessage(target)) return { kind: 'not-editable' }
  if (typeof next !== 'string') return { kind: 'not-editable' }

  const body = next.trim()
  const max = editCapFor(target.mine)
  if (body.length > max) return { kind: 'too-long', max, over: body.length - max }
  if (body.length === 0 && !target.hasImage && !target.hasRun) return { kind: 'delete-instead' }
  if (body === target.body.trim()) return { kind: 'unchanged' }
  return { kind: 'edit', body }
}

/* ── what a delete means ───────────────────────────────────────────────────────────────────── */

/**
 * The sentence the confirmation shows, and it is a RULE rather than copy: what a destructive
 * action must disclose is exactly the kind of thing that drifts when it lives in a component.
 *
 * It discloses three things, because all three are true and only one of them is obvious: whose
 * message it is, that the photos go with it (`nina_message_images.message_id` cascades — assumption
 * A5), and that Nina stops seeing it — which is the whole point of R8 and the thing the runner
 * came here for.
 *
 * **This is not the invariant-4 case.** That invariant is about a *formatted instant or number*
 * reaching a component and producing a hydration mismatch; `dayISO` is its example and this app
 * says so in three places. A photo count is an integer the client already holds, pluralised in
 * `lib/` with a unit test, and it is deterministic on both sides of hydration.
 *
 * **What it deliberately does NOT say** is anything about a whole turn. See the plan's Decision 7:
 * a delete takes exactly one message.
 */
export function describeMessageDeletion(target: EditTarget, photoCount: number): string {
  const count = Number.isFinite(photoCount) ? Math.max(0, Math.trunc(photoCount)) : 0
  const whose = target.mine ? 'your message' : 'Nina’s message'
  if (count === 0) {
    return `Delete ${whose}? She stops seeing it in the conversation, and this cannot be undone.`
  }
  const noun = count === 1 ? 'its photo' : `its ${count} photos`
  const verb = count === 1 ? 'that photo goes' : 'those photos go'
  return `Delete ${whose} and ${noun}? She stops seeing it in the conversation, ${verb} with it, and this cannot be undone.`
}

/* ── applying either one to the list on screen ─────────────────────────────────────────────── */

/** The only two properties the delete rule needs. `ChatMessage` satisfies it. */
export interface DeletableMessage {
  id: string
  replyToId: string | null
}

/** The only two properties the edit rule needs. `ChatMessage` satisfies it. */
export interface EditableMessageRow {
  id: string
  body: string
}

/**
 * The list, with one message's text replaced by what the server confirmed.
 *
 * Returns the **same array reference** when nothing changed, on `mergeServerMessages`'s habit and
 * for its reason: React bails out of a state update that returns the identical value, so an edit
 * that resolved to `'unchanged'` costs no render.
 */
export function applyMessageEdit<T extends EditableMessageRow>(
  messages: readonly T[],
  id: string,
  body: string,
): T[] | readonly T[] {
  let changed = false
  const next = messages.map((message) => {
    if (message.id !== id || message.body === body) return message
    changed = true
    /* A generic spread with one key overridden. The cast is the standard narrowing for that, and
     * `ChatScreen` already casts at the `mergeServerMessages` call site for the same reason. */
    return { ...message, body } as T
  })
  return changed ? next : messages
}

/**
 * The list, with one message gone and every quote that pointed at it degraded to plain text.
 *
 * ── THIS IS THE CLIENT-SIDE EXPRESSION OF `ON DELETE SET NULL`, AND THAT IS THE POINT ─────────
 * `nina_messages.reply_to_id` is a self-FK with `onDelete: 'set null'`, and the table's own header
 * calls a degraded quote "the designed outcome". The database therefore nulls the pointer the
 * moment the row goes. If the client only FILTERED the deleted row, `resolveQuote` would already
 * return null (its candidate set is the rows on screen), so the screen would look right — but the
 * local rows would still carry a pointer the database no longer has, and `mergeServerMessages`
 * keeps LOCAL content for any id the server also has. That stale pointer would then survive every
 * later refresh. Nulling it here means the two halves cannot disagree.
 *
 * Same identity-preserving return as `applyMessageEdit`, for the same reason.
 */
export function applyMessageDeletion<T extends DeletableMessage>(
  messages: readonly T[],
  deletedId: string,
): T[] | readonly T[] {
  let changed = false
  const next: T[] = []
  for (const message of messages) {
    if (message.id === deletedId) {
      changed = true
      continue
    }
    if (message.replyToId === deletedId) {
      changed = true
      next.push({ ...message, replyToId: null } as T)
      continue
    }
    next.push(message)
  }
  return changed ? next : messages
}

/* ── the gesture ───────────────────────────────────────────────────────────────────────────── */

/**
 * How far from the RIGHT edge of the viewport a leftward drag must begin to be considered at all.
 *
 * `lib/nina/reply.ts` records, as its reason for making the reply swipe rightward-only, that "a
 * leftward drag from near the screen edge is how iOS Safari does forward navigation". This phase
 * takes the leftward direction anyway — it is the only gesture left (long-press and tap were both
 * rejected on the record in `MessageBubble`'s header) — so it has to answer that concern rather
 * than inherit it. His bubbles are `justify-end` inside a full-width row, so their right edge IS
 * the content edge and a thumb resting there is in Safari's gesture zone.
 *
 * 24 px, which is about the width of that zone and small enough that the remaining 90% of a phone
 * screen is still a valid place to start the drag. A rejected swipe costs one more swipe; a swipe
 * that races the platform's own navigation costs the page.
 */
export const MESSAGE_ACTION_EDGE_GUARD_PX = 24

/**
 * `visualViewport.scale` settles on 1.0000000000000002-style values after a pinch-and-release, so
 * "is the page zoomed" cannot be `> 1`. Same value and same reason as `reply.ts`'s and
 * `gallery.ts`'s.
 */
const ZOOM_EPSILON = 0.01

/**
 * What the bubble measures from a `touchend`, with no DOM types in the signature.
 *
 * Two fields more than `ReplySwipeGesture`, and they are exactly what the edge guard needs. A
 * separate interface rather than an extension of that one: `reply.ts` must not be edited (its own
 * header guarantees no later phase does), and these two fields are meaningless to the reply
 * gesture, which is rightward and therefore cannot collide with the right edge.
 */
export interface MessageActionSwipeGesture {
  /** `end.clientX - start.clientX`. **Negative** when the finger moved left. */
  dx: number
  /** `end.clientY - start.clientY`. */
  dy: number
  /** The MAXIMUM concurrent touches seen at any point in the gesture, not the count at the end. */
  touches: number
  /** `visualViewport.scale` at the end of the gesture; 1 when the page is not zoomed. */
  zoomScale: number
  /** `start.clientX`. Where the drag BEGAN — the edge guard is about the start, not the end. */
  startX: number
  /** `window.innerWidth`. 0 or negative disables the edge guard rather than rejecting everything. */
  viewportWidth: number
}

export type MessageActionSwipeDecision = 'actions' | 'none'

/**
 * Whether a finished drag on a bubble should open the action menu.
 *
 * ── THE FIVE RULES, IN THE ORDER THEY MATTER ──────────────────────────────────────────────────
 *   1. more than one finger is a pinch — and the count is the MAXIMUM seen during the gesture,
 *      because a pinch that begins with one finger down still has to lose;
 *   2. a zoomed page means a horizontal drag is the reader panning around;
 *   3. a drag that BEGAN inside the right-edge zone belongs to iOS Safari — see the constant;
 *   4. LEFTWARD ONLY. `dx >= 0` is reply's direction and reply gets it, unchanged (invariant 9);
 *   5. far enough, and dominantly horizontal, or the chat log keeps its scroll.
 *
 * **The distance and the dominance are `reply.ts`'s own constants, imported.** Two gestures on one
 * element that are unequally hard to perform read as one of them being broken, and 44 px / 1.6
 * were chosen for this exact surface: 44 is the tap-target floor and about a thumb's comfortable
 * drag on a 414px screen, and 1.6 is deliberately strict because the competing gesture is "the
 * primary interaction of the screen — scrolling a conversation". Importing rather than re-declaring
 * follows `reply.ts`'s own precedent for importing `ScrollGeometry` from `chatview.ts`: two
 * structurally identical constants would eventually disagree. Importing is not editing.
 *
 * There is no live drag-follow transform, for the reason `decideReplySwipe` gives: it would be the
 * first sustained animation outside `ri-pulse`, whose reduced-motion escape
 * `tests/motion.reducedMotion.test.ts` guards. The feedback the swipe needs is the sheet appearing.
 */
export function decideMessageActionSwipe(
  gesture: MessageActionSwipeGesture,
): MessageActionSwipeDecision {
  const { dx, dy, touches, zoomScale, startX, viewportWidth } = gesture
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'none'
  if (!Number.isFinite(startX) || !Number.isFinite(viewportWidth)) return 'none'
  if (touches > 1) return 'none'
  if (Number.isFinite(zoomScale) && zoomScale > 1 + ZOOM_EPSILON) return 'none'
  if (viewportWidth > 0 && startX > viewportWidth - MESSAGE_ACTION_EDGE_GUARD_PX) return 'none'

  const travel = -dx
  if (travel < REPLY_SWIPE_MIN_DISTANCE) return 'none'
  if (travel < Math.abs(dy) * REPLY_SWIPE_DOMINANCE) return 'none'
  return 'actions'
}

/* ── the tap ───────────────────────────────────────────────────────────────────────────────── */

/**
 * How far a finger or a mouse may travel and still be a tap, in CSS pixels, in EITHER axis.
 *
 * 10, which is the platforms' own answer rather than a guess: Android's `ViewConfiguration` touch
 * slop is 8dp and UIKit allows roughly 10pt before a touch stops being a tap. Taking the larger of
 * the two means a shaky thumb opens the sheet on the first try.
 *
 * It is deliberately far below `REPLY_SWIPE_MIN_DISTANCE` (44), and `edit.test.ts` pins the
 * inequality so the two windows can never grow into each other. The 34 px between them is a DEAD
 * BAND and that is the design: a drag long enough to be ambiguous is neither a tap nor a swipe and
 * does nothing at all. The gesture that guesses on an ambiguous input is the one that opens a
 * delete confirmation nobody asked for.
 */
export const MESSAGE_ACTION_TAP_SLOP_PX = 10

/**
 * The bubble's own prose, marked so a tap can tell it from the empty paper beside it.
 *
 * `MessageBubble`'s touch handlers sit on the `<li>`, which is a full-width flex row: his bubble is
 * `justify-end` inside it, so the left portion of that row is blank. A SWIPE there is unambiguous
 * and is allowed to open the sheet, exactly as it does today. A TAP there is not — tapping the
 * empty part of a conversation is what a reader does when they mean nothing in particular, and
 * that gesture must not open a sheet on whichever row happens to be under it.
 *
 * The `<li>` cannot simply be narrowed instead: that would move the reply gesture's hit area, and
 * invariant 6 says the reply swipe keeps every pixel it has today. So the bubble's own `<div>`
 * carries the attribute and a `closest()` from the element the press landed on answers the
 * question.
 *
 * The literal attribute is written once, in `MessageBubble`'s JSX. This selector is its only
 * reader, and it lives here rather than in the component for the reason every rule in this file
 * lives here: the component measures, `lib/` decides.
 */
export const BUBBLE_BODY_SELECTOR = '[data-nina-bubble-body]'

/**
 * Everything inside a bubble that is already a control, and therefore is not the bubble.
 *
 * Read off the render, top to bottom. `QuoteStub` is a `<button>` whenever it can jump; `ChatImages`
 * wraps each photograph in a `<button>` whenever the viewer is armed; `RunAttachmentCard` is a
 * `next/link` — an `<a>` — to `/r/[id]`; and the bubble itself carries two
 * `sr-only focus:not-sr-only` `<button>`s. So `a` and `button` are the two selectors this render
 * actually needs, and they cover all five controls.
 *
 * The rest of the list is there because the safe direction of error is "that was a control".
 * A missed exclusion opens a sheet over something the runner meant to press; an over-broad
 * selector costs one extra tap on the prose. Anything a later phase hangs in `MessageBubble`'s
 * `above` slot is therefore excluded by default, which is the behaviour a shared slot should have.
 *
 * A `closest()` selector rather than a `data-` attribute on each control, deliberately: the
 * controls live in four other files, three of which this phase does not own, and a selector needs
 * no cooperation from any of them.
 */
export const BUBBLE_INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,summary,[role="button"],[role="link"],[contenteditable="true"]'

/**
 * What the bubble measures from a finished tap, with no DOM types in the signature.
 *
 * Four of the seven fields are `MessageActionSwipeGesture`'s, measured the same way and for the
 * same reasons — see it. The three new ones are BOOLEANS THE COMPONENT COLLAPSES, on
 * `EditTarget.hasImage`'s precedent and for its reason: answering them needs an `Element` and a
 * `Selection`, and this module may not name either.
 */
export interface MessageActionTapGesture {
  /** `end.clientX - start.clientX`. A tap has no direction, so only the MAGNITUDE is read. */
  dx: number
  /** `end.clientY - start.clientY`. Same, and it is what makes a scroll not a tap. */
  dy: number
  /** The MAXIMUM concurrent touches seen at any point in the interaction. 1 for a mouse. */
  touches: number
  /** `visualViewport.scale` at the end of the interaction; 1 when the page is not zoomed. */
  zoomScale: number
  /**
   * True when the interaction BEGAN inside the bubble's own prose —
   * `closest(BUBBLE_BODY_SELECTOR)` from the element the press landed on. False for the empty
   * paper beside the bubble. See `BUBBLE_BODY_SELECTOR` for why the row is wider than the bubble.
   */
  startedOnBody: boolean
  /**
   * True when the interaction BEGAN on a control inside the bubble —
   * `closest(BUBBLE_INTERACTIVE_SELECTOR)`.
   *
   * The START and not the end, and the browser agrees with that choice: a `click` whose press and
   * release are on different elements fires on their common ancestor, so a press that begins on a
   * photograph and lifts over the text opens neither the viewer nor this sheet. Consulting the end
   * as well would be a second sample for a case where doing nothing and doing something are
   * equally defensible.
   */
  startedOnInteractive: boolean
  /**
   * True when a non-collapsed text selection existed at ANY point in the interaction — sampled at
   * the start and again at the end, the way `touches` is a maximum rather than a final count.
   *
   * Both samples are load-bearing and they catch different things. At the END: a short drag that
   * selected a few characters without travelling far, and iOS's long-press selection callout —
   * which is how this rule keeps the promise `MessageBubble`'s header made, that copying what she
   * said stays a real capability. At the START: a click on a bubble that already carries a
   * selection is the click that DISMISSES that selection, and the browser collapses it on
   * `pointerdown`, so by the time the release could be asked the evidence is gone.
   */
  textSelected: boolean
}

export type MessageActionTapDecision = 'actions' | 'none'

/**
 * Whether a finished tap or click on a bubble should open the action menu — R4's opener.
 *
 * The capability it opens shipped in `75a9c34`; what never shipped was a way to ask for it with a
 * pointer. A LEFT swipe and a focus-revealed button were the only two openers, so a mouse had none
 * at all, and the user's words are "user can click any bubble (his or nina's) and choose: edit,
 * delete". This function is that click, expressed as rules because `vitest.config.ts` is
 * `environment: 'node'` and a rendered-scenario test would prove one gesture where these prove the
 * gate — the same argument this file's header makes for existing.
 *
 * ── WHY A TAP IS ALLOWED NOW, WHEN `MessageBubble`'s HEADER REJECTED ONE TWICE ────────────────
 * That header rejected a tap because it would "make the bubble itself a button, which breaks text
 * selection just as thoroughly" as a long press. The objection is ANSWERED here rather than
 * overruled, and it is answered in three places at once: nothing becomes a `<button>` (a bubble
 * contains buttons and cannot be one), no `role` and no `tabIndex` are added, and `textSelected`
 * gives the platform's own selection gesture right of way over the opener. The bubble stays
 * selectable prose that happens to answer a tap. The long press stays the selection gesture, and
 * it needs no rule of its own: a long press leaves a selection, and a selection refuses the tap.
 *
 * ── THE SEVEN RULES, IN THE ORDER THEY MATTER ─────────────────────────────────────────────────
 *   1. it must have STARTED on the bubble's prose. The row is full-width and the paper beside a
 *      bubble is not the bubble;
 *   2. it must not have started on a control. The photo grid, the quote stub, the run card and the
 *      two `sr-only` buttons all own their own presses;
 *   3. no selection at either end — see `textSelected`;
 *   4. the row has to be actionable, and `canActOnMessage` IS that gate, reused rather than
 *      restated. **The refusal here is SILENT, and that is the one place a tap and a swipe
 *      deliberately differ.** `ChatScreen.handleRequestActions` answers a rejected swipe with an
 *      `edit-unavailable` notice, because "the runner performed a deliberate gesture and a gesture
 *      that does nothing reads as a broken screen". A tap on the bubble he sent one second ago is
 *      not deliberate — it is a thumb still resting where the send target was — and a notice for
 *      it would be noise on the happy path. So an optimistic row opens nothing and says nothing,
 *      and the swipe's notice is untouched;
 *   5. one finger. The MAXIMUM seen during the interaction, as everywhere else on this screen,
 *      because a pinch that begins with one finger down must still lose;
 *   6. not on a zoomed page. Same epsilon and same reason as `decideMessageActionSwipe` and
 *      `decideReplySwipe`: `visualViewport.scale` settles a hair above 1 after a pinch-release, and
 *      while the page is zoomed a small movement is the reader panning, not choosing;
 *   7. it must not have TRAVELLED, in either axis. `dx` is read as a magnitude — a tap has no
 *      direction, and that is exactly what keeps this decision from re-litigating either swipe:
 *      reply owns rightward past 44 px, actions owns leftward past 44 px, and a tap owns the 10 px
 *      around zero. The three windows are disjoint by construction and `edit.test.ts` pins it.
 *
 * There is no timer anywhere in here, which is the second half of why this is a tap and not a long
 * press: `MessageBubble`'s header rejected the long press partly on the timer, the cancel path and
 * the haptic story it would need, and the plan set's Decisions table settled the fork the same way.
 */
export function decideMessageActionTap(
  target: ActionableMessage,
  gesture: MessageActionTapGesture,
): MessageActionTapDecision {
  const { dx, dy, touches, zoomScale, startedOnBody, startedOnInteractive, textSelected } = gesture
  if (!startedOnBody) return 'none'
  if (startedOnInteractive) return 'none'
  if (textSelected) return 'none'
  if (!canActOnMessage(target)) return 'none'
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'none'
  if (touches > 1) return 'none'
  if (Number.isFinite(zoomScale) && zoomScale > 1 + ZOOM_EPSILON) return 'none'
  if (Math.abs(dx) > MESSAGE_ACTION_TAP_SLOP_PX) return 'none'
  if (Math.abs(dy) > MESSAGE_ACTION_TAP_SLOP_PX) return 'none'
  return 'actions'
}
