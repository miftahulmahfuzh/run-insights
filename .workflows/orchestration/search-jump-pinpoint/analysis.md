# Code Analysis: Search-result taps must pinpoint the bubble like a reply-to tap

**Type:** Feature Update
**Date:** 2026-09-08T14:25 (+07)
**Session ID:** 20260908-142555-A3F7
**Plan:** `SEARCH_JUMP_PINPOINT_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/search-jump-pinpoint` (branch `feature/search-jump-pinpoint`, base `HEAD` = `9db3113`)

---

## User Input

### Original User Request

> saat ini , kita punya reply to fitur dimana user bisa reply ke salah satu bubble. di chat history , kita bisa klik reply to box dan kita langsung di scroll ke bubble yang user reply to.
> buat sehingga fitur search bisa mempunyai kapabilitas yang sama. jika user klik item di search result, kita langsung masuk ke chat sessionnya, dan langsung scroll ke bubble yang di refer oleh search. buat efek yang sama dengan meng klik kotak reply to (auto scroll plus ada outline biru pada bubble yang direplied)

### User-Provided Context

None beyond the prose.

### User-Provided Files

None (`@`-marked).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Klik item di search result → masuk ke chat session terkait → langsung auto-scroll ke bubble yang direferensikan search |
| R2 | Bubble yang direferensikan mendapat outline biru — efek yang sama dengan mengklik kotak reply-to (auto scroll + outline) |

## Detailed Requirements Understanding

**Problem/Requirement Statement.** The chat has two ways to "go to a bubble" today, and they
disagree:

- **Reply-to box tap** (`QuoteStub` → `handleJumpToQuote`): scrolls with `planQuoteScroll`
  arithmetic (target centred in the band the composer leaves over), then flashes the target's
  blue ring (`ring-2 ring-accent`, held `QUOTE_FLASH_MS` = 1600 ms).
