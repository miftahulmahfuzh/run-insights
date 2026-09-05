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
