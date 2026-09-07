# Phase 1 — Thread the current avatar into the chat's typing row

**Plan set:** `NINA_CHAT_AVATAR_PROFILE_PLAN.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-chat-avatar-profile`
**Branch:** `feature/nina-chat-avatar-profile` (base `origin/main` @ `414f5b2`)
**Satisfies:** R1
**Depends on:** —
**Difficulty:** EASY
**Analysis:** `20260907-092629-AVTR_code_analyzer.md`

---

## What is wrong

`components/nina/TypingIndicator.tsx:26` is `<NinaAvatar size="sm" />`. No `src`, no `natural`, no
`crop`. `NinaAvatar` therefore falls back to `/nina/avatar-001.png` with `crop == null`, which
makes `isFallback` true and takes the `next/image` / `object-cover` branch — `ninaCropStyle` is
never called for this circle. The current album photo and its saved framing cannot reach it, and
nothing anywhere fails.

The value it needs is already resolved on the server: `app/nina/page.tsx:259`,
`const avatar = ninaAvatarView(avatarRow)`, from the `getCurrentNinaAvatar(userId)` already in the
page's `Promise.all`. It is passed to `<NinaSidebar>` (line 502) and not to `<ChatScreen>`
(line 486).

**This phase adds no read.** It threads that existing value four hops: `page` → `ChatScreen` →
`MessageList` → `TypingIndicator` → `NinaAvatar`.

## Files this phase owns

| File | Change |
|---|---|
| `components/nina/types.ts` | new exported `ChatAvatar` interface |
| `components/nina/TypingIndicator.tsx` | accept `avatar`, forward the triple to `NinaAvatar` |
| `components/nina/MessageList.tsx` | accept `avatar` (required), pass to `TypingIndicator` |
| `components/nina/ChatScreen.tsx` | accept `avatar` (required), pass to `MessageList` |
| `app/nina/page.tsx` | pass `avatar={{ src, natural, crop }}` to `<ChatScreen>` |
| `tests/nina.chatAvatar.test.ts` | **new** — the source-text assertion that keeps all four hops |

**Must NOT touch:** `components/nina/NinaAvatar.tsx`, `components/nina/NinaSidebar.tsx`,
`components/nina/NinaAboutScreen.tsx`, `lib/nina/crop.ts`, `lib/nina/album.ts`,
`lib/nina/queries.ts`, `lib/db/schema.ts`, `drizzle/**`.

---

## Step 1 — `components/nina/types.ts`: the shared shape

`ChatScreen` and `MessageList` already import from this module, and `ChatChrome.tsx:238` states
that "`ChatScreen` never learns a sidebar exists" — so the chat path must not import
`NinaSidebarAvatar` from `NinaSidebar.tsx` even though the three fields are identical. See the
plan index's Decisions table.

**Add the import at the top of the file**, next to the existing `RunAttachment` import:

```ts
import type { RunAttachment } from '@/lib/nina/attach'
import type { NinaCropInput } from '@/lib/nina/crop'
```

**Append at the end of the file**, after the `ChatMessage` interface's closing brace:

```ts
/**
 * Her face, as the chat surface needs it — R1.
 *
 * The three RENDER fields of `ninaAvatarView` and nothing else. **Deliberately not its
 * `description`**: that is `glm-4.6v`'s private prose, Nina's prompt is its only consumer, and
 * invariant 5 says it must never reach a client component. `app/nina/page.tsx` therefore builds
 * this field by field rather than spreading the view — the same care the `<NinaSidebar>` call
 * beside it already takes.
 *
 * `src` is a Blob URL for an album row and the committed `/nina/avatar-001.png` when there is no
 * album row; `crop` is null in the second case, which is what makes `NinaAvatar` take its
 * `next/image` branch and render exactly what it rendered before this type existed.
 *
 * Structurally identical to `NinaSidebarAvatar`, and deliberately a separate declaration: the
 * sidebar is a sibling of `<main>` rendered by `AppShell`, not part of the conversation, and
 * `ChatScreen` importing from `NinaSidebar.tsx` would contradict `ChatChrome.tsx`'s stated
 * boundary to save one interface.
 */
export interface ChatAvatar {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
}
```

