import { jakartaDayOf } from '@/lib/date/ranges'
import { formatDayCompact } from '@/lib/format'

/**
 * §2.2.1 — the honesty rule on the saved screen. **Read-only and run-level.**
 *
 * The design brief: *"a saved run must show where its numbers came from... a distinct treatment for
 * a field I corrected by hand."* Per-field provenance belongs to F05's review screen, which is the
 * only place a field is still editable and the only place a per-field mark can be acted on (R-45
 * settled that it is by section there). Here the question is different and simpler: **can I trust
 * this row?** One line answers it:
 *
 *   `⌁ Read from screenshot · reviewed 20 Aug`
 *   `⌁ Read from screenshot · 2 fields corrected · reviewed 20 Aug · edited 22 Aug`
 *   `⌁ Read from screenshot · distance and splits estimated from the pace chart · reviewed 20 Aug`
 *   `⌁ Entered by hand · reviewed 20 Aug`
 *
 * **The estimate clause (R4.2)** sits right after the source because it qualifies the source: the
 * screenshot was read, but these two values were not printed on it — `lib/extract/chart/*`
 * reconstructed them from the Workout Details pace chart. It names WHICH of the two, because they
 * differ (a Summary can print the distance while the split table is missing). Absent when neither
 * was estimated, exactly like the corrections clause at zero.
 *
 * **No colour, ever.** This is provenance, not a warning: a corrected run is a run someone took
 * more care over, and tinting it amber would say the opposite. The glyph plus the words carry the
 * distinction, per dataviz's "never colour alone" — screenshot it in greyscale (§11) and nothing is
 * lost, because there was nothing in the colour to begin with. An estimate is the same: a
 * reconstruction the runner chose to keep, labelled, not an error.
 *
 * `reviewed_at` and `corrected_at` are two different questions (R-8): "has a human ever confirmed
 * this?" and "when did one last change it?". Both are printed when both exist; neither is inferred
 * from the other.
 */
export function ProvenanceMark({
  source,
  reviewedAt,
  correctedAt,
  correctedFieldCount,
  estimated,
}: {
  source: string
  reviewedAt: Date | null
  correctedAt: Date | null
  /** `Object.keys(extractions.corrections ?? {}).length` — F05 writes it, F08 only counts it. */
  correctedFieldCount: number
  /** `runs.distance_estimated` / `runs.splits_estimated` (R4). Required: every caller decides. */
  estimated: { distance: boolean; splits: boolean }
}) {
  const parts: string[] = [source === 'manual' ? 'Entered by hand' : 'Read from screenshot']

  const estimateClause = estimatedFromChart(estimated)
  if (estimateClause) parts.push(estimateClause)
  if (correctedFieldCount > 0) {
    parts.push(`${correctedFieldCount} ${correctedFieldCount === 1 ? 'field' : 'fields'} corrected`)
  }
  if (reviewedAt) parts.push(`reviewed ${formatDayCompact(jakartaDayOf(reviewedAt))}`)
  if (correctedAt) parts.push(`edited ${formatDayCompact(jakartaDayOf(correctedAt))}`)

  return (
    <p className="text-[11px] font-medium text-ink-3">
      <span aria-hidden="true">⌁ </span>
      {parts.join(' · ')}
    </p>
  )
}

/** The R4.2 clause, or null when nothing was estimated. */
function estimatedFromChart({
  distance,
  splits,
}: {
  distance: boolean
  splits: boolean
}): string | null {
  if (distance && splits) return 'distance and splits estimated from the pace chart'
  if (distance) return 'distance estimated from the pace chart'
  if (splits) return 'splits estimated from the pace chart'
  return null
}
