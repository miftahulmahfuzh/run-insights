# Phase 1: Promote dependents before delete, guard the blob delete

**Plan set:** `NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md`
**Analysis:** `20260916-104336-G7K2_code_analyzer.md`
**Satisfies:** R1 — a reference row that loses its provenance must never become a permanently
invisible, potentially-broken duplicate in `/nina/about`'s Media grid
**Depends on:** none
**Difficulty:** HARD
**Package:** `lib/nina` (with call sites in `lib/admin`)

---

## Goal

After this phase, every path that deletes a `nina_avatars` row or a `nina_message_images`
"original" first **promotes** the rows that reference it — fetching the shared Blob object once per
distinct pathname and writing `content_hash` / `perceptual_hash` / `perceptual_sig` / `width` /
`height` / `bytes` onto the dependents — so that the instant the FK's `ON DELETE SET NULL` fires,
the survivor is already a fully measured, dedup-eligible original. And every avatar-delete's
`del()` is gated on `isBlobPathnameReferenced`, exactly as the chat-photo side already is, so the
promoted dependent legitimately keeps its bytes alive.

The two defects the analysis names close at the same choke point, in the same order, at all five
call sites: **promote → delete the row → ask whether anything still points at the object → only
then `del()`**.

## Interface Contract

**Creates:**
- `lib/nina/provenancePromotion.ts` (new module) exporting:
  - `promoteNinaAvatarDependents(userId: string, avatarIds: readonly string[]): Promise<NinaPromotionReport>`
  - `promoteNinaImageDependents(userId: string, imageIds: readonly string[]): Promise<NinaPromotionReport>`
  - `interface NinaPromotionReport { found: number; fetched: number; promoted: number }` (type-only)
- `lib/nina/queries/images.ts`: `listUnmeasuredNinaImageDependents` (value export, reaches the
  barrel), `promoteNinaImageMeasurements` (value export, reaches the barrel),
  `interface NinaImageDependent` + `interface NinaImageMeasurement` (type-only exports)
- `lib/nina/queries/avatars.ts`: `listNinaAvatarIdsInFolderTree` (value export, reaches the barrel)
- `tests/nina.provenancePromotion.test.ts` (new)
- `tests/admin.albumAvatarDelete.test.ts` (new)

**Signature changes:**
- `reapAvatarBlobs(rows)` -> `reapAvatarBlobs(userId, rows)` — module-private to
  `lib/admin/ninaAlbumFolderActions.ts`, both call sites are in that file.

**Deletes:** nothing. No symbol, no column, no config key is removed.

**Renames:** none.

**Barrel surface growth (must land in the same commit):** `lib/nina/queries.test.ts`'s
`BARREL_VALUE_EXPORTS` goes **93 -> 96** with `listNinaAvatarIdsInFolderTree`,
`listUnmeasuredNinaImageDependents`, `promoteNinaImageMeasurements` — added sorted, each with the
one-line "documented growth" comment that file's header demands.

**Requires (from earlier phases):** none — this phase is first.

**Leaves alone (owned by others):**
- `scripts/**` — every file under it is Phase 2's. This phase creates and edits nothing there.
- `lib/db/schema/nina/chat.ts` — the two FKs' `ON DELETE SET NULL` is deliberate and unchanged.
- `lib/nina/actions/send.ts` — `resolveAttachment`'s reference-write path is already correct.
- `lib/nina/perceptual.ts`, `lib/nina/perceptualSign.ts`, `lib/photos/contentHash.ts` — consumed
  as-is; the one-signer rule (`perceptualSign.ts`'s header) forbids a second pipeline, and this
  phase adds none.
- `lib/nina/blobRelease.ts` — consumed as-is (`releaseBlobIfUnreferenced` gains a second caller
  family; the function itself does not change).

**New import edge, and the four suites it reaches (added by the reconciler, 2026-09-16):**
`lib/nina/provenancePromotion.ts` statically imports `./perceptualSign`, which opens with
`import 'server-only'` and `import sharp from 'sharp'` — both at module load, unconditionally, and
**not** lazily behind the first dependent. So wiring the helper into
`lib/admin/ninaAlbumAvatarActions.ts`, `lib/admin/ninaAlbumFolderActions.ts` and
`lib/nina/albumActions.ts` puts `sharp` into the import graph of every suite that imports the real
`@/lib/admin/ninaAlbumActions` barrel, where it has never been before. Verified against the
worktree: that is `tests/admin.albumActionsBarrel.test.ts`, `tests/admin.albumAvatarActions.test.ts`,
`tests/admin.albumDescribeEmbed.test.ts` and `tests/admin.chatPhotoAdoption.test.ts`. None of them
has a `deleteNinaAvatarAction` / `removeNinaAvatarsAction` / `deleteNinaAlbumFolderAction` case, so
none of them has a statement-order or FIFO-queue problem — the edge is the only effect. Step 12
owns it.

**Deviation from the plan index's sketch, recorded here so the reconciler sees it:** the index
describes the helper as taking `{ id, blobUrl, pathname }` refs. It takes **ids only**. The
parent's own `blobUrl`/`pathname` are an input to the *blob-delete* step, not to promotion — the
dependents carry their own copies of both columns and the helper reads them from the dependent
rows. Passing the parent's refs would be a parameter nothing reads.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/images.ts` | modify | new `NinaImageDependent`, `NinaImageMeasurement`, `listUnmeasuredNinaImageDependents`, `promoteNinaImageMeasurements` inserted between `deleteNinaMessageImage` (`:873`) and `isBlobPathnameReferenced` (`:875`); one stale-prose fix at `:543` |
| `lib/nina/queries/avatars.ts` | modify | new `listNinaAvatarIdsInFolderTree` inserted before `deleteNinaAvatarsInFolderTree`'s docstring (`:870`) |
| `lib/nina/provenancePromotion.ts` | create | the shared promote-before-delete helper |
| `lib/admin/ninaAlbumAvatarActions.ts` | modify | imports (`:3`, `:20-30`); stale paragraph in `setChatPhotoAsAvatarAction`'s docstring (`:79-90`); `deleteNinaAvatarAction` body (`:283-321`) |
| `lib/admin/ninaAlbumFolderActions.ts` | modify | imports (`:23-34`); `reapAvatarBlobs` (`:86-134`); `deleteNinaAlbumFolderAction` (`:397-398`); `removeNinaAvatarsAction` (`:451-452`) |
| `lib/admin/chatPhotoActions.ts` | modify | one import line (`:30` block) and one call inserted at `:636` |
| `lib/nina/albumActions.ts` | modify | one import line (`:9`) and one call inserted at `:217` |
| `lib/nina/queries.test.ts` | modify | `BARREL_VALUE_EXPORTS` 93 -> 96 |
| `tests/nina.provenancePromotion.test.ts` | create | the helper's decision logic |
| `tests/admin.albumAvatarDelete.test.ts` | create | `deleteNinaAvatarAction`'s order |
| `tests/admin.folderActions.test.ts` | modify | the two delete suites' enqueue order + new order assertions |
| `tests/nina.galleryDelete.test.ts` | modify | mock the helper; assert promote-before-delete |
| `tests/nina.attachTargets.test.ts` | modify | mock the helper (the module it imports grew a dependency) |
| `tests/admin.chatPhotos.test.ts` | modify | mock the helper; assert promote-before-delete on Remove |
| `tests/admin.chatPhotoAdoption.test.ts` | modify | one stale sentence in the file header (Step 11); also a barrel importer — see Step 12 |
| `tests/admin.albumActionsBarrel.test.ts` | modify | Step 12: the new `provenancePromotion` edge, mocked by that file's own stated rule |
| `tests/admin.albumAvatarActions.test.ts` | modify (conditional) | Step 12: edge mock **only if** the suite trips on the new `sharp`/`server-only` edge |
| `tests/admin.albumDescribeEmbed.test.ts` | modify (conditional) | Step 12: same conditional edge mock |

**Files count: 15 certain + 2 conditional.** The two conditional rows are Step 12's: they are
touched only if running them proves the new import edge actually breaks them. A phase that lands
without touching them has not skipped a step — it has taken Step 12's first branch.

---

## Implementation Steps

### Step 1: The two new statements in `lib/nina/queries/images.ts`

**File:** `lib/nina/queries/images.ts` — insert immediately after `deleteNinaMessageImage` ends at
`:873` and immediately before `isBlobPathnameReferenced`'s docstring begins at `:875`.

**Change:** the dependent lookup and the guarded, batched promotion UPDATE. Placed between the row
delete and the reference check so the file reads in the order the call sites run:
promote → delete → ask.

No new imports are needed: `and`, `asc`, `eq`, `inArray`, `isNull`, `or`, `type SQL` are all
already imported at `:1-13`, and `isValidContentHash`,
`normalizeClaimedPerceptualHash`/`normalizeClaimedPerceptualSig` at `:19-23`.

**Code:**

```ts
/**
 * One row a parent's delete is about to orphan: a REFERENCE that carries no measurements of its
 * own, about to be reclassified as an "original" by `isOriginalPhoto()` the moment the FK fires.
 *
 * Three columns and no more. The promotion needs an id to write to and the object's two spellings
 * to fetch and to guard on; `description` is `glm-4.6v`'s private text (invariant 5) and has no
 * business in a projection whose only consumer is a `fetch`.
 */
export interface NinaImageDependent {
  id: string
  blobUrl: string
  pathname: string
}

/**
 * **"Which of this user's rows point at the parents that are about to be deleted, and have never
 * been measured?"** The read half of the promote-before-delete rule (`lib/nina/provenancePromotion.ts`).
 *
 * ── WHY IT MUST RUN BEFORE THE PARENT'S DELETE, AND CAN NEVER BE ASKED AFTER ────────────────
 * `nina_message_images.source_avatar_id` and `.source_image_id` are both `ON DELETE SET NULL`
 * (`lib/db/schema/nina/chat.ts:614-618`, deliberate: *"the collection KEEPS the picture instead of
 * losing it"*). Postgres fires that inside the parent DELETE's own statement, so the link this
 * query reads is gone before the delete returns. There is no later moment in the request at which
 * "the dependents, keyed by the parent id" can be found again — which is the whole reason the
 * promotion is ordered first.
 *
 * ── `content_hash IS NULL` IS THE QUALIFIER, AND IT IS ONE COLUMN ON PURPOSE ────────────────
 * A row that already carries a hash has already been measured — by the sweep's `fill-hash` op, by
 * an earlier promotion, or by a writer that owned its bytes — and re-fetching its object to
 * re-measure it would be a GET for a value that is already correct. One column rather than a
 * conjunction over all six: `content_hash` is the column BOTH dedup mechanisms ultimately gate on
 * (`findNinaImageByContentHash` reads it directly, and the promotion writes the perceptual pair in
 * the same statement that fills it), and the sweep's own `fill-hash` guard is spelled exactly this
 * way. A row with a hash but no signature is the sweep's `fill-perceptual` case, not this one's.
 *
 * ── EITHER COLUMN, AS AN `OR` OF TWO `IN` LISTS ─────────────────────────────────────────────
 * An avatar delete supplies `avatarIds`, a chat-photo delete supplies `imageIds`, and the shape
 * admits both at once because a future caller deleting across both tables in one gesture must not
 * have to run this twice and merge the halves itself. An arm with no ids is omitted rather than
 * emitted as `in ()`, which drizzle spells differently across versions and which
 * `moveNinaAvatarsToFolder` already declines to depend on. Both lists empty answers `[]` without a
 * statement.
 *
 * ── NO `isOriginalPhoto()`, AND THAT IS THE POINT ───────────────────────────────────────────
 * Every row this returns is, by construction, a REFERENCE — that predicate would exclude all of
 * them. The rows are about to STOP being references, which is what this whole read exists to get
 * ahead of.
 *
 * ── ORDERED BY PATHNAME, BECAUSE THE CALLER GROUPS BY IT ────────────────────────────────────
 * The promotion fetches each distinct pathname's bytes at most once, so handing it rows already
 * clustered makes the grouping a single pass and makes the GET order stable across runs — which is
 * what lets a partial failure (one dead object among twenty) be reproduced rather than guessed at.
 * `id` is the tiebreak for the usual reason: `pathname` ties for every row that shares an object.
 *
 * Owner-scoped in the WHERE (`lib/nina/queries.ts`'s rule 1). The parent ids arrive from a Server
 * Action's argument and are claims; a claim naming another user's parent simply matches none of
 * this user's rows, which is the same "not yours and does not exist are one answer" this layer
 * gives everywhere else. No index carries `source_avatar_id`/`source_image_id` (see the columns'
 * own header in the schema) — this is a bounded scan filtered by `user_id`, run once per
 * human-paced delete, and **no index is being added**.
 */
export async function listUnmeasuredNinaImageDependents(
  userId: string,
  parents: { avatarIds?: readonly string[]; imageIds?: readonly string[] },
): Promise<NinaImageDependent[]> {
  const avatarIds = [...new Set(parents.avatarIds ?? [])]
  const imageIds = [...new Set(parents.imageIds ?? [])]

  const arms: SQL[] = []
  if (avatarIds.length > 0) arms.push(inArray(ninaMessageImages.sourceAvatarId, avatarIds))
  if (imageIds.length > 0) arms.push(inArray(ninaMessageImages.sourceImageId, imageIds))
  if (arms.length === 0) return []

  return db
    .select({
      id: ninaMessageImages.id,
      blobUrl: ninaMessageImages.blobUrl,
      pathname: ninaMessageImages.pathname,
    })
    .from(ninaMessageImages)
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        or(...arms),
        isNull(ninaMessageImages.contentHash),
      ),
    )
    .orderBy(asc(ninaMessageImages.pathname), asc(ninaMessageImages.id))
}

/**
 * Everything one Blob object's bytes say about themselves, measured once, in one place.
 *
 * `contentHash` and `bytes` are always present — they are arithmetic over the buffer and cannot
 * fail once the buffer exists. `signature` is `null` when `sharp` could not decode the bytes,
 * which is `signImageBytes`'s documented degradation and NOT a reason to withhold the hash: the
 * sweep's `fill-hash` and `fill-perceptual` are two ops for exactly this reason, and a row with a
 * hash and no signature participates in the byte-exact dedup arm while the perceptual arm waits
 * for the sweep.
 */
export interface NinaImageMeasurement {
  /** 64 lowercase hex over the exact bytes the object serves (`contentHashOf`). */
  contentHash: string
  /** The object's size in bytes, as fetched — never a claim. */
  bytes: number
  /** `signImageBytes`'s pair plus the dimensions it measured, or `null` if sharp could not read them. */
  signature: { dhashHex: string; sig16Base64: string; width: number; height: number } | null
}

/**
 * **PROMOTE: a reference becomes a measured original, one statement per shared object.** The write
 * half of the promote-before-delete rule, and the statement that makes the `ON DELETE SET NULL`
 * reclassification honest instead of silent.
 *
 * ── WHY THE WHERE DELIBERATELY OMITS `isOriginalPhoto()` ────────────────────────────────────
 * Every other write in this section carries it — `updateNinaChatPhotoBlob`,
 * `updateNinaChatPhotoPerceptualSignature` and `updateNinaChatPhotoDescription` all refuse a
 * reference, because a reference re-shows bytes that live elsewhere and a fact written onto it
 * would be a fact about bytes it does not own. This statement is the ONE exception in the file and
 * the exception is the requirement: its rows are references *for another few milliseconds*, and
 * the values being written are measurements of the object their own `blob_url` serves and will go
 * on serving after their parent is gone. Adding the predicate here would make the statement a
 * guaranteed no-op. **Do not "restore consistency" by adding it.**
 *
 * The window this opens is provably inert. Between this UPDATE and the parent's DELETE the row is
 * a reference that carries a hash and a signature — and both dedup reads that could act on those
 * values, `findNinaImageByContentHash` and `findNinaSignedOriginals`, carry `isOriginalPhoto()` in
 * their own WHERE. Nothing can match against it until it stops being a reference. The sweep is the
 * same answer from the other side: `scripts/nina-dedupe-plan.mjs`'s header already states that
 * *"every row is hashed"*, references included, and its perceptual merge already excludes them — so
 * a row this statement measures is a row the sweep would eventually have measured anyway. This
 * writes it at the one moment it matters instead of at the next manual run.
 *
 * ── THE TWO GUARDS, AND WHAT EACH ONE STOPS ─────────────────────────────────────────────────
 *   · `content_hash IS NULL` — idempotence against a concurrent promotion, the sweep's own
 *     `fill-hash` guard (`update ... where id = $1 and content_hash is null`) spelled in drizzle.
 *     A second promoter, a retried Server Action, or the sweep running mid-delete all resolve to
 *     "0 rows written", and the measurement that landed first is the one that stands.
 *   · `pathname = $n` — the ghost-signature lesson (2026-09-15), the same guard
 *     `updateNinaChatPhotoPerceptualSignature` carries and for the identical reason: between the
 *     dependent read and this write, the row can be repointed at other bytes (an admin Replace, a
 *     sweep repoint). Writing THESE bytes' measurements onto THOSE bytes' row is how a ghost is
 *     minted, and this clause is what makes that a no-op instead.
 *
 * ── ONE STATEMENT PER OBJECT, NOT PER ROW ───────────────────────────────────────────────────
 * `id IN (...)` because the rows that share a pathname share a measurement by definition — one
 * object, one GET, one UPDATE. Deleting a folder of two hundred avatars that a conversation
 * referenced is therefore bounded by how many distinct OBJECTS are involved, not by how many rows
 * point at them, which is `deleteNinaAvatars`' own argument against a loop.
 *
 * ── WHAT IT WRITES, AND WHAT IT LEAVES ALONE WHEN SHARP FAILED ──────────────────────────────
 * `content_hash` and `bytes` always. The perceptual pair and `width`/`height` are spread in only
 * when the signature exists AND both halves normalize through the one parsers
 * (`lib/nina/perceptual.ts`) — an absent or malformed pair leaves those four columns untouched
 * rather than writing NULL over them, because "could not measure" is not the same claim as "has no
 * value" and the sweep's `fill-perceptual` op is what fills them later. It is the one place in this
 * file where `.set()` is built conditionally, and the reason is that the alternative erases data.
 *
 * Returns how many rows were written. `0` is an ordinary outcome — someone else promoted them, the
 * pathname moved, or the rows are gone — and no caller treats it as a failure.
 */
export async function promoteNinaImageMeasurements(
  userId: string,
  pathname: string,
  ids: readonly string[],
  measurement: NinaImageMeasurement,
): Promise<number> {
  if (ids.length === 0) return 0
  /* The door rule `insertNinaMessageImages` applies to a client claim, applied to a measured one:
   * a value that is not 64 lowercase hex is not one of ours and must never reach the column. */
  if (!isValidContentHash(measurement.contentHash)) return 0

  const signature = measurement.signature
  const perceptualHash =
    signature == null ? null : normalizeClaimedPerceptualHash(signature.dhashHex)
  const perceptualSig =
    signature == null ? null : normalizeClaimedPerceptualSig(signature.sig16Base64)
  const measured =
    signature != null && perceptualHash != null && perceptualSig != null
      ? { perceptualHash, perceptualSig, width: signature.width, height: signature.height }
      : {}

  const promoted = await db
    .update(ninaMessageImages)
    .set({
      contentHash: measurement.contentHash,
      bytes: measurement.bytes,
      ...measured,
    })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        inArray(ninaMessageImages.id, [...ids]),
        eq(ninaMessageImages.pathname, pathname),
        isNull(ninaMessageImages.contentHash),
      ),
    )
    .returning({ id: ninaMessageImages.id })

  return promoted.length
}
```

**Impact:** two new value exports reach the barrel (Step 8 updates the frozen list). Nothing
existing changes behaviour.

---

### Step 2: The stale-prose fix in `lib/nina/queries/images.ts`

**File:** `lib/nina/queries/images.ts:543-544` — inside `generatedChatPhotoScope`'s docstring, the
paragraph headed **"The copy is not being un-copied…"**.

**Change:** the sentence *"(an album delete calls `del` with no reference check, so a shared object
would blank the chat bubble the day the album row went away)"* becomes false the moment Step 5
lands. The DECISION it supports — bytes copied, not shared — still stands; only the reason changes.
Replace exactly that parenthetical.

