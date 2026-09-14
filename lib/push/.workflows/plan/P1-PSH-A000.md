> Adopted from `NINA_PUSH_EVERY_MESSAGE_PLAN.md` phase 1. Source: `.workflows/plan/nina-push-every-message/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: The notify seam every message writer can call

**Plan set:** `NINA_PUSH_EVERY_MESSAGE_PLAN.md`
**Analysis:** `20260914-102749-C7K2_code_analyzer.md`
**Satisfies:** R1, R2 — the one phase that serves both, because every other phase's call goes
through the door this one builds. It ships no user-visible behaviour by itself; phases 2–5 are what
the runner feels.
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/push`

---

## Goal

After this phase `lib/push` exports a kind vocabulary (`NINA_PUSH_KINDS` / `NinaPushKind`) that
covers all six of Nina's message writes plus the existing proactive triggers and the `/me` test
button, and a caller-facing `notifyNinaPush` that any server module can call with any of those
kinds and that never throws. Today the only exported caller-facing notifier is `pushNotifier`,
whose `kind` parameter is narrowed to `ProactiveTriggerKind` by `satisfies ProactiveNotifier`, so
`pushNotifier(userId, bubbles, 'chat_reply')` is a compile error and phases 2–5 have nothing to
call. Nothing that exists today changes behaviour: `sendNinaPush`'s fan-out, TTL, urgency, topic,
pruning, truncation and `PushSendReport` are untouched, `pushNotifier` still satisfies
`ProactiveNotifier`, `NinaPushPayload.v` stays `1`, and `lib/nina/proactive.ts` needs no edit.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**

- `lib/push/payload.ts` → `NINA_PUSH_KINDS` — a `readonly` tuple, `as const`. **The twelve literal
  values, in order, are the names phases 2–5 import:**

  | value | who stamps it | phase |
  |---|---|---|
  | `'run_committed'` | `emitProactiveMessage` (unchanged) | — |
  | `'missed_usual_day'` | `emitProactiveMessage` (unchanged) | — |
  | `'pattern_crossed'` | `emitProactiveMessage` (unchanged) | — |
  | `'silence'` | `emitProactiveMessage` (unchanged) | — |
  | `'avatar_changed'` | `emitProactiveMessage` (unchanged) | — |
  | `'manual_test'` | `lib/push/actions.ts`'s `sendTestPushAction` (unchanged, still a bare string) | — |
  | `'chat_reply'` | `runNinaBackgroundTurn` — her reply, incl. resend/revive/chain | **2** |
  | `'photo_delivered'` | `imagerun.ts`'s `finishSelfie` — the photograph, in-platform | **3** |
  | `'photo_apology'` | `imagejobs.ts`'s `postNinaApologyMessage` — R22's apology | **3** |
  | `'admin_chat_photo'` | `lib/admin/chatPhotoActions.ts` — a photo added from `/admin` | **4** |
  | `'worker_photo_delivered'` | `scripts/nina-image-worker/finish.ts`'s `finishSelfie` — the photograph, off-platform | **5** |
  | `'worker_photo_apology'` | `scripts/nina-image-worker/finish.ts`'s `closeFailed` — R22's apology, off-platform | **5** |

- `lib/push/payload.ts` → `type NinaPushKind = (typeof NINA_PUSH_KINDS)[number]`. **Phase 5 imports
  this through the relative specifier `../../lib/push/payload.ts`**, which is why it is in
  `payload.ts` and not `send.ts`.
- `lib/push/send.ts` → `type NinaPushNotifier = (userId: string, messages: ReadonlyArray<{ id:
  string; body: string }>, kind: NinaPushKind) => Promise<void>`. Offered to phases 2–4 as the type
  for a `deps.notify` seam; the exact shape of `ProactiveNotifier` with the wider `kind`.
- `lib/push/send.ts` → `export const notifyNinaPush: NinaPushNotifier`. **The function phases 2, 3
  and 4 call.** Positional `(userId, messages, kind)`, deliberately identical to
  `ProactiveNotifier`'s parameter list so `SentBubble[]` and the proactive `bubbles` array are both
  assignable with no mapping. **Returns `Promise<void>`, not a report** — a caller that branched on
  `delivered` would make a message's success depend on a phone's reachability. **It never throws**
  and logs both outcomes (`console.info('[push] notified', …)` on success, `console.warn('[push]
  notify failed', …)` on a rejection).
- `lib/push/send.test.ts` — new file (see Step 5).

**Signature changes:** none. In particular `sendNinaPush(userId, messages, kind: string)` keeps its
`kind: string`, and `buildNinaPushPayload({ messages, kind: string })` keeps its — the wire field
stays an opaque string because `lib/service-worker.js` reads it with no type system (invariant 5).

**Behaviour-preserving edit to an existing symbol:** `pushNotifier` gains one typed local,
`const pushKind: NinaPushKind = kind`, and passes it to `sendNinaPush` instead of `kind`. Runtime
is identical (same value, same call, same log line, same `satisfies ProactiveNotifier`). The
annotation is the **compile-time proof that `ProactiveTriggerKind` is a subset of `NinaPushKind`** —
see Step 3 for why it has to live there and nowhere else.

