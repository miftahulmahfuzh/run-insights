# Plan: Image collection — merge Chat photos into the album, rename, borderless

**Slug:** image-collection
**Date:** 2026-09-10 15:50 WIB
**Analysis:** `20260910-154651-53D2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/image-collection`
**Branch:** `feature/image-collection` (base: `origin/main` @ `f429986`)
**Phases:** 4
**Status:** phase 2/4 complete
**Coordinator:** orch-image-collection

---

<The Coordinator line is the peer address of the session driving this set, filled in by
`/analyze-orchestrator` when it takes the set over. Leave it `—`: a name written here by hand
addresses a session that does not exist, and the reports meant for it go nowhere.>

## Why

The user's rationale, verbatim — this is the specification for what may be removed and what may not:

> 1. setelah berfikir lama, saya memutuskan untuk menggabungkan Chat photos ke Nina's album. karena foto foto pada Chat photos dan Nina's album sama sama memiliki fitur yang hampir sama. saat ini foto foto di Chat photos bisa diset jadi foto profil juga. dan saya ingin fitur untuk replace satu item foto juga bisa diimplementasikan di Nina's album.
>
> currently, sedikit bedanya adalah di Chat photos , kita bisa lihat prompt image generation nya. nanti tolong anda handle saja resolution nya gimana. i trust your expertise.
>
> ide saya adalah, we purge Chat photos tab, dan di folder list di Nina's album kita bikin aja satu folder Media , posisinya dibawah folder Album. kalo admin klik folder ini, maka akan kelihatan semua foto - foto yang saat ini ada di Media (kaya di section Media di page /nina/about)  jadi sekarang bahkan image yang diupload user secara manual di chat session bisa direplace dan di jadiin profpic nina juga.
>
> sekalian juga, kan sekarang foto di Chat photos itu bisa direplace user, nah, kalo user udah replace satu photo, tolong nanti pas refactor hapus tombol untuk ngeliat promptnya (karena generated image dari prompt ini udah direplace user)
>
> last but not least, tolong seragamkan tombol "describe" yang ada di Chat photos sekarang. admin kan bisa liat hasil describe nya. tolong di halaman Image collection nanti semua foto punya UI/UX seragam yang bisa accomodate fitur describe ini. dan tolong make sure, ketika user attach foto yang sudah didescribe ke chat session, maka describe result nya juga di attach sebagai context nina biar balasan chat nina lebih akurat
>
> 2. selain itu, tolong revamp halaman Nina's album, ganti namanya jadi Image collection . dan buat tampilan foto foto nya ini lebih clean. buat supaya foto-fotonya ini borderless kaya di Photo reference di Image generation page.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Merge Chat photos into the album: purge the Chat photos tab; one **Media** folder in the album's folder list, below "Album", showing what `/nina/about`'s Media section shows; manually-uploaded chat images become replaceable and adoptable as her profile picture. Prompt-visibility resolution delegated to the planner (resolved: first row of Decisions). | 1, 2 |
| R2 | A replaced photo no longer offers the view-prompt affordance. | 2 |
| R3 | One uniform describe UI/UX for every photo on the page; a described photo attached to a chat carries its describe result into Nina's context — for the attaching turn and for the rest of the conversation. | 3 |
| R4 | Rename the page "Image collection"; borderless photo grid, Photo-reference style. | 4 |

## Scope

**In scope:** `/admin/nina` (page, FileExplorer family, album actions), `/admin/photos` (deleted), `lib/admin/chatPhoto*`, `lib/admin/ninaAlbumActions.ts`, `lib/nina/queries.ts` (admin reads/writes), `lib/nina/gateway.ts` (window imageDescriptions), `lib/admin/filetree.ts` + `FolderTree` (virtual Media node), `components/admin/AdminNavLinks.tsx` + `app/admin/page.tsx` (nav/dashboard), `explorer/PhotoGrid.tsx` (restyle), tests touching all of these.

