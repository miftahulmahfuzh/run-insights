# Token-Maxxing Session — 2026-09-11: Lib Admin Action Tests

> **Sixth token-maxxing session on this date — and the first to run under a
> coordinator.** The first session ([doc](./2026-09-11-nina-chat-component-tests.md))
> stood up React component-testing infra from zero; the second
> ([doc](./2026-09-11-nina-composer-bubble-list-tests.md)) covered
> `Composer.tsx`/`MessageBubble.tsx`/`MessageList.tsx`; the third
> ([doc](./2026-09-11-admin-folder-actions-tests.md)) corrected a
> false-positive "zero coverage" survey and covered six folder-maintenance
> Server Actions; the fourth ([doc](./2026-09-11-nina-message-actions-sheet-tests.md))
> closed `MessageActionsSheet.tsx`; the fifth
> ([doc](./2026-09-11-admin-file-explorer-tests.md)) covered the whole
> FileExplorer subsystem. Every one of sessions 3, 4, and 5 listed the
> untested `lib/admin` Server Actions in its follow-ups and deferred them —
> session 5 explicitly recorded "deferred a **3rd time**" on the 5 remaining
> avatar exports. This session finally closed that surface, and it did not
> pick the idea itself: it was assigned by a coordinator orchestrator
> (`tokenmax-orch-2026-09-11`, slug `lib-admin-action-tests`) running
> parallel sessions, each on its own branch.

## 🎯 Achievement / End Result
- **Goal of the burn:** Write real, executing tests for the remaining
  untested `lib/admin/*.ts` Server Actions and models — the 5 remaining
  `ninaAlbumActions.ts` avatar exports (`describeNinaAvatarAction`,
  `setCurrentNinaAvatarAction`, `ensureNinaAvatarDescriptionAction`,
  `registerNinaAvatarsAction`, `listNinaAlbumManifestAction`) plus
  `imageGenActions.ts`, `shortcutActions.ts`, `users.ts`, `shortcutModel.ts`,
  `requireAdmin.ts`, `memoryVocab.ts`, `memoryActions.ts`, `tuningActions.ts`,
  `textModelActions.ts`, `chatPhotoActions.ts`, `shortcutStore.ts`,
  `imageGenTestView.ts`, `memoryModel.ts`, `memoryStore.ts`,
  `imageGenModel.ts`, `chatPhotoSchema.ts`, `tuningModel.ts` — flagged as a
  follow-up in 3 prior token-maxxing sessions today and never picked up; the
  riskiest untested surface in the admin subsystem (real side-effecting
  Server Actions with zero runtime coverage).
- **Concrete changes:** 7 new test suites + 5 extended suites + one additive
  fakeDb capability — 13 files, +2,942/−33 lines:
  - `tests/admin.albumAvatarActions.test.ts` — new, 34 tests.
  - `tests/admin.requireAdmin.test.ts` — new, 15 tests.
  - `tests/admin.users.test.ts` — new, 6 tests.
  - `tests/admin.shortcutActions.test.ts` — new, 28 tests.
  - `tests/admin.memoryActions.test.ts` — new, 29 tests.
  - `tests/admin.imageGenActions.test.ts` — new, 17 tests.
  - `tests/admin.settingsActions.test.ts` — new, 11 tests (tuning + text model).
  - `tests/admin.chatPhotos.test.ts` — extended, +21 tests.
  - `tests/admin.memory.test.ts` — extended, +4 tests.
  - `tests/admin.avatars.test.ts` — extended, +4 tests.
  - `tests/admin.imagegen.test.ts` — extended, +3 tests.
  - `tests/admin.imagegenTest.test.ts` — extended, +2 tests.
  - `tests/support/fakeDb.ts` — additive `enqueueError(...)` method so a
    scripted rejection reaches a store's catch block through drizzle's real
    error path.
