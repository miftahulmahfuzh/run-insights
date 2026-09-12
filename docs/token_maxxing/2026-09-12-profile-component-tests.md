# Token-Maxxing Session — 2026-09-12: Profile Component Tests

## 🎯 Achievement / End Result
- **Goal of the burn:** The assigned idea (worker session under coordinator
  `tokenmax-orch-2026-09-12`, slug `profile-component-tests`; worker mode gets a
  pre-assigned idea, so no menu was generated): write **real, meaningful tests** for
  `components/profile` — 1,060 lines across five client components — which had **zero
  test files**. The assignment's own framing made the point sharp: the
  profile-share-yagni session had already dead-code-audited this directory, but a YAGNI
  pass certifies that code is *used* — it does not certify that code *works*.
- **Concrete changes:** Two code commits —
  - `918d016` — **5 new co-located test files, 1,174 lines, 52 tests, plus one stale
    docblock rewritten in source**: `BadgeShelf.test.tsx` (351), `BadgeDialog.test.tsx`
    (301), `RecordsTable.test.tsx` (207), `ProfileForm.test.tsx` (200),
    `RecordDialog.test.tsx` (115). Every one of the directory's five components now has
    a test file — no orphans left.
  - `0774e46` — **a real accessibility bug found by the new tests and fixed first, in
    `components/ui/Field.tsx`** (details below). Shared chrome used by every form in
    the app, which is why the fix commit precedes the test commit and the full suite
    ran after it.
- **Real value delivered:**
  - **The interactive layer of the profile directory is now pinned, not just its
    markup.** The only prior coverage was `tests/badges.render.test.ts` — node-env
    `renderToStaticMarkup` over these same components — plus
    `components/ui/DetailPanel.test.tsx` for the shared dialog chrome. Static markup
    structurally cannot run an effect, click a row, or open a dialog; every behavior
    this directory exists for was untested. Now: URL-panel deep links and their
    history-management, disclosure semantics, kind discrimination, focus placement,
    form wire formats, pending states, and error accessibility all have executable
    contracts.
  - **A genuine bug came out of the first suite, found the TDD way** — the failing
    test reproduced it before the fix existed. `Field` (the shared form chrome under
    every labeled input in the app) kept the hint's id in `aria-describedby` after an
    error suppressed the hint, leaving a dangling reference; and because both ids were
    joined into one attribute string, the input's accessible description resolved to
    *neither* element exactly when it mattered most — while an error was showing.
  - **The repo's assertions about its own history are honest again:** a docblock in
    `BadgeDialog.tsx` still claimed "This repo has no jsdom and no testing library"
    — true when written, false since the component harness arrived — and now names the
    suites that superseded it.
  - **Gates, all green, measured not assumed:** the profile suites 5 files / 52 tests;
    the full suite **301 files / 5,454 tests, all passing**; `npm run typecheck`
    (next typegen + tsc) clean; prettier run on exactly the touched files.
- **Branch:** `token-maxxing-2026-09-12-profile-component-tests`
- **Merge status:** on branch (the coordinator owns the merge to main; this worker
  does not merge or push)
- **Approx token burn:** ~900k 🔥 (the five components and their two existing render
  suites read in full, the ui/nina/review harness conventions re-derived, five suites
  written and debugged against happy-dom and React 19 quirks, one accessibility bug
  chased to root cause and fixed with a full-suite re-run, this doc)

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out under coordinator
`tokenmax-orch-2026-09-12`. This worker was spawned with a pre-assigned idea — worker
mode skips the idea-menu generation a lead session runs — and the assignment was a
coverage hole with a precise shape:

`components/profile` holds the app's public profile page machinery: `BadgeDialog`
(334 lines), `BadgeShelf` (240), `ProfileForm` (218), `RecordDialog` (151),
`RecordsTable` (117). By the time this session spawned, the repo's component-test
estate already covered `components/ui` (16 suites), `components/nina` (31),
`components/admin` (20+), `components/review` (12 suites), and five app route
handlers — but profile had been walked past by every pass. The premise was verified
before writing: zero `*.test.tsx` files existed under `components/profile/`.

