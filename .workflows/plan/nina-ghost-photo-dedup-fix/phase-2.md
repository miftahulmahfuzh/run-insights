# Phase 2: Production ghost-row detector and repair script

**Plan set:** `NINA_GHOST_PHOTO_DEDUP_FIX_PLAN.md`
**Analysis:** `20260916-104336-G7K2_code_analyzer.md`
**Satisfies:** R1 — an orphaned reference row must never become a permanently-invisible,
potentially-broken duplicate in Media. Phase 1 stops new ones being made; this phase finds the ones
already in production, repairs the repairable, and names the unrepairable out loud.
**Depends on:** Phase 1 — **sequencing only, not a code dependency.** Verified by the reconciler
(2026-09-16): this phase imports nothing from Phase 1, touches none of its files, and would build
and test green against `origin/main` alone. The edge is kept for two reasons and neither is a
compile order: (a) the two phases land into one worktree and one git index, and serialising them is
cheaper than racing them; (b) Phase 1 is what fixes the promoted-column set this phase must match,
and a reader of the two plans should meet them in that order. **Do not** wait on a Phase 1 symbol,
type or export — there is none to wait for.
**Difficulty:** NORMAL
**Package:** `scripts`

---

## Goal

After this phase the existing media-dedupe sweep can **see** the phantom-original class as a class:
a `nina_message_images` row that is an original by `isOriginalPhoto()`'s definition yet was loaded
with `content_hash IS NULL`. Each one is named individually in the report as **recovered**,
**partial**, or **unrecoverable**, and the sweep gains the one measurement it never filled —
`width`/`height` (and `bytes`) — which is the column pair `isPerceptualTwin` hard-requires and
without which a promoted phantom stays invisible to the perceptual pass forever. Nothing new is
deleted, and nothing is written without `--apply`.

---

## The decision: extend the pair, do not write a standalone script

The phase brief asks for this choice to be made and justified. **Extend
`scripts/nina-dedupe-plan.mjs` + `scripts/nina-dedupe-media.mjs`.** Four measured reasons, in
descending weight:

