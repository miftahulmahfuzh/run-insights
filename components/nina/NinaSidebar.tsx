'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

import { TAB_BAR_OUTER_HEIGHT_PX } from '@/components/ui/TabBar'
import { cn } from '@/lib/cn'
import {
  KEYBOARD_REASSERT_DELAYS_MS,
  NINA_BAR_VISIBLE_VAR,
  NINA_KEYBOARD_OVERLAP_VAR,
  panelBottomCss,
} from '@/lib/nina/chatview'
import { barToggleGlyph, NINA_CHROME_CONTROL_CLASS } from '@/lib/nina/chrome'
import { NINA_JOBS_HREF } from '@/lib/nina/jobview'
import type { NinaCropInput } from '@/lib/nina/crop'
import {
  isSidebarOpen,
  planSessionList,
  SIDEBAR_PARAM,
  withSidebarParam,
  type SidebarSession,
} from '@/lib/nina/sidebar'
import { NinaAvatar } from './NinaAvatar'
import { useNinaBar } from './NinaBarProvider'
import { NewChatButton } from './NewChatButton'
import { NinaSearchField } from './NinaSearchField'
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
 * above the composer, whose `bottom` is computed from the tab bar's clearance, the composer's own
 * height and `--safe-bottom` — numbers that are already spelled twice by necessity, once as a
 * TypeScript constant and once as a Tailwind arbitrary value. Phase 2's `ChatChrome` owns that
 * geometry; spelling it a third time here is how a control ends up floating over the composer on
 * one device and under the keyboard on another. So this renders a bare 44 px button and takes a
 * `className` for whoever places it — including the `pointer-events-auto` that phase 2's lane
 * requires of everything inside it.
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
      className={cn(NINA_CHROME_CONTROL_CLASS, className)}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden="true">
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

/*
 * ── THE RAIL (R5) ────────────────────────────────────────────────────────────────────────────
 * Four icon controls pinned to the panel's bottom edge: `>` (close, the chat page trigger's own
 * chevron), `up` (the chat page's bar toggle, R2 — shared state, see the button below), `+`
 * (`NewChatButton`, icon-only now) and the wand ("Proses foto"). They replace the two full-width
 * rows that cost 44 px + margins each on an XS Max — the owner's III.1 — and they sit at the
 * panel's bottom because the panel already ends at the keyboard's measured top edge (the `bottom`
 * var below), so the rail stays reachable with the keyboard up, which the scrolling rows never
 * were.
 */

/**
 * The rail's floor — the composer's resting floor, QUOTED, not called.
 *
 * `composerPadBottomCss` (lib/nina/chatview.ts) is `max(0px, var(--safe-bottom) / 2 - 3.25px)`
 * with two gates, and both are re-spelled here in CSS for the same reason: this panel has no
 * number to feed either function. It is `ChatScreen`'s sibling, not its descendant, and its only
 * keyboard channel is the `--nina-kb-overlap` CSS var, a length at paint time that no `lib/`
 * function can consume.
 *
 *   - the overlap gate: subtracting the var zeroes the floor whenever a keyboard is published,
 *     which is the same branch as the function's `if (overlapPx > 0) return '0px'`. The
 *     subtraction can never leave a residue — a published overlap is at least `KEYBOARD_MIN_PX`
 *     (120) and the floor is at most ~26 px at any real inset.
 *   - the bar gate: `* (1 - var(--nina-bar-visible))`, the function's own complement. This gate
 *     used to be dropped — the panel was `z-50` OVER a bar it covered, and zeroing the floor would
 *     have lifted the rail off the glass for no reason. R2 changes the geometry: the panel now
 *     LIFTS above the bar (`PANEL_BOTTOM_CSS` below), the bar pads itself by the whole inset in
 *     its own `padding-bottom`, and the rail rides the panel's lifted edge — so an ungated floor
 *     here would pad by an inset the bar is already padding, the double-count
 *     `controlBottomCss`'s docstring names. Zeroed, the rail's row keeps only its `py-2`, flush
 *     against the bar's top border by the same measure the composer is.
 *
 * The two numbers inside the `max()` — the halving and the `3.25px` — stay
 * `composerPadBottomCss`'s and `TabBar`'s (the captions' 21.75 px, `TAB_BAR_CONTENT_DROP_CSS`'s
 * history). This comment is the pin: change the floor there, change it here.
 */
