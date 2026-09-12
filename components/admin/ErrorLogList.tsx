'use client'

import * as React from 'react'

import { LogTextDialog } from '@/components/admin/LogTextDialog'
import { TOUCH_ICON } from '@/components/admin/touch'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import type { ErrorLogListItem } from '@/lib/admin/errorLogModel'
import { cn } from '@/lib/cn'

/**
 * `/admin/error-logs`'s list — R2: *"biar tabelnya keliatan compact, buat sedemikian rupa supaya
 * satu row ditabel benar2 cuma makan satu row di xsmax screen"*.
 *
 * ── WHY A FLEX `<li>` AND NOT A `<table>` ───────────────────────────────────────────────────
 * This repo has exactly one proven "one row at any width" pattern and it is
 * `components/nina/NinaJobList.tsx:119-130`: a flex line with `min-w-0 truncate` on the label that
 * gives and `shrink-0` on the companions that must not. Its one real admin `<table>`
 * (`ShortcutTable.tsx:151`) is the counter-example — `min-w-[460px]` inside an `overflow-x-auto`
 * Card, which is a table that scrolls rather than a table that fits.
 *
 * The width budget at 375px is in this phase's plan file and it is the reason for two choices the
 * markup below would otherwise look arbitrary for: the stamp and the model share ONE truncating
 * line (stacking them is two lines of text in a 44px box, which reads as two rows), and the icon
 * buttons sit in one `shrink-0` group with NO gaps between them (each gap would cost ~2
 * characters of the model name to buy air the glyphs already have inside their 44px boxes).
 *
 * ── WHY IT IS A CLIENT COMPONENT ────────────────────────────────────────────────────────────
 * It holds two pieces of state and nothing else: which text is in the popup, and which photo the
 * viewer is showing. `NinaAboutScreen.tsx:495-501` is the pattern for the second — client-held
 * index, `<PhotoViewer>` rendered conditionally. Every prop is a string or `null`
 * (`lib/admin/errorLogModel.ts` builds the items on the server), so this file names one module
 * outside `components/` and that module has zero value imports: no drizzle table and no zod
 * schema is ever bundled for the browser.
 *
 * ── THE IMAGE BUTTON IS ABSENT, NOT DISABLED, WHEN THERE IS NO IMAGE ────────────────────────
 * `lib/nina/jobview.ts`'s `planJobPhoto` convention: never a link the server has not proved. A
 * Text row has no image by construction; a Multimodal row always has one; an Image-generation row
 * has one only when the job was anchored to a reference photo.
 */
