# Token-Maxxing Session — 2026-09-12: Profile & Share YAGNI Dead-Code Audit

> **Worker session in the day's coordinated fan-out** (coordinator
> `tokenmax-orch-2026-09-12`, worker slug `profile-share-yagni`): the idea was
> pre-assigned rather than picked from a menu, and it is a **YAGNI/dead-code**
> session — the same method yesterday's `components-dead-code-a/b`,
> `lib-admin-dead-exports`, and `lib-db-queries-yagni` sessions ran, applied to
> the one corner of the repo none of them covered. "Found nothing genuinely
> dead" was an acceptable outcome up front; the audit trail is the value, not
> a deletion count.

## 🎯 Achievement / End Result
- **Goal of the burn:** Hunt and remove dead code in `lib/profile`,
  `components/profile`, `lib/share`, and `components/share` — two feature
  pairs that had never had a YAGNI pass and are adjacent untouched territory
  (the profile page hosts the share flow, so they were audited together as
  one estate). Hard boundaries honored throughout: strictly within those four
  directories, **no `package_readme.md` edits** (none exists for any of the
  four dirs — verified), **no production DB**.
- **Concrete changes:**
  - One commit, `8527ba8` — `refactor(share,profile): de-export 7 types no
    module imports` — **4 files, 7 insertions, 7 deletions**. The entire
    change is seven `export` keywords removed from seven type declarations:
    - `lib/profile/schema.ts` — `ProfileFormInput`, `ProfileWrite`
    - `components/profile/ProfileForm.tsx` — `ProfileFormMode`,
      `ProfileFormProps`
    - `lib/share/rotateBlobs.ts` — `RotatablePhoto`, `RotationResult`
    - `components/share/PhotoInclusionList.tsx` — `InclusionPhoto`
  - Zero code deleted, zero renames, zero signature changes, zero behavior
    change — each type is load-bearing *locally* and keeps its job; only the
    speculative `export` keyword went.
- **Real value delivered:**
  - **The estate is measured tight, and the measurement is now on record.**
    All 17 files / 2,506 lines audited: zero dead files, zero dead private
    helpers, zero dead branches, and **22/22 copy constants consumed**. The
    only dead weight in the whole four-directory estate was API surface —
    7 exported types no module imports (every real caller passes structural
    literals), so `export` was speculating on importers that never came.
  - **The export surface is 7 members smaller** (68 export sites → 61,
    measured from git at both ends), so nothing outside these files can grow
    a dependency on those types without a deliberate re-export.
  - **The shared-view flight payload is proven non-redundant:** every field
    of `SharedRunView` was traced to an actual render site on the `s/[token]`
    page — the projection carries no dead weight, which is the finding a
    future "trim the share payload" idea would otherwise have to re-derive.
  - **Two twin-name false leads caught and documented** (`avgHrPctMax`,
    `shareOrigin` — see What We Did), which is the trap the next sweep in
    this area would have hit in exactly the same place.
  - **Four follow-ups found dead-ish but deliberately left, each with its
    reason written down** — three sit behind a `tests/` edit this session was
    forbidden from making, one is a consolidation candidate, not dead code
    (see Follow-ups).
- **Branch:** `token-maxxing-2026-09-12-profile-share-yagni`
- **Merge status:** unmerged — this worker does not merge; the coordinator
  (`tokenmax-orch-2026-09-12`) owns the landing.
- **Approx token burn:** the burn is in the reading, not the writing — 68
  exported symbols each word-boundary-grepped repo-wide, every import edge
  into the 17 modules mapped, all 17 files read in full, plus typegen + tsc +
  eslint + six suites and two full-suite runs. No precise meter; estimate
  ~1.5M. 🔥

## Context & Motivation
The coordinator's idea list named this corner as "adjacent untouched
features": the profile page hosts the share flow, so `lib/profile` +
`components/profile` + `lib/share` + `components/share` form one functional
estate that every previous dead-code session had routed *around* (the
2026-09-11 `components-dead-code-b` sweep explicitly listed
`components/profile` and `components/share` as parallel-session territory and
did not touch them). This session closed that gap.

The constraint set was fixed before the first grep:
- **Strictly the four directories** — anything the audit surfaced that needed
  an edit outside them (including `tests/`) went to the follow-up list, not
  the diff.
- **No `package_readme.md` edits** — moot in practice: none of the four dirs
  has a `.workflows/package_readme.md` at all (verified by `ls`; there are no
  `.workflows/` directories in any of them), so unlike the lib/db and
  lib/nina YAGNI sessions there was no maintenance annuity carrying dead
  exports alive — and equally no doc to update when one died.
- **No production DB** — this session had no reason to touch one; the audit
  is purely static.
