# Phase 4: Backfill sweep — hash-fill + merging existing duplicates

**Plan set:** `MEDIA_DEDUPE_PLAN.md`
**Analysis:** `20260910-103604_code_analyzer.md`
**Satisfies:** R1, R2, R3 — the user-facing thing this phase serves: the duplicates ALREADY in
production (the two measured object-duplicate pairs) get hashed, merged, and their redundant
Blob objects released, so Media shows each photograph exactly once and the store stops paying for
identical bytes. Phases 2 and 3 stop NEW duplicates; this phase repairs the EXISTING ones.
**Depends on:** Phase 1 (the `content_hash` column must exist on `nina_message_images`)
**Difficulty:** NORMAL
**Package:** `scripts`

---

## Goal

A new operations script, `scripts/nina-dedupe-media.mjs`, sweeps production's `nina_message_images`:
pass 1 fills `content_hash` for every row by fetching each row's blob and hashing the bytes
(sha256 hex — the same semantics P1's column defines); pass 2 groups rows by `(user_id,
content_hash)`, elects a keeper among the originals of each multi-row group, repoints every loser
row to the keeper's `blob_url`/`pathname` + `source_image_id` (the F37 reference mechanism — rows
are never deleted), and releases each loser's now-unreferenced Blob object behind a re-implemented
`isBlobPathnameReferenced` gate. Dry-run by default; `--apply` writes; a second run reports zero
findings. Measured acceptance: the dry run must report exactly the two true object-duplicate
groups (kartu kedatangan `sbTuT8NKXL24`/`ywNnXvpnnKSi`; selfie `W-hhpnGxV0SI`/`1dMy2Zs5V1MJ`) and
three same-URL groups that need no storage action.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing — no symbol is deleted anywhere in the tree.
**Renames:** none.
**Creates:**
- `scripts/nina-dedupe-plan.mjs` (NEW, pure) — exports `parseArgs(argv)`, `sha256Hex(bytes)`,
  `isSha256Hex(value)`, `isStoreUrl(url)`, `isOriginalRow(row)`, `createdMs(row)`,
  `compareKeeperCandidates(a, b)`, `electKeeper(originals)`, `groupKeyOf(row)`,
  `partitionGroup(rows)`, `buildMergePlan(rows)`, `releaseDecision(counts)`.
- `scripts/nina-dedupe-media.mjs` (NEW, ops shell) — has a `main()` guarded so importing it from
  a test executes nothing (the `scripts/nina-profpic.mjs:580` guard pattern). Exports nothing
  beyond the guard; the pure logic it uses lives in the module above.
- `tests/nina.dedupeMedia.test.ts` (NEW) — imports `@/scripts/nina-dedupe-plan.mjs` and
  `@/lib/photos/contentHash` (P1's file, for one cross-implementation known-answer assertion).
- npm script `nina:dedupe-media` → `node --env-file=.env.local scripts/nina-dedupe-media.mjs`
  (`package.json`, new line after `blob:reap`).

**Signature changes:** none — no existing symbol changes.
**Requires (from earlier phases):**
- Phase 1: column `content_hash text NULL` exists on `nina_message_images`. This phase consumes
  the COLUMN only, via raw SQL (it cannot import `lib/db` — it is a `.mjs` script). The partial
  index is NOT required by this script (it loads all rows and groups in JS); nothing here depends
  on the index's name. `lib/photos/contentHash.ts` (P1) is imported only by the TEST, never by
  the script — the script hashes with its own `node:crypto` `sha256Hex`.
- **RECONCILED — P1 export name (was the one open symbol):** P1 landed `contentHashOf(input:
  Blob | ArrayBuffer | Uint8Array): Promise<string>` (64 lowercase hex). The test imports
  `import { contentHashOf } from '@/lib/photos/contentHash'` and passes its `Uint8Array` — the
  call works as-is, no adaptation needed. The `sha256Hex` name below is THIS phase's own
  `node:crypto` helper in `scripts/nina-dedupe-plan.mjs`, not P1's export; the two implementations
  coexist on purpose (P1's `crypto.subtle` because the browser computes there; this one because a
  script hashes whole buffers synchronously) and the test asserts they agree.
- Phase 2/3 (concurrent, not required): the sweep is correct whether or not the write-time paths
  have landed. If they have, write-time rows arrive already hashed; the fill pass skips them (its
  UPDATE guards `content_hash is null`) and the verify gate re-checks group members — a claimed
  hash that a fresh GET disagrees with is repaired, not trusted. **RECONCILED, both directions:**
  phase 2's REFERENCE rows deliberately arrive with `content_hash` NULL (its write path never
  stamps a client-claimed hash on a reference — index Decisions) — those are expected NULLs that
  pass 1 fills exactly like any historical row, never drift, and never a reason to "fix" phase 2.
  Phase 3's rows (originals AND references — its writer measured the bytes) arrive hashed and are
  skipped by the fill guard like phase 2's originals.

**Leaves alone (owned by others):** `lib/db/schema.ts`, `drizzle/` (Phase 1); `components/nina/
Composer.tsx`, `lib/nina/actions.ts`, `app/api/upload/route.ts` (Phase 2); `lib/nina/imagerun.ts`,
`scripts/nina-image-worker.ts`, `lib/admin/*` (Phase 3); the four reads that must not filter
(`listNinaMessageImages`, `getNinaMessageImage`, `getNinaMessageImagesForMessages`,
`isBlobPathnameReferenced`); `nina_avatars` rows and their blobs (the script COUNTS avatar
references in its release gate but never writes the avatar table); `shots/`, `run_photos`,
`extractions.blob_urls`; `scripts/blob-reap.mjs` (untouched — this script follows its pattern,
does not edit it).

**CLI contract of the new script:** `npm run nina:dedupe-media [-- --apply]`. No other flag.
Exit 0 = ran clean (findings in dry-run are NOT an error); 1 = an executed op failed; 2 =
pre-flight refusal (missing env, unknown flag, migration missing, or an empty `nina_message_images`
— the wrong-DATABASE_URL symptom `scripts/blob-reap.mjs:319` refuses; there is deliberately no
`--allow-empty-db` flag here because a sweep with nothing to sweep has nothing to argue for).

**Deliberate decisions this plan locks (each argued in place below):**
1. Pass 1 hashes ALL rows — originals AND references — not originals only.
2. Rows already carrying a hash are RE-VERIFIED, but only when they sit in a multi-row group.
3. Keeper is elected among ORIGINALS only; rows with `source_avatar_id` set are never repointed.
4. `node:crypto` `createHash`, not `crypto.subtle`.
5. `BLOB_READ_WRITE_TOKEN` is required only under `--apply`.

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-dedupe-plan.mjs` | create | NEW pure module: keeper election, group partitioning, merge-plan builder, release gate decision, sha256. No DB, no Blob, no env. |
| `scripts/nina-dedupe-media.mjs` | create | NEW ops script: pre-flight, load rows (raw SQL), pass-1 hash fill, verify gate, print plan, `--apply` executor. `blob-reap.mjs`'s pattern. |
| `package.json` | modify | one line: `"nina:dedupe-media": "node --env-file=.env.local scripts/nina-dedupe-media.mjs"` (after line 28, `blob:reap`) |
| `tests/nina.dedupeMedia.test.ts` | create | NEW vitest suite for every pure decision + the cross-implementation hash check. |

## Implementation Steps

### Step 1: `scripts/nina-dedupe-plan.mjs` — the pure half (NEW file, whole file)

**File:** `scripts/nina-dedupe-plan.mjs` (new)
**Change:** every decision that can be wrong without a network goes here, so `npm test` can hold
it. `scripts/blob-reap.mjs` keeps all of this inline and is untestable for it; that is the one
place this phase improves on the pattern (the repo precedent for "a script file a test imports"
is `scripts/capture/dataset.mjs` ← `tests/capture/dataset.test.ts`, and the same-file guard of
`scripts/nina-profpic.mjs:580`; a separate pure module is chosen over a guard inside the ops
script because the ops script's top level `createRequire`s `@vercel/blob` and `@neondatabase/
serverless`, and a test should not need either installed-and-initialized to check keeper
election).

Row contract for `buildMergePlan` (the shape the ops script builds from a raw SQL row):

```js
// {
//   id: string, userId: string, messageId: string | null, kind: 'upload' | 'generated',
//   blobUrl: string, pathname: string, bytes: number | null, description: string | null,
//   sourceAvatarId: string | null, sourceImageId: string | null,
//   contentHash: string,        // 64-hex — REQUIRED. The planner refuses rows without one.
//   verifiedHash: string | null, // what a FRESH GET of blob_url hashed to, or null if not re-fetched
//   hashFailed: boolean,         // the fresh GET failed → this row can never be trusted this run
// }
```

**Code:**

```js
/**
 * The pure half of `scripts/nina-dedupe-media.mjs`: how duplicates are grouped, which row keeps
 * the bytes, what gets repointed, and when a Blob object may be released. No database, no Blob
 * client, no env — every function here takes its inputs as arguments, which is what lets
 * `tests/nina.dedupeMedia.test.ts` hold the merge rules against the measured production groups
 * without touching production.
 *
 * The ops script (`.mjs`, same directory) builds rows from a raw SQL read, calls `buildMergePlan`,
 * and executes the returned ops in order. It owns every side effect; this file owns every
 * judgment.
 *
 * ── THE SEMANTICS OF `content_hash` (plan invariant 4) ────────────────────────────────────────
 * sha256 hex over the bytes the ROW names — per-row stored bytes, not the file the user picked.
 * A reference row names bytes too (it copied `blob_url`/`pathname` from its source), so hashing a
 * reference is not a category error: it is the same statement about a different row. Two rows
 * with equal hashes therefore always name equal bytes, which is the ONLY fact this script acts
 * on. It never infers "same photograph" from metadata, filename, or provenance.
 *
 * ── WHY HASHING REFERENCES IS REQUIRED, NOT JUST HONEST ───────────────────────────────────────
 * The measured production group `70a49180…` is an original (`W-hhpnGxV0SI`) plus a REFERENCE
 * (`1dMy2Zs5V1MJ`, `source_image_id` → the original) whose `blob_url` names a SECOND object with
 * identical bytes. A sweep that only hashed originals could not see that the reference's private
 * copy is redundant; it could only repoint the reference on faith that "a reference's URL holds
 * the source's bytes" — which is precisely the claim this row falsifies. The hash is what turns
 * "repoint it" from a guess into a measurement: group membership IS the proof that the
 * reference's divergent URL holds the keeper's bytes. So every row is hashed, and a row whose
 * bytes cannot be fetched is reported and excluded from every decision.
 */
