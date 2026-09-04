'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

import { cn } from '@/lib/cn'
import type { NinaCropInput } from '@/lib/nina/crop'
import {
  isSidebarOpen,
  planSessionList,
  SIDEBAR_PARAM,
  withSidebarParam,
  type SidebarSession,
} from '@/lib/nina/sidebar'
import { NinaAvatar } from './NinaAvatar'
import { SessionList } from './SessionList'

/**
 * The hidden full-screen sidebar — F35 R6, and the new home of Nina's circle (R7).
 *
 * ── AN OVERLAY, NOT A ROUTE, AND THE TWO THINGS THAT COST ─────────────────────────────────────
 * R6 says the panel "slide[s] right and take[s] over full screen", which is an overlay. A route
 * (`/nina/sessions`) would have handed us the back gesture and focus handling for free and cost
 * three things instead: a route transition this app does not have (invariant 8 forbids a second
 * keyframe), the destruction of the mounted chat behind it — `ChatScreen`'s scroll mark, its
 * in-flight reveal and its optimistic rows all survive being *covered* and none survive being
 * unmounted — and a `TabBar` that would light the Nina tab on a screen phase 2 just removed the
 * bar from. So the two free things are bought back here, deliberately:
 *
 *   - **the back gesture**, because the open state is `?sidebar=1` in the URL, pushed with
 *     `window.history.pushState`. `components/ui/usePanelParam.ts` verified against this repo's
 *     own Next that pushState "integrate[s] into the Next.js Router, allowing you to sync with
 *     `usePathname` and `useSearchParams`", so a back gesture pops the entry and the panel closes
 *     through the same code that opened it — with NO server re-render of a page that is four
 *     database reads;
 *   - **focus**, via `Sheet.tsx`'s three behaviours (body scroll lock, focus in on open and back
 *     out on close, Escape) plus `inert` for the one thing `Sheet` gets from unmounting.
 *
 * No `<Suspense>` boundary is needed around `useSearchParams` for `usePanelParam`'s reason: the
 * caveat applies to a statically rendered route, and `/nina` opens with `requireUserId()`, so it
 * is dynamically rendered and the hook resolves during the server render. `npm run build` is what
 * actually proves that.
 *
 * ── WHY THERE IS A PROVIDER FOR ONE BOOLEAN AND ONE REF ───────────────────────────────────────
 * The `>` trigger lives inside phase 2's `ChatChrome`, which is rendered by `ChatScreen` — a file
 * this phase may not touch — so there is no prop chain from the page down to it. Holding the open
 * flag in the URL dissolves that: the trigger and the panel each read it and share no state.
 *
 * One thing genuinely is shared, and it is not the flag. `usePanelParam` explains why closing must
 * `history.back()` when we pushed and `replaceState` when we did not: otherwise every close leaves
 * a dead entry and "the number of back-swipes needed to get off [the screen] becomes a function of
 * how many [times the runner opened it]". Here the TRIGGER pushes and the PANEL closes, in two
 * different subtrees, so two independent refs would disagree and the panel would replace over an
 * entry the trigger pushed. Hence one ref, in one provider, mounted in `app/nina/page.tsx` around
 * both. Marking the entry in `window.history.state` instead was rejected: the App Router maintains
 * its own state on every entry and merges into it, which is undocumented ground to stand on for
 * the saving of one context.
 *
 * `useNinaSidebar()` returns null outside a provider and `NinaSidebarTrigger` then renders nothing,
 * so `ChatChrome` on a future screen with no sidebar draws no `>` and needs no flag for it.
 *
 * ── THE SLIDE (INVARIANT 8) ───────────────────────────────────────────────────────────────────
 * `transition-transform` on `-translate-x-full → translate-x-0`. No keyframe, so
 * `tests/motion.reducedMotion.test.ts` has nothing to guard — the outcome `MessageBubble` reached
 * for its landing flash. Tailwind v4 compiles `translate` to its own longhand and defines
 * `transition-transform` as `transition-property: transform, translate, scale, rotate` (verified in
 * `node_modules/tailwindcss/dist/lib.js`, 4.3.3), so the translate really is transitioned and the
 * `active:scale-[0.985]` on the buttons inside composes with it rather than overwriting it — the
 * property `TabBar`'s docstring records.
 *
 * `motion-reduce:transition-none` is the FIRST use of that variant in this codebase and needs its
 * argument, because `app/globals.css` deliberately took the other route for the pulse: it
 * redefines the keyframe, so ten call sites cannot each forget a variant. That trick only works
 * for keyframes, which cascade by name; a transition has no name to redefine, and the global
 * equivalent — `* { transition: none }` inside the query — would kill the colour transitions in
 * `Chip`, `KindSelector` and `Button` that the same file calls "deliberately untouched". A
 * full-screen panel crossing the phone is the sustained movement that file distinguishes from
 * `Button`'s 1.5% press, so the variant goes at the one site that needs it.
 *
 * ── WHY THE PANEL IS ALWAYS MOUNTED ───────────────────────────────────────────────────────────
 * Mounting on open needs a double `requestAnimationFrame` to have something to transition FROM,
 * and unmounting after the exit needs `transitionend` — which never fires under
 * `transition-none`, so the reduced-motion path would strand the panel open. Staying mounted
 * removes both, at the cost of DOM for rows the server read anyway. An off-screen
 * `position: fixed` box does not contribute to the viewport's scrollable overflow, so there is no
 * horizontal scrollbar and no `overflow-x` clamp is needed on a layout file this phase may not
 * touch. `inert={!open}` is what the closed panel owes the keyboard and the screen reader:
 * `Sheet` gets that from returning null, this cannot, and `inert` is a boolean prop in React 19.
 */

