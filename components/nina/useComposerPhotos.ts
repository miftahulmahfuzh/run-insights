'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useRef, useState } from 'react'

import { newId } from '@/lib/id'
import { describeNinaImage, findNinaDuplicateChatImage } from '@/lib/nina/actions'
import { planNinaPickUpload } from '@/lib/nina/dedupe'
import {
  NINA_MAX_CHAT_IMAGES,
  ninaChatPathname,
  planNinaPicked,
  type NinaPickRejectionReason,
} from '@/lib/nina/images'
import type { NinaExistingPhoto } from '@/lib/nina/attach'
import { compressForNina } from '@/lib/photos/compressForNina'
import { contentHashOf } from '@/lib/photos/contentHash'

/**
 * The photo half of the composer: the picked-tile state machine, from the `File` list the picker
 * hands over to the ready draft images the send carries. `Composer.tsx` renders the tiles and
 * holds `canSend`/`submit`; this hook owns everything that happens to a photograph between the
 * pick and the send.
 *
 * ── THE PICKER, AND WHY IT UPLOADS IMMEDIATELY (PHASE 6) ─────────────────────────────────────
 * A picked photo is compressed, PUT straight to Blob, and DESCRIBED before he taps send. That is
 * not eagerness for its own sake: the describe call costs ~8-11 s, the turn is budgeted at 45 s,
 * and 45 + 11 does not fit in a 60 s function. Doing it while he types is the only shape that
 * fits. See the phase-6 plan's latency verdict.
 *
 * The compress-and-PUT half really is parallel across tiles — it goes through `/api/upload`, a
 * Route Handler. The describe half is **not**: Next dispatches Server Actions one at a time per
 * client (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`), so three photos cost
 * three describe latencies end to end, not one. That is accepted rather than worked around — each
 * call keeps its own invocation and its own 25 s budget, the wait is client-side behind these
 * spinners while he types, and `sendNinaMessage` still makes zero model calls. See
 * `describeNinaImage`'s own docstring for why batching is not the repair.
 *
 * ── AND WHY EVERY PICK IS HASHED, AND WHAT THE HASH BUYS (media-dedupe P2) ────────────────────
 * After `compressForNina` returns, this composer hashes the compressed bytes — the exact bytes a
 * PUT would carry — with `contentHashOf`, for EVERY pick, before anything is uploaded. The hash is a
 * millisecond over ~150 KB; the PUT it can save is a round trip and a permanent object. It is
 * spent in two places:
 *
 *   · a pre-check (`findNinaDuplicateChatImage`) BEFORE the upload: when the owner's collection
 *     already holds an original with these bytes, the tile never uploads and never describes — it
 *     switches to the existing photograph and is sent as a reference to it. The duplicate pick
 *     that started this whole set (the arrival card, picked twice) stops here: one object, one
 *     original, and the 8-11 s describe is not paid a second time.
 *   · the send claim (`contentHashes`, keyed by the STORED pathname): `sendNinaMessage` re-checks
 *     immediately before its insert, closing the race this composer cannot see — the same file
 *     picked in two tabs, or re-picked while the first send is still in flight.
 *
 * The dedup is deliberately INVISIBLE to him: a deduplicated tile shows the same thumbnail, joins
 * `ready` like any other, and sends like any other. Nothing to learn, nothing to explain. When
 * the pre-check itself fails — network, a cold action — the tile uploads as it always did: dedup
 * may degrade to inactive on any single pick, but a pick never fails BECAUSE of dedup. The same
 * tolerance runs on the server, where an invalid hash is written as NULL rather than an error.
 *
 * ── AND WHY `planNinaPicked` IS A PURE FUNCTION IN `lib/` ────────────────────────────────────
 * F17 measured what happens otherwise: `UploadPicker` decided from inside a `setState` updater,
 * Strict Mode double-invoked it, and one picked file minted two upload tokens and left a blob
 * orphaned in the store for good. Decide purely, hand `setTiles` a value, run the effects after.
 *
 * ── `userId` IS AN ARGUMENT AND IT IS NOT A CAPABILITY ────────────────────────────────────────
 * The client needs it to build `nina/<userId>/chat/<id>.jpg`. `/api/upload` re-derives the owner
 * from the session and refuses any pathname that does not match it, so a tampered value buys a
 * 400, not a write. Invariant 10 is about `NEXT_PUBLIC_`, not about props.
 *
 * The surface is the original component's, minus what only the component's render needed: the
 * tile list and the notice for rendering, `ready`/`inFlight` for `canSend`, `onPick`/`removeTile`
 * for the gestures — and two send-side verbs, `collectDraft` (the payload's discriminated union)
 * and `reset` (release the previews, drop the tiles and the notice), which the component's
 * `submit` calls in sequence after `useComposerDraft`'s own clear.
 */