import { createHash } from 'node:crypto'

/** `--apply` is the only flag. Anything else is a typo the operator wants to hear about. */
export function parseArgs(argv) {
  const unknown = argv.filter((a) => a !== '--apply')
  if (unknown.length > 0) {
    throw new Error(`unknown flag ${unknown[0]} — the only flag this script takes is --apply`)
  }
  return { apply: argv.includes('--apply') }
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/

/** Plan invariant 9's shape rule, re-stated for the script's own writes. */
export function isSha256Hex(value) {
  return typeof value === 'string' && SHA256_HEX_RE.test(value)
}

/**
 * `node:crypto`, not `crypto.subtle`: this script hashes whole buffers (the largest measured
 * object is 110 KB; nothing streams), `createHash` is synchronous so an update→digest pair cannot
 * interleave, and `lib/llm/factsHash.ts:48` is the repo's standing precedent for a content hash.
 * P1's `lib/photos/contentHash.ts` uses `crypto.subtle` because the BROWSER needs it to; the two
 * implementations agree by construction (same algorithm, same hex encoding), and
 * `tests/nina.dedupeMedia.test.ts` asserts the agreement on a known-answer vector rather than
 * trusting it.
 */
export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * A Blob object lives at `https://<store>.public.blob.vercel-storage.com/<pathname>`. The script
 * GETs these URLs plainly (they are public) and deletes them with `del(url, { token })`; this
 * check is what keeps a `del` pointed at anything that is not the store it was configured for.
 */
const STORE_URL_RE = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/./

export function isStoreUrl(url) {
  return typeof url === 'string' && STORE_URL_RE.test(url)
}

/** F37's predicate, verbatim: `isOriginalPhoto()` in `lib/nina/queries.ts:1812`. */
export function isOriginalRow(row) {
  return row.sourceAvatarId == null && row.sourceImageId == null
}

/** `created_at` arrives as a Date from neon (timestamptz); tests pass ISO strings. Both allowed. */
export function createdMs(row) {
  const t =
    row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime()
  if (!Number.isFinite(t)) throw new Error(`row ${row.id} carries an unreadable created_at`)
  return t
}

/**
 * Keeper election, as a total order so the winner never depends on input order.
 *   1. `message_id` NOT NULL wins — the photograph is anchored in the conversation, so hiding a
 *      loser that is NOT anchored (the measured `ywNnXvpnnKSi` case: `message_id` went NULL via
 *      SET NULL) can never blank a bubble.
 *   2. `description` NOT NULL wins — `glm-4.6v`'s prose already lives on it (an empty string is
 *      "not described", which is what NULL means).
 *   3. Oldest `created_at` wins — the first arrival is the canonical copy.
 *   4. `id` ascending — the same final tiebreak `getNinaMessageImagesForMessages` documents for
 *      rows written in one statement (`lib/nina/queries.ts:1757`), and the only step that makes
 *      the order total.
 * Returns < 0 when `a` is the better keeper. Pure and unit-testable by contract.
 *
 * RECONCILED — this is the SWEEP's election only. The write-time paths elect their attach target
 * with `findNinaImageByContentHash`'s rule instead (newest original — phase 1's finder, chosen
 * because the newest row is the least likely to be deleted between the read and the write). The
 * two answer different questions at different times (which row should a NEW write point at vs
 * which row should OWN bytes several rows already point at) and are deliberately not unified —
 * do not port this order into the finder or the finder's order into a future sweep.
 */
export function compareKeeperCandidates(a, b) {
  const aMessaged = a.messageId != null ? 1 : 0
  const bMessaged = b.messageId != null ? 1 : 0
  if (aMessaged !== bMessaged) return bMessaged - aMessaged

  const aDescribed = (a.description != null && a.description !== '') ? 1 : 0
  const bDescribed = (b.description != null && b.description !== '') ? 1 : 0
  if (aDescribed !== bDescribed) return bDescribed - aDescribed

  const byAge = createdMs(a) - createdMs(b)
  if (byAge !== 0) return byAge

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The single original of a group. Throws on an empty list — the caller partitions first. */
export function electKeeper(originals) {
  if (originals.length === 0) throw new Error('no original to elect a keeper from')
  let keeper = originals[0]
  for (const candidate of originals.slice(1)) {
    if (compareKeeperCandidates(candidate, keeper) < 0) keeper = candidate
  }
  return keeper
}

/** Plan invariant 5, as a function: the dedup key is (user_id, content_hash), never hash alone. */
export function groupKeyOf(row) {
  return `${row.userId}|${row.contentHash}`
}

/**
 * Provenance partition of one group. Three classes, with one rule each:
 *   - originals   → keeper candidates (and merge losers when they lose);
 *   - chatRefs    → `source_image_id` set — already references to a chat image; they may be
 *                   REPOINTED to the keeper when their `blob_url` diverges (the `1dMy2Zs5V1MJ`
 *                   measured case). Repointing keeps their provenance class intact.
 *   - avatarRefs  → `source_avatar_id` set — references into `nina_avatars`. NEVER repointed: a
 *                   repoint to a chat-image keeper would falsify provenance ("I am this album
 *                   face") for a storage saving no measured group needs. Reported only.
 */
export function partitionGroup(rows) {
  const originals = []
  const avatarRefs = []
  const chatRefs = []
  for (const row of rows) {
    if (row.sourceAvatarId != null) avatarRefs.push(row)
    else if (row.sourceImageId != null) chatRefs.push(row)
    else originals.push(row)
  }
  return { originals, avatarRefs, chatRefs }
}

/**
 * rows (+ hashes) → the ordered operation list. THE product of this module.
 *
 * Ops, in the exact order they are returned (and executed):
 *   { op: 'hash-repair', id, from, to }            — stored hash contradicted by a fresh GET:
 *                                                    write the measured value (plan invariant 4),
 *                                                    and the group is SKIPPED this run so the
 *                                                    next run regroups on honest keys.
 *   { op: 'merge-row', id, keeperId, blobUrl, pathname }
 *                                                  — ROW FIRST: repoint the loser to the
 *                                                    keeper's object and mark it a reference.
 *   { op: 'release-blob', userId, pathname, blobUrl, bytes }
 *                                                  — BLOB SECOND: release the loser's old object,
 *                                                    gated at execution time by `releaseDecision`
 *                                                    against live counts this module cannot know.
 * All of a group's `merge-row`s precede that group's `release-blob`s — two losers sharing one old
 * URL must BOTH have stopped naming it before the refCount is asked, or the first loser's gate
 * would see the second and keep shared bytes forever.
 *
 * A group is a finding when it needs a mutation: ≥2 originals, or a chatRef whose URL differs
 * from the keeper's. A group of one original + references that already share the keeper's URL is
 * reported as `tidy` and produces no ops — the three measured same-URL groups must land here, or
 * the sweep is not idempotent.
 *
 * THE VERIFY GATE: a multi-row group is only actionable when EVERY member is hash-verified this
 * run (`verifiedHash === contentHash`, no `hashFailed`). One unverified member skips the whole
 * group — a group is a claim about bytes, and one unproven byte breaks the claim.
 */
export function buildMergePlan(rows) {
  const byKey = new Map()
  for (const row of rows) {
    if (!isSha256Hex(row.contentHash)) {
      throw new Error(`row ${row.id} reached the planner without a 64-hex content_hash`)
    }
    const key = groupKeyOf(row)
    const members = byKey.get(key)
    if (members) members.push(row)
    else byKey.set(key, [row])
  }

  const multi = [...byKey.values()].filter((m) => m.length > 1)
  multi.sort((a, b) => groupKeyOf(a[0]).localeCompare(groupKeyOf(b[0])))

  const repairs = []
  const groups = []
  const mutations = []

  for (const members of multi) {
    const head = members[0]
    /* The verify gate, stated as its two failure classes: a stored hash a fresh GET contradicted
     * (drift — repair it, and do not act on the group this run), and a member nobody measured
     * (failed GET, or never re-verified). Either one makes the group's shared claim unproven. */
    const stale = members.filter(
      (m) => !m.hashFailed && m.verifiedHash != null && m.verifiedHash !== m.contentHash,
    )
    const unverified = members.filter((m) => m.hashFailed || m.verifiedHash == null)

    if (stale.length > 0 || unverified.length > 0) {
      for (const row of stale) {
        repairs.push({ op: 'hash-repair', id: row.id, from: row.contentHash, to: row.verifiedHash })
      }
      const reason =
        stale.length > 0
          ? `hash drift on ${stale.map((m) => m.id).join(', ')} — repaired, regrouped next run`
          : `unverified bytes on ${unverified.map((m) => m.id).join(', ')}`
      groups.push({
        userId: head.userId,
        contentHash: head.contentHash,
        action: 'skipped',
        reason,
        ids: members.map((m) => m.id),
      })
      continue
    }

    const { originals, avatarRefs, chatRefs } = partitionGroup(members)
    if (originals.length === 0) {
      groups.push({
        userId: head.userId,
        contentHash: head.contentHash,
        action: 'skipped',
        reason: 'no original in the group — a reference is never elected keeper',
        ids: members.map((m) => m.id),
      })
      continue
    }

    const keeper = electKeeper(originals)
    const losers = [
      ...originals.filter((row) => row.id !== keeper.id),
      ...chatRefs.filter((row) => row.blobUrl !== keeper.blobUrl),
    ]
    const released = []
    for (const loser of losers) {
      mutations.push({
        op: 'merge-row',
        id: loser.id,
        keeperId: keeper.id,
        blobUrl: keeper.blobUrl,
        pathname: keeper.pathname,
      })
      if (!released.some((r) => r.pathname === loser.pathname && r.blobUrl === loser.blobUrl)) {
        released.push({ pathname: loser.pathname, blobUrl: loser.blobUrl, bytes: loser.bytes })
      }
    }
    for (const r of released) {
      mutations.push({ op: 'release-blob', userId: keeper.userId, ...r })
    }
    groups.push({
      userId: head.userId,
      contentHash: head.contentHash,
      action: losers.length > 0 ? 'merge' : 'tidy',
      keeperId: keeper.id,
      loserIds: losers.map((l) => l.id),
      releaseCount: released.length,
      avatarRefIds: avatarRefs.map((a) => a.id),
      ids: members.map((m) => m.id),
    })
  }

  return { ops: [...repairs, ...mutations], groups }
}

/**
 * The release gate, as a pure decision over live counts the ops script measures AFTER the group's
 * rows have been repointed. Counts are numbers; `null` means "the query could not answer" —
 * which must never mean "no references". Every non-zero count keeps the object; the reason is
 * reported so the operator knows which reference site to look at.
 *
 *   imageRefs — rows in `nina_message_images(user_id)` naming the pathname or the URL
 *   avatarRefs — rows in `nina_avatars(user_id)` naming the pathname, thumb pathname, URL or
 *                thumb URL (the rail: an avatar match alone refuses the delete)
 *   jsonbRefs — `nina_turns.args` / `nina_memory_slots.value` mention either name (the reaper's
 *               defensive sweep, `scripts/blob-reap.mjs:204-231`, applied per-release)
 */
export function releaseDecision(counts) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const imageRefs = n(counts.imageRefs)
  const avatarRefs = n(counts.avatarRefs)
  const jsonbRefs = n(counts.jsonbRefs)
  if (imageRefs == null || avatarRefs == null || jsonbRefs == null) return 'kept-unknown'
  if (avatarRefs > 0) return 'kept-avatar'
  if (jsonbRefs > 0) return 'kept-jsonb'
  if (imageRefs > 0) return 'kept-shared'
  return 'released'
}
```

**Impact:** new file only; nothing imports it yet except the Step 2 script and the Step 4 test.
No lint/type risk (`allowJs: true` in `tsconfig.json` is what lets the `.ts` test import it —
the same door `tests/nina.profpic.test.ts:16` already uses).

### Step 2: `scripts/nina-dedupe-media.mjs` — the ops shell (NEW file, whole file)

**File:** `scripts/nina-dedupe-media.mjs` (new)
**Change:** `scripts/blob-reap.mjs`'s established pattern exactly — `createRequire` for
`@neondatabase/serverless`'s `neon` and `@vercel/blob`'s `del`, `--env-file=.env.local`, dry-run
by default, every mutation printed before it executes, a structured summary, exit codes that
mean something. It cannot import `lib/db` or `lib/nina` (`.mjs`, and those modules are
`server-only`/alias-bound), so the reference gate re-implements `isBlobPathnameReferenced`
(`lib/nina/queries.ts:2073`) in raw SQL over the same six columns, and the missing-migration
error is named (the `scripts/nina-profpic.mjs` precedent for reporting 42P01).

**Code:**

```js
#!/usr/bin/env node
/**
 * Backfill sweep for Nina's Media collection: fill `content_hash` for every row that lacks it,
 * then merge the duplicates that are ALREADY in production.
 *
 *   npm run nina:dedupe-media                 # dry run, always — reads production, writes nothing
 *   npm run nina:dedupe-media -- --apply      # writes: hash fills, row repoints, blob releases
 *
 * NOT A TEST, and never part of `npm test`: it reads the real Blob store through the rows' public
 * URLs and, with `--apply`, it repoints rows and DESTROYS Blob objects. Same line
 * `scripts/blob-reap.mjs` and `scripts/nina-profpic.mjs` draw.
 *
 * DATABASE_URL IS PRODUCTION. There is one database in this repo (`.env.local`'s DATABASE_URL is
 * the instance production reads); every number in this run is a production number and every
 * `--apply` write is a production write. Read the dry run before applying. Always.
 *
 * ── WHAT IT DOES, IN ORDER ────────────────────────────────────────────────────────────────────
 *  1. pre-flight: args, env, migration presence, non-empty table
 *  2. load every row of `nina_message_images` (raw SQL — this script cannot import `lib/db`)
 *  3. PASS 1 (hash-fill): GET each row's public blob URL, sha256 the bytes, `UPDATE content_hash`
 *     for rows whose column is NULL. All rows are hashed — originals AND references — because the
 *     merge's safety argument needs the reference's own bytes measured (see
 *     `scripts/nina-dedupe-plan.mjs`'s header). Rows whose GET fails: skipped and reported,
 *     never guessed.
 *  3b. VERIFY GATE: every member of a multi-row group that did NOT just get filled is re-fetched
 *      and re-hashed. A stored hash a fresh GET contradicts is a `hash-repair` op plus a skipped
 *      group. `scripts/nina-dedupe-media.mjs` trusts a hash it did not just measure for nothing.
 *  4. PASS 2 (merge): `buildMergePlan` groups by (user_id, content_hash), elects keepers among
 *      originals, and returns the ordered ops.
 *  5. report — every op printed. DRY RUN STOPS HERE.
 *  6. `--apply` executes ops in order; each `release-blob` re-asks the live reference gate first
 *      (ROW FIRST, BLOB SECOND — the group's rows are already repointed by the time the gate
 *      runs) and deletes only at zero references.
 *
 * ── WHY THE REFERENCE GATE IS RE-IMPLEMENTED IN SQL ───────────────────────────────────────────
 * `isBlobPathnameReferenced` (`lib/nina/queries.ts:2073`) is the one reference-checked delete in
 * the app, but it lives behind `server-only`/alias imports a `.mjs` script cannot reach. The
 * mirror below counts ROWS over the same six columns the reaper counts
 * (`nina_message_images.pathname/blob_url`, `nina_avatars.pathname/blob_url/thumb_pathname/
 * thumb_url`), user-scoped, plus the reaper's jsonb sweep applied to exactly the two names this
 * run is about to release. An error anywhere in that query counts as UNKNOWN, and UNKNOWN keeps
 * the object — the same err-toward-keep `releaseBlobIfUnreferenced` argues
 * (`lib/nina/blobRelease.ts:53`).
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────────────────────────
 * A second run: pass 1 finds nothing to fill (its UPDATE guards `content_hash is null`), the
 * previously-merged groups are now one-original-plus-same-URL-references = `tidy` (no ops), and
 * releases only exist for rows that were merged this run. Summary says 0 findings, 0 writes.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import {
  buildMergePlan,
  isOriginalRow,
  isStoreUrl,
  parseArgs,
  releaseDecision,
  sha256Hex,
} from './nina-dedupe-plan.mjs'

const require = createRequire(import.meta.url)
const { del } = require('@vercel/blob')
const { neon } = require('@neondatabase/serverless')

const kb = (n) => (n == null ? '?' : `${(n / 1000).toFixed(1)} KB`)

async function main() {
  /* ── 1. pre-flight ─────────────────────────────────────────────────────────────────────────── */
  const { apply } = parseArgs(process.argv.slice(2))

  if (!process.env.DATABASE_URL) {
    console.error('needs DATABASE_URL — run with --env-file=.env.local')
    process.exit(2)
  }
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('--apply needs BLOB_READ_WRITE_TOKEN (only `del` uses it; a dry run does not)')
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)
  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    await sql`select content_hash from nina_message_images limit 1`
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703' || /column.*content_hash/i.test(error.message)) {
      console.error(
        'nina_message_images.content_hash is missing — phase 1 of media-dedupe (migration 0018)',
      )
      console.error('has not been applied to THIS database. Run its migration first.')
      process.exit(2)
    }
    throw error
  }

  /* ── 2. load every row ─────────────────────────────────────────────────────────────────────── */
  const raw = await sql`
    select id, user_id, message_id, kind, blob_url, pathname, bytes, width, height,
           description, prompt, source_avatar_id, source_image_id, sort_order,
           created_at, content_hash
    from nina_message_images
    order by user_id, created_at, id
  `
  if (raw.length === 0) {
    console.error(
      'nina_message_images holds 0 rows. That is what a DATABASE_URL pointed at the wrong',
    )
    console.error('Neon branch looks like — the same refusal scripts/blob-reap.mjs makes. Refusing.')
    process.exit(2)
  }
  const rows = raw.map((r) => ({
    id: r.id,
    userId: r.user_id,
    messageId: r.message_id,
    kind: r.kind,
    blobUrl: r.blob_url,
    pathname: r.pathname,
    bytes: r.bytes,
    description: r.description,
    sourceAvatarId: r.source_avatar_id,
    sourceImageId: r.source_image_id,
    contentHash: r.content_hash,
    verifiedHash: null,
    hashFailed: false,
  }))
  const rowById = new Map(rows.map((r) => [r.id, r]))

  /* ── 3. PASS 1 — hash-fill ─────────────────────────────────────────────────────────────────── */
  const fills = []
  const failed = []
  for (const row of rows) {
    if (row.contentHash != null) continue
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.contentHash = got.hash
    row.verifiedHash = got.hash // measured this run — no re-fetch needed for the verify gate
    row.bytesMismatch = row.bytes != null && got.size !== row.bytes
    fills.push({ id: row.id, hash: got.hash })
  }

  /* ── 3b. VERIFY GATE — re-hash every stored hash that sits in a multi-row group ────────────── */
  const storedCount = rows.filter((r) => r.contentHash != null && r.verifiedHash == null).length
  const groupCounts = new Map()
  for (const r of rows) {
    if (r.contentHash == null) continue
    const key = `${r.userId}|${r.contentHash}`
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1)
  }
  for (const row of rows) {
    if (row.contentHash == null || row.verifiedHash != null) continue // just filled, or already failed
    if ((groupCounts.get(`${row.userId}|${row.contentHash}`) ?? 0) < 2) continue // cannot be a finding
    const got = await fetchRowBytes(row)
    if (!got.ok) {
      row.hashFailed = true
      failed.push({ id: row.id, reason: got.reason })
      continue
    }
    row.verifiedHash = got.hash
    if (got.hash !== row.contentHash) row.staleHash = true
  }

  /* ── 4. PASS 2 — the merge plan ────────────────────────────────────────────────────────────── */
  const plannable = rows.filter((r) => r.contentHash != null)
  const plan = buildMergePlan(plannable)
  const findings = plan.groups.filter((g) => g.action === 'merge')
  const tidy = plan.groups.filter((g) => g.action === 'tidy')
  const skipped = plan.groups.filter((g) => g.action === 'skipped')

  /* ── 5. report ─────────────────────────────────────────────────────────────────────────────── */
  const mismatchedIds = rows.filter((r) => r.bytesMismatch).map((r) => r.id)
  console.log(`nina dedupe — media          ${apply ? 'APPLY' : 'dry run'}`)
  console.log(`db rows                      ${rows.length}`)
  console.log(`hash filled                  ${fills.length}   (content_hash was null)`)
  console.log(`stored hashes re-verified    ${storedCount}`)
  console.log(`hash fetch failures          ${failed.length}${failed.length ? '  ← groups containing these are SKIPPED' : ''}`)
  for (const f of failed) console.log(`  ! ${f.id}  ${f.reason}`)
  if (mismatchedIds.length > 0) {
    console.log(`bytes metadata mismatches    ${mismatchedIds.length}  (reported only: ${mismatchedIds.join(', ')})`)
  }
  console.log(
    `groups                       ${findings.length} finding(s) / ${tidy.length} tidy / ${skipped.length} skipped`,
  )

  for (const g of findings) {
    const keeper = rowById.get(g.keeperId)
    console.log('')
    console.log(
      `FINDING ${g.contentHash.slice(0, 16)}…  ${g.ids.length} rows  keeper ${g.keeperId}`,
    )
    console.log(
      `  keeper   ${keeper.pathname}  message=${keeper.messageId ?? 'null'} ${
        keeper.description ? 'described' : 'undescribed'
      }  ${kb(keeper.bytes)}`,
    )
    for (const loserId of g.loserIds) {
      const loser = rowById.get(loserId)
      console.log(
        `  loser    ${loser.pathname}  message=${loser.messageId ?? 'null'} ${
          isOriginalRow(loser) ? 'original' : 'reference'
        }  ${kb(loser.bytes)}`,
      )
      console.log(
        `    → merge-row  ${loser.id}: blob_url/pathname → keeper, source_image_id = ${g.keeperId}`,
      )
      console.log(`    → release    ${loser.pathname} (${kb(loser.bytes)}) if live refs = 0`)
    }
  }
  for (const g of tidy) {
    console.log(`tidy    ${g.contentHash.slice(0, 16)}…  ${g.ids.length} rows share one object — no action`)
  }
  for (const g of skipped) {
    console.log(`skipped ${g.contentHash.slice(0, 16)}…  ${g.ids.length} rows — ${g.reason}`)
  }

  console.log('')
  for (const op of plan.ops) {
    if (op.op === 'hash-repair') console.log(`UPDATE nina_message_images SET content_hash = '${op.to}' WHERE id = '${op.id}'  (was '${op.from}')`)
    if (op.op === 'merge-row') console.log(`UPDATE nina_message_images SET blob_url = '${op.blobUrl}', pathname = '${op.pathname}', source_image_id = '${op.keeperId}' WHERE id = '${op.id}'`)
    if (op.op === 'release-blob') console.log(`del ${op.blobUrl}  (${op.pathname}, ${kb(op.bytes)}) — only if the live gate says 0 references`)
  }
  const counts = plan.ops.reduce((acc, op) => ((acc[op.op] = (acc[op.op] ?? 0) + 1), acc), {})
  console.log('')
  if (!apply) {
    console.log(
      `DRY RUN — nothing written. ${plan.ops.length} op(s) ` +
        `(${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}). Re-run with --apply.`,
    )
    process.exit(0)
  }

  /* ── 6. execute ────────────────────────────────────────────────────────────────────────────── */
  let done = 0
  let errored = 0
  for (const op of plan.ops) {
    try {
      if (op.op === 'hash-repair') {
        await sql`update nina_message_images set content_hash = ${op.to} where id = ${op.id}`
      } else if (op.op === 'merge-row') {
        await sql`
          update nina_message_images
             set blob_url = ${op.blobUrl}, pathname = ${op.pathname}, source_image_id = ${op.keeperId}
           where id = ${op.id}
        `
      } else if (op.op === 'release-blob') {
        if (!isStoreUrl(op.blobUrl)) throw new Error(`refusing to release a non-store URL: ${op.blobUrl}`)
        const gate = await sql`
          select
            (select count(*)::int from nina_message_images
              where user_id = ${op.userId}
                and (pathname = ${op.pathname} or blob_url = ${op.blobUrl})) as image_refs,
            (select count(*)::int from nina_avatars
              where user_id = ${op.userId}
                and (pathname = ${op.pathname} or thumb_pathname = ${op.pathname}
                     or blob_url = ${op.blobUrl} or thumb_url = ${op.blobUrl})) as avatar_refs,
            ((select count(*) from nina_turns
               where args is not null
                 and (args::text like ${`%${op.pathname}%`} or args::text like ${`%${op.blobUrl}%`}))
             + (select count(*) from nina_memory_slots
                 where value is not null
                   and (value::text like ${`%${op.pathname}%`} or value::text like ${`%${op.blobUrl}%`})))::int
              as jsonb_refs
        `
        const counts_ = gate[0] ?? {}
        const verdict = releaseDecision({
          imageRefs: counts_.image_refs,
          avatarRefs: counts_.avatar_refs,
          jsonbRefs: counts_.jsonb_refs,
        })
        if (verdict !== 'released') {
          console.log(`kept (${verdict}) ${op.pathname}`)
          continue
        }
        await del(op.blobUrl, { token })
      } else {
        throw new Error(`unknown op ${op.op}`)
      }
      done++
    } catch (error) {
      errored++
      console.error(`FAILED ${op.op} ${op.id ?? op.pathname}:`, error.message)
    }
  }
  console.log(`DONE. ${done} of ${plan.ops.length} op(s) applied.` +
    (errored ? ` ${errored} FAILED — re-run to retry; rows are never harmed by a retry.` : ''))
  process.exit(errored > 0 ? 1 : 0)
}

