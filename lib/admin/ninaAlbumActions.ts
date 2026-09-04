'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import { avatarIdSchema, avatarRegisterSchema, cropWriteSchema } from '@/lib/admin/schema'
import { clampCrop, cropForWrite, resolveCrop } from '@/lib/nina/crop'
import {
  deleteNinaAvatar,
  getCurrentNinaAvatar,
  getNinaAvatar,
  insertNinaAvatarAsCurrent,
  setCurrentNinaAvatar,
  setNinaAvatarDescription,
  updateNinaAvatarCrop,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The album's write side — F33 R23, plus this phase's share of R25 (the describe pre-pass).
 *
 * Every action opens with `requireAdmin()` and is scoped to the id it returns. `proxy.ts` governs
 * Server Actions only incidentally (they POST to the page they are used on) and does not match
 * `/admin` at all (ruling D3), so this line is the authorization, exactly as `requireUserId()` is
 * everywhere else in the app.
 *
 * ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────────────────────
 *  · It writes no `nina_messages` row and composes no line of Nina's dialogue. A new current
 *    avatar is left with `announced_at = NULL`, which is phase 10's `avatar_changed` trigger
 *    (RU-17). Writing her line here would put words in her mouth from a file that has never read
 *    her persona.
 *  · It does not touch `assets/nina/_anchor.png`. It CANNOT: that is a committed repo file and
 *    this runs on a read-only serverless filesystem. Since RU-18 dropped the reference image from
 *    generation the anchor is inert anyway — `/update-nina-profpic` re-seeds it for the deferred
 *    consistent-face feature, and nothing reads it at runtime today.
 *  · It generates nothing. Phase 12 owns image generation.
 */

/** One shape for every action, so the client has one branch and no `unknown`. */
export interface AdminActionResult {
  ok: boolean
  error?: string
  /** Set by `registerNinaAvatarAction` so the client can select the new row immediately. */
  id?: string
  /** Set by the describe actions, so the card can show the prose without a refetch. */
  description?: string
}

/**
 * Describe one album row with `glm-4.6v` and stamp `nina_avatars.description`. R25's raw material.
 *
 * RU-12 is why this exists at all: `glm-5.3` is never sent an image, so the only way she can say
 * anything true about a photograph is for a vision model to have written down what is in it. Also
 * the retry button for a failed pre-pass.
 */
export async function describeNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const row = await getNinaAvatar(userId, parsed.data)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  try {
    const { description } = await describeNinaImages([
      { blobUrl: row.blobUrl, pathname: row.pathname },
    ])
    await setNinaAvatarDescription(userId, row.id, description)
    revalidatePath('/admin/nina')
    return { ok: true, description }
  } catch (cause) {
    console.error('[f33] admin describe failed', cause)
    return { ok: false, error: 'The description call failed. Try again.' }
  }
}

/**
 * Register a blob the browser has just PUT. **The only writer of `nina_avatars` on this path** —
 * `onUploadCompleted` is inert, exactly as F04's is.
 *
 * `insertNinaAvatarAsCurrent` is phase 1's, and it un-currents before inserting because
 * `nina_avatars_user_current_unq` makes the order load-bearing. `makeCurrent: false` still goes
 * through it — see the branch below for why that is a deliberate small cost rather than a second
 * insert path.
 */
export async function registerNinaAvatarAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarRegisterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe itself properly.' }
  const { blobUrl, pathname, width, height, bytes, makeCurrent } = parsed.data

  // `insertNinaAvatarAsCurrent` is the only insert phase 1 exposes, and it always makes the new row
  // current. For "park it in the album" we insert it as current and then hand the crown straight
  // back to whoever had it — two statements instead of one, on an operation a human performs a
  // handful of times a year, in exchange for not writing a second insert path that could disagree
  // with phase 1's about the partial unique index.
  const previousCurrentId = makeCurrent ? null : ((await getCurrentNinaAvatar(userId))?.id ?? null)
  const row = await insertNinaAvatarAsCurrent(userId, {
    blobUrl,
    pathname,
    source: 'admin',
    width,
    height,
    bytes,
  })
  if (previousCurrentId != null) await setCurrentNinaAvatar(userId, previousCurrentId)

  revalidatePath('/admin/nina')

  /*
   * The pre-pass. Non-fatal by design: the row exists, the album renders, and a failure leaves a
   * visible "Describe it" button rather than a lost upload. An uploaded image has no generation
   * prompt, so `glm-4.6v` is the only way `nina_avatars.description` ever gets filled for it —
   * R25's "asked where she is in her new profile photo, Nina invents a story true to the photo"
   * has nothing to work from otherwise. Holding the album faceless for a ~25 s vendor round trip,
   * or failing the whole upload when z.ai is overloaded, would be the wrong trade — which is
   * precisely why phase 1 made `setNinaAvatarDescription` a separate write.
   */
  try {
    const { description } = await describeNinaImages([{ blobUrl, pathname }])
    await setNinaAvatarDescription(userId, row.id, description)
    revalidatePath('/admin/nina')
    return { ok: true, id: row.id, description }
  } catch (cause) {
    console.error('[f33] admin describe pre-pass failed', cause)
    return { ok: true, id: row.id }
  }
}

/**
 * "Set as her profile photo" — R23, verbatim. Re-arms `announced_at`, so she comments on the
 * change (RU-17) via phase 10's trigger. Idempotent when the row is already current.
 */
export async function setCurrentNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const changed = await setCurrentNinaAvatar(userId, parsed.data)
  if (!changed) return { ok: false, error: 'That photo is not in the album.' }
  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Save the framing the operator just dragged — R23's whole point.
 *
 * **`clampCrop` runs again here, server-side, against the row's real `width`/`height`.** The Zod
 * schema cannot know the aspect ratio, so it can only reject nonsense; this is what guarantees the
 * stored numbers keep the circle covered no matter what a hand-crafted POST claims. An identity
 * crop is written as three NULLs by `cropForWrite`, which is how "Reset framing" and "Save
 * framing" stay one code path — phase 1's `updateNinaAvatarCrop` docstring promises exactly that.
 */
export async function saveNinaAvatarCropAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = cropWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That framing is out of range.' }

  const row = await getNinaAvatar(userId, parsed.data.id)
  if (row == null) return { ok: false, error: 'That photo is not in the album.' }

  const clamped = clampCrop(
    { width: row.width, height: row.height },
    resolveCrop({ scale: parsed.data.scale, x: parsed.data.x, y: parsed.data.y }),
  )
  const saved = await updateNinaAvatarCrop(userId, row.id, cropForWrite(clamped))
  if (!saved) return { ok: false, error: 'That photo is not in the album.' }
  revalidatePath('/admin/nina')
  return { ok: true }
}

/**
 * Remove a photo from the album, and its blob with it.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * A failed `del` leaves an orphaned object, which is recoverable (and is what
 * `scripts/blob-reap.mjs` exists for, once it is taught the `nina/` prefix — ruling D4's one
 * follow-up card). A deleted blob under a live row is a permanently broken image in her album. So
 * the row goes first and the `del` is best-effort, logged rather than surfaced.
 *
 * The current photo cannot be removed: `deleteNinaAvatar`'s WHERE clause refuses it, which is what
 * makes "zero current avatars" unreachable rather than repaired.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  try {
    await del(removed.blobUrl)
  } catch (cause) {
    console.error('[f33] album row deleted, blob left behind', removed.pathname, cause)
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
