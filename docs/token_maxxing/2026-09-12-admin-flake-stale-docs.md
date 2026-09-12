# Token-Maxxing Session — 2026-09-12: Admin Test-Flake Root Cause & Citation Sweep

## 🎯 Achievement / End Result
- **Goal of the burn:** two recorded-but-never-acted-on admin debts, assigned together as one
  worker idea by coordinator `tokenmax-orch-2026-09-12`: **(1)** reproduce the long-recorded
  MemoryTable/SelectionPane aria-busy test flake under parallel load in `components/admin`
  (verification bar: `--no-file-parallelism` plus loaded rounds) and fix its **root cause** —
  the flake had been reproduced twice before but never fixed; **(2)** sweep the stale
  `docs/design-brief.md` citations in `components/admin/PhotoReferencePicker.tsx`, `touch.ts`,
  `DialSlider.tsx`, `UserPicker.tsx`, `photoReferenceModel.ts` and
  `tests/admin.shell.test.ts` — the follow-ups today's docs-design-audit session
  (`580863d`) had recorded as verified but out of its docs-only scope.
- **Concrete changes:** two commits —
  - `6267355` — "fix(admin): the MemoryTable/SelectionPane load flake — wait out the
    two-commit settle" — 2 files, **+46/−12**: `components/admin/MemoryTable.test.tsx`
    (the `toBeEnabled()` gate + `vi.resetAllMocks()` with rationale comments) and
    `components/admin/explorer/SelectionPane.test.tsx` (all flight-dependent bare post-click
    expects converted to `waitFor` — 5 tests; the file gained its first `waitFor` import).
  - `5f4a593` — "docs(admin): sweep the design-brief citations — two false attributions, two
    line pins" — 4 files, **+9/−6**: `components/admin/UserPicker.tsx`,
    `app/admin/layout.tsx` (added to scope — same defect class), `components/admin/DialSlider.tsx`,
    `tests/admin.shell.test.ts`.
- **Real value delivered:**
  - **The flake is reproduced on demand and dead.** Solo, `npx vitest run tests/admin
    components/admin` was green (53 files / 1125 tests); under 3 concurrent full-suite
    `npx vitest run` sweeps the same target sweep failed exactly the recorded pair —
    "adds on Enter or the + button, clears the text, and KEEPS the category"
    (`toHaveBeenNthCalledWith(2)` timing out at "called only 1 times") and "keeps the typed
    row and shows the error when the insert is refused" (error text never rendered, the DOM
    dump showing the input at `value=""`). After the fix: two loaded rounds green, the serial
    `--no-file-parallelism` sweep green, a final loaded round green — 1125/1125 every time.
  - **A two-layer root cause, probe-established, that explains why the two tests always
    failed together.** Layer 1: React 19.2 settles an async `useTransition` in **two
    commits** — the results render first (cleared text, the note), and only then does the
    `isPending` flip re-enable the `disabled={pending}` controls. A `waitFor(input
    value='')` can therefore resolve while the input is still disabled, and user-event
    typing into a disabled input **silently drops every keystroke** — so the second add
    never fired. Layer 2: `vi.clearAllMocks()` does **not** clear `mockResolvedValueOnce`
    queues, so the failed first test left an unconsumed `{ok:true}` once-value that
    shadowed the second test's fresh `mockResolvedValue({ok:false,...})` — a **ghost
    success** that cleared the input and hid the error.
  - **The fix is test-side at the right altitude.** The component's `disabled={pending}` is
    untouched — it is the documented sequential-dispatch guard (Next dispatches server
    actions one at a time per client; the MemoryTable header comments carry the argument).
  - **Two false citations corrected, two fragile line-pins retired.** `UserPicker.tsx`'s
    "plain-text link, never an icon button" stance is not in the brief and never was
    (`git log -S` at both commits that added the citation); `app/admin/layout.tsx`'s "470 px
    column is the brief's iPhone XS Max target" is false — the brief specifies 414 × 896 and
    `git log -S "470"` on the brief returns nothing. `DialSlider.tsx`'s `:175` and
    `admin.shell.test.ts`'s "(line 18)" pins — true today but fragile enough that the
    audit session had to keep its brief edits line-count-neutral — are now content-anchored.
  - **A verified-true ledger for the rest:** `touch.ts` (the brief and
    `components/ui/Button.tsx:13` both really name 44 px), `PhotoReferencePicker.tsx`
    (92 px ≈ 2.1× the 44 pt minimum) and `photoReferenceModel.ts` cite content the brief
    really carries — left byte-identical.
  - **A new, unrelated flake class discovered, bounded, and documented rather than patched:**
    `beforeEach` hook 10 s timeouts in `tests/admin.imageGenActions.test.ts` and
    `tests/admin.settingsActions.test.ts`, observed once under 4× oversubscription only.
