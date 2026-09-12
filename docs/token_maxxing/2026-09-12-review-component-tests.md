# Token-Maxxing Session — 2026-09-12: Review Component Tests

## 🎯 Achievement / End Result
- **Goal of the burn:** Write component tests for `components/review` — the run-review
  screen, the app's second-most-important surface (the place a parsed screenshot becomes
  an edited, committed workout) — under the same happy-dom harness the prior sessions
  built for `components/ui` and `components/nina`. The gap was precise: a prior session
  had given `lib/review` real coverage via eight node-env suites under `tests/`, but the
  eleven components themselves had **zero tests**.
- **Concrete changes:** Six commits, **15 files, +2,590/−10**:
  - **12 new test files, 2,549 lines, 157 tests, all passing** (re-measured 2026-09-12
    after the fact: `12 passed (12)` files, `157 passed (157)` tests, 1.72s) — one per
    component plus the action binding:
    `ConsistencyBanner`(127) `HeroFields`(231) `HonestyChip`(60) `MoreDetails`(292)
    `ParsedInput`(388) `RawResponseDisclosure`(72) `RetryExtraction`(152)
    `ReviewClient`(358) `ReviewScreen`(262) `ScreenshotStrip`(170) `SplitsTable`(249)
    `ZoneBar`(188). Every one of the directory's 12 source `.tsx` files now has a
    test file — no orphans left.
  - **Docs drift the new suites falsified, fixed** (`94901e1`): the "this repo has no
    component tests" comments in `lib/review/copy.ts` and `lib/review/inputs.ts` (true
    when written, false since the harness landed), and the `Tests` section of
    `lib/review/.workflows/package_readme.md`, which now carries the measured table
    (twelve suites, 2,549 lines, 157 passing, measured 2026-09-12) plus the two harness
    rules the suites paid for.
- **Real value delivered:**
  - The review screen's behavioral contracts are now *pinned by executable tests*:
    the value contract of the input every field types through, the re-seed rule that
    preserves the reviewer's own spelling, the right-to-left time mask, the banner's
    `role=status`/`role=alert` split, per-row quoted aria-labels, the R-9 slot
    semantics, the R-45 sheet-source fallback, and — the property the screen exists
    for — a misread pace flips the banner to an alert **while the save stays enabled**.
  - The tests run against the **real collaborators**, not test doubles of the logic:
    the real `lib/review/inputs` parsers and spellers under every keystroke, the real
    `hydrateDraftFromExtraction` seed, and the real component tree in `ReviewScreen`
    rendered over the canonical TRUTH fixture from `research/schema.mjs` with only the
    server action mocked. A second copy of the arithmetic would have let the suite
    pass while the contract drifted; there is no second copy.
  - Five harness lessons extracted and written into the package readme (and below) —
    controlled-input re-render feedback, the pending-action cleanup poison, the
    `deferError`/`aria-invalid` bargain, happy-dom's caret behavior, and the
    `fireEvent.change`-is-not-a-keystroke mask ordering. The next component-test
    session starts from these instead of re-deriving them.
  - Three stale self-descriptions retired from the codebase's own docs.
- **Branch:** `token-maxxing-2026-09-12-review-component-tests`
- **Merge status:** on branch — six commits (`0818027` leaf trio, `ca078c0`
  ParsedInput, `c110df7` HeroFields+MoreDetails, `616f6a6` three block components,
  `def25f1` RetryExtraction+ReviewClient+ReviewScreen, `94901e1` docs drift); the
  coordinator session (`tokenmax-orch-2026-09-12`) owns the merge, and this doc
  commit is the only one this session adds on top.
- **Approx token burn:** a full worker session — survey of 11 components + the
  existing ui/nina conventions + lib/review, a harness probe phase, then twelve
  suites written and debugged against happy-dom quirks. Estimate ~1.8M. 🔥

## Context & Motivation
The coordinator (`tokenmax-orch-2026-09-12`) assigned this from the day's idea menu as
worker slug `review-component-tests`. The premise was coverage-shaped and easy to
state: the repo's component-test estate had been built up over 2026-09-11 and the
morning of 09-12 — `components/ui` (16 suites), `components/nina` (31),
`components/admin` (20), five app route handlers — but `components/review` had been
walked past by every one of those passes. Eleven components, zero tests, on the screen
the entire upload pipeline exists to feed: the one where a human checks what the LLM
extracted from their screenshots before it is committed.

