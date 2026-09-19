import Link from 'next/link'

import { EmptyState } from '@/components/ui'
import type { NinaPhotoRef } from '@/lib/nina/imageprefs'

/**
 * The photoshop tab's entry grid — every Nina photo, deduplicated, exactly the union
 * `PhotoReferencePicker` already draws (`listNinaPhotoReferences`). Visually the same iOS-Photos
 * sheet; behaviourally different, because this one NAVIGATES instead of selecting a value into a
 * draft — each tile is a `<Link>` to that photo's photoshop detail page, not a toggle button.
 */
export function PhotoshopPickerGrid({
  items,
  total,
  page,
  pageCount,
}: {
  items: readonly NinaPhotoRef[]
  total: number
  page: number
  pageCount: number
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No photos yet"
        description="Her profile album and her chat photographs are both empty. Add a photo to her album or let her generate one, and it will appear here."
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-field lg:overflow-x-auto">
        <ul className="grid grid-cols-3 gap-[3px] sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))] lg:grid-cols-[repeat(33,minmax(92px,1fr))]">
          {items.map((item) => {
            const routeKind = item.source === 'album' ? 'avatar' : 'message_image'
            return (
              <li key={`${item.source}:${item.id}`} className="relative aspect-square bg-ink-3/20">
                <Link
                  href={`/admin/photoshop/${routeKind}/${item.id}`}
                  className="block size-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, deliberately
                   * un-transformed; see PhotoReferencePicker's own header for the precedent. */}
                  <img
                    src={item.thumbUrl ?? item.blobUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-ink-3 tabular-nums sm:text-[12px]">
          Showing {items.length} of {total} &middot; page {page} of {pageCount}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/photoshop?page=${page - 1}`}
              className="rounded-field bg-card px-3 py-2 text-[14px] font-semibold text-ink hover:bg-accent-soft"
            >
              Previous
            </Link>
          )}
          {page < pageCount && (
            <Link
              href={`/admin/photoshop?page=${page + 1}`}
              className="rounded-field bg-card px-3 py-2 text-[14px] font-semibold text-ink hover:bg-accent-soft"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