- **Branch:** `token-maxxing-2026-09-12-admin-flake-stale-docs`
- **Merge status:** merged (commit `523337b` — "merge: token-maxxing session admin-flake-stale-docs")
- **Approx token burn:** heavy for a two-commit session — the reproduction loop dominated:
  full-suite sweeps run solo, three-at-once, serially, and again after the fix (each sweep
  ~1125 tests), plus temporary probe-test cycles and two citation-verification
  git-archaeology passes. 🔥

## Context & Motivation
The MemoryTable/SelectionPane flake had a history before this session: it had been **recorded
twice and reproduced twice, but never fixed** — each prior sighting left a note ("fails under
load", "aria-busy related") and moved on. A flake that survives two reproductions is worse
than an unknown flake, because everyone has learned to distrust the suite around it. The
coordinator's assigned idea made the fix the deliverable this time, with the reproduction
bar spelled out: get it failing on demand under parallel load, and prove the fix with both
loaded rounds and the serial `--no-file-parallelism` sweep.

The citation half was fresh debt: earlier the same day, the docs-design-audit session
(`580863d`) verified the design docs against the tree and found that several **code
comments** cite `docs/design-brief.md` for content it does not contain — but those fixes
touch code files, so the docs-only session recorded them as follow-ups instead of fixing
them. This session took the list. The two halves pair naturally: both are admin-surface
debts a prior session proved real but deferred, and both reward the same discipline —
establish ground truth first (a probe for the flake, `git log -S` for the citations), then
edit only what the evidence condemns.

## What We Did (blow-by-blow)

### Part 1 — the flake
1. **Baseline: solo is green.** `npx vitest run tests/admin components/admin` on clean HEAD:
   53 files / 1125 tests, all passing. The flake is load-shaped, so a solo green proves
   nothing except that the target must be attacked under concurrency.
2. **Reproduced on demand.** Ran three concurrent full-suite `npx vitest run` sweeps and ran
   the target sweep inside that load. It failed with **exactly the recorded pair**, no
   collateral failures in the file:
   - "adds on Enter or the + button, clears the text, and KEEPS the category" —
     `toHaveBeenNthCalledWith(2, ...)` timed out: the insert action was **"called only 1
     times"** — the second add never happened.
   - "keeps the typed row and shows the error when the insert is refused" — the expected
     error text never rendered, and the failure's DOM dump showed the input at `value=""`:
     the typed row the test thought it had submitted did not exist.
3. **Probe round (temporary test, deleted before commit).** vitest 4 swallows
   `console.log` under `run`, so probe findings were logged to a file. The probe instrumented
   the settle sequence tick by tick and answered four questions:
   - **How many commits does the transition take?** Two. Tick 0 showed
     `disabled=true value="" note=yes` — the results (cleared text, the "Written." note)
     are already rendered — and tick 1 showed `disabled=false`. React 19.2 commits an async
     `useTransition`'s settle in two passes: results first, `isPending` flip second.
   - **What happens if you type while still disabled?** Every keystroke is dropped. The
     probe typed `'X'` into the disabled input: value unchanged, **zero** action calls. The
     second add never fired because the typing that should have triggered it never landed.
   - **Is focus the problem?** No. happy-dom does **not** blur a disabled input — focus
     persisted throughout. The drop is at the event level (user-event targets a disabled
     control and its input events go nowhere), not a focus-loss artifact.
   - **Why did the refusal test fail too?** `vi.clearAllMocks()` does not clear
     `mockResolvedValueOnce` queues. The probe demonstrated a leftover once-value surviving
     a `clearAllMocks()`. The failed add-row test had queued an `{ok:true}` once-value it
     never consumed; the next test's fresh `mockResolvedValue({ok:false,...})` was shadowed
     by that ghost success — the component saw a successful insert, cleared the input, and
     never rendered the error. This is the mechanical link that made the two tests fail
     **together**, every time.
4. **The fix (commit `6267355`):**
   - MemoryTable: the second typing is now gated on
     `await waitFor(() => expect(input).toBeEnabled())` — the test waits out the entire
     two-commit settle before interacting again. A rationale comment at the site explains
     the two-commit settle and why the gate costs nothing in the green case (both commits
     normally land before the first poll either way).
   - MemoryTable: `beforeEach` switched from `vi.clearAllMocks()` to `vi.resetAllMocks()`,
     with a comment spelling out the once-queue leak and that a leaked `{ok:true}` would
     make the refusal test fail in a way that **blames the component**.
   - SelectionPane: the rail's verbs run inside the same `useTransition` family (`Button`
     `loading={pending}`), and its bare post-click expects race the same settle. All five
     flight-dependent assertions converted to `waitFor` (save crop, refusal text, set
     profile picture, remove — including a second `waitFor` for `onRemoved`, which fires
     only after the action resolves inside the transition — and the re-describe + save
     description pair). The file gained its first `waitFor` import.
