// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PeriodNav, ScopeSwitcher } from './ScopeSwitcher'

/**
 * Both exports are deliberate links, not buttons with state: switching scope re-queries the server,
 * so the URL is the state. The assertions pin the URL shape (`/trends?scope=…&key=…`) and the
 * `aria-current="page"` mark that tells a screen reader which tab is showing — plus PeriodNav's one
 * honest absence: at the present period the forward chevron does not exist at all, rather than
 * sitting there disabled, promising a next page the app cannot serve.
 */

describe('ScopeSwitcher', () => {
  it('offers exactly two tabs, each carrying its key in the query string', () => {
    render(<ScopeSwitcher scope="week" weekKey="2026-W34" monthKey="2026-08" />)

    const week = screen.getByRole('link', { name: 'Week' })
    const month = screen.getByRole('link', { name: 'Month' })
    expect(week).toHaveAttribute('href', '/trends?scope=week&key=2026-W34')
    expect(month).toHaveAttribute('href', '/trends?scope=month&key=2026-08')
  })

  it('marks the active scope with aria-current="page" and leaves the other unmarked', () => {
    render(<ScopeSwitcher scope="month" weekKey="2026-W34" monthKey="2026-08" />)

    expect(screen.getByRole('link', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Week' })).not.toHaveAttribute('aria-current')
  })

  it('the two tabs are the only controls — no client state, no buttons', () => {
    const { container } = render(
      <ScopeSwitcher scope="week" weekKey="2026-W34" monthKey="2026-08" />,
    )

    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})

describe('PeriodNav', () => {
  it('renders the label between a previous and a next chevron, each an aria-labelled link', () => {
    render(
      <PeriodNav
        label="Week of 10 Aug 2026"
        previousHref="/trends?scope=week&key=2026-W33"
        nextHref="/trends?scope=week&key=2026-W35"
      />,
    )

    expect(screen.getByText('Week of 10 Aug 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous period' })).toHaveAttribute(
      'href',
      '/trends?scope=week&key=2026-W33',
    )
    expect(screen.getByRole('link', { name: 'Next period' })).toHaveAttribute(
      'href',
      '/trends?scope=week&key=2026-W35',
    )
  })

  it('at the present period the forward chevron is ABSENT, not disabled', () => {
    const { container } = render(
      <PeriodNav
        label="This week"
        previousHref="/trends?scope=week&key=2026-W33"
        nextHref={null}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Next period' })).not.toBeInTheDocument()
    expect(screen.queryByText('›')).not.toBeInTheDocument()
    // The placeholder keeps the title centred without being a control or noise to a reader.
    expect(container.querySelector('span[aria-hidden="true"]')).not.toBeNull()
    // The way back always exists.
    expect(screen.getByRole('link', { name: 'Previous period' })).toBeInTheDocument()
  })
})
