# Plan: copy-admin-link button in the client full-view image overlay

**Slug:** copy-admin-media-link
**Date:** 2026-10-01 10:49:38 (WIB)
**Analysis:** `20261001-104938-K7P2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/copy-admin-media-link`
**Branch:** `feature/copy-admin-media-link` (base: `origin/main` @ `5b51454`)
**Phases:** 4
**Status:** phases 1, 2, 3 of 4 complete (phase 4 in flight)
**Coordinator:** `orch-copy-admin-media-link`

---

## Why

The user's rationale, verbatim:

> you know, in the admin page, we have this link:
> https://runins.site/admin/nina?view=media , and here admin can click on one image, and do several things on that image, like:
> - crop it for profpic view
> - set it as profpic
> - set it as the anchor for image generation
> - download it
> - Photoshop this image
> - replace this image with a new manually uploaded image
>
> my requirement:
> - oftentimes, i am using full-view image from runins Nina chat (client page, not admin) through my phone , and here sometimes i realize i want to replace this image
> with a newly uploaded image. so, please add an icon only copy-admin-link button in the full-view image, to do these:
> - when user click that button, it will automatically copy an admin-media-view link to clipboard
> - then i can paste this admin-media-view link to Whatsapp, etc.
> - i will open this link on my Desktop
> - this link will directly open https://runins.site/admin/nina?view=media with that image selected.
> - i can directly replace this image using a new uploaded photo
>
> ---
>
> > [!IMPORTANT]
> > our current rules, regulations do not matter, change them if necessary. i just want this requirement to be achieved.
> > any entry point in the client app, where user can open full-view image MUST have this button. so user can open /nina/about - Foto profil , click one image, and it can do the copy-admin-link button as well.

Follow-up, sent mid-analysis, verbatim:

> so the admin gmail is only "mahfuzh74@gmail.com" . please hide this new copy-admin-link button for other gmail users

The second block is a standing instruction about precedence, and it is what licenses two changes this plan makes against existing recorded decisions: `lib/admin/albumDeepLink.ts:60-70` says a media deep link is "a query-layer change rather than a URL grammar" and declines to build one — this plan builds it; and `components/admin/FileExplorer.tsx:240` records that `deepLinkId` "is never non-null under `?view=media`" — this plan makes it non-null there. Both comments must be rewritten in the same commit as the behaviour they describe.

## Requirements

Post-reconciliation, and this is the table `create-task` reads — it matches each phase file's own
**Satisfies** line. No requirement moved between phases during reconciliation.

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | An **icon-only** copy-admin-link button in the full-view image overlay; tapping it puts an absolute admin link to *that* photograph on the clipboard, pasteable into WhatsApp | 1, 3, 4 |
| R2 | The link opens `/admin/nina` **with that image already selected**, so the operator can Replace it immediately — `?view=media` for a conversation photograph | 1, 2 |
| R3 | **Every** client-app entry point onto a full-view Nina photograph carries the button — the chat overlay and `/nina/about` → "Foto profil" named explicitly | 4 |
| R4 | The button is **hidden for every signed-in user who is not the admin** — only the account on `ADMIN_EMAILS` sees it | 4 |

## Scope

**In scope**

- A URL grammar + absolute-link minter keyed on `PhotoPointerKind` (`'avatar' | 'image'`), in `lib/admin/albumDeepLink.ts`.
- A `locateNinaMediaPhoto` query mirroring `mediaCollectionScope` and `coalesce(last_replaced_at, created_at) DESC, id DESC`, resolving a re-share through `source_image_id` to its original.
- `/admin/nina` reading the new parameter on the **media** arm, and `FileExplorer` spending it with the media href.
- A shared icon-only `CopyAdminLinkButton`. **Clipboard-only** — a tap writes `navigator.clipboard` directly, with no `navigator.share` sheet — falling back to a selectable read-only field when the clipboard refuses, plus the tick and the `role="status"` live region borrowed from `ShareButton`.
- A second, separately-named row handle on `ViewerPhoto` — **`rowPointer?: PhotoPointer`** (its `id` is already the **turn** id).
- The button mounted on four client surfaces: the chat overlay, `/nina/about` → Foto profil, `/nina/about` → Media, and `/photo/[kind]/[id]`.
- **The admin gate (R4).** Each of those three server pages resolves `getAdminIdentity()` and threads **one nullable prop** — the admin link origin, which is `shareOrigin()` for the admin and `null` for everyone else. A `null` renders no control at all, so a non-admin's payload carries neither the button nor an origin.

**Out of scope**

