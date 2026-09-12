import { isValidContentHash } from '@/lib/photos/contentHash'

import { ninaPhotoProvenance } from './attach'
import type { NinaExistingPhoto } from './attach'

/**
 * **Write-time dedup for `nina_message_images`, as pure functions** (media-dedupe, phase 2).
 *
 * A photograph's SHA-256 — computed over the EXACT bytes that get stored (plan invariant 4) —
 * decides, at write time, whether those bytes are already in the owner's collection. When they
 * are, the write becomes a REFERENCE row (F37's provenance mechanism, via `ninaPhotoProvenance`)
 * instead of a second Blob object: storage stays minimum (R2) and the Media feed shows each
 * photograph once (R3).
 *
 * ── WHY THIS IS A PURE MODULE ─────────────────────────────────────────────────────────────────
 * Three readers, none of which may drag another's runtime in:
 *
 *   · `components/nina/Composer.tsx` — a `'use client'` component that decides, per picked tile,
 *     whether to PUT bytes or to attach the existing photograph;
 *   · `lib/nina/actions.ts` — a `'use server'` module that re-checks at insert time (the
 *     race-close) and shapes every row;
 *   · `tests/nina.dedupe.test.ts` — the vitest node suite, which asserts the decisions with no
 *     database, no DOM and no mock.
 *
 * So the imports are exactly two, both pure by their own headers: `attach.ts` (the provenance
 * rule) and `lib/photos/contentHash.ts` (the hash format, phase 1). Everything that talks to
 * Postgres or Blob stays in `actions.ts`; everything that DECIDES lives here.
 *
 * ── THE TRUST MODEL IS THE CLAIM MODEL ────────────────────────────────────────────────────────
 * A hash arriving from the browser is a claim, the same class of claim `width`/`height`/`bytes`
 * already are: format-checked, never signature-checked (plan Decisions). `isValidContentHash` is
 * therefore the ONLY gate, and its failure mode is silence — the hash drops to NULL and the row
 * is written as an ordinary original (invariant 9). A bad claim costs its owner one duplicated
 * object in their own store and nothing else; it must never cost a send.
 *
 * Phase 3 (generated + admin paths) does NOT reuse this module, and that is the reconciled shape,
 * not an accident: its hosts need a ZERO-IMPORT decision (`lib/nina/imageDedupe.ts` —
 * `scripts/nina-image-worker.ts` imports it under `--experimental-strip-types`) and an admin plan
 * (`planChatPhotoAddWrite` in `lib/admin/chatPhotos.ts`), while this module must stay client-safe
 * (the composer reads it) and batch-aware (the same-send twin split). The division of labor:
 * THIS module is the runner-upload path's pick/send decisions and the ONLY thing STEP 1b calls;
 * `planNinaImageWrite` serves the two generated-image hosts; `planChatPhotoAddWrite` serves the
 * admin add. Three modules, three jobs — do not merge them and do not grow a fourth.
 */

/**
 * `nina_message_images.kind`, stated structurally rather than imported from `lib/db/schema` —
 * the same boundary `attach.ts` draws for `NinaPhotoKind`: this module is read by a client
 * component, a server-action module and the unit suite, and it stays portable by naming what it
 * produces. `lib/db/schema`'s `NinaImageKind` is this exact union, so a drift between the two is
 * a compile error at the one place that bridges them (`ninaUploadInsertRow`'s callers, which
 * hand rows to `insertNinaMessageImages`).
 */
type NinaDedupeImageKind = 'upload' | 'generated'

/**
 * A claim's hash, as the server may trust it: a string whose SHA-256 hex form is exact, or null.
 *
 * Trimmed before checking, because a serializer is more likely to add whitespace than a user is,
 * and a hash with a trailing newline is not a different hash — it is the same hash that must not
 * silently disable dedup. Uppercase hex is REJECTED rather than folded to lowercase:
 * `contentHashOf` emits lowercase, so uppercase means the value did not come from the util, and
 * refusing it keeps ONE spelling of the column in the database — which is what phase 4's sweep
 * compares literals against.
 *
 * This is a DECISION read, not a second column rule. Phase 1's insert door
 * (`insertNinaMessageImages` coalescing through `isValidContentHash`) remains the one normative
 * backstop for `nina_message_images.content_hash`; this wrapper only decides whether a keeper
 * lookup may run, and everything it returns is either `null` or a string the door accepts
 * unchanged. The trim is the one behavior the door lacks, and it can only ever REPLACE an
 * invalid-looking-but-valid claim with a valid one — never the reverse.
 */
