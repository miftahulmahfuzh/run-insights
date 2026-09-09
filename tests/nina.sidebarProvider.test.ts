import { describe, expect, it } from 'vitest'

import { isClientModule, readRepoCode } from './support/importGraph'

/**
 * **The sidebar's provider has to sit above BOTH of its consumers, and this file is what notices
 * when it does not.**
 *
 * MEASURED IN PRODUCTION, F35: the `>` that opens the chat list did not render at all, and R6's
 * whole panel was reachable only by typing `?sidebar=1` into the address bar. Nothing was broken
 * about the panel, the trigger, or the rules — every unit test passed, `tsc` was clean, the build
 * succeeded, and 2513 tests were green. The bug was purely a question of WHERE two components sat
 * relative to each other:
 *
 *   - `NinaSidebarTrigger` reads `useNinaSidebar()` and returns `null` outside a provider. That is
 *     deliberate: a `ChatChrome` on a screen with no sidebar should simply have no `>`.
 *   - `ChatChrome` is rendered by `AppShell`, as a SIBLING of `<main>{children}</main>`.
 *   - The provider was in `app/nina/page.tsx`, which is inside `{children}`.
 *
 * So the trigger was a context consumer mounted outside its own provider, on the one screen that
 * needs it, and its `null` was indistinguishable from the intended "no sidebar here".
 *
 * WHY THIS TEST IS STRUCTURAL. `vitest.config.ts` runs `environment: 'node'` — there is no DOM in
 * this repo's suite and no component is ever rendered, which is why `ChatChrome`'s own docstring
 * says a rule living in a component "cannot be asserted in this repo at all". A provider/consumer
 * relationship is exactly such a rule. `tests/share.bundle.test.ts` established the answer: assert
 * on the source text, because a text scan proves more here than an import would.
 *
 * The second symptom is worth recording because it misleads. With the trigger rendering `null`,
 * the `^` toggle became the first DOM child of `ChatChrome`'s `grid-cols-3` lane, so
 * `justify-self-center` centred it in column ONE and R1's "bottom middle" control sat a fifth of
 * the way across the screen. A reviewer looking at that would go hunting in the grid, which is not
 * where the bug was.
 */

const SHELL = 'components/ui/AppShell.tsx'
const PAGE = 'app/nina/page.tsx'
const SIDEBAR = 'components/nina/NinaSidebar.tsx'
const CHROME = 'components/nina/ChatChrome.tsx'
const FIELD = 'components/nina/NinaSearchField.tsx'
const BAR_PROVIDER = 'components/nina/NinaBarProvider.tsx'

describe('the sidebar provider wraps both of its consumers', () => {
  it('AppShell renders the provider, because it is what renders ChatChrome', () => {
    const shell = readRepoCode(SHELL)
    expect(shell).toContain('NinaSidebarProvider')
    expect(shell).toContain('<ChatChrome')
  })

  it('the provider wraps the shell rather than sitting inside it', () => {
    const shell = readRepoCode(SHELL)
    // The provider must enclose the fragment that holds BOTH <main> and <ChatChrome>. If it were
    // nested anywhere inside, one of the two consumers would fall outside it again.
    expect(shell).toMatch(/<NinaSidebarProvider>\{shell\}<\/NinaSidebarProvider>/)
  })

  it('the page does NOT render a second provider', () => {
    // Two providers is this bug with a subtler symptom: the trigger and the panel would each get
    // their own `pushedRef`, so closing the panel would `replaceState` instead of popping the entry
    // the trigger pushed, and the back gesture would be dead.
    const page = readRepoCode(PAGE)
    expect(page).not.toContain('<NinaSidebarProvider>')
    expect(page).toContain('<NinaSidebar')
  })

  it('the trigger still returns null outside a provider, which is why placement matters', () => {
    const sidebar = readRepoCode(SIDEBAR)
    expect(sidebar).toContain('export function NinaSidebarTrigger')
    expect(sidebar).toMatch(/if \(sidebar === null\) return null/)
  })

  it('ChatChrome renders the trigger, so it is a consumer and must be inside the provider', () => {
    expect(readRepoCode(CHROME)).toContain('<NinaSidebarTrigger')
  })

  it('AppShell stays a Server Component', () => {
    // Rendering a client provider from here is a boundary, not a conversion. Five pages import this
    // file and `tests/share.bundle.test.ts` exists because this import graph leaked a session read
    // once already — a `'use client'` here would be a much larger change than the bug warranted.
    expect(isClientModule(SHELL)).toBe(false)
  })
})

