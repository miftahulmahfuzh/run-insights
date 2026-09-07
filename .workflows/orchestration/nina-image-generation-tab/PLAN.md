# Plan: Nina Image Generation admin tab

**Slug:** nina-image-generation-tab
**Date:** 2026-09-07 12:40:15 +07:00
**Analysis:** `20260907-124015-IMGN_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-image-generation-tab`
**Branch:** `feature/nina-image-generation-tab` (base: `origin/main` merged at `4a7588e`)
**Phases:** 7
**Status:** reconciled
**Coordinator:** `orch-nina-image-generation-tab` (session `f3faf3b6`)

---

## Why

The user's rationale, verbatim:

> this long prompt only created a mediocre result. i dont care about her face, i care a lot about
> her voluptuous body: big boobs, bubble butt, big thighs , very long calves. always explicitly
> instruct these in the prompt.
>
> we need to change image generation prompt. in fact : make a new tab in admin: Image Generation
> for now add these parameters and fields:
> 1. remove Wardrobe field in /admin/personality (this new feature is more detailed version of it)
> 1. prompt length (sliding bar): the longer the prompt , the more detailed the prompt would be
> 2. focus on (select multi options): face, skin, big boobs, bubble butt, big thighs, very long calves
> 3. wardrobe (free text) : e.g: long hugging leggings with string bra
> 4. venue (free text): Kuta streets in Bali
> 5. time (free text): e.g: sunny day , rainy night, cold afternoon
> 6. notes: e.g: nina is full of sweat
> 7. photo reference: user can select all photos in Nina's album and Chat photos . can you make
>    something like a simple photos grid without any captions (just like ios album app). user can
>    select one out of all these photos.
>
> also, add a test prompt button, so we can see if this prompt is actually allowed by Alibaba
> (qwen 3 devs) guardrails. and the photo result will automatically be added to Chat photos

The complaint is evidence and not a paraphrase: the pasted block is a verbatim `sidecarText()` dump
(`lib/nina/imagegen.ts:163`), so every line of it maps to a named constant. The analysis document's
"User-Provided Context" section has that mapping.

## Requirements

**Final, after reconciliation.** This is the map `create-task` reads to shape the board's cards, so
it matches the plans rather than the draft. Every `R` has at least one owner; no phase serves an `R`
outside its own **Satisfies** line.

| ID | What the user asked for | Phases | What each phase contributes |
|---|---|---|---|
| R1 | The body canon — big boobs, bubble butt, big thighs, very long calves — in **every** image prompt, unconditionally; the face loses primacy | 2 | 2: `NINA_BODY_SENTENCES`, the body-first subject paragraph, and the property test that every reachable prompt names all four facts (invariant 4) |
| R2 | A new admin tab: Image Generation | 4 | 4: the route, the sixth nav cell, the 3×2 phone grid, the paired bottom reserve, the hub card |
| R3 | Remove the Wardrobe field from `/admin/personality` | 7 | 7: the control, the draft, the Zod field, the model member, the coercer, both row mappers, and the column (migration `0012`) |
| R4 | Prompt-length slider: longer ⇒ more detailed prompt | 1, 2, 4 | 1: the 0–100 scale and the five-rung ladder · 2: what each rung spends · 4: the `DialSlider` and the rung caption |
| R5 | "Focus on" multi-select: face, skin, big boobs, bubble butt, big thighs, very long calves | 1, 2, 4 | 1: the six keys, specs and columns · 2: the emphasis clauses, *on top of* the canon · 4: the six checkboxes |
| R6 | Wardrobe (free text) | 1, 2, 4 | 1: the column, bound and coercer · 2: the wardrobe paragraph, with its missing sentence boundary fixed · 4: the field |
| R7 | Venue (free text) | 1, 2, 4 | 1: storage · 2: the `VENUE:` block · 4: the field |
| R8 | Time (free text) | 1, 2, 4 | 1: storage (column `time_of_day`) · 2: the `TIME:` block · 4: the field |
| R9 | Notes (free text) | 1, 2, 4 | 1: storage · 2: the `NOTES:` block · 4: the field |
| R10 | Photo reference — a caption-less iOS-album-style grid over Nina's album **and** Chat photos, single selection | 1, 3, 4, 5 | 1: the stored `{ source, id }`, the bounded union read, and **invariant 13** (no reference row, so no duplicate photograph) · 3: `input_references` on the wire and the anchored timeout · **4: the selection round-trips through the one save — the draft member, the Zod boundary, `referenceKey`/`parseReferenceKey`, and the `references`/`photoTotal` props** · 5: the grid itself |
| R11 | A test-prompt button that reports whether the provider's guardrails allowed it | 6 | 6: the dispatch, the verdict table, the poll, and `policy` rendered as a refusal and nothing else |
| R12 | The test result lands in Chat photos automatically | 6 | 6: an ordinary `purpose: 'selfie'` job, so `finishSelfie` writes the message + `kind: 'generated'` pair — no second writer of invariant 12 |

**One change from the draft: R10 gains phase 4.** Phase 4 always persisted the selection — its plan
says so and its Zod boundary, draft member and save all carry it — but the draft table listed only
`1, 3, 5`, which understated the work and would have produced a card for phase 4 that omitted the
picker's whole storage path. The step did not move; the id followed the work it was already doing.
Nothing else changed: no requirement lost an owner and no phase's **Satisfies** line was widened to
legalise creep.

## Scope

**In scope**

- A new per-user row, `nina_image_prefs`, holding everything the new tab collects.
- A rewritten `buildNinaImagePrompt` that is driven by those prefs and always names the body.
- A reference image on the OpenRouter call (`input_references`), with the timeout arithmetic
  re-derived for it.
- A sixth admin route, nav cell and hub card.
- A caption-less selectable grid over `nina_avatars` + `nina_message_images (kind='generated')`.
- An admin-initiated test generation that reuses the existing job pipeline and reports `policy`.
- Removal of `nina_tuning.wardrobe` — the UI field, the model member, and the column.

**Out of scope**

- `NINA_IMAGE_DAILY_CAP` stays at 6 and the test button spends it. The user said not to stint on
  tokens, not that the money cap should move; raising it is a one-constant change he can ask for.
- `NINA_IMAGE_RESOLUTION` stays `'1K'` and `NINA_IMAGE_ASPECT` stays `'3:4'`. "Mediocre result" is
  addressed as a prompt problem because the paste is a prompt; a resolution change doubles the
  price and was not asked for.
- The chat model's `generate_image` tool schema keeps `scene` and `mood`. The prefs are the
  operator's standing opinion; the scene is still hers per photograph.
- No folder grammar over `nina_message_images` (that table has no `folder` column and
  `/admin/photos` deliberately has none).
- No `thumb_url` column on `nina_message_images`. The picker loads originals, lazily, as
  `ChatPhotoGrid` already knowingly does.
- No async OpenRouter image API. There isn't one (`lib/nina/imagecall.ts:16-31`).

## Invariants

Every phase must hold all of these, and each is checkable:

1. **The tree builds, typechecks, lints and passes `npm test` at the end of every phase.** A
   phase that leaves `wardrobe` half-removed is a phase that broke the build for its successor.
2. **`lib/nina/imagerecipe.ts` imports nothing.** Its header states the rule twice;
   `scripts/nina-image-worker.ts:62-81` imports it by relative path under
   `--experimental-strip-types`. Anything that needs `@/` goes elsewhere.
3. **The threshold chain stays arithmetically true and asserted.**
   `NINA_TURN_SPENT_MS + <call timeout> + NINA_IMAGE_FINISH_RESERVE_MS <= NINA_HOST_MAX_DURATION_MS`
   for *both* the anchored and the unanchored timeout, and
   `NINA_IMAGE_STALE_MS > NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS`.
   `tests/nina.imagerecipe.test.ts` is where it is proved.
4. **The body canon cannot be switched off.** No value of any pref may produce a prompt that does
   not name the body. R1 says "always".
5. **No model call is awaited from a page render.** `ci:llm-payload-guard` Rule 2. The prompt
   *preview* is a pure assembly function, as `buildNinaSystemPrompt` is on `/admin/personality`.
6. **`requireAdmin()` is the first statement of every new page and every new Server Action.**
   `proxy.ts` matches neither `/admin` nor `/api/*`, so each is its own boundary.
7. **One save per surface, not one per field.** `/admin/personality`'s plan invariant 11, carried
   over: the panel sends the whole prefs object in one action.
8. **Money is never spent silently.** Every generation, including a test, writes a `nina_turns` row
   with its cost and counts against `NINA_IMAGE_DAILY_CAP` — which counts failures too.
9. **No secret literal outside `lib/nina/` and `lib/env.ts`** (`ci:openrouter-guard`), and no
   drizzle type or Zod schema crosses into a client component.
10. **Migrations are generated by `npm run db:generate`, never hand-named and never renamed.** A
    renamed migration keeps its old `when`, drops below the watermark, and is skipped silently.
11. **`nina_image_prefs` holds one column per parameter, no `jsonb`.** `lib/db/schema.ts`'s
    `nina_tuning` header argues it: a misspelt key in a blob is indistinguishable from an unset one,
    and the failure mode would be a control that silently does nothing.
12. **A photograph in the chat-photos collection always has a message.**
    `nina_message_images.message_id` is `NOT NULL`; a writer that leaves a caption bubble with no
    picture, or an image row with no message, is a bug (`addChatPhotoAction`'s undo path is the
    pattern). `nina_messages.photo_only` marks a bubble that exists *only* to carry a photograph,
    but it is a **deletion** marker read by `isNinaPhotoCarrierMessage` / `removeChatPhotoAction`,
    **not** a render suppressor — nothing in `components/` or `app/` reads it, so a carrier bubble
    still shows its caption. See Decisions.
13. **No photograph appears twice in the photo-reference union.** A row in `nina_message_images` is
    a *reference* — not a copy — when `source_avatar_id` **or** `source_image_id` is non-null
    (migration `0010_nina_image_provenance.sql`; `resolveAttachment` flattens
    `source_image_id ?? row.id`). The picker's union must contain none of them, or it draws an album
    face once as its `nina_avatars` row and again as the chat row that points at it — re-creating
    on a new screen exactly the duplication the `nina-photo-refs-and-bubble-actions` set removed.
    Held structurally: the chat side goes through `generatedChatPhotoScope`
    (`lib/nina/queries.ts:1649-1655`), whose `isOriginalPhoto()` conjunct (`:1616-1618`) is the
    filter, and the count is `countNinaChatPhotos`, which shares that scope. **Inlining
    `eq(kind, 'generated')` is forbidden and fails a test.** The album side needs no filter:
    `nina_avatars` is the origin side and has no provenance columns.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | `nina_image_prefs` — the row, the vocabulary, the reads | R4–R10 (storage) | `lib/db`, `lib/nina` | 7 | — | NORMAL | `.workflows/plan/nina-image-generation-tab/phase-1.md` | `P1-DB-A004` | **done `af0cb0b`** |
