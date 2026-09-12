// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SHOT_REQUEST_PATHNAME_RE, TYPICAL_EXTRACTION_SECONDS } from '@/lib/extract/constants'

import { UploadPicker } from './UploadPicker'

/**
 * `/upload`, end to end, in the states a runner actually sees. The DECISIONS behind the flow are
 * proved in lib (`tests/extract.planPicked.test.ts` for room/rejections/kind defaults,
 * `tests/extract.reassignKind.test.ts` for the swap) and structurally in
 * `tests/extract.onPickPurity.test.ts`; what nothing proved until now is that the component
 * EXECUTES them: that a pick compresses then PUTs with our pathname contract, that every state is
 * visible, that a swap re-uploads both tiles from the original bytes, that a superseded upload's
 * result can never clobber its successor — the provenance race F04 measured in production — that
 * submit POSTs exactly the finished blob refs and routes on 202, and that failures read as
 * messages, not dead ends.
 *
 * Only true externals are mocked: the Blob client upload, the router, and the compressor (canvas
 * does not exist in happy-dom). `planPicked`, `reassignKind`, `rejectionReason` and `newId` run
 * for real — mocking them would re-implement the thing under test inside the mock.
 */

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ upload }))

const { compressForExtraction } = vi.hoisted(() => ({ compressForExtraction: vi.fn() }))
vi.mock('@/lib/photos/compressForExtraction', () => ({ compressForExtraction }))

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

/* ── fixtures ─────────────────────────────────────────────────────────────────────────────── */

interface Shot {
  file: File
  width: number
  height: number
  compressedBytes: number
}
interface Uploaded {
  url: string
  pathname: string
}

const shot: Shot = {
  file: new File([new Uint8Array(1000)], 'compressed.jpg', { type: 'image/jpeg' }),
  width: 560,
  height: 1214,
  compressedBytes: 55_000,
}

