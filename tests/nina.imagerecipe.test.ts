import { describe, expect, it } from 'vitest'

import { buildNinaImagePrompt, sidecarText } from '@/lib/nina/imagegen'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import {
  buildImageRequestBody,
  jakartaDayStart,
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_PATHNAME_RE,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_RESOLUTION,
  NINA_IMAGE_STALE_MS,
  NINA_IMAGE_SWEEP_BUDGET,
  ninaImagePathname,
  NINA_WORKER_CALL_TIMEOUT_MS,
  NINA_WORKER_TIMEOUT_MINUTES,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '@/lib/nina/imagerecipe'

describe('the payload — the two surviving ported facts', () => {
  const body = buildImageRequestBody({ prompt: 'a photograph', seed: 42 })

  it('targets /images/generations with the right model', () => {
    // FACT 1. There is no /images/edits on this provider, and chat-completions with `modalities`
    // is refused by this model. Verified twice by this plan set's probes.
    expect(OPENROUTER_IMAGE_URL).toBe('https://openrouter.ai/api/v1/images/generations')
    expect(body.model).toBe(NINA_IMAGE_MODEL)
  })

  it('sends resolution and aspect_ratio, never size', () => {
    // FACT 2. `size` is ignored and the default is 2K — a 2048-px master, after the money is spent.
    expect(body.resolution).toBe(NINA_IMAGE_RESOLUTION)
    expect(body.aspect_ratio).toBe(NINA_IMAGE_ASPECT)
    expect(body.size).toBeUndefined()
  })

  it('sends the seed it was given', () => {
    // FACT 3. Honoured by this model, so a retry reproduces the same photograph.
    expect(body.seed).toBe(42)
    expect(body.n).toBe(1)
  })

  it('sends NO reference image (RU-18)', () => {
    // The anchor is dropped. `input_references` doubled the latency (148.9 s vs 78.2 s) for a
    // property the user deferred knowingly. Do not add it back.
    expect(body.input_references).toBeUndefined()
    expect(body.messages).toBeUndefined()
    expect(body.modalities).toBeUndefined()
  })
})

describe('the prompt', () => {
  it('carries her appearance, the scene, and the photographic style', () => {
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    expect(prompt).toContain('on the track')
    expect(prompt).toContain('high ponytail') // NINA_APPEARANCE, phase 2
    expect(prompt).toContain('Realistic photograph')
  })

  it('puts the mood AFTER the scene, as a refinement', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug, out of breath',
    })
    expect(prompt.indexOf('smug')).toBeGreaterThan(prompt.indexOf('on the track'))
  })

  it('the avatar variant asks for head and shoulders', () => {
    expect(buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })).toContain('head and shoulders')
  })

  it('never claims a reference image is authoritative', () => {
    // The first draft's subject line said "this is the same woman as the reference image". RU-18
    // removed the reference, and an instruction to defer to an absent image degrades the prompt.
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt.toLowerCase()).not.toContain('reference')
  })

  it('the sidecar records prompt, model and seed, and says there is no reference', () => {
    const text = sidecarText({ prompt: 'p', seed: 42, purpose: 'selfie' })
    expect(text).toContain(NINA_IMAGE_MODEL)
    expect(text).toContain('seed:       42')
    expect(text).toContain('reference:  none (RU-18)')
    expect(text).toContain('--- prompt as sent ---')
  })
})

describe('the pathname', () => {
  it('is under nina/<userId>/ and matches the exported regex', () => {
    const path = ninaImagePathname('user00000001', 'selfie', 'abcdefghijkl')
    expect(path).toBe('nina/user00000001/selfie-abcdefghijkl.png')
    expect(NINA_IMAGE_PATHNAME_RE.test(path)).toBe(true)
  })

  it('agrees with the ONE definition of the prefix (RULING A6)', () => {
    /*
     * `imagerecipe.ts` cannot import `NINA_BLOB_PREFIX` — it must stay zero-import so the Actions
     * worker can load it under `--experimental-strip-types` — so it spells `nina/` inline. This
     * assertion is what makes that duplication checked rather than merely intended. A test can
     * import both modules; the worker still cannot.
     */
    expect(
      ninaImagePathname('user00000001', 'selfie', 'abcdefghijkl').startsWith(NINA_BLOB_PREFIX),
    ).toBe(true)
  })

  it("admits phase 14's .jpg avatar", () => {
    expect(NINA_IMAGE_PATHNAME_RE.test('nina/user00000001/avatar-abcdefghijkl.jpg')).toBe(true)
  })
})