export interface NinaSidebarAvatar {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
}

interface NinaSidebarContextValue {
  open: boolean
  openSidebar: () => void
  closeSidebar: () => void
}

const NinaSidebarContext = React.createContext<NinaSidebarContextValue | null>(null)

/** Null outside a provider, on purpose: a `ChatChrome` with no sidebar draws no `>`. */
export function useNinaSidebar(): NinaSidebarContextValue | null {
  return React.useContext(NinaSidebarContext)
}

export function NinaSidebarProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const open = isSidebarOpen(searchParams.get(SIDEBAR_PARAM))

  /**
   * Only this session's own history entry is ours to pop. It resets whenever the panel closes —
   * which is exactly what the back gesture produces: the entry pops, the parameter disappears, and
   * the next open pushes a fresh one. `usePanelParam`'s `pushedRef`, one level up so the trigger
   * and the panel cannot disagree about it.
   */
  const pushedRef = React.useRef(false)
  React.useEffect(() => {
    if (!open) pushedRef.current = false
  }, [open])

  /**
   * `window.location.search` and NOT `searchParams.toString()`.
   *
   * `ChatScreen` strips `?attach=` and `?photo=` in a mount-time `replaceState`, behind React's
   * back. A snapshot from the hook can therefore be one write stale, and writing it would
   * resurrect a parameter that was deliberately consumed — re-arming an album photo for a second
   * send. `window.location` is the only reading of this URL that cannot be stale, and it is the
   * same source `ChatScreen`'s own effect reads.
   */
  const openSidebar = React.useCallback(() => {
    const next = withSidebarParam(window.location.search, true)
    window.history.pushState(null, '', next === '' ? window.location.pathname : next)
    pushedRef.current = true
  }, [])

  const closeSidebar = React.useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
      return
    }
    const next = withSidebarParam(window.location.search, false)
    window.history.replaceState(null, '', next === '' ? window.location.pathname : next)
  }, [])

  const value = React.useMemo<NinaSidebarContextValue>(
    () => ({ open, openSidebar, closeSidebar }),
    [open, openSidebar, closeSidebar],
  )

  return <NinaSidebarContext.Provider value={value}>{children}</NinaSidebarContext.Provider>
}

/**
 * R6's floating `>`, at the bottom-left corner.
 *
 * **It carries no positioning of its own, and that is deliberate.** The floating controls sit just
 * above the composer, whose `bottom` is computed from `TAB_BAR_HEIGHT_PX`,
 * `TAB_BAR_FAB_OVERHANG_PX`, the composer's own height and `--safe-bottom` — the three numbers the
 * analysis calls load-bearing and which are already spelled twice by necessity. Phase 2's
 * `ChatChrome` owns that geometry; spelling it a third time here is how a control ends up floating
 * over the composer on one device and under the keyboard on another. So this renders a bare 44 px
 * button and takes a `className` for whoever places it — including the `pointer-events-auto` that
 * phase 2's lane requires of everything inside it.
 *
 * `size-11` is 44 px, the iOS tap-target floor, which is the same reason `NinaAvatar`'s `md` is.
 */
