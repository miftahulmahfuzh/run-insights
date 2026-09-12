# Token-Maxxing Session — 2026-09-11: Admin Explorer & Upload-Hook Tests

> **Sixth token-maxxing session on this date, and the first run in worker
> mode** (coordinator `tokenmax-orch-2026-09-11`, worker slug
> `admin-explorer-upload-tests`): the idea was pre-assigned rather than
> picked from a menu. The first session
> ([doc](./2026-09-11-nina-chat-component-tests.md)) stood up React
> component-testing infra from zero; the second
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) covered the
> composer/bubble/list trio; the third
> ([doc](./2026-09-11-admin-folder-actions-tests.md)) corrected a
> false-positive coverage survey and covered six folder-maintenance Server
> Actions; the fourth ([doc](./2026-09-11-nina-message-actions-sheet-tests.md))
> closed `MessageActionsSheet.tsx`; the fifth
> ([doc](./2026-09-11-admin-file-explorer-tests.md)) covered all 9 files of
> the admin FileExplorer subsystem — and left exactly two follow-ups behind:
> `PhotoMoveBar.tsx` and `FolderMenu.tsx`, which that session had to STUB at
> their import boundaries, and `useFolderUpload.ts`, which it explicitly
> named as "a reasonable-sized follow-up session" of its own. This session
> picked up both, plus every other remaining untested admin surface, and
> finished the subsystem's coverage in one self-contained sweep.

## 🎯 Achievement / End Result
- **Goal of the burn:** Write real component/unit tests for ALL 18 remaining
  untested admin surfaces — `PhotoMoveBar`, `FolderMenu`, `DialSlider`,
  `CharacterPanel`, `AdminNavLinks`, `ShareToNinaItem`, `ImageGenTestPanel`,
  `MemoryTable`, `CircleFrame`, `AdminNav`, `ShortcutTable`,
  `PhotoReferencePicker`, `TextModelSelect`, `ImageGenPanel`, `CropStudio`,
  `UserPicker`, `photoIcons` — plus
  `components/admin/explorer/useFolderUpload.ts`, the ~447-line
  concurrency/phase state machine driving real Blob uploads and the last
  major uncovered piece of the admin explorer subsystem.
- **Concrete changes** — 18 new test files, **4,271 lines**, **324 new
  tests** (counts re-verified post-session by running the suites; earlier
  draft notes undercounted the aggregate as ~266 tests / 17 files):

  | New test file | Tests | Lines |
  |---|---|---|
  | `components/admin/CircleFrame.test.tsx` | 11 | 149 |
  | `components/admin/UserPicker.test.tsx` | 12 | 127 |
  | `components/admin/AdminNav.test.tsx` | 7 | 67 |
  | `components/admin/TextModelSelect.test.tsx` | 9 | 137 |
  | `components/admin/photoIcons.test.tsx` | 66 | 102 |
  | `components/admin/ShareToNinaItem.test.tsx` | 11 | 175 |
  | `components/admin/DialSlider.test.tsx` | 18 | 170 |
  | `components/admin/PhotoMoveBar.test.tsx` | 16 | 237 |
  | `components/admin/PhotoReferencePicker.test.tsx` | 16 | 209 |
  | `components/admin/ImageGenTestPanel.test.tsx` | 17 | 364 |
  | `components/admin/AdminNavLinks.test.tsx` | 11 | 149 |
  | `components/admin/CropStudio.test.tsx` | 21 | 277 |
  | `components/admin/FolderMenu.test.tsx` | 15 | 287 |
  | `components/admin/ShortcutTable.test.tsx` | 17 | 324 |
  | `components/admin/MemoryTable.test.tsx` | 20 | 388 |
  | `components/admin/CharacterPanel.test.tsx` | 19 | 304 |
  | `components/admin/ImageGenPanel.test.tsx` | 18 | 318 |
  | `components/admin/explorer/useFolderUpload.test.tsx` | 20 | 487 |
  | **Total** | **324** | **4,271** |

