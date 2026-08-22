'use client'

import Image from 'next/image'
import { usePanelParam } from '@/components/ui/usePanelParam'
import { cn } from '@/lib/cn'
import { panelKeyFor } from '@/lib/panel/param'
import { formatDay } from '@/lib/format'
import { BADGE_ART, BADGE_ART_SMALL_SIZE } from '@/lib/badges/badge-art'
import type { BadgeKey } from '@/lib/badges/types'
import type { Shelf, ShelfEntry } from '@/lib/badges/shelf'
import { BadgeDialog } from './BadgeDialog'

/**
 * The `/me` badge shelf — all 22, in catalog order, earned in colour and locked in grey.
 *
 * ── A LIST, NOT THE DESIGN'S GRID, AND WHY ──────────────────────────────────────────────────
 * The v2 design draws `BadgeTile` as a grid of patches with a title and a condition line each. At
 * 414 px a four-across grid gives every tile ~90 px of width, and §10.2 requires the condition
 * *and* the gloss to be fully readable on a locked badge — two sentences do not fit in 90 px, and
 * truncating them is exactly the redaction §10.2 argues against. So the patch keeps its size and
 * its treatment and the tile is laid out as a row: patch left, words right. The shelf is a
 * reference table a runner reads once (§10.2's own framing), and a table is a list.
 *
 * ── THE PATCH IS THE ONE SATURATED OBJECT IN THE APP (R-36 / R-43) ──────────────────────────
 * `#46557a` is the design's own `BadgeTile` border, a literal here rather than a theme token on
 * purpose: the patch is dark navy *twill*, a material, and a material does not change colour when
 * the OS switches to dark mode. Everything around it is tokenised and follows the theme; the patch
 * does not. "The shelf stays quiet so the patches can be loud" is a layout instruction as much as
 * a palette one. The navy the design chose for its placeholder turned out to be the navy F10's
 * style block asked the model for — `#1d2436` against a generated `#1b2a44`-ish twill — so the
 * repaint is a substitution, not a reconciliation.
 *
 * ── F12: EVERY ROW IS A BUTTON, AND THE COPY GOT HALVED UNDER IT ────────────────────────────
 * Tapping a row opens `BadgeDialog` — the art at 4× and the earn count spelled out. The shelf did
 * not become a different thing to make room for it. The three absences §10.2 argues for all
 * survive the change and are strengthened by it: **no completion counter** beyond "earned / to
 * find", **no padlock or blur** on the locked rows, **no filter and no sort**. The panel states
 * the rule in the present tense and stops — no countdown, no "come back on 2 September", no link
 * to /upload. A shelf you walk over to and read is not a checklist; a list that comes and finds
 * you is one.
 *
 * The rows became `<button>`s wrapping the same markup rather than gaining an `onClick` on some
 * new kit primitive: exactly one caller in the app needs a tappable badge, and `components/ui` is
 * where a *second* caller would put it. Note the `<span className="block">`s inside — a `<button>`
 * takes phrasing content only, so the `<p>`s this row used to hold would have been invalid markup
 * the moment it gained a role.
 *
 * **This is now a client component, and it is the smallest unit that can be.** The `shelf` prop
 * crosses as the RSC payload either way; what would change by pushing the boundary down to a
 * per-row wrapper is one more module boundary for no behaviour. `buildShelf` still runs on the
 * server and this file still holds no query.
 *
 * ── F10 HAS LANDED, AND NOTHING ELSE ON THIS SCREEN CHANGED ─────────────────────────────────
 * This block used to say that when the art existed, F10 would "drop an `<Image>` inside
 * `<BadgePatch>` and nothing else on this screen changes." That is exactly what happened: the
 * layout, the row structure, the locked treatment and the copy are untouched, and `BadgePatch` now
 * draws `BADGE_ART[key].small` on `BADGE_ART[key].twill`. D12 still holds — the 22 patches were
 * generated offline by `.claude/skills/generate-badge` and committed; nothing here calls an image
 * API at request time, and `BADGE_ART` is a plain data module.
 */
export function BadgeShelf({ shelf }: { shelf: Shelf }) {
  /* The KEY, not the entry, and since F24 the key lives in the URL rather than in `useState`.
     `shelf` is replaced wholesale on every navigation to /me, and a held entry object would keep a
     panel open against data the page no longer shows. A key resolves against whatever the current
     shelf is, or resolves to nothing and closes — which is also what makes `?panel=badge.nonsense`
     harmless, since a hand-typed URL is the one input that can name a badge that does not exist.

     What the URL buys is the back gesture: opening a panel pushes a history entry, so a swipe from
     the phone's left edge closes the panel and stays on /me, and coming back from a run restores
     it. See `components/ui/usePanelParam.ts` for why that is `pushState` and not `router.push`. */
  const { selection, open, close } = usePanelParam()
  const openKey = panelKeyFor(selection, 'badge')
  const selected = shelf.entries.find((entry) => entry.key === openKey) ?? null

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-2">{shelf.earnedCount} earned</span>
        <span className="text-[13px] font-medium text-ink-3">{shelf.lockedCount} to find</span>
      </div>

      <ul className="flex flex-col gap-5">
        {shelf.entries.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              onClick={() => open({ kind: 'badge', key: entry.key })}
              /* The row's own text is already a full description, so the label adds only the two
                 things the visual row encodes rather than states: whether the patch is earned, and
                 that the row opens something. */
              aria-label={`${entry.title} — ${ariaState(entry)}. Show the badge.`}
              className="w-full rounded-field text-left active:opacity-70"
            >
              <BadgeRow entry={entry} />
            </button>
          </li>
        ))}
      </ul>

      {/* One dialog for twenty-two rows, driven by the selection — not one per row. */}
      <BadgeDialog entry={selected} onClose={close} />
    </div>
  )
}

