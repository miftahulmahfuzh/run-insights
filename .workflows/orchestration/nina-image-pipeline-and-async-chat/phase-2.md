# Phase 2: Move generation onto Vercel Fluid compute; demote GitHub Actions to backstop

**Plan set:** `NINA_IMAGE_PIPELINE_AND_ASYNC_CHAT_PLAN.md`
**Analysis:** `20260906-204533-IMG9_code_analyzer.md`
**Satisfies:** R2 (no photo has ever been generated through chat), R4 (is there an async OpenRouter image API), R7 (once a generation has started, closing the app must not matter)
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/nina` (primary), `app/nina`, `app/api/cron/nina`, `.github/workflows`

---

## Goal

The photograph is generated **on Vercel, inside `after()`, on the server's own wall clock**, instead
of on a GitHub Actions runner reached through a `workflow_dispatch` doorbell. Analysis Finding 4
showed the 60 s ceiling that forced the off-platform design has expired — Hobby + Fluid compute is
300 s default *and* max, and this project (created 20 Aug 2026) post-dates Fluid-by-default — and
**Step 1 measures that on this deployment before anything else in the phase is written.** With the
generator in-platform it can import `lib/nina/queries.ts`, which structurally deletes the class of
bug that is Finding 1, and there is no dispatch grace window to lose a job in, which deletes
Finding 2 at its source. GitHub Actions and `scripts/nina-image-worker.ts` **stay**, repaired by
phase 1, demoted to a backstop and a manual drain.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**

- `lib/nina/imagedispatch.ts` — the whole file. With it: `dispatchNinaImageJob`,
  `fireNinaImageDispatch`, `githubDispatchUrl`, `NINA_WORKER_REPO`, `NINA_WORKER_WORKFLOW`,
  `NINA_WORKER_REF`.
- `tests/nina.imagedispatch.test.ts` — the whole file (it tests only the deleted module).
- `ninaImagejobs.markNinaImageJobDispatched` (`lib/nina/imagejobs.ts:114`) — nothing writes the
  `dispatched` phase any more.
- `imagerecipe.NINA_IMAGE_DISPATCH_TIMEOUT_MS` (`lib/nina/imagerecipe.ts:105`) — only the deleted
  dispatcher read it.
- env key `GITHUB_DISPATCH_TOKEN` — removed from `ninaSchema` (`lib/env.ts:120`) and from
  `.env.example:66`. `ninaEnv()` becomes a one-member group: `{ OPENROUTER_API_KEY }`.
- `app/nina/probe/page.tsx` — created in Step 1, deleted in Step 11. It exists only inside this
  phase.

**Renames:** none.

**Creates:**

- `lib/nina/imagecall.ts` — `callNinaImageModel`, `type NinaImageCallResult`. The OpenRouter image
  call, in-platform. **This is phase 7's fake seam** (see Handoffs).
- `lib/nina/imagerun.ts` — `runNinaImageJob`, `fireNinaImageGeneration`, `reviveNinaImageJobs`.
- `lib/nina/imagejobs.ts` gains, **write-side only**: `claimNinaImageJob`, `completeNinaImageJob`,
  `requeueNinaImageJob`, `listRevivableNinaImageJobs`, `type NinaImageClaim`,
  `type NinaImageRevivable`.
- `lib/nina/imagerecipe.ts` gains: `NINA_HOST_MAX_DURATION_MS`, `NINA_IMAGE_CALL_TIMEOUT_MS`,
  `NINA_IMAGE_FINISH_RESERVE_MS`, `NINA_TURN_SPENT_MS`, `NINA_IMAGE_RUN_BUDGET_MS`,
  `NINA_IMAGE_REVIVE_BUDGET`. It **keeps** `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` (phase 1's) —
  see the collision table under *Requires*.
- `tests/nina.imagecall.test.ts`.
- `app/nina/probe/page.tsx` (temporary — Step 1, removed in Step 11).

**Signature changes:**

- `failNinaImageJob(input)` — `input` gains an optional `costMicroUsd?: number | null`. Default
  behaviour is byte-for-byte today's. **Additive; no caller must change.**
- `selfiegen.generateNinaSelfie` / `avatargen.generateNinaAvatar` — return type is unchanged,
  including the literal `state: 'dispatched'`. Only the function they call to start the work
  changes (`fireNinaImageDispatch` → `fireNinaImageGeneration`). **Deliberately unchanged so
  `imagetools.ts`, `avatartools.ts` and `promises.ts` need zero edits.**

**Config changes:**

- `app/nina/page.tsx:128` — `maxDuration` 60 → 300.
- `app/api/cron/nina/route.ts:56` — `maxDuration` 60 → 300. *(Required, not cosmetic:
  `resolveNinaPromises` calls `generateNinaAvatar` from that route, and after this phase the
  generation runs in that route's `after()` budget. Nobody else in the set owns this file.)*
- `.github/workflows/nina-image.yml` — comments only. The `schedule:` stays `*/10`, the
  `workflow_dispatch:` trigger stays (it is now the **manual** drain), `timeout-minutes: 6` stays.

**Requires (from earlier phases):**

- Phase 1 has landed `session_id` on both of the worker's `nina_messages` INSERTs, the named-job
  `claimJob` fix, the widened `preflight`, the **cumulative `cost_micro_usd` on all four worker
  write paths**, and the measured-cadence comment in `.github/workflows/nina-image.yml`.
- **THE THREE COLLIDING HUNKS, RECONCILED. This phase supersedes phase 1 on all three, and in
  exchange it MUST carry two of phase 1's artefacts forward. Both are load-bearing.**

  | Hunk | Whose text wins | What must survive |
  |---|---|---|
  | `.github/workflows/nina-image.yml` header + `schedule:` comments | **Mine** (Step 9). I quote the file as phase 1 leaves it and rewrite those comments wholesale. | The measured cadence — the twelve `schedule` run timestamps and the "1 h 46 m to 4 h 19 m" fact. My Step 9a already contains both verbatim. **Keep exactly one copy**; do not leave phase 1's paragraph beside mine. |
  | `lib/nina/imagerecipe.ts:98–115` (verified: the banner is exactly line 98, `NINA_IMAGE_SWEEP_BUDGET` is exactly line 115) | **Mine** (Step 7b). I replace the whole block. | **`NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000` and its measured-cadence docblock.** Step 7b has been edited to carry it. Dropping it breaks the build: `tests/nina.imagerecipe.test.ts` imports it. |
  | `tests/nina.imagerecipe.test.ts`'s `describe('the threshold chain')` | **Mine** (Step 10b). I rewrite the block. | **Phase 1's `it('the schedule backstop cannot beat the give-up…')` and its import.** Step 10b has been edited to keep it. It needs no numeric change — I keep `NINA_IMAGE_STALE_MS` at `1_200_000`, so `6_360_000 > 1_200_000` still holds. |

  A fourth would-be collision is not one: phase 1 edits `scripts/nina-image-worker.ts` and
  `tests/nina.imageworker.test.ts`, and this phase touches neither file — not one line.
- Phase 1 writes a session-resolution SQL helper *for the worker*. **I do not write a third one.**
  There are exactly two: the policy, `lib/nina/sessionResolve.ts` (app), and phase 1's SQL mirror of
  it (forced by the worker's import boundary). `lib/nina/imagerun.ts` uses the *policy* directly —
  `getNinaMessagesByIds` + `resolveNinaWriteSession` — which is what makes Finding 1 structurally
  unrepeatable in-platform.

**Leaves alone (owned by others):**

- `lib/nina/actions.ts`, `components/nina/ChatScreen.tsx`, `lib/nina/live.ts` (Phase 3).
- `lib/nina/imagejobs.ts`'s **read projection**: `NinaImageJobRow`, `toJobRow`,
  `listOpenNinaImageJobs`, `getNinaImageJob`, `PENDING_PHASES` and `sweepStaleNinaImageJobs` are
  untouched by me. `app/nina/jobs/*` is Phase 4's and I create nothing there.
- `components/nina/NinaAboutScreen.tsx`, `app/nina/about/page.tsx` (Phase 5).
- `lib/nina/queries.ts` (Phase 6) — I *call* `insertNinaMessages`, `insertNinaMessageImages`,
  `insertNinaAvatarAsCurrent` and `getNinaMessagesByIds` and **edit none of them**. No migration.
- `tests/integration/**` (Phase 7).
- `scripts/nina-image-worker.ts` and `tests/nina.imageworker.test.ts` (Phase 1) — **not one line.**

**Contract for Phase 3 (asked for explicitly in its brief):**

1. **The durability primitive is `next/server`'s `after()`.** Not a floating promise, not a fetch to
   an internal route, not a queue. Doc lines this phase relies on, from
   `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` (Next 16.3.1):
   - `:50` — *"`after` will run for the platform's default or configured max duration of your route.
     If your platform supports it, you can configure the timeout limit using the `maxDuration` route
     segment config."*
   - `:54` — *"`after` will be executed even if the response didn't complete successfully. Including
     when an error is thrown or when `notFound` or `redirect` is called."*
   - `:250` — *"…a primitive called `waitUntil(promise)`, which extends the lifetime of a serverless
     invocation until all promises passed to `waitUntil` have settled."*
   - `:56` — *"`after` can be nested inside other `after` calls."*
2. **The budget is the invoking route segment's `maxDuration`, not the action's.** Phase 3 must keep
   the turn inside a segment carrying `maxDuration = 300` — that is `app/nina/page.tsx` (this phase
   raises it) and `app/api/cron/nina/route.ts` (this phase raises it). **Phase 3 must not move
   `runNinaTurn` into a new route handler or a segment with a smaller ceiling**, and must not lower
   either literal.
3. **Nesting is expected and sanctioned.** After phase 3, `runNinaTurn` runs inside `after()`; a
   `generate_image` tool call inside it registers a *second, nested* `after()`
   (`fireNinaImageGeneration`). Doc `:56` sanctions this. The arithmetic is in Step 7:
   45 s turn + 200 s generation budget = 245 s inside a 300 s ceiling.
4. **What `after()` does not promise, stated once so phase 3 does not re-promise it:** it does not
   survive `maxDuration` and it does not survive an instance being killed. The recovery for both is
   this phase's `reviveNinaImageJobs` plus the unchanged 20-minute give-up sweep — *not* anything
   phase 3 needs to build.

**Contract for Phase 4:** I add **no column** to `nina_turns` and **no field** to
`NinaImageJobArgs`. The rows phase 4 reads are exactly the rows it expects, with two behavioural
notes: (a) `error_code = 'dispatched'` is now a **legacy** value — only rows written before this
phase carry it, and `toJobRow`/`PENDING_PHASES` still map it, so nothing breaks; (b) `attempts` in
`args` is still incremented once per claim, now by `claimNinaImageJob` instead of the worker's
`claimJob`. `listRevivableNinaImageJobs` is a *write-path* read I added; phase 4 may fold it into
its widened projection if it wants, and should say so if it does. **(c) `cost_micro_usd` is a
per-JOB CUMULATIVE TOTAL** on every path and both hosts (index *Decisions*, invariant 9) — phase 4
renders it as "total spent on this job" beside `attempts`, and a job that burned two attempts
legitimately reads $0.080. **(d) Every read I add filters `kind = 'image'`** — `claimNinaImageJob`
and `listRevivableNinaImageJobs` both carry `eq(ninaTurns.kind, 'image')` in their `WHERE`, so
phase 3's new `kind='chat'` `pending` rows are invisible to the write path exactly as they are to
phase 4's projection. `failNinaImageJob` addresses a row by exact `id` and needs no `kind`
predicate.

---

## Files

| File | Action | What changes |
|---|---|---|
| `app/nina/probe/page.tsx` | create → delete | Step 1's empirical ceiling + durability probe. Removed in Step 11. |
| `lib/nina/imagecall.ts` | create | The in-platform OpenRouter image call. Carries R4's answer in its header. |
| `lib/nina/imagerun.ts` | create | Claim → generate → store → finish. `after()` scheduler. Revival. |
| `lib/nina/imagejobs.ts` | modify | `markNinaImageJobDispatched` (105–129) deleted; `claimNinaImageJob`, `completeNinaImageJob`, `requeueNinaImageJob`, `listRevivableNinaImageJobs` added; `failNinaImageJob` (145–173) gains `costMicroUsd` and stops letting a failed apology swallow the terminal UPDATE. **All three write paths ACCUMULATE `cost_micro_usd` (per-job total; index Decisions, invariant 9).** |
| `lib/nina/.workflows/package_readme.md` | modify | `:301` still lists `imagedispatch.ts` ("fires the GH-Actions workflow") in the module tour. One clause: replace it with `imagecall.ts` + `imagerun.ts`, and demote the workflow to the backstop. A package readme that names a deleted module is the next reader's first wrong turn. |
| `lib/nina/selfiegen.ts` | modify | `:3` import, `:92` call — `fireNinaImageDispatch` → `fireNinaImageGeneration`. |
| `lib/nina/avatargen.ts` | modify | `:3` import, `:109` call — same. |
| `lib/nina/imagedispatch.ts` | delete | The whole doorbell. The constraint it existed for is gone. |
| `tests/nina.imagedispatch.test.ts` | delete | Tests only the deleted module. |
| `lib/nina/imagerecipe.ts` | modify | Header gains the Finding-4 record; `:98–115` threshold block re-derived for a 300 s host; `NINA_IMAGE_DISPATCH_TIMEOUT_MS` removed; six constants added. |
| `lib/env.ts` | modify | `ninaSchema` (`:106–121`) loses `GITHUB_DISPATCH_TOKEN`. |
| `.env.example` | modify | The `GITHUB_DISPATCH_TOKEN` block (`:55–66`) goes. |
| `app/nina/page.tsx` | modify | `:128` `maxDuration` 60 → 300; `:22` import; `:184–195` `Promise.all` gains `reviveNinaImageJobs`. |
| `app/api/cron/nina/route.ts` | modify | `:56` `maxDuration` 60 → 300, with the reason. |
| `.github/workflows/nina-image.yml` | modify | Demoted to a pure backstop + manual drain. Comments only. |
| `tests/nina.imagecall.test.ts` | create | The call's contract, replacing the dispatch test's role. |
| `tests/nina.imagerecipe.test.ts` | modify | The threshold chain, re-asserted for a 300 s host. |
| `scripts/check-llm-payload-boundary.mjs` | modify | One `GUARDED_CALLS` entry for `runNinaImageJob`. |

---

## Implementation Steps

### Step 1: The probe — and it gates every step after it

**File:** `app/nina/probe/page.tsx` (new)
**Change:** Deploy one page segment with `maxDuration = 300` that answers two questions in two
modes, then read the answers and take the branch.

Finding 4 is **documentation-derived**, not measured on this deployment. Two independent things
have to be true before any of Steps 2–11 is worth writing:

- **Q1 — the ceiling.** Does a function on *this* project actually get more than 60 s?
- **Q2 — the durability (R7).** Does `after()` keep running on the server after the response is
  flushed and the tab is closed, for materially longer than 60 s?

`?inline=1` answers Q1 with an HTTP status code and needs no log access. The default mode answers
Q2 and is read from the function log.

**Code:**

```tsx
import { after } from 'next/server'

import { requireUserId } from '@/lib/auth/requireUserId'

/**
 * **A TEMPORARY PROBE. It is created by phase 2 step 1 and deleted by phase 2 step 11.**
 * If you are reading this on `main`, step 11 did not run — delete the route.
 *
 * It exists because the whole off-platform image design rests on one sentence repeated in five
 * files: *"the shipping generation is 78.2 s measured and the Hobby ceiling in `sin1` is 60 s, so
 * the work cannot happen on Vercel at all"*. Vercel's current documentation (`/docs/fluid-compute`
 * and `/docs/functions/configuring-functions/duration`, both `last_updated: 2026-08-24`) gives
 * Hobby + Fluid compute a default AND maximum of 300 s, and says fluid compute has been on by
 * default for new projects since 2025-04-23; `vercel project inspect run-insights` reports
 * Created At: 20 August 2026. That is a documentation claim about a plan, not a measurement of
 * this deployment, and the phase that acts on it may not assume it.
 *
 * ── TWO MODES, TWO QUESTIONS ──────────────────────────────────────────────────────────────────
 *   `/nina/probe?inline=1` — HOLDS IN THE RENDER for `PROBE_HOLD_MS` and prints its own wall
 *                            clock. A 200 with `held ~90000 ms` means the ceiling is above 60 s.
 *                            A 504 `FUNCTION_INVOCATION_TIMEOUT` at ~60 s means it is not. This
 *                            answers the CEILING with a status code and needs no log access.
 *   `/nina/probe`          — returns at once and holds inside `after()`, logging every 10 s. This
 *                            answers DURABILITY (R7): close the tab the instant it paints, and if
 *                            `[nina-probe] SURVIVED` still appears in the function log ~90 s later,
 *                            the server owned the clock and the browser was irrelevant.
 *
 * It is auth-guarded like every other page. It writes nothing, spends nothing, and touches no
 * table — a probe that pollutes `nina_turns` would make the job ledger lie about a photograph
 * nobody asked for.
 *
 * `requireUserId()` is called BEFORE `after()` on purpose: the Next 16 `after` reference is
 * explicit that a Server Component may not call `cookies`/`headers` INSIDE the callback ("Calling
 * `cookies()` or `headers()` inside the `after` callback in a Server Component will throw a
 * runtime error"), and must read request data beforehand and close over the values.
 */
