# Code Analysis: Photo-viewer attach strip (send to chat) + keyboard-pushed text field bug

**Type:** Feature Update (+ one Bug Investigation)
**Date:** 2026-09-09 11:23 WIB
**Session ID:** 20260909-112330-P7K2
**Plan:** `PHOTO_SEND_CHAT_ICONS_PLAN.md` (2 phase(s))
**Worktree:** `/home/miftah/run-insights/.claude/worktrees/photo-send-chat-icons` — branch `worktree-photo-send-chat-icons` (base: `origin/main` @ `5ccae06`). The session was already inside this worktree when `/analyze` ran, so per the no-nesting rule it is reused; no second worktree was cut.

---

## User Input

### Original User Request

> cek fitur untuk melihat foto ,yang bisa kirim foto ke chat, yang ada text field (Tanya soal foto ini (opsional) :
> 1a. saat ini "Kirim ke chat" akan mengirim ke the most recent session. ganti tombol ini menjadi icon tanpa text
> 1b di row yang sama dengan 1a (bersebelahan) tambahkan icon baru, yang akan mengirim gambar ini ke new chat session (so here we always create a new chat session)

Mid-run addition (arrived while the analysis was in progress; treated as part of the same spec):

> tambahan bug report: mengedit nama session menunjukkan bug UI yang sama. keyboard mendorong text field ke atas , membuat text field tidak terlihat di layar

### User-Provided Context

- The feature under change is the zoomed-photo state of `/nina/about` (album + chat photos), which carries a question text field ("Tanya soal foto ini (opsional)") and a send control.
- "Kirim ke chat" today routes to the most recent session; the user states this as fact and keeps the behavior for 1a — only the control's visual form changes.
- 1b is explicitly "always a new chat session".
- The bug report names the session-rename field and calls it "the same UI bug": the on-screen keyboard pushes the text field up until it is not visible. The photo-viewer question field is the other member of that class and is the surface this run already has open.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Ganti tombol "Kirim ke chat" menjadi icon tanpa text (behavior unchanged: still sends to the most recent session) |
| R2 | Di row yang sama dengan 1a (bersebelahan), tambahkan icon baru yang mengirim gambar ini ke new chat session — always a new chat session |
| R3 | Bug: mengedit nama session — keyboard mendorong text field ke atas sehingga tidak terlihat di layar ("bug UI yang sama"; the photo-question field shares the exposure) |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The zoomed-photo attach strip on `/nina/about` sends the photo (with an optional question) into the runner's most recent conversation, via a full-width labelled `Button`. The user wants the strip to offer two adjacent icon-only controls instead: one preserving today's most-recent-session behavior, one that always starts a fresh conversation for the photo. Independently, the keyboard interaction on focused text fields is broken in the "field pushed off screen" way — reported concretely on the sidebar's session-rename field, and the photo-question field sits in the same exposure class with strictly less protection (no keyboard channel at all on `/nina/about`).

**Success Criteria**:

1. The strip renders two icon-only buttons adjacent in one row (no visible text on either); the accessible names carry the words. The first preserves the exact send-to-most-recent behavior; the second always lands the photo in a conversation that has no prior content.
2. After either send the runner lands in the conversation that received the photo.
3. On `/nina/about`, focusing the question field with the software keyboard up leaves the field visible (the strip ends at the keyboard's top edge instead of being lifted by Safari's focus reveal).
4. In the sidebar, focusing the session-rename field leaves it visible through the keyboard's open — including when the panel's box shrinks after the focus reveal has already scrolled the list, which is the residue the current fixed-delay reassert does not reliably cover.
5. All existing tests keep passing; the new send paths and the keyboard decision rules carry tests.

**Key Considerations**:

- `sendNinaMessage` already returns `sessionId` in its result, and `createNinaChatSession` already returns `{ ok, sessionId, next }` with `next = /nina?s=<id>` — the new-session path needs no new SQL and no new session-resolution policy.
- `createNinaChatSession` reuses the newest EMPTY session rather than creating a second one (documented anti-litter rule). An empty newest session IS a new chat in every observable sense; this is the reading of "always a new chat session" that keeps one rule in the codebase. Recorded as a Decision in the plan index.
- The repo convention for icons is inline Lucide-lineage SVG fetched verbatim from `unpkg.com/lucide-static` (recorded in `SessionRow.tsx` and `AdminNav.tsx`), `aria-hidden` glyph + `aria-label` word on the `Button`. Icon-only `Button`s with `loading` mis-tap protection are the established shape (`SessionRow`'s three menu buttons).
- The keyboard system has a recorded invariant: no second `visualViewport` subscription on one screen; the measurement broadcasts through `--nina-kb-overlap` on `:root`. `/nina/about` has no subscriber today because `ChatScreen` (the only publisher) is not mounted there.
- The strip sits at `z-70` over `PhotoViewer` (`z-60`) and is `fixed inset-x-0 bottom-0`; it is inside no scroll container, which is the same situation as the composer — whose recorded outcome after gaining the box fix was "never lifts".
- `vitest` runs `environment: 'node'` — no jsdom, no `visualViewport`. Keyboard rules live as pure functions in `lib/nina/chatview.ts` (invariant 8: a rule in a component cannot be tested).

---

## Analysis Scope

### Explicitly Mentioned Files

- `components/nina/NinaAboutScreen.tsx` (by description — the photo viewer with the question field and "Kirim ke chat")

### Discovered Related Files

- `lib/nina/albumActions.ts` — `attachNinaPhotoToChat`, the strip's server action (calls `sendNinaMessage`)
- `lib/nina/actions.ts` — `sendNinaMessage`; `sessionId: null` → `resolveNinaWriteSession`; returns `sessionId`
- `lib/nina/sessionResolve.ts` — `resolveNinaWriteSession` = `ensureNinaSession(userId)` (most recent, created if none)
- `lib/nina/sessionActions.ts` — `createNinaChatSession` (eager create, empty-newest dedupe), `renameNinaChatSession`
- `lib/nina/album.ts` — `NINA_ATTACH_MAX_CHARS` (input cap = server clamp), album/gallery photo types
- `components/nina/NewChatButton.tsx` — the existing create-a-chat control and its `replace`-not-`push` navigation rule
- `components/nina/SessionRow.tsx` — the rename form (R3's reported surface); the icon-only `Button` + `aria-label` precedent
- `components/nina/NinaSidebar.tsx` — the panel: box fix (`bottom: var(--nina-kb-overlap)`) and the `focusin` reassert listener
- `components/nina/ChatScreen.tsx` — the ONLY `visualViewport` subscription; publishes `--nina-kb-overlap` on `:root`
- `lib/nina/chatview.ts` — `keyboardOverlapPx`, `KEYBOARD_MIN_PX`, `NINA_KEYBOARD_OVERLAP_VAR`, `KEYBOARD_REASSERT_DELAYS_MS`
- `components/ui/Button.tsx` — `md`/`lg`, variants, `loading` (dots in an unchanged box)
- `components/ui/PhotoViewer.tsx` — the shared full-screen viewer under the strip (`z-60`)
- `app/nina/about/page.tsx` — server page; renders `NinaAboutScreen` inside `AppShell`; no `ChatScreen`
- `tests/nina.chatPhoto.test.ts`, `tests/nina.chatPhotoReattach.test.ts` — attach/pointer suites touching this surface

---

## Current Dataflow

### Entry Point: the attach strip

**Location:** `components/nina/NinaAboutScreen.tsx:339-357`
**Trigger:** opening a photo pushes `?photo=<section>.<id>`; the strip renders fixed at the bottom (`z-70`) whenever `open != null`
**Input Schema:** `{ question: string }` (controlled input, `maxLength={NINA_ATTACH_MAX_CHARS}`, placeholder "Tanya soal foto ini (opsional)"); a full-width `Button` labelled "Kirim ke chat" / "Mengirim…"
**Validation:** none client-side beyond `maxLength`; `attach()` guards `open == null || attaching` and a missing photo row
**Next Step:** `attachNinaPhotoToChat({ kind, id, body })` at `NinaAboutScreen.tsx:203`

### Processing Chain

1. **Function:** `attach()` — `NinaAboutScreen.tsx:195-218`
   - **Input:** the open photo (`open.section` → kind `'avatar' | 'image'`, its id) + `question`
   - **Transform:** `setAttaching(true)`; on `!result.ok` renders "Gagal kirim fotonya. Coba lagi."; on ok: `router.refresh()` then `router.push('/nina')` (bare — no `?s=`)
   - **Calls:** `attachNinaPhotoToChat`

2. **Function:** `attachNinaPhotoToChat` — `lib/nina/albumActions.ts:48-67` (`'use server'`)
   - **Input:** `{ kind: 'avatar' | 'image', id, body }`
   - **Transform:** `body.trim().slice(0, NINA_ATTACH_MAX_CHARS)`; calls `sendNinaMessage({ body, attachExisting: { kind, id }, sessionId: null })` — the `null` is documented (A3): "no session in view resolves to his most recent conversation"
   - **Output:** `{ ok, userMessageId }` (the caller does not receive `sessionId` today, though `sendNinaMessage` computes one)

3. **Function:** `sendNinaMessage` — `lib/nina/actions.ts:377+`
   - **Validation:** refusal rule `text === '' && tickets === 0 && runId === null && attach === null` → REFUSED; `attachExisting` shape-checked; STEP 0d `resolveAttachment` proves ownership (a miss REFUSES — a photo he cannot see is not silently dropped); STEP 0e resolves the session AFTER refusals
   - **Session resolution:** `sessionId == null` → `resolveNinaWriteSession(userId)` (`lib/nina/sessionResolve.ts:44`) → `ensureNinaSession(userId)` (`lib/nina/queries.ts`) — most recently ACTIVE session, created if he has none
   - **Output:** `{ ok, userMessageId, sessionId, cursor, turnId }` (`actions.ts:751`) — **`sessionId` is already in the result**
   - **Side effects:** writes the runner's `nina_messages` row (and `nina_turns`); her reply arrives through `ChatScreen`'s poll after the caller navigates to `/nina`

### Companion flow (R2's building block, already shipped)

**Function:** `createNinaChatSession` — `lib/nina/sessionActions.ts` (`'use server'`)
- Eager create: reads `listNinaSessions`, and if the newest session holds no messages returns IT instead of creating a second empty row (documented anti-litter rule; "tapping new chat three times yields one empty session")
- **Output:** `{ ok, sessionId, next }` with `next = /nina?${SESSION_PARAM}=${id}`; `revalidatePath('/nina')` on the create branch
- **Caller today:** `NewChatButton` (sidebar rail `+`) — `<button>`, `router.replace(outcome.next)` (replace-not-push, the recorded rule)

### R3's surfaces and the keyboard system that exists

**Surface A — session rename:** `components/nina/SessionRow.tsx:374-440`. `⋯` → pencil → inline `<form>` inside the sidebar row: `Field label="Nama chat"` + `Input` (prefilled draft, ✕ clear with `onPointerDown` `preventDefault()` so the keyboard never folds) + `Simpan`/`Batal`. The input is NOT focused when the form opens; the runner taps it.

**The panel around it:** `NinaSidebar.tsx` is `fixed inset-0 z-50 flex flex-col` with an inline `style.bottom = var(--nina-kb-overlap, 0px)` (line 514) — the panel's BOX ends at the keyboard's measured top edge. Inside it, the scroll deck is `min-h-0 flex-1 overflow-y-auto overscroll-contain` (line 527); the rename form lives inside that deck, inside a `SessionRow`.

**The publisher:** `ChatScreen.tsx:584-633` — the ONLY `visualViewport` subscription in the app. `keyboardOverlapPx({innerHeight, visualHeight, visualOffsetTop, scale})` (lib/nina/chatview.ts:139+, filters anything under `KEYBOARD_MIN_PX = 120` and non-1x zoom) → `setOverlap` → an effect writes `--nina-kb-overlap` onto `document.documentElement` and removes it at zero/unmount. Empty-deps; broadcast through `:root` because the panel is a sibling, not a descendant ("a second `visualViewport` subscription is the thing `ChatChrome`'s docstring forbids").

**The reassert:** `NinaSidebar.tsx:357-442` — while the panel is open, a delegated `focusin` listener arms `KEYBOARD_REASSERT_DELAYS_MS = [0, 120, 300, 600, 1000]` (chatview.ts:275) against any INPUT/TEXTAREA/contenteditable that takes focus; each tick, if `document.activeElement` is still that element, calls `target.scrollIntoView({ block: 'nearest', behavior: 'instant' })`. This fixed the recorded search-field incident ("the field rides out through the container's top edge" — Safari's focus reveal scrolls the DECK, then the var shrinks the panel a commit later and the deck keeps its stale scrollTop). The effect keys on `open` ALONE (the `Sheet.tsx` trap: any other dependency re-runs on keystrokes and drops the keyboard).

**Surface B — the photo-question field:** `NinaAboutScreen.tsx:339-357`. The strip is `fixed inset-x-0 bottom-0 z-70` with **no keyboard channel of any kind**: `ChatScreen` is not mounted on `/nina/about` (`app/nina/about/page.tsx` renders `NinaAboutScreen` inside `AppShell` only), so `--nina-kb-overlap` is never published there, the strip has no `bottom` var, and there is no reassert. The recorded mechanism for exactly this shape (`NinaSidebar.tsx:484-501`): "iOS does not shrink that [layout viewport] when the software keyboard opens — so a full-height panel runs on behind the keys and Safari's focus reveal answers by lifting the whole fixed overlay off the top of the glass ('mengangkat UI keatas', the owner's report)". The strip is inside no scroll container — the same situation as the composer, whose recorded outcome after gaining the box fix was "the composer never lifts".

### Data Persistence

- `nina_messages` (runner's row: `session_id NOT NULL`, `body`, attachment columns), `nina_turns` — via `sendNinaMessage`/`runNinaTurn`
- `nina_chat_sessions` — INSERT via `createNinaSession` (only on the create branch; the empty-newest reuse branch writes nothing)
- Attach semantics: `'avatar'` kind writes a REFERENCE row (album pointer), `'image'` adopts/copies per `ninaPhotoProvenance` (`lib/nina/attach.ts`; suites `tests/nina.chatPhoto*.test.ts`)

### Exit Points

- Navigation: `router.refresh()` + `router.push('/nina')` (bare) after a successful attach — today the destination relies on `/nina`'s bare resolution landing on the most-recent session, which the attach just made most recent
- Error: `notice` line "Gagal kirim fotonya. Coba lagi." rendered inside the strip
- `revalidatePath('/nina')` from `createNinaChatSession`'s create branch

---

## Key Data Structures

### `NinaAttachInput` / `NinaAttachResult`
**Location:** `lib/nina/albumActions.ts:36-46`
**Fields:** `{ kind: 'avatar' | 'image', id, body }` → `{ ok, userMessageId }` (the shape R1/R2 extends)

### `SendNinaMessageResult`
**Location:** `lib/nina/actions.ts:121-123`, returned at `:751`
**Fields:** `{ ok, userMessageId, sessionId, cursor, turnId }`

### `NinaSessionCreateResult`
**Location:** `lib/nina/sessionActions.ts`
**Fields:** `{ ok, sessionId, next }` — `next` is the ready-to-push `/nina?s=<id>` URL

### `Open` / `Section` (viewer state)
**Location:** `NinaAboutScreen.tsx:48-71`
**Fields:** `{ section: 'album' | 'chat', index }`; DERIVED from `?photo=` (never mirrored into state)

### Keyboard constants
**Location:** `lib/nina/chatview.ts:139,226,275` — `KEYBOARD_MIN_PX = 120`, `NINA_KEYBOARD_OVERLAP_VAR = '--nina-kb-overlap'`, `KEYBOARD_REASSERT_DELAYS_MS = [0, 120, 300, 600, 1000]`

### `Button`
**Location:** `components/ui/Button.tsx` — `md: h-11 px-4`, `lg: h-[52px] px-5`; variants `primary` (`bg-ink text-card`), `secondary`, `ghost`, `destructive`; `loading` → disabled + pulsing dots in an unchanged box (the mis-tap guard)

---

## Dependencies

- **Config/Env:** none new. `NINA_ATTACH_MAX_CHARS` already shared input↔server.
- **External:** Lucide glyph sources fetched from `unpkg.com/lucide-static` at implementation time (repo convention; no icon package).
- **Framework:** Next 16.3.1 Server Actions ('use server' modules export only async functions — constants live in `lib/nina/album.ts` / `sessions.ts`); `pushState`-integrated `useSearchParams`; React 19 (ref as ordinary prop).
- **Test rig:** vitest, `environment: 'node'` — DOM/`visualViewport` unavailable; keyboard rules must stay pure functions in `lib/` to be testable.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| attach strip (input + "Kirim ke chat") | `components/nina/NinaAboutScreen.tsx:339-357` | def (UI) | nina |
| `attach()` | `components/nina/NinaAboutScreen.tsx:195-218` | def (handler) | nina |
| `attachNinaPhotoToChat` | `lib/nina/albumActions.ts:48` | def (action) | nina |
| `NINA_ATTACH_MAX_CHARS` | `lib/nina/album.ts` (def), `albumActions.ts:4`, `NinaAboutScreen.tsx:349` | config | nina |
| `sendNinaMessage` | `lib/nina/actions.ts:377` | def (action) | nina |
| `sessionId` resolution (null branch) | `lib/nina/actions.ts:540-546` | def | nina |
| `resolveNinaWriteSession` | `lib/nina/sessionResolve.ts:44` | def | nina |
| `ensureNinaSession` | `lib/nina/queries.ts` | def | nina |
| `SendNinaMessageResult.sessionId` | `lib/nina/actions.ts:121-123, 751` | def | nina |
| `createNinaChatSession` | `lib/nina/sessionActions.ts` | def (action) | nina |
| `NewChatButton` (replace-not-push rule) | `components/nina/NewChatButton.tsx` | def (UI) | nina |
| rename form (R3 report) | `components/nina/SessionRow.tsx:374-440` | def (UI) | nina |
| icon-only Button + aria-label pattern | `components/nina/SessionRow.tsx:337-366` | pattern | nina |
| panel box fix `bottom: var(--nina-kb-overlap)` | `components/nina/NinaSidebar.tsx:514` | def (UI) | nina |
| focusin reassert | `components/nina/NinaSidebar.tsx:357-442` | def (effect) | nina |
| visualViewport subscription + `:root` broadcast | `components/nina/ChatScreen.tsx:584-633` | def (effect) | nina |
| `keyboardOverlapPx`, `KEYBOARD_MIN_PX` | `lib/nina/chatview.ts:139-178` | def (pure) | nina |
| `NINA_KEYBOARD_OVERLAP_VAR` | `lib/nina/chatview.ts:226` | def (const) | nina |
| `KEYBOARD_REASSERT_DELAYS_MS` | `lib/nina/chatview.ts:275` | def (const) | nina |
| `composerBottomCss` / `composerPadBottomCss` | `lib/nina/chatview.ts` | def (pure) | nina |
| `PhotoViewer` (z-60, under the strip) | `components/ui/PhotoViewer.tsx` | def (UI) | ui |
| `Button` variants / `loading` | `components/ui/Button.tsx:44-66, 85+` | def (UI) | ui |
| `/nina/about` page (no ChatScreen) | `app/nina/about/page.tsx` | def (route) | nina |
| attach pointer suites | `tests/nina.chatPhoto.test.ts`, `tests/nina.chatPhotoReattach.test.ts` | test | nina |

---

## Impact Points (files that WILL need changes)

1. `components/nina/NinaAboutScreen.tsx` — the strip becomes input row + adjacent icon row (R1, R2 → phase 1); the strip gains the keyboard box fix and mounts the shared publisher (R3 → phase 2)
2. `lib/nina/albumActions.ts` — the attach input gains the session target; the new-session branch composes `createNinaChatSession` + explicit `sessionId`; the result carries the destination (R2 → phase 1)
3. `components/nina/ChatScreen.tsx` — the visualViewport subscription + `:root` broadcast extracted into a shared component (R3 → phase 2)
4. `components/nina/KeyboardOverlapPublisher.tsx` (new) — the shared publisher, mounted on both routes (R3 → phase 2)
5. `components/nina/NinaSidebar.tsx` — the reassert gains a layout-change-driven trigger so the rename field survives the box shrink after the focus reveal (R3 → phase 2)
6. `lib/nina/chatview.ts` — pure decision helpers for the reassert upgrade, where they are testable (R3 → phase 2)
7. `tests/nina.*` — new suites for the two send paths and the reassert rule; existing attach suites keep passing (both phases)

**This document describes. The plan files prescribe.**
