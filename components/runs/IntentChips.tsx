'use client'

import * as React from 'react'

import { Chip } from '@/components/ui/Chip'
import type { RunIntent } from '@/lib/db/schema'
import { setRunIntentAction } from '@/lib/runs/actions'

/**
 * §2.2.2 — the intent chip row. The only mutation on the run detail page besides Share.
 *
 * Four outline chips when unset; once set, **the chosen chip alone remains, filled**. This is a
 * fact about the run, not a filter, and a row of three greyed alternatives next to the answer
 * invites second-guessing a decision the runner already made.
 *
 * **Tapping the filled chip clears it.** The plan says "tap to set once", and once is the intent —
 * but a mis-tap on a phone must be undoable, and the alternative (a run permanently labelled
 * `race` because a thumb landed 8px left) is worse than a slightly less final-feeling control.
 * `aria-pressed` already announces it as a toggle, so this costs no extra affordance.
 *
 * `useOptimistic` rather than a `useState` mirror of the prop: the chip fills the instant it is
 * tapped, and React reverts to the server's value when the transition ends — automatically, whether
 * the action succeeded (the prop has changed, so nothing moves) or failed (the prop has not, so the
 * chip snaps back). A `useState` copy kept in step with an effect is the version of this that lints,
 * re-renders twice, and gets the failure case wrong.
 *
 * No `<form>`: there is no payload to validate and nowhere to navigate, so the whole interaction is
 * "the chip fills, and the server catches up".
 */

const OPTIONS: { value: RunIntent; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'long', label: 'Long' },
  { value: 'race', label: 'Race' },
]

export function IntentChips({ runId, intent }: { runId: string; intent: RunIntent | null }) {
  const [pending, startTransition] = React.useTransition()
  const [value, setOptimisticValue] = React.useOptimistic(intent)
  const [error, setError] = React.useState<string | null>(null)

  const choose = (next: RunIntent | null) => {
    setError(null)
    startTransition(async () => {
      // Inside the transition, so React knows to hold this value only until the action settles.
      setOptimisticValue(next)
      const result = await setRunIntentAction(runId, next)
      if (!result.ok) setError(result.error)
    })
  }

  const shown = value == null ? OPTIONS : OPTIONS.filter((o) => o.value === value)

  return (
    <div>
      <div className="flex flex-wrap gap-2" aria-busy={pending || undefined}>
        {shown.map((option) => (
          <Chip
            key={option.value}
            selected={value === option.value}
            disabled={pending}
            onClick={() => choose(value === option.value ? null : option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-[11px] font-medium text-ink-3">
        {value == null
          ? 'What was this run meant to be? It changes how the analysis reads it.'
          : 'Tap again to clear.'}
      </p>
      {error && <p className="mt-1 text-[11px] font-semibold text-red">{error}</p>}
    </div>
  )
}
