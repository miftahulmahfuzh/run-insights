# Phase 12: Image generation, capped and honest

> ## ⚠ RECONCILIATION — binding rulings not yet folded into the body of this plan
>
> `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` is **normative** and outranks anything
> below it. Relevant here:
>
> - **C1/C2 — `nina_turns.args jsonb` and `NinaTurnStatus += 'pending'`** are folded into phase 1.
>   `args` is load-bearing: the repo is **public**, so a `workflow_dispatch` input is world-readable
>   and the prompt must travel in the database with only an opaque job id in the dispatch.
> - **C4 — `GITHUB_DISPATCH_TOKEN` goes in `ninaEnv()`** (phase 1 owns `lib/env.ts`).
> - **C6 — `productionDeps()` gains `export`** in phase 3's `lib/nina/turn.ts`.
> - **G3 — the `Promise.all` in `app/nina/page.tsx` does not exist yet.** Phase 4's page awaits
>   sequentially, so this plan **creates** it rather than joining one.
> - **D2 — this plan adds no route handler**, so the roadmap's sanctioned count is five (phase 10's
>   cron), not six.
> - **A6 — `NINA_BLOB_PREFIX` has exactly one definition.**


**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R18 (she generates her own photographs, as a tool she chooses) · R22 (a failed
generation is announced by her, in chat, non-technically, and the runner never waits forever)
**Depends on:** Phase 1 (schema, `lib/nina/queries.ts`, `nina_turns.args`, `OPENROUTER_API_KEY` +
`GITHUB_DISPATCH_TOKEN` in `lib/env.ts`, the narrowed OpenRouter guard), Phase 2
(`NINA_APPEARANCE`, `GENERATE_IMAGE_TOOL`), Phase 3 (`extendToolSet`, `NinaToolHandler`,
`lib/nina/actions.ts`), Phase 4 (`app/nina/page.tsx`), Phase 6 (the chat renderer for
`nina_message_images`)
**Difficulty:** HARD
**Package:** `lib/nina`, `scripts`, `.github/workflows`

---

## THIS IS THE SECOND DRAFT. READ THIS SECTION FIRST.

The first draft was written before two measurements and two decisions landed. All four are settled
and recorded in the index's Rulings table as **RU-18** through **RU-21**. None is re-litigated here.
If you have read the old plan, these are the deltas.

### RU-18 — the face anchor is dropped

The user, verbatim, after seeing the latency numbers:

> dont worry about her face being the same or not. after thinking about it, i think we should just
> save this requirement (keeping the same face) for future implementations. i only want successful
> image generation. user ask 'coba kirim foto lu lari tadi na', will succesfully result in nina
> generated an image. that's all

So the request sends **no `input_references`**, and everything the old draft built to carry one is
gone:

- **Deleted from the design:** `resolveAnchor`, `productionAnchor`, `NinaImageDeps.anchor`,
  `NINA_ANCHOR_FETCH_TIMEOUT_MS`, the `getCurrentNinaAvatar` import, the "an unreadable anchor is
  transport" branch and its test, the "look at the face" verification step, and the old Risk 4
  ("two anchors could drift" — there is now one anchor and nothing reads it).
- **`getCurrentNinaAvatar()`-as-runtime-anchor is not a design any more.** The old draft argued at
  length that the *row*, not `assets/nina/_anchor.png`, should be the runtime anchor. That whole
  argument is void. Phase 12 reads neither.
- **R20 leaves this phase's `satisfies` list entirely.** It keeps only "`nina.png` is her initial
  avatar", which phase 1 already owns. `assets/nina/_anchor.png` is still committed by phase 1 as
  the seed for a future consistent-face feature; **phase 12 never opens it.**
- **Phase 15's handoff to this phase — "move the generation anchor into Blob so both the CLI and
  the page can re-anchor" — is resolved by deletion.** There is no generation anchor. The
  reconciler should strike that handoff rather than try to honour it.
- **Phase 14's RU-16 ("`/update-nina-profpic` always re-anchors") now has no consumer.** Replacing
  `assets/nina/_anchor.png` is still harmless and still seeds the future feature, but no runtime
  code path reads the result. Flagged for the reconciler; **this phase does not edit phase 14.**

The measured consolation: dropping the anchor nearly halves the call, and **the output quality is
verified good** — the index records the unanchored probe returning a convincing phone mirror-selfie
of a young Indonesian woman in running clothes, with an invented `JL. KEMANG SELATAN` sign and a cat
on the wall. That is R18's bar as RU-18 restates it, met with no reference image.

### RU-19 — generation runs outside Vercel

| Path | Latency | Cost | Fits Hobby (60 s) |
|---|---|---|---|
| anchored (`input_references`) | 148.9 s | $0.043 | **NO** |
| **unanchored (ships)** | **78.2 s** | **$0.040** | **NO** |

Even unanchored it is 30 % over the ceiling, so the old draft's central structure — a Vercel route
handler that *calls OpenRouter* in a second 60 s invocation — is wrong, and this draft replaces it.
Every threshold the old draft chose (`NINA_IMAGE_CALL_TIMEOUT_MS = 48_000`,
`NINA_IMAGE_JOB_DEADLINE_MS = 55_000`, `NINA_IMAGE_STALE_MS = 120_000`) was sized against a ceiling
this phase no longer races, and all three are re-derived in Step 3.

### RU-20 — the worker is GitHub Actions, triggered by `workflow_dispatch`

Decided, not open. The reasoning, restated so nobody re-derives it and nobody re-proposes the
alternatives:

- **No new service, no monthly bill, nothing to keep alive.** `.github/workflows/ci.yml` already
  exists; repo secrets are already a secret store; the repo is public, so Actions minutes are
  unmetered.
- **A 78.2 s job fits a 6-hour job ceiling with absurd headroom.** The constraint that killed
  Vercel does not exist here, which means the thresholds can be generous instead of desperate.
- **It is unattended.** RU-21 forbids a mechanism that needs the user present, which rules out
  running the worker on his laptop as the *shipping* path (it stays available as a manual runner,
  Step 9).
- **QStash and Inngest both lose on one technicality, and it is worth writing down: they call
  BACK into a Vercel function.** Both are HTTP-callback queues — the thing they invoke is a
  serverless function with a 60 s ceiling, which is exactly the ceiling being escaped. Inngest's
  step model cannot help either: a single 78 s `fetch` to `/images/generations` is not divisible
  into steps, and each step runs in *our* function, not on theirs. **Do not propose either of
  these later.**
- **A Fly/Railway worker is a container to maintain for six images a day.** It would win on
  latency (no dispatch queue) and lose on operational burden and on a monthly bill; the index's
  constraint is that a thing needing babysitting is worse than a thing costing $2, and this is a
  thing needing babysitting *and* costing $2.
- **It is idiomatic here.** `scripts/blob-reap.mjs`, `scripts/backfill-record-keys.mjs` and
  `scripts/backfill-badge-run-ids.mjs` are already Node scripts that read and write production
  directly. A workflow running one is the same act with a different trigger.
- **Budget:** the daily cap of 6 is ~180 generations/month at ~2 min a run ≈ 360 minutes, against
  GitHub Free's 2,000 minutes *if the repo were private*. It is public, so the meter does not run
  at all. The backstop schedule (Step 9) is what actually consumes minutes, and its interval is
  chosen with the private-repo number in mind so that going private later is a one-line change.

### RU-21 — no human in the loop, in design or implementation

> i dont need to choose the real candidates myself. you must do everything. just choose one for me.
> make sure no human in the loop exist during design nor implementation

**This plan therefore has no Open Questions section, and there is no sentence anywhere in it that
asks the user to decide something.** Where a fact was genuinely uncertain it was decided here, the
reversible option was taken, and §Risks records what would change the answer.

The one thing a human must physically do is create credentials in someone else's web UI. That is
setup, not a decision, and it is a single numbered checklist at the end of this file
(§Setup — the one list to hand him). Implementation runs that list once and never asks again.

### What survived the rewrite, largely or wholly intact

- **`lib/nina/imagefail.ts`** — the entire R22 apology layer: the failure taxonomy,
  `classifyImageFailure`, `NINA_IMAGE_APOLOGIES`, `ninaImageApology`, `ninaImageCaption`,
  `NINA_IMAGE_CAPPED_NOTE`. Unchanged, and now **shared with the worker** (see Step 1).
- **The job-row lifecycle over `nina_turns`** — open / claim / finish / fail, plus the stale sweep.
  Same shape, re-tuned thresholds, one new phase name (`dispatched`) and a bounded retry.
- **The daily cap** via `countNinaTurnsSince` and `jakartaDayStart`, and the cost logging — with
  the index's correction applied: `usage.cost` **is** reported ($0.040 measured), so the real value
  is logged and `NINA_IMAGE_COST_MICRO_USD` is only a fallback.
- **`generateNinaAvatar`** as the one entry point phases 13/14/15 call. Same name, same request
  type; its *result* is now an acceptance rather than a finished avatar, which is the one
  cross-phase break in this rewrite and is flagged for the reconciler in the Interface Contract.
- **Two of the three `gen_badge_art.py` facts** (the third was the anchor):
  `/images/generations` is the endpoint — not `/images/edits`, not chat-completions with
  `modalities`; `resolution` + `aspect_ratio` and **never** `size`; and `seed` is honoured.
- **`NINA_CHAT_TOOL_SET = extendToolSet(NINA_CORE_TOOL_SET, [GENERATE_IMAGE_TOOL])`** — phase 3
  built that seam and it is still the right way in.
- **The deliberate inversion of `narrate.ts`**, below, word for word.

---

## Goal

After this phase Nina can take a photograph of herself and send it. `generate_image` becomes a tool
she actually dispatches: it does not block her reply, it writes a **job row** on `nina_turns`
carrying the finished prompt, and it fires a `workflow_dispatch` at GitHub. A runner then wakes,
claims the job, spends 78 seconds inside `qwen/qwen-image-3-pro`, puts the PNG in Vercel Blob and
writes the photograph into the conversation as an ordinary message. The job is capped at six a day,
retried at most twice, and closed — **always** — either by a photograph or by an apology in her own
register. There is no spinner that can outlive it, and no path where the runner waits on nothing.

This phase also defines the single avatar-generation entry point that phases 13, 14 and 15 call,
because a generated *avatar* is a different product from a chat *selfie*: it feeds `nina_avatars`,
it needs a `description`, and it must write nothing at all when the generation fails, so phase 10's
`avatar_changed` announcement cannot fire on a photograph that does not exist.

### The deliberate inversion — read this before "fixing" it

`lib/llm/narrate.ts`'s contract is that **"the only safe fallback for prose is the absence of
prose"**, because a canned coaching platitude would fake a fact the app never computed. That rule is
right there and **wrong here**, and this phase inverts it on purpose.

The runner asked a friend for a photo. A friend who goes quiet **is** the failure. So when a
generation fails, this phase writes a canned, hand-authored line in her voice — *"sori, kamera gw
ngadat"* — and that canned line is the correct output, not a fallback we tolerate. It fakes no
fact: it reports the one thing that actually happened, which is that no photo exists.

Nobody may "restore consistency" with `narrate.ts` by deleting the apology. If a future reader wants
the two rules to agree, the sentence that reconciles them is: *a fallback may never assert a
measurement, and it must always close a promise.* Prose about his training is a measurement. "I could
not take the picture" is a promise being closed.

**RU-19 and RU-20 make this more important, not less.** With the generator off-platform there are
now more ways for nothing to happen: the dispatch API can refuse or the PAT can expire; the runner
can be queued behind an Actions incident; `schedule:` can be throttled or skipped outright, which
GitHub does on low-activity repos; the worker can be rate-limited by OpenRouter; the runner can be
killed mid-call by `timeout-minutes`. Every one of those must still end in Nina saying something
human. **The two sweeps in Step 3 and Step 9 are what guarantee it for the cases where no code of
ours ever ran, and they are the most load-bearing thing in the phase.**

---

## The mechanism, in one picture

```
  chat turn (Vercel Server Action, ≤45 s)
    │
    │  handleGenerateImage:  cap check → openNinaImageJob(args) → after(dispatch)
    │                        returns in ~10 ms; her reply goes out immediately
    ├──────────────────────────────────────────────► nina_turns
    │                                                 status='pending' error_code='queued'
    │                                                 args={purpose,scene,mood,prompt,seed,…}
    │  after():  POST api.github.com/…/dispatches      ─┐
    ▼            {ref:'main', inputs:{job_id}}          │   (≤8 s, fire-and-forget)
  "bentar, gw fotoin dulu"                              │
                                                        ▼
                          ┌──────────── GitHub Actions: .github/workflows/nina-image.yml ────────┐
                          │  workflow_dispatch  (immediate, the normal path)                     │
                          │  schedule: */10     (backstop, catches a lost dispatch)              │
                          │                                                                      │
                          │  node --experimental-strip-types scripts/nina-image-worker.ts        │
                          │    1. preflight: env + information_schema column check               │
                          │    2. claim   : UPDATE … WHERE status='pending' RETURNING args       │
                          │    3. generate: POST openrouter /images/generations   (78 s)         │
                          │    4. store   : put() → nina/<userId>/selfie-<id>.png                │
                          │    5. close   : nina_messages + nina_message_images, status='ok'     │
                          │       or fail : nina_messages(apology),               status='failed' │
                          └──────────────────────────────────────────────────────────────────────┘
                                                        │
  /nina page load  ──► listOpenNinaImageJobs ──► sweepStaleNinaImageJobs (20 min give-up)
                                                        │
                                                        ▼
                                            a photograph, or an apology
```

**Two triggers, one worker, three sweeps, and they cover disjoint failures.** This is the
reliability argument, and it is the reason this mechanism is strictly better than a queue that
calls back into Vercel:

| Failure | What closes it |
|---|---|
| The generation is slow (78 s, or 240 s on a bad day) | the worker itself — it has hours, not seconds |
| OpenRouter refuses, or the socket dies | the worker writes `failed` + the apology, in the same run |
| The `workflow_dispatch` call never leaves Vercel, or GitHub 4xxs it | `failNinaImageJob` inline, immediately, with an apology (Step 6) |
| The dispatch succeeded but no runner ever ran it | the **`schedule:` backstop**, ≤10 min later, which *retries the generation* rather than giving up |
| The runner was killed mid-call (`timeout-minutes`) | the backstop's reclaim of a stale `running` row, once |
| Actions itself is dead, disabled, or the PAT is revoked | the **on-read sweep** in `listOpenNinaImageJobs`, at 20 min, which gives up and apologises |

The middle row is the one a QStash/Inngest design cannot have without a third Vercel cron, and
**Hobby caps crons at two — phase 10 spent the second on `/api/cron/nina`.** The backstop schedule
is that missing cron, hosted somewhere with no cron limit. That is not a workaround; it is the
single best property of this choice.

### Why keep the on-read sweep as well as the scheduled one

They are not redundant, and the plan brief's question ("keep whichever is cheaper") has a real
answer: **keep both, because they do different things at different thresholds.**

- The **scheduled backstop** *retries*. It exists because a lost dispatch should still produce a
  photograph, and it is the only thing that can. It cannot be relied on for punctuality: GitHub
  documents `schedule:` as best-effort, delays it during peak load, and **disables it entirely on a
  repository with no activity for 60 days.** So it is a good retry engine and a bad deadline.
- The **on-read sweep** *gives up*. It is two indexed statements on a page the runner is already
  loading, so its marginal cost is nothing, and it is the only mechanism that keeps working when
  GitHub does not. Arriving on `/nina` to look for the photo is what makes the apology appear.

Cheaper is therefore the wrong axis: one costs Actions minutes and buys retries, the other costs
two SQL statements and buys the R22 guarantee. Deleting the on-read sweep would make R22 depend on a
third party's uptime, which is exactly the mistake this section exists to avoid.

### What runs where, and why the split is where it is

The worker is **not** a second implementation of this phase. It is the same modules, executed on a
different host, because of one verified fact about this repo:

> `scripts/backfill-record-keys.mjs:85` — `import { RECORD_CATALOG } from '../lib/records/catalog.ts'`
> — run as `node --experimental-strip-types --no-warnings scripts/backfill-record-keys.mjs`
> (`package.json:30`). Its own header records why it is allowed to: *"every one of its imports is
> `import type`, so stripping the types leaves a module with no runtime dependency and no `@/` alias
> for node to resolve."*

So a `.ts` module in `lib/` with **no runtime imports** is importable from a script by relative
path. This phase deliberately puts everything the worker needs into two such modules:

| Module | Runtime imports | Imported by |
|---|---|---|
| `lib/nina/imagefail.ts` | **none** | app + worker |
| `lib/nina/imagerecipe.ts` | **none** | app + worker |
| `lib/nina/imagegen.ts` | `@/lib/nina/persona` | app only (prompt assembly) |
| `lib/nina/imagejobs.ts` | `server-only`, `@/lib/db`, … | app only |

**Consequence: R22's copy, the failure classifier, the OpenRouter payload shape, the blob pathname
convention, the cap and every threshold have exactly one definition each, unit-tested once, and the
worker executes those definitions rather than a paraphrase of them.** The only thing the worker
genuinely re-implements is the *SQL* — `lib/nina/queries.ts` imports `server-only` and `@/lib/db`
and cannot be stripped — and that is handled by the preflight column check in Step 9 and named as
Risk 1. `scripts/*.mjs` **cannot import `lib/env.ts`** (it is `server-only` and alias-imported);
phase 14's plan hit the same wall. The worker reads `process.env` directly, as every other script
in `scripts/` does.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Exact and exhaustive.

**Deletes:** nothing that exists today. **Relative to the first draft of this plan** (which the
reconciler may have read): `app/api/nina/image/route.ts` is **not created** — the sixth route
handler is withdrawn and D7's count stays at five; `generateNinaImage`, `NinaImageDeps`,
`productionImageDeps`, `resolveAnchor`, `productionAnchor`, `originUrl`,
`NINA_IMAGE_CALL_TIMEOUT_MS`, `NINA_ANCHOR_FETCH_TIMEOUT_MS`, `NINA_IMAGE_JOB_DEADLINE_MS`,
`claimNinaImageJob`, `finishNinaImageJobOk`, `jobRunnerUrl`, `fireImageJob`,
`JOB_FIRE_TIMEOUT_MS`, `NINA_IMAGE_JOB_PATH` and `components/nina/NinaImageJobWatcher.tsx` are all
withdrawn with it.

**Renames:** nothing.

**Creates — `lib/nina/imagefail.ts`** (pure; **no imports at all**, so the worker can import it by
relative path under `--experimental-strip-types`; carried over from the first draft unchanged):

- `NINA_IMAGE_FAILURES` and `type NinaImageFailure = 'timeout' | 'policy' | 'transport' | 'stale'`
- `classifyImageFailure(input: { httpStatus?, aborted?, body?, cause? }): NinaImageFailure`
- `NINA_IMAGE_APOLOGIES: Record<NinaImageFailure, readonly string[]>`
- `NINA_IMAGE_CAPPED_NOTE: string` (told to the *model*, never shown to the runner)
- `NINA_IMAGE_CAPTIONS: readonly string[]`
- `pickLine(lines, key)`, `ninaImageApology(kind, jobId)`, `ninaImageCaption(jobId)`
- `POLICY_BODY_RE`, `POLICY_STATUSES`

**Creates — `lib/nina/imagerecipe.ts`** (pure; **no imports at all**, same reason). Everything both
hosts must agree on:

- `NINA_IMAGE_MODEL = 'qwen/qwen-image-3-pro'`
- `OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations'`
- `NINA_IMAGE_RESOLUTION = '1K'`, `NINA_IMAGE_ASPECT = '3:4'`,
  `NINA_IMAGE_WIDTH = 768`, `NINA_IMAGE_HEIGHT = 1024`
- `NINA_IMAGE_CONTENT_TYPE = 'image/png'`, `NINA_IMAGE_CACHE_MAX_AGE = 31_536_000`
- `NINA_BLOB_PREFIX = 'nina/'`, `NINA_IMAGE_PATHNAME_RE`,
  `ninaImagePathname(userId, purpose, id)`
- `type NinaImagePurpose = 'selfie' | 'avatar'`
- `NINA_IMAGE_COST_MICRO_USD = 40_000` (**fallback only**; `usage.cost` is authoritative)
- `NINA_IMAGE_DAILY_CAP = 6`, `SEED_MAX = 2_147_483_647`
- `NINA_WORKER_CALL_TIMEOUT_MS = 240_000`, `NINA_WORKER_TIMEOUT_MINUTES = 6`,
  `NINA_IMAGE_DISPATCH_TIMEOUT_MS = 8_000`, `NINA_IMAGE_DISPATCH_GRACE_MS = 60_000`,
  `NINA_IMAGE_RECLAIM_MS = 420_000`, `NINA_IMAGE_STALE_MS = 1_200_000`,
  `NINA_IMAGE_MAX_ATTEMPTS = 2`, `NINA_IMAGE_SWEEP_BUDGET = 3`
- `buildImageRequestBody({ prompt, seed }): Record<string, unknown>` — **the payload, in one
  place**; the two surviving ported facts are asserted against this function in the tests
- `readReportedCostMicroUsd(usage: unknown): number | null`
- `type NinaImageJobPhase = 'queued' | 'dispatched' | 'running'`
- `type NinaImageJobArgs` — the `nina_turns.args` shape, below
- `jakartaDayStart(now?: Date): Date`

**Creates — `lib/nina/imagegen.ts`** (app-side prompt assembly; imports `NINA_APPEARANCE`):

