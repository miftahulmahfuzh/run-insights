// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewContext } from '@/lib/review/loadReview'
import { emptyDraft, hydrateDraftFromExtraction, type ReviewDraft } from '@/lib/review/draft'
import { IDLE_COMMIT_STATE, type CommitReviewState } from '@/lib/review/schema'
import { TRUTH } from '../../research/schema.mjs'

import { ReviewClient } from './ReviewClient'

/**
 * **The second-most-important screen in the app**, tested here at the level of its WIRING: the
 * seven sections are stubbed (they have suites of their own — ChatScreen.test.tsx is the
 * precedent), so what these tests pin is everything the screen itself owns:
 *
 *  - one `draft`, one immutable `baseline`, everything else derived — checks re-run per
 *    keystroke, `edited` chips diff against the baseline, and the banner only renders once
 *    there is a duration to check against;
 *  - the three banner states (not-saved-yet, manual entry, none-in-edit-mode) and the §8
 *    contract that manual entry is the same screen, not a second UI;
 *  - the sticky bar that is NEVER disabled for validation, a payload assembled from the
 *    context, and the status line whose singular/plural bug once rode out on the front page;
 *  - what a failed and a duplicated commit look like when they come back.
 */

const NOW = new Date('2026-08-21T02:00:00Z')

/* ── the child stubs ────────────────────────────────────────────────────────────────────────
 * Each publishes the props the wiring tests assert on. Serves as the data-props bridge: Sets
 * are serialised to arrays because JSON.stringify has no alphabet for them. */
function propsOf(el: HTMLElement): Record<string, unknown> {
  return JSON.parse(el.getAttribute('data-props')!)
}
function section(name: string) {
  return screen.getByTestId(`section-${name}`)
}

vi.mock('./ScreenshotStrip', () => ({
  ScreenshotStrip: (props: { photos: unknown[] }) => (
    <div data-testid="section-strip" data-props={JSON.stringify({ photos: props.photos })} />
  ),
  SheetSource: () => null,
}))
vi.mock('./HeroFields', () => ({
  HeroFields: (props: {
    draft: ReviewDraft
    flaggedPaths: ReadonlySet<string>
    editedPaths: ReadonlySet<string>
    errors: Record<string, string>
    onChange: (patch: Partial<ReviewDraft>) => void
  }) => (
    <div
      data-testid="section-hero"
      data-props={JSON.stringify({
        draft: props.draft,
        flagged: [...props.flaggedPaths],
        edited: [...props.editedPaths],
        errors: props.errors,
      })}
    >
      <button type="button" onClick={() => props.onChange({ durationSec: 4800 })}>
        edit-duration
      </button>
    </div>
  ),
}))
vi.mock('./ConsistencyBanner', () => ({
  ConsistencyBanner: (props: {
    checks: Array<{ id: string; ok: boolean }>
    onJump: (fieldPath: string) => void
  }) => (
    <div
      data-testid="section-banner"
      data-props={JSON.stringify({
        failing: props.checks.filter((c) => !c.ok).map((c) => c.id),
      })}
    >
      <button type="button" onClick={() => props.onJump('splits')}>
        jump
      </button>
    </div>
  ),
}))
vi.mock('./MoreDetails', () => ({
  MoreDetails: () => <div data-testid="section-more" />,
}))
vi.mock('./SplitsTable', () => ({
  SplitsTable: (props: { splits: unknown[]; flagged: boolean }) => (
    <div
      data-testid="section-splits"
      data-props={JSON.stringify({ count: props.splits.length, flagged: props.flagged })}
    />
  ),
}))
vi.mock('./ZoneBar', () => ({
  ZoneBar: () => <div data-testid="section-zones" />,
}))
vi.mock('./RawResponseDisclosure', () => ({
  RawResponseDisclosure: (props: { raw: unknown }) => (
    <div data-testid="section-raw" data-props={JSON.stringify({ raw: props.raw ?? null })} />
  ),
}))
vi.mock('./RetryExtraction', () => ({
  RetryExtraction: () => <div data-testid="section-retry" />,
}))

function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    mode: 'review',
    extractionId: 'x1234567890',
    runId: null,
    baseline: hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as never, NOW),
    photos: [],
    extractionStatus: 'ok',
    errorCode: null,
    rawVendorResponse: { vendor: { choices: [] } },
    existingCorrections: null,
    sourceImages: [],
    committedRunId: null,
    ...overrides,
  }
}

function renderClient(
  overrides: {
    context?: ReviewContext
    pending?: boolean
    state?: CommitReviewState
  } = {},
) {
  const onSubmit = vi.fn()
  render(
    <ReviewClient
      context={overrides.context ?? context()}
      onSubmit={onSubmit}
      pending={overrides.pending ?? false}
      state={overrides.state ?? IDLE_COMMIT_STATE}
    />,
  )
  return { onSubmit }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReviewClient — derivation from one draft', () => {
  it('hands the baseline to HeroFields and the baseline splits to the table', () => {
    renderClient()

    expect(propsOf(section('hero')).draft).toMatchObject({ durationSec: 4716, distanceKm: 10.67 })
    expect(propsOf(section('splits'))).toMatchObject({ count: 11, flagged: false })
    expect(propsOf(section('raw'))).toMatchObject({ raw: { vendor: { choices: [] } } })
  })

  it('a clean canonical draft fails no check, so the banner renders and agrees', () => {
    renderClient()

    expect(propsOf(section('banner'))).toMatchObject({ failing: [] })
  })

  it('checks re-run on every keystroke: a slowed duration fails CHK-1 and CHK-2 at once', () => {
    renderClient()

    fireEvent.click(screen.getByRole('button', { name: 'edit-duration' }))

    // 4716 → 4800: the splits sum and the zone sum both drift past their tolerances, and
    // CHK-3 fails too because duration is one of its three inputs. The edited set names
    // exactly the field the stub moved.
    expect(propsOf(section('banner'))).toMatchObject({
      failing: ['splits_sum_vs_duration', 'zones_sum_vs_duration', 'distance_pace_vs_duration'],
    })
    expect(propsOf(section('hero'))).toMatchObject({
      edited: ['durationSec'],
    })
    expect(
      screen.getByText(
        '3 checks still disagree · 1 correction — save anyway if the screenshots say otherwise.',
      ),
    ).toBeInTheDocument()
  })

  it('the banner is suppressed on an all-null manual draft — four passes of nothing is a false all-clear', () => {
    renderClient({
      context: context({ baseline: emptyDraft(NOW), extractionStatus: 'failed' }),
    })

    expect(screen.queryByTestId('section-banner')).not.toBeInTheDocument()
  })

  it('Jump resolves a block path without crashing even when the target is not mounted', () => {
    renderClient()

    // The stub does not forward refs, so jumpTo resolves to nothing — the point is the
    // optional-chained call path, not the scroll.
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'jump' }))).not.toThrow()
  })
})

