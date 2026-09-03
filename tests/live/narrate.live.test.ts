// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. See the comment in that file — this ordering is the whole point.
import './loadEnvLocal'

import { describe, expect, it } from 'vitest'

import { narrativeClient, narrativeModel } from '@/lib/llm/client'
import { buildSessionFacts } from '@/lib/llm/facts'
import { narrateWith } from '@/lib/llm/narrate'
import { InsightPayloadSchema } from '@/lib/llm/schema'
import { computeSessionMetrics, evaluateSessionFlags, type HrMax } from '@/lib/metrics'
import { canonicalRecordRun, canonicalSession } from '../fixtures/canonicalRun'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  Task 8 — THE TAGGED LIVE SUITE. **Never part of CI.**
 *
 *  `npm run test:live:narrate` (which sets LLM_LIVE_TEST=1; `vitest.config.ts` excludes this
 *  directory otherwise). It calls the real `glm-5.3` endpoint, so it costs money, takes ~10 s a
 *  case, and can flake on vendor availability. §4.9's "no test may call a live LLM except the
 *  explicitly-tagged live suites" is this file's reason for existing separately.
 *
 *  ── WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────────────────
 *  **Never exact prose.** Two calls against identical facts produced "very hard" one day and
 *  "hard" the next, with completely different headlines (plan §5.3) — that is the model, not a
 *  bug, and caching is what hides it from a runner. Asserting a sentence would make this suite a
 *  random number generator.
 *
 *  **Always numeric fidelity.** Every one-decimal figure the model quotes must appear verbatim in
 *  the facts it was handed. This is the live half of D2: the offline suite proves the facts carry
 *  the right numbers, and this proves the model copied rather than computed. A cited number that
 *  is not in the input is an instant, hard failure — it is `−14.1%` against a true `+12.3%`
 *  wearing a coat.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const HAS_KEY =
  process.env.LLM_API_KEY != null &&
  process.env.LLM_API_KEY !== '' &&
  process.env.LLM_API_KEY !== 'unit-test-key-never-sent' &&
  process.env.LLM_API_KEY !== 'ci-dummy-key'

const ESTIMATED_HR_MAX: HrMax = { bpm: 187, source: 'estimated' }

function canonicalFacts() {
  const metrics = computeSessionMetrics(canonicalSession, ESTIMATED_HR_MAX)
  return buildSessionFacts({
    run: {
      occurredOn: canonicalSession.occurredOn,
      distanceM: canonicalSession.distanceM,
      durationSec: canonicalSession.durationSec,
      avgPaceSec: canonicalRecordRun.avgPaceSec,
      avgHr: canonicalSession.avgHrBpm,
      maxHr: canonicalRecordRun.maxHr,
      avgCadence: canonicalRecordRun.avgCadence,
      elevationM: canonicalRecordRun.elevationM,
      activeKcal: canonicalRecordRun.activeKcal,
      intent: null,
    },
    metrics,
    flags: evaluateSessionFlags(metrics, canonicalSession.splits.find((s) => !s.partial) ?? null),
    splits: canonicalSession.splits,
    profile: { birthYear: 1996, heightCm: 169, weightKg: 55, sex: 'male' },
    promptVersion: 1,
  })
}

describe.skipIf(!HAS_KEY)('live: glm-5.3 narrates the canonical run', () => {
  it('returns a schema-valid coaching report that quotes only numbers it was given', async () => {
    const facts = canonicalFacts()
    const factsJson = JSON.stringify(facts)

    const result = await narrateWith(narrativeClient(), 'session', facts, {
      model: narrativeModel(),
    })

    expect(result.source).not.toBe('unavailable')
    expect(result.payload).not.toBeNull()
    if (result.payload == null) return

    // Shape, not content. Zod already ran inside narrateWith; re-running it here is what makes
    // the failure message readable when the endpoint changes shape under us.
    expect(InsightPayloadSchema.safeParse(result.payload).success).toBe(true)
    expect(['easy', 'moderate', 'hard', 'very hard']).toContain(result.payload.verdict)

    // A run that was 90.6% in zones 4-5 is not an easy run. This is the one content assertion,
    // and it is the widest one that is still meaningful.
    expect(['hard', 'very hard']).toContain(result.payload.verdict)

    const prose = [
      result.payload.whatHappened,
      ...result.payload.observations.flatMap((o) => [o.title, o.detail, o.metric]),
      ...result.payload.doNext,
      result.payload.questionForRunner,
    ].join(' ')

    /*
     * One-decimal figures only. Integers are hopeless as a fidelity signal — "zone 4-5", "km 10"
     * and "3 easy runs" are all bare integers the model is entitled to write — while a `12.3` or
     * a `90.6` in coaching prose is, without exception, a metric it was handed.
     */
    const quoted = [...prose.matchAll(/\d+\.\d\b/g)].map((m) => m[0])
    expect(quoted.length).toBeGreaterThan(0)

    for (const number of quoted) {
      expect(
        factsJson.includes(number),
        `the model quoted ${number}, which is nowhere in the facts it was given`,
      ).toBe(true)
    }
  })

  it('asks about intent when nothing says the effort was deliberate', async () => {
    // The canonical run fires FAST_START and HIGH_DECOUPLING with `intent: null` — exactly the
    // pattern rule 7 exists for. Asserted loosely (a question mark, plus length) because the
    // WORDING varies and only the presence of a real question is contractual.
    const result = await narrateWith(narrativeClient(), 'session', canonicalFacts(), {
      model: narrativeModel(),
    })

    expect(result.payload?.questionForRunner ?? '').toContain('?')
    expect((result.payload?.questionForRunner ?? '').length).toBeGreaterThan(15)
  })
})
