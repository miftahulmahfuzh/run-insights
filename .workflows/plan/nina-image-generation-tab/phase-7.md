# Phase 7: Retire `nina_tuning.wardrobe`

**Plan set:** `NINA_IMAGE_GENERATION_TAB_PLAN.md`
**Analysis:** `20260907-124015-IMGN_code_analyzer.md`
**Satisfies:** R3 — *"remove Wardrobe field in /admin/personality (this new feature is more detailed version of it)"*
**Depends on:** Phase 2, Phase 4 (and transitively Phase 1, whose migration number and data copy this phase's drop stands on)
**Difficulty:** NORMAL
**Package:** `lib/nina` (primary), plus `lib/admin`, `components/admin`, `lib/db`, `app/admin`

> ### ⚠ THE BASE MOVED AFTER THIS PLAN WAS WRITTEN — READ THIS FIRST
>
> This plan was written against `b0e492a`, which was local `main` and **30 commits behind
> `origin/main`**. `origin/main` has since been merged into the branch and the worktree is now at
> **`4a7588e`**. That is the tree this plan must be applied to.
>
> Two feature sets landed in that merge and both changed facts this plan set depends on:
> **`nina-photo-caption-from-image`** (migration `0009_nina_message_photo_only.sql` — `nina_messages.photo_only`)
> and **`nina-photo-refs-and-bubble-actions`** (migration `0010_nina_image_provenance.sql` —
> `nina_message_images.source_avatar_id` / `source_image_id`).
>
> **Consequences for every plan in this set:**
>
> 1. **The migration watermark is `0010`**, not `0008`. The journal has eleven entries (`idx` 0-10).
>    Phase 1 generates **`0011`**; phase 7 generates **`0012`**. No other phase generates one.
> 2. **Hand-written backfill SQL is appended AFTER `npm run db:generate`, and regeneration silently
>    drops it.** Both landed migrations say so in banner comments. Never hand-name, never rename, and
>    if a migration is ever regenerated, diff the old file against the new one and re-append before
>    deleting anything.
> 3. **A row in `nina_message_images` is a *reference* when `source_avatar_id` OR `source_image_id`
>    is non-null** — see plan invariant 13. The three collection reads already exclude them through
>    `isOriginalPhoto()` (`lib/nina/queries.ts:1616-1618`).
> 4. **`lib/nina/prompts/` now exists** (`caption.ts`, `describe.ts`, `distill.ts`, `index.ts`,
>    `system.ts`, `tools.ts`) and `lib/nina/persona.ts` gained the Instructor character
>    (`isInstructor` :730, `INSTRUCTOR_COACHING` :813, `ninaInstructorCoachingBlock` :839).
>    **Image-prompt assembly did NOT move** — `buildNinaImagePrompt` and `sidecarText` are still in
>    `lib/nina/imagegen.ts`, and `ninaAppearance` / `NINA_FACE` / `NINA_APPEARANCE` are still in
>    `persona.ts`. Nothing under `lib/nina/prompts/` imports any of them.
> 5. **`scripts/check-llm-payload-boundary.mjs` now guards NINE symbols, not eight** — the ninth is
>    `captionNinaPhoto`, sanctioned in `lib/nina/caption.ts`, `lib/admin/chatPhotoActions.ts` and
>    `lib/nina/imagerun.ts`. Three of the nine are image symbols (`runNinaImageJob`,
>    `describeNinaImage`, `captionNinaPhoto`). The guard is a name allowlist over `app/`, `lib/`,
>    `components/`; `buildNinaImagePrompt` is not in it, so a pure preview in a render still passes
>    (plan invariant 5 re-verified against the guard as it now stands).
> 6. **EVERY `file:line` CITATION BELOW IS ADVISORY.** Line numbers shifted in `persona.ts` (+~13 to
>    +139), `queries.ts` (+~130), `tuning.ts` (+~22), `schema.ts` (+~64), `CharacterPanel.tsx` (+13),
>    `app/admin/layout.tsx` (+31) and `imagegen.ts` (-7). The reconciler corrected the load-bearing
>    ones in place; **grep for the symbol before editing, never `sed -n` a line range.**

---

## Goal

`wardrobe` stops being a `nina_tuning` concept in every layer it currently exists in: the
`/admin/personality` control, the `TuningDraft`, the Zod field, the `NinaTuning` member, the
coercer, the constant, the row mapping in both directions, and the column itself. After this phase
there is exactly **one** wardrobe in the codebase — `nina_image_prefs.wardrobe`, edited on
`/admin/image-generation` — so the two surfaces can no longer disagree about what she is wearing in
a photograph the operator only dressed once.

`notes` is untouched and stays exactly where it is. It is a *system-prompt* field; the wardrobe was
the only field on that page that was about a photograph rather than about who she is, which is why
it is the only one that leaves.

---

## Interface Contract

> **RECONCILED — the two things this phase most depends on are confirmed, and the migration number
> moved.**
>
> - **The phase 2 -> phase 7 wardrobe handover is confirmed sound, and it is enforced by the type
>   checker rather than by discipline.** Phase 2 changes `ninaAppearance(tuning: NinaTuning)` to
>   `ninaAppearance(prefs: NinaImagePrefs, detail?: NinaAppearanceDetail)` — **nominal** on
>   `NinaImagePrefs`, deliberately not structural on `{ wardrobe: string }`, so a surviving
>   `ninaAppearance(tuning)` is a **compile error**. `lib/nina/persona.ts:397` (`const wardrobe =
>   tuning.wardrobe.trim()`) is the only property access to `NinaTuning.wardrobe` outside the files
>   this phase owns, and phase 2 removes it. **Precondition B therefore cannot pass by accident** —
>   which is the property that makes this phase's `DROP COLUMN` safe to run unattended.
> - **Phase 1's data copy is confirmed to be in the migration that replays first.** Phase 1
>   generates **`0011`** and hand-appends the `INSERT … SELECT` that copies every
>   `nina_tuning.wardrobe` into `nina_image_prefs.wardrobe`; this phase generates **`0012`**, whose
>   `DROP COLUMN` therefore always replays after the copy, on a fresh database as well as on
>   production. Both numbers moved by two: the `origin/main` merge brought
>   `0009_nina_message_photo_only.sql` and `0010_nina_image_provenance.sql`, so the journal is at
>   eleven entries and the watermark is `0010`, not `0008`. **Precondition C and D are updated
>   accordingly** (`0011_snapshot.json`, and `grep -c '"tag"'` expects `12`).
> - **The two double-edits this phase found are still resolved the same way**, and the reconciler
>   confirms both: `docs/nina/persona.md:250-254` belongs to **phase 2**, which already retires the
>   wardrobe prose there, so this phase edits only `:332` and `:412`; and
>   `lib/nina/persona.ts:1473` (renumbered from `:1334`) belongs to **this phase**, region-disjoint
>   from phase 2's `:352-402`.
> - **The three shared files are confirmed region-disjoint after renumbering.**
>   `lib/admin/schema.ts`: phase 4 appends after `:481`, this phase deletes `:467` and an import
>   member at `:36`. `lib/nina/queries.ts`: phase 1 inserts a new `§10b` after `:3319`, this phase
>   edits `:3192` and `:3242` — both *above* the insertion point, so phase 1's landing does not move
>   them. `tests/db.schema.nina.test.ts`: phase 1 appends after `:565`, this phase edits `:447` and
>   `:544`.
> - **Every `file:line` in the Deletes list below was re-derived against `4a7588e`** and most of
>   them moved: `tuning.ts` +22, `queries.ts` +~130, `schema.ts` +64, `CharacterPanel.tsx` +13,
>   `persona.ts` +139, and the three test files by 26-51 lines. Grep the symbol anyway.

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**

- `lib/nina/tuning.ts` — `NINA_WARDROBE_MAX` (`:711`), `coerceNinaWardrobe` (`:721-729`),
  `NinaTuning.wardrobe` (`:784`), `NinaTuningInput.wardrobe` (`:815`),
  `NINA_TUNING_DEFAULTS.wardrobe` (`:853`), and the `coerceNinaTuning` line (`:904`).
  `NinaTuningWrite` changes shape as a consequence — it is `Omit<NinaTuning, 'revision'>` and is
  not itself edited.
- `lib/admin/schema.ts` — `ninaTuningWriteSchema.wardrobe` (`:467`) and the `NINA_WARDROBE_MAX`
  import member (`:36`). `NinaTuningWriteInput` changes shape as a consequence (inferred).
- `lib/db/schema.ts` — column `nina_tuning.wardrobe` (`:1870`) and its docstring (`:1864-1869`).
- Database — `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe";` in a **generated** migration.
- `components/admin/CharacterPanel.tsx` — the Wardrobe `<label>` block (`:371-392`), the
  `wardrobe: draft.wardrobe` save-payload line (`:449`), the `NINA_WARDROBE_MAX` import member
  (`:29`), and the `xl:grid-cols-2` wrapper that held Wardrobe beside Notes (`:370` through its closing `</div>` at `:414`).
- `lib/admin/tuningModel.ts` — `TuningDraft.wardrobe` (`:65`), `toTuningDraft`'s
  `wardrobe: tuning.wardrobe` (`:204`), `changedTuningFields`' `wardrobe` comparison (`:233`).
- `lib/admin/tuningActions.ts` — `toTuningWrite`'s `wardrobe` (`:86`), `saveNinaTuningAction`'s
  `wardrobe: string` parameter member (`:106`), `resetNinaTuningAction`'s
  `wardrobe: NINA_TUNING_DEFAULTS.wardrobe` (`:166`).
- `lib/nina/queries.ts` — `tuningFromRow`'s `wardrobe: row.wardrobe` (`:3192`, inside `tuningFromRow` at `:3147`) and
  `tuningToColumns`' `wardrobe: tuning.wardrobe` (`:3242`, inside `tuningToColumns` at `:3202`). **NOT in the analysis document's
  Reference List — found by re-grepping. Without these two lines the phase does not compile and
  does not write.**
- `tests/nina.tuning.test.ts` — the `coerceNinaWardrobe` / `NINA_WARDROBE_MAX` imports (`:13`,
  `:34`), the `wardrobe: []` hostile-input member (`:356`), the round-trip's `wardrobe` (`:383`),
  the three `coerceNinaWardrobe` assertions (`:390-394`), `NINA_TUNING_DEFAULTS.wardrobe` (`:429`),
  and `expect(isNinaTuningKey('wardrobe')).toBe(false)` (`:508`).
- `tests/admin.tuning.test.ts` — the `NINA_WARDROBE_MAX` import (`:27`), the
  `DEFAULTS.wardrobe` assertion (`:63`), the `wardrobe` member and expected path in the
  three-non-numeric-fields case (`:157`, `:160`), and the wardrobe halves of the two bound cases
  (`:248-266`).
- `tests/db.schema.nina.test.ts` — `'wardrobe'` from the column-list array (`:447`) and from the
  no-SQL-DEFAULT list (`:493`).
- Prose only, no symbols: the `wardrobe` sentence in `lib/nina/persona.ts:1473` (Step 10b —
  **inside phase 2's file, region-disjoint from phase 2's `:352-402`**),
  `components/admin/DialSlider.tsx:58`, `app/admin/personality/page.tsx:76`, and the passages in
  `docs/nina/persona.md` (`:332`, `:412`), `CHANGELOG.md:19` and the four `package_readme.md` files.

**Renames:** none. **Nothing is renamed anywhere in this phase.** In particular the generated
migration file keeps whatever name `drizzle-kit` gives it (plan invariant 10).

**Creates:**

- `drizzle/0012_<drizzle-kit's own suffix>.sql` — one `DROP COLUMN`, generated.
- `drizzle/meta/0012_snapshot.json` and a thirteenth `entries[]` element in `drizzle/meta/_journal.json`
  — both written by `drizzle-kit generate`, never by hand.

**Signature changes:**

- `saveNinaTuningAction(input: { userId, traits, dials, enabled, relationship, wardrobe, notes })`
  -> `saveNinaTuningAction(input: { userId, traits, dials, enabled, relationship, notes })`.
  The only caller in the repo is `components/admin/CharacterPanel.tsx`, edited in the same phase.
- `coerceNinaTuning(input)` still accepts anything; an input object that still carries a `wardrobe`
  key is silently ignored rather than rejected (see **Precondition C** below).

**Requires (from earlier phases) — every one of these is load-bearing:**

1. **Phase 2 must have removed the last read of `tuning.wardrobe`.** `lib/nina/persona.ts:397`
   is `const wardrobe = tuning.wardrobe.trim()` inside `ninaAppearance`, and `:398` branches on it.
   That is the **only** property access to `NinaTuning.wardrobe` outside the files this phase owns
   (verified by a repo-wide grep over `*.ts`/`*.tsx`, below).
   **VERIFIED against `.workflows/plan/nina-image-generation-tab/phase-2.md` (landed while this
   plan was being written).** Its Interface Contract states the signature change:
   `persona.ninaAppearance(tuning: NinaTuning) => string` **->**
   `persona.ninaAppearance(prefs: NinaImagePrefs, detail?: NinaAppearanceDetail) => string`, and
   adds — addressing this phase by number — *"Phase 7: this is the signature you were told to wait
   for. It is deliberately **nominal** on `NinaImagePrefs` rather than structural on
   `{ wardrobe: string }` … a leftover `ninaAppearance(tuning)` call is therefore a type error,
   which is the point."* That nominality is a gift to this phase: it means Precondition B cannot
   pass by accident. Phase 2 also declares `lib/nina/tuning.ts` — *"not one line"* — as belonging
   to phase 7, so Step 1 has no peer in that file.
2. **Phase 1 must have copied every existing `nina_tuning.wardrobe` value into
   `nina_image_prefs.wardrobe`.** This is the only destructive step in the plan set and the copy is
   what makes it reversible (index Rollback, and the index's Open Questions section states it as
   the reason there are none).
   **VERIFIED against `.workflows/plan/nina-image-generation-tab/phase-1.md` (landed while this
   plan was being written).** Its Files table reads: *"`drizzle/0011_*.sql` | create (generated,
   then appended) | `CREATE TABLE nina_image_prefs` from `db:generate`, plus one hand-appended
   `INSERT … SELECT` that copies `nina_tuning.wardrobe`"*, its goal statement says *"every existing
   `nina_tuning.wardrobe` value has been copied into the new row, which is what makes phase 7's
   column [drop safe]"*, it tests that *"exactly one migration copies the wardrobe into
   `nina_image_prefs`"*, and its own Rollback section notes the copy *"is in migration `0011`
   specifically so that on a fresh database it always replays **before**"* the drop. The dependency
   is mutual and both plans state it.
   Step 4 below still carries an explicit database gate (Precondition D) that refuses the drop if
   the copy is not observable **in the database being migrated** — a plan describing a copy and a
   database having received one are different facts, and only the second one protects the operator.
