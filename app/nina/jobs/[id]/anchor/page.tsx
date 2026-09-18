import Link from 'next/link'
import { notFound } from 'next/navigation'

import { NinaJobAnchorPicker } from '@/components/nina/NinaJobAnchorPicker'
import { AppShell, ScreenHeader } from '@/components/ui/AppShell'
import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'
import { getNinaImageJobDetail } from '@/lib/nina/imagejobs'
import { NINA_PHOTO_REF_PAGE_SIZE } from '@/lib/nina/imageprefs'
import { ninaJobHref } from '@/lib/nina/jobview'
import { listNinaPhotoReferences } from '@/lib/nina/queries'

/**
 * `/nina/jobs/[id]/anchor` — the redo flow's missing half: `NinaJobDetail` already lets a runner
 * tune the prompt and view the reference photo full-screen; this is where they change WHICH
 * photograph the next redo anchors to. `components/admin/PhotoReferencePicker.tsx`'s grid, reused
 * whole — the operator's global "photo reference" picker and this per-job one browse the exact same
 * union (her album plus her chat photographs), and there is no reason for a second grid to exist.
 *
 * ── OWNERSHIP, THE SAME SHAPE AS THE DETAIL PAGE ──────────────────────────────────────────────
 * `isValidId` first, then `getNinaImageJobDetail(userId, id)` — a foreign id and a nonexistent id
 * both 404 identically, `app/nina/jobs/[id]/page.tsx`'s own invariant 5 note.
 *
 * ── `force-dynamic`, ON `/admin/image-generation`'s OWN REASONING ─────────────────────────────
 * `?page=` drives a real `listNinaPhotoReferences` window and `requireUserId()` reads a cookie that
 * would opt this route in implicitly anyway — declared explicitly so a refactor three files down
 * cannot change this route's caching by accident.
 *
 * No `maxDuration`: nothing here calls `fireNinaImageGeneration` or anything else that runs inside
 * `after()`. Picking a photograph only rewrites `args.referenceUrl` and revalidates a path.
 */
export const dynamic = 'force-dynamic'

/** A hand-typed `?page=` cannot ask for an offset past what any collection here will ever reach —
 * `app/admin/image-generation/page.tsx`'s own ceiling, verbatim. */
const PAGE_CEILING = 1000

/** 1-based, floored at 1, capped at `PAGE_CEILING`. Garbage reads as page 1. */
function readPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, PAGE_CEILING)
}

export default async function NinaJobAnchorPage({
  params,
  searchParams,
}: PageProps<'/nina/jobs/[id]/anchor'>) {
  const userId = await requireUserId()
  const { id } = await params
  if (!isValidId(id)) notFound()

  const job = await getNinaImageJobDetail(userId, id)
  if (job === null) notFound()

  const sp = await searchParams
  const page = readPage(sp.page)
  const offset = (page - 1) * NINA_PHOTO_REF_PAGE_SIZE

  const referencePage = await listNinaPhotoReferences(userId, {
    offset,
    limit: NINA_PHOTO_REF_PAGE_SIZE,
  })
  const pageCount = Math.max(1, Math.ceil(referencePage.total / NINA_PHOTO_REF_PAGE_SIZE))

  /* The job's own `args.referenceUrl`, matched against this page's rows by exact Blob URL — the
   * same match `getNinaImageReferencePhoto` makes for the detail page's full-screen link, done
   * here in memory since the whole page is already in hand. `null` when the current reference
   * sits on a different page (or was deleted): `PhotoReferencePicker`'s own `missing` state says so
   * without this page guessing at it. */
  const currentUrl = job.referenceUrl
  const currentRow = referencePage.rows.find((row) => row.blobUrl === currentUrl) ?? null

  return (
    <AppShell>
      <ScreenHeader
        title="Ganti foto referensi"
        action={
          <Link href={ninaJobHref(job.id)} className="text-[13px] font-semibold text-accent">
            BATAL
          </Link>
        }
      />
      <NinaJobAnchorPicker
        jobId={job.id}
        items={referencePage.rows.map((row) => ({
          key: row.blobUrl,
          url: row.blobUrl,
          thumbUrl: row.thumbUrl,
        }))}
        total={referencePage.total}
        page={page}
        pageCount={pageCount}
        preloadUrls={referencePage.preloadUrls}
        value={currentUrl ?? ''}
        selectedId={currentRow?.id ?? ''}
      />
    </AppShell>
  )
}
