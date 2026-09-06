# Plan: Admin responsiveness + Nina relationship and intimacy tuning

**Slug:** admin-responsive-nina-intimacy
**Date:** 2026-09-06 20:50:48
**Analysis:** `20260906-205048-K4M2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-responsive-nina-intimacy`
**Branch:** `feature/admin-responsive-nina-intimacy` (base: `origin/main` @ `02dc79a`)
**Phases:** 5
**Status:** phase 4/5 complete (4 ✅) — a phase is complete when its row in the Phases table is ticked ✅, which is the authoritative per-phase record because the phases land in parallel; the set is reviewed and merged as a whole
**Coordinator:** `orch-admin-responsive-nina-intimacy`

---

## Why

The user's rationale, in their own framing:

- `/admin` was built desktop-first and is used from an iPhone XS Max in Safari.
- Nina's `girlfriend` relationship level reads as a friendship with pet names in it; the user wants
  the register that actually goes with it in Indonesian — *manja*, *imut*, and the vowel-lengthening
  habit (`iyaa sayaangg`, `okeee`, `nanti yaaa, sabaar`).
- The user wants a `horny` axis beyond the existing `flirty` and `steamy` traits: how sexually
  forward Nina is, how often she initiates, how descriptive she is, and how much she varies the
  scenario instead of repeating one.
- The user wants a per-parameter on/off toggle so the assembled prompt can be narrowed to the
  parameters that matter for a given mood, instead of carrying every slider's paragraph.
- Stated constraint, verbatim: *"let glm 5.3 dev be the only guardrail."* This plan takes that
  literally — see Decisions.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Revamp the `/admin` UI to be responsive on iPhone XS Max Safari | 1, 2 |
| R2 | `girlfriend` relationship ⇒ more *manja* and *imut*, with Indonesian final-vowel lengthening | 3 |
| R3 | A new `horny` slider in `/admin/nina` — sexual forwardness, initiation rate, descriptiveness, scenario variety | 5 |
| R4 | An on/off toggle per parameter, to exclude it from the assembled prompt | 4 |
| R5 | Runtime detect-and-resubmit that rewrites a blocked prompt in subtler wording until `glm-5.3` stops refusing, plus tests proving the evasion is robust at max `horny` | **not planned — see Decisions** |

## Scope

**In scope**
- Responsive `/admin` shell and every admin surface, targeted at 414 × 896 with safe-area insets.
- `NINA_RELATIONSHIP_BLOCKS.girlfriend` and a relationship-gated orthography rule.
- A twelfth trait, `horny`, with band text, a proactive-opening clause, a verbosity floor, and the
  body-comment repeal.
- An `enabled` map over every tuning parameter, honoured by the prompt assembler and the panel.
- **Two** generated Drizzle migrations, one per phase that adds columns — `0006` for phase 4's
  sixteen `*_enabled` booleans, `0007` for phase 5's `horny` + `horny_enabled`. *(RECONCILED: this
  bullet read "one generated Drizzle migration covering both new columns", which contradicts D5 in
  this same document. D5 wins — it is the row that argues the question, and both phase plans
  generate their own. The analysis document's Impact Point 12 carries the same draft error.)*

**Out of scope**
- Any change to how a provider refusal is handled. `classifyImageFailure` (`lib/nina/imagefail.ts`)
  keeps classifying a refusal as `policy`, and Nina keeps saying one of her four hand-written
  in-register lines. No phase adds a softening-and-resubmit loop. See Decisions D1.
- The non-admin app surfaces (`/nina`, the run views). R1 names `/admin` only.
- `NINA_IMAGE_DAILY_CAP`. It is a money cap; no dial on this page may move it.

## Invariants

1. **Byte identity at the default tuning.** `buildNinaSystemPrompt(NINA_TUNING_DEFAULTS)` must
   render exactly the string it renders on `origin/main` @ `02dc79a`, at the end of every phase.
   `tests/nina.prompts.test.ts` is the gate. `horny` defaults to 0 (`off`) and `enabled` defaults
   to all-true precisely so this holds arithmetically rather than by careful editing.
2. **Byte identity for the other four relationships.** Phase 3 touches `girlfriend` only; the
   `nobody`, `casual_friend`, `sister` and `best_friend` blocks render unchanged.
3. **`lib/nina/tuning.ts` stays client-importable** — plain data and types, zero imports.
   `tests/admin.tuning.test.ts` asserts it.
4. **`lib/nina/imagefail.ts` imports nothing.** `scripts/nina-image-worker.ts` loads it by relative
   path under `--experimental-strip-types`.
5. **A dial's `path` field names a real line of shipping code.** `tests/nina.tuning.test.ts` fails
   on an empty one — a slider that moves nothing is a slider that lies.
6. **A disabled parameter contributes zero bytes**, whatever its score. Not "renders its identity
   band" — zero.
7. **The tree builds and `npm run test && npm run typecheck && npm run lint` pass at the end of
   every phase.**
