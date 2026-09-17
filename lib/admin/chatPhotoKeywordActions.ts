'use server'

import { revalidatePath } from 'next/cache'

import {
  ADMIN_CHAT_PHOTOS_PATH,
  ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS,
  ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
import {
  chatPhotoNegativeSearchKeywordsSchema,
  chatPhotoSearchKeywordsSchema,
} from '@/lib/admin/chatPhotoSchema'
import { scheduleMediaEmbed } from '@/lib/admin/ninaMediaDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  getNinaMessageImage,
  setNinaMessageImageNegativeSearchKeywords,
  setNinaMessageImageSearchKeywordsAndEmbedding,
} from '@/lib/nina/queries'

/**
 * The keyword half of the media layer — the two hand-written phrase lists on a
 * `nina_message_images` row, and nothing else. `media-album-unified-search` R2, from the user's
 * own words: *"every single picture in any directory must be able to be image searched and we must
 * be able to add search keyword and negative search keyword to each of them."*
 *
 * ── WHY A MODULE OF ITS OWN AND NOT TWO MORE EXPORTS IN `chatPhotoActions.ts` ───────────────
 * That file is 1 148 lines and is already four seams wide (replace, add, remove, describe) plus
 * three private `after()` schedulers. The album side answered the same question the same way —
 * `ninaAlbumDescribeActions.ts` holds the prose-and-keyword actions and
 * `ninaAlbumAvatarActions.ts` the face-and-lifecycle ones — and this is that split, one table
 * over. Nothing else changes: `ADMIN_CHAT_PHOTOS_PATH` is still what a media action revalidates,
 * and `ChatPhotoActionResult` is still the one shape a media action returns.
 *
 * ── THE FOUR RULES THESE INHERIT, LINE FOR LINE, FROM THE ALBUM TWINS ───────────────────────
 *   1. `requireAdmin()` is line 1, ABOVE any use of an argument.
 *   2. Zod for the SHAPE (which knows no user id — *"a well-formed `Item` object can still refer
 *      to a row the caller does not own"*), then an owner-scoped re-read, then a write whose own
 *      WHERE carries `user_id` AND `isOriginalPhoto()`.
 *   3. AN EMPTY BOX CLEARS THE FIELD, and `NULL` is what every untagged row already carries.
 *   4. NO model call and NO `after()` vision pass — these are the human's words.
 *
 * ── AND ONE RULE OF THIS TABLE'S OWN: A REFERENCE ROW IS REFUSED ────────────────────────────
 * A row carrying `source_avatar_id`/`source_image_id` RE-SHOWS a photograph that lives elsewhere.
 * It is excluded from every collection read and from the merged search, so keywords on it would be
 * words nothing can ever match — and the photograph the operator means is the original, which owns
 * them. The refusal is spelled here for the reason `removeChatPhotoAction` and
 * `describeChatPhotoAction` spell theirs: `getNinaMessageImage` deliberately does not filter
 * (it is the bubble and viewer read too), so each action enforces membership at its own seam. The
 * write's own `isOriginalPhoto()` clause is the second agreeing check.
 *
 * `isChatPhotoReference` stays private to `lib/admin/chatPhotoActions.ts` — a `'use server'` module
 * exports actions, not predicates — so the two-field test is spelled here, held together with its
 * three siblings by tests rather than by imports. That is the arrangement
 * `setChatPhotoAsAvatarAction` already lives under.
 */

/**
 * **"Tag this photograph with the words it should be findable by."** R2, media half.
 *
 * ── THE VECTOR IS NULLED IN THE SAME UPDATE AND RE-EARNED AFTERWARDS ────────────────────────
 * `editNinaAvatarSearchKeywordsAction`'s contract exactly. `description_embedding` is derived from
 * these words (`buildNinaAvatarEmbedText` joins them onto the description), so leaving the old
 * vector standing would keep the photo findable under tags the operator just deleted — the
 * invisible-until-a-search-returns-the-wrong-photo failure. One `SET` of both columns has no
 * window in which they disagree, and `scheduleMediaEmbed` recomputes after the response.
 *
 * ── THE ONE ASYMMETRY: A ROW WITH NO PROSE SCHEDULES NOTHING ────────────────────────────────
 * The embedded text is ANCHORED on the description. There is no keywords-only vector, deliberately:
 * the embed-only worker refuses to describe a NULL description, so a `scheduleMediaEmbed` here
 * would be a read that finds nothing to do. Such a row is already in
 * `listNinaMessageImageDescribeBacklog` (no description), and phase 4's sweep will write prose and
 * then embed the pair — the state heals through the path that already exists.
 */
export async function editNinaMessageImageSearchKeywordsAction(
  input: unknown,
): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoSearchKeywordsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those keywords did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS} characters at most.`,
    }
  }
  const { id, searchKeywords } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Tag the original instead.',
    }
  }

  /* The empty box IS the clear — the same policy line every description and keyword edit runs. */
  const next = searchKeywords.length === 0 ? null : searchKeywords

  const written = await setNinaMessageImageSearchKeywordsAndEmbedding(userId, id, next, null)
  if (!written) return { ok: false, error: 'That photo is not in the collection.' }

  /* Only a row that HAS prose has a vector to re-earn. See the docstring's last block. */
  if (row.description != null) scheduleMediaEmbed(userId, id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null ? { note: 'Cleared. The photo is findable by its description alone.' } : {}),
  }
}

/**
 * **"Tell the search what this photograph should never match."** R2, media half.
 *
 * ── NO MODEL CALL, NO VECTOR TOUCHED, NO `scheduleMediaEmbed` ───────────────────────────────
 * The whole reason this is a plain setter rather than its neighbour's shape:
 * `negative_search_keywords` is never folded into the text `description_embedding` is computed
 * from (`buildNinaAvatarEmbedText` reads only `description` and `searchKeywords`), so writing it
 * changes nothing the vector describes. `matchesNegativeKeyword` reads the column fresh at search
 * time, against the words the operator actually typed. There is no derived value to re-earn —
 * exactly the non-involvement `editNinaAvatarNegativeSearchKeywordsAction` has on the album side.
 */
export async function editNinaMessageImageNegativeSearchKeywordsAction(
  input: unknown,
): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoNegativeSearchKeywordsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those keywords did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS} characters at most.`,
    }
  }
  const { id, negativeSearchKeywords } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Tag the original instead.',
    }
  }

  /* The empty box IS the clear. */
  const next = negativeSearchKeywords.length === 0 ? null : negativeSearchKeywords

  const written = await setNinaMessageImageNegativeSearchKeywords(userId, id, next)
  if (!written) return { ok: false, error: 'That photo is not in the collection.' }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null ? { note: 'Cleared. No query is excluded for this photo any more.' } : {}),
  }
}