/** GET a row's public blob URL. The store is public; no token, no SDK. Never guess on failure. */
async function fetchRowBytes(row) {
  if (!isStoreUrl(row.blobUrl)) return { ok: false, reason: `not a store URL: ${row.blobUrl}` }
  try {
    const res = await fetch(row.blobUrl)
    if (!res.ok) return { ok: false, reason: `GET ${res.status}` }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { ok: true, hash: sha256Hex(bytes), size: bytes.byteLength }
  } catch (error) {
    return { ok: false, reason: `GET failed: ${error.message}` }
  }
}

/* Run only as the process entry point, so `tests/nina.dedupeMedia.test.ts` can import the pure
 * module without executing any of this. `scripts/nina-profpic.mjs:580` is the precedent. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
```

**Impact:** new file only. Never part of `npm test` (the vitest `include` is
`tests/**/*.test.ts`, `lib/**`, `app/**` — `scripts/` is outside it). Production is touched only
under `--apply`.

### Step 3: `package.json` — the npm script

**File:** `package.json:28` (insert one line after the `blob:reap` line, mirroring its pattern —
no `--experimental-strip-types`, because the entry is `.mjs` and its only import is a `.mjs`)
**Change:**

```json
    "blob:reap": "node --env-file=.env.local scripts/blob-reap.mjs",
    "nina:dedupe-media": "node --env-file=.env.local scripts/nina-dedupe-media.mjs",
```

**Impact:** none at build/test time. This is the only invocation path documented.

### Step 4: `tests/nina.dedupeMedia.test.ts` — the pure decisions under test (NEW file, whole file)

**File:** `tests/nina.dedupeMedia.test.ts` (new)
**Change:** vitest picks it up via `tests/**/*.test.ts` in `vitest.config.ts`. It imports the
pure module and P1's `lib/photos/contentHash` for one cross-implementation assertion. No test
touches the network: `DATABASE_URL` from `tests/support/setup.ts` is a dummy and never read
here, because the test never imports the ops script's `main`.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { contentHashOf } from '@/lib/photos/contentHash'
import {
  buildMergePlan,
  compareKeeperCandidates,
  electKeeper,
  groupKeyOf,
  isOriginalRow,
  isSha256Hex,
  isStoreUrl,
  parseArgs,
  partitionGroup,
  releaseDecision,
  sha256Hex,
} from '@/scripts/nina-dedupe-plan.mjs'

/**
 * The pure half of `scripts/nina-dedupe-media.mjs`. The script's own I/O — GETting blobs,
 * writing production, deleting Blob objects — is prod-only by construction and is covered by the
 * phase plan's Verification section (a dry run against production, then a post-apply query set),
 * exactly as `tests/nina.profpic.test.ts:18-23` argues for its script.
 *
 * The merge fixtures are the two measured production groups (`20260910-103604_code_analyzer.md`,
 * "Measured Evidence"), shrunk to their load-bearing fields. If the keeper for the kartu
 * kedatangan pair ever stops being `sbTuT8NKXL24`, the sweep's output on production has changed
 * meaning — that is what these tests are for.
 */

const USER = 'e6f1a0c2-1111-4222-8333-444455556666'
const H_KARTU = 'a'.repeat(64)
const H_SELFIE = 'b'.repeat(64)
const H_TIDY = 'c'.repeat(64)

type Row = Parameters<typeof buildMergePlan>[0][number]

/** A minimal verified original; tests override the fields that matter. */
const row = (over: Partial<Row> & Pick<Row, 'id'>): Row => ({
  userId: USER,
  messageId: null,
  kind: 'upload',
  blobUrl: `https://store.public.blob.vercel-storage.com/nina/${USER}/chat/${over.id}.jpg`,
  pathname: `nina/${USER}/chat/${over.id}.jpg`,
  bytes: 1000,
  description: null,
  sourceAvatarId: null,
  sourceImageId: null,
  createdAt: '2026-09-09T02:00:00Z',
  contentHash: H_KARTU,
  verifiedHash: H_KARTU,
  hashFailed: false,
  ...over,
})

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs([])).toEqual({ apply: false })
  })
  it('reads --apply', () => {
    expect(parseArgs(['--apply']).apply).toBe(true)
  })
  it('refuses any other flag', () => {
    expect(() => parseArgs(['--delete'])).toThrow(/unknown flag --delete/)
    expect(() => parseArgs(['--apply', '--force'])).toThrow(/unknown flag --force/)
  })
})