3. **Phase 1 must own migration `0011` and must have committed
   `drizzle/meta/0011_snapshot.json`.** The journal is at `0010` today
   (`drizzle/meta/_journal.json`, last entry `0010_nina_image_provenance`, eleven entries). **VERIFIED:** phase 1's
   Interface Contract claims *"exactly one migration pair, `drizzle/0011_<generated>.sql` and
   `drizzle/meta/0011_snapshot.json`, plus one appended entry in `drizzle/meta/_journal.json`. The
   name is whatever `npm run db:generate` chose. It is never edited."* So this phase is `0012`.
   The hazard remains and is worth stating because both phases write into the same directory:
   `drizzle-kit generate` diffs `lib/db/schema.ts` against **the newest snapshot in
   `drizzle/meta/`**, not against the live database — so if phase 1's snapshot is absent when this
   phase generates, drizzle-kit emits **one migration that both creates `nina_image_prefs` and
   drops `nina_tuning.wardrobe`**, duplicating phase 1's DDL, and will very likely open an
   interactive **table/column rename prompt** because it sees a `wardrobe` column disappearing from
   one table and appearing on another. Both are the wrong diff. Ordering is not optional.
4. **Phase 4 must have appended the image-prefs Zod schema to `lib/admin/schema.ts`.**
   This phase and phase 4 both edit that file: phase 4 **appends** a new schema after
   `ninaTuningResetSchema`; this phase **removes one line** from `ninaTuningWriteSchema` (`:467`)
   and one member from the `@/lib/nina/tuning` import (`:36`). Disjoint regions, but the same file —
   quote it as it will look after phase 4 and re-read it before editing.

**Leaves alone (owned by others):**

