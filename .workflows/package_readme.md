# Package: run-insights (application root)

**Location**: `.`
**Last Updated**: 2026-09-11 (task `P1-CA-A005`, phase 3 of 4 of the `IMAGE_COLLECTION_PLAN.md`
set — one describe control on every photo of the page, and the window's described photographs now
reach Nina's context on every turn; with phase 4 (`P1-RI-A036`) the set is complete; previously
2026-09-11, task `P1-RI-A036`, phase 4 of the same set — every user-visible "Nina's album"
renamed to "Image collection" (nav label + phone-bar
`short: 'Photos'`, the overview card, `/admin/nina`'s `h1`, the personality page's copy,
`ADMIN_INSTALL.description`) and the explorer grid restyled to the Photo-reference picker's
borderless sheet, pinned by the new `tests/admin.photoGrid.test.ts`; previously 2026-09-10, task
`P1-RI-A034`, phase 1 of the same set —
the Media read path: a virtual `Media` tree node pinned under the album root and addressed by the
`?view=media` parameter, never by a folder path; the paginated all-kinds originals read
`listNinaMediaPhotos` / `countNinaMediaPhotos` behind it; `ExplorerPhoto` becomes a discriminated
union; read-only, no Server Action touched; previously task `P1-RI-A031` — the focus-card hint
purge, `imageFocusCopy` returning a plain string and `NinaImageFocusSpec.userSaid` deleted; before
that `P1-RI-A025` — the tuning revision mechanism purged stack-wide, its migration committed but
deliberately not yet applied)

## Overview

The repository root is not a library. It is the Next.js application itself — the route tree under
`app/`, the authentication edge (`auth.ts`, `auth.config.ts`, `proxy.ts`), the build and test
configuration, and the **shell contract**: the agreement about which fixed chrome each screen
renders and how much room the screen leaves at the bottom for it.

That contract is the one thing no sub-package can own, because it is spread across five of them by
necessity. `components/ui/AppShell.tsx` *chooses* the chrome; `components/ui/TabBar.tsx` and
`components/nina/ChatChrome.tsx` *render* it; `lib/nina/chrome.ts` and `lib/nina/chatview.ts`
*decide where it sits*; `app/nina/page.tsx` *picks the mode*. Any single one of those files read
alone is missing the arithmetic that makes the other four correct, and the arithmetic is spelled in
four different languages — TypeScript constants, a Tailwind arbitrary value, an inline `translate`,
and a CSS custom property — because none of those four can read the others.

**Key Responsibilities:**

- Hold the shell contract: `AppShellScreen`, the bottom-gap table, and which component renders the
  bar for each mode.
- Own the bottom-chrome geometry and the list of places the same numbers are written, so a change
  to one is a change to all of them.
- Own the server/client seam that lets a Server Component shell hand a server-rendered unread badge
  to a client bar without a fetch, a poll, or a prop threaded through every page.
- Own the route tree, and which routes get chrome at all.
- Own the auth edge and the repo-wide build, lint and test configuration.

## The shell contract

### `AppShellScreen` — one prop for the chrome *and* the gap

```ts
// components/ui/AppShell.tsx
export type AppShellScreen = 'tabs' | 'chat'

export function AppShell({
  children,
  className,
  screen = 'tabs',
}: {
  children: React.ReactNode
  className?: string
  screen?: AppShellScreen
}): React.JSX.Element

export function ScreenHeader({ title, action }: { title: string; action?: React.ReactNode })
```

One prop selects both the chrome and the padding that clears it, **because they cannot be allowed
to disagree**. A screen whose padding clears a bar it does not render ends in a strip of empty
paper; a screen that renders a bar its padding does not clear ends in a sliced bubble. Two props
would make both of those states expressible; one prop makes them unrepresentable.

| `screen` | chrome rendered | bottom gap | used by |
|---|---|---|---|
| `'tabs'` (default) | `<TabBar>`, unconditional | `pb-[calc(6rem+var(--safe-bottom))]` | `/`, `/trends`, `/me`, `/r/[id]`, `/nina/about`, and both `loading.tsx` fallbacks |
| `'chat'` | `<ChatChrome>` — **no bar on screen**, one floating control | `pb-[calc(7.5rem+var(--safe-bottom))]` | `app/nina/page.tsx` only |

> **Renamed in P1-RI-A006.** The prop was `bottomGap` and the type was `AppShellBottomGap`. The
> value now selects the chrome as well as the gap, and the old name described half of what it does.
> **Callers must use `screen`**; `<AppShell bottomGap="chat">` no longer type-checks. Nothing but
> `app/nina/page.tsx` ever passed the prop, and nothing in `app/`, `components/`, `lib/` or
> `tests/` imports either type name — but plan and analysis documents written before that phase
> still quote the old spelling, and they are quoting a tree that no longer exists.

`AppShell` is **not** re-exported from `components/ui/index.ts`, and must not be added back. The
barrel is a client-safe kit that ten client components import; `AppShell` renders Nina's unread
badge, which is an async Server Component that reads the session and therefore reaches `auth.ts`
and the `server-only` `lib/env.ts`. In the barrel it turned every `import { Card } from
'@/components/ui'` in a `'use client'` file into a build error and put the shell into
`/s/[token]`'s static import graph, where `tests/share.bundle.test.ts` refused it. Import it from
`@/components/ui/AppShell`.

### Who renders the bar, and why there is a third component

```tsx
{screen === 'chat' ? (
  <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />} />
) : (
  <TabBar ninaBadge={<NinaUnreadBadgeSlot />} />
)}
```

`AppShell` has no `'use client'` and must keep it that way, so it can construct the server-rendered
`<NinaUnreadBadgeSlot />` element that the client `TabBar` then renders as a child. `ninaBadge` is a
`ReactNode` prop rather than a number for exactly that reason: the count never crosses into the
client bundle and no route handler had to be invented to fetch it.

The reveal state therefore cannot live in `AppShell` (it would force `'use client'` onto a file five
pages import), and it cannot live in `TabBar` either — a hidden bar is translated off screen, so a
control *inside* it would be unreachable. `ChatChrome` is the client component in between: it owns
the state and renders `TabBar` with the badge it was handed.

### The reveal rules — `lib/nina/chrome.ts`

Every part of the reveal that is a decision rather than markup is a pure function with no DOM type
in any signature, because `vitest.config.ts` runs `environment: 'node'`: there is no jsdom, no
`visualViewport`, no timer to advance inside a rendered component and no element to measure. A rule
that lives in a component cannot be asserted in this repo at all. The component measures; this
module decides. `lib/nina/chrome.test.ts` is the co-located suite.

```ts
export type NinaBarState = 'hidden' | 'shown'          // 'hidden' is /nina's resting state
export type NinaChromeEvent = 'toggle' | 'autohide' | 'composer-engaged' | 'composer-released'

export const CHROME_AUTOHIDE_MS = 5_000
export const CHROME_CONTROL_PX = 32          // was 44; the repo owner asked for a smaller disc
export const CHROME_CONTROL_GAP_PX = 8
export const NINA_CHROME_CONTROL_CLASS: string   // the `>` and `^`/`v` discs' shared skin
export const COMPOSER_RESTING_PX = 68

export function nextBarState(state: NinaBarState, event: NinaChromeEvent): NinaBarState
export function autoHideDelayMs(state: NinaBarState, composerEngaged: boolean): number | null
export function isControlVisible(composerEngaged: boolean): boolean
export function barToggleGlyph(state: NinaBarState): 'up' | 'down'
export function controlBottomCss(input: {
  barState: NinaBarState
  barClearancePx: number
  composerHeightPx: number
}): string
```

`nextBarState` is total over the event union, so `tsc` catches a fifth event the day one is added:

| event | `'hidden'` → | `'shown'` → | why |
|---|---|---|---|
| `'toggle'` | `'shown'` | `'hidden'` | the floating control, both directions |
| `'autohide'` | `'hidden'` | `'hidden'` | **idempotent on purpose** — a timer that fires after the runner already pressed `v` must not toggle the bar back on, so the event means "be hidden", not "flip" |
| `'composer-engaged'` | `'hidden'` | `'hidden'` | see below |
| `'composer-released'` | `'hidden'` | `'shown'` | unchanged — a bar that pops back up when he taps away from the textarea is the app overruling a decision he made with the toggle |

**Engaging the composer hides the bar rather than pausing the timer.** The obvious rule is "do not
auto-hide while he is typing", and on iOS that rule is a trap: Safari does not resize the layout
viewport when the software keyboard opens, so the composer is lifted onto the keyboard's top edge
while the `fixed bottom-0` bar sits *behind* the keyboard. A bar that is "shown" there is shown and
invisible, and the paused timer then fires the instant he blurs, hiding a bar he never saw. Hiding
on engage gives the same guarantee — the bar cannot retract mid-sentence because it is never
showing mid-sentence — by a shorter route.

**Focus, not the keyboard, is the signal.** `keyboardOverlapPx` is an iOS measurement by
construction (`innerHeight - visualHeight - visualOffsetTop`), and Android *does* resize the layout
viewport, so that difference is ~0 there. Focus inside the composer is true on both platforms and
is the *cause* of the keyboard rather than a proxy for it, so `ChatChrome` subscribes to focus and
does not duplicate the `visualViewport` subscription `ChatScreen` already owns.

`isControlVisible` retracts the control while the composer is engaged, for the decisive reason that
with a keyboard up the composer is lifted onto it and the control's computed offset would put the
control *behind* the keyboard — a button that cannot be pressed.

`barToggleGlyph` gives one control two glyphs. The requirement named both `^` and `v`; this is the
reading that makes both true without leaving a permanently dead second button on the conversation.
It returns a semantic `'up' | 'down'` rather than a character, so the component owns the SVG path
and the accessible name (`aria-expanded` + `aria-controls="main-tab-bar"`, which is what makes a
single control announce correctly) and this module owns the rule.

### The geometry, and why the same numbers are written more than once

**The bar occupies exactly its own border box, and every clearance is derived from that.** Until
`P1-RI-A015` it did not: `/upload` was a 56 px coral FAB, `absolute -top-5` against the grid and
therefore out of flow, so 20 px of it painted above the nav's top edge and over whatever screen was
behind — on `/nina`, over the newest bubble. It is now the third of five ordinary tab cells (a
`size-5` `+` glyph over a `text-[10px]` caption reading `New`, coral at rest *and* when active via
an optional `accent` prop on the module-local `Tab`), the overhang constant that named those 20 px
is **deleted** and no longer exists anywhere in the source, and the hide transform is a plain
`translate: '0 100%'` with no `calc()` on top.

```
TAB_BAR_HEIGHT_PX        = 58      components/ui/TabBar.tsx      ⟷ h-[58px]        the GRID's height
TAB_BAR_BORDER_PX        = 1       components/ui/TabBar.tsx      ⟷ border-t
TAB_BAR_OUTER_HEIGHT_PX  = 59      components/ui/TabBar.tsx        = 58 + 1        the bar's TOP EDGE
BAR_CLEARANCE_PX         = 59      components/nina/ChatChrome.tsx  = TAB_BAR_OUTER_HEIGHT_PX
COMPOSER_CLEARANCE_PX    = 59      components/nina/ChatScreen.tsx  = TAB_BAR_OUTER_HEIGHT_PX
COMPOSER_FALLBACK_PX     = 127     components/nina/ChatScreen.tsx  = 59 + 68
COMPOSER_RESTING_PX      = 68      lib/nina/chrome.ts            ⟷ Composer's py-3 (24) + min-h-11 (44)
CHROME_CONTROL_PX        = 32      lib/nina/chrome.ts            ⟷ size-8 in NINA_CHROME_CONTROL_CLASS
CHROME_CONTROL_GAP_PX    = 8       lib/nina/chrome.ts
BOTTOM_GAP.chat  = pb-[calc(7.5rem+var(--safe-bottom))]   components/ui/AppShell.tsx  = 68 + 8 + 32 + 12 = 120
BOTTOM_GAP.tabs  = pb-[calc(6rem+var(--safe-bottom))]     components/ui/AppShell.tsx  = 96
translate (hidden) = '0 100%'                             components/ui/TabBar.tsx
```

