# Code Analysis: Personality — purge the tuning revision mechanism, auto-save the panel

**Type:** Refactoring (purge) + Feature Update (auto-save)
**Date:** 2026-09-09 08:42 +07
**Session ID:** 20260909-084240-P3R5
**Plan:** `SIMPLIFY_PERSONALITY_SETTINGS_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/simplify-personality-settings` — branch `feature/simplify-personality-settings` (base `origin/main` @ `557a05c`)

---

## User Input

### Original User Request

> 1. pada admin page -> Personality. buat personality system lebih simple:
> 1a. purge mekanisme prompt revision tracking (frontend & backend & db both) . hal ini disebabkan karena Personality settings is more like a configuration tuning, not a prompt update (which we need to track the history version of)
> 1b. hapus tombol Discard changes dan Reset to defaults. buat Personality capable to auto-save everytime some changes are made.

Plus the session-level instruction: *work on a new worktree from origin/main*.

### User-Provided Context

None beyond the prose. No `@` files.

### User-Provided Files

- (none)

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Purge the prompt-revision-tracking mechanism for Personality — frontend, backend, and database — because Personality settings are configuration tuning, not a prompt update whose history needs versioning. |
| R2 | Remove the "Discard changes" and "Reset to defaults" buttons; the Personality panel auto-saves every time a change is made. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement.** The tuning feature ships a revision counter that treats every
save of Nina's personality like a release of a prompt: `nina_tuning.revision` is bumped by SQL on
every write, `nina_turns.tuning_revision` stamps each model call with the revision that produced
it, and three UI surfaces print the number (`/admin/personality`'s panel header and prompt-preview
summary, `/admin`'s hub card). The user's ruling: personality is **configuration tuning**, and a
version history for it is machinery answering a question nobody asks. R1 removes the whole
mechanism. R2 then simplifies the write UX to match: with nothing to "version", there is nothing
to stage — the panel's local-draft + one-Save + Discard + Reset model collapses into save-on-edit.

**Success Criteria.**

- R1: no `revision` on `NinaTuning`, no `nina_tuning.revision` column, no
  `nina_turns.tuning_revision` column, no `tuningRevision` on the turn-path types
  (`NinaTurnTrace`, `NinaTurnRow`, `NinaTurnInsert`), no revision string on any admin surface.
  The drop migration is generated and committed; the tree builds, typechecks, lints, tests green.
- R2: `CharacterPanel` has no Save / Discard / Reset controls and no reset confirmation block;
  every control commits itself — sliders debounced after the drag settles, toggles and the
  relationship radio immediately, notes on blur. `resetNinaTuningAction` and
  `ninaTuningResetSchema` are gone. A save-status surface ("Saving… / Saved") replaces the
  "N unsaved" counter. Nina's turn path behaviour is unchanged.
- Both: `npm run typecheck`, `npm run lint`, `npm test` pass at the end of each phase.

**Key Considerations.**

- **Two revision mechanisms live in this repo.** `nina_image_prefs.revision` (Image Generation
  page: `lib/nina/imageprefs.ts`, `lib/admin/imageGenActions.ts`, `components/admin/ImageGenPanel.tsx`)
  is a *separate* copy of the same idiom on a *different* page. The user asked about **Personality**
  only. Image-prefs revision is untouched.
- **`nina_turns.prompt_version` is NOT the revision mechanism.** It dates the prompt *assembler*
  (`NINA_PROMPT_VERSION`, a code constant), not operator settings. It stays.
- **The one-database rule.** `.env.local`'s `DATABASE_URL` is the production instance. A phase
  running `npm run db:migrate` writes production. Both dropped columns are read by
  drizzle's *expanded* select (`readNinaTuning` does `db.select().from(ninaTuning)`, which spells
  every column — a dropped column breaks production code that names it nowhere), so **the DROP
  migration is generated and committed but NOT applied by the phase** — it is applied after the
  merged branch is deployed, per the repo's standing "a DROP COLUMN applies after the deploy" rule
  (`0015_retire_nina_tuning_wardrobe.sql` is the precedent).
- **Next dispatches Server Actions one at a time per client**, and every action calls
  `revalidatePath` — each save drags a re-rendered route back. This is why the purge of the draft
  model must not become "one action per dial" (plan invariant 11 of the character-tuning set:
  one save sends the whole tuning) and why auto-save must be debounced for sliders and
  blur-committed for text — the same argument `components/admin/MemoryTable.tsx` records for its
  own no-Save-button cells ("HOW A CELL SAVES, AND WHY IT IS BLUR AND NOT A DEBOUNCE").
