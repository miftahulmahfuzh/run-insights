# Pending repair: this branch is NOT mergeable as it stands

**Status:** open. Owned by the coordinator, scheduled for AFTER phase 6.
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
