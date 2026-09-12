// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Card, Eyebrow, Stat } from './Card'

/**
 * The app's one surface and its two heading idioms. These are presentational to the point of
 * being plain — which is exactly why a test here is about the *contract*: one class list no
 * screen re-invents, a label that is always a div, and a value column that always lines up.
 */

describe('Card', () => {
  it('is the one surface: white fill, card radius, padding, soft shadow, no border', () => {
    render(
      <Card data-testid="card">
        <p>Hello</p>
      </Card>,
    )

    const card = screen.getByTestId('card')
    expect(card).toHaveClass('rounded-card', 'bg-card', 'p-6', 'shadow-card')
    expect(card.tagName).toBe('DIV')
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('merges a caller className after the surface classes', () => {
    render(<Card className="mt-4" data-testid="card" />)

    expect(screen.getByTestId('card')).toHaveClass('rounded-card', 'mt-4')
  })

  it('forwards the rest of the div props — id, aria, data attributes', () => {
    render(
      <Card id="trends-card" aria-label="Weekly summary" data-testid="card">
        Content
      </Card>,
    )

    const card = screen.getByTestId('card')
    expect(card).toHaveAttribute('id', 'trends-card')
    expect(card).toHaveAttribute('aria-label', 'Weekly summary')
  })
})

describe('Eyebrow', () => {
  it('renders a small accent label', () => {
    render(<Eyebrow>This week</Eyebrow>)

    const eyebrow = screen.getByText('This week')
    expect(eyebrow.tagName).toBe('DIV')
    expect(eyebrow).toHaveClass('text-accent')
  })

  it('merges a caller className', () => {
    render(<Eyebrow className="mb-2">This week</Eyebrow>)

    expect(screen.getByText('This week')).toHaveClass('mb-2')
  })
})

describe('Stat', () => {
  it('renders label over value, with the value on the tabular-nums grid', () => {
    render(<Stat label="Distance" value="10.67 km" />)

    expect(screen.getByText('Distance')).toHaveClass('text-ink-3')
    const value = screen.getByText('10.67 km')
    expect(value).toHaveClass('tabular-nums', 'text-ink')
    // The default size is md.
    expect(value).toHaveClass('text-[19px]')
  })

  it('sizes the value through the design’s three steps', () => {
    const { rerender } = render(<Stat label="L" value="V" size="sm" />)
    expect(screen.getByText('V')).toHaveClass('text-[15px]')

    rerender(<Stat label="L" value="V" size="md" />)
    expect(screen.getByText('V')).toHaveClass('text-[19px]')

    rerender(<Stat label="L" value="V" size="hero" />)
    expect(screen.getByText('V')).toHaveClass('text-[34px]')
  })

  it('accepts a non-string value node', () => {
    const { container } = render(
      <Stat
        label="Pace"
        value={
          <>
            7&apos;22&quot;<span className="sr-only"> per kilometre</span>
          </>
        }
      />,
    )

    expect(container.textContent).toBe('Pace7\'22" per kilometre')
    expect(container.querySelector('span.sr-only')).toHaveTextContent('per kilometre')
  })

  it('renders a note only when one is given', () => {
    const { rerender } = render(<Stat label="Distance" value="10.67 km" note="vs last week" />)

    expect(screen.getByText('vs last week')).toHaveClass('text-ink-3')

    rerender(<Stat label="Distance" value="10.67 km" />)
    expect(screen.queryByText('vs last week')).not.toBeInTheDocument()
  })
})
