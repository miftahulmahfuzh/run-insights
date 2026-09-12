import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns, type NinaTurnKind } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import type { NinaTurnInsert } from './shapes'

/**
 * The turn audit trail's two statements (queries.ts §8 "Turns — the audit trail"):
 * `insertNinaTurn` and `countNinaTurnsSince`.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat `lib/nina/turn*.ts` modules (`turn.ts`, `turnrun.ts`, `turnflight.ts`,
 * `turnrevive.ts`) are a DIFFERENT layer — the turn runner and its LLM machinery. This is the
 * persistence half that writes and counts `nina_turns`. The near-mirror naming is deliberate.
 *
 * Imports foundation-wards only — never the barrel `@/lib/nina/queries`. The layer-wide rules
 * on the barrel's header apply here unchanged.
 */
/* ============================================================================
 * §8 Turns — the audit trail
 * ==========================================================================*/

/**
 * One row per model call, success or failure. Returns the id so the caller can stamp it onto the
 * messages the turn emitted — which means the turn row is written FIRST, before the messages, and
 * a turn with no messages is a turn that failed. That asymmetry is the point: a conversation that
 * silently lost a turn is unexplainable, and this is the table that explains it.
 *
 * **A third outcome exists and it is not a failure:** `status: 'pending'` with `args` populated is
 * phase 12's dispatched image job, closed by the callback minutes later in another process
 * (RULINGS C1 and C2). The id this function returns is that job's id — the opaque handle that
 * goes into the `workflow_dispatch` input *instead of the prompt*, because the repo is public.
 */
export async function insertNinaTurn(userId: string, input: NinaTurnInsert): Promise<string> {
  const id = newId()
  await db.insert(ninaTurns).values({
    id,
    userId,
    kind: input.kind,
    trigger: input.trigger ?? null,
    model: input.model,
    promptVersion: input.promptVersion ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    toolCalls: input.toolCalls ?? '',
    latencyMs: input.latencyMs ?? null,
    costMicroUsd: input.costMicroUsd ?? null,
    status: input.status,
    errorCode: input.errorCode ?? null,
    args: input.args ?? null,
  })
  return id
}

/**
 * Phase 12's daily cap, and phase 10's "have I already spoken today". Counts by `kind` since an
 * instant, and counts FAILED turns too — a cap that only counts successes is a cap an unlucky
 * afternoon can spend ten times over.
 *
 * **AND IT DOES NOT FILTER `deleted_at`, WHICH IS A DECISION AND NOT AN OVERSIGHT (R2).** Every
 * other reader of a `kind='image'` row skips a row the runner hid from `/nina/jobs`; this one
 * keeps counting it, for the same reason it counts failures. `lib/nina/selfiegen.ts` calls this
 * cap *"a money cap and not a feature cap"* — the $0.04 was spent, and hiding the row does not
 * un-spend it. A version of this count that respected the flag would turn one tap on a tidy-up
 * icon into a quota refund, which is an unmetered image budget wearing a trash can as a hat.
 * `tests/nina.softDelete.test.ts` asserts the absence of the predicate rather than trusting it.
 */
export async function countNinaTurnsSince(
  userId: string,
  kind: NinaTurnKind,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaTurns)
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, kind), gte(ninaTurns.createdAt, since)),
    )
  return rows[0]?.n ?? 0
}
