import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NinaToolContext } from '@/lib/nina/tools'

/**
 * **`set_avatar`'s duplicate-dispatch guard (2026-09-17).** `nina.imagetools.test.ts`'s own
 * pattern applied to this handler's one new check: mock only the edges the guard actually reads,
 * and prove it runs BEFORE `generateNinaAvatar` — never after, which would spend the money first
 * and refuse second.
 *
 * The production incident: a chat turn dispatched `generate_image` for a runner message, then
 * failed before it could reply; a render-path revive reran the whole turn and this handler called
 * `set_avatar` for the SAME message, with no idea a camera had already fired. See
 * `hasNinaImageJobForMessage`'s header in `lib/nina/imagejobs.ts` for the full argument.
 */

const { generateNinaAvatar, hasNinaImageJobForMessage, getCurrentNinaAvatar } = vi.hoisted(() => ({
  generateNinaAvatar: vi.fn(),
  hasNinaImageJobForMessage: vi.fn(),
  getCurrentNinaAvatar: vi.fn(),
}))

vi.mock('@/lib/nina/avatargen', () => ({ generateNinaAvatar }))
vi.mock('@/lib/nina/imagejobs', () => ({
  hasNinaImageJobForMessage,
  NINA_IMAGE_DUPLICATE_NOTE: 'already-dispatched',
}))
vi.mock('@/lib/nina/queries', () => ({ getCurrentNinaAvatar }))
/* `avatartools.ts` imports `NINA_CHAT_TOOL_SET` from `./imagetools` to compose `NINA_FULL_TOOL_SET`
 * — irrelevant to this handler, and stubbed so loading the module needs neither `./selfiegen` nor
 * a second copy of the two mocks above. */
vi.mock('@/lib/nina/imagetools', () => ({ NINA_CHAT_TOOL_SET: { tools: [], handlers: {} } }))
/* `handleSetAvatarFromPhoto`'s own dependency, unused by `handleSetAvatar` but imported at module
 * load. */
vi.mock('@/lib/nina/avatarAdopt', () => ({ setNinaAvatarFromExistingPhoto: vi.fn() }))

const ctx = { userId: 'u1', sourceMessageId: 'm1' } as unknown as NinaToolContext

let handleSetAvatar: Awaited<typeof import('@/lib/nina/avatartools')>['handleSetAvatar']

describe('set_avatar refuses a second dispatch for the same message', () => {
  beforeEach(async () => {
    generateNinaAvatar.mockReset()
    generateNinaAvatar.mockResolvedValue({ ok: true, jobId: 'j1', state: 'dispatched' })
    hasNinaImageJobForMessage.mockReset()
    hasNinaImageJobForMessage.mockResolvedValue(false)
    getCurrentNinaAvatar.mockReset()
    getCurrentNinaAvatar.mockResolvedValue(null)
    ;({ handleSetAvatar } = await import('@/lib/nina/avatartools'))
  })

  it('checks the guard keyed on ctx.sourceMessageId before the in-flight read or the dispatch', async () => {
    await handleSetAvatar({ scene: 'a beach at night', because: 'he asked' }, ctx)
    expect(hasNinaImageJobForMessage).toHaveBeenCalledWith('u1', 'm1')
    expect(generateNinaAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMessageId: 'm1' }),
    )
  })

  it('refuses without dispatching or reading the current avatar when a camera already ran', async () => {
    hasNinaImageJobForMessage.mockResolvedValue(true)
    const result = await handleSetAvatar({ scene: 'a beach at night', because: 'he asked' }, ctx)
    expect(getCurrentNinaAvatar).not.toHaveBeenCalled()
    expect(generateNinaAvatar).not.toHaveBeenCalled()
    expect(result).toEqual({
      answer: { ok: false, note: 'already-dispatched' },
      isError: false,
    })
  })

  it('skips the guard on a proactive turn, where sourceMessageId is null', async () => {
    const proactiveCtx = { userId: 'u1', sourceMessageId: null } as unknown as NinaToolContext
    await handleSetAvatar({ scene: 'a beach at night', because: 'a promise came true' }, proactiveCtx)
    expect(hasNinaImageJobForMessage).not.toHaveBeenCalled()
    expect(generateNinaAvatar).toHaveBeenCalled()
  })
})
