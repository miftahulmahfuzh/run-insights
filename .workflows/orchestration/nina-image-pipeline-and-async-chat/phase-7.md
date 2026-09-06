# Phase 7: End-to-end: chat → `set_avatar` → generation → the profpic really changes

**Plan set:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md`
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Satisfies:** R5 — "try to make an end to end test, from chat asking nina to change profpic, until that profpic truly being updated."
**Depends on:** Phase 3 (declared) — and transitively phases 1 and 2, because 3 depends on 2 and 2 depends on 1. Every assertion in this phase is written against the tree **after phase 1 has landed**; three of them fail loudly against today's code, which is the point.
**Difficulty:** NORMAL
**Package:** `tests/integration`, `tests/live`

---

## Goal

After this phase, `npm run test:int` drives a real `set_avatar` tool call through the real handler,
the real quota check, the real job row, the real doorbell and the real generator against a real
Postgres and a real Blob store, and asserts that `getCurrentNinaAvatar(userId)` — the exact read the
chat header, `/nina/about` and `/admin` perform — now returns a `source='generated'`,
`announced_at IS NULL` row that did not exist before the turn. The same file drives the **selfie**
path, which is the only one that writes `nina_messages` and therefore the only one that can catch
Finding 1. A second, opt-in `tests/live/` variant spends real money to prove the two things the
cheap test buys with a fake: that `glm-5.3` really reaches for `set_avatar`, and that
`qwen/qwen-image-3-pro` really returns bytes for the prompt we assemble.

---

## THE HONEST SEAMS — read this before the code

Two calls cost real money and real wall clock. A test cannot both stub them and prove them. This
phase decides layer by layer, and writes down what each layer therefore does and does not guarantee.

> **RECONCILED — THIS PHASE RUNS AFTER PHASE 2, AND PHASE 2 DELETES THE DOORBELL.** This plan was
> written against the shipped, GitHub-hosted pipeline. Its `Depends on` is phase 3, which depends on
> 2, which depends on 1 — so by the time this test is written, **on Branch A there is no
> `fireNinaImageDispatch`, no `markNinaImageJobDispatched`, no `GITHUB_DISPATCH_TOKEN`, no
> `workflow_dispatch` POST, and nothing that writes `error_code = 'dispatched'`.** Four assertions
> in the draft's Step 1 would have failed against the tree this phase actually lands on, and one of
> them (`expect(githubDispatches).toHaveLength(1)`) would have failed on a symbol that no longer
> exists.
>
> The table and Step 1 now carry **both shapes**, Branch A first. Which one you write is decided by
> phase 2's Step 1 probe and is recorded in the plan index's *Decisions* table — read that row
> before writing a line of this file.

| Layer | Integration test — **Branch A** (in-platform, expected) | Integration test — **Branch B** (probe failed; GitHub stays the host) | Live test (`test:live:nina-image`) |
|---|---|---|---|
| The model's **decision** to call `set_avatar` | **FAKED.** `scriptedClient` returns a hand-written `tool_use` block. | same | **REAL.** `ninaClient()` against `glm-5.3`. |
| The turn **loop** that dispatches the tool | REAL — `runNinaTurnWith` with `toolSet: NINA_FULL_TOOL_SET`. | same | REAL. |
| `handleSetAvatar`, the in-flight guard, `generateNinaAvatar`, the quota check, `buildNinaImagePrompt`, `openNinaImageJob` | REAL. | same | REAL. |
| The handoff to the generator | `fireNinaImageGeneration` → an `after()` the test COLLECTS. Nothing is stamped `dispatched`; the row stays `queued`. | `fireNinaImageDispatch` → `markNinaImageJobDispatched`, a real write; row goes `dispatched`. | Branch-dependent, and irrelevant: `after()` is never drained. |
| The GitHub `workflow_dispatch` POST | **DOES NOT EXIST.** The router asserts **no** `api.github.com` request is made at all — a strictly stronger statement of invariant 4 than inspecting a payload. | **FAKED** (routed to a 204; the payload is asserted to carry only the opaque nanoid). | **SKIPPED** — `after()` is collected and never drained. Dispatching the real workflow from a test would start a second generator against the same row. |
| The **claim** | REAL — `claimNinaImageJob` inside `runNinaImageJob`, against a `queued` row. Finding 2 cannot recur here because there is no grace window; the regression lives in phase 1's `dispatchCutoffFor` unit tests, which still guard the backstop and the 15 historical rows. | REAL — `claimJob` against a row that is genuinely `dispatched` and seconds old. **This is the end-to-end Finding-2 assertion.** | REAL, against a `queued` row. |
| The **OpenRouter image call** | **FAKED** — `globalThis.fetch` is routed at `OPENROUTER_IMAGE_URL`; a 1×1 PNG and `usage.cost: 0.04` come back. No money. `lib/nina/imagecall.ts` uses the global, so the router reaches it. | same, via the worker's `generate`. | **REAL. $0.040 per run, ~78 s.** |
| The **Blob `put`** | **REAL.** ~70 bytes, free tier, `del()`ed in `afterAll`. See "why the blob is real" below. | same | REAL. |
| `finishAvatar` / `finishSelfie` / `closeFailed` and every terminal write | REAL. | REAL. | REAL. |
| The final read (`getCurrentNinaAvatar`) | REAL. | REAL. | REAL. |

**What the integration test therefore DOES guarantee.** Everything from the tool boundary down —
which is where all three measured defects live. It cannot pass if the job is never claimed
(Finding 2), if a `nina_messages` write omits `session_id` (Finding 1), if a job that spent money
records `cost_micro_usd` NULL (Finding 1's blast radius), if two `is_current` avatar rows exist, if
`announced_at` is stamped, or if the prompt stored in `nina_turns.args` is not the prompt sent to
the provider.

**What it does NOT guarantee.** That `glm-5.3`, shown a real request in Indonesian, chooses
`set_avatar` at all. That `qwen/qwen-image-3-pro` accepts the assembled prompt. That the real
`workflow_dispatch` reaches a runner. The first two are exactly what the live variant buys; the
third is phase 2's own exit criterion and is not re-proved here.

**Why the Blob is REAL and not mocked, in a test that mocks OpenRouter.** Measured:
`node_modules/@vercel/blob/dist/index.js:90` reads `import { fetch } from "undici"`, **not**
`globalThis.fetch`. `vi.stubGlobal('fetch', …)` cannot see it, and `vi.mock('@vercel/blob')` cannot
either, because `scripts/nina-image-worker.ts` loads the package through
`createRequire(import.meta.url)` — a genuine Node `require` outside Vitest's module graph. The
alternatives were an `undici` `MockAgent` (fragile: depends on the test and the package resolving to
the same hoisted `undici` instance, and forces the test to fake a vendor wire format) or a new
injection point in production code. A real 70-byte upload costs nothing, is deleted in `afterAll`,
and *strengthens* the test: `store()`'s pathname, content type, `addRandomSuffix` and
`allowOverwrite: false` are proved against the real API instead of against our idea of it.

**Why the test does not drive `sendNinaMessage`.** Three reasons, all of them structural rather than
lazy. It would need `requireUserId()` mocked, which replaces the one thing an action is for. After
phase 3 the turn moves into a durable background task, so awaiting the action no longer awaits the
turn — the test would need a seam phase 3 has not published yet. And the action's contribution to
R5 is exactly one line: which tool set it passes. That line is covered by driving
`runNinaTurnWith` with the same `NINA_FULL_TOOL_SET` the action passes, plus a one-line assertion
that the set contains both image tools. See **Requires (from earlier phases)** for the seam that
would let a later card close the remaining gap.

**What running this does to the DAILY CAP.** `NINA_IMAGE_DAILY_CAP` is 6 and `countNinaTurnsSince`
counts failures too, so a suite that opens jobs can exhaust a real quota. It cannot exhaust the
user's, because **every row in this phase hangs off a throwaway user** whose id carries a unique
suffix (`itest-nina-<suffix>`), created in `beforeAll` and deleted in `afterAll`, and
`ninaImageQuotaLeft` is `WHERE user_id = $1`. The integration suite opens **exactly three** image
jobs against that user (avatar success, selfie success, selfie terminal failure), which is inside
the cap with headroom, and spends **zero** OpenRouter money because the provider call is routed.
The live suite opens **one** job against its own throwaway user and spends **$0.040**.

---

## Interface Contract

**Deletes:** none.
**Renames:** none.
**Creates:**
- `tests/integration/ninaImageE2E.int.test.ts` (new file)
- `tests/live/ninaImageE2E.live.test.ts` (new file)
- `package.json` script `test:live:nina-image`

**Signature changes:** none. **This phase changes no production code.** No new injection point was
needed: `scripts/nina-image-worker.ts` already exports `runOneJob(sql, jobId)` and `claimJob(sql,
jobId, now)` taking the `NeonSql` client as an explicit argument, and `main()` is guarded by
`import.meta.url === process.argv[1]`, so importing the worker runs nothing. That guard and that
parameter are the seam; do not remove either.

**Requires (from earlier phases)** — a reconciler-matchable list. Each is stated as a property, not
as a file, so it survives whichever branch the earlier phase took.

1. **Phase 1 — `claimJob` must claim a NAMED job regardless of the dispatch grace window.** The
   integration test drains `after()` before it runs the generator, so the row is genuinely
   `error_code='dispatched'` and seconds old. Against today's code `runOneJob` returns `'none'` and
   the suite fails on the very first case. This is deliberate: it is Finding 2, asserted end to end.
2. **Phase 1 — both `nina_messages` INSERTs in the generator must write `session_id`, resolved from
   `args.replyToId` first and the user's most recent session second.** The selfie cases assert the
   resolved session is the one the runner asked in (session **B**) and not the newest one
   (session **C**), so a fallback-only fix fails the test.
3. **Phase 1 — `closeFailed`'s terminal `UPDATE nina_turns … status='failed', cost_micro_usd=…` must
   run even when the apology INSERT fails.** Asserted as `cost_micro_usd` non-null on a job whose
   provider call was billed (invariant 9).
4. **Phase 2 — the generator entry point. RESOLVED against phase 2's real contract; both branches
   are now concrete rather than hypothetical.**
   - **Branch A (Fluid compute confirmed; generator moves in-platform) — the expected branch.**
     Phase 2 exports, from `lib/nina/imagerun.ts`:
     `runNinaImageJob(userId, jobId, opts?): Promise<'none' | 'ok' | 'retry' | 'gave-up'>` — an
     awaitable that performs claim → call → store → finish, with the four return values matching
     `runOneJob`'s one for one. **Exactly one function in the test file changes**, `runGenerator()`,
     and its three call sites do not. Phase 2 also exports the non-blocking wrapper
     `fireNinaImageGeneration`, which is what `selfiegen`/`avatargen` call and what registers the
     `after()`; the test must use the awaitable, not the wrapper, because a test cannot assert a
     terminal state it cannot await.
     
     **But four things beyond `runGenerator()` DO change on this branch**, and they are why Step 1
     carries two shapes rather than one: there is no `GITHUB_DISPATCH_TOKEN` to stub, no
     `api.github.com` arm needed in the router (beyond asserting nothing hits it), no
     `error_code = 'dispatched'` to observe, and no dispatch payload to inspect for invariant 4.
   - **Branch B (probe shows 60 s; generator stays on GitHub Actions):** nothing new is needed.
     `scripts/nina-image-worker.ts`'s exported `runOneJob(sql, jobId)` is that entry point, phase 2
     leaves that file untouched ("not one line"), and its `main()` stays guarded by
     `import.meta.url === process.argv[1]` so importing the worker runs nothing. **Verified against
     the shipped source: `runOneJob` is exported at `:564` and the guard is at `:656`.** The
     draft's Step 1 is correct as written on this branch.
   - Either way the OpenRouter call goes through `globalThis.fetch` — the worker's `generate` does
     today and phase 2's `callNinaImageModel` does too — so the router intercepts it on both
     branches, and the Blob write keeps using `@vercel/blob`'s `put`.
   - **Either way `cost_micro_usd` is a per-JOB CUMULATIVE TOTAL** across attempts, on both hosts
     (index *Decisions*, invariant 9). This changes one assertion in case 3; see Handoff 1.
5. **Phase 3 — RESOLVED: it publishes no awaitable background-turn export, and it publishes
   something better for this purpose.** Phase 3's `runNinaBackgroundTurn` and
   `startNinaBackgroundTurn` are deliberately **not exported** — a `'use server'` module may export
   only async functions, and phase 3 keeps the runner non-exported and inside `lib/nina/actions.ts`
   so it stays in the payload guard's sanctioned file. So there is nothing to import and no case to
   append; the test drives `runNinaTurnWith` directly, as written, and says so.

   What phase 3 *does* publish, and names this phase as the consumer of, is the pair
   **`pollNinaReply({ sessionId, afterSeq })`** and **`getPendingNinaChatTurn(userId, sessionId)`**.
   Either is a deterministic wait on a real database rather than a sleep, and `sendNinaMessage` now
   returns `{ ok, sessionId, cursor, turnId }` synchronously. **This phase does not use them**, and
   that is scope rather than oversight: R5 is the image path, and the send action's contribution to
   it is one line — which tool set it passes — already covered by the fourth case. A card that
   drives `sendNinaMessage` end to end through `pollNinaReply` is worth opening; see Handoff 2.

   One phase-3 consequence this suite must not trip over: after phase 3, `nina_turns` carries
   `kind='chat'` rows in `status='pending'` during a turn. `newestImageJob()` filters
   `eq(s.ninaTurns.kind, 'image')` already, so it cannot pick one up. Leave that filter alone.

**Leaves alone (owned by others):**
- `scripts/nina-image-worker.ts` (Phase 1) — imported, never edited.
- `lib/nina/imagerecipe.ts`, `app/nina/page.tsx`, `app/api/cron/nina/route.ts`, and phase 2's new
  `lib/nina/imagecall.ts` / `lib/nina/imagerun.ts` (Phase 2) — `imagerun` is *imported* on Branch A
  and never edited. (`lib/nina/imagedispatch.ts` was on this list; phase 2 deletes it, which is
  what the Branch A deltas in Step 1 are about.)
- `lib/nina/actions.ts`, `components/nina/ChatScreen.tsx`, `lib/nina/live.ts` (Phase 3).
- `lib/nina/imagejobs.ts`, `app/nina/jobs/*` (Phase 4) — this test asserts against `nina_turns`
  directly and never through phase 4's widened projection, so the two cannot collide.
- `components/nina/NinaAboutScreen.tsx` (Phase 5).
- `lib/nina/queries.ts`'s `removeNinaSession`, `lib/nina/sessionActions.ts` (Phase 6).
- `vitest.config.ts` — **not touched.** `tests/integration/**` and `tests/live/**` are already
  gated there by `VITEST_INTEGRATION` and `LLM_LIVE_TEST`; both new files land inside those two
  existing gates and no third convention is invented.

---

## Files

| File | Action | What changes |
|---|---|---|
| `tests/integration/ninaImageE2E.int.test.ts` | create | The whole always-on suite: avatar success (R5), selfie success (Finding 1), selfie terminal failure (Finding 1's blast radius + invariant 9). |
| `tests/live/ninaImageE2E.live.test.ts` | create | The opt-in variant that really calls `glm-5.3` and `qwen/qwen-image-3-pro`. |
| `package.json:50` | modify | One added script after `test:live:nina-vision`. |

---

## Implementation Steps

### Step 1: The integration suite

**File:** `tests/integration/ninaImageE2E.int.test.ts` (new)
**Change:** Create the file, complete, below. It follows `tests/integration/queries.int.test.ts`'s
established shape exactly: gate on an env var, point `process.env.DATABASE_URL` at it **before** the
dynamic imports, hang every row off a throwaway user with a unique suffix, and delete that user in
`afterAll` so the cascades take everything else.

> ## ⚠️ THE FILE BELOW IS THE **BRANCH B** SHAPE. READ THIS FIRST.
>
> The code in this step is written against the GitHub-hosted pipeline — the tree as it stands
> *before* phase 2. On **Branch A**, which is the expected outcome and the one phase 2 is written
> for, apply the six deltas below. They are small and mechanical, but four of them are the
> difference between a suite that passes and a suite that references deleted symbols.
>
> **Which branch is live is recorded in the plan index's *Decisions* table**, filled in by phase 2's
> Step 1 probe. Read that row before writing a line of this file.
>
> ### Branch A deltas
>
> **A1 — `runGenerator()` calls the in-platform entry point.** The only function that changes:
>
> ```ts
> async function runGenerator(jobId: string): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
>   return imagerun.runNinaImageJob(U1, jobId)
> }
> ```
>
> with `imagerun = await import('@/lib/nina/imagerun')` in `beforeAll` and
> `type ImageRun = typeof import('@/lib/nina/imagerun')` beside the other handle types. **The three
> call sites do not change** — the return values match `runOneJob`'s exactly. `workerSql` and the
> `scripts/nina-image-worker.ts` import become unused; drop both, and drop the `NeonSql` type
> import with them.
>
> **A2 — delete the `GITHUB_DISPATCH_TOKEN` stub.** `ninaEnv()` is a one-member group after phase 2
> (`{ OPENROUTER_API_KEY }`), so the line
> `process.env.GITHUB_DISPATCH_TOKEN ??= 'itest-dispatch-token-never-sent'` is stubbing a key the
> schema no longer has. Keep the `OPENROUTER_API_KEY` stub — `callNinaImageModel` reads it through
> `ninaEnv()` before the fetch, and `tests/support/setup.ts` deliberately does not stub the nina
> group.
>
> **A3 — the router's GitHub arm becomes an assertion that nothing reaches GitHub.** Replace the
> `api.github.com` branch with a throw, and delete `githubDispatches`:
>
> ```ts
>       if (url.startsWith('https://api.github.com/')) {
>         /* INVARIANT 4, and STRONGER than the payload check this replaces. There is no doorbell
>          * any more: lib/nina/imagedispatch.ts and GITHUB_DISPATCH_TOKEN are both gone, and the
>          * generation runs on this invocation. So the honest assertion is not "the dispatch input
>          * carries only an opaque nanoid" but "the public repository is never contacted at all".
>          * A regression that reintroduced a dispatch would fail here loudly rather than quietly
>          * publishing a scene description to a world-readable Actions log. */
>         throw new Error(`[nina e2e] Branch A must not dispatch to GitHub: ${url}`)
>       }
> ```
>
> **A4 — `drainAfter()` still exists, and still matters, for a different reason.**
> `fireNinaImageGeneration` registers an `after()` that *is* the generation. The test must **not**
> drain it before calling `runGenerator` — that would run the generation twice against one row (the
> second call would return `'none'`, and the assertions would read a job the test did not drive).
> So: keep the `vi.mock('next/server')` collector, **do not call `drainAfter()` in the three cases**,
> and add one assertion in its place that the handoff really happened:
>
> ```ts
>     /* The work was handed to the server, not to a runner. `fireNinaImageGeneration` registers
>      * exactly one `after()`; we drive the awaitable ourselves so the test owns the ordering. */
>     expect(deferred.length).toBeGreaterThan(0)
>     deferred.length = 0
> ```
>
> Keep `drainAfter` defined and used by nothing, or delete it — but do not leave a call in the
> avatar case.
>
> **A5 — the row is `queued`, not `dispatched`, when the generator is called.** Replace
>
> ```ts
>     const dispatched = await readTurn(opened.id)
>     expect(dispatched.errorCode).toBe('dispatched')
> ```
>
> with
>
> ```ts
>     /* Nothing writes 'dispatched' any more — phase 2 deleted both writers. A queued row claimed
>      * by the invocation that opened it is the whole shape of the in-platform design, and the
>      * absence of a grace window is why Finding 2 cannot recur on this path. */
>     const beforeRun = await readTurn(opened.id)
>     expect(beforeRun.errorCode).toBe('queued')
> ```
>
> and drop the two `expect(githubDispatches…)` assertions and the `published` invariant-4 block
> (A3 replaces them). **Finding 2's end-to-end coverage moves with the host**: phase 1's
> `dispatchCutoffFor` and `claimJob` unit tests remain the regression, and they still guard the two
> things that are still live on Branch A — the manual `--job` drain of the 15 historical
> `dispatched` rows, and the backstop that is phase 2's rollback target.
>
> **A6 — `githubDispatches.length = 0` resets go.** Three cases open with
> `githubDispatches.length = 0`; delete those lines along with the array.
>
> Everything else — the fixtures, the three sessions, `scriptedTurn`, the Blob handling, the daily
> cap arithmetic, and every `nina_messages` / `nina_message_images` / `nina_avatars` assertion — is
> **identical on both branches**, because none of it depends on where the generation ran.

**Code:**

```ts
import { neonConfig } from '@neondatabase/serverless'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { newId } from '@/lib/id'
import { ninaImageApology } from '@/lib/nina/imagefail'
import {
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_WIDTH,
  OPENROUTER_IMAGE_URL,
  type NinaImageJobArgs,
} from '@/lib/nina/imagerecipe'