---

## Step 2 — `components/nina/TypingIndicator.tsx`: the fix itself

Replace the whole file. The only substantive change is the `avatar` prop and the three attributes
on `NinaAvatar`; the docstring gains one paragraph explaining why the circle takes a prop at all,
because the *absence* of one is what shipped the bug.

```tsx
import { LoadingDots } from '@/components/ui/Button'

import { NinaAvatar } from './NinaAvatar'
import type { ChatAvatar } from './types'

/**
 * Nina, mid-thought.
 *
 * **`LoadingDots` is reused, not re-drawn**, and this is not merely tidiness. That component's
 * docstring is the app's whole loading vocabulary — "Not a spinner: a spinner reads as 'the app is
 * thinking about itself', three dots read as 'your thing is being worked on'" — which is precisely
 * the sentence a typing indicator wants to say. And it animates through `ri-pulse`, the app's one
 * keyframe, which `app/globals.css` already neutralises under `prefers-reduced-motion`. A
 * hand-rolled second keyframe would fail `tests/motion.reducedMotion.test.ts`, whose job is to
 * assert that every animated keyframe has an escape.
 *
 * `aria-hidden`, because three dots are not information. `ChatScreen` carries the spoken version in
 * an `aria-live="polite"` region, which is where a screen reader should hear it.
 *
 * The bubble shape is `MessageBubble`'s "hers" exactly — same fill, same radii, same tail corner —
 * so the dots occupy the space her first line is about to occupy, rather than announcing themselves
 * as a different kind of object.
 *
 * ── WHY THE FACE IS A PROP AND NOT A DEFAULT (R1) ─────────────────────────────────────────────
 * It used to be `<NinaAvatar size="sm" />` with nothing else, which meant the committed
 * `/nina/avatar-001.png` and a `null` crop — so this circle silently ignored both the current
 * album photo and the framing set in the crop studio, while the 44 px circle two components away
 * honoured both. `lib/nina/crop.ts` already named this row as one of the four surfaces that must
 * render through `ninaCropStyle`; it was the one that did not. The triple is resolved once on the
 * server by `ninaAvatarView` and threaded down, so the two circles read the same row and cannot
 * disagree.
 *
 * The prop is OPTIONAL here and required at every hop above, which is the deliberate asymmetry:
 * this component is `aria-hidden` decoration whose worst case should be "the committed face", but
 * `ChatScreen` and `MessageList` have exactly one caller each and `tsc` should be what notices if
 * one of them stops passing it. An optional prop all the way up is how this bug happened.
 */
export function TypingIndicator({ avatar }: { avatar?: ChatAvatar }) {
  return (
    <li className="flex items-end justify-start gap-2" aria-hidden="true">
      <NinaAvatar
        size="sm"
        src={avatar?.src}
        natural={avatar?.natural ?? null}
        crop={avatar?.crop ?? null}
      />
      <span className="rounded-card rounded-bl-chip bg-card px-4 py-3.5 text-ink-3 shadow-card">
        <LoadingDots />
      </span>
    </li>
  )
}
```

**Why `src={avatar?.src}` and not `src={avatar?.src ?? NINA_AVATAR_FALLBACK_SRC}`:** `NinaAvatar`
declares `src?: string` with the fallback as its **default parameter value**, so passing
`undefined` selects that default. Passing the constant explicitly would import it here for no
reason and would put a second statement of "what no album means" next to the one that already
exists. `natural` and `crop` are `?? null` because their declared types are
`… | null` rather than optional-with-default, and `null` is what `NinaAvatar` documents as "no
transform".

---

## Step 3 — `components/nina/MessageList.tsx`

Three edits, all mechanical.

**3a.** Add `avatar` to the destructured parameter list. Find:

