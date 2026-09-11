# Token-Maxxing Session — 2026-09-11: Admin Folder-Actions Tests

> **Third token-maxxing session on this date.** The first session
> ([doc](./2026-09-11-nina-chat-component-tests.md)) stood up React
> component-testing infra from zero and covered `ChatScreen.tsx` +
> `NinaSidebar.tsx`. The second session
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) continued that line
> onto `Composer.tsx`, `MessageBubble.tsx`, and `MessageList.tsx`, and named
> `components/admin` component tests as one of its four open menu candidates.
> This session considered that continuation, found it was largely a
> false-positive gap (see Context below), and pivoted to a real one: untested
> Server Actions in `lib/admin/ninaAlbumActions.ts`.

## 🎯 Achievement / End Result
- **Goal of the burn:** Find and close a real, previously-invisible test gap
  in the admin surface, after correcting a wrong initial survey that would
  have wasted the session re-covering already-tested code.
- **Concrete changes:**
  - `tests/admin.folderActions.test.ts` — new, 23 tests, 411 lines.
  - No infra changes needed — this repo's existing `fakeDb`/`installFakeDb`
    Server Action test pattern (established by `tests/admin.chatPhotoAdoption.test.ts`)
    covered the need directly.
- **Real value delivered:**
  - Closed a genuine regression-risk gap: 6 of `ninaAlbumActions.ts`'s 14
    exported Server Actions — `createNinaAlbumFolderAction`,
    `renameNinaAlbumFolderAction`, `moveNinaAlbumFolderAction`,
    `moveNinaAvatarsAction`, `deleteNinaAlbumFolderAction`,
    `removeNinaAvatarsAction` — had zero test coverage despite being the
    orchestration layer between already-well-tested pure planners
    (`lib/admin/folderOps.ts`'s cycle refusal, unmergeable-rename refusal,
    current-photo protection) and real database writes / blob deletes. The
    planners deciding "is this safe" were tested; the code that actually
    *acts* on their decision was not.
  - Proved the new suite has real detection power, not just shape-matching:
    manually disabled the "her current photo cannot be removed" guard in
    `deleteNinaAlbumFolderAction` and confirmed the suite caught it (1 test
    failed as expected), then restored the file.
  - Corrected and recorded a wrong survey method (see Context & Motivation)
    that would otherwise keep generating false-positive "untested package"
    menu items in future sessions.
- **Branch:** `token-maxxing-2026-09-11` (reused, same as sessions 1 and 2).
- **Merge status:** on branch — merging to main happens in a separate step,
  not part of this session.
- **Approx token burn:** medium-high — most of the burn went into the
  corrected survey (two false-positive candidates read and ruled out before
  finding the real one) and into tracing `folderOps.ts`'s planners closely
  enough to write meaningful orchestration-layer assertions on top of them,
  plus a full deliberate-breakage verification pass and a full gate run. 🔥

## Context & Motivation

This is the **third** token-maxxing session on 2026-09-11. At Step 4, the
generated menu was:

1. 🔁 Continue — `MessageActionsSheet.tsx` component tests (small, low burn,
   real but minor — the last named gap in the nina chat-component chain from
   session 2).
2. 🔁 Continue — `components/admin` (26 files) component tests, the
   continuation candidate named by session 2's own follow-up notes.
3. 🆕 Fresh — `lib/admin` pure-logic coverage (`filetree.ts`, `folderOps.ts`,
   `avatars.ts`).
4. 🆕 Fresh — YAGNI/dead-code hunt in `lib/nina/queries.ts` / `persona.ts` /
   `actions.ts`.
5. 🆕 Fresh — untested Server Actions in `lib/admin/ninaAlbumActions.ts`.
   *(picked)*

**Why #2 and #3 were rejected — and why that rejection matters.** The initial
cheap survey for #2 and #3 grepped for `*.test.*` files co-located inside
`components/`, `lib/`, and `app/` — the convention this repo's Nina
component-test sessions (1 and 2) had just been using. That grep found
nothing under `components/admin` or `lib/admin` and concluded both were at
zero coverage. Reading the actual files before committing to either
candidate told a different story:

- `components/admin` and `lib/admin` mostly already have tests — they just
  live under a top-level `tests/` directory instead of being co-located next
  to source. A precise import-based grep across `tests/*.test.ts` confirmed
  this: files import from `@/lib/admin/...` and `@/components/admin/...`
  extensively.
- Specifically for #3: `filetree.ts`, `folderOps.ts`, and `avatars.ts` each
  already have a dedicated, thorough test file — `tests/admin.filetree.test.ts`,
  `tests/admin.folderOps.test.ts`, `tests/admin.avatars.test.ts` respectively.

