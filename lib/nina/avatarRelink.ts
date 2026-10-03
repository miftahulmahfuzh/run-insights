import 'server-only'

import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import {
  getNinaAvatarBySourceKey,
  relinkNinaAvatarToImage,
  type NinaAvatarRelinkSource,
  type NinaAvatarRow,
} from '@/lib/nina/queries'

/**
 * **A re-adoption must land on the Media photo's CURRENT bytes.** `profpic-pointer-sync` R1/R2.
 *
 * Both adoption paths (`setChatPhotoAsAvatarAction` in `lib/admin`, `adoptNinaChatPhotoAsAvatar`
 * in this layer) find a previous adoption by `source_key = 'chat-photo:<imageId>'` before
 * inserting anything. That lookup is still the policy, since the unique index backs it. What changed
 * is what they do with a hit: they used to re-current it as-is. This is the step between the hit
 * and the re-current.
 *
 * A hit is **fresh** when it already points at this Media row and names the same object. Then it is
 * returned untouched, with zero writes, which is every re-adoption made since the pointer design.
 * Anything else is **stale**:
 *
 *   · `source_image_id` NULL — a legacy copy (its own `avatar-…` object, pre-R3). The reported bug:
 *     `Daofejusg4Xa` held v1 of `jWWu8vkl09fT` and was put back on her face after v2 landed.
 *   · `source_image_id` set but `pathname`/`blob_url` differ — a pointer from before a Replace.
 *   · `source_image_id` naming some OTHER Media row — not produced by any code path, but the key
 *     says which photograph this row is, so the key wins.
 *
 * A stale hit is rewritten in place by `relinkNinaAvatarToImage`. Then each object the row stopped
 * naming goes to `releaseBlobIfUnreferenced`, which deletes it only if no row in either table still
 * names it. A stale pointer's old object is usually still named by OTHER stale rows until Phase 2's
 * replace propagation and Phase 3's repair land. Then the answer is `'shared'`, the object stays,
 * and that is the correct, recoverable direction.
 *
 * `relinked` tells the chat path that her face changed even if the row was already current. Without
 * it she would say "it already is" over a photograph that just changed.
 *
 * A relink that misses (another tab rewrote the row between the read and the write) re-reads by
 * key and returns whatever is there now. Same as the insert-race handling in both link helpers. It
 * releases nothing, because this call dropped nothing.
 */
export interface NinaAdoptedAvatarRefresh {
  row: NinaAvatarRow
  relinked: boolean
}

export async function refreshAdoptedNinaAvatar(
  userId: string,
  avatar: NinaAvatarRow,
  image: NinaAvatarRelinkSource,
  sourceKey: string,
): Promise<NinaAdoptedAvatarRefresh | null> {
  const fresh =
    avatar.sourceImageId === image.id &&
    avatar.pathname === image.pathname &&
    avatar.blobUrl === image.blobUrl
  if (fresh) return { row: avatar, relinked: false }

  const relinked = await relinkNinaAvatarToImage(userId, avatar, image)
  if (relinked == null) {
    const reread = await getNinaAvatarBySourceKey(userId, sourceKey)
    if (reread == null) return null
    return { row: reread, relinked: reread.pathname !== avatar.pathname }
  }

  // Row first, blob second: the UPDATE above has already stopped naming these objects.
  if (relinked.droppedOriginal != null) {
    await releaseBlobIfUnreferenced(userId, relinked.droppedOriginal)
  }
  if (relinked.droppedThumb != null) {
    await releaseBlobIfUnreferenced(userId, relinked.droppedThumb)
  }

  return { row: relinked.row, relinked: true }
}
