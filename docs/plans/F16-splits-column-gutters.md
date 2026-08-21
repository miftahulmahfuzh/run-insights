# F16 — Splits: the columns that had no gutters

Card: [#2 — Splits section: PACE, HR, CAD jumbled values](https://github.com/miftahulmahfuzh/run-insights/issues/2)
Date: 2026-08-21

## The bug, as reported

On the run detail page's Splits section, the PACE, HR and CAD values run together into one
unreadable string. Km 1 of the canonical run renders as:

```
6'36"154154
```

That is a pace of `6'36"`, a heart rate of `154` and a cadence of `154` with nothing between them.
The header row does the same thing — `PACE HR CAD` reads as one word. A second, quieter symptom sits
in the partial row: `0.67 km` breaks across two lines, `0.67` above `km`.

## Why it happens

`components/ui/SplitsTable.tsx` gives the pace-bar cell `w-full`:

```tsx
<td className="w-full py-2 pr-3 pl-2 align-middle">
```

Under `table-auto`, `w-full` on one cell hands **all** of the table's slack to that cell, so every
sibling cell collapses to exactly its content width. The three numeric cells carry only vertical
padding (`py-2`) — no horizontal gutter of any kind — so once the bar has eaten the slack there is
nothing left to separate `6'36"` from `154` from `154`. They are not overlapping or mis-ordered;
they are three correct values with zero space between them.

The same starvation squeezes the KM column, which is why `0.67 km` wraps: the cell is exactly as
wide as `11*` needs, and the longer label underneath has to break to fit.

This explains why the bug is unique to this table. `components/ui/ZoneBar.tsx` uses the identical
zero-gutter idiom — right-aligned cells with only `py-*` — but has no `w-full` cell, so auto-layout
distributes its slack across all four columns and the gaps appear by accident. The idiom was never
safe; it was only ever unexercised.

## The fix

**Give the numeric columns their own gutters.** Each of PACE, HR and CAD gets `pl-3` (12px) on both
its `<th>` and its `<td>`, so the header stays registered over the column it names and separates by
the same rule the values do. The bar cell's `pr-3` comes off — the pace column's own `pl-3` is now
that gap, and keeping both would double-inset the bar. CAD keeps its `pr-1` edge inset.

Values stay right-aligned, so with the table's existing `tabular-nums` the digits still line up down
each column: a two-digit HR sits under a three-digit one with its units place aligned.

**Stop the partial label wrapping.** `whitespace-nowrap` on the `0.67 km` span. It is about 38px at
10px type and the KM column can afford it.

### Width budget at 390px

Card padding takes 40px, leaving 350px:

| | width |
|---|---|
| KM | ~24 |
| PACE | 12 gutter + 40 |
| HR | 12 gutter + 26 |
| CAD | 12 gutter + 26 + 4 |
| **text and gutters** | **~156** |
| **left for the bar** | **~194** |

The bar keeps enough length to read as a bar, which matters: R-30 makes its *length* the pace
signal, so starving it to buy gutters would trade one bug for another.

### Fixed widths, considered and rejected

Giving PACE/HR/CAD explicit widths would form a true grid regardless of content and survive an
unusual value (a `10'00"` pace, a four-digit cadence). It was rejected because it hardcodes pixel
sizes that then have to be maintained against the font size, and right-alignment plus `tabular-nums`
already delivers the column alignment that fixed widths would buy.

### Merging HR and CAD, considered and rejected

Collapsing the two into `154 · 154` would cut a column and free phone width, but it destroys the
per-column header mapping a screen reader uses. This table is explicitly the pace/HR chart's
accessible twin — that mapping is the reason the component exists.

## Scope

Both call sites pick the fix up unchanged:

- `app/r/[id]/page.tsx:265` — the run detail page, where the bug was reported.
- `app/(public)/s/[token]/page.tsx:214` — the public share page. Worth stating plainly: the same
  starved columns were being served to anyone handed a share link.

**Deliberately out of scope.** `components/review/SplitsTable.tsx` and `components/ui/ZoneBar.tsx`
share the zero-gutter idiom but have no `w-full` cell, so their slack spreads and they read correctly
today. Changing them would be churn against markup that is not broken.

## Verification

**Two tests** in `tests/views.render.test.ts`, inside the existing `SplitsTable` describe that
already renders the canonical fixture to static markup.

The first is **structural**. Km 1 is the ideal row: its HR and cadence are **both 154**, so any
collapse into a single cell reproduces the exact `154154` from the bug report. It finds km 1's row,
splits it into cells, and asserts that the cell holding `6'36"` does not also hold `154`, and that
exactly two cells contain a bare `154`. It names no Tailwind class.

The second asserts the **gutter itself** — that each of the three right-aligned cells carries `pl-3`.

**Why both, and why the second one names a class.** The plan originally called for the structural
test alone, on the reasoning that a class assertion only catches a literal revert. Writing it
disproved that reasoning: run against the unfixed component, the structural test **passes**. Pace,
HR and cadence were *always* separate `<td>`s — the markup was never wrong. `6'36"154154` and the
corrected table produce byte-identical element structure, differing only in a class attribute. So
in a test tier that renders to a string and cannot measure layout, the padding is the only
observable that separates fixed from broken, and asserting it is the only way CI sees this bug at
all.

The trade is accepted knowingly: a restyle that keeps the columns readable by other means would
fail this test and need updating. That is a smaller cost than the alternative, which was a suite
that reported green on the exact defect a user had already reported.

The two tests guard different things and both are worth keeping — the structural one against a
future merge of the columns, the gutter one against this bug returning.

**The wrap fix is confirmed by eye, not by assertion.** `whitespace-nowrap` prevents a line break
that static markup cannot report either way, and unlike the gutter it has no second failure mode
worth pinning a class assertion to.

**The visual pass** is the real check, because layout is the real bug: run the app, open a run detail
page at phone width, and read the Splits section. Then `npm run test`, `npm run lint`,
`npm run typecheck`.

## A note left in the component

The header comment gains a paragraph recording the mechanism: `w-full` on the bar cell starves every
sibling column, so the numeric columns need their own gutters and cannot rely on table slack.
Without that note the padding reads as redundant and the next person removes it.
