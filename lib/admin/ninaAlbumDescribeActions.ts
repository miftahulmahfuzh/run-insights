'use server'

import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS } from '@/lib/admin/avatars'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { embedNinaAvatarDescription, scheduleEmbed } from '@/lib/admin/ninaAlbumDeferredDescribe'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  avatarDescriptionSchema,
  avatarIdSchema,
  avatarSearchKeywordsSchema,
} from '@/lib/admin/schema'
import { describeSubjectForSide } from '@/lib/nina/album'
import {
  getNinaAvatar,
  setNinaAvatarDescriptionAndEmbedding,
  setNinaAvatarSearchKeywordsAndEmbedding,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The describe half of the album layer — everything that earns or rewrites
 * `nina_avatars.description`, and nothing else.
 *
 *   · `describeNinaAvatarAction` is the button: the vendor call and the write.
 *   · `editNinaAvatarDescriptionAction` is the hand: prose without a model call.
 *   · `editNinaAvatarSearchKeywordsAction` is the tag: the other free-text input to the vector.
 *   · `ensureNinaAvatarDescriptionAction` is the pre-share gate: describe only if empty, in band.
 *
 * The DEFERRED trigger is not here. `scheduleDescribe`, the `after()` pre-pass, lives in
 * `lib/admin/ninaAlbumDeferredDescribe.ts`: a `'use server'` module may export only async
 * functions (`lib/nina/album.ts:144-148`), and a synchronous scheduler cannot be exported from
 * one — the same rule that keeps `isChatPhotoReference` private to
 * `lib/admin/chatPhotoActions.ts`. Nothing outside the layer imports this module; everything
 * reaches it through the `lib/admin/ninaAlbumActions.ts` barrel.
 */

/**
 * Describe one album row with `glm-4.6v` and stamp `nina_avatars.description`. R25's raw material.
 *
 * RU-12 is why this exists at all: `glm-5.3` is never sent an image, so the only way she can say
 * anything true about a photograph is for a vision model to have written down what is in it. Also
 * the retry button for a failed pre-pass — and since R3 (2026-09-10) the manual re-describe button
 * of the unified panel, which OVERWRITES whatever is stored, machine- or hand-written.
 *
 * ── `subject: 'self'`, AND WHY IT TOOK UNTIL NOW ─────────────────────────────────────────────
 * Every `nina_avatars` row is a photograph of HER. The `'runner'` default this action shipped with
 * pointed `NINA_DESCRIBE_SYSTEM_PROMPT` — *"The state of him. Drenched or dry"*, rule 6 *"'Him'
 * for whoever is clearly the runner"* — at her face, and the prompt went looking for a man who is
 * not in the frame. `scheduleChatPhotoCaption` already described her chat photographs with the
 * self prompt; this action and `scheduleDescribe` now agree with it, through the one
 * mapping (`describeSubjectForSide('hers')`, `lib/nina/album.ts`) so the rule keeps a single
 * spelling and a single suite.
 */
export async function describeNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  try {
    const { description } = await describeNinaImages(
      [{ blobUrl: row.blobUrl, pathname: row.pathname }],
      { subject: describeSubjectForSide('hers') },
    )
    /*
     * ── AND THE VECTOR, IN THE SAME UPDATE ──────────────────────────────────────────────────
     * `admin-album-semantic-search` R2. This action OVERWRITES whatever was stored (R3, 2026-09-10),
     * so leaving the old vector in place would leave the photo searchable under the prose it just
     * stopped having — the one failure mode a stale derived column has, and the reason both columns
     * move in one statement (`setNinaAvatarDescriptionAndEmbedding`'s docstring argues the window).
     *
     * IN BAND rather than `after()`, unlike the upload path, and the arithmetic is why: the
     * operator is already waiting ~8-11 s for the vision call they clicked, and an embedding is one
     * small text request against a model with no image in it. Deferring it would add a second
     * moving part to save a fraction of the latency the click already costs. `after()` here would
     * also be the wrong shape for `ensureNinaAvatarDescriptionAction`, which delegates to this
     * function precisely BECAUSE it needs the answer in band.
     *
     * `embedNinaAvatarDescription` never throws: an embedding outage must not turn a successful
     * describe into a failed one. It answers `null`, the row is written prose-with-no-vector, and
     * `listNinaAvatarDescribeBacklog` picks it up on the next sweep.
     *
     * ── AND IT READS `search_keywords` WITHOUT WRITING IT ───────────────────────────────────
     * R2, 2026-09-15, and it is an invariant rather than a convenience: this action OVERWRITES the
     * prose, and the keywords are the operator's correction of exactly this model's opinion. A
     * pass that cleared them would erase the correction every single time it was needed. So the
     * row's stored value is read here, handed to `embedNinaAvatarDescription` so the new vector
     * still carries the tags, and never appears in the UPDATE —
     * `setNinaAvatarDescriptionAndEmbedding` sets two columns and `search_keywords` is not one of
     * them, so the omission is structural and not a thing to remember.
     */
    const embedding = await embedNinaAvatarDescription(description, row.searchKeywords, userId)
    await setNinaAvatarDescriptionAndEmbedding(userId, row.id, description, embedding)
    revalidatePath('/admin/nina')
    return { ok: true, description }
  } catch (cause) {
    console.error('[f33] admin describe failed', cause)
    return { ok: false, error: 'The description call failed. Try again.' }
  }
}

