'use client'

import Link from 'next/link'
import { useState } from 'react'

import { TOUCH_ICON } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

/**
 * The storage warning `/admin`'s layout renders while Nina's stored photos are over
 * `NINA_PHOTO_SAFE_COUNT` (`lib/admin/photoBudget.ts` carries the derivation).
 *
 * **Dismissal is React state and nothing else, on purpose.** The ask was a banner the admin can
 * close that comes back "next time admin open the admin page". The layout stays mounted across
 * client navigations under `/admin`, so a close holds while moving between tabs, and any fresh
 * load of `/admin` mounts it again. A cookie or `localStorage` flag would make the close outlive
 * the visit, which is the one behaviour this banner must not have.
 */
export function PhotoBudgetBanner({ count, safeCount }: { count: number; safeCount: number }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-card border border-warn bg-warn-soft p-4"
    >
      <div className="min-w-0 flex-1 text-[14px] text-ink">
        <p className="font-semibold">Nina&apos;s photo storage is nearly full</p>
        <p className="mt-1 max-w-[64ch] text-ink-2">
          {count} photos are stored; the safe limit for the free Blob plan is {safeCount}. Remove at
          least {count - safeCount} from the{' '}
          <Link href="/admin/nina" className="font-semibold text-ink underline">
            Image collection
          </Link>{' '}
          before the 1 GB storage cap suspends every photo store on the account.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss the storage warning"
        className={cn(TOUCH_ICON, '-mt-2 -mr-2 shrink-0 text-[15px] font-semibold text-ink-3')}
      >
        &times;
      </button>
    </div>
  )
}
