import { zoneOfHr, type PaceHrPoint } from '@/lib/charts'
import { formatDistanceM, formatDuration, formatPace } from '@/lib/format'
import type { ZoneRow } from '@/lib/metrics'
import { cn } from '@/lib/cn'

/**
 * §3.3 — the splits table. A Server Component, no Recharts, no client state.
 *
 * **This table IS the pace/HR chart's accessible twin.** The chart directly above it plots the same
 * eleven rows, every value here is printed rather than reachable by hover, and the two are adjacent
 * on one page — so no `<details>` duplicate is needed and none should be added. §3.1 says this from
 * the chart's side; this comment is the other half of the contract.
 *
 * ── THE PARTIAL ROW, ON FOUR INDEPENDENT CHANNELS (D14, and R-30) ──────────────────────────────
 *  1. The KM cell reads `11*`, with `0.67 km` on a second line right beneath it — the real distance
 *     sits next to the row's own label, not in a footnote a reader can skip.
 *  2. A 3px left rule marks the row's full height: a different KIND of row, not an error.
 *  3. The row's background is one step off the card surface, so it survives a greyscale screenshot.
 *  4. **Its pace bar's track is shortened** to the fraction of a kilometre actually run (R-30). A
 *     0.67 km split occupies two thirds of the track however fast it was, so the eye reads "short
 *     effort" before it reads a number.
 *
 * ── WHY THE NUMERIC COLUMNS CARRY THEIR OWN `pl-3` (F16) ───────────────────────────────────────
 * The bar cell below is `w-full`, and under `table-auto` that hands the table's whole slack to it —
 * every sibling cell then collapses to exactly its content width. So PACE, HR and CAD cannot borrow
 * a gap from the layout the way `ZoneBar`'s table does; without a gutter of their own they render
 * as `6'36"154154`, which is what issue #2 reported. The `pl-3` on each of the three headers and
 * their three cells IS the separation, and removing it as redundant brings the bug straight back.
 * The same starvation is why `0.67 km` needs `whitespace-nowrap`: the KM cell is only as wide as
 * `11*`, so the longer label underneath would otherwise break after `0.67`.
 *
 * **There is no TIME column, and adding one would be a regression.** km 11's raw 4:48 is the
 * shortest number in the table and would read as a closing sprint to anyone who skipped the
 * asterisk. Pace already answers "how fast" in comparable units. The elapsed time is stated once,
 * in the caption, in a sentence that says what it is.
 */

const ZONE_FILL: Record<number, string> = {
  1: 'bg-z1',
  2: 'bg-z2',
  3: 'bg-z3',
  4: 'bg-z4',
  5: 'bg-z5',
}

export function SplitsTable({
  points,
  zones,
  fastestKm,
  slowestKm,
}: {
  points: readonly PaceHrPoint[]
  /** The run's OWN zone bounds, for R-30's bar colour. See `zoneOfHr` for why not a global table. */
  zones: readonly ZoneRow[]
  fastestKm?: number | null
  slowestKm?: number | null
}) {
  if (points.length === 0) return null

  // The bar's scale: the slowest FULL kilometre is full length. The partial's pace can legitimately
  // exceed it, so the fill is clamped rather than allowed to overflow its shortened track.
  const fullPaces = points.filter((p) => !p.partial).map((p) => p.paceSec)
  const slowestPace =
    fullPaces.length > 0 ? Math.max(...fullPaces) : Math.max(...points.map((p) => p.paceSec))
  const partial = points.find((p) => p.partial)

  return (
    <div>
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-[10px] font-semibold tracking-[0.02em] text-ink-3">
            <th scope="col" className="pb-2 font-semibold">
              KM
            </th>
            <th scope="col" className="pb-2 font-semibold">
              <span className="sr-only">Pace, drawn</span>
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-semibold">
              PACE
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-semibold">
              HR
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-semibold">
              CAD
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const zone = zoneOfHr(point.hr, zones)
            const trackPct = Math.min(100, (point.distanceM / 1000) * 100)
            const fillPct = Math.min(100, (point.paceSec / slowestPace) * 100)
            const emphasis =
              point.km === fastestKm ? 'fastest' : point.km === slowestKm ? 'slowest' : null

            return (
              <tr
                key={point.km}
                className={cn(
                  'border-t border-rule-2',
                  point.partial && 'border-l-[3px] border-l-ink-3 bg-paper-2',
                )}
              >
                <td className="py-2 pl-1.5 align-top font-semibold text-ink">
                  {point.km}
                  {point.partial && '*'}
                  {point.partial && (
                    <span className="mt-0.5 block text-[10px] font-medium whitespace-nowrap text-ink-3">
                      {formatDistanceM(point.distanceM)}
                    </span>
                  )}
                </td>

                {/* R-30: length is pace (longer = slower), colour is the split's dominant zone, and
                    the track itself is short for a partial kilometre. */}
                <td className="w-full py-2 pl-2 align-middle">
                  <span
                    aria-hidden="true"
                    className="block h-2 rounded-pill bg-rule-2"
                    style={{ width: `${trackPct}%` }}
                  >
                    <span
                      className={`block h-2 rounded-pill ${zone ? (ZONE_FILL[zone] ?? 'bg-miss') : 'bg-miss'}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </span>
                </td>

                <td className="py-2 pl-3 text-right align-top font-medium text-ink-2">
                  {formatPace(point.paceSec)}
                  {emphasis && (
                    <span className="mt-0.5 block text-[10px] font-semibold text-ink-3">
                      {emphasis}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-3 text-right align-top font-medium text-ink-2">
                  {point.hr ?? '—'}
                </td>
                <td className="py-2 pr-1 pl-3 text-right align-top font-medium text-ink-2">
                  {point.cadence ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {partial && (
        <p className="mt-3 text-[11px] font-medium text-ink-3">
          {/* R-30's own caption, and D14 said out loud on the screen that shows the row. */}
          km {partial.km} is partial — {formatDistanceM(partial.distanceM)} at{' '}
          {formatPace(partial.paceSec, true)}, {formatDuration(partial.timeSec)} elapsed. It is left
          out of every pace average.
        </p>
      )}
    </div>
  )
}