**The outer height is one constant rather than a sum spelled at two call sites**, and that is the
whole design: a caller cannot forget a term that lives inside the constant. `TAB_BAR_HEIGHT_PX` is
still exported and is still the grid's own height — `AppShell.tsx` and `PhotoViewer.tsx` cite it by
name when they explain their own Tailwind literals — but nothing stacking *above* the bar may use
it, because the bar's top border is its top edge.

**These are all the same handful of numbers, and nothing in the toolchain checks that they agree.**
Tailwind cannot read a TypeScript constant, an inline `translate` cannot read a Tailwind class, and
`--safe-bottom` (`env(safe-area-inset-bottom, 0px)`, declared in `app/globals.css`) is readable
only to CSS. So the numbers are spelled several times by necessity, and **changing one without the
others is a silent visual bug, not a type error**:

- Change `TAB_BAR_HEIGHT_PX` without `h-[58px]`, or `TAB_BAR_BORDER_PX` without the `border-t` (or
  either reverse), and every clearance built on the outer height is wrong by exactly the
  difference: the composer floats above the bar or is overlapped by it, because `composerBottomCss`
  is passed a clearance the bar no longer has. `tests/tabbar.geometry.test.ts` asserts both classes
  still exist in the source, which is the cheapest possible alarm for that.
- Use `TAB_BAR_HEIGHT_PX` where the outer height belongs and you re-open the seam. **MEASURED
  (R2):** with the bar revealed on `/nina` the composer did not rest on it — a band of the
  scrolling conversation showed between the composer's bottom border and the bar's top border. Most
  of that band was the FAB's 20 px overhang, which the composer had to clear or the coral circle
  would have been sliced; the last pixel of it was the `border-t`, which no clearance term had ever
  counted. Deleting the FAB closed 18 px of 19; the outer height closes the last one. The two
  regression cases in `tests/tabbar.geometry.test.ts` fail on the literal text
  `const BAR_CLEARANCE_PX = TAB_BAR_HEIGHT_PX` / `const COMPOSER_CLEARANCE_PX = TAB_BAR_HEIGHT_PX`.
- Re-derive the sum at a call site (`TAB_BAR_OUTER_HEIGHT_PX` is deliberately not
  `TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX` written out in `ChatChrome`/`ChatScreen`) and you have a
  third file with an opinion about how tall the bar is. The same suite asserts neither component
  names `TAB_BAR_BORDER_PX` at all.
- Position anything out of the nav's flow again and **`hidden` stops being able to be `0 100%`**.
  `100%` is the nav's border box and nothing more; the old FAB's `size-14` box spanned `safe+22` to
  `safe+78` while `100%` reached only `59px + safe`, so 20 px of coral sat on screen with the bar
  supposedly hidden — on phones with no home-indicator inset only, which is why it survived. The
  hide transform is the second thing that breaks; `tests/tabbar.geometry.test.ts` fails on any
  `calc` in that property, and on `absolute`, `-top-`, `size-14` or `bg-z5` anywhere in the file.
- Change the composer's `py-3` / `min-h-11` without `COMPOSER_RESTING_PX` and the floating control
  either overlaps the composer or drifts away from it before the first measurement lands.
- Change any of `COMPOSER_RESTING_PX`, `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX` or the
  composer's own geometry without `BOTTOM_GAP.chat` and the newest bubble is sliced by the composer
  or sits above a strip of empty paper.

No tab-bar constant is in `BOTTOM_GAP.tabs`'s or `BOTTOM_GAP.chat`'s sum, for two different
reasons. On `/nina` the bar is not below the composer at all. On the four tabbed screens the 96 px
*is* the bar plus room, but it was documented as "58 px bar + the FAB's 20 px overhang + breathing
room" and the **value is deliberately unchanged** now that the overhang is gone: the report was a
gap between two bars on `/nina`, not too much padding under the content on four screens nobody
complained about, and the 20 px that used to be the overhang is simply breathing room — which is
what it always looked like.

`BOTTOM_GAP.chat` is also **fixed, not dynamic**: this padding is the document's height, so making
it follow the reveal would move the scroll position on every toggle and `MessageList`'s auto-scroll
would chase it. While the bar is showing, the composer rises 59 px and the last bubble sits behind
it for those five seconds — the right trade, because a runner who pulls up the bar is on his way to
another tab, not re-reading the last line.

`controlBottomCss` composes the lane's `bottom` as the bar's clearance (only when showing) plus the
measured composer height plus the gap plus the inset. That is what keeps the lane clear of the
composer's Send button at every composer height, and — now that the bar paints nothing above its
own border box — clearing the bar is clearing the whole of it. Degenerate input is the resting
screen rather than an error: a non-finite or non-positive composer height means "not measured yet"
and falls back to `COMPOSER_RESTING_PX`; a non-finite or negative clearance contributes nothing; a
hidden bar contributes no clearance whatever the argument says.

### `--nina-bar-visible` — the channel across the sibling gap

```ts
// lib/nina/chatview.ts
export const NINA_BAR_VISIBLE_VAR = '--nina-bar-visible'

export function composerBottomCss(overlapPx: number, chromeClearancePx: number): string
// keyboard up  → `${overlap}px`
// keyboard down → `calc(${clearance}px * var(--nina-bar-visible, 0) + var(--safe-bottom))`
```

The composer is **not a descendant of the component that owns the reveal state**: `AppShell`
renders `<main>` (containing `ChatScreen`, which renders `Composer`) and the chrome as *siblings*.
`:root` is the nearest thing both inherit from, so a CSS custom property is the one channel that
crosses that gap without threading a boolean through three components with no other use for it.
`ChatChrome` sets the property to `1` while the bar is shown and removes it otherwise; the `, 0`
fallback is what makes the server's HTML and the first client frame agree.

**A multiplier, not a length.** `calc(<length> * <number>)` keeps the number 59 inside
`composerBottomCss`, where the caller already passes it, instead of moving it into whichever
component writes the variable. The flag then says one thing only — *is the bar on screen* — and
cannot disagree with `TAB_BAR_OUTER_HEIGHT_PX` about how tall the bar is. A
`var(--nina-bar-clearance, 0px)` form would put the geometry in two places. The default is `0` and
not the clearance because the resting state is a hidden bar: an absent variable means the composer
paints on the home-indicator inset, so there is no 59 px settle between the server's HTML and the
first client frame.

The `--safe-bottom` term sits **outside** the multiplication and outside the keyboard branch,
because the inset is the phone's, not the bar's, and it is there whether or not the bar is. It is
honoured here rather than as the composer's own padding for the same reason the control lane
honours it rather than padding itself: everything in this stack sits above chrome that already pads
by `--safe-bottom`, so padding twice opens a gap. (`--safe-bottom` is inert without
`viewport-fit=cover` in the root layout — already set, and load-bearing.)

### Motion

The reveal is a `translate` **transition** with a `prefers-reduced-motion` escape, never a
keyframe:

```
'transition-[translate] duration-200 ease-out motion-reduce:transition-none'
translate: hidden ? '0 100%' : '0 0'
```

Both ends are written explicitly, because `translate`'s initial value is `none` and interpolating
from it does not animate. `100%` with no arithmetic on top is sufficient **only because the nav's
border box is the whole of the bar** — see the geometry section above. `transition-[translate]` and
not `transition-transform`: Tailwind v4 compiles `translate` and `scale` to separate CSS longhands
(which is why the floating discs' `active:scale-[0.97]` composes with a translate instead of
overwriting it), so `translate` is the property that actually changes and naming it removes the
question.

`tests/motion.reducedMotion.test.ts` guards the repo-wide contract by reading source as text —
every keyframe an `[animation:…]` utility runs must be redefined as genuinely still under the
reduced-motion query, and no keyframe may be defined and never used. Because this reveal is a
transition rather than a keyframe, `lib/nina/chrome.test.ts` asserts the escape itself: that the
`translate` longhand is the animated property, that the bar holds still under
`prefers-reduced-motion`, and that no keyframe was added.

The hidden bar is marked **`inert`, not `aria-hidden` and not `hidden`**. A bar translated off
screen is still in the tab order; `hidden` would remove it from layout and take the transition with
it.

## Nina's chat sessions — F35

Three phases of the chat-sessions set landed features that live in `lib/nina` and
`components/nina` rather than in the shell above. There is no `components/nina/.workflows/`
readme yet, so they are recorded here.

**Session titling (F35 R3).** A new session names itself. `lib/nina/title.ts` is pure and holds
both title rules — the model's 3-4 word answer (`sanitizeNinaModelTitle`, which refuses prose,
empty answers and anything with no letter in it, because a bad title is worse than none when the
title *is* the session list) and his manual rename (`sanitizeNinaSessionTitle`, which cleans and
clamps but imposes no word rule, because R3's "3-4 words" constrains the model and not the
runner). It stays free of `server-only` on purpose, so a client component can read it.
`lib/nina/autotitle.ts` holds the one `glm-5.3` call behind `import 'server-only'`, fired from
`sendNinaMessage`'s success path inside `after()` and never awaited in a render. Idempotence is a
row, not a variable: `setNinaSessionTitleIfUntitled`'s `WHERE … AND title IS NULL` means a
double-invoked `after()` or two racing tabs still produce exactly one title. A manual title is
never overwritten — `title_source` makes that check one primary-key read — and nothing is
persisted on failure, so the next turn retries for free.

**The sidebar (F35 R6/R7/R4/R11).** `NinaSidebar.tsx` / `SessionList.tsx` / `SessionRow.tsx` are
the full-screen chat list behind `/nina`'s floating `>`. The panel is an overlay, not a route: its
open state is `?sidebar=1` in the URL, pushed with `window.history.pushState`, so the platform
back gesture closes it and the conversation behind it is never unmounted. `NinaSidebarProvider`
exists for exactly one ref — the trigger pushes the history entry and the panel closes it, from
two different subtrees, so a single shared `pushedRef` is what stops every open/close leaving a
dead back-swipe. It is always mounted with `inert={!open}`, because `transitionend` never fires
under `motion-reduce:transition-none` and unmount-on-exit would strand the panel open under Reduce
Motion. Nina's circle lives here now — `/nina` has no header row at all (R7). Every rule the panel
obeys is a pure function in `lib/nina/sidebar.ts` with a suite; the ordering is phase 1's and no
component re-sorts it.

