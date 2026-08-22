'use client'

import * as React from 'react'

import { DetailPanel, type PanelArt } from '@/components/ui/DetailPanel'
import { RunDateLink } from '@/components/ui/RunDateLink'
import { cn } from '@/lib/cn'
import { BADGE_ART, BADGE_ART_HEIGHT, BADGE_ART_WIDTH } from '@/lib/badges/badge-art'
import type { ShelfEntry } from '@/lib/badges/shelf'

/**
 * One badge, big — the panel a tap on a shelf row opens.
 *
 * ── THIS FILE IS A BODY, NOT A DIALOG (F24) ─────────────────────────────────────────────────
 * The dialog element, the art band, the scrolling body and the footer moved wholesale to
 * `components/ui/DetailPanel.tsx`, comments included, so that #25's personal-record panel is a
 * different body in the same chrome rather than a second copy of it. Everything this file used to
 * argue about `<dialog>` versus `Sheet`, the `::backdrop` in `app/globals.css`, the focus call
 * after `showModal()` and the backdrop-click test now lives there and is unchanged. What is left
 * here is what is specific to a badge: which art to hang in the band, and what the panel says.
 *
 * ── WHAT THE PANEL SAYS THAT THE ROW DOES NOT ───────────────────────────────────────────────
 * The row is a reference table: title, condition, gloss, date. The panel adds the two things a
 * table has no room for — the art at a size where the embroidery is legible, and the **count**
 * spelled out in words rather than compressed into a trailing "· earned 3 times". Everything else
 * is the same strings, deliberately: a panel that reworded the condition would be R-42's second
 * source of truth for a threshold, one layer further from the catalog.
 *
 * ── F27: THE COUNT IS NOW A DISCLOSURE CONTROL, AND THE DATES LIVE UNDER IT ──────────────────
 * F23 emptied this panel of dates and this file's comment then argued for that absence: `×3 · first
 * … · latest …` was a *summary of a span the panel could not show*, and two dates spent on it were
 * two numbers said twice. That reasoning is not reversed here — it is completed. The fix for a bad
 * summary is not a better summary; it is the thing itself. "Earned 3 times" is the expander, and
 * expanded it lists all three days, newest first, each one a link to the run that earned it.
 *
 * Which means `firstEarnedOn` still has no reader in this file. The earliest day is the *last row*
 * of the list — a member of `earnedDays`, not a named field — and that is the point: the panel no
 * longer names the ends of a span, it shows the span.
 *
 * ── THE COUNT AND THE NUMBER OF DATES CAN DISAGREE, AND THE PANEL SAYS SO ────────────────────
 * `StoredBadge.count` sums the `count` column, because a row predating F13 carries the aggregate it
 * had then rather than one earn (`lib/db/schema.ts`), and discarding it would take history off the
 * user's shelf. So a single pre-F13 row folding to 5 has **one** day to list. The list shows the
 * days on record and then says, in words, how many earnings have no date — because the one thing
 * this panel must not do is invent four days that were never written down.
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
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()

  return (
    <>
      {earned ? (
        <EarnedDatesTrigger
          count={earned.count}
          open={open}
          listId={listId}
          onToggle={() => setOpen((wasOpen) => !wasOpen)}
        />
      ) : (
        <p className="text-[11px] font-semibold tracking-[0.02em] text-ink-3">Not yet earned</p>
      )}

      <h2 id={titleId} className="mt-1 text-[19px] font-semibold text-ink">
        {entry.title}
      </h2>

      <p className="mt-2 text-[13px] font-medium text-ink-2">{entry.condition}</p>
      <p className="mt-1.5 text-[13px] font-medium text-ink-3">{entry.gloss}</p>

      {/* THE LIST GOES LAST, AND THE TRIGGER STAYS FIRST. Not adjacency for its own sake — measured.
          Rendered directly under its own button, a twelve-earning list fills the whole scroll
          container and pushes the `<h2>` off the bottom of it: the panel's accessible name, and the
          only thing on screen that says WHICH badge these dates belong to, scrolls out of view the
          instant a runner asks for them. Below the gloss, expanding pushes nothing away — the dates
          simply extend the panel downward, which is what the scroll container is for.

          `aria-controls` is what carries the association across the three lines in between, which is
          precisely the attribute's job, and the list is still AFTER the button in DOM order so Tab
          from the trigger lands on the first date. The three lines are not filler either: they are
          the badge's identity and its rule — the subject the dates are about. */}
      {earned && open && (
        <EarnedDayList id={listId} earnedDays={earned.earnedDays} count={earned.count} />
      )}

      {/* R-44: an invitation, not a nag — and only on the five badges where the number is real.
          Never on the same panel as the list above: `readProgress` runs for LOCKED badges only. */}
      {entry.progress && (
        <p className="mt-3 text-[12px] font-semibold text-ink-3 tabular-nums">
          {entry.progress.sentence}
        </p>
      )}
    </>
  )
}

