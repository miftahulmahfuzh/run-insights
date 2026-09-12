# Token-Maxxing Session — 2026-09-11: Admin File-Explorer Tests

> **Fifth token-maxxing session on this date.** The first session
> ([doc](./2026-09-11-nina-chat-component-tests.md)) stood up React
> component-testing infra from zero (RTL + happy-dom) and covered
> `ChatScreen.tsx` + `NinaSidebar.tsx`. The second session
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) continued that
> line onto `Composer.tsx`, `MessageBubble.tsx`, and `MessageList.tsx`. The
> third session ([doc](./2026-09-11-admin-folder-actions-tests.md))
> corrected a false-positive "zero coverage" survey of `components/admin`
> and closed a real gap in `lib/admin/ninaAlbumActions.ts`'s six
> folder-maintenance Server Actions. The fourth session
> ([doc](./2026-09-11-nina-message-actions-sheet-tests.md)) closed
> `MessageActionsSheet.tsx`, the gap named by all three prior docs and acted
> on by none of them, and its own follow-ups flagged the admin FileExplorer
> subsystem as the largest untouched real gap left in the repo. This
> session picked that up.

## 🎯 Achievement / End Result
- **Goal of the burn:** Close the admin FileExplorer subsystem's total lack
  of component-level test coverage — flagged independently in two
  consecutive prior sessions' follow-up notes as "the largest untouched real
  gap" — with real DOM tests, not the string-matching pattern a
  pre-existing suite had mistakenly stood in for coverage.
- **Concrete changes:**
  - `components/admin/explorer/PhotoDescription.test.tsx` — new, 21 tests.
  - `components/admin/explorer/PhotoGrid.test.tsx` — new, 10 tests.
  - `components/admin/explorer/UploadQueue.test.tsx` — new, 17 tests.
  - `components/admin/explorer/MediaAdd.test.tsx` — new, 7 tests.
  - `components/admin/explorer/MediaControls.test.tsx` — new, 11 tests.
  - `components/admin/explorer/FolderTree.test.tsx` — new, 11 tests.
  - `components/admin/explorer/SelectionPane.test.tsx` — new, 16 tests.
  - `components/admin/explorer/MediaPane.test.tsx` — new, 10 tests.
  - `components/admin/FileExplorer.test.tsx` — new, 16 tests.
  - No infra changes needed — the RTL/happy-dom setup from session 1 and the
    stubbed-sibling-component precedent from `ChatScreen.test.tsx` covered
    every need directly.
