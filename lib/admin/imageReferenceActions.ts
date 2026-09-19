'use server'

import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTOS_PATH } from '@/lib/admin/chatPhotos'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { ninaImageReferenceSchema } from '@/lib/admin/schema'
import { readNinaImagePrefs, writeNinaImagePrefs } from '@/lib/nina/queries'

/**
 * The Image Collection explorer's "set as image-generation anchor" icon — one field, not the whole
 * prefs row `saveNinaImagePrefsAction` owns.
 *
 * That action's own header calls out ONE SAVE, NOT ELEVEN: `/admin/image-generation`'s panel
 * commits its whole draft on every control's own change, and an eleventh per-field action there
 * would be the regression its allowlist test exists to catch. This is not that — the caller is a
 * different page (`/admin/nina`'s explorer) that holds no draft of the other ten fields at all, so
 * there is nothing to lose by reading the current row, replacing one field, and writing it back.
 * Read-merge-write, `removeChatPhotoAction`'s pattern for the same reason.
 */
export interface SetNinaImageReferenceResult {
  ok: boolean
  /** A sentence for the operator. Absent on success. */
  error?: string
}

export async function setNinaImageReferenceAction(
  input: unknown,
): Promise<SetNinaImageReferenceResult> {
  const { userId } = await requireAdmin()

  const parsed = ninaImageReferenceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'That is not a photograph this panel can anchor to.' }
  }

  try {
    const current = await readNinaImagePrefs(userId)
    await writeNinaImagePrefs(userId, { ...current, reference: parsed.data })
    revalidatePath('/admin/image-generation')
    revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
    return { ok: true }
  } catch (cause) {
    console.error('[imgn] set image reference failed', cause)
    return { ok: false, error: 'The write failed and nothing was changed — try again.' }
  }
}
