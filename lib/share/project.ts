import type { SharedRun } from '@/lib/db/queries'
import { SHARE_SHOWS_LOCATION, SHARE_SHOWS_TIME_OF_DAY } from './config'
import type { SharedInsightView, SharedRunView, SharedSplitView, SharedZoneView } from './types'

/**
 * F03's `SharedRun` → F11's `SharedRunView`. The second narrowing, and the one that answers to the
 * flags.
 *
 * ── WHY TWO NARROWINGS AND NOT ONE ─────────────────────────────────────────────────────────────
 * `getRunByShareToken` (queries.ts §9) already refuses to hand out `user_id`, `note`, the
 * extraction audit trail or an email — that is the **query** layer's job and it is a security
 * boundary. This is the **product** layer's job: which of the fields the query is willing to
 * return does this feature actually publish, and under which flag. They are different questions
 * with different reviewers, and collapsing them would mean every "should we show the location?"
 * conversation happened inside the file that must never widen.
 *
 * Every field is named. Nothing is spread. Two consequences, both deliberate:
 *
 *   - `ownerName` and `id` **disappear here**, structurally. F03's projection carries them (a run
 *     detail has an id; a shared page has no use for one), and F11 §5 says a stranger sees neither
 *     the owner's name nor the run id under any setting. Stripping them in a projector rather than
 *     merely not rendering them means an accidental `{...run}` into a Client Component — the RSC
 *     flight payload ships prop objects verbatim, rendered or not (§3.7) — cannot leak them.
 *   - A column added to `getRunByShareToken` tomorrow is excluded from the public page by default
 *     until someone edits this function. That is the intended cost.
 *
 * Pure: no I/O, no clock, no `server-only`. It is unit-tested directly against the canonical
 * fixture's shape in `tests/share.project.test.ts`.
 */
export function toSharedRunView(run: SharedRun): SharedRunView {
  const insight = readSharedInsight(run.insightPayload)

  return {
    occurredOn: run.occurredOn,
    activityType: run.activityType,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgPaceSec: run.avgPaceSec,
    avgHr: run.avgHr,
    maxHr: run.maxHr,
    avgCadence: run.avgCadence,
    activeKcal: run.activeKcal,
    elevationM: run.elevationM,

    // The two fields whose visibility is a decision rather than a given. `null`, not omitted: the
    // shape stays constant so the page's JSX has one branch per field instead of two.
    location: SHARE_SHOWS_LOCATION ? run.location : null,
    startedAt: SHARE_SHOWS_TIME_OF_DAY ? run.startedAt : null,

    splits: run.splits.map((s): SharedSplitView => ({
      km: s.km,
      timeSec: s.timeSec,
      paceSec: s.paceSec,
      hr: s.hr,
      cadence: s.cadence,
      partial: s.partial,
    })),

    // `run_zones.zone` is a plain `int` in Postgres; F04's Zod schema enforces the 1..5 domain on
    // the way in, so this narrowing restates a guarantee rather than assuming one — the same note
    // `/r/[id]` carries for the same cast.
    zones: run.zones.map((z): SharedZoneView => ({
      zone: z.zone as SharedZoneView['zone'],
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),

    // Per-photo exclusion is already enforced inside the query (queries.ts §9), so an excluded
    // screenshot never reaches this function at all. Filtering again here would imply the query
    // might not have — it does, and that is the right layer for it.
    photos: run.photos.map((p) => ({
      blobUrl: p.blobUrl,
      kind: p.kind,
      width: p.width,
      height: p.height,
    })),

    insight,
    avgHrPctMax: avgHrPctMax(run.avgHr, insight?.hrMaxUsed ?? null),
  }
}

/**
 * **%HRmax, from two frozen integers — the whole of this feature's compliance with INVARIANT B.**
 *
 * F02 §6.3 is binding: *"the shared page must render from already-computed, stored values… never by
 * calling `resolveHrMax` at share-view time."* The denominator here is `insights.payload.hrMaxUsed`
 * (R-11), written once inside the authenticated path when F07 generated the prose. This function
 * divides two numbers that are already in the row. It reads no profile, imports no resolver, and
 * has no fallback formula: **when either half is missing the answer is `null`, never a guess** — a
 * stranger with a link must not be able to infer, even indirectly, whether the runner filled in
 * their age.
 *
 * It is also what keeps a months-old insight honest. The observed ceiling moves (D11 resolves
 * observed-first); a percentage recomputed against today's denominator would silently contradict
 * the prose sitting next to it.
 */
export function avgHrPctMax(avgHr: number | null, hrMaxUsed: number | null): number | null {
  if (avgHr == null || hrMaxUsed == null || hrMaxUsed <= 0) return null
  return (avgHr / hrMaxUsed) * 100
}

/**
 * `insights.payload` (jsonb, so `unknown`) → the public half of it.
 *
 * **R-27 happens here, by omission rather than by deletion.** `doNext` and `questionForRunner` are
 * never read out of the payload, so they cannot survive into the returned object no matter what the
 * stored JSON contains — a `delete` on a copy would leave the keys reachable for one statement and
 * would silently stop working the day the payload gains a nested shape.
 *
 * Deliberately tolerant and non-throwing, for the same reason `InsightCard` is: a row written
 * before a schema change must not crash a page whose numbers are all perfectly fine. Whatever is
 * present renders; whatever is missing is skipped.
 */
export function readSharedInsight(payload: unknown): SharedInsightView | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>

  const observations = Array.isArray(p.observations)
    ? p.observations
        .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
        .map((o) => ({ title: str(o.title), detail: str(o.detail), metric: str(o.metric) }))
        .filter((o) => o.title !== null || o.detail !== null)
    : []

  const view: SharedInsightView = {
    headline: str(p.headline),
    verdict: str(p.verdict),
    whatHappened: str(p.whatHappened),
    observations,
    hrMaxUsed: int(p.hrMaxUsed),
    hrMaxSource: hrMaxSource(p.hrMaxSource),
  }

  // Nothing readable is the same as no insight: the page then shows no analysis section at all
  // rather than an empty heading. It deliberately does NOT show the owner-side "not ready yet"
  // slot — that copy speaks to the runner, and a stranger is not waiting for anything.
  if (view.headline === null && view.whatHappened === null && observations.length === 0) {
    // The frozen denominator still counts as content: a %HRmax figure with no prose around it is
    // a legitimate render, and dropping the insight entirely would silently delete it.
    return view.hrMaxUsed === null ? null : view
  }
  return view
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const HR_MAX_SOURCES = ['measured', 'observed', 'estimated'] as const

function hrMaxSource(value: unknown): SharedInsightView['hrMaxSource'] {
  return typeof value === 'string' && (HR_MAX_SOURCES as readonly string[]).includes(value)
    ? (value as SharedInsightView['hrMaxSource'])
    : null
}