5. **Deliberately not changed:** the component's `disabled={pending}` itself. It is the
   documented sequential-dispatch guard — Next dispatches server actions one at a time per
   client, so a pending flight must block re-dispatch — and the MemoryTable header comments
   already carry that argument. The bug was in the test's assumption about *when* the
   controls come back, not in the guard.
6. **Verification ladder.** Pre-fix, the first loaded attempt had failed with the recorded
   pair. After the fix, in order:
   - loaded round 1: **1125/1125**;
   - loaded round 2: the recorded pair green — but **two other failures appeared**,
     `beforeEach` "Hook timed out in 10000ms" in `tests/admin.imageGenActions.test.ts` and
     `tests/admin.settingsActions.test.ts`, under 4× oversubscription. A **new, unrelated
     flake class**, deliberately documented rather than patched (see Decisions and
     Follow-ups);
   - serial `npx vitest run --no-file-parallelism`: **1125/1125**;
   - final loaded round: **1125/1125**.
   - Gates: `npx next typegen` + `npx tsc --noEmit` clean; prettier clean.

### Part 2 — the citation sweep
All six assigned files checked against the current 219-line `docs/design-brief.md`
(the same file the audit session had just compacted — its line-count-neutral dance is what
made the line-pin fragility visible in the first place):

7. **`components/admin/UserPicker.tsx:12` — false attribution.** The comment credited the
   brief with "a plain-text link, never an icon button" — a stance the brief does not state
   and never stated: `git log -S` on the phrase across the brief's history at both commits
   that added the citation returns nothing. Re-attributed to where the phrase actually
   lives: `AppShell`'s screen-title row (`components/ui/AppShell.tsx`). The new comment says
   so explicitly and adds "`docs/design-brief.md` states no such stance" so the next reader
   does not re-inflate the citation. (Note: `AppShell`'s own comment calls this "the design
   brief's reading-app stance" — equally unverifiable, left for a future sweep; see
   Follow-ups.)
8. **`app/admin/layout.tsx` — added to scope.** Not on the assigned file list, but the same
   defect class and already on the audit session's recorded follow-ups: its header comment
   called the 470 px column "`docs/design-brief.md`'s iPhone XS Max target" — false;
   `git log -S "470"` on the brief returns nothing, and the brief specifies **414 × 896**.
   Now attributed to `AppShell`'s own choice, with the brief's real target named.
9. **`components/admin/DialSlider.tsx` and `tests/admin.shell.test.ts` — fragile line pins.**
   `docs/design-brief.md:175` / "(line 18)" were **true today** but structurally fragile:
   the audit session had to keep both of its brief edits above line 175 line-count-neutral
   purely to avoid breaking the pin. Replaced with content-anchored citations — the quoted
   "Minimum 44 × 44pt tap targets" — so future brief edits no longer bend around a code
   comment.
10. **Verified TRUE, left byte-identical:** `components/admin/touch.ts` (the brief and
    `components/ui/Button.tsx:13` both really name the 44 px minimum);
    `components/admin/PhotoReferencePicker.tsx` (92 px ≈ 2.1× the 44 pt minimum — the
    arithmetic holds); `components/admin/photoReferenceModel.ts` (cites the minimum the
    brief really carries, no line pin).
11. **Deliberately untouched:** the archived plan copy
    `components/admin/.workflows/plan/P2-CA-A002.md`, which quotes the brief's words — it
    is history, not source, and archived copies do not get edited to match later
    discoveries.
12. **Committed both halves separately** (`6267355` fix, `5f4a593` docs sweep), gates clean,
    tree clean, unpushed — worker contract.

## Code / Design Details

**The two-commit settle, and the gate** (MemoryTable.test.tsx) — the added wait and its
rationale, in situ:

