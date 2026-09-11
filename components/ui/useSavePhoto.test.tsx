// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSavePhoto } from './useSavePhoto'

/**
 * The machinery behind every "download this photograph" control. `lib/photos/save.ts` owns the
 * pure strategy; the hook owns the ladder's rungs, and the rungs are what a browser has to be
 * present to prove — which is why these tests live in a DOM environment while the strategy's own
 * tests do not.
 *
 * The contracts, per the file's header:
 *  - `warm` fetches early on pointerdown, idempotently, keyed by URL;
 *  - `save` decides the strategy BEFORE any await (transient activation), then share →
 *    object-URL anchor → open, and never a dead end;
 *  - a dismissed share sheet (`AbortError`) is silence — no notice, no surprise download;
 *  - the notice is stored WITH the URL it was reported for, so paging invalidates it;
 *  - `url: null` (a closed viewer) arms nothing.
 */

const PHOTO_URL = 'https://blob.example/nina/u1/chat/abc123.jpg'

function okFetch() {
  return {
    ok: true,
    blob: async () => new Blob(['bytes'], { type: 'image/jpeg' }),
  }
}

interface Harness {
  result: { current: ReturnType<typeof useSavePhoto> }
  rerender: (url: string | null, prefix?: string) => void
  fetchMock: Mock
  shareMock: Mock
  canShareMock: Mock
  windowOpenMock: Mock
  createObjectURLMock: Mock
  anchorClicks: HTMLAnchorElement[]
}

function installHarness(initial: { url: string | null; prefix?: string }): Harness {
  const fetchMock: Mock = vi.fn()
  const shareMock: Mock = vi.fn()
  const canShareMock: Mock = vi.fn(() => false)
  const windowOpenMock: Mock = vi.fn(() => ({}))
  const createObjectURLMock: Mock = vi.fn(() => 'blob:object-url')
  const anchorClicks: HTMLAnchorElement[] = []

  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window.navigator, 'share', { value: shareMock, configurable: true })
  Object.defineProperty(window.navigator, 'canShare', { value: canShareMock, configurable: true })
  vi.spyOn(window, 'open').mockImplementation(windowOpenMock as unknown as typeof window.open)
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    createObjectURLMock as unknown as typeof URL.createObjectURL,
  )
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    anchorClicks.push(this)
  })

  // `(pointer: coarse)` decides the share/download split; coarse defaults off.
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('coarse') }) as MediaQueryList,
  )

  const utils = renderHook(
    ({ url, prefix }: { url: string | null; prefix: string }) => useSavePhoto(url, prefix),
    { initialProps: { url: initial.url, prefix: initial.prefix ?? 'nina' } },
  )

  return {
    result: utils.result,
    rerender: (url, prefix) => utils.rerender({ url, prefix: prefix ?? initial.prefix ?? 'nina' }),
    fetchMock,
    shareMock,
    canShareMock,
    windowOpenMock,
    createObjectURLMock,
    anchorClicks,
  }
}

