# Phase 6: Folder maintenance: create, rename, move, delete

**Plan set:** `ADMIN_ALBUM_FILE_MANAGER_PLAN.md`
**Analysis:** `20260904-131215-A3F7_code_analyzer.md`
**Satisfies:** R1 — *"make the photos much more structured and easier to maintain."* Phases 4 and 5
gave the album structure; this phase is the *maintenance* half of that sentence.
**Depends on:** Phase 5 (and transitively 1, 2, 4)
**Difficulty:** NORMAL
**Package:** `lib/admin` (primary), `components/admin`

---

## Goal

After this phase `/admin/nina` can reorganise itself: a folder can be created, renamed, moved to a
different parent, and deleted with everything under it; one or more selected photos can be moved
into a folder or removed in bulk. Every one of those is a `requireAdmin()`-gated Server Action that
goes through phase 1's statements, never copies a blob, and never lets her be left without a face.
The two rules that make delete safe — *the current photo cannot be removed* and *row first, blob
second, best-effort and logged* — are enforced in code and argued in the docstrings.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. This phase is purely additive.

**Renames:** nothing.

**Creates:**

> **RECONCILED (round 1) — `lib/admin/folderPath.ts` is NOT created.** This phase's draft wrote a
> fourth folder-path module (`folderDepth`, `folderName`, `folderParent`, `joinFolderPath`,
> `isInFolderTree`) alongside phase 1's bounds in `lib/admin/avatars.ts` and phase 2's grammar in
> `lib/admin/filetree.ts`. All of it collapses onto `lib/admin/filetree.ts`, and **this phase's
> reason for splitting is what decided the direction**: *nothing under `components/` in this repo
> reaches `zod`*, and a module-level `z.object(...)` is a side effect no bundler tree-shakes, so the
> pure path helpers must live somewhere a `'use client'` component can import them. `filetree.ts` is
> exactly that module — zero imports by design, already unit-tested, and already the home of the
> normaliser these helpers operate on the output of. So the split survives; only the file name
> changes, and the twin definitions do not ship.
>
> The mapping, for the implementer:
>
> | draft (`lib/admin/folderPath.ts`) | reconciled (`lib/admin/filetree.ts`) |
> |---|---|
> | `folderDepth(folder)` | `folderDepth(path)` — identical, root is 0 |
> | `folderName(folder)` | `folderName(path)` — **note:** returns `NINA_FOLDER_ROOT_LABEL` (`'Album'`) for the root, where `folderName('')` returned `''`. Every caller here guards the root first (`isRoot ? 'the album root' : …`), so no call site changes; the one test case asserting `folderName('') === ''` becomes `folderName('') === NINA_FOLDER_ROOT_LABEL` |
> | `folderParent(folder)` | `folderParent(path)` — identical |
> | `joinFolderPath(parent, segment)` | `joinFolderPath(...parts)` — variadic, and it normalises its result, which is strictly safer here |
> | `isInFolderTree(candidate, root)` | `isInFolderTree(candidate, root)` — **added to `filetree.ts` by the reconciler**, with the same inclusive semantics and the same load-bearing `/` in the prefix test, now case-folded like every other comparison in that module |
>
> Phase 2 also gained `sanitiseFolderSegment(raw): string | null` — the exported face of a function
> it already had privately — which is the one helper this phase's **Requires** asked it for.

- `lib/admin/folderOps.ts` **(new file, pure)** — the Zod schemas for the six folder operations
  and the refusal decisions behind them:
  - `ADMIN_FOLDER_OP_MAX_IDS` (const, `500`)
  - `folderCreateSchema`, `folderRenameSchema`, `folderMoveSchema`, `photoMoveSchema`,
    `folderDeleteSchema`, `photoRemoveSchema`
  - types `FolderCreateInput`, `FolderRenameInput`, `FolderMoveInput`, `PhotoMoveInput`,
    `FolderDeleteInput`, `PhotoRemoveInput`
  - `planFolderCreate`, `planFolderRename`, `planFolderMove` → `FolderPlan`
  - `CurrentPhotoRef`, `describeCurrentPhoto`, `currentPhotoRefusal`, `currentPhotoKeptNote`
- `tests/admin.folderOps.test.ts` **(new file)** — both modules' rules as unit tests (invariant 6).
- `lib/admin/ninaAlbumActions.ts` — six new exported actions, **appended below phase 4's work**:
  - `createNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult>`
  - `renameNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult>`
  - `moveNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult>`
  - `moveNinaAvatarsAction(input: unknown): Promise<AdminActionResult>`
  - `deleteNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult>`
  - `removeNinaAvatarsAction(input: unknown): Promise<AdminActionResult>`
  - plus two **non-exported** module-scope helpers, `ADMIN_BLOB_DEL_BATCH` and `reapAvatarBlobs`
    (legal in a `'use server'` module: the compiler constrains *exports*, not module scope —
    `lib/nina/album.ts:49-62` states the rule)
- `components/admin/FolderMenu.tsx` **(new file)** — the per-folder menu and its four inline panels.
- `components/admin/PhotoMoveBar.tsx` **(new file)** — move / remove for phase 5's selection.

**Signature changes:**

- `AdminActionResult` (`lib/admin/ninaAlbumActions.ts:41`) gains **three additive optional fields**
  and loses none: `folder?: string`, `count?: number`, `note?: string`.

  > **RECONCILED (round 1): there is no collision here, and nothing needs unioning.** Phase 4 does
  > *not* append to `AdminActionResult` — it declares two new interfaces that **extend** it
  > (`AdminBatchRegisterResult`, `AdminManifestResult`), which is the better shape for its case
  > because `inserted` and `entries` belong to one action each and would otherwise be optional
  > fields on every result in the file. So this phase is the only editor of the interface itself,
  > and its three fields are the whole diff. Both phases' additions are additive and every existing
  > consumer keeps type-checking either way.

**Requires (from earlier phases)** — every signature below is quoted from what that phase actually
writes after round 1, not from this phase's draft assumptions. Six of them changed.

- **Phase 2, `lib/admin/filetree.ts`** — the path arithmetic and the grammar's bounds. This is where
  `lib/admin/folderPath.ts` went (see the Creates note), and it replaces the draft's request to
  phase 1 for `ADMIN_FOLDER_MAX_DEPTH` / `ADMIN_FOLDER_SEGMENT_MAX`:
  ```ts
  export const NINA_FOLDER_ROOT = ''
  export const NINA_FOLDER_ROOT_LABEL = 'Album'
  export const NINA_FOLDER_MAX_DEPTH = 8
  export const NINA_FOLDER_MAX_SEGMENT_CHARS = 64

  export function folderDepth(path: string): number
  /** The last segment, or `NINA_FOLDER_ROOT_LABEL` for the album root. */
  export function folderName(path: string): string
  export function folderParent(path: string): string
  export function joinFolderPath(...parts: readonly string[]): string
  /** Inclusive: `root` is in its own tree, and the album root contains everything. */
  export function isInFolderTree(candidate: string, root: string): boolean
  /** One typed segment, sanitised, or `null` when nothing usable is left. */
  export function sanitiseFolderSegment(raw: string): string | null
  ```
  `filetree.ts` has **zero imports**, which is the property this phase's split depended on and the
  reason the collapse landed there rather than in `lib/admin/avatars.ts` (which imports
  `lib/nina/images.ts`) or in `lib/admin/schema.ts` (which imports `zod`).

- **Phase 4, `lib/admin/schema.ts`** — `folderPathSchema` and `albumFilenameSchema`, plus
  `avatarIdSchema` which already exists at `:35`. `folderPathSchema` wraps phase 2's
  `validateFolderPath` **and adds a `result.path === value` identity check**, so it REFUSES a
  non-canonical path rather than normalising one. That is what this phase's schemas want: a
  `parent` or a `folder` arriving from this phase's own UI is always a path the tree already
  rendered, so anything non-canonical is a bug, not input to repair.

  The folder-op object schemas stay **this phase's**, in `lib/admin/folderOps.ts`. The plan index
  gives phase 4 *"the folder-path schema"* only, phase 4 wrote only that, and the analysis's Impact
  Points row 13 (which said otherwise) is superseded — the index wins, as this phase's draft
  already argued.

- **Phase 1, `lib/nina/queries.ts`** — `NinaAvatarRow` carries `folder: string` and
  `filename: string | null`, and these are the statements this phase drives:
  ```ts
  export interface NinaAvatarFolderCount {
    folder: string
    /** NOTE: `photos`, not `count`. */
    photos: number
  }
  export function listNinaAvatarFolders(userId: string): Promise<NinaAvatarFolderCount[]>

  export interface NinaAvatarBlobRef {
    id: string
    blobUrl: string
    pathname: string
    /** NOTE: `thumbUrl`, not `thumbBlobUrl`. */
    thumbUrl: string | null
    thumbPathname: string | null
  }

  export type NinaFolderRenameResult =
    | { ok: true; moved: number }
    | { ok: false; reason: 'root' | 'cycle' }
  /** Re-root a subtree: every row whose folder is `from` or starts with `from + '/'`.
   *  Rename and move are the SAME statement — renaming is moving to a sibling path. */
  export function renameNinaAvatarFolder(
    userId: string, from: string, to: string,
  ): Promise<NinaFolderRenameResult>

  /** Re-folder specific rows. Returns how many actually moved. `[]` runs no statement. */
  export function moveNinaAvatarsToFolder(
    userId: string, ids: readonly string[], folder: string,
  ): Promise<number>

  /** Recursive delete. `is_current = false` IS IN THE WHERE. Returns only what it deleted. */
  export function deleteNinaAvatarsInFolderTree(
    userId: string, folder: string,
  ): Promise<NinaAvatarBlobRef[]>

  /** Bulk delete by id. `is_current = false` IS IN THE WHERE. Returns only what it deleted. */
  export function deleteNinaAvatars(
    userId: string, ids: readonly string[],
  ): Promise<NinaAvatarBlobRef[]>

  /* ---- the three `nina_folders` statements — see the note below ---- */

  /** `ON CONFLICT DO NOTHING` on `(user_id, folder)`. Filters the album root itself. Returns how
   *  many declarations were NEW; `[]` runs no statement. */
  export function declareNinaFolders(
    userId: string, folders: readonly string[],
  ): Promise<number>

  /** The `nina_folders` half of a rename. Same `folderSubtree` predicate as the rows. `0` is a
   *  SUCCESS — it means the folder had no declarations under it. */
  export function renameNinaFolderSubtree(
    userId: string, from: string, to: string,
  ): Promise<number>

  /** Undeclare a folder and its descendants. CONDITIONAL — call it only when the subtree is
   *  actually empty. See the delete action for why. */
  export function deleteNinaFolderSubtree(
    userId: string, folder: string,
  ): Promise<number>
  ```
  `getCurrentNinaAvatar(userId)` is used as it already exists (`lib/nina/queries.ts:903`).

  > **ADDED AFTER RECONCILIATION, by the owner's decision: empty folders are durable.** The
  > reconciled plan had no `nina_folders` table, and this phase's `createNinaAlbumFolderAction`
  > wrote nothing at all — it validated a path, refused a collision, and left the folder to live in
  > the explorer's client state until a photograph landed in it. That is no longer what it does.
  > Three call sites change and one docstring is rewritten:
  >
  > · **create** declares the folder *and its whole ancestor chain* (`folderAncestors`), so
  >   creating `a/b/c` cannot leave `a/b` undeclared and therefore able to vanish when `c` goes;
  > · **rename** rewrites the declarations after it moves the rows — rows first, so a half-failure
  >   leaves a stray empty folder the operator can see and delete, rather than a duplicate;
  > · **delete** undeclares the subtree **only when `current == null`**, which is the same fact the
  >   return value already reads to decide where to send the explorer next. Undeclaring a folder
  >   that still holds her current photograph would create the one disagreement
  >   `listNinaAvatarFolders`'s UNION hides — invisible until that photograph left.
  >
  > `planFolderCreate`'s *"AN EMPTY FOLDER IS CLIENT STATE"* section is now false and is rewritten
  > in Step 2. Do not leave it standing beside code that contradicts it.

  > **RECONCILED (round 1) — four differences from the draft, and two of them were gaps this phase
  > found correctly.**
  > 1. `moveNinaAvatarFolder(userId, from, to) -> number` is **`renameNinaAvatarFolder`**, returning
  >    a discriminated result rather than a bare count. Read `result.ok`, and read
  >    `result.moved === 0` as a **success** — a folder can hold nothing but empty subfolders. Its
  >    `'root'` / `'cycle'` refusals duplicate checks `planRelocation` already makes with better
  >    messages; that redundancy is deliberate on phase 1's side and costs this phase nothing.
  > 2. `deleteNinaAvatars` (plural, by id) and `moveNinaAvatarsToFolder` (plural) **were missing
  >    from phase 1** — exactly as this phase's Handoffs predicted. They are added there rather
  >    than looped here, per this phase's own rule.
  > 3. `deleteNinaAvatarsInFolderTree` **replaces** phase 1's draft `deleteNinaAvatarFolder`, which
  >    returned `{ ok: false, currentId }` and refused the whole subtree when her current photo was
  >    inside it. That could express this phase's default answer and **not** its `keepCurrent`
  >    answer, so the refusal decision moved entirely here: `currentPhotoInFolder` +
  >    `currentPhotoRefusal` already own it, and the statement now deletes every non-current row
  >    and reports what it took. Nothing in this phase's action bodies changes as a result — the
  >    pre-check was always here — only the return type it destructures.
  > 4. `NinaAvatarBlobRef.thumbBlobUrl` is **`thumbUrl`**. One line in `reapAvatarBlobs`.

