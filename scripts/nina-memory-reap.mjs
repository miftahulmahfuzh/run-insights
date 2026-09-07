/**
 * Delete the distilled memory rows whose source message no longer exists — the backlog R8 leaves
 * behind, and the standing backstop for the race it cannot close.
 *
 *   npm run nina:memory-reap            # the dry run: reports, writes nothing
 *   npm run nina:memory-reap -- --apply
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and with `--apply` it writes
 * to it. The same line `scripts/backfill-record-keys.mjs` and `scripts/blob-reap.mjs` draw.
 *
 * ── WHAT IT IS FOR, AND WHEN IT STOPS BEING NEEDED ────────────────────────────────────────────
 * `lib/nina/queries.ts`'s `removeNinaSession` now purges a session's distilled memory in the same
 * transaction as the delete, so from R8 onwards no new orphan is created by a session delete. Two
 * classes of orphan remain:
 *
 *   1. **The backlog.** Every session deleted before R8 landed left its facts and slots behind.
 *      Those are the rows this script exists to clear, once.
 *   2. **The race.** `runTurnDistillation` writes facts stamped with a `source_message_id` AFTER
 *      the turn finishes. A session deleted in that window gets a fact written into it that the
 *      purge already ran past. The window is short today and gets longer when the turn moves into
 *      a background task. Run this script when Nina says something that sounds like a conversation
 *      that no longer exists.
 *
 * ── IT DELETES ONLY WHAT IS PROVABLY DANGLING ─────────────────────────────────────────────────
 * The predicate is an anti-join against `nina_messages` on a NON-NULL `source_message_id`. A row an
 * admin typed carries `source_message_id = NULL` (`lib/admin/memoryStore.ts`) and is therefore
 * outside the predicate entirely — not excluded by a rule that could be dropped, but unreachable.
 * A row whose message still exists is likewise unreachable. There is no time bound, no heuristic
 * and no model call: a pointer either resolves or it does not.
 *
 * ── NO user_id IN THE ANTI-JOIN, AND THAT IS NOT AN OWNERSHIP HOLE ────────────────────────────
 * `lib/nina/queries.ts`'s rule 1 governs code that answers a request on behalf of a signed-in user.
 * This script has no request and no session; it is run from a laptop against `DATABASE_URL` by the
 * person who owns the database. And the question it asks — "does this message id exist" — has no
 * user in it, the same argument `nina_messages_session_seq_idx` makes for leading with
 * `session_id`. `user_id` is REPORTED on every row so the output is still readable per account.
 *
 * ── 'pending_promises' IS SPELLED HERE, AND THAT IS THE ONE DUPLICATED FACT ───────────────────
 * The authority is `NINA_SLOT_PENDING_PROMISES` in `lib/db/schema.ts`. That module cannot be
 * imported under `--experimental-strip-types` the way `backfill-record-keys.mjs` imports
 * `lib/records/catalog.ts`, because its imports are drizzle at runtime rather than `import type`.
 * So the literal is restated below, once, exactly as that script restates `compute.ts`'s `beats`.
 * Keep it identical to the schema constant.
 */
import { neon } from '@neondatabase/serverless'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('FAIL  DATABASE_URL is not set. Run with `node --env-file=.env.local`.')
  process.exit(1)
}
const sql = neon(url)

/** `lib/db/schema.ts`'s `NINA_SLOT_PENDING_PROMISES`, restated. See the header. */
const PENDING_PROMISES = 'pending_promises'

console.log(`${apply ? 'APPLY' : 'DRY RUN'} — reaping memory rows whose source message is gone\n`)

/* ── 1. the append-only ledger ──────────────────────────────────────────────────────────────── */

const facts = await sql`
  select f.id, f.user_id, f.category, f.text, f.confidence, f.source,
         f.source_message_id, f.created_at
    from nina_memory_facts f
   where f.source_message_id is not null
     and not exists (select 1 from nina_messages m where m.id = f.source_message_id)
   order by f.user_id, f.created_at
`

console.log(`nina_memory_facts — ${facts.length} orphaned row(s)`)
for (const row of facts) {
  const text = row.text.length > 72 ? `${row.text.slice(0, 71)}…` : row.text
  console.log(
    `  -   ${row.id}  ${String(row.category).padEnd(10)} ${String(row.source).padEnd(9)} ${text}`,
  )
}

/* ── 2. the upserted slots, minus pending_promises ──────────────────────────────────────────── */

