'use client'

import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'

import { TabBar, TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'
import { NINA_BAR_VISIBLE_VAR } from '@/lib/nina/chatview'
import {
  autoHideDelayMs,
  barToggleGlyph,
  controlBottomCss,
  isControlVisible,
  NINA_CHROME_CONTROL_CLASS,
} from '@/lib/nina/chrome'
import { useNinaBar } from './NinaBarProvider'
import { NinaSidebarTrigger } from './NinaSidebar'

/**
 * `/nina`'s chrome: no tab bar, and one floating control that pulls it back up (R1).
 *
 * ── WHY THE STATE IS IN `NinaBarProvider`, NOT HERE ANY MORE (R2) ────────────────────────────
 * This was the state's home when the chat page's toggle was its only writer. R2 gives the sidebar
 * rail's `up` the same job — "persis sama dengan tombol up di chat page" — and the panel is this
 * component's SIBLING: `AppShell` renders `<main>` (the panel rides in through the page) and this
 * chrome side by side, so no prop chain joins them and two local states would be two bars that
 * can disagree. The state moved to `components/nina/NinaBarProvider.tsx`, mounted by `AppShell`
 * around the same `shell` node `NinaSidebarProvider` wraps — that file's docstring carries the
 * full argument, and `tests/nina.sidebarProvider.test.ts` pins the placement.
 *
 * What stayed here is every EFFECT: the focus sync, the auto-hide timer and the
 * `NINA_BAR_VISIBLE_VAR` publisher read and write through the context now, and nothing about when
 * they fire changed. The var's writer set is unchanged — still this file, still one effect.
 *
 * `AppShell` has no `'use client'` and must not gain one — five server pages import it, and
 * `tests/share.bundle.test.ts` exists because that import graph leaked a session read once
 * already; rendering a client provider from there is a boundary, not a conversion. `TabBar` still
 * cannot hold the state either, for the reason that is physical rather than architectural: a
 * hidden bar is translated off screen, and a control inside it would be unreachable.
 *
 * ── THE PANEL'S FIELDS HIDE THE BAR TOO (R2) ─────────────────────────────────────────────────
 * `nextBarState`'s rule is about KEYBOARDS, not about the composer — `lib/nina/chrome.ts`'s own
 * docstring: a bar shown under a keyboard is shown and invisible. The composer was the only text
 * surface that could raise one; the panel's search and rename fields raise the same keyboard, so
 * they take the same event. A text field focused inside the panel's `[role="dialog"]` dispatches
 * `'composer-engaged'` — the machine's name for "a keyboard is up", now carrying two surfaces.
 * `focusout`'s one-task deferral is what makes the move from the panel's search field to one of
 * its rename fields not blink the bar, exactly as it does for the textarea-to-Send move.
 *
 * ── THE THREE THINGS THIS COMPONENT MEASURES, AND THE FOUR IT DECIDES NOTHING ABOUT ──────────
 * It measures `#nina-composer`'s height and whether focus sits in a keyboard-raising field — the
 * composer's, or any text field inside the panel's dialog — and nothing else. Every rule — what
 * either toggle does, when the timer runs, which glyph shows, where the lane sits — is a pure
 * function in `lib/nina/chrome.ts` with a unit test, because `vitest.config.ts` runs
 * `environment: 'node'` and a rule that lives in a component cannot be asserted in this repo at
 * all. `lib/nina/chatview.ts`'s header is the pattern: the component measures; that decides.
 *
 * ── WHY IT SUBSCRIBES TO FOCUS AND NOT TO `visualViewport` ───────────────────────────────────
 * `ChatScreen` already owns a `visualViewport` subscription for the composer's keyboard lift, and
 * duplicating it would put two listeners on the same events. It is also the wrong signal here:
 * `keyboardOverlapPx` is an iOS measurement by construction and returns 0 on Android, where the
 * layout viewport really does shrink. Focus inside the composer is true on both, and it is the
 * *cause* of the keyboard rather than a proxy for it.
 *
 * ── PRE-HYDRATION ────────────────────────────────────────────────────────────────────────────
 * The bar renders hidden in the server HTML and the control renders with it, so the resting screen
 * is correct before hydration. The control does nothing until hydration — which is true of
 * everything else on this screen already: the composer cannot send, the reply swipe does not
 * swipe, and a quote does not jump.
 */

/**
 * The composer's outer `fixed` wrapper, set in `components/nina/Composer.tsx` and already measured
 * by `components/nina/ChatScreen.tsx`'s quote-scroll handler.
 *
 * Read by id rather than by a ref, because the composer is not this component's child — it is
 * rendered inside `<main>`, and this is chrome rendered beside it. The id is that component's
 * public anchor and it has two readers now; the literal is spelled in three files and a shared
 * constant is a cleanup for whoever next edits `Composer`.
 */
const COMPOSER_ID = 'nina-composer'

/**
 * Whether `activeElement` is a text field sitting inside a dialog — the sidebar panel's fields,
 * which raise the same keyboard the composer's do and so take the same rule.
 *
 * The field half is `NinaSidebar`'s own focusin filter (`INPUT` / `TEXTAREA` / contenteditable),
 * spelled twice on purpose: the panel's copy filters its own assert listener, this one filters the
 * bar's engage rule, and a predicate over DOM types cannot live in `lib/nina/chrome.ts` — that
 * file's signatures carry no DOM types (`chatview.ts`'s header, verbatim).
 *
 * The dialog half is `[role="dialog"]`: the panel is the only dialog mounted on `/nina` that
 * contains text fields, and `closest` reads the focused element's membership without this
 * component holding a ref into another component's DOM.
 */
function isTextFocusInDialog(active: Element | null): boolean {
  if (active === null || !(active instanceof HTMLElement)) return false
  if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && !active.isContentEditable) {
    return false
  }
  return active.closest('[role="dialog"]') !== null
}

