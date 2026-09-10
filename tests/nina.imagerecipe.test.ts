import { afterEach, describe, expect, it, vi } from 'vitest'

import { ADMIN_AVATAR_CONTENT_TYPES, ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import {
  buildNinaImagePrompt,
  NINA_PROMPT_LENGTH_FALLBACK,
  NINA_PROMPT_RUNGS,
  sidecarText,
} from '@/lib/nina/imagegen'
import {
  coerceNinaImageModel,
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_MODEL_DEFAULT,
  NINA_IMAGE_MODEL_IDS,
  NINA_IMAGE_PREFS_DEFAULTS,
  NINA_IMAGE_PROMPT_LENGTH_DEFAULT,
  NINA_PROMPT_TEMPLATE_DEFAULT,
  type NinaImageFocusKey,
  type NinaImagePrefs,
} from '@/lib/nina/imageprefs'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import { NINA_APPEARANCE, ninaAppearance } from '@/lib/nina/persona'
import {
  NINA_BAND_NAMES,
  NINA_TUNING_DEFAULTS,
  type NinaTrait,
  type NinaTuning,
} from '@/lib/nina/tuning'
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  jakartaDayStart,
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
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
  NINA_IMAGE_REFERENCE_CONTENT_TYPES,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  NINA_IMAGE_RESOLUTION,
  NINA_IMAGE_REVIVE_BUDGET,
  NINA_IMAGE_RUN_BUDGET_MS,
  NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS,
  NINA_IMAGE_STALE_MS,
  NINA_IMAGE_SWEEP_BUDGET,
  ninaImageCallTimeoutMs,
  ninaImageDailyCap,
  ninaImagePathname,
  ninaImageReferenceUrl,
  NINA_HOST_MAX_DURATION_MS,
  NINA_TURN_SPENT_MS,
  NINA_WORKER_CALL_TIMEOUT_MS,
  NINA_WORKER_TIMEOUT_MINUTES,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '@/lib/nina/imagerecipe'

describe('the payload — the two surviving ported facts, and the reference that came back', () => {
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

  it('R10: WITHOUT a reference the body is byte-identical to the one the probe got a 200 from', () => {
    /*
     * The compatibility contract of this phase, asserted against a LITERAL rather than against a
     * re-derivation — a re-derivation would move with the code it is meant to pin. Key order
     * included, because this is the JSON that goes on the wire.
     */
    expect(JSON.stringify(buildImageRequestBody({ prompt: 'a photograph', seed: 42 }))).toBe(
      JSON.stringify({
        model: NINA_IMAGE_MODEL,
        prompt: 'a photograph',
        resolution: NINA_IMAGE_RESOLUTION,
        aspect_ratio: NINA_IMAGE_ASPECT,
        n: 1,
        seed: 42,
      }),
    )
    expect(body.input_references).toBeUndefined()
    expect(body.messages).toBeUndefined()
    expect(body.modalities).toBeUndefined()
  })

  it('R10: a null or empty reference is the unanchored body, not an empty array', () => {
    const nulled = buildImageRequestBody({
      prompt: 'a photograph',
      seed: 42,
      referenceDataUrl: null,
    })
    const empty = buildImageRequestBody({ prompt: 'a photograph', seed: 42, referenceDataUrl: '' })
    expect(JSON.stringify(nulled)).toBe(JSON.stringify(body))
    expect(JSON.stringify(empty)).toBe(JSON.stringify(body))
  })

  it('R10: WITH a reference it adds exactly the shape gen_badge_art.py:352 verified', () => {
    // The ONE payload in this repo that has ever got a 200 with an anchor: one array, one entry,
    // `{ type: 'image_url', image_url: { url } }`, on the ordinary generations call.
    const dataUrl = 'data:image/png;base64,QUJD'
    const anchored = buildImageRequestBody({
      prompt: 'a photograph',
      seed: 42,
      referenceDataUrl: dataUrl,
    })
    expect(anchored.input_references).toEqual([{ type: 'image_url', image_url: { url: dataUrl } }])
    /* Nothing else moved: the anchored body is the unanchored one plus one key. */
    expect({ ...anchored, input_references: undefined }).toEqual({
      ...body,
      input_references: undefined,
    })
  })

  it('R10: the data URL is built only for a content type this pipeline vouches for', () => {
    expect(buildImageReferenceDataUrl('image/png', 'QUJD')).toBe('data:image/png;base64,QUJD')
    /* The header's parameters and its casing are the store's business, not ours. */
    expect(buildImageReferenceDataUrl('IMAGE/JPEG; charset=binary', 'QUJD')).toBe(
      'data:image/jpeg;base64,QUJD',
    )
    /* Not vouched for -> null -> the caller degrades to unanchored rather than lying about the
     * bytes to a vendor whose failure mode is "200 OK with invented content". */
    expect(buildImageReferenceDataUrl('image/gif', 'QUJD')).toBeNull()
    expect(buildImageReferenceDataUrl('text/html', 'QUJD')).toBeNull()
    expect(buildImageReferenceDataUrl('', 'QUJD')).toBeNull()
    expect(buildImageReferenceDataUrl('image/png', '')).toBeNull()
  })

  it('R10: the reference bound agrees with the ONE definition of what the picker can offer', () => {
    /*
     * `imagerecipe.ts` cannot import `lib/admin/avatars.ts` — it must stay zero-import for the
     * Actions worker — so it spells 8 MiB itself. This is what makes that duplication checked
     * rather than merely intended; same mitigation shape as `ninaImagePathname` versus
     * `NINA_BLOB_PREFIX` (RULING A6). A test can import both modules; the worker still cannot.
     */
    expect(NINA_IMAGE_REFERENCE_MAX_BYTES).toBe(ADMIN_AVATAR_MAX_UPLOAD_BYTES)
    expect([...NINA_IMAGE_REFERENCE_CONTENT_TYPES].sort()).toEqual(
      [...ADMIN_AVATAR_CONTENT_TYPES].sort(),
    )
  })

  it('R10: args.referenceUrl is read tolerantly, because old jsonb rows have no such key', () => {
    // Every row written before this phase. `claimNinaImageJob` casts them straight to the type.
    expect(ninaImageReferenceUrl({ prompt: 'p', seed: 1 })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: null })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: '' })).toBeNull()
    expect(ninaImageReferenceUrl(null)).toBeNull()
    expect(ninaImageReferenceUrl(undefined)).toBeNull()
    /* Not the SSRF boundary — the URL is resolved from our own rows — but the assertion that it
     * stays that way. */
    expect(ninaImageReferenceUrl({ referenceUrl: 'http://blob.test/a.png' })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: 'file:///etc/passwd' })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: 'https://blob.test/a.png' })).toBe(
      'https://blob.test/a.png',
    )
  })
})

