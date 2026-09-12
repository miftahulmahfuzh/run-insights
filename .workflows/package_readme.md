# Package: run-insights (application root)

**Location**: `.`
**Last Updated**: 2026-09-12 — full compaction and verification pass: every constant, count, route
and version below re-checked against the current tree; twelve accumulated per-phase changelog
entries folded into one rolling summary; the shell-contract sections rewritten for the compact bar
(39 px), the composer's 60 px content box, the gated inset, and the shared `NinaBarProvider`.
Details under *Recent changes*.

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
four languages — TypeScript constants, a Tailwind arbitrary value, an inline `translate`, and a CSS
custom property — because none of those four can read the others.

**Key Responsibilities:**

- Hold the shell contract: `AppShellScreen`, the bottom-gap table, and which component renders the
  bar for each mode.
- Own the bottom-chrome geometry and the list of places the same numbers are written, so a change
  to one is a change to all of them.
- Own the server/client seam that lets a Server Component shell hand a server-rendered unread badge
  to a client bar without a fetch, a poll, or a prop threaded through every page — and the provider
  seam that gives the bar's two toggle buttons one shared state.
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
would make both of those states expressible; one prop makes them unrepresentable. (The prop was
`bottomGap` / `AppShellBottomGap` until P1-RI-A006 renamed it; documents older than that phase
quote the old spelling.)

| `screen` | chrome rendered | bottom gap | used by |
|---|---|---|---|
| `'tabs'` (default) | `<TabBar>`, unconditional | `pb-[calc(6rem+var(--safe-bottom))]` | `/`, `/trends`, `/me`, `/r/[id]`, `/nina/about`, `/nina/jobs`, `/nina/jobs/[id]`, and both `loading.tsx` fallbacks |
| `'chat'` | `<ChatChrome>` — **no bar on screen**, one floating control | `pb-[calc(7rem+var(--safe-bottom))]` | `app/nina/page.tsx` only |

`AppShell` is **not** re-exported from `components/ui/index.ts`, and must not be added back. The
barrel is a client-safe kit that client components import; `AppShell` renders Nina's unread badge,
which is an async Server Component that reads the session and therefore reaches `auth.ts` and the
`server-only` `lib/env.ts`. In the barrel it turned every `import { Card } from '@/components/ui'`
in a `'use client'` file into a build error and put the shell into `/s/[token]`'s static import
graph, where `tests/share.bundle.test.ts` refused it. Import it from
`@/components/ui/AppShell`.

### Who renders the bar, and where the state lives

`AppShell` has no `'use client'` and must keep it that way, so it can construct the server-rendered
`<NinaUnreadBadgeSlot />` element that the client `TabBar` then renders as a child. `ninaBadge` is
a `ReactNode` prop rather than a number for exactly that reason: the count never crosses into the
client bundle and no route handler had to be invented to fetch it.

```tsx
{screen === 'chat' ? (
  <NinaBarProvider>
    <NinaSidebarProvider>
      <main className={cn('mx-auto min-h-dvh w-full max-w-[470px] p-5', BOTTOM_GAP[screen])}>
        {children}
      </main>
      <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />} />
    </NinaSidebarProvider>
  </NinaBarProvider>
) : (
  <TabBar ninaBadge={<NinaUnreadBadgeSlot />} />   // beside the same <main>
)}
```

On the chat screen `AppShell` also mounts **two client providers around both subtrees** —
`NinaBarProvider` (the bar's shared state) wrapping `NinaSidebarProvider` (the chat list's
pushed-history-entry ref). Rendering a client provider from a Server Component is a boundary, not
a conversion. Both providers sit *here* rather than in `app/nina/page.tsx`, and each has a
measured bug as its reason:

- The sidebar's `>` trigger is rendered by `ChatChrome`, a *sibling* of `<main>` — a provider
  mounted inside the page wrapped only `{children}`, so the trigger was a context consumer outside
  its own provider on the one screen that needs it, rendering `null`.
- The bar has two writers — `ChatChrome`'s floating control and the sidebar rail's `up` — that must
  not disagree, so the state sits above both: `useNinaBar().dispatch('toggle')`. The reveal
  *effects* stay in `ChatChrome` (timer, keyboard rule, var write) and fire on the shared state
  whatever wrote it. `tests/nina.sidebarProvider.test.ts` guards both structures.

### The reveal rules — `lib/nina/chrome.ts`

Every part of the reveal that is a decision rather than markup is a pure function with no DOM type
in any signature, co-located with its suite in `lib/nina/chrome.test.ts`. The component measures;
this module decides.

```ts
export type NinaBarState = 'hidden' | 'shown'          // 'hidden' is /nina's resting state
export type NinaChromeEvent = 'toggle' | 'autohide' | 'composer-engaged' | 'composer-released'

export const CHROME_AUTOHIDE_MS = 5_000
export const CHROME_CONTROL_PX = 32          // deliberately below the 44 px floor, at the owner's ask
export const CHROME_CONTROL_GAP_PX = 8
export const NINA_CHROME_CONTROL_CLASS: string   // the floating discs' shared frosted-glass skin
export const COMPOSER_RESTING_PX = 60        // the composer's CONTENT box: py-2 (16) + min-h-11 (44)

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
| `'toggle'` | `'shown'` | `'hidden'` | the floating control and the rail's `up`, both directions |
| `'autohide'` | `'hidden'` | `'hidden'` | **idempotent on purpose** — a timer that fires after the runner already pressed `v` must not toggle the bar back on, so the event means "be hidden", not "flip" |
| `'composer-engaged'` | `'hidden'` | `'hidden'` | see below |
| `'composer-released'` | `'hidden'` | `'shown'` | unchanged — a bar that pops back up when he taps away from the textarea is the app overruling a decision he made with the toggle |

**Engaging the composer hides the bar rather than pausing the timer.** On iOS Safari does not
resize the layout viewport when the software keyboard opens, so the composer is lifted onto the
keyboard's top edge while the `fixed bottom-0` bar sits *behind* the keyboard — a bar that is
"shown" there is shown and invisible, and the paused timer then fires the instant he blurs, hiding
a bar he never saw. Hiding on engage gives the same guarantee by a shorter route. **Focus, not the
keyboard, is the signal**: `keyboardOverlapPx` measures ~0 on Android (which *does* resize), while
focus inside the composer is true on both platforms and is the *cause* of the keyboard rather than
a proxy for it. `isControlVisible` retracts the control while engaged — with a keyboard up its
computed offset puts it *behind* the keyboard, a button that cannot be pressed.

`COMPOSER_RESTING_PX` is the composer's *content* box and deliberately excludes the home-indicator
floor: the floor is a `calc()` over `env(safe-area-inset-bottom)` (`composerPadBottomCss`, below),
so no TypeScript number can stand for it. It is the fallback `controlBottomCss` uses before
`#nina-composer` has been measured — which is the server's HTML and the first client frame of
every conversation. The constants' own docstrings carry the full history (why 32 sits below the
floor, why the skin is frosted glass, the 68 → 60 cut) — read them before changing a number.

