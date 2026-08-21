// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. See the comment in that file — this ordering is the whole point.
import './loadEnvLocal'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { score } from '../../research/score.mjs'
import { extractJsonObject } from '@/lib/llm/extractJson'
import { TOKEN_FLOOR_PER_IMAGE } from '@/lib/llm/vision'
import { makeExtractedSessionSchema, type ScreenKind } from '@/lib/schema/extractedSession'
import { TARGET_SHORT_EDGE_PX } from '@/lib/extract/constants'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TAGGED LIVE SUITE — Tasks 19, 20 and 23. **Never part of CI.**
 *
 *  `npm run test:live:vision` (which sets LLM_LIVE_TEST=1; `vitest.config.ts` excludes this
 *  directory otherwise). It calls the real `glm-4.6v` endpoint, so it costs money, takes ~35 s a
 *  case, and can flake on vendor availability — §1.2's `glm-4.6v-flash` overload note is a
 *  reminder this vendor's uptime is not guaranteed. §4.9's "no test may call a live LLM except
 *  the explicitly-tagged live suites" is this file's whole reason for existing separately.
 *
 *  ── WHY IT SKIPS TODAY ────────────────────────────────────────────────────────────────────
 *  It needs the three canonical screenshots, and they are **no longer on disk.**
 *  `research/lib.mjs` reads them from an image-cache directory that has since been cleared, and
 *  nothing in `research/` preserved either the images or the raw text of the 108/108 runs — only
 *  their scores and timings (`results-repeat.json`).
 *
 *  So this suite is written to be RUNNABLE THE MOMENT THEY COME BACK, and to skip loudly rather
 *  than silently pass in the meantime:
 *
 *      RI_FIXTURE_DIR=/path/to/the/three/screenshots npm run test:live:vision
 *
 *  expecting `1.png` (summary), `2.png` (splits), `3.png` (heartrate) — the names
 *  `research/run-extract.mjs` already uses. Until then `npm run test:live:vision` reports these
 *  as skipped, and the offline gate (`tests/research/goldenFixture.test.ts`) is what actually
 *  runs on every PR.
 *
 *  Tasks 19, 20 and 23 are therefore **NOT closed**, and the F04 execution record says so rather
 *  than claiming a measurement that was not taken.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const FIXTURE_DIR = process.env.RI_FIXTURE_DIR ?? ''
const FILES: Array<{ file: string; kind: ScreenKind }> = [
  { file: '1.png', kind: 'summary' },
  { file: '2.png', kind: 'splits' },
  { file: '3.png', kind: 'heartrate' },
]

const haveFixtures =
  FIXTURE_DIR !== '' && FILES.every((f) => existsSync(path.join(FIXTURE_DIR, f.file)))
/** A key that is neither absent nor one of the two placeholders this repo ships. */
const PLACEHOLDER_KEYS = new Set(['', 'ci-dummy-key', 'unit-test-key-never-sent'])
const haveKey = !PLACEHOLDER_KEYS.has(process.env.LLM_API_KEY ?? '')
const runnable = haveFixtures && haveKey

const ALL_KINDS: ReadonlySet<ScreenKind> = new Set(['summary', 'splits', 'heartrate'])

/**
 * Loads the fixtures as data URIs. NOTE: these are the ORIGINAL PNGs, not the shipped 560w/q80
 * JPEGs — the compression step runs in a browser and cannot run here. So `prompt_tokens` will
 * read ~5,143 (the "original png 739w" row of `research/downscale.mjs`), not the 3,277 the
 * production client produces. The assertion below accounts for that explicitly rather than
 * pretending this measures the shipped recipe's token cost.
 */
function loadImages() {
  return FILES.map(({ file, kind }) => ({
    kind,
    dataUri: `data:image/png;base64,${readFileSync(path.join(FIXTURE_DIR, file)).toString('base64')}`,
  }))
}

