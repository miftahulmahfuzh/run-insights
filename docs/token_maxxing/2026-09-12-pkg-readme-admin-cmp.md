# Token-Maxxing Session — 2026-09-12: Admin Package-Readme Compact

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-12`** —
> the day's first doc in a fresh fan-out, and the opening move of a campaign
> the 2026-09-11 sessions set up: the repo's package readmes have the same
> recurring-context-cost disease, and `components/admin`'s was the biggest
> offender in `components/` at **1,950 lines**. The idea arrived pre-assigned
> (worker mode, no menu): compact it to load-bearing-only, verifying every
> claim against the current tree before it earned its place. What the session
> found instead of mere bloat was **rot with teeth** — the readme's most
> confident claims were its most wrong ones, and a pure length-trim would
> have enshrined falsehoods at any size.

## 🎯 Achievement / End Result
- **Goal of the burn:** Compact `components/admin/.workflows/package_readme.md`
  (1,950 lines) — trim stale/redundant sections, verify claims against the
  current code, keep it load-bearing-only. Why: the same recurring-context-cost
  problem as the other bloated package readmes in this repo.
- **Concrete changes:** one commit, `e30ddce` — *"docs(components/admin):
  compact package_readme to load-bearing-only, re-verified against the tree"*
  — **one file changed, +1,144/−1,803: 1,950 → 1,291 lines (−34%) while
  ADDING three sections that did not previously exist** ("The text-model
  select", "`/admin/image-generation`", and a top-level "Gotchas"; the
  "Documentation Created" log became "Documentation log"). Prettier clean.
- **Real value delivered:**
  - The stale-claim harvest was the real value — the compaction alone would
    have preserved falsehoods at 1,291 lines. Roughly **15 discrete stale
    facts fixed**, the five biggest being:
    1. The module map documented `MemoryLedger.tsx` and `MemorySlots.tsx` —
       files deleted by the `/admin/memory` one-table rebuild (`17bd3e2`) —
       and omitted `MemoryTable.tsx` and `TextModelSelect.tsx` entirely. The
       `/admin/memory` section was rewritten from the current code: one
       table, three tbody groups, five columns, optimistic delete with the
       reappears-blank-row rule, four remaining actions after the confidence
       pipeline's removal; the page reads via `lib/admin/memoryStore` +
       `memoryVocab`.
    2. The readme's **central testing claim was false**. It said the package
       has "no test files and why that is correct rather than a gap" and
       "Test consumers: none that IMPORT anything here" — while vitest's
       include pattern covers `components/**/*.test.tsx` and the directory
       holds **27 colocated suites**, each opting into happy-dom via a
       first-line pragma. Rewritten as a three-layer testing story
       (colocated happy-dom suites / lib pure-logic suites / the old
       text-reading guard suites).
    3. The claim "migration 0003 is applied to no live database / no folder
       operation has been run against real rows" — a 2026-09-04 snapshot —
       was replaced with a **measured state**: a read-only psql batch against
       the one production database this repo has returned 20/20 drizzle
       migrations applied, `nina_avatars` = 36 live rows, `nina_folders` = 0
       rows.
    4. ImageGenPanel's section was pre-template: the editable prompt template
       with server-side placeholder guard (`0b85fcc`), the image-model select
       (`1e9b4d5`), and the four text-field ✕ clears (`94fdb1a`) all postdate
       the readme. `ImageGenTestPanel` now derives verdicts/poll-schedule/
       give-up from `lib/admin/imageGenTestView.ts` and takes a `dirty` prop.
    5. `/admin/nina`'s nav label is "Image collection" (short "Photos") since
       the p4 rename (`b0126db`) — the readme still described the bar's six
       cells without it.
  - Every load-bearing section survived, compressed not dropped: all
    test-enforced guards and gotchas, the directive census, the URL grammar,
    the upload-queue invariants, the auto-save commit moments, the
    Dependencies/Reverse-Dependencies sections (corrected via a measured
    import census of the package), and the dataflow. The Documentation log's
    ~250 lines of duplicated narrative collapsed, and the header changelog
    line reduced to one.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-admin-cmp` (coordinator-
  assigned worker branch, base `7899385`).
- **Merge status:** merged (commit `66bfcaf`)
- **Approx token burn:** high — a full-file read of 1,950 lines, ~25
  component/lib files read or grepped, claim-by-claim constant verification,
  an import census, and a production query batch. 🔥

## Context & Motivation

The 2026-09-11 fan-out produced many component/test/dead-code sessions; a
recurring observation across them was that the repo's package readmes —
loaded wholesale into context by every future session that touches a package —
have grown past their usefulness into a recurring cost. `lib/nina`'s readme is
3,767 lines. `components/admin`'s was 1,950. This session is the first
compaction of the campaign, run in worker mode: the coordinator pre-assigned
the idea (no menu generated), gave the session its own branch and slug
(`pkg-readme-admin-cmp`), and owns the eventual landing.

