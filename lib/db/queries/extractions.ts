import { and, eq, lt, sql } from 'drizzle-orm'

import { newExtractionId } from '@/lib/id'

import { db } from '../index'
import {
  extractions,
  type Extraction,
  type ExtractionBlobUrls,
  type ExtractionCorrections,
  type ExtractionStatus,
} from '../schema'

import { NotFoundError } from './errors'

/* ============================================================================
 * §6 Extractions — append-only (D3)
 *
 * There is no delete path in this module, and there never will be: every field a human corrects
 * in review is a labelled extraction failure — model said X, truth was Y, for a known field
 * against a known image. `runs` keeps only the corrected value; `raw_response` + `corrections`
 * are the only place the model's wrongness survives, which is what turns a month of uploads into
 * a queryable error profile instead of a feeling that "the prompt seems off".
 *
 * `scripts/check-data-layer-invariants.mjs` enforces this in CI.
 * ==========================================================================*/

/**
 * `blobUrls` carries `{url, pathname, kind}` per screenshot rather than a bare URL list: `kind`
 * is what parameterises F04's provenance guard, and it has to come from our own upload record
 * rather than from the model's reply. See `extractions.blob_urls` in `schema.ts`.
 */
export async function createExtraction(
  userId: string,
  blobUrls: ExtractionBlobUrls,
  model: string,
): Promise<{ id: string }> {
  const id = newExtractionId()
  await db.insert(extractions).values({ id, userId, blobUrls, model, status: 'pending' })
  return { id }
}

export async function getExtraction(userId: string, id: string): Promise<Extraction | null> {
  const rows = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

async function markExtraction(
  userId: string,
  id: string,
  patch: {
    status: ExtractionStatus
    rawResponse?: unknown
    promptTokens?: number | null
    errorCode?: string | null
  },
): Promise<void> {
  const rows = await db
    .update(extractions)
    .set({ ...patch, completedAt: new Date() })
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId)))
    .returning({ id: extractions.id })
  if (rows.length === 0) throw new NotFoundError('Extraction not found')
}

/** Terminal state, written once. `promptTokens` is the D3 canary, stored for later audit. */
export async function markExtractionOk(
  userId: string,
  id: string,
  rawResponse: unknown,
  promptTokens: number | null,
): Promise<void> {
  await markExtraction(userId, id, { status: 'ok', rawResponse, promptTokens })
}

/**
 * The response needed one text-only repair round-trip (R-2) before it validated. Distinguished
 * from `ok` because a repaired extraction is a prompt-quality signal, not just a success.
 */
export async function markExtractionRepaired(
  userId: string,
  id: string,
  rawResponse: unknown,
  promptTokens: number | null,
): Promise<void> {
  await markExtraction(userId, id, { status: 'repaired', rawResponse, promptTokens })
}

/**
 * `promptTokens` is optional but is passed on the F04 path even here: a `token_floor` row whose
 * canary reads 141 is the difference, months later, between "the vendor dropped the images" and
 * "the model wrote bad JSON".
 */
export async function markExtractionFailed(
  userId: string,
  id: string,
  errorCode: string,
  rawResponse?: unknown,
  promptTokens?: number | null,
): Promise<void> {
  await markExtraction(userId, id, { status: 'failed', errorCode, rawResponse, promptTokens })
}

/**
 * R-20's stale-pending self-heal. A background job killed mid-flight (a deploy, a timeout past
 * the 55 s soft deadline, a cold-start eviction) leaves its row `pending` forever, and the upload
 * screen would poll it until the end of time. Returns the ids it closed out.
 */
export async function failStalePendingExtractions(
  userId: string,
  olderThan: Date,
  errorCode = 'STALE_PENDING',
): Promise<string[]> {
  const rows = await db
    .update(extractions)
    .set({ status: 'failed', errorCode, completedAt: new Date() })
    .where(
      and(
        eq(extractions.userId, userId),
        eq(extractions.status, 'pending'),
        lt(extractions.createdAt, olderThan),
      ),
    )
    .returning({ id: extractions.id })
  return rows.map((r) => r.id)
}

/**
 * The corrections log (R-7): `{fieldPath: [{from, to, phase, checkId?, correctedAt}]}`. F05 reads
 * the current value, appends its events and writes the whole object back — this function is the
 * write, not the merge, because only F05 knows its own path syntax and phase semantics.
 */
export async function recordCorrections(
  userId: string,
  id: string,
  corrections: ExtractionCorrections,
): Promise<void> {
  const rows = await db
    .update(extractions)
    .set({ corrections })
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId)))
    .returning({ id: extractions.id })
  if (rows.length === 0) throw new NotFoundError('Extraction not found')
}

export interface FieldErrorStat {
  /** The corrections key — a field name, or F05's dotted path for a nested split/zone value. */
  field: string
  /** Correction EVENTS for this field across all of this user's extractions (R-7 arrays). */
  correctionCount: number
  /** Distinct extractions in which this field was corrected at least once. */
  extractionCount: number
  /** Denominator for a per-field rate. The same value on every row, on purpose. */
  extractionsWithCorrections: number
}

/**
 * "Which field does the model get wrong most often." `jsonb_each` has no query-builder shape, so
 * this is the one raw-SQL query in the module — still user-scoped, in both the outer query and
 * the correlated subquery.
 *
 * The `jsonb_typeof` guard is not defensive noise: R-7 changed this column's shape from an object
 * to an array of events, and `jsonb_array_length` on a non-array raises rather than returning
 * null. Any row written before that ruling counts as one event instead of taking the query down.
 */
export async function getExtractionErrorProfile(userId: string): Promise<FieldErrorStat[]> {
  const result = await db.execute<{
    field: string
    correction_count: number
    extraction_count: number
    extractions_with_corrections: number
  }>(sql`
    select
      kv.key as field,
      sum(
        case when jsonb_typeof(kv.value) = 'array' then jsonb_array_length(kv.value) else 1 end
      )::int as correction_count,
      count(distinct ${extractions.id})::int as extraction_count,
      (
        select count(*)::int from ${extractions}
        where ${extractions.userId} = ${userId} and ${extractions.corrections} is not null
      ) as extractions_with_corrections
    from ${extractions}, jsonb_each(${extractions.corrections}) as kv(key, value)
    where ${extractions.userId} = ${userId}
    group by kv.key
    order by correction_count desc, kv.key asc
  `)
  return result.rows.map((row) => ({
    field: row.field,
    correctionCount: Number(row.correction_count),
    extractionCount: Number(row.extraction_count),
    extractionsWithCorrections: Number(row.extractions_with_corrections),
  }))
}
