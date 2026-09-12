'use server'

import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { avatarDescriptionSchema, avatarIdSchema } from '@/lib/admin/schema'
import { describeSubjectForSide } from '@/lib/nina/album'
import { getNinaAvatar, setNinaAvatarDescription } from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The describe half of the album layer — everything that earns or rewrites
 * `nina_avatars.description`, and nothing else.
 *
 *   · `describeNinaAvatarAction` is the button: the vendor call and the write.
 *   · `editNinaAvatarDescriptionAction` is the hand: prose without a model call.
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
    await setNinaAvatarDescription(userId, row.id, description)
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

  await setNinaAvatarDescription(userId, id, next)

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
