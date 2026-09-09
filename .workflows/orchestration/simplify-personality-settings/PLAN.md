# Plan: Simplify Personality — purge revision tracking, auto-save the panel

**Slug:** simplify-personality-settings
**Date:** 2026-09-09
**Analysis:** `20260909-084240-P3R5_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/simplify-personality-settings`
**Branch:** `feature/simplify-personality-settings` (base: `origin/main` @ `557a05c`)
**Phases:** 2
**Status:** phase 1/2 complete — phase 1 landed on `feature/simplify-personality-settings`; a phase is complete when its row in the Phases table is ticked ✅. The set is reviewed and merged as a whole. Migration `0016` is **committed, not applied** — `db:migrate` stays a post-deploy act (invariant 4).
**Coordinator:** —

## Why

> 1. pada admin page -> Personality. buat personality system lebih simple:
> 1a. purge mekanisme prompt revision tracking (frontend & backend & db both) . hal ini disebabkan
> karena Personality settings is more like a configuration tuning, not a prompt update (which we
> need to track the history version of)
> 1b. hapus tombol Discard changes dan Reset to defaults. buat Personality capable to auto-save
> everytime some changes are made.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Purge the prompt-revision-tracking mechanism for Personality — frontend, backend, and database — because Personality settings are configuration tuning, not versioned prompt updates. | 1 |
| R2 | Remove the "Discard changes" and "Reset to defaults" buttons; Personality auto-saves every time a change is made. | 2 |

## Scope

**In scope:** `nina_tuning.revision` and `nina_turns.tuning_revision` (columns, types, docs,
tests, UI strings, generated drop migration); the `CharacterPanel` draft/Save/Discard/Reset model
replaced by auto-save; `resetNinaTuningAction` + `ninaTuningResetSchema` deleted.

**Out of scope, and why:**
- `nina_image_prefs.revision` and everything on `/admin/image-generation` — a separate mechanism
  on a different page; the user asked about Personality only.
- `nina_turns.prompt_version` / `NINA_PROMPT_VERSION` — dates the prompt *assembler* (a code
  constant), not operator settings; it is not the revision-tracking mechanism.
- The `*_enabled` per-parameter toggles, the dials themselves, prompt assembly
  (`buildNinaSystemPrompt`), and the turn path's behaviour — nothing about who Nina is changes.

## Invariants

1. The tree builds and `npm run typecheck`, `npm run lint`, `npm test` pass at the end of each phase.
2. Nina's assembled prompt is byte-identical before and after for the same tuning — the purge
   removes audit plumbing, not prompt content.
3. One save is one Server Action carrying the whole tuning (the character-tuning set's invariant
   11). Auto-save debounces/defers commits; it never fragments into one action per dial.
4. **The DROP migration is generated and committed but NOT applied by any phase.** This repo has
   one database and production reads it; `readNinaTuning`'s bare `db.select().from(ninaTuning)`
   expands to every column by name, so applying the drop before the merged code is deployed
   breaks the running production. `npm run db:migrate` happens after deploy (the
   `0015_retire_nina_tuning_wardrobe.sql` precedent).
5. `lib/nina/tuning.ts` stays zero-import and client-importable (existing tests assert this).
6. Auto-save commit moments follow `components/admin/MemoryTable.tsx`'s measured rule: text
   commits on **blur** (never a keystroke debounce — sequential action dispatch + revalidatePath
   re-renders fight the cursor), discrete controls (toggles, radios) commit on **change**, sliders
   commit **debounced** after the drag settles. No action ever throws; the result-object
   convention stays.
7. `requireAdmin()` stays the first statement of every action; Zod stays the boundary; nothing
   `server-only` crosses into a client component.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Purge the tuning revision mechanism everywhere | R1 | `lib/nina`, `lib/db`, `lib/admin`, `app`, `components`, `tests`, `drizzle` | ~21 | — | NORMAL | `.workflows/plan/simplify-personality-settings/phase-1.md` | P1-RI-A025 | — |
| 2 | Auto-save the Personality panel | R2 | `components/admin`, `lib/admin`, `tests` | ~8 | 1 | HARD | `.workflows/plan/simplify-personality-settings/phase-2.md` | P1-RI-A026 | — |

