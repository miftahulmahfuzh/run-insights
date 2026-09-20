'use client'

import * as React from 'react'

import { Maximize2Icon } from '@/components/admin/photoIcons'
import { Button, ButtonLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'

import {
  nextPhotoReferenceValue,
  PHOTO_REFERENCE_NONE,
  photoReferenceView,
} from './photoReferenceModel'
import type { PhotoReferenceItem } from './photoReferenceModel'

/**
 * R10's grid: *"photo reference: user can select all photos in Nina's album and Chat photos. can
 * you make something like a simple photos grid without any captions (just like ios album app).
 * user can select one out of all these photos."*
 *
 * ── "WITHOUT ANY CAPTIONS" IS LITERAL, AND THE SHAPE ENFORCES IT ────────────────────────────────
 * There is no text node inside a tile. No filename, no date, no description, no folder, and no
 * badge naming which set the photograph came from. `PhotoReferenceItem` carries three fields for
 * that reason — see its docstring, and `lib/nina/chatphotos.ts:13-17`, whose invariant 5 is the
 * repo's precedent for enforcing exactly this: *"There is no caption field here and there must
 * never be one."* `ChatPhotoGrid`'s tile renders `photo.createdAt.slice(0, 10)` under the image;
 * that is the line R10 rules out, and the props here cannot express it.
 *
 * ── WHAT THIS BORROWS FROM THE TWO EXISTING GRIDS, AND WHAT IT REFUSES ──────────────────────────
 * Borrowed from `components/nina/NinaPhotoGrid.tsx:44-60` and
 * `components/admin/explorer/PhotoGrid.tsx:79-105`: `aspect-square` with `object-cover`, a
 * `bg-ink-3/20` bed under the image (a mid-grey in both schemes, which `NinaPhotoGrid` settled
 * after three phases argued it), one `<button>` per cell, `alt=""` with the accessible name on the
 * button, `loading="lazy"`, and `thumbUrl ?? url`.
 *
 * Refused, on purpose: `ChatPhotoGrid`'s `aspect-[3/4]` tile inside a `rounded-chip border p-1`
 * card with `gap-2`, its date line, and its `border-accent bg-accent-soft` selected state. That is
 * a file manager's tile and `/admin/photos` is right to have one; the user asked for the iOS
 * Photos idiom, which is a sheet of touching squares. So: `gap-[3px]`, no border, no padding, no
 * per-tile radius, one `overflow-hidden rounded-field` on the whole sheet, and a selection drawn as
 * a check badge plus a slight inset rather than as a coloured frame around a padded card.
 *
 * ── A PLAIN `<img>`, FOR THE REASON THIS REPO HAS ALREADY RULED ─────────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rejects `next/image` for Blob-hosted photographs
 * outright — it re-optimises finished files on a paid transform quota — and
 * `explorer/PhotoGrid.tsx:31-34` and `ChatPhotoGrid.tsx:26-33` both reaffirm it. This follows that
 * precedent rather than re-opening it. The album half of this union has a derived `thumb_url` and
 * uses it; the chat half has no such column at all, so those tiles load originals, and
 * `loading="lazy"` plus a `NINA_PHOTO_REF_PAGE_SIZE`-row page is the whole mitigation. It is a
 * known cost, not an oversight.
 *
 * ── `aria-pressed` AND NOT A RADIO GROUP ────────────────────────────────────────────────────────
 * A radio group cannot express *one, or none*: un-checking a radio is not a gesture ARIA has, so
 * the deselect-on-re-tap behaviour R10 needs would be a lie told in radio semantics. A toggle whose
 * pressed state the model keeps single is what this interaction is, and it is what both existing
 * single-selection admin grids already use. What `aria-pressed` does NOT give — an announced "3 of
 * 168" — is paid for deliberately: the status line beside the heading names the current selection,
 * and **Clear reference** makes "none" reachable without knowing that re-tapping works.
 *
 * ── TOUCH TARGETS ON A DENSE GRID ───────────────────────────────────────────────────────────────
 * `PHOTO_REFERENCE_MIN_TILE_PX` is the `minmax()` floor for the fluid tablet range (`sm` to `lg`):
 * `auto-fill` drops a column before it lets a tile go under 92 px — 2.1x `docs/design-brief.md`'s
 * 44 pt minimum. Below `sm` (phones) the grid is a fixed 3 columns, comfortably clear of the floor
 * even on a narrow screen; at `lg` and up (desktop) it is a fixed 33 columns. `NINA_PHOTO_REF_PAGE_SIZE`
 * is 99 — divisible by both 3 and 33 — so a full page tiles as a clean sheet with no trailing gap
 * on either breakpoint: 33x3 on desktop, 3x33 on phones. Only the collection's last (partial) page
 * can ever leave a row short.
 *
 * ── WHY THE DESKTOP TIER SCROLLS SIDEWAYS ───────────────────────────────────────────────────────
 * 33 columns of `1fr` (Tailwind's plain `grid-cols-33`, if it existed) would divide whatever width
 * the admin panel happens to have and let each tile shrink below the 92 px floor on anything but an
 * extra-wide monitor — the same floor the tablet tier enforces with `auto-fill`, silently abandoned
 * at `lg` if columns are allowed to compress. So the `lg` track is `minmax(92px,1fr)` per column,
 * same floor, and the wrapping `<div>` carries `lg:overflow-x-auto` so a full-width 33-column row
 * (3036 px minimum) scrolls horizontally inside the admin panel instead of squeezing every tile
 * illegibly thin. `overflow-hidden rounded-field` moved from the `<ul>` onto that wrapper, since it
 * is now the wrapper's edges that frame the visible sheet; `lg:overflow-x-auto` only ever overrides
 * the horizontal half of that shorthand, so the vertical clip (and the rounded corners it draws)
 * survive unchanged below `lg`, where the grid never overflows its container in the first place.
 *
 * ── IT READS NOTHING AND WRITES NOTHING ─────────────────────────────────────────────────────────
 * No Server Action is imported, no `fetch()` is called, and there is no database read here or
 * anywhere downstream of here. The rows arrive as plain serializable props from the page that owns
 * the read (phase 1's union, mapped on the server by phase 4's page), and the selection leaves
 * through `onChange` into phase 4's draft, which phase 4's one save persists. Invariant 9: no
 * drizzle type and no Zod schema crosses this boundary. The `<link rel="prefetch">` hints below are
 * a browser resource hint, not a fetch this code performs — they name URLs the server already
 * computed and let the browser decide whether and when to act on them.
 *
 * ── `collapsible`, BECAUSE THIS COMPONENT HAS TWO VERY DIFFERENT HOMES (2026-09-20) ─────────────
 * `ImageGenPanel.tsx` mounts this beside ten other controls, where a permanently-open photo grid
 * pushes everything below it down the page — so THERE, `collapsible` is `true` and the grid sits
 * inside a `<details>` with no `open` attribute, `ImageGenPanel.tsx`'s own "Placeholder reference"
 * and "The assembled image prompt" idiom applied here: a native disclosure rather than a
 * hand-rolled `useState` toggle, closed on every mount. The current selection still reads at a
 * glance without opening it — the status line moved from a sibling paragraph into the `<summary>`
 * itself, the same place "The assembled image prompt" puts its own "(as saved…)" qualifier.
 *
 * `NinaJobAnchorPicker.tsx` mounts this as the ENTIRE content of its own dedicated
 * `/nina/jobs/[id]/anchor` page — there `collapsible` is `false`, because a grid that is the whole
 * reason the page exists must not open collapsed; a runner who lands here should see photographs,
 * not a closed disclosure they have to know to tap.
 *
 * ── THE "FULL VIEW" BUTTON DOES NOT PARSE `key` (2026-09-20) ────────────────────────────────────
 * `/nina/jobs/[id]`'s Detail-foto screen (`NinaJobDetail.tsx`) opens its reference photo in the
 * app's one full-screen viewer (`components/ui/PhotoViewer.tsx`, mounted by `/nina/about`) through
 * a `ButtonLink` built by `aboutPhotoHref(section, id, returnTo)`. This picker offers the same
 * button for the same reason — so the admin can see what the current anchor actually looks like at
 * full size, not just its thumbnail — but it does NOT build that href itself: `fullViewHref` is
 * handed in already-built, from `ImageGenPanel.tsx`'s own `draft.reference.source`/`.id`. Building
 * it here would mean parsing `source`/`id` back out of the opaque `key`, which is exactly what "THE
 * SELECTION IS AN OPAQUE STRING" above rules out — this keeps that invariant intact by having the
 * one caller that already HOLDS `source`/`id` unparsed do the one thing that needs them.
 */
export function PhotoReferencePicker({
  items,
  total,
  page,
  pageCount,
  preloadUrls,
  value,
  selectedId,
  onChange,
  fullViewHref,
  collapsible,
}: {
  /**
   * One real `?page=` window of the deduplicated union — album rows and `kind = 'generated'` chat
   * rows together, newest first, at most `NINA_PHOTO_REF_PAGE_SIZE` of them. **Not reordered
   * here**: the order is the read's, and this component carries no date to sort by even if it
   * wanted to.
   */
  items: readonly PhotoReferenceItem[]
  /** How many photographs the deduplicated union holds in total, across every page. */
  total: number
  /** 1-based. The page this window came from. */
  page: number
  /** `Math.max(1, Math.ceil(total / pageSize))` — always at least 1, even for an empty collection. */
  pageCount: number
  /**
   * Thumbnail (or original) URLs for the page either side of `page` — `listNinaPhotoReferences`'s
   * `preloadUrls`, rendered below as `<link rel="prefetch">` hints so a `Previous`/`Next` click
   * finds its images already warming in the browser instead of starting cold.
   */
  preloadUrls: readonly string[]
  /** The saved (or drafted) selection. `PHOTO_REFERENCE_NONE` (`''`) means no reference. */
  value: string
  /**
   * The selection's raw id, straight off `NinaImageReference.id` — never parsed out of `value`.
   * `''` when nothing is selected, matching `value`. Shown in the footer so a photograph that
   * looks the same on two different pages (an unhashed duplicate `dedupeNinaPhotoRefs` could not
   * prove identical — see that function's header) can still be told apart by id.
   */
  selectedId: string
  /** Called with the next value — a `key`, or `PHOTO_REFERENCE_NONE` to clear. */
  onChange: (next: string) => void
  /**
   * The current selection's full-screen viewer link — `aboutPhotoHref(section, id, returnTo)`,
   * already built by `ImageGenPanel.tsx` from the draft's own `reference.source`/`.id`. `null` when
   * nothing is selected, or when the caller offers no such link (`NinaJobAnchorPicker.tsx` passes
   * `null` unconditionally — R10's "full view" ask was for the admin panel). See the header's "THE
   * 'FULL VIEW' BUTTON DOES NOT PARSE `key`" for why this arrives pre-built rather than being
   * derived from `value` in here.
   */
  fullViewHref: string | null
  /**
   * Whether the grid sits behind a closed `<details>` (`ImageGenPanel.tsx`) or is always open
   * (`NinaJobAnchorPicker.tsx`). Required rather than defaulted — see the header's `collapsible`
   * section — so a new caller has to decide rather than inherit whichever mode this happened to
   * default to.
   */
  collapsible: boolean
  /**
   * No `disabled` prop (2026-09-12 sweep): it was born for "while the save transition runs" but
   * the one call site never armed it, and a prop with no caller is a second way to render,
   * waiting (the `RunDateLink` round-3 rule). The save keeps its protection one level up — the
   * transition state lives with the form that owns the save.
   */
}) {
  const sectionRef = React.useRef<HTMLElement | null>(null)
  /** A plain callback ref, because `sectionRef` has to fit both a `<details>` and a `<section>` —
   * the two elements `collapsible` chooses between — and `Ref<HTMLDetailsElement>` and
   * `Ref<HTMLElement>` are not the same object type even though one element is the other. */
  const setSectionRef = (el: HTMLElement | null) => {
    sectionRef.current = el
  }
  const mountedRef = React.useRef(false)

  /*
   * `Previous`/`Next` swap the whole page's RSC payload (`?page=` is a real navigation, not local
   * state), and `ButtonLink`'s `scroll={false}` below turns off Next's default scroll-to-top for
   * it — so without this effect the viewport would just stay wherever it was, which on a page
   * taller than the grid is usually still scrolled past the top. Scrolling the section itself into
   * view puts the first row back under the pointer instead. Skipped on mount: the section is
   * already in view on first load, and the component instance (and its `sectionRef`) persists
   * across the `page`-prop change a Previous/Next click causes, so the effect fires exactly on
   * that change.
   */
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    sectionRef.current?.scrollIntoView?.({ block: 'start' })
  }, [page])

  const view = photoReferenceView({ items, value })

  /* Hoisted into `<head>` by React 19 (deduped by `href`) regardless of where in the tree it
   * renders — `rel="prefetch"` and not `preload` because this warms a LIKELY next navigation
   * rather than something the current render needs, so it should not compete for bandwidth or
   * priority with this page's own images. */
  const preloadLinks = preloadUrls.map((url) => (
    <link key={url} rel="prefetch" as="image" href={url} />
  ))

  /* The status line `aria-pressed` alone cannot give. No `aria-live`: each tile already announces
   * its own pressed state on activation, and a live region would say it twice. */
  const statusText = view.selectedLabel === null ? 'No reference' : `${view.selectedLabel} selected`

  const header = collapsible ? (
    <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
      Photo reference
      <span className="ml-2 text-[12px] font-semibold text-ink-3">{statusText}</span>
    </summary>
  ) : (
    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-[13px] font-semibold text-ink">Photo reference</h3>
      <p className="text-[12px] font-semibold text-ink-3">{statusText}</p>
    </div>
  )

  const body = (
    <>
      <p className="mt-2 mb-2 max-w-[70ch] text-[13px] font-medium text-ink-2">
        One photograph to anchor the generation on. Her profile album and her chat photographs are
        one grid here, newest first and unlabelled &mdash; tap a photo to choose it, tap it again
        for no reference.
      </p>

      {view.missing && (
        /*
         * The saved reference is not on THIS page. Two causes, both real and indistinguishable
         * from here: the row was deleted (`/admin/photos` can remove a chat photograph and the
         * album manager can delete an album row), or it is simply on a different page — the picker
         * now reaches every photograph, so nothing is ever permanently out of reach any more, only
         * a `Previous`/`Next` tap away. Nothing is drawn as selected, and `onChange` is deliberately
         * NOT called — see the file's Decisions entry: self-healing in an effect would mark the
         * operator's draft dirty on mount.
         */
        <p className="mb-2 max-w-[70ch] text-[13px] font-medium text-ink-2">
          The saved reference is not on this page &mdash; it was deleted, or it is on a different
          page. Choose another photo, page through to find it, or clear it.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No photos to choose from"
          description="Her profile album and her chat photographs are both empty. Add a photo to her album or let her generate one, and it will appear here."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-field lg:overflow-x-auto">
            <ul className="grid grid-cols-3 gap-[3px] sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))] lg:grid-cols-[repeat(33,minmax(92px,1fr))]">
              {view.tiles.map((tile) => (
                <li key={tile.key} className="relative aspect-square bg-ink-3/20">
                  <button
                    type="button"
                    onClick={() => onChange(nextPhotoReferenceValue(value, tile.key))}
                    aria-pressed={tile.selected}
                    aria-label={tile.label}
                    className="block size-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted,
                     * deliberately un-transformed, and the chat half of this union has no thumbnail
                     * column at all; see the header. */}
                    <img
                      src={tile.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className={cn(
                        'size-full object-cover transition-transform',
                        tile.selected && 'scale-[0.9]',
                      )}
                    />
                    {tile.selected && (
                      /*
                       * `bg-ink text-card` and not `bg-accent`: `components/ui/Button.tsx:46-54`
                       * measured white type on the cyan accent at near 2:1, well under WCAG's 4.5:1,
                       * where ink-on-card is ~14:1 and inverts correctly in dark mode. The badge
                       * carries a glyph, so it is type. `aria-hidden` because `aria-pressed` on the
                       * button is already the announced state.
                       */
                      <span
                        aria-hidden="true"
                        className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-pill bg-ink text-[11px] font-bold text-card"
                      >
                        &#10003;
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-ink-3 tabular-nums sm:text-[12px]">
              {selectedId !== '' && <>selected #{selectedId} &middot; </>}
              Showing {items.length} of {total} &middot; page {page} of {pageCount}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {page > 1 && (
                <ButtonLink href={`?page=${page - 1}`} scroll={false} size="md" variant="secondary">
                  Previous
                </ButtonLink>
              )}
              {page < pageCount && (
                <ButtonLink href={`?page=${page + 1}`} scroll={false} size="md" variant="secondary">
                  Next
                </ButtonLink>
              )}
              {fullViewHref !== null && (
                <ButtonLink
                  href={fullViewHref}
                  size="md"
                  variant="secondary"
                  aria-label="Lihat foto referensi ukuran penuh"
                >
                  <Maximize2Icon className="size-4" />
                </ButtonLink>
              )}
              {value !== PHOTO_REFERENCE_NONE && (
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() => onChange(PHOTO_REFERENCE_NONE)}
                >
                  Clear reference
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )

  return collapsible ? (
    <details ref={setSectionRef} className="mb-6">
      {preloadLinks}
      {header}
      {body}
    </details>
  ) : (
    <section ref={setSectionRef} className="mb-6">
      {preloadLinks}
      {header}
      {body}
    </section>
  )
}
