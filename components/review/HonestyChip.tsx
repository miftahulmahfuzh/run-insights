import { cn } from '@/lib/cn'

/**
 * **R-46's honesty marks**, and the reason they are chips rather than R-29's underlines: a 1 px
 * underline is invisible at arm's length and unhittable as a tap target, and it asks the runner
 * to learn a legend of line styles. A chip carries the word.
 *
 * These three states are how D1 — "a human confirms every run" — becomes something you can see.
 * Two of them are computed and one is a stored fact:
 *
 *   `scan`    the default state of every extracted value: read from an image, not yet touched
 *   `check`   a validation result — one of the four checks is pointing here (`checkId` names it)
 *   `edited`  a stored fact: this value differs from what the extraction said (R-7 / R-8)
 *
 * Colour is never the only signal (design brief's honesty rule). Each chip carries its own word,
 * so a colour-blind reader and a screen-reader user get the same information as everyone else.
 */

export type HonestyState = 'scan' | 'check' | 'edited'

const STYLES: Record<HonestyState, string> = {
  // Quiet by construction: "read from a screenshot" is the normal case, and a mark that shouts
  // on every field is a mark nobody reads on any field.
  scan: 'bg-rule-2 text-ink-3',
  check: 'bg-warn-soft text-ink',
  edited: 'bg-accent-soft text-ink',
}

const LABELS: Record<HonestyState, string> = {
  scan: 'scan',
  check: 'check',
  edited: 'edited',
}

const DESCRIPTIONS: Record<HonestyState, string> = {
  scan: 'Read from a screenshot',
  check: 'Worth checking',
  edited: 'Corrected by hand',
}

export function HonestyChip({
  state,
  label,
  className,
}: {
  state: HonestyState
  /** Overrides the default word — `from Splits` on a section header, for instance. */
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-chip px-2 py-0.5 text-[10px] font-semibold',
        STYLES[state],
        className,
      )}
      title={DESCRIPTIONS[state]}
    >
      <span className="sr-only">{DESCRIPTIONS[state]}: </span>
      {label ?? LABELS[state]}
    </span>
  )
}
