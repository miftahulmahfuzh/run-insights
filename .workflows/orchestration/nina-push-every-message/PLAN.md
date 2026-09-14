# Plan: Push a notification for every message Nina sends

**Slug:** nina-push-every-message
**Date:** 2026-09-14 10:27:49 WIB
**Analysis:** `20260914-102749-C7K2_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-push-every-message`
**Branch:** `feature/nina-push-every-message` (base: `origin/main` @ `0c53636`)
**Phases:** 5
**Status:** phase 1/5 complete
**Coordinator:** —

---

## Why

The user's request, verbatim:

> make sure, everytime nina sends a message, whether it is her own initiatives or responding to
> user's message, if user enable notification, it always sends a push notification to my xs max

The Web Push feature is fully built and working. It is wired into **one** of the seven places that
write a message from Nina — the proactive emitter. The most important uncovered one is her reply
to a chat message: `runNinaBackgroundTurn` deliberately returns the Server Action *before* the
model is called so the runner can put the phone down, and then has no way to tell him the reply
landed. The rest of this plan closes the other six, including both writes on the off-platform
backstop host.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | When Nina answers something the runner said, a push notification is sent | 1, 2, 3, 5 |
| R2 | When Nina speaks on her own initiative, a push notification is sent | 1, 4 |

"if user enable notification" and "it always sends" are not separate deliverables — they are the
gate and the strength of the guarantee, and they live in `## Invariants` below.

## Scope

**In scope**

- A caller-facing notify entry point in `lib/push` that is not type-narrowed to the proactive
  trigger union, plus a kind vocabulary for it (phase 1).
- A push after Nina's chat reply commits — covering send, resend, revive and burst-chained
  follow-ups through the one function they all converge on (phase 2).
- A push after the photograph she was asked for lands, and after R22's apology when it cannot
  (phase 3).
- A push after a photo added to her chat from `/admin` lands (phase 4).
- The same two pushes from the off-platform backstop worker — the photograph **and** the apology
  it writes when it gives that photograph up — under that directory's module rules, plus the three
  `VAPID_*` lines its workflow needs (phase 5).

**Out of scope, and why**

- **`lib/nina/proactive.ts`'s behaviour.** It is already correct and is the pattern the other six
  copy. Invariant 1 pins it.
- **A notification preference column or toggle.** "Enabled" already has exactly one meaning —
  a `push_subscriptions` row with `revoked_at IS NULL` — and `sendNinaPush` already returns
  `skipped: 'no live subscriptions'` for the off case. No DDL, no migration, no UI.
- **Foreground suppression.** The request says "always", and `lib/service-worker.js`'s own comment
  records that on iOS a `push` handler that resolves without `showNotification` is a policy
  violation. See Decisions.
- **`lib/service-worker.js` and `NinaPushPayload.v`.** No payload field changes meaning, so the
  version stays `1` and a worker registered last week keeps working.
- **`lib/nina/actions/{send,resend,startTurn}.ts` and `lib/nina/turnrevive.ts`.** All four schedule
  the same `runNinaBackgroundTurn`; phase 2's single site covers them. Editing them would be
  duplicate work and four chances to get it wrong.
- **`sendPushToSubscription`'s success-bookkeeping bug** (`lib/push/send.ts:93–131` keeps
  `recordPushSuccess` inside the send's `try`, so a database fault after a *delivered* push
  increments the failure streak of a subscription that just worked). Real, pre-existing, and
  deliberately not this set's work — see Decisions **D5**. Phase 5's brand-new `push.ts` gets the
  split right because writing it correctly there costs three lines; that is not a fix to be
  mirrored into phase 1.
