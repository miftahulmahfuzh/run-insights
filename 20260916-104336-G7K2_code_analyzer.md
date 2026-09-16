# Code Analysis: Nina Media dedup — reference rows orphaned by `ON DELETE SET NULL`

**Type:** Bug Investigation
**Date:** 2026-09-16
**Session ID:** 20260916-104336-G7K2
**Plan:** `NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix` (branch `feature/nina-ghost-photo-dedup-fix`, base `origin/main` @ `a4ae729`)

---

## User Input

### Original User Request

Turn 1 (already investigated in this session, findings carried forward verbatim below):
> coba cek /nina/about Media, foto ke 1/86 dan 4/86 itu duplikat. find out the root cause why our deduplication system missed this

Turn 2 (this `/analyze` invocation):
> to implement a robust fix

### User-Provided Context

This session already completed the root-cause investigation for the duplicate pair (photo 1/86
and 4/86 in `/nina/about`'s Media grid) against the **production** database
(`DATABASE_URL_UNPOOLED` in `.env.local` — this repo has one database; "dev" is production, per
standing project memory). The findings below are load-bearing facts this plan is built on, not
hypotheses:

- Photo **4/86** (`nina_message_images.id = 'CwBaQhK_PG5p'`) is a normal generated selfie,
  written by `finishSelfie` (`lib/nina/imagerun.ts`), created `2026-09-16 00:33:29`. It carries a
  real `content_hash`, `perceptual_hash`/`perceptual_sig`, and measurements — dedup worked
  correctly for it.
- Photo **1/86** (`id = 'Tdw_AkrJT0ks'`) was created `2026-09-16 02:07:55` when the runner shared
  Nina's then-current avatar photo into the chat (`attachExisting: { kind: 'avatar', ... }`).
  `resolveAttachment`'s avatar branch (`lib/nina/actions/send.ts:192-222`) wrote it as a
  **reference row**: `blob_url`/`pathname`/`description` copied from the `nina_avatars` row,
  `source_avatar_id` set to that avatar's id, `content_hash`/`perceptual_hash`/`perceptual_sig`/
  `width`/`height`/`bytes` all NULL (references never carry their own measurements — the keeper
  owns them). This is correct at the moment it happened, and `isOriginalPhoto()` correctly hid it
  from Media.
- At the time of investigation, `id='Tdw_AkrJT0ks'` had **`source_avatar_id = NULL`**,
  **`message_id = NULL`**, and every measurement column NULL — yet `description` is byte-identical
  to photo 4/86's, and its `pathname` (`avatar-7pgf5f96AXK6-...jpg`) matches the naming convention
  `imagerecipe.ts:132` documents for avatar generation, never for a chat selfie (`selfie-*`) or a
  chat upload (`chat/*`). No `nina_avatars` row with that pathname exists any more. A direct `GET`
  on its `blob_url` returned `Blob not found`.
- **Conclusion, verified against the schema comment at `lib/db/schema/nina/chat.ts:614-618`:**
  the `nina_avatars` row this reference pointed to was hard-deleted, the FK
  `nina_message_images.source_avatar_id → nina_avatars.id` fired its (deliberate)
  `ON DELETE SET NULL`, and the row silently reclassified from "reference" to "original" — while
  never having been measured. It is now permanently invisible to both dedup mechanisms (the
  content-hash lookup and the perceptual twin-scan both require a non-NULL column to participate)
  and its Blob object is gone, so even the sweep's blob-refetch repair (`buildFillOps` in
  `scripts/nina-dedupe-plan.mjs`) cannot recover it.
- Tracing the delete path found a **second, independent defect** in the same family: none of the
  three avatar-delete statements' callers check `isBlobPathnameReferenced` before deleting the
  Blob object, unlike the chat-photo delete/replace path, which does. This is very likely how the
  object actually went to 404: the avatar row was deleted (its own action's own doc-comment says
  "Remove a photo from the album, **and its blob with it**") with no check for whether a chat
  message was still rendering those exact bytes.

### User-Provided Files

None (`@`-referenced) — this analysis is built entirely on Turn 1's investigation and this
session's follow-up tracing.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Implement a robust fix for the dedup gap found in Turn 1 — a reference row can lose its provenance (`source_avatar_id`/`source_image_id` → NULL via `ON DELETE SET NULL`) and reappear in Media as an unmeasured phantom duplicate, permanently invisible to dedup, and its Blob object can be deleted out from under it because the avatar-delete family never checks whether anything still renders those bytes. |

