import type { VolumeDelta } from '@/lib/metrics'
import { formatVolumeDelta } from '@/lib/format'

/**
 * "4 runs · ↑ 12% vs last week", and the two states that are not a percentage.
 *
 * F06's `VolumeDelta` has three kinds and each one exists to stop a lie:
 *
 *   - `none`  — nothing run in either period. "0%" would imply there was something to compare.
 *   - `first` — last period was zero. The percentage is +∞; say what happened instead.
 *   - `pct`   — a real comparison.
 *
 * §9's honesty rule for a first week is a sentence, never a fake 0% and never a divide-by-zero. The
 * direction is carried by an arrow and by the word "vs", never by colour alone.
 */
export function DeltaLine({
  delta,
  runCount,
  periodNoun,
}: {
  delta: VolumeDelta
  runCount: number
  /** 'week' or 'month' — the noun in "vs last ___". */
  periodNoun: string
}) {
  const runs = `${runCount} ${runCount === 1 ? 'run' : 'runs'}`

  return (
    <p className="mt-1.5 text-[13px] font-medium text-ink-2 tabular-nums">
      {runs}
      {delta.kind === 'pct' && (
        <>
          <span className="text-ink-3"> · </span>
          {formatVolumeDelta(delta.pct, Math.abs(delta.pct) < 10 ? 1 : 0)} vs last {periodNoun}
        </>
      )}
      {delta.kind === 'first' && (
        <>
          <span className="text-ink-3"> · </span>
          first tracked {periodNoun} — no comparison yet
        </>
      )}
    </p>
  )
}