**Editing and deleting messages (F35 R8).** Any bubble, either side of the conversation, can be
rewritten or removed: swipe it left, or tab to its second `sr-only`-until-focused button. This is a
data-layer feature with a UI on top — `getNinaMessageWindow` reads `nina_messages.text` verbatim
into every later prompt, so an edited row is what was said and a deleted row is a thing that never
happened. The rules live in the pure `lib/nina/edit.ts` (his cap 4000, hers 700 — pinned to
`lib/nina/schema.ts` by test rather than imported, so zod stays out of the chat bundle; an empty
edit on a text-only message is refused and names delete instead; the left-swipe gate reuses
reply's distance and dominance and adds a 24 px right-edge guard for iOS Safari's
forward-navigation zone). The writes are `lib/nina/messageActions.ts`, owner-scoped and refusing
rather than degrading on a foreign id; the delete reads the image rows *before* the cascade takes
them so the orphaned blob pathnames are logged and findable — `reap-orphaned-blobs` does not cover
`nina/` yet, which is its own card.

**Chat search (F35 R6).** The sidebar's field searches every message and session title the runner
owns across all sessions. Rules live in `lib/nina/search.ts` — pure, no `server-only`,
unit-tested — because the field, the action and the ranker all import them. Matching is
`ILIKE '%term%'` AND-chained per term over `nina_messages.text` and `nina_chat_sessions.title`,
deliberately not `to_tsvector`: the corpus is mixed Indonesian and English and one `regconfig`
mis-stems half of it. The `AI` switch persists in `localStorage` under `ri:nina:semantic-search`
(the first client-side persistence here, read through `useSyncExternalStore` so hydration cannot
mismatch) and adds a `glm-5.3` ranking pass over candidates narrowed by SQL and padded with a
recency window — the padding is what lets a query sharing no words with a message still find it.
The model is never awaited in a render path (`rankNinaSearchHits`, payload-guarded); when it is
unavailable the results fall back to the text ranking and the field says so, because an empty list
would be a false claim about the runner's own history. A hit is a real `<Link>` to
`/nina?s=<session>&at=<message>~0` — phase 3's parameter and `lib/nina/scroll.ts`'s mark, no third
grammar. The rail's `+` creates a session and opens it (R2 — a full-width `Chat baru` row above
the list until P1-RI-A027 moved it to the bottom rail).

**Tapping a photo (F35 R10).** A photograph in the chat is a tap target. It opens the app's one
full-screen overlay (`components/ui/PhotoViewer`), paging across that bubble's photos only — the
conversation-wide gallery stays at `/nina/about`. Two controls float over it: a download whose
strategy is *chosen rather than assumed*, because `<a download>` is inert on a cross-origin Blob
URL (`lib/photos/save.ts` decides; a phone gets the platform share sheet and therefore Photos, a
mouse gets a fetched object URL), and an attach that pins the same blob to the next message
through `sendNinaMessage`'s owner-scoped `attachExisting` — one id crosses the wire, no byte is
re-uploaded, and the description `glm-4.6v` was paid for is copied server-side.

## Root modules — the auth edge

Four `.ts` files sit directly in the root. Three of them are Auth.js, split across two instances on
purpose.

### `auth.ts` — the Node-runtime instance

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({ ...authConfig, adapter })
```

The only module anything should import for `auth()`, `signIn()`, `signOut()` or the route handlers.
It calls `authEnv()` at **module scope**, so a missing `AUTH_SECRET` / `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` / `AUTH_URL` is a loud boot crash rather than a first-request failure.

It installs `DrizzleAdapter` **together with JWT sessions**, which looks contradictory and is not:
the adapter keeps `user` and `account` rows real, so `profiles.user_id → user.id` is a genuine
cascading FK. No `session` row is ever written, and the `session` table stays defined-and-empty
because `@auth/drizzle-adapter` requires all four tables to exist.

**`proxy.ts` must not import this file.** That is the whole reason the config is a separate module.

### `auth.config.ts` — the edge-safe half

`export const authConfig satisfies NextAuthConfig`, importing **nothing from the project** —
deliberately, because `lib/env.ts` opens with `import 'server-only'` and would poison the edge
bundle. One Google provider with `prompt: 'select_account'` and `access_type: 'online'` (no unused
refresh token is minted or stored), `allowDangerousEmailAccountLinking: false`, JWT sessions with a
30-day `maxAge` and a 1-day `updateAge`, `trustHost: true`, and `signIn`/`error`/`signOut` all
pointed at `/` — because `/` is both the runs list and the signed-out sign-in screen, and there is
no marketing page. The two callbacks do one thing between them: carry `user.id` through `token.sub`
into `session.user.id` (augmented in `types/next-auth.d.ts`). There is no sign-in gate and no
allowlist; any Google account may sign in, and safety is per-`userId` scoping instead.

### `proxy.ts` — a redirect, **not** the security boundary

```ts
export const proxy = withAuth((req) => { /* redirect to /?next=… when unauthenticated */ })
export const config = {
  matcher: ['/upload', '/r/:path*', '/x/:path*', '/trends', '/me', '/onboarding'],
}
```

It builds a **second, adapter-free** `NextAuth(authConfig)` instance, and it exists for UX only:
land on a protected URL while signed out and you arrive at `/` with `?next=` preserved. The actual
boundary is `lib/auth/requireUserId.ts`.

The matcher is **positive**, and the omissions are load-bearing: `/` and `/s/:token*` are public
(**never add the share route** — the pathname *is* the bearer token), the `/api/*` handlers
authenticate themselves, and `/nina` and `/admin/**` are omitted because they are protected by
`requireUserId()` and `requireAdmin()` respectively. `tests/auth.proxy.matcher.test.ts` asserts the
list.

The file is `proxy.ts`, not `middleware.ts`, and the export is `proxy` — the Next 16 rename (R-21).
`runtime` is not settable here.

### `next-env.d.ts`

Generated by Next; not to be edited.

## Internal Architecture

### Data flow — one reveal, end to end

```
app/nina/page.tsx  <AppShell screen="chat">
        │
        ├── <main class="pb-[calc(7.5rem+var(--safe-bottom))]">   ← fixed document height
        │        └── ChatScreen ── Composer
        │              bottomCss = composerBottomCss(overlap, COMPOSER_CLEARANCE_PX /* 59 */)
        │                        = calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))
        │
        └── <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />}>      ← 'use client', owns the state
                 │
                 │  focus on #nina-composer ──→ nextBarState(_, 'composer-engaged') → 'hidden'
                 │  tap the control          ──→ nextBarState(s, 'toggle')
                 │  autoHideDelayMs(s, engaged) ?? no timer ──5000ms──→ nextBarState(_, 'autohide')
                 │
                 ├── writes :root style --nina-bar-visible = '1' when shown, removes it when hidden
                 ├── floating control, rendered only when isControlVisible(engaged)
                 │     bottom = controlBottomCss({ barState, barClearancePx: BAR_CLEARANCE_PX /* 59 */,
                 │                                 composerHeightPx })
                 │     glyph  = barToggleGlyph(barState)
                 └── <TabBar hidden={barState === 'hidden'} ninaBadge={…} id="main-tab-bar">
                           translate: hidden ? '0 100%' : '0 0'