function png(name = 'hr.png') {
  return new File([new Uint8Array(2000)], name, { type: 'image/png' })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Each call to the compressor hangs until its gate is resolved; gates return in call order. */
function gateCompress() {
  const gates: Array<ReturnType<typeof deferred<Shot>>> = []
  compressForExtraction.mockImplementation(() => {
    const gate = deferred<Shot>()
    gates.push(gate)
    return gate.promise
  })
  return gates
}

/** Same for the Blob PUT. */
function gateUpload() {
  const gates: Array<ReturnType<typeof deferred<Uploaded>>> = []
  upload.mockImplementation((pathname: string) => {
    const gate = deferred<Uploaded>()
    gates.push(gate)
    return gate.promise
  })
  return gates
}

const uploadedAt = (pathname: string): Uploaded => ({
  url: `https://cblob.test/${pathname}`,
  pathname,
})

/* ── helpers ──────────────────────────────────────────────────────────────────────────────── */

function renderPicker() {
  return render(<UploadPicker />)
}

const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement

const pick = (container: HTMLElement, files: File[]) =>
  fireEvent.change(fileInput(container), { target: { files } })

/** Flush every pending compress/upload microtask chain. */
const flush = () => act(async () => {})

const groups = () => screen.getAllByRole('radiogroup')
const radioOf = (group: HTMLElement, label: string) =>
  within(group).getByRole('radio', { name: label })

beforeEach(() => {
  compressForExtraction.mockResolvedValue(shot)
  upload.mockImplementation(async (pathname: string) => uploadedAt(pathname))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('UploadPicker — the empty page', () => {
  it('offers the picker, and nothing else — no progress chrome before anything is picked', () => {
    renderPicker()

    expect(screen.getByText('Pick your screenshots')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose images' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Read this run' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('Choose images opens the hidden file input', () => {
    const { container } = renderPicker()
    const click = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'Choose images' }))

    expect(click).toHaveBeenCalledWith()
    expect(fileInput(container)).toBeInTheDocument()
  })
})

describe('UploadPicker — a pick becomes a tile', () => {
  it('walks the visible states: Resizing, Uploading, Ready · 55 KB', async () => {
    // Both stages gated: the auto-resolving mocks would run the whole chain inside one flush and
    // the intermediate states would never be observable.
    const compressGates = gateCompress()
    const uploadGates = gateUpload()
    const { container } = renderPicker()

    pick(container, [png()])
    expect(await screen.findByText('Resizing')).toBeInTheDocument()
    // The submit button is present from the first tile on, but gated until every PUT lands —
    // asserted in the “Read this run” suite below.

    compressGates[0]!.resolve(shot)
    await flush()
    expect(screen.getByText('Uploading')).toBeInTheDocument()

    uploadGates[0]!.resolve(uploadedAt('shots/walk.jpg'))
    await flush()
    expect(screen.getByText('Ready · 55 KB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read this run' })).toBeEnabled()
  })

  it('PUTs to the Blob client under our pathname contract, with the declared kind inside the signed payload', async () => {
    const { container } = renderPicker()
    pick(container, [png()])
    await flush()
    await flush()

    expect(upload).toHaveBeenCalledTimes(1)
    const [pathname, file, options] = upload.mock.calls[0]!
    expect(pathname).toMatch(SHOT_REQUEST_PATHNAME_RE)
    expect(file).toBeTruthy()
    expect(options).toMatchObject({
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({ kind: 'heartrate' }),
    })
  })

  it('defaults the first tile to Heart rate — F29’s device order, not the Fitness app order', async () => {
    const { container } = renderPicker()
    pick(container, [png()])
    await flush()

    expect(radioOf(groups()[0]!, 'Heart rate')).toBeChecked()
  })

  it('gives a two-screen pick distinct defaults in device order, and still offers a third', async () => {
    const { container } = renderPicker()
    pick(container, [png('a.png'), png('b.png')])
    await flush()
    await flush()

    expect(radioOf(groups()[0]!, 'Heart rate')).toBeChecked()
    expect(radioOf(groups()[1]!, 'Splits')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Add another screen' })).toBeEnabled()
  })
})

describe('UploadPicker — the three-screen cap', () => {
  async function fullPage() {
    const { container } = renderPicker()
    pick(container, [png('a.png'), png('b.png'), png('c.png')])
    await flush()
    await flush()
    expect(groups()).toHaveLength(3)
    return container
  }

  it('hides “Add another screen” once three tiles are up', async () => {
    await fullPage()

    expect(screen.queryByRole('button', { name: 'Add another screen' })).not.toBeInTheDocument()
  })

  it('answers a fourth pick with the cap, through the real planPicked, and uploads nothing new', async () => {
    const container = await fullPage()

    pick(container, [png('d.png')])

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Three screenshots is the most one run can have.',
    )
    expect(upload).toHaveBeenCalledTimes(3)
  })
})

describe('UploadPicker — fixing a mislabel swaps instead of subtracting', () => {
  async function twoReadyTiles() {
    const { container } = renderPicker()
    pick(container, [png('a.png'), png('b.png')])
    await flush()
    await flush()
    expect(screen.getAllByText('Ready · 55 KB')).toHaveLength(2)
    return container
  }

  it('re-uploads only the tile whose kind was free', async () => {
    await twoReadyTiles()

    // Summary is free — nobody holds it — so only tile 1 redoes. Tile 2 keeps its upload.
    fireEvent.click(radioOf(groups()[0]!, 'Summary'))
    await flush()
    await flush()
    await flush()

    expect(upload).toHaveBeenCalledTimes(3) // two initial PUTs + tile 1's redo
    expect(radioOf(groups()[0]!, 'Summary')).toBeChecked()
    expect(radioOf(groups()[1]!, 'Splits')).toBeChecked()
  })

  it('swaps a held kind: both tiles redo from the original bytes and the labels exchange', async () => {
    await twoReadyTiles()

    // Tile 1 asks for Splits, which tile 2 holds → the two exchange, both re-PUT.
    fireEvent.click(radioOf(groups()[0]!, 'Splits'))
    await flush()
    await flush()
    await flush()

    expect(upload).toHaveBeenCalledTimes(4) // two initial PUTs + two redos
    expect(radioOf(groups()[0]!, 'Splits')).toBeChecked()
    expect(radioOf(groups()[1]!, 'Heart rate')).toBeChecked()
  })
})

describe('UploadPicker — the provenance race', () => {
  it('a superseded PUT’s result is dropped; only the current generation can make a tile ready', async () => {
    // Both gates before the pick, so NEITHER PUT can slip past unresolved.
    const compressGates = gateCompress()
    const uploadGates = gateUpload()
    const { container } = renderPicker()
    pick(container, [png()])
    await flush()
    compressGates[0]!.resolve(shot)
    await flush()
    expect(screen.getByText('Uploading')).toBeInTheDocument() // PUT 1 (gen 0) held in flight

    // While the first PUT is in flight, retake the kind. Generation bumps 0 → 1.
    fireEvent.click(radioOf(groups()[0]!, 'Summary'))
    await flush()
    expect(screen.getByText('Resizing')).toBeInTheDocument() // the redo compresses from the original bytes

    compressGates[1]!.resolve(shot)
    await flush()
    expect(screen.getByText('Uploading')).toBeInTheDocument()

    // The STALE upload (gen 0, kind Heart rate) lands first. It must write nothing.
    uploadGates[0]!.resolve(uploadedAt('shots/stalegen0.jpg'))
    await flush()
    expect(screen.queryByText(/Ready/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read this run' })).toBeDisabled()

    // The current generation's PUT lands: the tile goes ready on ITS result.
    uploadGates[1]!.resolve(uploadedAt('shots/currentgen1.jpg'))
    await flush()
    expect(screen.getByText('Ready · 55 KB')).toBeInTheDocument()
    expect(radioOf(groups()[0]!, 'Summary')).toBeChecked()

    // And the blob that survives into submission is gen 1's — never the stale kind.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ extractionId: 'ext000000009' }), { status: 202 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    fireEvent.click(screen.getByRole('button', { name: 'Read this run' }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/x/ext000000009'))
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body)
    expect(body.images).toHaveLength(1)
    expect(body.images[0]).toMatchObject({
      pathname: 'shots/currentgen1.jpg',
      kind: 'summary',
    })
  })
})

describe('UploadPicker — a pick can fail', () => {
  it('a failed PUT names the problem on the tile and holds “Read this run” back', async () => {
    upload.mockRejectedValue(new Error('Blob store unreachable'))
    const { container } = renderPicker()
    pick(container, [png()])
    await flush()
    await flush()

    expect(screen.getByRole('alert')).toHaveTextContent('Blob store unreachable')
    expect(screen.getByRole('button', { name: 'Read this run' })).toBeDisabled()
    expect(screen.getByText('Waiting for the uploads to finish.')).toBeInTheDocument()
  })

  it('a compression failure reads the same way, and never reaches the Blob client', async () => {
    compressForExtraction.mockRejectedValue(new Error('canvas unavailable'))
    const { container } = renderPicker()
    pick(container, [png()])
    await flush()
    await flush()

    expect(screen.getByRole('alert')).toHaveTextContent('canvas unavailable')
    expect(upload).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Read this run' })).toBeDisabled()
  })

  it('a rejected file is explained, and the good tile beside it still finishes', async () => {
    const { container } = renderPicker()
    pick(container, [png('good.png'), new File(['x'], 'notes.txt', { type: 'text/plain' })])
    await flush()
    await flush()

    expect(screen.getByRole('alert')).toHaveTextContent('“notes.txt” is not an image.')
    expect(groups()).toHaveLength(1)
    expect(screen.getByText('Ready · 55 KB')).toBeInTheDocument()
  })
})

describe('UploadPicker — removing a tile', () => {
  it('drops the tile, clears any message, and returns to the empty page when the last one goes', async () => {
    const { container } = renderPicker()
    pick(container, [png()])
    await flush()
    await flush()

    // Trip the form error first, so Remove is proven to clear it.
    pick(container, [new File(['x'], 'notes.txt', { type: 'text/plain' })])
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(screen.getByText('Pick your screenshots')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read this run' })).not.toBeInTheDocument()
  })
})

describe('UploadPicker — “Read this run”', () => {
  async function readyPicker(container: HTMLElement) {
    pick(container, [png('a.png'), png('b.png')])
    await flush()
    await flush()
    expect(screen.getAllByText('Ready · 55 KB')).toHaveLength(2)
  }

  it('waits for every upload, then states what is being read and how long it takes', async () => {
    const compressGates = gateCompress()
    const { container } = renderPicker()
    pick(container, [png('a.png'), png('b.png')])

    // Tile 1 finishes; tile 2 is still compressing. The button must wait.
    compressGates[0]!.resolve(shot)
    await flush()
    expect(screen.getByText('Waiting for the uploads to finish.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read this run' })).toBeDisabled()

    compressGates[1]!.resolve(shot)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Read this run' })).toBeEnabled())
    expect(
      screen.getByText(
        `Heart rate · Splits — reading all 2 in one pass takes about ${TYPICAL_EXTRACTION_SECONDS} seconds.`,
      ),
    ).toBeInTheDocument()
  })

  it('POSTs the finished blob refs in tile order and routes to the reading screen', async () => {
    const { container } = renderPicker()
    await readyPicker(container)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ extractionId: 'ext000000009' }), { status: 202 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.click(screen.getByRole('button', { name: 'Read this run' }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/x/ext000000009'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/extract')
    expect(init).toMatchObject({ method: 'POST' })
    const body = JSON.parse(init!.body)
    expect(body.images).toHaveLength(2)
    expect(body.images[0]).toEqual({
      url: `https://cblob.test/${upload.mock.calls[0]![0]}`,
      pathname: upload.mock.calls[0]![0],
      kind: 'heartrate',
      width: 560,
      height: 1214,
      bytes: 55_000,
    })
    expect(body.images[1]!.kind).toBe('splits')
  })

  it('a refused start shows the server’s message and re-arms the button', async () => {
    const { container } = renderPicker()
    await readyPicker(container)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }),
        ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Read this run' }))

    expect(await screen.findByText('rate limited')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Read this run' })).toBeEnabled())
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('a refusal with no JSON body still names the status', async () => {
    const { container } = renderPicker()
    await readyPicker(container)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))

    fireEvent.click(screen.getByRole('button', { name: 'Read this run' }))

    expect(await screen.findByText('The server refused this (500).')).toBeInTheDocument()
  })
})

describe('UploadPicker — the once-only guarantees', () => {
  it('under StrictMode a pick uploads exactly once — the F17 defect, run for real', async () => {
    render(
      <StrictMode>
        <UploadPicker />
      </StrictMode>,
    )
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [png()] } })
    await flush()
    await flush()

    expect(upload).toHaveBeenCalledTimes(1)
    expect(groups()).toHaveLength(1)
    expect(screen.getByText('Ready · 55 KB')).toBeInTheDocument()
  })

  it('unmount revokes every preview URL — object URLs are a manual-lifetime resource', async () => {
    const { container, unmount } = renderPicker()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    pick(container, [png('a.png'), png('b.png')])
    await flush()
    await flush()

    expect(revoke).not.toHaveBeenCalled()
    unmount()
    expect(revoke).toHaveBeenCalledTimes(2)
  })
})
