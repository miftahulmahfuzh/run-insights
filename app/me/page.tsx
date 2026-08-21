import { AccountMenu } from '@/components/auth/AccountMenu'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { AppShell, Card, Eyebrow, ScreenHeader } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { formatBpm } from '@/lib/format'
import { getProfile } from '@/lib/db/queries'
import { ageFromBirthYear } from '@/lib/metrics/age'
import { resolveHrMax, tanakaEstimate, type HrMax } from '@/lib/metrics/hrMax'
import { updateProfileAction } from '@/lib/profile/actions'

/**
 * `/me` — roadmap §4.8: "profile: totals, records, badge shelf".
 *
 * F02 owns only the profile-editing slice plus the HRmax provenance panel. **F09 fills in the
 * lifetime totals, the records table and the badge shelf** in the slots marked below; it must not
 * touch the form or the panel.
 *
 * The HRmax panel is here rather than only on a run detail page for one reason: a runner who sees
 * "91.5% of max" somewhere in the app should be able to find out *why that denominator* without
 * hunting. It is the whole of D11's honesty promise, rendered as one paragraph.
 *
 * F08's only change here: the page now sits in `AppShell`, so the Me tab is reachable from the tab
 * bar and this screen carries the bar back. The header's hand-rolled "Runs" link is gone with it —
 * the bar is the navigation now, and two ways back to the same place is one too many.
 */
export default async function MePage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  const hrMax = await resolveHrMax(userId)

  return (
    <AppShell>
      <ScreenHeader title="Me" />

      {/* F09 slot: lifetime distance as the hero number, total runs, total time. */}
      {/* F09 slot: the ten personal records. */}
      {/* F10 slot: the badge shelf. */}

      <Card className="mb-4">
        <Eyebrow className="mb-3">Max heart rate</Eyebrow>
        <HrMaxPanel hrMax={hrMax} birthYear={profile?.birthYear ?? null} />
      </Card>

      <Card className="mb-4">
        <Eyebrow className="mb-4">Your numbers</Eyebrow>
        <ProfileForm
          mode="edit"
          values={{
            age: profile?.birthYear != null ? ageFromBirthYear(profile.birthYear) : null,
            heightCm: profile?.heightCm ?? null,
            weightKg: profile?.weightKg ?? null,
            restingHr: profile?.restingHr ?? null,
            maxHr: profile?.maxHr ?? null,
          }}
          action={updateProfileAction}
        />
      </Card>

      <AccountMenu />
    </AppShell>
  )
}

/**
 * What HRmax resolved to, and — the part that matters — where it came from.
 *
 * Every branch NAMES BOTH NUMBERS where two exist. "We updated your max heart rate" hides that a
 * formula was overridden by a real measurement, which is the single most trust-building thing this
 * app can say to a runner with any skepticism about algorithmic health claims.
 *
 * The `null` branch is not an error state. It is a call to action, and it is the acceptance
 * criterion for D11: an app with no signal for HRmax shows no HRmax-derived number — not one
 * computed against a hardcoded 190, not one against "average adult", nothing.
 */
function HrMaxPanel({ hrMax, birthYear }: { hrMax: HrMax | null; birthYear: number | null }) {
  if (!hrMax) {
    return (
      <p className="text-[13px] font-medium text-ink-2">
        Not enough to go on yet. Add your age, or a measured max heart rate, to see every run as a
        percentage of your ceiling.
      </p>
    )
  }

  const estimate = birthYear != null ? tanakaEstimate(birthYear) : null

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[34px] leading-none font-bold tracking-[-0.02em] text-ink tabular-nums">
          {hrMax.bpm}
        </span>
        <span className="text-[13px] font-semibold text-ink-3">bpm</span>
        <span className="ml-auto rounded-pill bg-rule-2 px-[9px] py-[3px] text-[10px] font-semibold text-ink-3">
          {hrMax.source}
        </span>
      </div>

      <p className="text-[13px] font-medium text-ink-2">
        {hrMax.source === 'measured' &&
          'The number you entered. A measurement you made yourself beats anything we could work out, and it keeps beating it until you change it.'}
        {hrMax.source === 'observed' && (
          <>
            Your watch recorded this on your run of {hrMax.observedOn}
            {estimate != null
              ? ` — higher than the ${formatBpm(estimate)} your age predicts.`
              : '.'}{' '}
            Real evidence beats a formula, so this is what your percentages use.
          </>
        )}
        {hrMax.source === 'estimated' &&
          'Estimated from your age. Your watch has not yet recorded anything higher; the first time it does, this number goes up and we will say so on that run.'}
      </p>
    </div>
  )
}