The near-miss mattered, and the doc records it because it is exactly the kind of gap
that survives audits: `tests/badges.render.test.ts` *does* touch these components — it
renders them with `renderToStaticMarkup` in the node env — so a coverage tool or a
casual grep finds "covered". But what static markup covers is the **no-interaction
render path only**. It cannot run an effect (so the URL-driven panel open was
invisible), cannot fire a click (so the tap-to-open and disclosure behaviors were
invisible), and cannot observe focus. The entire reason these components are client
components — the `'use client'` boundary — was the untested half.

The directory had also just been through profile-share-yagni's dead-code audit, which
found the estate tight — which is precisely why this assignment existed: audited-for-
dead-code is not tested-for-behavior, and this session closed that distinction with
executable proof.

## What We Did (blow-by-blow)
1. **Read the directory and its existing echoes before writing anything.** The five
   components in full; `tests/badges.render.test.ts` to see what the static suite
   already pinned (and therefore what the new suites must *not* duplicate); and
   `components/ui/DetailPanel.test.tsx`, since the dialogs share that chrome. Also
   re-read the established harness dialects — ui/nina/review — because the repo now
   has one dominant pattern and this session was not going to invent a fourth.
2. **Confirmed the premise.** No `*.test.tsx` under `components/profile/` — the
   assignment held exactly as stated.
3. **Set the harness frame once, per the repo's conventions:** `// @vitest-environment
   happy-dom` co-located suites named `*.test.tsx`; a hoisted `vi.mock` of
   `next/navigation` with a *controlled* query string the test can rewrite between
   renders; `next/image` mocked to a plain `img` with `className` forwarded (so art
   presence and dim-state are assertable without the optimizer); `history.pushState`/
   `replaceState`/`back` spies so the tests can distinguish *what kind* of history
   entry a behavior wrote; and the ReviewScreen-established pending-action gate
   discipline (a pending action must be settled or the cleanup poisons the next
   mount).
4. **Wrote `ProfileForm.test.tsx` (10 tests) first — and hit the bug.** The suite
   asserts, among other things, that a field error leaves the input's accessible
   description *resolving to an element*. The failing test reproduced the dangling
   `aria-describedby` reference before any fix existed (TDD: red first).
5. **Fixed `components/ui/Field.tsx`** — `hintId` now exists only under the same
   `hint && !error` rule the markup already followed, so the id and the `<p>` can no
   longer disagree. Committed separately as `0774e46` (`fix(ui): Field stops
   referencing a suppressed hint in aria-describedby`) because it is a production fix
   to shared chrome, not test scaffolding. **Ran the FULL suite after the fix** —
   every form in the app renders through `Field`, so a fix here is app-wide, and the
   full sweep is the only gate that proves no other suite leaned on the old (broken)
   attribute shape. All 5,454 tests green; one unrelated flake triaged (Appendix).
6. **Wrote the remaining four suites** in dependency order of the behaviors they pin:
   `BadgeShelf` (14) — the URL-state machinery; `BadgeDialog` (13) — the disclosure
   and locked/earned art rules; `RecordsTable` (8) — the row/naming/kind layer;
   `RecordDialog` (7) — the record-card line formats. Each suite follows the same
   frame as ProfileForm's.
7. **Caught the comment drift while the BadgeDialog suite was in hand.**
   `EarnedDayList`'s docblock in `BadgeDialog.tsx` claimed the repo has no jsdom and
   no testing library and that `vitest.config.ts` runs node-env only — written when
   that was true, false since the harness arrived, and *now* directly falsified by
   the file sitting next to it. Rewritten to name the suites that supersede it and
   why the export remains (the node-env render test renders `EarnedDayList` directly).
   Folded into `918d016` rather than a fourth commit — it is the same change's story:
   the tests that made the comment false are in the same commit.
8. **Ran the gates on the final bytes:**
   - The profile suites: 5 files / 52 tests, all passing.
   - The full suite: **301 files / 5,454 tests, all passing** (serial sweep; see the
     flake note below for the parallel-load red that preceded it).
   - `npm run typecheck` (next typegen + tsc): clean.
   - Prettier: run on exactly the touched files, never repo-wide.
9. **Committed:** `0774e46` (the Field fix) and `918d016` (`test(profile): cover the
   directory's interactive layer — 52 tests, zero to full`). This doc and the README
   row are the third commit on the branch; the merge to main belongs to the
   coordinator.