- `lib/nina/persona.ts:352-402` and its import list, `lib/nina/imagegen.ts`,
  `lib/nina/selfiegen.ts`, `lib/nina/avatargen.ts` and `tests/nina.imagerecipe.test.ts` —
  **Phase 2**. All five contain the string `wardrobe`; after phase 2 those hits describe
  `NinaImagePrefs.wardrobe`, which is the new surface and is a legitimate hit under the grep exit
  criterion. `tests/nina.imagerecipe.test.ts:118,144,148,205` in particular is **phase 2's rewrite
  and must not be edited here** (index: phase 2 owns "`tests/nina.imagerecipe.test.ts` restated for
  the new contract").
  **The one exception is `lib/nina/persona.ts:1473`, claimed by Step 10b below.** Phase 2's plan
  says of it: *"`persona.ts:1473`'s comment (\"`wardrobe`, which is `ninaAppearance`'s\") is still
  true. No edit."* That is correct **for phase 2's commit** and false after this one — see Step 10b
  for the argument and the region-disjointness that makes the edit safe.
- **`docs/nina/persona.md:239-255` — Phase 2, and this phase's original plan for it was WRONG.**
  Phase 2's Files table claims `docs/nina/persona.md:239-255` (*"the 'What she looks like' prose,
  per `persona.ts`'s same-commit rule"*), and its Step 7 already replaces the
  *"**The wardrobe is overridable (F34 R5).**"* paragraph at `:250-254` with one that reads *"**The
  wardrobe is overridable, and it lives on the image surface.** … the outfit paragraph is separate,
  and `nina_image_prefs.wardrobe` replaces it"*. **That is exactly the edit this phase would have
  made, so this phase must not make it.** Phase 2's own note — *"Phase 7 edits this same section
  again to retire `nina_tuning.wardrobe` from the prose"* — is stale relative to its own
  replacement text, which already names no `nina_tuning.wardrobe`. Step 12 below therefore edits
  **only `:332` and `:412`**, both of which fall outside `:239-255` and outside phase 2's claim.
  **Reconciler: this was a live double-edit and it is resolved in favour of phase 2.**
- `nina_image_prefs`, `lib/nina/imageprefs.ts`, `readNinaImagePrefs` / `writeNinaImagePrefs` and the
  picker union read — **Phase 1**.
- `app/admin/image-generation/page.tsx`, `components/admin/ImageGenPanel.tsx`,
  `lib/admin/imageGenModel.ts`, `lib/admin/imageGenActions.ts`, `components/admin/AdminNav.tsx`,
  `app/admin/layout.tsx`, `app/admin/page.tsx`, `tests/admin.imagegen.test.ts`,
  `tests/admin.shell.test.ts` — **Phase 4**.
- `components/admin/PhotoReferencePicker.tsx`, `components/admin/photoReferenceModel.ts` —
  **Phase 5**.
- `lib/nina/imagetest.ts`, `components/admin/ImageGenTestPanel.tsx` — **Phase 6**.
- **`notes` in every layer.** `NINA_NOTES_MAX`, `coerceNinaNotes`, `NinaTuning.notes`,
  `nina_tuning.notes`, `ninaTuningWriteSchema.notes`, `TuningDraft.notes` and the Notes control on
  `/admin/personality` all stay. The Notes control does not move page, does not change label and
  does not change bound.
- **`NINA_TUNING_KEYS` and all seventeen `*_enabled` columns.** **Confirmed, not assumed:**
  `NINA_TUNING_KEYS` is `[NINA_TUNING_RELATIONSHIP_KEY, ...NINA_TRAITS, ...NINA_DIALS]`
  (`lib/nina/tuning.ts:609-613`) — a spread over the relationship, twelve traits and four dials —
  and `wardrobe` appears in none of the three. `tests/nina.tuning.test.ts:508` asserts
  `isNinaTuningKey('wardrobe') === false`, and `lib/nina/tuning.ts:594` explains why (`''` is
  already the field's absence, so a toggle would be a second spelling for one fact). **No toggle
  column, no enable flag, and no key-derived loop is affected by this phase.** The
  `nina_tuning` column count therefore goes 39 -> 38, and the seventeen `*_enabled` columns are all
  seventeen still there.
- **Historical records, never edited.** These contain `wardrobe` and must keep it — rewriting a
  landed plan or an applied migration falsifies the record:
  `drizzle/0005_nina_persona_tuning.sql`, `drizzle/meta/0005..0010_snapshot.json`, and (once phase 1 lands) `drizzle/0011_*.sql` + `drizzle/meta/0011_snapshot.json` — phase 1's own `INSERT … SELECT` reads `nina_tuning.wardrobe` and its snapshot still describes the column,
  `lib/nina/.workflows/plan/P1-NIN-A000|A001|A002|A003|A005.md`,
  `components/admin/.workflows/plan/P2-CA-A000|A002.md`,
  `lib/nina/.workflows/todos.md:306,335`, `components/admin/.workflows/todos.md:53,62`.
  The grep exit criterion is scoped around them explicitly (see **Verification**).

**Cross-phase file collisions this phase is party to** (for the reconciler):

| File | This phase | Peer |
|---|---|---|
| `lib/admin/schema.ts` | removes `wardrobe` from `ninaTuningWriteSchema` + one import member | Phase 4 appends the prefs schema |
| `lib/nina/queries.ts` | edits `tuningFromRow` / `tuningToColumns` in §10 | Phase 1 adds `readNinaImagePrefs` / `writeNinaImagePrefs` / the picker union read in a new section |
| `drizzle/meta/_journal.json` | appends entry `idx: 12` (via `db:generate`) | Phase 1 appends entry `idx: 11` (via `db:generate`) — **strictly ordered** |
| `docs/nina/persona.md` | `:332` and `:412` **only** | Phase 2 claims `:239-255` and already retires the wardrobe prose there — **resolved in favour of phase 2**, see Leaves alone |
| `lib/nina/persona.ts` | `:1473` **only** — one word in a docblock, Step 10b | Phase 2 claims `:352-402` + the import list, and declared `:1473` "No edit" while `NinaTuning.wardrobe` still existed |
| `components/admin/.workflows/package_readme.md` | the `CharacterPanel.tsx` table row | Phase 5's H6 adds two *new* rows (`PhotoReferencePicker.tsx`, `photoReferenceModel.ts`) — different rows, same table |
| `CHANGELOG.md` | one clause | **Uncontested** — phase 2's contract explicitly cedes `CHANGELOG.md` and `lib/nina/.workflows/package_readme.md` to phase 7 |

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/tuning.ts` | modify | `NINA_WARDROBE_MAX`, `coerceNinaWardrobe`, the `NinaTuning` / `NinaTuningInput` members, the default, the `coerceNinaTuning` line, §6's title, and the R4 header prose that argues about `wardrobe` |
| `lib/nina/queries.ts` | modify | `tuningFromRow` and `tuningToColumns` stop mapping the column (both directions) |
| `lib/db/schema.ts` | modify | drop the `wardrobe` column + its docstring; correct the table header's string count |
| `drizzle/0012_*.sql` | create (generated) | `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe";` |
| `drizzle/meta/0012_snapshot.json` | create (generated) | drizzle-kit's snapshot |
| `drizzle/meta/_journal.json` | modify (generated) | one appended entry |
| `lib/admin/schema.ts` | modify | drop `ninaTuningWriteSchema.wardrobe` and the `NINA_WARDROBE_MAX` import member |
| `lib/admin/tuningActions.ts` | modify | drop `wardrobe` from `toTuningWrite`, the action parameter, and the reset defaults |
| `lib/admin/tuningModel.ts` | modify | drop `TuningDraft.wardrobe`, `toTuningDraft`'s line, `changedTuningFields`' comparison, and the two docstrings that name the field |
| `components/admin/CharacterPanel.tsx` | modify | delete the Wardrobe control, collapse the two-column wrapper to a single Notes block, drop the save-payload line and the import member |
| `components/admin/DialSlider.tsx` | modify | one comment sentence that cites `wardrobe` as an example of a toggle-less field |
| `app/admin/personality/page.tsx` | modify | the header copy *"the wardrobe the camera reads"* |
| `lib/nina/persona.ts` | modify | **`:1473` only** — one docblock sentence that counts two non-dial R3 fields; see Step 10b for why this crosses into phase 2's file |
| `tests/nina.tuning.test.ts` | modify | drop the coercer's cases, the default assertion, the round-trip member, the hostile-input member, the negative key assertion and two imports |
| `tests/admin.tuning.test.ts` | modify | drop the draft/diff/bound assertions for the field and one import |
| `tests/db.schema.nina.test.ts` | modify | 39 -> 38 columns; drop `'wardrobe'` from two lists |
| `docs/nina/persona.md` | modify | **`:332` and `:412` only** — the settings-table row and the where-it-lives row. `:250-254` belongs to phase 2 and it already retired the prose there |
| `CHANGELOG.md` | modify | one clause in the (Unreleased) tuning entry |
| `lib/nina/.workflows/package_readme.md` | modify | four passages |
| `lib/db/.workflows/package_readme.md` | modify | three passages |
| `lib/admin/.workflows/package_readme.md` | modify | one passage |
| `components/admin/.workflows/package_readme.md` | modify | one table cell |

**23 files** (three of them written by `drizzle-kit`, not by hand; one — `lib/nina/persona.ts` — a
single-sentence edit in a file phase 2 owns, argued for in Step 10b).

---

## Preconditions

Check all four **before** Step 1. Three are one command each.

**A. `npm install` has been run in this worktree.** `/home/miftah/.worktrees/run-insights/nina-image-generation-tab/node_modules` **does not exist**. Every verification command in this plan — `db:generate`, `typecheck`, `lint`, `test`, `format:check` — dies without it. `.env.local` *is* present in the worktree (`drizzle.config.ts` throws without `DATABASE_URL_UNPOOLED`), so only the install is missing.

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab && npm install
```

**B. Phase 2 has landed and `lib/nina/persona.ts` no longer reads `tuning.wardrobe`.**

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab
grep -rn '\.wardrobe' --include='*.ts' --include='*.tsx' app components lib scripts | grep -v 'prefs\.wardrobe'
```

Expected: hits only in `lib/nina/queries.ts`, `lib/admin/tuningModel.ts`,
`lib/admin/tuningActions.ts` and `components/admin/CharacterPanel.tsx` — the four files this phase
edits. **A hit in `lib/nina/persona.ts` means phase 2 is not done; stop.** Phase 2 made this check
sharp on purpose: its `ninaAppearance(prefs: NinaImagePrefs, …)` is *nominal* on `NinaImagePrefs`,
so a surviving `ninaAppearance(tuning)` is a type error rather than a silently-accepted structural
match. A second, cheaper form of the same check:

```bash
grep -n 'ninaAppearance' lib/nina/persona.ts lib/nina/imagegen.ts
# expect the parameter to be `prefs: NinaImagePrefs`, never `tuning: NinaTuning`
```

**C. Phase 1's migration `0011` is generated, journalled and applied.**

```bash
ls /home/miftah/.worktrees/run-insights/nina-image-generation-tab/drizzle/meta/0011_snapshot.json
grep -c '"tag"' /home/miftah/.worktrees/run-insights/nina-image-generation-tab/drizzle/meta/_journal.json   # expect 12
```

**D. THE DATA IS ALREADY SAFE — verify the copy, do not trust it.** Run this against the same
database `drizzle.config.ts` points at, and read the number:

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab
node --env-file=.env.local -e "
const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL_UNPOOLED)
sql\`
  select
    (select count(*) from nina_tuning where wardrobe <> '')                          as tuning_set,
    (select count(*) from nina_image_prefs where wardrobe <> '')                     as prefs_set,
    (select count(*) from nina_tuning t
       where t.wardrobe <> ''
         and not exists (select 1 from nina_image_prefs p
                          where p.user_id = t.user_id and p.wardrobe = t.wardrobe))  as uncopied
\`.then((r) => console.log(r[0]))
"
```

**`uncopied` must be `0`.** If it is anything else, phase 1's copy did not happen or did not
happen for every row, and **the drop must not be generated** — the operator's only wardrobe line
would be destroyed. Route it back to phase 1 rather than working around it. (`tuning_set` and
`prefs_set` are printed so the implementer can see whether there was anything to copy at all; a
`tuning_set` of `0` makes the drop trivially safe.)

---

## Implementation Steps

### Step 1: Take `wardrobe` out of `lib/nina/tuning.ts`

**File:** `lib/nina/tuning.ts:562-575`, `:681-708`, `:757-770`, `:786-796`, `:825-834`, `:876-886`

**Change:** Five separate edits in one file: the R4 header paragraph that argues about the field,
the §6 constant and coercer, the two interface members, the default, and the coercion line.

**Code — edit 1 of 5.** Replace `lib/nina/tuning.ts:562-575` (the block that opens
`── \`relationship\` IS IN HERE AND \`wardrobe\` / \`notes\` ARE NOT ──` and runs to the closing
`*/` of that docstring). The old text is:

```
 * ── `relationship` IS IN HERE AND `wardrobe` / `notes` ARE NOT ────────────────────────────────
 * `nobody` is NOT an off switch for the relationship. Read `NINA_RELATIONSHIP_BLOCKS.nobody` in
 * `persona.ts`: it is four sentences of active instruction — *"You do not know him"*, *"you keep
 * your distance"*, *"you do not go first"* — the COLDEST setting on the axis, not the absent one.
 * Choosing it to "exclude" the parameter makes the prompt longer and changes her behaviour
 * drastically. And there is no representable "no relationship" at all: `ninaIdentity` needs a first
 * paragraph and `ninaNameRules` needs an address rule, and a prompt that names no address form
 * teaches her to invent one. So disabling the relationship means what disabling anything else
 * means: `NINA_DEFAULT_RELATIONSHIP`, whose blocks ARE today's `NINA_IDENTITY`.
 *
 * `wardrobe` and `notes` are the mirror image and therefore have NO toggle. `''` genuinely is their
 * absence — `ninaOperatorNotesBlock` returns `''` and the whole STANDING INSTRUCTIONS section
 * disappears, `ninaAppearance` falls back to `NINA_DEFAULT_OUTFIT` — so both already contribute zero
 * bytes at their empty value, and a toggle would be a second spelling for a state the field already
 * has. Two spellings for one fact is one too many.
 */
```

and the replacement is:

```ts
 * ── `relationship` IS IN HERE AND `notes` IS NOT ──────────────────────────────────────────────
 * `nobody` is NOT an off switch for the relationship. Read `NINA_RELATIONSHIP_BLOCKS.nobody` in
 * `persona.ts`: it is four sentences of active instruction — *"You do not know him"*, *"you keep
 * your distance"*, *"you do not go first"* — the COLDEST setting on the axis, not the absent one.
 * Choosing it to "exclude" the parameter makes the prompt longer and changes her behaviour
 * drastically. And there is no representable "no relationship" at all: `ninaIdentity` needs a first
 * paragraph and `ninaNameRules` needs an address rule, and a prompt that names no address form
 * teaches her to invent one. So disabling the relationship means what disabling anything else
 * means: `NINA_DEFAULT_RELATIONSHIP`, whose blocks ARE today's `NINA_IDENTITY`.
 *
 * `notes` is the mirror image and therefore has NO toggle. `''` genuinely is its absence —
 * `ninaOperatorNotesBlock` returns `''` and the whole STANDING INSTRUCTIONS section disappears — so
 * it already contributes zero bytes at its empty value, and a toggle would be a second spelling for
 * a state the field already has. Two spellings for one fact is one too many.
 *
 * ── THERE USED TO BE A SECOND FIELD IN THAT PARAGRAPH ─────────────────────────────────────────
 * `wardrobe` was a `nina_tuning` column, a `NinaTuning` member and a control on
 * `/admin/personality` until F41 R3: *"remove Wardrobe field in /admin/personality (this new
 * feature is more detailed version of it)"*. It lives on `nina_image_prefs.wardrobe` now, edited on
 * `/admin/image-generation` beside the venue, the time, the prompt length and the focus set that
 * dress the same photograph — because what she is wearing is a fact about a PHOTOGRAPH and not
 * about who she is, and two surfaces both claiming to dress her is the one thing R3 cannot mean.
 * It never had a toggle and still does not; it simply is not this module's field any more. This
 * paragraph is here so the next reader does not re-add it: the sentence above about `notes` used to
 * be about two fields, and a reader who found only one would reasonably wonder which was lost.
 */
```

**Code — edit 2 of 5.** Replace `lib/nina/tuning.ts:680-690` — §6's banner, the constant and its
docstring:

```ts
/* ============================================================================
 * §6 The free-text field
 * ==========================================================================*/

/**
 * Appended verbatim to a system prompt that is already about seven kilobytes. 2000 characters is
 * roughly a screen of notes — enough for the operator to say something this model has no dial for,
 * and small enough that it cannot drown the canon it is appended to.
 */
export const NINA_NOTES_MAX = 2000
```

That block replaces everything from the `§6 The two free-text fields` banner through
`export const NINA_NOTES_MAX = 2000` — i.e. it deletes `NINA_WARDROBE_MAX` and its docstring and
reorders nothing else. (§6 is now one field, hence the singular banner. `NINA_NOTES_MAX`'s own
docstring is unchanged, character for character.)

**Code — edit 3 of 5.** Delete the wardrobe coercer outright. Remove exactly this, from
`lib/nina/tuning.ts:698-708`:

```
/**
 * The wardrobe line, made safe. Whitespace collapsed to single spaces, because this is ONE line
 * and a newline inside an image prompt splits a sentence the provider then reads as two.
 *
 * `''` means "no override" — phase 4 falls back to `NINA_APPEARANCE`'s heather-grey tank, and that
 * is what makes the empty default reproduce today's photographs exactly.
 */
export function coerceNinaWardrobe(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, NINA_WARDROBE_MAX)
}

```

Nothing replaces it. `coerceNinaNotes` and its docstring follow immediately and are untouched.
(Phase 1's `lib/nina/imageprefs.ts` owns the equivalent coercer for the new field; this module must
not keep a second one, which is precisely the *"a constant that is agreed rather than shared is a
constant that will one day disagree"* rule `lib/admin/schema.ts` quotes.)

**Code — edit 4 of 5.** In the `NinaTuning` interface, replace `lib/nina/tuning.ts:760-763`:

```
  readonly enabled: Readonly<Record<NinaTuningKey, boolean>>
  /** `''` = no override; phase 4 uses `NINA_APPEARANCE`'s outfit. */
  readonly wardrobe: string
  /** `''` = nothing appended to the system prompt. */
```

with:

```ts
  readonly enabled: Readonly<Record<NinaTuningKey, boolean>>
  /**
   * `''` = nothing appended to the system prompt.
   *
   * The ONE free-text field left on this type. `wardrobe` sat beside it until F41 R3 moved the
   * wardrobe to `nina_image_prefs`; `notes` stayed because it is a SYSTEM-PROMPT field — it is
   * what the operator wants her to know, not what he wants her to be wearing.
   */
```

Then in `NinaTuningInput`, delete `lib/nina/tuning.ts:815`:

```
  readonly wardrobe?: unknown
```

**Code — edit 5 of 5.** In `NINA_TUNING_DEFAULTS`, delete `lib/nina/tuning.ts:853`:

```
  wardrobe: '',
```

and in `coerceNinaTuning`'s return object, delete `lib/nina/tuning.ts:904`:

```
    wardrobe: coerceNinaWardrobe(input?.wardrobe),
```

**Impact:** `NinaTuning` loses a member, so `NinaTuningWrite = Omit<NinaTuning, 'revision'>` loses
it too without being edited. Every consumer that spells `wardrobe` becomes a typecheck error until
Steps 2, 5, 6, 7 and 8 land — that is the intended shape of the phase, and it is why all of them
are one commit.

**Why this cannot break `readNinaTuning` for a pre-existing row** — the plan's third hard
constraint, answered rather than assumed:

- `coerceNinaTuning` reads its input **key by key through `pick`**, never by enumerating the input's
  own keys. So an input object that still carries a `wardrobe` property — a restored backup piped
  through a script, a `psql` round trip, a `NinaTuning` serialised by an older deploy — is not
  rejected, not spread through, and not observable in the result. The extra key is simply never
  looked at. `coerceNinaTuning` still never throws.
- `readNinaTuning` issues `db.select()` (a `SELECT *`, deliberately —
  `lib/nina/queries.ts:3091-3092` and the docstring above it). drizzle maps a result set through
  the **declared** column list, so a `wardrobe` column still physically present in the table (the
  window between deploying this code and applying the migration) is dropped on the floor rather
  than surfacing as an unexpected member. The READ side is therefore correct both before and after
  the migration is applied.
- The **WRITE** side is not, and that is the one real ordering hazard in this phase — see Step 4's
  impact note.

---

### Step 2: Stop mapping the column in both directions

**File:** `lib/nina/queries.ts:3192` (in `tuningFromRow`) and `:3242` (in `tuningToColumns`)

**Change:** `tuningFromRow` and `tuningToColumns` are, in that file's own words, *"the one place the
flat row and the nested model meet"*. Two lines, one per direction.

**Code.** In `tuningFromRow`, replace:

```
    wardrobe: row.wardrobe,
    notes: row.notes,
    revision: row.revision,
  })
}
```

with:

```ts
    notes: row.notes,
    revision: row.revision,
  })
}
```

In `tuningToColumns`, replace:

```
    wardrobe: tuning.wardrobe,
    notes: tuning.notes,
  }
}
```

with:

```ts
    notes: tuning.notes,
  }
}
```

**Impact:** `tuningToColumns`' return type no longer carries `wardrobe`, so
`db.insert(ninaTuning).values({ userId, ...columns, revision: 1 })` no longer supplies it. Against
a table whose `wardrobe` column still exists as `text NOT NULL` **with no default** (which is what
`tests/db.schema.nina.test.ts` currently pins), that insert **fails at runtime**. The migration in
Step 4 is therefore not optional cleanup — it is part of the same unit of work, and a deploy of
this code without it breaks every tuning save. Named again in **Rollback**.

Also worth stating because someone will look for it: `nina_turns.tuning_revision` stamps
`nina_tuning.revision` at call time, and rows already exist referencing revisions whose wardrobe
this phase deletes. **Nothing breaks.** `tuning_revision` is a plain nullable `integer` — it is
**not** a foreign key, there is no `nina_tuning_revisions` history table for it to point into, and
this phase must not make it one. It is a provenance number for a human reading a log ("her voice
changed at revision 8"), and dropping a column from the current row does not and cannot invalidate a
number stamped on a past turn. `writeNinaTuning`'s `revision = revision + 1` is untouched, so the
counter does not reset and no historical stamp becomes ambiguous.

---

### Step 3: Drop the column from `lib/db/schema.ts`

**File:** `lib/db/schema.ts:1693-1695` (the table header) and `:1800-1806` (the column)

**Change:** Two edits. The column and its docstring go; the header's own count of the columns is
corrected, because removing the field is what makes it wrong.

**Code — the column.** Replace `lib/db/schema.ts:1800-1811`:

```
  /**
   * One line describing what she is wearing, baked into the image prompt at dispatch time
   * (`NINA_WARDROBE_MAX` = 200). `''` means "no override" and phase 4 falls back to
   * `NINA_APPEARANCE`'s heather-grey tank — which is what makes the empty default reproduce
   * today's photographs exactly. NOT NULL with `''` as the empty value rather than NULL, because
   * "no override" and "not set" are the same fact and two spellings for one fact is one too many.
   */
  wardrobe: text('wardrobe').notNull(),
  /**
   * Free text appended verbatim to the system prompt (`NINA_NOTES_MAX` = 2000). The escape hatch
   * for something the operator wants that no dial expresses. `''` = nothing appended.
   */
  notes: text('notes').notNull(),
```

with:

```ts
  /**
   * Free text appended verbatim to the system prompt (`NINA_NOTES_MAX` = 2000). The escape hatch
   * for something the operator wants that no dial expresses. `''` = nothing appended.
   *
   * ── THERE WAS A `wardrobe` COLUMN HERE, AND F41 R3 DROPPED IT ───────────────────────────────
   * *"remove Wardrobe field in /admin/personality (this new feature is more detailed version of
   * it)."* One line of operator text describing what she is wearing lived beside `notes` here,
   * baked into the image prompt at dispatch time. It is `nina_image_prefs.wardrobe` now, beside the
   * venue, the time, the prompt length and the focus set — every other parameter of the same
   * photograph. `notes` stayed because it is a SYSTEM-PROMPT field and always was: the two were
   * neighbours in this table but never on the same side of the camera.
   *
   * The drop was safe rather than lucky: the migration that created `nina_image_prefs` copied every
   * non-empty `nina_tuning.wardrobe` into it BEFORE this column was dropped, so the value survives
   * the schema change. Restoring it is re-adding the column and copying back.
   */
  notes: text('notes').notNull(),
```

**Code — the header.** Replace `lib/db/schema.ts:1693-1695`:

```
 * **Who Nina is, as data the operator can change without a commit (F35 R1/R2/R3).** Eleven trait
 * intensities, a relationship, four behaviour dials, sixteen enable flags, a wardrobe line and a
 * notes field — fifteen integers, sixteen booleans and three strings. `lib/nina/tuning.ts` owns the
```

with:

```ts
 * **Who Nina is, as data the operator can change without a commit (F35 R1/R2/R3).** Twelve trait
 * intensities, a relationship, four behaviour dials, seventeen enable flags and a notes field —
 * seventeen integers, seventeen booleans and two strings. `lib/nina/tuning.ts` owns the
```

The counts are read off the table as it will be, and off
`tests/db.schema.nina.test.ts`'s column list: 12 traits + 4 dials + `revision` = 17 integers,
17 `*_enabled` = 17 booleans, `relationship` + `notes` = 2 strings, plus `user_id` and `updated_at`
= **38 columns**. (The old sentence said eleven traits and sixteen flags — stale since `horny`
landed. Correcting it is in scope only because dropping `wardrobe` is what puts the reader in front
of the sentence; nothing else in the header is touched.)

**Impact:** `NinaTuningRow` and `NewNinaTuningRow` lose the member, which is what makes Step 2 a
compile-checked change rather than a hopeful one. `tests/db.schema.nina.test.ts` fails until Step 11.

---

### Step 4: Generate the drop migration — **generated, never hand-written, never renamed**

**File:** `drizzle/` (new `0012_*.sql`, new `meta/0012_snapshot.json`, appended `meta/_journal.json`)

**Change:** Run the generator. Do not create the file yourself and **do not rename what it
produces**, ever — plan invariant 10, and the reason is mechanical: a renamed migration keeps its
old `when` timestamp in `meta/_journal.json`, drops below drizzle's applied-watermark, and is then
skipped in silence on the next `db:migrate`.

**Commands, in this order:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab

# Preconditions C and D again — the gate, immediately before the destructive step.
ls drizzle/meta/0011_snapshot.json          # phase 1's snapshot MUST exist
grep -c '"tag"' drizzle/meta/_journal.json  # MUST print 9

npm run db:generate
```

Then assert what it produced, before applying anything:

```bash
git status --porcelain drizzle/
# expect exactly three lines:
#   ?? drizzle/0012_<suffix>.sql
#   ?? drizzle/meta/0012_snapshot.json
#    M drizzle/meta/_journal.json

cat drizzle/0012_*.sql
# expect exactly one statement, and nothing about nina_image_prefs:
#   ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe";
```

**If the generated SQL contains `CREATE TABLE "nina_image_prefs"`, or if drizzle-kit opens an
interactive rename prompt, STOP and revert `drizzle/`.** Both mean phase 1's snapshot was not in
`drizzle/meta/` when the diff ran (Interface Contract, Requires #3): drizzle-kit diffs the schema
against the newest snapshot on disk, not against the live database, so an absent `0011_snapshot.json`
makes it re-emit phase 1's table creation here **and** makes it see a `wardrobe` column moving
between two tables, which is exactly the shape that triggers the rename question. The fix is to land
phase 1 first, `git checkout -- drizzle/ && rm -f drizzle/0012_*` and re-run — never to answer the
prompt and never to edit the SQL by hand.

Apply it:

```bash
npm run db:migrate
npm run db:check     # drizzle-kit's own consistency check over the journal
```

**Impact:** This is the only destructive step in the whole plan set. It is recoverable **only**
because phase 1 copied the values first (Precondition D proves it for this database, not in
general). `db:migrate` must run against every environment before, or in the same deploy as, the code
from Step 2 — Step 2's `tuningToColumns` no longer supplies a value for a `NOT NULL` column with no
default, so code-before-migration means every tuning save on `/admin/personality` throws. The
reverse order (migration before code) is harmless: the code still reads `SELECT *` and drizzle
ignores columns it does not declare.

---

### Step 5: Take the field out of the Zod boundary

**File:** `lib/admin/schema.ts:28-37` and `:466-468`

**Change:** One schema field and one import member. **Quote this file as it will look after phase
4** — phase 4 appends the image-prefs schema below `ninaTuningResetSchema`, so re-read the file
before editing rather than trusting the line numbers.

**Code — the import.** Replace:

```
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_KEYS,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'
```

with:

```ts
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_KEYS,
} from '@/lib/nina/tuning'
```

**Code — the field.** Replace `lib/admin/schema.ts:465-468`:

```
  relationship: z.enum(NINA_RELATIONSHIPS),
  /** Goes into an IMAGE prompt, not into her voice. Empty is valid and means "the anchor outfit". */
  wardrobe: z.string().trim().max(NINA_WARDROBE_MAX),
  /** Handed to her verbatim in the system prompt. Empty is valid and is the default. */
```

with:

```ts
  relationship: z.enum(NINA_RELATIONSHIPS),
  /**
   * Handed to her verbatim in the system prompt. Empty is valid and is the default.
   *
   * The only free-text field this schema still bounds. `wardrobe` was the other one until F41 R3
   * moved it to the image-prefs schema below, where its bound is imported from
   * `lib/nina/imageprefs.ts` under the same standing rule: every bound is imported, none is
   * re-spelled.
   */
```

Note the phase-4 cross-reference in that comment ("the image-prefs schema below") is accurate only
because phase 4 appends to this same file. If the reconciler moves phase 4's schema elsewhere, the
words "below" and "the image-prefs schema" are what need adjusting.

**Impact:** `NinaTuningWriteInput` is `z.infer<typeof ninaTuningWriteSchema>` and loses the member
automatically. `NINA_WARDROBE_MAX` now has zero importers, which is what makes Step 1's deletion of
it clean.

---

### Step 6: Take the field out of the Server Actions

**File:** `lib/admin/tuningActions.ts:79-89`, `:100-110`, `:158-170`

**Change:** Three deletions: the adaptation seam, the action's declared parameter, and the reset
defaults.

**Code — `toTuningWrite`.** Replace:

```
    enabled: input.enabled,
    relationship: input.relationship,
    wardrobe: input.wardrobe,
    notes: input.notes,
  }
}
```

with:

```ts
    enabled: input.enabled,
    relationship: input.relationship,
    notes: input.notes,
  }
}
```

**Code — the action's parameter.** Replace:

```
  enabled: Record<string, boolean>
  relationship: string
  wardrobe: string
  notes: string
}): Promise<AdminTuningResult> {
```

with:

```ts
  enabled: Record<string, boolean>
  relationship: string
  notes: string
}): Promise<AdminTuningResult> {
```

**Code — the reset defaults.** Replace:

```
    relationship: NINA_TUNING_DEFAULTS.relationship,
    wardrobe: NINA_TUNING_DEFAULTS.wardrobe,
    notes: NINA_TUNING_DEFAULTS.notes,
  }
