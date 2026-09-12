# Token-Maxxing Session — 2026-09-12: components/ui package_readme (the reverse-wiring map)

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-12`**
> (worker `pkg-readme-ui`, renamed `tokenmax-pkg-readme-ui`; the branch keeps
> the original slug) — the last unwritten map in the components tree. The
> same-day `ui-primitives-yagni` sweep had cleaned `components/ui` of dead
> exports and its session doc explicitly deferred the readme: *"the
> directory's readme is another session's assignment."* This is that
> session. At **5,213 lines** `components/ui` is the single largest component
> directory, and it was the one directory whose reverse wiring had never
> been mapped — 77 files outside it import from it, and every one of those
> consumers has been answering *"which primitive, imported how, from
> where?"* by grepping. The map answers it once, measured.

## 🎯 Achievement / End Result
- **Goal of the burn:** Write `components/ui`'s **first** `package_readme.md`
  — the directory the ui-primitives-yagni session named as the follow-on
  assignment — with the **reverse-wiring map** as the centerpiece: for every
  export, who consumes it, through which import grammar, from which package.
- **Concrete changes:** one work commit, `fbcb1db` — *"docs(components/ui):
  first package_readme — the reverse-wiring map for the primitives kit"* —
  **2 files, +549/−2**: a new 547-line
  `components/ui/.workflows/package_readme.md`, plus the session's one
  non-readme file, a comment-only drift fix in `components/ui/AppShell.tsx`.
  (Doc commit for this session log follows separately.)
- **Real value delivered:**
  - **The map itself.** A module-resolved import graph over the whole repo —
    resolving the `@/` alias, relative imports, and through-barrel names
    (the four-trap discipline from the dead-export sweeps) — measured
    **2026-09-12 at `6759f26`**:
    **77 external importing files** (72 production + 5 test);
    **42 import through the barrel**, **45 by direct path**,
    **10 do both**; **all 35 exports have ≥1 external consumer**;
    **15 names are barrel re-exports, 20 are direct-path-only** — and the
    20 are not accidents but **four deliberate groups** (server-bound/
    audited, not-yet-pulled-through, mount-site surfaces, hooks+types),
    each documented with its reason.
  - **The by-package census**, so a consumer knows what its neighbours
    already do: `components/admin` 20 files, `components/nina` 13,
    `components/review` 7, `components/profile` 5, `components/charts` 4,
    `components/extract` 3, `app/nina` 4, and a long tail of 1–2-file
    packages, plus `tests/` — each row naming what that package reads most
    (`Button` ×15-of-20 admin files, `CONTROL_CLASS`, `EmptyState`,
    `PhotoViewer`/`useSavePhoto` for nina, …).
  - **Five text-guard suites enumerated** as the directory's real
    enforcement layer — `tests/share.bundle.test.ts` (barrel and
    `AppShell`/`TabBar` stay out of the share route's graph),
    `tabbar.geometry.test.ts` (height constants vs the source's
    `h-[39px]`), `ui.sheetFocus.test.ts`, `ui.photoViewer.test.ts`,
    `nina.sidebarProvider.test.ts` — properties no runtime test can carry,
    now written down where a refactorer will look before breaking them.
  - **One drift fixed at source:** `AppShell.tsx`'s Server-Component
    comment claimed *"nine pages, a layout and two loading states"* import
    it; the measured truth is **eight pages and two loading states — 10
    files, and no layout exists** (`app/(app)/` holds only `loading.tsx`
    and `page.tsx`). Fixed in the same commit.
  - **Every count stamped** *"measured 2026-09-12 at `6759f26`"* — the
    repo's write-rules-not-state discipline applied from birth, so the map
    announces its own staleness horizon instead of quietly becoming a
    fossil.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-ui` (coordinator-assigned
  worker branch; measurement point `6759f26`, work commit `fbcb1db`).
