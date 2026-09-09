'use client'

import * as React from 'react'

import { nextBarState, type NinaBarState, type NinaChromeEvent } from '@/lib/nina/chrome'

/**
 * `/nina`'s bar state, shared by the two controls that move it (R2).
 *
 * ── WHY A PROVIDER, AND WHY MOUNTED IN `AppShell` ─────────────────────────────────────────────
 * The bar's reveal state was `ChatChrome`'s local `useState`, and the chat page's toggle was its
 * only writer. R2 gives the sidebar rail's `up` the same job — "persis sama dengan tombol up di
 * chat page" — and the panel is `ChatChrome`'s SIBLING: `AppShell` renders `<main>` (the panel
 * rides in through the page) and the chrome side by side, so no prop chain reaches from one to the
 * other, and two local states would be two bars that can disagree. `NinaSidebarProvider` sits
 * above both for exactly this reason — measured in production when it did not
 * (`components/ui/AppShell.tsx`'s docstring), and `tests/nina.sidebarProvider.test.ts` is what
 * notices if the placement regresses. Same shape of problem, same answer: one provider around the
 * same `shell` node, and the panel's rail button and the chat toggle can never disagree because
 * they hold one state.
 *
 * ── WHY ONE `dispatch` AND NOT A METHOD PER EVENT ─────────────────────────────────────────────
 * `nextBarState` is total over `NinaChromeEvent`, and the events' names are the vocabulary the
 * machine and its tests already use. Exposing the machine's own event — rather than `toggleBar()`
 * / `hideBar()` wrappers — keeps every call site reading as its rule (`dispatch('autohide')`,
 * `dispatch('composer-engaged')`) and adds no second way to say "be hidden". `'toggle'` has
 * exactly two senders, both buttons; the other two events are `ChatChrome`'s effects'.
 *
 * The resting state is `'hidden'` — `/nina`'s and every screen's (invariant 7): the provider is
 * mounted only on the chat screen, and nothing publishes `NINA_BAR_VISIBLE_VAR` until
 * `ChatChrome`'s own effect sees `'shown'`. The rail button reading this state costs no var and
 * no writer: the var's writer set is unchanged.
 *
 * ── WHY THE HOOK IS NULLABLE ─────────────────────────────────────────────────────────────────
 * `useNinaSidebar()`'s precedent, verbatim: null outside a provider, so a consumer mounted outside
 * its own provider degrades instead of crashing the screen. Unreachable today — `AppShell` mounts
 * this provider around both consumers — and the structural test in
 * `tests/nina.sidebarProvider.test.ts` is what keeps it so.
 */

interface NinaBarContextValue {
  bar: NinaBarState
  dispatch: (event: NinaChromeEvent) => void
}

const NinaBarContext = React.createContext<NinaBarContextValue | null>(null)

/** Null outside a provider, on the `useNinaSidebar` precedent. */
export function useNinaBar(): NinaBarContextValue | null {
  return React.useContext(NinaBarContext)
}

export function NinaBarProvider({ children }: { children: React.ReactNode }) {
  const [bar, setBar] = React.useState<NinaBarState>('hidden')

  /**
   * The state machine's only door. `nextBarState` decides; this only forwards the event. Stable
   * identity, so consumers may name it in their own effect dependencies without re-subscribing.
   */
  const dispatch = React.useCallback(
    (event: NinaChromeEvent) => setBar((current) => nextBarState(current, event)),
    [],
  )

  const value = React.useMemo<NinaBarContextValue>(() => ({ bar, dispatch }), [bar, dispatch])

  return <NinaBarContext.Provider value={value}>{children}</NinaBarContext.Provider>
}
