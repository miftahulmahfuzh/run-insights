import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NinaToolContext } from '@/lib/nina/tools'

/**
 * **`generate_image`'s handler, and one thing only: does a runner's per-photograph clothing
 * request reach `generateNinaSelfie`.** Everything else about the handler (the cap, the doorbell,
 * what she is told to say) is untouched by this change and already covered by the integration
 * suites; mocking `./selfiegen` here is `nina.jobActions.test.ts`'s own "mock only the edges"
 * argument applied to the one new argument this phase adds.
 */

const { generateNinaSelfie } = vi.hoisted(() => ({
  generateNinaSelfie: vi.fn(),
}))

vi.mock('@/lib/nina/selfiegen', () => ({ generateNinaSelfie }))

const ctx = { userId: 'u1', sourceMessageId: 'm1' } as unknown as NinaToolContext

let NINA_CHAT_TOOL_SET: Awaited<typeof import('@/lib/nina/imagetools')>['NINA_CHAT_TOOL_SET']

describe('generate_image forwards a per-turn outfit', () => {
  beforeEach(async () => {
    generateNinaSelfie.mockReset()
    generateNinaSelfie.mockResolvedValue({ ok: true, jobId: 'j1', state: 'dispatched' })
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
