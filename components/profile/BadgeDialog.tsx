'use client'

import * as React from 'react'
import Image from 'next/image'

import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/format'
import { BADGE_ART, BADGE_ART_HEIGHT, BADGE_ART_WIDTH } from '@/lib/badges/badge-art'
import type { ShelfEntry } from '@/lib/badges/shelf'

/**
 * One badge, big — the panel a tap on a shelf row opens.
 *
 * ── WHY A NATIVE `<dialog>` AND NOT `Sheet` ─────────────────────────────────────────────────
 * `Sheet` calls itself "the app's one modal surface" and it stays that, for what it was written
 * for: a correction is a *detour* from a table the reviewer must not lose their place in, so it
 * rises from the bottom, pins a Save footer and keeps every field above the keyboard. None of that
 * describes this. Nothing here is edited, there is no keyboard, and the thing the panel exists to
 * show is a **picture** — which wants to be flush to three edges of the panel, and `Sheet`'s body
 * is padded `px-5 py-4` by contract because every one of its callers is a form.
 *
 * So this is a `<dialog>` opened with `showModal()`, and the choice buys more than layout. The UA
 * supplies, with no application code: the focus trap, initial focus, `aria-modal`, Escape-to-cancel,
 * focus restoration on close, and the backdrop — all four of which `Sheet` hand-rolls in an effect.
 * **Do not add `role="dialog" aria-modal="true"` here**; a redundant explicit role on a `<dialog>`
 * is a known screen-reader hazard, which is exactly why `Sheet`'s own div needs them and this does
 * not.
 *
 * The backdrop is styled in `app/globals.css` rather than with a `backdrop:` utility. `::backdrop`
 * inherits from nothing in engines predating the 2024 spec change, so `backdrop:bg-ink/40` would
 * compile to `background-color: var(--ink)` against an element that cannot see `--ink` and the
 * scrim would silently vanish. A literal rgba in both schemes is the only form that holds.
 *
 * ── THE PICTURE IS A BAND, AND THE ART IS NOW THAT BAND'S OWN SHAPE ──────────────────────────
 * The masters are a rectangle of navy twill with the patch sewn onto it, full bleed. Dropped into
 * a padded white panel the cloth would stop at the image's edge and read as a sticker on a sheet
 * of paper, so the picture is a band flush to three edges of the panel rather than a tile inside
 * it. That much has not changed.
 *
 * What changed is that the art fits. F10 shipped 1024² masters into this 4:3 band, so the square
 * art was drawn `h-full w-auto` and the ~12.5% of band either side was painted with `art.twill`,
 * the mean of that master's outer frame. A mean cannot match a photograph of cloth in two ways at
 * once: the raking light the patches are lit by comes from the upper LEFT, so every master's left
 * edge is measurably lighter than its right — up to 12.4 of 255 apart on `two_a_days` — and one
 * flat colour lands between the two, visibly wrong at BOTH seams rather than at neither. The
 * twill's diagonal weave grain has no flat-fill equivalent either, so the join read as
 * texture-stops-here even on the badges whose value happened to match.
 *
 * `tools/extend_badge_art.py` widened all 22 masters to the band's own 4:3 by extending each
 * badge's own cloth, so the band now paints nothing and there is no seam to match. `object-cover`
 * on identical aspect ratios crops nothing — it is here to swallow sub-pixel rounding rather than
 * to fill a rectangle, and **the patch is still never cut**. `art.twill` stays as the band's
 * background colour so a slow decode shows cloth rather than card; `BadgeShelf` still needs it for
 * real, because its tile is square and its 56px mark is a square crop.
 *
 * ── WHAT THE PANEL SAYS THAT THE ROW DOES NOT ───────────────────────────────────────────────
 * The row is a reference table: title, condition, gloss, date. The panel adds the two things a
 * table has no room for — the art at a size where the embroidery is legible, and the **count**
 * spelled out in words rather than compressed into a trailing "· earned 3 times". Everything else
 * is the same strings, deliberately: a panel that reworded the condition would be R-42's second
 * source of truth for a threshold, one layer further from the catalog.
 */
