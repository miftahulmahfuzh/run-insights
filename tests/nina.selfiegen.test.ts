import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **`generateNinaSelfie` forwards `outfit` to `buildNinaImagePrompt`, trimmed to `null` when
 * blank.** Everything else this function does — the cap, the job row, the doorbell — is untouched
 * and already covered elsewhere; this suite mocks every edge so it can assert on the one call that
 * matters: what reaches the prompt builder.
 */

const {
  buildNinaImagePrompt,
  ninaImageQuotaLeft,
  openNinaImageJob,
  fireNinaImageGeneration,
  readNinaImagePrefs,
  readNinaTuning,
  resolveNinaPhotoReference,
} = vi.hoisted(() => ({
  buildNinaImagePrompt: vi.fn().mockReturnValue('a prompt'),
  ninaImageQuotaLeft: vi.fn().mockResolvedValue(5),
  openNinaImageJob: vi.fn().mockResolvedValue('job1'),
  fireNinaImageGeneration: vi.fn(),
  readNinaImagePrefs: vi.fn().mockResolvedValue({ model: 'x', reference: { source: 'none', id: '' } }),
  readNinaTuning: vi.fn().mockResolvedValue(null),
  resolveNinaPhotoReference: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/nina/imagegen', () => ({
  buildNinaImagePrompt,
  sidecarText: vi.fn().mockReturnValue('sidecar'),
}))
vi.mock('@/lib/nina/imagejobs', () => ({ ninaImageQuotaLeft, openNinaImageJob }))
vi.mock('@/lib/nina/imagerun', () => ({ fireNinaImageGeneration }))
vi.mock('@/lib/nina/imageprefs', () => ({ coerceNinaImageModel: vi.fn().mockReturnValue('m1') }))
vi.mock('@/lib/nina/queries', () => ({ readNinaImagePrefs, readNinaTuning, resolveNinaPhotoReference }))

let generateNinaSelfie: (typeof import('@/lib/nina/selfiegen'))['generateNinaSelfie']

describe('generateNinaSelfie forwards the per-turn outfit', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    buildNinaImagePrompt.mockReturnValue('a prompt')
    ninaImageQuotaLeft.mockResolvedValue(5)
    openNinaImageJob.mockResolvedValue('job1')
    readNinaImagePrefs.mockResolvedValue({ model: 'x', reference: { source: 'none', id: '' } })
    readNinaTuning.mockResolvedValue(null)
    resolveNinaPhotoReference.mockResolvedValue(null)
    ;({ generateNinaSelfie } = await import('@/lib/nina/selfiegen'))
  })

  it('passes a trimmed outfit through to buildNinaImagePrompt', async () => {
    await generateNinaSelfie({
      userId: 'u1',
      scene: 'in her bedroom',
      outfit: '  a short black mini dress  ',
    })
    expect(buildNinaImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ outfit: 'a short black mini dress' }),
    )
  })

  it('an absent outfit reaches buildNinaImagePrompt as null', async () => {
    await generateNinaSelfie({ userId: 'u1', scene: 'in her bedroom' })
    expect(buildNinaImagePrompt).toHaveBeenCalledWith(expect.objectContaining({ outfit: null }))
  })
})
