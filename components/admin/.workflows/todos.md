# Todos: components/admin

**Package Path**: `components/admin`
**Package Code**: CA
**Last Updated**: 2026-09-07
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 4

---

## Active Tasks

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

- [x] **P1-CA-A003** Phase 5: The photo-reference picker
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `components/admin/PhotoReferencePicker.tsx` — a caption-less, gapless, square-tile, single-selection grid over both of Nina's photo sets (album + `kind='generated'` chat photos), in the iOS Photos idiom; its pure view model `components/admin/photoReferenceModel.ts`; the one edit to `ImageGenPanel.tsx` that replaces phase 4's `SEAM — PHASE 5` with the mounted picker; `tests/admin.photoReference.test.ts`. Does not touch the page, the save action, the schema or the nav (phase 4 owns all four), nor the generation path. Exit: album and chat photographs in one grid, newest first, no caption/filename/date on any tile; no photograph appears twice (plan invariant 13 — phase 1's structural guarantee, not re-implemented here); exactly one tile selectable and the selection round-trips through phase 4's save as `{ source, id }` carried across the seam as the opaque `referenceKey(...)` string; tiles are `loading="lazy"` and use `thumbUrl` when present; nothing in the grid announces which set a photo came from.
  - **Status**: completed
  - **Plan Set**: `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 5 of 7)
  - **Satisfies**: R10 — photo reference: a caption-less iOS-album-style grid over Nina's album and Chat photos, single selection
  - **Depends on**: P1-DB-A004 (phase 1, complete at `af0cb0b`)
  - **Plan**: `.workflows/plan/P1-CA-A003.md`
  - **Completed**: 2026-09-07 22:52
  - **Method**: /implement
  - **Files**: components/admin/photoReferenceModel.ts, components/admin/PhotoReferencePicker.tsx, tests/admin.photoReference.test.ts
  - **Drift**: Step 3 (the mount at phase 4's `SEAM — PHASE 5`) is NOT applied: `components/admin/ImageGenPanel.tsx` does not exist yet. Phase 4 is running concurrently in this same worktree and has landed only `lib/admin/imageGenModel.ts` + `imageGenActions.ts` so far, both untracked. The phase plan anticipates exactly this ("Until phase 4 lands, the mount is the only thing this phase leaves unlanded, and its test assertion is written to be green either way"), and the test's mount case returns early via `existsSync`. The mount is still phase 5's edit to make.
  - **Drift**: The tree is currently RED from a live peer, not from this phase: `lib/nina/imagegen.ts:195` references an undefined `NINA_APPEARANCE` (phase 2's in-flight seam), which is 2 typecheck errors and 6 test failures in `tests/nina.imagerecipe.test.ts`. Zero typecheck errors, zero lint errors and zero test failures are attributable to phase 5's files.
  - **Decided**: Two of the plan's own test assertions contradicted the plan's own source docstrings — `expect(model).not.toContain("'use client'")` and `expect(picker).not.toContain('next/image')`, where both headers deliberately QUOTE those literals to explain why the property holds. -> Fixed by asserting the actual property instead of relaxing it: over `codeLines(...)` (the test file's own helper, written for exactly this and documented in its header) plus `model.startsWith("'use client'") === false`, which together are strictly stronger than the whole-file substring they replace. (Rung 3: the phase plan's code blocks, resolved internally by the test file's own stated rule.)
  - **Decided**: `npm run format` was NOT run; `npx prettier --write` was run on the three owned paths only. -> Rung: narrower blast radius — format is repo-wide, this repo has files committed prettier-dirty, and a repo-wide reflow in a shared worktree is indistinguishable from a peer editing your logic. All three owned files are prettier-clean, Tailwind class order included.
  - **Decided**: `readme-updater` is SKIPPED, per the phase plan's Handoff H6: "components/admin/.workflows/package_readme.md gains two files and does not know it. The readme-updater pass at the end of the set covers it; nothing in this phase edits documentation." It is also a file phases 4 and 6 would concurrently write. (Rung 2/3: the phase plan's own Handoffs.)

- [x] **P2-CA-A002** Phase 1: The Personality tab
  - **Difficulty**: NORMAL
  - **Type**: Update
  - **Context**: Owns `app/admin/personality/page.tsx` (new), `app/admin/nina/page.tsx`, `components/admin/CharacterPanel.tsx`, `components/admin/AdminNav.tsx`, `app/admin/page.tsx`, `lib/admin/tuningActions.ts`, `tests/admin.shell.test.ts`, `tests/admin.tuning.test.ts`, `components/admin/.workflows/package_readme.md`, `docs/nina/persona.md`. Exit: `/admin/personality` renders the panel expanded and Save works there; `/admin/nina` is the album alone; `AdminNav` shows five cells (`grid-cols-5`, still `h-14`, Personality/Persona); `/admin` hub card links to `/admin/personality`; no dangling `#character` deep link on the album route; `npm run test && npm run typecheck && npm run lint && npm run build` green with nina.prompts snapshots unmodified.
  - **Status**: completed
  - **Plan Set**: `NINA_PERSONALITY_TAB_PLAN.md` (phase 1 of 1)
  - **Satisfies**: R1 — Move the "Her character" panel off `/admin/nina` (Nina's album) and onto a new tab named **Personality**
  - **Depends on**: —
  - **Plan**: `.workflows/plan/P2-CA-A002.md`
  - **Card**: miftahulmahfuzh/run-insights#103
  - **Completed**: 2026-09-07 07:39
  - **Method**: /do
  - **Files**: app/admin/personality/page.tsx, app/admin/nina/page.tsx, components/admin/CharacterPanel.tsx, components/admin/AdminNav.tsx, app/admin/page.tsx, lib/admin/tuningActions.ts, tests/admin.shell.test.ts, tests/admin.tuning.test.ts, components/admin/.workflows/package_readme.md, docs/nina/persona.md
  - **Drift**: No code drift. Every hunk the phase plan quoted matched the tree byte-for-byte and applied cleanly on the first attempt.
  - **Decided**: The phase plan's own Step 3a and Step 5b comment prose spelled the old album fragment URL verbatim (the `#character` deep link), which invariant 10 forbids anywhere under `app components lib tests docs` outside `.workflows/plan/` — the plan's code blocks contradicted the plan's own invariant. -> Invariant 10 wins: both comments keep every claim they made but stop spelling that fragment URL, and each now names invariant 10 as the reason. (Rung 1: a stated invariant beats rung 3's code blocks; exit criterion 5's wording, "no dangling #character deep link", confirms the intent is a live link rather than a substring.)
  - **Decided**: This card's own Context line, written from the exit criteria, also carried the verbatim fragment and tripped the same grep. -> Reworded to `no dangling #character deep link on the album route`. (Rung 1, same invariant; a one-line bookkeeping edit with no behavioural surface.)

- [x] **P2-CA-A000** Phase 5: The panel on `/admin/nina`
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/admin/tuningModel.ts` (`TuningDraft`, `toTuningDraft`, `changedTuningFields`, `loudestDials` and the copy accessors, which read phase 1's specs rather than carrying tables of their own), the Zod boundary appended to `lib/admin/schema.ts` (**every bound imported** from `lib/nina/tuning.ts`), `lib/admin/tuningActions.ts` (`requireAdmin()` → Zod → `writeNinaTuning` → `revalidatePath`, one save plus a reset), `components/admin/DialSlider.tsx` and `CharacterPanel.tsx`, `app/admin/nina/page.tsx`, a hub card on `app/admin/page.tsx`, and `tests/admin.tuning.test.ts`. Exit: `/admin/nina` renders 11 trait sliders, the 5-way relationship selector, the 4 R3 dials, the wardrobe and notes fields and a preview of the assembled system prompt; **every label, hint and address word on the page comes from `lib/nina/tuning.ts`**; one save writes the whole tuning and reports the returned revision; the panel is collapsed by default so the album is still the page's working surface; the preview is the pure assembly function and no model call happens in the render (invariant 5).
  - **Status**: completed
  - **Plan Set**: `NINA_CHARACTER_TUNING_PLAN.md` (phase 5 of 6)
  - **Satisfies**: R1, R2, R3 — R1: Eleven trait sliders on `/admin/nina` — anger, chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned. R2: A relationship setting (nobody / casual friend / sister / best friend / girlfriend) with the prescribed address form for each, and behaviour that follows it. R3: "among other things (you can define more comprehensively)" — the tuning model extended past 11 + 1, wherever a dial has a real code path behind it
  - **Depends on**: `P1-NIN-A000`, `P1-NIN-A002`
  - **Plan**: `.workflows/plan/P2-CA-A000.md`
  - **Completed**: 2026-09-05 05:26
  - **Method**: /do
  - **Files**: lib/admin/tuningModel.ts, lib/admin/tuningActions.ts, lib/admin/schema.ts, components/admin/DialSlider.tsx, components/admin/CharacterPanel.tsx, app/admin/nina/page.tsx, app/admin/page.tsx, tests/admin.tuning.test.ts
  - **Drift**: Plan Steps 5 and 9 imported NINA_WARDROBE_MAX / NINA_NOTES_MAX from @/lib/admin/tuningModel, but the Interface Contract cut both constants from that module. Both now import from @/lib/nina/tuning; the draft's import could not have compiled.
  - **Drift**: Plan Step 1's code block referenced TuningDraft and TuningCopy without declaring them. Both declared in lib/admin/tuningModel.ts with the Interface Contract's stated shapes.
  - **Drift**: Plan Step 3 declared a local `type NinaTuningWrite = Omit<NinaTuning, 'revision'>`; phase 1 already exports that exact name and shape. Imported phase 1's instead.
  - **Drift**: Plan's loudestDials test set NINA_TRAITS[0] (anger) to NINA_SCORE_MIN, but anger's default IS 0 — the move was a no-op and the case asserted a 2-element list against a 1-element one. Rewritten to pick a ships-at-0 trait and a ships-at-50 trait so value-order and delta-order genuinely disagree.
  - **Drift**: Plan's three structural substring guards fired on PROSE: Steps 1/5/6's required docstrings literally contain 'server-only' and 'runNinaTurn', which Step 9 then forbids in the same files. Narrowed the guards to code by stripping block comments first (helper `codeOnly`) — strictly stronger for a real import or call, and the only reading that satisfies both halves of the plan.
  - **Drift**: Two strict-index (noUncheckedIndexedAccess) fixes: prettifyKey uses word.charAt(0); the test destructures loudestDials' result instead of indexing it.
  - **Drift**: Replaced the test's `{ [k]: _dropped, ...rest }` destructure-to-drop with delete-off-a-copy, so the run adds no new lint warning.
  - **Decided**: Where do the two length bounds live? -> imported from lib/nina/tuning.ts (Rung 3: Step 1's block defines neither, so the draft's import cannot compile; the Interface Contract states the replacement)
  - **Decided**: Substring guards firing on docstrings -> narrowed to code-only, never relaxed (Rung 3: the plan's own code blocks require both the prose and the guard)
  - **Decided**: loudestDials ranking case -> rewritten for non-uniform defaults (Rung 1: invariant 2, 'the defaults are not uniform, and this is the invariant's real content')
  - **Decided**: Who writes the two package readmes? -> phase 6 (Rung 2: phase 5's Handoffs says 'I do not write them'; phase 6's Owns line claims both)
  - **Decided**: AdminNav.tsx gets no fourth entry -> recorded no-edit, per plan Step 8 (two sidebar rows pointing at one URL is worse navigation than one)

- [x] **P1-CA-A001** Phase 2: Admin surfaces: explorer, crop studio, tables, dials
  - **Difficulty**: HARD
  - **Type**: Update
  - **Context**: Owns `components/admin/touch.ts` (new — TOUCH_TARGET / TOUCH_ICON, the 44px rule spelled once), FileExplorer.tsx, explorer/{FolderTree,PhotoGrid,SelectionPane,UploadQueue}.tsx, CropStudio.tsx, MemoryTable.tsx, ChatPhoto{Grid,Detail}.tsx, PhotoMoveBar.tsx, DialSlider.tsx, FolderMenu.tsx, UserPicker.tsx, and components/admin/.workflows/package_readme.md — the one readme pass for both R1 phases. Exit: the three-pane explorer stacks with the folder rail behind a button; the crop studio pans, pinches and zooms by touch and raises no iOS callout; tables scroll inside their own container and no control on them zooms the viewport on focus; every interactive control in components/admin/ is >= 44px on its smaller axis; nothing scrolls the page sideways at 414px.
  - **Status**: completed
  - **Plan Set**: `ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md` (phase 2 of 5)
  - **Satisfies**: R1 — Revamp the `/admin` UI to be responsive on iPhone XS Max Safari
  - **Depends on**: P1-RI-A017
  - **Plan**: `.workflows/plan/P1-CA-A001.md`
  - **Completed**: 2026-09-06 22:08
  - **Method**: /do
  - **Files**: components/admin/touch.ts, components/admin/FileExplorer.tsx, components/admin/explorer/FolderTree.tsx, components/admin/explorer/PhotoGrid.tsx, components/admin/explorer/SelectionPane.tsx, components/admin/explorer/UploadQueue.tsx, components/admin/CropStudio.tsx, components/admin/MemoryTable.tsx, components/admin/ChatPhotoGrid.tsx, components/admin/ChatPhotoDetail.tsx, components/admin/PhotoMoveBar.tsx, components/admin/DialSlider.tsx, components/admin/FolderMenu.tsx, components/admin/UserPicker.tsx, components/admin/.workflows/package_readme.md, components/admin/.workflows/todos.md, components/admin/.workflows/plan/P1-CA-A001.md
  - **Drift**: PhotoMoveBar's max-w-[240px] is at line 104, not the plan's quoted 241. Code identical; line number only.
  - **Drift**: FolderTree's count <span> lacked the plan's px-1; the plan's replacement block supplies it. No behavioural difference.
  - **Drift**: UploadQueue and MemoryTable already had the Button/Card imports the plan's import blocks quoted as context; only the new touch.ts import was added in each.
  - **Decided**: Plan Steps 6b, 6d and 8d place a {/* … */} JSX-child comment in expression position (directly after `return (` and inside `{open && (`), which is a TypeScript syntax error (TS1005/TS1128) — JSX comments in braces are only valid as JSX children → converted those three to plain /* … */ block comments with the comment text unchanged (rung 1: invariant 7, the tree builds at the end of every phase).
  - **Decided**: `npm run format` is `prettier --write .`, which writes the whole repo while peers run → ran `format:check` first, confirmed components/admin/MemoryTable.tsx was the ONLY unformatted file in the repo, then ran the full format as the plan directs. Nothing outside components/admin/ was written (rung 3 plus the narrower-blast-radius tie-break).