- `NINA_SELFIE_STYLE`, `NINA_AVATAR_STYLE`
- `buildNinaImagePrompt({ purpose, scene, mood? }): string`
- `sidecarText({ prompt, seed, purpose }): string`

**Creates — `lib/nina/imagejobs.ts`** (`server-only`; the app's half of the job lifecycle):

- `openNinaImageJob(userId, args: NinaImageJobArgs): Promise<string>`
- `markNinaImageJobDispatched(userId, jobId): Promise<boolean>` (the conditional claim)
- `failNinaImageJob({ userId, jobId, kind, latencyMs?, replyToId?, detail? }): Promise<void>`
- `postNinaApologyMessage({ userId, jobId, kind, replyToId })`
- `ninaImageQuotaLeft(userId, now?): Promise<number>`
- `listOpenNinaImageJobs(userId): Promise<NinaImageJobRow[]>` (sweeps first, then reads)
- `sweepStaleNinaImageJobs(userId, now?): Promise<number>`
- `getNinaImageJob(userId, jobId): Promise<NinaImageJobRow | null>`
- `type NinaImageJobRow = { id, phase, purpose, attempts, createdAt }`

**Creates — `lib/nina/imagedispatch.ts`** (`server-only`; the GitHub half):

- `NINA_WORKER_REPO = 'miftahulmahfuzh/run-insights'`,
  `NINA_WORKER_WORKFLOW = 'nina-image.yml'`, `NINA_WORKER_REF = 'main'`
- `githubDispatchUrl(): string`
- `dispatchNinaImageJob(userId, jobId): Promise<{ ok: true } | { ok: false; detail: string }>`
- `fireNinaImageDispatch(userId, jobId, replyToId): void` (wraps the above in `after()`, and
  fails the job with an apology if the dispatch is refused)

**Creates — `lib/nina/avatargen.ts`** (`server-only`; **the one entry point phases 13, 14 and 15
call**):

- `type NinaAvatarRequest = { userId, scene, mood?, source: 'generated' | 'admin' }`
- `type NinaAvatarResult = { ok: true; jobId: string; state: 'dispatched' } | { ok: false; jobId: string | null; kind: NinaImageFailure | 'capped' }`
- `generateNinaAvatar(request): Promise<NinaAvatarResult>`

**Creates — `lib/nina/imagetools.ts`** (`server-only`):

- `handleGenerateImage: NinaToolHandler`
- `NINA_CHAT_TOOL_SET: NinaToolSet` = `extendToolSet(NINA_CORE_TOOL_SET, [{ tool: GENERATE_IMAGE_TOOL, handler: handleGenerateImage }])`

**Creates — `scripts/nina-image-worker.ts`:** the worker. Run as
`node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts [--job <id>] [--dry-run]`.
Exports `parseArgv`, `preflight`, `runOneJob` and `main`; `main()` runs only when the file is the
process entry point, so the tests can import it.

**Creates — `.github/workflows/nina-image.yml`:** `workflow_dispatch` (input `job_id`, opaque and
the only input) plus `schedule: '*/10 * * * *'`, `timeout-minutes: 6`, `permissions: contents: read`,
and `concurrency: nina-image` with `cancel-in-progress: false`. It installs with
`npm ci --omit=dev --ignore-scripts` — the worker needs only `@neondatabase/serverless` and
`@vercel/blob`, both runtime dependencies, and omitting dev dependencies also sidesteps the
EBADPLATFORM trap `ci.yml` documents at length (Step 9b).

**Creates — `package.json` scripts:** `nina:worker` and `nina:worker:dry`.

**Creates — tests:** `tests/nina.imagefail.test.ts`, `tests/nina.imagerecipe.test.ts`,
`tests/nina.imageworker.test.ts`.

**Modifies:**

- `lib/nina/actions.ts` (phase 3) — **one call site**: `runNinaTurn(input)` becomes
  `runNinaTurn(input, { ...productionDeps(), toolSet: NINA_CHAT_TOOL_SET })`, plus two imports.
- `lib/nina/turn.ts` (phase 3) — **one keyword**: `productionDeps` gains `export`.
- `app/nina/page.tsx` (phase 4) — **one added await**: `listOpenNinaImageJobs(userId)` in the
  existing `Promise.all`, for its sweep side-effect. **No new component and no new prop** — the
  first draft's `NinaImageJobWatcher` is withdrawn (see Step 10).
- `package.json` — two script entries.

**Signature changes:** none to any existing symbol.

### Requires (from earlier phases)

Each is named so the reconciler can push it into the owning plan rather than leaving implementation
to discover it.

1. **Phase 1 — `NinaTurnStatus` must include `'pending'`**, i.e.
   `'pending' | 'ok' | 'repaired' | 'failed'`. One word in a union in `lib/db/schema.ts:389`; the
   column is plain `text` with `.$type<NinaTurnStatus>()`, so **there is no migration change**. A
   job opened but not finished is genuinely pending, and calling it `'failed'` until proven
   otherwise would poison every "how often does she fail" reading of that table forever.
   *Fallback if refused:* write `status:'failed', error_code:'queued'` at open time and treat that
   pair as pending. Strictly worse; recorded only so the phase is never blocked.
2. **Phase 1 — `nina_turns` gains `args jsonb` (nullable).** **This is a migration ask and it is
   new in this draft.** The first draft deliberately declined it and carried the job's arguments in
   a fan-out request body instead; RU-20 removes that option, because:
   - the **backstop schedule** wakes with no arguments at all — its whole purpose is to find work
     it was never told about — so the prompt must be *in the row* or the retry cannot exist;
   - the repo is **public**, so a `workflow_dispatch` input is world-readable in the run log.
     Putting the scene prose and the userId there would publish them. With `args` in the database
     the only input is an opaque `job_id`.
   It also fixes the first draft's own Risk 2 ("a lost request costs a photograph"). Shape:
   ```ts
   type NinaImageJobArgs = {
     purpose: 'selfie' | 'avatar'
     scene: string
     mood: string | null
     prompt: string        // fully assembled on Vercel; the worker never builds one
     seed: number
     replyToId: string | null
     source: 'chat' | 'generated' | 'admin'
     attempts: number      // bounded by NINA_IMAGE_MAX_ATTEMPTS
     sidecar: string
   }
   ```
   *Fallback if refused:* pack the same object into the `workflow_dispatch` input. It works, it
   publishes the prompt in a public log, and **it makes the backstop retry impossible**, which
   costs the reliability row that justifies this whole mechanism. Take the column.
3. **Phase 1 — `nina_turns.error_code` is ours, free text.** This phase stores the job **phase**
   there while `status='pending'` (`'queued'`, `'dispatched'`, `'running'`) and the failure
   **reason** there when `status='failed'` (`'timeout' | 'policy' | 'transport' | 'stale'`). Phase
   1's comment already says "Free text, ours not the provider's. NULL on success"; one sentence
   should be added naming the pending-phase use.
4. **Phase 1 — `insertNinaTurn(userId, input)` must accept `status:'pending'` and an `args`
   value**, and return the id (it already returns the id).
5. **Phase 1 — `countNinaTurnsSince(userId, kind, since)`**, counting failed rows too. Its
   docstring already names this phase's cap as the reason it exists.
6. **Phase 1 — `insertNinaAvatarAsCurrent(userId, input)`** and `NinaAvatarInsert.description`,
   consumed unchanged. **The worker does not call it** (it cannot import `server-only`); it
   re-implements the same two statements in one `sql.transaction`, and Risk 1 covers the
   duplication.
7. **Phase 1 — `lib/env.ts` gains `GITHUB_DISPATCH_TOKEN`** to `ninaEnv()`, alongside
   `OPENROUTER_API_KEY`, and `.env.example` gains a commented line for it. **It must go through
   `lib/env.ts` and never `process.env` directly in `app/`, `lib/` or `components/`, and it must
   never be `NEXT_PUBLIC_` anything (invariant 10).** The repo coordinates are **not** env vars —
   they are facts about this repository and live as module constants in `lib/nina/imagedispatch.ts`,
   so a deploy cannot be misconfigured into dispatching at someone else's repo.
8. **Phase 1 — `check-openrouter-boundary.mjs` exempting `EXEMPT_PATHS = ['lib/nina/', 'lib/env.ts']`.**
   **This phase names `OPENROUTER_API_KEY` in exactly one place — `scripts/nina-image-worker.ts` —
   and `scripts/` is not in the guard's `DIRS`.** Confirm that when phase 1 narrows the boundary; if
   the guard's `DIRS` ever grows to include `scripts/`, `scripts/nina-image-worker.ts` needs a
   third exemption and `scripts/vercel-env-push.sh` probably already does.
9. **Phase 2 — `NINA_APPEARANCE`** from `lib/nina/persona.ts`, and **`GENERATE_IMAGE_TOOL`** from
   `lib/nina/prompts/tools.ts` with input schema `{ scene: string (required), mood?: string }`.
   Consumed verbatim; neither is edited.
10. **Phase 3 — `extendToolSet`, `NINA_CORE_TOOL_SET`, `NinaToolSet`, `NinaToolHandler`,
    `NinaToolContext`, `NinaToolAnswer`** from `lib/nina/tools.ts`, consumed exactly as its header
    advertises. **`lib/nina/tools.ts` and `lib/nina/turn.ts`'s bodies are not edited.**
11. **Phase 3 — `productionDeps()` in `lib/nina/turn.ts` must be exported.** One word
    (`function` → `export function`), the same class of edit phase 3 itself asked of phase 2. It is
    the only way `lib/nina/actions.ts` can pass `toolSet: NINA_CHAT_TOOL_SET` without this phase
    reaching into `turn.ts`'s body.
12. **Phase 4 — `app/nina/page.tsx`** is a Server Component awaiting `requireUserId()` and
    `listNinaMessages`. This phase adds one more concurrent await (indexed reads plus a handful of
    UPDATEs, no model call, so invariant 4 holds).
13. **Phase 6 — the chat renderer for `nina_message_images`.** Phase 6 owns `MessageBubble`'s image
    slot and must render both `kind='upload'` and `kind='generated'`. **6 is now in this phase's
    `depends_on`**, as the first draft asked; without it the row and the blob are correct and
    nothing draws them.

### Provides (to later phases) — read these as fixed

- **Phase 13** gets **`generateNinaAvatar(request)`**. ⚠ **BREAKING RELATIVE TO THE FIRST DRAFT,
  and the reconciler must propagate it:** the first draft's `generateNinaAvatar` *awaited* the
  generation and returned `{ ok: true, avatar: NinaAvatarRow }`. RU-19 makes that impossible — a
  78 s call cannot be awaited inside phase 10's cron invocation or a phase 15 Server Action. It now
  returns **`{ ok: true, jobId, state: 'dispatched' }`**, meaning *accepted*, and the avatar row
  appears when the worker finishes, 1–3 minutes later, with `announced_at: null`.
  **The consequence is good for phase 13 and not merely tolerable:** phase 10's `avatar_changed`
  trigger already fires on `announced_at IS NULL` at the next cron tick, so the announcement path
  needs no change whatsoever. What phase 13's promise evaluator must change is that it may not read
  the new avatar back in the same invocation. `getNinaImageJob(userId, jobId)` is provided for
  polling, and `listOpenNinaImageJobs(userId)` reports what is in flight.
  On failure `generateNinaAvatar` still writes **nothing at all** — no avatar row, no announcement,
  no chat message — and `ninaImageApology(kind, jobId)` is available to whoever decides the runner
  was waiting. This phase never posts that message for an avatar job, and **the sweeps do not
  either**: they read `args.purpose` and stay silent for `'avatar'`.
- **Phase 13** also gets **`extendToolSet(NINA_CHAT_TOOL_SET, [{ tool: SET_AVATAR_TOOL, handler }])`**.
  **Extend mine, not the core set** — otherwise both phases edit the same line of
  `lib/nina/actions.ts` and one of the two tools silently disappears.
- **Phase 14** gets the blob convention from `lib/nina/imagerecipe.ts`: `NINA_BLOB_PREFIX = 'nina/'`,
  `ninaImagePathname(userId, purpose, id)` = `` `nina/${userId}/${purpose}-${id}.png` `` and
  `NINA_IMAGE_PATHNAME_RE = /^nina\/[0-9A-Za-z_-]{1,64}\/(selfie|avatar)-[0-9A-Za-z_-]{12}\.(png|jpg)$/`.
  Phase 14's script writes `nina/<userId>/avatar-<nanoid12>.jpg` — that already matches, and the
  regex admits `.jpg` for exactly that reason. **`imagerecipe.ts` has no runtime imports, so phase
  14's `.mjs` script can import it by relative path under `--experimental-strip-types`** rather
  than re-deriving the convention.
- **Phase 15** gets `generateNinaAvatar` with `source: 'admin'`, the same acceptance semantics, the
  same "writes nothing on failure" guarantee, and `getNinaImageJob` to poll with.
- **Anyone** gets `ninaImageQuotaLeft(userId)` for a "she has taken her photos for today" read.

**Leaves alone (owned by others):** `lib/nina/tools.ts`, `lib/nina/turn.ts`'s body,
`lib/nina/schema.ts` (Phase 3) · `lib/nina/persona.ts`, `lib/nina/prompts/*` (Phase 2) ·
`lib/db/schema.ts`, `lib/nina/queries.ts`, `lib/env.ts`, `scripts/check-openrouter-boundary.mjs`
(Phase 1) · `lib/nina/vision.ts` and the `glm-4.6v` pre-pass (Phase 6) ·
`components/nina/*` (Phase 4, and Phase 6 fills the image slot) · avatar replacement, the album,
`app/nina/about`, the promise evaluator, `SET_AVATAR_TOOL`'s handler (Phase 13) ·
`scripts/nina-profpic.mjs` and `assets/nina/_anchor.png` (Phase 14) · `app/admin/*` (Phase 15) ·
`app/api/cron/nina/route.ts`, `lib/nina/proactive.ts` (Phase 10) · `.github/workflows/ci.yml`
(**this phase adds a second workflow file and does not touch the first**) ·
`tools/gen_badge_art.py`, `tools/decks.py`, `.claude/skills/generate-badge/*` — **read as the
reference implementation, not modified.**

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagefail.ts` | create | pure, zero imports: the failure taxonomy, the classifier, and R22's copy |
| `lib/nina/imagerecipe.ts` | create | pure, zero imports: the payload, the pathname, the cap, every threshold |
| `lib/nina/imagegen.ts` | create | app-side prompt assembly (`NINA_APPEARANCE` + style + scene) |
| `lib/nina/imagejobs.ts` | create | the app's half of the lifecycle: open, dispatch-claim, fail, sweep, read |
| `lib/nina/imagedispatch.ts` | create | the `workflow_dispatch` call and its `after()` wrapper |
| `lib/nina/avatargen.ts` | create | `generateNinaAvatar` — the entry point 13/14/15 call |
| `lib/nina/imagetools.ts` | create | `handleGenerateImage`, `NINA_CHAT_TOOL_SET` |
| `scripts/nina-image-worker.ts` | create | the worker: preflight, claim, generate, store, close |
| `.github/workflows/nina-image.yml` | create | `workflow_dispatch` + the `*/10` backstop schedule |
| `package.json` | modify | `"nina:worker"` and `"nina:worker:dry"` in `scripts` (after line 34) |
| `lib/nina/actions.ts` | modify | the one `runNinaTurn(...)` call gains `toolSet` (phase 3's Step 7, "STEP 3 — the turn") |
| `lib/nina/turn.ts` | modify | `productionDeps` gains `export` (phase 3's Step 6, one keyword) |
| `app/nina/page.tsx` | modify | one added await in the existing `Promise.all` (phase 4's `NinaPage` body) |
| `tests/nina.imagefail.test.ts` | create | classification and copy, no network |
| `tests/nina.imagerecipe.test.ts` | create | the payload's two ported facts, the pathname, the threshold inequalities, the Jakarta day |
| `tests/nina.imageworker.test.ts` | create | argv parsing and the worker's outcome classification, no network |

Sixteen files against the index's estimate of ~8, and **one fewer route handler than the first
draft.** The over-run is: two pure modules instead of one, because the worker can only import a
module with no runtime imports and the recipe had to be split out of `imagegen.ts` to qualify; the
dispatch split from the job lifecycle, because one is an HTTP call to GitHub and the other is SQL;
the separate avatar entry point, which the phase brief requires; and the worker plus its workflow,
which are the whole of RU-20.

---

## The lifecycle, once, before the code

Read this table before any step. Every column is a real column on `nina_turns`, and the whole of
R22 is the claim that **no row can stay in the top three states**.

| State | `status` | `error_code` | Who writes it | Runner sees |
|---|---|---|---|---|
| queued | `pending` | `queued` | `openNinaImageJob`, inside the chat turn | her own bubble: "bentar, gw fotoin dulu" |
| dispatched | `pending` | `dispatched` | `markNinaImageJobDispatched`, after GitHub returns 204 | the same bubble |
| running | `pending` | `running` | the worker's claim | the same bubble |
| done | `ok` | `NULL` | the worker | a photograph, with a caption |
| failed | `failed` | `timeout` \| `policy` \| `transport` \| `stale` | the worker, `failNinaImageJob`, or a sweep | an apology, in her voice |

**The claim is a conditional UPDATE and that is the only lock in the system.** Two runners racing
one job — a dispatch and a backstop firing within seconds of each other — both execute
`UPDATE nina_turns SET error_code='running' … WHERE status='pending' AND error_code IN
('queued','dispatched') RETURNING args`, and exactly one gets a row back. The loser exits without
spending a cent. This is the same shape `markNinaAvatarAnnounced` uses to be idempotent, and it is
now doing more work than it did in the first draft, because the money is spent on a host we do not
control and the *message write* is the thing that must happen exactly once.

### The threshold arithmetic, derived rather than guessed

Measured input: **78.2 s** for the shipping call, **148.9 s** for the anchored one we are not
making. Every number below is a consequence, and `tests/nina.imagerecipe.test.ts` asserts the whole
chain of inequalities so a future edit cannot break one without failing a test.

| Constant | Value | Derivation |
|---|---|---|
| `NINA_WORKER_CALL_TIMEOUT_MS` | 240 000 | 3× the measured 78.2 s. Generous on purpose: off Vercel there is no ceiling to race, and a timeout that fires on a merely slow day throws away $0.04 and a photograph. |
| `NINA_WORKER_TIMEOUT_MINUTES` | 6 | `timeout-minutes` on the job. Must exceed the call timeout plus checkout, install and the writes: 240 s + ~80 s ≈ 5.3 min. |
| `NINA_IMAGE_DISPATCH_TIMEOUT_MS` | 8 000 | the `api.github.com` POST, inside `after()`. It shares the Server Action's page budget, so it must be short; 8 s is ~20× a normal GitHub API round trip. |
| `NINA_IMAGE_DISPATCH_GRACE_MS` | 60 000 | how long a `dispatched` row is left alone before the backstop treats it as un-started. Covers GitHub's normal queue-and-boot. |
| `NINA_IMAGE_RECLAIM_MS` | 420 000 | 7 min > the 6 min job ceiling, so a `running` row this old **cannot** still be running — the runner that owned it was killed. The backstop re-queues it once. Same reasoning as `STALE_PENDING_MS` for extraction, with the margin scaled to the ceiling. |
| `NINA_IMAGE_MAX_ATTEMPTS` | 2 | one retry. 2 × 7 min = 14 min worst case before the worker itself gives up and apologises, which must stay under the app's give-up. |
| `NINA_IMAGE_STALE_MS` | 1 200 000 | 20 min > 14 min. The app-side give-up, and **the only threshold that fires when GitHub never ran anything at all.** Long, deliberately: apologising at 4 minutes and then delivering the photo at 5 would be worse than a two-minute wait. |
| `NINA_IMAGE_SWEEP_BUDGET` | 3 | jobs one backstop run will drain, so a burst cannot make a single run exceed `timeout-minutes`. 3 × 78 s ≈ 4 min, inside the 6. |
| `NINA_IMAGE_DAILY_CAP` | 6 | **designed, not measured.** At the measured $0.040 that is $0.24/day, ~$7.20/month worst case — the right order for a personal toy whose owner said not to stint but who pays the bill. It counts **failed** generations too, because `countNinaTurnsSince` does: a cap that only counted successes is a cap an unlucky afternoon spends ten times over. |

**Typical happy path, end to end:** dispatch ~0.5 s + GitHub queue and boot 10–40 s + checkout,
Node and `npm ci --omit=dev` (cached) ~30–45 s + generation 78 s + blob put and three writes ~4 s
= **≈ 2 to 2.5 minutes** from "foto lu mana?" to the photograph. Her bubble says she is taking it
now, and two minutes later it lands. That is a friend with a phone, and it is honest.

---

## Implementation Steps

### Step 1: `lib/nina/imagefail.ts` — the taxonomy and the words

**File:** `lib/nina/imagefail.ts` (new)
**Change:** The whole file. **Carried over from the first draft unchanged in substance**; the only
addition is the "no imports, ever" constraint in the header, which is what lets the worker import
it instead of paraphrasing R22's copy in plain JavaScript.

**Code:**

```ts
/**
 * **R22, in two halves: what went wrong, and what she says about it.**
 *
 * ── THIS FILE MUST NEVER IMPORT ANYTHING ──────────────────────────────────────────────────────
 * Not `server-only`, not `@/lib/env`, not a type from another module. `scripts/nina-image-worker.ts`
 * imports it by RELATIVE PATH under `node --experimental-strip-types`, which can strip types but
 * cannot resolve the `@/` alias and cannot tolerate a runtime dependency on the app. The precedent
 * is `scripts/backfill-record-keys.mjs:85` importing `../lib/records/catalog.ts`, and that file's
 * header states the rule. Add one import here and the worker stops booting — with a resolution
 * error at 3am on a schedule, which is the worst possible place to learn it.
 *
 * That constraint is what buys the property this phase most needs: **R22's words have exactly one
 * definition, and both hosts say the same sentences.** A second copy of these strings in the worker
 * would drift, and the drift would be invisible until the day she apologised twice differently.
 *
 * ── THE DELIBERATE INVERSION OF `narrate.ts` ──────────────────────────────────────────────────
 * `lib/llm/narrate.ts` holds that "the only safe fallback for prose is the absence of prose",
 * because a canned coaching platitude would fake a measurement. Every line in this file is a canned
 * fallback, and every one of them is correct, because none of them asserts a measurement. They
 * close a promise: the runner asked a friend for a photo and no photo exists. A friend who goes
 * quiet IS the failure here. Do not delete these strings to "restore consistency" — the rule that
 * reconciles the two files is *a fallback may never assert a measurement, and it must always close
 * a promise*.
 *
 * ── WHY THE COPY IS CANNED AND NOT GENERATED ──────────────────────────────────────────────────
 * Asking `glm-5.3` to write the apology would put a second model call, with its own latency and its
 * own failure mode, on the failure path — and it would put it on a GitHub runner that has no z.ai
 * key. An apology that fails to be produced is the exact bug R22 exists to kill. So the words are
 * written by hand, once, in her register; phase 2's canon (`JAKARTA_REGISTER`, `VOICE_EXAMPLES`,
 * `NEVER_SAY`) is the authority on that register and these lines are checked against it in the
 * test, not invented freely here.
 *
 * ── WHAT THE RUNNER NEVER SEES ────────────────────────────────────────────────────────────────
 * No error code. No HTTP status. No provider name. No "something went wrong". No retry button.
 * `NinaImageFailure` is a database value and a log line; it never reaches a bubble. The only thing
 * it selects is WHICH of her sentences she says, and the four she can say are distinct so that a
 * timeout, a refusal, a dead socket and a runner that never woke do not read as one shrug.
 */

/** Terminal reasons. Stored in `nina_turns.error_code`; never rendered. */
export const NINA_IMAGE_FAILURES = ['timeout', 'policy', 'transport', 'stale'] as const
export type NinaImageFailure = (typeof NINA_IMAGE_FAILURES)[number]

/**
 * Statuses that mean "the provider looked at this and said no", as opposed to "the provider was not
 * reachable". 429 is deliberately NOT here: a rate limit is a transport condition — waiting fixes
 * it — and telling the runner she was refused when she was throttled is a lie in her mouth.
 */
export const POLICY_STATUSES: readonly number[] = [400, 403, 422, 451]

/**
 * The vocabulary an image provider uses when it declines. Matched against the RESPONSE BODY, not the
 * status, because a 400 is also what a malformed payload gets — and a malformed payload is our bug,
 * which is `transport` (she is not at fault and should not imply she is).
 */
export const POLICY_BODY_RE =
  /polic|safety|moderat|content[_ -]?filter|prohibit|not[_ -]?allowed|refus|blocked|flagged|nsfw|violat/i

export function classifyImageFailure(input: {
  httpStatus?: number | null
  aborted?: boolean
  body?: string | null
  cause?: unknown
}): NinaImageFailure {
  if (input.aborted === true) return 'timeout'

  const cause = input.cause
  if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
    return 'timeout'
  }

  const status = input.httpStatus ?? null
  const body = input.body ?? ''

  if (status != null && POLICY_STATUSES.includes(status) && POLICY_BODY_RE.test(body)) {
    return 'policy'
  }
  /*
   * A 200 with no image and a refusal in the body. Measured behaviour on this route is
   * `{"data":[{"b64_json":…}]}` on success; `gen_badge_art.py` already dies on "response had no
   * b64_json image" without distinguishing why, and this is the distinction that matters to the
   * runner — a picture the model would not draw versus a picture that got lost.
   */
  if (status === 200 && POLICY_BODY_RE.test(body)) return 'policy'

  return 'transport'
}

