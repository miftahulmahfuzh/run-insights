# Todos: admin

**Package Path**: `lib/admin`
**Package Code**: ADM
**Last Updated**: 2026-09-07
**Total Active Tasks**: 0

## Quick Stats
- P0 Critical: 0
- P1 High: 0
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 3

---

## Active Tasks

### [P1] High

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks

### [P1] High

- [x] **P1-ADM-A001** Phase 3: `/admin/shortcuts`
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns a new `app/admin/shortcuts/page.tsx` (`force-dynamic`, `requireAdmin()`, `?user=` defaulting to the signed-in admin, `UserPicker`, rows built **server-side**); a new `lib/admin/shortcutModel.ts` — the client-safe row model and **the one door** the three length bounds come through, keeping `memoryModel.ts`'s value-import ban with one argued exception, a single `export { … } from '@/lib/nina/shortcuts'` re-export so `ShortcutTable.tsx` names no `@/lib/nina/` specifier at all; a new `'server-only'` `lib/admin/shortcutStore.ts` — the only `lib/admin` module that writes a shortcut, reaching **no drizzle table and no `db` handle** (every statement is `lib/nina/queries.ts`'s), owning the duplicate catch via `isUniqueViolation` on the 23505, the empty-trigger refusal, and the admin read's newest-first ordering and ceiling, deriving nothing; a new `'use server'` `lib/admin/shortcutActions.ts` with four actions (add, save a cell, toggle `enabled`, delete); `lib/admin/schema.ts` — the four zod schemas; a new `'use client'` `components/admin/ShortcutTable.tsx` (blur-to-save, optimistic delete, `MemoryTable.tsx`'s `CELL_CONTROL` / `CELL` / `HEAD_CELL` tokens reused verbatim; columns trigger · label · expansion · on/off · fired · ✕, with "fired" `hidden lg:table-cell`); `components/admin/AdminNav.tsx` — the sixth `LINKS` entry `{ href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut' }` placed last and `grid-cols-5` → `grid-cols-6`, the 8-character ceiling unchanged; `components/admin/UserPicker.tsx` — one **optional, defaulted** `basePath = '/admin/memory'` prop (additive; `app/admin/memory/page.tsx` is not edited); `tests/admin.shell.test.ts` — the three assertions that encode the cell count; and a new `tests/admin.shortcuts.test.ts`. Ten files. Does not touch anything under `lib/nina/` (it imports phase 1's `queries.ts` and `shortcuts.ts`), `lib/db/schema.ts`, `drizzle/`, `scripts/`, `app/admin/layout.tsx`, `app/admin/memory/page.tsx` or `components/admin/MemoryTable.tsx`. The page reads through **bare** `listNinaShortcuts(userId)` — every row, disabled included — and writes no `SELECT` of its own. No confirmation dialogs. Exit: the route renders on a 414 px viewport with no horizontal page scroll; add, edit, toggle and delete each write production and re-render in the same response; a duplicate trigger is refused with a sentence that names the existing trigger and nothing changes; `npm test` green.
  - **Status**: completed
  - **Plan Set**: `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — An explicit shortcuts mechanism, separate from memory: an admin surface to add, edit, disable and remove shortcuts, each standing for a situation or for something Miftah and Nina were doing
  - **Depends on**: `P1-DB-A004`
  - **Plan**: `.workflows/plan/P1-ADM-A001.md`
  - **Completed**: 2026-09-07 22:49
  - **Method**: /do
  - **Files**: lib/admin/shortcutModel.ts, lib/admin/shortcutStore.ts, lib/admin/shortcutActions.ts, lib/admin/schema.ts, components/admin/ShortcutTable.tsx, app/admin/shortcuts/page.tsx, components/admin/AdminNav.tsx, components/admin/UserPicker.tsx, tests/admin.shell.test.ts, tests/admin.shortcuts.test.ts
  - **Drift**: `lib/admin/schema.ts` is 480 lines, not the 481 the plan quotes (task-135 removed `nina_memory_facts.confidence` upstream). Matched on content instead of line number: the new section was appended after `ninaTuningResetSchema`, the import block after the existing `memoryModel` import.
  - **Drift**: Phase 1's landed `lib/nina/queries.ts` and `lib/nina/shortcuts.ts` match the plan's Interface Contract exactly. No drift there.
  - **Decided**: The plan's `ShortcutTable.tsx` docstring spelled literals its own test bans by raw `not.toContain` (`'@/lib/nina/'`, `'window.confirm'`, `'<dialog'`, `'showModal'`, `'<colgroup'`) -> reworded the two docstring paragraphs so the prose explains the rules without spelling them; the test is unchanged and the guards stand. Rung 2 (exit criteria: `npm test` green), reinforced by the plan's own stated convention for this exact trap in its Step 3 schema note and by the ladder's bar on relaxing a failing check. A note in the file's header warns the next editor.
  - **Verified**: `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched); `npm run typecheck` clean (`next typegen` generated `PageProps<'/admin/shortcuts'>`); `npm test` 3256 passed / 156 files; `npx vitest run tests/admin.shortcuts.test.ts tests/admin.shell.test.ts tests/admin.memory.test.ts` 74 passed; `npm run build` compiled with `/admin/shortcuts` listed as a dynamic route; `tests/__snapshots__/nina.prompts.test.ts.snap` unmodified in `git status` (invariant 3 holds); `npx prettier --check` clean on the ten files.
  - **Note**: The plan's ten manual browser checks were NOT run — they need a live `nina_shortcuts` table and a signed-in admin session. Phase 1's migration is generated but deliberately never applied (the set's Rollback section), and every session in this wave is barred from `db:migrate`. The phase's exit criteria are satisfied by lint, typecheck, build and the suite.
- [x] **P1-ADM-C410** Phase 4: The route, the sixth nav cell, and the form
  - **Difficulty**: HARD
  - **Type**: Feature
  - **Context**: Owns `app/admin/image-generation/page.tsx`; `components/admin/ImageGenPanel.tsx` (the prompt-length slider via `DialSlider`, the six focus checkboxes, the four free-text fields, one save, one reset, dirty-state, and a pure prompt preview); `lib/admin/imageGenModel.ts` (the draft type and the copy accessors, reading phase 1's specs); the prefs schema appended to `lib/admin/schema.ts` with **every bound imported** from `lib/nina/imageprefs.ts`; `lib/admin/imageGenActions.ts` (save + reset only, though its structural tests already allowlist phase 6's two); the sixth cell in `components/admin/AdminNav.tsx` and the paired reserve in `app/admin/layout.tsx`; a hub card on `app/admin/page.tsx`; `tests/admin.imagegen.test.ts` and the `tests/admin.shell.test.ts` updates. Does not touch the picker component (phase 5 — render a seam marked with the literal `SEAM — PHASE 5`, supply `references` + `photoTotal`, and persist the selection through the same save), the test button (phase 6 — a seam marked `SEAM — PHASE 6`, filled with `<ImageGenTestPanel dirty={dirty} />`), or `CharacterPanel.tsx` and everything else about the wardrobe's retirement (phase 7). Exit: `/admin/image-generation` renders the slider, six checkboxes and four fields; one save writes one row and reports the returned revision; every label and bound comes from `lib/nina/imageprefs.ts` (with `ninaBand` from `lib/nina/tuning.ts` — two imports, both zero-import vocabulary modules, because `ninaPromptLengthRungFor` takes a band index); the nav shows six cells that clear their character ceiling at 414 px and the layout reserves exactly the bar's height; the preview is the pure assembler and no model call happens in the render.
  - **Status**: completed
  - **Plan Set**: `NINA_IMAGE_GENERATION_TAB_PLAN.md` (phase 4 of 7)
  - **Satisfies**: R2 — A new admin tab: Image Generation · R4 — Prompt-length slider: longer ⇒ more detailed prompt · R5 — "Focus on" multi-select: face, skin, big boobs, bubble butt, big thighs, very long calves · R6 — Wardrobe (free text) · R7 — Venue (free text) · R8 — Time (free text) · R9 — Notes (free text) · R10 — Photo reference — a caption-less iOS-album-style grid over Nina's album **and** Chat photos, single selection (this phase: the selection's round trip — the draft member, the Zod boundary, `referenceKey`/`parseReferenceKey`, and the `references`/`photoTotal` props; phase 5 supplies only the grid)
  - **Depends on**: P1-DB-A004 (phase 1, complete)
  - **Plan**: `.workflows/plan/P1-ADM-C410.md`
  - **Completed**: 2026-09-07 23:01
  - **Method**: /implement (swarm, phase 4 of 7)
  - **Files**: app/admin/image-generation/page.tsx, app/admin/layout.tsx, app/admin/page.tsx, components/admin/AdminNav.tsx, components/admin/ImageGenPanel.tsx, lib/admin/imageGenActions.ts, lib/admin/imageGenModel.ts, lib/admin/schema.ts, tests/admin.imagegen.test.ts, tests/admin.shell.test.ts
  - **Drift**: `components/admin/ImageGenPanel.tsx` carries phase 5's Step 3 mount (`<PhotoReferencePicker/>`, the `parseReferenceKey` import, the removed placeholder section). Phase 5 applied it into phase 4's uncommitted file before phase 4 committed, because its own committed test asserts the `SEAM — PHASE 5` comment is gone as soon as the panel exists on disk. Phase 5 agreed phase 4's commit should carry it and will record the commit-boundary crossing in the swarm ledger.
  - **Drift**: The plan's step-5 page code and its step-9 assertion disagreed on the local's name: the assertion expected `referenceRows.map(toImageReferenceOption)` (pre-reconciliation, when the read returned an array) while the reconciled read returns a `NinaPhotoRefPage`. The test now asserts `.rows.map(toImageReferenceOption)`; the mapper is what the case is about, not the local's name.
  - **Drift**: `AdminNav`'s header prose at :14 and `app/admin/page.tsx`'s `these four links` comment both spelled numbers this phase changed (5rem -> 8rem, four -> five cards). Updated; neither was on the plan's replace list but both would otherwise document something false.
  - **Decided**: `ninaImageReferenceSchema.id`: the plan's `.min(1).nullable()` contradicts its own refine, which reads `''` as the empty id -> dropped both, keeping `z.string().trim().max(NINA_IMAGE_REFERENCE_ID_MAX)` (rung 3, plus the Decisions row "the declaring phase owns the spelling": phase 1's `NinaImageReference.id` is `string` with `''` for none). As written, no unselected reference could have validated, so the default state and the reset would both have failed at the boundary.
  - **Decided**: `ImageGenPanel`'s four free-text placeholders and labels read `NINA_IMAGE_TEXT_SPECS` instead of the plan's inline literals (rung 2, the exit criterion "every label, hint and bound on the page comes from `lib/nina/imageprefs.ts`").
  - **Decided**: The panel asks `referenceKey(draft.reference) !== ''` rather than the plan's `draft.reference.id !== null`, and `references.find(o => o.key === selectedKey)` rather than `referenceKey(option)` — both were pre-reconciliation leftovers from an `id: string | null` reference and an option type that carried source/id (rung 3 + the same declaring-phase rule).
  - **Decided**: `imageGenModel.ts` imports TWO modules, `@/lib/nina/imageprefs` and `@/lib/nina/tuning`, and the client-safe test allows exactly those two rather than asserting one (rung 2, the plan's own A1b and the Decisions row on `imageGenModel`'s import count: `ninaPromptLengthRungFor` takes a band index and `imageprefs.ts` keeps no copy of the band vocabulary).
  - **Decided**: `readme-updater` is NOT dispatched -> phase 4's Handoffs, "Not done, deliberately": the set's phase 7 owns the two affected package readmes (`lib/admin`, `components/admin`) and touching one from here would collide. Phase 7 is live in this worktree now, so the collision is a real merge conflict rather than a hypothetical.
  - **Decided**: Several plan-authored test lines were stale and were corrected rather than left red: `parseReferenceKey` was used but not imported; `IMAGE_REFERENCE_NONE.id` was asserted `toBeNull()` (it is `''`); a `toImageReferenceOption` case passed `url` where the parameter is `blobUrl`; a failure message referenced an undefined `kind` instead of `source`; and `prettifyFocusKey('butt')` was asserted to be 'Bubble butt' when it prettifies to 'Butt' (the declared label is now read through `imageFocusCopy`, which is what the case meant). No assertion was weakened — each fix makes the case check the thing its own comment says it checks.
  - **Verified**: `npm run typecheck` clean; `npm run lint` 0 errors (2 pre-existing warnings in `scripts/capture/shoot.mjs`, untouched); `npm test` 156 files / 3232 tests all passing; `npm test -- tests/admin.imagegen.test.ts tests/admin.shell.test.ts tests/admin.tuning.test.ts` 95 passing; `npm run build` succeeded with `/admin/image-generation` as a dynamic route; `ci:client-secret-guard`, `ci:llm-payload-guard`, `ci:data-layer-guard`, `ci:openrouter-guard` all OK; `grep -n "'big " components/admin/ImageGenPanel.tsx` empty (exit criterion).
  - **Note**: the plan index `NINA_IMAGE_GENERATION_TAB_PLAN.md` is deliberately NOT edited by this phase — it is shared by the four sessions live in this worktree and the coordinator `orch-nina-image-generation-tab` owns the phase table. No successor task was unblocked or created.