### The geometry, and why the same numbers are written more than once

```
TAB_BAR_HEIGHT_PX        = 39      components/ui/TabBar.tsx       ⟷ h-[39px]    the GRID's height
TAB_BAR_BORDER_PX        = 1       components/ui/TabBar.tsx       ⟷ border-t
TAB_BAR_OUTER_HEIGHT_PX  = 40      components/ui/TabBar.tsx         = 39 + 1     the bar's TOP EDGE
BAR_CLEARANCE_PX         = 40      components/nina/ChatChrome.tsx   = TAB_BAR_OUTER_HEIGHT_PX
COMPOSER_CLEARANCE_PX    = 40      components/nina/ChatScreen.tsx   = TAB_BAR_OUTER_HEIGHT_PX
COMPOSER_FALLBACK_PX     = 100     components/nina/ChatScreen.tsx   = 40 + 60
COMPOSER_RESTING_PX      = 60      lib/nina/chrome.ts             ⟷ Composer's py-2 (16) + min-h-11 (44)
CHROME_CONTROL_PX        = 32      lib/nina/chrome.ts             ⟷ size-8 in NINA_CHROME_CONTROL_CLASS
CHROME_CONTROL_GAP_PX    = 8       lib/nina/chrome.ts
BOTTOM_GAP.chat  = pb-[calc(7rem+var(--safe-bottom))]   components/ui/AppShell.tsx  = 60 + 8 + 32 + 12 = 112
BOTTOM_GAP.tabs  = pb-[calc(6rem+var(--safe-bottom))]   components/ui/AppShell.tsx  = 96
TAB_BAR_CONTENT_DROP_CSS = '0 calc(max(0px, var(--safe-bottom) / 2 - 4.75px))'   TabBar.tsx  captions' drop
translate (hidden) = '0 100%'                           components/ui/TabBar.tsx
```

The grid is the stack now — a 20 px glyph, a 4 px `gap-1`, a 15 px caption line box sum to 39 —
and each tab's stack drops by `TAB_BAR_CONTENT_DROP_CSS`, a `translate` into the nav's own
safe-area padding (single-value `translate` is an X; the leading `0` is load-bearing). The
constants' docstrings in `TabBar.tsx` hold the owner-measured arithmetic.

Rules that have outlived three rounds of re-tuning (58 → 39 bar, 68 → 60 composer, FAB → cell):

- **The outer height is one constant rather than a sum spelled at call sites.** The sum lives in
  `TAB_BAR_OUTER_HEIGHT_PX`, at the definition — a caller cannot forget a term that is inside it.
  Nothing stacking *above* the bar may use `TAB_BAR_HEIGHT_PX`, because the border is the bar's
  top edge; the one-pixel miss shipped once and looked like a seam with the conversation scrolling
  through it.