## Code / Design Details

**The bug, precisely.** `Field` renders a hint `<p id={hintId}>` and an error, under
the mutual-exclusion rule: the hint shows only when there is no error
(`hint && !error`). But `hintId` was computed unconditionally, and
`aria-describedby` was built from both ids joined into one string:

```
aria-describedby={ids.join(' ')}   // kept hintId even when the hint <p> was gone
```

So with an error showing: the hint `<p>` is removed from the DOM, but its id stays in
`aria-describedby` — a dangling reference. Worse than inert: with *two* ids in the
attribute and only one element present, the accessible description resolved to
**neither** — the error (the one thing a screen reader user needed at that moment) was
described by nothing. The fix makes the id obey the same rule as the markup:

```
const hintId = hint && !error ? `${id}-hint` : undefined
```

so the error case describes the error, and the id can never outlive its element.
`ProfileForm.test.tsx` holds the regression: it resolves the description through
`aria-describedby` and asserts the element exists.

**The controlled-navigation mock** — the spine all five suites hang on. `next/navigation`
is mocked hoisted with a mutable query string:

```
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, back: backSpy }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}))
```

Tests rewrite `currentQuery` and re-render to simulate a deep link
(`?panel=badge.early_bird`) versus a fresh mount (no query) — which is what lets the
BadgeShelf suite assert the *asymmetry*: a tap **pushes** a new entry with dates
dropped from the URL, a deep-link close only **replaces**, and `back()` is wired to
the history entry *this mount created*, never to one the page loaded with. A plain
`render()` + `pushState` spy could not draw that line.

**Art dim-state as a contract.** `next/image` is mocked to `img` with `className`
forwarded, so the suites assert the dim rule where it lives: a locked badge dims its
own key's art (and renders *no* disclosure control, and carries R-44's progress
line), an earned badge's panel never dims, and — the RecordDialog counterpart — a
record's art never dims at all, because `records.run_id` is `ON DELETE CASCADE` and a
record card can therefore never point at a missing run. That last one is a schema
invariant surfaced as a `className` assertion, which is exactly the kind of fact only
an interactive test can carry.

**The time formats pinned at their boundaries.** RecordDialog renders durations and
paces; the suite pins the two formats users actually see: `earliest_start` of 25,620s
prints `07:07` — never `7:07:00` (the zero-padded HH:MM contract, not a fallback to
a full clock span) — and a pace of 312s prints `5'12"/km`. The previousValue branches
are pinned with their tones: loud `text-ink-2` when the value is present, quiet
`text-ink-3` when it is not.

**React 19's two-commit settle, waited for, not assumed.** ProfileForm's save test
hits the known repo behavior (on record since the review sessions): under React 19's
transition semantics the result text lands one commit *before* `isPending` flips
back. The test waits for the observable sequence — "Saved." appears, *then* the
button re-enables — rather than asserting both at once, which would flake by
construction. The in-flight state is pinned the same way: disabled + `aria-busy` on
the button, asserted while the action is genuinely pending.

**The D11 wire format.** The blank-submit test asserts two things at once: the form
is *valid* (blank is a legal submission), and an untouched sex selector posts **no
key at all** — not an empty string, not a default — so the server's FormData read
distinguishes "user did not answer" from "user answered". The typed-submit test pins
the other end: values reach the wire with IDLE as the previous state.

