'use client'

import * as React from 'react'

import { TOUCH_ICON, TOUCH_TARGET } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

/**
 * One dial, 0–100 — the *"sliding bars"* R1 asked for, in the only shape that satisfies the two
 * conditions the plan set on them: **keyboard-operable, and showing its number.**
 *
 * ── A NATIVE `<input type="range">`, NOT A DIV WITH A DRAG HANDLER ──────────────────────────
 * Arrow keys, Home/End and PageUp/PageDown all work, focus is visible, the value is exposed to a
 * screen reader, and the thumb tracks a pointer correctly on the first try. A hand-rolled track
 * gets none of that for free and this repo has already made that call once —
 * `components/admin/CropStudio.tsx` is a native range with `accent-accent`, and this is the
 * same control with a label and a readout bolted on.
 *
 * ── WHERE IT LIVES, AND WHY IT IS NOT IN `components/ui/` ───────────────────────────────────
 * `components/ui/index.ts` is the shared client-safe kit, and three arguments keep this control
 * out of it. It is operator-only by construction — the runner's app has no slider and the
 * design brief names none, while every operator-only control so far (`CropStudio`, `FolderMenu`,
 * `PhotoMoveBar`, `SelectionPane`, `UserPicker`) has lived here. The barrel is a load-bearing
 * bundle boundary: forty-plus files import it (43 measured 2026-09-12), and the `AppShell` precedent records what
 * happens when something with a different graph joins. And the nearest precedent already chose
 * `components/admin/`. If a runner-facing slider ever appears, moving this file is one rename plus
 * one line in the barrel, and that is the moment to make the case.
 *
 * `components/admin/touch.ts` follows exactly this reasoning and is a sibling for it.
 *
 * ── WHY NOT `Field` ─────────────────────────────────────────────────────────────────────────
 * `Field` owns the `label`/`hint`/`error`/`aria-describedby` wiring, but only `Input` reads its
 * context for the `id`, so a bare `<input type="range">` inside a `Field` would get a
 * `<label htmlFor>` pointing at nothing — an unlabelled control with the appearance of a labelled
 * one. `CONTROL_CLASS` is also a 52 px filled well, which is a text field and not a track. So this
 * component does its own `useId` wiring, which is four lines.
 *
 * ── THE NUMBER IS NOT DECORATION ────────────────────────────────────────────────────────────
 * An unlabelled slider is a dial the operator cannot report back: "flirty is quite high" is not a
 * bug report and cannot be checked against the row the panel stores. So the value renders as an
 * `<output>` tied to the input, and it is the number that is actually stored.
 *
 * ── THREE DIFFERENT KINDS OF "CHANGED", ALL VISIBLE ─────────────────────────────────────────
 * `defaultValue` is the SHIPPING default, so accent type means *this is no longer the Nina who
 * shipped*. `unsaved` means *this is not what the row says yet*, which is a different question and
 * gets its own dot. And `enabled` (R4) means *this parameter reaches her prompt at all*.
 *
 * The three interact in one place and it is deliberate: **a dial that is switched OFF is never
 * shown in accent**, whatever it is parked at, because a disabled parameter contributes zero bytes
 * and on that axis she IS the Nina who shipped. The "default N" button still appears, because the
 * operator may want to clear a parked value without turning the parameter back on to do it.
 *
 * Clicking "default N" is the per-dial undo, and since the simplify set it is also the surviving
 * route back to defaults: it writes the default into the draft through `onChange`, and the panel
 * commits it with the whole tuning when the settle debounce fires (plan invariant 11).
 *
 * ── THE TOGGLE IS OPTIONAL, AND ABSENT MEANS "NO TOGGLE" ────────────────────────────────────
 * `onEnabledChange` is what renders the checkbox. A caller with a parameter that has no off switch
 * — there is none today, but `notes` is exactly that shape — passes neither prop and gets the
 * control as it was before R4, rather than a checkbox that is always on and does nothing.
 *
 * ── TOUCH (INHERITED FROM THE RESPONSIVE PHASE — DO NOT UNDO) ───────────────────────────────
 * `h-11` on the track, `TOUCH_TARGET` on the reset and `TOUCH_ICON` around the checkbox are the
 * 44 px rule (`docs/design-brief.md`, "Minimum 44 × 44pt tap targets"); a range input's hit area is
 * its box, and Safari draws
 * the track vertically centred in whatever height it is given, so the control looks the same and is
 * far easier to hit with a thumb. The header row is `items-center` with the readout pushed right by
 * `ml-auto` **precisely so the checkbox can sit at its head without dragging the label's baseline
 * around** — it was `items-baseline justify-between` before, which could not hold a control of
 * arbitrary height. That row shape exists for this toggle; it is not incidental.
 */

