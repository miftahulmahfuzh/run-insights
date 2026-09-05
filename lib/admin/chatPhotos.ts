import { NINA_IMAGE_CAPTIONS } from '@/lib/nina/imagefail'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'

/**
 * What `/admin/photos` may write into Nina's chat collection: where the bytes land, what they may
 * be, how big they may get, and which message a photograph's removal takes with it. R2, phase 3.
 *
 * The counterpart of `lib/admin/avatars.ts` for `nina_message_images`, and pure for the same stated
 * reason: `components/admin/ChatPhotoControls.tsx`, `components/admin/ChatPhotoAdd.tsx` and
 * `components/admin/chatPhotoUpload.ts` (client modules), `app/api/admin/nina/upload/route.ts` (a
 * Route Handler), `lib/admin/chatPhotoActions.ts` (Server Actions) and
 * `tests/admin.chatPhotos.test.ts` all have to agree, and a constant that is agreed rather than
 * shared is a constant that will one day disagree.
 *
 * ── THE PREFIX IS IMPORTED, NOT DECLARED ────────────────────────────────────────────────────
 * RULING A6: `NINA_BLOB_PREFIX = 'nina/'` has exactly one definition, in `lib/nina/images.ts`,
 * which is pure and zero-import precisely so every host can reach it. `lib/admin/avatars.ts:1` does
 * the same thing for the same reason.
 *
 * ── THE SHAPE IS HERS, WITH A DIFFERENT CONTAINER, AND THAT IS DELIBERATE ───────────────────
 * A GENERATED chat photograph lives at `nina/<userId>/selfie-<id>.png` — `ninaImagePathname`
 * (`lib/nina/imagerecipe.ts:126`), written by `scripts/nina-image-worker.ts:383`. NOT under
 * `chat/`: `ninaChatPathname` is the RUNNER composer's shape for his own uploads.
 *
 * So a hand-added photograph takes the same prefix, the same `selfie-` segment and the same id
 * length — and `.jpg` instead of `.png`. Three reasons, in order of weight:
 *
 *   1. **PNG is the worker's ENVIRONMENT, not the collection's format.**
 *      `lib/nina/imagerecipe.ts:62`, verbatim: *"Qwen returns PNG bytes and there is no `sharp` on
 *      the worker, so PNG is what gets stored."* The browser here has an encoder. An operator's
 *      source is a photograph — JPEG on disk far more often than not — and re-encoding a lossy JPEG
 *      to lossless PNG inflates it five to twenty times for zero quality gain, into the one table
 *      `/nina/about` downloads whole with `next/image` ruled out
 *      (`components/nina/NinaPhotoGrid.tsx:56-58`).
 *   2. **`.jpg` is not a new shape.** `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:73`)
 *      already admits `(selfie|avatar)-<id>.(png|jpg)`, because `scripts/nina-profpic.mjs` writes
 *      `avatar-<id>.jpg`. `scripts/blob-reap.mjs`, which now knows the `nina/` prefix, therefore
 *      learns ONE pattern and not two — ruling D4's stated goal, and the one consequence of a
 *      pathname choice that can cost real data.
 *   3. **Nothing runner-facing reads `pathname`.** `photoSideOf`, `chatViewerPhotos`,
 *      `galleryPhotos` and the chat bubble renderer read `kind`, `blob_url` and `sort_order`. The
 *      readers of `pathname` are `/admin`, two server log lines and the reaper — all admin-facing,
 *      which is where invariant 7 permits the distinction to be visible.
 *
 * ── ONE PREDICATE, TWO WINDOWS ──────────────────────────────────────────────────────────────
 * `addRandomSuffix: true` means Blob rewrites the pathname it was asked for, so the REQUESTED form
 * carries a 12-symbol id and the STORED form carries more. `ADMIN_CHAT_PHOTO_ID_RE` admits 12-24
 * and `isAdminChatPhotoPathname` is used for both — at mint time (where it is slightly loose: a
 * client could ask for a 24-symbol id, which is harmless, since the id is a name inside the
 * caller's own folder and not a credential) and at action time (where the loose window is exactly
 * right). `lib/nina/images.ts`'s `NINA_CHAT_ID_RE` made the same call for the same reason, and the
 * alternative — two predicates that must stay in step — is the drift it avoided. The unit suite
 * pins the REQUESTED form against `NINA_IMAGE_PATHNAME_RE`'s stricter `{12}`.
 */

