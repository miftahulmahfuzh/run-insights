# F27 — "Earned N times" expands to every earn date, each one a link to its run

**Card:** [#26](https://github.com/miftahulmahfuzh/run-insights/issues/26) · round 1 · 2026-08-22
**Base:** `a190e83` (`origin/main` with F23's copy trim and F24's panel shell both landed)

Part 5 of 5 of the "Personal records + badge panel" set — the last one, and the one the other four
were clearing the way for. Depends on [#23](https://github.com/miftahulmahfuzh/run-insights/issues/23)
(the `RunDateLink` primitive and the panel shell) and
[#22](https://github.com/miftahulmahfuzh/run-insights/issues/22) (which deleted the
`×N · first … · latest …` line this replaces). Both are merged; this branches off the merge of the
second.

> **On the number.** `F24` is the highest plan on `origin/main`, and card #24 has already claimed
> `F25` on its own card body while running in parallel — so `F<N+1>` is exactly the collision F21's
> header warns about. `F27` follows the set's own observed convention, `F<card + 1>`: #22 → F23,
> #23 → F24, #24 → F25, so #25 → F26 and #26 → F27. Race-safe without coordination, because every
> card in the set derives its own number from its own id. Re-checked against `origin/main`
> immediately before the PR was opened rather than trusted from plan time.

---

## 1. What the user asked for

> **(2b)** I think we should be able to expand "Earned 3 times". Clicking it shows the list of all
> the dates we achieved this badge, and each date is clickable just like 1b.

One sentence, and it needs a data change before it needs a component change: **nothing carries the
individual dates past the fold today.** `lib/db/queries.ts` `getBadgeAwards()` returns every award
row — F13 made `badges` one row per earn — and `foldAwards()` in `lib/badges/facts.ts` immediately
collapses them to `{ key, runId, scopeKey, firstEarnedOn, earnedOn, count }`. Every intermediate day
and every intermediate `runId` is discarded there. `ShelfEntry.earned` narrows further still, to
`{ firstEarnedOn, earnedOn, count }`.

So the shape of the work is: widen the fold, widen the shelf entry, and give the panel a disclosure
control over the list that now reaches it.

## 2. Approaches, and why this one

Three were written down and scored against the repo rather than against taste.

### A — carry the days through the fold (**chosen**)

`foldAwards` gains one field, `earnedDays: BadgeEarnedDay[]` — `{ earnedOn, runId }`, latest first —
and `ShelfEntry.earned` mirrors it. No new query, no new gateway method, no new module.

| Criterion | |
|---|---|
| Convention | The fold's own doc block already frames `firstEarnedOn` / `earnedOn` / `runId` as **derived conveniences** over the rows. This makes the rows themselves visible and keeps the conveniences derived — the same relationship, stated one level less indirectly. `RunDateLink` was shipped by F24 for exactly this caller and has had no caller until now. |
| Scope | One field on two interfaces, one comparator, one component branch. `lib/badges/gateway.ts` is untouched — the card says it needs no new query, and it is right: `getBadgeAwards` already returns every row. |
| Verifiability | `foldAwards` is driven directly by two suites (`badges.facts.test.ts`, `badges.evaluate.test.ts`) with no database, and the panel's markup is asserted in `badges.render.test.ts`. Both halves are provable by `npm run test`. |
| Reversibility | One commit. The field is additive; every existing reader of `StoredBadge` compiles unchanged. |

### B — a second query, `getBadgeAwardDays(userId)`, read only by the panel

Rejected. `/me` is one `Promise.all` of six database reads and this would make it seven, for rows the
first read already returned. `getBadgeAwards` selects `*` from `badges` — the days are in memory the
moment the page loads, and querying for them again is paying twice for one fact.

### C — fetch the dates on expand, from a new route handler

Rejected on two counts. It makes a disclosure control over data already in the RSC payload into a
network dependency, so the list can fail to open with the page fully loaded. And it needs a new
authenticated endpoint onto `badges`, where `lib/badges/gateway.ts`'s own header states there is
exactly one door between badge evaluation and stored data. A second door for a UI affordance is the
worst reason to open one.

## 3. The fold, rewritten to derive rather than accumulate

`lib/badges/facts.ts`. The old body walked the rows once, keeping a running `fold` and a running
`latest` and patching four fields whenever a later row arrived. The new body collects each key's rows
into an array, sorts that array **latest first**, and reads the answers off the ends:

- `earnedDays` — the sorted rows, projected to `{ earnedOn, runId }`.
- `runId`, `scopeKey`, `earnedOn` — the **head**, which is the latest award by definition. This is
  the same row the old `isLater` walk converged on.
- `firstEarnedOn` — the **tail**'s `earnedOn`, which is the earliest day.
- `count` — still `Σ row.count`, and pointedly **not** `earnedDays.length`. See §4.

That is fewer moving parts than the incremental version and it makes the ordering claim testable in
one place instead of two. The comparator is now the single definition of "later":

```ts
function byLatestFirst(a: BadgeAward, b: BadgeAward): number
```

`earned_on` descending, `created_at` descending as the tie-break — the same two keys, in the same
order, that `isLater` used. `isLater` is gone; nothing else called it. The tie-break is load-bearing
rather than decorative: `getBadgeAwards` orders by `key asc, earned_on asc` and says nothing about
`created_at`, so two awards sharing a day arrive from Postgres in an unspecified order and only this
comparator makes the list — and the head it picks — deterministic. `badges.facts.test.ts` already
asserts that from both directions by reversing its input, and this change keeps that test honest by
extending it to the list rather than only to `runId`.

Catalog order is still not imposed here. A `Map` keyed by badge key preserves insertion order, so
keys still come out first-seen, and `buildShelf` / `badgesForRun` still own the ordering they own.

## 4. `count` can exceed the number of dates, and the panel says so

The one place this feature can lie. `badges.count` is documented in `lib/db/schema.ts` as
"earnings folded into this row: 1, except on rows predating F13", and `foldAwards` sums the column
precisely so that pre-migration history is not deleted off the user's shelf. A single pre-F13 row
carrying `count: 5` therefore folds to a count of 5 with **one** date to list.

The card is explicit about what must not happen: *"do not invent two dates that were never
recorded."* So the panel lists the days it has and, when the count is larger, adds one line that is
not a date and not tappable:

> `2 earlier, dates not recorded`

Three things that line is deliberately not: a fabricated date, a fabricated range, and an error. The
earnings happened; the app of the day recorded an aggregate rather than a ledger, and that is a fact
about the record rather than about the runner. The shortfall is computed in the panel as
`count - earnedDays.length` and nowhere else — it is one subtraction with one reader, so promoting it
to a field on `StoredBadge` would add a second place for it to be got wrong.

`earnedDays` is never empty for an earned badge: the fold does not emit a key with no rows (a key
with no rows is *absent*, which is what `buildShelf` reads as locked). So the expander's contents are
never empty, and there is no empty state to design.

## 5. The panel: a real disclosure control

`components/profile/BadgeDialog.tsx`. `earnedLabel(count)` stops being a plain `<p>` and becomes the
label of a `<button>`:

```tsx
<button type="button" aria-expanded={open} aria-controls={listId} onClick={…}>
  {earnedLabel(earned.count)} <Chevron open={open} />
</button>
{open && <ul id={listId}>…</ul>}
```

Decisions inside that, each with a reason:

- **A `<button>`, not `<details>`/`<summary>`.** The card asks for "a real disclosure control, not a
  `<summary>` lookalike". `<summary>` would supply `aria-expanded` for free and then cost it back:
  its marker has to be suppressed per-engine, it is not a `<button>` so the repo's `active:opacity-70`
  press treatment does not apply to it, and `BadgeShelf` already established the idiom — its 22 rows
  are `<button>`s wrapping their own markup rather than a kit primitive, for a control with exactly
  one caller. This is that same shape one level down.
- **Keyboard operability is the element's, not ours.** A native `<button>` is a tab stop and fires on
  Enter and Space with no handler. `aria-controls` names the list; `aria-expanded` is the state.
- **Focus does not move on expand.** The `<dialog>`'s focus trap is the UA's and the list appears
  *after* the button in DOM order, so the next Tab reaches the first date link with nothing to
  manage. This is also why F24 changed `DetailPanel`'s initial-focus call from
  `el.querySelector('button')` to a ref on Close — that comment names this card by number, and this
  is the change it was anticipating: a positional query would now find *this* expander.
- **The list renders below the gloss, not directly under its trigger — and that came out of a
  measurement, not a preference.** Rendered adjacent to the button, a twelve-earning list fills the
  scroll container and pushes the `<h2>` out of it: the panel's accessible name, and the only thing
  on screen saying *which* badge these dates belong to, disappears the instant a runner asks for the
  dates. Photographed at 390×844 before the move and after. Below the gloss, expanding pushes
  nothing away — the dates extend the panel downward, which is what the scroll container is for.
  `aria-controls` carries the association across the three lines in between, which is exactly the
  attribute's purpose, and the list is still after the button in DOM order so Tab from the trigger
  lands on the first date. The three lines are not filler: they are the badge's identity and its
  rule, the subject the dates are about. The open flag and the list id therefore live in `Body`,
  which is the nearest common parent of the trigger and the list.
- **The list is a `<ul>`.** It is a list of dates; a stack of `<p>`s would read to a screen reader as
  prose with no count.
- **`RunDateLink` per row, unchanged.** `runId` non-null → a link to `/r/<id>`; null → text that does
  not invite a tap. A period badge (week, month, lifetime) is null for every one of its days —
  `century_club` was not earned by one run — and a session badge whose run was deleted is null for
  that day alone, so a single badge's list can legitimately be a mix. That branch is not an edge
  case being tolerated; it is the ordinary case for a whole class of badges, and F24 shipped it under
  test for this reason.
- **The expander exists at a count of one too.** The card asks for it: `Earned once` expands to its
  single date. That date used to print inline as `Earned <date>` and F23 removed it, so this is where
  it comes back — inside the same control as every other count, which is the consistency F23's own
  comment said it was protecting.

### The comment F23 left behind

`BadgeDialog.tsx` currently carries a block that ends *"Card #26 is what gives every earned date a
home. `earned.firstEarnedOn` consequently has no reader on screen; it is kept for #26."* That block is
replaced rather than deleted — a comment that argued for an absence is the right place to record what
filled it. F23's reasoning is not reversed by this card and the new text says so: F23's complaint was
that the panel printed **two** dates as a summary of a span it could not show, and the fix here is not
to print the summary again but to show the span itself. `firstEarnedOn` still has no on-screen reader
in the panel — the list's last row happens to be that day, but it is rendered as a member of the
list, not as a named field — and it keeps its reader on the shelf row via `earnedOn`.

## 6. What happens after a tap: the list comes back collapsed

The card asks this to be decided and written down:

> Tapping one opens the run; the back-swipe returns to `/me` with the panel open **and** — decide and
> state which — either the list still expanded or collapsed.

**Collapsed.** The disclosure lives in `React.useState` inside the panel body, and a route change to
`/r/<id>` unmounts `/me`, so collapsed is what falls out with no machinery. That is the cheap answer;
it is also the right one, and the alternative was costed rather than waved away:

Keeping it expanded means putting it in the URL, because that is the only state the back gesture can
see — F24's whole argument. There is no cheap way to do that. A second parameter is precisely the
thing `lib/panel/param.ts` argues against at length: "with `?badge=` and `?record=` as separate
parameters … that is a registry a later card can silently forget to join". And a suffix on the
existing value (`?panel=badge.tourist.dates`) is ambiguous by construction, because
`decodePanelSelection` splits on the **first** separator only and deliberately admits dotted keys —
a badge named `a.b` and a badge `a` with its list open would encode identically. So the price is a
permanent widening of a codec two other surfaces share.

Against that price: on the device the expander is the **first line of the panel body**, directly under
the thumb that just swiped back, and re-expanding is one tap on a control the eye lands on anyway.
There is also a reading of the interaction where collapsed is simply better — a panel re-entered
should re-establish what badge you are looking at before it re-establishes a list you were part-way
down. Costing a permanent grammar change to save one tap on the second-most-common path through this
panel is not a trade this card should make. If it turns out to matter, the card comes back with a
comment and round 2 has one obvious thing to change.

## 7. The narrow reading, where the card had two

*"each date is clickable just like 1b"* — read narrowly: a date is a link **when it has a run to
open**, which is exactly `RunDateLink`'s contract. The wider reading would give a period badge's date
somewhere to go too — a week or month view of the runs that earned it. That loses: no such route
exists, `scopeKey` is carried on the fold but not per-day, and inventing a destination would be this
card designing a screen the user did not ask for. Noted on the card, one sentence, so the other
reading is a comment away rather than a re-derivation.

## 8. Files

| File | Change |
|---|---|
| `lib/badges/types.ts` | `BadgeEarnedDay`; `StoredBadge.earnedDays` |
| `lib/badges/facts.ts` | `foldAwards` rewritten to collect-then-derive; `isLater` → `byLatestFirst` |
| `lib/badges/shelf.ts` | `ShelfEntry.earned.earnedDays` |
| `lib/badges/index.ts` | export `BadgeEarnedDay` |
| `components/profile/BadgeDialog.tsx` | the expander, the exported `EarnedDayList`, the shortfall line, the rewritten comment |
| `tests/badges.facts.test.ts` | the list's order, its stability, the pre-F13 shortfall, the deleted-run day |
| `tests/badges.evaluate.test.ts` | `toEqual` folds gain the field |
| `tests/badges.gateway.test.ts` | same |
| `tests/badges.shelf.test.ts` | the field reaches `ShelfEntry` |
| `tests/badges.render.test.ts` | the expander's ARIA, the links, the text branch, the shortfall line |
| `tests/integration/queries.int.test.ts` | the `foldAwards` assertion gains the field |

## 9. What the tests cannot prove

No jsdom — `vitest.config.ts` runs in `node` — so a *tap* on the expander is not simulable here, only
the two markups it toggles between. Rendered with the list shut and with it open, both asserted —
which is only possible because `EarnedDayList` is exported. That split follows F21's precedent
directly: `commitStatusLine` was JSX private to `ReviewClient.tsx`, no test could reach it, and it
shipped `1 check still disagree` into two committed screenshots and a README GIF. `EarnedDates` keeps
the one thing that needs state (is it open); the list keeps everything that can be got wrong.

### What was verified with a camera instead of an eye

Items 1, 3 and 4 below were **measured**, not left to a human. The panel's real chrome
(`DetailPanel`) with the real `EarnedDayList` inside it, against the CSS `next build` emitted, in
headless Chromium at 390×844 with `deviceScaleFactor: 2`, in both colour schemes. The only thing the
page faked was `aria-expanded="true"` on the trigger, which has no layout effect. Fourteen earnings,
twelve of them dated, one of those with a deleted run.

| | Measured |
|---|---|
| Panel height vs the `92dvh` cap | 776 px vs 776 px — capped, not grown |
| Body scrolls rather than the panel | `scrollHeight` 504 > `clientHeight` 436 |
| Band keeps its size | 269 px, which is 4:3 of the 358 px panel |
| F23's top gap survives `-my-1 py-1` | button box at 12 px below the band, its text at 16 px = `pt-4` |
| Link vs text branches | 11 links, 1 plain date, 1 shortfall line |
| Both schemes | shot in `light` and `dark`; the chevron and the accent read in both |

That is also where the reordering in §5 came from: the first shot had "Tourist" half-cut at the
bottom edge of the scroll container with the twelve dates above it.

### What a human still has to do

The two items no still frame can answer, both about the gesture:

1. Tap a date → the run opens; back-swipe → `/me` with the panel open and the list collapsed (§6).
   Whether collapsed is the right call is a feel judgement, and §6 is the argument to disagree with.
2. Escape, the backdrop tap and the focus ring on the new control, on a real phone. No jsdom here,
   so `showModal()` never runs in this suite at all — the same limit `F24 §5` records.

---

# F27 round 2 — 2026-08-22

**Card:** [#26](https://github.com/miftahulmahfuzh/run-insights/issues/26) · round 2
**Base:** `656b87f` (`origin/main` with round 1 and F25's record deck both landed)

Two reports from production, one hour after round 1 merged. One is a design failure behind correct
code; the other reverses §6 on the user's say-so, and the costing in §6 turns out to have been wrong
as well.

---

## R2.1 The report that was not a code defect

> `Self-Reward Achieved` — "Earned once" — the date could not be clicked. `Groundhog Day` is also
> "Earned once" and its date *can* be clicked. `Tourist` too. So what happened to Self-Reward?

`catalog.ts:98` — `badge('self_reward', 'Self-Reward Achieved', 'week')`. It is **week-scoped**, so
`badges.run_id` is null on every one of its rows: nothing earns it but four runs inside one ISO week,
and there is no single run for the date to open. `groundhog_day` and `tourist` are `'session'`.
Round 1's own acceptance list says "A period badge's dates are text, not links", and `RunDateLink`'s
doc block has said the same since F24. The code did exactly what it was asked.

**And the design was still wrong.** Three badges read "Earned once"; one date opened a run and the
next silently did nothing; the only way to learn why was to read the catalog. A dead link that is
pixel-identical to a live one is a bug whatever the schema says — and the person who wrote the
specification is the one who filed it, which is about as strong as that evidence gets.

### The fix: a period badge stops pretending to be a day

| Scope | `runId` | `scopeKey` | The row reads |
|---|---|---|---|
| `week` | null | `2026-W34` | `Week of 17 Aug 2026` |
| `month` | null | `2026-08` | `August 2026` |
| `session`, run deleted (R-22) | null | null | `Thu, 28 May 2026` — a day, because it is one |
| `session`, run alive | set | null | `Wed, 20 May 2026`, underlined, links to the run |
| `lifetime` | null | null | a plain day — `types.ts`: "there is no period to name" |

Nothing there invites a thumb it cannot satisfy, and nothing needs a footnote explaining itself.

Three consequences, all carried out rather than discovered later:

- **`BadgeEarnedDay` gains `scopeKey`.** It is the discriminator between the two reasons `runId` is
  null, and without it a deleted-run day and a week are indistinguishable. `foldAwards` already had
  it on every row.
- **`RunDateLink` gains an optional `label`.** The primitive keeps the affordance — that is its
  stated job, so two panels cannot disagree about what a tappable date looks like — and the caller
  supplies the text. It is still a `lib/format.ts` string (`isoWeekLabel`, `formatMonthLabel`), so
  R-23 is pointed at a different formatter rather than loosened. No new date arithmetic: both
  formatters are `/trends`' own and predate this card.
- **The shelf row is left alone**, deliberately. It prints `formatDay(earnedOn)` for every badge and
  that date is **never** a link on any row, so there is no affordance there to lie. The confusion
  this fixes is specific to a surface where some dates are tappable and some are not.

### Rejected

- **A footnote** — "this is a weekly badge, so there is no run to open" — under the list. It
  explains a row instead of fixing it, costs a line on every period badge's panel, and still leaves
  the row itself looking like a broken link until you read the small print.
- **Adding `scope` to `ShelfEntry`** so the panel could switch on `'week' | 'month' | …`. `scopeKey`
  already distinguishes every case that renders differently, and its format says which of week and
  month it is. A second field carrying the same distinction is a second thing to keep in step.
- **Importing `badgeScope` into the panel.** `BadgeDialog` is a client component and `catalog.ts` is
  the 22-row table plus the threshold block — exactly what `lib/badges/types.ts`' own header says the
  type-only split exists to keep out of the client bundle.

## R2.2 The back-swipe returns to the expanded list

> If I click a date it correctly redirects to the run detail page. But if I back-swipe, it goes back
> to the *collapsed* state of the badge detail. Can we make it go back to the extended state? Better
> UX.

Yes — and §6 is the section this reverses. §6 was written to make exactly this cheap, and it named
the price: the URL, because that is the only state the back gesture can see. What §6 got wrong was
the price.

**`lib/panel/param.ts`' "one parameter, not one per surface" argument does not reach this
parameter.** That argument is about two *parallel* surfaces: `?badge=` beside `?record=` makes "both
panels open" a representable state, and keeping them exclusive turns into a registry every opener
must remember to join, whose failure mode is two stacked modals rather than a type error. `dates` is
**subordinate** to whatever `panel` names — on its own it opens nothing, it cannot name a second
surface, and one component reads it. The exclusivity that module protects is `panel`'s, and it is
untouched. Round 1 over-applied a comment; that is the whole of the error.

So: `?panel=badge.tourist&dates=1`.

### `replaceState`, and never `pushState`

The half that makes it work, and the half that is easy to get backwards. Expanding is **not
navigation**. Pushed, the list would be a history entry of its own, and the back-swipe from
`/r/<id>` would land on the panel and *collapse the list* instead of leaving `/me` — two backs to get
out, which is the dead-entry bug `usePanelParam` exists to prevent, reintroduced one level down.
Replaced, the entry the runner leaves for the run already carries `dates=1`, so coming back restores
it exactly, and `pushedRef` still describes the only entry we own.

Three edges, each closed in code rather than noted:

- **`open()` clears the flag.** A tap on a badge shows that badge, not the last one's dates. So the
  disclosure still defaults shut on a fresh open — the half of §6 nobody objected to.
- **`close()`'s replace branch drops both parameters,** so a shut panel never leaves `?dates=1` on a
  bare `/me`.
- **`dates=1` with no `panel` expands nothing.** The hook ands the flag with `selection !== null`,
  and `setExpanded` no-ops when nothing is open.

`dates=1` is the only true value. Absent, empty, `0`, `true`, `yes` — all shut. A URL is user-typed
input and failing closed is the safe direction: the panel opens the way a tap would leave it rather
than the way a typo asked for.

### Why not a suffix on the existing value

Still ambiguous, which is the one thing §6 got right. `decodePanelSelection` splits on the **first**
separator only and deliberately admits dotted keys, so `badge.tourist.dates` is the key
`tourist.dates` — indistinguishable from the key `tourist` with its list open. That is asserted now
rather than argued.

## Files

| File | Change |
|---|---|
| `lib/panel/param.ts` | `PANEL_DATES_PARAM`, `decodePanelDates`, `encodePanelDates` |
| `components/ui/usePanelParam.ts` | `expanded` / `setExpanded`; `withPanel` writes both parameters |
| `components/ui/RunDateLink.tsx` | optional `label` |
| `components/profile/BadgeShelf.tsx` | threads the flag into the panel |
| `components/profile/BadgeDialog.tsx` | disclosure by prop, not state; `periodLabel` |
| `lib/badges/types.ts` | `BadgeEarnedDay.scopeKey` |
| `lib/badges/facts.ts` | the fold carries it |
| `tests/panel.param.test.ts` | the codec, and the ambiguity that rules the suffix out |
| `tests/badges.render.test.ts` | the five scope cases, and `&dates=1` rendered cold |
| four other suites | `scopeKey` on every `earnedDays` fixture |

## Verified

`npm test`: 84 files, **1275 tests** (1261 before, 14 new). Full CI gate below.

Photographed again at 390×844, both schemes — `self_reward` earned six times, deliberately mixed:
three weeks, one month, one deleted-run day and one live run. `Week of 17 Aug 2026`, `Week of 10 Aug
2026`, `Week of 27 Jul 2026`, `June 2026`, `Thu, 28 May 2026` plain, and `Wed, 20 May 2026`
underlined as the only tappable row. One link, five plain rows — measured, not counted by eye. The
distinction the report was about is now visible without reading anything.

### Still a human's job

The gesture itself. No jsdom, so `pushState`/`replaceState`/`popstate` are unreachable from this
suite — `tests/panel.param.test.ts` says so about F24's half already and it is equally true of this
one. What a person has to confirm on a phone: expand → tap a date → back-swipe lands on `/me` with
the panel open **and the list still expanded**, and one more back leaves `/me` rather than collapsing
the list first.
