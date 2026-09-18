import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NinaToolContext } from '@/lib/nina/tools'

/**
 * **`generate_image`'s handler, and one thing only: does a runner's per-photograph clothing
 * request reach `generateNinaSelfie`.** Everything else about the handler (the cap, the doorbell,
 * what she is told to say) is untouched by this change and already covered by the integration
 * suites; mocking `./selfiegen` here is `nina.jobActions.test.ts`'s own "mock only the edges"
 * argument applied to the one new argument this phase adds.
 */

const { generateNinaSelfie, hasNinaImageJobForMessage } = vi.hoisted(() => ({
  generateNinaSelfie: vi.fn(),
  hasNinaImageJobForMessage: vi.fn(),
}))

vi.mock('@/lib/nina/selfiegen', () => ({ generateNinaSelfie }))
vi.mock('@/lib/nina/imagejobs', () => ({
  hasNinaImageJobForMessage,
  NINA_IMAGE_DUPLICATE_NOTE: 'already-dispatched',
}))

const ctx = { userId: 'u1', sourceMessageId: 'm1' } as unknown as NinaToolContext

let NINA_CHAT_TOOL_SET: Awaited<typeof import('@/lib/nina/imagetools')>['NINA_CHAT_TOOL_SET']

describe('generate_image forwards a per-turn outfit', () => {
  beforeEach(async () => {
    generateNinaSelfie.mockReset()
    generateNinaSelfie.mockResolvedValue({ ok: true, jobId: 'j1', state: 'dispatched' })
    hasNinaImageJobForMessage.mockReset()
    hasNinaImageJobForMessage.mockResolvedValue(false)
    ;({ NINA_CHAT_TOOL_SET } = await import('@/lib/nina/imagetools'))
  })

  it('passes `outfit` through to generateNinaSelfie, trimmed', async () => {
    await NINA_CHAT_TOOL_SET.handlers.generate_image!(
      { scene: 'in her bedroom', outfit: '  a short black mini dress  ' },
      ctx,
    )
    expect(generateNinaSelfie).toHaveBeenCalledWith(
      expect.objectContaining({ outfit: 'a short black mini dress' }),
    )
  })

  it('omitting `outfit` forwards null, the same absent-value contract `mood` already has', async () => {
    await NINA_CHAT_TOOL_SET.handlers.generate_image!({ scene: 'in her bedroom' }, ctx)
    expect(generateNinaSelfie).toHaveBeenCalledWith(expect.objectContaining({ outfit: null }))
  })
})

/**
 * **`angle` is a closed enum now (2026-09-18), not free text.** `/pull-image-gen-job`'s diagnosis
 * of job `OIF0bLCf4MMC` found that a hallucinated camera-position SENTENCE could always reintroduce
 * a contradiction with a fixed clause elsewhere in the prompt; `lib/nina/imageprefs.ts`'s
 * `NINA_CAMERA_ANGLE_KEYS` closes that off at the Zod boundary, before the argument ever reaches
 * `buildNinaImagePrompt`.
 */
describe('generate_image: angle is one of NINA_CAMERA_ANGLE_KEYS, not free text', () => {
  beforeEach(async () => {
    generateNinaSelfie.mockReset()
    generateNinaSelfie.mockResolvedValue({ ok: true, jobId: 'j1', state: 'dispatched' })
    hasNinaImageJobForMessage.mockReset()
    hasNinaImageJobForMessage.mockResolvedValue(false)
    ;({ NINA_CHAT_TOOL_SET } = await import('@/lib/nina/imagetools'))
  })

  it('passes a declared key through to generateNinaSelfie', async () => {
    await NINA_CHAT_TOOL_SET.handlers.generate_image!(
      { scene: 'lying in a meadow, from directly overhead', angle: 'overhead' },
      ctx,
    )
    expect(generateNinaSelfie).toHaveBeenCalledWith(expect.objectContaining({ angle: 'overhead' }))
  })

  it('omitting angle forwards null, the same absent-value contract `outfit` has', async () => {
    await NINA_CHAT_TOOL_SET.handlers.generate_image!({ scene: 'in her bedroom' }, ctx)
    expect(generateNinaSelfie).toHaveBeenCalledWith(expect.objectContaining({ angle: null }))
  })

  it('refuses a hallucinated camera-position sentence rather than forwarding it', async () => {
    const result = await NINA_CHAT_TOOL_SET.handlers.generate_image!(
      {
        scene: 'lying in a meadow, from directly overhead',
        angle: 'The camera is directly above her, looking straight down.',
      },
      ctx,
    )
    expect(result.isError).toBe(true)
    expect(generateNinaSelfie).not.toHaveBeenCalled()
  })
})

/**
 * **The duplicate-dispatch guard (2026-09-17).** A revived or repaired turn for the same runner
 * message must not spend a second camera action — see `hasNinaImageJobForMessage`'s own header in
 * `lib/nina/imagejobs.ts` for the production incident this closes.
 */
describe('generate_image refuses a second dispatch for the same message', () => {
  beforeEach(async () => {
    generateNinaSelfie.mockReset()
    generateNinaSelfie.mockResolvedValue({ ok: true, jobId: 'j1', state: 'dispatched' })
    hasNinaImageJobForMessage.mockReset()
    ;({ NINA_CHAT_TOOL_SET } = await import('@/lib/nina/imagetools'))
  })

  it('checks the guard keyed on ctx.sourceMessageId before dispatching', async () => {
    hasNinaImageJobForMessage.mockResolvedValue(false)
    await NINA_CHAT_TOOL_SET.handlers.generate_image!({ scene: 'in her bedroom' }, ctx)
    expect(hasNinaImageJobForMessage).toHaveBeenCalledWith('u1', 'm1')
    expect(generateNinaSelfie).toHaveBeenCalled()
  })

  it('refuses without dispatching when a camera already ran for this message', async () => {
    hasNinaImageJobForMessage.mockResolvedValue(true)
    const result = await NINA_CHAT_TOOL_SET.handlers.generate_image!(
      { scene: 'in her bedroom' },
      ctx,
    )
    expect(generateNinaSelfie).not.toHaveBeenCalled()
    expect(result).toEqual({
      answer: { taken: false, instruction: 'already-dispatched' },
      isError: false,
    })
  })

  it('skips the guard on a proactive turn, where sourceMessageId is null', async () => {
    const proactiveCtx = { userId: 'u1', sourceMessageId: null } as unknown as NinaToolContext
    await NINA_CHAT_TOOL_SET.handlers.generate_image!({ scene: 'in her bedroom' }, proactiveCtx)
    expect(hasNinaImageJobForMessage).not.toHaveBeenCalled()
    expect(generateNinaSelfie).toHaveBeenCalled()
  })
})
