import type { ZoneShare } from '@/lib/charts'
import { formatDuration, formatPercent, formatZoneBounds } from '@/lib/format'
import { EmptySlot } from './EmptyState'

/**
 * §3.2 — the five-zone stacked bar. **Zero Recharts, deliberately.**
 *
 * Five divs with percentage widths *are* the chart. Building it as plain HTML makes the run-detail
 * page's most load-bearing visual (the design brief: "make 90.6% unmissable") a Server Component
 * that ships no JavaScript, has no hydration delay before it is visible, and repaints for free on
 * a light/dark flip because its colours are CSS custom properties. §7 states this as a rule; this
 * file is where it holds.
 *
 * Three things here are not cosmetic:
 *
 *   - **The 3px minimum width.** Z2 is 1% of the canonical run — 25 seconds. At 414px that is a
 *     4px sliver, and at any narrower card it rounds to nothing. The printed percentage next to it
 *     is always the true, unclamped value, so the clamp can never become a lie.
 *   - **The 2px gaps are surface-coloured, not borders.** The v2 design has no borders on
 *     surfaces, and a 1px stroke around a 4px segment is mostly stroke.
 *   - **Every label carries its zone number.** Colour is never the only channel (design brief,
 *     dataviz, and the token file all say so independently).
 *
 * A zone with zero seconds renders no segment at all. A run with no zone rows renders `EmptySlot`,
 * never five 0% segments — see §9.
 */

const ZONE_FILL: Record<number, string> = {
  1: 'bg-z1',
  2: 'bg-z2',
  3: 'bg-z3',
  4: 'bg-z4',
  5: 'bg-z5',
}

export function ZoneBar({
  shares,
  caption,
  emptyMessage = 'No heart-rate data for this run.',
}: {
  shares: readonly ZoneShare[]
  /** One plain sentence under the labels — the place §3.2 puts "90.6% of this run was Z4 or harder." */
  caption?: React.ReactNode
  emptyMessage?: string
}) {
  const total = shares.reduce((sum, s) => sum + s.durationSec, 0)
  if (shares.length === 0 || total === 0) return <EmptySlot>{emptyMessage}</EmptySlot>

  return (
    <div>
      <div
        className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-pill"
        role="img"
        aria-label={shares
          .map((s) => `Zone ${s.zone}, ${formatPercent(s.pct)}, ${formatDuration(s.durationSec)}`)
          .join('. ')}
      >
        {shares
          .filter((s) => s.durationSec > 0)
          .map((s) => (
            <span
              key={s.zone}
              className={ZONE_FILL[s.zone] ?? 'bg-miss'}
              // The width is the true share; minWidth only stops a real slice vanishing.
              style={{ width: `${(s.durationSec / total) * 100}%`, minWidth: '3px' }}
            />
          ))}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {shares.map((s) => (
          <li key={s.zone} className="flex items-center gap-1.5 text-[12px] tabular-nums">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${ZONE_FILL[s.zone] ?? 'bg-miss'}`}
            />
            <span className="font-semibold text-ink">Z{s.zone}</span>
            <span className="font-medium text-ink-2">{formatPercent(s.pct)}</span>
          </li>
        ))}
      </ul>

      {caption && <p className="mt-3 text-[13px] font-medium text-ink-2">{caption}</p>}

      {/* dataviz's non-negotiable: every chart ships its table twin, reachable without hover. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-ink-3">
          Zone table
        </summary>
        <table className="mt-2 w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-ink-3">
              <th scope="col" className="pb-1.5 font-semibold">
                Zone
              </th>
              <th scope="col" className="pb-1.5 font-semibold">
                Range
              </th>
              <th scope="col" className="pb-1.5 text-right font-semibold">
                Time
              </th>
              <th scope="col" className="pb-1.5 text-right font-semibold">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.zone} className="border-t border-rule-2">
                <td className="py-1.5 font-semibold text-ink">Z{s.zone}</td>
                <td className="py-1.5 text-ink-2">{formatZoneBounds(s.minBpm, s.maxBpm)}</td>
                <td className="py-1.5 text-right text-ink-2">{formatDuration(s.durationSec)}</td>
                <td className="py-1.5 text-right text-ink-2">{formatPercent(s.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