So #2 and #3 were both false positives from the same root cause: **this
repo's test convention is centralized under `tests/`, not co-located**, and a
survey that only checks for co-located `*.test.*` files will systematically
misreport "zero coverage" for correctly-tested code. This correction is
recorded as its own lesson in Follow-ups below, since it's more durable than
any single test file written this session.

**Why #4 was rejected.** YAGNI/dead-code removal in `lib/nina/queries.ts` /
`persona.ts` / `actions.ts` is real work, but doing it *before* more tests
exist as a safety net gets the order backwards — deleting code with no
regression coverage in an area that has essentially none is how you introduce
the exact kind of silent breakage this whole token-maxxing effort exists to
prevent. Better to grow coverage first and treat the dead-code hunt as a
later, better-protected pass.

**Why #5 won, once the survey was corrected.** A precise import-based grep
against `lib/admin/ninaAlbumActions.ts`'s 14 exported Server Actions (cross-
referenced against `tests/*.test.ts` imports) showed 11 of 14 were completely
untested. Of those 11, six are the folder-maintenance actions — create,
rename, move-folder, move-avatars, delete-folder, remove-avatars — which sit
directly on top of `lib/admin/folderOps.ts`'s pure planners: cycle refusal,
unmergeable-rename refusal via `planRelocation`, and current-photo protection
via `currentPhotoRefusal`. Those planners were already well-tested in
isolation, but nothing tested the orchestration layer that actually reads
their `ok`/`error` result and decides whether to proceed with a real database
write (via `lib/nina/queries.ts`) or a real blob delete (`@vercel/blob`'s
`del`). That gap is a real regression risk, not a cosmetic one, given this
app's specific history: the cross-resolution perceptual-dedupe fix landed
earlier the very same day (2026-09-11), and several other production
incidents on record involve exactly this blob/dedupe-handling area. Six
actions, one file, high-invariant logic, zero coverage — the clearest win on
the corrected menu.

## What We Did (blow-by-blow)