```

The four other tabbed screens take the left branch of `AppShell`'s ternary and are unchanged: an
unconditional `<TabBar>` with no `hidden` prop (default `false`), the same 58 px height, the same
unread dot. `TabBar`'s `hidden` and `ninaBadge` are both optional so that `app/(app)/loading.tsx`
and `app/trends/loading.tsx` keep compiling untouched — a loading fallback has no session to count
against and no reveal state to hold.

### The route tree, and its chrome

Sixteen pages, nine route handlers, three layouts. Two route groups — `(app)` and `(public)` —
neither of which contributes a URL segment.

| route | file | chrome | notes |
|---|---|---|---|
| `/` | `app/(app)/page.tsx` | `AppShell` (tabs) | runs list **and** the signed-out sign-in screen |
| `/upload` | `app/upload/page.tsx` | none — own full-bleed | the one flow that matters; the coral `New` tab, the bar's centre cell |
| `/x/[extractionId]` | `app/x/[extractionId]/page.tsx` | none — own full-bleed | pre-commit review; no run id exists yet |
| `/r/[id]` | `app/r/[id]/page.tsx` | `AppShell` (tabs) | the roadmap/wireframe disagreement below |
| `/r/[id]/edit` | `app/r/[id]/edit/page.tsx` | none — own full-bleed | post-review correction |
| `/trends` | `app/trends/page.tsx` | `AppShell` (tabs) | `maxDuration = 60` |
| `/me` | `app/me/page.tsx` | `AppShell` (tabs) | profile, records, badge shelf |
| `/nina` | `app/nina/page.tsx` | **`AppShell` (chat)** | `maxDuration = 60`; the only `screen` call site |
| `/nina/about` | `app/nina/about/page.tsx` | `AppShell` (tabs) | a pushed screen that keeps the bar |
| `/onboarding` | `app/onboarding/page.tsx` | none | standalone |
| `/admin`, `/admin/nina`, `/admin/personality`, `/admin/photos`, `/admin/image-generation`, `/admin/shortcuts`, `/admin/memory` | `app/admin/**` | none — `app/admin/layout.tsx` | a phone shell below `lg` (fixed four-cell `AdminNav`, all four safe-area insets) and the unchanged desktop rail at `lg`; the shell caps at `max-w-[1400px]`; its layout also carries the **second install contract** below |
| `/s/[token]` | `app/(public)/s/[token]/page.tsx` | none — own layout | public share; `force-dynamic`, plus `not-found.tsx` |

Route handlers, all `runtime = 'nodejs'`: `/api/auth/*` (re-exports Auth.js `handlers`),
`/api/health`, `/api/upload`, `/api/extract`, `/api/extract/[id]`, `/api/cron/rollup` and
`/api/cron/nina` (the two `vercel.json` crons, `maxDuration = 60`), and
`/api/admin/nina/upload`.

The ninth is the one that is not under `/api` and not `nodejs`:
**`app/admin/manifest.webmanifest/route.ts`**, `export const dynamic = 'force-static'`, serving
`application/manifest+json`. It is a hand-written handler rather than a second `manifest.ts`
because the `manifest` file convention is root-of-`app` only (verified in
`next/dist/lib/metadata/is-metadata-route.js`, whose matcher is anchored at the app root) — and it
is `force-static` because a hand-written handler is
dynamic by default in Next 16 while the convention route is cached, and the two should behave
alike.

`app/layout.tsx` is the root layout and the one place **`viewport-fit=cover`** is set — without it
`env(safe-area-inset-*)` returns zero and every `--safe-bottom` term in the geometry above silently
collapses. It also self-hosts Poppins via `next/font/google` and points `manifest` at
`app/manifest.ts` — the runner's install contract, and no longer the only one; see below.
`app/robots.ts` allows `/` and `/s/` and disallows the rest; `/s/` is
crawlable-but-`noindex` on purpose, because `Disallow` is not `noindex` and blocking it would break
the WhatsApp preview card. There is no `sitemap.ts`, no root `error.tsx` and no root
`not-found.tsx` — each absence is deliberate.

`app/actions/share.ts` is not a route: it holds the Server Actions `createShareLinkAction`,
`revokeShareLinkAction` and `setPhotoSharingAction`.

### Which screens get chrome at all

The bar is a prop rather than a route-group `layout.tsx` because `/upload`, `/x/*` and
`/r/[id]/edit` are feature screens with their own full-bleed chrome, and wrapping them by directory
would take a layout decision away from the feature that owns them. `/x/[id]`, `/r/[id]/edit`,
`/onboarding` and `/s/[token]` are pushed or standalone screens with no bar. `/r/[id]` is the one
case the roadmap (§4.8: a pushed screen) and the wireframes (§2.2: bar drawn) read differently —
**the wireframe wins**, because a run detail page is where a reader lands from a share link or
after a commit and then wants to go somewhere, and a screen with no way out is worse than one whose
chrome slightly over-claims.

`TabBar` itself is `'use client'` for exactly one reason: `usePathname`, for `aria-current`.
Nothing else in it is interactive — the tabs are plain `<Link>`s, so the bar works before
hydration. Its five-cell grid is what centres `/upload`, and `/upload` is the **third** of the five
entries in `TABS` for that reason alone: `(2 + 0.5) / 5` is exactly 50 % of the bar, where
appending it to the end would put it at 90 % and every type would still check. That centring
argument came from F33 and a raised circle; it is **superseded, not wrong** — what it made true of
a FAB is now true of a caption, and a grid cell needs no `left-1/2 -translate-x-1/2` to be centred.
`tests/tabbar.geometry.test.ts` asserts the label order.

### The install contract — two manifests on one origin

An install contract is invisible to lint, typecheck and build; only a phone can see it. So the
facts are stated once in **`lib/pwa.ts`** — names, colours, and the `PWA_ICONS` list — and read
from the three places that cannot see each other: the manifests, the layouts' `metadata`, and
`tests/pwa.install.test.ts` (40 cases).

There are **two** manifests, because a manifest describes one app and `start_url` is a single
value. Safari launches an installed home-screen tile from the `start_url` of whatever manifest the
page linked — **not** from the URL that was on screen. Every page linking the root manifest is why
"Add to Home Screen" from `/admin` used to install the runner's app, correctly.

| | runner | admin |
|---|---|---|
| constants | `INSTALL` | `ADMIN_INSTALL` |
| served by | `app/manifest.ts` (file convention) | `app/admin/manifest.webmanifest/route.ts` (handler) |
| linked from | `app/layout.tsx` | `app/admin/layout.tsx` |
| `id` / `start_url` | `/` | `/admin` |
| `orientation` | `portrait` — no landscape layout to rotate into | `any` — the admin shell has one |
| splash / theme | `--paper` `#c9e9fb` | `--paper-2` `#f1f7fb`, matching `/admin`'s `bg-paper-2` |
| notch band (`theme-color`) | `#c9e9fb` light / `#0e1b26` dark, from the root `viewport` | `#f1f7fb` light / `#162834` dark, from `app/admin/layout.tsx`'s own `viewport` |
| `shortName` | `Run Insights` (12 chars, the iOS ceiling) | `RI Admin` (8; no room to suffix the above) |

Both set `scope: '/'`, and for the admin one that is **load-bearing rather than copied**: anything
outside scope opens in a browser tab instead of the installed app, and `requireAdmin` answers a
session-less request with `redirect('/')`. A `scope: '/admin'` would eject the installed admin app
into Safari on exactly the day the cookie expired.

`metadata` resolves root → nested with duplicate keys **replaced**, which is what lets
`app/admin/layout.tsx` override `manifest` for that segment and nothing else. The same rule is a
trap one line down: `appleWebApp` is a nested field replaced *whole*, so it is written
`{ ...APPLE_WEB_APP, title: ADMIN_INSTALL.shortName }` — the spread is what keeps `capable: true`,
the single line that stops the install from being a bookmark, alive under `/admin`. Only the label
iOS draws under the icon differs. `statusBarStyle` stays `'default'` on the runner's terms
(`lib/pwa.ts` gates translucency on the runner's screens padding `--safe-top`; the tag is emitted
once from the root). There is deliberately **no `icons` key** in either layout: an explicit
`metadata.icons` suppresses the file-convention icons, which would silently delete the
apple-touch-icon Safari actually reads on install.

**`viewport` merges by key, and that is a different rule from `metadata`'s** — which is why
`/admin` can own its notch band without owning anything else. `app/admin/layout.tsx` exports a
`viewport` carrying `themeColor` and **nothing else**: a media-matched `ADMIN_INSTALL.paper` /
`ADMIN_INSTALL.paperDark` pair (`--paper-2`, `#f1f7fb` / `#162834`), so an installed admin tile's
status-bar band matches the shell it sits on instead of showing the runner's sky blue. Read from
the framework's source rather than assumed: `mergeViewport`
(`node_modules/next/dist/lib/metadata/resolve-metadata.js:315`) `structuredClone`s the *resolved
parent* and then iterates `for (const key_ in viewport)`, so a key the child omits is inherited
untouched. That is what keeps **`viewportFit: 'cover'` arriving from the root**, and with it all
four `env(safe-area-inset-*)` paddings in the admin shell. Restating `viewportFit` there would
create a second source of truth for the one value that must not drift — and it drifts silently,
because an inert inset renders as a layout that is merely slightly wrong. Next's own
`generate-viewport.md` documents no merge rule at all, so the source is the only authority.
`statusBarStyle` is unaffected and stays `'default'`: a tint on an opaque bar needs none of
translucency's prerequisites.

A useful consequence when probing this: metadata and `viewport` resolve from the segment tree
independently of what the page component *does*, so a session-less `curl` of `/admin` — a `307`
with an empty body, since `requireAdmin` redirects — still carries the complete resolved `<head>`.
Reading the served tags needs neither an auth cookie nor a live database.

Two things a reader will ask. **A second domain does not fix this** — the launch URL comes from
`start_url`, not the hostname, so `admin.example.com` would need the same field anyway, plus a DNS
record, a certificate, a second `AUTH_URL` and Google OAuth origin, a cross-origin session cookie
`auth.config.ts` does not issue, and an `images.remotePatterns` review. And **both tiles currently
draw the same art**: the admin manifest still lists `PWA_ICONS`. That is a known cost, not an
oversight.

## Dependencies

### External

Every runtime dependency is **exact-pinned** (no carets, `playwright` aside). The ones that shape
this package rather than a leaf:

- `next 16.3.1` — App Router, `proxy.ts` instead of `middleware.ts`, Turbopack by default (hence no
  `webpack` key in `next.config.ts`), and `next typegen` before `tsc` so `PageProps<'/nina'>` and
  `LayoutProps<'/admin'>` resolve.
- `react 19.2.8` / `react-dom 19.2.8` — the Server/Client Component split the shell seam depends on.
- `next-auth 5.0.0-beta.32` + `@auth/drizzle-adapter 1.11.3` — the two-instance auth edge above.
- `tailwindcss 4.3.3` (+ `@tailwindcss/postcss`) — v4 compiles `translate` and `scale` to separate
  longhands, which is why `transition-[translate]` is the correct property name for the reveal.
- `drizzle-orm 0.45.2` + `@neondatabase/serverless 1.1.0` — reached only through `lib/db`.
- `zod 4.4.3` — the environment contract in `lib/env.ts` and every request/LLM shape.
- `server-only 0.0.1` — the marker that makes the barrel/shell boundary a build error instead of a
  leak. `vitest.config.ts` aliases it to `tests/support/serverOnlyStub.ts`.

### The packages this root composes

`lib/` (23 subdirectories) holds all domain logic; `components/` (15 feature folders) holds the
React tree; `tests/` holds ~100 flat suites named `<area>.<thing>.test.ts`; `scripts/` holds the
operational scripts and the seven `check-*` CI guards; `tools/` holds the Python badge and icon art
pipeline; `drizzle/` holds generated SQL migrations; `types/` holds one module augmentation;
`docs/plans/archive/` holds the `F01`–`F33` feature plans; `research/` is the pre-build feasibility harness
(excluded from `tsconfig` and `eslint`). `lib/db` and `lib/admin` and `components/admin` have
package readmes of their own.

### Internal (root → packages)

- `components/ui/AppShell` — the shell every page wraps itself in; the only importer of
  `components/ui/TabBar` besides `ChatChrome` and the barrel.
- `components/nina/ChatChrome` — imported by `AppShell` for `screen === 'chat'`.
- `components/nina/NinaUnreadBadge` — `NinaUnreadBadgeSlot`, constructed on the server, passed down
  as a `ReactNode`.
- `lib/nina/chrome` — the reveal rules, and `NINA_CHROME_CONTROL_CLASS`: the floating pair's skin,
  which `NinaSidebar` (its trigger, and since P1-RI-A027 its bottom rail) and `NewChatButton` also
  read.
- `lib/nina/chatview` — `NINA_BAR_VISIBLE_VAR` (by `ChatChrome`), `composerBottomCss` and
  `keyboardOverlapPx` (by `ChatScreen`), and the panel's keyboard pair `NINA_KEYBOARD_OVERLAP_VAR`
  and `KEYBOARD_REASSERT_DELAYS_MS` (both by `NinaSidebar`).
- `lib/pwa` — the install contract (`INSTALL`, `ADMIN_INSTALL`, `APPLE_WEB_APP`, `PWA_ICONS`),
  read by `app/manifest.ts`, `app/layout.tsx`, `app/admin/manifest.webmanifest/route.ts` and
  `app/admin/layout.tsx`. Plain constants — no `server-only`, no env read, no image generation.
- `lib/cn` — class composition, by both `AppShell` and `TabBar`.
- `lib/env` — `server-only`; reachable from `AppShell` through the badge, which is why the shell is
  out of the UI barrel.

### Boundary rule

`lib/` never imports `components/`. That is why `controlBottomCss` takes `barClearancePx` as an
argument rather than importing `TAB_BAR_OUTER_HEIGHT_PX` itself — the constant is read in
`ChatScreen`/`ChatChrome`, on the components side, and passed in. `NINA_CHROME_CONTROL_CLASS` lives
in `lib/nina/chrome.ts` for the same direction: both consumers are components.

## Reverse Dependencies

### `AppShell` consumers

All eight of them, and there are only eight: `app/(app)/page.tsx`, `app/(app)/loading.tsx`,
`app/me/page.tsx`, `app/trends/page.tsx`, `app/trends/loading.tsx`, `app/r/[id]/page.tsx`,
`app/nina/about/page.tsx`, and `app/nina/page.tsx`. Five of them also take `ScreenHeader`.

`app/nina/page.tsx` is the **only** call site that passes `screen`. Every other consumer relies on
the `'tabs'` default, which is why the rename touched exactly one line outside `AppShell.tsx`
itself.

Deliberate non-consumers, each of which says so in a comment — do not "fix" them by wrapping them:
`app/upload/page.tsx` and `app/x/*` (full-bleed feature chrome of their own), `app/admin/layout.tsx`
and `components/admin/FileExplorer.tsx` (`AppShell` is the shell that hardcodes `max-w-[470px]` and
pairs itself with the runner's `TabBar`; the admin shell caps at `max-w-[1400px]` and carries its
own four-cell `AdminNav` — and `FileExplorer` is still desktop-shaped),
`app/(public)/s/[token]/page.tsx` (a public page, and the shell's import graph is what
`tests/share.bundle.test.ts` guards), and `components/profile/RecordsTable.tsx` (would drag
the shell across a client boundary for one empty state).

`/nina` deliberately does not use `ScreenHeader` either: a conversation's identity is a face and a
name, not a title and a link. Since F35 R7 the screen has no header row at all — her face appears
in `NinaSidebar`'s 44 px circle and in the 28 px circle beside the typing dots, and since
`P1-RI-A019` both are fed from the **same** `ninaAvatarView(...)` value that `app/nina/page.tsx`
resolves once (see the recent-changes note below).

### Geometry-constant consumers

`TAB_BAR_OUTER_HEIGHT_PX` is imported by `components/nina/ChatScreen.tsx` (as
`COMPOSER_CLEARANCE_PX`) and `components/nina/ChatChrome.tsx` (as `BAR_CLEARANCE_PX`, the control
lane's clearance) — the two files that stack fixed chrome above the bar, and the only two importers
of it. `TAB_BAR_HEIGHT_PX` and `TAB_BAR_BORDER_PX` are cited by name in `AppShell.tsx` and
`PhotoViewer.tsx` comments and consumed only through the outer height.

Two suites reach across the `lib`/`components` boundary, and both do it by reading source **as
text** rather than by importing: `lib/nina/chrome.test.ts` for the motion contract, and
`tests/tabbar.geometry.test.ts` for the bar's geometry. The latter *imports* the three exported
constants (they are safe under `environment: 'node'` — `TabBar.tsx` is `'use client'` but nothing
in it runs at module scope) and *scans* the two clearances, which are module-private constants
inside client components that reach Server Actions: there is nothing to import and no DOM to render
them in. It is the home for the bar's geometry rules; the next one belongs there too.

## Concurrency

Client-side only, and single-threaded. What matters instead is **timer and effect lifecycle**, all
of it inside `ChatChrome`:

- The auto-hide timer is one `window.setTimeout` created by an effect keyed on
  `autoHideDelayMs(bar, composerEngaged)`; when that returns `null` the effect returns early and no
  timer exists. Because `'autohide'` is idempotent, a timer that survives a race can only re-assert
  `'hidden'`.
- A `setTimeout(sync, 0)` debounces focus/blur so that moving focus *within* the composer does not
  read as a release.
- The `--nina-bar-visible` write is an effect on `:root` with a cleanup that removes the property,
  so leaving `/nina` cannot leave the composer clearing a bar that is no longer rendered.

Everything in `lib/nina/chrome.ts` is a pure function of its arguments: no module state, no I/O, no
timers, safe to call from anywhere.

## Error Handling

No sentinel errors and no throws in this layer. The chrome rules are **total instead**: every
function is defined for every input in its type, and degenerate numeric input resolves to the
resting screen rather than an exception — a non-finite composer height falls back to
`COMPOSER_RESTING_PX`, a non-finite clearance contributes zero, and `composerBottomCss` treats a
non-finite `chromeClearancePx` as `0`. The failure mode of this layer is a wrong offset, and a
wrong offset that renders beats a thrown error that blanks the conversation.

## Performance

The reveal costs one `translate` transition on a `fixed` element and one custom-property write on
`:root`. No layout is read during the transition, and `BOTTOM_GAP` is a static class, so the
document's height never changes when the bar moves — which is precisely what keeps `MessageList`'s
auto-scroll from chasing it.

`controlBottomCss` and `composerBottomCss` return strings and are called on render; both are
arithmetic on three numbers.

## Configuration

One config per concern, and each is the only one of its kind — do not add a second.

| file | the settings that matter |
|---|---|
| `tsconfig.json` | `strict` **plus `noUncheckedIndexedAccess`**; `verbatimModuleSyntax`; path alias `@/* → ./*`; `plugins: [{ name: 'next' }]`. Excludes `drizzle` and `research`. |
| `vitest.config.ts` | **`environment: 'node'`** — the constraint that puts every reveal rule in `lib/`. `include` is `tests/**`, `lib/**` and `app/**` `*.test.ts`, which is why `lib/nina/chrome.test.ts` sits beside its module. `globals: false`, `setupFiles: tests/support/setup.ts`, `testTimeout` 5 s. `tests/integration/**` and `tests/live/**` are excluded unless `VITEST_INTEGRATION=1` / `LLM_LIVE_TEST=1`. |
| `next.config.ts` | `reactStrictMode`; Blob `images.remotePatterns`; four `headers()` entries — the service worker is `no-store` with its own CSP, `/badges/*` and `/records/*` are immutable for a year (content-hashed names), and `/s/:token` is `private, no-store` + `noindex` because the pathname is the bearer token. |
| `drizzle.config.ts` | reads `.env.local` itself (drizzle-kit runs outside Next) and **throws** unless `DATABASE_URL_UNPOOLED` is set and its host does not contain `-pooler`. |
| `eslint.config.mjs` | flat config; `eslint-config-prettier` must stay last. |
| `postcss.config.mjs` | exactly one plugin, `@tailwindcss/postcss`. |
| `.prettierrc.json` | `semi: false`, `singleQuote`, `printWidth: 100`, `trailingComma: 'all'`, `prettier-plugin-tailwindcss` reading `app/globals.css`. |
| `vercel.json` | `regions: ['sin1']`; two crons — `/api/cron/rollup` at `0 20 * * *`, `/api/cron/nina` at `0 12 * * *`. Both Hobby cron slots are spent, which is why `.github/workflows/nina-image.yml` exists as a third scheduler. |

### The gate

`.github/workflows/ci.yml` runs on every push to `main` and every PR, in this order: the seven
boundary guards (`ci:openrouter-guard`, `badges:check`, `ci:data-layer-guard`,
`ci:client-secret-guard`, `ci:f08-guard`, `ci:llm-payload-guard`, `ci:f11-guard`), then
`format:check`, `lint`, `typecheck` (`next typegen && tsc --noEmit`), `test` (`vitest run`), and
`build`.

The guards are `scripts/check-*.mjs` and exist for **boundary** properties that span directories —
which module may reach which, where a secret may appear. A contract confined to one stylesheet and
the files naming it belongs in `npm test` instead, which is why `tests/motion.reducedMotion.test.ts`
is a vitest suite rather than an eighth guard.

## Usage

### Adding a shelled screen

```tsx
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'

export default function Page() {
  return (
    <AppShell>
      <ScreenHeader title="Trends" action={<Link href="/">RUNS →</Link>} />
      {/* … */}
    </AppShell>
  )
}
```

### The full-screen conversation

```tsx
<AppShell screen="chat">
  {/* header row, MessageList, Composer */}
