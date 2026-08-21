import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Card, Eyebrow, Stat } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { jakartaDayOf } from '@/lib/date/ranges'
import { getRunDetail } from '@/lib/db/queries'
import {
  formatBpm,
  formatCadence,
  formatClock,
  formatDay,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
} from '@/lib/format'
import { isValidId } from '@/lib/id'

/**
 * `/r/[id]` — the committed run.
 *
 * **F08 owns this screen and will replace the body wholesale** with the hero, the analysis, the
 * pace+HR dual axis and the zone bar its plan describes. What is here is the minimum that makes
 * F05 a working feature rather than a form that saves into the dark: `commitReview` redirects
 * here, and a redirect to a 404 is not a finished flow.
 *
 * Two things below are F05's own and should survive the replacement, because nothing else in the
 * product renders them:
 *
 *   - the **provenance line** (§9.3): "Reviewed 20 Aug · edited 22 Aug", which is what makes
 *     `reviewed_at` and `corrected_at` two different questions rather than one confusing one;
 *   - the **link to `/r/[id]/edit`**, which is the only way into the post-review correction path.
 */
export default async function RunPage({ params }: PageProps<'/r/[id]'>) {
  const userId = await requireUserId()
  const { id } = await params
  if (!isValidId(id)) notFound()

  const run = await getRunDetail(userId, id)
  if (!run) notFound()

  const fullSplits = run.splits.filter((s) => !s.partial)
  const zoneTotal = run.zones.reduce((sum, z) => sum + z.durationSec, 0)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[470px] p-5 pb-[calc(2rem+var(--safe-bottom))]">
      <header className="mb-5 flex items-baseline justify-between">
        <Link href="/" className="text-[13px] font-semibold text-accent">
          ← Runs
        </Link>
        <Link href={`/r/${id}/edit`} className="text-[13px] font-semibold text-accent">
          Correct
        </Link>
      </header>

      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <Eyebrow>{run.activityType}</Eyebrow>
          {run.source === 'manual' && (
            <span className="rounded-chip bg-rule-2 px-2 py-0.5 text-[10px] font-semibold text-ink-3">
              entered by hand
            </span>
          )}
        </div>

        <Stat
          label={formatDay(run.occurredOn)}
          value={formatDistanceM(run.distanceM)}
          size="hero"
          note={
            [
              run.location,
              run.startedAt && `${formatClock(run.startedAt)}–${formatClock(run.endedAt)}`,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />

        <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5">
          <Stat label="Duration" value={formatDuration(run.durationSec)} />
          <Stat label="Avg pace" value={formatPace(run.avgPaceSec, true)} />
          <Stat label="Avg HR" value={formatBpm(run.avgHr)} />
          <Stat label="Max HR" value={formatBpm(run.maxHr)} />
          <Stat label="Cadence" value={formatCadence(run.avgCadence)} />
          <Stat label="Active" value={formatKcal(run.activeKcal)} />
          <Stat label="Elevation" value={formatElevation(run.elevationM)} />
          <Stat label="At the end" value={formatBpm(run.endHrBpm)} />
          <Stat label="+1 min" value={formatBpm(run.hr1MinPostBpm)} />
        </div>

        {/* §9.3 — two columns, two different questions. `reviewed_at` is written once and never
            moves; `corrected_at` is the last post-review edit. */}
        <p className="mt-5 text-[11px] font-medium text-ink-3">
          Reviewed {formatDay(run.reviewedAt && jakartaDayOf(run.reviewedAt))}
          {run.correctedAt && ` · edited ${formatDay(jakartaDayOf(run.correctedAt))}`}
        </p>

        {run.note && <p className="mt-3 text-[13px] font-medium text-ink-2">{run.note}</p>}
      </Card>

      {run.splits.length > 0 && (
        <Card className="mt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>Splits</Eyebrow>
            <span className="text-[11px] font-semibold text-ink-3">{run.splits.length}</span>
          </div>
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-ink-3">
                <th className="pb-2 font-semibold">Km</th>
                <th className="pb-2 font-semibold">Time</th>
                <th className="pb-2 font-semibold">Pace</th>
                <th className="pb-2 text-right font-semibold">HR</th>
                <th className="pb-2 text-right font-semibold">Cad</th>
              </tr>
            </thead>
            <tbody>
              {run.splits.map((split) => (
                <tr
                  key={split.km}
                  className={
                    split.partial
                      ? 'border-t border-l-2 border-rule-2 border-l-warn'
                      : 'border-t border-rule-2'
                  }
                >
                  <td className="py-1.5 pl-1.5 font-semibold text-ink">
                    {split.km}
                    {split.partial && (
                      <span className="ml-1 text-[10px] font-semibold text-ink-3">part</span>
                    )}
                  </td>
                  <td className="py-1.5 text-ink-2">{formatDuration(split.timeSec)}</td>
                  <td className="py-1.5 text-ink-2">{formatPace(split.paceSec)}</td>
                  <td className="py-1.5 text-right text-ink-2">{split.hr ?? '—'}</td>
                  <td className="py-1.5 text-right text-ink-2">{split.cadence ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] font-medium text-ink-3">
            {/* D14 restated where it is acted on, not only where it is decided. */}
            {fullSplits.length} full {fullSplits.length === 1 ? 'kilometre' : 'kilometres'}
            {run.splits.length > fullSplits.length &&
              ', plus a partial final kilometre left out of every pace average'}
            .
          </p>
        </Card>
      )}

      {run.zones.length > 0 && zoneTotal > 0 && (
        <Card className="mt-4">
          <Eyebrow>Heart-rate zones</Eyebrow>
          <ul className="mt-3 space-y-1.5 text-[13px] tabular-nums">
            {run.zones.map((zone) => (
              <li key={zone.zone} className="flex items-baseline gap-3">
                <span className="font-semibold text-ink">Z{zone.zone}</span>
                <span className="ml-auto text-ink-2">{formatDuration(zone.durationSec)}</span>
                <span className="w-9 text-right text-ink-3">
                  {Math.round((zone.durationSec / zoneTotal) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4 text-center">
        <p className="text-[13px] font-semibold text-ink">Analysis, charts and records — F08/F09</p>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] font-medium text-ink-2">
          The numbers above are confirmed and stored. Everything computed from them lands with the
          next features.
        </p>
      </Card>
    </main>
  )
}