**Code:** the surrounding text is unchanged; the parenthetical becomes:

```ts
 * **The copy is not being un-copied, and no back-reference column is being added.** "Bytes copied,
 * not shared" is deliberate (until the ghost-photo fix an album delete called `del` with no
 * reference check at all, so a shared object would blank the chat bubble the day the album row
 * went away; the delete is reference-checked now — `lib/admin/ninaAlbumAvatarActions.ts` and
 * `reapAvatarBlobs` both ask `isBlobPathnameReferenced` first — but a copy is still what makes the
 * two sides' framing, folder and lifetime independent of each other), and a new column would be a
 * migration for a fact `nina_avatars.source_key` already states.
```

**Impact:** comment only.

---

### Step 3: The pre-delete id read in `lib/nina/queries/avatars.ts`

**File:** `lib/nina/queries/avatars.ts` — insert at `:870`, immediately before
`deleteNinaAvatarsInFolderTree`'s docstring (which currently begins at `:871`).

**Change:** `deleteNinaAlbumFolderAction` is the one avatar-delete site that does not know which
ids it is about to remove — it names a folder and the statement resolves the subtree. Promotion
needs those ids while the rows are still live, so the subtree is read once before it is deleted.
This must live in this module because `folderSubtree` is module-private here (and deliberately so:
"a predicate over a folder column is not a thing a caller outside the data layer has any use for").

No new imports: `and`, `eq`, `db`, `ninaAvatars`, `folderSubtree` are all in scope.

**Code:**

```ts
/**
 * The ids `deleteNinaAvatarsInFolderTree` is about to remove, read while the rows are still there.
 *
 * ── WHY THE DELETE'S OWN `RETURNING` CANNOT ANSWER THIS ─────────────────────────────────────
 * It can, and too late. `nina_message_images.source_avatar_id` is `ON DELETE SET NULL`, so the
 * dependents stop naming these ids inside the DELETE's own statement — by the time the refs come
 * back, the rows that pointed at them have already been cut loose. The ghost-photo fix
 * (`lib/nina/provenancePromotion.ts`) has to find them BEFORE, and "before" means a separate read.
 *
 * ── THE WHERE IS `deleteNinaAvatarsInFolderTree`'s, CLAUSE FOR CLAUSE ───────────────────────
 * Same `user_id`, same `is_current = false`, same `folderSubtree(folder)` — deliberately, so the
 * set this returns is exactly the set that statement will delete. The `is_current` clause is the
 * load-bearing one: under `keepCurrent` her current photograph stays behind, and promoting the
 * dependents of a row that is NOT going anywhere would spend a GET per object to write
 * measurements nothing is waiting for. Any drift between the two WHEREs shows up as a dependent
 * that was promoted for nothing (harmless) or one that was not promoted at all (the bug this fix
 * exists to stop) — so if one of them ever changes, so does the other, in the same commit.
 *
 * Ids only. The caller hands them to a lookup keyed on `source_avatar_id`; it has no use for the
 * blob refs, and `deleteNinaAvatarsInFolderTree`'s `RETURNING` is what carries those to the reap.
 *
 * A race is possible and is the tolerable direction: a row filed into the folder between this read
 * and the delete is deleted un-promoted, which is exactly today's behaviour for that row, and the
 * promotion is a best-effort optimisation by its own module's doctrine — never a gate on the
 * operator's delete.
 */
export async function listNinaAvatarIdsInFolderTree(
  userId: string,
  folder: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: ninaAvatars.id })
    .from(ninaAvatars)
    .where(
      and(
        eq(ninaAvatars.userId, userId),
        eq(ninaAvatars.isCurrent, false),
        folderSubtree(ninaAvatars.folder, folder),
      ),
    )
  return rows.map((row) => row.id)
}
```

