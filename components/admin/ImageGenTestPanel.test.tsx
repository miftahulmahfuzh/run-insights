// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageGenTestPanel } from './ImageGenTestPanel'
import {
  readNinaImageTestAction,
  runNinaImageTestAction,
  type NinaImageTestReadResult,
} from '@/lib/admin/imageGenActions'
import {
  NINA_IMAGE_TEST_VERDICT_LINE,
  type NinaImageTestJobView,
} from '@/lib/admin/imageGenTestView'

/*
 * Both actions are mocked (Server Actions hitting the DB and the vendor); the verdict vocabulary
 * and the poll schedule are REAL — `lib/admin/imageGenTestView.ts` is the module whose constants
 * the component's timing is written against. Fake timers drive the mount read (setTimeout 0) and
 * the escalating poll loop, which is exactly the machinery the header says must never be a
 * `setInterval`.
 *
 * Interactions here are `fireEvent`, not `userEvent`: measured in this repo's setup (vitest fake
 * timers + happy-dom), `userEvent.click` never returns — its internal waits are faked-timer
 * `setTimeout`s nothing advances. `fireEvent` is synchronous, and every async chain the click
 * starts is flushed by the `advance()` helper, which is also the act scope those updates land in.
 */
vi.mock('@/lib/admin/imageGenActions', () => ({
  readNinaImageTestAction: vi.fn(),
  runNinaImageTestAction: vi.fn(),
}))

const readAction = vi.mocked(readNinaImageTestAction)
const runAction = vi.mocked(runNinaImageTestAction)

function job(overrides?: Partial<NinaImageTestJobView>): NinaImageTestJobView {
  return {
    jobId: 'j1',
    status: 'queued',
    errorCode: 'queued',
    attempts: 0,
    latencyMs: null,
    costMicroUsd: null,
    prompt: 'THE PROMPT AS SENT',
    createdAtMs: 0,
    ...overrides,
  }
}

