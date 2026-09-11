# Token-Maxxing Session — 2026-09-11: UI Primitives Tests

> **Sixth token-maxxing session on this date, and the first to run on a
> coordinator-assigned worker branch.** The first session
> ([doc](./2026-09-11-nina-chat-component-tests.md)) stood up React
> component-testing infra from zero (RTL + happy-dom) and covered
> `ChatScreen.tsx` + `NinaSidebar.tsx`. The second session
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) continued onto
> `Composer.tsx`, `MessageBubble.tsx`, and `MessageList.tsx` — and put
> `components/ui` on its menu (not picked). The third session
> ([doc](./2026-09-11-admin-folder-actions-tests.md)) corrected a
> false-positive "zero coverage" survey of `components/admin` and closed six
> `ninaAlbumActions.ts` folder-maintenance Server Actions. The fourth session
> ([doc](./2026-09-11-nina-message-actions-sheet-tests.md)) closed
> `MessageActionsSheet.tsx`. The fifth session
> ([doc](./2026-09-11-admin-file-explorer-tests.md)) closed the admin
> FileExplorer subsystem — and put `components/ui` on *its* menu too, passing
> it over as "lower decision density" while flagging it "Still open" in its
> follow-ups. This session picked that directory up: all 16 untested files in
> it — the 14 shared design-system primitives plus the 2 hooks — the layer
> every other screen in the app renders through.

## 🎯 Achievement / End Result
- **Goal of the burn:** Close `components/ui`'s total lack of test coverage —
  a gap named on prior sessions' menus and passed over every time — with
  real rendered-DOM tests for all 16 untested files: the 14 primitives
  (`AppShell`, `Button`, `Card`, `Chip`, `DetailPanel`, `EmptyState`,
  `Field`, `Flag`, `PhotoViewer`, `RunDateLink`, `Sheet`, `SplitsTable`,
  `TabBar`, `ZoneBar`) plus the 2 hooks (`usePanelParam.ts`,
  `useSavePhoto.ts`).
- **Concrete changes:** 16 new co-located `.test.tsx` files under
  `components/ui/`, ~2,741 lines total, **205 new tests, all passing** —
  and **zero production files touched** (a tests-only session):
  - `components/ui/Button.test.tsx` — new, 24 tests.
  - `components/ui/usePanelParam.test.tsx` — new, 17 tests.
  - `components/ui/PhotoViewer.test.tsx` — new, 17 tests.
  - `components/ui/TabBar.test.tsx` — new, 17 tests.
  - `components/ui/useSavePhoto.test.tsx` — new, 16 tests.
  - `components/ui/SplitsTable.test.tsx` — new, 16 tests.
  - `components/ui/Field.test.tsx` — new, 15 tests.
  - `components/ui/ZoneBar.test.tsx` — new, 13 tests.
  - `components/ui/Sheet.test.tsx` — new, 11 tests.
  - `components/ui/DetailPanel.test.tsx` — new, 11 tests.
  - `components/ui/AppShell.test.tsx` — new, 10 tests.
  - `components/ui/Card.test.tsx` — new, 9 tests.
  - `components/ui/Chip.test.tsx` — new, 9 tests.
  - `components/ui/Flag.test.tsx` — new, 8 tests.
  - `components/ui/EmptyState.test.tsx` — new, 7 tests.
  - `components/ui/RunDateLink.test.tsx` — new, 5 tests.
  - Commit `e5e2a4b` then type-hardened 6 of those files
    (`AppShell`, `Button`, `DetailPanel`, `SplitsTable`, `ZoneBar`,
    `useSavePhoto` tests) to get `npx tsc --noEmit` clean.
