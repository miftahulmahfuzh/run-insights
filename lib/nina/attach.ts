import { formatDay, formatDistanceM, formatDuration, formatPace } from '@/lib/format'

/**
 * A run, as it appears inside a chat bubble (R13) and above the composer while it is pinned.
 *
 * ── WHY DISPLAY-READY STRINGS AND NOT THE ROW ─────────────────────────────────────────────────
 * The card must show the same numbers `/r/[id]` shows, spelled the same way — invariant 3, and the
 * failure it prevents is the one R-42 records: a second place that formats a distance is a second
 * place that can disagree about `10.67 km`. So the mapping happens on the server, through
 * `lib/format.ts`, and the client component receives sentences. It also means `RunAttachmentCard`
 * needs no formatter import at all, which is what makes it trivially f08-guard-clean.
 *
 * ── WHY `RunAttachmentInput` IS DECLARED HERE ─────────────────────────────────────────────────
 * Structural, not imported from `lib/db`. Phase 2 draws the same boundary with `NinaRunInput`: the
 * pure module states what it needs, and the query happens to return something assignable to it. A
 * column rename is then a compile error at one call site rather than a change to this file.
 */
export interface RunAttachmentInput {
  id: string
  /** `runs.occurred_on`, `'YYYY-MM-DD'`, the Asia/Jakarta calendar day (D6). */
  occurredOn: string
  location: string | null
  activityType: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
}

export interface RunAttachment {
  /** The run to open. `/r/${runId}`. */
  runId: string
  /** `'Thu, 20 Aug 2026'`. */
  day: string
  /** `'Outdoor Run'` — what the run page's hero label says. */
  activityType: string
  location: string | null
  /** `'10.67 km'`. */
  distance: string
  /** `'1:02:33'`. */
  duration: string
  /** `'5'52"/km'` — with the unit, because on a card there is no column header to carry it. */
  pace: string
}

/** The query parameter that arms the composer: `/nina?attach=<runId>`. */
export const ATTACH_PARAM = 'attach'

export function toRunAttachment(row: RunAttachmentInput): RunAttachment {
  return {
    runId: row.id,
    day: formatDay(row.occurredOn),
    activityType: row.activityType,
    location: row.location,
    distance: formatDistanceM(row.distanceM),
    duration: formatDuration(row.durationSec),
    pace: formatPace(row.avgPaceSec, true),
  }
}

/**
 * `runId -> attachment`, for the one pass `app/nina/page.tsx` makes over the conversation. A Map
 * rather than an array so a message with an attachment is O(1) and a message without one costs
 * nothing.
 */
export function indexAttachments(rows: readonly RunAttachmentInput[]): Map<string, RunAttachment> {
  const index = new Map<string, RunAttachment>()
  for (const row of rows) index.set(row.id, toRunAttachment(row))
  return index
}
