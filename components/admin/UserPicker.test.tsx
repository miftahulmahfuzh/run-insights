// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UserPicker } from './UserPicker'
import type { AdminUserRow } from '@/lib/admin/users'

/**
 * `UserPicker` is the per-user page contract made visible: it renders even for one account
 * (invariant 7 — hiding it would hide the contract), it is server-rendered plain links with NO
 * active-link highlighting (the package readme forbids reading the pathname here), and its hrefs
 * are `basePath + ?user=<encoded id>`. These tests pin all three, plus the label-precedence rule
 * `name ?? email ?? id` and the counts that stay MEMORY counts on every page that borrows it.
 */

function user(overrides?: Partial<AdminUserRow>): AdminUserRow {
  return {
    id: 'u-nina',
    name: 'Nina',
    email: 'nina@example.com',
    slots: 3,
    facts: 12,
    ...overrides,
  }
}

describe('UserPicker', () => {
  it('renders the empty-state sentence when there are no accounts', () => {
    render(<UserPicker users={[]} selectedId={null} />)
    expect(
      screen.getByText('No accounts yet. Sign in once and this page has something to show.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('still renders the picker for exactly one account — per-user-by-contract, not "one is none"', () => {
    // The header’s stated reason: the page is per-user by contract and hiding the picker for one
    // account would make that invisible. One row is a fine list.
    render(<UserPicker users={[user()]} selectedId="u-nina" />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('labels the list "Which user"', () => {
    render(<UserPicker users={[user()]} selectedId={null} />)
    expect(screen.getByRole('navigation', { name: 'Which user' })).toBeInTheDocument()
  })

  it('links each account to basePath?user=<id> — the default basePath is /admin/memory', () => {
    render(<UserPicker users={[user(), user({ id: 'u-two', name: 'Two' })]} selectedId={null} />)
    expect(screen.getByRole('link', { name: /Nina/ })).toHaveAttribute(
      'href',
      '/admin/memory?user=u-nina',
    )
    expect(screen.getByRole('link', { name: /Two/ })).toHaveAttribute(
      'href',
      '/admin/memory?user=u-two',
    )
  })

  it('encodes the user id into the query string', () => {
    render(<UserPicker users={[user({ id: 'u1&x=2' })]} selectedId={null} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/memory?user=u1%26x%3D2')
  })

  it('honours a custom basePath — /admin/shortcuts navigates within its own route', () => {
    render(<UserPicker users={[user()]} selectedId={null} basePath="/admin/shortcuts" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/shortcuts?user=u-nina')
  })

  it('falls back through name, then email, then id for the pill label', () => {
    render(
      <UserPicker
        users={[
          user({ id: 'a', name: 'Named', email: 'named@example.com' }),
          user({ id: 'b', name: null, email: 'only@mail.co' }),
          user({ id: 'c', name: null, email: null }),
        ]}
        selectedId={null}
      />,
    )
    expect(screen.getByRole('link', { name: /Named/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /only@mail\.co/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /(^|\s)c\s/ })).toBeInTheDocument()
  })

  it('shows the memory counts — slots and the WHOLE fact ledger, not a page count', () => {
    render(<UserPicker users={[user({ slots: 7, facts: 313 })]} selectedId={null} />)
    // The JSX interleaves text nodes, so match the whole pill’s text rather than one node.
    const pill = screen.getByRole('link', { name: /Nina/ })
    expect(pill).toHaveTextContent('7 slots')
    expect(pill).toHaveTextContent('·')
    expect(pill).toHaveTextContent('313 facts')
  })

  it('marks only the selected account with aria-current="page"', () => {
    render(
      <UserPicker
        users={[user({ id: 'a', name: 'A' }), user({ id: 'b', name: 'B' })]}
        selectedId="b"
      />,
    )
    expect(screen.getByRole('link', { name: /A/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /B/ })).toHaveAttribute('aria-current', 'page')
  })

  it('leaves aria-current unset entirely when nothing is selected — not aria-current="false"', () => {
    render(<UserPicker users={[user()]} selectedId={null} />)
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current')
  })

  it('styles the selected pill differently from the rest — the readme’s no-pathname highlighting is props-driven', () => {
    render(
      <UserPicker
        users={[user({ id: 'a', name: 'A' }), user({ id: 'b', name: 'B' })]}
        selectedId="a"
      />,
    )
    expect(screen.getByRole('link', { name: /A/ })).toHaveClass('border-accent', 'bg-card')
    expect(screen.getByRole('link', { name: /B/ })).toHaveClass('border-rule')
    expect(screen.getByRole('link', { name: /B/ })).not.toHaveClass('bg-card')
  })

  it('meets the 44-pixel touch-target floor via TOUCH_TARGET', () => {
    render(<UserPicker users={[user()]} selectedId={null} />)
    expect(screen.getByRole('link')).toHaveClass('min-h-11')
  })
})