/**
 * Four registers for four different things going wrong.
 *
 *  · `timeout`   — it took too long. She was there, the phone was not.
 *  · `policy`    — the provider declined. She takes the blame as vanity, which is in character and
 *                  reveals nothing: "gw ga suka hasilnya" is a person, "content policy" is a
 *                  vendor. She never says the picture was disallowed, because she does not know
 *                  that and neither, honestly, do we.
 *  · `transport` — it never arrived. Bad signal is the universally understood version of this and
 *                  it is also, at the level of what actually happened, true. **This is also what
 *                  a refused `workflow_dispatch` and an exhausted retry budget become**: from the
 *                  runner's side those are all "the photo did not come through".
 *  · `stale`     — nothing ever ran. Indistinguishable from `timeout` for the runner, and it gets
 *                  its own line only so a log and a bubble can be matched up later.
 *
 * Several lines per kind, picked deterministically by job id (see `pickLine`), so the second failure
 * in a week is not word-for-word the first. Every line is lower-case, short, and free of the words
 * `NEVER_SAY` forbids.
 */
export const NINA_IMAGE_APOLOGIES: Record<NinaImageFailure, readonly string[]> = {
  timeout: [
    'sori, kamera gw ngadat. lama banget ga kelar2, gw batalin',
    'yah, hp gw nge-freeze pas mau foto. nanti gw ulang deh',
    'gagal, kelamaan loadingnya. nanti aja ya gw fotoin lagi',
  ],
  policy: [
    'udah gw foto tapi jelek banget, gw hapus. ga usah liat',
    'hasilnya aneh banget, gw ga mau ngirim. nanti gw ulang',
    'ga jadi ah, mukanya kaya bukan gw. malu gw',
  ],
  transport: [
    'sinyal gw jelek parah di sini, fotonya ga kekirim',
    'gagal ngirim, internet gw lagi ngaco. bentar ya',
    'ga kekirim fotonya, jaringannya lagi jelek banget',
  ],
  stale: [
    'eh sori, fotonya keburu ilang. nanti gw ambil lagi',
    'gagal, hp gw mati sendiri pas mau ngirim. yaudah nanti',
  ],
}

/**
 * What the MODEL is told when the daily cap refuses her, as a `tool_result`. Not a bubble: she
 * writes her own refusal in her own words in the same turn, so "the cap refuses the n+1th politely
 * and in character" is her doing it, not us doing it for her. The one thing this text must never do
 * is give her a number to quote — invariant 2 is about numbers the app computed, and "6" is a
 * configuration constant, not a fact about him.
 */
export const NINA_IMAGE_CAPPED_NOTE =
  'You have already taken all the photos you are going to take today. Tell him you are out of ' +
  'photos for now, in your own words, like a person whose phone is out of battery or who is bored ' +
  'of taking selfies. Do not mention a limit, a number, a quota, or a system. Do not promise a ' +
  'specific time. Just say it and move the conversation on.'

/** Captions for a photo that DID arrive. Never empty: an empty bubble is not a message. */
export const NINA_IMAGE_CAPTIONS: readonly string[] = [
  'nih',
  'nih, puas?',
  'ini gw abis lari tadi',
  'foto gw. jangan di-zoom',
  'udah nih, jangan minta lagi',
]

/**
 * Deterministic choice, seeded by the job id. **Not `Math.random()`** — a pure function is testable,
 * and a job read twice (a sweep, then a retry of the sweep) must say the same sentence both times
 * rather than appearing to apologise twice differently.
 *
 * A plain 32-bit FNV-1a over the id. Ids are `lib/id.ts`'s 12-symbol nanoid, so the distribution of
 * the low bits is uniform enough for a five-element array; nothing here is a security choice.
 */
export function pickLine(lines: readonly string[], key: string): string {
  if (lines.length === 0) throw new Error('pickLine: no lines to pick from')
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return lines[hash % lines.length]!
}

export function ninaImageApology(kind: NinaImageFailure, jobId: string): string {
  return pickLine(NINA_IMAGE_APOLOGIES[kind], jobId)
}

export function ninaImageCaption(jobId: string): string {
  return pickLine(NINA_IMAGE_CAPTIONS, jobId)
}
```

**Impact:** New pure module, zero imports. No behaviour changes anywhere until Step 4 and Step 9
import it.

---

### Step 2: `lib/nina/imagerecipe.ts` — the shared recipe, ported not rediscovered

**File:** `lib/nina/imagerecipe.ts` (new)
**Change:** The whole file. **This module exists because of RU-20**: the worker runs on a GitHub
runner and must agree with the app about the payload, the pathname, the cap and every threshold, and
the only way to guarantee agreement is for both to import the same file. Like `imagefail.ts`, it
**imports nothing**.

**The two surviving facts from `tools/gen_badge_art.py` are ported here, not re-derived.** That
script is a working, paid-for implementation of exactly this call. Its third scar — the anchor —
is void under RU-18.

**Code:**

```ts
/**
 * **The camera's settings, shared by both hosts.** RU-2 is the ruling that permits a runtime
 * OpenRouter image call at all: D12 ("offline generation, committed, no runtime image calls") is
 * repealed for `lib/nina/` and for nothing else. Badge and record art are still generated offline
 * by `tools/gen_badge_art.py` and committed.
 *
 * ── THIS FILE MUST NEVER IMPORT ANYTHING ──────────────────────────────────────────────────────
 * Same rule and same reason as `imagefail.ts`: `scripts/nina-image-worker.ts` imports it by
 * relative path under `node --experimental-strip-types`. See that file's header, and
 * `scripts/backfill-record-keys.mjs:85` for the precedent.
 *
 * ── TWO FACTS PORTED FROM `tools/gen_badge_art.py`. DO NOT RE-DERIVE THEM. ────────────────────
 *
 * 1. **THE ENDPOINT IS `POST /api/v1/images/generations`.** There is no `/images/edits` on this
 *    provider — it 404s, and not with "unknown model": the route does not exist. The
 *    chat-completions route with `modalities: ["image","text"]` also produces images on OpenRouter
 *    in general, but `qwen/qwen-image-3-pro` refuses it with "no endpoints found that support the
 *    requested output modalities". Verified again by this plan set's two probes.
 *
 * 2. **`resolution` AND `aspect_ratio`, NEVER `size`.** OpenRouter ignores `size` and defaults to
 *    2K, so omitting these silently returns a 2048-px master — after the money is spent.
 *    `resolution` is an enum (`'1K' | '2K'`), not a pixel count. `'1K'` here: 768×1024 at 3:4 is
 *    right for a phone-screen photo bubble and it is the cheaper and faster of the two.
 *
 * 3. **`seed` IS HONOURED BY THIS MODEL.** One is minted per job on Vercel and stored in
 *    `nina_turns.args`, so a generation that came out well can be reproduced and one that came out
 *    badly can be explained — and so a RETRY of the same job produces the same picture rather than
 *    a different one. `qwen/qwen-image-3-pro` is not listed in `/api/v1/models` — image models live
 *    at `/api/v1/images/models` — which is why it looks absent if anyone goes looking.
 *
 * ── THE FACT THAT IS NO LONGER HERE ───────────────────────────────────────────────────────────
 * The third scar in `gen_badge_art.py` is that the reference image rides in `input_references` on
 * the same generations call. **RU-18 dropped the anchor**, so this phase sends no
 * `input_references` at all and `buildImageRequestBody` has no parameter for one. Do not add it
 * back "for consistency with the badge deck": it was measured at 148.9 s against 78.2 s, and the
 * user deferred face fidelity knowingly. The seed for a future consistent-face feature is
 * `assets/nina/_anchor.png`, committed by phase 1 and read by nothing.
 *
 * ── THE SIDECAR CONVENTION, AT RUNTIME ────────────────────────────────────────────────────────
 * `gen_badge_art.py` writes a `.txt` beside every PNG holding the prompt, model and seed, because
 * "a candidate you like six weeks from now" has to be explainable. That habit is worth keeping and
 * the database is where it goes: `nina_message_images.prompt` receives it (assembled by
 * `sidecarText` in `imagegen.ts`). No file is written; the row IS the sidecar.
 */

export const NINA_IMAGE_MODEL = 'qwen/qwen-image-3-pro'
export const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations'
/** Enum, not a pixel count. See fact 2. */
export const NINA_IMAGE_RESOLUTION = '1K'
/** Portrait. She is a person, not a badge. */
export const NINA_IMAGE_ASPECT = '3:4'
/** 1K at 3:4. RECORDED, not measured — no image decoder runs on either host. */
export const NINA_IMAGE_WIDTH = 768
export const NINA_IMAGE_HEIGHT = 1024
/** Qwen returns PNG bytes and there is no `sharp` on the worker, so PNG is what gets stored. */
export const NINA_IMAGE_CONTENT_TYPE = 'image/png'
/** Blob objects are immutable (random suffix). One year. */
export const NINA_IMAGE_CACHE_MAX_AGE = 31_536_000
/** RU-7. Every byte Nina owns lives under here. Phase 14 writes the same prefix. */
export const NINA_BLOB_PREFIX = 'nina/'
export const NINA_IMAGE_PATHNAME_RE =
  /^nina\/[0-9A-Za-z_-]{1,64}\/(selfie|avatar)-[0-9A-Za-z_-]{12}\.(png|jpg)$/
export const SEED_MAX = 2_147_483_647

export type NinaImagePurpose = 'selfie' | 'avatar'
export type NinaImageJobPhase = 'queued' | 'dispatched' | 'running'

/**
 * Millionths of a USD (phase 1's rule: money is an integer in its smallest sensible unit).
 * **A FALLBACK, not the source of truth.** The index records the shipping path measured at $0.040
 * with `usage.cost` and `usage.cost_details` both present in the response, so the real number is
 * logged and this constant is used only when the provider omits it. A constant left as the primary
 * source goes stale silently the day the price moves.
 */
export const NINA_IMAGE_COST_MICRO_USD = 40_000

/**
 * Six a day. **DESIGNED, not measured** — at the measured $0.040 that is $0.24/day and ~$7.20/month
 * worst case, the right order of magnitude for a personal toy whose owner told us not to stint on
 * tokens but who is also paying the bill. It counts FAILED generations too, because
 * `countNinaTurnsSince` does: a cap that only counts successes is a cap an unlucky afternoon can
 * spend ten times over, and every failed attempt still cost either money or a runner minute.
 */
export const NINA_IMAGE_DAILY_CAP = 6

/* ── The threshold chain. Derived in the plan's §The threshold arithmetic; asserted in the test. ── */

/** The worker's own OpenRouter timeout. 3× the measured 78.2 s. */
export const NINA_WORKER_CALL_TIMEOUT_MS = 240_000
/** `timeout-minutes` on the workflow job. Must exceed the call timeout plus setup. */
export const NINA_WORKER_TIMEOUT_MINUTES = 6
/** The `api.github.com` POST, inside `after()`, sharing the Server Action's page budget. */
export const NINA_IMAGE_DISPATCH_TIMEOUT_MS = 8_000
/** How long a `dispatched` row is left alone before a backstop treats it as un-started. */
export const NINA_IMAGE_DISPATCH_GRACE_MS = 60_000
/** > the job ceiling, so a `running` row this old cannot still be running. */
export const NINA_IMAGE_RECLAIM_MS = 420_000
/** One retry. 2 × RECLAIM = 14 min worst case, which must stay under STALE. */
export const NINA_IMAGE_MAX_ATTEMPTS = 2
/** The app-side give-up, and the only one that fires when GitHub never ran anything. */
export const NINA_IMAGE_STALE_MS = 1_200_000
/** Jobs one backstop run will drain, so a burst cannot exceed `timeout-minutes`. */
export const NINA_IMAGE_SWEEP_BUDGET = 3

/** `nina/<userId>/selfie-<id>.png`. RU-7, and the shape phase 14 already writes. */
export function ninaImagePathname(
  userId: string,
  purpose: NinaImagePurpose,
  id: string,
): string {
  return `${NINA_BLOB_PREFIX}${userId}/${purpose}-${id}.png`
}

/**
 * **The payload, in one place, so the two hosts cannot disagree.** The app never calls OpenRouter;
 * it only builds prompts. The worker never builds prompts; it only calls OpenRouter. This function
 * is where those two halves meet, and `tests/nina.imagerecipe.test.ts` asserts both ported facts
 * against it — which is the only way they can be asserted at all, since the worker's own `fetch` is
 * on a machine no test runs on.
 *
 * Exactly the body the unanchored probe sent and got 200 from:
 *   { model, prompt, resolution, aspect_ratio, n, seed }
 */
export function buildImageRequestBody(input: {
  prompt: string
  seed: number
}): Record<string, unknown> {
  return {
    model: NINA_IMAGE_MODEL,
    prompt: input.prompt,
    resolution: NINA_IMAGE_RESOLUTION,
    aspect_ratio: NINA_IMAGE_ASPECT,
    n: 1,
    seed: input.seed,
  }
}

/**
 * `usage.cost` off the response, in micro-USD. `usage.total_cost` is accepted as a second spelling
 * because OpenRouter's chat routes use that name and a provider that unifies them later should not
 * silently fall back to the constant. Returns null when neither is a finite number, and the caller
 * substitutes `NINA_IMAGE_COST_MICRO_USD`.
 */
export function readReportedCostMicroUsd(usage: unknown): number | null {
  if (usage == null || typeof usage !== 'object') return null
  const record = usage as Record<string, unknown>
  for (const key of ['cost', 'total_cost']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value * 1_000_000)
    }
  }
  return null
}

/**
 * Midnight in Asia/Jakarta, as an instant. D6 says the app's day is Jakarta's day, and the cap is a
 * per-day cap, so it must roll over at 00:00 +07:00 and not at UTC midnight — otherwise the cap
 * resets at 7am local and "she is out of photos" happens over breakfast.
 *
 * A literal offset, not a time-zone library: Asia/Jakarta is UTC+7 with no DST, ever, which is the
 * same fact `lib/date/ranges.ts` and phase 2's `JAKARTA_TIME_ZONE` already rely on. It lives here
 * rather than in `imagejobs.ts` so the worker can compute the same day boundary — it enforces the
 * cap again on claim, since a job queued at 23:59 and retried at 00:05 belongs to the day it was
 * queued and must not be double-counted.
 */