export const runtime = 'nodejs'
/**
 * A LITERAL, for the reason `app/api/extract/route.ts` spells out: segment config exports are
 * statically analysed at build time and an imported constant is not a value the analyser can see.
 * 300 is the number under test.
 */
export const maxDuration = 300
/** No caching of a stopwatch. */
export const dynamic = 'force-dynamic'

/** 90 s: comfortably past the 60 s under test, comfortably inside the 300 s claimed. */
const PROBE_HOLD_MS = 90_000
const PROBE_TICK_MS = 10_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function holdAndReport(label: string, startedAt: number): Promise<number> {
  for (let waited = 0; waited < PROBE_HOLD_MS; waited += PROBE_TICK_MS) {
    await sleep(PROBE_TICK_MS)
    // `warn` rather than `info` so it survives any log-level filtering on the dashboard.
    console.warn('[nina-probe] alive', { label, elapsedMs: Date.now() - startedAt })
  }
  return Date.now() - startedAt
}

export default async function NinaProbePage({ searchParams }: PageProps<'/nina/probe'>) {
  const userId = await requireUserId()
  const { inline } = await searchParams
  const startedAt = Date.now()
  /* Opaque, and it is not the user id: THIS REPOSITORY IS PUBLIC and a probe log line is a log
   * line like any other. Four characters is enough to tell two runs apart. */
  const label = `${userId.slice(0, 4)}-${startedAt.toString(36)}`

  if (inline === '1') {
    const heldMs = await holdAndReport(label, startedAt)
    console.warn('[nina-probe] INLINE SURVIVED', { label, heldMs })
    return (
      <main style={{ padding: 24, fontFamily: 'monospace' }}>
        <h1>inline ceiling probe</h1>
        <p>label: {label}</p>
        <p>held {heldMs} ms in the render and returned 200.</p>
        <p>The ceiling on this deployment is above {Math.round(heldMs / 1000)} s.</p>
      </main>
    )
  }

  after(async () => {
    const heldMs = await holdAndReport(label, startedAt)
    console.warn('[nina-probe] SURVIVED', { label, heldMs })
  })

  return (
    <main style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>after() durability probe</h1>
      <p>label: {label}</p>
      <p>
        Close this tab now. Then watch the function log for <code>[nina-probe] alive</code> ticks
        and a final <code>[nina-probe] SURVIVED</code> at ~{PROBE_HOLD_MS} ms.
      </p>
    </main>
  )
}
```

**How it is run and read:**

```bash
# 1. deploy this branch (a preview deployment is enough — same plan, same region, same runtime)
vercel deploy

# 2. Q1, the ceiling. -w prints the status and the total time; -o /dev/null drops the body.
#    Sign in in a browser first and pass the session cookie, or run it in the browser and read
#    the rendered <p>. A 200 after ~90 s answers yes; a 504 after ~60 s answers no.
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' '<deployment-url>/nina/probe?inline=1'

# 3. Q2, durability. Open <deployment-url>/nina/probe in a browser, CLOSE THE TAB the moment it
#    paints, and stream the log:
vercel logs <deployment-url>
```

**The branch, decided here and not later:**

- **Branch A — the probe passes** (`?inline=1` returns 200 with `held ~90000 ms`, *and*
  `[nina-probe] SURVIVED` appears with a closed tab). Record the two measured numbers in the
  Verification section below, then do Steps 2–11 as written.
- **Branch B — the probe shows a ~60 s cut-off** (a 504 at ~60 s, or the `alive` ticks stop at
  ~60 s and `SURVIVED` never appears). **Stop. Do not write Steps 2–11.** This phase reduces to:
  1. Delete `app/nina/probe/page.tsx`.
  2. Do **Step 9 only** — demote the workflow's comments to the truth Finding 3 measured, and
     record in the workflow header that the 60 s ceiling was **re-measured and still holds on this
     deployment**, with the date and the two probe numbers. That kills the stale-comment problem
     for good in the honest direction.
  3. Do **Step 7's comment half only**: record the measured ceiling in
     `lib/nina/imagerecipe.ts`'s header and R4's answer in
     `lib/nina/imagedispatch.ts`'s header (which survives in this branch). Change **no constant**.
  4. Leave `app/nina/page.tsx:128` at `maxDuration = 60`, and leave
     `app/api/cron/nina/route.ts:56` at `maxDuration = 60`.
  5. **PROPAGATE, MECHANICALLY. Do not paraphrase this list — it is reproduced verbatim in the plan
     index's *Decisions* table so that a phase-3 or phase-7 session which never opens this file
     still cannot get it wrong.** Three edits, and they are the whole propagation:

     **(i) The plan index.** Set the `probe` row in *Decisions* to
     *"REFUTED by probe on `<date>`; measured ceiling `<n>` s; GitHub Actions stays the host"*, and
     mark phases 3 and 7 as Branch B in their scope lines. The index is the only channel those
     sessions read.

     **(ii) Phase 3 — TWO literals in `lib/nina/turnflight.ts`, and they move TOGETHER:**
     ```
     NINA_BACKGROUND_BUDGET_MS  240_000 -> 45_000
     NINA_TURN_CHAIN_MAX              2 -> 0
     ```
     Nothing else in phase 3 changes: `after()` is still the primitive, the split still happens,
     the poll is unchanged. With `NINA_TURN_CHAIN_MAX = 0` the chain never starts, so the budget
     stops gating anything and simply records the truth that there is no room for a follow-up.
     `lib/nina/turnflight.test.ts`'s budget case is the tripwire for the dangerous half —
     `NINA_TURN_CHAIN_MAX * perLink <= NINA_BACKGROUND_BUDGET_MS - NINA_TURN_BUDGET.overall`, which
     is `0 <= 0` on Branch B and `140_000 <= 195_000` on Branch A, and which **fails loudly if the
     budget is lowered while the chain is left at 2** (`140_000 <= 0`). See phase 3's Step 2, where
     that inequality is written out and both branches are checked.

     **(iii) Phase 7 — its integration suite is written for BRANCH A and must be reverted to the
     Branch B shape it already documents.** Concretely: `runGenerator()` goes back to
     `worker.runOneJob(workerSql, jobId)`; the `GITHUB_DISPATCH_TOKEN` env stub, the
     `githubDispatches` router arm and the three dispatch assertions are RESTORED; and the
     Finding-2 assertion goes back to draining `after()` first so the row is genuinely
     `error_code='dispatched'` and seconds old before the claim. Phase 7's Step 1 carries both
     shapes side by side under **Branch A / Branch B** headings for exactly this reason.

  6. **What does NOT change on Branch B.** Phase 1 is untouched and still correct — it is the whole
     fix on this branch. Phase 4, phase 5 and phase 6 are unaffected: none of them reads a ceiling,
     a host or a budget. `error_code = 'dispatched'` stays a LIVE phase rather than a legacy value,
     so phase 4's `NINA_JOB_STAGE_LABEL.dispatched` is a stage the runner will really see.

**Impact:** Nothing else in the phase is written until this step has an answer. A phase built on
Branch A's assumption without Branch A's measurement is the same mistake, one ceiling later, that
this whole phase exists to correct.

---

### Step 2: `lib/nina/imagecall.ts` — the OpenRouter call, in-platform

**File:** `lib/nina/imagecall.ts` (new)
**Change:** One module, one exported function. It holds R4's answer, because this is the file a
future reader opens when they wonder whether the provider could do this asynchronously.

It is split out of `imagerun.ts` on purpose: it imports **no database module**, so a unit test can
drive it with a stubbed `fetch` (`tests/nina.imagecall.test.ts`), and **phase 7 can fake exactly
this one function** to drive the whole pipeline end to end without spending $0.04.

**Code:**

```ts
import 'server-only'

import { ninaEnv } from '@/lib/env'

import { classifyImageFailure, type NinaImageFailure } from './imagefail'
import {
  buildImageRequestBody,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from './imagerecipe'

/**
 * **The camera's shutter, on Vercel.** One `POST /api/v1/images/generations`, and nothing else.
 *
 * ── R4, ANSWERED, AND THIS IS WHERE THE ANSWER BELONGS ────────────────────────────────────────
 * The user asked: *"is there an asynchronous api for openrouter image generation? i think this
 * will solve alot of our problems."* **No. There is not.** Checked against the vendor
 * documentation on 2026-09-06:
 *
 *   · Image generation is SYNCHRONOUS. `POST /api/v1/images` returns the bytes as base64 in the
 *     response body; `stream: true` yields SSE partial renders of the same call. There is no job
 *     id, no polling endpoint, no `callback_url` and no webhook. The other image routes are
 *     discovery only — `GET /api/v1/images/models`, `GET /api/v1/images/models/{id}/endpoints`.
 *   · An asynchronous job API DOES exist and it is VIDEO-ONLY:
 *     `POST /api/v1/videos` -> `GET /api/v1/videos/{id}` -> `GET /api/v1/videos/{jobId}/content`,
 *     with `callback_url` webhooks signed by `X-OpenRouter-Signature` and deduplicated by
 *     `X-OpenRouter-Idempotency-Key`. Images are not eligible for it.
 *
 * So do not go looking for a callback to subscribe to; there is nothing on the other side of the
 * wire to subscribe to. **The durability problem is solved on OUR side** — `after()` owns the
 * server's remaining wall clock, `lib/nina/imagerun.ts` is what spends it, and the tab is
 * irrelevant the moment this function is called. If OpenRouter ever ships an async image job API,
 * the change is confined to this file plus one polling caller; nothing else in the pipeline knows
 * the call is synchronous.
 *
 * ── IT NEVER THROWS ───────────────────────────────────────────────────────────────────────────
 * Every failure comes back as a `NinaImageFailure`, exactly as `scripts/nina-image-worker.ts`'s
 * `generate` does, because the caller's whole job is to turn that into one of her sentences and a
 * `catch` that has to re-derive which of four things happened is a `catch` that will get it wrong.
 * `classifyImageFailure` is imported from `lib/nina/imagefail.ts` — the SAME function the worker
 * uses, so both hosts say the same sentence for the same failure.
 *
 * ── `costMicroUsd`, AND PLAN INVARIANT 9 ──────────────────────────────────────────────────────
 * *Money is never spent silently.* Three cases, and the caller is never left guessing:
 *   · `0`    — the request was never sent (the key is absent). Nothing was billed, and recording
 *              $0.04 here would put an imaginary charge in the ledger.
 *   · `null` — the request WAS sent and no usable image came back. Unknown, so the caller
 *              substitutes `NINA_IMAGE_COST_MICRO_USD`. Guessing high is the honest direction for
 *              a cost log; the analysis measured two generations that succeeded at the provider,
 *              crashed on the write and were recorded as free.
 *   · a number on success — `usage.cost` when the provider reports it, the constant when it does
 *              not. `readReportedCostMicroUsd` owns that preference.
 *
 * ── THE TIMEOUT IS NOT THE WORKER'S ───────────────────────────────────────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` is 240 s because a GitHub runner has six hours and no ceiling to
 * race. Here there IS a ceiling — the route segment's `maxDuration` — so the timeout is
 * `NINA_IMAGE_CALL_TIMEOUT_MS` (150 s), derived in `imagerecipe.ts`'s threshold block and asserted
 * in `tests/nina.imagerecipe.test.ts`. Two hosts, two ceilings, two constants, one payload.
 */
export type NinaImageCallResult =
  | { ok: true; b64: string; costMicroUsd: number; latencyMs: number }
  | {
      ok: false
      kind: NinaImageFailure
      latencyMs: number
      /** `0` = certainly nothing was billed. `null` = unknown; the caller guesses high. */
      costMicroUsd: number | null
      /** Never rendered. Log only. */
      detail: string
    }

export async function callNinaImageModel(
  prompt: string,
  seed: number,
): Promise<NinaImageCallResult> {
  const startedAt = Date.now()

  /*
   * Read INSIDE the function and inside a `try`, never at module scope. `ninaEnv()` is a lazy zod
   * group that throws when a member is absent, and the analysis measured production carrying
   * neither of the two it used to hold. It is a one-member group now — `OPENROUTER_API_KEY` —
   * because this phase deleted `GITHUB_DISPATCH_TOKEN` with the doorbell, so the coupling that
   * made a missing dispatch token break a generation is gone as well.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly here would
   * pass the grep and break plan invariant 3 — app code reads secrets through `lib/env.ts`.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    return {
      ok: false,
      kind: 'transport',
      latencyMs: Date.now() - startedAt,
      costMicroUsd: 0,
      detail: `image config: ${String(cause)}`,
    }
  }

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed })),
      signal: AbortSignal.timeout(NINA_IMAGE_CALL_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      /* The request left the building. A generation that was aborted at 150 s was very probably
       * billed, so this is `null` ("unknown, guess high") and not `0`. */
      costMicroUsd: null,
      detail: String(cause),
    }
  }

  const raw = await res.text()

  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      latencyMs: Date.now() - startedAt,
      costMicroUsd: null,
      detail: `HTTP ${res.status} ${raw.slice(0, 500)}`,
    }
  }

  let b64: string | null = null
  let reportedCost: number | null = null
  try {
    const parsed = JSON.parse(raw) as { data?: Array<{ b64_json?: string }>; usage?: unknown }
    b64 = parsed.data?.[0]?.b64_json ?? null
    reportedCost = readReportedCostMicroUsd(parsed.usage)
  } catch {
    b64 = null
  }

  if (b64 == null || b64.length === 0) {
    /*
     * A 200 with no image. `classifyImageFailure` decides whether the body reads as a refusal
     * (`policy`) or as something else (`transport`) — the distinction that matters to the runner
     * is a picture the model would not draw versus a picture that got lost.
     */
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      latencyMs: Date.now() - startedAt,
      costMicroUsd: reportedCost,
      detail: raw.slice(0, 500),
    }
  }

  return {
    ok: true,
    b64,
    /* `null` here means the provider said nothing; `imagerun.ts` substitutes the constant. */
    costMicroUsd: reportedCost ?? 0,
    latencyMs: Date.now() - startedAt,
  }
}
```

> **Note on the success branch's `?? 0`:** it is deliberately different from the worker's
> `?? NINA_IMAGE_COST_MICRO_USD`. `imagerun.ts` substitutes the constant one layer up, so the
> fallback lives in exactly one place on the in-platform path. See Step 4's `finish` call.
> *(If you prefer the worker's shape, move the substitution here and delete it there — but not
> both.)*

**Impact:** `OPENROUTER_API_KEY` becomes a runtime credential on a Vercel function rather than only
on a GitHub runner. RU-2 already sanctions this for `lib/nina/` and `ci:openrouter-guard` already
exempts the directory, so no guard changes.

---

### Step 3: `lib/nina/imagejobs.ts` — the write-side lifecycle moves in-platform

**File:** `lib/nina/imagejobs.ts:105–173` (replace `markNinaImageJobDispatched`, extend
`failNinaImageJob`), and append the three new writes plus one read after it.

The middle of the job lifecycle — claim, complete, requeue — used to live in
`scripts/nina-image-worker.ts` because the app could not host it. It can now. **The read projection
is untouched**: `NinaImageJobRow`, `toJobRow`, `PENDING_PHASES`, `listOpenNinaImageJobs`,
`getNinaImageJob` and `sweepStaleNinaImageJobs` are exactly as phase 4 will find them.

**Change 3a — the imports at the top of the file (`lib/nina/imagejobs.ts:1–20`) become:**

```ts
import 'server-only'

