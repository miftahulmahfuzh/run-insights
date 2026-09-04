# Package: run-insights (application root)

**Location**: `.`
**Last Updated**: 2026-09-05

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
| `'chat'` | `<ChatChrome>` — **no bar on screen**, one floating control | `pb-[calc(8.5rem+var(--safe-bottom))]` | `app/nina/page.tsx` only |

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
export const CHROME_CONTROL_PX = 44
export const CHROME_CONTROL_GAP_PX = 8
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

```
TAB_BAR_HEIGHT_PX        = 58      components/ui/TabBar.tsx      ⟷ h-[58px]
TAB_BAR_FAB_OVERHANG_PX  = 20      components/ui/TabBar.tsx      ⟷ -top-5
COMPOSER_CLEARANCE_PX    = 78      components/nina/ChatScreen.tsx  = 58 + 20
COMPOSER_FALLBACK_PX     = 146     components/nina/ChatScreen.tsx  = 78 + 68
COMPOSER_RESTING_PX      = 68      lib/nina/chrome.ts            ⟷ Composer's py-3 (24) + min-h-11 (44)
CHROME_CONTROL_PX        = 44      lib/nina/chrome.ts            ⟷ size-11, the iOS tap-target floor
CHROME_CONTROL_GAP_PX    = 8       lib/nina/chrome.ts
BOTTOM_GAP.chat  = pb-[calc(8.5rem+var(--safe-bottom))]   components/ui/AppShell.tsx  = ⌈68 + 8 + 44 + 12⌉ = 136
BOTTOM_GAP.tabs  = pb-[calc(6rem+var(--safe-bottom))]     components/ui/AppShell.tsx  = 96
translate (hidden) = `0 calc(100% + ${TAB_BAR_FAB_OVERHANG_PX}px)`   components/ui/TabBar.tsx
```

**These are all the same handful of numbers, and nothing in the toolchain checks that they agree.**
Tailwind cannot read a TypeScript constant, an inline `translate` cannot read a Tailwind class, and
`--safe-bottom` (`env(safe-area-inset-bottom, 0px)`, declared in `app/globals.css`) is readable
only to CSS. So the numbers are spelled several times by necessity, and **changing one without the
others is a silent visual bug, not a type error**:

- Change `TAB_BAR_HEIGHT_PX` without `h-[58px]` (or the reverse) and the composer floats above the
  bar or is overlapped by it, because `composerBottomCss` is passed a clearance the bar no longer
  has.
- Change `TAB_BAR_FAB_OVERHANG_PX` without `-top-5` and the hidden bar leaves coral on screen. This
  constant is also **why `hidden` cannot be `translate-y-full`**: measuring up from the viewport
  bottom, the nav's border box is 1 px of `border-t` plus the 58 px grid plus its own
  `--safe-bottom` padding, so `100%` is `59px + safe`; the FAB is `absolute -top-5` inside a
  `relative` grid container that starts at `safe`, so its `size-14` box spans `safe+22` to
  `safe+78`. Clearing it needs `safe + 78`, and `100%` is 19 px short — on a device with no
  home-indicator inset, 20 px of coral circle would sit on screen with the bar supposedly hidden.
- Change the composer's `py-3` / `min-h-11` without `COMPOSER_RESTING_PX` and the floating control
  either overlaps the composer or drifts away from it before the first measurement lands.
- Change any of `COMPOSER_RESTING_PX`, `CHROME_CONTROL_PX`, `CHROME_CONTROL_GAP_PX` or the
  composer's own geometry without `BOTTOM_GAP.chat` and the newest bubble is sliced by the composer
  or sits above a strip of empty paper.

