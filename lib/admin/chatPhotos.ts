import { ninaPhotoProvenance } from '@/lib/nina/attach'
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
 * `addRandomSuffix: true` means Blob REWRITES the pathname it was asked for, so this module is
 * shown two different shapes and `isAdminChatPhotoPathname` is the only predicate for both:
 *
 *   · REQUESTED — `nina/<userId>/selfie-<12>.jpg`, at the token mint
 *     (`app/api/admin/nina/upload/route.ts:153`)
 *   · STORED — `nina/<userId>/selfie-<12>-<30>.jpg`, at action time
 *     (`lib/admin/chatPhotoActions.ts:113` and `:182`)
 *
 * The numbers are MEASURED, not intended. From the prod store `ptezanncca27s5kn`:
 * `selfie-Q8lWbmk0LG7W-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.jpg` — a 12-symbol `newId()`, a `-`, and
 * Vercel's 30-symbol suffix, so the id segment is **12 + 1 + 30 = 43**.
 *
 * This window used to be a single range, `{12,24}`, and 43 is outside it: every upload reached the
 * store and then had its row refused with *"That file did not land in her photo folder."* — one
 * orphaned object per click, in a paid store, with the error message pointing at the one thing that
 * had actually succeeded. `{12,24}` was the arithmetic somebody expected, never an object somebody
 * looked at, and the unit fixture that should have caught it had invented a 7-symbol suffix.
 *
 * So the suffix gets ITS OWN GROUP, which is the shape `lib/extract/constants.ts:103-107` already
 * uses and already argues for: `SHOT_STORED_PATHNAME_RE` bounds the suffix `{16,64}` and says why —
 * *"the bound is deliberately loose rather than pinned at the 30 currently observed — this regex's
 * job is our prefix and alphabet, not an internal of Vercel's we do not control."* Two groups
 * rather than one widened range, for two reasons: a single `{12,48}` would ALSO admit a 30-symbol
 * REQUESTED id at mint time, and it would drift again the day Vercel changes the suffix length.
 *
 * The requested half is now `{12}` exactly rather than `{12,24}` — the length `newId()` emits, and
 * the same bound `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:96`) and `lib/admin/avatars.ts`
 * already use. The mint therefore gets TIGHTER here, not looser: 13-24 was always more than
 * `newId()` could produce and no caller in the repo ever asked for it.
 *
 * A 12-symbol `newId()` may itself contain and END with `-` — its alphabet is the 64 URL-safe
 * symbols (`lib/id.ts:11`), and the real object
 * `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg` has the doubled `--` to prove it. That is
 * why the stored pattern anchors the first 12 symbols POSITIONALLY, with a fixed `{12}` quantifier,
 * instead of splitting the id on `-`.
 *
 * `lib/nina/images.ts`'s `NINA_CHAT_ID_RE` had the identical defect from the identical reasoning and
 * is fixed here in the identical shape: the runner's camera upload was failing one screen over as
 * *"Nina could not take this one."* The unit suite pins the REQUESTED form against
 * `NINA_IMAGE_PATHNAME_RE`'s `{12}`, which is now the same number rather than a stricter one.
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
 * What the client may ASK for: a `newId()`, and nothing longer. `lib/id.ts`'s `ID_LENGTH` is 12,
 * `components/admin/chatPhotoUpload.ts:112` is the only caller and it passes a bare `newId()`, so
 * `{12}` exactly — the same bound `NINA_IMAGE_PATHNAME_RE` (`lib/nina/imagerecipe.ts:96`) and
 * `lib/admin/avatars.ts` already use for their own request-only shapes.
 *
 * This used to read `{12,24}` and try to cover the stored form with the same range. It could not:
 * see `ADMIN_CHAT_PHOTO_STORED_ID_RE` and the header's "one predicate, two windows".
 */
export const ADMIN_CHAT_PHOTO_ID_RE = /^[A-Za-z0-9_-]{12}$/

/**
 * What Blob actually STORED, which is what `lib/admin/chatPhotoActions.ts` re-validates: the
 * requested 12 symbols, a `-`, and Vercel's random suffix. 43 symbols in every object measured in
 * the prod store, of which 30 are the suffix — 12 + 1 + 30.
 *
 * The suffix is bounded `{16,64}` rather than pinned at 30 because it is an internal of Vercel's we
 * do not control; that bound and that argument are `SHOT_STORED_PATHNAME_RE`'s, verbatim
 * (`lib/extract/constants.ts:103-107`), and this is deliberately the fourth copy of a number rather
 * than a fifth shared module — RULING A6 keeps `lib/nina/images.ts` zero-import, and
 * `lib/extract/constants.ts` already keeps its own.
 *
 * The leading `{12}` is a FIXED quantifier on purpose. A `newId()` draws from the 64 URL-safe
 * symbols (`lib/id.ts:11`), so it may itself contain and end with `-` — real object
 * `shots/Ve394_KsZZ7--Rb9EznPf5OE150rEwy1evUqr6Hbixd.jpg`. The separator is therefore found by
 * POSITION and never by splitting on `-`, and the first group cannot be greedy enough to swallow
 * part of the suffix.
 */
