import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/format'
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
 * `#1d2436` navy with a `#46557a` border and a `#93a5d4` label are the design's own `BadgeTile`
 * values, and they are literals here rather than theme tokens on purpose: the patch is dark navy
 * *twill*, a material, and a material does not change colour when the OS switches to dark mode.
 * Everything around it is tokenised and follows the theme; the patch does not. "The shelf stays
 * quiet so the patches can be loud" is a layout instruction as much as a palette one.
 *
 * ── F10'S SLOT ──────────────────────────────────────────────────────────────────────────────
 * D12 forbids runtime image generation, and F10 has not generated the 22 patches yet, so the patch
 * renders as the navy placeholder the design shipped — which R-36 records as the *intended* final
 * treatment, not a stand-in to be re-themed. When `public/badges/<key>.png` exists, F10 drops an
 * `<Image>` inside `<BadgePatch>` and nothing else on this screen changes. Rendering a broken
 * `<img>` in the meantime would be worse than rendering the placeholder honestly.
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
      <BadgePatch title={entry.title} earned={earned} />

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
 * The patch itself: a 56 px navy square with a merrowed-looking border, holding the badge's initials
 * until F10's art lands.
 *
 * Locked patches are desaturated and dashed rather than hidden (§10.2). The dashed border is the
 * app's established vocabulary for "a different kind of thing, not something gone wrong" — the same
 * treatment `EmptyState` and the splits table's partial row use.
 */
function BadgePatch({ title, earned }: { title: string; earned: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'grid h-14 w-14 shrink-0 place-items-center rounded-field border-2 text-center',
        'bg-[#1d2436] text-[10px] leading-tight font-bold tracking-[0.04em] text-[#93a5d4]',
        earned
          ? 'border-solid border-[#46557a]'
          : 'border-dashed border-[#46557a] opacity-40 grayscale',
      )}
    >
      {initialsOf(title)}
    </div>
  )
}

/**
 * Two letters from the title, as a stand-in for art that does not exist yet. Deliberately not the
 * badge key: `fast_start_fool` truncated to eight characters reads as a variable name, and a shelf
 * of variable names looks like a bug rather than a placeholder.
 */
function initialsOf(title: string): string {
  const letters = title
    .split(/[\s?-]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
  return letters.slice(0, 2).join('')
}