- **Run screenshots.** `components/review/ScreenshotStrip.tsx` and `components/share/PhotoInclusionList.tsx` open `PhotoViewer` over `run_photos` rows, and `/admin/nina` holds no `run_photos` in either collection — there is no destination to link to. See `## Decisions`.
- **The public shared page** (`app/(public)/s/[token]/page.tsx`). It is a Server Component with plain links and no lightbox on purpose, it is not an authenticated client surface, and `tests/ui.photoViewer.test.ts` asserts it never imports `PhotoViewer`. It stays a non-caller.
- **Admin surfaces** (`SearchResultsGrid`, `ErrorLogList`). The user asked for the client app; the admin screens already sit one click from the collection.
- Any schema change, migration, or backfill. No `npm run db:migrate` in this set — **the repo has exactly one database and it is production.**
- **Any change to how admin-ness is decided.** `isAdminEmail` against `ADMIN_EMAILS` (`lib/env.ts:261`) is the existing and only predicate, and `getAdminIdentity()` (`lib/admin/requireAdmin.ts:52`) is the existing branch-don't-refuse caller. No new env var, no new list, and **no email literal in source**.
- Changing what the admin selection pane can *do* to a row. Every verb the user listed already ships; only arriving at the row is missing.

## Invariants

1. **The tree builds and `npm test` passes at the end of every phase.** Nothing is left half-wired.
2. **No schema change and no migration in this set.** Every new read is a single indexed `SELECT` scoped to `user_id`.
3. **`ViewerPhoto.id` keeps meaning the turn (job) id.** It is the handle `ChatScreen.tsx:700` and `NinaAboutScreen.tsx:753` pass to `ninaJobHref`. The admin link's handle is a *new, differently named* field — **`rowPointer`**, a `PhotoPointer` naming the table as well as the id. A phase that overloads `id` has broken the job-detail link on two surfaces.
4. **Invariant 5 holds:** no `description` — `glm-4.6v`'s private prose — crosses into a client component in any shape. The new field is an id.
5. **Invariant 9 holds:** the share origin is resolved server-side via `shareOrigin()` and threaded as a prop. **No `NEXT_PUBLIC_`, and no `window.location.origin`** — a link minted from the window would carry a preview hostname into WhatsApp. `SelectionPane`'s prop doc already spells the rule: *"Never `window.location`."*
6. **The admin verdict is a server fact and never a client one.** `getAdminIdentity()` is `server-only`; `isAdminEmail` reads env. Neither may cross into a client bundle, and **the admin address must never be written in source** — `lib/env.ts:149` records why it is env ("it is a personal address"). A literal `'mahfuzh74@gmail.com'` anywhere under `lib/`, `app/` or `components/` fails this plan. The origin and the verdict travel as **one nullable prop**, so hiding the control for a non-admin is structural: there is nothing to hide, because nothing was sent.
7. **`/nina`, `/nina/about` and `/photo/**` must keep rendering where `ADMIN_EMAILS` is unset.** This is a measured hazard, not a hypothetical: `isAdminEmail` (`lib/env.ts:261`) reaches `adminEnv()` → `load('admin', adminSchema)`, a **lazy group that throws** when the variable is missing — and `ADMIN_EMAILS` is Production-scope only in Vercel, so it is absent on every preview deployment and absent from this repo's `.env.local`. The early `email == null` return means a signed-OUT visitor is safe, but a signed-IN one is not. Dropping a bare `getAdminIdentity()` into these three pages would therefore 500 them for every signed-in user on preview and in a plain local run. The gate must answer **"not an admin"** rather than throw when the group is unconfigured.
8. **An absent handle renders nothing**, the promise `label`, `meta`, `actions` and `headerAction` all already make. `ScreenshotStrip`, `SheetSource` and `PhotoInclusionList` must stay byte-identical in behaviour, and `components/ui/PhotoViewer.test.tsx` holds that half.
9. **The admin link is a link, not an authorization.** `/admin/nina` is gated by `requireAdmin()` as its first statement and every read under it is `user_id`-scoped. The id in the URL is a shape-checked parameter, never a claim; a miss of any kind resolves silently rather than telling anyone which ids exist.
10. **The deep-link landing effect stays idempotent.** `history.replaceState` re-runs parameter watchers synchronously, so `spentDeepLink` must still guard a second entry, and no cleanup there may undo the landing.
11. **Comment-and-code agreement.** Two shipped comments assert the behaviour this plan inverts (`lib/admin/albumDeepLink.ts:60-70`, `components/admin/FileExplorer.tsx:240`). Each must be rewritten in the phase that invalidates it.
12. **The CI gate is the whole gate:** `ci:data-layer-guard`, `ci:f08-guard`, `ci:openrouter-guard`, `ci:client-secret-guard`, `ci:llm-payload-guard`, `ci:f11-guard`, `ci:schema-drift-guard`, then `format:check`, `lint`, `typecheck`, `test`, `build`. JSX comment blocks need a leading `*` on every continuation line or `ci:client-secret-guard` fails on the prose itself.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The admin-link URL grammar | R1, R2 | `lib/admin` | 2 | — | EASY | `.workflows/plan/copy-admin-media-link/phase-1.md` | `P1-ADM-A004` | — |
| 2 ✅ | `/admin/nina` honours a media deep link | R2 | `lib/nina/queries`, `app/admin`, `components/admin` | 6 | 1 | HARD | `.workflows/plan/copy-admin-media-link/phase-2.md` | `P1-NIN-A057` | — |
| 3 ✅ | The icon-only copy button, and the handle it reads | R1 | `components/ui` | 4 | 1 | NORMAL | `.workflows/plan/copy-admin-media-link/phase-3.md` | `P1-CU-A000` | — |
| 4 | Every client entry point carries it, admin-only | R1, R3, R4 | `components/nina`, `components/photo`, `app/nina`, `app/photo`, `lib/nina`, `lib/admin` | 13 | 1, 3 | HARD | `.workflows/plan/copy-admin-media-link/phase-4.md` | `P1-CN-A008` | — |

