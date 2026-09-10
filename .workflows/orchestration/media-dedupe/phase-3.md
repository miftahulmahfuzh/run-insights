# Phase 3: Write-time dedup: generated + admin paths

**Plan set:** `MEDIA_DEDUPE_PLAN.md`
**Analysis:** `20260910-103604_code_analyzer.md`
**Satisfies:** R1, R2 — no duplicate bytes reach the Blob store from the two write paths the
server (or the admin browser) can hash itself
**Depends on:** Phase 1 (column, hash util, finder, insert pass-through)
**Difficulty:** HARD
**Package:** `lib/nina`, `lib/admin`, `scripts` (+ `components/admin` client half of the admin path)

---

## Goal

After this phase, none of the remaining two write paths can store a second copy of bytes the same
user already has. `storeNinaImage` (`lib/nina/imagerun.ts`) hashes the generated PNG **before**
`put` and, on a hit, skips the put entirely and lets `finishSelfie` write the row as an F37
*reference* to the existing original. `scripts/nina-image-worker.ts` behaves identically in
lockstep (raw SQL, same decision function). `uploadChatPhoto` hashes the encoded JPEG, asks a new
owner-scoped pre-check action before `upload()`, and on a hit skips the PUT and hands
`addChatPhotoAction` a pinned-row claim; the action then writes the add as a reference to the
keeper, copies its already-paid-for description, and never trips the blob-release unwind that a
fresh upload would need. All three paths race-close at insert time the way phase 2 does: re-check,
loser becomes a reference, loser blob released row-first-blob-second.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none — no symbol is removed anywhere.

**Renames:** none.

**Creates:**

- `lib/nina/imageDedupe.ts` (NEW, pure, **zero imports** — the worker imports it under
  `--experimental-strip-types`): `NinaImageDedupHit`, `NinaImageWriteInput`, `NinaImageWritePlan`,
  `planNinaImageWrite(input): NinaImageWritePlan`. **RECONCILED: this is the one dedup decision
  shared by the two generated-image hosts — and only them.** Phase 2's STEP 1b race-close does
  NOT call it: phase 2 ships its own client-safe, batch-aware module (`lib/nina/dedupe.ts`,
  `partitionNinaUploadClaims` + `ninaUploadInsertRow`), whose rows carry fields this plan does
  not model (`kind`, the description preference, measurements omitted on references, no hash on
  references, the same-send twin split) and which the composer must be able to import. Three
  decision modules, three jobs — unification was considered and rejected (plan index, Decisions;
  see Handoffs).
- `lib/admin/chatPhotos.ts`: `ChatPhotoKeeper`, `ChatPhotoAddPlan`,
  `planChatPhotoAddWrite(input): ChatPhotoAddPlan` (pure; imports `ninaPhotoProvenance` from
  `@/lib/nina/attach` — client-safe).
- `lib/admin/chatPhotoActions.ts`: `findChatPhotoDuplicateAction(contentHash: string): Promise<{
  id: string; blobUrl: string; pathname: string } | null>` — a NEW exported server action
  (owner-scoped via `requireAdmin()` + phase 1's finder).
- `scripts/nina-image-worker.ts`: `WorkerContentDuplicate`, `findContentDuplicate(sql, userId,
  contentHash)`, `WorkerStoredImage`, `releaseBlobIfUnreferenced(sql, userId, ref, delFn = del)`;
  `REQUIRED_COLUMNS` is now **exported** so a test can pin its shape.
- `tests/nina.imageDedupe.test.ts` (NEW), `tests/admin.chatPhotoDedupe.test.ts` (NEW).

**Signature changes:**

- `scripts/nina-image-worker.ts` `store(userId, purpose, b64)` → `store(sql, userId, purpose,
  b64): Promise<WorkerStoredImage>` (module-private; `runOneJob` is the only caller and now passes
  `sql`).
- `scripts/nina-image-worker.ts` `finishSelfie`'s `image` parameter: phase 1 widened it to
  `{ blobUrl; pathname; bytes; contentHash?: string | null }`; **this phase replaces that with
  `WorkerStoredImage`** — `contentHash: string | null` (now required) plus
  `duplicateOf: { id; blobUrl; pathname } | null`. Phase 1's `store()` result stopped compiling
  anyway — this phase is the "P3 fills the value" phase 1's contract names.
- `components/admin/chatPhotoUpload.ts` `uploadChatPhoto(userId, file)` →
  `uploadChatPhoto(userId, file, opts?: { dedupe?: boolean })`; `UploadedChatPhoto` gains
  `contentHash: string` and `duplicateOfId: string | null` (both flow into `addChatPhotoAction`
  untouched through `ChatPhotoAdd`).
- `lib/nina/queries.ts` `NinaChatPhotoBlobPatch` gains optional `contentHash?: string | null`;
  `updateNinaChatPhotoBlob` writes it (coalesced to NULL) in the SAME `.set()`. **This is the one
  edit in a file phase 1 also edits** — different hunks (`NinaChatPhotoBlobPatch` at ~:1926,
  `updateNinaChatPhotoBlob` at ~:1964, its `.set()`'s `sourceImageId: null,` at ~:1988 — the
  earlier draft's `~:918-962` anchor was stale — vs phase 1's `NinaImageRow` :221 /
  `NinaImageInsert` :257 / `imageColumns` :603 / insert :1598 / finder after :1774). Phase 1 does
  not touch `updateNinaChatPhotoBlob`, so this step's quotes are valid in the post-phase-1 tree
  as-is; the order is phase 1 first. It is NOT optional work: Replace swaps bytes, and a byte
  swap that left the old hash on new bytes is the one lie the dedup lookup cannot survive
  (invariant 4).
- `lib/nina/imagerun.ts` `StoredImage` (module-private) gains `contentHash: string | null` and
  `duplicateOf: NinaImageDedupHit | null`; the `put` moves into an extracted module-private
  `putNinaImageBlob`. `storeNinaImage`'s signature is unchanged.

**Requires (from earlier phases):**

- Phase 1, exactly as its plan landed it: `lib/photos/contentHash.ts` exports
  `contentHashOf(input: Blob | ArrayBuffer | Uint8Array): Promise<string>` and
  `isValidContentHash(value: unknown): value is string`, and stays **zero-import** (this phase's
  worker imports it with a relative `.ts` specifier under `--experimental-strip-types`).
- Phase 1: `findNinaImageByContentHash(userId: string, contentHash: string): Promise<NinaImageRow
  | null>` — owner-scoped, ORIGINALS only (both provenance columns NULL), newest first, takes a
  `string` (callers validate with `isValidContentHash` first and do not call on a bad claim).
- Phase 1: `NinaImageInsert.contentHash?: string | null` pass-through with the shared-door
  coercion (invalid claim → NULL, never an error); `NinaImageRow.contentHash: string | null`.
- Phase 1: migration `0018` (`content_hash` + partial index
  `nina_message_images_user_content_hash_idx`) **applied before this phase's worker runs** — the
  worker's `findContentDuplicate` SELECT names `content_hash`, `source_avatar_id`,
  `source_image_id` and `created_at`, so an un-migrated database now fails at `preflight`
  (`findSchemaDrift`) instead of mid-job. That red workflow is the designed deploy-order signal.
- Phase 1: the worker's raw INSERT already names `content_hash` (bound from
  `image.contentHash ?? null`). **This phase REPLACES that statement** (it gains
  `source_image_id` and binds the plan's values); reconciler: keep this phase's version — it
  supersedes phase 1's 7c while keeping every property phase 1 stated (hash bound as a parameter,
  one statement shape).

