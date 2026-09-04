import { formatDay, formatDistanceM, formatDuration, formatPace } from '@/lib/format'
import { isValidId } from '@/lib/id'

/**
 * A run, as it appears inside a chat bubble (R13) and above the composer while it is pinned.
 *
 * ── WHY DISPLAY-READY STRINGS AND NOT THE ROW ─────────────────────────────────────────────────
 * The card must show the same numbers `/r/[id]` shows, spelled the same way — invariant 3, and the
 * failure it prevents is the one R-42 records: a second place that formats a distance is a second
 * place that can disagree about `10.67 km`. So the mapping happens on the server, through
 * `lib/format.ts`, and the client component receives sentences. It also means `RunAttachmentCard`
 * needs no formatter import at all, which is what makes it trivially f08-guard-clean.
 *
 * ── WHY `RunAttachmentInput` IS DECLARED HERE ─────────────────────────────────────────────────
 * Structural, not imported from `lib/db`. Phase 2 draws the same boundary with `NinaRunInput`: the
 * pure module states what it needs, and the query happens to return something assignable to it. A
 * column rename is then a compile error at one call site rather than a change to this file.
 */
export interface RunAttachmentInput {
  id: string
  /** `runs.occurred_on`, `'YYYY-MM-DD'`, the Asia/Jakarta calendar day (D6). */
  occurredOn: string
  location: string | null
  activityType: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
}

export interface RunAttachment {
  /** The run to open. `/r/${runId}`. */
  runId: string
  /** `'Thu, 20 Aug 2026'`. */
  day: string
  /** `'Outdoor Run'` — what the run page's hero label says. */
  activityType: string
  location: string | null
  /** `'10.67 km'`. */
  distance: string
  /** `'1:02:33'`. */
  duration: string
  /** `'5'52"/km'` — with the unit, because on a card there is no column header to carry it. */
  pace: string
}

/** The query parameter that arms the composer: `/nina?attach=<runId>`. */
export const ATTACH_PARAM = 'attach'

export function toRunAttachment(row: RunAttachmentInput): RunAttachment {
  return {
    runId: row.id,
    day: formatDay(row.occurredOn),
    activityType: row.activityType,
    location: row.location,
    distance: formatDistanceM(row.distanceM),
    duration: formatDuration(row.durationSec),
    pace: formatPace(row.avgPaceSec, true),
  }
}

/**
 * `runId -> attachment`, for the one pass `app/nina/page.tsx` makes over the conversation. A Map
 * rather than an array so a message with an attachment is O(1) and a message without one costs
 * nothing.
 */
export function indexAttachments(rows: readonly RunAttachmentInput[]): Map<string, RunAttachment> {
  const index = new Map<string, RunAttachment>()
  for (const row of rows) index.set(row.id, toRunAttachment(row))
  return index
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE SECOND IDIOM: `/nina?photo=avatar:<id>` — F34 R2
 * ──────────────────────────────────────────────────────────────────────────────────────────────*/

/**
 * Which table the id addresses. **Structurally identical to `NinaAttachExisting`'s `kind`** in
 * `lib/nina/actions.ts:128`, and declared here rather than imported for the reason
 * `RunAttachmentInput` gives forty lines up: this module is read by a client component
 * (`Composer`), a Server Component (`app/nina/page.tsx`) and a unit suite, and it stays pure by
 * stating what it needs instead of reaching into a `'use server'` module for it. A widening of
 * that union without a widening of this one is then a compile error at the one call site that
 * bridges them, which is exactly where it should be.
 */
export type NinaPhotoKind = 'avatar' | 'image'

/** What the URL carries: a kind and an id, and nothing that could be a claim. */
export interface NinaPhotoPointer {
  kind: NinaPhotoKind
  id: string
}

/**
 * The pointer once the server has proved it owns the row: the same two fields plus the URL the
 * chip renders.
 *
 * ── WHY THE URL IS RESOLVED ON THE SERVER AND NOT FETCHED BY THE CHIP ─────────────────────────
 * A URL arriving from a client is a claim; an id resolved against `user_id` is a fact — the same
 * sentence `NinaAttachExisting`'s docstring opens with. So `app/nina/page.tsx` does one
 * owner-scoped single-row read and hands down a URL that is already known to be his. The client
 * never learns of a blob it does not own, and the chip needs no effect, no loading state and no
 * second round trip.
 *
 * **`description` is deliberately absent and must never be added.** Invariant 5: it is
 * `glm-4.6v`'s private text, the only consumer is Nina's prompt, and nothing in `components/` may
 * read it. The chip renders `alt=""` for the same reason `NinaPhotoGrid` does
 * (`components/nina/NinaPhotoGrid.tsx:19-23`).
 */
export interface NinaExistingPhoto extends NinaPhotoPointer {
  /** A public Blob URL, read off the row the server just proved is his. */
  url: string
}

/**
 * The query parameter that arms the composer with a photo the server ALREADY OWNS:
 * `/nina?photo=avatar:<id>`.
 *
 * ── WHY A SECOND PARAMETER AND NOT A SECOND VALUE OF `ATTACH_PARAM` ──────────────────────────
 * `?attach=` carries a bare `runId` and `app/nina/page.tsx` resolves it through
 * `listRunAttachments`. Overloading it would mean sniffing a colon to decide which table to read,
 * and the first id that ever contains a colon (or the first kind added) turns a deep link into a
 * silent miss. Two parameters, two grammars, two reads — and they can appear on the same URL
 * without either one having to know about the other, which is why `ChatScreen` deletes both in one
 * `replaceState`.
 */
export const PHOTO_PARAM = 'photo'

/**
 * `pointer -> 'avatar:<id>'`. **Phase 7 builds the share link out of this**, so this function and
 * `parseNinaPhotoParam` are the entire contract between `/admin/nina` and `/nina`. The separator
 * is a colon, which no id can contain (`lib/id.ts`'s alphabet is `[0-9A-Za-z_-]`), so the parse
 * below can split on the first one and be sure it split in the right place.
 *
 * It does NOT url-encode. The caller owns the URL; see this phase's plan for the one expression
 * phase 7 should use.
 */
export function formatNinaPhotoParam(pointer: NinaPhotoPointer): string {
  return `${pointer.kind}:${pointer.id}`
}

/**
 * `unknown -> pointer | null`. **Takes `unknown` on purpose**: the caller is
 * `app/nina/page.tsx`, where a `searchParams` value is `string | string[] | undefined`, and a
 * repeated `?photo=a&photo=b` is a malformed link rather than an interesting case. `isValidId` sets
 * the same precedent one file over (`lib/id.ts:44`) and for the same reason — a shape check that
 * refuses to be handed the wrong shape is a shape check with a second bug in it.
 *
 * A miss is `null`, and `null` is NOT an error: the page paints the ordinary empty composer. That
 * is the deliberate difference from `resolveAttachment`'s refusal (invariant 10). A refusal there
 * is about a *send* whose whole subject was a photo he cannot see; a miss here is about a *link*,
 * which anyone can type, and answering a stale bookmark with an error page would be the app
 * telling a runner his own chat is broken.
 */
export function parseNinaPhotoParam(raw: unknown): NinaPhotoPointer | null {
  if (typeof raw !== 'string') return null
  const separator = raw.indexOf(':')
  if (separator <= 0) return null
  const kind = raw.slice(0, separator)
  const id = raw.slice(separator + 1)
  if (kind !== 'avatar' && kind !== 'image') return null
  if (!isValidId(id)) return null
  return { kind, id }
}
