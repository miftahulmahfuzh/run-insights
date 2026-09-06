# Phase 2: Admin surfaces: explorer, crop studio, tables, dials

**Plan set:** `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md`
**Analysis:** `20260906-205048-K4M2_code_analyzer.md`
**Satisfies:** R1 — `/admin` is usable one-handed on an iPhone XS Max in Safari (414 × 896, touch)
**Depends on:** Phase 1 (shell, nav, page containers) — lands first
**Difficulty:** HARD
**Package:** `components/admin`

---

## Goal

Every interactive admin surface below the shell becomes operable with a thumb at 414 CSS px. The
three-pane file explorer collapses to one column with the folder rail as a drawer; `CropStudio`
grows pinch-to-zoom, a multi-touch-safe pointer model and an iOS-callout-proof frame; the memory
table scrolls inside its own box at roughly half its former width and stops zooming the viewport on
every cell focus; and every glyph control that was 16–24 px becomes 44. `DialSlider` gains the tap
target *and* the header-row geometry phase 4's per-parameter toggle needs, so phase 4 adds a control
and moves no layout.

---

## Boundary notes the reconciler needs

1. **Phase 1's plan file did not exist when this was written.** `app/admin/layout.tsx` and
   `AdminNav.tsx` were read as they stand on `origin/main` @ `02dc79a`. Both are *already* partly
   responsive there: the layout is `grid-cols-1 … lg:grid-cols-[224px_minmax(0,1fr)] gap-6 p-6
   lg:gap-8 lg:p-8`, and the nav already carries `lg:` prefixes. This phase therefore adopts **`lg`
   (Tailwind default, 64rem / 1024 px) as the one desktop breakpoint**, matching the shell it sits
   inside. See **Requires** below — if phase 1 moves that breakpoint, every `lg:` written here moves
   with it, mechanically, and nothing else about this phase changes.

2. **The width budget this phase designs against** is 414 − 2 × 24 (`p-6`) = **366 CSS px** of
   content. Nothing below depends on that number exactly; every layout is fluid, `min-w-0`, or
   `max-w-[…]`-bounded. It is stated so phase 1 knows what breaks if it drops base padding to
   `p-4` (nothing) or raises it (still nothing — the grids reflow).

3. **`app/globals.css` is not touched.** `--safe-top` / `--safe-bottom` are consumed here through
   the repo's existing `pb-[calc(1rem+var(--safe-bottom))]` idiom
   (`app/x/[extractionId]/page.tsx:81`, `components/ui/Sheet.tsx:134`), never redefined.

4. **No Next.js API is added.** Only `useState`/`useRef`/`useEffect`/`useCallback` (all already in
   these files), `Link`, and Tailwind classes. `node_modules/next/dist/docs/` is absent in this
   worktree (`node_modules` is not installed yet), and nothing here is version-sensitive to Next
   16.3.1 — the version-sensitive advice already in these files (server actions dispatched one at a
   time; `revalidatePath` returning an RSC payload) is quoted, not changed.

5. **`cn` is a plain join, not `tailwind-merge`** (`lib/cn.ts` says so explicitly). Conflicting
   utilities are resolved by **Tailwind's emission order, not by class order**, so this phase never
   relies on "my class comes last". Where a conflict was unavoidable it is removed rather than
   layered — see Step 8's `min-h-[34px]` and Step 8's `h-8`. Consequence: `prettier-plugin-tailwindcss`
   re-sorting class attributes cannot change behaviour here. Run `npm run format` at the end anyway.

---

## Interface Contract

**Creates:**
- `components/admin/touch.ts` — new module, zero imports, no `'use client'`
  - `TOUCH_TARGET` (`'min-h-11'`)
  - `TOUCH_ICON` (`'inline-flex min-h-11 min-w-11 items-center justify-center'`)
- *(RECONCILED — a `DialSliderProps.leading?: React.ReactNode` slot was proposed here and is
  **not** created. Phase 4 owns the toggle affordance per the plan index's phase-4 **Owns** line,
  and renders the checkbox inside `DialSlider` from an `enabled` / `onEnabledChange` prop pair —
  which it needs anyway for the greyed track, the struck label and the `off` readout, none of
  which a `ReactNode` slot can carry. A `leading` prop would have been dead API. What this phase
  DOES leave phase 4 is the **header-row geometry** below, which is the load-bearing half.)*
- **`DialSlider`'s header row becomes `flex items-center gap-2` with the readout pushed right by
  `ml-auto`** (`components/admin/DialSlider.tsx`) — it is `items-baseline justify-between` on
  `origin/main`. **This is the seam phase 4 needs**: a checkbox has no baseline worth aligning to,
  and `items-center` + `ml-auto` means a control of any height can join the head of that row
  without dragging the label's baseline around. Phase 4 adds its checkbox and moves no layout.
- `FileExplorer` local state `treeOpen: boolean` + toolbar button `Folders` / `Hide folders`
  (`lg:hidden`), and `id="admin-folder-rail"` on the rail wrapper it controls.

**Signature changes:**
- **none.** `DialSliderProps` is unchanged by this phase; every edit to that file is a class string
  or a comment. `CharacterPanel.tsx` is **not** edited and does not need to be.

**Deletes:** *(no exported symbol is deleted)*
- Removed markup only: `MemoryTable.tsx`'s `<colgroup>` (its widths move onto the `<th>`s so that
  two columns can be hidden below `lg` without breaking positional column mapping);
  `MemoryTable.tsx:614`'s `h-8 px-2` height override on the AddRow `+` button;
  `MemoryTable.tsx:408`'s `min-h-[34px]`.

**Renames:** none.

**Requires (from earlier phases):**
- **Phase 1 keeps `lg` as the admin shell's desktop breakpoint.** Every `lg:` in this phase is
  chosen to switch on the same line as `app/admin/layout.tsx`'s own
  `lg:grid-cols-[224px_minmax(0,1fr)]`. If phase 1 picks `md` or `xl`, this phase's `lg:` prefixes
  must be replaced with the same token — a pure find-and-replace, no logic changes.
