// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Real decision functions throughout (lib/nina/edit.ts): canResendMessage, editCapFor and
// planMessageEdit are already unit tested on their own terms in lib/nina/edit.test.ts, and
// mocking them here would only prove that this component calls a function by name — not that a
// real click on a real menu reaches the real refusal copy.
import { MessageActionsSheet } from './MessageActionsSheet'
import type { EditTarget } from '@/lib/nina/edit'
import { EDIT_MAX_CHARS_HERS, EDIT_MAX_CHARS_MINE } from '@/lib/nina/edit'

/** 12 chars, matching `lib/id.ts`'s `ID_RE` — `canActOnMessage` refuses anything shorter. */
const MSG_ID = 'msg000000001'

function target(overrides?: Partial<EditTarget>): EditTarget {
  return {
    id: MSG_ID,
    mine: true,
    body: 'hello there',
    hasImage: false,
    hasRun: false,
    confirmed: true,
    ...overrides,
  }
}

/** A promise this test controls the settling of, so a click can be observed mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function baseProps() {
  return {
    retryable: false,
    onRetry: vi.fn(async () => true),
    onClose: vi.fn(),
    onSubmitEdit: vi.fn(async () => true),
    onDelete: vi.fn(async () => true),
    onResend: vi.fn(async () => null as string | null),
  }
}

describe('MessageActionsSheet', () => {
  it('renders nothing when target is null', () => {
    const props = baseProps()
    const { container } = render(<MessageActionsSheet {...props} target={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message body in the menu', () => {
    const props = baseProps()
    render(<MessageActionsSheet {...props} target={target({ body: 'a real message' })} />)
    expect(screen.getByText('a real message')).toBeInTheDocument()
  })

  it('falls back to a placeholder when the body is empty', () => {
    const props = baseProps()
    render(<MessageActionsSheet {...props} target={target({ body: '' })} />)
    expect(screen.getByText('No text — a photo, or a shared run.')).toBeInTheDocument()
  })

  describe('confirmed menu', () => {
    it('offers Edit and Delete on a confirmed message', () => {
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ mine: true })} />)
      expect(screen.getByRole('button', { name: 'Edit your message' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete your message' })).toBeInTheDocument()
    })

    it('labels the delete button for Nina’s message when it is not mine', () => {
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ mine: false })} />)
      expect(screen.getByRole('button', { name: 'Edit Nina’s message' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete Nina’s message' })).toBeInTheDocument()
    })

    it('offers Resend only on a confirmed message that is mine', () => {
      const props = baseProps()
      const { rerender } = render(
        <MessageActionsSheet {...props} target={target({ mine: true })} />,
      )
      expect(screen.getByRole('button', { name: 'Resend your message' })).toBeInTheDocument()

      rerender(<MessageActionsSheet {...props} target={target({ mine: false })} />)
      expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument()
    })

    it('never shows the failed-row copy on a confirmed message', () => {
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target()} />)
      expect(screen.queryByRole('button', { name: /send it again/i })).not.toBeInTheDocument()
      expect(
        screen.queryByText('This did not reach Nina — the red outline marks a send that failed.'),
      ).not.toBeInTheDocument()
    })
  })

  describe('failed row menu', () => {
    it('offers a retry and Delete when retryable, and no Edit or Resend', () => {
      const props = baseProps()
      render(
        <MessageActionsSheet
          {...props}
          retryable
          target={target({ mine: true, confirmed: false })}
        />,
      )
      expect(screen.getByRole('button', { name: 'Send it again' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete your message' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument()
      expect(
        screen.getByText('This did not reach Nina — the red outline marks a send that failed.'),
      ).toBeInTheDocument()
    })

    it('explains an un-retryable failure (photos attached) instead of offering a retry', () => {
      const props = baseProps()
      render(
        <MessageActionsSheet
          {...props}
          retryable={false}
          target={target({ mine: true, confirmed: false })}
        />,
      )
      expect(screen.queryByRole('button', { name: 'Send it again' })).not.toBeInTheDocument()
      expect(
        screen.getByText('Its photos cannot be re-sent — attach them to a new message instead.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete your message' })).toBeInTheDocument()
    })
  })

  describe('retrying a failed send', () => {
    it('closes the sheet when the retry succeeds', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onRetry.mockResolvedValueOnce(true)
      render(
        <MessageActionsSheet
          {...props}
          retryable
          target={target({ mine: true, confirmed: false })}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Send it again' }))

      expect(props.onRetry).toHaveBeenCalledTimes(1)
      expect(props.onClose).toHaveBeenCalledTimes(1)
    })

    it('shows a refusal and stays open when the retry fails', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onRetry.mockResolvedValueOnce(false)
      render(
        <MessageActionsSheet
          {...props}
          retryable
          target={target({ mine: true, confirmed: false })}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Send it again' }))

      expect(props.onClose).not.toHaveBeenCalled()
      expect(
        screen.getByText('It still did not reach Nina. Give it a moment and try again.'),
      ).toBeInTheDocument()
    })

    it('disables the retry button while the retry is in flight, then closes once it resolves', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      const gate = deferred<boolean>()
      props.onRetry.mockReturnValueOnce(gate.promise)
      render(
        <MessageActionsSheet
          {...props}
          retryable
          target={target({ mine: true, confirmed: false })}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Send it again' }))
      expect(screen.getByRole('button', { name: 'Send it again' })).toBeDisabled()
      expect(props.onClose).not.toHaveBeenCalled()

      gate.resolve(true)
      await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
    })
  })

  describe('resending a confirmed message', () => {
    it('closes the sheet when the resend is accepted (resolves null)', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onResend.mockResolvedValueOnce(null)
      render(<MessageActionsSheet {...props} target={target({ mine: true })} />)

      await user.click(screen.getByRole('button', { name: 'Resend your message' }))

      expect(props.onResend).toHaveBeenCalledWith(MSG_ID)
      expect(props.onClose).toHaveBeenCalledTimes(1)
    })

    it('shows the caller-authored refusal sentence and stays open', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onResend.mockResolvedValueOnce('She is already answering that one.')
      render(<MessageActionsSheet {...props} target={target({ mine: true })} />)

      await user.click(screen.getByRole('button', { name: 'Resend your message' }))

      expect(props.onClose).not.toHaveBeenCalled()
      expect(screen.getByText('She is already answering that one.')).toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    it('closes the sheet once the delete resolves true', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onDelete.mockResolvedValueOnce(true)
      render(<MessageActionsSheet {...props} target={target({ mine: true })} />)

      await user.click(screen.getByRole('button', { name: 'Delete your message' }))

      expect(props.onDelete).toHaveBeenCalledWith(MSG_ID)
      expect(props.onClose).toHaveBeenCalledTimes(1)
    })

    it('stays open with the menu still showing when the delete resolves false', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onDelete.mockResolvedValueOnce(false)
      render(<MessageActionsSheet {...props} target={target({ mine: true })} />)

      await user.click(screen.getByRole('button', { name: 'Delete your message' }))

      expect(props.onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Delete your message' })).toBeInTheDocument()
    })
  })

  describe('editing', () => {
    it('switches to edit mode with the current body pre-filled', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ body: 'original text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))

      expect(screen.getByRole('textbox')).toHaveValue('original text')
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('shows a clear button in the textarea, absent when the draft is empty', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ body: 'original text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      expect(screen.getByRole('button', { name: 'Clear text' })).toBeInTheDocument()

      await user.clear(screen.getByRole('textbox'))
      expect(screen.queryByRole('button', { name: 'Clear text' })).not.toBeInTheDocument()
    })

    it('clears the whole draft and refocuses the textarea on one click', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ body: 'original text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.click(screen.getByRole('button', { name: 'Clear text' }))

      expect(screen.getByRole('textbox')).toHaveValue('')
      expect(screen.getByRole('textbox')).toHaveFocus()
    })

    it('caps the textarea length at EDIT_MAX_CHARS_MINE for his own message', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ mine: true })} />)
      await user.click(screen.getByRole('button', { name: /^edit/i }))
      expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', String(EDIT_MAX_CHARS_MINE))
    })

    it('caps the textarea length at EDIT_MAX_CHARS_HERS for Nina’s message', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ mine: false })} />)
      await user.click(screen.getByRole('button', { name: /^edit/i }))
      expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', String(EDIT_MAX_CHARS_HERS))
    })

    it('the Back button returns to the menu without saving', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ body: 'original text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'a throwaway draft')
      await user.click(screen.getByRole('button', { name: 'Back' }))

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
      expect(screen.getByText('original text')).toBeInTheDocument()
      expect(props.onSubmitEdit).not.toHaveBeenCalled()
    })

    it('closes without writing when Save is pressed on an unchanged body', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ body: 'same text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(props.onSubmitEdit).not.toHaveBeenCalled()
      expect(props.onClose).toHaveBeenCalledTimes(1)
    })

    it('writes the trimmed body and closes on a real edit', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ body: 'old text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), '  new text  ')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(props.onSubmitEdit).toHaveBeenCalledWith(MSG_ID, 'new text')
      expect(props.onClose).toHaveBeenCalledTimes(1)
    })

    it('stays open with no close call when the write fails', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      props.onSubmitEdit.mockResolvedValueOnce(false)
      render(<MessageActionsSheet {...props} target={target({ body: 'old text' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.type(screen.getByRole('textbox'), 'new text')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(props.onSubmitEdit).toHaveBeenCalledTimes(1)
      expect(props.onClose).not.toHaveBeenCalled()
    })

    it('refuses locally, with no server call, when the edit is over the cap', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ mine: false, body: 'x' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      // fireEvent.change sets the DOM value directly, unlike userEvent.type — a real browser
      // only enforces `maxlength` against keystrokes and paste, not a programmatic value set, so
      // this is the one way to put an over-cap string in front of `planMessageEdit` at all.
      const tooLong = 'y'.repeat(EDIT_MAX_CHARS_HERS + 10)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: tooLong } })
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(props.onSubmitEdit).not.toHaveBeenCalled()
      expect(
        screen.getByText(
          `That is 10 characters too long. The limit here is ${EDIT_MAX_CHARS_HERS}.`,
        ),
      ).toBeInTheDocument()
    })

    it('clears a stale refusal as soon as the textarea changes', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ mine: false, body: '' })} />)

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(
        screen.getByText('Clearing the text leaves nothing. Delete the message instead.'),
      ).toBeInTheDocument()

      await user.type(screen.getByRole('textbox'), 'a')
      expect(
        screen.queryByText('Clearing the text leaves nothing. Delete the message instead.'),
      ).not.toBeInTheDocument()
    })

    it('refuses an empty edit on a text-only message with "delete instead"', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(
        <MessageActionsSheet
          {...props}
          target={target({ body: 'something', hasImage: false, hasRun: false })}
        />,
      )

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(props.onSubmitEdit).not.toHaveBeenCalled()
      expect(
        screen.getByText('Clearing the text leaves nothing. Delete the message instead.'),
      ).toBeInTheDocument()
    })

    it('allows clearing the caption of an image-only message', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(
        <MessageActionsSheet {...props} target={target({ body: 'caption', hasImage: true })} />,
      )

      await user.click(screen.getByRole('button', { name: /^edit/i }))
      await user.clear(screen.getByRole('textbox'))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(props.onSubmitEdit).toHaveBeenCalledWith(MSG_ID, '')
      expect(props.onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('subtitle copy', () => {
    it('shows the failed-row subtitle on a failed target', () => {
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target({ confirmed: false })} />)
      expect(
        screen.getByText('This did not reach Nina — the red outline marks a send that failed.'),
      ).toBeInTheDocument()
    })

    it('shows the context-warning subtitle on a confirmed target', () => {
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target()} />)
      expect(
        screen.getByText('Whatever this says is what Nina reads as context on her next reply.'),
      ).toBeInTheDocument()
    })

    it('shows the edit-mode title and no subtitle', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<MessageActionsSheet {...props} target={target()} />)
      await user.click(screen.getByRole('button', { name: /^edit/i }))
      expect(screen.getByRole('heading', { name: 'Edit message' })).toBeInTheDocument()
      expect(
        screen.queryByText('Whatever this says is what Nina reads as context on her next reply.'),
      ).not.toBeInTheDocument()
    })
  })
})
