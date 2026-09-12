// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InsightCard } from './InsightCard'

/**
 * This file owns not dying when a stored row predates the schema. `insights.payload` is `jsonb` —
 * it arrives as `unknown` — and F07's own plan records a real captured response that omitted
 * `observations[].title` while the server returned 200. So the contract here is total tolerance:
 *
 *  - whatever is present renders, whatever is missing is skipped, and NOTHING throws;
 *  - blank/whitespace strings are the same as missing;
 *  - a payload with nothing usable at all is the same as no insight → the reserved EmptySlot, whose
 *    fixed minimum height is what keeps the charts below from jumping when prose arrives;
 *  - the verdict pill always shows the WORD, even for a verdict the enum no longer knows.
 */

const FULL_PAYLOAD = {
  headline: 'A controlled week',
  verdict: 'hard',
  whatHappened: 'You ran 32 km across four sessions, most of it steady.',
  observations: [
    { title: 'Long run anchored the week', detail: '18 km on Sunday at an easy shuffle.', metric: '18.0 km' },
    { title: 'Heart rate drifted late', detail: 'The last 3 km sat 6 bpm above pace-equivalent.', metric: '172 bpm' },
  ],
  doNext: ['Keep Tuesday intervals', 'Take Friday fully off'],
  questionForRunner: 'Did the Sunday long run feel harder than the pace says?',
}

describe('InsightCard — a complete payload', () => {
  it('renders every section: eyebrow, verdict pill, headline, prose, observations, next, question', () => {
    render(<InsightCard payload={FULL_PAYLOAD} scopeLabel="This run" />)

    expect(screen.getByText('This run')).toBeInTheDocument()
    expect(screen.getByText('A controlled week')).toBeInTheDocument()
    expect(screen.getByText('You ran 32 km across four sessions, most of it steady.')).toBeInTheDocument()
    expect(screen.getByText('Long run anchored the week')).toBeInTheDocument()
    expect(screen.getByText('18 km on Sunday at an easy shuffle.')).toBeInTheDocument()
    expect(screen.getByText('18.0 km')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByText('Keep Tuesday intervals')).toBeInTheDocument()
    expect(screen.getByText('Take Friday fully off')).toBeInTheDocument()
    expect(screen.getByText('Did the Sunday long run feel harder than the pace says?')).toBeInTheDocument()
  })

  it.each([
    ['very hard', 'bg-warn-soft'],
    ['hard', 'bg-accent-soft'],
    ['easy', 'bg-paper-2'],
    ['moderate', 'bg-paper-2'],
  ] as const)('the known verdict "%s" wears its status tone', (verdict, tone) => {
    render(<InsightCard payload={{ ...FULL_PAYLOAD, verdict }} scopeLabel="This run" />)

    expect(screen.getByText(verdict)).toHaveClass(tone)
  })

  it('an unknown verdict still shows its word on the neutral tone — never a blank pill', () => {
    render(<InsightCard payload={{ ...FULL_PAYLOAD, verdict: 'brutal' }} scopeLabel="This run" />)

    expect(screen.getByText('brutal')).toBeInTheDocument()
    expect(screen.getByText('brutal')).toHaveClass('bg-paper-2')
  })

  it('flags from the parent render inside the same card, below the prose', () => {
    render(
      <InsightCard payload={FULL_PAYLOAD} scopeLabel="This run">
        <p data-testid="flag">ACWR outside range</p>
      </InsightCard>,
    )

    const card = screen.getByText('Did the Sunday long run feel harder than the pace says?').parentElement
    expect(card).toContainElement(screen.getByTestId('flag'))
  })
})

describe('InsightCard — the absent and the unusable', () => {
  it('a null payload renders the reserved slot, word for word', () => {
    render(<InsightCard payload={null} scopeLabel="This week" />)

    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The written analysis is not ready for this one yet. Every number on this screen is already final — the prose is the only thing waiting.',
      ),
    ).toBeInTheDocument()
  })

  it.each([
    ['an array', []],
    ['a string', '"escaped jsonb"'],
    ['a number', 42],
  ])('%s as payload is no insight — the slot, not a crash', (_name, payload) => {
    render(<InsightCard payload={payload} scopeLabel="This run" />)

    expect(screen.getByText(/not ready for this one yet/)).toBeInTheDocument()
  })

  it('an object with nothing usable in it is no insight either — not an empty card with a heading', () => {
    render(<InsightCard payload={{ headline: '   ', observations: [{ metric: '5 km' }] }} scopeLabel="This run" />)

    expect(screen.getByText(/not ready for this one yet/)).toBeInTheDocument()
    expect(screen.queryByText('5 km')).not.toBeInTheDocument()
  })

  it('the reserved height holds in BOTH states, so the charts below never jump', () => {
    const filled = render(<InsightCard payload={FULL_PAYLOAD} scopeLabel="This run" />).container.firstElementChild!
    const waiting = render(<InsightCard payload={null} scopeLabel="This run" />).container.firstElementChild!

    expect(filled).toHaveClass('min-h-[168px]')
    expect(waiting).toHaveClass('min-h-[168px]')
  })
})

describe('InsightCard — tolerant reading of a partial payload', () => {
  it('skips missing sections instead of throwing on them', () => {
    render(<InsightCard payload={{ headline: 'Quiet week' }} scopeLabel="This run" />)

    expect(screen.getByText('Quiet week')).toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('drops observations that carry neither a title nor a detail — a bare metric is not an observation', () => {
    const payload = {
      headline: 'H',
      observations: [
        { metric: '5 km' }, // no words → skipped
        { title: '  ', detail: '' }, // blank words → skipped
        { title: 'Kept the easy days easy' }, // words, no metric → kept
        { detail: 'Splits even throughout.' }, // detail only → kept
      ],
    }
    render(<InsightCard payload={payload} scopeLabel="This run" />)

    expect(screen.getByText('Kept the easy days easy')).toBeInTheDocument()
    expect(screen.getByText('Splits even throughout.')).toBeInTheDocument()
    expect(screen.queryByText('5 km')).not.toBeInTheDocument()
    // Two observations survived.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('whitespace-only doNext entries are dropped from the list', () => {
    render(
      <InsightCard payload={{ headline: 'H', doNext: ['Run easy', '   ', ''] }} scopeLabel="This run" />,
    )

    expect(screen.getByText('Run easy')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('a verdict pill renders above observations even when the headline is missing', () => {
    render(
      <InsightCard payload={{ verdict: 'easy', observations: [{ title: 'Steady' }] }} scopeLabel="This run" />,
    )

    expect(screen.getByText('easy')).toBeInTheDocument()
    expect(screen.getByText('Steady')).toBeInTheDocument()
  })
})
