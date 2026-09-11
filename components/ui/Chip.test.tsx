// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CHIP_CLASS, Chip } from './Chip'

/**
 * A pill that is either a filter or a fact — two states, no third. The load-bearing assertion
 * here is `aria-pressed` and not `aria-selected`: these are toggles in a group, and the component's
 * own comment says a screen reader announcing "selected" has told the user nothing about whether
 * tapping it again turns it off.
 */

describe('Chip', () => {
  it('renders a button with type="button" and the 44px chip shape', () => {
    render(<Chip>Easy</Chip>)

    const chip = screen.getByRole('button', { name: 'Easy' })
    expect(chip).toHaveAttribute('type', 'button')
    expect(chip).toHaveClass('h-11', 'rounded-pill')
  })

  it('unselected by default: aria-pressed false, page-tint fill', () => {
    render(<Chip>Easy</Chip>)

    const chip = screen.getByRole('button', { name: 'Easy' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip).toHaveClass('bg-paper-2')
    expect(chip).not.toHaveClass('bg-ink')
  })

  it('selected: aria-pressed true and the same ink slab a primary button wears', () => {
    render(<Chip selected>Easy</Chip>)

    const chip = screen.getByRole('button', { name: 'Easy' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveClass('bg-ink', 'text-card')
  })

  it('has no toggle state of its own: a tap reports, it does not flip', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    // No rerender: the chip was mounted unselected and nothing re-renders it selected.
    render(
      <Chip selected={false} onClick={onClick}>
        Easy
      </Chip>,
    )

    await user.click(screen.getByRole('button', { name: 'Easy' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('forwards onClick and the rest of the button props', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Chip onClick={onClick} aria-label="Pace trend">
        Pace
      </Chip>,
    )

    await user.click(screen.getByRole('button', { name: 'Pace trend' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables through the native attribute and the chip’s own opacity rule', () => {
    const onClick = vi.fn()
    render(
      <Chip disabled onClick={onClick}>
        Easy
      </Chip>,
    )

    const chip = screen.getByRole('button', { name: 'Easy' })
    expect(chip).toBeDisabled()
    expect(chip).toHaveClass('disabled:opacity-50')
  })

  it('merges a caller className after the state classes', () => {
    render(
      <Chip selected className="mx-1">
        Easy
      </Chip>,
    )

    expect(screen.getByRole('button', { name: 'Easy' })).toHaveClass('bg-ink', 'mx-1')
  })
})

// `chipClasses` is module-private (only `Chip` renders it), so these pin the same rules through
// the public component's rendered output.
describe('Chip state classes', () => {
  it('both states share the chip shape; only the fill pair differs', () => {
    const off = render(<Chip>Easy</Chip>).container.firstElementChild!
    const on = render(<Chip selected>Easy</Chip>).container.firstElementChild!

    for (const chip of [off, on]) {
      expect(chip).toHaveClass('h-11', 'rounded-pill')
    }
    expect(on).toHaveClass('bg-ink')
    expect(off).toHaveClass('bg-paper-2')
  })

  it('CHIP_CLASS is the shared shape both states are built from', () => {
    const off = render(<Chip>Easy</Chip>).container.firstElementChild!
    const on = render(<Chip selected>Easy</Chip>).container.firstElementChild!

    for (const chip of [off, on]) {
      expect(chip).toHaveClass(...CHIP_CLASS.split(' '))
    }
  })
})
