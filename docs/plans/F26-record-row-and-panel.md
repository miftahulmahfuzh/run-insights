# F26 — one line per personal record, and a tap opens the record panel

**Card:** [#25](https://github.com/miftahulmahfuzh/run-insights/issues/25) · round 1 · 2026-08-22
**Base:** `656b87f` (`origin/main` with F24's panel shell and F25's records deck both landed)

Part 4 of 5 of the "Personal records + badge panel" set. Depends on
[#23](https://github.com/miftahulmahfuzh/run-insights/issues/23) (the shell, the history-backed open
state, `RunDateLink`) and [#24](https://github.com/miftahulmahfuzh/run-insights/issues/24) (the ten
record patches). Both are merged; this branches off the merge of the second.

> **On the number.** `F26`, not `F<N+1>`. `docs/plans/` on `origin/main` holds F24, F25 and F27 —
> F26 is the gap, and it is a *reserved* gap rather than an accident: F25's own header wrote the
> set's convention down as `F<card + 1>` (#22 → F23, #23 → F24, #24 → F25, **#25 → F26**, #26 → F27)
> precisely so five parallel cards could each derive a number from their own id without
> coordinating. `F<N+1>` would have said F28 and left a permanent hole. Re-checked against
> `origin/main` immediately before the PR was opened.

---

## 1. What the user asked for

> **(1)** There are too many texts in the Personal records section. Make sure each takes only one
> row. BUT we can click each row and it pops up the same modal as our existing badge modal detail.
> Basically we need to remove the "`<date> · was 10.67 km`" text that takes the second row.

Plus the record half of **(1b)**: the date inside the panel links to that record's run, and the back
gesture returns to the panel.

Two of those three sentences are a deletion and the third is a move. Nothing is *lost* by the trim —
the date and `previousValue` both keep a reader, one layer in. That is what makes this card small:
F24 shipped the shell, `RunDateLink` and the URL-backed open state, F25 shipped the art, and
`lib/panel/param.ts` shipped `'record'` as a `PanelKind` with no producer. Every piece this needs
already exists and has been waiting for a caller.

## 2. Approaches, and why this one

Three, scored against the repo rather than against taste.

### A — `RecordsTable` becomes the client component and owns one `RecordDialog` (**chosen**)

The exact shape `BadgeShelf`/`BadgeDialog` already has: the list component calls `usePanelParam`,
resolves `panelKeyFor(selection, 'record')` against the rows it was handed, and renders **one**
dialog for ten rows.

| Criterion | |
|---|---|
| Convention | It is not *like* the badge shelf, it is the same construction — `usePanelParam` + `panelKeyFor` + one dialog driven by the selection + rows as `<button>`s carrying an explicit `aria-label`. `BadgeShelf`'s doc block already argues why the list itself is the client boundary ("the smallest unit that can be": the rows prop crosses as the RSC payload either way, and a per-row wrapper buys one more module for no behaviour). |
| Scope | Two files touched, one added. No query change, no type change, no new primitive — `RecordRowView` already carries `previousValue` and `achievedOn`, which is exactly what the panel needs and what the row is giving up. |
| Verifiability | `renderToStaticMarkup` reaches both halves: the collapsed row markup, and the panel as `?panel=record.<key>` renders it on a cold load. `badges.render.test.ts` already mocks `useSearchParams` for F24 and already holds the `RecordsTable` suite. |
| Reversibility | One commit. Nothing outside `components/profile/` changes. |

### B — a client wrapper on `/me` owning both surfaces' panel state

Rejected, and specifically because it looks tidier. One `<MePanels>` holding the selection for the
shelf *and* the table would put the two surfaces back into a shared registry — the thing
`lib/panel/param.ts` spent a doc block eliminating ("a registry a later card can silently forget to
join, and the failure is two stacked modals rather than a type error"). The single parameter already
makes exclusivity structural; a wrapper would re-add the coordination the parameter removed, and buy
nothing, since each surface still has to resolve its own key against its own rows.

### C — the row stays a `<Link>` and the panel opens from a second control

Rejected. The card is explicit that tapping the row opens the panel and that the navigation *moves*
onto the date inside it. A row that both navigates and discloses needs two targets or two gestures,
and the app has that vocabulary nowhere else: `BadgeShelf`'s rows are whole-row buttons, and F27's
expander is a button on its own line. It would also make the one-tap-target constraint the card
states impossible to satisfy.

## 3. The open design call: no patch on the row

The card leaves this to the implementer and names the tension itself — "it costs row height that the
'one row only' ask is trying to reclaim (the shelf's mark is 56px; a record row's text is 13–15px)".
Decided **against**, on arithmetic rather than taste:

- The row being deleted is `15px` value over `11px` date, `mt-0` between them: **~36 px of content**,
  inside `mt-3 … pt-3` separators. The row replacing it is one 15px line — **~20 px**. Hanging the
  shelf's 56px mark beside it makes the *new* row 56 px tall: **taller than the two-line row the card
  asked to shrink.** Ten of them add ~200 px to a section whose whole ask was to give height back.
- Shrinking the mark to fit the line — ~28–32 px — puts it under the size F25 graded its masters at.
  Its own check 3 is a legibility floor, and the `small` derivative's doc block says the 192² is a
  **centre square crop** rather than a squash *because the silhouette is what tells a record patch
  from a badge*. At 30 px a pentagon is a blob, so the row would pay height for a mark that no longer
  identifies anything.
- And it would cost the section its identity. Ten patches sitting immediately above the shelf's 22
  makes "Personal records" read as a second, shorter badge shelf. It is not one: it is a compact
  table of ten numbers, which is why R-36's "the shelf stays quiet so the patches can be loud" is a
  layout instruction as much as a palette one — the patches are loud *there*.

The patch is not absent, it is one tap away, at 4:3 in the band where the embroidery is legible.
`RECORD_ART[key].small` stays generated and unread, exactly as F25's plan said it would be: "free at
generation time and expensive afterwards", because adding it later would rewrite every content hash.

**What a human still has to confirm:** that ten single lines read as a *table* and not as a list of
orphans at 414 px in both schemes — §13's check. The arithmetic above says the height is right; it
cannot say the rhythm is.

## 4. The row

```
Longest distance                                     10.94 km
```

- A `<button>`, full width, `flex items-baseline justify-between` — the button **is** the flex row,
  with two direct `<span>` children and no wrapper `<div>`. `BadgeShelf` wraps a `<div>` inside its
  button because its row is a two-dimensional layout; a single line needs no block child, and a
  `<button>` takes phrasing content only (the constraint the card restates, and the reason
  `BadgeShelf`'s children are `<span className="block">` rather than `<p>`).
- `aria-label` names the row and its number and then says what the tap does:
  `Longest distance — 10.94 km. Show the record.` A label *replaces* the content for a screen
  reader, so both halves have to be in it — this is not `BadgeShelf`'s case, where the label adds
  what the visual row encodes rather than states, because a record row states everything it has.
- `formatRecordValue(key, value)` unchanged, `RECORD_LABELS[key]` unchanged. R-23 holds by not being
  touched.
- The `<Link href={/r/${runId}}>` is **gone from the row**, which is the whole reason the row can be
  a button. The navigation moves onto the date in the panel — F24's `RunDateLink`.
- Separators, type sizes and colours are unchanged. `EmptySlot` is unchanged.

## 5. The panel

`components/profile/RecordDialog.tsx`, mirroring `BadgeDialog.tsx`: a **body**, not a dialog. The
shell is F24's `DetailPanel`.

```
┌────────────────────────────┐
│  [ the patch, 4:3, flush ] │
├────────────────────────────┤
│  Personal record           │   ← eyebrow, where the badge panel puts "Earned N times"
│  Longest distance          │   ← <h2 id={titleId}>
│  10.94 km                  │   ← the number, big
│  Tue, 12 Aug 2026          │   ← RunDateLink → /r/<runId>
│  Beat 10.67 km to get here.│   ← previousValue, where it exists
├────────────────────────────┤
│         [  Close  ]        │
└────────────────────────────┘
```

- **`art.dimmed` is never set.** `PanelArt`'s own comment says why: "A personal record is always
  held by a real run and never dims." That is schema, not optimism — `records.run_id` is `NOT NULL`
  and `ON DELETE CASCADE`, so deleting the holding run deletes the record row rather than orphaning
  it. Which is also why the date is always a link and never `RunDateLink`'s text branch: the badge
  deck needs both branches, the record deck structurally cannot reach the second one.
- **`RECORD_ART_WIDTH`/`_HEIGHT`, not the badge deck's.** 1024×768 masters, 768×576 derivatives,
  against the badge deck's 768×576 from 1024². `PanelArt` carries its own `width`/`height` precisely
  so the shell cannot assume one deck's numbers — this is the caller that comment was written for.
- **"Beat 10.67 km to get here."** — `RecordsTable`'s own doc block has said, since F06, that
  `previousValue` is kept "specifically so a shelf can say 'beat 7'30" to get here'". The sentence
  is that sentence. It works in both directions without a conditional: beating a `max` means further,
  beating a `min` means faster, and "beat" is the word for both. That is the card's ask — "read as a
  sentence rather than the compressed `· was 10.67 km`".
- **Nothing at all when `previousValue` is null.** The card says "`previousValue` where it exists",
  and `RecordsTable`'s comment already established the convention: "where the current holder is the
  first ever, there is nothing to compare against and nothing is printed." The alternative
  considered and dropped is in §7.
- **The eyebrow is `Personal record`, flat text, not a control.** The badge panel's first line is an
  expander because a count has a list behind it (F27). A record has exactly one holder and one date,
  so there is nothing to disclose, and F27's own reasoning cuts this way: it made "Earned once" an
  expander rather than a bare line *for consistency with the counts that had lists*. There is no
  list here to be consistent with. The line still earns its place — it is what makes the `<h2>` read
  as the name of a record rather than the title of the panel.
- **The label keeps its qualifier.** `RECORD_LABELS[key]` verbatim, so `fastest_pace_10k` is
  "Fastest pace, 10 km+" in the panel exactly as in the row. `catalog.ts` and `labels.ts` both
  require the copy never to say "your 10k PB", and the way this panel obeys that is by rendering the
  same string rather than writing its own — a reworded panel would be R-42's second source of truth.

## 6. What the client boundary now carries

`RecordsTable` gains `'use client'`, which pulls `lib/records/labels.ts` — and through it
`lib/records/catalog.ts` — into the `/me` client bundle for the first time. Checked rather than
assumed: `RECORD_CATALOG` is ten objects whose `qualifies`/`valueOf` are one-line arrow functions
over a `RunCandidate`, and it holds no secret, no `server-only` and no query. `formatRecordValue`
needs `recordDefinition(key)?.unit`, so the catalog crosses either way unless the unit is duplicated
into the labels module — which would be the second source of truth this file is otherwise careful to
avoid. `scripts/check-client-secret-boundary.mjs` covers the real hazard and is in the gate.

`tests/share.bundle.test.ts` is unaffected: it audits the public share route's import graph, and
neither `RecordsTable` nor `DetailPanel` is in it (`DetailPanel` is deliberately *not* in the
`components/ui` barrel for exactly this reason — F24's own note).

## 7. The narrow reading, where the card had two

**A first-ever record's panel says nothing about having no predecessor.** The other reading is a line
like "The first one on record." — it would tell a reader that the missing sentence is a fact about
the record rather than a gap in the panel. It loses on 4c: the card's words are "`previousValue`
where it exists", the repo already has a stated convention for this exact field (print it where it
is, print nothing where it is not), and inventing copy for the absence widens the panel past what was
asked. If it should say something, that is one comment and one reopen.

## 8. Files

| File | |
|---|---|
| `components/profile/RecordsTable.tsx` | `'use client'`; rows become one-line `<button>`s; owns `usePanelParam` and renders one `RecordDialog`. The two doc blocks stay — the absent-not-zero rule is unchanged, and the `previousValue` block gains where it now lives. |
| `components/profile/RecordDialog.tsx` | **new.** The record body inside `DetailPanel`. |
| `tests/badges.render.test.ts` | the `RecordsTable` suite rewritten for one-line rows, plus a `RecordDialog` suite and a `?panel=record.…` cold-load case. The `useSearchParams` mock F24 added is already at module scope. |
| `docs/plans/F26-record-row-and-panel.md` | this file. |

Not touched: `app/me/page.tsx` (the props are unchanged), `lib/panel/param.ts` (`'record'` was
already in the union), `lib/records/*`, every query, every migration.

## 9. Acceptance

- [ ] Every personal record is exactly one line; no `· was …` anywhere in the section.
- [ ] Tapping a row opens the record panel; the back-swipe closes it and stays on `/me`.
- [ ] Tapping the date in the panel opens that run; the back-swipe returns to `/me` with the panel
      open.
- [ ] `npm run test`, `npm run lint`, `npm run typecheck` clean — and the rest of the repo's own
      14-command CI gate.

The middle two are F24's mechanism, unchanged and untestable here for the same reason F24 could not
test them: there is no jsdom in this repo and no `history` to drive. What the suite *can* prove is
the half that would break them — that the row is a button wired to `open({kind:'record', …})`, and
that a cold load of `?panel=record.<key>` renders the panel — and the gesture itself is §13's
read-it-on-a-phone check, as it was for #23.