`TAB_BAR_HEIGHT_PX` and `TAB_BAR_FAB_OVERHANG_PX` are deliberately **not** in `BOTTOM_GAP.chat`'s
sum — on that screen the bar is not below the composer. `BOTTOM_GAP.chat` is also **fixed, not
dynamic**: this padding is the document's height, so making it follow the reveal would move the
scroll position on every toggle and `MessageList`'s auto-scroll would chase it. While the bar is
showing, the composer rises 78 px and the last bubble sits behind it for those five seconds — the
right trade, because a runner who pulls up the bar is on his way to another tab, not re-reading the
last line.

`controlBottomCss` composes the lane's `bottom` as the bar's clearance (only when showing) plus the
measured composer height plus the gap plus the inset. That is what keeps the lane clear of the
composer's Send button at every composer height *and* clear of the tab bar's centre FAB — the
`safe+22`–`safe+78` band that a bottom-centre control must never cover. Degenerate input is the
resting screen rather than an error: a non-finite or non-positive composer height means "not
measured yet" and falls back to `COMPOSER_RESTING_PX`; a non-finite or negative clearance
contributes nothing; a hidden bar contributes no clearance whatever the argument says.

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

**A multiplier, not a length.** `calc(<length> * <number>)` keeps the number 78 inside
`composerBottomCss`, where the caller already passes it, instead of moving it into whichever
component writes the variable. The flag then says one thing only — *is the bar on screen* — and
cannot disagree with `TAB_BAR_HEIGHT_PX` about how tall it is. A `var(--nina-bar-clearance, 0px)`
form would put the geometry in two places.

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
translate: hidden ? `0 calc(100% + ${TAB_BAR_FAB_OVERHANG_PX}px)` : '0 0'
```

Both ends are written explicitly, because `translate`'s initial value is `none` and interpolating
from it does not animate. `transition-[translate]` and not `transition-transform`: Tailwind v4
compiles `translate` and `scale` to separate CSS longhands (which is also why the FAB's
`active:scale-[0.97]` and its `-translate-x-1/2` compose instead of overwriting each other), so
`translate` is the property that actually changes and naming it removes the question.

`tests/motion.reducedMotion.test.ts` guards the repo-wide contract by reading source as text —
every keyframe an `[animation:…]` utility runs must be redefined as genuinely still under the
reduced-motion query, and no keyframe may be defined and never used. Because this reveal is a
transition rather than a keyframe, `lib/nina/chrome.test.ts` asserts the escape itself: that the
`translate` longhand is the animated property, that the bar holds still under
`prefers-reduced-motion`, and that no keyframe was added.

The hidden bar is marked **`inert`, not `aria-hidden` and not `hidden`**. A bar translated off
screen is still in the tab order; `hidden` would remove it from layout and take the transition with
it.

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
        ├── <main class="pb-[calc(8.5rem+var(--safe-bottom))]">   ← fixed document height
        │        └── ChatScreen ── Composer
        │              bottomCss = composerBottomCss(overlap, COMPOSER_CLEARANCE_PX /* 78 */)
        │                        = calc(78px * var(--nina-bar-visible, 0) + var(--safe-bottom))
        │
        └── <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />}>      ← 'use client', owns the state
                 │
                 │  focus on #nina-composer ──→ nextBarState(_, 'composer-engaged') → 'hidden'
                 │  tap the control          ──→ nextBarState(s, 'toggle')
                 │  autoHideDelayMs(s, engaged) ?? no timer ──5000ms──→ nextBarState(_, 'autohide')
                 │
                 ├── writes :root style --nina-bar-visible = '1' when shown, removes it when hidden
                 ├── floating control, rendered only when isControlVisible(engaged)
                 │     bottom = controlBottomCss({ barState, barClearancePx: 58 + 20, composerHeightPx })
                 │     glyph  = barToggleGlyph(barState)
                 └── <TabBar hidden={barState === 'hidden'} ninaBadge={…} id="main-tab-bar">
                           translate: hidden ? '0 calc(100% + 20px)' : '0 0'
```

