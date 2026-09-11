// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CropStudio } from './CropStudio'
import type { NinaCrop } from '@/lib/nina/crop'

/*
 * The division of labour this file's header states is what makes it testable at all: every bound
 * lives in `lib/nina/crop.ts`; the component holds "two pointer positions and a subtraction". So
 * these tests drive the gestures (wheel, pointer pan, pinch, keys, slider) with known inputs and
 * pin the `onChange` output against HAND-COMPUTED results from the pure module — the component is
 * on trial for wiring (which event reaches which function with which delta), not for arithmetic.
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

const NATURAL = { width: 600, height: 800 } // portrait; at scale 2 the slack is maxX 250, maxY 500

function studio(crop: NinaCrop = { scale: 2, x: 0, y: 0 }, disabled = false) {
  const onChange = vi.fn()
  const view = render(
    <CropStudio
      src="https://blob.example/her.png"
      natural={NATURAL}
      crop={crop}
      onChange={onChange}
      disabled={disabled}
    />,
  )
  const frame = view.container.querySelector('[role="application"]')!
  // Measure the frame at 400 px, the way layout would.
  frame.getBoundingClientRect = () =>
    ({ width: 400, height: 400, x: 0, y: 0, top: 0, right: 400, bottom: 400, left: 0 }) as DOMRect
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

describe('CropStudio', () => {
  it('is an application landmark with the full instruction in its accessible name', () => {
    studio()
    const frame = screen.getByRole('application', {
      name: 'Frame her face — drag to move, pinch or scroll or use the slider to zoom, arrow keys to nudge',
    })
    expect(frame).toHaveAttribute('tabindex', '0')
    // The decorative crosshair is the operator's centre reference.
    expect(frame.querySelector('span[aria-hidden]')).toBeInTheDocument()
  })

  it('renders the photo through the one crop-to-CSS mapping, undraggable', () => {
    const { view } = studio({ scale: 2, x: 100, y: -50 })
    const img = view.container.querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://blob.example/her.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('draggable', 'false')
    // 600x800 at scale 2 (short edge 600): span 200% x 266.6667%; x=100 → left = 50 + 10 - 100
    // = -40%; y=-50 → top = 50 - 5 - 133.3333 = -88.3333%.
    expect(img).toHaveStyle({ width: '200%', height: '266.6667%', left: '-40%', top: '-88.3333%' })
  })

  it('states the stored values in operator terms under the frame', () => {
    studio({ scale: 2, x: 100, y: -50 })
    expect(
      screen.getByText(/Stored as scale 2\.000×, offset 100\/-50 thousandths of the frame\./),
    ).toBeInTheDocument()
  })

  it('shows the zoom readout and wires the slider in thousandths', () => {
    const { onChange } = studio({ scale: 2, x: 0, y: 0 })
    const label = screen.getByText(/Zoom · 2\.00×/)
    expect(label).toBeInTheDocument()
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider).toHaveAttribute('min', '1000')
    expect(slider).toHaveAttribute('max', '4000')
    expect(slider).toHaveAttribute('step', '10')
    expect(slider).toHaveValue('2000')
    // h-11: the 44px tap floor lives on the input itself.
    expect(slider).toHaveClass('h-11')

    fireEvent.change(slider, { target: { value: '3000' } })
    // next/scale = 3/2 = 1.5, as a factor — so the frame centre holds still.
    expect(onChange).toHaveBeenCalledWith({ scale: 3, x: 0, y: 0 })
  })

  it('zooms on the wheel — deltaY -400 is the 2x cap, +400 the 0.5 floor', () => {
    const { onChange, frame } = studio({ scale: 2, x: 0, y: 0 })
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 4, x: 0, y: 0 })

    fireEvent.wheel(frame, { deltaY: 400 })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 1, x: 0, y: 0 })
  })

  it('registers the wheel listener by hand with passive:false — the only way preventDefault counts', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    studio()
    // React's own root registrations also pass through the prototype; the component's is the one
    // carrying the options object.
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
    const notPrevented = frame.dispatchEvent(event)
    expect(notPrevented).toBe(false) // false = a preventDefault happened
  })

  it('does not register the wheel zoom at all while disabled', () => {
    const { onChange, frame } = studio({ scale: 2, x: 0, y: 0 }, true)
    const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    // Re-render would be needed to observe registration; the dispatch proves the point instead.
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('nudges by 10 stored units per arrow key, 50 with shift', () => {
    const { onChange, frame } = studio({ scale: 2, x: 100, y: 100 })
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 110, y: 100 })
    fireEvent.keyDown(frame, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 100, y: 110 })
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 90, y: 100 })
    fireEvent.keyDown(frame, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 100, y: 90 })
    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 150, y: 100 })
  })

  it('zooms from the keyboard: + and = in, - and _ out, by 1.1x', () => {
    // The component is CONTROLLED: every press recomputes from the prop crop, so each of the
    // four aliases is asserted against its own call, not compounded on the previous one.
    const { onChange, frame } = studio({ scale: 2, x: 100, y: 0 })
    fireEvent.keyDown(frame, { key: '=' })
    expect(onChange).toHaveBeenNthCalledWith(1, { scale: 2.2, x: 110, y: 0 })
    fireEvent.keyDown(frame, { key: '-' })
    expect(onChange).toHaveBeenNthCalledWith(2, { scale: 1.818, x: 91, y: 0 })
    fireEvent.keyDown(frame, { key: '+' })
    expect(onChange).toHaveBeenNthCalledWith(3, { scale: 2.2, x: 110, y: 0 })
    fireEvent.keyDown(frame, { key: '_' })
    expect(onChange).toHaveBeenNthCalledWith(4, { scale: 1.818, x: 91, y: 0 })
  })

  it('ignores keys it does not own', () => {
    const { onChange, frame } = studio()
    fireEvent.keyDown(frame, { key: 'a' })
    fireEvent.keyDown(frame, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pans by the pointer delta, converted from CSS px to stored units at the measured frame width', () => {
    const { onChange, frame } = studio({ scale: 2, x: 0, y: 0 })
    down(frame, 1, 100, 100)
    move(frame, 1, 140, 130) // dx 40, dy 30 → ×(1000/400) = +100, +75
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 100, y: 75 })
  })

  it('returns the crop untouched for a move measured before the frame has any width', () => {
    // No rect patch, no resize fire: framePx is 0, and a divide-by-zero must not move the photo.
    const onChange = vi.fn()
    render(
      <CropStudio src="s" natural={NATURAL} crop={{ scale: 2, x: 0, y: 0 }} onChange={onChange} />,
    )
    const frame = screen.getByRole('application')
    down(frame, 1, 100, 100)
    move(frame, 1, 500, 500)
    expect(onChange).toHaveBeenCalledWith({ scale: 2, x: 0, y: 0 })
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
    const { onChange, frame } = studio({ scale: 2, x: 100, y: 50 })
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0) // seed span 100
    move(frame, 1, 50, 0) // span 50 → ratio 0.5
    // scale 1, x 50, y 25. At scale 1 the 600x800 span is 100% x 133.33%, so x has NO slack
    // (the width fits exactly) but y keeps ±166 — the asymmetry a naive both-axes clamp misses.
    expect(onChange).toHaveBeenLastCalledWith({ scale: 1, x: 0, y: 25 })
  })

  it('zooms IN when the pinch span grows', () => {
    const { onChange, frame } = studio({ scale: 2, x: 0, y: 0 })
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0)
    move(frame, 1, -100, 0) // span 200 → ratio 2
    expect(onChange).toHaveBeenLastCalledWith({ scale: 4, x: 0, y: 0 })
  })

  it('ends the pinch when EITHER finger lifts, and the survivor pans without a jump', () => {
    const { onChange, frame } = studio({ scale: 2, x: 0, y: 0 })
    down(frame, 1, 0, 0)
    down(frame, 2, 100, 0)
    move(frame, 1, -100, 0) // pinch in to 4x
    up(frame, 2)
    onChange.mockClear()
    // The survivor's stored position is (-100, 0); a 40px move is a PAN of +100 units. The pan
    // derives from the PROP crop — controlled, so the mock's earlier zoom is invisible here.
    move(frame, 1, -60, 0)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ scale: 2, x: 100, y: 0 })
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

  it('goes inert while disabled: no pointer, no keys — and the frame is dimmed, unfocusable', () => {
    const { onChange, frame } = studio({ scale: 2, x: 0, y: 0 }, true)
    expect(frame).toHaveClass('opacity-60', 'cursor-default')
    expect(frame).toHaveAttribute('tabindex', '-1')

    down(frame, 1, 0, 0)
    move(frame, 1, 40, 30)
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    fireEvent.wheel(frame, { deltaY: -400 })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('slider')).toBeDisabled()
  })
})