**Leaves alone (owned by others):** `components/nina/Composer.tsx` and `lib/nina/actions.ts`
(Phase 2 — including `sendNinaMessage`'s claim validation and STEP 1b); `app/api/upload/route.ts`
and `app/api/admin/nina/upload/route.ts` (the hash rides the same claim class as
`bytes`/`width`/`height`, NOT the upload token — no route changes on this phase, matching the plan
index); `lib/db/schema.ts` + `drizzle/` (Phase 1); `scripts/nina-dedupe-media.mjs` + `package.json`
(Phase 4); `lib/nina/queries.ts`'s four reads that must not filter (untouched — nothing here adds
a provenance/hash predicate to a read); `components/admin/ChatPhotoControls.tsx` (Replace
deliberately does NOT dedupe — see Step 11's docstring; it is untouched).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imageDedupe.ts` | create | pure shared write-plan decision, zero imports |
| `lib/nina/imagerun.ts` | modify | imports (:1-45); `StoredImage` (:115-119); `storeNinaImage` (:121-139) hashes pre-put + skip; extracted `putNinaImageBlob`; `finishSelfie` (:259-277) race-close + reference insert + release |
| `scripts/nina-image-worker.ts` | modify | imports + `del` (:59-100); `REQUIRED_COLUMNS` (:154-232) gains 6 names + `export`; `findContentDuplicate` (new); `store` (:634-650) → `(sql, …)` + dedup; `releaseBlobIfUnreferenced` (new); `finishSelfie` (P1's :768+) race-close + reference insert; `runOneJob` call site |
| `lib/admin/chatPhotos.ts` | modify | `ninaPhotoProvenance` import (:1-4); `planChatPhotoAddWrite` + two types (append at end) |
| `lib/admin/chatPhotoSchema.ts` | modify | `chatPhotoAddSchema` gains optional `contentHash` + `duplicateOfId`; `chatPhotoReplaceSchema` gains optional `contentHash` |
| `lib/admin/chatPhotoActions.ts` | modify | imports (:1-41); `addChatPhotoAction` (:227-295) rewritten around `planChatPhotoAddWrite`; new `findChatPhotoDuplicateAction` (after ADD section); `replaceChatPhotoAction` (:136-191) passes the hash claim |
| `lib/nina/queries.ts` | modify | `NinaChatPhotoBlobPatch` + `updateNinaChatPhotoBlob` write `content_hash` (~:1926-2000) — shared file with P1, distinct hunk; P1 lands first and does not touch these lines |
| `components/admin/chatPhotoUpload.ts` | modify | hash the encoded blob; pre-check via the new action; skip the PUT on a hit; return the claims |
| `components/admin/ChatPhotoAdd.tsx` | modify | one line — `uploadChatPhoto(userId, file, { dedupe: true })` (:57) |
| `tests/nina.imageDedupe.test.ts` | create | the shared decision's answers |
| `tests/admin.chatPhotoDedupe.test.ts` | create | the admin plan decision's answers |
| `tests/nina.imagerun.test.ts` | modify | mocks (`findNinaImageByContentHash`, `releaseBlobIfUnreferenced`, `put`); new dedup describe |
| `tests/nina.imageworker.test.ts` | modify | `image` fixture gains the two fields; REQUIRED_COLUMNS shape test; skip/race/release/findContentDuplicate tests |
| `tests/admin.chatPhotos.test.ts` | modify | queries mock factory + default; new dedup describe through `addChatPhotoAction` |
| `tests/nina.photoRefs.test.ts` | modify | one added case: Replace names `content_hash` in the same statement |

## Implementation Steps

### Step 1: The shared decision — `lib/nina/imageDedupe.ts` (NEW)

**File:** `lib/nina/imageDedupe.ts` (new file)

**Change:** Both hosts that write a generated image (`lib/nina/imagerun.ts` and
`scripts/nina-image-worker.ts`) must not be able to disagree about what a deduped write looks
like. The worker cannot import `lib/nina/queries.ts` (`server-only` + `@/` aliases — its header
states the trade), so the decision is extracted into a module with **no imports at all**, the same
rule `lib/nina/imagefail.ts` states for itself and `lib/id.ts` states for the whole repo.

Three answers, one function:

1. `hit == null` → the row is an ORIGINAL carrying this path's own object and hash; nothing to
   release.
2. `hit != null` and the stored pathname IS the keeper's (the pre-put skip path — no bytes were
   ever put) → the row is a REFERENCE to the keeper; nothing to release.
3. `hit != null` and the stored pathname is different (the race path — fresh bytes lost the race)
   → the row is a REFERENCE to the keeper and the fresh loser bytes are RELEASED after the row
   lands (ROW FIRST, BLOB SECOND — the plan carries the release; the caller orders it).

**Code:**

```ts
/**
 * **The one dedup decision both hosts share.** `lib/nina/imagerun.ts` (the in-platform writer)
 * and `scripts/nina-image-worker.ts` (the GitHub backstop) must produce the same row from the
 * same facts, and the worker can import neither `queries.ts` (`server-only`, `@/` aliases) nor
 * anything this module would drag in — so this file imports NOTHING. Strip its types and it
 * still runs; that is the whole contract, the same one `lib/nina/imagefail.ts` and `lib/id.ts`
 * state for themselves.
 *
 * ── WHAT IT DECIDES ───────────────────────────────────────────────────────────────────────────
 * Given the ORIGINAL row that already holds these bytes (the "keeper", or null) and the location
 * of the bytes this write was about to store, it returns the values the `nina_message_images` row
 * takes and — when fresh bytes were actually put and then lost the race — the object to RELEASE
 * once the row is in. Three answers, and the third is where the ordering rule lives:
 *
 *   · no keeper                → an original; the row names this path's own object.
 *   · keeper, same pathname    → the pre-put skip: no bytes were put, so the row references the
 *                                keeper and there is nothing to release. The caller reaches this
 *                                answer by passing the KEEPER's own location as `stored`.
 *   · keeper, other pathname   → the race: fresh bytes were put before a concurrent original
 *                                landed. The row references the keeper and the fresh loser bytes
 *                                are released — ROW FIRST, BLOB SECOND (plan invariant 3). The
 *                                release travels IN the plan; the caller puts the row in first.
 *
 * ── WHY THE HASH RIDES ON THE REFERENCE ROW TOO ───────────────────────────────────────────────
 * `content_hash` is a fact about the BYTES, and a reference row displays exactly the bytes the
 * keeper stores. Writing the hash keeps the column's one semantics — identical hash ⟺ identical
 * bytes in the store (plan invariant 4) — true for every row that carries it, and it costs
 * nothing: the value is already in hand.
 *
 * RECONCILED, do not "fix" either side: phase 2's upload-path references carry NO hash (its
 * `ninaUploadInsertRow`), because there the hash is a CLIENT CLAIM and a claim never lands on a
 * row that does not own the bytes. The per-path rule the index records: a reference row carries
 * the hash only when its writer held and measured the bytes — which is this module's case (the
 * server hashed before/instead of the put) and never phase 2's. Phase 4's sweep pass 1 fills the
 * hash-less references from the Blob later; those NULLs are expected, not drift.
 */

export interface NinaImageDedupHit {
  /** The existing ORIGINAL row's id — what the new row's `source_image_id` will name. */
  id: string
  blobUrl: string
  pathname: string
}

export interface NinaImageWriteInput {
  /** The original that already holds these bytes, or null when this write is an original. */
  hit: NinaImageDedupHit | null
  /**
   * Where the bytes this write owns live: the object just `put` on the race path, or the KEEPER's
   * own location on the skip path (which is what makes the skip and the race ONE function — the
   * pathname comparison is the only thing distinguishing them).
   */
  stored: {
    blobUrl: string
    pathname: string
    contentHash: string | null
  }
}

export interface NinaImageWritePlan {
  row: {
    blobUrl: string
    pathname: string
    /** Non-null makes the row a REFERENCE (`isOriginalPhoto()` then hides it from Media). */
    sourceImageId: string | null
    contentHash: string | null
  }
  /** The loser object to release AFTER the row lands, or null when nothing was put. */
  release: { blobUrl: string; pathname: string } | null
}

export function planNinaImageWrite(input: NinaImageWriteInput): NinaImageWritePlan {
  const { hit, stored } = input

  if (hit == null) {
    return {
      row: {
        blobUrl: stored.blobUrl,
        pathname: stored.pathname,
        sourceImageId: null,
        contentHash: stored.contentHash,
      },
      release: null,
    }
  }

  return {
    row: {
      blobUrl: hit.blobUrl,
      pathname: hit.pathname,
      sourceImageId: hit.id,
      contentHash: stored.contentHash,
    },
    release:
      stored.pathname === hit.pathname
        ? null
        : { blobUrl: stored.blobUrl, pathname: stored.pathname },
  }
}
```

**Impact:** New file only — nothing else compiles differently yet. The pathname comparison is the
load-bearing line: `addRandomSuffix: true` guarantees two DIFFERENT objects never share a
pathname, so "same pathname" and "we never put" are the same fact on every path that reaches this
function.

### Step 2: Tests for the shared decision — `tests/nina.imageDedupe.test.ts` (NEW)

**File:** `tests/nina.imageDedupe.test.ts` (new file)

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { planNinaImageWrite } from '@/lib/nina/imageDedupe'

/**
 * **The one dedup decision both hosts share, pinned.** `lib/nina/imagerun.ts` (in-platform) and
 * `scripts/nina-image-worker.ts` (the backstop) must not be able to disagree about what a deduped
 * write looks like, so the decision is a pure function with no imports and these are its answers.
 * No database, no network — the rule `tests/nina.imageworker.test.ts` states for its own suite.
 */

const KEEPER = {
  id: 'keeper000001',
  blobUrl: 'https://blob.test/nina/u1/selfie-keeper.png',
  pathname: 'nina/u1/selfie-keeper.png',
}

const FRESH = {
  blobUrl: 'https://blob.test/nina/u1/selfie-fresh-abcd.png',
  pathname: 'nina/u1/selfie-fresh-abcd.png',
}

/** NIST FIPS 180-4's SHA-256("abc") — the spelling the column stores. */
const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('planNinaImageWrite', () => {
  it('writes an original when nothing shares the bytes, and releases nothing', () => {
    expect(planNinaImageWrite({ hit: null, stored: { ...FRESH, contentHash: HASH } })).toEqual({
      row: {
        blobUrl: FRESH.blobUrl,
        pathname: FRESH.pathname,
        sourceImageId: null,
        contentHash: HASH,
      },
      release: null,
    })
  })

  it('writes a null hash when the purpose is out of dedup scope, and that is honest', () => {
    // The avatar purpose: hashed by nobody, deduped by nobody. NULL means "no claim was made",
    // which is invariant 9's meaning for the column — not a missing one.
    expect(planNinaImageWrite({ hit: null, stored: { ...FRESH, contentHash: null } })).toEqual({
      row: {
        blobUrl: FRESH.blobUrl,
        pathname: FRESH.pathname,
        sourceImageId: null,
        contentHash: null,
      },
      release: null,
    })
  })

  it('on the skip path the row references the keeper and nothing is released (nothing was put)', () => {
    // The caller passes the KEEPER's own location as `stored` when it skipped the put — the
    // pathname comparison is what makes skip and race one function.
    const plan = planNinaImageWrite({
      hit: KEEPER,
      stored: { blobUrl: KEEPER.blobUrl, pathname: KEEPER.pathname, contentHash: HASH },
    })
    expect(plan.row).toEqual({
      blobUrl: KEEPER.blobUrl,
      pathname: KEEPER.pathname,
      sourceImageId: KEEPER.id,
      contentHash: HASH,
    })
    expect(plan.release).toBeNull()
  })

  it('on the race path the row references the keeper and the fresh loser bytes are released', () => {
    // ROW FIRST, BLOB SECOND: the release travels in the plan; the caller inserts the row first.
    const plan = planNinaImageWrite({ hit: KEEPER, stored: { ...FRESH, contentHash: HASH } })
    expect(plan.row.blobUrl).toBe(KEEPER.blobUrl)
    expect(plan.row.sourceImageId).toBe(KEEPER.id)
    expect(plan.release).toEqual({ blobUrl: FRESH.blobUrl, pathname: FRESH.pathname })
  })

  it('keeps the hash on the reference row: the column is about the bytes, and they are the same', () => {
    // Invariant 4's one semantics — identical hash ⟺ identical bytes in the store — holds for a
    // reference row too, because it displays exactly the keeper's bytes.
    const plan = planNinaImageWrite({ hit: KEEPER, stored: { ...FRESH, contentHash: HASH } })
    expect(plan.row.contentHash).toBe(HASH)
  })
})
```

### Step 3: `lib/nina/imagerun.ts` — hash before put, skip the put, race-close at insert

**File:** `lib/nina/imagerun.ts` (phase 1 does NOT touch this file, so line numbers are the
current tree's)

**Change:** Four edits.

**3a. The import block (:1-45).** Complete replacement — three additions
(`contentHashOf`, `releaseBlobIfUnreferenced`, `planNinaImageWrite` + its type, and
`findNinaImageByContentHash` in the existing `./queries` list):

```ts
import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'

import { releaseBlobIfUnreferenced } from './blobRelease'
import { captionNinaPhoto } from './caption'
import { callNinaImageModel, type NinaImageCallResult } from './imagecall'
import { planNinaImageWrite, type NinaImageDedupHit } from './imageDedupe'
import { ninaImageCaption, type NinaImageFailure } from './imagefail'
import {
  claimNinaImageJob,
  completeNinaImageJob,
  failNinaImageJob,
  findNinaImageByContentHash,
  listRevivableNinaImageJobs,
  requeueNinaImageJob,
} from './imagejobs'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_FINISH_RESERVE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REVIVE_BUDGET,
  NINA_IMAGE_RUN_BUDGET_MS,
  NINA_IMAGE_WIDTH,
  ninaImageCallTimeoutMs,
  ninaImagePathname,
  ninaImageReferenceUrl,
  type NinaImageJobArgs,
  type NinaImagePurpose,
} from './imagerecipe'
import {
  getNinaMessagesByIds,
  insertNinaAvatarAsCurrent,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
} from './queries'
import { resolveNinaWriteSession } from './sessionResolve'
import { NINA_TUNING_DEFAULTS } from './tuning'
```

**3b. `StoredImage` (:115-119) — complete replacement:**

```ts
interface StoredImage {
  blobUrl: string
  pathname: string
  bytes: number
  /**
   * media-dedupe P3. sha-256 hex of the exact bytes this image holds, or null when the purpose is
   * out of dedup scope (`avatar` — `nina_avatars` carries no hash and the Media collection never
   * reads it). Computed BEFORE the put; this is the one generated path where the server holds the
   * bytes, so here the hash is a fact and not a claim.
   */
  contentHash: string | null
  /**
   * Non-null: an ORIGINAL row of this user's already stores exactly these bytes and the put was
   * SKIPPED. The row that lands below references it (F37's shape) instead of storing a second
   * object — the measured defect this plan exists for (`sbTuT8NKXL24` + `ywNnXvpnnKSi`).
   */
  duplicateOf: NinaImageDedupHit | null
}
```

**3c. `storeNinaImage` (:121-139) — complete replacement** (the put itself moves into a
module-private `putNinaImageBlob` so the dedup branch reads):

```ts
/**
 * The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix.
 *
 * ── media-dedupe P3: THE HASH HAPPENS HERE, BEFORE THE PUT ────────────────────────────────────
 * This is the one generated path where the server holds the bytes, so this is where the
 * content-hash claim stops being a claim. `contentHashOf` runs BEFORE `put`, because the only way
 * to skip the put is to already know the answer. A hit means an ORIGINAL row of this user's
 * already stores exactly these bytes — and `addRandomSuffix: true` would otherwise guarantee that
 * identical bytes land as a second object — so the put is skipped entirely and the row that
 * `finishSelfie` writes becomes a REFERENCE (the keeper's `blob_url`/`pathname` copied on, the
 * keeper's id in `source_image_id`). The row is not dropped and no bytes are stored: plan
 * invariants 2 and 4. The race window this leaves (two hosts answering "no" before either
 * inserts) is closed by the re-check in `finishSelfie`, not here — one decision,
 * `planNinaImageWrite`, serves both.
 *
 * ── WHY A LOOKUP FAULT CANNOT COST THE PHOTOGRAPH ─────────────────────────────────────────────
 * The generation has already been paid for when this runs (78 s and $0.04, measured). Dedup is an
 * optimization on top of that spend, so a dead connection at the lookup degrades to today's
 * behavior — put + original row — and never to a lost photograph. The re-check in `finishSelfie`
 * degrades the same way. What is NOT degraded is the column: `contentHash` is computed locally
 * and always travels.
 *
 * ── WHY `avatar` IS OUTSIDE THE SCOPE ─────────────────────────────────────────────────────────
 * The dedup contract is Media's: `nina_message_images` owns the column and the lookup. An avatar
 * is a `nina_avatars` row — out of this plan set's scope by its own "Out of scope" line — and
 * hashing its bytes would be work with no reader. `contentHash: null` says exactly that.
 */
async function storeNinaImage(
  userId: string,
  purpose: NinaImagePurpose,
  b64: string,
): Promise<StoredImage> {
  const bytes = Buffer.from(b64, 'base64')
  if (purpose === 'avatar') {
    const blob = await putNinaImageBlob(userId, purpose, bytes)
    return { ...blob, bytes: bytes.byteLength, contentHash: null, duplicateOf: null }
  }

  const contentHash = await contentHashOf(bytes)

  let duplicateOf: NinaImageDedupHit | null = null
  try {
    duplicateOf = await findNinaImageByContentHash(userId, contentHash)
  } catch (cause) {
    console.warn('[nina] dedup lookup failed; storing anyway', {
      purpose,
      hash: contentHash.slice(0, 12),
      error: String(cause),
    })
  }

  if (duplicateOf != null) {
    console.info('[nina] generated image deduped; the put is skipped', {
      purpose,
      bytes: bytes.byteLength,
      hash: contentHash.slice(0, 12),
    })
    return {
      blobUrl: duplicateOf.blobUrl,
      pathname: duplicateOf.pathname,
      bytes: bytes.byteLength,
      contentHash,
      duplicateOf,
    }
  }

  const blob = await putNinaImageBlob(userId, purpose, bytes)
  return { ...blob, bytes: bytes.byteLength, contentHash, duplicateOf: null }
}