**Out of scope:** any runner-facing surface (`/nina`, `/nina/about`, chat bubbles, `chatViewerPhotos`, `galleryPhotos`, `photoSideOf` consumers); the Blob pathname shapes and `app/api/admin/nina/upload/route.ts` predicates (reused as-is); the database schema (no migration); `PhotoReferencePicker.tsx` itself (style target only — `tests/admin.photoReference.test.ts` must stay green); the image worker; historical `.workflows/` plan residue and `docs/plans/*` records.

## Invariants

1. The tree builds and `npm run lint`, `npm run typecheck`, `npm run test` pass at the end of every phase.
2. No database migration in any phase; `nina_message_images` and `nina_avatars` columns are exactly as they are on the base.
3. Runner-facing behavior unchanged: invariant 5 holds (descriptions never cross to a runner surface; `glm-5.3` is never sent an image part); `photoSideOf`, `galleryPhotos`, `chatViewerPhotos`, chat bubbles byte-identical.
4. `nina_avatars` deletes stay unreferenced-checked-free on their side and `nina_message_images` deletes keep going through `releaseBlobIfUnreferenced`; adoption keeps COPYING bytes (never shares objects).
5. Reference rows (non-null `source_avatar_id`/`source_image_id`) stay invisible to every collection listing and refused by every per-row action, with the existing sentence.
6. Orphan semantics preserved: `messageId: null` rows are first-class members; Remove stays carrier-aware (`isNinaPhotoCarrierMessage`).
7. No confirmation dialogs anywhere on the admin surface (the file's own R1 ruling); errors and notes are inline sentences.
8. Every new pure decision (Media node builder, media view model, window-description assembly) lives in `lib/` and lands with a unit suite — vitest is node-only, there is no component test harness.
9. `tests/admin.photoReference.test.ts` stays green — the restyle mirrors the recipe into explorer files, never edits the picker.
10. Admin copy is English; the rename does not collide with the existing "Images" short label (image generation).

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Media folder in the Image collection explorer (read path) | R1 | `app/admin`, `components/admin/explorer`, `lib/admin`, `lib/nina` | ~10 | — | HARD | `.workflows/plan/image-collection/phase-1.md` | `P1-RI-A034` | — |
| 2 ✅ | Media verbs on both kinds; purge the Chat photos surface | R1, R2 | `lib/admin`, `lib/nina`, `components/admin`, `app/admin` | ~23 | 1 | HARD | `.workflows/plan/image-collection/phase-2.md` | `P1-RI-A035` | — |
| 3 | One describe control everywhere; described photos reach Nina's context | R3 | `components/admin`, `lib/admin`, `lib/nina` | ~16 | 2 | NORMAL | `.workflows/plan/image-collection/phase-3.md` | `P1-CA-A005` | — |
| 4 | "Image collection": rename + borderless grid | R4 | `app/admin`, `components/admin` | ~13 | 1, 2 | NORMAL | `.workflows/plan/image-collection/phase-4.md` | `P1-RI-A036` | — |

### Phase 1 — Media folder in the Image collection explorer (read path)
**Satisfies:** R1
**Owns:** the virtual Media folder end to end on the READ side: a pure tree-node builder in `lib/admin/filetree.ts` (a pinned "Media" sibling under the "Album" root — never a storable folder path, invisible to `isFolderAncestorOf`/move/delete), a paginated all-kinds originals read + count in `lib/nina/queries.ts` (WHERE `user_id` + `isOriginalPhoto()` — the exact membership of `/nina/about`'s Media section), an `ExplorerPhoto` extension carrying media-only fields (`kind`/`side`, `prompt`, `messageId`; album-only fields nullable there), the `?view=media` arm of `app/admin/nina/page.tsx` (page size `NINA_CHAT_PHOTO_PAGE_SIZE`, `searchParams` awaited per this repo's Next 16 docs), and `FileExplorer`/`FolderTree`/`PhotoGrid` composition so the grid renders media tiles and the tree shows Media with its count. Selection opens the pane read-only at worst.
**Does not touch:** any Server Action, any write path, `SelectionPane`'s control set, `/admin/photos` (still live and green), nav labels.
**Exit criteria:** `/admin/nina?view=media` lists every original conversation photo (both kinds, orphans included, newest first, paginated at 48); the tree pane shows "Album" then "Media" with a count; album folders behave exactly as before; new pure logic unit-tested.

### Phase 2 — Media verbs on both kinds; purge the Chat photos surface
**Satisfies:** R1, R2
**Owns:** lifting the `kind !== 'generated'` refusals — `replaceChatPhotoAction`, `editChatPhotoDescriptionAction` (+ `updateNinaChatPhotoDescription`'s WHERE), `setChatPhotoAsAvatarAction` — so every ORIGINAL media row (his uploads included) is replaceable, describable, adoptable; the side→subject mapping as the set's ONE pure helper, `describeSubjectForSide` in `lib/nina/album.ts` (Phase 3 imports it; no second helper exists), wired into `scheduleChatPhotoCaption`; the migrated client upload flow (`ChatPhotoAdd`/`chatPhotoUpload` → `explorer/`, Media view's "Add photos"; Replace) mounted through `SelectionPane` restructured into a two-line dispatcher over a private `AlbumSelectionPane` and a new `MediaPane` — narrowing Phase 1's `origin` union via the `isMediaRow` type guard, with adopt-with-crop draft, Replace, Remove, Download (`ChatPhotoActionResult` and `AdminActionResult` both consumed) and NO `FileExplorer` prop changes (Phase 1's `view: ExplorerView` + `mediaCount: number` stand); the prompt toggle rendered ONLY when `prompt != null` (R2 — `updateNinaChatPhotoBlob` already nulls it on replace); and the purge: `app/admin/photos/page.tsx`, `ChatPhotoGrid`, `ChatPhotoDetail`, `ChatPhotoControls`, `ChatPhotoAdd`, `chatPhotoUpload` (re-homed into `explorer/`, not lost), `ChatPhotoDescription`, `ChatPhotoProfilePicture`, `chatPhotoModel.ts`, `listNinaChatPhotos` + `NinaChatPhotoPage`, the nav entry + dashboard card, `tests/admin.chatPhotosRail.test.ts`, with `ADMIN_CHAT_PHOTOS_PATH`'s VALUE re-homed to `'/admin/nina'` (the constant stays). `countNinaChatPhotos` and `generatedChatPhotoScope` are deliberately KEPT — the image-reference picker (`listNinaPhotoReferences`/`resolveNinaPhotoReference`) is their remaining caller, verified in the tree, pinned by `tests/nina.imageprefs.test.ts:539-541`. `MediaDescription.tsx` is created as a marked seam for Phase 3.
**Does not touch:** `lib/nina/gateway.ts` (Phase 3); the seam's replacement and the removal of every describe button (Phase 3); `explorer/PhotoGrid.tsx` styling and the post-rename nav copy, including the `ImagesIcon` docstring and the shell test's trio comment, which it leaves prose-stale on purpose (Phase 4); any runner-facing module.
**Exit criteria:** every verb from the old rail works in the Media folder for both kinds; `/admin/photos`, its nav entry and card are gone; `tests/admin.shell.test.ts` updated and green; no `ChatPhoto*` component remains; the mapping has one definition and one suite; the whole suite passes.

### Phase 3 — One describe control everywhere; described photos reach Nina's context
**Satisfies:** R3
**Owns:** the unified describe panel `PhotoDescription.tsx` — one component serving album rows AND media rows, mounted inside BOTH arms of Phase 2's dispatcher (album closures in `AlbumSelectionPane`, media closures in `MediaPane`; no discriminant read remains — the arms are pre-narrowed); it retires Phase 2's interim seam `MediaDescription.tsx`, both arms' `<dl>` null-ness rows and `AlbumSelectionPane`'s null-guarded describe button, and updates `tests/admin.mediaPane.test.ts` (two interim pins retire with the seam); stored prose rendered and editable by hand (the `ChatPhotoDescription` textarea idiom, carried through the seam), plus a describe/re-describe button always available that runs the vision model and overwrites (no confirmations); describe subject follows the photo through Phase 2's `describeSubjectForSide` (`hers`/album → `'self'`, `his` → `'runner'` — `describeNinaAvatarAction` stops describing photos of Nina with the runner prompt); `ChatPhotoActionResult` gains an OPTIONAL `description?: string` (additive — the panel shows fresh prose in the describe round trip); `lib/nina/gateway.ts:162-164` stops hardcoding `imageDescriptions: []` so the conversation window's described photos reach every turn's context (bounded: window-bounded rows, prose ≤ 2000 chars); the stale coverage claim at `lib/nina/actions.ts:1535-1540` corrected; regression tests: an attached described photo's description lands in `imageDescriptions` (turn input), and a window row's description appears in the assembled context.
**Does not touch:** the runner-facing photo surfaces (invariant 5 — the description text path into `userTurnText` is the ONLY image path and stays text), replace/add/remove flows (Phase 2 shipped them), styling (Phase 4).
**Exit criteria:** one describe UI/UX on every photo of the page; no describe control left in any icon row and no null-ness row in any facts `<dl>`; `MediaDescription.tsx` gone; album describes use the self prompt; window rows carry `imageDescriptions` in the context read; invariant-5 tests still green; new tests pin both context paths.

### Phase 4 — "Image collection": rename + borderless grid
**Satisfies:** R4
**Owns:** every user-visible "Nina's album" → "Image collection" (nav label + short, dashboard card, page `h1` + body copy, `app/admin/personality/page.tsx:77` copy), with a short label that does not collide with "Images"; the post-purge nav comment rewrites Phase 2 left stale on purpose (`ImagesIcon`'s docstring, the shell test's trio comment — both now carry the post-rename labels); `explorer/PhotoGrid.tsx` restyled to the Photo-reference recipe — `gap-[3px]` sheet with one `rounded-field overflow-hidden`, `aspect-square` tiles on a `bg-ink-3/20` bed, no per-tile border/radius/padding, selection as scale-down + badge (current-ribbon and filename label re-expressed in that idiom; `thumbUrl ?? url` source unchanged; Phase 1's `view` prop and view-aware media empty state kept byte for byte); opportunistically the comments listed in the analysis reference list (including the `schema.ts` filtered-reads line that names the retired `listNinaChatPhotos`).
**Does not touch:** `PhotoReferencePicker.tsx` and its test (invariant 9), any action, any data read, Phase 3's describe panel internals.
**Exit criteria:** the page reads "Image collection" everywhere; the grid is borderless in the picker's idiom and `tests/admin.photoReference.test.ts` is untouched and green; suite + lint + typecheck pass.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| The media-row discriminant spelled three ways: Phase 1 landed `origin: 'album' \| 'media'` (types-only union, no guard function); Phase 2 assumed "`kind == null` marks an album row"; Phase 3 assumed a `photo.table: 'avatar' \| 'image'` field | 1, 2, 3, 4 | Phase 1's `origin` union is the contract. Phase 2's `isMediaRow` is now a `photo is MediaExplorerPhoto` type guard over `origin` (its drafted `photo.kind != null` body could not compile against the union); the guard stays the single point of contact, and `MediaPane`/`AlbumSelectionPane` take the narrowed arm types. Phase 3's `photo.table` read was eliminated — Phase 2's dispatcher pre-narrows the arms, so each arm's component already knows its table and the panel's closures are chosen locally. Phase 4's "media rows carry a non-empty `filename` (pathname basename)" corrected: Phase 1 derives it from date + id, never a pathname parse. |
| Fate of `countNinaChatPhotos` + `generatedChatPhotoScope`: Phase 1's handoff said Phase 2 purges them; Phase 2 kept them, citing the image-reference picker | 1, 2 | Verified in the tree: `listNinaPhotoReferences` (`lib/nina/queries.ts:4062-4066`) calls both and `resolveNinaPhotoReference` (`:4140`) uses the scope, pinned by `tests/nina.imageprefs.test.ts:539-541`. Phase 2's keep stands; `listNinaChatPhotos` + `NinaChatPhotoPage` are purged (their only caller was the deleted page). phase-1.md's handoff and Interface-Contract "Leaves alone" line edited to match; Phase 1's Step 2b comment no longer predicts the scope's retirement. |
| Two side→subject mappings: Phase 2 creates `describeSubjectForSide` in `lib/nina/album.ts`; Phase 3 creates `ninaDescribeSubjectForSide` in `lib/nina/vision.ts`, calls itself "the ONE mapping", and offers Phase 2 an optional adoption — impossible, Phase 2 runs first | 2, 3 | ONE canonical function: Phase 2's `describeSubjectForSide` (`lib/nina/album.ts`, pure, structural `'self' \| 'runner'` return, suite in `lib/nina/album.test.ts`). Phase 3's mint was deleted from phase-3.md; `vision.ts` imports the helper (runtime import, no cycle — `album.ts` imports nothing) and its stale `:131-139` subject docstring is de-staled to point at it. Phase 3's vision-suite keeps only the through-the-envelope assertion; the mapping's both directions stay pinned once, in `album.test.ts`. |
| SelectionPane shape across P2→P3: Phase 3 quoted the base-tree monolith, kept a conditional `ChatPhotoDescription.tsx` delete, and never said what happens to `MediaDescription.tsx` (Phase 2's seam) or to `tests/admin.mediaPane.test.ts`'s seam pins | 2, 3 | Phase 3 rewritten against the post-Phase-2 dispatcher: describe-region edits live inside `AlbumSelectionPane` and `MediaPane`; Phase 2 is the outright owner of every `ChatPhoto*` deletion (the conditional line is gone). Found by the standard checks and now explicit in phase-3.md Step 10: Phase 3 deletes `MediaDescription.tsx`, reworks `MediaPane` (eye toggle + `showDescription` + its `<dl>` null-ness row out; `PhotoDescription` in with the media closures), deletes `AlbumSelectionPane`'s describe button + null-ness row, and updates `tests/admin.mediaPane.test.ts` (the `DESCRIPTION` pin and the `description == null` positive retire). phase-2.md carries a forward note naming those two pins as interim. |
| `FileExplorer`'s view signal: Phase 2 drafted a required `view: 'album' \| 'media'` prop and quoted a pre-Phase-1 toolbar | 1, 2 | Phase 1's delivered props stand: `view: ExplorerView` (`lib/admin/filetree.ts`, parsed by `readExplorerView`) + `mediaCount: number`. Phase 2's Step 9c Edit 1 is now "imports only — no prop change"; its toolbar replacement quotes Phase 1's post-change cluster and keeps the `N in Media` count arm; the `PhotoMoveBar` swap is stated against Phase 1's origin-guarded block. |
| `ADMIN_CHAT_PHOTOS_PATH`: Phase 2 re-homes its value; Phase 3 assumed either resolution | 2, 3 | Verified: Phase 2 changes the constant's VALUE to `'/admin/nina'` and keeps the constant; no caller changes needed. Phase 3 revalidates through the constant and never hardcodes a route (no `'/admin/photos'` anywhere in phase-3.md); its Requires line states this as delivered. |
| `ChatPhotoActionResult.description?` (Phase 3, additive) | 3 | No contradiction with Phase 2 — its components read only `ok`/`error`/`id`/`note`, and no test asserts the field's absence. Recorded in this index's Phase 3 section. |
| P2∥P4 double-owned copy: both rewrote `ImagesIcon`'s docstring (`AdminNavLinks.tsx:249-253`) and the shell test's trio comment (`:172-180`) | 2, 4 | One owner per region: Phase 4 owns both (its wording carries the post-rename labels and supersedes Phase 2's post-purge wording); Phase 2's rewrites were removed and it leaves the two comments prose-stale until Phase 4 — comments name a deleted `CameraIcon` between the phases, which breaks no build and no test. Every other claimed region was verified disjoint line by line (P2: `:71-75`, `:83-93`, `:100-106`, `:107`, `:320-337`, grid-cols `:163`; P4: `:38-41`, `:58-60`, `:70`, `:186`, `:248-253`, `:295`; shell test: P2 hrefs/counts/arithmetic, P4 the new `it` + two comment blocks; `app/admin/page.tsx`: P2 the `:117-132` card + count read, P4 the `:100-115` card — ranges do not even shift each other). |
| Phase 3 internal: Step 4 imported the hoisted `chatPhotoDescriptionField` from `@/lib/admin/chatPhotos`, but Step 3 creates it in `lib/admin/chatPhotoSchema.ts` (where `chatPhotoDescriptionSchema` lives, verified `:121`) | 3 | Import corrected to `@/lib/admin/chatPhotoSchema`; the no-cycle note re-stated for the real chain (`schema.ts` → `chatPhotoSchema.ts` → `chatPhotos.ts` → `lib/nina/*`). |
| Phase 4's "complete replacement file" for `PhotoGrid.tsx` omitted Phase 1's `view` prop and reverted the media empty state — would not have compiled against Phase 1's `FileExplorer` mount | 1, 4 | The replacement file now carries Phase 1's props (`view: ExplorerView`) and the view-aware media empty copy byte for byte; the "Signature changes: none" line corrected to "none of this phase's making". |
| `app/admin/page.tsx:27-30` module docstring: Phase 4 said "left to Phase 2", Phase 2 ruled it "a historical record — leave it" | 2, 4 | Phase 2's ruling stands: nobody edits it. phase-4's note and Handoff corrected. |
| Stale-comment residue Phase 2's purge creates (`lib/db/schema.ts:1123` names the retired `listNinaChatPhotos`) | 2, 4 | Assigned to Phase 4's opportunistic sweep (its handoff already named the line); phase-4 Step 7 now carries the replacement wording (the Media read joins the filtered-reads list). |
| Phase 2∥Phase 3 both edit `chatPhotoActions.ts` | 2, 3 | Disjoint regions, verified sentence by sentence: Phase 2 owns the kind-refusal lifts, the HALF ONE comment + describe call (`:698-709`) and the `describeSubjectForSide`/`photoSideOf` import; Phase 3 owns the new `describeChatPhotoAction` (which reuses Phase 2's already-imported helpers — no duplicate import line) and the gateway parenthetical in `scheduleChatPhotoCaption`'s history paragraph (`:644-650`). `chatPhotoSchema.ts` is Phase 3's alone; Phase 2 leaves it intact. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| R1's delegated fork: what happens to the generation-prompt view when Chat photos merges away | Keep prompt visible ONLY for rows that still carry it (`prompt != null` renders the toggle; `updateNinaChatPhotoBlob` already nulls prompt+description on replace, and `addChatPhotoAction` writes `prompt: null`) — so replaced and hand-added rows show no prompt affordance, never-replaced generated rows still do. No migration, no replaced-flag column. | 4: user's raw input — "kalo user udah replace satu photo … hapus tombol untuk ngeliat promptnya" names exactly the rows whose sidecar is gone |
| R3's "describe result attached as context" — the direct attach path already copies the description into the turn's `imageDescriptions`; is more needed? | Yes: close the window gap (`gateway.ts:162-164` hardcoded `[]`) so photos attached EARLIER in the conversation still reach her — without it the requirement is false in every turn after the attaching one, under a comment that wrongly claims otherwise. Token cost is bounded (window rows × ≤2000-char prose, mean ~300-400 measured). | 5: surrounding convention — RU-12 exists precisely so glm-5.3 can react to photographs; the hardcoded `[]` defeats it |
| Which rows the Media folder lists | Every original `nina_message_images` row, BOTH kinds, orphans included — the exact membership of `/nina/about`'s Media section (`isOriginalPhoto()`), not `/admin/photos`' generated-only scope. References stay hidden; per-row refusals keep their sentences. | 4: user's raw input — "semua foto - foto yang saat ini ada di Media (kaya di section Media di page /nina/about)" |
| The Media folder's storage shape | A VIRTUAL node: pure tree-builder in `lib/`, addressed by a dedicated `?view=media` searchParam (not a reserved folder path — a real folder named "Media" in `nina_avatars` would collide, and folder predicates would misfile it). No subfolders, no move, no upload-to-folder; its verbs are the message-image verbs. | 6: surrounding convention — folders are `nina_avatars` metadata; `buildTree`'s contract and `tests/admin.filetree.test.ts` must keep meaning one table |
| Describe re-run over hand-written prose | One always-available button; a re-describe OVERWRITES (the admin is the same human who wrote it; no-confirmations ruling). The manual textarea remains the way to correct it back. | 6: surrounding convention — `describeNinaAvatarAction` already overwrites unconditionally; R1's "no bullshit confirmation" |
| The one side→subject mapping's home: Phase 2 minted `describeSubjectForSide` in `lib/nina/album.ts`; Phase 3 independently minted `ninaDescribeSubjectForSide` in `lib/nina/vision.ts` claiming to be the same "ONE mapping" | One function, Phase 2's, in `lib/nina/album.ts`; `vision.ts` imports it and exports nothing new | 3: the plans' own dependency order — Phase 2 runs first and cannot import Phase 3's, and both planners agreed the mapping belongs beside `photoSideOf` in the pure module (`vision.ts` → `album.ts` adds no import edge) |
| Where the unified describe panel mounts, given Phase 2's `AlbumSelectionPane`/`MediaPane` dispatcher | Inside BOTH arms, each passing its own table's closures; `MediaDescription.tsx` (Phase 2's interim seam) is deleted and `MediaPane` loses its eye toggle | 2: Phase 3's exit criteria — "one describe UI/UX on every photo; the icon row carries no describe button; the facts `<dl>` carries no null-ness row" — are only satisfiable per arm; a dispatcher-level mount would render a second `<aside>` outside the pane |
| `ImagesIcon`'s docstring + the shell test's trio comment: Phase 2 rewrote them post-purge, Phase 4 rewrote the same lines post-rename | Phase 4 owns both; Phase 2 leaves them prose-stale (comments naming a deleted `CameraIcon` between the phases) | 6: surrounding convention — comments naming routes must carry the routes' final labels, and the phase that runs last makes the final copy single-authored |

## Open Questions

None — every fork above was decided at planning time; nothing here blocks the launch.

## Rollback

- Per phase: `git revert` of the phase commit(s) on `feature/image-collection`; phases 1→2 are additive-then-removal, so reverting 2 restores `/admin/photos` only if 1 is reverted with it (phase 1 leaves `/admin/photos` untouched and green, so 2 is the first behavior-loss point).
- Whole set: delete the branch and worktree; `origin/main` is untouched until the set lands.
- No data backout is ever needed: no migration, and every blob-writing flow (replace, add, adopt) pre-exists with its release rules.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f IMAGE_COLLECTION_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f IMAGE_COLLECTION_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan IMAGE_COLLECTION_PLAN.md
