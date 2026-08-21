// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. See the comment in that file — this ordering is the whole point.
import './loadEnvLocal'

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { score } from '../../research/score.mjs'
import { TRUTH } from '../../research/schema.mjs'
import { extractJsonObject } from '@/lib/llm/extractJson'
import { TOKEN_FLOOR_PER_IMAGE } from '@/lib/llm/vision'
import {
  MIN_REPAIR_BUDGET_MS,
  REPAIR_TIMEOUT_MS,
  TARGET_SHORT_EDGE_PX,
} from '@/lib/extract/constants'
import { makeExtractedSessionSchema, type ScreenKind } from '@/lib/schema/extractedSession'

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
 *  ── THE FIXTURES ARE COMMITTED ────────────────────────────────────────────────────────────
 *  `research/fixtures/screenshots/shipped/{1,2,3}.jpg` — the three canonical screenshots at the
 *  **shipped 560w/q80 recipe**, i.e. exactly what a browser upload sends. Committed on
 *  2026-08-21 (they had been lost from the image cache, which is why an earlier revision of this
 *  file was gated on an env var and skipped). `research/fixtures/screenshots/{1,2,3}.png` are the
 *  739x1600 originals they are derived from, and `scripts/shipped-image-recipe.py` regenerates
 *  the derivation.
 *
 *  Sending the SHIPPED recipe rather than the originals is the point: it is what production
 *  actually puts on the wire (~3,600 input tokens, against 5,494 for the originals), so a
 *  regression in accuracy at the compressed size is caught here rather than in production.
 *
 *  `RI_FIXTURE_DIR` still overrides the directory, for pointing the suite at a different run.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const DEFAULT_FIXTURE_DIR = 'research/fixtures/screenshots/shipped'
const FIXTURE_DIR = process.env.RI_FIXTURE_DIR ?? DEFAULT_FIXTURE_DIR
/** `.jpg` in the default directory (the shipped recipe); an override may hold `.png` originals. */
const EXT = existsSync(path.join(FIXTURE_DIR, '1.jpg')) ? 'jpg' : 'png'
const FILES: Array<{ file: string; kind: ScreenKind }> = [
  { file: `1.${EXT}`, kind: 'summary' },
  { file: `2.${EXT}`, kind: 'splits' },
  { file: `3.${EXT}`, kind: 'heartrate' },
]

const haveFixtures =
  FIXTURE_DIR !== '' && FILES.every((f) => existsSync(path.join(FIXTURE_DIR, f.file)))
/** A key that is neither absent nor one of the two placeholders this repo ships. */
const PLACEHOLDER_KEYS = new Set(['', 'ci-dummy-key', 'unit-test-key-never-sent'])
const haveKey = !PLACEHOLDER_KEYS.has(process.env.LLM_API_KEY ?? '')
const runnable = haveFixtures && haveKey

const ALL_KINDS: ReadonlySet<ScreenKind> = new Set(['summary', 'splits', 'heartrate'])

/**
 * Loads the fixtures as data URIs, with the media type matching what is on disk. By default these
 * are the 560x1212 q80 JPEGs the browser would have produced, so `prompt_tokens` lands near the
 * ~3,600 production really pays rather than the 5,494 the 739x1600 originals cost.
 */