- [x] **P1-ADM-B130** Phase 2: "What she can see in it", editable
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns a zod schema in `lib/admin/chatPhotoSchema.ts`, an `updateNinaChatPhotoDescription` statement in `lib/nina/queries.ts` §5b, `editChatPhotoDescriptionAction` in `lib/admin/chatPhotoActions.ts`, and the editable control in `components/admin/ChatPhotoDetail.tsx` plus a new `components/admin/ChatPhotoDescription.tsx`. Exit: an operator can rewrite the description on `/admin/photos` and a save survives a reload; an empty save clears the field to NULL and says so on screen; the next attach turn reads the new text with no invalidation step; lint, typecheck and vitest all green.
  - **Status**: completed
  - **Plan Set**: `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` (phase 2 of 4)
  - **Satisfies**: R2 — there is a "what she can see in it" field. make this field editable by user
  - **Plan**: `.workflows/plan/P1-ADM-B130.md`
  - **Card**: miftahulmahfuzh/run-insights#130
  - **Completed**: 2026-09-07 17:54
  - **Method**: /do
  - **Files**: lib/admin/chatPhotos.ts, lib/admin/chatPhotoSchema.ts, lib/admin/chatPhotoActions.ts, lib/nina/queries.ts, components/admin/ChatPhotoDescription.tsx, components/admin/ChatPhotoDetail.tsx, tests/admin.chatPhotos.test.ts, tests/nina.chatPhotoDescription.test.ts
  - **Outcome**: `nina_message_images.description` is writable by hand from `/admin/photos`. A new `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000` ceiling, a `chatPhotoDescriptionSchema` that caps before it normalises, an owner-scoped `updateNinaChatPhotoDescription` UPDATE carrying `user_id` + `id` + `kind = 'generated'`, an `editChatPhotoDescriptionAction` server action, and a new `ChatPhotoDescription` client control mounted (keyed by `photo.id`) in the rail. No DDL, no migration, no model call, no `after()` pass, nothing under `components/nina/`.
  - **Drift**: No code drift: every anchor the plan quoted matched the branch exactly (chatPhotos.ts:159; chatPhotoSchema.ts:3-8/:71/:75; queries.ts `setNinaMessageImageDescription`:1826 and the §6 banner:1841; chatPhotoActions.ts:7-11/:12-17/:22-35 and :323-325; ChatPhotoDetail.tsx:8, the header docstring end :34-35, and the read-only block :155-172; all five test-suite anchors).
  - **Drift**: Concurrent peer effect: the phase 3 session ran a repo-wide `npm run format` mid-phase, which left two files this phase had just written prettier-dirty. Fixed by running `npx prettier --write` on ONLY those two files (`components/admin/ChatPhotoDescription.tsx`, `tests/admin.chatPhotos.test.ts`). No logic changed; all three verification commands re-run green afterwards.
  - **Decided**: Step 3 says create every phase's task, but peers p1/p3/p4 run concurrently on the same todos.md files -> created ONLY phase 2's task (rung 6, surrounding convention: the swarm ledger is the per-phase TaskID record and "derive, never trust" assumes one owner per row; tie-break: narrower blast radius).
  - **Decided**: `lib/nina/queries.ts` is shared with phase 1, which has 10 uncommitted hunks in it -> staged ONLY phase 2's single hunk via `git apply --cached` rather than the whole file (rung 4, the plan index's Board section: each phase completes on its own commit; tie-break: reversible + narrowest blast radius).
  - **Decided**: Empty save clears the description to NULL rather than refusing (plan D1, inherited -- not re-litigated).
  - **Verified**: `npm run lint` 0 errors (2 warnings, both pre-existing in `scripts/capture/shoot.mjs`, untouched here); `npm run typecheck` clean; `npx vitest run tests/admin.chatPhotos.test.ts tests/nina.chatPhotoDescription.test.ts` 58 passed (the plan predicted exactly 40 + 6 + 8 + 4 = 58); `npx vitest run` 152 files / 3057 tests passed; `node scripts/check-llm-payload-boundary.mjs` passed with no new entry (invariant 5).

