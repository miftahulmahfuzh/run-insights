import 'server-only'

import { photoViewerPath, type PhotoPointer, type PhotoPointerKind } from '@/lib/photos/pointer'
import type { NinaPushKind } from './payload'
import { notifyNinaPush } from './send'

/**
 * **R1's notification, and the door phases 3 and 4 knock on.**
 *
 * Five upload routes will call this and none of them may build a URL, choose a kind or write a
 * sentence: they hand over the pointer their cross-table lookup found and this function does the
 * rest. That is the whole reason it exists — `lib/admin/chatPhotoActions.ts:407-416` is the
 * cautionary precedent, where one route owns its own push body and nothing else can agree with it.
 *
 * ── IT ADDS NO CATCH OF ITS OWN, AND ITS CALLERS STILL WRAP IT ───────────────────────────────
 * `notifyNinaPush` already swallows everything a PUSH can do wrong — no VAPID, no subscriptions,
 * a dead endpoint, a 500 from Apple — so in practice nothing reaches this frame. This function
 * deliberately does NOT add a second `try` on top of that: a rejection arriving here means the
 * bookkeeping itself failed, which is a different fault from an unreachable phone and must not be
 * silently absorbed in a third place. Every call site wraps it instead, the shape
 * `lib/nina/proactive.ts:702` set and all four existing writers copy — the row is already
 * committed when this runs, and an unreachable phone must never turn a successful upload into a
 * failed one. Phases 3 and 4 both state this expectation in their own `Requires` and both wrap.
 */

/** The `NINA_PUSH_KINDS` entry, as a value, so no call site spells the literal. */
export const DUPLICATE_IMAGE_PUSH_KIND: NinaPushKind = 'duplicate_image'

/**
 * What the lock screen says, per table. Indonesian, like every other user-facing string in this
 * app, and short: `PUSH_BODY_MAX_CHARS` is 180 and the OS truncates long before that anyway.
 *
 * The kind is named in the sentence because "you already have this" is only useful with "…over
 * there" attached — the runner's three collections are three different screens and a notification
 * that does not say which one is a notification that has to be tapped to be understood.
 */
export const DUPLICATE_IMAGE_PUSH_BODY: Record<PhotoPointerKind, string> = {
  shot: 'Foto ini sudah ada di galeri lari kamu. Ketuk buat lihat yang tersimpan.',
  avatar: 'Foto ini sudah ada di album Nina. Ketuk buat lihat yang tersimpan.',
  image: 'Foto ini sudah ada di chat Nina. Ketuk buat lihat yang tersimpan.',
}

/**
 * One duplicate, one notification.
 *
 * ── THE `messageId` FIELD CARRIES THE PHOTOGRAPH'S ID, NOT A BUBBLE'S ────────────────────────
 * `buildNinaPushPayload` takes `messageId` off the first bubble it is handed, and there is no
 * bubble here — this notification is about an upload. Passing the pointer's own id is the honest
 * value and `NinaPushPayload.messageId`'s comment now records the exception. Nothing reads the
 * field but a log line.
 *
 * ── THE TAG IS STILL `'nina'`, SO A SECOND DUPLICATE REPLACES THE FIRST ──────────────────────
 * Every notification this app sends shares one tag on purpose (`PUSH_NOTIFICATION_TAG`), so a
 * burst does not stack in the tray. An admin dropping a folder of forty photographs, six of them
 * duplicates, therefore sees ONE notification pointing at the last duplicate found rather than
 * six — which is the behaviour that tag was chosen for, and a second tag here would undo it for
 * exactly the noisiest case in the feature.
 *
 * Takes a `PhotoPointer` rather than a `ResolvedPhotoPointer`: the `url` field on the resolved
 * form is the photograph's BLOB url, and the notification must carry the app path instead. Widening
 * the parameter means a caller cannot pass the wrong one of the two by accident.
 */
export async function notifyDuplicateImagePush(
  userId: string,
  pointer: PhotoPointer,
): Promise<void> {
  await notifyNinaPush(
    userId,
    [{ id: pointer.id, body: DUPLICATE_IMAGE_PUSH_BODY[pointer.kind] }],
    DUPLICATE_IMAGE_PUSH_KIND,
    photoViewerPath(pointer),
  )
}