**Impact:** one new value export on the barrel (Step 8).

---

### Step 4: The shared helper — `lib/nina/provenancePromotion.ts`

**File:** `lib/nina/provenancePromotion.ts` (new, whole file below)

**Change:** the one implementation of "find the dependents, fetch each object once, promote them",
with the degrade-on-failure ladder every dedup write in this codebase follows.

It is a plain server module and **not** `'use server'`, for `lib/nina/blobRelease.ts`'s recorded
reason: a `'use server'` export is a public POST endpoint, and "measure these rows for me" is not a
decision a client gets to POST. It does not open with `import 'server-only'`, matching its sibling
`blobRelease.ts`; `./perceptualSign` carries that marker and this module is unreachable from a
client bundle through it.

**Code:**

```ts
import { contentHashOf } from '@/lib/photos/contentHash'

import { signImageBytes } from './perceptualSign'
import {
  listUnmeasuredNinaImageDependents,
  promoteNinaImageMeasurements,
  type NinaImageDependent,
  type NinaImageMeasurement,
} from './queries'

/**
 * **Promote the rows a delete is about to orphan, before it orphans them.** The one implementation
 * of the ghost-photo fix, so the five delete paths share its argument and none of them can drift.
 *
 * ── THE BUG THIS EXISTS TO STOP, IN FULL ─────────────────────────────────────────────────────
 * `resolveAttachment` (`lib/nina/actions/send.ts`) implements the re-share by COPYING
 * `blob_url`/`pathname` onto a new `nina_message_images` row and naming the source in
 * `source_avatar_id` / `source_image_id`. No bytes are copied, and — by the column header's own
 * doctrine — a reference carries NO measurements: `content_hash`, `perceptual_hash`,
 * `perceptual_sig`, `width`, `height` and `bytes` are all NULL, because the keeper owns them.
 * That is correct while the keeper exists.
 *
 * Both provenance FKs are `ON DELETE SET NULL` (`lib/db/schema/nina/chat.ts:614-618`, deliberate:
 * *"the collection KEEPS the picture instead of losing it"*). So the instant the parent row is
 * deleted, the reference silently reclassifies: `isOriginalPhoto()` now counts it, `/nina/about`'s
 * Media grid shows it, and it carries not one of the columns either dedup mechanism needs. It is a
 * photograph that can never be recognised as a duplicate of anything, forever — measured on
 * production 2026-09-16 (`nina_message_images.id = 'Tdw_AkrJT0ks'`, byte-identical prose to a
 * selfie four tiles away, every measurement NULL, its Blob object already 404).
 *
 * The fix is not to change the FK — the FK is right, and the schema comment already promises the
 * outcome this module delivers. The fix is to make the row TRUE before the transition: fetch the
 * object it already points at, measure those bytes, and write the measurements onto it while its
 * parent is still alive. Then `ON DELETE SET NULL` produces a fully-formed original instead of a
 * ghost, and the caller's `isBlobPathnameReferenced` check afterwards correctly refuses to delete
 * the bytes that original now owns.
 *
 * ── IT CAN NEVER COST THE OPERATOR THEIR DELETE (plan invariant 3) ──────────────────────────
 * Every failure here degrades to exactly today's behaviour — the dependent stays unmeasured — and
 * is logged, never thrown. Nothing in this module rejects: the lookup is wrapped, each object's
 * fetch/hash/sign is wrapped, each write is wrapped, and one dead object does not stop the objects
 * after it. This is the same ladder `lib/nina/imagerun.ts`'s `storeNinaImage` walks for its dedup
 * lookup (*"a dead connection at the lookup degrades to today's behavior... and never to a lost
 * photograph"*) and the one `lib/nina/dedupe.ts`'s header states for the whole family. A dedup
 * optimisation failing must never make the user's actual request fail.
 *
 * ── ONE GET PER OBJECT, NOT PER ROW, AND IT IS SEQUENTIAL ───────────────────────────────────
 * Two rows that re-show the same photograph name the same `pathname`, so they are the same bytes
 * and the same measurement; grouping by pathname is what turns "a bubble that showed her face four
 * times" into one GET. The groups are walked SEQUENTIALLY rather than in `Promise.all`: each GET
 * holds a whole image in memory, this runs inside a Server Action with a duration limit, and a
 * folder delete can involve a hundred objects — concurrency here trades a bounded, slow, correct
 * pass for an unbounded memory spike in the one code path that must not fail.
 *
 * ── AND IT FETCHES ONCE, NOT TWICE ──────────────────────────────────────────────────────────
 * `fetchAndSignImage` (`./perceptualSign`) would be the obvious call and it is the wrong one here:
 * it fetches and signs, and this module needs the HASH of the same bytes too. So the GET happens
 * once, in `measureBlobObject`, and `contentHashOf` and `signImageBytes` both run over the one
 * buffer — which is also the only arrangement in which the hash and the signature are guaranteed
 * to describe the same bytes.
 */

/** What one promotion pass did, for the log line and for the suite. Every call site ignores it. */
export interface NinaPromotionReport {
  /** Unmeasured dependents found still naming one of the parents. */
  found: number
  /** Distinct Blob objects successfully fetched and measured — at most one GET per pathname. */
  fetched: number
  /** Rows the guarded UPDATE actually wrote. */
  promoted: number
}

const NOTHING: NinaPromotionReport = { found: 0, fetched: 0, promoted: 0 }

/**
 * Promote everything that re-shows one of these ALBUM photographs. Call it immediately before
 * `deleteNinaAvatar` / `deleteNinaAvatars` / `deleteNinaAvatarsInFolderTree`, never after.
 */
export async function promoteNinaAvatarDependents(
  userId: string,
  avatarIds: readonly string[],
): Promise<NinaPromotionReport> {
  return promoteDependents(userId, { avatarIds })
}

/**
 * Promote everything that re-shows one of these CHAT photographs. Call it immediately before
 * `deleteNinaMessageImage` (or before the `deleteNinaMessage` that takes the row with it), never
 * after.
 */
export async function promoteNinaImageDependents(
  userId: string,
  imageIds: readonly string[],
): Promise<NinaPromotionReport> {
  return promoteDependents(userId, { imageIds })
}

/**
 * The pass itself. Read, group by object, measure each object once, write each group once.
 *
 * The two public names above are thin on purpose: the parents live in two different tables and a
 * caller must not be able to hand an avatar id to the image arm by getting an object key wrong.
 * One `kind` parameter would have made that a runtime mistake; two functions make it a type error.
 */
async function promoteDependents(
  userId: string,
  parents: { avatarIds?: readonly string[]; imageIds?: readonly string[] },
): Promise<NinaPromotionReport> {
  const avatarIds = parents.avatarIds ?? []
  const imageIds = parents.imageIds ?? []
  if (avatarIds.length === 0 && imageIds.length === 0) return NOTHING

  let dependents: NinaImageDependent[]
  try {
    dependents = await listUnmeasuredNinaImageDependents(userId, { avatarIds, imageIds })
  } catch (cause) {
    /* Could not even ask. The delete proceeds and the dependents stay unmeasured — today's
     * behaviour exactly, which is the whole promise of this module's degradation ladder. */
    console.warn('[nina] could not look up dependents before a delete; skipping promotion', {
      avatars: avatarIds.length,
      images: imageIds.length,
      error: String(cause),
    })
    return NOTHING
  }
  if (dependents.length === 0) return NOTHING

  /* Grouped by pathname, because rows that share a pathname share an object and therefore share a
   * measurement. `blobUrl` is taken from the first row of each group: the two columns are written
   * together by every writer in the repo, so any row of the group names the same object, and the
   * UPDATE re-checks `pathname` anyway. */
  const groups = new Map<string, { blobUrl: string; ids: string[] }>()
  for (const row of dependents) {
    const group = groups.get(row.pathname)
    if (group == null) groups.set(row.pathname, { blobUrl: row.blobUrl, ids: [row.id] })
    else group.ids.push(row.id)
  }

  let fetched = 0
  let promoted = 0
  for (const [pathname, group] of groups) {
    const measurement = await measureBlobObject(group.blobUrl)
    if (measurement == null) {
      /* A dead object, a redirect loop, an undecodable body. Named individually, because this is
       * the one state from which the row is UNRECOVERABLE — there are no bytes left to measure —
       * and an operator reading this log line is the only person who can decide what to do about
       * it. The objects after it are unaffected. */
      console.warn('[nina] could not measure a dependent photograph before its parent went away', {
        pathname,
        rows: group.ids.length,
      })
      continue
    }
    fetched++

    try {
      promoted += await promoteNinaImageMeasurements(userId, pathname, group.ids, measurement)
    } catch (cause) {
      console.warn('[nina] dependent promotion write failed', {
        pathname,
        rows: group.ids.length,
        error: String(cause),
      })
    }
  }

  if (promoted > 0) {
    console.info('[nina] promoted dependents ahead of a delete', {
      found: dependents.length,
      objects: groups.size,
      fetched,
      promoted,
    })
  }

  return { found: dependents.length, fetched, promoted }
}

/**
 * GET the object once and measure everything about it. `null` for a bad URL, a failed GET, an
 * empty body, or a platform with no `crypto.subtle` — the same shape and the same silence
 * `fetchAndSignImage` uses one module over, for the same reason.
 *
 * The `https:` check is `fetchAndSignImage`'s, verbatim in intent: the only URLs that reach here
 * come out of `nina_message_images.blob_url`, and a value that is not an https URL is a row this
 * pass has nothing useful to say about — not a reason to let `fetch` follow it anywhere.
 *
 * A `signImageBytes` failure is NOT a measurement failure. The hash is arithmetic over the buffer
 * and always survives; the signature is `sharp`'s opinion and may not. Returning the hash with a
 * `null` signature is what lets the byte-exact dedup arm work on a photograph whose container
 * sharp could not read, and the sweep's `fill-perceptual` op owns the rest.
 */
async function measureBlobObject(blobUrl: string): Promise<NinaImageMeasurement | null> {
  try {
    const parsed = new URL(blobUrl)
    if (parsed.protocol !== 'https:') return null

    const response = await fetch(parsed, { redirect: 'follow' })
    if (!response.ok) return null

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0) return null

    const [contentHash, signature] = await Promise.all([
      contentHashOf(bytes),
      signImageBytes(bytes),
    ])
    return { contentHash, bytes: bytes.byteLength, signature }
  } catch {
    return null
  }
}
```

**Impact:** new module; nothing imports it until Steps 5-7.

---

### Step 5: `deleteNinaAvatarAction` — promote first, then release through the shared helper

**File:** `lib/admin/ninaAlbumAvatarActions.ts:3`, `:20-30`, `:79-90`, `:271-321`

**Change (a) — imports.** `del` is no longer used in this file; `put` still is.

Replace `:3`:

```ts
import { put } from '@vercel/blob'
```

Add to the `@/lib/nina/queries` import block at `:20-30` — nothing new is needed there — and add
two new import lines after it, in the existing alphabetical-by-path grouping:

```ts
import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import { promoteNinaAvatarDependents } from '@/lib/nina/provenancePromotion'
```

**Change (b) — the module header bullet at `:38`.** It currently reads
`· \`deleteNinaAvatarAction\` removes one photo, and its blob(s) with it.` Replace with:

```ts
 *   · `deleteNinaAvatarAction` removes one photo — promoting anything that re-shows it first, and
 *     then releasing its blob(s) only if nothing else still points at them.
```

