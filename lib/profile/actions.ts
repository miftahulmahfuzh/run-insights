'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUserId } from '@/lib/auth/requireUserId'
import { upsertProfile } from '@/lib/db/queries'
import { fieldErrorsOf, profileFormSchema, toProfileWrite, type ProfileFormState } from './schema'

/**
 * The three writes against `profiles`. Each opens with `requireUserId()` — INVARIANT A, and the
 * reason `upsertProfile` takes a userId it can trust.
 *
 * `onboarded_at` means "made a decision about onboarding", not "filled in every field". It is set
 * by both a filled-in form and a skipped one, and a later profile edit never touches it.
 */

function parseForm(formData: FormData) {
  // Object.fromEntries also picks up React's `$ACTION_*` keys; the Zod object strips them.
  return profileFormSchema.safeParse(Object.fromEntries(formData))
}

/**
 * `/onboarding`'s primary submit. Redirects to `/` on success — `/` gates on `onboarded_at`, which
 * is now set, so the runner lands on the runs list rather than back on the form.
 *
 * `redirect()` throws NEXT_REDIRECT and therefore sits outside any try/catch, and after the
 * `revalidatePath` calls that make `/` and `/me` re-read the row.
 */
export async function saveOnboardingAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const userId = await requireUserId()

  const parsed = parseForm(formData)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Some values look off — check the numbers.',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  await upsertProfile(userId, { ...toProfileWrite(parsed.data), onboardedAt: new Date() })

  revalidatePath('/')
  revalidatePath('/me')
  redirect('/')
}

/**
 * Bound to "Skip for now". This is `saveOnboardingAction`'s behaviour on an empty form, exposed as
 * its own affordance so skipping does not require tabbing through five blank inputs to find a
 * submit button — not a separate code path.
 *
 * It deliberately writes only `onboarded_at`, leaving every other column untouched: a runner who
 * fills in `/me` and later revisits `/onboarding` must not have their data wiped by a stray tap.
 */
export async function skipOnboardingAction(): Promise<void> {
  const userId = await requireUserId()
  await upsertProfile(userId, { onboardedAt: new Date() })
  revalidatePath('/')
  redirect('/')
}

/**
 * `/me`'s save. Same schema, same conversion, no `onboarded_at` side effect — it is already set,
 * and re-stamping it would misreport when the runner first made that decision.
 *
 * Stays on the page and reports success, rather than redirecting: an edit form that navigates away
 * gives no confirmation that anything happened.
 */
export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const userId = await requireUserId()

  const parsed = parseForm(formData)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Some values look off — check the numbers.',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  await upsertProfile(userId, toProfileWrite(parsed.data))

  revalidatePath('/me')
  revalidatePath('/')
  return { status: 'saved' }
}
