/**
 * `/nina`'s chrome, as pure rules (R1).
 *
 * The tab bar is hidden on the conversation screen and one floating control pulls it back up,
 * pushes it back down, and lets it retract by itself after five seconds. Every part of that which
 * is a decision rather than markup lives here.
 *
 * Same argument as `lib/nina/chatview.ts`, `lib/nina/reveal.ts` and `lib/photos/gallery.ts` before
 * it: `vitest.config.ts` runs `environment: 'node'` with an `include` matching `*.test.ts`, so
 * there is no jsdom, no `visualViewport`, no timer to advance inside a rendered component and no
 * element to measure. A rule that lives in a component cannot be asserted in this repo at all.
 *
 * No DOM types appear in any signature. The component measures; this decides — `chatview.ts`'s
 * header, verbatim, and the same division of labour.
 *
 * ── WHY ENGAGING THE COMPOSER HIDES THE BAR RATHER THAN PAUSING THE TIMER ─────────────────────
 * The obvious rule is "do not auto-hide while he is typing", because a bar that retracts
 * mid-sentence is worse than one that never retracts. On iOS that rule is a trap. Safari does not
 * resize the layout viewport when the software keyboard opens (`keyboardOverlapPx`'s docstring is
 * the long version), so the composer is lifted onto the keyboard's top edge and the tab bar — which
 * is `fixed bottom-0` — sits *behind* the keyboard. A bar that is "shown" there is shown and
 * invisible, and the paused timer fires the instant he blurs, hiding a bar he never saw.
 *
 * Hiding on engage gives the same guarantee by a shorter route: the bar cannot retract mid-sentence
 * because it is never showing mid-sentence.
 *
 * ── WHY FOCUS, AND NOT THE KEYBOARD, IS THE SIGNAL ───────────────────────────────────────────
 * `keyboardOverlapPx` is an iOS measurement by construction: it reads
 * `innerHeight - visualHeight - visualOffsetTop`, and Android *does* resize the layout viewport, so
 * that difference is ~0 there and the function correctly returns 0. Focus inside the composer is
 * true on both platforms, and it is the *cause* of the keyboard rather than a proxy for it. So the
 * caller subscribes to focus, not to `visualViewport`, and does not duplicate the subscription
 * `ChatScreen` already owns.
 *
 * ── WHY RELEASING NEVER RESTORES ANYTHING ────────────────────────────────────────────────────
 * `'composer-released'` returns the state unchanged. A bar that pops back up when he taps away from
 * the textarea is the app overruling a decision he made with the toggle.
 */

/** Whether the tab bar is on screen. `'hidden'` is `/nina`'s resting state. */
export type NinaBarState = 'hidden' | 'shown'

/**
 * Everything that can move the bar.
 *
 * A string union rather than a discriminated one: none of the four carries a payload, and
 * `nextBarState` is total over it, so `tsc` catches a fifth event the day someone adds one.
 */
export type NinaChromeEvent = 'toggle' | 'autohide' | 'composer-engaged' | 'composer-released'

/**
 * R1's literal: "auto hid the bottom bar after 5 seconds".
 *
 * Five seconds is long enough to read four labels and press one, and short enough that a bar pulled
 * up by accident goes away without a second interaction.
 */
export const CHROME_AUTOHIDE_MS = 5_000

/**
 * The floating control's tap target.
 *
 * **32 px, which is deliberately BELOW the 44 px iOS floor, at the repo owner's explicit request:
 * "much smaller (take much smaller space in the chat UI)".** That is a real trade and worth
 * naming rather than burying. The floor exists because a 44 px target is what a thumb hits
 * reliably; every round control in `Composer` is `size-11` for that reason, and this file used to
 * say 36 px "would be below the floor".
 *
 * Two things make 32 px defensible *here* specifically, and neither generalises to `Composer`:
 * both controls are pure chrome whose failure mode is a missed tap rather than a wrong action —
 * nothing is sent, deleted or navigated by either one — and they sit in an otherwise empty lane
 * above the composer, so the nearest rival target is tens of pixels away and a near-miss lands on
 * nothing at all. A missed `^` is pressed again; a missed Send is a message.
 *
 * If a thumb turns out to miss these in practice, the fix is to raise this to 40 and re-derive
 * `BOTTOM_GAP.chat` in `components/ui/AppShell.tsx`, which is the one other place the number
 * lives.
 */
export const CHROME_CONTROL_PX = 32

/** Between the control's box and the composer's top edge. Enough to read as floating, not as chrome. */
export const CHROME_CONTROL_GAP_PX = 8

/**
 * The two floating controls' shared skin — `>` (the sidebar's door, in
 * `components/nina/NinaSidebar.tsx`) and `^`/`v` (the bar's toggle, in
 * `components/nina/ChatChrome.tsx`).
 *
 * ONE constant because they are one visual pair sitting 6 px apart, and two class strings in two
 * files is how a pair stops matching. They were `size-11 bg-card/95 shadow-card ring-rule` in two
 * places before this, which is exactly the divergence risk this removes.
 *
 * FROSTED GLASS, as asked for: a translucent fill (`bg-card/40`) over a real backdrop blur, rather
 * than the near-opaque `bg-card/95` these had — at 95% the blur was decorative, since almost
 * nothing showed through it. `backdrop-saturate-150` is what keeps the conversation's colour from
 * going grey behind the glass, which is the difference between frosted and merely dim. The hairline
 * `ring-rule/50` is what gives the disc an edge once the fill stops providing one; without it a
 * translucent circle on a pale bubble has no silhouette at all.
 *
 * Lives in `lib/nina/` with the other chrome rules even though it is a class string, because both
 * consumers are components and `lib/` never imports `components/` — the same direction
 * `controlBottomCss` already takes its `barClearancePx` argument for.
 */