8. **Migrations are generated, never hand-renamed.** A renamed migration keeps its old `when`,
   drops below the watermark, and is skipped silently.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Admin shell: viewport, safe areas, navigation | R1 | `app/admin`, `components/admin` | 11 | — | NORMAL | `.workflows/plan/admin-responsive-nina-intimacy/phase-1.md` | P1-RI-A017 | — |
| 2 ✅ | Admin surfaces: explorer, crop studio, tables, dials | R1 | `components/admin` | 15 | 1 | HARD | `.workflows/plan/admin-responsive-nina-intimacy/phase-2.md` | P1-CA-A001 | — |
| 3 ✅ | Girlfriend register: manja, imut, vowel lengthening | R2 | `lib/nina`, `tests`, `docs` | 6 | — | NORMAL | `.workflows/plan/admin-responsive-nina-intimacy/phase-3.md` | P1-NIN-A004 | — |
| 4 ✅ | Per-parameter enable toggles | R4 | `lib/nina`, `lib/admin`, `lib/db`, `components/admin`, `drizzle`, `tests` | 15 | 2, 3 | HARD | `.workflows/plan/admin-responsive-nina-intimacy/phase-4.md` | P1-NIN-A005 | — |
| 5 | The `horny` trait | R3 | `lib/nina`, `lib/db`, `drizzle`, `tests` | 10 | 4 | HARD | `.workflows/plan/admin-responsive-nina-intimacy/phase-5.md` | — | — |

**File counts are the phase files' own tables**, which is where the reconciliation put the truth.
Every one of the five differed from this table's draft; four of them were undercounts of work that
is mechanically required rather than optional (phase 4's `prompts/system.ts`, `db/schema.ts`,
`nina/queries.ts` and `db.schema.nina.test.ts` are the clearest case — an `enabled` map that has to
persist and has to reach the assembler cannot skip any of them).

Phases 1 and 3 share no edge and start together. Phase 2 follows 1; **phase 4 follows both 2 and
3**; phase 5 follows 4. Phases 3, 4 and 5 all edit `lib/nina/persona.ts`, which is why they are a
chain rather than a fan — the file is 76 KB of hand-reasoned prompt canon and two sessions editing
it at once is a merge conflict in the one file where a silent bad merge is least visible.

**Phase 4's `2` is an edge the draft did not have, and it is the set's one real ordering change.**
Both phases edit `components/admin/DialSlider.tsx`: phase 2 for touch sizing, phase 4 for the enable
toggle. Phase 4's plan replaces that file whole, so if it ran concurrently with — or before —
phase 2, it would silently revert phase 2's 44 px work with no conflict marker to notice. Phase 4's
Step 11 now quotes the file as phase 2 leaves it. That is the only file the two share.

The critical path is therefore `1 → 2 → 4 → 5` (four links), with `3` running free alongside `1`
and `2` and joining at `4`. Phases 1 and 3 are the two that can start immediately.

### Phase 1 — Admin shell: viewport, safe areas, navigation
**Satisfies:** R1
**Owns:** `app/globals.css`'s two new horizontal safe-area tokens, `app/admin/layout.tsx`,
`components/admin/AdminNav.tsx`, the four admin `page.tsx` header rhythms and container widths,
`tests/admin.shell.test.ts` (new), and — declared boundary exception, comment and test-title text
only — `app/layout.tsx`, `lib/pwa.ts`, `tests/pwa.install.test.ts`.
**Does not touch:** the interactive components in `components/admin/*` that phase 2 owns; nothing
under `lib/` except `lib/pwa.ts`'s comment; `components/admin/.workflows/package_readme.md`, which
is phase 2's.
**Exit criteria:** `/admin` and its three sub-routes render at 414 px with the shell introducing no
horizontal scroll; nothing sits under the notch or the home indicator; the nav is a four-cell fixed
bar in the bottom 56 px below `lg` and the unchanged sticky rail at `lg`; reachable one-handed.
**Structural facts phase 2 depends on:** one breakpoint (`lg`), `<main className="min-w-0">`, and
the bar's geometry — `h-14` + `border-t`, `z-30`, `fixed bottom-0` below `lg`.