describe.skipIf(!runnable)('live: glm-4.6v against the three real screenshots', () => {
  it('live: scores 108/108 with the PRODUCTION prompt — Task 20’s re-validation', async () => {
    // Task 20's whole point: the production prompt adds RULES 6a, 8 and 9 and per-image labels on
    // top of the wording that measured 108/108. Those additions are ADDITIVE to the proven block,
    // which is the safest form of change to a prompt this load-bearing — but "safest" is not
    // "verified", and this is the verification. If it regresses, the labels are wrong, not the
    // underlying prompt: revert toward `research/schema.mjs`'s SYSTEM/SHAPE and iterate.
    const { callVisionPrimary } = await import('@/lib/llm/vision')
    const result = await callVisionPrimary(loadImages(), { timeoutMs: 120_000 })

    const validated = makeExtractedSessionSchema(ALL_KINDS).safeParse(
      extractJsonObject(result.text),
    )
    expect(validated.success).toBe(true)
    if (!validated.success) return

    const scored = score(validated.data)
    console.log(
      `[live] ${scored.pass}/${scored.total} (${scored.pct}%)  in=${result.promptTokens} out=${result.completionTokens}`,
    )
    if (scored.errs.length) console.log('[live] misses:\n  ' + scored.errs.join('\n  '))

    expect(scored.errs).toEqual([])
    expect(scored.pass).toBe(108)
  })

  it('live: three images clear the token floor by a wide margin', async () => {
    const { callVisionPrimary } = await import('@/lib/llm/vision')
    const result = await callVisionPrimary(loadImages(), { timeoutMs: 120_000 })

    expect(result.promptTokens).toBeGreaterThan(TOKEN_FLOOR_PER_IMAGE * 3)
    // The originals are 739w, which `research/downscale.mjs` measured at 5,143 input tokens. The
    // shipped 560w/q80 recipe costs 3,277 — a number only a browser-compressed upload produces,
    // so it is asserted in the offline suite against the fixture instead of here.
    expect(result.promptTokens).toBeGreaterThan(3_000)
    console.log(
      `[live] token cost for 3 ORIGINAL pngs: ${result.promptTokens} (shipped 560w/q80 recipe: 3277, target short edge ${TARGET_SHORT_EDGE_PX}px)`,
    )
  })

  it('live: three consecutive runs all score 108/108 — acceptance criterion 2', async () => {
    const { callVisionPrimary } = await import('@/lib/llm/vision')
    const scores: number[] = []
    const timings: number[] = []

    for (let i = 0; i < 3; i++) {
      const startedAt = Date.now()
      const result = await callVisionPrimary(loadImages(), { timeoutMs: 120_000 })
      timings.push(Date.now() - startedAt)
      const validated = makeExtractedSessionSchema(ALL_KINDS).safeParse(
        extractJsonObject(result.text),
      )
      scores.push(validated.success ? score(validated.data).pass : 0)
    }

    const median = timings.slice().sort((a, b) => a - b)[1]!
    console.log(`[live] scores ${scores.join(', ')} · median ${Math.round(median / 1000)}s`)

    expect(scores).toEqual([108, 108, 108])
    // §1.3 measured a 33.7 s median. 45 s is the production timeout; if the median approaches it,
    // PRIMARY_TIMEOUT_MS needs revisiting before the next release, not after.
    expect(median).toBeLessThan(45_000)
  })
})

/**
 * These two need a real key but NO screenshots, so unlike everything above they are runnable
 * today — the text-only repair carries no images by ruling (R-2), and the token-floor reality
 * check only needs *an* image, not the canonical one.
 */
