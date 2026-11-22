import 'server-only'

import { PRIMARY_TIMEOUT_MS, type ExtractionErrorCode } from '@/lib/extract/constants'
import { decodeToRgb } from '@/lib/extract/chart/decode'
import type { RgbImage } from '@/lib/extract/chart/estimate'
import { DetailsPrintedSchema, type DetailsPrinted } from '@/lib/schema/detailsPrinted'
import { codeForVisionError } from './extract'
import { extractJsonObject } from './extractJson'
import { callVisionDetails, VisionTokenFloorError } from './vision'

/**
 * The details half of the extraction job: ONE `glm-4.6v` call for the Workout Details screen's
 * printed numbers, and the pixel decode the chart estimator needs, side by side.
 *
 * THE CONTRACT: this NEVER throws and never decides the extraction's status. Every failure —
 * transport, timeout, token floor, a reply Zod refuses, a JPEG sharp cannot decode, even an error
 * nobody anticipated — degrades to "no printed values" and/or "no pixels", and the caller simply
 * makes no estimate (invariant 4, R2.4). The extraction's other screens are never at stake here.
 *
 * No repair round-trip, by ruling: the reply is ~10 numbers, and a reading the schema refuses is
 * worth less than the 60 s ceiling it would cost.
 */

export interface DetailsDeps {
  callDetails: typeof callVisionDetails
  decode: typeof decodeToRgb
}

export const productionDetailsDeps: DetailsDeps = {
  callDetails: callVisionDetails,
  decode: decodeToRgb,
}

export interface DetailsReading {
  /** The details call's raw body, for `raw_response.details.vendor`. null when there was none. */
  vendor: unknown
  /** Validated printed values; null when the reading failed in any way. */
  printed: DetailsPrinted | null
  /** The decoded screenshot; null when the decode failed. */
  image: RgbImage | null
  promptTokens: number | null
  /** Why `printed` is null. null when the reading succeeded. */
  errorCode: ExtractionErrorCode | null
}

export async function readWorkoutDetails(
  deps: DetailsDeps,
  image: { dataUri: string; bytes: Buffer },
  budgetMs: number,
): Promise<DetailsReading> {
  // Both started through `.then` so a SYNCHRONOUS throw in either lands in allSettled too.
  const [vision, decoded] = await Promise.allSettled([
    Promise.resolve().then(() =>
      deps.callDetails(
        { dataUri: image.dataUri },
        { timeoutMs: Math.max(1, Math.min(PRIMARY_TIMEOUT_MS, budgetMs)) },
      ),
    ),
    Promise.resolve().then(() => deps.decode(image.bytes)),
  ])

  const rgb = decoded.status === 'fulfilled' ? decoded.value : null
  if (decoded.status === 'rejected') {
    console.warn('[f04] workout details decode failed; no estimate', { cause: decoded.reason })
  }

  if (vision.status === 'rejected') {
    const cause: unknown = vision.reason
    const errorCode = codeForVisionError(cause) ?? 'transport'
    const promptTokens = cause instanceof VisionTokenFloorError ? cause.promptTokens : null
    console.warn('[f04] workout details reading failed; no estimate', { errorCode, promptTokens })
    return { vendor: null, printed: null, image: rgb, promptTokens, errorCode }
  }

  const result = vision.value
  const json = extractJsonObject(result.text)
  const parsed = json === null ? null : DetailsPrintedSchema.safeParse(json)
  if (!parsed?.success) {
    console.warn('[f04] workout details reply refused by the schema; no estimate')
    return {
      vendor: result.raw,
      printed: null,
      image: rgb,
      promptTokens: result.promptTokens,
      errorCode: 'validation',
    }
  }
  return {
    vendor: result.raw,
    printed: parsed.data,
    image: rgb,
    promptTokens: result.promptTokens,
    errorCode: null,
  }
}