/**
 * What the bar occupies when it is showing: its **outer** height — the 39 px grid plus the 1 px
 * `border-t` the grid sits under, which is the bar's actual top edge. The same constant
 * `ChatScreen`'s `COMPOSER_CLEARANCE_PX` reads, because both are positioning against the same bar.
 *
 * MEASURED (R2): the border was never in this sum. The clearance cleared the grid alone, the bar's
 * top border sat a pixel above it, and the composer floated over the seam with the conversation
 * showing through — 1 px of it even after the Upload FAB's overhang was gone. The border is part of
 * the nav's border box, so the outer height is the honest clearance, and it is one constant rather
 * than a sum spelled at two call sites.
 */
const BAR_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX

export function ChatChrome({ ninaBadge }: { ninaBadge?: React.ReactNode } = {}) {
  /*
   * The bar state is the provider's (`components/nina/NinaBarProvider.tsx`). Null only outside a
   * `NinaBarProvider`, which `AppShell` never allows — both of these are the hook's null contract,
   * the `useNinaSidebar` precedent, not live code: this chrome would then render a bar nothing can
   * reveal, exactly as a `ChatChrome` with no sidebar draws no `>`.
   */
  const ninaBar = useNinaBar()
  const bar = ninaBar?.bar ?? 'hidden'
  const dispatch = ninaBar?.dispatch
  /** A keyboard is up — the composer's field, or a text field inside the open panel's dialog. */
  const [keyboardEngaged, setKeyboardEngaged] = useState(false)
  const [composerHeightPx, setComposerHeightPx] = useState(0)
  /** The one deferred read below, held so it cannot fire after unmount. */
  const focusTimer = useRef<number | null>(null)

  /*
   * The composer's height. A `ResizeObserver` and not a one-off measurement, because the composer
   * grows: a reply strip, a run chip, a photo chip, a tile row and a multi-line draft each add to
   * it, and a lane positioned off a constant would end up behind its `z-40` background. Same tool
   * and same reason as `components/admin/CropStudio.tsx:73`, which measures its own frame.
   *
   * Empty deps: the observer is on an element that outlives every state change here. A change to
   * the composer's `bottom` — the flag flipping, or the keyboard — does not resize it and does not
   * need to fire this, because `controlBottomCss` composes the clearance itself.
   */
  useEffect(() => {
    const composer = document.getElementById(COMPOSER_ID)
    if (composer === null) return
    const measure = () => setComposerHeightPx(composer.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  /*
   * Whether a keyboard is up — the composer's textarea, or a text field inside the open sidebar
   * panel — and, when it arrives, the bar going away with it.
   *
   * Both are set in one place rather than deriving the second from the first in another effect,
   * which would cost a render and put two writers on the same piece of state.
   *
   * `focusout` fires BEFORE focus lands, while `document.activeElement` is still `<body>`, so it is
   * read one task later. Without that deferral, moving focus *within* the composer — the textarea
   * to Send, which is what pressing send is — would read as a release and then as a re-engage, and
   * the toggle would blink out and back on every send. The same deferral is what makes the move
   * from the panel's search field to one of its rename fields not blink either.
   */
  useEffect(() => {
    const sync = () => {
      const active = document.activeElement
      const composer = document.getElementById(COMPOSER_ID)
      const composerEngaged = composer !== null && active !== null && composer.contains(active)
      const keyboardEngaged = composerEngaged || isTextFocusInDialog(active)
      setKeyboardEngaged(keyboardEngaged)
      if (keyboardEngaged) dispatch?.('composer-engaged')
    }
    const onFocusIn = () => sync()
    const onFocusOut = () => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
      focusTimer.current = window.setTimeout(sync, 0)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
    }
  }, [dispatch])

  /*
   * R1's five seconds. `autoHideDelayMs` returns `null` for every state that should run no timer,
   * so this effect is an early return rather than a condition, and the cleanup means a toggle
   * pressed at 4.9 s restarts the clock instead of racing it. `keyboardEngaged` pauses it while a
   * keyboard is up anywhere — including a panel field, which just hid the bar anyway.
   */
  useEffect(() => {
    const delay = autoHideDelayMs(bar, keyboardEngaged)
    if (delay === null) return
    const id = window.setTimeout(() => {
      dispatch?.('autohide')
    }, delay)
    return () => window.clearTimeout(id)
  }, [bar, keyboardEngaged, dispatch])

  /*
   * The one channel to the composer, which is not a descendant of this component: `AppShell`
   * renders `<main>` and the chrome as siblings, so `:root` is the nearest thing both inherit
   * from. `composerBottomCss` reads this variable and multiplies its clearance by it.
   *
   * Set only while the bar is SHOWN. The absent default is the hidden geometry, which is what makes
   * the server's HTML and the first client frame agree — see `NINA_BAR_VISIBLE_VAR`. The cleanup
   * runs on every hide and on unmount, so navigating off `/nina` leaves nothing behind.
   */
  useEffect(() => {
    if (bar !== 'shown') return
    const root = document.documentElement
    root.style.setProperty(NINA_BAR_VISIBLE_VAR, '1')
    /* A block body, not a concise one: `removeProperty` returns the old value as a `string`, and an
       effect cleanup must return `void` — a concise arrow would hand React a destructor typed
       `() => string`, which `tsc` rejects. */
    return () => {
      root.style.removeProperty(NINA_BAR_VISIBLE_VAR)
    }
  }, [bar])

  const glyph = barToggleGlyph(bar)

  return (
    <>
      <TabBar ninaBadge={ninaBadge} hidden={bar === 'hidden'} />

      {isControlVisible(keyboardEngaged) && (
        /*
         * The control lane: the full 470 px column, pinned entirely ABOVE the composer's top edge.
         *
         * `z-40` — the composer's own rung, because the two are one stack that moves together.
         * Equal `z-index` means DOM order decides, and `AppShell` renders this after `<main>`, so
         * the lane paints above the composer in the one frame where the composer has grown and the
         * observer has not caught up. Below `Sheet` (`z-50`) on purpose: phase 5's full-screen
         * sidebar must cover this, since a chevron on top of a sidebar points at chrome the sidebar
         * has replaced.
         *
         * `pointer-events-none` on the lane and `pointer-events-auto` on the button: the lane spans
         * the column, and without this it would swallow taps on the newest bubble — including
         * `MessageBubble`'s swipe-to-reply.
         *
         * ── A CENTRED PAIR, NOT A THREE-COLUMN GRID ─────────────────────────────────────────────
         * This was `grid grid-cols-3` with the `>` in column one and the toggle centred in column
         * two, so the two controls sat a third of the screen apart. The repo owner asked for them
         * "lebih rapat" — closer together — so they are now one `flex` group centred as a unit,
         * `gap-1.5` (6 px) apart. R1's "bottom middle" is still satisfied, and better than before:
         * the PAIR is centred, where the grid centred only the toggle.
         *
         * The grid also had a failure mode worth remembering. A component that renders `null`
         * produces no DOM node, so when `NinaSidebarTrigger` returned `null` — which it did in
         * production, see `components/ui/AppShell.tsx` — the toggle became the grid's FIRST child
         * and `justify-self-center` centred it in column one, a fifth of the way across the screen.
         * `flex` with `justify-center` has no such trap: one control or two, the group is centred.
         */
        <div
          className="pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-[470px] items-end justify-center gap-1.5 px-5"
          style={{
            bottom: controlBottomCss({
              barState: bar,
              barClearancePx: BAR_CLEARANCE_PX,
              composerHeightPx,
            }),
          }}
        >
          {/*
            R6's floating `>`: the sidebar's door, in the cell phase 2 left for it. Phase 5 owns
            the button; phase 2 owns where it sits — the lane's `bottom` is computed from the tab
            bar's clearance, the composer's measured height and `--safe-bottom`, and a third
            spelling of that sum in another file is how a control ends up over the composer on one
            device and under the keyboard on another.

            `pointer-events-auto` because the lane is `pointer-events-none`. No `justify-self-*`
            any more: the lane is a centred flex group, so the pair's position is the group's and
            neither control positions itself.

            It needs NO props: its state is `?sidebar=1` in the URL, so it shares nothing with the
            panel and `ChatScreen` never learns a sidebar exists. Outside a `NinaSidebarProvider` it
            renders null, so a `ChatChrome` on a screen with no sidebar simply has no `>` — which is
            correct by design and was ALSO this screen's bug for one release, because `AppShell`
            renders `ChatChrome` outside `{children}` and the provider used to live in the page. See
            `components/ui/AppShell.tsx`.
          */}
          <NinaSidebarTrigger className="pointer-events-auto" />

          <button
            type="button"
            onClick={() => dispatch?.('toggle')}
            aria-expanded={bar === 'shown'}
            aria-controls="main-tab-bar"
            aria-label={glyph === 'up' ? 'Show the main navigation' : 'Hide the main navigation'}
            className={`pointer-events-auto ${NINA_CHROME_CONTROL_CLASS}`}
          >
            {/*
              One control, one glyph, flipped by `barToggleGlyph`. The user named both `^` and `v`;
              two permanent buttons would mean one of them is always a no-op occupying 44 px of the
              conversation. `aria-expanded` plus `aria-controls` is what makes the single control
              honest to a screen reader: it announces the disclosure state, not the arrow.

              `size-11` is 44 px, the iOS tap-target floor this repo cites twice, with a `size-4`
              glyph inside it — which is what "small" means here and what every round control in
              `Composer` already does.
            */}
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden="true">
              <path
                d={glyph === 'up' ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