type TileState = 'compressing' | 'checking' | 'uploading' | 'describing' | 'ready' | 'error'

interface Tile {
  id: string
  /** `URL.createObjectURL` of the ORIGINAL pick, so the thumbnail appears instantly. */
  previewUrl: string
  state: TileState
  error: string | null
  /** Set once describe returns — success or handled failure. A tile without one cannot be sent. */
  ticket: string | null
  /**
   * The public Blob URL for the optimistic bubble — set when an upload's result names it. A
   * deduplicated tile never uploads, so its bubble URL rides on `existing` instead and this
   * stays null.
   */
  blobUrl: string | null
  /**
   * media-dedupe P2. The STORED pathname (Vercel's suffix included) of an uploaded tile's bytes —
   * the key the send's `contentHashes` is keyed by, matching the pathname inside the ticket.
   * Null until the upload returns; a deduplicated tile never uploads, so it stays null there.
   */
  pathname: string | null
  /**
   * media-dedupe P2. `contentHashOf` over the exact bytes this tile would PUT — computed for EVERY
   * pick, because hashing is a millisecond and the branch is a bug waiting to be re-decided.
   * Cleared to null when the tile turns out to be a duplicate: a deduplicated tile sends a
   * pointer, and the hash belongs to whichever row ends up owning the bytes.
   */
  contentHash: string | null
  /**
   * media-dedupe P2. Set when the pre-check matched: these bytes are already in the collection
   * behind this photograph, so the tile will send a REFERENCE to it instead of a ticket for
   * fresh bytes. A tile with one has no ticket and needs no describe — the keeper's description
   * rides along through `resolveAttachment` on the server.
   */
  existing: NinaExistingPhoto | null
}

/**
 * One photograph the composer is handing to the send, in tile order — the payload's unit since
 * phase 6, a discriminated union since media-dedupe P2, because a tile can now be one of two
 * things:
 *
 *   · `upload` — this composer PUT the bytes; the signed describe ticket carries them, and
 *     `contentHash` (null when hashing failed) lets the server race-close a duplicate it cannot
 *     see yet. `pathname` is the STORED form, which is the key `contentHashes` is keyed by.
 *   · `deduped` — the pre-check proved the bytes are already in the collection behind
 *     `imageId`; the message references them, and `url` (the keeper's CDN URL) exists only for
 *     the optimistic bubble. No ticket, no hash, no bytes on the wire.
 */
export type ComposerDraftImage =
  | {
      source: 'upload'
      ticket: string
      url: string
      pathname: string
      contentHash: string | null
    }
  | {
      source: 'deduped'
      url: string
      imageId: string
    }

const REJECTION_TEXT: Record<NinaPickRejectionReason, string> = {
  not_an_image: 'That is not a photo.',
  too_large: 'That photo is too big.',
  too_many: `Nina takes ${NINA_MAX_CHAT_IMAGES} photos at a time.`,
}