describe('sha256Hex', () => {
  it('answers the FIPS 180-4 vector', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
  it('agrees with phase 1s browser-side crypto.subtle implementation', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 250, 251, 252, 253, 254, 255])
    expect(sha256Hex(bytes)).toBe(await contentHashOf(bytes))
  })
})

describe('isSha256Hex / isStoreUrl / isOriginalRow', () => {
  it('accepts only 64 lowercase hex', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true)
    expect(isSha256Hex('A'.repeat(64))).toBe(false)
    expect(isSha256Hex('a'.repeat(63))).toBe(false)
    expect(isSha256Hex(null)).toBe(false)
  })
  it('accepts only public blob store URLs', () => {
    expect(isStoreUrl('https://abc123.public.blob.vercel-storage.com/nina/u/chat/x.jpg')).toBe(true)
    expect(isStoreUrl('http://abc123.public.blob.vercel-storage.com/x.jpg')).toBe(false)
    expect(isStoreUrl('https://evil.example.com/x.jpg')).toBe(false)
    expect(isStoreUrl(undefined)).toBe(false)
  })
  it('defines original as both provenance columns null', () => {
    expect(isOriginalRow(row({ id: 'r1' }))).toBe(true)
    expect(isOriginalRow(row({ id: 'r2', sourceImageId: 'k' }))).toBe(false)
    expect(isOriginalRow(row({ id: 'r3', sourceAvatarId: 'a' }))).toBe(false)
  })
})

