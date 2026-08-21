import type * as React from 'react'

import { Card, Eyebrow } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/**
 * The chrome every chart in F08 shares: a card, an eyebrow title, an optional control row, the plot
 * area at a FIXED height, an optional legend, a plain-sentence caption, and the table twin.
 *
 * **The fixed height is not styling.** A `ResponsiveContainer` inside an auto-height parent measures
 * zero and renders nothing, and the anti-pattern list is explicit that the container height must
 * include the axis band — so the height is declared once, here, per chart, and includes the axis and
 * legend rows rather than being the plot area alone.
 *
 * **The table twin is a required prop, not an optional nicety.** dataviz's non-negotiable #6: every
 * chart ships an accessible table view, and no value may be reachable only by hover or tap. Making
 * it part of the frame's signature means a new chart cannot be added without deciding where its
 * numbers live. The one sanctioned `null` is the splits table's own chart (§3.1), whose twin is the
 * table already printed directly beneath it — and which passes `table={null}` with that comment.
 */
export function ChartFrame({
  title,
  controls,
  height,
  legend,
  caption,
  table,
  tableSummary = 'Table view',
  children,
  className,
}: {
  title: string
  controls?: React.ReactNode
  /** Total card height for the plot + axis band + legend row. */
  height: number
  legend?: React.ReactNode
  caption?: React.ReactNode
  /** The `<details>` twin, or `null` when an adjacent table already IS the twin. */
  table: React.ReactNode | null
  tableSummary?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {controls}
      </div>

      <div className="ri-chart w-full" style={{ height }}>
        {children}
      </div>

      {legend && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{legend}</div>}

      {caption && <p className="mt-3 text-[12px] font-medium text-ink-2">{caption}</p>}

      {table && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-ink-3">
            {tableSummary}
          </summary>
          <div className="mt-2 overflow-x-auto">{table}</div>
        </details>
      )}
    </Card>
  )
}

/**
 * A legend entry. **Line keys, not swatch boxes** — marks-and-anatomy's rule for dense contexts,
 * and a two-item legend on a 414px card is dense enough to earn it. `variant="bar"` gets a short
 * filled rect because a bar's key should look like a bar.
 */
export function LegendKey({
  className,
  variant = 'line',
  children,
}: {
  /** A chart colour class from `charts.css` — never an inline hex. */
  className: string
  variant?: 'line' | 'bar' | 'dashed'
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-2">
      <svg viewBox="0 0 18 8" className="h-2 w-[18px]" aria-hidden="true">
        {variant === 'bar' ? (
          <rect x="2" y="1" width="14" height="6" rx="1.5" className={className} />
        ) : (
          <line
            x1="1"
            y1="4"
            x2="17"
            y2="4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={variant === 'dashed' ? '3 3' : undefined}
            className={className}
          />
        )}
      </svg>
      {children}
    </span>
  )
}

/**
 * The placeholder a lazily-imported chart shows while its chunk downloads. Exactly the frame's own
 * height, so the arrival of ~100 KB of Recharts produces zero layout shift — the same reasoning as
 * `RunRow`'s skeleton in `loading.tsx`.
 */
export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full [animation:ri-pulse_1.4s_ease-in-out_infinite] rounded-field bg-paper-2"
      style={{ height }}
      aria-hidden="true"
    />
  )
}

/** The shared table-twin shell, so five charts do not each invent a header style. */
export function TableTwin({
  columns,
  children,
}: {
  columns: readonly string[]
  children: React.ReactNode
}) {
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead>
        <tr className="text-left text-[10px] font-semibold text-ink-3">
          {columns.map((column, i) => (
            <th
              key={column}
              scope="col"
              className={cn('pb-1.5 font-semibold', i > 0 && 'text-right')}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}