/**
 * The route every action here revalidates. Phase 2 owns the page; this is the single place phase 3
 * spells its path, so a route rename is one edit.
 */
export const ADMIN_CHAT_PHOTOS_PATH = '/admin/photos'

/**
 * `'selfie'` — `NinaImagePurpose`'s chat value, spelled here rather than imported so this module
 * does not depend on `lib/nina/imagerecipe.ts` at runtime. `tests/admin.chatPhotos.test.ts` asserts
 * `adminChatPhotoPathname` and `ninaImagePathname(_, 'selfie', _)` agree up to the extension, which
 * is the same "checked rather than merely intended" mitigation `tests/nina.imagerecipe.test.ts`
 * uses for `NINA_BLOB_PREFIX`.
 */
export const ADMIN_CHAT_PHOTO_PURPOSE = 'selfie'

/** JPEG, always, whatever the operator picked. See the header. */
export const ADMIN_CHAT_PHOTO_EXT = 'jpg'
export const ADMIN_CHAT_PHOTO_CONTENT_TYPE = 'image/jpeg'

/**
 * 12 requested, up to 24 stored once Blob has appended its random suffix. See the header's
 * "one predicate, two windows".
 */
export const ADMIN_CHAT_PHOTO_ID_RE = /^[A-Za-z0-9_-]{12,24}$/

/**
 * 2 MB, and it is a FOURTH number on purpose — none of the three in the store was inherited.
 *
 * NOT `NINA_CHAT_MAX_UPLOAD_BYTES` (900 000): that is HIS side's cap and is ~4x the measured
 * 120-200 KB output of one pipeline — `browser-image-compression` at 768 px short edge, q0.75. A
 * different encoder at q0.90 crossing it would surface as a bare "upload failed".
 *
 * NOT `ADMIN_AVATAR_MAX_UPLOAD_BYTES` (8 MB): that exists because an avatar is deliberately never
 * re-encoded. A chat photo always is.
 *
 * And the real reference point, which neither of those is: the worker's own selfie is UNCAPPED —
 * `store()` calls `put` with no `maximumSizeInBytes` at all — and a 768x1024 PNG runs 1-2 MB. 2 MB
 * clears that, so an admin photo is never the biggest object in the folder, while still being ~6x
 * what `encodeChatPhotoJpeg` actually produces at 1024 px / q0.90 and therefore still loud about a
 * raw original that slipped through.
 */
export const ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** A sanity ceiling on the dimensions the client reports. Nothing real is 12000 px. */
export const ADMIN_CHAT_PHOTO_MAX_EDGE_PX = 12_000

/** Longest URL any store produces, with room. A bound is cheaper than a `text` column overflow. */
export const ADMIN_CHAT_PHOTO_MAX_URL_CHARS = 2048

/** `nina/<userId>/selfie-<id>.jpg` — what the client asks for. Blob appends its own suffix. */
export function adminChatPhotoPathname(userId: string, id: string): string {
  return `${NINA_BLOB_PREFIX}${userId}/${ADMIN_CHAT_PHOTO_PURPOSE}-${id}.${ADMIN_CHAT_PHOTO_EXT}`
}

/**
 * The path-traversal defence and the "do not write beside anything else in the store" defence, in
 * one predicate — and written **segment by segment rather than by interpolating `userId` into a
 * RegExp**, which is `isNinaChatRequestPathname`'s rule and the stronger of the two precedents in
 * this repo: *"a user id is data, and data does not belong in a pattern."*
 * `isAdminAvatarRequestPathname` builds a pattern instead, and guards it with an alphabet test
 * first; this does not need the guard because it never builds one.
 *
 * The user id is INTERPOLATED FROM THE SESSION by the route and by every action, never taken from
 * the request, so a client cannot write into another user's folder even though there is one user.
 */