```tsx
await waitFor(() => expect(input).toHaveValue(''))
+ /*
+  * The add row disables its controls for the flight, and React settles an async transition in
+  * TWO commits: the results render (cleared text, the note) and only then the `isPending` flip
+  * that re-enables them. Waiting for the value alone can therefore resolve while the input is
+  * still disabled — and every keystroke typed into a disabled input is silently dropped, which
+  * turned the second add below into a 1s timeout whenever the machine was loaded enough to
+  * spread those two commits across a waitFor poll. Gating on the re-enable waits out the whole
+  * settle, in the green case at zero extra cost: both commits normally land before the first
+  * poll either way.
+  */
+ await waitFor(() => expect(input).toBeEnabled())
expect(screen.getByText('Written.')).toBeInTheDocument()
```

**The ghost-once-value fix** (MemoryTable.test.tsx) — `clear` → `reset`, with the failure
mode written where the next person will need it:

```tsx
+ /*
+  * RESET, not clear: `clearAllMocks` wipes call history but leaves `mockResolvedValueOnce` queues
+  * standing, so a test that fails before consuming its once-values leaks a ghost `{ok: true}` into
+  * the NEXT test's fresh `mockResolvedValue` — the refusal test below would then see a successful
+  * insert and fail in a way that blames the component.
+  */
beforeEach(() => {
-  vi.clearAllMocks()
+  vi.resetAllMocks()
})
```

**SelectionPane** — one of the five conversions (the file's first `waitFor` import came
with them); the block comment above the group states the rule: every assertion that depends
on an action's flight is waited for, not assumed:

```tsx
- expect(saveNinaAvatarCropAction).toHaveBeenCalledWith({ id: 'crop-me', scale: 2, x: 5, y: 5 })
+ await waitFor(() =>
+   expect(saveNinaAvatarCropAction).toHaveBeenCalledWith({
+     id: 'crop-me',
+     scale: 2,
+     x: 5,
+     y: 5,
+   }),
+ )
```

**Citation sweep, before/after** — the two false attributions:

```tsx
// app/admin/layout.tsx — before
// ...the 470 px column is `docs/design-brief.md`'s
// iPhone XS Max target, and the album manager's content is genuinely side-by-side.
// after
// ...the 470 px column is `AppShell`'s own choice, not
// the brief's — `docs/design-brief.md` targets an iPhone XS Max at 414 × 896 — and the album
// manager's content is genuinely side-by-side.

// components/admin/UserPicker.tsx — before
// The same "a plain-text link, never an
// icon button" stance from `docs/design-brief.md`.
// after
// The same "a plain-text link, never an
// icon button" stance `AppShell`'s screen-title row established (`components/ui/AppShell.tsx`) —
// `docs/design-brief.md` states no such stance.
```

**The two line pins retired** — content anchors replace line numbers:

```tsx
// components/admin/DialSlider.tsx — before
// * 44 px rule (`docs/design-brief.md:175`); a range input's hit area is its box, ...
// after
// * 44 px rule (`docs/design-brief.md`, "Minimum 44 × 44pt tap targets"); a range input's hit area is
// * its box, ...

// tests/admin.shell.test.ts — before
// docs/design-brief.md:175 — "Minimum 44 × 44pt tap targets", and the iOS constraints win over
// any conflicting design output (line 18). ...
// after
// docs/design-brief.md — "Minimum 44 × 44pt tap targets", and the iOS constraints block wins
// over any conflicting design output. ...
```

**The verified-true ledger** (tested against the current brief, left byte-identical):

| File | Claim checked | Result |
|---|---|---|
| `components/admin/touch.ts` | the brief names a 44 px minimum | TRUE (also `components/ui/Button.tsx:13`) |
| `components/admin/PhotoReferencePicker.tsx` | 92 px ≈ 2.1× the 44 pt minimum | TRUE |
| `components/admin/photoReferenceModel.ts` | cites the brief's tap-target minimum, no line pin | TRUE |
| `components/admin/DialSlider.tsx` | `docs/design-brief.md:175` lands on the 44pt line | TRUE today, **fragile** → content-anchored |
| `tests/admin.shell.test.ts` | ":175" + "(line 18)" pins | TRUE today, **fragile** → content-anchored |
| `components/admin/UserPicker.tsx` | brief states the "plain-text link" stance | **FALSE** — never in the brief (`git log -S`) |
| `app/admin/layout.tsx` | brief's iPhone XS Max target is 470 px | **FALSE** — brief says 414 × 896; "470" never in its history |