describe('keeper election', () => {
  it('prefers a message-anchored row over an older undescribed orphan (the measured kartu pair)', () => {
    const keeper = row({ id: 'sbTuT8NKXL24', messageId: 'VNu9upqvtK5X', description: 'kartu', createdAt: '2026-09-10T02:00:00Z' })
    const loser = row({ id: 'ywNnXvpnnKSi', createdAt: '2026-09-09T02:00:00Z' })
    expect(compareKeeperCandidates(keeper, loser)).toBeLessThan(0)
    expect(electKeeper([loser, keeper]).id).toBe('sbTuT8NKXL24')
  })
  it('prefers a described row when neither has a message', () => {
    const a = row({ id: 'aaa', description: 'seen', createdAt: '2026-09-10T02:00:00Z' })
    const b = row({ id: 'bbb', createdAt: '2026-09-09T02:00:00Z' })
    expect(electKeeper([b, a]).id).toBe('aaa')
  })
  it('treats an empty description as undescribed', () => {
    const a = row({ id: 'aaa', description: '', createdAt: '2026-09-10T02:00:00Z' })
    const b = row({ id: 'bbb', createdAt: '2026-09-09T02:00:00Z' })
    expect(electKeeper([a, b]).id).toBe('bbb')
  })
  it('breaks metadata ties by oldest created_at', () => {
    const older = row({ id: 'zzz', createdAt: '2026-09-07T02:00:00Z' })
    const newer = row({ id: 'aaa', createdAt: '2026-09-10T02:00:00Z' })
    expect(electKeeper([newer, older]).id).toBe('zzz')
  })
  it('breaks a full tie by id ascending, so the order is total', () => {
    const a = row({ id: 'aaa', createdAt: '2026-09-09T02:00:00Z' })
    const z = row({ id: 'zzz', createdAt: '2026-09-09T02:00:00Z' })
    expect(electKeeper([z, a]).id).toBe('aaa')
    expect(electKeeper([a, z]).id).toBe('aaa')
  })
  it('is order-independent over a larger field', () => {
    const field = [
      row({ id: 'm1', messageId: 'x' }),
      row({ id: 'm2', messageId: 'y', description: 'd' }),
      row({ id: 'r3', createdAt: '2026-09-01T00:00:00Z' }),
      row({ id: 'r4', description: 'd' }),
    ]
    expect(electKeeper(field).id).toBe('m2')
    expect(electKeeper([...field].reverse()).id).toBe('m2')
  })
  it('refuses an empty candidate list', () => {
    expect(() => electKeeper([])).toThrow(/no original/)
  })
})