The four other tabbed screens take the left branch of `AppShell`'s ternary and are unchanged: an
unconditional `<TabBar>` with no `hidden` prop (default `false`), the same 58 px height, the same
unread dot. `TabBar`'s `hidden` and `ninaBadge` are both optional so that `app/(app)/loading.tsx`
and `app/trends/loading.tsx` keep compiling untouched — a loading fallback has no session to count
against and no reveal state to hold.

### The route tree, and its chrome

Sixteen pages, eight route handlers, three layouts. Two route groups — `(app)` and `(public)` —
neither of which contributes a URL segment.

| route | file | chrome | notes |
|---|---|---|---|
| `/` | `app/(app)/page.tsx` | `AppShell` (tabs) | runs list **and** the signed-out sign-in screen |
| `/upload` | `app/upload/page.tsx` | none — own full-bleed | the one flow that matters; the raised coral FAB |
| `/x/[extractionId]` | `app/x/[extractionId]/page.tsx` | none — own full-bleed | pre-commit review; no run id exists yet |
| `/r/[id]` | `app/r/[id]/page.tsx` | `AppShell` (tabs) | the roadmap/wireframe disagreement below |
| `/r/[id]/edit` | `app/r/[id]/edit/page.tsx` | none — own full-bleed | post-review correction |
| `/trends` | `app/trends/page.tsx` | `AppShell` (tabs) | `maxDuration = 60` |
| `/me` | `app/me/page.tsx` | `AppShell` (tabs) | profile, records, badge shelf |
| `/nina` | `app/nina/page.tsx` | **`AppShell` (chat)** | `maxDuration = 60`; the only `screen` call site |
| `/nina/about` | `app/nina/about/page.tsx` | `AppShell` (tabs) | a pushed screen that keeps the bar |
| `/onboarding` | `app/onboarding/page.tsx` | none | standalone |
| `/admin`, `/admin/memory`, `/admin/nina` | `app/admin/**` | none — `app/admin/layout.tsx` | desktop; the shell hardcodes `max-w-[470px]` |
| `/s/[token]` | `app/(public)/s/[token]/page.tsx` | none — own layout | public share; `force-dynamic`, plus `not-found.tsx` |

Route handlers, all `runtime = 'nodejs'`: `/api/auth/*` (re-exports Auth.js `handlers`),
`/api/health`, `/api/upload`, `/api/extract`, `/api/extract/[id]`, `/api/cron/rollup` and
`/api/cron/nina` (the two `vercel.json` crons, `maxDuration = 60`), and
`/api/admin/nina/upload`.

`app/layout.tsx` is the root layout and the one place **`viewport-fit=cover`** is set — without it
`env(safe-area-inset-*)` returns zero and every `--safe-bottom` term in the geometry above silently
collapses. It also self-hosts Poppins via `next/font/google` and points `manifest` at
`app/manifest.ts`. `app/robots.ts` allows `/` and `/s/` and disallows the rest; `/s/` is
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
hydration. Its five-cell grid is what centres the raised coral `+` FAB: in a four-column grid the
FAB's cell centre was at 37.5 % of the bar, and the fifth cell (`/nina`) puts the third cell's
centre at exactly 50 %.

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
`docs/plans/` holds the `F01`–`F33` feature plans; `research/` is the pre-build feasibility harness
(excluded from `tsconfig` and `eslint`). `lib/db` and `lib/admin` and `components/admin` have
package readmes of their own.

### Internal (root → packages)

- `components/ui/AppShell` — the shell every page wraps itself in; the only importer of
  `components/ui/TabBar` besides `ChatChrome` and the barrel.
- `components/nina/ChatChrome` — imported by `AppShell` for `screen === 'chat'`.
- `components/nina/NinaUnreadBadge` — `NinaUnreadBadgeSlot`, constructed on the server, passed down
  as a `ReactNode`.
- `lib/nina/chrome` — the reveal rules, consumed only by `ChatChrome`.
- `lib/nina/chatview` — `NINA_BAR_VISIBLE_VAR` (by `ChatChrome`), `composerBottomCss` and
  `keyboardOverlapPx` (by `ChatScreen`).
