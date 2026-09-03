import { ProfileForm } from '@/components/profile/ProfileForm'
import { Card } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { getProfile } from '@/lib/db/queries'
import { saveOnboardingAction, skipOnboardingAction } from '@/lib/profile/actions'
import { ageFromBirthYear } from '@/lib/metrics/age'

/**
 * Asked once, on first login. `/` redirects here while `profiles.onboarded_at IS NULL`, and stops
 * as soon as it is set — by a filled-in form or by "Skip for now", because "onboarded" means *made
 * a decision about onboarding*, not *filled in every field*.
 *
 * It must not feel like a medical intake form (design brief §2), which is why there is one line of
 * explanation, no required markers, and a skip that is as prominent as it needs to be and no more.
 *
 * Navigating back here after onboarding is harmless: the form pre-fills from the stored row and
 * saving is idempotent.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[470px] flex-col justify-center p-5">
      <h1 className="mb-2 text-[26px] font-bold tracking-[-0.02em] text-ink">A few numbers</h1>
      <p className="mb-6 max-w-[38ch] text-[13px] font-medium text-ink-2">
        These calibrate your heart-rate zones and effort estimates. All optional — skip anything you
        do not know, and change any of it later.
      </p>

      <Card>
        <ProfileForm
          mode="onboarding"
          values={{
            age: profile?.birthYear != null ? ageFromBirthYear(profile.birthYear) : null,
            heightCm: profile?.heightCm ?? null,
            weightKg: profile?.weightKg ?? null,
            sex: profile?.sex ?? null,
            restingHr: profile?.restingHr ?? null,
            maxHr: profile?.maxHr ?? null,
          }}
          action={saveOnboardingAction}
          skipAction={skipOnboardingAction}
        />
      </Card>
    </main>
  )
}
