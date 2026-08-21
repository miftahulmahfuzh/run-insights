'use client'

import { SCREEN_KINDS, SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { cn } from '@/lib/cn'

/**
 * Which screen is this? A segmented control, one tile, three options — all three always live.
 *
 * The kind is resolved **client-side, from the runner** — never inferred by the model and never
 * guessed from the pixels (plan §5.3). Both alternatives were considered and rejected: the
 * measured recipe's "unlabelled images in a fixed order" only works because the *test* controls
 * the order, and an aspect-ratio/OCR heuristic still needs a human override for when it is
 * confidently wrong, so it adds a guess without removing any UI.
 *
 * ── WHY NOTHING IS DIMMED (F16) ─────────────────────────────────────────────────────────────
 * This control used to take a `taken` set — the kinds other tiles held — and render them disabled
 * at 35% opacity, to stop two tiles claiming one screen. That guard was real (two "Splits" would
 * make the provenance guard believe a screen is covered when the real screen is missing) but
 * implemented as subtraction, and `MAX_IMAGES === SCREEN_KINDS.length`: on a full three-screen
 * upload every kind was claimed, so every non-selected button everywhere was dead. The control
 * froze precisely when a mislabel needed fixing.
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
      className="flex gap-1 rounded-pill bg-paper-2 p-1"
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
              // 36px tall inside a 44pt row; the whole tile is the tap target for the row.
              'h-9 flex-1 rounded-pill text-[12px] font-semibold transition-colors',
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