- **Search-result tap** (`NinaSearchField` → `searchHitHref`): navigates to
  `/nina?s=<session>&at=<messageId>~0`. The `?at=` mark is the R14 **restore** grammar: on mount
  `MessageList`'s layout effect puts the anchor's top edge at the viewport top. It never flashes,
  it ignores the composer band, and it is the wrong lifetime for a one-shot instruction
  (see `lib/nina/jobview.ts`'s four documented reasons why `jump` ≠ `at`).

The user asks that a search tap behave exactly like a reply-to tap: land in the session, scroll
to the bubble, blue outline. **The pinpoint mechanism already exists** — `?jump=` 
(`JOB_JUMP_PARAM`), built for `/nina/jobs/[id]`'s "Buka chat-nya" link — and it does scroll +
flash with exactly the reply-to arithmetic. The gap is that `searchHitHref` does not emit it,
and that `?jump=` is only consumed on a ChatScreen **mount**, while a search hit can arrive as
a same-session soft navigation that does not remount.

**Success Criteria.**

1. Tapping a message hit in the sidebar's search results opens `/nina?s=<sid>&jump=<mid>` and
   the screen lands with the reply-to effect: instant scroll into the readable band + blue ring
   for `QUOTE_FLASH_MS`.
2. The same happens when the hit names the session the runner already has open (soft nav, no
   remount) — today `?at=` scrolls in that case, so not handling it would be a regression.
3. The `jump` param is consumed on arrival in both paths (mount and soft nav): stripped from
   the entry by name so `?s=` and `?at=` survive, and a back-swipe never re-flashes.
4. Session-title hits (`messageId: null`) still open the session plain — no jump, no `at`.
5. A message older than `CHAT_HISTORY_LIMIT` degrades to the existing `'quote-missing'` notice
   (an honest sentence) rather than today's silent `?at=` non-restore.

**Key Considerations.**

- **Do not invent a third URL grammar.** `searchHitHref` must delegate to `ninaJumpHref`
  (`lib/nina/jobview.ts:89`), which already takes `SESSION_PARAM` as an argument.
- **`?at=` must keep its contract untouched** — it is written by `useChatScroll.saveMark` on
  exit and read on return (R14). The search stop using it changes nothing about it.
- **One-shot semantics for a soft-nav arrival is a rule, so it lives in `lib/`** and is tested
  (`vitest` is `environment: 'node'`, no jsdom — a rule in a component cannot be tested).
- The flash is the existing `transition-shadow` ring — reused, not duplicated. No new motion
  (invariant 8 territory).
- **Working-tree hazard (measured):** the primary checkout is dirty with residue from the
  landed-but-unmerged `nina-photo-refs-and-bubble-actions` set (its land commit `2c987d4` is on
  `origin/main`, which local `main` — 20 commits ahead — does not contain). Two of this
  feature's files (`lib/nina/jobview.ts`, `tests/nina.jobview.test.ts`) are among the dirty
  ones. This worktree is cut from clean `HEAD` (`9db3113`), where both files are at their
  committed state; a later reconciliation of local/origin `main` may conflict textually with
  this set's small additions to those files. Keep the additions small and appended, not
  interleaved.

## Analysis Scope

### Explicitly Mentioned Files

None. (The user named features, not files.)

### Discovered Related Files

- `lib/nina/search.ts` — `searchHitHref` (line 352): the href a search tap follows. **The seam.**
- `lib/nina/jobview.ts` — `JOB_JUMP_PARAM` (67), `parseNinaJumpParam` (75), `ninaJumpHref`
  (89); owner of the `jump` grammar and its four-reason contract.
- `components/nina/ChatScreen.tsx` — `jumpRef` (341), the consume-params layout effect
  (375–392), the landing effect (696–722), `measureQuoteScroll` (606), `flashMessage` (637),
  `handleJumpToQuote` (650), `'quote-missing'` notice (120, 136).
- `components/nina/MessageList.tsx` — the `?at=` restore consumer (layout effect, 136–166);
  `flashId` prop threading (72, 299).
- `components/nina/MessageBubble.tsx` — the flash render: `flash && 'ring-2 ring-accent'`
  (264–265); the `nina-msg-<id>` DOM anchor (239).
- `components/nina/NinaSearchField.tsx` — renders `hit.href` in a `<Link>` (236–239); no change
  needed (the href changes underneath it).
- `lib/nina/scroll.ts` — `decodeChatScrollMark`, `resolveRestoreTop` (the `at=` half; untouched).
- `components/nina/useChatScroll.ts` — `useChatScrollMark` (the `at=` DOM half; untouched).
- `app/nina/page.tsx` — `<ChatScreen key={activeSessionId ?? 'none'}>` (486): the key that
  makes cross-session taps remount and same-session taps not.
- `lib/nina/reply.ts` — `planQuoteScroll`, `QUOTE_FLASH_MS` (322): the shared arithmetic the
  landing reuses.
- `lib/nina/search.test.ts` — the `searchHitHref` suite (258–276): asserts today's `at=…~0`
  strings; must be rewritten.
- `tests/nina.jobview.test.ts` — `ninaJumpHref` suite (19, 32): where the new pure guard's
  tests belong.

## Current Dataflow

### Entry Point 1: reply-to box tap (the effect the user wants copied)

**Location:** `components/nina/MessageBubble.tsx:269` (`QuoteStub`) → `ChatScreen.tsx:650`
**Trigger:** tap on the quote stub of a bubble.
**Chain:** `onJumpToQuote(targetId)` → `measureQuoteScroll` (606: `getElementById('nina-msg-'+id)`,
composer-band obstruction, `planQuoteScroll` from `lib/nina/reply.ts`) →
`window.scrollTo({ behavior: plan.behavior })` → `flashMessage(targetId)` (637: sets `flashId`,
clears after `QUOTE_FLASH_MS`) → `MessageList` passes `flash={message.id === flashId}` →
`MessageBubble` renders `ring-2 ring-accent` with `transition-shadow duration-300`.
**Degradation:** missing DOM anchor → `setNotice('quote-missing')` — "That message isn't on
this screen any more, so there's nowhere to jump to."

### Entry Point 2: job-page deep link (the mechanism to reuse)

**Location:** `lib/nina/jobview.ts:89` (`ninaJumpHref`) → `app/nina/page.tsx` → `ChatScreen.tsx:696`
**Trigger:** "Buka chat-nya" on `/nina/jobs/[id]`.
**Chain:** `<Link href="/nina?s=<sid>&jump=<mid>">` → server render resolves the session
(`chooseActiveSession`) → `<ChatScreen key={activeSessionId}>` **mounts** (different session ⇒
different key) → `jumpRef` initialiser reads the param from the first render's `useSearchParams`
(341) → the consume-params layout effect (375) strips `attach`/`photo`/`jump` from the entry by
name (so `?s=` and `?at=` survive) → landing effect (696) consumes `jumpRef` inside a rAF:
`measureQuoteScroll` → `scrollTo` **`'instant'`** (overriding the plan's `'smooth'` — an arrival
has no "from" to animate out of) → `flashMessage` → a second rAF re-derives the position
(font/image settle).
**One-shot reasoning (documented at 326–341):** the ref survives the param being stripped from
the URL; it is cleared inside the animation frame, not the effect body, for StrictMode.

### Entry Point 3: search-result tap (today — the thing being changed)

**Location:** `components/nina/NinaSearchField.tsx:236` → `lib/nina/search.ts:352`
**Trigger:** tap on a hit row.
**Chain today:** `<Link href={hit.href}>` where `hit.href = /nina?s=<sid>&at=<mid>~0` →
navigation → `useChatScrollMark` decodes `at` → `MessageList` layout effect (136) resolves
`resolveRestoreTop` → `window.scrollTo` `'instant'`. **No flash. No composer band. Restore
semantics on a one-shot instruction.**
**Cross-session vs same-session:** page.tsx keys ChatScreen by `activeSessionId`; a different
session remounts, the same session re-renders. `?at=` works in both (the `mark` prop is derived
per render); **`?jump=` today works only in the remount case** (`jumpRef` is a mount-only
initialiser) — the same-session case is this feature's one real gap.

### Data Persistence

None. The whole feature is URL + DOM state. (The `jump` param is deliberately *removed* from the
history entry on arrival.)

## Key Data Structures

- `NinaSearchHit.href: string` (`search.ts:297`) — built only by `searchHitHref`, consumed only
  by `NinaSearchField`'s `<Link>`.
- `ninaJumpHref({ sessionId, messageId, sessionParam })` (`jobview.ts:89`) — `URLSearchParams`,
  returns `/nina?s=…&jump=…`.
- `parseNinaJumpParam(raw): string | null` (`jobview.ts:75`) — `isValidId`-guarded.
- `ChatScrollMark { messageId, offset }` (`scroll.ts:43`) — the `at=` grammar; untouched.

## Dependencies

- `lib/id.ts` `isValidId` — bounds what a jump target may look like (nanoid-shaped ids).
- `CHAT_HISTORY_LIMIT` (messages rendered per session) — bounds which jump targets exist in the
  DOM; older hits degrade to the notice.
- `QUOTE_FLASH_MS = 1600` (`lib/nina/reply.ts:322`) — the flash duration, reused as-is.
- No DB, no env, no model. Pure client/URL work.

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `searchHitHref` | lib/nina/search.ts:352 | def | lib/nina |
| `searchHitHref` tests | lib/nina/search.test.ts:260 | test | lib/nina |
| `JOB_JUMP_PARAM` | lib/nina/jobview.ts:67 | def | lib/nina |
| `parseNinaJumpParam` | lib/nina/jobview.ts:75 | def | lib/nina |
| `ninaJumpHref` | lib/nina/jobview.ts:89 | def | lib/nina |
| `ninaJumpHref` tests | tests/nina.jobview.test.ts:32 | test | tests |
| `jumpRef` initialiser | components/nina/ChatScreen.tsx:341 | call | components |
| consume-params strip | components/nina/ChatScreen.tsx:375–392 | call | components |
| landing effect | components/nina/ChatScreen.tsx:696–722 | call | components |
| `measureQuoteScroll` | components/nina/ChatScreen.tsx:606 | def | components |
| `flashMessage` | components/nina/ChatScreen.tsx:637 | def | components |
| `'quote-missing'` notice | components/nina/ChatScreen.tsx:120,136 | def | components |
| `hit.href` render | components/nina/NinaSearchField.tsx:236 | call | components |
| `ChatScreen` key | app/nina/page.tsx:486 | config | app |
| `?at=` restore | components/nina/MessageList.tsx:136 | call (untouched) | components |

## Impact Points (files that WILL need changes)

1. `lib/nina/search.ts` — `searchHitHref` emits `ninaJumpHref(...)` for message hits; doc
   comment rewritten (the `?at=` rationale block is obsolete; degradation note changes from
   "silently opens normally" to "the `'quote-missing'` notice"). Phase 1 owns.
2. `lib/nina/search.test.ts` — the three href tests rewritten for the `jump` grammar. Phase 1.
3. `lib/nina/jobview.ts` — one new pure export: the soft-nav one-shot guard
   (prev-seen param vs current param → the id to land on, or null; reset when the param is
   absent). Phase 1. **Collision-aware: keep appended, not interleaved** (dirty-file hazard
   above).
4. `tests/nina.jobview.test.ts` — tests for that guard. Phase 1. Same hazard note.
5. `components/nina/ChatScreen.tsx` — extract the landing body (696–722) into a shared
   `landOn(targetId)` callback; keep the mount path byte-equivalent in behaviour; add a
   `useEffect` watching `searchParams.get(JOB_JUMP_PARAM)` that arms the landing for a
   same-session soft-nav arrival, strips the param from the entry by name (same idiom as
   375–392), and is guarded by the new pure function so mount never double-lands. Phase 1.

**This document describes. The plan files prescribe.**
