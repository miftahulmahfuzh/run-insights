# Token-Maxxing Session — 2026-09-12: push-queries-tests

## 🎯 Achievement / End Result
- **Goal of the burn:** The assigned idea (coordinator `tokenmax-orch-2026-09-12`, slug
  `push-queries-tests`): write **real tests** for `lib/push/queries.ts`'s
  `recordPushSuccess` and `recordPushFailure`, using the repo's documented disposable
  scratch-Postgres pattern — because the two write paths of the push pruning story had
  **zero test coverage** despite being production write paths that run on every push send.
- **Concrete changes:** commit `006130d` — **1 new file, +302 lines, 12 tests**:
  `tests/integration/pushQueries.int.test.ts`, the fourth suite in the opt-in
  `tests/integration/` tier and the **only DB-level coverage `lib/push/queries.ts` has
  ever had** (the sibling `queries.int.test.ts` covers the shared data layer and touches
  nothing push-shaped — verified by grep). **Zero production code changed.**
- **Real value delivered:**
  - **The pruning's headline claim is now executable, not prose.** `recordPushFailure`'s
    docblock says "**This is the pruning, and it is one statement**" with
    `failure_count = failure_count + 1` evaluated *in SQL* so two concurrent sends cannot
    both write "1". The suite proves the server-side increment with two simultaneous
    calls landing as **2, not 1** — and the mutation check showed a TypeScript
    read-modify-write fails exactly that test. No fake driver serializes concurrent
    statements the way the server does; this required real Postgres by construction.
  - **The fifth-failure ceiling is pinned against the caller's one-behind count** — the
    documented race tolerance, end to end. `send.ts` passes the `failureCount` it read
    from `listLivePushSubscriptions` (one behind under a race), while the SQL writes
    count + 1; the test walks four surviving retries and proves the **fifth consecutive
    retry revokes** anyway, `revoked_at` set to the exact failure instant.
  - **The `'gone'` verdict path is pinned at any count, including its soft-delete
    consequence:** an immediate revoke regardless of `failureCount`, and — read through
    `listLivePushSubscriptions` itself, not a raw row — the dead endpoint actually
    **leaves the fan-out's live list**. Both halves of "soft delete for a dead endpoint"
    proven in one test.
  - **The userId-first scoping rule (module header, invariant 7) is enforced by test:**
    a cross-user record is a **silent no-op even with verdict `'gone'`** — the sharpest
    case, because an unscoped write would not just corrupt a count, it would *revoke
    someone else's subscription*. The same pin exists on the success path, plus a
    sibling-subscription test (a dropped `eq(id)` would zero the whole fan-out).
  - **"One statement" is asserted as what it really is — one HTTP round trip.** The
    suite wraps `neonConfig.fetchFunction` with a counter and proves **exactly one
    round trip per call, for both functions** — the property that matters, since the
    sender runs this once per subscription per send. A SELECT-before-UPDATE mutation
    fails it ("expected 2 to be 1").
  - **`timestamptz` fidelity through the neon-HTTP round trip:** three distinct
    millisecond-carrying instants (`03:40:00.000Z`, `03:41:00.123Z`, `03:42:00.456Z`)
    survive write and read-back **exact to the millisecond**, on `last_success_at`,
    `last_failure_at`, and `revoked_at` alike; the success path's clearing of
    `lastFailureAt` is a real SQL `NULL`, not a fake's absent field.
  - **The streak semantics are pinned end to end:** failure history never erases
    `last_success_at` (history and streak are different columns), and the
    production-ordered sequence — fail, fail, then deliver — clears
    `failureCount` to 0 and `lastFailureAt` to NULL. The **default `at = new Date()`
    path is exercised too**, because that is how the sender actually calls it (verified
    at `lib/push/send.ts`: both call sites omit `at`).
  - **Failure-proofed, TDD-adapted to characterization testing:** four mutation checks
    on `lib/push/queries.ts`, each reverted immediately (`git checkout --`), never
    committed — a TS-side increment, a dropped scoping predicate, a
    SELECT-before-UPDATE, and a success that stops clearing `lastFailureAt`. Each was
    caught by exactly its targeted test(s) and nothing else, which is the evidence the
    12 tests measure behavior rather than echo implementation. Production code ended
    **pristine (git diff empty)**.
  - **First consumer of the corrected scratch-DB runbook.** The session followed the
    disposable-database recipe that the live-tests-audit session's finding 4 fixed
    (coordinator commit `8714456`, in this branch's history): the URL swap anchored to
    the authority so it **cannot match the `/neondb` inside the `neondb_owner`
    username**. Scratch DB `run_insights_itest_push` created, migrated (swapped
    UNPOOLED), tested (swapped POOLED), then `pg_terminate_backend` + `DROP DATABASE` —
    **post-drop count 0, production database never touched**. The recipe is inlined in
    the test file's header so the next reader needs no archaeology.
- **Branch:** `token-maxxing-2026-09-12-push-queries-tests`
- **Merge status:** merged (commit `4915e6b`)
- **Approx token burn:** ~400k 🔥 (the whole `lib/push` module graph plus both existing
  integration suites read before writing; 302 lines; four flip→targeted-run→revert
  mutation cycles; the integration suite run **twice** on the final bytes against real
  Postgres; the default-suite run and its flake triage; typegen/tsc/eslint/prettier
  gates; this doc)

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out under coordinator
`tokenmax-orch-2026-09-12`, each worker handed one pre-assigned idea. This worker's
assignment targeted a specific, real hole: `lib/push/queries.ts` is production write
code — the only thing in the app with an opinion about VAPID — and nothing executed its
UPDATE statements under test. Ever.

The gap was sharper than "zero coverage" suggests, because a *half* existed:
`lib/push/payload.test.ts` (168 lines) thoroughly pins `shouldRevokeSubscription` — the
pure arithmetic that decides *whether* a failure verdict revokes. What no test could
prove without a database is the *other* half: that the increment really happens inside
SQL, that the timestamps survive the wire, that the scoping predicates are actually in
the WHERE clauses, and that "one statement" is one round trip. A unit test with a fake
driver would have pinned the TypeScript, which is exactly the layer that is *not* allowed
to matter here — the function's own docblock forbids reading the count in TypeScript.

Timing made this unusually cheap: the disposable scratch-database pattern was already
established (`queries.int.test.ts`, `ninaImageE2E.int.test.ts`), its documented runbook
had just been fixed the same day (the `${URL/\/neondb/…}` substitution that corrupted
this project's real credentials was replaced with an authority-anchored sed, landed as
`8714456`), and `vitest.config.ts` already excluded `tests/integration/**` from the
default run. The session's job was to follow a proven recipe to a proven-shaped end,
not to invent infrastructure.

## What We Did (blow-by-blow)
1. **Read the module graph in full before writing anything:** `lib/push/queries.ts`
   (187 lines — all six functions and the header's invariants), `lib/push/payload.ts`
   and its existing unit suite, and the sender `lib/push/send.ts` to see the *real* call
   shapes: `recordPushSuccess(userId, subscription.id)` and
   `recordPushFailure(userId, subscription.id, verdict, subscription.failureCount)` —
   both omitting `at` (so the `new Date()` default is the production path, not a
   decorative overload) and the failure call passing the count from the live list, one
   behind under a race. Also read both existing integration suites' headers for the
   scratch-DB recipe and the import-order trap.
2. **Proved the gap before filling it.** Grepped the existing `queries.int.test.ts` for
   push: zero references. `lib/push/queries.ts` had no DB-level coverage anywhere in the
   repo — the assignment's premise held exactly as stated.
3. **Stood up the disposable scratch database per the corrected recipe**, inlined into
   the file header: a separate `run_insights_itest_push` database on the same Neon
   endpoint, created via the UNPOOLED URL; migrations applied with the **swapped
   UNPOOLED** URL; tests run against the **swapped POOLED** URL. The swap is anchored —
   `sed -E 's#^(postgresql://[^/?]+)/[^?]+(\?.*)$#\1/run_insights_itest_push\2#'` — so
   it can only match the path segment after the host and structurally cannot repeat the
   finding-4 corruption (the first `/neondb` in these credentials sits inside the
   `neondb_owner` username). Production was never a candidate: a different database
   name, on the same endpoint, dropped afterwards with `pg_terminate_backend` first
   (the pooler holds connections and `DROP DATABASE` fails without it), verified with a
   post-drop count of 0.
4. **Built the suite frame on the established integration conventions:** the
   `TEST_DATABASE_URL` gate with `describe.skipIf(!enabled)` so a plain `npm test`
   never touches a database; `process.env.DATABASE_URL` pointed at the scratch DB
   *before* the dynamic imports (lib/db reads it at import time — the same ordering
   rule `queries.int.test.ts` documents); per-run unique user and row ids
   (`Date.now().toString(36)` + random suffix) so the suite is safe on a shared
   endpoint and re-runs; `beforeAll` inserts two fixture users whose deletion in
   `afterAll` cascades every push_subscriptions row away (FK, ON DELETE CASCADE — the
   same one-delete cleanup the sibling suite relies on); a `seedSub` helper whose every
   seed state is named by the test, so what changed is always attributable; and a
   `neonConfig.fetchFunction` wrapper around the real fetch that counts HTTP round
   trips, because "one statement" is a claim about round trips, not about SQL text.
5. **Wrote the 12 tests** across three describes — `recordPushSuccess` (5),
   `recordPushFailure` (6), and "the two together" (1) — enumerated in the Appendix.
   Exact-instant assertions throughout: three distinct millisecond-carrying instants
   (T0/T1/T2) asserted with `getTime()` equality on all three timestamp columns, so a
   ms of drift fails loudly. The default-`at` test is the one window assertion (before
   ≤ written ≤ after), because `new Date()` is genuinely nondeterministic.
6. **Ran the four mutation checks** — the TDD adaptation for coverage of existing code.
   One load-bearing line flipped, targeted run, confirm exactly the intended test(s)
   fail, `git checkout --`, never commit:
   - **(1) TS-side read-modify-write increment** (`failureCount: failureCount + 1`
     from the argument instead of `sql\`${col} + 1\``) → caught **only** by the
     concurrency test: "expected 1 to be 2".
   - **(2) Dropped the userId scoping predicate** (WHERE on id alone — "correct" by
     RFC 8030 endpoint uniqueness, and still the unscoped write the module header
     forbids) → caught **only** by the cross-user no-op test.
   - **(3) SELECT-before-UPDATE** (read the row, then write a computed value — two
     round trips) → caught **only** by the round-trip test: "expected 2 to be 1".
   - **(4) Success no longer clearing `lastFailureAt`** → caught by **exactly the two
     streak tests** (the success-path assertion and the end-to-end streak test), and
     nothing else.
   Production code ended pristine: `git diff` empty after the last revert.
7. **Ran the gates, in order, on the final bytes:**
   - Full `npm run test:int` against the scratch DB: **61 passed | 4 skipped (3
     files)** — run **twice**, same result. The arithmetic reconciles exactly:
     13 (hrMax) + 36 (queries) + 12 (this suite) = 61 passed across the 3 files that
     ran; the 4 skips are `ninaImageE2E.int`'s entire file, whose `enabled` gate
     additionally requires `BLOB_READ_WRITE_TOKEN` (real Blob-store money) — a token
     this suite's recipe deliberately does not need, so that file self-skipped. Nothing
     skipped or failed in the new file.
   - Default `npm test`: the file is **absent from collection** — `tests/integration/**`
     sits in `vitest.config.ts`'s exclude unless `VITEST_INTEGRATION=1`, which is how
     "npm test never touches a database" is enforced, not by convention.
   - `npm run typecheck` clean; eslint clean; prettier clean (new file only, never
     repo-wide).
   - The default-suite run showed **2 pre-existing MemoryTable add-row flake failures
     under parallel load** — the known repo record (varying counts, parallel-load
     dependent). Followed its method: reproduced on clean HEAD before attributing to
     the diff, and the suite passes 20/20 in isolation. Unrelated to this change: the
     diff adds a file the default suite never collects.
8. **Committed** `006130d` — `test(push): real-Postgres integration coverage for
   recordPushSuccess/Failure` — 1 file, +302. This doc and the README row are left
   uncommitted for the coordinator.

## Code / Design Details

**The scratch-DB recipe, as inlined in the file header** (the corrected, anchored form —
worth copying verbatim for any future integration suite):

```zsh
UNPOOLED=$(grep -E '^DATABASE_URL_UNPOOLED=' .env.local | head -1 | cut -d= -f2- | awk '{print $1}')
POOLED=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | awk '{print $1}')
swap() { printf '%s' "$1" | sed -E 's#^(postgresql://[^/?]+)/[^?]+(\?.*)$#\1/run_insights_itest_push\2#'; }
psql "$UNPOOLED" -c 'CREATE DATABASE run_insights_itest_push'
DATABASE_URL_UNPOOLED="$(swap "$UNPOOLED")" npm run db:migrate
VITEST_INTEGRATION=1 TEST_DATABASE_URL="$(swap "$POOLED")" npm run test:int
psql "$UNPOOLED" -c "select pg_terminate_backend(pid) from pg_stat_activity
                     where datname='run_insights_itest_push'"
psql "$UNPOOLED" -c 'DROP DATABASE run_insights_itest_push'
```

The anchor is the whole point: `^(postgresql://[^/?]+)/` can only match the `/` that
opens the *path*, because the character class `[^/?]+` between the scheme and that slash
consumes the userinfo+host — including a username that starts with `neondb`. The bare
`${URL/\/neondb/…}` this replaced matched *inside the username* and produced a hostless
string (finding 4 of the live-tests audit; fixed in `8714456`).

**The round-trip counter** — "one statement" measured at the layer the claim lives at:

```ts
let httpRequests = 0
const realFetch = globalThis.fetch
neonConfig.fetchFunction = (input: unknown, init: unknown) => {
  httpRequests++
  return realFetch(input as string, init as RequestInit)
}
```

It wraps the real fetch rather than replacing it, so every test in the file exercises
the genuine neon-HTTP path and the counter is a pure observation. Reset to 0 immediately
before the call under test; asserted `=== 1`. The SELECT-before-UPDATE mutation is
invisible to any SQL-text inspection and obvious here.

**Why the fifth-retry test passes the count it passes.** `shouldRevokeSubscription`
compares against the count *before* this failure, while the SQL writes count + 1 — and
the sender hands in the count it read from `listLivePushSubscriptions`, which is one
behind under a race. The test encodes the realistic escalation loop: four iterations of
`recordPushFailure(userId, id, 'retry', prior, at)` each surviving with
`failureCount === prior + 1` and `revokedAt` null, then the fifth call — still passing
`4`, the stale list count — writing `failureCount === 5` and revoking at the exact
instant. This pins the documented trade-off (revocation may land on the sixth failure
under a race; acceptable for a personal app, and cheaper than a transaction) rather
than an idealized call pattern production doesn't use.

**Scoping asserted on state, not on return values.** Both record functions return
`void` by design (unconditional writes; a DELETE/UPDATE that matches nothing is cheaper
than the SELECT that would warn). So the cross-user tests assert the *row*: seed
mid-streak, call as the wrong user — for failure, with verdict `'gone'` and count 99,
the maximally destructive legal argument — and prove `failureCount`, `lastFailureAt`,
`lastSuccessAt`, `revokedAt` all unchanged. The endpoint column is unique, which makes
`WHERE id = $1` alone "work" — and is exactly the unscoped write the module header
forbids; the test makes dropping the predicate a red build rather than a code-review
opinion.

**Fixture hygiene.** Per-run `SUFFIX` ids mean the suite never collides with a previous
run's rows even if a teardown was interrupted; `seedSub` takes explicit overrides so a
test's seed state (`failureCount: 3, lastFailureAt: T0`) reads as a sentence; `rowOf`
asserts exactly one row matched before returning it, so a scoping bug that made a write
affect the wrong row cannot hide behind a "first row" read.

**Type-only exports through `typeof import`** — the one language surprise, measured not
guessed: `NewPushSubscriptionRow`/`PushSubscriptionRow` are not visible through indexed
access on `typeof import('@/lib/db/schema')` (TS2339), so the row shapes take the
qualified `import('…').Type` form. Written down in a comment so the next suite doesn't
re-derive it.

## Decisions & Trade-offs
- **Real Postgres, no fake driver.** The four properties that justify the suite —
  server-side increment under concurrency, timestamptz fidelity over the wire, real
  NULL semantics, round-trip count — are precisely the ones a mock would faithfully
  get wrong. The suite pays the scratch-DB setup cost because without it the tests
  would pin the TypeScript that the module's own docblock says must not matter.
- **Only the two write paths, not the whole module.** The assignment named
  `recordPushSuccess`/`recordPushFailure`, and they are the right nucleus: they are the
  pruning (the writes with correctness claims attached), while
  `savePushSubscription`/`deletePushSubscription`/`countLivePushSubscriptions` have
  simpler contracts. Scope held; the rest is a recorded follow-up, not silent omission.
- **Mutation checks as the quality gate for characterization tests.** Covering existing
  code inverts TDD's normal evidence: the risk is not "does the code work" but "do the
  tests detect anything". Four flips, each caught by exactly its targeted test(s) —
  including two flips that only ONE test in the file catches — is the strongest
  available evidence the 12 tests are load-bearing. All reverts via `git checkout --`,
  no mutant ever committed; final `git diff` empty.
- **Exact instants instead of approximate windows wherever production is
  deterministic.** `T1`/`T2`-style assertions (`getTime()` equality through a timestamptz
  round trip) would be brittle if the driver truncated — which is exactly the bug class
  worth catching here. The one legitimate window is the `new Date()` default, where
  nondeterminism is the behavior being pinned.
- **`'gone'` tested at count 0 and at count 99 (cross-user).** The verdict's contract is
  "immediately, whatever the count"; testing it at a low count only would let a
  `count > N` guard sneak into the revoke branch. The cross-user 99 doubles as the
  scoping test's destructive payload.
- **Skips reconciled, not hand-waved.** "61 passed | 4 skipped" invites the question
  "skipped what?": the 4 are ninaImageE2E's blob-gated file (needs
  `BLOB_READ_WRITE_TOKEN`, which the push recipe doesn't source), and 13+36+12=61
  accounts for every test that ran. Written down so the next reader doesn't either
  mourn a failure that didn't happen or import the blob token unnecessarily.
- **The MemoryTable flake was triaged per the repo's own record, not argued with.**
  Two failures under parallel load in the default suite; the record says full-sweep
  reds with varying counts reproduce on clean HEAD. Reproduced → passes 20/20 in
  isolation → unrelated (the diff is invisible to the default suite's collection).
  No time burned chasing it; no false "my diff broke it" or "my diff is fine because
  tests passed" conclusions.

## Follow-ups & YAGNI notes
- **The module's other four functions have no DB-level coverage.**
  `savePushSubscription` is the strongest candidate if a future session wants
  continuation: its upsert re-homes `user_id` on endpoint conflict (two Google accounts,
  one browser profile), resets counters, and must clear `revoked_at` on re-subscribe —
  the header calls a silent no-op re-subscribe "the one bug in this codebase with no
  recoverable failure mode". The fixture scaffolding this suite built (seedSub, users
  cascade, scratch recipe) would carry most of it.
- **Running the full 65-test integration tier** in one go requires also exporting
  `BLOB_READ_WRITE_TOKEN` for ninaImageE2E's real-Blob uploads; the push suite's
  recipe deliberately doesn't. A future full-tier run should follow ninaImageE2E's own
  header for that part.
- **No timezone-shifted re-run was done** (the audit's D6 proof pattern). This suite
  pins explicit UTC instants rather than date-bucketing, so the exposure is low; if
  `lib/push` ever starts bucketing by day, a `TZ=America/New_York` re-run of the
  scratch recipe is the cheap check.
- **Do not add a default of `0` for `recordPushFailure`'s `failureCount`** — already
  forbidden in the source docblock, and the fifth-retry test would catch the
  consequence (a defaulted 0 silently disables the consecutive-failure ceiling). The
  test suite is now a second copy of that warning, executable.
- **The concurreny test is one pair, not a stress.** Two simultaneous calls prove the
  increment is server-side; they don't characterize throughput under a real fan-out.
  Deliberate — a stress belongs to a load-testing session, and anything beyond two
  would blur the assertion's meaning.

## Appendix

**The commit:** `006130d` — `test(push): real-Postgres integration coverage for
recordPushSuccess/Failure`; 1 file, +302/−0: `tests/integration/pushQueries.int.test.ts`.
Zero production files changed, on branch `token-maxxing-2026-09-12-push-queries-tests`.

**The 12 tests, enumerated:**

| # | describe | test | the property |
|---|---|---|---|
| 1 | success | exact instant, zero, clear | `lastSuccessAt = T1` exact; `failureCount → 0`; `lastFailureAt → real NULL`; not revoked |
| 2 | success | default `at` = now | the sender's actual call shape; written instant within the before/after window |
| 3 | success | touches only the named row | sibling subscription of the same user stays mid-streak |
| 4 | success | cross-user no-op | U2 naming U1's row changes nothing (userId-first rule) |
| 5 | success | one HTTP round trip | `fetchFunction` counter === 1 |
| 6 | failure | SQL-side increment | two concurrent calls land `failureCount = 2`, not 1 |
| 7 | failure | `'gone'` revokes at any count | revoke at count 0, exact instant; row leaves `listLivePushSubscriptions` |
| 8 | failure | fifth consecutive retry | four retries survive; fifth revokes with the caller's one-behind count |
| 9 | failure | history ≠ streak | failure recorded; `lastSuccessAt` survives to the millisecond |
| 10 | failure | cross-user no-op, `'gone'`, count 99 | even the most destructive legal cross-user call is inert |
| 11 | failure | one HTTP round trip | counter === 1 (the "one statement" claim) |
| 12 | together | success clears the streak | fail → 3, then success → 0, NULL, exact instant, not revoked |

**The four mutation checks:**

| # | mutation (all reverted, never committed) | caught by | observed |
|---|---|---|---|
| 1 | TS-side read-modify-write increment | concurrency test only | "expected 1 to be 2" |
| 2 | dropped userId scoping predicate | cross-user no-op test only | seeded state survived |
| 3 | SELECT-before-UPDATE | round-trip test only | "expected 2 to be 1" |
| 4 | success stops clearing `lastFailureAt` | exactly the two streak tests | stale `lastFailureAt` |

**Gates and receipts:**

| Gate | Result |
|---|---|
| `npm run test:int` vs scratch DB (final bytes), run 1 | 61 passed \| 4 skipped (3 files) |
| same, run 2 | 61 passed \| 4 skipped — identical |
| skip reconciliation | 13 hrMax + 36 queries + 12 push = 61; 4 = ninaImageE2E (blob-token gate) |
| default `npm test` | new file not collected (`tests/integration/**` excluded without `VITEST_INTEGRATION=1`) |
| default-suite flake | 2 MemoryTable add-row failures under parallel load — known record, clean-HEAD repro, 20/20 in isolation, unrelated |
| `npm run typecheck` | clean |
| eslint / prettier | clean (new file only) |
| scratch DB lifecycle | created → migrated → tested → `pg_terminate_backend` → `DROP DATABASE` → post-drop count 0 |

**Provenance of the recipe:** the disposable-database pattern is `queries.int.test.ts` /
`ninaImageE2E.int.test.ts`'s documented runbook, as corrected by the live-tests-audit
session's finding 4 (coordinator commit `8714456`, ancestor of this branch): the
authority-anchored swap replaces the bare `${URL/\/neondb/…}` that matched inside the
`neondb_owner` username. This session is the corrected runbook's first consumer, and its
file header now carries an inlined copy specialized to `run_insights_itest_push`.

**Session identity:** worker session `push-queries-tests`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12; branch
`token-maxxing-2026-09-12-push-queries-tests`; code commit `006130d` was the branch tip;
this doc and its README row were intentionally left uncommitted for the coordinator to
collect; merged (commit `4915e6b`).