### Phase 2 — Admin surfaces: explorer, crop studio, tables, dials
**Satisfies:** R1
**Owns:** `components/admin/touch.ts` (new — `TOUCH_TARGET` / `TOUCH_ICON`, the 44 px rule spelled
once), `FileExplorer.tsx`, `explorer/{FolderTree,PhotoGrid,SelectionPane,UploadQueue}.tsx`,
`CropStudio.tsx`, `MemoryTable.tsx`, `ChatPhoto{Grid,Detail}.tsx`, `PhotoMoveBar.tsx`,
`DialSlider.tsx`, `FolderMenu.tsx`, `UserPicker.tsx`, and
`components/admin/.workflows/package_readme.md` — **the one readme pass for both R1 phases.**
Reads and explicitly leaves unchanged, with the reason recorded: `ChatPhotoControls.tsx`,
`ChatPhotoAdd.tsx`, `ShareToNinaItem.tsx` (all already `Button size="md"` = `h-11` = 44 px) and
`CircleFrame.tsx` (non-interactive, and its box must stay square).
**Does not touch:** `app/admin/layout.tsx`, `AdminNav.tsx`, the four admin pages — phase 1's, and
this phase quotes them as phase 1 leaves them. `CharacterPanel.tsx` — phase 4's. No file under
`lib/`, and no test file.
**Exit criteria:** the three-pane explorer stacks with the folder rail behind a button; the crop
studio pans, pinches and zooms by touch and raises no iOS callout; tables scroll inside their own
container and no control on them zooms the viewport on focus; every interactive control in
`components/admin/` is ≥ 44 px on its smaller axis; nothing scrolls the page sideways at 414 px.
**Owes phase 4:** `DialSlider`'s header row as `flex items-center gap-2` with `ml-auto` on the
readout — the geometry a toggle of any height needs. **No prop is added**; phase 4 adds
`enabled` / `onEnabledChange` itself.