- **Null result acceptable** — with 17 smallish files and no readme carrying
  stale claims, a tight estate was the likely outcome; the point was to prove
  it rather than assert it.

## What We Did (blow-by-blow)
1. **Enumerated the sweep's universe.** 17 files across the four dirs —
   `lib/profile/` 2 files (actions.ts 94 ln, schema.ts 131 ln),
   `components/profile/` 5 (BadgeDialog 334, BadgeShelf 240, ProfileForm 218,
   RecordDialog 151, RecordsTable 117), `lib/share/` 7 (config 76, copy 100,
   origin 41, project 161, read 43, rotateBlobs 128, types 111),
   `components/share/` 3 (PhotoInclusionList 167, ShareButton 240,
   ShareLinkPanel 154) — **2,506 lines total** (line count is unchanged by the
   commit: 7+/7−). Pre-commit, these carried **68 top-level export sites**
   (per-file table in the Appendix); each site names exactly one symbol.
2. **Word-boundary grepped all 68 exported symbols repo-wide**, classifying
   every hit as internal (same file), external import, or prose/comment.
3. **Caught two twin-name false leads in the grep's own results** — the same
   trap shape the dead-export-sweep memory warns about, twice in one sweep:
   - **`avgHrPctMax`** looked massively referenced repo-wide, but almost all
     hits are the *field name* on `SessionMetrics`/`SharedRunView` and
     comments about it, plus an **unrelated same-named local variable in
     `lib/metrics/session.ts`** (`const avgHrPctMax = ...`). The exported
     *function* `lib/share/project.ts` exports has exactly one external
     importer: `tests/share.project.test.ts` — production uses it
     intra-module only (line 80 of its own file).
   - **`shareOrigin`** looked like another noise-heavy name; working the hits
     by hand showed its 11 real references are genuine — it is live, not a
     false lead. The lesson recorded is that grep-hit *volume* carries no
     signal either direction in this codebase: one name is inflated by a
     field twin, the other looked noisy and was real.
   After the second case, the sweep **switched methods**: rather than trust
   name-grep classification, it built the **import graph** — every import
   edge into the 17 modules extracted and each imported symbol named — so
   "imported by nobody" became a graph property instead of a grep inference.
4. **Read all 17 files in full** — the step that separates callers from prose
   — checking specifically for: dead branches (none), unused private helpers
   (none), dead copy constants (none — all 22 constants in `lib/share/copy.ts`
   and the REVOKE_*/SHARE_*/PHOTO_* sets are consumed at a render or action
   site), and dead payload weight.
5. **Traced the share flight payload field-by-field.** Via the
   `app/(public)/s/[token]/page.tsx` render, every field of `SharedRunView`
   was confirmed to be actually rendered (or consumed by a rendered
   conditional) — the projection `lib/share/project.ts` builds carries no
   field the page ignores, so there is no "trim the payload" dead weight
   hiding behind the type.
6. **Swept the dynamic-reference channels**: no dynamic string-keyed access
   into these modules exists (no bracket-access dictionaries, no
   `next/dynamic` path strings for these components), so the import graph is
   the complete caller picture.
7. **Checked the findings against every `package_readme.md`** — none of the
   four dirs has one, so nothing documented any of these symbols and no doc
   went stale when they de-exported. (This is also why the sweep could not
   rot a doc by its own change — the guard the lib/db session needed simply
   has no surface here.)
8. **Removed exactly the seven `export` keywords**, one commit. All seven are
   types (`type` aliases / `interface`s); every one is used *inside its own
   file* — `ProfileFormInput` and `ProfileWrite` are the `z.infer` results of
   the two live schemas and feed `toProfileWrite`; `ProfileFormMode` and
   `ProfileFormProps` type the component's own props; `RotatablePhoto` and
   `RotationResult` type the rotate pipeline's input/output;
   `InclusionPhoto` types the inclusion list's row prop. All callers pass
   structural literals and infer — nobody ever named the types from outside.
9. **Verified, then committed.** Fresh worktree, so `npx next typegen` ran
   first — the initial `PageProps` errors were **typegen-missing, not real**
   (a fresh checkout has no `.next` types; the known trap, hit on schedule).
   Then `npx tsc --noEmit` clean, `eslint` clean on the four dirs, and the
   six suites covering these modules green (below). Full suite showed reds in
   `components/admin/MemoryTable.test.tsx` and a framing test that **varied
   between two runs and pass in isolation** — the known parallel-load flake,
   on files this diff cannot reach. Committed as `8527ba8`.

## Code / Design Details

**The entire diff** — seven lines, one pattern:

```diff
 # lib/profile/schema.ts
-export type ProfileFormInput = z.infer<typeof profileFormSchema>
+type ProfileFormInput = z.infer<typeof profileFormSchema>

-export type ProfileWrite = z.infer<typeof profileWriteSchema>
+type ProfileWrite = z.infer<typeof profileWriteSchema>

 # components/profile/ProfileForm.tsx
-export type ProfileFormMode = 'onboarding' | 'edit'
+type ProfileFormMode = 'onboarding' | 'edit'

-export interface ProfileFormProps {
+interface ProfileFormProps {

 # lib/share/rotateBlobs.ts
-export interface RotatablePhoto {
+interface RotatablePhoto {

-export interface RotationResult {
+interface RotationResult {

 # components/share/PhotoInclusionList.tsx
-export interface InclusionPhoto {
+interface InclusionPhoto {
```

Each type keeps its internal role: it still types the schema inference, the
component props, the rotate pipeline, the inclusion rows. The only thing
removed is the ability for a new importer to form, unremarked.

**Why these seven and not the other 61 exports:** every remaining export has
either a production import edge (the functions, constants, and the
`SharedRunView` family imported by `s/[token]/page.tsx` and friends) or is a
deliberate test-pinned seam recorded in the Follow-ups. The seven removed are
exactly the set with **zero import edges anywhere** — and their consumers
pass structural literals, which is itself the smell: when every caller
re-declares the shape instead of importing the type, the exported name is
API surface nobody uses.

**Method notes worth keeping for the next sweep:**
- The import-graph pass is the upgrade over name-grepping: it converts
  "0 grep hits" (which prose mentions can fake in either direction) into "0
  import edges", which dynamic channels can only break — and step 6 rules
  those out.
- Twin names are not a rare hazard here; this sweep hit two in one estate.
  `avgHrPctMax`-style field/function twins mean *any* widely-used domain
  term exported as a helper will grep noisy; classify by import statement,
  never by hit count.
- Copy-constant liveness needs render-site tracing, not grep: `REVOKE_BODY`
  is "referenced" by the confirm-dialog JSX, but a constant can also be live
  via a conditional the page never hits — the `s/[token]` render trace is
  what closed that gap for the SHARE_*/PHOTO_* families.