import { and, asc, eq, isNotNull, lt, lte, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'

import { ninaImageApology, type NinaImageFailure } from './imagefail'
import {
  jakartaDayStart,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_STALE_MS,
  type NinaImageJobArgs,
  type NinaImageJobPhase,
  type NinaImagePurpose,
} from './imagerecipe'
import { countNinaTurnsSince, insertNinaMessages, insertNinaTurn } from './queries'
import { resolveNinaSessionForMessage } from './sessionResolve'
```

**Change 3b — `markNinaImageJobDispatched` (`:105–129`) is deleted and replaced by
`claimNinaImageJob`:**

```ts
export interface NinaImageClaim {
  jobId: string
  args: NinaImageJobArgs
  /** After the increment. 1 on a first claim. */
  attempts: number
}

/**
 * **The only lock in the system, now on our side of the wire.** One owner-scoped conditional
 * UPDATE; exactly one caller gets a row back.
 *
 * This replaces `markNinaImageJobDispatched`, and **replacing it is how analysis Finding 2 dies at
 * the source.** That function stamped `error_code = 'dispatched'` and then POSTed to GitHub, while
 * `scripts/nina-image-worker.ts`'s `claimJob` would only claim a `dispatched` row older than
 * `NINA_IMAGE_DISPATCH_GRACE_MS` (60 s) — and a runner takes 25-40 s to boot. Measured: job
 * `ke20AUHNE0TB` was created at 03:02:31.897Z and the runner ran at 03:03:00.4Z, 28.5 s old, and
 * was excluded by the `WHERE` clause of the very statement dispatched to claim it. Fifteen of
 * eighteen jobs ever opened sit at `attempts = 0`. **The doorbell rang a runner that was
 * structurally forbidden from opening the door.** In-platform there is no doorbell, no grace
 * window and no second process: the claim and the generation are the same invocation, so the
 * phase the row is in when the generator looks at it is a phase the generator itself wrote.
 *
 * ── THE TWO CUTOFFS, AND WHY THEY ARE PARAMETERS ──────────────────────────────────────────────
 * The ordinary path (`fireNinaImageGeneration`, milliseconds after `openNinaImageJob`) passes
 * neither and claims a `queued` row at any age. The RECOVERY path (`reviveNinaImageJobs`, on a
 * `/nina` render) passes both, because it is doing exactly what the grace window was invented to
 * prevent — stealing a job another host might still be about to start:
 *
 *   · `queuedBefore`  — a `queued` (or legacy `dispatched`) row older than this was never picked
 *                       up by whoever opened it. `NINA_IMAGE_DISPATCH_GRACE_MS` is the caller's
 *                       value, and that constant's ONE surviving honest meaning.
 *   · `runningBefore` — a `running` row older than this cannot still be running on either host:
 *                       `NINA_IMAGE_RECLAIM_MS` (7 min) exceeds both the Vercel ceiling (300 s)
 *                       and the workflow's `timeout-minutes` (6 min).
 *
 * ── `created_at` IS A PROXY FOR A CLAIM TIME, AND `attempts` IS WHAT MAKES IT SAFE ─────────────
 * `nina_turns` has no `claimed_at` column and this phase adds none — **and no other phase adds one
 * either: this plan set generates NO migration at all** (phase 6 declines an FK with a three-part
 * argument, phase 3 accepts its own race rather than indexing it, and `npm run db:check` must stay
 * clean in every phase). So a SECOND claim compares against a timestamp that
 * is already old, which would make a reclaimed job immediately eligible again — and the only thing
 * stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in the same clause.
 * **That bound is load-bearing, not a nicety.** `scripts/nina-image-worker.ts`'s `claimJob` says
 * the same thing about the same column, deliberately: two hosts, one rule.
 *
 * `error_code = 'dispatched'` is admitted for LEGACY rows only. Nothing writes it after this
 * phase; the fifteen orphans already in the database do carry it, and a claim predicate that
 * excluded them would strand exactly the rows this phase exists to unstick.
 */
export async function claimNinaImageJob(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null } = {},
): Promise<NinaImageClaim | null> {
  const queuedBefore = opts.queuedBefore ?? null
  const runningBefore = opts.runningBefore ?? null

  const notStarted = or(
    eq(ninaTurns.errorCode, JOB_PHASE_QUEUED),
    eq(ninaTurns.errorCode, JOB_PHASE_DISPATCHED),
  )

  const phasePredicate =
    runningBefore === null
      ? queuedBefore === null
        ? notStarted
        : and(notStarted, lt(ninaTurns.createdAt, queuedBefore))
      : or(
          queuedBefore === null
            ? notStarted
            : and(notStarted, lt(ninaTurns.createdAt, queuedBefore)),
          and(eq(ninaTurns.errorCode, JOB_PHASE_RUNNING), lt(ninaTurns.createdAt, runningBefore)),
        )

  const claimed = await db
    .update(ninaTurns)
    .set({
      errorCode: JOB_PHASE_RUNNING,
      /*
       * The increment is in the SAME statement as the phase change, so two concurrent claimants
       * cannot both spend the retry budget. `coalesce` covers a row whose `args` predate the
       * field; `jsonb_set` on a NULL `args` would return NULL and silently erase the prompt, which
       * is why `args IS NOT NULL` is also in the WHERE.
       */
      args: sql`jsonb_set(
        ${ninaTurns.args},
        '{attempts}',
        to_jsonb(coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) + 1)
      )`,
    })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        isNotNull(ninaTurns.args),
        sql`coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}`,
        phasePredicate,
      ),
    )
    .returning({ id: ninaTurns.id, args: ninaTurns.args })

  const row = claimed[0]
  if (row == null) return null

  const args = row.args as NinaImageJobArgs
  return {
    jobId: row.id,
    args,
    attempts: typeof args.attempts === 'number' ? args.attempts : 1,
  }
}

/**
 * The job is done and the photograph is visible. Owner-scoped, and `status='pending'` guarded so
 * it cannot resurrect a row a sweep already closed.
 *
 * **`cost_micro_usd` ACCUMULATES. It is a per-JOB total, not a per-attempt spend.** RECONCILED —
 * see the plan index's *Decisions*, rung 1: invariant 9. A job that failed its first attempt (which
 * `requeueNinaImageJob` below recorded) and succeeded on its second reached OpenRouter twice and
 * was billed twice; a plain `SET` here would overwrite the first bill and record one generation
 * where two happened, which is money spent silently. `scripts/nina-image-worker.ts`'s
 * `finishSelfie`/`finishAvatar` do the same after phase 1 — **two hosts, one meaning for one
 * column**, which is the whole point of fixing it in both places rather than one.
 */
export async function completeNinaImageJob(
  userId: string,
  jobId: string,
  result: { latencyMs: number; costMicroUsd: number },
): Promise<void> {
  await db
    .update(ninaTurns)
    .set({
      status: 'ok',
      errorCode: null,
      latencyMs: result.latencyMs,
      /* `coalesce(cost_micro_usd, 0)` on the right-hand side of a SET is the OLD row value —
       * standard Postgres, and what makes the accumulation correct. */
      costMicroUsd: sql`coalesce(${ninaTurns.costMicroUsd}, 0) + ${result.costMicroUsd}`,
    })
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.status, 'pending')),
    )
}

/**
 * A failed attempt with retry budget left. Back to `queued`, still `pending`, **same prompt and
 * same seed** — which is why both are stored in `args` rather than rebuilt, and why a retry
 * produces the same photograph rather than a different one. Nothing is said to the runner: her
 * bubble still says she is taking the photo, and she is.
 *
 * **IT RECORDS THE SPEND, and an earlier draft of this phase did not.** A retry branch that wrote
 * only `latencyMs` loses a whole generation from the ledger: the attempt reached the provider, was
 * billed, and the row said nothing. That is invariant 9's exact failure, one host over from where
 * the analysis measured it. `costMicroUsd` is what THIS attempt is KNOWN to have spent; `null`
 * means the call returned no figure and **adds nothing**, deliberately — an unknown guessed twice
 * for one picture is a worse log than a missing one, and the terminal branch is where guessing
 * high belongs. `scripts/nina-image-worker.ts`'s `closeFailed` retry branch is the same rule.
 */
export async function requeueNinaImageJob(
  userId: string,
  jobId: string,
  result: { latencyMs: number; costMicroUsd: number | null },
): Promise<void> {
  await db
    .update(ninaTurns)
    .set({
      errorCode: JOB_PHASE_QUEUED,
      latencyMs: result.latencyMs,
      costMicroUsd: sql`coalesce(${ninaTurns.costMicroUsd}, 0) + ${result.costMicroUsd ?? 0}`,
    })
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.status, 'pending')),
    )
}

export interface NinaImageRevivable {
  id: string
  purpose: NinaImagePurpose
  replyToId: string | null
}

/**
 * **R7's recovery read.** Jobs that are still `pending` but that nothing can plausibly be working
 * on: a `queued`/`dispatched` row nobody started, or a `running` row whose invocation cannot still
 * be alive. `lib/nina/imagerun.ts`'s `reviveNinaImageJobs` re-fires them in-platform.
 *
 * **This is a WRITE-PATH read and it is deliberately not `listOpenNinaImageJobs`.** That function
 * sweeps, projects for the screen and is phase 4's to widen; this one answers one question with
 * three columns and no side effect. Phase 4 may fold it into its widened projection — but it must
 * then keep the two cutoffs, which are the whole content of the question.
 *
 * Ordered oldest-first: the job that has been waiting longest is the one the runner is wondering
 * about.
 */
export async function listRevivableNinaImageJobs(
  userId: string,
  cutoffs: { queuedBefore: Date; runningBefore: Date },
): Promise<NinaImageRevivable[]> {
  const rows = await db
    .select({ id: ninaTurns.id, phase: ninaTurns.errorCode, args: ninaTurns.args })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        isNotNull(ninaTurns.args),
        sql`coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}`,
        or(
          and(
            or(
              eq(ninaTurns.errorCode, JOB_PHASE_QUEUED),
              eq(ninaTurns.errorCode, JOB_PHASE_DISPATCHED),
            ),
            lt(ninaTurns.createdAt, cutoffs.queuedBefore),
          ),
          and(
            eq(ninaTurns.errorCode, JOB_PHASE_RUNNING),
            lt(ninaTurns.createdAt, cutoffs.runningBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(ninaTurns.createdAt))

  return rows.map((row) => {
    const args = (row.args ?? null) as NinaImageJobArgs | null
    return {
      id: row.id,
      purpose: args?.purpose === 'avatar' ? 'avatar' : 'selfie',
      replyToId: args?.replyToId ?? null,
    }
  })
}
```

> `lte` is imported above but unused by the code as written; drop it from the import list unless
> you use it. `NINA_IMAGE_DISPATCH_GRACE_MS` is imported for the *caller's* convenience only if you
> choose to default the cutoff here — as written, `imagerun.ts` supplies it, so drop it from this
> file's import list too. **Keep the import list to what the file actually uses; `npm run lint`
> fails on an unused import.**

**Change 3c — `failNinaImageJob` (`:145–173`) is replaced.** Two changes, both invariant 9:
an optional measured cost, and a terminal UPDATE that runs even when the apology cannot be written.

```ts
export async function failNinaImageJob(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  purpose?: NinaImagePurpose
  latencyMs?: number | null
  /**
   * What was actually billed, in micro-USD, when the caller knows. `undefined` keeps the shipped
   * behaviour exactly: `null` for `stale` (nothing ever ran, so nothing was billed) and
   * `NINA_IMAGE_COST_MICRO_USD` for everything else (a call that reached the provider and then
   * timed out was very probably billed, and guessing high is the honest direction for a cost log).
   * `lib/nina/imagerun.ts` passes `0` when the request was never sent.
   */
  costMicroUsd?: number | null
  replyToId?: string | null
  /** Never rendered. Log only. */
  detail?: string
}): Promise<void> {
  /*
   * ── THE COLUMN IS A PER-JOB TOTAL, SO THIS ACCUMULATES AND NEVER OVERWRITES ────────────────
   * RECONCILED — plan index *Decisions*, rung 1 (invariant 9). Three cases, and the third is the
   * one a plain `SET` would get catastrophically wrong:
   *
   *   · a NUMBER      -> `coalesce(cost_micro_usd, 0) + n`. What the caller measured, added on.
   *   · `undefined`, kind != 'stale' -> add `NINA_IMAGE_COST_MICRO_USD`. A call that reached the
   *     provider and then timed out was very probably billed; guessing high is the honest
   *     direction for a cost log. This is the shipped behaviour, made additive.
   *   · `undefined`, kind == 'stale' -> **LEAVE THE COLUMN ENTIRELY ALONE.** The shipped code
   *     wrote `null` here, on the true premise that nothing ever ran. That premise stops holding
   *     the moment a job can be RETRIED: a job that burned attempt 1 (billed, $0.04 recorded by
   *     `requeueNinaImageJob`) and then went stale would have that $0.04 overwritten with NULL by
   *     the sweep — the ledger erasing money on the one path whose whole job is to notice that a
   *     job died. So `stale` omits the field from the SET rather than writing anything. A job
   *     that genuinely never ran still reads NULL, because nothing ever added to it.
   */
  const { userId, jobId, kind } = input
  const purpose = input.purpose ?? 'selfie'

  console.warn('[nina] image job failed', { jobId, kind, purpose, detail: input.detail ?? null })

  /*
   * ── THE APOLOGY MAY NOT SWALLOW THE LEDGER (PLAN INVARIANT 9) ─────────────────────────────
   * This used to be an unguarded `await` before the UPDATE, which is the app-side twin of the bug
   * the analysis measured in `scripts/nina-image-worker.ts`: `closeFailed` threw on its
   * `nina_messages` INSERT and took the process down BEFORE `update nina_turns … set
   * status='failed'` ever ran, so the job stayed `pending`, a later sweep marked it `stale` with
   * `cost_micro_usd: null`, and $0.04 was recorded as free. Money spent must be written down even
   * when her sentence cannot be. The apology is worth a lot; the ledger is not optional.
   *
   * The one exception is structural rather than a special case: an AVATAR job has no pending
   * bubble, because nobody asked for it in the chat, so a message would be Nina apologising for
   * something the runner never requested. See `avatargen.ts`.
   */
  if (purpose === 'selfie') {
    try {
      await postNinaApologyMessage({ userId, jobId, kind, replyToId: input.replyToId ?? null })
    } catch (cause) {
      console.error('[nina] image apology could not be written; closing the job anyway', {
        jobId,
        error: String(cause),
      })
    }
  }

  /* The added amount, or `null` meaning "do not touch the column at all". See the block above. */
  const addend: number | null =
    input.costMicroUsd !== undefined
      ? (input.costMicroUsd ?? NINA_IMAGE_COST_MICRO_USD)
      : kind === 'stale'
        ? null
        : NINA_IMAGE_COST_MICRO_USD

  await db
    .update(ninaTurns)
    .set({
      status: 'failed',
      errorCode: kind,
      latencyMs: input.latencyMs ?? null,
      /* Spread rather than a ternary INSIDE the object: writing `costMicroUsd: undefined` is not
       * the same as omitting the key in drizzle, and "leave it alone" has to mean no assignment. */
      ...(addend === null
        ? {}
        : { costMicroUsd: sql`coalesce(${ninaTurns.costMicroUsd}, 0) + ${addend}` }),
    })
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId)))
}
```

> **`costMicroUsd: null` from a caller now means "unknown — guess high", not "zero".** That is the
> shape `lib/nina/imagerun.ts`'s `closeFailed` already passes (`outcome.costMicroUsd ?? undefined`
> becomes unnecessary; pass `outcome.costMicroUsd` straight through). The one caller that means a
> literal zero — the request never left the building — passes `0`, and `coalesce(x, 0) + 0` is
> correctly a no-op. `imagecall.ts`'s three documented cases map onto this exactly.

**Impact:** `lib/nina/imagedispatch.ts` no longer compiles (its `markNinaImageJobDispatched` import
is gone) — Step 6 deletes it in the same commit. Nothing else imports the deleted symbol.

---

### Step 4: `lib/nina/imagerun.ts` — the generator, and R7

**File:** `lib/nina/imagerun.ts` (new)
**Change:** The whole middle of the pipeline, in-platform: claim, call, store, finish, close,
retry — plus the two entry points (`fireNinaImageGeneration`, `reviveNinaImageJobs`).

**Code:**

```ts
import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'