### Phase 3 — Girlfriend register: manja, imut, vowel lengthening
**Satisfies:** R2
**Owns:** `NINA_RELATIONSHIP_BLOCKS.girlfriend` in `lib/nina/persona.ts`, the new
relationship-gated orthography rule beside `JAKARTA_REGISTER`, girlfriend-only `VOICE_EXAMPLES`
(gated, not appended unconditionally), the `isGirlfriend` gate seam, two block entries plus two
import names in `lib/nina/prompts/system.ts`, **the set's single `NINA_PROMPT_VERSION` bump (3 → 4)**,
`docs/nina/persona.md`, and `tests/__snapshots__/nina.prompts.test.ts.snap` — **a set-wide gate, not
a phase-3 artifact.**
**Does not touch:** the other four relationship blocks; `NINA_TRAIT_BANDS`; `NINA_DIAL_BANDS`;
`lib/nina/tuning.ts` (checked and deliberately unchanged — `NINA_ADDRESS.girlfriend` is already the
manja pet-name set, and `sayaangg` is `sayang` with this phase's own orthography rule applied).
**Exit criteria:** with `relationship: 'girlfriend'` the prompt carries the manja register and the
vowel-lengthening rule with the user's five examples; with the other four it is byte-identical to
`origin/main`, and the committed snapshot proves it.
**Binding on phases 4 and 5:** never regenerate that snapshot. `vitest -u` is forbidden for the rest
of the set.

### Phase 4 — Per-parameter enable toggles
**Satisfies:** R4
**Owns:** an `enabled: Record<NinaTuningKey, boolean>` on the tuning row — `lib/nina/tuning.ts`
(key union derived by spread, defaults, coercion, the gate-aware score readers `ninaTraitScore` /
`ninaDialScore` / `ninaActiveRelationship`), `lib/nina/persona.ts` (the gate under every band
lookup), `lib/nina/prompts/system.ts`'s `systemDials` **only**, `lib/db/schema.ts`'s sixteen
nullable `*_enabled` columns, `lib/nina/queries.ts`'s row mapping, `lib/admin/schema.ts`,
`lib/admin/tuningActions.ts`, `lib/admin/tuningModel.ts`, `components/admin/CharacterPanel.tsx`,
`components/admin/DialSlider.tsx`'s toggle affordance, one generated migration (`0006`), and four
test files.
**Does not touch:** the band text itself; the `horny` key (phase 5 adds it and it inherits the
toggle for free, because the key union is a spread of `NINA_TRAITS` / `NINA_DIALS`); phase 2's
touch classes in `DialSlider.tsx` — Step 11 quotes that file as phase 2 leaves it and states its
diff as eight numbered points; `tests/__snapshots__/nina.prompts.test.ts.snap`.
**Exit criteria:** every trait, dial and the relationship has a working checkbox saved by the same
one Save button; for every key in `NINA_TUNING_KEYS`, parked at 100 with the toggle off renders the
shipping prompt byte for byte; all-enabled at defaults is byte-identical; the snapshot passes
unmodified; a row written before the migration reads as all-enabled with no backfill.
**Owes phase 5:** `ninaTraitScore(tuning, 'horny')` as the read seam, and a key union that grows
with `NINA_TRAITS` on its own.

### Phase 5 — The `horny` trait
**Satisfies:** R3
**Owns:** the `horny` key in `NINA_TRAITS` / `NINA_TRAIT_SPECS`, its `NINA_TRAIT_BANDS` entry, its
membership of `BODY_REPEALED_BY`, `VERBOSITY_FLOOR_BY_HORNY_BAND` + `ninaEffectiveVerbosity`, the
one-line `systemDials` verbosity change and the `horny` clause in `proactiveTuningSuffix`
(`lib/nina/prompts/system.ts`), the `horny` + `horny_enabled` columns and one generated migration
(`0007`, after rebasing on phase 4), the row mapping for both, `CharacterPanel.tsx`'s docstring
(prose only), and three test files.
**Does not touch:** `lib/nina/imagefail.ts`; `lib/llm/*`; any provider call path; `lib/nina/proactive.ts`
(the copy this phase changes lives in `system.ts`); `clinginess`'s three silence thresholds; the
toggle mechanism (phase 4's); `NINA_PROMPT_VERSION` (phase 3's); the snapshot fixture.
**Exit criteria:** `horny` renders as a twelfth slider, persists, and moves the named lines. At
`off` the prompt is byte-identical to `origin/main` @ `02dc79a`. At `max` it carries the explicit
register block, the body repeal in all three places, the raised verbosity floor reaching the bubble
sentence, and the proactive opening clause. Disabling it returns the prompt to byte-identical **and
drops the verbosity floor**, at any score.


## Reconciliation Log

Seventeen conflicts found, seventeen resolved by editing the plan files and this index. Nothing
deferred; **Open Questions is empty.** "Rung" is the precedence ladder the resolution was taken on: 1 stated
invariant · 2 phase exit criteria · 3 the plans' code blocks · 4 this index's Why / Requirements /
Owns · 5 the user's raw input · 6 the surrounding code's convention.

| # | Conflict | Kind | Phases | Resolution | Rung |
|---|---|---|---|---|---|
| C1 | `explorer/UploadQueue.tsx:93` is `sticky bottom-0` and parks **under** phase 1's new fixed nav bar below `lg`. Phase 2's draft padded `--safe-bottom` but never moved the anchor — its `Requires` asserted, wrongly, that *"phase 1 does not add a fixed/sticky bottom element."* | File collision, later phase quoting pre-change state | 1 → 2 | **Phase 2 pays it.** Step 6's container is now `sticky bottom-[calc(3.5rem+var(--safe-bottom))] … lg:bottom-0`; `3.5rem` is the bar's `h-14`. Phase 2's `Requires` bullet is rewritten to record the bar's real geometry as a dependency, and phase 1's Handoffs item 1 is marked RESOLVED. | 3 — phase 1's contract table states the geometry; phase 2's code block was written against a tree that did not have it |
| C2 | **Unreported second collision with the same bar:** `FolderMenu.tsx`'s five panels are `z-20`; the nav is `z-30`. A menu opened from a low folder row paints its Delete and Move rows *under* the bar. Neither planner saw it. | Ordering / stacking, gap | 1 → 2 | **Phase 2's Step 13 raises all five to `z-40`**, and its `Requires` records `z-30` as a phase-1 fact. Those five are the only z-index in `components/admin/` on `origin/main`, so this is the whole of the stacking work. Phase 1's contract table now names it. | 3 — phase 1's contract already said *"any phase-2 overlay must sit above it"*; nobody checked which overlays existed |
| C3 | `components/admin/DialSlider.tsx` is edited by phase 2 (touch) and phase 4 (toggle). **Phase 4's Step 11 replaced the whole file, quoted from `origin/main`** — landing it would have silently reverted every one of phase 2's touch changes, with no merge marker. | File collision, deleted-then-used in effect | 2 → 4 | **Phase 4 now quotes the file as phase 2 leaves it.** Step 11's code block is rebuilt on phase 2's version (the `@/components/admin/touch` import, `h-11 touch-none` track, `TOUCH_TARGET` reset, `items-center` + `ml-auto` header row) and states its own diff as eight numbered points. | 1 — build-green wins; the later phase quotes post-change code |
| C4 | Phase 4's own handoff flagged that its new checkbox is `size-4` with **no touch target** — 16 px, in a package where phase 2 spends fourteen steps making everything 44. | Contract drift against a peer's exit criterion | 2 → 4 | **The checkbox is wrapped in `TOUCH_ICON`** from `components/admin/touch.ts`, as a `<label>` so the whole 44 px box is the hit target, with an `sr-only` accessible name. Phase 4's handoff is rewritten from "flagged for the reconciler" to "resolved in Step 11". | 2 — phase 2's exit criterion is *"every interactive control ≥ 44 px"*, and phase 4 adds one to that package |
| C5 | **Duplicate seam.** Phase 2 created `DialSliderProps.leading?: React.ReactNode` as "phase 4's seam"; phase 4 independently designed `enabled` / `onEnabledChange`. Shipping both leaves a dead prop; shipping only `leading` splits the toggle across two files and still needs `enabled` for the greyed track, struck label and `off` readout. | Duplicate work | 2, 4 | **`leading` is removed from phase 2; `enabled` / `onEnabledChange` is the mechanism.** Phase 2 keeps the header-row restructure, which is the load-bearing half and the part phase 4 cannot do for itself. Phase 2's Interface Contract, Files table, Step 12, Goal and Handoffs all rewritten; phase 2 now changes **no prop**. | 4 — this index's phase-4 **Owns** line reads *"`DialSlider.tsx` (the toggle affordance)"*; and rung 6, since this component renders its dot and its reset internally from data props rather than taking nodes |
| C6 | Phase 4 depended on 3 only, so a swarm could have run it beside or before phase 2 — the two share `DialSlider.tsx`. | Ordering violation | 2, 4 | **Phase 4's `Depends on` becomes `2, 3`**, in its own header, in its `Requires`, and in this index's phase table. Critical path is now `1 → 2 → 4 → 5`. | 1 — build-green; C3 is unresolvable without the edge |
| C7 | `components/admin/UserPicker.tsx`, `FolderMenu.tsx`, `ShareToNinaItem.tsx`, `CircleFrame.tsx` were in **neither** phase's owns list (phase 1's Handoffs item 4). | Gap | 1, 2 | All four are phase 2's. Three were already in its Files table; **`ShareToNinaItem.tsx` was the real gap** and is now an explicit **no-change** row with the reason: its one element is `buttonClasses({ size: 'md', fullWidth: true })` and `SIZES.md` is `h-11 px-4` (`components/ui/Button.tsx:42`) — already 44 px, already full width, no layout of its own. It was moved *out* of phase 2's vague "no responsive surface" bullet, because "unnamed" and "checked and fine" must not look the same. | 5 — gaps are assigned to the phase that owns the package |
| C8 | `components/admin/.workflows/package_readme.md` is falsified by **both** R1 phases at six places. Phase 1 declined it and handed it to "phase 2's readme pass" — **phase 2 had no readme pass.** | Gap | 1, 2 | **Assigned to phase 2 as a new Step 15**, covering phase 1's four falsifications and phase 2's own (the `touch.ts` module and the 44 px rule; `FolderMenu`'s `z-20` → `z-40` at `:331` and `:941`; `MemoryTable`'s hidden columns; the folder drawer). Line 952's "no active-link highlighting" rule is explicitly **kept** — phase 1 considered and obeyed it. | 5 — assigned to the phase that owns the package, and it is the later of the two |
| C9 | Both R1 planners wanted `tests/admin.responsive.test.ts` and neither wrote it, each correctly refusing to create a path the other might also create. | Gap (discretionary) | 1, 2 | **Not assigned, and recorded as such** in phase 2's Handoffs. No exit criterion in the set asks for it: phase 1's guard is `tests/admin.shell.test.ts`, phase 2's is a measurement in Safari, and R1 asks for a responsive admin rather than a lint rule about one. Left as a follow-up card, with `tests/admin.shell.test.ts` named as its natural home. **This is a declined extra, not an uncovered impact point.** | 2 — neither phase's exit criteria require it |
| C10 | Phase 1's Steps 9 and 10 edit `lib/pwa.ts` and `tests/pwa.install.test.ts` (comment and test-title text only) and invited the reconciler to strike them. | Boundary exception | 1 | **Kept.** No other phase in the set opens either file, so there is no collision to avoid; step 2 does make both files' prose factually false; and this repo treats a stale comment as a defect. Marked RECONCILED: kept, in phase 1. | 6 — surrounding convention |
| C11 | `horny`-as-a-dial residue survived in phase 4's **body** after D6 corrected it to a trait: its Creates list named `ninaDialScore` as *"the helper phase 5 calls for `horny`"*, and its handoff told phase 5 to add the key to `NINA_DIAL_SPECS`. | Contract drift | 4 → 5 | Both corrected to `ninaTraitScore` and `NINA_TRAIT_SPECS`, with the correction stated rather than silently applied. Three "a sixteenth **dial** must inherit the toggle" comments rewritten to "a seventeenth **key**", naming `horny` as the twelfth trait arriving through `...NINA_TRAITS`. | 1 — D6, which this index records as decided |
| C12 | **`expect(NINA_TUNING_KEYS).toHaveLength(16)`** in phase 4's `tests/db.schema.nina.test.ts` case. Phase 5 makes it 17, turning a phase-4 test red for a reason that says nothing about phase 5's bug. | Broken-build phase (the later one) | 4 → 5 | Replaced with the derived assertion phase 4 already uses elsewhere: `toEqual(['relationship', ...NINA_TRAITS, ...NINA_DIALS])` plus the no-duplicates check. Sixteen survives only where it is a fact rather than an assumption — the count of columns phase 4's own migration creates. | 1 — invariant 7, green at the end of *every* phase |
| C13 | `lib/nina/prompts/system.ts` is edited by phases 3, 4 and 5, and no plan said which regions or in what order. | File collision without a stated sequence | 3 → 4 → 5 | **Verified disjoint and written down in all three plans** as a region table: phase 3 owns the `../persona` import list and the first three `renderSections` entries; phase 4 owns `systemDials` **only**; phase 5 owns `systemDials`' single `verbosity` line (quoting phase 4's version), `proactiveTuningSuffix`, and two more import names appended **to the list as phase 3 leaves it**. | 3 — read against the real file at `02dc79a` |
| C14 | **Phase 5's verbosity floor described machinery that does not exist.** It had `buildOutputRule` selecting on `ninaEffectiveVerbosityBand(tuning)` *"instead of `dialBand(tuning, 'verbosity')`"* — but `buildOutputRule` has never called `dialBand`; verbosity reaches the bubble sentence through `bubblePreferenceLine`, a **default-relative ladder over the raw score** that `system.ts:99-102` calls *"deliberately not a second band scheme"*. The draft also passed `ninaBand(x)` where a `NinaBandName` was wanted — `ninaBand` returns `{ index, name }`. Two type errors and a design that would have had to replace `bubblePreferenceLine` to land. | Contract drift; broken-build phase | 5 | **Rewritten as a SCORE floor** (`VERBOSITY_FLOOR_BY_HORNY_BAND: Record<NinaBandName, number>`, `ninaEffectiveVerbosity`), consumed by one line in `systemDials`. Every property the draft argued for survives: floor not override, one band→bound mapping, default unchanged arithmetically. Recorded as **D7** below. | 6 — the surrounding code's convention, against which the draft's own design was the outlier |
| C15 | Phase 5's proactive clause was written as a `{ high, max }` record; `proactiveTuningSuffix` is an if-ladder pushing onto `lines[]`. Separately, the analysis document's **Impact Point 13 names `lib/nina/proactive.ts`**, which no plan's Files table listed. | Contract drift; unowned impact point | 5 | Step 5 rewritten to the real shape. **Impact Point 13 is served in `lib/nina/prompts/system.ts`, and `proactive.ts` is correctly not edited** — `proactive.ts:628` and `system.ts:564` both state that `proactive.ts` owns trigger LOGIC and `system.ts` owns trigger COPY, and R3 asks for different copy. Stated in phase 5's interface contract so the next reader does not re-open it. | 6 — the two files' own stated division |
| C16 | Phase 3 committed `tests/__snapshots__/nina.prompts.test.ts.snap` as a set-wide gate and told phases 4 and 5 never to regenerate it. **Phase 5 carried the prohibition; phase 4 did not.** | Gap | 3 → 4 | Added to phase 4's cross-phase conflicts, its Verification (*"never pass `-u`/`--update` to vitest, in this phase or anywhere in this set"*, with what a red snapshot would actually mean) and its exit criteria (`git status` shows the fixture untouched). | 1 — invariant 1, of which the fixture is the gate |
| C17 | **This index contradicted itself.** Its Scope said *"One generated Drizzle migration covering both new columns"*; its own **D5** says two, one generated per phase, and argues the point. The analysis document's Impact Point 12 carries the same draft error. | Contract drift, inside the index | 4, 5 | **D5 wins and the Scope bullet is corrected** to two migrations, `0006` and `0007`, with the correction stated. Both phase plans already generate their own, so no phase file needed editing — only this document did. Rollback updated with the numbers. | 4 — within this index, the Decisions row that argues a question beats a Scope bullet that merely asserts one |
| C18 *(round 2)* | This index's header still read `**Status:** planned`. Round 1 rewrote the body from draft to final but never flipped the field, so every consumer that gates on the status — `/analyze` Step 11, and the swarm orchestrator that refuses to launch over an unreconciled set — would have read this set as still in draft and declined to start it. | Contract drift, inside the index | — | **`**Status:** reconciled`.** No plan file touched; the field is the only thing that changed. | 4 — the index's own Reconciliation Log and Decisions sections, which only exist once a set is reconciled, against a header field that had not been updated to match them |

