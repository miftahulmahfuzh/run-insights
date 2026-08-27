import { InsightCard } from '@/components/insights/InsightCard'
import { InsightTrigger } from '@/components/insights/InsightTrigger'
import { PaceTrendChart } from '@/components/charts/PaceTrendChart'
import { VolumeTrendChart } from '@/components/charts/VolumeTrendChart'
import { WeeksInMonthChart } from '@/components/charts/WeeksInMonthChart'
import { ZoneDriftChart } from '@/components/charts/ZoneDriftChart'
import { AcwrTile } from '@/components/trends/AcwrTile'
import { CompactRunRow } from '@/components/trends/CompactRunRow'
import { DeltaLine } from '@/components/trends/DeltaLine'
import { PeriodNav, ScopeSwitcher } from '@/components/trends/ScopeSwitcher'
import { AppShell, Card, EmptyState, Eyebrow, ScreenHeader, Stat, ZoneBar } from '@/components/ui'
import { ButtonLink } from '@/components/ui/Button'
import { requireUserId } from '@/lib/auth/requireUserId'
import {
  aggregateZones,
  toPaceTrendPoints,
  toVolumeTrend,
  toZoneDrift,
  toZoneShares,
  weeksInMonth,
  weeksWithRuns,
  type ChartRun,
} from '@/lib/charts'
import {
  addDays,
  addMonths,
  isoWeekKeyOf,
  isoWeekRange,
  isValidIsoWeekKey,
  isValidMonthKey,
  monthKey as monthKeyOf,
  monthRange,
  todayInJakarta,
  type DateISO,
} from '@/lib/date/ranges'
import { getLatestInsight, getReviewedRunsWithChildren } from '@/lib/db/queries'
import {
  formatDistanceM,
  formatDuration,
  formatMonthLabel,
  formatMonthName,
  formatPace,
  formatPercent,
  isoWeekLabel,
} from '@/lib/format'
import { computeAcwr, computeMonthMetrics, computeWeekMetrics, type ZoneRow } from '@/lib/metrics'

/**
 * `/trends` — §2.3. **One route, `?scope=week|month&key=...`**, and a segmented control that swaps
 * between them. Not two routes: a single route keeps the Trends tab's `aria-current` trivial and
 * lets the always-visible 12-week section live in one component tree instead of being duplicated.
 *
 * ── ONE QUERY FOR THE WHOLE SCREEN ─────────────────────────────────────────────────────────────
 * Every number here comes from `getReviewedRunsWithChildren` — one `db.batch`, three statements,
 * one HTTP round trip, **one consistent snapshot** — plus one insight row for the selected scope.
 *
 * The alternative was a query per section: this week, last week, this month, last month, the 12-week
 * window, the ACWR window. Six range scans over the same few hundred rows, six chances for two
 * charts on one screen to disagree, and a guaranteed disagreement the day one of them straddles
 * midnight in Jakarta. At 17 runs a month a year of history is ~200 runs and ~3,000 child rows; the
 * batch reads them once and every rollup below is a `filter` and a `reduce` over the same array.
 *
 * This is the same reasoning F06's `recomputeRecords` uses for the same query (records are
 * recomputed wholesale, never incremented) and it has the same limit: it is right *because this is a
 * single-user personal app with a bounded history*. If a user ever has thousands of runs, this page
 * — and `recomputeRecords` — both need the same rethink, and neither should be changed alone.
 *
 * Reviewed-only throughout (D16): the query itself filters `reviewed_at IS NOT NULL`, so no rollup,
 * chart or delta on this screen can be computed from a number no human has confirmed.
 */
/**
 * The week/month counterpart of the export on `app/r/[id]/page.tsx` — see there for the full
 * reasoning. `InsightTrigger` fires `ensureWeekInsight` / `ensureMonthInsight` from a client
 * effect, and a Server Action inherits its page segment's timeout, so the 50 s
 * `BUDGET.week.overall` needs this to survive (F31).
 *
 * Period scope usually hits the cache — `/api/cron/rollup` warms it nightly — but a cache MISS is
 * exactly the case that needs the budget, and it is the case a runner hits by opening `/trends`
 * on a week the cron has not reached yet.
 */