**Probe findings, condensed** (the probe test was deleted before commit; the numbers below
are what it printed to its log file):

| Probe question | Answer |
|---|---|
| Settle commits for the async `useTransition` | 2 — tick 0: `disabled=true value="" note=yes`; tick 1: `disabled=false` |
| Typing `'X'` while disabled | value unchanged, zero action calls — keystrokes dropped at the event level |
| Does happy-dom blur a disabled input? | No — focus persisted, so focus loss is ruled out |
| Does `vi.clearAllMocks()` clear `mockResolvedValueOnce` queues? | No — a leftover once-value came back after clear |

## Decisions & Trade-offs
- **Component behavior kept; the fix lives in the tests.** `disabled={pending}` is a real
  product guard, not a test-hostile accident: Next dispatches server actions one at a time
  per client, so blocking re-dispatch during a flight is correct, and the MemoryTable header
  comments already argue it. The defect was the test's assumption that "results rendered"
  implies "controls re-enabled" — true in the old React, false under the two-commit settle.
  Fixing the assumption, not the guard, keeps production behavior identical.
- **`resetAllMocks` over `clearAllMocks`, with the rationale at the site.** `reset` is the
  stronger hammer (it also wipes implementations), which is safe here because every test
  configures its own mocks in-line. The alternative — auditing every once-value is consumed
  on every path including failure paths — is exactly the kind of invariant a test suite
  cannot enforce on itself, so the beforeEach now enforces it mechanically and the comment
  explains why the stronger call is load-bearing.
- **Probe deleted after use; findings preserved elsewhere.** The probe test did its job in
  one session and would have been noise in the suite (it asserts about React's commit
  schedule, not about the product). Its findings are preserved in the commit message, in
  the in-code comments, and in the session memories — the artifact that matters is the
  explanation, not the scaffolding.
- **The new hook-timeout flake class documented, not patched.** `beforeEach` "Hook timed out
  in 10000ms" in `admin.imageGenActions` / `admin.settingsActions` appeared exactly once,
  only under 4× oversubscription (three concurrent sweeps plus the target sweep) — a load
  normal `npm test` never generates. Raising `hookTimeout` repo-wide or slimming those
  module-reset hooks would be a real change with real review surface, justified by a
  failure that has never been observed at real load. Recorded in Follow-ups instead.
- **`app/admin/layout.tsx` added to a six-file scope.** The audit session had already
  verified its false attribution and recorded it as a follow-up of the same class; fixing
  the five named files while leaving the sixth identical defect in place would have made
  the sweep internally inconsistent. The widening is one file, same defect class, and is
  called out in the commit message.
- **`AppShell`'s own unverifiable claim left alone.** Its comment saying "the design brief's
  reading-app stance" is the *source* this session re-attributed UserPicker's stance to —
  but the attribution to the brief is itself unverifiable by the same `git log -S` test.
  It sits outside the assigned file list, so it is recorded as the next sweep's first
  candidate rather than fixed here.
- **The archived plan copy stays as written.** `P2-CA-A002.md` quotes the brief's words as
  the plan author understood them; archived plans are history, and this session's whole
  citation discipline depends on history not being retro-edited.
- **Content anchors over line pins, accepting verbosity.** Quoting "Minimum 44 × 44pt tap
  targets" costs more characters than `:175` but removes a hidden coupling: the audit
  session had to shape its prose edits around a code comment's line number. The quote can
  still drift if the brief's wording changes, but wording changes are rarer and more
  reviewable than line-count drift.

## Follow-ups & YAGNI notes
- **The `beforeEach` hook-timeout flake (new class, unfixed by design).**
  `tests/admin.imageGenActions.test.ts` and `tests/admin.settingsActions.test.ts`, "Hook
  timed out in 10000ms", observed once under 4× oversubscription. A future session could
  raise `hookTimeout` for those files or slim their module-reset hooks — but normal runs
  never hit it, so it is documented rather than patched. If it ever reproduces at normal
  load, that is the trigger to act.
- **`components/ui/AppShell.tsx:176`** still says "The design brief's reading-app stance"
  for the same stance this session established the brief never stated. One-line
  re-attribution candidate — deliberately left, as the assigned file list did not include
  it and it is the very sentence UserPicker now cites as its source.