describe('the bar provider wraps both of ITS consumers', () => {
  it('NinaBarProvider exists and exposes the nullable hook', () => {
    const provider = readRepoCode(BAR_PROVIDER)
    expect(provider).toContain('export function NinaBarProvider')
    expect(provider).toContain('export function useNinaBar')
    expect(provider).toContain('NinaBarContextValue | null')
  })

  it('AppShell mounts it around the same shell node the sidebar provider wraps', () => {
    const shell = readRepoCode(SHELL)
    // The rail's `up` (inside {children}, in the panel) and ChatChrome's toggle (the chrome
    // sibling) must read ONE bar state. Measured in production for the sidebar provider: a
    // consumer mounted outside its own provider takes its null branch and the control silently
    // does nothing — every unit test green, a dead button in the hand. Placement is the bug this
    // file exists for. The bar provider sits OUTSIDE so the sidebar provider keeps enclosing
    // `{shell}` directly, which this file's first describe pins.
    expect(shell).toMatch(/<NinaBarProvider>\s*<NinaSidebarProvider>\{shell\}/)
  })

  it('both consumers read the shared state through the hook', () => {
    expect(readRepoCode(CHROME)).toContain('useNinaBar()')
    expect(readRepoCode(SIDEBAR)).toContain('useNinaBar()')
  })
})

/**
 * **A tap that navigates must not also fire the close path — MEASURED IN PRODUCTION, 2026-09-08.**
 *
 * The search-jump set (`search-jump-pinpoint`) landed with every gate green and every href correct,
 * and in production a search hit opened the conversation the runner was ALREADY in, never the hit's
 * own. The departure was the bug, not the landing: `NinaSearchField`'s hit was a `<Link>` that also
 * called `onNavigate`, and the sidebar wired that to `closeRef` — so `closeSidebar()` ran
 * `window.history.back()` (its `pushedRef` branch; opening the panel had pushed `?sidebar=1`) in
 * the SAME TICK as the Link's own push. A back and a forward raced on one entry, and the back won:
 * the pop to `/nina?s=<current>` cancelled the pending push to `/nina?s=<hit>&jump=<message>`, the
 * screen never re-rendered another session, and `?jump=`'s landing — mount or soft-nav — never ran.
 * The panel itself closed (the popped-to entry predates `?sidebar=1`), which made the tap look
 * like it had worked.
 *
 * The rule is the one the `/nina/jobs` link's own header already states: "a plain `<Link>`, and it
 * deliberately does not call `closeRef` … firing it in the same tick as a `<Link>`'s push would put
 * a back and a forward on one entry and race them." The hit href carries no `sidebar` key, so the
 * navigation itself drops `?sidebar=1` and the panel closes through the URL that opened it — the
 * same close the avatar link, the jobs link and `SessionRow`'s inactive row already rely on.
 * `NewChatButton` keeps its callback: it is a `<button>` that closes FIRST and then
 * `router.replace`s, no push to race.
 */
describe('a search hit leaves the panel by navigation alone', () => {
  it('the hit is a plain Link — no onClick beside its href', () => {
    const field = readRepoCode(FIELD)
    expect(field).toContain('href={hit.href}')
    // The prop is the seam: while it exists, some caller can wire it back to closeRef and re-arm
    // the same-tick back. Removing it is the rule, not passing a noop.
    expect(field).not.toContain('onNavigate')
  })

  it('the sidebar does not hand the search field its close callback', () => {
    const sidebar = readRepoCode(SIDEBAR)
    expect(sidebar).toMatch(/<NinaSearchField\s*\/>/)
  })
})