- **The panel's draft↔prop sync is keyed on `revision` today** (`CharacterPanel.tsx:141-146`).
  Purging the revision removes the key. Phase 1 must re-key that sync on content
  (`tuningDraftEquals` exists in `lib/admin/tuningModel.ts`), and phase 2 replaces the sync with
  the auto-save pipeline's own canonicalisation.
- **`coerceNinaNotes` canonicalises** (trims, collapses blank lines) — after an auto-save the row
  can differ cosmetically from what was typed, so the post-save merge must be able to adopt the
  canonical value without clobbering newer local edits.

---

## Analysis Scope

### Explicitly Mentioned Files

- (none — "admin page -> Personality" resolves to `app/admin/personality/page.tsx` +
  `components/admin/CharacterPanel.tsx`)

### Discovered Related Files

- `lib/nina/tuning.ts` — `NinaTuning.revision`, `NinaTuningWrite = Omit<NinaTuning,'revision'>`,
  `coerceRevision`, `NINA_TUNING_DEFAULTS.revision: 0`, `coerceNinaTuning`
- `lib/db/schema.ts` — `ninaTuning.revision` (:2084), `ninaTurns.tuningRevision` (:610) + docs
- `lib/nina/queries.ts` — `tuningFromRow` (:3596), `tuningToColumns`, `writeNinaTuning` (:3689),
  `NinaTurnInsert.tuningRevision` (:406), `insertNinaTurn` (:2662)
- `lib/nina/turn.ts` — `NinaTurnTrace.tuningRevision` (:199), `NinaTurnRow.tuningRevision` (:249),
  trace init (:739), `store.record` (:1035)
- `lib/nina/gateway.ts` — `dbNinaTurnStore.record` maps `tuningRevision` (:438)
- `lib/nina/chatturn.ts` — `ninaChatTurnStore.record` maps `tuningRevision` (:189)
- `lib/admin/tuningActions.ts` — `AdminTuningResult.revision`, both actions' notes name revisions
- `lib/admin/tuningModel.ts` — `TuningDraft` (no revision, by design; comment cites it)
- `lib/admin/schema.ts` — `ninaTuningResetSchema` (:499)
- `app/admin/personality/page.tsx` — passes `revision={tuning.revision}` (:97)
- `app/admin/page.tsx` — hub card "Revision {tuning.revision}." (:160)
- `components/admin/DialSlider.tsx` — `unsaved` prop + comment citing `nina_turns`' revision (:40)
- `components/admin/MemoryTable.tsx` — the repo's precedent for save-on-edit admin cells
- Tests: `tests/nina.tuning.test.ts`, `tests/admin.tuning.test.ts`, `tests/db.schema.nina.test.ts`,
  `lib/nina/turn.test.ts`, `tests/nina.imagerun.test.ts`
- `drizzle/0005_nina_persona_tuning.sql` — created both columns; next migration number is 0016

---

## Current Dataflow

### Entry Point: `/admin/personality` (Server Component)

**Location:** `app/admin/personality/page.tsx:66`
**Trigger:** page render (force-dynamic; admin-gated by `requireAdmin()`)
**Flow:** `readNinaTuning(userId)` → `toTuningDraft(tuning)` + `buildNinaSystemPrompt(tuning)` +
`revision={tuning.revision}` → `<CharacterPanel>`.

### The write path (today: one explicit Save)

1. **`CharacterPanel`** (`components/admin/CharacterPanel.tsx:118`) holds a local `draft`
   (`useState<TuningDraft>`). Every control (radios, sliders, toggles, notes) edits only the draft.
   One **"Save the whole tuning"** button dispatches `saveNinaTuningAction` with the whole draft
   (invariant 11: one action, whole row — Next dispatches actions one at a time per client).
   **"Discard changes"** copies the `tuning` prop back into the draft. **"Reset to defaults"**
   reveals a confirmation block that dispatches `resetNinaTuningAction`.
   The draft re-syncs from the prop whenever `revision` changes (`141-146`) — the revision is the
   "the row changed under you" signal, adjusted during render per React's derive-state-from-prop
   recipe.
