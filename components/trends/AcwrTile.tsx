import { ACWR_SWEET_SPOT, isAcwrOutOfRange, type Acwr } from '@/lib/metrics'
import { Stat } from '@/components/ui/Card'
import { formatDistanceKm } from '@/lib/format'

/**
 * Acute-to-chronic workload ratio: the last 7 days' distance over the trailing 28 days' weekly
 * average. R-6 is why it is a rolling window rather than a calendar one, and F06 computes it.
 *
 * **Flagged only outside 0.8–1.3**, and flagged as a *fact* rather than as an alarm: "outside the
 * usual range" states where the number sits, where "⚠️ Injury risk!" would be a medical claim this
 * app does not make and cannot support. The band itself is printed, so a reader can see what
 * "outside" means without looking it up.
 *
 * With less than 28 days of history the ratio is withheld entirely — a 4-day "chronic" load is not
 * a chronic load, and a ratio computed against one is a made-up number wearing a decimal point.
 */
export function AcwrTile({ acwr }: { acwr: Acwr }) {
  if (acwr.insufficientHistory || acwr.ratio == null) {
    return (
      <div className="rounded-field bg-paper-2 p-4">
        <Stat
          label="Training load"
          value="—"
          size="sm"
          note="Needs four weeks of history before a 7-day-to-28-day ratio means anything."
        />
      </div>
    )
  }

  const outside = isAcwrOutOfRange(acwr)

  return (
    <div className={outside ? 'rounded-field bg-warn-soft p-4' : 'rounded-field bg-paper-2 p-4'}>
      <Stat
        label="Training load · 7d ÷ 28d"
        value={acwr.ratio.toFixed(2)}
        size="sm"
        note={`${formatDistanceKm(acwr.acuteKm)} this week against a ${formatDistanceKm(
          acwr.chronicWeeklyAvgKm,
        )} four-week average — ${
          outside ? 'outside' : 'inside'
        } the usual ${ACWR_SWEET_SPOT.min}–${ACWR_SWEET_SPOT.max} range.`}
      />
    </div>
  )
}
