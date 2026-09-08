# Plan: the composer's gap, size and glass — and the `/admin` install's notch tint

**Slug:** composer-frost-and-admin-notch
**Date:** 2026-09-07 13:05:00 +07
**Analysis:** `20260907-130500-CMPZ_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/composer-frost-and-admin-notch`
**Branch:** `feature/composer-frost-and-admin-notch` (base: `origin/main` @ `e6c68d6`)
**Phases:** 2
**Status:** code-complete — both phases landed on `feature/composer-frost-and-admin-notch` (phase 1 `7f8435d`, phase 2 `c93bf52`); a phase is complete when its row in the Phases table is ticked ✅
**Coordinator:** `orch-composer-frost-and-admin-notch` (swarm; ledger at `.workflows/orchestration/composer-frost-and-admin-notch/ledger.json`)

---

## Why

The user's words, verbatim:

> UI update: ada gap diantara chat query field dengan bagian bawah. hilangkan gap ini
> sekalian bikin section query field dibawah itu lebih kecil jadi lebih makan lesser space,
> trus bikin backgroundnya frosted glass, persis kaya small buttons < and up
>
> selain itu.. kita sudah berhasil bikin homepage shortcut untuk profile page.. make sure batas
> atas di xs max top notch is white, so it is kind of blend in with the UI

And, confirming what "profile page" names:

> yes /admin is the profile page, that's correct

Two of these have a recorded precedent in this repo, in the same voice one iteration earlier.
`lib/nina/chrome.ts:62` sets the floating controls to 32 px — below the iOS floor — *"at the repo
owner's explicit request: 'much smaller (take much smaller space in the chat UI)'"*, and
`lib/nina/chrome.ts:92` gives those same controls `bg-card/40` over a real blur, *"FROSTED GLASS,
as asked for"*. R2 and R3 ask for the composer to follow the controls it sits under. R3 says so
outright: *persis kaya small buttons `<` and `up`*.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Remove the gap between the chat query field and the bottom of the screen | 1 |
| R2 | Make the query-field section take less vertical space | 1 |
| R3 | Frosted-glass background, exactly like the small `<` and `up` buttons | 1 |
| R4 | On the `/admin` home-screen shortcut, the top notch band blends with the UI | 2 |

**R1, R2 and R3 share one phase deliberately, and that coupling is real.** All three change one
JSX element — `components/nina/Composer.tsx:352-357` — and two of them change the same vertical
arithmetic that is hand-copied into four files. Split three ways, each phase would edit the same
two lines and the same constants, so two of them would have to declare a dependency on the first
and the set would run strictly serially anyway. One phase, three Rs, no lost parallelism.

R4 shares no file with them, so phase 2 declares no dependency and the two run concurrently.

## Scope

**In scope**

- The composer bar's `bottom`, its own bottom padding, its inner vertical padding and its fill
  (`components/nina/Composer.tsx`).
- The two pure geometry functions that decide those (`lib/nina/chatview.ts`,
  `lib/nina/chrome.ts`) and their tests — plus `tests/tabbar.geometry.test.ts`, the third file that
  asserts one of those return strings verbatim.
- The three places the composer's resting height is hand-copied (`lib/nina/chrome.ts`,
  `components/nina/ChatScreen.tsx`, `components/ui/AppShell.tsx`).
- A `viewport` export on `app/admin/layout.tsx`, and the dark value `ADMIN_INSTALL` is missing.

**Out of scope, and why**

- **`APPLE_WEB_APP.statusBarStyle`.** It stays `'default'`. `lib/pwa.ts:70-88` states the
  prerequisite for `'black-translucent'` — every fixed top element padding by
  `env(safe-area-inset-top)` — and records it as *"half done"*: `/admin` and `ScreenshotStrip`
  pad, `ScreenHeader` and the pages under `app/` do not. R4 is a tint, and does not need it.
- **The runner's own install contract.** `INSTALL`, `app/manifest.ts` and the root
  `viewport.themeColor` are untouched: R4 is about the `/admin` tile only, and the root pair is
  still correct for every other route.
- **The 44 px control size and the 16 px textarea font.** See invariants 3 and 4.
- **`TAB_BAR_OUTER_HEIGHT_PX` and the 59 px clearance.** The tab-bar seam is already flush and
  nobody reported it; R1 is the region *below* the composer when the bar is hidden.
