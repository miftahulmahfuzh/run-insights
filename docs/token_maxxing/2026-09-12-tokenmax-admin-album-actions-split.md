# Token-Maxxing Session — 2026-09-12: Admin Album-Actions Split

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-admin-album-actions-split`) pre-assigned
  one idea by the coordinator (`tokenmax-orch-2026-09-12`): *"Split
  `lib/admin/ninaAlbumActions.ts` (1222 lines) into cohesive modules behind a re-export barrel.
  Why: the largest untouched file in components/admin's server-action layer, real maintainability
  win."*
- **Concrete changes:** commit `6c2e583` — 12 files, +1418/−1190. The 1222-line monolith became a
  plain-ESM barrel and five modules split along the layer's own seams
  (`ninaAlbumDescribeActions.ts`, `ninaAlbumAvatarActions.ts`, `ninaAlbumUploadActions.ts`,
  `ninaAlbumFolderActions.ts`, `ninaAlbumDeferredDescribe.ts`); a new structural test
  (`tests/admin.albumActionsBarrel.test.ts`, 88 lines) pins the export surface; and 8 stale
  line-number doc citations in four other files plus one test were re-pointed at symbol + module
  references.
- **Real value delivered:**
  - **Zero caller changes.** Every client component, page and action-level test keeps importing
    the exact same path — the barrel holds all 15 named exports plus the `AdminActionResult` type,
    so no call site in the repo was edited.
  - **Cohesion instead of accretion.** The file had grown by four phases of work appended into one
    `'use server'` file (describe, folder upload, folder maintenance, chat-photo adoption); the
    split follows the layer's own seams — description earning (3 actions), the face (4 actions),
    upload bookkeeping (2 actions), folder maintenance (6 actions), and the deferred describe
    pre-pass (1 plain-module export).
  - **The barrel is deliberately PLAIN (no `'use server'`)**: the Next docs don't guarantee
    re-export registration of a directive barrel, and plain ESM re-export needs nothing from the
    transform — each action remains a Server Action of the module that defines it.
  - **`scheduleDescribe` finally exported** — from a PLAIN module. A `'use server'` module may
    export only async functions, which is exactly what kept the sync scheduler unexported beside
    its callers in the monolith.
  - **The export surface is now pinned by a test**, written TDD-style: the barrel pin ran GREEN
    against the UNSPLIT file first, and the five per-module pins ran RED until the modules
    existed — so the test demonstrably tests the split, not the file.
  - **8 stale line-number doc citations repaired en route** (`:186-191`, `:300-320`, `:301`,
    `:278`, `:332`, `:152+`, `:557+`, `:182-184` and friends) — they predated commit `422daa5` and
    already pointed at the wrong lines before the split touched anything.
  - **Two real bugs hit and fixed, both recorded below** — a symlinked-`node_modules` worktree
    trap that surfaces as a `next-auth` module-not-found under vitest, and a dropped import
    (`declareNinaFolders`) that the structural test structurally cannot catch.
  - **Empirical proof the barrel pattern works under THIS Next version:** `next build` passes and
    `.next/server/server-reference-manifest.json` lists all four action modules
    (`ninaAlbum{Describe,Avatar,Upload,Folder}Actions`) — the registered Server Actions are the
    split modules', not a barrel fantasy.
- **Branch:** `token-maxxing-2026-09-12-admin-album-actions-split`
- **Merge status:** Pending — coordinator `tokenmax-orch-2026-09-12` lands the branch; the worker
  never merges. (Accurate at time of writing: commit `6c2e583` sits on the worker branch only.)
- **Approx token burn:** high (est. ~1M, input-dominated) — the burn went into reading a
  1222-line monolith plus its callers' citation web, writing six new files and an 88-line pin
  test, and the full gate stack including a real `npm ci` and a production `next build`. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: a coordinator session
(`tokenmax-orch-2026-09-12`) spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker drew the admin album action layer — `lib/admin/
ninaAlbumActions.ts`, the write side of Nina's album.

The file's shape told the story: 1222 lines accumulated by accretion across four phases of work,
each appended after the last with an append-marker banner ("Appended; nothing above this line
changed") stitching them together — the describe button and its hand edit and in-band ensure
(F33 R23 and the R25 describe pre-pass), the folder-upload batch register, folder maintenance
with bulk move/remove, and the chat-photo adoption pass. Every action opened with the same
`requireAdmin()` prologue; related doc comments cross-referenced each other by line number; and
the one non-async function the file needed (`scheduleDescribe`, the `after()` describe pre-pass)
was forced to stay unexported by the `'use server'` export rule — living privately in the same
file as its callers because there was nowhere else to put it.

Prior sweeps of `lib/admin` (2026-09-11's dead-exports audit, the action tests, the optional-props
scan) had touched everything around this file but never the file itself — it was the largest
untouched unit in the layer, and a mechanical split with pinned exports was a maintainability win
with no behavior risk to argue about.

## What We Did (blow-by-blow)
1. **Read the mon whole and found the seams.** The four phases were already visible as
   append-banner-delimited bands. The split lines followed the layer's own vocabulary —
   description, the face, upload bookkeeping, folder maintenance — rather than an arbitrary
   size-based chop, and yielded 15 actions + 1 type + 1 sync scheduler, exactly what the file
   exported plus the one thing it couldn't.
2. **Wrote the pin test FIRST, TDD-style.** `tests/admin.albumActionsBarrel.test.ts` pins the
   barrel to exactly the 15 action names (sorted `Object.keys` comparison) and pins each module
   to exactly its own actions. Run against the UNSPLIT tree: the barrel pin passed green (the
   monolith already exported precisely those 15), and the five module pins failed red — the
   modules didn't exist. That red state is the test demonstrably measuring the split.
3. **Split the file into six modules.** Code and doc comments moved verbatim. The only edits:
   module headers stating each module's cohesion argument, append-marker banners dropped (an
   "Appended; nothing above this line changed" banner would simply lie inside a 200-line module),
   deixis fixed ("below"/"in this file" no longer pointed at anything), and the barrel written
   PLAIN — no `'use server'` of its own.
4. **Hit the first real bug: the symlinked-node_modules worktree.** The new pin test imports the
   real modules (a structural test still executes the import graph), and the import graph of an
   un-mocked edge reached `next-auth`, which died with `Cannot find module .../next/server
   imported from next-auth/lib/env.js` under vitest. Existing suites never saw this because they
   all mock `requireAdmin` — the one edge that pulls `next-auth` in. The worktree's
   `node_modules` was a SYMLINK to the main checkout's install, which is what made the resolution
   fail at all. Fix: the pin test mocks the same edges the action-level suites mock
   (`requireAdmin`, `@vercel/blob`, `next/server`, `next/cache`, `vision`). The real `npm ci` was
   required anyway — Turbopack's build rejects symlinked `node_modules` — which independently
   removes the trap for this worktree.
5. **Hit the second real bug: a dropped import the structural test cannot see.** After the split,
   one folder test died with `declareNinaFolders is not defined` — the split had moved
   `deleteNinaAlbumFolderAction` into `ninaAlbumFolderActions.ts` but dropped
   `declareNinaFolders` from that module's import list. The pin test passed 5/5 straight through
   this bug, and the reason is structural: `Object.keys` never invokes a function body, so a
   name missing from the import list only explodes when a test calls the action. `npx tsc
   --noEmit` enumerated it as the exactly-one error of the whole tree. Fix: add the import.
6. **Re-pointed the citation web.** The monolith was cited BY line number from four other
   production files and one test — and the citations were already wrong (e.g. `:186-191` for a
   rule that had drifted since commit `422daa5`). All 8 became symbol + module references:
   `lib/admin/chatPhotoActions.ts` (2), `lib/admin/folderOps.ts` (2), `lib/nina/queries.ts` (2),
   `lib/nina/vision.ts` (1), `tests/nina.photoRefs.test.ts` (1, prose only — its pinned SQL
   fragments target `queries.ts` and were untouched).
7. **Ran the full gate stack, all green:** pin test 5/5; the 12 test files that touch this layer
   200/200; the FULL suite **5391/5391**; `npx next typegen` then `npx tsc --noEmit` clean;
   eslint + prettier clean on all 12 touched files; `npx next build` passes; and
   `.next/server/server-reference-manifest.json` lists all four action modules.
8. **Committed `6c2e583` on the worker branch and stopped** — no merge, no push; the coordinator
   lands worker branches.

## Code / Design Details

**The resulting shape** (line counts from the commit stat):

```
lib/admin/ninaAlbumActions.ts          1222 → ~90   the barrel: AdminActionResult + 15 re-exports
lib/admin/ninaAlbumDescribeActions.ts   +143   describe button, hand edit, in-band ensure (3)
lib/admin/ninaAlbumAvatarActions.ts     +308   make-current, chat-photo adoption, crop, delete (4)
lib/admin/ninaAlbumUploadActions.ts     +242   batch register + manifest read (2)
lib/admin/ninaAlbumFolderActions.ts     +460   folder maintenance + bulk move/remove (6)
lib/admin/ninaAlbumDeferredDescribe.ts  +107   scheduleDescribe, in a PLAIN module
```

**The barrel is plain ESM, on purpose.** The header comment states the reasoning: each action is
a Server Action of the module that *defines* it, and the re-exports are plain ESM — the Next docs
don't guarantee re-export registration of a directive barrel, and plain ESM re-export needs
nothing from the `'use server'` transform. The manifest check is the empirical backstop for that
reading: after `next build`, `.next/server/server-reference-manifest.json` names
`ninaAlbumDescribeActions`, `ninaAlbumAvatarActions`, `ninaAlbumUploadActions` and
`ninaAlbumFolderActions` as the registered action modules — proof the actions survived the re-export
as real Server Actions under this Next version, not just as callable functions.

**`AdminActionResult` lives in the barrel.** The one shape every action returns sits at the path
clients already import, so the contract stays where the import already points. The action modules
import it `type`-only, which erases at compile time — so no action module holds a runtime edge
back to the barrel and the dependency graph stays a tree. (If a future action module ever needs a
RUNTIME edge to the barrel, the interface must move to its own module instead — see Follow-ups.)

**The `'use server'` export rule, finally working FOR the design.** In the monolith, the rule
("a `'use server'` module may export only async functions") was a constraint that kept
`scheduleDescribe` — a synchronous scheduler — unexported in the same file as its callers, a
private-with-a-public-shaped-role. The split gives it its own plain module,
`ninaAlbumDeferredDescribe.ts`, where exporting it is legal and the module boundary documents
why it can never carry the directive: its one export is not an async function, so the module
must stay plain.

**The pin test's mock set is the record of where `next-auth` sneaks in:**

```ts
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/nina/vision', () => ({ describeNinaImages: vi.fn() }))
```
`requireAdmin` is the load-bearing one — it is the import that would drag `next-auth` (and its
`next/server` dependency) into an otherwise-pure structural test's graph. `AdminActionResult` is
pinned by the compiler instead (both client importers do `import { type AdminActionResult }`);
being an interface, it has no runtime key for `Object.keys` to see.

**A citation repair, before/after** (`lib/admin/chatPhotoActions.ts`; the same shape in four
other files):

```ts
// before — a line pin that predated 422daa5 and pointed at the wrong lines already
 * `deleteNinaAvatarAction`'s rule (`lib/admin/ninaAlbumActions.ts:186-191`), and it points the same