**Requires (from earlier phases):** nothing. This phase is the root of the set.

**Leaves alone (owned by others):** `lib/nina/turnrun.ts` (Phase 2), `lib/nina/imagerun.ts` and
`lib/nina/imagejobs.ts` (Phase 3), `lib/admin/chatPhotoActions.ts` (Phase 4),
`scripts/nina-image-worker/**` and `.github/workflows/nina-image.yml` (Phase 5). Also untouched by
anyone in this set: `lib/nina/proactive.ts` (invariant 1), `lib/push/queries.ts`,
`lib/push/actions.ts`, `lib/service-worker.js`, `lib/db/schema/push.ts`, `components/push/*`.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/push/payload.ts` | modify | add `NINA_PUSH_KINDS` + `NinaPushKind` above the payload contract (after line 138); re-word the `kind` field's doc comment (line 161) |
| `lib/push/send.ts` | modify | add `type NinaPushKind` to the `./payload` import (line 6–12); add `NinaPushNotifier` + `notifyNinaPush` after `sendNinaPush` (after line 194); add the typed local to `pushNotifier` (line 205–208) |
| `lib/push/payload.test.ts` | modify | add a `describe('NINA_PUSH_KINDS')` block at the end; extend the import list |
| `lib/push/send.test.ts` | create | the first test for the sender: `notifyNinaPush` swallows, `pushNotifier` still propagates |

## Implementation Steps

### Step 1: The kind vocabulary, in `payload.ts`

**File:** `lib/push/payload.ts:139` — inserted between `parsePushSubscription`'s closing brace
(line 138) and the `── THE PAYLOAD CONTRACT WITH lib/service-worker.js ──` comment block (line 140).

**Change:** add the closed list of kinds and its type, in the repo's established
`as const` + `(typeof X)[number]` idiom (`lib/admin/avatars.ts:34`, `lib/extract/constants.ts:21`,
`lib/metrics/week.ts:18`). It goes in `payload.ts` and not `send.ts` because `send.ts` opens with
`import 'server-only'` and reaches `@/lib/env` and the database, none of which
`node --experimental-strip-types` can resolve for phase 5's worker.

**Code:**

```ts
/**
 * ── THE KIND VOCABULARY, AND WHY IT LIVES IN THIS FILE ────────────────────────────────────────
 * Every push this app sends is stamped with one of these. `kind` is diagnostics only — it reaches
 * the wire, the log line and nothing else — but it is a CLOSED list anyway, because it is the one
 * field of the payload a human reads at 2am to answer "which of the seven places Nina writes a
 * message sent this?", and a free string answers that question with typos.
 *
 * **It is here rather than in `send.ts` for one reason, and the reason is load-bearing.**
 * `send.ts` opens with `import 'server-only'` and reaches `lib/env` and the database through `@/`
 * aliases. The off-platform image worker (`scripts/nina-image-worker/*`) runs under
 * `node --experimental-strip-types` with no bundler: it cannot resolve `@/`, it cannot import
 * `server-only`, and it reaches this module through a relative `../../lib/push/payload.ts`
 * specifier. This file has no `server-only` and no I/O — that is its entire design — so the
 * vocabulary is importable from both worlds and there is one list rather than two.
 *
 * **For the same reason this file does not import `ProactiveTriggerKind`.** The first five entries
 * are that union spelled out by hand; importing it would drag `@/lib/nina/prompts` into a module
 * the worker loads. The two lists are pinned together by the `NinaPushKind` annotation in
 * `send.ts`'s `pushNotifier` — the one place that legitimately knows about both — so adding a
 * trigger without adding it here fails `npx tsc --noEmit` at that seam.
 */
export const NINA_PUSH_KINDS = [
  /* `ProactiveTriggerKind` verbatim (lib/nina/prompts/system.ts:561). She opened the conversation;
   * `emitProactiveMessage` passes `detail.kind` straight through, so these ARE the trigger names
   * and renaming one here would change what a push says it is without changing what sends it. */
  'run_committed',
  'missed_usual_day',
  'pattern_crossed',
  'silence',
  'avatar_changed',

  /* The "Send me a test" button on `/me`. `lib/push/actions.ts` passes this literal as a bare
   * string and is deliberately not typed to this union ("this is not a trigger", its own comment);
   * it is listed so that narrowing it one day is a rename and not a decision. */
  'manual_test',

  /* One kind per message write. The log line is the only place anyone will ever reconstruct which
   * of them buzzed the phone, so each gets its own name rather than sharing 'photo'.
   *
   * ── THE TWO HOSTS DELIBERATELY DO NOT SHARE A KIND ──────────────────────────────────────────
   * A delivered photograph is written by TWO different processes — `lib/nina/imagerun.ts` in the
   * app and `scripts/nina-image-worker/finish.ts` on a GitHub runner — and the apology likewise.
   * They get `photo_delivered`/`photo_apology` and `worker_photo_*` rather than one value each,
   * because `kind` is diagnostics only and "which host delivered this photograph" is EXACTLY the
   * diagnostic the off-platform backstop exists to produce: the worker only runs when the app's
   * own invocation was killed, so a `worker_*` line in the log is the signal that the backstop
   * fired. Collapsing the pairs would destroy that signal and leave nothing in its place. Do not
   * "tidy" them back together. */
  /** Her reply to something he said — every chat turn, including resends, revives and the chain. */
  'chat_reply',
  /** The photograph he asked for, delivered by the in-platform run. */
  'photo_delivered',
  /** R22's apology, when the photograph he asked for could not be made. */
  'photo_apology',
  /** A photo added to her chat from `/admin`. */
  'admin_chat_photo',
  /** The photograph he asked for, delivered by the off-platform backstop worker. */
  'worker_photo_delivered',
  /** R22's apology, written by the off-platform backstop worker when it gave the photograph up. */
  'worker_photo_apology',
] as const