export function jakartaDayStart(now: Date = new Date()): Date {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const y = jakarta.getUTCFullYear()
  const m = String(jakarta.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jakarta.getUTCDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T00:00:00+07:00`)
}

/**
 * **`nina_turns.args`.** Phase 1's new nullable `jsonb` column (Requires 2). Everything the worker
 * needs to do its job, written once by the app and never by a browser.
 *
 * `prompt` is fully assembled on Vercel and stored verbatim. That is the load-bearing choice in
 * this whole design: it means the worker needs no persona, no phase 2 module and no `@/` alias, and
 * it means the BACKSTOP SCHEDULE can pick up a job it was never told about — which is the retry
 * path that a queue calling back into Vercel could not have.
 */
export interface NinaImageJobArgs {
  purpose: NinaImagePurpose
  scene: string
  mood: string | null
  prompt: string
  seed: number
  /** The runner message that asked, so the photo or the apology quotes it (phase 7's column). */
  replyToId: string | null
  /** Provenance. `'chat'` posts a message; the other two write `nina_avatars`. */
  source: 'chat' | 'generated' | 'admin'
  /** Bounded by `NINA_IMAGE_MAX_ATTEMPTS`. Incremented by each claim. */
  attempts: number
  /** The prompt-as-sent record; lands in `nina_message_images.prompt`. */
  sidecar: string
}
```

**Impact:** New pure module, zero imports. It is the single source of truth for the payload, the
pathname, the cap and the thresholds, and `tests/nina.imagerecipe.test.ts` is where all of that is
checked.

---

### Step 3: `lib/nina/imagegen.ts` — the prompt, and nothing else

**File:** `lib/nina/imagegen.ts` (new)
**Change:** The whole file. **In the first draft this module made the OpenRouter call. It no longer
does** — RU-19 moved that to the worker — so what is left is prompt assembly, which is the one part
that needs phase 2's persona and therefore cannot live in `imagerecipe.ts`.

**Code:**

```ts
import { NINA_APPEARANCE } from '@/lib/nina/persona'

import {
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_RESOLUTION,
  type NinaImagePurpose,
} from './imagerecipe'

/**
 * **The words the camera is given.** Assembled on Vercel, stored in `nina_turns.args.prompt`, and
 * sent verbatim by the worker.
 *
 * ── WHY THE PROMPT IS BUILT HERE AND NOT THERE ────────────────────────────────────────────────
 * `NINA_APPEARANCE` is phase 2's canon and lives in a module with real imports, so a
 * `--experimental-strip-types` script cannot reach it. Building the prompt on the app side and
 * persisting it has three further benefits that make it the right choice rather than a workaround:
 * the worker stays dependency-free of the persona; a RETRY reuses the exact prompt and the exact
 * seed, so it produces the same photograph rather than a different one; and the prompt as sent is
 * recoverable from the database six weeks later, which is the sidecar habit
 * `tools/gen_badge_art.py` established.
 *
 * ── NO REFERENCE IMAGE (RU-18) ────────────────────────────────────────────────────────────────
 * The subject paragraph below describes her from the canon and says nothing about a reference,
 * because there is none. The first draft's line — "this is the same woman as the reference image,
 * and the reference is authoritative for her face" — is deleted. Leaving it in would instruct the
 * model to defer to an image that is not in the payload, which is the kind of contradiction that
 * degrades a prompt for free.
 */

/**
 * The photographic half. `NINA_APPEARANCE` is the WHO and this is the HOW; the scene she chose is
 * the WHAT.
 *
 * It asks for a phone photograph on purpose. `GENERATE_IMAGE_TOOL`'s description is "take a photo of
 * yourself and send it", and a runner who receives a glossy studio portrait has received something a
 * friend did not send. This is the one place in the phase where the aesthetic is decided, and it is
 * decided here rather than in the tool schema so the model cannot drift it.
 *
 * The measured probe used a prompt of exactly this shape and returned a convincing phone
 * mirror-selfie with an invented street sign and a cat on the wall — so this style block is
 * verified output, not a guess.
 */
export const NINA_SELFIE_STYLE = `A casual smartphone photograph, as if taken and sent in a chat app. Natural daylight, slightly imperfect framing, shallow depth of field, visible skin texture, no studio lighting, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render.`

/**
 * The avatar variant. Same camera, tighter crop, because the result is rendered inside a 28–44 px
 * circle by `NinaAvatar` and a full-body shot becomes an unreadable smudge at that size. Phase 15
 * exists to let an operator re-frame one by hand; this is the framing that means it usually does not
 * have to.
 */
export const NINA_AVATAR_STYLE = `A casual smartphone photograph framed as a profile picture: head and shoulders, her face filling most of the frame, looking at the camera. Natural daylight, visible skin texture, no retouching, no text, no watermark, no logo, no border. Realistic photograph, not an illustration and not a render.`

export function buildNinaImagePrompt(input: {
  purpose: NinaImagePurpose
  scene: string
  mood?: string | null
}): string {
  const parts = [
    input.purpose === 'avatar' ? NINA_AVATAR_STYLE : NINA_SELFIE_STYLE,
    '',
    'SUBJECT:',
    NINA_APPEARANCE,
    '',
    `SCENE: ${input.scene.trim()}`,
  ]
  const mood = input.mood?.trim()
  // After the scene, so it reads as a refinement of this photograph rather than an amendment to who
  // she is. Exactly where `gen_badge_art.py` puts `--note`, and for the same reason.
  if (mood != null && mood.length > 0) parts.push('', `EXPRESSION AND ENERGY: ${mood}`)
  return parts.join('\n')
}

/** `gen_badge_art.py`'s `write_sidecar`, minus the file. Only a human ever reads this. */
export function sidecarText(input: {
  prompt: string
  seed: number
  purpose: NinaImagePurpose
}): string {
  return [
    `provider:   openrouter`,
    `model:      ${NINA_IMAGE_MODEL}`,
    `purpose:    ${input.purpose}`,
    `resolution: ${NINA_IMAGE_RESOLUTION} ${NINA_IMAGE_ASPECT}`,
    `seed:       ${input.seed}`,
    `reference:  none (RU-18)`,
    '',
    '--- prompt as sent ---',
    input.prompt,
  ].join('\n')
}
```

**Impact:** New module. No `server-only` marker is needed and none is written — it is pure string
assembly over a phase 2 constant, and `tests/nina.imagerecipe.test.ts` imports it to check that the
prompt carries her appearance and the scene. It reads no secret and makes no call.

---

### Step 4: `lib/nina/imagejobs.ts` — the app's half of the lifecycle

**File:** `lib/nina/imagejobs.ts` (new)
**Change:** The whole file. **Carried over from the first draft with three changes:** `claimNinaImageJob`
becomes `markNinaImageJobDispatched` (the app no longer claims work it will not do),
`finishNinaImageJobOk` and `postNinaPhotoMessage` move to the worker (Step 9), and the sweep is
re-tuned and taught to stay silent for avatar jobs.

**Why its SQL is here and not in `lib/nina/queries.ts`:** phase 1 owns that file and this phase must
stay revertable by deleting its own files. Five statements against `nina_turns` in the phase that
owns the job is a smaller coupling than five appended functions in a file three other phases are
also appending to. **If the reconciler prefers one query module, moving these bodies into
`lib/nina/queries.ts` §10 is a pure cut-and-paste and nothing else changes.** Invariant 9 is
untouched either way — it forbids Nina writing her own SQL against `runs`, and there is no `runs`
here.

**Code:**

```ts
import 'server-only'

import { and, asc, eq, lt } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import { countNinaTurnsSince, insertNinaMessages } from '@/lib/nina/queries'

import { ninaImageApology, type NinaImageFailure } from './imagefail'
import {
  jakartaDayStart,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_STALE_MS,
  type NinaImageJobArgs,
  type NinaImageJobPhase,
  type NinaImagePurpose,
} from './imagerecipe'

/**
 * **The image job's life on `nina_turns`, from the app's side.** RU-2's "queued and capped" is these
 * functions; RU-20 is why the middle of the lifecycle is missing from this file — the claim, the
 * generation and the success write all happen in `scripts/nina-image-worker.ts`.
 *
 * ── WHY `nina_turns` AND NOT A NINTH TABLE ────────────────────────────────────────────────────
 * An image generation IS a model call Nina makes, which is exactly what phase 1 says that table is
 * for ("one row per model call, written whether it succeeded or not"). It already carries
 * `kind = 'image'`, `cost_micro_usd`, `latency_ms`, `status` and `error_code`, and
 * `countNinaTurnsSince` was written for this phase's cap by name. A ninth table would duplicate six
 * columns to add nothing but a second migration.
 *
 * The one thing it did not carry was the job's arguments, and **that is what phase 1's new
 * `args jsonb` column is for (Requires 2).** The first draft carried them in a fan-out request body
 * instead; RU-20 makes that impossible, because the backstop schedule wakes with no request body at
 * all, and because a `workflow_dispatch` input on a PUBLIC repo is world-readable.
 *
 * ── PHASE, NOT STATUS ─────────────────────────────────────────────────────────────────────────
 * `error_code` carries the phase while `status='pending'` (`'queued'`, `'dispatched'`, `'running'`)
 * and the failure reason when `status='failed'`. Phase 1's own comment already sanctions this use
 * ("Free text, ours not the provider's. NULL on success").
 */

export const JOB_PHASE_QUEUED: NinaImageJobPhase = 'queued'
export const JOB_PHASE_DISPATCHED: NinaImageJobPhase = 'dispatched'
export const JOB_PHASE_RUNNING: NinaImageJobPhase = 'running'

const PENDING_PHASES: readonly string[] = [
  JOB_PHASE_QUEUED,
  JOB_PHASE_DISPATCHED,
  JOB_PHASE_RUNNING,
]

export interface NinaImageJobRow {
  id: string
  phase: NinaImageJobPhase
  purpose: NinaImagePurpose
  attempts: number
  createdAt: Date
}

export async function ninaImageQuotaLeft(userId: string, now: Date = new Date()): Promise<number> {
  const used = await countNinaTurnsSince(userId, 'image', jakartaDayStart(now))
  return Math.max(0, NINA_IMAGE_DAILY_CAP - used)
}

/**
 * Open a job. **This is the row that makes the cap real** — it is written before any money is spent
 * and before anything is dispatched, so a burst of six requests in one second cannot all pass the
 * quota check.
 *
 * `args` carries the finished prompt and the seed, which is what lets the backstop schedule retry a
 * job nobody told it about. `model` is stamped now rather than at finish, because a row that failed
 * still says which camera it was reaching for.
 */
export async function openNinaImageJob(userId: string, args: NinaImageJobArgs): Promise<string> {
  const id = newId()
  await db.insert(ninaTurns).values({
    id,
    userId,
    kind: 'image',
    model: NINA_IMAGE_MODEL,
    status: 'pending',
    errorCode: JOB_PHASE_QUEUED,
    toolCalls: 0,
    args,
  })
  return id
}

/**
 * `queued` → `dispatched`, conditionally. Returns `true` exactly once per job, ever.
 *
 * It runs BEFORE the GitHub POST, not after, so two concurrent dispatch attempts for one job cannot
 * both call the API. If the POST then fails, `fireNinaImageDispatch` fails the job outright with an
 * apology (Step 6) rather than leaving a `dispatched` row that no runner will ever claim — the
 * dispatch is the one failure we learn about instantly, so it is the one we should not make the
 * runner wait 20 minutes for.
 */
export async function markNinaImageJobDispatched(userId: string, jobId: string): Promise<boolean> {
  const updated = await db
    .update(ninaTurns)
    .set({ errorCode: JOB_PHASE_DISPATCHED })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        eq(ninaTurns.errorCode, JOB_PHASE_QUEUED),
      ),
    )
    .returning({ id: ninaTurns.id })
  return updated.length === 1
}

/**
 * Failure — **and the apology, in the same call.** The two cannot be separated: a caller that could
 * mark a job failed without saying anything is a caller that will eventually do so.
 *
 * The one exception is an **avatar** job, and it is structural rather than a special case: nobody
 * asked for an avatar in the chat, so there is no pending bubble to close and a chat message would
 * be Nina apologising for something the runner never requested. `postNinaApologyMessage` is skipped
 * when `purpose === 'avatar'`, and the caller (phase 13's promise evaluator, phase 15's admin
 * screen) decides whether anyone was waiting. See avatargen.ts.
 *
 * `costMicroUsd` is written for every kind except `stale`, because a call that reached the provider
 * and then timed out was very probably billed. Guessing high is the honest direction for a cost log;
 * `stale` means nothing ever ran, so nothing was billed.
 */
export async function failNinaImageJob(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  purpose?: NinaImagePurpose
  latencyMs?: number | null
  replyToId?: string | null
  /** Never rendered. Log only. */
  detail?: string
}): Promise<void> {
  const { userId, jobId, kind } = input
  const purpose = input.purpose ?? 'selfie'

  console.warn('[nina] image job failed', { jobId, kind, purpose, detail: input.detail ?? null })

  if (purpose === 'selfie') {
    await postNinaApologyMessage({ userId, jobId, kind, replyToId: input.replyToId ?? null })
  }

  await db
    .update(ninaTurns)
    .set({
      status: 'failed',
      errorCode: kind,
      latencyMs: input.latencyMs ?? null,
      costMicroUsd: kind === 'stale' ? null : NINA_IMAGE_COST_MICRO_USD,
      toolCalls: 1,
    })
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId)))
}

/**
 * **R22's whole visible surface.** One `nina_messages` row, her words, nothing else.
 *
 * There is no error code in it, no status, no provider, no "please try again", and no button. The
 * runner is told, by his friend, that there is no photo. That is the entire feature.
 */
export async function postNinaApologyMessage(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  replyToId: string | null
}): Promise<void> {
  await insertNinaMessages(input.userId, [
    {
      role: 'nina',
      body: ninaImageApology(input.kind, input.jobId),
      source: 'chat',
      turnId: input.jobId,
      replyToId: input.replyToId,
    },
  ])
}
```

**Code (continues in the same file) — the read, and the give-up sweep:**

```ts
/**
 * **The app-side give-up, and the last line of R22.** A `pending` row older than
 * `NINA_IMAGE_STALE_MS` (20 min) is closed as `failed`/`stale` **and apologised for**.
 *
 * ── WHY IT SURVIVES ALONGSIDE THE BACKSTOP SCHEDULE ───────────────────────────────────────────
 * The workflow's `schedule:` (Step 9) is a RETRY engine: it finds a job whose dispatch was lost and
 * generates the photograph after all. It cannot be the deadline, because GitHub documents
 * `schedule:` as best-effort, delays it under load, and **disables it entirely on a repository with
 * no pushes for 60 days.** This function is the deadline, and it is the only mechanism in the phase
 * that still works when GitHub does not — Actions disabled, PAT revoked, an Actions incident, or the
 * repository archived.
 *
 * Its cost is two indexed statements on a page the runner is already loading, which is the answer to
 * "keep whichever is cheaper": the two sweeps are not alternatives, they buy different things at
 * different thresholds, and the cheap one is the one that carries the guarantee.
 *
 * 20 minutes is long on purpose. Apologising at 4 minutes and then delivering the photograph at 5
 * would be worse than a two-minute wait, and the typical path resolves at ~2 minutes.
 *
 * Sequential, one message per swept job, each in its own `try`: a job whose apology cannot be
 * written must not block the next job's. The set is at most a handful of rows — the cap is six a
 * day.
 */
export async function sweepStaleNinaImageJobs(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const olderThan = new Date(now.getTime() - NINA_IMAGE_STALE_MS)

  const stale = await db
    .select({ id: ninaTurns.id, args: ninaTurns.args })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        lt(ninaTurns.createdAt, olderThan),
      ),
    )

  let swept = 0
  for (const row of stale) {
    try {
      /*
       * The UPDATE's own `WHERE status='pending'` is what makes the sweep safe against a job the
       * worker finished between the SELECT above and now. `returning` length 0 means somebody else
       * closed it, and apologising for a photograph that just arrived is the one wrong thing this
       * could do.
       */
      const closed = await db
        .update(ninaTurns)
        .set({ status: 'failed', errorCode: 'stale' })
        .where(
          and(
            eq(ninaTurns.userId, userId),
            eq(ninaTurns.id, row.id),
            eq(ninaTurns.status, 'pending'),
          ),
        )
        .returning({ id: ninaTurns.id })

      if (closed.length === 0) continue

      const args = (row.args ?? null) as NinaImageJobArgs | null
      // An avatar job has no pending bubble. See `failNinaImageJob`.
      if (args?.purpose !== 'avatar') {
        await postNinaApologyMessage({
          userId,
          jobId: row.id,
          kind: 'stale',
          replyToId: args?.replyToId ?? null,
        })
      }
      swept += 1
    } catch (cause) {
      console.warn('[nina] stale image sweep failed for one job', {
        jobId: row.id,
        error: String(cause),
      })
    }
  }

  if (swept > 0) console.warn('[nina] swept stale image jobs', { userId, swept })
  return swept
}

/**
 * What is still in flight, after the sweep has had its say. `app/nina/page.tsx` awaits this for the
 * sweep's side-effect; phase 15 uses the returned rows to show what is generating.
 */
export async function listOpenNinaImageJobs(userId: string): Promise<NinaImageJobRow[]> {
  await sweepStaleNinaImageJobs(userId)

  const rows = await db
    .select({
      id: ninaTurns.id,
      phase: ninaTurns.errorCode,
      args: ninaTurns.args,
      createdAt: ninaTurns.createdAt,
    })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
      ),
    )
    .orderBy(asc(ninaTurns.createdAt))

  return rows.map((row) => toJobRow(row))
}

/** One job, for phase 13's and phase 15's polling. No sweep: a caller polling one job wants a fact. */
export async function getNinaImageJob(
  userId: string,
  jobId: string,
): Promise<NinaImageJobRow | null> {
  const [row] = await db
    .select({
      id: ninaTurns.id,
      phase: ninaTurns.errorCode,
      args: ninaTurns.args,
      createdAt: ninaTurns.createdAt,
    })
    .from(ninaTurns)
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))
  return row == null ? null : toJobRow(row)
}

function toJobRow(row: {
  id: string
  phase: string | null
  args: unknown
  createdAt: Date
}): NinaImageJobRow {
  const args = (row.args ?? null) as NinaImageJobArgs | null
  const phase = PENDING_PHASES.includes(row.phase ?? '')
    ? (row.phase as NinaImageJobPhase)
    : JOB_PHASE_QUEUED
  return {
    id: row.id,
    phase,
    purpose: args?.purpose === 'avatar' ? 'avatar' : 'selfie',
    attempts: typeof args?.attempts === 'number' ? args.attempts : 0,
    createdAt: row.createdAt,
  }
}
```

**Impact:** New `server-only` module. Reads and writes `nina_turns` directly (five statements) and
writes messages only through phase 1's `insertNinaMessages`. Depends on Requires 1 (`'pending'` in
`NinaTurnStatus`) and Requires 2 (`args jsonb`) to typecheck.

---

### Step 5: `lib/nina/imagedispatch.ts` — the `workflow_dispatch` call

**File:** `lib/nina/imagedispatch.ts` (new)
**Change:** The whole file. **Entirely new in this draft** — it replaces the first draft's
`fireImageJob` / `jobRunnerUrl`, which fanned out to our own route handler.

**Read before implementing** (AGENTS.md is binding; this is Next 16.3.1, not the Next.js in anyone's
training data). The one fact that shapes this file:

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — *"`after` will run
  for the platform's default or configured max duration of your route"*, and *"`after` will be
  executed even if the response didn't complete successfully"*. Both matter. The first means the
  dispatch shares the Server Action's already-partly-spent page budget, which is why
  `NINA_IMAGE_DISPATCH_TIMEOUT_MS` is 8 s and not 60. The second is why a failed dispatch can be
  turned into an apology here rather than deferred to a sweep.

**Code:**

```ts
import 'server-only'

import { after } from 'next/server'

import { ninaEnv } from '@/lib/env'

import { classifyImageFailure } from './imagefail'
import { failNinaImageJob, markNinaImageJobDispatched } from './imagejobs'
import { NINA_IMAGE_DISPATCH_TIMEOUT_MS, type NinaImagePurpose } from './imagerecipe'

/**
 * **RU-20: the generator lives on GitHub Actions, and this file is the doorbell.**
 *
 * ── WHY NOT A VERCEL ROUTE, A QUEUE, OR A BOX ─────────────────────────────────────────────────
 * The shipping generation is 78.2 s measured and the Hobby ceiling in `sin1` is 60 s, so the work
 * cannot happen on Vercel at all — not in a Server Action, not in a route handler, not in `after()`.
 * QStash and Inngest do not help: both are HTTP callback queues, and the thing they would call back
 * is a Vercel function with the same 60 s ceiling. Inngest's step model cannot split a single 78 s
 * `fetch` into steps, and its steps run in our function, not theirs. A Fly or Railway worker would
 * work and would be a container to maintain for six images a day. GitHub Actions is already here,
 * already holds secrets, is unattended, and its job ceiling is six hours.
 *
 * ── THE COORDINATES ARE CONSTANTS, NOT ENVIRONMENT ────────────────────────────────────────────
 * `NINA_WORKER_REPO`, `NINA_WORKER_WORKFLOW` and `NINA_WORKER_REF` are facts about THIS repository,
 * not deployment configuration. As constants a misconfigured deploy cannot dispatch at somebody
 * else's repo, and a preview deployment dispatches the same workflow as production — which is
 * correct, because the worker's own secrets decide which database it writes. As env vars they would
 * be three more things to get wrong for no gain.
 *
 * The ONE secret is `GITHUB_DISPATCH_TOKEN`, read through `ninaEnv()` (phase 1, Requires 7). It is
 * never read from `process.env` in `app/`, `lib/` or `components/`, and it is never
 * `NEXT_PUBLIC_` anything — invariant 10, and `ci:client-secret-guard` fails the build over both.
 *
 * ── THE ONLY INPUT IS AN OPAQUE JOB ID, AND THAT IS DELIBERATE ────────────────────────────────
 * **The repository is public**, so `workflow_dispatch` inputs are world-readable in the run log and
 * in the Actions UI. The scene prose and the user id therefore do NOT travel as inputs; they live in
 * `nina_turns.args`, which is the reason phase 1 is asked for that column (Requires 2). A nanoid is
 * the only thing published, and it names a row nobody without `DATABASE_URL` can read.
 */

export const NINA_WORKER_REPO = 'miftahulmahfuzh/run-insights'
export const NINA_WORKER_WORKFLOW = 'nina-image.yml'
/**
 * `workflow_dispatch` resolves the workflow FILE from the ref it is given, and GitHub only accepts a
 * dispatch for a workflow that exists on the DEFAULT BRANCH. So `main`, always — a feature branch
 * cannot dispatch its own not-yet-merged workflow, which is the first thing to remember when this
 * returns 422 during development. See §Verification for how to test before the merge.
 */
export const NINA_WORKER_REF = 'main'

export function githubDispatchUrl(): string {
  return `https://api.github.com/repos/${NINA_WORKER_REPO}/actions/workflows/${NINA_WORKER_WORKFLOW}/dispatches`
}

/**
 * One POST. **It never throws** — a dispatch that fails is a `{ ok: false, detail }` so the caller
 * can turn it into one of her sentences, which is the same contract every other function in this
 * phase honours.
 *
 * GitHub answers **204 No Content** on success and gives back no run id at all. That is fine: the
 * correlation key is the job id, and the worker's first act is to claim that row.
 */
