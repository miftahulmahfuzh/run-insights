// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PhotoDescription, type DescribeOutcome } from './PhotoDescription'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'

const OK: DescribeOutcome = { ok: true }

/** A promise this test controls the settling of, so a click can be observed mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function textarea() {
  return screen.getByLabelText('What she can see in it') as HTMLTextAreaElement
}

function saveButton() {
  return screen.getByRole('button', { name: /save the description|clear the description/i })
}

function describeButton() {
  return screen.getByRole('button', { name: /describe it|re-describe it/i })
}

describe('PhotoDescription', () => {
  it('shows the stored description in the box', () => {
    render(
      <PhotoDescription
        description="a red bicycle"
        emptyNote="not described yet"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(textarea().value).toBe('a red bicycle')
  })

  it('renders the empty note only when description is null and the box is untouched', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description={null}
        emptyNote="not described yet"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(screen.getByText('not described yet')).toBeInTheDocument()

    await user.type(textarea(), 'x')
    expect(screen.queryByText('not described yet')).not.toBeInTheDocument()
  })

  it('does not render the empty note when a description is already stored', () => {
    render(
      <PhotoDescription
        description="already there"
        emptyNote="not described yet"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(screen.queryByText('not described yet')).not.toBeInTheDocument()
  })

  it('disables Save until the box is dirty, and marks it unsaved once typed', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(saveButton()).toBeDisabled()
    expect(screen.queryByText('unsaved')).not.toBeInTheDocument()

    await user.type(textarea(), ' more')
    expect(saveButton()).toBeEnabled()
    expect(screen.getByText('unsaved')).toBeInTheDocument()
  })

  it('is not dirty when the typed text matches the stored text exactly', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.clear(textarea())
    await user.type(textarea(), 'stored')
    expect(saveButton()).toBeDisabled()
    expect(screen.queryByText('unsaved')).not.toBeInTheDocument()
  })

  it('labels Save as Clear once an emptied box would null an existing description', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.clear(textarea())
    expect(screen.getByRole('button', { name: 'Clear the description' })).toBeInTheDocument()
  })

  it('does not offer Clear for an already-empty description that stays empty', async () => {
    render(
      <PhotoDescription
        description={null}
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    // untouched (draft === null) and nothing stored: the button reads Save, not Clear, and is
    // disabled because the box is not dirty.
    expect(screen.getByRole('button', { name: 'Save the description' })).toBeDisabled()
  })

  it('calls onSave with the box text and clears the dirty/unsaved state on success', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => OK)
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={onSave}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' more')
    await user.click(saveButton())

    expect(onSave).toHaveBeenCalledWith('stored more')
    expect(screen.queryByText('unsaved')).not.toBeInTheDocument()
    // Draft resets to null on success, so the box falls back to the `description` prop — which
    // this test never updates (that is the parent's job, once revalidation lands a new prop).
    expect(textarea().value).toBe('stored')
  })

  it('renders a note returned by a successful save', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => ({ ok: true, note: 'saved just now' }) as DescribeOutcome)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(screen.getByText('saved just now')).toBeInTheDocument()
  })

  it('shows the error and keeps the draft dirty when a save refuses', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => ({ ok: false, error: 'refused: too long' }) as DescribeOutcome)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(screen.getByText('refused: too long')).toBeInTheDocument()
    expect(screen.getByText('unsaved')).toBeInTheDocument()
  })

  it('falls back to a default sentence when a refusal carries no error text', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => ({ ok: false }) as DescribeOutcome)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(screen.getByText('That description did not stick.')).toBeInTheDocument()
  })

  it('shows a caught save exception as the error', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => {
          throw new Error('network down')
        })}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(screen.getByText('network down')).toBeInTheDocument()
  })

  it('does not fire a second save while one is in flight', async () => {
    const user = userEvent.setup()
    const gate = deferred<DescribeOutcome>()
    const onSave = vi.fn(() => gate.promise)
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={onSave}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(saveButton()).toBeDisabled()
    await user.click(saveButton())
    expect(onSave).toHaveBeenCalledTimes(1)

    gate.resolve(OK)
  })

  it('disables the textarea while a save is in flight, but not while describing', async () => {
    const user = userEvent.setup()
    const saveGate = deferred<DescribeOutcome>()
    const describeGate = deferred<DescribeOutcome>()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={() => saveGate.promise}
        onRedescribe={() => describeGate.promise}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(textarea()).toBeDisabled()
    saveGate.resolve(OK)
    await screen.findByRole('button', { name: /save the description/i })
    expect(textarea()).toBeEnabled()

    await user.click(describeButton())
    expect(textarea()).toBeEnabled()
    describeGate.resolve(OK)
  })

  it('labels the describe button "Describe it" when there is no description yet', () => {
    render(
      <PhotoDescription
        description={null}
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(screen.getByRole('button', { name: 'Describe it' })).toBeInTheDocument()
  })

  it('labels the describe button as an overwrite warning once described', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Re-describe it — it overwrites' }),
    ).toBeInTheDocument()
  })

  it('calls onRedescribe with no arguments and shows its note on success', async () => {
    const user = userEvent.setup()
    const onRedescribe = vi.fn(async () => ({ ok: true, note: 'described' }) as DescribeOutcome)
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={onRedescribe}
      />,
    )
    await user.click(describeButton())
    expect(onRedescribe).toHaveBeenCalledWith()
    expect(screen.getByText('described')).toBeInTheDocument()
  })

  it('leaves an unsaved draft alone across a redescribe — the fresh prose does not overwrite typing', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => ({ ok: true }) as DescribeOutcome)}
      />,
    )
    await user.type(textarea(), ' unsaved edit')
    await user.click(describeButton())
    await screen.findByRole('button', { name: /describe it|re-describe it/i })
    expect(textarea().value).toBe('stored unsaved edit')
    expect(screen.getByText('unsaved')).toBeInTheDocument()
  })

  it('shows a default sentence when a redescribe refuses with no error text', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => ({ ok: false }) as DescribeOutcome)}
      />,
    )
    await user.click(describeButton())
    expect(screen.getByText('The description call failed. Try again.')).toBeInTheDocument()
  })

  it('caps the textarea at the max description length', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(textarea().maxLength).toBe(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS)
  })

  it('does not disable the describe button while a save is running only through dirty gating', async () => {
    // Describe is disabled while EITHER flight is in progress, not just while dirty.
    const user = userEvent.setup()
    const saveGate = deferred<DescribeOutcome>()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={() => saveGate.promise}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' x')
    await user.click(saveButton())
    expect(describeButton()).toBeDisabled()
    saveGate.resolve(OK)
  })
})