1. **The rows are already loaded, fetched, hashed and signed by the existing sweep.**
   `nina-dedupe-media.mjs:162-168` selects *every* row of `nina_message_images` with no predicate;
   `nina-dedupe-media.mjs:215-228` (PASS 1) already GETs and sha-256s every row whose
   `content_hash` is NULL — the phantom class included — and `:257-274` (PASS 3c) already signs
   every original that carries no stored signature. A standalone script would re-load the same
   table, re-issue the same GETs, and stand up a **second** sha-256 + sharp pipeline. That second
   pipeline is exactly what `lib/nina/perceptualSign.ts:13-21` names as the failure mode to avoid
   ("a different kernel, a different gray coefficient, a different resize order … the two layers
   would drift apart in the exact direction a conservative gate cannot see").

2. **The real remaining gap is a *missing fill*, not a missing script.** Trace a phantom whose blob
   is still alive through today's sweep: PASS 1 fills `content_hash`, PASS 3c fills
   `perceptual_hash` + `perceptual_sig`. Nothing anywhere fills `width`/`height`/`bytes` — there is
   no `fill-dimensions` op in the family. And `isPerceptualTwin`
   (`nina-dedupe-plan.mjs:482-484`) opens with
   `if (a?.width == null || a?.height == null || …) return false`. So a phantom original that *is*
   recoverable gets hashed and signed and **still never participates in the perceptual pass** —
   which is the only pass that can ever catch it, because the phantom names the avatar object's
   bytes while its twin names a separately-encoded selfie object, so the byte-exact pass cannot
   group them. That is the precise mechanism by which this class survives as a visible duplicate
   even when its bytes are intact. The fix belongs where the other fills live.

3. **The downstream consumer of a promotion is the sweep itself.** Promotion is not the user-facing
   outcome; *the duplicate tile disappearing from Media* is. A standalone promoter would stop one
   step short and require an operator to then run the sweep anyway. Because PASS 1/3c already write
   their measurements onto the in-memory row objects, a phantom promoted in a run is grouped,
   clustered and merged **in the same run** — once it carries dimensions.

4. **The test seam already exists and is the convention.** `tests/nina.dedupeMedia.test.ts` (873
   lines) holds the pure half against measured production fixtures and states its own rule in its
   header: script I/O is covered by a production dry run, pure functions by unit tests. A new
   standalone script would need a new companion test file duplicating that argument. `knip.ts`'s
   header also notes it finds script entries via `package.json` scripts — extending needs no new
   `package.json` entry and no new knip surface.

**What extending costs, stated plainly:** the operator cannot promote phantoms with `--apply`
without also running the sweep's pre-existing merge/release behavior. That is accepted, because
(a) this phase introduces no flag and adds no `del()` and no `DELETE` — `--apply`'s blast radius is
exactly what it already was; (b) merging a promoted phantom into its twin *is* the desired end
state for R1; and (c) the script's own header (`nina-dedupe-media.mjs:13-15`) already commands
"Read the dry run before applying. Always."

**Connection string:** the brief suggested `DATABASE_URL_UNPOOLED`. Extending means inheriting
`nina-dedupe-media.mjs:116-124`'s existing `DATABASE_URL` + `neon()` HTTP driver, which is the right
choice for this script (the neon serverless HTTP driver is built for the pooled URL) and points at
the same single production database. **Do not change it** — that would be scope creep on a line
this phase has no reason to touch.

---

## Measured production ground truth (2026-09-16, read-only `psql` over `DATABASE_URL_UNPOOLED`)

```
select count(*) as total,
       count(*) filter (where source_avatar_id is null and source_image_id is null) as originals,
       count(*) filter (where content_hash is null) as hash_null,
       count(*) filter (where source_avatar_id is null and source_image_id is null
                          and width is null) as orig_dims_null,
       count(*) filter (where source_avatar_id is null and source_image_id is null
                          and content_hash is not null and width is null) as orig_hashed_dims_null
from nina_message_images;

 total | originals | hash_null | orig_dims_null | orig_hashed_dims_null
   129 |        86 |         3 |              1 |                     0
```

The three `content_hash IS NULL` rows, and why only one is a phantom:

| id | `source_avatar_id` | `source_image_id` | verdict |
|---|---|---|---|
| `ETtycd0IgLMZ` | — | set | reference — **not** a phantom; PASS 1 hashes it as it always has |
| `9uMGPIZBIWwR` | set | — | reference — **not** a phantom |
| `Tdw_AkrJT0ks` | NULL | NULL | **the phantom.** `width`/`height`/`bytes`/`perceptual_*` all NULL, `message_id` NULL, pathname `nina/24076314-…/avatar-7pgf5f96AXK6-…jpg`, blob GET → `Blob not found` |

`orig_hashed_dims_null = 0` means the new `fill-dimensions` op has **zero** writes to make on
production today — the only row that wants one is the unrecoverable phantom. That is what makes the
exit criterion below sharp: the dry run must print `0` dimension fills and `1` unrecoverable.

---

## Interface Contract

**Deletes:** none.
**Renames:** none.
**Creates:**
- `scripts/nina-dedupe-plan.mjs` → `isPhantomOriginal(row)`, `classifyPhantomOriginals(rows)`,
  `buildFillDimensionOps(rows)` (three new named exports).
- New op kind `{ op: 'fill-dimensions', id, width, height, bytes }` in the sweep's op vocabulary.
- New row fields produced by the driver and consumed by the pure half: `hadNullHashAtLoad`,
  `hadNullDims`, `fetchFailure`, `measuredWidth`, `measuredHeight`, `measuredBytes`.
- `scripts/nina-dedupe-media.mjs` → module-local `adoptMeasuredDimensions(row, sig, size)`.

**Signature changes:**
- `scripts/nina-dedupe-media.mjs`'s module-local `signBytes(bytes)` return value gains two fields:
  `{ dhash, sig16 }` → `{ dhash, sig16, width, height }`. Additive; `dhash`/`sig16` are computed by
  byte-identical code, so every existing consumer (`buildFillPerceptualOps`, `isPerceptualTwin`,
  `buildPerceptualMergePlan`) is unaffected. This **converges** the sweep's signer onto
  `lib/nina/perceptualSign.ts:51-56`, which already reads `img.metadata()` in the same
  `Promise.all` — so the "if the sweep's `signBytes` ever changes, this file changes in the same
  commit, and the reverse" rule in `perceptualSign.ts:19-21` is satisfied *without editing
  `perceptualSign.ts`*, which is Phase 1's file.

**Requires (from earlier phases):**
- Phase 1 fixes the promoted-column set to exactly `content_hash`, `perceptual_hash`,
  `perceptual_sig`, `width`, `height`, `bytes`. This phase writes that same set (across three
  separately-guarded fills) so a Phase-1 promotion and a Phase-2 promotion are indistinguishable in
  the database afterward.
- Phase 1 also fixes the write guard as `content_hash IS NULL`. **Divergence the reconciler should
  see:** this sweep guards each fill on *its own* column (`content_hash is null`,
  `perceptual_hash is null`, `width is null and height is null`), because the three fills run as
  separate ops in one op list — a `fill-dimensions` guarded on `content_hash is null` would write
  nothing, since `fill-hash` runs first and fills that very column in the same run. Guarding the
  column you are filling is the discipline `buildFillOps`/`buildFillPerceptualOps` already follow
  (`nina-dedupe-media.mjs:465` guards `content_hash is null`, `:469` guards `perceptual_hash is
  null` — *not* `content_hash`). Net effect: this phase's guard set is strictly more thorough than
  Phase 1's single guard (it also repairs an original whose hash was filled by an earlier sweep run
  but whose dimensions are still NULL — Phase 1's helper would skip that row). Same end state, no
  conflict.

**Reconciler's verification of the above (2026-09-16), so no executor re-litigates it:**

- **The column set matches exactly.** Phase 1 fires one guarded UPDATE writing `content_hash` +
  `bytes` always and `perceptual_hash` + `perceptual_sig` + `width` + `height` when the signature
  survives. This phase writes the same six across three ops: `fill-hash` (`content_hash`),
  `fill-perceptual` (`perceptual_hash`, `perceptual_sig`), `fill-dimensions` (`width`, `height`,
  `bytes` under `coalesce`). Union identical. Confirmed against Phase 1's Step 1 code block.
- **The signing recipe matches byte for byte.** Compared against the worktree:
  `lib/nina/perceptualSign.ts:50-56` and this phase's Step 7 `signBytes` both run
  `sharp(bytes, { failOn: 'none' })` then, in one `Promise.all`, `img.metadata()`,
  `.clone().resize(16, 16, { fit: 'fill' }).grayscale().raw()`, and
  `.clone().resize(9, 8, { fit: 'fill' }).grayscale().raw()`, with the identical 9x8 dhash loop.
  Same bytes in, same `dhashHex`/`sig16` out of both layers. Step 7 is what closes the last gap
  (`metadata()`), so this phase **converges** the two signers rather than forking them.
- **One narrow, deliberate divergence, and it is not a defect.** `signImageBytes` returns `null`
  outright when `metadata()` reports no `width`/`height`, so Phase 1 writes `content_hash` + `bytes`
  and no perceptual pair for such an image. This phase's `signBytes` returns the pair with
  `width`/`height` as `null`, so `fill-perceptual` still writes the pair and `fill-dimensions`
  correctly declines. That case is an image sharp can decode but cannot measure — vanishingly rare,
  and the sweep's behaviour there is **pre-existing**, not introduced here. It stays as it is: this
  phase owns no change to `fill-perceptual`, and quietly making the sweep stricter to match Phase 1
  would be an unmeasured behaviour change smuggled into a dimension fill. Recorded as a Decision in
  the plan index.
- **No pathname guard here, and that is also deliberate.** Phase 1's UPDATE carries
  `pathname = $n` alongside `content_hash IS NULL`, because it runs inside a Server Action where an
  admin Replace can repoint the row between the read and the write (the 2026-09-15 ghost-signature
  lesson). This sweep's fills do not, and the two pre-existing fills (`fill-hash`, `fill-perceptual`)
  never have: a sweep run is a single linear pass over rows it loaded itself, and every op it
  executes is guarded on the very column it fills, so a concurrent writer wins and the op no-ops.
  **Do not "restore consistency" by adding a pathname clause to `fill-dimensions`** — it would be
  the only fill in the family carrying one, and the row-loading pass would have to start carrying
  the pathname it measured through three passes to supply it.

**Leaves alone (owned by others):** `lib/nina/**`, `lib/admin/**`, `lib/photos/**`,
`lib/db/schema/**` (Phase 1). No import of Phase 1's helper — `scripts/*.mjs` in this family build
no import graph, so every primitive is restated locally, exactly as `nina-dedupe-plan.mjs:323-346`
already restates `dhashHexOf`/`parseDhashHex`/`sig16FromBase64`.

**Does not touch under any flag:** no `del()` call is added, no `DELETE` statement is added, no
`--apply`-only path gains a row removal. Deleting an unrecoverable ghost row stays a future, separate,
human decision.

---

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-dedupe-plan.mjs` | modify | append the phantom-original section after `buildFillPerceptualOps` (ends `:379`): `isPhantomOriginal`, `classifyPhantomOriginals`, `buildFillDimensionOps` |
| `scripts/nina-dedupe-media.mjs` | modify | header pass list; import block `:84-96`; row mapping `:178-197`; PASS 1 `:215-228`; PASS 3c `:257-274`; PASS 3d `:283-294`; op list `:307-312`; report after `:350`; op print `:413-442`; executor `:460-532`; `signBytes` `:558-571`; new `adoptMeasuredDimensions` helper |
| `tests/nina.dedupeMedia.test.ts` | modify | append two `describe` blocks at end of file (after `:873`) |

No `package.json`, `knip.ts`, `tsconfig.json` or `vitest.config.ts` change: the sweep is already
wired as `npm run nina:dedupe-media` (`package.json:31`), and `tsconfig.json`'s `include` is
`**/*.ts` / `**/*.tsx` only — `scripts/*.mjs` is reached by `tsc` solely as an `allowJs` dependency
of the test's `import … from '@/scripts/nina-dedupe-plan.mjs'`, with `checkJs` off, so it is **not**
type-checked. `npx tsc --noEmit` must still pass; it is simply unaffected by the `.mjs` edits.

---

## Implementation Steps

### Step 1: The pure half — phantom classification and the dimension fill

**File:** `scripts/nina-dedupe-plan.mjs`, appended after `buildFillPerceptualOps` (which ends at
`:379`), before the `releaseDecision` block's comment at `:381`.

**Change:** add one documented section with three exports. Pure — no DB, no fetch, no sharp, no env,
the same contract every function in this module holds.

**Code:**

```js
/* ── PHANTOM ORIGINALS (2026-09-16's measured defect) ──────────────────────────────────────────
 * A `nina_message_images` row written as a REFERENCE carries no measurements of its own by design:
 * `resolveAttachment` copies `blob_url`/`pathname`/`description` from the source and leaves
 * `content_hash`/`perceptual_hash`/`perceptual_sig`/`width`/`height`/`bytes` NULL, because the
 * keeper owns those facts. When the parent is hard-deleted, the FK's deliberate `ON DELETE SET
 * NULL` (`lib/db/schema/nina/chat.ts:614-618`) blanks `source_avatar_id`/`source_image_id` — and
 * the row silently reclassifies to an ORIGINAL by `isOriginalRow`'s definition while still
 * carrying nothing dedup can read. It is now a tile in Media that no mechanism can ever match.
 *
 * Measured on production 2026-09-16: exactly one such row, `Tdw_AkrJT0ks` — every measurement
 * column NULL, `message_id` NULL, pathname `avatar-7pgf5f96AXK6-…jpg` (the AVATAR naming
 * convention, never a chat selfie's), `description` byte-identical to the live, correctly-hashed
 * `CwBaQhK_PG5p`. A GET of its `blob_url` returns "Blob not found": the object was deleted out from
 * under it by an avatar-delete path that never checked whether anything still rendered those bytes
 * (phase 1 closes that). So this row is UNRECOVERABLE — there are no bytes left to measure — and it
 * is REPORTED, never removed. Deleting it is a human decision this sweep does not make.
 *
 * ── WHY `fill-dimensions` HAD TO EXIST ────────────────────────────────────────────────────────
 * A phantom whose object is still alive is already hashed by pass 1 and signed by pass 3c. It is
 * still invisible, because `isPerceptualTwin`'s first line refuses any row with a NULL
 * `width`/`height`, and NOTHING in this family ever filled those columns. And the perceptual pass
 * is the ONLY pass that can catch a phantom: the phantom names the avatar object's bytes while its
 * twin names a separately-encoded selfie object, so their `content_hash` values legitimately
 * differ and the byte pass can never group them. `fill-dimensions` is that missing measurement,
 * persisted as an op for the same reason every other fill here is an op — a measurement that lives
 * only in a console is not a measurement.
 *
 * ── THE GUARD, AND WHY IT IS NOT `content_hash is null` ───────────────────────────────────────
 * Each fill guards ITS OWN column: `fill-hash` on `content_hash is null`, `fill-perceptual` on
 * `perceptual_hash is null`, `fill-dimensions` on `width is null and height is null`. A
 * `fill-dimensions` guarded on `content_hash is null` would write nothing at all, because
 * `fill-hash` runs first in the same op list and fills that very column. `bytes` rides along under
 * `coalesce` — a stored size is never overwritten, which keeps this consistent with the sweep's
 * standing "bytes metadata mismatches are REPORTED ONLY" line.
 *
 * The app-layer promotion this mirrors (`lib/nina/provenancePromotion.ts`) guards differently on
 * purpose, and the difference is not a drift to reconcile away: it writes all six columns in ONE
 * statement, so one guard (`content_hash is null`) covers the whole write, and it adds
 * `pathname = $n` because it runs inside a Server Action where an admin Replace can repoint the row
 * between its read and its write. A sweep is a single linear pass over rows it loaded itself, and
 * each of its three fills is a separate op guarded on the column it fills. Two write paths, two
 * correct guard shapes, one end state.
 */

/**
 * The load-time shape, as a predicate. `hadNullHashAtLoad` is set by the ops script when it maps
 * the raw row — deliberately NOT the same flag as `hadNullHash`, which pass 1 sets only AFTER a
 * successful GET and which `buildFillOps` reads. A phantom whose blob is gone never gets
 * `hadNullHash`, and it is precisely the one this census must not lose.
 */
export function isPhantomOriginal(row) {
  return isOriginalRow(row) && row.hadNullHashAtLoad === true
}

/**
 * The census, in three buckets, each row named individually and never silently dropped:
 *
 *   recovered     — this run measured the bytes AND signed them AND has dimensions. The fills are
 *                   queued as ops; on `--apply` the row becomes a fully dedup-eligible original,
 *                   indistinguishable from one phase 1's app-layer helper promoted.
 *   partial       — the bytes were measured (hash recovered) but the signature or the dimensions
 *                   were not (sharp missing, or an undecodable image). Honest half-repair: the row
 *                   gains a `content_hash` and stays out of the perceptual pass. `missing` says
 *                   which fact is absent.
 *   unrecoverable — the GET failed. There are no bytes to measure and there never will be. Named,
 *                   with the fetch's own reason, and left exactly where it is.
 *
 * Each list is id-sorted so two runs over the same data print the same report.
 */
export function classifyPhantomOriginals(rows) {
  const recovered = []
  const partial = []
  const unrecoverable = []

  for (const row of rows) {
    if (!isPhantomOriginal(row)) continue

    if (row.hashFailed === true || row.verifiedHash == null) {
      unrecoverable.push({
        id: row.id,
        pathname: row.pathname,
        blobUrl: row.blobUrl,
        reason: row.fetchFailure ?? 'bytes were never measured this run',
      })
      continue
    }

    const entry = {
      id: row.id,
      pathname: row.pathname,
      contentHash: row.verifiedHash,
      width: row.width ?? null,
      height: row.height ?? null,
      bytes: row.bytes ?? null,
    }
    const missing = []
    if (row.sig == null) missing.push('perceptual signature')
    if (entry.width == null || entry.height == null) missing.push('dimensions')

    if (missing.length > 0) partial.push({ ...entry, missing })
    else recovered.push(entry)
  }

  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  recovered.sort(byId)
  partial.sort(byId)
  unrecoverable.sort(byId)
  return { recovered, partial, unrecoverable }
}

/**
 * One op per ORIGINAL whose `width`/`height` were both NULL at load and which this run measured.
 * References are excluded on purpose: a reference carries no measurements by the module's own
 * doctrine, and filling one would make it look like an original that nothing elected.
 *
 * `bytes` is carried when the run measured a plausible size and is written under `coalesce`, so a
 * stored size is never clobbered. A measurement that is not a positive integer throws rather than
 * being written — the same paranoia `buildFillOps` applies to a measured hash.
 */
export function buildFillDimensionOps(rows) {
  return rows
    .map((row) => {
      if (row.hadNullDims !== true) return null
      if (!isOriginalRow(row)) return null
      const width = row.measuredWidth
      const height = row.measuredHeight
      if (width == null || height == null) return null
      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error(
          `row ${row.id}'s measured dimensions are not positive integers — refusing to write ${width}x${height}`,
        )
      }
      const bytes =
        Number.isInteger(row.measuredBytes) && row.measuredBytes > 0 ? row.measuredBytes : null
      return { op: 'fill-dimensions', id: row.id, width, height, bytes }
    })
    .filter(Boolean)
}
```

**Impact:** three new exports and one new op kind. No existing function's behavior changes.

---

### Step 2: Import the new pure functions

**File:** `scripts/nina-dedupe-media.mjs:84-96`

**Change:** add `buildFillDimensionOps` and `classifyPhantomOriginals` to the existing
alphabetically-ordered import list.

**Code (complete replacement of the import statement):**

```js
import {
  buildFillDimensionOps,
  buildFillOps,
  buildFillPerceptualOps,
  buildMergePlan,
  buildPerceptualMergePlan,
  classifyPhantomOriginals,
  decodeStoredSignature,
  isOriginalRow,
  isStoreUrl,
  parseArgs,
  perceptualVerifyCandidates,
  releaseDecision,
  sha256Hex,
} from './nina-dedupe-plan.mjs'
```

**Impact:** none beyond making the new functions reachable.

---

### Step 3: Mark the load-time shape on every row

**File:** `scripts/nina-dedupe-media.mjs:178-197` (the `rows = raw.map(...)` block)

**Change:** record two facts that are only knowable *before* any pass mutates the row object:
whether `content_hash` was NULL at load, and whether the dimension pair was NULL at load. These are
the inputs `isPhantomOriginal` and `buildFillDimensionOps` read.

**Code (complete replacement of the `rows` mapping):**

```js
  const rows = raw.map((r) => ({
    id: r.id,
    userId: r.user_id,
    messageId: r.message_id,
    kind: r.kind,
    blobUrl: r.blob_url,
    pathname: r.pathname,
    bytes: r.bytes,
    width: r.width,
    height: r.height,
    description: r.description,
    sourceAvatarId: r.source_avatar_id,
    sourceImageId: r.source_image_id,
    createdAt: r.created_at,
    contentHash: r.content_hash,
    perceptualHash: r.perceptual_hash,
    perceptualSig: r.perceptual_sig,
    verifiedHash: null,
    hashFailed: false,
    /* The load-time shape, captured before any pass writes to this object. `hadNullHashAtLoad` is
     * deliberately NOT `hadNullHash`: pass 1 sets that one only after a SUCCESSFUL GET, and a
     * phantom whose object is gone is precisely the row the census must not lose. `hadNullDims`
     * drives `fill-dimensions`; `bytes` rides along under `coalesce` rather than gating the op,
     * because a row may honestly carry a size without ever having been measured for pixels. */
    hadNullHashAtLoad: r.content_hash == null,
    hadNullDims: r.width == null && r.height == null,
  }))