import type { NeonSql } from '../../scripts/nina-image-worker.ts'

/**
 * **R5, end to end, against a REAL Postgres and a REAL Blob store.**
 *
 *     TEST_DATABASE_URL=<pooled neon branch url> \
 *     BLOB_READ_WRITE_TOKEN=<the real token from .env.local> \
 *     npm run test:int
 *
 * Skipped entirely without BOTH, so a plain `npm test` never touches a database and never uploads
 * a byte. **`.env.local` is deliberately NOT loaded here** — it carries the PRODUCTION
 * `DATABASE_URL`, and `tests/live/loadEnvLocal.ts` loads it with `override: true`. An integration
 * suite that imported that helper would write its throwaway rows into production. The two
 * variables above are passed on the command line, named one at a time, on purpose.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ────────────────────────────────────────────────────
 * The model's DECISION to call `set_avatar` is scripted, and the OpenRouter image call is routed to
 * a stub. Everything else is the shipping code: the turn loop, `NINA_FULL_TOOL_SET`,
 * `handleSetAvatar`'s in-flight guard, the quota check, `buildNinaImagePrompt`, `openNinaImageJob`,
 * `fireNinaImageDispatch`'s conditional UPDATE, `claimJob`, `store()`'s real Blob `put`,
 * `finishAvatar`'s two-statement transaction, `finishSelfie`'s three writes, `closeFailed`'s retry
 * and terminal branches, and `getCurrentNinaAvatar` — the read the chat header, `/nina/about` and
 * `/admin` all perform. The live twin (`tests/live/ninaImageE2E.live.test.ts`) buys the two things
 * scripted away here, and spends $0.04 to do it.
 *
 * ── WHY THE BLOB IS REAL WHEN OPENROUTER IS NOT ───────────────────────────────────────────────
 * `@vercel/blob` imports `fetch` from `undici` (dist/index.js:90), not `globalThis.fetch`, and the
 * worker loads it through `createRequire`, outside Vitest's module graph. Neither `vi.stubGlobal`
 * nor `vi.mock` can reach it. A 70-byte upload is free, is `del`eted in `afterAll`, and proves
 * `store()`'s arguments against the real API rather than against our idea of it.
 *
 * ── THE DAILY CAP ─────────────────────────────────────────────────────────────────────────────
 * `NINA_IMAGE_DAILY_CAP` is 6 and `countNinaTurnsSince` counts failures too, so a suite that opens
 * jobs can exhaust a quota. It cannot exhaust the OPERATOR's: the cap is `WHERE user_id = $1` and
 * every row here belongs to a user created in `beforeAll` and deleted in `afterAll`. Three image
 * jobs are opened in total. Do not add a fourth case without counting again.
 *
 * ── THE THREE MEASURED DEFECTS, EACH WITH THE ASSERTION THAT CATCHES IT ───────────────────────
 *   Finding 1 (a `nina_messages` write with no `session_id`) — the two SELFIE cases. The AVATAR
 *     case does NOT cover it and cannot: `finishAvatar` writes no message at all, which this file
 *     asserts positively so nobody later mistakes the gap for coverage.
 *   Finding 2 (a job the dispatch grace window makes unclaimable) — the avatar case drains
 *     `after()` first, so the row is genuinely `dispatched` and seconds old before the generator
 *     is asked to claim it by name.
 *   Finding 1's blast radius (money spent, `cost_micro_usd` NULL) — the failure case.
 */