/**
 * **Rewrite what she can see in one of her album photographs, by hand.** R3's album half of "one
 * describe control everywhere": the media side has had this since
 * `nina-photo-refs-and-bubble-actions` R2 (`editChatPhotoDescriptionAction`); the album side never
 * did, because nothing on the album surface ever rendered the prose to edit. The unified panel
 * renders it, so the album gets its action.
 *
 * The shape, the policy and the sentences are `editChatPhotoDescriptionAction`'s, deliberately:
 *   · NO model call, NO `after()` — this action changes the prose, so re-earning it would
 *     overwrite the human who just typed it.
 *   · NO re-caption — the album row has no bubble; her prompt reads the CURRENT avatar's
 *     description through `loadNinaContext`, which re-reads on the next turn with no cache to
 *     bust.
 *   · AN EMPTY BOX CLEARS THE FIELD (D1) — `NULL` is not a new state (a row the sweep's promotion
 *     has not reached yet has always had one) and it degrades honestly: the avatar block of her
 *     context simply omits the description, and the panel's empty-state note says she cannot talk
 *     about the photo until something fills it.
 *
 * `setNinaAvatarDescription` takes `string | null` already — `scheduleDescribe` is its other
 * caller — so no query changes.
 */
export async function editNinaAvatarDescriptionAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()

  const parsed = avatarDescriptionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `That description did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS} characters at most.`,
    }
  }
  const { id, description } = parsed.data

  const row = await getNinaAvatar(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* The empty box IS the clear — the same policy line `editChatPhotoDescriptionAction` runs. */
  const next = description.length === 0 ? null : description

  /*
   * ── THE VECTOR IS CLEARED HERE AND RE-EARNED AFTERWARDS ─────────────────────────────────────
   * `admin-album-semantic-search` R2. The docstring above says this action makes NO model call,
   * and that rule is kept for the call that matters — nothing re-describes prose a human just
   * typed. But `description_embedding` is DERIVED from that prose, so leaving the old vector
   * behind would leave the photo searchable under the words the operator just deleted: a stale
   * derived column, invisible until a search returns the wrong photo.
   *
   * So the vector is set to NULL in the SAME UPDATE as the new prose — the row is never, for any
   * window, a pair of columns that disagree — and `scheduleEmbed` re-earns it after the response
   * has gone out. NULL is the honest intermediate state and it is the one the backlog read already
   * looks for, so a callback that never runs costs a sweep, not a correction.
   *
   * `scheduleEmbed` and not `scheduleDescribe`: a CLEARED box must not summon `glm-4.6v` to
   * invent prose the operator just removed. The embed-only worker leaves a NULL description alone.
   */
  await setNinaAvatarDescriptionAndEmbedding(userId, id, next, null)
  if (next != null) scheduleEmbed(userId, id)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    id,
    ...(next === null
      ? { note: 'Cleared. While it is empty she has no words about this photo.' }
      : {}),
  }
}