**The DAG, verified after reconciliation:** `1 → {2, 3}`, `3 → 4`. Every edge points backward.
Phase 4 also consumes phase 1's minter, but only *through* phase 3's button — it imports
`lib/admin/albumDeepLink.ts` nowhere — so that edge is transitive and the `Depends on` column says
`1, 3` for clarity rather than necessity.

**Phases 2 and 3 share no edge and no file** — they are the two halves that meet at phase 1's
grammar, and they run concurrently. Verified file-by-file after reconciliation: phase 2 touches
`lib/nina/queries/images.ts`, `lib/nina/queries.test.ts`, `tests/nina.mediaLocate.test.ts`,
`app/admin/nina/page.tsx`, `components/admin/FileExplorer.tsx`, `components/admin/FileExplorer.test.tsx`;
phase 3 touches `components/ui/PhotoViewer.tsx`, `components/ui/PhotoViewer.test.tsx` and two new
files under `components/ui/`. The intersection is empty. **Phase 4 touches no file owned by 1, 2 or
3** — in particular it does not edit `components/ui/PhotoViewer.tsx`,
`components/ui/CopyAdminLinkButton.tsx`, `lib/admin/albumDeepLink.ts`, or anything under
`lib/nina/queries/`; its one `lib/admin` file is the new `lib/admin/adminLinkOrigin.ts`.

### Phase 1 — The admin-link URL grammar
**Satisfies:** R1, R2
**Owns:** `lib/admin/albumDeepLink.ts` and its test. Adds the media-photo parameter key, a path builder for a media photograph, and **one absolute-link minter** that takes a `PhotoPointerKind` + id + origin and returns the `https://…/admin/nina?…` string — the album arm routing to the existing `?avatar=`, the media arm to the new key. Rewrites the module header's "there is no such read … adding one is a query-layer change rather than a URL grammar" paragraph, which this set makes false.
**Does not touch:** any query, any page, any component. No database, no `server-only` import — the module is imported by a client component and a Server Component alike, which is the constraint its header already states.
**Exit criteria:** the minter is exported, unit-tested over both kinds (including that an unknown/`'shot'` kind is refused rather than silently producing a media link), and `npm run typecheck` + `npm test` are green. Nothing imports it yet.

