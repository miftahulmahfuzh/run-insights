import Link from 'next/link'

import { EmptySlot } from '@/components/ui'
import { formatDay } from '@/lib/format'
import { formatRecordValue, RECORD_LABELS } from '@/lib/records/labels'
import type { RecordKey } from '@/lib/records/types'

export interface RecordRowView {
  key: RecordKey
  runId: string
  value: number
  achievedOn: string
  previousValue: number | null
}

/**
 * The ten personal records, in `RECORD_CATALOG` order, each linking to the run that holds it.
 *
 * ── A KEY WITH NO HOLDER IS ABSENT, NOT ZERO ────────────────────────────────────────────────
 * `records` only ever contains keys something qualified for (F06's `replaceRecords`), so a runner
 * with no 10 km run has no `fastest_pace_10k` row. This renders only what is there. Printing
 * "Fastest pace, 10 km+ — 0'00\"/km" would be a claim about a run that does not exist, and the same
 * reasoning F08 applies to an empty zone bar (five 0% segments is not "no data") applies here.
 *
 * ── `previousValue` IS THE INTERESTING HALF ─────────────────────────────────────────────────
 * F06 keeps the value the key was worth before the current holder took it, specifically so a shelf
 * can say "beat 7'30\" to get here". Where it exists it is shown; where the current holder is the
 * first ever, there is nothing to compare against and nothing is printed.
 */
export function RecordsTable({ rows }: { rows: readonly RecordRowView[] }) {
  if (rows.length === 0) {
    return <EmptySlot>No records yet. The first reviewed run sets most of them at once.</EmptySlot>
  }

  return (
    <ul className="flex flex-col">
      {rows.map((row, index) => (
        <li key={row.key} className={index === 0 ? '' : 'mt-3 border-t border-rule-2 pt-3'}>
          <Link href={`/r/${row.runId}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 text-[13px] font-medium text-ink-2">
              {RECORD_LABELS[row.key]}
            </span>
            <span className="text-right">
              <span className="block text-[15px] font-semibold text-ink tabular-nums">
                {formatRecordValue(row.key, row.value)}
              </span>
              <span className="block text-[11px] font-medium text-ink-3 tabular-nums">
                {formatDay(row.achievedOn)}
                {row.previousValue != null &&
                  ` · was ${formatRecordValue(row.key, row.previousValue)}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
