'use client'

import { DetailPanel, type PanelArt } from '@/components/ui/DetailPanel'
import { RunDateLink } from '@/components/ui/RunDateLink'
import { RECORD_ART, RECORD_ART_HEIGHT, RECORD_ART_WIDTH } from '@/lib/records/record-art'
import { formatRecordValue, RECORD_LABELS } from '@/lib/records/labels'
import type { RecordRowView } from './RecordsTable'

/**
 * One personal record, big — the panel a tap on a record row opens. F26, card #25.
 *
 * ── THIS FILE IS A BODY, NOT A DIALOG ───────────────────────────────────────────────────────
 * The dialog element, the art band, the scrolling body and the footer are F24's
 * `components/ui/DetailPanel.tsx`, and this is the second of the two bodies that shell was split
 * out for — `BadgeDialog` is the first. Everything about `<dialog>` versus `Sheet`, the
 * `::backdrop` in `app/globals.css`, the focus call after `showModal()` and the backdrop-click
 * test lives there. What is here is what is specific to a record: which art hangs in the band, and
 * what the panel says.
 *
 * ── WHAT THE PANEL SAYS THAT THE ROW NO LONGER CAN ──────────────────────────────────────────
 * The row is now one line: a label and a number. The two things it gave up to become one line are
 * the two things this panel exists for — the **date** the record was set, and the value it beat.
 * Neither is deleted by #25; both are moved here, which is why the trim costs nothing. The date
 * arrives as a link (F24's `RunDateLink`), so the navigation the row used to be *is* the panel's
 * date rather than a capability the section lost.
 *
 * ── EVERY PANEL HAS THE SAME FOUR LINES (ROUND 2) ───────────────────────────────────────────
 * Eyebrow, title, value, date, and a fourth line about the value this one displaced. That last one
 * is the only one with two branches and it always renders one of them, which is the round-2 fix:
 * with nine records carrying "Beat … to get here" and the tenth carrying nothing, the tenth read as
 * broken rather than as unbeaten. A uniform slot is what makes the data legible — see the branch
 * itself for why the empty case says "recorded" and not "first".
 *
 * ── THE COPY IS THE CATALOG'S, VERBATIM ─────────────────────────────────────────────────────
 * `RECORD_LABELS[key]` and `formatRecordValue` — the same two functions the row calls, not a
 * panel-sized rewording of them. `lib/records/labels.ts` prints the qualifier *inside* the label
 * ("Fastest pace, 10 km+") specifically so a caller that renders only `label` cannot drop it, and
 * `catalog.ts` requires the copy never to read "your 10k PB". A panel that reworded either would be
 * R-42's second source of truth for a threshold, one layer further from the catalog. R-23 holds the
 * same way: every number goes through `lib/format.ts`, so `/me` and the share page cannot disagree
 * about what `10.67 km` looks like.
 *
 * ── NO DIM STATE, AND NO TEXT BRANCH ON THE DATE ────────────────────────────────────────────
 * `PanelArt.dimmed` exists for a locked badge and is never set here, and `RunDateLink`'s null-`runId`
 * branch is unreachable from this file. Both for one schema reason rather than optimism:
 * `records.run_id` is `NOT NULL` and `ON DELETE CASCADE` (`lib/db/schema.ts`), so a record is always
 * held by a run that still exists — deleting the run deletes the record rather than orphaning it.
 * That is the asymmetry with badges, where `badges.run_id` is `ON DELETE SET NULL` (R-22) precisely
 * so an award survives its run, and where the text branch is therefore the ordinary case for every
 * period badge.
 */
export function RecordDialog({ row, onClose }: { row: RecordRowView | null; onClose: () => void }) {
  return (
    <DetailPanel open={row !== null} art={row && recordArt(row)} onClose={onClose}>
      {(titleId) => row && <Body row={row} titleId={titleId} />}
    </DetailPanel>
  )
}

/**
 * `RECORD_ART_WIDTH`/`_HEIGHT`, never the badge deck's constants. The two decks are separately
 * generated at different master sizes — records are 1024×768 masters to 768×576 derivatives, badges
 * 1024² to 768×576 — which is exactly why `PanelArt` carries its own intrinsic pixels rather than
 * importing one deck's numbers into the shell. `art.twill` is still handed over even though the 4:3
 * art fills the band exactly: it is the colour behind a slow decode, so the panel shows cloth rather
 * than card while the WebP arrives. Per record, not one shared constant — the raking light makes
 * every master's own frame its own colour.
 */