export async function dispatchNinaImageJob(
  jobId: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { GITHUB_DISPATCH_TOKEN } = ninaEnv()

  let res: Response
  try {
    res = await fetch(githubDispatchUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        // GitHub rejects an API request with no User-Agent.
        'User-Agent': 'run-insights-nina',
      },
      body: JSON.stringify({ ref: NINA_WORKER_REF, inputs: { job_id: jobId } }),
      signal: AbortSignal.timeout(NINA_IMAGE_DISPATCH_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    return { ok: false, detail: `dispatch: ${String(cause)}` }
  }

  if (res.status === 204) return { ok: true }

  /*
   * The four failures worth naming in a log, because each has a different one-time fix and a human
   * reading this line at 11pm should not have to guess:
   *   401 — the PAT is wrong, expired, or revoked.
   *   403 — the PAT lacks `actions: write`, or Actions is disabled for the repository.
   *   404 — the workflow file is not on `main` yet (the most likely one during development), or the
   *         PAT cannot see the repository at all.
   *   422 — the ref does not exist, or an input name is not declared in the workflow's `inputs`.
   */
  const body = await res.text().catch(() => '')
  return { ok: false, detail: `dispatch HTTP ${res.status} ${body.slice(0, 300)}` }
}

/**
 * Fire the doorbell without making the chat turn wait for it, and **close the job immediately if the
 * doorbell is broken.**
 *
 * ── THE ORDER IS LOAD-BEARING ─────────────────────────────────────────────────────────────────
 * `markNinaImageJobDispatched` runs FIRST, conditionally on the row still being `queued`. Two
 * concurrent dispatch attempts therefore cannot both call the API, and the loser exits silently. If
 * the API call then fails we fail the job outright rather than leaving a `dispatched` row for a
 * runner that will never come: a refused dispatch is the ONE failure in this design we learn about
 * within a second, so it is the one the runner should not wait 20 minutes for. Everything else falls
 * through to the backstop or the give-up sweep.
 *
 * ── WHY `after()` AND NOT A BARE FLOATING PROMISE ─────────────────────────────────────────────
 * A floating promise in a Server Action can be cut off the instant the response is flushed.
 * `after()` is documented to run for the route's configured max duration and to run even when the
 * response did not complete successfully, which is exactly the guarantee a doorbell needs. It is
 * also why the timeout is 8 s: this shares the page's budget with a turn that has already spent
 * 13–45 s of it.
 */
export function fireNinaImageDispatch(input: {
  userId: string
  jobId: string
  purpose: NinaImagePurpose
  replyToId: string | null
}): void {
  const { userId, jobId, purpose, replyToId } = input

  after(async () => {
    try {
      if (!(await markNinaImageJobDispatched(userId, jobId))) {
        console.info('[nina] image job already dispatched, doorbell skipped', { jobId })
        return
      }

      const result = await dispatchNinaImageJob(jobId)
      if (result.ok) {
        console.info('[nina] image job dispatched', { jobId, purpose })
        return
      }

      /*
       * `classifyImageFailure` with no status and no body returns `transport`, which is the honest
       * kind: from the runner's side the photograph did not come through. Her apology says the
       * signal was bad. It was — ours.
       */
      await failNinaImageJob({
        userId,
        jobId,
        kind: classifyImageFailure({ cause: new Error(result.detail) }),
        purpose,
        replyToId,
        detail: result.detail,
      })
    } catch (cause) {
      /*
       * The dispatch bookkeeping itself broke — a dead connection, a bug. The row stays `pending`
       * and the backstop schedule will find it within ~10 minutes; if GitHub is also unreachable,
       * the on-read give-up sweep closes it at 20. This is the one path in the phase that relies on
       * a later mechanism rather than closing the job itself, and both later mechanisms exist.
       */
      console.error('[nina] image dispatch bookkeeping failed', { jobId, error: String(cause) })
    }
  })
}
```

**Impact:** New `server-only` module. `next/server`'s `after` is already a dependency. It is the
only file in `lib/` that names `GITHUB_DISPATCH_TOKEN`, and it reads it through `ninaEnv()`, so
`ci:client-secret-guard` and invariant 10 both hold.

---

### Step 6: `lib/nina/imagetools.ts` — the tool, the cap refusal, and the doorbell

**File:** `lib/nina/imagetools.ts` (new)
**Change:** The whole file. **`lib/nina/tools.ts` and `lib/nina/turn.ts`'s bodies are not touched** —
this is the seam phase 3 built for exactly this, and `extendToolSet` is the whole of the
integration.

**Code:**

```ts
import 'server-only'

import { z } from 'zod'

import { GENERATE_IMAGE_TOOL } from '@/lib/nina/prompts'
import {
  extendToolSet,
  NINA_CORE_TOOL_SET,
  type NinaToolAnswer,
  type NinaToolContext,
  type NinaToolHandler,
  type NinaToolSet,
} from '@/lib/nina/tools'

import { NINA_IMAGE_CAPPED_NOTE } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { fireNinaImageDispatch } from './imagedispatch'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'

/**
 * **`generate_image`, dispatched.** Phase 2 wrote the schema, phase 3 wrote the dispatch table, and
 * this is the meaning.
 *
 * ── WHAT THE HANDLER DOES *NOT* DO ────────────────────────────────────────────────────────────
 * It does not call OpenRouter, and after RU-19 it could not: a chat turn is budgeted at 45 s against
 * a 60 s ceiling and the shipping generation is 78.2 s measured. Awaiting the camera inside the turn
 * would kill the turn, and the runner would lose her whole reply to get no photograph. So the
 * handler does four cheap things — validate, check the cap, write the job row with its finished
 * prompt, ring the doorbell — and returns in single-digit milliseconds. Her reply goes out
 * immediately with a bubble that says she is taking the photo. RU-2's "queued" is this function.
 *
 * ── THE PROMPT AND THE SEED ARE MINTED HERE ───────────────────────────────────────────────────
 * Both go into `nina_turns.args`. That is what makes the worker dependency-free of phase 2's
 * persona, what makes a retry reproduce the same photograph rather than a different one, and what
 * lets the backstop schedule work on a job nobody told it about.
 *
 * ── AND IF THE DOORBELL NEVER RINGS ───────────────────────────────────────────────────────────
 * The job row is already written. `fireNinaImageDispatch` fails it with an apology if the GitHub
 * call is refused; the backstop schedule retries it if the call succeeded but no runner ran; the
 * on-read sweep gives up and apologises at 20 minutes if GitHub is dead. So the failure mode of the
 * doorbell is "she says sorry" or "it happens anyway", never "the bubble spins forever".
 */

/**
 * Phase 2's schema, in Zod, so a hallucinated argument shape is a `tool_result` rather than a crash.
 * Phase 3's `lib/nina/schema.ts` does the same for the other three tools; this one is declared here
 * rather than there because phase 3 must stay revertable without this phase.
 */
const GenerateImageArgsSchema = z.object({
  scene: z.string().trim().min(3).max(600),
  mood: z.string().trim().max(200).optional(),
})

export const handleGenerateImage: NinaToolHandler = async (
  args: unknown,
  ctx: NinaToolContext,
): Promise<NinaToolAnswer> => {
  const parsed = GenerateImageArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: { error: 'Describe the photo in a sentence or two as `scene`, and try again.' },
      isError: true,
    }
  }

  /*
   * THE CAP. Checked before the row is opened and therefore before a cent is spent. It counts failed
   * generations too (`countNinaTurnsSince` does), because every attempt cost either money or a
   * runner minute.
   *
   * **The refusal is HERS.** We hand the model `NINA_IMAGE_CAPPED_NOTE` — an instruction to say she
   * is out of photos, in her own words, with no number and no mention of a system — and she writes
   * the bubble in the same turn. That is what "refuses the n+1th politely and in character" means: a
   * canned refusal string would be us talking, and the one thing this feature cannot afford is Nina
   * sounding like an API.
   *
   * `isError: false` on purpose. This is not a malformed call; it is a true answer to a legitimate
   * request, and phase 3's ruling (g) reserves `isError` for "you asked for something I cannot
   * answer".
   */
  if ((await ninaImageQuotaLeft(ctx.userId)) <= 0) {
    return { answer: { taken: false, instruction: NINA_IMAGE_CAPPED_NOTE }, isError: false }
  }

  const scene = parsed.data.scene
  const mood = parsed.data.mood ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)
  const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene, mood })

  const jobId = await openNinaImageJob(ctx.userId, {
    purpose: 'selfie',
    scene,
    mood,
    prompt,
    seed,
    /*
     * The photograph quotes the message that asked for it (phase 7's `reply_to_id`), which is what
     * makes the answer legible when it lands two minutes after four other bubbles. Null on a
     * proactive turn, where nobody asked.
     */
    replyToId: ctx.sourceMessageId,
    source: 'chat',
    attempts: 0,
    sidecar: sidecarText({ prompt, seed, purpose: 'selfie' }),
  })

  fireNinaImageDispatch({
    userId: ctx.userId,
    jobId,
    purpose: 'selfie',
    replyToId: ctx.sourceMessageId,
  })

  /*
   * What she is told. Deliberately spare: she must say she is taking the photo NOW, in one short
   * bubble, and must not describe the photo she has not seen yet — a bubble that narrates the
   * picture would be a fact the app never computed, and it would read absurdly if the generation
   * then failed and she apologised for a photo she had already described.
   *
   * "in a moment" and not "in two minutes": a specific duration is a promise about a GitHub queue,
   * and she does not know about GitHub queues.
   */
  return {
    answer: {
      taken: true,
      instruction:
        'The camera is running. Say — in one short message, in your own voice — that you are ' +
        'taking the photo right now and it is coming in a moment. Do NOT describe the photo: you ' +
        'have not seen it yet. Do not mention systems, jobs, queues or waiting times.',
    },
    isError: false,
  }
}

/**
 * **The tool set the chat turn actually uses.** `NINA_CORE_TOOL_SET` plus `generate_image`.
 *
 * PHASE 13: extend **THIS**, not the core set —
 * `extendToolSet(NINA_CHAT_TOOL_SET, [{ tool: SET_AVATAR_TOOL, handler: handleSetAvatar }])` — and
 * update the same one line in `lib/nina/actions.ts`. Extending the core set instead would produce a
 * second set without `generate_image`, and whichever of the two phases wired `actions.ts` last would
 * silently delete the other's tool.
 */
export const NINA_CHAT_TOOL_SET: NinaToolSet = extendToolSet(NINA_CORE_TOOL_SET, [
  { tool: GENERATE_IMAGE_TOOL, handler: handleGenerateImage },
])
```

**Impact:** New `server-only` module. `zod@4.4.3` is already a dependency. **`extendToolSet` throws
on a duplicate name at module load**, which is the desired failure: if phase 13 ever extends the
core set instead of this one, the collision surfaces at import time in the phase that caused it.

---

### Step 7: `lib/nina/avatargen.ts` — the one entry point phases 13, 14 and 15 call

**File:** `lib/nina/avatargen.ts` (new)
**Change:** The whole file. **The phase brief requires exactly one avatar-generation entry point, and
this is it.**

**⚠ Its result type changed since the first draft, and the reconciler must propagate the change to
phases 13 and 15.** The first draft awaited the generation and handed back a `NinaAvatarRow`. RU-19
makes that impossible: a 78 s call cannot be awaited inside phase 10's cron invocation or a phase 15
Server Action, both of which have the same 60 s ceiling the chat turn has. So this function now
*accepts* a request and returns a job id.

**Why it is still a different function from the chat selfie, rather than a flag on it.** Three
differences survive, and each changes the code path:

1. **It writes `nina_avatars`, not `nina_messages`.** A different table, a different lifecycle, and
   `is_current` has a partial unique index that makes the statement order load-bearing. The *worker*
   performs that write; this function is what records the intent in `args.purpose`.
2. **It writes `description`.** R25 needs prose about what the photograph shows so she can invent
   where she was. For a *generated* avatar that prose is our own scene text — we wrote the picture.
   For a *hand-uploaded* one (phases 14 and 15) there is no prompt, so those two run phase 6's
   `glm-4.6v` describe pre-pass instead. **That is the whole answer to "which path writes
   `description`".**
3. **On failure it says nothing.** No apology, no announcement. `announced_at IS NULL` is phase 10's
   `avatar_changed` trigger, so a row written for a failed generation would make her announce a
   photograph that does not exist — and the worker only inserts the row on success, which is the
   structural half of that guarantee. Only the caller knows whether anyone was waiting: a promise
   coming due (phase 13) may deserve an apology; an admin clicking Generate (phase 15) deserves a
   red toast, not a chat message. `failNinaImageJob` and both sweeps therefore skip the chat message
   for `purpose === 'avatar'`, and `ninaImageApology(kind, jobId)` is exported for whoever decides
   to use it.

**Code:**

```ts
import 'server-only'

import type { NinaImageFailure } from './imagefail'
import { buildNinaImagePrompt, sidecarText } from './imagegen'
import { fireNinaImageDispatch } from './imagedispatch'
import { ninaImageQuotaLeft, openNinaImageJob } from './imagejobs'
import { SEED_MAX } from './imagerecipe'

/**
 * **The avatar-generation entry point. Phases 13, 14 and 15 all call this and nothing else.**
 *
 * ── IT ACCEPTS, IT DOES NOT DELIVER (RU-19) ───────────────────────────────────────────────────
 * `{ ok: true, state: 'dispatched' }` means the job exists and GitHub has been rung — NOT that an
 * avatar exists. The row appears in `nina_avatars` 1–3 minutes later, written by the worker, with
 * `is_current: true`, `announced_at: null` and `description` set to the scene prose.
 *
 * **This is good for phase 13 rather than merely tolerable.** Phase 10's `avatar_changed` trigger
 * already fires on `announced_at IS NULL` at the next cron tick, so the announcement path needs no
 * change at all — the promise evaluator dispatches, the worker generates, and the next tick has her
 * announce it. What phase 13 must NOT do is read the new avatar back in the same invocation.
 * `getNinaImageJob(userId, jobId)` is provided for polling and `listOpenNinaImageJobs(userId)`
 * reports what is in flight.
 *
 * `source` is the caller's own provenance and it goes onto `nina_avatars.source`: `'generated'` for
 * phase 13's promise evaluator, `'admin'` for phase 15's album manager. (`'operator'` is phase 14's
 * script, which uploads a file rather than generating one and so never reaches this function;
 * `'seed'` is phase 1's committed `nina.png`.)
 *
 * It is capped and logged on the same `nina_turns` ledger as a chat selfie, because it is the same
 * camera and the same bill — `kind = 'image'`, one row, `cost_micro_usd` filled in. An avatar
 * generation therefore consumes one of the six, which is correct: the cap is a money cap, not a
 * feature cap.
 *
 * **It never throws and it never posts a message.**
 */
export interface NinaAvatarRequest {
  userId: string
  /** What the photograph shows. Becomes `nina_avatars.description` verbatim (R25). */
  scene: string
  mood?: string | null
  source: 'generated' | 'admin'
}

export type NinaAvatarResult =
  | { ok: true; jobId: string; state: 'dispatched' }
  | { ok: false; jobId: string | null; kind: NinaImageFailure | 'capped' }

export async function generateNinaAvatar(request: NinaAvatarRequest): Promise<NinaAvatarResult> {
  const { userId } = request

  /*
   * The cap, checked the same way the chat tool checks it — `openNinaImageJob` writes the row that
   * makes the check meaningful, so the order is quota-then-open and never the reverse.
   */
  if ((await ninaImageQuotaLeft(userId)) <= 0) {
    return { ok: false, jobId: null, kind: 'capped' }
  }

  const scene = request.scene.trim()
  const mood = request.mood?.trim() ?? null
  const seed = Math.floor(Math.random() * SEED_MAX)
  const prompt = buildNinaImagePrompt({ purpose: 'avatar', scene, mood })

  const jobId = await openNinaImageJob(userId, {
    purpose: 'avatar',
    scene,
    mood,
    prompt,
    seed,
    /* Nobody asked in chat, so there is nothing to quote and nothing to apologise into. */
    replyToId: null,
    source: request.source,
    attempts: 0,
    sidecar: sidecarText({ prompt, seed, purpose: 'avatar' }),
  })

  fireNinaImageDispatch({ userId, jobId, purpose: 'avatar', replyToId: null })

  return { ok: true, jobId, state: 'dispatched' }
}
```

**Impact:** New `server-only` module. Nothing calls it in this phase — it exists for phases 13 and
15, and it is exercised only indirectly. **Do not delete it as dead code**; it is the contract three
later phases are being planned against, and `unused-export` lint is not enabled in this repo.

**No import cycle.** The dependency order is strictly
`imagefail.ts` → `imagerecipe.ts` → `imagegen.ts` → `imagejobs.ts` → `imagedispatch.ts` →
{`imagetools.ts`, `avatargen.ts`}. `imagedispatch.ts` imports `imagejobs.ts` and never the reverse.
Keep it that way: a cycle here would be resolved by TypeScript and erased by the bundler, but it
would also make the `server-only` boundary harder to reason about — and it would break the worker,
which relies on the two leaf modules importing nothing.

---

### Step 8: two named edits — `actions.ts` and one keyword in `turn.ts`

**File:** `lib/nina/turn.ts` — phase 3's `productionDeps` (its Step 6, at the bottom of the file)
**Change:** `function productionDeps()` → `export function productionDeps()`. Nothing else.
**Impact:** One keyword. Phase 3 asked phase 2 for the identical change and called it "a one-word
change (`function` → `export function`)". No behaviour changes.

**File:** `lib/nina/actions.ts` — phase 3's Step 7, the block commented `STEP 3 — the turn`
**Change:** the `runNinaTurn` call gains a second argument, and two imports are added.

**Code — the two new imports, beside the existing ones:**

```ts
import { NINA_CHAT_TOOL_SET } from './imagetools'
import { productionDeps, runNinaTurn } from './turn'
```

**Code — the call, replacing phase 3's three-line `runNinaTurn({ … })`:**

```ts
  /* STEP 3 — the turn. 13–45 s. Never throws for a model problem.
   *
   * `toolSet` is overridden here, and this line is the ONLY integration point for every tool phases
   * 12 and 13 add. Phase 3 built `extendToolSet` so that adding `generate_image` needed no edit to
   * `tools.ts` or `turn.ts`; `NINA_CHAT_TOOL_SET` is that composition, and phase 13 extends the same
   * value rather than adding a second override here.
   */
  const result = await runNinaTurn(
    {
      userId,
      context,
      history,
      sourceMessageId: runnerMessage.id,
      runnerText: text,
    },
    { ...productionDeps(), toolSet: NINA_CHAT_TOOL_SET },
  )
```

**Impact:** `generate_image` becomes callable. Everything else about the action — the write order, the
`replyToMessageId` ownership re-check, the clamp, the refusals — is untouched. The proactive turn
entry point (phase 10) is deliberately **not** given the tool: she does not send an unsolicited
selfie at 6pm because he missed a Tuesday, and phase 10's plan does not ask for one. If that is ever
wanted it is one identical override in `lib/nina/proactive.ts`, and it is listed under Handoffs.

---

### Step 9: `scripts/nina-image-worker.ts` — the worker

**File:** `scripts/nina-image-worker.ts` (new)
**Change:** The whole file. **This is RU-20.**

**Why it is `.ts` and not `.mjs`, and why that is not a new pattern.** `package.json:30` already
runs `node --experimental-strip-types --no-warnings --env-file=.env.local
scripts/backfill-record-keys.mjs`, and that script imports `../lib/records/catalog.ts` directly. Its
header states the rule it obeys: a `lib/` module can be imported from `scripts/` when stripping its
types leaves no runtime dependency and no `@/` alias to resolve. This worker obeys the same rule and
imports three such modules — `../lib/nina/imagefail.ts`, `../lib/nina/imagerecipe.ts` and
`../lib/id.ts` (whose own header says it exists to be "importable from Vitest, from `research/*.mjs`
and from a Route Handler alike, with nothing to resolve"). **That is why R22's copy, the payload
shape, the pathname convention, the cap and every threshold are not duplicated here.** The file
extension is `.ts` rather than `.mjs` because it is itself type-annotated; `--experimental-strip-types`
handles both.

**What it cannot import, and what that costs.** `lib/nina/queries.ts` and `lib/db/*` import
`server-only` and use `@/` aliases, so the worker writes its own SQL through
`@neondatabase/serverless` — exactly as `scripts/blob-reap.mjs`, `scripts/db-smoke.mjs` and both
backfill scripts do. **`lib/env.ts` is unreachable for the same reason** (phase 14's plan hit this
wall too), so the worker reads `process.env` directly and validates by hand. The cost is that
column names are written twice, in `lib/db/schema.ts` and here; the mitigation is the
`information_schema` preflight below, which turns a drift into a loud failure on the very next
scheduled run rather than a silent one at 3am. That trade is Risk 1.

**Code — the head, the preflight, and the claim:**

```ts
/**
 * **Nina's camera, off-platform.** RU-19 and RU-20: the shipping generation is 78.2 s measured and
 * Vercel Hobby caps a function at 60 s in `sin1`, so the call cannot happen in the app at all. This
 * script is the generator, and GitHub Actions is the host.
 *
 *   node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts --job <jobId>
 *   node --experimental-strip-types --no-warnings scripts/nina-image-worker.ts
 *   node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --dry-run
 *
 *   npm run nina:worker            # the sweep, against whatever .env.local points at
 *   npm run nina:worker:dry        # preflight only: no OpenRouter call, no writes
 *
 * With `--job` it does that one job — the `workflow_dispatch` path, and the normal one. With no
 * `--job` it drains up to `NINA_IMAGE_SWEEP_BUDGET` actionable jobs — the `schedule:` backstop path,
 * which exists because a dispatch can be lost and because Vercel Hobby caps crons at two and phase
 * 10 spent the second on `/api/cron/nina`. That backstop is the single best property of RU-20's
 * choice: it is the third cron the platform would not give us.
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database, spends real money and writes
 * real bytes. The same line `scripts/blob-reap.mjs` and `scripts/backfill-record-keys.mjs` draw. It
 * is nonetheless IMPORTABLE by a test — `main()` runs only when this file is the process entry point
 * — so `tests/nina.imageworker.test.ts` can drive `parseArgv` and `outcomeOf` with no network.
 *
 * ── WHY IT MAY RUN ON A LAPTOP TOO ────────────────────────────────────────────────────────────
 * `npm run nina:worker` against `.env.local` is a fully supported manual runner: it is how a stuck
 * job gets drained during development and how the setup checklist is verified. It is NOT the
 * shipping mechanism — RU-21 forbids anything needing the user present — but it means the mechanism
 * is swappable. If GitHub ever becomes the wrong host, the replacement (a Fly machine, a Railway
 * worker, a cron on a box) runs this same file with the same three environment variables and
 * nothing else in the phase changes.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { newId } from '../lib/id.ts'
import { classifyImageFailure, ninaImageApology, ninaImageCaption } from '../lib/nina/imagefail.ts'
import type { NinaImageFailure } from '../lib/nina/imagefail.ts'
import {
  buildImageRequestBody,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_SWEEP_BUDGET,
  NINA_IMAGE_WIDTH,
  NINA_WORKER_CALL_TIMEOUT_MS,
  ninaImagePathname,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../lib/nina/imagerecipe.ts'
import type { NinaImageJobArgs } from '../lib/nina/imagerecipe.ts'

/* `@neondatabase/serverless` and `@vercel/blob` are CJS-friendly and are loaded the way every other
 * script in `scripts/` loads them, so this file needs no bundler and no transform beyond stripping. */