```

**Impact:** two extra fields per row. No existing consumer reads either name.

---

### Step 4: Record the fetch failure reason, and adopt a measured size

**File:** `scripts/nina-dedupe-media.mjs:215-228` (PASS 1's loop)

**Change:** keep the failure reason on the row (the census reports it verbatim) and adopt a measured
byte size onto a row whose `bytes` column is NULL, so the report and any downstream keeper op speak
about a real number instead of `?`.

**Code (complete replacement of the PASS 1 loop):**

```js
  const fills = []
  const failed = []
  for (const row of rows) {
    if (row.contentHash != null) continue
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      /* Kept on the row, not only in `failed`: the phantom census reports the reason verbatim, and
       * "GET 404" vs "not a store URL" is the difference between a deleted object and a malformed
       * row — an operator needs to know which one they are looking at. */
      row.fetchFailure = got.reason
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.hadNullHash = true // the column was NULL entering this run — pass 1 owns filling it
    row.contentHash = got.hash
    row.verifiedHash = got.hash // measured this run — no re-fetch needed for the verify gate
    row.bytesMismatch = row.bytes != null && got.size !== row.bytes
    adoptMeasuredDimensions(row, null, got.size)
    fills.push({ id: row.id, hash: got.hash })
  }
```

**Impact:** `row.bytes` becomes a measured number on rows where the column was NULL. Two knock-on
effects, both improvements and both intentional: the report's `kb()` prints a real size instead of
`?`, and a perceptual `merge-row` that carries `keeper.bytes` now writes a measured size onto the
loser rather than NULL. Both are truthful measurements of the keeper's own object. `bytesMismatch`
is computed before the adoption, so mismatch reporting is unchanged.

---

### Step 5: Adopt measured dimensions where the signer measures them

**File:** `scripts/nina-dedupe-media.mjs`, PASS 3c (`:257-274`) and PASS 3d (`:283-294`)

**Change:** the whole point of the fill is that a phantom must participate in the perceptual pass
**in the same run** its dimensions are measured — so the measurement lands on the in-memory row, not
just in an op.

**Code (complete replacement of PASS 3c's `for` loop body region, keeping the surrounding
`if (sharp == null) … else` intact):**

```js
    for (const row of rows) {
      /* A stored signature was decoded at load; only rows WITHOUT one are measured here, and a
       * measurement is queued for persistence (`fill-perceptual`) rather than left in this run's
       * memory — the first landing computed signatures and wrote nothing, and pass-1's fills were
       * the same lesson once already. */
      if (!isOriginalRow(row) || row.sig != null || row.hashFailed) continue
      const got = await fetchRowBytes(row)
      if (!got.ok) {
        unsigned++
        continue
      }
      try {
        row.sig = await signBytes(got.bytes)
        row.perceptualSource = 'measured'
        /* The dimensions ride the signature's own `metadata()` read. Adopting them onto the row
         * NOW — not only into a `fill-dimensions` op — is what lets a phantom cluster in THIS run:
         * `isPerceptualTwin` refuses any row with a NULL width/height, so a phantom that had to
         * wait for the next run would stay a visible duplicate until somebody ran the sweep twice. */
        adoptMeasuredDimensions(row, row.sig, got.size)
      } catch {
        unsigned++ // undecodable bytes — the row simply does not participate in the perceptual pass
      }
    }
