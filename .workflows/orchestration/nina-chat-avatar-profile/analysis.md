# Code Analysis: Nina's chat avatar (the 28 px typing-row circle)

**Type:** Bug Investigation
**Date:** 2026-09-07 09:26:29 WIB
**Session ID:** 20260907-092629-AVTR
**Plan:** `NINA_CHAT_AVATAR_PROFILE_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-chat-avatar-profile` — branch `feature/nina-chat-avatar-profile` (base `origin/main` @ `414f5b2`)

---

## User Input

### Original User Request

> nina small circle doesn't follow her profile settings in chat doesn't follow her profile settings
>
> [screenshot: `/nina` chat, a user bubble, one of Nina's bubbles, then the typing row — a small
> round avatar to the left of a three-dot bubble]

### User-Provided Context

One screenshot. It shows the `/nina` conversation surface at the moment Nina is composing: the
typing indicator row is on screen, and the small circular avatar beside it is the object the report
names ("small circle"). No error text, no console output.

### User-Provided Files

None (`@`-free prompt).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | The small circular avatar shown in the chat must render the profile settings actually in force — the current album photo and its saved crop framing — not a hardcoded picture |

---

## Detailed Requirements Understanding

**Problem statement.** `components/nina/TypingIndicator.tsx:26` renders `<NinaAvatar size="sm" />`
with **no** `src`, `natural` or `crop` prop. `NinaAvatar`'s defaults are `src =
NINA_AVATAR_FALLBACK_SRC` (`/nina/avatar-001.png`), `natural = null`, `crop = null`, so that circle
renders the *committed* PNG through `next/image`, permanently. Changing the current avatar in
`/admin/nina`, or re-framing it in the crop studio, cannot affect it: neither value ever reaches
the component.

Every other `NinaAvatar` call site does pass the triple — `NinaSidebar.tsx:330` (`md`, the 44 px
identity circle) and `NinaAboutScreen.tsx:234` (`xl`, the hero). So the chat's 28 px circle is the
only one in the app still frozen on the fallback, which is exactly the "one circle disagrees with
the others" the screenshot shows.

`lib/nina/crop.ts` states the intended contract in its own words, and it already names the
offender:

> **THE ONE CROP-TO-CSS MAPPING IN THE REPO.** The admin studio's preview, the album grid's
> thumbnails, the chat header's 44 px avatar **and the typing row's 28 px avatar** must all render
> through this function. Two implementations of it means a crop that looks centred in the tool and
> off-centre in the app, with nothing failing anywhere — the exact silent failure R23 exists to
> prevent.

The typing row's 28 px avatar does not render through it. This is not a regression from a later
change; it is phase 4's hardcoded default that phase 13 updated at two call sites and missed at the
third.

**Success criteria.**

1. The 28 px chat circle renders `getCurrentNinaAvatar(userId)`'s blob URL, transformed by
   `ninaCropStyle` with that row's `crop_scale` / `crop_x` / `crop_y` and its natural size.
2. With no album row at all, it renders exactly what it renders today — the committed
   `/nina/avatar-001.png`, via `next/image`. `ninaAvatarView(null)` already means this (D-2), and
   this fix must not change the no-album case.
3. The sidebar's 44 px circle and the chat's 28 px circle show the same face and the same framing
   on the same screen. That equality is checkable by eye and is the user-visible statement of R1.
4. `description` — `glm-4.6v`'s private prose — does not cross into a client component
   (invariant 5). `app/nina/page.tsx:498` already destructures field by field for this reason and
   the new prop must do the same.

**Key considerations.**

- **`TypingIndicator` takes no props today.** It is rendered from `MessageList` (a `'use client'`
  component), which is rendered from `ChatScreen` (also client), which is rendered from
  `app/nina/page.tsx` (Server Component). The avatar is already read and already resolved there —
  `const avatar = ninaAvatarView(avatarRow)` at `app/nina/page.tsx:259` — so the fix threads an
  existing value three components down. **No new query, no new read, no change to invariant 4.**
- **There is no context to piggyback on.** `NinaSidebarContext`
  (`components/nina/NinaSidebar.tsx:108`) carries open/close state only. Adding the avatar to it
  would give the chat surface a second source of truth for her face and would put a value the
  sidebar owns behind a hook `ChatScreen` deliberately does not call
  (`ChatChrome.tsx:238`: "`ChatScreen` never learns a sidebar exists"). An explicit prop is the
  shape the rest of this screen already uses.
- **Props are REQUIRED, not optional, at the ChatScreen / MessageList boundary.** RULING E2b's
  habit, stated at `ChatScreen.tsx` for `sessionId` and `pendingPhoto`: `app/nina/page.tsx` is the
  one caller and `tsc` should be what notices if it stops passing. An optional prop defaulting to
  the fallback would re-create this exact bug silently the next time a caller is added.
- **`TypingIndicator` itself keeps a default**, because `NinaAvatar` does and because the component
  is `aria-hidden` decoration whose failure mode should be "the committed face" and never a crash.
  The bug is not that a default exists; it is that no caller ever overrides it.
- **The test suite is `environment: 'node'`** (`vitest.config.ts`) — no jsdom, no React rendering.
  A rendered-DOM assertion is not available. The repo's answer for a props-wiring invariant is a
  source-text assertion (`tests/nina.softDelete.test.ts`, `tests/motion.reducedMotion.test.ts`,
  `tests/admin.shell.test.ts` all read files with `readFileSync`), and that is what this phase
  writes.

---

## Analysis Scope

### Explicitly Mentioned Files

None — inferred from the screenshot.

### Discovered Related Files

- `components/nina/TypingIndicator.tsx` — **the defect**; renders `<NinaAvatar size="sm" />` bare
- `components/nina/NinaAvatar.tsx` — the renderer, and its fallback defaults
- `components/nina/MessageList.tsx` — renders `<TypingIndicator />` at line 311
- `components/nina/ChatScreen.tsx` — renders `<MessageList …>` at line 1118
- `app/nina/page.tsx` — reads `getCurrentNinaAvatar`, calls `ninaAvatarView`, passes the result to
  `NinaSidebar` **only**
- `lib/nina/album.ts` — `ninaAvatarView`, `NINA_AVATAR_FALLBACK_SRC`, `NinaAvatarView`
- `lib/nina/crop.ts` — `ninaCropStyle`, `resolveCrop`, `NinaCropInput`
- `components/nina/NinaSidebar.tsx` — the correct call site, and `NinaSidebarAvatar`, the prop
  shape to mirror
- `components/nina/NinaAboutScreen.tsx` — the other correct call site
- `lib/nina/queries.ts` — `getCurrentNinaAvatar`, `NinaAvatarRow`
- `vitest.config.ts` — `environment: 'node'`, which decides how this is verified

---

## Current Dataflow

### Entry Point: `GET /nina`

**Location:** `app/nina/page.tsx`
**Trigger:** navigation to the chat tab
**Reads:** `Promise.all([listNinaMessages, markNinaMessagesRead, getCurrentNinaAvatar(userId), <photo pointer>])` — `app/nina/page.tsx:205`

### Processing Chain

1. **`getCurrentNinaAvatar(userId)`**
   - **Location:** `lib/nina/queries.ts:2129`
   - **Output:** `NinaAvatarRow | null` — one row on the partial unique index
     `nina_avatars_user_current_unq`, carrying `blobUrl`, `width`, `height`, `cropScale`, `cropX`,
     `cropY`, `description`
   - **`null` means:** no album row → the committed constant (D-2)

2. **`ninaAvatarView(avatarRow)`**
   - **Location:** `lib/nina/album.ts:242`, called at `app/nina/page.tsx:259`
   - **Transform:** row → `{ src, natural: {width, height}, crop: {scale, x, y}, description, isFallback }`;
     `null` → `{ src: NINA_AVATAR_FALLBACK_SRC, natural: {null, null}, crop: null, description: null, isFallback: true }`

3. **The fork — where R1 is lost**
   - `app/nina/page.tsx:502` → `<NinaSidebar avatar={{ src, natural, crop }} …>` ✅ threaded
   - `app/nina/page.tsx:486` → `<ChatScreen initial todayISO userId sessionId pending pendingPhoto flight />` ❌ **`avatar` is not among the props**

4. **`ChatScreen` → `MessageList`**
   - **Location:** `components/nina/ChatScreen.tsx:1118`
   - Passes `messages`, `typing`, `todayISO`, `keyboardOverlapPx`, `restoreMark`, `flashId`, and
     four handlers. No avatar, because it has none.

5. **`MessageList` → `TypingIndicator`**
   - **Location:** `components/nina/MessageList.tsx:311` — `<TypingIndicator />`, no props
   - `TypingIndicator` takes no props at all (`components/nina/TypingIndicator.tsx:23`)

6. **`TypingIndicator` → `NinaAvatar`**
   - **Location:** `components/nina/TypingIndicator.tsx:26` — `<NinaAvatar size="sm" />`
   - `NinaAvatar` defaults fire: `src = NINA_AVATAR_FALLBACK_SRC`, `crop = null`
   - `isFallback` is therefore `true` (`NinaAvatar.tsx:54`) → the `next/image` branch, `object-cover`,
     **no `ninaCropStyle` call at all**

### Exit Point

A `<span class="relative block size-7 …"><Image src="/nina/avatar-001.png" …/></span>` — the
committed PNG, centred cover, on every render, for every user, regardless of the album.

### State Changes

None. This is a read/render defect; nothing is persisted incorrectly. The database already holds
the right answer and no component asks for it.

---

## Key Data Structures

### `NinaAvatarView`
**Location:** `lib/nina/album.ts` (returned by `ninaAvatarView`, line 242)
**Fields:** `src: string`, `natural: { width: number|null; height: number|null }`,
`crop: { scale, x, y } | null`, `description: string | null`, `isFallback: boolean`
**Used in:** `app/nina/page.tsx:259`, `app/nina/about/page.tsx`

### `NinaSidebarAvatar`
**Location:** `components/nina/NinaSidebar.tsx:96`
**Fields:** the three render fields only — `src`, `natural`, `crop`. **Not** `description`
(line 209: "NOT its `description` — nothing here reads that").
**This is the exact prop shape the chat path should mirror**, for the same invariant-5 reason.

### `NinaCropInput`
**Location:** `lib/nina/crop.ts`
**Fields:** `scale: number|null`, `x: number|null`, `y: number|null`; all-null = no transform

---

## Dependencies

**Configuration / Environment:** none new.
**Database:** `nina_avatars` (`blob_url`, `width`, `height`, `crop_scale`, `crop_x`, `crop_y`,
`is_current`) — already read on this page.
**External services:** none. No new network call, no new query, no model call.

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `<NinaAvatar size="sm" />` | `components/nina/TypingIndicator.tsx:26` | call — **defective** | `components/nina` |
| `TypingIndicator()` | `components/nina/TypingIndicator.tsx:23` | def — gains props | `components/nina` |
| `<TypingIndicator />` | `components/nina/MessageList.tsx:311` | call — gains a prop | `components/nina` |
| `MessageList({...})` | `components/nina/MessageList.tsx:56` | def — gains a prop | `components/nina` |
| `<MessageList …>` | `components/nina/ChatScreen.tsx:1118` | call — gains a prop | `components/nina` |
| `ChatScreen({...})` | `components/nina/ChatScreen.tsx:159` | def — gains a prop | `components/nina` |
| `<ChatScreen …>` | `app/nina/page.tsx:486` | call — gains a prop | `app/nina` |
| `ninaAvatarView(avatarRow)` | `app/nina/page.tsx:259` | call — already correct, reused | `app/nina` |
| `<NinaAvatar size="md" src natural crop>` | `components/nina/NinaSidebar.tsx:330` | call — correct, unchanged | `components/nina` |
| `<NinaAvatar size="xl" src natural crop>` | `components/nina/NinaAboutScreen.tsx:234` | call — correct, unchanged | `components/nina` |
| `NinaSidebarAvatar` | `components/nina/NinaSidebar.tsx:96` | type — the shape to mirror | `components/nina` |
| `ninaCropStyle` / `resolveCrop` | `lib/nina/crop.ts` | def — unchanged, newly reached | `lib/nina` |
| `environment: 'node'` | `vitest.config.ts:35` | config — decides the verification shape | root |

---

## Impact Points (files that WILL need changes)

1. `components/nina/TypingIndicator.tsx` — accept and forward the avatar triple (phase 1)
2. `components/nina/MessageList.tsx` — accept the triple, pass it to `TypingIndicator` (phase 1)
3. `components/nina/ChatScreen.tsx` — accept the triple, pass it to `MessageList` (phase 1)
4. `app/nina/page.tsx` — pass `{ src, natural, crop }` to `<ChatScreen>` (phase 1)
5. `tests/nina.chatAvatar.test.ts` — **new**; the source-text assertion that keeps the wiring
   (phase 1)

**This document describes. The plan files prescribe.**
