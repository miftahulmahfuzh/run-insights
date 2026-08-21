# F12 — The badge panel, the earn count, and half the words

> **Depends on:** F09 (`lib/badges/*` — catalog, thresholds, meta, shelf, gateway), F10 (the 22
> masters and `lib/badges/badge-art.ts`), F08 (`components/ui` — `Button`, `Card`, and `Sheet`,
> which this plan deliberately does not use). **Consumes:** F03 (`badges.count`, `upsertBadge`).
> **Owns:** `components/profile/BadgeDialog.tsx`, the button rows and count pill in
> `components/profile/BadgeShelf.tsx`, the `dialog::backdrop` rule in `app/globals.css`, and the
> copy budget in `tests/badges.catalog.test.ts`.
> **Precedent:** `daily-words`' `src/components/gamification/badge-dialog.tsx` and its F13/F21/F22
> ledger. Followed on the mechanics — native `<dialog>`, one panel driven by a selection, a
> full-bleed art band — and diverged from on the data model, for the reason §4 gives.

**Written after the work, not before it.** Unlike F01–F11 this file is a record rather than a
plan: the ask arrived as three sentences and the change is three files deep. It is here because
F09's §4.6 copy table and its §10.2 shelf argument are both now partly superseded, and a reader
diffing this repo against those sections deserves to be told so in the same directory.

---

## 0. The ask, verbatim

1. A badge should be clickable; clicking pops up a modal with the image zoomed in and more detail.
2. Track how many times each badge was achieved, and show it on the profile and in the modal.
3. Halve every badge description.

---

## 1. What superseded what

| F09 said | Now |
|---|---|
| §4.6's copy table — a condition sentence and a two-clause gloss per badge | Both halved. **`lib/badges/meta.ts` is the only authority**; the table at `F09-badges-achievements.md:224` is historical and is no longer the text on screen. |
| §10.2 — the shelf is a reference table a runner reads once | Still true, and every absence it argues for survives: no completion counter beyond "earned / to find", no padlock, no blur, no filter, no sort. What changed is that a row is now a control. |
| `Sheet` is "the app's one modal surface" | Still true of `Sheet`'s job. The badge panel is a second modal surface and §3 is the argument for it. |

Nothing in F09's *rule* layer moved. No threshold changed, no evaluator changed, `buildShelf`
returns the same shape, and `badges` has no schema delta.

---

## 2. Halving the copy (ask 3)

3330 characters across 22 badges became **1654**, and the cut was structural rather than a pass
with a red pen:

- **Conditions lost their qualifiers, never their numbers.** Every `BADGE_THRESHOLDS`
  interpolation and every `lib/format.ts` call survived intact, so R-42's "copy that restates a
  threshold is a second source of truth for that threshold" is untouched. *"Started between 05:00
  and 05:30 in the morning"* → *"A start between 05:00 and 05:30."*
- **Glosses lost their second sentence.** That sentence was almost always the first one restated
  with more adjectives. *"The watch counted every one of them. The legs are the ones who paid the
  bill."* → *"The legs paid the bill."*
- **The register did not move.** Impersonal, present tense, no second person, no exclamation mark
  — `tests/badges.catalog.test.ts` already enforced all four and still passes unchanged.

**The budget is the enforcement mechanism.** A new assertion caps each condition at 100 characters,
each gloss at 70 and two sentences, and the whole file at 1665. Per-string caps as well as a total,
because a total alone lets one badge eat another's budget. `boring_excellence` is the outlier the
100-character cap exists for: it genuinely names three separate numbers, and compressing it further
would mean dropping one.

Every other rule in `meta.ts` is a rule about *voice*, and a rule about voice does not stop a
sentence from growing a second clause. Hence a rule about length.

---

## 3. The panel (ask 1)

### 3.1 A native `<dialog>`, and why not `Sheet`

`Sheet` was written for a correction: a *detour* from a table the reviewer must not lose their
place in. Everything about it follows from that — it rises from the bottom, pins a Save footer,
locks body scroll against the iOS keyboard, and pads its body `px-5 py-4` because every caller is
a form. None of it describes this. Nothing here is edited, there is no keyboard, and the thing the
panel exists to show is a **picture**, which wants to be flush to three of the panel's edges.

So `BadgeDialog` is a `<dialog>` opened with `showModal()`. The choice buys more than layout: the
UA supplies the focus trap, initial focus, `aria-modal`, Escape-to-cancel, focus restoration on
close, and the backdrop — six behaviours `Sheet` hand-rolls in a 25-line effect. Measured, all six
work: focus lands on Close, Escape and a backdrop click both close, and focus returns to the row
that was tapped.

Two traps, both avoided deliberately and both commented at the call site:

- **No `role="dialog" aria-modal="true"`.** A redundant explicit role on a `<dialog>` is a known
  screen-reader hazard. `Sheet`'s div needs them precisely because it is not a `<dialog>`.
- **No React `autoFocus`.** It fires on mount, one commit *before* the effect calls `showModal()`,
  so the dialog would record a child of its own as the element to restore focus to and drop focus
  to `<body>` on close. The effect focuses the Close button by query, after `showModal()`, and the
  reason it focuses anything at all is that Chromium treats the scrolling body as a focusable area
  and would otherwise open the panel announcing "scrollable region".

`onCancel={onClose}` is what keeps DOM state and component state from diverging. Without it Escape
shuts the element while `openKey` stays set, and the next tap on the same row appears to do
nothing — which is exactly what the reopen assertion in the behaviour check covers.

### 3.2 The scrim is CSS, not a utility