- **The audit session doc's follow-up list is now partially stale:**
  `docs/token_maxxing/2026-09-12-docs-design-audit.md` records the UserPicker false
  attribution and the DialSlider/44pt-citation items as open follow-ups — all closed by
  `5f4a593` today. A reader of that doc should treat those two bullets as done; this doc is
  the closure record. (That session's other follow-ups remain open, below.)
- **Still open from the audit session, untouched here:** `docs/architecture.md:36` and
  `:362` (R-46 range staleness — "39 rulings, R-1..R-45" vs the record's R-46), and
  `.claude/skills/generate-badge/style.md:619-626` (Roadmap §4.7 citation in a tool-parsed
  file needing a history pointer without disturbing the parsed text).
- **YAGNI: no retry/timeout tuning added around the fixed tests.** The `toBeEnabled()` gate
  plus reset-mocks fully explain and eliminate the observed failure; a defensive extra
  timeout or retry layer would encode confusion the probe already dispelled.
- **YAGNI: no repo-wide `resetAllMocks` migration.** The once-queue leak is only dangerous
  where `mockResolvedValueOnce` queues cross test boundaries unconsumed; other files can be
  migrated if and when they show the same ghost-success signature, not preemptively.

## Appendix

**Commits (branch `token-maxxing-2026-09-12-admin-flake-stale-docs`, unpushed — worker
contract):**

```
6267355 fix(admin): the MemoryTable/SelectionPane load flake — wait out the two-commit settle
5f4a593 docs(admin): sweep the design-brief citations — two false attributions, two line pins
```

Key lines from `6267355`'s message:

```
Root cause, probe-established: React 19 settles an async useTransition in TWO
commits — the results render (cleared text / note) and only then the isPending
flip that re-enables the disabled={pending} controls. waitFor(input value="")
can therefore resolve while the input is still disabled, and user-event typing
into a disabled input drops every keystroke silently...
Second defect, same reproduction: vi.clearAllMocks() leaves
mockResolvedValueOnce queues standing...
Verified: reproduced first (2 fails, both dumps explained) under 3 concurrent
full-suite sweeps; after the fix, two loaded rounds + the serial
--no-file-parallelism sweep all 1125/1125.
```

**Files touched:**

```
6267355:
 components/admin/MemoryTable.test.tsx            | 19 +++++++++++-
 components/admin/explorer/SelectionPane.test.tsx | 39 +++++++++++++++++-------
 2 files changed, 46 insertions(+), 12 deletions(-)

5f4a593:
 app/admin/layout.tsx            | 5 +++--
 components/admin/DialSlider.tsx | 3 ++-
 components/admin/UserPicker.tsx | 3 ++-
 tests/admin.shell.test.ts       | 4 ++--
 4 files changed, 9 insertions(+), 6 deletions(-)
```

**Verification commands run:**
- Reproduction: `npx vitest run tests/admin components/admin` solo (green baseline), then
  the same sweep inside 3 concurrent full-suite `npx vitest run` sweeps (failed with the
  recorded pair).
- Probe cycle: temporary instrumented test in the MemoryTable suite, findings logged to a
  file (vitest 4 swallows `console.log` under `run`); deleted before commit.
- Post-fix ladder: loaded round 1 (1125/1125) → loaded round 2 (recorded pair green; the
  two unrelated hook timeouts surfaced and were set aside) → `npx vitest run
  --no-file-parallelism` (1125/1125) → final loaded round (1125/1125).
- Gates: `npx next typegen`, `npx tsc --noEmit`, prettier — all clean.
- Citation archaeology: `git log -S` on the brief's history for the "plain-text link"
  stance and for `"470"` (both empty), content checks against the current 219-line
  `docs/design-brief.md` for the 44 pt minimum and the 414 × 896 target.

**References:**
- Closes the recorded follow-ups of `docs/token_maxxing/2026-09-12-docs-design-audit.md`
  (commit `580863d`) — the false-attribution bullets and the DialSlider line-pin note. That
  session's line-count-neutral brief edits are what made the line pins' fragility concrete.
- The flake's prior sightings were recorded but never fixed; the "reproduced twice, fixed
  zero times" history is what made this session's reproduction-first method non-negotiable.
- In-tree facts relied on: `components/admin/MemoryTable.tsx` header comments (the
  sequential-dispatch argument for `disabled={pending}`), `components/ui/AppShell.tsx`
  (screen-title row — the stance's real home; its own brief attribution at line 176 left
  open), `components/ui/Button.tsx:13` (44 px), `docs/design-brief.md` (44pt line, 414 × 896).
- Coordinator: `tokenmax-orch-2026-09-12` (owns the merge of this branch; this session
  does not push).