/** The put itself, exactly the pre-dedup statement — extracted so the dedup branch reads. */
async function putNinaImageBlob(
  userId: string,
  purpose: NinaImagePurpose,
  bytes: Buffer,
): Promise<{ blobUrl: string; pathname: string }> {
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    /* Through `lib/env.ts`, never `process.env` — plan invariant 3. `lib/share/rotateBlobs.ts:64`
     * is the precedent; `scripts/` is the only place that reads the raw variable. */
    token: blobEnv().BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname }
}
```

The log lines carry a 12-char hash prefix and a byte count, never a pathname — pathnames contain
the user id, and this repository is public.

**3d. `finishSelfie` (:256-277) — the tail from the no-message guard to the end, complete
replacement.** The message insert (:236-259) and everything above it are UNCHANGED; the description
and prompt semantics below are a decision, argued inline:

```ts
  /* `insertNinaMessages` returns `[]` rather than throwing when the session is not his. That
   * cannot happen here — we just resolved it from his own rows — so it is a bug, not a
   * degradation, and it must not be swallowed into a "successful" job with no bubble. */
  if (message == null) throw new Error('finishSelfie: no message row was written')

  /*
   * ── media-dedupe P3: THE RACE-CLOSE — THE QUESTION IS ASKED A SECOND TIME, AT THE INSERT ────
   * `storeNinaImage` asked "does this user already store these bytes?" before its put, but two
   * hosts can both answer no and then both put: a sweep runner and an in-platform `after()` share
   * no lock, and a seeded re-generation produces identical bytes BY DESIGN (same prompt, same
   * seed). So the question is asked again here, after the put and as close to the insert as this
   * code can stand. A hit at this door writes the row as a REFERENCE to that keeper and releases
   * the bytes we just stored — ROW FIRST, BLOB SECOND (plan invariant 3): the reference row is in
   * before `releaseBlobIfUnreferenced` asks whether anything still points at the loser. A lookup
   * fault degrades to "original", never to a lost photograph — the same rule as the pre-put
   * lookup, and the same reason.
   */
  let racedDuplicate: NinaImageDedupHit | null = null
  if (image.duplicateOf == null && image.contentHash != null) {
    try {
      racedDuplicate = await findNinaImageByContentHash(userId, image.contentHash)
    } catch (cause) {
      console.warn('[nina] dedup re-check failed; writing an original', {
        jobId,
        hash: image.contentHash.slice(0, 12),
        error: String(cause),
      })
    }
  }
  const writePlan = planNinaImageWrite({
    hit: image.duplicateOf ?? racedDuplicate,
    stored: { blobUrl: image.blobUrl, pathname: image.pathname, contentHash: image.contentHash },
  })
  if (writePlan.release != null) {
    console.info('[nina] lost a dedup race; the row will reference the keeper', {
      jobId,
      bytes: image.bytes,
      hash: image.contentHash?.slice(0, 12) ?? null,
    })
  }

  await insertNinaMessageImages(userId, [
    {
      messageId: message.id,
      kind: 'generated',
      /* The plan, not `image`: a deduped row carries the KEEPER's object and the keeper's id, so
       * `isOriginalPhoto()` hides it from the Media feed while the bubble still renders it. */
      blobUrl: writePlan.row.blobUrl,
      pathname: writePlan.row.pathname,
      width: NINA_IMAGE_WIDTH,
      height: NINA_IMAGE_HEIGHT,
      bytes: image.bytes,
      /* ── THE DESCRIPTION AND PROMPT STAY THIS GENERATION'S — DELIBERATELY ───────────────────
       * `resolveAttachment` copies the source description because that row would otherwise have
       * to PAY for vision prose it can get free. This row is the opposite case: it never pays for
       * prose at all — `args.scene` IS a truthful description of these bytes (we wrote the
       * picture from it), and the caption above is derived from it. Copying the keeper's scene
       * instead would put ANOTHER generation's prose under this bubble, and a different prompt
       * with the same seed can render identical bytes; the row must say what ITS generation was
       * told, which is what `prompt` (the sidecar) is for. */
      description: args.scene,
      prompt: args.sidecar,
      sourceImageId: writePlan.row.sourceImageId,
      contentHash: writePlan.row.contentHash,
      sortOrder: 0,
    },
  ])

  /* Loser bytes out — only after the row that pointed at them is in, and only when the plan says
   * there ARE loser bytes: the skip path referenced the keeper without ever putting, so there is
   * nothing of ours in the store at all. */
  if (writePlan.release != null) {
    const outcome = await releaseBlobIfUnreferenced(userId, writePlan.release)
    if (outcome !== 'deleted') {
      console.warn('[nina] dedup loser kept in the store', { jobId, outcome, bytes: image.bytes })
    }
  }

  await completeNinaImageJob(userId, jobId, result)
```

**Impact:** `attemptOnce`'s callers compile unchanged (`finishAvatar` still takes
`{ blobUrl; pathname; bytes }`, which `StoredImage` satisfies; its logging reads `image.bytes`).
The job still closes `'ok'` on every dedup path — a deduped photograph is a delivered
photograph, and `completeNinaImageJob` must record it as one. `finishSelfie`'s existing test suite
keeps passing once its mocks gain `findNinaImageByContentHash` (Step 4).

### Step 4: `tests/nina.imagerun.test.ts` — mocks and the dedup wiring

**File:** `tests/nina.imagerun.test.ts`

**Change:** Four edits.

**4a. The static import from `@/lib/nina/queries` (:12-17) gains `insertNinaAvatarAsCurrent`** —
the avatar-scope test below asserts on it, and `vi.mocked()` needs the real import:

```ts
import {
  getNinaMessagesByIds,
  insertNinaAvatarAsCurrent,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
} from '@/lib/nina/queries'
```

**4b. Mocks (:40-75).** Complete replacement of the mock block and its accessor list — three
additions: a hoisted `put` spy, `findNinaImageByContentHash` in the queries factory, and a
`releaseBlobIfUnreferenced` mock:

```ts
vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