- **The tab bar's own `--safe-bottom` padding**, and the four `tabs` screens' `BOTTOM_GAP`.

## Invariants

1. **Every phase builds and tests green on its own**: `npm run lint`, `npx tsc --noEmit`,
   `npx vitest run`, `npm run build` all pass at the end of each phase.
2. **The composer's resting height is stated in exactly four places and they agree** — the markup
   in `Composer.tsx`, `COMPOSER_RESTING_PX`, `ChatScreen`'s `COMPOSER_FALLBACK_PX` literal, and
   `AppShell`'s `BOTTOM_GAP.chat` literal. A phase that changes one changes all four. No fifth
   place is introduced.
3. **The 44 px iOS tap floor holds inside the composer.** Every round control stays `size-11` and
   the textarea keeps `min-h-11`. R2's space comes from padding only.
4. **The textarea's font stays 16 px.** No `text-[…]` smaller than `text-base` is added to it;
   `app/globals.css` forces `max(16px, 1rem)` because Safari zooms the viewport on focus below it.
5. **The home-indicator inset is counted exactly once in the composer stack.** It is either in an
   element's offset or in its padding, never both — the failure `Composer.tsx:39-41` names.
6. **`viewportFit: 'cover'` stays resolved for every route under `/admin`**, or
   `env(safe-area-inset-*)` goes inert and the admin shell's four-inset padding silently stops
   working.
7. **No user-visible change to any screen outside `/nina` and `/admin`.**
8. **No new database migration, no schema change, no network call.** Neither phase touches either.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The composer: paint to the edge, take less room, frost the glass | R1, R2, R3 | `components/nina` + `lib/nina` + `components/ui` + `tests` | 8 | — | HARD | `.workflows/plan/composer-frost-and-admin-notch/phase-1.md` | `P1-RI-A023` | miftahulmahfuzh/run-insights#133 |
| 2 ✅ | The `/admin` install's own status-bar tint | R4 | `app/admin` + `lib` + `tests` | 3 | — | NORMAL | `.workflows/plan/composer-frost-and-admin-notch/phase-2.md` | `P1-RI-A024` | miftahulmahfuzh/run-insights#134 |

### Phase 1 — The composer: paint to the edge, take less room, frost the glass

**Satisfies:** R1, R2, R3

**Owns:**
- `lib/nina/chatview.ts` — `composerBottomCss` changes shape; a companion
  `composerPadBottomCss` is added beside it.
