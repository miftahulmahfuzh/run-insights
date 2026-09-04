import { AlbumManager, type AlbumPhoto } from '@/components/admin/AlbumManager'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { listNinaAvatars } from '@/lib/nina/queries'

/**
 * `/admin/nina` — F33 R23, the whole requirement: *"here admin can add / remove profpic album of
 * nina. admin can also set which photo will be set as her profpic. implement a zoom in and
 * positioning feature so user can manually position nina's face in the middle of circular profile
 * frame."*
 *
 * A Server Component that does two things: gate, and hand the album to one client component. Every
 * mutation is a Server Action in `lib/admin/ninaAlbumActions.ts`, so there is no `/api` route on
 * the write path and no client-side data fetching.
 *
 * `force-dynamic` because the album is per-request state that must reflect the action that just
 * ran; `revalidatePath('/admin/nina')` in every action is what makes that immediate.
 */

export const dynamic = 'force-dynamic'

export default async function AdminNinaPage() {
  const { userId } = await requireAdmin()
  const rows = await listNinaAvatars(userId)

  // The row → prop mapping is here rather than in the client component so that `NinaAvatarRow`
  // (which carries `announcedAt` and `pathname`, neither of which the UI needs) never crosses the
  // serialization boundary wholesale.
  const photos: AlbumPhoto[] = rows.map((row) => ({
    id: row.id,
    url: row.blobUrl,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Nina&rsquo;s album</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Add a photo, pick which one she uses, and frame her face inside the circle. Framing is
          stored per photo and every avatar in the app reads it back through the same transform.
        </p>
      </header>

      {photos.length === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album is empty, so she is still showing the committed photo (
          <code className="text-ink">{NINA_AVATAR_FALLBACK_SRC}</code>). Upload one below and it
          becomes her face.
        </p>
      ) : null}

      <AlbumManager photos={photos} userId={userId} />
    </div>
  )
}