describe('useSavePhoto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('a closed viewer arms nothing: warm and save are both no-ops', async () => {
    const h = installHarness({ url: null })

    act(() => {
      h.result.current.warm()
    })
    await act(async () => {
      await h.result.current.save()
    })

    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(h.windowOpenMock).not.toHaveBeenCalled()
    expect(h.anchorClicks).toHaveLength(0)
    expect(h.result.current.busy).toBe(false)
    expect(h.result.current.notice).toBeNull()
  })

  describe('warm', () => {
    it('starts the fetch early, exactly once per URL', () => {
      const h = installHarness({ url: PHOTO_URL })

      act(() => {
        h.result.current.warm()
      })
      act(() => {
        h.result.current.warm()
      })

      expect(h.fetchMock).toHaveBeenCalledTimes(1)
      expect(h.fetchMock).toHaveBeenCalledWith(PHOTO_URL, { mode: 'cors', credentials: 'omit' })
    })

    it('a new photo invalidates the warm one — the key is the URL', () => {
      const h = installHarness({ url: PHOTO_URL })

      act(() => {
        h.result.current.warm()
      })
      act(() => {
        h.rerender('https://blob.example/next.jpg')
      })
      act(() => {
        h.result.current.warm()
      })

      expect(h.fetchMock).toHaveBeenCalledTimes(2)
      expect(h.fetchMock).toHaveBeenLastCalledWith('https://blob.example/next.jpg', {
        mode: 'cors',
        credentials: 'omit',
      })
    })
  })

  describe('the download rung (a mouse: fine pointer, no file sharing)', () => {
    it('clicks a synthetic same-origin anchor carrying the file name', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.fetchMock.mockResolvedValue(okFetch())

      await act(async () => {
        await h.result.current.save()
      })

      expect(h.result.current.busy).toBe(false)
      expect(h.anchorClicks).toHaveLength(1)
      const anchor = h.anchorClicks[0]!
      // The object URL is the one href on which a `download` attribute is honoured.
      expect(anchor.download).toBe('nina-abc123.jpg')
      expect(anchor.rel).toBe('noopener')
      expect(h.shareMock).not.toHaveBeenCalled()
    })

    it('the object URL is revoked on a timer, not in the click tick', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL')
      const h = installHarness({ url: PHOTO_URL })
      h.fetchMock.mockResolvedValue(okFetch())

      await act(async () => {
        await h.result.current.save()
      })
      expect(revoke).not.toHaveBeenCalled()

      // Safari cancels a synchronously-revoked download; ten seconds is the deliberate delay.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(revoke).toHaveBeenCalledWith('blob:object-url')
    })
  })

  describe('the share rung (a phone: coarse pointer, file sharing)', () => {
    it('hands the fetched File straight to the share sheet — no anchor, no object URL', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.canShareMock.mockReturnValue(true)
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) => ({ matches: query.includes('coarse') }) as MediaQueryList,
      )
      h.fetchMock.mockResolvedValue(okFetch())

      act(() => {
        h.result.current.warm()
      })
      await act(async () => {
        await h.result.current.save()
      })

      // The warmed fetch was reused: one round trip, decided while the tap was current.
      expect(h.fetchMock).toHaveBeenCalledTimes(1)
      expect(h.shareMock).toHaveBeenCalledTimes(1)
      const handed = h.shareMock.mock.calls[0]![0] as { files: File[] }
      expect(handed.files).toHaveLength(1)
      expect(handed.files[0]).toBeInstanceOf(File)
      expect(handed.files[0]!.name).toBe('nina-abc123.jpg')
      expect(h.anchorClicks).toHaveLength(0)
      expect(h.createObjectURLMock).not.toHaveBeenCalled()
    })

    it('busy spans the flight and clears after', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.canShareMock.mockReturnValue(true)
      let resolveFetch!: (value: ReturnType<typeof okFetch>) => void
      h.fetchMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
      )
      h.shareMock.mockResolvedValue(undefined)

      let flight!: Promise<void>
      act(() => {
        flight = h.result.current.save()
      })
      expect(h.result.current.busy).toBe(true)

      resolveFetch(okFetch())
      await act(async () => {
        await flight
      })
      expect(h.result.current.busy).toBe(false)
    })

    it('a dismissed sheet is SILENCE: no notice, no surprise download', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.canShareMock.mockReturnValue(true)
      h.fetchMock.mockResolvedValue(okFetch())
      h.shareMock.mockRejectedValue(
        Object.assign(new Error('sheet dismissed'), { name: 'AbortError' }),
      )

      await act(async () => {
        await h.result.current.save()
      })

      expect(h.anchorClicks).toHaveLength(0)
      expect(h.result.current.notice).toBeNull()
    })

    it('any other share refusal falls through to the anchor, which needs no activation', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.canShareMock.mockReturnValue(true)
      h.fetchMock.mockResolvedValue(okFetch())
      h.shareMock.mockRejectedValue(
        Object.assign(new Error('transient activation expired'), { name: 'NotAllowedError' }),
      )

      await act(async () => {
        await h.result.current.save()
      })

      expect(h.anchorClicks).toHaveLength(1)
      expect(h.anchorClicks[0]!.download).toBe('nina-abc123.jpg')
    })

    it('a platform without navigator.share at all skips straight to the anchor', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.canShareMock.mockReturnValue(true)
      h.fetchMock.mockResolvedValue(okFetch())
      // The share rung is gated on the function existing, not on the strategy alone.
      delete (window.navigator as { share?: unknown }).share

      await act(async () => {
        await h.result.current.save()
      })

      expect(h.anchorClicks).toHaveLength(1)
    })
  })

  describe('the open rung — the bytes never arrived', () => {
    it.each([
      ['a failed response', () => ({ ok: false })],
      ['a rejected fetch', () => Promise.reject(new Error('offline'))],
    ])('%s falls to window.open and reports it', async (_name, fetchResult) => {
      const h = installHarness({ url: PHOTO_URL })
      h.fetchMock.mockReturnValue(fetchResult())

      await act(async () => {
        await h.result.current.save()
      })

      expect(h.windowOpenMock).toHaveBeenCalledWith(PHOTO_URL, '_blank', 'noopener,noreferrer')
      expect(h.result.current.notice).toBe('opened')
    })

    it('a blocked popup reports "unavailable" — the one thing worth saying', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.fetchMock.mockReturnValue({ ok: false })
      h.windowOpenMock.mockReturnValue(null)

      await act(async () => {
        await h.result.current.save()
      })

      expect(h.result.current.notice).toBe('unavailable')
    })
  })

  describe('the notice', () => {
    it('is keyed to the photo it was reported for: paging away clears it, paging back restores it', async () => {
      const otherUrl = 'https://blob.example/other.jpg'
      const h = installHarness({ url: PHOTO_URL })
      h.fetchMock.mockReturnValue({ ok: false })

      await act(async () => {
        await h.result.current.save()
      })
      expect(h.result.current.notice).toBe('opened')

      act(() => {
        h.rerender(otherUrl)
      })
      // A new photograph is a fresh slate — a stale "opened in a new tab" beside a different
      // image would be a lie about the one on screen.
      expect(h.result.current.notice).toBeNull()

      act(() => {
        h.rerender(PHOTO_URL)
      })
      // The derivation is honest: the notice names THIS photo's last rung.
      expect(h.result.current.notice).toBe('opened')
    })

    it('the next save clears it before deciding anything', async () => {
      const h = installHarness({ url: PHOTO_URL })
      h.fetchMock.mockReturnValue({ ok: false })
      await act(async () => {
        await h.result.current.save()
      })
      expect(h.result.current.notice).toBe('opened')

      h.fetchMock.mockResolvedValue(okFetch())
      await act(async () => {
        await h.result.current.save()
      })
      // The save succeeded through the anchor; the old "opened" notice is gone and no
      // success notice was invented (the browser's own chrome is the feedback).
      expect(h.result.current.notice).toBeNull()
    })
  })

  it('the file name quotes the blob’s own last segment, prefixed — never a user id', async () => {
    const h = installHarness({
      url: 'https://blob.example/nina/u1/chat/photo%20one.webp',
      prefix: 'nina foto',
    })
    h.fetchMock.mockResolvedValue(okFetch())

    await act(async () => {
      await h.result.current.save()
    })

    // `saveFilenameFor` sanitises but does not percent-decode (a URL's pathname keeps its
    // encoding), so 'photo%20one' loses only the '%' — and stays unique and extension-true.
    expect(h.anchorClicks[0]!.download).toBe('nina-foto-photo-20one.webp')
  })
})