| 2 | The prompt: body canon, length ladder, focus, venue, time, notes | R1, R4–R9 (prompt) | `lib/nina` | 6 | 1 | HARD | `.workflows/plan/nina-image-generation-tab/phase-2.md` | `P1-NIN-A024` | **done `7c12c54`** |
| 3 | The reference image on the wire, and the timeout it costs | R10 (backend) | `lib/nina`, `scripts` | 7 | 1 | HARD | `.workflows/plan/nina-image-generation-tab/phase-3.md` | `P1-NIN-A026` | **done `5e70918`** |
| 4 | The route, the sixth nav cell, and the form | R2, R4–R9 (UI), R10 (the save) | `app/admin`, `components/admin`, `lib/admin` | 10 | 1 | HARD | `.workflows/plan/nina-image-generation-tab/phase-4.md` | `P1-ADM-C410` | **done `684e787`** |
| 5 | The photo-reference picker | R10 (UI) | `components/admin` | 4 | 1 | NORMAL | `.workflows/plan/nina-image-generation-tab/phase-5.md` | `P1-CA-A003` | **done `b691af8`** |
| 6 | Test prompt, its verdict, and the photo in Chat photos | R11, R12 | `lib/nina`, `lib/admin`, `components/admin` | 7 | 2, 3, 4 | HARD | `.workflows/plan/nina-image-generation-tab/phase-6.md` | — | — |
| 7 | Retire `nina_tuning.wardrobe` | R3 | `lib/nina`, `lib/admin`, `components/admin`, `lib/db` | 23 | 2, 4 | NORMAL | `.workflows/plan/nina-image-generation-tab/phase-7.md` | `P1-NIN-A029` | — |

Waves the `Depends on` column implies: **{1}**, then **{2, 3, 4, 5}** concurrently, then **{6, 7}**.

### Wave 1 landed — what phases 6 and 7 must code against

All four `done`, each verified from git as an ancestor of the branch **and** on `origin`, in commit
order `b691af8` (5) -> `5e70918` (3) -> `684e787` (4) -> `7c12c54` (2). Suite at `684e787`:
**156 files / 3232 tests, 0 failures**; `npm run build` green; `/admin/image-generation` a dynamic
route; all four `ci:*` guards OK. Phase 2 verified its own work at that tip: typecheck clean, lint 0,
`nina.imagerecipe` + `nina.prompts` 153/153, the property test green over its full 1280 combinations,
and `buildNinaSystemPrompt`’s snapshot unmoved.

**Corrections the phases made to their own plans, inherited by 6 and 7:**

| Fact | Rung | Why it matters downstream |
|---|---|---|
| **`NinaImageReference.id` is `string` with `''` for none — never `null`.** Phase 4 found `ninaImageReferenceSchema.id` specified `.min(1).nullable()` against its own `refine` that reads `''` as empty, so **no unselected reference validated at all** — the default state and the reset were both rejected at the boundary. Now `z.string().trim().max(NINA_IMAGE_REFERENCE_ID_MAX)`, refine unchanged, so `{album,''}` and `{none,'av_1'}` stay refused | 3 + *"the declaring phase owns the spelling"* | **Phase 6 reads this field at dispatch. Code against `''`, never `null`.** |
| **Phase 6 reads the SAVED selection, never the picker’s state** (phase 5’s H4) — an operator who picks a photo and hits Test prompt without saving would otherwise test the *previous* reference | 2 + 3 | `resolveNinaPhotoReference(userId, prefs.reference)?.blobUrl ?? null`, as phase 6’s exit criteria already require |
| `ninaAppearance(prefs: NinaImagePrefs, detail?: NinaAppearanceDetail)` is **nominal on purpose**, so a leftover `ninaAppearance(tuning)` is a compile error | 3 | phase 7 removes the last tuning reader |
| **`lib/nina/tuning.ts` carries 7 `wardrobe` grep hits, not the 4 phase 7’s exit criterion 3 predicts.** Phase 2 did not touch that file — the 4 was a stale prediction in the plan | 2 (measured against the file) | **phase 7’s gate must expect 7, or it reads a stale plan as drift** |
| In phase 7’s test *"R6: the PREFS wardrobe reaches the photograph and the TUNING wardrobe does NOT"*, delete **only** the `tuning:` line and keep every other assertion | 3 | |
| `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 220_000` via `ninaImageCallTimeoutMs(anchored)`; `NINA_IMAGE_RUN_BUDGET_MS` moved `200_000 -> 240_000` so an anchored attempt (220 + 20) fits. Invariant 3 asserted for **both** paths: `45+150+20=215` and `45+220+20=285`, each `<= 300` | 1 (invariant 3) | phase 6 dispatches through this; do not re-derive a timeout |
| **`SEAM — PHASE 6` is live in `684e787`** (3 occurrences), a `<p>` after the assembled-prompt disclosure and before the Save row. Replace with `<ImageGenTestPanel dirty={dirty} />`; `dirty` is already in scope | 3 | |
| **Leave `tests/admin.imagegen.test.ts` alone.** Its allowlist already names `runNinaImageTestAction` and `readNinaImageTestAction`, and the `requireAdmin`-is-first loop already covers exports that do not exist yet | 1 (invariant 6) + the allowlist-not-count row | editing it is how a green suite becomes a mid-wave conflict |
| Import `ADMIN_IMAGE_PREVIEW_SCENE` from `lib/admin/imageGenModel.ts`; do not mint a second constant. `export const maxDuration` is deliberately absent from the page and is phase 6’s to add | 3 | |
| Panel copy: *"one generation off today’s cap, plus its caption"* | 4 (revised R12) | the caption is a second model call |

**The 4/5 commit boundary does not match the phase boundary, verified both ways.** Phase 5’s Step 3
mount lives in **phase 4’s** `684e787`, not in `b691af8`: phase 5’s committed test asserts
`not.toContain('SEAM — PHASE 5')` from the instant the panel exists on disk, so invariant 1 forced the
mount before phase 4 could commit. Confirmed from git — `684e787` contains `PhotoReferencePicker`,
`SEAM — PHASE 5` is gone, `SEAM — PHASE 6` remains, and `b691af8` does not contain
`ImageGenPanel.tsx` at all. **So `git revert b691af8` alone leaves the mount, and `land --step check`
must not read that absence as phase 5 being incomplete.**

**One commit deliberately published a peer’s in-flight work, and no duplicate resulted.** `5e70918`
(phase 3) carries phase 2’s prompt hunks in the shared `tests/nina.imagerecipe.test.ts` — split by
reconciliation, phase 2 owning `describe('the prompt')` — and phase 2’s `P1-NIN-A024` todos entry,
both byte-unaltered and green at commit time. A pathspec commit reads the **worktree**, not the
index, so a shared-file commit necessarily publishes a peer’s content. Phase 2 then correctly did
**not** re-add the entry nor stage that test file; verified from git that `A024` appears exactly
twice in `7c12c54`, the same as in `5e70918`.

**The readmes are the coordinator’s, in one end-of-set pass.** Every wave-1 phase skipped
`readme-updater` by design. Outstanding: `components/admin` (owes `PhotoReferencePicker`,
`photoReferenceModel`, `ImageGenPanel`), `lib/admin` (owes both new actions and the model module),
`lib/nina` (owes the payload, the thresholds, the new `ninaAppearance` signature, `ninaBodyBlock`,
`NINA_BODY_SENTENCES` and `tuning.wardrobe`’s dead-weight status). Phase 2’s `readme-updater` had
already run before the skip instruction reached it; it reverted the file and saved the accurate draft
to `.workflows/orchestration/nina-image-generation-tab/phase-2-readme-draft.patch` (234 lines) —
**reuse it verbatim rather than rewriting.**

### Phase 1 landed — the vocabulary as built, which the rest of the set codes against

`af0cb0b`, TaskID `P1-DB-A004`, on `feature/nina-image-generation-tab` and on `origin`. Typecheck,
lint, `db:check` and `npm test` (154 files / 3126 tests) green; `schema.ts`, `queries.ts` and
`tests/db.schema.nina.test.ts` purely additive, and `writeNinaTuning` / `readNinaTuning` /
`tuningFromRow` / `tuningToColumns` byte-identical to their pre-phase state.

**`lib/nina/imageprefs.ts` is the set's authority** — Decisions row *"Which side owns a name when two
plans disagree"* says the declaring phase wins, so where a later phase's own prose disagrees with
this list, **this list is right and that prose is pre-reconciliation**. Phase 4 in particular.

| As built | Not | Consequence |
|---|---|---|
| `NINA_IMAGE_PROMPT_LENGTH_MIN` / `_MAX` / `_DEFAULT`, default `50` | `NINA_IMAGE_LENGTH_*` | conflict 9, already in Decisions |
| `ninaPromptLengthRungFor(bandIndex)` — takes a **band index** | a raw 0–100 score | callers also import `ninaBand` from `@/lib/nina/tuning`; re-deriving the five bands locally is forbidden |
| focus keys `face` `skin` `boobs` `butt` `thighs` `calves` | `bigBoobs` etc. | short forms throughout |
| `NinaImageFocusSpec.userSaid` | `.axis` | |
| `NinaImageReference { source, id }`, `id` a string with `''` for none; `NINA_IMAGE_REFERENCE_SOURCES = ['none','album','chat']` | `kind` | |
| `listNinaPhotoReferences` returns `NinaPhotoRefPage { rows, total, offset, limit }` — the field is **`rows`** | `items` | **new fact, not in the pre-flight Decisions table.** `PhotoReferencePicker`'s prop stays `items` (phase 5 declares it), so **phase 4's seam maps `rows` -> `items`** |
| invariant 13 held structurally: the chat set is reached via `generatedChatPhotoScope(userId)` and counted via `countNinaChatPhotos(userId)` | an inlined `eq(kind,'generated')` | inlining now **fails a source-level test** phase 1 added |

Migration `0011_natural_nico_minoru` is generated, unrenamed, and carries its hand-appended wardrobe
copy below the generated DDL. The branch's journal now holds **12** entries, newest `idx: 11` — so
**phase 7's Preconditions C/D hold exactly as written and it mints `0012`.**

**Phase 5, on the dev/live database as it stands:** 21 `nina_avatars` rows and **zero**
`nina_message_images` rows with `kind='generated'`. The picker union therefore reads `total: 21`, all
album. That is a truthful read, not a broken chat side — do not "fix" it.