export function BadgeDialog({ entry, onClose }: { entry: ShelfEntry | null; onClose: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const open = entry !== null

  /*
   * `showModal()` and `close()` are imperative and this component is declarative, so exactly one
   * effect reconciles them. Both `el.open` guards are load-bearing: `showModal()` on an
   * already-open dialog throws `InvalidStateError`, and React 19 Strict Mode double-invokes effects
   * in development.
   */
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      /*
       * The Close button, chosen explicitly, and AFTER `showModal()`.
       *
       * `showModal()` picks the dialog's own focus delegate — the first focusable *area*, which is
       * not the first tab stop. The body below is a scroll container under a short viewport, and
       * Chromium makes a scroll container a focusable area on its own, so it would win and the
       * panel would open announcing "scrollable region" with a focus ring drawn across it.
       * `tabIndex={-1}` makes that worse rather than better — an explicit tabindex is still a
       * focusable area.
       *
       * This is NOT React's `autoFocus` prop, and the ordering is the whole difference. `autoFocus`
       * fires on MOUNT, one commit before this effect, so the dialog would record a child of its
       * own as the element to restore focus to and drop focus to `<body>` on close — losing the
       * shelf row the user tapped. Here `showModal()` has already recorded that row.
       */
      el.querySelector('button')?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* Escape fires `cancel` and closes the element itself. Telling React about it is what keeps
         DOM state and component state from diverging — without this the dialog is shut but `entry`
         is still set, and the next tap on the same row appears to do nothing. */
      onCancel={onClose}
      /* A click on the backdrop targets the <dialog> itself, because the panel is its child. This
         is the robust form; comparing pointer coordinates against a bounding box breaks when a text
         selection is dragged out of the panel and released over the backdrop. */
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto max-h-[92dvh] w-[calc(100vw-2rem)] max-w-[360px] overflow-hidden p-0',
        'rounded-card bg-card text-ink shadow-sheet',
      )}
    >
      {/* Nothing is rendered while closed. A `<dialog>` with `display: none` still has its subtree
          in the document, and 22 conditions' worth of prose behind a shut panel is prose a screen
          reader can reach in the reading order of every other page element. */}
      {entry && <Panel entry={entry} titleId={titleId} onClose={onClose} />}
    </dialog>
  )
}

function Panel({
  entry,
  titleId,
  onClose,
}: {
  entry: ShelfEntry
  titleId: string
  onClose: () => void
}) {
  const art = BADGE_ART[entry.key]
  const earned = entry.earned

  return (
    <div className="flex max-h-[92dvh] flex-col">
      {/* Flush to the panel's top and both sides — the `overflow-hidden` on the dialog is what
          rounds the band's two upper corners against the card radius. */}
      <div
        className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden"
        style={{ backgroundColor: art.twill }}
      >
        <Image
          /* Empty alt: the title, condition, gloss and count all render as real text below. A
             screen reader naming the picture too would read every badge twice — the same call
             `BadgeShelf` makes for its 56px patch. */
          src={art.src}
          alt=""
          width={BADGE_ART_WIDTH}
          height={BADGE_ART_HEIGHT}
          /* The art and the band are both 4:3, so this fills the band exactly. See the note above
             on why `object-cover` here is not a crop. */
          className={cn('h-full w-full object-cover', !earned && 'opacity-50 grayscale')}
          /* Already a 768×576 WebP, content-hashed and served `immutable` by next.config.ts.
             Re-encoding it through the optimizer would bill a transformation for an asset that was
             encoded for exactly this box. */
          unoptimized
        />
      </div>

      {/* The half that gives when the panel cannot fit the viewport. The band and the footer keep
          their size; this scrolls. Clip nothing. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4">
        <p
          className={cn(
            'text-[11px] font-semibold tracking-[0.02em]',
            earned ? 'text-accent' : 'text-ink-3',
          )}
        >
          {earned ? earnedLabel(earned.count) : 'Not yet earned'}
        </p>

        <h2 id={titleId} className="mt-1 text-[19px] font-semibold text-ink">
          {entry.title}
        </h2>

        <p className="mt-2 text-[13px] font-medium text-ink-2">{entry.condition}</p>
        <p className="mt-1.5 text-[13px] font-medium text-ink-3">{entry.gloss}</p>

        {/* `earned_on` is the day the badge is *about*, never the instant its row was written: a
            backfilled run's badge is dated to the run.

            Both ends of the span, because F13's ledger holds every award as its own row and the
            first one is now a fact rather than an inference. A badge earned twelve times says when
            it started and when it last happened; the 10 in between are a log, not a record, and
            the panel deliberately does not list them. */}
        {earned && (
          <p className="mt-3 text-[12px] font-semibold text-ink-2 tabular-nums">
            {earned.count === 1 ? (
              <>Earned {formatDay(earned.earnedOn)}</>
            ) : (
              <>
                ×{earned.count} · first {formatDay(earned.firstEarnedOn)} · latest{' '}
                {formatDay(earned.earnedOn)}
              </>
            )}
          </p>
        )}

        {/* R-44: an invitation, not a nag — and only on the five badges where the number is real. */}
        {entry.progress && (
          <p className="mt-3 text-[12px] font-semibold text-ink-3 tabular-nums">
            {entry.progress.sentence}
          </p>
        )}
      </div>

      <div className="shrink-0 px-5 pt-4 pb-[calc(1.25rem+var(--safe-bottom))]">
        <Button variant="secondary" size="md" fullWidth onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

/**
 * The count, spelled out.
 *
 * "Earned once" rather than "Earned ×1": a count of one is the ordinary case and a multiplier on it
 * reads as a scoreboard entry. Above one the multiplier is the honest form, because the number is
 * the point — and it is the one fact the shelf row cannot give the space to say plainly.
 */
function earnedLabel(count: number): string {
  return count === 1 ? 'Earned once' : `Earned ${count} times`
}
