'use client'

import { upload } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, Card, LoadingDots } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  DEFAULT_KIND_BY_INDEX,
  MAX_IMAGES,
  SCREEN_KINDS,
  SCREEN_KIND_LABEL,
  SHOT_PREFIX,
  TYPICAL_EXTRACTION_SECONDS,
  type ScreenKind,
} from '@/lib/extract/constants'
import { reassignKind } from '@/lib/extract/reassignKind'
import { newId } from '@/lib/id'
import { compressForExtraction, rejectionReason } from '@/lib/photos/compressForExtraction'
import type { ExtractAcceptedResponse, ExtractionBlobRef } from '@/lib/schema/extractionResult'
import { KindSelector } from './KindSelector'

/**
 * `/upload` — pick 1–3 screenshots, say which is which, send them off.
 *
 * The flow, per plan §10, and every step of it visible to the runner:
 *
 *   pick → compress (560 short edge, q80, in a worker) → PUT straight to Blob → "Read this run"
 *   → POST /api/extract → 202 { extractionId } → push /x/[extractionId]
 *
 * Compression and upload start the moment a file is picked rather than on submit. By the time
 * someone has checked three kind selectors the bytes are usually already in Blob, so "Read this
 * run" costs one insert instead of three uploads.
 */

type TileState = 'compressing' | 'uploading' | 'ready' | 'error'

interface Tile {
  id: string
  /**
   * Bumped every time this tile's kind changes. `process` writes only through `patchIfCurrent`,
   * which drops a result whose generation has since moved on — see the race note on `changeKind`.
   */
  gen: number
  name: string
  previewUrl: string
  kind: ScreenKind
  state: TileState
  error: string | null
  /** Set once the PUT lands. A tile without this cannot be submitted. */
  blob: ExtractionBlobRef | null
  originalBytes: number
  compressedBytes: number | null
}

