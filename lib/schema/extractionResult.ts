import { z } from 'zod'

import {
  MAX_IMAGES,
  MIN_IMAGES,
  SHOT_STORED_PATHNAME_RE,
  type ExtractionErrorCode,
} from '@/lib/extract/constants'
import { ScreenKindSchema, type ExtractedSession, type ScreenKind } from './extractedSession'

/**
 * The wire contract between F04's two Route Handlers and everything that talks to them — the
 * upload picker, the polling hook, and (Task 18) F05's review screen.
 *
 * PURE MODULE, client-importable. This is the whole of F04's published surface: F05 needs to know
 * exactly what it receives for each terminal status and nothing more.
 */

/* ── POST /api/extract ───────────────────────────────────────────────────────────────────── */

/**
 * One uploaded screenshot, as the browser reports it after the Blob PUT lands.
 *
 * `pathname` is validated against the STORED pattern (not the requested one) because
 * `addRandomSuffix: true` rewrites what we asked for — the client is echoing back what Vercel
 * actually created. `url` must be an absolute Blob URL: it is fetched server-side by the
 * background job, so an attacker-supplied `http://169.254.169.254/…` would be an SSRF primitive.
 */
export const ExtractionBlobRefSchema = z.object({
  url: z
    .url('blob url must be absolute')
    .refine(
      (u) =>
        u.startsWith('https://') && new URL(u).hostname.endsWith('.public.blob.vercel-storage.com'),
      'blob url must point at this project’s Vercel Blob store',
    ),
  pathname: z.string().regex(SHOT_STORED_PATHNAME_RE, 'unexpected blob pathname'),
  kind: ScreenKindSchema,
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  bytes: z.number().int().positive().nullable().default(null),
})
export type ExtractionBlobRef = z.infer<typeof ExtractionBlobRefSchema>

/**
 * The body `POST /api/extract` accepts. Three constraints, each load-bearing:
 *
 *  1. 1–3 images — the measured envelope. A fourth image was never scored.
 *  2. **No duplicate kinds.** Two "Splits" screenshots would make `kindsPresent` claim a screen
 *     is covered while the real screen is missing, which is exactly the hole the provenance
 *     guard exists to close.
 *  3. The picker sends them in display order; the array order is the order the model sees.
 */
export const ExtractRequestSchema = z
  .object({
    images: z.array(ExtractionBlobRefSchema).min(MIN_IMAGES).max(MAX_IMAGES),
  })
  .refine(
    ({ images }) => new Set(images.map((i) => i.kind)).size === images.length,
    'each screenshot must have a different kind',
  )
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>

/** 202 body. An extraction id, never a run id — R-1: no run exists yet. */
export interface ExtractAcceptedResponse {
  extractionId: string
}

/* ── GET /api/extract/[id] ───────────────────────────────────────────────────────────────── */

export type ExtractionStatus = 'pending' | 'ok' | 'repaired' | 'failed'

/**
 * **Task 18 — the hand-off contract to F05.** Exactly this object, for every terminal status:
 *
 * | `status`     | `session`             | `errorCode` | what F05 renders                        |
 * |--------------|-----------------------|-------------|-----------------------------------------|
 * | `pending`    | `null`                | `null`      | the progress screen (R-41)              |
 * | `ok`         | validated session     | `null`      | the review form, pre-filled             |
 * | `repaired`   | validated session     | `null`      | the review form, pre-filled             |
 * | `failed`     | `null`                | one code    | the review form, **all fields blank**   |
 *
 * The `failed` row is the whole of plan §8.1: there is no second manual-entry UI to build. The
 * fallback IS the review screen in its empty state, still keyed to this `extractionId`, so
 * `runs.extraction_id` remains an honest record that the numbers were human-entered.
 */
export interface ExtractionResult {
  extractionId: string
  status: ExtractionStatus
  /** Non-null only for `ok` / `repaired`. Already Zod-validated at completion time. */
  session: ExtractedSession | null
  errorCode: ExtractionErrorCode | string | null
  /** The kinds actually uploaded, in display order — F05's screenshot strip and R-45 provenance. */
  kinds: ScreenKind[]
  photos: Array<{ url: string; kind: ScreenKind; width: number | null; height: number | null }>
  /** The D3 canary, surfaced so a failure is diagnosable without opening the database. */
  promptTokens: number | null
  /** ISO strings — a JSON body has no Date. */
  createdAt: string
  completedAt: string | null
}

export const TERMINAL_STATUSES: readonly ExtractionStatus[] = ['ok', 'repaired', 'failed']

export function isTerminal(status: ExtractionStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * One sentence per failure class, written for the runner rather than for the log. Each says what
 * happened and what to do, because "extraction failed" with no verb is the least useful thing an
 * app can say.
 */
export const EXTRACTION_ERROR_COPY: Record<ExtractionErrorCode, string> = {
  token_floor:
    'The reader answered without actually looking at your screenshots, so its numbers were thrown away rather than shown to you. Nothing was saved. Try again.',
  transport: 'The reader could not be reached. Nothing was saved. Try again in a moment.',
  timeout: 'The reader took too long and was stopped. Nothing was saved. Try again.',
  validation:
    'The reader came back with something we could not trust the shape of. You can still enter this run by hand below.',
  stale_timeout:
    'This reading stopped partway through and never finished. Nothing was saved. Try again.',
}

export function errorCopy(code: string | null | undefined): string | null {
  if (!code) return null
  return (
    EXTRACTION_ERROR_COPY[code as ExtractionErrorCode] ??
    'Something went wrong reading your screenshots. Nothing was saved.'
  )
}