- **Real value delivered:**
  - Closed real, zero-prior-coverage gaps across all 9 files in the explorer
    subsystem (`FileExplorer.tsx` itself plus 8 `components/admin/explorer/`
    files, ~3,250 lines total) — the largest untouched real gap named twice
    in prior sessions' follow-ups and acted on in neither.
  - Proved the pre-existing `tests/admin.mediaPane.test.ts` suite was a false
    positive for coverage: it only pins source text via string matching and
    never renders anything, which is why the subsystem still had zero real
    DOM coverage despite a filename that suggested otherwise. This session's
    tests are genuinely new coverage, not duplication.
  - Covered correctness-sensitive decision surfaces directly: the
    dirty/unsaved state machine and save-vs-clear button labeling in
    `PhotoDescription.tsx`; the phase-driven upload headline sentences in
    `UploadQueue.tsx` (including the load-bearing "Nothing new. All N files
    are already here." case) and its progress-bar math and 12-row refusal
    cap; the album-vs-media dispatch (`isMediaRow`) and hard-delete guard
    ("her only photo") in `SelectionPane.tsx`; the `worn` latch and R2's
    "no button, not a dimmed one" prompt-sidecar rule in `MediaPane.tsx`;
    and `FileExplorer.tsx`'s own drag-depth counter, matching real
    DevTools-observed nested dragenter/dragleave behavior, plus its
    entries-vs-flat-list drop fallback and plain-string folder-merge sort.
  - Net test count: **119 new tests, all passing** (4,072 → 4,191). Full
    `npx vitest run` green across 199 test files; `npx tsc --noEmit` clean;
    `npx eslint` on the new files clean.
- **Branch:** `token-maxxing-2026-09-11` (reused, same as sessions 1–4).
- **Merge status:** merged (commit `a1ab59f`)
- **Approx token burn:** high — nine components traced against their
  props/collaborators before any test was written, 119 tests authored
  across 9 new files, two non-obvious debugging detours (an `importOriginal`
  transitive-import failure, and an unreliable file-input `change` event)
  worked through to resolution, plus a full three-gate verification pass. 🔥

## Context & Motivation

This is the **fifth** token-maxxing session on 2026-09-11. The prior four
sessions (summarized in the epigraph above) totaled 4,072 passing tests by
the time this one started, having stood up component-testing infra and
covered the nina chat surface, the composer/bubble/list trio, six
`ninaAlbumActions.ts` folder-maintenance Server Actions, and
`MessageActionsSheet.tsx`.

**Menu considered (4 candidates):**

1. 🔁 5 remaining untested `ninaAlbumActions.ts` avatar exports
   (`describeNinaAvatarAction`, `setCurrentNinaAvatarAction`,
   `ensureNinaAvatarDescriptionAction`, `registerNinaAvatarsAction`,
   `listNinaAlbumManifestAction`) — named as a follow-up twice already
   (sessions 3 and 4).
2. 🆕 `SessionRow.tsx` / `SessionList.tsx` nina sidebar tests.
3. 🆕 `components/ui` primitives — 14 files, 0 tests.
4. 🆕 Admin FileExplorer subsystem — `FileExplorer.tsx` + 8
   `components/admin/explorer/*.tsx` files, ~3,250 lines, zero
   component-level coverage. **PICKED.**

**Why #4 won.** It had been flagged independently in **two** prior
sessions' follow-up notes as "the largest untouched real gap," and unlike
the other three candidates it was large enough to sustain a full session of
legitimate work while still being a single self-contained package — 9
files, one package, not a migration, so it didn't need `/analyze`-sized
scoping the way session 4's notes had worried a partial pass might produce.

**Why #1 was passed over.** Still legitimate, but named twice already
without being picked up; two of its five remaining actions need
vision-client/`after()` mocking that session 4 explicitly declined to
absorb, and this session judged the FileExplorer subsystem's size and
two-session flagging history as the stronger claim on the burn.

**Why #2 was passed over.** Real but smaller in scope than #4, and not
independently flagged by any prior session's follow-ups the way #4 was.

**Why #3 was passed over.** Real and large in file count, but each of the
14 `components/ui` primitives is typically small and low-decision-density;
judged lower value per token than the FileExplorer subsystem's real,
correctness-sensitive state machines (upload phases, crop/promote flows,
dispatch logic).

## What We Did (blow-by-blow)

1. **Menu and pick**, as detailed above — picked the admin FileExplorer
   subsystem over the three other candidates.

2. **Confirmed genuine gap before writing anything.** Checked the
   pre-existing `tests/admin.mediaPane.test.ts` suite and found it is
   structural-only: it reads component source as text and asserts
   substrings against it, never rendering a single component. This
   confirmed the subsystem had zero *real* DOM coverage despite that file's
   name suggesting otherwise, and meant this session's work is genuinely
   new coverage rather than a duplicate of existing tests.

3. **Traced all 9 files' props, state, and collaborators** before writing
   any test — the explorer subsystem's component tree (`FileExplorer.tsx`
   as orchestrator, `SelectionPane.tsx` as the album/media dispatcher
   rendering `MediaPane.tsx` or the album pane, and six supporting
   components: `PhotoDescription.tsx`, `PhotoGrid.tsx`, `UploadQueue.tsx`,
   `MediaAdd.tsx`, `MediaControls.tsx`, `FolderTree.tsx`) plus its
   decision-bearing collaborators (`isMediaRow`, `lib/admin/filetree`,
   `useFolderUpload`, `dropWalk`).