- **Phase 4, `lib/admin/ninaAlbumActions.ts`** — its work is above this phase's in the file; this
  phase appends and restructures nothing. Phase 4's block ends with `listNinaAlbumManifestAction`
  and opens with a banner saying phase 6 appends below it (verified). Phase 4 also **replaces the
  import block at `:1-18`**, so this phase's import edit is an **addition to phase 4's version**,
  not a replacement of the original — Step 4 gives the merged block. The `console.error` tag for
  this plan set is `[f34]`; phase 4 uses the same.

- **Phase 5, `components/admin/FileExplorer.tsx` and `components/admin/explorer/FolderTree.tsx`** —
  the seams it promised, which are in those two files (not one). At `FolderTree`'s per-folder `Row`
  and at the end of its `<nav>`: the node's `path`, the full folder list, the node's `totalCount`, a
  "does this tree hold the current photo" flag, and the `hrefFor`/navigate affordance. In
  `FileExplorer`: the pending-folder state and the selection bar.

  > **RECONCILED (round 1): this phase acts on phase 5's SINGLE selection and does not widen it.**
  > The draft asked for `selectedIds` (an array) and `clearSelection` while also promising *"I do
  > not touch phase 5's selection model"*; phase 5 holds one `selectedId: string | null`, so those
  > two could not both hold. `PhotoMoveBar` reads `selectedId` and passes `ids: [selectedId]` — the
  > actions keep their array shape, so multi-select later is a client-only change. The plan index's
  > phase-6 scope is *"the create / rename / move / delete **folder** actions"* and never asked for
  > bulk photo operations, R1 says *"we can click **a** photo"*, and widening the model during a
  > three-way parallel edit of `FileExplorer.tsx` is the change most likely to conflict for the
  > least requirement served. Multi-select is phase 5's follow-up card.

**Leaves alone (owned by others):**

- `app/api/admin/nina/upload/route.ts`, and phase 4's `registerNinaAvatarsAction` / manifest /
  describe actions (Phase 4)
- `lib/db/schema.ts`, `drizzle/**` (Phase 1)
- `lib/nina/queries.ts` — I **call** phase 1's statements and add none (Phase 1)
- `lib/admin/filetree.ts` (Phase 2), `lib/admin/schema.ts` (Phase 4)
- `app/admin/nina/page.tsx` (Phase 5 owns it; nothing here needs a new page prop)
- `components/admin/CropStudio.tsx`, `components/admin/CircleFrame.tsx` (reused verbatim)
- the per-**photo** action menu item list in phase 5's components — that is where phase 7 puts
  *"Share link to Nina"*. Mine is the per-**folder** menu and a selection bar; different files.
- `components/nina/**`, `app/nina/**`, `lib/nina/actions.ts`, `lib/nina/albumActions.ts`

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/folderOps.ts` | create | pure: the six op schemas + the refusal decisions (collision, cycle, depth, current photo). The path arithmetic is **imported** from `lib/admin/filetree.ts`, not re-declared |
| `tests/admin.folderOps.test.ts` | create | unit tests for every refusal rule this phase decides. The path helpers are phase 2's and are tested in `tests/admin.filetree.test.ts` |
| `lib/admin/ninaAlbumActions.ts` | modify | `AdminActionResult` gains 3 optional fields (`:41-53`); imports **added to** phase 4's block; six actions + a blob reaper appended at end of file (after phase 4's block) |
| `components/admin/FolderMenu.tsx` | create | the per-folder menu: New subfolder / Rename / Move to… / Delete, each an inline panel |
| `components/admin/PhotoMoveBar.tsx` | create | the selection bar: Move this photo to… / Remove it |
| `components/admin/explorer/FolderTree.tsx` + `components/admin/FileExplorer.tsx` | modify | three insertions at phase 5's two seams (folder menu in the tree's `Row`; pending-folder state and the selection bar in the explorer); no other change |

> **`lib/admin/folderPath.ts` is gone from this table** — see the Interface Contract. Six rows,
> seven paths.

---

## Implementation Steps

### Step 1: (removed) — the path arithmetic is phase 2's

**File:** none. `lib/admin/folderPath.ts` is **not created.**

The draft wrote five path helpers here in a new zero-import module, for a reason that was exactly
right and is preserved: **nothing under `components/` in this repo reaches `zod`.** Every schema
module (`lib/admin/schema.ts`, `lib/profile/schema.ts`, `lib/review/schema.ts`,
`lib/nina/schema.ts`, …) lives on the server side of that line, `lib/admin/folderOps.ts` has to
import `zod` and phase 4's `folderPathSchema`, and a module-level `z.object(...)` is a side effect
no bundler tree-shakes — so a client component importing one path helper from `folderOps.ts` would
pull the whole validator into the `/admin` bundle. That argument stands and is why the split
exists.

What the reconciler changed is only **which** zero-import module the helpers live in. Phase 2's
`lib/admin/filetree.ts` already is one — by design, because it is the unit-tested module and
`vitest.config.ts` runs `environment: 'node'` — and it already holds the normaliser these helpers
operate on the output of. Three phases had written this grammar (phase 1 in `lib/admin/avatars.ts`,
phase 2 in `filetree.ts`, this one in `folderPath.ts`), and one home had to win; `filetree.ts` is
the only candidate that satisfies both constraints at once. So:

- `FolderMenu.tsx` and `FolderTree.tsx` import `folderName`, `folderParent`, `joinFolderPath` and
  `isInFolderTree` from `@/lib/admin/filetree`, which reaches no `zod` and no `server-only`.
- `lib/admin/folderOps.ts` imports the same names plus the bounds, and keeps `zod` to itself.
- The name mapping is the table in the Interface Contract. The only behavioural difference is
  `folderName('') === ''` becoming `folderName('') === 'Album'`, and every call site in this phase
  guards the root before it gets there.

**Impact:** one fewer module in the repo, and no twin definition of `isInFolderTree` for a later
editor to change in one place and not the other.

---

### Step 2: `lib/admin/folderOps.ts` — the schemas and the refusals

**File:** `lib/admin/folderOps.ts` (new)
**Change:** Every decision a folder operation makes that does not need the database goes here, so
it is unit-testable (invariant 6) and so the `'use server'` module in step 4 stays four lines of
plumbing per action. The Server Actions import from here and add only `requireAdmin()`, the reads,
the statement and the `revalidatePath`.

**Code:**

```ts
import { z } from 'zod'

import {
  folderDepth,
  folderName,
  folderParent,
  isInFolderTree,
  joinFolderPath,
  sanitiseFolderSegment,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
} from '@/lib/admin/filetree'
import { avatarIdSchema, folderPathSchema } from '@/lib/admin/schema'

/**
 * Folder *maintenance* — what a folder operation refuses, and why, decided without a database.
 *
 * R1's justification is one clause of the user's sentence: *"make the photos much more structured
 * and easier to maintain."* Phase 4 gave the album structure; this module is the maintenance half,
 * and every function in it exists because a maintenance operation on hundreds of rows has exactly
 * one chance to be wrong.
 *
 * ── WHY A SEPARATE MODULE AND NOT `lib/admin/schema.ts` OR THE ACTION FILE ───────────────────
 * `lib/admin/ninaAlbumActions.ts` carries `'use server'`, and a `'use server'` module may export
 * **only async functions** — `lib/nina/album.ts:49-62` states that rule and why it forced
 * `NINA_ATTACH_MAX_CHARS` out of `albumActions.ts`. A Zod schema and a pure predicate are not
 * async functions, so they cannot be exported from there; and invariant 6 wants them exported
 * *somewhere*, because "UI behaviour worth testing is a pure function in `lib/`" and a rule like
 * "a folder cannot be moved inside itself" is precisely the kind of thing that is either tested or
 * shipped broken. `lib/admin/schema.ts` is phase 4's file in this plan set, so a second home for
 * the six object schemas is the smaller cost — and it lets the schemas sit beside the planners
 * that consume their output.
 *
 * The path arithmetic is one module further out, in `lib/admin/filetree.ts` (phase 2), and the
 * reason is the same one that made this module separate: this one imports `zod`, nothing under
 * `components/` in this repo reaches `zod`, and a module-level `z.object(...)` is a side effect no
 * bundler removes — so `FolderMenu` has to be able to reach `isInFolderTree` without reaching this
 * file. `filetree.ts` is zero-import by design and is the repo's one folder-path grammar.
 *
 * ── MOVING A FOLDER IS AN UPDATE OF ONE COLUMN. NO BLOB IS COPIED. ──────────────────────────
 * The plan's Scope section commits to it: *"Blob layout stays flat. Folders are a column, not a
 * blob prefix — so a rename is one UPDATE rather than an O(files) copy-and-delete."* Blob
 * pathnames keep the flat `nina/<userId>/avatar-<id>.<ext>` shape that `lib/admin/avatars.ts`
 * documents, and `isAdminAvatarRequestPathname` keeps guarding exactly that shape. Which means
 * renaming a folder holding four hundred photographs writes four hundred `folder` cells and moves
 * zero bytes; the alternative is four hundred copies and four hundred deletes, each of which can
 * half-fail, on an operation whose entire user-visible effect is a different word in a tree. The
 * refusals below are the price: because the column is the folder, two folders that come to share a
 * path are indistinguishable afterwards, so a collision has to be refused rather than merged.
 */

/**
 * How many photos one move or remove may name. A Server Action request body is capped at 1 MB by
 * the framework, and 500 nanoid(12) strings is ~8 KB — so this is not a body bound, it is a blast
 * radius: it is the number of rows one mis-click can move or destroy, and 500 is already more than
 * a screenful of the paginated grid phase 5 renders.
 */
export const ADMIN_FOLDER_OP_MAX_IDS = 500

/* ============================================================================
 * The six operations' input schemas
 * ==========================================================================*/

/**
 * `folderPathSchema` is phase 4's, and it is the *only* thing that decides whether a path is a
 * legal path — depth, total length, segment grammar, normalisation. These objects add the shape
 * around it and nothing else, so there is one answer to "is this a folder" in the codebase.
 *
 * A `name` is NOT a `folderPathSchema`: it is one segment a human typed, and it is bounded here
 * only loosely (non-empty, at most the segment ceiling) because `sanitiseFolderSegment` is what
 * decides what survives of it, and a planner is where a sanitisation that leaves nothing becomes
 * a sentence the operator can read instead of a field error.
 */
const folderNameSchema = z.string().trim().min(1).max(NINA_FOLDER_MAX_SEGMENT_CHARS)

const avatarIdsSchema = z.array(avatarIdSchema).min(1).max(ADMIN_FOLDER_OP_MAX_IDS)

export const folderCreateSchema = z.object({
  parent: folderPathSchema,
  name: folderNameSchema,
})
export type FolderCreateInput = z.infer<typeof folderCreateSchema>

export const folderRenameSchema = z.object({
  folder: folderPathSchema,
  name: folderNameSchema,
})
export type FolderRenameInput = z.infer<typeof folderRenameSchema>

export const folderMoveSchema = z.object({
  folder: folderPathSchema,
  /** The new containing folder. `''` moves it to the album root. */
  parent: folderPathSchema,
})
export type FolderMoveInput = z.infer<typeof folderMoveSchema>

export const photoMoveSchema = z.object({
  ids: avatarIdsSchema,
  folder: folderPathSchema,
})
export type PhotoMoveInput = z.infer<typeof photoMoveSchema>

/**
 * `keepCurrent` is the operator's explicit second answer to the refusal in `currentPhotoRefusal`,
 * and it is a required boolean rather than a defaulted one on purpose: a client that forgets the
 * field gets the safe branch by shape error, not by a default that could be flipped later.
 *
 * `folder` is checked for emptiness by the ACTION rather than by a `.min(1)` here, for the same
 * reason `factPurgeSchema.confirm` is a bare `z.string()` at `lib/admin/schema.ts:139-146`: "the
 * album root is not a folder" is a sentence the operator should read, not a field error.
 */
export const folderDeleteSchema = z.object({
  folder: folderPathSchema,
  keepCurrent: z.boolean(),
})
export type FolderDeleteInput = z.infer<typeof folderDeleteSchema>