```

**Code (complete replacement of PASS 3d's loop):**

```js
  const verifyCandidates = perceptualVerifyCandidates(rows)
  let verifyFailed = 0
  for (const row of verifyCandidates) {
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      verifyFailed++
      continue
    }
    try {
      row.verifiedSig = await signBytes(got.bytes)
      /* The rare shape pass 3c cannot reach: a row that already carried a STORED signature (so 3c
       * skipped it) but whose dimensions are NULL. The verify GET measures them anyway; adopt them
       * rather than throw the measurement away. */
      adoptMeasuredDimensions(row, row.verifiedSig, got.size)
    } catch {
      verifyFailed++ // undecodable bytes — the stored value stands, no worse than before this gate
    }
  }
```

**Impact:** phantom originals with a live blob become perceptual-pass participants in the run that
measures them. No row whose columns were already populated is altered — see the helper's guards.

---

### Step 6: The adoption helper

**File:** `scripts/nina-dedupe-media.mjs`, new module-level function placed immediately after
`fetchRowBytes` (which ends at `:551`) and before `signBytes`.

**Change:** one place that decides what "adopt a measurement" means, so pass 1, 3c and 3d cannot
drift.

**Code:**

```js
/**
 * Move a measurement this run took onto the row object, for the report and for the perceptual
 * pass, and remember it separately so `buildFillDimensionOps` can persist it.
 *
 * NEVER overwrites a stored value. A stored dimension or size that disagrees with the bytes is a
 * DIFFERENT finding (the sweep's `bytes metadata mismatches` line, reported only) and is not this
 * function's business — silently correcting one here would hide it.
 */