- `lib/nina/chatview.test.ts` — the `composerBottomCss` block (lines 218-256, the file's tail) asserts exact
  strings and must be rewritten, plus new cases for the companion.
- `components/nina/Composer.tsx` — the fixed element's `bottom` + `padding-bottom` pair (R1), the
  inner `py-3` (R2), and the fill/blur/border (R3). **Only lines 352-357 change.** The reply
  strip, the tiles, the picker, the textarea and the send button are untouched.
- `lib/nina/chrome.ts` — `COMPOSER_RESTING_PX` 68 → 60, and `controlBottomCss`'s inset term is
  gated on the bar variable (see Decisions D2).
- `lib/nina/chrome.test.ts` — `controlBottomCss`'s assertions follow.
- `components/nina/ChatScreen.tsx` — `COMPOSER_FALLBACK_PX`'s `68` literal → `60`, and it passes
  the new pad value to `Composer`.
- `components/ui/AppShell.tsx` — `BOTTOM_GAP.chat` `7.5rem` → `7rem`, with its arithmetic comment
  updated to the new sum.
- `tests/tabbar.geometry.test.ts` — the file's last `it` (188-196) asserts `composerBottomCss`'s
  exact return string, which D2 changes, so it goes red the moment this phase's Step 1 lands. One
  `expect` and one comment line. **Added by the reconciler**: it was in neither phase's `Owns` list
  in the draft, and Phase 2 does not touch it. Its other four `it`s read `ChatChrome.tsx` and
  `ChatScreen.tsx` as text and keep passing.

**Does not touch:** `components/ui/TabBar.tsx`, `BOTTOM_GAP.tabs`, `CHROME_CONTROL_PX`,
`CHROME_CONTROL_GAP_PX`, `NINA_CHROME_CONTROL_CLASS` itself, anything under `app/admin`, or
`lib/pwa.ts`.

**Exit criteria:**
1. With `--nina-bar-visible: 0` (the resting state) the composer's painted box reaches the bottom
   of the viewport — no unpainted `--safe-bottom` strip — and its content still sits above the
   home indicator.
2. With `--nina-bar-visible: 1` the composer is still flush on the tab bar's top edge: no seam,
   no overlap.
3. With the keyboard up, the composer sits on the keyboard's top edge with **no** extra inset
   padding.
4. The floating `<` / `up` lane clears the composer's Send button in all three states.
5. The composer's resting height is 60 px and all four sites in invariant 2 say so.
6. The bar's fill, blur and saturation match `NINA_CHROME_CONTROL_CLASS`; its top hairline reads
   at the same weight as the controls' ring.
7. `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` all pass.

### Phase 2 — The `/admin` install's own status-bar tint

**Satisfies:** R4

**Owns:**
- `lib/pwa.ts` — `ADMIN_INSTALL` gains `paperDark: '#162834'` (`--paper-2`, dark, from
  `app/globals.css:81`). **Appends only**; `INSTALL`, `APPLE_WEB_APP` and `ADMIN_PWA_ICONS` are
  not edited.
- `app/admin/layout.tsx` — a new `export const viewport: Viewport` carrying **only**
  `themeColor`, beside the existing `metadata` export, with the docstring that explains why only
  that one key (see Decisions D7).
- `tests/pwa.install.test.ts` — cases asserting the admin pair's two colours, that they differ
  from the root pair, and that `ADMIN_INSTALL.paper` still equals the admin manifest's
  `theme_color`.

**Does not touch:** the root `app/layout.tsx`, `app/manifest.ts`, `INSTALL`,
`APPLE_WEB_APP.statusBarStyle`, `app/admin/manifest.webmanifest/route.ts`, or any file under
`components/`.

**Exit criteria:**
1. `app/admin/layout.tsx` exports `viewport: Viewport` whose `themeColor` is a media-matched pair of
   `ADMIN_INSTALL.paper` (light) and `ADMIN_INSTALL.paperDark` (dark), written as constant names and
   not as hex literals.
2. That export has **exactly one key**. `viewportFit`, `width`, `initialScale` and `colorScheme` do
   not appear inside the object literal, and the literal carries no comments — `viewportFit: 'cover'`
   stays resolved for `/admin` by inheritance, not by restatement (invariant 6, D7).
3. `ADMIN_INSTALL.paperDark === '#162834'`, `ADMIN_INSTALL.paper === '#f1f7fb'`, neither is
   `#ffffff` (D6), and both differ from the corresponding `INSTALL` value.
4. The served admin manifest's `theme_color` and `background_color` are still `ADMIN_INSTALL.paper`.
5. **Observed in a rendered head, from a local production build:** `/admin` carries two
   `theme-color` tags — `#f1f7fb` light, `#162834` dark — and zero carrying `#c9e9fb`; `/` still
   carries `#c9e9fb` and `#0e1b26`; `/admin`'s `viewport` meta still ends in `viewport-fit=cover`.
   The automated suite observes the same facts one layer down, on the exported constants and the
   layout's sliced source text, because `vitest.config.ts` runs `environment: 'node'`.
6. `APPLE_WEB_APP.statusBarStyle` is still `'default'` (D8).
7. `npm run lint`, `npm run format:check`, `npm run typecheck` / `npx tsc --noEmit`,
   `npx vitest run` and `npm run build` all pass.

## Reconciliation Log

Both planners ran concurrently and could not see each other. The reconciler rebuilt the ledger from
the two **Interface Contract** sections, the two **Files** tables, the analysis's **Reference List**
and **Impact Points**, and — because a claim of disjointness is exactly the claim worth not taking on
trust — from the worktree itself: every `**File:**` header in both plans, and a repo-wide grep for
`composerBottomCss`, `composerPadBottomCss`, `controlBottomCss`, `COMPOSER_RESTING_PX`,
`COMPOSER_FALLBACK_PX`, `7.5rem`, `bg-paper/90` and `py-3`.

| # | Conflict | Class | Resolution |
|---|---|---|---|
| 1 | `tests/tabbar.geometry.test.ts:188-196` asserts `composerBottomCss`'s exact return string, `'calc(59px * var(--nina-bar-visible, 0) + var(--safe-bottom))'`, which D2 replaces. The file was in **neither** phase's `Owns` list in the draft index, so nothing owned the red test invariant 1 forbids | **Gap** | **Assigned to Phase 1**, ratifying its own claim. Verified against the worktree: those lines are exactly the file's last `it`, and the string it asserts is exactly the one D2 changes. Verified Phase 2 neither edits nor reads the file — its three `**File:**` headers are `lib/pwa.ts:92-108`, `app/admin/layout.tsx:1`/`:102` and `tests/pwa.install.test.ts`, and no step, test or grep of Phase 2 mentions it. Added to the index's Phase 1 `Owns` list, to the **In scope** list, and to the `Files` count; Phase 1's scope note rewritten from "the reconciler must see" to RATIFIED. Handled in Phase 1 Step 8b, which also rewrites that test's stale `bg-paper/90` comment |
| 2 | `lib/nina/chrome.test.ts` is named in the index's Phase 1 `Owns` list but is absent from the analysis's **Impact Points** (which list nine files, and neither test) and from the draft's `Files: 6` count | **Gap** (smaller, same shape) | **Stays Phase 1**, which already plans it in Step 5. Now counted. The analysis's Impact Points list is the one that was short, not the plan's — recorded here rather than by editing the analysis, which describes rather than prescribes |
| 3 | Phase 1's `controlBottomCss` emits **two shapes** — the inset gated on `var(--nina-bar-visible, 0)` in the measured branch, ungated in the unmeasured fallback branch. Read as a possible departure from D2, which says the term is "gated the same way" | **Contract drift (alleged)** | **RATIFIED, not collapsed — do not "simplify" this into one branch.** D2's own reason clause is conditional: *"because **with the inset inside the measured element** the lane would otherwise count it twice"*. The fallback branch is by definition the branch with no measured element, so the reason does not reach it, and D2's literal text does not require one unconditional form. Invariant 5 agrees and is the higher rung: `COMPOSER_RESTING_PX` is the 60 px content box and carries no inset (an inset is `env(safe-area-inset-bottom)`, which no TypeScript number can stand for), so a gated fallback would emit `68px` against a true composer top edge of `60px + inset` and put the `<` / `^` discs behind the composer's own `z-40` glass in the server HTML and on the first paint of every `/nina` load — `ChatChrome` seeds `composerHeightPx` at `0` (`ChatChrome.tsx:87`) and measures in a passive effect, confirmed in the worktree. Two shapes is the inset counted exactly once in all four combinations; one shape is not |
| 4 | Phase 1's own four-combination arithmetic table (Step 4) wrote the measured/hidden row as `calc(68px + SB*0)` = `68` against a top edge of `60 + SB`, then claimed a gap of 8. That is `8 - SB`, not 8 — the row silently used the *showing* state's box for the *hidden* state's measurement | **Contract drift** (the plan's justification disagreed with its own code) | **Table rewritten in place** with a `what composerHeightPx is` column: measured/hidden is `M = 60 + SB`, so the emitted length is `calc((M + 8)px + SB*0)` and the gap is 8. The design was right and is unchanged; only its stated arithmetic was wrong, and a wrong table is what gets "corrected" by the next reader into a wrong branch. A paragraph now says why row 1 is the load-bearing one, and notes that Step 5's unit tests feed `COMPOSER_RESTING_PX` as a measured height (the showing state's box) deliberately |
| 5 | The index's Phase 1 row said `Files: 6`; the planner's own **Files** table lists 8 | **Contract drift** (index vs plan) | Index corrected to `Files: 8`, `Package` widened to include `tests`. The two extras are the files in rows 1 and 2. Phase 2's `Files: 3` matches its plan exactly and is unchanged. Both plans' closing "Phase 1's six files" sentences corrected to eight |
| 6 | Two stale line ranges. Phase 1's **Files** table cited `AppShell.tsx` "comment (59-63)" while Step 8a replaces 59-81; the index's Phase 1 `Owns` list cited `chatview.test.ts` "218-253" while the plan replaces 218-256 | **Contract drift** (internal, and index vs plan) | Both corrected against the worktree, which is the arbiter: `AppShell.tsx`'s `chat` comment is 59-80 with the literal on 81 (so Step 8a's range was right and the table's was the typo), and `chatview.test.ts` is 256 lines with the `composerBottomCss` block running to the last of them. A step that quotes a range the file does not have is a step that gets applied to the wrong lines at 3am |
| 7 | The index's Phase 2 exit criteria listed 5 items; the plan's list 7, and the plan's are strictly stronger (constant names not hex literals, exactly one key, `#ffffff` excluded, the admin manifest's `theme_color` unchanged, `format:check` and `typecheck`) | **Contract drift** (index vs plan) | Index's Phase 2 exit criteria rewritten to the plan's seven. The index is what `create-task` and the orchestrator read, so the weaker list would have shipped as the gate |
| 8 | Alleged file collision between the two phases — the reason a reconciler was called | **None found** | Verified by call site, not by assertion. Phase 1: `lib/nina/chatview.ts`, `lib/nina/chatview.test.ts`, `lib/nina/chrome.ts`, `lib/nina/chrome.test.ts`, `components/nina/Composer.tsx`, `components/nina/ChatScreen.tsx`, `components/ui/AppShell.tsx`, `tests/tabbar.geometry.test.ts`. Phase 2: `lib/pwa.ts`, `app/admin/layout.tsx`, `tests/pwa.install.test.ts`. Disjoint, in both directions, including read-only text assertions: no test in the repo reads `Composer.tsx` as text (so R3's `className` change breaks nothing), and Phase 2's only read of a Phase 1 file is none. `Depends on: —` stands for both; they run concurrently |
| 9 | Deleted-then-used, unmet `Requires`, duplicate work, ordering violations, unowned `R` | **None found** | Both contracts declare `Deletes: nothing` and `Renames: nothing`, and both declare `Requires: nothing` against `origin/main` @ `e6c68d6`. No symbol is created twice: `composerPadBottomCss` and the `padBottomCss` prop are Phase 1's alone; `ADMIN_INSTALL.paperDark` and the admin `viewport` export are Phase 2's alone. Every `R` in the Requirements table is served — R1, R2, R3 by Phase 1, R4 by Phase 2 — and neither phase's steps serve an `R` outside its own **Satisfies** line (Phase 2's Handoffs says so explicitly and the grep confirms it). No requirement moved, so no `Satisfies` line changed |
| 10 | Broken-build phases | **None, by construction** | Neither phase compiles green mid-sequence — Phase 1's tests assert the old strings until Steps 2 and 5, and `tsc` fails on the missing `padBottomCss` prop until Step 7 — but both are green at the phase boundary, which is what invariant 1 requires and what `Depends on` is about. Both plans say so at the head of their step lists. No change moved between phases, so **no contract changed** and no second round is needed |

