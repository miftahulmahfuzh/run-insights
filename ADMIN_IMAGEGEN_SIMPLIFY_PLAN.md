# Plan: Simplify the admin Image generation panel

**Slug:** admin-imagegen-simplify
**Date:** 2026-09-09 15:33 (+07)
**Analysis:** `20260909-153327-6A82_code_analyzer.md`
**Worktree:** `/home/miftah/run-insights/.claude/worktrees/admin-imagegen-simplify`
**Branch:** `worktree-admin-imagegen-simplify` (base: `origin/main` @ `8652e42`)
**Phases:** 3
**Status:** planned
**Coordinator:** —

---

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`: a name written here by hand
addresses a session that does not exist, and the reports meant for it go nowhere.>

## Why

> 1. pada admin page -> Image generation. buat systemnya lebih simple:
> 1a. purge mekanisme prompt revision tracking (frontend & backend & db both). hal ini disebabkan karena Image generation settings is more like a configuration tuning, not a prompt update (which we need to track the history version of)
> 1b. hapus tombol Save every parameter, Discard changes dan Reset to defaults. buat Personality capable to auto-save everytime some changes are made.
> 2. pada Focus on section, hapus redundant description:
> 2a. face pada Face, skin pada Skin, etc

The rationale in 1a is the specification for what may be deleted and what may not: revision
tracking exists to version prompts; these settings are configuration tuning, so the counter and
every word and column that carries it go. The buttons go because the Personality tab already
proved the simpler model on this very repo.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Purge prompt revision tracking — frontend, backend, and database both — because Image generation settings are configuration tuning, not a prompt update needing version history | 2 |
| R2 | Remove the "Save every parameter", "Discard changes" and "Reset to defaults" buttons; auto-save on every change, the way Personality does | 1 |
| R3 | Focus on section: remove the redundant description under each option ("face" under Face, "skin" under Skin, …) | 3 |

## Scope

**In scope:** the image-prefs stack only — `ImageGenPanel.tsx`, `imageGenActions.ts`,
`imageGenModel.ts`, `imageprefs.ts`, `queries.ts` (image-prefs half), `schema.ts` (both the Zod
boundary and the drizzle table), the page + hub card copy, one migration, and the three test
files that pin them.

**Out of scope:** the prompt assembler (`lib/nina/imagegen.ts`, incl. `NINA_FOCUS_EMPHASIS`),
the test-generation actions (`runNinaImageTestAction` / `readNinaImageTestPanel` behavior), the
photo-reference storage model, `NINA_IMAGE_PREFS_DEFAULTS` as the read-path fallback, the
five-band length ladder, the unconditional body canon, and the Personality tab (already
auto-save; read as precedent, not edited). `nina_tuning`'s revision is already gone
(`0016_retire_tuning_revision.sql`) — nothing to do there.

## Invariants

1. The tree builds and the full test suite passes at the end of every phase.
2. `requireAdmin()` stays the first statement of every action and every page read; the Zod
   boundary stays between gate and write.
3. **One save, not eleven** survives auto-save: every commit sends the complete draft through
   the one `saveNinaImagePrefsAction`. No per-field actions, ever (the allowlist test keeps
   enforcing this).
4. Controls are never disabled while a save is in flight; the draft keeps accepting edits, and
   the per-field merge protects anything typed after dispatch.
5. The unconditional body canon is untouched: no control on this page can remove the four body
   facts from the prompt (the original image-gen set's invariant 4).
6. `NINA_IMAGE_PREFS_DEFAULTS` remains the frozen read-path fallback for a user with no row.
7. The repo's one database is production: the DROP COLUMN migration runs **after** the code
   deploy, never before (`writeNinaImagePrefs` names the column in its INSERT; old code against
   a dropped column fails, new code against an extra column is silently fine).
8. Every phase leaves the panel usable end to end — no phase ships half a save path.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Auto-save panel: the Personality commit pipeline, buttons removed | R2 | `components/admin` + `lib/admin` | 5 | — | HARD | `.workflows/plan/admin-imagegen-simplify/phase-1.md` | — | — |
| 2 | Revision purge: the counter leaves frontend, backend, and database | R1 | `lib` + `app` + `drizzle` | 15 | 1 | NORMAL | `.workflows/plan/admin-imagegen-simplify/phase-2.md` | — | — |
| 3 | Focus on: the redundant hint under each option | R3 | `components/admin` + `lib` | 5 | 2 | EASY | `.workflows/plan/admin-imagegen-simplify/phase-3.md` | — | — |

### Phase 1 — Auto-save panel: the Personality commit pipeline, buttons removed
**Satisfies:** R2
**Owns:** the save model end to end — `ImageGenPanel.tsx` rewritten onto the `draft`/`saved`
pattern (`CharacterPanel.tsx` is the template, control-kind by control-kind: dials debounced
`IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS`, focus checkboxes and reference selection commit on change,
the four text fields commit on blur); `saveNinaImagePrefsAction` returns the canonical row as
`prefs: ImageGenDraft` (mirroring `AdminTuningResult.tuning`); `mergeImageGenAfterSave` and the
debounce constant added to `imageGenModel.ts`; tri-state status line ("Saving…" / "Saved" /
"Unsaved edits", `aria-live`); `disabled={pending}` removed from every control; the Save,
Discard, and Reset buttons, the confirm block, `confirmingReset`, and `run()` deleted;
`resetNinaImagePrefsAction` and `ninaImagePrefsResetSchema` deleted (the Personality precedent:
`resetNinaTuningAction` is gone); `tests/admin.imagegen.test.ts` allowlist and Zod-loop
re-pinned, new auto-save pins mirroring `tests/admin.tuning.test.ts`.
**Does not touch:** the `revision` prop, the "revision N" copy, or anything in `imageprefs.ts`
/ `queries.ts` / `lib/db/schema.ts` — phase 2's. `ImageGenTestPanel`'s `dirty` prop stays wired
(its meaning becomes transient: debounce armed or blur-pending). The page still passes
`revision={prefs.revision}` and the panel still renders it, so nothing dangles.
**Exit criteria:** no Save/Discard/Reset anywhere; a slider drag saves once when it settles, a
checkbox saves on click, a text field saves on blur, a reference pick saves on click; a failed
save leaves the fields pending with the error sentence; `npx vitest run` green.

### Phase 2 — Revision purge: the counter leaves frontend, backend, and database
**Origin:** R1
**Satisfies:** R1
**Owns:** every remaining `revision` in the image-prefs stack — `NinaImagePrefs.revision`,
`NinaImagePrefsWrite`'s `Omit`, `NinaImagePrefsInput.revision`, `coerceRevision`, the defaults'
`revision: 0`, `coerceNinaImagePrefs`'s line, `imagePrefsFromRow`'s mapping,
`writeNinaImagePrefs`'s `revision: 1` insert and SQL `+1` upsert (the upsert keeps bumping
`updated_at`), `AdminImageGenResult.revision` and the save note's wording, the panel's `revision`
prop + its docstring + the two "revision N" copy sites + the header-docstring paragraph recording
the retired resync (all quoted from phase 1's landed file — the resync block itself is phase 1's
deletion), the page's prop
pass, the hub card's ". Revision N." sentence (`app/admin/page.tsx:183`), `ImageGenDraft`'s
docstring, the `ImageGenTestPanel` comment, and the `"revision" in DEFAULTS` test pin
(`tests/admin.imagegen.test.ts:76-78` — deleted wholesale; the census cannot tolerate the word) —
and the database: drizzle column removed from
`lib/db/schema.ts` and a new `drizzle/0017_*.sql` doing
`ALTER TABLE "nina_image_prefs" DROP COLUMN "revision";` (precedent `0016`, including its
`nina_turns` half — not repeated here; `nina_image_prefs` has no second consumer column).
Re-pin `tests/nina.imageprefs.test.ts` and `tests/db.schema.nina.test.ts`; re-check
`origin/main` for a taken `0017` before creating the file.
**Does not touch:** the focus cards (phase 3's), the auto-save pipeline (phase 1's, quoted as it
left it), `updatedAt`, the defaults object's other members.
**Exit criteria:** a census grep for `revision` over `app components lib scripts tests`
returns image-prefs hits nowhere; `npx vitest run` green; the migration applies cleanly and its
runbook (deploy first, then `db:migrate`) is written in the plan.
**Runbook (part of the phase, not a note):** merge/deploy the code, **then** run
`npm run db:migrate`. Between deploy and migrate the schema declares no `revision` column while
the table still has one — drizzle's expanded select simply ignores the extra column. The reverse
order breaks every write.

### Phase 3 — Focus on: the redundant hint under each option
**Satisfies:** R3
**Owns:** the six focus cards render their label only — the hint span gone from
`ImageGenPanel.tsx`; `imageFocusCopy` simplified accordingly; `NinaImageFocusSpec.userSaid`
removed from `lib/nina/imageprefs.ts` (its only reader was the hint; the prompt's vocabulary
lives in `NINA_FOCUS_EMPHASIS`, `lib/nina/imagegen.ts:319-344`, which never reads it); test
pins updated (`hint.length`, fallback-hint, `userSaid` array — the clinical-synonym negative
test stays, now pinning labels alone).
**Does not touch:** the fieldset's "These add emphasis on top…" paragraph (it explains
emphasis-vs-inclusion — not redundant), the ring/selected styling, `NINA_FOCUS_EMPHASIS`, the
`DialSlider` and text-field hints.
**Exit criteria:** the six cards show one line each; census grep shows no `userSaid` in the
image-focus specs; `npx vitest run` green.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Deleted-then-used: phase 1 deletes `resetNinaImagePrefsAction` / `ninaImagePrefsResetSchema` while the panel and tests still import them | 1 | Within phase 1 only — its steps 2-5 are one commit by its own risk note; verified each phase ends green (phase 1's Verification runs the full suite; phases 2-3 order their steps so every intra-phase break closes inside the phase). No cross-phase exposure. |
| Duplicate work: phase 2 claimed "the revision-keyed resync remnant (:140-152) as phase 1 left them" | 1, 2 | One owner: phase 1 deletes the resync block outright (its plan's complete file quote shows no remnant). Phase 2's Deletes bullet, Files row and step 7(c) narrowed to prop + docstring + destructure + the two copy sites. |
| Stale quotes: phase 2's steps 5(b) and 5(e) anchor on pre-phase-1 text (the "saved as revision 5" tail; the "one revision bump" clause) that phase 1's header/docstring rewrites already remove — and 5(e)'s replacement would have truncated phase 1's new sentence | 1, 2 | Both re-recorded as census-only NO-EDIT checks against phase 1's landed text. |
| Stale quotes: phase 2's step 5(c)/(f) quoted today's result-member docstring and hedged "if phase 1 has not already removed it" — phase 1's Change 2c keeps the member with a NEW docstring, and its save return still carries `revision: stored.revision` | 1, 2 | Steps 5(c)/(f) re-anchored to phase 1's post-state: delete `revision?: number` + its "Display copy only…" docstring, delete `revision: stored.revision`, reduce the note to the revision-less sentence. |
| Gap: phase 1's rewritten panel header docstring authors a NEW `revision`-naming paragraph (the retired-resync record) that no phase 2 step removed — phase 2's own census over `components` would fail | 1, 2 | Assigned to phase 2 as new step 7(b) with the exact replacement paragraph; recorded in phase 1's Handoffs so the handoff and the claim agree. |
| Stale quote: phase 2's step 7(b) told this phase to delete the `promptPreview` docstring's revision sentence — phase 1's wholesale rewrite already replaced that docstring ("says when it is stale") | 1, 2 | Collapsed to a census-only NO-EDIT note (now step 7(f)); step 7(b) re-purposed for the header paragraph. |
| Stale quote: phase 3's focus-card block spelled the pending set `unsaved.has(...)` — phase 1's landed panel spells it `pendingFields.has(...)`, measured against `saved` | 1, 3 | Phase 3's Step 3 block and Assumptions re-quoted from phase 1's file (handler `setFocus` kept, no `disabled` on the checkbox); its "carry phase 1's spelling verbatim" hedge resolved instead of left to the implementer. |
| Self-contradiction: phase 3's census grep forbade the bare word `userSaid` in the same five files its own replacement docstrings/comments name in prose | 3 | Census re-scoped to the code forms (`userSaid:` / `userSaid?:` / `.userSaid`) — the member, its six literal values, every read; prose recording the deletion stays free to name it (the codeOnly split phase 1's tests codify). |
| Index drift: phase 2's files_touched is 15 (index said 9); phase 3's is 5 (index said 4) | — | Phases table Files column reconciled to the plans' file tables (phase 1's 5 was already correct). |
| readme-updater territory: `lib/admin/.workflows/package_readme.md:819` (reset action census) and `lib/nina/.workflows/package_readme.md:487` (`NinaImageFocusSpec.userSaid` prose) | — | Not phase work — verified neither plan schedules an edit; both handoffs stand (phase 1 Handoffs, phase 3 Handoffs). Executed against the landed tree at landing time. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| "buat Personality capable to auto-save" — extend Personality, or mirror it? | Mirror it: the image panel adopts the shipped `CharacterPanel` auto-save model | 6: surrounding convention — Personality's simplify set shipped this exact request for the sibling tab (`CharacterPanel.tsx:64-96`) |
| Reset: button only, or action + Zod schema too? | Delete `resetNinaImagePrefsAction` and `ninaImagePrefsResetSchema` entirely | 6: surrounding convention — the tuning simplify set deleted `resetNinaTuningAction` outright (`tuningActions.ts:39`); an action whose UI is gone is dead code |
| Phase order: revision purge before auto-save? | Auto-save first: the rewrite replaces the revision-keyed draft resync, so purging revision first would build a sync mechanism phase 1 immediately deletes | 4: the plan's code blocks — the panel is quoted once, by its final owner of each region |
| `NinaImageFocusSpec.userSaid` after its last reader (the hint) is gone | Remove the member and its test pin | 5: user's raw input — this set is a simplification pass; a member whose only reader is its own test is the drift this repo documents against; the user's words stay verbatim in `NINA_FOCUS_EMPHASIS` and the labels |
| `tests/admin.imagegen.test.ts:76-78` after the purge: re-worded pin, or deleted? | Deleted wholesale | 2: the phases' exit criteria — phase 2's census greps `tests`, and a pin that asserts a word's absence must be able to spell the word; phase 1's handoff already handed the pin to phase 2. The analysis's "stays true, reword only" reading loses. |
| The focus card's pending-predicate spelling in phase 3's quoted block: today's `unsaved.has(...)` or phase 1's post-state? | `pendingFields.has(...)`, measured against `saved` | 4: the plans' code blocks — phase 1's landed plan is the pre-state phase 3 quotes, and a later phase quotes post-change code; recorded in phase 3's Assumptions so the fork is not re-litigated |

## Open Questions

None.

## Rollback

- **Phase 1:** revert the phase-1 commit(s); the staged-commit panel returns with its buttons; no schema change to undo.
- **Phase 2:** revert code, then restore the column with `ALTER TABLE "nina_image_prefs" ADD COLUMN "revision" integer NOT NULL DEFAULT 1;` (values after the drop are unrecoverable — but the counter had no consumer, so reconstructed values are harmless). If the migration has not run yet, reverting the code alone is complete.
- **Phase 3:** revert the phase-3 commit(s); hints return.
- **Whole set:** phases land in order on one branch; revert the branch merge before `db:migrate` runs and nothing in the database changed at all.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md
