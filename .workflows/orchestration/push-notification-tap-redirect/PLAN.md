# Plan: Push Notification Tap → Redirect to the Correct Bubble

**Slug:** push-notification-tap-redirect
**Date:** 2026-09-16
**Analysis:** `20260916-084124-N9QZ_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/push-notification-tap-redirect`
**Branch:** `feature/push-notification-tap-redirect` (base: `origin/main` @ `f48a941`)
**Phases:** 2
**Status:** complete
**Coordinator:** —

---

## Why

> we have push notification now. and it works.
> BUT there is a problem that if i am in some page in our app, for example, when i am viewing full
> a screen image in /nina/about Media, then i see a notif popped out, i couldn't click the
> notification.
> requirement: make it so, dimanapun user berada di app, baik ketika melihat foto, chat di chat
> session lain, liat profpic nina, anything. make sure user can click the push notification from
> their phone and be redirected to the correct bubble in the correct chat session.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | Tapping the push notification must work from anywhere in the app — any screen, any overlay (full-screen photo, another chat session, Nina's profile picture) — not just from a bare `/nina`. | 1 |
| R2 | The tap must land on the correct bubble in the correct chat session, not just the chat tab in general. | 2 |

## Scope

**In scope:**
- `lib/service-worker.js`'s `notificationclick` handler: making it actually navigate/focus
  reliably regardless of whether the found window is controlled by this service worker.
- A new app-wide (root-layout-level) listener that turns a service-worker navigation message into
  a client-side route change, so the redirect works from every route, not just `/nina`.
- Threading `sessionId` into every chat-shaped push payload (`chat_reply`, `photo_delivered`,
  `photo_apology`, `admin_chat_photo`, and the five proactive triggers, including the off-platform
  worker's two backstop kinds) so the payload's `url` becomes `/nina?s=<sessionId>&jump=<messageId>`
  instead of bare `/nina`.

**Out of scope, and why:**
- `duplicate_image`'s push (`lib/push/duplicateImage.ts`) — it already carries its own
  `/photo/<kind>/<id>` url and is not about a chat bubble; untouched.
- The scroll-and-flash landing itself (`components/nina/useQuoteLanding.ts`,
  `lib/nina/reply.ts`'s `planQuoteScroll`) — already correct and already exercised by
  `/nina/jobs/[id]`'s "Buka chat-nya" and by search hits. This plan only makes sure a push's `url`
  reaches that existing mechanism with the right `?s=`/`?jump=` pair; it does not change the
  mechanism.
- Adding `install`/`activate`/`clients.claim()` to the service worker. `clients.claim()` would also
  fix `navigate()`'s controlled-client requirement, but it is a lifecycle change to a file whose own
  header states "no install, no activate, no fetch" as a deliberate invariant (a caching worker
  decision this feature does not get to make in passing). The `postMessage`-based navigation this
  plan uses instead is control-independent by construction (the same mechanism
  `ChatScreen.tsx`'s existing `nina:new` listener already relies on) and reaches the same result
  without touching that invariant. See Decisions.
- Any change to `NinaPushPayload`'s wire *shape* — `url` already accepts an arbitrary same-origin
  path; only the *value* callers pass changes.

## Invariants

1. The tree builds (`npx tsc --noEmit`) and all existing tests pass at the end of each phase.
2. `lib/service-worker.js` gains no `install`, `activate`, or `fetch` handler, and no caching. Its
   only two events remain `push` and `notificationclick` (see Scope's "out of scope" note).
3. `lib/push/payload.ts` keeps zero non-`zod` imports and no `server-only` — it must stay loadable
   by `node --experimental-strip-types` through a relative specifier from
   `scripts/nina-image-worker/`.
4. `notifyDuplicateImagePush`'s behaviour and `NinaPushPayload`'s wire shape are unchanged.
5. Every `sessionId` threaded into a push call is a value the caller already had in scope from its
   own write path (no new query, no new lookup) — this plan is wiring, not a new read.
6. A push notifier never throws on account of this plan's changes: every existing "swallow" (the
   per-call-site `try`/`catch` around `notifyNinaPush`/`sendWorkerPush`) keeps behaving exactly as
   it does today for a phone that is unreachable or misconfigured.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Make the tap work from anywhere | R1 | `lib/service-worker.js`, `components/push`, `app/` | 6 | — | NORMAL | `.workflows/plan/push-notification-tap-redirect/phase-1.md` | P1-RI-A042 | — |
| 2 ✅ | Deep-link every chat push to its session and bubble | R2 | `lib/push`, `lib/nina`, `lib/admin`, `scripts/nina-image-worker` | 17 | — | NORMAL | `.workflows/plan/push-notification-tap-redirect/phase-2.md` | P1-RI-A043 | — |

File counts are the phases' own Files tables: phase 1 is 6 (`lib/service-worker.js`,
`lib/nina/live.ts`, `lib/nina/live.test.ts`, `components/push/PushTapNavigator.tsx` + its test,
`app/layout.tsx`); phase 2 is 17 (9 source — `lib/push/{payload,send}.ts`,
`lib/nina/{turnrun,imagerun,imagejobs,proactive}.ts`, `lib/admin/chatPhotoActions.ts`,
`scripts/nina-image-worker/{push,finish}.ts` — and 8 test files).

No dependency edge between the two phases: they touch entirely disjoint files (verified
file-by-file at reconciliation — the two Files tables share no entry) and can be built, tested and
reviewed independently. Neither phase's *build* depends on the other.

**Merge order is not symmetric, though the build order is.** Land phase 1 first, or land the two
together. On `main` today exactly one case works: standing on bare `/nina`, where
`notificationclick`'s `url.pathname === target` matches (`'/nina' === '/nina'`) and the window is
focused. Phase 2 alone turns `target` into `/nina?s=…&jump=…`, which a bare pathname can never
equal, so that branch stops matching and the tap falls into the `navigate()` call that rejects —
the one working case breaks until phase 1's `pathname + search` comparison lands. Phase 1 alone
regresses nothing. See Decisions.

### Phase 1 — Make the tap work from anywhere
**Satisfies:** R1
**Owns:** `lib/service-worker.js`'s `notificationclick` handler; the SW→window message-type
constant (`lib/nina/live.ts`); a new app-wide client component that turns that message into a
client-side route change; wiring it into `app/layout.tsx`.
**Does not touch:** `lib/push/payload.ts`, `lib/push/send.ts`, any push-sender call site, the
`push` event handler's payload-building logic (only `notificationclick` changes), `AppShell.tsx`
(the new listener goes in the root layout specifically because `AppShell` does not wrap every
route — see the analysis's Key Considerations).
**Exit criteria:**
- `notificationclick` no longer calls `WindowClient.navigate()` as its primary mechanism for an
  already-open, possibly-uncontrolled window; the chosen mechanism (focus + postMessage) works
  regardless of whether `clients.matchAll` returned a controlled or uncontrolled client.
- No unhandled promise rejection is reachable from `notificationclick` for any combination of
  (controlled | uncontrolled) × (client has `navigate` | does not) × (pathname matches target |
  does not).
- A window client that already shows the exact target (pathname *and* query) is focused without a
  redundant navigation/reload.
- The new listener is mounted once, app-wide, and is provably reachable from a route `AppShell`
  does not wrap (e.g. `/photo/[kind]/[id]`), not just from `/nina`.
- New/updated tests cover the listener component's behaviour (message received → `router.push`
  called with the message's `url`; irrelevant message types ignored).

### Phase 2 — Deep-link every chat push to its session and bubble
**Satisfies:** R2
**Owns:** `lib/push/payload.ts`'s `buildNinaPushPayload` (new optional `sessionId` input, and the
deep-link URL it produces when given one); threading `sessionId?` through
`lib/push/send.ts` (`sendNinaPush`, `NinaPushNotifier`, `notifyNinaPush`),
`lib/nina/turnrun.ts` (`NinaTurnNotifier` + its call site),
`lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts`, `lib/admin/chatPhotoActions.ts`,
`lib/nina/proactive.ts` (widening `ProactiveNotifier`, `pushNotifier`, and
`emitProactiveMessage`'s `notify(...)` call), and
`scripts/nina-image-worker/push.ts` + `scripts/nina-image-worker/finish.ts` (the off-platform
backstop's two call sites).
**Does not touch:** `lib/push/duplicateImage.ts` (already passes its own `url`; must keep doing so
— an explicit `url` always wins over a derived one), `lib/service-worker.js`, `useQuoteLanding.ts`,
`ninaJumpHref` itself (reused/mirrored, not modified), `ProactiveTriggerKind` or any other type
outside `ProactiveNotifier`'s own signature.
**Exit criteria:**
- Every one of the six chat-shaped push kinds (`chat_reply`, `photo_delivered`, `photo_apology`,
  `admin_chat_photo`, and the five proactive triggers sent via `pushNotifier`, plus the worker's
  `worker_photo_delivered`/`worker_photo_apology`) produces a payload whose `url` is
  `/nina?s=<sessionId>&jump=<messageId>`, where `messageId` is the same id `buildNinaPushPayload`
  already selects as the first non-blank message.
- `duplicate_image`'s payload is byte-for-byte unaffected.
- A call site that has no `sessionId` available (there are none among the six today, per the
  analysis's per-call-site scope check) is not required to supply one — the parameter stays
  optional and the fallback to bare `PUSH_TARGET_URL` remains for any future caller that omits it.
- `npx tsc --noEmit` passes with `ProactiveNotifier` widened, and `scripts/nina-image-worker/*`
  still runs under `node --experimental-strip-types` (no new `@/`-aliased or `server-only` import
  introduced there).
- Updated tests assert the new `url` shape at each of the seven call sites' existing test coverage
  (wherever such coverage exists), and `lib/push/payload.test.ts` covers `buildNinaPushPayload`'s
  new `sessionId` input directly.

## Reconciliation Log

**No conflicts — two disjoint phases, cross-phase awareness verified.** Both plan files and the
analysis were read in full and the load-bearing claims were checked against the source in the
worktree rather than against the planners' summaries. No plan file's scope, contract, `Satisfies`
line or Files table changed; the only edits were two Handoffs notes recording the merge-order
finding and the verifications below.

| # | Checked | Verdict |
|---|---|---|
| 1 | Phase 1's contract asserts its `notificationclick` rewrite compares the FULL href, not pathname-only | **True in the plan's own code, not just its summary.** Step 3 defines `routeKey(url, base)` returning `parsed.pathname + parsed.search` and compares `routeKey(target, client.url) === routeKey(client.url, client.url)`. Phase 2's query-carrying URLs are compared correctly. |
| 2 | Phase 2's dependence on phase 1 fixing the old pathname-only branch | **Satisfied.** Confirmed against `lib/service-worker.js:151-166` on disk (`if (url.pathname === target) return client.focus()`, and `client.navigate(target).then(…)` with no `.catch()`). Phase 1 deletes both branches; phase 2 correctly never touches the file. |
| 3 | Do the two phases share a file despite sharing the URL grammar? | **No.** Phase 1's 6 files and phase 2's 17 files are disjoint, source and test. Phase 1 lists all of phase 2's files under "Leaves alone" and vice versa. No duplicate work, no file collision, no later phase quoting pre-change state. |
| 4 | Does phase 2's `/nina?s=<id>&jump=<id>` pass phase 1's *untouched* `push`-handler validation? | **Yes.** `lib/service-worker.js:86` reads `typeof data.url === 'string' && data.url.startsWith('/')` — a path with a query string passes unchanged. Phase 2 invented no URL shape phase 1's untouched code would reject. `PushTapNavigator` restates the same guard plus a `//` refusal, which `/nina?s=…` also passes. |
| 5 | Phase 2's `sendWorkerPush` param reorder (`sessionId` at 5, `sendFn` to 6) | **Correct and no concern of phase 1's.** Verified on disk: `WorkerNotifier` is 4-param, `sendWorkerPush` has `sendFn` at 5, and `finish.ts:113` and `:341` both write `notify: WorkerNotifier = sendWorkerPush` — so a trailing `sessionId` really would collide `SendWorkerNotification` against `string` at position 5 and fail `tsc`. Phase 1 never opens `scripts/nina-image-worker/`. Recorded in Decisions. |
| 6 | Gap sweep against the analysis's Impact Points and Reference List | **All 14 impact points owned**, 1-4 by phase 1 and 5-14 by phase 2. The one that looked like a gap — impact point 14's `lib/nina/proactive.test.ts` ("if applicable"), absent from phase 2's Files table — was checked, not assumed: `tests/nina.proactive.test.ts` contains no `notify` reference and no notifier `toHaveBeenCalledWith`, so widening `ProactiveNotifier` moves nothing in it. Genuinely not applicable. |
| 7 | Phase 1's claim that `tests/pwa.install.test.ts` survives the `app/layout.tsx` edit | **Verified** against that file's "the root layout" block: five `toMatch` regexes plus `not.toMatch(/ADMIN_INSTALL/)`. Adding the import and the `<PushTapNavigator />` child satisfies all six. |
| 8 | Deleted-then-used, unmet `Requires`, ordering violations, broken-build phases, contract drift | **None.** No exported symbol is deleted by either phase; phase 1 deletes only two code branches inside a handler it owns and rewrites in the same step. Both phases declare `Requires: none` and neither has a predecessor. Each phase's gates (`tsc --noEmit`, `npm test`) pass standing alone. |
| 9 | Requirement ownership and creep | **Clean.** R1 → phase 1 only, R2 → phase 2 only; no `R` unowned, no step serving an `R` outside its own `Satisfies` line. Phase 1 explicitly declines the payload work; phase 2 explicitly declines the tap-delivery work. No step moved between phases, so no `Satisfies` line or Requirements row changed. |
| 10 | Merge-order asymmetry (**the one finding neither planner stated**) | Phase 2's handoff notes the old pathname branch "can never match a chat push again" and hands it to phase 1; phase 1 guarantees the query-aware comparison. Neither said what happens if **phase 2 merges first** — it costs the single case that works on `main` today (bare `/nina` → focus). Resolved as a merge-order constraint, not a `depends_on` edge; recorded in Decisions and in both phases' Handoffs. |

## Decisions

| Fork | Chosen | Rung |
|---|---|---|
| Fix `navigate()`'s controlled-client requirement via `clients.claim()` (add `activate`) vs. via a control-independent `postMessage` + client-side `router.push` | `postMessage` + `router.push`, no `activate` handler added | 1: plan invariant 2 — the service worker's "no install, no activate, no fetch" is a stated deliberate invariant in its own header, and the postMessage channel already exists and is proven control-independent (`ChatScreen.tsx`'s `nina:new` listener) |
| Where to widen `ProactiveNotifier` to carry `sessionId` vs. leaving the five proactive kinds without a deep link | Widen `ProactiveNotifier` with an optional 4th parameter | 5: surrounding convention — `NinaPushNotifier`/`NinaTurnNotifier`/`WorkerNotifier` all already end in optional trailing parameters for exactly this kind of addition, and the widening is purely additive |
| Where the app-wide navigation listener mounts: `AppShell.tsx` vs. `app/layout.tsx` | `app/layout.tsx` | 1: plan invariant (R1's exit criteria requires reachability from a route `AppShell` does not wrap, e.g. `/photo/[kind]/[id]`); `AppShell` provably does not cover every route (analysis's Key Considerations) |
| How the app and the off-platform worker agree on the `/nina?s=&jump=` grammar without a shared import | Restate the literal in `lib/push/payload.ts` (app + worker's shared, dependency-free module), following the `WORKER_PUSH_TTL_SECONDS`-restates-`PUSH_TTL_SECONDS` precedent already in this codebase | 6: surrounding convention |
| Where `sessionId` goes in `sendWorkerPush` — trailing (as the phase brief said) vs. position 5 with the `sendFn` test seam moved to 6 | Position **5**, `sendFn` to **6** | 1: build-green. Verified on disk: `WorkerNotifier` is 4-param and `scripts/nina-image-worker/finish.ts:113` and `:341` both write `notify: WorkerNotifier = sendWorkerPush`, so a trailing `sessionId` puts `SendWorkerNotification` against `string` at position 5 and `npx tsc --noEmit` fails. The repo's own seam-last convention (`finishSelfie`'s `notify`, `releaseBlobIfUnreferenced`'s `delFn`) agrees. Cost is twelve one-line test updates that `tsc` flags loudly; phase 2 Steps 8 and 11 carry both halves. |
| Phase 2 landing before phase 1: add a `depends_on` edge (serialising the set) vs. keep the phases parallel with a merge-order constraint | **Keep them parallel; land phase 1 first, or both together.** No `depends_on` edge is added | 1: build-green, which both phases already are standing alone — an edge would serialise two genuinely independent builds to prevent a transient that merge order alone removes. Phase 2 merging first would break the single case that works on `main` today (bare `/nina`, where `url.pathname === target` matches and the window is focused), because its `target` gains a query string that a bare pathname cannot equal. Phase 1 merging first regresses nothing and makes the pair order-independent thereafter. Recorded in both phases' Handoffs so a phase session cannot meet this at 3am. |

## Open Questions

None. Every fork above has a reversible, additive resolution (an optional parameter, a comment-
linked restated constant, a listener mounted one level higher, a parameter position settled by
`tsc`, a merge order) — nothing here destroys data, rewrites history, or forecloses a future
change. Reconciliation found no unowned requirement id and no contradiction that needed parking:
both `R`s are owned by exactly one phase each, and the one cross-phase finding (merge order) was
decided on the build-green rung rather than deferred.

## Rollback

**Per phase:** each phase is a self-contained commit (or small set of commits) touching disjoint
files; reverting phase 1 leaves `notificationclick` exactly as it is on `main` today (still broken
for R1, unaffected by R2's changes) and reverting phase 2 leaves every push's `url` at bare
`/nina` (still correct, just not session/bubble-scoped) — neither revert requires touching the
other phase's files.

**As a whole:** revert the merge commit(s) on `feature/push-notification-tap-redirect`; nothing in
either phase writes to the database or changes a migration, so rollback is a pure code revert.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent (no dependency edge), resumable
on any machine:

    /analyze-orchestrator -f PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md
