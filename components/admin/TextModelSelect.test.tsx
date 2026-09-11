// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TextModelSelect } from './TextModelSelect'
import { saveNarrativeTextModelAction } from '@/lib/admin/textModelActions'
import { NARRATIVE_TEXT_MODEL_IDS, NARRATIVE_TEXT_MODEL_SPECS } from '@/lib/llm/catalog'

/*
 * The save action is mocked (a Server Action is a POST endpoint with requireAdmin behind it —
 * never reachable from a unit test); the catalog is REAL, so the option list and the hints are
 * pinned against the vocabulary itself. The component's whole contract is optimistic-select with
 * revert-on-failure, and a mid-flight deferred promise is how the "Saving…" state is observed at
 * all.
 */
vi.mock('@/lib/admin/textModelActions', () => ({
  saveNarrativeTextModelAction: vi.fn(),
}))

const saveAction = vi.mocked(saveNarrativeTextModelAction)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('TextModelSelect', () => {
  it('offers every id the catalog declares, labelled with the spec label', () => {
    render(<TextModelSelect model="glm-5.3" />)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(
      NARRATIVE_TEXT_MODEL_IDS.map((id) => NARRATIVE_TEXT_MODEL_SPECS[id].label),
    )
    expect(options.map((o) => o.getAttribute('value'))).toEqual([...NARRATIVE_TEXT_MODEL_IDS])
  })

  it('opens on the model the setting resolves to right now', () => {
    render(<TextModelSelect model="glm-5.3-flash" />)
    expect(screen.getByRole('combobox')).toHaveValue('glm-5.3-flash')
  })

  it('shows "Saved" while idle, in the accent colour, via a polite live region', () => {
    render(<TextModelSelect model="glm-5.3" />)
    const status = screen.getByText('Saved')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveClass('text-accent')
    expect(status).not.toHaveClass('text-red')
  })

  it('shows the hint for the current model', () => {
    render(<TextModelSelect model="glm-5.3-flash" />)
    expect(screen.getByText(NARRATIVE_TEXT_MODEL_SPECS['glm-5.3-flash'].hint)).toBeInTheDocument()
  })

  it('falls back to the generic hint when the prop is an id the vocabulary does not declare', () => {
    // The docstring says the prop is always effective — but the component still defends itself
    // against a raw undeclared value rather than rendering `undefined`.
    render(<TextModelSelect model="glm-9-nonexistent" />)
    expect(
      screen.getByText(
        'Which GLM writes her replies, captions, titles and the insights rollup. In force on the next call — no deploy.',
      ),
    ).toBeInTheDocument()
  })

  it('moves the select optimistically and shows "Saving…" while the action is in flight', async () => {
    const user = userEvent.setup()
    const gate = deferred<{ ok: true }>()
    saveAction.mockReturnValue(gate.promise)
    render(<TextModelSelect model="glm-5.3" />)

    await user.selectOptions(screen.getByRole('combobox'), 'glm-5.3-flash')

    // Optimistic: the select has already moved BEFORE the action answered.
    expect(screen.getByRole('combobox')).toHaveValue('glm-5.3-flash')
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(saveAction).toHaveBeenCalledTimes(1)
    expect(saveAction).toHaveBeenCalledWith({ model: 'glm-5.3-flash' })

    await act(async () => {
      gate.resolve({ ok: true })
    })
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
  })

  it('returns to "Saved" once the action succeeds — the commit-on-change rule needs no Save button', async () => {
    const user = userEvent.setup()
    saveAction.mockResolvedValue({ ok: true })
    render(<TextModelSelect model="glm-5.3" />)

    await user.selectOptions(screen.getByRole('combobox'), 'glm-5.3-flash')
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(screen.getByRole('combobox')).toHaveValue('glm-5.3-flash')
    expect(saveAction).toHaveBeenCalledWith({ model: 'glm-5.3-flash' })
  })

  it('reverts the select and shows "Save failed" in red when the action fails', async () => {
    const user = userEvent.setup()
    saveAction.mockResolvedValue({ ok: false, error: 'The write failed and nothing was changed' })
    render(<TextModelSelect model="glm-5.3" />)

    await user.selectOptions(screen.getByRole('combobox'), 'glm-5.3-flash')
    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument())

    // The revert is the contract: what the control shows is what the next turn will resolve.
    expect(screen.getByRole('combobox')).toHaveValue('glm-5.3')
    expect(screen.getByText('Save failed')).toHaveClass('text-red')
    expect(screen.getByText('Save failed')).not.toHaveClass('text-accent')
  })

  it('reverts to the PREVIOUS value even after two changes — the optimistic baseline is the last good save', async () => {
    // Change A succeeds; change B fails. The revert must land on A (the value in the row), not
    // on the original prop — `previous` is captured from state, not from props.
    const user = userEvent.setup()
    saveAction.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false })
    render(<TextModelSelect model="glm-5.3" />)
    const select = screen.getByRole('combobox')

    await user.selectOptions(select, 'glm-5.3-flash')
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())

    await user.selectOptions(select, 'glm-5.3')
    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument())
    expect(select).toHaveValue('glm-5.3-flash')
  })

  // NB: a REJECTED action (the POST itself failing, as opposed to `{ ok: false }`) is not
  // handled by the component — `onChange` has no try/catch, so the status would stay "Saving…"
  // and the rejection would go unhandled. That is a wart worth a follow-up, not behavior to
  // enshrine in a test, so it is deliberately untested here.
})
