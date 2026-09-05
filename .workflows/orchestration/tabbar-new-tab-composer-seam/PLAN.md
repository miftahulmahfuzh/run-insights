# Plan: the `+` becomes a "New" tab, and the composer sits flush on the bar

**Slug:** tabbar-new-tab-composer-seam
**Date:** 2026-09-05 05:14 +07
**Analysis:** `20260905-051414-T4B7_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/tabbar-new-tab-composer-seam`
**Branch:** `feature/tabbar-new-tab-composer-seam` (base: `origin/main` @ `e343e34`)
**Phases:** 2
**Status:** phase 1/2 complete
**Coordinator:** —

---

## Why

The user's request, verbatim:

```
1. UI revamp: replace the + button to a normal "new" text that does not take more space outside the bottom bar
2. user query dan bottom bar tidak menempel dengan baik, ada gap. check this screenshot
```

The screenshot showed `/nina` with the tab bar revealed: the coral `+` circle overhanging the bar's
top edge and painting over a message bubble, and a band of conversation visible between the
composer's bottom border and the bar's top border.

**They are one mechanism.** The composer clears `58 + 20 = 78` px because the FAB reaches 20 px
above the bar's top edge; the bar's top edge is at `59` px; the difference is the reported gap. See
*The 19 px band* in the analysis for the derivation. R1 removes the overhang, which removes 18 of
the gap's 19 px; the last 1 px is the bar's `border-t`, which no clearance term has ever accounted
for, and R2 is that fix.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Replace the `+` button with a normal "new" text control that does not take up space outside the bottom bar | 1 (card #87) |
| R2 | The query bar and the bottom bar do not sit flush — there is a gap; close it | 2 (card #88) |

## Scope

**In scope**

- `components/ui/TabBar.tsx` — `/upload` demoted from a raised FAB to a fifth tab cell labelled
  `New`; `TAB_BAR_FAB_OVERHANG_PX` deleted; the hide transform simplified; new
  `TAB_BAR_BORDER_PX` / `TAB_BAR_OUTER_HEIGHT_PX`.
- The three places that compose the bar's clearance: `ChatChrome`, `ChatScreen`, and the doc
  comments in `lib/nina/chatview.ts` and `lib/nina/chrome.ts` that state the arithmetic.
- The two geometry test files, plus one new source-scan test that holds R1 and R2 in place.
- `components/ui/AppShell.tsx`, `components/nina/NinaSidebar.tsx`,
  `components/nina/Composer.tsx` — comments that name a constant that no longer exists or a number
  that changed.
- `ROADMAP_v0.1.0.md` §4.8's Upload row.

**Out of scope**

- **The reveal behaviour.** `nextBarState`, `autoHideDelayMs`, `CHROME_AUTOHIDE_MS`,
  `isControlVisible` and `barToggleGlyph` are untouched: the bar still hides by default on `/nina`,
  still auto-hides after 5 s, and the `^`/`v` control still toggles it. Only the geometry moves.
- **The keyboard branch.** `keyboardOverlapPx` and the `overlapPx > 0` early return in
  `composerBottomCss` are untouched — every term of the clearance is behind the keyboard, so no
  keyboard case changes by a pixel.
- **`BOTTOM_GAP.tabs`'s value.** It stays `6rem`; only its comment changes. See Decisions D6.
- **The four tabbed screens' layout.** `/`, `/upload`, `/trends`, `/me` gain a fifth caption in
  the bar and lose a coral circle above it, and nothing else about them changes.
- **The unread badge.** `ninaBadge` stays a `ReactNode` prop on Nina's cell.
- **`.workflows/package_readme.md`**, which names `TAB_BAR_FAB_OVERHANG_PX` nine times. Knowingly
  left to the post-set `readme-updater` rather than assigned to a phase: it is already independently
  stale (it states `BOTTOM_GAP.chat = 8.5rem` where the code says `7.5rem`), so a phase editing it
  would be repairing drift it did not cause. Both phases' exit greps therefore exclude
  `.workflows/**` — see Decisions D10.
- No new dependency, no jsdom, no keyframe.

## Invariants

Every phase must leave all of these true:

1. **The tree is green at the end of each phase**: `npx tsc --noEmit`, `npm run lint`, and
   `npx vitest run` all pass. No phase may leave a deleted export imported anywhere.
2. **No part of `<nav id="main-tab-bar">` paints above its own border box** — from the end of
   phase 1 onwards. This is R1's whole point, and the thing a later phase must not undo.
3. **One spelling per number, and the mirror is stated.** Where Tailwind needs an arbitrary value
   (`h-[58px]`, `border-t`) and TypeScript needs the same number, the constant carries a comment
   saying which class it mirrors. This file's existing constants do that; new ones must too.
4. **`lib/` never imports `components/`.** `composerBottomCss` and `controlBottomCss` keep taking
   the clearance as a parameter. Neither signature changes in either phase.
5. **The hidden state stays the default on `/nina`.** `NINA_BAR_VISIBLE_VAR` is absent unless the
   bar is showing, `var()` substitutes `0`, and the composer's SSR/pre-hydration position is the
   hidden geometry. No phase may make the shown geometry the default.
6. **`AppShell`'s `chat` padding stays fixed, not dynamic.** Closing the gap must not be done by
   making the document's bottom padding follow the reveal — that moves the scroll position on every
   toggle and `MessageList`'s auto-scroll would chase it (see `AppShell.tsx`'s own comment).
7. **No rendered-DOM test, no jsdom.** `vitest.config.ts` is `environment: 'node'`. Rules about
   markup are asserted by scanning source text with `tests/support/importGraph.ts`'s
   `readRepoCode`, the technique `tests/nina.sidebarProvider.test.ts` and `tests/share.bundle.test.ts`
   established. Importing constants from a `.tsx` into a test is fine — `tests/panel.render.test.ts`
   and `tests/badges.render.test.ts` already import components.
8. **Comments that assert arithmetic are part of the change.** This repo's geometry is documented in
   prose in six files, and a comment that still says 78 after the number is 59 is how the next
   reader concludes the code is wrong. Every doc site in the analysis's reference list is owned by
   exactly one phase.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The `+` becomes the `New` tab, and the overhang is deleted | R1 | `components/ui`, `components/nina`, `lib/nina`, `tests`, docs | 9 | — | NORMAL | `.workflows/plan/tabbar-new-tab-composer-seam/phase-1.md` | `P1-RI-A015` | `miftahulmahfuzh/run-insights#87` |
| 2 | The composer clears the bar's outer height, so it sits flush | R2 | `components/ui`, `components/nina`, `lib/nina`, `tests` | 9 | 1 | NORMAL | `.workflows/plan/tabbar-new-tab-composer-seam/phase-2.md` | `P1-RI-A016` | `miftahulmahfuzh/run-insights#88` |

Sequential by necessity, not by caution: phase 1 **deletes** `TAB_BAR_FAB_OVERHANG_PX`, and phase 2
edits the same two `const … = TAB_BAR_HEIGHT_PX + …` lines that phase 1 rewrites, in the same two
files. Two sessions on those lines at once is a conflict, and phase 2's quoted "before" state is
phase 1's "after".

### Phase 1 — The `+` becomes the `New` tab, and the overhang is deleted

**Satisfies:** R1

**Owns:**

- `components/ui/TabBar.tsx`:
  - `/upload` moves into `TABS` as the **third of five** entries, so it keeps the centre cell
    (`(2 + 0.5) / 5 = 50 %`), and renders through the existing `Tab` component: a `size-5` glyph
    above a `text-[10px]` caption, exactly like the other four.
  - The caption is `New` (D1). The glyph is the FAB's own `+` path, `M12 5v14M5 12h14` (D2).
  - The tab is coral at rest and coral when active (D3), which needs one new optional prop on
    `Tab` — `accent?: boolean` or equivalent — replacing the `active ? 'text-ink' : 'text-ink-3'`
    pair for this one cell. `aria-current="page"` on `/upload` is unchanged.
  - The hand-written `<Link className="absolute -top-5 left-1/2 … size-14 … bg-z5">` and its
    `flex justify-center` wrapper are deleted. `relative` comes off the grid container — nothing is
    positioned against it any more (`Tab`'s badge span carries its own `relative`).
  - `TAB_BAR_FAB_OVERHANG_PX` is **deleted**, and the hide transform becomes `translate: '0 100%'`
    with its `calc()` gone. The header comment that derives `safe + 78` is replaced by the reason
    `100%` is now sufficient: the bar's border box is the whole of the bar.
  - The file header's FAB argument — "Upload is still not a peer of the other four", the 37.5 % vs
    50 % derivation, the `left-1/2 -translate-x-1/2` paragraph — is rewritten to record what the
    bar is now **and why it changed**: the repo owner asked for a normal caption that takes no space
    outside the bar. Do not silently delete the argument; it is the reason the shape existed.
- `components/nina/ChatChrome.tsx:77` and `components/nina/ChatScreen.tsx:99`: the clearance
  becomes `TAB_BAR_HEIGHT_PX` alone (58), and the `TAB_BAR_FAB_OVERHANG_PX` import is dropped from
  both. **Also phase 1's**, added at reconciliation: `ChatChrome.tsx:222-226`, the floating lane's
  comment, rewritten to name **no** constant so phase 2 never has to reopen it. **58, not 59** — the border term is phase 2's, and a phase that lands both leaves phase 2
  with nothing to do and R2 with no commit of its own.
- `lib/nina/chrome.test.ts:18` — `BAR_CLEARANCE` becomes `58` and its comment stops naming the
  deleted constant. Every `controlBottomCss` expectation that contains a computed total moves with
  it.
- `lib/nina/chatview.test.ts:218–249` — the five `composerBottomCss(0, 78)` inputs become `58`,
  and the comments that call 78 "the idle clearance" follow.
- `components/ui/AppShell.tsx` — `BOTTOM_GAP.tabs`'s comment (it attributes 20 px to the FAB) and
  `BOTTOM_GAP.chat`'s comment (it names the deleted constant). **Neither value changes** (D6).
- `components/nina/NinaSidebar.tsx:166–167` — comment naming the deleted constant.
- `ROADMAP_v0.1.0.md:484` — the Upload row's note is rewritten: a normal fifth tab, centre cell,
  coral caption, no overhang; and the sentence recording that F33's 37.5 %→50 % argument is
  superseded rather than wrong.
- **New test**, `tests/tabbar.geometry.test.ts` (phase 1 creates it; phase 2 extends it): scan
  `components/ui/TabBar.tsx` with `readRepoCode` and assert the bar has no overhang — no `-top-5`,
  no `size-14`, no `absolute`, no `bg-z5` as a filled circle — and that the hide transform is
  `0 100%` with no `calc`. Assert `New` is the caption and `/upload` is in `TABS`. Follow
  `tests/nina.sidebarProvider.test.ts`'s docstring style: say what production bug the assertion
  exists to catch.

**Does not touch:**

- `lib/nina/chatview.ts` and `lib/nina/chrome.ts` — **the source files.** Phase 1 changes what the
  callers pass, not what the functions do, and their doc comments enumerate the terms of a sum that
  phase 2 finishes changing. One phase owns each doc site; these two are phase 2's.
- `components/nina/Composer.tsx` — its header's "clears 78 px" is phase 2's, for the same reason.
- Any value in `BOTTOM_GAP`. Comments only.
- The reveal state machine, the keyboard branch, the unread badge.

**Exit criteria:**

- `TAB_BAR_FAB_OVERHANG_PX` does not appear anywhere in the repo — `grep -rn TAB_BAR_FAB_OVERHANG_PX --include='*.ts' --include='*.tsx' --include='*.md' .` (excluding `node_modules` and the
  three historical `*_code_analyzer.md` files and prior `*_PLAN.md` files, which are records of
  their own moment and are not edited) returns only this plan set's own files.
- `components/ui/TabBar.tsx` contains no `absolute`, no `-top-`, and no `size-14`.
- The bar renders five captions: Runs, Nina, New, Trends, Me.
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` green.
- The composer clears 58 px while the bar shows — a 1 px seam remains, and that is phase 2's.

### Phase 2 — The composer clears the bar's outer height, so it sits flush

**Satisfies:** R2

**Owns:**

- `components/ui/TabBar.tsx` — **additive only**: two new exported constants beside
  `TAB_BAR_HEIGHT_PX`.
  ```
  export const TAB_BAR_BORDER_PX = 1                                              // mirrors `border-t`
  export const TAB_BAR_OUTER_HEIGHT_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX     // 59
  ```
  Each with the comment invariant 3 requires: which Tailwind class it mirrors, and that a change to
  the class changes the constant. `TAB_BAR_HEIGHT_PX` stays — it is the grid's own height and the
  thing `border-t` is added to. Nothing else in this file changes; phase 1's markup is final.
- `components/nina/ChatChrome.tsx` — `BAR_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX`, import updated.
- `components/nina/ChatScreen.tsx` — `COMPOSER_CLEARANCE_PX = TAB_BAR_OUTER_HEIGHT_PX`, likewise.
  Both keep their existing comments' *shape* — a named constant with a one-line derivation — with
  the derivation rewritten to "the bar's outer height: its grid plus the `border-t` the grid sits
  under", and a sentence recording the measured bug: the border was never in the sum, so the
  composer floated 1 px above the bar even after the FAB was gone.
- `lib/nina/chatview.ts` — `composerBottomCss`'s doc comment. It currently enumerates "the bar's
  own height, the FAB's overhang above the bar's top edge, and the home-indicator inset". The
  overhang term is gone and the border term is new. The `--safe-bottom`-is-outside-the-multiplier
  paragraph stays exactly as it is — it is still true and still the reason the composer is not
  padded twice. **No signature change, no behaviour change** (invariant 4).
- `lib/nina/chrome.ts` — `controlBottomCss`'s docblock (`:167-185`) and `barClearancePx`'s JSDoc
  (`:189`), which names the two old constants and becomes `TAB_BAR_OUTER_HEIGHT_PX`. **This is the
  edit that makes phase 1's repo-wide grep true** (D9).
- Added at reconciliation, each in a file no other phase opens: `components/ui/TabBar.tsx:45-50`
  (`TAB_BAR_HEIGHT_PX`'s docblock, which still claims the composer reads it), `lib/nina/chatview.ts:189`
  ("a 78 px settle"), and `components/nina/Composer.tsx:92` (the `obstructedBottomPx` paragraph).
- `components/nina/Composer.tsx:34,86` — the header's "clears 78 px of" becomes 59, with the
  reason.
- `lib/nina/chrome.test.ts` — `BAR_CLEARANCE` 58 → 59 and its comment; the `controlBottomCss`
  expectations that carry a computed total move with it.
- `lib/nina/chatview.test.ts` — the clearance inputs 58 → 59, and the assertion strings.
- `tests/tabbar.geometry.test.ts` — extended: `TAB_BAR_OUTER_HEIGHT_PX === TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX`,
  `TAB_BAR_BORDER_PX === 1`, and — the assertion that actually holds R2 — that the clearance both
  `ChatChrome` and `ChatScreen` compose is the **outer** height and not the grid height, so that
  re-introducing the 1 px gap fails a test rather than shipping. A source scan is acceptable for
  that last one if importing the two client components into the suite proves awkward; say in the
  test's docstring which technique was used and why.

**Does not touch:**

- Any markup in `components/ui/TabBar.tsx`. Phase 1 owns the bar's shape; phase 2 adds two
  constants and reads them.
- `composerBottomCss` and `controlBottomCss`'s **bodies and signatures** — the clearance is a
  parameter and stays one. Only the callers' constants and the doc comments change.
- `BOTTOM_GAP` in `AppShell.tsx`, in value or comment — phase 1 finished it.
- `ROADMAP_v0.1.0.md` — phase 1 finished it.
- The keyboard branch, the reveal state machine.

**Exit criteria:**

- With the bar shown and no keyboard, `composerBottomCss(0, COMPOSER_CLEARANCE_PX)` returns
  `calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))`, so the composer's bottom edge
  lands exactly on the bar's top border: zero gap, and no overlap.
- No literal `78` remains in any live geometry site — `grep -rn "78" lib/nina/chatview.ts lib/nina/chrome.ts lib/nina/chatview.test.ts lib/nina/chrome.test.ts components/nina/Composer.tsx components/nina/ChatChrome.tsx components/nina/ChatScreen.tsx` finds no clearance figure (unrelated numbers such as `TEXTAREA_MAX_PX` are not clearance and stay).
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` green.

