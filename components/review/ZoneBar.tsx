'use client'

import * as React from 'react'

import { Button } from '@/components/ui'
import { Sheet } from '@/components/ui/Sheet'
import { formatDuration, formatZoneBounds } from '@/lib/format'
import type { DraftZone } from '@/lib/review/draft'
import { parseDurationInput, parseIntInput, toDurationInput, toIntInput } from '@/lib/review/inputs'
import type { ReviewPhoto } from '@/lib/review/loadReview'
import { HonestyChip } from './HonestyChip'
import { ParsedInput } from './ParsedInput'
import { SheetSource } from './ScreenshotStrip'

/**
 * The heart-rate zone distribution, always open, one tap per segment.
 *
 * A stacked bar rather than five rows of numbers because the shape *is* the finding: the
 * canonical run is 90.6% in zones 4 and 5, and that reads instantly as two enormous blocks and
 * slowly as a table. Widths are proportional to duration, so a mis-transcribed zone is often
 * visible before the reviewer reads a single figure — which is a second, independent way of
 * catching what CHK-2 catches arithmetically.
 *
 * The zone hues are the `--z1`..`--z5` tokens, which deliberately do not change in dark mode:
 * they encode data, not chrome.
 */

const ZONE_CLASS: Record<number, string> = {
  1: 'bg-z1',
  2: 'bg-z2',
  3: 'bg-z3',
  4: 'bg-z4',
  5: 'bg-z5',
}

/** Apple prints all five or none; this is the shape of "none, so let me type them". */
function blankZones(): DraftZone[] {
  return [1, 2, 3, 4, 5].map((zone) => ({ zone, durationSec: 0, minBpm: null, maxBpm: null }))
}

