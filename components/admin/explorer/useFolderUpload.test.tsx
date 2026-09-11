// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EXPLORER_REGISTER_CHUNK, useFolderUpload } from './useFolderUpload'
import { upload } from '@vercel/blob/client'
import {
  listNinaAlbumManifestAction,
  registerNinaAvatarsAction,
} from '@/lib/admin/ninaAlbumActions'
import { sourceKeyFor } from '@/lib/admin/filetree'
import type { WalkedFile } from './dropWalk'

/*
 * The last major uncovered piece of the explorer subsystem, and the reason this session exists.
 * Four seams are mocked — the Blob client's `upload`, the thumbnail decoder, the drop walker, and
 * the two Server Actions — and everything between them is REAL: the phase machine, the pure plan
 * (with its dedupe keys, refusals and report counts), the four-lane runner, the chunked register
 * flush, the gesture guard and the busy-while-dismiss rule. `sourceKeyFor` is imported so the
 * "already here" fixtures compute the SAME dedupe key the plan computes — no second spelling.
 */
vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }))
vi.mock('./thumbnail', () => ({
  measureAndThumbnail: vi.fn(),
  EXPLORER_THUMB_CONTENT_TYPE: 'image/jpeg',
}))
vi.mock('./dropWalk', () => ({ walkEntries: vi.fn() }))
vi.mock('@/lib/admin/ninaAlbumActions', () => ({
  listNinaAlbumManifestAction: vi.fn(),
  registerNinaAvatarsAction: vi.fn(),
}))

const uploadMock = vi.mocked(upload)
const measureMock = vi.mocked(await import('./thumbnail')).measureAndThumbnail
const walkMock = vi.mocked(await import('./dropWalk')).walkEntries
const manifestMock = vi.mocked(listNinaAlbumManifestAction)
const registerMock = vi.mocked(registerNinaAvatarsAction)

/** `PutBlobResult` is not exported from the client package; capture it off the function instead. */
type PutResult = Awaited<ReturnType<typeof upload>>
function putResult(
  url = 'https://blob.example/original',
  pathname = 'nina/avatar-x.jpg',
): PutResult {
  return {
    url,
    pathname,
    downloadUrl: url,
    contentType: 'image/jpeg',
    contentDisposition: 'attachment; filename="x.jpg"',
    etag: 'etag',
  }
}

function gate<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function walkedFile(relativePath: string, overrides?: Partial<WalkedFile>): WalkedFile {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    type: 'image/jpeg',
    size: 1000,
    lastModified: 1_726_000_000_000,
    file: { size: 1000 } as unknown as File,
    ...overrides,
  }
}

/** The manifest entry that makes `planFolderUpload` consider a walked file already uploaded. */
function existingEntryFor(file: WalkedFile, folder: string) {
  return {
    sourceKey: sourceKeyFor({
      folder: `${folder}/${file.relativePath.split('/').slice(0, -1).join('/')}`,
      filename: file.name.toLowerCase(),
      size: file.size,
      lastModified: file.lastModified,
    }),
  }
}

function measureOk() {
  return { width: 1000, height: 800, thumb: null }
}

function makeHook(onFinished = vi.fn()) {
  const view = renderHook(() => useFolderUpload({ userId: 'u1', destination: '2026', onFinished }))
  return { ...view, onFinished }
}

/** Drive the gesture up to `planning` with the manifest gated, so callers decide what it holds. */
async function startToPlanning(files: readonly WalkedFile[]) {
  const manifestGate = gate<{
    ok: true
    entries: Array<{ sourceKey: string }>
    truncated?: boolean
  }>()
  manifestMock.mockReturnValue(manifestGate.promise as never)
  const { result } = makeHook()
  await act(async () => {
    result.current.start(files)
  })
  expect(result.current.phase).toBe('planning')
  return { result, manifestGate }
}

beforeEach(() => {
  vi.clearAllMocks()
  uploadMock.mockResolvedValue(putResult())
  measureMock.mockResolvedValue(measureOk())
  manifestMock.mockResolvedValue({ ok: true, entries: [], truncated: false })
  registerMock.mockResolvedValue({ ok: true, inserted: [], skipped: 0 })
})