### Phase 1 — Purge the tuning revision mechanism everywhere
**Satisfies:** R1
**Owns:** `NinaTuning.revision` (type, defaults, coercion, `NinaTuningWrite`), `nina_tuning.revision`
and `nina_turns.tuning_revision` (schema + generated migration 0016, committed not applied), the
turn-path field (`NinaTurnTrace`/`NinaTurnRow`/`NinaTurnInsert`, `gateway.ts`, `chatturn.ts`,
`turn.ts`, `queries.ts`), revision strings in `tuningActions` notes/copy, the panel's `revision`
prop + header/preview strings + the revision-keyed draft resync (re-keyed on content via
`tuningDraftEquals`), `/admin` hub card sentence, DialSlider/system/tuningModel comment tweaks,
and the affected tests.
**Does not touch:** the Save/Discard/Reset buttons' existence (phase 2's), `resetNinaTuningAction`,
`nina_image_prefs.*`, `prompt_version`, prompt assembly.
**Exit criteria:** no `revision`/`tuningRevision` reference to the tuning mechanism remains in
`app components lib tests` (the image-prefs revision excepted); `drizzle/0016_*.sql` exists with
exactly the two DROP COLUMN statements and `npm run db:check` is clean; typecheck, lint, tests
green; the panel still saves via the Save button with a revision-free note.