---

## Detailed Requirements Understanding

**Problem statement.** Two independent defects combine to produce the observed symptom (a
photograph appearing twice, unlinked, in `/nina/about`'s Media grid, with one copy showing a
broken image):

1. **Defect A — unconditional blob deletion.** `deleteNinaAvatarAction`
   (`lib/admin/ninaAlbumAvatarActions.ts:283-320`), and the two bulk paths that share
   `reapAvatarBlobs` (`lib/admin/ninaAlbumFolderActions.ts:115-134`, called from
   `deleteNinaAlbumFolderAction` and `removeNinaAvatarsAction`), delete the underlying Blob
   object for every removed avatar row with **no call to `isBlobPathnameReferenced`**
   (`lib/nina/queries/images.ts:926-964`) — the exact check `lib/admin/chatPhotoActions.ts`
   already makes before its own blob deletes, for the identical reason. A `nina_message_images`
   row that references the avatar (`source_avatar_id` set, or a chain through `source_image_id`)
   still names that exact `pathname`/`blob_url`, and nothing stops the delete.
2. **Defect B — silent, unmeasured reclassification.** The FK's `ON DELETE SET NULL`
   (`lib/db/schema/nina/chat.ts:614-618`, deliberate, documented) turns a reference row into
   something `isOriginalPhoto()` counts as an original the instant its parent avatar (or, via
   `source_image_id`, its parent chat photo) is deleted — but a reference row was never given the
   facts an original needs to participate in dedup (`content_hash`, `perceptual_hash`,
   `perceptual_sig`, `width`, `height`, `bytes` are all NULL by the module's own stated doctrine
   for reference rows). Nothing promotes those facts onto the row at the moment its provenance is
   about to be stripped.

Defect A is what actually broke the specific row found (dead blob, broken tile). Defect B is what
makes the row *permanently* invisible to every dedup mechanism even when the blob happens to
survive (e.g., a chain through `source_image_id`, or a case where some other row still protects
the object) — the row now qualifies for `listNinaMessageImages` (Media) and
`findNinaImageByContentHash`/`findNinaSignedOriginals` (the two dedup lookups) all read the same
`isOriginalPhoto()` predicate, but only the last two require the row to actually carry the
measurement columns dedup depends on.

**A robust fix must close both**, at the same choke point, in the same order, for every path
that deletes an avatar or a chat-photo original:

1. **Before** the parent row is deleted (while its id can still be used to find dependents),
   locate every `nina_message_images` row whose `source_avatar_id`/`source_image_id` names it and
   whose `content_hash` is NULL, fetch the bytes once per distinct pathname, and **promote** those
   dependents: write `content_hash`, `perceptual_hash`, `perceptual_sig`, `width`, `height`,
   `bytes` onto them, guarded by `content_hash IS NULL` at write time (idempotent against a
   concurrent promotion, mirroring the sweep's own `is null` write guard).
2. **After** the parent row is deleted, before deleting the Blob object, check
   `isBlobPathnameReferenced(userId, pathname, blobUrl)` and skip the `del()` for any pathname
   still named by a surviving row — which, after step 1, is now correct forever: a promoted
   dependent is a fully self-sufficient original and legitimately keeps the object alive.

This turns "an orphaned reference silently becomes an unmeasured duplicate with a 50/50 chance of
a dead blob" into "an orphaned reference becomes a fully measured, dedup-eligible original whose
bytes are guaranteed to survive as long as it does" — which is the outcome the schema comment at
`chat.ts:614-618` already promises ("the collection KEEPS the picture instead of losing it") but
the current code does not deliver.

**Success criteria:**
- Deleting an avatar (single, folder-subtree, or bulk-by-id) that a chat message still references
  never leaves that message rendering a 404'd Blob object.
- A reference row that survives its parent's deletion always carries `content_hash`,
  `perceptual_hash`, `perceptual_sig`, `width`, `height`, `bytes` — i.e. it is dedup-eligible from
  the instant it becomes an "original" by `isOriginalPhoto()`'s own definition.
- The already-broken production row (`Tdw_AkrJT0ks`) and any siblings like it are identified; the
  ones whose blob object is *already* gone (unrecoverable — no bytes left to measure) are reported
  for an operator decision rather than silently left in Media forever.
- No behavior change for the common case (deleting an avatar/photo nothing else references).

**Key constraints / assumptions:**
- The promotion write must run **before** the parent delete (the dependent lookup needs the
  parent's still-live id) and must not itself risk losing the parent's delete if the fetch/sign
  step fails — degrade to "leave the dependent unmeasured, exactly today's behavior" rather than
  refusing the operator's delete. This mirrors every other dedup degradation in this codebase
  (invariant 9: a dedup optimization failing must never cost the user's actual request).
  Deliberately different from a per-row transaction: a fetch failure here logs and moves on, it
  does not roll back the parent delete.
- `scripts/*.mjs` sweep scripts import nothing (the `--experimental-strip-types` / GitHub-backstop
  constraint `lib/photos/contentHash.ts` and `scripts/nina-dedupe-plan.mjs` both state) — a
  remediation script cannot import the app-layer promotion helper and must restate the same
  hashing/signing primitives the sweep already restates for the same reason.
- Fixing the *existing* broken production row(s) is an operational, data-touching act distinct
  from shipping the code fix — it must be its own reviewable, dry-run-by-default step, not
  something `/implement` runs against production unattended.

---

## Analysis Scope

### Explicitly Mentioned Files

None — carried in from the prior investigation turn.

### Discovered Related Files

- `lib/nina/actions/send.ts` — `resolveAttachment` (the only writer of a `source_avatar_id`/
  `source_image_id` reference row)
- `lib/db/schema/nina/chat.ts` — the FK definitions and their `ON DELETE SET NULL` doctrine
- `lib/nina/queries/images.ts` — `isOriginalPhoto`, `listNinaMessageImages`,
  `findNinaImageByContentHash`, `findNinaSignedOriginals`, `isBlobPathnameReferenced`,
  `deleteNinaMessageImage`
- `lib/nina/queries/avatars.ts` — `deleteNinaAvatar`, `deleteNinaAvatarsInFolderTree`,
  `deleteNinaAvatars` (all three: rows deleted, blob refs handed back, no reference check)
- `lib/admin/ninaAlbumAvatarActions.ts` — `deleteNinaAvatarAction` (inline `del(orphans)`, no
  reference check)
- `lib/admin/ninaAlbumFolderActions.ts` — `reapAvatarBlobs` (shared by
  `deleteNinaAlbumFolderAction` and `removeNinaAvatarsAction`; same gap)
- `lib/admin/chatPhotoActions.ts` — the correct precedent: calls `isBlobPathnameReferenced`
  before deleting a chat-photo's blob
- `lib/admin/chatPhotos.ts`, `lib/nina/albumActions.ts:217` — the two callers of
  `deleteNinaMessageImage`; a chat-photo original can also be depended on by a
  `source_image_id` reference, so the same promote-then-guard shape applies here
- `lib/photos/contentHash.ts` — `contentHashOf(bytes)`, the one hash primitive
- `lib/nina/perceptualSign.ts` — `signImageBytes(bytes)` → `{ dhashHex, sig16Base64, width,
  height }`, and `fetchAndSignImage(url)` (fetch + sign together; a promotion helper should fetch
  once and call `contentHashOf`/`signImageBytes` directly rather than double-fetching)
- `scripts/nina-dedupe-plan.mjs` — the existing sweep: `buildFillOps`/`buildFillPerceptualOps`
  backfill NULL hash/signature columns by refetching the Blob object; cannot recover a row whose
  object is already gone. Restates `dhashHexOf`/`parseDhashHex`/`sig16FromBase64` locally rather
  than importing `lib/nina/perceptual.ts`, because it (and its sibling
  `scripts/nina-image-worker.ts`) run under `--experimental-strip-types` with no import graph.
- `scripts/nina-dedupe-media.mjs` — the sweep's DB read/write driver (row loading, `--apply`
  gating) that `nina-dedupe-plan.mjs`'s pure functions plug into

---

## Current Dataflow

### Entry point 1: avatar delete (single)

**Location:** `deleteNinaAvatarAction`, `lib/admin/ninaAlbumAvatarActions.ts:283-320`
**Trigger:** Server Action from `/admin/nina`'s album manager
**Input:** `rawId: string` (an avatar id)

1. `requireAdmin()` — auth.
2. `avatarIdSchema.safeParse(rawId)` — shape only.
3. `deleteNinaAvatar(userId, id)` (`lib/nina/queries/avatars.ts:379-396`) — one DELETE, WHERE
   `user_id = $1 AND id = $2 AND is_current = false`, `RETURNING` the blob refs. **This is the
   moment the FK fires**: any `nina_message_images` row with `source_avatar_id = id` gets that
   column SET NULL by Postgres, synchronously, inside this statement's transaction — before this
   function even returns. There is no later point in the request where "the dependents, keyed by
   the old avatar id" can be found again.
4. `del(orphans)` — unconditional Blob delete of `blobUrl` (+ `thumbUrl` if present). **No
   `isBlobPathnameReferenced` check.** Failure is caught and logged, never surfaced.
5. `revalidatePath('/admin/nina')`.

### Entry point 2: avatar delete (folder subtree / bulk-by-id)

**Location:** `deleteNinaAlbumFolderAction` / `removeNinaAvatarsAction`,
`lib/admin/ninaAlbumFolderActions.ts:380-459`
**Trigger:** Server Actions from the same album manager (recursive folder delete; multi-select
remove)

Same shape, batched: `deleteNinaAvatarsInFolderTree` / `deleteNinaAvatars`
(`lib/nina/queries/avatars.ts:898-950`) DELETE rows and hand back refs; `reapAvatarBlobs`
(`ninaAlbumFolderActions.ts:115-134`) chunks them into `del()` calls of up to 100 URLs, same
no-reference-check gap, same swallow-and-log on failure.

### Entry point 3: chat-photo delete (`deleteNinaMessageImage`'s callers)

**Location:** `lib/admin/chatPhotoActions.ts:640`, `lib/nina/albumActions.ts:217`
**Trigger:** admin "Remove" on a Media tile; the runner's own remove-photo-from-bubble action

Both already call `isBlobPathnameReferenced` before deleting the blob (the correct precedent for
Defect A) — but neither promotes a `source_image_id` dependent before the row is deleted, so
Defect B (the unmeasured-original reclassification) is live here too, whenever one chat photo was
re-attached (creating a reference) and the original it points to is later removed.

### Data persistence

**Database:** `nina_message_images` (`content_hash`, `perceptual_hash`, `perceptual_sig`,
`width`, `height`, `bytes`, `source_avatar_id`, `source_image_id` — Postgres, Neon), `nina_avatars`
(row deleted), Vercel Blob (object deleted, best-effort).

### Exit points

- Server Action returns `{ ok, error? }` / `{ ok, count, note? }` to the client; `revalidatePath`
  refreshes `/admin/nina`.
- Side effect (today, buggy): a dependent `nina_message_images` row silently changes classification
  from "reference" to "original" with no measurement, and (Defect A) its rendered bytes may vanish.

---

## Key Data Structures

### `nina_message_images` provenance columns

**Location:** `lib/db/schema/nina/chat.ts:591-720` (`sourceAvatarId`, `sourceImageId`,
`contentHash`, `perceptualHash`, `perceptualSig`)
**Fields:** both provenance columns nullable, `ON DELETE SET NULL`; `content_hash` 64-lowercase-hex
or NULL; `perceptual_hash` 16-hex or NULL; `perceptual_sig` base64 of a 256-byte thumbnail or NULL.
**Used in:** `isOriginalPhoto()` (`lib/nina/queries/images.ts:489-491`),
`findNinaImageByContentHash` (`:356-374`), `findNinaSignedOriginals` (`:401-441`),
`listNinaMessageImages`/`mediaCollectionScope` (`:246-256`, `:630-632`).

### `NinaAvatarBlobRef` / the delete-then-reap shape

**Location:** `lib/nina/queries/avatars.ts` (return type of the three delete functions)
**Fields:** `{ id, blobUrl, pathname, thumbUrl, thumbPathname }`
**Used in:** `reapAvatarBlobs` (`ninaAlbumFolderActions.ts:115`), the inline equivalent in
`deleteNinaAvatarAction` (`ninaAlbumAvatarActions.ts:312-317`).

---

## Dependencies

### Configuration / Environment / External Services

- Vercel Blob (`del`, `put`, public GET) — `lib/env.ts`'s `blobEnv()`, never raw `process.env`.
- `sharp` (native module, `serverExternalPackages` in `next.config.ts`) — the one perceptual
  signer, `lib/nina/perceptualSign.ts`.
- Postgres/Neon — the two FKs' `ON DELETE SET NULL` behavior is a schema-level guarantee this fix
  works *with*, not against: the fix does not change the FK, it makes sure a row survives that
  transition already measured.
- `DATABASE_URL_UNPOOLED` (`.env.local`) — the connection a remediation script would use; this
  repo has one database and it is production (standing project fact).

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `deleteNinaAvatar` | `lib/nina/queries/avatars.ts:379` | def | `lib/nina` |
| `deleteNinaAvatarsInFolderTree` | `lib/nina/queries/avatars.ts:898` | def | `lib/nina` |
| `deleteNinaAvatars` | `lib/nina/queries/avatars.ts:933` | def | `lib/nina` |
| `deleteNinaMessageImage` | `lib/nina/queries/images.ts:863` | def | `lib/nina` |
| `isBlobPathnameReferenced` | `lib/nina/queries/images.ts:926` | def | `lib/nina` |
| `isOriginalPhoto` | `lib/nina/queries/images.ts:489` | def | `lib/nina` |
| `contentHashOf` | `lib/photos/contentHash.ts:40` | def | `lib/photos` |
| `signImageBytes` | `lib/nina/perceptualSign.ts:48` | def | `lib/nina` |
| `fetchAndSignImage` | `lib/nina/perceptualSign.ts:82` | def | `lib/nina` |
| `deleteNinaAvatarAction` | `lib/admin/ninaAlbumAvatarActions.ts:283` | call site (del, no guard) | `lib/admin` |
| `reapAvatarBlobs` | `lib/admin/ninaAlbumFolderActions.ts:115` | call site (del, no guard) | `lib/admin` |
| `deleteNinaAlbumFolderAction` | `lib/admin/ninaAlbumFolderActions.ts:380` | call site | `lib/admin` |
| `removeNinaAvatarsAction` | `lib/admin/ninaAlbumFolderActions.ts:441` | call site | `lib/admin` |
| chat-photo remove | `lib/admin/chatPhotoActions.ts:640` | call site (has guard) | `lib/admin` |
| runner remove-from-bubble | `lib/nina/albumActions.ts:217` | call site (has guard) | `lib/nina` |
| `buildFillOps` / `buildFillPerceptualOps` | `scripts/nina-dedupe-plan.mjs:300,364` | sweep repair | `scripts` |
| `nina_message_images.source_avatar_id` FK | `lib/db/schema/nina/chat.ts:624-626` | schema (`ON DELETE SET NULL`) | `lib/db` |
| `nina_message_images.source_image_id` FK | `lib/db/schema/nina/chat.ts:627-629` | schema (`ON DELETE SET NULL`) | `lib/db` |
| `tests/nina.dedupe.test.ts` | — | test (existing dedup unit suite) | `tests` |
| `tests/admin.chatPhotoDedupe.test.ts` | — | test (existing) | `tests` |
| `tests/nina.imageDedupe.test.ts` | — | test (existing) | `tests` |

---

## Impact Points (files that WILL need changes)

1. **New module** `lib/nina/provenancePromotion.ts` — the shared "find dependents, fetch once per
   pathname, promote" helper. Phase 1.
2. `lib/nina/queries/avatars.ts` — a new query fn to select dependents by
   `source_avatar_id`/`source_image_id` with `content_hash IS NULL`, and a new query fn (or an
   extension of an existing shape) to write the promotion, guarded `WHERE content_hash IS NULL`.
   Phase 1.
3. `lib/admin/ninaAlbumAvatarActions.ts` — call the promotion helper before `deleteNinaAvatar`,
   and gate the blob `del()` on `isBlobPathnameReferenced`. Phase 1.
4. `lib/admin/ninaAlbumFolderActions.ts` — same, for `deleteNinaAlbumFolderAction`,
   `removeNinaAvatarsAction`, and `reapAvatarBlobs`. Phase 1.
5. `lib/admin/chatPhotoActions.ts`, `lib/nina/albumActions.ts` — call the promotion helper before
   their existing `deleteNinaMessageImage` + `isBlobPathnameReferenced` sequence (the guard exists
   here already; only the promotion step is missing). Phase 1.
6. Unit tests for the new promotion helper and for each call site's ordering (promote → delete →
   guarded blob delete). Phase 1.
7. A new remediation script under `scripts/` (or a new pass in `nina-dedupe-plan.mjs`'s family)
   that finds existing "unmeasured original" rows (`isOriginalPhoto()` true, `content_hash IS
   NULL`, `perceptual_hash IS NULL`), attempts the same promotion by refetching the Blob object,
   and reports (never auto-deletes) any whose object is already gone. Phase 2. Dry-run by
   default, following the sweep's own `--apply` convention; running `--apply` against production
   is a manual follow-up, out of scope for unattended execution.

**This document describes. The plan files prescribe.**