1. **Ran the cheap survey, got a plausible-looking but wrong answer.**
   Grepping for `*.test.*` inside `components/` and `lib/` directly returned
   nothing for `admin`, suggesting a large, easy, 26-component gap (menu item
   #2) and a clean three-file pure-logic gap (menu item #3).

2. **Read the candidate files before committing, and found both already
   covered.** Opening `lib/admin/filetree.ts`, `folderOps.ts`, and
   `avatars.ts` turned up `tests/admin.filetree.test.ts`,
   `tests/admin.folderOps.test.ts`, and `tests/admin.avatars.test.ts` already
   in place and thorough. Re-ran the survey correctly this time — grep
   `tests/*.test.ts` for imports of `@/components/admin/...` and
   `@/lib/admin/...` — and confirmed most of both trees are already tested
   under this repo's centralized `tests/` convention.

3. **Applied the same corrected method to `lib/admin/ninaAlbumActions.ts`**
   specifically, since it's the file `folderOps.ts`'s planners feed into.
   Grepped `ninaAlbumActions` exports against every `tests/*.test.ts` import
   and found 11 of 14 exported Server Actions had no test importing them at
   all. Narrowed to the six folder-maintenance actions as the highest-value
   subset: they're the ones that convert a planner's refusal/approval into an
   irreversible side effect (a row write or a blob delete).

4. **Traced each of the six actions' control flow against its planner before
   writing any test:**
   - `createNinaAlbumFolderAction` — validates input, calls into
     `folderOps.ts` planning, and on success declares both ancestor folders
     and the new leaf; on collision or depth-bound violation, refuses without
     writing.
   - `renameNinaAlbumFolderAction` — rows are read/updated in a specific
     order before declarations are updated; an identity rename (no actual
     path change) is a no-op that still reports success; a merge-eligible
     rename can report `moved: 0` while still succeeding; a rename onto an
     already-occupied path is refused.
   - `moveNinaAlbumFolderAction` — moving a folder under a new parent,
     moving onto its own current parent (no-op), and refusing a move that
     would relocate a folder into its own subtree.
   - `moveNinaAvatarsAction` — malformed input handling and a success path
     that reports how many avatars moved.
   - `deleteNinaAlbumFolderAction` — refuses to delete the root folder;
     refuses when the current photo lives anywhere in the subtree being
     deleted (`currentPhotoRefusal`); a `keepCurrent` path that leaves the
     folder behind (with a note) and deliberately does *not* undeclare it;
     an empty-subtree path that *does* undeclare the folder and reaps both
     the original and thumbnail blobs; and a case proving a blob-store
     `del()` rejection does not fail the action, since the database rows are
     already gone by that point (the write, not the cleanup, is the
     source of truth).
   - `removeNinaAvatarsAction` — malformed input, refusal when the current
     photo is inside the selection being removed, a `keepCurrent` path, and
     an ordinary bulk-remove path.

5. **Wrote `tests/admin.folderActions.test.ts` (23 tests)** following the
   `tests/admin.chatPhotoAdoption.test.ts` pattern already established in
   this repo: real generated SQL run against a fake Neon driver via
   `installFakeDb` (`tests/support/fakeDb.ts`), so the assertions exercise
   the actual SQL the actions build rather than a hand-rolled stand-in for
   the database. Only true I/O edges were mocked: `@vercel/blob`'s `del`,
   `requireAdmin` (auth gating), and `next/cache`'s `revalidatePath`. No
   `put` or `after` mocks were needed, since none of these six actions
   perform an upload or schedule background work.

6. **Verified the suite has real teeth, not just shape.** Manually commented
   out the `currentPhotoRefusal` guard inside `deleteNinaAlbumFolderAction`
   — i.e., disabled the protection that stops someone from deleting a folder
   containing Nina's current photo — and re-ran the suite. Exactly 1 test
   failed, as expected, pinpointing the disabled guard. Restored the file and
   confirmed green again before committing.

7. **Ran the full local gate, all green:**
   - `npm test` → **189 test files / 4,042 tests passed** (up from 188 files
     / 4,019 tests at the end of session 2 — net **+1 file, +23 tests**).
   - `npx tsc --noEmit` → clean.
   - `npx eslint tests/admin.folderActions.test.ts` → clean.
   - `npx prettier --check` → clean after one auto-format pass.

8. **Committed as a single commit** (unlike session 2's three-way split):
   all six actions live in one file, share one test-infra setup, and were
   traced/verified together as one coherent orchestration-layer sweep, so one
   commit keeps that unit intact rather than fragmenting it artificially.

## Code / Design Details

**Real SQL against a fake driver, not a mocked query layer.** Like
`tests/admin.chatPhotoAdoption.test.ts`, this suite uses `installFakeDb` to
intercept at the Neon driver boundary, so the actions' real
`lib/nina/queries.ts` calls generate real SQL that gets asserted against —
catching bugs in the SQL itself (wrong `WHERE`, wrong join, wrong column),
not just bugs in a hand-maintained mock's return shape.

**Mock boundary drawn at true I/O only.** `@vercel/blob`'s `del`,
`requireAdmin`, and `next/cache`'s `revalidatePath` are the only mocks — each
crosses a real network/process boundary the test process can't or shouldn't
actually touch. Everything else, including the `folderOps.ts` planners these
actions call into, runs as real production code, so a regression in either
the planner or the orchestration wrapper around it is visible from this one
suite.

**The `del()`-rejection test encodes a real ordering guarantee.**
`deleteNinaAlbumFolderAction`'s empty-subtree path deletes database rows
*before* attempting to reap the associated blobs. The test that makes the
mocked `del()` reject and then asserts the action still reports success
encodes that ordering deliberately: the database is the source of truth for
"is this folder gone," and a failed best-effort blob cleanup must not turn a
successful, already-committed deletion into a reported failure. Losing this
guarantee silently (e.g., by reordering the two operations, or by wrapping
the delete in a try/catch that rethrows) is exactly the kind of change this
test exists to catch.

**`keepCurrent` deliberately asymmetric between the two actions' declaration
state.** `deleteNinaAlbumFolderAction`'s `keepCurrent` path leaves the folder
declared (with a note) since the folder itself still exists and still holds
a photo; its non-`keepCurrent` empty-subtree path undeclares the folder since
there's nothing left in it. Both branches are asserted explicitly rather than
only asserting the common "it didn't crash" case, because the two are easy to
accidentally conflate during a future refactor.

## Decisions & Trade-offs

- **Corrected the survey method before picking a candidate, at some token
  cost, rather than trusting the cheap grep.** Reading `filetree.ts`,
  `folderOps.ts`, and `avatars.ts` (and their existing `tests/admin.*.ts`
  files) to rule out menu items #2 and #3 cost real turns that produced no
  new test file. That cost is judged worth it: shipping tests for
  already-tested code would have been wasted burn *and* would have
  propagated the wrong survey method into future sessions' menus.
- **Picked the orchestration layer (`ninaAlbumActions.ts`) over the already-
  tested pure planners (`folderOps.ts`) as the coverage target.** The
  planners' decisions were already protected; what was unprotected was
  whether the calling code actually *honors* those decisions when writing to
  the database or deleting blobs. That's the layer where a real regression
  (e.g., an added code path that skips the refusal check, or writes before
  checking `ok`) would actually cause damage.
- **Rejected the `lib/nina` YAGNI/dead-code hunt (menu item #4) as
  out-of-order work.** Removing code with no regression net is inherently
  riskier than removing code that's covered; better to keep growing coverage
  in high-value, low-coverage areas first and treat dead-code removal as a
  later, better-protected pass — consistent with this repo's general stance
  (echoed in this project's own YAGNI notes elsewhere) of not doing
  destructive cleanup ahead of safety nets.
- **One commit instead of splitting per-action.** All six actions share one
  file, one test-infra setup (`fakeDb` + three mocks), and were traced as a
  single coherent sweep of "orchestration layer around `folderOps.ts`" rather
  than six independent units, so one commit keeps that framing intact. (This
  differs from session 2's three-commit split, which was justified there by
  each component being independently reusable and independently revertible;
  the six actions here are more like six facets of one concern.)
- **`components/admin/explorer/dropWalk.ts` investigated and explicitly not
  tested** — see Follow-ups. Not an oversight; the file's own header
  disclaims testability.

## Follow-ups & YAGNI notes

- **5 more untested exported actions remain in the same file:**
  `describeNinaAvatarAction`, `setCurrentNinaAvatarAction`,
  `ensureNinaAvatarDescriptionAction`, `registerNinaAvatarsAction`,
  `listNinaAlbumManifestAction`. Natural next target: same file, same
  `fakeDb` + mocked-`del`/`requireAdmin`/`revalidatePath` pattern used here.
  Note that at least `ensureNinaAvatarDescriptionAction` and
  `registerNinaAvatarsAction` likely also need `after`/vision-client mocking,
  the way `tests/admin.chatPhotoAdoption.test.ts` already does — they weren't
  in scope for this session's six because they involve upload/description
  side effects the folder-maintenance actions don't.
- **`components/admin/explorer/dropWalk.ts` was investigated and
  deliberately NOT tested.** Its own header explicitly disclaims
  testability: "Nothing here is testable and nothing here decides anything"
  — it's raw `DataTransferItem` / `FileSystemDirectoryEntry` / `FileList`
  glue with all judgment already pushed into `lib/admin/filetree.ts`, which
  has full coverage. Forcing tests here would be the same test-theater
  sessions 1 and 2 explicitly avoided for `NinaSidebar`'s focus-management
  effect and `MessageList`'s scroll/restore timing. Flagged as
  considered-and-rejected, not an oversight, so a future session doesn't
  re-open it expecting an easy win.
- **General survey-method correction, recorded so it doesn't recur:** before
  proposing "package X has zero tests" as a token-maxxing menu item in this
  repo, grep imports against the top-level `tests/` directory — not just
  co-located `*.test.*` files. This repo's test convention is centralized
  under `tests/`, not co-located next to source, and a naive
  co-location-only survey will produce false-positive gaps, as it did twice
  in this session's own Step 4 before correction.
- **`MessageActionsSheet.tsx` component tests** (menu item #1 today, also
  named by session 2's follow-ups) remain open and un-picked for a third
  time — still a real, if smaller, gap.
- **`lib/nina/queries.ts` / `persona.ts` / `actions.ts` YAGNI/dead-code
  hunt** remains open, explicitly deferred until those areas have more test
  coverage to catch a bad removal.

## Appendix

**Key commands run this session:**
```bash
npm test
npx tsc --noEmit
npx eslint tests/admin.folderActions.test.ts
npx prettier --check tests/admin.folderActions.test.ts
npx prettier --write tests/admin.folderActions.test.ts
```

**Gate results:**
- Before this session (end of session 2, 2026-09-11): 188 test files /
  4,019 tests passing.
- After this session: 189 test files / 4,042 tests passing — net **+23
  tests** in 1 new file, `tests/admin.folderActions.test.ts`.
- `tsc --noEmit`, `eslint`, `prettier --check`: all clean at commit time.

**Deliberate-breakage verification:** commented out the
`currentPhotoRefusal` guard inside `deleteNinaAlbumFolderAction` in
`lib/admin/ninaAlbumActions.ts`, re-ran the suite (1 test failed, as
expected), reverted, confirmed green.

**Commit (on `token-maxxing-2026-09-11`):**
```
042e9ae test(admin): cover the six untested folder-maintenance actions in ninaAlbumActions.ts
```
1 file changed, 411 insertions(+) — `tests/admin.folderActions.test.ts`.

**Branch:** `token-maxxing-2026-09-11` — on branch, not yet merged (merge
happens as a separate step outside this session).
