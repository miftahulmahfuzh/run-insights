# Todos: components/admin

**Package Path**: `components/admin`
**Package Code**: CA
**Last Updated**: 2026-09-05
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 1

---

## Active Tasks

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

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