```tsx
  onJumpToQuote,
  onRequestActions,
  onOpenImage,
}: {
  messages: readonly ChatMessage[]
```

replace with:

```tsx
  onJumpToQuote,
  onRequestActions,
  onOpenImage,
  avatar,
}: {
  messages: readonly ChatMessage[]
```

**3b.** Declare the prop. Find the end of the type block:

```tsx
  onOpenImage?: (messageId: string, index: number) => void
}) {
```

replace with:

```tsx
  onOpenImage?: (messageId: string, index: number) => void
  /**
   * R1. Her current face and its saved framing, resolved once on the server by `ninaAvatarView`
   * and passed straight to `TypingIndicator` — this component renders no avatar of its own.
   *
   * REQUIRED, not optional, on RULING E2b's habit: `ChatScreen` is the one caller and `tsc` should
   * be what notices if it stops passing it. An optional prop would silently fall back to the
   * committed PNG, which is precisely the bug this phase fixes.
   */
  avatar: ChatAvatar
}) {
```

**3c.** Import the type. Find:

```tsx
import type { ChatMessage } from './types'
```

replace with:

```tsx
import type { ChatAvatar, ChatMessage } from './types'
```

**3d.** Pass it. Find:

```tsx
      {typing && (
        <ul className="space-y-2">
          <TypingIndicator />
        </ul>
      )}
```

replace with:

```tsx
      {typing && (
        <ul className="space-y-2">
          <TypingIndicator avatar={avatar} />
        </ul>
      )}
```

---

## Step 4 — `components/nina/ChatScreen.tsx`

**4a.** Add to the destructured parameter list. Find:

```tsx
export function ChatScreen({
  initial,
  todayISO,
  userId,
  sessionId,
  pending,
  pendingPhoto,
  flight,
}: {
```

replace with:

```tsx
export function ChatScreen({
  initial,
  todayISO,
  userId,
  sessionId,
  pending,
  pendingPhoto,
  flight,
  avatar,
}: {
```

**4b.** Declare it. Find the end of the type block:

```tsx
  flight: NinaFlightView
}) {
```

replace with:

```tsx
  flight: NinaFlightView
  /**
   * **R1. Her face as the profile settings currently have it** — the current album row's blob URL,
   * its natural size, and its saved crop triple; or the committed `/nina/avatar-001.png` with a
   * null crop when there is no album row.
   *
   * Resolved on the server by `ninaAvatarView(getCurrentNinaAvatar(userId))` — the SAME call whose
   * result `app/nina/page.tsx` hands to `<NinaSidebar>`, which is the whole point: the 28 px
   * circle beside the typing dots and the 44 px circle in the sidebar read one row and therefore
   * cannot show two different faces or two different framings.
   *
   * This screen renders no avatar itself. The prop exists to reach `TypingIndicator` through
   * `MessageList`, and it stops there.
   *
   * `description` is NOT part of the shape (`ChatAvatar` omits it) and the call site destructures
   * field by field, so `glm-4.6v`'s private prose cannot ride into a client component — invariant
   * 5, the same care `pendingPhoto` takes above.
   *
   * REQUIRED rather than optional, on RULING E2b's habit and for the reason `sessionId`,
   * `pendingPhoto` and `flight` are: `app/nina/page.tsx` is the one caller and `tsc` should be what
   * notices if it stops passing it. An optional prop defaulting to the fallback is exactly how the
   * typing row came to ignore the album for as long as it did.
   */
  avatar: ChatAvatar
}) {
```

**4c.** Import the type. Find:

```tsx
import type { ChatMessage } from './types'
```

replace with:

```tsx
import type { ChatAvatar, ChatMessage } from './types'
```

**4d.** Pass it to `MessageList`. Find:

```tsx
        <MessageList
          messages={messages}
          typing={showTyping}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
          restoreMark={mark}
          flashId={flashId}
          onReply={handleReply}
          onJumpToQuote={handleJumpToQuote}
          onRequestActions={handleRequestActions}
          onOpenImage={handleOpenImage}
        />
```