export function isAdminChatPhotoPathname(pathname: string, userId: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return false

  const parts = pathname.split('/')
  if (parts.length !== 3) return false
  const [prefix, owner, file] = parts

  // `NINA_BLOB_PREFIX` is `'nina/'`; as a path SEGMENT it is the same string without the slash.
  if (prefix !== NINA_BLOB_PREFIX.slice(0, -1)) return false
  if (owner !== userId) return false
  if (file == null) return false

  const head = `${ADMIN_CHAT_PHOTO_PURPOSE}-`
  const tail = `.${ADMIN_CHAT_PHOTO_EXT}`
  if (!file.startsWith(head) || !file.endsWith(tail)) return false

  return ADMIN_CHAT_PHOTO_ID_RE.test(file.slice(head.length, -tail.length))
}

/**
 * `https:` and nothing else. `lib/nina/actions.ts:816` is the precedent — it pairs a pathname
 * predicate with `blobUrl.startsWith('https://')` at ticket-mint time, and this is the same pair at
 * action time.
 */
export function isHttpsBlobUrl(value: string): boolean {
  if (value.length === 0 || value.length > ADMIN_CHAT_PHOTO_MAX_URL_CHARS) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:'
}

/**
 * The URL and the pathname must describe the SAME object, and this is stronger than anything the
 * album checks.
 *
 * A Server Action is a separate entry point from the token mint (Next 16's Server Actions guide:
 * *"the route is reachable to anyone who can send the same POST"*), so without this a well-formed
 * payload could point `blob_url` at any https URL on the internet while `pathname` — the column the
 * reference check in D5 and the reaper both read — claimed a file in our own store. The row would
 * render someone else's bytes, and `isBlobPathnameReferenced` would be answering a question about a
 * pathname nothing had ever written.
 *
 * A Vercel Blob URL is `https://<store>.public.blob.vercel-storage.com/<pathname>`, so the URL's
 * path is exactly `/` + the pathname. Our pathnames are the URL-safe alphabet plus `/` and `.`, so
 * nothing is percent-encoded; `decodeURIComponent` is there so a store that ever encodes one still
 * compares equal rather than silently failing every upload.
 */
export function blobUrlMatchesPathname(blobUrl: string, pathname: string): boolean {
  if (!isHttpsBlobUrl(blobUrl)) return false
  let url: URL
  try {
    url = new URL(blobUrl)
  } catch {
    return false
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(url.pathname)
  } catch {
    return false
  }
  return decoded === `/${pathname}`
}

/**
 * **Does this message exist ONLY to carry a photograph?** The whole of the empty-bubble rule.
 *
 * `finishSelfie`'s message is *"not a special kind of message"* — an ordinary `nina_messages` row
 * whose text is one of five canned captions — so removing its last image would leave a caption
 * bubble with no picture in the runner's chat, forever. This predicate is what lets
 * `removeChatPhotoAction` delete the message too.
 *
 * TWO clauses, and both are load-bearing:
 *
 *   · `role === 'nina'` protects HIS message. The R26 re-attach path
 *     (`lib/nina/actions.ts:518-530`) writes a `kind = 'generated'` image row onto a `role =
 *     'runner'` message that carries his own words. That message is his; only the image row goes.
 *   · the caption test protects HER words. `NINA_IMAGE_CAPTIONS` is a closed five-string array;
 *     `finishSelfie` and `addChatPhotoAction` both draw from it through `pickLine`, so the rule
 *     recognises both writers exactly. `role === 'nina'` ALONE would delete a real sentence of hers
 *     the day some later path attaches a photograph to one.
 *
 * The parameter is structural (`{ role, body }`) rather than `NinaMessageRow`, so this module stays
 * free of `lib/nina/queries.ts` and remains importable from a browser bundle and from the suite.
 * `body` is the DTO spelling of the `text` column (RULING A1).
 */
export function isNinaPhotoCarrierMessage(message: { role: string; body: string }): boolean {
  return message.role === 'nina' && NINA_IMAGE_CAPTIONS.includes(message.body)
}

/** One shape for all three actions, so the client has one branch and no `unknown`. */
export interface ChatPhotoActionResult {
  ok: boolean
  /** A sentence for the operator. Absent on success. */
  error?: string
  /** The `nina_message_images.id` the operation touched or created. */
  id?: string
  /**
   * A true thing about the outcome that is NOT a failure — `AdminActionResult.note`'s stated
   * purpose. Today it has one use: saying that the Blob object was kept because another row still
   * points at it (D5). `ok` is still `true`; the photograph is out of the collection, which is what
   * was asked.
   */
  note?: string
}
