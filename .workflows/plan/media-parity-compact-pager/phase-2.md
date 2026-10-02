# Phase 2: One pager cell: 30.8 px, circular

**Plan set:** `MEDIA_PARITY_COMPACT_PAGER_PLAN.md`
**Analysis:** `20261002-141559-M3K8_code_analyzer.md`
**Satisfies:** R2 — pagination cells are smaller and circular, 30 % smaller than today's, on every
paginated surface in the app
**Depends on:** none
**Difficulty:** EASY
**Package:** `components/ui`

---

## Goal

Every pagination row in the app draws a 30.8 px circular cell instead of a 44 px rounded square,
and it does so because the **one** shared control changed — not one call site is edited, which is
the proof that "apply to every pagination in the system" was already structurally true before this
phase started. The 30.8 px figure is 44 × 0.7 exactly, and because it sits *below* the app's
otherwise-absolute 44 px iOS tap floor, the file now carries the argument for why it is allowed to,
so the next reader who notices the violation does not quietly undo it.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no export, no config key, no file.

**Renames:** nothing. `CELL`, `ACTIVE`, `INACTIVE`, `Pagination`, `PaginationProps` all keep their
names, their shapes and their visibility.

**Creates:** nothing. No new export, no new file, no new theme token, no new test file.

**Signature changes:** none. `Pagination(props: PaginationProps): React.JSX.Element | null` is
byte-identical after this phase.

