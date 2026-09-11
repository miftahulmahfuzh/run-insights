// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { searchNinaChats } = vi.hoisted(() => ({ searchNinaChats: vi.fn() }))
// The only mock. `lib/nina/search.ts` is pure and unit-tested on its own terms — the floor, the
// debounce lengths, `isDegradedSearch` are all exercised here through the REAL functions, because
// the field's job is measuring and rendering what they decide. Only the Server Action is I/O.
vi.mock('@/lib/nina/searchActions', () => ({ searchNinaChats }))

import { NinaSearchField } from './NinaSearchField'
import {
  NINA_SEMANTIC_PREF_KEY,
  SEARCH_QUERY_MAX_CHARS,
  decodeSemanticPref,
  type NinaSearchHit,
  type NinaSearchResponse,
} from '@/lib/nina/search'

// Real `useSemanticPref` too: it is localStorage-backed and happy-dom ships a store, so the
// toggle's persistence is asserted against the real key — the same one a second tab would read.

function response(overrides?: Partial<NinaSearchResponse>): NinaSearchResponse {
  return { requested: 'text', mode: 'text', hits: [], capped: false, ...overrides }
}

function hit(overrides?: Partial<NinaSearchHit>): NinaSearchHit {
  return {
    kind: 'message',
    sessionId: 'sess-1',
    sessionTitle: 'Sunday long run',
    messageId: 'msg000000001',
    mine: true,
    snippet: '…negative split the last 5k…',
    day: 'Sun, 30 Aug 2026',
    href: '/nina?s=sess-1&at=msg000000001',
    ...overrides,
  }
}

function field() {
  return screen.getByLabelText('Search all chats') as HTMLInputElement
}

