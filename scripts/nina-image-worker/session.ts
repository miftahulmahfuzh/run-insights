/**
 * Session resolution: which conversation does a message this worker writes belong in? FINDING 1's
 * real question, answered with the app's own policy restated in SQL.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import type { NeonSql } from './sql.ts'

/**
 * **Which session does a message this worker writes belong in? FINDING 1's real question.**
 *
 * `nina_messages.session_id` has been `NOT NULL` since migration 0004 (`lib/db/schema.ts:855`) and
 * both of this file's INSERTs omitted it, so every successful generation crashed on the write that
 * would have made the photograph visible, and the apology for that crash crashed the same way and
 * took the process down before `nina_turns` could record what had been spent. Run `33986082744`
 * measured all of it.
 *
 * ── WHY THIS IS SQL AND NOT AN IMPORT ─────────────────────────────────────────────────────────
 * The app's answer to this exact question is `resolveNinaSessionForMessage` in
 * `lib/nina/sessionResolve.ts`. It cannot be imported here: it begins `import 'server-only'` and
 * reaches `lib/nina/queries.ts` through `@/` aliases, neither of which survives
 * `--experimental-strip-types`. See the barrel's header. So the POLICY is duplicated and the
 * duplication is stated rather than hidden — and the widened `findSchemaDrift` is what keeps the
 * column list honest across the two hosts.
 *
 * ── THE POLICY, WHICH IS `resolveNinaSessionForMessage`'S, CLAUSE FOR CLAUSE ───────────────────
 *   1. the session of `args.replyToId` — the runner message that asked — **when that message still
 *      exists and is his**. So a photograph lands in the conversation where he asked for it, not in
 *      whichever chat happens to be newest two minutes later.
 *   2. otherwise his most recent session BY ACTIVITY, which is `max(sent_at)` over his own messages
 *      in it, falling back to the session's `created_at` for one he made and has not written in.
 *      This is `sessionActivityAt` + `compareNinaSessionActivity` from `lib/nina/sessions.ts`, and
 *      **pins are irrelevant on purpose** — the display list is pinned-first, and a photograph does
 *      not belong in a conversation he pinned in March. The `s.id desc` tie-break is that
 *      comparator's, which returns `a.id < b.id ? 1 : -1` and therefore sorts the larger id first.
 *   3. otherwise **null, and the caller declines to write the message**. This is the one place the
 *      policies differ, deliberately: the app's fallback is `ensureNinaSession`, which CREATES. A
 *      worker that minted a session would file a photograph into a conversation the runner has
 *      never seen, and it would make `nina_chat_sessions` a table this file writes — which is a
 *      second writer of a ledger the app owns. Declining is the honest outcome, and it is reachable
 *      only in the R11 state where he has removed every session he has.
 *
 * Owner-scoped in both branches (invariant 5): a foreign or vanished id comes back empty and takes
 * the fallback rather than reaching into somebody else's conversation.
 *
 * One statement rather than two, because neon-http charges a round trip per call and the `not
 * exists` guard means exactly one branch of the `union all` ever produces a row.
 */
export async function resolveWorkerSessionId(
  sql: NeonSql,
  userId: string,
  replyToId: string | null,
): Promise<string | null> {
  const rows = (await sql`
    with reply as (
      select m.session_id as id
      from nina_messages m
      where m.id = ${replyToId}::text and m.user_id = ${userId}
      limit 1
    ),
    recent as (
      select s.id
      from nina_chat_sessions s
      left join (
        select m.session_id as session_id, max(m.sent_at) as last_user_at
        from nina_messages m
        where m.user_id = ${userId} and m.role = 'runner'
        group by m.session_id
      ) a on a.session_id = s.id
      where s.user_id = ${userId}
      order by coalesce(a.last_user_at, s.created_at) desc, s.id desc
      limit 1
    )
    select id from reply
    union all
    select id from recent where not exists (select 1 from reply)
  `) as Array<{ id: string | null }>

  return rows[0]?.id ?? null
}
