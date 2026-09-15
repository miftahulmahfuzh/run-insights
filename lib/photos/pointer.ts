import { isValidId } from '@/lib/id'

/**
 * The pointer the duplicate-image notification carries, and the grammar of the URL it becomes.
 *
 * ── WHY THIS IS NOT `lib/nina/attach.ts`'s `NinaPhotoPointer`, WIDENED ────────────────────────
 * That type is the `/nina?photo=<kind>:<id>` grammar, which ARMS THE COMPOSER with a photograph
 * the runner is about to send. It is deliberately two-way (`'avatar' | 'image'`) because those are
 * the two tables a chat attachment can come from, and `app/nina/page.tsx` resolves it with a
 * TERNARY rather than an exhaustive switch — `kind === 'avatar' ? getNinaAvatar : getNinaMessageImage`.
 * Adding `'shot'` there would compile, would parse, and would read a `run_photos` id out of
 * `nina_message_images`. Two grammars, two unions, two consumers; they are structurally similar
 * and semantically unrelated, and the union that is missing a case is the one that must not grow.
 *
 * ── DELIBERATELY PURE, AND DELIBERATELY IN `lib/photos` ───────────────────────────────────────
 * No database, no `server-only`, one import. `lib/photos/contentHash.ts`'s header states the
 * constraint this module inherits: things in this directory are read by a browser, by the server
 * and by a `--experimental-strip-types` script alike. The URL builder in particular is needed on
 * the server (phase 1's push), by a route's segment parser (phase 2) and by this file's own test,
 * so it may not reach for anything that opens a connection.
 */

/**
 * Which of the three image tables an id addresses.
 *
 *   · `'shot'`   — `run_photos`,           a screenshot uploaded during extraction
 *   · `'avatar'` — `nina_avatars`,         a face in her album
 *   · `'image'`  — `nina_message_images`,  a photograph in the chat
 *
 * The two spellings that are NOT ours to rename: `'avatar'` and `'image'` are the strings
 * `lib/nina/attach.ts`'s grammar already uses for the same two tables, and using different words
 * here would mean two vocabularies for one set of tables. `'shot'` is new because `run_photos` has
 * never been addressable by a pointer at all.
 */
export type PhotoPointerKind = 'shot' | 'avatar' | 'image'

/** The union as a value, for a runtime membership test and for a test to iterate. */
export const PHOTO_POINTER_KINDS: readonly PhotoPointerKind[] = ['shot', 'avatar', 'image'] as const

/** What a URL carries: a kind and an id, and nothing that could be a claim. */
export interface PhotoPointer {
  kind: PhotoPointerKind
  id: string
}

/**
 * The pointer once the server has proved the row is this user's: the same two fields plus the Blob
 * URL read off that row.
 *
 * `lib/nina/attach.ts`'s `NinaExistingPhoto` makes the identical extension for the identical
 * reason, quoted rather than re-argued: a URL arriving from a client is a claim, an id resolved
 * against `user_id` is a fact. **`description` is deliberately absent and must never be added** —
 * it is `glm-4.6v`'s private text and nothing outside Nina's prompt may read it.
 */
export interface ResolvedPhotoPointer extends PhotoPointer {
  /** A public Blob URL, read off the row the server just proved is this user's. */
  url: string
}

/** Runtime membership in the union. Takes `unknown` — its callers hold route segments. */
export function isPhotoPointerKind(value: unknown): value is PhotoPointerKind {
  return value === 'shot' || value === 'avatar' || value === 'image'
}

/**
 * **THE URL CONTRACT OF THIS FEATURE, AND THE ONLY PLACE IT IS SPELLED.**
 *
 *     photoViewerPath({ kind: 'shot', id: 'aB3_xYz01234' })  ->  '/photo/shot/aB3_xYz01234'
 *
 * Phase 2's route is `app/photo/[kind]/[id]/page.tsx`; phases 3 and 4 never build this string
 * themselves, they hand a pointer to `notifyDuplicateImagePush`. Three call sites, one function,
 * one shape — which is what stops a notification from landing on a path the router does not have.
 *
 * **Same-origin and always a path**, never an absolute URL: `NinaPushPayload.url`'s contract
 * (`lib/push/payload.ts`) and `lib/service-worker.js:44`'s `FALLBACK_URL` both require it, and a
 * malformed value there means a tap lands on `/nina` instead of the photograph.
 *
 * **No encoding, on purpose.** `kind` is one of three literals and `lib/id.ts`'s alphabet is
 * `[0-9A-Za-z_-]` — neither segment can contain a character a path segment cares about. An
 * `encodeURIComponent` here would be dead code that hides the invariant rather than stating it.
 */
export function photoViewerPath(pointer: PhotoPointer): string {
  return `/photo/${pointer.kind}/${pointer.id}`
}

/**
 * The inverse, for phase 2's route: two raw segments in, a pointer or `null` out.
 *
 * Takes `unknown` for `parseNinaPhotoParam`'s stated reason — a Next.js route param is
 * `string | string[] | undefined` and a repeated segment is a malformed link, not an interesting
 * case. `isValidId` is the shape gate; all three tables' primary keys are `lib/id.ts` nanoid(12)
 * (`run_photos` via `newPhotoId`, both Nina tables via `newId`), so one predicate covers all three.
 *
 * `null` is NOT an error. A stale bookmark, a forged id and another user's id must all resolve the
 * same way, and the route that consumes this degrades silently rather than telling anyone which
 * ids exist.
 */
export function parsePhotoViewerSegments(kind: unknown, id: unknown): PhotoPointer | null {
  if (!isPhotoPointerKind(kind)) return null
  if (!isValidId(id)) return null
  return { kind, id }
}