## Reconciliation Log

Both planners ran blind to each other and both, independently, surfaced conflict 1 below — which is
the one that would have stopped a phase session cold.

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| 1 | Phase 1's exit criterion demands `TAB_BAR_FAB_OVERHANG_PX` appear nowhere in the repo, but the phase boundary hands `lib/nina/chrome.ts` — whose `:189` JSDoc names it — to phase 2. Both cannot hold at the end of phase 1 | 1, 2 | Ownership wins (D9). Phase 1's criterion narrows to "no **executable** reference"; phase 2's Step 6 clears the JSDoc and is named as what makes the repo-wide grep true |
| 2 | `.workflows/package_readme.md` names the constant 9×, and three root `*_code_analyzer.md` files and several `*_PLAN.md` files name it too. None is owned by any phase, so a repo-wide grep could never go green | 1, 2 | Both exit greps exclude `.workflows/**`, `*_code_analyzer.md` and `*_PLAN.md` (D10); the readme goes to the post-set `readme-updater`, and the Scope section says so |
| 3 | `ChatChrome.tsx:222-226` (the floating lane's comment) named the deleted constant and sat in a file both phases open | 1, 2 | Phase 1 rewrites it to name **no** constant, so phase 2 never reopens it. Phase 2's draft Step 2c was deleted outright |
| 4 | `AppShell.tsx:66` said "the composer rises 78px" — a number phase 1 would set to 58 and phase 2 to 59, in a file the index gives to phase 1 alone | 1 | Phase 1 removes the number rather than updating it: "rises by the bar's clearance". Phase 2 has nothing to do in `AppShell.tsx` |
| 5 | Three doc sites (`TabBar.tsx:45-50`, `chatview.ts:189`, `Composer.tsx:92`) were stale under invariant 8 but named in neither Owns list | 2 | Assigned to phase 2, each being in a file it already owns |
| 6 | Phase 2's plan opened with an unconditional `npm ci`, which mid-set is a known way to break a peer | 2 | Softened to "only if `node_modules` is absent". `npm ci` has already been run in the worktree, and `npx vitest run lib/nina/chrome.test.ts lib/nina/chatview.test.ts` passes **48/48** on the unmodified tree — recorded in both plans as the pre-change baseline |
| 7 | The index's Files counts (8 and 7) were both low | 1, 2 | Corrected to 9 and 9; the Package column corrected with them |
| 8 | Phase 1 left `/upload`'s accessible name thinning to "New" as a possible follow-up card | 1 | Decided and closed as D8; the handoff is dropped |

Two rounds were not needed: no interface contract changed, because phase 2 is additive to
`TabBar.tsx` and phase 1 leaves `TAB_BAR_HEIGHT_PX` and its declaration site byte-for-byte intact.

## Decisions

D1-D7 were decided at Step 6, before the phase plans were written; D8-D10 at Step 8, from what
reconciliation surfaced. Every one is overturnable for the price of one commit.

| Fork | Chosen | Rung |
|---|---|---|
| D1 · the caption's word | `New` | user's raw input — he wrote `a normal "new" text`; title case follows Runs/Nina/Trends/Me |
| D2 · does the glyph survive | yes, the FAB's own `+` path at `size-5`, above the caption | user's raw input — the objection is to a control taking space *outside* the bar, not to the `+` |
| D3 · does coral survive | yes: coral at rest and when active, via one new optional prop on `Tab` | user's raw input + surrounding convention — §4.8's "coral" and "the one flow that matters" are untouched by a request about space |
| D4 · the centre cell | `/upload` stays the third of five, `grid-cols-5` unchanged | surrounding convention — F33 made the centre claim literally true and nothing here disputes it |
| D5 · how R2 is expressed | a new `TAB_BAR_OUTER_HEIGHT_PX = TAB_BAR_HEIGHT_PX + TAB_BAR_BORDER_PX`, used as the clearance | surrounding convention — the file already exports one constant per Tailwind literal it must not disagree with, and a caller cannot forget a term that is inside the constant |
| D6 · `BOTTOM_GAP.tabs` | keep `6rem`; change only its comment | the ask — the user reported a gap between two *bars*, not too much padding under the content; shrinking it would change four screens nobody complained about |
| D7 · flush vs 1 px overlap | flush: the composer's bottom edge on the bar's top border | the ask — "tidak menempel dengan baik" asks for the two to touch, and an overlap would hide the bar's own rule under `bg-paper/90` |
| D8 · `/upload`'s accessible name, once `aria-label="Upload a run"` is deleted | it becomes the visible caption, `New`. No `ariaLabel` escape hatch on `Tab` | surrounding convention + the user's raw input — the four peer tabs already rely on their captions, and an accessible name of "Upload a run" over a visible "New" would violate WCAG 2.5.3 (Label in Name) rather than help. Not a follow-up card |
| D9 · who clears `lib/nina/chrome.ts:189`, the JSDoc naming the deleted constant | phase 2, whose file it is; phase 1's exit grep narrows to "no **executable** reference" | 2: phase exit criteria vs the index's own phase boundaries — the boundaries exist so two sessions never open one file, and a criterion is cheaper to narrow than an ownership line is to cross |
| D10 · what the exit greps may see | `.workflows/**`, `*_code_analyzer.md` and `*_PLAN.md` are excluded; `.workflows/package_readme.md` is left to the post-set `readme-updater` | 4: the index's Scope — those files are records of their own moment, and the readme is independently stale, so a phase editing it would repair drift it did not cause |

## Open Questions

**None.** Every fork this set raised was decidable, and each is recorded above with the rung that
decided it. Nothing here is irreversible: the whole set is a paint change on a feature branch that
has not been merged, so the floor on being wrong is one `git revert`.

## Rollback

Per phase: `git revert` the phase's commit. The set is `--no-ff`-mergeable, so each phase commit
stays reachable and per-phase revert survives branch deletion.

Phase 2 alone reverts cleanly — the bar returns to a 1 px seam under the composer and nothing else
changes. Phase 1 alone does **not** revert cleanly once phase 2 has landed: phase 2's
`TAB_BAR_OUTER_HEIGHT_PX` is declared beside constants phase 1 rewrote, so reverting phase 1 under
phase 2 reinstates `TAB_BAR_FAB_OVERHANG_PX` while the clearance still reads the outer height, and
the FAB returns overhanging a composer that no longer clears it. To back the whole thing out,
revert 2 then 1, or drop the branch.

As a whole: the branch is not merged, so `git branch -D feature/tabbar-new-tab-composer-seam` and
`git worktree remove` is the complete rollback.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan TABBAR_NEW_TAB_COMPOSER_SEAM_PLAN.md
