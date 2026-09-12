import { asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaNags } from '@/lib/db/schema'
import type { NinaNagRow, NinaNagUpsert } from './shapes'

/**
 * The nag ledger's two statements (queries.ts §7 "Nags — the escalation ledger (RU-9)"):
 * `getNinaNags` and `upsertNinaNag`.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat module `lib/nina/nags.ts` is a DIFFERENT file — the escalation DECISIONS (which
 * level a repeat mention climbs to, when to stop). This is the persistence half that reads and
 * writes `nina_nags`. The mirror naming is deliberate.
 *
 * Imports foundation-wards only — never the barrel `@/lib/nina/queries`. The layer-wide rules
 * on the barrel's header apply here unchanged.
 */
/* ============================================================================
 * §7 Nags — the escalation ledger (RU-9)
 * ==========================================================================*/

/** Phase 2's `readNags`. `[]` when she has never nagged, which is a normal first-week state. */
export async function getNinaNags(userId: string): Promise<NinaNagRow[]> {
  return db
    .select({
      code: ninaNags.code,
      level: ninaNags.level,
      count: ninaNags.count,
      lastMentionedOn: ninaNags.lastMentionedOn,
      updatedAt: ninaNags.updatedAt,
    })
    .from(ninaNags)
    .where(eq(ninaNags.userId, userId))
    .orderBy(asc(ninaNags.code))
}

/**
 * Records that she has now said something about `code`. `level` is supplied by phase 9 — this
 * function does not compute the ladder, because "what rung is he on" is a decision with a decay
 * rule and a threshold table, and neither belongs in a query.
 *
 * `count` is incremented IN SQL (`nina_nags.count + 1`) rather than read-then-written, so two
 * concurrent writers — the cron and an `after()` hook, which is a real pair — cannot lose one.
 */
export async function upsertNinaNag(userId: string, input: NinaNagUpsert): Promise<void> {
  await db
    .insert(ninaNags)
    .values({
      userId,
      code: input.code,
      level: input.level,
      count: 1,
      lastMentionedOn: input.lastMentionedOn,
    })
    .onConflictDoUpdate({
      target: [ninaNags.userId, ninaNags.code],
      set: {
        level: input.level,
        count: sql`${ninaNags.count} + 1`,
        lastMentionedOn: input.lastMentionedOn,
        updatedAt: new Date(),
      },
    })
}