- `lib/cn` — class composition, by both `AppShell` and `TabBar`.
- `lib/env` — `server-only`; reachable from `AppShell` through the badge, which is why the shell is
  out of the UI barrel.

### Boundary rule

`lib/` never imports `components/`. That is why `controlBottomCss` takes `barClearancePx` as an
argument rather than importing `TAB_BAR_HEIGHT_PX` and `TAB_BAR_FAB_OVERHANG_PX` itself — the two
constants are summed in `ChatScreen`/`ChatChrome`, on the components side, and passed in.

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
and `components/admin/FileExplorer.tsx` (desktop, and the shell hardcodes `max-w-[470px]` and pairs
itself with a bar), `app/(public)/s/[token]/page.tsx` (a public page, and the shell's import graph
is what `tests/share.bundle.test.ts` guards), and `components/profile/RecordsTable.tsx` (would drag
the shell across a client boundary for one empty state).

`/nina` deliberately does not use `ScreenHeader` either: a conversation's identity is a face and a
name, not a title and a link, so that screen builds its own header row out of `NinaAvatar`.

### Geometry-constant consumers

`TAB_BAR_HEIGHT_PX` / `TAB_BAR_FAB_OVERHANG_PX` are imported by `components/nina/ChatScreen.tsx`
(as `COMPOSER_CLEARANCE_PX`) and `components/nina/ChatChrome.tsx` (as the control lane's
clearance). `lib/nina/chrome.test.ts` reads `components/ui/TabBar.tsx` **as text** to assert the
motion contract — the only file that reaches across the `lib`/`components` boundary, and it does so
with `readFileSync`, not an import.

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
- **Do not change one geometry constant.** The list above is the whole set, and no type checker,
  linter or test asserts that they agree. The symptom is a floating composer or a bubble sliced by
  the bar.
- **Do not make `BOTTOM_GAP.chat` follow the reveal.** It is the document's height; tying it to the
  bar's state moves the scroll position on every toggle.
- **Do not put a reveal rule in a component.** `vitest` runs `environment: 'node'` — no jsdom, no
  `visualViewport`, no element to measure. A rule that lives in a component is a rule this repo
  cannot assert. Put it in `lib/nina/chrome.ts` with a case in `lib/nina/chrome.test.ts`.
- **Do not pause the auto-hide timer while the composer is engaged.** Hide instead; the paused-timer
  version fires on blur and hides a bar the runner never saw, because iOS does not resize the
  layout viewport for the keyboard.
- **`hidden` is not `translate-y-full`.** `100%` leaves 20 px of the FAB on screen on a device with
  no home-indicator inset.

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
per-feature plans in `docs/plans/` (`F01`–`F33`). `NINA_CHAT_SESSIONS_PLAN.md` is the current
branch's plan set and `R1` is the requirement this phase satisfies.

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
  `inert` while hidden. `TAB_BAR_FAB_OVERHANG_PX`'s docstring now carries the argument for why
  `100%` alone is 19 px short.
- `components/ui/AppShell.tsx` — `TabBar` stops being unconditional; **`bottomGap` → `screen` and
  `AppShellBottomGap` → `AppShellScreen`**; `BOTTOM_GAP` gained the `'chat'` case
  (`pb-[calc(8.5rem+var(--safe-bottom))]`, the no-bar sum), which deliberately drops
  `TAB_BAR_HEIGHT_PX` and `TAB_BAR_FAB_OVERHANG_PX` from its arithmetic.
- `lib/nina/chatview.ts` — `composerBottomCss` multiplies the clearance by
  `var(--nina-bar-visible, 0)` so it clears nothing when the bar is gone; `NINA_BAR_VISIBLE_VAR`
  added. The keyboard branch is untouched.
- `lib/nina/chatview.test.ts` — `composerBottomCss` cases for the multiplied clearance.
- `app/nina/page.tsx` — one line: `<AppShell screen="chat">`.
