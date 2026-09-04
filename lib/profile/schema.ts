import { z } from 'zod'

import { SEX_VALUES, type Sex } from '@/lib/db/schema'
import { birthYearFromAge } from '@/lib/metrics/age'

/**
 * The profile form's validation surface, and the single place `age -> birth_year` is converted.
 *
 * EVERY FIELD IS OPTIONAL, and that is the mechanism behind "onboarding is skippable" (roadmap §7
 * of IMPLEMENTATION_PLAN, D11's degradation matrix). Skipping is not a separate code path — it is
 * the normal path with every field left blank. There is no submit-blocking validation that requires
 * a value; there is only format validation on values actually entered.
 *
 * SANITY, NOT COACHING. These schemas validate *shape*. Resist adding anything that looks like
 * advice ("that resting heart rate looks high") — commentary belongs to F07's narrative layer,
 * working from stored values, never to a form.
 */

/** Blank number inputs arrive from FormData as `''`, which `z.coerce.number()` would turn into 0. */
const blankToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value)

/**
 * Weight is the one non-integer column in the database (`numeric(4,1)`), so it is the one field
 * that can be entered at a precision the column cannot hold. Rounding to one decimal here rather
 * than rejecting a `multipleOf(0.1)` violation is the friendlier direction to be wrong in: someone
 * who types 55.55 means 55.6, not "please show me an error", and Postgres would round it anyway.
 * Doing it in the schema means the value the app validates is the value the column stores.
 */
const toOneDecimal = (value: number) => Math.round(value * 10) / 10

/**
 * What the onboarding and `/me` FORMS collect. Age, not birth year — a human types "I'm 30", not
 * "I was born in 1996".
 */
export const profileFormSchema = z
  .object({
    age: z.preprocess(blankToUndefined, z.coerce.number().int().min(10).max(100).optional()),
    heightCm: z.preprocess(blankToUndefined, z.coerce.number().int().min(100).max(250).optional()),
    /**
     * Optional like everything else on this form (D11), and `''` is a real submission: the
     * radios ship with none selected, so an untouched form posts no `sex` key at all and
     * `blankToUndefined` turns a cleared one into the same thing.
     *
     * `z.enum` over the schema's own `SEX_VALUES`, so the form's domain and the column's domain
     * cannot drift — one tuple, two consumers.
     */
    sex: z.preprocess(blankToUndefined, z.enum(SEX_VALUES).optional()),
    weightKg: z.preprocess(
      blankToUndefined,
      z.coerce.number().min(20).max(300).transform(toOneDecimal).optional(),
    ),
    restingHr: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).max(120).optional()),
    /**
     * The upper bound is 230, not something tighter. This field is explicitly *measured* (roadmap
     * §4.3: "MEASURED only. Never write an estimate here") — a lab VO2max test or a hard interval
     * session can genuinely produce values in the low 200s for a young athlete. The bound exists to
     * catch a fat-fingered "1890", not to second-guess a real reading.
     */
    maxHr: z.preprocess(blankToUndefined, z.coerce.number().int().min(100).max(230).optional()),
  })
  .refine((v) => v.restingHr == null || v.maxHr == null || v.restingHr < v.maxHr, {
    message: 'Resting heart rate must be below your max.',
    path: ['restingHr'],
  })

export type ProfileFormInput = z.infer<typeof profileFormSchema>

/**
 * What `lib/db` writes to `profiles`. `birth_year` replaces `age`; everything else passes through.
 * Nullable rather than optional throughout, because clearing a field on the edit form must actually
 * clear the column — an omitted key would silently keep the old value.
 */
export const profileWriteSchema = z.object({
  birthYear: z.number().int().nullable(),
  heightCm: z.number().int().min(100).max(250).nullable(),
  weightKg: z.number().min(20).max(300).nullable(),
  sex: z.enum(SEX_VALUES).nullable(),
  restingHr: z.number().int().min(30).max(120).nullable(),
  maxHr: z.number().int().min(100).max(230).nullable(),
})

export type ProfileWrite = z.infer<typeof profileWriteSchema>

/**
 * The single `age -> birth_year` conversion point in the codebase. Pure, and unit-tested, so it can
 * be tested once instead of trusted at every call site.
 *
 * `now` is a parameter for the same reason `ageFromBirthYear`'s is: a test that pins a date beats a
 * test that mocks global time.
 */
export function toProfileWrite(input: ProfileFormInput, now: Date = new Date()): ProfileWrite {
  return {
    birthYear: input.age != null ? birthYearFromAge(input.age, now) : null,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    sex: input.sex ?? null,
    restingHr: input.restingHr ?? null,
    maxHr: input.maxHr ?? null,
  }
}

/** The shape `/onboarding` and `/me` render back into their inputs. */
export interface ProfileFormValues {
  age: number | null
  heightCm: number | null
  weightKg: number | null
  sex: Sex | null
  restingHr: number | null
  maxHr: number | null
}

/**
 * What a Server Action hands back to `useActionState`. Declared here rather than in `actions.ts`
 * because that file is `'use server'`, where every export must be an async function.
 */
export type ProfileFormState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string; fieldErrors: Record<string, string> }

export const IDLE_PROFILE_FORM_STATE: ProfileFormState = { status: 'idle' }

/** Flattens a Zod error into the `{ fieldName: firstMessage }` shape `<Field error>` expects. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !(key in out)) out[key] = issue.message
  }
  return out
}