describe('the prompt', () => {
  /** The four facts R1 says must ALWAYS be explicitly instructed, in the user's own words. */
  const BODY_FACTS = ['big boobs', 'bubble butt', 'big thighs', 'very long calves'] as const

  /** One field moved off the defaults, everything else exactly as it ships. */
  function tuned(over: Partial<NinaTuning>): NinaTuning {
    return { ...NINA_TUNING_DEFAULTS, ...over }
  }

  /** One TRAIT moved. The traits are nested under `traits`. */
  function withTrait(key: NinaTrait, value: number): NinaTuning {
    return tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, [key]: value } })
  }

  /** One or more prefs moved off phase 1's defaults. */
  function prefsWith(over: Partial<NinaImagePrefs>): NinaImagePrefs {
    return { ...NINA_IMAGE_PREFS_DEFAULTS, ...over }
  }

  /** Exactly these focus keys on, every other one off. Keyed by NAME, not by index, so it does not
   * care what order phase 1 declared the vocabulary in. */
  function focusOnly(
    ...on: readonly NinaImageFocusKey[]
  ): Readonly<Record<NinaImageFocusKey, boolean>> {
    const focus = {} as Record<NinaImageFocusKey, boolean>
    for (const key of NINA_IMAGE_FOCUS_KEYS) focus[key] = on.includes(key)
    return focus
  }

  /** The 2^6 subsets of the focus vocabulary, as a bit mask over its declared order. */
  function focusMask(mask: number): Readonly<Record<NinaImageFocusKey, boolean>> {
    const focus = {} as Record<NinaImageFocusKey, boolean>
    NINA_IMAGE_FOCUS_KEYS.forEach((key, i) => {
      focus[key] = (mask & (1 << i)) !== 0
    })
    return focus
  }

  /** One score inside each of the five bands, lowest first. */
  const BAND_FLOORS = [0, 20, 40, 60, 80] as const

  it('carries her appearance, the scene, and the photographic style', () => {
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    expect(prompt).toContain('on the track')
    expect(prompt).toContain('high ponytail')
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
    // The reference this plan set adds is a PAYLOAD concern and stays out of the prompt.
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt.toLowerCase()).not.toContain('reference')
  })

  it('the sidecar records prompt, model and seed, and says there is no reference', () => {
    const text = sidecarText({ prompt: 'p', seed: 42, purpose: 'selfie', model: NINA_IMAGE_MODEL })
    expect(text).toContain(NINA_IMAGE_MODEL)
    expect(text).toContain('seed:       42')
    expect(text).toContain('reference:  none (RU-18)')
    expect(text).toContain('--- prompt as sent ---')
  })

  it('the sidecar records the camera the job actually chose, not the module constant', () => {
    const text = sidecarText({
      prompt: 'p',
      seed: 42,
      purpose: 'selfie',
      model: 'qwen/qwen-image-3',
    })
    expect(text).toContain('model:      qwen/qwen-image-3\n')
  })

  it('§8: the dropdown vocabulary agrees with the payload builder’s default (RULING A6)', () => {
    /* `imagerecipe.ts` cannot import `imageprefs.ts` (zero-import), so the default id is spelled
     * twice on purpose — and asserted here, the same mitigation `ninaImagePathname` has. */
    expect(NINA_IMAGE_MODEL).toBe(NINA_IMAGE_MODEL_DEFAULT)
    expect((NINA_IMAGE_MODEL_IDS as readonly string[]).includes(NINA_IMAGE_MODEL)).toBe(true)
  })

  it('§8: the payload carries the job’s camera, and builds byte-identically without one', () => {
    const defaulted = buildImageRequestBody({ prompt: 'a photograph', seed: 42 })
    expect(JSON.stringify(buildImageRequestBody({ prompt: 'a photograph', seed: 42, model: NINA_IMAGE_MODEL }))).toBe(
      JSON.stringify(defaulted),
    )
    expect(
      buildImageRequestBody({ prompt: 'a photograph', seed: 42, model: 'qwen/qwen-image-3' }).model,
    ).toBe('qwen/qwen-image-3')
  })

  it('§8: the coerce degrades an unreadable or unknown id to the measured default', () => {
    expect(coerceNinaImageModel('qwen/qwen-image-3')).toBe('qwen/qwen-image-3')
    expect(coerceNinaImageModel('qwen/qwen-image-3-pro')).toBe('qwen/qwen-image-3-pro')
    for (const bad of [undefined, null, '', 'gpt-image-1', 42]) {
      expect(coerceNinaImageModel(bad), String(bad)).toBe(NINA_IMAGE_MODEL_DEFAULT)
    }
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R1 — THE BODY CANON
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('PLAN INVARIANT 4: EVERY combination of prefs names all four body facts', () => {
    /*
     * The requirement the user actually wrote down — *"always explicitly instruct these in the
     * prompt"* — proved as a PROPERTY over the whole input space rather than as four examples,
     * because "always" is a claim about every setting and four examples cannot be that.
     *
     * 2 purposes x 5 bands x all 64 focus subsets x {every free-text field empty, every one set}
     * = 1280 prompts. The focus multi-select is EMPHASIS layered on an unconditional canon, so
     * mask 0 (nothing selected) must name the body exactly as loudly as mask 63 does.
     */
    let checked = 0
    for (const purpose of ['selfie', 'avatar'] as const) {
      for (const promptLength of BAND_FLOORS) {
        for (let mask = 0; mask < 1 << NINA_IMAGE_FOCUS_KEYS.length; mask += 1) {
          for (const text of ['', 'Kuta streets in Bali']) {
            const prompt = buildNinaImagePrompt({
              purpose,
              scene: 'on the track',
              mood: text,
              tuning: text === '' ? null : NINA_TUNING_DEFAULTS,
              prefs: prefsWith({
                promptLength,
                focus: focusMask(mask),
                wardrobe: text,
                venue: text,
                time: text,
                notes: text,
              }),
            })
            for (const fact of BODY_FACTS) {
              expect(
                prompt,
                `${purpose} / length ${promptLength} / focus ${mask} / text "${text}" lost "${fact}"`,
              ).toContain(fact)
            }
            checked += 1
          }
        }
      }
    }
    expect(checked).toBe(2 * BAND_FLOORS.length * 64 * 2)
  })

  it('PLAN INVARIANT 4: and with no prefs at all, and at the stored defaults', () => {
    // The two boundary inputs the property loop cannot express: a caller that passes nothing, and
    // a user with no row (`readNinaImagePrefs` returns exactly this object).
    for (const prefs of [null, NINA_IMAGE_PREFS_DEFAULTS]) {
      for (const purpose of ['selfie', 'avatar'] as const) {
        const prompt = buildNinaImagePrompt({ purpose, scene: 'x', prefs })
        for (const fact of BODY_FACTS) expect(prompt).toContain(fact)
      }
    }
  })

  it('keeps the face and the outfit at the DEFAULT rung, not only above it', () => {
    /* RECONCILED: phase 1's NINA_IMAGE_PROMPT_LENGTH_DEFAULT is 50 -> band `mid` -> rung 2. An
     * operator who never opens the tab gets this rung, and it must not be a downgrade on today's
     * prompt. Deliberately asserted against the DEFAULT rather than a literal 2, so that a later
     * change to either number fails here instead of silently shortening every first-run prompt. */
    const text = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      prefs: prefsWith({ promptLength: NINA_IMAGE_PROMPT_LENGTH_DEFAULT }),
    })
    expect(text).toContain('ponytail') // NINA_FACE survived
    expect(text).toContain('heather-grey racerback tank') // NINA_DEFAULT_OUTFIT survived
    for (const fact of BODY_FACTS) expect(text).toContain(fact) // and R1, unconditionally
  })

  it('R1: the SUBJECT paragraph leads with the body and the face follows it', () => {
    /*
     * *"i dont care about her face, i care a lot about her voluptuous body"* is a priority
     * statement, so the face keeps its sentences and loses its primacy. This asserts the ORDER,
     * which is the half of R1 a containment check cannot see.
     */
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt.indexOf('big boobs')).toBeLessThan(prompt.indexOf('high ponytail'))

    // The canon constant and the assembled prompt agree, because there is one source and not two.
    expect(NINA_APPEARANCE.indexOf('big boobs')).toBeLessThan(
      NINA_APPEARANCE.indexOf('high ponytail'),
    )
    expect(ninaAppearance(NINA_IMAGE_PREFS_DEFAULTS)).toBe(NINA_APPEARANCE)
  })

  it("R1: the old subject paragraph's contradicting body clause is gone", () => {
    /*
     * `NINA_FACE` used to carry "Lean, visibly muscular runner's build — defined quadriceps and
     * calves, narrow shoulders", which the analysis names as defect 2: a body clause in a face
     * constant, and the opposite of what the user asked for. Its muscle survives in the body
     * canon; `Lean` and `narrow shoulders` are repealed, and this is the assertion that says so.
     */
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt).not.toContain("Lean, visibly muscular runner's build")
    expect(prompt).not.toContain('narrow shoulders')

    /* IMPLEMENTATION DECISION (phase 2, rung 3 — the plan's code blocks over its own prose).
     * The plan asserted `never lean and never slight` on THIS render too, but that clause is the
     * repeal RECORD and it lives in `NINA_BODY_SENTENCES[4]` — the fifth sentence, which only band
     * `max` spends. A no-prefs call renders `NINA_PROMPT_LENGTH_FALLBACK` (70) -> band `high` ->
     * four sentences, so the assertion could not hold there without either moving the clause
     * earlier in the canon (which would move the measured rung lengths the strictly-increasing and
     * <60% assertions are calibrated against) or raising the fallback to `max` (which would change
     * what every caller with no prefs renders). Both are wider than the defect. So the two
     * NEGATIONS — the part that matters, since the contradiction must be gone at EVERY rung —
     * stay on the default render, and the positive record is asserted where it is actually spent.
     * Nothing was relaxed: this is one assertion more than the plan wrote. */
    for (const promptLength of BAND_FLOORS) {
      const atRung = buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        prefs: prefsWith({ promptLength }),
      })
      expect(atRung, `band floor ${promptLength}`).not.toContain(
        "Lean, visibly muscular runner's build",
      )
      expect(atRung, `band floor ${promptLength}`).not.toContain('narrow shoulders')
    }
    expect(
      buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        prefs: prefsWith({ promptLength: 100 }),
      }),
    ).toContain('never lean and never slight')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE RESTATED COMPATIBILITY CONTRACT
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('RESTATED CONTRACT: the arguments are optional, and the defaults render the same string', () => {
    /*
     * ── WHAT THIS TEST USED TO SAY, AND WHY IT NO LONGER SAYS IT ──────────────────────────────
     * It used to be `PLAN INVARIANT 2: the default tuning renders the prompt that shipped, byte
     * for byte` — `imagegen.ts`'s "provable superset of the Nina who shipped". **R1 repeals that
     * half on purpose**: the body canon is unconditional, so no setting renders the old subject
     * paragraph any more. The claim is gone from the file header too, in the same commit; a comment
     * promising something the code stopped honouring would be worse than the change.
     *
     * TWO WEAKER PROPERTIES SURVIVE, AND THEY ARE THE ONES THAT CATCH A MISTAKE:
     *   1. OPTIONALITY — no arguments and the explicit defaults produce the SAME string, so this
     *      is still a pure function and no default reaches out to a database.
     *   2. ADDITIVITY — at the defaults, nothing the tuning or the prefs can contribute is
     *      present. A tuned or preferred clause leaking into the default render is a change nobody
     *      asked for, and it would pass every containment assertion in this file.
     */
    const none = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    const defaulted = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      tuning: NINA_TUNING_DEFAULTS,
      prefs: { ...NINA_IMAGE_PREFS_DEFAULTS, promptLength: NINA_PROMPT_LENGTH_FALLBACK },
    })
    expect(defaulted).toBe(none)

    for (const label of ['POSE AND PRESENCE', 'FOCUS:', 'VENUE:', 'TIME:', 'NOTES:']) {
      expect(defaulted, `${label} leaked into the default render`).not.toContain(label)
    }

    const noneAvatar = buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })
    expect(
      buildNinaImagePrompt({
        purpose: 'avatar',
        scene: 'x',
        tuning: NINA_TUNING_DEFAULTS,
        prefs: { ...NINA_IMAGE_PREFS_DEFAULTS, promptLength: NINA_PROMPT_LENGTH_FALLBACK },
      }),
    ).toBe(noneAvatar)
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R4 — THE PROMPT-LENGTH LADDER
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('R4: there is one rung per band, and the ladder is phase 1s vocabulary', () => {
    // Not a private scale. `/admin` renders the band name beside every slider, so a rung table with
    // a band the operator cannot see would be a slider he cannot predict.
    for (const band of NINA_BAND_NAMES) {
      expect(NINA_PROMPT_RUNGS[band].band).toBe(band)
      expect(NINA_PROMPT_RUNGS[band].bodySentences).toBeGreaterThanOrEqual(1)
    }
  })

  it('R4: the lowest rung is MATERIALLY shorter than the highest, and both name the body', () => {
    const at = (promptLength: number) =>
      buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'on the track',
        prefs: prefsWith({ promptLength }),
      })

    const shortest = at(0)
    const longest = at(100)
    // "Materially" made checkable: the bottom rung is under 60% of the top one.
    expect(shortest.length).toBeLessThan(longest.length * 0.6)
    for (const fact of BODY_FACTS) {
      expect(shortest).toContain(fact)
      expect(longest).toContain(fact)
    }
    // And the saving comes out of CANON prose, never out of a body fact.
    expect(shortest).not.toContain('high ponytail')
    expect(shortest).not.toContain('heather-grey racerback tank')
    expect(longest).toContain('high ponytail')
    expect(longest).toContain('heather-grey racerback tank')
  })

  it('R4: all five rungs are distinct and strictly longer than the one below', () => {
    // A slider with two settings that render the same string is a slider the operator cannot trust.
    const lengths = BAND_FLOORS.map(
      (promptLength) =>
        buildNinaImagePrompt({
          purpose: 'selfie',
          scene: 'on the track',
          mood: 'smug',
          tuning: withTrait('flirty', 100),
          prefs: prefsWith({ promptLength, focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS) }),
        }).length,
    )
    for (let i = 1; i < lengths.length; i += 1) {
      expect(lengths[i]!, `band ${i} is not longer than band ${i - 1}`).toBeGreaterThan(
        lengths[i - 1]!,
      )
    }
  })

  it('R4: two scores in the same band render the same string — one vocabulary', () => {
    const at = (promptLength: number) =>
      buildNinaImagePrompt({ purpose: 'selfie', scene: 'x', prefs: prefsWith({ promptLength }) })
    expect(at(80)).toBe(at(100))
    expect(at(60)).toBe(at(79))
    expect(at(60)).not.toBe(at(80))
  })

  it('R4: only band `off` drops POSE AND PRESENCE; every rung above keeps it', () => {
    for (const promptLength of BAND_FLOORS) {
      const prompt = buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        tuning: withTrait('flirty', 100),
        prefs: prefsWith({ promptLength }),
      })
      if (promptLength < 20) expect(prompt).not.toContain('POSE AND PRESENCE:')
      else expect(prompt, `band at ${promptLength}`).toContain('POSE AND PRESENCE:')
    }
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R5 — FOCUS
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('R5: FOCUS is emphasis layered on the canon, never inclusion', () => {
    const noFocus = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100 }),
    })
    expect(noFocus).not.toContain('FOCUS:')
    for (const fact of BODY_FACTS) expect(noFocus).toContain(fact)

    const oneFocus = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('thighs') }),
    })
    expect(oneFocus).toContain('FOCUS: Emphasise her big thighs above everything else')
    expect(oneFocus).not.toContain('her bubble butt')
    expect(oneFocus.length).toBeGreaterThan(noFocus.length)
  })

  it('R5: the emphasis is a terse list at a low rung and full sentences at a high one', () => {
    const terse = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 0, focus: focusOnly('boobs', 'calves') }),
    })
    expect(terse).toContain(
      'FOCUS: Emphasise her big boobs and her very long calves above everything else in this photograph.',
    )
    expect(terse).not.toContain('deep cleavage line')

    const full = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('boobs', 'calves') }),
    })
    expect(full).toContain('deep cleavage line')
    expect(full).toContain('run most of the length of the frame')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R6 — THE WARDROBE, AND THE DEFECT IN THE USER'S OWN PASTE
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it("R6: the wardrobe gets a sentence boundary — the user's paste had none", () => {
    /*
     * The measured defect, from the dump he sent: `long pants She still has the black digital
     * watch`. `persona.ts:401` interpolated with no terminating punctuation, so the provider read
     * two sentences as one.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      prefs: prefsWith({ wardrobe: 'long pants' }),
    })
    expect(prompt).toContain('long pants. She still has')
    expect(prompt).not.toContain('long pants She still has')
  })

  it('R6: and it does not double a stop the operator wrote himself', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ wardrobe: 'long hugging leggings with a string bra.' }),
    })
    expect(prompt).toContain('string bra. She still has')
    expect(prompt).not.toContain('string bra.. She still has')
  })

  it('R6: the PREFS wardrobe reaches the photograph and the TUNING wardrobe does NOT', () => {
    /*
     * The index's Decisions table: *"two wardrobes silently competing is the one outcome R3 cannot
     * mean"*. `nina_tuning.wardrobe` is GONE as of F41 R3 — phase 7 dropped the column — so the
     * `tuning:` line this test used to pass is deleted rather than rewritten, exactly as the
     * instruction left here said. Every other assertion stands unchanged: the prefs wardrobe still
     * has to reach the photograph, and it still may not take the person or her home ground with it.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      prefs: prefsWith({ wardrobe: 'a black crop top and very short white running shorts' }),
    })
    expect(prompt).toContain('very short white running shorts')
    expect(prompt).not.toContain('a beige trench coat')
    // The wardrobe replaces the canon OUTFIT, never the person and never her home ground.
    expect(prompt).not.toContain('heather-grey racerback tank')
    expect(prompt).toContain('high ponytail')
    expect(prompt).toContain('red 400 m athletics track')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * R7, R8, R9 — VENUE, TIME, NOTES
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('R7 R8 R9: what the operator typed is honoured at EVERY rung and on BOTH cameras', () => {
    // The ladder spends canon prose. It never discards a field somebody filled in — that would be a
    // control that silently does nothing, which is the failure `nina_tuning`'s header argues about.
    for (const promptLength of BAND_FLOORS) {
      for (const purpose of ['selfie', 'avatar'] as const) {
        const prompt = buildNinaImagePrompt({
          purpose,
          scene: 'on the track',
          prefs: prefsWith({
            promptLength,
            venue: 'Kuta streets in Bali',
            time: 'sunny day',
            notes: 'nina is full of sweat',
            wardrobe: 'long hugging leggings with a string bra',
          }),
        })
        const where = `${purpose} at band floor ${promptLength}`
        expect(prompt, where).toContain('VENUE: Kuta streets in Bali')
        expect(prompt, where).toContain('TIME: sunny day')
        expect(prompt, where).toContain('NOTES: nina is full of sweat')
        expect(prompt, where).toContain('long hugging leggings with a string bra.')
      }
    }
  })

  it('an empty free-text field adds no block at all', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      // ' ' rather than '' — a hand-run SQL update can write whitespace past phase 1's coercer.
      prefs: prefsWith({ venue: '   ', time: '', notes: ' ' }),
    })
    expect(prompt).not.toContain('VENUE:')
    expect(prompt).not.toContain('TIME:')
    expect(prompt).not.toContain('NOTES:')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE BLOCK ORDER
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('the block order is SUBJECT, FOCUS, POSE, VENUE, TIME, SCENE, EXPRESSION, NOTES', () => {
    /*
     * Every position is argued in `buildNinaImagePrompt`'s docblock. The two that were already
     * load-bearing are unchanged: POSE before SCENE because it is a standing property of the
     * subject, EXPRESSION after SCENE because it refines this photograph (the
     * `gen_badge_art.py --note` precedent). VENUE and TIME go before SCENE so the model reads
     * general-then-specific and a scene that names its own place wins. NOTES goes last, because it
     * must be able to amend everything above it.
     */
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'at home in her rented room in Tebet',
      mood: 'smug, out of breath',
      tuning: withTrait('flirty', 100),
      prefs: prefsWith({
        promptLength: 100,
        focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS),
        venue: 'Kuta streets in Bali',
        time: 'rainy night',
        notes: 'nina is full of sweat',
      }),
    })
    const order = [
      'SUBJECT:',
      'FOCUS:',
      'POSE AND PRESENCE:',
      'VENUE:',
      'TIME:',
      'SCENE:',
      'EXPRESSION AND ENERGY:',
      'NOTES:',
    ]
    let cursor = -1
    for (const label of order) {
      const at = prompt.indexOf(label)
      expect(at, `${label} is missing or out of order`).toBeGreaterThan(cursor)
      cursor = at
    }
    expect(prompt.trimEnd().endsWith('NOTES: nina is full of sweat')).toBe(true)
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE TWO DIALS — UNCHANGED BEHAVIOUR
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('a high steamy dial adds a POSE AND PRESENCE block, before the scene', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug',
      tuning: withTrait('steamy', 100),
    })
    expect(prompt).toContain('POSE AND PRESENCE:')
    expect(prompt.indexOf('POSE AND PRESENCE:')).toBeLessThan(prompt.indexOf('SCENE:'))
    expect(prompt.indexOf('SCENE:')).toBeLessThan(prompt.indexOf('EXPRESSION AND ENERGY:'))
  })

  it('a high flirty dial reaches BOTH cameras; a high steamy dial reaches only the selfie', () => {
    /*
     * `NINA_AVATAR_STYLE` asks for head and shoulders in a 28-44 px circle. A pose instruction
     * about her hips under that crop is a prompt arguing with itself. UNCHANGED by this phase, and
     * the same rule now decides which focus keys the avatar honours.
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

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE AVATAR CROP
   * ──────────────────────────────────────────────────────────────────────────────────────────*/

  it('the avatar names the body ONCE and reconciles the crop in words', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS) }),
    })
    expect(prompt).toContain('head and shoulders')
    for (const fact of BODY_FACTS) expect(prompt).toContain(fact)
    // The contradiction is resolved out loud instead of being left for the model.
    expect(prompt).toContain('even though this photograph is cropped to her head and shoulders')
    // One sentence, not five, at EVERY rung: more body prose under a face crop is more
    // contradiction, not more detail.
    expect(prompt).not.toContain('narrow ankle')
    expect(prompt).not.toContain('flattening into it')
  })

  it('the avatar FOCUS keeps face and skin and drops the four whole-body keys', () => {
    const bodyOnly = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({
        promptLength: 100,
        focus: focusOnly('boobs', 'butt', 'thighs', 'calves'),
      }),
    })
    // Dropped, never substituted. The body is still named by `NINA_BODY_AVATAR`.
    expect(bodyOnly).not.toContain('FOCUS:')
    for (const fact of BODY_FACTS) expect(bodyOnly).toContain(fact)

    const cropSafe = buildNinaImagePrompt({
      purpose: 'avatar',
      scene: 'x',
      prefs: prefsWith({ promptLength: 100, focus: focusOnly('face', 'skin') }),
    })
    expect(cropSafe).toContain('FOCUS:')
    expect(cropSafe).toContain('lit well enough to read her expression')
    expect(cropSafe).not.toContain('her bubble butt')
  })

  it('still never claims a reference image is authoritative, at any setting', () => {
    /* RU-18. None of the new clauses may reintroduce the word — an instruction to defer to an
     * image that is not in the payload degrades the prompt, and phase 3 puts the reference in the
     * PAYLOAD and not in the prose. */
    for (const purpose of ['selfie', 'avatar'] as const) {
      const prompt = buildNinaImagePrompt({
        purpose,
        scene: 'x',
        mood: 'smug',
        tuning: tuned({ traits: { ...NINA_TUNING_DEFAULTS.traits, steamy: 100, flirty: 100 } }),
        prefs: prefsWith({
          promptLength: 100,
          focus: focusOnly(...NINA_IMAGE_FOCUS_KEYS),
          wardrobe: 'a red bikini',
          venue: 'Kuta streets in Bali',
          time: 'sunny day',
          notes: 'nina is full of sweat',
        }),
      })
      expect(prompt.toLowerCase()).not.toContain('reference')
    }
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
    // THE inequality the whole in-platform design rests on. R10 moved it: 45 + 240 = 285 <= 300.
    expect(NINA_TURN_SPENT_MS + NINA_IMAGE_RUN_BUDGET_MS).toBeLessThanOrEqual(
      NINA_HOST_MAX_DURATION_MS,
    )
  })

  it('one whole attempt plus its finish writes fits inside the run budget — BOTH kinds', () => {
    // Otherwise `runNinaImageJob` could never start even its FIRST attempt without overrunning,
    // and for the anchored kind that would mean R10 generating nothing at all.
    // Unanchored: 150 + 20 = 170 <= 240. Anchored: 220 + 20 = 240 <= 240, exactly — which is why
    // an anchored job gets one attempt per invocation and its retry comes from a fresh render.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS).toBeLessThanOrEqual(
      NINA_IMAGE_RUN_BUDGET_MS,
    )
    expect(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS).toBeLessThanOrEqual(
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

  it('the cap default is 30 — the 2026-09-10 ask, "right now set it to 30 images"', () => {
    expect(Number.isInteger(NINA_IMAGE_DAILY_CAP)).toBe(true)
    expect(NINA_IMAGE_DAILY_CAP).toBe(30)
  })

  /* The env override is read at CALL time, so a test can stub it the same way production sets
   * it: a Vercel env edit, no deploy. Everything unparseable degrades to the constant — an
   * unreadable cap must never read as "unlimited" or as zero. */
  describe('ninaImageDailyCap — the env-tunable override', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('falls back to the constant when the variable is unset or empty', () => {
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', '')
      expect(ninaImageDailyCap()).toBe(NINA_IMAGE_DAILY_CAP)
      delete process.env.NINA_IMAGE_DAILY_CAP
      expect(ninaImageDailyCap()).toBe(NINA_IMAGE_DAILY_CAP)
    })

    it('parses a set variable, flooring a non-integer', () => {
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', '12')
      expect(ninaImageDailyCap()).toBe(12)
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', '7.9')
      expect(ninaImageDailyCap()).toBe(7)
    })

    it('clamps into 1..200 — a cap of zero or a negative would be a silent generation ban', () => {
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', '0')
      expect(ninaImageDailyCap()).toBe(1)
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', '-5')
      expect(ninaImageDailyCap()).toBe(1)
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', '99999')
      expect(ninaImageDailyCap()).toBe(200)
    })

    it('garbage falls back to the constant, never to zero or NaN', () => {
      vi.stubEnv('NINA_IMAGE_DAILY_CAP', 'thirty')
      expect(ninaImageDailyCap()).toBe(NINA_IMAGE_DAILY_CAP)
    })
  })

  it('R10: BOTH in-platform timeouts clear the host ceiling with a full turn spent', () => {
    // PLAN INVARIANT 3, for two timeouts instead of one:
    //   unanchored  45 + 150 + 20 = 215 <= 300
    //   anchored    45 + 220 + 20 = 285 <= 300
    // The anchored chain is what R10 costs, and 15 s is the slack it leaves.
    expect(
      NINA_TURN_SPENT_MS + NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS,
    ).toBeLessThanOrEqual(NINA_HOST_MAX_DURATION_MS)
    expect(
      NINA_TURN_SPENT_MS + NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS,
    ).toBeLessThanOrEqual(NINA_HOST_MAX_DURATION_MS)
  })

  it('R10: the anchored timeout is above the measured 148.9 s that RU-18 recorded', () => {
    // The whole reason this constant exists. The shipping 150 s ceiling was 1.1 s above the
    // measurement, so R10 against it would have aborted about half of its own generations.
    expect(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS).toBeGreaterThan(148_900)
    expect(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS).toBeGreaterThan(NINA_IMAGE_CALL_TIMEOUT_MS)
  })

  it('R10: the reference fetch is a sub-bound of the call, not an addition to it', () => {
    // `callNinaImageModel` fetches the anchor and then gives the POST what is LEFT of the
    // allowance, which is why the inequality above has three terms and not four. If this ever
    // fails, the arithmetic above has stopped being true.
    expect(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS).toBeLessThan(NINA_IMAGE_CALL_TIMEOUT_MS)
    expect(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('R10: the timeout selector is the only place the choice is made', () => {
    expect(ninaImageCallTimeoutMs(false)).toBe(NINA_IMAGE_CALL_TIMEOUT_MS)
    expect(ninaImageCallTimeoutMs(true)).toBe(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS)
  })
})

describe('the editable prompt template — rendering (the 2026-09-10 ask)', () => {
  /* The DEFAULT template's byte-identity with the pre-template assembly is not asserted by one
   * test here; it is asserted by EVERY test above, which was written against the hand-rolled
   * assembly and passes unchanged over the default shell. These tests cover what the shell can
   * legitimately DO when the operator changes it. */

  function prefsWith(over: Partial<NinaImagePrefs>): NinaImagePrefs {
    return { ...NINA_IMAGE_PREFS_DEFAULTS, ...over }
  }

  it('renders byte-identically through an explicitly saved default template', () => {
    /* A call with NO prefs resolves the length ladder at `NINA_PROMPT_LENGTH_FALLBACK`, so the
     * prefs side must pin the same rung — the comparison is about the shell, not the rung. */
    const plain = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    const viaTemplate = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      prefs: prefsWith({
        promptLength: NINA_PROMPT_LENGTH_FALLBACK,
        promptTemplate: NINA_PROMPT_TEMPLATE_DEFAULT,
      }),
    })
    expect(viaTemplate).toBe(plain)
  })

  it('the empty template IS the default — the one spelling of "unmodified"', () => {
    expect(
      buildNinaImagePrompt({ purpose: 'selfie', scene: 'x', prefs: prefsWith({ promptTemplate: '' }) }),
    ).toBe(
      buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        prefs: prefsWith({ promptTemplate: NINA_PROMPT_TEMPLATE_DEFAULT }),
      }),
    )
  })

  it('a reordered shell reorders the prompt — the scene can lead', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track at dusk',
      prefs: prefsWith({ promptTemplate: '{{scene}}\n\n{{camera}}\n\n{{subject}}' }),
    })
    expect(prompt.indexOf('SCENE: on the track at dusk')).toBe(0)
    expect(prompt.indexOf('SUBJECT:')).toBeGreaterThan(0)
  })

  it('a dropped optional block is dropped on purpose — notes set, no {{notes}} in the shell', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({
        notes: 'nina is full of sweat',
        promptTemplate: '{{camera}}\n\n{{scene}}\n\n{{subject}}',
      }),
    })
    expect(prompt).not.toContain('NOTES:')
    expect(prompt).not.toContain('nina is full of sweat')
    /* Invariant 4 survives any shell: the body canon rides {{subject}}. */
    expect(prompt).toContain('SUBJECT:')
  })

  it('extra prose typed between tokens ships verbatim', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptTemplate: 'SHOT ON FILM.\n\n{{camera}}\n\n{{scene}}\n\n{{subject}}' }),
    })
    expect(prompt.startsWith('SHOT ON FILM.')).toBe(true)
  })

  it('a blank run in the shell collapses to the blank-line separator', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptTemplate: '{{camera}}\n\n\n\n{{scene}}\n\n{{subject}}' }),
    })
    expect(prompt).not.toMatch(/\n{3,}/)
  })

  it('a duplicated token renders twice — allowed, and the operator can see it in the preview', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'x',
      prefs: prefsWith({ promptTemplate: '{{scene}}\n\n{{camera}}\n\n{{subject}}\n\n{{scene}}' }),
    })
    expect(prompt.match(/SCENE: x/g)).toHaveLength(2)
  })

  it('a template that could only arrive by hand-run SQL degrades to the default shell', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const prompt = buildNinaImagePrompt({
        purpose: 'selfie',
        scene: 'x',
        prefs: prefsWith({ promptTemplate: '{{wordrobe}} and {{scene}}' }),
      })
      expect(prompt).toBe(
        buildNinaImagePrompt({ purpose: 'selfie', scene: 'x', prefs: prefsWith({}) }),
      )
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
