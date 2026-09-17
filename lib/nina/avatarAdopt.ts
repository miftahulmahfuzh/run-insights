import 'server-only'

import {
  getNinaAvatar,
  getNinaAvatarBySourceKey,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  getLatestOriginalNinaSessionPhoto,
  insertNinaAvatars,
  markNinaAvatarAnnounced,
  setCurrentNinaAvatar,
  type NinaAvatarRow,
  type NinaImageRow,
} from '@/lib/nina/queries'

/**
 * **R2: a photograph that already exists becomes her face, unchanged.** The chat-side counterpart of
 * `/admin/photos`' `setChatPhotoAsAvatarAction`, and the third avatar path in the app:
 *
 *   · `generateNinaAvatar` (`avatargen.ts`) — a NEW photograph, minutes later, announced by the cron.
 *   · `setChatPhotoAsAvatarAction` (`lib/admin/`) — an operator adopts one from `/admin/photos`.
 *   · this — the runner points at one mid-conversation and she adopts it before the reply goes out.
 *
 * ── LINK, NOT COPY (media-album-unified-search R3) ────────────────────────────────────────────
 * This module used to `fetch` + `put` a second Blob object for every chat-triggered adoption. R3
 * rewrote the admin-side twin, `linkChatPhotoIntoAlbum`, into a pointer (`nina_avatars.source_image_id`
 * → `nina_message_images.id`, no second object, description/keywords/bytes all read live off the
 * Media row) but never reached this file — a gap discovered from a real report: a chat-adopted
 * profile picture kept showing an old photo after the Media original was replaced in `/admin`,
 * because this row carried no link at all. `linkChatPhotoIntoNinaAlbum` below is the fix: same
 * pointer shape as the admin path, so both the text redirect (`lib/nina/queries/avatarPointer.ts`)
 * and the image-bytes redirect apply to a chat-adopted avatar exactly as they do to an admin one.
 *
 * ── WHY THIS DOES NOT IMPORT THE ADMIN ONE ────────────────────────────────────────────────────
 * `lib/admin` depends on `lib/nina`, never the reverse — every file read while planning this phase
 * obeys it, and `setChatPhotoAsAvatarAction` is a `'use server'` action behind `requireAdmin()`
 * besides, so it is not callable from a chat turn even if the layering allowed it. What is
 * duplicated is one INSERT shape, held together by tests, exactly as `'chat-photo:'` already is
 * across `lib/nina/queries/images.ts:578` and `lib/admin/ninaAlbumAvatarActions.ts:145`.
 *
 * ── AND WHY IT MARKS THE ROW ANNOUNCED IN THE SAME BREATH ─────────────────────────────────────
 * `set_avatar` must NOT let her claim the change happened: the photograph does not exist yet, and
 * `announced_at IS NULL` is what `getUnannouncedCurrentNinaAvatar` polls so phase 10's cron can
 * speak once the camera lands. Here there is no camera. The bytes already exist, the link is
 * synchronous, and she answers in the same turn — so leaving `announced_at` NULL would queue the
 * cron to announce a change she has already described a moment earlier. `setCurrentNinaAvatar`
 * re-arms it to NULL by design; `markNinaAvatarAnnounced` immediately after is what closes it, and
 * the order matters.
 */

/**
 * The dedupe key every adopted row carries, and the whole of invariant 5's idempotence. **The third
 * spelling of this prefix in the repo** — `lib/nina/queries/images.ts:578` reads it inside
 * `generatedChatPhotoScope`'s `NOT EXISTS`, `lib/admin/ninaAlbumAvatarActions.ts:145` writes it —
 * and the three cannot be one import (a db module must not import an actions module, a `'use
 * server'` module may not export a constant, and `queries/images.ts` builds it in SQL, not in TS).
 * They are pinned by test instead: `tests/nina.photoRefs.test.ts`, `tests/admin.chatPhotoAdoption.test.ts:132`
 * and this phase's `tests/nina.avatarFromPhoto.test.ts`.
 *
 * Exported so the test can pin it against the literal rather than re-spell it.
 */
export const NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX = 'chat-photo:'

/**
 * Which photograph "this one" is, resolved from STRUCTURE and never from a model-supplied id — the
 * model has never seen one (`lib/nina/context.ts` hands it `imageDescriptions: string[]`, prose
 * only), so an id-shaped tool argument could only ever be a guess.
 *
 * `'avatar'` is the Media/album re-share: those bytes are ALREADY a `nina_avatars` row, so the
 * adoption is a promotion and nothing is copied. See the phase plan's flagged-deviation table.
 */
export type NinaAdoptTarget =
  { kind: 'image'; imageId: string } | { kind: 'avatar'; avatarId: string } | { kind: 'none' }

/**
 * What the adoption did, or why it did not. Every `ok: false` is a TRUE answer to a legitimate
 * request — the caller returns them with `isError: false`, per `lib/nina/tools.ts`' ruling (g).
 *
 * `changed` distinguishes "it is hers now" from "it already was", so she does not pretend to have
 * just changed a picture that has been current since yesterday.
 */