2. **`saveNinaTuningAction` / `resetNinaTuningAction`** (`lib/admin/tuningActions.ts`) —
   `requireAdmin()` → Zod (`ninaTuningWriteSchema` / `ninaTuningResetSchema`) →
   `writeNinaTuning(userId, write)` → `revalidatePath('/admin/personality')` → result object
   `{ ok, revision, note }` ("Saved as revision N. …"). Never throws — a sentence for the operator.
3. **`writeNinaTuning`** (`lib/nina/queries.ts:3689`) — `coerceNinaTuning` → `tuningToColumns` →
   one `INSERT … ON CONFLICT (user_id) DO UPDATE SET …, revision = nina_tuning.revision + 1`
   `.returning()` → `tuningFromRow` → the stored `NinaTuning`. The revision is minted in SQL; no
   caller can supply one. Reset is a *write of the defaults*, not a DELETE, precisely so the
   revision bump records that it happened.
4. **`readNinaTuning`** (`:3671`) — `db.select().from(ninaTuning)` (bare select — drizzle expands
   to every column by name, which is why the DROP must wait for the deploy) → `tuningFromRow`
   (maps `revision: row.revision`) → `NINA_TUNING_DEFAULTS` for a user with no row.

### The read path into Nina's turns

`readNinaTuning` is read live on every turn (no cache — a committed row is in her next prompt).
`runNinaTurn` (`lib/nina/turn.ts:735`) initialises
`trace.tuningRevision = input.tuning.revision` and `runNinaTurn` (:1035) hands it to
`store.record`, which lands it in `nina_turns.tuning_revision` via either
`dbNinaTurnStore` (`lib/nina/gateway.ts:428`, INSERT) or `ninaChatTurnStore`
(`lib/nina/chatturn.ts:171`, UPDATE of the pre-opened row). `insertNinaTurn`
(`lib/nina/queries.ts:2653`) writes `tuningRevision: input.tuningRevision ?? null`; image-job
turns (`lib/nina/imagejobs.ts:103`) never supplied one and wrote NULL already.

Nothing in the repo *reads* `nina_turns.tuning_revision` back — it is write-only audit data.

### Exit Points

- `/admin/personality` — panel header `… · revision {revision}` (:219), prompt-preview summary
  `The assembled system prompt · revision {revision}` (:409), reset-confirmation copy "bumps the
  revision" (:473), result note "Saved as revision N".
- `/admin` hub card — `Revision {tuning.revision}.` (:160). (The Image-generation card's
  `Revision {imagePrefs.revision}.` at :184 is the other mechanism and stays.)
- `nina_turns` rows — one integer per model call.

---

## Key Data Structures