import { callNinaImageModel, type NinaImageCallResult } from './imagecall'
import { ninaImageCaption, type NinaImageFailure } from './imagefail'
import {
  claimNinaImageJob,
  completeNinaImageJob,
  failNinaImageJob,
  listRevivableNinaImageJobs,
  requeueNinaImageJob,
} from './imagejobs'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_FINISH_RESERVE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REVIVE_BUDGET,
  NINA_IMAGE_RUN_BUDGET_MS,
  NINA_IMAGE_WIDTH,
  ninaImagePathname,
  type NinaImageJobArgs,
  type NinaImagePurpose,
} from './imagerecipe'
import {
  getNinaMessagesByIds,
  insertNinaAvatarAsCurrent,
  insertNinaMessageImages,
  insertNinaMessages,
} from './queries'
import { resolveNinaWriteSession } from './sessionResolve'

/**
 * **Nina's camera, back on the platform.** This file is what
 * `scripts/nina-image-worker.ts` was, minus the reason it had to be somewhere else.
 *
 * ── WHY IT MOVED, IN ONE PARAGRAPH ────────────────────────────────────────────────────────────
 * The off-platform design rested on a sentence repeated in five files: *"the shipping generation
 * is 78.2 s measured and the Hobby ceiling in `sin1` is 60 s, so the work cannot happen on Vercel
 * at all — not in a Server Action, not in a route handler, not in `after()`."* That number
 * expired. Vercel's `/docs/fluid-compute` and `/docs/functions/configuring-functions/duration`
 * (both `last_updated: 2026-08-24`) give Hobby + Fluid compute a default AND maximum of 300 s, and
 * fluid compute has been on by default for new projects since 2025-04-23; this project was created
 * 20 August 2026. **Phase 2 step 1 measured it on this deployment rather than trusting the docs**
 * — see that plan's Verification for the two numbers. 78.2 s fits in 300 s with 3.8x headroom.
 *
 * ── WHAT MOVING BACK BUYS, AND IT IS NOT ONLY LATENCY ─────────────────────────────────────────
 *   1. **THIS FILE CAN IMPORT `lib/nina/queries.ts`.** The worker could not (that module uses
 *      `server-only` and `@/` aliases), so it wrote its own SQL, and its two `nina_messages`
 *      INSERTs enumerated `(id, user_id, role, text, source, turn_id, reply_to_id)` and omitted
 *      `session_id`, which migration 0004 had made `NOT NULL`. Measured on run 33986082744: the
 *      picture was generated, paid for and stored, and the INSERT that would have made it visible
 *      threw — on the success path AND on the apology path. `insertNinaMessages` takes the session
 *      as a REQUIRED third parameter, so **a writer that has not resolved one does not compile.**
 *      That whole class of bug is gone structurally, not by vigilance.
 *   2. **There is no dispatch grace window to lose a job in.** See `claimNinaImageJob`.
 *   3. **One host, one set of column names.** The worker's `information_schema` preflight exists
 *      to catch drift between two hand-written copies; there is one copy on this path.
 *
 * ── R7: "ONCE THE BACKGROUND TASK HAS STARTED, CLOSING THE APP MUST NOT MATTER" ────────────────
 * The guarantee is `after()`'s, and this is exactly what it promises, quoted from
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` (Next 16.3.1):
 *
 *   · *"`after` will run for the platform's default or configured max duration of your route. If
 *     your platform supports it, you can configure the timeout limit using the `maxDuration` route
 *     segment config."* (:50)
 *   · *"`after` will be executed even if the response didn't complete successfully. Including when
 *     an error is thrown or when `notFound` or `redirect` is called."* (:54)
 *   · *"…a primitive called `waitUntil(promise)`, which extends the lifetime of a serverless
 *     invocation until all promises passed to `waitUntil` have settled."* (:250)
 *
 * So the clock that owns this work is the SERVER INVOCATION'S, extended by `waitUntil`, bounded by
 * the invoking route segment's `maxDuration`. The browser is not in that sentence. Closing the
 * tab, losing the network, killing the app — none of them is an input to it. **That is R7, and it
 * is a platform guarantee rather than a hope.**
 *
 * **What it does NOT promise, said plainly so nobody re-promises it:** survival past
 * `maxDuration`, and survival of the instance being killed. Both leave the row `pending`/`running`
 * with the money possibly spent, and both are recovered by `reviveNinaImageJobs` below on the next
 * `/nina` render — or, failing that, by the GitHub backstop, or, failing that, by
 * `sweepStaleNinaImageJobs`' 20-minute apology. Three nets, in that order.
 *
 * ── THE BUDGET IS THE SEGMENT'S, WHICH IS WHY TWO LITERALS MOVED ──────────────────────────────
 * `after()` inherits the `maxDuration` of the route segment it was registered from. The two
 * segments that can start a generation therefore both carry 300:
 *   · `app/nina/page.tsx`         — the chat, whose Server Action runs `generate_image`/`set_avatar`
 *   · `app/api/cron/nina/route.ts` — the evening pass, whose `resolveNinaPromises` calls
 *                                   `generateNinaAvatar`
 * A third caller would need the same line. `NINA_IMAGE_RUN_BUDGET_MS` is what this file may spend
 * of it; `imagerecipe.ts`'s threshold block derives it and `tests/nina.imagerecipe.test.ts`
 * asserts the arithmetic.
 *
 * ── THE GITHUB WORKER IS NOT DELETED, AND THAT IS THE POINT ───────────────────────────────────
 * `scripts/nina-image-worker.ts` and `.github/workflows/nina-image.yml` survive as the backstop
 * and as the manual drain, repaired by phase 1. If Vercel turns out to be the wrong host after
 * all, re-pointing at them is a revert, not a rewrite.
 */

interface StoredImage {
  blobUrl: string
  pathname: string
  bytes: number
}

/** The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix. */
async function storeNinaImage(
  userId: string,
  purpose: NinaImagePurpose,
  b64: string,
): Promise<StoredImage> {
  const bytes = Buffer.from(b64, 'base64')
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    /* Through `lib/env.ts`, never `process.env` — plan invariant 3. `lib/share/rotateBlobs.ts:64`
     * is the precedent; `scripts/` is the only place that reads the raw variable. */
    token: blobEnv().BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname, bytes: bytes.byteLength }
}

/**
 * Success, for a **chat selfie**. The photograph, as an ordinary chat message.
 *
 * **Not a special kind of message** — a `nina_messages` row plus a `nina_message_images` row with
 * `kind = 'generated'`, the same pair an upload writes. That is what makes it quotable,
 * gallery-able and unread-able for free. `source = 'chat'` on purpose and NOT a sixth
 * `NinaMessageSource`: she is answering something he said in an open conversation, minutes ago.
 *
 * ── ONE READ ANSWERS BOTH QUESTIONS THE WORKER GOT WRONG ──────────────────────────────────────
 * `getNinaMessagesByIds` is owner-scoped, so the single row it returns settles:
 *   · **which session** the photograph lands in — the one he asked in, which is
 *     `resolveNinaSessionForMessage`'s policy verbatim, not a second copy of it; and
 *   · **whether the quote target still exists** — a `reply_to_id` whose target was deleted would
 *     violate the foreign key and lose the photograph, so a miss degrades to a plain message. The
 *     worker spells this as a subselect inside its INSERT; this is the same rule through the same
 *     policy module.
 * A foreign or vanished id comes back empty and falls through to `resolveNinaWriteSession`, which
 * is assumption A3 and creates a session rather than giving up (R11 lets him delete his last one).
 *
 * ── THE ORDER IS LOAD-BEARING ─────────────────────────────────────────────────────────────────
 * The message and its image row go in FIRST, then the job is marked `ok`. A crash between the two
 * leaves a `pending` job whose photo is already in the chat, which a sweep will eventually
 * apologise for — odd, survivable, self-correcting. The reverse order would mark the job done with
 * no photograph anywhere and no sweep left to notice, which is precisely the failure the user
 * reported.
 *
 * `prompt` gets the sidecar (prompt as sent, model, seed) and `description` gets the scene prose.
 * No `glm-4.6v` describe pre-pass runs over a generated image: we wrote the picture, so paying a
 * vision call to be told back our own prompt would be absurd.
 */
async function finishSelfie(
  userId: string,
  jobId: string,
  args: NinaImageJobArgs,
  image: StoredImage,
  result: { latencyMs: number; costMicroUsd: number },
): Promise<void> {
  const quoted =
    args.replyToId == null
      ? null
      : ((await getNinaMessagesByIds(userId, [args.replyToId]))[0] ?? null)

  const sessionId = quoted?.sessionId ?? (await resolveNinaWriteSession(userId))

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        /* Never empty. `nina_messages.text` is notNull and would accept `''`, but an empty bubble
         * is not a message. `ninaImageCaption` is deterministic in the job id, so a row read twice
         * says the same thing. */
        body: ninaImageCaption(jobId),
        source: 'chat',
        turnId: jobId,
        replyToId: quoted?.id ?? null,
      },
    ],
    sessionId,
  )

  /* `insertNinaMessages` returns `[]` rather than throwing when the session is not his. That
   * cannot happen here — we just resolved it from his own rows — so it is a bug, not a
   * degradation, and it must not be swallowed into a "successful" job with no bubble. */
  if (message == null) throw new Error('finishSelfie: no message row was written')

  await insertNinaMessageImages(userId, [
    {
      messageId: message.id,
      kind: 'generated',
      blobUrl: image.blobUrl,
      pathname: image.pathname,
      width: NINA_IMAGE_WIDTH,
      height: NINA_IMAGE_HEIGHT,
      bytes: image.bytes,
      description: args.scene,
      prompt: args.sidecar,
      sortOrder: 0,
    },
  ])

  await completeNinaImageJob(userId, jobId, result)
}

/**
 * Success, for an **avatar**.
 *
 * `insertNinaAvatarAsCurrent` is `lib/nina/queries.ts`'s, and using it rather than re-implementing
 * it is the second half of what moving on-platform buys. The un-current and the insert are one
 * `db.batch`, in that order, because the partial unique index `nina_avatars_user_current_unq`
 * makes the order mandatory rather than merely tidy: inserting a second `is_current` row before
 * un-currenting the first violates the index. The worker had to hand-roll that transaction; this
 * does not.
 *
 * **`announced_at` is left NULL, and that NULL IS the `avatar_changed` proactive trigger.** It is
 * reached only on success, which is the structural half of "her announcement must not fire for a
 * photograph that does not exist". No `nina_messages` row: nobody asked in chat, and the next cron
 * tick is what makes her mention it.
 */
async function finishAvatar(
  userId: string,
  jobId: string,
  args: NinaImageJobArgs,
  image: StoredImage,
  result: { latencyMs: number; costMicroUsd: number },
): Promise<void> {
  await insertNinaAvatarAsCurrent(userId, {
    blobUrl: image.blobUrl,
    pathname: image.pathname,
    width: NINA_IMAGE_WIDTH,
    height: NINA_IMAGE_HEIGHT,
    bytes: image.bytes,
    source: args.source === 'admin' ? 'admin' : 'generated',
    description: args.scene,
  })

  await completeNinaImageJob(userId, jobId, result)
}

/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * With budget left, the row goes back to `queued` and stays `pending`, so the SAME prompt and the
 * SAME seed are tried again — by `runNinaImageJob`'s own loop if the wall clock allows, otherwise
 * by the next `/nina` render's revival, otherwise by the GitHub backstop. Nothing is said to the
 * runner.
 *
 * With the budget spent, the job is terminal and **the apology goes in with it, in the same
 * call**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. `failNinaImageJob` owns that pairing, skips the message for an avatar
 * job, and writes the terminal UPDATE even if the apology INSERT fails.
 */
async function closeFailed(
  userId: string,
  jobId: string,
  args: NinaImageJobArgs,
  attempts: number,
  outcome: { kind: NinaImageFailure; latencyMs: number; costMicroUsd: number | null; detail: string },
): Promise<'retry' | 'gave-up'> {
  console.warn('[nina] in-platform generation failed', {
    jobId,
    kind: outcome.kind,
    attempts,
    detail: outcome.detail,
  })

  if (attempts < NINA_IMAGE_MAX_ATTEMPTS) {
    /* The spend travels with the requeue. Invariant 9: this attempt reached the provider and was
     * billed, and the retry must not erase it. `null` adds nothing rather than guessing — see
     * `requeueNinaImageJob`. */
    await requeueNinaImageJob(userId, jobId, {
      latencyMs: outcome.latencyMs,
      costMicroUsd: outcome.costMicroUsd,
    })
    return 'retry'
  }

  await failNinaImageJob({
    userId,
    jobId,
    kind: outcome.kind,
    purpose: args.purpose,
    latencyMs: outcome.latencyMs,
    /* `null` means "we do not know, guess high" and `failNinaImageJob` substitutes the constant;
     * `0` means the request never left. Passed STRAIGHT THROUGH, not `?? undefined`: `undefined`
     * is the "caller has no opinion" case that only the give-up sweep uses, and conflating the two
     * is what would let an unknown spend be recorded as nothing. Plan invariant 9 in one argument. */
    costMicroUsd: outcome.costMicroUsd,
    replyToId: args.replyToId,
    detail: outcome.detail,
  })
  return 'gave-up'
}