- **Merge status:** merged (commit `e0c2b70`)
- **Approx token burn:** high (~0.5M est., input-dominated — 16 source
  modules + the barrel read in full, a ~1,300-line sibling readme absorbed
  for house style, and a full repo import graph built and cross-checked). 🔥

## Context & Motivation

The 2026-09-12 fan-out had already swept `components/ui` for dead code
(`ui-primitives-yagni`, commit `dba8f17`) and found the tree unusually
clean — but that session's doc ended with an explicit deferral: the
directory had **no package_readme at all**, and writing one is a different
job than pruning one. Meanwhile the root readme compaction and the
lib-db/lib-admin compactions had all re-learned the same lesson: a package
readme is loaded into context by every future session that touches the
package, so its cost/benefit hinges on whether its claims are *measured*.

`components/ui` is the worst possible place to keep paying the grep tax:
5,213 lines, 17 files, and the shared vocabulary of every surface in the
app — buttons, cards, fields, chips, sheets, the app shell. 77 external
files import from it. None of that wiring was written down anywhere; the
barrel's self-description covers its own re-exports and nothing more.

Worker mode: the coordinator pre-assigned the idea, gave the session its
own branch and slug, and owns the landing. The method followed the
`/update-readme` skill (the repo's package-readme skill), adapting its
Go-flavored section skeleton to a TSX component kit.

## What We Did (blow-by-blow)

1. **Invoked `/update-readme`** and read it as the contract: sections are
   load-bearing only if every claim in them is measured. Its structure
   (overview, module map, dependencies, reverse deps, concurrency, errors,
   performance, usage/gotchas, doc log) was kept; its Go-package idioms
   were translated to TSX (client components, `'use client'` boundaries,
   co-located happy-dom suites, text-guard suites).

2. **Read all 16 source modules + the barrel in full** before writing a
   word — no grep-summarized understanding. This is what lets the component
   notes section record *decisions* (why `CONTROL_CLASS` is deliberately
   not used by the admin tables; why `Toast` is deliberately unwritten)
   rather than *inventories*.

3. **Built the reverse-wiring map with a throwaway node script**: a
   module-resolved import graph over the whole repo, resolving the `@/`
   alias, relative imports, and names that reach ui only through
   `index.ts`'s re-exports — deliberately defeating the four known
   verifier traps from the dead-export sweeps (twin names, relative-import
   twins, through-barrel attribution, multiline import lists). Output
   cross-checked: 77 external importing files, 42 through the barrel,
   45 direct-path, 10 both (42 + 45 − 10 = 77 ✓), 35/35 exports with ≥1
   external consumer.

4. **Classified the 20 direct-path-only exports** into four deliberate
   groups — server-bound/audited, not-yet-pulled-through, mount-site
   surfaces, hooks+types — so the split reads as policy, not neglect.

5. **Censused consumers by package** (admin 20 files, nina 13, review 7,
   profile 5, charts 4, …) and, per package, *what it reads most* — the
   column that turns the census from a count into a briefing.

6. **Wrote the 547-line readme**: overview + the two import-graph rules;
   a module map of all 17 files; the two import grammars (barrel vs
   direct path) with when each applies; the full per-symbol reverse-wiring
   table (35 rows, files-not-call-sites, stated as such); component notes
   per family — buttons, surfaces, forms, pills, absence, run-domain
   (`SplitsTable`/`ZoneBar`/`FlagList`), chrome (`TabBar`/`AppShell`/
   `ScreenHeader`), overlays (`Sheet`/`PhotoViewer`/`DetailPanel`/
   `RunDateLink`), hooks — each recording the load-bearing decisions a
   consumer inherits; dependencies (including `AppShell`'s one deliberate
   backward arrow into `components/nina`); reverse dependencies by
   package; concurrency/effect hygiene; error handling; performance;
   usage patterns + **15 gotchas (Do-NOTs)**; notes (the YAGNI verdicts
   on record, `Toast` deliberately unwritten, duplication accepted —
   `SplitsTable`/`ZoneBar` twins and all); and a documentation log.

7. **Found and fixed the one drift the measurement exposed** — the only
   non-readme file touched: `AppShell.tsx`'s comment claimed "nine pages,
   a layout and two loading states" import it. Measured: **eight pages,
   two loading states, 10 files, no layout** (`app/(app)/` contains only
   `loading.tsx` and `page.tsx`). Before fixing, verified no text-guard
   pins that comment — `nina.sidebarProvider.test.ts` asserts provider
   *structure* only — so the fix cannot break a suite.

8. **Ran the gates, before and after.** Suite measured green *before
   writing* (vitest `components/ui`: **203/203 across 16 files** at
   `6759f26`) and re-measured *after* the comment fix: **273/273** across
   `components/ui` + the five suites that read these files as text
   (`nina.sidebarProvider`, `share.bundle`, `tabbar.geometry`,
   `ui.sheetFocus`, `ui.photoViewer`). `prettier --check` clean on both
   changed files; `eslint` clean on `AppShell.tsx`.

9. **Committed as `fbcb1db`** by pathspec, verified via `--stat`
   (2 files, +549/−2), then wrote this doc and stopped. No merge, no
   push — the coordinator lands.

## Code / Design Details

**The readme's spine** (section offsets measured in the committed file):

| Section | Lines | What it carries |
|---|---|---|
| Overview | 12–64 | what the kit is, the two import-graph rules, the measure stamp |
| Module map | 65–90 | all 17 files, one line of "why it exists" each |
| The two import grammars | 91–120 | barrel vs direct path, and when each is the right choice |
| **The reverse-wiring map** | 121–175 | the 35-row per-symbol consumer table |
| Dependencies | 176–218 | external deps + the internal graph, incl. AppShell's backward arrow |
| Reverse deps by package | 219–244 | the census table + the five text-guard suites |
| Component notes | 245–380 | nine families, decisions per family |
| Concurrency / Errors / Performance | 381–424 | effect hygiene, the save-photo failure story, image budget notes |
| Usage | 425–461 | importing patterns, the patterns the kit expects |
| Gotchas | 462–505 | **15 Do-NOTs**, each with its reason |
| Notes / Documentation log | 506–547 | YAGNI verdicts on record, `Toast` unwritten, accepted duplication |

**The headline table row, as a specimen of the map's shape:**

```
| Button | 27 | admin ×15 (FileExplorer, FolderMenu, ImageGenPanel, …);
                  auth ×2 (SignInCard, SignOutButton); extract (UploadPicker);
                  nina ×3; profile (ProfileForm); push (PushSetupCard);
                  review ×3; share (ShareLinkPanel) |
```

**Why the comment fix belonged in this commit.** A docs session that
*fixes code* stops being a docs session — so the fix is comment-only, it
is the one drift the measurement itself surfaced, and it is fixed *at
source* rather than documented-around. The readme must not paraphrase a
comment the source contradicts; with the source corrected, both say the
same measured thing: ten importing files, no layout in `app/(app)/`.

**Measure stamps as a load-bearing device.** Every volatile count — the
77/42/45/10 split, the 35-export liveness, the per-package census, the
203-test baseline — is stamped *"measured 2026-09-12 at `6759f26`"*.
The map table's preamble also states its own semantics and update rule:
counts are **files, not call sites**; when you add a consumer, move the
count; when a count surprises you, re-measure it before trusting either
state.

## Decisions & Trade-offs

- **Measured-everything discipline.** Every number in the readme comes
  from one import-graph script run, not from the barrel's
  self-description. The one number *not* re-derived — the barrel's own
  "32 client components import it" claim — was left untouched on purpose:
  re-deriving its exact population (client-only) was out of scope, the
  claim is internally consistent, and a docs session that re-audits the
  barrel has lost its plot. Recorded as the first follow-up instead.
- **Files, not call sites.** The map counts files and says so. A call-site
  count would be more precise and roughly 5× less maintainable; a file
  count answers the question a consumer actually has ("who depends on
  this?") at a cost that survives contact with the next refactor.
- **Exactly one source file touched beyond the readme.** Scope
  discipline: the AppShell comment was measured-wrong and is on the map's
  critical path (it describes the map's own subject), so it was fixed;
  everything else observed-but-out-of-scope was written down, not
  edited. A docs session that "fixes" code stops being a docs session.
- **Source docstrings outrank the readme on conflict** — stated in the
  readme itself. The readme is the map, not the law; when they disagree,
  the source is right and the map is stale, and the stamps make the
  staleness visible.
- **The four-trap import resolution over a name grep.** The same
  discipline as the dead-export sweeps, applied to a positive task:
  without through-barrel resolution, the 15 re-exported names would have
  looked dead and the map would have lied in its headline table.

## Follow-ups & YAGNI notes

- **The barrel's "32 client components" count** should be re-derived with
  its own population definition next time someone is in `index.ts` —
  deliberately not done here (see Decisions).
- **`Card.test.tsx:90`'s pre-existing `react/no-unescaped-entities`
  pair** (recorded by the yagni sweep) still on main at this branch's
  measurement point — left alone; a lint nit in a test file is not a
  docs session's cargo.
- **The `TAB_BAR_*` test-seam keep-verdict** remains conditional on
  `tests/tabbar.geometry.test.ts`'s location: if that suite ever moves
  inside the directory fence, the seams become ordinary internals and
  the verdict should be re-litigated.
- **A 36th export wants its row.** The readme states the update rule —
  new export → new map row, stamped with its own measure date. The map
  is designed to be extended in one place.
- **Not done, deliberately:** no code changes beyond the one comment; no
  barrel edits; no touching the sibling readmes; no reformatting of
  neighbouring files.

## Appendix

**Commands run this session (representative):**

```bash
# the baseline gates, before writing
npx vitest run components/ui            # 203/203, 16 files, at 6759f26

# the reverse-wiring measurement (throwaway node script, kept out of git)
#   - resolve @/ alias + relative imports + through-barrel names
#   - 77 external importing files (72 prod + 5 test), 42 barrel / 45 direct / 10 both
#   - 35/35 exports with ≥1 external consumer

# drift check behind the AppShell comment fix
ls 'app/(app)/'                          # loading.tsx, page.tsx — no layout
git grep -n 'nine pages' -- components   # only the AppShell comment
npx vitest run tests/nina.sidebarProvider.test.ts   # structure-only, unpinned

# post-fix gates
npx vitest run components/ui tests/nina.sidebarProvider.test.ts \
  tests/share.bundle.test.ts tests/tabbar.geometry.test.ts \
  tests/ui.sheetFocus.test.ts tests/ui.photoViewer.test.ts   # 273/273
npx prettier --check components/ui/.workflows/package_readme.md components/ui/AppShell.tsx
npx eslint components/ui/AppShell.tsx    # clean

# commit + verification
git add <doc> components/ui/AppShell.tsx components/ui/.workflows/package_readme.md
git commit -- pathspec...
git show --stat fbcb1db                  # 2 files, +549/−2
```

**Gate results:** `components/ui` 203/203 pre-write; 273/273 across ui +
the five text-reading suites post-fix; prettier clean on both changed
files; eslint clean on `AppShell.tsx`.

**Work commit (on `token-maxxing-2026-09-12-pkg-readme-ui`):**

```
fbcb1db docs(components/ui): first package_readme — the reverse-wiring map for the primitives kit

 components/ui/.workflows/package_readme.md | 547 +++++++++++++++++++
 components/ui/AppShell.tsx                 |   4 +-
 2 files changed, 549 insertions(+), 2 deletions(-)
```

**Branch:** `token-maxxing-2026-09-12-pkg-readme-ui` — merged
(commit `e0c2b70`).