/** Real-timer settle for a 250ms text debounce — the test stays under vitest's 5s ceiling. */
function settle(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('NinaSearchField', () => {
  beforeEach(() => {
    searchNinaChats.mockReset()
    searchNinaChats.mockResolvedValue(response())
    window.localStorage.clear()
  })

  it('renders the field as a text input at the SQL cap, named for VoiceOver', () => {
    render(<NinaSearchField />)
    const input = field()
    // `type="text"`, not `type="search"`: the ✕ below is the ONE clear affordance, so Safari's
    // native glyph must not appear — assert the type that keeps it away.
    expect(input.getAttribute('type')).toBe('text')
    expect(input.getAttribute('maxlength')).toBe(String(SEARCH_QUERY_MAX_CHARS))
    expect(input.getAttribute('enterkeyhint')).toBe('search')
  })

  it('below the two-character floor nothing runs and nothing announces itself', async () => {
    const user = userEvent.setup()
    render(<NinaSearchField />)
    await user.type(field(), 'r')
    await settle(300)
    expect(searchNinaChats).not.toHaveBeenCalled()
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument()
  })

  it('a text query searches after the debounce and renders the hits', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(response({ hits: [hit()] }))
    render(<NinaSearchField />)

    await user.type(field(), 'split')
    // One continuous "searching" from the keystroke to the answer — the debounce window shows it
    // too, not just the call itself.
    expect(await screen.findByText('Searching…')).toBeInTheDocument()
    await waitFor(() => expect(searchNinaChats).toHaveBeenCalledTimes(1))
    expect(searchNinaChats).toHaveBeenCalledWith({ query: 'split', semantic: false })
    expect(await screen.findByText('…negative split the last 5k…')).toBeInTheDocument()
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/nina?s=sess-1&at=msg000000001')
  })

  it('a message hit names its speaker, and a session hit does not', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(
      response({
        hits: [
          hit({ mine: true }),
          hit({ messageId: 'msg000000002', mine: false, snippet: '…hers…' }),
          hit({ kind: 'session', messageId: null, snippet: 'Sunday long run', href: '/nina?s=sess-1' }),
        ],
      }),
    )
    render(<NinaSearchField />)

    await user.type(field(), 'run')
    expect(await screen.findByText('You:')).toBeInTheDocument()
    expect(screen.getByText('Nina:')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.length).toBe(3)
    expect(links[2]?.getAttribute('href')).toBe('/nina?s=sess-1')
    // A session hit names no message, so it carries no day to render.
    expect(screen.getAllByText('Sun, 30 Aug 2026').length).toBeGreaterThanOrEqual(2)
  })

  it('the AI switch announces on/off with a switch, and persists through the real key', async () => {
    const user = userEvent.setup()
    render(<NinaSearchField />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    // "Persist across app usage": the stored value must decode back to ON — the encoding itself
    // belongs to lib/nina/search's own tests, so round-trip instead of hardcoding a spelling.
    const stored = window.localStorage.getItem(NINA_SEMANTIC_PREF_KEY)
    expect(stored).not.toBeNull()
    expect(decodeSemanticPref(stored)).toBe(true)

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem(NINA_SEMANTIC_PREF_KEY)).toBeNull()
  })

  it('with the switch on, the debounce is the model one and the copy says so', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(
      response({ requested: 'semantic', mode: 'semantic', hits: [hit()] }),
    )
    render(<NinaSearchField />)

    await user.click(screen.getByRole('switch'))
    await user.type(field(), 'tempo')
    expect(await screen.findByText('Reading through your chats…')).toBeInTheDocument()
    await waitFor(
      () => expect(searchNinaChats).toHaveBeenCalledWith({ query: 'tempo', semantic: true }),
      { timeout: 2500 },
    )
    expect(await screen.findByText('…negative split the last 5k…')).toBeInTheDocument()
    // A semantic answer that really ran semantic is not degraded — no notice.
    expect(screen.queryByText(/Semantic ranking is unavailable/)).not.toBeInTheDocument()
  })

  it('a degraded answer says so out loud, announced politely', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(response({ requested: 'semantic', mode: 'text' }))
    render(<NinaSearchField />)

    await user.click(screen.getByRole('switch'))
    await user.type(field(), 'tempo')
    // Silent fallback would let an empty list read as "your chats do not contain this" — a false
    // claim about the runner's own history. The notice is the fix, and aria-live is its voice.
    const notice = await screen.findByText(/Semantic ranking is unavailable/)
    expect(notice.getAttribute('aria-live')).toBe('polite')
  })

  it('no matches says "No matches." instead of pretending nothing happened', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(response({ hits: [] }))
    render(<NinaSearchField />)

    await user.type(field(), 'zzz')
    expect(await screen.findByText('No matches.')).toBeInTheDocument()
  })

  it('a capped response says the corpus was cut', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(response({ hits: [hit()], capped: true }))
    render(<NinaSearchField />)

    await user.type(field(), 'run')
    expect(
      await screen.findByText('Showing the most recent matches — narrow the search to see older ones.'),
    ).toBeInTheDocument()
  })

  it('the ✕ exists only once there is text to clear', async () => {
    const user = userEvent.setup()
    render(<NinaSearchField />)
    expect(screen.queryByRole('button', { name: 'Hapus pencarian' })).not.toBeInTheDocument()

    await user.type(field(), 'run')
    expect(screen.getByRole('button', { name: 'Hapus pencarian' })).toBeInTheDocument()
  })

  it('one ✕ tap clears the query AND the results, and the keyboard stays up', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockResolvedValue(response({ hits: [hit()] }))
    render(<NinaSearchField />)

    await user.type(field(), 'run')
    await screen.findByText('…negative split the last 5k…')

    await user.click(screen.getByRole('button', { name: 'Hapus pencarian' }))
    expect(field().value).toBe('')
    expect(screen.queryByText('…negative split the last 5k…')).not.toBeInTheDocument()
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument()
    // The two halves of the owner's ask as ONE tap: the pointerdown is cancelled, so focus —
    // and on iOS, the keyboard over it — never leaves the field.
    expect(field()).toHaveFocus()
  })

  it('Enter folds the keyboard; an IME’s composing Enter does not', () => {
    render(<NinaSearchField />)
    const input = field()
    input.focus()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).not.toHaveFocus()

    input.focus()
    // An IME's Enter commits a candidate — it must not fold the keyboard mid-word.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(input).toHaveFocus()
  })

  it('the slow answer to an earlier query can never overwrite a fresh one', async () => {
    const user = userEvent.setup()
    let resolveSlow: (value: NinaSearchResponse) => void = () => {}
    const slow = new Promise<NinaSearchResponse>((res) => (resolveSlow = res))
    searchNinaChats.mockImplementationOnce(() => slow)
    searchNinaChats.mockImplementationOnce(() =>
      Promise.resolve(
        response({ hits: [hit({ snippet: '…fresh answer…', href: '/nina?s=sess-1&at=msg000000002' })] }),
      ),
    )
    render(<NinaSearchField />)

    await user.type(field(), 'ru')
    await waitFor(() => expect(searchNinaChats).toHaveBeenCalledTimes(1))
    // Keep typing: the new keystroke bumps the request id, so the slow answer is already orphaned.
    await user.type(field(), 'n')
    expect(await screen.findByText('…fresh answer…')).toBeInTheDocument()

    resolveSlow(response({ hits: [hit({ snippet: '…stale answer…' })] }))
    await settle(50)
    expect(screen.queryByText('…stale answer…')).not.toBeInTheDocument()
    expect(screen.getByText('…fresh answer…')).toBeInTheDocument()
  })

  it('a failed action settles the field back to quiet instead of spinning forever', async () => {
    const user = userEvent.setup()
    searchNinaChats.mockRejectedValueOnce(new Error('transport down'))
    render(<NinaSearchField />)

    await user.type(field(), 'run')
    await waitFor(() => expect(searchNinaChats).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Searching…')).not.toBeInTheDocument())
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument()
  })
})