/**
 * "Earned N times", and every one of those N days under it — F27, card #26.
 *
 * ── A `<button>`, NOT `<details>`/`<summary>` ───────────────────────────────────────────────
 * `<summary>` would supply `aria-expanded` for free and then charge it back: its marker has to be
 * suppressed per engine, it is not a `<button>` so the app's `active:opacity-70` press treatment
 * does not apply, and its open state is DOM state this component would then be reconciling against
 * React state — the same imperative/declarative seam `DetailPanel` needs a whole effect for. A
 * native `<button>` is a tab stop and fires on Enter and Space with no handler, which is the whole
 * of the keyboard requirement, and it is the idiom `BadgeShelf` already established one level up:
 * its 22 rows are `<button>`s wrapping their own markup rather than a kit primitive, because a
 * control with exactly one caller keeps its markup local.
 *
 * `aria-expanded` is the state and `aria-controls` names what it opens. The open flag and the id
 * both live in `Body` rather than here, because the list this opens renders three lines further
 * down — see `Body` for the measurement that put it there. Focus is not moved on expand and does
 * not need to be: the list is still *after* this button in DOM order, inside a `<dialog>` whose
 * focus trap is the UA's, so the next Tab reaches the first date. That ordering is also why F24
 * replaced `DetailPanel`'s `el.querySelector('button')` initial-focus call with a ref on Close —
 * its comment names this card, and this control is what it was anticipating.
 *
 * ── COLLAPSED IS THE STATE THE BACK GESTURE RETURNS TO, ON PURPOSE ───────────────────────────
 * The flag is `useState`, so tapping a date and swiping back re-mounts the panel with the list
 * shut.
 * That was decided rather than inherited. Keeping it open means putting it in the URL, because that
 * is the only state the back gesture can see (F24's whole argument), and there is no cheap way:
 * `lib/panel/param.ts` argues at length against a second parameter — "a registry a later card can
 * silently forget to join" — and a suffix on the existing value is ambiguous by construction, since
 * `decodePanelSelection` splits on the FIRST separator only and deliberately admits dotted keys. So
 * the price is a permanent widening of a codec two surfaces share, and the saving is one tap on a
 * control that sits on the panel's first line, directly under the thumb that just swiped back. A
 * re-entered panel re-establishing which badge it is before re-establishing a list is also simply
 * the better reading of the gesture. `docs/plans/F27-badge-earn-dates.md` §6 has the full costing.
 */
function EarnedDatesTrigger({
  count,
  open,
  listId,
  onToggle,
}: {
  count: number
  open: boolean
  /** The list this opens. It renders further down the body — see `Body` for why. */
  listId: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={listId}
      className={cn(
        'flex w-full items-center gap-1 text-[11px] font-semibold tracking-[0.02em] text-accent',
        /* `-my-1 py-1` grows the touch target past the 11px type without moving the line it sits
           on — padding out, margin back, net zero. The same trick `RunDateLink` uses on its link
           branch, and it is what keeps F23's arithmetic intact: the gap above this line is still
           the body's own `pt-4`, which is what the footer's `pb-[calc(1rem+…)]` was set to match.
           Measured at 390 px: the button's box starts 12 px below the band and its text 16 px, so
           the first line sits exactly where F23 left it. Full width rather than `inline-flex` so
           the whole line is the target on a phone. */
        '-my-1 py-1 active:opacity-70',
      )}
    >
      {earnedLabel(count)}
      <Chevron open={open} />
    </button>
  )
}

