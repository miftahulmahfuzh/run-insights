'use client'

import { Card, Eyebrow, Stat } from '@/components/ui'
import { SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import {
  formatBpm,
  formatCadence,
  formatDistanceKm,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
} from '@/lib/format'
import { sectionForField, type ExtractedSession } from '@/lib/schema/extractedSession'

/**
 * What the reader came back with, read-only.
 *
 * **THIS IS F04'S HAND-OFF SURFACE, NOT F05'S REVIEW SCREEN.** F04's contract ends the moment
 * `GET /api/extract/[id]` can return a status and a validated session; what happens to that
 * object next is F05's problem. This component exists so the pipeline is verifiable end to end by
 * a human today — pick three screenshots, watch the numbers come back — without F04 pre-empting
 * the correction UI that is the second-most-important screen in the app.
 *
 * It is safe to show because it saves nothing. D1 is not at risk here: no `runs` row exists (R-1),
 * no `reviewed_at` is written, and the banner says so in as many words. F05 replaces this
 * component wholesale with the per-field correction form; everything above it in the tree stays.
 *
 * The section labels are R-45's provenance, rendered the only way F04 can: **by section, derived**
 * — a field's source screenshot is the photo whose `kind` matches `sectionForField(field)`. No
 * bounding boxes, no new model output, no new column.
 */
export function ExtractedSummary({
  session,
  kinds,
}: {
  session: ExtractedSession
  kinds: ScreenKind[]
}) {
  const fullSplits = session.splits.filter((s) => !s.partial)
  const partial = session.splits.find((s) => s.partial)

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <Eyebrow>Read from your screenshots</Eyebrow>
          <span className="text-[11px] font-semibold text-ink-3">
            {kinds.map((k) => SCREEN_KIND_LABEL[k]).join(' · ')}
          </span>
        </div>

        <div className="mb-5">
          <Stat
            label={session.dateLabel ?? 'Run'}
            value={formatDistanceKm(session.distanceKm)}
            size="hero"
            note={
              [session.location, session.startTime && `from ${session.startTime}`]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-x-4 gap-y-5">
          <Stat label="Duration" value={formatDuration(session.durationSec)} />
          <Stat label="Avg pace" value={formatPace(session.avgPaceSecPerKm, true)} />
          <Stat label="Avg HR" value={formatBpm(session.avgHrBpm)} />
          <Stat label="Max HR" value={formatBpm(session.maxHrBpm)} />
          <Stat label="Cadence" value={formatCadence(session.avgCadenceSpm)} />
          <Stat label="Active" value={formatKcal(session.activeKcal)} />
          <Stat label="Total" value={formatKcal(session.totalKcal)} />
          <Stat label="Elevation" value={formatElevation(session.elevationGainM)} />
          <Stat label="Resting HR" value={formatBpm(session.restingHrBpm)} />
        </div>
      </Card>

      {session.splits.length > 0 && (
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>Splits</Eyebrow>
            <SourceChip section={sectionForField('splits')} />
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
              {session.splits.map((split) => (
                <tr key={split.km} className="border-t border-rule-2">
                  <td className="py-1.5 font-semibold text-ink">
                    {split.km}
                    {/*
                     * D14 — km 11 is 0.67 km. It is marked here and excluded from every pace
                     * average below, because averaging a short final kilometre makes a fade look
                     * like a sprint. F08's splits bar shortens its track for the same reason.
                     */}
                    {split.partial && (
                      <span className="ml-1 text-[10px] font-semibold text-ink-3">part</span>
                    )}
                  </td>
                  <td className="py-1.5 text-ink-2">{formatDuration(split.timeSec)}</td>
                  <td className="py-1.5 text-ink-2">{formatPace(split.paceSecPerKm)}</td>
                  <td className="py-1.5 text-right text-ink-2">{split.hrBpm ?? '—'}</td>
                  <td className="py-1.5 text-right text-ink-2">{split.cadenceSpm ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] font-medium text-ink-3">
            {fullSplits.length} full {fullSplits.length === 1 ? 'kilometre' : 'kilometres'}
            {partial && `, plus a partial km ${partial.km}`}.
          </p>
        </Card>
      )}

      {session.hrZones.length > 0 && (
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>Heart-rate zones</Eyebrow>
            <SourceChip section={sectionForField('hrZones')} />
          </div>
          <ul className="space-y-1.5 text-[13px] tabular-nums">
            {session.hrZones.map((zone) => (
              <li key={zone.zone} className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink">Zone {zone.zone}</span>
                <span className="text-ink-3">
                  {zone.minBpm ?? '<'}
                  {zone.minBpm !== null && zone.maxBpm !== null ? '–' : ''}
                  {zone.maxBpm ?? '+'} bpm
                </span>
                <span className="ml-auto text-ink-2">{formatDuration(zone.durationSec)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {session.postWorkoutHr.length > 0 && (
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <Eyebrow>After the run</Eyebrow>
            <SourceChip section={sectionForField('postWorkoutHr')} />
          </div>
          <div className="flex gap-6">
            {session.postWorkoutHr.map((entry) => (
              <Stat key={entry.label} label={entry.label} value={formatBpm(entry.bpm)} size="sm" />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/** R-46's `scan` chip: this number was read from an image, and this is which image. */
function SourceChip({ section }: { section: ScreenKind }) {
  return (
    <span className="rounded-chip bg-rule-2 px-2 py-0.5 text-[10px] font-semibold text-ink-3">
      from {SCREEN_KIND_LABEL[section]}
    </span>
  )
}
