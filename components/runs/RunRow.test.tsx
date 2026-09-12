// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RunRow } from './RunRow'

/**
 * One row of `/`. The load-bearing assertions: the WHOLE row is the link (a 44pt one-hand target —
 * there is no inner "view" affordance to find), and the three lines never change order between rows
 * (identity → what the run WAS → how it FELT), because a reader scans the column downward. The
 * optional pieces (photo count, heart rate, location) appear only when they exist — a row never
 * renders an empty slot where a number would be.
 */

const RUN = {
  id: 'abc123',
  occurredOn: '2026-08-18',
  distanceM: 10000,
  durationSec: 4716,
  avgPaceSec: 442,
  avgHr: 173,
  location: 'Senayan',
}

function rowText(run = RUN, photoCount?: number) {
  const { container } = render(
    <ul>{photoCount === undefined ? <RunRow run={run} /> : <RunRow run={run} photoCount={photoCount} />}</ul>,
  )
  return container.querySelector('a')!.textContent ?? ''
}

describe('RunRow', () => {
  it('the whole row is one link to the run detail page', () => {
    render(
      <ul>
        <RunRow run={RUN} />
      </ul>,
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/r/abc123')
    expect(link.tagName).toBe('A')
  })

  it('renders the three lines in fixed order: day, then distance · duration, then pace · hr · location', () => {
    const text = rowText()

    expect(text).toContain('Tue 18 Aug') // formatDayShort — the identity line
    expect(text).toContain('10.00 km · 1:18:36') // what the run WAS, one separator
    expect(text).toContain("7'22\"/km avg · 173 bpm avg · Senayan") // how it FELT
    // …and in that order, top to bottom.
    expect(text.indexOf('Tue 18 Aug')).toBeLessThan(text.indexOf('10.00 km'))
    expect(text.indexOf('10.00 km')).toBeLessThan(text.indexOf("7'22\""))
  })

  it('hours appear in the duration only when they exist — 41:23, never 0:41:23', () => {
    expect(rowText({ ...RUN, durationSec: 2483 })).toContain('41:23')
  })

  it('shows the photo count with the word, so the glyph is decoration and the number is not', () => {
    const withPhotos = rowText(RUN, 2)
    expect(withPhotos).toContain('⧉ 2')
    expect(withPhotos).toContain('screenshots') // the sr-only span

    const withoutPhotos = rowText(RUN, 0)
    expect(withoutPhotos).not.toContain('⧉')
    expect(withoutPhotos).not.toContain('screenshots')
  })

  it('omits the heart-rate and location segments when the run has neither', () => {
    const text = rowText({ ...RUN, avgHr: null, location: null })

    expect(text).toContain("7'22\"/km avg") // pace still there…
    expect(text).not.toContain('bpm') // …with no bpm slot after it
    expect(text).not.toContain('Senayan')
    // And no dangling separator where the missing fields would have been.
    expect(text.trimEnd().endsWith('/km avg')).toBe(true)
  })

  it('rounds heart rate through the shared formatter — no decimals on a pulse', () => {
    expect(rowText({ ...RUN, avgHr: 172.6 })).toContain('173 bpm')
  })
})