### `NinaTuning.revision` — `lib/nina/tuning.ts:793`
`readonly revision: number`. `0` = never written (the defaults' sentinel); a stored row is `>= 1`.
`NinaTuningWrite = Omit<NinaTuning, 'revision'>` (:797) is the "caller cannot mint one" seam.
`coerceRevision` (:854) floors/clamps; `NINA_TUNING_DEFAULTS.revision: 0` (:850).

### `ninaTuning.revision` — `lib/db/schema.ts:2084`
`integer('revision').notNull()`. No default — the one writer always supplies it (insert `1`,
conflict `revision + 1`).

### `ninaTurns.tuningRevision` — `lib/db/schema.ts:610`
`integer('tuning_revision')`, nullable, no default, no FK (nina_tuning holds one CURRENT row per
user, not a history). NULL = "a turn from before the tuning existed".

### `NinaTurnTrace` / `NinaTurnRow` / `NinaTurnInsert`
`lib/nina/turn.ts:199` / `:249` / `lib/nina/queries.ts:406` — the field rides the turn path from
`runNinaTurn` through the store into `nina_turns`. `promptVersion` beside it is the assembler
version and **stays**.

### `TuningDraft` — `lib/admin/tuningModel.ts:54`
The browser-edit shape: traits/dials/enabled/relationship/notes, no revision (asserted by
`tests/admin.tuning.test.ts:72`). `changedTuningFields` / `tuningDraftEquals` (:221/:244) diff two
drafts — the machinery R2 reuses for pending-save indication and post-save canonical merge.

---

## Dependencies

### Configuration / Environment / External Services

- Neon Postgres via `DATABASE_URL` (the ONE database — "dev" writes production).
- Drizzle Kit (`db:generate` / `db:check` / `db:migrate`); migrations committed under `drizzle/`,
  journal at idx 15 (`0015_retire_nina_tuning_wardrobe.sql`) — next tag 0016. Note `drizzle/`
  contains two `0011_*` files (a previously-constructed fork); `db:generate` resolves from
  `meta/_journal.json`, never hand-number.
- CI (`.github/workflows/ci.yml`) builds/tests against dummy env — no migrations run in CI.
- `scripts/check-llm-payload-boundary.mjs` and `ci:client-secret-guard` enforce page/action
  boundaries the rewritten panel must keep (no model call from a page render; comment-line rules).

---

## Reference List

Every site that touches the tuning revision mechanism (the purge set). The `nina_image_prefs`
revision (`lib/nina/imageprefs.ts`, `lib/admin/imageGenActions.ts`, `components/admin/ImageGenPanel.tsx`,
`lib/admin/imageGenModel.ts`, `components/admin/ImageGenTestPanel.tsx`, `app/admin/image-generation/page.tsx`,
`tests/nina.imageprefs.test.ts`, `tests/admin.imagegen.test.ts`) is a **different** mechanism and
is deliberately absent from this list.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `NinaTuning.revision` | `lib/nina/tuning.ts:793` | def | nina |
| `NinaTuningWrite` (Omit revision) | `lib/nina/tuning.ts:797` | def | nina |
| `coerceRevision` | `lib/nina/tuning.ts:854` | def | nina |
| `NINA_TUNING_DEFAULTS.revision: 0` | `lib/nina/tuning.ts:850` | def | nina |
| `coerceNinaTuning` (revision leg) | `lib/nina/tuning.ts:901` | def | nina |
| `ninaTuning.revision` column | `lib/db/schema.ts:2084` | def | db |
| `ninaTurns.tuningRevision` column | `lib/db/schema.ts:610` | def | db |
| revision doc-comments | `lib/db/schema.ts:593-610, 2048, 2075-2084` | doc | db |
| `tuningFromRow` → `revision: row.revision` | `lib/nina/queries.ts:3596` | call | nina |
| `writeNinaTuning` revision bump SQL | `lib/nina/queries.ts:3707-3710` | call | nina |
| `NinaTurnInsert.tuningRevision` | `lib/nina/queries.ts:402-406` | def | nina |
| `insertNinaTurn` writes it | `lib/nina/queries.ts:2662` | call | nina |
| `writeNinaTuning` doc (revision) | `lib/nina/queries.ts:3677-3702` | doc | nina |
| `NinaTurnTrace.tuningRevision` | `lib/nina/turn.ts:191-199` | def | nina |
| `NinaTurnRow.tuningRevision` | `lib/nina/turn.ts:248-249` | def | nina |
| trace init `input.tuning.revision` | `lib/nina/turn.ts:739` | call | nina |
| `store.record` passes it | `lib/nina/turn.ts:1035` | call | nina |
| `dbNinaTurnStore` maps it | `lib/nina/gateway.ts:438` | impl | nina |
| `ninaChatTurnStore` maps it | `lib/nina/chatturn.ts:189` | impl | nina |
| `AdminTuningResult.revision` | `lib/admin/tuningActions.ts:47-54` | def | admin |
| save note "Saved as revision N" | `lib/admin/tuningActions.ts:126` | impl | admin |
| reset note "as revision N" | `lib/admin/tuningActions.ts:173` | impl | admin |
| reset doc "bumps the revision" | `lib/admin/tuningActions.ts:134-147` | doc | admin |
| `TuningDraft` comment (revision) | `lib/admin/tuningModel.ts:53` | doc | admin |
| `ninaTuningResetSchema` | `lib/admin/schema.ts:499-502` | def | admin (deleted in P2) |
| `revision` prop + resync | `components/admin/CharacterPanel.tsx:106,127,141-146` | call | components |
| header `· revision {revision}` | `components/admin/CharacterPanel.tsx:219` | call | components |
| preview `· revision {revision}` | `components/admin/CharacterPanel.tsx:409` | call | components |
| reset copy "bumps the revision" | `components/admin/CharacterPanel.tsx:473` | call | components |
| `revision={tuning.revision}` | `app/admin/personality/page.tsx:97` | call | app |
| hub `Revision {tuning.revision}.` | `app/admin/page.tsx:160` | call | app |
| DialSlider comment re revision | `components/admin/DialSlider.tsx:40` | doc | components |
| system.ts comment "no revision number" | `lib/nina/prompts/system.ts:477` | doc | nina |
| revision coercion tests | `tests/nina.tuning.test.ts:354,362-363,382,426` | test | tests |
| draft-has-no-revision test | `tests/admin.tuning.test.ts:72-74` | test | tests |
| two-actions test (save+reset) | `tests/admin.tuning.test.ts:327-333` | test | tests (P2) |
| revalidate test comment | `tests/admin.tuning.test.ts:339` | test | tests |
| `tuning_revision` column tests | `tests/db.schema.nina.test.ts:507,760-770,819` | test | tests |
| turn records-revision test | `lib/nina/turn.test.ts:585-594` | test | tests |
| `{...DEFAULTS, revision: 9}` fixture | `tests/nina.imagerun.test.ts:135` | test | tests |
| both columns' birth | `drizzle/0005_nina_persona_tuning.sql:21,25` | config | drizzle |
| next migration tag 0016 | `drizzle/meta/_journal.json` (idx 15) | config | drizzle |

Save/Discard/Reset + draft model (R2's deletion set):

| Symbol | File:line | Kind |
|---|---|---|
| Save / Discard / Reset buttons + `confirmingReset` | `components/admin/CharacterPanel.tsx:428-493` | impl |
| `run()` transition helper | `components/admin/CharacterPanel.tsx:185-189` | impl |
| `resetNinaTuningAction` | `lib/admin/tuningActions.ts:148-178` | impl |
| `ninaTuningResetSchema` + type | `lib/admin/schema.ts:499-502` | def |
| per-row `unsaved` dot (`rowUnsaved`) | `components/admin/CharacterPanel.tsx:181-183` | impl |
| `N unsaved` header counter | `components/admin/CharacterPanel.tsx:206-210` | impl |
| blur-not-debounce precedent | `components/admin/MemoryTable.tsx:29-40` | doc |

---

## Impact Points (files that WILL need changes)

1. `lib/nina/tuning.ts` — drop `revision` from `NinaTuning`/defaults/`coerceNinaTuning`,
   `coerceRevision`, `NinaTuningWrite` becomes the plain type — **phase 1**
2. `lib/db/schema.ts` — drop `ninaTuning.revision`, `ninaTurns.tuningRevision` + their docs — **phase 1**
3. `drizzle/0016_*.sql` (new, generated) — two `ALTER TABLE … DROP COLUMN` — **phase 1**
   (committed, NOT applied — the drop lands after deploy)
4. `lib/nina/queries.ts` — `tuningFromRow`, `tuningToColumns`, `writeNinaTuning` upsert,
   `NinaTurnInsert`, `insertNinaTurn`, docs — **phase 1**
5. `lib/nina/turn.ts` — `NinaTurnTrace`, `NinaTurnRow`, trace init, `store.record` — **phase 1**
6. `lib/nina/gateway.ts` + `lib/nina/chatturn.ts` — drop the `tuningRevision` mapping — **phase 1**
7. `lib/admin/tuningActions.ts` — drop `revision` from result + notes; **phase 2** deletes
   `resetNinaTuningAction` and re-shapes the save note into the auto-save status
8. `lib/admin/schema.ts` — delete `ninaTuningResetSchema` — **phase 2**
9. `components/admin/CharacterPanel.tsx` — **phase 1**: re-key the draft↔prop sync off revision,
   strip revision strings; **phase 2**: the auto-save rewrite (no Save/Discard/Reset, debounced
   slider save, immediate toggle/radio save, blur notes save, status surface)
10. `app/admin/personality/page.tsx` — drop the `revision` prop — **phase 1**
11. `app/admin/page.tsx` — drop "Revision N." from the Her-character card (image card untouched) — **phase 1**
12. `components/admin/DialSlider.tsx` — comment-only (revision mention); the `unsaved` prop stays
    (ImageGenPanel still uses it) — **phase 1**
13. `lib/nina/prompts/system.ts:477`, `lib/admin/tuningModel.ts:53` — comment tweaks — **phase 1**
14. Tests — `tests/nina.tuning.test.ts`, `tests/db.schema.nina.test.ts`, `lib/nina/turn.test.ts`,
    `tests/nina.imagerun.test.ts` (**phase 1**); `tests/admin.tuning.test.ts` (both phases:
    revision strings P1, two-actions→one-action P2) — **phases 1 & 2**
15. New/updated panel tests for the auto-save pipeline (debounce, immediate-commit, blur-commit,
    no Save/Discard/Reset rendered) — **phase 2**

**This document describes. The plan files prescribe.**