export function ErrorLogList({ items }: { items: readonly ErrorLogListItem[] }) {
  /** Which text the popup is showing. `null` is "shut" — one state, two buttons. */
  const [detail, setDetail] = React.useState<{ title: string; body: string } | null>(null)
  /** An index into `photos` below, or `null` for "no viewer". `NinaAboutScreen`'s shape. */
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null)

  /**
   * Every image on this page, in row order, **deduplicated by URL** — so the viewer's swipe and
   * its dot row page through the whole page of logs rather than showing one photo in isolation.
   *
   * The dedupe is not tidiness: `PhotoViewer` keys its dot row by `p.url`
   * (`components/ui/PhotoViewer.tsx:269`), and the same photo failing to be described twice in one
   * night is the ORDINARY case for this table — two rows, one URL, two identical React keys.
   */
  const photos = React.useMemo<ViewerPhoto[]>(() => {
    const byUrl = new Map<string, ViewerPhoto>()
    for (const item of items) {
      if (item.imageUrl === null || byUrl.has(item.imageUrl)) continue
      byUrl.set(item.imageUrl, {
        url: item.imageUrl,
        /* `kind` is only the fallback name when `label` is absent, and it never is here. */
        kind: 'log',
        label: `${item.stamp} · ${item.model}`,
      })
    }
    return [...byUrl.values()]
  }, [items])

  return (
    <>
      {/* One sheet, one pair of rounded corners, one hairline between rows: `overflow-hidden`
          sits on the list so the first and last rows are clipped to the card radius, and each row
          carries its own `border-b` with `last:border-b-0` rather than a `divide-y` this repo
          does not use anywhere. */}
      <ul className="overflow-hidden rounded-card border border-rule bg-card">
        {items.map((item) => (
          <li
            key={item.id}
            /* `items-center`: the row's height comes from the 44px buttons, and the text is
               centred in it. `pl-3` only — see the header's width budget for why there is no
               right padding. */
            className="flex items-center gap-2 border-b border-rule pl-3 last:border-b-0"
          >
            {/* The half that gives. `min-w-0` is what lets `truncate` below actually truncate
                instead of blowing the row out; `flex-1` is what makes it take every pixel the
                button group does not. */}
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <time
                dateTime={item.stampISO}
                title={item.stampISO}
                className="shrink-0 text-[11px] font-semibold text-ink-3 tabular-nums"
              >
                {item.stamp}
              </time>
              <span
                title={item.model}
                className="min-w-0 truncate text-[12px] font-semibold text-ink"
              >
                {item.model}
              </span>
            </span>

            {/* One group, no gaps. See the header. */}
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() =>
                  setDetail({
                    title: `Full input · ${item.stamp} · ${item.provider} · ${item.model}`,
                    body: item.fullInput,
                  })
                }
                /* The accessible name carries the row's identity, because the glyph is
                   `aria-hidden` decor and "Full input" alone would be one of fifty identical
                   names on this page. `PhotoGrid.tsx:133`'s rule. */
                aria-label={`Full input — ${item.model}, ${item.stamp}`}
                className={cn(TOUCH_ICON, 'text-ink-2')}
              >
                <FileTextIcon className="size-4" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setDetail({
                    title: `Full error · ${item.stamp} · ${item.provider} · ${item.model}`,
                    body: item.errorText,
                  })
                }
                aria-label={`Full error — ${item.model}, ${item.stamp}`}
                /* The one coloured control in the row: this is the thing the operator came for.
                   `text-red` is the token `NinaJobList.tsx:133` paints a failed stage with. */
                className={cn(TOUCH_ICON, 'text-red')}
              >
                <TriangleAlertIcon className="size-4" />
              </button>

              {item.imageUrl !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const index = photos.findIndex((photo) => photo.url === item.imageUrl)
                    if (index >= 0) setViewerIndex(index)
                  }}
                  aria-label={`Open the image — ${item.model}, ${item.stamp}`}
                  className={cn(TOUCH_ICON, 'text-ink-2')}
                >
                  <ImageIcon className="size-4" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <LogTextDialog
        open={detail !== null}
        title={detail?.title ?? ''}
        body={detail?.body ?? ''}
        onClose={() => setDetail(null)}
      />

      {/* R2's *"image link ... ketika di klik akan show the image in full screen. kita udah punya
          fitur ini pas klik satu image di /nina/about"* — literally that component, invoked the
          way that screen invokes it. `subject="foto"` for the same reason it does: "log
          screenshot" is not a thing. */}
      {viewerIndex !== null && photos[viewerIndex] != null && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          subject="foto"
        />
      )}
    </>
  )
}

/*
 * The three glyphs, inlined rather than imported — `components/admin/AdminNavLinks.tsx`'s ruling,
 * extended here the way `components/admin/photoIcons.tsx` extends it: **Lucide** (lucide-static,
 * ISC), copied verbatim with the four `stroke*` presentation attributes moved onto the root `svg`
 * where they inherit to every child. Every glyph takes `className` (the size belongs to the
 * caller — `size-4`, `photoIcons.tsx`'s number for an admin icon button) and is `aria-hidden`,
 * because the accessible name is the button's `aria-label`, never the picture.
 *
 * `TriangleAlertIcon` is also drawn in `AdminNavLinks.tsx`, and that duplication is deliberate:
 * that file's own header holds that its seven glyphs live in it, and the nav cell and the row
 * button mean the same thing and must therefore look the same. Three glyphs is not worth a
 * package and two copies of one path list is not worth a barrel.
 */

/** Full input: the request payload, drawn as the document it is. */
function FileTextIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}

/** Full error: the thing that went wrong. The nav cell's glyph, at row size. */
function TriangleAlertIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

/** The input image — the photo she failed to describe, or the generation's anchor. */
function ImageIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}
