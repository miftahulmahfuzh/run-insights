// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STALE_PENDING_MS, TYPICAL_EXTRACTION_SECONDS } from '@/lib/extract/constants'
import type { ExtractionResult } from '@/lib/schema/extractionResult'

import { useExtractionStatus } from './useExtractionStatus'

/**
 * The runtime half of `tests/extract.pollSchedule.test.ts`. The schedule CONSTANTS are proved
 * there; what nothing proved until now is that the hook actually LIVES by them — that the first
 * request waits 2 s, that the bands are observable in real fetch times, that one failed poll is
 * transport and not failure, that a terminal answer ends the cycle for good, that the elapsed
 * counter runs from the row's own createdAt and re-anchors to the server's, and that the 90 s
 * give-up stops the cycle instead of spinning forever.
 *
 * Everything runs under fake timers, flush with `advanceTimersByTimeAsync` inside `act` — the
 * repo's measured pattern (userEvent never returns under fake timers here). The fetch stub is a
 * real `Response`, the same shape the retry suite uses; each test scripts its own sequence and
 * the LAST entry repeats forever, so a poll that should have stopped is caught by the count.
 */

const ID = 'ext000000001'
const T0 = new Date('2026-09-12T10:00:00Z')
/** ISO instant at `offsetMs` from the fake epoch. */
const iso = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString()

function row(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    extractionId: ID,
    status: 'pending',
    session: null,
    errorCode: null,
    kinds: [],
    photos: [],
    promptTokens: null,
    createdAt: iso(0),
    completedAt: null,
    ...overrides,
  }
}

