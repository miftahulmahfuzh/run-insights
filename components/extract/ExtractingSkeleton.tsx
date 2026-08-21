'use client'

import Image from 'next/image'

import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  SCREEN_KIND_LABEL,
  TYPICAL_EXTRACTION_SECONDS,
  type ScreenKind,
} from '@/lib/extract/constants'

/**
 * The waiting state — **R-41's progress screen**, and every word of it is something the client
 * actually knows.
 *
 * The v2 design asked for per-screenshot progress: *"Summary — distance and pace read"*, *"Splits
 * — reading the table now"*, *"2 of 3 screenshots"*, a live `10.67 km` mid-flight. **The
 * architecture cannot supply any of it.** Extraction is ONE vision call carrying all three images
 * and returning a single JSON object at the end; there is no per-image signal, no section
 * ordering, and no partial value until the call returns. `2 of 3 screenshots` would be precisely
 * the fabricated progress the design's own principle forbids.
 *
 * So this screen states four true things instead:
 *
 *   1. all the screenshots are read in ONE pass — the interesting truth, not a limitation to hide;
 *   2. how long that usually takes (the measured ~35 s median);
 *   3. how long it has actually taken so far (a live elapsed count, the only honest progress
 *      signal available);
 *   4. the uploaded screenshots shown as PARTICIPATING in that one pass — never as a sequence
 *      with individual states.
 *
 * No percentage. No partial numbers. The skeleton below is the run card it is about to become,
 * which is the one part of the design that costs nothing and claims nothing.
 */
export function ExtractingSkeleton({
  photos,
  elapsedSec,
  gaveUp,
  pollError,
  onRetry,
}: {
  photos: Array<{ url: string; kind: ScreenKind; width: number | null; height: number | null }>
  elapsedSec: number
  gaveUp: boolean
  pollError: string | null
  onRetry: () => void
}) {
  const overdue = elapsedSec > TYPICAL_EXTRACTION_SECONDS * 1.6

  return (
    <div>
      <Card className="mb-4">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="text-[17px] font-semibold text-ink">
            {gaveUp ? 'This is taking longer than expected' : 'Reading your screenshots'}
          </p>
          <span
            className="shrink-0 text-[13px] font-semibold text-ink-3 tabular-nums"
            aria-live="polite"
          >
            {elapsedSec}s
          </span>
        </div>

        <p className="mb-4 max-w-[36ch] text-[13px] font-medium text-ink-2">
          {gaveUp ? (
            <>
              Nothing has been saved. You can wait a little longer and check again, or start over
              with the same screenshots.
            </>
          ) : (
            <>
              All {photos.length === 1 ? 'of it' : `${photos.length} screens`} in one pass, so the
              reader can check the total against the splits. Usually about{' '}
              {TYPICAL_EXTRACTION_SECONDS} seconds
              {overdue ? ' — this one is running long.' : '.'}
            </>
          )}
        </p>

        {photos.length > 0 && (
          <div className="mb-1 flex gap-2">
            {photos.map((photo) => (
              <figure key={photo.url} className="min-w-0 flex-1">
                <div
                  className={cn(
                    'relative aspect-[9/16] overflow-hidden rounded-chip bg-paper-2',
                    !gaveUp && '[animation:ri-pulse_2.4s_ease-in-out_infinite]',
                  )}
                >
                  <Image
                    src={photo.url}
                    alt=""
                    fill
                    sizes="140px"
                    className="object-cover opacity-90"
                  />
                </div>
                <figcaption className="mt-1.5 text-center text-[11px] font-semibold text-ink-3">
                  {SCREEN_KIND_LABEL[photo.kind]}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {gaveUp && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="h-11 flex-1 rounded-field bg-ink text-[14px] font-semibold text-card"
            >
              Check again
            </button>
            <a
              href="/upload"
              className="grid h-11 flex-1 place-items-center rounded-field bg-paper-2 text-[14px] font-semibold text-ink"
            >
              Start over
            </a>
          </div>
        )}

        {pollError && !gaveUp && (
          <p className="mt-3 text-[12px] font-medium text-ink-3">
            Still working — the last check could not reach the server ({pollError}). Retrying.
          </p>
        )}
      </Card>

      {/* "The skeleton is the run card it is about to become." Claims nothing, costs nothing. */}
      <Card aria-hidden="true">
        <SkeletonBlock className="h-9 w-2/5" />
        <div className="mt-5 grid grid-cols-3 gap-4">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <div className="mt-6 space-y-2">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-11/12" />
          <SkeletonBlock className="h-3 w-3/4" />
        </div>
      </Card>
    </div>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        '[animation:ri-pulse_2.4s_ease-in-out_infinite] rounded-chip bg-paper-2',
        className,
      )}
    />
  )
}

function SkeletonStat() {
  return (
    <div>
      <SkeletonBlock className="mb-2 h-2.5 w-2/3" />
      <SkeletonBlock className="h-5 w-full" />
    </div>
  )
}
