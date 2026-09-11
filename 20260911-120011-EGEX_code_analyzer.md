# Code Analysis: Nina duplicate answer bubbles in prod session "gj"

**Type:** Bug Investigation
**Date:** 2026-09-11 12:00 WIB / 05:00 UTC
**Session ID:** 20260911-120011-EGEX
**Plan:** `NINA_DUP_BUBBLE_REVEAL_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-dup-bubble-reveal` — branch `feature/nina-dup-bubble-reveal` (base: `origin/main` @ `285805f`)

---

## User Input

### Original User Request

> coba cek prod session chat terbaru (nama chat session nya "gj") disitu nina ngasih jawaban duplikat , total dia harus nya jawab cuma 4 bubble, tapi 3 bubble terakhir di duplikat, jadi dia jawab total 7 bubble. please find out the root cause

### User-Provided Context

- Production session, chat named "gj" (newest session).
- Nina should have replied with 4 bubbles; the last 3 rendered twice → 7 bubbles on screen.
- Asked for the root cause (diagnostic).

### User-Provided Files

- none

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Find the root cause of Nina's duplicate answer bubbles in prod chat "gj" (4 expected, last 3 duplicated → 7 shown). Phase 1 removes the defect class the root cause identifies; the analysis document itself is R1's direct answer. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: A single Nina reply turn in production rendered 7 bubbles where the database holds exactly 4 rows. The duplication is a client-render artifact produced by an interleaving of two independent bubble-delivery channels in `ChatScreen`.

**Success Criteria**:

1. The root cause is documented with measured evidence (this document).
2. No interleaving of deliveries can render the same `nina_messages.id` twice on one screen.
3. The staggered reveal (RU-5) survives unchanged for the normal path; a refresh that lands mid-reveal may collapse the remaining stagger (cosmetic) but must never duplicate a bubble.

**Key Considerations**:

- The database is clean — nothing to migrate, no data repair.
- The fix must be client-side and idempotent on message id, independent of *which* event delivered the racing render (the trigger is not recoverable from retained telemetry — see "Trigger indeterminacy").
- `ChatScreen.tsx` is a heavily-commented, deliberate file: the fix must keep the poll-vs-merge contract's documented reasoning intact and follow the repo's pure-function-in-`lib/` testability idiom (`vitest` has no jsdom).

---

## Analysis Scope

### Explicitly Mentioned Files

- none (target inferred: the Nina chat screen and its bubble delivery paths)

### Discovered Related Files