describe('the reported cost', () => {
  it('prefers usage.cost, in micro-USD', () => {
    // The index measured $0.040 with `usage.cost` present. This is the field name to trust.
    expect(readReportedCostMicroUsd({ cost: 0.04 })).toBe(40_000)
  })

  it('accepts total_cost as a second spelling', () => {
    expect(readReportedCostMicroUsd({ total_cost: 0.055 })).toBe(55_000)
  })

  it('falls back to null, not to zero, when the provider says nothing', () => {
    // Null makes the caller substitute the constant. Zero would silently report a free image.
    expect(readReportedCostMicroUsd(undefined)).toBeNull()
    expect(readReportedCostMicroUsd({})).toBeNull()
    expect(readReportedCostMicroUsd({ cost: 'free' })).toBeNull()
  })

  it('the constant is the measured price, as a fallback', () => {
    expect(NINA_IMAGE_COST_MICRO_USD).toBe(40_000)
  })
})

describe('jakartaDayStart', () => {
  it('rolls over at 00:00 +07:00, not at UTC midnight', () => {
    // 2026-09-03T16:30:00Z is 2026-09-03 23:30 in Jakarta — still the 3rd.
    expect(jakartaDayStart(new Date('2026-09-03T16:30:00Z')).toISOString()).toBe(
      '2026-09-02T17:00:00.000Z',
    )
    // 2026-09-03T17:30:00Z is 2026-09-04 00:30 in Jakarta — a new day, a fresh quota.
    expect(jakartaDayStart(new Date('2026-09-03T17:30:00Z')).toISOString()).toBe(
      '2026-09-03T17:00:00.000Z',
    )
  })

  it('is idempotent on its own output', () => {
    const start = jakartaDayStart(new Date('2026-09-03T16:30:00Z'))
    expect(jakartaDayStart(start).toISOString()).toBe(start.toISOString())
  })
})

describe('the threshold chain', () => {
  // Every one of these is derived in the plan's §The threshold arithmetic. They are asserted here so
  // an edit to one cannot silently break the ordering the whole R22 guarantee rests on.

  it('the call timeout is at least 2x the measured 78.2 s', () => {
    expect(NINA_WORKER_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(160_000)
  })

  it("the workflow's job ceiling exceeds the call timeout plus setup", () => {
    expect(NINA_WORKER_TIMEOUT_MINUTES * 60_000).toBeGreaterThan(
      NINA_WORKER_CALL_TIMEOUT_MS + 60_000,
    )
  })

  it('a running job is only reclaimed after it cannot still be running', () => {
    // > the workflow ceiling, or a live generation would be claimed twice and billed twice.
    expect(NINA_IMAGE_RECLAIM_MS).toBeGreaterThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
  })

  it('the dispatch grace is shorter than the reclaim', () => {
    expect(NINA_IMAGE_DISPATCH_GRACE_MS).toBeLessThan(NINA_IMAGE_RECLAIM_MS)
  })

  it('the app gives up only after the retries can have been exhausted', () => {
    // Otherwise she would apologise while a runner was still generating, and the photograph would
    // land after the apology. THIS is the inequality R22 depends on most.
    expect(NINA_IMAGE_STALE_MS).toBeGreaterThan(NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS)
  })

  it('a sweep run cannot exceed the workflow ceiling', () => {
    // 3 x 78 s at the measured latency, inside 6 minutes.
    expect(NINA_IMAGE_SWEEP_BUDGET * 90_000).toBeLessThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
  })

  it('the retry budget is small and positive', () => {
    expect(NINA_IMAGE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1)
    expect(NINA_IMAGE_MAX_ATTEMPTS).toBeLessThanOrEqual(3)
  })

  it('the cap is a small positive integer', () => {
    expect(Number.isInteger(NINA_IMAGE_DAILY_CAP)).toBe(true)
    expect(NINA_IMAGE_DAILY_CAP).toBeGreaterThan(0)
    expect(NINA_IMAGE_DAILY_CAP).toBeLessThanOrEqual(20)
  })
})
