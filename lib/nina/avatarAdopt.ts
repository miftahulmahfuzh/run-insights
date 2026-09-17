import 'server-only'

import { put } from '@vercel/blob'

import { newId } from '@/lib/id'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
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
 * ── WHY THIS DOES NOT IMPORT THE ADMIN ONE ────────────────────────────────────────────────────
 * `lib/admin` depends on `lib/nina`, never the reverse — every file read while planning this phase
 * obeys it, and `setChatPhotoAsAvatarAction` is a `'use server'` action behind `requireAdmin()`
 * besides, so it is not callable from a chat turn even if the layering allowed it. What is
 * duplicated is a CLOSED three-case lookup table (`jpg|png|webp` -> content type) and one pathname
 * template. That is a bounded, stable copy of a pure mapping, not of a business rule; the two are
 * held together by tests, exactly as `'chat-photo:'` already is across
 * `lib/nina/queries/images.ts:578` and `lib/admin/ninaAlbumAvatarActions.ts:145`.
 *
 * ── AND WHY IT MARKS THE ROW ANNOUNCED IN THE SAME BREATH ─────────────────────────────────────
 * `set_avatar` must NOT let her claim the change happened: the photograph does not exist yet, and
 * `announced_at IS NULL` is what `getUnannouncedCurrentNinaAvatar` polls so phase 10's cron can
 * speak once the camera lands. Here there is no camera. The bytes exist, the copy is synchronous,
 * and she answers in the same turn — so leaving `announced_at` NULL would queue the cron to announce
 * a change she has already described a moment earlier. `setCurrentNinaAvatar` re-arms it to NULL by
 * design; `markNinaAvatarAnnounced` immediately after is what closes it, and the order matters.
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

/** The three containers the album accepts — `ADMIN_AVATAR_EXTS`' set, spelled on this side of the
 * layering. See the module header for why it is copied and not imported. */
const NINA_AVATAR_EXTS = ['jpg', 'png', 'webp'] as const
type NinaAvatarExt = (typeof NINA_AVATAR_EXTS)[number]

/** `contentTypeForAvatarExt`'s three pairs, so the `put` names the type the container actually is. */
function contentTypeForNinaAvatarExt(ext: NinaAvatarExt): string {
  switch (ext) {
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
  }
}

/** The container a chat photograph arrives in, or `null` if it is not one the album accepts. */
function ninaAvatarExtFor(pathname: string): NinaAvatarExt | null {
  const ext = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase()
  return (NINA_AVATAR_EXTS as readonly string[]).includes(ext) ? (ext as NinaAvatarExt) : null
}

/**
 * `nina/<userId>/avatar-<id>.<ext>` — `adminAvatarPathname`'s form, same prefix, same `avatar-`
 * segment, same id length, so `scripts/blob-reap.mjs` will one day be taught one pattern and not
 * two. `NINA_BLOB_PREFIX` is IMPORTED (ruling A6: one definition, in `lib/nina/images.ts`).
 */
function ninaAdoptedAvatarPathname(userId: string, id: string, ext: NinaAvatarExt): string {
  return `${NINA_BLOB_PREFIX}${userId}/avatar-${id}.${ext}`
}

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
  | { ok: false; kind: 'missing' | 'reference' | 'unsupported' | 'copy_failed' }

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
 * `nina_message_images.id`: refuse a reference, find-or-copy into `nina_avatars`, promote, announce.
 *
 * The row is re-read here even when the resolver just held it. One extra indexed point read per
 * adoption buys a core that is correct when called with an id from anywhere — and an id is a claim
 * until `getNinaMessageImage`'s `user_id` predicate has proved it.
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

  const ext = ninaAvatarExtFor(row.pathname)
  if (ext == null) return { ok: false, kind: 'unsupported' }

  const sourceKey = `${NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX}${row.id}`

  /* RE-ADOPTION IS A CONSTRAINT DECISION, NOT A COUNT. The lookup is the policy — a second "pakai
   * foto ini" finds the first copy BEFORE any bytes move and just re-wears it. The
   * `nina_avatars_user_source_key_unq` index is the backstop for the race the lookup cannot close;
   * `copyChatPhotoIntoNinaAlbum` re-reads by key when the INSERT conflicts away. */
  const existing = await getNinaAvatarBySourceKey(userId, sourceKey)
  const avatar = existing ?? (await copyChatPhotoIntoNinaAlbum(userId, row, sourceKey, ext))
  if (avatar == null) return { ok: false, kind: 'copy_failed' }

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
 * `fetch` the chat photograph and `put` it beside her album as `avatar-`, then insert the row.
 * **BYTES FIRST, ROWS SECOND** — a failed copy writes nothing, while a failed insert at worst leaves
 * an orphan object, which is the recoverable direction and `scripts/blob-reap.mjs`' domain.
 *
 * The row records `put`'s RETURN and never the requested pathname: `addRandomSuffix: true` rewrites
 * it, and a row pointing at the requested form would point at an object that does not exist.
 *
 * `source: 'operator'` — the `NinaAvatarSource` member that had zero writers until now
 * (`lib/db/schema/nina/avatars.ts:16`), and the semantically exact one: a PERSON, not the generator,
 * picked this exact photograph. `'generated'` is the model-authored path and `'admin'` is
 * `/admin`'s; neither is true here.
 *
 * `description` is seeded from the chat row — the same bytes `glm-4.6v` already described, so
 * adopting a described photograph costs no second vendor call. A NULL simply stays NULL: the album's
 * deferred describe lives in `lib/admin/ninaAlbumDeferredDescribe.ts` and this layer must not reach
 * for it. See Handoffs.
 *
 * Never throws. A vendor-shaped failure becomes `null`, becomes `{ ok: false, kind: 'copy_failed' }`,
 * becomes one sentence she says in her own voice — an unhandled rejection inside a chat turn would
 * cost the whole reply over one tool call.
 */
async function copyChatPhotoIntoNinaAlbum(
  userId: string,
  row: NinaImageRow,
  sourceKey: string,
  ext: NinaAvatarExt,
): Promise<NinaAvatarRow | null> {
  try {
    const response = await fetch(row.blobUrl)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()

    const stored = await put(ninaAdoptedAvatarPathname(userId, newId(), ext), bytes, {
      access: 'public',
      addRandomSuffix: true,
      contentType: contentTypeForNinaAvatarExt(ext),
    })

    const [inserted] = await insertNinaAvatars(userId, [
      {
        blobUrl: stored.url,
        pathname: stored.pathname,
        source: 'operator',
        folder: '',
        filename: null,
        sourceKey,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        description: row.description,
      },
    ])
    if (inserted != null) return inserted

    /* The unique index raced the lookup — something adopted this photograph between the read and the
     * insert. The existing row is what he meant; the second object is the reaper's. */
    return getNinaAvatarBySourceKey(userId, sourceKey)
  } catch (cause) {
    console.error(
      '[nina] chat-photo avatar adoption copy failed',
      { id: row.id, pathname: row.pathname },
      cause,
    )
    return null
  }
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
