// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PhotoDescription, type DescribeOutcome } from './PhotoDescription'
import {
  ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS,
  ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS,
} from '@/lib/admin/avatars'
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

function keywordsBox() {
  return screen.getByLabelText('Search keywords') as HTMLTextAreaElement
}
function keywordsButton() {
  return screen.getByRole('button', {
    name: /save the search keywords|clear the search keywords/i,
  })
}

describe('PhotoDescription — search keywords', () => {
  it('renders no keyword block when the host supplies no keyword save', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(screen.queryByLabelText('Search keywords')).not.toBeInTheDocument()
  })

  it('shows the stored keywords and saves the box text', async () => {
    const user = userEvent.setup()
    const onSaveKeywords = vi.fn(async () => OK)
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={onSaveKeywords}
      />,
    )
    expect(keywordsBox().value).toBe('tete')
    expect(keywordsButton()).toBeDisabled()

    await user.type(keywordsBox(), ', putih')
    expect(keywordsButton()).toBeEnabled()
    await user.click(keywordsButton())

    expect(onSaveKeywords).toHaveBeenCalledWith('tete, putih')
  })

  it('labels the keyword save as Clear once an emptied box would null stored keywords', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={vi.fn(async () => OK)}
      />,
    )
    await user.clear(keywordsBox())
    expect(screen.getByRole('button', { name: 'Clear the search keywords' })).toBeInTheDocument()
  })

  it('caps the keyword box at the album ceiling', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords={null}
        onSaveKeywords={vi.fn(async () => OK)}
      />,
    )
    expect(keywordsBox().maxLength).toBe(ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS)
  })

  it('a keyword save in flight locks the description save and the describe button', async () => {
    const user = userEvent.setup()
    const gate = deferred<DescribeOutcome>()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={() => gate.promise}
      />,
    )
    await user.type(textarea(), ' x')
    await user.type(keywordsBox(), ', putih')
    await user.click(keywordsButton())

    expect(saveButton()).toBeDisabled()
    expect(describeButton()).toBeDisabled()
    expect(keywordsBox()).toBeDisabled()
    /* The prose box stays editable — only the box being written is locked. */
    expect(textarea()).toBeEnabled()

    gate.resolve(OK)
  })

  it('a keyword save leaves an unsaved description draft alone', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        searchKeywords="tete"
        onSaveKeywords={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' unsaved edit')
    await user.type(keywordsBox(), ', putih')
    await user.click(keywordsButton())
    await screen.findByRole('button', { name: /save the search keywords/i })

    expect(textarea().value).toBe('stored unsaved edit')
    expect(screen.getByText('unsaved')).toBeInTheDocument()
  })
})

function negativeKeywordsBox() {
  return screen.getByLabelText('Negative keywords') as HTMLTextAreaElement
}
function negativeKeywordsButton() {
  return screen.getByRole('button', {
    name: /save the negative keywords|clear the negative keywords/i,
  })
}

describe('PhotoDescription — negative keywords', () => {
  it('renders no negative-keyword block when the host supplies no save', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
      />,
    )
    expect(screen.queryByLabelText('Negative keywords')).not.toBeInTheDocument()
  })

  it('renders independently of the search-keywords block', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        onSaveNegativeKeywords={vi.fn(async () => OK)}
      />,
    )
    expect(screen.getByLabelText('Negative keywords')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search keywords')).not.toBeInTheDocument()
  })

  it('shows the stored value and saves the box text', async () => {
    const user = userEvent.setup()
    const onSaveNegativeKeywords = vi.fn(async () => OK)
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        negativeSearchKeywords="tete"
        onSaveNegativeKeywords={onSaveNegativeKeywords}
      />,
    )
    expect(negativeKeywordsBox().value).toBe('tete')
    expect(negativeKeywordsButton()).toBeDisabled()

    await user.type(negativeKeywordsBox(), ', payudara')
    expect(negativeKeywordsButton()).toBeEnabled()
    await user.click(negativeKeywordsButton())

    expect(onSaveNegativeKeywords).toHaveBeenCalledWith('tete, payudara')
  })

  it('labels the save as Clear once an emptied box would null the stored value', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        negativeSearchKeywords="tete"
        onSaveNegativeKeywords={vi.fn(async () => OK)}
      />,
    )
    await user.clear(negativeKeywordsBox())
    expect(screen.getByRole('button', { name: 'Clear the negative keywords' })).toBeInTheDocument()
  })

  it('caps the box at the negative-keyword ceiling', () => {
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        negativeSearchKeywords={null}
        onSaveNegativeKeywords={vi.fn(async () => OK)}
      />,
    )
    expect(negativeKeywordsBox().maxLength).toBe(ADMIN_AVATAR_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS)
  })

  it('a negative-keyword save in flight locks the description save and the describe button', async () => {
    const user = userEvent.setup()
    const gate = deferred<DescribeOutcome>()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        negativeSearchKeywords="tete"
        onSaveNegativeKeywords={() => gate.promise}
      />,
    )
    await user.type(textarea(), ' x')
    await user.type(negativeKeywordsBox(), ', payudara')
    await user.click(negativeKeywordsButton())

    expect(saveButton()).toBeDisabled()
    expect(describeButton()).toBeDisabled()
    expect(negativeKeywordsBox()).toBeDisabled()
    expect(textarea()).toBeEnabled()

    gate.resolve(OK)
  })

  it('a negative-keyword save leaves an unsaved description draft alone', async () => {
    const user = userEvent.setup()
    render(
      <PhotoDescription
        description="stored"
        emptyNote="empty"
        onSave={vi.fn(async () => OK)}
        onRedescribe={vi.fn(async () => OK)}
        negativeSearchKeywords="tete"
        onSaveNegativeKeywords={vi.fn(async () => OK)}
      />,
    )
    await user.type(textarea(), ' unsaved edit')
    await user.type(negativeKeywordsBox(), ', payudara')
    await user.click(negativeKeywordsButton())
    await screen.findByRole('button', { name: /save the negative keywords/i })

    expect(textarea().value).toBe('stored unsaved edit')
    expect(screen.getByText('unsaved')).toBeInTheDocument()
  })
})