const slots = await sql`
  select s.user_id, s.key, s.value, s.source, s.source_message_id, s.updated_at
    from nina_memory_slots s
   where s.key <> ${PENDING_PROMISES}
     and s.source_message_id is not null
     and not exists (select 1 from nina_messages m where m.id = s.source_message_id)
   order by s.user_id, s.key
`

console.log(`\nnina_memory_slots — ${slots.length} orphaned row(s)`)
for (const row of slots) {
  console.log(
    `  -   ${String(row.key).padEnd(18)} ${String(row.source).padEnd(9)} ${JSON.stringify(row.value)}`,
  )
}

/* ── 3. pending_promises, per entry ─────────────────────────────────────────────────────────── *
 * The SAME jsonb expression `removeNinaSession` uses, with the session predicate replaced by "the
 * message exists at all". Running the dry run is therefore also how that expression gets validated
 * against a real Postgres, which no unit test can do.                                             */

const promiseRows = await sql`
  select s.user_id,
         jsonb_array_length(s.value -> 'promises') as before,
         jsonb_build_object(
           'promises',
           coalesce(
             (
               select jsonb_agg(t.entry order by t.ord)
                 from jsonb_array_elements(s.value -> 'promises')
                      with ordinality as t(entry, ord)
                where t.entry ->> 'sourceMessageId' is null
                   or exists (
                        select 1 from nina_messages m
                         where m.id = t.entry ->> 'sourceMessageId'
                      )
             ),
             '[]'::jsonb
           )
         ) as pruned
    from nina_memory_slots s
   where s.key = ${PENDING_PROMISES}
     and jsonb_typeof(s.value -> 'promises') = 'array'
   order by s.user_id
`

const promiseWork = promiseRows.filter((row) => row.pruned.promises.length < Number(row.before))

console.log(`\n${PENDING_PROMISES} — ${promiseWork.length} slot row(s) with orphaned entries`)
for (const row of promiseWork) {
  console.log(
    `  ~   user ${row.user_id}: ${row.before} promise(s) -> ${row.pruned.promises.length}`,
  )
}

/* ── 4. nina_turns, REPORTED AND NEVER DELETED ──────────────────────────────────────────────── *
 * Invariant 9: a removed conversation does not un-spend its tokens. This block exists so the
 * dangling job pointers are visible rather than surprising — it is what phase 4's job pages will
 * degrade on.                                                                                    */

const [turns] = await sql`
  select count(*)::int as n
    from nina_turns t
   where t.kind = 'image'
     and t.args ->> 'replyToId' is not null
     and not exists (select 1 from nina_messages m where m.id = t.args ->> 'replyToId')
`

console.log(
  `\nnina_turns — ${turns.n} image job(s) whose replyToId no longer resolves.` +
    '\n      NOT deleted, and never will be: the turn ledger is what proves what was spent.' +
    '\n      /nina/jobs degrades these to "the conversation was removed".',
)

/* ── 5. write, or explain that nothing was written ──────────────────────────────────────────── */

if (!apply) {
  const total = facts.length + slots.length + promiseWork.length
  console.log(
    `\nnothing was written. ${total} change(s) pending. Re-run with --apply.` +
      (total === 0 ? '\n(Nothing to do — the ledger has no dangling provenance.)' : ''),
  )
  process.exit(0)
}

let deletedFacts = 0
if (facts.length > 0) {
  const result = await sql`
    delete from nina_memory_facts f
     where f.source_message_id is not null
       and not exists (select 1 from nina_messages m where m.id = f.source_message_id)
     returning f.id
  `
  deletedFacts = result.length
}

let deletedSlots = 0
if (slots.length > 0) {
  const result = await sql`
    delete from nina_memory_slots s
     where s.key <> ${PENDING_PROMISES}
       and s.source_message_id is not null
       and not exists (select 1 from nina_messages m where m.id = s.source_message_id)
     returning s.key
  `
  deletedSlots = result.length
}

let prunedSlots = 0
for (const row of promiseWork) {
  await sql`
    update nina_memory_slots s
       set value = ${JSON.stringify(row.pruned)}::jsonb,
           updated_at = now()
     where s.user_id = ${row.user_id}
       and s.key = ${PENDING_PROMISES}
  `
  prunedSlots++
}

console.log(
  `\ndeleted ${deletedFacts} fact(s), ${deletedSlots} slot(s); pruned ${prunedSlots} promise list(s).` +
    '\nRe-run without --apply to confirm the ledger is clean.',
)
