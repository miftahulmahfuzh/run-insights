// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// `NinaJobActions` is covered in its own file — here it is a marker, because what the list decides
// is WHERE the controls stand (a sibling of the row's link, never a child) and what the row looks
// like with and without them. `NinaJobElapsed` stays real: its first paint is pure props math.
vi.mock('./NinaJobActions', () => ({
  NinaJobActions: () => <div data-testid="job-actions" />,
}))

import { NinaJobList } from './NinaJobList'
import {
  formatJobLatency,
  formatJobSeconds,
  jobElapsedSeconds,
  type NinaJobListItem,
} from '@/lib/nina/jobview'

const NOW_MS = 1_790_000_000_000

function item(overrides?: Partial<NinaJobListItem>): NinaJobListItem {
  return {
    id: 'job-1',
    href: '/nina/jobs?jump=job-1',
    stage: 'done',
    stageLabel: 'Selesai',
    purpose: 'selfie',
    scene: 'sore di kos',
    attempts: 1,
    createdAtMs: NOW_MS - 60_000,
    errorLabel: null,
    latencyMs: 74_000,
    open: false,
    canRedo: false,
    ...overrides,
  }
}

describe('NinaJobList', () => {
  it('absence is one sentence, worded by the caller — no EmptyState card', () => {
    const { container } = render(
      <NinaJobList items={[]} nowMs={NOW_MS} emptyText="Belum ada job foto." />,
    )
    const p = container.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('Belum ada job foto.')
    expect(p.className).toContain('border-dashed')
  })

  it('rows render newest-first because that is the order they arrived in — nothing re-sorts', () => {
    render(
      <NinaJobList
        items={[item({ id: 'job-1', scene: 'pertama' }), item({ id: 'job-2', scene: 'kedua' })]}
        nowMs={NOW_MS}
        emptyText="x"
      />,
    )
    const titles = screen.getAllByRole('link').map((a) => a.textContent ?? '')
    expect(titles[0]).toContain('pertama')
    expect(titles[1]).toContain('kedua')
  })

  it('each row links where the item says, titled by the scene', () => {
    render(<NinaJobList items={[item()]} nowMs={NOW_MS} emptyText="x" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/nina/jobs?jump=job-1')
    expect(screen.getByText('sore di kos')).toBeInTheDocument()
  })

  it('a row with no scene falls back to the purpose — the same rule the aria-label uses', () => {
    render(
      <NinaJobList
        items={[item({ scene: null, purpose: 'avatar' }), item({ id: 'job-2', scene: null })]}
        nowMs={NOW_MS}
        emptyText="x"
      />,
    )
    // A sceneless row shows its purpose TWICE — as the title and again in the purpose line —
    // which is exactly the duplication `scene` exists to avoid. Both spellings must agree.
    expect(screen.getAllByText('Foto profil').length).toBe(2)
    expect(screen.getAllByText('Selfie').length).toBe(2)
  })

  it('an open job ticks from the server clock; a closed one shows the generation’s own latency', () => {
    render(
      <NinaJobList
        items={[
          item({ id: 'job-1', stage: 'running', open: true, latencyMs: null }),
          item({ id: 'job-2' }),
        ]}
        nowMs={NOW_MS}
        emptyText="x"
      />,
    )
    const expectedElapsed = formatJobSeconds(jobElapsedSeconds(NOW_MS - 60_000, NOW_MS))
    expect(screen.getByText(expectedElapsed)).toBeInTheDocument()
    expect(screen.getByText(formatJobLatency(74_000))).toBeInTheDocument()
  })

  it('the stage reads first; a failed stage reads in red', () => {
    const { container: ok } = render(<NinaJobList items={[item()]} nowMs={NOW_MS} emptyText="x" />)
    expect(ok.textContent).toContain('Selesai')

    const { container: failed } = render(
      <NinaJobList
        items={[item({ stage: 'failed', stageLabel: 'Gagal', errorLabel: 'model overload' })]}
        nowMs={NOW_MS}
        emptyText="x"
      />,
    )
    expect(failed.textContent).toContain('Gagal')
    expect(failed.textContent).toContain('model overload')
  })

  it('the purpose line and the retry count, and the count only when there were retries', () => {
    const { container: never } = render(
      <NinaJobList items={[item({ attempts: 0 })]} nowMs={NOW_MS} emptyText="x" />,
    )
    expect(never.textContent).toContain('Selfie')
    expect(never.textContent).not.toContain('dicoba')

    const { container: once } = render(
      <NinaJobList items={[item({ attempts: 1 })]} nowMs={NOW_MS} emptyText="x" />,
    )
    expect(once.textContent).toContain('1x dicoba')

    const { container: twice } = render(
      <NinaJobList items={[item({ attempts: 2 })]} nowMs={NOW_MS} emptyText="x" />,
    )
    expect(twice.textContent).toContain('2x dicoba')
  })

  it('READ-ONLY (the /nina/about summary): bare rows, no controls, surface on the link', () => {
    const { container } = render(
      <NinaJobList
        items={[item({ stage: 'running', open: true, latencyMs: null })]}
        nowMs={NOW_MS}
        emptyText="x"
      />,
    )
    const li = container.querySelector('li') as HTMLElement
    // Invariant 5 of the phase plan: with `actions` absent the markup is what shipped before —
    // `className={undefined}` means React OMITS the attribute entirely.
    expect(li.getAttribute('class')).toBeNull()
    expect(container.querySelector('[data-testid="job-actions"]')).toBeNull()
    // An open row's card surface sits on the `<a>` in this mode.
    expect((container.querySelector('a') as HTMLElement).className).toContain('bg-card')
  })

  it('ACTIONS MODE (the /nina/jobs console): the surface moves to the li so it wraps the controls', () => {
    const { container } = render(
      <NinaJobList
        items={[item({ stage: 'running', open: true, latencyMs: null }), item({ id: 'job-2' })]}
        nowMs={NOW_MS}
        emptyText="x"
        actions
      />,
    )
    const [openLi, closedLi] = container.querySelectorAll('li')
    expect(openLi?.className).toContain('bg-card')
    expect(openLi?.className).toContain('shadow-card')
    expect(closedLi?.className).toContain('bg-transparent')
    // The link cedes its surface in this mode.
    expect((openLi?.querySelector('a') as HTMLElement).className).not.toContain('bg-card')
    // One controls cluster per row, and always a SIBLING of the link, never a child of it.
    expect(container.querySelectorAll('[data-testid="job-actions"]').length).toBe(2)
    expect(
      openLi
        ?.querySelector('a')
        ?.contains(openLi?.querySelector('[data-testid="job-actions"]') ?? null),
    ).toBe(false)
  })

  it('className rides the ul — or the empty sentence, whichever shape this render took', () => {
    const { container: empty } = render(
      <NinaJobList items={[]} nowMs={NOW_MS} emptyText="x" className="my-2" />,
    )
    expect((empty.querySelector('p') as HTMLElement).className).toContain('my-2')

    const { container: rows } = render(
      <NinaJobList items={[item()]} nowMs={NOW_MS} emptyText="x" className="my-2" />,
    )
    expect((rows.querySelector('ul') as HTMLElement).className).toContain('my-2')
  })
})