- **Tailwind cannot read a TypeScript constant, an inline `translate` cannot read a Tailwind
  class, and `--safe-bottom` is readable only to CSS.** So the numbers are spelled several times by
  necessity, and changing one without the others is a silent visual bug, not a type error.
  `tests/tabbar.geometry.test.ts` is the cheapest alarm: it imports the four constants, asserts
  `h-[39px]` and `border-t` still exist in `TabBar`'s source, refuses any `calc` in the hide
  transform (and `absolute`, `-top-`, `size-14` — the old FAB's fingerprints), and source-scans
  `ChatChrome`/`ChatScreen` so a clearance regressing to `TAB_BAR_HEIGHT_PX` fails on the literal
  text.
- **`BOTTOM_GAP.chat`'s literal must follow the composer's geometry.** It is `60 + 8 + 32 + 12`,
  and it has already been left stale once (`8.5rem` after the floating control shrank to 32) — a
  stale literal here reads as a gap under the conversation, not as a bug, which is how it
  survives review. The sum is spelled in the constant's comment in `AppShell.tsx`.
- **`BOTTOM_GAP.tabs`' 96 px is deliberately unchanged** through the bar's 58 → 39 shrink: the
  value was documented as "bar + old overhang + breathing room", the reported defect was a gap on
  `/nina`, and the difference is simply breathing room under the last card now.
- **`BOTTOM_GAP.chat` is fixed, not dynamic.** This padding is the document's height; making it
  follow the reveal would move the scroll position on every toggle, and `MessageList`'s
  auto-scroll would chase it. While the bar is showing, the composer rises 40 px and the last
  bubble sits behind it for those five seconds — the right trade, because a runner who pulls up
  the bar is on his way to another tab, not re-reading the last line.
- **Nothing may paint above the nav's border box**, or `translate: '0 100%'` stops meaning "off
  screen" — `100%` is exactly the nav's border box and nothing more.

`controlBottomCss` composes the lane's `bottom`: the bar's clearance (only when showing), plus the
measured composer height, plus the gap, over a `var(--safe-bottom)` term gated on the bar flag.
Degenerate input is the resting screen, not an error: an unmeasured height falls back to
`COMPOSER_RESTING_PX` *plus `composerPadBottomCss(0)`* — the floor spelled by its own owner, so
the fallback cannot drift from the real geometry.

### The CSS channels across the sibling gap

The composer, the sidebar panel and the floating controls are not descendants of the component
that owns the state — `AppShell` renders `<main>` (containing `ChatScreen`, which renders
`Composer`) and the chrome as *siblings*, and the panel is its own overlay — so `:root` custom
properties are the one channel that crosses without threading props. `lib/nina/chatview.ts` owns
the names and the arithmetic as pure functions:

- **`NINA_BAR_VISIBLE_VAR` (`--nina-bar-visible`)** — `'1'` while the bar is shown, **absent**
  otherwise, so the resting geometry is what the server's HTML and the first client frame already
  say. `composerBottomCss(overlap, clearance)` is
  `calc((<clearance>px + var(--safe-bottom)) * var(--nina-bar-visible, 0))`, a keyboard overlap
  taking the whole offset first. A multiplier, not a length: the flag says one thing only — *is
  the bar on screen* — and cannot disagree with `TAB_BAR_OUTER_HEIGHT_PX` about how tall the bar
  is. **The inset sits inside the multiplication**: the composer carries the hidden state's floor
  itself, so the phone's inset is counted exactly once in every state.
- **`composerPadBottomCss(overlap)`** — the composer's own `padding-bottom`: the resting floor
  `max(0px, var(--safe-bottom) / 2 - 3.25px)` (the tab captions' floor, verbatim) gated by
  `(1 - var(--nina-bar-visible, 0))`, exactly complementary to the offset's gate.
- **`NINA_KEYBOARD_OVERLAP_VAR` (`--nina-kb-overlap`)** — the measured keyboard overlap, published
  by `ChatScreen`'s single `visualViewport` subscription. `panelBottomCss` reads it: the sidebar
  panel ends at the keyboard's top edge (iOS Safari otherwise lifts the whole fixed overlay and
  scrolls the panel's inner container instead) and lifts by the bar's clearance + inset while the
  bar shows, so the revealed bar renders in its own reachable strip.
- **`attachStripPadBottomCss(overlap)`** — the same floor idea for `/nina/about`'s attach strip.

Each gate has a measured bug behind it — an ungated inset left a strip of conversation visible
under the composer ("ada gap diantara chat query field dengan bagian bawah"); counting the inset
twice floats chrome one inset too high. The docstrings in `chatview.ts` carry the full arguments.

### Motion

The reveal is a `translate` **transition** with a `prefers-reduced-motion` escape, never a
keyframe: `'transition-[translate] duration-200 ease-out motion-reduce:transition-none'`, both
ends written explicitly (`translate: hidden ? '0 100%' : '0 0'`) because interpolating from
`translate`'s initial value `none` does not animate. `transition-[translate]`, not
`transition-transform` — Tailwind v4 compiles `translate` and `scale` to separate CSS longhands,
which is why the floating discs' `active:scale-[0.97]` composes with the translate instead of
overwriting it. The hidden bar is marked **`inert`, not `aria-hidden` and not `hidden`**: it must
leave the tab order and the accessibility tree while staying painted, because `hidden` would
remove it from layout and take the transition with it.

`tests/motion.reducedMotion.test.ts` guards the repo-wide reduced-motion contract by reading
source as text; `lib/nina/chrome.test.ts` asserts the reveal's own escape (the `translate`
longhand, the still bar under the query, no keyframe added). Rendered-component suites also exist
now — `components/**/*.test.tsx` under a per-file `// @vitest-environment happy-dom` docblock
(`TabBar.test.tsx` and friends) — but the *rules* still live in `lib/nina/chrome.ts`: a pure
function is assertable in the default node environment, covers every input rather than one
rendered instance of it, and keeps the decision out of the client bundle.

## Root modules — the auth edge

Four `.ts` files sit directly in the root. Three of them are Auth.js, split across two instances
on purpose.

### `auth.ts` — the Node-runtime instance

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({ ...authConfig, adapter })
```

The only module anything should import for `auth()`, `signIn()`, `signOut()` or the route
handlers. It calls `authEnv()` at **module scope**, so a missing `AUTH_SECRET` / `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` / `AUTH_URL` is a loud boot crash rather than a first-request failure.

It installs `DrizzleAdapter` **together with JWT sessions**, which looks contradictory and is not:
the adapter keeps `user` and `account` rows real, so `profiles.user_id → user.id` is a genuine
cascading FK. No `session` row is ever written, and the `session` table stays defined-and-empty
because `@auth/drizzle-adapter` requires all four tables to exist. **`proxy.ts` must not import
this file** — that is the whole reason the config is a separate module.

### `auth.config.ts` — the edge-safe half

`authConfig satisfies NextAuthConfig`, importing **nothing from the project** — deliberately,
because `lib/env.ts` opens with `import 'server-only'` and would poison the edge bundle. One
Google provider with `prompt: 'select_account'` and `access_type: 'online'` (no unused refresh
token is minted or stored), `allowDangerousEmailAccountLinking: false` (one provider, so there is
no legitimate cross-provider linking scenario), JWT sessions with a 30-day `maxAge` and a 1-day
`updateAge`, `trustHost: true`, and `signIn`/`error`/`signOut` all pointed at `/` — `/` is both
the runs list and the signed-out sign-in screen, and there is no marketing page. The two callbacks
do one thing between them: carry `user.id` through `token.sub` into `session.user.id` (augmented
in `types/next-auth.d.ts`). There is no sign-in gate and no allowlist; any Google account may sign
in, and safety is per-`userId` scoping instead.

### `proxy.ts` — a redirect, **not** the security boundary

```ts
export const proxy = withAuth((req) => { /* redirect to /?next=… when unauthenticated */ })
export const config = {
  matcher: ['/upload', '/r/:path*', '/x/:path*', '/trends', '/me', '/onboarding'],
}
```

It builds a **second, adapter-free** `NextAuth(authConfig)` instance, and it exists for UX only:
land on a protected URL while signed out and you arrive at `/` with `?next=` preserved. The actual
boundary is `lib/auth/requireUserId.ts` plus the `userId` filter inside every query.

The matcher is **positive**, and the omissions are load-bearing: `/` and `/s/:token*` are public
(**never add the share route** — the pathname *is* the bearer token), the `/api/*` handlers
authenticate themselves (`requireUserIdApi()`, `CRON_SECRET` for the crons), and `/nina` and
`/admin/**` are omitted because they are protected by `requireUserId()` and `requireAdmin()`
respectively — both enforce auth themselves, so the only thing a matcher line would buy is a
nicer bounce. `tests/auth.proxy.matcher.test.ts` asserts the list.

The file is `proxy.ts`, not `middleware.ts`, and the export is `proxy` — the Next 16 rename.
`runtime` is not settable here.

### `next-env.d.ts`

Generated by Next; not to be edited.

## Internal Architecture

### Data flow — one reveal, end to end

```
app/nina/page.tsx  <AppShell screen="chat">
        │
        ├── NinaBarProvider ── NinaSidebarProvider     ← shared bar state; chrome and rail both dispatch
        │
        ├── <main class="pb-[calc(7rem+var(--safe-bottom))]">     ← fixed document height
        │        └── ChatScreen ── Composer
        │              bottom    = composerBottomCss(overlap, COMPOSER_CLEARANCE_PX /* 40 */)
        │                         = calc((40px + var(--safe-bottom)) * var(--nina-bar-visible, 0))
        │              padBottom = composerPadBottomCss(overlap)    ← the floor, the complementary gate
        │
        └── <ChatChrome ninaBadge={<NinaUnreadBadgeSlot />}>      ← 'use client', measures & publishes
                 │
                 │  focus on #nina-composer ──→ nextBarState(_, 'composer-engaged') → 'hidden'
                 │  tap the control, or the rail's `up` ──→ dispatch('toggle')
                 │  autoHideDelayMs(bar, kbEngaged) ?? no timer ──5000ms──→ nextBarState(_, 'autohide')
                 │
                 ├── writes :root style --nina-bar-visible = '1' when shown, removes it when hidden
                 ├── floating control, rendered only when isControlVisible(engaged)
                 │     bottom = controlBottomCss({ barState, barClearancePx: BAR_CLEARANCE_PX /* 40 */,
                 │                                 composerHeightPx })
                 │     glyph  = barToggleGlyph(barState)
                 └── <TabBar hidden={bar === 'hidden'} ninaBadge={…} id="main-tab-bar">
                           translate: hidden ? '0 100%' : '0 0'
