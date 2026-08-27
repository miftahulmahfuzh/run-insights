import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PaceHrChart } from '@/components/charts/PaceHrChart'
import { InsightCard } from '@/components/insights/InsightCard'
import { InsightTrigger } from '@/components/insights/InsightTrigger'
import { IntentChips } from '@/components/runs/IntentChips'
import { ProvenanceMark } from '@/components/runs/ProvenanceMark'
import { PhotoInclusionList } from '@/components/share/PhotoInclusionList'
import { ShareButton } from '@/components/share/ShareButton'
import { ShareLinkPanel } from '@/components/share/ShareLinkPanel'
import { AppShell, Card, Eyebrow, FlagList, SplitsTable, Stat, ZoneBar } from '@/components/ui'
import { requireUserId } from '@/lib/auth/requireUserId'
import { fastestSlowestFullKm, toPaceHrPoints, toZoneShares } from '@/lib/charts'
import {
  getActiveShareForRun,
  getExtraction,
  getLatestInsight,
  getRunDetail,
} from '@/lib/db/queries'
import {
  formatBpm,
  formatCadence,
  formatClock,
  formatDay,
  formatDistanceM,
  formatDuration,
  formatElevation,
  formatKcal,
  formatPace,
  formatPercent,
} from '@/lib/format'
import { isValidId } from '@/lib/id'
import { computeSessionMetrics, evaluateSessionFlags, resolveHrMax } from '@/lib/metrics'
import type { ZoneRow } from '@/lib/metrics'
import { shareUrl } from '@/lib/share/origin'

/**
 * `/r/[id]` — §2.2. The screen this whole app exists to render.
 *
 * **One hero figure: the distance.** Everything else steps down from it. The analysis card sits
 * above the charts because the words are the point and the charts are the evidence — this is a
 * reading app, not a dashboard (the roadmap's core tenet, and the reason there is no grid of tiles).
 *
 * ── THE FETCH BOUNDARY ─────────────────────────────────────────────────────────────────────────
 * Two round trips, and the second one is conditional:
 *
 *   1. `Promise.all([getRunDetail, resolveHrMax, getLatestInsight])` — the run with its splits,
 *      zones and photos in one batched snapshot (four statements, one HTTP request), the HRmax
 *      resolution, and F07's prose.
 *   2. `getExtraction`, only when the run came from one, only for the corrections COUNT that
 *      `ProvenanceMark` prints.
 *
 * **Every number below is F06's.** `computeSessionMetrics` is called exactly once, server-side, and
 * nothing on this page re-derives a metric from raw splits — D2's rule is that the LLM writes prose
 * only, and F08's version of it is that the VIEW renders numbers only.
 *
 * Draft-visible by design (`getRunDetail` carries no `reviewed_at` filter): a run must render
 * whatever its review state. The reviewed-data invariant (D16) governs rollups, records and badges —
 * "show me this row" is a different question, and `ProvenanceMark` is what answers it honestly.
 */
/**
 * **For the Server Action, not for this render.** The page itself is two indexed reads and is
 * done in milliseconds. `InsightTrigger` then calls `ensureRunInsight` from a client effect, and
 * a Server Action's timeout is the *page segment's* — Next's `maxDuration` reference: "If using
 * Server Actions, set the `maxDuration` at the page level to change the default timeout of all
 * Server Actions used on the page."
 *
 * `BUDGET.session.overall` in `lib/llm/narrate.ts` is 45 s, and the measured call is ~17 s. Both
 * are above the platform default, so without this the action is killed mid-call and the runner
 * gets R-17's "unavailable" for a model that was answering correctly (F31).
 *
 * A LITERAL `60` for the reason `app/api/extract/route.ts` spells out at length: segment config
 * exports are statically analysed at build time and an imported constant is not a value the
 * analyser can see.
 */
export const maxDuration = 60