export function normalizeClaimedContentHash(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return isValidContentHash(trimmed) ? trimmed : null
}

/**
 * One upload claim AFTER ticket verification — `NinaImageClaims` with the measured fields
 * coalesced to the row's nullable shape, plus the position the photograph holds in its bubble.
 */
export interface NinaUploadClaim {
  /** The STORED pathname of the bytes this claim would insert — Vercel's random suffix included. */
  pathname: string
  blobUrl: string
  width: number | null
  height: number | null
  bytes: number | null
  description: string | null
  /** Position among the send's fresh uploads; `insertNinaMessageImages` sorts on it. */
  sortOrder: number
  /** `normalizeClaimedContentHash`'s answer. Null = dedup is inactive for this claim. */
  contentHash: string | null
  /**
   * The SERVER's measurement of the stored bytes' perceptual signature — the send-time race-close
   * (`lib/nina/actions.ts` STEP 1b) fetched the just-landed object back and signed it with the one
   * signer (`lib/nina/perceptualSign.ts`). Never a client claim: the browser computes no
   * signature, and the whole point of the perceptual layer is that both sides of every comparison
   * come from the same sharp pipeline. Null = unsigned, the row lands without one, and the send
   * does not care. Pre-formatted exactly as the columns want them (`lib/nina/perceptual.ts`'s
   * `dhashHexOf` / `sig16ToBase64`) so this module needs no parser import — it is read by a client
   * component and must stay portable.
   */
  perceptual?: { dhashHex: string; sig16Base64: string } | null
}

/**
 * The row a reference points at: the fields `ninaUploadInsertRow` copies, and nothing else.
 * `NinaImageRow` (`imageColumns`) satisfies this structurally, so both the pre-insert lookup and
 * an already-inserted row hand straight over without an adapter.
 */
export interface NinaUploadKeeper {
  id: string
  kind: NinaDedupeImageKind
  blobUrl: string
  pathname: string
  description: string | null
  sourceAvatarId: string | null
  sourceImageId: string | null
}

/**
 * The insert shape this module produces — structurally an `NinaImageInsert` (phase 1's
 * `contentHash` pass-through included), minus `prompt`, which no chat-upload row ever sets.
 */
export interface NinaDedupeInsertRow {
  messageId: string
  kind: NinaDedupeImageKind
  blobUrl: string
  pathname: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
  contentHash?: string | null
  /** The claim's server-measured signature, originals only. See `NinaUploadClaim.perceptual`. */
  perceptualHash?: string | null
  perceptualSig?: string | null
  sourceAvatarId?: string | null
  sourceImageId?: string | null
  sortOrder: number
}

export type NinaUploadInsertDecision =
  | { outcome: 'fresh'; row: NinaDedupeInsertRow; keeperId: null }
  | { outcome: 'reference'; row: NinaDedupeInsertRow; keeperId: string }

/**
 * The row ONE claim becomes, given the keeper the caller has already proved (or null for a
 * genuine original). The whole of the write-side decision in one function, so the fresh arm and
 * the reference arm cannot drift apart the way two call sites would.
 *
 * The reference arm is "exactly `resolveAttachment`'s shape": the keeper's `blob_url`/`pathname`
 * are copied, `kind` is the KEEPER's (`photoSideOf`, `lib/nina/album.ts`, has to keep
 * telling the truth about whose photograph this is — a reference to one of her selfies is a
 * `'generated'` row on his message, exactly as the re-attach path writes), the provenance goes
 * through `ninaPhotoProvenance` so a reference-to-a-reference flattens to the ORIGINAL, and the
 * measurements are left off — the row is a pointer, and the keeper carries its own measurements,
 * exactly as the attach arm has since F37.
 *
 * Two deliberate departures from a blind copy of the attach arm, both stated so they are not
 * "fixed" back:
 *
 *   · **The description prefers the keeper but falls back to the claim's.** `resolveAttachment`
 *     never has a fresh description in hand; here we usually do — the describe call ran on these
 *     very bytes seconds ago, and identical bytes are the same picture. The keeper wins first
 *     because an operator-edited description is authoritative for that photograph; the claim's
 *     covers the never-described keeper (the orphan class the analysis measured) instead of
 *     discarding a description that was already paid for.
 *   · **NO `contentHash` on a reference row.** The hash belongs to the row that OWNS the bytes;
 *     a reference owns none. Writing client-claimed hashes onto references could leave a row
 *     whose hash disagreed with the keeper's blob-measured one, and phase 4's sweep groups
 *     originals only — a reference hash would be dead weight with a failure mode attached.
 *     RECONCILED, do not "fix" either side: phase 3's generated-path references DO carry the hash
 *     (`planNinaImageWrite`) because there the writer measured the bytes itself, while this path's
 *     hashes are CLIENT CLAIMS. The per-path rule is: a reference row carries the hash only when
 *     its writer held the bytes. Phase 2's hash-less reference rows are the expected NULLs phase
 *     4's pass-1 fill owns — not drift, and not a reason to stamp claims on references here.
 */
