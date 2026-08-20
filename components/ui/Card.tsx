import type * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * The app's one surface. White fill, 22px radius, soft shadow, no border — the v2 design's whole
 * elevation vocabulary in one class string, so no screen re-invents it.
 */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card bg-card p-6 shadow-card', className)} {...rest}>
      {children}
    </div>
  )
}

/** A small all-caps accent label. Used to head a group inside a card. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('text-xs font-semibold tracking-[0.02em] text-accent', className)}>
      {children}
    </div>
  )
}

/**
 * A label-over-value tile. `size` follows the design's three steps; the value is always
 * `tabular-nums` so a column of them lines up.
 */
export function Stat({
  label,
  value,
  size = 'md',
  note,
}: {
  label: string
  value: React.ReactNode
  size?: 'sm' | 'md' | 'hero'
  note?: string
}) {
  const valueClass =
    size === 'hero'
      ? 'text-[34px] leading-none font-bold tracking-[-0.02em]'
      : size === 'md'
        ? 'text-[19px] font-semibold'
        : 'text-[15px] font-semibold'
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-ink-3">{label}</div>
      <div className={cn(valueClass, 'text-ink tabular-nums')}>{value}</div>
      {note && <div className="mt-1 text-[11px] font-medium text-ink-3">{note}</div>}
    </div>
  )
}