```

The other tabbed screens take the left branch of the ternary and are unchanged: an unconditional
`<TabBar>` (default `hidden={false}`), the same 39 px grid, the same unread dot. `TabBar`'s
`hidden` and `ninaBadge` are both optional so `app/(app)/loading.tsx` and
`app/trends/loading.tsx` keep compiling untouched — a loading fallback has no session to count
against and no reveal state to hold.

### The route tree, and its chrome

Nineteen pages, nine route handlers, three layouts. Two route groups — `(app)` and `(public)` —
neither of which contributes a URL segment.

| route | file | chrome | notes |
|---|---|---|---|
| `/` | `app/(app)/page.tsx` | `AppShell` + `ScreenHeader` | runs list **and** the signed-out sign-in screen |
| `/upload` | `app/upload/page.tsx` | none — own full-bleed | the `New` tab's target, the bar's centre cell |
| `/x/[extractionId]` | `app/x/[extractionId]/page.tsx` | none — own full-bleed | pre-commit review; no run id exists yet |
| `/r/[id]` | `app/r/[id]/page.tsx` | `AppShell` (tabs) | hand-rolls its own header row, on purpose |
| `/r/[id]/edit` | `app/r/[id]/edit/page.tsx` | none — own full-bleed | post-review correction |
| `/trends` | `app/trends/page.tsx` | `AppShell` + `ScreenHeader` | `maxDuration = 60` |
| `/me` | `app/me/page.tsx` | `AppShell` + `ScreenHeader` | profile, records, badge shelf |
| `/nina` | `app/nina/page.tsx` | **`AppShell` (chat)** | `maxDuration = 300`; the only `screen` call site |
| `/nina/about` | `app/nina/about/page.tsx` | `AppShell` (tabs) | her page: viewer, attach strip, job tracking |
| `/nina/jobs` | `app/nina/jobs/page.tsx` | `AppShell` + `ScreenHeader` | her image-job queue, runner-facing |
| `/nina/jobs/[id]` | `app/nina/jobs/[id]/page.tsx` | `AppShell` + `ScreenHeader` | one job, live status |
| `/onboarding` | `app/onboarding/page.tsx` | none | standalone |
| `/admin`, `/admin/nina`, `/admin/personality`, `/admin/image-generation`, `/admin/memory`, `/admin/shortcuts` | `app/admin/**` | none — `app/admin/layout.tsx` | a phone shell below `lg` (six-cell `AdminNav`, all four safe-area insets) and the unchanged desktop rail at `lg`; caps at `max-w-[1400px]`; carries the **second install contract** below |
| `/s/[token]` | `app/(public)/s/[token]/page.tsx` | none — own layout | public share; `force-dynamic`, plus `not-found.tsx` |

Route handlers, all declaring `runtime = 'nodejs'`: `/api/auth/*` (re-exports Auth.js `handlers`),
`/api/health`, `/api/upload`, `/api/extract`, `/api/extract/[id]`, `/api/cron/rollup` and
`/api/cron/nina` (the two `vercel.json` crons), and `/api/admin/nina/upload`.

The ninth is the one that is not under `/api`: **`app/admin/manifest.webmanifest/route.ts`**,
`export const dynamic = 'force-static'`, serving `application/manifest+json`. It is a hand-written
handler rather than a second `manifest.ts` because the `manifest` file convention is root-of-`app`
only (verified in `next/dist/lib/metadata/is-metadata-route.js`, whose matcher is anchored at the
app root), and it is `force-static` so the handler behaves like the convention route it stands in
for.

`app/layout.tsx` is the root layout and the one place **`viewport-fit=cover`** is set — without it
`env(safe-area-inset-*)` returns zero and every `--safe-bottom` term in the geometry above
silently collapses. It also self-hosts Poppins via `next/font/google` and points `manifest` at
`app/manifest.ts`. `app/robots.ts` allows `/` and `/s/` and disallows the rest; `/s/` is
crawlable-but-`noindex` on purpose, because `Disallow` is not `noindex` and blocking it would
break the WhatsApp preview card. There is no `sitemap.ts`, no root `error.tsx` and no root
`not-found.tsx` — each absence is deliberate.

`app/actions/share.ts` is not a route: it holds the Server Actions `createShareLinkAction`,
`revokeShareLinkAction` and `setPhotoSharingAction`.

### Which screens get chrome at all

The bar is a prop rather than a route-group `layout.tsx` because `/upload`, `/x/*` and
`/r/[id]/edit` are feature screens with their own full-bleed chrome, and wrapping them by
directory would take a layout decision away from the feature that owns them. `/r/[id]` is the one
case the roadmap (§4.8: a pushed screen) and the wireframes (§2.2: bar drawn) read differently —
**the wireframe wins**: a run detail page is where a reader lands from a share link or after a
commit and then wants to go somewhere.

`TabBar` is `'use client'` for exactly one reason: `usePathname`, for `aria-current`. Nothing else
in it is interactive — the tabs are plain `<Link>`s, so the bar works before hydration. Its
five-cell grid is what centres `/upload`, and `/upload` is the **third** of the five `TABS`
entries for that reason alone: `(2 + 0.5) / 5` is exactly 50 % of the bar, where appending it to
the end would put it at 90 % and every type would still check.

### The install contract — two manifests on one origin

An install contract is invisible to lint, typecheck and build; only a phone can see it. So the
facts are stated once in **`lib/pwa.ts`** — `INSTALL`, `ADMIN_INSTALL`, `APPLE_WEB_APP`,
`PWA_ICONS`, `ADMIN_PWA_ICONS` — and read from the three places that cannot see each other: the
manifests, the layouts' `metadata`, and `tests/pwa.install.test.ts` (42 cases).

There are **two** manifests, because a manifest describes one app and `start_url` is a single
value. Safari launches an installed home-screen tile from the `start_url` of whatever manifest the
page linked — **not** from the URL that was on screen.

| | runner | admin |
|---|---|---|
| constants | `INSTALL` | `ADMIN_INSTALL` |
| served by | `app/manifest.ts` (file convention) | `app/admin/manifest.webmanifest/route.ts` (handler) |
| linked from | `app/layout.tsx` | `app/admin/layout.tsx` |
| `id` / `start_url` | `/` | `/admin` |
| `orientation` | `portrait` — no landscape layout to rotate into | `any` — the admin shell has one |
| splash / theme | `--paper` `#c9e9fb` | `--paper-2` `#f1f7fb`, matching `/admin`'s `bg-paper-2` |
| notch band (`theme-color`) | `#c9e9fb` light / `#0e1b26` dark, from the root `viewport` | `#f1f7fb` light / `#162834` dark, from `app/admin/layout.tsx`'s own `viewport` |
| icons | `PWA_ICONS`, `app/icon.png` + `app/apple-icon.png` | `ADMIN_PWA_ICONS`, `app/admin/apple-icon.png` |
| `shortName` | `Run Insights` (12 chars, the iOS ceiling) | `RI Admin` (8; no room to suffix the above) |

Both set `scope: '/'`, and for the admin one that is **load-bearing rather than copied**: anything
outside scope opens in a browser tab instead of the installed app, and `requireAdmin` answers a
session-less request with `redirect('/')`. A `scope: '/admin'` would eject the installed admin app
into Safari on exactly the day the cookie expired.

Two merge rules, each read from Next's source rather than assumed:

- **`metadata` resolves root → nested with duplicate keys replaced whole.** That is what lets
  `app/admin/layout.tsx` override `manifest` for that segment and nothing else — and it is a trap
  one line down: `appleWebApp` is a nested field replaced *whole*, so it is written
  `{ ...APPLE_WEB_APP, title: ADMIN_INSTALL.shortName }` — the spread is what keeps `capable:
  true`, the single line that stops the install from being a bookmark, alive under `/admin`.
  Neither layout sets an `icons` key: an explicit `metadata.icons` suppresses the file-convention
  icons, which would silently delete the apple-touch-icon Safari actually reads on install.
- **`viewport` merges by key, and that is a different rule from `metadata`'s.** `mergeViewport`
  (`node_modules/next/dist/lib/metadata/resolve-metadata.js`) `structuredClone`s the resolved
  parent and then iterates the child's keys, so the admin layout's `viewport` carries `themeColor`
  and **nothing else** while `viewportFit: 'cover'` keeps arriving from the root — and with it all
  four `env(safe-area-inset-*)` paddings in the admin shell. **Do not restate `viewportFit`
  there**: a second source of truth for the one value that must not drift, and it drifts
  silently, because an inert inset renders as a layout that is merely slightly wrong.

A useful consequence when probing this: metadata and `viewport` resolve from the segment tree
independently of what the page component *does*, so a session-less `curl` of `/admin` — a `307`
with an empty body, since `requireAdmin` redirects — still carries the complete resolved
`<head>`. Reading the served tags needs neither an auth cookie nor a live database.

## Dependencies

### External

Every runtime dependency is **exact-pinned** (no carets; `playwright` aside, and the dev testing
stack — `@testing-library/*`, `happy-dom` — is caret-pinned with the rest of the tooling). The
ones that shape this package rather than a leaf:

- `next 16.3.1` — App Router, `proxy.ts` instead of `middleware.ts`, Turbopack by default (hence
  no `webpack` key in `next.config.ts`), and `next typegen` before `tsc` so `PageProps<'/nina'>`
  and `LayoutProps<'/admin'>` resolve.
- `react 19.2.8` / `react-dom 19.2.8` — the Server/Client Component split the shell seam depends
  on.
- `next-auth 5.0.0-beta.32` + `@auth/drizzle-adapter 1.11.3` — the two-instance auth edge above.
- `tailwindcss 4.3.3` (+ `@tailwindcss/postcss`) — v4 compiles `translate` and `scale` to separate
  longhands, which is why `transition-[translate]` is the correct property name for the reveal.
- `drizzle-orm 0.45.2` + `@neondatabase/serverless 1.1.0` — reached only through `lib/db`.
- `zod 4.4.3` — the environment contract in `lib/env.ts` and every request/LLM shape.
- `server-only 0.0.1` — the marker that makes the barrel/shell boundary a build error instead of a
  leak. `vitest.config.ts` aliases it to `tests/support/serverOnlyStub.ts`.

### The packages this root composes

`lib/` (22 subdirectories) holds all domain logic; `components/` (13 feature folders) holds the
React tree; the suites are ~270 flat files — ~160 under `tests/`, ~40 co-located
`lib/**/*.test.ts`, ~74 `components/**/*.test.tsx` under happy-dom; `scripts/` holds the
operational scripts and the seven `check-*` CI guards; `tools/` holds the Python badge and icon
art pipeline; `drizzle/` holds generated SQL migrations; `types/` holds one module augmentation;
`docs/plans/archive/` holds the landed feature plans; `research/` is the pre-build feasibility
harness (excluded from `tsconfig` and `eslint`). `lib/db`, `lib/admin`, `lib/nina`,
`components/admin`, `components/nina`, `scripts`, `tools`, `lib/llm`, `components/ui`, and
`lib/schema` each have their own package readme; several combined estates are also documented
in one shared file: the review surface (`lib/review` + `components/review`), the photo/extract
pipeline (`lib/extract` + `lib/photos` + `components/extract`), the badges/records pair
(`lib/badges` + `lib/records`), the date/flags/derived utilities (`lib/.workflows/package_readme.md`),
the profile/share estate (`lib/share` + `lib/profile` + `components/profile` + `components/share`),
the insights/metrics dashboard layer (`lib/metrics` + `lib/insights` + `components/insights` +
`lib/panel`), and the auth/push/runs/trends cluster (`lib/auth` + `lib/push` + `lib/runs` +
`components/auth` + `components/push` + `components/runs` + `components/trends`).

### Internal (root → packages)

- `components/ui/AppShell` — the shell every page wraps itself in; the only importer of
  `components/ui/TabBar` besides `ChatChrome` and the barrel.
- `components/nina/ChatChrome` — imported by `AppShell` for `screen === 'chat'`.
- `components/nina/NinaBarProvider` / `NinaSidebar` / `NinaUnreadBadge` — the two providers and
  the server-constructed badge slot.
- `lib/nina/chrome` — the reveal rules, and `NINA_CHROME_CONTROL_CLASS`: the floating discs'
  shared skin, read by `ChatChrome`, `NinaSidebar` (trigger and rail) and `NewChatButton`.
- `lib/nina/chatview` — `NINA_BAR_VISIBLE_VAR` (by `ChatChrome`),
  `composerBottomCss`/`composerPadBottomCss`/`keyboardOverlapPx` (by `ChatScreen`), and
  `NINA_KEYBOARD_OVERLAP_VAR`, `KEYBOARD_REASSERT_DELAYS_MS`, `panelBottomCss` and friends (by
  `NinaSidebar`).
- `lib/pwa` — the install contract (`INSTALL`, `ADMIN_INSTALL`, `APPLE_WEB_APP`, `PWA_ICONS`,
  `ADMIN_PWA_ICONS`), read by `app/manifest.ts`, `app/layout.tsx`,
  `app/admin/manifest.webmanifest/route.ts` and `app/admin/layout.tsx`. Plain constants — no
  `server-only`, no env read, no image generation.
- `lib/cn` — class composition, by both `AppShell` and `TabBar`.
- `lib/env` — `server-only`; reachable from `AppShell` through the badge, which is why the shell
  is out of the UI barrel.

### Boundary rule

`lib/` never imports `components/`. That is why `controlBottomCss` takes `barClearancePx` as an
argument rather than importing `TAB_BAR_OUTER_HEIGHT_PX` itself — the constant is read in
`ChatScreen`/`ChatChrome`, on the components side, and passed in. `NINA_CHROME_CONTROL_CLASS`
lives in `lib/nina/chrome.ts` for the same direction: both consumers are components.

## Reverse Dependencies

### `AppShell` consumers

All ten: `app/(app)/page.tsx`, `app/(app)/loading.tsx`, `app/me/page.tsx`, `app/trends/page.tsx`,
`app/trends/loading.tsx`, `app/r/[id]/page.tsx`, `app/nina/about/page.tsx`,
`app/nina/jobs/page.tsx`, `app/nina/jobs/[id]/page.tsx`, and `app/nina/page.tsx`. Seven of them
also import `ScreenHeader`; `/r/[id]`, `/nina/about` and `/nina` hand-roll their header rows on
purpose — each says so in a comment (a run detail's header is not a plain title row; a
conversation's identity is a face and a name, not a title and a link). `app/nina/page.tsx` is the
**only** call site that passes `screen`; every other consumer relies on the `'tabs'` default.

Deliberate non-consumers, each of which says so in a comment — do not "fix" them by wrapping them:
`app/upload/page.tsx` and `app/x/*` (full-bleed feature chrome of their own),
`app/admin/layout.tsx` and `components/admin/FileExplorer.tsx` (`AppShell` is the shell that
hardcodes `max-w-[470px]` and pairs itself with the runner's `TabBar`; the admin shell caps at
`max-w-[1400px]` and carries its own six-cell `AdminNav` — and `FileExplorer` is still
desktop-shaped), `app/(public)/s/[token]/page.tsx` (a public page, and the shell's import graph is
what `tests/share.bundle.test.ts` guards), and `components/profile/RecordsTable.tsx` (would drag
the shell across a client boundary for one empty state).

### Geometry-constant consumers

`TAB_BAR_OUTER_HEIGHT_PX` is imported by `components/nina/ChatScreen.tsx` (as
`COMPOSER_CLEARANCE_PX`) and `components/nina/ChatChrome.tsx` (as `BAR_CLEARANCE_PX`, the control
lane's clearance) — the two files that stack fixed chrome above the bar, and the only two
importers of it. `TAB_BAR_HEIGHT_PX` and `TAB_BAR_BORDER_PX` are cited by name in `AppShell.tsx`
and `PhotoViewer.tsx` comments and consumed only through the outer height.

Two suites reach across the `lib`/`components` boundary by reading source **as text** rather than
by importing: `lib/nina/chrome.test.ts` for the motion contract, and
`tests/tabbar.geometry.test.ts` for the bar's geometry. The latter *imports* the four exported
constants (safe under `environment: 'node'`) and *scans* the two clearances, which are
module-private constants inside client components that reach Server Actions — there is nothing to
import. It is the home for the bar's geometry rules; the next one belongs there too.

## Concurrency

Client-side only, and single-threaded. What matters instead is **timer and effect lifecycle**:

- The bar's state is one value in `NinaBarProvider`. Both writers — `ChatChrome`'s control and the
  rail's `up` — dispatch into it, and the effects that read it live in `ChatChrome`: the auto-hide
  timer, the keyboard rule, and the var write fire on the shared state whatever wrote it.
- The auto-hide timer is one `window.setTimeout` created by an effect keyed on
  `autoHideDelayMs(bar, keyboardEngaged)`; when that returns `null` the effect returns early and no
  timer exists. Because `'autohide'` is idempotent, a timer that survives a race can only
  re-assert `'hidden'`.
- A `setTimeout(sync, 0)` debounces focus/blur so that moving focus *within* the composer does not
  read as a release.
- The `--nina-bar-visible` write is an effect on `:root` with a cleanup that removes the property,
  so leaving `/nina` cannot leave the composer clearing a bar that is no longer rendered.

Everything in `lib/nina/chrome.ts` and `lib/nina/chatview.ts` is a pure function of its arguments:
no module state, no I/O, no timers, safe to call from anywhere.

## Error Handling

No sentinel errors and no throws in this layer. The chrome rules are **total instead**: every
function is defined for every input in its type, and degenerate numeric input resolves to the
resting screen rather than an exception — an unmeasured composer height falls back to
`COMPOSER_RESTING_PX` (plus the floor's own string), a non-finite clearance contributes zero, a
hidden bar contributes no clearance whatever the argument says, and a non-finite keyboard overlap
reads as "no keyboard". The failure mode of this layer is a wrong offset, and a wrong offset that
renders beats a thrown error that blanks the conversation.

## Performance

The reveal costs one `translate` transition on a `fixed` element and one custom-property write on
`:root`. No layout is read during the transition, and `BOTTOM_GAP` is a static class, so the
document's height never changes when the bar moves — which is precisely what keeps `MessageList`'s
auto-scroll from chasing it.

`controlBottomCss`, `composerBottomCss` and their siblings return strings and are called on
render; each is arithmetic on a handful of numbers.

## Configuration

One config per concern, and each is the only one of its kind — do not add a second.

| file | the settings that matter |
|---|---|
| `tsconfig.json` | `strict` **plus `noUncheckedIndexedAccess`**; `verbatimModuleSyntax`; path alias `@/* → ./*`; `plugins: [{ name: 'next' }]`. Excludes `drizzle` and `research`. |
| `vitest.config.ts` | **`environment: 'node'`** — the default that keeps every rule in `lib/` assertable. `include` is `tests/**`, `lib/**`, `app/**` `*.test.ts` and `components/**` `*.test.tsx`; the component suites opt into a DOM with a per-file `// @vitest-environment happy-dom` docblock. `globals: false`, `setupFiles: tests/support/setup.ts`, `testTimeout` 5 s (180 s for live suites). `tests/integration/**` and `tests/live/**` are excluded unless `VITEST_INTEGRATION=1` / `LLM_LIVE_TEST=1`. Aliases `server-only` to `tests/support/serverOnlyStub.ts`. |
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

Plus a line in `proxy.ts`'s matcher if the route is protected — that is what makes the signed-out
bounce work; authorization itself still comes from `requireUserId()`.

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
- **Do not change one geometry constant.** The map above is the whole set. `tsc` and the linter see
  none of it; `tests/tabbar.geometry.test.ts` covers the bar's own numbers and the two clearances,
  and nothing covers the rest. The symptom is a floating composer or a bubble sliced by the bar.
- **Anything stacked above the tab bar clears `TAB_BAR_OUTER_HEIGHT_PX` (40), never
  `TAB_BAR_HEIGHT_PX` (39).** 39 is the grid; 40 is the bar's top edge. The one-pixel version of
  that mistake shipped, and it looked like a seam with the conversation scrolling through it.
- **Do not make `BOTTOM_GAP.chat` follow the reveal.** It is the document's height; tying it to
  the bar's state moves the scroll position on every toggle.
- **Keep reveal rules in `lib/nina/chrome.ts` and `chatview.ts`, not in a component.** Component
  suites exist now (happy-dom), but a rule as a pure function is assertable in the default node
  environment and covers every input rather than one rendered instance — and the decision stays
  out of the client bundle.
- **Do not pause the auto-hide timer while the composer is engaged.** Hide instead; the
  paused-timer version fires on blur and hides a bar the runner never saw, because iOS does not
  resize the layout viewport for the keyboard.
- **Nothing may paint above the nav's border box.** `translate: '0 100%'` moves the whole bar off
  screen only while that holds; the last thing that broke it (`absolute -top-5` on the Upload FAB)
  left 20 px of coral on screen with the bar "hidden", on phones with no home-indicator inset
  only.
- **Two bar toggles, one state.** `ChatChrome`'s floating control and the sidebar rail's `up` must
  dispatch through `NinaBarProvider` — a second state would be two bars that disagree.
- **Do not add `viewportFit` to `app/admin/layout.tsx`.** The root's value arrives by `viewport`
  merge-by-key; restating it creates a second source of truth for the one value that must not
  drift.

## Notes

### Charter

Minted 2026-09-05 for P1-RI-A006, whose changes span `components/ui`, `components/nina` and
`lib/nina` and therefore had no single sub-package readme to live in. This file is scoped to what
the root owns — the shell contract, the bottom-chrome geometry, the route/chrome map, the
server/client and provider seams, the auth edge and the repo-wide configuration. The persistence
layer is documented in `lib/db/.workflows/package_readme.md`; the admin surfaces in `lib/admin/`
and `components/admin/`; the chat internals (the turn pipeline, the sidebar, the keyboard channel,
the bar's var writer, the jobs surfaces) in `lib/nina/` and `components/nina/`; operations in
`scripts/`. Nothing here duplicates them.

The product contracts this file used to defer to by path — `RECONCILIATION_v0.1.0.md` (the `R-n`
rulings), `ROADMAP_v0.1.0.md` (§4.1 env vars, §4.2 formatting, §4.3 schema, §4.8 routes) and the
per-feature plans — were retired from the repo root; the rulings and sections cited above are
readable from git history (see the `docs: re-point retired RECONCILIATION/ROADMAP citations at git
history` commit). Landed feature plans live in `docs/plans/archive/`.

### Recent changes

**2026-09-12 — compaction and verification.** This file had grown to 1359 lines, roughly half of
it twelve per-phase changelog entries restating facts the body already carried — the
recurring-context-cost problem this and the sibling readmes are being compacted to fix. Policy
from here on: **one rolling paragraph per landing wave, no per-phase entries** — the durable
statements belong in the sections above and the constants' own docstrings; the narrative belongs
in git history. Everything above the fold was re-verified against the tree, and the corrections
this pass made are the reason to keep doing it:

- **Geometry re-based on the compact bar** (`composer-frost-and-admin-notch` R5, `18b0c58`):
  `TAB_BAR_HEIGHT_PX` 58 → **39** (the grid is the stack: 20 px glyph + 4 px gap + 15 px caption),
  outer height **40**, plus the new `TAB_BAR_CONTENT_DROP_CSS` caption drop. `COMPOSER_RESTING_PX`
  68 → **60** (py-3 → py-2, P1-RI-A023), `BOTTOM_GAP.chat` 7.5rem → **7rem** (112 = 60 + 8 + 32 +
  12), `COMPOSER_FALLBACK_PX` → **100**. The old text still said 58/59/68/127/7.5rem.
- **The inset moved inside the gates** (P1-RI-A023): `composerBottomCss` is now
  `calc((<clearance>px + var(--safe-bottom)) * var(--nina-bar-visible, 0))` — the old "the inset
  sits outside the multiplication" passage had been false since the change — and the composer
  carries the hidden state's floor itself via `composerPadBottomCss`. New siblings:
  `attachStripPadBottomCss`, `panelBottomCss`.
- **The bar state moved to `NinaBarProvider`** (`search-kbd-and-up-btn` phase 2, P1-CN-A002,
  `0b4683b`): `AppShell` mounts it around both subtrees on chat screens, and the rail's `up` —
  which replaced the scroll-to-top handle; `listScrollRef`/`onScrollToTop` are gone — dispatches
  `toggle` into the same state `ChatChrome`'s control writes.
- **Route table completed**: `/nina/jobs` and `/nina/jobs/[id]` (AppShell tabs + `ScreenHeader`)
  were missing entirely; the merged-away `/admin/photos` was removed; `/nina`'s `maxDuration` is
  **300**, not 60; `AppShell` has ten consumers now, seven of them `ScreenHeader` importers;
  `r/[id]` hand-rolls its header row.
- **Counts corrected**: 19 pages (was 16), 22 `lib/` directories (was 23), 13 `components/`
  folders (was 15), ~270 suites (was ~100) of which ~74 are happy-dom component suites — the
  harness arrived after this file's "a rule in a component cannot be asserted at all" claims were
  written; those passages are reworded rather than deleted, and the rules still live in `lib/`,
  with the reasons now stated honestly.
- **Install contract updated**: `ADMIN_PWA_ICONS` and `app/admin/apple-icon.png` shipped, so the
  "both tiles draw the same art" known-cost note is gone; the admin `viewport` merge behaviour,
  at one point recorded as unverified, is now cited from `mergeViewport` in Next's source.
- **Retired citations repointed**: `RECONCILIATION_v0.1.0.md` / `ROADMAP_v0.1.0.md` no longer
  exist at the root; the precedence note names git history.

Earlier landings this file recorded as per-phase entries — the chat-chrome reveal (P1-RI-A006),
the `New` tab and composer seam (P1-RI-A015/A016), the sidebar rails and search ✕
(P1-RI-A025–A027), the avatar-profile thread (P1-RI-A019), the two-manifest install contract
(P1-RI-A021), the revision purges (P1-RI-A040, A029, A031), the image-collection set
(P1-RI-A034/A036, P1-CA-A005), and the F35 chat-sessions set (titling, sidebar, edit/delete,
search, photo-tap) — are durable in git history and in the `lib/nina` / `components/nina` readmes,
which now exist and carry those features' own sections. This file keeps only the root-owned slice
of each: the seams, the geometry, and the routes.
