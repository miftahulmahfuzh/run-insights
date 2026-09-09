# Code Analysis: Admin Image generation simplification (revision purge, auto-save, focus hints)

**Type:** Refactoring
**Date:** 2026-09-09 15:33 (+07)
**Session ID:** 20260909-153327-6A82
**Plan:** `ADMIN_IMAGEGEN_SIMPLIFY_PLAN.md` (3 phase(s))
**Worktree:** `/home/miftah/run-insights/.claude/worktrees/admin-imagegen-simplify` — branch `worktree-admin-imagegen-simplify` (reused; cut fresh from `origin/main` @ `8652e42` before analysis, so base = origin/main tip and the tree described here is the tree the plans pin to)

---

## User Input

### Original User Request

> 1. pada admin page -> Image generation. buat systemnya lebih simple:
> 1a. purge mekanisme prompt revision tracking (frontend & backend & db both). hal ini disebabkan karena Image generation settings is more like a configuration tuning, not a prompt update (which we need to track the history version of)
> 1b. hapus tombol Save every parameter, Discard changes dan Reset to defaults. buat Personality capable to auto-save everytime some changes are made.
> 2. pada Focus on section, hapus redundant description:
> 2a. face pada Face, skin pada Skin, etc

### User-Provided Context

None beyond the rationale above. The rationale in 1a is the specification for what may be deleted: revision tracking exists to version *prompts*; image-generation settings are *configuration tuning*, so the version history has no audience and goes.

### User-Provided Files

None.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Purge the prompt revision-tracking mechanism from the Image generation settings — frontend, backend and database both — because these settings are configuration tuning, not a prompt update that needs version history |
| R2 | Remove the "Save every parameter", "Discard changes" and "Reset to defaults" buttons; make the panel auto-save every time a change is made, the way Personality does |
| R3 | In the "Focus on" section, remove the redundant description under each option ("face" under Face, "skin" under Skin, etc.) |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**: The `/admin/image-generation` panel ships a three-button staged-commit model (edit a local draft → press "Save every parameter") wrapped in a database-side revision counter that displays "revision N" in three places. Both are machinery borrowed from a *prompt-versioning* mental model that this feature does not have: the row is one configuration record, upserted in place, read live by the next generation — there is no history, no diffing, and no rollback consumer of the revision number anywhere in the codebase. The user asks for the model the sibling Personality tab already shipped (its "simplify set" removed the identical button row and made it auto-save). Additionally, each of the six "Focus on" checkboxes renders a hint line that is literally the lowercased label ("face" under Face), which is noise.

**Success Criteria**:

1. **R1** — the string `revision` no longer appears in the image-prefs stack: no `nina_image_prefs.revision` column (dropped by migration), no `revision` member on `NinaImagePrefs`/`NinaImagePrefsWrite`/`NinaImagePrefsInput`/`AdminImageGenResult`, no revision in `readNinaImagePrefs`/`writeNinaImagePrefs`, no revision prop or "revision N" copy in the page, the panel, or the `/admin` hub card. `updatedAt` stays — it records row freshness, not versioning.
2. **R2** — the panel has no Save, no Discard, no Reset (button **and** backend action **and** Zod schema all gone, exactly as the Personality simplify set deleted `resetNinaTuningAction`). Every control commits at the moment its edit is finished — dials debounced, discrete controls on change, text on blur — through the one whole-row action; a tri-state status line (Saving… / Saved / Unsaved edits) replaces the button row; controls are never disabled while a save is in flight.
3. **R3** — the six focus cards render their label only; the hint line is gone.
4. `npx vitest run`, `npm run lint`, `npx tsc --noEmit` (or the repo's equivalents) all green after each phase, with the structural tests re-pinned to the new invariants rather than deleted wholesale.

**Key Considerations**:

- **"buat Personality capable to auto-save" is read as "make it like Personality — auto-save on every change."** Evidence: `components/admin/CharacterPanel.tsx:64-96` records the Personality simplify set's R2 in almost identical words (*"remove the Discard and Reset buttons; make Personality auto-save every time a change is made"*) and ships the full pattern this request now asks the image panel to adopt. Stated inference; the plan is written against it.
- **The auto-save pattern is precedented in-repo, not invented.** `CharacterPanel.tsx` gives the whole architecture: `draft` + `saved` state, debounced dial commits (`TUNING_DIAL_COMMIT_DEBOUNCE_MS = 600`), blur-commit text, change-commit discrete controls, `mergeTuningAfterSave` per-field canonical adoption, tri-state status line, controls never locked on `pending`. Its safety argument (one writer, one operator, sequential Server-Action dispatch, idempotent whole-row upsert) transfers verbatim: `nina_image_prefs` is one row per user upserted on `user_id`.
- **Reset deletion follows the same precedent.** The Personality simplify set deleted `resetNinaTuningAction` outright (`lib/admin/tuningActions.ts:39` records it). `resetNinaImagePrefsAction`'s only caller is the button being removed; an action whose UI is gone is dead code this set deletes. Defaults survive as `DialSlider`'s `defaultValue` marker and "default" labels — the `defaults` prop stays.
- **Whole-draft commits keep "one save, not eleven" (the panel's plan invariant 7).** Auto-save does not mean per-field actions: every commit still sends the complete draft through the one `saveNinaImagePrefsAction`, so Next's sequential per-client dispatch cannot interleave writes out of order.
- **Coercion on write is why the merge helper exists.** `writeNinaImagePrefs` coerces before storing (`coerceNinaImagePrefs` collapses whitespace, clamps), so the stored row can differ cosmetically from what was typed; the panel must adopt the canonical row per-field (only fields still equal to what was dispatched), or the operator's in-flight keystrokes would be reverted by the save's own response.
- **DROP COLUMN deployment order (measured repo rule):** `writeNinaImagePrefs` INSERTs `revision: 1` explicitly and `readNinaImagePrefs` is a bare `select().from(ninaImagePrefs)` (drizzle expands to the schema's column list). Old deployed code against a dropped column fails; new code against a still-present column is silently fine. So the migration runs **after** the code deploy — and this repo's single database **is production** (`db:migrate` writes production; there is no separate dev instance).
- **Migration numbering:** the next free index is `0017` locally (journal tip `0016_retire_tuning_revision`); origin/main must be checked for a taken number at implementation time — a peer set can take `0017` between planning and landing.
- **`NINA_IMAGE_FOCUS_SPECS[key].userSaid` becomes dead data after R3.** Its only reader is `imageFocusCopy`'s hint (the line R3 removes); the prompt assembler has its own `NINA_FOCUS_EMPHASIS` record (`lib/nina/imagegen.ts:319-344`) that never reads the spec's `userSaid`. The negative clinical-synonym test pins `label`, not `userSaid`, so the vocabulary protection survives. The set's own theme (a simplification pass; a member whose only reader is its own test will drift) decides: R3 removes the member and its one test pin. Recorded as a plan Decision.
- **`ImageGenTestPanel`'s `dirty` prop survives R2** — with auto-save it is transient (true only while a debounce is armed or a blur-pending edit exists), which is still exactly the warning the test panel wants ("you are about to spend a generation against settings that are not what you are looking at").
- **What does NOT change:** the photo-reference storage model (`reference_source`/`reference_id`), the prompt assembler, the test-generation actions (`runNinaImageTestAction`/`readNinaImageTestAction`), `NINA_IMAGE_PREFS_DEFAULTS` as the read-path fallback, the five-band prompt-length ladder, and the unconditional body canon (plan invariant 4 of the original image-gen set).

---

## Analysis Scope

### Explicitly Mentioned Files

None (`@`-free prompt). Inferred target surface:

- `app/admin/image-generation/page.tsx`
- `components/admin/ImageGenPanel.tsx`
- `lib/admin/imageGenActions.ts`
- `lib/nina/imageprefs.ts`, `lib/nina/queries.ts`, `lib/db/schema.ts`
- `app/admin/page.tsx` (hub card), `components/admin/CharacterPanel.tsx` (the precedent, read-only)

### Discovered Related Files

- `lib/admin/imageGenModel.ts` — client-safe draft model; `imageFocusCopy`, `toImageGenDraft`, `changedImageGenFields`
- `lib/admin/schema.ts:655-705` — `ninaImagePrefsWriteSchema`, `ninaImagePrefsResetSchema`
- `lib/admin/tuningActions.ts` / `lib/admin/tuningModel.ts` / `components/admin/CharacterPanel.tsx` — the shipped auto-save precedent this set mirrors
- `components/admin/ImageGenTestPanel.tsx` — consumes `dirty`; one comment mentions the revision sync
- `drizzle/0011_natural_nico_minoru.sql` (created `nina_image_prefs` with `revision`), `drizzle/0016_retire_tuning_revision.sql` (the exact precedent migration), `drizzle/meta/_journal.json` (tip idx 16 → next 0017)
- `lib/nina/imagegen.ts:299-344` — `NINA_FOCUS_EMPHASIS` (proves `userSaid` has no prompt-path reader)
- Tests: `tests/admin.imagegen.test.ts`, `tests/nina.imageprefs.test.ts`, `tests/db.schema.nina.test.ts`; new-pin precedent in `tests/admin.tuning.test.ts`

---

## Current Dataflow

### Entry Point: `/admin/image-generation` (Server Component)

**Location:** `app/admin/image-generation/page.tsx:100`
**Trigger:** authenticated GET; `requireAdmin()` first, then three parallel reads (`readNinaImagePrefs`, `readNinaTuning`, `listNinaPhotoReferences`)
**Read-side mapping:** `toImageGenDraft(prefs)` → `ImageGenDraft` (revision stays on the row, passed as its own prop `revision={prefs.revision}` at :143)
**Next Step:** renders `ImageGenPanel` with `prefs`, `defaults`, `revision`, server-assembled `promptPreview` (`buildNinaImagePrompt` — pure), `references`, `photoTotal`

### Processing Chain (write path, staged-commit today)

1. **Control edit** → local `setDraft` only (`ImageGenPanel.tsx:166-181`); nothing writes
2. **"Save every parameter"** (:436-456) → `run(() => saveNinaImagePrefsAction({ …whole draft… }))` inside `useTransition`; **"Discard changes"** (:458-467) → `setDraft(prefs)`; **"Reset to defaults"** (:469-502) → confirm block → `resetNinaImagePrefsAction`
3. **`saveNinaImagePrefsAction`** (`lib/admin/imageGenActions.ts:112-148`): `requireAdmin()` → `ninaImagePrefsWriteSchema.safeParse` → `toImagePrefsWrite` (explicit field pick; the client→store seam) → `writeNinaImagePrefs` → `revalidatePath('/admin/image-generation')` → returns `{ ok, revision, note: "Saved as revision N…" }`
4. **`resetNinaImagePrefsAction`** (:167-201): same shape, writes `NINA_IMAGE_PREFS_DEFAULTS` (copied, not the frozen singleton), returns revision
5. **Panel post-save:** the re-render carries a new `revision` prop; the render-time resync (:147-152) keys on `revision !== lastRevision` and resets the draft to the canonical prefs

### Data Persistence

**Database:** `nina_image_prefs` — one row per user (`user_id` PK). `writeNinaImagePrefs` (`lib/nina/queries.ts:3805-3826`) is a single upsert: insert path supplies `revision: 1`; conflict path computes `revision = revision + 1` **in SQL** (`:3817`) and refreshes `updated_at`. `readNinaImagePrefs` (:3784-3792) is a bare `select().from()` mapped through `imagePrefsFromRow` → `coerceNinaImagePrefs`; a user with no row gets the frozen `NINA_IMAGE_PREFS_DEFAULTS` (`revision: 0` = "never written").
**Cache:** none on this path — a committed row is in the next generation's prompt with no invalidation step. `revalidatePath` exists only so the server-assembled preview catches up.

### Exit Points

- `AdminImageGenResult` `{ ok, error?, note?, revision? }` to the panel; error paragraph (:429-434)
- Row read live at dispatch by `lib/nina/imagetest.ts` / `selfiegen.ts` — **none of these readers touch `revision`** (census below); the counter has no consumer outside the admin surface

---

## Key Data Structures

### `NinaImagePrefs`
**Location:** `lib/nina/imageprefs.ts:600-624`
**Fields:** `promptLength`, `focus` (six booleans), `wardrobe`, `venue`, `time`, `notes`, `reference { source, id }`, **`revision`** (:616-623; `0` = never written)
**Used In:** every layer; `NinaImagePrefsWrite = Omit<NinaImagePrefs, 'revision'>` (:627) is the write shape

### `ImageGenDraft`
**Location:** `lib/admin/imageGenModel.ts:54-87`
**Fields:** the row minus revision — the browser's shape; `changedImageGenFields` (:336-351) diffs draft vs saved as dotted paths
**Used In:** page mapping, panel state, action payload

### `AdminImageGenResult`
**Location:** `lib/admin/imageGenActions.ts:64-71`
**Fields:** `ok`, `error?`, `note?`, **`revision?`** — becomes `prefs?: ImageGenDraft` (canonical row back) in the auto-save shape, mirroring `AdminTuningResult.tuning`

---

## Dependencies

### Configuration / Environment / External Services

- **Postgres via drizzle** — `nina_image_prefs`; migration chain tip `0016`; next file `0017_*`. This repo's one database is production.
- **Auth.js session** — `requireAdmin()` gates page and every action (structural tests pin the order; untouched).
- **Next.js Server Actions** — sequential per-client dispatch is a load-bearing property of the auto-save design (`CharacterPanel.tsx:73-78`, citing the vendored docs).
- No env vars, no external services change.

---

## Reference List

Every site that touches what this set changes. "P" = owning phase (1 = auto-save, 2 = revision purge, 3 = focus hints).

| Symbol / site | File:line | Kind | P |
|---|---|---|---|
| `revision` column + docstring | `lib/db/schema.ts:2205-2212` | def | 2 |
| `user_id` PK header ("lets writeNinaImagePrefs bump revision in SQL") | `lib/db/schema.ts:2131-2134` | doc | 2 |
| create-table `"revision" integer NOT NULL` + seed copy + data-step column | `drizzle/0011_natural_nico_minoru.sql:16,40-41,59` | def/hist | 2 |
| `NinaImagePrefs.revision` + docstring | `lib/nina/imageprefs.ts:616-623` | def | 2 |
| `NinaImagePrefsWrite = Omit<…, 'revision'>` | `lib/nina/imageprefs.ts:626-627` | def | 2 |
| `NinaImagePrefsInput.revision?` | `lib/nina/imageprefs.ts:644` | def | 2 |
| `NINA_IMAGE_PREFS_DEFAULTS.revision: 0` | `lib/nina/imageprefs.ts:663` | def | 2 |
| `coerceRevision` | `lib/nina/imageprefs.ts:666-670` | def | 2 |
| `coerceNinaImagePrefs` revision line + doc pins | `lib/nina/imageprefs.ts:689-702` | def | 2 |
| `imagePrefsFromRow` revision mapping | `lib/nina/queries.ts:3736` | call | 2 |
| `imagePrefsToColumns` docstring (revision absent on purpose) | `lib/nina/queries.ts:3740-3742` | doc | 2 |
| `writeNinaImagePrefs` — `revision: 1` insert, `revision + 1` upsert, docstrings | `lib/nina/queries.ts:3794-3826` | def/call | 2 |
| `AdminImageGenResult.revision` | `lib/admin/imageGenActions.ts:69-70` | def | 1,2 |
| `saveNinaImagePrefsAction` — destructure + return + note copy | `lib/admin/imageGenActions.ts:133-144` | def | 1,2 |
| file header ("the write … owns the clamp and the revision bump") | `lib/admin/imageGenActions.ts:36-37,47-57,105` | doc | 1,2 |
| `resetNinaImagePrefsAction` (whole action) | `lib/admin/imageGenActions.ts:150-201` | def | 1 |
| `NINA_IMAGE_PREFS_DEFAULTS` import (reset-only use) | `lib/admin/imageGenActions.ts:15` | call | 1 |
| `ninaImagePrefsResetSchema` + type | `lib/admin/schema.ts:702-705` | def | 1 |
| `ImageGenPanelProps.revision` + docstring | `components/admin/ImageGenPanel.tsx:90-94` | def | 2 |
| revision-keyed draft resync | `components/admin/ImageGenPanel.tsx:140-152` | call | 1,2 |
| header "revision {revision}" / summary "revision {revision}" | `components/admin/ImageGenPanel.tsx:200-204,395-402` | UI | 2 |
| `result` note/error display; `confirmingReset` state | `components/admin/ImageGenPanel.tsx:136-137,429-434` | UI | 1 |
| `run()` helper; Save / Discard / Reset buttons + confirm block | `components/admin/ImageGenPanel.tsx:183-187,436-502` | UI | 1 |
| `disabled={pending}` on every control | `components/admin/ImageGenPanel.tsx:235,276,307,329,351,374,392` | UI | 1 |
| unsaved baseline `prefs` prop → becomes `saved` state | `components/admin/ImageGenPanel.tsx:154-155` | call | 1 |
| `ImageGenDraft` docstring ("minus the revision…") | `lib/admin/imageGenModel.ts:53` | doc | 2 |
| `revision={prefs.revision}` prop pass + docstrings | `app/admin/image-generation/page.tsx:100-153` | call | 1,2 |
| hub card ". Revision {imagePrefs.revision}." | `app/admin/page.tsx:183` | UI | 2 |
| comment naming CharacterPanel's revision sync | `components/admin/ImageGenTestPanel.tsx:95-98` | doc | 2 |
| dirty→draft pins (rev-less draft) — stays true, reword only | `tests/admin.imagegen.test.ts:76-78` | test | 2 |
| action allowlist names reset action; Zod-loop "two actions" | `tests/admin.imagegen.test.ts:466-481,487-529` | test | 1 |
| "sends every control in the one save call" | `tests/admin.imagegen.test.ts:536-560` | test | 1 |
| revision fixture / coerce pins / column lists | `tests/nina.imageprefs.test.ts:420,441,446-447,500,520` | test | 2 |
| revision column pins (not-null, integer loop, lists) | `tests/db.schema.nina.test.ts:617,657-658,676` | test | 2 |
| `imageFocusCopy` hint = `userSaid` | `lib/admin/imageGenModel.ts:280-290` | def | 3 |
| focus card hint span (`copy.hint`) | `components/admin/ImageGenPanel.tsx:280-288` | UI | 3 |
| `NinaImageFocusSpec.userSaid` + six spec values | `lib/nina/imageprefs.ts:207-227` | def | 3 |
| hint-length / fallback-hint / userSaid-array pins | `tests/admin.imagegen.test.ts:91-92,135-136`; `tests/nina.imageprefs.test.ts:174` | test | 3 |
| **Precedent (read-only):** auto-save panel, merge, debounce, no-reset | `components/admin/CharacterPanel.tsx`; `lib/admin/tuningModel.ts:266,315-334`; `lib/admin/tuningActions.ts:39,120-160`; `tests/admin.tuning.test.ts` | impl | 1 |
| **Precedent (read-only):** tuning revision retirement migration | `drizzle/0016_retire_tuning_revision.sql` | def | 2 |

---

## Impact Points (files that WILL need changes)

1. `components/admin/ImageGenPanel.tsx` — the rewrite: commit pipeline, status line, button row gone (P1); revision copy gone (P2); focus hint span gone (P3)
2. `lib/admin/imageGenActions.ts` — save returns canonical `prefs`; reset action deleted (P1); revision out of result/notes (P2)
3. `lib/admin/imageGenModel.ts` — merge helper + debounce constant added (P1); docstring + `imageFocusCopy` simplified (P2, P3)
4. `lib/nina/imageprefs.ts` — revision out of type/defaults/coerce (P2); `userSaid` out of focus specs (P3)
5. `lib/nina/queries.ts` — revision out of `writeNinaImagePrefs`/`imagePrefsFromRow` (P2)
6. `lib/db/schema.ts` + new `drizzle/0017_*.sql` — column dropped, meta regenerated (P2)
7. `lib/admin/schema.ts` — reset Zod schema deleted (P1)
8. `app/admin/image-generation/page.tsx` — revision prop out (P2)
9. `app/admin/page.tsx` — hub-card revision sentence (P2)
10. `components/admin/ImageGenTestPanel.tsx` — one comment reword (P2)
11. `tests/admin.imagegen.test.ts`, `tests/nina.imageprefs.test.ts`, `tests/db.schema.nina.test.ts` — re-pinned per phase

**This document describes. The plan files prescribe.**