### Phase 2 — `/admin/nina` honours a media deep link
**Satisfies:** R2
**Owns:** `lib/nina/queries/images.ts` (`locateNinaMediaPhoto` + `NinaMediaPhotoLocation`), **`lib/nina/queries.test.ts`** (`BARREL_VALUE_EXPORTS` grows **110 → 111**, sorted, in the same commit as the query), `tests/nina.mediaLocate.test.ts` (new), `app/admin/nina/page.tsx` (read `NINA_MEDIA_PHOTO_PARAM` on the media arm, resolve it to a page, hand `deepLinkId` down from **either** arm, `pageOfOffset` takes a page size), `components/admin/FileExplorer.tsx` (the landing effect spends the parameter with the media href when `view === 'media'`, and `:240`'s comment is rewritten), and `components/admin/FileExplorer.test.tsx`. Six files.

**`lib/nina/queries.ts` needs NO edit and must not appear in the diff.** The analysis document's Impact Points row 3 asked for a "barrel re-export"; measured, that barrel is seventeen `export *` lines and nothing else, so the new query re-exports itself. The genuinely coupled file is the barrel's **frozen contract test**, `lib/nina/queries.test.ts`, whose `BARREL_VALUE_EXPORTS` is asserted with `toEqual` and goes red the moment the export exists.

**Does not touch:** `lib/nina/queries.ts`, `lib/admin/albumDeepLink.ts` (imported from, never edited), `components/ui/PhotoViewer.tsx`, anything under `components/admin/explorer/`, any `components/nina` or `components/photo` file, any client page. It mints no links — it only honours them.
**Exit criteria:** `/admin/nina?view=media&image=<id>` lands on the page holding that photograph with it selected and the media selection pane mounted; `lib/nina/queries.test.ts`'s `BARREL_VALUE_EXPORTS` reads 111 sorted names and `lib/nina/queries.ts` is unmodified; the offset mirrors `mediaCollectionScope` **and** the `coalesce(last_replaced_at, created_at) DESC, id DESC` sort key; a re-share id resolves through `source_image_id` to its original; a foreign, malformed, deleted or non-original id changes nothing and says nothing; the album `?avatar=` path is unchanged; `FileExplorer.tsx:240`'s comment is rewritten; gates green.

### Phase 3 — The icon-only copy button, and the handle it reads
**Satisfies:** R1
**Owns:** a new `components/ui/CopyAdminLinkButton.tsx` and its component test, plus the `ViewerPhoto` addition in `components/ui/PhotoViewer.tsx` — **`rowPointer?: PhotoPointer`**, a second, separately-named handle naming the row's table *and* its id — and the `components/ui/PhotoViewer.test.tsx` half that proves an absent handle still renders nothing. It also exports the control's four copy constants (`COPY_ADMIN_LINK_LABEL`, `_DONE`, `_FAILED`, `_FIELD`), which phase 4's two component suites import rather than re-spelling. Four files.
**Does not touch:** any caller. No `components/nina`, `components/photo`, `components/review`, `components/share` or `app/` file changes here — the button is built and tested in isolation, mounted in phase 4.
**Exit criteria:** the button takes a **required** non-null origin — R4's gate lives at the call sites in phase 4, so this component never has to ask who is looking; it renders icon-only with an `aria-label`/`title`, and a tap writes phase 1's absolute link **straight to `navigator.clipboard`** — `navigator.share` is never called, and a test proves it is not called even when the platform has it — showing the tick for the `ShareButton` hold and announcing through a `role="status"` live region, and falling back to a selectable read-only field when the clipboard refuses so the operator is never left with nothing; `ViewerPhoto.id` still means the turn id; the three review surfaces are unchanged; gates green.

### Phase 4 — Every client entry point carries it, admin-only
**Satisfies:** R1, R3, R4
**Owns:** a new `lib/admin/adminLinkOrigin.ts` (`resolveAdminLinkOrigin()`, `server-only`) and its suite `tests/admin.adminLinkOrigin.test.ts`; `lib/nina/chatphotos.ts` (`ChatSessionPhoto` gains **`rowPointer`**, populated from `attachId`) and `lib/nina/chatphotos.test.ts`; `components/nina/ChatScreen.tsx` (`headerAction` becomes a **cluster** — the new button beside the existing job link) and `ChatScreen.test.tsx`; `components/nina/NinaAboutScreen.tsx` (both mappers stop dropping the row id; the **album** arm gains a `headerAction` where it is `undefined` today) and `NinaAboutScreen.test.tsx`; `components/photo/PhotoDeepLinkScreen.tsx`, `app/photo/[kind]/[id]/page.tsx` and `tests/photo.deepLink.test.ts`; and the **admin-origin threading** in `app/nina/page.tsx` and `app/nina/about/page.tsx`. **Thirteen files.**

**`components/nina/usePhotoViewer.ts` needs no change** — the hook returns the `ChatSessionPhoto[]` that `ChatScreen` hands straight to `PhotoViewer`, so widening `ChatSessionPhoto` is all the threading there is. The draft listed it conditionally; it is now out of scope.

**The R4 gate, concretely.** This phase adds a small `server-only` resolver — one function, one home under `lib/admin/` — that answers `string | null`: `shareOrigin()` when `getAdminIdentity()` (`lib/admin/requireAdmin.ts:52`) returns an identity, and `null` both when it does not **and when the admin env group is unconfigured** (invariant 7 — `isAdminEmail` throws there, and these three pages may not). The three server pages call that resolver beside the reads they already run, and pass **one nullable prop** — `shareOrigin()` when the identity is non-null, `null` otherwise. Each client surface renders the control only when that prop is non-null. One prop, not two: a separate `isAdmin` boolean alongside an always-sent origin would ship the origin to non-admins for no reader, and would let the two drift. The admin address is **not** written anywhere in this phase — `isAdminEmail`/`ADMIN_EMAILS` is the only test (invariant 6).

**Does not touch:** `components/ui/PhotoViewer.tsx`, `components/ui/CopyAdminLinkButton.tsx`, `lib/admin/albumDeepLink.ts`, anything under `lib/nina/queries/`, `components/nina/usePhotoViewer.ts`, `lib/env.ts`, `components/review/ScreenshotStrip.tsx`, `components/share/PhotoInclusionList.tsx`, `app/(public)/s/[token]/page.tsx`, and nothing under `components/admin` or `app/admin`.

**Exit criteria:** for the admin session, the button is present and copies a working link in the chat overlay, in `/nina/about` → Foto profil, in `/nina/about` → Media, and on `/photo/[kind]/[id]` (its `'avatar'` and `'image'` arms); the existing job-detail link still renders beside it on the two surfaces that have one; `/photo/shot/...` renders no button. **For a non-admin session every one of those headers is byte-identical to what ships today**, and a test proves it on at least the chat and about surfaces. The three run-screenshot/public surfaces are untouched; no email literal appears in the diff; gates green.

## Reconciliation Log

The four phase planners ran concurrently and could not read each other's output. Every row below was
resolved by **editing the phase plans in place**; nothing here is left for an executor to discover.

| # | Conflict | Class | Phases | Resolution |
|---|---|---|---|---|
| 1 | The `ViewerPhoto` / `ChatSessionPhoto` field naming the photograph's own row: phase 3 created `rowPointer?: PhotoPointer`, phase 4 planned against `adminPointer` for **both** types | Contract drift / duplicate naming | 3, 4 | **RULING (pre-decided by the analyzing session). `rowPointer` everywhere.** Rung 3, the plans' code blocks: phase 3 owns `components/ui/PhotoViewer.tsx` and had already pinned the spelling in `components/ui/PhotoViewer.test.tsx`, and `rowPointer` names what the value IS rather than which feature consumes it. `phase-4.md` rewritten: 39 occurrences, covering the `ChatSessionPhoto` declaration and doc comment in `lib/nina/chatphotos.ts`, the optimistic-row conditional spread, both `NinaAboutScreen` mappers, both Nina arms of `app/photo/[kind]/[id]/page.tsx`, both component-test stubs and every assertion. Its "Read this first" table now states the pinned names instead of guesses. `grep adminPointer phase-4.md` → 0 uses (two "do not write this" warnings only) |
| 2 | The media parameter constant: phase 1 creates `NINA_MEDIA_PHOTO_PARAM = 'image'`, phase 2 planned against `NINA_MEDIA_IMAGE_PARAM = 'image'` and flagged it as an assumption | Unmet assumption | 1, 2 | **RULING (pre-decided). `NINA_MEDIA_PHOTO_PARAM`.** Rung 3: phase 1 owns `lib/admin/albumDeepLink.ts`. The **value** already agreed (`'image'`) and phase 2 imports the constant rather than re-spelling the string, so only phase-2.md's prose, its Step 4a import line and its one `params[...]` subscript moved. No URL literal, comment or test fixture changed |
| 3 | Phase 3's control: share-sheet ladder vs. clipboard-only | Behavioural fork | 3, 4 | **RULING (pre-decided, and the user answered directly: *"yes, clipboard-only, no share sheet"*).** `phase-3.md` was already revised end to end — no `navigator.share`, no `AbortError` arm, two rungs, a `CopyIcon`, and a named regression test `'NEVER calls navigator.share, even on a platform that has one'`. The residue was in **phase 4**: its Step 7 implementer note still described "phase 3's clipboard ladder" reaching `navigator.share`. Rewritten to say clipboard-only and to give the `navigator.clipboard` stub recipe instead; a "the control is clipboard-only and that is final" handoff added |
| 4 | Impact Points row 3 asks for a `lib/nina/queries.ts` barrel re-export; phase 2 measured that the barrel is seventeen `export *` lines and needs no edit | Gap re-mapping / unowned impact point | 2 | **No edit to `lib/nina/queries.ts`; the coupled file is `lib/nina/queries.test.ts`.** Rung 6, the surrounding code as measured. `phase-2.md`'s Interface Contract, Files table and Leaves-alone list all now say so explicitly, and state the requirement loudly: `BARREL_VALUE_EXPORTS` is asserted with `toEqual` and must grow **110 → 111, sorted, in the same commit as the query**, or `npm test` is red. The index's phase-2 **Owns** and **Exit criteria** were rewritten to match. `lib/nina/queries.ts` is now declared off-limits to every phase |
| 5 | Phase 4's file count: the index said 11, the plan says 13, and `components/nina/usePhotoViewer.ts` was listed conditionally | Scope / count drift | 4 | **13 files; `usePhotoViewer.ts` is out of scope.** Rung 3: phase 4 read the hook and found it returns the `ChatSessionPhoto[]` that `ChatScreen` hands straight to `PhotoViewer`, so widening the type is all the threading there is. The index's phase table, **Owns** and **Does not touch** all updated; phase-4.md's "flag it to the reconciler" note replaced with the settled answer |
| 6 | Phase 4's two component suites planned to re-declare the Indonesian `aria-label` literal if phase 3 did not export one | Duplicate work / drift hazard | 3, 4 | **Import `COPY_ADMIN_LINK_LABEL` from `@/components/ui/CopyAdminLinkButton`.** Rung 3: phase 3 already exports it and says why — "so the test asserts the same strings the component renders rather than a second copy of them". Both of phase 4's conditional notes rewritten into a flat rule with the import line; phase 3 gained a handoff declaring the four constants part of its contract |
| 7 | With `rowPointer` substituted, phase 4's `Object.keys(photo).sort()` freeze in `lib/nina/chatphotos.test.ts` was no longer in lexicographic order (`adminPointer` had sorted first; `rowPointer` sorts seventh) | Knock-on from ruling 1 | 4 | Key list re-sorted to `attachId, id, indexWithinMessage, kind, label, messageId, rowPointer, url`, with a comment saying why the literal's order is load-bearing. Caught by re-reading the ledger after the rename, not by the rename itself |
| 8 | Phase 1's handoff left "keep the id or drop to `hrefForMediaView(page)`" open as "phase 2's call"; phase 2 had already made it | Stale open question across plans | 1, 2 | Phase 1's handoff rewritten to record phase 2's actual choice — spend through `FileExplorer`'s module-private `hrefForMediaView(page)`, dropping the id — and to note that `hrefForMediaPhoto` therefore has exactly one caller in the set (`adminPhotoLink`) and no importer under `components/admin`. Also records that phase 2 validates the incoming id with `isValidId`, not `ADMIN_AVATAR_ID_RE` |
| 9 | Whether the DAG is still honest after the edits above | Verification | all | **Verified.** Edges `1 → {2, 3}`, `3 → 4`, all backward. Phase 2 ∩ phase 3 = ∅. Phase 4 touches no file owned by 1, 2 or 3 — it does not edit `components/ui/PhotoViewer.tsx`, `components/ui/CopyAdminLinkButton.tsx`, `lib/admin/albumDeepLink.ts`, or anything under `lib/nina/queries/`; its only `lib/admin` file is the new `lib/admin/adminLinkOrigin.ts`. The DAG is now written into the index beneath the phase table |
| 10 | Whether every Impact Point (rows 1–15, including 14b and 14c) has exactly one owner | Gap sweep | all | **Verified, no gaps and no duplicates.** 1 → phase 1; 2, 3, 4, 5 → phase 2 (row 3 re-mapped, see #4); 6, 7 → phase 3; 8, 9, 10, 11, 12, 13, 14, 14b → phase 4; 14c → phase 4 (`lib/admin/adminLinkOrigin.ts`); row 15's test surfaces are split 1–4 by the files they belong to. Two frozen source scans named in row 15 — `tests/ui.photoViewer.test.ts` and `tests/nina.chatPhoto.test.ts` — are deliberately owned as **run-and-stay-green**, not as edits: phase 3 and phase 4 each state that they must pass unmodified |
| 11 | Whether any phase leaves the tree uncompilable on its own | Broken-build sweep | all | **Verified, given each phase's declared dependencies.** Phase 1 is additive with no importers (`npm run knip` reports three unused exports in the gap before phases 2–3 land — recorded in phase 1's handoffs as expected, not a defect). Phase 2 imports only phase 1's constant. Phase 3 imports only phase 1's minter and typechecks once phase 1 has landed, which its **Depends on** states. Phase 4 adds one required prop to each of three components and updates their one caller each in the same commit. No phase deletes or renames anything, so no deleted-then-used case exists anywhere in this set |
| 12 | Whether every requirement id is owned, and whether the index's Requirements table matches what the phase files claim | Unowned-requirement sweep | all | **Verified, no change needed.** R1 → phases 1, 3, 4; R2 → phases 1, 2; R3 → phase 4; R4 → phase 4. Each phase file's **Satisfies** line agrees with the column, and no phase's steps serve an `R` outside its own line. No requirement moved between phases, so no `Satisfies` line was widened |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| "any entry point … MUST have this button" vs. run screenshots having no admin destination | Nina photographs only — `avatar` and `image`. `ScreenshotStrip` and `PhotoInclusionList` get no button; `/photo/shot/<id>` renders none. | 5: the user's raw input. The destination the requirement names is `/admin/nina?view=media`, whose two collections are `nina_avatars` and `nina_message_images`; `run_photos` is in neither, and both entry points the user named by hand are Nina surfaces. Building an admin collection for run screenshots is a new admin surface the requirement does not ask for. |
| Which handle carries the row id into the overlay | A **new, separately named** field on `ViewerPhoto`, not `id` | 1: plan invariant 3. `id` is the turn id on both Nina surfaces (`ChatScreen.tsx:700`, `NinaAboutScreen.tsx:753`); overloading it points `ninaJobHref` at the wrong table. |
| Absolute origin: `window.location.origin` vs. threaded `shareOrigin()` | `shareOrigin()`, resolved server-side and threaded as a prop | 1: plan invariant 5 / repo invariant 9. The link is pasted and opened elsewhere; on a preview deployment `window.location.origin` mints a hostname that dies at the next push, while `shareOrigin()` resolves to the stable production origin. `app/admin/nina/page.tsx:277` is the shipped precedent. |
| `headerAction` is already occupied on the chat and Media overlays | The slot returns a **cluster** of controls | 3: the plan's code blocks. `headerAction` is typed `(photo) => React.ReactNode` and rendered bare into a `flex shrink-0` row, so a fragment of two 44 px controls needs no change to `PhotoViewer`'s layout. |
| A re-shared chat row has no tile in `?view=media` (`mediaCollectionScope` is originals-only) | Resolve it through `source_image_id` to the original and select that | 6: surrounding convention. `lib/nina/queries/images.ts:673` already states that "a re-show is the same photograph, not a second one" — the original is the row whose bytes a Replace would change. |
| Where the new URL grammar lives | `lib/admin/albumDeepLink.ts` | 6: surrounding convention. `tests/admin.filetreeBarrel.test.ts` freezes `lib/admin/filetree`'s barrel at 35 names; that module's header records that the last two additions went here for exactly this reason. |
| Two shipped comments assert the behaviour this plan inverts | Rewrite each in the phase that invalidates it | 1: plan invariant 10. A comment that contradicts its own file is worse than no comment, and both are load-bearing explanations other work reads. |
| R4's gate: a client-side email check vs. a server-resolved prop | Server-resolved. `getAdminIdentity()` on each page; the verdict and the origin collapse into **one nullable prop**. | 1: plan invariant 6. `isAdminEmail` reads env and `getAdminIdentity` is `server-only`, so neither can run in the browser; and a nullable origin means a non-admin's payload carries nothing to hide. |
| R4: hardcode `mahfuzh74@gmail.com` vs. read `ADMIN_EMAILS` | Read `ADMIN_EMAILS` through the existing `isAdminEmail`. No email literal in source. | 5: the user's raw input, read with `lib/env.ts:149`. The user stated *who* the admin is, not *where to store it*; that address is already configured as env precisely because it is personal, and a second copy in source would diverge the day it changes. |
| `isAdminEmail` throws when `ADMIN_EMAILS` is unset, and these are client pages | A `server-only` resolver that treats an unconfigured admin group as **not an admin** and returns `null`, rather than letting the lazy env group throw | 1: plan invariant 7. Measured: `lib/env.ts:247-268` — `adminEnv()` calls `load('admin', adminSchema)`, which `fail()`s on a missing variable; the variable is Production-scope only and is absent from this repo's `.env.local`. A bare `getAdminIdentity()` on `/nina` would 500 every signed-in user on every preview deployment. Hiding a button is never worth taking the chat screen down. |
| Share sheet first (my phase-3 exit criteria, by analogy to `ShareButton`) vs. "automatically copy … to clipboard" (the user's words) | **Clipboard-only. No `navigator.share`.** | 5: the user's raw input — and confirmed directly when the planner surfaced the conflict: *"yes, clipboard-only, no share sheet"*. The user described a precise flow (copy → paste into WhatsApp → open on desktop); a share sheet is an extra tap and invites sending to the wrong target. The share-first exit criterion was my own drafting error by analogy, so it does not get to outrank the requirement it was meant to serve. |
| R4 on `/photo/[kind]/[id]` — a push-notification landing with no shell | Gated the same way as the other three. | 6: surrounding convention. It is a client entry point onto a full-view Nina photograph (R3), and its page is a Server Component that can call `getAdminIdentity()` as cheaply as the other two. |
| **The row handle's name on `ViewerPhoto` and `ChatSessionPhoto`** — phase 3 wrote `rowPointer`, phase 4 wrote `adminPointer` | **`rowPointer` everywhere, on both types.** | 3: the plans' code blocks. Phase 3 owns `components/ui/PhotoViewer.tsx` and had already pinned the spelling in `components/ui/PhotoViewer.test.tsx`; and a field on a shared UI type should say what the value IS, not which feature happens to consume it. Reconciliation Log #1. **`adminPointer` must not appear anywhere in this set.** |
| **The media parameter constant's name** — phase 1 wrote `NINA_MEDIA_PHOTO_PARAM`, phase 2 assumed `NINA_MEDIA_IMAGE_PARAM` | **`NINA_MEDIA_PHOTO_PARAM`**, value `'image'`. | 3: the plans' code blocks. Phase 1 owns `lib/admin/albumDeepLink.ts`. The value never differed, and phase 2 imports the constant rather than re-spelling the string, so only the binding moved. Reconciliation Log #2. |
| **Where the "barrel re-export" work actually lands** — the analysis says `lib/nina/queries.ts`; the barrel is seventeen `export *` lines | **`lib/nina/queries.ts` is NOT edited. `lib/nina/queries.test.ts`'s `BARREL_VALUE_EXPORTS` grows 110 → 111, sorted, in the same commit as the query.** | 6: the surrounding code, measured. The barrel re-exports the new name automatically; what breaks is the frozen `toEqual` contract test, and that is the file the work belongs in. Leaving the analysis's wording in place would have produced a no-op edit and a red suite. |
| **Whether phase 4 touches `components/nina/usePhotoViewer.ts`** — the draft index listed it conditionally | **It does not. Phase 4 is 13 files and the hook is out of scope.** | 3: the plans' code blocks. The hook returns the `ChatSessionPhoto[]` that `ChatScreen` hands straight to `PhotoViewer`, so widening `ChatSessionPhoto` is the whole of the threading. A conditional file in a scope list is a file two sessions both think they may edit. |
| **The Indonesian `aria-label` in phase 4's two component suites** — import phase 3's constant, or re-declare the literal | **Import `COPY_ADMIN_LINK_LABEL` from `@/components/ui/CopyAdminLinkButton`.** Phase 3's four copy constants are part of its exported contract. | 3: the plans' code blocks. Phase 3 exports them with the reason written down — "so the test asserts the same strings the component renders rather than a second copy of them". A second copy goes green against the old words the day the wording changes. |
| **The canonical URL a spent MEDIA deep link is replaced with** — keep the id (`hrefForMediaPhoto(id)`) or drop it (`FileExplorer`'s module-private `hrefForMediaView(page)`) | **Drop the id: `hrefForMediaView(page.page)`.** Phase 1's handoff left this open as "phase 2's call"; phase 2 made it and the index now records it. | 3: the plans' code blocks. It mirrors the album arm exactly — `hrefForFolder(page.folder, page.page)` likewise drops `?avatar=` — so both arms spend their parameter into "where we actually are", and a reload re-derives nothing. Consequence, recorded so nobody treats it as dead code: `hrefForMediaPhoto` has exactly one caller in this set, phase 1's own `adminPhotoLink`. |
| **Phase 4's `NinaAboutScreen` suite clicking the real button under happy-dom** — stub the component, or give it a clipboard | **Give it a clipboard**: install `navigator.clipboard.writeText` in `beforeEach` and delete the own-property in `afterEach`, as phase 3's own suite does. Never `vi.mock` `CopyAdminLinkButton`. | 3: the plans' code blocks. The point of those cases is that the real control mounts through the real gate; stubbing it would prove only that a stub renders. The draft's instruction to "stub the ladder" also assumed a `navigator.share` rung that the clipboard-only ruling deleted. |

## Open Questions

_None._ Every fork above was decided on a stated rung, including the seven the reconciler settled
across the four concurrently-written phase plans. Every requirement id has at least one owning phase
(R1 → 1, 3, 4; R2 → 1, 2; R3 → 4; R4 → 4), so there is no unowned-`R` residue either. No branch in this set is irreversible: there is no migration, no backfill, no write to production data, and no published history rewritten — the whole set is additive source on a feature branch.

## Rollback

**As a whole:** `git branch -D feature/copy-admin-media-link` and delete the worktree. Nothing in this set writes to the database, the blob store, or any Vercel env, so there is no state to unwind.

**Per phase:**
- Phase 1 — revert the commit. The module is additive and has no importers until phases 2 and 3 land.
- Phase 2 — revert the commit. The album `?avatar=` path is untouched, and a media link minted by phases 1/3/4 degrades to the behaviour that ships today: the operator lands on `/admin/nina?view=media` page 1 with nothing selected, and finds the photograph by eye.
- Phase 3 — revert the commit. The button has no mount points until phase 4.
- Phase 4 — revert the commit. All four overlays return to the header they ship today; the job-detail link is restored by the same revert.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f COPY_ADMIN_MEDIA_LINK_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows, resumable on any machine:

    /analyze-orchestrator -f COPY_ADMIN_MEDIA_LINK_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan COPY_ADMIN_MEDIA_LINK_PLAN.md