- **Real value delivered:**
  - A subagent-built per-export coverage map of all 18 named files first
    **corrected the premise**: most `lib/admin` modules had STRUCTURAL
    coverage (source-string assertions) or pure-function coverage, and 9
    files were fully untested at runtime (`users.ts`, `requireAdmin.ts`,
    `shortcutStore.ts`, `memoryStore.ts`, `memoryActions.ts`,
    `shortcutActions.ts`, `tuningActions.ts`, `textModelActions.ts`,
    `imageGenActions.ts`), while the 5 named avatar actions had never been
    executed. The session wrote against the corrected map, not the handed-down
    story — the same survey-hygiene lesson sessions 3 and 5 paid for.
  - **`requireAdmin.ts` ran for the first time ever** — the security boundary
    itself: the `redirect('/')` vs `notFound()` split, the id-first check
    order, `requireAdminApi`'s 401/404 distinction, and the empty-`ADMIN_EMAILS`
    boot crash. Fifteen tests pinning the gate every admin action hides behind.
  - ~180 new tests (**174 measured**, all passing) in the repo's established
    execution posture: the REAL query layer runs against
    `tests/support/fakeDb.ts` (a recording drizzle driver asserting generated
    SQL), with only edges mocked (`requireAdmin`, `@vercel/blob`,
    `next/server` after, `next/cache` revalidatePath, the vision client).
  - Honesty findings pinned as characterization tests, as the code behaves
    rather than as a tidier story: `registerNinaAvatarsAction`'s `skipped`
    counts storage conflicts, not pathname-join misses (a join miss vanishes
    from `inserted`, `skipped` stays 0); zod's default object schema STRIPS a
    forged `confirm` field rather than refusing it, making the
    "no confirmation" invariant runtime-true; drizzle binds jsonb params as
    JSON-stringified text appearing twice (INSERT + ON CONFLICT SET).
  - Mutation check passed: flipping the describe-subject expectation
    (`'self'`→`'runner'`) failed exactly the 4 tests that pin the vendor
    prompt — the suite binds to the real code path, not to mocks of it.
  - Net test count: **174 new tests, all passing** (4,191 → 4,365). Full
    `npx vitest run` green across 206 test files; `npx tsc --noEmit` clean
    (after `npx next typegen` cleared the known fresh-worktree PageProps
    errors); Prettier `--check` clean on every touched file.
- **Branch:** `token-maxxing-2026-09-11-lib-admin-action-tests` (dedicated
  per-session branch — this session ran under a coordinator, unlike sessions
  1–5 which shared `token-maxxing-2026-09-11`).
- **Merge status:** merged (commit `a62baba`)
- **Approx token burn:** high — an 18-file per-export coverage survey before
  any test was written, ~2,950 lines of test code authored across 12 suites,
  a real 23505 unique-violation scripted through drizzle's error wrap, three
  honesty findings chased down and pinned, a mutation check, plus a
  full three-gate verification pass and two flake investigations. 🔥

## Context & Motivation

This is the **sixth** token-maxxing session on 2026-09-11, and the first
spawned by a coordinator rather than self-directed: `tokenmax-orch-2026-09-11`
fanned out parallel sessions, each handed one idea from the day's accumulated
follow-up backlog and each on its own branch, so sessions no longer serially
re-flag the same follow-ups without acting. The idea assigned here was the
single most-deferred item in that backlog.

The deferred surface: the repo's `lib/admin/*.ts` files hold the Server
Actions every admin UI button calls — avatar registration and description,
shortcut CRUD, memory writes, image generation, tuning and text-model saves,
chat-photo removal — plus the models and stores beneath them and the
`requireAdmin` gate in front of all of it. Sessions 3, 4, and 5 each named
these files in their follow-ups; session 3 covered only the six
folder-maintenance actions in `ninaAlbumActions.ts`, session 4 declined the
vision-client/`after()` mocking the avatar actions needed, and session 5
declined them again for a third time while covering the explorer components
that call them. The result was an admin subsystem whose UI had 119 fresh DOM
tests and whose every click-through action had zero runtime coverage — the
tests proved the buttons rendered; nothing proved the buttons worked.

**The premise correction.** The assigned idea phrased the target as "the
remaining untested lib/admin actions and models," implying a uniformly
untested landscape. Before writing anything, a subagent built a per-export
coverage map of all 18 named files and found a mixed picture: most modules
had STRUCTURAL coverage (suites that read source text and assert substrings —
the same false-positive pattern session 5 documented for
`tests/admin.mediaPane.test.ts`) or pure-function coverage (`shortcutModel`,
`memoryModel`, `imageGenModel`, `chatPhotoSchema`, `memoryVocab`,
`imageGenTestView` already had execution via their pure halves). What was
genuinely never executed at runtime: **9 fully-untested files** (`users.ts`,
`requireAdmin.ts`, `shortcutStore.ts`, `memoryStore.ts`, `memoryActions.ts`,
`shortcutActions.ts`, `tuningActions.ts`, `textModelActions.ts`,
`imageGenActions.ts`) and the **5 named avatar actions** that had never been
run. That map is what turned a vague mandate into a file-by-file work list.

## What We Did (blow-by-blow)

