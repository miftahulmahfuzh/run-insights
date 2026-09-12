// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReviewContext } from '@/lib/review/loadReview'
import { hydrateDraftFromExtraction } from '@/lib/review/draft'
import { IDLE_COMMIT_STATE, type CommitReviewState } from '@/lib/review/schema'
import { TRUTH } from '../../research/schema.mjs'

import { ReviewScreen } from './ReviewScreen'

/**
 * The full review screen over the REAL component tree, on the canonical fixture — the only
 * suite in this package where the checks, the banner, the sections and the sticky bar all run
 * together. `ReviewScreen` is documented as "the thinnest possible binding between
 * `ReviewClient` and the Server Action", so the server action is the one mock: everything
 * between the reviewer's eyes and the submit payload is real, including the property the whole
 * screen exists for — **a keystroke re-runs the checks, and the screen says so before the save.**
 *
 * The action does not return on success (it redirects), so the only states that can land back
 * here are validation and duplicate failures — both are exercised below.
 */

const commitReviewAction = vi.hoisted(() => vi.fn())
vi.mock('@/lib/review/actions', () => ({ commitReviewAction }))

// RetryExtraction calls useRouter() before its empty-photos early return, and there is no app
// router provider under a bare render — the push target is asserted by RetryExtraction's own
// suite; here it only has to exist.
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

const NOW = new Date('2026-08-21T02:00:00Z')

function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    mode: 'review',
    extractionId: 'x1234567890',
    runId: null,
    baseline: hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)) as never, NOW),
    photos: [
      { url: 'https://blob.test/summary.png', kind: 'summary', width: 739, height: 1600 },
    ],
    extractionStatus: 'ok',
    errorCode: null,
    rawVendorResponse: { vendor: { choices: [] }, attempts: 1 },
    existingCorrections: null,
    sourceImages: [],
    committedRunId: null,
    ...overrides,
  }
}

function renderScreen(ctx: ReviewContext = context(), state: CommitReviewState = IDLE_COMMIT_STATE) {
  render(<ReviewScreen context={ctx} />)
  void state
}

beforeEach(() => {
  commitReviewAction.mockReset()
  // Resolves by default, and every test resolves its own override before ending: an action
  // left pending across an RTL cleanup poisons the NEXT useActionState mount in this file
  // (its state never lands, and the failure shows up four seconds later in someone else's
  // findByText). Nothing may leave a transition in flight.
  commitReviewAction.mockImplementation(async () => IDLE_COMMIT_STATE)
})