export function ZoneBar({
  zones,
  photos,
  flagged,
  editedPaths,
  errors,
  onChange,
  ref,
}: {
  zones: DraftZone[]
  photos: ReviewPhoto[]
  flagged: boolean
  editedPaths: ReadonlySet<string>
  errors: Record<string, string>
  onChange: (zones: DraftZone[]) => void
  ref?: React.Ref<HTMLDivElement>
}) {
  const [editing, setEditing] = React.useState<number | null>(null)
  const total = zones.reduce((sum, z) => sum + z.durationSec, 0)

  const update = (index: number, patch: Partial<DraftZone>) => {
    onChange(zones.map((z, i) => (i === index ? { ...z, ...patch } : z)))
  }

  const rowEdited = (index: number) =>
    ['zone', 'durationSec', 'minBpm', 'maxBpm'].some((f) =>
      editedPaths.has(`hrZones.${index}.${f}`),
    )

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="review-zones-heading"
      className="scroll-mt-4 rounded-card bg-card p-5 shadow-card outline-none"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="review-zones-heading" className="text-[15px] font-semibold text-ink">
          Heart-rate zones
        </h2>
        {flagged && <HonestyChip state="check" />}
      </div>

      {errors['hrZones'] && (
        <p className="mb-3 text-[11px] font-semibold text-red">{errors['hrZones']}</p>
      )}

      {zones.length === 0 ? (
        <div>
          <p className="text-[12px] font-medium text-ink-2">
            No zones — either the heart-rate screenshot was not uploaded, or it could not be read.
          </p>
          <button
            type="button"
            onClick={() => onChange(blankZones())}
            className="mt-3 text-[12px] font-semibold text-accent"
          >
            Enter the five zones by hand
          </button>
        </div>
      ) : (
        <>
          {total > 0 && (
            <div
              className="mb-3 flex h-3 w-full overflow-hidden rounded-pill"
              role="img"
              aria-label={zones
                .map(
                  (z) =>
                    `Zone ${z.zone}, ${formatDuration(z.durationSec)}, ${Math.round((z.durationSec / total) * 100)} percent`,
                )
                .join('. ')}
            >
              {zones.map((zone) => (
                <span
                  key={zone.zone}
                  className={ZONE_CLASS[zone.zone] ?? 'bg-miss'}
                  style={{ width: `${(zone.durationSec / total) * 100}%` }}
                />
              ))}
            </div>
          )}

          <ul className="space-y-1">
            {zones.map((zone, index) => (
              <li key={zone.zone}>
                <button
                  type="button"
                  onClick={() => setEditing(index)}
                  aria-label={
                    `Edit zone ${zone.zone}, ${formatDuration(zone.durationSec)}` +
                    (total > 0 ? `, ${Math.round((zone.durationSec / total) * 100)} percent` : '') +
                    `, ${boundsLabel(zone)}`
                  }
                  className="flex w-full items-center gap-3 rounded-field py-1.5 text-left text-[13px] tabular-nums"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${ZONE_CLASS[zone.zone] ?? 'bg-miss'}`}
                  />
                  <span className="font-semibold text-ink">Z{zone.zone}</span>
                  <span className="text-ink-3">{boundsLabel(zone)}</span>
                  <span className="ml-auto text-ink-2">{formatDuration(zone.durationSec)}</span>
                  <span className="w-9 text-right text-ink-3">
                    {total > 0 ? `${Math.round((zone.durationSec / total) * 100)}%` : '—'}
                  </span>
                  {rowEdited(index) && <HonestyChip state="edited" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing !== null && zones[editing] && (
        <ZoneSheet
          index={editing}
          zone={zones[editing]!}
          photos={photos}
          errors={errors}
          onChange={(patch) => update(editing, patch)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

/**
 * Zone 1 has no floor and zone 5 no ceiling, by design.
 *
 * The spelling moved to `lib/format.ts` as `formatZoneBounds` when F08 landed its own read-only zone
 * bar: two components were formatting the same range two different ways, which is precisely what
 * R-23 exists to prevent. This wrapper stays so the call sites below read the same as before.
 */
function boundsLabel(zone: DraftZone): string {
  return formatZoneBounds(zone.minBpm, zone.maxBpm)
}

function ZoneSheet({
  index,
  zone,
  photos,
  errors,
  onChange,
  onClose,
}: {
  index: number
  zone: DraftZone
  photos: ReviewPhoto[]
  errors: Record<string, string>
  onChange: (patch: Partial<DraftZone>) => void
  onClose: () => void
}) {
  const path = (field: string) => `hrZones.${index}.${field}`
  const isFloorless = zone.zone === 1
  const isCeilingless = zone.zone === 5

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Zone ${zone.zone}`}
      subtitle={boundsLabel(zone)}
      footer={
        <Button variant="primary" size="lg" fullWidth onClick={onClose}>
          Done
        </Button>
      }
    >
      <SheetSource photos={photos} section="heartrate" />

      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold tracking-[0.02em] text-ink-2">Time in zone</span>
            <span className="text-[10px] font-medium text-ink-3">mm:ss</span>
          </div>
          <ParsedInput
            value={zone.durationSec}
            toText={toDurationInput}
            parse={(t) => {
              const r = parseDurationInput(t)
              return r.value === null
                ? { value: zone.durationSec, invalid: true }
                : { value: r.value }
            }}
            onChange={(durationSec) => onChange({ durationSec })}
            aria-label={`Time in zone ${zone.zone}`}
          />
          {errors[path('durationSec')] && (
            <p className="mt-1.5 text-[11px] font-semibold text-red">
              {errors[path('durationSec')]}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1.5 block text-xs font-semibold tracking-[0.02em] text-ink-2">
              Lower bound
            </span>
            {isFloorless ? (
              /* Not a blank input. Zone 1 genuinely has no floor — Apple prints "< 140" — and an
                 empty box invites a reviewer to invent one. Saying so is the correct control. */
              <p className="flex h-[52px] items-center rounded-field bg-paper-2 px-4 text-[13px] font-medium text-ink-3">
                No lower bound
              </p>
            ) : (
              <ParsedInput
                value={zone.minBpm}
                toText={toIntInput}
                parse={(t) => parseIntInput(t, 30, 230)}
                onChange={(minBpm) => onChange({ minBpm })}
                placeholder="—"
                aria-label={`Zone ${zone.zone} lower bound in beats per minute`}
              />
            )}
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold tracking-[0.02em] text-ink-2">
              Upper bound
            </span>
            {isCeilingless ? (
              <p className="flex h-[52px] items-center rounded-field bg-paper-2 px-4 text-[13px] font-medium text-ink-3">
                No upper bound
              </p>
            ) : (
              <ParsedInput
                value={zone.maxBpm}
                toText={toIntInput}
                parse={(t) => parseIntInput(t, 30, 230)}
                onChange={(maxBpm) => onChange({ maxBpm })}
                placeholder="—"
                aria-label={`Zone ${zone.zone} upper bound in beats per minute`}
              />
            )}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
