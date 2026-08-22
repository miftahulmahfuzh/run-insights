'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

import {
  decodePanelSelection,
  encodePanelSelection,
  PANEL_PARAM,
  type PanelSelection,
} from '@/lib/panel/param'

/**
 * The open detail panel, held in the URL instead of in `useState` — F24, card #23.
 *
 * ── WHY `window.history` AND NOT `router.push` ──────────────────────────────────────────────
 * Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, under
 * "Native History API" —
 *
 *   > Next.js allows you to use the native `window.history.pushState` and
 *   > `window.history.replaceState` methods to update the browser's history stack without
 *   > reloading the page. `pushState` and `replaceState` calls integrate into the Next.js Router,
 *   > allowing you to sync with `usePathname` and `useSearchParams`.
 *
 * So the entry is pushed, this hook re-renders with the new value, and **`app/me/page.tsx` never
 * re-runs**. That matters here specifically: the page is one `Promise.all` of six database reads,
 * and `router.push` — or taking the `searchParams` prop on the page — would repeat all six every
 * time a runner tapped a badge, for a state change that never leaves the client.
 *
 * No `Suspense` boundary is needed for the same reason. The prerender caveat on `useSearchParams`
 * applies to a statically rendered route; `/me` opens with `requireUserId()`, which reads the
 * session cookie, so it is dynamically rendered and the hook resolves during the server render.
 * `npm run build` is in CI and is what actually proves that, rather than this paragraph.
 *
 * ── CLOSING: `back()` WHEN WE PUSHED, `replaceState` WHEN WE DID NOT ────────────────────────
 * Opening pushes an entry, so closing has to *undo* one — otherwise Close, Escape and a backdrop
 * tap each leave a dead entry behind and the number of back-swipes needed to get off `/me` becomes
 * a function of how many badges the runner looked at.
 *
 * But only this mount's own entry is ours to pop. Two states arrive with the parameter already
 * set and no entry of ours underneath it: a deep link or a refresh of `/me?panel=…`, and the
 * return from `/r/<id>` that this card exists to make work. Calling `back()` in the first would
 * navigate off the app; in the second it would walk *forward* into the run the runner just came
 * back from. Both get `replaceState` instead, which drops the parameter in place.
 *
 * `pushedRef` resets whenever the selection goes null, which is exactly what the back gesture
 * produces: it pops our entry, the parameter disappears, the dialog closes through the same effect
 * that opens it, and the next open pushes a fresh one.
 *
 * Known, and cheaper than the alternative: after `/me?panel=x → /r/<id> → back`, the panel is open
 * but we hold no entry, so Close replaces rather than pops and the next back-swipe goes to whatever
 * preceded the panel instead of to the run. One wasted back press, against a `back()` that would
 * have taken the runner somewhere they explicitly left.
 */
export interface PanelParam {
  /** What the URL currently says is open, or null. */
  selection: PanelSelection | null
  /** Open a panel: one new history entry. */
  open: (selection: PanelSelection) => void
  /** Close whatever is open, undoing our entry if we are the ones who pushed it. */
  close: () => void
}

export function usePanelParam(): PanelParam {
  const searchParams = useSearchParams()
  const raw = searchParams.get(PANEL_PARAM)
  const selection = React.useMemo(() => decodePanelSelection(raw), [raw])

  const pushedRef = React.useRef(false)
  React.useEffect(() => {
    if (selection === null) pushedRef.current = false
  }, [selection])

  /* A `URLSearchParams` copy, not a hand-built string: `/me` carries no other parameters today,
     and a future one must survive a panel opening on top of it. */
  const withPanel = React.useCallback(
    (value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null) params.delete(PANEL_PARAM)
      else params.set(PANEL_PARAM, value)
      const query = params.toString()
      return query ? `?${query}` : window.location.pathname
    },
    [searchParams],
  )

  const open = React.useCallback(
    (next: PanelSelection) => {
      window.history.pushState(null, '', withPanel(encodePanelSelection(next)))
      pushedRef.current = true
    },
    [withPanel],
  )

  const close = React.useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
      return
    }
    window.history.replaceState(null, '', withPanel(null))
  }, [withPanel])

  return { selection, open, close }
}