export const photoRemoveSchema = z.object({
  ids: avatarIdsSchema,
  keepCurrent: z.boolean(),
})
export type PhotoRemoveInput = z.infer<typeof photoRemoveSchema>

/* ============================================================================
 * The planners
 * ==========================================================================*/

/** Either the folder path the operation should write, or the sentence explaining the refusal. */
export type FolderPlan = { ok: true; folder: string } | { ok: false; error: string }

const UNUSABLE_NAME =
  'That name leaves nothing usable. Letters, numbers, spaces, dots, dashes and underscores.'

/**
 * `New subfolder`. Refuses a name that sanitises away, a depth over the bound, and a path that
 * already exists.
 *
 * ── AN EMPTY FOLDER IS DURABLE, AND THIS FUNCTION ONLY DECIDES ITS PATH ─────────────────────
 * **Rewritten.** This docstring used to say the opposite — that a folder with no photos had
 * nothing to store, so "create" could not write a row and the folder lived in the explorer's state
 * until the first photograph landed in it. That was true of the reconciled plan and is no longer
 * true of the code: the owner decided empty folders are durable, so phase 1 added a `nina_folders`
 * table and `createNinaAlbumFolderAction` now writes a declaration through `declareNinaFolders`.
 *
 * What is left for THIS function is the half that was always the real work, and it is unchanged:
 * agree with the server on the normalised path, and refuse a collision against folders that
 * already exist — which is genuine server work because the page's folder list may be stale. It
 * still writes nothing and still knows nothing about tables; the action calls it, then persists
 * what it returns.
 *
 * **`folders` must be the UNIONED listing** (`listNinaAvatarFolders`, which merges the photograph
 * rows with the declarations), not either source alone. Against the declarations alone this would
 * happily "create" a folder that already holds three hundred photographs; against the photograph
 * rows alone it would let the operator create the same empty folder twice, and the second call
 * would be an `ON CONFLICT DO NOTHING` no-op reported as a success. `existingFolders` is the
 * helper that guarantees it.
 */
export function planFolderCreate(args: {
  parent: string
  name: string
  folders: readonly string[]
  maxDepth?: number
}): FolderPlan {
  const { parent, name, folders, maxDepth = NINA_FOLDER_MAX_DEPTH } = args

  const segment = sanitiseFolderSegment(name)
  if (segment == null || segment.length === 0) return { ok: false, error: UNUSABLE_NAME }

  const folder = joinFolderPath(parent, segment)
  const depth = folderDepth(folder)
  if (depth > maxDepth) {
    return {
      ok: false,
      error: `The album nests ${maxDepth} folders deep and that would be ${depth}.`,
    }
  }
  if (folders.some((existing) => existing === folder)) {
    return { ok: false, error: `${folder} already exists.` }
  }
  return { ok: true, folder }
}

/** Rename in place: the leaf changes, the parent does not. */
export function planFolderRename(args: {
  folder: string
  name: string
  folders: readonly string[]
  maxDepth?: number
}): FolderPlan {
  const { folder, name, folders, maxDepth = NINA_FOLDER_MAX_DEPTH } = args

  const segment = sanitiseFolderSegment(name)
  if (segment == null || segment.length === 0) return { ok: false, error: UNUSABLE_NAME }

  return planRelocation(folder, joinFolderPath(folderParent(folder), segment), folders, maxDepth)
}

/** Move to a different parent: the leaf is kept, the prefix changes. */
export function planFolderMove(args: {
  folder: string
  parent: string
  folders: readonly string[]
  maxDepth?: number
}): FolderPlan {
  const { folder, parent, folders, maxDepth = NINA_FOLDER_MAX_DEPTH } = args
  if (folder === '') {
    return { ok: false, error: 'The album root is not a folder — it cannot be moved or renamed.' }
  }
  return planRelocation(folder, joinFolderPath(parent, folderName(folder)), folders, maxDepth)
}

/**
 * Rename and move are the same UPDATE with a different destination, so they are the same four
 * refusals.
 *
 * 1. **The album root is not a folder.** There is no row whose folder is the root's parent.
 * 2. **A folder cannot land inside itself.** `A/B` → `A/B/C` is not a cycle in the data (the
 *    column would simply hold longer strings), but it is a cycle in the operator's intent, and
 *    what it actually produces is every descendant re-rooted one level below where it started,
 *    forever, one level deeper each time. Refuse it and name both paths.
 * 3. **The destination tree must be EMPTY.** This is the strictest rule here and the most
 *    important. A rename onto an occupied path is a *merge*, and a merge of a folder column is
 *    not undoable: rename `Bali` onto `Trips` and the rows that were in each are afterwards
 *    indistinguishable, so "rename it back" cannot separate them again. Every other operation in
 *    this phase is reversible by running its inverse; this one would not be, so it is refused.
 *    Merging is still available, deliberately, as the *explicit* gesture: select the photos and
 *    move them, which is a choice made per photo and visible in the grid while it is made.
 * 4. **The deepest descendant must still fit.** Moving `Trips/Bali` (which holds
 *    `Trips/Bali/2024/Ubud`) into `Archive/Old/Trips` shifts every descendant down by the
 *    difference in depth, so the bound has to be checked against the deepest row in the subtree
 *    and not against the destination. Checking only the destination is the bug this exists to
 *    avoid: it passes, and then the tree holds paths phase 4's own schema would reject.
 *
 * A destination equal to the source is a no-op that returns `ok` — an idempotent rename is the
 * operator pressing Save without having typed anything, and a refusal there would be noise.
 */
function planRelocation(
  from: string,
  to: string,
  folders: readonly string[],
  maxDepth: number,
): FolderPlan {
  if (from === '') {
    return { ok: false, error: 'The album root is not a folder — it cannot be moved or renamed.' }
  }
  if (to === '') return { ok: false, error: 'A folder needs a name.' }
  if (to === from) return { ok: true, folder: to }

  if (isInFolderTree(to, from)) {
    return { ok: false, error: `${from} cannot be moved inside itself (${to}).` }
  }

  const occupied = folders.find((existing) => isInFolderTree(existing, to))
  if (occupied != null) {
    return {
      ok: false,
      error:
        `${to} already exists${occupied === to ? '' : ` (${occupied} is inside it)`}. ` +
        'Two folders cannot be merged by renaming one onto the other — the photos would ' +
        'no longer be tellable apart. Pick a different name, or select the photos and move ' +
        'them across.',
    }
  }

  const deepest = deepestDepthAfter(from, to, folders)
  if (deepest > maxDepth) {
    return {
      ok: false,
      error:
        `That would put photos ${deepest} folders deep and the album stops at ${maxDepth}. ` +
        'Move the subfolders out first, or pick a shallower destination.',
    }
  }

  return { ok: true, folder: to }
}

/**
 * The depth of the deepest path in `from`'s subtree once the subtree is re-rooted at `to`. Every
 * descendant shifts by the same amount — the difference in depth between the two roots — so this
 * is one pass and no string surgery.
 */
function deepestDepthAfter(from: string, to: string, folders: readonly string[]): number {
  const shift = folderDepth(to) - folderDepth(from)
  let deepest = folderDepth(to)
  for (const folder of folders) {
    if (!isInFolderTree(folder, from)) continue
    const after = folderDepth(folder) + shift
    if (after > deepest) deepest = after
  }
  return deepest
}

/* ============================================================================
 * The current photo
 * ==========================================================================*/

/** Just enough of her current avatar to name it in a refusal. Assignable from `NinaAvatarRow`. */
export interface CurrentPhotoRef {
  id: string
  folder: string
  filename: string | null
}

/**
 * How a refusal names the photo it is protecting. The filename, because that is the word the
 * operator sees in the grid; the id as the fallback, because a row that predates phase 1's
 * `filename` column has nothing else to be called.
 */
export function describeCurrentPhoto(current: CurrentPhotoRef): string {
  const name = current.filename ?? current.id
  return `${name} (${current.folder === '' ? 'the album root' : current.folder})`
}

/**
 * ── THE CURRENT PHOTO CANNOT BE REMOVED ─────────────────────────────────────────────────────
 * `deleteNinaAvatar`'s WHERE clause has refused it since F33 and says why in as many words
 * (`lib/nina/queries.ts:1116-1128`): *"`eq(ninaAvatars.isCurrent, false)` in the WHERE clause is
 * what makes 'zero current avatars' unreachable rather than repaired."* The action file repeats
 * it at `lib/admin/ninaAlbumActions.ts:182-184`: *"the current photo cannot be removed... which is
 * what makes 'zero current avatars' unreachable rather than repaired."* Phase 1's recursive and
 * batch deletes carry the same clause, so at the SQL layer a folder delete over four hundred rows
 * already cannot take her face.
 *
 * What SQL cannot do is be honest about it. A recursive delete that quietly leaves one row behind
 * looks like a delete that half-worked, and the operator's next move is to try again — which
 * quietly leaves the same row behind. So this function makes the stand explicit, in two steps,
 * before any row is touched:
 *
 *   · **By default it refuses the whole operation** and names the photo and the reason. Nothing is
 *     deleted, so the folder is exactly as it was and either fix — make another photo current, or
 *     move that one out — is available with nothing to undo first. Refusing beats half-succeeding
 *     precisely because a partial delete of hundreds of rows has no inverse.
 *   · **With `keepCurrent` the operator has read that sentence and answered it.** Then the delete
 *     runs and leaves the folder holding exactly that one photo, and the result says so via
 *     `currentPhotoKeptNote` — so "the folder is still there" is explained rather than discovered.
 *
 * `current` is `null` when her current photo is not in scope at all, which is the ordinary case
 * and the one that must not cost a branch at the call site.
 */
export function currentPhotoRefusal(
  current: CurrentPhotoRef | null,
  keepCurrent: boolean,
): string | null {
  if (current == null) return null
  if (keepCurrent) return null
  return (
    `That would remove her current photo — ${describeCurrentPhoto(current)} — and she is never ` +
    'left without a face, so that one row cannot be deleted. Make another photo current first, ' +
    'or delete the rest and leave it behind.'
  )
}

