# F23 — the badge copy says each number once, and the panel says no date at all

**Card:** [#22](https://github.com/miftahulmahfuzh/run-insights/issues/22) · round 1
**Base:** `origin/main` at `e6f6353`

Part 1 of 5 of the "Personal records + badge panel" set — the trim. Ships alone, blocks
[#23](https://github.com/miftahulmahfuzh/run-insights/issues/23).

> **On the number.** `F22` was the highest plan on `origin/main` at branch time and no other
> remote branch existed, so this is `F23`. `docs/plans/` already carries **two** `F16`s, and
> F21's own header explains why: `F<N+1>` is not race-safe when two sessions branch off the
> same commit. The label was re-checked against `origin/main` immediately before the PR was
> opened rather than trusted from plan time.

---

## 1. What the user asked for

> **(2)** In the Badges section, remove "most recent of N". It is redundant — the small number at
> the bottom right of the badge thumbnail already says how many times the badge was earned.
>
> **(2a)** In the badge detail panel, remove the last line `×3 · first <date> · latest <date>`.
> Also reduce the spacing between the Close button and the bottom border of the modal, so it
> matches the distance between "Earned 3 times" and the top border of the modal. Make the modal
> more compact.

Both halves are the same complaint from two directions: **a number was being said twice, and the
second saying was the weaker one.** The shelf row spelled out "most recent of 3" while the `×3`
pill sat 4 px to its left. The panel printed `×3` a second time, next to two dates, in the one
surface whose stated job is the picture and the count.

## 2. The shelf row: the pill is the only place the count appears

`components/profile/BadgeShelf.tsx`, `BadgeRow`. The earned line was:

```tsx
{formatDay(entry.earned.earnedOn)}
{entry.earned.count > 1 && ' · most recent of ' + entry.earned.count}
```

The suffix is gone; `formatDay(entry.earned.earnedOn)` stays and is now the whole line.

The comment above it argued *for* the suffix — that on a re-earned badge the pill "has already
said the number, so this says what the pill cannot: which of the earnings the date belongs to."
That is a real distinction and it is being overruled on purpose, so the comment is rewritten
rather than deleted. The user's point is that the disambiguation costs more than it buys: it
lengthens every re-earned row to spend eight words qualifying a date that only ever means the
latest one. `ShelfEntry.earned.earnedOn` is documented as the latest earning, so "latest" is the
only reading the date can have, and a row that says it out loud is explaining its own schema.

`formatDay` is still imported and still used here.

## 3. The panel: no date, and the count in words

`components/profile/BadgeDialog.tsx`, `Panel`. The whole `{earned && (<p className="mt-3 …">`
block is gone — **both branches**, which is the part worth stating twice:

- `count > 1` rendered `×{count} · first … · latest …`
- `count === 1` rendered `Earned {formatDay(earned.earnedOn)}`

The single-earn branch does not survive either. That is deliberate and it is the half a careless
reading of the card would keep: the panel's job after this change is the art, the rule, and the
count in words, and one date on the one-earn case would be the only date left in the surface —
an inconsistency more visible than the line it replaced. [#26](https://github.com/miftahulmahfuzh/run-insights/issues/26)
is what gives every earned date a home, including this one.

Consequences carried out rather than discovered later:

- **`formatDay` is no longer imported by this file.** The deleted block held its only call site;
  leaving the import would fail `lint`.
- `earned` stays as a local. It still drives `earnedLabel(earned.count)` above and the
  `!earned && 'opacity-50 grayscale'` on the art.
- The comment block above the deletion argued at length that both ends of the span should print,
  because "F13's ledger holds every award as its own row and the first one is now a fact rather
  than an inference." F13's ledger is untouched and that fact is still a fact — what changed is
  that this panel is no longer where it is read. The comment now says that, and points at #26.
- The file's `── WHAT THE PANEL SAYS THAT THE ROW DOES NOT ──` block claimed the panel adds *two*
  things the table has no room for: the art at a legible size, and the count spelled out. It now
  adds two things and subtracts one, and the block says so.

### `firstEarnedOn` stays

After this change nothing in the UI reads `earned.firstEarnedOn`. The field is kept in
`ShelfEntry` (`lib/badges/shelf.ts`), in `StoredBadge` (`lib/badges/types.ts`) and in the fold in
`lib/badges/facts.ts`, all untouched — #26 needs it, and removing it here to re-add it there
would churn five test files to no end. What is **not** kept is its doc comment, which said the
date is "equal at a count of one, and the panel says so rather than printing the same date twice."
No panel says anything of the sort any more. The comment now records that the field has no reader
on screen yet and names the card that gives it one.

## 4. The footer: symmetry, plus 4 px

Two tokens in the footer's class list:

| | Before | After |
|---|---|---|
| Footer interior gap, last text line → Close | `pt-4` | `pt-3` |
| Footer bottom pad, Close → panel edge | `pb-[calc(1.25rem+var(--safe-bottom))]` | `pb-[calc(1rem+var(--safe-bottom))]` |

The bottom pad is the card's actual ask, and the arithmetic is the card's own: the body opens
`px-5 pt-4`, so **1rem** is the gap above "Earned 3 times", and 1rem is therefore the gap that
belongs below Close. `--safe-bottom` still adds the home-indicator inset on top, which is why the
literal and not the whole value is what changes.
`components/ui/PhotoViewer.tsx` already ships `pb-[calc(1rem+var(--safe-bottom))]`, so the target
is precedented rather than invented.

The `1.25rem` this footer had was inherited from `components/ui/Sheet.tsx`, whose footer earns it:
`Sheet` pins a Save control above a keyboard and separates it with a `border-t`. This panel has
neither — it is read-only, it has no rule above the footer, and its footer holds one dismissal.
Divergence from `Sheet` here is the point, not drift.

`pt-3` is the second token and is the "make the modal more compact" half rather than the symmetry
half. It shrinks a gap the card never named, which is worth flagging: the 1rem/1rem symmetry the
card asks for is measured from the *body's* `pt-4` to the footer's `pb`, so tightening the
footer's interior does not disturb it. Deleting the dates line already removed ~28 px of panel
height on its own; this is 4 px more.

## 5. Tests

`tests/badges.render.test.ts`. Three edits, and **no assertion is deleted** — each one is
inverted, because "the copy is gone" is a claim worth holding onto in exactly the place that used
to claim the opposite.

**`BadgeShelf` › the earned line.** Renamed from "only mentions the count once it means something"
to "leaves the count to the pill", which is now what it tests:

```ts
expect(html).toContain('Thu, 20 Aug 2026')    // the row still dates the badge
expect(html).not.toContain('most recent of')  // was toContain('most recent of 3')
expect(html).toContain('×3')             // the pill still carries the count
expect(html).not.toContain('×1')
```

**`BadgeDialog`.** The `describe` was named *"the dates line (F13)"* — a line that no longer
exists — and is renamed to *"no dates, and the count in words"*. Both `it`s survive as inversions:

- *tourist* (3×): asserts `Earned 3 times`, then that **neither date reaches the panel**
  (`Sat, 4 Jul 2026`, `Thu, 20 Aug 2026`) and that the separator forms are gone (`' · first '`,
  `'· latest'`).
- *late_start* (1×): asserts `Earned once`, and that `Earned Thu` and the date itself are absent —
  the single-earn branch, tested rather than assumed.

The negatives are written against the **separator forms** (`' · first '`) rather than the bare
words. `'first'` is a substring of two badges' condition copy — `negative_split`'s "The second
half is faster than the first." and `hot_start`'s "The first kilometre is already in zone 4 or
above." — neither of which is rendered by this fixture today. The old test at line 166 asserted
bare `not.toContain('first')` and passed on that luck; the separator form does not depend on it.

**One new assertion** guards the spacing:

```ts
expect(html).toContain('pb-[calc(1rem+var(--safe-bottom))]')
```

It proves the token changed. It does **not** prove the two gaps *look* equal — that is §13's
read-it-at-414px check, and the card asks for an iPhone XS Max specifically. The assertion's
comment says so, so nobody later mistakes a green test for a verified layout.

## 6. Acceptance

- [ ] A badge earned 3× shows, in the shelf row: title, condition, gloss, the latest date, and no
      "most recent of 3". The patch still carries `×3`.
- [ ] The panel shows "Earned 3 times", title, condition, gloss, progress line, Close — and
      nothing else. No date anywhere in it, at either count.
- [ ] Top gap and bottom gap read equal on an iPhone XS Max.
- [ ] `npm run test`, `npm run lint`, `npm run typecheck` clean — and the full CI gate, which on
      this repo is 14 commands including seven bespoke guards.