### Phase 1 — `nina_image_prefs`: the row, the vocabulary, the reads
**Satisfies:** R4, R5, R6, R7, R8, R9, R10 (storage only)
**Owns:** the `ninaImagePrefs` table in `lib/db/schema.ts` and its generated migration; a new
zero-import `lib/nina/imageprefs.ts` holding the focus-key vocabulary, the prompt-length scale, the
free-text bounds, `NINA_IMAGE_PREFS_DEFAULTS`, the coercers and `NinaImagePrefs`;
`readNinaImagePrefs` / `writeNinaImagePrefs` / `listNinaPhotoReferences` /
`resolveNinaPhotoReference` in `lib/nina/queries.ts`; the union read that feeds the picker (album
rows + **original** `kind='generated'` chat rows, one bounded page, newest first); a data step that
copies each existing `nina_tuning.wardrobe` into the new row, hand-appended after
`db:generate`; `tests/nina.imageprefs.test.ts` and the `tests/db.schema.nina.test.ts` additions.
**This phase's vocabulary is the authority for the whole set** — `NINA_IMAGE_PROMPT_LENGTH_*`,
`NINA_PROMPT_LENGTH_RUNGS` / `ninaPromptLengthRungFor`, focus keys `face|skin|boobs|butt|thighs|calves`,
`NINA_IMAGE_REFERENCE_SOURCES`, and `NinaImageReference { source, id }` with `''` as the empty id.
**Does not touch:** `nina_tuning` (not one column, not one test — phase 7 owns its retirement);
`lib/nina/imagegen.ts`; `lib/nina/persona.ts`; anything under `app/`, `components/` or `lib/admin/`.
**Exit criteria:** `npm run db:generate` produces exactly one new `drizzle/0011_*.sql` (the
watermark is `0010` after the `origin/main` merge), it is **not** renamed, and the hand-written
backfill is appended **after** the generator ran, under the same banner comment
`0009_nina_message_photo_only.sql` and `0010_nina_image_provenance.sql` both carry;
`npm run db:migrate` applies it against the dev database; `readNinaImagePrefs` on a user with no row
returns `NINA_IMAGE_PREFS_DEFAULTS` with `revision: 0`; `writeNinaTuning` is untouched and every
existing test still passes; `lib/nina/imageprefs.ts` has an empty import list; **the picker union
contains no reference row and therefore no duplicate photograph (invariant 13), proved by a
source-level assertion that the chat side calls `generatedChatPhotoScope` rather than spelling a
`kind` comparison itself.**

### Phase 2 — The prompt: body canon, length ladder, focus, venue, time, notes
**Satisfies:** R1, R4, R5, R6, R7, R8, R9 (the prompt half)
**Owns:** `lib/nina/persona.ts` — a new `NINA_BODY` paragraph naming the four body facts, the
subject paragraph reordered so the body leads and the face follows, `ninaAppearance` re-pointed at
`NinaImagePrefs` and its `${wardrobe} She still has` splice given a sentence boundary;
`lib/nina/imagegen.ts` — `buildNinaImagePrompt` takes the prefs, implements the five-rung length
ladder, the focus-emphasis clauses, and the `VENUE:` / `TIME:` / `NOTES:` blocks; `selfiegen.ts` and
`avatargen.ts` read the prefs beside the tuning and pass them; `tests/nina.imagerecipe.test.ts`
restated for the new contract.
**Does not touch:** `nina_tuning.wardrobe` — it still exists and `NinaTuning` still carries it;
this phase stops *reading* it for the picture and phase 7 removes it. `imagerecipe.ts`'s payload and
timeouts (phase 3). Any admin surface.
**Exit criteria:** every string `buildNinaImagePrompt` can return contains the four body facts, for
every combination of prefs including all-empty and no-prefs-at-all (a property test, not four
examples); the length slider at its lowest rung produces a materially shorter prompt than at its
highest and both name the body; `EXPRESSION AND ENERGY` still follows `SCENE`; `set_avatar` picks up
the prefs without `avatartools.ts` being edited.

### Phase 3 — The reference image on the wire, and the timeout it costs
**Satisfies:** R10 (the backend half)
**Owns:** `lib/nina/imagerecipe.ts` — `buildImageRequestBody` gains an optional reference and emits
`input_references` in the shape `tools/gen_badge_art.py:352` verified, `NinaImageJobArgs` gains
`referenceUrl: string | null`, a new anchored call timeout, and the whole threshold block
re-derived and re-commented; `lib/nina/imagecall.ts` — fetch the reference bytes from Blob, encode
them, pass them, and select the timeout by whether a reference is present;
`scripts/nina-image-worker.ts` — the same at the second host; `tests/nina.imagerecipe.test.ts`'s
payload and arithmetic assertions.
Also **`lib/nina/imagerun.ts`** — the only place `args.referenceUrl` can be read on the app host
and the only place the retry budget is spent, so R10's backend cannot work without it; it is on no
other phase's Owns list. Plus `tests/nina.imagecall.test.ts` and `tests/nina.imageworker.test.ts`.
**Does not touch:** who *chooses* the reference (phase 5 picks it, phase 6 dispatches with it);
prompt assembly (phase 2); `NINA_IMAGE_RESOLUTION` / `NINA_IMAGE_ASPECT`.
**Exit criteria:** `buildImageRequestBody({ prompt, seed })` with no reference returns byte-identical
JSON to today's — the unanchored path must not change at all; with a reference it adds exactly one
`input_references` array of one `{ type: 'image_url', image_url: { url } }`; both timeouts satisfy
invariant 3 and the test says so; a reference that cannot be fetched degrades to an unanchored
generation with a warning, never a crash.

