'use client'

import * as React from 'react'

import { Button } from '@/components/ui'
import { Sheet } from '@/components/ui/Sheet'
import { formatBpm, formatDuration, formatPace } from '@/lib/format'
import type { DraftSplit } from '@/lib/review/draft'
import {
  parseDurationInput,
  parseIntInput,
  parsePaceInput,
  toDurationInput,
  toIntInput,
  toPaceInput,
} from '@/lib/review/inputs'
import type { ReviewPhoto } from '@/lib/review/loadReview'
import { HonestyChip } from './HonestyChip'
import { ParsedInput } from './ParsedInput'
import { SheetSource } from './ScreenshotStrip'

/**
 * **Always open, never collapsed.** The splits table is dense and that is the point — the design
 * brief is explicit that "the interesting screens are the ones that make the density legible", and
 * hiding eleven rows behind a disclosure would defeat the review. This is also exactly where the
 * historically-observed error lives: `IMPLEMENTATION_PLAN.md` §1.3's one miss in 108 fields was a
 * split pace, read as 436 s off a cell that plainly says `6'36"`.
 *
 * Each row is a summary; tapping one opens the sheet with that row's fields and the splits
 * screenshot pinned above them (R-45). Rows are never edited in place — a table of 55 tiny inputs
 * is unhittable on a phone and unreadable on any device.
 */