export type NinaAvatarAdoptResult =
  | { ok: true; avatarId: string; changed: boolean }
  | { ok: false; kind: 'missing' | 'reference' | 'link_failed' }

/**
 * Resolve the referent, in the one order that matches how a person points at a photograph:
 *
 *   1. **Attached to the message he just sent.** "ganti profpic lu pake ini" with a tile above it.
 *      `getNinaMessageImagesForMessages` deliberately does NOT filter references (it is the bubble
 *      renderer's read), which is exactly what this needs — a Media attach IS a reference and is
 *      still a photograph he pointed at. It comes back ordered by `sort_order`, so the first entry
 *      is the leftmost tile, which is what "ini" means when he attached several.
 *   2. **Otherwise, the last photograph this conversation showed.** The production turn: the photo
 *      landed at 02:41:08 and "ganti profpic lu pake foto ini" at 02:43:47, on a message with no
 *      attachment of its own.
 *
 * A proactive turn has no runner message and therefore no referent — `{ kind: 'none' }`, and she
 * asks which one.
 */
export async function resolveNinaAdoptTarget(
  userId: string,
  sourceMessageId: string | null,
): Promise<NinaAdoptTarget> {
  if (sourceMessageId == null) return { kind: 'none' }

  const attached = await getNinaMessageImagesForMessages(userId, [sourceMessageId])
  const first = attached[0]
  if (first != null) return flattenToOriginal(first)

  const [message] = await getNinaMessagesByIds(userId, [sourceMessageId])
  if (message == null) return { kind: 'none' }

  const photo = await getLatestOriginalNinaSessionPhoto(userId, message.sessionId)
  if (photo == null) return { kind: 'none' }
  return { kind: 'image', imageId: photo.id }
}

/**
 * A reference row names bytes that live elsewhere; the adoption must act on wherever they live, not
 * on the pointer. `ninaPhotoProvenance` (`lib/nina/attach.ts:221`) guarantees `sourceImageId` always
 * names an ORIGINAL — it flattens a re-attached reference to its own source — so this is one hop and
 * never a chain. `sourceAvatarId` wins when both are set, because an album face re-attached twice
 * carries both and the album row is the copy that already exists.
 */
function flattenToOriginal(row: NinaImageRow): NinaAdoptTarget {
  if (row.sourceAvatarId != null) return { kind: 'avatar', avatarId: row.sourceAvatarId }
  if (row.sourceImageId != null) return { kind: 'image', imageId: row.sourceImageId }
  return { kind: 'image', imageId: row.id }
}

/**
 * **The core, and the function the phase's exit criteria are written against.** Given ONE
 * `nina_message_images.id`: refuse a reference, find-or-link into `nina_avatars`, promote, announce.
 *
 * The row is re-read here even when the resolver just held it. One extra indexed point read per
 * adoption buys a core that is correct when called with an id from anywhere — and an id is a claim
 * until `getNinaMessageImage`'s `user_id` predicate has proved it.
 *
 * ── LINK, NOT COPY — `media-album-unified-search` R3 ────────────────────────────────────────
 * This used to `fetch` the chat photograph and `put` it into a fresh `avatar-` object; that made
 * "ganti profpic lu pake foto ini" the one adoption path R3 never reached, because it lives in
 * `lib/nina` and R3's rewrite landed only in `lib/admin/ninaAlbumAvatarActions.ts`'s
 * `linkChatPhotoIntoAlbum` — same idea, different table's caller, never wired to this one. That gap
 * is what let a chat-adopted profile picture drift silently out of sync with a later Media Replace:
 * the album row it produced owned an independent copy of the bytes, with no `source_image_id` at
 * all, so nothing could have kept it current no matter how the read side redirected. `linkChatPhotoIntoNinaAlbum`
 * below is the chat-side twin of that same rewrite, not a new idea — no `fetch`, no `put`, no second
 * Blob object, and the row carries `sourceImageId` so the description/keyword redirect
 * (`lib/nina/queries/avatarPointer.ts`) and the image-bytes redirect both apply to it exactly as they
 * do to an admin-side link.
 *
 * No extension check any more either: that gate existed only to pick a `put` content type for a copy
 * that no longer happens, and the admin-side link has never had one.
 */
export async function adoptNinaChatPhotoAsAvatar(
  userId: string,
  imageId: string,
): Promise<NinaAvatarAdoptResult> {
  const row = await getNinaMessageImage(userId, imageId)
  if (row == null) return { ok: false, kind: 'missing' }

  /* Invariant 4, and `setChatPhotoAsAvatarAction`'s rule verbatim: a row carrying either provenance
   * column re-SHOWS a photograph that lives elsewhere, and adopting it would file a second copy of
   * bytes the original still owns. The tool never reaches this branch — `resolveNinaAdoptTarget`
   * flattens first — but the core must be correct on its own. */
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return { ok: false, kind: 'reference' }
  }

  const sourceKey = `${NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX}${row.id}`

  /* RE-ADOPTION IS A CONSTRAINT DECISION, NOT A COUNT. The lookup is the policy — a second "pakai
   * foto ini" finds the first link BEFORE any insert and just re-currents it. The
   * `nina_avatars_user_source_key_unq` index is the backstop for the race the lookup cannot close;
   * `linkChatPhotoIntoNinaAlbum` re-reads by key when the INSERT conflicts away. */
  const existing = await getNinaAvatarBySourceKey(userId, sourceKey)
  const avatar = existing ?? (await linkChatPhotoIntoNinaAlbum(userId, row, sourceKey))
  if (avatar == null) return { ok: false, kind: 'link_failed' }

  return promoteAndAnnounce(userId, avatar)
}