export const maxDuration = 60

export default async function TrendsPage({ searchParams }: PageProps<'/trends'>) {
  const userId = await requireUserId()
  const { scope: rawScope, key: rawKey } = await searchParams

  const todayISO = todayInJakarta()
  const currentWeekKey = isoWeekKeyOf(todayISO)
  const currentMonthKey = monthKeyOf(todayISO)

  const scope = rawScope === 'month' ? 'month' : 'week'

  /*
   * The clamp, mirroring the sibling app's `?m=` handling: an invalid key, or one in the future,
   * falls back silently to the current period. A hand-edited URL is not an error condition, and a
   * 404 for `?key=banana` teaches the reader nothing. String comparison is enough for both key
   * formats because both are zero-padded and ISO-ordered ('2025-W52' < '2026-W01').
   */
  const key =
    scope === 'week'
      ? isValidIsoWeekKey(rawKey) && rawKey <= currentWeekKey
        ? rawKey
        : currentWeekKey
      : isValidMonthKey(rawKey) && rawKey <= currentMonthKey
        ? rawKey
        : currentMonthKey

  const [rows, insight] = await Promise.all([
    getReviewedRunsWithChildren(userId),
    getLatestInsight(userId, scope, key),
  ])

  // One mapping, at the boundary, into the shape every pure function below reads. `run_zones.zone`
  // is a plain int in Postgres; F04's Zod schema enforces 1..5 on the way in.
  const runs: ChartRun[] = rows.map((run) => ({
    runId: run.id,
    occurredOn: run.occurredOn,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgPaceSec: run.avgPaceSec,
    zones: run.zones.map((z) => ({
      zone: z.zone as ZoneRow['zone'],
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
  }))

  if (runs.length === 0) {
    return (
      <AppShell>
        <ScreenHeader title="Trends" />
        <EmptyState
          title="Nothing to compare yet"
          description="Trends need runs behind them. Upload one and this screen starts filling in — weekly volume first, then the pace and zone trends after four weeks."
          action={
            <ButtonLink href="/upload" variant="primary" size="lg" fullWidth>
              Upload a run
            </ButtonLink>
          }
        />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <ScreenHeader title="Trends" />
      <ScopeSwitcher
        scope={scope}
        weekKey={scope === 'week' ? key : currentWeekKey}
        monthKey={scope === 'month' ? key : currentMonthKey}
      />

      {scope === 'week' ? (
        <WeekRollup weekKey={key} runs={runs} currentWeekKey={currentWeekKey} insight={insight} />
      ) : (
        <MonthRollup
          monthKey={key}
          runs={runs}
          currentMonthKey={currentMonthKey}
          todayISO={todayISO}
          insight={insight}
        />
      )}

      <TrendsSection runs={runs} todayISO={todayISO} />
    </AppShell>
  )
}

/* ============================================================================
 * The week scope
 * ==========================================================================*/

function inRange(runs: readonly ChartRun[], startISO: DateISO, endExclusiveISO: DateISO) {
  return runs.filter((r) => r.occurredOn >= startISO && r.occurredOn < endExclusiveISO)
}

function WeekRollup({
  weekKey,
  runs,
  currentWeekKey,
  insight,
}: {
  weekKey: string
  runs: readonly ChartRun[]
  currentWeekKey: string
  insight: { payload: unknown } | null
}) {
  const { startISO, endExclusiveISO } = isoWeekRange(weekKey)
  const thisWeek = inRange(runs, startISO, endExclusiveISO)

  const previousKey = isoWeekKeyOf(addDays(startISO, -7))
  const previous = isoWeekRange(previousKey)
  const previousVolumeM = inRange(runs, previous.startISO, previous.endExclusiveISO).reduce(
    (sum, r) => sum + r.distanceM,
    0,
  )

  const metrics = computeWeekMetrics(weekKey, thisWeek, previousVolumeM)
  const nextKey = isoWeekKeyOf(addDays(startISO, 7))

  return (
    <>
      <Card className="p-5">
        <PeriodNav
          label={weekKey === currentWeekKey ? 'This week' : isoWeekLabel(weekKey)}
          previousHref={`/trends?scope=week&key=${previousKey}`}
          nextHref={weekKey === currentWeekKey ? null : `/trends?scope=week&key=${nextKey}`}
        />

        {/* One hero figure per screen (§1): the week's distance. Never two competing headlines. */}
        <Stat label={isoWeekLabel(weekKey)} value={formatDistanceM(metrics.volumeM)} size="hero" />
        <DeltaLine delta={metrics.volumeDelta} runCount={metrics.runCount} periodNoun="week" />

        {metrics.jumpWarning && (
          <p className="mt-3 rounded-field bg-warn-soft p-3 text-[12px] font-medium text-ink-2">
            {/* IMPLEMENTATION_PLAN §4's jump warning. Increases only — a taper is not a warning. */}
            Volume is more than 10% up on last week. Worth knowing, not worth worrying about on its
            own.
          </p>
        )}

        {thisWeek.length > 0 ? (
          <ul className="mt-4">
            {[...thisWeek]
              .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))
              .map((run) => (
                <CompactRunRow key={run.runId} run={run} />
              ))}
          </ul>
        ) : (
          /* §9: the divider still renders for a week that has not happened yet. A week with no runs
             in it is not the same absence as a user with no data ever. */
          <p className="mt-4 border-t border-rule-2 pt-3 text-[12px] font-medium text-ink-3">
            No runs in this week.
          </p>
        )}

        {metrics.z1z2SharePct != null && (
          <p className="mt-4 text-[12px] font-medium text-ink-2">
            {formatPercent(metrics.z1z2SharePct, 1)} of this week&rsquo;s heart-rate time was in
            zones 1–2.
          </p>
        )}

        <PaceByBucket buckets={metrics.avgPaceByBucket} />
      </Card>

      <div className="mt-4">
        <InsightCard payload={insight?.payload ?? null} scopeLabel="This week">
          {/* Usually a no-op: the nightly cron has already written this week, so the action is a
              hash hit and returns in milliseconds. It earns its place on the first view of a new
              week, and on any view after a correction swept the row. */}
          <InsightTrigger
            target={{ scope: 'week', periodKey: weekKey }}
            hasInsight={insight?.payload != null}
            enabled={thisWeek.length > 0}
          />
        </InsightCard>
      </div>
    </>
  )
}

/** "10K 7'02"/km · Half 7'31"/km" — distance-weighted, from F06. Never a mean of run averages. */
function PaceByBucket({ buckets }: { buckets: Partial<Record<string, number>> }) {
  const entries = Object.entries(buckets).filter(([, pace]) => pace != null)
  if (entries.length === 0) return null

  return (
    <div className="mt-4 border-t border-rule-2 pt-4">
      <Eyebrow className="mb-2">Pace at each distance</Eyebrow>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums">
        {entries.map(([bucket, pace]) => (
          <li key={bucket} className="font-medium text-ink-2">
            <span className="font-semibold text-ink uppercase">{bucket}</span>{' '}
            {formatPace(pace as number, true)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ============================================================================
 * The month scope
 * ==========================================================================*/

function MonthRollup({
  monthKey,
  runs,
  currentMonthKey,
  todayISO,
  insight,
}: {
  monthKey: string
  runs: readonly ChartRun[]
  currentMonthKey: string
  todayISO: DateISO
  insight: { payload: unknown } | null
}) {
  const { startISO, endExclusiveISO } = monthRange(monthKey)
  const thisMonth = inRange(runs, startISO, endExclusiveISO)

  const previousKey = addMonths(monthKey, -1)
  const previous = monthRange(previousKey)
  const previousMonth = inRange(runs, previous.startISO, previous.endExclusiveISO)

  const metrics = computeMonthMetrics(monthKey, thisMonth, previousMonth)
  const buckets = weeksInMonth(monthKey, thisMonth, todayISO)
  const zoneShares = toZoneShares(aggregateZones(thisMonth))

  // ACWR is a rolling 7-day-over-28-day window ending today (R-6), NOT a property of the selected
  // month — so it reads the whole history and the tile says "this week" rather than "this month".
  const acwr = computeAcwr(
    runs.map((r) => ({ occurredOn: r.occurredOn, distanceM: r.distanceM })),
    todayISO,
    runs[0]?.occurredOn ?? null,
  )

  const totalDurationSec = thisMonth.reduce((sum, r) => sum + r.durationSec, 0)

  return (
    <>
      <Card className="p-5">
        <PeriodNav
          label={formatMonthLabel(monthKey)}
          previousHref={`/trends?scope=month&key=${previousKey}`}
          nextHref={
            monthKey === currentMonthKey
              ? null
              : `/trends?scope=month&key=${addMonths(monthKey, 1)}`
          }
        />

        <Stat
          label={formatMonthLabel(monthKey)}
          value={formatDistanceM(metrics.volumeM)}
          size="hero"
          note={totalDurationSec > 0 ? `${formatDuration(totalDurationSec)} moving` : undefined}
        />
        <DeltaLine
          delta={metrics.volumeDelta}
          runCount={metrics.runCount}
          periodNoun={formatMonthName(previousKey)}
        />

        <div className="mt-5">
          {/* The bars sum exactly to the hero number above — the invariant §3.4 names and
              tests/charts.weeksInMonth.test.ts pins. */}
          <WeeksInMonthChart buckets={buckets} />
        </div>

        <div className="mt-4">
          <AcwrTile acwr={acwr} />
        </div>

        {zoneShares.length > 0 && (
          <div className="mt-5 border-t border-rule-2 pt-5">
            <Eyebrow className="mb-3">Time in zone · this month</Eyebrow>
            {/* The same component as the run detail page, fed monthly-summed durations. One
                palette, one reading habit, two scopes. */}
            <ZoneBar
              shares={zoneShares}
              emptyMessage="No heart-rate data this month."
              caption={`Across ${metrics.runCount} ${metrics.runCount === 1 ? 'run' : 'runs'}.`}
            />
          </div>
        )}

        <PaceByBucket
          buckets={Object.fromEntries(
            Object.entries(metrics.paceTrendByBucket).map(([bucket, comparison]) => [
              bucket,
              comparison?.thisMonthSecPerKm,
            ]),
          )}
        />
      </Card>

      <div className="mt-4">
        <InsightCard payload={insight?.payload ?? null} scopeLabel="This month">
          <InsightTrigger
            target={{ scope: 'month', periodKey: monthKey }}
            hasInsight={insight?.payload != null}
            enabled={thisMonth.length > 0}
          />
        </InsightCard>
      </div>
    </>
  )
}

/* ============================================================================
 * The always-visible 12-week section
 * ==========================================================================*/

/**
 * §2.3's non-conflation rule, enforced by construction: this section is a rolling 12-week window
 * anchored to today, and **nothing above it can change what it shows.** A reader who taps Month or
 * pages back to June must never see these three charts move.
 */
function TrendsSection({ runs, todayISO }: { runs: readonly ChartRun[]; todayISO: DateISO }) {
  const volume = toVolumeTrend(runs, todayISO)
  const activeWeeks = weeksWithRuns(volume)
  const { points, startISO, days } = toPaceTrendPoints(runs, todayISO)
  const drift = toZoneDrift(runs, todayISO)

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        Trends · last 12 weeks
      </h2>

      {activeWeeks === 0 ? (
        <EmptyState
          title="No runs in the last twelve weeks"
          description="These charts follow the last twelve weeks, whatever period you have selected above."
        />
      ) : (
        <div className="space-y-4">
          {/* Bars are meaningful at n=1 — they are just weekly totals. The DERIVED lines are not,
              and both are withheld below four weeks (§9): a 2-point trend is a ruler. */}
          <VolumeTrendChart
            points={activeWeeks >= 4 ? volume : volume.map((p) => ({ ...p, rollingMeanM: null }))}
          />
          <PaceTrendChart
            points={points}
            startISO={startISO}
            days={days}
            allowTrendLine={activeWeeks >= 4}
          />
          <ZoneDriftChart weeks={drift} />
        </div>
      )}
    </section>
  )
}
