// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ErrorLogList } from './ErrorLogList'
import type { ErrorLogListItem } from '@/lib/admin/errorLogModel'

/**
 * `/admin/error-logs`'s list — R2's behaviours, the ones a width cannot be asserted for.
 *
 * **What is NOT asserted here: the pixel fit.** No test in this repo can see a media query or a
 * flex overflow — `tests/admin.shell.test.ts`'s header says so at length, and happy-dom has zero
 * layout. The one-row property is held by the class SHAPE (`min-w-0 truncate` on the label that
 * gives, `shrink-0` on the companions that must not) plus the arithmetic in this phase's plan
 * file, and confirmed by eye at 375px. What IS asserted is everything the shape depends on:
 * exactly one row element per item, the truncating label present, the buttons named, and the
 * image button ABSENT rather than disabled when there is no image.
 */

const BASE: ErrorLogListItem = {
  id: 'e1',
  stamp: '12/09 07:31',
  stampISO: '2026-09-12T00:31:15.000Z',
  provider: 'zai',
  model: 'glm-5.3-flash',
  fullInput: 'SYSTEM: you are Nina\nUSER: halo',
  errorText: 'Timeout: 22s\n\nConnection error.',
  imageUrl: null,
}

const WITH_PHOTO: ErrorLogListItem = {
  ...BASE,
  id: 'e2',
  stamp: '12/09 05:29',
  provider: 'openrouter',
  model: 'z-ai/glm-5.3-flash',
  imageUrl: 'https://blob.example/nina/a.jpg',
}

describe('the row', () => {
  it('renders one list item per log entry and nothing else', () => {
    render(<ErrorLogList items={[BASE, WITH_PHOTO]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('keeps the stamp machine-readable and the model on the same line', () => {
    render(<ErrorLogList items={[BASE]} />)
    const stamp = screen.getByText('12/09 07:31')
    expect(stamp.tagName).toBe('TIME')
    expect(stamp.getAttribute('dateTime')).toBe('2026-09-12T00:31:15.000Z')
    // The label that gives. `truncate` is the whole one-row mechanism; `title` is what makes a
    // truncated model name still answerable with a pointer.
    const model = screen.getByTitle('glm-5.3-flash')
    expect(model.className).toContain('truncate')
    expect(model.className).toContain('min-w-0')
  })

  it('names every icon button with the row it belongs to, not just its job', () => {
    render(<ErrorLogList items={[BASE]} />)
    // Fifty rows of "Full input" would be fifty identical accessible names.
    expect(
      screen.getByRole('button', { name: 'Full input — glm-5.3-flash, 12/09 07:31' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Full error — glm-5.3-flash, 12/09 07:31' }),
    ).toBeTruthy()
  })
})

describe('the image affordance', () => {
  it('draws NOTHING — not a disabled control — when the row has no image', () => {
    render(<ErrorLogList items={[BASE]} />)
    expect(screen.queryByRole('button', { name: /Open the image/ })).toBeNull()
    // planJobPhoto's convention: never a link the server has not proved.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('draws a third button when the row has one', () => {
    render(<ErrorLogList items={[WITH_PHOTO]} />)
    expect(
      screen.getByRole('button', { name: 'Open the image — z-ai/glm-5.3-flash, 12/09 05:29' }),
    ).toBeTruthy()
  })

  it('opens the shared full-screen viewer on that photo', () => {
    render(<ErrorLogList items={[BASE, WITH_PHOTO]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open the image/ }))
    // PhotoViewer names its dialog `${label} ${subject}`.
    expect(
      screen.getByRole('dialog', { name: '12/09 05:29 · z-ai/glm-5.3-flash foto' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('shows one dot per DISTINCT photo, so two failures on one image are one entry', () => {
    const twin = { ...WITH_PHOTO, id: 'e3', stamp: '12/09 05:31' }
    render(<ErrorLogList items={[WITH_PHOTO, twin]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Open the image/ })[0]!)
    // One photo, so PhotoViewer draws no pager at all — which is also the proof that two rows
    // sharing a URL did not become two React children keyed the same.
    expect(screen.queryByRole('button', { name: /Show the/ })).toBeNull()
  })
})

describe('the popups', () => {
  /*
   * `getByText` normalizes whitespace (a run of `\s` collapses to one space), so a multi-line
   * body — the whole reason this popup exists — can never match it. The popup's contract is
   * VERBATIM text, so the assertion reads the `<pre>`'s raw `textContent`, which React renders
   * as one unmodified text node: exact equality, newlines included.
   */
  function dialogBody(): string | null {
    return screen.getByRole('dialog').querySelector('pre')?.textContent ?? null
  }

  it('shows the whole input, unabbreviated, with the row named in the title', () => {
    render(<ErrorLogList items={[BASE]} />)
    fireEvent.click(screen.getByRole('button', { name: /Full input/ }))
    expect(
      screen.getByRole('dialog', { name: 'Full input · 12/09 07:31 · zai · glm-5.3-flash' }),
    ).toBeTruthy()
    expect(dialogBody()).toBe('SYSTEM: you are Nina\nUSER: halo')
  })

  it('shows the whole error, timeout line first', () => {
    render(<ErrorLogList items={[BASE]} />)
    fireEvent.click(screen.getByRole('button', { name: /Full error/ }))
    expect(
      screen.getByRole('dialog', { name: 'Full error · 12/09 07:31 · zai · glm-5.3-flash' }),
    ).toBeTruthy()
    expect(dialogBody()).toBe('Timeout: 22s\n\nConnection error.')
  })

  it('uses ONE dialog for both buttons, so the second tap replaces the first content', () => {
    render(<ErrorLogList items={[BASE]} />)
    fireEvent.click(screen.getByRole('button', { name: /Full input/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: /Full error/ }))
    // The input text is gone and the error text — timeout line first — is what one dialog shows.
    expect(dialogBody()).toBe('Timeout: 22s\n\nConnection error.')
  })
})