**Change (c) — the now-false paragraph in `setChatPhotoAsAvatarAction`'s docstring, `:79-90`.**
Replace the whole `── THE BYTES ARE COPIED, NOT SHARED ──` block with:

```ts
 * ── THE BYTES ARE COPIED, NOT SHARED, AND THAT IS THE DECISION ────────────────────────────────
 * The two candidate designs were a `nina_avatars` row pointing at the chat photo's object, and
 * this: `fetch` + `put` into a fresh `avatar-` object. Sharing would win on storage and lose on
 * everything else. The original argument was that the album-side deletes called `del` with NO
 * reference check, so a shared object would break the day the operator removed the album row —
 * that half is fixed (the ghost-photo fix routes this file's delete through
 * `releaseBlobIfUnreferenced` and `reapAvatarBlobs` through `isBlobPathnameReferenced`), and the
 * decision survives it unchanged for the reasons that were always the stronger ones: a copy gives
 * the album row its OWN lifetime, its own folder and its own framing, so re-cropping her profile
 * picture cannot re-crop a photograph sitting in a conversation, and deleting either side cannot
 * turn the other into a row whose bytes are kept alive only by someone else's reference. A copy
 * costs one duplicate object (~100-500 KB). The adopted row also appears in `/admin/nina` (root
 * folder), where its framing can be re-tuned — which is a feature, not a leak.
```

**Change (d) — the action body, `:283-321`.** Replace the whole function (docstring included):

```ts
/**
 * Remove a photo from the album — and its blob with it, unless something else is still rendering
 * those exact bytes.
 *
 * ── PROMOTE, THEN DELETE THE ROW, THEN ASK, THEN `del` ──────────────────────────────────────
 * Three steps and the order of all three is load-bearing:
 *
 *   1. **Promote first.** A `nina_message_images` row can re-show this album photograph
 *      (`source_avatar_id` naming it) with no measurements of its own. The FK is
 *      `ON DELETE SET NULL`, so the delete below turns it into an "original" that no dedup
 *      mechanism can ever see — unless it is measured first, which is exactly what
 *      `promoteNinaAvatarDependents` does, and which can only be done while this id still links
 *      them. It cannot fail this action: every failure inside it degrades to today's behaviour and
 *      logs (see that module's header).
 *   2. **Row first, blob second.** Unchanged and for the unchanged reason: a failed `del` leaves
 *      an orphaned object, which is recoverable (`scripts/blob-reap.mjs`, and
 *      `reap-orphaned-blobs`), while a deleted blob under a live row is a permanently broken image.
 *   3. **Ask before deleting the bytes.** THIS IS NEW, and it is the second half of the
 *      ghost-photo fix. This action's `del` used to be unconditional, which is very probably how
 *      the production row found on 2026-09-16 came to point at a 404: the album row was deleted
 *      and a chat bubble was still rendering those exact bytes. `releaseBlobIfUnreferenced` is the
 *      ONE reference-checked release in the repo (`lib/nina/blobRelease.ts`) and this file now
 *      deletes through it rather than re-implementing the rule — *"a second copy of a delete rule
 *      is how the copy becomes the one that forgot the check"*, its own header. It is safe to ask
 *      AFTER the row is gone, and only then: this row has stopped referencing the object, so there
 *      is no "except this one" parameter to pass wrongly.
 *
 * ── TWO OBJECTS, TWO QUESTIONS, TWO RELEASES ────────────────────────────────────────────────
 * A row can carry a derived thumbnail (`nina_avatars.thumb_url`, F34 R1) and the row is the only
 * record it exists — its stored pathname carries Blob's random suffix and is not derivable — so a
 * delete that released one ref would leak an object nothing could ever find again. Both fields are
 * NULL for every pre-F34 row, and NULL means "there is nothing to delete", not "something went
 * wrong".
 *
 * This is the one place the previous `del([original, thumb])` becomes two calls, and that is the
 * cost of the check: the question "is anything still pointing at these bytes" is asked per OBJECT,
 * and the two objects have different answers (a chat row can reference the full-size photograph
 * while nothing on earth references its album thumbnail). One `del` of both would have to take the
 * weaker of the two answers for both.
 *
 * The current photo cannot be removed: `deleteNinaAvatar`'s WHERE clause refuses it, which is what
 * makes "zero current avatars" unreachable rather than repaired. A refused delete has already run
 * the promotion, and that is deliberately not defended against: the measurements written are true
 * statements about bytes those rows already serve, the sweep would have written them anyway
 * (`scripts/nina-dedupe-plan.mjs` hashes every row, references included), and both dedup reads
 * filter references — so the only cost is a GET that bought nothing. Buying a pre-read to avoid it
 * would cost one every time, for the common case that succeeds.
 */
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = avatarIdSchema.safeParse(rawId)
  if (!parsed.success) return { ok: false, error: 'Not an avatar id.' }

  /* STEP 1 — while `parsed.data` still links them. Never throws; see the module's header. */
  await promoteNinaAvatarDependents(userId, [parsed.data])

  /* STEP 2 — the row. This is the statement inside which `ON DELETE SET NULL` fires. */
  const removed = await deleteNinaAvatar(userId, parsed.data)
  if (removed == null) {
    return { ok: false, error: 'That is her current photo — make another one current first.' }
  }

  /* STEP 3 — the bytes, per object, and only if nothing else names them. */
  await releaseBlobIfUnreferenced(userId, {
    blobUrl: removed.blobUrl,
    pathname: removed.pathname,
  })
  if (removed.thumbUrl != null) {
    /* `thumb_pathname` and `thumb_url` are written together by `registerNinaAvatarsAction`, so a
     * URL with no pathname is not a state this table produces. If one ever appeared, asking about
     * the URL under both parameters is still a correct question — `isBlobPathnameReferenced` ORs
     * the pathname columns with the URL columns, and a pathname that matches nothing simply
     * contributes nothing to the answer. */
    await releaseBlobIfUnreferenced(userId, {
      blobUrl: removed.thumbUrl,
      pathname: removed.thumbPathname ?? removed.thumbUrl,
    })
  }

  revalidatePath('/admin/nina')
  return { ok: true }
}
```

**Impact:** the single avatar delete now issues 1 dependent SELECT (+ N promotion UPDATEs) before
its DELETE, and 2 reference SELECTs per object before each `del`. A shared object is now KEPT where
it was previously deleted — the behaviour change this phase is for.

---

### Step 6: The two bulk avatar deletes and the guarded reap

**File:** `lib/admin/ninaAlbumFolderActions.ts:23-34`, `:76-134`, `:397-398`, `:451-452`

**Change (a) — imports.** Add `isBlobPathnameReferenced` and `listNinaAvatarIdsInFolderTree` to the
`@/lib/nina/queries` block (`:23-34`, keeping it alphabetical), and one new import line after it:

```ts
import {
  declareNinaFolders,
  deleteNinaAvatars,
  deleteNinaAvatarsInFolderTree,
  deleteNinaFolderSubtree,
  getCurrentNinaAvatar,
  isBlobPathnameReferenced,
  listNinaAvatarFolders,
  listNinaAvatarIdsInFolderTree,
  moveNinaAvatarsToFolder,
  renameNinaAvatarFolder,
  renameNinaFolderSubtree,
  type NinaAvatarBlobRef,
} from '@/lib/nina/queries'
import { promoteNinaAvatarDependents } from '@/lib/nina/provenancePromotion'
```

**Change (b) — `reapAvatarBlobs` gains the guard.** Replace `:76-134` (the
`ADMIN_BLOB_DEL_BATCH` docstring through the end of `reapAvatarBlobs`) with:

```ts
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
 * How many objects' reference checks are in flight at once.
 *
 * `isBlobPathnameReferenced` is two SELECTs, and a folder delete can involve hundreds of objects,
 * so asking one at a time would serialise hundreds of neon-http round trips inside one Server
 * Action — the exact cost `deleteNinaAvatars` exists to avoid. Asking them ALL at once is the
 * other failure: a few hundred concurrent HTTP requests against one Neon endpoint is how a reap
 * turns into a rate-limit. A small fixed window is the answer, and the number is deliberately
 * unrelated to `ADMIN_BLOB_DEL_BATCH` above — that one bounds blast radius, this one bounds
 * concurrency, and coupling them would make one of the two arbitrary.
 */
const ADMIN_BLOB_REF_CHECK_CONCURRENCY = 8

/** One Blob object, in the two spellings `isBlobPathnameReferenced` and `del` respectively want. */
interface AvatarBlobObject {
  pathname: string
  url: string
}

/**
 * Delete the objects behind rows that are already gone — **the ones nothing else still points at**.
 * Never called before the rows are deleted, and never allowed to fail an action.
 *
 * ── THE REFERENCE CHECK IS NEW, AND IT IS THE GHOST-PHOTO FIX'S SECOND HALF ─────────────────
 * This function used to `del` every URL it was handed, unconditionally. That was a data-loss bug
 * of exactly the class `lib/nina/blobRelease.ts` was extracted to prevent on the chat side:
 * `resolveAttachment` copies `blob_url`/`pathname` onto a chat row rather than copying bytes, so an
 * album object can be the object behind a bubble in the runner's conversation — and a bulk album
 * delete would take the bytes out from under it, leaving a live row pointing at a 404. Measured on
 * production 2026-09-16 (`Tdw_AkrJT0ks`). So every object is now asked about first, per pathname,
 * AFTER its row is gone, and only the unreferenced ones are deleted.
 *
 * ── WHY NOT JUST CALL `releaseBlobIfUnreferenced` PER OBJECT ────────────────────────────────
 * Because the batching is the whole reason this function exists. That helper is one check plus one
 * `del(url)`; calling it per object would turn a folder delete of four hundred photographs into
 * four hundred separate `del` requests and throw away the chunking argument above. The RULE is the
 * same rule and is deliberately spelled the same way — ask `isBlobPathnameReferenced` first, keep
 * the object on any answer that is not a definite "no" — and `lib/admin/ninaAlbumAvatarActions.ts`
 * (one photo, at most two objects) DOES go through the shared helper, which is where a reader
 * should look for the canonical version of the argument.
 *
 * ── A CHECK THAT THROWS KEEPS THE OBJECT ────────────────────────────────────────────────────
 * `releaseBlobIfUnreferenced`'s posture, restated: *"could not prove it is unreferenced, so do not
 * delete it. Erring toward an orphan is the only direction that is recoverable."* A failed check
 * therefore answers `true` and the object stays.
 *
 * ── WHAT A HALF-FAILED `del` STILL MEANS ────────────────────────────────────────────────────
 *   · The rows are already gone, which is the outcome the operator asked for. The album is
 *     correct, the tree is correct, and nothing renders a broken image.
 *   · The objects for the chunks that failed stay in the store, referenced by nothing. They cost
 *     storage; they cannot corrupt anything.
 *   · Every failed chunk is logged with its URLs, so the orphans are *named* in the function log.
 *   · Reaping them is `scripts/blob-reap.mjs` / the `reap-orphaned-blobs` skill's job.
 *
 * The thumbnail is reaped beside the original because phase 4 wrote it as a second object and
 * nothing else references it — but it is asked about SEPARATELY, because the two objects have
 * genuinely different answers: a chat row can reference the full-size photograph while nothing
 * anywhere references its album thumbnail.
 */
async function reapAvatarBlobs(
  userId: string,
  rows: readonly NinaAvatarBlobRef[],
): Promise<void> {
  const objects: AvatarBlobObject[] = rows.flatMap((row) => {
    const own: AvatarBlobObject = { pathname: row.pathname, url: row.blobUrl }
    if (row.thumbUrl == null) return [own]
    /* `thumb_pathname` and `thumb_url` are written together by `registerNinaAvatarsAction`, so a
     * URL with no pathname is not a state this table produces. If one ever appears, asking under
     * both parameters is still a correct question — `isBlobPathnameReferenced` ORs the pathname
     * columns with the URL columns, and a pathname matching nothing contributes nothing. */
    return [own, { pathname: row.thumbPathname ?? row.thumbUrl, url: row.thumbUrl }]
  })
  if (objects.length === 0) return

  const orphans: string[] = []
  let kept = 0
  for (let start = 0; start < objects.length; start += ADMIN_BLOB_REF_CHECK_CONCURRENCY) {
    const window = objects.slice(start, start + ADMIN_BLOB_REF_CHECK_CONCURRENCY)
    const referenced = await Promise.all(
      window.map(async (object) => {
        try {
          return await isBlobPathnameReferenced(userId, object.pathname, object.url)
        } catch (cause) {
          console.error(
            '[f34] could not check blob references; keeping the object',
            object.pathname,
            cause,
          )
          return true
        }
      }),
    )
    window.forEach((object, index) => {
      if (referenced[index] === false) orphans.push(object.url)
      else kept++
    })
  }

  if (kept > 0) {
    console.info(`[f34] ${kept} album object(s) kept: another row still points at them`)
  }
  if (orphans.length === 0) return

  for (let start = 0; start < orphans.length; start += ADMIN_BLOB_DEL_BATCH) {
    const chunk = orphans.slice(start, start + ADMIN_BLOB_DEL_BATCH)
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
```