export const NINA_CHROME_CONTROL_CLASS =
  'grid size-8 place-items-center rounded-pill bg-card/40 text-ink-2 ' +
  'shadow-sm ring-1 ring-rule/50 backdrop-blur-md backdrop-saturate-150 ' +
  'transition-[opacity,transform] active:scale-[0.97]'

/**
 * The composer with nothing armed: `py-3` (24) + `min-h-11` (44).
 *
 * The same 68 that `ChatScreen`'s `COMPOSER_FALLBACK_PX = COMPOSER_CLEARANCE_PX + 68` already
 * spells. Used only when `#nina-composer` cannot be measured, which is the frame before the
 * observer's first callback.
 */
export const COMPOSER_RESTING_PX = 68

/**
 * The state machine. Total over `NinaChromeEvent`, and every transition is one line of R1.
 *
 * `'autohide'` is idempotent on purpose: a timer that fires after the runner has already pressed
 * `v` must not toggle the bar back on, and making the event mean "be hidden" rather than "flip"
 * is what removes that race from the caller.
 */
export function nextBarState(state: NinaBarState, event: NinaChromeEvent): NinaBarState {
  if (event === 'toggle') return state === 'hidden' ? 'shown' : 'hidden'
  if (event === 'autohide') return 'hidden'
  if (event === 'composer-engaged') return 'hidden'
  return state
}

/**
 * How long to wait before hiding, or `null` for "run no timer".
 *
 * `null` rather than `0` or `Infinity`: the caller's cleanest shape is an effect that returns early,
 * and a delay of 0 would mean "hide immediately", which is a different rule.
 */
export function autoHideDelayMs(state: NinaBarState, composerEngaged: boolean): number | null {
  if (state !== 'shown') return null
  if (composerEngaged) return null
  return CHROME_AUTOHIDE_MS
}

/**
 * Whether the floating control is on screen at all.
 *
 * It retracts while the composer is engaged, and the first reason is decisive: with a keyboard up
 * the composer is lifted onto it and the control's computed offset puts the control *behind* the
 * keyboard, so it is a button that cannot be pressed. The second is that a chevron floating over
 * the conversation while he types is clutter whose only available action is "show a bar under a
 * keyboard".
 */
export function isControlVisible(composerEngaged: boolean): boolean {
  return !composerEngaged
}

/**
 * Which arrow the one control shows. `'up'` reveals, `'down'` hides.
 *
 * The user named both glyphs; this is the reading that makes both of them true without putting a
 * permanently dead second button on the conversation. Semantic rather than a character, so the
 * component owns the SVG path and the accessible name and this module owns the rule.
 */
export function barToggleGlyph(state: NinaBarState): 'up' | 'down' {
  return state === 'hidden' ? 'up' : 'down'
}

/**
 * The control lane's `bottom`, as a CSS length.
 *
 * Entirely above the composer: the bar's clearance when the bar is showing, plus the composer's
 * measured height, plus the gap, plus the home-indicator inset. That is what keeps the lane clear
 * of the composer's Send button at every composer height, and clear of the tab bar's centre FAB —
 * which spans the 22-78 px band above the viewport bottom and is the one thing a bottom-centre
 * control must never cover.
 *
 * The inset is honoured here and not as the lane's own padding, for the reason
 * `composerBottomCss` gives: everything in this stack sits above chrome that already pads by
 * `--safe-bottom`, so padding twice opens a gap.
 *
 * A string, because that is what the style attribute takes and because `var(--safe-bottom)` is
 * `env(safe-area-inset-bottom)`, which is readable only to CSS.
 *
 * Degenerate input is the resting screen, not an error: a non-finite or non-positive composer
 * height means "not measured yet" and falls back to `COMPOSER_RESTING_PX`; a non-finite or negative
 * clearance contributes nothing. A hidden bar contributes no clearance whatever the argument says.
 */
export function controlBottomCss(input: {
  barState: NinaBarState
  /** `TAB_BAR_HEIGHT_PX + TAB_BAR_FAB_OVERHANG_PX`, passed in — `lib/` never imports `components/`. */
  barClearancePx: number
  /** `#nina-composer`'s measured height, or 0 before the first measurement. */
  composerHeightPx: number
}): string {
  const { barState, barClearancePx, composerHeightPx } = input
  const clearance =
    barState === 'shown' && Number.isFinite(barClearancePx) && barClearancePx > 0
      ? Math.round(barClearancePx)
      : 0
  const composer =
    Number.isFinite(composerHeightPx) && composerHeightPx > 0
      ? Math.round(composerHeightPx)
      : COMPOSER_RESTING_PX
  return `calc(${clearance + composer + CHROME_CONTROL_GAP_PX}px + var(--safe-bottom))`
}
