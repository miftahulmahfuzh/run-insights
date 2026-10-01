# Plan: Session-wide photo paging in the Nina chat overlay, with a follow-scrolling history

**Slug:** chat-session-wide-photo-swipe
**Date:** 2026-10-01 09:34:26 +0700
**Analysis:** `20261001-093426-C7K2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/chat-session-wide-photo-swipe`
**Branch:** `feature/chat-session-wide-photo-swipe` (base: `origin/main` @ `7f5e0ff`)
**Phases:** 1
**Status:** planned
**Coordinator:** —

---

## Why

The user's request, verbatim:

> in a chat session, when i full-view a photo, make it so we can swipe right / left for every other photos in that chat session . and we need to auto-scroll the chat history to follow the current viewed photo. e.g: after i swipe right 3 times, then when i exit full-view, i will see the bubble that sent this photo.

This overturns one previously-recorded decision, deliberately and only for the chat surface:
`components/nina/ChatImages.tsx`'s header says *"pages across THIS BUBBLE'S photos only … the
conversation-wide gallery is `/nina/about`'s Media section and stays there"*, and
`components/nina/MessageList.tsx:102` repeats it as "this phase's plan, D-3". The user is the author
of that constraint and has now asked for the opposite on the chat screen. `/nina/about`'s Media
section is untouched and stays what it is.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | In a chat session, the full-view photo overlay pages (swipe right / left) across **every photo in that chat session**, not just the photos of the one bubble the photo was tapped in | 1 |
| R2 | The chat history **auto-scrolls to follow the photo currently being viewed**, so exiting full-view after N swipes leaves the reader looking at the bubble that sent the photo they were last on | 1 |

## Scope

**In scope**

- `lib/nina/chatphotos.ts` — a session-wide photo list and a position lookup, as pure functions,
  plus their tests in `lib/nina/chatphotos.test.ts`
- `components/nina/usePhotoViewer.ts` — derive the overlay's list from all of `messages`
- `components/nina/ChatScreen.tsx` — the `<PhotoViewer>` call site, and R2's wiring
- `components/ui/PhotoViewer.tsx` — bound the dot row, which a session's worth of photos breaks
- `components/nina/useQuoteLanding.ts` — expose the existing bubble measurement so R2 reuses it
- a new follow-scroll hook under `components/nina/` and its happy-dom test
- `tests/nina.chatPhoto.test.ts` — re-point the structural claims at the new wiring

**Out of scope**

- `components/nina/ChatImages.tsx` and `components/nina/MessageList.tsx`. Their
  `onOpen(index)` / `onOpenImage(messageId, index)` contract is bubble-local and is already exactly
  the input the widened hook needs. `tests/nina.chatPhoto.test.ts:36` pins the literal
  `onOpenImage(message.id, index)` and that line stays true.
- `/nina/about`'s Media section and album (`NinaAboutScreen.tsx:730`) — already conversation-wide,
  already its own surface, and the user asked about the chat.
- The other six `PhotoViewer` callers: `ScreenshotStrip`, `SheetSource`, `PhotoInclusionList`,
  `ErrorLogList`, `PhotoDeepLinkScreen`. Behaviour must be unchanged for all of them.
- `lib/photos/gallery.ts` (`stepIndex`, `decideSwipe`) — the wrap and the gesture rules are already
  right for a longer list and the swipe's direction mapping was confirmed with the author.
- `lib/nina/reply.ts` (`planQuoteScroll`) — reused as-is; a second scroll rule is forbidden.
- The public shared page `app/(public)/s/[token]/page.tsx` — never a `PhotoViewer` caller.
- Any server, schema, query or LLM change. There are none on this path.
- Photographs older than the rendered window (see invariant 2).

## Invariants

1. **The tree builds and `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check`
   pass at the end of the phase.** `vitest` does not typecheck — run `npm run typecheck` explicitly.
2. **"That chat session" means the rendered window.** `app/nina/page.tsx:113` caps the screen at
   `CHAT_HISTORY_LIMIT = 200` messages of the active session; photos outside it are not in
   `messages`, have no `#nina-msg-` anchor, and cannot be scrolled to. The honest and only
   satisfiable reading of R1.
3. **The overlay's identity stays `{ messageId, index-within-that-message }`, never a stored flat
   index and never a snapshot of the photo list.** `usePhotoViewer`'s header records why: `messages`
   changes underneath an open overlay (a service-worker push's `router.refresh()`, R8's delete), and
   anything else silently re-aims at a different photograph. The flat position is **derived** every
   render; `PhotoViewer`'s `photos[index]!` must never read `undefined`.
4. **One scroll decision function.** R2 routes through `planQuoteScroll` (`lib/nina/reply.ts:439`) by
   way of `useQuoteLanding`'s existing measurement. No second set of rules about the band the
   composer leaves over.
5. **`glm-4.6v`'s private image prose never reaches a component.** No caption field on any photo type
   here, and the photo keeps `alt=""` in the grid and in the overlay.
6. **The six non-chat `PhotoViewer` callers are behaviourally identical.** Any new prop is optional
   and its absence renders exactly what shipped — the promise `label`, `meta`, `actions` and
   `headerAction` all already make.
7. **No new writer of the query string.** `tests/nina.chatPhoto.test.ts` counts the sanctioned
   `replaceState` sites; R2 scrolls the document and writes no URL.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Page the chat overlay across the session's photos, and follow them in the history | R1, R2 | `components/nina` · `lib/nina` · `components/ui` | 12 | — | HARD | `.workflows/plan/chat-session-wide-photo-swipe/phase-1.md` | — | — |