**Change (c) — `deleteNinaAlbumFolderAction`.** Replace `:397-398`:

```ts
  /*
   * PROMOTE, THEN DELETE. The ids have to be read separately because this delete is expressed as a
   * folder predicate, and `deleteNinaAvatarsInFolderTree`'s own `RETURNING` arrives too late: the
   * `ON DELETE SET NULL` that orphans the dependents fires inside that statement.
   * `listNinaAvatarIdsInFolderTree` carries the same WHERE, `is_current = false` included, so
   * under `keepCurrent` her photograph is not promoted against — it is not going anywhere.
   */
  const doomed = await listNinaAvatarIdsInFolderTree(userId, folder)
  await promoteNinaAvatarDependents(userId, doomed)

  const removed = await deleteNinaAvatarsInFolderTree(userId, folder)
  await reapAvatarBlobs(userId, removed)
```

And in the same function's docstring, under `── ROW FIRST, BLOB SECOND ──` (`:371-374`), append one
sentence:

```ts
 * Since the ghost-photo fix it is also ROW FIRST, *QUESTION* SECOND, BLOB THIRD: `reapAvatarBlobs`
 * asks `isBlobPathnameReferenced` per object before deleting anything, so an object a conversation
 * is still rendering survives the folder that held its album row.
```

**Change (d) — `removeNinaAvatarsAction`.** Replace `:451-452`:

```ts
  /*
   * PROMOTE, THEN DELETE — and her current photograph is excluded from the promotion for the same
   * reason `listNinaAvatarIdsInFolderTree` carries `is_current = false`: `deleteNinaAvatars`' own
   * WHERE refuses it, so it survives this call, so nothing that re-shows it is being orphaned and
   * a GET per object on its behalf would buy nothing. `current` is already in hand — it is read by
   * `currentPhotoAmong(userId, ids)` above, for the refusal check this sits directly beneath.
   */
  const doomed = current == null ? ids : ids.filter((id) => id !== current.id)
  await promoteNinaAvatarDependents(userId, doomed)

  const removed = await deleteNinaAvatars(userId, ids)
  await reapAvatarBlobs(userId, removed)
```

**Change (e) — the module header at `:58-63`.** The `── ROW FIRST, BLOB SECOND, BEST-EFFORT AND
LOGGED ──` block gains one sentence at its end:

```ts
 * Since the ghost-photo fix the rule has a third beat: the blob delete is REFERENCE-CHECKED. See
 * `reapAvatarBlobs` for the check, and `lib/nina/provenancePromotion.ts` for the promotion that
 * runs before the rows so the check has the right answer to give.
```

**Impact:** both bulk deletes gain a pre-read + promotion pass and a per-object reference check. A
shared object is now kept. `reapAvatarBlobs`'s signature changed (module-private, both call sites
updated above).

---

### Step 7: The two `deleteNinaMessageImage` call sites

**File:** `lib/admin/chatPhotoActions.ts` — import block at `:30` and body at `:636`

**Change (a) — import.** Add after the `@/lib/nina/queries` import block:

```ts
import { promoteNinaImageDependents } from '@/lib/nina/provenancePromotion'
```

**Change (b) — the body.** In `removeChatPhotoAction`, insert between `:634` (`const isLastImage =
...`) and `:636` (`if (isLastImage && ...)`):

```ts
  /*
   * PROMOTE BEFORE EITHER BRANCH DELETES THE ROW. A chat photograph can be re-shown by another
   * chat row (`source_image_id` naming this id), and that FK is `ON DELETE SET NULL` too — so
   * whichever branch runs below, the dependent is about to become an unmeasured "original" unless
   * it is measured now. Both branches remove THIS row (the message branch only runs when this is
   * the last image on it, and `deleteNinaMessage` deletes its own image rows), so one call above
   * the branch covers both. It never throws and never blocks the remove; see
   * `lib/nina/provenancePromotion.ts`'s header.
   */
  await promoteNinaImageDependents(userId, [id])
```

**Change (c) — one docstring sentence.** In `removeChatPhotoAction`'s docstring, at the end of the
`── ROW FIRST, BLOB SECOND, AND ONLY IF NOTHING ELSE POINTS AT IT ──` block (`:596-601`), append:

```ts
 * What was missing until the ghost-photo fix is the step BEFORE the row delete: a
 * `source_image_id` dependent had to be measured while this row still existed, or the
 * `ON DELETE SET NULL` left it an original that no dedup mechanism could ever see.
 * `promoteNinaImageDependents` is that step, and it is why the release below can now honestly
 * answer "shared" for a photograph that will keep rendering.
```

**File:** `lib/nina/albumActions.ts:9`, `:215-218`

**Change (d) — import.** Replace `:9`:

```ts
import { promoteNinaImageDependents } from './provenancePromotion'
import { deleteNinaMessageImage, getNinaMessageImage } from './queries'
```

(placed to keep the existing relative-import block's alphabetical order: `./blobRelease`,
`./provenancePromotion`, `./queries`, `./sessionActions`.)

**Change (e) — the body.** Replace `:215-218`:

```ts
  if (row.kind === 'generated') return { ok: false }

  /* PROMOTE, THEN DELETE. Another chat row can re-show this photograph via `source_image_id`, and
   * that FK is `ON DELETE SET NULL`: without this the dependent survives as an unmeasured
   * "original" that neither dedup mechanism can ever match, which is the ghost-photo bug. Best
   * effort by construction — it cannot throw and cannot refuse the runner's delete. */
  await promoteNinaImageDependents(userId, [input.id])

  const deleted = await deleteNinaMessageImage(userId, input.id)
  if (deleted == null) return { ok: false }
```

**Change (f) — one docstring sentence** in `deleteNinaChatPhoto`'s header, at the end of the
`── WHY THIS FILE, AND WHY THE ACTION IS THIS SMALL ──` block (`:167-174`):

```ts
 * The one rule it does spell out is the ORDER, because only a caller can get it right: promote the
 * rows that re-show this photograph (`promoteNinaImageDependents`) while this row still links
 * them, THEN delete it, THEN release. The middle statement is where `ON DELETE SET NULL` fires.
```

**Impact:** both `deleteNinaMessageImage` callers now promote first. Their existing
`releaseBlobIfUnreferenced` guards are untouched — they were already correct.

---

### Step 8: The frozen barrel surface

**File:** `lib/nina/queries.test.ts` — `BARREL_VALUE_EXPORTS` (`:38-155`) and the header (`:5-36`)

**Change:** three names, sorted into place, each with the comment this file's own rule demands
("the list is updated in the same commit, sorted, with a pointer to that decision").

Insert after `'listNinaAvatarFolders',`:

```ts
  // nina-ghost-photo-dedup-fix phase 1 (R1): the subtree id read the folder delete needs BEFORE
  // its own DELETE, because `ON DELETE SET NULL` cuts the dependents loose inside that statement.
  // Documented growth, and it must carry `deleteNinaAvatarsInFolderTree`'s WHERE clause for clause.
  'listNinaAvatarIdsInFolderTree',
```

Insert after `'listNinaShortcuts',` and before `'locateNinaAvatar',` — codepoint order puts
`listU…` after every `listNina…` (`'N'` 0x4E < `'U'` 0x55) and before `locate…` (`'i'` < `'o'`):

```ts
  // nina-ghost-photo-dedup-fix phase 1 (R1): the read half of promote-before-delete — the rows an
  // imminent parent delete is about to reclassify, found while the provenance column still names
  // the parent. Documented growth; see `lib/nina/provenancePromotion.ts` for why it exists.
  'listUnmeasuredNinaImageDependents',
```

Insert after `'moveNinaAvatarsToFolder',`:

```ts
  // nina-ghost-photo-dedup-fix phase 1 (R1): the write half — the guarded, batched promotion
  // UPDATE. It is the one write in `queries/images.ts` that deliberately does NOT carry
  // `isOriginalPhoto()`; the reason is argued at the function. Documented growth.
  'promoteNinaImageMeasurements',
```

And append to the header's growth log, after the `92 → 93` paragraph:

```ts
 * nina-ghost-photo-dedup-fix phase 1 takes it 93 → 96: `listUnmeasuredNinaImageDependents` and
 * `promoteNinaImageMeasurements` (the read and write halves of promote-before-delete) plus
 * `listNinaAvatarIdsInFolderTree` (the folder delete's pre-read). All three exist so an orphaned
 * reference row is measured before `ON DELETE SET NULL` reclassifies it — see
 * `lib/nina/provenancePromotion.ts`.
```

> **Implementation note:** the assertion is `Object.keys(barrel).sort()`, a plain JS codepoint
> sort. Place each name by running the sort, not by eye.

**Impact:** the barrel contract test passes with the three new names and fails loudly if a fourth
appears.

---

### Step 9: The helper's own suite — `tests/nina.provenancePromotion.test.ts`

**File:** `tests/nina.provenancePromotion.test.ts` (new)