/* ── Gates ─────────────────────────────────────────────────────────────────────────────────── */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
/* `tests/support/setup.ts` fills this with a sentinel so unit tests can import the modules. It is
 * not a credential and must not be mistaken for one — the same shape `nina.live.test.ts` uses to
 * reject `'unit-test-key-never-sent'`. */
const HAS_BLOB =
  BLOB_TOKEN != null && BLOB_TOKEN !== '' && BLOB_TOKEN !== 'vercel_blob_rw_unit_test'
const enabled = Boolean(TEST_DATABASE_URL) && HAS_BLOB

// lib/db/index.ts reads DATABASE_URL at import time, so it must be pointed at the test database
// BEFORE the dynamic imports in beforeAll. Same ordering rule as queries.int.test.ts.
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

/* `ninaEnv()` is a zod group that throws when ANY member is missing, and `dispatchNinaImageJob`
 * turns that throw into `leaveForBackstop` — which would skip the POST this suite asserts on.
 * Neither value is ever sent anywhere: the router below answers both hosts. */
process.env.GITHUB_DISPATCH_TOKEN ??= 'itest-dispatch-token-never-sent'
process.env.OPENROUTER_API_KEY ??= 'itest-openrouter-key-never-sent'

/* ── `after()` ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `fireNinaImageDispatch` schedules the doorbell inside `after()`, which throws outside a request
 * scope. Collect the callbacks and let the test drain them explicitly — which also makes the
 * dispatch ORDERED with respect to the claim, and that ordering is precisely what Finding 2 is
 * about. `vi.hoisted` because `vi.mock`'s factory is hoisted above every declaration in this file.
 */
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

