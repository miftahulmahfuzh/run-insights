'use client'

import { SCREEN_KINDS, SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { cn } from '@/lib/cn'

/**
 * Which screen is this? A segmented control, one tile, three options.
 *
 * The kind is resolved **client-side, from the runner** — never inferred by the model and never
 * guessed from the pixels (plan §5.3). Both alternatives were considered and rejected: the
 * measured recipe's "unlabelled images in a fixed order" only works because the *test* controls
 * the order, and an aspect-ratio/OCR heuristic still needs a human override for when it is
 * confidently wrong, so it adds a guess without removing any UI.
 *
 * `disabled` covers the kinds already taken by another tile: two "Splits" screenshots would make
 * the provenance guard believe a screen is covered when the real screen is missing, which is the
 * exact hole it exists to close. Enforced again server-side by `ExtractRequestSchema`.
 */
export function KindSelector({
  value,
  taken,
  onChange,
  disabled,
}: {
  value: ScreenKind
  /** Kinds claimed by other tiles. */
  taken: ReadonlySet<ScreenKind>
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
        const blocked = disabled || (!selected && taken.has(kind))
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={blocked}
            onClick={() => onChange(kind)}
            className={cn(
              // 36px tall inside a 44pt row; the whole tile is the tap target for the row.
              'h-9 flex-1 rounded-pill text-[12px] font-semibold transition-colors',
              selected ? 'bg-ink text-card' : 'text-ink-2',
              blocked && !selected && 'opacity-35',
            )}
          >
            {SCREEN_KIND_LABEL[kind]}
          </button>
        )
      })}
    </div>
  )
}
