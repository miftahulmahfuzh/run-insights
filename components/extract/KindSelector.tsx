'use client'

import { SCREEN_KINDS, SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { cn } from '@/lib/cn'

/**
 * Which screen is this? A segmented control, one tile, four options — all four always live.
 *
 * The kind is resolved **client-side, from the runner** — never inferred by the model and never
 * guessed from the pixels (plan §5.3). Both alternatives were considered and rejected: the
 * measured recipe's "unlabelled images in a fixed order" only works because the *test* controls
 * the order, and an aspect-ratio/OCR heuristic still needs a human override for when it is
 * confidently wrong, so it adds a guess without removing any UI.
 *
 * ── A 2×2 GRID, SINCE WORKOUT DETAILS ───────────────────────────────────────────────────────
 * Four labels no longer fit one row: the selector sits beside a 58 px preview in a ~250 px column,
 * and "Workout Details" alone is ~95 px at 12 px semibold. Two rows of two keep every label whole
 * and every target 36 px tall. Workout Details is never a default (`DEFAULT_KIND_BY_INDEX`); the
 * runner taps it on the tile that holds the Workout Details screenshot, in place of Splits.
 *
 * ── WHY NOTHING IS DIMMED (F16) ─────────────────────────────────────────────────────────────
 * This control used to take a `taken` set — the kinds other tiles held — and render them disabled
 * at 35% opacity, to stop two tiles claiming one screen. That guard was real (two "Splits" would
 * make the provenance guard believe a screen is covered when the real screen is missing) but
 * implemented as subtraction, and there were exactly as many kinds as slots: on a full
 * three-screen upload every kind was claimed, so every non-selected button everywhere was dead.
 * The control froze precisely when a mislabel needed fixing.
 *
 * The invariant now lives in `lib/extract/reassignKind.ts`, which **swaps** instead of subtracting,
 * so it holds after every tap and this component needs no knowledge of its neighbours at all.
 *
 * The dimming is gone outright rather than softened. It is what read as *disabled* and hid the fix
 * from the runner; a lighter version of the same signal is a lighter version of the same confusion.
 * A swap needs no forewarning because it announces itself — the neighbouring tile's control visibly
 * moves the instant the tap lands. Distinctness is still enforced server-side by
 * `ExtractRequestSchema`, which is where it belongs.
 */
export function KindSelector({
  value,
  onChange,
  disabled,
}: {
  value: ScreenKind
  onChange: (kind: ScreenKind) => void
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Which screen is this?"
      className="grid grid-cols-2 gap-1 rounded-field bg-paper-2 p-1"
    >
      {SCREEN_KINDS.map((kind) => {
        const selected = kind === value
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(kind)}
            className={cn(
              // 36px tall; two rows of two inside the tile's column.
              'h-9 rounded-pill text-[12px] font-semibold transition-colors',
              selected ? 'bg-ink text-card' : 'text-ink-2',
            )}
          >
            {SCREEN_KIND_LABEL[kind]}
          </button>
        )
      })}
    </div>
  )
}