// after — the symbol names the module, the module names the file
 * `deleteNinaAvatarAction`'s rule (`lib/admin/ninaAlbumAvatarActions.ts`), and it points the same
```

## Decisions & Trade-offs
- **Plain barrel over directive barrel.** Re-exporting Server Actions through a `'use server'`
  barrel would depend on transform behavior the docs don't guarantee; a plain ESM barrel depends
  on nothing but ESM. The cost is one more sentence of explanation in the header; the benefit is
  that the pattern's correctness is decidable from the docs plus one manifest check.
- **`AdminActionResult` stays in the barrel, not its own module.** Its whole point is to sit at
  the path every client already imports. The type-only import discipline in the action modules is
  what keeps this from becoming a cycle; that discipline is a stated rule in the barrel header,
  not an accident.
- **Verbatim move; behavior-bearing cleanups refused.** The most tempting tidy-up —
  `deleteNinaAvatarAction` doing its own single-object `del` while `reapAvatarBlobs` chunks batch
  `del`s in the folder module — was left exactly as it was. Unifying them changes failure-mode
  behavior (one `del` vs a chunked batch), and a refactor commit that smuggles a behavior change
  into a verbatim move is a refactor that can't be reviewed as one. It's recorded as a follow-up.
- **Append-marker banners dropped rather than preserved.** They were load-bearing when the file
  was append-only ("nothing above this line changed" told the reviewer where the new phase
  started); inside a 200-line cohesive module the same sentence is a lie. The module header now
  carries the cohesion argument the banner used to imply.
- **Citations re-pointed to symbol + module, not to fresh line numbers.** The split had just
  demonstrated that line numbers in this web rot the moment code moves. Re-pinning to NEW line
  numbers would have recreated the exact debt; symbol references survive the next move for free.
- **TDD order for the pin test.** Green-on-unsplit for the barrel pin + red-until-split for the
  module pins is what makes the test evidence rather than decoration: it proves the barrel pin
  would have caught a lost re-export on the OLD file too, and that the module pins measure the
  new structure.
- **Structural test accepted as structurally blind to bodies.** The `declareNinaFolders` bug
  passed the pin test and will always pass a `Object.keys` test — that's the test's scope, not a
  flaw to patch by executing bodies (which would turn it into a behavior suite). The gap is
  covered where it's actually covered: the action-level tests that call the actions, and `tsc`,
  which enumerated the missing import as the tree's only error.

## Follow-ups & YAGNI notes
- **The barrel's `AdminActionResult` and the no-runtime-edge rule.** The contract lives in the
  barrel so clients keep one import path; action modules import it type-only, which erases. If a
  future action module ever needs a RUNTIME edge to the barrel (a real value, not a type), move
  the interface to its own module instead of introducing a cycle — the barrel header says this in
  as many words.
- **`deleteNinaAvatarAction` vs `reapAvatarBlobs` delete discipline.** The avatar module's
  single delete does its own single-object `del`; the folder module's reaper chunks batch
  `del`s. This is a deliberate verbatim move, NOT an oversight — unifying them is a
  behavior-bearing change (single-delete failure semantics vs chunked-batch failure semantics)
  this refactor refused to smuggle in. A future behavior-review PR can take it up on its own
  merits, with its own tests.
- **Server-action module IDs moved with the code.** The one behavioral surface that changed:
  Next derives action IDs from module + export, so the split reassigns every album action's ID.
  In-flight client pages during a deploy of this commit could hold stale action IDs until reload
  — the same churn any file move causes, and no stored state depends on the IDs. Noted so a
  future split doesn't rediscover this as a mystery.
- **The append-phase pattern is worth watching elsewhere.** This file reached 1222 lines by four
  phases each appending a band. Any other file that grows a third band under an append-marker
  banner is a candidate for the same treatment at split time — not at sweep time.

## Appendix

**Files touched (commit `6c2e583`, 12 files, +1418/−1190):**
```
 lib/admin/chatPhotoActions.ts          |    4 +-   (citation re-points)
 lib/admin/folderOps.ts                 |   11 +-   (citation re-points)
 lib/admin/ninaAlbumActions.ts          | 1222 ++--  (monolith → barrel)
 lib/admin/ninaAlbumAvatarActions.ts    |  308 +++   (new: 4 face actions)
 lib/admin/ninaAlbumDeferredDescribe.ts |  107 +++   (new: scheduleDescribe, plain module)
 lib/admin/ninaAlbumDescribeActions.ts  |  143 +++   (new: 3 describe actions)
 lib/admin/ninaAlbumFolderActions.ts    |  460 +++   (new: 6 folder actions)
 lib/admin/ninaAlbumUploadActions.ts    |  242 +++   (new: 2 upload actions)
 lib/nina/queries.ts                    |   12 +-   (citation re-points)
 lib/nina/vision.ts                     |    6 +-   (citation re-point)
 tests/admin.albumActionsBarrel.test.ts |   88 +++   (new: export-surface pin, 5 tests)
 tests/nina.photoRefs.test.ts           |    5 +-   (citation re-point; SQL pins untouched)
 12 files changed, 1418 insertions(+), 1190 deletions(-)