export function ninaUploadInsertRow(input: {
  messageId: string
  claim: NinaUploadClaim
  keeper: NinaUploadKeeper | null
}): NinaUploadInsertDecision {
  if (input.keeper === null) {
    return {
      outcome: 'fresh',
      keeperId: null,
      row: {
        messageId: input.messageId,
        kind: 'upload',
        blobUrl: input.claim.blobUrl,
        pathname: input.claim.pathname,
        width: input.claim.width,
        height: input.claim.height,
        bytes: input.claim.bytes,
        description: input.claim.description,
        contentHash: input.claim.contentHash,
        /*
         * The signature rides only on an ORIGINAL — the row that owns bytes. The reference arm
         * below copies the keeper's object and binds nothing here, exactly as it binds no
         * `contentHash`: the per-path rule is "a row states the facts of the bytes it OWNS".
         */
        perceptualHash: input.claim.perceptual?.dhashHex ?? null,
        perceptualSig: input.claim.perceptual?.sig16Base64 ?? null,
        sortOrder: input.claim.sortOrder,
      },
    }
  }

  const keeper = input.keeper
  return {
    outcome: 'reference',
    keeperId: keeper.id,
    row: {
      messageId: input.messageId,
      kind: keeper.kind,
      blobUrl: keeper.blobUrl,
      pathname: keeper.pathname,
      description: keeper.description ?? input.claim.description ?? null,
      ...ninaPhotoProvenance({
        kind: 'image',
        id: keeper.id,
        sourceAvatarId: keeper.sourceAvatarId,
        sourceImageId: keeper.sourceImageId,
      }),
      sortOrder: input.claim.sortOrder,
    },
  }
}

export interface NinaUploadPartition {
  /**
   * The send's originals — inserted FIRST, in one statement, so their ids exist by the time the
   * references are shaped.
   */
  fresh: NinaUploadClaim[]
  /**
   * The send's references. `keeper === null` means the keeper is the SAME-SEND original that
   * owns `claim.contentHash` — its id does not exist until the fresh statement returns, which is
   * why the split is returned rather than a finished row list. The claim is the full
   * `NinaUploadClaim` and not the hashed narrowing because a reference does not always arrive by
   * hash: the perceptual conversion (`applyPerceptualKeepers`) moves claims over on a twin
   * match, and a claim whose hash claim failed (`contentHash: null`) can still be a twin.
   */
  references: Array<{ claim: NinaUploadClaim; keeper: NinaUploadKeeper | null }>
}

/**
 * Which of this send's upload claims become originals and which become references, decided
 * BEFORE anything is written. Precedence, in order:
 *
 *   1. no hash -> fresh, always. Dedup inactive (invariant 9) is not a third kind of row.
 *   2. a DB keeper for the hash (the race-close re-check's answer) -> reference to it — for EVERY
 *      claim with that hash, including the first, because the DB keeper predates this send.
 *   3. no DB keeper, but an EARLIER claim in this send has the same hash (the same file picked
 *      twice in one batch: both tiles passed the composer's pre-check because neither row existed
 *      yet) -> reference to that earlier claim; `keeper: null` marks it, and the caller resolves
 *      the id from the fresh insert's return.
 *   4. otherwise -> fresh, and this claim becomes the same-send keeper for any later twin.
 *
 * The two reference pushes are reachable only under `contentHash !== null`, so those claims are
 * hashed by construction — but the partition's references carry the wide claim type, because
 * `applyPerceptualKeepers` moves claims in later and it does not require a hash.
 */
export function partitionNinaUploadClaims(
  claims: readonly NinaUploadClaim[],
  keepersByHash: ReadonlyMap<string, NinaUploadKeeper>,
): NinaUploadPartition {
  const fresh: NinaUploadClaim[] = []
  const references: NinaUploadPartition['references'] = []
  const sameSend = new Map<string, NinaUploadClaim>()

  for (const claim of claims) {
    if (claim.contentHash === null) {
      fresh.push(claim)
      continue
    }
    const keeper = keepersByHash.get(claim.contentHash)
    if (keeper !== undefined) {
      references.push({ claim, keeper })
      continue
    }
    const earlier = sameSend.get(claim.contentHash)
    if (earlier !== undefined) {
      references.push({ claim, keeper: null })
      continue
    }
    sameSend.set(claim.contentHash, claim)
    fresh.push(claim)
  }

  return { fresh, references }
}