**Change:** the posture is `tests/nina.blobRelease.test.ts`'s exactly — the REAL helper over the
REAL query functions against the recording driver (`tests/support/fakeDb.ts`, so the generated SQL
including both write guards is asserted, not mocked), with only the two network/native edges
mocked: `fetch` (stubbed global, `tests/admin.albumAvatarActions.test.ts`'s technique) and
`signImageBytes` (`tests/admin.chatPhotos.test.ts`'s recorded reason: *"mocked so no test GETs a
blob or loads `sharp`"*). `contentHashOf` runs FOR REAL — it is `crypto.subtle` in Node 22 and
`lib/photos/contentHash.test.ts` already exercises it, so the hash in these assertions is the hash
production would write.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **Promote before delete, as the helper actually decides it.**
 *
 * `lib/nina/provenancePromotion.ts` is the fix for the 2026-09-16 production ghost: a reference row
 * whose parent is deleted becomes an "original" by `isOriginalPhoto()`'s own definition while
 * carrying none of the columns either dedup mechanism needs, and is therefore invisible to both
 * forever. The properties, in the order they would hurt if they were wrong:
 *
 *   1. **One GET per distinct OBJECT, however many rows share it.** Four bubbles re-showing one
 *      album face is one fetch, not four.
 *   2. **A dead object degrades and does not stop the pass.** The row it could not measure stays
 *      unmeasured — today's behaviour — the failure is named in the log, and every other object is
 *      still promoted. Nothing throws out to the caller, ever: a dedup optimisation failing must
 *      never cost the operator their delete (plan invariant 3).
 *   3. **The write carries both guards.** `content_hash is null` (idempotence against a concurrent
 *      promoter, the sweep's own `fill-hash` guard) and `pathname = $n` (the ghost-signature
 *      lesson: never write THESE bytes' measurements onto a row that has since been repointed).
 *   4. **An already-hashed dependent is never even fetched** — the lookup's own `content_hash is
 *      null` is what keeps a promotion from re-measuring what is already measured.
 *   5. **A sharp failure still writes the hash.** The perceptual pair is one op and the byte hash
 *      is another, exactly as the sweep splits them.
 *
 * `signImageBytes` is mocked so no test loads the native module; `contentHashOf` is REAL, so the
 * hashes below are the hashes production writes for those bytes.
 */

const signImageBytes = vi.hoisted(() => vi.fn())
vi.mock('@/lib/nina/perceptualSign', () => ({
  signImageBytes: (...args: unknown[]) => signImageBytes(...args),
  fetchAndSignImage: vi.fn(),
}))

const USER = 'abc123XYZ_-9'
const AVATAR_ID = 'avaAAAAAAAAA'
const IMAGE_ID = 'imgAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'

const PATH_A = `nina/${USER}/avatar-${AVATAR_ID}-Tu6HvWq2m0k3.jpg`
const URL_A = `${STORE}/${PATH_A}`
const PATH_B = `nina/${USER}/avatar-bbbbbbbbbbbb-Tu6HvWq2m0k3.jpg`
const URL_B = `${STORE}/${PATH_B}`

const BYTES_A = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
/** sha-256 of BYTES_A, computed by the real `contentHashOf` in `beforeAll` — see below. */
let HASH_A: string

const SIGNATURE = {
  dhashHex: '0f1e2d3c4b5a6978',
  sig16Base64: Buffer.alloc(256, 7).toString('base64'),
  width: 1024,
  height: 1536,
}

const fetchMock = vi.fn()

/** The dependent projection: `{ id, blobUrl, pathname }`, in key order. */
function dependentRow(id: string, url: string, pathname: string): unknown[] {
  return projectedRow(id, url, pathname)
}

/** A body `measureBlobObject` can read: `ok`, and an `arrayBuffer()` of the given bytes. */
function blobResponse(bytes: Uint8Array): { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    ok: true,
    arrayBuffer: async () => bytes.slice().buffer,
  }
}

let fake: FakeDb
let promotion: typeof import('@/lib/nina/provenancePromotion')

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  signImageBytes.mockReset().mockResolvedValue(SIGNATURE)
  fake = installFakeDb()
  promotion = await import('@/lib/nina/provenancePromotion')

  const { contentHashOf } = await import('@/lib/photos/contentHash')
  HASH_A = await contentHashOf(BYTES_A)
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

describe('promoteNinaAvatarDependents', () => {
  it('asks nothing at all when there are no parents', async () => {
    await expect(promotion.promoteNinaAvatarDependents(USER, [])).resolves.toEqual({
      found: 0,
      fetched: 0,
      promoted: 0,
    })
    expect(fake.queries).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('looks up dependents owner-scoped, by source_avatar_id, and only the unmeasured ones', async () => {
    fake.enqueue([]) // no dependents

    await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    const read = fake.only()
    expect(read.sql).toContain('from "nina_message_images"')
    expect(read.sql).toContain('"source_avatar_id"')
    expect(read.sql).not.toContain('"source_image_id"') // the empty arm is omitted, not emitted
    expect(read.sql).toContain('"content_hash" is null')
    expect(read.sql).toContain('"user_id"')
    expect(read.params).toContain(USER)
    expect(read.params).toContain(AVATAR_ID)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches each distinct object ONCE, however many rows share it', async () => {
    fake.enqueue([
      dependentRow('depAAAAAAAAA', URL_A, PATH_A),
      dependentRow('depBBBBBBBBB', URL_A, PATH_A),
      dependentRow('depCCCCCCCCC', URL_A, PATH_A),
    ])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depAAAAAAAAA' }, { id: 'depBBBBBBBBB' }, { id: 'depCCCCCCCCC' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 3, fetched: 1, promoted: 3 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(signImageBytes).toHaveBeenCalledTimes(1)
    /* One UPDATE for the object, not one per row — the read plus one write. */
    expect(fake.queries).toHaveLength(2)
    expect(fake.last().sql).toContain('update "nina_message_images"')
  })

  it('writes the hash, the byte count, the pair and the dimensions, under BOTH guards', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depAAAAAAAAA' }])

    await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    const write = fake.last()
    expect(write.sql).toContain('update "nina_message_images"')
    expect(write.sql).toContain('"content_hash"')
    expect(write.sql).toContain('"perceptual_hash"')
    expect(write.sql).toContain('"perceptual_sig"')
    expect(write.sql).toContain('"width"')
    expect(write.sql).toContain('"height"')
    expect(write.sql).toContain('"bytes"')
    /* Guard 1: idempotent against a concurrent promoter — the sweep's own fill-hash guard. */
    expect(write.sql).toContain('"content_hash" is null')
    /* Guard 2: the ghost-signature lesson — only while the row still serves what was measured. */
    expect(write.sql).toContain('"pathname" =')
    /* And deliberately NOT the reference filter: every row here IS a reference right now. */
    expect(write.sql).not.toContain('"source_avatar_id" is null')

    expect(write.params).toContain(HASH_A)
    expect(write.params).toContain(BYTES_A.byteLength)
    expect(write.params).toContain(SIGNATURE.dhashHex)
    expect(write.params).toContain(SIGNATURE.sig16Base64)
    expect(write.params).toContain(PATH_A)
    expect(write.params).toContain(USER)
  })

  it('a dead object is skipped and named, and the NEXT object is still promoted', async () => {
    fake.enqueue([
      dependentRow('depAAAAAAAAA', URL_A, PATH_A),
      dependentRow('depBBBBBBBBB', URL_B, PATH_B),
    ])
    /* A's GET 404s (the production case: the blob was deleted out from under the row long ago);
     * B's succeeds. Ordered by pathname, so A is first and its failure must not end the pass. */
    fetchMock
      .mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })
      .mockResolvedValueOnce(blobResponse(BYTES_A))
    fake.enqueue([{ id: 'depBBBBBBBBB' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 2, fetched: 1, promoted: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    /* One write, and it is B's — A never reached the database. */
    const writes = fake.queries.filter((query) => query.sql.startsWith('update'))
    expect(writes).toHaveLength(1)
    expect(writes[0]?.params).toContain(PATH_B)
  })

  it('a throwing fetch degrades exactly the same way and never escapes', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockRejectedValue(new Error('network down'))

    await expect(promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])).resolves.toEqual({
      found: 1,
      fetched: 0,
      promoted: 0,
    })
    expect(fake.queries).toHaveLength(1) // the read only
  })

  it('a lookup that throws is swallowed — the caller still gets to run its delete', async () => {
    fake.enqueueError(new Error('neon unreachable'))

    await expect(promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])).resolves.toEqual({
      found: 0,
      fetched: 0,
      promoted: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a write that throws is swallowed, and the next object still lands', async () => {
    fake.enqueue([
      dependentRow('depAAAAAAAAA', URL_A, PATH_A),
      dependentRow('depBBBBBBBBB', URL_B, PATH_B),
    ])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    fake.enqueueError(new Error('write conflict'))
    fake.enqueue([{ id: 'depBBBBBBBBB' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 2, fetched: 2, promoted: 1 })
  })

  it('an unsignable object still gets its hash — the two fills are two decisions', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    signImageBytes.mockResolvedValue(null) // sharp could not decode it
    fake.enqueue([{ id: 'depAAAAAAAAA' }])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report.promoted).toBe(1)
    const write = fake.last()
    expect(write.sql).toContain('"content_hash"')
    expect(write.params).toContain(HASH_A)
    /* The four columns sharp owns are LEFT ALONE rather than nulled: "could not measure" is not
     * the same claim as "has no value", and the sweep's fill-perceptual op owns them. */
    expect(write.sql).not.toContain('"perceptual_hash"')
    expect(write.sql).not.toContain('"width"')
  })

  it('a malformed signature is dropped the same way a malformed claim is', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(BYTES_A))
    signImageBytes.mockResolvedValue({ ...SIGNATURE, dhashHex: 'NOT-16-HEX' })
    fake.enqueue([{ id: 'depAAAAAAAAA' }])

    await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    const write = fake.last()
    expect(write.sql).toContain('"content_hash"')
    expect(write.sql).not.toContain('"perceptual_hash"')
  })

  it('an empty body is not a measurement', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', URL_A, PATH_A)])
    fetchMock.mockResolvedValue(blobResponse(new Uint8Array(0)))

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 1, fetched: 0, promoted: 0 })
    expect(fake.queries).toHaveLength(1)
  })

  it('a non-https blob_url is refused before any request leaves', async () => {
    fake.enqueue([dependentRow('depAAAAAAAAA', `http://insecure.test/${PATH_A}`, PATH_A)])

    const report = await promotion.promoteNinaAvatarDependents(USER, [AVATAR_ID])

    expect(report).toEqual({ found: 1, fetched: 0, promoted: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('promoteNinaImageDependents', () => {
  it('reads the OTHER provenance column, and only that one', async () => {
    fake.enqueue([])

    await promotion.promoteNinaImageDependents(USER, [IMAGE_ID])

    const read = fake.only()
    expect(read.sql).toContain('"source_image_id"')
    expect(read.sql).not.toContain('"source_avatar_id"')
    expect(read.params).toContain(IMAGE_ID)
  })

  it('dedupes repeated parent ids before they reach the statement', async () => {
    fake.enqueue([])

    await promotion.promoteNinaImageDependents(USER, [IMAGE_ID, IMAGE_ID, IMAGE_ID])

    expect(fake.only().params.filter((param) => param === IMAGE_ID)).toHaveLength(1)
  })
})
```

> **Implementation notes.** (1) `HASH_A` is computed in `beforeEach` after `vi.resetModules()`, so
> the import is inside the hook — a module-scope `await` would bind a stale copy. (2) `blobResponse`
> returns `bytes.slice().buffer` so each call hands a fresh `ArrayBuffer` and a second read of the
> same fixture cannot see a detached one. (3) `fake.enqueueError` is the recorder's existing
> mechanism for making the NEXT statement reject; it is how the lookup-throws and write-throws cases
> reach the real catch blocks rather than a spy.

---

### Step 10: `deleteNinaAvatarAction`'s order — `tests/admin.albumAvatarDelete.test.ts`

**File:** `tests/admin.albumAvatarDelete.test.ts` (new)

**Change:** a dedicated file rather than a sixth `describe` in
`tests/admin.albumAvatarActions.test.ts`, because that file's header is a narrative about "the five
album actions nothing had ever executed" and this is a different claim about a sixth one.

Posture is that file's exactly: real SQL against the recording driver, `requireAdmin`,
`@vercel/blob` and `revalidatePath` mocked, plus `fetch` stubbed and `signImageBytes` mocked so the
promotion pass is real but reaches no network and no native module.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The single album delete, in the order the ghost-photo fix requires.**
 *
 * `deleteNinaAvatarAction` had two defects and this file pins both fixes as an ORDER, because the
 * order is the whole of the correctness:
 *
 *   1. **Promote, then delete the row.** The dependents have to be measured while
 *      `source_avatar_id` still names this avatar — the `ON DELETE SET NULL` that cuts them loose
 *      fires inside the DELETE's own statement, so there is no second chance.
 *   2. **Then ask, then `del`.** The action's `del` was unconditional, which is very probably how
 *      the production row found on 2026-09-16 came to point at a 404. It now goes through
 *      `releaseBlobIfUnreferenced`, the ONE reference-checked release, once per object.
 *
 * The recording driver answers the real statements, so "the promotion SELECT ran BEFORE the DELETE"
 * is read off `fake.queries` in execution order rather than off a spy's call count.
 */

const requireAdmin = vi.fn()
const del = vi.fn()
const revalidatePath = vi.fn()
const fetchMock = vi.fn()
const signImageBytes = vi.hoisted(() => vi.fn())

vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: (...args: unknown[]) => del(...args) }))
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => cb() }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }))
vi.mock('@/lib/nina/perceptualSign', () => ({
  signImageBytes: (...args: unknown[]) => signImageBytes(...args),
  fetchAndSignImage: vi.fn(),
}))

const USER = 'usr123XYZ_-9'
const AVATAR_ID = 'avaAAAAAAAAA'
const DEP_ID = 'depAAAAAAAAA'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const PATHNAME = `nina/${USER}/avatar-${AVATAR_ID}-Tu6HvWq2m0k3.jpg`
const BLOB_URL = `${STORE}/${PATHNAME}`
const THUMB_PATHNAME = `nina/${USER}/thumb-${AVATAR_ID}-Tu6HvWq2m0k3.webp`
const THUMB_URL = `${STORE}/${THUMB_PATHNAME}`

const SIGNATURE = {
  dhashHex: '0f1e2d3c4b5a6978',
  sig16Base64: Buffer.alloc(256, 7).toString('base64'),
  width: 1024,
  height: 1536,
}
const BYTES = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2])

type Actions = typeof import('@/lib/admin/ninaAlbumActions')
let actions: Actions
let fake: FakeDb

/** `deleteNinaAvatar`'s RETURNING projection: `{ id, blobUrl, pathname, thumbUrl, thumbPathname }`. */
function removedRow(thumb = false): unknown[] {
  return projectedRow(
    AVATAR_ID,
    BLOB_URL,
    PATHNAME,
    thumb ? THUMB_URL : null,
    thumb ? THUMB_PATHNAME : null,
  )
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  requireAdmin.mockReset().mockResolvedValue({ userId: USER })
  del.mockReset().mockResolvedValue(undefined)
  revalidatePath.mockReset()
  fetchMock.mockReset()
  signImageBytes.mockReset().mockResolvedValue(SIGNATURE)
  fake = installFakeDb()
  actions = await import('@/lib/admin/ninaAlbumActions')
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

describe('deleteNinaAvatarAction', () => {
  it('promotes the dependent BEFORE the row delete, then keeps the blob it still needs', async () => {
    fake.enqueue([projectedRow(DEP_ID, BLOB_URL, PATHNAME)]) // the dependent lookup
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => BYTES.slice().buffer })
    fake.enqueue([{ id: DEP_ID }]) // the promotion UPDATE RETURNING
    fake.enqueue([removedRow()]) // deleteNinaAvatar RETURNING
    fake.enqueue([[{ id: DEP_ID }]], []) // isBlobPathnameReferenced: a chat row still names it

    const result = await actions.deleteNinaAvatarAction(AVATAR_ID)

    expect(result).toEqual({ ok: true })

    const sqls = fake.queries.map((query) => query.sql)
    const lookup = sqls.findIndex((sql) => sql.includes('"source_avatar_id"'))
    const promote = sqls.findIndex((sql) => sql.startsWith('update "nina_message_images"'))
    const remove = sqls.findIndex((sql) => sql.startsWith('delete from "nina_avatars"'))
    expect(lookup).toBeGreaterThanOrEqual(0)
    expect(promote).toBeGreaterThan(lookup)
    expect(remove).toBeGreaterThan(promote)

    /* The promoted dependent is the reason the object survives — which is the entire point. */
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/admin/nina')
  })

  it('deletes the object when nothing points at it any more', async () => {
    fake.enqueue([]) // no dependents
    fake.enqueue([removedRow()])
    fake.enqueue([], []) // isBlobPathnameReferenced: neither table

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).resolves.toEqual({ ok: true })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(BLOB_URL)
  })

  it('asks about the thumbnail SEPARATELY — two objects, two answers', async () => {
    fake.enqueue([])
    fake.enqueue([removedRow(true)])
    fake.enqueue([[{ id: DEP_ID }]], []) // the full-size object is still referenced
    fake.enqueue([], []) // its thumbnail is not

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).resolves.toEqual({ ok: true })

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(THUMB_URL)
  })

  it('still refuses her current photo, and nothing is released', async () => {
    fake.enqueue([]) // the promotion runs first and finds nothing
    fake.enqueue([]) // deleteNinaAvatar → no row (is_current = true)

    const result = await actions.deleteNinaAvatarAction(AVATAR_ID)

    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('error', expect.stringContaining('current photo'))
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a malformed id before reading, promoting or fetching anything', async () => {
    const result = await actions.deleteNinaAvatarAction('short')

    expect(result).toEqual({ ok: false, error: 'Not an avatar id.' })
    expect(fake.queries).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin before any statement', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).rejects.toThrow('not an admin')
    expect(fake.queries).toHaveLength(0)
  })

  it('a promotion that cannot reach the store never stops the delete', async () => {
    fake.enqueue([projectedRow(DEP_ID, BLOB_URL, PATHNAME)])
    fetchMock.mockRejectedValue(new Error('store unreachable'))
    fake.enqueue([removedRow()])
    fake.enqueue([[{ id: DEP_ID }]], [])

    await expect(actions.deleteNinaAvatarAction(AVATAR_ID)).resolves.toEqual({ ok: true })

    /* Degraded to today's behaviour: the dependent stays unmeasured. The delete still happened,
     * and the object is still kept, because the reference check reads rows and not measurements. */
    expect(fake.queries.some((query) => query.sql.startsWith('update "nina_message_images"'))).toBe(
      false,
    )
    expect(del).not.toHaveBeenCalled()
  })
})
```

> **Implementation note.** `fake.enqueue([[{ id }]], [])` mirrors `tests/nina.blobRelease.test.ts`'s
> spelling for `isBlobPathnameReferenced`: two results, the images arm then the avatars arm, in the
> order drizzle builds the `Promise.all` members.

---

### Step 11: Updating the four suites the new statements move under

**File:** `tests/admin.folderActions.test.ts`

**Change:** both delete suites now run extra statements, and the recorder is one FIFO queue — the
new SELECTs consume enqueued results, so the existing fixtures have to be re-ordered or the delete
gets the wrong rows. The statement order per action is now:

- `deleteNinaAlbumFolderAction`: `getCurrentNinaAvatar` → `listNinaAvatarIdsInFolderTree` →
  (if ids) `listUnmeasuredNinaImageDependents` → (per object) promotion UPDATE →
  `deleteNinaAvatarsInFolderTree` → (per object) 2 × `isBlobPathnameReferenced` → `del` →
  (if `current == null`) `deleteNinaFolderSubtree`
- `removeNinaAvatarsAction`: `getCurrentNinaAvatar` → `listUnmeasuredNinaImageDependents` →
  (per object) promotion UPDATE → `deleteNinaAvatars` → 2 × `isBlobPathnameReferenced` per object
  → `del`

Concretely:

1. Add one helper beside `blobRefRow`:

```ts
/** `listNinaAvatarIdsInFolderTree`'s one-column projection. */
function avatarIdRow(id: string): unknown[] {
  return projectedRow(id)
}
```

2. In **"leaves her current photo behind under keepCurrent, and stays in the folder"**, insert two
   enqueues between the current-photo row and the blob-ref rows:

```ts
    fake.enqueue([currentAvatarRow({ id: AVATAR_A, folder: 'Trips/Bali', filename: 'her.jpg' })])
    fake.enqueue([avatarIdRow(AVATAR_B), avatarIdRow(AVATAR_C)]) // the subtree's deletable ids
    fake.enqueue([]) // no unmeasured dependents name them
    fake.enqueue([blobRefRow(AVATAR_B), blobRefRow(AVATAR_C, true)])
```

   and add, after the existing `del` assertions:

```ts
    /* Her current photo is NOT promoted against: `listNinaAvatarIdsInFolderTree` carries
     * `is_current = false`, exactly as the delete does. */
    const ids = fake.queries.find((q) => q.sql.includes('select "id" from "nina_avatars"'))
    expect(ids?.sql).toContain('"is_current"')
    expect(ids?.params).not.toContain(AVATAR_A)
```

3. In **"deletes rows, reaps both original and thumbnail blobs, and undeclares the empty subtree"**,
   insert the same two enqueues after the `getCurrentNinaAvatar` one and before the blob refs. The
   three reference checks answer from the empty queue (`[]` = unreferenced), so the existing
   `del` assertions (`1 call, 3 urls`) still hold.

4. In **"does not fail the action when the blob store rejects the delete"**, insert the same two
   enqueues after `fake.enqueue([])`.

5. In **"keeps her current photo and removes the rest, when told to"** and **"removes an ordinary
   selection with no note and reaps the blobs"** (the `removeNinaAvatarsAction` pair), insert one
   enqueue — `fake.enqueue([])` for the dependent lookup — between the current-photo read and the
   blob refs.

6. Add one new case to each suite, proving the guard actually keeps a shared object:

```ts
  it('keeps an album object a chat row still renders, and deletes the rest', async () => {
    fake.enqueue([]) // her current photo is not among the ids
    fake.enqueue([]) // no unmeasured dependents
    fake.enqueue([blobRefRow(AVATAR_A), blobRefRow(AVATAR_B)])
    fake.enqueue([[{ id: 'imgStillHere' }]], []) // A: a chat row still names those bytes
    fake.enqueue([], []) // B: nothing does

    const result = await actions.removeNinaAvatarsAction({
      ids: [AVATAR_A, AVATAR_B],
      keepCurrent: false,
    })

    expect(result.ok).toBe(true)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del.mock.calls[0]?.[0]).toEqual([expect.stringContaining(AVATAR_B)])
  })
```

7. Update the file header's closing sentence — it currently says "No `put` and no `after` here" —
   to record the new edge: the reference checks and the promotion pass are real statements now, and
   `fetch`/`signImageBytes` are stubbed for the two suites that reach them. (The cases above never
   produce a dependent, so neither edge is actually exercised here; state that, and point at
   `tests/nina.provenancePromotion.test.ts` for the pass itself.) Because no case here returns a
   dependent row, **no `fetch` stub or `perceptualSign` mock is needed in this file** — say so, so a
   later reader does not add one "for safety".

**File:** `tests/nina.galleryDelete.test.ts`

**Change:** `lib/nina/albumActions.ts` now imports `./provenancePromotion`, whose own import of
`@/lib/nina/queries` would hit this file's partial mock. Mock the helper at the edge, the way this
suite already mocks `blobRelease`:

```ts
const spies = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  getNinaMessageImage: vi.fn(),
  deleteNinaMessageImage: vi.fn(),
  promoteNinaImageDependents: vi.fn(),
  releaseBlobIfUnreferenced: vi.fn(),
  revalidatePath: vi.fn(),
  sendNinaMessage: vi.fn(),
  createNinaChatSession: vi.fn(),
}))

// …
vi.mock('@/lib/nina/provenancePromotion', () => ({
  promoteNinaImageDependents: spies.promoteNinaImageDependents,
  promoteNinaAvatarDependents: vi.fn(),
}))
```

and add `spies.promoteNinaImageDependents.mockResolvedValue({ found: 0, fetched: 0, promoted: 0 })`
to `beforeEach`, plus one new case in the `deleteNinaChatPhoto` suite:

```ts
  it('promotes anything that re-shows the photograph BEFORE deleting its row', async () => {
    spies.deleteNinaMessageImage.mockResolvedValue({ ...UPLOAD_ROW })
    spies.releaseBlobIfUnreferenced.mockResolvedValue('shared')

    await albumActions.deleteNinaChatPhoto({ id: ID })

    expect(spies.promoteNinaImageDependents).toHaveBeenCalledWith(USER, [ID])
    /* The ORDER is the correctness: `source_image_id` stops naming this row inside the DELETE's
     * own statement, so a promotion afterwards has nothing left to find. */
    const promoteAt = spies.promoteNinaImageDependents.mock.invocationCallOrder[0] ?? Infinity
    const deleteAt = spies.deleteNinaMessageImage.mock.invocationCallOrder[0] ?? -Infinity
    expect(promoteAt).toBeLessThan(deleteAt)
  })
```

and extend the three refusal cases with
`expect(spies.promoteNinaImageDependents).not.toHaveBeenCalled()` — a refused delete must not spend
a GET.

**File:** `tests/nina.attachTargets.test.ts`

**Change:** the same edge mock, for the same reason (this suite imports the same module and its
header already records that "the delete action moved in beside the attach action, and its imports
arrive with it"). Add to `spies`, add the `vi.mock` block, and extend that comment with the one new
collaborator. No new assertions — the delete's own suite owns them.

**File:** `tests/admin.chatPhotos.test.ts`

**Change:** add the edge mock beside the existing `blobRelease` one (`:453`):

```ts
vi.mock('@/lib/nina/provenancePromotion', () => ({
  promoteNinaImageDependents: (...args: unknown[]) => promoteNinaImageDependents(...args),
  promoteNinaAvatarDependents: vi.fn(),
}))
```

with `const promoteNinaImageDependents = handle('promoteNinaImageDependents')` (or the file's
existing spy idiom), defaulted in `beforeEach` to
`.mockResolvedValue({ found: 0, fetched: 0, promoted: 0 })`, and one new case in the
`removeChatPhotoAction` suite:

```ts
  it('promotes the `source_image_id` dependents before either delete branch runs', async () => {
    // …the file's existing happy-path fixture for Remove…
    await actions.removeChatPhotoAction({ id: IMAGE_ID })

    expect(promoteNinaImageDependents).toHaveBeenCalledWith(USER, [IMAGE_ID])
    const promoteAt = promoteNinaImageDependents.mock.invocationCallOrder[0] ?? Infinity
    const deleteAt = deleteNinaMessageImage.mock.invocationCallOrder[0] ?? -Infinity
    expect(promoteAt).toBeLessThan(deleteAt)
  })
```

plus `expect(promoteNinaImageDependents).not.toHaveBeenCalled()` on the reference-row refusal case
(the refusal is above the promotion and must stay there).

**File:** `tests/admin.chatPhotoAdoption.test.ts:10-13`

**Change:** one sentence in the header is now false — it asserts the present tense of a gap Step 5
and Step 6 close. This is the third of the three prose sites this phase must fix in the same commit
(the other two are Step 2's `generatedChatPhotoScope` parenthetical and Step 5(c)'s
`setChatPhotoAsAvatarAction` paragraph); all three make the same claim, and leaving any one of them
behind ships a test file that documents the bug as still live.

**Replace — the current text, verbatim, `:10-13`:**

```ts
 * `setChatPhotoAsAvatarAction` is the reverse of F37's share: a `nina_message_images` row becomes
 * a `nina_avatars` row, with its bytes COPIED into a new `avatar-` object rather than shared — the
 * album-side deletes (`deleteNinaAvatarAction`, `reapAvatarBlobs`) call `del` with no reference
 * check, so a shared object would break the chat photo the day the album row went away.
```

**With:**

```ts
 * `setChatPhotoAsAvatarAction` is the reverse of F37's share: a `nina_message_images` row becomes
 * a `nina_avatars` row, with its bytes COPIED into a new `avatar-` object rather than shared — the
 * album-side deletes (`deleteNinaAvatarAction`, `reapAvatarBlobs`) used to call `del` with no
 * reference check at all, and although the ghost-photo fix made both of them ask
 * `isBlobPathnameReferenced` first, the copy stays: it gives the album row its own lifetime, its
 * own folder and its own framing, independent of the conversation the photograph came from.
```

---

### Step 12: The new import edge, and the four suites that inherit it

**Files:** `tests/admin.albumActionsBarrel.test.ts` (certain);
`tests/admin.albumAvatarActions.test.ts`, `tests/admin.albumDescribeEmbed.test.ts`,
`tests/admin.chatPhotoAdoption.test.ts` (conditional)

**Why this step exists.** `lib/nina/provenancePromotion.ts` imports `./perceptualSign` statically,
and that module's first two lines are `import 'server-only'` and `import sharp from 'sharp'`. The
import runs at module load whether or not a single dependent is ever found, so Steps 5-7 put a
native module into the graph of every suite that imports the real `@/lib/admin/ninaAlbumActions`
barrel. Verified against the worktree, those suites are the four above. None of them exercises a
delete action, so the statement-order and FIFO-queue work of Step 11 does not apply to any of them —
the edge is the whole of the effect.

**Change (a) — `tests/admin.albumActionsBarrel.test.ts`, unconditional.** That file's own header
states the rule that decides this: *"importing a real action module still executes its import
graph, so the same edges the action-level suites mock are mocked here."* A new edge into the graph
is therefore a new mock in that file, by the file's own standard and not by preference. Add beside
the existing `vi.mock` block (which already doubles `@vercel/blob`, `next/server`, `next/cache`,
`@/lib/admin/requireAdmin`, `@/lib/nina/vision`, `@/lib/nina/embedding`):

```ts
vi.mock('@/lib/nina/provenancePromotion', () => ({
  promoteNinaAvatarDependents: vi.fn(),
  promoteNinaImageDependents: vi.fn(),
}))
```

No assertion changes: `BARREL_ACTIONS` and the per-module pins are unchanged, because this phase
adds no action export. If that list needs editing, a wiring step went wrong.

**Change (b) — the other three, conditional.** Run them first:

```bash
npx vitest run tests/admin.albumAvatarActions.test.ts tests/admin.albumDescribeEmbed.test.ts \
  tests/admin.chatPhotoAdoption.test.ts
```

- **Green** — land nothing in them beyond Step 11's prose fix in `admin.chatPhotoAdoption`. `sharp`
  is a real dependency in `serverExternalPackages`, these are `.test.ts` files (node environment, so
  `server-only` resolves to its harmless node entry), and a suite that passes needs no double. Do
  **not** add a mock "for safety" — an unused module mock in a structural suite is the kind of
  drive-by that the barrel file's header exists to prevent.
- **Red** — add the same `vi.mock('@/lib/nina/provenancePromotion', …)` block from (a), and nothing
  else. A failure here is an import-time failure, not a behavioural one; if a suite fails for any
  reason that is *not* the load of `sharp` or `server-only`, stop and re-read Step 11 — that is a
  statement-order problem this step does not own.

**Impact:** one certain mock, up to three conditional ones. No assertion in any of the four files
changes.

---

## Verification

**Build:** `npx tsc --noEmit`

**Tests:**
```
npx vitest run tests/nina.provenancePromotion.test.ts tests/admin.albumAvatarDelete.test.ts \
  tests/admin.folderActions.test.ts tests/nina.galleryDelete.test.ts \
  tests/nina.attachTargets.test.ts tests/admin.chatPhotos.test.ts \
  tests/admin.chatPhotoAdoption.test.ts tests/admin.albumAvatarActions.test.ts \
  tests/nina.blobRelease.test.ts lib/nina/queries.test.ts \
  tests/admin.albumActionsBarrel.test.ts tests/admin.albumDescribeEmbed.test.ts
```

The last two are Step 12's: they import the real album barrel and therefore inherit the new
`provenancePromotion` → `perceptualSign` → `sharp` edge without exercising a single delete.
then the full suite: `npm test`

**Lint / dead code:** `npx eslint lib tests --max-warnings=0` and `npx knip` — the three new barrel
exports each have a real caller, so knip must stay clean; a flag there means a wiring step was
missed.

**Manual check:** none required, and none possible without touching production data. The observable
behaviour lives in `/admin/nina`: deleting an album photograph a conversation still shows must
leave that bubble rendering (the object survives), and the surviving `nina_message_images` row must
come out of the delete carrying a `content_hash`. That is exactly what
`tests/admin.albumAvatarDelete.test.ts`'s first case asserts against real generated SQL, and
verifying it against the real database belongs to Phase 2's read-only dry run, not here.

**Exit criteria:**
1. `npx tsc --noEmit` clean and `npm test` green.
2. A fixture in which an avatar with an unmeasured dependent is deleted ends with the promotion
   UPDATE having run (with `content_hash is null` AND `pathname =` in its WHERE) before the row
   DELETE, and with `del` never called because the promoted dependent still names the object.
3. A fixture with no dependents behaves exactly as before: no fetch, no promotion statement, and
   `del` called with the same URLs as today.
4. `lib/nina/queries.test.ts` passes with exactly 96 names.
5. All three prose sites that this phase makes false are fixed **in the same commit as the code**:
   `generatedChatPhotoScope`'s parenthetical (Step 2), `setChatPhotoAsAvatarAction`'s
   `── THE BYTES ARE COPIED, NOT SHARED ──` paragraph (Step 5c), and
   `tests/admin.chatPhotoAdoption.test.ts`'s header sentence (Step 11). Grepping the tree for
   `no reference check` must return no line that states it in the present tense.
6. The four suites that inherit the new `sharp` / `server-only` import edge (Step 12) are green,
   and any mock added there is the `provenancePromotion` edge mock and nothing else.

---

## Handoffs

- **Phase 2 (R1) owns every existing ghost.** This phase stops new ones being created; it repairs
  nothing already in the database, including `Tdw_AkrJT0ks`. Phase 2's script restates these
  primitives locally (it cannot import this TypeScript — the `--experimental-strip-types` constraint
  `scripts/nina-dedupe-plan.mjs` and `lib/photos/contentHash.ts` both record) and must reproduce
  the same two write guards: `content_hash is null`, and the pathname check.
  **Semantics Phase 2 should mirror exactly:** one GET per distinct pathname; hash and signature
  measured off the SAME buffer; a sharp failure still writes the hash and leaves
  `perceptual_hash`/`perceptual_sig`/`width`/`height` untouched; a dead object is reported by id and
  never auto-deleted.
- **A batched reference predicate, if the reap ever measures badly.** `reapAvatarBlobs` asks
  `isBlobPathnameReferenced` per object (2 statements each, 8 in flight). A single
  `listReferencedBlobPathnames(userId, pathnames)` would answer a whole batch in one pair of
  statements. Not built here: nothing has measured a need, the scope names the per-pathname check,
  and a fourth barrel export for an unmeasured optimisation is not this phase's to spend.
- **`releaseBlobIfUnreferenced` could absorb the batch case.** It is one object per call today, and
  `reapAvatarBlobs` re-states its rule (not its code) for the batching reason argued in that
  function's docstring. Unifying them would mean giving the shared helper a plural form; a
  legitimate follow-up, deliberately not taken while its single-object callers are the majority.
- **`scripts/blob-reap.mjs` still does not know the `nina/` prefix** (ruling D4's open card). This
  phase shrinks the orphan class it would have to clean — fewer objects are deleted, and none that
  something still references — but does not close that card.
- **The `message_id` FK docstring drift** noted in the plan index's Scope is untouched, as agreed.

## Rollback

Revert the branch. The phase is a pure addition plus a call-site reordering: no migration, no
schema change, no data backfill, and no deleted symbol for anything else to have started depending
on.

The only durable trace a run of this code leaves is measurement columns on
`nina_message_images` rows that were previously NULL — `content_hash`, `perceptual_hash`,
`perceptual_sig`, `width`, `height`, `bytes`, all true statements about the bytes those rows'
`blob_url` serves. Reverting leaves them in place, and that is harmless in both directions: a
promoted row that is still a reference is invisible to every dedup read (all of them carry
`isOriginalPhoto()`), and a promoted row whose parent is already gone is simply a correctly measured
original — which is the outcome this phase exists to produce and definitionally not something to
undo. If one ever had to be undone, it is one UPDATE setting those six columns back to NULL for the
named ids.