async function drainAfter(): Promise<void> {
  while (deferred.length > 0) {
    const task = deferred.shift()
    if (task != null) await task()
  }
}

/* ── The network router ────────────────────────────────────────────────────────────────────── */

const realFetch = globalThis.fetch.bind(globalThis)
/* The database NEVER goes through the stub. `neonConfig.fetchFunction` is the same seam
 * `queries.int.test.ts` uses to count round trips. */
neonConfig.fetchFunction = (input: unknown, init: unknown) =>
  realFetch(input as string, init as RequestInit)

/** A valid 1x1 PNG. Small enough to be free, real enough for `put` to accept. */
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function okImageReply(): { status: number; body: string } {
  return {
    status: 200,
    body: JSON.stringify({ data: [{ b64_json: PNG_1X1_B64 }], usage: { cost: 0.04 } }),
  }
}

/** A 200 with no image: the provider was reached, the money was spent, nothing came back. */
function emptyImageReply(): { status: number; body: string } {
  return { status: 200, body: JSON.stringify({ data: [], usage: { cost: 0.04 } }) }
}

let openRouterReply = okImageReply()
const openRouterCalls: Array<Record<string, unknown>> = []
const githubDispatches: Array<{ url: string; body: unknown }> = []

function installFetchRouter(): void {
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url

      if (url.startsWith(OPENROUTER_IMAGE_URL)) {
        openRouterCalls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response(openRouterReply.body, { status: openRouterReply.status })
      }
      if (url.startsWith('https://api.github.com/')) {
        githubDispatches.push({ url, body: JSON.parse(String(init?.body)) as unknown })
        return new Response(null, { status: 204 })
      }
      /* Belt and braces: `@vercel/blob` uses undici's fetch today and never reaches this stub, but
       * a future version that switches to the global must still upload rather than throw. */
      if (url.includes('.vercel-storage.com')) return realFetch(input, init)

      throw new Error(`[nina e2e] unexpected network call: ${url}`)
    },
  )
}

/* ── Fixtures and handles ──────────────────────────────────────────────────────────────────── */

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `itest-nina-${SUFFIX}`

const AVATAR_SCENE = 'duduk di kafe pagi-pagi, rambut diikat, senyum tipis'
const SELFIE_SCENE = 'habis lari sore di GBK, muka masih merah, botol minum di tangan'
const FAILING_SCENE = 'di parkiran, lampu jingga, jaket dilepas'

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type NinaQueries = typeof import('@/lib/nina/queries')
type Turn = typeof import('@/lib/nina/turn')
type AvatarTools = typeof import('@/lib/nina/avatartools')
type Fixtures = typeof import('@/tests/fixtures/ninaTurn')
type Worker = typeof import('../../scripts/nina-image-worker.ts')
type Blob = typeof import('@vercel/blob')

let db: Db
let s: Schema
let q: NinaQueries
let turn: Turn
let avatarTools: AvatarTools
let fx: Fixtures
let worker: Worker
let blob: Blob
let workerSql: NeonSql

/** The Blob objects this run created, deleted in `afterAll` so nothing is orphaned. */
const blobUrls: string[] = []

/** The pre-existing face, so the un-currenting is a real state change and not a first insert. */
let seedAvatarId = ''
/** Where he asked for the selfie. */
let sessionB = ''
/** A NEWER session with activity. The fallback would pick this; the correct answer is B. */
let sessionC = ''
let sessionA = ''

/**
 * **The one function phase 2 can move.** Today the generator is
 * `scripts/nina-image-worker.ts`'s `runOneJob(sql, jobId)`, which takes its Neon client as an
 * argument and whose `main()` is guarded by `import.meta.url === process.argv[1]` — so importing
 * the worker runs nothing. If phase 2's probe clears 300 s and the generator moves in-platform,
 * this body becomes a call to the new module's entry point and **nothing else in this file
 * changes**.
 */
async function runGenerator(jobId: string): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  return worker.runOneJob(workerSql, jobId)
}

/** The newest image job of this user's, with its args already narrowed. */
async function newestImageJob(): Promise<{
  id: string
  status: string
  errorCode: string | null
  latencyMs: number | null
  costMicroUsd: number | null
  args: NinaImageJobArgs
}> {
  const rows = await db
    .select({
      id: s.ninaTurns.id,
      status: s.ninaTurns.status,
      errorCode: s.ninaTurns.errorCode,
      latencyMs: s.ninaTurns.latencyMs,
      costMicroUsd: s.ninaTurns.costMicroUsd,
      args: s.ninaTurns.args,
      createdAt: s.ninaTurns.createdAt,
    })
    .from(s.ninaTurns)
    .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.kind, 'image')))
    .orderBy(s.ninaTurns.createdAt)

  const row = rows[rows.length - 1]
  if (row == null) throw new Error('no image job was opened')
  return { ...row, args: row.args as NinaImageJobArgs }
}

async function readTurn(jobId: string) {
  const [row] = await db
    .select({
      id: s.ninaTurns.id,
      status: s.ninaTurns.status,
      errorCode: s.ninaTurns.errorCode,
      latencyMs: s.ninaTurns.latencyMs,
      costMicroUsd: s.ninaTurns.costMicroUsd,
      args: s.ninaTurns.args,
    })
    .from(s.ninaTurns)
    .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.id, jobId)))
  if (row == null) throw new Error(`no turn row for ${jobId}`)
  return { ...row, args: row.args as NinaImageJobArgs }
}

/**
 * One scripted turn: she calls `tool`, is told what happened, and then says something. The tool set
 * is `NINA_FULL_TOOL_SET` — the same object `lib/nina/actions.ts` passes — so this drives the real
 * dispatch table and the real handler, and only the model's token stream is fabricated.
 */
async function scriptedTurn(input: {
  tool: 'set_avatar' | 'generate_image'
  toolInput: Record<string, unknown>
  sessionId: string
  sourceMessageId: string | null
  runnerText: string
}): Promise<void> {
  const result = await turn.runNinaTurnWith(
    fx.fakeTurnDeps(
      fx.scriptedClient([
        fx.toolUseMessage(input.tool, input.toolInput),
        fx.sendMessage({ bubbles: ['bentar ya, gw ambil dulu'] }),
      ]),
      { toolSet: avatarTools.NINA_FULL_TOOL_SET },
    ),
    {
      userId: U1,
      context: fx.ninaContextFixture(),
      tuning: fx.ninaTuningFixture(),
      history: fx.runHistoryFixture(),
      sourceMessageId: input.sourceMessageId,
      runnerText: input.runnerText,
    },
  )

  expect(result.source).not.toBe('unavailable')
  expect(result.payload?.bubbles.length ?? 0).toBeGreaterThan(0)

  /* Her bubbles, persisted the way `lib/nina/actions.ts` STEP 5 persists them, so the conversation
   * this test asserts against is a real one. */
  await q.insertNinaMessages(
    U1,
    (result.payload?.bubbles ?? []).map((body, index) => ({
      role: 'nina' as const,
      body,
      replyToId: index === 0 ? input.sourceMessageId : null,
    })),
    input.sessionId,
  )
}

/* ── The suite ─────────────────────────────────────────────────────────────────────────────── */