export default async function RunPage({ params }: PageProps<'/r/[id]'>) {
  const userId = await requireUserId()
  const { id } = await params
  if (!isValidId(id)) notFound()

  /*
   * F11 joins this fetch rather than adding a round trip: whether a live share exists has to be
   * known on FIRST paint, or the panel below flashes "not shared" at a runner who shared this run
   * last week. `getActiveShareForRun` is one indexed lookup on the partial unique index.
   */
  const [run, hrMax, insight, share] = await Promise.all([
    getRunDetail(userId, id),
    resolveHrMax(userId),
    getLatestInsight(userId, 'session', id),
    getActiveShareForRun(userId, id),
  ])
  if (!run) notFound()

  /*
   * The absolute URL is built HERE, on the server, from `AUTH_URL` — never in the client from
   * `window.location.origin`. A runner who taps Share on a Vercel preview deployment would otherwise
   * send a link on a hostname that dies at the next push. See lib/share/origin.ts.
   */
  const shareLink = share ? shareUrl(share.token) : null

  const extraction = run.extractionId ? await getExtraction(userId, run.extractionId) : null
  const correctedFieldCount = Object.keys(extraction?.corrections ?? {}).length

  // `run_zones.zone` is a plain `int` in Postgres; F04's Zod schema enforces the 1..5 domain on the
  // way in, so this narrowing restates a guarantee rather than assuming one (same note as F06's
  // records gateway).
  const zones: ZoneRow[] = run.zones.map((z) => ({
    zone: z.zone as ZoneRow['zone'],
    durationSec: z.durationSec,
    minBpm: z.minBpm,
    maxBpm: z.maxBpm,
  }))
  const splits = run.splits.map((s) => ({
    km: s.km,
    timeSec: s.timeSec,
    paceSec: s.paceSec,
    hr: s.hr,
    cadence: s.cadence,
    partial: s.partial,
  }))

  const metrics = computeSessionMetrics(
    {
      runId: run.id,
      occurredOn: run.occurredOn,
      distanceM: run.distanceM,
      durationSec: run.durationSec,
      avgHrBpm: run.avgHr,
      splits,
      zones,
      recovery: { endHrBpm: run.endHrBpm, hrAt1MinBpm: run.hr1MinPostBpm },
    },
    hrMax,
  )
  const flags = evaluateSessionFlags(metrics, splits.find((s) => !s.partial) ?? null)

  const points = toPaceHrPoints(splits, run.distanceM)
  const { fastestKm, slowestKm } = fastestSlowestFullKm(points)
  const zoneShares = toZoneShares(zones)

  return (
    <AppShell>
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <Link href="/" className="text-[13px] font-semibold text-accent">
          ‹ Runs
        </Link>
        <div className="flex items-baseline gap-4">
          {/* F05's post-review correction path — the only way into it, so it must survive here. */}
          <Link href={`/r/${id}/edit`} className="text-[13px] font-semibold text-accent">
            Correct
          </Link>
          {/* F11's slot, now filled. The URL is passed in so a run that is ALREADY shared reaches
              `navigator.share()` synchronously inside the tap — no mint round trip, no Safari
              transient-activation problem. See ShareButton's own note on why that matters. */}
          <ShareButton runId={run.id} url={shareLink} />
        </div>
      </header>

      <Card>
        <Eyebrow className="mb-3">
          {[formatDay(run.occurredOn), run.location].filter(Boolean).join(' · ')}
        </Eyebrow>

        <Stat
          label={run.activityType}
          value={formatDistanceM(run.distanceM)}
          size="hero"
          note={
            [
              formatDuration(run.durationSec),
              formatPace(run.avgPaceSec, true),
              run.startedAt && `${formatClock(run.startedAt)}–${formatClock(run.endedAt)}`,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />

        <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5">
          <Stat label="Avg HR" value={formatBpm(run.avgHr)} size="sm" />
          <Stat label="Max HR" value={formatBpm(run.maxHr)} size="sm" />
          <Stat label="Cadence" value={formatCadence(run.avgCadence)} size="sm" />
          <Stat label="Active" value={formatKcal(run.activeKcal)} size="sm" />
          <Stat label="Elevation" value={formatElevation(run.elevationM)} size="sm" />
          {/* A recovery of 23 means the heart rate CAME DOWN 23 bpm in the minute after
              finishing. Bigger is better, which is not obvious from a bare number, so the label
              says "drop" rather than dressing the value in a minus sign. */}
          <Stat label="1-min drop" value={formatBpm(metrics.hrRecovery1MinBpm)} size="sm" />
        </div>

        {/*
          Roadmap §4.4: "every metric that divides by HRmax carries the source through to the UI,
          and the UI shows it." This is that sentence, rendered. When HRmax cannot be resolved at
          all, nothing here appears — an app with no signal for HRmax shows no HRmax-derived number
          (D11), not one computed against a hardcoded 190.
        */}
        {metrics.avgHrPctMax != null && hrMax && (
          <div className="mt-5 rounded-field bg-paper-2 p-4">
            <Stat
              label="Average, as a share of your maximum"
              value={formatPercent(metrics.avgHrPctMax, 1)}
              note={`of ${formatBpm(hrMax.bpm)} · ${hrMax.source}${
                hrMax.source === 'observed' && hrMax.observedOn
                  ? `, from your run of ${formatDay(hrMax.observedOn)}`
                  : ''
              }`}
            />
          </div>
        )}

        <div className="mt-5">
          <ProvenanceMark
            source={run.source}
            reviewedAt={run.reviewedAt}
            correctedAt={run.correctedAt}
            correctedFieldCount={correctedFieldCount}
          />
        </div>

        {run.note && <p className="mt-3 text-[13px] font-medium text-ink-2">{run.note}</p>}

        <div className="mt-5 border-t border-rule-2 pt-5">
          <IntentChips runId={run.id} intent={run.intent} />
        </div>
      </Card>

      <div className="mt-4">
        <InsightCard payload={insight?.payload ?? null} scopeLabel="This run">
          {/* F06's flags live inside F07's card: the prose and the measurements that provoked it are
              one reading, and splitting them into two cards makes the reader join them up. */}
          <FlagList flags={flags} />
          {/*
            F07's generation trigger (§7.2). It runs AFTER this server render, never inside it, so
            a 10-35 s model call cannot delay a screen whose numbers are already final.

            The `key` is load-bearing, not a lint appeasement: answering the intent question or
            correcting a field changes the facts and therefore the hash, and `revalidatePath` alone
            would re-render this subtree with the trigger's "already fired" ref intact. Keying on
            the two fields that can change the facts from this page remounts it, which is exactly
            the semantics wanted — new facts, new attempt.
          */}
          <InsightTrigger
            key={`${run.intent ?? 'none'}:${run.correctedAt?.toISOString() ?? ''}`}
            target={{ scope: 'session', runId: run.id }}
            hasInsight={insight?.payload != null}
            enabled={run.reviewedAt != null}
          />
        </InsightCard>
      </div>

      {points.length > 0 && (
        <div className="mt-4">
          <PaceHrChart points={points} />
        </div>
      )}

      <Card className="mt-4 p-5">
        <Eyebrow className="mb-3">Time in zone</Eyebrow>
        <ZoneBar
          shares={zoneShares}
          caption={
            metrics.hardPct == null
              ? undefined
              : /* The design brief asks for 90.6% to be unmissable "without scolding me about it".
                   One plain sentence, no colour, no icon, no bold: the number is the emphasis. */
                `${formatPercent(metrics.hardPct, 1)} of this run was zone 4 or harder.`
          }
        />
      </Card>

      {points.length > 0 && (
        <Card className="mt-4 p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <Eyebrow>Splits</Eyebrow>
            <span className="text-[11px] font-semibold text-ink-3 tabular-nums">
              {metrics.fullSplitCount} full km
            </span>
          </div>
          <SplitsTable points={points} zones={zones} fastestKm={fastestKm} slowestKm={slowestKm} />
        </Card>
      )}

      {/*
        Sharing sits at the BOTTOM of the run, deliberately, and in this order.

        The photo list comes first because it is the decision you make BEFORE you share — the flag
        lives on the photo, not on the link (§3.3.2), so it is meaningful whether or not a link
        exists — and because putting a privacy control after the button that publishes is an
        invitation to discover it too late. The link panel follows, carrying the state and the
        destructive action.

        Neither is above the charts: this is a reading app, and the run is what you came for.
      */}
      {run.photos.length > 0 && (
        <div className="mt-4">
          <PhotoInclusionList
            runId={run.id}
            photos={run.photos.map((p) => ({
              id: p.id,
              blobUrl: p.blobUrl,
              kind: p.kind,
              excludedFromShare: p.excludedFromShare,
            }))}
          />
        </div>
      )}

      <div className="mt-4">
        <ShareLinkPanel runId={run.id} token={share?.token ?? null} url={shareLink} />
      </div>
    </AppShell>
  )
}
