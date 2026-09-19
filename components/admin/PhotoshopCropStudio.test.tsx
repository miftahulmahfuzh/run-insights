// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotoshopCropStudio, type PhotoshopCropSelection } from './PhotoshopCropStudio'
import { NINA_IMAGE_ASPECT_RATIOS } from '@/lib/nina/imagerecipe'

/*
 * Same division of labour as `CropStudio.test.tsx`, and the same posture: every bound lives in
 * `lib/nina/photoshopCrop.ts`, so these cases drive the gestures (select, wheel, pointer pan,
 * pinch, keys, slider) with known inputs and pin `onChange`'s output against HAND-COMPUTED results
 * from the pure module. The component is on trial for WIRING — which event reaches which function
 * with which delta and which target ratio — not for arithmetic.
 *
 * THE FIXTURE, and why it is not square: a 600x800 source (ratio 0.75) in a 2:1 frame. The source
 * is narrower than the frame, so the WIDTH is the binding edge: widthPct = 100*scale and
 * heightPct = 100*scale*(2/0.75) = 266.667*scale. The frame is measured at 400 px wide, so it is
 * 200 px tall, and a pointer delta converts at 1000/400 on x and 1000/200 on y — two different
 * divisors. A square-frame implementation passes every other case in this file and fails that one.
 *
 * happy-dom natively has PointerEvent, WheelEvent and setPointerCapture; `getBoundingClientRect`
 * returns zeros, so the frame's 400 px width is patched and pushed in through the ResizeObserver
 * callback, exactly the way a real layout change would arrive.
 */

let fireResize: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries?: unknown[]) => void) {
        fireResize = () => callback([])
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const NATURAL = { width: 600, height: 800 }

function studio(
  value: PhotoshopCropSelection = { ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } },
  disabled = false,
) {
  const onChange = vi.fn()
  const view = render(
    <PhotoshopCropStudio
      src="https://blob.example/her.png"
      natural={NATURAL}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />,
  )
  const frame = view.container.querySelector('[role="application"]')!
  // Measure the frame at 400 px wide, the way layout would. Height follows from the 2:1 ratio.
  frame.getBoundingClientRect = () =>
    ({ width: 400, height: 200, x: 0, y: 0, top: 0, right: 400, bottom: 200, left: 0 }) as DOMRect
  act(() => {
    fireResize()
  })
  return { onChange, frame, view }
}

function down(frame: Element, pointerId: number, x: number, y: number, button = 0) {
  fireEvent.pointerDown(frame, { pointerId, clientX: x, clientY: y, button })
}
function move(frame: Element, pointerId: number, x: number, y: number) {
  fireEvent.pointerMove(frame, { pointerId, clientX: x, clientY: y })
}
function up(frame: Element, pointerId: number) {
  fireEvent.pointerUp(frame, { pointerId })
}