1. **Coverage survey first.** Subagent mapped all 18 named files
   export-by-export against existing tests, distinguishing structural
   (string-matching) from execution coverage and pure-function from
   side-effecting code. Output: the 9-fully-untested + 5-never-executed work
   list above, and the discovery that the repo's fakeDb-based execution
   posture (real query layer over a recording drizzle driver) could absorb
   almost every action without new mocking infrastructure.

2. **Commit 1 — `test(admin): execute the 5 untested ninaAlbumActions avatar
   exports`** (`67a5688`): `tests/admin.albumAvatarActions.test.ts`, 34
   tests. The follow-up deferred three times, finally executed:
   `describeNinaAvatarAction`, `setCurrentNinaAvatarAction`,
   `ensureNinaAvatarDescriptionAction`, `registerNinaAvatarsAction`,
   `listNinaAlbumManifestAction` — with only the vision client and `after()`
   mocked at the edge, the SQL asserted through fakeDb's recording. Includes
   the honesty pin: `skipped` counts storage conflicts, NOT pathname-join
   misses — a join miss vanishes from `inserted` and `skipped` stays 0 —
   characterized as it behaves rather than as a tidier story would have it.

3. **Commit 2 — `test(admin): execute requireAdmin and the admin user
   picker`** (`90f06ef`): `tests/admin.requireAdmin.test.ts` (15 tests) and
   `tests/admin.users.test.ts` (6 tests). The security boundary's first
   execution ever: `redirect('/')` for a signed-in non-admin, `notFound()`
   variants, the id-first check order (a missing id short-circuits before
   the admin check), `requireAdminApi`'s 401-vs-404 split, and the boot
   crash on empty `ADMIN_EMAILS`.

4. **Commit 3 — `test(admin): execute the shortcuts actions and store; fakeDb
   gains scripted errors`** (`1004ff2`): `tests/admin.shortcutActions.test.ts`,
   28 tests, plus the additive `enqueueError(...)` method on
   `tests/support/fakeDb.ts`. The headline test: a REAL 23505 unique-violation
   is queued and delivered through drizzle's error wrap, so
   `isUniqueViolation`'s walk over `.cause`/`.sourceError` is exercised
   against the genuine propagation path — not simulated by a spy on a
   hand-shaped error object.

5. **Commit 4 — `test(admin): execute the memory actions and store`**
   (`81cc9b2`): `tests/admin.memoryActions.test.ts`, 29 tests. Every write
   asserted to carry `source='admin'` and `source_message_id=NULL` — read
   from the actual SQL params fakeDb recorded, not from a return value.

6. **Commit 5 — `test(admin): execute the image-generation actions`**
   (`22b6e2b`): `tests/admin.imageGenActions.test.ts`, 17 tests.

7. **Commit 6 — `test(admin): execute the personality settings saves`**
   (`0c5c195`): `tests/admin.settingsActions.test.ts`, 11 tests covering the
   tuning and text-model saves. Pinned the second honesty finding: zod's
   default object schema STRIPS a forged `confirm` field rather than
   refusing it — so the "no confirmation required" invariant is
   runtime-true, and the test says exactly that.

8. **Commit 7 — `test(admin): execute remove, describe and findDuplicate chat
   photo actions`** (`d66856b`): `tests/admin.chatPhotos.test.ts` extended
   with +21 tests, including `removeChatPhotoAction` — the one destructive
   action in the admin surface — plus `describeChatPhotoAction`'s
   subject-follows-photo rule and `findChatPhotoDuplicateAction`.

9. **Commit 8 — `test(admin): close the remaining per-export gaps in the
   covered suites`** (`77a0e17`): swept the four already-covered suites for
   their last untested exports — `admin.avatars.test.ts` +4
   (`contentTypeForAvatarExt` inverse mapping + constants),
   `admin.imagegen.test.ts` +3 (model picker copy pair),
   `admin.imagegenTest.test.ts` +2 (`NINA_IMAGE_TEST_REASON` looped against
   `NINA_IMAGE_FAILURES`), `admin.memory.test.ts` +4 (`describeSlot` +
   constants).

10. **Commit 9 — `style: prettier-wrap the new suites; type the fixtures tsc
    actually checks`** (`7b2c058`): Prettier wrap-up across all 8 touched
    suites and fixture typing so `npx tsc --noEmit` passes clean.

11. **Mutation check.** Flipped the describe-subject expectation in the
    avatar suite from `'self'` to `'runner'` and re-ran: exactly the 4 tests
    that pin the vendor prompt failed, nothing else. The suite binds to the
    real code path.