describe('buildMergePlan — the measured production groups', () => {
  it('merges the kartu kedatangan pair: repoint the loser, release its object, keeper untouched', () => {
    const keeper = row({ id: 'sbTuT8NKXL24', messageId: 'VNu9upqvtK5X', description: 'kartu kedatangan', createdAt: '2026-09-10T02:00:00Z', bytes: 66_823 })
    const loser = row({ id: 'ywNnXvpnnKSi', createdAt: '2026-09-09T02:00:00Z', bytes: 66_823 })
    const plan = buildMergePlan([loser, keeper])
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({ action: 'merge', keeperId: 'sbTuT8NKXL24', loserIds: ['ywNnXvpnnKSi'] })
    expect(plan.ops).toEqual([
      { op: 'merge-row', id: 'ywNnXvpnnKSi', keeperId: 'sbTuT8NKXL24', blobUrl: keeper.blobUrl, pathname: keeper.pathname },
      { op: 'release-blob', userId: USER, pathname: loser.pathname, blobUrl: loser.blobUrl, bytes: 66_823 },
    ])
  })

  it('repoints the measured selfie reference whose URL diverges from its keeper (1dMy2Zs5V1MJ)', () => {
    const original = row({ id: 'W-hhpnGxV0SI', kind: 'generated', createdAt: '2026-09-07T02:00:00Z', bytes: 110_068, contentHash: H_SELFIE, verifiedHash: H_SELFIE, blobUrl: 'https://s.public.blob.vercel-storage.com/nina/u/chat/W-hhpnGxV0SI.png', pathname: 'nina/u/chat/W-hhpnGxV0SI.png' })
    const ref = row({ id: '1dMy2Zs5V1MJ', kind: 'generated', createdAt: '2026-09-09T02:00:00Z', bytes: 110_068, sourceImageId: 'W-hhpnGxV0SI', contentHash: H_SELFIE, verifiedHash: H_SELFIE, blobUrl: 'https://s.public.blob.vercel-storage.com/nina/u/chat/1dMy2Zs5V1MJ.png', pathname: 'nina/u/chat/1dMy2Zs5V1MJ.png' })
    const plan = buildMergePlan([ref, original])
    expect(plan.groups[0]).toMatchObject({ action: 'merge', keeperId: 'W-hhpnGxV0SI', loserIds: ['1dMy2Zs5V1MJ'] })
    expect(plan.ops).toEqual([
      { op: 'merge-row', id: '1dMy2Zs5V1MJ', keeperId: 'W-hhpnGxV0SI', blobUrl: original.blobUrl, pathname: original.pathname },
      { op: 'release-blob', userId: USER, pathname: ref.pathname, blobUrl: ref.blobUrl, bytes: 110_068 },
    ])
  })

  it('leaves the three same-URL groups untouched — the idempotence shape', () => {
    const original = row({ id: 'kCeZri0edZ0n', createdAt: '2026-09-05T02:00:00Z', contentHash: H_TIDY, verifiedHash: H_TIDY })
    const ref = row({ id: 'aTZIezVAGhIU', createdAt: '2026-09-06T02:00:00Z', sourceImageId: 'kCeZri0edZ0n', contentHash: H_TIDY, verifiedHash: H_TIDY, blobUrl: original.blobUrl, pathname: original.pathname })
    const plan = buildMergePlan([original, ref])
    expect(plan.groups[0]).toMatchObject({ action: 'tidy', keeperId: 'kCeZri0edZ0n' })
    expect(plan.ops).toEqual([])
  })

  it('never repoints an avatar reference; reports it instead', () => {
    const original = row({ id: 'orig1', contentHash: H_TIDY, verifiedHash: H_TIDY })
    const avatarRef = row({ id: 'avref1', sourceAvatarId: 'avatar1', contentHash: H_TIDY, verifiedHash: H_TIDY, blobUrl: 'https://s.public.blob.vercel-storage.com/other.png', pathname: 'nina/u/chat/other.png' })
    const plan = buildMergePlan([original, avatarRef])
    expect(partitionGroup([original, avatarRef]).avatarRefs.map((r) => r.id)).toEqual(['avref1'])
    expect(plan.groups[0]).toMatchObject({ action: 'tidy', keeperId: 'orig1', avatarRefIds: ['avref1'] })
    expect(plan.ops).toEqual([])
  })

  it('skips a group when any member is unverified, and repairs a drifted hash instead of trusting it', () => {
    const keeper = row({ id: 'k1', messageId: 'm1' })
    const drifted = row({ id: 'd1', verifiedHash: 'f'.repeat(64) })
    const plan = buildMergePlan([keeper, drifted])
    expect(plan.groups[0]).toMatchObject({ action: 'skipped' })
    expect(plan.ops).toEqual([
      { op: 'hash-repair', id: 'd1', from: H_KARTU, to: 'f'.repeat(64) },
    ])
    expect(plan.groups[0].ids).toContain('k1')
  })

  it('skips a group when any member GET failed — never merge on unproven bytes', () => {
    const keeper = row({ id: 'k1' })
    const broken = row({ id: 'b1', hashFailed: true, verifiedHash: null })
    const plan = buildMergePlan([keeper, broken])
    expect(plan.groups[0]).toMatchObject({ action: 'skipped' })
    expect(plan.ops).toEqual([])
  })

  it('skips a group with no original — a reference is never elected keeper', () => {
    const refs = [
      row({ id: 'r1', sourceImageId: 'gone', contentHash: H_SELFIE, verifiedHash: H_SELFIE }),
      row({ id: 'r2', sourceImageId: 'gone', contentHash: H_SELFIE, verifiedHash: H_SELFIE }),
    ]
    const plan = buildMergePlan(refs)
    expect(plan.groups[0]).toMatchObject({ action: 'skipped' })
    expect(plan.ops).toEqual([])
  })

  it('emits one release per distinct old URL even when two losers shared it', () => {
    const keeper = row({ id: 'k1', messageId: 'm1' })
    const shared = 'https://s.public.blob.vercel-storage.com/nina/u/chat/twin.jpg'
    const l1 = row({ id: 'l1', blobUrl: shared, pathname: 'nina/u/chat/twin.jpg' })
    const l2 = row({ id: 'l2', blobUrl: shared, pathname: 'nina/u/chat/twin.jpg' })
    const plan = buildMergePlan([keeper, l1, l2])
    expect(plan.ops.filter((o) => o.op === 'merge-row')).toHaveLength(2)
    expect(plan.ops.filter((o) => o.op === 'release-blob')).toHaveLength(1)
    expect(plan.ops.indexOf(plan.ops.find((o) => o.op === 'release-blob'))).toBeGreaterThan(
      plan.ops.lastIndexOf(plan.ops.find((o) => o.op === 'merge-row')),
    )
  })

  it('scopes groups by user — identical bytes across users never merge (invariant 5)', () => {
    const other = row({ id: 'o1', userId: '00000000-0000-4000-8000-000000000000' })
    const mine = row({ id: 'm1' })
    const plan = buildMergePlan([other, mine])
    expect(plan.groups).toHaveLength(0)
    expect(plan.ops).toEqual([])
    expect(groupKeyOf(other)).not.toBe(groupKeyOf(mine))
  })

  it('sorts groups deterministically by (user, hash)', () => {
    const a = row({ id: 'a1', contentHash: H_SELFIE, verifiedHash: H_SELFIE })
    const b = row({ id: 'b1', contentHash: H_KARTU })
    const c = row({ id: 'c1', contentHash: H_KARTU })
    const plan = buildMergePlan([a, b, c])
    expect(plan.groups.map((g) => g.contentHash)).toEqual([H_KARTU, H_SELFIE])
  })

  it('refuses a row that arrives without a hash', () => {
    expect(() => buildMergePlan([row({ id: 'x', contentHash: 'nope', verifiedHash: null })])).toThrow(/64-hex/)
  })

  it('ignores singleton rows entirely', () => {
    const plan = buildMergePlan([row({ id: 'solo' })])
    expect(plan.groups).toEqual([])
    expect(plan.ops).toEqual([])
  })
})

