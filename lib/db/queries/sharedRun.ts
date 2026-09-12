import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'

import { type DateISO } from '@/lib/date/ranges'

import { db } from '../index'
import {
  insights,
  runPhotos,
  runSplits,
  runZones,
  runs,
  shares,
  users,
  type PhotoKind,
  type RunSplit,
  type RunZone,
} from '../schema'

/* ============================================================================
 * §9 The one unscoped read
 * ==========================================================================*/

/* ─────────────────────────────────────────────────────────────────────────────
 *  ⚠️  THE ONLY UNSCOPED QUERY IN THE ENTIRE APPLICATION  ⚠️
 *
 *  getRunByShareToken takes no userId, by design (roadmap D9, /s/[token]). The 96-bit token IS
 *  the credential. It returns a SharedRun — an explicit column list, never `select()` — so no
 *  `user_id`, no `note`, no extraction internals and no email can leak through a careless
 *  widening later. A revoked or unknown token returns null and the page 404s.
 *
 *  Do not add a second unscoped read anywhere in this codebase.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface SharedPhoto {
  blobUrl: string
  kind: PhotoKind
  width: number | null
  height: number | null
  sortOrder: number
}

export interface SharedRun {
  id: string
  occurredOn: DateISO
  startedAt: string | null
  activityType: string
  location: string | null
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  elevationM: number | null
  activeKcal: number | null
  avgCadence: number | null
  ownerName: string | null
  splits: RunSplit[]
  zones: RunZone[]
  photos: SharedPhoto[]
  /**
   * The frozen session insight (R-11): its payload carries `hrMaxUsed` / `hrMaxSource` computed
   * at generation time, so this page can render a %HRmax without ever resolving HRmax live —
   * F02's INVARIANT B satisfied structurally rather than by discipline. F11 must still strip
   * `doNext` and `questionForRunner` before rendering (R-27); they are private coaching.
   */
  insightPayload: unknown | null
}

export async function getRunByShareToken(token: string): Promise<SharedRun | null> {
  // A correlated subquery, so the child selects are filtered by the token itself rather than by
  // a run id the caller could have supplied. All five statements share one snapshot.
  const sharedRunId = db
    .select({ id: shares.runId })
    .from(shares)
    .where(and(eq(shares.token, token), isNull(shares.revokedAt)))

  const [runRows, splitRows, zoneRows, photoRows, insightRows] = await db.batch([
    db
      .select({
        id: runs.id,
        occurredOn: runs.occurredOn,
        startedAt: runs.startedAt,
        activityType: runs.activityType,
        location: runs.location,
        distanceM: runs.distanceM,
        durationSec: runs.durationSec,
        avgPaceSec: runs.avgPaceSec,
        avgHr: runs.avgHr,
        maxHr: runs.maxHr,
        elevationM: runs.elevationM,
        activeKcal: runs.activeKcal,
        avgCadence: runs.avgCadence,
        ownerName: users.name,
      })
      .from(shares)
      .innerJoin(runs, eq(runs.id, shares.runId))
      .innerJoin(users, eq(users.id, runs.userId))
      .where(and(eq(shares.token, token), isNull(shares.revokedAt)))
      .limit(1),

    db
      .select()
      .from(runSplits)
      .where(inArray(runSplits.runId, sharedRunId))
      .orderBy(asc(runSplits.km)),

    db
      .select()
      .from(runZones)
      .where(inArray(runZones.runId, sharedRunId))
      .orderBy(asc(runZones.zone)),

    db
      .select({
        blobUrl: runPhotos.blobUrl,
        kind: runPhotos.kind,
        width: runPhotos.width,
        height: runPhotos.height,
        sortOrder: runPhotos.sortOrder,
      })
      .from(runPhotos)
      .where(
        and(
          inArray(runPhotos.runId, sharedRunId),
          // R-11 — the owner's per-photo opt-out is enforced HERE, not in the page component,
          // so no future caller can render an excluded screenshot by forgetting to filter.
          eq(runPhotos.excludedFromShare, false),
        ),
      )
      .orderBy(asc(runPhotos.sortOrder), asc(runPhotos.createdAt)),

    db
      .select({ payload: insights.payload, createdAt: insights.createdAt })
      .from(insights)
      .where(and(eq(insights.scope, 'session'), inArray(insights.scopeKey, sharedRunId)))
      .orderBy(desc(insights.createdAt))
      .limit(1),
  ])

  const run = runRows[0]
  if (!run) return null
  return {
    ...run,
    splits: splitRows,
    zones: zoneRows,
    photos: photoRows,
    insightPayload: insightRows[0]?.payload ?? null,
  }
}