describe.skipIf(!enabled)('nina image pipeline, end to end, against a real database', () => {
  beforeAll(async () => {
    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    q = await import('@/lib/nina/queries')
    turn = await import('@/lib/nina/turn')
    avatarTools = await import('@/lib/nina/avatartools')
    fx = await import('@/tests/fixtures/ninaTurn')
    worker = await import('../../scripts/nina-image-worker.ts')
    blob = await import('@vercel/blob')

    const { neon } = await import('@neondatabase/serverless')
    workerSql = neon(TEST_DATABASE_URL as string) as unknown as NeonSql

    installFetchRouter()

    await db.insert(s.users).values([
      { id: U1, name: 'Fixture Runner', email: `${U1}@example.test` },
    ])

    /*
     * The face she already has. `source: 'admin'` matters twice: it is what production actually
     * holds (13 rows, all admin), and it is what makes `handleSetAvatar`'s in-flight guard pass —
     * that guard refuses only when the CURRENT avatar is `generated` AND unannounced.
     */
    seedAvatarId = newId()
    await db.insert(s.ninaAvatars).values({
      id: seedAvatarId,
      userId: U1,
      blobUrl: 'https://example.invalid/seed-face.png',
      pathname: `nina/${U1}/avatar-seedseedseed.png`,
      source: 'admin',
      isCurrent: true,
      width: 768,
      height: 1024,
      bytes: 4096,
      description: 'the seeded face',
      announcedAt: new Date(),
    })

    sessionA = (await q.createNinaSession(U1)).id
    sessionB = (await q.createNinaSession(U1)).id
    sessionC = (await q.createNinaSession(U1)).id
    /* C is given activity so it is unambiguously the "most recent session" the A3 fallback would
     * choose. Every selfie assertion below demands B instead. */
    await q.insertNinaMessages(U1, [{ role: 'runner', body: 'ngobrol lain' }], sessionC)
  })

  afterAll(async () => {
    if (!enabled) return
    for (const url of blobUrls) {
      try {
        await blob.del(url, { token: BLOB_TOKEN })
      } catch (cause) {
        console.warn('[nina e2e] could not delete a test blob', { url, error: String(cause) })
      }
    }
    await db.delete(s.users).where(eq(s.users.id, U1))
    vi.unstubAllGlobals()
  })

  /* ══ R5 ═════════════════════════════════════════════════════════════════════════════════════ */

  it('R5: a set_avatar turn changes the profile picture the app actually reads', async () => {
    openRouterReply = okImageReply()
    openRouterCalls.length = 0
    githubDispatches.length = 0

    const [asked] = await q.insertNinaMessages(
      U1,
      [{ role: 'runner', body: 'na, ganti foto profil lo dong' }],
      sessionA,
    )
    expect(asked).toBeDefined()

    /* ── The chat half. Only the model's decision is fabricated. ─────────────────────────────── */
    await scriptedTurn({
      tool: 'set_avatar',
      toolInput: { scene: AVATAR_SCENE, because: 'dia minta gw ganti foto profil' },
      sessionId: sessionA,
      sourceMessageId: asked?.id ?? null,
      runnerText: 'na, ganti foto profil lo dong',
    })

    /* ── The job the handler opened. ─────────────────────────────────────────────────────────── */
    const opened = await newestImageJob()
    expect(opened.status).toBe('pending')
    expect(opened.errorCode).toBe('queued')
    expect(opened.args.purpose).toBe('avatar')
    expect(opened.args.source).toBe('generated')
    expect(opened.args.scene).toBe(AVATAR_SCENE)
    expect(opened.args.prompt).toContain(AVATAR_SCENE)
    expect(typeof opened.args.seed).toBe('number')
    /* Nobody asked in a bubble the photo can quote: an avatar job has no reply target. */
    expect(opened.args.replyToId).toBeNull()
    expect(opened.args.attempts).toBe(0)

    /* ── The doorbell. Draining it is what makes the row `dispatched` before the claim. ───────── */
    await drainAfter()
    expect(githubDispatches).toHaveLength(1)
    expect(githubDispatches[0]?.body).toEqual({ ref: 'main', inputs: { job_id: opened.id } })
    /* Invariant 4: the repository is PUBLIC, so a dispatch input is world-readable forever. Only
     * the opaque nanoid may travel. */
    const published = JSON.stringify(githubDispatches[0]?.body)
    expect(published).not.toContain(AVATAR_SCENE)
    expect(published).not.toContain(U1)

    const dispatched = await readTurn(opened.id)
    expect(dispatched.errorCode).toBe('dispatched')

    /* ── FINDING 2. A `dispatched` row seconds old, named by the doorbell, MUST be claimable. ── */
    expect(await runGenerator(opened.id)).toBe('ok')

    /* The prompt stored in `args` is the prompt as SENT — which is what phase 4's "exact prompt"
     * page will claim, and what a reproducible seed is worth. */
    expect(openRouterCalls).toHaveLength(1)
    expect(openRouterCalls[0]).toMatchObject({
      model: NINA_IMAGE_MODEL,
      prompt: opened.args.prompt,
      resolution: '1K',
      aspect_ratio: '3:4',
      n: 1,
      seed: opened.args.seed,
    })
    expect(openRouterCalls[0]?.input_references).toBeUndefined()

    /* ── The job is TERMINAL, and the money is on the ledger. ─────────────────────────────────── */
    const closed = await readTurn(opened.id)
    expect(closed.status).toBe('ok')
    expect(closed.errorCode).toBeNull()
    expect(closed.latencyMs).not.toBeNull()
    /* Invariant 9. `usage.cost: 0.04` came back, so this is the REPORTED cost and not the fallback
     * constant — the two happen to agree, which is the measured price. */
    expect(closed.costMicroUsd).toBe(NINA_IMAGE_COST_MICRO_USD)
    /* It really was claimed, once. 15 of production's 18 jobs sit at 0 forever. */
    expect(closed.args.attempts).toBe(1)

    /* ── The tail nobody checks: exactly one current face. ───────────────────────────────────── */
    const currents = await db
      .select()
      .from(s.ninaAvatars)
      .where(and(eq(s.ninaAvatars.userId, U1), eq(s.ninaAvatars.isCurrent, true)))
    /* `nina_avatars_user_current_unq` is a PARTIAL unique index on (user_id) where is_current, so
     * two rows here would mean the transaction's statement order stopped being load-bearing. */
    expect(currents).toHaveLength(1)

    const current = currents[0]
    expect(current).toBeDefined()
    if (current == null) return
    expect(current.id).not.toBe(seedAvatarId)
    expect(current.source).toBe('generated')
    /* NULL is phase 10's `avatar_changed` trigger. A stamped value here means she will never
     * mention the new face. */
    expect(current.announcedAt).toBeNull()
    expect(current.description).toBe(AVATAR_SCENE)
    expect(current.width).toBe(NINA_IMAGE_WIDTH)
    expect(current.height).toBe(NINA_IMAGE_HEIGHT)
    expect(current.bytes).toBeGreaterThan(0)
    expect(current.blobUrl.startsWith('https://')).toBe(true)
    /* The STORED pathname carries Vercel's random suffix, so it is deliberately NOT matched against
     * `NINA_IMAGE_PATHNAME_RE` — that regex describes the REQUESTED name. See imagerecipe.ts. */
    expect(current.pathname.startsWith(`nina/${U1}/avatar-`)).toBe(true)
    blobUrls.push(current.blobUrl)

    const [previous] = await db
      .select()
      .from(s.ninaAvatars)
      .where(eq(s.ninaAvatars.id, seedAvatarId))
    expect(previous?.isCurrent).toBe(false)

    /* ── THE REQUIREMENT, in the exact read the app performs. ─────────────────────────────────── */
    const seen = await q.getCurrentNinaAvatar(U1)
    expect(seen?.id).toBe(current.id)
    expect(seen?.blobUrl).toBe(current.blobUrl)
    expect(seen?.source).toBe('generated')

    /* ── And the negative that documents WHY this case cannot cover Finding 1. ────────────────── */
    const messagesFromJob = await db
      .select()
      .from(s.ninaMessages)
      .where(and(eq(s.ninaMessages.userId, U1), eq(s.ninaMessages.turnId, opened.id)))
    expect(messagesFromJob).toHaveLength(0)
  })

  /* ══ FINDING 1 — the success branch ══════════════════════════════════════════════════════════ */

  it('Finding 1: a generated selfie lands in the session he asked in, with session_id written', async () => {
    openRouterReply = okImageReply()
    openRouterCalls.length = 0
    githubDispatches.length = 0

    const [asked] = await q.insertNinaMessages(
      U1,
      [{ role: 'runner', body: 'na, foto dong abis lari' }],
      sessionB,
    )
    expect(asked).toBeDefined()

    await scriptedTurn({
      tool: 'generate_image',
      toolInput: { scene: SELFIE_SCENE, mood: 'capek tapi senang' },
      sessionId: sessionB,
      sourceMessageId: asked?.id ?? null,
      runnerText: 'na, foto dong abis lari',
    })

    const opened = await newestImageJob()
    expect(opened.args.purpose).toBe('selfie')
    expect(opened.args.source).toBe('chat')
    expect(opened.args.replyToId).toBe(asked?.id)

    await drainAfter()
    expect(await runGenerator(opened.id)).toBe('ok')

    const closed = await readTurn(opened.id)
    expect(closed.status).toBe('ok')
    expect(closed.costMicroUsd).toBe(NINA_IMAGE_COST_MICRO_USD)

    const [photo] = await db
      .select()
      .from(s.ninaMessages)
      .where(and(eq(s.ninaMessages.userId, U1), eq(s.ninaMessages.turnId, opened.id)))
    expect(photo).toBeDefined()
    if (photo == null) return

    /*
     * **FINDING 1.** `nina_messages.session_id` is NOT NULL, so omitting it is a crash; and the
     * value has to be the session of `args.replyToId`, not the newest one. Session C exists and is
     * newer with activity, so a resolver that only falls back to "his most recent session" writes
     * C and fails here — which is the whole reason C is seeded.
     */
    expect(photo.sessionId).toBe(sessionB)
    expect(photo.sessionId).not.toBe(sessionC)
    expect(photo.role).toBe('nina')
    expect(photo.source).toBe('chat')
    expect(photo.replyToId).toBe(asked?.id)

    const [image] = await db
      .select()
      .from(s.ninaMessageImages)
      .where(and(eq(s.ninaMessageImages.userId, U1), eq(s.ninaMessageImages.messageId, photo.id)))
    expect(image).toBeDefined()
    if (image == null) return
    /* `nina_message_images` has had ZERO rows, of any kind, ever. This assertion is the one that
     * makes that impossible to regress. */
    expect(image.kind).toBe('generated')
    expect(image.description).toBe(SELFIE_SCENE)
    /* The row IS the sidecar — prompt as sent, model, seed. */
    expect(image.prompt).toBe(opened.args.sidecar)
    expect(image.width).toBe(NINA_IMAGE_WIDTH)
    expect(image.height).toBe(NINA_IMAGE_HEIGHT)
    expect(image.bytes).toBeGreaterThan(0)
    expect(image.blobUrl.startsWith('https://')).toBe(true)
    expect(image.pathname.startsWith(`nina/${U1}/selfie-`)).toBe(true)
    blobUrls.push(image.blobUrl)
  })

  /* ══ FINDING 1's BLAST RADIUS + INVARIANT 9 ══════════════════════════════════════════════════ */

  it('Finding 1 + invariant 9: a terminal failure apologises WITH a session and records the cost', async () => {
    /* A 200 with no image: the provider was reached and billed, and nothing came back. This is the
     * exact shape of the two production jobs that logged 55.6 s and 73.9 s and stored NULL. */
    openRouterReply = emptyImageReply()
    openRouterCalls.length = 0
    githubDispatches.length = 0

    const [asked] = await q.insertNinaMessages(
      U1,
      [{ role: 'runner', body: 'satu lagi dong' }],
      sessionB,
    )
    expect(asked).toBeDefined()

    await scriptedTurn({
      tool: 'generate_image',
      toolInput: { scene: FAILING_SCENE },
      sessionId: sessionB,
      sourceMessageId: asked?.id ?? null,
      runnerText: 'satu lagi dong',
    })

    const opened = await newestImageJob()
    await drainAfter()

    /* `NINA_IMAGE_MAX_ATTEMPTS` is 2, so the first claim retries and the second gives up. */
    expect(await runGenerator(opened.id)).toBe('retry')

    const midway = await readTurn(opened.id)
    expect(midway.status).toBe('pending')
    expect(midway.errorCode).toBe('queued')
    expect(midway.args.attempts).toBe(1)

    expect(await runGenerator(opened.id)).toBe('gave-up')

    const closed = await readTurn(opened.id)
    expect(closed.status).toBe('failed')
    expect(closed.errorCode).toBe('transport')
    /*
     * **INVARIANT 9, AND THE NUMBER IS TWO GENERATIONS, NOT ONE.**
     *
     * Two provider calls were made and both were billed (the stub returns `usage.cost: 0.04` on a
     * 200 with no image — the exact shape of the two production jobs that logged 55.6 s and 73.9 s
     * and stored NULL). `cost_micro_usd` is a per-JOB CUMULATIVE TOTAL across attempts, reconciled
     * across phases 1, 2, 4 and 7 (plan index *Decisions*, rung 1). Every writer accumulates: the
     * worker's `closeFailed`/`finishSelfie`/`finishAvatar`, and in-platform
     * `requeueNinaImageJob`/`failNinaImageJob`/`completeNinaImageJob`.
     *
     * An earlier draft asserted a single `NINA_IMAGE_COST_MICRO_USD` here and its Handoffs said the
     * assertion was deliberately loose "so as not to freeze an under-report as correct" — but the
     * code asserted equality to one generation's price, which would have frozen exactly that. The
     * under-report is now fixed rather than tolerated, so the test asserts the true figure. If this
     * fails with `40000`, a retry branch somewhere stopped accumulating and one generation has
     * vanished from the ledger.
     */
    expect(closed.costMicroUsd).toBe(2 * NINA_IMAGE_COST_MICRO_USD)
    expect(closed.latencyMs).not.toBeNull()

    const [apology] = await db
      .select()
      .from(s.ninaMessages)
      .where(and(eq(s.ninaMessages.userId, U1), eq(s.ninaMessages.turnId, opened.id)))
    expect(apology).toBeDefined()
    if (apology == null) return
    /* **FINDING 1, the branch that took the whole process down.** */
    expect(apology.sessionId).toBe(sessionB)
    expect(apology.sessionId).not.toBe(sessionC)
    expect(apology.role).toBe('nina')
    /* Invariant 7: the only sanctioned in-character strings are `imagefail.ts`'s. No app-authored
     * prose may render as her bubble. */
    expect(apology.text).toBe(ninaImageApology('transport', opened.id))

    /* Nothing was stored, so nothing to reap. */
    const images = await db
      .select()
      .from(s.ninaMessageImages)
      .where(and(eq(s.ninaMessageImages.userId, U1), eq(s.ninaMessageImages.messageId, apology.id)))
    expect(images).toHaveLength(0)
  })

  /* ══ The one line of `lib/nina/actions.ts` this suite cannot drive ═══════════════════════════ */

  it('the full tool set the chat action passes carries both image tools', () => {
    /*
     * The action's whole contribution to R5 is which tool set it hands `runNinaTurn`. This suite
     * drives `NINA_FULL_TOOL_SET` directly rather than through `sendNinaMessage` — see the header
     * for why — so this asserts the object itself is complete. `extendToolSet` throws at module
     * load on a duplicate, so the layering cannot silently drop one; a REPLACED set could, and
     * that is what this catches.
     */
    expect(Object.keys(avatarTools.NINA_FULL_TOOL_SET.handlers)).toEqual(
      expect.arrayContaining(['set_avatar', 'generate_image', 'send']),
    )
    expect(avatarTools.NINA_FULL_TOOL_SET.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['set_avatar', 'generate_image']),
    )
  })
})
```

**Impact:** `npm run test:int` gains four cases. Against the tree **before phase 1**, case 1 fails at
`expect(await runGenerator(opened.id)).toBe('ok')` with `'none'` (Finding 2) and cases 2 and 3 fail
on the `session_id` write (Finding 1). Against the tree **after phase 1**, all four pass. Nothing
else in the repo changes. `npm test` is untouched — `tests/integration/**` is excluded without
`VITEST_INTEGRATION=1`.

---

### Step 2: The live suite

**File:** `tests/live/ninaImageE2E.live.test.ts` (new)
**Change:** Create the file below. It buys exactly the two things Step 1 scripts away, and it says
what it costs before it spends it.

> **Branch A delta, and it is the only one.** The single line
> `expect(await worker.runOneJob(workerSql, job.id)).toBe('ok')` becomes
> `expect(await imagerun.runNinaImageJob(U1, job.id)).toBe('ok')`, with the same import swap as
> A1 (drop `worker`, `workerSql` and the `NeonSql` type; add `imagerun`). Everything else is
> branch-independent: this suite never drains `after()`, never dispatches, and asserts only on
> `nina_turns`, `nina_avatars` and the Blob URL. The `expect(deferred.length).toBeGreaterThan(0)`
> line is *more* meaningful on Branch A, where the collected callback is the generation itself
> rather than a doorbell — it proves the handoff happened and that the test, not the platform, is
> the thing driving it.

**Code:**

```ts
// MUST be first: it loads .env.local before any import below reaches lib/env.ts, which parses
// process.env eagerly. Same ordering rule as tests/live/nina.live.test.ts.
import './loadEnvLocal'

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { newId } from '@/lib/id'
import {
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_WIDTH,
  type NinaImageJobArgs,
} from '@/lib/nina/imagerecipe'

import type { NeonSql } from '../../scripts/nina-image-worker.ts'

/**
 * **R5 with the money on.** The two things `tests/integration/ninaImageE2E.int.test.ts` scripts
 * away, bought for real:
 *
 *   1. that `glm-5.3`, handed a plain Indonesian request and `NINA_FULL_TOOL_SET`, actually reaches
 *      for `set_avatar` — the integration suite fabricates that decision;
 *   2. that `qwen/qwen-image-3-pro` accepts the prompt `buildNinaImagePrompt` assembles and returns
 *      bytes — the integration suite routes the call to a stub.
 *
 * **WHAT ONE RUN COSTS:** one `glm-5.3` chat turn (~15 s) plus one image generation at **$0.040**
 * (~78 s measured), one Blob object (deleted in `afterAll`), and one of the throwaway user's six
 * daily image slots. The OPERATOR's quota is untouched — the cap is `WHERE user_id = $1` and this
 * user is created and destroyed by the suite.
 *
 *     LLM_LIVE_TEST=1 TEST_DATABASE_URL=<neon branch> npm run test:live:nina-image
 *
 * ── THE `.env.local` HAZARD, AND THE GUARD AGAINST IT ─────────────────────────────────────────
 * `./loadEnvLocal` loads `.env.local` with `override: true`, and `.env.local` carries the
 * PRODUCTION `DATABASE_URL`. This file therefore captures that value BEFORE overriding it, and
 * refuses to run unless `TEST_DATABASE_URL` is set and is a DIFFERENT database. Every production
 * module is imported dynamically inside `beforeAll`, after the override, for the same reason
 * `queries.int.test.ts` does it.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
 * It never fires the real `workflow_dispatch`. `after()` is collected and never drained, so the job
 * stays `queued` and this process is the only generator that touches it. Dispatching for real would
 * start a second runner against the same row, against whatever database the workflow's own secrets
 * point at.
 */

