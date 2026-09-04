import { NINA_SIDE_LABEL, photoSideOf } from './album'

/**
 * R10's three rules, as pure functions — `lib/photos/gallery.ts`'s carve-out applied to the chat
 * side of the same overlay. The component that uses them holds no rules of its own.
 *
 * ── WHY THE RETURN TYPE IS STRUCTURAL AND NOT `ViewerPhoto` ───────────────────────────────────
 * `RunAttachmentInput`'s reasoning in `lib/nina/attach.ts:14-18`, applied the other way round:
 * a pure module under `lib/` states what it produces rather than importing a type out of
 * `components/`, and `PhotoViewer`'s `readonly ViewerPhoto[]` accepts this structurally with no
 * adapter. A prop rename over there is then a compile error at the one call site that bridges them.
 *
 * ── INVARIANT 5 ───────────────────────────────────────────────────────────────────────────────
 * There is no caption field here and there must never be one. The image row's private prose is
 * `glm-4.6v`'s, `app/nina/page.tsx` deliberately drops it, and Nina's prompt is its only consumer.
 * The photo's accessible name comes from `NINA_SIDE_LABEL`, which is a phrase about *whose*
 * photograph it is and says nothing about what is in it.
 */
export interface ChatViewerPhoto {
  url: string
  /** The image row's `kind` — `'upload'` or `'generated'`. Carried for `photoSideOf`. */
  kind: string
  /** `'Foto kamu'` or `'Foto Nina'`. See `chatViewerPhotos`. */
  label: string
}

/**
 * One bubble's photographs, in `sort_order`, ready for `PhotoViewer`.
 *
 * ── WHY THE LABEL COMES FROM `photoSideOf` AND NOT FROM THE MESSAGE'S ROLE ────────────────────
 * `message.role` is a near-proxy and wrong in exactly the case R10 creates more of. A runner who
 * re-attaches one of Nina's selfies writes a row whose `kind` is still `'generated'`
 * (`lib/nina/actions.ts:183-189`) onto a message whose `role` is `'user'` — so `role` would put her
 * photograph under his name. `photoSideOf`'s own docstring exists to keep that honest, and this is
 * the surface that makes it visible: without a `label`, `PhotoViewer` falls back to
 * `SCREEN_KIND_LABEL[kind] ?? kind` and the dot row announces "generated foto".
 *
 * A missing `imageKinds` entry degrades to `'upload'` — `ChatImages`'s existing default, chosen for
 * its own recorded reason: the app's uploads are his, and defaulting an unknown kind to "hers"
 * would put a stranger's photo under her name.
 *
 * ── WHY THE PARAMETER IS SPELLED `imageUrls` / `imageKinds` ──────────────────────────────────
 * Because that is `ChatMessage`'s spelling, and `ChatScreen` hands the message straight in. The
 * plan specified `{ urls, kinds }` here and `chatViewerPhotos(viewerMessage)` at the call site,
 * which cannot both be true; taking the message's own field names is the half that needs no
 * adapter, and a structural parameter type keeps this module from importing anything out of
 * `components/`.
 */
export function chatViewerPhotos(
  message:
    | { imageUrls?: readonly string[] | null; imageKinds?: readonly string[] | null }
    | null
    | undefined,
): ChatViewerPhoto[] {
  const urls = message?.imageUrls
  if (urls == null || urls.length === 0) return []
  const kinds = message?.imageKinds
  return urls.map((url, index) => {
    const kind = kinds?.[index] ?? 'upload'
    return { url, kind, label: NINA_SIDE_LABEL[photoSideOf(kind)] }
  })
}

/**
 * Which photo the overlay should show, given the index it was opened at and how many photos there
 * now are. `null` means there is nothing to show and the viewer must close.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────────────────────────
 * The overlay holds a message id and an index, and derives the list from `messages` on every render
 * — so the list CAN change underneath it. Two ways, both real: `router.refresh()` on a service
 * worker push re-renders the server list, and phase 7's message delete takes a bubble and its
 * photo rows with it. `PhotoViewer` does `photos[index]!` and would then call `nameOf(undefined)`,
 * which throws.
 *
 * Clamping rather than closing when the list merely SHRANK is the friendlier answer: the photo he
 * was looking at is gone, and landing on its neighbour beats an overlay that blinks shut. When the
 * whole message is gone there is no neighbour, and closing is the only honest option.
 */
export function viewerIndex(index: number, count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null
  if (!Number.isFinite(index)) return 0
  return Math.min(Math.max(Math.trunc(index), 0), count - 1)
}

/**
 * The image row's id at this position, or `null` when there is none — which is the whole of "can
 * this photo be attached", and therefore of whether the attach control renders.
 *
 * `null` is a real and common answer, not a bug: `ChatScreen`'s optimistic row carries no ids
 * because the rows it describes have not been written yet (see this phase's plan, H3). Tap-to-view
 * and download work on such a photo; attach does not, until the next full load.
 */
export function attachableIdAt(
  ids: readonly string[] | null | undefined,
  index: number,
): string | null {
  const id = ids?.[index]
  return typeof id === 'string' && id.length > 0 ? id : null
}
