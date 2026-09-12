# Token-Maxxing Session — 2026-09-12: Extract Component Tests

## 🎯 Achievement / End Result
- **Goal of the burn:** Write real, meaningful tests for `components/extract` — 838
  lines across 5 files, zero test files — the component layer behind the app's front
  door (`/upload`) and its most agonizing waiting screen (the `/x/<id>` extraction
  progress state). The gap was pre-verified by the coordinator: the morning's
  `extract-photos-yagni` session had dead-code-audited `lib/extract`,
  `components/extract`, and `lib/photos` and confirmed **zero `*.test.tsx` files**
  exist for the component layer, so this was pure coverage, not repair.
- **Concrete changes:** One commit, `704ea84` — **5 new co-located test files, 1,194
  lines, 58 tests, all green** (plus this doc commit on top):
  - `KindSelector.test.tsx` (83 lines, 6 tests)
  - `ExtractingSkeleton.test.tsx` (195 lines, 14 tests)
  - `useExtractionStatus.test.tsx` (284 lines, 13 tests)
  - `ExtractionGate.test.tsx` (135 lines, 4 tests)
  - `UploadPicker.test.tsx` (497 lines, 21 tests)
  Every source file in the directory now has a test file — no orphans left
  (5 sources: `ExtractingSkeleton.tsx` 169, `ExtractionGate.tsx` 74, `KindSelector.tsx`
  69, `UploadPicker.tsx` 400, `useExtractionStatus.ts` 126 = 838).