### Phase 1 — Page the chat overlay across the session's photos, and follow them in the history

**Satisfies:** R1, R2

**Owns:** the session-wide photo list and position lookup in `lib/nina/chatphotos.ts` (+ tests);
`components/nina/usePhotoViewer.ts`'s derivation and the flat-index → `{messageId, index}` mapping;
`components/nina/ChatScreen.tsx`'s `<PhotoViewer>` call site (`onIndex`, `actions`, `headerAction`)
and R2's wiring; the dot-row bound in `components/ui/PhotoViewer.tsx` (+ its test); the exposed
bubble measurement in `components/nina/useQuoteLanding.ts`; the new follow-scroll hook and its
happy-dom test; the re-pointed structural claims in `tests/nina.chatPhoto.test.ts`.

**Does not touch:** everything under **Out of scope** above.

**Exit criteria:**

- Tapping any photo in any bubble opens the overlay at that photo; the header counter reads the
  photo's position in the **session**, e.g. `7 / 23`.
- A left swipe, `ArrowRight`, or a dot advances to the chronologically next photograph in the
  session across bubble boundaries; right / `ArrowLeft` goes back; both wrap, via the existing
  `stepIndex`.
- The header name, the job-detail `headerAction`, the download and the attach control all act on the
  photograph **currently on screen**, including after the overlay has crossed into another bubble —
  so the attach id comes from the photo, not from `viewerMessage.imageIds[shownIndex]`.
- Moving to a photo owned by a different message scrolls the conversation behind the overlay to that
  message, instantly; closing therefore lands on it with no close-time special case.
- Deleting the message whose photo is on screen still closes the overlay rather than throwing, and a
  message merely losing photos still clamps (invariant 3), proven by pure-function tests.
- With more than `PHOTO_VIEWER_MAX_DOTS` photos the dot row is not drawn and the counter carries the
  position; at or below it the row is byte-identical to today.
- `npm run typecheck && npm run lint && npm run format:check && npm test` all pass.

## Reconciliation Log

single phase — nothing to reconcile

## Handoffs

Recorded by the phase planner; none of them blocks this phase.

- `viewerIndex` loses its production caller but stays exported and tested. Folding its clamp into
  `sessionPhotoIndex` is a later cleanup, not this phase's.
- `NINA_SEARCH_LIMIT`'s note and `tests/nina.avatarSearch.test.ts:119` carry a "48 is also the dot
  row length" aside that goes stale once the row is bounded. Prose only — no assertion depends on it.
- `/nina/about`'s Media section and the admin photo search get a quieter overlay for free. A
  "jump to position" affordance for a long list would be a new requirement, not a regression of this one.
- Photographs older than `CHAT_HISTORY_LIMIT = 200` stay out of reach (invariant 2); reaching them
  would need a server-side photo query, which is a different feature.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| `ChatImages`/`MessageList`'s recorded "pages across THIS BUBBLE'S photos only" (F35 phase 9, D-3) vs the user's request | Session-wide. The two comment blocks are corrected in place to say what the code now does and why it changed | 5: the user's raw input — they authored the old constraint and have now asked for its opposite |
| Does "that chat session" include photos older than the 200-message window? | No — the rendered window only | 5 + 1: nothing older is in `messages`, has an anchor, or can be scrolled to, so R2 could not hold for it |
| Store a flat session index vs keep `{messageId, index}` and derive the flat position | Keep `{messageId, index}`, derive | 1: invariant 3, which is `usePhotoViewer`'s own recorded reasoning about a list that changes underneath an open overlay |
| Follow the scroll live on every photo change vs scroll once at close | Live, instant, behind the overlay | 5: the user asked for the history to "follow the current viewed photo"; the exit behaviour in their `e.g.` then falls out instead of being a second code path. `body { overflow: hidden }` is scrollable programmatically per CSS Overflow — it is `clip` that would forbid it, and nothing sets that |
| Follow on the bubble the overlay was *opened* on, too? | No — only on a change of owning message | 6: the runner tapped that photo, so its bubble is on screen by definition; moving the page under an overlay they just opened costs the reading position for nothing |
| Flash the followed bubble, as `landOn` does? | No | 5 + 6: the user asked to *see* the bubble, not to have it highlighted; the flash is `useQuoteLanding`'s vocabulary for an arrival from elsewhere, and firing its timer on every swipe would burn out before the overlay closes |
| Dot row with a session's worth of photos | Bound it: above a threshold draw no dots, keep the `n / total` counter | 1: invariant 6 keeps every existing caller identical (3 screen kinds, ≤4 chat photos, both under any sane threshold), and an unbounded row is dozens of 2 px slivers in a no-wrap flex. `/nina/about`'s 200-photo Media gallery improves as a side effect |
| `ChatImages` / `MessageList` signature change for a session-wide index | None — keep `onOpenImage(messageId, index)` bubble-local | 1 + 6: `tests/nina.chatPhoto.test.ts:36` pins the literal, and the grid genuinely only knows its own row |

## Open Questions

None. Every fork above was decided on a stated rung.

## Rollback

One phase, one branch: `git checkout main && git branch -D feature/chat-session-wide-photo-swipe`,
or revert the single commit. Nothing persistent is written — no migration, no server action, no blob
— so there is no data to back out and no deploy ordering to respect.

## Next

Execute the phase:

    /implement -f CHAT_SESSION_WIDE_PHOTO_SWIPE_PLAN.md --phase 1

Or put it on the board first (GitHub repos only):

    /create-task --from-plan CHAT_SESSION_WIDE_PHOTO_SWIPE_PLAN.md
