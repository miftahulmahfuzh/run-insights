import type { NinaPhotoSide } from '@/lib/nina/album'

/**
 * What `/admin/photos` knows about one of Nina's chat photographs, and nothing more.
 *
 * Narrower than `NinaImageRow` in one direction and wider in another, and both edges are
 * deliberate. Narrower: `createdAt` is an ISO string here, because a `Date` does not cross the RSC
 * serialization boundary as a `Date` and `app/admin/nina/page.tsx:105` already made this call for
 * the album. Wider than `ExplorerPhoto` would allow: `description` and `prompt` are carried in FULL
 * rather than as a present/absent boolean — see `ChatPhotoDetail` for the argument, which is that
 * `/admin` is the one surface where reading them is the point.
 *
 * Types only. Nothing here is a runtime export, so the Server Component that builds these objects
 * does not pull a client module in with it — `components/admin/explorer/model.ts:11-14`'s property,
 * and the reason the page can `import type { ChatPhoto }` freely.
 */
export interface ChatPhoto {
  id: string
  /**
   * The message this photograph hangs off. `nina_message_images.message_id` is `NOT NULL` with
   * `ON DELETE CASCADE` and the column's own comment says why — *"an image with no message is
   * nothing"* — so this is never absent, and it is the field phase 3's "add" has to mint a row for.
   */
  messageId: string
  /** The ORIGINAL blob. There is no thumbnail on this table; see `NINA_CHAT_PHOTO_PAGE_SIZE`. */
  url: string
  /** Always `'generated'` on this surface — the listing's predicate. Rendered, not assumed. */
  kind: string
  /**
   * `photoSideOf(kind)`, computed on the server exactly as `galleryPhotos` computes it.
   *
   * Always `'hers'` here, which is the point of carrying it: it is a rendered assertion that the
   * `kind` filter and `/nina/about`'s his/hers discriminator agree. A tile reading "his" on this
   * page means the predicate and `photoSideOf` have diverged.
   */
  side: NinaPhotoSide
  /**
   * The blob path. Read-only here; phase 3's replace needs it and it is already a prop.
   *
   * **Never parse it, and never infer a container or a MIME type from it.** It is DISPLAYED — in a
   * `title=` and in the rail's header — and nothing more. On `main` every row here is
   * `nina/<userId>/selfie-<id>.png` from the worker; after phase 3 the same collection also holds
   * `nina/<userId>/selfie-<id>.jpg`, because an admin-supplied photograph is re-encoded to JPEG
   * (phase 3's D4). The collection is mixed-container by design, `NINA_IMAGE_PATHNAME_RE` admits
   * both, and the served content type is the only authority — `lib/nina/vision.ts`'s `toDataUri`
   * reads it back rather than guessing, and says why.
   */
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  /**
   * `glm-4.6v`'s scene prose. **Rendered in full, and only here.** Invariant 6 forbids it reaching
   * a runner-facing caption (`lib/nina/chatphotos.ts:14-19`), not an operator's admin screen.
   */
  description: string | null
  /** The generation sidecar `finishSelfie` wrote. Same reasoning as `description`. */
  prompt: string | null
  /** Position within its message's bubble. `0` for everything the worker wrote. */
  sortOrder: number
  /** ISO 8601. A `Date` does not survive the boundary. */
  createdAt: string
}

/**
 * Where in the collection we are.
 *
 * Offsets rather than a keyset cursor, for `ExplorerPageInfo`'s stated reason: the pager says
 * "1-48 of 137" and offers Newer as well as Older, which a cursor cannot do without a second
 * mechanism. The cost is the same and is the same size — during a concurrent write a tile can
 * repeat across two consecutive pages; nothing is ever skipped.
 */
export interface ChatPhotoPageInfo {
  /** 1-based, clamped by the page before it ever reaches a query. */
  page: number
  pageSize: number
  /** Every `kind = 'generated'` row for this user, not just this page. */
  total: number
}