describe('ReviewClient — the three banner states', () => {
  it('review mode says, in an accent card, that nothing has been saved yet (D1)', () => {
    renderClient()

    expect(screen.getByText('Nothing has been saved yet.')).toBeInTheDocument()
    expect(
      screen.queryByText('We could not read these screenshots automatically'),
    ).not.toBeInTheDocument()
  })

  it('a failed extraction is the SAME screen with a blank draft and an honest alert', () => {
    renderClient({
      context: context({
        baseline: emptyDraft(NOW),
        extractionStatus: 'failed',
        errorCode: 'llm_overloaded',
        photos: [{ url: 'https://blob.test/a.png', kind: 'summary', width: 1, height: 1 }],
      }),
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not read these screenshots automatically',
    )
    // errorCopy(llm_overloaded) plus the photos-still-above promise, since there ARE photos.
    expect(
      screen.getByText(/Enter the numbers by hand below — your screenshots are still above/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Nothing has been saved yet.')).not.toBeInTheDocument()
  })

  it('the manual-entry banner drops the photos clause when there are no photos', () => {
    renderClient({
      context: context({ baseline: emptyDraft(NOW), extractionStatus: 'failed' }),
    })

    expect(screen.getByText(/Enter the numbers by hand below\./)).toBeInTheDocument()
  })

  it('edit mode draws neither banner — the run already exists', () => {
    renderClient({
      context: context({
        mode: 'edit',
        runId: 'r1234567890',
        committedRunId: 'r1234567890',
      }),
    })

    expect(screen.queryByText('Nothing has been saved yet.')).not.toBeInTheDocument()
    expect(screen.queryByTestId('section-retry')).not.toBeInTheDocument()
  })

  it('the re-read escape hatch exists only before the run exists', () => {
    renderClient()

    expect(screen.getByTestId('section-retry')).toBeInTheDocument()
  })
})

describe('ReviewClient — the sticky bar', () => {
  it('review mode confirms with one tap: "Confirm & save", never disabled for validation', () => {
    renderClient()

    const button = screen.getByRole('button', { name: 'Confirm & save' })
    expect(button).toBeEnabled()
    expect(screen.getByText('Everything checks out. Nothing corrected.')).toBeInTheDocument()
  })

  it('edit mode saves corrections — and says when nothing has changed yet', () => {
    renderClient({
      context: context({ mode: 'edit', runId: 'r1234567890' }),
    })

    expect(screen.getByRole('button', { name: 'Save corrections' })).toBeEnabled()
    expect(screen.getByText('Nothing changed yet.')).toBeInTheDocument()
  })

  it('the status line is polite live region, not an interrupt', () => {
    renderClient()

    expect(screen.getByText(/Everything checks out/)).toHaveAttribute('aria-live', 'polite')
  })

  it('pending is the Button’s loading state, not a disabled mystery', () => {
    renderClient({ pending: true })

    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('the submit payload is the context’s ids plus the CURRENT draft, not the baseline', () => {
    const { onSubmit } = renderClient()

    fireEvent.click(screen.getByRole('button', { name: 'edit-duration' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      extractionId: 'x1234567890',
      runId: null,
      draft: expect.objectContaining({ durationSec: 4800, distanceKm: 10.67 }),
    })
  })
})

describe('ReviewClient — what a failed commit looks like', () => {
  it('a validation failure is an alert with the message and each field’s own error', () => {
    renderClient({
      state: {
        status: 'error',
        message: 'That draft is missing a duration.',
        fieldErrors: {
          durationSec: 'Duration is required',
          occurredOn: 'That date is in the future.',
        },
      },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('That draft is missing a duration.')
    expect(alert).toHaveTextContent('Duration is required')
    expect(alert).toHaveTextContent('That date is in the future.')
    // Plan §4, held: the button always submits.
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeEnabled()
  })

  it('a duplicate names the run that already exists and links to it', () => {
    renderClient({
      state: {
        status: 'duplicate',
        message: 'A run from this extraction already exists.',
        existingRunId: 'r1234567890',
      },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('A run from this extraction already exists.')
    expect(screen.getByRole('link', { name: 'Open that run' })).toHaveAttribute(
      'href',
      '/r/r1234567890',
    )
  })

  it('a duplicate without a run id to link still explains the situation', () => {
    renderClient({
      state: {
        status: 'duplicate',
        message: 'A run from this extraction already exists.',
        existingRunId: null,
      },
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open that run' })).not.toBeInTheDocument()
  })
})