- **Real value delivered:**
  - The layer's decisions are now proven **in execution, not just in constants**:
    `tests/extract.*.test.ts` already pinned the poll backoff numbers, the give-up
    threshold, and the `planPicked`/`reassignKind` arithmetic as *values* — this suite
    proves the components *execute* them: the first poll really fires at 2s and not
    before, the overdue copy really flips at 1.6× the typical wait, the three-screen
    cap really hides "Add another" through the real `planPicked`, the held-kind swap
    really re-uploads both tiles.
  - **The provenance race is pinned.** UploadPicker's subtlest behavior — a swap
    while PUT 1 is still in flight bumps a generation counter, the stale PUT's
    (earlier-resolving) result is *dropped*, and the submitted body carries only the
    current generation's pathname+kind — now has a regression test that fails if the
    generation guard is removed (verified by mutation, then reverted).
  - The two user-facing honesty contracts are DOM-visible: the skeleton's
    honest-progress copy (never a fake percentage, even when "running long") and
    F16's no-dimming invariant (every unselected kind radio stays enabled — a tile
    holding a kind dims, the *choice* never does).
  - **Findings banked** (below): a refresh-after-give-up dead band in
    `useExtractionStatus` (pinned as-is with an explanatory comment — a behavior
    change is the team's call), a surviving-mutant explanation for the in-run
    terminal guard, a stale "no component tests by design" premise in an existing
    test file, and two harness lessons that cost the session its only red turns.
- **Branch:** `token-maxxing-2026-09-12-extract-component-tests`
- **Merge status:** on branch (worker session inside coordinator fan-out
  `tokenmax-orch-2026-09-12`, slug `extract-component-tests`; the coordinator lands
  the set's branches)
- **Approx token burn:** a full worker session — 838 lines of source read, five
  suites written and debugged under fake timers and deferred-promise gating, one
  mutation check, plus two transient 429 restarts re-booting the worker.
  Estimate ~1.6M. 🔥

## Context & Motivation
This was a WORKER session spawned by the day's coordinator fan-out
(`tokenmax-orch-2026-09-12`). The idea was pre-assigned and coverage-shaped, with the
premise already verified by a sibling session: `extract-photos-yagni` had walked
`lib/extract`, `components/extract`, and `lib/photos` for dead code that same morning
and recorded that the component layer had **zero test files** — while `lib/extract`
itself enjoyed strong coverage through `tests/extract.*.test.ts` suites that pin the
decisions (poll interval 2s, backoff caps, give-up at ~90s, `planPicked`,
`reassignKind`, `rejectionReason`, the kind-selector *source scan*).

That split is exactly the kind a component suite exists to close: the lib suites
prove the numbers; nothing proved the components *use* the numbers. A wrong constant
wired into the wrong comparison, a poll that never starts, a give-up screen that
never appears, an upload whose stale result overwrites its replacement — none of
those are visible to a source scan or a lib-level unit test.

The session also inherited a mature harness (built 2026-09-11 for `components/nina`,
extended through ui/admin/review): happy-dom via
`// @vitest-environment happy-dom`, RTL + `fireEvent`/`act`, co-located `*.test.tsx`
files, real collaborators over mocks. So the work was writing five suites against
known ground, not inventing a testing dialect.

Two working rules were set before writing:
1. **Characterization only** — the code is already dead-code-audited and shipped;
   the suite describes what IS, and any behavior change found gets *recorded*, not
   "fixed" in the same breath.
2. **Only true externals mocked** — `@vercel/blob/client`'s `upload`,
   `next/navigation`'s router, and `compressForExtraction` (canvas does not exist in
   happy-dom). The lib deciders — `planPicked`, `reassignKind`, `rejectionReason`,
   `newId`, the poll constants — run **for real**, per the house rule: never a second
   copy of the arithmetic.

## What We Did (blow-by-blow)
1. **Boot.** The worker hit two transient 429 rate-limit restarts at boot; the
   coordinator confirmed each time that no work was lost. Third boot stuck.
2. **Survey.** All five `components/extract` sources read end-to-end, plus the
   existing `tests/extract.*.test.ts` suites (to know what was *already* pinned and
   avoid restating it), plus the ui/admin/review harness conventions.
3. **KindSelector** (6 tests) — the rendered complement of
   `tests/extract.kindSelector.test.ts`, which is a *source scan*: one named
   radiogroup; radios labelled from the real `SCREEN_KIND_LABEL`; `aria-checked` on
   exactly the current value; **every tap reported**, including a re-tap of the held
   kind (the no-op decision belongs to `reassignKind` — the component just reports,
   the lib decides); every unselected radio **enabled**, making F16's no-dimming
   invariant visible in the DOM for the first time; the disabled guard.
4. **ExtractingSkeleton** (14 tests) — every branch of the R-41 honest-progress
   screen: the elapsed counter with `aria-live`; "All of it" vs "All N screens";
   figures labelled by kind; no figures at zero photos; the overdue bound pinned at
   **exactly 1.6 × 35s = 56s (calm) vs 57s ("running long")** — and still no
   percentage, even when running long; the give-up screen (title/copy swap,
   Check again → `onRetry`, Start over → `/upload`, pulse dropped, pollError
   suppressed); the poll-hiccup line; the `aria-hidden` skeleton card.
5. **useExtractionStatus** (13 tests) — the runtime the constants never proved, under
   fake timers with act-wrapped `advanceTimersByTimeAsync`: terminal-initial never
   polls and never starts the clock; first poll at 2s (not before) with
   `cache: 'no-store'`; pending keeps polling, terminal ends the cycle **for good**;
   backoff bands observable in *actual fetch times* (attempts at 2, 4, 6, 8 then
   11…; 10 attempts by 26s, next at 31s); one failed poll is transport, not failure
   (pollError set then cleared); HTTP 503 → `'status 503'` quietly; the elapsed
   counter runs from row `createdAt` (10 on mount) and **re-anchors to the server's**
   (43 at t=3s when the server says the row is 40s old); the counter freezes on
   terminal; the give-up at ~91s stops for good with **no zombie cycle**; `refresh()`
   re-arms — and its stale gate **fails closed** (re-gives-up at the first re-check
   without any request — pinned as-is with a comment, see findings); `refresh()`
   resets the attempt counter (next poll 2s after refresh, not 3s) and clears
   pollError; mid-wait unmount cancels.
6. **ExtractionGate** (4 tests) — the terminal-initial handoff: status card
   (`role=status`, `aria-live=polite`) plus **exactly one** `router.refresh()`,
   stable across rerender, zero fetches; pending-initial renders the skeleton with
   the row's photos and no refresh; row age carried into the elapsed counter; the
   first terminal answer flips the gate — refresh fires **exactly once on the
   transition** and the poll is retired.
7. **UploadPicker** (21 tests, the big one at 497 lines) — the full pipeline through
   the real deciders: pick → Resizing → Uploading → **Ready · 55 KB**, with both
   stages gated by deferred promises so intermediate states are observable; the PUT
   pathname matches the real `SHOT_REQUEST_PATHNAME_RE` with
   access/handleUploadUrl/clientPayload kind in the signed payload; F29 device-order
   defaults (Heart rate, then Splits); the three-screen cap through **real**
   `planPicked` ("Three screenshots is the most one run can have."), Add-another
   hidden at 3; a free-kind tap re-uploads only that tile (3 PUTs) while a
   held-kind tap swaps BOTH (4 PUTs) and the labels exchange; **the provenance
   race** — swap while PUT 1 is in flight → generation bump → the stale PUT
   resolving *first* writes nothing (tile not ready, button stays disabled) → the
   current PUT lands → the submitted body carries pathname+kind of generation 1
   only; upload/compression failures shown on the tile as `role=alert` with
   Read-this-run held back; a rejected file explained while the good tile still
   finishes; Remove drops the tile, clears formError, returns to the empty page;
   Read-this-run waits ("Waiting for the uploads to finish.") then states the real
   estimate ("Heart rate · Splits — reading all 2 in one pass takes about 35
   seconds."); submit POSTs blob refs in tile order to `/api/extract` and
   `router.push('/x/<id>')` on 202; 429 `{error}` shown and the button re-armed;
   500 non-JSON → "The server refused this (500)."; **StrictMode double-render
   uploads exactly once** (F17 run for real, not asserted from a comment); unmount
   revokes every preview object URL.
8. **Mutation check.** The one guard subtle enough to doubt — `patchIfCurrent`'s
   generation check (`t.gen === gen`) — was removed by hand: the race test turned
   red. Guard restored. The suite's most important test is proven to test something.
9. **Gates and commit.** Full repo suite **301 files / 5,460 tests, all green**;
   `npm run typecheck` (typegen) then `npx tsc --noEmit` clean; `prettier --write`
   applied to the new files; committed as `704ea84`. One broken drafted assertion
   was caught and fixed *before the first run* — the suites went green on their
   first execution.

## Code / Design Details
**Gating async stages so intermediate states exist.** The session's first red turns
came from a test-design error, not product code: auto-resolving mocks run the whole
compress→upload chain inside one act flush, so "Uploading" is *never on the screen*.
The fix is two deferred promises per stage:

```tsx
let resolveCompress!: () => void
let resolveUpload!: (r: { url: string; pathname: string }) => void
vi.mocked(compressForExtraction).mockImplementation(
  () => new Promise((r) => { resolveCompress = () => r(BLOB_55KB) }),
)
```

Pick a file → the tile shows "Resizing" while the compress promise is pending →
`act(() => resolveCompress())` → "Uploading" while upload pends → resolve →
"Ready · 55 KB". Each intermediate state becomes a thing a test can *hold* and
assert, instead of a state that existed for zero frames. The companion lesson: a
controlled async chain still renders its disabled gated control immediately —
**present ≠ enabled**; assert `toBeEnabled()` on the control, not just its existence.

**The provenance-race harness.** Two uploads pended simultaneously, resolved
out of order (stale first), then the submitted body inspected:

```tsx
act(() => resolveUploadFor(tile0))  // the STALE gen's PUT resolves first
expect(...).toBeDisabled()          // its result was dropped — tile not ready
act(() => resolveUploadFor(tile1))  // the current gen's PUT lands
// submitted body carries pathname+kind of gen 1 only
```

`patchIfCurrent`'s `t.gen === gen` is what makes the first resolve a no-op. The
mutation check (dropping the guard → red) is what elevates this from "test happens
to pass" to "test would catch the regression."

**Fake timers + real backoff.** `vi.useFakeTimers()` with
`act(async () => { await advanceTimersByTimeAsync(2_000) })` per step — never
`userEvent` (which hangs under fake timers; the established house combo). Because
the poll constants run for real, the backoff schedule asserts itself through
*observable fetch timestamps*: after four 2s-spaced attempts the gap widens to 3s,
10 attempts land by 26s and the next at 31s — the lib's band math proven in the
hook's actual call history, not restated.

**The re-anchoring assertion.** The elapsed counter mounts at 10 (row `createdAt`
is 10s old), the first poll answers with a server-side `createdAt` 40s in the past,
and the counter jumps to 43 at t=3s. That is the honest-clock contract: client time
is a placeholder until the server's authoritative age arrives — then the counter
*says the server's number*, even though it un-flatters the progress bar.

**Real deciders everywhere.** `planPicked` (three-screen cap text and Add-another
hiding), `reassignKind` (the swap semantics: free kind → one tile re-uploads; held
kind → both), `rejectionReason`, `newId`, and the poll constants all run for real.
The only mocks are the three true externals: `@vercel/blob/client` upload,
`next/navigation` router, `compressForExtraction`.

## Decisions & Trade-offs
- **Characterization, not repair.** The code was already audited this morning; the
  suite's job is to *pin*, and where behavior looked surprising (the refresh
  stale-gate dead band), the finding was recorded with a pinning comment rather
  than "fixed" — a behavior change to a shipped waiting screen is the team's call,
  not a test session's.
- **One mutation check, not a campaign.** Full mutation testing is out of scope for
  a coverage session; but the suite's single most subtle assertion (the race) was
  proven falsifiable by hand. A test that cannot fail is decoration; this one was
  shown to be a tripwire.
- **Pinning the dead band as-is.** The refresh-after-give-up behavior is odd enough
  to document and stable enough to pin: the test asserts the *current* behavior
  (re-gives-up without a request) with a comment explaining why, so a future
  intentional change shows up as a deliberate edit to an explained assertion, not
  a mystery failure.
- **Co-located `*.test.tsx`, one per source file**, matching the ui/nina/admin/
  review convention — including the hook (`useExtractionStatus.test.tsx` next to
  `useExtractionStatus.ts`), which needs the happy-dom environment because it
  renders via `renderHook`-style component wrapping and asserts DOM-facing side
  effects.
- **StrictMode tested for real.** F17 (double-render uploads once) could have been
  asserted from the code's structure; instead the suite renders under StrictMode
  and counts PUTs. The cost is one more harness wrapper; the payoff is that the
  invariant survives refactors that move where the effect is registered.

## Follow-ups & YAGNI notes
1. **Refresh-after-give-up dead band (kept, pinned, team's call).** In
   `useExtractionStatus` the stale check fires BEFORE the fetch, so after a client
   give-up, "Check again" re-arms but re-gives-up at its first check WITHOUT any
   request. The module comment's promise — "one check again tap always reaches a
   terminal answer" — holds only via the give-up-adjacent read at ~86s (where the
   server heals the row, R-20) or a fresh page load. Narrow window (≈86–91s plus
   clock skew), benign outcome (the screen flips back to "taking longer than
   expected"), so pinned as-is with an explanatory comment in the test. If anyone
   wants the comment's promise literal, the fix is to let refresh()'s first check
   through the stale gate — a one-line behavior change with a test already waiting
   to flip.
2. **The in-run `if (isTerminal(next.status)) return` is defense-in-depth.** A
   mutant removing it *survives*: the `settled` flag re-runs the effect, whose
   cleanup cancels the in-flight chain, so the invariant (the cycle ends) holds
   through the mechanism anyway. The suite pins the invariant, not the line —
   which is the robust choice; the line itself may be load-bearing under timers
   the suite doesn't simulate, so it stays.
3. **`tests/extract.kindSelector.test.ts`'s premise is stale.** Its comment claims
   "This repo has no component tests by design" — false since the harness landed,
   and this session makes the extract layer the fifth directory with suites (ui,
   review, admin, nina, extract). Its text-scan assertions remain valid regardless;
   only the justification rots. Left untouched here (out of scope for a test-adding
   session); worth one comment line whenever that file is next touched.
4. **Harness confirmations for the next session:** (a) auto-resolving mocks
   compress the whole async chain into one act flush — intermediate states are
   unobservable unless BOTH stages are gated with deferred promises; (b) a
   controlled async chain renders its disabled gated control immediately — assert
   enabled-ness, not presence. Both now demonstrated in `UploadPicker.test.tsx`,
   which can serve as the reference harness.

## Appendix
- **Commit:** `704ea84` — `test(extract): cover the component layer — 58 runtime
  tests for the /upload and /x waiting screens`. Diffstat: 5 files changed,
  **+1,194/−0** (`ExtractingSkeleton.test.tsx` 195, `ExtractionGate.test.tsx` 135,
  `KindSelector.test.tsx` 83, `UploadPicker.test.tsx` 497,
  `useExtractionStatus.test.tsx` 284). Plus this doc commit on top.
- **Test counts per file** (measured, this session): KindSelector 6,
  ExtractingSkeleton 14, useExtractionStatus 13, ExtractionGate 4, UploadPicker 21
  — 58 total, all passing on the suites' first run (one drafted assertion was
  corrected pre-run).
- **Verification commands:** `npx vitest run` (full repo) → 301 test files /
  5,460 tests, all green; `npm run typecheck` (typegen) + `npx tsc --noEmit` →
  clean; `prettier --write` on the five new files.
- **Mutation check:** removed the `t.gen === gen` guard from `patchIfCurrent`
  (`components/extract/UploadPicker.tsx:112`) — the provenance-race test went red;
  guard restored, suite green again. (Verified then reverted; nothing committed.)
- **Source ground truth:** `components/extract` = 838 lines across 5 files
  (169 + 74 + 69 + 400 + 126); after this session the directory holds 2,032 lines
  of which 1,194 are tests.
- **Session narrative:** worker boot hit two transient 429 rate-limit restarts
  (coordinator-confirmed no work lost each time); one broken drafted assertion
  caught and fixed before the first run; 58/58 green; committed as `704ea84` with
  the doc commit to follow.