/**
 * The closed set above, as a type. `buildNinaPushPayload` still takes `kind: string` on purpose:
 * the service worker reads that field with no type system and may be a version older than the
 * server pushing to it, so the WIRE contract stays "an opaque string" (invariant 5) and this union
 * is caller-side discipline rather than a new wire constraint. Adding a value is an addition, not
 * a meaning change, and `v` stays `1`.
 */
export type NinaPushKind = (typeof NINA_PUSH_KINDS)[number]
```

**Impact:** two new exports from a module that has no `server-only` and no I/O, so it stays
importable from the Server Actions, the sender, the tests and (phase 5) a plain node script. No
existing export changes.

---

### Step 2: Re-word the payload's `kind` field comment

**File:** `lib/push/payload.ts:161` — inside `interface NinaPushPayload`.

**Change:** the current comment says `Phase 10's ProactiveTriggerKind, as an opaque string.` That
is now wrong in the direction that matters: after Step 1 the value is a `NinaPushKind`, of which
the trigger union is a five-member subset. Say so, and say why the field's *type* stays `string`.

**Code** — the replacement for line 161's one-line comment (the `kind: string` line below it is
unchanged):

```ts
  /**
   * A `NinaPushKind` (see `NINA_PUSH_KINDS` above), as an opaque string. Diagnostics only, and
   * typed `string` rather than `NinaPushKind` ON PURPOSE: `lib/service-worker.js` reads this field
   * with no type system and may be a registration older than the deploy that is pushing to it, so
   * a kind added this week must not break a worker installed last week. Adding a value is an
   * addition, never a meaning change — `v` stays `1`.
   */
  kind: string
```

**Impact:** comment only. No type changes, no behaviour change.

---

### Step 3: The caller-facing notifier, in `send.ts`

**File:** `lib/push/send.ts:195` — inserted between `sendNinaPush`'s closing brace (line 194) and
the `Phase 10's ProactiveDeps.notify default` comment block above `pushNotifier` (line 196).

**Change:** add `NinaPushNotifier` and `notifyNinaPush`. This is the whole reason the phase exists.

Two facts that shaped the code below, both verified against this worktree rather than assumed:

1. **`sendNinaPush` really can reject.** `configureVapid()` is inside a `try` (lines 158–162) and
   every per-subscription failure is swallowed by `sendPushToSubscription` — but
   `await listLivePushSubscriptions(userId)` at line 164 is a database round trip *outside* any
   `try`. A dropped Neon connection rejects straight out of `sendNinaPush`. Confirmed by driving
   the real module with `./queries` mocked to reject: `sendNinaPush(...)` rejects with the same
   error. So `notifyNinaPush`'s `catch` is the difference between "a phone was unreachable" and
   "the turn threw", not decoration.
2. **`pushNotifier` must not be refactored to delegate to it.** See Step 4.

**Code:**