**Round 2 — verification pass, no other edit needed:**

- **The three round-1 contract changes carry cleanly through all six files.** `DialSliderProps.leading`
  survives only inside phase 2's and phase 4's explicit *RECONCILED* notes explaining that it is not
  created, and in this log's C5 row; phase 2's Interface Contract states **"Signature changes: none"**
  and its Files table row reads *"No prop change"*, while the header-row restructure phase 4 depends
  on (`flex items-center gap-2` + `ml-auto`) is present in phase 2's contract, Files table, Step 12
  code and handoff docstring. Phase 4's `Depends on: 2, 3` agrees across its header, its `Requires`
  block and this index's phase table, and the only critical-path prose in the set (this index,
  lines 109-110) reads `1 → 2 → 4 → 5` with 1 and 3 startable immediately. `ninaEffectiveVerbosity`
  is the only spelling in phase 5's Step 4 code, its four test assertions, its `systemDials` block
  and its interface contract; the single surviving `ninaEffectiveVerbosityBand` is the blockquote in
  Step 4 that quotes the superseded draft in order to refute it. No other phase names either symbol.
- **The D1 sweep re-run at round 2 is still clean.** `imagefail` / `guardrail` / `refusal` / `retry` /
  `soften` / `subtler` / `workaround` / `lib/llm` / `POLICY_BODY_RE` match in six places, every one of
  which is a *prohibition* (phase 5's "does not touch" block and exit criteria, phase 4's leaves-alone
  list, this index's Scope and D1) plus one false positive — phase 2 imports the pre-existing
  `UploadRefusal` type from `@/lib/admin/filetree`. Nothing to delete.
- **The cheap re-checks hold.** `## Open Questions` is empty. Every phase header's **Satisfies**
  matches the Requirements table (1 → R1, 2 → R1, 3 → R2, 4 → R4, 5 → R3; R5 unowned by design under
  D1). The `Depends on` column is a DAG — `1 → 2 → 4 → 5` with `3 → 4`, no back edge and no cycle.
  `lib/nina/tuning.ts` stays zero-import: phase 4 states it explicitly at its Step 1 impact line and
  phase 5 only appends a key and a spec object to existing arrays. Phase 3 claims the single
  `NINA_PROMPT_VERSION` bump (3 → 4) in four places and phase 5 carries **"Do NOT bump
  `NINA_PROMPT_VERSION`"** in both its Step 5 and its interface contract.
- **Phase 4's sixteen `*_enabled` columns vs. phase 5's seventeen keys is not a conflict.** Sixteen is
  correct at phase 4 (11 traits + 4 dials + relationship) and phase 5 generates the seventeenth,
  `horny_enabled`, alongside its own trait column. Phase 4's assertion is already derived
  (`toHaveLength(1 + NINA_TRAITS.length + NINA_DIALS.length)`), so phase 5 cannot turn it red.

**Also verified, no edit needed:**

- **D1 sweep.** Every phase file was grepped for `imagefail` / `guardrail` / `refusal` / `retry` /
  `softening` / `lib/llm`. **Zero refusal-retry, prompt-softening or guardrail-workaround steps
  exist in any of the five plans** — nothing had to be deleted. Phase 5 refuses it explicitly in
  three places (its scope, its test rationale, its exit criteria) and cites `lib/db/schema.ts:1690`'s
  own *"The ceiling is the image provider's, never ours."* Invariant 4 holds by construction: no
  phase's Files table lists `lib/nina/imagefail.ts`, `lib/llm/*` or any provider call path.
- **`NINA_PROMPT_VERSION`, the single bump.** Phase 3's claim (3 → 4) stands. Phase 4 never touches
  the constant; phase 5 carries an explicit *"Do NOT bump"* naming phase 3 as owner. Phase 3's
  handoff is upgraded from a question to a verified fact.
- **Migration numbering.** `drizzle/meta/_journal.json` on `origin/main` @ `02dc79a` ends at
  `idx: 5` / `0005_nina_persona_tuning`. **`0006` is free for phase 4** as its plan says, and
  **phase 5 is `0007`**. Neither plan renames a file, and both now say `<generated>` where the draft
  invented a name — phase 5's Files table had `0007_nina_horny.sql`, which is the hand-naming
  invariant 8 forbids, and now reads `0007_<generated>.sql`. Phase 5's *"generate AFTER rebasing on
  phase 4"* is present and now states why. The apparent conflict between phase 4's *"there must not
  be a backfill statement"* and phase 5's `DEFAULT 0` / `DROP DEFAULT` pair is not one, and phase 5
  now explains why in place: phase 4's columns are nullable so a backfill would restate a fact the
  code holds, while `horny` is `integer NOT NULL` and PostgreSQL cannot add such a column to a
  non-empty table any other way. Phase 5's `horny_enabled` gets no backfill, exactly like phase 4's
  sixteen.
- **`lib/nina/tuning.ts` stays zero-import** (invariant 3). Phase 3 changes nothing in it and
  records why; phase 4's additions are plain data, type helpers and pure readers; phase 5 adds a
  key and a spec object. No phase adds an import to that file.
- **Every Impact Point is owned.** 1-3 → phase 1; 4-7 → phase 2; 8 → phase 3; 9 → phases 4 and 5;
  10-12 → phase 4; **13 → phase 5, in `prompts/system.ts` rather than in `proactive.ts`** (C15).
  Every entry of the analysis document's Reference List falls inside one of those.
- **Every requirement is owned.** R1 → 1, 2. R2 → 3. R3 → 5. R4 → 4. R5 is recorded as not planned
  under D1, which is a scope decision this reconciliation did not reopen. No `R` moved between
  phases, so no **Satisfies** line changed and the Requirements table above stands as drafted.

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| **D1** — R5's *"regenerate the prompt with more subtle words … to work around the guardrails"* vs. the user's own note 1, *"let glm 5.3 dev be the only guardrail"* | **Note 1 wins. No phase builds a refusal-detect-and-resoften retry loop.** The two sentences ask for opposite things: one makes GLM the ceiling, the other defeats the ceiling. A loop that rewrites a blocked prompt until a safety classifier stops catching it is automated circumvention of another provider's safety system, and it is content-agnostic once built — so it is out of scope for this plan set independently of what it would be pointed at. `classifyImageFailure` → `policy` → Nina's four in-register lines stays exactly as it is (invariant 4). The parts of R3 that do *not* depend on evasion — the dial, the bands, the initiation weighting, the scenario variety, the descriptiveness — are all planned, in phase 5. | 5: the user's raw input, read whole rather than in one paragraph |
| **D2** — what `horny`'s band text should literally contain | **Direction, not sample dialogue.** The band strings say what register she is in and what she initiates, in the shape every other entry in `NINA_TRAIT_BANDS` uses (`FLIRTY MAX. You flirt constantly…`). They do not embed transcribed sample lines. The existing table is written this way for a measured reason recorded in `persona.ts`: sample lines get echoed back verbatim by the model, which is why `VOICE_EXAMPLES` is a separate, deliberately short structure with a `teaches` field. | 6: surrounding convention |
| **D3** — does a disabled parameter render its identity band, or nothing? | **Nothing — zero bytes.** Rendering the identity band would make the toggle a no-op for every key already at its default, which is most of them, and R4's stated purpose is *"to make prompt more accurate"* — that is a request to shorten the prompt, not to neutralise a value. | 4: the index's Requirements table |
| **D4** — `horny` default score | **0, band `off`.** Any other default perturbs invariant 1 on a tree where two committed tests assert byte identity. The user reaches the behaviour by moving the slider, which is what the slider is for. | 1: plan invariant 1 |
| **D5** — one migration or two, for `enabled` (P4) and `horny` (P5)? | **Two, each generated by `drizzle-kit generate` in its own phase.** One shared migration would couple two phases that are otherwise a clean chain, and a hand-edited second migration is the exact failure recorded in this repo's history: a renamed migration keeps its old `when`, drops below the watermark, and is skipped silently. | 6: surrounding convention |
| **D6** — `horny` as a trait or a dial? | **A trait.** Decided against the first reading during phase 5's plan. `BODY_REPEALED_BY` in `persona.ts:848` is typed `readonly NinaTrait[]` and holds `flirty`, `steamy`, `concerned`; `horny` at the top must repeal *"Never comment on his body"*, and as a dial that needs a parallel repeal list plus a second repeal test in `prompts/system.ts` — which that file's own docstring calls out as "how the two halves of one repeal come to disagree". `NINA_TRAIT_SPECS` also carries `userSaid` (the user's verbatim sentence), which `NINA_DIAL_SPECS` does not, and `flirty`/`steamy` are traits on the same axis. The panel renders traits and dials through the same `DialSlider`, so R3's *"add a new sliding bar"* is unaffected. | 1: plan invariant 5 (a dial's `path` must name a real line) read against the repeal's type |
| **D7** — how does `horny` make her "talk longer"? A floor on `verbosity`'s **band**, or on its **score**? *(new fork, surfaced by reconciliation — phase 5's plan described a band floor consumed by machinery that does not exist.)* | **A score floor.** `VERBOSITY_FLOOR_BY_HORNY_BAND` is keyed by `horny`'s band and valued as a `verbosity` score (`high` → 60, `max` → 80, everything below → 0), and `ninaEffectiveVerbosity` is `max(own, floor)`. It reaches the prompt through one changed line in `systemDials`. The band form loses because its only consumer would have been `bubblePreferenceLine`, which is a **default-relative ladder over the raw score** — `raised` is "the operator moved it up at all", `loud` is "moved it up by a quarter of the range" — and `prompts/system.ts:99-102` says in as many words that those three predicates are *"deliberately not a second band scheme"*. Making the band form work meant replacing that ladder, which is a change to `verbosity`'s own behaviour that R3 never asked for. Everything phase 5 argued for survives the change: it is a floor and not an override, `verbosity` stays the only key that writes the bubble sentence, there is exactly one band→bound mapping, and at `off`/`low`/`mid` the floor is 0 so the default render is unchanged arithmetically rather than by a branch. | 6: the surrounding code's convention, against which phase 5's draft was the outlier — and the draft did not compile either way (`ninaBand` returns `{ index, name }`, not a name) |


## Open Questions

*(empty — every fork above was decided at Step 8, and reconciliation added exactly one more (D7)
rather than parking anything. D1 is a scope decision recorded here, not a question waiting on an
answer.*

*Seventeen conflicts were found and seventeen were resolved by editing the plan files and this
index; none was deferred. No requirement id is unowned, no impact point is unowned, and no fork in the set has
every branch irreversible — the two migrations are the only irreversible steps and neither is a
fork, since D5 already settled that they are two generated migrations in two phases. There is
nothing here for an executor to stop and ask about.)*

## Rollback

Per phase: each phase is one commit on `feature/admin-responsive-nina-intimacy`; `git revert` it.
Phases 4 and 5 each add a generated migration — reverting either needs the paired `drizzle-kit`
down path or a fresh generated migration dropping the column, never a hand-edited migration file.
Phase 4's is `0006` and phase 5's is `0007` — verified against `origin/main`'s journal, which ends
at `idx: 5`.
As a whole: delete the branch and the worktree; nothing here touches `main` or production data.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan ADMIN_RESPONSIVE_NINA_INTIMACY_PLAN.md