/** One attempt: claim, call, store, finish. Returns what happened. */
async function attemptOnce(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null },
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const claim = await claimNinaImageJob(userId, jobId, opts)
  if (claim == null) return 'none'

  const { args, attempts } = claim
  console.info('[nina] image job claimed', { jobId, purpose: args.purpose, attempt: attempts })

  const outcome: NinaImageCallResult = await callNinaImageModel(args.prompt, args.seed)
  if (!outcome.ok) return closeFailed(userId, jobId, args, attempts, outcome)

  /* The provider reported nothing, so the measured price stands in. ONE substitution point on this
   * path — `imagecall.ts` deliberately does not do it too. */
  const costMicroUsd = outcome.costMicroUsd > 0 ? outcome.costMicroUsd : NINA_IMAGE_COST_MICRO_USD
  const result = { latencyMs: outcome.latencyMs, costMicroUsd }

  let image: StoredImage
  try {
    image = await storeNinaImage(userId, args.purpose, outcome.b64)
  } catch (cause) {
    /*
     * **A store failure is a `transport` failure and not a crash.** The picture exists and we could
     * not keep it, which from the runner's side is "the photo did not come through" — and the
     * money is already spent, which is why it is still logged and still counted against the cap.
     */
    return closeFailed(userId, jobId, args, attempts, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      costMicroUsd,
      detail: `store: ${String(cause)}`,
    })
  }

  try {
    if (args.purpose === 'avatar') {
      await finishAvatar(userId, jobId, args, image, result)
    } else {
      await finishSelfie(userId, jobId, args, image, result)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * the `reap-orphaned-blobs` skill exists for.
     */
    return closeFailed(userId, jobId, args, attempts, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      costMicroUsd,
      detail: `finish: ${String(cause)}`,
    })
  }

  console.info('[nina] image job done', {
    jobId,
    purpose: args.purpose,
    bytes: image.bytes,
    costMicroUsd,
    latencyMs: outcome.latencyMs,
  })
  return 'ok'
}

/**
 * **Claim, generate, close — and retry only while the wall clock can actually hold another one.**
 *
 * The retry loop is bounded twice, and both bounds matter:
 *   · `NINA_IMAGE_MAX_ATTEMPTS`, enforced inside `claimNinaImageJob`'s WHERE, so two runners
 *     cannot spend the same budget; and
 *   · the DEADLINE below, so a second attempt is started only when a whole `NINA_IMAGE_CALL_TIMEOUT_MS`
 *     plus the finish writes still fit. **A retry that would be killed halfway is worse than no
 *     retry**: it spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * That deadline is why a FAST failure (a 500 at five seconds) retries immediately and a SLOW one (a
 * 150 s timeout) does not. The slow case is left `queued` and picked up by
 * `reviveNinaImageJobs` on the next `/nina` render, which starts a fresh invocation with a fresh
 * 300 s.
 */
export async function runNinaImageJob(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null } = {},
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const deadlineAt = Date.now() + NINA_IMAGE_RUN_BUDGET_MS

  for (;;) {
    const outcome = await attemptOnce(userId, jobId, opts)
    if (outcome !== 'retry') return outcome

    if (Date.now() + NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS > deadlineAt) {
      console.warn('[nina] retry left for the next host — not enough wall clock', {
        jobId,
        remainingMs: deadlineAt - Date.now(),
      })
      return 'retry'
    }
    /* A reclaim on the SAME invocation: the row is `queued` again and this loop owns it. The
     * cutoffs stay as the caller set them, so a revival that was allowed to steal a stale row is
     * still allowed to retry it. */
  }
}

/**
 * **The entry point every caller uses, and the reason the tab does not matter.**
 *
 * `after()` and not a bare floating promise: a floating promise in a Server Action can be cut off
 * the instant the response is flushed, whereas `after` is documented to *"run for the platform's
 * default or configured max duration of your route"* and to be *"executed even if the response
 * didn't complete successfully"*. On Vercel that is `waitUntil`, which *"extends the lifetime of a
 * serverless invocation until all promises passed to `waitUntil` have settled"*. The work is the
 * server's from the moment this returns.
 *
 * **It is registered from inside another `after()` after phase 3**, when `runNinaTurn` moves into
 * the background — the Next 16 reference sanctions that in as many words: *"`after` can be nested
 * inside other `after` calls"*. The budget does not compound; both share the segment's
 * `maxDuration`, which is what `NINA_TURN_SPENT_MS` accounts for in the threshold block.
 *
 * It returns `void` and never throws. A generation nobody is waiting for that fails to start must
 * not take a chat turn down with it: the row stays `pending`, and the revival and the give-up
 * sweep are both still ahead of it.
 */
export function fireNinaImageGeneration(input: {
  userId: string
  jobId: string
  purpose: NinaImagePurpose
  replyToId: string | null
  /** Set only by `reviveNinaImageJobs`. See `claimNinaImageJob`. */
  queuedBefore?: Date | null
  runningBefore?: Date | null
}): void {
  const { userId, jobId, purpose, queuedBefore, runningBefore } = input

  after(async () => {
    try {
      const outcome = await runNinaImageJob(userId, jobId, { queuedBefore, runningBefore })
      console.info('[nina] image run finished', { jobId, purpose, outcome })
    } catch (cause) {
      /*
       * The bookkeeping itself broke — a dead connection, a bug. The row stays `pending`; the next
       * `/nina` render revives it, and if that never happens `sweepStaleNinaImageJobs` closes it at
       * 20 minutes with her apology. This is the one path here that relies on a later mechanism
       * rather than closing the job itself, and both later mechanisms exist.
       */
      console.error('[nina] image run threw', { jobId, purpose, error: String(cause) })
    }
  })
}

/**
 * **R7's second net: arriving at `/nina` restarts what an invocation dropped.**
 *
 * `sweepStaleNinaImageJobs` already turns a 20-minute-old `pending` job into an apology. That is
 * the DEADLINE. This is the RESCUE, and it runs first: a job whose invocation was killed at
 * `maxDuration`, or whose doorbell (in the old design) never rang, is re-fired on a fresh
 * invocation with a fresh 300 s — on the server, in `after()`, so the runner may close the tab the
 * instant the page paints.
 *
 * **It is deliberately not part of the give-up sweep and not part of `listOpenNinaImageJobs`.**
 * Those are phase 4's to widen and one of them writes an apology; this one writes nothing and only
 * schedules. Keeping them separate is what lets phase 4 reshape the projection without touching
 * the recovery path.
 *
 * `NINA_IMAGE_REVIVE_BUDGET` is 1: one revival per render. A burst of six queued jobs must not
 * turn one page load into six concurrent generations sharing one function's wall clock — and the
 * next render takes the next one.
 *
 * The two cutoffs are the whole content of the question: a `queued` row younger than
 * `NINA_IMAGE_DISPATCH_GRACE_MS` may be about to be started by the invocation that opened it, and
 * a `running` row younger than `NINA_IMAGE_RECLAIM_MS` may still be generating. Reviving either
 * would bill twice for one photograph.
 */
export async function reviveNinaImageJobs(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const queuedBefore = new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
  const runningBefore = new Date(now.getTime() - NINA_IMAGE_RECLAIM_MS)

  let candidates: Awaited<ReturnType<typeof listRevivableNinaImageJobs>>
  try {
    candidates = await listRevivableNinaImageJobs(userId, { queuedBefore, runningBefore })
  } catch (cause) {
    /* A render must not fail over a recovery read. The give-up sweep is still ahead of the job. */
    console.warn('[nina] could not look for revivable image jobs', { error: String(cause) })
    return 0
  }

  let revived = 0
  for (const candidate of candidates.slice(0, NINA_IMAGE_REVIVE_BUDGET)) {
    fireNinaImageGeneration({
      userId,
      jobId: candidate.id,
      purpose: candidate.purpose,
      replyToId: candidate.replyToId,
      queuedBefore,
      runningBefore,
    })
    revived += 1
  }

  if (revived > 0) console.warn('[nina] revived image jobs in-platform', { userId, revived })
  return revived
}
```

**Impact:** This is where every photograph is now made. `nina_message_images` gains its first row
ever; `nina_avatars` gains its first `source = 'generated'` row ever.

---

### Step 5: point the two entry points at the new generator

**File:** `lib/nina/selfiegen.ts:3` and `:92`; `lib/nina/avatargen.ts:3` and `:109`
**Change:** Swap one import and one call in each. **Nothing else in either file moves** — the
return type still says `state: 'dispatched'`, which is why `imagetools.ts`, `avatartools.ts` and
`promises.ts` need zero edits.

**`lib/nina/selfiegen.ts`, line 3:**

```ts
import { fireNinaImageGeneration } from './imagerun'
```

**`lib/nina/selfiegen.ts`, line 92 (the last statement before the return):**

```ts
  /*
   * **The generation, on this server, in `after()`.** It used to be `fireNinaImageDispatch`, which
   * POSTed a `workflow_dispatch` at GitHub; the 60 s ceiling that forced that is gone (see
   * `imagerun.ts`'s header), and with it the grace window that made a targeted dispatch
   * mathematically incapable of claiming the job it was dispatched for.
   *
   * `state: 'dispatched'` below is UNCHANGED on purpose. It has always meant "the job row exists
   * and the work has been handed off, NOT that a photograph exists", and it still does — only the
   * host on the other side of the handoff changed. Renaming it would edit `imagetools.ts`,
   * `avatartools.ts` and `promises.ts` for no behavioural gain, and those three files belong to
   * other phases.
   */
  fireNinaImageGeneration({ userId, jobId, purpose: 'selfie', replyToId })
```

**`lib/nina/avatargen.ts`, line 3:**

```ts
import { fireNinaImageGeneration } from './imagerun'
```

**`lib/nina/avatargen.ts`, line 109:**

```ts
  /* In-platform now — see `selfiegen.ts`'s note and `imagerun.ts`'s header. Nobody asked in chat,
   * so there is nothing to quote and nothing to apologise into. */
  fireNinaImageGeneration({ userId, jobId, purpose: 'avatar', replyToId: null })
```

**Also update the stale prose in both headers.** In `selfiegen.ts:15-18` and `avatargen.ts:13-16`,
replace *"`{ ok: true, state: 'dispatched' }` means the job row exists and GitHub has been rung"*
with *"…means the job row exists and the generation has been scheduled on this server's remaining
wall clock (`lib/nina/imagerun.ts`)"*, and replace *"`scripts/nina-image-worker.ts` writes the
`nina_messages` + `nina_message_images` pair 1-3 minutes later (`finishSelfie`)"* with
*"`lib/nina/imagerun.ts` writes that pair ~80-120 s later; `scripts/nina-image-worker.ts` is the
backstop that does it if this invocation could not."* One sentence each; the rest of both headers
is still true.

**Impact:** `lib/nina/imagetools.ts:36` carries a comment about `fireNinaImageDispatch` failing the
job with an apology. That sentence is now about `fireNinaImageGeneration` and is still true (the
failure path still ends in `failNinaImageJob`). Update the symbol name in that one comment;
change no code in that file.

---

### Step 6: delete the doorbell, and the secret it needed

**Files:** `lib/nina/imagedispatch.ts` (delete), `tests/nina.imagedispatch.test.ts` (delete),
`lib/env.ts:106–121`, `.env.example:55–66`

**6a — delete the two files:**

```bash
git rm lib/nina/imagedispatch.ts tests/nina.imagedispatch.test.ts
```

Every symbol in `imagedispatch.ts` is now unreachable: `fireNinaImageDispatch` (Step 5 replaced
both call sites), `dispatchNinaImageJob` (only the deleted test called it), `githubDispatchUrl`,
`NINA_WORKER_REPO`, `NINA_WORKER_WORKFLOW`, `NINA_WORKER_REF`. The `workflow_dispatch:` trigger
stays in the YAML as the **manual** drain — a human clicking *Run workflow* in the Actions UI needs
no PAT, which is the whole reason the token can go.

**6b — `lib/env.ts:106–121`, `ninaSchema` becomes a one-member group:**

```ts
/**
 * F33 owns this. Lazily validated, like `blobEnv()` and `cronEnv()`: a deploy without an
 * OpenRouter key must still serve every screen that is not Nina's, so a missing value is an error
 * at her first photograph and not at build time.
 *
 * **RU-2 in one variable.** `OPENROUTER_API_KEY` was build-time-only (D12) and read by
 * `tools/gen_badge_art.py` and nothing else. It is now also a RUNTIME credential, for `lib/nina/`
 * ONLY, queued and daily-capped. Badge and record art stay offline-and-committed.
 *
 * `scripts/check-openrouter-boundary.mjs` still greps `app/`, `lib/` and `components/` for this
 * literal and still fails for every one of them except two exempted paths: `lib/nina/`, and this
 * file. `lib/env.ts` is exempted because it is the app's single environment contract and the
 * alternative — hiding the variable in a `lib/nina/env.ts`, or assembling its name so the grep
 * misses it — would be evading the guard rather than amending it.
 *
 * ── `GITHUB_DISPATCH_TOKEN` USED TO BE HERE, AND ITS ABSENCE IS A FIX ─────────────────────────
 * It was RU-20's dispatch credential: a fine-grained PAT with `actions: write`, used by
 * `lib/nina/imagedispatch.ts` to fire the image worker's `workflow_dispatch`. Phase 2 moved the
 * generation onto Vercel's own 300 s Fluid ceiling, so there is no programmatic dispatch left to
 * authenticate; the GitHub workflow survives as a `schedule:` backstop and a manual *Run workflow*
 * button, and neither needs a token from us.
 *
 * **Deleting it also repairs a measured production failure.** A zod group `fail()`s when ANY
 * member is absent, so `ninaEnv()` threw for callers that never read the missing member. Measured
 * 2026-09-04: `vercel env ls production` carried neither variable, every call threw before
 * reaching the network, and three image jobs sat `pending` with `cost_micro_usd` null while Nina
 * said nothing for twenty minutes. A one-member group cannot have that failure mode — the only
 * variable that can be missing is the one the code was about to use.
 */