replace with:

```tsx
        <MessageList
          messages={messages}
          typing={showTyping}
          todayISO={todayISO}
          keyboardOverlapPx={overlap}
          restoreMark={mark}
          flashId={flashId}
          avatar={avatar}
          onReply={handleReply}
          onJumpToQuote={handleJumpToQuote}
          onRequestActions={handleRequestActions}
          onOpenImage={handleOpenImage}
        />
```

---

## Step 5 — `app/nina/page.tsx`

One edit, at the `<ChatScreen>` call. `const avatar = ninaAvatarView(avatarRow)` already exists at
line 259 — **do not add a second call and do not add a read.**

Find:

```tsx
        <ChatScreen
          key={activeSessionId ?? 'none'}
          initial={initial}
          todayISO={todayISO}
          userId={userId}
          sessionId={activeSessionId}
          pending={pending}
          pendingPhoto={pendingPhoto}
          flight={flight}
        />
```

replace with:

```tsx
        {/*
          R1. `avatar` is destructured field by field, NOT spread — `ninaAvatarView`'s
          `description` is `glm-4.6v`'s private prose (invariant 5) and must not cross into a
          client component. Identical care to the `<NinaSidebar>` call below, and identical
          VALUE: both circles render the row `getCurrentNinaAvatar` returned, so the 28 px face
          beside the typing dots and the 44 px face in the sidebar cannot disagree about which
          photo is current or where it is cropped.
        */}
        <ChatScreen
          key={activeSessionId ?? 'none'}
          initial={initial}
          todayISO={todayISO}
          userId={userId}
          sessionId={activeSessionId}
          pending={pending}
          pendingPhoto={pendingPhoto}
          flight={flight}
          avatar={{ src: avatar.src, natural: avatar.natural, crop: avatar.crop }}
        />
```

---

## Step 6 — `tests/nina.chatAvatar.test.ts` (new)