/**
 * The Media/album branch: the bytes are already a `nina_avatars` row, so there is nothing to copy
 * and nothing to dedupe — only the crown to move. Zero blob calls, zero inserts.
 */
export async function promoteNinaAvatarAsCurrent(
  userId: string,
  avatarId: string,
): Promise<NinaAvatarAdoptResult> {
  const row = await getNinaAvatar(userId, avatarId)
  if (row == null) return { ok: false, kind: 'missing' }
  return promoteAndAnnounce(userId, row)
}

/**
 * The shared tail, and the two statements invariant 6 is about.
 *
 * `setCurrentNinaAvatar` re-arms `announced_at` to NULL (its own docstring: "a hand-changed avatar
 * makes her speak") and is idempotent when the row is already current. `markNinaAvatarAnnounced`
 * then closes it, in this same request, because she is about to say so in this same reply. Its
 * return is ignored on purpose: `false` means the row was already announced, which is the state we
 * wanted anyway.
 *
 * `changed` is read BEFORE the promotion, since after it the answer is always "current".
 */
async function promoteAndAnnounce(
  userId: string,
  avatar: NinaAvatarRow,
): Promise<NinaAvatarAdoptResult> {
  const changed = !avatar.isCurrent
  const promoted = await setCurrentNinaAvatar(userId, avatar.id)
  if (!promoted) return { ok: false, kind: 'missing' }
  await markNinaAvatarAnnounced(userId, avatar.id)
  return { ok: true, avatarId: avatar.id, changed }
}

/**
 * Insert the album row that POINTS at a chat photograph. No `fetch`, no `put`, no second Blob
 * object, no second copy of the prose. `media-album-unified-search` R3 — the chat-triggered twin of
 * `linkChatPhotoIntoAlbum` (`lib/admin/ninaAlbumAvatarActions.ts`), duplicated rather than imported
 * for the layering reason this module's header already states (`lib/admin` depends on `lib/nina`,
 * never the reverse, and that module is `'use server'` besides — it may export only actions).
 *
 * `blobUrl`/`pathname` are the MEDIA row's own, verbatim: the two rows now name one object.
 * `sourceImageId` is the link itself, read by both the description/keyword redirect
 * (`lib/nina/queries/avatarPointer.ts`) and the image-bytes redirect. No `description` is seeded —
 * a pointer holds none; the Media row is the one place it lives.
 *
 * `source: 'operator'` — the `NinaAvatarSource` member for a PERSON, via chat, picking this exact
 * photograph; distinct from `'admin'`, `/admin`'s own promotion action.
 *
 * Never throws in the way the old byte-copying version had to guard against: there is no vendor
 * call left to fail. The one non-exceptional outcome — the unique index racing the lookup — is
 * handled the same way `linkChatPhotoIntoAlbum` handles it, by re-reading the row the winner wrote.
 */
async function linkChatPhotoIntoNinaAlbum(
  userId: string,
  row: NinaImageRow,
  sourceKey: string,
): Promise<NinaAvatarRow | null> {
  const [inserted] = await insertNinaAvatars(userId, [
    {
      blobUrl: row.blobUrl,
      pathname: row.pathname,
      source: 'operator',
      folder: '',
      filename: null,
      sourceKey,
      sourceImageId: row.id,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
    },
  ])
  if (inserted != null) return inserted

  // The unique index raced the lookup — another turn adopted this photograph between the read and
  // the insert. The row the winner wrote is what he meant, and it points at the same object and the
  // same prose, so there is nothing to reconcile and nothing to reap.
  return getNinaAvatarBySourceKey(userId, sourceKey)
}

/**
 * Resolve, then adopt. The one function `handleSetAvatarFromPhoto` calls, so the handler stays what
 * a handler should be: validate, call, decide what she is told.
 */
export async function setNinaAvatarFromExistingPhoto(
  userId: string,
  sourceMessageId: string | null,
): Promise<NinaAvatarAdoptResult | { ok: false; kind: 'none' }> {
  const target = await resolveNinaAdoptTarget(userId, sourceMessageId)
  if (target.kind === 'none') return { ok: false, kind: 'none' }
  if (target.kind === 'avatar') return promoteNinaAvatarAsCurrent(userId, target.avatarId)
  return adoptNinaChatPhotoAsAvatar(userId, target.imageId)
}