4. **Commit 1 — `test(admin): cover 6 untested explorer components with
   real DOM tests`** (`769b3ba`):
   - `PhotoDescription.tsx` (21 tests): dirty/unsaved state machine, save
     vs clear button label, describe/re-describe wiring, in-flight
     mis-tap guards.
   - `PhotoGrid.tsx` (10 tests): thumbnail vs original fallback, selection,
     current-photo badge, empty states, pager.
   - `UploadQueue.tsx` (17 tests): phase-driven headline sentences
     including the load-bearing "Nothing new. All N files are already
     here." case, progress bar math, refusal-reason list with a 12-row
     cap, expand/collapse.
   - `MediaAdd.tsx` (7 tests): sequential per-file upload loop,
     partial-failure recovery, busy-state.
   - `MediaControls.tsx` (11 tests): replace/remove flows, busy-state
     mis-tap guards, error/note copy.
   - `FolderTree.tsx` (11 tests): tree nesting from flat folder counts,
     active-row logic where Album and Media share path `''`,
     expand/collapse override vs on-path default.

5. **Commit 2 — `test(admin): cover SelectionPane's dispatcher and album
   pane, and MediaPane`** (`4976619`):
   - `SelectionPane.tsx` (16 tests): the album/media dispatch via
     `isMediaRow`, crop save/reset, promote-to-avatar,
     hard-delete-guards-her-only-photo, `PhotoDescription` wiring to the
     album actions.
   - `MediaPane.tsx` (10 tests): adopt-with-draft-crop and the `worn`
     latch, the prompt-sidecar conditional (R2's "no button, not a dimmed
     one" rule), `PhotoDescription` wiring to the media actions.
   - `CropStudio`, `CircleFrame`, `ShareToNinaItem`, and `useSavePhoto`
     were stubbed at their import boundary — same precedent as
     `ChatScreen.test.tsx` mocking sibling components already covered on
     their own terms.
   - **Debugging detour:** mocking `./MediaPane` with `importOriginal`
     inside `vi.mock` failed, because `MediaPane`'s real module
     transitively imports `lib/admin/chatPhotoActions` → the auth chain →
     `next/server`, which Vitest's `node` resolution cannot load. Fixed by
     reimplementing the tiny `isMediaRow` type guard inline in the mock
     factory instead of re-importing the real module.

6. **Commit 3 — `test(admin): cover FileExplorer, the explorer's own
   orchestrator`** (`0459212`):
   - `FileExplorer.tsx` itself (16 tests): breadcrumb per view, toolbar
     buttons gated by album-vs-media, the drag-depth counter (nested
     dragenter/dragleave pairs, matching the real DevTools-observed
     behavior where dragleave fires on entering a child), the drop
     handler's entries-vs-flat-list fallback, folder-picker upload wiring
     with input-clearing, pending-folder merge into `allFolders` (plain
     string sort, `'2026/fresh'` before `'bali'`), and selection/removal
     wiring into `SelectionPane`.
   - Router, `dropWalk`, and the upload hook were mocked at the boundary;
     every child component was stubbed since each already has its own
     suite from commits 1–2.
   - **Debugging detour 1:** `container.querySelector('.min-w-0')` was an
     unreliable way to find the drop-zone div — `FileExplorer.tsx`'s
     breadcrumb `<nav>` also carries a `min-w-0` Tailwind class and sits
     earlier in document order. Fixed by scoping the selector by tag
     (`div.min-w-0`) to hit the intended element.
   - **Debugging detour 2:** `userEvent.upload()` did not reliably fire the
     `change` handler on this repo's hidden file `<input>`s inside
     `FileExplorer.tsx` specifically (it worked fine in
     `MediaAdd.test.tsx`/`MediaControls.test.tsx` against structurally
     similar inputs). `fireEvent.change(input, { target: { files: [...] }
     })` was the reliable alternative there.

7. **Ran the full local gate, all green:**
   - `npx vitest run` → **199 test files / 4,191 tests passed** (up from
     190 files / 4,072 tests at the end of session 4 — net **+9 files,
     +119 tests**).
   - `npx tsc --noEmit` → clean.
   - `npx eslint` on the new files → clean.

## Code / Design Details

**String-matching test suites are not coverage.** The pre-existing
`tests/admin.mediaPane.test.ts` reads component source as text and asserts
substrings against it — it never renders anything. This is a real
methodological trap: a coverage survey that checks "does a `*.test.ts` file
exist mentioning this path" would have reported the explorer subsystem as
already covered, when in fact zero components in it had ever been rendered
in a test. Future coverage surveys in this repo should distinguish "has a
`*.test.ts` file mentioning this path" from "actually renders it" — the
same distinction session 3 had to correct for a different false-negative
direction (tests living centrally under `tests/`, not co-located).

**`importOriginal` inside `vi.mock` is dangerous for sibling modules in
this repo.** `./MediaPane`'s real module transitively imports
`lib/admin/chatPhotoActions` → the auth chain → `next/server`, which
Vitest's `node` resolution environment cannot load. The general shape of
this trap: any mock factory that tries to partially re-import a sibling
component risks pulling in that sibling's *own* transitive dependency
graph, including server-only modules the test environment can't resolve.
The fix here was narrow and specific — reimplement the tiny `isMediaRow`
type guard inline in the mock factory — but the underlying hazard is
general and worth remembering for any future sibling-mocking in
`components/admin`.

**`div.min-w-0` vs `.min-w-0` for locating the drop zone.** Tailwind
utility classes are not unique selectors by default in this codebase —
`FileExplorer.tsx`'s breadcrumb `<nav>` and its drop-zone `<div>` both
carry `min-w-0`, and the breadcrumb sits earlier in document order, so a
bare class selector silently grabs the wrong element. Scoping by tag
(`div.min-w-0`) is the general pattern to reach for whenever a Tailwind
utility class is reused across sibling element types in a render tree.

**`fireEvent.change` over `userEvent.upload()` for `FileExplorer.tsx`'s
hidden inputs specifically.** This is the second time in as many sessions
(session 4 hit the analogous case with `userEvent.type` vs a `maxlength`
attribute) that RTL's more "realistic" event simulation turned out to be
the wrong tool for a specific input in this codebase. Notably, the same
`userEvent.upload()` call worked fine against structurally similar hidden
inputs in `MediaAdd.test.tsx` and `MediaControls.test.tsx` — the failure
was specific to `FileExplorer.tsx`'s input wiring, not a blanket rule
against `userEvent.upload()` in this repo. `fireEvent.change(input, {
target: { files: [...] } })` was the reliable substitute.

## Decisions & Trade-offs

- **Picked the twice-flagged largest gap over three fresh candidates.** The
  FileExplorer subsystem's two independent follow-up mentions (sessions 3
  and 4) and its self-contained, single-package scope (9 files, no
  `/analyze` needed) made it the strongest claim on a full session's burn.
