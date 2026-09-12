// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  SCREEN_KIND_LABEL,
  TYPICAL_EXTRACTION_SECONDS,
  type ScreenKind,
} from '@/lib/extract/constants'

import { ExtractingSkeleton } from './ExtractingSkeleton'

/**
 * R-41's progress screen, where every word must be something the client actually knows. The
 * architecture is one vision call returning a single JSON object — no per-image signal, no partial
 * values — so the screen states four true things and claims nothing else. These tests pin each of
 * those truths and, just as load-bearing, the boundaries of what may appear:
 *
 *   - the honest elapsed count, live and labelled;
 *   - "one pass" copy that adapts to 1 vs N screenshots;
 *   - the "running long" note only past the measured typical wait, never invented progress;
 *   - the give-up screen's two true outs — wait, or start over — with nothing saved;
 *   - a transport hiccup reported as still-working, not as failure;
 *   - and the skeleton run-card below it aria-hidden, because it is decoration, not data.
 */

function photo(kind: ScreenKind, url: string) {
  return { url: `https://blob.test/${url}`, kind, width: 739, height: 1600 }
}

const ONE: ExtractingSkeletonProps['photos'] = [photo('summary', 'summary.jpg')]
const THREE: ExtractingSkeletonProps['photos'] = [
  photo('summary', 'summary.jpg'),
  photo('splits', 'splits.jpg'),
  photo('heartrate', 'hr.jpg'),
]

type ExtractingSkeletonProps = React.ComponentProps<typeof ExtractingSkeleton>

function base(overrides: Partial<ExtractingSkeletonProps> = {}): ExtractingSkeletonProps {
  return {
    photos: ONE,
    elapsedSec: 12,
    gaveUp: false,
    pollError: null,
    onRetry: vi.fn(),
    ...overrides,
  }
}

function renderSkeleton(overrides: Partial<ExtractingSkeletonProps> = {}) {
  const props = base(overrides)
  render(<ExtractingSkeleton {...props} />)
  return props
}

describe('ExtractingSkeleton — the waiting screen', () => {
  it('names the one true activity and states the measured typical wait', () => {
    renderSkeleton()

    expect(screen.getByText('Reading your screenshots')).toBeInTheDocument()
    expect(
      screen.getByText(/in one pass, so the reader can check the total against the splits/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`Usually about ${TYPICAL_EXTRACTION_SECONDS} seconds\\.`)),
    ).toBeInTheDocument()
  })

  it('shows the live elapsed count as the only progress signal, announced politely', () => {
    renderSkeleton({ elapsedSec: 12 })

    const counter = screen.getByText('12s')
    expect(counter).toHaveAttribute('aria-live', 'polite')
    expect(counter).toHaveClass('tabular-nums')
  })

  it('says "all of it" for a single screenshot and counts the screens otherwise', () => {
    const { unmount } = render(<ExtractingSkeleton {...base({ photos: ONE })} />)
    expect(screen.getByText(/All of it in one pass/)).toBeInTheDocument()
    unmount()

    render(<ExtractingSkeleton {...base({ photos: THREE })} />)
    expect(screen.getByText(/All 3 screens in one pass/)).toBeInTheDocument()
  })

  it('renders each uploaded screenshot as participating, labelled by kind', () => {
    renderSkeleton({ photos: THREE })

    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(3)
    THREE.forEach((p, i) => {
      expect(within(figures[i]!).getByText(SCREEN_KIND_LABEL[p.kind])).toBeInTheDocument()
    })
  })

  it('renders no strip when nothing was uploaded', () => {
    renderSkeleton({ photos: [] })

    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
  })

  it(`keeps the calm copy at the overdue bound (${TYPICAL_EXTRACTION_SECONDS * 1.6}s) and only flags "running long" past it`, () => {
    const atBound = render(
      <ExtractingSkeleton {...base({ elapsedSec: TYPICAL_EXTRACTION_SECONDS * 1.6 })} />,
    )
    expect(screen.queryByText(/running long/)).not.toBeInTheDocument()
    atBound.unmount()

    render(<ExtractingSkeleton {...base({ elapsedSec: TYPICAL_EXTRACTION_SECONDS * 1.6 + 1 })} />)
    expect(screen.getByText(/this one is running long\./)).toBeInTheDocument()
    // The claim stays honest even then: still no percentage, no partial numbers.
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  it('keeps the elapsed counter ticking copy while running long — the counter is never the failure signal', () => {
    renderSkeleton({ elapsedSec: 120 })
    expect(screen.getByText('120s')).toBeInTheDocument()
  })
})

describe('ExtractingSkeleton — given up (the 90 s rule)', () => {
  it('swaps the headline for the honest one and replaces the progress copy with the two real options', () => {
    renderSkeleton({ gaveUp: true })

    expect(screen.getByText('This is taking longer than expected')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Nothing has been saved\. You can wait a little longer and check again, or start over/,
      ),
    ).toBeInTheDocument()
    // The waiting copy has no business beside it.
    expect(screen.queryByText('Reading your screenshots')).not.toBeInTheDocument()
    expect(screen.queryByText(/Usually about/)).not.toBeInTheDocument()
  })

  it('offers Check again wired to onRetry and Start over back at /upload', () => {
    const props = renderSkeleton({ gaveUp: true })

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)

    const startOver = screen.getByRole('link', { name: 'Start over' })
    expect(startOver).toHaveAttribute('href', '/upload')
  })

  it('keeps the screenshots on screen and stops their pulse — the evidence did nothing wrong', () => {
    renderSkeleton({ gaveUp: true, photos: THREE })

    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(3)
    for (const figure of figures) {
      // The pulse animation is dropped when gaveUp; only its container keeps the classes.
      expect(figure.querySelector('div')).not.toHaveClass(
        '[animation:ri-pulse_2.4s_ease-in-out_infinite]',
      )
    }
  })

  it('suppresses the poll-error line — the give-up screen supersedes it', () => {
    renderSkeleton({ gaveUp: true, pollError: 'status 503' })

    expect(screen.queryByText(/Still working/)).not.toBeInTheDocument()
  })
})

describe('ExtractingSkeleton — a poll hiccup mid-wait', () => {
  it('says quietly that the last check missed and it is still retrying', () => {
    renderSkeleton({ pollError: 'status 503' })

    const line = screen.getByText(/the last check could not reach the server/)
    expect(line).toHaveTextContent('status 503')
    expect(line).toHaveTextContent('Retrying.')
    // One failed poll is not a failed extraction: the headline and copy do not change.
    expect(screen.getByText('Reading your screenshots')).toBeInTheDocument()
  })

  it('shows nothing about transport while the poll is healthy', () => {
    renderSkeleton()

    expect(screen.queryByText(/Still working/)).not.toBeInTheDocument()
  })
})

describe('ExtractingSkeleton — the skeleton run-card', () => {
  it('is aria-hidden — it is the shape of what is coming and claims nothing', () => {
    const { container } = render(<ExtractingSkeleton {...base()} />)

    const skeletons = container.querySelectorAll('[aria-hidden="true"]')
    expect(skeletons).toHaveLength(1)
    // The one aria-hidden element is the placeholder run-card; nothing visible carries the hint.
    expect(skeletons[0]).toBeInTheDocument()
    expect(screen.queryByText(/km|bpm|distance/i)).not.toBeInTheDocument()
  })
})