```

with:

```ts
    relationship: NINA_TUNING_DEFAULTS.relationship,
    notes: NINA_TUNING_DEFAULTS.notes,
  }
```

**Impact:** `resetNinaTuningAction` no longer resets a wardrobe, which is correct — resetting the
image prefs is phase 4's reset on `/admin/image-generation`, and a Personality reset that silently
undressed her would be a control reaching across a page boundary. `tests/admin.tuning.test.ts`'s
structural cases are unaffected: the export count stays two, `requireAdmin()` stays above
`.safeParse(`, and `revalidatePath('/admin/personality')` stays.

---

### Step 7: Take the field out of the client-side model

**File:** `lib/admin/tuningModel.ts:42-50`, `:60-68`, `:196-205`, `:207-212`, `:228-233`

**Change:** The draft member, the read seam, the diff, and the two docstrings that name the field.

**Code — the header paragraph.** Replace `lib/admin/tuningModel.ts:42-50`:

```
 * ── THE TWO LENGTH BOUNDS ARE PHASE 1'S, AND ARE NOT RE-DECLARED HERE ────────────────────────
 * The draft of this file carried `ADMIN_TUNING_WARDROBE_MAX = 240` and
 * `ADMIN_TUNING_NOTES_MAX = 1000` against phase 1's 200 and 2000. Both were cut in reconciliation
 * and every caller imports `NINA_WARDROBE_MAX` / `NINA_NOTES_MAX` from `@/lib/nina/tuning`
 * directly. A Zod bound STRICTER than the model's coercion is the worse of the two failures: the
 * panel would refuse 210 characters of wardrobe that `coerceNinaWardrobe` would happily have
 * stored. `lib/admin/avatars.ts`'s rule, which `lib/admin/schema.ts` quotes approvingly: *"a
 * constant that is agreed rather than shared is a constant that will one day disagree."*
 */
```

with:

```ts
 * ── THE LENGTH BOUND IS PHASE 1'S, AND IS NOT RE-DECLARED HERE ───────────────────────────────
 * The draft of this file carried an `ADMIN_TUNING_NOTES_MAX = 1000` against phase 1's 2000 (and a
 * second bound for the wardrobe, which is no longer this file's field at all — F41 R3). Both were
 * cut in reconciliation and every caller imports `NINA_NOTES_MAX` from `@/lib/nina/tuning`
 * directly. A Zod bound STRICTER than the model's coercion is the worse of the two failures: the
 * panel would refuse 1200 characters of notes that `coerceNinaNotes` would happily have stored.
 * `lib/admin/avatars.ts`'s rule, which `lib/admin/schema.ts` quotes approvingly: *"a constant that
 * is agreed rather than shared is a constant that will one day disagree."*
 */
```

**Code — `TuningDraft`.** Replace:

```
  enabled: Record<string, boolean>
  relationship: string
  wardrobe: string
  notes: string
}
```

with:

```ts
  enabled: Record<string, boolean>
  relationship: string
  notes: string
}
```

**Code — `toTuningDraft`.** Replace:

```
    enabled: { ...tuning.enabled },
    relationship: tuning.relationship,
    wardrobe: tuning.wardrobe,
    notes: tuning.notes,
  }
}
```

with:

```ts
    enabled: { ...tuning.enabled },
    relationship: tuning.relationship,
    notes: tuning.notes,
  }
}
```

**Code — `changedTuningFields`' docstring.** Replace `lib/admin/tuningModel.ts:208-209`:

```
 * Which fields differ, as stable dotted paths (`traits.anger`, `dials.photoEagerness`,
 * `enabled.flirty`, `relationship`, `wardrobe`, `notes`).
