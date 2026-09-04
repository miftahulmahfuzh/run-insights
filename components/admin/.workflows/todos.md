# Todos: components/admin

**Package Path**: `components/admin`
**Package Code**: CA
**Last Updated**: 2026-09-04
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 1
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 1
- Completed: 0

---

## Active Tasks

### [P1] High

### [P2] Medium

- [ ] **P2-CA-A000** Phase 5: The panel on `/admin/nina`
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns `lib/admin/tuningModel.ts` (`TuningDraft`, `toTuningDraft`, `changedTuningFields`, `loudestDials` and the copy accessors, which read phase 1's specs rather than carrying tables of their own), the Zod boundary appended to `lib/admin/schema.ts` (**every bound imported** from `lib/nina/tuning.ts`), `lib/admin/tuningActions.ts` (`requireAdmin()` → Zod → `writeNinaTuning` → `revalidatePath`, one save plus a reset), `components/admin/DialSlider.tsx` and `CharacterPanel.tsx`, `app/admin/nina/page.tsx`, a hub card on `app/admin/page.tsx`, and `tests/admin.tuning.test.ts`. Exit: `/admin/nina` renders 11 trait sliders, the 5-way relationship selector, the 4 R3 dials, the wardrobe and notes fields and a preview of the assembled system prompt; **every label, hint and address word on the page comes from `lib/nina/tuning.ts`**; one save writes the whole tuning and reports the returned revision; the panel is collapsed by default so the album is still the page's working surface; the preview is the pure assembly function and no model call happens in the render (invariant 5).
  - **Status**: blocked
  - **Plan Set**: `NINA_CHARACTER_TUNING_PLAN.md` (phase 5 of 6)
  - **Satisfies**: R1, R2, R3 — R1: Eleven trait sliders on `/admin/nina` — anger, chill, sad, flirty, steamy, wise, annoying, funny, happy, anxious, concerned. R2: A relationship setting (nobody / casual friend / sister / best friend / girlfriend) with the prescribed address form for each, and behaviour that follows it. R3: "among other things (you can define more comprehensively)" — the tuning model extended past 11 + 1, wherever a dial has a real code path behind it
  - **Depends on**: `P1-NIN-A000`, `P1-NIN-A002`
  - **Plan**: `.workflows/plan/P2-CA-A000.md`

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

_None._
