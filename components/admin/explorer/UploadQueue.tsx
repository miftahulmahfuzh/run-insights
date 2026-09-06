'use client'

import { useState } from 'react'

import { TOUCH_TARGET } from '@/components/admin/touch'
import { Button } from '@/components/ui'
import type { UploadRefusal } from '@/lib/admin/filetree'
import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import { cn } from '@/lib/cn'

import type { QueueItem, QueueReport } from './model'
import type { UploadPhase } from './useFolderUpload'

/**
 * What the upload is doing, in one line, with the detail one click away.
 *
 * ── A DROP THAT UPLOADS NOTHING MUST SAY SO ─────────────────────────────────────────────────
 * *"it automatically upload only the new folders and files as optimization"* has a failure mode the
 * requirement does not mention and the operator will hit on his second drop: **nothing happens.**
 * A queue that renders only in-flight work is indistinguishable from a broken page at that moment.
 * So `report.already` is on screen in words and numerals — *"Nothing new. All 313 files are already
 * here."* — and it is the single most important sentence this component says.
 *
 * ── ONE LINE BY DEFAULT, THREE HUNDRED ROWS NEVER ───────────────────────────────────────────
 * The summary is the interface. Expanded, the list shows every failure (which is what a human acts
 * on) plus a bounded window of what is moving, and then admits how many it is not drawing. A
 * three-hundred-row live list is a rendering cost paid for information nobody reads.
 *
 * ── THE NUMBERS ARE `tabular-nums`, LIKE EVERY OTHER NUMBER ON THIS SCREEN ──────────────────
 * Same treatment as the tree's counts and the pager's range: this screen's job is comparing sets of
 * files, so its numerals line up.
 */

const IN_FLIGHT_ROWS = 12

const STATE_TEXT: Record<QueueItem['state'], string> = {
  waiting: 'Waiting',
  thumbnailing: 'Reading',
  uploading: 'Uploading',
  registering: 'Saving',
  done: 'Done',
  error: 'Failed',
}

/**
 * One sentence per refusal reason. A `Record` over phase 2's union rather than a `switch` with a
 * default, so that adding a reason in `lib/admin/filetree.ts` fails the build here until it has a
 * sentence — the same guarantee `components/nina/Composer.tsx:123-127`'s `REJECTION_TEXT` gives.
 *
 * **Nine entries, not four.** `UploadRefusal` (phase 2's real name; the draft assumed
 * `UploadRefusalReason` with four members) is `FolderPathRejection | 'too_large' | 'empty_file' |
 * 'unnamed' | 'name_too_long'`, and `FolderPathRejection` contributes five of its own. The
 * exhaustive `Record` is what caught that: an incomplete map is a build error here, which is
 * exactly why it is a `Record` and not a `switch`.
 *
 * `rejected` files — the non-images — get no sentence at all and are never listed. The requirement
 * says they are skipped *automatically*, so they are a number in the headline and nothing more; a
 * list of two hundred `Thumbs.db` entries is not information.
 */
const REFUSAL_TEXT: Record<UploadRefusal, string> = {
  too_large: `Bigger than the ${Math.round(ADMIN_AVATAR_MAX_UPLOAD_BYTES / 1024 / 1024)} MB cap.`,
  empty_file: 'Zero bytes — a broken copy.',
  unnamed: 'No usable file name.',
  name_too_long: 'Its file name is too long.',
  too_deep: 'Nested deeper than the album allows.',
  path_too_long: 'Its folder path is too long.',
  segment_too_long: 'One of its folder names is too long.',
  bad_segment: 'Its folder or file name uses a character the album cannot store.',
  traversal: 'Its path tries to climb out of the album.',
}