function recordArt(row: RecordRowView): PanelArt {
  const art = RECORD_ART[row.key]
  return {
    src: art.src,
    twill: art.twill,
    width: RECORD_ART_WIDTH,
    height: RECORD_ART_HEIGHT,
  }
}

function Body({ row, titleId }: { row: RecordRowView; titleId: string }) {
  return (
    <>
      {/* Where the badge panel puts "Earned N times", and deliberately NOT a control. F27 made even
          "Earned once" an expander, but its argument was consistency with the counts that have a
          list behind them — a record has exactly one holder and one date, so there is nothing to
          disclose and no sibling to be consistent with. The line still earns its place: it is what
          makes the `<h2>` below read as the name of a record rather than as the title of the panel.
          Same type, weight and tracking as the badge panel's first line, so the two panels open the
          same way. */}
      <p className="text-[11px] font-semibold tracking-[0.02em] text-ink-3">Personal record</p>

      <h2 id={titleId} className="mt-1 text-[19px] font-semibold text-ink">
        {RECORD_LABELS[row.key]}
      </h2>

      {/* The number the row also shows, at the size the row cannot give it. `tabular-nums` for the
          same reason every other figure in the app has it: the digits are the content. */}
      <p className="mt-2 text-[28px] font-semibold text-ink tabular-nums">
        {formatRecordValue(row.key, row.value)}
      </p>

      {/* (1b), the record half: the navigation that used to be the whole row is now this date. */}
      <p className="mt-2">
        <RunDateLink
          day={row.achievedOn}
          runId={row.runId}
          className="text-[13px] font-semibold text-accent tabular-nums"
        />
      </p>

      {/* `previousValue` AS A SENTENCE, WHICH IS WHY IT LEFT THE ROW. `RecordsTable` has said since
          F06 that this field is kept "specifically so a shelf can say 'beat 7'30\" to get here'" —
          this is that sentence, and the compressed `· was 10.67 km` the card asked to delete was the
          same fact with no room to be one. "Beat" needs no direction check: beating a `max` key is
          further, beating a `min` key is faster, and the word is right for both.

          ── ROUND 2: THE LINE IS ALWAYS HERE, BECAUSE ITS ABSENCE READ AS A BUG ──────────────────
          Round 1 printed nothing when `previousValue` was null, on `RecordsTable`'s own convention
          for the field and on the narrowest reading of the card. Checked against prod, that put nine
          record panels with the line beside one without it, and the reporter's first reading of the
          tenth was "what happened?" — a missing line in an otherwise uniform stack is a defect
          report, not a silence. So both branches print, in the same slot, and the panel's shape no
          longer depends on the data.

          ── WHY NOT "THE FIRST ONE ON RECORD" ───────────────────────────────────────────────────
          Because null does not mean first. `recomputeRecords` writes `previousValue` only on a pass
          where the key CHANGED HANDS: a key whose first holder was never beaten keeps the null it
          was born with, which is the honest case — but `records.run_id` is `ON DELETE CASCADE`, so
          deleting the holding run takes the row and its history with it, and the next recompute sees
          no `held` and writes null again for a key that demonstrably had a predecessor. A panel
          claiming "the first one" would be stating something false in exactly that case.

          "Recorded" is what carries the honesty, and it is the device this app already uses for it:
          `EarnedDayList` says "2 earlier, dates not recorded" rather than inventing days to make two
          numbers agree. Same shape of statement, same register. It is also the only wording that
          does not contradict the runner's own screen — they can see they have other runs, so a line
          reading "nothing to beat" would be answered by the shelf directly above it. This line is
          about the RECORD's history, not about the run set.

          Quieter than its sibling on purpose: `text-ink-3` where the "Beat …" branch is `text-ink-2`,
          because the slot is uniform but the two lines do not carry the same amount. The same step
          `EarnedDayList` puts between a real day and its own not-recorded line. */}
      {row.previousValue != null ? (
        <p className="mt-3 text-[13px] font-medium text-ink-2">
          Beat {formatRecordValue(row.key, row.previousValue)} to get here.
        </p>
      ) : (
        <p className="mt-3 text-[13px] font-medium text-ink-3">No earlier value recorded.</p>
      )}
    </>
  )
}
