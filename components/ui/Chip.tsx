import type * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * A small pill that is either a filter or a fact. Two states, no third.
 *
 * Deliberately NOT marked `'use client'`: the pace-trend filter row is client-stateful and the
 * intent row is a Server Action's form, and both want the same pill. A presentational component
 * with no hooks compiles into whichever graph imports it (the same reasoning as `Button`).
 *
 * `44px` minimum height is the design brief's iOS floor, and it is a constraint that wins over the
 * design — a 32px chip looks better and cannot be hit reliably with a thumb.
 */
export const CHIP_CLASS =
  'inline-flex h-11 select-none items-center justify-center rounded-pill px-4 ' +
  'text-[13px] font-semibold transition-[background-color,color] disabled:opacity-50'

export function chipClasses(selected: boolean): string {
  // Selected is a solid ink slab, unselected a tint of the page — the same pair as Button's
  // primary/secondary, so a chip and a button never disagree about what "chosen" looks like.
  return cn(CHIP_CLASS, selected ? 'bg-ink text-card' : 'bg-paper-2 text-ink-2')
}

export function Chip({
  selected = false,
  className,
  children,
  ...rest
}: { selected?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      // aria-pressed, not aria-selected: these are toggles in a group, not tabs in a tablist, and
      // a screen reader that announces "selected" for a filter chip has told the user nothing
      // about whether tapping it again turns it off.
      aria-pressed={selected}
      className={cn(chipClasses(selected), className)}
      {...rest}
    >
      {children}
    </button>
  )
}
