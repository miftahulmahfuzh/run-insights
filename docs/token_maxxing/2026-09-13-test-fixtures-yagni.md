# Token-Maxxing Session — 2026-09-13: Test Fixtures YAGNI

## 🎯 Achievement / End Result
- **Goal of the burn:** Audit the 4 knip-flagged unused exports in `tests/fixtures/` and `tests/support/` (`CANONICAL_RUN_ID`, `NINA_FIXTURE_NOW`, `repoRoot`, `RecordedQuery`) and determine, symbol by symbol, whether each is genuinely dead test infrastructure or deliberately-kept-but-misclassified — never just delete on knip's say-so.
- **Concrete changes:** 8 files touched, +18/-13 lines, single commit `f9eac68` on this branch.
  - Un-exported 3 genuinely self-file-only-used symbols (`CANONICAL_RUN_ID`, `NINA_FIXTURE_NOW`, `RecordedQuery`) — kept the definitions, dropped only the `export` keyword.
  - Adopted the 4th (`repoRoot`) into 5 test files that had each independently reinvented the identical repo-root computation as a local `ROOT` const, instead of importing the already-exported helper.
- **Real value delivered:**
  - Closed all 4 knip flags with zero behavior change and zero deletions of live logic — knip census: 28→25 unused exports, 43→42 unused types, no new flags introduced.
  - Found and fixed a real DRY violation knip's "unused export" framing couldn't see on its own: `repoRoot` wasn't dead, it was un-adopted — 5 files were quietly duplicating `fileURLToPath(new URL('../', import.meta.url))` byte-for-byte instead of importing it.
  - Surfaced (without acting on) a documented drift-risk: the literal string `'run_canonical'` is hand-typed in 6 other test files rather than importing `CANONICAL_RUN_ID` — recorded as a future-session candidate, not fixed here, because those 6 files don't share the correctness dependency that would justify the import.
  - Full regression proof: typecheck clean, prettier clean, 332 test files / 5744 tests green, fresh knip census confirms all 4 original flags gone.
- **Branch:** token-maxxing-2026-09-13-test-fixtures-yagni
- **Merge status:** on branch (coordinator handles merging; this session does not merge to main)
- **Approx token burn:** high — full-repo grep sweeps per symbol, 25-file external-caller inference check for `RecordedQuery`, plus a full typecheck/prettier/vitest/knip verification pass. 🔥

## Context & Motivation
This idea was one slot in a coordinator-run fan-out of several parallel token-maxxing workers today, assigned the slug `test-fixtures-yagni`. Test-infra dead code (fixtures, support harnesses) is easy to miss in ordinary dead-export sweeps because it lives outside `lib/` and `components/`, gets scanned by knip the same as production code, and has never been audited at this level of rigor before in this repo. The repo's own accumulated lessons (see `dead-export-sweep-verifier-traps` and `optional-prop-scan-method` in project memory) warn that a flat "knip says unused, so delete it" pass is a trap: self-only-used exports should be un-exported rather than deleted (keeps the fixture's shape intact for the file that still uses it internally), and sometimes the right question isn't "why is this dead" but "why has nobody adopted it yet."

The 4 flagged symbols were:
1. `CANONICAL_RUN_ID` — `tests/fixtures/canonicalRun.ts`
2. `NINA_FIXTURE_NOW` — `tests/fixtures/ninaContext.ts`
3. `repoRoot` — `tests/support/importGraph.ts`
4. `RecordedQuery` — `tests/support/fakeDb.ts`

## What We Did (blow-by-blow)

### 1. `repoRoot` — the live-but-unadopted case
Grepped the repo for anything importing `repoRoot` from `tests/support/importGraph` — zero hits, confirming knip's flag was technically accurate. But rather than stopping there, searched for what *else* in the test tree computes a repo root, and found five files each defining their own local `ROOT` constant via the exact same expression:

```ts
const ROOT = fileURLToPath(new URL('../', import.meta.url));
```