```ts
/**
 * ── THE SEAM EVERY MESSAGE WRITER CALLS ───────────────────────────────────────────────────────
 * `sendNinaPush` above is the mechanism; this is the door. Four modules outside `lib/push` are
 * about to knock on it — the chat turn, the delivered photograph, R22's apology and the `/admin`
 * chat photo — and all four are in the same position: the rows are already committed, the
 * notification is a courtesy, and nothing they do afterwards may depend on it.
 *
 * ── WHY NOT JUST EXPORT `pushNotifier` AND BE DONE ────────────────────────────────────────────
 * Because `pushNotifier` is declared `satisfies ProactiveNotifier`, which INFERS its `kind`
 * parameter as `ProactiveTriggerKind`. `pushNotifier(userId, bubbles, 'chat_reply')` is a compile
 * error, and widening `ProactiveNotifier` to fix that would edit `lib/nina/proactive.ts` — the one
 * file this plan set may not touch, because it is already correct and is the pattern the other
 * four writers copy. This function takes the wider `NinaPushKind` instead and leaves that file
 * alone.
 *
 * ── IT SWALLOWS, AND THAT IS NOT BELT-AND-BRACES ──────────────────────────────────────────────
 * `sendNinaPush` catches the VAPID failure and every per-subscription failure, but
 * `listLivePushSubscriptions` is a database round trip OUTSIDE its `try` — a dropped connection
 * rejects straight out of it. Every caller is still expected to wrap this in its own `try`, the
 * way `proactive.ts:702` does; this `catch` is what makes forgetting survivable instead of turning
 * an unreachable phone into a failed turn.
 */
export type NinaPushNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
) => Promise<void>

/**
 * Annotated rather than `satisfies`, unlike `pushNotifier` below: the type it conforms to is
 * declared three lines up, so there is no other file for a mismatch to surface in, and the
 * annotation types the three parameters contextually instead of restating them.
 *
 * **Returns `void`, not the report.** A caller that branched on `delivered` would be making a
 * message's success depend on a phone's reachability, which is exactly the coupling invariant 2
 * forbids. The numbers go to the log line, which is the only consumer they have ever had.
 */
export const notifyNinaPush: NinaPushNotifier = async (userId, messages, kind) => {
  try {
    const report = await sendNinaPush(userId, messages, kind)
    console.info('[push] notified', { userId, kind, ...report })
  } catch (cause) {
    /* The message row is already committed and the caller has already moved on: there is nothing
     * to retry against and nobody left to tell. This line is the whole of the error handling, and
     * it is deliberate. */
    console.warn('[push] notify failed', { userId, kind, error: String(cause) })
  }
}
```

And the import at `lib/push/send.ts:6–12` gains the type — types last, matching the existing
ordering in that block:

```ts
import {
  buildNinaPushPayload,
  classifyPushFailure,
  encodeNinaPushPayload,
  shouldRevokeSubscription,
  type NinaPushKind,
  type NinaPushPayload,
} from './payload'
```

**Impact:** two new exports. No existing function's signature or body changes in this step. Phases
2, 3 and 4 now have something to call; phase 5 does not use this function (it has `server-only` and
`@/` imports) and takes only `payload.ts`'s exports.

---

### Step 4: Pin `ProactiveTriggerKind ⊆ NinaPushKind`, inside `pushNotifier`

**File:** `lib/push/send.ts:205–208` (line numbers as they stand today; after Step 3 this block has
moved down by the length of the insert).

**Change:** one typed local. `payload.ts` cannot import `ProactiveTriggerKind` (Step 1's comment
says why), so the five trigger names are duplicated there by hand — and a hand-copied list needs a
mechanical pin or it drifts the first time someone adds a sixth trigger. `pushNotifier` is the
**only** place in the codebase that holds both types at once: its `kind` parameter is inferred as
`ProactiveTriggerKind` by the `satisfies`, and it is in `send.ts`, which can import `NinaPushKind`.
Annotating a local there is exhaustive, is checked by `npx tsc --noEmit`, and costs no runtime.

Two alternatives were considered and rejected:

- **Make `pushNotifier` delegate to `notifyNinaPush`.** It would get the same check for free and
  remove the two-line duplication — and it would be a behaviour change. `proactive.ts:702–706`
  wraps its `notify` call in a `try` that warns `[nina proactive] notify failed`; a notifier that
  swallows makes that arm dead code and changes what a dropped connection logs. Invariant 1 says
  `proactive.ts` keeps behaving byte-identically, so the duplication stays.
- **A free-standing exported assertion type**, in the shape of `_distanceBucketsComplete`
  (`lib/metrics/week.ts:43`). Legitimate here — the repo already does it — but it would be a
  second construct that has to be found and understood, when the seam that needs the guarantee is
  already a function that holds both types.

**Code** — the complete replacement for `pushNotifier` (its header comment is unchanged above; the
body gains one line and one comment block):