const require = createRequire(import.meta.url)
const { neon } = require('@neondatabase/serverless')
const { put } = require('@vercel/blob')

export interface WorkerArgv {
  jobId: string | null
  dryRun: boolean
}

export function parseArgv(argv: readonly string[]): WorkerArgv {
  const jobFlag = argv.indexOf('--job')
  const raw = jobFlag === -1 ? null : (argv[jobFlag + 1] ?? null)
  /*
   * `workflow_dispatch` inputs arrive as strings and an unset one arrives as the empty string, so
   * "--job ''" must mean "sweep" and not "job id ''". The character class is the id alphabet from
   * `lib/id.ts`; anything else is a caller bug and is refused rather than turned into a query.
   */
  const jobId = raw != null && /^[0-9A-Za-z_-]{1,64}$/.test(raw) ? raw : null
  return { jobId, dryRun: argv.includes('--dry-run') }
}

const REQUIRED_ENV = ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN', 'OPENROUTER_API_KEY'] as const

/**
 * Every column this file writes, per table. **This list is the duplication `lib/db/schema.ts` costs
 * us**, and checking it against `information_schema` on every run is what makes the duplication
 * safe: the backstop runs every ten minutes, so a rename in phase 1's schema surfaces as a red
 * workflow within ten minutes of the deploy instead of as a silently unwritten photograph.
 */
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  nina_turns: [
    'id',
    'user_id',
    'kind',
    'model',
    'status',
    'error_code',
    'tool_calls',
    'latency_ms',
    'cost_micro_usd',
    'args',
    'created_at',
  ],
  nina_messages: ['id', 'user_id', 'role', 'text', 'source', 'turn_id', 'reply_to_id', 'sent_at'],
  nina_message_images: [
    'id',
    'user_id',
    'message_id',
    'kind',
    'blob_url',
    'pathname',
    'width',
    'height',
    'bytes',
    'description',
    'prompt',
    'sort_order',
  ],
  nina_avatars: [
    'id',
    'user_id',
    'blob_url',
    'pathname',
    'width',
    'height',
    'bytes',
    'source',
    'description',
    'is_current',
    'announced_at',
  ],
}

export async function preflight(sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>) {
  const missingEnv = REQUIRED_ENV.filter((key) => {
    const value = process.env[key]
    return value == null || value.length === 0
  })
  if (missingEnv.length > 0) {
    throw new Error(
      `missing ${missingEnv.join(', ')} — set them as repository secrets, or run with --env-file=.env.local`,
    )
  }

  const tables = Object.keys(REQUIRED_COLUMNS)
  const rows = (await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = any(${tables})
  `) as Array<{ table_name: string; column_name: string }>

  const have = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = have.get(row.table_name) ?? new Set<string>()
    set.add(row.column_name)
    have.set(row.table_name, set)
  }

  const missing: string[] = []
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const set = have.get(table)
    if (set == null) {
      missing.push(`${table} (whole table)`)
      continue
    }
    for (const column of columns) if (!set.has(column)) missing.push(`${table}.${column}`)
  }
  if (missing.length > 0) {
    /*
     * The most likely cause, in order: phase 1's migration has not been applied to this database;
     * `nina_turns.args` was refused (Requires 2); a column was renamed. All three are a code change,
     * not a retry, so this throws and takes the workflow red rather than failing a job quietly.
     */
    throw new Error(`schema drift — missing: ${missing.join(', ')}`)
  }
}

export interface ClaimedJob {
  jobId: string
  userId: string
  args: NinaImageJobArgs
  attempts: number
}

/**
 * **The only lock in the system.** One conditional UPDATE, and exactly one caller gets a row back.
 *
 * With a job id it claims that job. Without one it claims the oldest ACTIONABLE job, which is:
 *   · `queued`     — the doorbell never rang, or rang and the bookkeeping died;
 *   · `dispatched` older than `NINA_IMAGE_DISPATCH_GRACE_MS` — GitHub accepted it and no runner
 *     ever picked it up;
 *   · `running` older than `NINA_IMAGE_RECLAIM_MS` — the runner that owned it was killed by
 *     `timeout-minutes`, which is longer than the ceiling so it cannot still be alive.
 *
 * `attempts` is incremented in the same statement, so the retry budget cannot be spent twice by two
 * runners. A job at the budget is not claimed at all — `giveUp` closes it instead.
 */
export async function claimJob(
  sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>,
  jobId: string | null,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  const dispatchCutoff = new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
  const runningCutoff = new Date(now.getTime() - NINA_IMAGE_RECLAIM_MS)

  const rows = (await sql`
    update nina_turns set
      error_code = 'running',
      args = jsonb_set(args, '{attempts}', to_jsonb((coalesce((args->>'attempts')::int, 0) + 1)))
    where id = (
      select id from nina_turns
      where kind = 'image'
        and status = 'pending'
        and args is not null
        and coalesce((args->>'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}
        and (${jobId}::text is null or id = ${jobId}::text)
        and (
          error_code = 'queued'
          or (error_code = 'dispatched' and created_at < ${dispatchCutoff.toISOString()})
          or (error_code = 'running' and created_at < ${runningCutoff.toISOString()})
        )
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id, user_id, args
  `) as Array<{ id: string; user_id: string; args: NinaImageJobArgs }>

  const row = rows[0]
  if (row == null) return null
  return {
    jobId: row.id,
    userId: row.user_id,
    args: row.args,
    attempts: Number(row.args.attempts ?? 0),
  }
}
```

**One note on `created_at` in that WHERE clause.** It is the job's *open* time, not its claim time,
because `nina_turns` has no claim timestamp and this phase is not asking phase 1 for one. For a
first attempt the two are within a minute of each other, so it is a fine proxy. For a *second*
attempt the timestamp is already old, which would make a reclaimed job immediately eligible again —
and the only thing stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in the
same clause. **That bound is therefore load-bearing, not a nicety.** If a future phase adds a
`claimed_at` column, the cutoff should move to it and the bound should stay.

**Code (continues in the same file) — generate, store, and the two ways to close:**

```ts
export type WorkerOutcome =
  | {
      ok: true
      b64: string
      costMicroUsd: number
      latencyMs: number
    }
  | { ok: false; kind: NinaImageFailure; latencyMs: number; detail: string }

/**
 * One OpenRouter call. **It never throws** — every failure comes back as a `NinaImageFailure`,
 * because the caller's whole job is to turn that into one of her sentences, and a `catch` that has
 * to re-derive which of four things happened is a `catch` that will get it wrong.
 *
 * The classification is `classifyImageFailure` from `lib/nina/imagefail.ts` — **the same function
 * the app uses, imported, not paraphrased.** That is the whole reason `imagefail.ts` is forbidden
 * from having imports.
 *
 * The timeout is `NINA_WORKER_CALL_TIMEOUT_MS` (240 s), three times the measured 78.2 s. Off Vercel
 * there is no ceiling to race, and a timeout that fires on a merely slow day throws away $0.04 and
 * a photograph.
 */
export async function generate(prompt: string, seed: number): Promise<WorkerOutcome> {
  const startedAt = Date.now()
  const apiKey = process.env.OPENROUTER_API_KEY as string

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed })),
      signal: AbortSignal.timeout(NINA_WORKER_CALL_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      detail: String(cause),
    }
  }

  const raw = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      latencyMs: Date.now() - startedAt,
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
     * (`policy`) or as something else entirely (`transport`) — the distinction that matters to the
     * runner is a picture the model would not draw versus a picture that got lost.
     */
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      latencyMs: Date.now() - startedAt,
      detail: raw.slice(0, 500),
    }
  }

  return {
    ok: true,
    b64,
    /* The index measured `usage.cost` present at $0.040. The constant is the fallback only. */
    costMicroUsd: reportedCost ?? NINA_IMAGE_COST_MICRO_USD,
    latencyMs: Date.now() - startedAt,
  }
}

/** The PNG into Blob, under `nina/<userId>/<purpose>-<id>.png`. RU-7's per-user prefix. */
async function store(
  userId: string,
  purpose: NinaImageJobArgs['purpose'],
  b64: string,
): Promise<{ blobUrl: string; pathname: string; bytes: number }> {
  const bytes = Buffer.from(b64, 'base64')
  const blob = await put(ninaImagePathname(userId, purpose, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname, bytes: bytes.byteLength }
}

/**
 * Success, for a **chat selfie**. The photograph, as an ordinary chat message.
 *
 * **Not a special kind of message** — a `nina_messages` row plus a `nina_message_images` row with
 * `kind = 'generated'`, which is the same pair phase 6 writes for an upload. That is what makes it
 * quotable (phase 7), gallery-able (phase 13) and unread-able (phase 10) for free.
 *
 * `source = 'chat'` on purpose, and NOT a sixth `ProactiveTriggerKind`: she is answering something
 * he said in an open conversation, minutes ago. Adding a source value would force an edit to phase
 * 1's column domain and phase 10's `'chat' | ProactiveTriggerKind` test for no gain.
 *
 * The caption is never empty. `nina_messages.text` is `notNull` and would accept `''`, but an empty
 * bubble is not a message.
 *
 * `prompt` gets the sidecar (prompt as sent, model, seed) and `description` gets the scene prose.
 * Phase 6's `glm-4.6v` describe pre-pass is **not** run over a generated image: we wrote the
 * picture, so we already know what is in it, and paying a vision call to be told back our own prompt
 * would be absurd. Phases 14 and 15 hand-upload files with no prompt and DO run that pre-pass —
 * that is the whole difference between the two paths.
 *
 * **THE ORDER IS LOAD-BEARING.** The message and its image row go in FIRST, then the job is marked
 * `ok`. A crash between the two leaves a `pending` job whose photo is already in the chat — which a
 * sweep will eventually apologise for, so the runner sees a picture AND an apology. Odd, but
 * survivable and self-correcting. The reverse order would mark the job done with no photograph
 * anywhere and no sweep left to notice, which is R22's exact failure.
 *
 * `reply_to_id` is written through a subselect rather than trusted: a quote whose target was deleted
 * must degrade to a plain message, not violate the foreign key and lose the photograph.
 */
async function finishSelfie(
  sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>,
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const messageId = newId()
  const imageId = newId()
  const { jobId, userId, args } = job

  await sql`
    insert into nina_messages (id, user_id, role, text, source, turn_id, reply_to_id)
    values (
      ${messageId}, ${userId}, 'nina', ${ninaImageCaption(jobId)}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
    )
  `
  await sql`
    insert into nina_message_images
      (id, user_id, message_id, kind, blob_url, pathname, width, height, bytes, description, prompt, sort_order)
    values (
      ${imageId}, ${userId}, ${messageId}, 'generated', ${image.blobUrl}, ${image.pathname},
      ${NINA_IMAGE_WIDTH}, ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${args.scene}, ${args.sidecar}, 0
    )
  `
  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = ${result.costMicroUsd}, tool_calls = 1
    where id = ${jobId} and user_id = ${userId}
  `
}

/**
 * Success, for an **avatar** (phases 13 and 15).
 *
 * The two statements are one `sql.transaction`, in this order, because phase 1's partial unique
 * index `nina_avatars_user_current_unq` makes it mandatory rather than merely tidy: inserting a
 * second `is_current` row before un-currenting the first violates the index. This mirrors phase 1's
 * `insertNinaAvatarAsCurrent`, which uses `db.batch` for the same reason — and re-implementing it
 * here is the duplication Risk 1 names.
 *
 * `announced_at` is left NULL, and **that NULL IS phase 10's `avatar_changed` trigger.** This is the
 * only place a *generated* avatar becomes announceable, and it is reached only on success — which is
 * the structural half of "her announcement must not fire for a photograph that does not exist".
 *
 * No `nina_messages` row. Nobody asked in chat; phase 10's next tick is what makes her mention it.
 */
async function finishAvatar(
  sql: {
    (s: TemplateStringsArray, ...v: unknown[]): Promise<unknown[]>
    transaction: (queries: unknown[]) => Promise<unknown[]>
  },
  job: ClaimedJob,
  image: { blobUrl: string; pathname: string; bytes: number },
  result: { costMicroUsd: number; latencyMs: number },
): Promise<void> {
  const { jobId, userId, args } = job
  const avatarId = newId()
  const source = args.source === 'admin' ? 'admin' : 'generated'

  await sql.transaction([
    sql`update nina_avatars set is_current = false where user_id = ${userId} and is_current = true`,
    sql`
      insert into nina_avatars
        (id, user_id, blob_url, pathname, width, height, bytes, source, description, is_current, announced_at)
      values (
        ${avatarId}, ${userId}, ${image.blobUrl}, ${image.pathname}, ${NINA_IMAGE_WIDTH},
        ${NINA_IMAGE_HEIGHT}, ${image.bytes}, ${source}, ${args.scene}, true, null
      )
    `,
  ])

  await sql`
    update nina_turns
    set status = 'ok', error_code = null, latency_ms = ${result.latencyMs},
        cost_micro_usd = ${result.costMicroUsd}, tool_calls = 1
    where id = ${jobId} and user_id = ${userId}
  `
}

/**
 * Failure. **Two outcomes, and the choice is the retry budget.**
 *
 * If attempts remain, the row goes back to `queued` and stays `pending`, so the next backstop run
 * (≤10 minutes) tries again with the SAME prompt and the SAME seed — which is why both are stored
 * rather than rebuilt. Nothing is said to the runner: her bubble still says she is taking the photo,
 * and she is.
 *
 * If the budget is spent, the job is terminal and **the apology goes in with it, in the same
 * function**, because a caller that could mark a job failed without saying anything is a caller that
 * will eventually do so. An **avatar** job posts nothing — nobody asked for it in chat — which is
 * the same rule `failNinaImageJob` and both sweeps follow.
 *
 * `cost_micro_usd` is written for every kind, because a call that reached the provider and then timed
 * out was very probably billed. Guessing high is the honest direction for a cost log.
 */
async function closeFailed(
  sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>,
  job: ClaimedJob,
  outcome: { kind: NinaImageFailure; latencyMs: number; detail: string },
): Promise<'retry' | 'gave-up'> {
  const { jobId, userId, args, attempts } = job
  console.warn('[nina-worker] generation failed', {
    jobId,
    kind: outcome.kind,
    attempts,
    detail: outcome.detail,
  })

  if (attempts < NINA_IMAGE_MAX_ATTEMPTS) {
    await sql`
      update nina_turns set error_code = 'queued', latency_ms = ${outcome.latencyMs}
      where id = ${jobId} and user_id = ${userId} and status = 'pending'
    `
    return 'retry'
  }

  if (args.purpose === 'selfie') {
    await sql`
      insert into nina_messages (id, user_id, role, text, source, turn_id, reply_to_id)
      values (
        ${newId()}, ${userId}, 'nina', ${ninaImageApology(outcome.kind, jobId)}, 'chat', ${jobId},
        (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
      )
    `
  }
  await sql`
    update nina_turns
    set status = 'failed', error_code = ${outcome.kind}, latency_ms = ${outcome.latencyMs},
        cost_micro_usd = ${NINA_IMAGE_COST_MICRO_USD}, tool_calls = 1
    where id = ${jobId} and user_id = ${userId} and status = 'pending'
  `
  return 'gave-up'
}
```

**Code (continues in the same file) — `runOneJob`, and `main`:**

```ts
/**
 * Claim, generate, close. Returns what happened so `main` can log one line per job and so the test
 * can assert the branches without a network.
 *
 * **A store failure is a `transport` failure and not a crash.** The picture exists and we could not
 * keep it, which from the runner's side is "the photo did not come through" — and the money is
 * already spent, which is why it is still logged and still counted against the cap.
 */
export async function runOneJob(
  sql: {
    (s: TemplateStringsArray, ...v: unknown[]): Promise<unknown[]>
    transaction: (queries: unknown[]) => Promise<unknown[]>
  },
  jobId: string | null,
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const job = await claimJob(sql, jobId)
  if (job == null) return 'none'

  console.info('[nina-worker] claimed', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    attempt: job.attempts,
  })

  const outcome = await generate(job.args.prompt, job.args.seed)
  if (!outcome.ok) return closeFailed(sql, job, outcome)

  let image: { blobUrl: string; pathname: string; bytes: number }
  try {
    image = await store(job.userId, job.args.purpose, outcome.b64)
  } catch (cause) {
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `store: ${String(cause)}`,
    })
  }

  try {
    if (job.args.purpose === 'avatar') {
      await finishAvatar(sql, job, image, outcome)
    } else {
      await finishSelfie(sql, job, image, outcome)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * Handoff 6 (the `nina/` reaper) exists for.
     */
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `finish: ${String(cause)}`,
    })
  }

  console.info('[nina-worker] done', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    bytes: image.bytes,
    costMicroUsd: outcome.costMicroUsd,
    latencyMs: outcome.latencyMs,
  })
  return 'ok'
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { jobId, dryRun } = parseArgv(argv)
  const sql = neon(process.env.DATABASE_URL as string)

  await preflight(sql)
  if (dryRun) {
    console.info('[nina-worker] preflight ok', { jobId, mode: jobId == null ? 'sweep' : 'job' })
    return 0
  }

  /*
   * With `--job` exactly one job is attempted, because the doorbell named it. Without one, up to
   * `NINA_IMAGE_SWEEP_BUDGET` — a burst of six requests would otherwise make a single scheduled run
   * exceed `timeout-minutes`, and a run killed mid-generation wastes the money it already spent.
   * Three × 78 s ≈ 4 min, inside the 6.
   */
  const budget = jobId == null ? NINA_IMAGE_SWEEP_BUDGET : 1
  let done = 0
  for (let i = 0; i < budget; i++) {
    const result = await runOneJob(sql, jobId)
    if (result === 'none') break
    done += 1
  }

  /*
   * Exit 0 even when nothing was found. The scheduled backstop finds nothing on the overwhelming
   * majority of its runs — that is what a backstop is — and a red workflow every ten minutes is a
   * workflow nobody reads. A genuine problem (missing secrets, schema drift) throws out of
   * `preflight` and DOES go red.
   */
  console.info('[nina-worker] finished', { attempted: done })
  return 0
}

/* Run only as a script, so a test can import everything above. `import.meta.main` is Node 24+. */
if (process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error('[nina-worker] fatal', error)
      process.exit(1)
    })
}
```

**Impact:** New script. It is the only file in the repository that names `OPENROUTER_API_KEY` after
this phase, and `scripts/` is not in `check-openrouter-boundary.mjs`'s `DIRS`, so
`ci:openrouter-guard` passes untouched (Requires 8). It reads `process.env` directly because
`lib/env.ts` is `server-only` and alias-imported — the same wall phase 14's plan hit — and validates
by hand in `preflight` instead.

---

### Step 9b: `.github/workflows/nina-image.yml` — the host

**File:** `.github/workflows/nina-image.yml` (new)
**Change:** The whole file. **`.github/workflows/ci.yml` is not touched.**

**Two triggers, and they are not redundant.** `workflow_dispatch` is the normal path and gives a
~2-minute photograph. `schedule` is the backstop that makes the mechanism reliable: it finds a job
whose doorbell was lost and generates the photograph anyway. **That retry is the third Vercel cron
Hobby refused to give us** (two crons, and phase 10 spent the second on `/api/cron/nina`), and it is
the property no HTTP-callback queue could have provided.

**Why `*/10` and not `*/5`.** GitHub's minimum is 5 minutes and it does not promise punctuality, so
the interval is a cost/coverage trade, not a deadline. At `*/10` the backstop is 144 runs a day at
~40 s each ≈ 96 min/day ≈ 2,900 min/month. **This repository is public, so Actions minutes are
unmetered and that number is free.** It is nevertheless chosen with the private-repo number in mind:
if the repo is ever made private, GitHub Free's 2,000 minutes would be exceeded, and the one-line
fix is `*/30` (≈960 min/month) leaning harder on `workflow_dispatch` for latency and on the on-read
sweep for the guarantee. That sentence is the whole migration plan and it is why the interval lives
in one place.

**Code:**

```yaml
# Nina's camera. RU-19: the shipping generation is 78.2 s measured and Vercel Hobby caps a function
# at 60 s in sin1, so this work cannot happen in the app. RU-20: it happens here.
#
# TWO TRIGGERS, ON PURPOSE:
#   workflow_dispatch — the doorbell, rung by lib/nina/imagedispatch.ts inside the chat turn.
#                       The normal path; the photograph lands ~2 minutes after she says "bentar".
#   schedule          — the backstop. It finds a job whose dispatch was lost and generates it
#                       anyway. This is the third Vercel cron Hobby would not give us (two crons,
#                       and phase 10 spent the second), and it is the reason a queue that calls
#                       back into a Vercel function was not chosen: the callback would hit the same
#                       60 s ceiling being escaped here.
#
# The schedule is best-effort by GitHub's own documentation: it is delayed under load and it is
# DISABLED ENTIRELY after 60 days with no repository activity. So it is a good retry engine and a
# bad deadline, which is why lib/nina/imagejobs.ts keeps an independent 20-minute give-up sweep that
# runs on every /nina page load. Do not delete that sweep on the grounds that this exists.
name: nina-image