export function UploadQueue({
  phase,
  items,
  report,
  error,
  onDismiss,
}: {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  error: string | null
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)

  if (phase === 'idle' && error == null) return null

  const done = items.filter((item) => item.state === 'done').length
  const failed = items.filter((item) => item.state === 'error')
  const busy = phase === 'reading' || phase === 'planning' || phase === 'uploading'
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100)

  return (
    /*
     * TWO offsets, and they answer two different obstacles.
     *
     * `bottom-[calc(3.5rem+var(--safe-bottom))] lg:bottom-0` is the STICKY ANCHOR. Below `lg` the
     * admin shell's nav is `fixed bottom-0 h-14 z-30` (phase 1), so an anchor of `bottom-0` parks
     * this panel behind it. `3.5rem` IS `h-14`. At `lg` the nav is a left rail again and the
     * anchor goes back to the bottom of the scrollport. `var(--safe-bottom)` is in the anchor as
     * well as in the padding because the nav bar itself sits above the home indicator — the bar's
     * top edge is `56px + inset` off the bottom of the viewport, and that is the line this panel
     * has to clear.
     *
     * `pb-[calc(1rem+var(--safe-bottom))]` is the PADDING — the repo's idiom for a bottom-stuck
     * element, the same one `app/x/[extractionId]/page.tsx:81` and `components/ui/Sheet.tsx:134`
     * use. It is kept for the `lg` case, where the anchor is `bottom-0` again and the Dismiss
     * button would otherwise land under the home indicator on a large touch screen. Below `lg` it
     * is redundant with the anchor and costs 34 px of padding on a panel that has room for it;
     * `p-4` still sets the other three sides, and `padding-bottom` is a longhand that Tailwind
     * emits after the `p-*` shorthand, which is why this reads as an override and behaves as one.
     */
    <div className="sticky bottom-[calc(3.5rem+var(--safe-bottom))] mt-4 rounded-card border border-rule bg-card p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-card lg:bottom-0">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        {/*
         * `w-full lg:w-auto lg:min-w-0 lg:flex-1`: the headline is the sentence this component
         * exists for (see the header), and at 366 px it cannot share a line with a toggle and a
         * Dismiss button without becoming three words and an ellipsis. So it takes its own row
         * below `lg`. At `lg` the flex basis of 0% from `flex-1` decides the width and `w-auto`
         * is inert, which is the one ordering in flex layout that is specified rather than
         * emission-dependent.
         */}
        <p className="w-full text-[13px] font-semibold text-ink lg:w-auto lg:min-w-0 lg:flex-1">
          {headline({ phase, items, report, done, failed: failed.length })}
        </p>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={cn(TOUCH_TARGET, 'shrink-0 px-2 text-[12px] font-semibold text-accent')}
          >
            {open ? 'Hide the list' : 'Show the list'}
          </button>
        )}

        {!busy && (
          <Button size="md" variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-pill bg-rule"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
        >
          <div
            className="h-full rounded-pill bg-accent transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {report != null && report.refused.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {report.refused.slice(0, IN_FLIGHT_ROWS).map((entry, index) => (
            /* `name`, not `path` — phase 2's `SkippedFile` carries the file's own display name,
               deliberately: several of these reasons ARE "the path could not be formed", so there
               is no joined path to show. The index is in the key because two refused files in two
               folders can legitimately share a name. */
            <li key={`${entry.name}-${index}`} className="text-[11px] font-medium text-warn">
              <span className="text-ink-2">{entry.name}</span> &mdash; {REFUSAL_TEXT[entry.reason]}
            </li>
          ))}
          {report.refused.length > IN_FLIGHT_ROWS && (
            <li className="text-[11px] font-medium text-ink-3 tabular-nums">
              and {report.refused.length - IN_FLIGHT_ROWS} more refused
            </li>
          )}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}

      {open && (
        /* `overscroll-contain` so reaching the end of a 12-row list inside a sticky panel does
           not hand the remaining scroll to the page underneath and yank the queue off screen —
           the specific way a nested scroller misbehaves on iOS. */
        <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto overscroll-contain border-t border-rule pt-3">
          {failed.map((item) => (
            <li key={item.id} className="flex gap-2 text-[11px] font-medium">
              <span className="min-w-0 flex-1 truncate text-ink-2">{item.path}</span>
              <span className="shrink-0 text-warn">{item.error ?? 'Failed'}</span>
            </li>
          ))}
          {items
            .filter((item) => item.state !== 'done' && item.state !== 'error')
            .slice(0, IN_FLIGHT_ROWS)
            .map((item) => (
              <li key={item.id} className="flex gap-2 text-[11px] font-medium">
                <span className="min-w-0 flex-1 truncate text-ink-2">{item.path}</span>
                <span className="shrink-0 text-ink-3">{STATE_TEXT[item.state]}</span>
              </li>
            ))}
          <li className="pt-1 text-[11px] font-medium text-ink-3 tabular-nums">
            {done} of {items.length} finished
          </li>
        </ul>
      )}
    </div>
  )
}

/** The one line that has to be true at every moment of a gesture. */
function headline({
  phase,
  items,
  report,
  done,
  failed,
}: {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  done: number
  failed: number
}): string {
  if (phase === 'reading') return 'Reading the folder'
  if (phase === 'planning') return 'Checking what is already here'

  const skipped: string[] = []
  if (report != null && report.already > 0) skipped.push(`${report.already} already here`)
  if (report != null && report.rejected > 0) skipped.push(`${report.rejected} not images`)
  if (report != null && report.refused.length > 0) skipped.push(`${report.refused.length} refused`)
  if (failed > 0) skipped.push(`${failed} failed`)
  const tail = skipped.length > 0 ? ` · ${skipped.join(' · ')}` : ''

  if (items.length === 0) {
    // THE SENTENCE THIS COMPONENT EXISTS FOR. See the header.
    if (report == null) return 'Nothing to upload'
    if (report.already === report.found && report.found > 0) {
      return `Nothing new. All ${report.found} files are already here.`
    }
    return `Nothing new to upload${tail}`
  }

  if (phase === 'uploading') return `Uploading ${done} of ${items.length}${tail}`
  return `Uploaded ${done} of ${items.length}${tail}`
}
