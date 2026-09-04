import type { NinaExistingPhoto } from '@/lib/nina/attach'

/**
 * The photo the next message will carry, sitting on top of the composer until it is sent — F34 R2.
 *
 * ── WHY IT IS NOT `AttachmentChip` WITH A UNION PROP ──────────────────────────────────────────
 * They share a bottom margin, a clear button and a row layout, and nothing else. `AttachmentChip`
 * renders two lines of strings that `lib/format.ts` produced on the server (invariant 8); this
 * renders one `<img>` and no text at all. A union prop would put a discriminant check inside a
 * component whose whole body is JSX, and the two can legitimately appear TOGETHER — a run pinned
 * and a photo pinned in the same draft — which a single component could not express.
 *
 * ── A PLAIN `<img>`, AND `alt=""` ────────────────────────────────────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rules `next/image` out for Blob-hosted photos: they
 * are already compressed by whoever wrote the row, and optimising them again spends a paid
 * transform quota on a finished file. The same ruling covers this thumbnail.
 *
 * `alt=""` for that file's other reason, which is invariant 5: the only description that exists for
 * an album photo is `nina_avatars.description`, that text is `glm-4.6v`'s and is her prompt's
 * private input, and it never crosses into a component. The accessible name lives on the clear
 * BUTTON, which is the only thing here a screen reader can act on.
 *
 * ── NO `'use client'` OF ITS OWN ─────────────────────────────────────────────────────────────
 * It takes a callback and renders, so it compiles into whichever graph imports it — `Composer`,
 * which is already a client component. `AttachmentChip`'s reasoning, verbatim.
 *
 * The photo is NOT a link and NOT a tap target: tapping it should not throw the runner out of a
 * message they are in the middle of writing, and they were just looking at it in the other tab.
 * The geometry — `max-w-[470px]`, `px-5` — belongs to the composer's own inner wrapper, which this
 * sits inside; only the bottom margin is this component's.
 */
export function PhotoAttachmentChip({
  photo,
  onClear,
}: {
  photo: NinaExistingPhoto
  onClear: () => void
}) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
            dimensions, already compressed by whoever wrote the row. See the header. */}
        <img src={photo.url} alt="" className="size-14 rounded-field bg-ink-3/20 object-cover" />
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove the attached photo"
        className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
