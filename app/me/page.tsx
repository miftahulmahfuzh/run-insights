import { AccountMenu } from '@/components/auth/AccountMenu'
import { BadgeShelf } from '@/components/profile/BadgeShelf'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { RecordsTable, type RecordRowView } from '@/components/profile/RecordsTable'
import {
  AppShell,
  ButtonLink,
  Card,
  EmptyState,
  Eyebrow,
  ScreenHeader,
  Stat,
} from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { buildShelf } from '@/lib/badges/shelf'
import { dbBadgeGateway } from '@/lib/badges/gateway'
import { todayInJakarta } from '@/lib/date/ranges'
import { formatBpm, formatDistanceM, formatDuration } from '@/lib/format'
import { getAllTimeTotals, getProfile, getRecords } from '@/lib/db/queries'
import { ageFromBirthYear } from '@/lib/metrics/age'
import { resolveHrMax, tanakaEstimate, type HrMax } from '@/lib/metrics/hrMax'
import { updateProfileAction } from '@/lib/profile/actions'
import { isRecordKey, RECORD_KEYS } from '@/lib/records/catalog'

/**
 * `/me` — roadmap §4.8: "profile: totals, records, badge shelf".
 *
 * F02 shipped the profile form and the HRmax provenance panel; **F09 fills in the three slots above
 * them** — lifetime totals, the eleven personal records, and the 22-badge shelf. It touches neither
 * the form nor the panel.
 *
 * The HRmax panel is here rather than only on a run detail page for one reason: a runner who sees
 * "91.5% of max" somewhere in the app should be able to find out *why that denominator* without
 * hunting. It is the whole of D11's honesty promise, rendered as one paragraph.
 *
 * ── SIX READS, ONE `Promise.all`, NO MODEL CALL ──────────────────────────────────────────────
 * Every number on this page is either stored or computed in TypeScript, so the whole screen is a
 * handful of indexed queries — no `getOrCreateInsight`, nothing that can take 15 s. F07's payload
 * guard exists to keep it that way.
 */
export default async function MePage() {
  const userId = await requireUserId()
  const today = todayInJakarta()

  const [profile, hrMax, totals, records, badges, periodFacts] = await Promise.all([
    getProfile(userId),
    resolveHrMax(userId),
    getAllTimeTotals(userId),
    getRecords(userId),
    dbBadgeGateway.readBadges(userId),
    /* The week/month/lifetime facts a LOCKED tile measures itself against (R-44). Anchored on
     * today in Jakarta (D6), because "you're at 116 km this month" is a statement about the month
     * the runner is currently in — not about the month of their last run. */
    dbBadgeGateway.loadPeriodFacts(userId, today),
  ])

  /* Catalog order, not the `ORDER BY key` the query returns: §4.5's table is the reading order, and
   * a key with no holder is simply missing rather than rendered as a zero. */
  const recordRows: RecordRowView[] = RECORD_KEYS.flatMap((key) => {
    const row = records.find((r) => r.key === key)
    return row && isRecordKey(row.key)
      ? [
          {
            key: row.key,
            runId: row.runId,
            value: row.value,
            achievedOn: row.achievedOn,
            previousValue: row.previousValue,
          },
        ]
      : []
  })

  const shelf = buildShelf(badges, periodFacts)

  return (
    <AppShell>
      <ScreenHeader title="Me" />

      <Card className="mb-4">
        <Eyebrow className="mb-4">Lifetime</Eyebrow>
        {totals.runCount === 0 ? (
          <EmptyState
            title="Nothing logged yet"
            description="Upload a screenshot of a run and the totals, records and badges below all start from it."
            action={<ButtonLink href="/upload">Add a run</ButtonLink>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Distance" value={formatDistanceM(totals.distanceM)} size="md" />
            <Stat label="Runs" value={totals.runCount} size="md" />
            <Stat label="Time" value={formatDuration(totals.durationSec)} size="md" />
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <Eyebrow className="mb-4">Personal records</Eyebrow>
        <RecordsTable rows={recordRows} />
      </Card>

      <Card className="mb-4">
        <Eyebrow className="mb-3">Badges</Eyebrow>
        <BadgeShelf shelf={shelf} />
      </Card>

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
            sex: profile?.sex ?? null,
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
