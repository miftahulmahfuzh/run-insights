import { describe, expect, it } from 'vitest'

import { buildNinaImagePrompt, sidecarText } from '@/lib/nina/imagegen'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import { NINA_TUNING_DEFAULTS, type NinaTrait, type NinaTuning } from '@/lib/nina/tuning'
import {
  buildImageRequestBody,
  jakartaDayStart,
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_FINISH_RESERVE_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_PATHNAME_RE,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_RESOLUTION,
  NINA_IMAGE_REVIVE_BUDGET,
  NINA_IMAGE_RUN_BUDGET_MS,
  NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS,
  NINA_IMAGE_STALE_MS,
  NINA_IMAGE_SWEEP_BUDGET,
  ninaImagePathname,
  NINA_HOST_MAX_DURATION_MS,
  NINA_TURN_SPENT_MS,
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

  /** One field moved off the defaults, everything else exactly as it ships. */
  function tuned(over: Partial<NinaTuning>): NinaTuning {
    return { ...NINA_TUNING_DEFAULTS, ...over }
  }

  /** One TRAIT moved. The traits are nested under `traits` — phase 1's landed shape. */
  function withTrait(key: NinaTrait, value: number): NinaTuning {
    return tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, [key]: value } })
  }

  it('PLAN INVARIANT 2: the default tuning renders the prompt that shipped, byte for byte', () => {
    /*
     * The compatibility contract of the whole set, asserted at the one place a photograph is
     * decided. Two things are checked at once: the tuning is genuinely OPTIONAL (the left-hand
     * side names none), and `NINA_TUNING_DEFAULTS` is genuinely the today-equivalent setting (the
     * right-hand side names it). If a default `steamy` or `flirty` ever reaches band `high`, or
     * the default wardrobe stops being `''`, this is the test that says so.
     */
    const shipped = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    const defaulted = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: NINA_TUNING_DEFAULTS,
    })
    expect(defaulted).toBe(shipped)
    expect(defaulted).not.toContain('POSE AND PRESENCE')

    const shippedAvatar = buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })
    expect(
      buildNinaImagePrompt({ purpose: 'avatar', scene: 'x', tuning: NINA_TUNING_DEFAULTS }),
    ).toBe(shippedAvatar)
  })

  it('R5: the WARDROBE reaches the photograph, and the canon outfit does not', () => {
    /*
     * The user's own example — "her sexy photo in a short pants". The outfit was hardcoded in
     * `NINA_APPEARANCE` and every generated photograph wore it whatever the operator set. Phase 2's
     * `ninaAppearance` is the seam; this asserts the seam is actually wired to the camera.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: tuned({ wardrobe: 'a black crop top and very short white running shorts' }),
    })
    expect(prompt).toContain('very short white running shorts')
    expect(prompt).not.toContain('heather-grey racerback tank')
    /* Still HER, though: the wardrobe replaces the outfit, never the person. */
    expect(prompt).toContain('high ponytail')
  })

  it('R5: a high steamy dial adds a POSE AND PRESENCE block, before the scene', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug',
      tuning: withTrait('steamy', 100),
    })
    expect(prompt).toContain('POSE AND PRESENCE:')
    /* Standing property of the subject before the scene; per-photograph note after it. */
    expect(prompt.indexOf('POSE AND PRESENCE:')).toBeLessThan(prompt.indexOf('SCENE:'))
    expect(prompt.indexOf('SCENE:')).toBeLessThan(prompt.indexOf('EXPRESSION AND ENERGY:'))
  })

  it('a high flirty dial reaches BOTH cameras; a high steamy dial reaches only the selfie', () => {
    /*
     * `NINA_AVATAR_STYLE` asks for head and shoulders in a 28-44 px circle. A pose instruction
     * about her hips under that crop is a prompt arguing with itself, which is the class of
     * contradiction `imagegen.ts`'s header says degrades a generation for free.
     */
    const steamyAvatar = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      tuning: withTrait('steamy', 100),
    })
    expect(steamyAvatar).not.toContain('POSE AND PRESENCE')

    const flirtyAvatar = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      tuning: withTrait('flirty', 100),
    })
    expect(flirtyAvatar).toContain('POSE AND PRESENCE:')
    expect(flirtyAvatar).toContain('straight down the lens')
  })

  it('a dial just below the threshold adds nothing at all', () => {
    const quiet = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      /* 59 is the top of band `mid`; 60 is the first score in `high`. One vocabulary. */
      tuning: tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 59, flirty: 59 } }),
    })
    expect(quiet).toBe(buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' }))
  })

  it('still never claims a reference image is authoritative, at any dial', () => {
    /* RU-18. The new clauses must not reintroduce the word — an instruction to defer to an image
     * that is not in the payload degrades the prompt. */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      tuning: tuned({
        traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100, flirty: 100 },
        wardrobe: 'a red bikini',
      }),
    })
    expect(prompt.toLowerCase()).not.toContain('reference')
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
  // Every one of these is derived in the phase plan's Step 7. They are asserted here so an edit to
  // one cannot silently break the ordering the whole R22 guarantee rests on. TWO HOSTS now: the
  // Vercel invocation that does the work, and the GitHub runner that backstops it.

  it('the backstop worker keeps its own timeout, at least 2x the measured 78.2 s', () => {
    expect(NINA_WORKER_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(160_000)
  })

  it("the workflow's job ceiling exceeds the call timeout plus setup", () => {
    expect(NINA_WORKER_TIMEOUT_MINUTES * 60_000).toBeGreaterThan(
      NINA_WORKER_CALL_TIMEOUT_MS + 60_000,
    )
  })

  it('the in-platform run fits inside the host ceiling with a full turn already spent', () => {
    // THE inequality the whole in-platform design rests on. 45 + 200 = 245 <= 300.
    expect(NINA_TURN_SPENT_MS + NINA_IMAGE_RUN_BUDGET_MS).toBeLessThanOrEqual(
      NINA_HOST_MAX_DURATION_MS,
    )
  })

  it('one whole attempt plus its finish writes fits inside the run budget', () => {
    // Otherwise `runNinaImageJob` could never start even its FIRST attempt without overrunning.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS).toBeLessThanOrEqual(
      NINA_IMAGE_RUN_BUDGET_MS,
    )
  })

  it('the in-platform call timeout is above the measured 78.2 s and below the worker’s', () => {
    // Above, or a merely slow day throws away $0.04 and a photograph. Below the worker's 240 s,
    // because THIS host has a ceiling to race and that one does not.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS).toBeGreaterThan(78_200)
    expect(NINA_IMAGE_CALL_TIMEOUT_MS).toBeLessThan(NINA_WORKER_CALL_TIMEOUT_MS)
  })

  it('a running job is only reclaimed after NEITHER host can still be running it', () => {
    // Reclaiming sooner claims a live generation twice and bills it twice. Both ceilings, because
    // either host may have been the one that died.
    expect(NINA_IMAGE_RECLAIM_MS).toBeGreaterThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
    expect(NINA_IMAGE_RECLAIM_MS).toBeGreaterThan(NINA_HOST_MAX_DURATION_MS)
  })

  it('the not-yet-started grace is shorter than the reclaim', () => {
    // A queued row that nobody picked up is safe to steal long before a running one is.
    expect(NINA_IMAGE_DISPATCH_GRACE_MS).toBeLessThan(NINA_IMAGE_RECLAIM_MS)
  })

  it('the app gives up only after the retries can have been exhausted', () => {
    // Otherwise she would apologise while a generation was still running, and the photograph would
    // land after the apology. THIS is the inequality R22 depends on most.
    expect(NINA_IMAGE_STALE_MS).toBeGreaterThan(NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS)
  })

  it('a backstop sweep run cannot exceed the workflow ceiling', () => {
    expect(NINA_IMAGE_SWEEP_BUDGET * 90_000).toBeLessThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
  })

  it('the schedule backstop cannot beat the give-up, and nothing may assume it can', () => {
    // PHASE 1'S ASSERTION, KEPT. FINDING 3. The workflow declares `*/10` and twelve consecutive
    // measured runs came 1 h 46 m to 4 h 19 m apart. The original chain was derived as if a
    // ten-minute rescue existed, which put the backstop comfortably inside the 20-minute give-up;
    // it is in fact five to thirteen times OUTSIDE it. This asserts the DIRECTION rather than the
    // magnitude, so it survives a re-measure and fails the moment someone lowers STALE on the
    // strength of the declared cron.
    //
    // It matters MORE after the migration, not less: the backstop is now the third net behind
    // reviveNinaImageJobs and the give-up sweep, and a reader who mistook it for the first would
    // conclude the deadline has hours of slack it does not have.
    expect(NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS).toBeGreaterThan(NINA_IMAGE_STALE_MS)
  })

  it('a render revives at most one job', () => {
    // A burst of six must not become six concurrent generations on one invocation's wall clock.
    expect(NINA_IMAGE_REVIVE_BUDGET).toBe(1)
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