```

with:

```ts
 * Which fields differ, as stable dotted paths (`traits.anger`, `dials.photoEagerness`,
 * `enabled.flirty`, `relationship`, `notes`).
```

**Code — `changedTuningFields`' body.** Replace:

```
  if (next.relationship !== saved.relationship) changed.push('relationship')
  if (next.wardrobe !== saved.wardrobe) changed.push('wardrobe')
  if (next.notes !== saved.notes) changed.push('notes')
```

with:

```ts
  if (next.relationship !== saved.relationship) changed.push('relationship')
  if (next.notes !== saved.notes) changed.push('notes')
```

**Impact:** `changedTuningFields` can no longer return `'wardrobe'`, which is what the panel's
`unsaved.has('wardrobe')` read. Both go in the same commit. The `enabled.*`-appended-last ordering
the tests pin is unchanged; only a scalar comparison is removed, and `'relationship'` still comes
before `'notes'`.

---

### Step 8: Delete the control, and decide what the two-column row becomes

**File:** `components/admin/CharacterPanel.tsx:21-30`, `:370-414`, `:441-452`

**Change:** The import member, the Wardrobe control, the layout wrapper, and the save payload.

**Code — the import.** Replace:

```
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_RELATIONSHIP_KEY,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'
```

with:

```ts
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_RELATIONSHIP_KEY,
} from '@/lib/nina/tuning'
```

**Code — the control and the wrapper.** Replace the whole of `components/admin/CharacterPanel.tsx:370-414` — from `<div className="mb-6 grid gap-5 xl:grid-cols-2">` through its closing `</div>` — with this. It is the complete replacement block, Notes included:

```tsx
        {/*
         * ── ONE FIELD HERE NOW, AND THE GRID WENT WITH THE OTHER ONE ───────────────────────
         * This was a two-column `xl:grid-cols-2` row holding Wardrobe beside Notes. F41 R3 moved
         * the wardrobe to `/admin/image-generation` — *"remove Wardrobe field in
         * /admin/personality (this new feature is more detailed version of it)"* — and a
         * two-column grid with a single child renders that child at half width with an empty cell
         * beside it, which reads as a control that failed to load rather than as a layout. So the
         * wrapper is gone rather than left half-empty, and Notes is a plain block.
         *
         * `max-w-[70ch]` and not full width: this is a prose textarea, and 70ch is the measure
         * every hint on this page already uses (`max-w-[70ch]` on both section descriptions and on
         * the page header). An `xl` viewport would otherwise stretch it to a line length nobody
         * writes prose at, which is a worse answer than the half-empty grid was.
         *
         * The leading `*` on every line is load-bearing, not style: `ci:client-secret-guard`'s
         * Rule 3 exempts only lines a comment scanner recognises, and a JSX comment with bare
         * prose continuation lines fails the guard. `app/admin/personality/page.tsx` records the
         * same detail about its own JSX comment.
         */}
        <label className="mb-6 block max-w-[70ch]">
          <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            Notes
            {unsaved.has('notes') && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
          </span>
          <textarea
            className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
            value={draft.notes}
            maxLength={NINA_NOTES_MAX}
            disabled={pending}
            onChange={(event) =>
              setDraft((current) => ({ ...current, notes: event.target.value }))
            }
          />
          <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
            Free text, handed to her verbatim in the system prompt. Anything no dial can say.
          </span>
        </label>
```

`cn` and `CONTROL_CLASS` both still have a user (this block), so neither import becomes unused.

**Code — the save payload.** Replace:

```
                saveNinaTuningAction({
                  userId,
                  traits: draft.traits,
                  dials: draft.dials,
                  enabled: draft.enabled,
                  relationship: draft.relationship,
                  wardrobe: draft.wardrobe,
                  notes: draft.notes,
                }),
```

with:

```tsx
                saveNinaTuningAction({
                  userId,
                  traits: draft.traits,
                  dials: draft.dials,
                  enabled: draft.enabled,
                  relationship: draft.relationship,
                  notes: draft.notes,
                }),
```

**Impact:** `/admin/personality` renders no Wardrobe control, and one save still writes the whole
tuning (plan invariant 7 / the set's invariant 11) — the payload lost a member, not a save. The
placeholder text *"heather-grey racerback tank, black fitted running shorts"* disappears with the
input; phase 4's new field carries the user's own example instead (*"long hugging leggings with
string bra"*), which is R6's copy and not this phase's to write.

**Run prettier on this file** — the de-indented Notes block sits within one character of
`printWidth: 100` in two places, so let the formatter decide rather than guessing (see
**Verification**).

---

### Step 9: One stale example in `DialSlider`

**File:** `components/admin/DialSlider.tsx:56-60`

**Change:** The docstring cites `wardrobe` and `notes` together as the shape of a parameter with no
off switch. After this phase only one of them is a tuning field.

**Code.** Replace:

```
 * ── THE TOGGLE IS OPTIONAL, AND ABSENT MEANS "NO TOGGLE" ────────────────────────────────────
 * `onEnabledChange` is what renders the checkbox. A caller with a parameter that has no off switch
 * — there is none today, but `wardrobe` and `notes` are exactly that shape — passes neither prop
 * and gets the control as it was before R4, rather than a checkbox that is always on and does
 * nothing.
```

with:

```ts
 * ── THE TOGGLE IS OPTIONAL, AND ABSENT MEANS "NO TOGGLE" ────────────────────────────────────
 * `onEnabledChange` is what renders the checkbox. A caller with a parameter that has no off switch
 * — there is none today, but `notes` is exactly that shape — passes neither prop and gets the
 * control as it was before R4, rather than a checkbox that is always on and does nothing.
```

**Impact:** None at runtime. `tests/admin.tuning.test.ts`'s structural case reads this file through
`codeOnly()`, which strips block comments, so the assertion is indifferent to the wording — the edit
exists so the grep exit criterion is honest and so the next reader is not sent looking for a field
that is gone.

---

### Step 10: The page's own header copy

**File:** `app/admin/personality/page.tsx:75-79`

**Change:** The page promises *"the wardrobe the camera reads"* in its first paragraph. It no longer
delivers it, and the sentence is the operator's only signpost to where it went.

**Code.** Replace:

```
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Who she is, not what she looks like. Her relationship to you, every dial, the wardrobe
          the camera reads and the notes she is handed verbatim. Her photographs stayed behind on
          Nina&rsquo;s album; this page is the row her system prompt is assembled from.
        </p>
```

with:

```tsx
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Who she is, not what she looks like. Her relationship to you, every dial and the notes she
          is handed verbatim. Her photographs stayed behind on Nina&rsquo;s album and what she wears
          in them moved to Image Generation; this page is the row her system prompt is assembled
          from.
        </p>
```

The file docstring is **not** edited: re-read `app/admin/personality/page.tsx:8-62` — it argues
about the route, the gate, `force-dynamic` and the pure preview, and mentions no wardrobe. (The
Reference List's "and the file docstring's mentions" was checked against the file: there are none.
The only `wardrobe` in this file is line 76.)

**Impact:** The copy names the new destination in the operator's own vocabulary — "Image
Generation" is the nav label phase 4 ships (index Decisions: `label: 'Image Generation'`), so the
sentence points at something the operator can see in the bar.

---

### Step 10b: One word in `lib/nina/persona.ts:1473` — the one edit that crosses into phase 2's file

**File:** `lib/nina/persona.ts:1473-1474`

**Change:** The docblock above `ninaTraitsBlock`'s dial table closes by naming the two R3 fields that
are not dials. After this phase there is one.

**Code.** Replace:

```
 * Two more R3 fields are not dials and are not here: `wardrobe`, which is `ninaAppearance`'s and
 * never reaches the system prompt, and `notes`, which is passed through verbatim below.
```

with:

```ts
 * One more R3 field is not a dial and is not here: `notes`, which is passed through verbatim below.
 * There were two — `wardrobe` was the other, and F41 R3 moved it out of `nina_tuning` altogether
 * (it is `nina_image_prefs.wardrobe` now, still `ninaAppearance`'s and still never in the system
 * prompt, but no longer a field of the tuning this docblock is about).
```

**Why this phase and not phase 2, when phase 2 owns the file.** Phase 2's plan says of this exact
line: *"`persona.ts:1473`'s comment (\"`wardrobe`, which is `ninaAppearance`'s\") is still true. No
edit."* Phase 2 is right about its own commit — during phase 2, `NinaTuning.wardrobe` still exists
and *"two more R3 fields"* is still a true count. It is **this** phase that makes the sentence false,
so leaving it to a phase that has already declined it, on a correct reading of its own scope, would
strand it. Three facts make the edit safe rather than a scope violation:

1. **Region-disjoint.** Phase 2's Files table claims `lib/nina/persona.ts:352-402` plus its import
   list. Line 1334 is a thousand lines away, in `ninaTraitsBlock`'s docblock, which phase 2's Impact
   note explicitly lists among the things it does not touch (*"Nothing else in `persona.ts` — the
   anger ladder, the registers, `ninaTraitsBlock`, the twenty names `prompts/system.ts` imports — is
   touched"*).
2. **Comment-only.** No identifier, no export, no behaviour. `tests/nina.tuning.test.ts`'s
   structural case over this file strips block comments before asserting.
3. **Caused by this phase.** The `satisfies` boundary is about requirements, not about files: this
   sentence is false *because of R3*, and no other requirement touches it.

**Reconciler: if you would rather this land in phase 2's diff, move it there and delete this step.**
The wording above works unchanged in either commit; only the ordering claim in its parenthesis
(*"moved it out of `nina_tuning` altogether"*) requires this phase to have landed, so in phase 2 it
would need to read *"is moving it out"*.

**Impact:** None at runtime. It is the last `nina_tuning`-flavoured `wardrobe` sentence in
`lib/nina/`, and removing it is what lets the grep exit criterion read *every* remaining
`persona.ts` hit as the image-prefs surface rather than having to except one.

---

### Step 11: The three test files

**File:** `tests/nina.tuning.test.ts`, `tests/admin.tuning.test.ts`, `tests/db.schema.nina.test.ts`

**Change:** Remove the assertions about a field that no longer exists. **Do not weaken a
neighbouring assertion to make room** — each edit below either deletes a whole case that was only
about the wardrobe, or removes the wardrobe half of a case whose other half still stands on its own.

**Code — `tests/nina.tuning.test.ts`, the imports.** Remove the two members
`coerceNinaWardrobe,` (`:13`) and `NINA_WARDROBE_MAX,` (`:34`) from the
`from '@/lib/nina/tuning'` import list. Every other member stays.

**Code — `tests/nina.tuning.test.ts:330`, the hostile-input list.** Replace:

```
      { relationship: 42, wardrobe: [], notes: {}, revision: -9 },
```

with:

```ts
      { relationship: 42, notes: {}, revision: -9 },
```

The case's point — every hostile shape yields a complete, valid tuning — is unchanged; it loses one
of three wrong-typed members and keeps `relationship: 42` and `notes: {}`.

**Code — `tests/nina.tuning.test.ts:350-362`, the round trip.** Replace:

```
    const input = {
      traits,
      dials,
      enabled,
      relationship: 'girlfriend' as const,
      wardrobe: 'a black cropped tank and shorts',
      notes: 'call him yang more often',
      revision: 4,
    }
    expect(coerceNinaTuning(input)).toEqual(input)
```

with:

```ts
    const input = {
      traits,
      dials,
      enabled,
      relationship: 'girlfriend' as const,
      notes: 'call him yang more often',
      revision: 4,
    }
    expect(coerceNinaTuning(input)).toEqual(input)
```

This one is not cosmetic. `toEqual` is exact about extra keys on the **received** side, and
`coerceNinaTuning` no longer emits a `wardrobe`, so leaving the member in `input` would make the
assertion compare `{...wardrobe}` against `{...no wardrobe}` and fail. TypeScript would *not* have
caught it — `input` is a `const` variable rather than an inline literal, so excess-property checking
does not apply at the `coerceNinaTuning(input)` call.

**Code — `tests/nina.tuning.test.ts:364-372`, the coercer case.** Replace the whole `it(...)`:

```
  it('squashes the wardrobe to one line and caps both free-text fields', () => {
    // The wardrobe is ONE line: a newline inside an image prompt splits a sentence the provider
    // then reads as two.
    expect(coerceNinaWardrobe('  a grey  tank\nand shorts ')).toBe('a grey tank and shorts')
    expect(coerceNinaWardrobe('x'.repeat(500)).length).toBe(NINA_WARDROBE_MAX)
    expect(coerceNinaWardrobe(42)).toBe('')
    expect(coerceNinaNotes('a\r\nb\n\n\n\nc')).toBe('a\nb\n\nc')
    expect(coerceNinaNotes('x'.repeat(9000)).length).toBe(NINA_NOTES_MAX)
    expect(coerceNinaNotes(null)).toBe('')
  })
```

with:

```ts
  it('normalises the notes and caps the one free-text field left', () => {
    // Newlines SURVIVE here, which is the difference from the wardrobe line this module used to
    // carry: notes is prose and paragraphs are how the operator writes it, so only CRLF is
    // normalised and only a run of blank lines is collapsed. (The wardrobe's one-line squash moved
    // to `lib/nina/imageprefs.ts` with the field itself — F41 R3.)
    expect(coerceNinaNotes('a\r\nb\n\n\n\nc')).toBe('a\nb\n\nc')
    expect(coerceNinaNotes('x'.repeat(9000)).length).toBe(NINA_NOTES_MAX)
    expect(coerceNinaNotes(null)).toBe('')
  })
```

**Code — `tests/nina.tuning.test.ts:403`, the defaults.** Delete the single line:

```
    expect(NINA_TUNING_DEFAULTS.wardrobe).toBe('')
```

`expect(NINA_TUNING_DEFAULTS.notes).toBe('')` and
`expect(NINA_TUNING_DEFAULTS.revision).toBe(0)` immediately follow and stay.

**Code — `tests/nina.tuning.test.ts:508`, the negative key assertion.** Delete the single line:

```
    expect(isNinaTuningKey('wardrobe')).toBe(false)
```

The case keeps `isNinaTuningKey('notes')`, `('')` and `('__proto__')` as its negatives, so it still
proves what it is named for — a non-toggled free-text field is not a tuning key. **This deletion is
the reason the Interface Contract can state that no toggle column is affected: the assertion existed
because `wardrobe` was never in `NINA_TUNING_KEYS`, and removing the field removes the question
rather than the answer.**

**Code — `tests/admin.tuning.test.ts:27`, the import.** Remove the member `NINA_WARDROBE_MAX,` from
the `from '@/lib/nina/tuning'` list. Then replace the header note at `:40-42`:

```
 * `NINA_WARDROBE_MAX` and `NINA_NOTES_MAX` are imported from `@/lib/nina/tuning` rather than from
 * the admin model. The draft of this phase declared a second pair (240 / 1000) against phase 1's
 * 200 / 2000; reconciliation cut them, so there is one home for each bound and this file reads it.
```

with:

```ts
 * `NINA_NOTES_MAX` is imported from `@/lib/nina/tuning` rather than from the admin model. The draft
 * of this phase declared its own (1000, against phase 1's 2000, alongside a second bound for the
 * wardrobe this page no longer carries); reconciliation cut them, so there is one home for the
 * bound and this file reads it.
```

**Code — `tests/admin.tuning.test.ts:63`.** Delete the single line:

```
    expect(DEFAULTS.wardrobe).toBe(NINA_TUNING_DEFAULTS.wardrobe)
```

**Code — `tests/admin.tuning.test.ts:149-157`, the non-numeric-fields case.** Replace the whole
`it(...)`:

```
  it('names the three non-numeric fields', () => {
    const edited: TuningDraft = {
      ...DEFAULTS,
      relationship: 'something_else',
      wardrobe: 'short pants',
      notes: 'she knows about the half marathon',
    }
    expect(changedTuningFields(edited, DEFAULTS)).toEqual(['relationship', 'wardrobe', 'notes'])
  })
```

with:

```ts
  it('names the two non-numeric fields', () => {
    const edited: TuningDraft = {
      ...DEFAULTS,
      relationship: 'something_else',
      notes: 'she knows about the half marathon',
    }
    expect(changedTuningFields(edited, DEFAULTS)).toEqual(['relationship', 'notes'])
  })
```

**Code — `tests/admin.tuning.test.ts:244-268`, the two bound cases.** Replace both `it(...)`
blocks:

```
  it('bounds the wardrobe and the notes, and accepts both empty', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ wardrobe: '', notes: '' })).success).toBe(true)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ wardrobe: 'x'.repeat(NINA_WARDROBE_MAX + 1) }))
        .success,
    ).toBe(false)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX + 1) })).success,
    ).toBe(false)
  })

  /*
   * The panel's `maxLength` and this schema must be the SAME number, or the textarea refuses a
   * keystroke the action would have accepted (or, worse, the other way round). One home, two
   * readers — so assert that the bound this file imports is the bound phase 1 declares.
   */
  it('accepts a value at exactly each bound', () => {
    expect(
      ninaTuningWriteSchema.safeParse(payload({ wardrobe: 'x'.repeat(NINA_WARDROBE_MAX) })).success,
    ).toBe(true)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX) })).success,
    ).toBe(true)
  })
