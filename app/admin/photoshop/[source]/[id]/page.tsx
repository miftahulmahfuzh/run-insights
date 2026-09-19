import { notFound } from 'next/navigation'

import { PhotoshopDetail } from '@/components/admin/PhotoshopDetail'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { isValidId } from '@/lib/id'
import { getPhotoshopSourcePhoto } from '@/lib/nina/photoshopResolve'

/** `firePhotoshopJob`'s `after()` inherits this segment's budget, the same reason
 * `app/nina/page.tsx` and `app/nina/jobs/page.tsx` both carry the literal 300 — a Server Action
 * invoked from this page runs the model call in the background on this same budget. */
export const maxDuration = 300

export default async function PhotoshopDetailPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>
}) {
  const { userId } = await requireAdmin()
  const { source, id } = await params

  if ((source !== 'avatar' && source !== 'message_image') || !isValidId(id)) notFound()

  const photo = await getPhotoshopSourcePhoto(userId, source, id)
  if (photo == null) notFound()

  return (
    <PhotoshopDetail
      sourceKind={source}
      sourceId={id}
      sourceUrl={photo.blobUrl}
      sourceWidth={photo.width}
      sourceHeight={photo.height}
    />
  )
}
