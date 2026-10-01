import { NINA_SIDE_LABEL, photoSideOf } from './album'
import type { PhotoPointer } from '@/lib/photos/pointer'

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
  /**
   * The 2026-09-18 fullscreen-to-job-detail link — `ViewerPhoto.id`, the handle its `headerAction`
   * needs. Set only on a `kind: 'generated'` photo whose message carries a `turn_id` (the caption
   * bubble `finishSelfie` writes); `undefined` for every upload and for a generated photo with no
   * job to point at (an old row, written before this column existed). See `chatViewerPhotos`.
   */
  id?: string
}

/**
 * One bubble's photographs, in `sort_order`, ready for `PhotoViewer`.
 *
 * ── WHY THE LABEL COMES FROM `photoSideOf` AND NOT FROM THE MESSAGE'S ROLE ────────────────────
 * `message.role` is a near-proxy and wrong in exactly the case R10 creates more of. A runner who
 * re-attaches one of Nina's selfies writes a row whose `kind` is still `'generated'`
 * (`lib/nina/actions/send.ts`'s `resolveAttachment`) onto a message whose `role` is `'user'` — so `role` would put her
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
    | {
        imageUrls?: readonly string[] | null
        imageKinds?: readonly string[] | null
        turnId?: string | null
      }
    | null
    | undefined,
): ChatViewerPhoto[] {
  const urls = message?.imageUrls
  if (urls == null || urls.length === 0) return []
  const kinds = message?.imageKinds
  const turnId = message?.turnId
  return urls.map((url, index) => {
    const kind = kinds?.[index] ?? 'upload'
    const id = kind === 'generated' && turnId != null && turnId !== '' ? turnId : undefined
    return { url, kind, label: NINA_SIDE_LABEL[photoSideOf(kind)], id }
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

/**
 * One photograph of the OPEN CONVERSATION, carrying where it came from.
 *
 * ── WHY THE OWNER TRAVELS WITH THE PHOTO ──────────────────────────────────────────────────────
 * R1 pages the overlay across the whole session, so the flat position `PhotoViewer` hands back
 * names a photograph and nothing else. Everything the chat surface then wants to do with that
 * photograph is a question about its OWNER: re-aiming the overlay's `{ messageId, index }`
 * identity (invariant 3), arming the attach slot, and scrolling the history to the bubble that
 * sent it (R2). Deriving the owner from a flat index at each of those three call sites would be
 * the same `find` written three times, and wrong in three different ways the first time a row
 * vanished underneath it. Carrying it is one rule, computed in the one pass where the message is
 * already in hand.
 *
 * ── INVARIANT 5 STILL HOLDS, BY CONSTRUCTION ──────────────────────────────────────────────────
 * This extends `ChatViewerPhoto` and adds three fields about POSITION and OWNERSHIP. There is
 * still no caption field and there must never be one: `glm-4.6v`'s image prose is private and
 * `app/nina/page.tsx` deliberately drops it before any of this is reachable.
 */
export interface ChatSessionPhoto extends ChatViewerPhoto {
  /** `ChatMessage.id` of the bubble that sent it. `#nina-msg-<id>` is its anchor in the document. */
  messageId: string
  /** Its position among THAT message's photos — the index `ChatImages`'s `onOpen` counts in. */
  indexWithinMessage: number
  /**
   * The image row's id, or `null` when there is none — `attachableIdAt` for this photograph,
   * resolved here because this is the one place the message's parallel `imageIds` array and the
   * position into it are both in hand. `ChatScreen` renders the attach control only when it is
   * non-null, which is unchanged: `null` is the optimistic row, whose rows are not written yet.
   *
   * Deliberately NOT `ChatViewerPhoto.id`, which is the TURN (job) id the header's job-detail link
   * needs. Two different handles to two different tables; naming them apart is what stops a future
   * edit arming the composer with a job id.
   */
  attachId: string | null
  /**
   * **The same row, spelled as a `PhotoPointer`** — `ViewerPhoto`'s admin handle, which is what
   * the copy-admin-link button in the viewer header mints its URL from (2026-10-01, R1/R3).
   *
   * ── WHY A THIRD FIELD, WHEN `attachId` IS THE SAME STRING ────────────────────────────────────
   * Because the two consumers want different shapes and sit on different sides of a prop boundary.
   * `attachId` is read by `usePhotoViewer` and `ChatScreen`, which hold the full `ChatSessionPhoto`.
   * The header control is handed a `ViewerPhoto` by `PhotoViewer` and can see only what that
   * narrower type declares — so the handle has to live there, under the name the overlay's own
   * contract gives it, carrying the TABLE as well as the id. Deriving it here rather than at the
   * call site keeps the "this is a `nina_message_images` row" claim in the one module that is
   * allowed to make it.
   *
   * **ABSENT, not `null`, when there is no row** — the optimistic bubble whose rows have not been
   * written yet, the same condition that already hides the attach control. `headerAction` then
   * renders no button for it, which is the promise every optional `ViewerPhoto` field makes.
   *
   * Invariant 5 is untouched: this is an id, never prose.
   */
  rowPointer?: PhotoPointer
}

