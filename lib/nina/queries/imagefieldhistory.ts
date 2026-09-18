import { and, desc, eq, notInArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaImageFieldHistory } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import type { NinaImageTextKey } from '@/lib/nina/imageprefs'

/**
 * The "generate a fresh value" button's memory — `lib/db/schema/nina/config.ts`'s
 * `nina_image_field_history` header has the design. This module is the storage half; the model
 * call that produces a value lives in `lib/nina/imagefieldgen.ts` and never imports this file, the
 * same split `lib/nina/imageprefs.ts` / `queries/imageprefs.ts` already draw.
 */

/**
 * How many past values survive per `(userId, field)`. Enough for the model to see real variety
 * without the avoid-list prompt block growing unbounded — an admin panel with one operator has no
 * reason to remember more than a few dozen wardrobes back.
 *
 * Not exported: `lib/nina/queries.ts`'s barrel contract (`tests/nina.queries.test.ts` — the
 * frozen surface) admits functions only, and nothing outside this module needs the number.
 */
const NINA_IMAGE_FIELD_HISTORY_CAP = 20

/** The newest values first — the shape a "do not repeat these" prompt block wants. */
export async function readRecentFieldValues(
  userId: string,
  field: NinaImageTextKey,
): Promise<string[]> {
  const rows = await db
    .select({ value: ninaImageFieldHistory.value })
    .from(ninaImageFieldHistory)
    .where(and(eq(ninaImageFieldHistory.userId, userId), eq(ninaImageFieldHistory.field, field)))
    .orderBy(desc(ninaImageFieldHistory.createdAt))
    .limit(NINA_IMAGE_FIELD_HISTORY_CAP)
  return rows.map((row) => row.value)
}

/**
 * Record one suggestion, then trim this `(userId, field)` back down to the newest
 * `NINA_IMAGE_FIELD_HISTORY_CAP`. Two statements rather than a read-modify-write of a `jsonb`
 * array — see the table's header for why that matters even with one operator.
 */
export async function recordFieldValue(
  userId: string,
  field: NinaImageTextKey,
  value: string,
): Promise<void> {
  await db.insert(ninaImageFieldHistory).values({ id: newId(), userId, field, value })

  const keep = await db
    .select({ id: ninaImageFieldHistory.id })
    .from(ninaImageFieldHistory)
    .where(and(eq(ninaImageFieldHistory.userId, userId), eq(ninaImageFieldHistory.field, field)))
    .orderBy(desc(ninaImageFieldHistory.createdAt))
    .limit(NINA_IMAGE_FIELD_HISTORY_CAP)
  const keepIds = keep.map((row) => row.id)
  /* `notInArray` with an empty array matches nothing in drizzle rather than everything, so the
   * guard below is belt and braces — `keep` always has at least the row just inserted. */
  if (keepIds.length === 0) return

  await db
    .delete(ninaImageFieldHistory)
    .where(
      and(
        eq(ninaImageFieldHistory.userId, userId),
        eq(ninaImageFieldHistory.field, field),
        notInArray(ninaImageFieldHistory.id, keepIds),
      ),
    )
}