const okResponse = (body: ExtractionResult, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn()

/**
 * Script the fetch: each call consumes the next entry; the last one repeats forever. A test that
 * expects the poll to stop asserts on the CALL COUNT — a further call would consume the held
 * entry and be visible.
 */
function useScript(...items: Array<Response | Error>) {
  let index = 0
  fetchMock.mockImplementation(() => {
    const item = items[Math.min(index, items.length - 1)]!
    index += 1
    return item instanceof Error ? Promise.reject(item) : Promise.resolve(item)
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function mount(initial: ExtractionResult) {
  return renderHook(() => useExtractionStatus(ID, initial))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('useExtractionStatus', () => {
  it('never polls, never starts the clock, and never gives up when the server render was already terminal', async () => {
    useScript(okResponse(row({ status: 'ok' }))) // any fetch would be a bug, not a convenience
    const { result } = mount(row({ status: 'ok', completedAt: iso(0) }))

    await advance(120_000)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.elapsedSec).toBe(0)
    expect(result.current.gaveUp).toBe(false)
    expect(result.current.result?.status).toBe('ok')
  })

  it('waits the 2 s initial interval before the first poll, and asks for its own row uncached', async () => {
    useScript(okResponse(row()))
    mount(row())

    await advance(1999)
    expect(fetchMock).not.toHaveBeenCalled()

    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`/api/extract/${ID}`)
    expect(init).toMatchObject({ cache: 'no-store' })
  })

  it('keeps polling on a pending answer and ends the cycle for good once the answer is terminal', async () => {
    useScript(okResponse(row()), okResponse(row({ status: 'failed', errorCode: 'timeout' })))
    const { result } = mount(row())

    await advance(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.result?.status).toBe('pending')

    await advance(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.result?.status).toBe('failed')

    await advance(20_000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // the terminal answer retired the cycle
  })

  it('observes the backoff bands in the actual fetch times: 2 s, then 3 s after attempt 4, 5 s after attempt 10', async () => {
    useScript(okResponse(row()))
    mount(row())

    await advance(8_000) // attempts 1-4 at t = 2, 4, 6, 8
    expect(fetchMock).toHaveBeenCalledTimes(4)

    await advance(2_000) // t = 10: still inside the 3 s band after attempt 4 (next at t = 11)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await advance(1_000) // t = 11
    expect(fetchMock).toHaveBeenCalledTimes(5)

    await advance(15_000) // t = 26: attempts 6-10 at 14, 17, 20, 23, 26
    expect(fetchMock).toHaveBeenCalledTimes(10)

    await advance(4_000) // t = 30: inside the 5 s band after attempt 10 (next at t = 31)
    expect(fetchMock).toHaveBeenCalledTimes(10)
    await advance(1_000) // t = 31
    expect(fetchMock).toHaveBeenCalledTimes(11)
  })

  it('treats one failed poll as transport, not failure — reports it quietly and keeps going', async () => {
    useScript(new TypeError('offline'), okResponse(row()))
    const { result } = mount(row())

    await advance(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.pollError).toBe('offline')
    expect(result.current.gaveUp).toBe(false)

    await advance(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.pollError).toBeNull() // cleared by the first good read
    expect(result.current.gaveUp).toBe(false)
  })

  it('reads an HTTP failure as a status and never as an extraction failure', async () => {
    useScript(okResponse(row(), 503), okResponse(row()))
    const { result } = mount(row())

    await advance(2_000)
    expect(result.current.pollError).toBe('status 503')

    await advance(2_000)
    expect(result.current.pollError).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drives the elapsed counter from the row createdAt, so a reopened tab shows the true wait', async () => {
    // Every polled read carries the same old timestamp — nothing to re-anchor to.
    useScript(okResponse(row({ createdAt: iso(-10_000) })))
    const { result } = mount(row({ createdAt: iso(-10_000) }))

    // The first tick runs on mount — the counter is 10 before the first poll even goes out.
    expect(result.current.elapsedSec).toBe(10)

    await advance(5_000)
    expect(result.current.elapsedSec).toBe(15)
  })

  it('re-anchors the clock to the server createdAt the first time it hears it', async () => {
    // The server says the row is 40 s old — 38 s older than the client believed.
    useScript(okResponse(row({ createdAt: iso(-40_000) })))
    const { result } = mount(row({ createdAt: iso(0) }))

    await advance(3_000)
    // Ticks at t=1, 2 ran on the client anchor; the poll at t=2 re-anchored to the server's
    // timestamp, so the t=3 tick reads 3 s + 40 s.
    expect(result.current.elapsedSec).toBe(43)
  })

  it('freezes the counter once a terminal answer lands', async () => {
    useScript(okResponse(row({ status: 'ok', createdAt: iso(-10_000) })))
    const { result } = mount(row({ createdAt: iso(-10_000) }))

    await advance(2_000)
    expect(result.current.result?.status).toBe('ok')
    const frozen = result.current.elapsedSec
    expect(frozen).toBeGreaterThan(10)

    await advance(10_000)
    expect(result.current.elapsedSec).toBe(frozen)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it(`gives up after ${STALE_PENDING_MS / 1000}s of pending — and then stops for good`, async () => {
    useScript(okResponse(row()))
    const { result } = mount(row())

    // Attempts land every ≤5 s; by t=86 s twenty-two have gone out and the row is still pending.
    await advance(86_000)
    const attemptsBeforeGiveUp = fetchMock.mock.calls.length
    expect(attemptsBeforeGiveUp).toBeGreaterThan(15)
    expect(result.current.gaveUp).toBe(false)

    // The next run (t≈91 s) trips the stale gate before fetching.
    await advance(5_000)
    expect(result.current.gaveUp).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(attemptsBeforeGiveUp)

    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(attemptsBeforeGiveUp) // no zombie cycle
    // The measured typical wait has long passed either way.
    expect(result.current.elapsedSec).toBeGreaterThan(TYPICAL_EXTRACTION_SECONDS)
  })

  it('re-arms on refresh() — and the stale gate fails closed, without a request', async () => {
    useScript(okResponse(row()))
    const { result } = mount(row())
    await advance(91_000)
    expect(result.current.gaveUp).toBe(true)
    const before = fetchMock.mock.calls.length

    act(() => result.current.refresh())
    expect(result.current.gaveUp).toBe(false)
    expect(result.current.pollError).toBeNull()

    await advance(2_500)
    // The row is still older than the stale threshold on the client clock, so the re-armed cycle
    // re-gives-up on its first check rather than firing another request. The honest recovery is
    // the read just before the give-up — the same read the server heals the row on (R-20) — or a
    // fresh page load, whose server render reads the healed row.
    expect(result.current.gaveUp).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(before)
  })

  it('refresh() resets the attempt counter, so the schedule restarts at 2 s, and clears the error line', async () => {
    useScript(new TypeError('offline'), okResponse(row()))
    const { result } = mount(row())

    await advance(2_000)
    expect(result.current.pollError).toBe('offline')

    await advance(8_000) // four attempts by t = 10 s; the next band gap would be 3 s
    act(() => result.current.refresh())
    expect(result.current.pollError).toBeNull()

    await advance(2_000)
    // A stale attempt count would schedule this one at t = 13 s (the 3 s band); the reset puts it
    // 2 s after the refresh.
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('a mid-wait unmount cancels the in-flight cycle', async () => {
    useScript(okResponse(row()))
    const { unmount } = mount(row())

    await advance(10_000)
    const before = fetchMock.mock.calls.length
    expect(before).toBeGreaterThan(2)

    unmount()
    await advance(30_000)

    expect(fetchMock).toHaveBeenCalledTimes(before)
  })
})
