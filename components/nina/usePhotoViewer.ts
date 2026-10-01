'use client'

import { useCallback, useMemo, useState } from 'react'

import { chatSessionPhotos, sessionPhotoIndex } from '@/lib/nina/chatphotos'

import type { ChatMessage } from './types'

/**
 * R10's full-screen photograph overlay: the state, its derivations, and the one during-render
 * close. `ChatScreen` renders `<PhotoViewer>` from what this returns; this hook owns everything
 * about WHICH photos are showing and none of what a tap on them does — the attach action stays on
 * the screen, because it arms the composer's `photo` slot, which is the screen's state.
 *
 * ── 2026-10-01: THE OVERLAY PAGES ACROSS THE SESSION, NOT THE BUBBLE (R1) ─────────────────────
 * It used to derive its list from the one message the photo was tapped in, which is what
 * `ChatImages`'s header recorded as a deliberate F35-phase-9 decision. The user authored that
 * constraint and then asked for its opposite, in these words: *"in a chat session, when i
 * full-view a photo, make it so we can swipe right / left for every other photos in that chat
 * session"*. The widening happened HERE and not in the grid, because `ChatImages` genuinely only
 * knows its own row — `onOpenImage(messageId, index)` is still bubble-local and still exactly the
 * input this hook needs.
 */
export function usePhotoViewer(messages: readonly ChatMessage[]) {
  /**
   * R10. Which photograph the full-screen overlay is showing, named by the bubble that sent it and
   * the position inside that bubble. `null` is closed.
   *
   * ── A MESSAGE ID AND AN INDEX, NOT A FLAT POSITION AND NOT A SNAPSHOT ────────────────────────
   * Because `messages` changes underneath an open overlay, in two ways that both really happen: a
   * service-worker push calls `router.refresh()` and the server hands down a new list, and R8's
   * delete takes a bubble and its photo rows with it. A snapshot would keep showing a photo whose
   * row is gone. A stored FLAT position would be worse now that the list is session-wide: a bubble
   * vanishing anywhere above the one on screen would slide every later photograph up by one, and
   * the overlay would silently re-aim at a different photograph with no visible cause. Deriving
   * the flat position from `{ messageId, index }` every render is the only shape that does not end
   * in `PhotoViewer`'s `photos[index]!` throwing or lying.
   */
  const [viewer, setViewer] = useState<{ messageId: string; index: number } | null>(null)

  /*
   * R1's list: every photograph the open conversation renders, in order.
   *
   * `useMemo` on `messages` — the screen re-renders on every state change it makes (typing,
   * keyboard, reveal, flash) and none of those touch the conversation, so this recomputes only
   * when the conversation actually changes. It is computed whether or not the overlay is open,
   * deliberately: making it conditional on `viewer` would put `viewer` in the deps and rebuild the
   * whole list on every page turn, which is the one moment it must NOT change.
   */
  const sessionPhotos = useMemo(() => chatSessionPhotos(messages), [messages])

  /* Where `viewer` points in that list — `null` when its message is gone. See `sessionPhotoIndex`
   * for the clamp-inside-the-bubble rule and why a shrink is not a close. */
  const shownIndex =
    viewer === null ? null : sessionPhotoIndex(sessionPhotos, viewer.messageId, viewer.index)

  /*
   * The message went away under the open overlay — deleted, or gone from a refreshed window. Close
   * it DURING RENDER rather than in an effect, for the reason the `seenInitial` block on the screen
   * gives at length: `react-hooks/set-state-in-effect` rejects the effect form, correctly, and React
   * discards this render and restarts with the new state before committing, so nothing is painted
   * twice. It terminates immediately: `viewer === null` makes the condition false.
   */
  if (viewer !== null && shownIndex === null) setViewer(null)

  /**
   * The photograph on screen, or `null` when the overlay is closed. Everything the screen does to
   * "this photo" reads it from here rather than re-indexing the list, which is what keeps the
   * header name, the download, the attach and R2's follow all talking about the same photograph
   * once the overlay has crossed a bubble boundary.
   */
  const shownPhoto = shownIndex === null ? null : (sessionPhotos[shownIndex] ?? null)

  /*
   * R10's attach. `null` when the id never reached the client, which is exactly the optimistic row
   * — and `ChatPhotoActions` renders no attach control for it rather than one that cannot work.
   * Read off the photo ON SCREEN, not off `viewer`'s message: after a swipe into another bubble
   * those are different messages, and indexing the opened bubble's `imageIds` would arm the
   * composer with a neighbouring photograph's row.
   */
  const viewerAttachId = shownPhoto?.attachId ?? null

  /** R2's input: the bubble the conversation should be showing behind the overlay. */
  const viewerMessageId = shownPhoto?.messageId ?? null

  const openViewer = useCallback((messageId: string, index: number) => {
    setViewer({ messageId, index })
  }, [])

  /**
   * Re-aim the open overlay, from `PhotoViewer`'s own FLAT position in the session list.
   *
   * This is the mapping that makes R1 work without giving up invariant 3: the overlay pages in
   * flat positions (`stepIndex`, the arrow keys, a dot), and this turns the position it landed on
   * back into the `{ messageId, index }` the state is allowed to hold. An unknown position is
   * ignored rather than stored — the list can only have shrunk between the render that drew the
   * control and the tap that fired it, and re-aiming at nothing would close an overlay the runner
   * is still looking at.
   */
  const setViewerIndex = useCallback(
    (flatIndex: number) => {
      const photo = sessionPhotos[flatIndex]
      if (photo === undefined) return
      setViewer({ messageId: photo.messageId, index: photo.indexWithinMessage })
    },
    [sessionPhotos],
  )

  const closeViewer = useCallback(() => setViewer(null), [])

  return {
    sessionPhotos,
    shownIndex,
    shownPhoto,
    viewerAttachId,
    viewerMessageId,
    openViewer,
    setViewerIndex,
    closeViewer,
  }
}
