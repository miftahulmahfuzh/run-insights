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
