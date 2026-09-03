import 'server-only'

import { getRecords, getReviewedRunsWithChildren, replaceRecords } from '@/lib/db/queries'
import type { ZoneRow } from '@/lib/metrics/types'
import { isRecordKey } from './catalog'
import type { RecordsGateway, RecordRunRow } from './recompute'
import type { RecordKey, StoredRecord } from './types'

/**
 * The real `RecordsGateway` — the only file in `lib/records` that touches the database, and it
 * contains no arithmetic whatsoever. Every decision about what a record IS lives in `catalog.ts`
 * and `compute.ts`, which never import this.
 */
export const dbRecordsGateway: RecordsGateway = {
  async fetchReviewedRuns(userId: string): Promise<RecordRunRow[]> {
    const runs = await getReviewedRunsWithChildren(userId)
    return runs.map((run) => ({
      runId: run.id,
      occurredOn: run.occurredOn,
      distanceM: run.distanceM,
      durationSec: run.durationSec,
      avgHrBpm: run.avgHr,
      splits: run.splits.map((s) => ({
        km: s.km,
        timeSec: s.timeSec,
        paceSec: s.paceSec,
        hr: s.hr,
        cadence: s.cadence,
        partial: s.partial,
      })),
      // `run_zones.zone` is a plain `int` in Postgres; the 1..5 domain is enforced by F04's Zod
      // schema on the way in, so this narrowing restates a guarantee rather than assuming one.
      zones: run.zones.map((z) => ({
        zone: z.zone as ZoneRow['zone'],
        durationSec: z.durationSec,
        minBpm: z.minBpm,
        maxBpm: z.maxBpm,
      })),
      recovery: { endHrBpm: run.endHrBpm, hrAt1MinBpm: run.hr1MinPostBpm },
      avgPaceSec: run.avgPaceSec,
      startedAt: run.startedAt,
      activeKcal: run.activeKcal,
      elevationM: run.elevationM,
      avgCadence: run.avgCadence,
      maxHr: run.maxHr,
    }))
  },

  async readCurrent(userId: string): Promise<Map<RecordKey, StoredRecord>> {
    const rows = await getRecords(userId)
    const out = new Map<RecordKey, StoredRecord>()
    for (const row of rows) {
      // A key the catalog no longer defines is dropped rather than carried: it cannot be
      // recomputed, so keeping it would pin a row nothing can ever update or remove. The wholesale
      // replace below then deletes it from the table on the next real change.
      if (!isRecordKey(row.key)) continue
      out.set(row.key, {
        key: row.key,
        runId: row.runId,
        value: row.value,
        achievedOn: row.achievedOn,
        previousValue: row.previousValue,
      })
    }
    return out
  },

  async replace(userId: string, rows: readonly StoredRecord[]): Promise<void> {
    await replaceRecords(
      userId,
      rows.map((r) => ({
        key: r.key,
        runId: r.runId,
        value: r.value,
        achievedOn: r.achievedOn,
        previousValue: r.previousValue,
      })),
    )
  },
}
