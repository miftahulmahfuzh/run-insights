# Phase 8: Run attachments and the round trip

**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R13 (a run can be attached to Nina from its own page, with or without a typed
message, and she answers about it) — R14 (tapping an attached run opens `/r/<id>`; the back-swipe
returns to the chat at the exact prior scroll position, not at the newest message)
**Depends on:** Phase 3 (`lib/nina/actions.ts`, `lib/nina/turn.ts`, `buildNinaRunFact`), Phase 4
(the chat screen, `MessageBubble`'s `above` slot, the `id="nina-msg-*"` anchor, `lib/nina/chatview.ts`)
**Difficulty:** HARD
**Package:** `lib/nina`, `components/nina` (plus one button on `app/r/[id]/page.tsx` and one query
in `lib/db/queries.ts`)

---

## Goal

After this phase a run is a thing you can hand to Nina. An icon on `/r/[id]` pins that run above
the composer; send with a question or send nothing at all, and she answers from the *same*
precomputed facts `lookup_runs` uses — `buildNinaRunFact`, reached by a different route, never a
second facts path. The message keeps the run forever as `nina_messages.run_id`, rendered as a card
inside its bubble; tapping the card opens the run, and the iOS back-swipe puts the runner back in
the conversation at the pixel they left, not at the bottom. The arithmetic that makes that true is
five pure functions in `lib/nina/scroll.ts` with a unit test, because the DOM half cannot be tested
in this repo's vitest (invariant 6).

---

## The R14 mechanism, and the doc sentences it rests on

This is the requirement most likely in the plan set to be planned wrong from memory, so the
mechanism is settled here, in writing, before any code.

### What is NOT available: `<Activity>` state preservation

`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` opens with:

> **Good to know:** This guide assumes [Cache Components](/docs/app/getting-started/caching) is
> enabled. Enable it by setting [`cacheComponents: true`](...) in your Next config file.

and then describes exactly the behaviour we would want:

> Instead of unmounting pages on navigation, Next.js hides them using React's `<Activity>`
> component. Activity keeps the DOM in the document (hidden with `display: none`), so both React
> state and DOM state are preserved: form drafts, scroll positions, expanded `<details>` elements,
> video playback progress, and more.

**`next.config.ts` in this worktree sets no `cacheComponents` key** (verified: the config declares
`reactStrictMode`, `images`, `headers` and nothing else). So Cache Components is off, the chat page
**unmounts** when the runner opens `/r/<id>`, and "scroll positions … are preserved" does not apply
to this app. Any plan that leans on Activity here ships a feature that works in the docs and not on
the phone. Do not enable `cacheComponents` for this phase — that is a whole-app rendering change
with its own migration guide, and it is not R14's price of admission.

### What is NOT relied on: `useRouter().bfcacheId`

`03-api-reference/04-functions/use-router.md` describes an id that would let us tell a POP from a
fresh push:

> `router.bfcacheId`: An opaque string identifier scoped to the current route segment. It changes
> when the surrounding segment is freshly created by a push or replace navigation, and stays the
> same for back/forward navigations, `router.refresh()`, and search-param- or hash-only
> navigations.

Tempting, and the installed implementation does exist unconditionally
(`node_modules/next/dist/client/components/navigation.js:154-176` reads
`layout?.parentCacheNode.bfcacheId ?? 0`). It is **not** relied on, for two reasons: the same doc
frames its contract inside Cache Components ("When `cacheComponents` is enabled, the App Router
preserves Client Component state across navigations using React `<Activity>`. Keying a component on
`bfcacheId` …"), and the doc's own advice is

> Use `bfcacheId` only as a last resort, like when migrating an existing codebase.

Whether the id is stable and distinct with `cacheComponents` off is **not settled by the docs**.
See *Decisions on the open items* item 1 — decided against, with the condition that would reopen it.

### What IS relied on: the scroll position becomes part of the chat's history entry

The back-swipe is iOS Safari's native gesture: a history POP nobody in our code initiated. The one
thing that survives a POP by definition is **the history entry itself** — its URL. So the position
is written onto the chat's own entry as a search param before we leave, and read back off the URL
when the entry comes back. Two doc sentences carry this.

`01-getting-started/04-linking-and-navigating.md`, under *Native History API*:

> Next.js allows you to use the native [`window.history.pushState`](...) and
> [`window.history.replaceState`](...) methods to update the browser's history stack without
> reloading the page. `pushState` and `replaceState` calls integrate into the Next.js Router,
> allowing you to sync with [`usePathname`](...) and [`useSearchParams`](...).

`02-guides/instant-navigation.md`, on why the read is synchronous and cannot flash:

> But on a client navigation, the router already has the params from the URL and the hook resolves
> synchronously.

And the reason the mount-time jump has to be suppressed rather than raced, from
`04-linking-and-navigating.md`:

> Next.js also handles [scrolling to the top of the page](...) during client-side transitions.

**This is also the repo's own precedent, not a new idea.** `docs/plans/F24-detail-panel-history.md`
made a panel's open state a history entry for the same gesture — its §"The write is
`window.history.pushState`, not `router.push`" quotes the same doc paragraph, and
`components/ui/usePanelParam.ts:105-149` is the working implementation of the idiom this phase
copies: `window.history.replaceState(null, '', withParam(...))` with a `URLSearchParams` copy of
the current query, `null` state (Next's patched `history` merges its own `__NA` marker back in —
`node_modules/next/dist/client/components/app-router.js:54-89`), and *replace, never push*, because
a pushed entry costs the runner an extra back-swipe to leave the screen.

### The mechanism, in six steps

1. The runner is at `/nina`, scrolled anywhere. A message with an attached run renders a card.
2. Tapping the card fires the `<Link>`'s `onNavigate`. Before the transition, we measure — from the
   `id="nina-msg-*"` anchors phase 4 left us — which message is at the top of the viewport and by
   how many pixels it is offset, and `replaceState` that onto the current entry as
   `?at=<messageId>~<offset>`.
3. Next navigates to `/r/<id>` and scrolls it to the top, which is correct for a fresh screen.
4. The back-swipe POPs to `/nina?at=<messageId>~<offset>`. The chat page re-renders and
   `ChatScreen` mounts fresh (no Activity).
5. `useSearchParams()` resolves `at` synchronously. `MessageList`'s mount effect sees a decoded
   mark, **skips `decideAutoScroll({ cause: 'mount' })`**, finds `#nina-msg-<messageId>`, and
   scrolls to `anchorDocumentTop - offset`, clamped into the document.
6. The param stays on the entry, deliberately: the round trip is then repeatable, and a *fresh*
   `/nina` from the tab bar is a new entry with no param, so it still lands at the newest message.

A mark whose anchor message is gone (the row was never persisted, or the conversation moved on)
resolves to `null` and the mount falls back to phase 4's bottom jump. That is the whole degradation
story: never a wrong position, only the default one.

---

## The icon-only button, and why it does not contradict the design system

R13 is explicit: *"add a button (using icon, not text)"*. `components/ui/AppShell.tsx:195-200`
is equally explicit the other way:

> The screen title row: a name on the left, at most one plain-text link on the right.
> A plain-text link, never an icon button — "TRENDS →" is unambiguous at a glance and an icon is a
> guess.

Both hold, because they govern different rows. `ScreenHeader`'s rule is about **screen titles** —
`/`, `/trends`, `/me` — where the action is a navigation to another named screen and the screen's
name is the thing that disambiguates. `/r/[id]` **does not use `ScreenHeader` at all**: it hand-rolls
its own header (`app/r/[id]/page.tsx:146-160`) whose right-hand group is a *share affordance row* —
`Correct` and `ShareButton` — and `ShareButton` is the sibling this button is placed next to.

That said, `ShareButton` renders text (`SHARE_ACTION`), so "an icon is already idiomatic here" would
be false if it were the only argument. It is not. The argument is:

1. **The user asked for an icon, in the requirement's own words.** That is a specification, not a
   preference, and this row is not the row the convention is written about.
2. **A paper-plane-to-Nina is the one action on this screen with no honest word for it.** "Nina",
   "Ask", "Send" all mislead — the tap does not ask anything yet; it *arms* the composer with this
   run. An icon that means "send this over there" carries that better than any of the three, which
   is the exact inverse of the `TRENDS →` case where the word is unambiguous and the icon is a guess.
3. **It is not unlabelled.** `aria-label="Attach this run to a message for Nina"` plus a `title`,
   so the affordance is named for a screen reader and on long-press, and the icon is decorative
   (`aria-hidden`) in the accessibility tree. An icon button whose accessible name is a full sentence
   is not "a guess"; an icon with no name would be.
4. **It stays the only one.** The header keeps two plain-text links and gains exactly one icon.
   If a second icon ever wants in, the convention in `AppShell.tsx` should win that argument.

The implementation is a **plain `<Link>`, not a client component**: `/nina?attach=<runId>`. No
`'use client'`, no state, no server action, and the chat page does the loading — which is also why
`ci:f11-guard` and `ci:f08-guard` cannot be disturbed (see *Verification*).

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates — `lib/nina/scroll.ts`** (new, pure, no DOM, no React):
`CHAT_SCROLL_PARAM = 'at'`, `MAX_CHAT_SCROLL_OFFSET_PX = 20000`,
`encodeChatScrollMark(mark) -> string`,
`decodeChatScrollMark(raw: string | null) -> ChatScrollMark | null`,
`pickScrollAnchor(rows: readonly ScrollAnchorRow[], scrollTop: number) -> ChatScrollMark | null`,
`clampScrollTop(top: number, geometry: ScrollGeometry) -> number`,
`resolveRestoreTop(input: RestoreInput) -> number | null`;
types `ChatScrollMark`, `ScrollAnchorRow`, `ScrollGeometry`, `RestoreInput`.

**Creates — `lib/nina/scroll.test.ts`** (new).

**Creates — `lib/nina/attach.ts`** (new, pure):
`toRunAttachment(row: RunAttachmentInput) -> RunAttachment`,
`indexAttachments(rows: readonly RunAttachmentInput[]) -> Map<string, RunAttachment>`,
`ATTACH_PARAM = 'attach'`; types `RunAttachment`, `RunAttachmentInput`. `RunAttachmentInput` is a
*structural* input declared here and not imported from `lib/db` — the same boundary phase 2 draws
with `NinaRunInput`, so the formatter does not depend on the schema.

**Creates — `lib/nina/attach.test.ts`** (new).

**Creates — `components/nina/RunAttachmentCard.tsx`** (new, `'use client'`):
`RunAttachmentCard`.

**Creates — `components/nina/AttachmentChip.tsx`** (new, no `'use client'` of its own):
`AttachmentChip`.

**Creates — `components/nina/useChatScroll.ts`** (new, `'use client'`):
`useChatScrollMark() -> { mark: ChatScrollMark | null; saveMark: () => void }`,
`readAnchorRows() -> ScrollAnchorRow[]` (exported for the DOM half only; not unit-tested).

**Creates — `lib/db/queries.ts`**: `listRunAttachments(userId, runIds)` and the exported interface
`RunAttachmentRow` (appended at the end of the file, after `getActiveShareForRun`).

**Signature changes (all additive, all with defaults):**

- **`sendNinaMessage` — the ONE final signature (RULING B1).** This phase's instruction to the
  reconciler ("make this ONE change, not two") is **HONOURED**: there is a single object, four
  phases each add exactly one optional field to it, each in its own commit.

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

  **At this phase's landing the object carries `body`, `imageTickets`, `replyToMessageId` and
  `runId`.** `attachExisting` arrives with phase 13.

- **The ONE final refusal rule (RULING B1).** An empty `body` is refused unless the message carries
  something else:

  ```ts
  const hasAttachment =
    (input.imageTickets?.length ?? 0) > 0 ||        // phase 6
    input.runId != null ||                           // phase 8
    input.attachExisting != null                     // phase 13
  if (input.body.trim() === '' && !hasAttachment) return refuse('empty')
  ```

  Monotone by construction: phase 3 ships `body.trim() === ''` alone and each phase adds its own
  clause in its own commit, so the tree is green at every boundary. **This phase's clause is
  `input.runId != null`, and it is the whole of R13's "or not include any text at all"** — handing
  her a run without a question is a message, and the server-side rule must say so or the client's
  enabled Send button is a lie. Note that `replyToMessageId` is deliberately **not** a clause: a
  quote with no words is not a message. Step 12's `canSend` and Step 15's guard are the two halves
  of this one rule and must match.

- **`SentBubble` gains `replyToId: string | null` — owned by phase 7 (RULING B1).** This phase's
  optimistic row carries its `attachment` from `ChatScreen`'s own state, so the lag it noted (a
  server-side field that only appears on the next render) does not apply to the run card. The same
  lag on the *quote* is resolved in phase 7, which already edits `lib/nina/actions.ts`: it widens
  `SentBubble` there, not in phase 3 and not as a follow-up card. Nothing for this phase to do.

- `NinaTurnInput` (`lib/nina/turn.ts`, Phase 3) gains `attachedRunId?: string | null`. The ONE
  final shape (RULING B2):

  ```ts
  // lib/nina/turn.ts — phase 3 creates it; 6, 7 and 8 each add one optional field.
  export interface NinaTurnInput {
    /* phase 3's base fields, unchanged */
    imageDescriptions?: readonly string[]          // phase 6 — glm-4.6v's text, never an image block
    quoted?: QuotedMessageInput | null             // phase 7
    attachedRunId?: string | null                  // phase 8
  }
  ```

  Phase 13's `avatar` is **not** here: it goes on `NinaContext` (and `BuildNinaContextInput`),
  which is correct and stays there.

- **`NinaTurnOptions.runId` (phase 10) and `NinaTurnInput.attachedRunId` (phase 8) are different
  fields and BOTH exist** (RULING B2 — this phase's paragraph, promoted from a conditional to a
  statement). `NinaTurnOptions.runId` is written to `nina_messages.run_id` on **every row the turn
  persists**; `attachedRunId` is resolved through `buildNinaRunFact` and rendered into the prompt.
  For a chat attachment they carry the same id; for phase 10's `run_committed` proactive message
  they need not — she is writing about a run nobody attached. Neither field is a rename of the
  other and neither may be collapsed into it.
- `ChatScreen({ initial, todayISO })` -> `ChatScreen({ initial, todayISO, pending })`
  (`components/nina/ChatScreen.tsx`, Phase 4).
- `MessageList({ messages, typing, todayISO, keyboardOverlapPx })` -> the same plus `restoreMark`
  (`components/nina/MessageList.tsx`, Phase 4).
- `Composer({ onSend, busy, bottomCss })` -> the same plus `attachment` and `onClearAttachment`;
  `onSend(body: string)` -> `onSend(body: string)` **unchanged** — the attachment is read by
  `ChatScreen` from its own state, not passed through the composer's callback.
- `ChatMessage` (`components/nina/types.ts`, Phase 4) gains `attachment?: RunAttachment | null`.
  **Phase 4's handoff note says this type "is to be widened with `runId`"; this supersedes it** —
  `attachment.runId` is that value, and a display-ready object is what the card needs. Ruling E2b
  confirms it: phase 7's speculative `runId?: string | null` declaration has been **deleted from
  phase 7's plan**, so this phase is the sole declarer of `attachment`. The other field on the same
  interface is phase 6's, and it is **`imageUrls?: readonly string[]`** — plural, because a message
  carries up to `NINA_MAX_CHAT_IMAGES`; phase 7's singular `imageUrl?` is likewise deleted. This
  phase reads `imageUrls` only in the `above` guard (Step 11) and never declares it.
- **`QuoteCandidate.hasRun` (`lib/nina/reply.ts`, Phase 7) — wired here.** Phase 7 lands first and
  therefore cannot name `RunAttachment`, so its `quoteMediaOf` takes booleans the caller computes:
  `hasImage: boolean` and `hasRun: boolean`, both filled by `MessageList`. `hasRun` is `false` at
  phase 7's landing because nothing sets it yet. **This phase passes `hasRun: m.attachment != null`
  into the quote candidate** (Step 11) — one field, and it is what makes phase 7's `You · Run` stub
  label light up. Consequence: **`lib/nina/reply.ts` itself is never edited by phase 8.** Only the
  caller changes, so the file stays out of this phase's Files table.
- `app/nina/page.tsx` (Phase 4) gains `searchParams` via `PageProps<'/nina'>`.

**Requires (from earlier phases):**

- **Phase 3** — `buildNinaRunFact(run: NinaRunInput, today: DateISO) -> NinaRunFact` is exported
  from `lib/nina/context.ts` (phase 3 already requires this rename of phase 2's module-local
  `runFact`). This phase adds no second caller pattern: it calls the same function with the same
  arguments `handleLookupRuns` uses.
- **Phase 3** — `NinaRunHistory.runs` is `readonly NinaDetailedRunInput[]`, the whole reviewed
  history, loaded once per turn by `NinaToolGateway.loadRunHistory`. The attached run's facts come
  out of **that already-loaded array**, so an attachment adds **zero database round trips** to a
  turn.
- **Phase 3** — `lib/nina/actions.ts` persists the runner's row *before* the model call.
- **Phase 1** — the canonical writer is **`insertNinaMessages(userId, rows: readonly
  NinaMessageInsert[])`**, a batch, and **`NinaMessageInsert.runId?: string | null`** is the field
  this phase writes. Its insert type is `{ role, body, source?, turnId?, replyToId?, runId? }` with
  **no `seq`** — `nina_messages.seq` is a `bigserial` Postgres assigns, and emission order comes
  from the one multi-row `INSERT` (ruling A2b). Phase 3's guessed
  `insertNinaMessage(userId, { role, text, seq, replyToId, runId })` **does not exist** and phase
  3's *Requires* item 3 has been rewritten accordingly; this phase names phase 1's batch writer
  instead.
- **Phase 3** — `userTurnText(input: NinaTurnInput)` in `lib/nina/turn.ts` assembles the user turn
  from `parts: string[]`. Step 12 appends one block to it.
- **Phase 4** — `MessageBubble`'s `above?: React.ReactNode` slot and the
  `id={`nina-msg-${message.id}`}` attribute on the `<li>` exist and are unused. Both are consumed
  here; the anchor id is the *only* thing R14's arithmetic can key on.
- **Phase 4** — `lib/nina/chatview.ts` exports `decideAutoScroll`, `isNearBottom`, `groupIntoDays`,
  `ScrollCause`. `lib/nina/scroll.ts` is a **sibling** of that module, not a replacement: `chatview`
  decides whether a *new bubble* moves the page, `scroll` decides where a *returning screen* starts.
- **Phase 1** — `nina_messages.run_id` exists, nullable text, and `listNinaMessages` returns
  `runId: string | null` on `NinaMessageRow` (phase 1 owns `lib/nina/queries.ts` and every function
  in it selects the same `messageColumns`, so the field is there in every read this phase makes).
- **Phase 1 / phase 2 / phase 3 — the DTO boundary, settled (ruling A1).** Three layers, three
  spellings, one mapper, and nobody "fixes" one side to match the other:

  | Layer | Owner | Message field names |
  |---|---|---|
  | `lib/db/schema.ts` — the columns | phase 1 | `text`, `sent_at` (Drizzle: `ninaMessages.text`, `ninaMessages.sentAt`) |
  | `lib/nina/queries.ts` — the data-access DTO (`NinaMessageRow`, `NinaMessageInsert`) | phase 1 | **`body`, `createdAt`** — uniformly, in every function |
  | `lib/nina/context.ts` — the prompt-layer input (`MessageInput`) | phase 2 | `text`, `sentAt` |

  The single translation point is **`lib/nina/gateway.ts`'s `dbNinaSourceGateway` (phase 3)**, which
  maps `NinaMessageRow → MessageInput` (`text: row.body`, `sentAt: row.createdAt`). This phase is a
  consumer of `lib/nina/queries.ts`, so it reads and writes **`body` / `createdAt`** everywhere:
  Step 14's `body: row.body` and `jakartaDayOf(row.createdAt)` are correct as printed, and Step 15's
  insert writes `body`, not `text`. Phase 3's old "requires the column spelling `text`" and its
  request that the reconciler edit phase 4's destructure are **deleted** — there was never a
  conflict to settle, only two correct spellings on two sides of one mapper.

**Leaves alone (owned by others):**

- Reply-to: `nina_messages.reply_to_id`, `ReplyQuote`, `resolveQuote`, `MessageBubble`'s `quote`
  prop, `replyToMessageId`, `SentBubble.replyToId` and **`lib/nina/reply.ts` in its entirety**
  (**Phase 7**). See *The combined shape* below — the render is coordinated, not implemented. The
  single exception is one boolean: this phase passes `hasRun: m.attachment != null` into phase 7's
  quote candidate from `MessageList` (Step 11), which is a change to the *caller*, not to phase 7's
  module.
- The image path: `nina_message_images`, `imageDescriptions`, `imageTickets`, `ChatImages`,
  `ChatMessage.imageUrls` and the composer's picker button (**Phase 6**). The composer's left-hand
  icon row is shared; this phase puts nothing in it. `imageUrls` is *read* in Step 11's `above`
  guard and declared by phase 6, never here.
- `lib/nina/proactive.ts` and the `run_committed` marker's own use of `run_id` (**Phase 10**).
- `components/share/*`, `app/(public)/s/[token]/*` — untouched, and the f11 guard proves it.
- `TabBar`, the unread dot, `NinaAvatar`, `/nina/about` (**Phases 4, 10, 13**).

**The combined shape (RULING E2 — settled).** A message can carry a reply quote, images and a run
attachment. The composition belongs to the *caller* — **`MessageList` owns the `above` expression**
— but the quote is **not** in `above`: phase 7 gives it its own `quote` prop on `MessageBubble`,
deliberately, so the two do not compete for one slot, and `MessageBubble` renders `quote` above
`above`. So `above` carries **images (phase 6) then the run card (phase 8)**, and this is the final
expression, adopted verbatim:

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

Render order inside the bubble, top to bottom: **quote stub → images → run card → text.** That is
this phase's own reasoning, preserved: the quote says *what he is answering*, the images and the
card are *what he is handing over*, and the text below then reads as the message itself. Every
block is a `rounded-field` inset on `bg-ink-3/20` per ruling E1 and phase 4's note on the slot, and
**each inset block keeps its own `mb-2`** — a stack needs no wrapper margin if every member owns
its bottom edge.

**Ownership, as a record rather than a request.** `MessageList` owns the expression. **Phase 6
ships the images-only branch** (it lands first among the two `above` fillers); **phase 8 widens it
to the two-branch stack** printed above. Phase 7 never touches `above` at all — it owns `quote`,
`ReplyQuote` and `resolveQuote`. One prop, one owner, three times over.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/scroll.ts` | create | the five pure functions R14 rests on, plus `CHAT_SCROLL_PARAM` |
| `lib/nina/scroll.test.ts` | create | the restoration rule, unit-tested (invariant 6) |
| `lib/nina/attach.ts` | create | `RunAttachmentRow` -> display-ready `RunAttachment`, via `lib/format` |
| `lib/nina/attach.test.ts` | create | the mapper's formatting and null handling |
| `lib/db/queries.ts` | modify | append `listRunAttachments` + `RunAttachmentRow` after `getActiveShareForRun` (`:1866`, end of file) |
| `app/r/[id]/page.tsx` | modify | one icon `<Link>` in the header action group (`:150-159`) |
| `app/nina/page.tsx` | modify | read `?attach=`, load the attachments for the rendered rows, pass `pending` (phase 4's `maxDuration = 60` is already here — untouched, not re-declared) |
| `components/nina/types.ts` | modify | `ChatMessage` gains `attachment` |
| `components/nina/RunAttachmentCard.tsx` | create | the card in the bubble; the `<Link>` that saves the mark |
| `components/nina/AttachmentChip.tsx` | create | the pinned-above-the-composer chip with its clear button |
| `components/nina/useChatScroll.ts` | create | the thin DOM half: read the anchors, write/read the param |
| `components/nina/MessageList.tsx` | modify | fill `above`; honour `restoreMark` on mount |
| `components/nina/Composer.tsx` | modify | render the chip; allow a text-free send when one is pinned |
| `components/nina/ChatScreen.tsx` | modify | own the pending attachment, pass `runId` to the action, stamp it on the optimistic row |
| `lib/nina/actions.ts` | modify | `sendNinaMessage` accepts `runId`, validates it, persists it, forwards it |
| `lib/nina/turn.ts` | modify | `attachedRunId` -> `buildNinaRunFact` from the already-loaded history -> one prompt block |
| `lib/nina/turn.test.ts` | modify | one case: an attached run puts its facts in the user turn |

---

## Implementation Steps

### Step 1: `lib/nina/scroll.ts` — the restoration arithmetic

**File:** `lib/nina/scroll.ts` (new)
**Change:** the whole module. No DOM, no React, no `window` — every function takes numbers and
returns numbers, which is what makes it testable under `environment: 'node'` (invariant 6, and the
`lib/photos/gallery.ts` precedent extracted out of `PhotoViewer.tsx` for exactly this reason).

**Code:**

```ts
/**
 * Where a returning chat screen starts. R14: *"back-swipe will return to the chat at the exact
 * scroll position (not at the most recent message)"*.
 *
 * ── WHY THIS IS A SIBLING OF `chatview.ts` AND NOT PART OF IT ─────────────────────────────────
 * `lib/nina/chatview.ts` answers "a bubble just arrived — should the page move?". This module
 * answers "the screen just came back — where does it start?". Same units, opposite direction of
 * causation, and they must not share a decision function: phase 4's `decideAutoScroll({ cause:
 * 'mount' })` deliberately jumps to the newest message, which is exactly the behaviour R14 forbids
 * on a back-swipe. Two rules, two modules, one caller that picks between them.
 *
 * ── WHY AN ANCHOR AND AN OFFSET, NOT A `scrollTop` ────────────────────────────────────────────
 * A raw pixel offset is only correct if the document is exactly as tall as it was when we left, and
 * it will not be: Nina may have written while the runner was away (phase 10), a font may settle, an
 * image may load (phase 6). So the mark records **which message was at the top of the viewport and
 * how far below the viewport's top edge it sat**, and restoration re-derives the pixel from wherever
 * that message is now. This is the standard anchor-and-offset restoration, and it degrades honestly:
 * if the anchor is gone, `resolveRestoreTop` returns null and the caller does the ordinary thing.
 *
 * ── WHY IT LIVES IN A URL PARAM ───────────────────────────────────────────────────────────────
 * See the phase plan's mechanism section. The back-swipe is a POP; the only state that survives a
 * POP for free is the history entry, so the mark is encoded into the chat entry's query. Encoding is
 * therefore part of the arithmetic — `~` as the separator (unreserved in a query string, so no
 * percent-encoding, and not a character `lib/id.ts`'s alphabet can produce), a decimal integer for
 * the offset, and a decoder that treats anything it does not recognise as "no mark" rather than
 * throwing. The precedent is `lib/panel/param.ts`, which encodes a panel selection the same way and
 * for the same gesture (F24).
 */

/** The chat entry's query parameter. `?at=<messageId>~<offset>`. */
export const CHAT_SCROLL_PARAM = 'at'

/**
 * A sanity bound on the decoded offset. The anchor is chosen to be at or just below the viewport's
 * top edge, so a legitimate offset is at most one viewport tall (plus a partial bubble); 20 000 px
 * is far past any phone and still small enough that a hand-edited URL cannot ask us to scroll to a
 * position no document has. Out of range is treated as no mark, never as a clamp — a nonsense mark
 * should produce the default screen, not a silently corrected one.
 */
export const MAX_CHAT_SCROLL_OFFSET_PX = 20000

export interface ChatScrollMark {
  /** `nina_messages.id` of the message that was at the top of the viewport. */
  messageId: string
  /**
   * Signed pixels from the viewport's top edge to that message's top edge. Non-negative in the
   * ordinary case; negative when the runner had scrolled past the last message's top.
   */
  offset: number
}

/** One message's position in *document* coordinates: `rect.top + window.scrollY`. */
export interface ScrollAnchorRow {
  messageId: string
  top: number
}

export interface ScrollGeometry {
  /** `document.documentElement.scrollHeight`. */
  scrollHeight: number
  /** `window.innerHeight`. */
  clientHeight: number
}

export interface RestoreInput {
  mark: ChatScrollMark
  /**
   * The anchor message's current top in document coordinates, or null when no element with that id
   * is in the document any more.
   */
  anchorTop: number | null
  geometry: ScrollGeometry
}

/** `<messageId>~<offset>`. The offset is rounded, because a fractional pixel is noise in a URL. */
export function encodeChatScrollMark(mark: ChatScrollMark): string {
  return `${mark.messageId}~${Math.round(mark.offset)}`
}

/**
 * Tolerant by design. A missing param, a truncated one, an id with a `~` in it, a float, a
 * hand-typed word — all of them mean "no mark", which means "start where you normally would".
 */
export function decodeChatScrollMark(raw: string | null | undefined): ChatScrollMark | null {
  if (raw == null) return null
  const separator = raw.lastIndexOf('~')
  if (separator <= 0 || separator === raw.length - 1) return null

  const messageId = raw.slice(0, separator)
  const offsetText = raw.slice(separator + 1)

  // `nina_messages.id` is nanoid-shaped (lib/id.ts) or the action's own id; either way it is short
  // and URL-safe. Anything with a slash, a space or a percent in it did not come from us.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(messageId)) return null
  if (!/^-?\d{1,6}$/.test(offsetText)) return null

  const offset = Number(offsetText)
  if (!Number.isFinite(offset)) return null
  if (Math.abs(offset) > MAX_CHAT_SCROLL_OFFSET_PX) return null

  return { messageId, offset }
}

/**
 * Which message to remember, given where the reader is.
 *
 * The topmost message whose top edge is at or below the viewport's top edge — so the offset is
 * non-negative and small, and the message the runner was reading is the one that comes back to the
 * same place. When the reader is below every message's top (the ordinary "scrolled to the bottom of
 * a long last bubble" case) the last row wins and the offset goes negative, which restores just as
 * exactly.
 *
 * `rows` must be in document order; the DOM produces them that way and sorting here would hide a
 * caller bug.
 */
export function pickScrollAnchor(
  rows: readonly ScrollAnchorRow[],
  scrollTop: number,
): ChatScrollMark | null {
  if (rows.length === 0) return null

  for (const row of rows) {
    if (row.top >= scrollTop) return { messageId: row.messageId, offset: row.top - scrollTop }
  }

  const last = rows[rows.length - 1]
  if (last == null) return null
  return { messageId: last.messageId, offset: last.top - scrollTop }
}

/** The furthest the document can be scrolled. Never negative — a short page clamps to 0. */
export function clampScrollTop(top: number, geometry: ScrollGeometry): number {
  const max = Math.max(0, geometry.scrollHeight - geometry.clientHeight)
  if (!Number.isFinite(top)) return 0
  return Math.min(Math.max(0, top), max)
}

/**
 * The one number the effect needs, or null for "I cannot honour this mark — do the ordinary thing".
 *
 * Null on a missing anchor, and **only** on a missing anchor. Everything else is arithmetic: the
 * anchor's current document position, minus the offset it had, clamped into the document. A
 * conversation that grew while the runner was away therefore still lands on the message they left,
 * with the new messages below them — which is the right answer to both halves of R14 at once.
 */
export function resolveRestoreTop(input: RestoreInput): number | null {
  if (input.anchorTop == null) return null
  return clampScrollTop(input.anchorTop - input.mark.offset, input.geometry)
}
```

**Impact:** none on its own — a new leaf module with no importers until Step 6.

---

### Step 2: `lib/nina/scroll.test.ts` — the restoration rule, proven

**File:** `lib/nina/scroll.test.ts` (new)
**Change:** the whole file. Style follows `lib/photos/gallery.test.ts`, the precedent this
extraction is modelled on.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  CHAT_SCROLL_PARAM,
  clampScrollTop,
  decodeChatScrollMark,
  encodeChatScrollMark,
  MAX_CHAT_SCROLL_OFFSET_PX,
  pickScrollAnchor,
  resolveRestoreTop,
  type ScrollAnchorRow,
} from './scroll'

/**
 * R14's arithmetic. The DOM half — reading `getBoundingClientRect`, calling `window.scrollTo`,
 * writing the history entry — is deliberately not here: this suite runs under
 * `environment: 'node'` (invariant 6), so there is no `window` to fake and faking one would prove
 * nothing about Safari. What IS proven is the rule that decides the number, which is the part that
 * can be wrong in a way nobody notices until the phone.
 */

const ROWS: ScrollAnchorRow[] = [
  { messageId: 'm1', top: 0 },
  { messageId: 'm2', top: 200 },
  { messageId: 'm3', top: 480 },
  { messageId: 'm4', top: 900 },
]

const GEOMETRY = { scrollHeight: 2000, clientHeight: 800 }

describe('the param', () => {
  it('is the one the URL and the reader agree on', () => {
    expect(CHAT_SCROLL_PARAM).toBe('at')
  })
})

describe('encodeChatScrollMark', () => {
  it('joins the id and the offset with a tilde', () => {
    expect(encodeChatScrollMark({ messageId: 'abc123', offset: 42 })).toBe('abc123~42')
  })

  it('rounds a fractional offset — a subpixel in a URL is noise', () => {
    expect(encodeChatScrollMark({ messageId: 'abc123', offset: 41.6 })).toBe('abc123~42')
  })

  it('keeps a negative offset, which is a real position', () => {
    expect(encodeChatScrollMark({ messageId: 'abc123', offset: -137 })).toBe('abc123~-137')
  })

  it('round-trips through the decoder', () => {
    const mark = { messageId: 'Xy_9-Z', offset: -12 }
    expect(decodeChatScrollMark(encodeChatScrollMark(mark))).toEqual(mark)
  })
})

describe('decodeChatScrollMark', () => {
  it('reads a well-formed mark', () => {
    expect(decodeChatScrollMark('abc123~250')).toEqual({ messageId: 'abc123', offset: 250 })
  })

  it('reads a negative offset', () => {
    expect(decodeChatScrollMark('abc123~-250')).toEqual({ messageId: 'abc123', offset: -250 })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['no separator', 'abc123'],
    ['nothing before the separator', '~250'],
    ['nothing after the separator', 'abc123~'],
    ['a non-numeric offset', 'abc123~soon'],
    ['a fractional offset', 'abc123~250.5'],
    ['an id with a slash', 'a/b~250'],
    ['an id with a space', 'a b~250'],
    ['a percent-encoded id', 'a%2Fb~250'],
  ])('treats %s as no mark', (_label, raw) => {
    expect(decodeChatScrollMark(raw)).toBeNull()
  })

  it('refuses an offset past the sanity bound rather than clamping it', () => {
    expect(decodeChatScrollMark(`abc123~${MAX_CHAT_SCROLL_OFFSET_PX + 1}`)).toBeNull()
    expect(decodeChatScrollMark(`abc123~-${MAX_CHAT_SCROLL_OFFSET_PX + 1}`)).toBeNull()
  })

  it('accepts the bound itself', () => {
    expect(decodeChatScrollMark(`abc123~${MAX_CHAT_SCROLL_OFFSET_PX}`)).toEqual({
      messageId: 'abc123',
      offset: MAX_CHAT_SCROLL_OFFSET_PX,
    })
  })

  it('splits on the LAST tilde, so an id may never lose its tail silently', () => {
    // 'a~b' is not a legal id, so this is a rejection rather than a mangled parse.
    expect(decodeChatScrollMark('a~b~250')).toBeNull()
  })
})

describe('pickScrollAnchor', () => {
  it('picks the topmost message at or below the viewport top', () => {
    expect(pickScrollAnchor(ROWS, 200)).toEqual({ messageId: 'm2', offset: 0 })
  })

  it('records how far below the top edge that message sat', () => {
    expect(pickScrollAnchor(ROWS, 150)).toEqual({ messageId: 'm2', offset: 50 })
  })

  it('at the very top of the document, picks the first message', () => {
    expect(pickScrollAnchor(ROWS, 0)).toEqual({ messageId: 'm1', offset: 0 })
  })

  it('below every message top, picks the last one with a negative offset', () => {
    expect(pickScrollAnchor(ROWS, 1000)).toEqual({ messageId: 'm4', offset: -100 })
  })

  it('is null with nothing rendered', () => {
    expect(pickScrollAnchor([], 0)).toBeNull()
  })
})

describe('clampScrollTop', () => {
  it('leaves a position inside the document alone', () => {
    expect(clampScrollTop(400, GEOMETRY)).toBe(400)
  })

  it('clamps past the bottom to the last scrollable pixel', () => {
    expect(clampScrollTop(5000, GEOMETRY)).toBe(1200)
  })

  it('clamps a negative position to the top', () => {
    expect(clampScrollTop(-40, GEOMETRY)).toBe(0)
  })

  it('is 0 when the document does not scroll at all', () => {
    expect(clampScrollTop(300, { scrollHeight: 600, clientHeight: 800 })).toBe(0)
  })

  it('is 0 for a non-finite input rather than propagating NaN into scrollTo', () => {
    expect(clampScrollTop(Number.NaN, GEOMETRY)).toBe(0)
  })
})

describe('resolveRestoreTop', () => {
  it('re-derives the pixel from where the anchor is NOW', () => {
    // Left with m3 50px below the top edge; m3 has since moved down 300px.
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm3', offset: 50 },
        anchorTop: 780,
        geometry: GEOMETRY,
      }),
    ).toBe(730)
  })

  it('reproduces the exact position when nothing moved', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm3', offset: 50 },
        anchorTop: 480,
        geometry: GEOMETRY,
      }),
    ).toBe(430)
  })

  it('honours a negative offset', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm4', offset: -100 },
        anchorTop: 900,
        geometry: GEOMETRY,
      }),
    ).toBe(1000)
  })

  it('clamps into a document that shrank', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm4', offset: 0 },
        anchorTop: 1900,
        geometry: GEOMETRY,
      }),
    ).toBe(1200)
  })

  it('is null when the anchor message is gone — the caller then does the ordinary thing', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'gone', offset: 50 },
        anchorTop: null,
        geometry: GEOMETRY,
      }),
    ).toBeNull()
  })

  it('never returns the bottom of the document just because the mark was odd', () => {
    // The regression this whole phase exists to prevent: a restore that silently means "newest".
    const top = resolveRestoreTop({
      mark: { messageId: 'm1', offset: 0 },
      anchorTop: 0,
      geometry: GEOMETRY,
    })
    expect(top).toBe(0)
    expect(top).not.toBe(GEOMETRY.scrollHeight - GEOMETRY.clientHeight)
  })
})
```

**Impact:** `npm test` gains ~35 assertions and no runtime dependency.

---

### Step 3: `lib/db/queries.ts` — one scoped read for the cards

**File:** `lib/db/queries.ts` — append at the end of the file (after `getActiveShareForRun`,
currently the last export; the file is 1866 lines).
**Change:** one `userId`-scoped read that returns just the seven columns a card needs, for a batch
of run ids. Not `getRunDetail` in a loop: a conversation can hold dozens of attachments and
`getRunDetail` is four statements *per run* (its own docstring calls itself "the only sanctioned way
to read a run with its children" — a card has no children).

**Code:**

```ts
/**
 * The card summary for runs attached to Nina messages (F33 R13). One statement, `inArray`, scoped
 * to the owner like every read in this file except `getRunByShareToken`.
 *
 * **Draft-visible, and `reviewedAt` is returned rather than filtered.** `/r/[id]` renders a run
 * whatever its review state, so an unreviewed run can be on screen when the attach button is; the
 * *caller* decides what to do about that, and both callers do the same thing — refuse to attach an
 * unreviewed run, because Nina's facts come from the reviewed history (D16) and a run she cannot
 * see is a card she cannot talk about. Returning the column instead of filtering on it keeps that
 * decision in one place and makes the refusal explicit rather than an empty result.
 *
 * No `orderBy`: the caller indexes the rows by id and looks them up per message.
 */
export interface RunAttachmentRow {
  id: string
  occurredOn: string
  location: string | null
  activityType: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
  reviewedAt: Date | null
}

export async function listRunAttachments(
  userId: string,
  runIds: readonly string[],
): Promise<RunAttachmentRow[]> {
  if (runIds.length === 0) return []

  return db
    .select({
      id: runs.id,
      occurredOn: runs.occurredOn,
      location: runs.location,
      activityType: runs.activityType,
      distanceM: runs.distanceM,
      durationSec: runs.durationSec,
      avgPaceSec: runs.avgPaceSec,
      reviewedAt: runs.reviewedAt,
    })
    .from(runs)
    .where(and(eq(runs.userId, userId), inArray(runs.id, [...runIds])))
}
```

`and`, `eq` and `inArray` are already imported at `lib/db/queries.ts:1-16`; `runs` is already in
the schema import block. Nothing else in the file changes.

**Impact:** one new export. `ci:data-layer-guard` is satisfied by construction — the read is
`userId`-scoped, and the guard's rule 2 only ever cared about `getRunByShareToken` being the single
unscoped read.

---

### Step 4: `lib/nina/attach.ts` — the row becomes display-ready strings, once

**File:** `lib/nina/attach.ts` (new)
**Change:** the whole module. Every string the card renders is produced here, on the server, by
`lib/format.ts`. This is invariant 3 / R-23 and it is also what keeps `ci:f08-guard` green: the
guard fails any component that puts a number next to `km`, `bpm`, `kcal` or `spm`, and the card
never does because it never sees a number.

**Code:**

```ts
import { formatDay, formatDistanceM, formatDuration, formatPace } from '@/lib/format'

/**
 * A run, as it appears inside a chat bubble (R13) and above the composer while it is pinned.
 *
 * ── WHY DISPLAY-READY STRINGS AND NOT THE ROW ─────────────────────────────────────────────────
 * The card must show the same numbers `/r/[id]` shows, spelled the same way — invariant 3, and the
 * failure it prevents is the one R-42 records: a second place that formats a distance is a second
 * place that can disagree about `10.67 km`. So the mapping happens on the server, through
 * `lib/format.ts`, and the client component receives sentences. It also means `RunAttachmentCard`
 * needs no formatter import at all, which is what makes it trivially f08-guard-clean.
 *
 * ── WHY `RunAttachmentInput` IS DECLARED HERE ─────────────────────────────────────────────────
 * Structural, not imported from `lib/db`. Phase 2 draws the same boundary with `NinaRunInput`: the
 * pure module states what it needs, and the query happens to return something assignable to it. A
 * column rename is then a compile error at one call site rather than a change to this file.
 */
export interface RunAttachmentInput {
  id: string
  /** `runs.occurred_on`, `'YYYY-MM-DD'`, the Asia/Jakarta calendar day (D6). */
  occurredOn: string
  location: string | null
  activityType: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
}

export interface RunAttachment {
  /** The run to open. `/r/${runId}`. */
  runId: string
  /** `'Thu, 20 Aug 2026'`. */
  day: string
  /** `'Outdoor Run'` — what the run page's hero label says. */
  activityType: string
  location: string | null
  /** `'10.67 km'`. */
  distance: string
  /** `'1:02:33'`. */
  duration: string
  /** `'5:02 /km'` — with the unit, because on a card there is no column header to carry it. */
  pace: string
}

/** The query parameter that arms the composer: `/nina?attach=<runId>`. */
export const ATTACH_PARAM = 'attach'

export function toRunAttachment(row: RunAttachmentInput): RunAttachment {
  return {
    runId: row.id,
    day: formatDay(row.occurredOn),
    activityType: row.activityType,
    location: row.location,
    distance: formatDistanceM(row.distanceM),
    duration: formatDuration(row.durationSec),
    pace: formatPace(row.avgPaceSec, true),
  }
}

/**
 * `runId -> attachment`, for the one pass `app/nina/page.tsx` makes over the conversation. A Map
 * rather than an array so a message with an attachment is O(1) and a message without one costs
 * nothing.
 */
export function indexAttachments(
  rows: readonly RunAttachmentInput[],
): Map<string, RunAttachment> {
  const index = new Map<string, RunAttachment>()
  for (const row of rows) index.set(row.id, toRunAttachment(row))
  return index
}
```

**Impact:** none until Step 5 imports it.

---

### Step 5: `lib/nina/attach.test.ts`

**File:** `lib/nina/attach.test.ts` (new)

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { formatDay } from '@/lib/format'
import { indexAttachments, toRunAttachment, type RunAttachmentInput } from './attach'

const ROW: RunAttachmentInput = {
  id: 'run_abc123',
  occurredOn: '2026-08-20',
  location: 'Senayan',
  activityType: 'Outdoor Run',
  distanceM: 10670,
  durationSec: 3753,
  avgPaceSec: 352,
}

describe('toRunAttachment', () => {
  it('spells every measurement through lib/format', () => {
    expect(toRunAttachment(ROW)).toEqual({
      runId: 'run_abc123',
      day: formatDay('2026-08-20'),
      activityType: 'Outdoor Run',
      location: 'Senayan',
      distance: '10.67 km',
      duration: '1:02:33',
      pace: '5:52 /km',
    })
  })

  it('keeps a missing location as null rather than an em dash', () => {
    // The card decides how to render an absence; a formatter that invents '—' would put a rendered
    // string outside lib/format.ts.
    expect(toRunAttachment({ ...ROW, location: null }).location).toBeNull()
  })
})

describe('indexAttachments', () => {
  it('keys by run id', () => {
    const index = indexAttachments([ROW, { ...ROW, id: 'run_def456' }])
    expect([...index.keys()]).toEqual(['run_abc123', 'run_def456'])
    expect(index.get('run_abc123')?.distance).toBe('10.67 km')
  })

  it('is empty for no rows', () => {
    expect(indexAttachments([]).size).toBe(0)
  })
})
```

**On the literal expectations:** `distance`, `duration` and `pace` are asserted against
`lib/format.ts`'s actual output — run the suite and take the values it prints if any of these three
differ, because `lib/format.ts` is the authority and this test is downstream of it. The `day`
assertion deliberately calls `formatDay` rather than hardcoding `'Thu, 20 Aug 2026'`: this test's
job is to prove the mapper routes the field through the formatter, not to re-assert the formatter's
own locale, which `lib/format.test.ts` already owns.

**Impact:** `npm test` gains four cases.

---

### Step 6: `app/r/[id]/page.tsx` — the icon

**File:** `app/r/[id]/page.tsx:150-159` (the header's right-hand action group)
**Change:** one `<Link>` added after `<ShareButton />`. Two new imports at the top:
`ATTACH_PARAM` from `@/lib/nina/attach`. Nothing else on this page moves — not the fetch block, not
the metrics, not the share panels.

**Code** — the replacement for the `<div className="flex items-baseline gap-4">` block at `:150-159`:

```tsx
        <div className="flex items-baseline gap-4">
          {/* F05's post-review correction path — the only way into it, so it must survive here. */}
          <Link href={`/r/${id}/edit`} className="text-[13px] font-semibold text-accent">
            Correct
          </Link>
          {/* F11's slot, now filled. The URL is passed in so a run that is ALREADY shared reaches
              `navigator.share()` synchronously inside the tap — no mint round trip, no Safari
              transient-activation problem. See ShareButton's own note on why that matters. */}
          <ShareButton runId={run.id} url={shareLink} />
          {/*
            F33 R13 — "share a run to nina". The one icon in this app's chrome, and the argument for
            it is in the phase plan: there is no honest word for this tap. It does not ask her
            anything yet; it hands her the run and leaves the question to the composer.

            A plain `<Link>`, so this stays a server component: the chat screen reads `?attach=` and
            does the loading. No action, no state, no `'use client'` — and therefore nothing new for
            `ci:f11-guard` (which polices what the PUBLIC route may name) or `ci:f08-guard` (which
            polices hand-rolled units; there is not a number in here) to object to.

            ONLY FOR A REVIEWED RUN. `InsightTrigger` above takes the same gate
            (`enabled={run.reviewedAt != null}`) for the same reason: Nina's facts come from the
            reviewed history (D16), so an unreviewed run is one she cannot see. Offering the icon
            anyway would hand her a card she has no facts for, which is the one thing R-17's honesty
            rule forbids. A draft run's route to Nina is the review flow, which is one tap away
            under "Correct".

            `self-center` because the row is `items-baseline` and an icon has no baseline worth
            aligning; `-m-1 p-1` grows the touch target past the 20px glyph without moving the row.
          */}
          {run.reviewedAt != null && (
            <Link
              href={`/nina?${ATTACH_PARAM}=${run.id}`}
              aria-label="Attach this run to a message for Nina"
              title="Attach this run to a message for Nina"
              className="-m-1 inline-flex self-center p-1 text-accent"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path
                  d="M21 3 3 10.4l7.2 2.6 2.6 7.2L21 3Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="m10.2 13 3.4-3.4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
          )}
        </div>
```

The import line, added to the existing block (alphabetically it sits after `@/lib/metrics` and
before `@/lib/share/origin`):

```tsx
import { ATTACH_PARAM } from '@/lib/nina/attach'
```

**Impact:** one new element on `/r/[id]`, present only for reviewed runs. `Link` is already
imported at `:1`. No new client bundle: `lib/nina/attach.ts` imports only `lib/format.ts`, and this
page pulls in the constant, not the mapper.

---

### Step 7: `components/nina/useChatScroll.ts` — the thin DOM half

**File:** `components/nina/useChatScroll.ts` (new)
**Change:** the whole module. Everything here is a DOM read, a DOM write, or a history call; every
*decision* is delegated to `lib/nina/scroll.ts`. That split is invariant 6's requirement and the
reason the interesting half is testable.

**Code:**

```ts
'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import {
  CHAT_SCROLL_PARAM,
  decodeChatScrollMark,
  encodeChatScrollMark,
  pickScrollAnchor,
  type ChatScrollMark,
  type ScrollAnchorRow,
} from '@/lib/nina/scroll'

/**
 * R14's DOM half. Two jobs, and not one line of arithmetic between them.
 *
 * ── READING THE ANCHORS ───────────────────────────────────────────────────────────────────────
 * Phase 4 put `id={`nina-msg-${message.id}`}` on every `<li>` in `MessageBubble` and left it
 * unused. That attribute is the whole reason this phase does not need a ref registry, a context, or
 * an observer: `document.querySelectorAll('[id^="nina-msg-"]')` returns the rendered messages in
 * document order, which is exactly `pickScrollAnchor`'s input contract.
 *
 * ── WRITING THE MARK ──────────────────────────────────────────────────────────────────────────
 * `window.history.replaceState`, the F24 idiom (`components/ui/usePanelParam.ts`): a
 * `URLSearchParams` copy of the current query so a future parameter on `/nina` survives, `null`
 * state so Next's patched history keeps its own `__NA` marker, and REPLACE rather than push —
 * pushing here would cost the runner an extra back-swipe to leave the chat and would put a second
 * `/nina` entry between them and the run they are about to open.
 */

/** `[id^="nina-msg-"]` in document order, in document coordinates. */
export function readAnchorRows(): ScrollAnchorRow[] {
  const nodes = document.querySelectorAll<HTMLElement>('[id^="nina-msg-"]')
  const scrollY = window.scrollY
  const rows: ScrollAnchorRow[] = []
  for (const node of nodes) {
    rows.push({
      messageId: node.id.slice('nina-msg-'.length),
      top: node.getBoundingClientRect().top + scrollY,
    })
  }
  return rows
}

export function useChatScrollMark(): {
  /** The mark on this history entry, or null. Decoded once per render of the URL. */
  mark: ChatScrollMark | null
  /** Measure now and write the mark onto this entry. Call it as the runner leaves. */
  saveMark: () => void
} {
  const searchParams = useSearchParams()
  const raw = searchParams.get(CHAT_SCROLL_PARAM)

  const mark = useMemo(() => decodeChatScrollMark(raw), [raw])

  const saveMark = useCallback(() => {
    const next = pickScrollAnchor(readAnchorRows(), window.scrollY)
    const params = new URLSearchParams(window.location.search)
    if (next === null) params.delete(CHAT_SCROLL_PARAM)
    else params.set(CHAT_SCROLL_PARAM, encodeChatScrollMark(next))
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])

  return { mark, saveMark }
}
```

**Impact:** none until Steps 8 and 11 use it. Note it reads `window.location.search` rather than the
`searchParams` snapshot inside `saveMark`: the write must be against whatever the URL is at the
moment of the tap, and a stale render closure is the classic way that goes wrong.

---

### Step 8: `components/nina/RunAttachmentCard.tsx` — the card, and the tap that leaves

**File:** `components/nina/RunAttachmentCard.tsx` (new)
**Change:** the whole module.

**Code:**

```tsx
'use client'

import Link from 'next/link'

import type { RunAttachment } from '@/lib/nina/attach'
import { useChatScrollMark } from './useChatScroll'

/**
 * A run, inside the bubble that attached it (R13), and the door to it (R14).
 *
 * ── THE INSET SURFACE IS `bg-ink-3/20` (RULING E1), AND WHY THAT ANSWERS PHASE 4'S FLAG ───────
 * `MessageBubble`'s docstring warns that the pattern for a nested block — "`rounded-field
 * bg-paper-2 p-3.5`" — inverts wrongly on his `bg-ink` bubble, and hands the problem here. The
 * answer is `bg-ink-3/20`, and it is *verified* rather than argued: `app/globals.css` sets
 * `--ink-3: #93a2b0` in light (`:29`) and `#7c8d9b` in dark (`:70`), so the token is a mid-grey in
 * **both** schemes. One class therefore reads correctly on both sides of the bubble — a soft grey
 * veil over `--card` on hers and over `--ink` on his — with no branch on `role`, no `data-[role=…]`
 * variant plumbing and no new token. Four phases need this same inset (6, 7, 8 and 13), so it is
 * one shared class or it is four slightly different ones.
 *
 * The runner-up was this plan's own proposal, and the reasoning still holds as far as it goes:
 * derive the veil from the bubble's own text colour instead of naming a surface token, because
 * `bg-current/10` is 10% of `--card` on his ink bubble (a light inset on dark) and 10% of `--ink`
 * on hers (a soft grey inset on white), in both colour schemes, with contrast guaranteed because
 * the text inherits `currentColor` so the card can never end up dark-on-dark. It loses on exactly
 * the ground this plan itself named: arbitrary-opacity support on `bg-current` is **unverified** in
 * this Tailwind setup — it was this phase's own open question — and an unverified mechanism must
 * not be the shared answer for four phases. `ink-3/20` buys the same "correct on both sides"
 * guarantee by a route that can be read off a file.
 *
 * No border and no shadow: "no borders on surfaces" is a hard rule, and a shadow inside a bubble
 * that already has one reads as a mistake.
 *
 * ── WHY THE MARK IS SAVED IN `onNavigate` ─────────────────────────────────────────────────────
 * `onNavigate` is Link's documented navigation-lifecycle hook (the preserving-UI-state guide uses
 * it to close a dropdown "immediately when a navigation link is clicked"), so it fires on a real
 * navigation and not on a modified click the browser is going to handle itself — a middle-click or
 * a cmd-click opens a new tab, leaves this history entry alone, and must not rewrite its URL.
 * `onClick` would fire for those too.
 *
 * ── ONE `<Link>`, PREFETCHED LIKE ANY OTHER ───────────────────────────────────────────────────
 * `/r/[id]` is a dynamic route with no `loading.tsx`, so per the linking guide "prefetching is
 * skipped, or the route is partially prefetched if loading.tsx is present" — there is nothing to
 * turn off here and nothing to tune. The run page's own two indexed reads are what make the tap
 * feel immediate, and they already do on every other link into it (`RunDateLink`, the runs list).
 */
export function RunAttachmentCard({ attachment }: { attachment: RunAttachment }) {
  const { saveMark } = useChatScrollMark()

  return (
    <Link
      href={`/r/${attachment.runId}`}
      onNavigate={saveMark}
      className="mb-2 block rounded-field bg-ink-3/20 p-3"
    >
      <span className="block text-[11px] font-semibold tracking-[0.04em] uppercase opacity-70">
        {[attachment.day, attachment.location].filter(Boolean).join(' · ')}
      </span>
      <span className="mt-1 block text-[15px] font-bold">{attachment.distance}</span>
      <span className="mt-0.5 block text-[12px] font-medium opacity-70">
        {[attachment.duration, attachment.pace].join(' · ')}
      </span>
    </Link>
  )
}
```

**Impact:** none until Step 11 fills the slot. `bg-ink-3/20` is the inset surface every phase in
this set uses (ruling E1), so this card, phase 6's image block, phase 7's quote stub and phase 13's
album inset are one visual thing rather than four. `mb-2` lives on the card rather than in the slot
wrapper so an attachment-only bubble needs no wrapper at all (see the combined-shape note in the
contract).

---

### Step 9: `components/nina/AttachmentChip.tsx` — the pinned run, above the composer

**File:** `components/nina/AttachmentChip.tsx` (new)
**Change:** the whole module. No `'use client'` of its own — it takes a callback and renders, so it
compiles into whichever graph imports it (`Composer`, which is already a client component). Same
reasoning as `MessageBubble`.

**Code:**

```tsx
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
 * ── WHY THE CLEAR BUTTON IS AN X AND THIS ONE IS NOT AN ARGUMENT ──────────────────────────────
 * Removing a pinned attachment is the one gesture on this screen that is universal. It is also
 * `aria-label`led, like the attach icon, so it is named for anyone who cannot see it.
 *
 * The run is NOT a link here. Tapping it should not throw the runner off a message they are in the
 * middle of writing — and if they want to look at the run again, they were just on it.
 */
export function AttachmentChip({
  attachment,
  onClear,
}: {
  attachment: RunAttachment
  onClear: () => void
}) {
  return (
    <div className="mx-auto flex max-w-[470px] items-center gap-3 px-5 pt-3">
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
        className="grid size-9 shrink-0 place-items-center rounded-pill text-ink-3 active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
```

**Impact:** none until Step 12 renders it.

---

### Step 10: `components/nina/types.ts` — `ChatMessage` carries its attachment

**File:** `components/nina/types.ts` — inside the `ChatMessage` interface (phase 4's Step 7 wrote
it; the interface is the last declaration in the file).
**Change:** one field, and one import.

**Code** — the complete replacement for the interface plus the new import at the top of the file:

```ts
import type { RunAttachment } from '@/lib/nina/attach'

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
   * The run this message attached (F33 R13), display-ready, or null/absent for the ordinary
   * message. `attachment.runId` **is** `nina_messages.run_id` — this field replaces the bare
   * `runId` phase 4's handoff note anticipated, because the card needs the run's numbers and those
   * must be formatted by `lib/format.ts` on the server (invariant 3), never in the bubble.
   */
  attachment?: RunAttachment | null
}
```

`ChatRole` and `ChatMessageState` above it are untouched. So is phase 6's
`imageUrls?: readonly string[]` — plural, its field, declared by its commit; this phase only reads
it in Step 11's `above` guard. Per ruling E2b, phase 7's speculative `imageUrl?: string | null` and
`runId?: string | null` declarations have been deleted from phase 7's plan, so **this phase is the
sole declarer of `attachment`** and there is no duplicate-field reconciliation left to do here.

**Impact:** additive and optional, so every existing construction of a `ChatMessage` still compiles.

---

### Step 11: `components/nina/MessageList.tsx` — the card in the bubble, and the mount that does not jump

**File:** `components/nina/MessageList.tsx` (phase 4's Step 8) — the props block, one new layout
effect above the existing scroll effect, one guard inside it, and the `MessageBubble` call.
**Change:** five small edits — the props block, the restore layout effect, the guard inside the
existing auto-scroll effect, the `above` branch on the `MessageBubble` call, and one boolean inside
phase 7's quote candidate. The docstring, the sampling effect and `groupIntoDays` are untouched.

**Code** — the new imports:

```tsx
import { useEffect, useLayoutEffect, useRef } from 'react'

import { resolveRestoreTop, type ChatScrollMark } from '@/lib/nina/scroll'
import { RunAttachmentCard } from './RunAttachmentCard'
import { readAnchorRows } from './useChatScroll'
```

**Code** — the props block gains one prop:

```tsx
export function MessageList({
  messages,
  typing,
  todayISO,
  keyboardOverlapPx,
  restoreMark,
}: {
  messages: readonly ChatMessage[]
  /** True while a turn is in flight, and between bubbles of a staggered reveal. */
  typing: boolean
  /** Computed on the server so "Today" cannot disagree between render and hydration. */
  todayISO: string
  /** Changes when the software keyboard opens or closes; a reason to re-check the scroll. */
  keyboardOverlapPx: number
  /**
   * R14. The position this history entry was left at, or null. **When it is honoured, the mount's
   * jump-to-newest is skipped** — that jump is `decideAutoScroll`'s correct answer for arriving at
   * a conversation and the wrong answer for coming back to one.
   */
  restoreMark: ChatScrollMark | null
}) {
```

**Code** — the restore, inserted immediately after the `readerNearBottom` sampling effect and
before the auto-scroll effect:

```tsx
  /**
   * Did we honour the mark? `null` = not decided yet, `true` = we scrolled, `false` = there was no
   * mark or its anchor is gone. Read by the effect below, which must not jump to the newest message
   * on a mount we already positioned.
   *
   * A LAYOUT effect, unlike everything else on this screen: it runs before the browser paints, so
   * the runner never sees the bottom of the conversation flash past on the way to where they were.
   * The `requestAnimationFrame` re-application is not belt-and-braces — a web font settling or
   * phase 6's images finishing decode moves the anchor after layout, and re-deriving the same pure
   * number from the anchor's new position is the entire reason the mark stores a message and an
   * offset instead of a pixel.
   */
  const restoredRef = useRef<boolean | null>(null)

  useLayoutEffect(() => {
    if (restoreMark === null) {
      restoredRef.current = false
      return
    }

    const apply = (): boolean => {
      const anchor = readAnchorRows().find((row) => row.messageId === restoreMark.messageId)
      const top = resolveRestoreTop({
        mark: restoreMark,
        anchorTop: anchor?.top ?? null,
        geometry: {
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight,
        },
      })
      if (top === null) return false
      window.scrollTo({ top, behavior: 'instant' })
      return true
    }

    restoredRef.current = apply()
    if (restoredRef.current !== true) return

    const frame = window.requestAnimationFrame(() => {
      apply()
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [restoreMark])
```

**Code** — the guard inside the existing auto-scroll effect. It goes immediately after the
bookkeeping block (`mounted.current = true` … `if (cause === null) return`) and before
`decideAutoScroll`:

```tsx
    mounted.current = true
    lastCount.current = messages.length
    lastTyping.current = typing
    lastOverlap.current = keyboardOverlapPx
    if (cause === null) return

    /*
     * R14. The layout effect above already put this screen where the runner left it, so the mount's
     * jump to the newest message must not run. Only 'mount' is suppressed: a bubble arriving after
     * the restore, or the keyboard opening, is a live event and still moves the page under phase
     * 4's rules. `isNearBottom` is re-sampled because the restore moved us without firing a scroll
     * event the sampler could see.
     */
    if (cause === 'mount' && restoredRef.current === true) {
      readerNearBottom.current = isNearBottom({
        scrollTop: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
      })
      return
    }

    const decision = decideAutoScroll({
```

**Code** — the bubble call inside the day loop:

```tsx
          <ul className="mt-3 space-y-2">
            {day.messages.map((m, index) => (
              <MessageBubble
                key={m.id}
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
            ))}
          </ul>
```

This is ruling E2's expression, adopted verbatim. `MessageList` owns it; phase 6 shipped the
images-only branch and **this phase widens it to the two-branch stack** — the `m.attachment` line
and the `||` in the guard are the whole of phase 8's edit here. The `quote` prop and `resolveQuote`
are phase 7's and already present; the quote is **not** in `above` (that was this plan's original
proposal and it lost — see the *Interface Contract*), so there is no `replyTo` branch to write and
no nesting to unpick. Each inset keeps its own `mb-2` — that is the gap to the message *text*
below the slot, and it is what lets a single-block `above` render with no wrapper at all — while
the wrapper's `space-y-2` is the gap *between* the blocks when there are two.

**Code** — one field inside phase 7's quote-candidate construction (ruling E2b). `resolveQuote`
builds a `QuoteCandidate` for `quoteMediaOf`, and because phase 7 lands *before* this phase it
cannot name `RunAttachment`; it takes a boolean the caller computes and phase 7 hard-codes `false`.
This phase flips it:

```tsx
    const candidate = {
      // …phase 7's other candidate fields…
      hasImage: (target.imageUrls?.length ?? 0) > 0,   // phase 6
      hasRun: target.attachment != null,               // phase 8 — was `false`
    }
```

That one line is what makes phase 7's `You · Run` stub label light up, and it is the whole of the
coupling: **`lib/nina/reply.ts` is not edited by this phase.** `quoteMediaOf` already keeps both
`'photo'` and `'run'` in `QuoteMedia`, with the run path shipped reachable-but-unreached; no type
crosses backwards from a later phase, which is the entire reason it is a boolean and not a
`RunAttachment`.

**Impact:** `MessageList` gains a required prop, so `ChatScreen` (Step 13) must pass it — the
compiler enforces the pairing. The mount behaviour for a runner arriving with no mark is byte-for-
byte phase 4's.

> **Settled (ruling E2).** The reply quote does **not** occupy `above` — phase 7 gave it its own
> `quote` prop on `MessageBubble` precisely so the two would not compete for one slot, and
> `MessageBubble` renders `quote` above `above`. `MessageList` owns the `above` expression, phase 6
> shipped its images-only branch, and this step widens it. Final order in the bubble: quote stub →
> images → run card → text.

---

### Step 12: `components/nina/Composer.tsx` — a text-free send is valid

**File:** `components/nina/Composer.tsx` (phase 4's Step 9) — the props block, `canSend`, `submit`,
the placeholder, and one element above the input row.
**Change:** R13's *"or not include any text at all"*, made true in the one place that can refuse it.

**Code** — the new import:

```tsx
import type { RunAttachment } from '@/lib/nina/attach'
import { AttachmentChip } from './AttachmentChip'
```

**Code** — the props block and the two lines under it:

```tsx
export function Composer({
  onSend,
  busy,
  bottomCss,
  attachment,
  onClearAttachment,
}: {
  onSend: (body: string) => void
  /** A turn is in flight. The box stays editable; only sending is held. */
  busy: boolean
  /** From `composerBottomCss`. A CSS length, because `var(--safe-bottom)` is CSS-only. */
  bottomCss: string
  /**
   * The run pinned to the next message (F33 R13), or null. **Its presence is what makes an empty
   * message sendable**: "then user can ask something, or not include any text at all, then nina
   * will respond accordingly." A bare `Send` with nothing at all is still refused — that is a
   * mis-tap, not a message.
   *
   * This is the client half of ruling B1's ONE refusal rule, and it must stay the same predicate
   * as the server's: `body.trim() === '' && !hasAttachment`, where `hasAttachment` is
   * `imageTickets.length > 0` (phase 6) `|| runId != null` (this phase) `|| attachExisting != null`
   * (phase 13). Adding a clause on one side only produces an enabled Send button that silently
   * refuses — the exact bug the single-rule ruling exists to prevent. `replyToMessageId` is
   * deliberately not a clause on either side: a quote with no words is not a message.
   */
  attachment: RunAttachment | null
  /** Unpin it. `ChatScreen` owns the state; this only reports the tap. */
  onClearAttachment: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)
  // `|| attachment !== null` is THIS phase's clause. Phase 6's image clause is already in the
  // disjunction when this lands; do not rewrite it, add to it. Mirrors the server rule exactly.
  const canSend = (value.trim().length > 0 || attachment !== null) && !busy
```

**Code** — `submit`, unchanged except that it may now legitimately send an empty string:

```tsx
  function submit() {
    if (!canSend) return
    // May be '' when a run is pinned and the runner said nothing. `ChatScreen` decides what that
    // means; the composer's only job is to stop refusing it.
    onSend(value.trim())
    setValue('')
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      // Keep the keyboard up. He is going to type again — that is what a conversation is.
      el.focus()
    }
  }
```

**Code** — the chip, and the placeholder. The chip sits inside the fixed container, above the input
row, so the blur and the border belong to one piece of chrome:

```tsx
  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
      style={{ bottom: bottomCss }}
    >
      {attachment !== null && (
        <AttachmentChip attachment={attachment} onClear={onClearAttachment} />
      )}
      <div className="mx-auto flex max-w-[470px] items-end gap-2 px-5 py-3">
        {/* Phases 6 and 8 add `size-11` icon buttons to the left of the textarea, in this row.
            Phase 8 added none: its button is on `app/r/[id]/page.tsx`, because you attach the run
            you are looking at, not one you have to go and find from here. */}
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
             * Enter sends; Shift+Enter is a newline. `enterKeyHint="send"` relabels the iOS return
             * key so the phone agrees with the behaviour. `isComposing` is the guard that keeps an
             * IME's own Enter — committing a candidate — from firing the message half-typed.
             */
            if (event.key !== 'Enter' || event.shiftKey) return
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            submit()
          }}
          enterKeyHint="send"
          placeholder={attachment === null ? 'Message Nina' : 'Add a note, or just send it'}
          aria-label="Message Nina"
          className={cn(
            'max-h-[132px] min-h-11 w-full resize-none rounded-field bg-card px-4 py-2.5',
            'text-base font-medium text-ink outline-none',
            'placeholder:font-medium placeholder:text-ink-3',
            'focus-visible:ring-2 focus-visible:ring-accent',
          )}
        />
```

The send `<button>` below it is unchanged — `disabled={!canSend}` now enables on a pinned run alone,
which is the whole point. `aria-label` on the textarea stays `"Message Nina"` so the field's
accessible name does not change under the runner mid-message; the placeholder is the hint.

**Impact:** `Composer` gains two required props. `ChatScreen` is its only caller.

---

### Step 13: `components/nina/ChatScreen.tsx` — the pending attachment, and the runId on the wire

**File:** `components/nina/ChatScreen.tsx` (phase 4's Step 10) — the imports, the props, one new
state, one new layout effect, `handleSend`, and the render.
**Change:** the screen owns the pinned run from mount to send.

**Code** — the new imports:

```tsx
import { useLayoutEffect } from 'react'

import { ATTACH_PARAM, type RunAttachment } from '@/lib/nina/attach'
import { useChatScrollMark } from './useChatScroll'
```

**Code** — the props block, the state, and the URL cleanup:

```tsx
export function ChatScreen({
  initial,
  todayISO,
  pending,
}: {
  /** The stored conversation, oldest first, mapped on the server. */
  initial: readonly ChatMessage[]
  /** From the server, so "Today" cannot differ between render and hydration. */
  todayISO: string
  /**
   * The run `/r/[id]`'s icon just handed over (F33 R13), resolved and formatted on the server from
   * `?attach=<runId>`, or null. It becomes composer state immediately — see the cleanup below.
   */
  pending: RunAttachment | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
  const [attachment, setAttachment] = useState<RunAttachment | null>(pending)

  // R14's mark on this history entry, decoded from `?at=`. Passed down; the arithmetic is in
  // `lib/nina/scroll.ts` and the DOM half is in `MessageList`.
  const { mark } = useChatScrollMark()

  /*
   * **`?attach=` is consumed, not left lying on the entry.** It has done its job the moment it is
   * in state, and leaving it would re-arm the composer on the way back: send the message, tap its
   * card, come back with the back-swipe, and the POP would re-render this page from a URL still
   * asking for the same run — pinning a run the runner already sent. `replaceState` on a
   * `URLSearchParams` copy so R14's `at` (which may be written onto this same entry later, or may
   * already be on it) survives untouched. The F24 idiom, and the reason it is `replace`: this entry
   * is where we already are.
   */
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(ATTACH_PARAM)) return
    params.delete(ATTACH_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])
```

**Code** — the complete `handleSend`:

```tsx
  const handleSend = useCallback(
    async (body: string) => {
      if (busy) return
      // R13's floor: a message with neither words nor a run is a mis-tap. The composer already
      // refuses it; this is the guard that means the action can trust its own input.
      if (body.length === 0 && attachment === null) return

      const sending = attachment
      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      setNotice(null)
      setMessages((current) => [
        ...current,
        { id: localId, role: 'user', body, dayISO, state: 'sending', attachment: sending },
      ])
      /*
       * Unpinned the moment it joins the conversation, even though the send may still fail. The
       * failed bubble keeps its card — that is where the run is now — and showing the chip as well
       * would put the same run on screen twice and invite a second send of it.
       */
      setAttachment(null)
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({ body, runId: sending?.runId ?? null })
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

      // Adopt the server's id for the runner's own row, so phase 7 can quote it and phase 8 can
      // anchor to it. Until this point it carried a client-minted `local-` id.
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
        // The indicator stays up while there is another thought coming, and drops with the last.
        setTyping(index < bubbles.length - 1)
        setMessages((current) => [
          ...current,
          {
            id: bubble.id,
            role: 'nina',
            body: bubble.body,
            dayISO: todayInJakarta(),
            state: 'sent',
          },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy, attachment],
  )
```

**The `local-…` id and R14, spelled out because it is a real edge:** a message whose send is still
in flight has a client-minted id, so a mark naming it would not resolve after a reload — and the
restore falls back to the bottom, correctly, because `resolveRestoreTop` returns null for an anchor
that is not in the document. Once the action answers, the row carries the server id and the anchor
is durable. No special case is needed; it is worth knowing why.

**One deliberate change to phase 4's code:** `setNotice(result.unavailable ? 'no-reply' : 'no-reply')`
is collapsed to `setNotice('no-reply')`. Phase 4's own note invites this ("If a reviewer prefers it
collapsed to `setNotice('no-reply')`, collapse it — it is a comment written as code").

**Code** — the render:

```tsx
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
          restoreMark={mark}
        />
      )}

      {notice !== null && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">{NOTICE_TEXT[notice]}</p>
      )}

      {/* The spoken half of the typing indicator. The dots themselves are `aria-hidden`. */}
      <p className="sr-only" role="status" aria-live="polite">
        {typing ? 'Nina is typing' : ''}
      </p>

      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        attachment={attachment}
        onClearAttachment={() => setAttachment(null)}
      />
    </>
  )
}
```

**Impact:** one new required prop from the page. The empty-conversation branch still renders the
composer (it always did — it is outside the ternary), so a first-ever message can carry a run.

---

### Step 14: `app/nina/page.tsx` — resolve `?attach=`, and load the cards

**File:** `app/nina/page.tsx` (phase 4's Step 11) — the imports, the signature, and the body.
**Change:** the page gains `searchParams`, one conditional query, and two mappings. It still awaits
**no model call** — invariant 4 and `ci:llm-payload-guard` are untouched, because everything added
here is an indexed read.

> **`export const maxDuration = 60` is already in this file — do NOT add it again** (ruling C7).
> It landed in **phase 4**, which owns the line and its comment, because a Server Action's timeout
> is the page segment's and without it `sendNinaMessage`'s 45 s budget is fiction. This phase edits
> the same file and must leave that export alone; a second declaration is a duplicate-identifier
> build error, and phase 3's old handoff asking for it is now a record that it landed in phase 4.

**Code** — the new imports:

```tsx
import { listRunAttachments } from '@/lib/db/queries'
import { ATTACH_PARAM, indexAttachments, type RunAttachment } from '@/lib/nina/attach'
import { isValidId } from '@/lib/id'
```

**Code** — the complete replacement for `NinaPage`:

```tsx
/**
 * How much conversation the screen renders. Deliberately unrelated to RU-14's 40-message *prompt*
 * window: what Nina is given to read and what the runner can scroll back through are two different
 * questions, and conflating them would either starve the screen or bloat the payload.
 */
const CHAT_HISTORY_LIMIT = 200

export default async function NinaPage({ searchParams }: PageProps<'/nina'>) {
  const userId = await requireUserId()
  const { [ATTACH_PARAM]: attachParam } = await searchParams
  const rows = await listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT })

  /*
   * F33 R13/R14. Two things need run rows: the cards inside bubbles that already have a `run_id`,
   * and the run `/r/[id]` just handed over on `?attach=`. Both are the same shape, so they are ONE
   * query — `listRunAttachments` takes the union of the ids and the two lookups below read out of
   * the same Map. Never `getRunDetail` per message: that is four statements a card has no use for.
   */
  const requested = typeof attachParam === 'string' && isValidId(attachParam) ? attachParam : null
  const attachedIds = new Set<string>()
  for (const row of rows) if (row.runId != null) attachedIds.add(row.runId)
  if (requested !== null) attachedIds.add(requested)

  const runRows = await listRunAttachments(userId, [...attachedIds])
  const attachments = indexAttachments(runRows)

  /*
   * The pending run must be REVIEWED, for the reason `/r/[id]`'s icon is only rendered for a
   * reviewed run: Nina's facts come from the reviewed history (D16), so pinning a draft would
   * promise an answer she cannot give. Unreachable through the UI and enforced anyway, because a
   * URL is not a UI. `listRunAttachments` is owner-scoped, so someone else's run id resolves to
   * nothing here and the composer simply opens empty.
   */
  const pendingRow = requested === null ? null : runRows.find((row) => row.id === requested)
  const pending: RunAttachment | null =
    pendingRow != null && pendingRow.reviewedAt != null
      ? (attachments.get(pendingRow.id) ?? null)
      : null

  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
    attachment: row.runId == null ? null : (attachments.get(row.runId) ?? null),
  }))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        <NinaAvatar size="md" />
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen initial={initial} todayISO={todayInJakarta()} pending={pending} />
    </AppShell>
  )
}
```

**Two notes, both now settled.** (1) `row.body` / `row.createdAt` are **correct and final** —
ruling A1 fixes `lib/nina/queries.ts`'s DTO as `body` / `createdAt` in every function, with the
columns' `text` / `sent_at` and phase 2's `MessageInput { text, sentAt }` living on the other two
layers and `lib/nina/gateway.ts` as the single mapper between them. Nothing in this step needs
touching, and nobody may "fix" the spelling here to match a column. (2) `row.runId` is on
`NinaMessageRow` — phase 1 owns `listNinaMessages` and every read selects the same `messageColumns`,
so there is no missing-select case to patch and certainly none to patch from this phase.

**Impact:** `/nina` goes from one query to two. The second is skipped entirely — `listRunAttachments`
returns `[]` before touching the database — for a conversation with no attachments and no `?attach=`,
which is every conversation until this phase is used.

---

### Step 15: `lib/nina/actions.ts` — `runId` on the action, validated and persisted

**File:** `lib/nina/actions.ts` (phase 3's Step 7) — the signature, the refusal rule, the insert,
and the `runNinaTurn` call. Everything else in the file, including the reply-to re-check and the
bubble mapping, is untouched.
**Change:** four edits, each small, and one new import.

**Code** — the new import (alongside the existing ones):

```ts
import { isValidId } from '@/lib/id'
```

**Code** — the signature and the refusal rule. This replaces the block from `export async function
sendNinaMessage` down to the `if (text.length === 0 …) return REFUSED` line:

```ts
export async function sendNinaMessage(input: {
  body: string
  /** phase 6 — signed describe tickets for images already in Blob. Already here. */
  imageTickets?: readonly string[]
  /** phase 7 — a `nina_messages.id` this message answers. Already here. */
  replyToMessageId?: string | null
  /**
   * F33 R13. The run `/r/[id]`'s icon attached to this message, or null/absent. It is written to
   * `nina_messages.run_id` and it is what makes an EMPTY `body` a legitimate send: "user can ask
   * something, or not include any text at all, then nina will respond accordingly."
   *
   * **This is the ONE field this phase adds** (ruling B1). `imageTickets` and `replyToMessageId`
   * above are phases 6 and 7, already landed; `attachExisting` arrives with phase 13. One object,
   * four commits, one optional field each.
   */
  runId?: string | null
}): Promise<SendNinaMessageResult> {
  const userId = await requireUserId()

  const text = typeof input?.body === 'string' ? input.body.trim() : ''
  /*
   * Shape only, here. Whether this run is one Nina can actually see is decided after the history
   * loads (step 3 below) — asking the database twice for the same rows to answer it earlier would
   * be a round trip bought for nothing.
   */
  const runId =
    typeof input?.runId === 'string' && isValidId(input.runId) ? input.runId : null

  /*
   * Both refusals are silent by design. An empty send is a stray Enter key, and an oversized one
   * is a paste of a whole article — neither is worth a persisted row or a 45 s model call, and
   * neither is an error the runner needs explained. The framework's own 1 MB action-body cap sits
   * behind this as the backstop.
   *
   * **An empty body with a run attached is NOT empty**: handing her a run without a question is a
   * message, and R13 says so in as many words. An empty body with no run and no image still is.
   *
   * The rule is ruling B1's, and it is monotone: phase 3 shipped `text.length === 0` alone, phase 6
   * added the tickets clause, **this phase adds `runId != null` and nothing else**, phase 13 adds
   * `attachExisting != null`. Step 12's `canSend` is the client half of exactly this predicate; if
   * the two ever disagree the runner gets an enabled Send button that silently does nothing.
   */
  const hasAttachment =
    (input.imageTickets?.length ?? 0) > 0 ||   // phase 6
    runId != null                              // phase 8 — THIS PHASE'S CLAUSE
  if (text.length === 0 && !hasAttachment) return REFUSED
  if (text.length > MAX_RUNNER_MESSAGE_CHARS) return REFUSED
```

**Code** — the insert. `run_id` is written on his row and nowhere else in the turn. The writer is
phase 1's batch `insertNinaMessages`, and the field names are the DTO's — `body`, not `text`; **no
`seq`**, because `nina_messages.seq` is a `bigserial` Postgres assigns (rulings A1 and A2b):

```ts
  /* STEP 1 — his message, first. See the header. One row, so a one-element batch. */
  let runnerMessage: NinaMessageRow
  try {
    const [row] = await insertNinaMessages(userId, [
      { role: 'runner', body: text, source: 'chat', runId },
    ])
    if (row == null) throw new Error('no row returned')
    runnerMessage = row
  } catch (cause) {
    console.warn('[nina] could not persist the runner message', { error: String(cause) })
    return REFUSED
  }
```

The only line this phase changes in that block is `runId` on the insert object; the batch call, the
`body` spelling and the absent `seq` are phase 3's as reconciled, not this phase's edit. Downstream,
`runnerMessage.id` and `runnerMessage.createdAt` are the DTO's spellings (**not** `sentAt` — that
name belongs to the column and to phase 2's `MessageInput`; see the boundary note in *Requires*).

**Code** — the turn call:

```ts
  /* STEP 3 — the turn. 13–45 s. Never throws for a model problem. */
  const result = await runNinaTurn({
    userId,
    context,
    history,
    sourceMessageId: runnerMessage.id,
    runnerText: text.length > 0 ? text : null,
    /*
     * The facts half of R13. `turn.ts` resolves this id against the history it has ALREADY loaded
     * and calls `buildNinaRunFact` — the same function `handleLookupRuns` calls, with the same
     * arguments. There is no second facts path and no extra query; an id that is not in the
     * reviewed history resolves to nothing and the turn proceeds without it (invariant 2, D16).
     */
    attachedRunId: runId,
  })
```

`runnerText: text.length > 0 ? text : null` is the one behavioural subtlety: `userTurnText` already
skips an empty `runnerText`, and passing `''` rather than `null` would leave a `HE JUST SAID:`
heading with nothing under it — a prompt that reads as a truncation. Null is what a bare attachment
actually is, and Step 16's block says so in words.

**Impact:** the action's parameter object gains one optional field — `runId` — and one clause on the
refusal rule. **Ruling B1 honoured this phase's request: there is ONE signature, and phase 7's
`replyToMessageId?: string | null` is already on it when this phase lands** (phase 6's
`imageTickets?` likewise, phase 13's `attachExisting?` after). The final signature and the final
refusal rule are printed in the *Interface Contract*; this step adds only the `runId` line of each.
The `ok: false` cases are unchanged in shape, so phase 4's failure copy still applies. `SentBubble`'s
`replyToId` is phase 7's edit to this same file, not this one's.

---

### Step 16: `lib/nina/turn.ts` — the attached run becomes precomputed facts

**File:** `lib/nina/turn.ts` (phase 3's turn engine) — `NinaTurnInput`, and `userTurnText`.
**Change:** one optional field, one resolver, one prompt block. **`runNinaTurn`'s loop, budget,
repair path, tool set and request envelope are untouched** — in particular `thinking: { type:
'disabled' }` stays exactly where it is (F31, measured).

**Code** — the field on `NinaTurnInput` (inserted after `imageDescriptions`):

```ts
  /**
   * **F33 R13.** The run the runner attached to this message, by id. Resolved against `history`
   * and rendered into the user turn as a `NinaRunFact` — *precomputed facts, invariant 2*, from
   * `buildNinaRunFact`, the same function `handleLookupRuns` uses. An id that is not in the
   * reviewed history (a draft, a deleted run, someone else's) is silently absent: she is never
   * told about a run she has no facts for, because that is how she ends up inventing one.
   */
  attachedRunId?: string | null
```

**Code** — the resolver, a module-local function placed immediately above `userTurnText`:

```ts
/**
 * The attached run's facts, or null. **One `find` over an array the turn already holds** — the
 * whole reviewed history is loaded once per turn by `loadRunHistory`, so an attachment costs zero
 * additional round trips, and `buildNinaRunFact` is called with the same `(run, today)` arguments
 * `handleLookupRuns` calls it with. Two routes to the same facts, one implementation of them.
 */
function attachedRunFact(input: NinaTurnInput): NinaRunFact | null {
  const runId = input.attachedRunId
  if (runId == null) return null
  const run = input.history.runs.find((candidate) => candidate.runId === runId)
  if (run == null) return null
  return buildNinaRunFact(run, input.context.today)
}
```

**Code** — the complete replacement for `userTurnText`:

```ts
/**
 * The user turn. One JSON block of facts, then what he said — the same order and the same framing
 * `narrate.ts` uses (`Analyse this ${scope}.\n\n${json}`), because that is the shape this endpoint
 * has been measured against.
 */
function userTurnText(input: NinaTurnInput): string {
  const parts: string[] = [
    'CONTEXT — every fact you are allowed to state is in here. Nothing outside it is real.',
    JSON.stringify(visibleContext(input.context), null, 2),
  ]

  if (input.imageDescriptions != null && input.imageDescriptions.length > 0) {
    parts.push(
      'HE SENT ' +
        (input.imageDescriptions.length === 1 ? 'AN IMAGE' : 'IMAGES') +
        '. This is what is in ' +
        (input.imageDescriptions.length === 1 ? 'it' : 'them') +
        ' — react to the picture, never to this description as a description:',
      input.imageDescriptions.map((description) => `- ${description}`).join('\n'),
    )
  }

  /*
   * R13. The attached run goes in ABOVE what he said, because it is the subject of what he said —
   * and when he said nothing at all, it is the entire message. The facts are the same precomputed
   * `NinaRunFact` shape `lookup_runs` answers with, so she needs no new instruction about how to
   * read them; the only new instruction is what an attachment MEANS, which the second sentence
   * gives her. No `lookup_runs` call is needed for this run, and saying so saves a tool round.
   */
  const attached = attachedRunFact(input)
  if (attached != null) {
    parts.push(
      'HE ATTACHED THIS RUN TO HIS MESSAGE. These are its facts — you already have them, so do ' +
        'not call lookup_runs for this date:',
      JSON.stringify(attached, null, 2),
      input.runnerText == null || input.runnerText.length === 0
        ? 'HE SENT IT WITH NO MESSAGE. That is him showing you the run and waiting for your take. ' +
          'Give it — react to this specific run, not to running in general.'
        : 'His message below is about this run unless he plainly says otherwise.',
    )
  }

  if (input.runnerText != null && input.runnerText.length > 0) {
    parts.push('HE JUST SAID:', input.runnerText)
  }

  if (input.proactive != null && input.proactive.length > 0) {
    parts.push('NOBODY SAID ANYTHING. You are starting this. ' + input.proactive)
  }

  return parts.join('\n\n')
}
```

**Code** — the import `turn.ts` needs (added to its existing `./context` import):

```ts
import { buildNinaRunFact, type NinaRunFact } from './context'
```

**Impact:** the user turn grows by one `NinaRunFact` (~500 tokens) only when a run is attached.
`NINA_MAX_TOKENS` and the budget are unchanged — this is input, and R-19's "do not stint on burning
tokens" is the standing instruction on exactly this trade.

**The two `runId`s — settled (ruling B2). Both fields exist.** Phase 10's
`NinaTurnOptions.runId` is *"written to `nina_messages.run_id` on every row this turn persists"*.
That is a different field with a different job from `NinaTurnInput.attachedRunId`, which is *read*,
resolved through `buildNinaRunFact` and rendered into the prompt — never written. Neither is a
rename of the other and neither may be collapsed into it. For
a chat attachment only `attachedRunId` is set — his own row already carries the column, written by
the action in Step 15, and Nina's reply rows deliberately do **not** carry it: the reply is not an
attachment, and stamping it would put a card on every bubble of a four-bubble answer.

---

### Step 17: `lib/nina/turn.test.ts` — one case for the facts path

**File:** `lib/nina/turn.test.ts` (phase 3's suite) — one added `it`, in whichever `describe`
covers the request body. It uses phase 3's own `fakeToolGateway` / `runHistoryFixture` and its
recording fake client; no new fixture is introduced.

**Code:**

```ts
  it('puts the attached run’s precomputed facts in the user turn and asks for no lookup', async () => {
    const history = runHistoryFixture()
    const attached = history.runs[0]
    expect(attached).toBeDefined()

    const client = recordingClient([sendResponse(['Kenceng juga itu.'])])
    await runNinaTurnWith(
      {
        userId: 'u1',
        context: ninaFixtureInput(),
        history,
        sourceMessageId: 'm1',
        runnerText: null,
        attachedRunId: attached!.runId,
      },
      depsWith(client, fakeToolGateway(history)),
    )

    const userTurn = client.calls[0]?.messages[0]?.content ?? ''
    expect(userTurn).toContain('HE ATTACHED THIS RUN TO HIS MESSAGE')
    expect(userTurn).toContain('do not call lookup_runs')
    expect(userTurn).toContain('HE SENT IT WITH NO MESSAGE')
    // The facts are buildNinaRunFact's, not a re-spelling: the run's own id is in the block.
    expect(userTurn).toContain(attached!.runId)
    // And an empty runnerText produces no dangling heading.
    expect(userTurn).not.toContain('HE JUST SAID:')
  })
```

**Adapt the three helper names** (`recordingClient`, `sendResponse`, `depsWith`) to whatever phase
3's suite actually calls them — the assertions are the point, and they are on the *user turn's text*,
which is the only place invariant 2 can be verified without a live model.

**Impact:** one case. If phase 3's fixture history is empty, seed it with its own run fixture rather
than inventing one here.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint
```

`format` first: `prettier-plugin-tailwindcss` sorts the class strings this phase writes, and
hand-ordered classes failing `format:check` in review is noise.

**Tests:**

```
npm test
npm run ci:f08-guard && npm run ci:f11-guard
npm run ci:llm-payload-guard && npm run ci:data-layer-guard && npm run ci:client-secret-guard
```

Why each guard, specifically:

- **`ci:f08-guard`** — the phase edits `app/r/[id]/page.tsx` and adds two components that render
  measurements. Rule 3 fails any file outside `lib/format.ts` that puts a value next to `km`,
  `kcal`, `bpm` or `spm`, or that names `Intl.NumberFormat`. `RunAttachmentCard` and
  `AttachmentChip` render **strings produced in `lib/nina/attach.ts` by `lib/format.ts`** and never
  see a number, which is why they pass by construction rather than by luck. Rules 1 and 2 (recharts,
  `yAxisId`) are untouched: nothing here imports a chart.
- **`ci:f11-guard`** — the same page is F11's owner-side screen. The guard's rule 3 asserts the
  three owner components stay out of `app/(public)/s/[token]/*`, and rules 2/4 forbid the public
  route from naming `resolveHrMax`, the Tanaka constants, analytics, `@/lib/metrics`,
  `@/lib/share/copy` or `requireUserId`. This phase adds nothing to the public route and removes
  nothing from the owner one — the new `<Link>` sits next to `ShareButton`, inside the
  authenticated tree, and imports one constant from `lib/nina/attach.ts`.
- **`ci:llm-payload-guard`** — `lib/nina/turn.ts` and `lib/nina/actions.ts` are both edited. The
  turn entry point stays the single guarded symbol and `lib/nina/actions.ts` stays its sanctioned
  caller; `app/nina/page.tsx` still awaits only `requireUserId`, `listNinaMessages` and
  `listRunAttachments`, so invariant 4 (no model call in a render path) holds.
- **`ci:data-layer-guard`** — one new read in `lib/db/queries.ts`. It is `userId`-scoped, so
  `getRunByShareToken` remains the only unscoped read.
- **`ci:client-secret-guard`** — three new client modules. None imports `lib/env.ts` or anything
  under `lib/db`.

**Manual check** — the round trip, on a phone or in Safari's responsive mode, because R14 is a
gesture and no unit test can see it:

1. Open a **reviewed** run. The paper-plane icon is in the header next to Share; on an unreviewed
   run it is absent.
2. Tap it. `/nina` opens with the run pinned above the composer and the send button **enabled with
   the text box empty**. The URL shows no `?attach=` (Step 13 consumed it).
3. Send with no text. The bubble carries the run's card. Nina answers about **that** run —
   check the reply names its distance or its day, and check `nina_turns.tool_calls` for the turn is
   empty or does not contain `lookup_runs`, which is the observable form of "from precomputed
   facts".
4. Scroll up into the middle of the conversation. Tap an attached run's card. The URL of the chat
   entry becomes `/nina?at=<id>~<offset>` and `/r/<id>` opens at the top.
5. **Back-swipe from the left edge of the screen.** The chat returns at the same place — the same
   message under your thumb, not the newest one at the bottom.
6. Repeat 4-5 twice more to confirm the entry survives the round trip, then tap the Nina tab from
   another screen: that lands at the newest message, as it always did.
7. Send a message while a run is pinned and the network is off: the bubble goes to the `failed`
   ring **with its card**, and the chip is gone rather than duplicating it.

**Exit criteria:**

- A reviewed run is attachable from `/r/[id]` by an icon-only control, with or without typed text.
- The message persists `nina_messages.run_id`, and the card renders from it on the next page load
  as well as optimistically.
- Nina's answer is built from `buildNinaRunFact` — the same facts function `lookup_runs` uses, no
  second path, no extra query.
- Tapping a card opens `/r/<id>`; the back-swipe restores the exact prior scroll position.
- The restoration rule is unit-tested in `lib/nina/scroll.test.ts` under `environment: 'node'`.
- `npm run ci:f11-guard` and `npm run ci:f08-guard` both pass with `app/r/[id]/page.tsx` modified.

---

## Handoffs

- **Phase 7 (reply-to) — settled, recorded.** The quote is **not** in `above`: phase 7 gives it its
  own `quote` prop on `MessageBubble`, deliberately, and `MessageBubble` renders `quote` above
  `above`, so the two never competed for a slot. `MessageList` owns the `above` expression; phase 6
  ships the images-only branch and this phase widens it to the two-branch stack printed in the
  *Interface Contract*. Final order in the bubble: quote stub → images → run card → text. And this
  phase **wires one field of phase 7's**: because phase 7 lands first it cannot name
  `RunAttachment`, so its `quoteMediaOf` reads a `hasRun: boolean` that `MessageList` computes and
  phase 7 hard-codes `false`; Step 11 passes `hasRun: m.attachment != null`, which is what makes
  phase 7's `You · Run` stub label light up. **`lib/nina/reply.ts` itself is never edited by this
  phase** — only the caller changes. On the action: `replyToMessageId?` and `runId?` are two
  optional fields on **one** object (ruling B1), and phase 7 also owns `SentBubble.replyToId`.
- **Phase 6 (images) — second occupant of `above`** (the quote left the slot for its own prop), and
  the reason `RunAttachmentCard` carries its own `mb-2`: a stack needs no wrapper margin if each
  block owns its bottom edge, and a one-block `above` then needs no wrapper at all. Phase 6 should
  also know that **a decoding image moves R14's anchor**, which is why the restore re-applies on the
  next frame (Step 11); if images turn out to land later than one frame, the fix is an
  `onLoad`-driven re-application of the *same* pure function, not new arithmetic. Both phases render
  their inset on `bg-ink-3/20` (ruling E1), so the stack reads as one thing.
- **Phase 10 (proactive).** Its `run_committed` message writes `nina_messages.run_id` too, which
  means it gets a card in the bubble for free — `app/nina/page.tsx` (Step 14) resolves the column
  for *every* row regardless of who wrote it. Phase 10 needs no rendering work for that, and no
  per-side check either: the card's inset is **`bg-ink-3/20`** (ruling E1), and `--ink-3` is a
  mid-grey in both colour schemes, so the card reads correctly under **either** party's bubble with
  no branch on `role`. That is the whole reason the token was chosen over deriving the veil from
  `currentColor`. Phase 10 should also note ruling B2: its `NinaTurnOptions.runId` (the id written
  to `nina_messages.run_id` on every persisted row) and this phase's `NinaTurnInput.attachedRunId`
  (the id resolved through `buildNinaRunFact` into the prompt) are **different fields and both
  exist** — for a `run_committed` message they need not carry the same value.
- **The same restoration, for `/me` and `/`.** `RunDateLink` (`/me`'s panels) and the runs list have
  the identical round trip and today have the identical jump-to-top on return. `lib/nina/scroll.ts`
  is deliberately generic — nothing in it mentions Nina except its folder — and the anchor selector
  is the only chat-specific line. **Left alone on purpose**: F24 §"Known and accepted" already
  documents `/me`'s back behaviour, and changing it is a separate card with its own device testing.
  If it is ever done, the module should move to `lib/scroll/anchor.ts` and take the selector as an
  argument.
- **`docs/plans/F33-*.md` and `ROADMAP_v0.1.0.md` — ADOPTED with one amendment (ruling D2).**
  Neither is edited here, and the reason stands: two phases writing the same roadmap section in
  parallel is a guaranteed conflict, so **phase 1 owns every `ROADMAP_v0.1.0.md` amendment** and no
  other phase touches it. The amendment is to the F33 doc: **phase 1 creates
  `docs/plans/F33-nina.md` as a pointer stub** — what F33 is, the sixteen phases, and a link to
  `NINA_CHATBOT_PLAN.md` — so every later reader has a place to look instead of a dangling
  reference. What remains a single card at the end of the set is the **retrospective** write-up,
  exactly as this phase proposed, rather than sixteen appends to one file.
- **A `loading.tsx` for `/nina`.** Still absent, still deliberate (phase 4's handoff). Note for
  whoever revisits it that a Suspense boundary over the chat would change what "mount" means for
  Step 11's layout effect — the restore must run after the real list renders, not after a skeleton.

---

## Decisions on the open items

Decided, not parked. The common thread is that **the plan as written depends on none of these
answers** — the mechanism section settled R14 from doc sentences and a verified config, so every
item below is an alternative that was considered and declined, and each carries the condition that
would reopen it.

1. **`useRouter().bfcacheId` — decided: NOT used. The URL-param mechanism ships.** The temptation
   was real: if the id reliably distinguished a POP from a fresh push, the mark could live in
   `sessionStorage` keyed by that id and `?at=` could go away entirely. Declined **because** the
   docs frame the field's whole contract inside Cache Components ("When `cacheComponents` is
   enabled, the App Router preserves Client Component state … Keying a component on `bfcacheId` …")
   and advise it "only as a last resort, like when migrating an existing codebase", while
   `cacheComponents` is off in this worktree; and because the installed implementation
   (`navigation.js:154-176`, `ppr-navigations.js:840-842`) is **not conclusive from reading alone**,
   which makes it an unverified mechanism carrying a requirement. The win it offered was cosmetic —
   a hidden param — not functional. *Revisit if* `cacheComponents` is ever enabled app-wide, at
   which point the question is moot in the other direction: `<Activity>` preserves the scroll
   position itself and makes this entire mechanism unnecessary.
2. **Does Next also restore document scroll on the POP back into `/nina`? — decided: ship as
   written and watch for one frame of flicker in manual check step 5.** If Next restores to the same
   value, our layout effect applies it again a moment later and nothing is visibly different; if it
   restores to a different value first, the runner may see one frame of it. Not pre-mitigated,
   because a `scrollRestoration` override written against a behaviour nobody has observed is a
   guess with a global blast radius. The mitigation, **if and only if** the flicker is actually
   observed, is `history.scrollRestoration = 'manual'` scoped to the chat screen's lifetime —
   **never** set globally, because every other screen in the app is currently correct and a global
   flag would make this phase responsible for all of them. *Revisit if* step 5 shows the flicker.
3. **`<Link onNavigate>` and the forward gesture — decided: the mark's write point is correct as
   written.** The back-swipe and its forward counterpart are history POPs, not link clicks, so
   `onNavigate` does not fire for them and there is nothing to guard. Recorded rather than dropped
   **because** `router.experimental_gesturePush` exists on this version's router instance, so the
   category "gesture that is a push" is not empty. *Revisit if* a future `<Link>` in this app ever
   opts into a gesture-driven push — then the mark must be written wherever that push originates,
   not in `onNavigate`.
4. *(Was: "is `bg-current/10` supported by this Tailwind setup?" — **deleted.** Ruling E1 makes the
   inset `bg-ink-3/20`, so `bg-current` is not used and the question has no subject. See Step 8.)*
5. **The `?at=` param is visible in the URL — decided: accepted.** This is a single-user app on a
   phone; the param is inert on a fresh load whose anchor resolves, and it degrades to the default
   screen when the anchor is gone. The precedent is the repo's own: F24 put `?panel=` on `/me` for
   the same gesture and the same reason. *Revisit if* it is ever judged ugly — the alternative is
   item 1's `sessionStorage` variant, same arithmetic, different carrier, and it becomes available
   the moment item 1's condition is met.

---

## Rollback

Phase-local and clean, because nothing here is a migration.

1. `git revert` the phase's commits, or by hand:
   - delete `lib/nina/scroll.ts`, `lib/nina/scroll.test.ts`, `lib/nina/attach.ts`,
     `lib/nina/attach.test.ts`, `components/nina/RunAttachmentCard.tsx`,
     `components/nina/AttachmentChip.tsx`, `components/nina/useChatScroll.ts`;
   - remove `listRunAttachments` + `RunAttachmentRow` from `lib/db/queries.ts`;
   - remove the `<Link>` and its import from `app/r/[id]/page.tsx`;
   - revert `app/nina/page.tsx`, `components/nina/{types,MessageList,Composer,ChatScreen}.tsx` to
     phase 4's versions, and `lib/nina/{actions,turn}.ts` to phase 3's.
2. **No schema change to undo.** `nina_messages.run_id` is phase 1's column; after this revert it is
   simply never written again, and any rows that carry it keep it harmlessly — the chat renders them
   without a card.
3. **No URL to clean up.** `?attach=` and `?at=` are read-only conveniences: a reverted app ignores
   both, and a history entry carrying one renders the ordinary screen.
4. Nina loses the attachment block from her prompt immediately; her ability to talk about any run by
   date is unaffected, because that path is `lookup_runs` and this phase never touched it.