describe.skipIf(!haveKey)('live: what can be measured without the canonical screenshots', () => {
  it('live: TASK 19 — measures the real text-only repair latency', async () => {
    // The repair budget in `lib/extract/constants.ts` is DESIGNED, not measured: no repair
    // round-trip has ever been timed on this path. R-2 made the repair text-only, which should
    // make it far cheaper than the 20 s the plan budgeted when it still resent three images — but
    // "should" is not a measurement. This is the one that turns it into one.
    const { callVisionRepairWithFetch, callVisionRepair } = await import('@/lib/llm/vision')
    expect(typeof callVisionRepairWithFetch).toBe('function')

    const startedAt = Date.now()
    const result = await callVisionRepair(
      {
        kinds: ['summary', 'splits', 'heartrate'],
        // A deliberately truncated reply — the shape a `finish_reason: 'length'` produces, which
        // is also the cheapest realistic thing to ask a repair to fix.
        malformedText: '{"activityType": "Outdoor Run", "distanceKm": 10.67, "splits": [{"km": 1,',
        issues: '- splits.0.timeSec: Invalid input: expected number, received undefined',
      },
      { timeoutMs: 60_000 },
    )
    const ms = Date.now() - startedAt

    console.log(
      `[live] TASK 19 — text-only repair: ${ms}ms, in=${result.promptTokens} out=${result.completionTokens}. ` +
        `Update REPAIR_TIMEOUT_MS / MIN_REPAIR_BUDGET_MS in lib/extract/constants.ts and §4.6 of ` +
        `docs/plans/F04-ingest-extraction.md against this number.`,
    )

    // The only hard assertion: a text-only repair must be cheap in tokens. If it is not, an image
    // is being resent somewhere and R-2 has been violated.
    expect(result.promptTokens).toBeLessThan(TOKEN_FLOOR_PER_IMAGE * 3)
  })

  it('live: the guard’s two thresholds behave as designed against the REAL endpoint', async () => {
    // Measured live 2026-08-21 with an arbitrary 2 MB PNG (not the canonical fixture, which is
    // gone — so this proves the GUARD, not the extraction accuracy):
    //
    //   one real image, our exact body shape  -> HTTP 200, prompt_tokens = 1411
    //   the same request with no image at all -> HTTP 200, prompt_tokens = 35
    //
    // Both numbers matter. 1411 clears 1 x 500 comfortably and falls SHORT of 3 x 500, so a
    // 3-image request that delivered only one image trips exactly as intended. And 35 would trip
    // a 1-image floor outright — which is the live confirmation of R-2's corollary: flooring the
    // text-only repair would fail every repair this app ever attempts.
    const { callVisionPrimary, callVisionRepair } = await import('@/lib/llm/vision')
    expect(typeof callVisionPrimary).toBe('function')

    const repair = await callVisionRepair(
      { kinds: ['summary'], malformedText: '{', issues: '- (root): unterminated object' },
      { timeoutMs: 60_000 },
    )
    console.log(
      `[live] production text-only repair prompt_tokens = ${repair.promptTokens} ` +
        `(one real image ~1400 · the shipped 3-image request 3277 · the 3-image floor 1500)`,
    )

    // MEASURED 2026-08-21: **1135 tokens** — and that number is the interesting part of this test.
    // It is thirty times the 35 a bare text turn costs, because the production system prompt
    // carries nine rules plus the SHAPE block plus the model's malformed reply. A "text-only"
    // repair costs roughly as much as ONE image, with no image in it.
    //
    // Which SHARPENS R-2's corollary rather than softening it: 1135 clears a 1-image floor but
    // sits below the 3 × 500 = 1500 floor a three-screenshot upload would have carried. Had the
    // repair inherited the primary call's image count, every repair after a three-image upload —
    // the common case — would have died with a spurious VisionTokenFloorError. Passing
    // `imageCount: 0` is not a technicality; it is the difference between the repair path working
    // and never working at all.
    expect(repair.promptTokens).toBeLessThan(TOKEN_FLOOR_PER_IMAGE * 3)
    // And it must be nowhere near the cost of resending the images, or R-2 has been violated.
    expect(repair.promptTokens).toBeLessThan(3_277)
  })
})

describe.skipIf(haveFixtures)('live suite prerequisites', () => {
  it('says exactly what is missing, rather than passing quietly', () => {
    const missing: string[] = []
    if (!haveFixtures) {
      missing.push(
        `the three canonical screenshots (set RI_FIXTURE_DIR to a directory holding ${FILES.map((f) => f.file).join(', ')})`,
      )
    }
    if (!haveKey) missing.push('a real LLM_API_KEY (load .env.local)')

    console.log(`[live] SKIPPED — missing: ${missing.join('; ')}`)
    // Not a failure: the suite is opt-in and its prerequisites are external. But it must never
    // look like a pass, which is why it prints and why the execution record lists Tasks 19/20/23
    // as open.
    expect(missing.length).toBeGreaterThan(0)
  })
})
