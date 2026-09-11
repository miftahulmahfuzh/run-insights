# Token-Maxxing Session — 2026-09-12: Lib Admin Pkg-Readme Compaction

## 🎯 Achievement / End Result
- **Goal of the burn:** Compact `lib/admin/.workflows/package_readme.md` from 1,300 lines —
  trim the stale and redundant sections and re-verify every surviving claim against the
  current code. Assigned as a `--worker` idea (verbatim intent) under coordinator
  `tokenmax-orch-2026-09-12`: *"Compact lib/admin/.workflows/package_readme.md (1300 lines):
  trim stale/redundant sections, verify claims against current code. Why: same
  recurring-context-cost problem as the other bloated package readmes."*
- **Concrete changes:** One commit — `e9d2dc3` "docs(admin): compact package_readme to
  verified current state (1300 -> 890 lines)" — touching exactly one file,
  `lib/admin/.workflows/package_readme.md`: **651 insertions / 1,061 deletions, 1,300 → 890
  lines (−32%)**, prettier-formatted with the repo config.
- **Real value delivered:**
  - **The recurring-context cost the idea named is paid down structurally, not cosmetically.**
    The largest single recurring load was the inline per-task changelog (~160 lines, 8 dated
    entries — all of it merged history that every future context-load re-pays). It is gone,
    replaced by one Recent Changes entry pointing at `git log -- lib/admin`, where that
    history already lives and is free to skip.
  - **The readme stopped lying about the code.** The file had not been updated since
    2026-09-09 and had missed ~72 commits: it described a memory system with 8 actions and
    four per-kind schemas (reality: 4 actions, one discriminated union), a `tuningActions`
    reset action that no longer exists, a `/admin/photos` route that is gone, 4 of 6 real
    chat-photo actions, 7 of 15 real album actions, and a "no live caller" annotation on
    `avatarRegisterSchema` that a real importer falsifies. Every such claim was replaced with
    the measured present, not softened with hedges.
  - **It directly paid off a follow-up the 2026-09-11 `lib-admin-dead-exports` session left
    open.** That session had unexported 15 types but could not touch the readme (out of its
    assigned scope), so the doc still showed `AdminManifestEntry`, `AdminBatchRegisterResult`
    and `AdminManifestResult` as exports (~lines 367–375) and `FolderUploadPlan<T>` in the
    `planFolderUpload` signature (~line 170). All fixed: the signature now returns the
    exported `PlannedUpload<T>`, and the three `Admin*` result shapes are documented as
    module-private, consumed structurally off the actions' return types — exactly the
    `ReturnType`-shaped follow-through that session recommended.
  - **Coverage went up while the file shrank.** Six modules that had no map row or section —
    `folderOps.ts`, `imageGenTestView.ts`, `textModelActions.ts`, `shareToNina.ts`, plus map
    rows for `imageGenModel`/`imageGenActions` and the `?view=media` switch in `filetree` —
    are now documented, including genuinely non-obvious mechanics that were previously
    written nowhere: write-time photo dedupe (`planChatPhotoAddWrite`'s pinned/hit/original
    plan, the keeper-hash rule, blob release on remove via `releaseBlobIfUnreferenced`),
    chat-photo adoption (`setChatPhotoAsAvatarAction`), and the six folder-maintenance
    actions.
  - **Every claim restated is a claim verified.** Mechanical export extraction across all 24
    `lib/admin` modules, a repo-wide import census of every `@/lib/admin/*` specifier, and
    targeted reads of every module the readme documents — zero claims carried forward on
    trust.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-lib-admin` (session name
  `tokenmax-pkg-readme-lib-admin`)
- **Merge status:** on branch — **NOT merged, deliberately**. The coordinator
  `tokenmax-orch-2026-09-12` owns landing all of the day's worker branches; this session
  reports DONE and goes idle. Branch is 1 commit ahead of its base (`7899385`).
- **Approx token burn:** the defining asymmetry again, in doc form — 24 modules' exports
  extracted, every `@/lib/admin/*` import site in the repo censused per module, every
  documented module read, every load-bearing claim spot-checked against the tree, and an
  890-line document rewritten — all spent on a markdown-only, single-file diff that cannot
  change behavior by construction. The tokens bought trustworthiness, and the payoff recurs
  on every future context-load of this readme. 🔥🔥

## Context & Motivation
Package readmes in this repo are loaded into context by worker sessions to orient
themselves, which makes their size a recurring tax: every session that touches the package
pays for every stale section, every merged-history changelog entry, and every claim that no
longer matches the code — forever, until someone compacts the file. The coordinator had
already identified this as the same disease the other bloated package readmes carry, and
`lib/admin`'s readme was the largest outstanding case at 1,300 lines.

The staleness had a known cause and a known shape. The readme was last substantively updated
2026-09-09 and had missed ~72 commits since — and the two days in between were exactly when
`lib/admin` changed most: 2026-09-11 alone added the admin test suites, the folder-maintenance
actions, the media-collection move into the nina explorer, and the dead-exports sweep. A
verification-pass idea was therefore not generic doc-polish; it was catching a specific
window where the package's map and its territory had diverged furthest.

This was a `--worker` invocation: one assigned idea, no menu, no idea-selection phase. The
scope line was the file itself; the stated Why — recurring context cost — dictated the shape
of the fix (cut what re-pays forever, i.e. merged history and duplicated prose) over a
pure line-count squeeze.

## What We Did (blow-by-blow)
1. **Built the verification base before touching a line of prose.** Mechanically extracted
   the export list from all 24 `lib/admin` modules (`grep "^export"` per file), then ran a
   repo-wide import census of every `@/lib/admin/*` specifier — per-module importer counts
   and file lists. This is the same census discipline as the 2026-09-11 dead-exports audit:
   counts come from the import sites, not from grep hits, so a comment mention can never be
   mistaken for a caller.
2. **Read every module the readme documents, and spot-checked each load-bearing claim.**
   No sentence survived on seniority. Where the old readme asserted an action count, a
   schema shape, a route path, or a caller, the tree was asked directly.
3. **Removed the stale memory-era material.** The readme described 8 memory actions and four
   per-kind delete schemas (`slotRetire` / `promiseRemove` / `factRetract` / `factPurge`);
   reality is 4 actions (`saveSlot` / `insertFact` / `editFact` / `deleteMemoryRow`) and one
   `memoryDeleteSchema` discriminated union. The old two-statement invariant — "the append
   comes first, always" — was dropped as folklore per the code's own header: no surviving
   action writes twice, so the invariant guards a pattern that no longer exists.
4. **Removed deleted mechanisms.** `tuningActions` was documented as 2 actions including
   `resetNinaTuningAction`; reality is 1 — the reset was deleted along with its buttons and
   now exists only in an old plan doc. The whole `/admin/photos` framing was wrong: the
   route no longer exists, the media collection lives inside `/admin/nina`'s explorer, and
   `ADMIN_CHAT_PHOTOS_PATH` is now `'/admin/nina'`.
5. **Corrected the action inventories.** `chatPhotoActions`: 4 documented → 6 real
   (`findChatPhotoDuplicateAction` and `describeChatPhotoAction` added), with the previously
   undocumented write-time dedupe path now written down. `ninaAlbumActions`: 7 documented →
   15 real (the folder-maintenance create/rename/move/delete set, bulk
   `moveNinaAvatarsAction` / `removeNinaAvatarsAction`, `editNinaAvatarDescriptionAction`,
   and `setChatPhotoAsAvatarAction` adoption).
6. **Corrected a false negative.** `avatarRegisterSchema` carried a "no live caller since
   phase 5" annotation; the import census shows `components/admin/explorer/thumbnail.ts`
   imports it. Annotation removed, caller recorded.
7. **Rebuilt the test-consumer picture honestly.** The old list named 6 suites; reality is
   24 `tests/admin.*` suites plus the co-located component tests. The new readme
   deliberately carries **no per-suite test counts** — counts rot on every test-adding
   session — and instead says to ask the suite.
8. **Added the six missing modules** (details in Code / Design Details below), swapped the
   ~160-line inline changelog for the one-entry git-log pointer, kept the
   `update-readme` skill's house structure throughout, and formatted with the repo's
   prettier config.
9. **Gated and committed.** Prettier `--write` with the repo config (run inside the repo),
   `git status` confirming exactly one file touched, commit `e9d2dc3`. No `tsc`/`vitest`
   needed — the diff is markdown-only. Working tree clean after the commit.

## Code / Design Details

**The shape of the change** — one file, net −410 lines, and the shrink is not from
thinning prose: a third of the file was describing code that no longer exists or history
that no longer needs re-reading.

**Stale → verified, the inventory:**

| Claim area | Old readme said | Verified reality |
|---|---|---|
| Memory actions | 8 actions | 4: `saveSlot`, `insertFact`, `editFact`, `deleteMemoryRow` |
| Memory deletes | four per-kind schemas (`slotRetire`/`promiseRemove`/`factRetract`/`factPurge`) | one `memoryDeleteSchema` discriminated union |
| Memory invariant | "the append comes first, always" | folklore — removed by the code's own header; no surviving action writes twice |
| `tuningActions` | 2 actions incl. `resetNinaTuningAction` | 1 (reset deleted with its buttons; lives on only in an old plan doc) |
| Media collection | `/admin/photos` route | route gone; collection inside `/admin/nina`'s explorer; `ADMIN_CHAT_PHOTOS_PATH = '/admin/nina'` |
| `chatPhotoActions` | 4 actions | 6 (`findChatPhotoDuplicateAction`, `describeChatPhotoAction` added) |
| `ninaAlbumActions` | 7 actions | 15 (folder maintenance, bulk avatar move/remove, description edit, chat-photo adoption) |
| `avatarRegisterSchema` | "no live caller since phase 5" | imported by `components/admin/explorer/thumbnail.ts` |
| Test consumers | 6 suites | 24 `admin.*` suites + co-located component tests; counts deliberately not recorded |
| Exported API | `AdminManifestEntry`, `AdminBatchRegisterResult`, `AdminManifestResult` as exports; `FolderUploadPlan<T>` in a signature | all four module-private since `6d9d6f8`/`422daa5`; signature returns exported `PlannedUpload<T>` |

**Coverage added — the six modules that had no map row or section:**
- `folderOps.ts` — folder-maintenance planners: `ADMIN_FOLDER_OP_MAX_IDS = 500`, merge
  refusal, deepest-descendant depth check, `currentPhotoRefusal` / `keepCurrent`.
- `imageGenTestView.ts` — verdict lookup, the phase-not-attempts discriminator, the 480 s
  give-up.
- `textModelActions.ts` — the narrative text model and its `app_settings` store.
- `shareToNina.ts` — `ninaPhotoShareUrl`.
- Plus module-map rows for `imageGenModel` / `imageGenActions`, and the `?view=media`
  switch in `filetree`.

**The changelog replacement** is the idea's Why made literal: ~160 lines / 8 dated entries
of merged per-task history became one Recent Changes entry whose instruction is
`git log -- lib/admin`. History that is queryable does not belong in a file that is loaded
wholesale into context.

**House structure kept** (the `update-readme` skill's): Overview / Module map / Exported
API / Internal Architecture / Dependencies / Reverse Dependencies / Concurrency / Error
Handling / Performance / Usage + Gotchas / Notes / Recent Changes. Compaction changed the
contents, not the shape future readers have learned to navigate.

## Decisions & Trade-offs
- **Verify-then-write, not trim-as-you-go.** The cheaper path — delete obviously-stale
  sections, keep the rest on trust — would have left quieter falsehoods in place (the
  `avatarRegisterSchema` annotation being the canonical example: one line, false, and
  exactly the kind of claim a trim pass waves through). The verification base (export
  extraction + import census + reads) was built first so every kept sentence could be
  re-earned.
- **No per-suite test counts.** Counts are the most rot-prone fact a readme can carry —
  every test-adding session invalidates them. The readme states the suites' extent and
  defers specifics to the suites. A slightly less informative line that stays true beats a
  precise one that is wrong next week.
- **Kept the house section structure.** Compaction is not a reformat; readers' muscle
  memory for where the module map or reverse dependencies live is an asset. Renaming or
  reordering sections would trade a size win for a navigation cost on every future load.
- **Prettier inside the repo, with the repo config.** Formatting a repo file with a
  foreign config from outside the tree produces a diff that fights the repo's own gate —
  the formatting step used the repo's settings in the repo.
- **One commit, one file.** The whole session is a single reviewable doc commit; no
  staged rollout, no partial states. The coordinator's merge risk is a single markdown
  file with no code-adjacent surface.
- **Do not merge; the coordinator owns landing.** Same contract as every worker session in
  these fan-out sets: commit to the worker branch, document, report DONE, go idle. Merging
  from inside a worker while siblings run is the concurrency hazard this workflow exists to
  avoid.

## Follow-ups & YAGNI notes
- **The other bloated package readmes are the same idea, unrun.** The coordinator's Why
  named them ("same recurring-context-cost problem as the other bloated package readmes");
  this session only settled `lib/admin`. The method (export census → import census →
  targeted reads → rewrite with a git-log pointer instead of a changelog) transfers
  directly.
- **The readme now decays from a known-clean base.** Its last update before this was
  2026-09-09 and it missed ~72 commits; the fix that would have prevented the drift is not
  more frequent manual passes but the `readme-updater` agent actually firing on
  lib/admin-touching tasks — worth checking why it undershot for three days if the pattern
  repeats.
- **YAGNI: did not restructure or split the file further.** At 890 lines it is above the
  size where a reader loads it whole without cost, and a future pass could shrink it again
  (the module map could link out to per-module docs). Not attempted: the assigned goal was
  compaction of the existing document, and a doc-split is a different structural decision
  that should be made once, deliberately, for all package readmes — not unilaterally for
  one.
- **YAGNI: did not mechanize the verification.** The export extraction and import census
  were bespoke greps. A small script that emits (module → exports → importers) would make
  the next readme verification pass — here or in any other package — start from evidence
  instead of building it. The dead-exports session noted the same idea; the hard part
  (claim-level verification) stays manual either way.

## Appendix

**Commit (this branch):**
```
e9d2dc3 docs(admin): compact package_readme to verified current state (1300 -> 890 lines)
```
Branch base: `7899385` ("style: prettier the 48 files inherited dirty from before today's
fan-out"). Branch is 1 commit ahead of base. Session name `tokenmax-pkg-readme-lib-admin`;
worker under coordinator `tokenmax-orch-2026-09-12`.

**Diff stat:**
```
lib/admin/.workflows/package_readme.md | 1712 ++++++++++++--------------------
1 file changed, 651 insertions(+), 1061 deletions(-)
```
1,300 → 890 lines (−32%). Working tree clean after the commit; `git status` confirmed
exactly one file touched.

**Verification performed (the evidence base):**
```
grep "^export" lib/admin/*.ts            # mechanical export extraction, all 24 modules
grep -rn "@/lib/admin/" <repo>           # import census: per-module importer counts + files
# targeted reads of every module the readme documents
# spot-check of each load-bearing claim (action counts, schema shapes, route paths, callers)
```
Gates: prettier `--write` with the repo config (run inside the repo). No `tsc` / `vitest`
run — the diff is markdown-only and cannot affect the type graph or tests.

**Lineage:** directly closes the follow-up recorded in
`2026-09-11-lib-admin-dead-exports.md` ("lib/admin/.workflows/package_readme.md has stale
API lines — one small doc pass owed"): the `AdminManifestEntry` / `AdminBatchRegisterResult`
/ `AdminManifestResult` export lines (~367–375) and the `FolderUploadPlan<T>` signature line
(~170) that sweep left behind are now corrected — `planFolderUpload` documented as returning
the exported `PlannedUpload<T>`, the three result shapes documented as module-private and
consumed structurally off return types, exactly as that session recommended.