const ninaSchema = z.object({
  OPENROUTER_API_KEY: nonEmpty('OPENROUTER_API_KEY'),
})
```

**6c — `.env.example`:** delete lines 55–66 (the whole `--- GitHub Actions dispatch ---` block,
including the `GITHUB_DISPATCH_TOKEN=` line). Add, immediately after the `OPENROUTER_API_KEY=`
line:

```
# The image generation runs ON VERCEL now (300 s Fluid ceiling), so this key is a RUNTIME
# credential for lib/nina/ as well as a build-time one for the badge skills.
# .github/workflows/nina-image.yml is a demoted BACKSTOP and reads the same key from repository
# secrets, not from here. There is no longer a GITHUB_DISPATCH_TOKEN: nothing dispatches that
# workflow programmatically any more, and a human clicking "Run workflow" needs no PAT.
```

**6d — `lib/nina/.workflows/package_readme.md:301`.** The module tour reads
*"`imagejobs.ts` (job row lifecycle and quota), `imagedispatch.ts` (fires the GH-Actions workflow),
…"*. Replace that one clause with
*"`imagecall.ts` (the OpenRouter image call), `imagerun.ts` (claim → generate → store → finish,
inside `after()`)"* and, where the tour mentions the workflow, say it is the backstop. This is the
one live, maintained document that names a module this phase deletes.

**Impact:** one fewer secret to deploy, and the coupling that made a missing dispatch token break a
generation is gone. **The full grep of every surviving reference to the deleted symbols was run and
is reconciled:** `fireNinaImageDispatch` has exactly two call sites (`selfiegen.ts:92`,
`avatargen.ts:109`, both replaced in Step 5) plus two comment mentions (`imagejobs.ts:109`, inside
the doc of the function this phase deletes, and `imagetools.ts:36`, whose symbol name Step 5
updates); `markNinaImageJobDispatched` has exactly one caller (`imagedispatch.ts:168`, deleted);
`NINA_IMAGE_DISPATCH_TIMEOUT_MS` has exactly one reader (`imagedispatch.ts:116`, deleted);
`GITHUB_DISPATCH_TOKEN` appears in `lib/env.ts:120` (6b), `.env.example:66` (6c),
`tests/nina.imagedispatch.test.ts` (deleted), `.github/workflows/nina-image.yml:5` (inside the
header Step 9a replaces), and two historical documents below. **It is NOT in
`scripts/check-client-secret-boundary.mjs`'s hardcoded `SECRETS` list** (verified by reading the
script), so no guard needs editing for its removal.

`ROADMAP_v0.1.0.md:140` and `NINA_CHATBOT_PLAN.md:607` still mention the variable; both are
historical records of a decision that was taken, and rewriting a shipped plan document is out of
this phase's scope — see Handoffs.

---

### Step 7: re-derive the threshold chain for a 300 s host

**File:** `lib/nina/imagerecipe.ts` — header (after line 62) and the block at `:98–115`
**Change:** Record Finding 4 where the reader is, delete the constant only the doorbell used, and
add the six the in-platform generator needs. **`NINA_IMAGE_STALE_MS`, `NINA_IMAGE_RECLAIM_MS`,
`NINA_IMAGE_MAX_ATTEMPTS`, `NINA_WORKER_CALL_TIMEOUT_MS` and `NINA_WORKER_TIMEOUT_MINUTES` keep
their values** — the derivation changed, the numbers still satisfy it, and changing a number that
does not need to change is how a threshold chain stops being checkable.

**7a — append to the file header, after the `── THE SIDECAR CONVENTION ──` section:**

```
 * ── THE CEILING THAT MOVED, AND THE ONE MEASUREMENT THAT MATTERS ──────────────────────────────
 * Five files used to say: *"the shipping generation is 78.2 s measured and the Hobby ceiling in
 * `sin1` is 60 s, so the work cannot happen on Vercel at all."* That is no longer true.
 * `/docs/fluid-compute` and `/docs/functions/configuring-functions/duration` (both
 * `last_updated: 2026-08-24`) give Hobby + Fluid compute a default AND maximum of 300 s, and
 * fluid compute has been on by default for new projects since 2025-04-23; `vercel project
 * inspect run-insights` reports Created At: 20 August 2026. **The phase that acted on this
 * measured it rather than trusting it** — a deployed `maxDuration = 300` route held past 60 s and
 * an `after()` callback survived a closed tab; both numbers are in that phase's plan file.
 *
 * The threshold chain below is therefore derived for a host with TWO ceilings, not one:
 *   · VERCEL, the primary — 300 s per invocation, shared with whatever the turn already spent.
 *   · GITHUB ACTIONS, the backstop — six hours per job, capped at `timeout-minutes: 6` by us.
 * That is why there are two call timeouts. They are not a duplication; they are two hosts.
 *
 * ── THERE IS NO ASYNCHRONOUS OPENROUTER IMAGE API (R4) ────────────────────────────────────────
 * The full answer, with the endpoints, is in `lib/nina/imagecall.ts`'s header, next to the code
 * that would have used one. Short version: image generation is synchronous (base64 in the
 * response, or SSE partials with `stream: true`), and the async job API — `POST /api/v1/videos`,
 * `callback_url`, `X-OpenRouter-Signature` — is video-only. Do not go looking for a webhook.
```

**7b — replace `lib/nina/imagerecipe.ts:98–115` entirely:**

```ts
/* ── The threshold chain. Two hosts, one ordering; asserted in tests/nina.imagerecipe.test.ts. ── */

/**
 * **The primary host's ceiling, measured.** Vercel Hobby + Fluid compute: default AND maximum
 * 300 s. Every `after()` callback registered from a route segment inherits that segment's
 * `maxDuration`, which is why `app/nina/page.tsx` and `app/api/cron/nina/route.ts` both carry the
 * literal `300` — a segment left at 60 would kill a generation at 60 no matter what this file
 * says.
 *
 * DECLARED here so the arithmetic below is checkable in one place; the segments themselves must
 * spell a LITERAL, because segment config exports are statically analysed at build time and an
 * imported constant is not a value the analyser can see.
 */
export const NINA_HOST_MAX_DURATION_MS = 300_000

/**
 * What a chat turn may already have spent out of the invocation before a `generate_image` tool
 * call starts a generation in a nested `after()`. **Measured: 13-45 s.** The high end, because a
 * budget derived from the typical case is a budget that fails on the bad day.
 */
export const NINA_TURN_SPENT_MS = 45_000

/**
 * **The in-platform OpenRouter call's timeout.** 1.9x the measured 78.2 s.
 *
 * Not `NINA_WORKER_CALL_TIMEOUT_MS`: on a GitHub runner there is no ceiling to race, so 240 s is
 * free there and would be reckless here. 45 + 150 + 20 = 215 s inside a 300 s invocation, with
 * 85 s of slack for a cold start and a slow Blob write.
 */
export const NINA_IMAGE_CALL_TIMEOUT_MS = 150_000

/** The Blob `put` plus three indexed writes, with slack. Reserved out of the run budget. */
export const NINA_IMAGE_FINISH_RESERVE_MS = 20_000

/**
 * What `lib/nina/imagerun.ts` may spend of the invocation, from the moment it starts. Its retry
 * loop refuses to begin an attempt that would not fit inside what is left of this — a retry killed
 * halfway spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * `NINA_TURN_SPENT_MS + NINA_IMAGE_RUN_BUDGET_MS <= NINA_HOST_MAX_DURATION_MS` is the inequality
 * the whole in-platform design rests on. 45 + 200 = 245 <= 300.
 */
export const NINA_IMAGE_RUN_BUDGET_MS = 200_000

/** The backstop worker's own OpenRouter timeout. 3x the measured 78.2 s; off Vercel, nothing to
 *  race. Unchanged by the migration, because that host's ceiling did not move. */
export const NINA_WORKER_CALL_TIMEOUT_MS = 240_000

/** `timeout-minutes` on the backstop workflow's job. Must exceed the call timeout plus setup. */
export const NINA_WORKER_TIMEOUT_MINUTES = 6

/**
 * How long a job nobody has started is left alone before ANOTHER host may pick it up.
 *
 * **Its meaning narrowed and its value did not.** It used to be "how long a `dispatched` row is
 * left alone before a backstop treats it as un-started", and it was the arithmetic half of the
 * measured deadlock: the doorbell stamped `dispatched` 25-40 s before the runner it woke could
 * boot, and a runner may not claim a `dispatched` row younger than this — so a targeted dispatch
 * could never claim the job it was dispatched for. In-platform there is no doorbell, so nothing
 * writes `dispatched` at all; what survives is the honest question `reviveNinaImageJobs` asks on
 * a `/nina` render — *has this `queued` row been sitting long enough that whoever opened it is
 * plainly not going to run it?* Sixty seconds is a generous yes: the ordinary path claims within
 * milliseconds.
 */
export const NINA_IMAGE_DISPATCH_GRACE_MS = 60_000

/**
 * How old a `running` row must be before it is safe to reclaim. **> BOTH ceilings**, because
 * either host may have been the one that died:
 *   · Vercel  — `NINA_HOST_MAX_DURATION_MS` = 300 s
 *   · Actions — `NINA_WORKER_TIMEOUT_MINUTES` = 6 min = 360 s
 * 420 s clears both. Reclaiming sooner would claim a live generation twice and bill it twice.
 */
export const NINA_IMAGE_RECLAIM_MS = 420_000

/**
 * One retry. **Load-bearing, not a nicety**: neither host has a claim timestamp to compare against
 * (`nina_turns` has no `claimed_at` column), so both use `created_at` as a proxy, and this bound
 * is the only thing that stops an infinite reclaim loop on a row whose `created_at` is already old.
 */
export const NINA_IMAGE_MAX_ATTEMPTS = 2

/**
 * **The app-side give-up, and the deadline the runner actually experiences.** A `pending` row
 * older than this is closed `failed`/`stale` with her apology, by `sweepStaleNinaImageJobs` on
 * every `/nina` render.
 *
 * `NINA_IMAGE_STALE_MS > NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS` (1200 > 840) is the
 * inequality R22 depends on most: she must not apologise while a generation is still running, or
 * the photograph lands after the apology.
 *
 * **It is a real deadline again, and it was not before.** The design used to lean on the workflow's
 * `schedule: '*/10'` to rescue a lost job inside this window. Measured over 2026-09-05/06, the
 * actual gaps between scheduled runs were **1 h 46 m to 4 h 19 m** — one to two orders of magnitude
 * past this. So every lost job was declared stale long before any backstop looked at it. With the
 * generation in-platform the normal path never touches the backstop at all: it resolves in ~80-120
 * s, `reviveNinaImageJobs` re-fires a dropped one on the next render, and twenty minutes is the
 * outer bound on how long he can be left wondering. Long on purpose — apologising at four minutes
 * and delivering at five is worse than a two-minute wait.
 */
export const NINA_IMAGE_STALE_MS = 1_200_000

/**
 * **What `schedule:` measured, against what it declares. FINDING 3.**
 *
 * **CARRIED FORWARD FROM PHASE 1 — do not drop it when replacing this block.** Phase 1 added this
 * constant and `tests/nina.imagerecipe.test.ts` asserts it against `NINA_IMAGE_STALE_MS`; deleting
 * it here would stop the test file compiling. The value and the measurement are unchanged by the
 * migration, because the migration did not change what GitHub does.
 *
 * `.github/workflows/nina-image.yml` declares `cron: '*''/10 * * * *'`. Twelve consecutive
 * `schedule` runs over 2026-09-04..06 fired with gaps of **1 h 46 m to 4 h 19 m** — never ten
 * minutes. GitHub documents `schedule:` as best-effort and heavily deprioritises it on low-activity
 * public repositories. This is the SHORTEST measured gap, so it is the most generous number the
 * evidence supports.
 *
 * The assertion that matters is `> NINA_IMAGE_STALE_MS`: **the backstop cannot beat the give-up.**
 * That was the load-bearing fact when the backstop was the only rescue, and it is now the reason
 * the backstop is a THIRD net rather than the deadline — `reviveNinaImageJobs` is the second, and
 * it runs on the same render as the give-up sweep.
 */
export const NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000

/** Jobs one BACKSTOP run will drain, so a burst cannot exceed the workflow's `timeout-minutes`. */
export const NINA_IMAGE_SWEEP_BUDGET = 3

/**
 * Jobs one `/nina` RENDER will revive. One. A burst of six queued jobs must not turn a single page
 * load into six concurrent generations sharing one invocation's wall clock — and the next render
 * takes the next one, which is fast enough for a cap of six a day.
 */
export const NINA_IMAGE_REVIVE_BUDGET = 1
```

`NINA_IMAGE_DISPATCH_TIMEOUT_MS` (the old line 105) is **deleted** — only the deleted dispatcher
read it.

**Impact:** `scripts/nina-image-worker.ts` imports `NINA_IMAGE_DISPATCH_GRACE_MS`,
`NINA_IMAGE_MAX_ATTEMPTS`, `NINA_IMAGE_RECLAIM_MS`, `NINA_IMAGE_SWEEP_BUDGET`,
`NINA_WORKER_CALL_TIMEOUT_MS` — **all five keep their names and their values**, so phase 1's file
compiles untouched. It does not import `NINA_IMAGE_DISPATCH_TIMEOUT_MS`. The zero-import rule is
preserved: nothing added here imports anything.

---

### Step 8: raise the two segment ceilings, and wire the revival

**File 8a:** `app/nina/page.tsx:104–128`
**Change:** `maxDuration` 60 → 300, with the reason.

```ts
/**
 * **For the Server Action AND for the generation it starts, not for this render.** This page is a
 * handful of indexed reads and is done in milliseconds; `ChatScreen` then calls `sendNinaMessage`
 * from a client event handler, and a Server Action's timeout is the *page segment's*, not the
 * action file's. `app/r/[id]/page.tsx:65` already states this quoting Next's `maxDuration`
 * reference — "If using Server Actions, set the `maxDuration` at the page level to change the
 * default timeout of all Server Actions used on the page".
 *
 * ── WHY IT IS 300 AND NOT 60 ──────────────────────────────────────────────────────────────────
 * Everything Nina does off the response path runs in `after()`, and the Next 16 `after` reference
 * is explicit that "`after` will run for the platform's default or configured max duration of your
 * route". So THIS NUMBER is the wall clock that owns a photograph. At 60 it could not own one: the
 * shipping generation is 78.2 s measured, which is why the work used to be exiled to a GitHub
 * Actions runner reached through a `workflow_dispatch` doorbell.
 *
 * Vercel Hobby + Fluid compute gives 300 s by default and as a maximum (`/docs/fluid-compute`,
 * `/docs/functions/configuring-functions/duration`, both `last_updated: 2026-08-24`; fluid on by
 * default for projects created after 2025-04-23, and this one was created 2026-08-20). **Measured
 * on this deployment before it was relied on** — see the phase plan's probe. 45 s of turn plus a
 * 200 s generation budget is 245 s inside it.
 *
 * Fluid bills active CPU rather than wall clock, so a function that spends 150 s awaiting
 * OpenRouter costs about what a function that returns in 150 ms costs. Raising the ceiling buys
 * headroom, not a bill.
 *
 * A LITERAL `300`, for the reason `app/api/extract/route.ts` spells out at length: segment config
 * exports are statically analysed at build time and an imported constant is not a value the
 * analyser can see. `NINA_HOST_MAX_DURATION_MS` in `lib/nina/imagerecipe.ts` is the same number
 * for the arithmetic; these two must be changed together.
 */
export const maxDuration = 300
```

**File 8b:** `app/nina/page.tsx:22` — extend the import block:

```ts
import { listOpenNinaImageJobs } from '@/lib/nina/imagejobs'
import { reviveNinaImageJobs } from '@/lib/nina/imagerun'
```

**File 8c:** `app/nina/page.tsx:184–195` — the `Promise.all`'s second element gains a sibling. The
destructuring must stay positional, so add the new call as a **fifth** element and keep the four
existing bindings where they are:

```ts
  const [rows, , avatarRow, photoRow] = await Promise.all([
    /*
     * F35 R2. ONE session's messages. `Promise.resolve` on the empty branch rather than a
     * conditional `await` after the block, on the `?photo=` branch's precedent below: keeping it
     * inside the `Promise.all` means the empty case costs nothing and the ordinary case still
     * overlaps the other three reads.
     */
    activeSessionId === null
      ? Promise.resolve<NinaMessageRow[]>([])
      : listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT, sessionId: activeSessionId }),
    listOpenNinaImageJobs(userId),
    getCurrentNinaAvatar(userId),
    photoPointer === null ? Promise.resolve(null) : readPhotoPointer(userId, photoPointer),
    /*
     * **R7's second net, and the reason `maxDuration` above is 300.** `listOpenNinaImageJobs`
     * above sweeps a 20-minute-old job into an apology — that is the DEADLINE. This is the
     * RESCUE, and it runs alongside: a job whose invocation was killed at `maxDuration`, or whose
     * dispatch was lost back when there was a dispatch, is RE-FIRED here on a fresh 300 s
     * invocation inside `after()`. Arriving on this page is therefore not only R22's last
     * guarantee, it is the pipeline's self-repair.
     *
     * It schedules and returns; it awaits no model and writes no row, so plan invariant 4 holds —
     * the generation itself is in `after()`, which the Next reference documents as running "after
     * the response (or prerender) is finished". The runner may close the tab the moment this page
     * paints and the photograph still arrives.
     *
     * Bounded to `NINA_IMAGE_REVIVE_BUDGET` (one) per render. Its result is deliberately unused:
     * the count is a log line, and what the screen shows is `listOpenNinaImageJobs`' business.
     */
    reviveNinaImageJobs(userId),
  ])
