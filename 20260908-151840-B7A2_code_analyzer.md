# Code Analysis: Admin bottom bar — icons, one row

**Type:** Feature Update
**Date:** 2026-09-08 15:18 (UTC+7-ish local)
**Session ID:** 20260908-151840-B7A2
**Plan:** `ADMIN_BOTTOM_BAR_ICONS_PLAN.md` (1 phase)
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-bottom-bar-icons` — branch `feature/admin-bottom-bar-icons` (base `origin/main` @ `18b0c58`)

---

## User Input

### Original User Request

> cari koleksi icons yang paling tepat di web. replace semua text pada bottom bar menjadi icon. atur spacing dan size icon sedemikian rupa sehingga bottom bar hanya perlu satu baris saja pada xsmax saya. saat ini bottom bar memakan 2 baris text

(The invocation also said: *work on a new worktree from origin/main* — done, see Worktree above.)

### User-Provided Context

- A screenshot of the current XS Max rendering: the admin bottom bar carries seven
  plain-text labels — `Overview, Album, Persona, Images, Photos, Memory, Shortcut` —
  wrapping over **two rows** (4 + 3), all in the same grey, no icons, no visible active
  state, white bar over the pale page, iOS home indicator respected underneath.
- Target device: iPhone XS Max, Safari — 414 × 896 CSS px portrait, `--safe-bottom`
  ≈ 34 px, `viewport-fit=cover` already set in `app/layout.tsx`.

### User-Provided Files

- `1.png` (screenshot, described above)

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Find the most appropriate icon collection on the web |
| R2 | Replace all text on the bottom bar with icons |
| R3 | Tune icon size + spacing so the bottom bar fits ONE row on the XS Max (it is two rows of text today) |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: Below `lg`, `AdminNav` renders as a fixed bottom bar.
Seven routes landed on it (five → seven across two independently-merged feature sets), and
text labels forced it to a 4×2 grid (`h-28`, 112 px, two rows of cells) — exactly the
two-row bar in the screenshot. The user wants the phone bar to carry **icons instead of
words**, sized and spaced so seven cells sit on **one row** at 414 px.

**Success Criteria**:

1. R1 — an icon collection is chosen from the web with a stated reason, and the glyphs
   come from it verbatim (real path data, not invented shapes).
2. R2 — below `lg` the bottom bar renders seven icon-only cells; every link keeps an
   accessible name; the `lg` sticky sidebar is unchanged (text rail — the request names
   the *bottom bar*).
3. R3 — one row at 414 px: `grid-cols-7`, ~59.1 px per cell, a 20–24 px glyph per cell,
   bar height back to `h-14` (56 px), and the layout's `<main>` reserve returned from
   `8rem` to `5rem` so the pair stays truthful.
4. `tests/admin.shell.test.ts` — the file that pins the geometry — is updated to pin the
   NEW geometry (one row, 7 columns, `h-14` ↔ `5rem`) instead of the old (4×2, `h-28` ↔
   `8rem`, 8-character ceiling).

**Key Considerations**:

- **The repo's icon stance is being overturned by the owner's own request.** `AdminNav`'s
  header comment and `components/admin/.workflows/package_readme.md` carry
  *"a plain-text link, never an icon button — unambiguous at a glance and an icon is a
  guess"* attributed to `docs/design-brief.md`. Verified: `docs/design-brief.md` (213
  lines) no longer contains that sentence — the stance survives only in these two
  comment/readme locations, both of which this change rewrites. Raw user input outranks
  surrounding convention.
- **The repo's icon DELIVERY convention stands**: `components/ui/TabBar.tsx`'s footer —
  *"The icons are hand-written SVG rather than a dependency: five glyphs is not worth a
  package, and an icon font would be a second webfont on a page whose first is already
  Poppins."* Seven glyphs is the same arithmetic. ShareButton, SessionRow, NinaJobActions
  also inline their SVGs. No icon npm package exists in `package.json` today.
- **Accessibility is load-bearing once text disappears**: each icon-only link needs an
  accessible name (`aria-label` from the surviving `short` string, or a visually-hidden
  span) and the `<svg>` needs `aria-hidden="true"` — the pattern `TabBar`/`ShareButton`
  already use for their glyphs.
- **Rules that survive untouched**: server component (no `'use client'`), no
  active-link highlighting (`usePathname()` would client-render the nav — readme rule),
  `aria-label="Admin"` on the `<nav>`, safe-area padding mechanics.
- **The Album/Images/Photos trio is the hard part of R2**: the current labels are, by
  their own comments, *"the only thing carrying"* the album-vs-chat-photos distinction.
  Icons must be three clearly distinct glyphs, not two photo outlines that differ by a
  corner.

**Assumptions** (stated, not asked):

- "Bottom bar" = the below-`lg` fixed bar. The `lg` sticky text rail is a different
  rendition of the same nav and stays text — the request names the bottom bar only.
- Icon collection candidates were evaluated by web research (R1); the choice and the
  per-route mapping are recorded below and prescribed by the plan.

---

## Analysis Scope

### Explicitly Mentioned Files

- (none `@`-mentioned; the screenshot pointed at the admin bottom bar)

### Discovered Related Files

- `components/admin/AdminNav.tsx` — the bar itself: `LINKS` (7 routes × `label`/`short`
  pair), the `h-28 grid-cols-4 grid-rows-2` phone grid, the `lg` sidebar rendition, and
  the header comments that carry the text-stance being overturned.
- `app/admin/layout.tsx:78` — `pb-[calc(8rem+var(--safe-bottom))]` under `<main>`: the
  paired reserve for the fixed bar. **Spelled in two files by necessity** (Tailwind
  cannot read a TS constant); `tests/admin.shell.test.ts` is the anti-drift guard.
- `tests/admin.shell.test.ts` (258 lines) — pins: the seven-route manifest, the
  8-character `short` ceiling, the `h-28` ↔ `8rem` pairing, the 4-column/no-blank-row
  grid math, and a ≥82.8 px cell-width floor. Every one of these assertions describes
  the two-row text bar.
- `components/admin/.workflows/package_readme.md` — the AdminNav row (line ~97)
  describes the 4×2 grid and the 8rem pair; the "no active-link highlighting" rule
  (line ~1180) must survive.
- `components/ui/TabBar.tsx` — PRECEDENT, not an impact point: hand-written SVGs
  (`viewBox 0 0 24 24`, `strokeWidth 2`, `strokeLinecap round`, `currentColor`,
  `aria-hidden`), and the `max-w-[470px] mx-auto` row mechanics AdminNav borrows.
- `components/share/ShareButton.tsx:179,208`, `components/nina/SessionRow.tsx` — same
  inline-SVG idiom (`size-5`, `fill none`, round caps).
- `app/layout.tsx` — supplies `--safe-*` insets via `viewport-fit=cover` (already set,
  load-bearing, unchanged).
- `package.json` — no icon library among dependencies (verified). Gates: `lint`,
  `typecheck` (`next typegen && tsc --noEmit`), `test` (`vitest run`),
  `format:check`.

---

## Current Dataflow

### Entry Point: `AdminNav` (server component)

**Location:** `components/admin/AdminNav.tsx:118`
**Trigger:** rendered once by `app/admin/layout.tsx:79` — a layout does not re-run on
subtree navigation, and `requireAdmin()` gates the whole segment.
**Input:** none — `LINKS` is a module-level `as const` array.
**Renditions:** one component, two layouts —

1. **Below `lg` (the phone bottom bar — what this change owns):**
   `fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-card/95 backdrop-blur-sm`,
   padded by `--safe-left/right/bottom`; inside, a centred `max-w-[470px]` grid
   **`h-28 grid-cols-4 grid-rows-2`** — 112 px, two 56 px rows, seven cells with the
   eighth column empty. Each cell is a `<Link>` rendering `<span className="lg:hidden">
   {link.short}</span>` — `text-[11px] font-semibold text-ink-2`, the labels the
   screenshot shows wrapping.
2. **At `lg` (sticky sidebar — NOT touched):** `lg:sticky lg:top-8 lg:self-start`,
   `lg:block` list, eyebrow + long `label` + footnote paragraph.

**State Changes:** none — static server markup, no client JS.

### The geometry contract (the thing R3 must keep truthful)

| Quantity | Where spelled | Today (two-row text) | One-row icons target |
|---|---|---|---|
| Bar grid | `AdminNav.tsx:176` `<ul>` classes | `h-28 grid-cols-4 grid-rows-2` | `h-14 grid-cols-7` |
| Bar border box | derived | 113 px (112 + `border-t`) | 57 px (56 + 1) |
| `<main>` reserve | `app/admin/layout.tsx:78` | `pb-[calc(8rem+var(--safe-bottom))]` (128 px, 15 px air) | `pb-[calc(5rem+var(--safe-bottom))]` (80 px, 23 px air — the pre-4×2 pairing) |
| Anti-drift | `tests/admin.shell.test.ts` | holds `h-28` ↔ `8rem`, 4 cols, no blank row, 8-char ceiling | must hold `h-14` ↔ `5rem`, 7 cols, one row |

Cell arithmetic at 414 px: today 414/4 = 103.5 px cells (two rows); one row of seven is
414/7 = **59.1 px per cell** — which is exactly the number the current file rejects for
*text* ("51.1 px content box is the exact width of eight characters … nothing to spare")
and which is roomy for a 20–24 px icon: ~17–19 px of air each side. **The one-row
arithmetic was already costed by the file itself; icons are what makes it pass.**

### Key Data Structures

### Constant: `LINKS`
**Location:** `components/admin/AdminNav.tsx:69-116`
**Fields:** `{ href, label, short }` × 7 — Overview, Album ("Nina's album"),
Persona ("Personality"), Images ("Image Generation"), Photos ("Chat photos"), Memory,
Shortcut ("Shortcuts"). `short` renders below `lg`; `label` at `lg`. **After this change
`short` stops being rendered and becomes the accessible name** (and stays the drift-guard
between the two renditions).

### Dependencies

- No icon package exists; all SVGs in the repo are hand-inlined.
- Safe-area insets come from the root layout's `viewport-fit=cover` + `--safe-*` custom
  properties.
- `next/link` is the only import of `AdminNav`.

---

## Icon collection research (R1 — findings, descriptive)

Web research (2026-09-08) across current comparisons:

- **Lucide** (~1,500+ icons, ISC): Feather's maintained fork; 24×24 grid, uniform 2 px
  rounded strokes/caps/joins; the React/shadcn ecosystem default; best consistency.
- **Tabler** (~5,800+, MIT): same 24-grid/2 px rounded system, broader coverage.
- **Phosphor** (~9,000+, MIT): six weights per glyph; strongest if stroke AND fill
  variants of one family are needed.
- Heroicons (MIT, stroke outline set), Material Symbols Rounded (Google) considered and
  set aside: fewer/other idioms.

**Fit to THIS repo:** the bar needs 7 navigation glyphs in ONE weight, stroke-based, at
20–24 px, beside Poppins and `rounded-field` tokens — and the repo's existing hand-drawn
glyphs (TabBar's five, ShareButton's) are already in exactly the Feather/Lucide idiom
(24 viewBox, stroke 2, round caps). **Lucide is the collection**: smallest set that
covers all seven semantics, the very idiom already on screen, and per-icon SVG path data
is copyable verbatim under ISC — which lets the change keep TabBar's *"not worth a
package"* delivery stance (no new dependency).

Candidate per-route mapping (final choice prescribed by the plan; trio distinctness is
the constraint that matters — three "photo-ish" routes must not collide):

| Route | Candidate | Reads as | Alternates |
|---|---|---|---|
| Overview | `layout-dashboard` | admin home panels | `gauge` |
| Album | `images` | a stack/album of pictures | `book-user` |
| Persona | `smile` | her character/personality | `user-round` |
| Images | `wand-sparkles` | how a photo is MADE (generation) | `sparkles` |
| Photos | `camera` | the photographs that were | `image` |
| Memory | `brain` | memory | `book-open` |
| Shortcut | `zap` | quick action | `keyboard` |

Trio check: stack-of-pictures vs magic-wand vs camera — three different silhouettes;
`image` (single picture) as Photos instead would half-collide with Album's `images`.

Sources:
- [Lucide vs Tabler vs Phosphor: Which Free Icon Set Fits Your UI?](https://svgicons.com/articles/lucide-vs-tabler-vs-phosphor-icons)
- [Phosphor Icons vs Lucide](https://allsvgicons.com/compare/phosphor-vs-lucide/)

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `AdminNav` | `components/admin/AdminNav.tsx:118` | def | admin shell |
| `LINKS` | `components/admin/AdminNav.tsx:69` | def · config | admin shell |
| phone grid classes (`h-28 grid-cols-4 grid-rows-2`) | `components/admin/AdminNav.tsx:176` | config | admin shell |
| `<span className="lg:hidden">{link.short}</span>` | `components/admin/AdminNav.tsx:185` | call (render) | admin shell |
| `<AdminNav />` | `app/admin/layout.tsx:79` | call | admin shell |
| reserve `pb-[calc(8rem+var(--safe-bottom))]` | `app/admin/layout.tsx:78` | config | admin shell |
| shell/geometry assertions | `tests/admin.shell.test.ts` (whole file) | test | admin shell |
| AdminNav row + icon stance + no-highlight rule | `components/admin/.workflows/package_readme.md` (~97, ~800, ~1180) | doc | admin shell |
| inline-SVG idiom precedent | `components/ui/TabBar.tsx:312-391`, `components/share/ShareButton.tsx:179` | doc · pattern | ui |

---

## Impact Points (files that WILL need changes)

1. `components/admin/AdminNav.tsx` — owned by phase 1: icons replace `short` text below
   `lg`; grid → one row of seven; `aria-label` names; header comments rewritten (the
   overturned stance must not survive in prose while the code contradicts it); Lucide
   path data inlined in the file's established SVG idiom.
2. `app/admin/layout.tsx` — owned by phase 1: reserve `8rem` → `5rem`, plus the two
   comment blocks that narrate it.
3. `tests/admin.shell.test.ts` — owned by phase 1: re-pin the contract to the new
   geometry; replace the 8-char label-ceiling suite with icon-row equivalents.
4. `components/admin/.workflows/package_readme.md` — owned by phase 1: AdminNav row
   rewritten to the icon bar; keep the no-active-highlighting rule and its reason.

5. `components/admin/ShortcutTable.tsx:372-383` — owned by phase 1 (surfaced by the
   planner; not in the original scan): the `<select>` comment cites *"the stance `AdminNav`
   cites for refusing glyphs"* — a citation this change falsifies. One clause recast,
   markup untouched; `tests/admin.shortcuts.test.ts` verified not to read this comment.

**Not impact points**: `docs/design-brief.md` (contains no icon stance to update —
verified), `components/ui/TabBar.tsx` (precedent, untouched), the `lg` sidebar rendition
(untouched by scope), `app/layout.tsx` (insets already correct).

**This document describes. The plan files prescribe.**