export const ADMIN_CHAT_PHOTO_STORED_ID_RE = /^[A-Za-z0-9_-]{12}-[A-Za-z0-9_-]{16,64}$/

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

/**
 * **How long a hand-written "what she can see in it" may be.** 2000 characters.
 *
 * MEASURED against production 2026-09-07, not chosen. `nina_message_images` holds three described
 * rows, at 85 / 362 / 461 characters (mean 303); `nina_avatars` holds thirteen, mean 415, max 550.
 * Every description in the store today is under 40% of this.
 *
 * The ceiling above the measurement is the VENDOR's, and it is a hard one:
 * `NINA_DESCRIBE_SYSTEM_PROMPT` asks for "60 to 140 words. One paragraph" (~1000 characters) and
 * `NINA_DESCRIBE_MAX_TOKENS` (500) caps the completion, which at this repo's own
 * `NINA_DESCRIBE_CHARS_PER_TOKEN = 3` is 1500 characters the describe pass can never exceed. So
 * 2000 lets an operator say MORE than `glm-4.6v` ever could — without inventing a new size for this
 * surface, because `NINA_NOTES_MAX` is also 2000 for the reason given at its declaration:
 * "roughly a screen of notes … small enough that it cannot drown the canon it is appended to."
 *
 * It is not decoration. `lib/nina/actions.ts:634-637` puts this string into
 * `NinaBackgroundTurnInput.imageDescriptions` verbatim, so it is prompt text paid for on every turn
 * that carries the photograph — ~670 tokens at the conversion above, against the ~150 a real row
 * costs today.
 */
export const ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000

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
 *
 * The id segment is checked against BOTH windows, because this one predicate is called with the
 * requested pathname at mint time and with the stored one at action time. See the header.
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

  // TWO WINDOWS, one predicate — see the header. The mint hands us the requested form, the two
  // Server Actions hand us the form Blob stored; either is a legitimate answer of `true` and
  // neither is expressible as a widening of the other's range.
  const id = file.slice(head.length, -tail.length)
  return ADMIN_CHAT_PHOTO_ID_RE.test(id) || ADMIN_CHAT_PHOTO_STORED_ID_RE.test(id)
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
 * that exists to deliver a picture — so removing its last image would leave a caption bubble with
 * no picture in the runner's chat, forever. This predicate is what lets `removeChatPhotoAction`
 * delete the message too.
 *
 * TWO clauses, and both are load-bearing:
 *
 *   · `role === 'nina'` protects HIS message. The R26 re-attach path
 *     (`lib/nina/actions.ts:518-530`) writes a `kind = 'generated'` image row onto a `role =
 *     'runner'` message that carries his own words. That message is his; only the image row goes.
 *   · `photoOnly` protects HER words — and it is a fact about the row now, not a guess about its
 *     text. Every writer of a photo bubble sets it: `addChatPhotoAction`, `finishSelfie`, and
 *     `scripts/nina-image-worker.ts`.
 *
 * ── THE CAPTION TEST IS STILL HERE, AS A LEGACY CLAUSE, AND IT IS NOT DEAD CODE ─────────────
 * It used to be the whole rule: *"`NINA_IMAGE_CAPTIONS` is a closed five-string array;
 * `finishSelfie` and `addChatPhotoAction` both draw from it through `pickLine`, so the rule
 * recognises both writers exactly."* That stopped being true the moment a caption could be written
 * by a model, which is why the marker exists. But every row written **before** migration 0008 has
 * `photo_only = false` on it unless the backfill reached it, and a backfill run against a database
 * is not a guarantee about a database restored from an older dump. The clause costs one array scan
 * over five short strings and it is the difference between an old bubble being removable and not.
 *
 * It is safe in a way it was not before: a free-text caption can never collide with the array,
 * because `NINA_IMAGE_CAPTIONS` is now closed by definition — `lib/nina/imagefail.ts` documents it
 * as a historical set that must not grow, and `ninaImageCaption` draws from a subset.
 *
 * The parameter stays structural so this module keeps out of `lib/nina/queries.ts` and remains
 * importable from a browser bundle and from the suite. `body` is the DTO spelling of the `text`
 * column (RULING A1); `photoOnly` is optional so a caller holding a row from before this column
 * existed — or a test fixture written by hand — still typechecks and lands on the legacy clause.
 */