function adoptMeasuredDimensions(row, sig, size) {
  if (
    sig != null &&
    typeof sig.width === 'number' &&
    typeof sig.height === 'number' &&
    row.width == null &&
    row.height == null
  ) {
    row.width = sig.width
    row.height = sig.height
    row.measuredWidth = sig.width
    row.measuredHeight = sig.height
  }
  if (typeof size === 'number' && Number.isFinite(size)) {
    row.measuredBytes = size
    if (row.bytes == null) row.bytes = size
  }
}
```

**Impact:** none on rows that already carry the columns.

---

### Step 7: `signBytes` also reports the dimensions it already decoded

**File:** `scripts/nina-dedupe-media.mjs:553-571`

**Change:** add `img.metadata()` to the existing `Promise.all` and return `width`/`height`. This is
`lib/nina/perceptualSign.ts:51-56`'s shape, verbatim — the two signers converge rather than diverge,
so `perceptualSign.ts`'s one-pipeline rule is honoured without editing that file (Phase 1 owns it).

**Code (complete replacement):**

```js
/**
 * The perceptual pass's only inputs, measured off the same GET that hashed the row: a 64-bit
 * difference hash over a 9x8 grayscale thumbnail and the 16x16 grayscale signature itself — plus
 * the pixel dimensions, which `lib/nina/perceptualSign.ts:51-56` already reads from the same
 * `metadata()` call and which `isPerceptualTwin` hard-requires. The three resize passes are
 * unchanged and independent clones, so the signature values are byte-for-byte what they were
 * before this read was added. Constant memory — the buffer is dropped the moment all three are
 * computed.
 */
async function signBytes(bytes) {
  const img = sharp(bytes, { failOn: 'none' })
  const [meta, sig16, dh] = await Promise.all([
    img.metadata(),
    img.clone().resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer(),
    img.clone().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer(),
  ])
  let dhash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (dh[y * 9 + x] > dh[y * 9 + x + 1]) dhash |= 1n << BigInt(y * 8 + x)
    }
  }
  return {
    dhash,
    sig16: new Uint8Array(sig16),
    width: typeof meta.width === 'number' ? meta.width : null,
    height: typeof meta.height === 'number' ? meta.height : null,
  }
}
```

**Impact:** `row.sig` and `row.verifiedSig` gain two fields. Every existing consumer reads only
`.dhash` and `.sig16` (`buildFillPerceptualOps` `nina-dedupe-plan.mjs:364-379`, `isPerceptualTwin`
`:500-505`, `buildPerceptualMergePlan` `:565-578,630-631`), so nothing else changes.

---

### Step 8: Queue the dimension fills in the op list

**File:** `scripts/nina-dedupe-media.mjs:307-312`

**Change:** insert `buildFillDimensionOps(rows)` after the perceptual fills and before the merge
plans — the same "every measurement lands before any repoint" ordering the surrounding comment
already argues for.

**Code (complete replacement):**

```js
  const ops = [
    ...buildFillOps(rows),
    ...buildFillPerceptualOps(rows),
    ...buildFillDimensionOps(rows),
    ...plan.ops,
    ...perceptual.ops,
  ]