interface DialSliderProps {
  label: string
  hint?: string
  value: number
  /** The shipping default for this dial. Drives the accent state and the reset affordance. */
  defaultValue: number
  min: number
  max: number
  /** The draft differs from the saved row for this dial — its value OR its toggle. */
  unsaved?: boolean
  /** R4: whether this parameter reaches the assembled prompt at all. */
  enabled?: boolean
  /** R4: omit to render no toggle at all. */
  onEnabledChange?: (next: boolean) => void
  onChange: (value: number) => void
}

export function DialSlider({
  label,
  hint,
  value,
  defaultValue,
  min,
  max,
  unsaved = false,
  enabled = true,
  onEnabledChange,
  onChange,
}: DialSliderProps) {
  const base = React.useId()
  const inputId = `${base}-dial`
  const hintId = hint ? `${base}-hint` : undefined
  /* `deviates` drives the per-dial undo; `moved` drives the accent. They differ for exactly one
   * state and it is R4's: parked away from the default with the toggle OFF. */
  const deviates = value !== defaultValue
  const moved = enabled && deviates

  return (
    <div className={cn('py-2', !enabled && 'opacity-70')}>
      {/* `items-center` + `ml-auto` is phase 2's row, made for exactly this checkbox. */}
      <div className="flex items-center gap-2">
        {onEnabledChange && (
          /*
           * `TOUCH_ICON` is the 44 px box; `size-4` is the checkbox drawn inside it. A bare
           * `size-4` control is 16 px and would be the only thing in `components/admin/` under the
           * rule the responsive phase spent fourteen steps enforcing — and this is the control the
           * operator reaches for most, since it is the one that shortens the prompt.
           *
           * A wrapping `<label>` rather than `aria-label` on the input: the label makes the whole
           * 44 px box the hit target, not just the 16 px glyph inside it, which is the entire point
           * of giving it a 44 px box. The `sr-only` span is its accessible name. `-ml-2.5` pulls
           * the oversized box back so the checkbox glyph still lines up with the row's left edge;
           * the padding is hit area, not indent.
           */
          <label className={cn(TOUCH_ICON, '-ml-2.5 shrink-0 cursor-pointer')}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
              className="size-4 accent-accent"
            />
            <span className="sr-only">Include {label} in her prompt</span>
          </label>
        )}

        <label
          htmlFor={inputId}
          className={cn(
            'min-w-0 truncate text-[12px] font-semibold tracking-[0.02em]',
            enabled ? 'text-ink-2' : 'text-ink-3 line-through',
          )}
        >
          {label}
        </label>

        <output
          htmlFor={inputId}
          className={cn(
            'ml-auto shrink-0 text-[13px] font-semibold tabular-nums',
            moved ? 'text-accent' : 'text-ink-3',
          )}
        >
          {unsaved && (
            <span className="mr-1 text-accent" title="Unsaved">
              &bull;
            </span>
          )}
          {value}
          {!enabled && <span className="ml-1 text-[11px] font-medium">off</span>}
        </output>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        /* Whole-integer steps, hardcoded: no caller ever wanted otherwise (2026-09-12 sweep —
           the old `step` prop was set by no call site; the old `disabled` prop by none either,
           so a dial can no longer be rendered inert from outside). */
        step={1}
        value={value}
        aria-describedby={hintId}
        onChange={(event) => onChange(Number(event.target.value))}
        /* `h-11` is the 44 px tap target; `touch-none` keeps a slightly diagonal thumb drag from
           being claimed by the page's scroll partway through. Both inherited — do not shrink. */
        className="mt-0.5 h-11 w-full touch-none accent-accent"
      />

      <div className="mt-1 flex items-center justify-between gap-3">
        {hint ? (
          <p id={hintId} className="max-w-[46ch] text-[11px] font-medium text-ink-3">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {deviates && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className={cn(
              TOUCH_TARGET,
              'inline-flex shrink-0 items-center px-1 text-[11px] font-semibold text-ink-3',
              'underline decoration-dotted hover:text-ink',
            )}
          >
            default {defaultValue}
          </button>
        )}
      </div>
    </div>
  )
}