```

with:

```ts
  it('bounds the notes, and accepts it empty', () => {
    expect(ninaTuningWriteSchema.safeParse(payload({ notes: '' })).success).toBe(true)
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX + 1) })).success,
    ).toBe(false)
  })

  /*
   * The panel's `maxLength` and this schema must be the SAME number, or the textarea refuses a
   * keystroke the action would have accepted (or, worse, the other way round). One home, two
   * readers — so assert that the bound this file imports is the bound phase 1 declares.
   *
   * There were two bounds here until F41 R3. The wardrobe's cap left with the field, and its
   * equivalent assertion belongs to the image-prefs schema's own suite.
   */
  it('accepts a value at exactly the bound', () => {
    expect(
      ninaTuningWriteSchema.safeParse(payload({ notes: 'x'.repeat(NINA_NOTES_MAX) })).success,
    ).toBe(true)
  })
```

**Code — `tests/db.schema.nina.test.ts:373`, the column count.** Replace:

```
  it('spells exactly the thirty-nine columns phases 3, 4, 5 and R4 were written against', () => {
```

with:

```ts
  it('spells exactly the thirty-eight columns phases 3, 4, 5 and R4 were written against', () => {
```

and delete `'wardrobe',` from the array inside it (`:396` — the line between `'verbosity',` and
`'notes',`).

**Code — `tests/db.schema.nina.test.ts:487-497`, the no-SQL-DEFAULT list.** Delete `'wardrobe',`
(`:493`) from the array, leaving:

```ts
    for (const key of [
      'relationship',
      ...NINA_TRAITS,
      ...NINA_DIALS.map(snake),
      'notes',
      'revision',
    ]) {
```

**Impact:** Three suites go green against the new shape. Two cases that were *only* about the
wardrobe (the coercer's squash, and half of each bound case) shrink; no case is deleted outright and
no surviving assertion is loosened. **`tests/nina.imagerecipe.test.ts` is NOT edited here** — it
mentions `wardrobe` at `:118,144,148,205` and phase 2 rewrites the whole file for the new prompt
contract (Interface Contract, Leaves alone).

---

### Step 12: The documentation, including four package READMEs

**Files:** `docs/nina/persona.md`, `CHANGELOG.md`, `lib/nina/.workflows/package_readme.md`,
`lib/db/.workflows/package_readme.md`, `lib/admin/.workflows/package_readme.md`,
`components/admin/.workflows/package_readme.md`

**Change:** Every living document that describes the wardrobe as a tuning field. **Two of these four
package READMEs are not in the analysis document's Reference List** (`lib/db` and `lib/admin`) —
found by re-grepping.

**`docs/nina/persona.md:250-254` — DO NOT EDIT. Phase 2 already did it.** Its Step 7 replaces the
whole `:239-255` block, and its replacement for the *"**The wardrobe is overridable (F34 R5).**"*
paragraph reads *"**The wardrobe is overridable, and it lives on the image surface.** … the outfit
paragraph is separate, and `nina_image_prefs.wardrobe` replaces it: `ninaAppearance(prefs)` swaps
the clothes, keeps the body, keeps the face and keeps the track."* There is nothing left in that
paragraph for this phase to retire. **Read the file before editing and confirm the paragraph already
says `nina_image_prefs.wardrobe`; if it still says *"a `wardrobe` line on the tuning"*, phase 2 has
not landed and Precondition B is not satisfied — stop rather than fixing it here.**

**`docs/nina/persona.md:332`** (outside phase 2's `:239-255` claim)**.** Delete the table row:

```
| `wardrobe` | free text. Replaces the outfit paragraph in the IMAGE prompt only |
```

and, immediately after that table's last row (`| \`notes\` | ... |`) and before the paragraph
beginning *"Nothing arbitrates between contradictory dials."*, insert a blank line and:

```markdown
`wardrobe` was a seventh row in this table until F41 R3 took it off `/admin/personality` entirely.
It is `nina_image_prefs.wardrobe` now, on `/admin/image-generation`, with the venue, the time and
the focus set — a fact about a photograph rather than a fact about who she is.
```

**`docs/nina/persona.md:412`** (outside phase 2's `:239-255` claim)**.** Replace the table row:

```
| The wardrobe that reaches the camera | `lib/nina/imagegen.ts` |
```

with:

```markdown
| The wardrobe that reaches the camera — no longer a tuning field (F41 R3) | `lib/nina/imageprefs.ts`, `/admin/image-generation` |
```

**`CHANGELOG.md:19`** — this is under `## [Unreleased]`, so the tuning feature has not shipped and
the clause is corrected in place rather than superseded by a new entry. Replace:

```
  eagerness, verbosity), a wardrobe line that reaches the camera, and a free-text note. Her system
```

with:

```markdown
  eagerness, verbosity) and a free-text note. Her system
```

(Adding an entry for the Image Generation tab itself is **not** this phase's — see **Handoffs**.)

**`lib/nina/.workflows/package_readme.md`**, four passages:

- `:52-54`. Replace:

  ```
  - **`NinaTuning`** — `{ traits, relationship, dials, enabled, wardrobe, notes, revision }`, all
    readonly. `enabled` is R4's per-parameter on/off map (see below). `wardrobe` and `notes` are
    `string` and never null; `''` is the one empty value. `revision` is the database's to assign, and
  ```

  with:

  ```markdown
  - **`NinaTuning`** — `{ traits, relationship, dials, enabled, notes, revision }`, all readonly.
    `enabled` is R4's per-parameter on/off map (see below). `notes` is `string` and never null; `''`
    is the one empty value. (`wardrobe` was a seventh member until F41 R3 moved it to
    `NinaImagePrefs`.) `revision` is the database's to assign, and
  ```

- `:98-105`. Replace:

  ```
  **`relationship` has a toggle; `wardrobe` and `notes` deliberately do not.** `nobody` is not an off
  switch — `NINA_RELATIONSHIP_BLOCKS.nobody` is four sentences of *active* instruction and the coldest
  setting on the axis, so choosing it to "exclude" the parameter makes the prompt longer and changes
  her behaviour. Disabling the relationship therefore means `NINA_DEFAULT_RELATIONSHIP`, whose blocks
  *are* today's `NINA_IDENTITY`. `wardrobe` and `notes` are the mirror image: `''` genuinely is their
  absence and already costs zero bytes, so a toggle would be a second spelling for a state the field
  already has.
  ```

  with:

  ```markdown
  **`relationship` has a toggle; `notes` deliberately does not.** `nobody` is not an off switch —
  `NINA_RELATIONSHIP_BLOCKS.nobody` is four sentences of *active* instruction and the coldest setting
  on the axis, so choosing it to "exclude" the parameter makes the prompt longer and changes her
  behaviour. Disabling the relationship therefore means `NINA_DEFAULT_RELATIONSHIP`, whose blocks
  *are* today's `NINA_IDENTITY`. `notes` is the mirror image: `''` genuinely is its absence and
  already costs zero bytes, so a toggle would be a second spelling for a state the field already has.
  This sentence used to name two such fields; `wardrobe` was the other, and F41 R3 moved it to
  `nina_image_prefs` rather than giving it a toggle.
  ```

- `:291-293`. Replace:

  ```
  - `ninaAppearance` — the **wardrobe seam phase 4 will use**. Returns `NINA_APPEARANCE` when
    `tuning.wardrobe` is empty, otherwise swaps the outfit paragraph while keeping the face and the
    home ground. This never reaches the system prompt; `system.ts` does not import it.
  ```

  with:

  ```markdown
  - `ninaAppearance` — the **wardrobe seam**. Returns `NINA_APPEARANCE` when the wardrobe is empty,
    otherwise swaps the outfit paragraph while keeping the face and the home ground. The wardrobe it
    reads is `nina_image_prefs.wardrobe` since F41 R3, not `nina_tuning`'s. This never reaches the
    system prompt; `system.ts` does not import it.
  ```

  (Phase 2 owns `ninaAppearance`'s new parameter; this wording deliberately names the *source of the
  value* and not the signature, so it stays true whichever shape phase 2 lands.)

- `:441-443`. Replace:

  ```
  ends of that. A non-empty `wardrobe` replaces the canon outfit through `persona.ts`'s
  ```

  with:

  ```markdown
  ends of that. A non-empty image-prefs `wardrobe` replaces the canon outfit through `persona.ts`'s
  ```

**`lib/db/.workflows/package_readme.md`**, three passages:

- `:93`. Replace the table row:

  ```
  | `ninaTuning` | `nina_tuning` | Nina's per-user character: eleven trait dials, the relationship, the four extra dials, wardrobe and notes, plus a revision | PK `user_id` |
  ```

  with:

  ```markdown
  | `ninaTuning` | `nina_tuning` | Nina's per-user character: twelve trait dials, the relationship, the four extra dials, seventeen enable flags and a notes field, plus a revision | PK `user_id` |
  ```

- `:133-135`. Replace:

  ```
  rather than a migration here. Its neighbours `nina_tuning.wardrobe` and `.notes` are not catalog
  pointers at all: they are free operator text, `NOT NULL` with `''` as the empty value, because
  "no override" and "not set" are the same fact.
  ```

  with:

  ```markdown
  rather than a migration here. Its neighbour `nina_tuning.notes` is not a catalog pointer at all:
  it is free operator text, `NOT NULL` with `''` as the empty value, because "nothing appended" and
  "not set" are the same fact. (`nina_tuning.wardrobe` was the other such column until F41 R3 moved
  the wardrobe to `nina_image_prefs`, where it is free operator text on exactly the same terms.)
  ```

- `:636-639`. Replace:

  ```
  as a text column over five values, the four extra dials the request's *"among other things (you can
  define more comprehensively)"* asked for, a wardrobe line, a free-text notes field, a revision
  integer and an `updated_at`.
  ```

  with:

  ```markdown
  as a text column over five values, the four extra dials the request's *"among other things (you can
  define more comprehensively)"* asked for, a free-text notes field, a revision integer and an
  `updated_at`. (It also held a one-line `wardrobe` until F41 R3, which dropped the column after
  copying every value into `nina_image_prefs.wardrobe`.)
  ```

**`lib/admin/.workflows/package_readme.md:222-224`.** Replace:

```
(`NINA_RELATIONSHIPS`) and the two free-text lengths (`NINA_WARDROBE_MAX` = 200,
`NINA_NOTES_MAX` = 2000) all come from `lib/nina/tuning.ts`, which is the same module the panel
```

with:

```markdown
(`NINA_RELATIONSHIPS`) and the free-text length (`NINA_NOTES_MAX` = 2000) all come from
`lib/nina/tuning.ts`, which is the same module the panel
```

**`components/admin/.workflows/package_readme.md:101`.** Replace the table cell:

```
| `CharacterPanel.tsx` | `'use client'` | `/admin/personality`'s character tuning — the whole content of that route: eleven trait sliders, the five-way relationship selector, the four extra dials, wardrobe and notes, and the assembled prompt preview. One `useTransition`, one save. Always open; `id="character"` on the section root, so the old album-route `#character` bookmark still lands somewhere real. |
```

with:

```markdown
| `CharacterPanel.tsx` | `'use client'` | `/admin/personality`'s character tuning — the whole content of that route: twelve trait sliders, the five-way relationship selector, the four extra dials, the notes field, and the assembled prompt preview. One `useTransition`, one save. Always open; `id="character"` on the section root, so the old album-route `#character` bookmark still lands somewhere real. (A Wardrobe input sat beside Notes until F41 R3 moved it to `ImageGenPanel.tsx`.) |
```

**Impact:** Documentation only. The `.workflows/plan/*.md` archives and `.workflows/todos.md`
records under `lib/nina/`, `lib/db/` and `components/admin/` are **not** touched — they are the
record of what landed at the time, and rewriting them would make the history lie.

---

## Verification

**Precondition (once):**

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab && npm install
```

The worktree has no `node_modules`. It *does* have `.env.local`, which `drizzle.config.ts` and
`lib/env.ts` both require.

**Build / typecheck:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab
npm run typecheck        # next typegen && tsc --noEmit — the primary gate for this phase
npm run lint
npx prettier --write lib/nina/tuning.ts lib/nina/queries.ts lib/nina/persona.ts lib/db/schema.ts \
  lib/admin/schema.ts lib/admin/tuningActions.ts lib/admin/tuningModel.ts \
  components/admin/CharacterPanel.tsx components/admin/DialSlider.tsx \
  app/admin/personality/page.tsx tests/nina.tuning.test.ts tests/admin.tuning.test.ts \
  tests/db.schema.nina.test.ts
npm run format:check
npm run build
```

The `prettier --write` is not optional: Step 8's de-indented Notes block lands within one character
of `printWidth: 100` in two places, and guessing which way the formatter breaks them is how
`format:check` fails in CI after a green local run.

**Tests:**

```bash
npm test                                  # the whole suite must be green
npx vitest run tests/nina.tuning.test.ts tests/admin.tuning.test.ts tests/db.schema.nina.test.ts
npm run ci:data-layer-guard               # lib/db/schema.ts changed
npm run ci:client-secret-guard            # a 'use client' component changed
npm run ci:llm-payload-guard              # a page that renders a prompt preview changed
```

**Migration:**

```bash
cat drizzle/0012_*.sql                    # exactly one ALTER TABLE ... DROP COLUMN "wardrobe";
npm run db:check                          # journal consistency
grep -c '"tag"' drizzle/meta/_journal.json  # 10
git diff --name-only drizzle/ | sort      # only _journal.json modified; 0012_* files are new
```

Nothing under `drizzle/0000_*` .. `drizzle/0011_*` or `drizzle/meta/0000_*` ..
`drizzle/meta/0011_snapshot.json` may appear in that diff.

**Manual check:**

1. `npm run dev`, open `/admin/personality`. **No Wardrobe control anywhere on the page.** Notes is
   still there, still a textarea, still capped at 2000, and the "unsaved" dot still appears when it
   is edited. The header paragraph no longer promises a wardrobe.
2. Move one slider, edit Notes, click **Save the whole tuning**. It reports a bumped revision — this
   is the assertion that Step 2 + Step 4 landed together, because a `tuningToColumns` without
   `wardrobe` against a table that still has the `NOT NULL` column throws here and nowhere else.
3. Click **Reset**. It succeeds and reports a revision. Nothing on
   `/admin/image-generation` changes — the Personality reset must not reach across and undress her.
4. Open `/admin/image-generation` (phase 4's page). The wardrobe field is there and holds the value
   that used to be on `/admin/personality` — Precondition D's copy, seen through the UI.
5. Ask her for a photograph in chat. It still arrives, and its `nina_message_images.prompt` sidecar
   still contains the wardrobe line — proof that phase 2's reader found the new home.

**Exit criteria — `grep` is the criterion, and here is its expected output.**

```bash
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab
grep -rni 'wardrobe' app components lib tests docs \
  --include='*.ts' --include='*.tsx' | cut -d: -f1 | sort -u
```

**Expected, and nothing else — every one of these five is the new image-prefs surface:**

```
lib/nina/avatargen.ts        # phase 2 — a comment about reading the prefs live
lib/nina/imagegen.ts         # phase 2 — buildNinaImagePrompt's own field
lib/nina/imageprefs.ts       # phase 1 — the field's new home
lib/nina/persona.ts          # phase 2 — ninaAppearance reads NinaImagePrefs.wardrobe
lib/nina/selfiegen.ts        # phase 2 — a comment about reading the prefs live
tests/nina.imagerecipe.test.ts  # phase 2 — the prompt contract
```

Plus whatever phase 1, 4, 5 and 6 add under `lib/nina/imageprefs.ts`, `lib/admin/imageGenModel.ts`,
`lib/admin/imageGenActions.ts`, `components/admin/ImageGenPanel.tsx`,
`tests/admin.imagegen.test.ts` and `tests/nina.imageprefs.test.ts`.

**Zero hits from this phase's own package** is the sharp form of it:

```bash
grep -rni 'wardrobe' \
  lib/nina/tuning.ts lib/nina/queries.ts lib/db/schema.ts lib/admin/ components/admin/CharacterPanel.tsx \
  components/admin/DialSlider.tsx app/admin/ tests/nina.tuning.test.ts tests/admin.tuning.test.ts \
  tests/db.schema.nina.test.ts --include='*.ts' --include='*.tsx'
```

Expected: only the deliberate historical notes this plan writes — the `F41 R3` paragraphs in
`lib/nina/tuning.ts`, `lib/db/schema.ts` and `lib/admin/schema.ts`, plus phase 4's own field under
`lib/admin/imageGenModel.ts` / `lib/admin/imageGenActions.ts` / `lib/admin/schema.ts`. **No
identifier, no type member, no column, no Zod key, no JSX.** Check that mechanically:

```bash
grep -rnE '(readonly |^\s*)wardrobe(\?)?:|\.wardrobe|coerceNinaWardrobe|NINA_WARDROBE_MAX' \
  lib/nina/tuning.ts lib/nina/queries.ts lib/db/schema.ts lib/admin/tuningModel.ts \
  lib/admin/tuningActions.ts components/admin/CharacterPanel.tsx tests/nina.tuning.test.ts \
  tests/admin.tuning.test.ts tests/db.schema.nina.test.ts
```

Expected output: **empty** (exit status 1).

`.md` hits are checked separately, because `lib` and `docs` contain landed plan archives that must
keep their text:

```bash
grep -rli 'wardrobe' app components lib tests docs --include='*.md'
```

Expected — and only these:

```
components/admin/.workflows/plan/P2-CA-A000.md      # archive, do not edit
components/admin/.workflows/plan/P2-CA-A002.md      # archive, do not edit
components/admin/.workflows/todos.md                # landed record, do not edit
components/admin/.workflows/package_readme.md       # rewritten in Step 12 (one F41 R3 note)
docs/nina/persona.md                                # rewritten in Step 12
lib/admin/.workflows/package_readme.md              # rewritten in Step 12 — no hit expected
lib/db/.workflows/package_readme.md                 # rewritten in Step 12 (F41 R3 notes)
lib/nina/.workflows/package_readme.md               # rewritten in Step 12 (F41 R3 notes)
lib/nina/.workflows/plan/P1-NIN-A000.md             # archive, do not edit
lib/nina/.workflows/plan/P1-NIN-A001.md             # archive, do not edit
lib/nina/.workflows/plan/P1-NIN-A002.md             # archive, do not edit
lib/nina/.workflows/plan/P1-NIN-A003.md             # archive, do not edit
lib/nina/.workflows/plan/P1-NIN-A005.md             # archive, do not edit
lib/nina/.workflows/todos.md                        # landed record, do not edit
```

(`lib/admin/.workflows/package_readme.md` drops off the list entirely after Step 12 — its one
mention was the `NINA_WARDROBE_MAX` bound and nothing replaces it.)

**The four statements that make this phase done:**

1. `/admin/personality` renders no Wardrobe control, and one save still writes the whole tuning.
2. `drizzle/0012_*.sql` is generated, unrenamed, applied, and contains exactly
   `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe";`.
3. `readNinaTuning` on a pre-existing row still returns a valid `NinaTuning` — proven by the manual
   check at step 2 above and by `coerceNinaTuning`'s `pick`-based read (Step 1's impact note).
4. `npm run typecheck && npm run lint && npm test && npm run format:check && npm run build` all
   pass, and the two greps above return the expected sets.

---

## Handoffs

Work found while planning this phase and deliberately left to another:

- **`lib/nina/persona.ts:1473`** was going to be handed to phase 2 and is **not** — phase 2's plan
  landed mid-write and explicitly declines it (*"still true. No edit."*), correctly for its own
  commit. This phase claims it as **Step 10b**, with the region-disjointness argument recorded
  there. The reconciler may move it into phase 2's diff instead; the step says how.
- **`tests/nina.imagerecipe.test.ts:118,144,148,205`** — four `wardrobe` mentions. **Phase 2 alone**
  (index: *"`tests/nina.imagerecipe.test.ts` restated for the new contract"*). Not edited here, and
  the Interface Contract says so explicitly so the reconciler does not assign it twice.
- **`CHANGELOG.md` needs an entry for the Image Generation tab** (R2, R4–R12) — the body canon, the
  new route, the prefs row, the reference image, the picker and the test button. That is the feature,
  and this phase only removed a clause about a field that never shipped. **Phase 4 or the
  reconciler**, once the set is whole; one phase writing a changelog entry for six other phases'
  work is how a changelog stops matching the code.
- **`lib/db/schema.ts`'s `nina_tuning` header count of *eleven* traits and *sixteen* flags was
  already stale** before this phase (`horny` made it twelve and seventeen). Step 3 corrects it,
  because dropping the wardrobe is what puts a reader in front of that sentence — but the same
  staleness may exist in other headers in that 3000-line file. Not swept here; a `lib/db` audit is
  its own task.
- **Restoring the column is documented but not scripted.** If someone ever needs it back, the
  recipe is in **Rollback** below. A `scripts/` helper for it would be dead code the day the branch
  merges.

---

## Rollback

This phase is one commit on `feature/nina-image-generation-tab`, so `git revert` is the unit — but
the column drop is DDL and `git revert` does not un-drop a column. Two moves, in this order:

**1. Put the column back and refill it from the copy phase 1 made.** Against the same database
`drizzle.config.ts` points at:

```sql
ALTER TABLE "nina_tuning" ADD COLUMN "wardrobe" text;
UPDATE "nina_tuning" t
   SET "wardrobe" = COALESCE(p."wardrobe", '')
  FROM "nina_image_prefs" p
 WHERE p."user_id" = t."user_id";
UPDATE "nina_tuning" SET "wardrobe" = '' WHERE "wardrobe" IS NULL;
ALTER TABLE "nina_tuning" ALTER COLUMN "wardrobe" SET NOT NULL;
```

Add-nullable, backfill, then `SET NOT NULL` — never `ADD COLUMN ... NOT NULL` in one statement, and
never with a `DEFAULT ''`, because `tests/db.schema.nina.test.ts` asserts this table carries no SQL
default on any stored value (*"the defaults live in TypeScript"*).

**2. Revert the code.**

```bash
git revert --no-commit <this phase's commit>
rm -f drizzle/0012_*.sql drizzle/meta/0012_snapshot.json
# then hand-remove the thirteenth (last) entry from drizzle/meta/_journal.json, and
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = '<the 0012 row's hash>';
```

The journal and the `__drizzle_migrations` table must be walked back together or the next
`db:generate` diffs against a snapshot for a state the database is not in.

**Why the data survives either way:** phase 1 copied every non-empty `nina_tuning.wardrobe` into
`nina_image_prefs.wardrobe` before this phase ran, and Precondition D proved it for this database
with `uncopied = 0`. `nina_image_prefs` is not touched by this phase or by its rollback, so the
operator's wardrobe line is readable throughout — which is the entire reason the index's Open
Questions section is empty and the entire reason this drop was allowed at all.

**What cannot be rolled back independently:** nothing. This phase creates no row, writes no blob and
changes no Blob pathname. It removes a column whose only reader (`ninaAppearance`) phase 2 had
already re-pointed, and a control whose replacement phase 4 had already shipped.
