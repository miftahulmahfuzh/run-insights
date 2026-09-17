import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaMessageImages } from '@/lib/db/schema'

/**
 * §9e The pointer redirection — where a LINKED album row's prose, keywords AND bytes actually
 * live. `media-album-unified-search` phase 2, R3 — widened past R3's original three text fields
 * after a production report: a chat-adopted profile picture kept showing an old photo once its
 * Media original was Replaced in `/admin`, because only the text half of the pointer redirected;
 * `blobUrl`/`pathname`/`width`/`height`/`bytes` were a one-time copy made at link time and never
 * re-read. This function now answers both questions with the one round trip.
 *
 * ── THE RULE, IN ONE SENTENCE ───────────────────────────────────────────────────────────────
 * **A pointer row's own `description`, `search_keywords`, `negative_search_keywords` and
 * `description_embedding` columns are DEAD**, and so — for every purpose a render or a Replace
 * cares about — is its own copy of `blob_url`/`pathname`/`width`/`height`/`bytes`. All seven stay
 * on the row (the first four NULL forever, the latter three whatever they were at link time,
 * because the columns are `NOT NULL`), but nothing should read the row's own copy for a pointer:
 * the values the operator sees, edits and Replaces belong to the `nina_message_images` row its
 * `source_image_id` names. See the FK's own header in `lib/db/schema/nina/avatars.ts` and the plan
 * index's Decision *"Where does a pointer row's description/keywords live?"*.
 *
 * That is not a synchronisation mechanism, it is the ABSENCE of one, which is the whole reason it
 * is correct: the user asked that *"editing image description, search keyword, negative keyword in
 * one place will automatically synchronize it with other location"* — and the same argument holds
 * for a Replace of the bytes themselves, which is a rarer edit but not a different kind of one. The
 * only design that cannot drift is the one where there is a single row holding the data. A dual
 * write (updating every pointer's copy on every Media Replace) would have a failure mode — a
 * crashed request between the two updates, a pointer created after the Replace already ran; this
 * has none to have.
 *
 * ── WHY THIS IS A QUERY-LAYER FUNCTION AND NOT A JOIN IN `app/admin/nina/page.tsx` ──────────
 * Because the WRITES redirect too. `editNinaAvatarDescriptionAction`, `describeNinaAvatarAction`,
 * `editNinaAvatarSearchKeywordsAction` and `editNinaAvatarNegativeSearchKeywordsAction` all have to
 * land on the linked Media row for a pointer, and that decision belongs beside the read decision
 * rather than duplicated into the UI package. Those four actions do NOT call this function — they
 * already hold the row and read `row.sourceImageId` off it — but they and this share one rule and
 * one docstring, which is the point.
 *
 * ── WHY IT IS A BATCH AND KEYED BY THE AVATAR ID ────────────────────────────────────────────
 * `listNinaAvatarDescribeTargets`'s shape: one `inArray` statement for a whole page, so a render
 * of 120 album tiles costs one extra indexed read rather than 120. Keyed by the AVATAR id and not
 * the image id so the caller's lookup is `linked.get(row.id) ?? row` with no second mapping —
 * `nina_avatars_user_source_key_unq` makes two pointers at one image unreachable in practice, and
 * keying this way means nothing depends on that being true.
 *
 * Imports foundation-wards only, as every module in this layer does.
 */

/** Everything a pointer borrows from its Media original — prose, keywords, and now the bytes
 *  themselves. Exactly what a `PhotoDescription` panel and an explorer tile each read. */
export interface NinaLinkedPhoto {
  description: string | null
  searchKeywords: string | null
  negativeSearchKeywords: string | null
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
}

/**
 * For every row in `rows` that IS a pointer, the prose, keywords and current bytes of the Media
 * row it names.
 *
 * Rows with `sourceImageId === null` are absent from the result — an ordinary album row's own
 * columns are the truth, so there is nothing to look up and nothing to override. A pointer whose
 * target has gone is absent too, which degrades to the row's own (stale) columns, the same state an
 * undescribed album row has always had. (The FK is `ON DELETE RESTRICT`, so that is unreachable
 * while the constraint holds; it is handled rather than asserted because a `Map.get` miss is one
 * branch and a thrown invariant is a 500 on an admin page.)
 *
 * Empty-safe for `listNinaAvatarDescribeTargets`'s reason: a round trip to say nothing is still a
 * round trip, and a page with no pointers on it is the common case today.
 */
export async function resolveNinaAvatarLinkedText(
  userId: string,
  rows: readonly { id: string; sourceImageId: string | null }[],
): Promise<Map<string, NinaLinkedPhoto>> {
  const pointers = rows.filter(
    (row): row is { id: string; sourceImageId: string } => row.sourceImageId != null,
  )
  const resolved = new Map<string, NinaLinkedPhoto>()
  if (pointers.length === 0) return resolved

  /* De-duplicated, because two pointers at one image would otherwise bind the same id twice in the
   * `IN` list. `nina_avatars_user_source_key_unq` makes that unreachable; the `Set` costs nothing
   * and means this function does not depend on it. */
  const imageIds = [...new Set(pointers.map((row) => row.sourceImageId))]

  const linked = await db
    .select({
      id: ninaMessageImages.id,
      description: ninaMessageImages.description,
      searchKeywords: ninaMessageImages.searchKeywords,
      negativeSearchKeywords: ninaMessageImages.negativeSearchKeywords,
      blobUrl: ninaMessageImages.blobUrl,
      pathname: ninaMessageImages.pathname,
      width: ninaMessageImages.width,
      height: ninaMessageImages.height,
      bytes: ninaMessageImages.bytes,
    })
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), inArray(ninaMessageImages.id, imageIds)))

  const byImageId = new Map(linked.map((row) => [row.id, row]))
  for (const pointer of pointers) {
    const media = byImageId.get(pointer.sourceImageId)
    if (media == null) continue
    resolved.set(pointer.id, {
      description: media.description,
      searchKeywords: media.searchKeywords,
      negativeSearchKeywords: media.negativeSearchKeywords,
      blobUrl: media.blobUrl,
      pathname: media.pathname,
      width: media.width,
      height: media.height,
      bytes: media.bytes,
    })
  }
  return resolved
}