export function NinaSidebarTrigger({ className }: { className?: string }) {
  const sidebar = useNinaSidebar()
  if (sidebar === null) return null

  return (
    <button
      type="button"
      aria-label="Buka daftar chat"
      aria-expanded={sidebar.open}
      onClick={sidebar.openSidebar}
      className={cn(
        'grid size-11 place-items-center rounded-pill bg-card/95 text-ink-2 shadow-card',
        'ring-1 ring-rule backdrop-blur-sm transition-[opacity,transform] active:scale-[0.97]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
        <path
          d="m9 6 6 6-6 6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function NinaSidebar({
  avatar,
  sessions,
  activeSessionId,
  searchSlot = null,
  newChatSlot = null,
}: {
  /** `ninaAvatarView`'s three render fields. NOT its `description` — nothing here reads that. */
  avatar: NinaSidebarAvatar
  /** Already ordered by `listNinaSessions` (R4 then R5). Never re-sorted below this line. */
  sessions: readonly SidebarSession[]
  activeSessionId: string | null
  /**
   * **PHASE 6 SEAM — the search field and its persisted semantic-search toggle.**
   *
   * Rendered directly under Nina's circle and above the list, which is where R6 puts it: "at the
   * top of the sidebar we can search all chat as well. add a toggle at the right side of the
   * search field". Phase 5 renders nothing here and sketches no input, because a field with no
   * action behind it is a control that lies. Phase 6 owns `lib/nina/search.ts`, the search action,
   * the toggle and its persistence key, and fills this slot — either by passing it from a caller or
   * by rendering its own field at the slot below and taking the close callback its `onNavigate`
   * needs from `useNinaSidebar()`, which is exported for precisely that consumer.
   */
  searchSlot?: React.ReactNode
  /**
   * **PHASE 3 / R2 SEAM — the create-a-chat control.**
   *
   * R2 is not in phase 5's `satisfies` list, so this phase designs no create control. Phase 3
   * shipped the action (`createNinaChatSession` in `lib/nina/sessionActions.ts`) and no control for
   * it, and it left `app/nina/page.tsx`'s header untouched, so there was none to relocate here
   * either. Until something fills this slot the panel lists chats and cannot start one — correct
   * for phase 5 in isolation, and it must not survive the set.
   */
  newChatSlot?: React.ReactNode
}) {
  const sidebar = useNinaSidebar()
  const open = sidebar?.open ?? false
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  /**
   * **The `Sheet.tsx` trap, and this panel has the field that triggered it.**
   *
   * `Sheet` records the cost precisely: `onClose` was a dependency of the effect that also calls
   * `panelRef.current?.focus()`, every call site passes an inline arrow, so one keystroke inside
   * the sheet re-rendered the parent, minted a new `onClose`, tore the effect down and re-ran it —
   * focus left the input and iOS dropped the keyboard. "One digit per keyboard, on the screen whose
   * whole purpose is careful correction."
   *
   * This panel contains the rename field, which is the same configuration. So the effect below
   * keys on `open` ALONE and reads the latest close through this ref. **Do not add a dependency to
   * that array.** A keystroke changes `SessionRow`'s local state, not `open`, so the effect does
   * not re-run and the keyboard stays up.
   */
  const closeRef = React.useRef<() => void>(() => {})
  React.useEffect(() => {
    closeRef.current = sidebar?.closeSidebar ?? (() => {})
  }, [sidebar])

  React.useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    /*
     * The panel itself, not the search field — `Sheet`'s reason, and it matters more here: this
     * panel is opened from a chat where the composer may already have the keyboard up, and
     * focusing the panel is what puts it away. Raising a second keyboard for a field the runner
     * has not asked for would cover the list he opened the panel to read.
     */
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  const list = planSessionList({ sessions, activeSessionId })

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={open || undefined}
      aria-hidden={!open || undefined}
      aria-labelledby={titleId}
      inert={!open}
      tabIndex={-1}
      className={cn(
        'fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-paper outline-none',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* The app's column, so the panel is not a full-bleed sheet of paper on a wide viewport.
          `--safe-top` is the notch inset; `PhotoViewer` is the precedent for a full-screen overlay
          honouring it, and `--safe-bottom` closes the other end because there is no tab bar under
          this panel to pad it. */}
      <div className="mx-auto w-full max-w-[470px] px-5 pt-[calc(1.25rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
        <header className="mb-6 flex items-start gap-3">
          {/*
            R7: the circle moved here, and phase 13's promise moves with it. Still a `<Link>` to
            `/nina/about` and not a `<button>` — it is a navigation, so it keeps the platform's
            long-press, middle-click and back behaviour and Next prefetches the route. Still
            `size-11`, 44 px, the tap-target floor phase 4 chose "for when phase 13 makes it a
            link", so no geometry changed on the way across.

            Navigating to `/nina/about` drops `?sidebar=1`, so the panel closes on its own, and the
            back gesture returns to it open. Nothing extra is wired for that.
          */}
          <Link href="/nina/about" aria-label="Buka detail Nina" className="rounded-pill">
            <NinaAvatar size="md" src={avatar.src} natural={avatar.natural} crop={avatar.crop} />
          </Link>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink"
            >
              Nina
            </h2>
            <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
              Reads every run. Says what she thinks.
            </p>
          </div>
          {/* A real dismiss control with a name, `Sheet`'s reason for its own. 44 px. */}
          <button
            type="button"
            onClick={() => closeRef.current()}
            aria-label="Tutup daftar chat"
            className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-pill text-[19px] font-semibold text-ink-3"
          >
            ✕
          </button>
        </header>

        {searchSlot !== null && <div className="mb-4">{searchSlot}</div>}
        {newChatSlot !== null && <div className="mb-4">{newChatSlot}</div>}

        <SessionList
          list={list}
          activeSessionId={activeSessionId}
          onClose={() => closeRef.current()}
        />
      </div>
    </div>
  )
}