- **Phase 1 keeps `<main className="min-w-0">`** in `app/admin/layout.tsx:53`. Every overflow
  container here (the memory table, the photo grids, the explorer's content pane) relies on the
  main column not blowing out its grid track. The comment already on that line says the same thing.
- **RECONCILED — phase 1 DOES add a fixed bottom element, and this phase accounts for it.** The
  draft of this bullet assumed the opposite. Phase 1's shell puts `AdminNav` at
  `fixed bottom-0`, `h-14` (56 px) + `border-t` (1 px), `z-30`, below `lg` only; at `lg` and up it
  is the unchanged `lg:sticky lg:top-8` rail. Two consequences, both already folded into the steps
  below:
  - `explorer/UploadQueue.tsx` is `sticky bottom-0` and would park **underneath** that bar. Step 6
    offsets it by the bar's height below `lg` and returns it to `bottom-0` at `lg`.
  - `FolderMenu`'s panels are `z-20` and would paint **under** a `z-30` bar wherever they overlap
    it. Step 13 raises them to `z-40`. `z-20` is the only z-index in `components/admin/` on
    `origin/main`, so nothing else in this package needs the same treatment.
- **Phase 1 keeps the bar at `h-14` + `border-t` and `z-30`.** Those two numbers are quoted in
  Step 6's `calc()` and Step 13's stacking respectively. If phase 1 changes either, both follow
  mechanically — 3.5rem is `h-14`, and the panels only need to exceed whatever the bar's `z` is.

**Leaves alone (owned by others):**
- `app/admin/layout.tsx`, `components/admin/AdminNav.tsx`, `app/admin/page.tsx`,
  `app/admin/nina/page.tsx`, `app/admin/photos/page.tsx`, `app/admin/memory/page.tsx` — Phase 1
- `components/admin/CharacterPanel.tsx` — Phase 4 (state model *and* structure). Untouched here;
  the header-row geometry above exists precisely so phase 4 need not renegotiate `DialSlider`'s
  layout. Phase 4 adds the `enabled` / `onEnabledChange` props to `DialSlider` itself and wires them
  from `CharacterPanel`; this phase adds no prop and opens neither question.
- `lib/nina/*`, `lib/admin/*`, `lib/nina/crop.ts` — Phases 3/4/5 and out of scope. **No file under
  `lib/` is edited by this phase**, including `lib/nina/crop.ts`: the pinch gesture is expressed as
  a ratio fed to the existing `zoomCrop`, so no new pure helper is needed.
- `tests/` — no test file is created or edited. `tests/admin.responsive.test.ts` is deliberately
  *not* created; see Handoffs, where the reconciler's ruling on it is recorded.
- `components/admin/chatPhotoUpload.ts`,
  `components/admin/explorer/{model.ts,dropWalk.ts,useFolderUpload.ts}` — no responsive surface;
  none of them renders. (`ShareToNinaItem.tsx` moved OUT of this list during reconciliation and
  into the Files table as an explicit no-change row with its reason — phase 1's handoff flagged it
  as owned by nobody, and "unnamed" and "checked and fine" must not look the same.)

---

## Files

| File | Action | What changes |
|---|---|---|
| `components/admin/touch.ts` | create | `TOUCH_TARGET` / `TOUCH_ICON` — the 44 px rule, spelled once |
| `components/admin/FileExplorer.tsx` | modify | toolbar reflows; folder rail becomes a drawer below `lg`; grid is one column below `lg` |
| `components/admin/explorer/FolderTree.tsx` | modify | `Row` is 44 px tall; chevron and spacer are 44 px |
| `components/admin/explorer/PhotoGrid.tsx` | modify | pager links/labels get 44 px hit boxes |
| `components/admin/explorer/SelectionPane.tsx` | modify | scrolls itself into view; 44 px close; `p-4 lg:p-5` |
| `components/admin/explorer/UploadQueue.tsx` | modify | clears the home indicator; headline gets its own row; 44 px toggle; contained scroll |
| `components/admin/CropStudio.tsx` | modify | multi-pointer model, pinch-to-zoom, iOS callout suppressed, 44 px zoom slider |
| `components/admin/MemoryTable.tsx` | modify | 16 px cell controls below `lg` (the iOS zoom bug), `colgroup` → `<th>` widths, Origin/When hidden below `lg`, `min-w-[420px]`, 44 px delete and add |
| `components/admin/ChatPhotoGrid.tsx` | modify | pager hit boxes; `gap-4 lg:gap-5` |
| `components/admin/ChatPhotoDetail.tsx` | modify | scrolls itself into view; 44 px close; `p-4 lg:p-5` |
| `components/admin/PhotoMoveBar.tsx` | modify | destination `<select>` is full width below `sm` |
| `components/admin/DialSlider.tsx` | modify | 44 px track and reset link; header row becomes `items-center` + `ml-auto` (the geometry phase 4's toggle needs). **No prop change** |
| `components/admin/FolderMenu.tsx` | modify | 44 px trigger and menu rows; panels capped to the viewport |
| `components/admin/UserPicker.tsx` | modify | 44 px chips |
| `components/admin/ChatPhotoControls.tsx` | **no change** | already `Button size="md"` (44 px) throughout |
| `components/admin/ChatPhotoAdd.tsx` | **no change** | already `Button size="md"` |
| `components/admin/CircleFrame.tsx` | **no change** | non-interactive; the box must stay square (its own docstring) |
| `components/admin/ShareToNinaItem.tsx` | **no change** | RECONCILED-IN. Its single element is `buttonClasses({ variant: 'secondary', size: 'md', fullWidth: true })`, and `SIZES.md` in `components/ui/Button.tsx:42` is `h-11 px-4` — 44 px tall and full width already. There is no second interactive element and no layout of its own: it renders one button into whatever stack its caller lays out. Nothing to make responsive. |
| `components/admin/.workflows/package_readme.md` | modify | RECONCILED-IN, Step 15. Phases 1 and 2 both falsify it; one pass at the end of the later phase beats two conflicting ones |

15 files touched (14 source + 1 document); 4 read and deliberately left alone.

---

## Implementation Steps

### Step 1: The 44-pixel rule, spelled once

**File:** `components/admin/touch.ts` (new)
**Change:** One zero-import module holding the two class strings every non-`Button` control in
`components/admin/` borrows. `Button size="md"` is already `h-11` (`components/ui/Button.tsx:13`,
*"`md` = 44px — the iOS minimum tap target, never less"*); this is the same number for the controls
that are not buttons.

**Decision, recorded here because it shows up in twelve files:** these are **unconditional**, not
`lg:min-h-0`-guarded. The operator is the only user of `/admin` and he is on a phone; a 44 px
chevron on a desktop is not a regression, and two sizes of every glyph doubles the surface a later
phase has to reason about. The one place density is preserved at `lg` is the memory table, where
44 px rows genuinely destroy the scanability the table exists for — and that is stated at its own
step.

**Code:**

```ts
/**
 * The 44-pixel rule, spelled once.
 *
 * `docs/design-brief.md` and `components/ui/Button.tsx:13` already name 44 px as the iOS minimum
 * tap target — `Button size="md"` IS `h-11`, and every `Button` in `components/admin/` already
 * passes it. What was left over is everything that is NOT a `Button`: a chevron, a `×`, a `…`, a
 * `✕`, a pager link, a folder row, a filter chip. Those were written against a mouse and land
 * between 16 px and 24 px on their smallest axis. These two strings are what they borrow, so the
 * number lives in one place rather than in fourteen class attributes that will drift.
 *
 * ── `min-h-11` AND NOT `h-11` ───────────────────────────────────────────────────────────────
 * Several of these controls sit in a flex line whose height is decided by a sibling, or hold text
 * that may wrap to two lines. A fixed height would fight both. A minimum cannot.
 *
 * ── WHY THIS IS NOT IN `components/ui/` ─────────────────────────────────────────────────────
 * `DialSlider.tsx`'s header already argues the case and this file follows it unchanged: the UI
 * barrel is a load-bearing bundle boundary, ten `'use client'` files import it, and an
 * operator-only concern does not join it on the strength of one phase. When a runner-facing
 * control needs the same string, that is the moment to make the case, and it is one rename plus
 * one line in the barrel.
 *
 * No `'use client'`, for `Button.tsx`'s reason: nothing here is a hook or an effect, so the module
 * compiles into whichever graph imports it. `UserPicker.tsx` is a Server Component and imports it;
 * `DialSlider.tsx` is a client component and imports it.
 */

/**
 * A control that is already a block or a flex line — a folder row, a menu row, a text link that
 * has to be tappable. Gives it a floor of 44 px and leaves its width alone.
 */
export const TOUCH_TARGET = 'min-h-11'

/**
 * A glyph control — `×`, `…`, `✕`, a chevron, a pager arrow. 44 × 44 of hit area with the glyph
 * centred inside it, so the icon stays the size it was drawn and only the box around it grows.
 * `inline-flex` rather than `flex` because most of these sit inline in a sentence or a table cell.
 */
export const TOUCH_ICON = 'inline-flex min-h-11 min-w-11 items-center justify-center'
```

**Impact:** New module. Nothing imports it until Steps 2–13 do.

---

### Step 2: The explorer stacks, and the folder rail becomes a drawer

**File:** `components/admin/FileExplorer.tsx:1-20` (imports), `:96` (state), `:213-350` (render)

**Change:** Three things. The toolbar becomes two rows below `lg` and is byte-identical at `lg`
(via `lg:contents`). The folder rail is hidden behind a `Folders` button below `lg`, and is always
a column at `lg`. The three-column grid is `grid-cols-1` below `lg`.

**2a — imports: NONE.** `FileExplorer.tsx`'s import block is unchanged. It is called out explicitly
because every other step in this phase adds `@/components/admin/touch` and this one must not: the
only new control here is a `Button size="md"`, which is already 44 px, and the breadcrumb link uses
`py-3` rather than `TOUCH_TARGET` for the `truncate` reason given in 2c's comment. An unused import
fails `npm run lint`.

**2b — state.** Insert immediately after `const dragDepth = useRef(0)` (line 96):

```tsx
  /**
   * The folder rail's visibility BELOW `lg`, where the explorer is one column and the rail would
   * otherwise be a hundred rows of chrome sitting on top of the photographs.
   *
   * Closed by default, and that is not a compromise: the breadcrumb directly above already answers
   * "where am I", and the question a file manager gets asked on a 414 px screen is "show me this
   * folder's photos", not "show me the whole tree". Opening it is one tap, and it stays open until
   * it is shut — so a session spent reorganising folders is not a session spent re-opening a
   * drawer.
   *
   * `lg:` classes and NOT a `matchMedia` hook. At and above `lg` the rail is always rendered and
   * this flag is inert, so there is no breakpoint to observe, nothing to hydrate against, and no
   * first frame where the desktop layout is missing a column. The rail also stays in the DOM at
   * every width, which is what keeps `FolderTree`'s expansion overrides and an open `FolderMenu`
   * panel alive across a toggle instead of remounting them.
   */
  const [treeOpen, setTreeOpen] = useState(false)
```

**2c — the toolbar.** Replace lines 216–271 (`<div className="mb-4 flex flex-wrap …">` through its
closing `</div>`) with:

```tsx
      {/* ── TOOLBAR ─────────────────────────────────────────────────────────────────────────
          Two rows below `lg` — crumbs over controls — and one flex line at `lg`, unchanged from
          what shipped. `lg:contents` on the control group is what buys that: at `lg` the wrapper
          stops generating a box and its five children become direct items of the toolbar's flex
          line again, in the same order, with the same gap. The alternative was a `basis-full
          lg:basis-auto` on the crumbs, which puts `flex` (a shorthand that sets `flex-basis`) and
          `flex-basis` in the same declaration and leaves the winner to Tailwind's emission order —
          and `lib/cn.ts` is a plain join, so there is no merge library to arbitrate that. */}
      <div className="mb-4 space-y-2 lg:flex lg:flex-wrap lg:items-center lg:gap-3 lg:space-y-0">
        <nav aria-label="Breadcrumb" className="min-w-0 lg:flex-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] font-medium">
            {trail.map((crumb, index) => (
              <li key={crumb.path} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span className="text-ink-3">/</span>}
                {crumb.isCurrent ? (
                  <span className="truncate font-semibold text-ink" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  /* A crumb is the primary way back up the tree on a phone, so it is a tap target
                     and not a 16 px word. `py-*` and not `TOUCH_ICON`: `truncate` needs a block,
                     and a flex box would make the text an anonymous flex item that `text-overflow`
                     never reaches. */
                  <Link
                    href={hrefFor(crumb.path)}
                    className="block min-w-0 truncate py-3 text-accent"
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-2 lg:contents">
          <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
            {page.total} in this folder
          </span>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={onPickFolder}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={onPickFolder}
          />

          {/* The drawer's handle. It does not exist at `lg`, where the rail is a column that is
              always on screen — so `aria-expanded` never lies about a control the operator can
              still see. */}
          <Button
            size="md"
            variant="secondary"
            className="lg:hidden"
            aria-expanded={treeOpen}
            aria-controls="admin-folder-rail"
            onClick={() => setTreeOpen(!treeOpen)}
          >
            {treeOpen ? 'Hide folders' : 'Folders'}
          </Button>

          <Button size="md" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Add photos
          </Button>
          <Button size="md" onClick={() => folderInputRef.current?.click()}>
            Add a folder
          </Button>
          <Button
            size="md"
            variant="ghost"
            aria-pressed={detailOpen}
            onClick={() => setDetailOpen(!detailOpen)}
          >
            {detailOpen ? 'Hide details' : 'Show details'}
          </Button>
        </div>
      </div>
```

**2d — the columns.** Replace lines 273–289 (the `{/* ── THE THREE COLUMNS ── */}` comment, the
grid `<div>` and the `<FolderTree …/>` call) with:

```tsx
      {/* ── THE COLUMNS ─────────────────────────────────────────────────────────────────────
          Two rails and a canvas at `lg`, exactly as `app/admin/layout.tsx` argued for. ONE column
          below it, in DOM order: rail (hidden unless opened), content, details. R1 revisits F33
          R23's *"this UI is for desktop"* premise, not the desktop layout it produced — the tracks
          at `lg` are the same three, at the same widths. */}
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4 lg:gap-5',
          detailOpen && selected != null
            ? 'lg:grid-cols-[200px_minmax(0,1fr)_320px]'
            : 'lg:grid-cols-[200px_minmax(0,1fr)]',
        )}
      >
        <div id="admin-folder-rail" className={cn(treeOpen ? 'block' : 'hidden', 'lg:block')}>
          <FolderTree
            folders={folders}
            current={folder}
            hrefFor={hrefFor}
            allFolders={allFolders}
            onNavigate={navigateToFolder}
            onFolderCreated={addPendingFolder}
          />
        </div>
```

Everything from line 291 (`<div className="min-w-0" onDragEnter={…}`) to the end of the function is
unchanged.

**Impact:** At `lg` and above the explorer renders identically to today. Below `lg` it is a single
column, the rail is a drawer, and the toolbar is two rows. `PhotoGrid`, `SelectionPane`,
`UploadQueue` and `PhotoMoveBar` are untouched by this step and handled in their own.

---

### Step 3: Folder rows are 44 px

**File:** `components/admin/explorer/FolderTree.tsx:1-10` (imports), `:241-293` (the `Row` return)

**Change:** The row is a 44 px line; the chevron is a 44 × 44 hit box around the same 6 px glyph;
the leaf spacer matches it so labels stay aligned; the label link fills the row's height without
losing `truncate`.

**3a — imports.** Line 6 becomes two lines:

```tsx
import { FolderMenu } from '@/components/admin/FolderMenu'
import { TOUCH_ICON } from '@/components/admin/touch'
```

**3b — the `Row` body.** Replace lines 241–293 (the whole `return ( … )` of `function Row`) with:

```tsx
  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-1 rounded-chip pr-1',
        active ? 'bg-accent-soft' : 'hover:bg-paper-2',
      )}
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {/* The spacer matches the chevron's new box exactly, which is the whole point of it: a leaf
          and its expandable sibling have to put their labels on the same x. */}
      {chevron === 'none' ? (
        <span className="w-11 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={onToggle == null}
          aria-label={chevron === 'open' ? `Collapse ${label}` : `Expand ${label}`}
          className={cn(TOUCH_ICON, 'shrink-0 text-ink-3 disabled:opacity-40')}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block border-y-[4px] border-l-[6px] border-y-transparent border-l-current transition-transform',
              chevron === 'open' && 'rotate-90',
            )}
          />
        </button>
      )}

      {/*
       * `py-3` and NOT `TOUCH_TARGET` + `flex items-center`. `truncate` is
       * `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, and on a flex container the
       * text becomes an anonymous flex item that `text-overflow` never applies to — the label
       * would clip with no ellipsis. Padding keeps the link a block, keeps the ellipsis, and
       * 12 + ~20 + 12 is the 44 px the row is asking for.
       */}
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'min-w-0 flex-1 truncate py-3 text-[13px] font-medium',
          active ? 'text-ink' : 'text-ink-2',
        )}
        title={label}
      >
        {label}
      </Link>

      <span className="shrink-0 px-1 text-[11px] font-semibold text-ink-3 tabular-nums">
        {count}
      </span>

      {/* PHASE 6. The per-folder menu — New subfolder / Rename / Move to… / Delete. Its trigger is
          the `…` on this line; its panels overlay the rail (see `FolderMenu`'s header). Step 13
          gives that trigger its own 44 px box, which is why this row's `pr-2` became `pr-1`. */}
      <FolderMenu
        folder={path}
        folders={allFolders}
        photoCount={totalCount}
        onNavigate={onNavigate}
        onFolderCreated={onFolderCreated}
      />
    </div>
  )