```

**Verification performed (all green):** `tests/admin.albumActionsBarrel.test.ts` 5/5 (barrel =
exactly the 15 actions; each module = exactly its own); the 12 test files touching this layer
200/200; FULL vitest suite **5391/5391**; `npx next typegen` + `npx tsc --noEmit` clean (tsc was
also the instrument that enumerated the `declareNinaFolders` dropped import as the tree's only
error); eslint + prettier clean on all 12 touched files; `npx next build` passes with
`.next/server/server-reference-manifest.json` listing `ninaAlbumDescribeActions`,
`ninaAlbumAvatarActions`, `ninaAlbumUploadActions`, `ninaAlbumFolderActions` as registered action
modules. A real `npm ci` was run in this worktree before the build (Turbopack rejects symlinked
`node_modules`), which also retired the worktree's symlinked-install trap for good.

**Two bugs fixed en route (the record):**
1. *Symlinked node_modules + an un-mocked `next-auth` edge.* In a worktree whose `node_modules`
   is a symlink to the main checkout's install, any un-mocked import graph that reaches
   `next-auth` fails under vitest with `Cannot find module .../next/server imported from
   next-auth/lib/env.js`. Existing suites never hit it because they mock `requireAdmin` — the
   edge that pulls `next-auth`. The pin test now mocks the same five edges (see Code details);
   the real `npm ci` removed the underlying trap.
2. *Dropped import, invisible to a structural test.* The split dropped `declareNinaFolders` from
   the folder module's import list; vitest surfaced it first as `declareNinaFolders is not
   defined` in one folder test (call-time, so `Object.keys` pins passed straight through it),
   and `npx tsc --noEmit` enumerated it as the only error in the tree. Fixed by adding the
   import.

**Key evidence locations:** `lib/admin/ninaAlbumActions.ts` (the barrel and its header rules);
`tests/admin.albumActionsBarrel.test.ts` (the pin and its mock-set rationale);
`lib/admin/ninaAlbumDeferredDescribe.ts` (the plain-module scheduler); the eight re-pointed
citations at `lib/admin/chatPhotoActions.ts`, `lib/admin/folderOps.ts`, `lib/nina/queries.ts`,
`lib/nina/vision.ts`, `tests/nina.photoRefs.test.ts`.

**Session identity:** worker session `tokenmax-admin-album-actions-split`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-admin-album-actions-split`; final commit `6c2e583`; NOT merged at time
of writing — the coordinator owns the merge to main.