12. **Gates.** `npx vitest run` → 206 test files / 4,365 tests, exit 0.
    Two intermediate full-suite runs each flaked one explorer component test
    (`MediaPane`, then `SelectionPane`) under parallel load — different
    files each time, passing 3/3 in isolation and in the final full run;
    diagnosed as a pre-existing fake-timer race, not this diff. `npx next
    typegen` then `npx tsc --noEmit` → clean (fixtures typed). Prettier
    `--check` clean on every touched file. Working tree clean, 9 commits.

## Code / Design Details

**Execution posture: the real query layer over a recording fake.** Every new
suite follows the repo's established shape — the production query layer runs
for real against `tests/support/fakeDb.ts`, a drizzle driver that records
every statement (SQL text + params) and answers from an enqueued queue. Only
true edges are mocked: `requireAdmin` (itself the subject of its own suite
when tested directly), `@vercel/blob`, `next/server`'s `after()`,
`next/cache`'s `revalidatePath`, and the vision client. The payoff is that
assertions land on generated SQL and bound params — "the write carries
`source='admin'` and `source_message_id=NULL`" is read out of the recorded
params, not inferred from a spy's call count.

**fakeDb's additive `enqueueError` — the smallest change that makes a real
error path testable.** Stores catch database errors and branch on their
shape (`isUniqueViolation` walking `.cause`/`.sourceError`); the only way to
test that branch honestly is to deliver a real-shaped error through drizzle's
actual wrap, not to stub the wrapper. Twelve added lines:

```ts
/** Queue the next statement to REJECT with each error, in order. */
enqueueError(...errors: unknown[]): void
// in the driver:
const error = pendingErrors.shift()
if (error !== undefined) throw error
```

The shortcuts suite then queues a genuine 23505 and watches it travel
drizzle's wrap into the store's catch — the unique-violation classifier is
exercised, not simulated.

**Honesty findings, pinned as the code behaves:**
- `registerNinaAvatarsAction`'s `skipped` counts **storage conflicts, not
  pathname-join misses**. A join miss (the pathname-derived target doesn't
  come out where the code expects) doesn't increment anything — it simply
  vanishes from `inserted`, and `skipped` stays 0. The test pins this
  actuality; a doc-reading test would have asserted the tidier story and
  been wrong.
- Zod's default object schema **strips** a forged `confirm` field rather
  than rejecting it. The settings-save invariant "no confirmation is
  required to change tuning" is therefore true at runtime for an
  unglamorous reason: the field is silently deleted before the action sees
  it. The test names the mechanism.
- Drizzle binds jsonb params as **JSON-stringified text appearing twice** —
  once in the INSERT values, once in the ON CONFLICT SET — so the recorded
  param list carries the same serialized blob in both positions. That's a
  real hazard for anyone asserting params positionally, now documented by
  the assertions themselves.

**Mutation check as a coverage claim.** Coverage numbers say lines ran; a
mutation says the assertions are load-bearing. Flipping the describe-subject
expectation (`'self'`→`'runner'`) failed exactly the 4 tests that pin the
vendor prompt — neither more (the suite isn't brittle against unrelated
suites) nor fewer (the pin isn't decorative).

**The flake signature, recorded for the next session.** Two intermediate
full-suite runs each failed exactly one explorer component test under
parallel load — `MediaPane` in one, `SelectionPane` in the other, different
files each time, both passing 3/3 in isolation and in the final full run.
The aria-busy transitions in those components race a fake-timer boundary
under load. Not this diff (no suite here touches those components), but the
pattern is now in writing.

## Decisions & Trade-offs

- **Ran the coverage survey before writing a single test.** The assigned
  premise ("the remaining untested lib/admin actions") was directionally
  right but wrong in the details — 9 of the 18 files were wholly untested
  while most of the rest already had structural or pure-function coverage.
  Writing to the corrected map meant the session's tests are genuinely new
  execution coverage rather than duplicates of structural suites, and it
  surfaced `requireAdmin.ts` — arguably the most important file on the list —
  which a naive "cover the actions" pass might have treated as a solved
  dependency.
- **Followed the fakeDb execution posture instead of inventing an
  action-level harness.** The repo already had the right tool: real query
  layer, recording driver, edge mocks. The only infrastructure change needed
  was 12 additive lines (`enqueueError`). No new patterns, no parallel test
  culture — future sessions reading any of these suites see the same shape
  as the existing ones.
- **Characterized, didn't fix.** Where behavior looked wrong-ish (`skipped`
  ignoring join misses; zod stripping rather than refusing), the tests pin
  what IS. Changing product behavior was out of scope for a test-coverage
  session and would have muddied the diff; the findings are recorded here
  and in the test names so a behavior change is a deliberate act, not an
  accident a test would silently permit.