### Phase 4 — The route, the sixth nav cell, and the form
**Satisfies:** R2, R4, R5, R6, R7, R8, R9 (the UI half), **R10 (the selection's round trip — the
draft member, the Zod boundary, `referenceKey` / `parseReferenceKey`, and the `references` /
`photoTotal` props; phase 5 supplies only the grid)**
**Owns:** `app/admin/image-generation/page.tsx`; `components/admin/ImageGenPanel.tsx` (the
prompt-length slider via `DialSlider`, the six focus checkboxes, the four free-text fields, one
save, one reset, dirty-state, and a pure prompt preview); `lib/admin/imageGenModel.ts` (the draft
type and the copy accessors, reading phase 1's specs); the prefs schema appended to
`lib/admin/schema.ts` with **every bound imported** from `lib/nina/imageprefs.ts`;
`lib/admin/imageGenActions.ts` (save + reset only, though its structural tests already allowlist
phase 6's two); the sixth cell in
`components/admin/AdminNav.tsx` and the paired reserve in `app/admin/layout.tsx`; a hub card on
`app/admin/page.tsx`; `tests/admin.imagegen.test.ts` and the `tests/admin.shell.test.ts` updates.
**Does not touch:** the picker component (phase 5 — render a seam marked with the literal
`SEAM — PHASE 5`, supply `references` + `photoTotal`, and persist the selection through the same
save); the test button (phase 6 — a seam marked `SEAM — PHASE 6`, filled with
`<ImageGenTestPanel dirty={dirty} />`); `CharacterPanel.tsx` and everything else about the
wardrobe's retirement (phase 7).
**Exit criteria:** `/admin/image-generation` renders the slider, six checkboxes and four fields;
one save writes one row and reports the returned revision; every label and bound comes from
`lib/nina/imageprefs.ts` (with `ninaBand` from `lib/nina/tuning.ts` — two imports, both zero-import
vocabulary modules, because `ninaPromptLengthRungFor` takes a band index); the nav shows six cells that clear their character ceiling at 414 px and
the layout reserves exactly the bar's height; the preview is the pure assembler and no model call
happens in the render.

### Phase 5 — The photo-reference picker
**Satisfies:** R10 (the UI half)
**Owns:** `components/admin/PhotoReferencePicker.tsx` — a caption-less, gapless, square-tile,
single-selection grid over both sets, in the iOS Photos idiom the user named; its view model in
`components/admin/photoReferenceModel.ts`; the one edit to `ImageGenPanel.tsx` that replaces phase
4's seam with the mounted picker; `tests/admin.photoReference.test.ts`.
**Does not touch:** the page, the save action, the schema or the nav (phase 4 owns all four); the
generation path.
**Exit criteria:** the grid shows album photographs and chat photographs together, newest first,
with no caption, no filename and no date on any tile; **no photograph appears twice (invariant 13 —
phase 1's guarantee; this phase adds no de-duplication of its own and could not, since
`PhotoReferenceItem` carries no provenance)**; exactly one tile can be selected and the selection
round-trips through phase 4's save as `{ source, id }`, carried across the seam as the opaque string
`referenceKey(...)` produces; tiles are `loading="lazy"` and use `thumbUrl` when the row has one
(never for a chat row — that table has no `thumb_url`); nothing in the grid announces which set a
photograph came from.

### Phase 6 — Test prompt, its verdict, and the photo in Chat photos
**Satisfies:** R11, R12
**Owns:** `lib/nina/imagetest.ts` — `selfiegen.ts`'s sibling: cap check, seed, prompt assembled from
the *saved* prefs, `source: 'admin'`, the reference threaded through, one job row, one
`fireNinaImageGeneration`; the test action in `lib/admin/imageGenActions.ts` plus a read that reports
the job's state and verdict; `components/admin/ImageGenTestPanel.tsx` — the button, the
prompt-as-sent preview, the remaining quota, and the verdict line that distinguishes
`policy` from `timeout` / `transport`; the `maxDuration` the route needs; the one edit to
`ImageGenPanel.tsx` that fills phase 4's seam; `tests/admin.imagegenTest.test.ts`.
**Does not touch:** `finishSelfie` — it already writes the message + `kind: 'generated'` image
pair, already sets `photo_only: true` on the carrier bubble, and already calls `captionNinaPhoto`
for its text; that pair *is* R12, and re-implementing it would be a second writer of invariant 12.
Prompt assembly (phase 2), the payload (phase 3), the prefs form (phase 4), and **every test file of
phase 4's** — `tests/admin.imagegen.test.ts` already allowlists this phase's two actions.
**Exit criteria:** the button dispatches one generation and returns without awaiting it; the panel
reports `queued` → `running` → `ok`/`failed` and names the failure kind, with `policy` rendered as
"the provider refused this prompt" and nothing else rendered as that; a successful test appears in
`/admin/photos` with no further action, and its carrier bubble is removable through
`removeChatPhotoAction` because `finishSelfie` already marked it `photo_only`; a capped operator is
told so before a cent is spent, and the copy says *"one generation off today's cap, plus its
caption"* rather than implying the image is the only model call; the route declares a literal
`maxDuration` and no model call is awaited in the render; the reference reaches the job as
`resolveNinaPhotoReference(userId, prefs.reference)?.blobUrl ?? null`, never as a URL off a request
body.

### Phase 7 — Retire `nina_tuning.wardrobe`
**Satisfies:** R3
**Owns:** the Wardrobe `<input>` and its save payload out of `components/admin/CharacterPanel.tsx`;
`wardrobe` out of `TuningDraft`, `toTuningDraft`, `changedTuningFields`, `toTuningWrite`,
`saveNinaTuningAction`, `ninaTuningWriteSchema`; `NinaTuning.wardrobe`, `NINA_WARDROBE_MAX`,
`coerceNinaWardrobe` and the default out of `lib/nina/tuning.ts`; the column out of
`lib/db/schema.ts` with a generated drop migration; the header copy on
`app/admin/personality/page.tsx`; `tests/admin.tuning.test.ts`, `tests/nina.tuning.test.ts`,
`tests/db.schema.nina.test.ts`; `docs/nina/persona.md`, `CHANGELOG.md` and the two affected
`package_readme.md` files.
**Does not touch:** `nina_image_prefs` or anything phase 1 built; `buildNinaImagePrompt` (phase 2
already stopped reading the tuning for the picture); `notes` — that is a *system-prompt* field and
stays exactly where it is.
**Exit criteria:** `grep -rn wardrobe app components lib tests` returns hits only under the new
image-prefs surface (historical records — landed plans, applied migrations `0005`–`0011` and their
snapshots — are excluded and must keep the word); `/admin/personality` renders no Wardrobe control;
the drop migration is generated as **`0012`**, unrenamed and applied, and contains exactly one
`ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe";`; **Precondition D's `uncopied` count is `0`
against the live database before the drop is generated**; `readNinaTuning` on a pre-existing row
still returns a valid `NinaTuning`; the whole suite is green.

## Reconciliation Log

Twenty-two conflicts found across the seven plans; **twenty-two resolved by editing the plan files**,
none deferred. Rows 1–8 are staleness against the moved base; rows 9–22 are genuine cross-phase
conflicts. "Resolution" describes an edit that has been made, not one that is recommended.

### The base moved: `b0e492a` -> `4a7588e`

The plans were written against local `main`, which was **30 commits behind `origin/main`**. Two
feature sets landed in the merge — `nina-photo-caption-from-image` and
`nina-photo-refs-and-bubble-actions` — and every plan now carries a `⚠ THE BASE MOVED` banner naming
the six consequences.

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| 1 | **Migration numbers stale.** Phase 1 planned `0009`, phase 7 planned `0010`; the watermark is now `0010` and the journal holds eleven entries (`idx` 0–10). Both would have collided with an applied migration. | 1, 7 | Phase 1 -> **`0011`**, phase 7 -> **`0012`**, renumbered throughout both plans (38 mentions). Phase 7's Preconditions C/D updated: `ls drizzle/meta/0011_snapshot.json`, `grep -c '"tag"'` expects **12**; journal entries `idx: 11` / `idx: 12`; its rollback removes the *thirteenth* entry. Phase 7's historical-record exclusion widened to `meta/0005..0010` plus phase 1's own `0011_*` files, which legitimately contain `wardrobe`. |
| 2 | **Hand-appended backfill discipline not stated.** Phase 1's plan appends an `INSERT … SELECT` to a generated migration — exactly the kind of SQL `db:generate` silently destroys — but said only "do not rename". | 1 | Phase 1's Step 3 now states the order as non-negotiable (**generate first, append second**), reproduces the banner comment that `drizzle/0009_nina_message_photo_only.sql` and `0010_nina_image_provenance.sql` both carry, and requires: never hand-name, never rename, and **if ever regenerated, diff old against new and re-append before deleting anything.** |
| 3 | **R10 would have re-created the duplicate-photograph defect.** `nina_message_images` gained `source_avatar_id` / `source_image_id` (migration `0010`) precisely to stop one photograph appearing twice in Chat Photos. Phase 1's union read and phase 5's grid, as planned, would have shown an album face once as its `nina_avatars` row and again as the chat row pointing at it. **The highest-value correction in this pass.** | 1, 5 | New **plan invariant 13** defines a *reference* row as one where either column is non-null, and forbids it from the union. Phase 1's `listNinaPhotoReferences` docstring now explains that the filter is already carried by `generatedChatPhotoScope`'s `isOriginalPhoto()` conjunct (`lib/nina/queries.ts:1616-1618`) and that `countNinaChatPhotos` shares that scope, so page and `total` cannot disagree; **inlining `eq(kind, 'generated')` is forbidden and fails a new source-level test**; exit criterion 7 added. Phase 5 gained exit criterion 1b, which also **forbids a client-side de-duplication by `url`** (it would mask a read regression and break two genuine separate uploads of one photograph). |
| 4 | **`photo_only` might have removed R12's caption bubble.** `nina_messages` gained `photo_only` (migration `0009`), so the index's Decisions row accepting a visible bubble as unavoidable needed re-checking. | 6 | Checked, and **the trade-off stands — but for a different reason than the one recorded.** `photo_only` is a *deletion* marker: its only reader is `isNinaPhotoCarrierMessage` -> `removeChatPhotoAction`; `grep -rn photoOnly components/ app/` is empty and `MessageBubble.tsx:463` renders the body unconditionally. `finishSelfie` still writes real text (`imagerun.ts:240-243` forbids `''`). Phase 6's D7 rewritten with the evidence, and **two facts improve for free**: `finishSelfie` already sets `photoOnly: true` (`imagerun.ts:249`) so a test's carrier bubble is cleanly removable, and its caption is now model-written via `captionNinaPhoto` — which costs one extra model call, so the panel's copy must say *"one generation off today's cap, plus its caption"* (invariant 8). Index invariant 12 and the Decisions row both restated. |
| 5 | **The payload guard grew.** Phase 6's D6 asserted the guard covers "eight symbols" of which "the only image symbol is `runNinaImageJob`". | 4, 6 | Re-verified against `scripts/check-llm-payload-boundary.mjs` as it now stands: **nine** symbols, and **three** are image symbols — `runNinaImageJob` (sanctioned to `lib/nina/imagerun.ts` alone), `describeNinaImage`, and the new `captionNinaPhoto`. D6 rewritten with the table and the guard's actual mechanics (whole-file exact-path sanctions, no glob; `app/`+`lib/`+`components/` only). **Invariant 5 re-confirmed intact**: `buildNinaImagePrompt`, `assembleNinaImageTestPrompt`, `sidecarText` and `buildImageRequestBody` are not in the table, so phase 4's pure preview in a render passes. |
| 6 | **Prompt assembly assumed to have moved.** `lib/nina/prompts/` now exists and `persona.ts` gained the Instructor character. | 2 | Verified it did **not** move: `buildNinaImagePrompt` and `sidecarText` are still in `lib/nina/imagegen.ts`, `ninaAppearance` / `NINA_FACE` / `NINA_APPEARANCE` still in `persona.ts`, and nothing under `lib/nina/prompts/` imports any of them. Phase 2's shape survives; only its line numbers were wrong. The Instructor material (`isInstructor` `:730`, `INSTRUCTOR_COACHING` `:813`, `ninaInstructorCoachingBlock` `:839`) is region-disjoint from phase 2's `:352-402` and touches no appearance constant. |
| 7 | **Every `file:line` citation shifted.** `persona.ts` +139, `queries.ts` +~130, `tuning.ts` +22, `schema.ts` +64, `CharacterPanel.tsx` +13, `app/admin/layout.tsx` +31, `imagegen.ts` −7, three test files +26…+51. A plan quoting a stale hunk does not apply. | all | ~60 load-bearing citations re-derived against `4a7588e` and corrected in place — including `persona.ts:1334`→**`:1473`** (phase 7's Step 10b), `layout.tsx:78`→**`:109`** (phases 4, 5), the whole `tuning.ts` deletes list, `queries.ts`'s tuning mappers (`:3017`/`:3067` -> `:3192`/`:3242`), the `CharacterPanel` wardrobe block (`:358-379` -> `:371-392`, wrapper `:370-414`, payload `:449`), and both `db.schema.nina.test.ts` column lists (`:396`/`:493` -> `:447`/`:544`). Every plan's banner also states plainly that citations are **advisory** and that the implementer greps for the symbol rather than trusting a line range. |
| 8 | **`imagerecipe.ts` citations wrongly suspected stale.** The analysis document gave `:196` / `:216` / `:262` / `:294`. | 3 | That file was **not** touched by the merge; phase 3's own ranges (`:283-295`, `:343-357`, `:155-163`, `:38-44`) were already correct and were left alone. The *analysis*'s numbers are the stale ones; the true call timeouts are `:150` and `:167`, and `NINA_IMAGE_DAILY_CAP` is `:119` (corrected where phase 6 cited `:129-136`). Recorded so nobody "fixes" phase 3 back to the analysis. |

### Cross-phase conflicts

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| 9 | **Vocabulary fork — four families of names.** Phase 4 coded against `NINA_IMAGE_LENGTH_MIN`/`_MAX`, `NINA_IMAGE_LENGTH_BAND_NAMES`, `ninaImageLengthBand`, `NinaImageLengthBand`, `NINA_IMAGE_REFERENCE_KINDS` and `listNinaImageReferences`; phase 1 declares `NINA_IMAGE_PROMPT_LENGTH_MIN`/`_MAX`, `NINA_PROMPT_LENGTH_RUNGS`, `ninaPromptLengthRungFor`, `NinaPromptLengthRung`, `NINA_IMAGE_REFERENCE_SOURCES` and `listNinaPhotoReferences`. Phase 4 would not have compiled. | 1, 4 | **Phase 1 wins on every name** (rule 3 — one owner per file region, and phase 1 owns `imageprefs.ts`). 25+ occurrences rewritten in phase 4, including its Assumptions block, which is now titled **"RECONCILED. These are no longer assumptions"** and carries phase 1's real declarations plus a table of the four corrections. |
| 10 | **Focus-key spelling fork.** Phase 4 assumed `bigBoobs`/`bubbleButt`/`bigThighs`/`veryLongCalves`; phase 1 and phase 2 both use `boobs`/`butt`/`thighs`/`calves`. | 1, 2, 4 | Phase 1's short keys win — they become the column names `focus_boobs` … — and phase 2 already agreed, so **only phase 4 changed**. The user's own words survive in `NINA_IMAGE_FOCUS_SPECS[key].userSaid`, which phase 4's copy accessor now reads (it was reading a non-existent `.axis`). Phase 2's "if phase 1 spells them differently" contingency is replaced with a statement that they agree. |
| 11 | **The reference's shape.** Phase 4 and phase 6 assumed a flat `referenceUrl: string \| null` holding a Blob URL; phase 5 offered both shapes; phase 1 stores `reference: { source, id }` with `''` as the empty id, deliberately **not** a URL (`updateNinaChatPhotoBlob` changes a chat photograph's `blob_url` and keeps its `id`). | 1, 3, 4, 5, 6 | **Phase 1's `{ source, id }` wins.** Phase 4's draft member, `IMAGE_REFERENCE_NONE`, Zod boundary (`source: z.enum(...)`, refine on `id === ''`) and ~20 test expectations rewritten. **Phase 5's `referenceUrl` alternative deleted, not merely outranked.** Phase 6 now resolves through `resolveNinaPhotoReference(userId, prefs.reference)?.blobUrl ?? null` — which is phase 1's own Handoff instruction, is owner-scoped, and satisfies phase 3's requirement that the URL never come off a request body. Phase 3's `NinaImageJobArgs.referenceUrl` is confirmed as a *different*, dispatch-time field. |
| 12 | **`ImageGenPanel.tsx` seam markers disagreed three ways.** Phase 4 wrote `PHASE 5 SEAM` / `PHASE 6 SEAM`; phases 5 and 6 both grep `SEAM — PHASE 5` / `SEAM — PHASE 6` and assert `not.toContain(...)` on them. Phases 5 and 6 would have found no seam, and their removal assertions would have passed **vacuously**. | 4, 5, 6 | **`SEAM — PHASE 5` / `SEAM — PHASE 6` win** — the form two of three plans use and the only form a test asserts (rung 3). Phase 4's two comments rewritten, each now stating the exact literal and warning against re-wording it. |
| 13 | **The picker's mount contract disagreed on every prop.** Phase 4's seam predicted `<PhotoReferencePicker options selected disabled onSelect />` over `{kind,id}` objects; phase 5's component declares `items total value onChange disabled` over an opaque `string`. Phase 4 also had no `photoTotal` prop, which phase 5's footer needs, and phase 5 is forbidden from editing the prop list. | 4, 5 | **Phase 5's component API wins** (the component that declares a prop list owns it), **and phase 4 supplies what it needs.** `ImageReferenceOption` is now `{ key, url, thumbUrl }` — *structurally identical* to phase 5's `PhotoReferenceItem`, so `items={references}` typechecks with **no cross-phase import in either direction** (phase 4 cannot import a module phase 5 has not created). `photoTotal: number` added to `ImageGenPanelProps`, threaded from `listNinaPhotoReferences(...).total`. The settled mount is written identically into both plans. |
| 14 | **Nothing encoded/decoded the reference across that seam.** Phase 5 requires an opaque string; phase 1 stores `{ source, id }`; phase 4's `referenceKey` encoded but nothing decoded. | 4, 5 | `referenceKey` redefined as `` `${source}:${id}` `` (`''` for none, matching phase 1's `NINA_IMAGE_REFERENCE_NONE` and phase 5's `PHOTO_REFERENCE_NONE`), and **`parseReferenceKey` added** to `lib/admin/imageGenModel.ts` — phase 4's declared adaptation seam, and total by construction (an unreadable key is no reference, mirroring phase 1's `coerceNinaImageReference`). Added to phase 4's Interface Contract and round-trip-tested. Phase 5 adds neither and still never parses a key. |
| 15 | **`ImageGenTestPanel`'s props disagreed.** Phase 4's seam predicted `<ImageGenTestPanel userId dirty revision />`; phase 6 declares `{ dirty?: boolean }`. | 4, 6 | **Phase 6's prop list wins** (it owns the component): `userId` is refused because `runNinaImageTestAction` takes no arguments and gates on `requireAdmin()` server-side, so a client-supplied id would be a payload to forge; `revision` is refused because the panel polls an action rather than depending on the page re-rendering. The mount is `<ImageGenTestPanel dirty={dirty} />` in both plans, which also **closes phase 6's Handoff 4** (`dirty` was left unwired so neither phase would block the other). |
| 16 | **Phase 4's structural action test would have failed on phase 6.** It loops over every `export async function` in `lib/admin/imageGenActions.ts` requiring both `await requireAdmin()` **and** `.safeParse(`. Phase 6 appends two actions that correctly parse with neither. Phase 6 flagged this as "the one concrete cross-phase collision found". | 4, 6 | Fixed **in phase 4**, whose file it is. Split in two: the `requireAdmin`-is-first loop keeps covering **every** export, including phase 6's two the moment they exist; the `.safeParse` half is scoped by name to the two actions that take a payload. Phase 6's own option (b) taken over its option (a), because scoping the whole loop would have silently stopped asserting invariant 6 over phase 6's actions — the half that matters. **Phase 6 edits no test of phase 4's.** |
| 17 | **A second, unowned instance of the same collision.** Phase 4's `expect(exported).toHaveLength(2)` and its Handoff telling phase 6 to "raise it to 3". Both wrong: phase 6 appends **two** actions (making four), and `tests/admin.imagegen.test.ts` is on no other phase's Owns list — so the edit belonged to nobody and phase 6 would have had to modify a test it was told to leave alone, mid-wave. | 4, 6 | Count replaced with an **allowlist that already names all four planned actions**, so no test needs touching when phase 6 lands. Strictly stronger than a count: it says *which*, and still fails loudly on an action neither phase planned — the speed bump the count was reaching for. Phase 4's Handoff and phase 6's Handoff 5 both rewritten to record the resolution. |
| 18 | **`imageGenModel.ts` could not compute a band.** Phase 4 asserts the file imports exactly one module (`imageprefs`), but `ninaPromptLengthRungFor` takes a **band index** and the band mapping is `ninaBand` in `lib/nina/tuning.ts`, which `imageprefs.ts` deliberately refuses to duplicate. `promptLengthCopy` had no way to get from a 0–100 score to a rung. | 1, 4 | **Two imports, both zero-import `lib/nina` vocabulary modules**, and the one-import assertion widened accordingly. This is phase 1's own Handoff, verbatim: *"render the band caption via `ninaPromptLengthRungFor(ninaBand(value).index)` and never re-derive a band from a score."* Safe for the client bundle on `lib/admin/tuningModel.ts`'s existing precedent. Re-deriving the five boundaries locally is forbidden. |
| 19 | **The default rung was contested.** Phase 2 recommended phase 1 pick `promptLength = 60` "because band `high` is the rung that keeps the face and the outfit"; phase 1 chose `50`. | 1, 2 | **Phase 1's `50` wins** — it owns the defaults, and "the middle of the slider is the middle rung" is the stronger reason. Phase 2's recommendation is **deleted**, and the substantive half of it becomes a **requirement on phase 2**: the face/outfit cut must sit at or below rung 2, since `50` is band `mid` -> rung `Standard` and that is what a first-run generation gets. A new phase-2 test asserts the face and the outfit survive at `NINA_IMAGE_PROMPT_LENGTH_DEFAULT` specifically — not at a literal rung index — so a later change to either number fails there rather than silently shortening every first-run prompt. |
| 20 | **Phase 3's fifth file was unowned in the index.** Phase 3's plan claims `lib/nina/imagerun.ts` (the only place `args.referenceUrl` can be read on the app host, and the only place the retry budget is spent) but the index's phase-3 row did not name it, and it is on no other phase's Owns list. | 3 | Confirmed as phase 3's and added to the index's **Owns** line, along with `tests/nina.imagecall.test.ts` and `tests/nina.imageworker.test.ts`. File count 5 -> 7. Phase 6 *calls* `fireNinaImageGeneration` from it and edits nothing in it. |
| 21 | **Two double-edits in phase 2's files.** `docs/nina/persona.md:250-254` was claimed by both phases 2 and 7; `lib/nina/persona.ts` was claimed by phase 2 (`:352-402`) and by phase 7 (one docblock sentence). | 2, 7 | Both were already resolved by phase 7's own planner and the reconciler confirms both: the `persona.md` wardrobe prose is **phase 2's** (its replacement text already retires `nina_tuning.wardrobe`, making phase 7's planned edit redundant), so phase 7 edits only `:332` and `:412`; and `persona.ts:1473` (renumbered from `:1334`) is **phase 7's**, region-disjoint from phase 2's block. Recorded here because both are live double-edits that a reader would otherwise re-litigate. |
| 22 | **Three shared files needed post-change ordering confirmed.** `lib/admin/schema.ts` (phase 4 appends / phase 7 deletes), `lib/nina/queries.ts` (phase 1 inserts / phase 7 edits), `tests/db.schema.nina.test.ts` (phase 1 appends / phase 7 edits). | 1, 4, 7 | All three confirmed **region-disjoint after renumbering**, and the note added to phase 7's contract. The load-bearing detail: phase 1 inserts its new `§10b` at `queries.ts:3319`, which is *below* phase 7's `:3192` and `:3242`, so phase 1 landing first does not move phase 7's targets — and phase 7 depends on phase 1 transitively, so that order is guaranteed. |

**Ownership after reconciliation:** every impact point in the analysis document has exactly one
owner; every requirement `R1`–`R12` has at least one phase; no symbol is deleted before its last
reader is retired; every phase's `Depends on` points strictly backward; and no phase leaves the tree
uncompilable on its own. `contract_changed` is **false** — no deletion, creation or rename moved
between phases, so no second reconciliation round is needed.

## Decisions

Settled here rather than passed downstream. Rung 1 = a stated plan invariant, 2 = phase exit
criteria, 3 = the plan's code blocks, 4 = this index's Why / Requirements, 5 = the user's raw input,
6 = surrounding convention.

| Fork | Chosen | Rung |
|---|---|---|
| Where the wardrobe lives once both surfaces could hold one | `nina_image_prefs.wardrobe`. `nina_tuning.wardrobe` is dropped in phase 7 after phase 2 has moved the reader. Two wardrobes silently competing is the one outcome R3 cannot mean. | 5: *"remove Wardrobe field in /admin/personality (this new feature is more detailed version of it)"* |
| Is the body canon a focus option or unconditional text? | Unconditional, in the subject paragraph itself. "Focus on" adds emphasis clauses **on top**; deselecting everything still yields a prompt naming all four body facts. Invariant 4. | 5: *"always explicitly instruct these in the prompt"* |
| Does "i dont care about her face" delete `NINA_FACE`? | No. The face keeps its sentences and loses its primacy — the body leads the subject paragraph. Deleting it would make her a different woman in every photograph, and the face is the anchor `persona.ts` was built around. | 5 (a priority statement, not a deletion request) + 6 |
| Does the test button await the generation? | No. It opens a job and returns, exactly as `generateNinaSelfie` does; the panel polls. A 78–150 s POST from a browser is what `after()` exists to avoid, and a Server Action's timeout is the page segment's. | 6 (`app/r/[id]/page.tsx:65-79`, `imagecall.ts`'s header) |
| Does a test generation count against `NINA_IMAGE_DAILY_CAP`? | Yes, and the panel shows the remaining quota before the click. The cap already counts failures for this exact reason: every attempt cost money or a runner minute. | 6 (`imagerecipe.ts:129-136`) + invariant 8 |
| R12 with a `NOT NULL` `message_id` — **REVISED after the `origin/main` merge** | The test result goes through `finishSelfie`, which mints the carrier bubble and the `kind: 'generated'` image row. So a test **does** put a **visible** bubble in the runner's chat, and `nina_messages.photo_only` does **not** avoid it: it is a *deletion* marker read only by `isNinaPhotoCarrierMessage` -> `removeChatPhotoAction`, nothing in `components/` or `app/` reads it (`grep -rn photoOnly` is empty), `MessageBubble.tsx:463` renders the body unconditionally, and `imagerun.ts:240-243` forbids an empty `text`. A caption-less bubble would be new `components/nina/` work no phase owns. **Two things do improve, free:** `finishSelfie` already sets `photoOnly: true` (`imagerun.ts:249`), so the bubble is cleanly removable with the photograph; and its caption is now model-written via `captionNinaPhoto`, which costs one extra model call — so the panel says *"one generation off today's cap, plus its caption"*. Still accepted; `addChatPhotoAction` makes the identical trade. | 3 (the code: `imagerun.ts:249`, `MessageBubble.tsx:463`, `chatPhotos.ts:309-316`) + 1 (invariant 12) + 5 (R12) |
| The anchored call timeout | A new `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 220_000`, used only when a reference is present. RU-18 measured 148.9 s anchored against a shipping 150 s ceiling, so R10 as-built would abort about half its own generations. 45 + 220 + 20 = 285 ≤ 300 keeps invariant 3 true. | 1: invariant 3 (the threshold chain) |
| How the reference travels | Fetched from Blob and sent as a `data:` URL inside `input_references`, exactly the shape `tools/gen_badge_art.py:349-354` got a 200 from. An `https://` URL is plausible and unverified, and this is not the phase to find out at $0.04 a probe. A fetch failure degrades to unanchored. | 6 (the one verified payload in the repo) |
| A sixth nav cell in a five-cell bar | Below `lg` the bar becomes a 3×2 grid (`grid-cols-3 grid-rows-2`, `h-28`) and `app/admin/layout.tsx`'s reserve becomes `calc(8rem + var(--safe-bottom))`. Six single-row cells would be 69 px at 414 px — under the 8-character ceiling `tests/admin.shell.test.ts:115-128` holds and under the 44 pt target. The `lg` sidebar is unchanged. | 6 (`docs/design-brief.md`'s 44 pt minimum, and the ceiling that test already encodes) |
| Route segment and labels | `/admin/image-generation`, nav `label: 'Image Generation'`, `short: 'Images'` (6). A flat sibling of the other five, as `/admin/personality` is. | 5 (the tab's name) + 6 |
| What "prompt length" is measured in | A 0–100 slider read through the repo's existing five bands (`ninaBand`, `NINA_BAND_NAMES`), each band selecting a rung of the assembly ladder — not a character budget. `/admin` already renders band names beside every slider, and a private scale is a slider the operator cannot predict. | 6 (`lib/nina/tuning.ts:74-122`, and `imagegen.ts:82`'s recorded reconciliation of exactly this fork) |
| One prefs row or per-parameter columns | One column per parameter, six booleans for the focus set, no `jsonb`. Invariant 11. | 1: invariant 11 (from `nina_tuning`'s own header) |
| Does the chat model lose `scene` / `mood`? | No. The prefs are the operator's standing opinion about how she is photographed; the scene is still hers per photograph. Removing them would silence `generate_image` and was not asked for. | 4 (Scope: out of scope) + 6 |
| A *reference* row, and whether the picker may show one (invariant 13) | A row in `nina_message_images` is a reference — not a photograph of its own — when **`source_avatar_id` OR `source_image_id` is non-null**. The picker's union must contain none. The filter is not written fresh: the chat side goes through `generatedChatPhotoScope`, whose `isOriginalPhoto()` conjunct already is that predicate, and the count is `countNinaChatPhotos`, which shares the scope. Inlining `eq(kind, 'generated')` — the tempting simplification, since the picker needs its own projection — silently re-admits every reference row, and now fails a test. No client-side de-duplication by `url`: it would mask a read regression and would wrongly merge two genuine separate uploads of one photograph. | 6 (`resolveAttachment` flattens `source_image_id ?? row.id`, and `drizzle/0010`'s backfill defines "reference" the same way) + 4 (the Why: the complaint that produced the F37 set was duplicate photographs) |
| Where the reference lives, and what crosses the phase 4/5 seam | The row stores `{ source, id }` — never a Blob URL, because `updateNinaChatPhotoBlob` changes a chat photograph's `blob_url` and keeps its `id`, so a stored URL would point at a deleted object while the picker still drew the tile. Across the seam the currency is an **opaque `string`**, `` `${source}:${id}` `` with `''` for none, encoded by `referenceKey` and decoded by `parseReferenceKey`, both in phase 4's `imageGenModel.ts`. The picker never parses it and its tile type carries no `source` at all — which is what makes *"nothing in the grid announces which set a photograph came from"* structural instead of a promise. Phase 6 turns the stored pair into bytes with `resolveNinaPhotoReference(...)?.blobUrl ?? null` at dispatch time. | 1 (invariant 11: one column per parameter, no `jsonb`) + 3 (phase 1's `NinaImageReference` and phase 5's three-field `PhotoReferenceItem`, which agree) |
| Which side owns a name when two plans disagree | **The phase that declares the symbol.** `lib/nina/imageprefs.ts` is phase 1's, so its spellings win over phase 4's assumptions (`PROMPT_LENGTH` not `LENGTH`, `source` not `kind`, `boobs` not `bigBoobs`, `userSaid` not `axis`, `listNinaPhotoReferences` not `listNinaImageReferences`). `PhotoReferencePicker`'s prop list is phase 5's, so `items`/`total`/`value`/`onChange` win over phase 4's predicted `options`/`selected`/`onSelect`. `ImageGenTestPanel`'s prop list is phase 6's, so `{ dirty }` wins over phase 4's predicted `{ userId, dirty, revision }`. The earlier phase does not win by being earlier; the **declaring** phase wins, and the other side is edited to match. | 6 (the repo's own convention: a module's exports are its author's) + the reconciler's rule 3 (one owner per file region) |
| The seam marker's exact spelling | `SEAM — PHASE 5` and `SEAM — PHASE 6`, em dash included. Phase 4's draft said `PHASE 5 SEAM`; phases 5 and 6 both grep the other form **and assert `not.toContain(...)` on it**, so under phase 4's spelling neither phase would have found its seam and both removal assertions would have passed vacuously — a green suite over an unmounted component. | 3 (the plans' code blocks: two of three use this form, and it is the only form a test asserts) |
| How a phase-4 test survives phase 6 appending to its file | **An allowlist, not a count.** `tests/admin.imagegen.test.ts` names all four planned actions and fails on an unplanned one; the `requireAdmin`-is-first loop keeps covering every export including ones later phases add, while the `.safeParse` half is scoped by name to the two that take a payload. A count would have had to be edited by phase 6 — in a test file on no phase's Owns list but phase 4's — which is how a green suite becomes a mid-wave merge conflict. | 1 (invariant 6: the gate is the first statement of *every* new action — so its assertion must not be narrowed) + 2 (phase 6's exit criteria, which its own tests already cover) |
| The default prompt-length rung, and what it obliges phase 2 to do | `NINA_IMAGE_PROMPT_LENGTH_DEFAULT = 50` — the middle of the slider, which is the middle rung (`mid` -> rung 2 `Standard`). Phase 2's suggestion of `60` is withdrawn. But its *reason* is kept as a requirement on phase 2: **the face/outfit cut must sit at or below rung 2**, because 50 is what an operator who never opens the tab gets, and a first-run prompt that drops the face would be a downgrade on what ships today — for a feature whose origin is *"this long prompt only created a mediocre result"*. Asserted against the constant, not against a literal rung index. | 1 (phase 1 owns the defaults; invariant 4 pins the body canon at every rung) + 4 (the Why) |
| `imageGenModel.ts`'s import count | **Two modules, not one**: `@/lib/nina/imageprefs` and `@/lib/nina/tuning`. `ninaPromptLengthRungFor` takes a *band index* and `imageprefs.ts` deliberately keeps no second copy of the band vocabulary, so `ninaBand` must be imported. Re-deriving the five band boundaries locally is forbidden — a private scale is a slider the operator cannot predict. Both modules are zero-import and client-safe, on `lib/admin/tuningModel.ts`'s existing precedent. | 2 (phase 1's own Handoff: *"render the band caption via `ninaPromptLengthRungFor(ninaBand(value).index)` and never re-derive a band from a score"*) |
| The two migration numbers, and what may be hand-written in one | Phase 1 is **`0011`**, phase 7 is **`0012`** — the watermark moved to `0010` in the merge. Phase 1's wardrobe copy is hand-appended **after** `db:generate`, under the banner comment `0009` and `0010` both carry, because regeneration destroys it silently. Never hand-name, never rename (a renamed file keeps its old `when`, drops below the watermark and is skipped in silence), and if ever regenerated, **diff old against new and re-append before deleting anything**. | 1 (invariant 10) + 6 (both landed migrations state the discipline in their own banners; the user's memory note records it measured twice) |
| `sidecarText`'s `reference:  none (RU-18)` line, now false for an anchored generation | **Left wrong, deliberately, and filed as a follow-up card.** It is `lib/nina/imagegen.ts:171` — phase 2's file — expressing phase 3's fact, and both plans explicitly decline it (phase 3 keeps `tests/nina.imagerecipe.test.ts:98` asserting it). It is cosmetic: the sidecar lands in `nina_message_images.prompt` and only a human ever reads it. A third edit to `imagegen.ts` in the same wave as phase 2's rewrite buys a merge conflict in a file phase 6 merely displays the output of. **Not an Open Question — it is decided, and the decision is "not in this wave".** | 2 (both phases' exit criteria decline it) + 6 (one owner per file region) |

| **Migration `0011` collides with a landed `0011`, and mine is already applied** — decided mid-run by the coordinator, 2026-09-07, on a peer's measured WARN | **Keep `0011_natural_nico_minoru` exactly as it is: its name, its hash and its `when`. Do not regenerate it, do not rename it, and re-create nothing.** `origin/main` gained `0011_rare_blockbuster` (task-135, `nina_memory_facts DROP COLUMN confidence`, `when` 13:10:34.959Z) after this branch was cut, so both files are `idx: 11` — different names, so not a file conflict on the `.sql`. The set's own `0011` was applied to the one live database by phase 1 at 15:26:42.027Z, which is **newer than everything else applied**, so the outcome the regenerate recipe exists to produce — an entry stamped after every applied row — this file already has. Regenerating it would instead give it a new hash, so the migrator would re-run its first statement `CREATE TABLE "nina_image_prefs"` (no `IF NOT EXISTS`) against a database that has the table, and would **silently drop the hand-appended wardrobe copy** below the generated DDL. The landing's job is therefore to make the merged journal agree with what the database already ran, not to re-run anything: at Step 5 the `_journal.json` / `meta/0011_snapshot.json` conflict is resolved so both entries survive with their own `when` intact, `db:check` is made to pass, and `db:migrate` must apply **only phase 7's `0012`**. A migration that will not apply stops the landing with `main` untouched. | 1: invariant 10 — *"generated by `db:generate`, never hand-named and **never renamed**"*, whose stated reason is that a stale `when` drops below the watermark; this file's `when` is above it |
| **`0011_rare_blockbuster` is stranded, and this set does not un-strand it** | Reported, not fixed. It sits at 13:10:34.959Z, older than this set's applied 15:26:42.027Z row, so a migrator applying only entries newer than the last applied row will never reach it — `nina_memory_facts.confidence` stays in the database as `integer NOT NULL DEFAULT 100`. It is a **dead column, not a runtime break**: task-135's code no longer writes it and inserts still succeed on the default. Dropping it is a destructive step **no phase plan in this set asked for**, which is a stop rather than a decision, and it belongs to task-135. Verified again at Step 5 and named in the termination block. | 6: the plan's own rule that a destructive step no phase prescribed is not this set's to take + 4: Scope (`nina_memory_facts` is outside it) |

| **Does phase 7 run `db:migrate` for its own `0012`?** — decided mid-run by the coordinator, 2026-09-07, and it **overrides phase 7's exit criterion** | **No. Phase 7 generates `0012`, commits it, and does not apply it.** `db:check` plus Precondition D's live read (read-only) are its gates; **the apply moves to the coordinator's Step 5, and there it happens *after* the push, not before.** MEASURED: `.env.local`'s `DATABASE_URL` is a **single** Neon database — there is no separate dev database — and `origin/main:lib/nina/queries.ts:3260` is `db.select().from(ninaTuning)`, which drizzle expands to explicit columns from `main`'s schema, where `wardrobe: text('wardrobe').notNull()` still stands. So `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe"` run from a phase session takes out `readNinaTuning` in **production** — on the persona/chat path, not merely `/admin/personality` — for the whole interval until this set merges. Phase 7's *"generated as `0012`, unrenamed and **applied**"* was written believing phase 1's *"applies it against the dev database"*; that premise is measured false, and an exit criterion is not binding through the premise that made it safe. The default landing order (*apply migrations before the push*) is not overridden lightly either: its stated reason is that **code arriving ahead of its schema** is a first-request error, which is an argument about an **additive** migration. A `DROP COLUMN` inverts it — the schema would arrive ahead of the code that stops reading it — so the same reasoning puts this one after the push and after the deploy. Take `pg_dump -t nina_tuning` into `logs/` first, then apply, then verify the column is gone by querying `information_schema.columns`. | 1: the orchestrator contract's *reason* for its ordering rule, applied rather than its literal sentence, plus invariant 1's *"a phase that leaves `wardrobe` half-removed broke the build for its successor"* read at the database — a dropped column under unmerged code is exactly that, half-removed |

| **`P1-DB-A004` is minted by this set's phase 1 AND by `nina-emoji-shortcuts` phase 1** — flagged by `orch-chat-photo-orphans-and-uniqueness`, verified here from the branches | **SETTLED 2026-09-08: `nina-emoji-shortcuts` landed first, so the renumber is THIS set’s.** Verified on `origin/main`: `lib/db/.workflows/todos.md` line 39 now reads `- [x] **P1-DB-A004** Phase 1: The table and the matcher`, which is not ours. The Step 5 read finds a foreign `A004` and renumbers ours — the rule working by construction rather than by either coordinator remembering an offer. (Originally recorded as: whoever merges second renumbers.) MEASURED: `feature/nina-image-generation-tab:lib/db/.workflows/todos.md` and `origin/feature/nina-emoji-shortcuts:lib/db/.workflows/todos.md` both carry `P1-DB-A004`, and `origin/main` tops out at `P1-DB-A003` — so **neither set has landed the id** and the first to merge keeps it. Cause is the known one: `todos.py mint` computes next-free without reserving. **The silent half does not apply here, and the check that proves it needs care** — a bare `grep -c` returns `0` both for *no matches* and for *no such file*, so it cannot tell the safe case from the unverified one. Proved instead with `git cat-file -e` first: the root `.workflows/todos.md` **exists** at all three refs (104,194 bytes on both feature branches, 114,619 on `origin/main`) and carries **zero** occurrences of `A004`. So there is no textually auto-merging duplicate; the `A004` **string** is confined to `lib/db/.workflows/todos.md` (2 occurrences by `git grep -c`). **CORRECTED 2026-09-08 by an actual trial merge: the collision is NOT confined to that file.** `lib/db/.workflows/plan/P1-DB-A004.md` conflicts **add/add** — two different plan documents at one path, 8 hunks — because the id is in the **filename**, which a grep scoped to `*todos.md` cannot see by construction. My earlier "verified" claim was true about what it measured and wrong about what it concluded; the renumber must therefore `git mv` that plan file too, and the Step 5 duplicate scan must cover **filenames**, not just file contents — `git ls-files '*P1-DB-A004*'` alongside the content grep, then `git mv` the plan file rather than substituting text inside it. (The peer set's spread is four package files, so a renumber is far cheaper for this set than for that one.) If this set merges second, remap **in one simultaneous regex alternation** (never sequentially — shifting `A004`->`A007` while `A007`->`A010` is also pending corrupts the middle of the range), covering every internal `Depends on`, the ledger's `task_id` **and** `note`, and every copy of the plan index; leave the phase commit messages alone as the historical record. Then `todos.py validate` plus an explicit cross-file duplicate scan — and use `rglob` or explicit paths, because `glob('**/todos.md')` **does not traverse dot-directories** and so misses `.workflows/` entirely, reporting success over an unscanned tree. **Wave 1's four mints were checked and are clean:** `P1-NIN-A024`, `P1-NIN-A026`, `P1-CA-A003`, `P1-ADM-C410` each return zero prior commits under `git log --all -S`, and the other live set's worktree tops out at the global `P1-NIN-A023` watermark, so nothing of wave 1 needed interrupting. | 6: the repo's own rule that the first set to land keeps its ids + 4: the record's correctness (two tasks under one id is a wrong record that ships silently) |

| **Phase 7's Precondition D, and why this set's `0011` must never be regenerated** — measured by the coordinator 2026-09-07, ahead of wave 2 | **`uncopied = 0` already, against the live database.** Phase 7 still re-runs it at its own Step — data can move — but it will not block there. The query, so phase 7 and Step 5 use the same one rather than two spellings of it: `select count(*) from nina_tuning t where t.wardrobe <> '' and not exists (select 1 from nina_image_prefs p where p.user_id = t.user_id and p.wardrobe = t.wardrobe)`. Measured state: `nina_tuning` 1 row, 1 with a non-empty wardrobe (`'long pants'`); `nina_image_prefs` 1 row carrying it, `prompt_length = 50`, `revision = 1`, `reference_source = 'none'`. **And the backfill is verified by its effect, not by the migrator's exit code** — an applied migration and a copied row are different facts, and only the second one makes phase 7's drop recoverable. Separately this settles the regeneration question by reading the file rather than the rule: `drizzle/0011_natural_nico_minoru.sql` is 69 lines / 4,175 bytes — generated DDL to line 21, then a hand-written banner and a real `INSERT … SELECT`. `db:generate` re-emits only what it diffs from the schema, so regenerating this file destroys the one thing that makes the whole `wardrobe` retirement reversible. Same recipe, opposite verdict from a peer set's pure-DDL migration; **the file decides, not the rule.** | 2: phase 7's own Precondition D + 1: invariant 10, whose reason is that a regenerated migration loses what the generator cannot see |

| **Phase 7’s migration number is UNDETERMINED until Step 5, and unlike `0011` this one MUST be regenerated** — decided by the coordinator 2026-09-08 after `nina-emoji-shortcuts` landed | **On the branch phase 7 still generates `0012` and that is correct — do not rebase.** MEASURED: `origin/main`’s journal now holds **13** entries ending `idx 12 / 0012_messy_carlie_cooper` (applied to the live database at 16:02:49.236Z, which is also the new watermark), while this branch’s journal holds 12 ending `idx 11 / 0011_natural_nico_minoru`. So phase 7’s Precondition C (journal of 12, mint `0012`) holds **on the branch** exactly as written, and `db:generate` there will hand it `0012`. Rebasing the branch to pick up `0013` directly is refused: phase 6 runs concurrently in the same worktree, and a rebase under a live dependent is the one case the migration recipe calls unsafe. **The renumber happens at Step 5, by regeneration, and the number is whatever the merged journal yields — NAMING ONE IS THE ERROR.** CORRECTED 2026-09-08: this row first said "lands as `0013`". It was wrong to name a number, and the reason is measured — `orch-chat-photo-orphans-and-uniqueness` was independently planning to land as `0013` too, which `orch-nina-emoji-shortcuts` could see because it held both halves and neither of us could. A named number is a number two sets can pick; a derived one cannot collide. **So: merge `origin/main` FIRST, generate SECOND, and let `db:generate` read the number off the merged chain** — whoever lands later gets the next one automatically. That is the same self-resolving property that settled the `A004` renumber without either coordinator having to remember an offer, and it is why phase 7 was told not to hard-code or assert the literal either. Phase 7’s Precondition C ("journal of 12, mint `0012`") is a **measurement of when the plan was written**, not a requirement: it is true on the branch and stops being true the moment another set lands. The requirement is one migration, exactly one `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe";`, unrenamed, and a chain whose `prevId` points at whatever `origin/main` actually ends with at Step 5. That is the *opposite* verdict from this set’s `0011`, and the asymmetry is the whole lesson: `0011` is **applied** and carries a **hand-written** `INSERT … SELECT`, so regenerating it would re-run `CREATE TABLE` against a live table and silently discard the backfill; phase 7’s migration is **unapplied** and **pure generated DDL** (one `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe"`), so a new hash and a fresh `when` are precisely what is wanted. **Same recipe, opposite verdicts, decided by the file rather than the rule** — and still diff old against new before deleting anything. | 1: invariant 10 (generated, never hand-named, never renamed) + 6: the measured rule that a rebase is safe only while dependents are unspawned |

| **STEP 5 PROHIBITION: never revert `drizzle/meta/_journal.json` to `origin/main`’s copy** — flagged by `orch-nina-emoji-shortcuts` from its own working recipe, verified here 2026-09-08 | **The regeneration recipe’s `git show origin/main:drizzle/meta/_journal.json > _journal.json` step is FORBIDDEN for this set.** It was safe for the peer because main’s journal was a superset of its branch’s. It is not a superset of ours. MEASURED:

`diff` of the two tag lists shows main holding `0011_rare_blockbuster` + `0012_messy_carlie_cooper` where this branch holds `0011_natural_nico_minoru` — **present only on our side, absent from main entirely** (0 occurrences in main’s journal, and no such file in `git ls-tree origin/main drizzle/`), **and applied to the live database** (`__drizzle_migrations` row 12, hash `93302b49254a…`, 15:26:42.027Z). Reverting the journal would therefore delete the only record of a migration the database has already run: permanently desynced, `nina_image_prefs` accounted for by nothing in the chain, and a later `db:generate` diffing a snapshot lineage that never created it could try to create it again.

**So the delete-and-revert half is SURGICAL:** remove only the `0012` artefacts (`drizzle/0012_*.sql`, `drizzle/meta/0012_snapshot.json`) and drop only that one journal entry, leaving our `0011_natural_nico_minoru` entry intact with its own `tag` and `when`. Then `db:generate` appends on top of the merged chain and **takes whatever number that chain gives it** — do not hard-code one. Ordering by `when`, which is the key the migrator actually reads: `0011_rare_blockbuster` 13:10:34.959Z < `0011_natural_nico_minoru` 15:26:42.027Z < `0012_messy_carlie_cooper` 16:02:49.236Z, so ours sorts between main’s two and its file name is never changed. The `meta/0011_snapshot.json` collision is a genuine same-name file conflict and is resolved at Step 5 against the merged tree, not predicted here.

**The general rule, third instance of this shape tonight: a recipe that reverts a shared file to the base’s copy is only safe when the base is a superset for that file.** Check first, and treat anything present only on your side as what the revert would destroy:

```
diff <(git show origin/main:drizzle/meta/_journal.json | grep -o '"tag": "[^"]*"') \
     <(grep -o '"tag": "[^"]*"' drizzle/meta/_journal.json)
```
 | 1: invariant 10, whose stated reason is that a migration’s `when` and its record are what the migrator reads — deleting the record is a strictly worse version of renaming the file |

| **STEP 5 IS FULLY REHEARSED: the merge was tried in a throwaway worktree while phase 7 ran, and the drizzle resolution is PROVEN** — done 2026-09-08 on `orch-nina-emoji-shortcuts`’ recommendation to verify early rather than at the irreversible step | **Ten conflicts, and the two `drizzle/meta` ones have a tested resolution.** Replay script saved at `logs/step5-resolve-drizzle-chain.py`, proven journal at `logs/step5-proven-journal.json`.

**The snapshot chain forks and neither tip is usable.** MEASURED: both `0011` snapshots descend from `0010` (`c1776003`); `origin/main`’s tip `0012_snapshot` (`20689d76`) has `nina_shortcuts` and 26 tables but **no** `nina_image_prefs`, while ours (`a28c47bc`) has `nina_image_prefs` and 26 tables but **no** `nina_shortcuts`. So **no journal ordering alone fixes this** — whichever fork is left as the tip, the next `db:generate` diffs the merged `schema.ts` against a snapshot missing a table and emits a `CREATE TABLE` for something production already has. That is the failure the peer predicted, and it is the reason `db:check` alone is not the gate.

**The resolution, and it renames no `.sql`, so every applied hash stays valid:** merge all journal entries by `tag`, sort by `when`, renumber `idx` sequentially — giving 14 entries, `idx 11 0011_rare_blockbuster` (13:10) -> `idx 12 0011_natural_nico_minoru` (15:26, ours) -> `idx 13 0012_messy_carlie_cooper` (16:02), `when`-monotonic and `idx`-unique. Then rebuild the snapshots to a single lineage: `0011` = main’s unchanged; `0012` = ours re-chained onto main’s `0011` **with the stale `nina_memory_facts.confidence` column dropped** (main’s `0011` removed it and our snapshot predates that); `0013` = a **constructed merged tip** — main’s `0012` content plus our `nina_image_prefs` table — chained onto ours. Chain: `c1776003 -> 81e07f7d -> a28c47bc -> 4ea80000`.

**VERIFIED, not assumed:** `npx drizzle-kit check` -> *"Everything’s fine"*; and the decisive test, `npx drizzle-kit generate` -> **"No schema changes, nothing to migrate"**, which proves the reconstructed tip exactly equals the merged `schema.ts` (27 tables, both new tables present). So after phase 7 lands its `DROP COLUMN`, the Step 5 generate emits exactly that one statement and nothing else. `idx` is not part of the migration hash (that is sha256 of the `.sql` bytes), which is what makes renumbering metadata safe for already-applied rows.

**THE BIGGEST CONFLICT IS NOT THE MIGRATION — IT IS THE NAV, AND IT IS A CROSS-SET DESIGN COLLISION.** `main` landed `00e2d0c feat(admin): /admin/shortcuts`, which **also added a sixth admin nav cell**. So main has six (`/admin`, `nina`, `personality`, `photos`, `memory`, **`shortcuts`**) at `grid-cols-6 h-14` with a `5rem` reserve; this branch has six (…`personality`, **`image-generation`**, `photos`, `memory`) at `grid-cols-3 grid-rows-2 h-28` with an `8rem` reserve. **Merged there are SEVEN**, and the two sets solved the same crowding problem in opposite directions — `AdminNav.tsx` conflicts in 6 hunks, `tests/admin.shell.test.ts` in 3. **Resolution: keep this set’s multi-row bar and extend it to seven** — `grid-cols-4 grid-rows-2`, `h-28`, `8rem` reserve retained — then rewrite `admin.shell.test.ts` to assert seven cells and the 4x2 geometry **and update its arithmetic comment block**, which currently describes six cells and an 8-character ceiling.

**CORRECTED: my first statement of this rung was wrong, and the correction strengthens the conclusion.** I wrote that six single-row cells are *"69 px at 414 px — under the 44 pt target"*. **69 px is the cell WIDTH and the 44 pt minimum is about HEIGHT.** `main`’s `AdminNav.tsx` says so in terms: `h-14` — 56 px — *"comfortably past `docs/design-brief.md`’s 44 pt minimum once the cell is the whole target"*, and *"the CELL COUNT has now changed twice … and the HEIGHT deliberately did not either time: more cells make the row narrower per cell, not shorter."* So the touch target passes at six across and would pass at seven. **Nothing in the height argues for 4x2.**

**What actually binds is label width, and the peer set costed the seventh route before it existed** (`tests/admin.shell.test.ts:116-133` on `main`): at six, cell 69.0 px, content box 61.0 px, eight characters ~51.0 px, slack ~10.0 px; *"A SEVENTH route makes the cell 59.1px and the content box 51.1px, which is the width of the eight characters themselves with nothing to spare: the ceiling has to come down to 7 the day that happens, and two of the six labels above would have to be reworded."* Our ~59 px figure agrees to a decimal. So the alternative is real and cheaper in code: one row of seven, ceiling 8 -> 7, reword `Overview` (8) and `Shortcut` (8).

**It is still declined, on two rungs that outrank the note, and on better geometry:**
- **Rung 3** — this set’s phase 4 code blocks specify the multi-row bar, and it is built, merged and green at `684e787`. Extending `grid-cols-3` to `grid-cols-4` is continuous with what shipped; restructuring to one row of seven is not.
- **Rung 4, Scope** — rewording `Shortcut` means editing a label the `nina-emoji-shortcuts` set shipped hours earlier, and `Overview` predates both sets. This set’s Scope grants it no mandate over another tab’s user-visible vocabulary; taking the cheap route would be creep dressed as a merge resolution.
- **And the geometry is simply better.** `h-28` is 112 px over **two** rows — **56 px per row, identical to `h-14`**, so the height rule is untouched — while the cells become 414/4 = **103.5 px** top row and 414/3 = **138 px** bottom. Content box ~95.5 px against ~51 px of label: **~44 px of slack, up from ~10 px at six across.** The one-row-of-seven route spends the last of the headroom; 4x2 restores it. That is the argument I should have made the first time instead of misciting the 44 pt figure. **Remaining conflicts, all mechanical:** `lib/admin/schema.ts` 1 hunk (keep both — shortcuts schema and prefs schema, appended at the same place); three `.workflows/todos.md` files 1 hunk each; `lib/db/.workflows/package_readme.md` 5 hunks; and `lib/db/.workflows/plan/P1-DB-A004.md` **add/add**, which the `A004` row above is corrected for. | 1: invariant 10 (nothing renamed, nothing regenerated that is applied) + 2: phase 7’s real requirement (one migration, the right DDL, a valid chain) + 6: `docs/design-brief.md`’s 44 pt minimum, already encoded in `admin.shell.test.ts` |

## Open Questions

**Empty, and deliberately so.** Every fork found in reconciliation was decided on the ladder and
recorded in **Decisions** above with its rung. Nothing is parked here, which is the required
outcome rather than a lucky one: `/analyze` Step 11 refuses to start an orchestrator over an open
question, so a parked item would cost this set its unattended run.

Open Questions is reserved for a fork where **every branch is irreversible**. There is no such fork
in this set. The one destructive step — phase 7's `ALTER TABLE "nina_tuning" DROP COLUMN "wardrobe"`
— is **reversible by construction**, and twice over: phase 1's migration `0011` copies every value
into `nina_image_prefs.wardrobe` *before* `0012` runs (guaranteed on a fresh database as well,
because migrations replay in order), and phase 7's Precondition D refuses to generate the drop until
a live query against the target database returns `uncopied = 0`. A plan describing a copy and a
database having received one are different facts; only the second protects the operator, and that is
the one the gate checks.

Three things a reader might expect to find here, and where they actually live:

- **`sidecarText`'s `reference:  none (RU-18)` line, false for an anchored generation** — decided,
  not parked: left as it is this wave, filed as a follow-up card. See Decisions.
- **The provider's own refusal text is not persisted** — phase 6's D4. A recorded limitation with a
  named workaround (the classification, the exact prompt, the job id and one log grep), and a
  follow-up card. R11 is satisfied without it.
- **Reaching photographs older than the picker's newest page** — phase 5's H2, with the two shapes
  that would be safe. The footer states the truth in the meantime.

None of the three blocks a phase, and none of them is irreversible.

## Rollback

**Per phase.** Each phase is one commit on `feature/nina-image-generation-tab`; `git revert` is the
unit. The two with a database step need one extra move:

- **Phase 1** — revert the commit, then `DROP TABLE nina_image_prefs`, then clear migration
  `0011`'s row from `__drizzle_migrations` if the revert is not followed by a re-generation
  (`db:migrate` tracks applied migrations by hash, so reverting the `.sql` without clearing its
  ledger row leaves the table dropped and the migration still marked applied). Nothing outside the
  phase reads it until phase 2 lands, so reverting it alone is safe only while phases 2–6 are
  unmerged.
- **Phase 3** — reverting restores the unanchored payload and the 150 s timeout. Any `nina_turns`
  row already carrying `args.referenceUrl` is read by a `buildImageRequestBody` that ignores the
  field, so an in-flight job degrades to unanchored rather than failing.
- **Phase 7** — migration `0012`'s column drop is the only destructive step in the set, and it is
  recoverable: phase 1's migration `0011` copied every value into `nina_image_prefs.wardrobe`
  first, and `0011` always replays before `0012`. Phase 7's Precondition D refuses to generate the
  drop unless a live query returns `uncopied = 0`. To restore, re-add the column and copy back.

**As a whole.** `git branch -D feature/nina-image-generation-tab` and drop `nina_image_prefs`. No
phase writes to a table another feature owns, and no phase changes a Blob pathname, so nothing
outside these two schema objects has to be undone.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_IMAGE_GENERATION_TAB_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_IMAGE_GENERATION_TAB_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_IMAGE_GENERATION_TAB_PLAN.md