/** Hoisted so the factory below can name it and the tests can assert on it. */
const { putBlob, findDuplicate, releaseLoser } = vi.hoisted(() => ({
  putBlob: vi.fn(),
  findDuplicate: vi.fn(),
  releaseLoser: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({ put: putBlob }))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'test-token' }) }))
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: releaseLoser }))
vi.mock('@/lib/nina/caption', () => ({ captionNinaPhoto: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
vi.mock('@/lib/nina/imagejobs', () => ({
  claimNinaImageJob: vi.fn(),
  completeNinaImageJob: vi.fn(),
  failNinaImageJob: vi.fn(),
  listRevivableNinaImageJobs: vi.fn(),
  requeueNinaImageJob: vi.fn(),
}))
vi.mock('@/lib/nina/queries', () => ({
  findNinaImageByContentHash: findDuplicate,
  getNinaMessagesByIds: vi.fn(),
  insertNinaAvatarAsCurrent: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  insertNinaMessages: vi.fn(),
  readNinaTuning: vi.fn(),
}))
vi.mock('@/lib/nina/sessionResolve', () => ({ resolveNinaWriteSession: vi.fn() }))

const caption = vi.mocked(captionNinaPhoto)
const claim = vi.mocked(claimNinaImageJob)
const complete = vi.mocked(completeNinaImageJob)
const fail = vi.mocked(failNinaImageJob)
const call = vi.mocked(callNinaImageModel)
const quotedRows = vi.mocked(getNinaMessagesByIds)
const insertImages = vi.mocked(insertNinaMessageImages)
const insertMessages = vi.mocked(insertNinaMessages)
const insertAvatar = vi.mocked(insertNinaAvatarAsCurrent)
const tuning = vi.mocked(readNinaTuning)
const writeSession = vi.mocked(resolveNinaWriteSession)
```

**4c. `beforeEach` (:96-116).** Add three default lines (and keep every existing one):

```ts
  putBlob.mockResolvedValue({
    url: 'https://blob.test/nina/u1/selfie-x.png',
    pathname: 'nina/u1/selfie-x.png',
  })
  findDuplicate.mockResolvedValue(null)
  releaseLoser.mockResolvedValue('deleted')
```

**4d. New describe, appended after the existing `describe('finishSelfie captions from the
scene')`:**

```ts
describe('write-time dedup (media-dedupe P3)', () => {
  const KEEPER = {
    id: 'keeper000001',
    blobUrl: 'https://blob.test/nina/u1/selfie-keeper.png',
    pathname: 'nina/u1/selfie-keeper.png',
  }
  const FRESH = {
    url: 'https://blob.test/nina/u1/selfie-fresh.png',
    pathname: 'nina/u1/selfie-fresh.png',
  }

  it('skips the put and writes a REFERENCE when an original already holds the bytes', async () => {
    findDuplicate.mockResolvedValue(KEEPER)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    /* The whole point: no second object exists. */
    expect(putBlob).not.toHaveBeenCalled()
    expect(insertImages).toHaveBeenCalledWith(
      USER,
      [
        expect.objectContaining({
          blobUrl: KEEPER.blobUrl,
          pathname: KEEPER.pathname,
          sourceImageId: KEEPER.id,
          /* The scene and sidecar stay THIS generation's — argued at the insert. */
          description: SCENE,
          prompt: ARGS.sidecar,
        }),
      ],
    )
    /* Nothing was put, so there is nothing to release. */
    expect(releaseLoser).not.toHaveBeenCalled()
    /* A deduped photograph is a delivered photograph. */
    expect(complete).toHaveBeenCalled()
  })

  it('hashes the bytes and writes the hash on a fresh original', async () => {
    putBlob.mockResolvedValue(FRESH)

    await runNinaImageJob(USER, JOB_ID)

    expect(putBlob).toHaveBeenCalledOnce()
    const [row] = insertImages.mock.calls[0]?.[1] ?? []
    expect(row?.sourceImageId ?? null).toBeNull()
    expect(row?.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(releaseLoser).not.toHaveBeenCalled()
  })

  it('loses a race at insert time: the row becomes a reference and the fresh bytes are released', async () => {
    // Two hosts both answered "no duplicate" before their puts; the re-check at insert is what
    // keeps the second object from surviving. ROW FIRST, BLOB SECOND.
    findDuplicate.mockResolvedValueOnce(null).mockResolvedValueOnce(KEEPER)
    putBlob.mockResolvedValue(FRESH)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(putBlob).toHaveBeenCalledOnce()
    expect(insertImages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ blobUrl: KEEPER.blobUrl, sourceImageId: KEEPER.id })],
    )
    expect(releaseLoser).toHaveBeenCalledWith(USER, {
      blobUrl: FRESH.url,
      pathname: FRESH.pathname,
    })
  })

  it('a dedup lookup fault degrades to a normal store; the photograph is never lost to it', async () => {
    // The generation was already paid for. Dedup is an optimization on top of that spend.
    findDuplicate.mockRejectedValue(new Error('neon: connection reset'))

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(putBlob).toHaveBeenCalledOnce()
    expect(insertImages).toHaveBeenCalled()
    expect(complete).toHaveBeenCalled()
  })

  it('an avatar generation is out of dedup scope: no lookup, no hash, album write as before', async () => {
    claim.mockResolvedValue({ args: { ...ARGS, purpose: 'avatar' }, attempts: 1 } as never)

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('ok')

    expect(findDuplicate).not.toHaveBeenCalled()
    expect(insertAvatar).toHaveBeenCalled()
  })
})
```

**Impact:** The existing describe's cases pass unchanged — `findDuplicate` defaults to `null` and
`releaseLoser` to `'deleted'`, so the no-duplicate path is byte-for-byte today's behavior. The
'makes no vision call, ever' source check is unaffected (nothing here imports `vision`).

### Step 5: `scripts/nina-image-worker.ts` — the lockstep, in its own SQL

**File:** `scripts/nina-image-worker.ts` — quoted AS PHASE 1 LEFT IT: `finishSelfie`'s image
parameter already carries `contentHash?`, the INSERT already names `content_hash`, and
`REQUIRED_COLUMNS['nina_message_images']` already lists `'content_hash'` (phase 1's 7a-7d). This
step builds on all four and **replaces the INSERT phase 1 wrote** (it gains `source_image_id` and
binds the shared plan's values).

**Change:** Seven edits.

**5a. Imports (:59-100).** The `require` gains `del`, and two pure modules join the import list —
`lib/photos/contentHash.ts` (phase 1's zero-import util, which is WHY it had to be zero-import)
and `lib/nina/imageDedupe.ts` (Step 1). Complete replacement of the two blocks:

```ts
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { newId } from '../lib/id.ts'
import { planNinaImageWrite, type NinaImageDedupHit } from '../lib/nina/imageDedupe.ts'
import { classifyImageFailure, ninaImageApology, ninaImageCaption } from '../lib/nina/imagefail.ts'
import type { NinaImageFailure } from '../lib/nina/imagefail.ts'
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  NINA_IMAGE_SWEEP_BUDGET,
  NINA_IMAGE_WIDTH,
  NINA_WORKER_CALL_TIMEOUT_MS,
  ninaImagePathname,
  ninaImageReferenceUrl,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../lib/nina/imagerecipe.ts'
import type { NinaImageJobArgs } from '../lib/nina/imagerecipe.ts'
import { contentHashOf } from '../lib/photos/contentHash.ts'

/* `@neondatabase/serverless` and `@vercel/blob` are CJS-friendly and are loaded the way every other
 * script in `scripts/` loads them (`scripts/blob-reap.mjs:34`), so this file needs no bundler and no
 * transform beyond stripping. */
const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless') as {
  neon: (url: string) => NeonSql
}
const { put, del } = require('@vercel/blob') as {
  put: (
    pathname: string,
    body: Buffer,
    options: Record<string, unknown>,
  ) => Promise<{ url: string; pathname: string }>
  del: (url: string) => Promise<unknown>
}
```

**5b. `REQUIRED_COLUMNS` (:154-232) — complete replacement, with `export` added to the const.**
The SELECTs this phase adds name six columns the file never named before, and the file's own rule
is that every named column must appear in the list or a rename goes red. The three untouched
entries are reproduced verbatim so this block can be pasted whole:

```ts
export const REQUIRED_COLUMNS: Record<string, WorkerTable> = {
  /* UPDATE and SELECT only — `claimJob` and the three terminal updates. Never inserted here: the
   * app opens every job (`openNinaImageJob`), and a worker that could open one would be a second
   * writer of a table whose whole point is that the app owns the ledger. */
  nina_turns: {
    inserts: false,
    columns: [
      'id',
      'user_id',
      'kind',
      'model',
      'status',
      'error_code',
      'tool_calls',
      'latency_ms',
      'cost_micro_usd',
      'args',
      'created_at',
    ],
  },
  /* SELECT only — `resolveWorkerSessionId`'s activity ordering. The worker deliberately cannot
   * CREATE a session: `ensureNinaSession` is the app's policy and a worker that minted one would
   * file a photograph into a conversation the runner has never seen. When no session exists the
   * worker declines to write the message instead. */
  nina_chat_sessions: {
    inserts: false,
    columns: ['id', 'user_id', 'created_at'],
  },
  nina_messages: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      /* FINDING 1. `NOT NULL` since migration 0004, and omitted by both INSERTs until that phase.
       * It is listed here so the existence check covers it AND so the NOT NULL coverage check
       * passes — the two halves have to agree or the worker will not start. */
      'session_id',
      'role',
      'text',
      'source',
      'turn_id',
      'reply_to_id',
      'sent_at',
    ],
  },
  nina_message_images: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'message_id',
      'kind',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'description',
      'prompt',
      /* media-dedupe P1/P3. P1 named content_hash for the INSERT; P3's `findContentDuplicate`
       * SELECT names it PLUS the two provenance columns (its originals-only WHERE) and
       * `created_at` (its ORDER BY). All four are listed for the existence check; all four are
       * nullable or defaulted, so the NOT NULL coverage check demands none of them. */
      'content_hash',
      'source_avatar_id',
      'source_image_id',
      'created_at',
      'sort_order',
    ],
  },
  nina_avatars: {
    inserts: true,
    columns: [
      'id',
      'user_id',
      'blob_url',
      'pathname',
      'width',
      'height',
      'bytes',
      'source',
      'description',
      /* media-dedupe P3: named by `releaseBlobIfUnreferenced`'s six-column reference check — the
       * same six columns `isBlobPathnameReferenced` asks, so the worker cannot release an object
       * the app would have kept (an album thumbnail sharing bytes is the case that makes the
       * `thumb_*` columns more than symmetry). */
      'thumb_pathname',
      'thumb_url',
      'is_current',
      'announced_at',
    ],
  },
}
```

**5c. The dedup finder, placed directly after `REQUIRED_COLUMNS`' `findSchemaDrift`/`preflight`
block (after phase 1's `preflight`, ~:338):**

```ts
/** The row `findContentDuplicate` answers with — the shape `imageDedupe.ts` states its `hit` in. */
export interface WorkerContentDuplicate {
  id: string
  blobUrl: string
  pathname: string
}

/**
 * The worker's own spelling of `findNinaImageByContentHash` (`lib/nina/queries.ts`), clause for
 * clause — it cannot be imported (`server-only`, `@/` aliases; this file's header), so the
 * POLICY is restated in SQL and the duplication is kept honest the way every duplication in this
 * file is: by naming the columns in `REQUIRED_COLUMNS`, where a drift takes the workflow red.
 *
 *   · owner-scoped — `user_id` in the WHERE, invariant 5;
 *   · ORIGINALS ONLY — both provenance columns `IS NULL`. A reference must never satisfy a dedup
 *     lookup, or two references could chain onto each other and the keeper's deletion would
 *     re-materialize BOTH as originals;
 *   · newest first — `created_at desc` with `id desc` as the tie-break, the same tie-break the
 *     collection reads use, so a re-run after a crash names the same keeper.
 *
 * Phase 1's partial index (`nina_message_images_user_content_hash_idx`) makes this a lookup, not
 * a scan.
 */
export async function findContentDuplicate(
  sql: NeonSql,
  userId: string,
  contentHash: string,
): Promise<WorkerContentDuplicate | null> {
  const rows = (await sql`
    select id, blob_url, pathname
    from nina_message_images
    where user_id = ${userId}
      and content_hash = ${contentHash}
      and source_avatar_id is null
      and source_image_id is null
    order by created_at desc, id desc
    limit 1
  `) as Array<{ id: string; blob_url: string; pathname: string }>

  const row = rows[0]
  return row == null ? null : { id: row.id, blobUrl: row.blob_url, pathname: row.pathname }
}
```

**5d. `store` (phase 1 did not change its body; it sits at ~:634) — complete replacement:**

```ts
/**
 * The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix.
 *
 * ── media-dedupe P3: HASH BEFORE PUT, IN LOCKSTEP WITH `lib/nina/imagerun.ts` ─────────────────
 * Same rule, second host: the bytes are in hand, so `contentHashOf` runs BEFORE `put` and a hit
 * in this user's originals skips the put entirely — `addRandomSuffix: true` would otherwise
 * guarantee that identical bytes land as a second object. The row-level decision is NOT made
 * here: `store` reports what it found and `finishSelfie` runs `planNinaImageWrite` — the SAME
 * pure function the app side calls — so the two hosts cannot disagree about what a deduped write
 * looks like. A lookup fault degrades to a plain put (a paid generation must never be lost to a
 * dedup read), exactly as the app side degrades.
 *
 * `avatar` is outside the dedup scope, here as there: `nina_avatars` carries no `content_hash`
 * and the Media collection never reads it.
 *
 * `sql` became a parameter because the dedup lookup needs the database; `runOneJob` is the only
 * caller and already holds it.
 */
export interface WorkerStoredImage {
  blobUrl: string
  pathname: string
  bytes: number
  /** sha-256 hex of the exact bytes, or null when the purpose is out of dedup scope (`avatar`). */
  contentHash: string | null
  /** Non-null: an original already holds these bytes and the put was SKIPPED. */
  duplicateOf: NinaImageDedupHit | null
}

async function putBlob(
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  bytes: Buffer,
): Promise<{ blobUrl: string; pathname: string }> {
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname }
}

export async function store(
  sql: NeonSql,
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  b64: string,
): Promise<WorkerStoredImage> {
  const bytes = Buffer.from(b64, 'base64')
  if (purpose === 'avatar') {
    const blob = await putBlob(userId, purpose, bytes)
    return { ...blob, bytes: bytes.byteLength, contentHash: null, duplicateOf: null }
  }

  const contentHash = await contentHashOf(bytes)

  let duplicateOf: NinaImageDedupHit | null = null
  try {
    duplicateOf = await findContentDuplicate(sql, userId, contentHash)
  } catch (cause) {
    console.warn('[nina-worker] dedup lookup failed; storing anyway', {
      hash: contentHash.slice(0, 12),
      error: String(cause),
    })
  }
  if (duplicateOf != null) {
    console.info('[nina-worker] duplicate content; the put is skipped', {
      bytes: bytes.byteLength,
      hash: contentHash.slice(0, 12),
    })
    return {
      blobUrl: duplicateOf.blobUrl,
      pathname: duplicateOf.pathname,
      bytes: bytes.byteLength,
      contentHash,
      duplicateOf,
    }
  }

  const blob = await putBlob(userId, purpose, bytes)
  return { ...blob, bytes: bytes.byteLength, contentHash, duplicateOf: null }
}
```

**5e. The worker's release, placed directly after `store`:**

```ts
/**
 * The worker's own spelling of `releaseBlobIfUnreferenced` (`lib/nina/blobRelease.ts`), which
 * cannot be imported for the same reason everything else here is restated. The rule is the ONE
 * delete rule of the whole plan set: ROW FIRST, BLOB SECOND — the caller has already written the
 * row that replaced the reference, and this asks the same SIX columns across the same TWO tables
 * the app's `isBlobPathnameReferenced` asks (images pathname+url, avatars pathname+url,
 * thumbnails pathname+url) before `del`. Any fault keeps the object: a loser blob left for the
 * reaper is recoverable, a deleted object a row still points at is not.
 */
export async function releaseBlobIfUnreferenced(
  sql: NeonSql,
  userId: string,
  ref: { blobUrl: string; pathname: string },
  /** Test seam: `del` arrives through `createRequire`, which no `vi.mock` registry reaches. */
  delFn: (url: string) => Promise<unknown> = del,
): Promise<'deleted' | 'shared' | 'failed'> {
  try {
    const rows = (await sql`
      select id from (
        (select id from nina_message_images
          where user_id = ${userId}
            and (pathname = ${ref.pathname} or blob_url = ${ref.blobUrl}))
        union all
        (select id from nina_avatars
          where user_id = ${userId}
            and (pathname = ${ref.pathname} or blob_url = ${ref.blobUrl}
              or thumb_pathname = ${ref.pathname} or thumb_url = ${ref.blobUrl}))
      ) referenced
      limit 1
    `) as Array<{ id: string }>
    if (rows.length > 0) {
      console.info('[nina-worker] blob kept: another row still points at it')
      return 'shared'
    }
    await delFn(ref.blobUrl)
    return 'deleted'
  } catch (cause) {
    console.warn('[nina-worker] the loser blob could not be released; the reaper owns it now', {
      error: String(cause),
    })
    return 'failed'
  }
}
```

**5f. `finishSelfie` — the body from the session resolution through the terminal UPDATE and the
release, complete replacement** (the docstring above the function stands; append one paragraph:
*"media-dedupe P3: the image row is written from `planNinaImageWrite` — the same pure function the
app side calls — so a generation whose bytes this user already stores lands as a REFERENCE with no
second object; the race between the pre-put lookup and this insert is closed HERE, and the loser
blob is released only after the row that replaced it is in."*):

```ts
  const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
  if (sessionId == null) {
    throw new Error(`no session to file the photograph in (job ${jobId})`)
  }

  /* ── media-dedupe P3: THE RACE-CLOSE, ASKED A SECOND TIME AT THE INSERT ─────────────────────
   * `store` asked before its put; two hosts can both hear "no" and both put. The same lookup runs
   * again here, and a hit turns this write into a REFERENCE through `planNinaImageWrite` — with
   * the fresh loser bytes scheduled for release after the row is in. A lookup fault degrades to
   * "original", the same rule as the pre-put lookup: the photograph must never be lost to a
   * dedup read. */
  let racedDuplicate: NinaImageDedupHit | null = null
  if (image.duplicateOf == null && image.contentHash != null) {
    try {
      racedDuplicate = await findContentDuplicate(sql, userId, image.contentHash)
    } catch (cause) {
      console.warn('[nina-worker] dedup re-check failed; writing an original', {
        jobId,
        error: String(cause),
      })
    }
  }
  const writePlan = planNinaImageWrite({
    hit: image.duplicateOf ?? racedDuplicate,
    stored: { blobUrl: image.blobUrl, pathname: image.pathname, contentHash: image.contentHash },
  })
  if (writePlan.release != null) {
    console.info('[nina-worker] lost a dedup race; the row will reference the keeper', {
      jobId,
      bytes: image.bytes,
      hash: image.contentHash?.slice(0, 12) ?? null,
    })
  }

  /* `photo_only = true` marks the bubble as existing only to carry the picture — the same fact
   * `finishSelfie` and `addChatPhotoAction` record through `NinaMessageInsert.photoOnly`. Here it is
   * a column name in SQL and nothing more, because this file may not import `@/lib/db/schema`.
   *
   * THE CANNED CAPTION IS PERMANENT ON THIS HOST, and it is not an inconsistency to fix. This
   * worker runs on a GitHub runner with no z.ai key, and `lib/nina/imagefail.ts` — the one module it
   * imports, by relative path under `--experimental-strip-types` — states in its own header that it
   * may import nothing at all. Reaching for `@/lib/nina/caption` here would stop the worker booting,
   * and a caption that fails to be produced is the exact bug `imagefail.ts` exists to kill. What
   * makes the canned line acceptable is that its pool no longer asserts a scene: every member is
   * true of any photograph of her.
   *
   * DEPLOY ORDER: this INSERT names a column migration 0008 creates. Additive, and migrations run
   * before the deploy in the normal order — but a worker deployed against an un-migrated database
   * fails this statement, so the order is a requirement here and not an incidental. The same now
   * applies to `content_hash` (migration 0018, media-dedupe P1) — except that preflight's
   * `findSchemaDrift` runs the existence check FIRST, so an un-migrated database takes the
   * workflow red before a job is claimed, rather than dropping a photograph after the money was
   * spent. */
  await sql`
    insert into nina_messages
      (id, user_id, session_id, role, text, source, turn_id, reply_to_id, photo_only)
    values (
      ${messageId}, ${userId}, ${sessionId}, 'nina', ${ninaImageCaption(jobId)}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId}),
      true
    )
  `
  /* The plan's values, not `image`'s: a deduped row carries the KEEPER's object and the keeper's
   * id in `source_image_id`, so `isOriginalPhoto()` hides it from the collection while the bubble
   * still renders it. `description`/`prompt` stay THIS generation's — the same argument the app
   * side makes at its insert: the scene is a truthful description of these bytes, and the sidecar
   * is what ITS generation was told. */
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt,
       content_hash, source_image_id, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${writePlan.row.blobUrl},
      ${writePlan.row.pathname}, ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes},
      ${args.scene}, ${args.sidecar}, ${writePlan.row.contentHash}, ${writePlan.row.sourceImageId}, 0
    )
  `
  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0) + ${result.costMicroUsd}
    where id = ${jobId} and user_id = ${userId}
  `

  /* Loser bytes out, after the row that replaced them is in — ROW FIRST, BLOB SECOND. Reached
   * only on the race path: the skip path never put anything. If the INSERT above throws instead,
   * the loser blob stays behind and the reaper owns it — the same orphan class the existing
   * `finish:` failure branch already documents. */
  if (writePlan.release != null) {
    await releaseBlobIfUnreferenced(sql, userId, writePlan.release)
  }
```

**5g. `runOneJob` — two lines.** The declared type and the call:

```ts
  let image: WorkerStoredImage
  try {
    image = await store(sql, job.userId, job.args.purpose, outcome.b64)
```

**Impact:** The worker's behavior is now statement-for-statement equivalent to the app side. Its
preflight is STRICTER than before (six more named columns), which is the designed deploy-order
signal for migration 0018. Everything is importable and drivable by the test suite; only `putBlob`
and `del` touch the network, and neither is reached by the tests below.

### Step 6: `tests/nina.imageworker.test.ts` — the SQL shape, locked

**File:** `tests/nina.imageworker.test.ts`

**Change:** Four edits.

**6a. The fixture (:~301, phase 1 leaves it three-field).** Complete replacement — phase 1's two
dedup tests spread this object and keep working:

```ts
describe('finishSelfie — Finding 1', () => {
  const image = {
    blobUrl: 'https://blob/x.png',
    pathname: 'nina/u/selfie-x.png',
    bytes: 1234,
    contentHash: null as string | null,
    duplicateOf: null,
  }
  const result = { costMicroUsd: 40_000, latencyMs: 78_200 }
```

**6b. New tests, appended inside the `describe('finishSelfie — Finding 1')` block** (they follow
the file's stated rule — tokens and parameter values, never whitespace or clause order):

```ts
  it('media-dedupe P3: the INSERT names source_image_id and binds the plan row, not the raw image', async () => {
    // The skip path: `store` found the keeper and returned ITS object. The row must name the
    // keeper, and the statement must carry the column so the reference is impossible to forget.
    const keeper = {
      id: 'keeper000001',
      blobUrl: 'https://blob/keeper.png',
      pathname: 'nina/u/selfie-keeper.png',
    }
    const sql = sqlResolving(SESSION_ID)
    await finishSelfie(
      sql,
      jobFixture(),
      {
        blobUrl: keeper.blobUrl,
        pathname: keeper.pathname,
        bytes: 1234,
        contentHash: CONTENT_HASH,
        duplicateOf: keeper,
      },
      result,
    )

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.text).toMatch(/\bsource_image_id\b/)
    expect(insert?.values).toContain(keeper.id)
    expect(insert?.values).toContain(keeper.blobUrl)
    /* The hash rides the reference row too — invariant 4 is about the BYTES, which are the same. */
    expect(insert?.values).toContain(CONTENT_HASH)
    /* Nothing was put, so nothing is released: no release SELECT (keyed on `thumb_pathname` —
     * the only statement in the whole file that names it) and no `del`. */
    expect(sent(sql, /thumb_pathname/)).toHaveLength(0)
  })

  it('media-dedupe P3: a race at insert time writes the reference and then releases the loser', async () => {
    // The re-check SELECT answers with a keeper (the rows callback matches it by its shape), so
    // the fresh bytes must be referenced AND then checked before a `del`.
    const keeper = {
      id: 'keeper000001',
      blobUrl: 'https://blob/keeper.png',
      pathname: 'nina/u/selfie-keeper.png',
    }
    const sql = fakeSql({
      rows: (call) => {
        /* Order matters: `resolveWorkerSessionId`'s statement also contains `union all`, so the
         * reply lookup must be answered first. */
        if (/with reply as/.test(call.text)) return [{ id: SESSION_ID }]
        /* The dedup re-check is the only other statement naming content_hash in a WHERE. */
        if (/content_hash =/.test(call.text)) return [keeper]
        /* The release check asks both tables' six columns; nothing else references the loser. */
        return []
      },
    })
    await finishSelfie(
      sql,
      jobFixture(),
      {
        blobUrl: 'https://blob/fresh.png',
        pathname: 'nina/u/selfie-fresh.png',
        bytes: 1234,
        contentHash: CONTENT_HASH,
        duplicateOf: null,
      },
      result,
    )

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.values).toContain(keeper.id)
    expect(insert?.values).toContain(keeper.blobUrl)
    /* The release ran, and it asked BOTH tables' six columns before deleting — the worker cannot
     * release an object the app would have kept. Keyed on `thumb_pathname`: the only statement in
     * the file that names it. */
    const [release] = sent(sql, /thumb_pathname/)
    expect(release?.text).toMatch(/thumb_url/)
    expect(release?.text).toMatch(/user_id = \$\d+/)
  })

  it('media-dedupe P3: a dedup re-check fault degrades to an original, and the job still closes', async () => {
    const sql = fakeSql({
      failOn: /content_hash =/, // the re-check SELECT is the only statement that matches
      rows: (call) => (/with reply as/.test(call.text) ? [{ id: SESSION_ID }] : []),
    })
    await expect(
      finishSelfie(
        sql,
        jobFixture(),
        {
          blobUrl: 'https://blob/fresh.png',
          pathname: 'nina/u/selfie-fresh.png',
          bytes: 1234,
          contentHash: CONTENT_HASH,
          duplicateOf: null,
        },
        result,
      ),
    ).resolves.toBeUndefined()

    const [insert] = sent(sql, /insert into nina_message_images/)
    expect(insert?.values).toContain('https://blob/fresh.png')
    expect(insert?.values).toContain(null) // source_image_id
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
  })
```

**6c. Two new describes, appended at the end of the file:**

```ts
describe('findContentDuplicate — media-dedupe P3', () => {
  it('asks the owner-scoped, originals-only, newest-first question in one statement', async () => {
    const sql = sqlResolving(SESSION_ID)
    await findContentDuplicate(sql, 'user00000001', CONTENT_HASH)

    const [call] = sql.calls
    expect(call?.text).toMatch(/from nina_message_images/)
    expect(call?.text).toMatch(/user_id = \$\d+/)
    expect(call?.text).toMatch(/content_hash = \$\d+/)
    /* ORIGINALS ONLY: a reference must never satisfy a dedup lookup, or two references could
     * chain and the keeper's deletion would re-materialize both as originals. */
    expect(call?.text).toMatch(/source_avatar_id is null/)
    expect(call?.text).toMatch(/source_image_id is null/)
    /* Newest first, the collection reads' own tie-break. */
    expect(call?.text).toMatch(/order by created_at desc, id desc/)
    expect(call?.text).toMatch(/limit 1/)
  })

  it('answers null on a miss', async () => {
    const sql = sqlResolving(SESSION_ID)
    expect(await findContentDuplicate(sql, 'user00000001', CONTENT_HASH)).toBeNull()
  })

  it('maps the snake_case row onto the dedup shape', async () => {
    const sql = fakeSql({
      rows: (call) =>
        /content_hash =/.test(call.text)
          ? [{ id: 'keeper000001', blob_url: 'https://blob/k.png', pathname: 'nina/u/selfie-k.png' }]
          : [],
    })
    expect(await findContentDuplicate(sql, 'user00000001', CONTENT_HASH)).toEqual({
      id: 'keeper000001',
      blobUrl: 'https://blob/k.png',
      pathname: 'nina/u/selfie-k.png',
    })
  })
})

describe('releaseBlobIfUnreferenced — media-dedupe P3', () => {
  const ref = { blobUrl: 'https://blob/loser.png', pathname: 'nina/u/selfie-loser.png' }

  it('deletes only when no row in either table answers', async () => {
    const sql = sqlResolving(SESSION_ID)
    sql.calls.length = 0
    const delFn = vi.fn(async () => undefined)
    expect(await releaseBlobIfUnreferenced(sql, 'user00000001', ref, delFn)).toBe('deleted')
    expect(delFn).toHaveBeenCalledWith(ref.blobUrl)
  })

  it('keeps the object when another row still points at it, and never calls del', async () => {
    const sql = fakeSql({
      rows: (call) => (/union all/.test(call.text) ? [{ id: 'other0000001' }] : []),
    })
    const delFn = vi.fn(async () => undefined)
    expect(await releaseBlobIfUnreferenced(sql, 'user00000001', ref, delFn)).toBe('shared')
    expect(delFn).not.toHaveBeenCalled()
  })

  it('errs toward keep on any fault — an orphan is recoverable, a dead reference is not', async () => {
    const sql = fakeSql({ failOn: /union all/ })
    const delFn = vi.fn(async () => undefined)
    expect(await releaseBlobIfUnreferenced(sql, 'user00000001', ref, delFn)).toBe('failed')
    expect(delFn).not.toHaveBeenCalled()
  })
})
```

**6d. Import and constant updates (top of the file).** The import block gains
`findContentDuplicate` and `releaseBlobIfUnreferenced`; the REQUIRED_COLUMNS shape test:

```ts
import {
  claimJob,
  closeFailed,
  dispatchCutoffFor,
  findContentDuplicate,
  findSchemaDrift,
  finishSelfie,
  generate,
  parseArgv,
  releaseBlobIfUnreferenced,
  REQUIRED_COLUMNS,
  resolveWorkerSessionId,
} from '../scripts/nina-image-worker.ts'
```

```ts
describe('REQUIRED_COLUMNS — media-dedupe P3 names what it queries', () => {
  it('lists the dedup columns on both tables the worker now reads', () => {
    // The file's own rule: every column a statement names must be listed, or a rename survives
    // silently. `findContentDuplicate` and `releaseBlobIfUnreferenced` each named new ones.
    const images = REQUIRED_COLUMNS.nina_message_images.columns
    for (const column of ['content_hash', 'source_avatar_id', 'source_image_id', 'created_at']) {
      expect(images, column).toContain(column)
    }
    const avatars = REQUIRED_COLUMNS.nina_avatars.columns
    for (const column of ['thumb_pathname', 'thumb_url']) {
      expect(avatars, column).toContain(column)
    }
  })
})
```

**Impact:** Phase 1's two `content_hash` tests keep passing — the fixture now carries
`contentHash`/`duplicateOf`, the 'binds the hash the caller supplies' test spreads the fixture and
still lands `CONTENT_HASH` in the values. The `'still writes the image row and marks the job ok'`
assertion holds: still exactly one image INSERT.

### Step 7: `lib/admin/chatPhotos.ts` — the admin plan decision

**File:** `lib/admin/chatPhotos.ts`

**Change:** One import addition and one appended block. The import goes with the existing
`@/lib/nina/...` group (:1-4):

```ts
import { NINA_IMAGE_CAPTIONS } from '@/lib/nina/imagefail'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import { ninaPhotoProvenance } from '@/lib/nina/attach'
```

(If the project's import-order formatter disagrees with that placement, let it settle the order —
the contract is only that the module stays client-safe, which `attach.ts` is.)

Appended at the end of the file:

```ts
/* ── media-dedupe P3: the add-path dedup decision ──────────────────────────────────────────── */

/**
 * The row a duplicate claim is answered from, narrowed to what the decision reads. A
 * `NinaImageRow` satisfies it; the projection is named here so this pure module states its inputs
 * instead of importing the query module's row shape.
 */
export interface ChatPhotoKeeper {
  id: string
  blobUrl: string
  pathname: string
  description: string | null
  sourceAvatarId: string | null
  sourceImageId: string | null
}

/** What `addChatPhotoAction` writes, and what it releases afterwards. */
export interface ChatPhotoAddPlan {
  blobUrl: string
  pathname: string
  /** F37's pair: non-null on either makes the row a REFERENCE the collection reads skip. */
  sourceAvatarId: string | null
  sourceImageId: string | null
  /** The client's validated hash claim — NULL when there was none or it failed validation. */
  contentHash: string | null
  /** Copied from the keeper on a duplicate (`resolveAttachment`'s precedent); NULL on an original. */
  description: string | null
  /** The fresh object to release AFTER the row lands (ROW FIRST, BLOB SECOND), or null. */
  release: { blobUrl: string; pathname: string } | null
}

/**
 * **The add path's dedup decision, as a pure function.** Three answers, and the two duplicate
 * answers differ only in HOW the keeper was found — which is why the function takes both and
 * picks:
 *
 *   · `pinned` — the row the browser's pre-check found and NAMED (`duplicateOfId`). Read
 *     owner-scoped at action time by `getNinaMessageImage`, which does NOT filter references, so a
 *     row the sweep or the runner path merged into a keeper mid-flight is flattened to its own
 *     original by `ninaPhotoProvenance` — the ONE writer of these two columns — and the write
 *     stays correct without this module re-deriving provenance.
 *   · `hit` — the row the hash lookup found at action time (the race: the client DID put fresh
 *     bytes and a concurrent original claimed them first). The finder is originals-only, so this
 *     keeper is always flat.
 *   · neither — today's original, plus the hash claim.
 *
 * ── WHY THE DESCRIPTION IS COPIED ────────────────────────────────────────────────────────────
 * `resolveAttachment`'s precedent, verbatim in its reasons: the vision prose for these EXACT bytes
 * already exists on the keeper, `description` is the only text of the row that reaches Nina's
 * prompt, and a second `glm-4.6v` call over identical pixels is a second bill for a fact already
 * in hand. Copying it also makes the caption pass cheap on purpose: with `description` non-null,
 * `scheduleChatPhotoCaption`'s HALF ONE skips the eyes and HALF TWO captions the new bubble from
 * the copied prose — which is what the operator asked for (a photograph IN a conversation), not a
 * second description of it.
 *
 * ── WHY THE RELEASE IS COMPARING PATHNAMES ───────────────────────────────────────────────────
 * The pre-check skip path never PUT anything, so its payload ECHOES the keeper's pathname — same
 * string, nothing to release. The race path PUT a fresh object whose pathname cannot equal the
 * keeper's (`addRandomSuffix: true`), so THAT object is the loser and it is released after the
 * reference row is in. The comparison is what keeps one function honest about both.
 */
export function planChatPhotoAddWrite(input: {
  claims: { blobUrl: string; pathname: string; contentHash: string | null }
  pinned: ChatPhotoKeeper | null
  hit: ChatPhotoKeeper | null
}): ChatPhotoAddPlan {
  const keeper = input.pinned ?? input.hit

  if (keeper == null) {
    return {
      blobUrl: input.claims.blobUrl,
      pathname: input.claims.pathname,
      sourceAvatarId: null,
      sourceImageId: null,
      contentHash: input.claims.contentHash,
      description: null,
      release: null,
    }
  }

  const provenance = ninaPhotoProvenance({
    kind: 'image',
    id: keeper.id,
    sourceAvatarId: keeper.sourceAvatarId,
    sourceImageId: keeper.sourceImageId,
  })

  return {
    blobUrl: keeper.blobUrl,
    pathname: keeper.pathname,
    sourceAvatarId: provenance.sourceAvatarId,
    sourceImageId: provenance.sourceImageId,
    contentHash: input.claims.contentHash,
    description: keeper.description,
    release:
      input.claims.pathname === keeper.pathname
        ? null
        : { blobUrl: input.claims.blobUrl, pathname: input.claims.pathname },
  }
}
```

### Step 8: `lib/admin/chatPhotoSchema.ts` — the two claim fields

**File:** `lib/admin/chatPhotoSchema.ts`

**Change:** One new shape constant and two schema edits. Complete replacements:

```ts
/**
 * media-dedupe P3. The client's sha-256 claim over the exact bytes it PUT — or, on a skipped
 * upload, over the bytes it tried to. SHAPE only, deliberately: the FORMAT is validated in the
 * action with `isValidContentHash`, because invariant 9 makes a malformed hash a NULL and a
 * proceed, never a refused add. A regex here would be an error where the plan demands silence.
 */
const chatPhotoContentHash = z.string().min(1).max(128)

/** "Put a new photograph in the collection." Mints the message + image pair. */
export const chatPhotoAddSchema = z
  .object({
    ...uploadedBlob,
    contentHash: chatPhotoContentHash.optional(),
    /**
     * The row the browser's pre-check found, when the upload was SKIPPED. An id, so it gets the
     * shape check every id in this file gets; existence and ownership are the action's job, as
     * the header above says.
     */
    duplicateOfId: chatPhotoId.optional(),
  })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })

/** "Swap the bytes behind this row." The row id plus the same claims, plus the new bytes' hash. */
export const chatPhotoReplaceSchema = z
  .object({
    id: chatPhotoId,
    ...uploadedBlob,
    contentHash: chatPhotoContentHash.optional(),
  })
  .refine((value) => blobUrlMatchesPathname(value.blobUrl, value.pathname), {
    message: BLOB_MISMATCH,
    path: ['blobUrl'],
  })
```

**Impact:** `Zod` objects strip unknown keys, so WITHOUT this edit the new claims would be
silently dropped on the way into the action and the dedup would never fire — this file is the
reason the fields exist at all. `ChatPhotoAdd.tsx` passes the whole `UploadedChatPhoto` object
through unchanged, and both new fields are optional, so old payloads still parse.

### Step 9: `lib/nina/queries.ts` — Replace must keep the column honest

**File:** `lib/nina/queries.ts` — `NinaChatPhotoBlobPatch` (~:1926) and `updateNinaChatPhotoBlob`'s
`.set()` (~:1964-2000; the anchor line `sourceImageId: null,` sits at ~:1988). **This is the one
edit in a file phase 1 also edits; the hunks are far apart and neither touches the other's lines —
phase 1's edits are all below :1800 except `imageColumns` (:603), none inside this function, so
these quotes are valid in the post-phase-1 tree unchanged.**

**Change:** The patch type and the `.set()` gain the hash. Complete replacements:

```ts
export interface NinaChatPhotoBlobPatch {
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
  /**
   * media-dedupe P3. The sha-256 claim over the NEW bytes, or NULL. Optional so existing callers
   * compile; the `.set()` below coalesces to NULL, because a Replace that left the OLD hash on
   * the NEW bytes would be the one lie the dedup lookup cannot survive: `findNinaImageByContentHash`
   * would keep answering for bytes this row no longer stores (invariant 4's one semantics —
   * identical hash ⟺ identical bytes in the store). A replaced row is un-hashed until something
   * hashes its new bytes again; NULL is the honest value, the same meaning it has everywhere.
   */
  contentHash?: string | null
}
```

and inside `updateNinaChatPhotoBlob`'s `.set({ … })`, one line after `sourceImageId: null,`:

```ts
      /*
       * media-dedupe P3. Same statement as the nulls above it, for the same reason: there must be
       * no window in which the row points at new bytes and claims old ones. A valid claim from
       * the caller sticks; its absence retracts. See `NinaChatPhotoBlobPatch.contentHash`.
       */
      contentHash: patch.contentHash ?? null,
```

**Impact:** `tests/nina.photoRefs.test.ts`'s Replace case asserts named columns are PRESENT in the
SET clause and that there is ONE statement — both still true. One added case locks the new
column (Step 15).

### Step 10: `lib/admin/chatPhotoActions.ts` — the action half

**File:** `lib/admin/chatPhotoActions.ts`

**Change:** Four edits.

**10a. Imports (:1-41).** Complete replacement of the import block:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import {
  chatPhotoAddSchema,
  chatPhotoDescriptionSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
import {
  ADMIN_CHAT_PHOTOS_PATH,
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  isAdminChatPhotoPathname,
  isNinaPhotoCarrierMessage,
  planChatPhotoAddWrite,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { isValidId } from '@/lib/id'
import { captionNinaPhoto } from '@/lib/nina/caption'
import { releaseBlobIfUnreferenced } from '@/lib/nina/blobRelease'
import { ninaImageCaption } from '@/lib/nina/imagefail'
import {
  deleteNinaMessage,
  deleteNinaMessageImage,
  findNinaImageByContentHash,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  insertNinaMessageImages,
  insertNinaMessages,
  readNinaTuning,
  setNinaMessageImageDescription,
  updateNinaChatPhotoBlob,
  updateNinaChatPhotoDescription,
  updateNinaMessage,
  type NinaImageRow,
  type NinaMessageRow,
} from '@/lib/nina/queries'
import { resolveNinaWriteSession } from '@/lib/nina/sessionResolve'
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'
import { isValidContentHash } from '@/lib/photos/contentHash'
```

**10b. `replaceChatPhotoAction` (:136-191) — two edited regions inside the unchanged function.**
The destructuring gains the claim, and the patch carries it:

```ts
  const { id, blobUrl, pathname, width, height, bytes, contentHash } = parsed.data
```

```ts
  const updated = await updateNinaChatPhotoBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
    /* media-dedupe P3, invariant 4. A byte swap MUST move the hash with it: the same trust class
     * as every other claim this action accepts (the bytes themselves are a claim). No claim or a
     * malformed one retracts the column to NULL — dedup goes quiet for this row, which is the
     * honest answer for bytes nothing has hashed yet. */
    contentHash: isValidContentHash(contentHash) ? contentHash : null,
  })
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }
```

**10c. `addChatPhotoAction` (:227-295) — complete replacement** (docstring included; the four
NULL-value arguments from the old docstring are unchanged and stand):

```ts
/**
 * *"add a new photo (so it is like nina generated them, but actually it is manually added by
 * user)"* — a literal specification of the storage shape, and this writes exactly the pair
 * `finishSelfie` writes (`scripts/nina-image-worker.ts:427`).
 *
 * `message_id` is NULLABLE since R1, so a floating chat photo is now representable — but ADD does
 * not make one, and that is a decision rather than a leftover. NULL is the residue of a delete: the
 * conversation that held the photograph is gone. A photograph the operator adds on purpose has
 * never been in a conversation, and putting it straight into the orphan state would make it
 * invisible in the chat forever with no way back. So "add a photo" is still "add a message with a
 * photo on it", `NinaImageInsert.messageId` is still required, and no third shape is invented.
 *
 * ── media-dedupe P3: "ALREADY IN THE COLLECTION" IS A REFERENCE, NOT A SECOND OBJECT ──────────
 * The browser hashes the encoded JPEG and asks `findChatPhotoDuplicateAction` BEFORE it PUTs; on a
 * hit it skips the upload and sends the keeper's object back with `duplicateOfId` pinning the row.
 * This action never trusts that echo — it re-reads the pinned row owner-scoped and writes the add
 * as a REFERENCE through `planChatPhotoAddWrite` (`lib/admin/chatPhotos.ts`, which owns the
 * decision and its arguments). The race — the client DID put fresh bytes and a concurrent original
 * claimed them — lands on the same plan from the hash lookup, and the loser object is released
 * after the row is in (ROW FIRST, BLOB SECOND, invariant 3). The failure unwind below releases
 * `plan.release`, and `plan.release` is NULL exactly when nothing fresh was ever uploaded — which
 * is what keeps the skip path from ever tripping the unwind's blob release on an object it did not
 * create.
 *
 * The pinned row is refused outright when it has vanished between the pre-check and this action
 * ("pick it again"): its object may have been released with it, and writing a row onto a dead URL
 * is the one outcome worse than asking twice. The refusal is a sentence, in the shape of every
 * other refusal in this file.
 *
 * ── THE FOUR VALUES THAT HAVE NO JOB TO TAKE THEM FROM ──────────────────────────────────────
 *   · `text` — `ninaImageCaption(newId())`. The SAME function, seeded with a fresh nanoid(12)
 *     instead of a job id. `pickLine` is a pure FNV-1a over its key and a job id is itself a
 *     nanoid(12), so the distribution is identical and the result is always one of the five strings
 *     in `NINA_IMAGE_CAPTIONS` — which is also what makes `isNinaPhotoCarrierMessage` recognise
 *     this message later. Her words keep exactly one definition in the repo.
 *   · `turnId` — NULL. `nina_turns` holds no message text and asserts that a model call happened
 *     and what it cost; none did and nothing was paid. Nothing renders the column
 *     (`lib/db/schema.ts:799`).
 *   · `replyToId` — NULL. The worker's subselect resolves *the runner message that asked*; nobody
 *     asked. `resolveQuote` degrades a null to a plain message by design.
 *   · `sessionId` — `resolveNinaWriteSession`. `nina_messages.session_id` is `NOT NULL` with an FK,
 *     `insertNinaMessages` takes it as a required third argument, and `lib/nina/sessionResolve.ts`
 *     holds assumption A3's ONE policy for a writer with nobody looking. It creates a session when
 *     he has none, so this works on a fresh account.
 *
 * `prompt` is NULL because there was no generation, and it has no reader anywhere in the repo.
 * `description` is the keeper's prose on a duplicate (see `planChatPhotoAddWrite`) and NULL at
 * insert on a fresh original, earned below — a hand-uploaded photograph has no generation prompt
 * and `glm-4.6v` is the only thing that can say what is in it.
 */
export async function addChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoAddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { blobUrl, pathname, width, height, bytes, contentHash, duplicateOfId } = parsed.data

  /* ── THE CLAIMS, NORMALIZED ─────────────────────────────────────────────────────────────────
   * Invariant 9, twice. A malformed hash is a NULL and a proceed — dedup goes quiet for this add,
   * the upload is not refused. A malformed `duplicateOfId` cannot name a row, so the schema's id
   * shape check already refused it. */
  const claimedHash = isValidContentHash(contentHash) ? contentHash : null
  const pinnedId = isValidId(duplicateOfId) ? duplicateOfId : null

  let pinned: NinaImageRow | null = null
  if (pinnedId != null) {
    /* The pre-check's echo is a CLAIM; this read is the fact. Owner-scoped, and deliberately NOT
     * filtered to originals — a keeper the sweep merged mid-flight is flattened by the plan. */
    pinned = await getNinaMessageImage(userId, pinnedId)
    if (pinned == null) {
      return {
        ok: false,
        error:
          'That photo was already in the collection and has since been removed — pick it again.',
      }
    }
  } else if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  /* The race door: only reached when nothing was pinned, because a pinned row IS the answer. */
  const hit =
    pinned == null && claimedHash != null
      ? await findNinaImageByContentHash(userId, claimedHash)
      : null

  const plan = planChatPhotoAddWrite({
    claims: { blobUrl, pathname, contentHash: claimedHash },
    pinned,
    hit,
  })

  const sessionId = await resolveNinaWriteSession(userId)

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        body: ninaImageCaption(newId()),
        source: 'chat',
        turnId: null,
        replyToId: null,
        runId: null,
        /* This bubble is the photograph and nothing else. Remove deletes it with the last picture
         * on it, and from this row forward that no longer depends on what its text says. */
        photoOnly: true,
      },
    ],
    sessionId,
  )
  if (message == null) {
    return { ok: false, error: 'Could not open a place in the conversation for it.' }
  }

  const [image] = await insertNinaMessageImages(userId, [
    {
      messageId: message.id,
      kind: 'generated',
      blobUrl: plan.blobUrl,
      pathname: plan.pathname,
      width,
      height,
      bytes,
      description: plan.description,
      prompt: null,
      sourceAvatarId: plan.sourceAvatarId,
      sourceImageId: plan.sourceImageId,
      contentHash: plan.contentHash,
      sortOrder: 0,
    },
  ])

  /*
   * `[]` IS NOT SUCCESS. `insertNinaMessageImages` validates the message FK by hand and returns an
   * empty array on a mismatch rather than throwing. Leaving it there would put a caption bubble with
   * no picture in the runner's chat forever — the exact defect `removeChatPhotoAction` exists to
   * prevent — so the message is undone and the object we just uploaded is released with it. The
   * release goes through the same helper as everything else — and through `plan.release`, so a
   * skipped upload (whose payload names the KEEPER's object) releases NOTHING: there is no object
   * of ours in the store to release, and the keeper's object is still referenced by its own row.
   */
  if (image == null) {
    await deleteNinaMessage(userId, message.id)
    if (plan.release != null) await releaseBlobIfUnreferenced(userId, plan.release)
    return { ok: false, error: 'The photo could not be attached to a message.' }
  }

  /* ROW FIRST, BLOB SECOND: the reference row is in before the loser object is asked about. Only
   * the race path has a loser at all. */
  if (plan.release != null) {
    const outcome = await releaseBlobIfUnreferenced(userId, plan.release)
    if (outcome !== 'deleted') {
      console.warn('[admin] duplicate add kept the fresh object', { outcome })
    }
  }

  scheduleChatPhotoCaption(userId, image.id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id: image.id }
}
```

**10d. `findChatPhotoDuplicateAction`, placed after the ADD section (before the REMOVE
banner):**

```ts
/* ── the pre-check (media-dedupe P3) ───────────────────────────────────────────────────────── */

/**
 * **"Does the collection already hold these bytes?"** — the question `uploadChatPhoto` asks BEFORE
 * it PUTs, so re-picking a photograph costs one indexed lookup instead of a second Blob object.
 * The measured defect this closes: the arrival card existed as two objects
 * (`sbTuT8NKXL24` + `ywNnXvpnnKSi`) because no layer compared content and `addRandomSuffix: true`
 * guaranteed two objects for identical bytes.
 *
 * Owner-scoped twice over: `requireAdmin()` binds the session, and
 * `findNinaImageByContentHash` carries `user_id` in its WHERE — the client is told only about rows
 * it already owns. Invariant 9 in one guard: a malformed hash is `null`, never an error, and the
 * caller proceeds to a normal upload and loses nothing but the round trip it was trying to save.
 *
 * The answer names the ORIGINAL only (the finder filters references), so the caller's skip path
 * pins a keeper that is flat and `addChatPhotoAction`'s own re-read does the rest.
 */
export async function findChatPhotoDuplicateAction(
  contentHash: string,
): Promise<{ id: string; blobUrl: string; pathname: string } | null> {
  const { userId } = await requireAdmin()
  if (!isValidContentHash(contentHash)) return null

  const row = await findNinaImageByContentHash(userId, contentHash)
  if (row == null) return null
  return { id: row.id, blobUrl: row.blobUrl, pathname: row.pathname }
}
```

**Impact:** `addChatPhotoAction`'s existing callers pass `UploadedChatPhoto` objects straight
through; the two new fields ride the schema added in Step 8. The failure-unwind behavior is
byte-for-byte today's on the fresh path (`plan.release` there IS `{ blobUrl, pathname }`).

### Step 11: `components/admin/chatPhotoUpload.ts` — hash, pre-check, skip

**File:** `components/admin/chatPhotoUpload.ts` — complete replacement of the import block, the
`UploadedChatPhoto` interface, and `uploadChatPhoto` (`encodeChatPhotoJpeg` and the two exported
constants are UNCHANGED):

```ts
'use client'

import { upload } from '@vercel/blob/client'

import { findChatPhotoDuplicateAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_CONTENT_TYPE, adminChatPhotoPathname } from '@/lib/admin/chatPhotos'
import { contentHashOf } from '@/lib/photos/contentHash'
import { newId } from '@/lib/id'
```

```ts
export interface UploadedChatPhoto {
  blobUrl: string
  pathname: string
  width: number
  height: number
  bytes: number
  /**
   * media-dedupe P3. sha-256 hex over the exact bytes this object holds — the bytes that were (or
   * would have been) PUT. A claim, in the same class as `width` and `bytes`: the action
   * format-validates it and the shared insert NULLs an invalid one (invariant 9).
   */
  contentHash: string
  /**
   * Non-null: an original row already holds these bytes, the PUT was SKIPPED, and `blobUrl` /
   * `pathname` are that row's (the dimensions and byte count are still this encode's — identical
   * bytes measure identically). `addChatPhotoAction` turns the add into a reference to this row.
   */
  duplicateOfId: string | null
}
```

```ts
/**
 * Encode, then PUT straight to Blob through the admin handshake — unless the collection already
 * holds these bytes, in which case the PUT is SKIPPED and the claims describe the row that does
 * hold them.
 *
 * `adminChatPhotoPathname` is what the client may ASK for; Blob rewrites it with a random suffix and
 * the STORED pathname is whatever `upload` returned — 43 symbols in the id segment, not 12 — which is
 * why `lib/admin/chatPhotos.ts` carries a SECOND pattern, `ADMIN_CHAT_PHOTO_STORED_ID_RE`, and why
 * the actions re-validate the returned pathname rather than the requested one.
 *
 * `handleUploadUrl` is the ADMIN route and not `/api/upload`: that route mints tokens for a
 * merely-signed-in session and knows nothing about this pathname shape.
 *
 * ── media-dedupe P3: THE HASH IS OVER THE ENCODED BLOB, BEFORE THE PUT ───────────────────────
 * `encoded.blob` is the exact body of the PUT, so it is what gets hashed — invariant 4's "bytes
 * persis yang di-PUT". The re-encode is NOT deterministic across browsers and sessions, and that
 * is fine: identical hash still means identical stored bytes, which is the only claim the column
 * makes. The pre-check is one owner-scoped server action round trip; on a hit it saves the PUT, a
 * second Blob object, and the duplicate row that would have hidden the keeper from nothing.
 *
 * ── WHY DEDUPE IS OPT-IN, AND WHY REPLACE MUST NEVER PASS IT ─────────────────────────────────
 * `opts.dedupe` defaults to OFF so every existing caller keeps today's behavior, and
 * `ChatPhotoAdd` is the only caller that turns it on. Replace must NOT: its contract is "swap the
 * bytes behind THIS row", and a deduped replace would point the row at another row's object and
 * strip its provenance to a reference — which the collection reads then hide, making the
 * photograph the operator can see vanish from `/admin/photos`. Replace gets the hash for free
 * (it claims it through `chatPhotoReplaceSchema`) but never the skip.
 */
export async function uploadChatPhoto(
  userId: string,
  file: File,
  opts: { dedupe?: boolean } = {},
): Promise<UploadedChatPhoto> {
  const encoded = await encodeChatPhotoJpeg(file)
  const contentHash = await contentHashOf(encoded.blob)

  if (opts.dedupe === true) {
    const duplicate = await findChatPhotoDuplicateAction(contentHash)
    if (duplicate != null) {
      return {
        blobUrl: duplicate.blobUrl,
        pathname: duplicate.pathname,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.blob.size,
        contentHash,
        duplicateOfId: duplicate.id,
      }
    }
  }

  const result = await upload(adminChatPhotoPathname(userId, newId()), encoded.blob, {
    access: 'public',
    contentType: ADMIN_CHAT_PHOTO_CONTENT_TYPE,
    handleUploadUrl: '/api/admin/nina/upload',
    clientPayload: JSON.stringify({ contentType: ADMIN_CHAT_PHOTO_CONTENT_TYPE }),
  })
  return {
    blobUrl: result.url,
    pathname: result.pathname,
    width: encoded.width,
    height: encoded.height,
    bytes: encoded.blob.size,
    contentHash,
    duplicateOfId: null,
  }
}
```

### Step 12: `components/admin/ChatPhotoAdd.tsx` — one line

**File:** `components/admin/ChatPhotoAdd.tsx:57`

**Change:**

```ts
        const uploaded = await uploadChatPhoto(userId, file, { dedupe: true })
```

**Impact:** The Add loop needs no other change — the `UploadedChatPhoto` shape is a superset of
what it already forwarded, and a deduped add is an ordinary successful `addChatPhotoAction` (its
row is a reference, so the grid shows no new card; the photograph already has a card). Surfacing a
"was already in the collection" sentence on the grid is a UI nicety deliberately left out of this
phase (see Handoffs).

### Step 13: `tests/admin.chatPhotos.test.ts` — the action-level dedup

**File:** `tests/admin.chatPhotos.test.ts`

**Change:** Three edits.

**13a. Mocks (:~382-421).** Add the finder next to the other query fns and into the factory
(the factory is exhaustive — a missing export is `undefined` at call time, not a type error):

```ts
const findNinaImageByContentHash = vi.fn()
```

```ts
vi.mock('@/lib/nina/queries', () => ({
  deleteNinaMessage: vi.fn(),
  deleteNinaMessageImage: vi.fn(),
  findNinaImageByContentHash: (...args: unknown[]) => findNinaImageByContentHash(...args),
  getNinaMessageImage: (...args: unknown[]) => getNinaMessageImage(...args),
  getNinaMessageImagesForMessages: vi.fn(),
  getNinaMessagesByIds: vi.fn(),
  insertNinaMessageImages: (...args: unknown[]) => insertNinaMessageImages(...args),
  insertNinaMessages: (...args: unknown[]) => insertNinaMessages(...args),
  isBlobPathnameReferenced: vi.fn(),
  readNinaTuning: (...args: unknown[]) => readNinaTuning(...args),
  setNinaMessageImageDescription: (...args: unknown[]) => setNinaMessageImageDescription(...args),
  updateNinaChatPhotoBlob: (...args: unknown[]) => updateNinaChatPhotoBlob(...args),
  updateNinaChatPhotoDescription: (...args: unknown[]) => updateNinaChatPhotoDescription(...args),
  updateNinaMessage: (...args: unknown[]) => updateNinaMessage(...args),
}))
```

(The rest of the file's `vi.mock` blocks — `next/server`, `next/cache`, `@vercel/blob`,
`requireAdmin`, `sessionResolve`, `vision`, `caption` — are untouched.)

**13b. `beforeEach`:** add `findNinaImageByContentHash.mockResolvedValue(null)` alongside the
other defaults.

**13c. New describe, appended after the `replaceChatPhotoAction schedules the same captioner`
block:**

```ts
describe('addChatPhotoAction write-time dedup (media-dedupe P3)', () => {
  const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  /** A RUNNER-upload pathname — valid for the store, INVALID for the admin predicate. */
  const keeperUploadPathname = `nina/${USER}/chat/${ID}-${BLOB_SUFFIX}.jpg`
  const KEEPER = {
    id: 'keep123XYZ_9',
    messageId: null,
    kind: 'generated' as const,
    blobUrl: `${STORE}/nina/${USER}/selfie-${ID}-${BLOB_SUFFIX}.jpg`,
    pathname: `nina/${USER}/selfie-${ID}-${BLOB_SUFFIX}.jpg`,
    width: 768,
    height: 1024,
    bytes: 240_000,
    description: 'Keeper prose, already paid for.',
    prompt: null,
    sourceAvatarId: null,
    sourceImageId: null,
    contentHash: HASH,
    sortOrder: 0,
    createdAt: new Date(0),
  }

  it('writes the add as a REFERENCE to the keeper and copies its description', async () => {
    // The race path: the client PUT fresh bytes (goodBlob's pathname passes the admin predicate)
    // and the hash lookup found the keeper at action time.
    findNinaImageByContentHash.mockResolvedValue(KEEPER)

    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(insertNinaMessageImages).toHaveBeenCalledWith(
      USER,
      [
        expect.objectContaining({
          blobUrl: KEEPER.blobUrl,
          pathname: KEEPER.pathname,
          sourceImageId: KEEPER.id,
          sourceAvatarId: null,
          contentHash: HASH,
          description: KEEPER.description,
        }),
      ],
    )
  })

  it('releases the fresh loser bytes after the reference row is in (row first, blob second)', async () => {
    findNinaImageByContentHash.mockResolvedValue(KEEPER)
    const { releaseBlobIfUnreferenced } = await import('@/lib/nina/blobRelease')

    await actions.addChatPhotoAction({ ...goodBlob, contentHash: HASH })

    expect(releaseBlobIfUnreferenced).toHaveBeenCalledWith(USER, {
      blobUrl: goodBlob.blobUrl,
      pathname: goodBlob.pathname,
    })
  })

  it('the skip path pins the row, skips the admin pathname guard, and releases NOTHING', async () => {
    // The pre-check path: the client never PUT, so the payload echoes the keeper's object — a
    // RUNNER-upload pathname here, which the admin predicate would refuse. The pin is why the
    // guard is skipped, and the echo is why nothing may be released.
    const { releaseBlobIfUnreferenced } = await import('@/lib/nina/blobRelease')
    getNinaMessageImage.mockResolvedValue({
      ...KEEPER,
      pathname: keeperUploadPathname,
      blobUrl: `${STORE}/${keeperUploadPathname}`,
    })

    const result = await actions.addChatPhotoAction({
      blobUrl: `${STORE}/${keeperUploadPathname}`,
      pathname: keeperUploadPathname,
      width: 768,
      height: 1024,
      bytes: 240_000,
      contentHash: HASH,
      duplicateOfId: KEEPER.id,
    })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(releaseBlobIfUnreferenced).not.toHaveBeenCalled()
    expect(insertNinaMessageImages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ pathname: keeperUploadPathname, sourceImageId: KEEPER.id })],
    )
  })

  it('a pinned row that vanished between pre-check and action is a refusal, not a dead row', async () => {
    getNinaMessageImage.mockResolvedValue(null)

    const result = await actions.addChatPhotoAction({
      ...goodBlob,
      contentHash: HASH,
      duplicateOfId: KEEPER.id,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/pick it again/)
    expect(insertNinaMessages).not.toHaveBeenCalled()
  })

  it('a pinned row that is itself a reference flattens to its original', async () => {
    getNinaMessageImage.mockResolvedValue({
      ...KEEPER,
      sourceImageId: 'origin12XYZ_',
    })

    await actions.addChatPhotoAction({
      ...goodBlob,
      contentHash: HASH,
      duplicateOfId: KEEPER.id,
    })

    expect(insertNinaMessageImages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ sourceImageId: 'origin12XYZ_' })],
    )
  })

  it('a malformed hash claim is a NULL and a normal add, never an error (invariant 9)', async () => {
    const result = await actions.addChatPhotoAction({ ...goodBlob, contentHash: 'not-a-hash' })

    expect(result).toEqual({ ok: true, id: IMAGE_ID })
    expect(findNinaImageByContentHash).not.toHaveBeenCalled()
    expect(insertNinaMessageImages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ contentHash: null, sourceImageId: null })],
    )
  })
})
```

**Impact:** The existing `scheduleChatPhotoCaption (through addChatPhotoAction)` cases pass
`goodBlob` with no hash claims — the plan falls through to today's original, and the caption
scheduling assertions are untouched.

### Step 14: `tests/admin.chatPhotoDedupe.test.ts` (NEW) — the plan function

**File:** `tests/admin.chatPhotoDedupe.test.ts` (new file)

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { planChatPhotoAddWrite } from '@/lib/admin/chatPhotos'

/**
 * **The add path's dedup decision, pinned.** Pure — no database, no store, no mocks. The three
 * answers (original / race reference / pinned reference) and the two invariants the action
 * depends on the function for: the skip path releases NOTHING, and a merged keeper is flattened.
 */

const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

const CLAIMS = {
  blobUrl: 'https://store.test/nina/u1/selfie-AbCdEf123456-suffixsuffixsuffix.jpg',
  pathname: 'nina/u1/selfie-AbCdEf123456-suffixsuffixsuffix.jpg',
  contentHash: HASH as string | null,
}

const FLAT_KEEPER = {
  id: 'keep123XYZ_9',
  blobUrl: 'https://store.test/nina/u1/selfie-keeper000000.jpg',
  pathname: 'nina/u1/selfie-keeper000000.jpg',
  description: 'Keeper prose, already paid for.',
  sourceAvatarId: null,
  sourceImageId: null,
}

describe('planChatPhotoAddWrite', () => {
  it('writes an original with the hash claim when nothing shares the bytes', () => {
    expect(planChatPhotoAddWrite({ claims: CLAIMS, pinned: null, hit: null })).toEqual({
      blobUrl: CLAIMS.blobUrl,
      pathname: CLAIMS.pathname,
      sourceAvatarId: null,
      sourceImageId: null,
      contentHash: HASH,
      description: null,
      release: null,
    })
  })

  it('race: references the keeper and releases the fresh loser bytes', () => {
    const plan = planChatPhotoAddWrite({ claims: CLAIMS, pinned: null, hit: FLAT_KEEPER })
    expect(plan.blobUrl).toBe(FLAT_KEEPER.blobUrl)
    expect(plan.sourceImageId).toBe(FLAT_KEEPER.id)
    expect(plan.description).toBe(FLAT_KEEPER.description)
    expect(plan.release).toEqual({ blobUrl: CLAIMS.blobUrl, pathname: CLAIMS.pathname })
  })

  it('skip: the payload echoes the keeper, so NOTHING is released', () => {
    // The pathname comparison is what keeps one function honest about both paths.
    const plan = planChatPhotoAddWrite({
      claims: { ...CLAIMS, blobUrl: FLAT_KEEPER.blobUrl, pathname: FLAT_KEEPER.pathname },
      pinned: FLAT_KEEPER,
      hit: null,
    })
    expect(plan.release).toBeNull()
    expect(plan.sourceImageId).toBe(FLAT_KEEPER.id)
  })

  it('a pinned row that is itself a reference flattens to its own original', () => {
    const plan = planChatPhotoAddWrite({
      claims: CLAIMS,
      pinned: { ...FLAT_KEEPER, sourceImageId: 'origin12XYZ_' },
      hit: null,
    })
    // `ninaPhotoProvenance`'s rule, inherited: the column always names the ORIGINAL.
    expect(plan.sourceImageId).toBe('origin12XYZ_')
    expect(plan.sourceAvatarId).toBeNull()
  })

  it('a pinned row that came from the album INHERITS the avatar id', () => {
    // The album face stays hidden even after the intermediate chat row is deleted.
    const plan = planChatPhotoAddWrite({
      claims: CLAIMS,
      pinned: { ...FLAT_KEEPER, sourceAvatarId: 'avatarAAAAAA', sourceImageId: null },
      hit: null,
    })
    expect(plan.sourceAvatarId).toBe('avatarAAAAAA')
    expect(plan.sourceImageId).toBe('keep123XYZ_9')
  })

  it('a null hash claim stays null on a reference row: NULL means no claim, not a lie', () => {
    const plan = planChatPhotoAddWrite({
      claims: { ...CLAIMS, contentHash: null },
      pinned: null,
      hit: FLAT_KEEPER,
    })
    expect(plan.contentHash).toBeNull()
  })
})
```

