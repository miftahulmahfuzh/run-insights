# Token-Maxxing Session — 2026-09-13: Admin Explorer YAGNI & Package-Readme Doc-Drift Close

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `admin-explorer-yagni`) pre-assigned one idea
  by the coordinator (`tokenmax-orch-2026-09-13`): "Remove `components/admin/explorer`'s 5
  knip-flagged unused exports (`chatPhotoUpload.ts`, `useFolderUpload.ts`, `model.ts`'s
  `QueueItemState`, `photoReferenceModel.ts`'s `PhotoReferenceTile`) and extend the
  optional-prop-vs-callsite scan from the completed ui-primitives-yagni session to the rest
  of `components/admin`, updating its `package_readme.md`" — billed as a named, concrete,
  ready-to-execute follow-up from an already-completed session. Part 1 of that assignment
  was exactly as described. Part 2 was not: the premise had already been fulfilled by a
  sibling worker in the *previous day's* fan-out, and re-running it would have re-litigated
  a settled, landed verdict. The session did the part that was real and, in place of the
  part that wasn't, found and closed the actual gap the false premise was gesturing at.
- **Concrete changes:** 2 commits, 5 files total:
  - `chore(admin): un-export 5 knip-flagged dead exports in explorer` (`7727f6d`) — 4 files,
    +5/−5: dropped the `export` keyword (code kept, nothing deleted) on
    `ADMIN_CHAT_PHOTO_QUALITY` + `encodeChatPhotoJpeg` (`chatPhotoUpload.ts`),
    `EXPLORER_UPLOAD_CONCURRENCY` (`useFolderUpload.ts`), `QueueItemState` (`model.ts`), and
    `PhotoReferenceTile` (`photoReferenceModel.ts`).
  - `docs(admin): close package_readme doc-drift left by the 2026-09-12 optional-prop sweep`
    (`83a262e`) — 1 file, +30/−7: fixed the two stale claims in
    `components/admin/.workflows/package_readme.md` that the 2026-09-12 optional-prop
    sweep's changes had left behind, updated the header "Last Updated" line, and added a
    dated Documentation-log entry explaining why the scan itself was *not* re-run.
- **Real value delivered:**
  - **Part 1 delivered exactly as assigned:** 5 exports verified by repo-wide grep as used
    only within their own declaring file (zero importers elsewhere, no barrel re-export, no
    name-twin collision), then un-exported — same verdict shape (drop `export`, keep the
    code) as the ui-primitives-yagni pass's `AppShellScreen`/`SheetProps`/`PanelParam`.
  - **Part 2's honest finding is the session's real contribution: the assigned premise was
    already false.** The "extend the scan to the rest of components/admin" half of the
    assignment had already been executed in full by a sibling worker in the *2026-09-12*
    fan-out (`2026-09-12-admin-optional-props.md`, commit `1fec595`, merged via `cb210af`)
    — all 73 components, 1,132 callsites, the same positively-controlled TS-AST classifier
    method, headline verdict "zero dead exports in the whole directory" at the export
    level, plus 8 dead props removed and 3 dead glyphs deleted. Verified via
    `git merge-base --is-ancestor 1fec595 HEAD` (true) and by re-reading the current source
    of all five files that verdict touched, confirming they match the commit exactly. This
    is the repo's own documented `main-may-have-shipped-the-requirement` pattern, caught
    *before* spending a scan re-proving a settled answer.
  - **Redirected to the real, still-open gap the false premise was reaching for.** The
    2026-09-12 sweep's own Follow-ups explicitly deferred its package-readme update ("another
    session's assignment"), and the readme had in fact been compacted by a *third* sibling
    worker the same day (`2026-09-12-pkg-readme-admin-cmp.md`, commit `e30ddce`, 06:00:05) —
    hours *before* the optional-prop sweep landed at 13:22:46 — so the compaction
    structurally could not have captured the sweep's results. Grepped every readme claim
    connected to the sweep's changes and found exactly two stale spots (everything else was
    already terse enough to have said nothing the sweep invalidated): the `photoIcons.tsx`
    module-map row still calling the now-deleted `EyeIcon` "exported with no consumer
    today", and a `ts` code sample still showing `export const EXPLORER_UPLOAD_CONCURRENCY
    = 4` for a constant un-exported by that same sweep (and independently, by this
    session's own Part 1). Both fixed.
  - **Full verification held across both parts:** `npx tsc --noEmit` clean (only the
    worktree's known pre-existing missing-typegen `PageProps`/`LayoutProps`/`RouteContext`
    noise); `npx knip --include exports,types` shows zero remaining hits anywhere under
    `components/admin`; `npx vitest run components/admin` 448/448 after each part; `npx
    eslint` clean on all five touched files; `npx prettier --check` clean on the readme.
    Final whole-repo gate: `npx vitest run` — 332 test files, 5744 tests, all green, zero
    flakes (the documented MemoryTable add-row parallel-load flake did not appear this run).
- **Branch:** `token-maxxing-2026-09-13-admin-explorer-yagni`
- **Merge status:** unmerged — on branch, awaiting the coordinator (`tokenmax-orch-2026-09-13`)
  to land it. Per Worker Mode rules this session does not merge or push its own branch.
- **Approx token burn:** moderate (est. **~0.2M**) — dominated by the repo-wide-ancestry and
  cross-session-doc archaeology needed to prove Part 2's premise false (git log timestamp
  comparison across three sibling commits, `merge-base --is-ancestor`, re-reading five
  source files against a commit message), rather than by a from-scratch AST scan that Part
  2's redirection made unnecessary. 🔥

## Context & Motivation
2026-09-13 ran as another orchestrated fan-out, structurally identical to 2026-09-12's: a
coordinator session (`tokenmax-orch-2026-09-13`) spawning worker sessions on per-session
branches, each handed one pre-assigned idea rather than choosing from a menu. This worker's
assignment was framed as low-risk — "a named, concrete follow-up from an already-completed
session, ready to execute" — which is exactly the framing that makes a stale premise
dangerous: the assignment was written referencing "the completed ui-primitives-yagni
session" as the scan's *origin*, but by 2026-09-13 the scan had already had a *second*
application the assignment's author didn't know about, landed the very next day after
ui-primitives-yagni by a different worker in the *previous* fan-out.

The repo's own accumulated memory names this exact failure mode —
`main-may-have-shipped-the-requirement`: check origin/main for the requirement, not just
conflicts; a Decisions row whose premise the tree already falsified does not bind. This
session is a clean instance of applying that check *before* spending the scan, rather than
discovering the duplication mid-sweep or, worse, after committing a second "zero dead
exports" verdict that would have contradicted the first one for no reason.

## What We Did (blow-by-blow)

**Part 1 — the exports, done as assigned:**
1. Ran `npx knip --include exports,types` scoped to the assignment's named files and
   confirmed exactly the 5 exports named, no more and no fewer:
   `ADMIN_CHAT_PHOTO_QUALITY` (const, `chatPhotoUpload.ts:58`), `encodeChatPhotoJpeg`
   (function, `chatPhotoUpload.ts:90`), `EXPLORER_UPLOAD_CONCURRENCY` (const,
   `useFolderUpload.ts:66`), `QueueItemState` (type, `model.ts:159`), `PhotoReferenceTile`
   (interface, `photoReferenceModel.ts:61`).
2. Verified each by repo-wide grep before touching anything: all five used only within
   their own declaring file, zero importers elsewhere, no barrel re-export, no name-twin
   collision that could make an un-export silently wrong.
3. Dropped the `export` keyword on all five — code kept, nothing deleted, same verdict
   shape as the ui-primitives-yagni pass's `AppShellScreen`/`SheetProps`/`PanelParam`
   (un-export, don't delete, when the code might still be a private implementation detail
   worth keeping in place).
4. Verified: `npx tsc --noEmit` clean (pre-existing noise only), `npx knip --include
   exports,types` no longer flags any of the five or anything else under
   `components/admin`, `npx vitest run components/admin` 448/448, `npx eslint` clean on all
   four touched files. Committed as `7727f6d`.

**Part 2 — checking the premise before running the scan:**
5. Before writing a single line of AST classifier code, checked whether "extend the
   optional-prop-vs-callsite scan to the rest of components/admin" still held as a
   question worth asking. Searched `docs/token_maxxing/` for prior applications of the scan
   and found `2026-09-12-admin-optional-props.md` — a sibling worker in the *2026-09-12*
   fan-out, assigned almost the identical brief one day earlier: extend the same
   ui-primitives-yagni-born scan (73 components, 1,132 callsites, same
   positively-controlled TS-AST import-graph classifier method) to the *entire*
   `components/admin` directory. Its own landed verdict: **zero dead exports** in the whole
   directory at the export level, plus 8 dead props removed (`CircleFrame` `ring` +
   `className`, `DialSlider` `step` + `disabled`, `ShareToNinaItem` `className` +
   `onOpened`, `PhotoReferencePicker` `disabled`) and 3 dead glyphs deleted (`photoIcons`'
   `EyeIcon`/`ChevronLeftIcon`/`ChevronRightIcon`, 13 → 10 signatures).
6. Confirmed this wasn't a stale doc describing abandoned work: `git merge-base
   --is-ancestor 1fec595 HEAD` returned true — that commit is already an ancestor of this
   very branch, merged into `main` via `cb210af` well before this session started. Then
   re-read the *current* source of every file that verdict touched —
   `CircleFrame.tsx`, `DialSlider.tsx`, `ShareToNinaItem.tsx`, `PhotoReferencePicker.tsx`,
   `photoIcons.tsx` — and all five match the `1fec595` commit message exactly; several of
   their docstrings even cite "2026-09-12 sweep" inline as their own provenance.
7. Concluded: re-running the scan would not find anything the 2026-09-12 sweep didn't
   already find and record — it would re-litigate a settled, landed verdict the repo's own
   memory explicitly flags ("commit `1fec595` — landed, do not re-propose"). This is the
   `main-may-have-shipped-the-requirement` pattern by name: the assignment's premise, true
   when someone wrote it down, had been falsified by the tree before this session read it.
8. Went looking for the real, still-open gap instead. The 2026-09-12 sweep's own Follow-ups
   section was explicit that it deferred its doc side: "no package readme updated (another
   session's assignment)". Checked whether that assignment had since been picked up and
   found `components/admin/.workflows/package_readme.md` compacted by a *third* sibling
   worker the same 2026-09-12 day (`2026-09-12-pkg-readme-admin-cmp.md`, commit `e30ddce`).
9. Compared commit timestamps: `e30ddce` landed at `06:00:05`, while `1fec595` (the
   optional-prop sweep) landed at `13:22:46` — over seven hours *later* the same day. The
   compaction structurally could not have captured a sweep that hadn't happened yet.
10. Grepped the readme for every claim connected to anything the 2026-09-12 sweep changed.
    Found exactly two stale spots — everything else in the readme was already terse enough
    not to assert anything the sweep had invalidated:
    - The `photoIcons.tsx` module-map row still described `EyeIcon` as "exported with no
      consumer today" — that export no longer exists; it was deleted along with
      `ChevronLeftIcon`/`ChevronRightIcon` in the same sweep, 13 → 10 glyphs.
    - A `ts` code sample documenting the upload queue still showed
      `export const EXPLORER_UPLOAD_CONCURRENCY = 4` — that constant was un-exported by the
      same 2026-09-12 sweep, and, independently, by *this session's own Part 1* — the same
      constant, the same verdict, arrived at twice by two different mechanisms (knip here,
      the props-scan's export-level pass there) without either session knowing about the
      other's timing.
11. Fixed both, updated the file's header "Last Updated" line to 2026-09-13 with a one-line
    summary of the fix, and added a dated Documentation-log entry at the foot recording
    precisely why the scan was *not* re-run (already done, already landed, ancestor-verified)
    and exactly what was corrected instead — so a future reader hitting the same assignment
    text doesn't have to redo this archaeology.
12. Verified: `npx tsc --noEmit` clean (same pre-existing noise only), `npx vitest run
    components/admin` 448/448, `npx prettier --check` clean on the file. Committed as
    `83a262e`.

**Final full-suite gate, after both parts:**
13. `npx vitest run` (whole repo): 332 test files, 5744 tests, all green, zero flakes this
    run — the documented MemoryTable add-row parallel-load flake did not surface.
14. `npx knip --include exports,types`: zero remaining hits under `components/admin`.
15. `npx eslint`: clean on all five touched files.

## Code / Design Details

**The two doc-drift fixes**, as they now read in
`components/admin/.workflows/package_readme.md`:
- Module-map row (line 103): `photoIcons.tsx` | **no directive** | "...10 glyphs (`EyeIcon`,
  `ChevronLeftIcon`, `ChevronRightIcon` deleted 2026-09-12: rendered nowhere, imported only
  by this file's own test)."
- Upload-queue code sample (line 191): `const EXPLORER_UPLOAD_CONCURRENCY = 4   //
  un-exported 2026-09-13: zero repo-wide importers` — the `export` keyword dropped from the
  sample to match the real source, with an inline note dating the change.
- Header (line 4): `**Last Updated**: 2026-09-13 (doc-drift fix: the 2026-09-12
  optional-prop-vs-callsite AST sweep ... left two claims stale ... both corrected. Also
  folded in [today's 5 knip-flagged un-exports].)`

**The verdict-provenance chain**, reconstructed and cross-checked before Part 2's redirect
was trusted:
```
2026-09-12-ui-primitives-yagni.md   (scan invented, run on components/ui, names
                                      components/admin as next target)
        │
        ▼
2026-09-12-admin-optional-props.md  (commit 1fec595, merged cb210af — scan run on the
                                      ENTIRE components/admin, 73 components, verdict:
                                      zero dead exports; readme update explicitly deferred)
        │                                      ▲
        │                                      │ (structurally can't have captured
        ▼                                      │  1fec595 — landed 7h+ earlier)
2026-09-12-pkg-readme-admin-cmp.md  (commit e30ddce, 06:00:05 — readme compacted
                                      BEFORE 1fec595 landed at 13:22:46)
        │
        ▼
2026-09-13-admin-explorer-yagni.md  (this session — Part 2 premise checked and found
                                      already-fulfilled; redirected to closing the two
                                      claims e30ddce could not have caught)
```

## Decisions & Trade-offs
- **Verify ancestry before trusting a session doc's claim.** A doc saying a scan already
  ran is not proof by itself — `git merge-base --is-ancestor` against this branch's `HEAD`,
  plus re-reading the actual current source of every file the claimed verdict touched, is
  what turned "a doc says so" into "confirmed against the tree". Cheaper than a re-scan, and
  the only thing that actually rules out the doc describing abandoned or superseded work.
- **Redirect effort to the real gap rather than report a no-op.** The assignment's Part 2
  literally could not be executed as written without re-litigating a settled verdict; rather
  than stopping there or grudgingly re-running the scan anyway, the session found the
  concrete, still-open thread the false premise was actually pointing at (the readme's
  deferred update) and closed it. This is the same shape as the repo's own
  `main-may-have-shipped-the-requirement` guidance: don't let a falsified premise block
  finding the real, adjacent work.
- **Don't touch the export-level or prop-level verdicts from 2026-09-12 at all.** No file
  the 1fec595 sweep touched was re-edited by this session (beyond the readme prose
  describing them) — re-opening a landed, ancestor-verified verdict without new evidence
  would be pure churn.
- **Un-export over delete, again.** Same call as Part 1's own five and as both
  2026-09-12 sessions this one built on: keep code whose only defect is having a public
  export nobody uses, rather than deleting it outright.
- **Scope discipline held.** Nothing outside `components/admin/explorer`'s five named
  exports and the one readme file was touched. No new AST classifier was built or run —
  Part 2's finding was that building one was not warranted, and the session did not build
  one anyway just to have something to show for the assigned brief.

## Follow-ups & YAGNI notes
- **Deliberately NOT done: re-running the optional-prop-vs-callsite scan.** The premise was
  false by the time this session read it; re-running it would re-litigate
  `1fec595`'s landed, ancestor-verified "zero dead exports in the whole directory" verdict
  for no new evidence. If a future session is assigned this same follow-up text again, this
  doc plus `2026-09-12-admin-optional-props.md` should end the question, not restart it.
- **`components/nina` and `components/{extract,auth,push}`** remain open targets for the
  export-level knip sweep, per the repo's ongoing dead-export campaign — unrelated to this
  session's assignment, noted here only because it came up while tracing the scan's
  lineage.
- **The 12 test-only exports the 2026-09-12 admin-optional-props sweep kept "conditional on
  scope"** (their consumers live in root `tests/`, outside that sweep's fence) remain
  conditional. Re-check consumer geography before ever re-classifying them — same condition
  that sweep's own doc recorded.
- **The AST classifier script pattern** (whole-repo TS-AST import-graph, positively
  controlled with synthetic NEVER-SET/VARIATION/ALWAYS-SET probes) has now been built and
  used twice (`components/ui`, `components/admin`) without ever being committed as a
  reusable tool — each session rebuilds it as a gitignored throwaway. This session did not
  build or use one at all, since Part 2 established no new scan was warranted; a third
  from-scratch application (were one ever actually needed) would be the point to reconsider
  committing it, per the admin-optional-props session's own note.

## Appendix

**Files touched** (5 files across 2 commits):
```
components/admin/explorer/chatPhotoUpload.ts    | 4 ++--   (7727f6d — drop export x2)
components/admin/explorer/model.ts              | 2 +-     (7727f6d — drop export)
components/admin/explorer/useFolderUpload.ts    | 2 +-     (7727f6d — drop export)
components/admin/photoReferenceModel.ts         | 2 +-     (7727f6d — drop export)
components/admin/.workflows/package_readme.md   | 30 ++++++++++++++++++-----7   (83a262e)
```

**Verification performed:** repo-wide grep confirming zero non-local importers for each of
the 5 Part-1 exports before un-exporting; `npx tsc --noEmit` clean after each commit
(pre-existing worktree-wide missing-typegen noise only); `npx knip --include exports,types`
zero hits under `components/admin` after Part 1 and re-confirmed after Part 2; `npx vitest
run components/admin` 448/448 after each part; `npx eslint` clean on all 5 touched files;
`npx prettier --check` clean on the readme; `git merge-base --is-ancestor 1fec595 HEAD` →
true; source-vs-commit-message cross-check on `CircleFrame.tsx`, `DialSlider.tsx`,
`ShareToNinaItem.tsx`, `PhotoReferencePicker.tsx`, `photoIcons.tsx`; commit-timestamp
comparison `e30ddce` (06:00:05) vs `1fec595` (13:22:46); final whole-repo gate `npx vitest
run` — 332 test files, 5744 tests, all green, zero flakes this run.

**Session identity:** worker session `admin-explorer-yagni`, spawned by coordinator
`tokenmax-orch-2026-09-13` on 2026-09-13; branch
`token-maxxing-2026-09-13-admin-explorer-yagni`; work commits `7727f6d` then `83a262e`;
unmerged as of this doc's write time — the coordinator lands worker branches, not the
worker itself.

**Related sessions:** `2026-09-12-ui-primitives-yagni.md` (the scan's origin, first run on
`components/ui`, named `components/admin` as the next target); `2026-09-12-admin-optional-props.md`
(the sibling worker that actually executed that next-target scan the day before this
session, commit `1fec595`, merged `cb210af` — the doc that made this session's Part 2 a
premise-check rather than a fresh scan); `2026-09-12-pkg-readme-admin-cmp.md` (the same-day
readme compaction that landed before the optional-prop sweep and so could not capture its
results, commit `e30ddce` — the gap this session's Part 2 actually closed).