### Phase 2 — Auto-save the Personality panel
**Satisfies:** R2
**Owns:** the `CharacterPanel` rewrite — delete Save/Discard/Reset and `confirmingReset`; sliders
debounced-commit, toggles/radios immediate-commit, notes blur-commit; "Saving…/Saved" status
surface replacing the "N unsaved" counter (per-row dots may remain as pending indicators);
post-save canonical merge that adopts the stored row without clobbering newer local edits;
delete `resetNinaTuningAction` and `ninaTuningResetSchema` (+ their tests, incl. the
"exactly two actions" structural test → one); `AdminTuningResult` re-shaped for auto-save; and
every prose citation that named the deleted symbols — `lib/admin/schema.ts`'s sibling reset
docstring, `app/admin/personality/page.tsx`'s "in both actions",
`components/admin/DialSlider.tsx`'s "still one Save" sentence, and
`lib/admin/imageGenActions.ts:154`'s "for `resetNinaTuningAction`'s reason".
**Does not touch:** `DialSlider`'s props (ImageGenPanel shares them; its per-dial "default N"
chip becomes the surviving route back to defaults), anything on the turn path or in the DB, or
the image-generation surface beyond that one docstring sentence in `imageGenActions.ts`.
**Exit criteria:** no Save/Discard/Reset control renders; every control commits by itself on its
MemoryTable-rule moment through ONE whole-tuning action; the reset action, its schema and every
citation that named them are gone from code (`grep` in the phase plan); a failed save shows a
sentence and the pending state; typecheck, lint, tests green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| `NinaTuningWrite` deleted outright by Phase 1, but still imported/returned by Phase 2's `tuningActions.ts` rewrite and asserted present in Phase 2's assumption list | 1, 2 | Phase 1's deletion stands (the alias was `Omit<NinaTuning,'revision'>` with no revision left to omit — a kept alias would be an agreed-not-shared constant). Phase 2 rewritten to import and return `NinaTuning` directly: assumption bullet, import line, `toTuningWrite` signature and its doc paragraph all fixed. |
| `lib/admin/imageGenActions.ts:154` cites `resetNinaTuningAction`, which Phase 2 deletes — a dangling doc reference Phase 2 had parked in Handoffs as "out of scope" | 2 | Un-parked and owned: Phase 2's Step 5 gains File 3 (drop "for `resetNinaTuningAction`'s reason"; the argument stands on its own), and the Files table, Leaves-alone list, Handoffs and the exit-criteria grep were updated to carry it. Image-gen behaviour stays untouched. |
| Phase 2's exit-criterion grep (`ninaTuningResetSchema\|NinaTuningResetInput` over `app components lib tests`) is unsatisfiable: tracked `.workflows` package docs under `lib/` and `components/` contain those symbols in historical plan prose | 1, 2 | Both phases' sweep greps gain `--include='*.ts' --include='*.tsx'` with a note that package `.workflows` dirs are records of landed sets, never rewritten. Phase 2's grep also anchors the action as `function resetNinaTuningAction` so the new docstring (which names the deleted reset while arguing the count) cannot trip it — the code-level absence is asserted by the structural test via `codeOnly`. |
| Phase 1's purge-sweep expectation "every surviving 'revision' line contains 'image'" is false: 9 lines in the image-prefs sections of `lib/nina/queries.ts` and `lib/db/schema.ts` lack "image" on the line, so the filtered grep never returns empty | 1 | Expectation rewritten to the measured residue — exactly those 9 lines (6 in `queries.ts`, 3 in `schema.ts`), enumerated by content, and nothing else. Verified against the tree at `557a05c`; Phase 1 touches none of them. |
| Phase 2's prescribed code reintroduced the word "revision" into two docstrings ("…which nothing can do now that the revision is gone" in `tuningActions.ts` and `CharacterPanel.tsx`), tripping Phase 1's purge-sweep exit criterion at set land | 1, 2 | Both sentences reworded to make the same argument without the token (the panel is the row's only writer, so its own save's response is the only way the row changes under it). The purge now survives the whole set, not just phase 1's landing. |
| Phase 2's new structural test asserted RAW `tuningActions.ts` source does not contain `resetNinaTuningAction`, while Phase 2's own prescribed file names it in its header docstring — the test fails against the plan's own file | 2 | Assertion moved to `codeOnly(ACTIONS)`, matching the test file's established raw-for-labels / codeOnly-for-identifiers split (the split its own `codeOnly` docstring argues for). |
| Index drift: phase Files counts (~12 / ~3) contradicted the plans' Files tables (21 / 8 rows after reconciliation) | index | Counts corrected to match the plans. |
| Sequencing of `AdminTuningResult`, the `CharacterPanel` rewrite, and `tests/admin.tuning.test.ts` across the two phases (flagged for verification) | 1, 2 | Verified consistent, no edit needed: Phase 2's quotes are the post-Phase-1 shapes (revision-free result, revision-free props, content-keyed resync deleted wholesale, "stale row" comment matching Phase 1's rewording); Phase 1 keeps both actions and the two-actions test green at its own landing. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| `nina_turns.tuning_revision` — part of the purge or kept as audit? | Dropped with `nina_tuning.revision`: it exists solely to stamp the revision and is write-only (nothing reads it) | 6: user's raw input — "db both", the mechanism is the tracking itself |
| Apply the drop migration at phase land? | No — committed only; `db:migrate` after the branch is deployed | 1: plan invariant (one database; drizzle's expanded select names the column) |
| Route back to defaults once "Reset to defaults" is gone | The per-dial "default N" chip in `DialSlider` survives and now auto-saves; no global reset replacement | 6: surrounding convention — the user removed the global button, not per-dial affordances |
| Auto-save commit moments | Text on blur, toggles/radios on change, sliders debounced after settle (~600ms) | 6: surrounding convention — `MemoryTable.tsx`'s measured blur-not-debounce rule |
| `prompt_version`, image-prefs revision | Untouched — different mechanisms | 6: user's raw input scopes to the Personality page |
| `NinaTuningWrite` — Phase 1 deletes the alias, Phase 2 assumed the export survived | Deleted; Phase 2 names `NinaTuning` directly | 1: build-green — the tree must compile at the phase boundary, and an alias for an unmodified type is a constant agreed rather than shared |
| Phase 2's post-save prose said "now that the revision is gone" | Reworded to the one-writer argument, no "revision" token | 1: stated invariant — Phase 1's purge-sweep exit criterion must hold when the sweep is re-run at set land, and prose is not exempt from a grep |
| `imageGenActions.ts`'s citation of the deleted reset — out of scope, or Phase 2's? | Phase 2 owns the one-line fix; image-gen behaviour stays out of scope | 6: surrounding convention — deleting a symbol retires the references that named it; the set's own Scope section, not the citation, defines the behavioural boundary |

## Open Questions

(none)

## Rollback

- **Phase 2** — revert the phase-2 commit; the Save-button model returns verbatim (phase 1 left it
  working). No data implications.
- **Phase 1** — revert the phase-1 commit **and** delete `drizzle/0016_*.sql` from the journal
  **before** anything applies it. If the migration has already been applied post-deploy, the
  columns must be re-added by hand (`ALTER TABLE nina_tuning ADD COLUMN revision integer NOT NULL
  DEFAULT 1; ALTER TABLE nina_turns ADD COLUMN tuning_revision integer;`) — the historical data
  is not recoverable, which is exactly why no phase applies it.
- **Whole set** — `git checkout origin/main` and delete the branch; the database was never touched
  by the phases.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md