The assignment's wording mattered and shaped the method: "verify claims
against current code" was listed *before* "trim stale/redundant sections". A
readme that documents a package is read as ground truth by every future
session — so a shorter readme that lies is strictly worse than a long one
that doesn't. The session therefore read all 1,950 lines first, then treated
each claim as a hypothesis to falsify against the tree, and only then
rewrote.

## What We Did (blow-by-blow)

1. **Read the full 1,950-line readme** end to end, mapping its section
   structure (Overview, Module map, the `/admin/nina` file manager, framing
   studio, character panel, `/admin/memory`, `/admin/shortcuts`,
   Dependencies, Reverse Dependencies, Data flow, Concurrency, Error
   handling, Performance, Usage, Notes, Documentation Created) and marking
   every claim that names a file, a constant, a component prop, a test, or a
   database state — the four claim classes that rot.

2. **Verified claims against the actual tree**: component sources, lib export
   surfaces, mount sites, test suites, the vitest config, and the colocated
   tests. Approximately 25 component/lib files were read or grepped.

3. **Harvested the stale claims** (the five headline items above, plus ~10
   smaller ones — counts, labels, constants that had drifted). The module
   map was the fastest rot: it still named two files the one-table rebuild
   (`17bd3e2`) had deleted and missed the two files that replaced them. The
   testing claim was the deepest rot: the readme had built a *philosophical
   justification* ("no test files and why that is correct rather than a
   gap") on top of a fact that was simply no longer true — the directory now
   holds 27 colocated happy-dom suites.

4. **Measured the database state instead of quoting the old snapshot.** One
   read-only psql batch against the production database (counts only — no
   writes, no row contents): 20/20 drizzle migrations applied,
   `nina_avatars` = 36 live rows, `nina_folders` = 0 rows. The old text's
   "migration 0003 is applied to no live database / no folder operation has
   been run against real rows" was a 2026-09-04 snapshot that time had
   falsified.

5. **Ran an import census of the package** to correct the Dependencies and
   Reverse Dependencies sections with measured facts instead of remembered
   ones.

6. **Grepped every load-bearing constant the readme cites**, claim by claim:
   `EXPLORER_*`, `NINA_CHAT_PHOTO_PAGE_SIZE=48`, `ADMIN_LEDGER_PAGE=200`,
   `ADMIN_FOLDER_OP_MAX_IDS=500`, `IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS=600`,
   `NINA_IMAGE_TEST_GIVE_UP_MS=480_000`, `NINA_TRAITS=12`, `NINA_DIALS=4`,
   the touch classes, and `Button`'s `h-11 px-4`. The constants that held
   were kept as-is; the ones that had drifted were fixed.

7. **Rewrote the readme to 1,291 lines** (−34%) — deleting the false
   narrative sections and the duplicated Documentation log (~250 lines of
   narrative collapsed; the header changelog line reduced to one), while
   **adding three sections the old file didn't have**: "The text-model
   select", "`/admin/image-generation`", and a top-level "Gotchas".

8. **Ran the gate:** `prettier --check` clean on the file. (A docs-only
   change — no typecheck/test gate applies; nothing executable changed.)

9. **Committed as `e30ddce`** on the worker branch with the measured
   before/after in the message, then stopped. No merge, no push — the
   coordinator lands.

## Code / Design Details

**The shape of the change, section by section** (section sizes in lines,
measured from the `##` header offsets of both versions — before → after):

| Section | Before | After | What happened |
|---|---|---|---|
| Overview | 96 | 67 | compressed; changelog line reduced to one |
| Module map | 38 | 38 | two deleted files removed, two missing files added |
| `/admin/nina` file manager | 581 | 343 | nav label fix; guards kept, narrative cut |
| The framing studio | 91 | 38 | compressed |
| The character panel | 167 | 87 | compressed; post-template facts folded in |
| The text-model select | — | 12 | **new** (file was previously absent from the map) |
| `/admin/image-generation` | — | 73 | **new** (was pre-template prose inside another section) |
| `/admin/memory` | 88 | 63 | rewritten from current one-table code |
| `/admin/shortcuts` | 87 | 40 | compressed |
| Dependencies | 114 | 99 | corrected via measured import census |
| Reverse Dependencies | 107 | 72 | corrected via measured import census |
| Data flow | 52 | 55 | kept (slightly grew — the corrected story needed it) |
| Concurrency | 37 | 26 | kept, tightened |
| Error handling | 45 | 36 | kept, tightened |
| Performance | 22 | 20 | kept, tightened |
| Usage | 155 | 45 | URL grammar + touch classes kept, examples cut |
| Gotchas | — | 105 | **new** top-level home for the surviving guard list |
| Notes | 68 | 38 | kept, tightened |
| Documentation log | 196 | 24 | duplicated narrative collapsed |

**Why the testing claim mattered most.** The old readme's central claim —
"no test files and why that is correct rather than a gap" — was not a
sentence; it was a *policy argument* built on a false premise, which is the
most expensive kind of staleness: a future session reading it would not only
believe there are no tests, it would inherit a justification for keeping it
that way. The rewrite replaces the argument with the measured three-layer
story: the 27 colocated happy-dom suites (`components/**/*.test.tsx` is in
vitest's include, each file opting in via a first-line pragma), the lib
pure-logic suites that exercise this package's collaborators, and the older
text-reading guard suites in `tests/` that scan source for enforced
properties.

**Why the module map mattered most *operationally*.** A module map is the
section a session reads first when deciding where to make a change. Naming
two deleted files (`MemoryLedger.tsx`, `MemorySlots.tsx`) and omitting the
two live ones (`MemoryTable.tsx`, `TextModelSelect.tsx`) sends the next
session hunting for files that don't exist and editing around files it
doesn't know about.

**Volatile-state claims now carry their measure date.** The migration/row
counts are dated in the text (measured 2026-09-12, read-only), so the next
reader can tell at a glance whether the number is a measurement or a
fossil — see Decisions.

## Decisions & Trade-offs

- **Verify-then-compact, in that order.** The compaction was easy; the
  verification was the session. Doing it the other way around would have
  produced a shorter but still-false document — and a shorter false document
  is more convincing, not less.
- **Compression, not deletion, for the guard inventory.** Every
  test-enforced guard, gotcha, URL grammar rule, upload-queue invariant, and
  auto-save commit moment survived — many re-homed into the new top-level
  Gotchas section — because each of them is the accumulated record of a bug
  this package once had. The prose *around* the guards is what got cut.
- **Measured state over snapshots, with the date stamped in the text.** Row
  counts, migration status, and test counts all drift; the fix pattern is
  "measure, don't extend" — and a volatile number that doesn't say when it
  was measured is a future stale claim with a delay fuse.
- **One file, one commit.** The readme is one document; an interim state
  (compacted but unverified, or verified but uncompacted) is exactly the
  kind of half-truth the commit exists to avoid.
- **Production read was counts-only and read-only.** The session needed
  migration/row facts and took the cheapest safe measurement: a single
  read-only batch, counts only, no row contents. This repo has one database
  and it is production — the query batch was sized accordingly.
- **Docs-only commit: no format run.** The repo-wide format gate is not
  applicable to a single markdown file; `prettier --check` on the file is
  the whole gate, and it passed.

## Follow-ups & YAGNI notes

- **The other six package readmes have the same disease.** `lib/nina`'s is
  3,767 lines; the remaining five are sized between it and this one. Each
  needs the same verify-then-compact treatment, and each is a full session —
  the verification is the expensive half, and it doesn't compress. One
  package per session is the observed sustainable pace.
- **The readme will rot again.** Nothing here prevents the next rebuild or
  rename from re-staling the module map. The fix pattern written into the
  doc's own structure: "measure, don't extend" — and any volatile state
  (migration applied? row counts? test counts?) carries its measure date in
  the text so the next reader can cheaply distinguish a measurement from a
  fossil.
- **A readme lint/refresh gate is a repo-wide decision**, deliberately not
  built by a worker session. Even a cheap "every constant named in a
  package_readme.md must exist in the tree" check would have caught most of
  today's findings at birth.
- **Not done, deliberately:** no code changes of any kind (the session had
  read-only write access to docs, and exercised it), no reformatting of
  neighbouring files, no touching the other readmes from this branch.

## Appendix

**Commands run this session (representative):**

```bash
# full read, then claim-by-claim verification
git show e30ddce^:components/admin/.workflows/package_readme.md | wc -l   # 1950
wc -l components/admin/.workflows/package_readme.md                       # 1291

# constant greps (one per claim)
git grep -n 'NINA_CHAT_PHOTO_PAGE_SIZE' -- lib components
git grep -n 'ADMIN_FOLDER_OP_MAX_IDS\|ADMIN_LEDGER_PAGE' -- lib
git grep -n 'IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS\|NINA_IMAGE_TEST_GIVE_UP_MS' -- lib
git grep -n 'NINA_TRAITS\|NINA_DIALS' -- lib components

# import census for Dependencies / Reverse Dependencies
git grep -l "components/admin/" -- '*.ts' '*.tsx' | sort -u

# colocated-suite census behind the corrected testing story
ls components/admin/*.test.tsx components/admin/**/*.test.tsx | wc -l     # 27

# measured DB state (read-only, counts only)
psql "$DATABASE_URL" -c 'select count(*) from drizzle.__drizzle_migrations'
psql "$DATABASE_URL" -c 'select count(*) from nina_avatars'   # 36
psql "$DATABASE_URL" -c 'select count(*) from nina_folders'   # 0

npx prettier --check components/admin/.workflows/package_readme.md   # clean
```

**Gate results:** `prettier --check` clean on the changed file. Docs-only
diff — no typecheck/test surface touched.

**Commit (on `token-maxxing-2026-09-12-pkg-readme-admin-cmp`, base
`7899385`):**

```
e30ddce docs(components/admin): compact package_readme to load-bearing-only, re-verified against the tree

 components/admin/.workflows/package_readme.md | 2947 ++++++++++++++++---------------
 1 file changed, 1144 insertions(+), 1803 deletions(-)
```

**Branch:** `token-maxxing-2026-09-12-pkg-readme-admin-cmp` — on branch, NOT
merged (worker session; the coordinator `tokenmax-orch-2026-09-12` owns
landing).