describe('PhotoshopCropStudio', () => {
  it('is an application landmark naming the chosen ratio and the full instruction', () => {
    const { frame } = studio()
    expect(
      screen.getByRole('application', {
        name: 'Crop to 2:1 — drag to move, pinch or scroll or use the slider to zoom, arrow keys to nudge',
      }),
    ).toBe(frame)
    expect(frame).toHaveAttribute('tabindex', '0')
    expect(frame.querySelector('span[aria-hidden]')).toBeInTheDocument()
  })

  it('shapes the frame from the LABEL, not the float — `aspect-ratio: 2 / 1`', () => {
    const { frame } = studio()
    expect(frame.getAttribute('style')).toContain('aspect-ratio: 2 / 1')
    // Not the circle: this frame is a rectangle and must never inherit CropStudio's pill.
    expect(frame).not.toHaveClass('aspect-square')
    expect(frame).not.toHaveClass('rounded-pill')
  })

  it('renders the photo through the one crop-to-CSS mapping, undraggable', () => {
    const { view } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: -50 } })
    const img = view.container.querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://blob.example/her.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('draggable', 'false')
    // 600x800 in a 2:1 frame at scale 2: widthPct 200, heightPct 533.3333.
    // x=100 → left = 50 + 10 - 100 = -40%; y=-50 → top = 50 - 5 - 266.6667 = -221.6667%.
    expect(img).toHaveStyle({
      width: '200%',
      height: '533.3333%',
      left: '-40%',
      top: '-221.6667%',
    })
  })

  it('states the ratio and the stored values in operator terms under the frame', () => {
    studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: -50 } })
    expect(screen.getByText(/Stored as 2:1, scale 2\.000×, offset 100\/-50\./)).toBeInTheDocument()
  })

  it('offers every catalogued ratio, and nothing else — the enum is the single source of truth', () => {
    studio()
    const select = screen.getByRole('combobox', { name: 'Crop aspect ratio' }) as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(
      NINA_IMAGE_ASPECT_RATIOS.map((entry) => entry.label),
    )
    expect(select).toHaveValue('2:1')
  })

  it('re-clamps the crop against the NEW frame shape when the ratio changes', () => {
    // y=1000 is legal at 2:1 (heightPct 533.33 → |y| ≤ 2166). At 3:4 the source ratio equals the
    // frame ratio, both spans are 200% at scale 2, and the limit collapses to ±500.
    const { onChange } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 1000 } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Crop aspect ratio' }), {
      target: { value: '3:4' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ratioLabel: '3:4',
      crop: { scale: 2, x: 100, y: 500 },
    })
  })

  it('shows the zoom readout and wires the slider in thousandths, holding the ratio', () => {
    const { onChange } = studio()
    expect(screen.getByText(/Zoom · 2\.00×/)).toBeInTheDocument()
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider).toHaveAttribute('min', '1000')
    expect(slider).toHaveAttribute('max', '4000')
    expect(slider).toHaveAttribute('step', '10')
    expect(slider).toHaveValue('2000')
    expect(slider).toHaveClass('h-11')

    fireEvent.change(slider, { target: { value: '3000' } })
    // next/scale = 3/2 = 1.5, as a factor — so the frame centre holds still.
    expect(onChange).toHaveBeenCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 3, x: 0, y: 0 },
    })
  })

  it('zooms on the wheel — deltaY -400 is the 2x cap, +400 the 0.5 floor', () => {
    const { onChange, frame } = studio()
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 4, x: 0, y: 0 },
    })

    fireEvent.wheel(frame, { deltaY: 400 })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 1, x: 0, y: 0 },
    })
  })

  it('registers the wheel listener by hand with passive:false — the only way preventDefault counts', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    studio()
    const wheelCalls = spy.mock.calls.filter(([type]) => type === 'wheel')
    expect(wheelCalls).not.toHaveLength(0)
    expect(
      wheelCalls.some(([, , options]) => JSON.stringify(options) === '{"passive":false}'),
    ).toBe(true)
    spy.mockRestore()
  })

  it('never scrolls the page while zooming — the wheel handler calls preventDefault', () => {
    const { frame } = studio()
    const event = new WheelEvent('wheel', { deltaY: -120, cancelable: true })
    expect(frame.dispatchEvent(event)).toBe(false) // false = a preventDefault happened
  })

  it('does not register the wheel zoom at all while disabled', () => {
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } }, true)
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('nudges by 10 stored units per arrow key, 50 with shift', () => {
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 100 } })
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 110, y: 100 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 110 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 90, y: 100 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 90 },
    })
    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 150, y: 100 },
    })
  })

  it('zooms from the keyboard: + and = in, - and _ out, by 1.1x', () => {
    // CONTROLLED: every press recomputes from the prop value, so each alias is asserted against
    // its own call rather than compounded on the previous one.
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 0 } })
    fireEvent.keyDown(frame, { key: '=' })
    expect(onChange).toHaveBeenNthCalledWith(1, {
      ratioLabel: '2:1',
      crop: { scale: 2.2, x: 110, y: 0 },
    })
    fireEvent.keyDown(frame, { key: '-' })
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ratioLabel: '2:1',
      crop: { scale: 1.818, x: 91, y: 0 },
    })
    fireEvent.keyDown(frame, { key: '+' })
    expect(onChange).toHaveBeenNthCalledWith(3, {
      ratioLabel: '2:1',
      crop: { scale: 2.2, x: 110, y: 0 },
    })
    fireEvent.keyDown(frame, { key: '_' })
    expect(onChange).toHaveBeenNthCalledWith(4, {
      ratioLabel: '2:1',
      crop: { scale: 1.818, x: 91, y: 0 },
    })
  })

  it('ignores keys it does not own', () => {
    const { onChange, frame } = studio()
    fireEvent.keyDown(frame, { key: 'a' })
    fireEvent.keyDown(frame, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('converts a pointer delta PER AXIS — 400 px wide, 200 px tall, two divisors', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 100, 100)
    move(frame, 1, 140, 130) // dx 40 → ×(1000/400) = +100; dy 30 → ×(1000/200) = +150
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 150 },
    })
  })

  it('returns the crop untouched for a move measured before the frame has any width', () => {
    // No rect patch, no resize fire: framePx is 0, and a divide-by-zero must not move the photo.
    const onChange = vi.fn()
    render(
      <PhotoshopCropStudio
        src="s"
        natural={NATURAL}
        value={{ ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } }}
        onChange={onChange}
      />,
    )
    const frame = screen.getByRole('application')
    down(frame, 1, 100, 100)
    move(frame, 1, 500, 500)
    expect(onChange).toHaveBeenCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 0, y: 0 },
    })
  })

  it('ignores a move from a pointer that never went down', () => {
    const { onChange, frame } = studio()
    move(frame, 99, 10, 10)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores anything but the primary button — a right-click does not start a drag', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 100, 100, 2)
    move(frame, 1, 140, 130)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pinches on two pointers: the span ratio drives the zoom, seeded on the second contact', () => {
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 100, y: 50 } })
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0) // seed span 100
    move(frame, 1, 50, 0) // span 50 → ratio 0.5
    // scale 1, x 50, y 25. At scale 1 the width spans exactly 100% of the frame, so x has NO
    // slack; the height still spans 266.67%, so y keeps ±833 — the asymmetry a naive both-axes
    // clamp misses, here driven by the FRAME's shape and not just the photo's.
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 1, x: 0, y: 25 },
    })
  })

  it('zooms IN when the pinch span grows', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0)
    move(frame, 1, -100, 0) // span 200 → ratio 2
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 4, x: 0, y: 0 },
    })
  })

  it('ends the pinch when EITHER finger lifts, and the survivor pans without a jump', () => {
    const { onChange, frame } = studio()
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0)
    move(frame, 1, -100, 0) // pinch in
    up(frame, 2)
    onChange.mockClear()
    // The survivor's stored position is (-100, 0); a 40 px move is a PAN of +100 units. The pan
    // derives from the PROP value — controlled, so the mock's earlier zoom is invisible here.
    move(frame, 1, -60, 0)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({
      ratioLabel: '2:1',
      crop: { scale: 2, x: 100, y: 0 },
    })
  })

  it('shows the grabbing cursor only while a pointer is down, and releases cleanly', () => {
    const { frame } = studio()
    down(frame, 1, 0, 0)
    expect(frame).toHaveClass('cursor-grabbing')
    up(frame, 1)
    expect(frame).toHaveClass('cursor-grab')
    expect(frame).not.toHaveClass('cursor-grabbing')
  })

  it('survives an up event for a pointer it never knew', () => {
    const { frame } = studio()
    expect(() => up(frame, 42)).not.toThrow()
    expect(frame).toHaveClass('cursor-grab')
  })

  it('goes inert while disabled: no pointer, no keys, no ratio change — dimmed and unfocusable', () => {
    const { onChange, frame } = studio({ ratioLabel: '2:1', crop: { scale: 2, x: 0, y: 0 } }, true)
    expect(frame).toHaveClass('opacity-60', 'cursor-default')
    expect(frame).toHaveAttribute('tabindex', '-1')

    down(frame, 1, 0, 0)
    move(frame, 1, 40, 30)
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Crop aspect ratio' })).toBeDisabled()
  })
})