function readResult(overrides?: Partial<NinaImageTestReadResult>): NinaImageTestReadResult {
  return {
    quotaLeft: 5,
    promptPreview: 'PREVIEW OF THE SAVED PROMPT',
    referenceUrl: null,
    job: null,
    ...overrides,
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function clickTestPrompt() {
  fireEvent.click(screen.getByRole('button', { name: 'Test prompt' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ImageGenTestPanel', () => {
  it('opens on "No test has been run yet" and reads the quota through its armed mount timer', async () => {
    readAction.mockResolvedValue(readResult())
    render(<ImageGenTestPanel />)

    // Before the mount read lands: the honest "checking" placeholder, not a made-up number.
    expect(screen.getByText('checking today’s quota')).toBeInTheDocument()
    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.idle)).toBeInTheDocument()

    await advance(0)
    expect(screen.getByText('5 of today’s generations left')).toBeInTheDocument()
    expect(readAction).toHaveBeenCalledWith(null)
    expect(screen.getByRole('button', { name: 'Test prompt' })).toBeEnabled()
  })

  it('shows the saved prompt preview and the anchoring sentence before anything is spent', async () => {
    readAction.mockResolvedValue(readResult({ referenceUrl: null }))
    render(<ImageGenTestPanel />)
    await advance(0)

    expect(screen.getByText('PREVIEW OF THE SAVED PROMPT')).toBeInTheDocument()
    expect(
      screen.getByText(/No photo reference is selected, so this generation is unanchored\./),
    ).toBeInTheDocument()
  })

  it('says "anchored" when the saved reference resolves to a URL', async () => {
    readAction.mockResolvedValue(readResult({ referenceUrl: 'https://blob.example/ref.jpg' }))
    render(<ImageGenTestPanel />)
    await advance(0)
    expect(screen.getByText(/Anchored to the selected photo reference\./)).toBeInTheDocument()
  })

  it('renders a spent quota as capped: no generations left, the rollover note, and a dead button', async () => {
    readAction.mockResolvedValue(readResult({ quotaLeft: 0 }))
    render(<ImageGenTestPanel />)
    await advance(0)

    expect(screen.getByText('no generations left today')).toBeInTheDocument()
    expect(
      screen.getByText('Nothing will be sent. The cap rolls over at midnight in Jakarta.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test prompt' })).toBeDisabled()
    expect(runAction).not.toHaveBeenCalled()
  })

  it('warns when the draft is dirty — the test reads the SAVED settings, not the form', () => {
    readAction.mockResolvedValue(readResult())
    render(<ImageGenTestPanel dirty />)
    expect(
      screen.getByText(/You have unsaved changes\. The test reads the saved settings/),
    ).toBeInTheDocument()
  })

  it('dispatches on one click — no confirmation dialog — and starts watching the job', async () => {
    readAction.mockResolvedValueOnce(readResult()).mockResolvedValue(
      readResult({
        job: job({ status: 'pending', errorCode: 'running', attempts: 1, prompt: null }),
      }),
    )
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)

    clickTestPrompt()
    await advance(0)

    expect(runAction).toHaveBeenCalledTimes(1)
    // An open verdict: the button names the waiting and refuses a second click.
    expect(screen.getByRole('button', { name: 'Waiting for the provider' })).toBeDisabled()
    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.running)).toBeInTheDocument()
  })

  it('polls on the escalating schedule and lands on "allowed" when the job finishes ok', async () => {
    // Call order: 1 mount read, 2 the dispatch's own load (open verdict), 3 first poll, 4 second.
    readAction
      .mockResolvedValueOnce(readResult())
      .mockResolvedValueOnce(
        readResult({
          job: job({ status: 'pending', errorCode: 'running', attempts: 1, prompt: null }),
        }),
      )
      .mockResolvedValueOnce(
        readResult({
          job: job({ status: 'pending', errorCode: 'running', attempts: 1, prompt: null }),
        }),
      )
      .mockResolvedValue(
        readResult({ job: job({ status: 'ok', errorCode: null, attempts: 1, prompt: 'AS SENT' }) }),
      )
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(0)
    expect(readAction).toHaveBeenNthCalledWith(2, 'j1')

    await advance(3_000) // first poll, initial band
    expect(readAction).toHaveBeenNthCalledWith(3, 'j1')
    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.running)).toBeInTheDocument()

    await advance(3_000) // second poll: the job is done
    expect(readAction).toHaveBeenNthCalledWith(4, 'j1')
    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.allowed)).toBeInTheDocument()
    // The prompt as sent comes off the job row, not the preview.
    expect(screen.getByText('AS SENT')).toBeInTheDocument()
    expect(screen.getByText(/job j1/)).toBeInTheDocument()

    // Terminal verdict: the loop is over — no further reads, and the button comes back.
    const callsAfterTerminal = readAction.mock.calls.length
    await advance(60_000)
    expect(readAction.mock.calls).toHaveLength(callsAfterTerminal)
    expect(screen.getByRole('button', { name: 'Test prompt' })).toBeEnabled()
  })

  it('reads a requeued first attempt as "retrying", never as a refusal', async () => {
    readAction.mockResolvedValueOnce(readResult()).mockResolvedValue(
      readResult({
        job: job({ status: 'pending', errorCode: 'queued', attempts: 1, prompt: null }),
      }),
    )
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(3_000)

    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.retrying)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waiting for the provider' })).toBeDisabled()
  })

  it('renders a policy refusal — the one verdict that says the guardrails said no — with the recorded reason', async () => {
    readAction.mockResolvedValueOnce(readResult()).mockResolvedValue(
      readResult({
        job: job({ status: 'failed', errorCode: 'policy', attempts: 2, prompt: null }),
      }),
    )
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(3_000)

    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.refused)).toBeInTheDocument()
    expect(
      screen.getByText(
        'What the pipeline recorded: the provider looked at the prompt and declined it.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps a timeout failure honest: inconclusive, with the not-a-refusal clause and the reason', async () => {
    readAction.mockResolvedValueOnce(readResult()).mockResolvedValue(
      readResult({
        job: job({ status: 'failed', errorCode: 'timeout', attempts: 2, prompt: null }),
      }),
    )
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(3_000)

    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.inconclusive)).toBeInTheDocument()
    expect(
      screen.getByText(/What the pipeline recorded: the call was aborted at the timeout/),
    ).toBeInTheDocument()
  })

  it('reports a refusal without spending silence: shows the message and re-reads the quota', async () => {
    readAction.mockResolvedValueOnce(readResult()).mockResolvedValue(readResult({ quotaLeft: 4 }))
    runAction.mockResolvedValue({ ok: false, message: 'Today’s cap is spent.' })
    render(<ImageGenTestPanel />)
    await advance(0)

    clickTestPrompt()
    await advance(0)

    expect(screen.getByText('Today’s cap is spent.')).toBeInTheDocument()
    // The refusal re-reads so the quota on screen is the server's number, not our arithmetic.
    expect(readAction).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('button', { name: 'Test prompt' })).toBeEnabled()
  })

  it('distinguishes a dispatch crash from a refusal in the error copy', async () => {
    readAction.mockResolvedValue(readResult())
    runAction.mockRejectedValue(new Error('network gone'))
    render(<ImageGenTestPanel />)
    await advance(0)

    clickTestPrompt()
    await advance(0)

    expect(
      screen.getByText(
        'The test could not be started: network gone. Nothing was sent and nothing was billed — this is not a refusal.',
      ),
    ).toBeInTheDocument()
  })

  it('never overlaps polls: a tick does not fire while the previous read is in flight', async () => {
    // Call 2 must resolve so the open verdict starts the loop; call 3, the first poll, hangs.
    readAction
      .mockResolvedValueOnce(readResult())
      .mockResolvedValueOnce(readResult({ job: job({ prompt: null }) }))
      .mockReturnValue(new Promise<NinaImageTestReadResult>(() => {}))
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(0) // flush the dispatch chain so the loop's timer is scheduled
    await advance(3_000) // starts the first in-flight poll read

    const inFlight = readAction.mock.calls.length
    expect(inFlight).toBeGreaterThanOrEqual(3)
    await advance(30_000) // far past several intervals
    expect(readAction.mock.calls).toHaveLength(inFlight)
  })

  it('survives a failed poll quietly: says so, keeps watching, and does not fail the test', async () => {
    // Calls: 1 mount, 2 dispatch load (running), 3 first poll FAILS, 4 second poll succeeds.
    readAction
      .mockResolvedValueOnce(readResult())
      .mockResolvedValueOnce(readResult({ job: job({ prompt: null }) }))
      .mockRejectedValueOnce(new Error('edge down'))
      .mockResolvedValue(readResult({ job: job({ status: 'ok', errorCode: null, prompt: null }) }))
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(0)
    await advance(3_000)

    expect(
      screen.getByText('Could not reach the server on that check. Still watching.'),
    ).toBeInTheDocument()
    // The failed poll did not end the loop or fake a verdict.
    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.running)).toBeInTheDocument()

    await advance(3_000)
    expect(screen.getByText(NINA_IMAGE_TEST_VERDICT_LINE.allowed)).toBeInTheDocument()
  })

  it('stops watching at the wall clock and says the job is STILL OPEN, not failed', async () => {
    // The mount read itself must NOT carry a job — otherwise the panel opens already watching.
    readAction
      .mockResolvedValueOnce(readResult())
      .mockResolvedValue(readResult({ job: job({ prompt: null }) }))
    runAction.mockResolvedValue({ ok: true, jobId: 'j1', quotaLeft: 4 })
    render(<ImageGenTestPanel />)
    await advance(0)
    clickTestPrompt()
    await advance(0)
    // 481s is NOT enough: the poll bands' last step before the bound lands at ~478s and passes
    // the check; the next step, at ~486s, is the one that trips. Advance past it.
    await advance(495_000)

    expect(screen.getByText(/Stopped watching after eight minutes/)).toBeInTheDocument()
    expect(
      screen.getByText(/The job is still open and nothing has gone wrong yet/),
    ).toBeInTheDocument()
    expect(screen.queryByText(NINA_IMAGE_TEST_VERDICT_LINE.refused)).not.toBeInTheDocument()

    // Give-up ends the loop: no reads beyond the give-up point.
    const calls = readAction.mock.calls.length
    await advance(60_000)
    expect(readAction.mock.calls).toHaveLength(calls)
  })

  it('sets nothing after unmount — the alive guard honours a resolution that lands late', async () => {
    readAction.mockReturnValue(new Promise<NinaImageTestReadResult>(() => {}))
    const { unmount } = render(<ImageGenTestPanel />)
    await advance(0) // mount read fired, still pending
    expect(readAction).toHaveBeenCalledTimes(1)

    unmount()
    const calls = readAction.mock.calls.length
    await advance(10_000)
    expect(readAction.mock.calls).toHaveLength(calls)
  })

  it('stops the armed mount read when unmounted before the timer fires', async () => {
    readAction.mockResolvedValue(readResult())
    const { unmount } = render(<ImageGenTestPanel />)
    unmount()
    await advance(1_000)
    expect(readAction).not.toHaveBeenCalled()
  })
})
