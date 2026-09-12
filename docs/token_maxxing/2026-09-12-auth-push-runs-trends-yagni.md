# Token-Maxxing Session — 2026-09-12: auth-push-runs-trends-yagni

## 🎯 Achievement / End Result
- **Goal of the burn:** YAGNI dead-code hunt across the seven never-swept small packages — `lib/auth`, `components/auth`, `lib/push`, `components/push`, `lib/runs`, `components/runs`, `components/trends` (22 files, ~2,045 lines) — with scope constraints: no `package_readme.md` edits, no production DB access, worker session (coordinator `tokenmax-orch-2026-09-12` lands the branch, not this session).
- **Concrete changes:** commit `04e79fe`, 5 files, **+13/−64** — deleted `decodeNinaPushPayload` plus its 3-test describe block, un-exported 8 internal-only symbols, removed `SignOutButton`'s never-passed `fullWidth` prop.
- **Real value delivered:**
  - One genuine speculative-code removal: `decodeNinaPushPayload` was consumed **only by its own test** — a TS twin of the service worker's defensive reader that the worker (plain JS, separate bundle entry) cannot and does not import. Its docstring spent six lines explaining why nothing uses it, which is the tell. The worker-contract note it carried now lives on `encodeNinaPushPayload`'s new docstring, and the wire contract stays documented on `NinaPushPayload` where it belongs.
  - API-surface reduction with a *mechanical* proof: 8 exports (`PUSH_TITLE`, `PUSH_TARGET_URL`, `PUSH_NOTIFICATION_TAG`, `TERMINAL_PUSH_STATUS_CODES`, `pushSubscriptionSchema`, `PushActionResult`, `PushSendReport`, `sendPushToSubscription`) dropped their `export` keyword after a repo-wide word-boundary census showed zero external code references — and the post-edit `tsc --noEmit` passing over the whole repo **is** the positive control that none of the 8 had a hidden importer.
  - A verified-alive ledger worth more than the deletions: the sweep's honest finding is that these packages are *clean*, and several things a naive "is this used?" pass would have deleted are load-bearing decisions with comments saying so. Each was checked and is now written down (see Decisions).
  - Method traps recorded for the next sweep: zsh's no-word-split loop bug and the comment-vs-code classification requirement (below) both silently produce wrong "no consumers" verdicts.
- **Branch:** `token-maxxing-2026-09-12-auth-push-runs-trends-yagni`
- **Merge status:** merged (commit `8bd8f08` — "merge: token-maxxing session auth-push-runs-trends-yagni")
- **Approx token burn:** ~250k 🔥 (all 22 files read in full rather than grepped; every export censused individually; ambiguous hits classified line-by-line; full test sweep run twice plus a serial rerun to settle a flake verdict)

## Context & Motivation
Leadership wants higher token consumption with defensible engineering value; the coordinator fan-out assigned this worker the YAGNI idea for the auth/push/runs/trends cluster — six-and-a-half small packages the previous package-readme compaction sessions had documented but nobody had swept for dead code. The bet: small packages swept in one pass share the same import graph, so a single usage map answers for all of them, and the "never swept" premise promised at least a few corpses.

That premise turned out mostly wrong — which is itself the session's second finding, and the reason the verified-alive ledger matters more than the −64 lines.