`vitest.config.ts` is `environment: 'node'` — no jsdom, no React render. The repo's established
answer for an invariant that lives in source shape is a `readFileSync` assertion
(`tests/nina.softDelete.test.ts`, `tests/motion.reducedMotion.test.ts`,
`tests/admin.shell.test.ts`). Write the whole file:

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * **R1 — the chat's 28 px circle renders her CURRENT face, not the committed PNG.**
 *
 * The reported bug was `<NinaAvatar size="sm" />` in `TypingIndicator`, with no `src` and no
 * `crop`: `NinaAvatar`'s defaults then selected `/nina/avatar-001.png` and its `isFallback`
 * branch, so `ninaCropStyle` was never called for that circle and neither the current album photo
 * nor its saved framing could reach it. Nothing threw; the circle was simply always the same face.
 *
 * ── WHY THIS IS A SOURCE-TEXT TEST ───────────────────────────────────────────────────────────
 * `vitest.config.ts` is `environment: 'node'` — there is no DOM to render into and no rendered
 * `style` attribute to assert. What broke was a PROP CHAIN, and a prop chain is a fact about the
 * source. Three files in this suite already take that route for the same reason
 * (`nina.softDelete`, `motion.reducedMotion`, `admin.shell`), and a chain of four hops is exactly
 * the thing a reviewer's eye skips.
 *
 * `tsc` catches three of the four hops on its own, because the prop is REQUIRED at `ChatScreen`
 * and at `MessageList`. It does NOT catch the fourth: `TypingIndicator`'s prop is optional by
 * design (it is `aria-hidden` decoration and should degrade to the committed face, never crash),
 * so deleting `avatar={avatar}` from the `<TypingIndicator>` call compiles cleanly and silently
 * restores the bug. That one hop is the reason this file exists; the rest are asserted because a
 * test that checks the weak link and not the chain reads as if the chain were not the point.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('the chat avatar follows the current profile settings (R1)', () => {
  it('TypingIndicator hands NinaAvatar a src, a natural size and a crop', () => {
    const source = read('components/nina/TypingIndicator.tsx')

    // The defect, spelled exactly: a bare `size="sm"` with no other attribute.
    expect(source).not.toMatch(/<NinaAvatar\s+size="sm"\s*\/>/)

    expect(source).toMatch(/src=\{avatar\?\.src\}/)
    expect(source).toMatch(/natural=\{avatar\?\.natural \?\? null\}/)
    expect(source).toMatch(/crop=\{avatar\?\.crop \?\? null\}/)
  })

  it('MessageList passes the avatar to TypingIndicator', () => {
    const source = read('components/nina/MessageList.tsx')

    // The one hop `tsc` cannot see, because TypingIndicator's prop is optional on purpose.
    expect(source).toMatch(/<TypingIndicator avatar=\{avatar\} \/>/)
    expect(source).not.toMatch(/<TypingIndicator\s*\/>/)

    // Required, so a future second caller is a compile error rather than a silent fallback.
    expect(source).toMatch(/\n {2}avatar: ChatAvatar\n/)
  })

  it('ChatScreen passes the avatar to MessageList', () => {
    const source = read('components/nina/ChatScreen.tsx')

    expect(source).toMatch(/avatar=\{avatar\}/)
    expect(source).toMatch(/\n {2}avatar: ChatAvatar\n/)
  })

  it('the page passes the same ninaAvatarView result to both circles', () => {
    const source = read('app/nina/page.tsx')

    // ONE resolution, feeding both surfaces — this is what makes the two circles agree.
    expect(source.match(/ninaAvatarView\(/g)).toHaveLength(1)
    expect(source).toMatch(
      /avatar=\{\{ src: avatar\.src, natural: avatar\.natural, crop: avatar\.crop \}\}/,
    )
    expect(source).toMatch(
      /avatar=\{\{ src: avatar\.src, natural: avatar\.natural, crop: avatar\.crop \}\}[\s\S]*?<NinaSidebar/,
    )
  })

  it('description never crosses into a client component (invariant 5)', () => {
    const page = read('app/nina/page.tsx')
    const types = read('components/nina/types.ts')

    // The triple is destructured field by field; a spread would carry the private prose.
    expect(page).not.toMatch(/avatar=\{\{ \.\.\.avatar/)
    expect(page).not.toMatch(/avatar=\{avatar\}/)

    // And the type has no room for it even if a call site tried.
    const shape = types.slice(types.indexOf('export interface ChatAvatar'))
    expect(shape).not.toMatch(/description/)
  })
})
```

**On the `toHaveLength(1)` assertion:** `app/nina/page.tsx` imports `ninaAvatarView` and calls it
once, at line 259. Asserting the call count is what pins "one resolution feeds both circles" — a
second call would compile, render identically today, and re-open the door to the two surfaces
drifting apart the moment one of them is given a different row. The import statement itself is
`import { … ninaAvatarView } from '@/lib/nina/album'` and contains no `(`, so it does not match.

---

## Verification

Run in the worktree, in this order:

```bash
cd /home/miftah/.worktrees/run-insights/nina-chat-avatar-profile
npx tsc --noEmit
npm run lint
npm test -- tests/nina.chatAvatar.test.ts
npm test
npm run build
```

`npx tsc --noEmit` is first because it is the fastest way to see all three required-prop hops land;
if `avatar` is missing at any of them it fails there and the rest is noise.

**Then look at it.** The unit test asserts the wiring, not the pixels:

```bash
npm run dev
```

Open `/nina`, send a message, and watch the typing row while she composes. Two things must be
true at once:

1. The 28 px circle beside the three dots shows the **same photo** as the 44 px circle at the top
   of the sidebar (open it with the `>` control), **framed the same way** — same zoom, same
   centring.
2. Change the current photo or its framing in `/admin/nina`, reload `/nina`, and both circles move
   together.

If there is no album row on this machine, both circles show `/nina/avatar-001.png` centred cover —
that is invariant 3 holding, not a failure.

## Rollback

Single commit; `git revert` it. No migration, no data write, no external state.