/* Captured BEFORE the override below, so the guard can compare. */
const DOTENV_DATABASE_URL = process.env.DATABASE_URL
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

function realKey(value: string | undefined, ...sentinels: string[]): boolean {
  return value != null && value !== '' && !sentinels.includes(value)
}

const enabled =
  TEST_DATABASE_URL != null &&
  TEST_DATABASE_URL !== '' &&
  TEST_DATABASE_URL !== DOTENV_DATABASE_URL &&
  realKey(process.env.LLM_API_KEY, 'unit-test-key-never-sent', 'ci-dummy-key') &&
  realKey(process.env.OPENROUTER_API_KEY) &&
  realKey(process.env.BLOB_READ_WRITE_TOKEN, 'vercel_blob_rw_unit_test')

if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

/** `fireNinaImageDispatch` schedules the doorbell in `after()`. Collected, never drained. */
const { deferred } = vi.hoisted(() => ({ deferred: [] as Array<() => unknown> }))
vi.mock('next/server', () => ({
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `live-nina-${SUFFIX}`
/** Unambiguous on purpose. The 2026-09 probe measured this endpoint honouring a tool round trip. */
const ASK = 'na, ganti foto profil lo dong. yang lagi duduk di kafe, pagi-pagi, rambut diikat.'

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
type NinaQueries = typeof import('@/lib/nina/queries')
type Turn = typeof import('@/lib/nina/turn')
type AvatarTools = typeof import('@/lib/nina/avatartools')
type Fixtures = typeof import('@/tests/fixtures/ninaTurn')
type Worker = typeof import('../../scripts/nina-image-worker.ts')
type Blob = typeof import('@vercel/blob')

let db: Db
let s: Schema
let q: NinaQueries
let turn: Turn
let avatarTools: AvatarTools
let fx: Fixtures
let worker: Worker
let blob: Blob
let workerSql: NeonSql

const blobUrls: string[] = []
let seedAvatarId = ''
let sessionId = ''

describe.skipIf(!enabled)('nina image pipeline, live', () => {
  beforeAll(async () => {
    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    q = await import('@/lib/nina/queries')
    turn = await import('@/lib/nina/turn')
    avatarTools = await import('@/lib/nina/avatartools')
    fx = await import('@/tests/fixtures/ninaTurn')
    worker = await import('../../scripts/nina-image-worker.ts')
    blob = await import('@vercel/blob')

    const { neon } = await import('@neondatabase/serverless')
    workerSql = neon(TEST_DATABASE_URL as string) as unknown as NeonSql

    await db
      .insert(s.users)
      .values([{ id: U1, name: 'Live Runner', email: `${U1}@example.test` }])

    /* `source: 'admin'` so `handleSetAvatar`'s in-flight guard passes. */
    seedAvatarId = newId()
    await db.insert(s.ninaAvatars).values({
      id: seedAvatarId,
      userId: U1,
      blobUrl: 'https://example.invalid/seed-face.png',
      pathname: `nina/${U1}/avatar-seedseedseed.png`,
      source: 'admin',
      isCurrent: true,
      width: 768,
      height: 1024,
      bytes: 4096,
      description: 'the seeded face',
      announcedAt: new Date(),
    })

    sessionId = (await q.createNinaSession(U1)).id
  })

  afterAll(async () => {
    if (!enabled) return
    for (const url of blobUrls) {
      try {
        await blob.del(url, { token: process.env.BLOB_READ_WRITE_TOKEN })
      } catch (cause) {
        console.warn('[nina live] could not delete a test blob', { url, error: String(cause) })
      }
    }
    await db.delete(s.users).where(eq(s.users.id, U1))
  })

  it(
    'live: she really calls set_avatar, the camera really runs, and the profpic really changes',
    async () => {
      const [asked] = await q.insertNinaMessages(U1, [{ role: 'runner', body: ASK }], sessionId)
      expect(asked).toBeDefined()

      /* ── The REAL model, the REAL tool set, the REAL handler. ─────────────────────────────── */
      const result = await turn.runNinaTurnWith(
        fx.fakeTurnDeps(turn.ninaClient(), {
          model: turn.ninaModel(),
          toolSet: avatarTools.NINA_FULL_TOOL_SET,
        }),
        {
          userId: U1,
          context: fx.ninaContextFixture(),
          tuning: fx.ninaTuningFixture(),
          history: fx.runHistoryFixture(),
          sourceMessageId: asked?.id ?? null,
          runnerText: ASK,
        },
      )
      expect(result.source).not.toBe('unavailable')

      /*
       * A failure HERE is a change at the endpoint or in the tool description, not a flake — the
       * same framing `tests/live/nina.live.test.ts` uses for its own tool round trip. If she stops
       * reaching for `set_avatar` on a request this direct, `SET_AVATAR_TOOL`'s description is the
       * thing that regressed.
       */
      const [job] = await db
        .select({
          id: s.ninaTurns.id,
          status: s.ninaTurns.status,
          errorCode: s.ninaTurns.errorCode,
          costMicroUsd: s.ninaTurns.costMicroUsd,
          latencyMs: s.ninaTurns.latencyMs,
          args: s.ninaTurns.args,
        })
        .from(s.ninaTurns)
        .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.kind, 'image')))
      expect(job, 'she did not call set_avatar').toBeDefined()
      if (job == null) return

      const args = job.args as NinaImageJobArgs
      expect(args.purpose).toBe('avatar')
      expect(args.source).toBe('generated')

      /* ── The REAL camera. $0.040, ~78 s. `after()` is never drained, so nothing is dispatched. */
      expect(deferred.length).toBeGreaterThan(0)
      expect(await worker.runOneJob(workerSql, job.id)).toBe('ok')

      const [closed] = await db
        .select({
          status: s.ninaTurns.status,
          errorCode: s.ninaTurns.errorCode,
          costMicroUsd: s.ninaTurns.costMicroUsd,
          latencyMs: s.ninaTurns.latencyMs,
        })
        .from(s.ninaTurns)
        .where(and(eq(s.ninaTurns.userId, U1), eq(s.ninaTurns.id, job.id)))
      expect(closed?.status).toBe('ok')
      expect(closed?.errorCode).toBeNull()
      /* **Invariant 9, asserted by the test that spent the money.** */
      expect(closed?.costMicroUsd).not.toBeNull()
      console.info('[nina live] generation billed', {
        jobId: job.id,
        costMicroUsd: closed?.costMicroUsd,
        latencyMs: closed?.latencyMs,
      })

      /* ── The tail. ───────────────────────────────────────────────────────────────────────── */
      const currents = await db
        .select()
        .from(s.ninaAvatars)
        .where(and(eq(s.ninaAvatars.userId, U1), eq(s.ninaAvatars.isCurrent, true)))
      expect(currents).toHaveLength(1)
      const current = currents[0]
      if (current == null) return
      expect(current.id).not.toBe(seedAvatarId)
      expect(current.source).toBe('generated')
      expect(current.announcedAt).toBeNull()
      expect(current.width).toBe(NINA_IMAGE_WIDTH)
      expect(current.height).toBe(NINA_IMAGE_HEIGHT)
      expect(current.bytes).toBeGreaterThan(1000)
      blobUrls.push(current.blobUrl)

      /* The bytes are really there, at a URL a browser could load. */
      const head = await fetch(current.blobUrl, { method: 'GET', cache: 'no-store' })
      expect(head.ok).toBe(true)
      expect(head.headers.get('content-type')).toContain('image/png')

      const seen = await q.getCurrentNinaAvatar(U1)
      expect(seen?.id).toBe(current.id)
    },
    300_000,
  )
})
```

**Impact:** `npm test`, `npm run test:int` and CI are all unaffected — `tests/live/**` is excluded
unless `LLM_LIVE_TEST=1`. `npm run test:live` (`--testNamePattern=live`) will pick this case up, and
it will spend $0.04 when it does; that is the same contract `test:live:vision` and
`test:live:nina-vision` already carry.

---

### Step 3: One package.json script

**File:** `package.json:50`
**Change:** Add one line after `test:live:nina-vision`. It is the only edit outside `tests/`.

**Code:** replace

```json
    "test:live:nina-vision": "LLM_LIVE_TEST=1 vitest run tests/live/ninaVision.live.test.ts"
```

with

```json
    "test:live:nina-vision": "LLM_LIVE_TEST=1 vitest run tests/live/ninaVision.live.test.ts",
    "test:live:nina-image": "LLM_LIVE_TEST=1 vitest run tests/live/ninaImageE2E.live.test.ts"
```

**Impact:** none on any existing script. `test:live` already globs by test name and would have found
the file anyway; this is the per-suite entry point the other three live suites each have.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit` — both new files are `.ts` under
`tsconfig.json`'s `**/*.ts`, and the `../../scripts/nina-image-worker.ts` specifier needs
`allowImportingTsExtensions`, which is already on for exactly this reason).

**Lint:** `npm run lint`.

**Tests, in order:**

```bash
# 1. Nothing changed for the default run: no database, no network, no money.
npm test

