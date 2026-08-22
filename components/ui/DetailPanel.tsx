'use client'

import * as React from 'react'
import Image from 'next/image'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * `/me`'s detail panel: the art band, the scrolling body and the footer, around whatever a caller
 * puts inside — F24.
 *
 * This chrome was `components/profile/BadgeDialog.tsx` and stays exactly what it was; the badge
 * panel is now one body inside it and #25's personal-record panel is another. Every comment below
 * is a decision with a measured reason behind it, moved here with the code it describes rather
 * than re-derived. It lives in `components/ui/` by `BadgeShelf`'s own rule — one caller keeps its
 * markup local, and "`components/ui` is where a *second* caller would put it" — but deliberately
 * NOT in the `components/ui` barrel: `Sheet` and `PhotoViewer` are both here and both imported by
 * path, and the barrel is inside the public share route's import graph, which
 * `tests/share.bundle.test.ts` audits module by module.
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
 * ── THE PICTURE IS A BAND, AND THE ART IS THAT BAND'S OWN SHAPE ─────────────────────────────
 * The masters are a rectangle of navy twill with the patch sewn onto it, full bleed. Dropped into
 * a padded white panel the cloth would stop at the image's edge and read as a sticker on a sheet
 * of paper, so the picture is a band flush to three edges of the panel rather than a tile inside
 * it.
 *
 * F10 shipped 1024² masters into this 4:3 band, so the square art was drawn `h-full w-auto` and
 * the ~12.5% of band either side was painted with `art.twill`, the mean of that master's outer
 * frame. A mean cannot match a photograph of cloth in two ways at once: the raking light the
 * patches are lit by comes from the upper LEFT, so every master's left edge is measurably lighter
 * than its right — up to 12.4 of 255 apart on `two_a_days` — and one flat colour lands between the
 * two, visibly wrong at BOTH seams rather than at neither. The twill's diagonal weave grain has no
 * flat-fill equivalent either, so the join read as texture-stops-here even on the badges whose
 * value happened to match.
 *
 * `tools/extend_badge_art.py` widened all 22 badge masters to the band's own 4:3 by extending each
 * badge's own cloth, so the band now paints nothing and there is no seam to match. `object-cover`
 * on identical aspect ratios crops nothing — it is here to swallow sub-pixel rounding rather than
 * to fill a rectangle, and **the patch is still never cut**. `art.twill` stays as the band's
 * background colour so a slow decode shows cloth rather than card.
 *
 * `PanelArt` carries its own `width`/`height` rather than importing `BADGE_ART_WIDTH`: #24's record
 * deck is a separate manifest, generated at 1024×768 where the badge derivatives are 768×576, and a
 * shell that hardcoded one deck's numbers would be the record panel's first bug.
 */
export interface PanelArt {
  /** The 4:3 image for the band. */
  src: string
  /** The cloth behind it, `#rrggbb` — what a slow decode shows. */
  twill: string
  /** Intrinsic pixels, so `next/image` never has to guess and no deck's numbers are assumed. */
  width: number
  height: number
  /** The locked-badge treatment. A personal record is always held by a real run and never dims. */
  dimmed?: boolean
}

export function DetailPanel({
  open,
  art,
  onClose,
  children,
}: {
  open: boolean
  art: PanelArt | null
  onClose: () => void
  /**
   * The body, given the id it must put on its own heading. A render prop rather than a plain node
   * so `useId` and `aria-labelledby` stay wired inside the shell — a caller cannot forget to label
   * the dialog, and two callers cannot disagree about how.
   */
  children: (titleId: string) => React.ReactNode
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const titleId = React.useId()

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
       *
       * F24 changed the *mechanism* and not the decision: this was
       * `el.querySelector('button')?.focus()`, which found the Close button only because the body
       * happened to contain no buttons of its own. #26 puts a disclosure control inside the body,
       * above this footer in DOM order, and a positional query would then focus the expander while
       * this comment still claimed it focused Close. A ref cannot drift that way.
       */
      closeRef.current?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* Escape fires `cancel` and closes the element itself. Telling React about it is what keeps
         DOM state and component state from diverging — without this the dialog is shut but the
         caller's selection is still set, and the next tap on the same row appears to do nothing. */
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
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          {/* Flush to the panel's top and both sides — the `overflow-hidden` on the dialog is what
              rounds the band's two upper corners against the card radius. */}
          {art && (
            <div
              className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden"
              style={{ backgroundColor: art.twill }}
            >
              <Image
                /* Empty alt: the title, the condition and everything else the panel is about render
                   as real text below. A screen reader naming the picture too would read every
                   badge twice — the same call `BadgeShelf` makes for its 56px patch. */
                src={art.src}
                alt=""
                width={art.width}
                height={art.height}
                /* The art and the band are both 4:3, so this fills the band exactly. See the note
                   above on why `object-cover` here is not a crop. */
                className={cn('h-full w-full object-cover', art.dimmed && 'opacity-50 grayscale')}
                /* Already sized and content-hashed for exactly this box, and served `immutable` by
                   next.config.ts. Re-encoding it through the optimizer would bill a transformation
                   for an asset that was encoded for this purpose. */
                unoptimized
              />
            </div>
          )}

          {/* The half that gives when the panel cannot fit the viewport. The band and the footer
              keep their size; this scrolls. Clip nothing. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4">
            {children(titleId)}
          </div>

          {/* The bottom pad is 1rem because the body opens `pt-4`, and the gap under Close is meant
              to read as the gap above the body's first line — F23's ask, and its arithmetic.
              `--safe-bottom` adds the home-indicator inset on top, so the literal is what changes
              and not the whole value. `pt-3` rather than the body's `pt-4` is the compactness half:
              this footer diverges from `Sheet`'s deliberately, which pins a Save control above a
              keyboard and earns its 1.25rem with a `border-t`. Nothing here is edited and there is
              no rule above the button. */}
          <div className="shrink-0 px-5 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
            <Button ref={closeRef} variant="secondary" size="md" fullWidth onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