function ariaState(entry: ShelfEntry): string {
  if (!entry.earned) return 'not yet earned'
  return entry.earned.count === 1 ? 'earned once' : `earned ${entry.earned.count} times`
}

function BadgeRow({ entry }: { entry: ShelfEntry }) {
  const earned = entry.earned != null
  return (
    <div className="flex items-start gap-4">
      <BadgePatch badgeKey={entry.key} earned={earned} count={entry.earned?.count ?? 0} />

      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[15px] font-semibold',
            // A locked title stays legible — this is a reference table, not a teaser. The colour
            // step alone carries "not yet".
            earned ? 'text-ink' : 'text-ink-2',
          )}
        >
          {entry.title}
        </span>
        <span className="mt-0.5 block text-[12px] font-medium text-ink-2">{entry.condition}</span>
        <span className="mt-1 block text-[12px] font-medium text-ink-3">{entry.gloss}</span>

        {/* The date alone — the pill on the patch is the only place the count appears. This line
            used to append "· most recent of 3" on a re-earned badge, on the argument that the pill
            gives the number but not which earning the date belongs to. True, and overruled in F23:
            `earnedOn` is the latest earning by definition, so "latest" is the only reading the date
            has, and eight words spent qualifying it are a row explaining its own schema. */}
        {entry.earned && (
          <span className="mt-1.5 block text-[11px] font-semibold text-accent">
            {formatDay(entry.earned.earnedOn)}
          </span>
        )}

        {/* R-44: an invitation, not a nag — and only where the number is real. */}
        {entry.progress && (
          <span className="mt-1.5 block text-[11px] font-semibold text-ink-3">
            {entry.progress.sentence}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The patch itself: F10's embroidered art at 56 px, on the twill that art was sampled from.
 *
 * ── WHY THE BACKGROUND IS `art.twill` AND NOT A TOKEN ───────────────────────────────────────
 * The master is a square of navy cloth with the patch sewn onto it, full bleed (F10 style block).
 * Drawn inside a `rounded-field` box, its own corners get clipped — so the box is painted with the
 * exact twill `make_badge_assets.py` sampled from that master's outer frame, and the join is
 * invisible. Per badge, not one shared constant: every master's cloth is separately generated and
 * `badges:check` recomputes the value from the master rather than trusting the manifest.
 *
 * R-36 / R-43 still hold and this is what they were describing: the patch is a *material*, so it
 * does not change colour when the OS switches to dark mode. Everything around it is tokenised.
 * "The shelf stays quiet so the patches can be loud."
 *
 * Locked patches are desaturated and dashed rather than hidden (§10.2). The dashed border is the
 * app's established vocabulary for "a different kind of thing, not something gone wrong" — the same
 * treatment `EmptyState` and the splits table's partial row use.
 *
 * ── F12: THE COUNT PILL ─────────────────────────────────────────────────────────────────────
 * A re-earned badge carries `×3` on the corner of its patch. It sits **outside** the patch's
 * `overflow-hidden` box, which is why the patch is wrapped: clipped to the twill it would lose
 * half of itself to the rounded corner. `bg-ink text-card` rather than the accent for the reason
 * `Button.tsx` gives at length — white on the cyan lands near 2:1, and ink-on-card is ~14:1 and
 * inverts correctly in dark mode. The `ring` in `--card` is what separates the pill from the navy
 * cloth it overlaps.
 *
 * Absent at a count of one, which is most of the shelf. A `×1` on every earned row would turn the
 * one genuinely interesting number on this screen into furniture.
 *
 * `unoptimized`: these are already 192² WebP sized for exactly this box, content-hashed, and served
 * `immutable` by `next.config.ts`. Routing them through the optimizer would re-encode an asset that
 * was encoded for this purpose and bill a transformation for it.
 */
function BadgePatch({
  badgeKey,
  earned,
  count,
}: {
  badgeKey: BadgeKey
  earned: boolean
  count: number
}) {
  const art = BADGE_ART[badgeKey]
  return (
    <div className="relative shrink-0" aria-hidden>
      <div
        className={cn(
          'h-14 w-14 overflow-hidden rounded-field border-2',
          earned
            ? 'border-solid border-[#46557a]'
            : 'border-dashed border-[#46557a] opacity-40 grayscale',
        )}
        style={{ backgroundColor: art.twill }}
      >
        <Image
          // Empty alt, inside an aria-hidden box: the badge's title, its condition, its earned date
          // and its count are all rendered as real text in the row beside this. A screen reader
          // announcing the picture too would read every badge twice.
          src={art.small}
          alt=""
          width={BADGE_ART_SMALL_SIZE}
          height={BADGE_ART_SMALL_SIZE}
          className="h-full w-full object-cover"
          unoptimized
          // Twenty-two of these on one screen. Only the first few are above the fold, and the
          // browser's own lazy default is the right call for the rest.
          loading="lazy"
        />
      </div>

      {count > 1 && (
        <span className="absolute -right-1.5 -bottom-1.5 rounded-pill bg-ink px-1.5 py-px text-[10px] font-bold text-card tabular-nums ring-2 ring-card">
          ×{count}
        </span>
      )}
    </div>
  )
}