const RAIL_PAD_BOTTOM_CSS = `calc(max(0px, var(--safe-bottom) / 2 - 3.25px - var(${NINA_KEYBOARD_OVERLAP_VAR}, 0px)) * (1 - var(${NINA_BAR_VISIBLE_VAR}, 0)))`

/**
 * The panel's `bottom` — `panelBottomCss`'s string, held at module level because every input is a
 * constant (`TAB_BAR_OUTER_HEIGHT_PX`, `TabBar`'s outer height, the number the composer's own
 * clearance reads): the keyboard's edge, plus — while the bar shows — the bar's clearance and the
 * safe-bottom the bar pads itself by, so the bar renders in a reachable strip below this panel.
 * See the style attribute below and the function's docstring; the point of the constant is the one
 * the old inline `bottom` made: the string never re-renders, the vars underneath it are what move.
 */
const PANEL_BOTTOM_CSS = panelBottomCss({ barClearancePx: TAB_BAR_OUTER_HEIGHT_PX })

/**
 * The rail buttons' shared skin: the chat page pair's own `NINA_CHROME_CONTROL_CLASS`, at the
 * pair's 32 px raised to the 44 px tap floor — see `NewChatButton`'s R5 section for why the
 * exception does not travel into a rail where the nearest rival target is 6 px away. One local
 * constant so the three buttons this file draws and `NewChatButton` (which spells its own merge)
 * cannot drift apart in weight or fill.
 */
const RAIL_CONTROL_CLASS = cn(NINA_CHROME_CONTROL_CLASS, 'size-11')

/**
 * "Proses foto"'s glyph — Lucide's `wand-sparkles`, copied verbatim from
 * `components/admin/AdminNav.tsx`, which fetched it (lucide-static 1.42.0, ISC, 2026-09-08,
 * `unpkg.com/lucide-static@latest/icons/wand-sparkles.svg`) and normalised Lucide's per-child
 * stroke attributes onto the root `<svg>`, where they inherit to every child. AdminNav's trio
 * comment assigns this wand to image generation specifically — `ImagesIcon` album /
 * `WandSparklesIcon` generation / `CameraIcon` chat photos — and `/nina/jobs` is that queue's
 * runner-facing face, so the same silhouette carries the same concept on both sides of the app.
 * Module-private, like its AdminNav sibling: three glyphs is still not worth a package.
 */
function WandSparklesIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
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
   * the toggle and its persistence key, and **filled this slot the second way**:
   * `NinaSearchField` is rendered as the slot's default below. It was first wired with this
   * panel's close callback through `closeRef`; it takes NOTHING now, and that is a rule rather
   * than a simplification — its hits are `<Link>`s, and firing `closeSidebar()` beside a Link's
   * push races the close path's `history.back()` against it (measured in production, 2026-09-08:
   * every hit opened the conversation the runner was already in). A hit href carries no `sidebar`
   * key, so the navigation closes the panel through the URL that opened it — the same rule the
   * `/nina/jobs` link below states in its own header. Passing a `searchSlot` still replaces the
   * default.
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
   *
   * **It did not.** Phase 6 fills it with `NewChatButton` as the slot's default, as a recorded
   * scope addition: it was the last phase to own this file, and R2's first clause was
   * unsatisfiable on the branch until it did.
   *
   * **R5 moved where the default RENDERS, not what it is.** The full-width row under the search
   * field became the rail's icon-only `+` at the panel's bottom edge (the rail block's own
   * comments carry the geometry); the action, the refusal path through `onNavigate` and the
   * replace-not-push rule are untouched. Passing a `newChatSlot` still replaces the default — and
   * now lands in the rail's third cell, between `up` and the wand, so an override inherits the
   * rail's row rather than a second full-width block.
   */
  newChatSlot?: React.ReactNode
}) {
  const sidebar = useNinaSidebar()
  const open = sidebar?.open ?? false
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  /*
   * The bar state, shared with `ChatChrome`'s toggle through `NinaBarProvider` (mounted in
   * `AppShell` around both subtrees). Null only outside that provider — unreachable from this
   * panel, and the hook's null contract is the `useNinaSidebar` precedent, not a live branch.
   */
  const ninaBar = useNinaBar()
  const glyph = barToggleGlyph(ninaBar?.bar ?? 'hidden')

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

    /*
     * ── R1'S TWO SCROLL CHANNELS: THE PANEL'S DECK, AND THE WINDOW BEHIND IT ─────────────────────
     *
     * The inline `bottom: var(--nina-kb-overlap)` below ends the panel's BOX at the keyboard's
     * top edge, and the owner's report survived it — because the search field sits at the top of
     * a tall content block inside the panel's OWN `overflow-y-auto` container, and iOS Safari's
     * focus reveal scrolls that CONTAINER even though the field was already visible: a scrollTop
     * the box says nothing about. The var shrinks the panel a commit later, the container keeps
     * its scrolled offset, and the field rides out through the container's top edge. The composer
     * never lifts, and it is the one fixed element on this screen inside no scroll container.
     *
     * The DECK is the shipped assert's channel, and it stays what it was. One delegated `focusin`
     * listener on the panel — same shape as the Escape listener below it, torn down by the same
     * cleanup, and incapable of growing a dependency that would break this effect's
     * keyed-on-`open`-ALONE rule — arms the schedule from `lib/nina/chatview.ts`
     * (`KEYBOARD_REASSERT_DELAYS_MS`; invariant 8 — a rule in a component cannot be tested)
     * against the field that just took focus, and each tick calls
     * `scrollIntoView({ block: 'nearest' })` on it, which walks EVERY scrollable ancestor (this
     * container and the document) and corrects whichever one Safari scrolled. Idempotent:
     * `nearest` on an already-visible element computes zero scroll.
     *
     * ── THE WINDOW IS THE CHANNEL THAT ASSERT CANNOT SEE, AND THE REPORT SURVIVED IT ─────────────
     * The conversation behind this opaque panel scrolls the WINDOW (`MessageList` calls
     * `window.scrollTo` — MessageList.tsx:163,223), so the document carries real scrollable
     * overflow while the panel is open, and the keyboard reveal's second act pans the layout
     * viewport itself: `window.scrollY` moves, and every `position: fixed` element on the glass
     * moves with it — this panel included, which is the lift the owner sees. `nearest` is
     * structurally blind to that channel: it is a no-op whenever the scroll it is asked to
     * correct leaves its target inside the scrollport, and a fixed element's layout geometry is
     * UNCHANGED by a window scroll, so for the root scroller it computes zero every time. The
     * window therefore gets its own corrector, which measures nothing and schedules nothing: a
     * `window` `scroll` listener that pins the root scroller to 0 for as long as a panel text
     * field holds focus. Event-driven, so there is no timing hole for the reveal to slip through
     * — every scroll the browser performs, including each frame of the keyboard-rise pan, fires
     * the event and is countered within it. Self-loop-safe by arithmetic: this listener's own
     * `scrollTo` fires a scroll event whose handler reads 0/0 and returns — a no-op, not a loop.
     *
     * The pin is UNDONE on focus-out and in this effect's teardown by putting the captured
     * position back, so the conversation behind the panel keeps its reading position. Both the
     * pin and the restore are invisible — `bg-paper` covers the glass — and neither can fight the
     * runner: with the body scroll locked and the panel covering it, the root scroller has no
     * user-facing scroll of its own to interrupt; the only thing that moves it while a field is
     * focused is the browser's own reveal, which the pin exists to counter.
     *
     * Guards, each earning its line:
     *   - text fields only (`INPUT` / `TEXTAREA` / contenteditable): the panel itself takes focus
     *     on open above, and neither the panel nor a button has text the keyboard could hide —
     *     and only a text field raises the keyboard whose reveal these correctors answer;
     *   - `document.activeElement === target` at FIRE time, not schedule time: a blur or a focus
     *     move within the window means the armed field is no longer the one on screen, and
     *     asserting or pinning for it would fight the runner — the guard turns every late tick
     *     into a no-op, and the same check gates the pin's own listener;
     *   - a new focus into the panel CANCELS the running schedule and arms a fresh one, so
     *     exactly one schedule is live at a time (search field → rename field moves restart it);
     *     the pin disarms and re-arms around the same move, re-capturing the reading position
     *     the previous field was already holding;
     *   - every correction reads first and writes only when the numbers are wrong: the pin
     *     returns when the scroll is already 0/0, the restore returns when it is already the
     *     captured one, and both writes are `behavior: 'instant'` (invariant 4).
     *
     * NO second `visualViewport` subscription (invariant 2) — neither corrector measures.
     */
    let reassertTimers: number[] = []
    let focusedField: HTMLElement | null = null
    let capturedScroll: { x: number; y: number } | null = null
    const panel = panelRef.current

    /*
     * The pin itself. Attached on arm and removed on disarm, so it never outlives a focused
     * field; the `activeElement` check is the second lock on that lifetime — an event arriving
     * in the gap between a blur and its `focusout` finds nothing left to defend.
     */
    const onWindowScroll = () => {
      if (document.activeElement !== focusedField) return
      if (window.scrollX === 0 && window.scrollY === 0) return
      /* `instant` — the layout has already moved; a chase reads as a glitch, and no new motion. */
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
    }

    /*
     * Disarm: stop pinning, and hand the reading position back. Idempotent — focus-out and the
     * arm path's own `disarmPin()` around one field→field move make a second call a no-op, so
     * the restore cannot run twice against a capture that is already gone.
     */
    const disarmPin = () => {
      if (focusedField === null) return
      focusedField = null
      window.removeEventListener('scroll', onWindowScroll)
      const captured = capturedScroll
      capturedScroll = null
      if (captured === null) return
      if (window.scrollX === captured.x && window.scrollY === captured.y) return
      window.scrollTo({ left: captured.x, top: captured.y, behavior: 'instant' })
    }

    const onPanelFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        !target.isContentEditable
      ) {
        return
      }

      /*
       * First focus, or a move to another field: capture where the conversation behind the panel
       * sits, BEFORE the keyboard has moved anything — the reveal's window pan rides the
       * keyboard's RISE, hundreds of ms after this event, so this read is the reading position.
       * The deck's own focus-synchronous scroll is deliberately not captured; the assert below
       * is what corrects that one.
       */
      if (focusedField !== target) {
        disarmPin()
        focusedField = target
        capturedScroll = { x: window.scrollX, y: window.scrollY }
        window.addEventListener('scroll', onWindowScroll, { passive: true })
      }

      for (const timer of reassertTimers) window.clearTimeout(timer)
      reassertTimers = KEYBOARD_REASSERT_DELAYS_MS.map((delay) =>
        window.setTimeout(() => {
          if (document.activeElement !== target) return
          /* `instant`, never `smooth`: the layout has already moved under the runner and a 300 ms
             chase reads as a glitch — `decideAutoScroll`'s 'viewport' rule, and no new motion. */
          target.scrollIntoView({ block: 'nearest', behavior: 'instant' })
          /* The window half of the same assert. The `scroll` listener usually has the pin held
             already; scroll events are dispatched a frame after the scroll they report, so a
             tick landing inside that gap pins one frame sooner. A no-op whenever the listener
             got there first — same arithmetic, same guard. */
          if (focusedField === target && (window.scrollX !== 0 || window.scrollY !== 0)) {
            window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
          }
        }, delay),
      )
    }
    panel?.addEventListener('focusin', onPanelFocusIn)

    /*
     * Focus leaving the armed field folds the pin: the keyboard is going down (or moving to the
     * next field, whose own `focusin` re-arms within the same task, after this restore has put
     * the shared reading position back), the reveal is over, and the position is owed back now.
     * The panel div's own focus-out — the `focus()` on open above — arrives here with
     * `focusedField` still null and is a no-op, which is the guard's point.
     */
    const onPanelFocusOut = (event: FocusEvent) => {
      if (event.target !== focusedField) return
      disarmPin()
    }
    panel?.addEventListener('focusout', onPanelFocusOut)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      panel?.removeEventListener('focusin', onPanelFocusIn)
      panel?.removeEventListener('focusout', onPanelFocusOut)
      for (const timer of reassertTimers) window.clearTimeout(timer)
      /*
       * The cleanup restores the reading position itself rather than trusting the blur: a panel
       * closed over a focused field tears THIS effect down, and whether the browser has already
       * delivered that field's `focusout` is not observable from here. `disarmPin` is the same
       * call focus-out uses — one restore, guarded against running twice.
       */
      disarmPin()
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  const list = planSessionList({ sessions, activeSessionId })

  /*
   * The list's own scroll container is the div below (`min-h-0 flex-1 overflow-y-auto
   * overscroll-contain`): the panel used to scroll itself, and the rail restructure pins the rail
   * outside the scroll. It carries no ref — nothing scrolls it programmatically any more (the
   * scroll-to-top handle is gone with R2's repurposing of `up`) — and the focus assertion in the
   * `open`-keyed effect above addresses the focused ELEMENT, whose `scrollIntoView` walks every
   * scrollable ancestor.
   */

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
        'fixed inset-0 z-50 flex flex-col bg-paper outline-none',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
      style={{
        /*
         * The keyboard's edge, and now the bar's too. `inset-0` pins this panel to the LAYOUT
         * viewport, and iOS does not shrink that when the software keyboard opens — so a
         * full-height panel runs on behind the keys and Safari's focus reveal answers by lifting
         * the whole fixed overlay off the top of the glass ("mengangkat UI keatas", the owner's
         * report): the search field this panel is typed into exits the screen while the keyboard
         * holds the bottom. Ending the panel at the keyboard's measured top edge instead puts the
         * field inside the visible region — the same fix `Composer` ships as
         * `composerBottomCss(overlap, …)`, reached here as a `:root` custom property because the
         * subscription that measures it lives in `ChatScreen`, this panel's sibling, not its
         * ancestor.
         *
         * R2 adds the second term: while the bar is showing (`--nina-bar-visible`), the panel
         * lifts by the bar's clearance plus the safe-bottom the bar pads itself by, so the bar
         * renders in its own reachable strip BELOW this panel's bottom edge instead of behind the
         * panel's opaque `z-50` fill. The arithmetic is `panelBottomCss`'s
         * (lib/nina/chatview.ts) — the composer's own var-gated shape — and `PANEL_BOTTOM_CSS`
         * above holds the string.
         *
         * An inline style rather than a Tailwind arbitrary value, because it must beat `inset-0`'s
         * `bottom: 0` in the cascade without depending on utility sort order. The string is
         * CONSTANT — it never re-renders, whatever the keyboard and the bar do; the vars
         * underneath it are what move. Absent (no keyboard, no bar, Android, pre-hydration, off
         * `/nina`) both substitute their zeros, which is exactly `inset-0`, so the resting panel
         * and the server's HTML never differ. And `transition-transform` is transform-only, so
         * the edge SNAPS with the keyboard and with the bar rather than lagging a transition
         * behind either — the composer's own behaviour when the bar auto-hides.
         *
         * This edge fixes the panel's BOX. The panel's SCROLL is the other half of the bug, and
         * both of its channels are corrected in the `open`-keyed effect above: the delegated
         * `focusin` listener re-asserts the focused field over the deck's reveal on
         * `KEYBOARD_REASSERT_DELAYS_MS`' schedule, and — the channel `nearest` cannot see — a
         * window `scroll` listener pins the root scroller to 0 while a panel text field holds
         * focus.
         *
         * Since the rail (R5) this edge is ALSO the rail's floor: the rail is this panel's last
         * flex child, so the keyboard's top edge — or the bar's, while it shows — is where the
         * rail's own bottom padding starts, which is why `RAIL_PAD_BOTTOM_CSS` reads both vars.
         * The panel itself no longer scrolls (`overflow-y-auto` moved to the scroll region below
         * with `overscroll-contain`); it is now the column that holds the two decks.
         */
        bottom: PANEL_BOTTOM_CSS,
      }}
    >
      {/*
        The scroll deck: everything that scrolls — header, search field, the list — inside one
        `flex-1 overflow-y-auto overscroll-contain` region, exactly the two scroll utilities the
        panel itself carried before the restructure. `min-h-0` because a flex child's automatic
        minimum would otherwise refuse to shrink it below its content: with `overflow-y-auto` the
        spec already zeroes that minimum, and the class is belt-and-braces against the engines that
        got it wrong. The rail below is NOT inside this region, so no row ever scrolls under the
        buttons and the rail needs no background — the frosted discs carry the glass treatment, the
        panel's `bg-paper` is what shows between them.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* The app's column, so the panel is not a full-bleed sheet of paper on a wide viewport.
            `--safe-top` is the notch inset; `PhotoViewer` is the precedent for a full-screen overlay
            honouring it. The bottom is `pb-6`, not the old `calc(1.5rem + var(--safe-bottom))`:
            the safe-bottom term was the panel's own glass clearance, and since the rail that
            clearance is the RAIL's to carry (RAIL_PAD_BOTTOM_CSS is that very inset's arithmetic) —
            keeping it here would clear the glass twice. The 1.5rem of breathing room under the last
            row stays. */}
        <div className="mx-auto w-full max-w-[470px] px-5 pt-[calc(1.25rem+var(--safe-top))] pb-6">
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
            {/* A real dismiss control with a name, `Sheet`'s reason for its own. 44 px. The rail's
                `>` is its mirror at the other end of the panel, not its replacement. */}
            <button
              type="button"
              onClick={() => closeRef.current()}
              aria-label="Tutup daftar chat"
              className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-pill text-[19px] font-semibold text-ink-3"
            >
              ✕
            </button>
          </header>

          {/*
            PHASE 6 filled this seam from INSIDE this file rather than from `app/nina/page.tsx`,
            and that is deliberate: the page is phase 8's this wave, and phase 5 exported
            `useNinaSidebar()` precisely so a field placed here can take its close callback without
            a prop chain through it. A caller may still override the slot; passing one replaces the
            default rather than adding to it. The create control that used to sit under this field
            moved to the rail in R5's restructure — see the `newChatSlot` seam below the component.
          */}
          <div className="mb-4">
            {/* No close callback, on the jobs link's own rule: this panel's close path pops a
                pushed entry, and firing that beside a Link's push races them. The field's hit hrefs
                drop `?sidebar=1`, which is what closes the panel. */}
            {searchSlot ?? <NinaSearchField />}
          </div>

          <SessionList
            list={list}
            activeSessionId={activeSessionId}
            onClose={() => closeRef.current()}
          />
        </div>
      </div>

      {/*
        ── THE RAIL (R5): FOUR ICONS, PINNED TO THE PANEL'S BOTTOM EDGE ─────────────────────────
        The owner's list, in his order: `>` closes, `up` toggles the main bar (R2 — the chat page's
        own reveal, shared state), `+` starts a chat, the wand opens "Proses foto". Two full-width
        rows bought this — they cost 44 px plus margins each on the small glass and the list behind
        them paid for it.

        ── THE GAP IS THE COMPOSER'S OWN (R5-c) ─────────────────────────────────────────────────
        "gunakan jarak yang sama dengan jarak chat query input field <-> bottom screen". The
        composer's gap is `py-2` (8) plus its `padding-bottom` floor — 8 + max(0px, 34/2 − 3.25) =
        21.75 px on an XS Max, the captions' own number. The rail mirrors the DECOMPOSITION, not
        just the total: this row carries the `py-2`, the container below carries the floor, so the
        two halves read exactly where the composer spells them (`#nina-composer`'s row and its
        `paddingBottom`). With the keyboard up the floor zeroes — the panel's own bottom is already
        the keyboard's top edge — and the row's 8 px is the whole gap, which is flush by the same
        measure the composer is (its keyboard branch sets `paddingBottom: 0px` and keeps its
        `py-2`).

        `justify-center` and `gap-1.5` are the chat page pair's own group classes: the pair the
        owner cited is one centred flex unit 6 px apart, and the rail is that unit grown to four.
      */}
      <div
        className="shrink-0 border-t border-rule/50"
        style={{ paddingBottom: RAIL_PAD_BOTTOM_CSS }}
      >
        <div className="mx-auto flex w-full max-w-[470px] items-center justify-center gap-1.5 px-5 py-2">
          {/*
            `>` — the trigger's own chevron (`m9 6 6 6-6 6`, strokeWidth 2.4), doing the opposite
            job from the same shape: the chat page's `>` opens this panel, this one closes it. A
            button on closeRef, not a Link — it navigates nowhere. Same accessible name as the
            header ✕ (two honest names for one action), and the glyph is 20 px (`size-5`) — TabBar's
            glyph scale — where the chat pair's 14 px sits in a 32 px disc.
          */}
          <button
            type="button"
            onClick={() => closeRef.current()}
            aria-label="Tutup daftar chat"
            className={RAIL_CONTROL_CLASS}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/*
            `up` — the chat page toggle's own control, doing the chat page's job from the panel: it
            toggles the MAIN app TabBar through the same shared state ChatChrome's toggle writes
            (`NinaBarProvider`, mounted in `AppShell` around both subtrees). The semantics are the
            chat page's verbatim: `nextBarState(current, 'toggle')` inside the provider's
            `dispatch`, the 5 s auto-hide and the keyboard rule are `ChatChrome`'s effects and fire
            on this state whatever wrote it; the glyph is `barToggleGlyph`'s two chevrons
            (`M6 14l6-6 6 6` / `M6 10l6 6 6-6`, strokeWidth 2.4) at this rail's `size-5`;
            `aria-expanded` + `aria-controls="main-tab-bar"` and the chat page's English labels
            make the single control honest to a screen reader.

            It REPLACED the scroll-to-top tap handle: the list is the panel's whole height and its
            top is its first row, so the handle bought nothing the list's own gesture didn't.
            `listScrollRef` and `onScrollToTop` are gone with it — nothing scrolls the deck
            programmatically now.

            `ninaBar` is null only outside a `NinaBarProvider`, which is unreachable from this
            panel: `AppShell` mounts the provider around the same `shell` node that carries both
            consumers (the sidebar provider's own measured precedent, and
            `tests/nina.sidebarProvider.test.ts`'s structural guard). The optional chain is the
            hook's null contract, not a live branch.
          */}
          <button
            type="button"
            onClick={() => ninaBar?.dispatch('toggle')}
            aria-expanded={ninaBar?.bar === 'shown'}
            aria-controls="main-tab-bar"
            aria-label={glyph === 'up' ? 'Show the main navigation' : 'Hide the main navigation'}
            className={RAIL_CONTROL_CLASS}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d={glyph === 'up' ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/*
            `+` — the create control, still the newChatSlot seam's default (the seam's docstring
            records the move); still a `<button>` that closes FIRST and then `router.replace`s on
            refusal — no Link push to race, the measured rule
            `tests/nina.sidebarProvider.test.ts` carries.
          */}
          {newChatSlot ?? <NewChatButton onNavigate={() => closeRef.current()} />}

          {/*
            ── THE WAND — A PLAIN `<Link>`, AND IT DELIBERATELY DOES NOT CALL `closeRef` ─────────
            This panel is an OVERLAY held open by `?sidebar=1`, and its close path is not
            symmetric: `closeSidebar` calls `window.history.back()` when this session pushed the
            entry, and `replaceState` when it did not. Firing it in the same tick as a `<Link>`'s
            push would put a back and a forward on one entry and race them — measured in
            production, 2026-09-08, on this panel's own search hits.

            It does not need to. `/nina/jobs` is a DIFFERENT ROUTE, so the pushed entry carries no
            `sidebar` key and the panel closes through the URL that opened it — exactly what the
            avatar link above relies on in its own words, and what the row links rely on from the
            other side. The one cost is the one those links already pay: after a back gesture the
            provider remounts with `pushedRef` false, so a later ✕ closes by `replaceState`. That
            cost was true of the full-width "Proses foto" row this wand replaces; nothing about it
            changed with the shape.
          */}
          <Link href={NINA_JOBS_HREF} aria-label="Proses foto" className={RAIL_CONTROL_CLASS}>
            <WandSparklesIcon className="size-5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