export function UploadPicker() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Object URLs are a manual-lifetime resource: without this the previews leak for as long as
  // the page lives, which on a phone is exactly when memory is scarcest.
  const previewsRef = useRef<string[]>([])
  useEffect(
    () => () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url)
    },
    [],
  )

  /**
   * The picked File per tile, kept out of state on purpose: it is not rendered, it must not
   * trigger a re-render, and changing a tile's kind needs to re-run the whole compress-and-upload
   * from the original bytes (the kind is baked into a signed upload token, so the previous blob
   * cannot be relabelled after the fact).
   */
  const filesRef = useRef(new Map<string, File>())

  /**
   * Write to a tile, but only if it is still the generation that asked.
   *
   * Changing a kind restarts `process` on a tile whose previous `process` may still be in flight,
   * and that older promise ends by writing `state: 'ready'` and a `blob` carrying the **stale**
   * kind — clobbering the newer one with a lie about provenance. The generation is compared
   * *inside* the updater, against the state React is about to reduce over, so it can never read a
   * stale `gen` out of a closure. A superseded upload's result is dropped; its bytes sit
   * unreferenced in Blob, which is already what happens to the blob a kind change abandons.
   */
  const patchIfCurrent = useCallback((id: string, gen: number, next: Partial<Tile>) => {
    setTiles((current) =>
      current.map((t) => (t.id === id && t.gen === gen ? { ...t, ...next } : t)),
    )
  }, [])

  const process = useCallback(
    async (tile: Tile, file: File) => {
      try {
        const compressed = await compressForExtraction(file)
        patchIfCurrent(tile.id, tile.gen, {
          state: 'uploading',
          compressedBytes: compressed.compressedBytes,
        })

        // The client picks its own pathname; the route validates it against
        // SHOT_REQUEST_PATHNAME_RE and Vercel appends a random suffix on top.
        const requested = `${SHOT_PREFIX}${newId()}.jpg`
        const result = await upload(requested, compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          // Read back inside the signed token, so the webhook cannot be spoofed into claiming a
          // different kind than this authenticated session declared.
          clientPayload: JSON.stringify({ kind: tile.kind }),
        })

        patchIfCurrent(tile.id, tile.gen, {
          state: 'ready',
          blob: {
            url: result.url,
            pathname: result.pathname,
            kind: tile.kind,
            width: compressed.width,
            height: compressed.height,
            bytes: compressed.compressedBytes,
          },
        })
      } catch (cause) {
        patchIfCurrent(tile.id, tile.gen, {
          state: 'error',
          error: cause instanceof Error ? cause.message : 'Upload failed.',
        })
      }
    },
    [patchIfCurrent],
  )

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = '' // so re-picking the same file fires change again
    if (picked.length === 0) return
    setFormError(null)

    setTiles((current) => {
      const room = MAX_IMAGES - current.length
      if (room <= 0) {
        setFormError(`Three screenshots is the most one run can have.`)
        return current
      }
      if (picked.length > room) {
        setFormError(`Only the first ${room} of those were added — three is the maximum.`)
      }

      const usedKinds = new Set(current.map((t) => t.kind))
      const added: Tile[] = []

      for (const file of picked.slice(0, room)) {
        const reason = rejectionReason(file)
        if (reason) {
          setFormError(reason)
          continue
        }
        // Default by pick order (1st Summary, 2nd Splits, 3rd Heart Rate — the order the screens
        // appear in the Fitness app), skipping any kind a tile already claims so two tiles never
        // start out fighting over one screen.
        const preferred = DEFAULT_KIND_BY_INDEX[current.length + added.length] ?? SCREEN_KINDS[0]
        const kind = usedKinds.has(preferred)
          ? (SCREEN_KINDS.find((k) => !usedKinds.has(k)) ?? preferred)
          : preferred
        usedKinds.add(kind)

        const previewUrl = URL.createObjectURL(file)
        previewsRef.current.push(previewUrl)
        const tile: Tile = {
          id: newId(),
          gen: 0,
          name: file.name,
          previewUrl,
          kind,
          state: 'compressing',
          error: null,
          blob: null,
          originalBytes: file.size,
          compressedBytes: null,
        }
        added.push(tile)
        filesRef.current.set(tile.id, file)
        void process(tile, file)
      }

      return [...current, ...added]
    })
  }

  /**
   * Give a tile the kind the runner tapped, **swapping** with whichever tile already held it.
   *
   * Swapping is what makes this control editable at all. Disabling the kinds a neighbour held
   * froze the whole thing on a full three-screen upload, because there are exactly as many kinds
   * as slots (F16 §1). `reassignKind` keeps them distinct after every tap instead, so
   * "Read this run" is never dead and there is no invalid state to explain.
   *
   * Both changed tiles re-compress and re-PUT. The kind is baked into a signed upload token, so an
   * already-uploaded blob cannot be relabelled after the fact; rather than send a blob whose token
   * says one thing and whose request body says another, we redo it from the original bytes — ~60 KB
   * and a second each, concurrent, and a fair price for never lying about provenance. (The token's
   * `kind` is read by nothing *today* — `onUploadCompleted` is inert under R-1 — which is exactly
   * why relabelling in place would be a trap for whoever makes that webhook a writer. Plan §3.)
   *
   * The `process` calls sit OUTSIDE the `setTiles` updater on purpose: React StrictMode may invoke
   * an updater twice in dev, which would double-fire an upload. This only ever runs from a tap, so
   * the `tiles` closure is current by construction.
   */
  const changeKind = (id: string, kind: ScreenKind) => {
    const { entries, changed } = reassignKind(tiles, id, kind)
    if (changed.length === 0) return

    // All-or-nothing: a swap redoes both tiles or neither, so one can never be stranded in
    // `compressing` with no upload running. Unreachable in practice — `filesRef` is written on
    // pick and cleared only by `remove`, which drops the tile too — which is why it fails closed.
    const files = changed.map((cid) => filesRef.current.get(cid))
    if (files.some((file) => !file)) return

    const bumped = entries.map((tile) =>
      changed.includes(tile.id)
        ? { ...tile, gen: tile.gen + 1, blob: null, state: 'compressing' as const, error: null }
        : tile,
    )
    setTiles(bumped)

    changed.forEach((cid, i) => {
      const tile = bumped.find((t) => t.id === cid)
      const file = files[i]
      if (tile && file) void process(tile, file)
    })
  }

  const remove = (id: string) => {
    filesRef.current.delete(id)
    setTiles((current) => current.filter((t) => t.id !== id))
    setFormError(null)
  }

  const ready = tiles.length > 0 && tiles.every((t) => t.state === 'ready' && t.blob)
  const kindsChosen = tiles.map((t) => SCREEN_KIND_LABEL[t.kind]).join(' · ')

  const submit = async () => {
    const images = tiles.map((t) => t.blob).filter((b): b is ExtractionBlobRef => b !== null)
    if (images.length !== tiles.length || images.length === 0) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `The server refused this (${res.status}).`)
      }
      const { extractionId } = (await res.json()) as ExtractAcceptedResponse
      router.push(`/x/${extractionId}`)
    } catch (cause) {
      setSubmitting(false)
      setFormError(cause instanceof Error ? cause.message : 'Could not start reading this run.')
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />

      {tiles.length === 0 ? (
        <Card className="text-center">
          <p className="mb-1.5 text-[17px] font-semibold text-ink">Pick your screenshots</p>
          <p className="mx-auto mb-6 max-w-[32ch] text-[13px] font-medium text-ink-2">
            The summary, the splits table, the heart-rate screen. Any one of them on its own is fine
            — more screens just means more of the run gets read.
          </p>
          <Button fullWidth onClick={() => inputRef.current?.click()}>
            Choose images
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {tiles.map((tile) => (
            <Card key={tile.id} className="p-4">
              <div className="flex gap-3">
                {/*
                 * A plain <img>, not next/image: the source is a blob: object URL for a file that
                 * exists only in this tab. There is nothing for the image optimiser to fetch.
                 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.previewUrl}
                  alt=""
                  className="h-[86px] w-[58px] shrink-0 rounded-chip bg-paper-2 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <KindSelector
                    value={tile.kind}
                    onChange={(kind) => changeKind(tile.id, kind)}
                    disabled={submitting}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <TileStatus tile={tile} />
                    <button
                      type="button"
                      onClick={() => remove(tile.id)}
                      disabled={submitting}
                      className="-mr-1 h-11 px-2 text-[12px] font-semibold text-ink-3"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {tiles.length < MAX_IMAGES && (
            <Button variant="secondary" fullWidth onClick={() => inputRef.current?.click()}>
              Add another screen
            </Button>
          )}
        </div>
      )}

      {formError && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-warn">
          {formError}
        </p>
      )}

      {tiles.length > 0 && (
        <div className="mt-6">
          <Button fullWidth disabled={!ready} loading={submitting} onClick={submit}>
            Read this run
          </Button>
          <p className="mt-2.5 text-center text-[12px] font-medium text-ink-3">
            {ready
              ? `${kindsChosen} — reading all ${tiles.length} in one pass takes about ${TYPICAL_EXTRACTION_SECONDS} seconds.`
              : 'Waiting for the uploads to finish.'}
          </p>
        </div>
      )}
    </div>
  )
}

function TileStatus({ tile }: { tile: Tile }) {
  if (tile.state === 'error') {
    return (
      <span className="text-[12px] font-semibold text-warn" role="alert">
        {tile.error}
      </span>
    )
  }
  if (tile.state === 'ready') {
    const kb = tile.compressedBytes ? Math.round(tile.compressedBytes / 1000) : null
    return (
      <span className="text-[12px] font-medium text-ink-3">
        Ready{kb !== null && ` · ${kb} KB`}
      </span>
    )
  }
  return (
    <span className={cn('flex items-center gap-2 text-[12px] font-medium text-ink-3')}>
      <LoadingDots />
      {tile.state === 'compressing' ? 'Resizing' : 'Uploading'}
    </span>
  )
}
