# RESOLVED — the branch was merged and the migration renumbered

**Status:** CLOSED, 2026-09-05. Set merged to `main` as `a57b1e7`; migration applied
(6 in the database, `nina_tuning` present with 21 columns, `nina_turns.tuning_revision`
present). All six phase commits are ancestors of `main`.
**Decided by the user, 2026-09-05**, when offered the choice of repairing it
before phase 5 instead.

## What happened

An unrelated plan set, `nina-chat-sessions` (9 phases), merged into `main` as
`7cec803` while this set was mid-flight — after this branch was cut, and after
phase 1 had already landed its migration.

Both sets minted a migration numbered **0004**:

| branch | idx 4 |
|---|---|
| `main` | `0004_nina_chat_sessions` |
| `feature/nina-character-tuning` | `0004_nina_persona_tuning` (phase 1) |

## The collision surface

Files changed on BOTH sides since this branch's base (`7cff533`):

    drizzle/meta/_journal.json        <- hard conflict, same idx
    drizzle/meta/0004_snapshot.json   <- hard conflict, same filename
    lib/db/schema.ts                  <- ordinary text conflict
    lib/nina/queries.ts               <- ordinary text conflict
    tests/db.schema.nina.test.ts      <- ordinary text conflict

## What the repair requires

Not a conflict resolution alone — a renumber:

1. Merge `origin/main` into `feature/nina-character-tuning`.
2. Rename `0004_nina_persona_tuning.sql` -> `0005_nina_persona_tuning.sql`.
3. Regenerate its snapshot as `0005_snapshot.json`, chaining onto **main's**
   `0004_nina_chat_sessions` snapshot — never hand-edit the journal.
4. Journal keeps main's idx 4 and gains this set's migration at idx 5.
5. Resolve `schema.ts`, `queries.ts`, `tests/db.schema.nina.test.ts` by taking
   BOTH sides — the two sets add disjoint tables.
6. Full suite green, `drizzle-kit check` clean.

## Why no phase can do it

Phase 1 landed before the collision existed. Nothing later in the set
regenerates migrations — phase 4 touches `schema.ts` type-only with no column
and nothing under `drizzle/`. So this survives to the end of the set untouched.

## Known consequence of deferring it

Phase 6's documentation sweep runs against the PRE-merge tree. After the merge,
its doc claims must be re-checked against the merged result and corrected. That
is part of this repair, not a new phase.

## How it was actually resolved, and the trap in it

Regenerated, not renamed. Main's `_journal.json` and `0004_snapshot.json` were kept, this set's
`0004_*.sql` was deleted, and `drizzle-kit generate` re-emitted it as `0005` from the merged
`schema.ts`. Emitted DDL is identical to phase 1's.

**Renaming the file by hand would have failed silently**, and this is the part worth remembering.
The migrator applies journal entries whose `when` exceeds the newest applied row. This set's `0004`
was stamped 1788535743971 (14:49); main's already-applied `0004_nina_chat_sessions` was stamped
1788553112306 (20:18). A renamed-but-not-regenerated entry is therefore *older than the watermark*
and gets skipped without an error: a clean-looking deploy, and `nina_tuning` simply never created —
found on the first turn that reads it. Regenerating restamps `when` (1788570836694), which is why
it applied.

Documentation was corrected separately afterwards: `docs/nina/persona.md` and `lib/db`'s readme
still pointed at `drizzle/0004_nina_persona_tuning.sql`, a file that no longer exists, and still
carried the prediction that the number would move.
