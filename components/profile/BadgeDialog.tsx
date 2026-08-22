'use client'

import { DetailPanel, type PanelArt } from '@/components/ui/DetailPanel'
import { cn } from '@/lib/cn'
import { BADGE_ART, BADGE_ART_HEIGHT, BADGE_ART_WIDTH } from '@/lib/badges/badge-art'
import type { ShelfEntry } from '@/lib/badges/shelf'

/**
 * One badge, big — the panel a tap on a shelf row opens.
 *
 * ── THIS FILE IS NOW A BODY, NOT A DIALOG (F24) ─────────────────────────────────────────────
 * The dialog element, the art band, the scrolling body and the footer moved wholesale to
 * `components/ui/DetailPanel.tsx`, comments included, so that #25's personal-record panel is a
 * different body in the same chrome rather than a second copy of it. Everything this file used to
 * argue about `<dialog>` versus `Sheet`, the `::backdrop` in `app/globals.css`, the focus call
 * after `showModal()` and the backdrop-click test now lives there and is unchanged. What is left
 * here is what is specific to a badge: which art to hang in the band, and what the panel says.
 *
 * ── WHAT THE PANEL SAYS THAT THE ROW DOES NOT — AND WHAT IT NO LONGER SAYS AT ALL ───────────
 * The row is a reference table: title, condition, gloss, date. The panel adds the two things a
 * table has no room for — the art at a size where the embroidery is legible, and the **count**
 * spelled out in words rather than compressed into a trailing "· earned 3 times". Everything else
 * is the same strings, deliberately: a panel that reworded the condition would be R-42's second
 * source of truth for a threshold, one layer further from the catalog.
 *
 * F23 made that subtractive as well as additive: the panel now adds those two things and **drops
 * the date entirely**, at every count. The count in words is the whole of what it says about
 * earning. The row keeps the date, so between the two surfaces each number is still said exactly
 * once — which is the same rule that took "· most recent of 3" off the row.
 *
 * F24 did not put a date back, and that was a decision rather than an omission. Card #23's
 * acceptance list reads as though this panel still printed one, because it was written before F23
 * emptied it; re-adding a line here for the length of one card would reverse a two-card-old
 * decision that #26 — whose whole subject is where the earned dates live — restructures
 * immediately. The link primitive that criterion needs (`components/ui/RunDateLink.tsx`) ships
 * with F24 and has both of its branches under test; #26 is what gives it its first caller here.
 */
export function BadgeDialog({ entry, onClose }: { entry: ShelfEntry | null; onClose: () => void }) {
  return (
    <DetailPanel open={entry !== null} art={entry && badgeArt(entry)} onClose={onClose}>
      {(titleId) => entry && <Body entry={entry} titleId={titleId} />}
    </DetailPanel>
  )
}

/**
 * `art.twill` is still handed over even though the 4:3 art fills the band exactly: it is the colour
 * behind a slow decode, so the panel shows cloth rather than card while the WebP arrives.
 */
function badgeArt(entry: ShelfEntry): PanelArt {
  const art = BADGE_ART[entry.key]
  return {
    src: art.src,
    twill: art.twill,
    width: BADGE_ART_WIDTH,
    height: BADGE_ART_HEIGHT,
    dimmed: entry.earned === null,
  }
}

function Body({ entry, titleId }: { entry: ShelfEntry; titleId: string }) {
  const earned = entry.earned

  return (
    <>
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

      {/* NO DATE HERE, AT EITHER COUNT (F23). This is where `×3 · first … · latest …` used to
          print, on the argument that F13's ledger made the first earning a fact rather than an
          inference and both ends of the span were therefore worth naming. The ledger is
          untouched and that is still true — this panel is simply no longer where it is read.
          The single-earn branch printed `Earned <date>` and went with it: one date on the
          one-earn case would be the only date left in the surface, an inconsistency louder than
          the line it replaced. Card #26 is what gives every earned date a home.
          `earned.firstEarnedOn` consequently has no reader on screen; it is kept for #26. */}

      {/* R-44: an invitation, not a nag — and only on the five badges where the number is real. */}
      {entry.progress && (
        <p className="mt-3 text-[12px] font-semibold text-ink-3 tabular-nums">
          {entry.progress.sentence}
        </p>
      )}
    </>
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