```ts
export const pushNotifier = (async (userId, messages, kind) => {
  /* ── THE SUBSET PIN, AND WHY IT IS AN ANNOTATION AND NOT A COMMENT ─────────────────────────
   * `kind` here is `ProactiveTriggerKind` (inferred from the `satisfies` below), and
   * `NINA_PUSH_KINDS` in `payload.ts` spells those five trigger names out by hand because that
   * module may not import from `lib/nina/*` — phase 5's off-platform worker loads it through a
   * relative specifier under `node --experimental-strip-types` and cannot resolve `@/`.
   *
   * This annotation is what stops the two lists drifting. Add a sixth trigger to
   * `ProactiveTriggerKind` without adding it to `NINA_PUSH_KINDS` and `npx tsc --noEmit` fails
   * HERE, at the only seam that knows about both. It is erased at runtime: `sendNinaPush` receives
   * exactly the string it received before. */
  const pushKind: NinaPushKind = kind
  const report = await sendNinaPush(userId, messages, pushKind)
  console.info('[push] notified', { userId, kind, ...report })
}) satisfies ProactiveNotifier
```

**Impact:** none at runtime — same value, same call, same log line, same `satisfies`. At compile
time, a trigger added to `lib/nina/prompts/system.ts` without a matching entry in
`NINA_PUSH_KINDS` now fails the typecheck.

**Verified, not assumed.** A throwaway replica of Steps 1, 3 and 4 was built in this worktree and a
sixth member (`'sixth_trigger'`) was temporarily added to `ProactiveTriggerKind`. `npx tsc --noEmit`
failed on the `pushKind` line with `TS2322: Type 'ProactiveTriggerKind' is not assignable to type
'"run_committed" | … | "worker_photo_delivered"'`, alongside the two pre-existing
`Record<ProactiveTriggerKind, …>` errors inside `system.ts` itself. The replica and the temporary
edit were removed; the worktree is clean.

---

### Step 5: `lib/push/send.test.ts` — the sender's first test

**File:** `lib/push/send.test.ts` — new file, co-located, matching `lib/push/payload.test.ts`'s
placement (`vitest.config.ts` includes `lib/**/*.test.ts`).

**Change:** create it. The whole file below was run in this worktree against a throwaway replica of
the Step 1/3/4 edits (7 cases, all green) and passes `npx tsc --noEmit`, `npm run lint` and
`npm run format:check` as written. Together with Step 6's six cases that is 13 passing cases; the
replica has been deleted.

Invariant 7 (no test reaches a real push service) is enforced at the module boundary here, not by
hoping no `VAPID_*` is set locally: `web-push`, `@/lib/env` and `./queries` are all mocked. The
`@/lib/env` mock **succeeds** on purpose — the "no keys" path is already `sendNinaPush`'s own
`skipped` branch, and the cases this phase needs are "the send worked" and "the database did not".

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NinaPushKind } from './payload'

/**
 * ── WHY THIS FILE MOCKS THREE MODULES AND NOT ZERO ────────────────────────────────────────────
 * `send.ts` is the one place this app talks to a push service, so the only honest way to exercise
 * it is to replace the three things it touches: `web-push` (the network), `@/lib/env` (the VAPID
 * credentials, which are Production-scope on Vercel and absent from every test run) and
 * `./queries` (the database). Plan invariant 7 — no test may reach a real push service — is
 * enforced here, at the module boundary, rather than by hoping nobody ever exports a VAPID key
 * into their shell.
 *
 * The `@/lib/env` mock SUCCEEDS deliberately. "No keys" is already `sendNinaPush`'s own `skipped`
 * branch; what this phase adds is a wrapper, and its two interesting cases are "the send worked"
 * and "the database did not". `configureVapid` memoises `setVapidDetails` in module state, which
 * is why a working `pushEnv` is the useful fixture rather than a throwing one.
 */
vi.mock('web-push', () => ({
  WebPushError: class WebPushError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  },
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  pushEnv: () => ({
    VAPID_PUBLIC_KEY: 'unit-test-public-key',
    VAPID_PRIVATE_KEY: 'unit-test-private-key',
    VAPID_SUBJECT: 'mailto:unit@test.invalid',
  }),
}))

vi.mock('./queries', () => ({
  listLivePushSubscriptions: vi.fn(),
  recordPushSuccess: vi.fn(),
  recordPushFailure: vi.fn(),
}))

const { sendNotification } = await import('web-push')
const { listLivePushSubscriptions } = await import('./queries')
const { notifyNinaPush, pushNotifier, sendNinaPush } = await import('./send')

const SUBSCRIPTION = {
  id: 'sub-1',
  endpoint: 'https://push.example.test/ep-1',
  p256dh: 'fake-public-key',
  auth: 'fake-auth-secret',
  failureCount: 0,
}

/** One bubble, because `buildNinaPushPayload` takes the first non-blank one and drops the rest. */
const BUBBLES = [{ id: 'm1', body: 'udah sampai rumah?' }]

beforeEach(() => {
  /* `resetAllMocks`, not `clearAllMocks`: a `mockResolvedValueOnce` left unconsumed by a failing
   * test otherwise leaks into the next one's queue. */
  vi.resetAllMocks()
  vi.mocked(listLivePushSubscriptions).mockResolvedValue([SUBSCRIPTION])
  vi.mocked(sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('notifyNinaPush', () => {
  it('sends to every live subscription and logs the report', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await notifyNinaPush('user-1', BUBBLES, 'chat_reply')

    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(
      '[push] notified',
      expect.objectContaining({ userId: 'user-1', kind: 'chat_reply', delivered: 1 }),
    )
  })

  it('TAKES A KIND THE PROACTIVE UNION DOES NOT HAVE — the reason this function exists', async () => {
    /* The annotation on `kinds` is the real assertion, and `tsc` is what checks it: `pushNotifier`
     * is `satisfies ProactiveNotifier`, so its `kind` is inferred as `ProactiveTriggerKind` and
     * `'chat_reply'` does not typecheck against it. Narrow `notifyNinaPush` back to that union and
     * `npx tsc --noEmit` fails on these five literals, taking phases 2–5's door with it. `vitest`
     * does not typecheck, so a green `npm test` proves only the runtime half of this case. */
    const kinds: NinaPushKind[] = [
      'chat_reply',
      'photo_delivered',
      'photo_apology',
      'admin_chat_photo',
      'worker_photo_delivered',
      'worker_photo_apology',
    ]
    vi.spyOn(console, 'info').mockImplementation(() => {})

    for (const kind of kinds) {
      await notifyNinaPush('user-1', BUBBLES, kind)
    }

    expect(sendNotification).toHaveBeenCalledTimes(kinds.length)
  })

  it('SWALLOWS a rejected subscription read — the caller has already committed its row', async () => {
    /* `sendNinaPush` catches `pushEnv()` and every per-subscription failure, but
     * `listLivePushSubscriptions` is a database round trip outside its `try` and genuinely rejects
     * out of it. This is the whole job of the wrapper: invariant 2 says a push never fails the
     * message write it accompanies, and every call site is past its own commit by the time it
     * runs. */
    vi.mocked(listLivePushSubscriptions).mockRejectedValue(new Error('neon dropped the connection'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(notifyNinaPush('user-1', BUBBLES, 'chat_reply')).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      '[push] notify failed',
      expect.objectContaining({ userId: 'user-1', kind: 'chat_reply' }),
    )
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('attempts nothing when notifications are off, and says so', async () => {
    /* "Enabled" has exactly one meaning in this codebase — a `push_subscriptions` row with
     * `revoked_at IS NULL` — and this is the off case. It is a normal outcome, not an error. */
    vi.mocked(listLivePushSubscriptions).mockResolvedValue([])
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await notifyNinaPush('user-1', BUBBLES, 'chat_reply')

    expect(sendNotification).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(
      '[push] notified',
      expect.objectContaining({ attempted: 0, skipped: 'no live subscriptions' }),
    )
  })
})

describe('pushNotifier', () => {
  it('is unchanged: same log line, and it STILL PROPAGATES', async () => {
    /* Invariant 1, pinned. It would be tidy to make `pushNotifier` delegate to `notifyNinaPush` —
     * the bodies are two lines and nearly identical — and it would be a behaviour change:
     * `lib/nina/proactive.ts:702–706` wraps its notify call in a `try` that warns
     * `[nina proactive] notify failed`, and a notifier that swallows makes that arm dead code.
     * That file must behave byte-identically, so the duplication stays and this test is why. */
    vi.mocked(listLivePushSubscriptions).mockRejectedValue(new Error('neon dropped the connection'))

    await expect(pushNotifier('user-1', BUBBLES, 'silence')).rejects.toThrow('neon dropped')
  })

  it('still logs the report on a normal proactive send', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await pushNotifier('user-1', BUBBLES, 'silence')

    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(
      '[push] notified',
      expect.objectContaining({ userId: 'user-1', kind: 'silence', delivered: 1 }),
    )
  })
})

describe('sendNinaPush', () => {
  it('is untouched by this phase: it still fans out and still returns its report', async () => {
    /* A regression pin, not new coverage. Phase 1 promised to change nothing that exists, and the
     * report's five fields are what `sendTestPushAction` branches on. */
    const report = await sendNinaPush('user-1', BUBBLES, 'manual_test')

    expect(report).toEqual({
      attempted: 1,
      delivered: 1,
      pruned: 0,
      retryable: 0,
      skipped: null,
    })
  })
})
```