```

**Impact:** on production today this adds zero ops (`orig_hashed_dims_null = 0`, and the one
dimensionless original is unrecoverable). It adds one op per phantom the moment a recoverable one
exists.

---

### Step 9: The census, in the report

**File:** `scripts/nina-dedupe-media.mjs`, inserted immediately after the closing `}` of the
`if (sharp != null) { … }` report block at `:350`, before the `for (const g of findings)` loop at
`:352`.

**Change:** print the three buckets, every row named.

**Code:**

```js
  /* ── PHANTOM ORIGINALS — the 2026-09-16 defect's census, row by row ────────────────────────── */
  const phantoms = classifyPhantomOriginals(rows)
  const phantomTotal =
    phantoms.recovered.length + phantoms.partial.length + phantoms.unrecoverable.length
  console.log(
    `phantom originals            ${phantoms.recovered.length} recovered / ` +
      `${phantoms.partial.length} partial / ${phantoms.unrecoverable.length} unrecoverable` +
      (phantomTotal === 0 ? '   (none — every original carries its own measurements)' : ''),
  )
  for (const p of phantoms.recovered) {
    console.log(
      `  + ${p.id}  ${p.pathname}  ${p.contentHash.slice(0, 16)}…  ` +
        `${p.width}x${p.height}  ${kb(p.bytes)}  — promoted, fills queued`,
    )
  }
  for (const p of phantoms.partial) {
    console.log(
      `  ~ ${p.id}  ${p.pathname}  hash recovered; still missing: ${p.missing.join(' + ')}`,
    )
  }
  for (const p of phantoms.unrecoverable) {
    console.log(`  ! ${p.id}  ${p.pathname}`)
    console.log(`      ${p.reason} — UNRECOVERABLE: the object is gone, so no measurement of these`)
    console.log(`      bytes can ever be taken. Reported, never removed: deleting the row is a`)
    console.log(`      separate human decision this sweep does not make under any flag.`)
  }
```

**Impact:** report-only. On production today this prints exactly one `!` line, for `Tdw_AkrJT0ks`.

---

### Step 10: Print and execute the new op

**File:** `scripts/nina-dedupe-media.mjs`, op-print loop (`:413-442`) and executor (`:460-532`)

**Change (a) — print.** Insert after the `fill-perceptual` print branch (`:419-421`):

```js
    if (op.op === 'fill-dimensions')
      console.log(
        `UPDATE nina_message_images SET width = ${op.width}, height = ${op.height}, ` +
          `bytes = coalesce(bytes, ${op.bytes ?? 'null'}) WHERE id = '${op.id}'` +
          `  (dimension fill — the columns were null; a phantom original cannot enter the` +
          ` perceptual pass without them)`,
      )