`dialog::backdrop` lives in `app/globals.css` as a literal rgba in both schemes. A
`backdrop:bg-ink/40` utility would compile to `background-color: var(--ink)` against an element
that, in engines predating the 2024 spec change, inherits from nothing — and the scrim would
silently be transparent. This is the one part of the panel a Tailwind class cannot express safely.

### 3.3 The art is a band, not a tile

F10's masters are a square of navy twill with the patch sewn onto it, full bleed. Dropped into a
padded white panel the cloth stops at the image's edge and the whole thing reads as a sticker on a
sheet of paper — the artefact `daily-words` F21 was opened to remove. So the band is painted with
`art.twill`, the exact colour `make_badge_assets.py` sampled from that master's outer frame, and
the square art sits inside a 4:3 band at its natural aspect. The cloth either side of it is the
same cloth, so there is no seam and — the part that matters — **no crop**: the patch is never cut
to fill a rectangle. This is `BadgeShelf`'s existing twill argument at 4× the size.

Locked art is `grayscale opacity-50` rather than hidden, which is §10.2's position unchanged.

### 3.4 One dialog, twenty-two rows

The panel is driven by a selection held in `BadgeShelf`, and the state is the **key**, not the
entry. `shelf` is replaced wholesale on every navigation to `/me`; a held entry object would keep
a panel open against data the page no longer shows.

`BadgeShelf` became a client component to hold that state, and it is the smallest unit that can.
The `shelf` prop crosses in the RSC payload either way — pushing the boundary down to a per-row
wrapper would buy one more module boundary and no behaviour.

Rows are `<button>`s wrapping the same markup rather than a new kit primitive: exactly one caller
in the app needs a tappable badge, and `components/ui` is where a *second* caller would put it.
The row's `<p>`s became `<span className="block">`s in the same change — a `<button>` takes
phrasing content only, so they were invalid markup the moment the row gained a role.

---

## 4. The count (ask 2)

**`badges.count` already existed** and F09's `isNews` already implemented §7's re-earn policy
per scope. What was missing was that the number was legible: it rendered as a trailing
`· earned 3 times` at the end of a date line, in 11px, on the one row in twenty-two where it
applied. So:

- **On the shelf**, a `×N` pill sits on the corner of the patch, outside its `overflow-hidden` box
  (which is why the patch is now wrapped). `bg-ink text-card` rather than the accent, for the
  reason `Button.tsx` argues at length: white on the cyan lands near 2:1, and ink-on-card is ~14:1
  and inverts correctly in dark mode. The date line now reads `· most recent of 3`, which says the
  thing the pill cannot.
- **In the panel**, the eyebrow spells it out: *"Earned 12 times"*, *"Earned once"*, *"Not yet
  earned"*.
- **At a count of one, the pill is absent.** A `×1` on every earned row would turn the one
  genuinely interesting number on the screen into furniture.

### 4.1 What was NOT built, and the honest limit

> **Both halves of this section were fixed in F13 — see `F13-badge-award-ledger.md`.** `badges` is
> now keyed `(user_id, key, dedupe_key)`, one row per award: `isNews` is gone, the count is the
> rows folded, and the panel prints *"×12 · first Sat, 4 Jul 2026 · latest Thu, 20 Aug 2026"*. What
> follows is the state at F12 and the reasoning that argued for the ledger, kept as written.

`daily-words` shows *"×3 · first 4 Jul · latest 20 Aug"* because it stores one row per award.
This repo stores one row per `(user_id, key)` and `upsertBadge` moves `earned_on` **forward** on
each re-earn, so there is no first date to print. The panel therefore says *"Most recently
Thu, 20 Aug 2026"* rather than inventing a first — the same discipline R-41 applied to the
extraction screen.

**A known defect, recorded rather than fixed.** `isNews` decides a session badge is news when
`existing.runId !== earn.runId`, which compares against the *last* run to earn it and not against
every run that ever did. Re-committing run A after run B has earned the same badge therefore
increments the count a third time. Fixing it properly means a `badge_awards` ledger — one row per
earn, `count`/`first`/`latest` derived from it — which is a schema delta, a migration and a
gateway rewrite, and none of the three is in this ask. It is worth doing next; the count is
otherwise a lower bound that inflates only under re-review.

F13 did it next, and widened `badges` rather than adding the second table this paragraph imagined:
`neon-http` has no `db.transaction()`, so a ledger insert plus an aggregate update would be two
unbound writes and a drift bug traded for a counting bug. Deriving the aggregate leaves nothing to
drift.

---

## 5. File manifest

| File | Change |
|---|---|
| `lib/badges/meta.ts` | all 44 strings halved; the header records the cut and points at the budget |
| `components/profile/BadgeDialog.tsx` | **new** — the panel |
| `components/profile/BadgeShelf.tsx` | `'use client'`, button rows, count pill, `<p>`→`<span>` |
| `app/globals.css` | `dialog::backdrop`, both schemes |
| `tests/badges.catalog.test.ts` | the copy budget |
| `tests/badges.render.test.ts` | 22 buttons, the aria states, the pill, and that a shut panel renders no prose |

No schema delta, no migration, no query change, no new dependency.

---

## 6. Verification

`npm run typecheck`, `npm run lint`, `npm run build`, all seven CI guards and `badges:check` clean;
1027 tests pass. The visual and behavioural half was checked in a real browser at 414×896 and
360×600, in both colour schemes, against a temporary unauthenticated preview route rendering
`BadgeShelf` on fixture data — shelf, an earned panel, a locked panel, focus on open, focus
restoration on close, Escape, backdrop click, and reopening the same row. The route was removed
afterwards; it is not in the tree.

What no assertion covers, and what §13 of F09 still asks a human to do: whether 22 rows and the
panel read well on a real phone in real light.
