// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExtractionResult } from '@/lib/schema/extractionResult'

import { ExtractionGate } from './ExtractionGate'

/**
 * The `/x/[extractionId]` waiting half and its one decision: poll until terminal, then hand the
 * screen back to the server with a SINGLE `router.refresh()`. The hand-off must stay a refresh —
 * the review screen needs the server-resolved correction baseline and the raw vendor reply, which
 * no client-held JSON can honestly supply — and it must happen ONCE: `router.refresh()` is
 * idempotent but not free, and the hook stops polling on terminal anyway, so a second call would
 * only prove the guard rotted.
 *
 * The hook's runtime behavior is proved in `./useExtractionStatus.test.tsx`; the skeleton's copy
 * branches in `./ExtractingSkeleton.test.tsx`. This file proves the seam between them: what gets
 * rendered in each state, and that the refresh fires exactly on the transition and never before.
 */

const { routerRefresh, routerPush } = vi.hoisted(() => ({
  routerRefresh: vi.fn(),
  routerPush: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush }),
}))

const ID = 'ext000000001'
const T0 = new Date('2026-09-12T10:00:00Z')
const iso = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString()

function row(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    extractionId: ID,
    status: 'pending',
    session: null,
    errorCode: null,
    kinds: ['summary'],
    photos: [{ url: 'https://blob.test/summary.jpg', kind: 'summary', width: 739, height: 1600 }],
    promptTokens: 2215,
    createdAt: iso(0),
    completedAt: null,
    ...overrides,
  }
}

const fetchMock = vi.fn()
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

describe('ExtractionGate', () => {
  it('a terminal server render hands off at once: the status card, exactly one refresh, and no polling', () => {
    useScript(new Response('{}', { status: 200 })) // any fetch would mean the gate is polling a done row
    const { rerender } = render(
      <ExtractionGate extractionId={ID} initial={row({ status: 'ok' })} />,
    )

    const card = screen.getByRole('status')
    expect(card).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Opening the numbers…')).toBeInTheDocument()
    expect(
      screen.getByText('Reading finished. Loading them so you can check them.'),
    ).toBeInTheDocument()
    expect(routerRefresh).toHaveBeenCalledTimes(1)

    // The in-between re-render React does while the new tree travels must not mint a second call.
    rerender(<ExtractionGate extractionId={ID} initial={row({ status: 'ok' })} />)
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it('a pending server render shows the waiting screen with the runner’s own screenshots — and asks the server for nothing yet', () => {
    useScript(new Response('{}', { status: 200 }))
    render(<ExtractionGate extractionId={ID} initial={row()} />)

    expect(screen.getByText('Reading your screenshots')).toBeInTheDocument()
    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it('carries the row’s age into the honest elapsed counter', () => {
    useScript(new Response('{}', { status: 200 }))
    render(<ExtractionGate extractionId={ID} initial={row({ createdAt: iso(-10_000) })} />)

    expect(screen.getByText('10s')).toBeInTheDocument()
  })

  it('flips on the first terminal answer: the status card, exactly one refresh, and the poll retired', async () => {
    useScript(
      new Response(JSON.stringify(row()), { status: 200 }),
      new Response(JSON.stringify(row({ status: 'failed', errorCode: 'timeout' })), {
        status: 200,
      }),
    )
    render(<ExtractionGate extractionId={ID} initial={row()} />)

    await advance(2_000) // first poll: pending
    expect(screen.getByText('Reading your screenshots')).toBeInTheDocument()
    expect(routerRefresh).not.toHaveBeenCalled()

    await advance(2_000) // second poll: failed — terminal, whatever the flavour
    expect(screen.getByText('Opening the numbers…')).toBeInTheDocument()
    expect(routerRefresh).toHaveBeenCalledTimes(1)

    await advance(20_000)
    expect(fetchMock).toHaveBeenCalledTimes(2) // the cycle retired with the answer
    expect(routerRefresh).toHaveBeenCalledTimes(1) // and the hand-off fired once, on the transition
  })
})