/**
 * The dates themselves — **exported, and stateless, so a test can reach it.**
 *
 * This repo has no jsdom and no testing library (`vitest.config.ts` runs node-env only), so a tap on
 * the expander above cannot be simulated and `renderToStaticMarkup` only ever renders the collapsed
 * half. F21 hit exactly this and set the precedent: `commitStatusLine` was JSX private to
 * `ReviewClient.tsx` and shipped a grammar bug into two screenshots and a README GIF because nothing
 * could render it. The fix was to move it somewhere reachable.
 *
 * So the split here is not decoration. `EarnedDates` owns the one thing that needs state — is it
 * open — and this owns everything that can be got wrong: the order, the two link branches, and the
 * count that does not match the list. `tests/badges.render.test.ts` renders it directly.
 */
export function EarnedDayList({
  id,
  earnedDays,
  count,
}: {
  id: string
  earnedDays: NonNullable<ShelfEntry['earned']>['earnedDays']
  /** The fold's count, which can exceed `earnedDays.length` — see the file header. */
  count: number
}) {
  /* Earnings with no day on record: a pre-F13 row's aggregate. Never negative — every value this
     application writes to the column is 1, so `count` is at worst equal to the number of days. */
  const undated = count - earnedDays.length

  return (
    /* A `<ul>` because it is a list of days: a stack of `<p>`s reads to a screen reader as prose
       with no count, and the count is the thing the runner tapped to see. The `id` is on the list
       rather than on a wrapper so `aria-controls` points at the thing that appears. */
    <ul id={id} className="mt-2 flex flex-col gap-1.5">
      {earnedDays.map((day, index) => (
        /* The index, and it is the honest key rather than the lazy one. `earnedOn` is not unique on
           its own — one key can be earned by two runs on one day — and neither is the
           `(earnedOn, runId)` pair, because `badges.run_id` is ON DELETE SET NULL (R-22), so two
           same-day awards whose runs were both deleted collide on `(day, null)`. Nothing exposed
           here would make a stable id: `dedupeKey` would be one, and `BadgeEarnedDay` deliberately
           does not carry it. The index is safe for the usual reason it is not — this list is
           derived data, sorted once, with no insert, no removal and no reorder between renders. */
        <li key={index}>
          <RunDateLink
            day={day.earnedOn}
            runId={day.runId}
            className="text-[12px] font-semibold text-ink-2 tabular-nums"
          />
        </li>
      ))}

      {/* NOT a date, and not tappable. See the file header: these earnings happened, and the app of
          the day recorded an aggregate rather than a ledger. That is a fact about the record, and
          the panel states it as one rather than fabricating days to make the two numbers agree. */}
      {undated > 0 && (
        <li className="text-[12px] font-medium text-ink-3 tabular-nums">
          {undated} earlier, {undated === 1 ? 'date' : 'dates'} not recorded
        </li>
      )}
    </ul>
  )
}

/**
 * The expander's only painted glyph: a chevron that points down when shut and up when open.
 *
 * Inline SVG rather than a text `▾`, which renders at a different weight and baseline in every font
 * fallback chain, and `aria-hidden` because `aria-expanded` on the button already says the state —
 * a screen reader that announced both would announce it twice. `currentColor` so it takes the
 * accent from the button and needs no palette entry of its own in either scheme.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={cn('h-3 w-3 shrink-0', open && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5 6 8l3-3.5" />
    </svg>
  )
}

/**
 * The count, spelled out.
 *
 * "Earned once" rather than "Earned ×1": a count of one is the ordinary case and a multiplier on it
 * reads as a scoreboard entry. Above one the multiplier is the honest form, because the number is
 * the point — and it is the one fact the shelf row cannot give the space to say plainly.
 *
 * F27 made both branches expanders, including "Earned once". That is the card's own ask and it is
 * the consistency F23 was protecting when it deleted the single-earn `Earned <date>` line: one date
 * printed inline while every other count hid its dates behind a control would be the same
 * inconsistency from the other side.
 */
function earnedLabel(count: number): string {
  return count === 1 ? 'Earned once' : `Earned ${count} times`
}