- **Adding the GitHub repository secrets themselves.** Phase 5 lands the code and the workflow
  lines; only the repository owner can add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT` as Actions secrets. Until they exist the worker's push degrades to "skipped",
  exactly as the app does on a deployment with no keys.

## Invariants

Every phase must hold all of these.

1. **`lib/nina/proactive.ts` keeps behaving byte-identically.** Its `notify` seam, its
   `ProactiveDeps`, its `NOOP_NOTIFIER` export and the order of its five steps are unchanged. If a
   phase needs a shape proactive also uses, it widens the shared module, not that file.
2. **A push never fails, delays, duplicates or reorders the message write it accompanies.** Every
   new call sits *after* its row is committed, inside its own `try`, and logs rather than throws —
   the exact shape of `proactive.ts:611–615`. This holds even though phase 1's `notifyNinaPush`
   already swallows: `sendNinaPush` itself **can** reject (`listLivePushSubscriptions` is a
   database round trip outside its `try`), so the per-site `try` is the brace and the notifier's
   own `catch` is the belt.
3. **"Enabled" is a live subscription and nothing else.** No new column, no new preference, no new
   UI surface, no migration in this plan set.
4. **A deployment or host with no `VAPID_*` behaves as "no notifications", never as an error per
   turn.** `sendNinaPush` already guarantees this by catching `pushEnv()`; no phase may add a call
   path that reaches `pushEnv()` outside that catch. Phase 5's worker reads `process.env` directly
   and holds the same guarantee its own way.
5. **The wire format does not change.** `NinaPushPayload.v` stays `1`; `kind` is already documented
   as an opaque diagnostics string, so new kind values are an addition, not a meaning change.
6. **The tree builds green at the end of each phase**, with `npx tsc --noEmit`, `npm run lint` and
   `npm test` all passing. `vitest` does not typecheck — run `tsc --noEmit` explicitly.
7. **Tests never reach a real push service.** Every new test drives an injected notifier or a
   mocked `lib/push/send`, never the network. The suite must pass with no `VAPID_*` set.
8. **`server-only` boundaries hold.** `lib/push/payload.ts` stays free of `server-only` and of any
   I/O (phase 5 depends on importing it from a plain node script); `lib/push/send.ts` keeps it.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | The notify seam every message writer can call | R1, R2 | `lib/push` | 4 | — | NORMAL | `.workflows/plan/nina-push-every-message/phase-1.md` | `P1-PSH-A000` | — |
| 2 | Push when she replies to him | R1 | `lib/nina` | 2 | 1 | HARD | `.workflows/plan/nina-push-every-message/phase-2.md` | `P1-NIN-A048` | — |
| 3 | Push when the photo lands, and when it cannot | R1 | `lib/nina` | 4 | 1 | NORMAL | `.workflows/plan/nina-push-every-message/phase-3.md` | `P1-NIN-A049` | — |
| 4 | Push when a photo is added to her chat from `/admin` | R2 | `lib/admin` | 2 | 1 | EASY | `.workflows/plan/nina-push-every-message/phase-4.md` | `P1-ADM-A003` | — |
| 5 | Push from the off-platform backstop worker | R1 | `scripts` | 4 | 1 | HARD | `.workflows/plan/nina-push-every-message/phase-5.md` | `P1-SC-A002` | — |

Phases 2, 3, 4 and 5 share no edge and are all runnable concurrently once phase 1 lands. No two
phases touch the same source file or the same test file — verified file by file during
reconciliation; phases 2 and 3 are both in `lib/nina` but own disjoint modules
(`turnrun.ts` vs `imagerun.ts` + `imagejobs.ts`).

### The kind vocabulary — one table, because four phases read it

Phase 1 owns `NINA_PUSH_KINDS`. Every other phase imports literals from it and stamps them; no
phase may add, rename or collapse a value without editing `lib/push/payload.ts`, which is phase 1's.

| kind | stamped by | phase |
|---|---|---|
| `run_committed`, `missed_usual_day`, `pattern_crossed`, `silence`, `avatar_changed` | `emitProactiveMessage` (unchanged) | — |
| `manual_test` | `lib/push/actions.ts`'s `sendTestPushAction` (unchanged) | — |
| `chat_reply` | `runNinaBackgroundTurn` | 2 |
| `photo_delivered` | `lib/nina/imagerun.ts`'s `finishSelfie` | 3 |
| `photo_apology` | `lib/nina/imagejobs.ts`'s `postNinaApologyMessage` | 3 |
| `admin_chat_photo` | `lib/admin/chatPhotoActions.ts` | 4 |
| `worker_photo_delivered` | `scripts/nina-image-worker/finish.ts`'s `finishSelfie` | 5 |
| `worker_photo_apology` | `scripts/nina-image-worker/finish.ts`'s `closeFailed` | 5 |

**The last two are deliberately distinct from `photo_delivered` / `photo_apology`** — see Decisions
**D2**. Do not collapse them.

### Phase 1 — The notify seam every message writer can call

**Satisfies:** R1, R2 *(the one phase that legitimately serves both — see Decisions)*
**Owns:** `lib/push/send.ts`, `lib/push/payload.ts`, and the tests for them
(`lib/push/payload.test.ts` modified, `lib/push/send.test.ts` created).
**What it adds:**
- A `NinaPushKind` vocabulary in `lib/push/payload.ts` — **twelve values**: the five proactive
  triggers, the `/me` test button, and one per message write (the reply, the photo, the apology,
  the admin photo, and the worker's photo *and* its apology). It lives in `payload.ts` and not
  `send.ts` because phase 5 must import it from a plain node script, and `payload.ts` is the module
  with no `server-only` and no I/O.
- A caller-facing, never-throwing notifier `notifyNinaPush` in `lib/push/send.ts` — the thing
  phases 2, 3 and 4 call — whose `kind` parameter accepts that vocabulary rather than being
  narrowed to `ProactiveTriggerKind`. This is the *only* reason a new seam is needed at all:
  `pushNotifier` is declared `satisfies ProactiveNotifier`, so its inferred `kind` is the trigger
  union and `'chat_reply'` does not typecheck against it.
- One typed local in `pushNotifier` (`const pushKind: NinaPushKind = kind`) that pins
  `ProactiveTriggerKind ⊆ NinaPushKind` at compile time. Runtime is identical.
**Does not touch:** `lib/push/queries.ts`, `lib/push/actions.ts`, `lib/service-worker.js`,
`lib/db/schema/push.ts`, and every file outside `lib/push`. It changes no behaviour that exists
today — `sendNinaPush`'s fan-out, pruning, TTL, truncation and report are untouched, and the
`recordPushSuccess` placement defect is deliberately left alone (D5).
**Exit criteria:** `lib/push` exposes one documented notify function that any server module can
call with any of the twelve `NinaPushKind`s; `pushNotifier` still satisfies `ProactiveNotifier`
unchanged and still *propagates* on a database fault; `tsc --noEmit`, lint and the full suite pass;
no new dependency, no DDL.

### Phase 2 — Push when she replies to him

**Satisfies:** R1
**Owns:** `lib/nina/turnrun.ts` and its test (`tests/nina.turnpush.test.ts`, created).
**What it adds:** one notify call in `runNinaBackgroundTurn` stamped `'chat_reply'`, placed
**after** the bubbles are committed by `insertNinaMessages` (line ~446) and after
`closeNinaChatTurn` — so the poll can already see the reply — and **before**
`runNinaDistillation`'s 10–20 s model call. The bubbles are already in hand as `SentBubble[]`,
which is structurally assignable to the notifier's `{ id, body }[]` with no mapping. The call is
wrapped in its own `try` and logs on failure.

A `deps`-style injectable seam (the shape `ProactiveDeps.notify` already established in
`proactive.ts`) so the test can assert the call with no VAPID and no network, threaded through the
chain's recursion.

**This one site covers four entry points** — `sendNinaMessage`, `resendNinaTurn`,
`reviveNinaChatTurn` and the burst chain, which recurses into this same function and lands its
bubbles at the same insert.

**Must NOT notify on the four paths that write no bubble:** the supersession discard, the
deleted-session abandon, `result.payload == null`, and an `insertNinaMessages` that degraded to
`[]` for a foreign session. A notification for a message that does not exist is the worst outcome
available here.

**Does not touch:** `lib/nina/actions/*`, `lib/nina/turnrevive.ts`, `lib/nina/chatturn.ts`,
`lib/nina/proactive.ts`, `lib/push/*`.
**Exit criteria:** a reply written by the background turn sends exactly one push carrying the first
bubble; a chained follow-up sends its own; none of the four no-bubble exits sends anything; a
notify failure leaves the rows, the closed claim, the distillation and the auto-title untouched.

### Phase 3 — Push when the photo lands, and when it cannot

**Satisfies:** R1
**Owns:** `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts`, and their tests
(`tests/nina.imagerun.test.ts` modified, `tests/nina.imagepush.test.ts` created).
**What it adds:**
- `imagerun.ts`'s `finishSelfie` — notify `'photo_delivered'` as the **last statement of the
  function**: after the `nina_messages` row, the `nina_message_images` row, the post-insert dedupe
  re-check, the blob release **and** `completeNinaImageJob`. That placement is settled (D4): the
  earlier position puts a multi-second APNs POST inside the window where the job still reads
  `pending` while its photo is already in the chat, which `sweepStaleNinaImageJobs` then apologises
  for.
- `imagejobs.ts`'s `postNinaApologyMessage` — notify `'photo_apology'` after the apology row lands,
  guarded on the row actually existing (`insertNinaMessages` returns `[]` for a foreign session).
  It is reached from both `failNinaImageJob` and `sweepStaleNinaImageJobs`; putting the call in the
  shared helper covers both with one site **and inherits both callers' avatar/hidden gates** rather
  than restating either.
**Does not touch:** `lib/nina/turnrun.ts`, `lib/admin/*`, `scripts/*`, `lib/push/*`. In particular
it must not notify for an **avatar** job — `failNinaImageJob` already skips the apology for those
because nobody asked for one in the chat, and the same reasoning applies to the notification.
**Exit criteria:** a delivered photograph pushes its caption; a failed or swept selfie job pushes
her apology from either caller; an avatar job and a hidden (`deletedAt != null`) job push nothing,
by not reaching the helper rather than by a second gate; a notify failure never fails or reopens a
job, and never under-counts the sweep.

### Phase 4 — Push when a photo is added to her chat from `/admin`

**Satisfies:** R2
**Owns:** `lib/admin/chatPhotoActions.ts` and its test (`tests/admin.chatPhotos.test.ts`, modified).
**What it adds:** one notify call stamped `'admin_chat_photo'` after the photo bubble and its image
row are written, past all four of the action's refusal returns — including the one that writes a
message row and then deletes it. The bubble's caption is hoisted into a `const` so the row and the
notification carry the same string by construction rather than by a second `ninaImageCaption(newId())`
draw. That file's own comment at line 780 already expects the bubble to arrive by "service-worker
refresh", which today never fires because no push is sent — this closes that.
**Does not touch:** `lib/nina/*`, `scripts/*`, `lib/push/*`, and the rest of `lib/admin` — the five
other actions in that file mint no message and must not notify.
**Exit criteria:** adding a photo from `/admin` buzzes the phone with the bubble's caption; all four
`{ ok: false }` returns push nothing; a notify failure never fails the add and never costs the
photograph its deferred caption.

### Phase 5 — Push from the off-platform backstop worker

**Satisfies:** R1
**Owns:** `scripts/nina-image-worker/finish.ts` (**both** its `nina_messages` writers —
`finishSelfie` and `closeFailed`), one new sibling module `scripts/nina-image-worker/push.ts` for
the send, `.github/workflows/nina-image.yml`, and the worker's test
(`tests/nina.imageworker.test.ts`, modified).
**What it adds:** the off-platform half of R1, in two call sites:
- after the raw-SQL photograph insert at `finish.ts:142` — `'worker_photo_delivered'`, as the last
  statement of `finishSelfie`;
- after `closeFailed`'s terminal `status = 'failed'` update — `'worker_photo_apology'`, guarded on
  an apology row actually having been written. **This was an unowned gap the phase-5 planner found
  and the reconciler assigned here** (D3): it is the last uncovered `nina_messages` write in the
  set, on the one host the runner cannot see.

Both go through `sendWorkerPush` in the new `push.ts`, which imports every *judgement* from
`lib/push/payload.ts` (`buildNinaPushPayload`, `encodeNinaPushPayload`, `classifyPushFailure`,
`shouldRevokeSubscription`) and restates only the *plumbing*: four `push_subscriptions` statements
and one `web-push` call through `createRequire`.

**This phase's module rules are different from every other phase's** and are load-bearing:
`.ts`-suffixed relative imports, no `@/` aliases, no `server-only`, CJS packages through
`createRequire`. That is why it cannot import `lib/push/send.ts` and instead imports
`../../lib/push/payload.ts`, reads its own subscriptions over the worker's existing `NeonSql`
client, and calls `web-push` through `createRequire` — `web-push` is a runtime dependency, so
`npm ci --omit=dev` installs it. **Invariant 8 is this phase's hard dependency on phase 1:** if
`payload.ts` gains `server-only`, an `@/` import or any I/O, this worker stops booting.

Three lines into the workflow's `env:` block: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, each from `secrets.*`.

**The ops step this phase cannot perform:** those three repository secrets must be added by the
repository owner in Settings → Secrets and variables → Actions, with the same values as the Vercel
Production environment. Until they are, the worker's push degrades to a logged "skipped" and the
worker's real job — finishing the photograph — is unaffected. The phase must state this in its
final report and in the workflow comment, and must not fail a run over a missing key.

**Does not touch:** `lib/**` (except reading `lib/push/payload.ts`), the barrel
`scripts/nina-image-worker.ts`, `scripts/nina-image-worker/`'s other modules, `finishAvatar`, and
the workflow's `run:` steps.
**Exit criteria:** a photograph finished by the worker pushes its caption and a photograph it gives
up on pushes her apology, both only after their rows and the ledger close are committed; a retry, an
avatar job, an unresolvable session and a failed apology insert each push nothing and each still
close the job; the run exits 0 and finishes the photograph when the secrets are absent;
`tsc --noEmit` passes over the new `.ts` module under the worker's import rules;
`npm run nina:worker:dry` still prints `preflight ok`; the workflow file parses.

## Reconciliation Log

The five planners ran in parallel and could not see each other. Phases 2–5 were written before
`phase-1.md` existed on disk, so three of them guessed phase 1's exported names.

| # | Conflict | Class | Resolution |
|---|---|---|---|
| C1 | Phase 3 stamped `'chat_photo'` / `'chat_photo_failed'`; phase 1's vocabulary has `'photo_delivered'` / `'photo_apology'` | Contract drift | **`phase-3.md` repointed** — every occurrence in prose, code, tests and the Requires block. Phase 1's spelling wins: it owns `lib/push/payload.ts` and `kind` is typed `NinaPushKind`, so its file is the definition and phase 3 is a caller. Hedging deleted. |
| C2 | Phase 5 stamped `'chat_photo'`, having "verified" it against `phase-3.md` — a guess confirmed against another guess | Contract drift | **`phase-5.md` repointed to `'worker_photo_delivered'`**, and its two "identical to phase 3" claims (the comparison table and `finishSelfie`'s docstring) rewritten to say the two hosts use **different** kinds on purpose, with the reasoning stated in both files so nobody re-merges them. See D2. |
| C3 | `scripts/nina-image-worker/finish.ts`'s `closeFailed` writes an apology row that no phase pushed — the last uncovered `nina_messages` write in the set | **Gap** | **Assigned to phase 5** as Step 2f (call site, kind, never-throw wrapper, six test cases, `closeFailed` gains the same defaulted `notify` seam `finishSelfie` took). `phase-5.md`'s "Reconciler must assign it or card it" handoff removed. Phase 1 gains a twelfth kind, `'worker_photo_apology'`. See D3. |
| C4 | Phase 1's tuple, kind table, `payload.test.ts` block, `send.test.ts` case and exit criteria all said **eleven** values | Contract drift (consequence of C3) | `phase-1.md` updated to twelve throughout: table row, tuple literal, both tests' enumerations, the handoff to phase 5, and exit criterion 1. A new case pins that the two hosts' pairs stay distinct. |
| C5 | `ASSUMED` / `NAME ASSUMED` / `RECONCILER:` markers in phases 2, 3, 4 and 5 for `notifyNinaPush`, `'chat_reply'`, `'admin_chat_photo'` | Unmet assumption | All three names **confirmed correct** against `phase-1.md`. Every hedge deleted and the Requires blocks rewritten as settled reads, in all four files. No phase file now carries an unresolved name. |
| C6 | `phase-5.md` proposed a three-line fix to `lib/push/send.ts` — **phase 1's file** — in a handoff | Requirement creep | Rewritten as a deliberately-deferred observation pointing at D5. No phase file now proposes the fix. Phase 5 keeps its own split-`try` in the new `push.ts` (new code, correct) and explicitly says it is not a template for phase 1. |
| C7 | Phases 2, 3 and 5 each independently found that `insertNinaMessages` returns `[]` rather than throwing for a foreign session | Duplicate work (checked) | **No contradiction — all three guard it, and the shapes differ because the call sites do:** phase 2 `if (bubbles.length > 0)` (array in hand), phase 3 `if (apology != null)` (destructured first row), phase 5 a `let apology: … \| null` bound only after the raw-SQL insert resolved (no row comes back). Phase 4 inherits its guard from the action's existing `message == null` early return. Left as is, with the relationship recorded here. |
| C8 | Phases 2 and 3 are both in `lib/nina` | File collision (checked) | **Disjoint.** Phase 2 owns `turnrun.ts` + `tests/nina.turnpush.test.ts`; phase 3 owns `imagerun.ts`, `imagejobs.ts`, `tests/nina.imagerun.test.ts` and `tests/nina.imagepush.test.ts`. No source or test file in the set is touched by two phases. |
| C9 | Phase 3's `vi.mock('@/lib/push/send', …)` factory named **one** export; phases 2 and 4 named all three | Contract drift | Unified on the three-key factory in both of phase 3's test files. A factory replaces the module for every importer in the graph, and `lib/nina/proactive.ts` imports `pushNotifier` from it — an omitted name fails as an unrelated module-resolution error. See D6. |
| C10 | The index's Files column said 3 for phases 1 and 3; both plans list 4 files | Contract drift | Index corrected to 4 and 4. `phase-3.md`'s note under its Files table rewritten to record the correction rather than flag a mismatch. |
| C11 | `phase-2.md`'s Step 3 comment asserted the default notifier never throws *because `sendNinaPush` never does* | Contract drift | Corrected: `notifyNinaPush` never throws because **it has its own `catch`**; `sendNinaPush` genuinely can reject (`listLivePushSubscriptions` sits outside its `try`). Invariant 2 restated in the index to say so. No other phase repeated the wrong claim. |
| C12 | Phase 3 flagged its `finishSelfie` notify placement (after `completeNinaImageJob` rather than beside the image insert) for the reconciler | Ordering | **Accepted and marked settled** in `phase-3.md`; the hedge removed, the reasoning kept. See D4. |
| C13 | **Round 2 sweep, after C1–C12's edits.** Six residues of the twelfth kind and of Step 2f: `phase-1.md` still summed its own test cases as 5+7=12 (Step 6 gained a sixth case in C4); `phase-5.md`'s Interface Contract still called `closeFailed`'s third parameter `reason` (the source names it `outcome`), still described `WorkerNotifier` as the seam *`finishSelfie`* takes its notifier through, still titled a `finishSelfie` case *"the kind the app side sends"* against a body asserting the opposite, and its Rollback still counted one defaulted parameter and one call; the index's Why still counted **six** message-writing places and **five** uncovered ones, from before C3 found the seventh | Contract drift | All six corrected in place: 6 cases / 13 total in `phase-1.md`; `outcome`, the two-owner seam wording, the case title and a two-parameter Rollback in `phase-5.md`; seven places / other six in the index's Why and Scope, and the same count in `phase-1.md`'s Step 1 comment. `phase-5.md`'s contract now also names `run.ts:51`, `:66` and `:91` as the three-argument `closeFailed` calls that keep compiling against the defaulted seam, and states that `run.ts` is not edited. No decision reopened, no scope moved, no `R` moved. |

**Post-edit verification.** Dependencies point backward only (every phase depends on 1 and nothing
else). No symbol is deleted anywhere in the set, so there is no deleted-then-used. Every Impact
Point in the analysis document has exactly one owner, plus the C3 gap the analysis did not list.
Every `R` is served. Each phase compiles on its own once phase 1 has landed, and phase 1 compiles
against the tree as it stands.

## Decisions

| # | The fork | The choice | The rung |
|---|---|---|---|
| D1 | Phase 1 spelled the photo kinds `photo_delivered` / `photo_apology`; phases 3 and 5 had guessed `chat_photo` / `chat_photo_failed` | **Phase 1's spelling.** Phases 3 and 5 repointed in place. | **The plans' code blocks.** Phase 1 owns `lib/push/payload.ts` and types `kind` as `NinaPushKind`, so that file is the definition and the other two are callers whose literals must typecheck against it. |
| D2 | Should the in-platform and off-platform hosts share one kind per event, or keep separate ones? | **Separate: `photo_delivered`/`photo_apology` in the app, `worker_photo_delivered`/`worker_photo_apology` on the GitHub runner.** Stated in `phase-1.md`, `phase-3.md` and `phase-5.md` so nobody "tidies" them together. | **A stated invariant** (5: `kind` is documented diagnostics-only and new values are additions) read against what the backstop is for. The worker runs *only* when the app's own invocation was killed, so the `worker_*` value is the single signal anywhere that says the backstop fired. One shared value would read identically on both hosts and answer nothing. |
| D3 | The worker's `closeFailed` apology had no owner: phase 5 scoped itself to the photograph insert, phase 3 owns only the in-platform twin | **Phase 5 owns it**, as Step 2f; phase 1 adds the twelfth kind. | **The user's raw input** — *"everytime nina sends a message … it always sends a push"* — against the Requirements table's R1. Leaving it uncovered fails "everytime" on the one host the runner cannot see. Phase 5 already owns the file, has the seam built, and estimated ~8 lines; phase 3 cannot reach `scripts/`. |
| D4 | Phase 3's `finishSelfie` notify: immediately after `insertNinaMessageImages`, or after `completeNinaImageJob`? | **After `completeNinaImageJob`** — the last statement of the function. | **The phase's own exit criteria**: *"a notify failure never fails or reopens a job"*. A multi-second APNs POST between the image row and the ledger close widens the window in which the job reads `pending` while its photo is already in the chat, which `sweepStaleNinaImageJobs` then apologises for — i.e. the earlier position is the one that can reopen a job. |
| D5 | Phase 5 observed that `sendPushToSubscription` (`lib/push/send.ts:93–131`) keeps `recordPushSuccess` inside the send's `try`, so a database fault after a *delivered* push increments the failure streak of a subscription that just worked | **Real defect, deliberately NOT fixed in this set.** No phase file proposes the fix; it wants its own card. | **The plan index's Scope**: phase 1's scope says it changes no existing behaviour, and widening it would put an unrelated bugfix inside the foundation every other phase depends on and cannot be reverted around. Phase 5's new `push.ts` splits the two `try`s because it is new code — that is not a template for phase 1. |
| D6 | Phase 3's `@/lib/push/send` mock factory named one export; phases 2 and 4 named all three | **All three runtime exports, in every phase's factory.** | **The surrounding code's convention** — two of the three phases already did it, and `lib/nina/proactive.ts` imports `pushNotifier` from that module, so an omitted key breaks an unrelated importer with a module-resolution error. |
| D7 | Does `sendNinaPush` reject, or is the sender safe enough that call sites can skip their own `try`? | **It can reject** — `listLivePushSubscriptions` is a database round trip outside its `try` — so every call site keeps its own `try` *and* `notifyNinaPush` keeps its `catch`. | **A stated invariant** (2), now spelled out in the index. Measured during phase 1's planning by driving the real module with `./queries` mocked to reject. `phase-2.md`'s contrary comment was corrected (C11). |
| D8 | Three phases independently guarded `insertNinaMessages` returning `[]`; should the guard be shared? | **No — one guard per call site, in the shape that site's data allows.** | **The plans' code blocks.** The three sites hold different things (an array, a destructured row, nothing at all on the raw-SQL host), and the guard belongs where someone can see *why* the collection can be empty. `buildNinaPushPayload`'s own null-for-empty is the backstop, not the rule. |
| D9 | Foreground suppression: should a push be withheld when the app is open? | **No.** Always send. | **The user's raw input** — "it always sends" — reinforced by `lib/service-worker.js`'s own comment that on iOS a `push` handler resolving without `showNotification` is a policy violation counted against the app's push budget. |
| D10 | Does an operator adding a photo from `/admin` count as Nina sending a message (analysis A3)? | **Yes — it pushes**, under its own `admin_chat_photo` kind so the two origins stay separable in a log line. | **The plan index's Requirements table**: R2 is "when Nina speaks on her own initiative", and the bubble is written as `role: 'nina'` into her chat. It is the one call site where a reasonable person could want the opposite, and it is a one-commit revert (phase 4 touches one file). |

## Open Questions

*(none)*

Every fork in this set was decidable on the ladder above and every requirement id has an owner.
Nothing here is irreversible: the set adds calls, adds no schema, changes no wire format, and every
phase is a single `git revert`.

## Rollback

**Per phase.** Every phase adds a call, a seam, or a config line; none removes anything, none
changes a schema, and none alters the wire format. `git revert` of a phase's commit restores the
behaviour that shipped, and because phase 1 only widens `lib/push`, reverting phases 2–5 in any
order leaves a working tree.

**As a whole.** Revert phases 5→1 in that order, or `git branch -D feature/nina-push-every-message`
before it lands. Reverting phase 1 while any of 2–5 stands leaves their imports of `notifyNinaPush`
/ `NinaPushKind` dangling and `tsc --noEmit` red, which is why the order is fixed. There is no
migration to undo and no data to repair. A runner who wants the old behaviour back without a deploy
can turn notifications off on `/me`, which revokes the subscription and makes every one of these
call sites a no-op.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f NINA_PUSH_EVERY_MESSAGE_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f NINA_PUSH_EVERY_MESSAGE_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan NINA_PUSH_EVERY_MESSAGE_PLAN.md