**Not folded in, deliberately.** `ReviewClient`'s sticky action bar keeps `bg-paper/90
backdrop-blur-md` — the recipe the composer is leaving — so the app's two fixed bars now differ. The
user asked for the chat query field specifically, so spreading the frost is a new requirement and a
new phase, not a reconciler's drive-by. Phase 1's Handoffs already records it. Likewise
`lib/pwa.ts:88-90`'s cross-reference to a *different* plan set's "phase 2", which now reads
confusingly beside this set's phase 2: a phrasing nit inside a paragraph Phase 2 does not otherwise
touch, left alone rather than widening the diff.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| **D1** — which gap R1 names; no device measurement was taken | The unpainted `--safe-bottom` strip below the composer in the bar-**hidden** resting state. The offset is `calc(59px * visible + var(--safe-bottom))`, so with `visible: 0` the bar's bottom edge sits one inset above the screen and the conversation shows through; `lib/nina/chrome.ts:41` makes hidden the resting state of this very screen, and it is the only unpainted region in the stack | 5: the user's raw input — *"gap … dengan bagian bawah"*, the bottom of the screen, not the tab-bar seam (already flush, and nobody reported it) |
| **D2** — where the home-indicator inset lives once the bar must paint to the edge | Move it out of the composer's offset and into the composer's own `padding-bottom`, gated on the bar variable: `bottom: calc((59px + var(--safe-bottom)) * var(--nina-bar-visible, 0))`, `padding-bottom: calc(var(--safe-bottom) * (1 - var(--nina-bar-visible, 0)))`. **`controlBottomCss`'s inset term is then gated the same way** (`var(--safe-bottom) * var(--nina-bar-visible, 0)`), because with the inset inside the measured element the lane would otherwise count it twice in the hidden state and float one inset too high | 1: invariant 5, the inset counted exactly once — which is `Composer.tsx:39-41`'s own rule, applied to the state it did not cover |
| **D3** — how much smaller, for R2's *"lebih kecil"* | `py-3` → `py-2`: resting height 68 → 60 px. The 44 px textarea floor and the 16 px font are fixed by invariants 3 and 4, so the 24 px of vertical padding is the only reclaimable space, and halving it is the whole of what is available | 6: convention — the same trade `lib/nina/chrome.ts:62-77` made for the controls, taking the reduction from the one dimension that is not load-bearing |
| **D4** — the three hand-copied heights | All move with the markup in one phase: `COMPOSER_RESTING_PX` 68 → 60, `COMPOSER_FALLBACK_PX`'s literal 68 → 60, and `BOTTOM_GAP.chat` `7.5rem` → `7rem` (60 + 8 + 32 + 12 = 112 = 7rem exactly) | 3: `AppShell.tsx:70-73`'s own instruction — *"Tailwind cannot read a constant, so a change to any of them changes this literal"*, with the 44 → 32 precedent recorded beside it |
| **D5** — how literally to read *"persis kaya small buttons"* | Take the **fill, blur and saturation** verbatim — `bg-card/40 backdrop-blur-md backdrop-saturate-150` — and keep a top hairline rather than a full ring: `border-t border-rule/50`. The user asked for the *background*; a full-width bar has one exposed edge, and `ring-1` would draw a hairline down both screen edges and across the bottom | 5: the user's own noun — *"bikin **backgroundnya** frosted glass"* — with the ring's weight (`/50`) carried over so the pair still reads as one system |
| **D6** — *"is white"* versus the token that blends | `ADMIN_INSTALL.paper` = `#f1f7fb` (`--paper-2`), not `#ffffff`. The request carries its own purpose clause, and `#ffffff` satisfies the adjective while failing the purpose: the admin shell's ground is `#f1f7fb`, so pure white would replace one visible band with a fainter one | 5: the user's raw input — *"white, **so it is kind of blend in with the UI**"*; `lib/pwa.ts:106` already calls this value *"the admin shell's ground, so the splash matches the first screen"* |
| **D7** — whether a nested `viewport` must re-state `viewportFit: 'cover'` | Export **only** `themeColor`. Verified in the framework's own source: `mergeViewport` (`node_modules/next/dist/lib/metadata/resolve-metadata.js:315`) `structuredClone`s the resolved parent viewport and iterates `for (const key_ in viewport)`, so keys absent from the child are inherited untouched. Re-stating `viewportFit` would create a second source of truth for the one value invariant 6 protects | 3: the framework source, read rather than assumed — `generate-viewport.md` does not document the merge rule at all |
| **D8** — whether R4 needs `statusBarStyle: 'black-translucent'` | No. It stays `'default'` and is listed out of scope | 1: `lib/pwa.ts:70-88`'s stated prerequisite, recorded there as *"half done"* — the runner's `ScreenHeader` and the pages under `app/` still use a plain `p-5` and would slide under the clock |