## Decisions & Trade-offs
- **Five co-located suites, not one directory-level suite.** The directory's
  components are independently meaningful (shelf, two dialogs, table, form) and the
  repo's established convention is one test file per component co-located beside it.
  The alternative — one mega-suite — would have made the BadgeShelf URL machinery and
  the RecordDialog format rules share setup code that has no reason to be shared.
- **Real collaborators wherever the behavior lives; mocks only at the browser
  boundary.** `next/navigation` and `next/image` are mocked (they are the framework
  boundary); nothing else is. The dialogs render their real content, the form runs
  its real action pipeline, the table computes its real names. A mock of the panel
  component would have let every test pass while the actual open/close contract
  drifted.
- **The Field fix landed as its own commit, before the test commit.** It is a
  production behavior change to shared chrome, and it deserves a commit message a
  `git log -S aria-describedby` archaeologist can find on its own. It also forces the
  honest gate order: the fix commit cannot hide behind "tests pass" without the full
  suite having run against it.
- **The full suite was run because the diff touches shared chrome** — not because
  five new test files need a 301-file sweep to prove themselves, but because the
  *fix* does. A fix to `Field` is a change every form's tests co-own; the full sweep
  is the receipt that no suite anywhere depended on the broken attribute shape.
- **The flake was triaged by the repo's own record, not argued with.** One
  full-sweep-under-parallel-load failure appeared in
  `components/admin/explorer/MediaPane.test.tsx` (button stuck `aria-busy`). The
  record says this flake family reproduces on clean HEAD under parallel load. The
  method was followed: the file passed 10/10 in isolation, it imports `Button` — not
  `Field` — so the diff cannot reach it, and the serial full sweep is green. Verdict:
  known flake family, not this diff. No time burned chasing it; no false attribution
  either way.
- **The stale docblock was fixed in the same commit as the tests that falsified it,
  not in a third commit.** A "docs:" commit whose only content is admitting the new
  tests exist would be ceremony; the comment's correction is part of the same story.
- **No new harness infrastructure was invented.** Every technique — the hoisted
  navigation mock, the image mock, the pending-action gate, the two-commit settle
  wait — already existed in the ui/nina/review suites. The value of this session is
  the coverage, and a fourth harness dialect would have been negative value.

## Follow-ups & YAGNI notes
- **The node-env render suite and the new interactive suites now overlap in what they
  *look at*, not in what they *pin*.** `tests/badges.render.test.ts` remains the only
  consumer of `EarnedDayList` directly and works in the node env where the interactive
  suites cannot; nobody deleted it and that is correct. If a future session wants to
  collapse them, the direction is to keep the node suite for pure-markup contracts and
  move interaction claims exclusively into the co-located suites — not the reverse.
- **Profile page-level composition (the actual `app/` page assembling shelf + form +
  records) is still untested as a composition.** The five suites cover the components
  in isolation, which is the repo's chosen altitude; a page-level smoke test would be
  a different session's scope.
- **The badge/record catalogs' data-driven branches are pinned by key, not exhaustively
  per key.** BadgeShelf tests one key through the deep-link path and the kind
  discrimination tests one key per kind (badge-kind, record-kind, nonsense). If a new
  badge kind is added with its own panel behavior, that branch needs a new test — the
  suites do not enumerate the catalog.
- **`DetailPanel`'s own suite (`components/ui/DetailPanel.test.tsx`) plus the new five
  means the dialog chrome is now tested from both sides** — chrome-level and
  consumer-level. That is deliberate redundancy worth keeping: chrome tests protect
  the shell, consumer tests protect what each consumer needs from it.
- **MediaPane's parallel-load flake family remains open repo-wide** (recorded in this
  session only as a triage receipt). It reproduces on clean HEAD, so it predates and
  outlives this diff; a dedicated flake session owning the `aria-busy` settle pattern
  is the real fix, and it was deliberately not started here.

