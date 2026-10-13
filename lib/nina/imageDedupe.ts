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
  /**
   * The keeper's derived thumbnail, or NULL — media-thumbnails phase 3.
   *
   * **A reference row takes the KEEPER's thumbnail rather than deriving a second one**, for the
   * same reason it takes the keeper's `blob_url`: it displays exactly the keeper's bytes, so a
   * second derivative of those bytes would be a duplicate object charged to the quota this
   * feature exists to defend. The backfill reached the identical conclusion from the data —
   * 1,304 rows named only 1,037 objects — and shares one thumbnail per object for it.
   *
   * NULL when the keeper has none yet (a row the sweep has not reached). The reference row then
   * carries NULL too and renders the original, exactly as the keeper does. It is NOT a reason to
   * derive one here: the keeper's own fill will cover both rows at once.
   */
  thumbUrl?: string | null
  thumbPathname?: string | null
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
    /**
     * The thumbnail derived from the bytes THIS write owns, or NULL when derivation failed or
     * nothing was put. Travels with the original so that the race path can release BOTH objects:
     * losing the race must not strand a thumbnail whose original was just released.
     */
    thumbUrl?: string | null
    thumbPathname?: string | null
  }
}

export interface NinaImageWritePlan {
  row: {
    blobUrl: string
    pathname: string
    /** Non-null makes the row a REFERENCE (`isOriginalPhoto()` then hides it from Media). */
    sourceImageId: string | null
    contentHash: string | null
    /** The thumbnail this row renders in a grid: its own on an original, the keeper's on a
     * reference, NULL when there is none. Never the keeper's original paired with its own thumb. */
    thumbUrl: string | null
    thumbPathname: string | null
  }
  /**
   * The loser objectS to release AFTER the row lands, or an empty array when nothing was put.
   *
   * **An array since media-thumbnails phase 3**, because a lost race can now strand TWO objects:
   * the fresh original and the thumbnail derived from it. Releasing only the original would leave
   * a thumbnail nothing references — an orphan, recoverable by the reaper, but one this function
   * already knows about and can hand over for free.
   */
  release: { blobUrl: string; pathname: string }[]
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
        /* An original renders its OWN derivative. */
        thumbUrl: stored.thumbUrl ?? null,
        thumbPathname: stored.thumbPathname ?? null,
      },
      release: [],
    }
  }

  /* The skip path put no bytes, so there is nothing of this write's to release — and nothing of
   * this write's to point at either: `stored` IS the keeper's location there. */
  const putFreshBytes = stored.pathname !== hit.pathname

  return {
    row: {
      blobUrl: hit.blobUrl,
      pathname: hit.pathname,
      sourceImageId: hit.id,
      contentHash: stored.contentHash,
      /* THE KEEPER'S, never this write's. The row displays the keeper's bytes, so pairing the
       * keeper's original with a locally-derived thumbnail would put two objects behind one
       * photograph for no gain — and would quietly undo the sharing the keeper already has. */
      thumbUrl: hit.thumbUrl ?? null,
      thumbPathname: hit.thumbPathname ?? null,
    },
    release: putFreshBytes
      ? [
          { blobUrl: stored.blobUrl, pathname: stored.pathname },
          /* The thumbnail derived from the loser bytes, when there is one. Same ordering rule:
             the row is in before anything is released. */
          ...(stored.thumbUrl != null && stored.thumbPathname != null
            ? [{ blobUrl: stored.thumbUrl, pathname: stored.thumbPathname }]
            : []),
        ]
      : [],
  }
}