## Decisions & Trade-offs
- **De-export rather than delete.** All seven types are load-bearing locally;
  deleting them would mean inlining anonymous shapes into signatures —
  restructuring, not targeted removal. Un-exporting gets the whole value
  (the public surface shrinks; new dependencies can't form silently) at none
  of the risk, and leaves any inlining to whoever next edits the file with
  context in hand. Identical ruling to yesterday's `components-dead-code-a/b`
  sessions.
- **Leave-and-note for everything test-only** (details in Follow-ups):
  `profileWriteSchema` and `avgHrPctMax` are exported with zero production
  importers — their only importer is their own test file. Removing either
  requires editing `tests/`, which sits outside this session's four-directory
  write constraint. They are recorded, not touched. This mirrors the
  `components-dead-code-b` ruling on `pollDelayFor`/`insightScopesFor`: a
  fix inside the mandate is done; a fix one file outside it is written down.
- **`SHARE_SHOWS_NOTE` / `SHARE_SHOWS_COACHING_ADVICE` kept despite no
  production reader.** Neither constant's *value* is read by production code
  (the note is stripped at the query layer; coaching advice is absent from
  `readSharedInsight` by omission), but both are deliberate decision
  documentation — `lib/share/config.ts`'s own header commits to them as the
  record of what the share view deliberately does *not* show — and
  `tests/share.project.test.ts` pins both to `false`. Deleting them would
  trade a pinned decision for a smaller export list. Classic leave-and-note.
- **One commit, not seven.** Unlike the lib/db session's four gated commits,
  here every removal is the same one-line mechanical pattern on the same
  kind of symbol (a type), verified by the same gates, with no companion
  lists to update (no readme, no allowlist, no mirror test names these
  types). A single commit is the honest shape of the change and reverts as
  one unit.

## Follow-ups & YAGNI notes
- **`lib/profile/schema.ts`'s `profileWriteSchema` is test-only.** Production
  validates via `profileFormSchema` + the `toProfileWrite` transform, so the
  write-shape re-validation this schema provides is exercised by
  `tests/profile.schema.test.ts` alone. Un-exporting/removing it needs a
  `tests/` edit — outside this session's constraint. A future session should
  decide whether the write shape deserves production enforcement (in which
  case wire it in) or none (in which case the schema and its tests go
  together).
- **`lib/share/project.ts`'s `avgHrPctMax` is exported but imported only by
  `tests/share.project.test.ts`**; production uses it intra-module. Same
  constraint, same decision shape: it could be made file-private with a
  one-line test import change, or kept as the exported-for-testability
  pattern `imageGenTestView.ts` documents. Either is fine; doing nothing
  silently is not.
- **`SHARE_SHOWS_NOTE` / `SHARE_SHOWS_COACHING_ADVICE` stay** — deliberate,
  test-pinned decision documentation per `config.ts`'s own header. Recorded
  here so a future sweep does not re-flag them.
- **`ShareButton.tsx` and `ShareLinkPanel.tsx` both render a near-identical
  read-only, select-on-focus link input.** A consolidation candidate (one
  shared "copy link" field component), *not* dead code — noted for whoever
  next edits either file. It is the only duplication the audit found
  anywhere in the estate.
- **The estate itself is now on record as tight.** A future sweep here
  should start from this doc's per-file export table (Appendix) rather than
  re-enumerating: anything new is by definition post-2026-09-12 and worth a
  look precisely because it is new.

## Appendix

**Commit (this branch):**
```
8527ba8 refactor(share,profile): de-export 7 types no module imports
        4 files changed, 7 insertions(+), 7 deletions(-)
```
Branch tip `8527ba8` sits directly on the coordinator-set merge base
`4fe9d01`; the branch carries exactly this one commit.

**Files touched:**
```
components/profile/ProfileForm.tsx      | 4 ++--
components/share/PhotoInclusionList.tsx | 2 +-
lib/profile/schema.ts                   | 4 ++--
lib/share/rotateBlobs.ts                | 4 ++--
```

**The sweep's universe — all 17 files with pre-commit export-site counts
(measured from git at `8527ba8^`):**

| File | Lines | Export sites |
|---|---|---|
| `lib/profile/actions.ts` | 94 | 3 |
| `lib/profile/schema.ts` | 131 | 9 |
| `components/profile/BadgeDialog.tsx` | 334 | 2 |
| `components/profile/BadgeShelf.tsx` | 240 | 1 |
| `components/profile/ProfileForm.tsx` | 218 | 3 |
| `components/profile/RecordDialog.tsx` | 151 | 1 |
| `components/profile/RecordsTable.tsx` | 117 | 2 |
| `lib/share/config.ts` | 76 | 8 |
| `lib/share/copy.ts` | 100 | 21 |
| `lib/share/origin.ts` | 41 | 2 |
| `lib/share/project.ts` | 161 | 3 |
| `lib/share/read.ts` | 43 | 1 |
| `lib/share/rotateBlobs.ts` | 128 | 3 |
| `lib/share/types.ts` | 111 | 5 |
| `components/share/PhotoInclusionList.tsx` | 167 | 2 |
| `components/share/ShareButton.tsx` | 240 | 1 |
| `components/share/ShareLinkPanel.tsx` | 154 | 1 |
| **Total** | **2,506** | **68 → 61 after the commit** |

`lib/share/copy.ts`'s 21 sites are the copy constants — all 22 constants
consumed (one file exports a non-constant alongside); the high count there
is why the copy-liveness trace was worth doing per-constant rather than
per-file.

**Verification commands run (session) and their results:**
```bash
npx next typegen        # required first: fresh worktree had no .next types
                        # (initial PageProps errors were typegen-missing, not real)
npx tsc --noEmit        # clean
npx eslint <four dirs>  # clean
npx vitest run tests/profile.schema.test.ts tests/share.project.test.ts \
    tests/share.config.test.ts tests/badges.render.test.ts \
    tests/share.bundle.test.ts tests/admin.shareToNina.test.ts
                        # 122/122 across 6 files (51+21+14+19+11+6, measured)
npx vitest run          # full suite: reds in components/admin/MemoryTable.test.tsx
                        # and a framing test, VARYING between two runs, passing in
                        # isolation — the known parallel-load flake, on files this
                        # diff cannot reach
```

**Doc-time re-verification** (done while writing this doc, tree at
`8527ba8`): 68 export sites counted at `8527ba8^` per file from `git show`,
61 at HEAD; the seven removed names confirmed `type`/`interface`-only in the
commit diff; the six suites' `it()` counts re-measured at 122 total;
`profileWriteSchema`, `avgHrPctMax` (function), `SHARE_SHOWS_NOTE`, and
`SHARE_SHOWS_COACHING_ADVICE` importers re-grepped — each confirmed
test-only/intra-module exactly as recorded; all four dirs confirmed to have
no `.workflows/package_readme.md`.

**References:** the sibling YAGNI sessions whose method this applied —
`docs/token_maxxing/2026-09-11-components-dead-code-a.md` and `-b.md`,
`2026-09-11-lib-admin-dead-exports.md`, `2026-09-11-lib-db-queries-yagni.md`;
`lib/share/config.ts`'s header (the decision-documentation contract that kept
the two SHARE_SHOWS_* constants alive); `app/(public)/s/[token]/page.tsx`
(the render trace that cleared the `SharedRunView` payload).