in:
- `tests/motion.reducedMotion.test.ts`
- `tests/admin.photoGrid.test.ts`
- `tests/admin.photoReference.test.ts`
- `tests/pwa.install.test.ts`
- `tests/admin.shell.test.ts`

Verified byte-for-byte identity of the URL expression across all five (grep, not eyeballing), and verified `repoRoot`'s own implementation in `importGraph.ts` derives from the same `'../'`-suffixed URL, so its trailing-slash behavior matches what the five files expected. This meant the fix was safe: import the existing `repoRoot` export instead of re-deriving it locally. Edited all five files to:
- import `repoRoot` from `./support/importGraph`
- drop the now-redundant `node:url` / `fileURLToPath` import
- drop the local `ROOT` computation
- use `repoRoot` wherever `ROOT` was previously referenced

This is the session's one genuine "un-export would have been wrong" finding — knip was right that nothing imported it, but the correct fix was wiring it up, not deleting the export or the helper.

### 2. `CANONICAL_RUN_ID` — genuinely dead export, kept the constant
Grepped the whole repo, word-boundary, excluding the definition file (`tests/fixtures/canonicalRun.ts`) — zero external importers. Inside that file, the only reference is internal: `canonicalSession.runId` is set from it. Un-exported it by dropping the `export` keyword; the constant itself and its usage inside the file are untouched.

While investigating, found the literal string `'run_canonical'` hardcoded (not imported, just retyped) in 6 other files:
- `components/profile/BadgeDialog.test.tsx`
- `components/profile/BadgeShelf.test.tsx`
- `tests/badges.gateway.test.ts`
- `tests/badges.render.test.ts`
- `tests/badges.shelf.test.ts`
- `tests/panel.render.test.ts`