## What We Did (blow-by-blow)
1. **Full-file reads, not grep triage.** All 22 files read end to end (~2,045 lines). This is what makes the sweep trustworthy: private helpers (`hostOf`, `NOTHING`, `configureVapid`, `WeekDivider`, `PushSetupFallback`, `urlBase64ToUint8Array`, `Support`) could be confirmed used at read time, and the documented *decisions* (see below) were visible where a symbol-level tool would have skipped them.
2. **Export census.** ~60 exports inventoried from the reads (TS-shape: functions, consts, classes, interfaces, types — including the `'use server'` files, where every *runtime* export is an HTTP endpoint and type exports are compile-time only).
3. **Repo-wide word-boundary usage map** for all ~60 symbols across `app/ lib/ components/ tests/ scripts/` plus root `auth.ts`/`auth.config.ts`/`proxy.ts`. Four hits looked like consumers and were not:
   - `AccountMenu.tsx` → `getUserId` is its own doc comment ("Reads `auth()` rather than `getUserId()`");
   - `MessageList.tsx` → `RunList` is a comment ("reuses RunList's week-divider recipe");
   - `loading.tsx` / `ChartFrame.tsx` → `RunRow` are comments about skeleton height;
   - `service-worker.js` → `PUSH_TARGET_URL`/`PUSH_NOTIFICATION_TAG`/`NinaPushPayload` are "kept in step" contract comments. Every one of these **must** be classified line-level (stripping `*`/`//` comment lines) before any "no external refs" verdict — counting them as refs would have blocked correct removals; counting removals without checking them would have broken the build.
