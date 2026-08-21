'use client'

import type * as React from 'react'

import { CONTROL_CLASS } from '@/components/ui'
import { RUN_INTENT_LABEL, RUN_INTENTS, type ReviewDraft } from '@/lib/review/draft'
import { parseIntInput, toIntInput } from '@/lib/review/inputs'
import { HonestyChip } from './HonestyChip'
import { ParsedInput } from './ParsedInput'

/**
 * The only section that is collapsed by default, and the rule that earns it:
 *
 * **"Collapsed" is reserved for fields with no cross-check and low downstream leverage.** A wrong
 * `elevationGainM` is a wrong number on one card. A wrong split is a wrong pace average, a wrong
 * weekly rollup, a wrong personal record and a wrong badge, forever, silently. Nothing in here has
 * that reach, and none of the four consistency checks can implicate anything in here — so opening
 * it by default would spend the reviewer's attention where it buys the least.
 *
 * It is a controlled `<details>` rather than an uncontrolled one so the parent can force it open
 * the moment a check ever does name a field inside it. No check does today; the wiring exists so
 * that adding one is a one-line change rather than a rediscovery of why the section was shut.
 *
 * `intent` and `note` live here because they are the two `runs` columns with no other writer in
 * the product. They are also the only fields on this screen that were never on a screenshot — so
 * they carry no `scan` chip, and their absence of one is accurate rather than an oversight.
 */

