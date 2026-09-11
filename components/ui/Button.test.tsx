// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button, ButtonLink, LoadingDots, buttonClasses } from './Button'

/**
 * Component tests for the button primitives. The class tokens asserted here are the
 * *distinctive* ones per state — the variant's fill/ink pair, the size's height — and not the
 * whole class list, which `buttonClasses` composes and which would make this test a snapshot of
 * the string rather than a test of the choice.
 */

describe('Button', () => {
  it('defaults to type="button", the primary variant and the large size', () => {
    render(<Button>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('bg-ink', 'text-card')
    expect(button).toHaveClass('h-[52px]')
    expect(button).toBeEnabled()
  })

  it('passes type="submit" through instead of defaulting — the form case the default exists for', () => {
    render(<Button type="submit">Go</Button>)

    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'submit')
  })

  it('forwards an explicit disabled alongside its own', () => {
    render(<Button disabled>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('renders the leading icon before the label, inside the button', () => {
    render(<Button leadingIcon={<span data-testid="icon">▲</span>}>Save</Button>)

    const button = screen.getByRole('button', { name: /Save/ })
    const icon = screen.getByTestId('icon')
    // The icon and the label share one wrapper, icon first — that wrapper is the button's
    // first child, so the loading overlay can cover exactly it.
    const wrapper = icon.parentElement!
    expect(wrapper).toBe(button.firstElementChild)
    expect(wrapper.textContent).toContain('Save')
  })

  it('merges a caller className after the variant classes', () => {
    render(<Button className="mt-4">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-ink', 'mt-4')
  })

  it('keeps working as an ordinary button: clicks reach the handler', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('forwards a ref to the button element — DetailPanel focuses its Close through one', () => {
    let ref: HTMLButtonElement | null = null
    render(
      <Button
        ref={(el) => {
          ref = el
        }}
      >
        Close
      </Button>,
    )

    expect(ref).toBeInstanceOf(HTMLButtonElement)
    expect(ref).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  describe('loading', () => {
    it('disables the button, sets aria-busy, hides the label in place and shows the dots', () => {
      render(<Button loading>Saving</Button>)

      const button = screen.getByRole('button', { name: 'Saving' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button).toHaveClass('opacity-85')
      // The label keeps its box (so the button never changes size) but is invisible…
      const label = screen.getByText('Saving')
      expect(label).toHaveClass('invisible')
      // …and the three-pulse LoadingDots sit on top of it.
      expect(button.querySelectorAll('span[aria-hidden="true"] span')).toHaveLength(3)
    })

    it('a disabled prop is unnecessary while loading — loading disables on its own', () => {
      render(<Button loading>Saving</Button>)

      expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled()
    })

    it('an idle button carries no aria-busy and no dots', () => {
      render(<Button>Saving</Button>)

      const button = screen.getByRole('button', { name: 'Saving' })
      expect(button).not.toHaveAttribute('aria-busy')
      expect(button.querySelector('span[aria-hidden="true"]')).toBeNull()
      expect(screen.getByText('Saving')).not.toHaveClass('invisible')
    })
  })
})

describe('ButtonLink', () => {
  it('renders a next/link anchor with the button look', () => {
    render(<ButtonLink href="/r/abc">Open run</ButtonLink>)

    const link = screen.getByRole('link', { name: 'Open run' })
    expect(link).toHaveAttribute('href', '/r/abc')
    expect(link).toHaveClass('bg-ink', 'text-card', 'h-[52px]')
  })

  it('takes the same variant/size/fullWidth knobs as Button', () => {
    render(
      <ButtonLink href="/" variant="secondary" size="md" fullWidth>
        Home
      </ButtonLink>,
    )

    expect(screen.getByRole('link', { name: 'Home' })).toHaveClass('bg-paper-2', 'h-11', 'w-full')
  })

  it('renders the leading icon and a caller className', () => {
    render(
      <ButtonLink href="/" leadingIcon={<span data-testid="icon">→</span>} className="mt-2">
        Next
      </ButtonLink>,
    )

    const link = screen.getByRole('link', { name: /Next/ })
    expect(link).toContainElement(screen.getByTestId('icon'))
    expect(link).toHaveClass('mt-2')
  })
})

describe('buttonClasses', () => {
  it('defaults to primary/lg and no width', () => {
    const classes = buttonClasses()
    expect(classes).toContain('bg-ink')
    expect(classes).toContain('h-[52px]')
    expect(classes).not.toContain('w-full')
  })

  it.each([
    ['primary', 'bg-ink'],
    ['secondary', 'bg-paper-2'],
    ['ghost', 'bg-transparent'],
    ['destructive', 'text-red'],
  ] as const)('variant %s carries its own fill', (variant, token) => {
    expect(buttonClasses({ variant })).toContain(token)
  })

  it.each([
    ['md', 'h-11'],
    ['lg', 'h-[52px]'],
  ] as const)('size %s carries its own height', (size, token) => {
    expect(buttonClasses({ size })).toContain(token)
  })

  it('fullWidth adds w-full, and nothing else does', () => {
    expect(buttonClasses({ fullWidth: true })).toContain('w-full')
    expect(buttonClasses({ variant: 'ghost' })).not.toContain('w-full')
  })

  it('the disabled look travels with the base classes, not the variant', () => {
    const classes = buttonClasses({ variant: 'secondary' })
    expect(classes).toContain('disabled:opacity-50')
  })
})

describe('LoadingDots', () => {
  it('is aria-hidden decoration: three dots, no announced content', () => {
    const { container } = render(<LoadingDots />)

    const root = container.firstElementChild!
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root.children).toHaveLength(3)
  })

  it('merges a caller className', () => {
    const { container } = render(<LoadingDots className="mt-1" />)

    expect(container.firstElementChild).toHaveClass('mt-1')
  })
})