/** The other half of the same honesty: what stayed, and why, after a `keepCurrent` delete. */
export function currentPhotoKeptNote(current: CurrentPhotoRef): string {
  return (
    `${describeCurrentPhoto(current)} stayed behind — it is her current photo and cannot be ` +
    'removed. Make another photo current, then delete it.'
  )
}
```

**Impact:** New module, no consumers until step 4. `npm run lint` and `npm run typecheck` will
fail until phase 1's two constants, phase 2's `sanitiseFolderSegment` and phase 4's
`folderPathSchema` exist — all of which are `depends_on` and assumed landed.

---

### Step 3: `tests/admin.folderOps.test.ts` — the refusals, tested

**File:** `tests/admin.folderOps.test.ts` (new)
**Change:** Invariant 6 in one sentence: *"UI behaviour worth testing is a pure function in
`lib/`."* Every rule in steps 1 and 2 is a rule about hundreds of rows, so each one gets a case. vitest is
`environment: 'node'` with no jsdom, which is exactly why these live in `lib/` and not in a
component.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  currentPhotoKeptNote,
  currentPhotoRefusal,
  describeCurrentPhoto,
  planFolderCreate,
  planFolderMove,
  planFolderRename,
} from '@/lib/admin/folderOps'
import {
  folderDepth,
  folderName,
  folderParent,
  isInFolderTree,
  joinFolderPath,
  NINA_FOLDER_ROOT_LABEL,
} from '@/lib/admin/filetree'

/**
 * Phase 6's refusals. Every case here is a rule that, if it broke, would break hundreds of rows in
 * one action call — a merge that cannot be undone, a subtree re-rooted inside itself, or her face
 * deleted. The planners are pure, so this suite is the whole test surface of the phase.
 *
 * MAX_DEPTH is passed explicitly rather than read from `NINA_FOLDER_MAX_DEPTH`, so a change to
 * phase 2's bound does not silently change what these cases assert.
 *
 * The `describe('path arithmetic')` block below is a **thin sanity check on the four helpers this
 * phase's planners lean on hardest**, not their test suite — those functions are phase 2's and
 * `tests/admin.filetree.test.ts` proves them case by case, including the casing and
 * Windows-separator behaviour this block does not exercise. It is kept because a planner that
 * assembles a path is only correct if the arithmetic under it is, and reading both in one file is
 * what makes the refusal cases below legible.
 */

const MAX_DEPTH = 4

describe('path arithmetic', () => {
  it('counts depth with the album root at zero', () => {
    expect(folderDepth('')).toBe(0)
    expect(folderDepth('Bali')).toBe(1)
    expect(folderDepth('Trips/Bali/2024')).toBe(3)
  })

  it('splits leaf and parent, and the root has neither', () => {
    expect(folderName('Trips/Bali')).toBe('Bali')
    expect(folderName('Bali')).toBe('Bali')
    /* Phase 2's `folderName` labels the album root rather than returning `''` — the tree pane
     * renders it. Every planner here guards `folder === ''` before it asks for a leaf. */
    expect(folderName('')).toBe(NINA_FOLDER_ROOT_LABEL)
    expect(folderParent('Trips/Bali/2024')).toBe('Trips/Bali')
    expect(folderParent('Bali')).toBe('')
    expect(folderParent('')).toBe('')
  })

  it('joins onto the root without a leading slash', () => {
    expect(joinFolderPath('', 'Bali')).toBe('Bali')
    expect(joinFolderPath('Trips', 'Bali')).toBe('Trips/Bali')
  })

  it('contains by segment, not by prefix — Bali does not contain Bali2024', () => {
    expect(isInFolderTree('Bali', 'Bali')).toBe(true)
    expect(isInFolderTree('Bali/2024', 'Bali')).toBe(true)
    expect(isInFolderTree('Bali2024', 'Bali')).toBe(false)
    expect(isInFolderTree('Trips', 'Bali')).toBe(false)
  })

  it('puts everything inside the album root', () => {
    expect(isInFolderTree('', '')).toBe(true)
    expect(isInFolderTree('Trips/Bali', '')).toBe(true)
  })
})

describe('planFolderCreate', () => {
  const folders = ['', 'Trips', 'Trips/Bali']

  it('creates under a parent', () => {
    expect(
      planFolderCreate({ parent: 'Trips', name: 'Japan', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Japan' })
  })

  it('creates at the album root', () => {
    expect(planFolderCreate({ parent: '', name: 'Studio', folders, maxDepth: MAX_DEPTH })).toEqual({
      ok: true,
      folder: 'Studio',
    })
  })

  it('refuses a name that sanitises away', () => {
    const plan = planFolderCreate({ parent: '', name: '///', folders, maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
  })

  it('refuses a folder that already exists', () => {
    const plan = planFolderCreate({ parent: 'Trips', name: 'Bali', folders, maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('Trips/Bali')
  })

  it('refuses one level past the depth bound', () => {
    const deep = 'a/b/c/d'
    const plan = planFolderCreate({ parent: deep, name: 'e', folders: [deep], maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain(String(MAX_DEPTH))
  })
})

describe('planFolderRename', () => {
  const folders = ['Trips', 'Trips/Bali', 'Trips/Bali/2024', 'Archive']

  it('renames the leaf and keeps the parent', () => {
    expect(
      planFolderRename({ folder: 'Trips/Bali', name: 'Indonesia', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Indonesia' })
  })

  it('is a no-op when the name is unchanged', () => {
    expect(
      planFolderRename({ folder: 'Trips/Bali', name: 'Bali', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Bali' })
  })

  it('refuses renaming the album root', () => {
    const plan = planFolderRename({ folder: '', name: 'Album', folders, maxDepth: MAX_DEPTH })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('album root')
  })

  it('refuses a rename that would merge two folders', () => {
    const plan = planFolderRename({
      folder: 'Trips',
      name: 'Archive',
      folders,
      maxDepth: MAX_DEPTH,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('merged')
  })

  it('refuses a rename onto a path that only exists as an ancestor of rows', () => {
    const plan = planFolderRename({
      folder: 'Archive',
      name: 'Trips',
      folders: ['Archive', 'Trips/Bali'],
      maxDepth: MAX_DEPTH,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('Trips/Bali')
  })
})

describe('planFolderMove', () => {
  const folders = ['Trips', 'Trips/Bali', 'Trips/Bali/2024', 'Archive']

  it('re-parents and keeps the leaf', () => {
    expect(
      planFolderMove({ folder: 'Trips/Bali', parent: 'Archive', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Archive/Bali' })
  })

  it('moves to the album root', () => {
    expect(
      planFolderMove({ folder: 'Trips/Bali', parent: '', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Bali' })
  })

  it('is a no-op when the parent is unchanged', () => {
    expect(
      planFolderMove({ folder: 'Trips/Bali', parent: 'Trips', folders, maxDepth: MAX_DEPTH }),
    ).toEqual({ ok: true, folder: 'Trips/Bali' })
  })

  it('refuses moving a folder inside itself', () => {
    const plan = planFolderMove({
      folder: 'Trips',
      parent: 'Trips/Bali',
      folders,
      maxDepth: MAX_DEPTH,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('inside itself')
  })

  it('checks the depth bound against the DEEPEST descendant, not the destination', () => {
    // Destination `Archive/Trips` is depth 2, which fits. Its deepest descendant afterwards is
    // `Archive/Trips/Bali/2024` at depth 4 — and with maxDepth 3 that is the case a
    // destination-only check would wave through.
    const plan = planFolderMove({
      folder: 'Trips',
      parent: 'Archive',
      folders,
      maxDepth: 3,
    })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.error).toContain('4 folders deep')
  })

  it('allows the same move when the bound is one deeper', () => {
    expect(
      planFolderMove({ folder: 'Trips', parent: 'Archive', folders, maxDepth: 4 }),
    ).toEqual({ ok: true, folder: 'Archive/Trips' })
  })
})

describe('the current photo', () => {
  const current = { id: 'aB3_dEf-hI9k', folder: 'Trips/Bali', filename: 'nina-01.jpg' }

  it('names the photo and its folder', () => {
    expect(describeCurrentPhoto(current)).toBe('nina-01.jpg (Trips/Bali)')
    expect(describeCurrentPhoto({ ...current, filename: null })).toBe('aB3_dEf-hI9k (Trips/Bali)')
    expect(describeCurrentPhoto({ ...current, folder: '' })).toBe('nina-01.jpg (the album root)')
  })

  it('does not refuse when her photo is out of scope', () => {
    expect(currentPhotoRefusal(null, false)).toBeNull()
    expect(currentPhotoRefusal(null, true)).toBeNull()
  })

  it('refuses by default, and names the photo and the fix', () => {
    const refusal = currentPhotoRefusal(current, false)
    expect(refusal).not.toBeNull()
    expect(refusal).toContain('nina-01.jpg')
    expect(refusal).toContain('Make another photo current')
  })

  it('proceeds only when the operator answered the refusal', () => {
    expect(currentPhotoRefusal(current, true)).toBeNull()
    expect(currentPhotoKeptNote(current)).toContain('stayed behind')
  })
})
```

**Impact:** One new suite. It exercises `sanitiseFolderSegment` transitively, so a phase 2 spelling
change surfaces here rather than in the browser.

---

### Step 4: The six Server Actions

**File:** `lib/admin/ninaAlbumActions.ts` — the import block at `:1-18`, `AdminActionResult` at
`:41-53`, and an appended section after the end of `deleteNinaAvatarAction` (currently `:203`,
below whatever phase 4 appended)
**Change:** Extend the result interface with three optional fields, then append the six actions and
one shared blob reaper. Nothing above the appended section is restructured — phase 4's batch
register, manifest and describe actions keep their order and their bodies.

**Code — the import block (replaces `lib/admin/ninaAlbumActions.ts:1-18`, on top of whatever phase
4 added to it):**

```ts
'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { folderAncestors, folderParent, isInFolderTree } from '@/lib/admin/filetree'
import {
  currentPhotoKeptNote,
  currentPhotoRefusal,
  folderCreateSchema,
  folderDeleteSchema,
  folderMoveSchema,
  folderRenameSchema,
  photoMoveSchema,
  photoRemoveSchema,
  planFolderCreate,
  planFolderMove,
  planFolderRename,
  type CurrentPhotoRef,
} from '@/lib/admin/folderOps'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  albumManifestSchema,
  avatarBatchRegisterSchema,
  avatarIdSchema,
  avatarRegisterSchema,
  cropWriteSchema,
  type AvatarBatchRecord,
} from '@/lib/admin/schema'
import { NINA_ADMIN_MANIFEST_MAX } from '@/lib/nina/album'
import { clampCrop, cropForWrite, resolveCrop } from '@/lib/nina/crop'
import {
  declareNinaFolders,
  deleteNinaAvatar,
  deleteNinaAvatars,
  deleteNinaAvatarsInFolderTree,
  deleteNinaFolderSubtree,
  getCurrentNinaAvatar,
  getNinaAvatar,
  insertNinaAvatarAsCurrent,
  insertNinaAvatars,
  listNinaAvatarFolders,
  listNinaAvatarManifest,
  moveNinaAvatarsToFolder,
  renameNinaAvatarFolder,
  renameNinaFolderSubtree,
  setCurrentNinaAvatar,
  setNinaAvatarDescription,
  updateNinaAvatarCrop,
  type NinaAvatarBlobRef,
} from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'
```

The seven names this phase adds are `folderParent` / `isInFolderTree` (from
`@/lib/admin/filetree`), the whole `@/lib/admin/folderOps` group, and `deleteNinaAvatars`,
`deleteNinaAvatarsInFolderTree`, `listNinaAvatarFolders`, `moveNinaAvatarsToFolder`,
`renameNinaAvatarFolder` and `type NinaAvatarBlobRef` from `@/lib/nina/queries`. Everything else is
phase 4's or was already there.

> Reconciler note: phase 4 edits this same block (it adds its batch-register schema and phase 1's
> plain batch insert, and it may remove `describeNinaImages` from `registerNinaAvatarAction`).
> Union the two import lists; nothing here removes an existing import.