</AppShell>
```

### Gotchas

- **`screen`, not `bottomGap`.** Renamed in P1-RI-A006, along with `AppShellBottomGap` →
  `AppShellScreen`. Documents predating that phase quote the old spelling.
- **Never add `AppShell` back to `components/ui/index.ts`.** It reaches `server-only` code through
  the unread badge; the barrel is imported by client components.
- **Do not change one geometry constant.** The list above is the whole set. `tsc` and the linter
  see none of it; `tests/tabbar.geometry.test.ts` now covers the bar's own numbers, and nothing
  covers the rest. The symptom is a floating composer or a bubble sliced by the bar.
- **Anything stacked above the tab bar clears `TAB_BAR_OUTER_HEIGHT_PX`, never
  `TAB_BAR_HEIGHT_PX`.** 58 is the grid; 59 is the bar's top edge. The one-pixel version of that
  mistake shipped, and it looked like a seam with the conversation scrolling through it.
- **Do not make `BOTTOM_GAP.chat` follow the reveal.** It is the document's height; tying it to the
  bar's state moves the scroll position on every toggle.
- **Do not put a reveal rule in a component.** `vitest` runs `environment: 'node'` — no jsdom, no
  `visualViewport`, no element to measure. A rule that lives in a component is a rule this repo
  cannot assert. Put it in `lib/nina/chrome.ts` with a case in `lib/nina/chrome.test.ts`.
- **Do not pause the auto-hide timer while the composer is engaged.** Hide instead; the paused-timer
  version fires on blur and hides a bar the runner never saw, because iOS does not resize the
  layout viewport for the keyboard.
- **Nothing may paint above the nav's border box.** `translate: '0 100%'` moves the whole bar off
  screen only while that holds; the last thing that broke it (`absolute -top-5` on the Upload FAB)
  left 20 px of coral on screen with the bar "hidden", on phones with no home-indicator inset only.
  `tests/tabbar.geometry.test.ts` is what notices.

## Notes

### Documentation created: 2026-09-05

Minted for P1-RI-A006, whose changes span `components/ui`, `components/nina` and `lib/nina` and
therefore have no single sub-package readme to live in. This file is scoped to what the root owns —
the shell contract, the bottom-chrome geometry, the route/chrome map, the server/client seam, the
auth edge and the repo-wide configuration. The persistence layer is documented in
`lib/db/.workflows/package_readme.md`; the admin surfaces in `lib/admin/.workflows/` and
`components/admin/.workflows/`. Nothing here duplicates them.

The product contracts this file defers to, in precedence order: `RECONCILIATION_v0.1.0.md` (the
`R-n` rulings, which supersede any individual plan and amend the roadmap), then
`ROADMAP_v0.1.0.md` (§4.1 env-var names, §4.2 formatting, §4.3 schema, §4.8 routes), then the
per-feature plans in `docs/plans/archive/` (`F01`–`F33`). `TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md` holds `R1`
(the `New` tab) and `R2` (the composer seam), landed as `P1-RI-A015` and `P1-RI-A016`;
`NINA_CHAT_AVATAR_PROFILE_PLAN.md` is the current branch's plan set, its single `R1` landed as
`P1-RI-A019`.

### Recent changes — P1-CA-A005 (2026-09-11)

*Phase 3 of 4 of the `IMAGE_COLLECTION_PLAN.md` set (R3) — with this phase, the set is complete.
One describe control everywhere: the unified `PhotoDescription` panel is mounted inside BOTH arms
of phase 2's dispatcher (`AlbumSelectionPane` for album rows, `MediaPane` for media rows), each
passing its own table's closures, which retires the interim `MediaDescription` seam, every
icon-row describe button and every `<dl>` null-ness row. The describe subject follows the photo:
`describeSubjectForSide` sends `'self'` for photographs of Nina — album describes stop using the
runner prompt — and `'runner'` for his uploads; the describe/re-describe button is always
available and overwrites, while stored prose stays hand-editable
(`editNinaAvatarDescriptionAction`; `ChatPhotoActionResult` gained the optional `description` the
panel round-trips).*

The root-recorded slice is the context path: `readMessageWindow` populates `imageDescriptions`
from the window's rows — described rows only, in `sort_order` — so a photograph attached earlier
in the conversation still reaches every later turn's context. The previously hardcoded `[]` is
gone, and the stale coverage claim in `lib/nina/actions.ts` is corrected to describe what
actually crosses (bounded: window rows, prose ≤ 2000 chars). The schema for the describe round
trip lives in `lib/admin/chatPhotoSchema.ts`; `lib/nina/vision.ts` imports the one mapping from
`lib/nina/album.ts` rather than minting a second, and both context paths are pinned by new
regression tests (turn input, and the assembled window context).

### Recent changes — P1-RI-A036 (2026-09-11)

*Phase 4 of 4 of the `IMAGE_COLLECTION_PLAN.md` set (R4, the rename and the borderless grid):
every user-visible "Nina's album" now reads "Image collection", and the explorer's photo grid is
the Photo-reference picker's borderless sheet. The set's phase 3 (the marked `SEAM — PHASE 3`
unified describe panel) landed as `f5cb107` in this same worktree after this entry was written;
its slice is the section above.*

**The rename.** The nav cell is `{ label: 'Image collection', short: 'Photos' }`. The `short` is
the phone bar's accessible name, and the one collision the rename had to dodge is "Images" — the
image-generation route's own cell — so the collection took "Photos", free since the chat-photos
route merged away in this set's phase 2. Distinctness is pinned, not trusted to review:
`tests/admin.shell.test.ts` derives every `short` off the source and refuses two cells announcing
the same name. The post-purge comments phase 2 left stale on purpose are rewritten with
post-rename labels: the `ImagesIcon` docstring (the trio "Nina's album / Image Generation / Chat
photos" is now the pair "Image collection / Image Generation", still told apart by silhouette and
not by words) and the shell test's glyph-count case, whose title and trio comment now say six
since the camera left with `/admin/photos`. The rest of the root slice: `/admin/nina`'s `h1` and
the overview card's heading are "Image collection", the card's count line disambiguates to
"**N album photos**, one current" (the Media badge counts a different table) and its link is
"Manage the collection →", the empty-album notice says "The album **folder** is empty" (the
collection is no longer the folder), and the personality page's body copy points at the
collection her photographs stayed behind on. `lib/pwa.ts`'s `ADMIN_INSTALL.description` follows —
*"The image collection, her personality and the memory store"* — because a manifest
`description` is user-visible in the installed admin app's metadata and it still named the purged
chat-photos surface. The remainder is the stale-comment sweep: `lib/db/schema.ts`'s
filtered-reads line no longer names the retired `listNinaChatPhotos` (the COLLECTION reads are
now `listNinaMessageImages`; `countNinaChatPhotos`, the reference picker's chat-side total; and
`listNinaMediaPhotos` + `countNinaMediaPhotos`, the Media view and its badge), and the same class
of comment in `lib/nina/imagetest.ts`, `components/nina/SessionRow.tsx` and
`lib/admin/requireAdmin.ts` now names the Image collection's Media folder where it named
`/admin/photos` or "Chat photos".

**The borderless sheet.** `components/admin/explorer/PhotoGrid.tsx` borrows
`PhotoReferencePicker`'s recipe whole (the owner cited that page by name). One sheet of touching
squares: `gap-[3px]` gutters inside a single `overflow-hidden rounded-field` on the `<ul>` — the
one pair of rounded corners, so the gutters read as hairlines cut into one surface —
`aspect-square` tiles on a `bg-ink-3/20` bed, and no per-tile border, radius, padding or accent
wash; the tile floor stays `minmax(88px, 1fr)`, this grid's own density dial. Selection is a
`scale-[0.9]` inset plus an `aria-hidden` `bg-ink text-card` check badge — `bg-ink`, not
`bg-accent`: white type on the cyan accent measured near 2:1, where ink-on-card is ~14:1 and
inverts correctly in dark mode — and `focus-visible:ring-inset` is what keeps a ring visible
inside a sheet whose corners that one `overflow-hidden` clips. The filename left the tile — a
caption under every square is what broke the borrowed idiom — into the button's `aria-label` and
`title`, with the selection pane's heading the place a tapped tile's name is *read*. The "Hers"
ribbon became a top-left corner badge, the check badge's twin, still real text and spelled into
the `aria-label` (`${photo.filename} — her current profile picture`) because an `aria-label`
overrides a button's subtree text and the visible badge alone would be silent.
`thumbUrl ?? url`, `loading="lazy"`, the plain `<img>` and the view-aware empty state are
untouched, and `view` now has exactly one rendering consequence — the empty copy — which the
docstring says plainly. **New: `tests/admin.photoGrid.test.ts`**, the source-text suite pinning
the sheet where it landed, mirroring `tests/admin.photoReference.test.ts`'s helpers (`codeLines`
strips comments; JSX comment continuations start with `*` so a comment can neither satisfy nor
trip an assertion): the borderless invariants are scoped to the TILE rather than the file (the
pager keeps its `border-t`, the empty state its padded button), the caption's absence is asserted
as "no text child printing `{photo.filename}`" so the `aria-label` expression cannot satisfy it,
the byte source and lazy-loading are pinned unchanged, and nothing that a grid has no business
reaching is imported, read or written.

**In packages with readmes of their own** — the same phase, one slice each. `components/admin`:
the `PhotoGrid` restyle above, `AdminNavLinks`' relabelled cell and its rewritten docstrings, and
`ImageGenTestPanel`'s copy (a successful test "lands in the Image collection's Media folder", not
"Chat photos"). `lib/admin` and `lib/db` carry comment-only edits, noted above.

### Recent changes — P1-RI-A034 (2026-09-10)

*Phase 1 of the `IMAGE_COLLECTION_PLAN.md` set (R1, the read half): `/admin/nina` gains a second,
virtual collection — the tree pane pins a **Media** row below "Album" (with the total count), and
`?view=media` swaps the grid to every original conversation photograph, both kinds, orphans
included, newest first, 48 to a page. Read path only: no Server Action was touched, and selection
opens the pane with download as its one verb.*

The root-owned slice is `app/admin/nina/page.tsx`, the Server Component that now serves both
collections. It reads the view **first** — `readExplorerView(params.view)`, from
`lib/admin/filetree.ts` — because the view decides which table the page reads at all: the media
arm never consults `?folder=` (a folder on a media URL is a stale parameter, not a destination;
the breadcrumb draws from `view` alone), while the folder is still validated unconditionally so a
refused path falls back to the root on both arms rather than throwing. The two arms fill the same
four slots (`folders`, `photos`, `pageInfo`, `mediaTotal`) and fall through to ONE render — the
same header, tree and explorer over either table — and the folder list is read on BOTH arms,
because both views draw the same tree pane and the pane shows the Media badge on both.

The media arm calls `listNinaMediaPhotos(userId, { offset })` with **no `limit` argument on
purpose**: `NINA_CHAT_PHOTO_PAGE_SIZE` (48) is that read's own default *and* ceiling, so no call
site can quietly widen one page into the unpaginated read the constant exists to prevent. Rows map
to `MediaExplorerPhoto` on the server, field by field — `thumbUrl` is `null` permanently (the
table has no thumbnail column, so the grid's `thumbUrl ?? url` fallback is the only render path),
`folder` is the root's `''` and unread (a message image is filed nowhere), `filename` is
**derived** (`YYYY-MM-DD <id>`) because the table has no filename column and is never parsed out
of `pathname`, `source` is the row's own `kind`, `isCurrent` is `false` (adoption copies the bytes
into `nina_avatars` and the copy carries `is_current`), and the crop is the identity. `side` is
`photoSideOf(kind)` computed here — the same call `galleryPhotos` makes, which keeps the his/hers
discriminator in one place. The `(row): MediaExplorerPhoto` / `(row): AlbumExplorerPhoto`
annotations are load-bearing: without them `origin: 'album'` widens to `string` and the union
stops being discriminable.

The album arm gained one parallel read, `countNinaMediaPhotos(userId)`: the tree's Media badge
shows the count on BOTH views, so the album view pays one `count(*)` for a number its grid never
uses — the badge is the rail's whole point, and a badge without a count is decoration. The header
body copy follows the view (the `h1`'s own rename is a later phase's edit, kept out so this phase
ships no label churn), and the empty-album notice became an album-view fact: on Media the grid's
own empty state speaks instead, so the operator is never told to drop a folder over conversation
photographs.

**Changed:** `app/admin/nina/page.tsx` — the arm split above; `page={pageInfo}` replaces the
inline page object, and two new props (`view`, `mediaCount`) thread down to `FileExplorer`.

**In packages with readmes of their own** — the same phase, one slice each. `lib/admin`: the
virtual node (`NINA_MEDIA_VIEW_PARAM` / `NINA_MEDIA_VIEW_VALUE`, `ExplorerView`,
`readExplorerView`, `NINA_MEDIA_NODE_LABEL`, `MediaViewNode` / `mediaViewNode`) — it carries a
`view` discriminant and no `path`, so `findFolderNode`, `isFolderAncestorOf` and `FolderMenu`
cannot even ask whether Media is in the tree, and the view is told apart by parameter KEY, never
by a reserved path, so a real folder named "Media" stays legal. `lib/nina`: `NinaMediaPage`,
`mediaCollectionScope` (`user_id` + `isOriginalPhoto()` with deliberately **no `kind` arm**, so
his composer uploads are members), `listNinaMediaPhotos` and `countNinaMediaPhotos`.
`components/admin`: `ExplorerPhoto` is now the discriminated union `AlbumExplorerPhoto |
MediaExplorerPhoto` narrowed on `origin`; `FileExplorer` takes `view` / `mediaCount`, hides the
album-only Add buttons and absorbs drops while Media is open; `FolderTree` renders the pinned row
through a `menu={null}` slot so it gets no folder verbs; `PhotoGrid` branches only its empty copy;
`SelectionPane` opens a read-only media arm placed after every hook. Tests pinning the phase:
`tests/admin.filetree.test.ts` and `tests/nina.photoRefs.test.ts`.

### Recent changes — P1-RI-A031 (2026-09-09)

*Phase 3 of 3 of the `admin-imagegen-simplify` set (R4): the six "Focus on" cards render their
label and nothing else.*

Each focus card used to carry a hint line copied from the focus spec's `userSaid` — the user's own
words repeated back in lower case ("face" under Face), the copy reading itself. Phase 3 deletes the
hint span, `imageFocusCopy`'s hint return, and the `userSaid` member with its six literal values
from `NINA_IMAGE_FOCUS_SPECS`, leaving the spec's `label` the one home for the user's focus words;
`NINA_FOCUS_EMPHASIS` (`lib/nina/imagegen.ts`), which never read the member, keeps the prompt's
emphasis vocabulary. The free-text `NinaImageTextSpec` keeps its own `userSaid` — a different
record, deliberately untouched. No control, commit moment or saved field moved.

**Changed:** `components/admin/ImageGenPanel.tsx` (the hint `<span>` is gone; the card is one label
span that also carries the "unsaved" marker), `lib/admin/imageGenModel.ts` (`imageFocusCopy(key)`
now returns a plain string — the `ImageGenCopy` wrapper whose `band` was always `''` and whose
`hint` had to stay empty is gone; `promptLengthCopy` keeps that shape because its hint and band are
genuinely rendered), `lib/nina/imageprefs.ts` (`NinaImageFocusSpec` is `{ key, label }`), and the
pins in `tests/admin.imagegen.test.ts` / `tests/nina.imageprefs.test.ts` — the root-owned slice of
this phase. The sub-package readmes (`components/admin`, `lib/admin`, `lib/nina`) record the same
phase one slice each.

### Recent changes — P1-RI-A025 (2026-09-09)

*Phase 1 of the `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` set (R1, R2): the keyboard stops eating
the sidebar's fields, and the search field gains a ✕ that clears the query and its results.*

**R1 — the panel asserts its fields rather than measuring the keyboard.** The
`bottom: var(--nina-kb-overlap)` box fix ended the panel at the keyboard's top edge, and the report
survived it: the search field sits at the top of a tall block inside the panel's OWN
`overflow-y-auto` container, and iOS Safari's focus reveal scrolls THAT container — a `scrollTop`
no box geometry sees. So the panel asserts instead: a delegated `focusin` listener in
`NinaSidebar`'s `open`-keyed effect arms `KEYBOARD_REASSERT_DELAYS_MS` (`[0, 120, 300, 600, 1000]`,
new in `lib/nina/chatview.ts` beside `NINA_KEYBOARD_OVERLAP_VAR` — a rule a component cannot be
tested under, so the numbers live where the suite can hold them), and each tick calls
`scrollIntoView({ block: 'nearest', behavior: 'instant' })` on the focused field, which walks every
scrollable ancestor at once, computes zero scroll when nothing has moved, and needs no second
`visualViewport` subscription. Three guards: text fields only; `document.activeElement === target`
checked at fire time, so a late tick never fights a focus that has moved; and a new focus cancels
the running schedule, so exactly one is live. The schedule ends at 1000 ms on purpose — after a
second the scroll position is the runner's own act, and an assert that kept firing would drag the
field back from where he scrolled it. Phase 2's rename field is covered for free: the listener is
delegated at the panel, so any text field inside it is.

**R2 — the ✕ in the search field, and why the input is `type="text"`.** One tap does all three
things the ask names: `setText('')`, `setResult(null)` and `focus()` back into the input — the
query and the results go together and the keyboard never folds. Nulling the result is load-bearing:
the `active` gate already hides the block, but a kept `result` would let a clear-then-retype of the
same query pass `fresh` on the first keystroke back and repaint the stale answer as this search's.
`type="search"` became `type="text"` because Safari's native clear glyph cannot be sized to the
44 px floor, cannot be given a name, and cannot be taught the two-part clear, while Chrome Android
draws none at all; `enterKeyHint="search"` keeps the SEARCH key. The button cancels its own
`pointerdown`, so the tap moves focus nowhere and iOS gets no blur to fold the keyboard over — the
click handler's `focus()` is the net for the Enter-on-the-button path. It renders only when there
is text, and it wears the same skin and event strategy as phase 2's rename ✕: one idiom, two
fields.

**New:** `KEYBOARD_REASSERT_DELAYS_MS` in `lib/nina/chatview.ts`, with four tests in
`lib/nina/chatview.test.ts` holding its shape (first delay `0`, strictly ascending, last past the
whole keyboard-settle chain, integer milliseconds) — the stand-in for a component `vitest` cannot
render. **Changed:** `components/nina/NinaSidebar.tsx` — the listener and its cleanup beside the
panel's Escape listener, keyed on `open` alone; `components/nina/NinaSearchField.tsx` — the wrapper
takes `relative` with the label pairing by `htmlFor`, and the ✕ owns the field's last 44 px
(`pr-11`) only while text is present.

### Recent changes — P1-RI-A026 (2026-09-09)

*Phase 2 of the `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` set (R3, R4): the session row's three menu
buttons became icon-only, and the rename field gained its own ✕.*

One file changed: `components/nina/SessionRow.tsx`. The three menu actions — "Pin ke atas"
("Lepas pin" once pinned), "Ganti nama", "Hapus" — are icon-only `Button`s wearing 18 px inline-SVG
glyphs (`pin` and `pencil` copied verbatim from lucide-static 1.42.0; `trash` copied verbatim from
`NinaJobActions`' `TrashIcon`, so the app keeps one trash can), `aria-hidden`, with the Indonesian
labels preserved verbatim as the `aria-label`s — `AdminNav` R2's arrangement. They are still
`Button`s: `md` is the 44 px target, `variant` still carries the destructive red on "Hapus", and
the two mutations keep `loading={pending}` (the mis-tap guard) — icon-only changes none of that.
The module-private state glyph was renamed `PinIcon` → `PinnedIcon` now that the lucide action
glyph took its name. The rename `Input` gained an ✕ at its right end — `absolute w-11` inside
`Field`'s `relative` wrapper, `pr-11` only while the draft is non-empty, `aria-label="Kosongkan
nama"` — which empties the draft and keeps the keyboard up: `onPointerDown` prevents the blur, the
click handler re-focuses the input through a ref. The prefill on `open('rename')` is deliberately
unchanged: the ✕ is for renaming from scratch, not a tax on typo fixes.