export function MoreDetails({
  draft,
  open,
  onOpenChange,
  editedPaths,
  errors,
  onChange,
}: {
  draft: ReviewDraft
  open: boolean
  onOpenChange: (open: boolean) => void
  editedPaths: ReadonlySet<string>
  errors: Record<string, string>
  onChange: (patch: Partial<ReviewDraft>) => void
}) {
  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-card bg-card px-5 shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        More details
        <span className="text-[12px] font-medium text-ink-3">
          cadence · calories · elevation · HR
        </span>
      </summary>

      <div className="pb-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <SmallField
            label="Avg cadence"
            edited={editedPaths.has('avgCadenceSpm')}
            error={errors['avgCadenceSpm']}
          >
            <ParsedInput
              value={draft.avgCadenceSpm}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 0, 300)}
              onChange={(avgCadenceSpm) => onChange({ avgCadenceSpm })}
              placeholder="144"
              aria-label="Average cadence in steps per minute"
            />
          </SmallField>

          <SmallField
            label="Elevation"
            edited={editedPaths.has('elevationGainM')}
            error={errors['elevationGainM']}
          >
            <ParsedInput
              value={draft.elevationGainM}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 0, 20_000)}
              onChange={(elevationGainM) => onChange({ elevationGainM })}
              placeholder="15"
              aria-label="Elevation gain in metres"
            />
          </SmallField>

          <SmallField
            label="Active kcal"
            edited={editedPaths.has('activeKcal')}
            error={errors['activeKcal']}
          >
            <ParsedInput
              value={draft.activeKcal}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 0, 20_000)}
              onChange={(activeKcal) => onChange({ activeKcal })}
              placeholder="646"
              aria-label="Active calories"
            />
          </SmallField>

          <SmallField
            label="Total kcal"
            edited={editedPaths.has('totalKcal')}
            error={errors['totalKcal']}
          >
            <ParsedInput
              value={draft.totalKcal}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 0, 20_000)}
              onChange={(totalKcal) => onChange({ totalKcal })}
              placeholder="747"
              aria-label="Total calories"
            />
          </SmallField>

          <SmallField
            label="Avg HR"
            edited={editedPaths.has('avgHrBpm')}
            error={errors['avgHrBpm']}
          >
            <ParsedInput
              value={draft.avgHrBpm}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 40, 230)}
              onChange={(avgHrBpm) => onChange({ avgHrBpm })}
              placeholder="173"
              aria-label="Average heart rate"
            />
          </SmallField>

          {/*
           * R-3 makes this field carry more weight than its position suggests: `runs.max_hr` is
           * what the observed-first HRmax resolver reads (roadmap §4.4 rule 2), and a run's own
           * max counts toward its own %HRmax. A misread 189 here moves the denominator of every
           * effort percentage the app will ever show for this runner.
           */}
          <SmallField
            label="Max HR"
            edited={editedPaths.has('maxHrBpm')}
            error={errors['maxHrBpm']}
          >
            <ParsedInput
              value={draft.maxHrBpm}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 40, 230)}
              onChange={(maxHrBpm) => onChange({ maxHrBpm })}
              placeholder="189"
              aria-label="Maximum heart rate"
            />
          </SmallField>

          <SmallField
            label="Resting HR"
            edited={editedPaths.has('restingHrBpm')}
            error={errors['restingHrBpm']}
          >
            <ParsedInput
              value={draft.restingHrBpm}
              toText={toIntInput}
              parse={(t) => parseIntInput(t, 30, 120)}
              onChange={(restingHrBpm) => onChange({ restingHrBpm })}
              placeholder="72"
              aria-label="Resting heart rate"
            />
          </SmallField>
        </div>

        {/* R-9's two columns, edited as what they are: readings taken after the run stopped. */}
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold text-ink-3">After the run</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <SmallField
              label="At the end"
              edited={editedPaths.has('postWorkoutHr.0.bpm')}
              error={errors['postWorkoutHr.0.bpm']}
            >
              <ParsedInput
                value={draft.postWorkoutHr[0]?.bpm ?? null}
                toText={toIntInput}
                parse={(t) => parseIntInput(t, 40, 230)}
                onChange={(bpm) => onChange({ postWorkoutHr: withHr(draft, 0, 'End', bpm) })}
                placeholder="185"
                aria-label="Heart rate at the end of the run"
              />
            </SmallField>
            <SmallField
              label="One minute later"
              edited={editedPaths.has('postWorkoutHr.1.bpm')}
              error={errors['postWorkoutHr.1.bpm']}
            >
              <ParsedInput
                value={draft.postWorkoutHr[1]?.bpm ?? null}
                toText={toIntInput}
                parse={(t) => parseIntInput(t, 40, 230)}
                onChange={(bpm) => onChange({ postWorkoutHr: withHr(draft, 1, '1 MIN', bpm) })}
                placeholder="162"
                aria-label="Heart rate one minute after the run"
              />
            </SmallField>
          </div>
          <p className="mt-2 text-[11px] font-medium text-ink-3">
            The gap between these two is your one-minute heart-rate recovery.
          </p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold text-ink-3">What was this run for?</p>
          <div className="flex flex-wrap gap-2">
            {RUN_INTENTS.map((intent) => {
              const selected = draft.intent === intent
              return (
                <button
                  key={intent}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ intent: selected ? null : intent })}
                  className={
                    selected
                      ? 'rounded-pill bg-ink px-3.5 py-2 text-[12px] font-semibold text-card'
                      : 'rounded-pill bg-paper-2 px-3.5 py-2 text-[12px] font-semibold text-ink-2'
                  }
                >
                  {RUN_INTENT_LABEL[intent]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="review-note"
            className="mb-1.5 block text-[11px] font-semibold text-ink-3"
          >
            Note
          </label>
          <input
            id="review-note"
            type="text"
            value={draft.note ?? ''}
            onChange={(event) => onChange({ note: event.target.value || null })}
            placeholder="Humid, legs still heavy from Tuesday"
            className={CONTROL_CLASS}
          />
          {errors['note'] && (
            <p className="mt-1.5 text-[11px] font-semibold text-red">{errors['note']}</p>
          )}
        </div>
      </div>
    </details>
  )
}

/**
 * The post-workout array is positional (R-9: `[0]` and `[1]` become two named columns), so
 * clearing the first reading must not silently promote the second into its place. Slots are held
 * open with a zero-bpm placeholder rather than compacted.
 */
function withHr(draft: ReviewDraft, index: number, label: string, bpm: number | null) {
  const next = [...draft.postWorkoutHr]
  while (next.length <= index) next.push({ label: next.length === 0 ? 'End' : '1 MIN', bpm: null })
  next[index] = { label, bpm }
  // Both cleared means neither reading exists — collapse rather than store two empty rows.
  while (next.length > 0 && next[next.length - 1]!.bpm === null) next.pop()
  return next
}

function SmallField({
  label,
  edited,
  error,
  children,
}: {
  label: string
  edited: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink-3">{label}</span>
        {edited && <HonestyChip state="edited" />}
      </div>
      {children}
      {error && <p className="mt-1.5 text-[11px] font-semibold text-red">{error}</p>}
    </div>
  )
}