**Code — `AdminActionResult` (replaces `lib/admin/ninaAlbumActions.ts:41-53`, unioned with phase
4's additions):**

```ts
/** One shape for every action, so the client has one branch and no `unknown`. */
export interface AdminActionResult {
  ok: boolean
  error?: string
  /** Set by `registerNinaAvatarAction` so the client can select the new row immediately. */
  id?: string
  /** Set by the describe actions, so the card can show the prose without a refetch. */
  description?: string
  /**
   * Phase 6. The folder the explorer should be looking at once this operation has landed: the
   * folder just created, the folder's new path after a rename or a move, or the deleted folder's
   * parent. The explorer's `?folder=` may name a folder that no longer exists the moment a delete
   * or a rename succeeds, so the action that changed it is the thing that knows where to go.
   */
  folder?: string
  /**
   * Phase 6. How many rows the operation actually touched — moved, or deleted. Reported rather
   * than assumed from the input, because the current photo can be left behind and a row can have
   * gone away between the read and the write.
   */
  count?: number
  /**
   * Phase 6. A true thing about the outcome that is not a failure: what a `keepCurrent` delete
   * left behind, and why. Separate from `error` because `ok` is still `true` — the operation did
   * what was asked, and the operator needs the sentence anyway.
   */
  note?: string
}
```

**Code — appended at the end of `lib/admin/ninaAlbumActions.ts`:**

```ts
/* ============================================================================
 * Phase 6 — folder maintenance. Appended; nothing above this line changed.
 * ==========================================================================*/

/**
 * Folder maintenance: create, rename, move, delete, and the bulk move and remove that go with
 * them. R1's second half — *"make the photos much more structured and easier to maintain."*
 *
 * ── EVERY DECISION THAT DOES NOT NEED THE DATABASE IS IN `lib/admin/folderOps.ts` ────────────
 * This module carries `'use server'`, so it may export only async functions and cannot hold a Zod
 * schema or a pure predicate at all (`lib/nina/album.ts:49-62` states the rule). That constraint
 * turns out to be the right architecture anyway: the collision, cycle and depth refusals are the
 * part of this phase most worth testing, and `tests/admin.folderOps.test.ts` tests them without a
 * database. What is left here per action is four moves — gate, validate, plan, run — and it is
 * meant to stay that thin.
 *
 * ── MOVING A PHOTO OR A FOLDER IS AN UPDATE OF THE FOLDER COLUMN. NO BLOB IS COPIED. ────────
 * The plan's Scope section: *"Blob layout stays flat. Folders are a column, not a blob prefix — so
 * a rename is one UPDATE rather than an O(files) copy-and-delete."* So `renameNinaAvatarFolder`
 * rewrites the `folder` cell of every row in a subtree and touches no object in the store; the
 * blob pathnames stay the flat `nina/<userId>/avatar-<id>.<ext>` that `lib/admin/avatars.ts`
 * documents and `isAdminAvatarRequestPathname` guards, and neither the tree nor the grid can tell.
 * Renaming a folder of four hundred photographs is therefore one statement rather than four
 * hundred copies and four hundred deletes, each of which could half-fail — and a half-failed
 * O(files) rename is a folder that exists twice with the photos split between the two.
 *
 * ── ROW FIRST, BLOB SECOND, BEST-EFFORT AND LOGGED ──────────────────────────────────────────
 * `deleteNinaAvatarAction:176-183` sets the rule and the reason: *"A failed `del` leaves an
 * orphaned object, which is recoverable... A deleted blob under a live row is a permanently broken
 * image in her album."* Both halves of it get bigger here and both stay right. See
 * `reapAvatarBlobs` for what a *batch* of `del`s makes of it.
 */

/**
 * How many blob URLs go into one `del` call. `del` takes an array, so the whole reap could be one
 * request — and that is exactly what makes the chunk worth having: `del` is all-or-nothing per
 * call, so a single 800-URL request that fails orphans 800 objects, while eight 100-URL requests
 * that fail on the fourth orphan 100 and delete 700. Since the failure mode of a blob reap is
 * "objects nothing references survive in the store", smaller batches are strictly less exposure
 * for the same number of bytes moved.
 */
const ADMIN_BLOB_DEL_BATCH = 100

/**
 * Delete the objects behind rows that are already gone. **Never called before the rows are
 * deleted**, and never allowed to fail an action.
 *
 * ── WHY A BATCH MAKES THE ORPHAN EXPOSURE BIGGER, AND WHY IT IS STILL THE RIGHT ORDER ───────
 * `deleteNinaAvatarAction:176-183` weighed one object: *"A failed `del` leaves an orphaned object,
 * which is recoverable (and is what `scripts/blob-reap.mjs` exists for, once it is taught the
 * `nina/` prefix — ruling D4's one follow-up card). A deleted blob under a live row is a
 * permanently broken image in her album."* A recursive folder delete weighs hundreds, and a batch
 * of `del`s is where a partial failure is most likely: the store is a network service, the call is
 * not transactional with Postgres, and nothing about it is atomic across chunks. So what happens
 * when it half-fails is stated here rather than discovered:
 *
 *   · The rows are already gone, which is the outcome the operator asked for. The album is
 *     correct, the tree is correct, and nothing renders a broken image.
 *   · The objects for the chunks that failed stay in the store, referenced by nothing. They cost
 *     storage and they show up in the free tier's usage number; they cannot corrupt anything.
 *   · Every failed chunk is logged with its URLs, so the orphans are *named* in the function log
 *     and not merely inferable from a diff of the store against the table.
 *   · Reaping them is `scripts/blob-reap.mjs`'s job — and it **still does not know the `nina/`
 *     prefix** (ruling D4's open card, restated in the plan's Rollback section). This phase widens
 *     the exposure that card describes from "a failed single delete" to "a failed chunk of a
 *     hundred", which is worth saying out loud and is not a reason to reverse the order: the
 *     reverse order trades a recoverable orphan for a permanently broken image.
 *
 * The thumbnail is reaped beside the original because phase 4 wrote it as a second object and
 * nothing else references it. A row with no thumbnail (anything that predates phase 1) simply
 * contributes one URL instead of two.
 */
async function reapAvatarBlobs(rows: readonly NinaAvatarBlobRef[]): Promise<void> {
  const urls = rows.flatMap((row) =>
    row.thumbUrl == null ? [row.blobUrl] : [row.blobUrl, row.thumbUrl],
  )
  if (urls.length === 0) return

  for (let start = 0; start < urls.length; start += ADMIN_BLOB_DEL_BATCH) {
    const chunk = urls.slice(start, start + ADMIN_BLOB_DEL_BATCH)
    try {
      await del(chunk)
    } catch (cause) {
      console.error(
        `[f34] ${chunk.length} album rows deleted, blobs left behind ` +
          '(blob:reap does not know the nina/ prefix yet — ruling D4)',
        chunk,
        cause,
      )
    }
  }
}

/** Her current photo, but only when it is inside `folder`'s tree. `null` otherwise. */
async function currentPhotoInFolder(
  userId: string,
  folder: string,
): Promise<CurrentPhotoRef | null> {
  const row = await getCurrentNinaAvatar(userId)
  if (row == null || !isInFolderTree(row.folder, folder)) return null
  return { id: row.id, folder: row.folder, filename: row.filename }
}

/** Her current photo, but only when its id is in `ids`. `null` otherwise. */
async function currentPhotoAmong(
  userId: string,
  ids: readonly string[],
): Promise<CurrentPhotoRef | null> {
  const row = await getCurrentNinaAvatar(userId)
  if (row == null || !ids.includes(row.id)) return null
  return { id: row.id, folder: row.folder, filename: row.filename }
}

/** Every folder that currently holds at least one row. The planners' collision universe. */
async function existingFolders(userId: string): Promise<string[]> {
  return (await listNinaAvatarFolders(userId)).map((row) => row.folder)
}

/**
 * "New folder" — and the one action in this file that writes nothing.
 *
 * ── A FOLDER IS A COLUMN, SO AN EMPTY FOLDER HAS NOTHING TO STORE ───────────────────────────
 * `planFolderCreate`'s docstring carries the full argument; the short version is that there is no
 * `nina_folders` table because folders are the `folder` column of the rows in them, which is what
 * makes a rename one UPDATE. The consequence is that "create" cannot insert anything: the folder
 * becomes real when the first photo lands in it, and until then it lives in the explorer's state
 * and vanishes on reload. The explorer covers that by navigating into the new folder and pointing
 * the uploader at it, so the ordinary gesture is create → drop → real.
 *
 * What this action *does* do is worth a round trip anyway: it agrees with the server on the
 * normalised path (so the client and the server cannot spell the same folder two ways), it bounds
 * the depth against phase 1's constant, and it refuses a collision **against the folders that
 * exist right now** rather than against the list the page happened to render with.
 *
 * `revalidatePath` is called even though no row changed, deliberately: the folder list the tree
 * reads is a server read, a concurrent upload may have added folders since this page rendered, and
 * the re-render that ships in the action's own response (see the Next.js Server Actions guide:
 * `revalidatePath` includes a fresh RSC payload in the same roundtrip) is the cheapest way to make
 * the tree agree with the list this refusal was decided against.
 */
export async function createNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That folder name is out of range.' }

  const plan = planFolderCreate({
    parent: parsed.data.parent,
    name: parsed.data.name,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }

  /*
   * The write that makes the folder real. One row in `nina_folders`, and after it the folder
   * survives a reload with nothing in it — which is the whole reason that table exists.
   *
   * **The ancestors are declared too, and that is not defensive padding.** Creating `a/b/c` when
   * only `a` holds photographs must leave `a/b` existing as well, or the tree pane would show
   * `a`, synthesize `a/b` from `c`'s path, and then lose `a/b` the moment `c` is deleted — an
   * intermediate folder that vanishes while its parent and child both survive. `folderAncestors`
   * is phase 2's and returns every STRICT ancestor shallowest-first **with the album root included
   * as `''`** — which is fine to pass straight through, because `declareNinaFolders` filters the
   * root itself (`nina_folders` never stores it). Do not "tidy" that by slicing the first element
   * off here: the filter belongs in the one function that owns the rule.
   *
   * The return value (how many declarations were NEW) is deliberately dropped: `planFolderCreate`
   * has already refused a collision against the unioned listing, so a zero here means another tab
   * created the same folder between the read and this write — which is the outcome the operator
   * wanted either way, and reporting it as a failure would be a lie about the end state.
   */
  await declareNinaFolders(userId, [...folderAncestors(plan.folder), plan.folder])

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: 0 }
}

/**
 * Rename a folder — one UPDATE over the subtree, no blob touched.
 *
 * The refusals are `planFolderRename`'s and they are argued there: the album root is not a folder,
 * a rename onto an occupied path is an unmergeable merge, and the depth bound is checked against
 * the deepest descendant rather than the destination. A rename of a folder that holds no rows
 * (one the operator just created) updates zero rows and is still `ok` — there was nothing to
 * rename and the explorer renames its own pending entry.
 */
export async function renameNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderRenameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That folder name is out of range.' }

  const plan = planFolderRename({
    folder: parsed.data.folder,
    name: parsed.data.name,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }
  if (plan.folder === parsed.data.folder) return { ok: true, folder: plan.folder, count: 0 }

  /*
   * `renameNinaAvatarFolder` (phase 1's name — rename and move are one statement, because renaming
   * IS moving to a sibling path) returns a discriminated result, not a bare count.
   *
   * Its `'root'` and `'cycle'` refusals are the same two `planRelocation` already refused above,
   * with worse messages, so reaching them here would mean the planner and the statement disagree.
   * They are still handled rather than asserted away — phase 1 kept those guards deliberately, on
   * the `setCurrentNinaAvatar` posture that a cheap guard which could argue it is redundant is
   * still worth having, and the honest way to consume one is to consume it.
   *
   * **`moved: 0` is a SUCCESS**, not a failure: a folder can hold nothing but subfolders that hold
   * nothing, or — since `nina_folders` — can be a declared folder with no photographs in it at all.
   * Either way there are no rows to move and the rename still has to happen. Reporting it as an
   * error would make renaming an empty branch look broken.
   */
  const moved = await renameNinaAvatarFolder(userId, parsed.data.folder, plan.folder)
  if (!moved.ok) return { ok: false, error: 'That folder cannot be renamed to that.' }

  /*
   * The declarations follow the photographs, and BOTH halves are one rename.
   *
   * `renameNinaFolderSubtree` rewrites `nina_folders` with the same `folderSubtree` predicate
   * phase 1 uses for the rows — the same one deliberately, because a rename that matched the
   * photograph rows with `left()` and the declarations with `LIKE` would drift on exactly the
   * folder name (`100%`) that motivated `left()` in the first place.
   *
   * **Not in a transaction, and the failure mode is why that is tolerable.** These are two
   * statements over neon-http; if the second never runs, the photographs have moved and a stale
   * declaration is left at the old path. `listNinaAvatarFolders` UNIONs, so the visible result is
   * the new folder (carried by its photographs) plus an empty folder at the old name — untidy, and
   * fixable by deleting it, which is a state the operator can see and act on. The reverse order
   * would be worse: declarations at the new path with the photographs still at the old one reads
   * as two folders where one is a duplicate. Rows first, declarations second.
   *
   * Its count is dropped for the same reason `count` reports `moved.moved`: the operator asked
   * about photographs, and "0 declarations rewritten" is true of every folder that arrived by
   * being dropped.
   */
  await renameNinaFolderSubtree(userId, parsed.data.folder, plan.folder)

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: moved.moved }
}

/**
 * Move a folder under a different parent — the same UPDATE as a rename, with a different
 * destination, and the same four refusals for the same reasons (`planFolderMove`).
 *
 * `parent: ''` moves it to the album root, which is why the schema takes a `folderPathSchema` and
 * not a non-empty string: the root is a legal destination and an illegal *source*.
 */
export async function moveNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderMoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a folder path.' }

  const plan = planFolderMove({
    folder: parsed.data.folder,
    parent: parsed.data.parent,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }
  if (plan.folder === parsed.data.folder) return { ok: true, folder: plan.folder, count: 0 }

  /* One statement for both verbs — see `renameNinaAlbumFolderAction` above for why `moved: 0` is
   * a success and why the two data-layer refusals are handled rather than asserted away. */
  const moved = await renameNinaAvatarFolder(userId, parsed.data.folder, plan.folder)
  if (!moved.ok) return { ok: false, error: 'That folder cannot be moved there.' }

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: moved.moved }
}

/**
 * Move the selected photos into a folder. **An UPDATE of one column; no blob is copied.**
 *
 * No planner: nothing about this can collide (two photos in one folder is the normal state, not a
 * merge), nothing can cycle, and no descendant moves, so the destination's own bounds — depth,
 * length, grammar — are the whole check and `folderPathSchema` is where they live. This is also
 * the *sanctioned* way to merge two folders, which `planRelocation` refuses to do by rename: the
 * choice is made per photo, in front of the grid, and it is undone the same way.
 *
 * `count` is what the statement reported, not `ids.length`. An id that has gone away since the
 * page rendered is not an error — the photo is not in that folder either way — and a caller that
 * wants to know reads the number back.
 */
export async function moveNinaAvatarsAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = photoMoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a list of album photos.' }

  const count = await moveNinaAvatarsToFolder(userId, parsed.data.ids, parsed.data.folder)
  revalidatePath('/admin/nina')
  return { ok: true, folder: parsed.data.folder, count }
}

/**
 * Delete a folder and everything under it.
 *
 * ── THE CURRENT PHOTO CANNOT BE REMOVED, AND THIS SURFACES IT INSTEAD OF HALF-SUCCEEDING ────
 * `deleteNinaAvatar`'s WHERE clause has refused her current photo since F33 —
 * `lib/nina/queries.ts:1116-1128`: *"`eq(ninaAvatars.isCurrent, false)` in the WHERE clause is
 * what makes 'zero current avatars' unreachable rather than repaired"* — and phase 1's recursive
 * delete carries the same clause, so at the SQL layer this cannot take her face no matter what
 * this function does. What it *can* do is be honest, because a recursive delete that silently
 * leaves one row behind looks like a delete that half-worked, and the operator's next move is to
 * try again and watch it half-work identically.
 *
 * So the stand is taken **before any row is deleted**, and `currentPhotoRefusal` owns it: by
 * default the whole operation is refused, naming the photo and both fixes, with nothing deleted
 * and nothing to undo. With `keepCurrent` the operator has read that sentence and answered it; the
 * delete then runs and **leaves the folder holding exactly that one photo**, and `note` says which
 * photo stayed and why. Refusing beats half-succeeding here for a specific reason: a partial
 * delete of hundreds of rows has no inverse, and the rows it took are not coming back.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * `reapAvatarBlobs` runs after the rows are gone and cannot fail this action; its header carries
 * what happens when a chunk of `del`s fails, and points at ruling D4's open card for
 * `scripts/blob-reap.mjs`, which still does not know the `nina/` prefix.
 *
 * The album root is refused outright. `folder: ''` would mean "delete every photo she has", and
 * that button does not belong on a screen whose job is organising them; the folders inside the
 * root are each deletable on their own.
 */
export async function deleteNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a folder path.' }
  const { folder, keepCurrent } = parsed.data

  if (folder === '') {
    return {
      ok: false,
      error: 'The album root is not a folder. Delete the folders inside it one at a time.',
    }
  }

  const current = await currentPhotoInFolder(userId, folder)
  const refusal = currentPhotoRefusal(current, keepCurrent)
  if (refusal != null) return { ok: false, error: refusal }

  const removed = await deleteNinaAvatarsInFolderTree(userId, folder)
  await reapAvatarBlobs(removed)

  /*
   * Undeclare the subtree — but ONLY when it is actually empty, which is exactly `current == null`.
   *
   * This is the one real trap `nina_folders` adds, and phase 1's `deleteNinaFolderSubtree` header
   * states the same rule from the other side. Under `keepCurrent` her current photograph stayed
   * behind, so the folder still holds a row and must go on existing; undeclaring it here would
   * leave a folder with a photograph in it and no declaration — which `listNinaAvatarFolders`
   * would paper over, because the photograph carries the folder, so the bug would stay invisible
   * until that last photograph was moved or made non-current and the folder silently disappeared.
   * A UNION that absorbs disagreement is a reason to be careful about creating it, not a licence.
   *
   * `current == null` is already the discriminator the return value below uses to decide where to
   * send the explorer next, so this is the same fact read twice rather than a second condition to
   * keep in step with the first.
   */
  if (current == null) await deleteNinaFolderSubtree(userId, folder)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    // Where to look next. When her current photo stayed behind the folder still exists, so the
    // explorer stays in it; otherwise the folder is gone and its parent is the nearest thing left.
    folder: current == null ? folderParent(folder) : folder,
    count: removed.length,
    note: current == null ? undefined : currentPhotoKeptNote(current),
  }
}

/**
 * Remove the selected photos. The bulk form of `deleteNinaAvatarAction`, and the same two rules:
 * her current photo is refused up front by `currentPhotoRefusal` rather than silently skipped by
 * the statement's WHERE, and the blobs are reaped after the rows in best-effort chunks.
 *
 * One statement rather than a loop over `deleteNinaAvatar`: 200 selected photos would be 200
 * neon-http round trips inside one Server Action, which is both slow enough to hit the function's
 * duration limit and 200 chances to fail halfway with no record of where.
 */
export async function removeNinaAvatarsAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = photoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a list of album photos.' }
  const { ids, keepCurrent } = parsed.data

  const current = await currentPhotoAmong(userId, ids)
  const refusal = currentPhotoRefusal(current, keepCurrent)
  if (refusal != null) return { ok: false, error: refusal }

  const removed = await deleteNinaAvatars(userId, ids)
  await reapAvatarBlobs(removed)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    count: removed.length,
    note: current == null ? undefined : currentPhotoKeptNote(current),
  }
}
```

**Impact:** Six new Server Action endpoints on the `/admin` boundary, each opening with
`requireAdmin()` (invariant 2) and each scoped to the id it returns (invariant 3's sibling: no
`userId` is ever read from the argument). `AdminActionResult` gains three optional fields, so every
existing consumer still type-checks. `deleteNinaAvatarAction` and its singular siblings are
untouched.

---

### Step 5: `components/admin/FolderMenu.tsx` — the per-folder affordances

**File:** `components/admin/FolderMenu.tsx` (new)
**Change:** The whole folder-maintenance UI in one component phase 5's tree renders per node. It is
its own file rather than JSX inside `FileExplorer.tsx` for two reasons: phase 5 and phase 7 are both
editing that file in the same window, and a menu with four inline panels is 200 lines that have
nothing to do with the tree's layout.

The shape is `MemoryLedger`'s `FactRow` (`components/admin/MemoryLedger.tsx:159-347`), verbatim as a
pattern: a `mode` state machine, an inline panel per mode, one `run()` that owns the transition and
the error, and no modal. That precedent is followed rather than `DetailPanel`'s `<dialog>` because
none of these panels shows a picture and all of them are one field and two buttons — and because a
tree row that opens a modal loses the operator's place in the tree, which is the thing they are
navigating.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { Button, CONTROL_CLASS, Field } from '@/components/ui'
import { folderName, folderParent, isInFolderTree } from '@/lib/admin/filetree'
import {
  createNinaAlbumFolderAction,
  deleteNinaAlbumFolderAction,
  moveNinaAlbumFolderAction,
  renameNinaAlbumFolderAction,
  type AdminActionResult,
} from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'

/**
 * One folder's maintenance menu — R1's *"easier to maintain"*, at the tree node it acts on.
 *
 * ── FOUR PANELS, NO MODAL, AND `FactRow` IS THE PRECEDENT ───────────────────────────────────
 * `components/admin/MemoryLedger.tsx:159-347` is the shape: a `mode` union, one inline panel per
 * mode, a single `run()` that owns the pending transition and the error line, and a Cancel that
 * just sets `mode` back. Nothing here opens a `<dialog>`. `DetailPanel`'s header explains when a
 * native modal earns its keep — a picture flush to three edges, a focus trap worth having — and
 * none of that describes a text field and two buttons. A tree row is also the operator's *place*
 * in a hundreds-deep album, and a modal is precisely the thing that loses it.
 *
 * ── WHY "MOVE TO…" IS A TARGET LIST AND NOT A DRAG ──────────────────────────────────────────
 * Dragging a folder onto another folder is the gesture a file manager suggests, and it is
 * deliberately not built here. Phase 5 owns `dragover`/`drop` on this explorer, and its handler
 * exists to read a folder dragged out of **Windows Explorer** via
 * `DataTransferItem.webkitGetAsEntry()`. Putting an in-page drag protocol on the same elements
 * makes one handler disambiguate an OS folder from an in-page selection, and the failure mode of
 * getting that wrong is silent: either a drop that should have moved 40 rows re-uploads 40 files,
 * or a dropped folder from the desktop is read as a move and uploads nothing. A named target list
 * cannot be misread. Internal drag-to-move is a follow-up card, not a shortcut.
 *
 * ── THE SERVER OWNS EVERY REFUSAL ───────────────────────────────────────────────────────────
 * This component does not pre-validate a name, pre-compute a collision or grey out an illegal
 * target. `lib/admin/folderOps.ts` decides all of it and its sentences are what render in the
 * error line, so there is exactly one place a rule lives and no chance of a control that permits
 * what the action refuses (or, worse, forbids what it would have allowed). The one thing computed
 * here is which targets to *offer*, and offering a bad one costs a refusal the operator can read.
 *
 * The path helpers come from `lib/admin/folderPath.ts` and **not** from `lib/admin/folderOps.ts`,
 * which holds the same phase's Zod schemas: that module's header explains it, and the short
 * version is that no component in this repo pulls `zod` into a client bundle and this one is not
 * going to be the first.
 */
export interface FolderMenuProps {
  /** The folder this menu acts on. `''` is the album root: it can only take a new subfolder. */
  folder: string
  /** Every folder the album knows about, `''` included — the "Move to…" universe. */
  folders: readonly string[]
  /** Photos in this folder and everything under it, as phase 5's tree counted them. */
  photoCount: number
  /** Where the explorer should go next. Phase 5 owns navigation (`?folder=`). */
  onNavigate: (folder: string) => void
  /** A folder that exists in no row yet, so the tree can show it until a photo lands in it. */
  onFolderCreated: (folder: string) => void
}

type Mode = 'idle' | 'menu' | 'create' | 'rename' | 'move' | 'delete'

export function FolderMenu({
  folder,
  folders,
  photoCount,
  onNavigate,
  onFolderCreated,
}: FolderMenuProps) {
  const [mode, setMode] = React.useState<Mode>('idle')
  const [name, setName] = React.useState('')
  const [target, setTarget] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  /**
   * Set when a delete comes back refused because her current photo is in this tree — so the second
   * answer ("delete the rest, keep her photo") appears exactly when it is the fix, and never
   * otherwise.
   *
   * ── RECONCILED: THIS REPLACES A `holdsCurrent` PROP, AND IT IS BETTER THAN ONE ──────────────
   * The draft took `holdsCurrent: boolean` and needed the client to know where her current photo
   * is. That is not derivable from anything phase 5 passes: the grid is ONE page of ONE folder, so
   * `photos.find((p) => p.isCurrent)` is `null` for almost every folder even when the flag should
   * be true — and a `false` there would offer a delete the server refuses while hiding the button
   * that answers the refusal. Making it true would have meant a new `getCurrentNinaAvatar` read on
   * `app/admin/nina/page.tsx` and a `currentFolder` prop threaded through two of phase 5's
   * components, i.e. this phase editing phase 5's page to duplicate a decision the server already
   * makes.
   *
   * So the affordance is driven by the server's own answer instead. `currentPhotoRefusal` already
   * returns a sentence naming the photo and both fixes; this flag is what turns the second fix into
   * a button, at the one moment it is relevant. It is the same rule `PhotoMoveBar`'s header states
   * — *"her current photo is the server's refusal, not a greyed button"* — applied here too, and it
   * costs one boolean instead of a read, a prop chain and a client-side guess.
   */
  const [keepOffer, setKeepOffer] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const isRoot = folder === ''
  const label = isRoot ? 'the album root' : folderName(folder)

  /**
   * Every panel's submit, so the pending flag, the error line and the mode reset cannot get out of
   * step. `onOk` receives the whole result because `folder` (where to go next) and `note` (what a
   * delete left behind) are both on it, and a panel that ignored them would silently strand the
   * explorer in a folder that no longer exists.
   */
  function run(
    action: () => Promise<AdminActionResult>,
    onOk: (outcome: AdminActionResult) => void,
  ) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        /*
         * A refused delete is the ONLY refusal that has a second answer, and
         * `currentPhotoRefusal` is the only thing that produces one — so a refusal while the delete
         * panel is open is exactly the condition that earns the "keep her photo" button. Reading it
         * off the mode rather than off the message keeps this free of string matching.
         */
        if (mode === 'delete') setKeepOffer(true)
        return
      }
      setMode('idle')
      setName('')
      setKeepOffer(false)
      onOk(outcome)
    })
  }

  function open(next: Mode) {
    setError(null)
    setKeepOffer(false)
    setMode(next)
    // A rename starts from the name it has; a create starts empty. Prefilling the rename field is
    // what makes "fix a typo in one character" a keystroke instead of a retype.
    setName(next === 'rename' ? label : '')
    if (next === 'move') setTarget(folderParent(folder))
  }

  /**
   * The destinations this folder may be moved to. A folder cannot go inside its own tree, and it
   * cannot go where it already is — both are refused by `planFolderMove` anyway, and filtering
   * them out here is only so the list is short enough to read.
   */
  const moveTargets = React.useMemo(() => {
    const seen = new Set<string>([''])
    for (const candidate of folders) {
      if (isInFolderTree(candidate, folder)) continue
      if (candidate === folderParent(folder)) continue
      seen.add(candidate)
    }
    if (folderParent(folder) === '') seen.delete('')
    return [...seen].sort()
  }, [folders, folder])

  return (
    <div className="text-[12px]">
      {mode === 'idle' ? (
        <button
          type="button"
          aria-label={`Folder actions for ${label}`}
          className="rounded-field px-1.5 py-0.5 font-semibold text-ink-3 hover:bg-paper-2"
          onClick={() => setMode('menu')}
        >
          &hellip;
        </button>
      ) : (
        <button
          type="button"
          aria-label="Close folder actions"
          className="rounded-field px-1.5 py-0.5 font-semibold text-ink-2 hover:bg-paper-2"
          onClick={() => {
            setMode('idle')
            setError(null)
          }}
        >
          &times;
        </button>
      )}

      {mode === 'menu' && (
        <div className="mt-1 flex flex-col items-start gap-0.5 rounded-card bg-paper-2 p-1.5">
          <MenuItem onClick={() => open('create')}>New subfolder</MenuItem>
          {!isRoot && <MenuItem onClick={() => open('rename')}>Rename</MenuItem>}
          {!isRoot && <MenuItem onClick={() => open('move')}>Move to&hellip;</MenuItem>}
          {!isRoot && (
            <MenuItem destructive onClick={() => open('delete')}>
              Delete&hellip;
            </MenuItem>
          )}
        </div>
      )}

      {(mode === 'create' || mode === 'rename') && (
        <div className="mt-1 rounded-card bg-paper-2 p-3">
          <Field label={mode === 'create' ? `New folder inside ${label}` : `Rename ${label}`}>
            <input
              autoFocus
              aria-label={mode === 'create' ? 'New folder name' : 'Folder name'}
              className={CONTROL_CLASS}
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              size="md"
              disabled={pending || name.trim().length === 0}
              onClick={() =>
                mode === 'create'
                  ? run(
                      () => createNinaAlbumFolderAction({ parent: folder, name }),
                      (outcome) => {
                        // The folder has no rows yet, so a reload would not show it. The tree is
                        // told, and the explorer walks into it, which is what makes the next drop
                        // land in the folder that was just named.
                        if (outcome.folder != null) {
                          onFolderCreated(outcome.folder)
                          onNavigate(outcome.folder)
                        }
                      },
                    )
                  : run(
                      () => renameNinaAlbumFolderAction({ folder, name }),
                      (outcome) => {
                        if (outcome.folder != null) onNavigate(outcome.folder)
                      },
                    )
              }
            >
              {mode === 'create' ? 'Create' : 'Rename'}
            </Button>
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div className="mt-1 rounded-card bg-paper-2 p-3">
          <Field
            label={`Move ${label} into`}
            hint="No photo is re-uploaded — only the folder changes."
          >
            <select
              aria-label={`Move ${label} into`}
              className={CONTROL_CLASS}
              value={target}
              disabled={pending}
              onChange={(event) => setTarget(event.target.value)}
            >
              {moveTargets.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate === '' ? 'The album root' : candidate}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              size="md"
              disabled={pending || moveTargets.length === 0}
              onClick={() =>
                run(
                  () => moveNinaAlbumFolderAction({ folder, parent: target }),
                  (outcome) => {
                    if (outcome.folder != null) onNavigate(outcome.folder)
                  },
                )
              }
            >
              Move
            </Button>
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'delete' && (
        <div className="mt-1 rounded-card border border-red/40 bg-paper-2 p-3">
          <p className="mb-2 max-w-[54ch] font-semibold text-red">
            Delete {label} and the {photoCount} photo{photoCount === 1 ? '' : 's'} in it and under
            it. The rows go first and the files behind them are deleted afterwards, best effort — a
            file left behind is recoverable, a missing file under a live row is a broken picture in
            her album.
          </p>
          {keepOffer && (
            <p className="mb-2 max-w-[54ch] font-semibold text-ink-2">
              Her current photo is in here. It cannot be deleted — she is never left without a
              face — so either make another photo current first, or delete the rest and leave that
              one behind in this folder.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteNinaAlbumFolderAction({ folder, keepCurrent: false }),
                  (outcome) => onNavigate(outcome.folder ?? folderParent(folder)),
                )
              }
            >
              Delete the folder
            </Button>
            {keepOffer && (
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteNinaAlbumFolderAction({ folder, keepCurrent: true }),
                    (outcome) => onNavigate(outcome.folder ?? folder),
                  )
                }
              >
                Delete the rest, keep her photo
              </Button>
            )}
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error != null && (
        <p role="alert" className="mt-2 max-w-[54ch] font-semibold text-warn">
          {error}
        </p>
      )}
    </div>
  )
}

