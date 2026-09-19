// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotoshopDetail } from './PhotoshopDetail'
import { runPhotoshopJobAction } from '@/lib/admin/photoshopActions'
import { photoshopPresetText } from '@/lib/nina/photoshopPresets'

/*
 * What is under test is the CROP WIRING, and nothing else: the step is offered in both modes and
 * hidden when the source's shape is unknown, a skipped step sends four nulls, an opened step sends
 * the auto-picked ratio and an identity crop, and an adjusted step sends what the studio reported.
 * The studio itself is stubbed (`PhotoshopCropStudio.test.tsx` owns it) and the Server Actions are
 * mocked.
 */
vi.mock('@/lib/admin/photoshopActions', () => ({
  runPhotoshopJobAction: vi.fn().mockResolvedValue({ ok: true, jobId: 'job000000001' }),
  /* Never driven by name here — the poll fires 3 s after a run, well past the end of any case —
   * but a resolved default keeps a stray tick from surfacing an unhandled rejection. */
  readPhotoshopJobAction: vi.fn().mockResolvedValue(null),
  resolvePhotoshopJobAction: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/components/admin/PhotoshopCropStudio', async () => {
  const React = await import('react')
  return {
    PhotoshopCropStudio: (props: {
      value: { ratioLabel: string; crop: { scale: number; x: number; y: number } }
      onChange: (next: {
        ratioLabel: string
        crop: { scale: number; x: number; y: number }
      }) => void
    }) =>
      React.createElement(
        'button',
        {
          'data-testid': 'crop-studio',
          onClick: () =>
            props.onChange({ ratioLabel: '16:9', crop: { scale: 1.5, x: 20, y: -30 } }),
        },
        `${props.value.ratioLabel}@${props.value.crop.scale}/${props.value.crop.x}/${props.value.crop.y}`,
      ),
  }
})

const runAction = vi.mocked(runPhotoshopJobAction)

/** 832x732 is the live repro from the analysis: ratio 1.137, nearest catalogued value 5:4. */
function panel(sourceWidth: number | null = 832, sourceHeight: number | null = 732) {
  return render(
    <PhotoshopDetail
      sourceKind="avatar"
      sourceId="abcdefghijkl"
      sourceUrl="https://blob.example/source.png"
      sourceWidth={sourceWidth}
      sourceHeight={sourceHeight}
    />,
  )
}

const cropToggle = () => screen.getByRole('button', { name: /Aspect ratio crop/ })

async function run() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Run photoshop' }))
  })
}

/** Everything `execute()` has always sent, unchanged by this feature. */
const BASE_PAYLOAD = {
  sourceKind: 'avatar',
  sourceId: 'abcdefghijkl',
  mode: 'edit',
  model: 'bytedance-seed/seedream-4.5',
  presetKey: null,
  instruction: photoshopPresetText('bigger_boobs'),
}

beforeEach(() => {
  runAction.mockClear()
})

describe('PhotoshopDetail — the optional crop step', () => {
  it('offers the step in BOTH modes — nothing about it is mode-conditional', () => {
    panel()
    expect(cropToggle()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Anchor' }))
    expect(cropToggle()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(cropToggle()).toBeInTheDocument()
  })

  it('does not offer the step at all when the source photo has no recorded dimensions', () => {
    panel(null, null)
    expect(screen.queryByRole('button', { name: /Aspect ratio crop/ })).not.toBeInTheDocument()
  })

  it("skipping the step sends four nulls — today's job, byte for byte", async () => {
    panel()
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })
  })

  it("opening it defaults to the auto-picked ratio and an identity crop — the server's own choice", async () => {
    panel()
    fireEvent.click(cropToggle())
    expect(cropToggle()).toHaveAttribute('aria-expanded', 'true')
    // 832/732 = 1.137; the closest catalogued value by log distance is 5:4.
    expect(screen.getByTestId('crop-studio')).toHaveTextContent('5:4@1/0/0')
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: '5:4',
      cropScale: 1,
      cropX: 0,
      cropY: 0,
    })
  })

  it('sends whatever the studio last reported, in all four fields', async () => {
    panel()
    fireEvent.click(cropToggle())
    fireEvent.click(screen.getByTestId('crop-studio'))
    expect(screen.getByTestId('crop-studio')).toHaveTextContent('16:9@1.5/20/-30')
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: '16:9',
      cropScale: 1.5,
      cropX: 20,
      cropY: -30,
    })
  })

  it('closing the step again drops straight back to the skipped payload', async () => {
    panel()
    fireEvent.click(cropToggle())
    fireEvent.click(screen.getByTestId('crop-studio'))
    fireEvent.click(cropToggle())
    expect(screen.queryByTestId('crop-studio')).not.toBeInTheDocument()
    await run()
    expect(runAction).toHaveBeenCalledWith({
      ...BASE_PAYLOAD,
      cropRatioLabel: null,
      cropScale: null,
      cropX: null,
      cropY: null,
    })
  })
})
