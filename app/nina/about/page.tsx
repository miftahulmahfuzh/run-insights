import { AppShell } from '@/components/ui/AppShell'
import { NinaAboutScreen } from '@/components/nina/NinaAboutScreen'
import { requireUserId } from '@/lib/auth/requireUserId'
import { albumPhotos, galleryPhotos, NINA_GALLERY_LIMIT, ninaAvatarView } from '@/lib/nina/album'
import { listNinaAvatars, listNinaMessageImages } from '@/lib/nina/queries'

/**
 * `/nina/about` — her detail page (R17), reached by tapping her avatar in the chat header.
 *
 * ── TWO INDEXED READS AND NOTHING ELSE ────────────────────────────────────────────────────────
 * `listNinaAvatars` reads `nina_avatars_user_created_idx`; `listNinaMessageImages` reads
 * `nina_message_images_user_created_idx` with no join, which is phase 1's stated reason for that
 * table existing rather than a `jsonb` column. No model call, so invariant 4 is satisfied
 * structurally: there is nothing here for the payload-boundary grep to object to.
 *
 * ── WHY THERE IS NO `loading.tsx`, HERE OR AT `app/nina/` ─────────────────────────────────────
 * D-4. One at `app/nina/` would wrap this route too, which is the specific thing phase 4 declined
 * to impose on a page it did not own; and this page's two index lookups resolve inside one paint,
 * so a skeleton would flash and be replaced. `app/(app)/loading.tsx`'s docstring records the
 * measured cost of getting that wrong in the other direction.
 *
 * ── THE CURRENT PHOTO IS TAKEN FROM THE ALBUM, NOT RE-QUERIED ─────────────────────────────────
 * `listNinaAvatars` already returns the row with `is_current`, so calling `getCurrentNinaAvatar`
 * here as well would be a second round trip for a row we are holding. `ninaAvatarView(null)` is
 * what an empty album means (D-2) and it is the same function the chat header uses, so the two
 * surfaces cannot disagree about which face is hers.
 */
export default async function NinaAboutPage() {
  const userId = await requireUserId()

  const [avatars, images] = await Promise.all([
    listNinaAvatars(userId),
    listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }),
  ])

  const current = avatars.find((row) => row.isCurrent) ?? null

  return (
    <AppShell>
      <NinaAboutScreen
        avatar={ninaAvatarView(current)}
        album={albumPhotos(avatars)}
        gallery={galleryPhotos(images)}
      />
    </AppShell>
  )
}
