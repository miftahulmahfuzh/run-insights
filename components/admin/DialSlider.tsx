'use client'

import * as React from 'react'

import { TOUCH_TARGET } from '@/components/admin/touch'
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
 * out of it. It has exactly one caller and one audience — the runner's app has no slider and the
 * design brief names none, while every operator-only control so far (`CropStudio`, `FolderMenu`,
 * `PhotoMoveBar`, `SelectionPane`, `UserPicker`) has lived here. The barrel is a load-bearing
 * bundle boundary: ten `'use client'` files import it, and the `AppShell` precedent records what
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
 * bug report and cannot be compared against `nina_turns`' recorded revision. So the value renders
 * as an `<output>` tied to the input, and it is the number that is actually stored.
 *
 * ── TWO DIFFERENT KINDS OF "CHANGED", BOTH VISIBLE ──────────────────────────────────────────
 * `defaultValue` is the SHIPPING default, so accent type and the "default N" button mean *this is
 * no longer the Nina who shipped* — the state invariant 2 is about. `unsaved` means *this is not
 * what the row says yet*, which is a different question and gets its own dot. Collapsing the two
 * would leave the operator unable to tell a saved deviation from an unsaved keystroke.
 *
 * Clicking "default N" is the per-dial undo. It writes the default into the draft rather than
 * saving anything, so it is still one Save for the whole tuning (plan invariant 11).
 *
 * ── TOUCH, AND THE SLOT LEFT FOR THE PER-PARAMETER TOGGLE ───────────────────────────────────
 * `h-11` on the track and `TOUCH_TARGET` on the reset are the 44 px rule; a range input's hit area
 * is its box, and Safari draws the track vertically centred in whatever height it is given, so the
 * control looks the same and is far easier to hit with a thumb.
 *
 * The header row is `items-center` with the readout pushed right by `ml-auto` **so that the head of
 * that row can hold a control of any height without dragging the label's baseline around**; it used
 * to be `items-baseline justify-between`, which could not. That is deliberate room left for the
 * ON/OFF TOGGLE the enable-map phase adds beside every parameter — it renders as the first item of
 * this row, giving `[toggle] Flirty ……… 60`, which is the order the questions get asked in: is this
 * on, what is it, what is it set to. Nothing else about this component has to move when that toggle
 * lands, and the existing `disabled` prop already greys the track and hides the reset.
 */

export interface DialSliderProps {
  label: string
  hint?: string
  value: number
  /** The shipping default for this dial. Drives the accent state and the reset affordance. */
  defaultValue: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  /** The draft differs from the saved row for this dial. */
  unsaved?: boolean
  onChange: (value: number) => void
}

export function DialSlider({
  label,
  hint,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  disabled = false,
  unsaved = false,
  onChange,
}: DialSliderProps) {
  const base = React.useId()
  const inputId = `${base}-dial`
  const hintId = hint ? `${base}-hint` : undefined
  const moved = value !== defaultValue

  return (
    <div className="py-2">
      {/* `items-center` + `ml-auto`, not `items-baseline justify-between`: the head of this row is
          where the enable-map phase's per-parameter toggle lands, and a checkbox has no baseline. */}
      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          className="min-w-0 text-[12px] font-semibold tracking-[0.02em] text-ink-2"
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
        </output>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(Number(event.target.value))}
        /* `h-11` is the 44 px tap target; `touch-none` keeps a slightly diagonal thumb drag from
           being claimed by the page's scroll partway through. `mt-0.5` rather than `mt-1.5`: the
           input's own box grew by 20 px, so the optical gap under the label is unchanged. */
        className="mt-0.5 h-11 w-full touch-none accent-accent disabled:opacity-50"
      />

      <div className="mt-1 flex items-center justify-between gap-3">
        {hint ? (
          <p id={hintId} className="max-w-[46ch] text-[11px] font-medium text-ink-3">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {moved && !disabled && (
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