describe('useFolderUpload — the gesture’s decisions before any byte moves', () => {
  it('starts idle and stays untouched until a gesture', () => {
    const { result } = makeHook()
    expect(result.current.phase).toBe('idle')
    expect(result.current.items).toEqual([])
    expect(result.current.report).toBeNull()
    expect(result.current.error).toBeNull()
    expect(manifestMock).not.toHaveBeenCalled()
  })

  it('reports an empty drop as finished with the picker suggestion, never reading the manifest', async () => {
    const { result } = makeHook()
    await act(async () => {
      result.current.start([])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.error).toBe(
      'Nothing readable in that drop. Try the folder picker instead.',
    )
    expect(manifestMock).not.toHaveBeenCalled()
  })

  it('startWalk runs the same gesture from the drop walker’s output', async () => {
    // The drop path differs only in WHERE the walked files come from: the walk happens inside.
    walkMock.mockResolvedValue([walkedFile('bali/dropped.jpg')])
    const { result } = makeHook()
    await act(async () => {
      result.current.startWalk([] as unknown as readonly FileSystemEntry[])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(walkMock).toHaveBeenCalledTimes(1)
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]!.filename).toBe('dropped.jpg')
  })

  it('plans against the destination subtree and shows the diff before uploading', async () => {
    const files = [
      walkedFile('bali/DSC_1.jpg'),
      walkedFile('bali/DSC_2.png', { type: 'image/png' }),
    ]
    // Gate the PUTs before the start so the queue can be observed standing still in 'uploading'.
    const putGate = gate<PutResult>()
    uploadMock.mockReturnValue(putGate.promise)
    const { result, manifestGate } = await startToPlanning(files)

    await act(async () => {
      manifestGate.resolve({ ok: true, entries: [], truncated: false })
    })
    await waitFor(() => expect(result.current.phase).toBe('uploading'))

    // The manifest was read for the DESTINATION, not the whole album.
    expect(manifestMock).toHaveBeenCalledWith({ folder: '2026' })
    // Items carry the album path — destination joined per the plan. (The lanes may already have
    // moved the state past 'waiting' by the time this runs; the PLAN is what is pinned here.)
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0]).toMatchObject({
      path: '2026/bali/DSC_1.jpg',
      folder: '2026/bali',
      filename: 'DSC_1.jpg',
      error: null,
    })
    expect(result.current.report).toEqual({ already: 0, rejected: 0, refused: [], found: 2 })

    await act(async () => {
      putGate.resolve(putResult('https://blob.example/original', 'nina/a.jpg'))
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
  })

  it('dedupes against the manifest through the SAME source key the plan computes', async () => {
    const file = walkedFile('bali/DSC_1.jpg')
    const { result, manifestGate } = await startToPlanning([file])

    await act(async () => {
      manifestGate.resolve({
        ok: true,
        entries: [existingEntryFor(file, '2026')],
        truncated: false,
      })
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))

    expect(result.current.report?.already).toBe(1)
    expect(result.current.items).toHaveLength(0)
    expect(result.current.error).toBeNull()
    expect(uploadMock).not.toHaveBeenCalled()
    expect(registerMock).not.toHaveBeenCalled()
    // "Nothing new" finishes cleanly — no onFinished-less dead end.
    expect(result.current.error).toBeNull()
  })

  it('lists refused files in the report and keeps them out of the queue', async () => {
    const files = [
      walkedFile('bali/big.jpg', {
        size: 9 * 1024 * 1024,
        file: { size: 9 * 1024 * 1024 } as unknown as File,
      }),
      walkedFile('bali/ok.jpg'),
    ]
    const putGate = gate<PutResult>()
    uploadMock.mockReturnValue(putGate.promise)
    const { result, manifestGate } = await startToPlanning(files)
    await act(async () => {
      manifestGate.resolve({ ok: true, entries: [], truncated: false })
    })
    await waitFor(() => expect(result.current.phase).toBe('uploading'))

    expect(result.current.report?.refused).toEqual([{ name: 'big.jpg', reason: 'too_large' }])
    expect(result.current.report?.rejected).toBe(0)
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]!.filename).toBe('ok.jpg')

    await act(async () => {
      putGate.resolve(putResult('https://blob.example/original', 'nina/a.jpg'))
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
  })

  it('survives a truncated manifest: warns honestly and keeps going', async () => {
    const { result, manifestGate } = await startToPlanning([walkedFile('bali/DSC_1.jpg')])
    await act(async () => {
      manifestGate.resolve({ ok: true, entries: [], truncated: true })
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.error).toBe(
      'This folder is large enough that some already-uploaded files may upload again.',
    )
    expect(result.current.items).toHaveLength(1)
    expect(uploadMock).toHaveBeenCalled()
  })

  it('fails finished — not stuck — when the manifest read refuses', async () => {
    manifestMock.mockResolvedValue({ ok: false, error: 'The album could not be read.' })
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.error).toBe('The album could not be read.')
    expect(uploadMock).not.toHaveBeenCalled()
  })
})

describe('useFolderUpload — one file through the lanes', () => {
  it('walks waiting -> thumbnailing -> uploading -> registering -> done, then finishes once', async () => {
    const measureGate = gate<ReturnType<typeof measureOk>>()
    const putGate = gate<PutResult>()
    const registerGate = gate<{ ok: true; inserted: never[]; skipped: number }>()
    measureMock.mockReturnValue(measureGate.promise)
    uploadMock.mockReturnValue(putGate.promise)
    registerMock.mockReturnValue(registerGate.promise)

    const { result, onFinished } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    // Manifest resolves immediately; the measure gate parks the file in 'thumbnailing'.
    await waitFor(() => expect(result.current.items[0]?.state).toBe('thumbnailing'))

    await act(async () => {
      measureGate.resolve(measureOk())
    })
    await waitFor(() => expect(result.current.items[0]?.state).toBe('uploading'))

    await act(async () => {
      putGate.resolve(putResult('https://blob.example/original', 'nina/a.jpg'))
    })
    // The record waits in the pending buffer only until the register call answers.
    await waitFor(() => expect(result.current.items[0]?.state).toBe('registering'))

    await act(async () => {
      registerGate.resolve({ ok: true, inserted: [], skipped: 0 })
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.items[0]?.state).toBe('done')
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('PUTs the original to the admin handle with the plan’s content type', async () => {
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_2.png', { type: 'image/png' })])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    const [pathname, file, options] = uploadMock.mock.calls[0]!
    expect(String(pathname)).toMatch(/avatar-.+\.png$/) // adminAvatarPathname, ext from content type
    expect(file).toBeDefined() // the caller's own File object rides the plan straight through
    expect(options).toMatchObject({ access: 'public', contentType: 'image/png' })
    expect((options as { handleUploadUrl: string }).handleUploadUrl).toBe('/api/admin/nina/upload')
  })

  it('registers in the envelope shape, thumbnail-less when the decode produced none', async () => {
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(registerMock).toHaveBeenCalledTimes(1)
    const arg = registerMock.mock.calls[0]![0] as { records: Array<Record<string, unknown>> }
    expect(Object.keys(arg)).toEqual(['records'])
    expect(arg.records).toHaveLength(1)
    expect(arg.records[0]).toMatchObject({
      blobUrl: 'https://blob.example/original',
      contentType: 'image/jpeg',
      width: 1000,
      height: 800,
      bytes: 1000,
      folder: '2026/bali',
      filename: 'DSC_1.jpg',
      thumb: null,
    })
  })

  it('a decode failure marks only THAT item and the lane moves on', async () => {
    measureMock.mockImplementation((file: File) =>
      (file as unknown as { size: number }).size === 1000
        ? Promise.reject(new Error('bad frame'))
        : Promise.resolve(measureOk()),
    )
    const { result } = makeHook()
    await act(async () => {
      result.current.start([
        walkedFile('bali/bad.jpg'),
        walkedFile('bali/good.jpg', { size: 2000, file: { size: 2000 } as unknown as File }),
      ])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    const bad = result.current.items.find((i) => i.filename === 'bad.jpg')
    const good = result.current.items.find((i) => i.filename === 'good.jpg')
    expect(bad).toMatchObject({ state: 'error', error: 'That file did not decode as an image.' })
    expect(good).toMatchObject({ state: 'done' })
    expect(registerMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a too-small image with the short edge named, after the decode', async () => {
    measureMock.mockResolvedValue({ width: 1000, height: 100, thumb: null })
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/tiny.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.items[0]).toMatchObject({
      state: 'error',
      error: 'Too small to frame — the short edge is 100 px.',
    })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('a failed PUT names its cause on the item and never reaches registration', async () => {
    uploadMock.mockRejectedValue(new Error('blob 507'))
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.items[0]).toMatchObject({ state: 'error', error: 'blob 507' })
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('a failed THUMBNAIL upload is not a failed upload: the record registers with thumb null', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    uploadMock.mockImplementation((pathname: string) =>
      String(pathname).includes('thumb')
        ? Promise.reject(new Error('thumb 500'))
        : Promise.resolve(putResult('https://blob.example/o', 'nina/a.jpg')),
    )
    measureMock.mockResolvedValue({ width: 1000, height: 800, thumb: { size: 10 } as File })
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.items[0]?.state).toBe('done')
    const arg = registerMock.mock.calls[0]![0] as { records: Array<{ thumb: unknown }> }
    expect(arg.records[0]!.thumb).toBeNull()
    expect(consoleWarn).toHaveBeenCalled()
    consoleWarn.mockRestore()
  })
})

describe('useFolderUpload — the batch mechanics', () => {
  it('never exceeds four concurrent PUTs', async () => {
    const putGate = gate<PutResult>()
    uploadMock.mockReturnValue(putGate.promise)
    const { result } = makeHook()
    await act(async () => {
      result.current.start(Array.from({ length: 10 }, (_, i) => walkedFile(`bali/f${i}.jpg`)))
    })
    await waitFor(() => expect(result.current.phase).toBe('uploading'))
    // All ten lanes that ever ran are gated on ONE promise, so every PUT has started... unless
    // the lane bound holds. Give the loop a beat, then assert the count is EXACTLY four.
    await act(async () => {})
    expect(uploadMock).toHaveBeenCalledTimes(4)

    await act(async () => {
      putGate.resolve(putResult('https://blob.example/o', 'nina/a.jpg'))
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(uploadMock).toHaveBeenCalledTimes(10)
  })

  it(`flushes register chunks at ${50} records and force-flushes the tail`, async () => {
    registerMock.mockResolvedValue({ ok: true, inserted: [], skipped: 0 })
    const { result } = makeHook()
    const files = Array.from({ length: EXPLORER_REGISTER_CHUNK + 1 }, (_, i) =>
      walkedFile(`bali/f${i}.jpg`),
    )
    await act(async () => {
      result.current.start(files)
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    // The 50th completion flushes a full chunk; the 51st is force-flushed after the lanes drain.
    expect(registerMock).toHaveBeenCalledTimes(2)
    const first = registerMock.mock.calls[0]![0] as { records: unknown[] }
    const tail = registerMock.mock.calls[1]![0] as { records: unknown[] }
    expect(first.records).toHaveLength(EXPLORER_REGISTER_CHUNK)
    expect(tail.records).toHaveLength(1)
    // Every item ended done — a chunked failure would have left errors behind.
    expect(result.current.items.every((i) => i.state === 'done')).toBe(true)
  })

  it('a refused chunk marks its records with the server’s sentence', async () => {
    registerMock.mockResolvedValue({ ok: false, error: 'The server refused this batch.' })
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    expect(result.current.items[0]).toMatchObject({
      state: 'error',
      error: 'The server refused this batch.',
    })
  })
})

describe('useFolderUpload — the guards', () => {
  it('ignores a second gesture while one is live, and the dismissed gesture writes nothing', async () => {
    const manifestGate = gate<{ ok: true; entries: never[]; truncated?: boolean }>()
    manifestMock.mockReturnValue(manifestGate.promise as never)
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/one.jpg')])
    })
    expect(result.current.phase).toBe('planning')

    // A second start() while busy is a no-op.
    await act(async () => {
      result.current.start([walkedFile('bali/two.jpg')])
    })
    expect(manifestMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      manifestGate.resolve({ ok: true, entries: [], truncated: false })
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))
    // Only the first gesture's file exists.
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]!.filename).toBe('one.jpg')
  })

  it('refuses to dismiss while the queue is busy, and clears cleanly once idle', async () => {
    const putGate = gate<PutResult>()
    uploadMock.mockReturnValue(putGate.promise)
    const { result } = makeHook()
    await act(async () => {
      result.current.start([walkedFile('bali/DSC_1.jpg')])
    })
    await waitFor(() => expect(result.current.items[0]?.state).toBe('uploading'))

    // Mid-flight: the records of in-flight PUTs must not be thrown away.
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.phase).toBe('uploading')
    expect(result.current.items).toHaveLength(1)

    await act(async () => {
      putGate.resolve(putResult('https://blob.example/o', 'nina/a.jpg'))
    })
    await waitFor(() => expect(result.current.phase).toBe('finished'))

    act(() => {
      result.current.dismiss()
    })
    expect(result.current.phase).toBe('idle')
    expect(result.current.items).toHaveLength(0)
    expect(result.current.report).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
