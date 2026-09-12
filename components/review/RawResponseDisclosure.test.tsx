// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RawResponseDisclosure } from './RawResponseDisclosure'

/**
 * The escape hatch's contract, and the reason it is safe to render at all:
 *
 *  - **It renders nothing when there is no vendor payload** — a manual-entry review (§8) has no
 *    `raw_response.vendor` to show, and a dead `<details>` frame would be worse than absence.
 *  - **Nothing escapes the disclosure until it is opened** — the raw reply is the one place the
 *    provenance guard's discards are visible, and it must never read as part of the review UI.
 *  - **A hostile payload cannot take the screen down** — `safeStringify` is the component's whole
 *    robustness story, so both of its exits (too big, cyclic) get a test. The vendor reply is the
 *    only unvalidated JSON this screen ever touches.
 */

describe('RawResponseDisclosure', () => {
  it.each([[null], [undefined]] as const)('renders nothing for %s', (raw) => {
    const { container } = render(<RawResponseDisclosure raw={raw} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('starts closed, advertising "show", with the payload not rendered', () => {
    render(<RawResponseDisclosure raw={{ vendor: 'reply' }} />)

    expect(screen.getByText('What the reader actually returned')).toBeInTheDocument()
    expect(screen.getByText('show')).toBeInTheDocument()
    // Inside a closed <details> the body is not visible to the reader…
    expect(screen.getByText(/The raw reply, before validation/)).not.toBeVisible()
    // …and the JSON sits in the pre, formatted, but equally hidden.
    expect(screen.getByText(/"vendor": "reply"/)).not.toBeVisible()
  })

  it('opens on toggle, flips the label to "hide" and shows the pretty-printed payload', () => {
    render(
      <RawResponseDisclosure
        raw={{ parsedSession: { durationSec: 4716 }, attempts: 1 }}
      />,
    )

    fireEvent.click(screen.getByText('What the reader actually returned'))

    expect(screen.getByText('hide')).toBeInTheDocument()
    expect(screen.getByText(/"durationSec": 4716/)).toBeVisible()
    // Two-space indent — the payload is for a human diffing it against the fields above.
    // Read off the <pre> directly: getByText's default normalizer collapses the newlines the
    // indent lives on, so the pretty-printing is only assertable on the raw text content.
    const pre = screen.getByText(/"durationSec": 4716/).closest('pre')!
    expect(pre.textContent).toContain('\n  "attempts": 1')
  })

  it('truncates a gigantic payload instead of handing the DOM forty thousand lines', () => {
    render(<RawResponseDisclosure raw={{ blob: 'x'.repeat(41_000) }} />)

    const pre = screen.getByText(/truncated/).closest('pre')!
    expect(pre.textContent!.length).toBeLessThan(41_000 + 100)
    expect(pre.textContent).toMatch(/… truncated$/)
  })

  it('survives a cyclic payload — String(value), not a TypeError', () => {
    const cyclic: Record<string, unknown> = { attempts: 1 }
    cyclic.self = cyclic

    render(<RawResponseDisclosure raw={cyclic} />)

    // JSON.stringify threw; the disclosure still renders, with the fallback spelling.
    expect(screen.getByText('[object Object]')).toBeInTheDocument()
  })
})
