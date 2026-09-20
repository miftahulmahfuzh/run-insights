'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { PhotoReferencePicker } from '@/components/admin/PhotoReferencePicker'
import {
  PHOTO_REFERENCE_NONE,
  type PhotoReferenceItem,
} from '@/components/admin/photoReferenceModel'
import { updateNinaImageJobReference } from '@/lib/nina/jobActions'
import { ninaJobHref } from '@/lib/nina/jobview'

/** `updateNinaImageJobReference`'s refusal, in words. `NinaJobDetail.tsx`'s `EDIT_NOTE` precedent:
 * the server returns a discriminant, never prose, and the component owns the sentence. */
const REFERENCE_EDIT_NOTE: Record<'not-found' | 'no-args', string> = {
  'not-found': 'Job ini sudah nggak ada.',
  'no-args': 'Job ini nggak nyimpan argumen buat diubah.',
}

/**
 * `/nina/jobs/[id]/anchor` — the grid half of "ubah tombol ini menjadi icon" for the reference
 * photo: `NinaJobDetail`'s new icon button lands here, and picking a tile is the whole interaction.
 *
 * ── WHY A TAP SAVES IMMEDIATELY, WITH NO SEPARATE "SIMPAN" ────────────────────────────────────
 * `components/admin/ImageGenPanel.tsx`'s own reference picker commits on every tap — there is no
 * confirm step between choosing a photograph and it being saved. This screen keeps that idiom
 * rather than inventing a second one: `PhotoReferencePicker`'s tile toggle and "Clear reference"
 * button both already mean "this is the finished edit", and a runner who taps the wrong tile taps
 * again (or picks another) exactly as they would on the admin panel.
 *
 * `PHOTO_REFERENCE_NONE` (`''`) becomes `null` here — `setNinaImageJobReference`'s "unanchored"
 * value — because the grid's own vocabulary and the job args' vocabulary differ on purpose:
 * `NinaImageJobArgs.referenceUrl` is `string | null`, never `''`.
 *
 * ── WHY IT NAVIGATES AWAY ON SUCCESS ───────────────────────────────────────────────────────────
 * The whole reason this is its own page and not a modal: the grid needs real space. Once a
 * selection is saved there is nothing left to do here, so the runner is returned to
 * `/nina/jobs/[id]`, where the reference control now opens the new photograph. A refusal keeps
 * them on the grid instead — nothing was written, so there is nothing to go back and see.
 */
export function NinaJobAnchorPicker({
  jobId,
  items,
  total,
  page,
  pageCount,
  preloadUrls,
  value,
  selectedId,
}: {
  jobId: string
  items: readonly PhotoReferenceItem[]
  total: number
  page: number
  pageCount: number
  preloadUrls: readonly string[]
  /** The job's current `referenceUrl`, or `PHOTO_REFERENCE_NONE` when it has none. */
  value: string
  selectedId: string
}) {
  const router = useRouter()
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function choose(next: string) {
    setNote(null)
    startTransition(async () => {
      const outcome = await updateNinaImageJobReference({
        jobId,
        referenceUrl: next === PHOTO_REFERENCE_NONE ? null : next,
      })
      if (!outcome.ok) {
        setNote(REFERENCE_EDIT_NOTE[outcome.reason ?? 'not-found'])
        return
      }
      router.push(ninaJobHref(jobId))
    })
  }

  return (
    <div>
      <PhotoReferencePicker
        items={items}
        total={total}
        page={page}
        pageCount={pageCount}
        preloadUrls={preloadUrls}
        value={value}
        selectedId={selectedId}
        onChange={choose}
        fullViewHref={null}
        collapsible={false}
      />
      {pending && <p className="mt-2 text-[12px] font-semibold text-ink-3">Nyimpen…</p>}
      {note !== null && (
        <p role="status" className="mt-2 text-[12px] font-semibold text-red">
          {note}
        </p>
      )}
    </div>
  )
}
