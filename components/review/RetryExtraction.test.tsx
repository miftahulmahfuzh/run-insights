// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExtractionBlobRefRow } from '@/lib/db/schema'

import { RetryExtraction } from './RetryExtraction'

/**
 * The least prominent control on the screen, on purpose: a vision call costs ~33 s and real
 * money, and correcting by hand is faster, free and certain — so the component must ask first
 * (inline, not window.confirm), POST exactly what `extractions.blob_urls` already holds (a blob
 * URL is an SSRF primitive if taken on trust, and the route re-validates regardless), and route
 * to the NEW extraction's review screen on success.
 */

const routerPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

const IMAGES: ExtractionBlobRefRow[] = [
  {
    url: 'https://blob.test/summary.png',
    pathname: 'shots/summary.png',
    kind: 'summary',
    width: 739,
    height: 1600,
    bytes: 55_000,
  },
]

function renderRetry(images: ExtractionBlobRefRow[] = IMAGES) {
  render(<RetryExtraction images={images} />)
}

describe('RetryExtraction', () => {
  beforeEach(() => {
    routerPush.mockReset()
    vi.unstubAllGlobals()
  })

  it('is absent when there is nothing to re-read', () => {
    const { container } = render(<RetryExtraction images={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('asks first: a quiet underlined link, not a second UI and not window.confirm', () => {
    renderRetry()

    expect(screen.getByRole('button', { name: 'Read these screenshots again' })).toBeInTheDocument()
    expect(screen.queryByText('Read them again?')).not.toBeInTheDocument()
  })

  it('the inline confirmation states the cost and the better alternative', () => {
    renderRetry()

    fireEvent.click(screen.getByRole('button', { name: 'Read these screenshots again' }))

    expect(screen.getByText('Read them again?')).toBeInTheDocument()
    expect(screen.getByText(/about half a minute, and it may come back with the same answer/))
      .toBeInTheDocument()
    expect(screen.getByText(/correcting it by hand is faster and certain/)).toBeInTheDocument()
  })

  it('Keep these backs out without touching the network', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderRetry()

    fireEvent.click(screen.getByRole('button', { name: 'Read these screenshots again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep these' }))

    expect(screen.queryByText('Read them again?')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Read again POSTs the blob refs verbatim to /api/extract and routes to the new extraction', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ extractionId: 'xnew12345678' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderRetry()

    fireEvent.click(screen.getByRole('button', { name: 'Read these screenshots again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/x/xnew12345678'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/extract')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(init!.body)).toEqual({ images: IMAGES })
  })

  it('while in flight the button names its state and both buttons are disabled', async () => {
    let resolveFetch!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve))),
    )
    renderRetry()

    fireEvent.click(screen.getByRole('button', { name: 'Read these screenshots again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))

    const starting = screen.getByRole('button', { name: 'Starting…' })
    expect(starting).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep these' })).toBeDisabled()

    resolveFetch(
      new Response(JSON.stringify({ extractionId: 'xnew12345678' }), { status: 200 }),
    )
    await waitFor(() => expect(routerPush).toHaveBeenCalled())
  })

  it('a refused start is a message and a re-armed button, not a dead end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })),
    )
    renderRetry()

    fireEvent.click(screen.getByRole('button', { name: 'Read these screenshots again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))

    expect(
      await screen.findByText('That could not be started. Try again in a moment.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Read again' })).toBeEnabled(),
    )
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('a network failure says it is a connection problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    renderRetry()

    fireEvent.click(screen.getByRole('button', { name: 'Read these screenshots again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))

    expect(
      await screen.findByText('That could not be started. Check your connection.'),
    ).toBeInTheDocument()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