/**
 * **The perceptual conversion** (media-dedupe follow-up, 2026-09-10): the byte partition's
 * fresh originals re-partitioned against the twins the send-time race-close measured. A fresh
 * claim whose stored pathname has a perceptual keeper becomes a REFERENCE to that keeper — the
 * re-encode's bytes never enter the collection twice — and every other claim (including any the
 * byte keys already sent to references) keeps exactly the answer `partitionNinaUploadClaims`
 * gave it.
 *
 * The keeper is keyed by the claim's STORED pathname — the same key the caller signed under and
 * the one identifier every claim of a send carries disjoint from its hashes. The keeper arrived
 * from `findNinaSignedOriginals`'s read (originals only, owner-scoped, newest first), so the
 * reference arm of `ninaUploadInsertRow` can take it hands-off: `blob_url`/`pathname` copied,
 * provenance flattened, the claim's just-landed blob orphaned — the caller releases it with the
 * byte path's own release ladder, which already walks `partition.references`.
 *
 * The SAME-SEND arm follows its byte set. A same-send twin shares its bytes — therefore its
 * signature and its verdict — with the fresh claim it points at, so when that fresh claim
 * converts, the twin converts with it. Left alone, the twin would resolve its keeper from
 * `partition.fresh`'s insert return, find the fresh claim GONE (converted away), degrade to a
 * fresh row of its own, and stand in Media as the exact duplicate this conversion exists to
 * prevent — one hole in the sweep of one send. A same-send twin whose byte set did NOT convert
 * keeps `keeper: null` and the byte partition's answer, unchanged.
 *
 * Two claims that are twins of the SAME keeper both convert, and both of their blobs release —
 * two bubbles, one photograph, which is the collection's whole point.
 */
export function applyPerceptualKeepers(
  partition: NinaUploadPartition,
  keepersByPathname: ReadonlyMap<string, NinaUploadKeeper>,
): NinaUploadPartition {
  if (keepersByPathname.size === 0) return partition

  const fresh: NinaUploadClaim[] = []
  const references: NinaUploadPartition['references'] = []

  for (const claim of partition.fresh) {
    const keeper = keepersByPathname.get(claim.pathname)
    if (keeper === undefined) {
      fresh.push(claim)
    } else {
      references.push({ claim, keeper })
    }
  }

  for (const ref of partition.references) {
    /* A DB byte-keeper reference carries its keeper and is never in the map (its bytes were
     * settled before any signing); a same-send twin looks its own pathname up. */
    const keeper = ref.keeper ?? keepersByPathname.get(ref.claim.pathname)
    references.push({ claim: ref.claim, keeper: keeper ?? null })
  }

  return { fresh, references }
}

export type NinaPickUploadPlan =
  | { outcome: 'attach-existing'; existing: NinaExistingPhoto }
  | { outcome: 'upload'; contentHash: string | null }

/**
 * What ONE picked tile does once its bytes are hashed and the owner-scoped pre-check has
 * answered — the composer's whole dedup decision, as a value, so the suite can assert
 * "duplicate -> skip the upload, attach the pointer" without rendering a component.
 *
 * The DECISION is the duplicate's alone, and that is deliberate: since the source-key lookup
 * (2026-09-10's measured defect), a non-null `duplicate` means the collection already holds
 * EITHER the encoded bytes OR the picked file itself — and either way the answer is the same,
 * attach what exists. A null `contentHash` no longer forces an upload by itself; it only means
 * the encode's hash contributed nothing, which the caller (the composer) has already folded into
 * whether it asked at all. No duplicate and no hash — or any duplicate-less shape — uploads:
 * a photograph must never fail to enter the conversation because a hash could not be computed
 * (invariant 9's client half).
 */
export function planNinaPickUpload(input: {
  /** `contentHashOf` over the exact bytes that would be PUT, or null when hashing failed. */
  contentHash: string | null
  /** `findNinaDuplicateChatImage`'s answer — the existing photograph, or null. */
  duplicate: NinaExistingPhoto | null
}): NinaPickUploadPlan {
  if (input.duplicate !== null) {
    return { outcome: 'attach-existing', existing: input.duplicate }
  }
  return { outcome: 'upload', contentHash: input.contentHash }
}