**Impact:** a new test file. No production code depends on it. `npm test` gains ~7 cases and stays
offline.

---

### Step 6: Extend `lib/push/payload.test.ts`

**File:** `lib/push/payload.test.ts:1–11` (the import block) and the end of the file (after the
final `})` of the `buildNinaPushPayload` describe).

**Change:** the import block gains `NINA_PUSH_KINDS` (uppercase consts first, as the block already
orders them) and `type NinaPushKind` (types last), plus a type-only import of
`ProactiveTriggerKind`. That `@/lib/nina/prompts` import is `import type`, so it is erased and
drags nothing into the module graph — and it is legal *here* precisely because a test file is not
the module phase 5's worker loads.

**Code** — the replacement import block:

```ts
import { describe, expect, it } from 'vitest'

import type { ProactiveTriggerKind } from '@/lib/nina/prompts'

import {
  NINA_PUSH_KINDS,
  PUSH_BODY_MAX_CHARS,
  PUSH_FAILURE_LIMIT,
  buildNinaPushPayload,
  classifyPushFailure,
  parsePushSubscription,
  shouldRevokeSubscription,
  truncateForNotification,
  type NinaPushKind,
} from './payload'
```

**Code** — the new block, appended at the end of the file:

```ts
describe('NINA_PUSH_KINDS', () => {
  /**
   * ── THE ONE THING IN THIS PHASE THAT CAN DRIFT ────────────────────────────────────────────
   * `payload.ts` may not import `ProactiveTriggerKind`: phase 5's off-platform worker loads that
   * module through a relative `../../lib/push/payload.ts` specifier under
   * `node --experimental-strip-types`, which cannot resolve `@/lib/nina/*`. So the five trigger
   * names are spelled out there by hand, and a hand-copied list needs a pin.
   *
   * This map is exhaustive in BOTH directions at compile time — a trigger added to
   * `ProactiveTriggerKind` and not here is a missing property, one removed is an excess property —
   * and it is the READABLE half of the guarantee. The load-bearing half is the `NinaPushKind`
   * annotation in `send.ts`'s `pushNotifier`, which `npx tsc --noEmit` checks whether or not this
   * file is ever run.
   */
  const TRIGGER_KINDS: Record<ProactiveTriggerKind, NinaPushKind> = {
    run_committed: 'run_committed',
    missed_usual_day: 'missed_usual_day',
    pattern_crossed: 'pattern_crossed',
    silence: 'silence',
    avatar_changed: 'avatar_changed',
  }

  /** One bubble with words in it, for the kind-passthrough case at the end of this block. */
  const BUBBLE = [{ id: 'm1', body: 'udah sampai rumah?' }]

  it('carries every proactive trigger, under its own name', () => {
    /* The values equalling the keys IS the assertion. `emitProactiveMessage` passes `detail.kind`
     * straight through to the notifier and on to the payload, so a trigger whose push kind were
     * renamed would change what a push says it is without changing anything that sends it. */
    expect(Object.values(TRIGGER_KINDS)).toEqual(Object.keys(TRIGGER_KINDS))
    for (const kind of Object.values(TRIGGER_KINDS)) {
      expect(NINA_PUSH_KINDS).toContain(kind)
    }
  })

  it("carries the /me test button's literal", () => {
    /* `lib/push/actions.ts` passes `'manual_test'` as a bare string and is deliberately not typed
     * to this union. Listing it means narrowing that call site one day is a rename, not a
     * decision about whether the value belongs. */
    expect(NINA_PUSH_KINDS).toContain('manual_test')
  })

  it('carries one kind per message write — THESE SIX NAMES ARE AN API', () => {
    /* Phases 2–5 import these literals: the chat reply, the photograph, R22's apology, the admin
     * chat photo, and the off-platform worker's photograph AND its apology. A rename that missed a
     * call site stops here rather than in a log line nobody reads for a month. */
    expect(NINA_PUSH_KINDS).toContain('chat_reply')
    expect(NINA_PUSH_KINDS).toContain('photo_delivered')
    expect(NINA_PUSH_KINDS).toContain('photo_apology')
    expect(NINA_PUSH_KINDS).toContain('admin_chat_photo')
    expect(NINA_PUSH_KINDS).toContain('worker_photo_delivered')
    expect(NINA_PUSH_KINDS).toContain('worker_photo_apology')
  })

  it('gives the two hosts DIFFERENT kinds for the same event, on purpose', () => {
    /* `photo_delivered` is the app's, `worker_photo_delivered` the GitHub runner's; same for the
     * two apologies. The worker only runs when the app's own invocation was killed, so the
     * `worker_*` value is the one diagnostic that says the backstop fired — and reaching the log
     * line is the only thing `kind` is for. A future tidy-up that collapsed either pair into one
     * value would pass every other test in this file, which is why this one is here: both members
     * of each pair are present, so neither can be quietly dropped in favour of the other. */
    expect(NINA_PUSH_KINDS).toEqual(
      expect.arrayContaining([
        'photo_delivered',
        'worker_photo_delivered',
        'photo_apology',
        'worker_photo_apology',
      ]),
    )
    expect(new Set(['photo_delivered', 'worker_photo_delivered']).size).toBe(2)
  })

  it('lists each kind exactly once', () => {
    expect(new Set(NINA_PUSH_KINDS).size).toBe(NINA_PUSH_KINDS.length)
  })

  it('stamps a non-proactive kind onto the payload unchanged', () => {
    /* The wire field stays an opaque string (invariant 5), so the new vocabulary must pass through
     * `buildNinaPushPayload` exactly the way `'some_future_trigger'` already does above. */
    const payload = buildNinaPushPayload({ messages: BUBBLE, kind: 'chat_reply' })
    expect(payload?.kind).toBe('chat_reply')
  })
})
```

**Impact:** six new cases in an existing file. No production code changes.

---

## Verification

**Build:** `cd /home/miftah/.worktrees/run-insights/nina-push-every-message && npm run typecheck`
— that is `next typegen && tsc --noEmit`. Run the typegen half: without it you get ~17
`Cannot find name 'PageProps'` errors from `app/**` that have nothing to do with this phase
(confirmed in this worktree today). `vitest` does not typecheck, so this is the gate that proves
Steps 1, 3, 4 and 6's type-level work.

**Lint:** `npm run lint` and `npm run format:check` (CI runs both; `.prettierrc.json` is
`printWidth: 100`, no semicolons, single quotes, trailing commas).

**Tests:** `npm test` — the whole suite, offline. Targeted: `npx vitest run lib/push`.

**Manual check:** none needed, and none possible — this phase ships no new call site, so nothing
buzzes a phone that did not buzz before. What *is* worth eyeballing:

- `git diff lib/push/send.ts` must show `pushNotifier`'s body gaining exactly one line
  (`const pushKind: NinaPushKind = kind`) plus its comment, and `sendNinaPush` completely
  unchanged.
- `lib/nina/proactive.ts` must not appear in `git status` at all (invariant 1).
- `grep -n "^import 'server-only'" lib/push/payload.ts` must print nothing (invariant 8), and
  `grep -n "@/" lib/push/payload.ts` must print nothing either — phase 5 depends on both.
- A proactive push is the existing behaviour and is covered by `tests/nina.proactive.test.ts`,
  which drives `deps.notify` and must still pass untouched.

**Exit criteria:**

1. `lib/push/payload.ts` exports `NINA_PUSH_KINDS` and `NinaPushKind` covering all twelve values in
   the Interface Contract table, with no `server-only` and no `@/` import in that file.
2. `lib/push/send.ts` exports `notifyNinaPush` and `NinaPushNotifier`, and
   `notifyNinaPush(u, m, 'chat_reply')` typechecks.
3. `pushNotifier` still compiles as `satisfies ProactiveNotifier` and still rejects on a database
   failure (`lib/push/send.test.ts` pins it).
4. `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` are all green.
5. No DDL, no migration, no new dependency, `NinaPushPayload.v` still `1`, `git status` shows only
   the four files in the Files table.

## Handoffs

**To phase 2 (`lib/nina/turnrun.ts`, R1).** Import `notifyNinaPush` and call it with
`'chat_reply'`. For the injectable seam the plan index asks for, type it as
`NinaPushNotifier` from `@/lib/push/send` rather than re-spelling the signature —
`SentBubble[]` (`turnrun.ts:64`, `{ id, body, replyToId }`) is structurally assignable to its
`ReadonlyArray<{ id: string; body: string }>` with no mapping. `notifyNinaPush` already swallows;
wrap it in your own `try` anyway, the way `proactive.ts:702–706` does, because that is the shape
invariant 2 names and because the swallow is a safety net, not a contract with your call site.

**To phase 3 (`lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts`, R1).** `'photo_delivered'` for the
delivered photograph, `'photo_apology'` for R22's apology. Same import, same `try`.

**To phase 4 (`lib/admin/chatPhotoActions.ts`, R2).** `'admin_chat_photo'`.

**To phase 5 (`scripts/nina-image-worker/`, R1).** `'worker_photo_delivered'` for the photograph
`finishSelfie` delivers, and `'worker_photo_apology'` for the apology `closeFailed` writes when it
gives that photograph up. **Both are deliberately distinct from phase 3's `'photo_delivered'` and
`'photo_apology'`**, which are the same two events on the in-platform host — see the comment in
Step 1: the backstop only runs when the app's invocation died, so the `worker_*` value is the one
diagnostic that says so. Import them and
`NinaPushKind` from `../../lib/push/payload.ts` — **that file, not `send.ts`**, which has
`server-only` and `@/` imports your loader cannot take. Two things to check on your side that this
phase did not: (a) `payload.ts` imports `zod`, a bare specifier, so confirm `zod` survives
`npm ci --omit=dev` in the workflow — if it does not, the import is the problem, not the vocabulary,
and the fix is yours to design; (b) `buildNinaPushPayload` and `encodeNinaPushPayload` are also in
`payload.ts` and are also `@/`-free, so you should not need to re-implement the payload shape.

**Deliberately not done here, and not anyone's in this set:**

- **`sendNinaPush`'s `kind` is still `string`, not `NinaPushKind`.** Narrowing it would compile
  today (`'manual_test'` is in the union) but it is an existing signature and this phase promised
  to change none. A later YAGNI pass can take it.
- **`buildNinaPushPayload`'s `kind: string` likewise**, and that one should probably stay forever:
  `lib/service-worker.js` reads the field with no type system and a registration can outlive a
  deploy (invariant 5).
- **`npm run knip` will report `NinaPushNotifier` as an unused export until phase 2 imports it.**
  knip counts a type used only inside its own declaring file as unused
  (`ignoreExportsUsedInFile: false`, deliberate — see `knip.ts`). knip is not a CI gate
  (`.github/workflows/ci.yml` runs the seven `ci:*` guards, `format:check`, `lint`, `typecheck`,
  `build` and `test`, and no knip step), so this does not fail anything. **Do not delete the export
  to silence it.**

## Rollback

`git revert` the phase's single commit. The four files return to their shipped state; nothing else
in the tree references the new exports, because phases 2–5 have not landed yet — and if they have,
revert them first (5→2, any order among themselves) or their imports will dangle. No schema, no
migration, no data, no wire-format change, and nothing deployed behaves differently either way:
this phase adds a door that nobody walks through until phase 2.