- **Left the load-flaky explorer tests for a named follow-up** rather than
  fixing them mid-session. The flake is pre-existing, its trigger is
  full-suite parallel load, and the fix (deterministic timer advance in the
  two component suites) belongs to the explorer suites' owner, not inside a
  9-commit test-adding diff where it would be invisible.
- **One commit spent on style + types** (`7b2c058`) rather than folding
  prettier-wrapping into the test commits — keeps the eight test commits
  reviewable as pure additions and makes the tsc-driven fixture typing
  auditable on its own.

## Follow-ups & YAGNI notes

- **`lib/admin/avatars.ts`'s `ADMIN_AVATAR_TOKEN_TTL_MS` /
  `CACHE_MAX_AGE` are asserted as constants, but the token-minting Route
  Handler they belong to still has no runtime test of its own**
  (`app/api/admin/nina/upload/route.ts`). The constants are pinned; the code
  that consumes them is not. That route handler is the natural next
  execution-coverage target in this area.
- **The two load-flaky explorer component tests deserve a deterministic
  fix** — `MediaPane` and `SelectionPane`'s aria-busy races flake under
  full-suite parallel load (twice today, different files each time) and pass
  everywhere else. Advance fake timers deterministically at the busy
  transition instead of racing it.
- **`tests/support/fakeDb.enqueueError` scripts rejections
  statement-by-statement**; a batch-level error API (fail the Nth statement
  of a `db.batch`) is the natural next need once a store under test wraps a
  multi-statement transaction that should abort as a unit.
- **Remaining non-action exports asserted only as constants** (edge px
  bounds, cache TTLs) could move into a single "boundary constants" table
  if the list keeps growing — fine as-is today, but it's the kind of list
  that accretes one assertion per session until it deserves structure.
- **Still open, carried from session 5:** `useFolderUpload.ts` (~425 lines,
  `@vercel/blob/client` mocking), `PhotoMoveBar.tsx`, `FolderMenu.tsx`,
  `components/ui` primitives (14 files), the `lib/nina` YAGNI/dead-code
  hunt (deferred a 5th time), and the F0x architecture-synthesis doc. None
  touched here; none closed by this session's work.
- **Survey-method note, reaffirmed a third time:** the per-export map was
  worth its cost — the difference between "file has a test mentioning it"
  and "these specific exports execute at runtime" is exactly where all 9
  fully-untested files and the 5 never-executed actions were hiding inside
  a file list that superficially read as "mostly covered."

## Appendix

**Key commands run this session:**
```bash
npx vitest run
npx next typegen && npx tsc --noEmit
npx prettier --check <touched files>
git status --porcelain
git log --oneline main..HEAD
```

**Gate results:**
- Before this session (end of session 5, 2026-09-11): 199 test files /
  4,191 tests passing.
- After this session: 206 test files / 4,365 tests passing — net **+7
  files, +174 tests** (140 across the 7 new suites, 34 across the 5
  extended suites), +2,942/−33 lines across 13 files.
- `npx next typegen` + `npx tsc --noEmit`: clean.
- `npx prettier --check`: clean on every touched file.
- Two intermediate runs each flaked one explorer component test under
  full-suite parallel load (different files each time; pass 3/3 in
  isolation and in the final full run) — pre-existing fake-timer race, not
  this diff.

**Commits (on `token-maxxing-2026-09-11-lib-admin-action-tests`):**
```
67a5688 test(admin): execute the 5 untested ninaAlbumActions avatar exports
90f06ef test(admin): execute requireAdmin and the admin user picker
1004ff2 test(admin): execute the shortcuts actions and store; fakeDb gains scripted errors
81cc9b2 test(admin): execute the memory actions and store
22b6e2b test(admin): execute the image-generation actions
0c5c195 test(admin): execute the personality settings saves
d66856b test(admin): execute remove, describe and findDuplicate chat photo actions
77a0e17 test(admin): close the remaining per-export gaps in the covered suites
7b2c058 style: prettier-wrap the new suites; type the fixtures tsc actually checks
```

**Branch:** `token-maxxing-2026-09-11-lib-admin-action-tests` (tip
`7b2c058`) — on branch, deliberately NOT merged or pushed by this session;
the coordinator (`tokenmax-orch-2026-09-11`) lands it.