/**
 * **"Tag this photograph with the words it should be findable by."** R2, 2026-09-15, from the
 * user's own framing: *"kalo selain image description, kita tambah satu field baru,
 * search_keywords (contoh value string: 'tete', 'putih')."*
 *
 * ── WHY IT IS A SECOND ACTION AND NOT A SECOND FIELD ON THE ONE ABOVE ───────────────────────
 * Three reasons, and the second is the one that would have bitten. (1) The panel has two
 * independent boxes with two independent drafts, so a merged action would make saving the
 * description overwrite keywords the operator had typed but not saved. (2) The re-describe path
 * must be STRUCTURALLY unable to write this column — see `describeNinaAvatarAction` — and a merged
 * writer would put a `searchKeywords` parameter within reach of it. (3) `shortcutCellSchema`'s
 * header already rules for this shape on this repo's own ground: one control, one field, one
 * action, because the fields have different caps and different meanings.
 *
 * ── SAME POLICY AS THE DESCRIPTION EDIT, LINE FOR LINE ──────────────────────────────────────
 *   · NO model call, NO `after()` vision pass — these are the human's words.
 *   · AN EMPTY BOX CLEARS THE FIELD, and `NULL` is what every untagged row already carries.
 *   · THE VECTOR IS NULLED IN THE SAME UPDATE and re-earned afterwards, because it is derived from
 *     these words too: leaving the old one would keep the photo findable under tags the operator
 *     just deleted, which is the invisible-until-a-search-returns-the-wrong-photo failure
 *     `setNinaAvatarDescriptionAndEmbedding`'s docstring argues about.
 *
 * ── THE ONE ASYMMETRY: A ROW WITH NO PROSE SCHEDULES NOTHING ────────────────────────────────
 * The embedded text is anchored on the description (`buildNinaAvatarEmbedText` returns the
 * description, plus a labelled keyword line). There is no keywords-only vector, deliberately: the
 * embed-only worker refuses to describe a NULL description, so a `scheduleEmbed` here would be a
 * read that finds nothing to do. That row is already in `listNinaAvatarDescribeBacklog` (no
 * description), and the describe sweep will write prose and then embed the pair — so the state
 * heals through the path that already exists rather than through a new branch in the worker.
 */
export async function editNinaAvatarSearchKeywordsAction(
  input: unknown,
): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()

  const parsed = avatarSearchKeywordsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those keywords did not fit the field — ${ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS} characters at most.`,
    }
  }
  const { id, searchKeywords } = parsed.data

  const row = await getNinaAvatar(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  /* The empty box IS the clear — the same policy line the description edit runs. */
  const next = searchKeywords.length === 0 ? null : searchKeywords

  await setNinaAvatarSearchKeywordsAndEmbedding(userId, id, next, null)
  /* Only a row that HAS prose has a vector to re-earn. See the docstring's last block. */
  if (row.description != null) scheduleEmbed(userId, id)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    id,
    ...(next === null ? { note: 'Cleared. The photo is findable by its description alone.' } : {}),
  }
}

/**
 * Describe a photo **only if it has no description yet**, and return the prose in band. The
 * share-to-Nina half of the describe move.
 *
 * Phase 7 calls this before opening the chat tab so that *"nina will respond to it accordingly"*
 * has something true to work from. It delegates to `describeNinaAvatarAction` rather than repeating
 * its body: two spellings of one vendor call is how one of them ends up not writing the row.
 *
 * ── THE FAST PATH IS THE COMMON PATH ────────────────────────────────────────────────────────
 * A photo that is already her face, or that was already shared once, returns after ONE indexed
 * single-row read with no model call at all. Only a never-promoted, never-shared photo pays the
 * ~8-11 s. That is the shape that makes it safe for phase 7 to await — and phase 7 must still open
 * the tab BEFORE awaiting it, because `window.open` after an `await` has lost the user gesture.
 *
 * The fast path deliberately does NOT check `description_embedding`. Sharing a photo to Nina is
 * about the prose reaching her prompt; whether the album's search can also find that photo is the
 * backfill's question, and making a share tab wait on an embedding call would answer it in the
 * most expensive possible place.
 */
export async function ensureNinaAvatarDescriptionAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }
  if (row.description != null) return { ok: true, id: row.id, description: row.description }

  return describeNinaAvatarAction(row.id)
}
