import { formatNinaPhotoParam, PHOTO_PARAM } from '@/lib/nina/attach'

/**
 * An album photo, as a link into her chat. R2's *"just some kind of pointer to the existing file"*,
 * spelled as a URL.
 *
 * ── WHY A URL IS THE WHOLE POINTER ────────────────────────────────────────────────────────────
 * R2's optimisation is *"we dont actually reupload the photo into the chat, but just some kind of
 * pointer to the existing file"*, and this is that pointer in its entirety: a kind and a
 * twelve-character id in a query string. No bytes move, no blob is copied, no Server Action runs,
 * and `nina_avatars` is not read on this side at all. `sendNinaMessage`'s `resolveAttachment`
 * (`lib/nina/actions.ts`) turns the id back into a row when the message is actually sent —
 * owner-scoped, so *"a URL from a client is a claim, and an id resolved against `user_id` is a
 * fact"* keeps holding. Nothing in this file could weaken it if it tried; there is no URL of a
 * blob anywhere in it.
 *
 * ── WHY THE FORMATTER IS IMPORTED AND NOT INLINED ─────────────────────────────────────────────
 * `/admin` writes this string and `/nina` parses it, and they are in different phases and
 * different halves of the app. A template literal here — `?photo=avatar:${id}` — would be a second
 * place that knows the grammar, and therefore a place that can disagree about it. Phase 3 owns
 * `formatNinaPhotoParam` and `PHOTO_PARAM`; this module is the only writer of the link, so
 * there is exactly one spelling on each side and one import between them.
 *
 * ── WHY `new URL` AND NOT STRING CONCATENATION ────────────────────────────────────────────────
 * `URLSearchParams` percent-encodes the pointer's `:` to `%3A`, which is correct and invisible:
 * `searchParams` on the receiving page decodes it, so phase 3's parser is handed `avatar:<id>`
 * exactly as it was formatted. The test asserts that round trip rather than the literal bytes, so
 * a future encoding change cannot quietly break the link. `new URL` also throws on an origin that
 * is not an origin, which is the right failure: a malformed link that opens a broken tab is worse
 * than a stack trace in the one place that can only be reached by an admin.
 *
 * @param origin an absolute origin with no trailing slash — `shareOrigin()`'s output, never
 *   `window.location.origin`. See `ShareToNinaItem`'s header for why that distinction matters.
 * @param avatarId a `nina_avatars.id`.
 */
export function ninaPhotoShareUrl(origin: string, avatarId: string): string {
  const url = new URL('/nina', origin)
  url.searchParams.set(PHOTO_PARAM, formatNinaPhotoParam({ kind: 'avatar', id: avatarId }))
  return url.toString()
}
