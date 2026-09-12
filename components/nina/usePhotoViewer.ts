'use client'

import { useCallback, useMemo, useState } from 'react'

import { attachableIdAt, chatViewerPhotos, viewerIndex } from '@/lib/nina/chatphotos'

import type { ChatMessage } from './types'

/**
 * R10's full-screen photograph overlay: the state, its derivations, and the one during-render
 * close. `ChatScreen` renders `<PhotoViewer>` from what this returns; this hook owns everything
 * about WHICH photos are showing and none of what a tap on them does — the attach action stays on
 * the screen, because it arms the composer's `photo` slot, which is the screen's state.
 */
export function usePhotoViewer(messages: readonly ChatMessage[]) {
  /**
   * R10. Which bubble's photographs the full-screen overlay is showing, and which of them is on
   * screen. `null` is closed.
   *
   * ── A MESSAGE ID AND AN INDEX, NOT A SNAPSHOT OF THE PHOTO LIST ──────────────────────────────
   * Because `messages` changes underneath an open overlay, in two ways that both really happen: a
   * service-worker push calls `router.refresh()` and the server hands down a new list, and R8's
   * delete takes a bubble and its photo rows with it. A snapshot would keep showing a photo whose
   * row is gone; a derived list plus `viewerIndex` closes or clamps, which is the only shape that
   * does not end in `PhotoViewer`'s `photos[index]!` throwing.
   */
  const [viewer, setViewer] = useState<{ messageId: string; index: number } | null>(null)

  /*
   * R10's overlay, derived rather than stored — see `viewer` above.
   *
   * `useMemo` on the message identity, not on `messages`: the screen re-renders on every state
   * change it makes (typing, keyboard, reveal, flash), and the overlay's list only depends
   * on the one row it is showing.
   */
  const viewerMessage =
    viewer === null
      ? null
      : (messages.find((candidate) => candidate.id === viewer.messageId) ?? null)
  const viewerPhotos = useMemo(() => chatViewerPhotos(viewerMessage), [viewerMessage])
  const shownIndex = viewer === null ? null : viewerIndex(viewer.index, viewerPhotos.length)
  /*
   * The message went away under the open overlay — deleted, or gone from a refreshed window. Close
   * it DURING RENDER rather than in an effect, for the reason the `seenInitial` block on the screen
   * gives at length: `react-hooks/set-state-in-effect` rejects the effect form, correctly, and React
   * discards this render and restarts with the new state before committing, so nothing is painted
   * twice. It terminates immediately: `viewer === null` makes the condition false.
   */
  if (viewer !== null && shownIndex === null) setViewer(null)
  /*
   * R10's attach. `null` when the id never reached the client, which is exactly the optimistic row
   * — and `ChatPhotoActions` renders no attach control for it rather than one that cannot work.
   */
  const viewerAttachId =
    shownIndex === null ? null : attachableIdAt(viewerMessage?.imageIds, shownIndex)

  const openViewer = useCallback((messageId: string, index: number) => {
    setViewer({ messageId, index })
  }, [])

  /** Re-aim the open overlay at another photo of the SAME message (the viewer's prev/next). */
  const setViewerIndex = useCallback((messageId: string, index: number) => {
    setViewer({ messageId, index })
  }, [])

  const closeViewer = useCallback(() => setViewer(null), [])

  return {
    viewer,
    viewerPhotos,
    shownIndex,
    viewerAttachId,
    openViewer,
    setViewerIndex,
    closeViewer,
  }
}
