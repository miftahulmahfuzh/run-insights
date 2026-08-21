'use client'

import type * as React from 'react'

import { CONTROL_CLASS } from '@/components/ui'
import { formatPace } from '@/lib/format'
import type { ReviewDraft } from '@/lib/review/draft'
import {
  parseDistanceInput,
  parseDurationInput,
  parsePaceInput,
  toDistanceInput,
  toDurationInput,
  toPaceInput,
} from '@/lib/review/inputs'
import { HonestyChip } from './HonestyChip'
import { ParsedInput } from './ParsedInput'

/**
 * **Always open**, because these five values are what a run *is* — you cannot identify a run
 * without them, so they are always worth one glance, and there is no version of this screen where
 * hiding them is defensible.
 *
 * They are also the three CHK-3 inputs (distance, pace, duration) plus the two the date-guess
 * depends on, which is why they are edited in place rather than behind a sheet: a check that says
 * "check the distance, the pace and the duration" wants all three visible together, and a sheet
 * would show them one at a time.
 *
 * ── THE DATE ────────────────────────────────────────────────────────────────────────────────
 * `runs.occurred_on` is NOT NULL and Apple's summary screen prints no year ("Thu, 20 Aug").
 * `resolveOccurredOn` guesses the only way it safely can — a run cannot be in the future — and
 * the label it guessed from sits right under the input as the evidence for that guess. The guess
 * is diffed like any other field, so "how often is it wrong" is measurable rather than assumed.
 */

export function HeroFields({
  draft,
  flaggedPaths,
  editedPaths,
  errors,
  onChange,
  distanceRef,
}: {
  draft: ReviewDraft
  flaggedPaths: ReadonlySet<string>
  editedPaths: ReadonlySet<string>
  errors: Record<string, string>
  onChange: (patch: Partial<ReviewDraft>) => void
  distanceRef?: React.Ref<HTMLInputElement>
}) {
  const chipFor = (path: string) =>
    flaggedPaths.has(path) ? 'check' : editedPaths.has(path) ? 'edited' : 'scan'

  return (
    <section
      aria-labelledby="review-hero-heading"
      className="scroll-mt-4 rounded-card bg-card p-5 shadow-card"
    >
      <h2 id="review-hero-heading" className="sr-only">
        The run
      </h2>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <HeroField
          label="Distance"
          suffix="km"
          chip={chipFor('distanceKm')}
          error={errors['distanceKm']}
        >
          <ParsedInput
            ref={distanceRef}
            value={draft.distanceKm}
            toText={toDistanceInput}
            parse={parseDistanceInput}
            onChange={(distanceKm) => onChange({ distanceKm })}
            inputMode="decimal"
            placeholder="10.67"
            aria-label="Distance in kilometres"
            className="pr-10"
          />
        </HeroField>

        <HeroField
          label="Duration"
          hint="h:mm:ss"
          chip={chipFor('durationSec')}
          error={errors['durationSec']}
        >
          <ParsedInput
            value={draft.durationSec}
            toText={toDurationInput}
            parse={parseDurationInput}
            onChange={(durationSec) => onChange({ durationSec })}
            mask="hh:mm:ss"
            deferError
            placeholder="1:18:36"
            aria-label="Duration"
          />
        </HeroField>

        <HeroField
          label="Average pace"
          hint="mm:ss / km"
          chip={chipFor('avgPaceSecPerKm')}
          error={errors['avgPaceSecPerKm']}
        >
          <ParsedInput
            value={draft.avgPaceSecPerKm}
            toText={toPaceInput}
            parse={parsePaceInput}
            onChange={(avgPaceSecPerKm) => onChange({ avgPaceSecPerKm })}
            mask="mm:ss"
            deferError
            placeholder="7:22"
            aria-label="Average pace, minutes and seconds per kilometre"
          />
          {draft.avgPaceSecPerKm !== null && (
            <p className="mt-1.5 text-[11px] font-medium text-ink-3">
              {formatPace(draft.avgPaceSecPerKm, true)}
            </p>
          )}
        </HeroField>

        <HeroField label="Date" chip={chipFor('occurredOn')} error={errors['occurredOn']}>
          <input
            type="date"
            value={draft.occurredOn}
            onChange={(event) => onChange({ occurredOn: event.target.value })}
            aria-label="The day this run happened"
            className={CONTROL_CLASS}
          />
          {draft.dateLabel && (
            <p className="mt-1.5 text-[11px] font-medium text-ink-3">
              The screenshot says “{draft.dateLabel}” — no year, so this is our best guess.
            </p>
          )}
        </HeroField>

        <HeroField label="Started" chip={chipFor('startTime')} error={errors['startTime']}>
          <ClockInput
            value={draft.startTime}
            onChange={(startTime) => onChange({ startTime })}
            label="Start time"
          />
        </HeroField>

        <HeroField label="Ended" chip={chipFor('endTime')} error={errors['endTime']}>
          <ClockInput
            value={draft.endTime}
            onChange={(endTime) => onChange({ endTime })}
            label="End time"
          />
        </HeroField>

        <div className="col-span-2">
          <HeroField label="Location" chip={chipFor('location')} error={errors['location']}>
            <input
              type="text"
              value={draft.location ?? ''}
              onChange={(event) => onChange({ location: event.target.value || null })}
              placeholder="Tangerang"
              aria-label="Where this run happened"
              className={CONTROL_CLASS}
            />
          </HeroField>
        </div>
      </div>
    </section>
  )
}

/**
 * **The platform's own rolling clock, which is the whole reason this is native.** A hand-rolled
 * text field here was typeable — `parseClockInput` stripped non-digits, so `0707` worked on the
 * numeric keypad — but it looked impossible, and a control that looks impossible on a correction
 * screen is a control nobody corrects with.
 *
 * The formats already agree, which is what makes this a deletion rather than a port:
 * `type="time"` emits zero-padded `HH:mm` or `''`, and `lib/review/schema.ts`'s `clockTime`
 * requires precisely zero-padded `HH:mm` — it rejects `'7:07'`. **The native control cannot
 * produce the one shape the schema refuses**, so there is no parse step at all.
 *
 * The Date field two cells up is already a native `type="date"`, so this ends the state where two
 * of three date/time fields were native and one was not. The cost is the same bargain that field
 * already struck: the browser owns the control's internals, so styling is height, font and colour.
 * No `hint` either — the value is always 24h but the DISPLAY follows the device locale, so a
 * "24h" label would be a promise this component does not control.
 */
function ClockInput({
  value,
  onChange,
  label,
}: {
  value: string | null
  onChange: (value: string | null) => void
  label: string
}) {
  return (
    <input
      type="time"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      aria-label={label}
      className={CONTROL_CLASS}
    />
  )
}

function HeroField({
  label,
  hint,
  suffix,
  chip,
  error,
  children,
}: {
  label: string
  hint?: string
  suffix?: string
  chip: 'scan' | 'check' | 'edited'
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink-3">{label}</span>
        {/* The `scan` chip is suppressed on individual hero fields on purpose: eighteen identical
            "scan" pills is noise, and the section already says everything here was read from a
            screenshot. Only the two states that mean something specific are drawn. */}
        {chip === 'scan' ? (
          hint && <span className="text-[10px] font-medium text-ink-3">{hint}</span>
        ) : (
          <HonestyChip state={chip} />
        )}
      </div>
      <div className="relative">
        {children}
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-4 flex h-[52px] items-center text-[13px] font-medium text-ink-3"
          >
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="mt-1.5 text-[11px] font-semibold text-red">{error}</p>}
    </div>
  )
}