# 2. The phase's own suite. A Neon BRANCH, never production.
TEST_DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' \
BLOB_READ_WRITE_TOKEN="$(grep '^BLOB_READ_WRITE_TOKEN=' .env.local | cut -d= -f2-)" \
npm run test:int

# 3. The money-spending twin. Once, by hand, after phases 1-3 have landed.
LLM_LIVE_TEST=1 \
TEST_DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' \
npm run test:live:nina-image
```

**Manual check:** after step 2, the Neon branch must hold **no** rows for `itest-nina-%` — the
`afterAll` user delete cascades everything. Confirm with

```sql
select count(*) from nina_turns   where user_id like 'itest-nina-%';
select count(*) from nina_avatars where user_id like 'itest-nina-%';
```

Both zero. And the Blob store must hold no `nina/itest-nina-*` objects; if a run crashed before
`afterAll`, the `reap-orphaned-blobs` skill covers `nina/`.

**Exit criteria:**

1. `npm run test:int` runs `tests/integration/ninaImageE2E.int.test.ts` green, and `npm test`,
   `npm run lint` and `npm run typecheck` all stay green.
2. **Branch B only:** reverting phase 1's `claimJob` change makes case 1 fail with
   `expected 'none' to be 'ok'` — Finding 2 is caught end to end. **On Branch A this criterion does
   not apply and must not be faked**: there is no grace window on the in-platform path, so Finding
   2's regression coverage is phase 1's `dispatchCutoffFor` / `claimJob` unit tests, which still
   guard the backstop and the manual drain of the 15 historical `dispatched` rows.
3. Reverting phase 1's `session_id` fix makes cases 2 and 3 fail — Finding 1 is caught, on both the
   success branch and the terminal-failure branch. **This holds on both branches**, because
   in-platform `finishSelfie` reaches the same `NOT NULL` column through `insertNinaMessages`,
   whose required third parameter makes the omission a compile error rather than a runtime one.
4. A generator that closes a billed job with `cost_micro_usd` NULL — **or that overwrites instead
   of accumulating, recording `40000` where two attempts were billed** — fails case 3. Invariant 9
   is caught in both of its directions.
5. `npm run test:live:nina-image` produces, once, a real `nina_avatars` row with
   `source='generated'` on the test database, and logs the billed `cost_micro_usd`.
6. Neither suite is reachable from `npm test`.

---

## Handoffs

Found while writing this, deliberately left alone.

1. **Invariant 9's under-report — FOUND HERE, FIXED EVERYWHERE, AND THIS SUITE IS NOW THE PROOF.**
   The draft observed that the shipped retry branch writes `latency_ms` but no `cost_micro_usd`, so
   a job that burns both attempts is billed twice and recorded once, and it proposed leaving case 3
   loose (`not null`) rather than freezing the under-report — while the code in that same case
   asserted equality to a single generation's price, which would have frozen it.

   **Reconciled: the column is a per-JOB CUMULATIVE TOTAL on every path and both hosts** (plan index
   *Decisions*, rung 1 — invariant 9, "money is never spent silently"; a per-attempt overwrite
   discards the first bill and records two OpenRouter calls as one). Phase 1 accumulates in
   `closeFailed`'s two branches and in `finishSelfie` and `finishAvatar`; phase 2 accumulates in
   `requeueNinaImageJob`, `failNinaImageJob` and `completeNinaImageJob`, with `stale` leaving the
   column untouched rather than nulling a recorded spend. Phase 4 labels it "Biaya total" beside the
   attempt count. **Case 3 now asserts `2 * NINA_IMAGE_COST_MICRO_USD`** — the true figure — which
   makes this suite the thing that catches a regression in any of those six writers. Nothing here is
   left as a handoff.

2. **Driving the send action end to end — Phase 3, and then a follow-up card.** This phase proves
   the tool set and the loop but not `sendNinaMessage` itself. If phase 3's interface contract
   publishes a named, awaitable export for the background turn body, append one case to
   `tests/integration/ninaImageE2E.int.test.ts` that drives it with the scripted client injected;
   see **Requires** item 5 for the shape. Doing it here would mean guessing a symbol name that does
   not exist yet.

3. **The job-tracking projection — Phase 4.** This suite asserts against `nina_turns` columns
   directly, never through `lib/nina/imagejobs.ts`'s widened projection. Once `/nina/jobs` exists,
   a case asserting that a completed job renders with the right stage, elapsed time and cost belongs
   with phase 4's own tests, not here. Deliberately not written, so the two phases cannot collide on
   one file.

4. **The orphaned `nina/` blobs already in the store — out of scope per the plan index.** The
   integration suite deletes its own two objects and the live suite deletes its one. The bytes
   Finding 1 paid for and abandoned are a separate card; `reap-orphaned-blobs` covers `nina/`.

5. **`resolveNinaSessionForMessage`'s deleted-message fallback is not asserted here.** Case 2 proves
   the `replyToId` branch and proves the fallback is *not* silently taken. The fallback itself — a
   job whose triggering message was deleted before the generator ran — is phase 1's own unit test in
   `tests/nina.imageworker.test.ts`, where it can be driven without a second session tree.

---

## Rollback

`git revert` the phase's single commit. It creates two test files and adds one line to
`package.json`; nothing imports either file and nothing else reads the new script. No production
code, no migration, no configuration. Reverting leaves the pipeline exactly as phases 1–3 left it —
working, and untested.
