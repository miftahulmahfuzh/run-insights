import { PhotoshopPickerGrid } from '@/components/admin/PhotoshopPickerGrid'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_PHOTO_REF_PAGE_SIZE } from '@/lib/nina/imageprefs'
import { listNinaPhotoReferences } from '@/lib/nina/queries'

export default async function PhotoshopPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { userId } = await requireAdmin()
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  const result = await listNinaPhotoReferences(userId, {
    offset: (page - 1) * NINA_PHOTO_REF_PAGE_SIZE,
  })
  const pageCount = Math.max(1, Math.ceil(result.total / NINA_PHOTO_REF_PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[20px] font-bold text-ink">Photoshop</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Pick any photo from her album or her chat photographs to fix, edit, or exaggerate it with
          an image model. Nothing changes until you choose to replace or add it.
        </p>
      </div>
      <PhotoshopPickerGrid
        items={result.rows}
        total={result.total}
        page={page}
        pageCount={pageCount}
      />
    </div>
  )
}