describe('releaseDecision', () => {
  it('releases only at zero references everywhere', () => {
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 0, jsonbRefs: 0 })).toBe('released')
  })
  it('keeps when another image row still names it', () => {
    expect(releaseDecision({ imageRefs: 1, avatarRefs: 0, jsonbRefs: 0 })).toBe('kept-shared')
  })
  it('an avatar match alone refuses the delete', () => {
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 1, jsonbRefs: 0 })).toBe('kept-avatar')
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 2, jsonbRefs: 1 })).toBe('kept-avatar')
  })
  it('a jsonb mention refuses the delete', () => {
    expect(releaseDecision({ imageRefs: 0, avatarRefs: 0, jsonbRefs: 1 })).toBe('kept-jsonb')
  })
  it('an unreadable count keeps the object — never delete on unknown', () => {
    expect(releaseDecision({ imageRefs: null, avatarRefs: 0, jsonbRefs: 0 })).toBe('kept-unknown')
    expect(releaseDecision({})).toBe('kept-unknown')
    expect(releaseDecision({ imageRefs: 0, avatarRefs: -1, jsonbRefs: 0 })).toBe('kept-unknown')
  })
})
```

**Impact:** `npm test` grows one file; nothing else in the suite is affected.

### Step 5 (verification-only, no file): expected dry-run output on production

The analysis's Measured Evidence section is the acceptance data. On the FIRST run after P1's
migration (all 23 rows have `content_hash IS NULL`), `npm run nina:dedupe-media` must print, in
this shape (pathname suffixes elided — the script prints full values). RECONCILED caveat on the
counts: `hash filled` and `db rows` are ORDER-dependent — this set runs P2/P3 concurrently with
P4, and any duplicate-free rows the dedup write paths add to production before this sweep runs
arrive pre-hashed (lower fill count, higher row count) without changing the FINDINGS: the two
measured object-duplicate groups, their keepers/losers, and the three tidy groups are properties
of the snapshot the analysis measured. The STOP rule below keys on the findings, not the fill
count.

```
nina dedupe — media          dry run
db rows                      23
hash filled                  23   (content_hash was null)
stored hashes re-verified    0
hash fetch failures          0
groups                       2 finding(s) / 3 tidy / 0 skipped

