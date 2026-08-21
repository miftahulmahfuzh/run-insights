import Image from 'next/image'
import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/format'
import { BADGE_ART, BADGE_ART_SMALL_SIZE } from '@/lib/badges/badge-art'
import type { BadgeKey } from '@/lib/badges/types'
import type { Shelf, ShelfEntry } from '@/lib/badges/shelf'

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
 * ── F10 HAS LANDED, AND NOTHING ELSE ON THIS SCREEN CHANGED ─────────────────────────────────
 * This block used to say that when the art existed, F10 would "drop an `<Image>` inside
 * `<BadgePatch>` and nothing else on this screen changes." That is exactly what happened: the
 * layout, the row structure, the locked treatment and the copy are untouched, and `BadgePatch` now
 * draws `BADGE_ART[key].small` on `BADGE_ART[key].twill`. D12 still holds — the 22 patches were
 * generated offline by `.claude/skills/generate-badge` and committed; nothing here calls an image
 * API at request time, and `BADGE_ART` is a plain data module.
 */
export function BadgeShelf({ shelf }: { shelf: Shelf }) {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-2">{shelf.earnedCount} earned</span>
        <span className="text-[13px] font-medium text-ink-3">{shelf.lockedCount} to find</span>
      </div>

      <ul className="flex flex-col gap-5">
        {shelf.entries.map((entry) => (
          <li key={entry.key}>
            <BadgeRow entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function BadgeRow({ entry }: { entry: ShelfEntry }) {
  const earned = entry.earned != null
  return (
    <div className="flex items-start gap-4">
      <BadgePatch badgeKey={entry.key} earned={earned} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[15px] font-semibold',
            // A locked title stays legible — this is a reference table, not a teaser. The colour
            // step alone carries "not yet".
            earned ? 'text-ink' : 'text-ink-2',
          )}
        >
          {entry.title}
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-ink-2">{entry.condition}</p>
        <p className="mt-1 text-[12px] font-medium text-ink-3">{entry.gloss}</p>

        {entry.earned && (
          <p className="mt-1.5 text-[11px] font-semibold text-accent">
            {formatDay(entry.earned.earnedOn)}
            {/* `count` only appears once it means something. "×1" on twenty rows is noise. */}
            {entry.earned.count > 1 && ` · earned ${entry.earned.count} times`}
          </p>
        )}

        {/* R-44: an invitation, not a nag — and only where the number is real. */}
        {entry.progress && (
          <p className="mt-1.5 text-[11px] font-semibold text-ink-3">{entry.progress.sentence}</p>
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
 * `unoptimized`: these are already 192² WebP sized for exactly this box, content-hashed, and served
 * `immutable` by `next.config.ts`. Routing them through the optimizer would re-encode an asset that
 * was encoded for this purpose and bill a transformation for it.
 */
function BadgePatch({ badgeKey, earned }: { badgeKey: BadgeKey; earned: boolean }) {
  const art = BADGE_ART[badgeKey]
  return (
    <div
      aria-hidden
      className={cn(
        'h-14 w-14 shrink-0 overflow-hidden rounded-field border-2',
        earned
          ? 'border-solid border-[#46557a]'
          : 'border-dashed border-[#46557a] opacity-40 grayscale',
      )}
      style={{ backgroundColor: art.twill }}
    >
      <Image
        // Empty alt, inside an aria-hidden box: the badge's title, its condition and its earned
        // date are all rendered as real text in the row beside this. A screen reader announcing
        // the picture too would read every badge twice.
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
  )
}