on:
  workflow_dispatch:
    inputs:
      job_id:
        # The ONLY input, and deliberately opaque. THIS REPOSITORY IS PUBLIC, so dispatch inputs are
        # world-readable in the run log and the Actions UI. The scene prose, the prompt and the user
        # id therefore live in nina_turns.args and never travel as an input; a nanoid names a row
        # that nobody without DATABASE_URL can read.
        description: 'nina_turns.id of the job to run (blank = sweep)'
        required: false
        default: ''
  schedule:
    # Every ten minutes. See the plan's Step 9b for the cost arithmetic and for the one-line change
    # if this repository is ever made private.
    - cron: '*/10 * * * *'

# One camera at a time. A dispatch and a scheduled run firing within seconds of each other would
# both claim safely — the conditional UPDATE in claimJob is the real lock — but queueing the second
# rather than racing it keeps the logs readable and the bill predictable. cancel-in-progress is
# FALSE: cancelling a run that is 60 seconds into a paid generation throws the money away.
concurrency:
  group: nina-image
  cancel-in-progress: false

permissions:
  # The worker reads Neon and Blob with its own secrets and touches nothing in the repository. It
  # does not need a token at all, so it gets none.
  contents: read

jobs:
  generate:
    runs-on: ubuntu-latest
    # NINA_WORKER_TIMEOUT_MINUTES in lib/nina/imagerecipe.ts. It must exceed
    # NINA_WORKER_CALL_TIMEOUT_MS (240 s) plus setup, and NINA_IMAGE_RECLAIM_MS (7 min) must exceed
    # it, so a job killed here cannot be mistaken for one still running.
    # tests/nina.imagerecipe.test.ts asserts that chain.
    timeout-minutes: 6
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      # --omit=dev is not only faster, it SIDESTEPS the EBADPLATFORM trap ci.yml documents at
      # length: the lockfile records node_modules/vitest/node_modules/@esbuild/aix-ppc64 without
      # optional:true, and older npm treats it as required. With dev dependencies omitted, vitest is
      # not installed and the entry is never reached — so no `npm i -g npm@12.0.1` pin is needed
      # here. If that ever stops being true, copy ci.yml's pin step rather than dropping --omit=dev:
      # the worker needs only @neondatabase/serverless and @vercel/blob, both runtime dependencies.
      # --ignore-scripts because nothing this script needs is built by a lifecycle hook.
      - name: Install runtime dependencies only
        run: npm ci --omit=dev --ignore-scripts

      # --experimental-strip-types is how scripts/backfill-record-keys.mjs already imports
      # lib/records/catalog.ts (package.json:30). It is what lets this worker share
      # lib/nina/imagefail.ts and lib/nina/imagerecipe.ts with the app instead of paraphrasing
      # R22's copy and the OpenRouter payload in a second implementation.
      - name: Generate
        run: >-
          node --experimental-strip-types --no-warnings
          scripts/nina-image-worker.ts --job "${{ inputs.job_id }}"
```

**On `inputs.job_id` in a scheduled run.** `inputs` is unset for a `schedule` event, so
`"${{ inputs.job_id }}"` interpolates to the empty string and `parseArgv` reads that as "sweep" —
which is exactly why `parseArgv` refuses an empty `--job` value rather than treating it as an id.
One expression covers both triggers, and there is no second `run:` line to keep in sync.

**Code — `package.json`, two entries after line 34 (`"capture:shoot"`):**

```json
    "nina:worker": "node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts",
    "nina:worker:dry": "node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --dry-run",
```

**Impact:** A second workflow file. It runs on `push` to nothing and on `pull_request` to nothing, so
it never lengthens CI. It consumes no Actions minutes on this public repository.

---

### Step 10: `app/nina/page.tsx` — one added await, and no watcher

**File:** `app/nina/page.tsx` (phase 4's `NinaPage`)
**Change:** one import and one entry in the existing `Promise.all`.

**The first draft's `NinaImageJobWatcher` is withdrawn, and this is the reasoning.** It was a client
component that polled `GET /api/nina/image` every 3 s and called `router.refresh()` when a job
landed. Two things changed:

1. **The route it polled no longer exists.** RU-20 removed the route handler; adding one back purely
   to serve a poll would re-open the D7 deviation this draft closed, for an optimisation.
2. **The window it was optimising got longer, not shorter.** It was designed for a 20–60 s wait. The
   real wait is ~2 minutes, and a 3-second poll across two minutes is 40 invocations to learn nothing
   on 39 of them — which is the exact argument phase 10 used to reject polling, and at this duration
   it now applies.

**What the runner sees instead, and why it is enough.** Her own bubble says she is taking the photo.
That bubble is a better progress indicator than a spinner because it cannot outlive its meaning. The
photograph and the apology are real `nina_messages` rows written server-side whether or not a browser
is open, so **any** navigation shows them — and phase 10 already ships two mechanisms that surface a
new Nina message without one: the unread badge on the tab, and Web Push in phase 11. A photograph
arriving is a new message from Nina, so it rides those for free. **R22 holds with no client code at
all**, which is the property the first draft claimed for the watcher and can now claim for its
absence. If live-refresh is ever wanted, it belongs in phase 10's or 11's notification path, not in a
poll of its own — recorded as Handoff 5.

**Code — the new import:**

```ts
import { listOpenNinaImageJobs } from '@/lib/nina/imagejobs'
```

**Code — the body, with the addition marked:**

```tsx
export default async function NinaPage() {
  const userId = await requireUserId()
  /*
   * Two reads, concurrently. `listOpenNinaImageJobs` sweeps stale image jobs first (phase 12), so
   * ARRIVING ON THIS PAGE IS ITSELF R22's LAST GUARANTEE: a job that GitHub never ran gets its
   * apology written by the act of the runner coming to look for the photo. That is the one
   * mechanism in the phase that still works when Actions is disabled, the PAT is revoked, or the
   * `schedule:` has been switched off for repository inactivity.
   *
   * The returned rows are deliberately unused here — the sweep is the point, and phase 15 is what
   * renders "generating…". Invariant 4 holds: two indexed reads and a handful of UPDATEs, no model
   * call awaited in a render path. The generation itself is on a GitHub runner.
   */
  const [rows] = await Promise.all([
    listNinaMessages(userId, { limit: CHAT_HISTORY_LIMIT }),
    listOpenNinaImageJobs(userId),
  ])

  const initial: ChatMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role === 'nina' ? 'nina' : 'user',
    body: row.body,
    dayISO: jakartaDayOf(row.createdAt),
    state: 'sent',
  }))

  return (
    <AppShell bottomGap="chat">
      <header className="mb-5 flex items-center gap-3">
        <NinaAvatar size="md" />
        <div className="min-w-0">
          <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">Nina</h1>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-3">
            Reads every run. Says what she thinks.
          </p>
        </div>
      </header>

      <ChatScreen initial={initial} todayISO={todayInJakarta()} />
    </AppShell>
  )
}
```

**Impact:** The page gains one concurrent read. `ChatScreen`, `MessageList`, `MessageBubble`,
`Composer` and `TypingIndicator` are all untouched, and **no new component is added to phase 4's
screen** — which is what keeps this edit reviewable as one line.

---

### Step 11: the tests

**File:** `tests/nina.imagefail.test.ts` (new)
**Change:** R22's classification and copy, with no network and no database. **Carried over from the
first draft unchanged.** This is the file that makes the exit criterion "a forced timeout, a forced
policy refusal and a forced HTTP error each end in a DISTINCT Nina message with no technical
language" a checked property.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  classifyImageFailure,
  NINA_IMAGE_APOLOGIES,
  NINA_IMAGE_CAPPED_NOTE,
  NINA_IMAGE_CAPTIONS,
  NINA_IMAGE_FAILURES,
  ninaImageApology,
  ninaImageCaption,
  pickLine,
} from '@/lib/nina/imagefail'

/** Anything that would betray the machine to the runner. R22 in one array. */
const TECHNICAL = [
  'error', 'failed', 'timeout', 'timed out', 'http', 'api', 'server', 'openrouter', 'qwen',
  'policy', 'quota', 'limit', 'retry', 'try again', 'null', 'undefined', 'exception', 'status',
  'request', 'github', 'sistem',
]

describe('classifyImageFailure', () => {
  it('an abort is a timeout', () => {
    expect(classifyImageFailure({ aborted: true })).toBe('timeout')
  })

  it("AbortSignal.timeout's own error is a timeout", () => {
    const cause = new Error('The operation was aborted due to timeout')
    cause.name = 'TimeoutError'
    expect(classifyImageFailure({ cause })).toBe('timeout')
  })

  it('a 400 whose body names a content policy is a refusal', () => {
    expect(
      classifyImageFailure({
        httpStatus: 400,
        body: '{"error":{"message":"Image rejected by content policy"}}',
      }),
    ).toBe('policy')
  })

  it('a 400 whose body is OUR bug is transport, not a refusal', () => {
    // She must not imply she was refused when we sent a malformed payload.
    expect(
      classifyImageFailure({ httpStatus: 400, body: '{"error":{"message":"unknown field n2"}}' }),
    ).toBe('transport')
  })

  it('a 429 is transport, never policy', () => {
    expect(classifyImageFailure({ httpStatus: 429, body: 'rate limit exceeded' })).toBe('transport')
  })

  it('a 500 is transport', () => {
    expect(classifyImageFailure({ httpStatus: 500, body: 'upstream error' })).toBe('transport')
  })

  it('a 200 with no image and a refusal in the body is a refusal', () => {
    expect(classifyImageFailure({ httpStatus: 200, body: '{"data":[],"message":"flagged"}' })).toBe(
      'policy',
    )
  })

  it('a 200 with no image and no refusal is transport', () => {
    expect(classifyImageFailure({ httpStatus: 200, body: '{"data":[]}' })).toBe('transport')
  })

  it('a refused workflow_dispatch is transport', () => {
    // RU-20's new failure mode, classified through the same function.
    expect(
      classifyImageFailure({ cause: new Error('dispatch HTTP 404 {"message":"Not Found"}') }),
    ).toBe('transport')
  })
})

describe('the apologies', () => {
  it('every failure kind has at least one line', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      expect(NINA_IMAGE_APOLOGIES[kind].length).toBeGreaterThan(0)
    }
  })

  it('the three forced kinds say three DISTINCT things', () => {
    // The exit criterion, literally. `stale` is allowed to read like `timeout` to the runner — it is
    // the same experience — but the three we can force must not collapse into one shrug.
    const lines = (['timeout', 'policy', 'transport'] as const).map((kind) =>
      ninaImageApology(kind, 'JOB000000001'),
    )
    expect(new Set(lines).size).toBe(3)
  })

  it('no apology contains a technical word', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      for (const line of NINA_IMAGE_APOLOGIES[kind]) {
        const haystack = line.toLowerCase()
        for (const word of TECHNICAL) expect(haystack).not.toContain(word)
      }
    }
  })

  it('no apology offers a retry button or names a system', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      for (const line of NINA_IMAGE_APOLOGIES[kind]) {
        expect(line).not.toMatch(/\b(coba lagi|refresh|reload|klik|tombol|button)\b/i)
      }
    }
  })

  it('every apology is short and lower-case, like a chat message', () => {
    for (const kind of NINA_IMAGE_FAILURES) {
      for (const line of NINA_IMAGE_APOLOGIES[kind]) {
        expect(line.length).toBeLessThanOrEqual(90)
        expect(line[0]).toBe(line[0]!.toLowerCase())
      }
    }
  })

  it('is deterministic per job id', () => {
    expect(ninaImageApology('timeout', 'abc123abc123')).toBe(
      ninaImageApology('timeout', 'abc123abc123'),
    )
  })

  it('spreads across the available lines', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `job${String(i).padStart(8, '0')}`)
    const seen = new Set(ids.map((id) => ninaImageApology('timeout', id)))
    expect(seen.size).toBe(NINA_IMAGE_APOLOGIES.timeout.length)
  })
})

describe('the captions and the cap note', () => {
  it('a caption is never empty — an empty bubble is not a message', () => {
    for (const caption of NINA_IMAGE_CAPTIONS) expect(caption.trim().length).toBeGreaterThan(0)
    expect(ninaImageCaption('zzzzzzzzzzzz').trim().length).toBeGreaterThan(0)
  })

  it('the cap note never gives her a number to quote', () => {
    // Invariant 2: a configuration constant is not a fact about him.
    expect(NINA_IMAGE_CAPPED_NOTE).not.toMatch(/\d/)
    expect(NINA_IMAGE_CAPPED_NOTE.toLowerCase()).toContain('do not mention a limit')
  })
})

describe('pickLine', () => {
  it('throws on an empty list rather than returning undefined', () => {
    expect(() => pickLine([], 'k')).toThrow()
  })
})
```

---

**File:** `tests/nina.imagerecipe.test.ts` (new)
**Change:** The payload's two surviving ported facts, the pathname convention, the Jakarta day
boundary, the cost reader, the prompt, **and the whole threshold inequality chain.**

**This file is where the two hosts are kept honest about each other.** The worker's `fetch` runs on a
machine no test touches, so asserting `buildImageRequestBody` is the only way the payload can be
checked at all — and it is sufficient, because that function is literally what the worker sends.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { buildNinaImagePrompt, sidecarText } from '@/lib/nina/imagegen'
import {
  buildImageRequestBody,
  jakartaDayStart,
  ninaImagePathname,
  NINA_IMAGE_ASPECT,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_PATHNAME_RE,
  NINA_IMAGE_RESOLUTION,
  NINA_IMAGE_STALE_MS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_SWEEP_BUDGET,
  NINA_WORKER_CALL_TIMEOUT_MS,
  NINA_WORKER_TIMEOUT_MINUTES,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '@/lib/nina/imagerecipe'

describe('the payload — the two surviving ported facts', () => {
  const body = buildImageRequestBody({ prompt: 'a photograph', seed: 42 })

  it('targets /images/generations with the right model', () => {
    // FACT 1. There is no /images/edits on this provider, and chat-completions with `modalities`
    // is refused by this model. Verified twice by this plan set's probes.
    expect(OPENROUTER_IMAGE_URL).toBe('https://openrouter.ai/api/v1/images/generations')
    expect(body.model).toBe(NINA_IMAGE_MODEL)
  })

  it('sends resolution and aspect_ratio, never size', () => {
    // FACT 2. `size` is ignored and the default is 2K — a 2048-px master, after the money is spent.
    expect(body.resolution).toBe(NINA_IMAGE_RESOLUTION)
    expect(body.aspect_ratio).toBe(NINA_IMAGE_ASPECT)
    expect(body.size).toBeUndefined()
  })

  it('sends the seed it was given', () => {
    // FACT 3. Honoured by this model, so a retry reproduces the same photograph.
    expect(body.seed).toBe(42)
    expect(body.n).toBe(1)
  })

  it('sends NO reference image (RU-18)', () => {
    // The anchor is dropped. `input_references` doubled the latency (148.9 s vs 78.2 s) for a
    // property the user deferred knowingly. Do not add it back.
    expect(body.input_references).toBeUndefined()
    expect(body.messages).toBeUndefined()
    expect(body.modalities).toBeUndefined()
  })
})

describe('the prompt', () => {
  it('carries her appearance, the scene, and the photographic style', () => {
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'on the track' })
    expect(prompt).toContain('on the track')
    expect(prompt).toContain('high ponytail') // NINA_APPEARANCE, phase 2
    expect(prompt).toContain('Realistic photograph')
  })

  it('puts the mood AFTER the scene, as a refinement', () => {
    const prompt = buildNinaImagePrompt({
      purpose: 'selfie',
      scene: 'on the track',
      mood: 'smug, out of breath',
    })
    expect(prompt.indexOf('smug')).toBeGreaterThan(prompt.indexOf('on the track'))
  })

  it('the avatar variant asks for head and shoulders', () => {
    expect(buildNinaImagePrompt({ purpose: 'avatar', scene: 'x' })).toContain('head and shoulders')
  })

  it('never claims a reference image is authoritative', () => {
    // The first draft's subject line said "this is the same woman as the reference image". RU-18
    // removed the reference, and an instruction to defer to an absent image degrades the prompt.
    const prompt = buildNinaImagePrompt({ purpose: 'selfie', scene: 'x' })
    expect(prompt.toLowerCase()).not.toContain('reference')
  })

  it('the sidecar records prompt, model and seed, and says there is no reference', () => {
    const text = sidecarText({ prompt: 'p', seed: 42, purpose: 'selfie' })
    expect(text).toContain(NINA_IMAGE_MODEL)
    expect(text).toContain('seed:       42')
    expect(text).toContain('reference:  none (RU-18)')
    expect(text).toContain('--- prompt as sent ---')
  })
})

describe('the pathname', () => {
  it('is under nina/<userId>/ and matches the exported regex', () => {
    const path = ninaImagePathname('user00000001', 'selfie', 'abcdefghijkl')
    expect(path).toBe('nina/user00000001/selfie-abcdefghijkl.png')
    expect(NINA_IMAGE_PATHNAME_RE.test(path)).toBe(true)
  })

  it("admits phase 14's .jpg avatar", () => {
    expect(NINA_IMAGE_PATHNAME_RE.test('nina/user00000001/avatar-abcdefghijkl.jpg')).toBe(true)
  })
})

describe('the reported cost', () => {
  it('prefers usage.cost, in micro-USD', () => {
    // The index measured $0.040 with `usage.cost` present. This is the field name to trust.
    expect(readReportedCostMicroUsd({ cost: 0.04 })).toBe(40_000)
  })

  it('accepts total_cost as a second spelling', () => {
    expect(readReportedCostMicroUsd({ total_cost: 0.055 })).toBe(55_000)
  })

  it('falls back to null, not to zero, when the provider says nothing', () => {
    // Null makes the caller substitute the constant. Zero would silently report a free image.
    expect(readReportedCostMicroUsd(undefined)).toBeNull()
    expect(readReportedCostMicroUsd({})).toBeNull()
    expect(readReportedCostMicroUsd({ cost: 'free' })).toBeNull()
  })

  it('the constant is the measured price, as a fallback', () => {
    expect(NINA_IMAGE_COST_MICRO_USD).toBe(40_000)
  })
})

describe('jakartaDayStart', () => {
  it('rolls over at 00:00 +07:00, not at UTC midnight', () => {
    // 2026-09-03T16:30:00Z is 2026-09-03 23:30 in Jakarta — still the 3rd.
    expect(jakartaDayStart(new Date('2026-09-03T16:30:00Z')).toISOString()).toBe(
      '2026-09-02T17:00:00.000Z',
    )
    // 2026-09-03T17:30:00Z is 2026-09-04 00:30 in Jakarta — a new day, a fresh quota.
    expect(jakartaDayStart(new Date('2026-09-03T17:30:00Z')).toISOString()).toBe(
      '2026-09-03T17:00:00.000Z',
    )
  })

  it('is idempotent on its own output', () => {
    const start = jakartaDayStart(new Date('2026-09-03T16:30:00Z'))
    expect(jakartaDayStart(start).toISOString()).toBe(start.toISOString())
  })
})

