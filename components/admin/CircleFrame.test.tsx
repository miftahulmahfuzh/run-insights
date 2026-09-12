// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CircleFrame } from './CircleFrame'
import type { NinaCropInput } from '@/lib/nina/crop'

/**
 * `CircleFrame` is four call sites' shared `<span>` (measured 2026-09-12) — and the invariant it
 * exists to enforce is one nobody can see in the markup: the box MUST be square, because
 * `ninaCropStyle`'s `top: N%` only means what `left: N%` means inside a square. So these tests
 * pin the square-box class set, the fact that the `<img>`'s inline style is exactly the one
 * mapping's output for known inputs (computed BY HAND here, not by calling the helper —
 * otherwise the test would just restate the implementation), and the one class lever
 * (`sizeClass`) the call sites actually differ in.
 */

function frame(props?: Partial<Parameters<typeof CircleFrame>[0]>) {
  return render(
    <CircleFrame
      src="https://blob.example/nina/avatar.png"
      natural={{ width: 800, height: 600 }}
      crop={null}
      sizeClass="size-24"
      {...props}
    />,
  )
}

describe('CircleFrame', () => {
  it('renders one decorative, non-draggable img inside a single span', () => {
    const { container } = frame()
    expect(container.querySelectorAll('span')).toHaveLength(1)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', 'https://blob.example/nina/avatar.png')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('draggable', 'false')
  })

  it('carries the square-box class set — relative, block, overflow-hidden, rounded-pill — on every render', () => {
    // The square invariant is invisible: nothing in the markup forces it, so a copied span that
    // drops `overflow-hidden` or stops being square would still "look fine" until the y offset
    // silently stretches. This is the assertion that makes dropping one of these classes red.
    const { container } = frame()
    expect(container.querySelector('span')).toHaveClass(
      'relative',
      'block',
      'overflow-hidden',
      'rounded-pill',
      'bg-paper-2',
      'shrink-0',
    )
  })

  it('passes sizeClass through — the one thing the four call sites differ in', () => {
    const { container } = frame({ sizeClass: 'size-7' })
    expect(container.querySelector('span')).toHaveClass('size-7')
    expect(container.querySelector('span')).not.toHaveClass('size-24')
  })

  it('applies the cover-fit style for an identity crop on a landscape photo — hand-computed', () => {
    // 800x600 at scale 1: the short edge (600) spans 100%, the long edge 800/600 = 133.3333%,
    // and left = 50 - 133.3333/2 = -16.6667%. Hand-computed so the test pins the mapping's
    // OUTPUT, not its implementation.
    const { container } = frame({ natural: { width: 800, height: 600 }, crop: null })
    expect(container.querySelector('img')).toHaveStyle({
      position: 'absolute',
      width: '133.3333%',
      height: '100%',
      left: '-16.6667%',
      top: '0%',
      'object-fit': 'cover',
    })
  })

  it('applies a zoomed, offset crop — hand-computed — so a stored triple reaches the img', () => {
    // 600x800 (short edge 600) at scale 2: span 200% x 266.6667%. x=100 thousandths is +10% of
    // the frame, so left = 50 + 10 - 100 = -40%; y=-50 thousandths is -5%, so
    // top = 50 - 5 - 133.33333 = -88.3333%.
    const crop: NinaCropInput = { scale: 2, x: 100, y: -50 }
    const { container } = frame({ natural: { width: 600, height: 800 }, crop })
    expect(container.querySelector('img')).toHaveStyle({
      width: '200%',
      height: '266.6667%',
      left: '-40%',
      top: '-88.3333%',
    })
  })

  it('renders a square photo with no crop as exactly 100% x 100% at 0,0 — plain object-cover', () => {
    // The equality that makes the whole album safe to leave un-backfilled: NULL crop columns on
    // a square source must come out as the identity box, indistinguishable from the pre-R23
    // `object-cover`.
    const { container } = frame({ natural: { width: 400, height: 400 }, crop: null })
    expect(container.querySelector('img')).toHaveStyle({
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
    })
  })

  it('degrades unknown natural dimensions to the square identity box instead of throwing', () => {
    // nina_avatars.width/height are nullable; the render path must survive the NULL row.
    const { container } = frame({ natural: { width: null, height: null }, crop: null })
    expect(container.querySelector('img')).toHaveStyle({
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
    })
  })

  it('treats a partial crop triple as offsets of zero, per phase 1’s renderer rule', () => {
    // scale set, offsets NULL: the stored convention says read the missing offsets as 0, not as
    // an error. 800x600 at scale 1.5: span 200% x 150%, left = 50 - 100 = -50%, top = 50 - 75 = -25%.
    const crop: NinaCropInput = { scale: 1.5, x: null, y: null }
    const { container } = frame({ natural: { width: 800, height: 600 }, crop })
    expect(container.querySelector('img')).toHaveStyle({
      width: '200%',
      height: '150%',
      left: '-50%',
      top: '-25%',
    })
  })
})