## Open Questions

None. Every fork above was decided on the ladder and written into the phase plans, and
reconciliation added none: every `R` in the Requirements table has an owner, and the only two
questions it had to settle — who owns `tests/tabbar.geometry.test.ts`, and whether
`controlBottomCss` may emit two shapes — were both answerable from D2's own text and invariant 5,
which is rung 1. Nothing here is irreversible either: no migration, no schema change, no network
call, nothing persisted (invariant 8), so every choice in this set is a `git revert` away. The set
is launchable unattended.

## Rollback

- **Phase 1** — `git revert` the phase commit. The eight files are all presentation; nothing is
  persisted, so there is no data to reconcile. If only R2's sizing is unwanted, the four sites in
  invariant 2 revert together to 68 / `7.5rem` and R1's and R3's changes stand on their own.
- **Phase 2** — delete the `viewport` export from `app/admin/layout.tsx`. The band returns to
  `#c9e9fb`; `ADMIN_INSTALL.paperDark` is then unused but harmless. An installed tile picks up
  the change on its next launch — no re-install needed, since the meta tag is served with the
  page.
- **The set** — `git revert -m 1` the merge commit. No migration, so nothing to undo in the
  database.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f COMPOSER_FROST_AND_ADMIN_NOTCH_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f COMPOSER_FROST_AND_ADMIN_NOTCH_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan COMPOSER_FROST_AND_ADMIN_NOTCH_PLAN.md
