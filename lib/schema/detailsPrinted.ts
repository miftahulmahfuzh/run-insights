import { z } from 'zod'

/**
 * What the Workout Details screen PRINTS, as the details vision call transcribes it — and the one
 * place that reply is validated (`lib/llm/readDetails.ts` is the only parser). Everything
 * downstream trusts this type.
 *
 * PURE MODULE. Zod only: the review screen and the merge read these types.
 *
 * ── WHY 0 READS AS null ────────────────────────────────────────────────────────────────────────
 * Apple prints "0'00''/KM" as the pace average when it has no distance (the 2026-11-22 fixture),
 * and the reader transcribes that literally as 0. No duration, pace, distance or heart rate on this
 * screen is ever really zero, so 0 is Apple's "no value" glyph and becomes null here rather than a
 * value that would scale every estimate. Elevation gain is the exception: a flat run prints "Gain: 0M".
 *
 * ── WHY AN INVERTED RANGE NULLS THE PAIR, NOT THE READING ──────────────────────────────────────
 * The pace range is printed slowest–fastest and the HR range low–high. A pair that arrives inverted
 * or equal was misread, and an estimator fed it would scale the whole chart wrongly — so the pair is
 * dropped (no estimate) while the duration, gain and averages, read independently, survive.
 */

/** A printed number in `[min, max]`, or null. `0` reads as null (see above). */
function printedNumber(min: number, max: number, integer: boolean) {
  return z
    .number()
    .nullable()
    .default(null)
    .transform((value) => (value === 0 ? null : value))
    .pipe((integer ? z.number().int() : z.number()).min(min).max(max).nullable())
}

const secPerKm = () => printedNumber(60, 3600, true)
const bpm = () => printedNumber(40, 230, true)

export const DetailsPrintedSchema = z
  .object({
    durationSec: printedNumber(1, 86_400, true),
    distanceKm: printedNumber(0.01, 300, false),
    paceSlowestSecPerKm: secPerKm(),
    paceFastestSecPerKm: secPerKm(),
    avgPaceSecPerKm: secPerKm(),
    hrMinBpm: bpm(),
    hrMaxBpm: bpm(),
    avgHrBpm: bpm(),
    elevationGainM: z.number().int().min(0).max(10_000).nullable().default(null),
  })
  .transform((value) => {
    const out = { ...value }
    if (
      out.paceSlowestSecPerKm !== null &&
      out.paceFastestSecPerKm !== null &&
      !(out.paceSlowestSecPerKm > out.paceFastestSecPerKm)
    ) {
      out.paceSlowestSecPerKm = null
      out.paceFastestSecPerKm = null
    }
    if (out.hrMinBpm !== null && out.hrMaxBpm !== null && !(out.hrMinBpm < out.hrMaxBpm)) {
      out.hrMinBpm = null
      out.hrMaxBpm = null
    }
    return out
  })

export type DetailsPrinted = z.infer<typeof DetailsPrintedSchema>

/**
 * Which of an extraction's values were measured off the pace chart rather than read off a screen.
 * Stored as `extractions.raw_response.details.estimate`, carried as `ReviewContext.estimated`.
 *
 *  - `distanceKm`: the estimated distance that was written into the parsed session, else null
 *    (null also when the distance was transcribed and the estimate only scaled the splits to it).
 *  - `splits`: true when the parsed session's splits are chart estimates.
 */
export interface EstimatedValues {
  distanceKm: number | null
  splits: boolean
}