```

> **Read the file before editing.** The fourth element at `:184` is the `?photo=` branch, which is
> spelled inline in the shipped file rather than as `readPhotoPointer`. Keep whatever is there
> verbatim and append the fifth element after it; the point of this hunk is the fifth line and the
> comment above it, not a rewrite of the other four.

**File 8b-bis:** `app/nina/page.tsx:178–183` — the paragraph immediately ABOVE the `Promise.all`,
which after this phase says two false things. Verified verbatim in the shipped file:

> *"Invariant 4 holds: two indexed reads and, on the rare stale path, a handful of UPDATEs. No
> model call is awaited in a render path — **the generation itself is on a GitHub runner**."*

Both halves move. Replace that sentence with:

```ts
   * Invariant 4 holds, and it holds for a longer reason than it used to. FIVE reads now, all
   * indexed; on the rare stale path a handful of UPDATEs; and — new — `reviveNinaImageJobs`, which
   * SCHEDULES a generation and awaits nothing. No model call is awaited in a render path. The
   * generation itself no longer runs on a GitHub runner: it runs on THIS invocation, inside
   * `after()`, which is why `maxDuration` above is 300 and why the runner may close the tab the
   * moment this page paints (R7). `.github/workflows/nina-image.yml` is the backstop behind it.
```

Leaving this paragraph alone would put the stale premise — the one that produced the whole
off-platform design — three lines above the code that refutes it.

**File 8d:** `app/api/cron/nina/route.ts:50–56`

```ts
export const runtime = 'nodejs'
/**
 * A LITERAL, not an imported constant: segment config exports are statically analysed at build
 * time and `next build` rejects an identifier here (the trap `/api/extract` and
 * `/api/cron/rollup` both document).
 *
 * ── WHY 300 AND NOT 60 ────────────────────────────────────────────────────────────────────────
 * `resolveNinaPromises` below calls `generateNinaAvatar` when a promise comes due, and after the
 * image pipeline moved on-platform that generation runs in THIS ROUTE'S `after()` budget — the
 * Next `after` reference: "`after` will run for the platform's default or configured max duration
 * of your route". At 60 a promised photograph would be killed at 60 s against a measured 78.2 s
 * generation, silently, on a cron nobody is watching.
 *
 * **The loop's own pacing is unchanged.** `NINA_SOFT_DEADLINE_MS` (50 s) and `NINA_MIN_SLOT_MS`
 * still decide how many users this pass serves, and they are deliberately NOT raised: a nightly
 * proactive pass that runs for five minutes is not five times more proactive. This number is the
 * ceiling for the background work the pass STARTS, not a licence for the pass itself to run longer.
 */
export const maxDuration = 300
```

**Impact:** the only two segments from which a generation can begin now carry a budget that can
hold one. Fluid bills active CPU, so an invocation that is 150 s of awaited I/O is cheap.

---

### Step 9: demote the workflow to a backstop, honestly

**File:** `.github/workflows/nina-image.yml:1–16` (header), `:30–37` (the schedule comment), `:52–59`
(the `timeout-minutes` comment)
**Change:** Comments only. **No trigger is removed, no step is removed, `timeout-minutes` stays 6.**
This file and `scripts/nina-image-worker.ts` are the fallback if Vercel turns out to be the wrong
host, and phase 1 has just repaired them.

> **Collision with phase 1.** Phase 1 adds the measured-cadence fact to this file's comments. The
> replacement header below *contains* that fact. If phase 1 landed first, this hunk supersedes it;
> keep only one copy of the measurement.

**9a — replace lines 1–16:**

```yaml
# Nina's camera, DEMOTED TO A BACKSTOP.
#
# ── WHAT CHANGED, AND WHY THIS FILE STILL EXISTS ──────────────────────────────────────────────
# This workflow used to be THE generator. RU-19/RU-20 exiled the work here because "the shipping
# generation is 78.2 s measured and Vercel Hobby caps a function at 60 s in sin1". That ceiling is
# gone: Vercel Hobby + Fluid compute is 300 s by default AND as a maximum (/docs/fluid-compute and
# /docs/functions/configuring-functions/duration, both last_updated 2026-08-24), fluid has been on
# by default for projects created after 2025-04-23, and this project was created 2026-08-20. It was
# MEASURED on the deployment, not merely read, before the generation was moved. The generator now
# lives in lib/nina/imagerun.ts and runs inside after() on the app's own invocation.
#
# THIS FILE IS NOT DEAD, AND MUST NOT BE DELETED. It is:
#   1. the BACKSTOP — a job whose Vercel invocation was killed at maxDuration is still `pending`,
#      and scripts/nina-image-worker.ts can finish it;
#   2. the MANUAL DRAIN — "Run workflow" in the Actions UI, with a job id, drains one stuck job
#      without a laptop, a database client or a deploy;
#   3. the ROLLBACK TARGET — if Vercel turns out to be the wrong host, reverting the phase that
#      moved the work lands on a WORKING pipeline rather than on the broken one, because the
#      three measured defects were repaired here first.
#
# ── THE SCHEDULE IS NOT WHAT IT SAYS, AND THIS IS THE MEASUREMENT ─────────────────────────────
# The cron below declares */10. It is not honoured. Measured over 2026-09-05 and 2026-09-06, the
# actual gaps between `schedule` runs were 1 h 46 m to 4 h 19 m — never ten minutes:
#
#   2026-09-06T13:01:11Z   2026-09-06T09:21:01Z   2026-09-06T05:02:58Z   2026-09-06T00:35:29Z
#   2026-09-05T22:56:43Z   2026-09-05T21:10:08Z   2026-09-05T19:06:09Z   2026-09-05T17:17:15Z
#   2026-09-05T15:06:34Z   2026-09-05T12:03:18Z   2026-09-05T08:38:38Z   2026-09-05T04:45:49Z
#
# GitHub documents `schedule:` as best-effort, deprioritises it heavily on low-activity public
# repositories, and DISABLES it entirely after 60 days with no repository activity. The old design
# derived its 20-minute give-up window as if */10 were honoured, so every lost job was declared
# stale one to two orders of magnitude before any backstop looked at it — findings 2 and 3 composed
# into a closed loop with no exit.
#
# So: DO NOT DERIVE A DEADLINE FROM THIS SCHEDULE. The deadline is lib/nina/imagejobs.ts's
# sweepStaleNinaImageJobs (NINA_IMAGE_STALE_MS, 20 min, on every /nina render), and the RESCUE is
# lib/nina/imagerun.ts's reviveNinaImageJobs, which re-fires a dropped job in-platform on the same
# render. This schedule is a third net behind those two, and it is the one whose arrival time we do
# not control.
```

**9b — replace the `schedule:` comment at `:30–37`:**

```yaml
  schedule:
    # Kept at */10 rather than widened, and the reason is NOT latency — see the header: the real
    # cadence is hours. It stays because THIS REPOSITORY IS PUBLIC, so Actions minutes are
    # unmetered and the coverage is free; a run that finds nothing exits 0 in ~40 s. If the
    # repository is ever made private, GitHub Free's 2,000 minutes/month would be exceeded and the
    # one-line fix is */30 — with no loss of guarantee, because the guarantee has not lived here
    # since the generation moved on-platform.
    - cron: '*/10 * * * *'
```

**9c — replace the `timeout-minutes` comment at `:55–58`:**

```yaml
    # NINA_WORKER_TIMEOUT_MINUTES in lib/nina/imagerecipe.ts. It must exceed
    # NINA_WORKER_CALL_TIMEOUT_MS (240 s) plus setup, and NINA_IMAGE_RECLAIM_MS (7 min) must exceed
    # BOTH this and the Vercel ceiling (NINA_HOST_MAX_DURATION_MS, 300 s), so a job killed on
    # EITHER host cannot be mistaken for one still running. tests/nina.imagerecipe.test.ts asserts
    # that chain.
    timeout-minutes: 6
```

**9d — the `workflow_dispatch` input comment at `:23–27`** gains one sentence, because its caller
changed:

```yaml
      job_id:
        # The ONLY input, and deliberately opaque. THIS REPOSITORY IS PUBLIC, so dispatch inputs
        # are world-readable in the run log and the Actions UI. The scene prose, the prompt and the
        # user id therefore live in nina_turns.args and never travel as an input; a nanoid names a
        # row that nobody without DATABASE_URL can read.
        #
        # NOTHING DISPATCHES THIS PROGRAMMATICALLY ANY MORE. lib/nina/imagedispatch.ts and the
        # GITHUB_DISPATCH_TOKEN it needed are both gone; this input is for a HUMAN clicking "Run
        # workflow", which needs no PAT. Leave it blank to sweep.
        description: 'nina_turns.id of the job to run (blank = sweep)'
        required: false
        default: ''
```

**Impact:** the workflow's behaviour is byte-for-byte unchanged. Only its claims about its own role
and cadence change, and they change to what was measured.

---

### Step 10: tests and the payload guard

**File 10a:** `tests/nina.imagecall.test.ts` (new) — takes over the role the deleted
`tests/nina.imagedispatch.test.ts` played: it holds the "it never throws" contract against a
stubbed `fetch`, including the env-group case that production falsified.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { callNinaImageModel } from '../lib/nina/imagecall.ts'
import { NINA_IMAGE_MODEL, OPENROUTER_IMAGE_URL } from '../lib/nina/imagerecipe.ts'

/**
 * **The shutter's contract.** `callNinaImageModel`'s docblock promises "it never throws — every
 * failure comes back as a `NinaImageFailure`", and the previous generation of this pipeline
 * falsified exactly that promise in the only environment that mattered: on 2026-09-04 Vercel
 * production carried no `OPENROUTER_API_KEY`, the lazy zod group threw before the network, and
 * image jobs sat `pending` with `cost_micro_usd` null while Nina said nothing for twenty minutes.
 *
 * **`tests/support/setup.ts` stubs the core and LLM groups and deliberately does not stub the nina
 * group** — so the unset case below is that failure, reproduced for free. Do not "fix" this suite
 * by adding `OPENROUTER_API_KEY` to those defaults; that would delete the only test that
 * reproduces the bug.
 *
 * This file replaces `tests/nina.imagedispatch.test.ts`, which tested the GitHub doorbell that no
 * longer exists.
 */
describe('callNinaImageModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OPENROUTER_API_KEY
  })

  it('resolves { ok: false } instead of throwing when the key is absent, and bills nothing', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await callNinaImageModel('a photograph', 42)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.detail).toBe('string')
      expect(result.detail).toContain('OPENROUTER_API_KEY')
      /* PLAN INVARIANT 9, in its other direction: a request that never left bills nothing, and
       * recording the $0.04 constant here would put an imaginary charge in the ledger. */
      expect(result.costMicroUsd).toBe(0)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends the shared payload to the shared endpoint', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }], usage: { cost: 0.04 } }), {
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await callNinaImageModel('a photograph on the track', 4242)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.b64).toBe('QUJD')
      /* `usage.cost` is preferred over the constant — the price must not go stale silently. */
      expect(result.costMicroUsd).toBe(40_000)
    }

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(OPENROUTER_IMAGE_URL)
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    /* buildImageRequestBody is the ONE payload definition and both hosts use it. */
    expect(body.model).toBe(NINA_IMAGE_MODEL)
    expect(body.seed).toBe(4242)
    expect(body.size).toBeUndefined()
  })

  it('classifies a refusal as policy and a 500 as transport, and guesses the cost high', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('blocked by the content policy', { status: 403 })),
    )
    const refused = await callNinaImageModel('x', 1)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.kind).toBe('policy')
      /* `null` = unknown, and the caller substitutes the measured price. Guessing high is the
       * honest direction for a cost log. */
      expect(refused.costMicroUsd).toBeNull()
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream exploded', { status: 500 })),
    )
    const broken = await callNinaImageModel('x', 1)
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.kind).toBe('transport')
  })

  it('a 200 with no image is a failure, not a success with an empty photograph', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    )

    const result = await callNinaImageModel('x', 1)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('transport')
  })
})
```

**File 10b:** `tests/nina.imagerecipe.test.ts` — the `describe('the threshold chain', …)` block at
`:269–312`. **Four assertions are kept verbatim** (`the retry budget is small and positive`,
`the cap is a small positive integer`, `a sweep run cannot exceed the workflow ceiling`,
`the workflow's job ceiling exceeds the call timeout plus setup`). Two change and three are added.
The `NINA_IMAGE_DISPATCH_TIMEOUT_MS` import does not exist any more; add the six new constants to
the import block at `:6–25`.

> **CARRIED FORWARD FROM PHASE 1, and it is the reason this rewrite is not a free hand.** Phase 1
> adds one `it()` to this same describe block — *"the schedule backstop cannot beat the give-up, and
> nothing may assume it can"* — plus its `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` import. **Keep both.**
> The assertion is reproduced verbatim in the block below and needs no numeric change, because this
> phase leaves `NINA_IMAGE_STALE_MS` at `1_200_000`. Deleting it would delete the only guard against
> a future reader re-deriving a ten-minute rescue from the `*/10` the workflow still declares — the
> exact mistake that composed Findings 2 and 3 into a closed loop.

