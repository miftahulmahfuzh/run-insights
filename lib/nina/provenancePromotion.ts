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