```

**Impact:** The rail is taller at every width. At depth 3 the chrome is 36 (indent) + 44 (chevron)
+ ~24 (count) + 44 (menu) = 148 px, leaving ~218 px for a truncated label at 366 px — enough, and
the label carries `title` for the rest.

---

### Step 4: The explorer pager is tappable

**File:** `components/admin/explorer/PhotoGrid.tsx:1-8` (imports), `:120-148` (the pager)

**Change:** The four pager elements are 12 px words with no box. They get 44 × 44. The tile grid
(`minmax(88px,1fr)`) already yields three ~106 px tiles at 366 px and is not touched.

**4a — imports.** Insert after line 5:

```tsx
import { TOUCH_ICON } from '@/components/admin/touch'
import { ButtonLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'
```

(`cn` is already imported at line 6; the new line is the `touch` import, placed above the
`@/components/ui` import to keep the existing alphabetical grouping.)

**4b — the pager.** Replace lines 120–148:

```tsx
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-rule pt-3">
        {page.page > 1 ? (
          <Link
            href={hrefForPage(page.page - 1)}
            className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
            rel="prev"
          >
            &lsaquo; Newer
          </Link>
        ) : (
          /* The disabled end of the pager keeps the same box, so the row does not resize and the
             live control does not move under a thumb when the page changes. */
          <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
            &lsaquo; Newer
          </span>
        )}

        <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
          {first}&ndash;{last} of {page.total}
        </span>

        {page.page < lastPage ? (
          <Link
            href={hrefForPage(page.page + 1)}
            className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
            rel="next"
          >
            Older &rsaquo;
          </Link>
        ) : (
          <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
            Older &rsaquo;
          </span>
        )}
      </div>
```

**Impact:** The pager row grows from ~16 px to 44 px. `gap-3` → `gap-2` so the three items still
fit on one line at 366 px.

---

### Step 5: The details rail brings itself into view

**File:** `components/admin/explorer/SelectionPane.tsx:1-18` (imports), `:75` area (new effect),
`:93` (`<aside>`), `:103-110` (close button)

**Change:** Below `lg` the rail is not a column beside the grid — it is a block under it. Tapping a
photograph two screens down opens a pane the operator cannot see, which reads as *nothing
happened*. `scrollIntoView({ block: 'nearest' })` is the whole fix and is a no-op at `lg`.

**5a — imports.** Lines 3 and 5–8 become:

```tsx
import { useEffect, useRef, useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { ShareToNinaItem } from '@/components/admin/ShareToNinaItem'
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button } from '@/components/ui'
```

and line 16 gains `cn`:

```tsx
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'
```

**5b — the effect.** Insert immediately after the `run()` helper's closing brace (the blank line
before the `/* folderBreadcrumbs (phase 2's name; …) */` comment, around line 80):

```tsx
  /**
   * The rail scrolls itself into view when the selection changes.
   *
   * Below `lg` this `<aside>` is the third block of a single column, under a grid of up to 120
   * tiles. Tapping a photograph near the bottom of that grid opens a pane a screen and a half
   * further down, and the screen does not move — which is indistinguishable from a broken button.
   *
   * `block: 'nearest'` is why this can run unconditionally instead of behind a breakpoint check:
   * at `lg` the pane is already beside the grid and fully visible, and `nearest` on a fully
   * visible element scrolls nothing. So there is no media query to observe and the desktop scroll
   * position is never touched.
   *
   * Keyed on `photo.id`, not on mount. The rail is REUSED when the selection moves from one
   * photograph to another — `FileExplorer` renders one `SelectionPane` and swaps its `photo` —
   * so the second selection deserves the same courtesy as the first.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [photo.id])
```

**5c — the `<aside>` and its close button.** Replace lines 93–110:

```tsx
    <aside ref={paneRef} className="rounded-card border border-rule bg-card p-4 lg:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink" title={photo.filename}>
            {photo.filename}
          </p>
          <p className="truncate text-[12px] font-medium text-ink-3" title={trail}>
            {trail}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the details pane"
          className={cn(TOUCH_ICON, '-mt-2 -mr-2 shrink-0 text-[15px] font-semibold text-ink-3')}
        >
          &times;
        </button>
      </div>
```

(The negative margins pull the now-44 px box back into the card's padding so the `×` sits where it
always did optically, rather than pushing the filename down by 20 px.)

**Impact:** Selecting a photo on a phone lands the operator on the crop studio. Everything below —
the framing buttons, the two `CircleFrame` sanity circles, the `<dl>`, the action stack — is
already `Button size="md"` or non-interactive and needs no change.

---

### Step 6: The upload queue clears the nav bar and the home indicator

**File:** `components/admin/explorer/UploadQueue.tsx:1-10` (imports), `:93-110`, `:159`

**Change:** The queue is `sticky bottom-0`. Two things are underneath it on an iPhone XS Max and
both have to be got out from under: **phase 1's fixed nav bar** (`h-14` = 56 px + a 1 px `border-t`,
`z-30`, below `lg` only) and the home indicator. So below `lg` the queue's sticky anchor moves up by
the bar's height and it keeps padding `--safe-bottom` for the indicator; at `lg` and up the bar is a
left rail again and the anchor returns to `bottom-0`. Its headline also gets its own row below `lg`,
its "Show the list" toggle gets a 44 px box, and its expandable list stops scroll-chaining to the
page.

**This is the one concrete phase-1 ↔ phase-2 collision phase 1's handoff named**, and this step is
where it is paid: `bottom-[calc(3.5rem+var(--safe-bottom))] lg:bottom-0`. `3.5rem` is `h-14`
spelled in the unit the bar is written in; the `border-t` is one pixel and is deliberately not in
the `calc()` — the queue's own `shadow-card` reads better overlapping a hairline than floating a
pixel above it, and a 1 px gap is not a tap target.

**6a — imports.** Insert before line 5:

```tsx
import { TOUCH_TARGET } from '@/components/admin/touch'
import { Button } from '@/components/ui'
```

**6b — the container and its header row.** Replace lines 93–110:

```tsx
    {/*
     * TWO offsets, and they answer two different obstacles.
     *
     * `bottom-[calc(3.5rem+var(--safe-bottom))] lg:bottom-0` is the STICKY ANCHOR. Below `lg` the
     * admin shell's nav is `fixed bottom-0 h-14 z-30` (phase 1), so an anchor of `bottom-0` parks
     * this panel behind it. `3.5rem` IS `h-14`. At `lg` the nav is a left rail again and the
     * anchor goes back to the bottom of the scrollport. `var(--safe-bottom)` is in the anchor as
     * well as in the padding because the nav bar itself sits above the home indicator — the bar's
     * top edge is `56px + inset` off the bottom of the viewport, and that is the line this panel
     * has to clear.
     *
     * `pb-[calc(1rem+var(--safe-bottom))]` is the PADDING — the repo's idiom for a bottom-stuck
     * element, the same one `app/x/[extractionId]/page.tsx:81` and `components/ui/Sheet.tsx:134`
     * use. It is kept for the `lg` case, where the anchor is `bottom-0` again and the Dismiss
     * button would otherwise land under the home indicator on a large touch screen. Below `lg` it
     * is redundant with the anchor and costs 34 px of padding on a panel that has room for it;
     * `p-4` still sets the other three sides, and `padding-bottom` is a longhand that Tailwind
     * emits after the `p-*` shorthand, which is why this reads as an override and behaves as one.
     */}
    <div className="sticky bottom-[calc(3.5rem+var(--safe-bottom))] mt-4 rounded-card border border-rule bg-card p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-card lg:bottom-0">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        {/*
         * `w-full lg:w-auto lg:min-w-0 lg:flex-1`: the headline is the sentence this component
         * exists for (see the header), and at 366 px it cannot share a line with a toggle and a
         * Dismiss button without becoming three words and an ellipsis. So it takes its own row
         * below `lg`. At `lg` the flex basis of 0% from `flex-1` decides the width and `w-auto`
         * is inert, which is the one ordering in flex layout that is specified rather than
         * emission-dependent.
         */}
        <p className="w-full text-[13px] font-semibold text-ink lg:w-auto lg:min-w-0 lg:flex-1">
          {headline({ phase, items, report, done, failed: failed.length })}
        </p>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={cn(TOUCH_TARGET, 'shrink-0 px-2 text-[12px] font-semibold text-accent')}
          >
            {open ? 'Hide the list' : 'Show the list'}
          </button>
        )}

        {!busy && (
          <Button size="md" variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
```

**6c — `cn` is now used, so import it.** Add after the `Button` import (6a):

```tsx
import type { UploadRefusal } from '@/lib/admin/filetree'
import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
import { cn } from '@/lib/cn'
```

**6d — the expanded list.** Replace line 159's opening tag (`<ul className="mt-3 max-h-64 …">`):

```tsx
        {/* `overscroll-contain` so reaching the end of a 12-row list inside a sticky panel does
            not hand the remaining scroll to the page underneath and yank the queue off screen —
            the specific way a nested scroller misbehaves on iOS. */}
        <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto overscroll-contain border-t border-rule pt-3">
```

**Impact:** The queue is fully reachable above **both** the nav bar and the home indicator, and its
headline is legible at 366 px. `headline()` and every other function in the file are unchanged. At
`lg` and up the rendered result is identical to `origin/main` plus the padding — the anchor is
`bottom-0` again and the new row-wrapping classes are all `lg:`-reverted.

---

### Step 7: The crop studio becomes a touch instrument

**File:** `components/admin/CropStudio.tsx` — whole file

**Change (the answer to "is it mouse-only?"): it is already Pointer Events, and that is the good
news.** `onPointerDown` / `onPointerMove` / `onPointerUp` / `onPointerCancel` with
`setPointerCapture` are already there (`:107-134`), and `touch-none` is already on the frame. There
is no mouse-to-pointer migration to do. What is missing for touch is four specific things, and the
file's own docstring names the second and third as deliberate deferrals whose premise R1 has now
removed:

1. **Multi-touch strands the drag.** `last` holds ONE pointer. A second `pointerdown` overwrites
   it, so landing a thumb mid-drag and lifting it again leaves the first finger's `pointermove`s
   failing the `start.id !== event.pointerId` check forever: the photo freezes under a finger that
   is still down. This is a live bug on any touch device, not a missing feature.
2. **No pinch-to-zoom.** Deferred at F33 with *"R23 says this UI is for desktop"* and *"a screen
   nobody will open on a phone"*. R1 is the operator saying he opens all of it on a phone.
3. **iOS raises its Copy/Share callout** on a press-and-hold over the `<img>`, mid-drag. A drag
   that ends in a system sheet is a drag that cannot be finished. `draggable={false}` only ever
   answered the desktop half.
4. **The zoom slider's hit area is its intrinsic ~20 px**, not 44.

**The `lib/` constraint is honoured.** The pinch is expressed as `Math.hypot` over one pointer
subtraction and one ratio, and the ratio is handed to the **existing** `zoomCrop(natural, crop,
factor)` — the same kind of factor `zoomFactorForWheel` already produces. Every clamp, every bound
and every re-centring stays in `lib/nina/crop.ts`, which stays untouched. No new pure helper, no
new test in `tests/`, no change under `lib/`.

**Code — the complete file:**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import {
  NINA_CROP_KEY_STEP,
  NINA_CROP_MAX_SCALE,
  NINA_CROP_MIN_SCALE,
  ninaCropStyle,
  nudgeCrop,
  panCrop,
  zoomCrop,
  zoomFactorForWheel,
  type NinaCrop,
} from '@/lib/nina/crop'

/**
 * Drag to move, pinch or scroll or slide to zoom, until her face sits in the middle of the circle.
 * F33 R23.
 *
 * ── THE DIVISION OF LABOUR IS STILL THE POINT ───────────────────────────────────────────────
 * `vitest.config.ts` runs `environment: 'node'`: no jsdom, no `PointerEvent`, no
 * `getBoundingClientRect`. So the clamping, the aspect fit, the delta conversion and the CSS
 * mapping are all `lib/nina/crop.ts` and are all unit-tested there. Invariant 6, and the precedent
 * is exact: `lib/photos/gallery.ts` was carved out of `PhotoViewer.tsx` for this reason.
 *
 * The rule used to read *"no arithmetic beyond subtracting two pointer positions"*. Pinch adds
 * exactly two operations to that and no third: a `Math.hypot` over one such subtraction, and the
 * RATIO of this frame's span to the previous frame's. The ratio goes to `zoomCrop` unchanged — the
 * same shape of factor `zoomFactorForWheel` returns — so every bound, every clamp and every
 * re-centring still happens in the tested module. Nothing about a crop is decided in this file.
 * `spanOf` at the bottom is the whole of the addition and it is three lines.
 *
 * ── CONTROLLED, NOT STATEFUL ────────────────────────────────────────────────────────────────
 * The crop lives in `components/admin/explorer/SelectionPane.tsx`, because "Save framing" and
 * "Reset framing" and the dirty marker are all its business and a component that owned the value
 * would have to tell it anyway.
 *
 * ── WHY THE WHEEL LISTENER IS REGISTERED BY HAND ────────────────────────────────────────────
 * React attaches `wheel` at the root as a PASSIVE listener, so `event.preventDefault()` inside an
 * `onWheel` prop logs an "Unable to preventDefault inside passive event listener" warning and the
 * page scrolls anyway — which on this screen means the studio zooms *and* the page jumps. A direct
 * `addEventListener(…, { passive: false })` is the only way to get the default suppressed.
 *
 * ── TOUCH: THE DEFERRAL IS SPENT ────────────────────────────────────────────────────────────
 * This file used to say pinch was *"scope this phase does not need"* because *"R23 says this UI is
 * for desktop"* and *"a screen nobody will open on a phone"*. R1 of the admin-responsive plan set
 * is the operator saying he opens every one of these screens on an iPhone XS Max, so the premise
 * is gone and the gap closes here. Four things carry it:
 *
 *   1. `touch-none` on the frame, so a drag pans the image instead of scrolling the page — and so
 *      Safari does not claim a two-finger gesture as a page pinch before the second pointer
 *      reaches this component. It was already here, and it is what makes the rest possible.
 *   2. Every pointer is tracked by id in `pointers`, not just the first. One pointer pans, two
 *      pinch, and lifting either one ends the pinch rather than silently re-pairing. The old
 *      single `last` ref had a real bug in it: a second `pointerdown` overwrote the id, so landing
 *      a thumb mid-drag and lifting it again stranded the first finger — its moves no longer
 *      matched the stored id and the photograph froze under it.
 *   3. `select-none` and `[-webkit-touch-callout:none]`. Without them a press-and-hold over the
 *      photograph raises iOS's Copy / Share callout in the middle of a drag, and a drag that ends
 *      in a system sheet is a drag the operator cannot finish. `draggable={false}` only ever
 *      answered the desktop half of this.
 *   4. `h-11` on the zoom slider — 44 px of hit area on the input itself. A range input's tap
 *      target IS its box, and Safari draws the track vertically centred in whatever height it is
 *      given, so the control looks unchanged and is twice as easy to grab.
 *
 * The slider stays, and not as a fallback for a missing gesture: it is the only control here that
 * reports the number actually stored, and it is how a scale is set exactly rather than approached.
 */

export function CropStudio({
  src,
  natural,
  crop,
  onChange,
  disabled = false,
}: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCrop
  onChange: (next: NinaCrop) => void
  disabled?: boolean
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [framePx, setFramePx] = useState(0)
  const [dragging, setDragging] = useState(false)

  /**
   * Every pointer currently down on the frame, keyed by `pointerId`. A ref because it must not
   * re-render, and a `Map` because the identity of the SECOND contact matters as much as the
   * first: a pinch is the span between two specific pointers, and lifting either one has to end
   * that pinch rather than quietly re-pair with whatever is left down.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  /** The span between the pinching pointers as of the last event, or `null` when not pinching. */
  const pinchSpan = useRef<number | null>(null)

  /** The frame's rendered size, measured — the one number the pure module needs from the DOM. */
  useEffect(() => {
    const element = frameRef.current
    if (element == null) return
    const measure = () => setFramePx(element.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /*
   * The three values the hand-registered wheel listener reads, mirrored into refs so it never
   * closes over a stale one. Written in an effect with NO dependency array rather than during
   * render: `react-hooks/refs` forbids the render-time write, and a wheel event can only arrive
   * after the commit that ran this, so the mirror is never behind by the time it is read.
   */
  const cropRef = useRef(crop)
  const naturalRef = useRef(natural)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    cropRef.current = crop
    naturalRef.current = natural
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const element = frameRef.current
    if (element == null || disabled) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      onChangeRef.current(
        zoomCrop(naturalRef.current, cropRef.current, zoomFactorForWheel(event.deltaY)),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [disabled])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      /*
       * `button !== 0` rejects a right-click and a mouse's middle button. A touch contact and a
       * pen contact both report button 0, so this excludes neither — which is why it can stay
       * exactly as it was written for a mouse.
       */
      if (disabled || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      /*
       * The second contact starts a pinch and ends the pan, and the span is seeded HERE rather
       * than on the first move — so the very first `pointermove` after two fingers land already
       * has a previous span to divide by and the photo does not jump on frame one.
       */
      pinchSpan.current = pointers.current.size >= 2 ? spanOf(pointers.current) : null
      setDragging(true)
    },
    [disabled],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      const previous = pointers.current.get(event.pointerId)
      // A move from a pointer that never went down on this element — or that has already been
      // released — is not this component's business.
      if (previous == null) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.current.size >= 2) {
        // PINCH. The ratio of this frame's span to the previous one, handed to `zoomCrop` as the
        // same kind of factor the wheel produces. A missing or zero previous span means there is
        // nothing to divide by, so that move only re-seeds and changes nothing.
        const span = spanOf(pointers.current)
        const last = pinchSpan.current
        pinchSpan.current = span
        if (span == null || last == null || last === 0) return
        onChange(zoomCrop(natural, crop, span / last))
        return
      }

      // PAN. The other arithmetic in this file, and it is a subtraction.
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      onChange(panCrop(natural, crop, dx, dy, framePx))
    },
    [crop, disabled, framePx, natural, onChange],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // `Map.delete` returns false for a pointer that was never tracked, which is the guard the old
    // `last.current?.id !== event.pointerId` check was doing by hand.
    if (!pointers.current.delete(event.pointerId)) return
    /*
     * Dropping below two pointers ends the pinch. It deliberately does NOT re-seed a pan origin:
     * the surviving pointer's last position is already in the map, so the next `pointermove`
     * measures its delta from where that finger actually is, and the photograph does not jump when
     * the second finger comes off.
     */
    if (pointers.current.size < 2) pinchSpan.current = null
    if (pointers.current.size === 0) setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const step = event.shiftKey ? NINA_CROP_KEY_STEP * 5 : NINA_CROP_KEY_STEP
      switch (event.key) {
        case 'ArrowLeft':
          onChange(nudgeCrop(natural, crop, -step, 0))
          break
        case 'ArrowRight':
          onChange(nudgeCrop(natural, crop, step, 0))
          break
        case 'ArrowUp':
          onChange(nudgeCrop(natural, crop, 0, -step))
          break
        case 'ArrowDown':
          onChange(nudgeCrop(natural, crop, 0, step))
          break
        case '+':
        case '=':
          onChange(zoomCrop(natural, crop, 1.1))
          break
        case '-':
        case '_':
          onChange(zoomCrop(natural, crop, 1 / 1.1))
          break
        default:
          return
      }
      event.preventDefault()
    },
    [crop, disabled, natural, onChange],
  )

  return (
    <div>
      <div
        ref={frameRef}
        role="application"
        aria-label="Frame her face — drag to move, pinch or scroll or use the slider to zoom, arrow keys to nudge"
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'relative aspect-square w-full max-w-[420px] touch-none overflow-hidden rounded-pill bg-paper-2 outline-none',
          'ring-1 ring-rule select-none [-webkit-touch-callout:none]',
          'focus-visible:ring-2 focus-visible:ring-accent',
          disabled ? 'cursor-default opacity-60' : dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- see CircleFrame's header: the
            crop transform owns every positioning property `next/image fill` would set. */}
        <img src={src} alt="" draggable={false} style={ninaCropStyle(natural, crop)} />
        {/* The centring crosshair. Purely decorative, and the reason the operator can tell
            "middle of the frame" from "roughly middle". */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-pill border border-white/70 mix-blend-difference"
        />
      </div>

      <label className="mt-4 block max-w-[420px]">
        <span className="mb-1 block text-[12px] font-semibold text-ink-2">
          Zoom &middot; {crop.scale.toFixed(2)}&times;
        </span>
        <input
          type="range"
          min={NINA_CROP_MIN_SCALE * 1000}
          max={NINA_CROP_MAX_SCALE * 1000}
          step={10}
          value={Math.round(crop.scale * 1000)}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value) / 1000
            // Expressed as a factor so the frame centre holds still, exactly as the wheel does.
            onChange(zoomCrop(natural, crop, next / crop.scale))
          }}
          /* `h-11` is the 44 px tap target, on the input rather than on a wrapper: the hit area of
             a range input IS its box. `touch-none` so a slightly diagonal drag on the thumb is not
             claimed by the page's scroll halfway through the gesture — Safari handles the range's
             own dragging itself and does not need the pan-y it would otherwise keep. */
          className="h-11 w-full touch-none accent-accent"
        />
      </label>

      <p className="mt-2 max-w-[420px] text-[12px] font-medium text-ink-3">
        Drag the photo to move it and pinch to zoom. With a pointer: scroll to zoom, arrow keys to
        nudge (hold shift for a bigger step). Stored as scale {crop.scale.toFixed(3)}&times;, offset{' '}
        {crop.x}/{crop.y} thousandths of the frame.
      </p>
    </div>
  )
}

/**
 * The distance between the first two pointers in the map, in CSS pixels — one subtraction and one
 * `Math.hypot`, and the entire arithmetic budget the header grants this file for pinch.
 *
 * Module scope and not a closure over the ref: it takes what it reads, so it can be named in
 * `onPointerDown`'s and `onPointerMove`'s bodies without joining either `useCallback`'s dependency
 * array and re-creating both handlers on every render.
 *
 * `>= 2` is checked by the callers; this returns `null` for anything else, which is the same
 * "there is no pinch in progress" signal `pinchSpan` carries.
 */
function spanOf(pointers: ReadonlyMap<number, { x: number; y: number }>): number | null {
  const [a, b] = [...pointers.values()]
  if (a === undefined || b === undefined) return null
  return Math.hypot(b.x - a.x, b.y - a.y)
}
```

**Impact:**
- `last` is gone, replaced by `pointers` + `pinchSpan`. No prop, no export and no call site changes;
  `SelectionPane` renders `<CropStudio>` with the same five props.
- `lib/nina/crop.ts` is untouched. `tests/nina.crop.test.ts` (if present) is unaffected.
- Desktop behaviour is unchanged in every respect: one mouse pointer means `size === 1` on every
  move, which is the pan path, byte for byte the old arithmetic.

---

### Step 8: The memory table stops zooming the viewport, and halves its scroll

**File:** `components/admin/MemoryTable.tsx:1-20` (imports), `:67-70`, `:189-227`, `:408`, `:471`,
`:483`, `:487-506`, `:606`, `:611-622`

**The requirement is already half met and the other half is a real bug.** The table is already
`<Card className="mt-8 overflow-x-auto">` around a `min-w-[940px]` table, so it already scrolls
inside its own container rather than making the page scroll sideways — that box is checked on
`main`. What is broken is different and worse: **`CELL_CONTROL` sets `text-[13px]` on every
`<input>`, `<select>` and `<textarea>` in the table, and a Tailwind utility lives in
`@layer utilities`, which outranks `app/globals.css`'s `@layer base` rule
`input, select, textarea { font-size: max(16px, 1rem) }` outright.** So the one iOS guard this repo
went out of its way to install globally is defeated on this page specifically, and Safari zooms the
viewport on every cell focus and leaves it zoomed. `components/ui/Field.tsx:85-92` states the rule
this violates.

**8a — imports.** Insert before line 5:

```tsx
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button, Card } from '@/components/ui'
```

**8b — `CELL_CONTROL`.** Replace lines 67–70:

```tsx
/**
 * `CONTROL_CLASS`'s tokens at table density. See the header.
 *
 * ── 16 px BELOW `lg`, AND THAT IS THE iOS RULE BEATING THE DESIGN ───────────────────────────
 * `components/ui/Field.tsx:85-92` and `app/globals.css`'s base block both state it: Safari zooms
 * the viewport when a control smaller than 16 px takes focus, and the design brief makes that one
 * of the rules that wins over the design. `app/globals.css` sets `font-size: max(16px, 1rem)` on
 * `input`, `select` and `textarea` in `@layer base` — and a Tailwind utility sits in
 * `@layer utilities`, which beats it in the cascade regardless of specificity. So the `text-[13px]`
 * that used to be here was not merely dense: it re-opened the exact hole the global rule exists to
 * close, on the one page in `/admin` that is nothing but form controls. Every cell zoomed the page
 * on focus and left it zoomed. `text-base` closes it again below `lg`; 13 px density returns at
 * `lg`, where there is no viewport to zoom.
 *
 * `min-h-11` is the 44 px tap target, at the same widths and for the same reason, and it goes back
 * to `min-h-0` at `lg` so a forty-row ledger is still one screen of scanning rather than three.
 */
const CELL_CONTROL =
  'min-h-11 w-full rounded-field bg-paper-2 px-2 py-1.5 text-base font-medium text-ink outline-none ' +
  'placeholder:font-normal placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent ' +
  'lg:min-h-0 lg:text-[13px]'
```

**8c — a second cell constant, for the two columns that fold away.** Insert immediately after
`const CELL = …` (line 72) and `const HEAD_CELL = …` (line 74):

```tsx
const CELL = 'border-t border-rule px-2 py-2 align-top'

/**
 * Origin and When, below `lg`, are not there.
 *
 * Six columns need 940 px and a phone offers 318 of them inside `Card`'s padding, so the table
 * scrolls — which is correct and is what `overflow-x-auto` is for — but 620 px of hidden width is
 * a table nobody can edit with a thumb. These two columns are the ones to spend: **When** is a
 * date the operator does not act on, and **Origin** is a badge that says `admin` or `distilled`,
 * which the `What` column's own label already implies for slots and promises. The four that stay —
 * what it is, what it says, how confident, and delete — are the four R1 asked for: *"i can easily
 * edit, add or remove one row easily"*.
 *
 * ── WHY THE `<colgroup>` HAD TO GO ──────────────────────────────────────────────────────────
 * A `<col>` maps to a column by POSITION among the cells that are actually rendered. Hiding two
 * `<td>`s with `display:none` removes them from the table, so the delete cell would slide into
 * column 4 and inherit the 250 px `Origin` width. `display:none` on a `<col>` itself is not
 * defined to hide a column at all (that is `visibility: collapse`, whose support is patchy and
 * whose behaviour in Safari is not something to bet a table on). Putting the widths on the `<th>`s
 * instead removes the positional mapping entirely: a header cell carries its own width, hidden or
 * not, and the auto table layout honours it exactly as it honoured the `<col>`.
 */
const CELL_WIDE_ONLY = `${CELL} hidden lg:table-cell`

const HEAD_CELL = 'px-2 py-2 text-[11px] font-semibold tracking-[0.02em] text-ink-2'

const HEAD_CELL_WIDE_ONLY = `${HEAD_CELL} hidden lg:table-cell`
```

**8d — the card, the table and the head.** Replace lines 189–227 (`<Card …>` through `</thead>`):

```tsx
    {/* `overscroll-x-contain`: without it, flicking the table past its right edge hands the
        remaining horizontal scroll to the page, and on iOS a horizontal overscroll at the left
        edge is the back-swipe gesture — so scrolling a table would navigate away from it. */}
    <Card className="mt-8 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[420px] border-collapse text-left lg:min-w-[940px]">
        <caption className="sr-only">
          Every memory Nina holds for this account: her eight slots, her pending promises, and the
          ledger. A cell saves when you leave it. The delete control removes a row on the first
          click, with no confirmation. On a narrow screen the Origin and When columns are not
          shown; the table scrolls sideways inside its own box.
        </caption>

        {/* No `<colgroup>` — the widths live on the header cells now. `CELL_WIDE_ONLY`'s docstring
            has the whole argument. */}
        <thead>
          <tr className="bg-paper-2">
            <th scope="col" className={cn(HEAD_CELL, 'w-[128px] lg:w-[190px]')}>
              What
            </th>
            <th scope="col" className={HEAD_CELL}>
              Value
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[72px] lg:w-[86px]')}>
              Conf.
            </th>
            <th scope="col" className={cn(HEAD_CELL_WIDE_ONLY, 'lg:w-[250px]')}>
              Origin
            </th>
            <th scope="col" className={cn(HEAD_CELL_WIDE_ONLY, 'lg:w-[104px]')}>
              When
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[56px] lg:w-[48px]')}>
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>
```

The group-header row at line 238 keeps `colSpan={6}`: with two cells hidden the row has four
columns and the browser clamps a too-large `colSpan` to the table's width. No change.

**8e — the value textarea.** Replace line 408:

```tsx
            className={cn(CELL_CONTROL, 'resize-y leading-snug')}
```

`min-h-[34px]` is **removed rather than made responsive.** `CELL_CONTROL` now carries
`min-h-11 lg:min-h-0`, and Tailwind sorts arbitrary `min-height` values after named ones, so a
`min-h-[34px]` in the same attribute would win at every width and undo 8b. At `lg`, `min-h-0` plus
`rows={1}` plus `py-1.5` gives the same ~34 px the literal was buying.

**8f — the Origin and When cells.** Replace line 471 (`<td className={CELL}>` opening the Origin
cell) with:

```tsx
      <td className={CELL_WIDE_ONLY}>
```

and line 483 (the When cell) with:

```tsx
      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3 tabular-nums')}>
```

**8g — the delete control.** Replace lines 487–506 (the delete `<td>` and its button):

```tsx
      <td className={cn(CELL, 'text-right')}>
        {row.deletable && (
          <button
            type="button"
            aria-label={`Delete ${row.label === '' ? 'this ledger row' : row.label}`}
            title={
              row.reappears
                ? 'Delete the value. The key comes back as a blank row.'
                : 'Delete this row. No confirmation.'
            }
            className={cn(
              TOUCH_ICON,
              'rounded-field text-[15px] leading-none font-semibold text-ink-3',
              'transition-colors hover:bg-red/10 hover:text-red',
              'focus-visible:ring-2 focus-visible:ring-red focus-visible:outline-none',
            )}
            onClick={() => onDelete(row)}
          >
            ✕
          </button>
        )}
      </td>
```

`px-2 py-1` is dropped: `TOUCH_ICON` supplies a 44 × 44 box and the two would fight over padding.
This is a one-click destructive control with no confirmation (R1's ruling), which is exactly the
kind of control that must not be a 20 px target next to a text field.

**8h — the add row's spanning cell.** Replace line 606:

```tsx
      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3')} colSpan={2}>
```

Hidden below `lg` with the two columns it spans, so the add row keeps four cells where the data
rows have four.

**8i — the add button.** Replace lines 611–622:

```tsx
      <td className={cn(CELL, 'text-right')}>
        {/* No `h-8` override any more. `size="md"` IS `h-11` (`components/ui/Button.tsx:41-44`),
            and the override was fighting it for a property `lib/cn.ts` does not arbitrate — a
            plain join leaves `h-8` vs `h-11` to Tailwind's emission order, which is not a thing to
            depend on. The 56 px narrow column holds `h-11 px-4` plus a `+`. */}
        <Button
          size="md"
          className="text-[15px]"
          aria-label="Add this row to the ledger"
          loading={pending}
          disabled={text.trim().length === 0}
          onClick={add}
        >
          +
        </Button>
      </td>
```

**Impact:**
- The page stops zooming on focus. That alone is the difference between "editable on a phone" and
  "not".
- The horizontal scroll region drops from 940 px to 420 px below `lg` — about 100 px of scroll
  inside a 318 px window instead of 620.
- At `lg` the table is visually what it was: 190/auto/86/250/104/48, 13 px controls, ~34 px
  textareas. The only visible desktop change is the delete `✕` and the add `+` at 44 px.
- `tests/admin.memory.test.ts`'s assertions on this file are all *negative* import checks (`zod`,
  `@/lib/db/schema`, `@/lib/admin/memoryVocab`, `@/lib/admin/memoryStore`, `@/lib/admin/schema`) and
  a `readdirSync` check that `MemoryLedger.tsx` / `MemorySlots.tsx` stay deleted. Adding
  `@/components/admin/touch` violates none of them.

---

### Step 9: The chat-photo pager and grid gap

**File:** `components/admin/ChatPhotoGrid.tsx:1-11` (imports), `:136`, `:202-230`

`ChatPhotoGrid` is already `lg:grid-cols-[minmax(0,1fr)_320px]`, so it already stacks. Two things
are left.

**9a — imports.** Insert after line 7:

```tsx
import { ChatPhotoAdd } from '@/components/admin/ChatPhotoAdd'
import { ChatPhotoDetail } from '@/components/admin/ChatPhotoDetail'
import { TOUCH_ICON } from '@/components/admin/touch'
import { ButtonLink, EmptyState } from '@/components/ui'
```

**9b — the gap.** Replace line 136:

```tsx
          'grid items-start gap-4 lg:gap-5',
```

**9c — the pager.** Replace lines 202–230 with the same shape Step 4 gives `PhotoGrid`, so the two
photo surfaces keep reading as one product:

```tsx
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-rule pt-3">
                {page.page > 1 ? (
                  <Link
                    href={hrefForPage(page.page - 1)}
                    className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
                    rel="prev"
                  >
                    &lsaquo; Newer
                  </Link>
                ) : (
                  <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
                    &lsaquo; Newer
                  </span>
                )}

                <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
                  {first}&ndash;{last} of {page.total}
                </span>

                {page.page < lastPage ? (
                  <Link
                    href={hrefForPage(page.page + 1)}
                    className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
                    rel="next"
                  >
                    Older &rsaquo;
                  </Link>
                ) : (
                  <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
                    Older &rsaquo;
                  </span>
                )}
              </div>
```

**Impact:** The tile grid (`minmax(120px,1fr)`) already gives three ~117 px tiles at 366 px and is
not touched. `ChatPhotoAdd` in the header row is already `Button size="md"`.

---

### Step 10: The chat-photo rail brings itself into view

**File:** `components/admin/ChatPhotoDetail.tsx:1-4` (imports), a new effect, `:62`, `:70-78`

Same problem and same fix as Step 5, in the file whose docstring already says *"the shape is
`SelectionPane`'s"*.

**10a — imports.** Replace lines 1–4:

```tsx
'use client'

import { useEffect, useRef } from 'react'

import { TOUCH_ICON } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

import { ChatPhotoControls } from './ChatPhotoControls'
import type { ChatPhoto } from './chatPhotoModel'
```

**10b — the effect.** Insert as the first statement of the component body, immediately after the
prop destructuring's closing `}) {`:

```tsx
  /**
   * The rail scrolls itself into view when the selection changes — `SelectionPane.tsx`'s effect,
   * for the same reason and with the same guarantee. Below `lg` this `<aside>` sits under a grid
   * of up to 48 tiles, so tapping one near the bottom opens a pane the operator cannot see.
   * `block: 'nearest'` makes it a no-op at `lg`, where the rail is already beside the grid and
   * `lg:sticky lg:top-8` keeps it there.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [photo.id])
```

**10c — the `<aside>` and close button.** Replace lines 62–78:

```tsx
    <aside
      ref={paneRef}
      className="rounded-card border border-rule bg-card p-4 lg:sticky lg:top-8 lg:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {new Date(photo.createdAt).toLocaleString()}
          </p>
          <p className="truncate text-[12px] font-medium text-ink-3" title={photo.pathname}>
            {photo.pathname}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the details pane"
          className={cn(TOUCH_ICON, '-mt-2 -mr-2 shrink-0 text-[15px] font-semibold text-ink-3')}
        >
          &times;
        </button>
      </div>
```

**Impact:** `ChatPhotoControls` (Replace / Remove) is already `Button size="md"` and is not
touched — the file stays true to its own note that it imports no Server Action.

---

### Step 11: The move bar's destination select fills the row

**File:** `components/admin/PhotoMoveBar.tsx:241`

**Change:** `CONTROL_CLASS` already carries `w-full` and `text-base` (52 px, no iOS zoom). The
`max-w-[240px]` on top of it makes a 240 px select sit beside three buttons in a 366 px
`flex-wrap` row, which wraps into a ragged three-line block. Below `sm` the select takes the row and
the buttons take the next one.

**Code:** replace line 241:

```tsx
          className={`${CONTROL_CLASS} sm:max-w-[240px]`}
```

**Impact:** One class. Every `Button` in this file is already `size="md"`. Nothing else changes,
and in particular the selection model this file's header promises not to restructure is untouched.

---

### Step 12: `DialSlider` — 44 px, and the header-row geometry phase 4 needs

**File:** `components/admin/DialSlider.tsx` — whole file

**Change:** Three things, and **no change to `DialSliderProps`**: the range input gets a 44 px hit
box, the "default N" reset gets one, and the header row changes from
`items-baseline justify-between` to `flex items-center gap-2` with `ml-auto` on the readout.

**That last change is the whole of what this phase owes phase 4.** A checkbox has no baseline worth
aligning to, so a per-parameter toggle landing at the head of an `items-baseline` row would drag the
label's baseline around; `items-center` + `ml-auto` means a control of any height can join that row
and nothing else moves. Phase 4 adds the checkbox itself — it is phase 4's affordance by the plan
index's phase-4 **Owns** line, and phase 4 needs an `enabled` value in this component anyway for the
struck label and the `off` readout, which a slot could not have carried.

**Where phase 4's affordance will sit, stated for the contract:** first child of the header row,
before the `<label>`, `shrink-0`, vertically centred, separated by the row's `gap-2`. The reading
order becomes `[toggle] Flirty ……… 60`, which is the order the operator asks the questions in: *is
this parameter on, what is it, what is it set to.* Phase 4 must wrap that checkbox in `TOUCH_ICON`
from `components/admin/touch.ts` — a bare `size-4` box is 16 px and would be the only control in
this package below the 44 px rule this phase spends thirteen other steps enforcing.

**Code — the complete file:**

```tsx
'use client'

import * as React from 'react'

import { TOUCH_TARGET } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

/**
 * One dial, 0–100 — the *"sliding bars"* R1 asked for, in the only shape that satisfies the two
 * conditions the plan set on them: **keyboard-operable, and showing its number.**
 *
 * ── A NATIVE `<input type="range">`, NOT A DIV WITH A DRAG HANDLER ──────────────────────────
 * Arrow keys, Home/End and PageUp/PageDown all work, focus is visible, the value is exposed to a
 * screen reader, and the thumb tracks a pointer correctly on the first try. A hand-rolled track
 * gets none of that for free and this repo has already made that call once —
 * `components/admin/CropStudio.tsx` is a native range with `accent-accent`, and this is the
 * same control with a label and a readout bolted on.
 *
 * ── WHERE IT LIVES, AND WHY IT IS NOT IN `components/ui/` ───────────────────────────────────
 * `components/ui/index.ts` is the shared client-safe kit, and three arguments keep this control
 * out of it. It has exactly one caller and one audience — the runner's app has no slider and the
 * design brief names none, while every operator-only control so far (`CropStudio`, `FolderMenu`,
 * `PhotoMoveBar`, `SelectionPane`, `UserPicker`) has lived here. The barrel is a load-bearing
 * bundle boundary: ten `'use client'` files import it, and the `AppShell` precedent records what
 * happens when something with a different graph joins. And the nearest precedent already chose
 * `components/admin/`. If a runner-facing slider ever appears, moving this file is one rename plus
 * one line in the barrel, and that is the moment to make the case.
 *
 * `components/admin/touch.ts` follows exactly this reasoning and is a sibling for it.
 *
 * ── WHY NOT `Field` ─────────────────────────────────────────────────────────────────────────
 * `Field` owns the `label`/`hint`/`error`/`aria-describedby` wiring, but only `Input` reads its
 * context for the `id`, so a bare `<input type="range">` inside a `Field` would get a
 * `<label htmlFor>` pointing at nothing — an unlabelled control with the appearance of a labelled
 * one. `CONTROL_CLASS` is also a 52 px filled well, which is a text field and not a track. So this
 * component does its own `useId` wiring, which is four lines.
 *
 * ── THE NUMBER IS NOT DECORATION ────────────────────────────────────────────────────────────
 * An unlabelled slider is a dial the operator cannot report back: "flirty is quite high" is not a
 * bug report and cannot be compared against `nina_turns`' recorded revision. So the value renders
 * as an `<output>` tied to the input, and it is the number that is actually stored.
 *
 * ── TWO DIFFERENT KINDS OF "CHANGED", BOTH VISIBLE ──────────────────────────────────────────
 * `defaultValue` is the SHIPPING default, so accent type and the "default N" button mean *this is
 * no longer the Nina who shipped* — the state invariant 2 is about. `unsaved` means *this is not
 * what the row says yet*, which is a different question and gets its own dot. Collapsing the two
 * would leave the operator unable to tell a saved deviation from an unsaved keystroke.
 *
 * Clicking "default N" is the per-dial undo. It writes the default into the draft rather than
 * saving anything, so it is still one Save for the whole tuning (plan invariant 11).
 *
 * ── TOUCH, AND THE SLOT LEFT FOR THE PER-PARAMETER TOGGLE ───────────────────────────────────
 * `h-11` on the track and `TOUCH_TARGET` on the reset are the 44 px rule; a range input's hit area
 * is its box, and Safari draws the track vertically centred in whatever height it is given, so the
 * control looks the same and is far easier to hit with a thumb.
 *
 * The header row is `items-center` with the readout pushed right by `ml-auto` **so that the head of
 * that row can hold a control of any height without dragging the label's baseline around**; it used
 * to be `items-baseline justify-between`, which could not. That is deliberate room left for the
 * ON/OFF TOGGLE the enable-map phase adds beside every parameter — it renders as the first item of
 * this row, giving `[toggle] Flirty ……… 60`, which is the order the questions get asked in: is this
 * on, what is it, what is it set to. Nothing else about this component has to move when that toggle
 * lands, and the existing `disabled` prop already greys the track and hides the reset.
 */

export interface DialSliderProps {
  label: string
  hint?: string
  value: number
  /** The shipping default for this dial. Drives the accent state and the reset affordance. */
  defaultValue: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  /** The draft differs from the saved row for this dial. */
  unsaved?: boolean
  onChange: (value: number) => void
}

export function DialSlider({
  label,
  hint,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  disabled = false,
  unsaved = false,
  onChange,
}: DialSliderProps) {
  const base = React.useId()
  const inputId = `${base}-dial`
  const hintId = hint ? `${base}-hint` : undefined
  const moved = value !== defaultValue

  return (
    <div className="py-2">
      {/* `items-center` + `ml-auto`, not `items-baseline justify-between`: the head of this row is
          where the enable-map phase's per-parameter toggle lands, and a checkbox has no baseline. */}
      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          className="min-w-0 text-[12px] font-semibold tracking-[0.02em] text-ink-2"
        >
          {label}
        </label>

        <output
          htmlFor={inputId}
          className={cn(
            'ml-auto shrink-0 text-[13px] font-semibold tabular-nums',
            moved ? 'text-accent' : 'text-ink-3',
          )}
        >
          {unsaved && (
            <span className="mr-1 text-accent" title="Unsaved">
              &bull;
            </span>
          )}
          {value}
        </output>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(Number(event.target.value))}
        /* `h-11` is the 44 px tap target; `touch-none` keeps a slightly diagonal thumb drag from
           being claimed by the page's scroll partway through. `mt-0.5` rather than `mt-1.5`: the
           input's own box grew by 20 px, so the optical gap under the label is unchanged. */
        className="mt-0.5 h-11 w-full touch-none accent-accent disabled:opacity-50"
      />

      <div className="mt-1 flex items-center justify-between gap-3">
        {hint ? (
          <p id={hintId} className="max-w-[46ch] text-[11px] font-medium text-ink-3">
            {hint}
          </p>
        ) : (
          <span />
        )}
        {moved && !disabled && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className={cn(
              TOUCH_TARGET,
              'inline-flex shrink-0 items-center px-1 text-[11px] font-semibold text-ink-3',
              'underline decoration-dotted hover:text-ink',
            )}
          >
            default {defaultValue}
          </button>
        )}
      </div>
    </div>
  )
}
```

**Impact:**
- `CharacterPanel.tsx` is **not edited**: `DialSliderProps` is unchanged, so every call site
  compiles and renders as before.
- `tests/admin.tuning.test.ts:347-360` asserts this file starts with `'use client'` (it does) and
  that its code — comments stripped — names none of `server-only`, `@/lib/nina/queries`,
  `@/lib/db/`, `@/lib/env`, `@/lib/admin/requireAdmin`, `@/components/ui/AppShell`. The one new
  import is `@/components/admin/touch`, which is on none of those lists.
- Each dial grows ~24 px taller. `CharacterPanel` renders them in a `<details>` and this changes
  nothing about its state model.

---

### Step 13: The folder menu is tappable, and cannot leave the viewport

**File:** `components/admin/FolderMenu.tsx:1-14` (imports), `:172-186`, the four panel
`<div>`s, the error `<p>`, and `MenuItem`

**13a — imports.** Insert after line 4:

```tsx
import { TOUCH_ICON, TOUCH_TARGET } from '@/components/admin/touch'
import { Button, CONTROL_CLASS, Field } from '@/components/ui'
```

**13b — both triggers.** Replace lines 172–186 (the `mode === 'idle'` ternary's two buttons'
`className` attributes only — the rest of each button is unchanged):

```tsx
      {mode === 'idle' ? (
        <button
          type="button"
          aria-label={`Folder actions for ${label}`}
          className={cn(TOUCH_ICON, 'rounded-field font-semibold text-ink-3 hover:bg-paper-2')}
          onClick={() => setMode('menu')}
        >
          &hellip;
        </button>
      ) : (
        <button
          type="button"
          aria-label="Close folder actions"
          className={cn(TOUCH_ICON, 'rounded-field font-semibold text-ink-2 hover:bg-paper-2')}
          onClick={() => {
            setMode('idle')
            setError(null)
          }}
        >
          &times;
        </button>
      )}
```

**13c — every panel is capped to the viewport, and raised above the nav bar.** The four panels and
the error line are all `w-[280px] z-20 absolute … right-0`. Two changes to each, and the second is
a **reconciled cross-phase fix**:

1. `max-w-[calc(100vw-2rem)]`. Below `lg` the rail is the full content column, so 280 px fits — but
   the drawer is inside `Card`/page padding that phase 1 owns and this phase does not want to
   depend on.
2. **`z-20` → `z-40`.** Phase 1's admin nav is `fixed bottom-0 … z-30` below `lg`. A panel opened
   from a folder row near the foot of the rail extends downward past that line, and at `z-20` its
   lower half — which is where Delete and Move live — paints *underneath* the bar and cannot be
   tapped. `z-40` clears it with a stop to spare. `z-20` in these five places is the only z-index
   anywhere in `components/admin/` on `origin/main` (`FolderMenu.tsx:194,207,255,297,350`), so this
   is the whole of the stacking work this phase owes phase 1, and the comment at
   `FolderMenu.tsx:165` that explains the `z-20` should be updated to say what it now clears.

Five occurrences, one per element:

- line 206 → `className="absolute top-full right-0 z-40 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-card bg-paper-2 p-3 shadow-sheet"` (the create/rename panel)
- the menu panel → `className="absolute top-full right-0 z-40 mt-1 flex w-[280px] max-w-[calc(100vw-2rem)] flex-col items-start gap-0.5 rounded-card bg-paper-2 p-1.5 shadow-sheet"`
- the move panel → same two additions as the create/rename panel
- the delete panel → `className="absolute top-full right-0 z-40 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-card border border-red/40 bg-paper-2 p-3 shadow-sheet"`
- the error `<p>` → `className="absolute top-full right-0 z-40 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-card bg-paper-2 p-2 font-semibold text-warn shadow-sheet"`

`right-0` means a panel grows leftward, so it can never push the page's right edge out; the cap is
against the LEFT edge on a deeply indented row.

**13d — `MenuItem`.** Replace its `className` (line 374 area):

```tsx
      className={cn(
        TOUCH_TARGET,
        'flex w-full items-center rounded-field px-2 text-left font-semibold hover:bg-card',
        destructive ? 'text-red' : 'text-ink-2',
      )}
```

`py-1` is dropped in favour of `min-h-11` + `items-center` — the two would fight over the row's
height, and `lib/cn.ts` does not arbitrate.

**Impact:** The `…` becomes reachable, and so do the four verbs behind it. Every text field and
select in the panels already uses `CONTROL_CLASS` (52 px, `text-base`), so no iOS zoom.

---

### Step 14: The user picker's chips

**File:** `components/admin/UserPicker.tsx:1-4` (imports), `:39`

**14a — imports.** Insert after line 1:

```tsx
import Link from 'next/link'

import { TOUCH_TARGET } from '@/components/admin/touch'
import type { AdminUserRow } from '@/lib/admin/users'
import { cn } from '@/lib/cn'
```

**14b — the chip.** Replace line 39:

```tsx
              TOUCH_TARGET,
              'flex items-center rounded-field border px-3 text-[13px] font-semibold transition-colors',
```

so the full `cn(...)` reads:

```tsx
            className={cn(
              TOUCH_TARGET,
              'flex items-center rounded-field border px-3 text-[13px] font-semibold transition-colors',
              selected
                ? 'border-accent bg-card text-ink'
                : 'border-rule text-ink-2 hover:bg-card hover:text-ink',
            )}
```

`py-2` is dropped for `min-h-11` + `items-center`, for the reason given in 13d. The chip's two
spans (`{name}` and the counts) stay inline inside the flex box, which centres them together.

**Impact:** `UserPicker` is a Server Component and stays one — `touch.ts` has no `'use client'` and
no hooks, so it compiles into whichever graph imports it, exactly as `components/ui/Button.tsx`
argues for itself.

---

### Step 15: `components/admin/.workflows/package_readme.md` — the one pass, RECONCILED-IN

**File:** `components/admin/.workflows/package_readme.md`

**Why this step exists and why it is here.** Phase 1's Handoffs item 5 names four places this
document is falsified by phase 1 and then declines to edit it, on the correct reasoning that two
phases editing one 1000-line readme is a merge conflict for nothing — and hands it to "phase 2's
readme pass or the completion handler, whichever runs last". **Phase 2 had no readme pass.** That
made the document owned by nobody, which is the failure mode phase 1 was trying to avoid inverted.
The reconciler assigns it here: phase 2 is the later of the two R1 phases and owns this package.

**Change:** one pass, covering BOTH phases' falsifications. Nothing else in the document moves.

*Phase 1's four (quoted from its Handoffs item 5, verify each against the tree before editing):*
- **:13-18** — `AdminNav` "could only need [a directive] for active-link highlighting … selection
  is … conveyed with `aria-current`". `AdminNav` never set `aria-current`; that is `UserPicker`.
  Correct the attribution.
- **:20-24** — *"It is a desktop admin surface package … `/admin` is stated as desktop-only"*. No
  longer true. It is a responsive admin package with one breakpoint, `lg`, and there IS a bottom
  bar below it — which is `AdminNav`, not `components/ui/TabBar.tsx`, and the distinction is worth
  one sentence because the two now look alike and are not.
- **:71** — the component table's `AdminNav` row.
- **:952** — the "do not add active-link highlighting" rule. **This stays exactly as it is.**
  Phase 1 obeyed it deliberately (its Handoffs item 6 records the reasoning); a rule a phase
  considered and kept is a rule with more evidence behind it than before, not less.

*This phase's own, all new:*
- **The 44 px rule and where it is spelled.** `components/admin/touch.ts` is new and is the single
  home of `TOUCH_TARGET` / `TOUCH_ICON`. Add it to the module list, and state the rule as a rule:
  every non-`Button` interactive control in this package uses one of those two constants; `Button`
  itself is already 44 px at `size="md"` (`components/ui/Button.tsx:42`, `h-11 px-4`), which is why
  `ChatPhotoControls`, `ChatPhotoAdd` and `ShareToNinaItem` needed no change.
- **:331 and :941** — both describe `FolderMenu`'s panels as `z-20`. Step 13 makes them `z-40`, to
  clear phase 1's `z-30` nav bar. Update both, and say what the `z-40` clears; a bare number in a
  readme is the thing that gets "tidied" back down.
- **`MemoryTable`'s column set below `lg`.** Step 8 hides Origin and When below `lg` and moves the
  `<colgroup>` widths onto the `<th>`s. Both are the kind of fact a reader of this document goes
  looking for after being surprised by a missing column.
- **`FileExplorer`'s folder rail is a drawer below `lg`** (`treeOpen`, `id="admin-folder-rail"`),
  and `CropStudio` is now multi-pointer with pinch-to-zoom.

**Impact:** documentation only; no source file, no test, no class string. It is the last step in the
phase on purpose — everything it describes is already written by then.

---

## Verification

**Install first** — `node_modules` is not present in this worktree:

```
cd /home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy && npm ci
```

**Build:**
```
npm run typecheck && npm run build
```

**Tests:**
```
npm run test && npm run lint && npm run format
```

`npm run format` (not `format:check`) because `prettier-plugin-tailwindcss` will re-sort several of
the class attributes written above. That re-sorting cannot change behaviour here — `lib/cn.ts` is a
plain join and conflicts are decided by Tailwind's emission order, never by attribute order — so
letting the formatter have the last word is correct. Re-run `npm run lint` after it.

The four tests that read these files as text are the ones to watch, and all four should stay green
unchanged:
- `tests/admin.tuning.test.ts` — `DialSlider.tsx` starts with `'use client'` and names no
  server-only module
- `tests/admin.memory.test.ts` — `MemoryTable.tsx` imports neither zod nor a server module, and
  `MemoryLedger.tsx` / `MemorySlots.tsx` stay deleted
- `tests/admin.chatPhotos.test.ts`, `tests/nina.tuning.test.ts` — unaffected

**Manual check** — Safari on an iPhone XS Max (or Safari's Responsive Design Mode at 414 × 896 with
"iPhone XS Max" selected, which is the only way to get the safe-area insets):

1. `/admin/nina` — no horizontal page scroll at any scroll position. Tap **Folders**: the rail
   opens; tap a folder: it navigates and the rail stays open. Tap **Hide folders**: it closes.
2. Tap a photograph near the bottom of the grid: the page scrolls the details rail into view.
3. In the crop studio: **one finger pans**; **two fingers pinch** and the frame stays centred;
   landing a second finger mid-drag and lifting it again leaves the first finger still panning
   (this is the multi-touch bug the old `last` ref had); a press-and-hold on the photo raises **no**
   Copy/Share callout; the zoom slider is easy to grab and dragging it does not scroll the page.
   *If the slider's thumb ever fails to follow a touch, the suspect is `touch-none` on the input —
   remove that one class and nothing else changes.*
4. Start an upload: the queue's **Dismiss** button sits clear of **the nav bar** and the home
   indicator — the whole panel is above the bar, not behind it. Widen past 1024 px with the queue
   still open: it drops back to the bottom of the scrollport, because the bar is a left rail again.
   Open a folder's `…` menu on the LAST row of the rail: the panel's Delete and Move rows are
   visible and tappable, not painted under the bar (this is the `z-40` in Step 13).
5. `/admin/memory` — tap into any cell: **the viewport must not zoom.** This is the single most
   important check on the page. The table scrolls sideways inside the card and the page does not.
   Flicking the table past its right edge does not trigger Safari's back-swipe. Origin and When are
   absent; What / Value / Conf. / ✕ are present and the ✕ is easy to hit.
6. `/admin/photos` — tap a photo, the rail scrolls into view; Replace and Remove are full-size.
7. `/admin/nina` character panel — every dial's track is a comfortable thumb drag, and the
   `default N` link is tappable. Nothing about the panel's save behaviour changed.
8. At ≥ 1024 px wide, every one of these screens looks like it did before, except that the folder
   rows, the `…`, the ✕ and the + are larger.

**Exit criteria:** at 414 × 896 in Safari, none of `/admin`, `/admin/nina`, `/admin/photos`,
`/admin/memory` scrolls the page sideways; the explorer is one column with the folder rail behind a
button; the crop studio pans, pinches and zooms with a thumb and raises no system callout; the
memory table scrolls inside its own box and no control on it zooms the viewport on focus; and every
interactive control in `components/admin/` measures at least 44 px on its smaller axis.

---

## Handoffs

- **`tests/admin.responsive.test.ts` — RECONCILER'S RULING: not created, by either phase.** A
  source-text guard asserting that no `components/admin/**` file ships a bare `py-1`/`py-0.5`
  interactive control, and that `TOUCH_TARGET`/`TOUCH_ICON` are the only spellings of 44 px, would
  be worth having, and this phase was right that two phases creating one path is a merge conflict in
  a file neither can see. It is not assigned to either, because **no exit criterion in the set asks
  for it**: phase 1's guard is `tests/admin.shell.test.ts` (which it creates and owns, covering the
  shell contract), phase 2's exit criterion is a measurement in Safari, and R1 asks for a responsive
  admin rather than for a lint rule about one. Adding an unasked-for source-text guard to a HARD
  phase is scope this reconciliation has no mandate to create. **Recorded as a follow-up card, not
  as a gap** — and the natural owner is `tests/admin.shell.test.ts`, which phase 1 already
  established as the place this kind of assertion lives.

- **Phase 4 — the per-parameter toggle.** This phase adds **no prop**; what it leaves is the header
  row as `flex items-center gap-2` with the readout on `ml-auto`, so a control of any height fits at
  its head without moving the label. Phase 4 adds the `enabled` / `onEnabledChange` pair and renders
  the checkbox there, **wrapped in `TOUCH_ICON` from `components/admin/touch.ts`** — a bare `size-4`
  checkbox is 16 px and would be the one control in this package under the 44 px rule. Phase 4 owns
  `CharacterPanel.tsx`; this phase did not open it.

- **Phase 4 — `CharacterPanel.tsx`'s own responsiveness.** It was read and left alone (it is phase
  4's file by the plan index). Its `<details>` summary and its Save/Reset buttons were not audited
  against the 44 px rule here. Phase 4 should import `TOUCH_TARGET` from `components/admin/touch.ts`
  for anything it finds under 44 px while it is in there.

- **Hiding table columns rather than folding them.** Step 8 hides Origin and When below `lg`. A
  better long-term answer for a phone is a card-per-row layout below `sm` (`<table>` → stacked
  `<dl>`s), which no phase in this set owns and which would rewrite `MemoryTable`'s render. Left as
  a follow-up card, not smuggled in here.

- **`FolderMenu`'s panels are still `absolute` inside a rail.** At 414 px they fit, and Step 13
  caps them at `calc(100vw-2rem)`. If a future phase makes the rail narrower than 280 px on a phone,
  the honest answer is a `Sheet` rather than a wider cap — `components/ui/Sheet.tsx` exists and
  already pads `--safe-bottom`.

- **Internal drag-to-move for folders** remains a follow-up card, exactly as `FolderMenu`'s header
  says. Nothing here makes it easier or harder; on touch it would need a long-press to disambiguate
  from a scroll, which is a design question, not a sizing one.

---

## Rollback

This phase is one commit on `feature/admin-responsive-nina-intimacy` and touches nothing outside
`components/admin/`. `git revert <sha>` undoes it whole. It writes no migration, no database column
and no `lib/` module, so there is no data or schema state to unwind and no other phase's revert has
to be sequenced with it.

Partial rollback, if one step misbehaves in Safari and the rest is wanted:

- **Step 7 (crop studio)** is self-contained in one file with no exported surface change — revert
  `components/admin/CropStudio.tsx` alone and the studio is mouse-and-slider again while everything
  else stays responsive.
- **Step 8's column hiding** is `CELL_WIDE_ONLY` / `HEAD_CELL_WIDE_ONLY` plus three call sites;
  pointing those two constants back at `CELL` / `HEAD_CELL` restores all six columns without
  touching the 16 px fix, which is the part of Step 8 that must not be rolled back.
- **`components/admin/touch.ts`** can only be deleted after every importer is reverted; it is the
  last thing to go, not the first.