- **Declined the 5 remaining `ninaAlbumActions.ts` avatar exports (menu #1)
  for a third deferral in a row** — recorded explicitly below so it isn't
  silently re-deferred without the reason being visible. Two of the five
  still need vision-client/`after()` mocking that no session has yet
  absorbed.
- **Declined `SessionRow.tsx`/`SessionList.tsx` (menu #2) and
  `components/ui` primitives (menu #3)** as real but smaller and
  lower-decision-density than the FileExplorer subsystem, and neither had
  been independently flagged by a prior session's follow-ups the way the
  FileExplorer subsystem had.
- **Stubbed `CropStudio`, `CircleFrame`, `ShareToNinaItem`, `useSavePhoto`,
  `PhotoMoveBar.tsx`, and `FolderMenu.tsx` at their import boundaries**
  rather than covering them in this session — each is a separately-owned
  component/hook deserving its own suite, matching the precedent
  `ChatScreen.test.tsx` set for stubbing sibling components already
  covered (or destined to be covered) on their own terms.
- **Left `useFolderUpload.ts` untested** — the real remaining decision
  logic (phase state machine, concurrency lanes, Blob upload) in the
  subsystem, but at ~425 lines with `@vercel/blob/client` mocking needed,
  judged a reasonable-sized follow-up session on its own rather than a
  same-session addition.
- **Confirmed `dropWalk.ts` remains explicitly out of scope by design, not
  oversight** — its own header states it makes no decisions and is
  untestable by design (browser-only `DataTransferItem`/
  `FileSystemDirectoryReader` glue), consistent with session 3's F01 rule
  that decidable behavior belongs in `lib/`.

## Follow-ups & YAGNI notes

- **Still open:** `useFolderUpload.ts` (the upload hook itself, ~425
  lines: phase state machine, concurrency lanes, real Blob upload via
  `@vercel/blob/client`) has zero test coverage — the last major piece of
  real decision logic in the explorer subsystem left untested. Testable
  via `renderHook`, but needs `@vercel/blob/client`'s `upload` mocked plus
  `planFolderUpload`/`lib/admin/filetree` (already unit-tested on its own)
  — a reasonable-sized follow-up session on its own.
- **Deliberately NOT a candidate (by design, not oversight):** `dropWalk.ts`
  and `thumbnail.ts`/`chatPhotoUpload.ts`'s browser-API-only halves.
  `dropWalk.ts`'s own header states it makes no decisions and is
  untestable by design (F01's rule: decidable behavior belongs in `lib/`,
  this file is pure `DataTransferItem`/`FileSystemDirectoryReader` glue).
- **Still open:** `components/admin/PhotoMoveBar.tsx` (273 lines, its own
  move/remove Server Actions) — stubbed out in this session's
  `FileExplorer.test.tsx` and `SelectionPane`'s render tree rather than
  covered, since it's a separately-owned component deserving its own
  suite.
- **Still open:** `components/admin/FolderMenu.tsx` (386 lines:
  create/rename/move/delete folder verbs) — stubbed out in
  `FolderTree.test.tsx` for the same reason.
- **Still open, deferred a 3rd time:** the 5 remaining untested
  `ninaAlbumActions.ts` avatar exports (`describeNinaAvatarAction`,
  `setCurrentNinaAvatarAction`, `ensureNinaAvatarDescriptionAction`,
  `registerNinaAvatarsAction`, `listNinaAlbumManifestAction`), flagged in
  sessions 3 and 4 — not touched this session either.
- **Still open:** `components/ui` primitives (14 files, 0 component
  tests).
- **Still open, deferred a 5th time:** `lib/nina` YAGNI/dead-code hunt
  (`queries.ts` 4,542 lines, `persona.ts` 1,771, `actions.ts` 1,667).
- **Still open:** the F0x architecture-synthesis doc (33 plan docs → one
  current-state reference).
- **Survey-method note, reconfirmed this session:** distinguish "has a
  `*.test.ts` file mentioning this path" from "actually renders it" — the
  pre-existing `admin.mediaPane.test.ts` is structural-only (string
  matching against source), which is why this subsystem still had zero
  real DOM coverage despite its name. This is the same category of trap
  session 3 corrected in the opposite direction (co-location assumptions
  producing false negatives); here a same-named file produced a false
  positive instead.

## Appendix

**Key commands run this session:**
```bash
npx vitest run
npx tsc --noEmit
npx eslint <new files>
git status --porcelain
git log --oneline -5
```

**Gate results:**
- Before this session (end of session 4, 2026-09-11): 190 test files /
  4,072 tests passing.
- After this session: 199 test files / 4,191 tests passing — net **+119
  tests** across 9 new files.
- `npx tsc --noEmit`: clean.
- `npx eslint` on the new files: clean.

**Commits (on `token-maxxing-2026-09-11`):**
```
769b3ba test(admin): cover 6 untested explorer components with real DOM tests
4976619 test(admin): cover SelectionPane's dispatcher and album pane, and MediaPane
0459212 test(admin): cover FileExplorer, the explorer's own orchestrator
```

**Branch:** `token-maxxing-2026-09-11` — on branch, not yet merged (merge
happens as a separate step outside this session).
