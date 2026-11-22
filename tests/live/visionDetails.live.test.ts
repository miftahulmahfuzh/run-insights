// MUST be first: it loads .env.local before any import below reaches lib/env.ts.
import { hasRealLlmKey } from './loadEnvLocal'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractJsonObject } from '@/lib/llm/extractJson'
import { TOKEN_FLOOR_PER_IMAGE } from '@/lib/llm/vision'
import { DetailsPrintedSchema, type DetailsPrinted } from '@/lib/schema/detailsPrinted'

/**
 * THE TAGGED LIVE SUITE for the Workout Details reading. Never part of CI.
 * `npm run test:live:vision-details` — two real `glm-4.6v` calls, one per committed fixture, sent
 * as phase 1's committed SHIPPED-recipe JPEG (560 px / q80, what a browser upload actually sends).
 * The truth values were read off the screenshots by hand; the prompt's worked examples use other
 * numbers on purpose, so a pass cannot come from the model copying an example.
 */

const DIR = process.env.RI_DETAILS_FIXTURE_DIR ?? 'research/fixtures/workout-details/shipped'

const CASES: Array<{ file: string; truth: DetailsPrinted }> = [
  {
    file: '2026-11-22-details.jpg',
    truth: {
      durationSec: 3046,
      distanceKm: null,
      paceSlowestSecPerKm: 552,
      paceFastestSecPerKm: 407,
      avgPaceSecPerKm: null,
      hrMinBpm: 116,
      hrMaxBpm: 177,
      avgHrBpm: 161,
      elevationGainM: 4,
    },
  },
  {
    file: '2026-11-20-details.jpg',
    truth: {
      durationSec: 2773,
      distanceKm: null,
      paceSlowestSecPerKm: 497,
      paceFastestSecPerKm: 365,
      avgPaceSecPerKm: 459,
      hrMinBpm: 101,
      hrMaxBpm: 186,
      avgHrBpm: 169,
      elevationGainM: 6,
    },
  },
]

const runnable =
  hasRealLlmKey(process.env.LLM_API_KEY) && CASES.every((c) => existsSync(path.join(DIR, c.file)))

function shippedDataUri(file: string): string {
  return `data:image/jpeg;base64,${readFileSync(path.join(DIR, file)).toString('base64')}`
}

describe.skipIf(!runnable)('live: glm-4.6v reads the Workout Details screen', () => {
  it.each(CASES)('reads every printed number on $file', async ({ file, truth }) => {
    const { callVisionDetails } = await import('@/lib/llm/vision')
    const result = await callVisionDetails(
      { dataUri: shippedDataUri(file) },
      { timeoutMs: 120_000 },
    )
    console.log(
      `[live] ${file} in=${result.promptTokens} out=${result.completionTokens}\n${result.text}`,
    )

    expect(result.promptTokens).toBeGreaterThanOrEqual(TOKEN_FLOOR_PER_IMAGE)
    const parsed = DetailsPrintedSchema.safeParse(extractJsonObject(result.text))
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data).toEqual(truth)
  })
})