- `components/nina/ChatScreen.tsx` — the turn client: `revealBubbles` (the blind appender), the poll loop, the `seenInitial` merge block
- `lib/nina/live.ts` — `mergeServerMessages` (server order, local content, local-only appended; id-deduped)
- `lib/nina/reveal.ts` — `planReveal` (stagger schedule; gap[0]=0, per-bubble 450–1400 ms, total ceiling 3200 ms)
- `lib/nina/actions.ts` — `pollNinaReply` (cursor = last row's `seq`), `runNinaBackgroundTurn` (atomic multi-row bubble INSERT), `startNinaBackgroundTurn`
- `lib/nina/turnflight.ts` — poll backoff (1.5 s ×6, 2.5 s ×8, 4 s), `NINA_TURN_POLL_GIVE_UP_MS`, `ninaFlightView`
- `components/nina/NinaUnreadSync.tsx` + `lib/nina/unread.ts` — the one in-code automatic `router.refresh()`
- `lib/service-worker.js` — `push` → `notifyOpenWindows` → page posts `'nina:new'` → `ChatScreen` calls `router.refresh()`
- `app/nina/page.tsx` — the page render; `after(() => markNinaMessagesRead(userId, { sessionId }))` at line 458 — **the only writer of `nina_messages.read_at` in the repo**
- `lib/db/schema.ts` — `ninaMessages` (`seq` bigserial, `role`, `session_id`, `sent_at`, `delivered_at`, `read_at`)

---

## Current Dataflow

### Entry Point: the runner presses send

**Location:** `components/nina/ChatScreen.tsx:1196` (`sendAndTrack`)
**Trigger:** composer submit → `sendNinaMessage` (Server Action) → persists his row, registers `nina_turns` claim, returns `{ userMessageId, cursor, sessionId, turnId }`.
**Client state after return:** optimistic row adopts the server id; `cursorRef.current = result.cursor` (his row's `seq`); `setAwaiting(true)` → the poll effect (`ChatScreen.tsx:1100`) starts.

### Processing Chain — her reply's two delivery channels

1. **Channel A — poll → reveal (live path).**
   - `pollNinaReply` (`lib/nina/actions.ts:1994`): three indexed reads; returns `bubbles` = her rows with `seq > afterSeq`, `cursor` = last row's `seq`, `awaiting` (live claim OR newest-row-is-his-and-fresh).
   - Client loop (`ChatScreen.tsx:1115`): waits `ninaPollDelayFor(attempts)` (1.5 s ×6 → 2.5 s ×8 → 4 s), polls, sets `cursorRef.current = result.cursor`, and — when bubbles arrived — `await revealBubbles(result.bubbles)`.
   - `revealBubbles` (`ChatScreen.tsx:1046`): `planReveal` over the bodies, then **for each bubble: `sleep(gap)` → `setMessages(current => [...current, { id: bubble.id, … }])`** — an UNCONDITIONAL append. It guards on `alive.current` only. **No check that `bubble.id` is absent from `current`.**
2. **Channel B — page render → `initial` → merge.**
   - Any full-route RSC delivery of `/nina` (navigation, reload, `router.refresh()`) re-renders `app/nina/page.tsx`, which reads `listNinaMessages(...)` and hands `ChatScreen` a fresh `initial`.
   - The during-render merge (`ChatScreen.tsx:566-570`, the `seenInitial` block): `setMessages(current => mergeServerMessages(current, initial))`.
   - `mergeServerMessages` (`lib/nina/live.ts:34`) is **server order, local content, local-only rows appended** — it dedupes by id, so a merge is safe against a completed list. **But a merge that lands MID-REVEAL appends server rows the in-flight `revealBubbles` loop has not appended yet** — and that loop will append them again when its `sleep` resolves.

### Data Persistence

**Database:** `nina_messages` — her bubbles are written by the background turn in ONE multi-row atomic INSERT (`lib/nina/actions.ts` STEP 5, "it is atomic, so a half-written four-bubble reply can no longer come from a partial insert"). `nina_turns` holds the turn audit (`status`, `latency_ms`, `model`). No cache layer.

**Read-marking:** `app/nina/page.tsx:458` `after(() => markNinaMessagesRead(userId, { sessionId }))` — every page render marks the session's unread Nina rows read. **`read_at` is therefore a server-side trace of page renders** (only renders that delivered unread rows write a row, so the table under-traces).

### Exit Points

- Poll delivery → staggered reveal → conversation UI.
- Render delivery → `mergeServerMessages` → conversation UI.
- Web Push (`lib/push/send.ts` `pushNotifier`) — **proactive turns only**, and (measured) 0/152 of this user's rows ever carry `delivered_at`; the channel has never fired for this user.

---

## Key Data Structures

### `SentBubble`
**Location:** `lib/nina/actions.ts:120`
**Fields:** `{ id: string; body: string; replyToId: string | null }` — the poll's DTO for one of her rows.
**Used In:** `ChatScreen.revealBubbles` (Channel A appender).

### `ChatMessage`
**Location:** `components/nina/types.ts`
**Fields:** `{ id, role, body, dayISO, state, replyToId, imageUrls?, attachment? }` — the screen's row.
**Used In:** `messages` state; merged by `mergeServerMessages`; appended by `revealBubbles`.

### `NinaReplyPoll`
**Location:** `lib/nina/actions.ts:1948`
**Fields:** `{ ok, awaiting, bubbles: SentBubble[], cursor: number }`.

---

## The Measured Production Evidence (session `rw7WzfM7JjIl` "gj")

**The database is clean.**

- 39 rows total; `GROUP BY md5(text) HAVING count(*) > 1` → **0 duplicate texts**; all ids distinct.
- The reported turn `g-qujTEIL1X6` (model `glm-5.3-flash`, prompt v7, status `ok`, latency 27,563 ms): **exactly 4 rows**, seq 3716–3719, one `sent_at` (04:07:00.316068 — one atomic batch).
- 7 turns in the session, one per runner message; no second turn, no re-run, no chain overlap for the reported message.

**The duplication is client-render only.**

**`read_at` events (each = one `/nina` page render that delivered unread rows; the sole writer is `app/nina/page.tsx:458`):**

| read_at (UTC) | rows | whose | insert → read delta |
|---|---|---|---|
| 03:57:23.280 | 1 | photo carrier 3709 | — (user's page load) |
| 04:05:56.159 | 4 | turn JQBB (inserted 04:05:51.344) | **Δ 4.8 s** |
| 04:07:00.330 | 4 | turn g-quj (inserted 04:07:00.316) | **Δ 0.014 s** |
| 04:35:33.019 | 1 | image turn 3720 (sent 04:34:04) | Δ 89 s (user navigation) |

**Why Δ 4.8 s and Δ 0.014 s are the smoking gun.** Both deltas fall inside the poll-driven reveal windows of their own turns:

- Turn JQBB: send 04:05:29.1 → with the backoff (1.5 s ×6 then 2.5 s) and one action RTT, the delivering poll returned ≈ 04:05:54.0; `planReveal` over its four bodies (65–100 chars) spreads the batch over ≈ 3.2 s, ending ≈ 04:05:57. **A render at 04:05:56.159 lands inside that window.**
- Turn g-quj: send 04:06:32.5 → the delivering poll is attempt #14 at ≈ +29 s ≈ 04:07:01.5–02.1 (response). The four bodies (73/130/122/88 chars) scale to gaps ≈ [0, 989, 1105, 1105] ms. **A render at 04:07:00.330 carries all 4 committed rows in its payload, which reaches the client ≈ 1–2.5 s later — i.e. after bubble 1's append and before bubble 2's** — exactly the interleaving that produces the reported shape [b1, b2, b3, b4, b2′, b3′, b4′] = 7.

**The push channel is excluded.** `SELECT count(*) FILTER (WHERE delivered_at IS NOT NULL)` → **0 of 152 rows ever pushed**; `sendNinaPush` is wired to proactive turns only, and a chat turn never pushes (its own docstring refuses it). No `'nina:new'` SW message can have fired.

**The render was not an automatic consequence of the insert.** The *current* turn `b2cJUhu9Tf9-` (bubbles committed 04:56:03.84) had **no read-marking for over a minute** while the runner watched. So the 04:07:00.330 render was a discrete RSC delivery racing the reveal, not something every turn does.

### Trigger indeterminacy (and why the fix does not need it)

WHICH event produced that render is not recoverable from retained telemetry: Vercel runtime logs flood out in minutes under current admin traffic (a 3,000-line fetch covers only the last ≈ 3 minutes), the SW-push seam is provably dead for this user, and `NinaUnreadSync`'s one-shot refresh (the only in-code automatic refresh, `components/nina/NinaUnreadSync.tsx:60`) is one of several candidates — as are a runner reload/navigation and any framework-driven RSC revalidation. All of them produce the **same** merge event, and all are legitimate: `ChatScreen`'s own header documents that a refresh "hands down a whole new `initial` and lands through `mergeServerMessages` — in ONE frame" is by design safe **for a completed list**. The defect is that Channel A's append does not hold up its side of that contract when the list is not complete.

## Root Cause (the answer to R1)

**`revealBubbles` (`components/nina/ChatScreen.tsx:1057-1073`) appends each polled bubble to `messages` unconditionally — the only bubble-delivery path in the screen that does not dedupe on `nina_messages.id`.** When a full-route RSC delivery of `/nina` lands mid-reveal (its payload read the just-committed rows and `read_at` proves it did — 04:07:00.330, 14 ms after the atomic INSERT), the `seenInitial` merge pre-delivers the bubbles the reveal has not appended yet; the still-running `revealBubbles` loop then appends its own copies of the same ids. Two channels, one shared list, only one of them idempotent:

```
poll:    [b1 b2 b3 b4]  → reveal appends b1 … (sleep 989 ms) …
render:  initial = [… b1 b2 b3 b4] → mergeServerMessages: b1 deduped (local wins),
         b2 b3 b4 appended            ← list now holds b1 b2 b3 b4
reveal:  resumes → appends b2′ b3′ b4′ ← same ids again, no guard
result:  [b1 b2 b3 b4 b2′ b3′ b4′]    ← 7 bubbles, last 3 duplicated — the report, exactly
```

**Why the cursor does not protect:** `cursorRef` advances only on the poll path (`ChatScreen.tsx:1147`); the render channel bypasses it entirely, and the merge is keyed by id while the reveal is keyed by nothing.

**Why the DB stays clean:** the duplication is born and dies in `useState` on one screen; the background turn's INSERT is atomic and single.

---

## Impact Points (files that WILL need changes)

1. `components/nina/ChatScreen.tsx` — `revealBubbles` must append idempotently (skip ids already present in `current`); owns the call site. Phase 1.
2. `lib/nina/reveal.ts` (or a sibling pure module) — the append decision extracted as a pure function so `vitest` (node env, no jsdom) can prove it, per the `mergeServerMessages`/`planReveal` precedent. Phase 1.
3. `tests/` — a unit test for the pure helper: empty-append identity (same reference), skip-existing, partial-overlap append (the measured interleaving), and full-overlap (merge won) no-op. Phase 1.

**This document describes. The plan files prescribe.**