The ordering mattered and was respected: the lib half had already been covered by a
prior session's eight node-env suites under `tests/` (schema, checks, draft, inputs,
commit), so this session was strictly the *interactive* half — the DOM, the
disclosures, the sheets, the wiring — which is exactly the half a node-env suite
cannot see.

Two working rules were set before writing:
1. **Follow the established harness pattern** (happy-dom via
   `// @vitest-environment happy-dom`, RTL + `fireEvent`/`act`, real collaborators
   over mocks) rather than inventing a fourth dialect alongside ui/nina/admin.
2. **Probe the harness before relying on it.** Three capabilities the planned suites
   would lean on were verified in happy-dom before any suite was written:
   `Element.scrollIntoView` (ScreenshotStrip's tile-pinning), controlled `<details>`
   `onToggle` (MoreDetails), and `setSelectionRange` (the mask's caret pin).

## What We Did (blow-by-blow)
1. **Survey.** All eleven components in `components/review` read end-to-end
   (ConsistencyBanner, HeroFields, HonestyChip, MoreDetails, ParsedInput,
   RawResponseDisclosure, RetryExtraction, ReviewClient, ReviewScreen,
   ScreenshotStrip, SplitsTable, ZoneBar), plus the existing test conventions in
   `components/ui` and `components/nina`, the `lib/review` modules those components
   call, and the canonical TRUTH fixture in `research/schema.mjs` — the ground-truth
   extraction the whole review system was built around and the natural fixture for
   any test that wants realistic data.
2. **Harness probe.** The three capabilities above verified in happy-dom before
   writing anything, so no suite was built on an assumed DOM behavior.
3. **Leaf trio first** (`0818027`): HonestyChip (the word + explanation carried twice,
   for eyes and for screen readers), RawResponseDisclosure (`safeStringify`'s
   truncation and cyclic-reference exits), ConsistencyBanner (all-clear renders as
   `role=status`; any failure renders as `role=alert`; the Jump link never overclaims
   — it links only to fields the banner actually names).
4. **ParsedInput** (`ca078c0`, 388 lines — the behavioral core, 24 cases): the value
   contract (blank is `null`; a parse failure is *flagged* but never collapses a real
   number into `null`); re-seeding only when the parsed value *disagrees* with what is
   typed, so the reviewer's own spelling of the same number survives an unrelated
   re-render; the right-to-left time mask (idempotent, clearable, caret pinned to the
   end while focused); `deferError` holding the message until blur; server errors
   outranking and never deferring. The REAL `lib/review/inputs` parsers run
   underneath — never a second copy of the arithmetic.
5. **Grid and collapse** (`c110df7`): HeroFields (the seven-field grid, scan-chip
   suppression, check-over-edited precedence, the date-guess evidence line, wiring
   through the real parsers including comma decimals) and MoreDetails (closed by
   default, the intent pills, and the R-9 positional post-workout slots: a held hole
   is held, never promoted, and both-cleared collapses back to nothing).
6. **Block components** (`616f6a6`): ScreenshotStrip (tiles + SheetSource's R-45
   exact-kind-or-honest-fallback resolver), SplitsTable (per-row aria-labels that
   quote the row's own values — km, partial-ness, time, pace, HR — because "Edit row
   11" eleven times over is useless to a screen reader; D14 partial hints; the row
   sheet's seed/mask-edit/toggle/Delete/Escape loop), ZoneBar (the bar's aria-label
   carries every share; floorless zone 1 and ceilingless zone 5 are stated in words,
   not elided; the five-row scaffold).
7. **Action and integration** (`def25f1`): RetryExtraction (asks first; POSTs the
   blob refs verbatim; refused and network failures surface as messages), ReviewClient
   (children stubbed, wiring real: checks re-run per keystroke — a slowed duration
   fails CHK-1 + CHK-2 + CHK-3 at once; the three banner states; the sticky bar never
   disables), and ReviewScreen (the REAL component tree over the TRUTH fixture with
   only the server action mocked: the golden one-tap payload, and a misread pace
   keystroke flipping the banner to an alert while the save stays enabled).
8. **Docs drift the suites falsified** (`94901e1`): `lib/review/copy.ts` and
   `lib/review/inputs.ts` both justified their placement with "this repo has no
   component tests" — true when written, false since the harness landed. Both keep
   the historical reasoning and drop the false present tense (copy.ts now points at
   `ReviewScreen.test.tsx` pinning its exact sentence). The
   `lib/review/.workflows/package_readme.md` Tests section replaced "component-level
   tests do not exist yet" with the measured table and the two harness rules.
9. **Verification:** `npm run typecheck` (next typegen + `tsc --noEmit`) green; full
   repo sweep 5,392/5,394 passing — the only two reds are the KNOWN
   MemoryTable/MediaPane parallel-load flake in `components/admin` (this diff touches
   nothing there; both files pass 30/30 in isolation and under
   `--no-file-parallelism`, the established verdict procedure for that flake).

## Code / Design Details
**The parent mock that feeds patches back through a re-render** (SplitsTable's
`renderTable`, the harness shape the controlled-sheet suites share):

```tsx
const view = render(<SplitsTable {...base} splits={splits} onChange={handleChange} />)
function handleChange(next: DraftSplit[]) {
  splits = next
  onChange(next)
  view.rerender(<SplitsTable {...base} splits={splits} onChange={handleChange} />)
}
```

Why it must work this way: React suppresses a change event whose DOM value already
equals the currently-rendered one. A parent that only *records* `onChange` never
re-renders, so the component's next read of its own controlled value silently does
nothing, and the test's later steps replay against a stale draft — the test fails in
a place that has nothing to do with the bug it appears to show. The lesson (now in
the package readme): **a controlled-section test harness must feed the patch back
through a re-render**, exactly like the real screen does.

**The pending-action poison (harness lesson 2).** An async action left pending across
RTL cleanup poisons the NEXT `useActionState` mount in the same file — the later
test's action state never lands, it times out inside `findByText`, and it passes in
isolation. The failure's location (the following test) points away from its cause
(the preceding test). Rule adopted file-wide: **nothing may leave a transition in
flight when a test ends**; deferred promises are always resolved before the test
returns (the `let resolveFetch!` pattern in RetryExtraction's suite).

**The `deferError`/`aria-invalid` bargain (lesson 3).** `aria-invalid` is gated on
the *message* in ParsedInput, not on the parse state — so while `deferError` holds
the message until blur, the input shows no failure signal at all. That is a
deliberate UX bargain (don't shout at the reviewer mid-typing) and the tests pin it
in both directions: no signal while deferred, signal the moment the message lands.

**The caret pin (lesson 4).** happy-dom's input value setter pins selection to the
new value's end, so an assertion that the mask pins the caret must *start* from a
deliberate `act(() => input.setSelectionRange(0, 0))` — otherwise the assertion
passes trivially. An unfocused-caret guard is unobservable in happy-dom and was not
written.

**The mask is right-to-left (lesson 5).** `fireEvent.change` is one event with a
final value, not a keystroke stream; and the mask lays digits right-to-left, so
6'36" is typed `'636'` — the intuitive `'396'` lays out as the invalid 3:96. Every
duration-input test in the file spells its input in mask order, not reading order.

**Real collaborators as the default.** SplitsTable and ReviewScreen seed from
`hydrateDraftFromExtraction(JSON.parse(JSON.stringify(TRUTH)))` — the same fixture
and the same hydration the production screen runs — rather than hand-built props.
The one deliberate stub is ReviewClient's children (the eleven components are each
tested for real elsewhere; the client's own value is its wiring, so the wiring is
what the suite exercises: per-keystroke check re-runs, banner state, the never-
disabled sticky bar).

## Decisions & Trade-offs
- **Probe-then-write over write-then-discover.** The three DOM capabilities were
  verified before any suite existed. Cost: a few minutes of throwaway probe code.
  Payoff: no suite had to be restructured when a happy-dom assumption broke.
- **Real parsers over mirrors.** Tests import `parseIntInput`/`parseDurationInput`/
  `toIntInput`/`toDurationInput` and assert through them. The alternative (restating
  the expected parsed value inline) would decouple the suite from the lib and let
  the two drift apart silently. Trade-off: a bug in the parser now fails both the
  lib suite and the component suite — which is the correct amplification, not
  noise.
- **One file per component, matching the ui/nina/admin convention**, with the
  shared harness logic (the re-render-feeding parent mock) duplicated per file
  rather than extracted into a helper module. Duplication was chosen because each
  suite's harness differs slightly (props, seed, sheet interactions) and a premature
  shared helper would have fossilized the wrong seam; if a fourth controlled-sheet
  suite appears, extraction becomes obviously right.
- **ReviewScreen runs the real tree, ReviewClient stubs it.** The screen's value is
  composition over the fixture (golden payload, banner flip on a misread), so it
  gets the real tree. The client's value is wiring, and wiring through eleven real
  children would make every child's failure look like a client failure — children
  stubbed, wiring real.
- **Docs drift fixed in the same session rather than filed.** The suite *proved* the
  "no component tests" claims false; leaving them standing after proving it would
  re-falsify them for the next reader. The readme-updater agent flow was skipped and
  the readme edit done by hand — small, measured, and already verified by the same
  gates the agent would run.
- **No mocking of `fetch` in RetryExtraction's integration sense.** The suite mocks
  the action boundary's fetch but asserts the *request shape* (blob refs verbatim)
  and the *failure messages*. A true integration variant (real `/api/extract` route)
  was out of scope — see follow-ups.

## Follow-ups & YAGNI notes
- **The rest of the component estate, measured 2026-09-12** (verified now, not
  assumed — every directory listed actually has zero `*.test.tsx` at depth 1):
  `components/auth` (3 source files), `components/charts` (11), `components/extract`
  (4), `components/insights` (2), `components/profile` (5), `components/push` (2),
  `components/runs` (4), `components/share` (3), `components/trends` (4) — 38
  source files across 9 directories. `components/charts` is the biggest single gap;
  the chart components are also the ones where happy-dom's zero-layout limitation
  will bite hardest, so they deserve a deliberate approach (SVG structure
  assertions, not pixels) rather than a copy of this session's harness.
- **RetryExtraction integration variant:** would need the `/api/extract` route
  handler in the loop (real request → real response contract), not just a mocked
  fetch. Only worth it if the route's contract starts drifting from the component's
  expectation.
- **Shared harness extraction** stays YAGNI until a fourth controlled-sheet suite
  forces the seam (see Decisions).
- **The readme-updater flow was bypassed, not broken.** The `lib/review` readme edit
  was done by hand this once; if the package's readme grows a second test-related
  section, run the agent flow for consistency.

## Appendix
- **Branch / commits** (oldest first): `0818027` test(review): component suites for
  the three leaves — HonestyChip, RawResponseDisclosure, ConsistencyBanner;
  `ca078c0` test(review): ParsedInput — the component the whole screen types into;
  `c110df7` test(review): HeroFields and MoreDetails — the seven-field grid and the
  one collapsed section; `616f6a6` test(review): the three block components —
  ScreenshotStrip, SplitsTable, ZoneBar; `def25f1` test(review): RetryExtraction,
  ReviewClient wiring, and the ReviewScreen integration; `94901e1` docs(review):
  the component suites exist — retire the 'no component tests' claims. Plus this
  doc commit on top.
- **Measured after the fact** (2026-09-12, this doc's session):
  `npx vitest run components/review` → `Test Files 12 passed (12)`, `Tests 157
  passed (157)`, 1.72s. `wc -l components/review/*.test.tsx` → 2,549 total, exactly
  one test file per source file (12/12).
- **Branch diffstat:** 15 files changed, +2,590/−10 (12 new test files;
  `lib/review/copy.ts` −3/+6-shaped comment fix; `lib/review/inputs.ts` comment fix;
  `lib/review/.workflows/package_readme.md` Tests section rewritten with the
  measured table).
- **Key files:**
  `components/review/ParsedInput.test.tsx` (the value
  contract), `components/review/SplitsTable.test.tsx` (the re-render-feeding parent
  mock), `components/review/ReviewScreen.test.tsx` (real tree over TRUTH),
  `components/review/RetryExtraction.test.tsx` (the deferred-promise pattern),
  `lib/review/.workflows/package_readme.md` (the harness rules as adopted).
- **Verification commands:** `npm run typecheck` (green); full sweep `5,392/5,394`
  with the two known `components/admin` parallel-load flakes (MemoryTable,
  MediaPane — pass 30/30 in isolation and under `--no-file-parallelism`; untouched
  by this diff).
- **Fixture:** `research/schema.mjs` `TRUTH` — the canonical ground-truth
  extraction; imported directly by SplitsTable and ReviewScreen suites via
  `hydrateDraftFromExtraction`.