Inspected each: they're independent unit tests for badge rendering and URL-building that need *some* run-id string as a stand-in, not specifically the canonical fixture's value — they don't share a correctness dependency on `CANONICAL_RUN_ID`'s exact value the way the canonical-run fixture consumers do. Concluded this is real drift-risk (a future rename of the constant's value would silently desync these 6 hardcoded copies) but explicitly out of scope for this session: not a deletion, not a migration, just a recorded observation for whoever picks up test-fixture hygiene next.

### 3. `NINA_FIXTURE_NOW` — genuinely dead export, kept the constant
Grepped the whole repo excluding the definition file (`tests/fixtures/ninaContext.ts`). One hit outside test/source code: `.workflows/plan/nina-chatbot/phase-2.md`, but that's a plan document mentioning the symbol in prose/history — not a real import, and per the repo's own `adopted-plan-copies-trip-string-guards` lesson, plan-doc prose hits are noise for this kind of guard, not real callers. The only real reference is internal, `now: NINA_FIXTURE_NOW` inside `ninaFixtureInput`. Un-exported it — dropped `export`, kept the constant and its existing Jakarta-timezone-boundary doc comment intact.

### 4. `RecordedQuery` — genuinely dead export, kept the interface
`RecordedQuery` is an interface in `tests/support/fakeDb.ts` backing `FakeDb.queries: RecordedQuery[]` and the internal `dumpSql` helper. Checked every external caller of the fake DB's query-inspection surface (`fake.only()`, `fake.last()`, `fake.sqlAt()`) across roughly 25 test files. Every one of them destructures `.sql` / `.params` / `.batched` directly off the returned value and relies on TypeScript's structural inference — none of them spell out `RecordedQuery` as a type name anywhere. So the type name itself is genuinely never referenced outside the file. Un-exported it — dropped `export`, kept the interface and its internal callers unchanged.

### Verification pass
Ran the full local gate before treating this as done:
- `npm run typecheck` (Next.js typegen + `tsc --noEmit`) — clean. 17 pre-existing `PageProps`/`LayoutProps` typegen errors showed up, but a stash-and-check of a clean HEAD confirmed those predate this work and are unrelated.
- `npx prettier --check` on all 8 touched files — clean.
- Full `npx vitest run` — 332 test files, 5744 tests, all passed.
- Fresh `npm run knip` — confirmed all 4 originally-flagged entries are gone from the census (unused exports 28→25, unused types 43→42), and no new flags were introduced by the `repoRoot` adoption edits.

## Code / Design Details
Representative before/after for one of the five `repoRoot` adoptions (pattern was identical across all five):

```ts
// before (tests/admin.photoGrid.test.ts, and four siblings)
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
// ...later usage of ROOT...

// after
import { repoRoot } from './support/importGraph';
// ...later usage of repoRoot in place of ROOT...
```

Un-export pattern applied identically to the other three symbols — no logic change, just visibility:

```ts
// before
export const CANONICAL_RUN_ID = 'run_canonical';

// after
const CANONICAL_RUN_ID = 'run_canonical';
```

(Same shape for `NINA_FIXTURE_NOW` in `ninaContext.ts` and the `RecordedQuery` interface in `fakeDb.ts`.)

## Decisions & Trade-offs
- **Un-export, don't delete, for self-only-used symbols.** Consistent with this repo's established `dead-export-sweep-verifier-traps` lesson: deleting `CANONICAL_RUN_ID`/`NINA_FIXTURE_NOW`/`RecordedQuery` outright would have meant inlining their values/shape back into the one file that uses them, for no readability gain and extra diff noise. Un-exporting satisfies knip, keeps the code identical in behavior, and preserves the option to re-export later if a second consumer appears.
- **Adopt `repoRoot` rather than leave it unexported too.** Unlike the other three, `repoRoot` had real latent consumers (five files wanting the exact same computation) — un-exporting it would have been the wrong call, since the point of the export was cross-file reuse that just hadn't happened yet. This is the asymmetry the session is built around: not every "unused export" is dead in the same way.
- **Did not touch the 6 files hardcoding `'run_canonical'`.** Considered migrating them to import `CANONICAL_RUN_ID`, but they test different concerns (badge rendering/URL construction) with only an incidental dependency on some run-id string, not the specific canonical value. Forcing an import there would create a coupling that doesn't reflect a real shared correctness requirement — recorded as a note instead of acted on.
- **Scope discipline.** Stuck to exactly the 4 flagged symbols and their direct fallout (the 5-file `repoRoot` adoption). Did not expand into a broader `tests/fixtures`/`tests/support` sweep beyond what these 4 symbols required, keeping the diff small (+18/-13 across 8 files) and easy to verify in full.

## Follow-ups & YAGNI notes
- **Not done, deliberately:** migrating the 6 files that hardcode `'run_canonical'` to import `CANONICAL_RUN_ID`. Left as a documented drift-risk for a future session; if the canonical fixture's run-id value ever changes, those 6 files will silently desync. Whoever picks this up should first re-check whether those tests still only need "a" run-id string or have grown a real dependency on the canonical value.
- **Not done:** any broader sweep of `tests/fixtures/` or `tests/support/` beyond the 4 knip-flagged symbols — this session was scoped narrowly by the coordinator's assignment, and other parallel workers may be covering adjacent test-infra ground today.
- No new TODOs were opened in `.workflows/todos.md` for this — the drift-risk note above lives here in the session doc per the framing given for this session, not as a tracked task.

## Appendix
Commands run during verification (from the worktree root):
- `npm run typecheck`
- `npx prettier --check tests/admin.photoGrid.test.ts tests/admin.photoReference.test.ts tests/admin.shell.test.ts tests/fixtures/canonicalRun.ts tests/fixtures/ninaContext.ts tests/motion.reducedMotion.test.ts tests/pwa.install.test.ts tests/support/fakeDb.ts`
- `npx vitest run`
- `npm run knip`

Commit on this branch: `f9eac68` — "fix(tests): resolve the 4 knip-flagged unused test-infra exports"

Files touched:
- `tests/admin.photoGrid.test.ts`
- `tests/admin.photoReference.test.ts`
- `tests/admin.shell.test.ts`
- `tests/fixtures/canonicalRun.ts`
- `tests/fixtures/ninaContext.ts`
- `tests/motion.reducedMotion.test.ts`
- `tests/pwa.install.test.ts`
- `tests/support/fakeDb.ts`