## Appendix

**The branch and its commits** (`token-maxxing-2026-09-12-profile-component-tests`,
worktree `tokenmax-2026-09-12-profile-component-tests`):

| Commit | Message | Content |
|---|---|---|
| `0774e46` | fix(ui): Field stops referencing a suppressed hint in aria-describedby | the production fix; hintId now exists only under `hint && !error` |
| `918d016` | test(profile): cover the directory's interactive layer — 52 tests, zero to full | 5 test files, 1,174 lines, + the BadgeDialog.tsx docblock rewrite (+1,188/−7 total) |
| *(this commit)* | docs: token-maxxing session profile-component-tests | this doc + README row |

**The five suites and their 52 tests, by file:**

| Test file | Lines | Tests | What the tests pin |
|---|---|---|---|
| `BadgeShelf.test.tsx` | 351 | 14 | tap writes `?panel=badge.<key>` via pushState with dates dropped on a fresh tap; deep-link opens the right panel with Close focused; badge-kind / record-kind / nonsense keys resolve to nothing; the F27 expanded date list newest-first, linked only where the run survives (R-22 span branch), `aria-controls` resolving to a real UL, and the pre-F13 count-vs-days gap said in words ("4 earlier, dates not recorded"); expand/collapse REPLACE in place, never push; `close()` backs only an entry this mount pushed, replaces for deep links |
| `BadgeDialog.test.tsx` | 301 | 13 | the count is a disclosure control a tap drives; the list contents and branches live in the DOM; the singular branch "1 earlier, date not recorded"; locked badges render no control, dim their own key's art, carry R-44's progress line; earned panels never dim; per-key art in the band |
| `RecordsTable.test.tsx` | 207 | 8 | full accessible names per row; the empty state is EmptySlot with **no dialog element at all**; kind discrimination through the shared parameter; the panel opens with its four lines and focused Close; close backs a pushed entry |
| `ProfileForm.test.tsx` | 200 | 10 | typed values reach the FormData wire with IDLE as prev; blank submit is valid and an untouched sex posts **no key at all** (D11); in-flight button disabled + `aria-busy` and "Saved." lands before `isPending` flips (React 19 two-commit settle, waited for not assumed); field errors land under the field with `aria-invalid` and the hint suppressed; the summary is `role=alert`; onboarding has Skip-for-now in its own form; edit renders no Skip even when handed a skip action |
| `RecordDialog.test.tsx` | 115 | 7 | the four uniform lines; previousValue branches with loud (`text-ink-2`) vs quiet (`text-ink-3`) tones; never dims (`records.run_id ON DELETE CASCADE`); `earliest_start` 25,620s prints `07:07`, never `7:07:00`; pace 312s prints `5'12"/km` |

**Gates and receipts:**

| Gate | Result |
|---|---|
| profile suites (final bytes) | 5 files / 52 tests, all passing |
| full suite, serial | 301 files / 5,454 tests, all passing |
| full suite under parallel load | one red in `MediaPane.test.tsx` (stuck `aria-busy`); passed 10/10 in isolation; imports `Button` not `Field`; serial sweep green → known flake family, not this diff |
| `npm run typecheck` (next typegen + tsc) | clean |
| prettier | run on exactly the touched files |

**The Field regression test's location:** the assertion lives in
`components/profile/ProfileForm.test.tsx` (the error path), resolving the input's
`aria-describedby` to an element and asserting existence — which is what converts the
fix from "looks right" to "cannot regress".

**Session identity:** worker session `profile-component-tests`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12 with a pre-assigned idea (worker mode skips
idea-menu generation); branch `token-maxxing-2026-09-12-profile-component-tests`;
code commits `0774e46` and `918d016` with this doc as the third commit; the merge to
main is the coordinator's — this worker neither merges nor pushes.
