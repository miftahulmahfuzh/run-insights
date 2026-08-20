'use client'

import { useActionState } from 'react'

import { Button, Field, NumberInput } from '@/components/ui'
import {
  IDLE_PROFILE_FORM_STATE,
  type ProfileFormState,
  type ProfileFormValues,
} from '@/lib/profile/schema'

export type ProfileFormMode = 'onboarding' | 'edit'

export interface ProfileFormProps {
  mode: ProfileFormMode
  values: ProfileFormValues
  /** `saveOnboardingAction` or `updateProfileAction` — both `(prev, formData) => state`. */
  action: (prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>
  /** Only in onboarding mode: `skipOnboardingAction`, posted by its own form. */
  skipAction?: () => Promise<void>
}

/**
 * One form, two modes. Onboarding renders it empty with a "Skip for now"; `/me` renders it
 * pre-filled without one.
 *
 * IT ASKS FOR AGE, NOT BIRTH YEAR, in both modes — and it always shows the *current*, freshly
 * derived age, so nothing goes stale. Editing twice in the same year is idempotent; editing a year
 * later shifts the stored birth year only if the runner retypes a now-different number, which they
 * would, because the field already shows what the app believes today. See `lib/metrics/age.ts` for
 * why the column and the input are deliberately different shapes.
 *
 * EVERY FIELD IS OPTIONAL. There is no required marker anywhere on this form and no submit-blocking
 * validation — blank is a valid answer to all five questions, and the app degrades honestly rather
 * than guessing (D11).
 */
export function ProfileForm({ mode, values, action, skipAction }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(action, IDLE_PROFILE_FORM_STATE)
  const errors = state.status === 'error' ? state.fieldErrors : {}
  const defaultOf = (value: number | null) => (value == null ? '' : String(value))

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field
          label="Age"
          hint="Used for the heart-rate estimate only."
          error={errors.age}
          suffix="years"
        >
          <NumberInput
            name="age"
            defaultValue={defaultOf(values.age)}
            placeholder="—"
            maxLength={3}
          />
        </Field>

        <Field label="Height" error={errors.heightCm} suffix="cm">
          <NumberInput
            name="heightCm"
            defaultValue={defaultOf(values.heightCm)}
            placeholder="—"
            maxLength={3}
          />
        </Field>

        <Field label="Weight" error={errors.weightKg} suffix="kg">
          <NumberInput
            name="weightKg"
            decimal
            defaultValue={defaultOf(values.weightKg)}
            placeholder="—"
            maxLength={5}
          />
        </Field>

        {/* The de-emphasised half. Both fields below are things most people do not know, and the
            copy says so rather than implying they should. */}
        <div className="mt-2 border-t border-rule pt-5">
          <p className="mb-4 text-[11px] font-medium text-ink-3">
            Only if you happen to know them. Both are safe to leave blank.
          </p>

          <div className="flex flex-col gap-4">
            <Field
              label="Resting heart rate"
              hint="What your watch shows first thing in the morning."
              error={errors.restingHr}
              suffix="bpm"
            >
              <NumberInput
                name="restingHr"
                defaultValue={defaultOf(values.restingHr)}
                placeholder="—"
                maxLength={3}
              />
            </Field>

            <Field
              label="Measured max heart rate"
              hint="A real number from a test or a hard session — not an estimate. Leave blank and we work one out."
              error={errors.maxHr}
              suffix="bpm"
            >
              <NumberInput
                name="maxHr"
                defaultValue={defaultOf(values.maxHr)}
                placeholder="—"
                maxLength={3}
              />
            </Field>
          </div>
        </div>

        {state.status === 'error' && (
          <p role="alert" className="text-[13px] font-semibold text-red">
            {state.message}
          </p>
        )}
        {state.status === 'saved' && (
          <p role="status" className="text-[13px] font-semibold text-z2">
            Saved.
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={isPending}
          className="mt-2"
        >
          {mode === 'onboarding' ? 'Save and start' : 'Save'}
        </Button>
      </form>

      {mode === 'onboarding' && skipAction && (
        // Its own <form>, not a button inside the one above: skipping must not carry the typed
        // values along, and a nested form is invalid HTML.
        <form action={skipAction} className="mt-2">
          <Button type="submit" variant="ghost" size="lg" fullWidth>
            Skip for now
          </Button>
        </form>
      )}
    </div>
  )
}