export function isNinaPhotoCarrierMessage(message: {
  role: string
  body: string
  photoOnly?: boolean
}): boolean {
  if (message.role !== 'nina') return false
  return message.photoOnly === true || NINA_IMAGE_CAPTIONS.includes(message.body)
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

/* ── media-dedupe P3: the add-path dedup decision ──────────────────────────────────────────── */

/**
 * The row a duplicate claim is answered from, narrowed to what the decision reads. A
 * `NinaImageRow` satisfies it; the projection is named here so this pure module states its inputs
 * instead of importing the query module's row shape.
 */
export interface ChatPhotoKeeper {
  id: string
  blobUrl: string
  pathname: string
  description: string | null
  sourceAvatarId: string | null
  sourceImageId: string | null
  /**
   * The hash the keeper's OWN object was measured against (or NULL — an old row the sweep's
   * pass-1 fill has not reached). Since the source-key skip (2026-09-10's measured defect) this
   * is what a duplicate row must carry: the reference renders the keeper's bytes, so the only
   * honest hash for it is the keeper's — the client's claim may describe an encode nobody stored.
   */
  contentHash: string | null
}

/** What `addChatPhotoAction` writes, and what it releases afterwards. */
export interface ChatPhotoAddPlan {
  blobUrl: string
  pathname: string
  /** F37's pair: non-null on either makes the row a REFERENCE the collection reads skip. */
  sourceAvatarId: string | null
  sourceImageId: string | null
  /**
   * The claim on an ORIGINAL; on a duplicate, the keeper's own measured hash (NULL when it never
   * had one). One rule underneath: a row's content_hash describes the bytes its blob_url serves.
   */
  contentHash: string | null
  /** Copied from the keeper on a duplicate (`resolveAttachment`'s precedent); NULL on an original. */
  description: string | null
  /** The fresh object to release AFTER the row lands (ROW FIRST, BLOB SECOND), or null. */
  release: { blobUrl: string; pathname: string } | null
}

/**
 * **The add path's dedup decision, as a pure function.** Three answers, and the two duplicate
 * answers differ only in HOW the keeper was found — which is why the function takes both and
 * picks:
 *
 *   · `pinned` — the row the browser's pre-check found and NAMED (`duplicateOfId`). Read
 *     owner-scoped at action time by `getNinaMessageImage`, which does NOT filter references, so a
 *     row the sweep or the runner path merged into a keeper mid-flight is flattened to its own
 *     original by `ninaPhotoProvenance` — the ONE writer of these two columns — and the write
 *     stays correct without this module re-deriving provenance.
 *   · `hit` — the row the hash lookup found at action time (the race: the client DID put fresh
 *     bytes and a concurrent original claimed them first). The finder is originals-only, so this
 *     keeper is always flat.
 *   · neither — today's original, plus the hash claim.
 *
 * ── WHY THE DESCRIPTION IS COPIED ────────────────────────────────────────────────────────────
 * `resolveAttachment`'s precedent, verbatim in its reasons: the vision prose for these EXACT bytes
 * already exists on the keeper, `description` is the only text of the row that reaches Nina's
 * prompt, and a second `glm-4.6v` call over identical pixels is a second bill for a fact already
 * in hand. Copying it also makes the caption pass cheap on purpose: with `description` non-null,
 * `scheduleChatPhotoCaption`'s HALF ONE skips the eyes and HALF TWO captions the new bubble from
 * the copied prose — which is what the operator asked for (a photograph IN a conversation), not a
 * second description of it.
 *
 * ── WHY THE RELEASE IS COMPARING PATHNAMES ───────────────────────────────────────────────────
 * The pre-check skip path never PUT anything, so its payload ECHOES the keeper's pathname — same
 * string, nothing to release. The race path PUT a fresh object whose pathname cannot equal the
 * keeper's (`addRandomSuffix: true`), so THAT object is the loser and it is released after the
 * reference row is in. The comparison is what keeps one function honest about both.
 *
 * ── WHY A DUPLICATE CARRIES THE KEEPER'S HASH, NOT THE CLAIM'S ────────────────────────────────
 * A row's `content_hash` means "sha-256 over the bytes this row's blob_url serves", and a
 * reference serves the KEEPER's bytes. On the encode-key paths the claim and the keeper's hash
 * are the same value (that is what a byte match IS), so nothing changes there; on the source-key
 * skip (2026-09-10's measured defect) the claim describes an encode nobody stored — writing it
 * onto a row that renders the keeper's object would make the column lie. So the keeper's own
 * measured hash wins, NULL included: a keeper that never had a hash keeps this row hash-less,
 * which is the sweep's pass-1 fill's job to correct, not a claim's to guess at.
 */
export function planChatPhotoAddWrite(input: {
  claims: { blobUrl: string; pathname: string; contentHash: string | null }
  pinned: ChatPhotoKeeper | null
  hit: ChatPhotoKeeper | null
}): ChatPhotoAddPlan {
  const keeper = input.pinned ?? input.hit

  if (keeper == null) {
    return {
      blobUrl: input.claims.blobUrl,
      pathname: input.claims.pathname,
      sourceAvatarId: null,
      sourceImageId: null,
      contentHash: input.claims.contentHash,
      description: null,
      release: null,
    }
  }

  const provenance = ninaPhotoProvenance({
    kind: 'image',
    id: keeper.id,
    sourceAvatarId: keeper.sourceAvatarId,
    sourceImageId: keeper.sourceImageId,
  })

  return {
    blobUrl: keeper.blobUrl,
    pathname: keeper.pathname,
    sourceAvatarId: provenance.sourceAvatarId,
    sourceImageId: provenance.sourceImageId,
    contentHash: keeper.contentHash,
    description: keeper.description,
    release:
      input.claims.pathname === keeper.pathname
        ? null
        : { blobUrl: input.claims.blobUrl, pathname: input.claims.pathname },
  }
}
