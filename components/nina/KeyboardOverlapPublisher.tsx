'use client'

import * as React from 'react'

import { keyboardOverlapPx, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'

/**
 * The ONE `visualViewport` subscription in the app, and the keyboard's ONE broadcast.
 *
 * ── WHY A COMPONENT AND NOT A HOOK ─────────────────────────────────────────────────────────────
 * The consumers are two routes, not two components of one tree: `ChatScreen` on `/nina` and
 * `NinaAboutScreen` on `/nina/about`. A hook would have to be called by both anyway; a component
 * that renders `null` can be dropped into a fragment beside the thing it measures for, with no
 * ref-forwarding and no return-value plumbing, and it is grep-visible — `rg KeyboardOverlapPublisher`
 * answers "who measures the keyboard" for the next invariant-4 argument, where a call inside a
 * hook's body does not.
 *
 * ── THE INVARIANT THIS COMPONENT IS ────────────────────────────────────────────────────────────
 * No second concurrent `visualViewport` subscription on one screen (`ChatChrome`'s docstring
 * records the rule). The routes that render this are `/nina` and `/nina/about` — different routes,
 * never mounted together — and within a route this is mounted once. `NINA_KEYBOARD_OVERLAP_VAR`'s
 * docstring in `lib/nina/chatview.ts` carries the broadcast's own reasoning: a `:root` custom
 * property because the panel that reads it is a SIBLING, not a descendant, and `NINA_BAR_VISIBLE_VAR`
 * is the precedent for exactly that gap.
 *
 * ── THE SEMANTICS, MOVED UNCHANGED FROM `ChatScreen` ───────────────────────────────────────────
 * `keyboardOverlapPx` filters the URL bar and pinch-zoom (`KEYBOARD_MIN_PX = 120`, and `scale > 1`
 * is "no keyboard"). The subscription is EMPTY-DEPS, so a keystroke never re-subscribes — the same
 * rule the sidebar panel's `open`-keyed effect enforces for the same reason. The var is REMOVED,
 * not zeroed, at zero and on unmount: the resting geometry (`inset-0` / `bottom-0`) is what an
 * unread var falls back to, and nothing survives navigating off the route. On Android
 * `keyboardOverlapPx` returns 0 always — the layout viewport really does shrink there — so the var
 * is never set and no consumer ever moves.
 *
 * ── `onOverlap` ────────────────────────────────────────────────────────────────────────────────
 * A consumer that needs the NUMBER as a number, and not the var — `ChatScreen`'s composer
 * geometry, `NinaAboutScreen`'s padding gate — passes a callback and mirrors the value into its
 * own state. Called synchronously inside the same `sync` that sets the internal state, so the
 * mirror is never a frame behind the var; `setState` with an unchanged number bails out, so a
 * `scroll` event that does not move the measurement costs the consumer nothing. Read through a
 * latest-ref: the subscription is empty-deps and must never re-subscribe because a render minted a
 * new inline arrow.
 */
export function KeyboardOverlapPublisher({
  onOverlap,
}: {
  onOverlap?: (overlapPx: number) => void
}) {
  const [overlap, setOverlap] = React.useState(0)

  /** The latest `onOverlap`, so the empty-deps subscription below cannot capture a stale one. */
  const onOverlapRef = React.useRef(onOverlap)
  React.useEffect(() => {
    onOverlapRef.current = onOverlap
  })

  /*
   * The measurement. Empty deps: `visualViewport` does not change identity, and a keystroke in
   * any consumer must never re-subscribe — `NinaSidebar`'s keyed-on-`open`-ALONE rule, for the
   * same keyboard-drop reason.
   */
  React.useEffect(() => {
    const vv = window.visualViewport
    if (vv == null) return
    const sync = () => {
      const next = keyboardOverlapPx({
        innerHeight: window.innerHeight,
        visualHeight: vv.height,
        visualOffsetTop: vv.offsetTop,
        scale: vv.scale,
      })
      setOverlap(next)
      onOverlapRef.current?.(next)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  /*
   * The broadcast. Removed — not zeroed — whenever the overlap is zero, and on unmount, so the
   * resting geometry is what an unread var falls back to and nothing leaks onto another route.
   */
  React.useEffect(() => {
    const root = document.documentElement
    if (overlap > 0) {
      root.style.setProperty(NINA_KEYBOARD_OVERLAP_VAR, `${overlap}px`)
    } else {
      root.style.removeProperty(NINA_KEYBOARD_OVERLAP_VAR)
    }
    return () => {
      root.style.removeProperty(NINA_KEYBOARD_OVERLAP_VAR)
    }
  }, [overlap])

  /** Measures and broadcasts; paints nothing. */
  return null
}