function loadImages() {
  const mime = EXT === 'jpg' ? 'image/jpeg' : 'image/png'
  return FILES.map(({ file, kind }) => ({
    kind,
    dataUri: `data:${mime};base64,${readFileSync(path.join(FIXTURE_DIR, file)).toString('base64')}`,
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

    // Clears 1,500 by more than 2x, which is the margin §1 designed for.
    expect(result.promptTokens).toBeGreaterThan(TOKEN_FLOOR_PER_IMAGE * 3)

    console.log(
      `[live] token cost for 3 images at ${EXT === 'jpg' ? `the shipped recipe (short edge ${TARGET_SHORT_EDGE_PX}px, q80)` : 'ORIGINAL 739x1600 png'}: ` +
        `${result.promptTokens}`,
    )

    // MEASURED 2026-08-21: **3,628** at the shipped recipe, **5,494** at original PNG size.
    // `research/downscale.mjs` recorded 3,277 and 5,143 for the same two variants — ours run ~350
    // higher in both because the production prompt carries RULES 6a/8/9 on top of the wording
    // that was scored. The delta is the prompt, not the pixels: it is the SAME ~350 either way.
    //
    // The band below is wide on purpose. This assertion's job is to catch the image size silently
    // changing (the §3.1 trap reopening would roughly halve it; sending originals by mistake would
    // add ~1,900), not to pin a vendor's tokeniser to the digit.
    if (EXT === 'jpg') {
      expect(result.promptTokens).toBeGreaterThan(3_000)
      expect(result.promptTokens).toBeLessThan(4_200)
    } else {
      expect(result.promptTokens).toBeGreaterThan(5_000)
    }
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
 * These two need a real key but no fixtures at all: R-2 makes the repair text-only, so there is
 * nothing to attach. They were the only live coverage F04 had on the day the screenshots were
 * missing, and they are kept separate because that independence is useful — a fixture problem
 * cannot mask a repair-path regression.
 */
describe.skipIf(!haveKey)('live: the repair path — text-only, so it needs no screenshots', () => {
  it('live: TASK 19 — a REALISTIC full-session repair, timed', async () => {
    // Task 19 closed on 2026-08-21, and its result moved two constants twice. The first attempt
    // repaired a truncated stub and reported 11,460 ms — which is what made 18 s look safe. It is
    // not: latency tracks COMPLETION tokens, and a stub repair emits ~338 of them where a real one
    // has to re-emit the whole session (~1,070). So this test asks for the realistic thing.
    //
    // MEASURED, three samples: 27,640 / 31,905 / 34,872 ms, all at out~1,070.
    // See lib/extract/constants.ts for what those numbers cost the design.
    const { callVisionRepair } = await import('@/lib/llm/vision')

    // The full 108-field session with one split's hrBpm missing — the exact vendor failure
    // IMPLEMENTATION_PLAN §1.6 measured, and the one the repair exists for.
    const malformed = JSON.stringify(
      {
        ...TRUTH,
        splits: TRUTH.splits.map((sp, i) => (i === 3 ? { ...sp, hrBpm: undefined } : sp)),
      },
      null,
      2,
    )

    const startedAt = Date.now()
    const result = await callVisionRepair(
      {
        kinds: ['summary', 'splits', 'heartrate'],
        malformedText: malformed,
        issues: '- splits.3.hrBpm: Invalid input: expected number, received undefined',
      },
      { timeoutMs: 120_000 },
    )
    const ms = Date.now() - startedAt

    console.log(
      `[live] TASK 19 — full-session text-only repair: ${ms}ms, in=${result.promptTokens} ` +
        `out=${result.completionTokens} (~${(ms / (result.completionTokens || 1)).toFixed(0)}ms/token). ` +
        `Measured band 27.6-34.9s; REPAIR_TIMEOUT_MS=${REPAIR_TIMEOUT_MS}, gate=${MIN_REPAIR_BUDGET_MS}.`,
    )

    // No image was resent (R-2 / D17): the prompt cost must stay well under what the images cost.
    expect(result.promptTokens).toBeLessThan(3_000)
    // It must complete inside the timeout the constants promise, or that timeout is a lie.
    expect(ms).toBeLessThan(REPAIR_TIMEOUT_MS)

    // The repair produced a SHAPE-valid session — and note what it could not do. With no image in
    // the request it cannot recover the value it was told about; all three measured samples
    // returned `hrBpm: null` there, keeping every other field intact. That is RULE 1 working, not
    // the repair failing, and it is why a `repaired` status should make a reviewer look harder.
    const repaired = makeExtractedSessionSchema(ALL_KINDS).safeParse(extractJsonObject(result.text))
    expect(repaired.success).toBe(true)
    if (repaired.success) {
      expect(repaired.data.splits).toHaveLength(11)
      expect(repaired.data.distanceKm).toBe(10.67)
      console.log(
        `[live] repaired splits[3].hrBpm = ${repaired.data.splits[3]?.hrBpm} ` +
          `(truth 173 — null here is correct: the image is not in a text-only repair)`,
      )
    }
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
        `(one real image ~1400 · the shipped 3-image request 3628 · the 3-image floor 1500)`,
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

describe.skipIf(haveFixtures && haveKey)('live suite prerequisites', () => {
  it('says exactly what is missing, rather than passing quietly', () => {
    const missing: string[] = []
    if (!haveFixtures) {
      missing.push(
        `the fixtures in ${FIXTURE_DIR} (${FILES.map((f) => f.file).join(', ')}) — they are ` +
          `committed, so this means the checkout is incomplete; or set RI_FIXTURE_DIR`,
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