4. **Verdicts.** Every export classified used / unused-export-but-used-internally / dead. `getUserId`, `requireUserIdApi`, `unauthorizedJson`, `UnauthorizedError` all confirmed live (upload route, extract routes, `(app)/page.tsx`, `NinaUnreadBadge`, `requireAdmin`). All eight components confirmed rendered by `app/` pages. The `'use server'` actions confirmed bound from client components.
5. **Speculative-parameter pass.** `at: Date = new Date()` on `recordPushSuccess`/`recordPushFailure` and `max` on `truncateForNotification` are defaults no caller ever overrides — but a repo grep showed `now: Date = new Date()` is a 20+-site house idiom for test time-injection, and `PUSH_BODY_MAX_CHARS` is the named contract the tests assert against. Kept, with the reasoning recorded. (`fullWidth` on `SignOutButton` had no convention cover and no caller — removed; `Button` defaults it to `false`, so the render is byte-identical.)
6. **Removals + docstring re-homing.** `decodeNinaPushPayload` deleted; the "the service worker does NOT use this" note moved onto `encodeNinaPushPayload` so the claim survives the deletion. Test imports updated (`decodeNinaPushPayload` *and* `encodeNinaPushPayload` — the round-trip test was encode's only test consumer).
7. **Gates, in the right order.** `next typegen` first (a fresh worktree's `PageProps` errors are missing typegen, not breakage), then `tsc --noEmit` clean repo-wide; targeted vitest 42/42 (`payload.test.ts`, `auth.safeNext.test.ts`, `views.render.test.ts`); full sweep.

## Code / Design Details
The one deletion, before → after:

```ts
// BEFORE: 18 lines + 24 test lines whose only consumer was each other
export function decodeNinaPushPayload(raw: string): NinaPushPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    ... // defensive reads, defaults for url/tag/messageId/kind
  } catch { return null }
}

// AFTER: the module still owns the wire shape; the worker-side note moved next to the encoder
/** Stringify for the wire. The service worker does NOT import this module — it cannot import from
 * `lib/` in a way that survives being a separate bundle entry, so it keeps its own defensive
 * reader of this same shape there; that file's constants say "kept in step" with the ones above. */
export function encodeNinaPushPayload(payload: NinaPushPayload): string {
  return JSON.stringify(payload)
}
```

Why the test block went with it: the describe block's best assertion ("survives an unknown field and fills the defaults — the compatibility claim `v` exists for") documents the *worker's* behaviour but tested the TS twin, which nothing in production executes. An executable spec of an artifact with no production role is still a self-referential test. Debugging a payload out of a log line is `JSON.parse` — and if the defaults matter, they live in the worker's JS, which is where the behaviour actually runs.

Un-export list (keyword dropped, code untouched) with the verifier that backs each: the eight symbols above; `tsc --noEmit` clean across the repo after the edit is a compile-time proof of zero importers — stronger than the grep that nominated them.

## Decisions & Trade-offs
- **`decodeNinaPushPayload`: delete, don't keep as a debug aid.** "For anybody debugging a payload out of a log line" is the canonical speculative-retention pattern, and the docstring already had to deny a production caller. Cost of regret: ~15 lines re-derivable from the `NinaPushPayload` type.
- **Injection-parameter defaults kept.** `at:`/`now:` defaults match a 20+-site convention (recorded so the next sweep doesn't re-litigate them); YAGNI applies to *uncalled flexibility with no convention cover*, and these have cover.
- **`TERMINAL_PUSH_STATUS_CODES` un-exported but its test comment left intact** — the comment ("if you are here to add 403 … this is why you must not") refers to the name, which still exists module-privately.
- **`'use server'` surface untouched.** `subscribeToPushAction`/`unsubscribeFromPushAction`/`sendTestPushAction`/`signInWithGoogleAction`/`signOutAction`/`setRunIntentAction` are all live HTTP endpoints bound from client components; `PushActionResult` un-exporting is type-only and erased before the `'use server'` runtime-export check.
- **The verified-alive ledger** (naive-sweep false positives, each checked against its own comment or test):
  - `shouldRevokeSubscription` deliberately does not consult `lastSuccessAt` ("adding 'but it worked in March' … only keeps corpses in the table");
  - `pushSubscriptionSchema` deliberately drops `expirationTime` ("a column of nulls");
  - `classifyPushFailure`'s `null`/`undefined` branch is the DNS/socket/timeout case, tested;
  - `truncateForNotification`'s `max * 0.6` word-boundary guard is the CJK/hashtag case, tested;
  - `getUserId` vs `requireUserId` are distinct roles (render-alternative vs boundary), both multi-caller;
  - `PeriodNav`'s `nextHref: null` branch is the present period; `AcwrTile`'s `insufficientHistory` branch is the first four weeks; `PushSetupFallback` is the missing-VAPID deploy;
  - `unsubscribeFromPushAction`'s `typeof input.endpoint !== 'string'` check is runtime defense on a public endpoint, not dead type-narrowing.

## Follow-ups & YAGNI notes
- **The headline follow-up is a negative result:** these seven packages need no further sweeping. Their dead code budget was one function, eight export keywords, and one prop — the rest is documented decisions. A future session should not re-sweep them expecting more; it should spend the effort on packages without this session's comments discipline.
- `recordPushSuccess`/`recordPushFailure` have no tests at all (they need a DB); the `at:` seams are ready if that test ever gets written. Writing those tests against a real database would be a higher-value session than any further deletion here.
- The admin-suite parallel-load flake (`MemoryTable` add-row + `SelectionPane` refusal tests red only under file parallelism, varying count 1 → 3 between runs, green serially) reproduced again today on a five-file diff that touches none of it. It remains the top candidate for a real debugging session.
- Method note for future sweeps: run usage loops under bash or split explicitly (`tr ' ' '\n'`) — zsh does not word-split `$VAR`, and the first census pass silently executed once on the whole 52-symbol string, producing an empty map that *looked* like a clean run.

## Appendix
- Commit: `04e79fe` — 5 files, +13/−64 (`lib/push/payload.ts` −26 net, `lib/push/payload.test.ts` −28, `lib/push/send.ts` ±2, `lib/push/actions.ts` ±1, `components/auth/SignOutButton.tsx` ±2).
- Gates: `npx next typegen` → `npx tsc --noEmit` exit 0; `npx vitest run` targeted 42/42; full sweep 5,090/5,090 with `--no-file-parallelism` (parallel runs showed 1 then 3 reds in `components/admin` — the known flake, files untouched by this diff); `npx eslint` and `npx prettier --check` clean on all five touched files.
- Scope compliance: zero `package_readme.md` edits (checked: no doc references `decodeNinaPushPayload` anywhere in `docs/` — no drift left behind); zero DB access; branch not merged (coordinator lands it).
- Coordinator: `tokenmax-orch-2026-09-12`; report sent as `DONE slug=auth-push-runs-trends-yagni branch=token-maxxing-2026-09-12-auth-push-runs-trends-yagni commit=04e79fe`.