describe('the threshold chain', () => {
  // Every one of these is derived in the plan's §The threshold arithmetic. They are asserted here so
  // an edit to one cannot silently break the ordering the whole R22 guarantee rests on.

  it('the call timeout is at least 2x the measured 78.2 s', () => {
    expect(NINA_WORKER_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(160_000)
  })

  it("the workflow's job ceiling exceeds the call timeout plus setup", () => {
    expect(NINA_WORKER_TIMEOUT_MINUTES * 60_000).toBeGreaterThan(NINA_WORKER_CALL_TIMEOUT_MS + 60_000)
  })

  it('a running job is only reclaimed after it cannot still be running', () => {
    // > the workflow ceiling, or a live generation would be claimed twice and billed twice.
    expect(NINA_IMAGE_RECLAIM_MS).toBeGreaterThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
  })

  it('the dispatch grace is shorter than the reclaim', () => {
    expect(NINA_IMAGE_DISPATCH_GRACE_MS).toBeLessThan(NINA_IMAGE_RECLAIM_MS)
  })

  it('the app gives up only after the retries can have been exhausted', () => {
    // Otherwise she would apologise while a runner was still generating, and the photograph would
    // land after the apology. THIS is the inequality R22 depends on most.
    expect(NINA_IMAGE_STALE_MS).toBeGreaterThan(NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS)
  })

  it('a sweep run cannot exceed the workflow ceiling', () => {
    // 3 x 78 s at the measured latency, inside 6 minutes.
    expect(NINA_IMAGE_SWEEP_BUDGET * 90_000).toBeLessThan(NINA_WORKER_TIMEOUT_MINUTES * 60_000)
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

---

**File:** `tests/nina.imageworker.test.ts` (new)
**Change:** The worker's two pure decisions: how it reads its argv, and how it turns an OpenRouter
response into an outcome. **No network, no database, no key.**

**Why this file can exist at all:** the worker's `main()` is guarded by an
`import.meta.url === process.argv[1]` check, so importing it runs nothing. That guard is the only
reason the worker is testable, and it must not be removed.

**Code:**

```ts
import { describe, expect, it, vi } from 'vitest'

import { generate, parseArgv } from '../scripts/nina-image-worker.ts'

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

function stubFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('parseArgv', () => {
  it('reads --job', () => {
    expect(parseArgv(['--job', 'abcdefghijkl'])).toEqual({ jobId: 'abcdefghijkl', dryRun: false })
  })

  it('treats an EMPTY --job as a sweep, which is what a scheduled run sends', () => {
    // `${{ inputs.job_id }}` interpolates to '' on a `schedule` event. This is the line that makes
    // one `run:` expression serve both triggers.
    expect(parseArgv(['--job', '']).jobId).toBeNull()
    expect(parseArgv([]).jobId).toBeNull()
  })

  it('refuses a job id that is not an id', () => {
    expect(parseArgv(['--job', "'; drop table nina_turns; --"]).jobId).toBeNull()
    expect(parseArgv(['--job', 'x'.repeat(200)]).jobId).toBeNull()
  })

  it('reads --dry-run', () => {
    expect(parseArgv(['--dry-run']).dryRun).toBe(true)
  })
})

describe('generate', () => {
  it('returns the image and the reported cost', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { cost: 0.04 } }), {
        status: 200,
      }),
    )
    const outcome = await generate('a photograph', 42)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.b64).toBe(PNG_B64)
      expect(outcome.costMicroUsd).toBe(40_000)
    }
  })

  it('sends exactly the recipe body, and no reference image', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
    )
    await generate('a photograph', 42)
    const init = fn.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.resolution).toBe('1K')
    expect(body.aspect_ratio).toBe('3:4')
    expect(body.input_references).toBeUndefined()
  })

  it('a forced TIMEOUT never throws and reports timeout', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const err = new Error('aborted')
    err.name = 'TimeoutError'
    stubFetch(err)
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'timeout' })
  })

  it('a forced POLICY refusal reports policy', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('{"error":{"message":"blocked by safety policy"}}', { status: 400 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'policy' })
  })

  it('a forced HTTP error reports transport', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('bad gateway', { status: 502 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'transport' })
  })

  it('a 200 with no image is not a success', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response('{"data":[]}', { status: 200 }))
    expect(await generate('p', 1)).toMatchObject({ ok: false, kind: 'transport' })
  })

  it('falls back to the cost constant when the provider omits usage', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    stubFetch(new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }))
    const outcome = await generate('p', 1)
    if (outcome.ok) expect(outcome.costMicroUsd).toBe(40_000)
  })
})
```

**Impact:** Three unit test files, no network, no database, no key. **`vitest` must be able to import
a `.ts` file from `scripts/`** — it can, because vitest transforms TypeScript itself and needs no
`--experimental-strip-types`; the flag is only for plain `node`. If `vitest.config.ts` restricts
`include` to `tests/**`, that is about which files are *collected*, not which can be *imported*, so
nothing there changes.

---

## Setup — the one list to hand him

**RU-21 says no human in the loop during design or implementation.** Nothing on this list is a
decision; every item is a credential or a toggle that only the account owner can physically create.
Implementation should do everything else first, then hand over exactly this.

1. **Create a fine-grained personal access token.** GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token.
   - Resource owner: `miftahulmahfuzh`
   - Repository access: **Only select repositories** → `run-insights`
   - Repository permissions: **Actions: Read and write**. Nothing else — not `contents`, not
     `workflows`.
   - Expiration: the longest offered. A silently expired token is a 401 in
     `dispatchNinaImageJob`, which shows up as her apologising for bad signal every time. Item 6
     below is how to notice.
2. **Put that token on Vercel** as `GITHUB_DISPATCH_TOKEN`, for Production and Preview.
   `scripts/vercel-env-push.sh` is the existing way to do this.
3. **Add the same value, plus `OPENROUTER_API_KEY`, to `.env.local`** so the local runner and
   `npm run nina:worker:dry` work.
4. **Add three repository secrets** — GitHub → the repo → Settings → Secrets and variables →
   Actions → New repository secret:
   - `DATABASE_URL` — the **pooled** Neon URL, the same value Vercel has.
   - `BLOB_READ_WRITE_TOKEN` — from the Vercel Blob store.
   - `OPENROUTER_API_KEY` — the same key `tools/gen_badge_art.py` uses.
   These are the worker's whole credential set. **Repository secrets are masked in logs and are not
   exposed to workflows triggered from forks**, and `workflow_dispatch` can only be triggered by a
   token with write access, so there is no fork-PR path to them. The dispatch input carries only an
   opaque job id, which is why nothing sensitive appears in the public run log.
5. **Confirm Actions is enabled** for the repository (Settings → Actions → General → "Allow all
   actions"). It is, since `ci.yml` runs, but a dispatch 403 means this was turned off.
6. **Merge the workflow to `main` before expecting a dispatch to work.** `workflow_dispatch`
   resolves the workflow file from the default branch, so a dispatch against a feature branch
   returns 404 with `{"message":"Not Found"}`. This is the single most likely first-run surprise.

That is the entire list. Everything after it is automatic.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint
```

`format` first: `prettier-plugin-tailwindcss` sorts class strings and this phase writes almost none,
but `format:check` is a CI gate and hand-ordered anything is noise in review. **Prettier also
formats `.github/workflows/*.yml`**, so the new workflow file must be run through it or
`format:check` fails.

**Tests:**

```
npm test
npm run ci:openrouter-guard
npm run ci:llm-payload-guard
npm run ci:client-secret-guard
npm run ci:data-layer-guard
npm run badges:check
```

`ci:openrouter-guard` must pass **with phase 1's narrowed boundary and no further exemption.** After
this phase the literal `OPENROUTER_API_KEY` appears in exactly one new place —
`scripts/nina-image-worker.ts` — and `scripts/` is not among the guard's `DIRS`. Confirm by hand as
well as by the guard:

```
grep -rn 'OPENROUTER_API_KEY' app components lib | grep -v '^lib/env.ts'
grep -rn 'GITHUB_DISPATCH_TOKEN' app components lib | grep -v '^lib/env.ts' | grep -v '^lib/nina/imagedispatch.ts'
grep -rn 'NEXT_PUBLIC_' app components lib
```

The first must print nothing (the app never names the OpenRouter key any more — the worker does).
The second must print nothing. The third must print nothing, ever (invariant 10).

**Preflight, before anything is dispatched:**

```
npm run nina:worker:dry
```

It must print `[nina-worker] preflight ok`. A `schema drift — missing: nina_turns.args` here means
phase 1's `args jsonb` (Requires 2) has not landed or has not been migrated; a `missing …` means a
secret is absent. **Run this once against production's `DATABASE_URL` too**, because that is the
database the workflow will write.

**Manual check — the happy path.** With everything from §Setup in place and the workflow merged to
`main`, open `/nina` in production and send:

> ini foto gw abis lari tadi. foto lu mana?

Expect, in order:

1. One to four bubbles within ~15 s, the last of which says she is taking the photo now.
2. A run appearing in the repo's Actions tab within seconds, named `nina-image`, triggered
   `workflow_dispatch`.
3. Within ~2 to 2.5 minutes, a second message in the chat carrying the photograph with a short
   caption. Reload if the tab was open when it landed — there is no live-refresh, by design
   (Step 10).

Then check the rows:

```
psql "$DATABASE_URL" -c "select id,status,error_code,latency_ms,cost_micro_usd,args->>'purpose' as purpose,args->>'attempts' as attempts from nina_turns where kind='image' order by created_at desc limit 5;"
psql "$DATABASE_URL" -c "select kind,pathname,width,height,bytes,left(prompt,60) from nina_message_images order by created_at desc limit 3;"
```

The `nina_turns` row must be `status='ok'`, `error_code` NULL, `cost_micro_usd` ≈ 40000 **read from
`usage.cost` and not from the constant** (check the workflow log's `costMicroUsd` line), and
`latency_ms` in the 60 000–120 000 range. The image row must be `kind='generated'`, its `pathname`
under `nina/<userId>/`, and its `prompt` must be the sidecar.

**Look at the photograph — but not at the face.** RU-18 means face fidelity is explicitly **not** a
criterion. What to check is that it is a plausible casual phone photograph of a young Indonesian
woman in running clothes, in the scene she described, with no text, watermark or border. The probe's
output (`nina-selfie-unanchored.png` in the planning session's scratchpad) is the reference for what
"good" looks like. **If someone reports "her face changed", that is expected behaviour and a
deferred feature, not a bug.**

**Manual check — the cap.** Send seven photo requests in one Jakarta day. The seventh must produce
her own refusal, in her own register, with no number in it, and **no seventh `nina_turns` row**:

```
psql "$DATABASE_URL" -c "select count(*) from nina_turns where kind='image' and created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';"
```

**Manual check — the backstop, which is the whole reliability claim.** Insert a job by hand with the
doorbell never rung, then wait for the schedule:

```
psql "$DATABASE_URL" -c "insert into nina_turns (id,user_id,kind,model,status,error_code,tool_calls,args) values ('TESTJOB00001','<userId>','image','qwen/qwen-image-3-pro','pending','queued',0, '{\"purpose\":\"selfie\",\"scene\":\"sitting on the kerb after a 10k\",\"mood\":null,\"prompt\":\"A casual smartphone photograph. SCENE: sitting on the kerb after a 10k\",\"seed\":42,\"replyToId\":null,\"source\":\"chat\",\"attempts\":0,\"sidecar\":\"manual test\"}'::jsonb);"
```

Within ten minutes a scheduled `nina-image` run must claim `TESTJOB00001`, generate, and post the
photograph. **Nothing dispatched it.** That is the mechanism a queue calling back into Vercel could
not have provided, and it is worth watching happen once.

**Manual check — the four failures.** All four are covered by the unit tests, but force the two that
cross a network boundary at least once, because the thing being verified is that a MESSAGE lands:

1. **A refused dispatch** — set `GITHUB_DISPATCH_TOKEN` on Vercel to `ghp_invalid`, ask for a photo.
   Her apology must appear **within seconds**, not minutes: `fireNinaImageDispatch` closes the job
   inline. Restore the token afterwards.
2. **A policy refusal / an HTTP error** — temporarily point `OPENROUTER_IMAGE_URL` at a stub
   returning `400 {"error":{"message":"content policy"}}`, then `502`. Each must end in a
   **different** message from Nina, and note that with `NINA_IMAGE_MAX_ATTEMPTS = 2` the first
   failure only re-queues — **the apology arrives after the second attempt**, so allow one backstop
   interval.
3. **Stale** — insert a job row by hand with `created_at = now() - interval '30 minutes'`,
   `status='pending'`, `error_code='running'`, `args->>'attempts' = '2'` (so the worker will not
   claim it), and load `/nina`. Arriving on the page must produce the `stale` apology and flip the
   row to `failed`/`stale`.
4. **An avatar job must stay silent.** Insert the same row with `args->>'purpose' = 'avatar'` and
   load `/nina`. The row must flip to `failed`/`stale` and **no `nina_messages` row may appear** —
   nobody asked for it in chat. This is the property phases 13 and 15 depend on.

Each visible message must be in Indonesian, with no error code, no retry button, no stack trace and
no English technical word.

**Exit criteria:**

- A photo request produces a real photograph, generated **outside Vercel**, stored under
  `nina/<userId>/`, with a `nina_message_images` row carrying the sidecar in `prompt` and the scene
  in `description`, and a `nina_turns` row whose `cost_micro_usd` came from `usage.cost`.
- **A job whose dispatch never happened is generated anyway**, by the scheduled backstop, with no
  Vercel cron involved.
- The `n+1`th request in one Jakarta day is refused by **Nina, in character**, with no number, and
  costs nothing.
- A refused dispatch, a forced policy refusal, a forced HTTP error and a hand-inserted stale job
  each end in a chat message from her with no technical language — and the refused dispatch does so
  within seconds rather than minutes.
- **An avatar job that fails writes nothing and says nothing**, and `generateNinaAvatar` on success
  returns `{ ok: true, state: 'dispatched' }` and leaves `announced_at` NULL on the row the worker
  writes.
- **No `nina_turns` row can stay `status='pending'` for longer than `NINA_IMAGE_STALE_MS` plus one
  page view.** There is no spinner in the codebase to outlive it — no client component was added.
- Every `ci:*` guard passes, `npm test` is green, `npm run typecheck` is clean, and
  `npm run nina:worker:dry` prints `preflight ok` against production.

---

## Handoffs

Work found and deliberately left to its owner.

1. **Rendering a generated image in the chat → Phase 6.** It owns `MessageBubble`'s image slot and
   must render `nina_message_images` for **both** `kind = 'upload'` and `kind = 'generated'`. This
   phase writes the rows and never a component. **6 is now in this phase's `depends_on`.**
2. **`set_avatar` → Phase 13,** and it must extend **`NINA_CHAT_TOOL_SET`**, not
   `NINA_CORE_TOOL_SET`, and update the same one line in `lib/nina/actions.ts`. Two independent
   overrides of `toolSet` would silently drop one of the two tools.
3. **The promise evaluator → Phase 13, and it needs a small change from the first draft's
   assumption.** It calls `generateNinaAvatar({ source: 'generated' })`, which now returns
   `{ ok: true, jobId, state: 'dispatched' }` rather than a finished avatar. **It may not read the
   new avatar back in the same invocation.** The good news is that it does not need to: phase 10's
   `avatar_changed` trigger already fires on `announced_at IS NULL` at the next cron tick, and the
   worker writes exactly that row. `getNinaImageJob(userId, jobId)` is provided if the evaluator
   wants to know. Phase 13 — not this phase — also decides whether a failed promise-avatar deserves
   `ninaImageApology(kind, jobId)` posted into the chat; this phase deliberately posts nothing on
   that path, and both sweeps skip it too.
4. **`description` for a hand-uploaded avatar → Phases 14 and 15,** by running phase 6's `glm-4.6v`
   describe pre-pass. This phase writes `description` only for images it generated, from its own
   prompt. That split is stated in phase 1's `nina_avatars` header and honoured here exactly.
5. **Live refresh when a photo lands → Phase 10 or 11, if ever wanted.** The first draft's polling
   watcher is withdrawn (Step 10). A photograph arriving is a new message from Nina, so the unread
   badge (phase 10) and Web Push (phase 11) already surface it. If a live in-page update is wanted
   later, it belongs in whichever of those two owns the notification channel — **not in a poll of
   its own**, and not in a route handler resurrected to serve one.
6. **Reaping orphaned `nina/` blobs → the `reap-orphaned-blobs` skill.** It knows only `shots/`.
   This phase can now leave a genuine orphan: `runOneJob` stores the PNG and then fails to write the
   row, which closes the job as `transport` and abandons the bytes. Rare, bounded by six a day, and
   harmless — but real, unlike in the first draft. `NINA_IMAGE_PATHNAME_RE` is exported so the skill
   has a handle when phase 15's album deletion makes a reaper worth writing.
7. **`generate_image` on the proactive turn → Phase 10, if ever wanted.** One identical `toolSet`
   override in `lib/nina/proactive.ts`. Deliberately not done: an unsolicited selfie at 6pm because
   he missed a Tuesday is not what RU-15 asked for.
8. **The consistent-face feature → a future card, not a phase in this set.** RU-18 deferred it.
   `assets/nina/_anchor.png` is the committed seed; the measured cost of turning it back on is
   `input_references` at +70 s per call (148.9 s vs 78.2 s), which is now affordable because the
   worker has a six-hour ceiling instead of sixty seconds. **That is worth writing down: RU-19's
   consolation is that RU-18's constraint has largely evaporated.** Whoever picks this up needs
   `buildImageRequestBody` to take an optional data URI and the worker to fetch the current
   avatar's bytes — about twenty lines, and no change to the lifecycle.
9. **`vercel.json` is untouched.** No third cron is added, none is available, and the backstop
   schedule is why none is needed. If Vercel Pro is ever bought for unrelated reasons, note that a
   300 s `maxDuration` would make the 78.2 s call fit in a route handler again — but the backstop
   retry would still be worth keeping, so RU-20 should not be reversed casually.
10. **A live, opt-in generation test.** Phase 3 adds `test:live:nina`; a
    `tests/live/ninaimage.live.test.ts` behind `LLM_LIVE_TEST=1` would spend real money to assert
    the payload still works against the provider. Left out on purpose: `npm run nina:worker:dry`
    plus the manual check cover it, and the two probes in this plan set are the record. Add it the
    first time the provider changes a field name under us.

## Risks

1. **The worker writes SQL that duplicates `lib/db/schema.ts`.** `lib/nina/queries.ts` imports
   `server-only` and uses `@/` aliases, so it cannot be stripped and imported; the worker therefore
   spells eleven column names by hand across four tables. A rename in phase 1 would break it
   silently. **Mitigated by the `information_schema` preflight**, which lists every column the
   worker writes and throws `schema drift — missing: …` before touching anything — and because the
   backstop runs every ten minutes, a drift goes red within ten minutes of a deploy rather than at
   3am. This is the single largest cost of RU-20 and it is a deliberate, bounded one. **If it ever
   bites twice, the fix is to extract the four INSERT/UPDATE statements into a pure module that
   returns SQL strings and have both hosts use it** — not to give the worker Drizzle.
2. **`nina_turns.args jsonb` is a migration ask on phase 1 (Requires 2), and this phase does not
   work without it.** The documented fallback (pack the args into the `workflow_dispatch` input)
   publishes the prompt in a public run log and makes the backstop retry impossible, which costs the
   reliability property that justifies RU-20. It is the one Requires here worth defending to the
   reconciler.
3. **`schedule:` is best-effort and GitHub disables it after 60 days of repository inactivity.**
   This is why the app-side 20-minute give-up sweep exists and must not be deleted. It is also worth
   knowing that a long quiet spell silently removes the retry layer: the symptom is `stale`
   appearing in `nina_turns.error_code` where `timeout` used to, and the fix is a push.
4. **Dispatch latency is not bounded by anything we control.** GitHub queues are usually seconds and
   occasionally tens of seconds; an Actions incident makes them minutes. The design absorbs this
   (her bubble promises "a moment", not a duration, and nothing gives up before 20 minutes) but the
   *median* experience is a ~2-minute wait and cannot be improved without changing host. If that
   ever becomes the complaint, the runner-up from RU-20 — a Fly or Railway worker polling the same
   `claimJob` statement — is a drop-in replacement for `scripts/nina-image-worker.ts` with the same
   three environment variables, and nothing else in the phase changes. **The mechanism is swappable
   by construction, which is the hedge against having picked wrong.**
5. **`--experimental-strip-types` is experimental, and it is now load-bearing on a scheduled job.**
   The repo already depends on it (`package.json:30`), and Node 22 emits a warning that
   `--no-warnings` suppresses. If a future Node makes it fail, the worker stops and the on-read
   sweep starts apologising — a visible, correct degradation rather than a silent one. The
   `node-version: '22'` pin in the workflow is what keeps the two in step; do not float it.
6. **A `policy` refusal is a guess about someone else's intent.** `classifyImageFailure` reads the
   response body for refusal vocabulary, which is heuristic. Getting it wrong means she says the
   photo was ugly when the socket died, or the reverse. Both are in character and neither leaks
   anything, so the cost of a misclassification is one slightly wrong sentence — which is why the
   heuristic is acceptable here and would not be in a billing path.
7. **The retry can produce the same failure twice and spend twice.** Same prompt, same seed, same
   provider: if the refusal was about the prompt, attempt two is refused identically and $0.08 is
   gone instead of $0.04. Bounded by `NINA_IMAGE_MAX_ATTEMPTS = 2` and by the daily cap of six, so
   the worst case is $0.24/day either way. **A smarter design would not retry `policy` at all** —
   only `timeout` and `transport` — and that is a genuine improvement worth making if the cost log
   ever shows repeated `policy`. It is left out of the first cut because it adds a branch to the
   most safety-critical function in the worker for money that is already capped.
8. **`status: 'pending'` needs one word from phase 1** (Requires 1). Everything else in the phase is
   independent of it. The documented fallback (`failed` + `error_code='queued'`) works and is worse.

## Rollback

Delete the eight new files —

```
lib/nina/imagefail.ts      lib/nina/imagerecipe.ts    lib/nina/imagegen.ts
lib/nina/imagejobs.ts      lib/nina/imagedispatch.ts  lib/nina/imagetools.ts
lib/nina/avatargen.ts      scripts/nina-image-worker.ts
```

— plus `.github/workflows/nina-image.yml` and the three tests, then revert the four named edits: one
line in `app/nina/page.tsx`, the `toolSet` argument and two imports in `lib/nina/actions.ts`, the
`export` keyword in `lib/nina/turn.ts`, and the two `package.json` script entries. `git revert` of
this phase's commit does all of it.

**Deleting the workflow file is what actually stops the machine.** Everything else is inert without
it: the dispatch would 404, the job would be swept, and she would apologise. So a fast partial
rollback — "stop generating images now, keep the code" — is to disable the workflow in the Actions
tab, or to unset `GITHUB_DISPATCH_TOKEN` on Vercel, which turns every request into a
within-seconds apology rather than an endless bubble. **That is a deliberate property: the kill
switch is honest.**

**There is no migration to undo in this phase.** `nina_turns.args` is phase 1's column and phase 1's
line to keep or drop; `nina_turns`, `nina_messages`, `nina_message_images` and `nina_avatars` are all
phase 1's tables. The only schema-adjacent thing here is one member of a TypeScript union
(`'pending'`), also phase 1's.

**Four residues survive a revert and all are harmless:**

1. **Blob objects** under `nina/<userId>/`. Nothing points at them once their rows are gone, and
   nothing reads them. See Handoff 6 for the reaper.
2. **Rows already written** — `nina_turns` rows with `kind='image'`, and the `nina_messages` /
   `nina_message_images` pairs for photographs already delivered. They render as ordinary messages
   and cost nothing.
3. **The three repository secrets and the PAT.** Revoking the PAT is one click and is worth doing;
   the two Vercel-mirrored secrets are the same values the app already holds.
4. **Any workflow run already in flight.** It will claim a job, generate, and write a photograph
   into a schema that still has the tables. Harmless, and it stops within six minutes.