- **Real value delivered:**
  - **Both stubbed components now have real suites.** `PhotoMoveBar.tsx` and
    `FolderMenu.tsx` — the two components the 2026-09-11 explorer session
    (session 5) had to stub out of `FileExplorer.test.tsx`,
    `SelectionPane.test.tsx`, and `FolderTree.test.tsx` — are covered
    including `PhotoMoveBar`'s plural-ids action boundary and `FolderMenu`'s
    server-refusal-driven keep-current route (the "Delete the rest, keep her
    photo" second answer appears ONLY when a delete comes back refused).
  - **The named follow-up is closed.** `useFolderUpload.ts` — ~447 lines of
    phase state machine, four-lane concurrency bound, and real
    `@vercel/blob/client` uploads, explicitly named by session 5 as needing
    `renderHook` plus Blob-client mocking — now has 20 tests covering phases
    observed under gated promises, dedupe fixtures computed with the SAME
    `sourceKeyFor` the plan uses, per-file failure isolation (decode /
    too-small / PUT 5xx / thumbnail), chunked registration in the
    `{records}` envelope (50 + force-flushed tail), the four-lane bound
    (mutation-checked), and dismiss refused mid-flight.
  - **A second string-matching false positive exposed.** The pre-existing
    `tests/admin.photoReference.test.ts` (like session 5's
    `admin.mediaPane.test.ts` finding) is a source-text suite — 29
    `readFileSync`/`toContain` assertions that never render anything. The new
    `PhotoReferencePicker` suite actually renders and drives tap-to-select /
    re-tap-to-clear / missing-reference-no-self-heal / the reveal clamp-up.
  - **Decision surfaces covered directly:** `ImageGenTestPanel`'s escalating
    poll (`imageTestPollDelayFor`), its no-overlap rule (a tick never fires
    while the previous read is in flight), every verdict headline against the
    real view model, and the 480s give-up whose message says the job is
    STILL OPEN, not failed; the `CharacterPanel` + `ImageGenPanel` auto-save
    commit-moment matrix (blur / change / debounce), the
    immediate-commit-subsumes-the-waiting-dial + disarm rule, whole-row
    payloads on every dispatch, and drag-back-to-saved disarming for free;
    `MemoryTable`'s three-group ledger (slot / promise / ledger rows) with
    honest optimism; `ShortcutTable`'s optimistic table mechanics.
  - **Four mutation checks, each caught by the new suites:** `CircleFrame`'s
    default size, `photoIcons`' `aria-hidden`, `CropStudio`'s
    `passive:false`, and `useFolderUpload`'s lane count — each suite was
    proven to bite by mutating the component and watching the test fail.
  - **Net test count: 324 new tests, all passing** (suite: 4,191 → 4,515
    across 199 → 217 test files). Full `npx vitest run` green: **217 files /
    4,515 / 4,515**. `npx next typegen && npx tsc --noEmit` clean; `npx
    eslint` clean on all 18 new files.
- **Branch:** `token-maxxing-2026-09-11-admin-explorer-upload-tests`
  (worker-named branch, per-worker for this coordinated set — unlike
  sessions 1–5, which shared `token-maxxing-2026-09-11`).
- **Merge status:** merged (commit `2d60162`)
- **Approx token burn:** high — 18 surfaces traced against their props,
  state machines, and collaborators before testing, 324 tests authored
  across 18 new files (4,271 lines), four mutation checks run to prove the
  suites bite, one tsc/eslint fix pass (vitest does not typecheck), and a
  post-session verification re-run of the full suite. 🔥

## Context & Motivation

This is the **sixth** token-maxxing session on 2026-09-11 and the first run
in **worker mode**: a coordinator session (`tokenmax-orch-2026-09-11`)
fanned the day's work out to parallel worker sessions, and this worker was
pre-assigned its idea — no menu, no pick. The assignment continued two
follow-ups the immediately-prior session had flagged
([session 5's doc](./2026-09-11-admin-file-explorer-tests.md), "Follow-ups &
YAGNI notes"):

1. `PhotoMoveBar.tsx` (273 lines) and `FolderMenu.tsx` (386 lines), which
   session 5 had to stub at their import boundaries in three of its own
   suites — "separately-owned components deserving their own suites."
2. `useFolderUpload.ts` (~447 lines: phase state machine, concurrency
   lanes, real Blob upload via `@vercel/blob/client`) — "the last major
   piece of real decision logic in the explorer subsystem left untested…
   a reasonable-sized follow-up session on its own."

The assignment's framing: finish the admin explorer / admin-control
subsystem's coverage in one self-contained sweep. That made it a natural
worker unit — large enough to sustain a full session of legitimate work,
sharply bounded (18 named files, one subsystem family), and directly
continuous with work already landed earlier the same day. Everything else
in the target list was simply the rest of the untested `components/admin`
inventory the sweep needed to be complete.

## What We Did (blow-by-blow)

1. **Traced before testing.** Each target was read against its props,
   state, and collaborators before any test was written — the same
   discipline as sessions 1 and 5. Notable pre-read findings: `FolderMenu`'s
   delete flow owns a server-refusal-driven second answer; `TextModelSelect`
   handles only `{ ok: false }`, not a rejected action (recorded as a
   follow-up below, deliberately NOT enshrined in a test);
   `tests/admin.photoReference.test.ts` turned out to be another
   string-matching suite that never renders anything — the exact
   "false positive for coverage" pattern session 5 documented for
   `admin.mediaPane.test.ts`.

2. **Commit 1 — `test(admin): cover CircleFrame, UserPicker, AdminNav,
   TextModelSelect`** (`5b068ae`, 39 tests):
   - `CircleFrame.tsx` (11): pins the square-box class set (`mt-2`,
     `size-24`, `overflow-hidden` — the invisible invariant the component
     exists to enforce), the `ring`/`sizeClass` levers the three call sites
     actually differ in, and the crop-to-CSS cover-fit mapping hand-computed
     (identity landscape crop: `left = 50 − 133.3333/2 = −16.6667%`,
     computed BY HAND in the test, not by calling the helper — otherwise the
     test would just restate the implementation).
   - `UserPicker.tsx` (12), `AdminNav.tsx` (7), `TextModelSelect.tsx` (9):
     render/drive tests against the real DOM, including the vocabulary-bound
     select and its saving/failed status line.

3. **Commit 2 — `test(admin): cover photoIcons, the admin photo glyph
   library`** (`ca4efbd`, 66 tests): table-driven via `it.each` across all
   13 glyphs, five properties per glyph — renders exactly one svg, IS
   `aria-hidden` (the accessible name is the control's `aria-label`, never
   the picture), takes size from the caller's `className`, draws with the
   shared stroke idiom, keeps its own silhouette signature — plus one
   table-integrity test that every glyph's signature is DISTINCT (the table
   itself must not collapse). 5 × 13 + 1 = 66.

4. **Commit 3 — `test(admin): cover ShareToNinaItem and DialSlider`**
   (`142b32f`, 29 tests: 11 + 18).

5. **Commit 4 — `test(admin): cover PhotoMoveBar and PhotoReferencePicker
   with real DOM tests`** (`f44ed9f`, 32 tests: 16 + 16): `PhotoMoveBar`'s
   plural-ids action boundary; `PhotoReferencePicker`'s real
   tap-to-select / re-tap-to-clear / missing-reference-no-self-heal /
   reveal-clamp-up flows — the suite that replaces what the string-matching
   `tests/admin.photoReference.test.ts` only pretended to cover.

6. **Commit 5 — `test(admin): cover ImageGenTestPanel's polling loop under
   fake timers`** (`6f1fe5f`, 17 tests): the escalating poll schedule driven
   through `imageTestPollDelayFor(attempts)` (3s/5s/8s escalation) with fake
   timers, the no-overlap rule ("a tick does not fire while the previous
   read is in flight"), every verdict headline asserted against the real
   view model from `lib/admin/imageGenTestView`, and the 480s give-up whose
   message says the job is STILL OPEN, not failed ("stops watching at the
   wall clock and says the job is STILL OPEN, not failed").

7. **Commit 6 — `test(admin): cover AdminNavLinks and CropStudio with
   gesture-level DOM tests`** (`8ab850f`, 32 tests: 11 + 21). `CropStudio`
   includes the hand-registered wheel listener check: it asserts
   `addEventListener` was called with `{passive:false}` — "the only way
   `preventDefault` counts."

8. **Commit 7 — `test(admin): cover FolderMenu's four inline panels end to
   end`** (`68bd27e`, 15 tests): create / rename / move / delete, including
   the prefill-as-keystroke-not-retype rule, move-target exclusion (nothing
   from inside the folder, and not the folder's own current parent), and
   the load-bearing server-owns-every-refusal design: "Delete the rest,
   keep her photo" must NOT exist without a refused delete
   (`answers a refused delete with the keep-current route — and only a
   refused delete`).

9. **Commit 8 — `test(admin): cover ShortcutTable's optimistic table
   mechanics`** (`9f356bb`, 17 tests).

10. **Commit 9 — `test(admin): cover MemoryTable's three-group ledger and
    honest optimism`** (`8b039a7`, 20 tests): structure, slot rows, promise
    rows, ledger rows, and the add row — the three-group ledger
    (`MemoryTable — slot rows` / `— promise rows` / `— ledger rows`).

11. **Commit 10 — `test(admin): cover CharacterPanel's auto-save commit
    pipeline`** (`7858d9f`, 19 tests): the auto-save commit-moment matrix
    (blur / change / debounce) — see Code / Design Details.

12. **Commit 11 — `test(admin): cover ImageGenPanel's auto-save pipeline and
    template shell`** (`7ff8412`, 18 tests): the sibling auto-save pipeline
    to `CharacterPanel`'s, plus the template shell — this commit completes
    the commit-moment matrix across both panels.

13. **Commit 12 — `test(admin): cover useFolderUpload, the explorer upload
    state machine`** (`2a7a42c`, 20 tests) — the session's centerpiece:
    - `renderHook` + gated promises so phases are OBSERVED, not inferred:
      each awaited step is held open until the test asserts the intermediate
      phase.
    - Dedupe fixtures computed with the SAME `sourceKeyFor` (imported real
      from `lib/admin/filetree`) the plan uses — so the dedupe keys in
      fixtures are the real ones, not hand-invented strings.
    - Per-file failure isolation: a decode failure marks only THAT item and
      the lane moves on; same for too-small, PUT 5xx, and thumbnail
      failures.
    - Chunked registration in the `{records}` envelope: the 50th completion
      flushes a full chunk; the 51st is force-flushed after the lanes drain.
    - The four-lane bound: all gated on one promise, then "assert the count
      is EXACTLY four" — mutation-checked.
    - Dismiss refused mid-flight; the gesture guard; the busy-while-dismiss
      rule.
    - `@vercel/blob/client`'s `upload` mocked (`vi.mock('@vercel/blob/client',
      () => ({ upload: vi.fn() }))`), plus `./thumbnail`, `./dropWalk`, and
      the `ninaAlbumActions` boundary.

14. **Commit 13 — `fix(admin): satisfy tsc --noEmit and eslint for the new
    test files`** (`90041fd`): the honest gate pass. Vitest had been green
    all along, but `npx next typegen && npx tsc --noEmit` and `npx eslint`
    found issues in the new files after the fact (vitest does not
    typecheck — a repo memory worth re-learning every session). Fixed in a
    dedicated commit so the test commits' content stayed reviewable.

15. **Full local gate, all green** (re-verified after the session ended):
    `npx vitest run` → **217 test files / 4,515 tests passed** (up from 199
    files / 4,191 tests at the end of session 5 — net **+18 files, +324
    tests**); `npx tsc --noEmit` clean; `npx eslint` on the new files clean.

## Code / Design Details

**Hand-computed expectations vs implementation restatement.** `CircleFrame`'s
crop-to-CSS mapping is the clearest example: the test hand-computes the
cover-fit percentages for a known crop triple (landscape identity crop:
`left = 50 − 133.3333/2 = −16.6667%`) instead of calling the component's own
helper to produce the expectation. A test that derives its expected value by
calling the code under test can only detect API changes, never math errors.
The comment in the test says it outright: "computed BY HAND here, not by
calling the helper — otherwise the test would just restate the
implementation."

**Mutation checks prove a suite bites.** Four targeted mutations, each caught:
- `CircleFrame` default size → `defaults to a size-24 frame` fails.
- `photoIcons` `aria-hidden` → the per-glyph "is aria-hidden — the accessible
  name is the control's, never the picture" template fails (the header
  comment documents WHY the invariant matters: the accessible name is the
  control's `aria-label`, never the picture).
- `CropStudio` wheel listener → `registers the wheel listener by hand with
  passive:false` fails by inspecting the actual `addEventListener` options
  argument, because a passive wheel listener silently ignores
  `preventDefault`.
- `useFolderUpload` lane count → the four-lane test fails; its comment
  explains the construction: "All ten lanes that ever ran are gated on ONE
  promise, so every PUT has started… unless the lane bound holds. Give the
  loop a beat, then assert the count is EXACTLY four."

**Observing a state machine under gated promises.** `useFolderUpload`'s
phases are only visible mid-flight, so the suite holds promises open
deliberately: a test resolves one gate at a time and asserts the phase
between resolutions. Failure isolation gets the same treatment per lane
("a decode failure marks only THAT item and the lane moves on"). The
registration chunking is asserted at the exact boundaries — 50th completion
flushes the full chunk, 51st record force-flushed only after the lanes
drain — inside the `{records}` envelope the server action receives.

**Fixture keys must be the real keys.** The dedupe fixtures import the real
`sourceKeyFor` from `lib/admin/filetree` rather than typing key strings by
hand, so if the key derivation ever changes, the fixtures change with it and
the dedupe tests keep testing the real contract (the same lesson session 5's
`isMediaRow` detour taught in reverse: re-importing a sibling's transitive
graph is dangerous, but importing a pure `lib/` helper is exactly right).

**Polling loops under fake timers.** `ImageGenTestPanel`'s watch loop is the
repo's recurring three-part shape — a `cancelled` flag, one `setTimeout`
handle cleared on cleanup, and never a bare recursive call
(`setTimeout(run, pollDelayFor(0))`, to satisfy `react-hooks/set-state-in-effect`).
The suite drives `imageTestPollDelayFor(attempts)` through its 3s/5s/8s
escalation with fake timers, asserts the no-overlap rule, and stops at the
480s wall clock with the STILL-OPEN message.

**String-matching suites keep turning up.** `tests/admin.photoReference.test.ts`
is the second confirmed instance (after session 5's
`admin.mediaPane.test.ts`) of a source-text suite standing in for coverage:
29 `readFileSync`/`toContain` assertions, zero renders. Both remain in the
tree; both now have real DOM suites alongside them carrying the actual load.

## Decisions & Trade-offs

- **Worker mode: no menu, no pick.** The idea was pre-assigned by the
  coordinator; the trade-off is intentional — the coordinator optimizes set
  shape across parallel workers, the worker spends its burn inside the
  assignment. The assignment itself was well-chosen: it continued two
  explicitly flagged follow-ups and completed a subsystem in one sweep.
- **Small-to-large commit cadence, each suite green before commit.** 13
  commits, starting with the four simplest components and ending with the
  `useFolderUpload` state machine, so a failure in the hard part never
  blocked landing the easy parts.
- **Hand-computed expectations over implementation-derived ones** (see
  above) — more expensive per assertion, but the only kind that can catch a
  math error rather than a refactor.
- **Four mutation checks, not one per file.** Mutating all 18 surfaces would
  have been theater; the four chosen mutations each target an invariant
  whose absence would be silent in production (`aria-hidden`, `passive:false`,
  a concurrency bound, a default size), which is where a suite that can't
  fail does real damage.
- **Deliberately did NOT enshrine `TextModelSelect`'s rejected-action wart
  in a test** (see follow-ups) — a test would have pinned the current broken
  behavior as a contract; the wart is recorded as a fix candidate instead.
- **`tests/admin.photoReference.test.ts` left in place** alongside the new
  DOM suite rather than deleted mid-sweep — trimming a pre-existing suite is
  a separate decision from adding coverage; the DOM suite now carries the
  load if anyone trims.

## Follow-ups & YAGNI notes

- **`TextModelSelect`: a REJECTED action is unhandled.** `onChange` awaits
  `saveNarrativeTextModelAction` with no try/catch — the `{ ok: false }`
  path is handled (restore previous value, status "failed"), but a thrown
  rejection leaves the status on "Saving…" forever and surfaces as an
  unhandled rejection. A wart worth a small fix; deliberately not enshrined
  in a test.
- **`PhotoMoveBar`: the destination select honours only `pending`, not empty
  targets** — with zero options it renders empty but enabled while the Move
  button disables. Minor; arguably fine.
- **`explorer/SelectionPane.test.tsx` (session 5's file) flaked once** under
  full-suite parallel load ("Save framing" `aria-busy` stuck) and passed
  twice in isolation afterwards. Worth a robustness look, not a blocker.
- **`tests/admin.photoReference.test.ts` remains as a source-text suite**
  alongside the new DOM suite; if anyone trims, the DOM suite now carries
  the load.
- **Carried from session 5, untouched here (still open):** the 5 remaining
  untested `ninaAlbumActions.ts` avatar exports (`describeNinaAvatarAction`,
  `setCurrentNinaAvatarAction`, `ensureNinaAvatarDescriptionAction`,
  `registerNinaAvatarsAction`, `listNinaAlbumManifestAction`) — deferred a
  4th time; `components/ui` primitives (14 files, 0 component tests);
  `lib/nina` YAGNI/dead-code hunt (5th deferral); the F0x
  architecture-synthesis doc.
- **By design, still untested:** `dropWalk.ts` and the browser-API-only
  halves of `thumbnail.ts`/`chatPhotoUpload.ts` — `dropWalk.ts`'s own header
  states it makes no decisions and is untestable by design (F01's rule:
  decidable behavior belongs in `lib/`). With `useFolderUpload` covered,
  `dropWalk`/browser glue is now essentially all that remains untested in
  the explorer subsystem.

## Appendix

**Key commands run this session:**
```bash
npx vitest run                      # per-batch and full-suite gates
npx next typegen && npx tsc --noEmit
npx eslint <new files>
git status --porcelain
git log --oneline
```

**Gate results:**
- Before this session (end of session 5, 2026-09-11): 199 test files /
  4,191 tests passing.
- After this session: **217 test files / 4,515 tests passing** — net **+18
  files, +324 tests**, all 18 new files green individually and in the full
  suite (per-file counts re-verified post-session by running the 18 files:
  324/324).
- `npx next typegen && npx tsc --noEmit`: clean (after `90041fd`).
- `npx eslint` on the new files: clean.

**Commits (on `token-maxxing-2026-09-11-admin-explorer-upload-tests`, oldest
first):**
```
5b068ae test(admin): cover CircleFrame, UserPicker, AdminNav, TextModelSelect
ca4efbd test(admin): cover photoIcons, the admin photo glyph library
142b32f test(admin): cover ShareToNinaItem and DialSlider
f44ed9f test(admin): cover PhotoMoveBar and PhotoReferencePicker with real DOM tests
6f1fe5f test(admin): cover ImageGenTestPanel's polling loop under fake timers
8ab850f test(admin): cover AdminNavLinks and CropStudio with gesture-level DOM tests
68bd27e test(admin): cover FolderMenu's four inline panels end to end
9f356bb test(admin): cover ShortcutTable's optimistic table mechanics
8b039a7 test(admin): cover MemoryTable's three-group ledger and honest optimism
7858d9f test(admin): cover CharacterPanel's auto-save commit pipeline
7ff8412 test(admin): cover ImageGenPanel's auto-save pipeline and template shell
2a7a42c test(admin): cover useFolderUpload, the explorer upload state machine
90041fd fix(admin): satisfy tsc --noEmit and eslint for the new test files
```
(Per-commit test counts: 39, 66, 29, 32, 17, 32, 15, 17, 20, 19, 18, 20 —
summing to 324 with the fix commit adding tests to none.)

**Branch:** `token-maxxing-2026-09-11-admin-explorer-upload-tests` — merged
(commit `2d60162`).