- [x] **P1-ADM-A000** Phase 3: The admin add path captions from the photograph
  - **Difficulty**: NORMAL
  - **Type**: Bug
  - **Context**: Owns `lib/admin/chatPhotoActions.ts` — `scheduleChatPhotoDescribe` becomes `scheduleChatPhotoCaption`: describe with `subject: 'self'` → `captionNinaPhoto` → `updateNinaMessage`, all inside the **one** existing `after()` rather than a second one, with the `description != null` early return kept so a re-run captions from the stored description without paying a second vision call — plus its tests, appended to `tests/admin.chatPhotos.test.ts` after phase 2 has landed. Quotes the file as phase 2 leaves it (the `insertNinaMessages` call already carrying `photoOnly: true`); the diff is confined to `scheduleChatPhotoDescribe` and its import block. Does not touch `replaceChatPhotoAction`'s caption (deliberately deferred, with a one-line note left at the site), `lib/nina/imagerun.ts`, `lib/nina/caption.ts`, `lib/nina/vision.ts`, `lib/nina/queries.ts`. Exit: an add writes a scene-agnostic placeholder synchronously and, in `after()`, replaces it with a caption derived from that photograph's own description; every failure — describe throws, token floor trips, caption returns `null` — leaves the placeholder in place, logs once, and returns `{ ok: true }`; the description is still written to the row; no `await` was added to the action's response path.
  - **Status**: completed
  - **Plan Set**: `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md` (phase 3 of 4)
  - **Satisfies**: R1 — A photo added to the Chat photos collection must arrive with a chat message that says something true about **that** photograph
  - **Depends on**: P1-NIN-A019, P1-DB-A002
  - **Plan**: `.workflows/plan/P1-ADM-A000.md`
  - **Completed**: 2026-09-07
  - **Outcome**: `scheduleChatPhotoDescribe` -> `scheduleChatPhotoCaption`: one `after()`, `describeNinaImages(refs, { subject: 'self' })` -> `readNinaTuning` -> `captionNinaPhoto({ seen, seenKind: 'described', tuning })` -> `updateNinaMessage`. The description is still stored first and on its own, so a caption failure never costs the paragraph. Every failure branch — row gone, floor tripped, transport failure, caption `null`, `updateNinaMessage` `null` or throwing — leaves the scene-agnostic placeholder standing, logs once, and never rejects. The floor gets `console.error` and a transport failure `console.warn`, so a silently-dropped image is distinguishable from a dead socket.
  - **Decisions**: `replaceChatPhotoAction` DID hold a `scheduleChatPhotoDescribe` call, so Step 3's second half applied — renamed with the plan's verbatim note that a replaced photograph's bubble text in the gap is undesigned and is its own card (rung 3, the plan's code block). `tests/admin.chatPhotos.test.ts` had NO mock setup at all — it was a pure-function file — so the whole harness was added (`next/server`'s `after` captured, not executed) rather than a pinned factory extended (rung 3). Two tests beyond the plan's six: floor-vs-transport logging and the replace call site, because exit criterion 4 and Step 3's rename had no assertion otherwise (rung 2, exit criteria).
  - **Verified**: `npm run lint` 0 errors; `tsc --noEmit` clean for this phase's files; `node scripts/check-llm-payload-boundary.mjs` passes with `captionNinaPhoto` already sanctioned for this file by phase 1; `npm run test` 147 files / 2910 tests pass (40 in `tests/admin.chatPhotos.test.ts`, up from 32).
  - **Note**: `tsc` also reports 4 `TS2304` errors in `tests/nina.imagerun.test.ts` — phase 4's untracked, in-flight file in this shared worktree. Not this phase's, and `lib/nina/*` was deliberately not touched.