FINDING 427e51e6bbe9cae3…  2 rows  keeper sbTuT8NKXL24
  keeper   nina/<uuid>/chat/sbTuT8NKXL24….jpg  message=VNu9upqvtK5X described  66.8 KB
  loser    nina/<uuid>/chat/ywNnXvpnnKSi….jpg  message=null original  66.8 KB
    → merge-row  ywNnXvpnnKSi: blob_url/pathname → keeper, source_image_id = sbTuT8NKXL24
    → release    nina/<uuid>/chat/ywNnXvpnnKSi….jpg (66.8 KB) if live refs = 0

FINDING 70a49180389861b6…  2 rows  keeper W-hhpnGxV0SI
  keeper   nina/<uuid>/selfie-…/W-hhpnGxV0SI….png  message=… …  110.1 KB
  loser    nina/<uuid>/…/1dMy2Zs5V1MJ….png  message=… reference  110.1 KB
    → merge-row  1dMy2Zs5V1MJ: blob_url/pathname → keeper, source_image_id = W-hhpnGxV0SI
    → release    nina/<uuid>/…/1dMy2Zs5V1MJ….png (110.1 KB) if live refs = 0

tidy    2358829ba6b306d7…  2 rows share one object — no action
tidy    8e8e82a3a8a64583…  2 rows share one object — no action
tidy    90a9c4652710f777…  2 rows share one object — no action

UPDATE nina_message_images SET blob_url = '…', pathname = '…', source_image_id = 'sbTuT8NKXL24' WHERE id = 'ywNnXvpnnKSi'
del https://…/ywNnXvpnnKSi….jpg …
UPDATE nina_message_images SET blob_url = '…', pathname = '…', source_image_id = 'W-hhpnGxV0SI' WHERE id = '1dMy2Zs5V1MJ'
del https://…/1dMy2Zs5V1MJ….png …

DRY RUN — nothing written. 4 op(s) (merge-row 2, release-blob 2). Re-run with --apply.
```

Counted acceptance: exactly 2 findings (never 5 — the three same-URL groups are `tidy`), 2
merge-rows, 2 releases, 177 KB reclaimable (66,823 + 110,068 = 176,891 B). Keeper ids exactly
`sbTuT8NKXL24` and `W-hhpnGxV0SI`; loser ids exactly `ywNnXvpnnKSi` and `1dMy2Zs5V1MJ`. If the
groups/keepers differ from this, STOP — do not `--apply`; something about the data changed and
the dry run is the only thing standing between the operator and a delete.

After `--apply`, a SECOND dry run must print `hash filled 0`, `0 finding(s)` — the two merged
groups are now `tidy` (one original + a same-URL reference each) — and `0 op(s)`.

## Verification

**Build:** `npm run build` (invariant 1; nothing app-side changed, so this is a green-tree check)
**Typecheck:** `npm run typecheck` (covers the `.ts` test importing the `.mjs` module)
**Tests:** `npm run test` — the gate. Scope first with `npx vitest run tests/nina.dedupeMedia.test.ts`.
**Lint/format:** `npx prettier --check scripts/nina-dedupe-plan.mjs scripts/nina-dedupe-media.mjs tests/nina.dedupeMedia.test.ts package.json` (repo print width is 100, no semicolons, single quotes — the code above is written to it; run `npx prettier --write` on the four files if the check disagrees).

**Manual check (production — read this before doing it):**
DATABASE_URL in `.env.local` IS production (repo memory: "this repo has ONE database"). The dry
run writes nothing; `--apply` writes production rows and deletes two Blob objects.
1. `npm run nina:dedupe-media` — compare against the Step 5 expected shape COUNTED acceptance.
2. `npm run nina:dedupe-media -- --apply` — confirm the printed audit trail matches the dry run
   op-for-op, and `DONE. 4 of 4 op(s) applied.`
3. Post-apply query set (psql over `DATABASE_URL`):
   - `select id, source_image_id, blob_url from nina_message_images where id in ('ywNnXvpnnKSi','1dMy2Zs5V1MJ');`
     → both rows EXIST (invariant 2: rows are never deleted), both have `source_image_id` set,
     both `blob_url` equal their keeper's.
   - `select count(*) from nina_message_images where content_hash is null;` → 0.
   - `curl -sI https://<store>.public.blob.vercel-storage.com/<loser-pathname>` for both losers →
     404. Same for both keepers → 200.
   - Re-hash both keepers and confirm their `content_hash` still matches:
     `curl -s <keeper-url> | sha256sum` → prefix `427e51e6bbe9cae3` / `70a49180389861b6`.
4. Media read semantics: open `/nina/about` — the kartu kedatangan appears once; total Media
   tiles = originals only. Bubble/deep-link reads unaffected by construction (`getNinaMessageImage`
   does not filter), but spot-check one `?photo=image:ywNnXvpnnKSi` deep link renders (it now
   serves the keeper's URL).
5. Idempotence: `npm run nina:dedupe-media` again → `hash filled 0`, `0 finding(s)`, `0 op(s)`,
   exit 0.

**Exit criteria:** the vitest suite is green on the pure decisions; the production dry run
reports exactly the two measured finding groups with the measured keepers/losers and three tidy
groups; after `--apply` both loser blobs 404, both loser rows exist as references to their
keepers, Media shows each photograph once, and a second dry run reports 0 findings and 0 ops.

## Handoffs

- **Phases 2/3 (write-time dedup):** nothing to hand off — but note the ordering freedom: this
  sweep is correct whether it runs before or after P2/P3 land. If it runs after, write-time rows
  arrive pre-hashed and the verify gate re-checks them like any other stored hash.
- **Coordinator/readme:** `scripts/` has no `package_readme.md` section today; if the set's
  readme-updater wants one line, it is the npm script name and the dry-run-default rule. Not a
  step of this phase.
- **Not filed anywhere (deliberately out of scope):** avatar-references whose bytes duplicate a
  chat image are reported but never merged (Step 1's `partitionGroup` rationale). If storage
  ever demands it, that is a NEW decision with its own provenance argument — not a quiet
  extension here.
- **`nina_avatars.content_hash`:** the album has the same duplicate-bytes exposure in principle.
  Out of scope by the plan index (album is excluded from Media). Recorded here so nobody reads
  its absence as an oversight.

## Rollback

- **Code:** revert the commit — four files, none imported by app code; the tree is whole again.
- **Data (rows):** nothing to roll back — rows are never deleted (invariant 2). A WRONG merge is
  repaired with two UPDATEs from the printed audit trail:
  `update nina_message_images set blob_url = '<old loser url>', pathname = '<old loser pathname>',
  source_image_id = null where id = '<loser>';` — the printed `--apply` lines carry every old
  value by construction (the audit line names what was SET; the dry-run output names the loser's
  old pathname).
- **Data (blobs):** a released blob is gone. That is why the release is gated (live refCount +
  jsonb sweep + `isStoreUrl`), why the two objects were verified byte-identical before anything
  moved, and why the dry run is mandatory reading. Worst case is a re-upload of the loser's file
  — recoverable, and the reason this phase ships dry-run-first rather than apply-only.