### Step 15: `tests/nina.photoRefs.test.ts` — Replace names the column

**File:** `tests/nina.photoRefs.test.ts` — one case appended inside
`describe('Replace stops the provenance lying about bytes that are gone')`:

```ts
  it('media-dedupe P3: names content_hash in the SAME statement — a claim sticks, its absence retracts', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoBlob('u1', IMAGE, {
      blobUrl: 'https://x/new.jpg',
      pathname: 'nina/u1/new.jpg',
      width: 768,
      height: 1024,
      bytes: 123,
      contentHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    })

    const { sql } = fake.only()
    /* One statement, so there is no window in which the row points at new bytes and claims old
     * ones — the same argument the provenance nulls above it make. */
    expect(sql.slice(0, sql.indexOf(' where '))).toContain('content_hash')
    expect(fake.queries).toHaveLength(1)
  })
```

## Verification

**Build:** `npm run build`
**Tests:** `npm run typecheck` then `npm run test`
(fast loop while implementing: `npm run test -- tests/nina.imageDedupe.test.ts tests/nina.imagerun.test.ts tests/nina.imageworker.test.ts tests/admin.chatPhotoDedupe.test.ts tests/admin.chatPhotos.test.ts tests/nina.photoRefs.test.ts`)
**Boundary guards** (this phase adds a server-action import into a client module and touches a
`'use server'` file): `npm run ci:llm-payload-guard`, `npm run ci:client-secret-guard` — both must
stay green; no new entry is added to any guard list.