/** A menu row. `destructive` is the `Button` variant's colour without the button's height. */
function MenuItem({
  destructive = false,
  onClick,
  children,
}: {
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-field px-2 py-1 text-left font-semibold hover:bg-card',
        destructive ? 'text-red' : 'text-ink-2',
      )}
    >
      {children}
    </button>
  )
}
```

**Impact:** No behaviour change until step 7 renders it. Depends on `Button`, `Field`,
`CONTROL_CLASS` from the `components/ui` barrel, all of which are client-safe (the barrel's header
guarantees it).

---

### Step 6: `components/admin/PhotoMoveBar.tsx` — move and remove for the selection

**File:** `components/admin/PhotoMoveBar.tsx` (new)
**Change:** The selection-scoped half of maintenance. Phase 5 owns the selection model; this bar
reads it and never writes it, which is why it takes the selected id and an `onDone` and holds no
selection state of its own.

> **RECONCILED (round 1): the prop is `selectedId: string | null`, not an array.** Phase 5 holds
> exactly one selection (`selectedId` in `FileExplorer`), and this phase's own scope promised not
> to restructure that model — the draft's `selectedIds: readonly string[]` could not have both. The
> actions keep their array shape (`ids: string[]`, bounded by `ADMIN_FOLDER_OP_MAX_IDS`), so this
> component passes `[selectedId]` and multi-select later is a client-only change with no server
> edit at all. The plan index's phase-6 scope is *"the create / rename / move / delete **folder**
> actions"*, R1 says *"we can click **a** photo"*, and widening the selection during a three-way
> parallel edit of `FileExplorer.tsx` is the change most likely to conflict for the least
> requirement served. Multi-select is phase 5's follow-up card.
>
> Every `count`-shaped string below therefore reads "this photo" rather than "N photos"; the
> plural copy is kept in the code only where the action's own result supplies the number.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  moveNinaAvatarsAction,
  removeNinaAvatarsAction,
  type AdminActionResult,
} from '@/lib/admin/ninaAlbumActions'

/**
 * What can be done to a selection of photos: move them into a folder, or remove them.
 *
 * ── IT READS PHASE 5'S SELECTION AND NEVER WRITES IT ────────────────────────────────────────
 * `selectedId` comes in as a prop and `onDone` goes out; there is no selection state in here.
 * That is not tidiness — phase 5's selection model is the thing this phase promised not to
 * restructure, and a second writer of it is exactly how the F17 double-upload bug happened
 * (invariant 6's *"nothing decides inside a `setState` updater"*). This component decides nothing
 * about the selection; it acts on the id it was handed and then asks for it to be cleared.
 *
 * The id becomes a one-element array at the action boundary, because the actions are plural by
 * design: `moveNinaAvatarsAction` and `removeNinaAvatarsAction` take `ids` and bound it with
 * `ADMIN_FOLDER_OP_MAX_IDS`, so the day the grid grows multi-select nothing on the server moves.
 *
 * ── MOVING PHOTOS IS THE SANCTIONED WAY TO MERGE TWO FOLDERS ────────────────────────────────
 * `planRelocation` refuses a folder rename that lands on an occupied path, because a folder-column
 * merge cannot be undone — the rows are afterwards indistinguishable. Moving photos into an
 * existing folder is the same end state reached the reversible way: chosen per photo, in front of
 * the grid, with the ids still in hand. And it is one UPDATE of one column: **no blob is copied**,
 * so moving four hundred photographs between folders moves zero bytes.
 *
 * ── REMOVE IS A TWO-STEP, AND HER CURRENT PHOTO IS THE SERVER'S REFUSAL, NOT A GREYED BUTTON ─
 * `currentId` is used only to warn. The refusal itself belongs to
 * `removeNinaAvatarsAction`/`currentPhotoRefusal`, which names the photo and both fixes, because a
 * disabled button in a grid of hundreds tells the operator nothing about which of their forty
 * selected photos is the problem.
 */
export interface PhotoMoveBarProps {
  /** The photo phase 5's grid currently has selected, or `null`. Renders nothing when `null`. */
  selectedId: string | null
  /** Every folder the album knows about; `''` is the album root. */
  folders: readonly string[]
  /** The folder the grid is showing, so it is not offered as a destination. */
  folder: string
  /** Her current photo's id, when it is on this page — for the warning only. */
  currentId: string | null
  /** Clear the selection. Phase 5 owns the selection; this is how it is handed back. */
  onDone: () => void
}

export function PhotoMoveBar({
  selectedId,
  folders,
  folder,
  currentId,
  onDone,
}: PhotoMoveBarProps) {
  const [target, setTarget] = React.useState('')
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /* One selection, expressed as the array the actions take. `ids` is what every call below
   * passes; `count` keeps the copy below honest if the selection ever becomes a set. */
  const ids = selectedId == null ? [] : [selectedId]
  const count = ids.length
  const holdsCurrent = currentId != null && selectedId === currentId

  const targets = React.useMemo(() => {
    const seen = new Set<string>([''])
    for (const candidate of folders) seen.add(candidate)
    seen.delete(folder)
    return [...seen].sort()
  }, [folders, folder])

  function run(action: () => Promise<AdminActionResult>) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        return
      }
      setConfirming(false)
      setNote(outcome.note ?? null)
      onDone()
    })
  }

  if (count === 0) return null

  return (
    <div className="mb-4 rounded-card bg-paper-2 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">
          {count} photo{count === 1 ? '' : 's'} selected
        </span>

        <select
          aria-label="Move the selected photos into"
          className={`${CONTROL_CLASS} max-w-[240px]`}
          value={target}
          disabled={pending}
          onChange={(event) => setTarget(event.target.value)}
        >
          {targets.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate === '' ? 'The album root' : candidate}
            </option>
          ))}
        </select>

        <Button
          size="md"
          disabled={pending || targets.length === 0}
          onClick={() =>
            run(() => moveNinaAvatarsAction({ ids: ids, folder: target }))
          }
        >
          Move
        </Button>

        <Button
          size="md"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
        >
          Remove&hellip;
        </Button>

        <Button size="md" variant="ghost" disabled={pending} onClick={onDone}>
          Clear
        </Button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-card border border-red/40 bg-card p-3">
          <p className="mb-2 max-w-[54ch] font-semibold text-red">
            Remove {count} photo{count === 1 ? '' : 's'} from the album and delete the files behind
            them. Rows first, files afterwards and best effort — a file left behind is recoverable,
            a missing file under a live row is a broken picture in her album.
          </p>
          {holdsCurrent && (
            <p className="mb-2 max-w-[54ch] font-semibold text-ink-2">
              Her current photo is in this selection and cannot be removed. Remove the rest and it
              stays, or make another photo current first.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(() => removeNinaAvatarsAction({ ids: ids, keepCurrent: false }))
              }
            >
              Remove {count}
            </Button>
            {holdsCurrent && (
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(() => removeNinaAvatarsAction({ ids: ids, keepCurrent: true }))
                }
              >
                Remove the rest, keep her photo
              </Button>
            )}
            <Button
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {note != null && <p className="mt-2 max-w-[54ch] font-semibold text-ink-2">{note}</p>}
      {error != null && (
        <p role="alert" className="mt-2 max-w-[54ch] font-semibold text-warn">
          {error}
        </p>
      )}
    </div>
  )
}
```