export function SplitsTable({
  splits,
  photos,
  flagged,
  editedPaths,
  errors,
  onChange,
  ref,
}: {
  splits: DraftSplit[]
  photos: ReviewPhoto[]
  /** True when CHK-1 or CHK-4 is pointing at this block. */
  flagged: boolean
  /** Dot-paths already corrected by hand in this session — the `edited` chip (R-46). */
  editedPaths: ReadonlySet<string>
  errors: Record<string, string>
  onChange: (splits: DraftSplit[]) => void
  ref?: React.Ref<HTMLDivElement>
}) {
  const [editing, setEditing] = React.useState<number | null>(null)

  const update = (index: number, patch: Partial<DraftSplit>) => {
    onChange(splits.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const remove = (index: number) => {
    onChange(splits.filter((_, i) => i !== index))
    setEditing(null)
  }

  const append = () => {
    const last = splits[splits.length - 1]
    onChange([
      ...splits,
      {
        km: (last?.km ?? 0) + 1,
        timeSec: last?.timeSec ?? 0,
        paceSecPerKm: last?.paceSecPerKm ?? 0,
        hrBpm: null,
        cadenceSpm: null,
        partial: false,
      },
    ])
    setEditing(splits.length)
  }

  const rowEdited = (index: number) =>
    ['km', 'timeSec', 'paceSecPerKm', 'hrBpm', 'cadenceSpm', 'partial'].some((f) =>
      editedPaths.has(`splits.${index}.${f}`),
    )

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="review-splits-heading"
      className="scroll-mt-4 rounded-card bg-card p-5 shadow-card outline-none"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="review-splits-heading" className="text-[15px] font-semibold text-ink">
          Splits
        </h2>
        <div className="flex items-center gap-2">
          {flagged && <HonestyChip state="check" />}
          <span className="text-[11px] font-semibold text-ink-3">{splits.length}</span>
        </div>
      </div>

      {errors['splits'] && (
        <p className="mb-3 text-[11px] font-semibold text-red">{errors['splits']}</p>
      )}

      {splits.length === 0 ? (
        <p className="text-[12px] font-medium text-ink-2">
          No splits — either the splits screenshot was not uploaded, or this run has none. You can
          add rows by hand.
        </p>
      ) : (
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-ink-3">
              <th scope="col" className="pb-2 font-semibold">
                Km
              </th>
              <th scope="col" className="pb-2 font-semibold">
                Time
              </th>
              <th scope="col" className="pb-2 font-semibold">
                Pace
              </th>
              <th scope="col" className="pb-2 text-right font-semibold">
                HR
              </th>
              <th scope="col" className="pb-2 text-right font-semibold">
                Cad
              </th>
              <th scope="col" className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {splits.map((split, index) => (
              <tr
                key={`${split.km}-${index}`}
                className={
                  split.partial
                    ? 'border-t border-l-2 border-rule-2 border-l-warn'
                    : 'border-t border-rule-2'
                }
              >
                <td className="py-1.5 pl-1.5 font-semibold text-ink">{split.km}</td>
                <td className="py-1.5 text-ink-2">{formatDuration(split.timeSec)}</td>
                <td className="py-1.5 text-ink-2">{formatPace(split.paceSecPerKm)}</td>
                <td className="py-1.5 text-right text-ink-2">{split.hrBpm ?? '—'}</td>
                <td className="py-1.5 text-right text-ink-2">{split.cadenceSpm ?? '—'}</td>
                <td className="py-1.5 pl-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(index)}
                    /* The label quotes the row's own values. "Edit row 11" eleven times over is
                       useless to a VoiceOver user scanning for the number that looks wrong. */
                    aria-label={
                      `Edit kilometre ${split.km}` +
                      (split.partial ? ', partial' : '') +
                      `, ${formatDuration(split.timeSec)}, ${formatPace(split.paceSecPerKm, true)}` +
                      (split.hrBpm ? `, ${formatBpm(split.hrBpm)}` : '')
                    }
                    className="text-[12px] font-semibold text-accent"
                  >
                    {rowEdited(index) ? <HonestyChip state="edited" /> : 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-ink-3">
          {/* D14, said out loud on the screen that owns the flag. */}
          {splits.some((s) => s.partial)
            ? 'The partial final kilometre is marked and is left out of every pace average.'
            : 'Mark a short final kilometre as partial so it is left out of pace averages.'}
        </p>
        <button
          type="button"
          onClick={append}
          className="shrink-0 text-[12px] font-semibold text-accent"
        >
          Add a row
        </button>
      </div>

      {editing !== null && splits[editing] && (
        <SplitSheet
          index={editing}
          split={splits[editing]!}
          photos={photos}
          errors={errors}
          onChange={(patch) => update(editing, patch)}
          onDelete={() => remove(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function SplitSheet({
  index,
  split,
  photos,
  errors,
  onChange,
  onDelete,
  onClose,
}: {
  index: number
  split: DraftSplit
  photos: ReviewPhoto[]
  errors: Record<string, string>
  onChange: (patch: Partial<DraftSplit>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const path = (field: string) => `splits.${index}.${field}`

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Km ${split.km}`}
      subtitle={split.partial ? 'Partial kilometre' : undefined}
      footer={
        <div className="flex gap-3">
          <Button variant="destructive" size="lg" onClick={onDelete}>
            Delete row
          </Button>
          <Button variant="primary" size="lg" fullWidth onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <SheetSource photos={photos} section="splits" />

      <div className="space-y-4">
        <SheetField label="Kilometre" error={errors[path('km')]}>
          <ParsedInput
            value={split.km}
            toText={toIntInput}
            parse={(t) => {
              const r = parseIntInput(t, 1, 500)
              return r.value === null ? { value: split.km, invalid: true } : { value: r.value }
            }}
            onChange={(km) => onChange({ km })}
            aria-label="Kilometre number"
          />
        </SheetField>

        <SheetField
          label="Time"
          hint="mm:ss, as the splits table prints it"
          error={errors[path('timeSec')]}
        >
          <ParsedInput
            value={split.timeSec}
            toText={toDurationInput}
            parse={(t) => {
              const r = parseDurationInput(t)
              return r.value === null ? { value: split.timeSec, invalid: true } : { value: r.value }
            }}
            onChange={(timeSec) => onChange({ timeSec })}
            aria-label="Split time"
          />
        </SheetField>

        <SheetField label="Pace" hint="mm:ss per kilometre" error={errors[path('paceSecPerKm')]}>
          <ParsedInput
            value={split.paceSecPerKm}
            toText={toPaceInput}
            parse={(t) => {
              const r = parsePaceInput(t)
              return r.value === null
                ? { value: split.paceSecPerKm, invalid: true }
                : { value: r.value }
            }}
            onChange={(paceSecPerKm) => onChange({ paceSecPerKm })}
            aria-label="Split pace"
          />
        </SheetField>

        <div className="grid grid-cols-2 gap-3">
          <SheetField label="Heart rate" error={errors[path('hrBpm')]}>
            <ParsedInput
              value={split.hrBpm}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 40, 230)}
              onChange={(hrBpm) => onChange({ hrBpm })}
              placeholder="—"
              aria-label="Split heart rate in beats per minute"
            />
          </SheetField>
          <SheetField label="Cadence" error={errors[path('cadenceSpm')]}>
            <ParsedInput
              value={split.cadenceSpm}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 0, 300)}
              onChange={(cadenceSpm) => onChange({ cadenceSpm })}
              placeholder="—"
              aria-label="Split cadence in steps per minute"
            />
          </SheetField>
        </div>

        {/*
         * D14's control, first-class and never buried. The roadmap gives this boolean its own
         * decision because a silent misclassification corrupts every average downstream: km 11 of
         * the canonical run is 288 s, faster than every full kilometre in the table, and anything
         * that reads it as a full km turns a visible fade into a closing sprint.
         */}
        <label className="flex items-start gap-3 rounded-field bg-paper-2 p-4">
          <input
            type="checkbox"
            checked={split.partial}
            onChange={(event) => onChange({ partial: event.target.checked })}
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[14px] font-semibold text-ink">Partial kilometre</span>
            <span className="mt-0.5 block text-[12px] font-medium text-ink-2">
              This row is shorter than a full kilometre. It is stored and shown, and left out of
              every pace average — its short time would otherwise read as a sprint finish.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  )
}

function SheetField({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-[0.02em] text-ink-2">{label}</span>
        {hint && <span className="text-[10px] font-medium text-ink-3">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1.5 text-[11px] font-semibold text-red">{error}</p>}
    </div>
  )
}