- **Real value delivered:**
  - The shared design-system layer — the components and hooks every other
    screen renders through — went from 0 component tests to fully covered.
    Prior sessions' "14 files, 0 tests" figure itself undercounted the gap:
    the directory also holds `usePanelParam.ts` and `useSavePhoto.ts`, so
    the real count was 16 files, all closed here.
  - The rendered-scenario **complement** to the repo's older node-env
    text-scan suites (`tests/ui.sheetFocus.test.ts`,
    `tests/ui.photoViewer.test.ts`, `tests/tabbar.geometry.test.ts`): those
    prove a rule holds for every consumer by scanning source text; these
    prove the interaction actually behaves in a rendered tree. Deliberate
    division of labor, not duplication — though those files' headers still
    claim "this repo has no component tests by design," a premise this
    session made stale (see Follow-ups).
  - Correctness-sensitive behavior now pinned in a rendered tree: the
    iOS-keyboard bug's *absence* in `Sheet` (a re-render minting a new
    `onClose` steals nothing; Escape reaches the *latest* `onClose` via the
    ref); `PhotoViewer`'s swipe gate exercised as real touch events
    (two-finger, pinched, tap, and vertical all refuse); `DetailPanel`'s
    native `<dialog>` getting **no** redundant `role`/`aria-modal` (a
    screen-reader double-announcement hazard) with Close focused by ref
    after `showModal`; `AppShell`'s load-bearing provider nesting proven as
    DOM containment with the server-constructed unread badge followed into
    the *real* `TabBar`'s Nina tab; `usePanelParam` holding each verb to
    its own history effect; `useSavePhoto` walking the full save ladder.
  - Net test count: **205 new tests, all passing** (4,191 → 4,396). Full
    `npx vitest run` green across 215 test files; `npm run typecheck`
    (`next typegen` + `tsc --noEmit`) clean.
- **Branch:** `token-maxxing-2026-09-11-ui-primitives-tests`
  (coordinator-assigned worker branch, base `a1ab59f`, the
  admin-file-explorer session's merge).
- **Merge status:** on branch — the coordinator owns merging; this session
  committed the doc and stopped.
- **Approx token burn:** high — 16 components/hooks traced against their
  props and collaborators before any test was written, 205 tests authored
  across 16 new files (~2,741 lines), one typecheck-hardening pass, and a
  full-suite verification. 🔥

## Context & Motivation

This is the **sixth** token-maxxing session on 2026-09-11, and the first run
under a coordinating orchestrator (`tokenmax-orch-2026-09-11`) that assigns
ideas to worker sessions on their own branches instead of each session
picking from its own self-generated menu. The assignment: `components/ui` —
the 14 untested primitives plus the 2 hooks, slug `ui-primitives-tests`.

**The flag history.** Two prior session docs record the directory as a menu
candidate: session 2's (menu item #2, "14 shared primitives, 0 tests") and
session 5's (menu item #3 — explicitly passed over as "small and
low-decision-density", then flagged "Still open" in its follow-ups). Both
left it unpicked. (The session brief's tally said three of five menus; the
committed docs evidence two — the third, if any, was not captured in a doc.
Recorded here as the docs show it.) It is also the *reverse* of session 5's
reasoning that makes the directory valuable: individually, each primitive is
small — but they are the shared vocabulary of the whole UI. `Button`,
`Card`, `Chip`, `Field`, `Sheet`, `TabBar` are rendered by nearly every
screen, including all the Nina and admin surfaces the five prior sessions
tested; a regression in this directory would have surfaced everywhere at
once with nothing to catch it.

**Why the hooks came too.** `useSavePhoto` is the save ladder behind every
photo share into Nina's album (share sheet → object-URL anchor download →
`window.open` fallback), and `usePanelParam` is the deep-link state machine
backing the detail panel's URL param. Both are decision logic, not glue —
and the vitest config's include pattern (see Code / Design Details) would
have made testing them anything but trivial.

## What We Did (blow-by-blow)

1. **Took the coordinator's assignment** (`components/ui`, 16 untested
   files) and confirmed the gap: 14 primitives + 2 hooks, zero test files,
   co-located or central, anywhere in the repo. The only test files
   referencing these components at all were the three node-env text-scan
   suites (`tests/ui.sheetFocus.test.ts`, `tests/ui.photoViewer.test.ts`,
   `tests/tabbar.geometry.test.ts`) — which never render anything.