### Recent changes — P1-RI-A027 (2026-09-09)

*Phase 3 of the `SEARCH_CLEAR_AND_SIDEBAR_ICONS_PLAN.md` set (R5): the sidebar's two full-width
rows became a four-icon rail pinned to the panel's bottom edge, and the panel's scroll moved into
an inner deck.*

**The panel is a two-deck column now, and no longer scrolls itself.** It gained `flex flex-col`
and lost its own `overflow-y-auto overscroll-contain` — the two scroll utilities moved whole to an
inner `min-h-0 flex-1` region holding the header, the search field and `SessionList`, so no row
ever scrolls under the buttons. `min-h-0` is belt-and-braces: with `overflow-y-auto` the spec
already zeroes a flex child's automatic minimum, and the class stands against the engines that got
that wrong. Phase 1's focus-reassertion effect survived the move untouched, by its own
construction — it addresses the focused element, and `scrollIntoView` walks every scrollable
ancestor, so which container scrolls is invisible to it. The deck's bottom padding lost its
`--safe-bottom` term (`pb-6` now): that inset was the panel's glass clearance, and since the rail
it is the rail's to carry — keeping it would clear the glass twice.

**The rail (R5), in the owner's order: `>` closes, `up` returns the list to its top, `+` starts a
chat, the wand opens "Proses foto".** The two full-width rows cost 44 px plus margins each on an
XS Max. `>` is the chat page trigger's own chevron doing the opposite job, wired to `closeRef`;
the header ✕ stays, its mirror at the other end of the panel rather than its replacement. `up`
scrolls the list's own container (not the page — the panel covers it) through the new
`listScrollRef`, smooth and **instant under `prefers-reduced-motion`**, with the `matchMedia` read
at TAP time the way `MessageList`'s handler does: the setting can change while the panel is open,
and a subscription would be state this panel has no other use for. `+` is `NewChatButton`, still
the `newChatSlot` seam's default and now the rail's third cell (an override lands in the rail's
row, which the seam's docstring now says honestly): icon-only 44 px with `aria-label="Chat baru"`
and Lucide's `plus` at the rail chevrons' own `strokeWidth 2.4`, its pending sentence replaced by
`aria-busy` plus the dim of `disabled:opacity-60` — no room on a disc for "Membuka chat baru…",
and `NinaJobActions`' pattern for a one-tap action in flight. Its create/refuse logic is
untouched: still a `<button>` that closes FIRST and then `router.replace`s on refusal — no Link
push to race. The wand is a plain `<Link>` to `NINA_JOBS_HREF` that **deliberately never calls
`closeRef`**: this panel's close path pops a pushed history entry, and firing it beside a Link's
push races them (measured in production, 2026-09-08, on this panel's own search hits).
`/nina/jobs` is a different route, so the pushed entry carries no `sidebar` key and the URL that
opened the panel closes it.

**The rail's gap to the glass is the composer's own, mirrored by decomposition.**
`RAIL_PAD_BOTTOM_CSS` quotes `composerPadBottomCss`'s floor — `max(0px, var(--safe-bottom) / 2 -
3.25px)` — rather than calling it, because the panel has no measured overlap to hand it: it is
`ChatScreen`'s sibling, and its only keyboard channel is the `--nina-kb-overlap` var, a length no
`lib/` function can consume. The function's `if (overlapPx > 0) return '0px'` gate is re-spelled
in CSS by subtracting the var, which zeroes the floor whenever a keyboard is published; the
`1 - var(--nina-bar-visible)` gate is dropped, not forgotten — the panel is `z-50` over the bar,
and zeroing the rail's floor because a bar it covers appeared would lift it off the glass. The
rail row carries the composer's `py-2` and the container below carries the floor, so the halves
read where the composer spells them: 21.75 px on an XS Max, the bare 8 px flush above the
keyboard. `RAIL_CONTROL_CLASS` is the chat pair's own `NINA_CHROME_CONTROL_CLASS` raised to
`size-11` — the pair's 32 px is a recorded owner exception that does not travel, because its
defence was "the nearest rival target is tens of pixels away" and in the rail it is 6 px away.
The wand's glyph is a module-private `WandSparklesIcon`, Lucide's `wand-sparkles` copied verbatim
from `components/admin/AdminNav.tsx` — the same silhouette that already means image generation on
the admin side, and `/nina/jobs` is that queue's runner-facing face.

**Repaired: `tests/nina.jobActions.test.ts` was red at BASE.** Its `vi.mock` factories predated
`readNinaTuning` (be1057e) and `captionNinaPhoto` (b4f1004), so the four session-resolution cases
hung at the 5000 ms timeout — `finishSelfie`'s caption call built a real `narrativeClient`. The
suite now mocks `@/lib/nina/caption` and arms `readNinaTuning` with `NINA_TUNING_DEFAULTS`: 19/19
passing, and the file dropped 19 s to ~0.6 s.

### Recent changes — P1-RI-A019 (2026-09-07)

*R1 of `NINA_CHAT_AVATAR_PROFILE_PLAN.md`: the typing row's 28 px circle now honours the profile
avatar.*

The circle beside the typing dots was `<NinaAvatar size="sm" />` with no `src`, `natural` or
`crop`, so it always took `NinaAvatar`'s `isFallback` branch and rendered the committed
`public/nina/avatar-001.png` — `ninaCropStyle` was never called for it. It therefore ignored both
the current album photo and the crop-studio framing while the 44 px sidebar circle honoured both,
and the two faces on one screen could disagree. The fix threads the already-resolved
`{ src, natural, crop }` triple four hops: `app/nina/page.tsx`'s existing
`const avatar = ninaAvatarView(avatarRow)` — the *same* value `<NinaSidebar>` reads — into
`ChatScreen` → `MessageList` → `TypingIndicator` → `NinaAvatar`.

**New:**

- `ChatAvatar` in `components/nina/types.ts` — `ninaAvatarView`'s three *render* fields and
  nothing else. Structurally identical to `NinaSidebarAvatar` and deliberately a separate
  declaration: `ChatScreen` importing a type out of `NinaSidebar.tsx` would contradict the boundary
  `ChatChrome.tsx` states, to save one interface.
- `tests/nina.chatAvatar.test.ts` — a source-text suite (vitest is `environment: 'node'`; there is
  no jsdom to render a circle in) that fails if any hop is removed, and that asserts the page still
  calls `ninaAvatarView` exactly once.

**Changed:**

- `components/nina/ChatScreen.tsx` and `components/nina/MessageList.tsx` — a **required**
  `avatar: ChatAvatar` prop on each. Required rather than optional on purpose: each has exactly one
  caller, so a caller that forgets it must be a `tsc` error and not a silent regression to the
  fallback. An optional prop all the way up is how the bug happened. Neither component renders an
  avatar itself; the prop exists only to reach `TypingIndicator`.
- `components/nina/TypingIndicator.tsx` — `avatar` is **optional** here, the one deliberate
  asymmetry: the row is `aria-hidden` decoration whose worst case should be the committed face, so
  it keeps `NinaAvatar`'s own defaults.
- `app/nina/page.tsx` — one prop on the existing `<ChatScreen>` call, destructured field by field
  rather than spread, so `ninaAvatarView`'s `description` (`glm-4.6v`'s private prose, invariant 5)
  cannot ride into a client component. The same care the `<NinaSidebar>` call beside it already
  took.

**Unchanged, and checked:** no new query and no new `await` on `/nina` — the row was already being
read. `NinaAvatar.tsx`, `NinaSidebar.tsx` and `NinaAboutScreen.tsx` were not touched, and
`NinaSidebarAvatar` was left as its own type rather than refactored onto `ChatAvatar`. The
no-album case still renders `/nina/avatar-001.png` centred `cover`, exactly as before.

### Recent changes — P1-RI-A021 (2026-09-07)

*Phase 1 of 2 of the `admin-home-screen-shortcut` plan set: a home-screen tile that opens `/admin`.*

"Add to Home Screen" from `/admin` installed a tile that opened `/`. Not a bug in the tile — Safari
launches from the `start_url` of the manifest the page **linked**, and every page linked the root
one. The fix is a second manifest scoped to the admin shell; the full argument, including why a
second domain was not the answer, lives in the new route handler's docstring. The install contract
is now a pair, described under *The install contract* above.

**New:**

- `app/admin/manifest.webmanifest/route.ts` — a `force-static` Route Handler (not a second
  `manifest.ts`; that convention is root-of-`app` only) serving `application/manifest+json` with
  `start_url: '/admin'`, `id: '/admin'`, `display: 'standalone'` and `orientation: 'any'` — the
  runner's `portrait` is wrong here because the admin shell *has* a landscape layout. `scope` stays
  `'/'` on purpose: `requireAdmin` redirects to `/`, and a narrower scope would eject the installed
  app into Safari the day the cookie expired.
- `ADMIN_INSTALL` in `lib/pwa.ts`, beside `INSTALL` — `RI Admin` at 8 characters because
  "Run Insights" already sits at the ~12-char iOS label ceiling, and `--paper-2` `#f1f7fb` so the
  launch splash matches `/admin`'s `bg-paper-2` shell. No `paperDark`, deliberately: a
  scheme-varying tint would need a `viewport` export from `app/admin/layout.tsx`, and whether a
  nested one merges or replaces is unverified — if it replaces, the shell loses `viewportFit:
  'cover'` and all four safe-area insets go inert.

**Changed:**

- `app/admin/layout.tsx` — two keys on the existing `metadata`: `manifest:
  '/admin/manifest.webmanifest'`, and `appleWebApp: { ...APPLE_WEB_APP, title:
  ADMIN_INSTALL.shortName }`. **The spread is load-bearing** — `appleWebApp` is a nested field Next
  replaces whole, so the short form would have dropped `capable: true` for every route under
  `/admin`. Still no `icons` key, for the same class of reason.
- `tests/pwa.install.test.ts` — two `describe` blocks, 12 new cases (26 in the file).

Untouched by invariant: `app/manifest.ts`, `app/layout.tsx`, `public/**`, `app/icon.png`,
`app/apple-icon.png`, `tools/**`, `next.config.ts`, `proxy.ts`. Both tiles therefore still draw the
runner's art; phase 2 (`P1-RI-A022`) ships `ADMIN_PWA_ICONS` and `app/admin/apple-icon.png`.

### Recent changes — P1-RI-A025 (2026-09-09)

*Phase 1 of 2 of the simplify-personality-settings set: the tuning revision mechanism is purged,
everywhere it existed.*

Saving a Personality tuning used to carry an integer `revision` the whole way — a column on
`nina_tuning`, mirrored onto every turn as `nina_turns.tuning_revision`, a field on `NinaTuning` and
its write alias, a prop on the character panel, a sentence on the admin hub. Phase 1 deletes the
entire chain. Phase 2 of the set replaces the Save-button model with auto-save; nothing here
anticipates that.

**New:**

- `drizzle/0016_retire_tuning_revision.sql` — two `DROP COLUMN`s, `nina_tuning.revision` and
  `nina_turns.tuning_revision`; with it `drizzle/meta/0016_snapshot.json` and the `idx: 16` entry in
  `drizzle/meta/_journal.json`. **Committed but not applied, on purpose**: this one is destructive,
  so it rides the post-deploy migration (`db:migrate` runs after the branch is deployed) rather than
  before the push. The window is safe in both directions — the deployed code no longer names either
  column anywhere, and drizzle can only emit columns its TS schema declares, so before the migrate
  the columns sit unread and after it no query reaches for one.

**Changed:**

- `app/admin/personality/page.tsx` — `<CharacterPanel>` loses its `revision` prop; the page hands it
  the draft, the defaults and the prompt preview, and nothing else.
- `app/admin/page.tsx` — the hub card's character summary no longer ends with "Revision N." The
  image card beside it read `imagePrefs.revision` at the time; the `admin-imagegen-simplify` set's
  phase 2 (`P1-RI-A029`) has since removed it.
- `tests/nina.tuning.test.ts` — the hostile-input and defaults cases stop asserting a `revision`
  field exists, clamps, or sits at `0`.
- `tests/admin.tuning.test.ts` — the "draft does not carry the revision" case is deleted rather than
  inverted: there is nothing left to assert about a field that no longer exists in the type. The
  one-save comment says "stale row" where it said "stale revision".
- `tests/db.schema.nina.test.ts` — `nina_tuning` is now exactly thirty-seven columns (`revision` out
  of the enumerated list), and the comments citing revision-in-SQL and the
  `nina_turns.tuning_revision` NULL idiom are reworded to survive both drops.
- `tests/nina.imagerun.test.ts` — the "live tuning, not a cached or default one" fixture marks its
  tuning with distinctive `notes` instead of `revision: 9`.

**Changed in packages with readmes of their own** — the same phase, one slice each (`lib/nina/`,
`lib/admin/`, `components/admin/`, and the tables in `lib/db/`):

- `lib/nina/tuning.ts` — `NinaTuning` loses `revision` and the `NinaTuningWrite` alias is deleted;
  the module is still zero-import and client-importable. The turn path stops carrying the column:
  `turn.ts`, `gateway.ts`, `chatturn.ts` and `queries.ts` (`NinaTurnTrace` / `NinaTurnRow` /
  `NinaTurnInsert`), plus `turn.test.ts` and a comment in `prompts/system.ts`.
- `lib/admin/tuningActions.ts` / `tuningModel.ts` — revision strings out of the notes and copy;
  `AdminTuningResult` carries no revision.
- `components/admin/CharacterPanel.tsx` — the revision-keyed draft resync is now keyed on content
  through `tuningDraftEquals`, and the header/preview revision strings are gone; `DialSlider.tsx` is
  comments only.

**Unchanged, and checked:** the Save / Discard / Reset buttons all still stand — they go with phase
2, not with this phase. `nina_image_prefs.revision` and the whole image-generation surface,
`nina_turns.prompt_version` / `NINA_PROMPT_VERSION`, and prompt assembly (`buildNinaSystemPrompt`)
are untouched.

### Recent changes — P1-RI-A015 and P1-RI-A016 (2026-09-05)

*`TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md`, both phases: the `+` becomes the `New` tab, and the
composer lands on the bar.*

Two reports, one root cause. The raised `/upload` FAB painted 20 px above the bar's top edge and
over the newest bubble on `/nina`, and the composer sat over a band of scrolling conversation
instead of resting on the bar. **Phase 1 (`P1-RI-A015`)** demoted `/upload` to the third of five
ordinary tab cells — a `size-5` `+` glyph over a `text-[10px]` caption reading `New`, coral at rest
*and* when active through one new optional `accent` prop on the module-local `Tab`, which
*replaces* the active/inactive pair rather than adding a branch to it. The 20 px overhang constant
was deleted, `relative` came off the grid, and the hide transform collapsed from
`calc(100% + 20px)` to a plain `0 100%`. That closed 18 px of the 19 px gap. **Phase 2
(`P1-RI-A016`)** closed the last one: the bar's `border-t` had never been a term in any clearance,
so the composer's bottom edge landed a pixel *below* the bar's top border.

**New:**

- `TAB_BAR_BORDER_PX` (1) and `TAB_BAR_OUTER_HEIGHT_PX` (59) in `components/ui/TabBar.tsx`. The sum
  lives in the constant, not at the call sites, because a caller cannot forget a term that is
  inside it. `TAB_BAR_HEIGHT_PX` (58) is unchanged and is still the grid's own height.
- `tests/tabbar.geometry.test.ts` — the home for the bar's geometry rules. Phase 1's half is a
  `readRepoCode` source scan (no `absolute`, no `-top-`, no `size-14`, no `bg-z5`, no `calc` in the
  hide transform, the five captions in order, five `<Tab>`s for five columns, `accent` outside the
  active branch); phase 2's half imports the three constants and scans both clearances, and **fails
  if either regresses to `TAB_BAR_HEIGHT_PX`** or re-derives the sum locally.

**Changed:**

- `components/nina/ChatChrome.tsx` / `components/nina/ChatScreen.tsx` — `BAR_CLEARANCE_PX` and
  `COMPOSER_CLEARANCE_PX` are each `TAB_BAR_OUTER_HEIGHT_PX` (59). They were `58 + 20 = 78`; that
  arithmetic is gone from the repo. `COMPOSER_FALLBACK_PX` follows to `59 + 68 = 127`.
- `lib/nina/chatview.ts` — `composerBottomCss` is unchanged in behaviour; its docs now name the
  border term and `TAB_BAR_OUTER_HEIGHT_PX`. `lib/nina/chatview.test.ts` and
  `lib/nina/chrome.test.ts` move their inputs from 78 to 59.
- `components/nina/Composer.tsx` — comments only: the fixed bar clears the tab bar's outer height,
  not a bar plus a FAB.
- `components/ui/AppShell.tsx` — comments only, in both `BOTTOM_GAP` cases. **No value changed**:
  the 96 px under the four tabbed screens was never the complaint, and the 20 px that used to be
  the overhang is breathing room now.

### Recent changes — P1-RI-A006 (2026-09-05)

*Phase 2 of `NINA_CHAT_SESSIONS_PLAN.md`: full-screen chat chrome — hide the bar, floating `^`/`v`,
5 s auto-hide.*

`/nina` renders full-screen with no visible tab bar. One floating 44 px control just above the
composer pulls the bar back up, pushes it back down, and lets it retract on its own five seconds
later; the glyph flips with the state, and the reveal holds still under `prefers-reduced-motion`.
The four other tabbed screens are unchanged in behaviour — still an unconditional bar, same height,
same unread dot.

**New:**

- `lib/nina/chrome.ts` — the reveal state machine (`nextBarState`, total over a four-event union
  with an idempotent `'autohide'`), the 5 s rule (`autoHideDelayMs`, returning `null` for "run no
  timer"), `isControlVisible`, `barToggleGlyph`, `controlBottomCss`, and the constants
  `CHROME_AUTOHIDE_MS`, `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX`, `COMPOSER_RESTING_PX`.
- `lib/nina/chrome.test.ts` — its suite, including the reduced-motion assertions, which read
  `components/ui/TabBar.tsx` as text because no rendered-component test is possible here.
- `components/nina/ChatChrome.tsx` — the client component that owns the reveal state, writes
  `--nina-bar-visible`, renders the floating control, and renders `TabBar` with the badge it was
  handed.

**Changed:**

- `components/ui/TabBar.tsx` — gained an optional `hidden` prop (default `false`), the inline
  `translate` that reveals it, `transition-[translate] … motion-reduce:transition-none`, and
  `inert` while hidden. *(At the time the hidden translate was `calc(100% + 20px)`, to clear the
  Upload FAB's overhang; it is a plain `0 100%` since `P1-RI-A015`.)*
- `components/ui/AppShell.tsx` — `TabBar` stops being unconditional; **`bottomGap` → `screen` and
  `AppShellBottomGap` → `AppShellScreen`**; `BOTTOM_GAP` gained the `'chat'` case, the no-bar sum,
  which deliberately drops every tab-bar constant from its arithmetic. *(Its literal was `8.5rem`
  then; it is `7.5rem` now, following `CHROME_CONTROL_PX` 44 → 32.)*
- `lib/nina/chatview.ts` — `composerBottomCss` multiplies the clearance by
  `var(--nina-bar-visible, 0)` so it clears nothing when the bar is gone; `NINA_BAR_VISIBLE_VAR`
  added. The keyboard branch is untouched.
- `lib/nina/chatview.test.ts` — `composerBottomCss` cases for the multiplied clearance.
- `app/nina/page.tsx` — one line: `<AppShell screen="chat">`.
