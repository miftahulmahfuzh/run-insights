// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ensureRunInsight, ensureWeekInsight, ensureMonthInsight, refresh, router } = vi.hoisted(
  () => {
    const refresh = vi.fn()
    return {
      ensureRunInsight: vi.fn(),
      ensureWeekInsight: vi.fn(),
      ensureMonthInsight: vi.fn(),
      refresh,
      // ONE router object, not a factory returning fresh ones: `router` sits in the trigger's effect
      // deps, and a fresh object per render would re-run the effect on the 'working' re-render —
      // whose cleanup sets `alive=false` and silently aborts the in-flight continuation. Next's real
      // useRouter returns a stable instance; the mock has to model that stability, not just the API.
      router: { refresh },
    }
  },
)

// Both collaborators are boundaries: the actions hit the model and Postgres, and `useRouter`
// belongs to Next's app router. The trigger's own contract — fire once after paint, dispatch by
// scope, refresh only when something changed, and show the honest state when the vendor is down —
// is what these tests pin.
vi.mock('@/lib/insights/actions', () => ({
  ensureRunInsight,
  ensureWeekInsight,
  ensureMonthInsight,
}))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { InsightTrigger } from './InsightTrigger'

/**
 * The load-bearing subtlety this suite pins first: **`hasInsight` controls only what renders, not
 * what fires.** The effect runs even when the server already rendered prose, because that is the
 * only thing that notices a STALE insight after a correction — so "prose on screen" must never be
 * asserted to mean "no model call".
 */
describe('InsightTrigger firing', () => {
  beforeEach(() => {
    for (const mock of [ensureRunInsight, ensureWeekInsight, ensureMonthInsight, refresh])
      mock.mockReset()
    ensureRunInsight.mockResolvedValue({ changed: false, unavailable: false })
    ensureWeekInsight.mockResolvedValue({ changed: false, unavailable: false })
    ensureMonthInsight.mockResolvedValue({ changed: false, unavailable: false })
  })

  it('renders NOTHING when prose is already on screen — yet still fires, to catch a stale insight', async () => {
    const { container } = render(
      <InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight />,
    )

    expect(container.textContent).toBe('')
    expect(ensureRunInsight).toHaveBeenCalledWith('run-1')
  })

  it('an unreviewed draft (enabled=false) never fires — an insight on unreviewed numbers would be fiction', async () => {
    const { container } = render(
      <InsightTrigger
        target={{ scope: 'session', runId: 'run-1' }}
        hasInsight={false}
        enabled={false}
      />,
    )

    expect(container.textContent).toBe('')
    expect(ensureRunInsight).not.toHaveBeenCalled()
    expect(screen.queryByText(/coach is reading/)).not.toBeInTheDocument()
  })

  it.each([
    ['session', { scope: 'session', runId: 'run-1' }, ensureRunInsight],
    ['week', { scope: 'week', periodKey: '2026-W34' }, ensureWeekInsight],
    ['month', { scope: 'month', periodKey: '2026-08' }, ensureMonthInsight],
  ] as const)(
    'dispatches the %s target to its own ensure action',
    async (_scope, target, action) => {
      render(<InsightTrigger target={target} hasInsight={false} />)

      await act(async () => {})
      expect(action).toHaveBeenCalledExactlyOnceWith(
        'runId' in target ? target.runId : target.periodKey,
      )
      const others = [ensureRunInsight, ensureWeekInsight, ensureMonthInsight].filter(
        (m) => m !== action,
      )
      for (const other of others) expect(other).not.toHaveBeenCalled()
    },
  )

  it('fires exactly once, even when the target identity changes across re-renders', async () => {
    // StrictMode double-invokes effects in development, and a parent re-render hands the effect a
    // fresh `target` object. The `fired` ref is what keeps that at one model call, not identity.
    const { rerender } = render(
      <InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />,
    )
    rerender(<InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />)
    rerender(<InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />)

    await act(async () => {})
    expect(ensureRunInsight).toHaveBeenCalledTimes(1)
  })
})

describe('InsightTrigger states', () => {
  beforeEach(() => {
    for (const mock of [ensureRunInsight, ensureWeekInsight, ensureMonthInsight, refresh])
      mock.mockReset()
  })

  it('in flight: one quiet line, no spinner, no skeleton', async () => {
    let resolve!: (value: { changed: boolean; unavailable: boolean }) => void
    ensureRunInsight.mockImplementation(
      () => new Promise<{ changed: boolean; unavailable: boolean }>((res) => (resolve = res)),
    )
    const { container } = render(
      <InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />,
    )

    expect(screen.getByText('The coach is reading your numbers…')).toBeInTheDocument()
    // And the line is the whole render — nothing moved on the page while the model thinks.
    expect(container.querySelectorAll('p')).toHaveLength(1)

    await act(async () => {
      resolve({ changed: false, unavailable: false })
    })
    await act(async () => {})
    await act(async () => {})
    expect(container.textContent).toBe('') // done → back to rendering nothing
  })

  it('a changed insight asks the router to re-render the server component', async () => {
    // Controlled promise resolved inside act, as in IntentChips: the effect's post-await
    // setState/refresh only commit when the action settles inside React's own flush.
    let resolve!: (value: { changed: boolean; unavailable: boolean }) => void
    ensureRunInsight.mockImplementation(
      () => new Promise<{ changed: boolean; unavailable: boolean }>((res) => (resolve = res)),
    )
    render(<InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />)

    await act(async () => {
      resolve({ changed: true, unavailable: false })
    })
    await act(async () => {})
    await act(async () => {})
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a cache hit changed nothing, so nothing re-renders', async () => {
    ensureRunInsight.mockResolvedValue({ changed: false, unavailable: false })
    render(<InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />)

    await act(async () => {})
    await act(async () => {})
    expect(refresh).not.toHaveBeenCalled()
  })

  it('the model being down is the honest line — not an error, not a retry button', async () => {
    let resolve!: (value: { changed: boolean; unavailable: boolean }) => void
    ensureRunInsight.mockImplementation(
      () => new Promise<{ changed: boolean; unavailable: boolean }>((res) => (resolve = res)),
    )
    const { container } = render(
      <InsightTrigger target={{ scope: 'session', runId: 'run-1' }} hasInsight={false} />,
    )

    await act(async () => {
      resolve({ changed: false, unavailable: true })
    })
    await act(async () => {})
    await act(async () => {})
    expect(
      screen.getByText(
        'The coach’s take isn’t available right now. Nothing else on this screen depends on it.',
      ),
    ).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