export function useComposerPhotos({ userId }: { userId: string }) {
  const [tiles, setTiles] = useState<Tile[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  /** Ids removed while their promise was still in flight. Their results are dropped. */
  const dropped = useRef(new Set<string>())

  const ready = tiles.filter(
    (t) => t.state === 'ready' && (t.ticket !== null || t.existing !== null),
  )
  const inFlight = tiles.some((t) => t.state !== 'ready' && t.state !== 'error')

  /** `patchIfCurrent`'s spirit: a tile the runner removed must not be written to by its own
   *  in-flight promise. */
  const patch = useCallback((id: string, next: Partial<Tile>) => {
    if (dropped.current.has(id)) return
    setTiles((current) => current.map((t) => (t.id === id ? { ...t, ...next } : t)))
  }, [])

  const process = useCallback(
    async (tile: Tile, file: File) => {
      try {
        const compressed = await compressForNina(file)
        patch(tile.id, { state: 'checking' })

        /*
         * media-dedupe P2. Hash the EXACT bytes a PUT would carry — `compressed.file`, never the
         * original pick (invariant 4: the hash describes the stored bytes, and only these bytes
         * are stored). Every pick is hashed; the millisecond is cheaper than the branch. A hash
         * that cannot be computed degrades to null and the tile uploads as it always has.
         */
        let contentHash: string | null = null
        try {
          contentHash = await contentHashOf(compressed.file)
        } catch {
          contentHash = null
        }

        /*
         * The SECOND key, over the pick itself (2026-09-10's measured defect): a photograph that
         * was downloaded out of the collection and re-uploaded re-encodes here into bytes nobody
         * has ever stored, so the encode hash above can never match — but the picked file's own
         * bytes ARE a stored row's object, byte for byte, and `content_hash` holds "sha-256 over
         * a row's stored bytes" for every row. Asking both keys in one lookup is what turns
         * "download → re-upload" from a second Blob object into an attach. Same degradation rule
         * as the encode hash: a miss costs nothing, a photograph is never blocked on it.
         */
        let sourceHash: string | null = null
        try {
          sourceHash = await contentHashOf(file)
        } catch {
          sourceHash = null
        }

        /*
         * The pre-check, BEFORE any upload: one indexed, owner-scoped lookup over BOTH keys. A
         * transport failure degrades to "no duplicate" — the pick uploads, the race-close at send
         * time still holds the encode's hash, and a photograph never fails to send because dedup
         * had a bad round trip.
         */
        const duplicate =
          contentHash === null && sourceHash === null
            ? null
            : await findNinaDuplicateChatImage({ contentHash, sourceHash }).catch(() => null)

        const step = planNinaPickUpload({ contentHash, duplicate })
        if (step.outcome === 'attach-existing') {
          /* The bytes are already in the collection. No PUT, no mint, no describe — the tile is
           * simply DONE, holding the existing photograph it will attach. */
          patch(tile.id, {
            state: 'ready',
            contentHash: null,
            existing: step.existing,
          })
          return
        }

        patch(tile.id, { state: 'uploading' })

        const requested = ninaChatPathname(userId, newId())
        const result = await upload(requested, compressed.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          // Nothing to declare: the chat branch of the route parses no client payload.
        })
        patch(tile.id, { state: 'describing', blobUrl: result.url, pathname: result.pathname })

        /*
         * Her eyes. A FAILED describe still returns a ticket (carrying `description: null`), so
         * the photo remains sendable and Nina is told honestly that she could not see it — which
         * is why this branch sets `state: 'ready'` on a `!ok` result too, and only a missing
         * ticket is an error.
         */
        const described = await describeNinaImage({
          blobUrl: result.url,
          pathname: result.pathname,
          width: compressed.width,
          height: compressed.height,
          bytes: compressed.compressedBytes,
        })
        if (described.ticket === null) {
          patch(tile.id, { state: 'error', error: 'Nina could not take this one.' })
          return
        }
        patch(tile.id, { state: 'ready', ticket: described.ticket, contentHash: step.contentHash })
      } catch (cause) {
        patch(tile.id, {
          state: 'error',
          error: cause instanceof Error ? cause.message : 'That photo would not upload.',
        })
      }
    },
    [patch, userId],
  )

  /**
   * Decide, then set, then run. Nothing in here is inside an updater, so Strict Mode has nothing
   * to double-invoke. See the header.
   */
  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = '' // so picking the same file twice in a row still fires onChange
    if (picked.length === 0) return

    const plan = planNinaPicked(
      picked.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      { alreadyHeld: tiles.length },
    )

    const fresh: Array<{ tile: Tile; file: File }> = []
    for (const candidate of plan.accepted) {
      const file = picked.find((f) => f.name === candidate.name && f.size === candidate.size)
      if (file == null) continue
      fresh.push({
        tile: {
          id: `tile-${newId()}`,
          previewUrl: URL.createObjectURL(file),
          state: 'compressing',
          error: null,
          ticket: null,
          blobUrl: null,
          pathname: null,
          contentHash: null,
          existing: null,
        },
        file,
      })
    }

    setTiles((current) => [...current, ...fresh.map((f) => f.tile)])
    const firstRejection = plan.rejected[0]
    setNotice(firstRejection != null ? REJECTION_TEXT[firstRejection.reason] : null)
    for (const { tile, file } of fresh) void process(tile, file)
  }

  function removeTile(id: string) {
    dropped.current.add(id)
    setTiles((current) => {
      const going = current.find((t) => t.id === id)
      if (going != null) URL.revokeObjectURL(going.previewUrl)
      return current.filter((t) => t.id !== id)
    })
  }

  /** The ready tiles, in tile order, as the send payload's discriminated union — the mapping
   * `submit` used to inline. Called at the moment of the send; a tile not yet ready is not a
   * draft image. */
  function collectDraft(): ComposerDraftImage[] {
    return ready.map((tile) =>
      tile.existing !== null
        ? { source: 'deduped' as const, url: tile.existing.url, imageId: tile.existing.id }
        : {
            source: 'upload' as const,
            ticket: tile.ticket as string,
            url: tile.blobUrl as string,
            pathname: tile.pathname as string,
            contentHash: tile.contentHash,
          },
    )
  }

  /**
   * The send's half of the composer reset: release every preview URL, drop the tiles, drop the
   * notice. The TEXT half — clearing the draft, the height reset and the blur — belongs to
   * `useComposerDraft`'s `clear`; the component's `submit` calls the two in sequence.
   */
  function reset() {
    for (const tile of tiles) URL.revokeObjectURL(tile.previewUrl)
    setTiles([])
    setNotice(null)
  }

  return { tiles, notice, ready, inFlight, onPick, removeTile, collectDraft, reset }
}