**Manual check:** none against production — this phase writes no migration and runs no script
against the store. The worker's preflight is exercised only by its next scheduled/dispatch run,
where a red `schema drift` on `content_hash`/`created_at` would mean migration 0018 was never
applied (the designed signal, not a defect).

**Exit criteria:** generating an image whose bytes the user already stores puts NO new object in
Blob (the put is skipped, the row lands as a reference); the same holds when the race is lost at
insert (reference + released loser, both hosts); an admin add of already-stored bytes uploads
nothing and lands as a reference carrying the keeper's description; an admin Replace can never
leave a stale hash on new bytes; `tests/` covers the shared decision, both generated paths, and
the admin decision.

## Handoffs

- **Phase 2 (runner upload path):** RECONCILED — no unification. Phase 2's STEP 1b race-close
  calls ITS OWN module (`lib/nina/dedupe.ts`: `partitionNinaUploadClaims` + `ninaUploadInsertRow`),
  not `planNinaImageWrite`. The division is deliberate and recorded in the index's Decisions:
  this module must stay zero-import (the worker imports it) and models the single generated-image
  write (hash-carrying references included); phase 2's must stay client-safe (the composer
  imports it) and models the batch upload send (same-send twins, provenance flattening, no hash
  on references). What the three DO share, verbatim: the row-first/blob-second release rule, the
  pathname-comparison release gate, and `contentHashOf`/`isValidContentHash` as the only hash
  vocabulary — so a runner race-close and a generated race-close can still not disagree about
  WHEN bytes are released, only about which module shapes their rows.
- **Phase 4 (backfill sweep):** rows this phase writes are already hashed; your fill pass's
  `content_hash is null` guard skips them, as your contract already states. Nothing else owed.
- **Deliberately left (no phase):** `/admin/photos` surfacing a "was already in the collection —
  attached as a re-share" sentence on a deduped Add (`ChatPhotoActionResult.note` is already the
  mechanism; `ChatPhotoAdd.tsx` renders only errors today). Cosmetic, and it would grow the Add
  component this phase keeps untouched.
- **Deliberately left (no phase):** cross-encoding dedup (same pixels, different bytes) stays out
  of scope per the plan's Decisions row 6 (perceptual YAGNI).

## Rollback

Revert the phase's commit. Nothing here changes schema, data, or store state permanently: rows
written as references are valid F37 rows that every existing reader already understands, and a
revert returns the worker to phase 1's behavior (the `content_hash` pass-through stays, NULL until
a caller sends one). The only residue after a rollback is a lost optimization — deduped writes
never stored anything that a revert would need to clean up, and released loser blobs are objects
nothing references either way. Migration 0018 stays (additive; phase 1's rollback note governs
it).