```ts
describe('the threshold chain', () => {
  // Every one of these is derived in the phase plan's Step 7. They are asserted here so an edit to
  // one cannot silently break the ordering the whole R22 guarantee rests on. TWO HOSTS now: the
  // Vercel invocation that does the work, and the GitHub runner that backstops it.

  it('the backstop worker keeps its own timeout, at least 2x the measured 78.2 s', () => {
    expect(NINA_WORKER_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(160_000)
  })

  it("the workflow's job ceiling exceeds the call timeout plus setup", () => {
    expect(NINA_WORKER_TIMEOUT_MINUTES * 60_000).toBeGreaterThan(
      NINA_WORKER_CALL_TIMEOUT_MS + 60_000,
    )
  })

  it('the in-platform run fits inside the host ceiling with a full turn already spent', () => {
    // THE inequality the whole in-platform design rests on. 45 + 200 = 245 <= 300.
    expect(NINA_TURN_SPENT_MS + NINA_IMAGE_RUN_BUDGET_MS).toBeLessThanOrEqual(
      NINA_HOST_MAX_DURATION_MS,
    )
  })

  it('one whole attempt plus its finish writes fits inside the run budget', () => {
    // Otherwise `runNinaImageJob` could never start even its FIRST attempt without overrunning.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS).toBeLessThanOrEqual(
      NINA_IMAGE_RUN_BUDGET_MS,
    )
  })

  it('the in-platform call timeout is above the measured 78.2 s and below the worker’s', () => {
    // Above, or a merely slow day throws away $0.04 and a photograph. Below the worker's 240 s,
    // because THIS host has a ceiling to race and that one does not.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS).toBeGreaterThan(78_200)
    expect(NINA_IMAGE_CALL_TIMEOUT_MS).toBeLessThan(NINA_WORKER_CALL_TIMEOUT_MS)
  })

  it('a running job is only reclaimed after NEITHER host can still be running it', () => {
    // Reclaiming sooner claims a live generation twice and bills it twice. Both ceilings, because
    // either host may have been the one that died.
    expect(NINA_IMAGE_RECLAIM_MS).toBeGreaterThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
    expect(NINA_IMAGE_RECLAIM_MS).toBeGreaterThan(NINA_HOST_MAX_DURATION_MS)
  })

  it('the not-yet-started grace is shorter than the reclaim', () => {
    // A queued row that nobody picked up is safe to steal long before a running one is.
    expect(NINA_IMAGE_DISPATCH_GRACE_MS).toBeLessThan(NINA_IMAGE_RECLAIM_MS)
  })

  it('the app gives up only after the retries can have been exhausted', () => {
    // Otherwise she would apologise while a generation was still running, and the photograph would
    // land after the apology. THIS is the inequality R22 depends on most.
    expect(NINA_IMAGE_STALE_MS).toBeGreaterThan(NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS)
  })

  it('a backstop sweep run cannot exceed the workflow ceiling', () => {
    expect(NINA_IMAGE_SWEEP_BUDGET * 90_000).toBeLessThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
  })

  it('the schedule backstop cannot beat the give-up, and nothing may assume it can', () => {
    // PHASE 1'S ASSERTION, KEPT. FINDING 3. The workflow declares `*/10` and twelve consecutive
    // measured runs came 1 h 46 m to 4 h 19 m apart. The original chain was derived as if a
    // ten-minute rescue existed, which put the backstop comfortably inside the 20-minute give-up;
    // it is in fact five to thirteen times OUTSIDE it. This asserts the DIRECTION rather than the
    // magnitude, so it survives a re-measure and fails the moment someone lowers STALE on the
    // strength of the declared cron.
    //
    // It matters MORE after the migration, not less: the backstop is now the third net behind
    // reviveNinaImageJobs and the give-up sweep, and a reader who mistook it for the first would
    // conclude the deadline has hours of slack it does not have.
    expect(NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS).toBeGreaterThan(NINA_IMAGE_STALE_MS)
  })

  it('a render revives at most one job', () => {
    // A burst of six must not become six concurrent generations on one invocation's wall clock.
    expect(NINA_IMAGE_REVIVE_BUDGET).toBe(1)
  })

  it('the retry budget is small and positive', () => {
    expect(NINA_IMAGE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1)
    expect(NINA_IMAGE_MAX_ATTEMPTS).toBeLessThanOrEqual(3)
  })

  it('the cap is a small positive integer', () => {
    expect(Number.isInteger(NINA_IMAGE_DAILY_CAP)).toBe(true)
    expect(NINA_IMAGE_DAILY_CAP).toBeGreaterThan(0)
    expect(NINA_IMAGE_DAILY_CAP).toBeLessThanOrEqual(20)
  })
})
```

**File 10c:** `scripts/check-llm-payload-boundary.mjs` — append one entry to `GUARDED_CALLS` (after
the `rankNinaSearchHits` entry, before the closing `]`), and add its bullet to the header's list.

**Verified against the real script, because three phases lean on how it works:**

- The engine is ten lines (`:174–183`). It walks `app`, `lib`, `components` for `.ts`/`.tsx`,
  strips comments, and for each guard does `if (guard.sanctioned.includes(path)) continue` and then
  `new RegExp(\`\\b${guard.symbol}\\s*\\(\`).test(source)`. **Sanctioning is strictly PER-FILE, not
  per-callsite** — a sanctioned file may call the symbol from any number of functions.
- `sanctioned` paths are built with `join()` from `node:path`; follow that.
- **The count appears TWICE in the header and both must change to EIGHT:** `:22`
  (`// ── RULE 2 STANDS, AND NOW COVERS SEVEN ENTRY POINTS…`) and `:25`
  (`// All seven entries ship from the phase that owns this file…`). `:46` states the invariant
  explicitly — *"the count above is now the length of the array below"* — so leaving one at SEVEN
  is a documented lie, not a typo.
- `:25` also asserts **"NO OTHER PHASE EDITS IT"**. Reconciled: **this phase is the sole editor of
  this script in the set.** Phase 3 needs no edit here (its `runNinaBackgroundTurn` lives inside
  `lib/nina/actions.ts`, which is already sanctioned for `runNinaTurn`, and per-file sanctioning
  makes the guard green with no change); phase 4 needs none (its pages call no guarded symbol).

```js
  {
    symbol: 'runNinaImageJob',
    sanctioned: [
      // Its own module, because a guard that fails on the definition site is a guard that forces
      // the definition to be renamed — the reason `runNinaTurn` sanctions `lib/nina/turn.ts`.
      join('lib', 'nina', 'imagerun.ts'),
    ],
    advice:
      'A generation is a 78.2 s measured OpenRouter call plus a Blob write. It runs ONLY from ' +
      'lib/nina/imagerun.ts, inside after(), scheduled by fireNinaImageGeneration — which is what ' +
      'makes it survive the tab closing (R7). A page or an action that awaited it would block the ' +
      'runner for well over a minute on work the server already owns.',
  },
```

Header bullet, to add to the list at `:31–58`:

```
//   · `runNinaImageJob` — the in-platform image generation, 78.2 s measured plus a Blob write.
//     It is the reason `app/nina/page.tsx` and `app/api/cron/nina/route.ts` carry
//     `maxDuration = 300`: `after()` inherits the route segment's ceiling, and at 60 the
//     generation would be killed mid-call. It runs from `lib/nina/imagerun.ts` and nowhere else;
//     every caller reaches it through `fireNinaImageGeneration`, never by awaiting it.
```

**Impact:** `fireNinaImageGeneration` is deliberately **not** guarded — it is the non-blocking
wrapper and every caller is meant to use it. Guarding it would fail on `selfiegen.ts`,
`avatargen.ts` and `imagerun.ts` itself, which is the opposite of the point.

---

### Step 11: remove the probe

**File:** `app/nina/probe/page.tsx`
**Change:**

```bash
git rm app/nina/probe/page.tsx
```

The measurement it produced is recorded in this plan's Verification section, in
`lib/nina/imagerecipe.ts`'s header and in the workflow's header. A stopwatch route left on a
deployed app is a route somebody will find.

**Impact:** none — nothing imports it and nothing links to it.

---

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck`
**Lint:** `npm run lint`
**Tests:** `npm test`
**Guards:** `npm run ci:openrouter-guard && npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:f11-guard`

**The probe's measured numbers — FILL THESE IN AT STEP 1, before Step 2 is written:**

| Question | Command | Expected on Branch A | Measured |
|---|---|---|---|
| Ceiling | `curl -w '%{http_code} %{time_total}\n' '<url>/nina/probe?inline=1'` | `200 ~90.x` | *(record)* |
| Durability with the tab closed | open `<url>/nina/probe`, close the tab, `vercel logs <url>` | `[nina-probe] SURVIVED { heldMs: ~90000 }` | *(record)* |

**Manual check, in this order:**

1. **The photograph, tab open.** In `/nina`, ask her for a selfie. Within ~2 minutes a
   `nina_message_images` row with `kind = 'generated'` exists and the bubble renders:
   ```sql
   select count(*) from nina_message_images where kind = 'generated';   -- was 0, ever
   ```
2. **The photograph, tab closed — this is R7.** Ask for another selfie and **close the tab within
   five seconds of the send returning.** Reopen `/nina` two minutes later. The bubble is there.
   The function log shows `[nina] image job claimed` and `[nina] image job done` for that job id,
   with no request in between.
3. **The profile picture.** Ask her to change her profile picture. `nina_avatars` gains its first
   ever `source = 'generated'`, `is_current = true` row, with `announced_at` NULL:
   ```sql
   select id, source, is_current, announced_at from nina_avatars order by created_at desc limit 3;
   ```
4. **The ledger is honest (invariant 9).** Every `kind='image'` row written by this phase carries a
   non-null `cost_micro_usd`, whether it succeeded or failed:
   ```sql
   select status, error_code, latency_ms, cost_micro_usd
   from nina_turns where kind = 'image' and created_at > now() - interval '1 hour';
   ```
5. **The backstop still drains.** Hand-open a job row (or find one of the fifteen orphans), then in
   the GitHub Actions UI run *nina-image* → *Run workflow* with that job id. The run claims it and
   finishes it. **This proves the rollback target is alive**, and it is the one check that would
   silently rot otherwise.
6. **The revival.** Set a job's `error_code` to `'running'` and its `created_at` to eight minutes
   ago, then load `/nina`. The log shows `[nina] revived image jobs in-platform` and the job runs.

**Exit criteria:**

- The probe's two numbers are recorded in the table above, and the branch taken is written down.
- A chat request for a photo produces a `nina_message_images` row within ~2 minutes **with the tab
  closed**. `nina_message_images` is no longer empty.
- A chat request to change her profile picture produces a `nina_avatars` row with
  `source = 'generated'` and `is_current = true`.
- `lib/nina/imagedispatch.ts` and `GITHUB_DISPATCH_TOKEN` no longer exist anywhere in `app/`,
  `lib/`, `components/` or `.env.example`.
- The GitHub workflow still drains an orphaned job when run manually.
- `npm run build`, `npm test`, `npm run lint`, `npm run typecheck` and all six guards are green.

---

## Handoffs

**To Phase 3 (WhatsApp-style send)** — the four numbered contract points in the Interface Contract
above are for it specifically. The one that will bite if it is missed: **the `after()` budget is the
route segment's `maxDuration`, and phase 3 must not relocate `runNinaTurn` into a segment that does
not carry 300.**

**To Phase 4 (job tracking)** — `listRevivableNinaImageJobs` in `lib/nina/imagejobs.ts` is a
write-path read I added for recovery. Phase 4 may fold it into its widened projection; if it does,
the two cutoffs (`queuedBefore`, `runningBefore`) are the whole content of the question and must
survive. Also: `error_code = 'dispatched'` is now a **legacy** value carried only by rows written
before this phase — the detail page should not present it as a live stage.

**To Phase 7 (end-to-end test) — FOUR things, and the first two change its test file materially.**

1. **The awaitable generator entry point is
   `runNinaImageJob(userId, jobId, opts?): Promise<'none' | 'ok' | 'retry' | 'gave-up'>`**, exported
   from `lib/nina/imagerun.ts`. That is exactly the shape phase 7's `runGenerator()` asked for in
   its *Requires* item 4, Branch A. Its return values match `runOneJob`'s one-for-one, so phase 7's
   three call sites need no change — only the body of `runGenerator()`.
2. **There is no `workflow_dispatch` POST left to assert.** `fireNinaImageGeneration` registers an
   `after()` that runs the generation in-process; nothing calls `api.github.com`, nothing stamps
   `error_code = 'dispatched'`, and `GITHUB_DISPATCH_TOKEN` no longer exists. Phase 7's Branch A
   suite must therefore: drop the `GITHUB_DISPATCH_TOKEN` env stub, drop the `githubDispatches`
   assertions, expect the row at `error_code = 'queued'` (not `'dispatched'`) when the generator is
   called, and turn the invariant-4 check into the stronger statement that **no `api.github.com`
   request is made at all**. Phase 7's Step 1 has been edited to carry both shapes.
3. **The OpenRouter seam is `lib/nina/imagecall.ts`.** One exported function,
   `callNinaImageModel(prompt, seed)`, importing no database module — the only thing on the whole
   path that touches OpenRouter. Fake it (`vi.mock('@/lib/nina/imagecall')`) or route
   `globalThis.fetch` at `OPENROUTER_IMAGE_URL`; either works, because this file calls the global.
   Everything downstream — the claim, the Blob `put`, `insertNinaAvatarAsCurrent`,
   `completeNinaImageJob` — stays real. What that does *not* prove is that OpenRouter returns an
   image; the `LLM_LIVE_TEST=1` variant buys that half.
4. **`cost_micro_usd` is a per-job total.** A job that burns both attempts records
   `2 x NINA_IMAGE_COST_MICRO_USD`. Phase 7's terminal-failure case asserts that number, not
   `not null` — see its Handoffs, which have been reconciled.

**Not done, deliberately, and whose they are:**

- **`ROADMAP_v0.1.0.md:140` and `NINA_CHATBOT_PLAN.md:607` still list `GITHUB_DISPATCH_TOKEN`.**
  Both are historical records of decisions that were taken at the time, not live configuration, and
  rewriting a shipped plan document is not this phase's business. A separate card.
- **The orphaned `nina/` Blob objects** left behind by the measured Finding-1 crashes (a generation
  succeeded, was stored, and the row that would have referenced it threw). The
  `reap-orphaned-blobs` skill covers exactly this; the plan index puts it out of scope.
- **A `claimed_at` column on `nina_turns`.** Both hosts use `created_at` as a proxy for a claim
  time and lean on `NINA_IMAGE_MAX_ATTEMPTS` to make it safe. A real column would be strictly
  better — and it is a migration, and **this plan set generates no migration in any phase**
  (reconciled; see the index's *Decisions*). Its own card.
- **`app/api/nina/image/route.ts`.** The analysis's impact-point table (row 5) anticipated a new
  route handler for in-platform generation. This phase deliberately creates none: the durability
  primitive is `after()` registered from the segment that already owns the request, and a fetch to
  an internal route would buy a fresh invocation at the cost of a second auth surface, a second
  ownership check and a self-call that Vercel bills twice. The impact point is **superseded, not
  skipped** — `lib/nina/imagerun.ts` is what stands where that row expected a route.
- **`app/api/cron/nina/route.ts`'s `NINA_SOFT_DEADLINE_MS`.** I raised that route's `maxDuration`
  because a promised photograph starts in its `after()`; I deliberately did **not** raise the
  loop's own 50 s pacing. A nightly proactive pass that runs for five minutes is not five times
  more proactive.
- **`imagetools.ts`, `avatartools.ts`, `promises.ts`** — untouched apart from one stale symbol name
  in a comment, because `generateNinaSelfie`/`generateNinaAvatar` kept their signatures on purpose.

---

## Rollback

This phase is one commit on `feature/nina-image-pipeline-and-async-chat`.

```bash
git revert <phase-2-commit>
```

**Reverting lands on a working pipeline, not on the broken one.** That is the whole reason
`.github/workflows/nina-image.yml` and `scripts/nina-image-worker.ts` were demoted rather than
deleted, and the reason phase 1 comes first: the revert restores `lib/nina/imagedispatch.ts`, the
`GITHUB_DISPATCH_TOKEN` member of `ninaSchema`, and the two call sites in `selfiegen.ts` /
`avatargen.ts` — on top of a worker whose three measured defects are already fixed.

Two things the revert does not undo, and neither is harmful:

- **Rows already written.** Jobs this phase completed are `status = 'ok'` with real
  `cost_micro_usd`; jobs it left `running` are reclaimed by the restored worker's `claimJob` after
  `NINA_IMAGE_RECLAIM_MS`, or closed by the give-up sweep at `NINA_IMAGE_STALE_MS`. Nothing is
  stranded in a shape the old code cannot read — this phase added no column, no `args` field and no
  new `error_code` value.
- **`GITHUB_DISPATCH_TOKEN` in the Vercel project.** If it was removed from the environment after
  Step 6, put it back before deploying the revert; otherwise `ninaEnv()` throws and
  `dispatchNinaImageJob` returns `leaveForBackstop`, which degrades to the (slow, measured-in-hours)
  schedule rather than failing. Restore it with `vercel env add GITHUB_DISPATCH_TOKEN production`.

Partial rollback, if only the *host* is wrong and the rest is wanted: keep everything and change
Step 5's two lines back to `fireNinaImageDispatch`, keeping `lib/nina/imagedispatch.ts`. That is a
two-line revert and it is why those two call sites are the only place the host is named.