/**
 * Every photograph the open conversation is showing, in conversation order, ready for
 * `PhotoViewer` — R1's list.
 *
 * ── WHY IT REUSES `chatViewerPhotos` PER MESSAGE ──────────────────────────────────────────────
 * Because the per-photo rules — `photoSideOf` for the label, the `'upload'` default for a missing
 * kind, the job id only on a generated photo whose message carries a `turn_id` — are already
 * stated there, at length and with their reasons. A second loop restating them would drift the
 * first time one of them changed, and the one that matters most (a RE-ATTACHED selfie stays
 * "Foto Nina" on a message whose role is `'user'`) is exactly the kind that drifts silently.
 *
 * ── WHAT "THAT CHAT SESSION" MEANS ────────────────────────────────────────────────────────────
 * Whatever `messages` holds, which `app/nina/page.tsx:113` caps at `CHAT_HISTORY_LIMIT = 200`
 * messages of the active session. A photograph older than that window is not in this list, has no
 * `#nina-msg-` anchor, and could not be scrolled to — so it is both the honest and the only
 * satisfiable reading of R1 (plan invariant 2).
 *
 * The parameter is spelled structurally, and with `ChatMessage`'s own field names, for the reason
 * `chatViewerPhotos`'s header gives: a pure module under `lib/` states what it consumes rather
 * than importing a type out of `components/`.
 */
export function chatSessionPhotos(
  messages:
    | readonly {
        id: string
        imageUrls?: readonly string[] | null
        imageIds?: readonly string[] | null
        imageKinds?: readonly string[] | null
        turnId?: string | null
      }[]
    | null
    | undefined,
): ChatSessionPhoto[] {
  if (messages == null) return []
  const flat: ChatSessionPhoto[] = []
  for (const message of messages) {
    const photos = chatViewerPhotos(message)
    for (let index = 0; index < photos.length; index += 1) {
      const attachId = attachableIdAt(message.imageIds, index)
      flat.push({
        ...photos[index]!,
        messageId: message.id,
        indexWithinMessage: index,
        attachId,
        /* Spread rather than `rowPointer: attachId === null ? undefined : …`, because
         * `Object.keys` counts a key whose value is `undefined` and the optimistic row must carry
         * no handle at all — "absent renders nothing" is a claim about the KEY, and
         * `chatphotos.test.ts` asserts the exact key set. */
        ...(attachId === null ? {} : { rowPointer: { kind: 'image' as const, id: attachId } }),
      })
    }
  }
  return flat
}

/**
 * Where in the session list the overlay's `{ messageId, index }` identity currently points —
 * `null` means there is nothing to show and the viewer must close.
 *
 * ── WHY THE OVERLAY DOES NOT JUST STORE THIS NUMBER ───────────────────────────────────────────
 * Invariant 3, which is `usePhotoViewer`'s own recorded reasoning: `messages` changes underneath
 * an open overlay — a service-worker push calls `router.refresh()`, R8's delete takes a bubble and
 * its photo rows with it — and a stored flat position would then silently re-aim at a DIFFERENT
 * photograph, one bubble's worth further along. A message id plus a position inside that message
 * survives everything except its own message going away, and this function is where that survival
 * is decided.
 *
 * ── THE THREE ANSWERS, AND WHY ────────────────────────────────────────────────────────────────
 * Exact hit → that position. The message is still here but has FEWER photos than it did → clamp to
 * its last one, `viewerIndex`'s "landing on the neighbour beats an overlay that blinks shut",
 * applied inside the owning bubble so a clamp never silently crosses into somebody else's message.
 * The message is gone entirely → `null`, and the caller closes.
 *
 * ── WHY THE EARLY `break` IS SAFE ─────────────────────────────────────────────────────────────
 * `chatSessionPhotos` emits a message's photographs contiguously, so once the scan has left the
 * owning message's run there is nothing further to find. Scanning on would only cost time.
 */
export function sessionPhotoIndex(
  photos: readonly { messageId: string; indexWithinMessage: number }[],
  messageId: string,
  indexWithinMessage: number,
): number | null {
  /* Same defensiveness `viewerIndex` applies to its own index, and for the same reason: a
   * non-finite position is a bug somewhere upstream, and landing on the message's first photo is
   * a better answer than propagating NaN into `photos[index]!`. */
  const wanted = Number.isFinite(indexWithinMessage) ? Math.trunc(indexWithinMessage) : 0
  let first = -1
  let last = -1
  for (let position = 0; position < photos.length; position += 1) {
    const photo = photos[position]!
    if (photo.messageId !== messageId) {
      if (first !== -1) break
      continue
    }
    if (first === -1) first = position
    last = position
    if (photo.indexWithinMessage === wanted) return position
  }
  if (first === -1) return null
  /* Reaching here means the owning message is present but `wanted` is outside its run — so it is
   * either below the first photo or past the last one, and the clamp is whichever end it fell off. */
  return wanted < 0 ? first : last
}