**Class-string changes (the whole of the phase's observable surface):**

| Constant | Token | Before | After |
|---|---|---|---|
| `CELL` | min-height | `min-h-11` (2.75rem = 44 px) | `min-h-[1.925rem]` (30.8 px) |
| `CELL` | min-width | `min-w-11` (2.75rem = 44 px) | `min-w-[1.925rem]` (30.8 px) |
| `CELL` | radius | `rounded-field` (14 px) | `rounded-pill` (999 px) |
| `CELL` | padding-x | `px-2` (8 px a side) | `px-1` (4 px a side) |
| `CELL` | font-size | `text-[13px]` | `text-[12px]` |
| `CELL` | everything else | `inline-flex items-center justify-center font-semibold tabular-nums` | unchanged, same order |
| `ACTIVE` | — | `bg-ink text-card` | **unchanged** |
| `INACTIVE` | — | full string | **unchanged** |

**Requires (from earlier phases):** nothing. This phase has no `depends_on` and reads no symbol any
other phase writes. It can land before, after, or concurrently with phase 1.

**Leaves alone (owned by others or out of scope):**

- `lib/nina/album.ts`, `app/nina/about/page.tsx`, `lib/nina/aboutPageActions.ts`,
  `components/nina/NinaAboutScreen.tsx`, `components/nina/NinaPhotoGrid.tsx`,
  `components/nina/NinaAboutScreen.test.tsx` — **Phase 1**.
- All five `<Pagination …>` call sites, not one line:
  `components/nina/NinaAboutScreen.tsx:1030`, `components/admin/explorer/PhotoGrid.tsx:203`,
  `components/admin/PhotoshopPickerGrid.tsx:69`, `components/admin/PhotoReferencePicker.tsx:406`,
  `app/admin/error-logs/page.tsx:134`.
- `components/ui/index.ts` (the barrel), `app/globals.css` (no new token — the existing
  `--radius-pill` already covers this), `components/admin/touch.ts` (`TOUCH_TARGET` /
  `TOUCH_ICON` keep enforcing 44 px for admin controls, which is still correct for them).
- `components/ui/Button.tsx:13`'s 44 px claim — it is cited, never edited.

## Files

| File | Action | What changes |
|---|---|---|
| `components/ui/Pagination.tsx` | modify | header `:14-17` (the `TOUCH_ICON` paragraph, now stale), the `CELL` docstring `:51-55`, and the `CELL` string `:56-58` |
| `components/ui/Pagination.test.tsx` | modify | header docstring `:8-14` (names the pinned tokens) and the size test `:90-98` |
| `components/ui/.workflows/package_readme.md` | modify | `:373-376` (the active-cell + `min-h-11 min-w-11` decision record) and `:381-384` (the now-false "the 44 px tap floor is spelled locally in `CELL`") |
| `docs/architecture.md` | modify | `:325` ("Three things" → "Four things") and a new fourth bullet after `:335` |

Four files. One of them is implementation; three are the record.

> **Reconciled 2026-10-02.** Every line range and quoted "before" below was opened against the
> worktree at `origin/main` @ `9010c11`. All exact: `Pagination.tsx` header block `6-25` (the
> `TOUCH_ICON` paragraph `14-17`), `CELL` docstring `51-55` and the `CELL` string `56-58`;
> `Pagination.test.tsx` docstring `8-14` and the size test `90-98` (closing `})` on 98 — no
> off-by-one here); `components/ui/.workflows/package_readme.md` `373-376` and `381-384`;
> `docs/architecture.md` `:325` "Three things are deliberate and easy to \"fix\" wrongly:" with the
> `hrefForPage` bullet ending on `:335` and `:336` blank. Two line pointers in the Files table were
> off and are corrected above (`:11-13` → `:8-14`, `:375-376` → `:373-376`); the *steps* were
> already right. Step 3's exhaustiveness claim is confirmed: a repo-wide sweep for `min-h-11` /
> `min-w-11` / `rounded-field` under `*.test.ts(x)` finds this control's tokens pinned in
> `Pagination.test.tsx:96` and nowhere else — `tests/admin.shortcuts.test.ts:288` reads the shortcut
> TABLE source, `DialSlider`/`UserPicker` read their own components, and
> `components/nina/NinaAboutScreen.test.tsx` contains no `toHaveClass` at all. `rounded-full`'s
> surviving uses number exactly 11, as stated. `--radius-pill: 999px` is `app/globals.css:139`,
> `components/ui/Button.tsx:13` is the 44 px line, and `docs/design-brief.md:174` is
> "**Minimum 44 × 44pt tap targets.**" — all three citations resolve.

---

## The arithmetic, settled before any code

Everything below is derived once here so the implementation steps can quote it rather than re-argue
it. These are the numbers that go into the docstring.

**The box.** `min-h-11` compiles to `min-height: calc(var(--spacing) * 11)`. Tailwind v4's
`--spacing` default is `0.25rem`, so `11` is `2.75rem` = 44 px at a 16 px root. 30 % smaller is
`44 × 0.7 = 30.8 px = 1.925rem`. Spelling it `min-h-[1.925rem]` rather than `min-h-[30.8px]` keeps
the property tracking the root font scale exactly the way `min-h-11` did — a user who scales text up
scales the pager up with it, which is the behaviour being preserved, not a style preference. This
repo is Tailwind **4.3.3** with **no config file** (`app/globals.css` is the config, via
`@theme inline`; the file's own header at `:7` says "No tailwind.config.js, ever"), so an arbitrary
value is the only way to spell a non-ladder number and is already the house idiom
(`components/nina/Composer.tsx:423` `max-h-[132px]`, `components/admin/MemoryTable.tsx:260`
`min-w-[348px]`, `components/review/ScreenshotStrip.tsx:63` `size-[104px]`).

**`min-h`/`min-w` and not `h`/`w`** — unchanged, invariant 9, and the existing docstring's own two
reasons still hold verbatim at 30.8 px: a minimum cannot fight a wrapped row's line height, and a
long page number must be allowed to be wider than it is tall.

**The fit.** Tailwind's preflight sets `box-sizing: border-box` globally, so `min-width: 30.8px`
is the *outer* box and the horizontal padding is spent inside it. The font is **Poppins**
(`app/layout.tsx:16-20`, weights 500/600/700, self-hosted by `next/font`), whose digits are
uniform-width at 600/1000 em — so `tabular-nums` changes nothing and one digit advances
`0.6 × font-size`.

With the padding and type left as they are (`px-2` = 16 px total, `text-[13px]` → 7.8 px a digit):

| digits | text | + padding | total | vs 30.8 |
|---|---|---|---|---|
| 1 | 7.8 | 16 | 23.8 | circle |
| 2 | 15.6 | 16 | **31.6** | **stretches, +0.8 px** |
| 3 | 23.4 | 16 | 39.4 | pill |
| 4 | 31.2 | 16 | 47.2 | pill |

Two digits already stretches — i.e. pages 10–13 of today's Media tab would every one of them be a
slightly-wider lozenge sitting next to nine circles. That is the reason the padding and the type
have to move with the box rather than the box moving alone.

With `px-1` (8 px total) and `text-[12px]` (7.2 px a digit):

| digits | text | + padding | total | vs 30.8 |
|---|---|---|---|---|
| 1 | 7.2 | 8 | 15.2 | circle (min-w wins) |
| 2 | 14.4 | 8 | 22.4 | circle |
| 3 | 21.6 | 8 | 29.6 | circle, 1.2 px to spare |
| 4 | 28.8 | 8 | **36.8** | **FIRST to stretch — a 36.8 × 30.8 pill** |

**Four digits is the stated breaking point.** It is not an accident and it is not a bug: it is
precisely what `min-w` (rather than `w`) exists for, and `PAGE_CEILING`-scale collections are the
only way to reach it. Today's largest real pager is 13 pages.

Height is never the binding constraint: Tailwind preflight sets `html { line-height: 1.5 }` and
`app/globals.css`'s base layer does not override it, so a 12 px line box is 18 px — well inside
30.8 px, which means `min-height` wins and the box stays square-before-radius for one to three
digits.

**Legibility.** 12 px Poppins SemiBold tabular digits, which the app already undercuts elsewhere
without complaint (`app/me/page.tsx:167` `text-[10px]`, `components/nina/Composer.tsx:332`
`text-[11px]`). The 16 px floor in `app/globals.css:160-168` is an **input** rule — it exists
because Safari zooms the viewport when a *form control* under 16 px takes focus — and a pager cell
is a `<span>`, `<a>` or `<button>`, none of which trigger it. 13 pages on a phone stays readable.

**`rounded-pill`, not `rounded-full`.** The two render identically here — `--radius-pill: 999px`
(`app/globals.css:139`) and Tailwind's `rounded-full` (`calc(infinity * 1px)`) both clamp to half of
a 30.8 px box — so this is purely a vocabulary call, and the vocabulary is already settled. The
`@theme inline` block ships a four-step radius ladder mirrored from `docs/design/tokens.css`
(`chip` 8 / `field` 14 / `card` 22 / `pill` 999), and **every round control in the app spells
`rounded-pill`**: `components/nina/Composer.tsx:281,357,435` (`size-11` buttons),
`components/ui/Sheet.tsx:124` (close), `components/ui/Chip.tsx:16`,
`components/admin/CircleFrame.tsx:47`, `components/nina/PhotoAttachmentChip.tsx:50`,
`components/nina/NinaJobDetailLink.tsx:135`, `lib/nina/chrome.ts:105`. `rounded-full` survives in
exactly 11 places and all of them are decorative 1–3 px dots (`ZoneBar`, `ConsistencyBanner`,
`SignInCard`, `Button`'s loading dots, `NinaUnreadBadge`). A pager cell is a control, so it takes
the control's token — and `rounded-field`, the thing being replaced, is from the same ladder, which
keeps the diff inside one vocabulary instead of straddling two.

> **Note for the implementer, on prettier.** `.prettierrc.json` (that is the filename — there is no
> bare `.prettierrc`) sets `printWidth: 100` and loads `prettier-plugin-tailwindcss`
> with `tailwindStylesheet: ./app/globals.css`. With no `tailwindFunctions` configured the
> plugin sorts `class`/`className` *attributes*, not a bare `const CELL = '…' + '…'` assignment —
> and in any case every replacement below keeps each token in the **same slot** as the token it
> replaces, so sorted or not the string is stable. The new `CELL`'s first line measures 98 columns
> including the trailing ` +`, inside the 100 limit, so the split stays where it is written.
> `.prettierignore` lists both `*.md` and `docs`, so the two markdown edits and the
> `docs/architecture.md` edit are outside `format:check` entirely.

---

## Implementation Steps

### Step 1: Un-stale the file header's `TOUCH_ICON` paragraph

**File:** `components/ui/Pagination.tsx:14-17`

**Change:** The header currently justifies not importing `components/admin/touch.ts` by saying the
44 px string is duplicated locally in `CELL`. After this phase `CELL` is 30.8 px and duplicates
nothing — the import argument still stands, but its stated reason becomes false. Rewrite the
paragraph so the boundary rule survives and the obsolete claim goes.

**Code:** the full comment block `:6-25` after the edit (only the third paragraph moves; the first,
the fourth and the rule bar are quoted unchanged so the hunk is unambiguous):

```tsx
/*
 * Deliberately NOT marked 'use client', for `components/ui/Button.tsx:6-10`'s reason: nothing here
 * uses a hook or an effect, so the module compiles into whichever graph imports it. A client screen
 * gets interactive buttons; `app/admin/error-logs/page.tsx` is a Server Component and gets plain
 * anchors with no React shipped for them. This matters beyond taste — `components/ui/index.ts` is a
 * client-safe bundle boundary that thirty-plus `'use client'` files import, and
 * `tests/share.bundle.test.ts:71` asserts the barrel never reaches `/s/[token]`.
 *
 * Imports are `next/link` and `@/lib/cn` and nothing else. In particular NOT
 * `components/admin/touch.ts`'s `TOUCH_ICON`, whose own header argues it is admin-scoped: `ui`
 * importing `admin` is an inverted dependency. `CELL` spells its own geometry instead — and since
 * 2026-10-02 it is not even the same geometry, because the pager cell is a deliberate 30.8 px
 * exception to the 44 px floor `TOUCH_ICON` exists to enforce. Read `CELL`'s docstring before
 * reconciling the two: they are supposed to disagree now.
 *
 * ── EVERY NUMBER, ALWAYS ────────────────────────────────────────────────────────────────────
 * No ellipsis, no window, no truncation. The whole point of this control is that page 7 is one tap
 * from page 1, and a window is the thing being removed. A long range wraps onto more lines
 * (`flex-wrap`) rather than collapsing or scrolling sideways. The page sizes in use (25-120 rows)
 * bound the real counts; `PAGE_CEILING` is a defence against a hand-typed `?page=`, not a
 * collection size.
 */
```

**Impact:** comment only. No behaviour, no type, no class. It stops the file from arguing a fact
Step 2 makes untrue.

---

### Step 2: The cell — 30.8 px, circular, and the argument for why it may be

**File:** `components/ui/Pagination.tsx:51-58`

**Change:** Replace the five-line docstring (`:51-55`) and the three-line `CELL` assignment
(`:56-58`) — lines 51 through 58 inclusive — with the block below. The
docstring is where the decision gets recorded, because this is the file the next person to notice
the tap-floor violation will open.

**Code:** the complete replacement for lines 51–58:

```tsx
/**
 * ── 30.8 px, AND YES, THAT IS BELOW THE TAP FLOOR ────────────────────────────────────────────
 * `1.925rem` is 44 × 0.7. It is spelled in rem, not px, so it tracks the root font scale exactly
 * the way the `min-h-11` it replaces did (`11` = `calc(var(--spacing) * 11)` = 2.75rem = 44 px);
 * a reader who scales text up still gets a proportionally bigger target.
 *
 * The repo owner asked for this on 2026-10-02, with the number in hand — "reduce their size, and
 * make it circular, make sure the circular button is 30% smaller" — after `/nina/about`'s Media
 * tab went from 7 pages to 13 and a row of thirteen 44 px slabs ate the screen. So this is the
 * ONE place in the app that goes under the 44 px iOS minimum (`components/ui/Button.tsx:13`,
 * `docs/design-brief.md:174`, `components/admin/touch.ts`), and it does so knowingly. Do not
 * "restore" the floor here: you would be reverting a request, not fixing a regression. What makes
 * it survivable is that the cells are separated by `gap-1` and that a mis-tap lands on a
 * NEIGHBOURING PAGE NUMBER — one tap to undo, nothing destructive, no state written. If the floor
 * is ever re-imposed on this control it has to be re-imposed by whoever asked for the exception.
 *
 * ── `min-h`/`min-w`, NEVER `h`/`w` ───────────────────────────────────────────────────────────
 * Unchanged from the 44 px era, for the same two reasons: a minimum cannot fight a wrapped row's
 * line height, and a long page number must be allowed to be wider than it is tall.
 *
 * ── WHY `px-1` AND `text-[12px]` MOVED WITH THE BOX ──────────────────────────────────────────
 * A 30.8 px *minimum* box means a short label sits inside a CIRCLE and a long one stretches it
 * into a pill. Stretching is correct — it is what `min-w` is for — but it should start as late as
 * possible. Poppins' digits are uniform-width at 600/1000 em (so `tabular-nums` is belt and
 * braces), a digit at 12 px advances 7.2 px, and `px-1` spends 4 px a side INSIDE the 30.8 because
 * preflight makes every box `border-box`:
 *
 *     1 digit    7.2 +  8 = 15.2 px  ->  min-w wins; a 30.8 x 30.8 circle
 *     2 digits  14.4 +  8 = 22.4 px  ->  circle
 *     3 digits  21.6 +  8 = 29.6 px  ->  circle, with 1.2 px to spare
 *     4 digits  28.8 +  8 = 36.8 px  ->  FIRST to stretch: a 36.8 x 30.8 pill
 *
 * Four digits is therefore the stated breaking point, and it is stated rather than discovered.
 * Keeping the old `px-2` + `text-[13px]` would have stretched at TWO digits (15.6 + 16 = 31.6 >
 * 30.8) — page 10 of today's thirteen — which is why the padding and the type are part of this
 * change and not a later tidy-up. 12 px semibold tabular digits stay legible on a phone; the app
 * already ships 11 px and 10 px labels, and the 16 px rule in `app/globals.css` is an INPUT rule
 * (Safari zooms on focusing a small form control) that a span, an anchor and a button never trip.
 *
 * ── `rounded-pill` AND NOT `rounded-full` ────────────────────────────────────────────────────
 * They render identically here — 999 px and `calc(infinity * 1px)` both clamp to half of a 30.8 px
 * box — so this is a vocabulary call, and the vocabulary is settled. `app/globals.css`'s
 * `@theme inline` ships a four-step radius ladder mirrored from `docs/design/tokens.css` (chip 8 /
 * field 14 / card 22 / pill 999), and every round CONTROL in the app spells `rounded-pill`:
 * `Composer.tsx`'s size-11 buttons, `Sheet.tsx`'s close, `Chip.tsx`, `CircleFrame.tsx`. Tailwind's
 * own `rounded-full` survives only on decorative 1-3 px dots. A pager cell is a control, and
 * `rounded-field` — the thing it replaces — is from the same ladder, so the diff stays inside one
 * vocabulary instead of straddling two.
 */
const CELL =
  'inline-flex min-h-[1.925rem] min-w-[1.925rem] items-center justify-center rounded-pill px-1 ' +
  'text-[12px] font-semibold tabular-nums'
```

**Impact:** every paginated surface in the app — `/nina/about`'s Media and Foto profil tabs,
`/admin/nina`, `/admin/photoshop`, `/admin/error-logs`, and `PhotoReferencePicker`'s two mounts —
draws a 30.8 px circular cell. Nothing else changes: the same element is rendered for the same
state, `ACTIVE`/`INACTIVE` are untouched, and no call site is recompiled differently. The one test
that asserts the old tokens goes red here and is fixed in Step 3.

---

### Step 3: Re-point the pinned tokens

**File:** `components/ui/Pagination.test.tsx:8-14` and `:90-98`

**Change:** The file's own header states its rule — it pins the class tokens that were *argued for*
rather than picked, and nothing else, so the suite is a test of the choices and not a snapshot of
the string. Three tokens now qualify: the two sizing minimums (re-measured) and the radius, which
stopped being a default the moment "circular" became a requirement. The test's name must move too:
"a 44px tap-target floor" is now the opposite of what the control does.

**Code:** the complete replacement for the header docstring, lines 8–14:

```tsx
/**
 * Component tests for the one numbered pager. What is pinned here is the *contract* phases 2-5
 * consume — every number rendered, the active cell non-interactive, the two mechanism arms — and
 * the class tokens that were argued for rather than picked (`bg-ink text-card`, the 30.8 px
 * `min-h-[1.925rem] min-w-[1.925rem]` pair, and `rounded-pill`). The rest of the class list is not
 * asserted, which would make this a snapshot of the string rather than a test of the choice.
 */
```

**Code:** the complete replacement for the size test, lines 90–98:

```tsx
  it('sizes every cell 30.8px and circular — the asked-for exception to the 44px floor', () => {
    render(
      <Pagination page={1} pageCount={3} label="Album pages" hrefForPage={(n) => `?page=${n}`} />,
    )

    for (const label of ['1', '2', '3']) {
      // 1.925rem is 44 x 0.7, in rem so it tracks the root scale the way `min-h-11` did, and it
      // is BELOW the app's 44px iOS floor on purpose — `Pagination.tsx`'s `CELL` docstring carries
      // the request and the arithmetic. A later reader restoring `min-h-11` lands here first.
      expect(screen.getByText(label)).toHaveClass('min-h-[1.925rem]', 'min-w-[1.925rem]')
      // "Circular" is the requirement, so the radius is an argued choice and belongs in the pin.
      expect(screen.getByText(label)).toHaveClass('rounded-pill')
      expect(screen.getByText(label)).not.toHaveClass('rounded-field')
    }
  })
```

**Impact:** `npx vitest run components/ui/Pagination.test.tsx` is green again. `toHaveClass` does
exact token matching on the class list, so the bracketed arbitrary values match as plain tokens with
no escaping. No other test in the repo reads this control's class string — verified: the only
`Pagination` reference outside `components/ui/` under `tests/` is
`tests/admin.photoGrid.test.ts:154`, which asserts the substring `<Pagination` (that the grid mounts
the shared control at all), and `tests/admin.shortcuts.test.ts:288`'s `min-h-11` assertion reads
`components/admin/ShortcutTable.tsx`, not this file.

---

### Step 4: Update the package readme's decision record

**File:** `components/ui/.workflows/package_readme.md:373-376` and `:381-384`

**Change:** Two bullets go stale at once. `:375-376` records the measured value; `:382-383` claims
`CELL` locally duplicates the 44 px tap floor, which stops being true in Step 2. Keep the
min-vs-fixed argument in the first (it is unchanged and still load-bearing) and keep the
import-boundary rule in the second (likewise) — only the facts around them move.

**Code:** the complete replacement for lines 373–376:

```markdown
- The active cell is `bg-ink text-card`, not `bg-accent`: the same measured contrast ruling as
  `Button`'s primary (white-on-cyan near 2:1, ink-on-card ~14:1, and it inverts in dark mode).
  Cells are `min-h-[1.925rem] min-w-[1.925rem]`, not `h-…`/`w-…` — a minimum cannot fight a
  wrapped row's line height, and a long page number must be allowed to be wider than it is tall.
- **The cell is 30.8 px, circular, and below the 44 px tap floor on purpose.** `1.925rem` is
  44 × 0.7, spelled in rem so it tracks the root scale the way `min-h-11` did; `rounded-pill` is
  the radius every round control in the app already uses. The owner asked for exactly this on
  2026-10-02 once `/nina/about`'s Media tab reached 13 pages. It is the only place in the app under
  the iOS minimum, so **do not "restore" `min-h-11` here** — you would be reverting a request.
  `px-1` and `text-[12px]` moved with the box so a three-digit page still sits inside the circle
  and four digits is the first to stretch it into a pill; `Pagination.tsx`'s `CELL` docstring
  carries that arithmetic digit by digit, and `Pagination.test.tsx` pins all three tokens.
```

**Code:** the complete replacement for lines 381–384:

```markdown
- **It must not import `components/admin/*`.** `ui` importing `admin` is an inverted dependency, so
  `CELL` spells its own geometry rather than borrowing `admin/touch.ts`'s `TOUCH_ICON` — and since
  the 30.8 px change the two are not even the same geometry, because `TOUCH_ICON` is the 44 px
  floor and this control is the sanctioned exception to it. They are meant to disagree; do not
  reconcile them by import. The whole import list is a type-only `react` import, `next/link` and
  `@/lib/cn` — keep it that short.
```

**Impact:** documentation. `*.md` is in `.prettierignore`, so `format:check` does not read it.

---

### Step 5: Record the exception in the authoritative doc

**File:** `docs/architecture.md:325` and a new bullet after `:335`

**Change:** §8's "Pagination — one control, five surfaces" paragraph lists three things that are
deliberate and easy to "fix" wrongly. A cell deliberately below the app's own tap floor is a fourth,
and it is the one most likely to be "fixed" by a reader doing an accessibility pass. `docs/` is
excluded from prettier (`.prettierignore`), so wrap by hand to the file's ~98-column prose width.

**Code:** line 325 changes from

```markdown
it navigates. Three things are deliberate and easy to "fix" wrongly:
```

to

```markdown
it navigates. Four things are deliberate and easy to "fix" wrongly:
```

**Code:** the new fourth bullet, inserted immediately after the `hrefForPage` grammars bullet that
ends at line 335 (i.e. between `:335` and the blank line `:336`):

```markdown
- **The cell is 30.8 px and circular, below the 44 px tap floor, on purpose.**
  `min-h-[1.925rem] min-w-[1.925rem] rounded-pill px-1 text-[12px]` — 44 × 0.7, asked for by the
  repo owner with that number on 2026-10-02, once `/nina/about`'s Media tab reached 13 pages and a
  row of thirteen 44 px slabs ate the screen. It is the **only** place in the app that goes under
  the iOS minimum (`components/ui/Button.tsx:13`, `docs/design-brief.md:174`,
  `components/admin/touch.ts`), which makes it the one most likely to be "corrected" by an
  accessibility sweep. It must not be: a mis-tap lands on a neighbouring page number and costs one
  tap. The padding and type moved with the box so a three-digit page still sits inside the circle
  and four digits is the first to stretch it to a pill; `Pagination.tsx`'s `CELL` docstring has the
  arithmetic and `Pagination.test.tsx` pins the three tokens.
```

**Impact:** documentation. `docs/architecture.md` is the repo's stated top authority for "how does X
actually work today" (`CLAUDE.md`), so the exception is recorded where the next reader looks first.

---

## Verification

**Build:** `npm run typecheck` — `next typegen && tsc --noEmit`, which is the real gate; vitest does
not typecheck. (`npm run build` also passes but is not the gate.)

**Tests, in the order they should be run:**

```bash
npx vitest run components/ui/Pagination.test.tsx    # the file this phase edits; must be green first
npx vitest run components/nina/NinaAboutScreen.test.tsx  # the only call-site suite that renders the pager
npm test                                            # full unit sweep, fake DB driver, no network
npm run typecheck
npm run lint
npm run format:check
npm run knip
```

`NinaAboutScreen.test.tsx` is listed because it mounts the `onPage` arm and is the one place a
class-string change could surprise a call site. It asserts no `CELL` token, so it must pass
unchanged — if it does not, the change reached further than this phase's contract allows. Note that
phase 1 also edits that file; if phase 1 has already landed, run it anyway and expect green from
*its* assertions, not this phase's.

`npm run knip` is in the list because this phase creates no export and deletes none — a knip finding
here would mean something was added that should not have been.

**Manual check** (optional, and the only way to see the thing the user asked for):

```bash
npm run dev
```

Then `/nina/about` → the **Media** tab, which is the surface that prompted the request. Confirm by
eye and with devtools:

1. Each cell measures **30.8 × 30.8** px for pages 1–9 (computed style, not the rendered box of a
   wrapped row).
2. The cells are circles, not rounded squares — `border-radius: 999px`.
3. Pages **10–13** are still circles, not lozenges (the 22.4 px two-digit case from the table
   above).
4. The active cell is still `bg-ink text-card` and still a `<span aria-current="page">`.
5. The row still wraps rather than scrolling sideways; still no ellipsis.
6. Spot-check one `hrefForPage` surface too — `/admin/error-logs` is the Server Component arm and
   proves the change reached the non-client graph.

**Exit criteria:** every pagination in the app draws a 30.8 px circular cell; exactly one
implementation file changed and not one of the five call sites; `Pagination.test.tsx` pins
`min-h-[1.925rem]`, `min-w-[1.925rem]` and `rounded-pill`; the below-the-floor decision is written
in `Pagination.tsx`, `components/ui/.workflows/package_readme.md` and `docs/architecture.md`; all
seven commands above green.

## Handoffs

- **R1 (`/nina/about` Media parity) is entirely Phase 1's.** This phase makes the 13-page row
  *tolerable*; it does nothing to make it 13 pages. Nothing here reads or writes
  `NINA_ABOUT_MEDIA_PAGE_SIZE`, the media cookie, or any `/nina/about` file.
- **`components/admin/touch.ts`'s `TOUCH_ICON` string is no longer a prefix of `CELL`.** That was
  never asserted anywhere — it was prose coincidence, noted in `NUMBERED_PAGINATION_PLAN.md:425` —
  and after this phase the two constants deliberately disagree. Left alone: `TOUCH_ICON` is
  admin-scoped and still correct at 44 px for admin icon buttons. If a future reader wants one
  shared geometry constant, that is a new decision about the tap floor, not a cleanup.
- **`components/ui/Chip.tsx:16`'s `h-11 rounded-pill` and the package readme's note that "the 44 px
  floor wins over the design's nicer 32 px pill" (`:347-348`)** now sit next to a control that took
  the opposite ruling. Deliberately not touched: the user asked about pagination, and a chip is a
  filter toggle whose mis-tap re-filters a list rather than moving one page. If the owner wants the
  smaller chip too, that is a new request and a new phase.
- **No ellipsis/windowing reconsideration.** 13 pages at 30.8 px is ~400 px of cells plus gaps —
  one row on most phones, two at worst, which is what `flex-wrap` is for. The "every number,
  always" rule is untouched and must stay untouched.
- **No theme token added.** `--radius-pill` already existed and `1.925rem` is a one-site number; a
  `--radius-pager` or a `--size-pager-cell` would be a token with one consumer. `app/globals.css`
  is not edited by this phase.

## Rollback

`git revert` the phase's single commit, or by hand:

1. `components/ui/Pagination.tsx` — restore `CELL` to
   `'inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-2 ' + 'text-[13px] font-semibold tabular-nums'`
   and restore the two comment blocks (`:6-25` header, `:51-55` docstring) from git history.
2. `components/ui/Pagination.test.tsx` — restore the header and
   `expect(screen.getByText(label)).toHaveClass('min-h-11', 'min-w-11')` under the old test name.
3. `components/ui/.workflows/package_readme.md` and `docs/architecture.md` — restore the two
   paragraphs and drop the new bullet; set "Four things" back to "Three things".

Nothing is persisted, migrated, written to the database, or shipped to a device: the whole phase is
CSS class strings and prose. Reverting it is complete and instantaneous, and it does not interact
with Phase 1 in either direction — the two commits touch disjoint files and can be reverted
independently in any order.
