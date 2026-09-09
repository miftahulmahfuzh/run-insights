# Plan: Admin bottom bar — icons on one row

**Slug:** admin-bottom-bar-icons
**Date:** 2026-09-08 15:18
**Analysis:** `20260908-151840-B7A2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-bottom-bar-icons`
**Branch:** `feature/admin-bottom-bar-icons` (base: `origin/main` @ `18b0c58`)
**Phases:** 1
**Status:** complete — 1/1 phases landed on `feature/admin-bottom-bar-icons`; a phase is complete when its row in the Phases table is ticked ✅; the set is reviewed and merged as a whole
**Coordinator:** —

## Why

> cari koleksi icons yang paling tepat di web. replace semua text pada bottom bar menjadi
> icon. atur spacing dan size icon sedemikian rupa sehingga bottom bar hanya perlu satu
> baris saja pada xsmax saya. saat ini bottom bar memakan 2 baris text

The owner operates `/admin` from an XS Max; the seven-route bar wraps to two rows of
text and he wants one row of icons.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Find the most appropriate icon collection on the web | 1 |
| R2 | Replace all text on the bottom bar with icons | 1 |
| R3 | Icon size + spacing such that the bar fits ONE row on the XS Max | 1 |

## Scope

**In scope:** the below-`lg` bottom-bar rendition of `AdminNav` — its labels, its grid
geometry, the paired `<main>` reserve, the test that pins the pair, and the
comments/readme that narrate the old text stance.

**Out of scope:** the `lg` sticky text sidebar (the request names the bottom bar);
active-link highlighting (a standing readme rule — not requested); `components/ui/
TabBar.tsx` and the runner's tabs; `docs/design-brief.md` (contains no icon stance —
verified); any new npm dependency.

## Invariants

1. The tree builds and `lint`, `typecheck`, `test` (vitest) pass at the end of the phase.
2. `AdminNav` stays a server component with no active-link highlighting.
3. Every icon-only link keeps an accessible name; every `<svg>` is `aria-hidden`.
4. The bar's grid height and the layout's `<main>` reserve are changed TOGETHER, and
   `tests/admin.shell.test.ts` pins the new pair (`h-14` ↔ `5rem`).
5. The `lg` sidebar renders byte-identically to today.
6. No new npm dependency — Lucide arrives as inlined SVG path data (ISC), in the file's
   established inline-SVG idiom.
7. Safe-area mechanics (`--safe-left/right/bottom`, `max-w-[470px] mx-auto` row)
   unchanged.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Icon-only one-row bottom bar | R1, R2, R3 | admin shell | 5 | — | NORMAL | `.workflows/plan/admin-bottom-bar-icons/phase-1.md` | P1-CA-A004 | — |

### Phase 1 — Icon-only one-row bottom bar
**Satisfies:** R1, R2, R3
**Owns:** `components/admin/AdminNav.tsx` (icons, `grid-cols-7` one row, sr-only names,
comment rewrite, inlined Lucide paths), `app/admin/layout.tsx` (reserve `8rem` → `5rem`),
`tests/admin.shell.test.ts` (re-pin geometry contract), `components/admin/.workflows/
package_readme.md` (AdminNav row + the dead `:800` citation), `components/admin/
ShortcutTable.tsx` (one comment clause at `:372-383` whose AdminNav attribution this
change falsifies — folded in at finalization; no markup).
**Does not touch:** the `lg` sidebar rendition's markup and classes, `components/ui/
TabBar.tsx`, `docs/design-brief.md`, any route page, `package.json`.
**Exit criteria:** at 414 px the bar is one 56 px row of seven distinct Lucide glyphs
with accessible names; `<main>`'s reserve is `5rem`; the test file pins the new pair and
passes; all gates green.

## Reconciliation Log

single phase — nothing to reconcile

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Plain-text stance ("an icon is a guess", AdminNav header + readme) vs the request | Icons on the bottom bar — the owner's own sentence overturns the stance; both comment sites are rewritten so prose stops contradicting code | 5: user's raw input |
| Icon collection: Lucide vs Tabler vs Phosphor | **Lucide** — matches the repo's existing Feather-idiom glyphs exactly (24 grid, 2 px round strokes), smallest set covering all seven semantics | 3: analysis (web research) |
| Delivery: `lucide-react` dependency vs inlined path data | **Inlined SVG paths** — TabBar's recorded stance ("N glyphs is not worth a package"); seven is the same arithmetic; no bundle/codegen change | 6: surrounding convention |
| Scope: does `lg` sidebar also go icon? | No — the request names the *bottom bar*; the sidebar is a different rendition and stays text | 5: user's raw input (scope) |
| `short` strings after text disappears | Kept — they become the accessible names (`aria-label`), still guarding the two renditions against drift | 2: phase exit criteria (a11y) |
| Album/Images/Photos trio glyphs | `images` / `wand-sparkles` / `camera` — three different silhouettes for three near-synonymous routes | 3: analysis |

## Open Questions

(empty — normal outcome)

## Rollback

Single phase, single commit: `git revert <phase-1 sha>` on `feature/admin-bottom-bar-icons`.
No migrations, no generated assets, no data.

## Next

Execute the phase:

    /implement -f ADMIN_BOTTOM_BAR_ICONS_PLAN.md --phase 1

Or run it as a swarm:

    /analyze-orchestrator -f ADMIN_BOTTOM_BAR_ICONS_PLAN.md