describe('ReviewScreen — the golden path, on the canonical fixture', () => {
  it('renders the whole tree: evidence, sections, the all-clear, one-tap confirm', () => {
    renderScreen()

    // The evidence strip is first and named.
    expect(screen.getByLabelText('View the Summary screenshot full screen')).toBeInTheDocument()
    // Sections exist by their headings — always-open ones, plus the collapsed one.
    expect(screen.getByRole('heading', { name: 'Splits' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Heart-rate zones' })).toBeInTheDocument()
    expect(screen.getByText('More details')).toBeInTheDocument()
    expect(screen.getByText('What the reader actually returned')).toBeInTheDocument()
    // Eleven splits, five zones, every field reachable.
    expect(screen.getAllByRole('row')).toHaveLength(12)
    expect(screen.getByLabelText('Distance in kilometres')).toHaveValue('10.67')
    // The four checks ran and agree — announced as status, the only proof they ran at all.
    expect(screen.getByRole('status')).toHaveTextContent('The numbers agree with each other')
    // D1, stated; the bar offers the one tap.
    expect(screen.getByText('Nothing has been saved yet.')).toBeInTheDocument()
    expect(
      screen.getByText('Everything checks out. Nothing corrected.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeEnabled()
  })

  it('the one tap submits the whole draft under the extraction’s own ids', async () => {
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))

    await waitFor(() => expect(commitReviewAction).toHaveBeenCalledTimes(1))
    const [stateArg, payload] = commitReviewAction.mock.calls[0]!
    expect(stateArg).toEqual(IDLE_COMMIT_STATE)
    expect(payload).toMatchObject({
      extractionId: 'x1234567890',
      runId: null,
      draft: expect.objectContaining({
        durationSec: 4716,
        distanceKm: 10.67,
        avgPaceSecPerKm: 442,
        occurredOn: '2026-08-20',
      }),
    })
    const draft = payload.draft as { splits: unknown[]; hrZones: unknown[] }
    expect(draft.splits).toHaveLength(11)
    expect(draft.hrZones).toHaveLength(5)
  })

  it('while the action is in flight the button names its state', async () => {
    // A gate the test opens before ending — see beforeEach on why nothing may stay pending.
    let openGate!: () => void
    const gate = new Promise<void>((resolve) => (openGate = resolve))
    commitReviewAction.mockImplementation(() => gate.then(() => IDLE_COMMIT_STATE))
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toHaveAttribute(
      'aria-busy',
      'true',
    )

    openGate()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeEnabled(),
    )
  })
})

describe('ReviewScreen — a keystroke re-runs the checks', () => {
  it('a misread pace flips the banner, flags all three CHK-3 inputs, and still allows the save', () => {
    renderScreen()

    // '802' lays out as 8:02 = 482 s/km: distance x pace now implies 85:43 against a 78:36
    // run — CHK-3 fires, and the banner becomes an alert.
    fireEvent.change(
      screen.getByLabelText('Average pace, minutes and seconds per kilometre'),
      { target: { value: '802' } },
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('1 thing worth checking')
    expect(alert).toHaveTextContent(/Distance x pace implies/)
    // All three inputs are flagged — the check cannot know which of them is the lie.
    expect(screen.getAllByText('check')).toHaveLength(3)
    // F05's whole posture, live: never disabled for validation. The status line folds the
    // correction count into the disagreement sentence — one clause that cannot drift apart.
    expect(
      screen.getByText(
        '1 check still disagrees · 1 correction — save anyway if the screenshots say otherwise.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeEnabled()
  })

  it('the edited chip goes only to fields the checks cannot implicate', () => {
    renderScreen()

    // Location is covered by no check, so a correction there is exactly an `edited` — and
    // nowhere else on the screen does the word appear.
    fireEvent.change(screen.getByLabelText('Where this run happened'), {
      target: { value: 'Bandung' },
    })

    expect(screen.getAllByText('edited')).toHaveLength(1)
    expect(
      screen.getByText('Everything checks out · 1 correction.'),
    ).toBeInTheDocument()
  })

  it('a second keystroke back to the fixture’s own value clears everything again', () => {
    renderScreen()

    const pace = screen.getByLabelText('Average pace, minutes and seconds per kilometre')
    fireEvent.change(pace, { target: { value: '802' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // 722 → 7:22 = 442: back to what the extractor said. The diff is stateless — final value
    // against baseline — so a round trip leaves NOTHING: no flag, no correction, no chip.
    fireEvent.change(pace, { target: { value: '722' } })

    expect(screen.getByRole('status')).toHaveTextContent('The numbers agree with each other')
    expect(
      screen.getByText('Everything checks out. Nothing corrected.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('edited')).not.toBeInTheDocument()
  })
})

describe('ReviewScreen — the two states that can come back from the action', () => {
  it('a validation failure is an alert at the summary, and the save stays available once settled', async () => {
    commitReviewAction.mockImplementation(async () => ({
      status: 'error',
      message: 'That draft is missing a duration.',
      fieldErrors: { durationSec: 'Duration is required' },
    }))
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))

    const alert = await screen.findByText('That draft is missing a duration.', {}, { timeout: 4000 })
    expect(alert).toBeInTheDocument()
    // The field error says it twice on purpose: once at the field that caused it, once in
    // the summary card's list.
    expect(screen.getAllByText('Duration is required')).toHaveLength(2)
    // React 19 settles isPending one commit AFTER the result renders — wait for the settle,
    // not for the alert, before judging the button.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeEnabled(),
      { timeout: 4000 },
    )
  })

  it('a duplicate explains itself and links to the run that already exists', async () => {
    commitReviewAction.mockImplementation(async () => ({
      status: 'duplicate',
      message: 'A run from this extraction already exists.',
      existingRunId: 'r1234567890',
    }))
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))

    expect(
      await screen.findByText('A run from this extraction already exists.', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    await waitFor(
      () =>
        expect(screen.getByRole('link', { name: 'Open that run' })).toHaveAttribute(
          'href',
          '/r/r1234567890',
        ),
      { timeout: 4000 },
    )
  })
})

describe('ReviewScreen — the edit mode variant', () => {
  it('is the same tree pointed at a stored run: Save corrections, no pre-commit chrome', () => {
    renderScreen(
      context({
        mode: 'edit',
        runId: 'r1234567890',
        committedRunId: 'r1234567890',
      }),
    )

    expect(screen.getByRole('button', { name: 'Save corrections' })).toBeInTheDocument()
    expect(screen.queryByText('Nothing has been saved yet.')).not.toBeInTheDocument()
    expect(screen.queryByText('Read these screenshots again')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing changed yet.')).toBeInTheDocument()
  })
})