```

**Change (b) — execute.** Insert a new `else if` after the `fill-perceptual` branch (`:466-469`):

```js
      } else if (op.op === 'fill-dimensions') {
        /* The guard is on the columns being FILLED, not on `content_hash`: `fill-hash` has already
         * run in this same op list and filled that column, so a `content_hash is null` guard here
         * would write nothing at all. `bytes` under `coalesce` — a stored size is never clobbered;
         * a size that disagrees with the bytes stays a reported `bytes metadata mismatch`, which is
         * a different finding this op must not quietly erase. */
        await sql`
          update nina_message_images
             set width = ${op.width}, height = ${op.height},
                 bytes = coalesce(bytes, ${op.bytes})
           where id = ${op.id} and width is null and height is null
        `
```

**Impact:** `--apply` gains one write kind, guarded and idempotent. No `del()`, no `DELETE`.

---

### Step 11: Document the new pass in the script header

**File:** `scripts/nina-dedupe-media.mjs`, header `:17-60`

**Change (a):** insert a new numbered bullet between `3d.` (ends `:50`) and `4.`:

```
 *  3e. PHANTOM ORIGINALS: a row that is an ORIGINAL by `isOriginalRow` yet arrived with
 *      `content_hash` NULL. It is a reference row whose parent was hard-deleted: the FK's
 *      deliberate `ON DELETE SET NULL` (`lib/db/schema/nina/chat.ts:614-618`) blanked its
 *      provenance and silently reclassified it, while it had never been given the measurements an
 *      original needs. Measured on production 2026-09-16: one such row, `Tdw_AkrJT0ks`, whose blob
 *      already 404s — UNRECOVERABLE, so it is named in the report and left exactly where it is
 *      (removing a ghost row is a human decision this script does not make under any flag). A
 *      phantom whose object survives is promoted instead: pass 1 hashes it, pass 3c signs it, and
 *      the NEW `fill-dimensions` op writes the `width`/`height` (+ `bytes` under `coalesce`) that
 *      nothing in this family ever filled — without which `isPerceptualTwin` refuses the row on its
 *      first line and the phantom stays a permanently invisible duplicate even with live bytes.
 *      The perceptual pass is the only pass that can ever match one, because a phantom names the
 *      avatar object's bytes while its twin names a separately-encoded selfie object.
```

**Change (b):** extend the IDEMPOTENCE paragraph (`:72-79`) with one sentence before its final line:

```
 * `fill-dimensions` guards `width is null and height is null` (its OWN columns — a `content_hash
 * is null` guard would never fire, since `fill-hash` fills that column earlier in the same op
 * list), so a second run measures the same pixels and writes nothing.
```

**Impact:** documentation only.

---

### Step 12: Unit tests for the two new pure functions

**File:** `tests/nina.dedupeMedia.test.ts`, appended at end of file (after `:873`)

**Change:** two `describe` blocks, matching the file's existing conventions — the local `row()`
factory (`:54-69`), the `as Parameters<typeof row>[0]` cast the file already uses for fields the
inferred `Row` type does not name (`:845`, `:862`, `:869`), and a header that pins the measured
production fact.

**Code:**

```ts
/* ── phantom originals (2026-09-16's measured defect) ─────────────────────────────────────────
 * A reference row whose parent avatar was hard-deleted reclassifies to an ORIGINAL via the FK's
 * `ON DELETE SET NULL` while still carrying no measurements at all. Measured on production
 * 2026-09-16: exactly one, `Tdw_AkrJT0ks` — every measurement column NULL and its blob object
 * already 404. Two REFERENCE rows also carried a null `content_hash` that day (`ETtycd0IgLMZ`,
 * `9uMGPIZBIWwR`); neither is a phantom, and a census that swept them in would ask an operator to
 * worry about rows that are behaving exactly as designed.
 */
type PhantomOver = Partial<Row> & Pick<Row, 'id'>

const phantom = (over: PhantomOver): Row =>
  row({
    contentHash: null,
    verifiedHash: null,
    width: null,
    height: null,
    bytes: null,
    hadNullHashAtLoad: true,
    hadNullDims: true,
    ...over,
  } as PhantomOver)

describe('classifyPhantomOriginals — the ghost census', () => {
  it('names a dead-blob phantom under unrecoverable, with the fetch reason', () => {
    const out = classifyPhantomOriginals([
      phantom({
        id: 'Tdw_AkrJT0ks',
        pathname: `nina/${USER}/avatar-7pgf5f96AXK6.jpg`,
        hashFailed: true,
        fetchFailure: 'GET 404',
      } as PhantomOver),
    ])
    expect(out.recovered).toEqual([])
    expect(out.partial).toEqual([])
    expect(out.unrecoverable).toEqual([
      {
        id: 'Tdw_AkrJT0ks',
        pathname: `nina/${USER}/avatar-7pgf5f96AXK6.jpg`,
        blobUrl: `https://store.public.blob.vercel-storage.com/nina/${USER}/chat/Tdw_AkrJT0ks.jpg`,
        reason: 'GET 404',
      },
    ])
  })

  it('never counts a reference as a phantom, dead blob or not', () => {
    const refs = [
      phantom({
        id: 'ETtycd0IgLMZ',
        sourceImageId: 'keeper1',
        hashFailed: true,
        fetchFailure: 'GET 404',
      } as PhantomOver),
      phantom({
        id: '9uMGPIZBIWwR',
        sourceAvatarId: 'avatar1',
        hashFailed: true,
        fetchFailure: 'GET 404',
      } as PhantomOver),
    ]
    expect(classifyPhantomOriginals(refs)).toEqual({
      recovered: [],
      partial: [],
      unrecoverable: [],
    })
  })

  it('reports a fully measured phantom as recovered', () => {
    const h = 'f'.repeat(64)
    const out = classifyPhantomOriginals([
      phantom({
        id: 'alive',
        contentHash: h,
        verifiedHash: h,
        width: 576,
        height: 1024,
        bytes: 91_234,
        sig: sigOf(0x484c6c62414e7e5fn, uniform16(9)),
      } as PhantomOver),
    ])
    expect(out.unrecoverable).toEqual([])
    expect(out.partial).toEqual([])
    expect(out.recovered).toEqual([
      {
        id: 'alive',
        pathname: `nina/${USER}/chat/alive.jpg`,
        contentHash: h,
        width: 576,
        height: 1024,
        bytes: 91_234,
      },
    ])
  })

  it('reports a hashed-but-unsigned phantom as partial, naming what is missing', () => {
    const h = 'f'.repeat(64)
    const out = classifyPhantomOriginals([
      phantom({ id: 'nosharp', contentHash: h, verifiedHash: h } as PhantomOver),
    ])
    expect(out.recovered).toEqual([])
    expect(out.unrecoverable).toEqual([])
    expect(out.partial).toHaveLength(1)
    expect(out.partial[0]!.id).toBe('nosharp')
    expect(out.partial[0]!.missing).toEqual(['perceptual signature', 'dimensions'])
  })

  it('a row that already carried a hash is not a phantom — a second run reports nothing', () => {
    expect(classifyPhantomOriginals([row({ id: 'normal' })])).toEqual({
      recovered: [],
      partial: [],
      unrecoverable: [],
    })
  })

  it('sorts every bucket by id, so two runs print the same report', () => {
    const out = classifyPhantomOriginals([
      phantom({ id: 'zz', hashFailed: true, fetchFailure: 'GET 404' } as PhantomOver),
      phantom({ id: 'aa', hashFailed: true, fetchFailure: 'GET 404' } as PhantomOver),
    ])
    expect(out.unrecoverable.map((p) => p.id)).toEqual(['aa', 'zz'])
  })
})

describe('buildFillDimensionOps — the measurement isPerceptualTwin hard-requires', () => {
  /**
   * `isPerceptualTwin`'s first line refuses any row with a null width or height, and nothing in
   * this family ever filled those columns. A promoted phantom without them is hashed, signed, and
   * still invisible to the ONLY pass that could ever match it.
   */
  it('ops an original whose dimensions were null at load and measured this run', () => {
    expect(
      buildFillDimensionOps([
        phantom({
          id: 'alive',
          measuredWidth: 576,
          measuredHeight: 1024,
          measuredBytes: 91_234,
        } as PhantomOver),
      ]),
    ).toEqual([{ op: 'fill-dimensions', id: 'alive', width: 576, height: 1024, bytes: 91_234 }])
  })

  it('carries a null bytes when the size was never measured — coalesce keeps the stored one', () => {
    expect(
      buildFillDimensionOps([
        phantom({ id: 'nosize', measuredWidth: 8, measuredHeight: 8 } as PhantomOver),
      ]),
    ).toEqual([{ op: 'fill-dimensions', id: 'nosize', width: 8, height: 8, bytes: null }])
  })

  it('never ops a row that already carried dimensions — a second run writes nothing', () => {
    expect(
      buildFillDimensionOps([
        row({ id: 'dimensioned', measuredWidth: 10, measuredHeight: 10 } as PhantomOver),
      ]),
    ).toEqual([])
  })

  it('never ops a row this run could not measure (the dead-blob phantom)', () => {
    expect(
      buildFillDimensionOps([
        phantom({ id: 'gone', hashFailed: true, fetchFailure: 'GET 404' } as PhantomOver),
      ]),
    ).toEqual([])
  })

  it('never ops a reference — a reference carries no measurements by design', () => {
    expect(
      buildFillDimensionOps([
        phantom({
          id: 'ref',
          sourceImageId: 'keeper1',
          measuredWidth: 576,
          measuredHeight: 1024,
        } as PhantomOver),
      ]),
    ).toEqual([])
  })

  it('refuses to write a measurement that is not a positive integer', () => {
    expect(() =>
      buildFillDimensionOps([
        phantom({ id: 'bad', measuredWidth: 0, measuredHeight: 1024 } as PhantomOver),
      ]),
    ).toThrow(/positive integers/)
    expect(() =>
      buildFillDimensionOps([
        phantom({ id: 'bad2', measuredWidth: 576.5, measuredHeight: 1024 } as PhantomOver),
      ]),
    ).toThrow(/positive integers/)
  })
})
```

Add `buildFillDimensionOps` and `classifyPhantomOriginals` to the file's existing import list from
`'@/scripts/nina-dedupe-plan.mjs'` (`:4-31`), keeping it alphabetical: `buildFillDimensionOps` goes
first in the list, `classifyPhantomOriginals` between `compareKeeperCandidates` and
`decodeStoredSignature`.

**Impact:** 12 new test cases. `sigOf` (`:436`) and `uniform16` (`:435`) are module-level consts
already in scope at the end of the file.

---

## Verification

**Worktree setup (required first — a fresh worktree has neither):**

```bash
cp /home/miftah/run-insights/.env.local /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix/.env.local
cd /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix && npm install
```

A `node_modules` **symlink** is not enough — it passes vitest and fails Turbopack. Install for real.

**Build:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix && npx next typegen && npx tsc --noEmit
```

(`scripts/*.mjs` is not in `tsconfig.json`'s `include` and `checkJs` is off, so the `.mjs` edits are
not type-checked; the test file's edits are.)

**Tests:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix && npm test
cd /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix && npx vitest run tests/nina.dedupeMedia.test.ts
```

**Lint/format:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix && npx prettier --check scripts/nina-dedupe-plan.mjs scripts/nina-dedupe-media.mjs tests/nina.dedupeMedia.test.ts && npx eslint scripts tests
```

**Manual check — the production dry run (READ-ONLY; `--apply` is forbidden here):**

```bash
cd /home/miftah/.worktrees/run-insights/nina-ghost-photo-dedup-fix && npm run nina:dedupe-media
```

Against production as measured 2026-09-16 this must print, among the existing lines:

```
db rows                      129
phantom originals            0 recovered / 0 partial / 1 unrecoverable
  ! Tdw_AkrJT0ks  nina/24076314-d36f-44f1-a50f-4acc660b5d7b/avatar-7pgf5f96AXK6-2AmKXN6tggUhc2nZLm5lIMzP0eHUB0.jpg
      GET 404 — UNRECOVERABLE: the object is gone, so no measurement of these
      bytes can ever be taken. Reported, never removed: deleting the row is a
      separate human decision this sweep does not make under any flag.
```

and **zero** `fill-dimensions` ops in the op summary (`orig_hashed_dims_null = 0` on production
today — the only dimensionless original is the unrecoverable one). `ETtycd0IgLMZ` and
`9uMGPIZBIWwR` must appear **only** in the pre-existing `hash filled` / `hash fetch failures`
lines, never under `phantom originals`. The run ends with
`DRY RUN — nothing written.` — confirm that line is present before believing the run was read-only.

**Exit criteria:**
- `npx tsc --noEmit` green and the full suite green.
- The production dry run reports `Tdw_AkrJT0ks` under **unrecoverable**, by id, with its reason,
  and miscategorises nothing — the two live reference rows are not in the census.
- No `--apply` run was made against production by this phase (the plan index's Scope section names
  this as a deliberate boundary).
- `buildFillDimensionOps` and `classifyPhantomOriginals` are unit-tested, which is the
  fixture-level demonstration that `--apply` would write the correct values.

---

## Handoffs

- **Deleting the unrecoverable ghost row.** `Tdw_AkrJT0ks` can never be measured: its bytes are
  gone. Whether to `DELETE` it (removing a permanently-broken tile from Media) is a human decision
  and is explicitly not implemented here, under any flag. The script's report is the input to that
  decision.
- **Running `--apply` against production.** Out of scope per the plan index. When it is run, note
  that the operator inherits the sweep's pre-existing merge/release behavior in the same invocation
  — read the dry run first.
- **Phase 1 (R1) owns** every app-layer change: `lib/nina/provenancePromotion.ts`, the new query
  functions in `lib/nina/queries/{avatars,images}.ts`, the five call-site rewirings, and the
  `isBlobPathnameReferenced` guard on the three avatar-delete blob deletes. This phase imports none
  of it and edits none of it.
- **`lib/nina/perceptualSign.ts`'s one-pipeline rule** (`:19-21`) says the sweep's `signBytes` and
  that module change in the same commit. Step 7 makes the sweep's signer *converge* onto what
  `perceptualSign.ts` already does (it already reads `img.metadata()` in the same `Promise.all`), so
  no edit to that file is required. If Phase 1 changes that module's resize pipeline, the reconciler
  must pair it with Step 7.
- **Not done, deliberately:** `nina-dedupe-media.mjs`'s `bytes metadata mismatches` line is still
  report-only; a stored size or dimension that contradicts the bytes is a separate finding class
  with no repair op. Adding a `dimension-repair` (the `perceptual-repair` shape, applied to
  `width`/`height`) is a plausible follow-up and is not in this phase.
- **Not done, deliberately:** no `README.md` / `docs/` prose update. The script header is this
  family's documentation surface and Step 11 updates it.

---

## Rollback

`git revert` the phase's commit, or `git checkout origin/main -- scripts/nina-dedupe-plan.mjs
scripts/nina-dedupe-media.mjs tests/nina.dedupeMedia.test.ts`. Three files, all additive; no
schema change, no migration, no `package.json` entry, no new file to delete.

If an `--apply` run has already written `fill-dimensions` values, those are the true pixel
dimensions and byte size of the row's own live object — measured, not inferred — so reverting the
code does not require reverting the data. If a specific row's values must be undone anyway, the
report named the ids and the columns:
`update nina_message_images set width = null, height = null where id = '<id>'`.
