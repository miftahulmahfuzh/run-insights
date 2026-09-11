// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { UploadQueue } from './UploadQueue'
import type { QueueItem, QueueReport } from './model'
import type { UploadPhase } from './useFolderUpload'

function item(overrides?: Partial<QueueItem>): QueueItem {
  return {
    id: 'i1',
    path: '2026/bali/DSC_0031.jpg',
    folder: '2026/bali',
    filename: 'DSC_0031.jpg',
    state: 'waiting',
    error: null,
    ...overrides,
  }
}

function report(overrides?: Partial<QueueReport>): QueueReport {
  return { already: 0, rejected: 0, refused: [], found: 0, ...overrides }
}

describe('UploadQueue', () => {
  it('renders nothing while idle with no error', () => {
    const { container } = render(
      <UploadQueue phase="idle" items={[]} report={null} error={null} onDismiss={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders when idle but an error is present', () => {
    render(
      <UploadQueue phase="idle" items={[]} report={null} error="Something broke" onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('Something broke')).toBeInTheDocument()
  })

  it('says "Reading the folder" while reading', () => {
    render(<UploadQueue phase="reading" items={[]} report={null} error={null} onDismiss={vi.fn()} />)
    expect(screen.getByText('Reading the folder')).toBeInTheDocument()
  })

  it('says "Checking what is already here" while planning', () => {
    render(<UploadQueue phase="planning" items={[]} report={null} error={null} onDismiss={vi.fn()} />)
    expect(screen.getByText('Checking what is already here')).toBeInTheDocument()
  })

  it('says "Nothing to upload" once done with no report at all', () => {
    render(<UploadQueue phase="finished" items={[]} report={null} error={null} onDismiss={vi.fn()} />)
    expect(screen.getByText('Nothing to upload')).toBeInTheDocument()
  })

  it('names the "all already here" case in full, the sentence the component exists for', () => {
    render(
      <UploadQueue
        phase="finished"
        items={[]}
        report={report({ already: 313, found: 313 })}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('Nothing new. All 313 files are already here.')).toBeInTheDocument()
  })

  it('says "Nothing new to upload" with a skip tail when some were rejected but none matched found', () => {
    render(
      <UploadQueue
        phase="finished"
        items={[]}
        report={report({ rejected: 4, found: 4 })}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('Nothing new to upload · 4 not images')).toBeInTheDocument()
  })

  it('shows "Uploading N of M" with a skip tail while uploading', () => {
    render(
      <UploadQueue
        phase="uploading"
        items={[item({ id: 'a', state: 'done' }), item({ id: 'b', state: 'uploading' })]}
        report={report({ already: 2 })}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('Uploading 1 of 2 · 2 already here')).toBeInTheDocument()
  })

  it('shows "Uploaded N of M" once finished, with a failed count in the tail', () => {
    render(
      <UploadQueue
        phase="finished"
        items={[item({ id: 'a', state: 'done' }), item({ id: 'b', state: 'error', error: 'boom' })]}
        report={report()}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('Uploaded 1 of 2 · 1 failed')).toBeInTheDocument()
  })

  it('renders the progress bar at the done/total percentage', () => {
    render(
      <UploadQueue
        phase="uploading"
        items={[item({ id: 'a', state: 'done' }), item({ id: 'b' }), item({ id: 'c' }), item({ id: 'd' })]}
        report={report()}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
  })

  it('hides the Show/Hide toggle and the progress bar when there are no items', () => {
    render(
      <UploadQueue phase="finished" items={[]} report={report({ already: 1, found: 1 })} error={null} onDismiss={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /Show the list|Hide the list/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('hides Dismiss while busy, and shows it once settled', () => {
    const { rerender } = render(
      <UploadQueue phase="uploading" items={[item()]} report={null} error={null} onDismiss={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()

    rerender(<UploadQueue phase="finished" items={[item({ state: 'done' })]} report={report()} error={null} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('calls onDismiss when Dismiss is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <UploadQueue phase="finished" items={[item({ state: 'done' })]} report={report()} error={null} onDismiss={onDismiss} />,
    )
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('lists every refusal reason once the report carries refusals', () => {
    render(
      <UploadQueue
        phase="finished"
        items={[]}
        report={report({
          found: 2,
          refused: [
            { name: 'huge.png', reason: 'too_large' },
            { name: 'empty.png', reason: 'empty_file' },
          ],
        })}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('huge.png')).toBeInTheDocument()
    expect(screen.getByText(/Bigger than the/)).toBeInTheDocument()
    expect(screen.getByText('empty.png')).toBeInTheDocument()
    expect(screen.getByText(/Zero bytes/)).toBeInTheDocument()
  })

  it('caps the refused list at 12 rows and names the remainder', () => {
    const refused = Array.from({ length: 15 }, (_, i) => ({
      name: `file-${i}.png`,
      reason: 'unnamed' as const,
    }))
    render(
      <UploadQueue
        phase="finished"
        items={[]}
        report={report({ found: 15, refused })}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('file-11.png')).toBeInTheDocument()
    expect(screen.queryByText('file-12.png')).not.toBeInTheDocument()
    expect(screen.getByText('and 3 more refused')).toBeInTheDocument()
  })

  it('expands the failed and in-flight rows when Show the list is clicked', async () => {
    const user = userEvent.setup()
    render(
      <UploadQueue
        phase="uploading"
        items={[
          item({ id: 'ok', state: 'done', path: 'a/ok.jpg' }),
          item({ id: 'bad', state: 'error', error: 'refused by server', path: 'a/bad.jpg' }),
          item({ id: 'mid', state: 'thumbnailing', path: 'a/mid.jpg' }),
        ]}
        report={report()}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.queryByText('refused by server')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show the list' }))
    expect(screen.getByText('a/bad.jpg')).toBeInTheDocument()
    expect(screen.getByText('refused by server')).toBeInTheDocument()
    expect(screen.getByText('a/mid.jpg')).toBeInTheDocument()
    expect(screen.getByText('Reading')).toBeInTheDocument()
    // The finished tile is not repeated in the in-flight section.
    expect(screen.queryByText('a/ok.jpg')).not.toBeInTheDocument()
    expect(screen.getByText('1 of 3 finished')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide the list' }))
    expect(screen.queryByText('a/bad.jpg')).not.toBeInTheDocument()
  })

  it('shows a default "Failed" label for a failed item with no error text', async () => {
    const user = userEvent.setup()
    render(
      <UploadQueue
        phase="finished"
        items={[item({ id: 'bad', state: 'error', error: null, path: 'a/bad.jpg' })]}
        report={report()}
        error={null}
        onDismiss={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Show the list' }))
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})