2. **Commit 1 — `test(ui): cover Button, Card, Chip, EmptyState, Field,
   RunDateLink`** (`b4b2ce5`) — 77 tests. (The commit message omits it, but
   `Flag.test.tsx` rides in this commit too: Button 24, Card 9, Chip 9,
   EmptyState 7, Field 15, Flag 8, RunDateLink 5.)

3. **Commit 2 — `test(ui): cover SplitsTable and ZoneBar`** (`3003fd6`) —
   29 tests (SplitsTable 16, ZoneBar 13).

4. **Commit 3 — `test(ui): cover Sheet, PhotoViewer, DetailPanel`**
   (`1ded208`) — 39 tests (Sheet 11, PhotoViewer 17, DetailPanel 11).

5. **Commit 4 — `test(ui): cover TabBar and AppShell`** (`4b25ae6`) — 27
   tests (TabBar 17, AppShell 10).

6. **Commit 5 — `test(ui): cover usePanelParam and useSavePhoto`**
   (`fa2e391`) — 33 tests (usePanelParam 17, useSavePhoto 16).

7. **Commit 6 — `test(ui): satisfy tsc — the suite runs vitest only, but
   tsc reads these too`** (`e5e2a4b`) — the type-hardening pass. Vitest had
   been green all along; `npx tsc --noEmit` reads the same files and
   objected. Six files fixed, six distinct categories:
   - `DetailPanel.test.tsx`: `PanelArt` (with its optional `dimmed`) typed
     into the harness; dialog elements queried as `HTMLDialogElement` so
     `.open` reads.
   - `SplitsTable.test.tsx` / `ZoneBar.test.tsx`: query results narrowed
     where the tests know the runtime type (tbody rows, bar segments).
   - `AppShell.test.tsx`: the harness props type takes
     `Omit<..., 'children'>` since the render helper supplies them.
   - `Button.test.tsx`: a void-returning ref callback (React 19's ref
     cleanup rules — a returning callback is read as a cleanup function).
   - `useSavePhoto.test.tsx`: mocks typed as vitest `Mock` instead of
     runtime cast-casts.

8. **Ran the full local gate, all green:**
   - `npx vitest run` → **215 test files / 4,396 tests passed** (up from
     199 files / 4,191 tests at the end of session 5 — net **+16 files,
     +205 tests**).
   - `npm run typecheck` (`next typegen` + `tsc --noEmit`) → clean.

## Code / Design Details

**Two kinds of proof, deliberately divided.** The repo already had three
node-env suites over this directory — `tests/ui.sheetFocus.test.ts` (the
effect-deps rule that keeps `Sheet` from stealing focus),
`tests/ui.photoViewer.test.ts` (structural claims about the gallery), and
`tests/tabbar.geometry.test.ts` (the tab-bar geometry constants). They work
by reading source text and asserting substrings: that proves a rule holds
for *every* consumer, including ones not written yet, but proves nothing
about runtime behavior. The new suites are the complement — they render the
component and prove the interaction. Neither substitutes for the other, so
the old files stay. Their headers, though, still open with "this repo has
no component tests by design" — written when `vitest.config.ts` ran
`environment: 'node'` with an include pattern that matched no component
tests. The config's default environment is still `'node'`, but the premise
is now false (see Follow-ups).

**The money tests.** What the rendered suites prove that no text scan can:

- **`Sheet.test.tsx` — the iOS-keyboard bug's absence, in a sequence.** The
  reported bug (per `tests/ui.sheetFocus.test.ts`'s header): editing a
  heart-rate zone on a phone, every digit typed dismissed the keyboard —
  the sheet was stealing focus back from the field. The fix lives in the
  effect dependency arrays; the text scan pins the deps as source text.
  The DOM test proves the actual behavior: re-rendering the sheet with a
  *freshly-minted* `onClose` — the thing that used to re-trigger the focus
  effect on every keystroke — steals nothing, and Escape reaches the
  *latest* `onClose` through the ref, not a stale closure.
- **`PhotoViewer.test.tsx` — the swipe gate as real touch events.** The
  gesture rules were already proven arithmetically in
  `lib/photos/gallery.test.ts`; this suite renders the viewer and dispatches
  real touch sequences, asserting the gate refuses everything that isn't a
  clean one-finger horizontal swipe: two-finger, pinched, tap, and vertical
  all refuse.
- **`DetailPanel.test.tsx` — the native dialog gets no redundant ARIA.**
  `showModal()` already makes a `<dialog>` modal and announced; adding
  `role="dialog"`/`aria-modal="true"` on top makes screen readers announce
  the dialog twice. The test proves the rendered dialog carries neither,
  and that the Close button takes focus by ref after `showModal`.
- **`AppShell.test.tsx` — the provider nesting the chat screen depends on.**
  The chat screen's state lives in providers whose mount order is
  load-bearing. The test proves the nesting as DOM containment
  (bar-provider > sidebar-provider > main + `ChatChrome`) rather than by
  mocking the tree away — and follows the server-constructed unread-badge
  count all the way into the *real* `TabBar`'s Nina tab, not a stub.
- **`usePanelParam.test.tsx` — each verb held to its own history effect.**
  push, replace, and back each get the history call their semantics claim,
  and the `pushedRef` guard resets after a simulated back gesture so the
  next open pushes again instead of being swallowed.
- **`useSavePhoto.test.tsx` — the save ladder, rung by rung.** Web Share →
  object-URL anchor download (with the 10-second revoke timer actually
  scheduled) → `window.open` fallback — and an `AbortError` from a
  user-dismissed share sheet producing silence, not an error state.

**A deliberate imperfection left in `Field`, documented by its own tests.**
When *both* `hint` and `error` are passed, `Field` computes `describedBy`
to include the hint's id (`[hintId, errorId].filter(Boolean).join(' ')`)
while the hint `<p>` only renders when `!error` — so the described-by list
can name an element that isn't there. Screen readers skip missing
references, so it degrades harmlessly, and the tests pin the behavior as it
is rather than papering over it. A one-line tightening (exclude `hintId`
when `error` is set) is available if anyone wants it; this session fixed
nothing (see Decisions).

**Testing-infra notes for the next session that renders components here:**

- **The opt-in is a per-file pragma, and the config stays untouched.** Each
  new file opens with `// @vitest-environment happy-dom`;
  `vitest.config.ts` still defaults to `environment: 'node'` with its
  include list unchanged. F01's "single test-runner config for this repo
  (do not write a second one)" rule survives intact.
- **happy-dom 20.14.3 covers the hard browser APIs natively** —
  `dialog.showModal()`, `scrollTo`, `matchMedia`, `createObjectURL` — no
  stubs needed anywhere in these suites.
- **`next/link` renders under happy-dom without a router provider.**
  Components that only *render* links need no mocking; components that
  *call* the router would still need it.
- **The include pattern forces `.tsx` on hook tests.** Vitest matches
  `components/**/*.test.tsx` and nothing else under `components/` — so
  `usePanelParam.test.tsx` and `useSavePhoto.test.tsx` are `.tsx` even
  though neither renders a line of JSX. A `.ts` hook test would be silently
  ignored by the runner.
- **`afterEach` hooks run in reverse registration order.** A test file's
  own `afterEach` guard runs *before* the setup file's `cleanup()`. If the
  guard throws first, `cleanup()` never runs and the failure cascades into
  every following test. Fixed by calling `cleanup()` first inside the
  guard.
- **vitest is not tsc.** All six commits were vitest-green; the type errors
  only surfaced under `npx tsc --noEmit` (the repo's own memory rule, hit
  again here — hence commit 6).

## Decisions & Trade-offs

- **Tests-only session; zero production files touched — including
  `Field`.** The `describedBy`/unrendered-hint slack is a real (if
  harmless) wart, but fixing production code was outside this session's
  assignment and would have blurred a tests-only diff. Recorded as a
  follow-up with the one-line fix spelled out.
- **Co-located tests, matching the day's convention.** The admin explorer
  and Nina component tests put suites next to their components; these 16
  files do the same. (Session 3 had to correct a survey that assumed the
  opposite convention — co-location is now simply the norm for component
  tests; `lib/` and `tests/` keep theirs where they are.)
- **Per-group commits, six of them,** so each batch of related components
  is reviewable on its own — same shape as session 5's three commits over
  nine files, scaled to this directory's spread.
- **Real children over stubs where the assertion allows.** `AppShell`'s
  suite renders the real `TabBar` and asserts the unread badge lands in the
  Nina tab — an assertion *about* the composition, which a stubbed TabBar
  would have made vacuous. Where a collaborator isn't the subject,
  boundary-mocking follows the `ChatScreen.test.tsx` precedent.
- **The three text-scan suites were left alone** — their rules are still
  true and their method still complements the DOM suites. Only their
  headers' premise ("no component tests by design") went stale, which is a
  docs fix, not a test fix; it's in Follow-ups rather than smuggled into a
  tests-only diff.

## Follow-ups & YAGNI notes

- **One-line tightening available in `Field.tsx`:** when `error` is set,
  drop `hintId` from the computed `describedBy` (the hint never renders in
  error state, so the reference names nothing). Harmless today — screen
  readers skip missing references — but free to fix, and `Field.test.tsx`
  pins the current behavior so a fix updates the test deliberately.
- **Stale premises in the three text-scan suites' headers:**
  `tests/ui.sheetFocus.test.ts` ("This repo has no component tests by
  design"), `tests/ui.photoViewer.test.ts` (same claim, elaborated), and
  `tests/tabbar.geometry.test.ts` ("no way to render them without a DOM
  this repo's suite does not have"). The suite now has a DOM. Rewording the
  headers to describe the actual division of labor (every-consumer rule
  scans vs. rendered-interaction proof) would keep a future reader from
  discounting either kind.
- **`components/ui/index.ts` (the barrel) is untested by design** — it
  re-exports and decides nothing.
- **Carried forward, untouched this session:** `useFolderUpload.ts` (~425
  lines, the explorer's upload hook — session 5's largest named follow-up);
  the 5 remaining `ninaAlbumActions.ts` avatar exports (deferred a 3rd time
  in session 5); `components/admin/PhotoMoveBar.tsx` and `FolderMenu.tsx`
  (stubbed by session 5, each deserving its own suite); `SessionRow.tsx` /
  `SessionList.tsx` / `ChatChrome.tsx` and the remaining Nina components;
  the `lib/nina` YAGNI hunt (deferred a 5th time); the F0x
  architecture-synthesis doc. With this directory closed, the component
  directories still at zero are charts, review, profile, share, trends,
  extract, auth, push, runs, insights.
- **YAGNI note:** no visual-regression/snapshot testing was added. The
  suites assert structure, semantics, and behavior — pixel assertions were
  judged out of proportion to their flake cost for a design system this
  stable.

## Appendix

**Key commands run this session:**
```bash
npx vitest run                      # full suite
npx vitest run components/ui       # just the new suites
npm run typecheck                   # next typegen + tsc --noEmit
git status --porcelain
git log --oneline -7
```

**Gate results:**
- Before this session (end of session 5, base `a1ab59f`): 199 test files /
  4,191 tests passing.
- After this session: 215 test files / 4,396 tests passing — net **+205
  tests** across 16 new files.
- `npm run typecheck`: clean (after commit 6; vitest alone had been green
  throughout).

**Commits (on `token-maxxing-2026-09-11-ui-primitives-tests`, base
`a1ab59f`):**
```
b4b2ce5 test(ui): cover Button, Card, Chip, EmptyState, Field, RunDateLink
3003fd6 test(ui): cover SplitsTable and ZoneBar
1ded208 test(ui): cover Sheet, PhotoViewer, DetailPanel
4b25ae6 test(ui): cover TabBar and AppShell
fa2e391 test(ui): cover usePanelParam and useSavePhoto
e5e2a4b test(ui): satisfy tsc — the suite runs vitest only, but tsc reads these too
```

**Branch:** `token-maxxing-2026-09-11-ui-primitives-tests` — on branch, not
merged (the coordinator owns merging; this session committed the doc and
stopped).
