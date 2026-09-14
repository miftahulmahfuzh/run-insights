// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatFallbackModelSelect } from './ChatFallbackModelSelect'
import { saveChatFallbackModelAction } from '@/lib/admin/chatFallbackModelActions'
import { NINA_CHAT_FALLBACK_MODEL_IDS, NINA_CHAT_FALLBACK_MODEL_SPECS } from '@/lib/nina/openrouter'

/*
 * `TextModelSelect.test.tsx`'s exact shape: the save action is mocked (a Server Action is a POST
 * endpoint with requireAdmin behind it — never reachable from a unit test); the catalog is REAL,
 * so the option list and the hints are pinned against the vocabulary itself.
 */
vi.mock('@/lib/admin/chatFallbackModelActions', () => ({
  saveChatFallbackModelAction: vi.fn(),
}))

const saveAction = vi.mocked(saveChatFallbackModelAction)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ChatFallbackModelSelect', () => {
  it('offers every id the catalog declares, labelled with the spec label', () => {
    render(<ChatFallbackModelSelect model="nvidia/nemotron-3.5-lightning" />)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(
      NINA_CHAT_FALLBACK_MODEL_IDS.map((id) => NINA_CHAT_FALLBACK_MODEL_SPECS[id].label),
    )
    expect(options.map((o) => o.getAttribute('value'))).toEqual([...NINA_CHAT_FALLBACK_MODEL_IDS])
  })

  it('opens on the model the setting resolves to right now', () => {
    render(<ChatFallbackModelSelect model="z-ai/glm-5.3-flash" />)
    expect(screen.getByRole('combobox')).toHaveValue('z-ai/glm-5.3-flash')
  })

  it('shows "Saved" while idle, in the accent colour, via a polite live region', () => {
    render(<ChatFallbackModelSelect model="nvidia/nemotron-3.5-lightning" />)
    const status = screen.getByText('Saved')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveClass('text-accent')
    expect(status).not.toHaveClass('text-red')
  })

  it('shows the hint for the current model', () => {
    render(<ChatFallbackModelSelect model="z-ai/glm-5.3-flash" />)
    expect(
      screen.getByText(NINA_CHAT_FALLBACK_MODEL_SPECS['z-ai/glm-5.3-flash'].hint),
    ).toBeInTheDocument()
  })

  it('falls back to the generic hint when the prop is an id the vocabulary does not declare', () => {
    render(<ChatFallbackModelSelect model="some/nonexistent-model" />)
    expect(
      screen.getByText(
        'Which model answers via OpenRouter when z.ai fails. In force on the next fallback attempt — no deploy.',
      ),
    ).toBeInTheDocument()
  })

  it('moves the select optimistically and shows "Saving…" while the action is in flight', async () => {
    const user = userEvent.setup()
    const gate = deferred<{ ok: true }>()
    saveAction.mockReturnValue(gate.promise)
    render(<ChatFallbackModelSelect model="nvidia/nemotron-3.5-lightning" />)

    await user.selectOptions(screen.getByRole('combobox'), 'z-ai/glm-5.3-flash')

    expect(screen.getByRole('combobox')).toHaveValue('z-ai/glm-5.3-flash')
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction).toHaveBeenCalledWith({ model: 'z-ai/glm-5.3-flash' })

    await act(async () => {
      gate.resolve({ ok: true })
    })
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
  })

  it('returns to "Saved" once the action succeeds — the commit-on-change rule needs no Save button', async () => {
    const user = userEvent.setup()
    saveAction.mockResolvedValue({ ok: true })
    render(<ChatFallbackModelSelect model="nvidia/nemotron-3.5-lightning" />)

    await user.selectOptions(screen.getByRole('combobox'), 'z-ai/glm-5.3-flash')
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(screen.getByRole('combobox')).toHaveValue('z-ai/glm-5.3-flash')
    expect(saveAction).toHaveBeenCalledWith({ model: 'z-ai/glm-5.3-flash' })
  })

  it('reverts the select and shows "Save failed" in red when the action fails', async () => {
    const user = userEvent.setup()
    saveAction.mockResolvedValue({ ok: false, error: 'The write failed and nothing was changed' })
    render(<ChatFallbackModelSelect model="nvidia/nemotron-3.5-lightning" />)

    await user.selectOptions(screen.getByRole('combobox'), 'z-ai/glm-5.3-flash')
    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument())

    expect(screen.getByRole('combobox')).toHaveValue('nvidia/nemotron-3.5-lightning')
    expect(screen.getByText('Save failed')).toHaveClass('text-red')
    expect(screen.getByText('Save failed')).not.toHaveClass('text-accent')
  })
})