**Impact:** No behaviour change until step 7 renders it.

---

### Step 7: Three insertions at phase 5's two seams

**Files:** `components/admin/explorer/FolderTree.tsx` (insertion A) and
`components/admin/FileExplorer.tsx` (insertions B and C).
**Change:** Three insertions and their prop wiring. Nothing else in phase 5's files is touched —
not the selection model, not the drop handling, not the upload queue, not `SelectionPane`'s
per-photo action list (that one is phase 7's seam).

**Reconciled:** phase 5 split the tree into its own file, so the folder seam is in
`components/admin/explorer/FolderTree.tsx` and not in `FileExplorer.tsx`. Phase 5 marked it, in
comments, in the two exact places this phase needs: a `SEAM — PHASE 6` note at the end of
`FolderTree`'s `<nav>` (for "New folder") and the observation that its `Row` component is *"the
single place a folder is drawn"* (for rename / move / delete). Both hold. `FolderTree`'s node type
is phase 2's `FolderNode`, so the counts are `ownCount` / `totalCount`, not `count` /
`subtreeCount`.

**Insertion A — the folder node, in the tree pane.** In
`components/admin/explorer/FolderTree.tsx`, inside `Row`, after the `<Link>` and before the count
`<span>` (or after the count — `FolderMenu` renders a `…` button and is position-agnostic):

```tsx
<FolderMenu
  folder={path}
  folders={allFolders}
  photoCount={totalCount}
  onNavigate={onNavigate}
  onFolderCreated={onFolderCreated}
/>
```

with, at the top of the same file:

```tsx
import { FolderMenu } from '@/components/admin/FolderMenu'
```

`Row` today takes `href`, `label`, `count`, `depth`, `active`, `chevron` and `onToggle`. It gains
`path`, `totalCount`, `allFolders`, `onNavigate` and `onFolderCreated`, all forwarded from
`FolderTree` through `Branch` exactly as `hrefFor` already is — that is the whole plumbing change,
and it touches `Branch`'s prop list but not its recursion.

The five values, and where each comes from:

| Prop | Source |
|---|---|
| `path` | the `FolderNode`'s `path` (the root Row passes `''`) |
| `allFolders` | insertion B's merged list — the server's folders plus the pending ones |
| `photoCount` | the node's `totalCount`. **`totalCount`, not `ownCount`**: the delete panel's *"this will remove N photos"* has to count the subtree it is about to remove, which is exactly what `totalCount` is and exactly what `ownCount` is not |
| `onNavigate` | `FileExplorer`'s `hrefFor` is a URL builder, not a navigator, so this is a `(folder: string) => void` that does `router.push(hrefFor(folder))` — `FileExplorer` already holds `router` |
| `onFolderCreated` | insertion B's `addPendingFolder` |

> **RECONCILED: there is no `holdsCurrent` prop and no `currentFolder` read.** The draft's sixth
> prop would have needed the client to know which folder holds her current photo, which nothing
> phase 5 passes can answer — the grid is one page of one folder, so
> `photos.find((p) => p.isCurrent)?.folder` is `null` for almost every folder even when the flag
> should be true, and a wrong `false` would offer a delete the server refuses while hiding the
> button that answers the refusal. Making it right would have meant a new `getCurrentNinaAvatar`
> read on `app/admin/nina/page.tsx` plus a prop threaded through two of phase 5's components — this
> phase editing phase 5's page in order to duplicate a decision the server already makes. Instead
> `FolderMenu` sets `keepOffer` when a delete comes back refused, which is exactly when the second
> answer is the fix. See its docstring, and note the exit criterion is unchanged: the refusal names
> the photo and both fixes, and the second fix is one click away.

**Insertion B — the pending-folder set, in `FileExplorer.tsx`.** A created folder has no rows, so
the server cannot list it (see `createNinaAlbumFolderAction`'s docstring). Four lines of state hold
it until a photo lands in it:

```tsx
/**
 * Folders that exist because the operator just made one, and in no row yet — a folder IS the
 * `folder` column of the rows in it, so an empty one has nothing for the server to list. It joins
 * the tree here and stops being pending the moment a photo carries it, which is why the merge
 * below is a filter and not a union: once `folders` from the server names it, the pending copy is
 * redundant and must not survive a rename.
 */
const [pendingFolders, setPendingFolders] = React.useState<readonly string[]>([])

const addPendingFolder = React.useCallback((folder: string) => {
  setPendingFolders((previous) => (previous.includes(folder) ? previous : [...previous, folder]))
}, [])

const allFolders = React.useMemo(() => {
  const known = new Set(folders.map((entry) => entry.folder))
  return [
    ...folders.map((entry) => entry.folder),
    ...pendingFolders.filter((folder) => !known.has(folder)),
  ].sort()
}, [folders, pendingFolders])
```

Note the `.map((entry) => entry.folder)`: phase 5's `folders` prop is `ExplorerFolder[]`
(`{ folder, count }`), not a `string[]`, so `allFolders` is derived from it rather than spread. It
is a `string[]` because that is what `FolderMenu` and `PhotoMoveBar` want — a list of destinations,
without counts. Phase 5's `folders` prop itself is unchanged and still feeds `FolderTree`'s
`buildTree`.

**Insertion C — the selection bar, in `FileExplorer.tsx`.** Directly above the content grid:

```tsx
<PhotoMoveBar
  selectedId={selected?.id ?? null}
  folders={allFolders}
  folder={folder}
  currentId={photos.find((photo) => photo.isCurrent)?.id ?? null}
  onDone={() => setSelectedId(null)}
/>
```

with

```tsx
import { PhotoMoveBar } from '@/components/admin/PhotoMoveBar'
```

`selected` and `setSelectedId` are phase 5's selection model, read and called — never
reimplemented, and never widened (see Step 6's reconciliation note). `PhotoMoveBar` returns `null`
when `selectedId` is `null`, so no conditional is needed at the call site and the grid's layout does
not shift on an empty selection. `currentId` here can legitimately be `null` when her photo is on
another page; unlike `currentFolder` above that is harmless, because it only suppresses a warning
whose real enforcement is `currentPhotoRefusal` on the server.

**Impact:** the tree gains a `…` button per folder; the content pane gains a bar when a photo is
selected. Both are inert when the operator does not touch them, and neither changes what phase 5
renders otherwise. Two props are added to phase 5's components (`currentFolder` on `FileExplorer`
and `FolderTree`) and one read to its page.

---

## Verification

**No install step:** the worktree already has `node_modules` (`npm ci`, exit 0) and a gitignored
`.env.local`.

**Build:** `npm run typecheck`
**Tests:** `npm test` — `tests/admin.folderOps.test.ts` must be green, and every existing suite
(`tests/admin.avatars.test.ts`, `tests/admin.memory.test.ts`, `tests/db.schema.nina.test.ts`) must
stay green.
**Lint / format:** `npm run lint` && `npm run format:check`
**Guards:** `npm run ci:data-layer-guard` && `npm run ci:client-secret-guard` — this phase adds no
`lib/db/queries.ts` export and no secret reaches a client module, so both should be unaffected;
run them because CI does.

**Manual check** (`npm run dev`, then `/admin/nina`, desktop):

1. **Create.** `…` on a folder → *New subfolder* → a name → the tree shows it and the explorer is
   inside it. Reload without uploading: it is gone, as documented. Upload one photo into it, then
   reload: it is still there.
2. **Rename.** Rename a folder holding a nested subfolder. The tree updates without a manual
   reload (`revalidatePath` ships the re-render in the action's own response), every photo is still
   there, and the Blob store's object count is **unchanged** — this is the "no blob is copied"
   check, and it is the whole reason folders are a column.
3. **Rename refusals.** Rename a folder onto a sibling's name → refused, naming the collision and
   saying to move the photos instead. Rename the album root → the option is not offered, and the
   action refuses if called.
4. **Move.** Move a folder with a nested subfolder into another folder → the whole subtree comes
   with it. Move it to the album root. Try moving it into its own child → refused, both paths
   named.
5. **Move photos.** Select several photos in the grid → *Move* into another folder → they leave
   this folder and appear there; object count unchanged again.
6. **Recursive delete.** Delete a folder of ~20 photos in two subfolders → all rows gone, the
   explorer lands on the parent, and the objects are gone from the Blob store. The function log
   shows no `[f34]` line.
7. **The delete refusal — the case this phase exists to get right.** Make a photo inside a folder
   her current one. Delete that folder → **refused**, nothing deleted, the message names that
   photo, its folder, and both fixes, **and the *Delete the rest, keep her photo* button appears
   at that moment** (it is not rendered before the refusal — see `FolderMenu`'s `keepOffer`).
   Confirm the folder still holds every photo. Then press that button → the folder remains, holding
   **exactly** that one photo, and the result note says which photo stayed and why. Then make a
   photo in another folder current and delete the folder again → it goes, first press, and the
   keep-her-photo button never appears. Do this test on a folder whose photos are **past the first
   page of the grid** as well: the refusal is a server decision and must not depend on what the
   grid happened to render.
8. **Bulk remove refusal.** Select her current photo along with three others → *Remove…* → refused,
   naming it; *Remove the rest, keep her photo* removes three and keeps hers.
9. **The seams stay phase 5's and phase 7's.** Folder upload by picker and by dragging a folder out
   of Windows Explorer still work, and the re-drop still uploads nothing and says so. The
   per-photo menu (phase 7's *"Share link to Nina"*) is unchanged.

**Exit criteria:** Rename, move and recursive delete all work and are reflected in the tree with no
manual reload; a folder holding her current photo refuses deletion with a message that names the
photo and the reason, and the explicit second answer leaves that folder holding exactly that one
photo; no folder operation changes the Blob store's object count except a delete; `npm test`,
`npm run typecheck`, `npm run lint` and `npm run format:check` are green.

---

## Handoffs

- **Phase 1 — `deleteNinaAvatars(userId, ids)` and `moveNinaAvatarsToFolder(userId, ids, folder)`:
  RESOLVED, both added there.** This handoff was right — phase 1's draft had neither, and looping
  the singular forms would have been N neon-http round trips inside one Server Action. Both are now
  phase 1's Step 14, with `is_current = false` in the WHERE on the delete and an `ids.length === 0`
  early return on both. `deleteNinaAvatarsInFolderTree` also replaced phase 1's refusing
  `deleteNinaAvatarFolder`, because that one could not express this phase's `keepCurrent`.
- **Durable empty folders — BUILT, and this handoff is closed.** It was a card: the reconciled plan
  had no `nina_folders` table, judged R1 satisfied by this phase's create → navigate → upload
  mitigation, and left the table as a schema decision for the owner rather than one a reconciler
  should invent. **The owner decided to build it.** Phase 1 now owns the table, the migration and
  three statements (`declareNinaFolders`, `renameNinaFolderSubtree`, `deleteNinaFolderSubtree`);
  this phase calls all three, and the mitigation copy is gone because there is no longer a cliff to
  mitigate.

  The reconciler's four-part cost estimate was accurate and every part of it is now paid — *"a
  table, an insert on create, a delete on delete, and a left join in the tree read"* — except that
  the fourth is a UNION rather than a left join, and the fifth concern is the one that actually
  needed a design: *"two writers that must never disagree with the photo rows."* The answer is that
  neither source is authoritative. `listNinaAvatarFolders` unions them, so a folder appears if a
  photograph is in it **or** if it is declared, and both directions of disagreement degrade instead
  of corrupting. Read that function's header before touching either writer.

  **The one rule that survives as a real trap**, and the reason the delete action reads
  `current == null` twice: undeclare a subtree only when it is actually empty. Under `keepCurrent`
  the folder still holds her current photograph, and undeclaring it there would create exactly the
  disagreement the UNION hides — invisible until the last photograph left.
- **Phase 7 — the per-photo menu.** *"Share link to Nina"* goes in the per-**photo** action menu.
  Nothing in this phase adds an item there; `FolderMenu`'s items are per-folder and
  `PhotoMoveBar`'s buttons are on the selection, both in files phase 7 does not open.
- **Ruling D4 — `scripts/blob-reap.mjs` still does not know the `nina/` prefix.** A recursive
  delete widens the orphan exposure that card describes from one failed `del` to a failed chunk of
  a hundred. `reapAvatarBlobs` logs every failed chunk with its URLs so the orphans are named, and
  chunks at 100 rather than sending one request so a failure orphans a fraction. Teaching the
  script the prefix is still that card's, not this phase's.
- **Internal drag-to-move.** Dragging a selection or a folder onto a tree node is the gesture a
  file manager suggests, and it is deliberately a target list here instead — phase 5 owns
  `dragover`/`drop` on these elements for the Windows Explorer folder walk, and one handler
  disambiguating an OS folder from an in-page selection fails silently in both directions. A
  follow-up card, after phase 5's drop handling has settled.
- **Merging two folders by rename** is refused on purpose (`planRelocation` rule 3) because a
  folder-column merge has no inverse. If it is ever wanted, it needs an explicit "merge" verb and a
  record of which rows came from where — a different feature, not a loosened refusal.
- **`components/admin/AlbumManager.tsx` / `UploadAvatar.tsx`.** Phase 5 deletes both, and
  retires `registerNinaAvatarAction` (singular) with them. This phase neither reads nor edits them,
  and adds no second caller of `deleteNinaAvatarAction` (singular) that would keep them alive.
- **`deleteNinaAvatarAction`'s thumbnail `del()` is phase 4's, not this phase's.** Phase 1's
  handoff sent it here; this phase's plan declines it (*"`deleteNinaAvatarAction` and its singular
  siblings are untouched"*), which left it unowned, so the reconciler moved it to phase 4 — the
  phase that starts writing the second object. `reapAvatarBlobs` here is the same rule applied to a
  batch and is still this phase's.

---

## Rollback

Entirely additive and revertible alone, in reverse order of the steps:

1. Remove the three insertions: `<FolderMenu>` and its forwarded `Row`/`Branch` props from
   `components/admin/explorer/FolderTree.tsx`, and `<PhotoMoveBar>` plus the
   `pendingFolders`/`addPendingFolder`/`allFolders` block from `components/admin/FileExplorer.tsx`,
   along with the two imports. Nothing needs putting back — `allFolders` is derived state this
   phase added and phase 5's own `folders` prop was never replaced.
2. Delete `components/admin/PhotoMoveBar.tsx` and `components/admin/FolderMenu.tsx`.
3. Delete the `Phase 6 — folder maintenance` section from the end of
   `lib/admin/ninaAlbumActions.ts`, and the phase 6 imports it added to the import block. Drop
   `folder`, `count` and `note` from `AdminActionResult` (nothing outside this phase reads them).
4. Delete `tests/admin.folderOps.test.ts` and `lib/admin/folderOps.ts`. (There is no
   `lib/admin/folderPath.ts` to delete — see the Interface Contract. `lib/admin/filetree.ts` is
   phase 2's and stays; the two helpers this phase drove into it, `isInFolderTree` and
   `sanitiseFolderSegment`, are exported and tested there and are harmless without a consumer.)

No migration to back out, no schema change, no blob written, and nothing outside these files
depends on any of it. `git revert` of the phase's commits is equivalent. What a rollback does **not**
undo is any delete the phase performed while it was live — those rows and objects are gone, which is
the whole reason the refusals above are pre-flight rather than post-hoc.
