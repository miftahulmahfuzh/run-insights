# Phase 2: Deep-link every chat push to its session and bubble

**Plan set:** `PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md`
**Analysis:** `20260916-084124-N9QZ_code_analyzer.md`
**Satisfies:** R2 — a notification tap lands on the correct bubble in the correct chat session, not
just on the chat tab
**Depends on:** none (Phase 1 is file-disjoint; neither phase's correctness depends on the other)
**Difficulty:** NORMAL
**Package:** `lib/push` (with `lib/nina`, `lib/admin`, `scripts/nina-image-worker`)

---

## Goal

After this phase, every chat-shaped push payload carries `url = '/nina?s=<sessionId>&jump=<messageId>'`
instead of bare `'/nina'` — where `messageId` is the same first-non-blank bubble
`buildNinaPushPayload` already names in `payload.messageId`, and `sessionId` is the session that
call site already wrote the row into. That is the exact URL grammar `ninaJumpHref`
(`lib/nina/jobview.ts:90`) already produces and `components/nina/useQuoteLanding.ts` already
consumes, so the scroll-and-flash landing fires on arrival with no change to the landing itself.
`duplicate_image`'s payload is byte-for-byte unchanged: an explicit `url` still always wins.

## Interface Contract

**Deletes:** none.

**Renames:** none.

**Creates:**
- `PUSH_SESSION_PARAM` (module-private const, `lib/push/payload.ts`) — the literal `'s'`, restated
- `PUSH_JUMP_PARAM` (module-private const, `lib/push/payload.ts`) — the literal `'jump'`, restated
- `ninaBubbleUrl` (module-private function, `lib/push/payload.ts`)

**Signature changes:**
- `buildNinaPushPayload({ messages, kind, url? })` -> `buildNinaPushPayload({ messages, kind, url?, sessionId? })` (`lib/push/payload.ts:283`)
- `sendNinaPush(userId, messages, kind, url?)` -> `sendNinaPush(userId, messages, kind, url?, sessionId?)` (`lib/push/send.ts:151`)
- `type NinaPushNotifier = (userId, messages, kind, url?) => Promise<void>` -> `(userId, messages, kind, url?, sessionId?) => Promise<void>` (`lib/push/send.ts:226`)
- `type NinaTurnNotifier = (userId, messages, kind) => Promise<unknown>` -> `(userId, messages, kind, url?, sessionId?) => Promise<unknown>` (`lib/nina/turnrun.ts:134`)
- `type ProactiveNotifier = (userId, messages, kind) => Promise<void>` -> `(userId, messages, kind, sessionId?) => Promise<void>` (`lib/nina/proactive.ts:481`)
- `sendWorkerPush(sql, userId, messages, kind, sendFn?)` -> `sendWorkerPush(sql, userId, messages, kind, sessionId?, sendFn?)` (`scripts/nina-image-worker/push.ts:286`) — **note the insertion position, see Design note below**
- `type WorkerNotifier = (sql, userId, messages, kind) => Promise<WorkerPushReport>` -> `(sql, userId, messages, kind, sessionId?) => Promise<WorkerPushReport>` (`scripts/nina-image-worker/push.ts:138`)

**Behaviour changes (no signature change):**
- `pushNotifier` (`lib/push/send.ts:266`) forwards its new contextual 4th parameter to `sendNinaPush`
- call sites at `lib/nina/turnrun.ts:604`, `lib/nina/imagerun.ts:496`, `lib/nina/imagejobs.ts:666`,
  `lib/admin/chatPhotoActions.ts:508`, `lib/nina/proactive.ts:703`,
  `scripts/nina-image-worker/finish.ts:234` and `:434` now pass a session

**Requires (from earlier phases):** nothing.

**Leaves alone (owned by others / out of scope):**
- `lib/service-worker.js`, `lib/nina/live.ts`, `components/push/*`, `app/layout.tsx` (Phase 1, R1)
- `lib/push/duplicateImage.ts` — untouched; it keeps passing its own `url` as the 4th argument and
  never passes a 5th
- `lib/nina/jobview.ts` (`ninaJumpHref`, `JOB_JUMP_PARAM`), `lib/nina/active.ts` (`SESSION_PARAM`),
  `components/nina/useQuoteLanding.ts` — read as the reference grammar, never modified
- `lib/push/actions.ts` (`manual_test`) — a test button with no session; keeps landing on `/nina`
- `ProactiveTriggerKind`, `NinaPushKind`, `NINA_PUSH_KINDS`, `NinaPushPayload`'s wire shape

### Design note — one deviation from the phase brief, and why

The brief says `sendWorkerPush` "gains a **trailing** optional `sessionId`". Taken literally that
produces `(sql, userId, messages, kind, sendFn?, sessionId?)` while `WorkerNotifier` becomes
`(sql, userId, messages, kind, sessionId?)` — and `scripts/nina-image-worker/finish.ts:113` and
`:341` both write `notify: WorkerNotifier = sendWorkerPush`. TypeScript compares parameter 5 of each
(`SendWorkerNotification | undefined` against `string | undefined`) and the assignment fails
`npx tsc --noEmit`. So `sessionId` goes in at position **5** and the `sendFn` test seam moves to
**6**, which is also this codebase's own ordering convention for an injected seam (`notify` last in
`finishSelfie`/`closeFailed`, `delFn` last in `releaseBlobIfUnreferenced`). The cost is twelve
one-line updates in `tests/nina.imageworker.test.ts`, each of which `tsc` flags loudly rather than
accepting silently. Steps 8 and 11 carry both halves.

The app-side notifiers keep `url` at position 4 and take `sessionId` at position 5, because moving
`url` would edit `lib/push/duplicateImage.ts` — which this phase may not touch. Three call sites
therefore pass an explicit `undefined` in the `url` slot; each gets a one-line comment saying so.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/push/payload.ts` | modify | `buildNinaPushPayload` gains `sessionId?`; two restated query-key literals + `ninaBubbleUrl` helper (`:20`, `:283-311`) |
| `lib/push/send.ts` | modify | `sendNinaPush` `:151`, `NinaPushNotifier` `:226`, `notifyNinaPush` `:245`, `pushNotifier` `:266` thread `sessionId?` |
| `lib/nina/turnrun.ts` | modify | `NinaTurnNotifier` `:134`; the `chat_reply` call `:604` |
| `lib/nina/imagerun.ts` | modify | the `photo_delivered` call `:496` |
| `lib/nina/imagejobs.ts` | modify | the `photo_apology` call `:666` |
| `lib/admin/chatPhotoActions.ts` | modify | the `admin_chat_photo` call `:508` (the `duplicate_image` branch at `:506` untouched) |
| `lib/nina/proactive.ts` | modify | `ProactiveNotifier` `:481`; the `notify(...)` call `:703` |
| `scripts/nina-image-worker/push.ts` | modify | `WorkerNotifier` `:138`; `sendWorkerPush` `:286-293` |
| `scripts/nina-image-worker/finish.ts` | modify | `finishSelfie`'s notify `:233-239`; `closeFailed`'s hoisted `apology` `:367`/`:391` and its notify `:434` |
| `lib/push/payload.test.ts` | modify | `buildNinaPushPayload`'s new input, directly (`:154-175`) |
| `lib/push/send.test.ts` | modify | two new cases: the wire `url` through `notifyNinaPush` and through `pushNotifier` |
| `lib/push/duplicateImage.test.ts` | modify | one regression assertion: still four arguments, no session |
| `tests/nina.turnpush.test.ts` | modify | four `toHaveBeenCalledWith` updates (`:209`, `:297`, `:300`, `:340`) |
| `tests/nina.imagerun.test.ts` | modify | two `toHaveBeenCalledWith` updates (`:354`, `:368`) |
| `tests/nina.imagepush.test.ts` | modify | two `toHaveBeenCalledWith` updates (`:109`, `:188`) |
| `tests/admin.chatPhotos.test.ts` | modify | one `toHaveBeenCalledWith` update (`:979`) |
| `tests/nina.imageworker.test.ts` | modify | twelve `sendWorkerPush` call updates + the wire-format assertion (`:984`) + one new fallback case + two call-site session assertions |

---

## Implementation Steps

### Step 1: `payload.ts` — the deep link, built where both hosts can reach it

**File:** `lib/push/payload.ts:20` (add after `PUSH_TARGET_URL`)
**Change:** add the two restated query-key literals. They sit directly under `PUSH_TARGET_URL`
because the three of them are one URL.
**Code:**
```ts
/** Where a tap lands. Also the URL the service worker looks for among open windows to focus. */
const PUSH_TARGET_URL = '/nina'

/**
 * ── THE TWO QUERY KEYS OF THE CHAT DEEP LINK, RESTATED RATHER THAN IMPORTED ───────────────────
 * `'s'` is `SESSION_PARAM` (`lib/nina/active.ts:36`) and `'jump'` is `JOB_JUMP_PARAM`
 * (`lib/nina/jobview.ts:68`). Together they are `ninaJumpHref`'s output
 * (`lib/nina/jobview.ts:90`) — the URL `/nina/jobs/[id]`'s "Buka chat-nya" link and every search
 * hit already use, and the one `components/nina/useQuoteLanding.ts` consumes on arrival to scroll
 * the named bubble into the band above the composer and flash it.
 *
 * **They are written twice on purpose.** This module has no imports beyond `zod` — that is its
 * whole design — so that `scripts/nina-image-worker/` can load it through a relative
 * `../../lib/push/payload.ts` specifier under `node --experimental-strip-types`, with no bundler
 * and no `@/` resolution. Both files that own these names are unreachable from here: `active.ts`
 * and `jobview.ts` each import through `@/`. `WORKER_PUSH_TTL_SECONDS`
 * (`scripts/nina-image-worker/push.ts:92`) is the identical trade in the other direction and says
 * so in the same words.
 *
 * **KEEP IN STEP WITH** `SESSION_PARAM` and `JOB_JUMP_PARAM`. Renaming either there without
 * renaming it here fails no build — it lands every push on a chat that ignores the query string it
 * was sent with, which is exactly the class of bug this comment exists to make expensive to cause.
 */
const PUSH_SESSION_PARAM = 's'
const PUSH_JUMP_PARAM = 'jump'
```
**Impact:** none at runtime yet; two module-private constants.

---

### Step 2: `payload.ts` — `ninaBubbleUrl` and `buildNinaPushPayload`'s new input

**File:** `lib/push/payload.ts:274-311` (replace the doc block + function wholesale)
**Change:** add the URL builder immediately above `buildNinaPushPayload`, and give the function its
optional `sessionId`. The precedence is `url` > derived-from-`sessionId` > bare `PUSH_TARGET_URL`.
`first.id` is reused, never recomputed — the `messageId` the payload reports and the `jump=` the URL
carries are the same value by construction.
**Code:**
```ts
/**
 * `/nina?s=<sessionId>&jump=<messageId>` — the chat URL that opens one session and pinpoints one
 * bubble. `ninaJumpHref`'s output (`lib/nina/jobview.ts:90`), built with `URLSearchParams` for the
 * reason that function gives: each key is spelled once and the encoding is the platform's.
 *
 * **No session means bare `/nina`, and that is not a degradation to fix.** A `jump` on its own
 * names nothing — `JOB_JUMP_PARAM`'s own note is "`s` is not optional", because a message id means
 * nothing outside its own conversation. An EMPTY session string is treated the same way:
 * `parseNinaSessionParam` would reject it on arrival, and the chat would then open whichever
 * session was most recently active while still consuming the `jump` against it, which is a
 * flash on the wrong bubble rather than no flash at all.
 */
function ninaBubbleUrl(sessionId: string | undefined, messageId: string): string {
  if (sessionId == null || sessionId.length === 0) return PUSH_TARGET_URL
  const params = new URLSearchParams()
  params.set(PUSH_SESSION_PARAM, sessionId)
  params.set(PUSH_JUMP_PARAM, messageId)
  return `${PUSH_TARGET_URL}?${params.toString()}`
}

/**
 * **Phase 10 hands over `bubbles` in reveal order**, so the first non-blank bubble is the first
 * thing she says and it is the notification body. The remaining bubbles are deliberately NOT
 * concatenated: the notification is a knock on the door, not the conversation, and a four-bubble
 * wall of text in a lock screen destroys the staggered reveal that RU-5 chose on purpose.
 *
 * The title is her name and never the message, because a notification whose title is the message
 * and whose body is empty renders differently on every platform.
 */
export function buildNinaPushPayload(input: {
  messages: ReadonlyArray<{ id: string; body: string }>
  kind: string
  /**
   * Where a tap goes. **Omitted means the deep link below, or `/nina` when there is no session.**
   *
   * ── IT WINS OVER `sessionId`, AND THAT ORDER IS LOAD-BEARING ─────────────────────────────
   * `notifyDuplicateImagePush` (`lib/push/duplicateImage.ts`) passes `/photo/<kind>/<id>` and no
   * session: that notification is about an UPLOAD, not a bubble, and must never be rewritten into
   * a chat link. An explicit destination is a caller saying it knows better than the derivation,
   * and it does.
   *
   * ── IT MUST BE A SAME-ORIGIN PATH ────────────────────────────────────────────────────────
   * `NinaPushPayload.url`'s contract, and `lib/service-worker.js:44`'s `FALLBACK_URL` is what
   * happens when it is not: a value the worker cannot use lands the tap on `/nina` instead of on
   * the thing the notification was about. Not validated here — the only producer is
   * `photoViewerPath` (`lib/photos/pointer.ts`), whose own test freezes the shape, and a
   * validator in this file would be a second, weaker statement of the same rule that this module
   * (no imports beyond `zod`, loadable by a strip-types script) cannot share with it.
   */
  url?: string
  /**
   * The session the bubbles were written into. Given one, and given no explicit `url`, the tap
   * opens THAT conversation and flashes THAT bubble instead of landing on whichever session was
   * most recently active with no scroll at all.
   *
   * Optional, and the fallback is permanent: `lib/push/actions.ts`'s `manual_test` button has no
   * session to name, and a future caller that has none must not be forced to invent one.
   */
  sessionId?: string
}): NinaPushPayload | null {
  const first = input.messages.find((message) => message.body.trim().length > 0)
  if (!first) return null
  return {
    v: 1,
    title: PUSH_TITLE,
    body: truncateForNotification(first.body),
    /* `first.id` and not a second selection: the bubble the body was drawn from, the row
     * `messageId` names below and the one `?jump=` points at are ONE value, so the landing can
     * never flash a bubble other than the one the lock screen showed. */
    url: input.url ?? ninaBubbleUrl(input.sessionId, first.id),
    tag: PUSH_NOTIFICATION_TAG,
    messageId: first.id,
    kind: input.kind,
  }
}
```
**Impact:** every caller that passes neither `url` nor `sessionId` is byte-identical to today. `v`
stays `1` — a field's *value* changed shape, not its meaning, and `lib/service-worker.js` already
reads `url` as an opaque same-origin path.

---

### Step 3: `send.ts` — thread `sessionId` through the sender and the door

**File:** `lib/push/send.ts:151-163` (signature + first line of `sendNinaPush`)
**Change:** trailing optional parameter, passed straight into the payload builder.
**Code:**
```ts
export async function sendNinaPush(
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: string,
  /**
   * Where a tap goes. Omitted means the `sessionId` deep link below, or `/nina` when there is no
   * session either. Appended rather than folded into an options object because the four positional
   * arguments read as a sentence and an options bag for one optional field would churn six call
   * sites to say nothing.
   */
  url?: string,
  /**
   * The session the bubbles were written into, so the tap opens the right conversation and flashes
   * the right bubble (`/nina?s=…&jump=…`). Ignored when `url` is given — an explicit destination
   * wins, which is what `notifyDuplicateImagePush` relies on.
   *
   * It is appended AFTER `url` rather than before it because `notifyDuplicateImagePush` passes
   * `url` positionally and this plan does not touch that file.
   */
  sessionId?: string,
): Promise<PushSendReport> {
  const payload = buildNinaPushPayload({ messages, kind, url, sessionId })
  if (!payload) return NOTHING('no message body to send')
```
(the rest of `sendNinaPush`, from `try { configureVapid() }` to `return report`, is unchanged)
**Impact:** `lib/push/actions.ts:93` (`manual_test`) passes neither and is unchanged.

**File:** `lib/push/send.ts:226-231` (the `NinaPushNotifier` type)
**Code:**
```ts
export type NinaPushNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
  url?: string,
  sessionId?: string,
) => Promise<void>
```

**File:** `lib/push/send.ts:245` (the `notifyNinaPush` implementation)
**Change:** one more parameter, threaded. The doc block above it (`:233-244`) gains one sentence.
**Code:**
```ts
export const notifyNinaPush: NinaPushNotifier = async (userId, messages, kind, url, sessionId) => {
  try {
    const report = await sendNinaPush(userId, messages, kind, url, sessionId)
    console.info('[push] notified', { userId, kind, ...report })
  } catch (cause) {
    /* The message row is already committed and the caller has already moved on: there is nothing
     * to retry against and nobody left to tell. This line is the whole of the error handling, and
     * it is deliberate. */
    console.warn('[push] notify failed', { userId, kind, error: String(cause) })
  }
}
```
**Impact:** `notifyDuplicateImagePush` still calls this with exactly four arguments; `sessionId`
arrives `undefined` and the explicit `url` wins regardless.

**File:** `lib/push/send.ts:266-280` (`pushNotifier`)
**Change:** accept the 4th parameter `ProactiveNotifier` now declares (Step 7) and forward it.
**Code:**
```ts
export const pushNotifier = (async (userId, messages, kind, sessionId) => {
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
  /* `undefined` in the `url` slot, deliberately: a proactive trigger has no destination of its own
   * to name, so the URL is DERIVED from the session and the first bubble by `buildNinaPushPayload`.
   * `url` sits before `sessionId` because `notifyDuplicateImagePush` passes it positionally. */
  const report = await sendNinaPush(userId, messages, pushKind, undefined, sessionId)
  console.info('[push] notified', { userId, kind, ...report })
}) satisfies ProactiveNotifier
```
**Impact:** none until Step 7 widens `ProactiveNotifier` — until then `sessionId` is inferred as
`any`-free `never`-free contextual `undefined` and `tsc` errors. **Do Step 7 in the same commit.**

---

### Step 4: `turnrun.ts` — the `chat_reply` seam and its call

**File:** `lib/nina/turnrun.ts:134-138` (the `NinaTurnNotifier` type)
**Change:** mirror `NinaPushNotifier`'s parameter list exactly, `url` slot included. That is not
cosmetic: `runNinaBackgroundTurn` does `deps.notify ?? notifyNinaPush`, so if this type declared
`sessionId` at position 4 the real notifier would still read position 4 as `url` and every chat push
would ship a session id as its tap destination — a silent, typechecking bug. Mirroring makes the
two positions mean the same thing on both sides.
**Code:**
```ts
export type NinaTurnNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
  /**
   * `NinaPushNotifier`'s `url` slot, mirrored rather than dropped. This file never passes one — the
   * destination is derived from `sessionId` below — but the DEFAULT for this seam is
   * `notifyNinaPush`, which reads position 4 as `url`. A type that named `sessionId` here would
   * typecheck (both are `string`) and would send every chat push to a tap target called
   * `ses000000001`.
   */
  url?: string,
  /** The session the bubbles were committed to, so the tap opens it and flashes the first bubble. */
  sessionId?: string,
) => Promise<unknown>
```

**File:** `lib/nina/turnrun.ts:602-608` (the call, inside the `bubbles.length > 0` guard)
**Change:** pass the turn's own session. `sessionId` is already destructured from `input` at `:185`.
**Code:**
```ts
    if (bubbles.length > 0) {
      try {
        /* `undefined` in the `url` slot: this push has no destination of its own to name, so
         * `buildNinaPushPayload` derives `/nina?s=…&jump=…` from the session and the first
         * non-blank bubble. `sessionId` is `input`'s, destructured at the top of this function —
         * the same session the rows above were committed to. */
        await notify(userId, bubbles, 'chat_reply', undefined, sessionId)
      } catch (cause) {
        console.warn('[nina] reply notify failed', { turnId, error: String(cause) })
      }
    }
```
**Impact:** the chained follow-up recurses through `runNinaBackgroundTurn` with the same
`sessionId`, so the second push deep-links to the same conversation and its own newest bubble.

---

### Step 5: `imagerun.ts` — the delivered photograph

**File:** `lib/nina/imagerun.ts:495-499` (inside `finishSelfie`)
**Change:** pass the local `sessionId` bound at `:303`
(`quoted?.sessionId ?? (await resolveNinaWriteSession(userId))`) — the very session the message row
was written into a few lines above.
**Code:**
```ts
  try {
    /* `undefined` in the `url` slot, then the session: the tap opens the conversation this
     * photograph landed in and flashes its bubble, instead of opening whichever session happens to
     * be most recently active. `sessionId` is the one bound at the top of this function and used
     * for the insert — the notification cannot point at a different conversation than the row. */
    await notifyNinaPush(
      userId,
      [{ id: message.id, body: caption }],
      'photo_delivered',
      undefined,
      sessionId,
    )
  } catch (cause) {
    console.warn('[nina] photo notify failed', { jobId, error: String(cause) })
  }
```
**Impact:** none beyond the payload's `url`; the `try` and its warning are unchanged.

---

### Step 6: `imagejobs.ts` — R22's apology

**File:** `lib/nina/imagejobs.ts:664-670` (inside `postNinaApologyMessage`)
**Change:** pass the `sessionId` already resolved at `:619` by `resolveNinaSessionForMessage` and
already handed to `insertNinaMessages` at `:636`.
**Code:**
```ts
  if (apology != null) {
    try {
      /* `undefined` in the `url` slot, then the session the apology row was written into (`:619`,
       * the same value `insertNinaMessages` was given): the tap opens that conversation and
       * flashes the sentence, rather than landing on the chat tab in general. */
      await notifyNinaPush(
        input.userId,
        [{ id: apology.id, body }],
        'photo_apology',
        undefined,
        sessionId,
      )
    } catch (cause) {
      console.warn('[nina] apology notify failed', { jobId: input.jobId, error: String(cause) })
    }
  }
```
**Impact:** none beyond the payload's `url`.

---

### Step 7: `proactive.ts` — widen the notifier, pass the emit's own session

**File:** `lib/nina/proactive.ts:480-485` (the `ProactiveNotifier` type)
**Change:** one additive optional parameter. Every existing implementation with three declared
parameters stays assignable, which is why this is safe to widen rather than fork.
**Code:**
```ts
/** Implemented by `lib/push/send.ts`. Called AFTER the rows are committed, never instead of writing. */
export type ProactiveNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: ProactiveTriggerKind,
  /**
   * The session her opening was written into, so the tap opens THAT conversation and flashes the
   * first bubble (`/nina?s=…&jump=…`) instead of landing on whichever session was most recently
   * active. Optional and additive: an implementation that declares three parameters — a test
   * double, a no-op — is still assignable and still correct.
   */
  sessionId?: string,
) => Promise<void>
```

**File:** `lib/nina/proactive.ts:702-706` (the call inside `emitProactiveMessage`)
**Change:** pass the function's own `sessionId` parameter (declared at `:598`, and the same value
handed to `insertNinaMessages` at `:664`).
**Code:**
```ts
  try {
    /* The session the rows above were committed to (`:598`, and `insertNinaMessages`' own argument
     * at `:664`). All five triggers deep-link through this one call. */
    await notify(userId, bubbles, detail.kind, sessionId)
  } catch (cause) {
    console.warn('[nina proactive] notify failed', { userId, error: String(cause) })
  }
```
**Impact:** `pushNotifier` (Step 3) now receives a session for `run_committed`,
`missed_usual_day`, `pattern_crossed`, `silence` and `avatar_changed`. `deps.notify` doubles that
declare three parameters keep compiling and keep passing.

---

### Step 8: `scripts/nina-image-worker/push.ts` — the off-platform sender

**File:** `scripts/nina-image-worker/push.ts:132-143` (the `WorkerNotifier` type)
**Code:**
```ts
/**
 * The seam `finishSelfie` and `closeFailed` take their notifier through, so a test can assert the
 * call with no VAPID, no network and no database. `releaseBlobIfUnreferenced`'s `delFn` parameter (`cleanup.ts:36`) is
 * the precedent and the reason is the same one that file gives: the real implementation arrives
 * through `createRequire`, which no `vi.mock` registry reaches.
 */
export type WorkerNotifier = (
  sql: NeonSql,
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
  /**
   * The session the bubble was written into. `buildNinaPushPayload` turns it into
   * `/nina?s=…&jump=…` so a tap on this host's notification lands on the same bubble the app's own
   * push would have landed on.
   */
  sessionId?: string,
) => Promise<WorkerPushReport>
```

**File:** `scripts/nina-image-worker/push.ts:286-294` (the `sendWorkerPush` signature and its first
two lines)
**Change:** `sessionId` at position 5, `sendFn` moved to 6. See the Design note: `sendFn` cannot
stay at 5, because `finish.ts` assigns this function to `WorkerNotifier` and position 5 would then
have to be both a function and a string.
**Code:**
```ts
export async function sendWorkerPush(
  sql: NeonSql,
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
  /**
   * The session the bubble was written into — `WorkerNotifier`'s 5th parameter, and it must stay
   * the 5th HERE too. `finish.ts` writes `notify: WorkerNotifier = sendWorkerPush`, so the two
   * parameter lists are compared position by position; `sendFn` sitting here would make position 5
   * a `SendWorkerNotification` on one side and a `string` on the other, and `npx tsc --noEmit`
   * says so.
   */
  sessionId?: string,
  /* `sendFn` is the test seam — see `SendWorkerNotification`. It defaults to the real
   * `web-push.sendNotification` and nothing in the worker ever passes it. Last, which is also where
   * every other injected seam in this package sits (`finishSelfie`'s `notify`,
   * `releaseBlobIfUnreferenced`'s `delFn`). */
  sendFn: SendWorkerNotification = webPush.sendNotification,
): Promise<WorkerPushReport> {
  const payload = buildNinaPushPayload({ messages, kind, sessionId })
  if (payload == null) return NOTHING('no message body to send')
```
(the rest of `sendWorkerPush`, from `try { configureVapid() }` to `return report`, is unchanged.
Its header doc at `:273-285` keeps its "`sendFn` is the test seam" paragraph — the sentence now
lives on the parameter as well, which is where a reordering reader looks.)
**Impact:** no new import — `buildNinaPushPayload` is already imported from
`../../lib/push/payload.ts`. No `@/`, no `server-only`, so
`node --experimental-strip-types` is unaffected. Twelve test call sites move (Step 11).

---

### Step 9: `scripts/nina-image-worker/finish.ts` — both backstop call sites

**File:** `scripts/nina-image-worker/finish.ts:233-246` (inside `finishSelfie`)
**Change:** pass the `sessionId` resolved at `:125` and null-checked at `:126-128`.
**Code:**
```ts
  try {
    /* The session this photograph's bubble was filed in (`:125`), so the tap opens that
     * conversation and flashes the caption rather than landing on the chat tab. Same derivation as
     * the app's own `photo_delivered` push — `buildNinaPushPayload` builds the URL on both hosts,
     * which is the whole reason that module is importable from here. */
    const report = await notify(
      sql,
      userId,
      [{ id: messageId, body: caption }],
      'worker_photo_delivered',
      sessionId,
    )
    console.info('[nina-worker] notified', { jobId, ...report })
  } catch (cause) {
    console.warn('[nina-worker] the notification could not be sent; the photograph is in', {
      jobId,
      error: String(cause),
    })
  }
}
```

**File:** `scripts/nina-image-worker/finish.ts:367` (the hoisted `apology` binding in `closeFailed`)
**Change:** `closeFailed`'s `sessionId` is block-scoped inside `if (args.purpose === 'selfie')`'s
`try`, while the notify sits after the terminal UPDATE. Widen the already-hoisted `apology` rather
than adding a second nullable that could disagree with it: one variable means the row, the sentence
and the session cannot get out of step.
**Code:**
```ts
  /* Bound outside the branch so the notify after the terminal UPDATE can see it. Null means NO ROW
   * WAS WRITTEN — no session resolved, or the write threw — and a notification about a message that
   * does not exist is strictly worse than silence. Same rule phase 3 applies to
   * `postNinaApologyMessage`'s `insertNinaMessages` returning `[]`; different mechanism, because
   * this host writes raw SQL and gets no row back to test.
   *
   * It carries `sessionId` as well as the row, because the push below needs it and the resolve is
   * block-scoped inside the branch. One binding rather than two nullables: a row and a session that
   * could disagree is a notification that opens the wrong conversation. */
  let apology: { id: string; body: string; sessionId: string } | null = null
```

**File:** `scripts/nina-image-worker/finish.ts:391` (where `apology` is assigned)
**Code:**
```ts
        /* Only after the INSERT resolved. If it threw, the catch below runs and this stays null. */
        apology = { id: messageId, body, sessionId }
```

**File:** `scripts/nina-image-worker/finish.ts:432-442` (the apology notify)
**Change:** pass `apology.sessionId`, and hand `notify` a two-field bubble so the `messages`
argument stays exactly `{ id, body }`.
**Code:**
```ts
  if (apology != null) {
    try {
      /* The bubble is rebuilt to exactly `{ id, body }` rather than spreading `apology`, which now
       * also carries the session: `messages` is the wire's shape and gains nothing from a third
       * field. The session goes in its own parameter, where `buildNinaPushPayload` reads it. */
      const report = await notify(
        sql,
        userId,
        [{ id: apology.id, body: apology.body }],
        'worker_photo_apology',
        apology.sessionId,
      )
      console.info('[nina-worker] apology notified', { jobId, ...report })
    } catch (cause) {
      console.warn('[nina-worker] the apology notification could not be sent; the job is closed', {
        jobId,
        error: String(cause),
      })
    }
  }

  return 'gave-up'
}
```
**Impact:** `run.ts` passes four arguments to both functions and is untouched. The worker's
`notify` default (`= sendWorkerPush`) now typechecks against the 5-parameter `WorkerNotifier`.

---

### Step 10: `lib/push/payload.test.ts` — the new input, tested directly

**File:** `lib/push/payload.test.ts:154-175` (replace the two `url` cases, keeping the first one's
default assertion intact and adding the session cases around it)
**Change:** four properties: the default is still bare `/nina`; a session derives the deep link;
an explicit `url` still beats a session; the `jump` is the SAME id the payload reports.
**Code:**
```ts
  it('defaults url to /nina and lets a caller override it with a same-origin path', () => {
    /* The override is what the duplicate-image notification needs and what nothing before it did.
     * The DEFAULT is the load-bearing half of this assertion: `lib/push/actions.ts`'s manual test
     * button, and any future caller with no session, must keep landing on `/nina`. */
    expect(buildNinaPushPayload({ messages: FOUR, kind: 'chat_reply' })?.url).toBe('/nina')
    expect(
      buildNinaPushPayload({
        messages: FOUR,
        kind: 'duplicate_image',
        url: '/photo/shot/aB3_xYz01234',
      })?.url,
    ).toBe('/photo/shot/aB3_xYz01234')
  })

  it('DEEP-LINKS to the session and the bubble when it is given a session', () => {
    /* The whole of R2. `ninaJumpHref` (`lib/nina/jobview.ts`) builds this exact string for
     * "Buka chat-nya" and for every search hit, and `useQuoteLanding` scrolls and flashes on
     * arrival — this assertion is what pins the two spellings together, since this module may not
     * import that one (no `@/`, so the off-platform worker can load it). */
    expect(
      buildNinaPushPayload({ messages: FOUR, kind: 'chat_reply', sessionId: 'ses000000001' })?.url,
    ).toBe('/nina?s=ses000000001&jump=m1')
  })

  it('points ?jump= at the SAME bubble the body and messageId came from', () => {
    /* One selection, not two: a lock screen showing bubble B while the landing flashes bubble A is
     * the defect this reuse exists to make impossible. The leading blank is what makes the two
     * capable of differing at all. */
    const payload = buildNinaPushPayload({
      messages: [
        { id: 'a', body: '   ' },
        { id: 'b', body: 'real' },
      ],
      kind: 'chat_reply',
      sessionId: 'ses000000001',
    })
    expect(payload?.messageId).toBe('b')
    expect(payload?.url).toBe('/nina?s=ses000000001&jump=b')
  })

  it('AN EXPLICIT url STILL WINS over a session — duplicate_image is not about a bubble', () => {
    /* `notifyDuplicateImagePush` passes `/photo/<kind>/<id>` and that notification must never be
     * rewritten into a chat link. Belt to that brace: it passes no session today, so this case
     * hands it both and asserts the precedence rather than the absence. */
    expect(
      buildNinaPushPayload({
        messages: FOUR,
        kind: 'duplicate_image',
        url: '/photo/image/aB3_xYz01234',
        sessionId: 'ses000000001',
      })?.url,
    ).toBe('/photo/image/aB3_xYz01234')
  })

  it('falls back to bare /nina for a blank session rather than sending ?s=', () => {
    /* `?s=` empty would be rejected by `parseNinaSessionParam` on arrival, and the chat would then
     * consume the `jump` against whichever session was most recently active — a flash on the wrong
     * bubble, which is worse than no flash. */
    expect(buildNinaPushPayload({ messages: FOUR, kind: 'chat_reply', sessionId: '' })?.url).toBe(
      '/nina',
    )
  })

  it('does not bump the wire version for the added field', () => {
    /* `NinaPushPayload`'s header: bump `v` when a field's MEANING changes, never when one is
     * added. A registered service worker can be a week older than the server pushing to it, and
     * it already reads `url` defensively — a query string on a path it already treats as opaque is
     * not a meaning change. */
    expect(
      buildNinaPushPayload({ messages: FOUR, kind: 'duplicate_image', url: '/photo/image/x' })?.v,
    ).toBe(1)
    expect(
      buildNinaPushPayload({ messages: FOUR, kind: 'chat_reply', sessionId: 'ses000000001' })?.v,
    ).toBe(1)
  })
```
(the `takes ONLY the first bubble`, `fills the fixed fields`, `returns null`, and `skips a leading
blank bubble` cases at `:134-152` and `:177-194` are unchanged)

---

### Step 11: the call-site test updates

Every one of these is an arity change on an existing `toHaveBeenCalledWith`, which vitest matches
exactly — they fail loudly, they are not silent drift.

**File:** `lib/push/send.test.ts` — append two cases (after the existing `notifyNinaPush` block's
last case at `:139`, and inside the `pushNotifier` block after `:164`). `sendNotification` is
already mocked at module scope and `BUBBLES` is `[{ id: 'm1', body: 'udah sampai rumah?' }]`.
**Code (new case inside `describe('notifyNinaPush')`):**
```ts
  it('SENDS THE SESSION DEEP LINK as the tap target when the caller names a session', async () => {
    /* R2 at the wire, not at the builder: `sendNinaPush` has to forward the 5th argument or every
     * chat push keeps landing on bare `/nina`. The payload is read back off `web-push` because
     * that string is the only thing the phone ever sees. */
    vi.spyOn(console, 'info').mockImplementation(() => {})

    await notifyNinaPush('user-1', BUBBLES, 'chat_reply', undefined, 'ses000000001')

    const body = vi.mocked(sendNotification).mock.calls[0]?.[1] as string
    expect(JSON.parse(body).url).toBe('/nina?s=ses000000001&jump=m1')
  })

  it('still sends bare /nina when no session is named', async () => {
    /* `lib/push/actions.ts`'s manual test button, and the regression this plan must not cause. */
    vi.spyOn(console, 'info').mockImplementation(() => {})

    await notifyNinaPush('user-1', BUBBLES, 'manual_test')

    const body = vi.mocked(sendNotification).mock.calls[0]?.[1] as string
    expect(JSON.parse(body).url).toBe('/nina')
  })
```
**Code (new case inside `describe('pushNotifier')`):**
```ts
  it('deep-links a proactive trigger to the session it was written into', async () => {
    /* The five proactive kinds reach the wire through here and nowhere else — `ProactiveNotifier`'s
     * 4th parameter exists for exactly this line. */
    vi.spyOn(console, 'info').mockImplementation(() => {})

    await pushNotifier('user-1', BUBBLES, 'silence', 'ses000000001')

    const body = vi.mocked(sendNotification).mock.calls[0]?.[1] as string
    expect(JSON.parse(body).url).toBe('/nina?s=ses000000001&jump=m1')
  })
```

**File:** `lib/push/duplicateImage.test.ts` — append one regression case to
`describe('notifyDuplicateImagePush')` (after the `NEVER sends the blob URL` case at `:50`).
**Code:**
```ts
  it('PASSES NO SESSION, so the deep-link derivation can never rewrite its destination', async () => {
    /* This notification is about an upload, not a bubble. `buildNinaPushPayload` prefers an
     * explicit `url` over a derived one, and this is the call that relies on it: four arguments,
     * a 5th that is never supplied. */
    await notifyDuplicateImagePush(USER, { kind: 'image', id: ID })
    expect(notify.mock.calls[0]).toHaveLength(4)
    expect(notify.mock.calls[0]?.[4]).toBeUndefined()
  })
```

**File:** `tests/nina.turnpush.test.ts` — four assertions. `SESSION` is `'ses000000001'` (`:108`)
and is the `sessionId` on `turnInput()`.
- `:209` -> `expect(notify).toHaveBeenCalledWith(USER, toBubbles(ninaRows()), 'chat_reply', undefined, SESSION)`
- `:297` -> `expect(notify).toHaveBeenNthCalledWith(1, USER, toBubbles(ninaRows()), 'chat_reply', undefined, SESSION)`
- `:300` -> `expect(notify).toHaveBeenNthCalledWith(2, USER, toBubbles(chainedRows()), 'chat_reply', undefined, SESSION)`
- `:340` -> `expect(notifyNinaPush).toHaveBeenCalledWith(USER, toBubbles(ninaRows()), 'chat_reply', undefined, SESSION)`

Add one sentence to the case at `:205` so the assertion explains itself:
```ts
  it('notifies once, with the committed rows and the chat_reply kind', async () => {
    await runNinaBackgroundTurn(turnInput(), deps)

    expect(notify).toHaveBeenCalledTimes(1)
    /* The trailing `undefined, SESSION` is R2: no explicit tap target, and the session the rows
     * were committed to, from which `buildNinaPushPayload` derives `/nina?s=…&jump=…`. The chain's
     * second link (property 7) gets the same session, because it is the same conversation. */
    expect(notify).toHaveBeenCalledWith(USER, toBubbles(ninaRows()), 'chat_reply', undefined, SESSION)
  })
```

**File:** `tests/nina.imagerun.test.ts` — two assertions. `SESSION` is `'session-1'` (`:99`),
returned by the `resolveNinaWriteSession` mock (`:130`).
- `:354-358` ->
```ts
    expect(notify).toHaveBeenCalledWith(
      USER,
      [{ id: 'msg-1', body: 'nih, di pantai' }],
      'photo_delivered',
      undefined,
      SESSION,
    )
```
- `:368-372` ->
```ts
    expect(notify).toHaveBeenCalledWith(
      USER,
      [{ id: 'msg-1', body: ninaImageCaption(JOB_ID) }],
      'photo_delivered',
      undefined,
      SESSION,
    )
```

**File:** `tests/nina.imagepush.test.ts` — two assertions. `SESSION` is `'sessionAAAAA'` (`:61`),
returned by the `resolveNinaSessionForMessage` mock (`:76`).
- `:109` -> `expect(notify).toHaveBeenCalledWith(USER, [{ id: APOLOGY_ID, body }], 'photo_apology', undefined, SESSION)`
- `:188-192` ->
```ts
    expect(notify).toHaveBeenCalledWith(
      USER,
      [{ id: APOLOGY_ID, body: ninaImageApology('stale', JOB) }],
      'photo_apology',
      undefined,
      SESSION,
    )
```

**File:** `tests/admin.chatPhotos.test.ts` — one assertion. `SESSION_ID` is `'ses123XYZ_-9'`
(`:374`), returned by the `resolveNinaWriteSession` mock (`:526`).
- `:979-983` ->
```ts
    expect(notifyNinaPush).toHaveBeenCalledWith(
      USER,
      [{ id: MESSAGE_ID, body: inserted.body }],
      'admin_chat_photo',
      undefined,
      SESSION_ID,
    )
```

**File:** `tests/nina.imageworker.test.ts` — the `sendFn` argument moves from position 5 to 6, so
twelve calls take `SESSION_ID` (module scope, `:112`, `'sess00000001'`) in the new slot. One-line
each, in `describe('sendWorkerPush …')`:

| Line | Was | Becomes |
|---|---|---|
| `:910` | `…, 'worker_photo_delivered', send)` | `…, 'worker_photo_delivered', SESSION_ID, send)` |
| `:924-930` | `…, 'worker_photo_delivered',\n      send,\n    )` | insert `SESSION_ID,` on its own line before `send,` |
| `:941` | `…, 'worker_photo_delivered', stubSend())` | `…, 'worker_photo_delivered', SESSION_ID, stubSend())` |
| `:960` | `…, 'worker_photo_delivered', send)` | `…, 'worker_photo_delivered', SESSION_ID, send)` |
| `:971` | `…, 'worker_photo_delivered', send)` | `…, 'worker_photo_delivered', SESSION_ID, send)` |
| `:1002` | `…, 'worker_photo_delivered', stubSend())` | `…, 'worker_photo_delivered', SESSION_ID, stubSend())` |
| `:1023` | `…, 'worker_photo_delivered', stubSend(gone))` | `…, 'worker_photo_delivered', SESSION_ID, stubSend(gone))` |
| `:1037-1043` | `…,\n      'worker_photo_delivered',\n      stubSend(new Error('ECONNRESET')),\n    )` | insert `SESSION_ID,` before the `stubSend(…)` line |
| `:1058-1064` | `…,\n      'worker_photo_delivered',\n      stubSend(new Error('ETIMEDOUT')),\n    )` | insert `SESSION_ID,` before the `stubSend(…)` line |
| `:1079` | `…, 'worker_photo_delivered', send)` | `…, 'worker_photo_delivered', SESSION_ID, send)` |
| `:1094` | `…, 'worker_photo_delivered', send)` | `…, 'worker_photo_delivered', SESSION_ID, send)` |
| `:1110` | `…, 'worker_photo_delivered', stubSend())` | `…, 'worker_photo_delivered', SESSION_ID, stubSend())` |

Then the wire-format assertion at `:980-988` (now sent WITH a session) and a new sibling case for
the fallback:
```ts
    /* Built by `buildNinaPushPayload`, not assembled here — the whole point of importing
     * `lib/push/payload.ts` is that the two hosts cannot disagree about the wire, and the deep link
     * is now part of that agreement: this is `ninaJumpHref`'s grammar, produced on a host that
     * cannot import `ninaJumpHref`. */
    expect(JSON.parse(call[1] as string)).toEqual({
      v: 1,
      title: 'Nina',
      body: 'ini fotonya',
      url: `/nina?s=${SESSION_ID}&jump=msg000000002`,
      tag: 'nina',
      messageId: 'msg000000002',
      kind: 'worker_photo_delivered',
    })
```
```ts
  it('falls back to bare /nina when the caller could not name a session', async () => {
    /* The parameter is optional on this host too, and the old behaviour is what a caller with no
     * session still gets — never a malformed `?s=`. */
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', undefined, send)

    const payload = JSON.parse(send.mock.calls[0]![1] as string)
    expect(payload.url).toBe('/nina')
  })
```

Finally, two call-site assertions (the seam now carries a 5th argument):
- in `describe('finishSelfie — the push …')`, case at `:1144`, after the `kind` assertion:
```ts
    /* R2: the session the photograph's bubble was filed in, so the tap opens that conversation and
     * flashes the caption. `sqlResolving(SESSION_ID)` is what `resolveWorkerSessionId` answered. */
    expect(notify.mock.calls[0]![4]).toBe(SESSION_ID)
```
- in `describe('closeFailed — the apology push …')`, case at `:1241`, after the `kind` assertion:
```ts
    /* The session is hoisted out of the selfie branch alongside the row itself, so the apology's
     * notification cannot point at a different conversation than the apology. */
    expect(notify.mock.calls[0]![4]).toBe(SESSION_ID)
```

---

## Verification

**Build (the gate this repo names explicitly — vitest does not typecheck):**
```
cd /home/miftah/.worktrees/run-insights/push-notification-tap-redirect && npx tsc --noEmit
```

**Tests:**
```
cd /home/miftah/.worktrees/run-insights/push-notification-tap-redirect && npx vitest run \
  lib/push/payload.test.ts lib/push/send.test.ts lib/push/duplicateImage.test.ts \
  tests/nina.turnpush.test.ts tests/nina.imagerun.test.ts tests/nina.imagepush.test.ts \
  tests/admin.chatPhotos.test.ts tests/nina.imageworker.test.ts
```
then the full suite:
```
cd /home/miftah/.worktrees/run-insights/push-notification-tap-redirect && npm test
```

**The worker still loads without a bundler** (the one thing `tsc` and `vitest` between them do not
prove — `vitest` resolves `.ts` specifiers its own way):
```
cd /home/miftah/.worktrees/run-insights/push-notification-tap-redirect && \
  node --experimental-strip-types -e "import('./scripts/nina-image-worker/push.ts').then(m => console.log(Object.keys(m)))"
```
and a grep that must stay empty:
```
cd /home/miftah/.worktrees/run-insights/push-notification-tap-redirect && \
  grep -rn "from '@/\|server-only" scripts/nina-image-worker/
```

**Manual check:** `lib/push/payload.ts`'s import list is still exactly `import { z } from 'zod'`.
`lib/push/duplicateImage.ts` is unmodified (`git diff --stat` must not list it).

**Exit criteria:**
- `buildNinaPushPayload({ messages, kind, sessionId })` returns `url ===
  '/nina?s=<sessionId>&jump=<first non-blank message id>'`, and that id equals the payload's own
  `messageId` field.
- All seven chat-shaped call sites (`chat_reply`, `photo_delivered`, `photo_apology`,
  `admin_chat_photo`, the five proactive triggers, `worker_photo_delivered`,
  `worker_photo_apology`) pass a session.
- `duplicate_image`'s payload is byte-for-byte what it is on `main`, and `notifyDuplicateImagePush`
  is still called with four arguments.
- A caller that passes no session still gets bare `/nina`.
- `npx tsc --noEmit` clean; `npm test` green; the `node --experimental-strip-types` import above
  prints the worker's exports; the `@/`/`server-only` grep under `scripts/nina-image-worker/`
  returns nothing.

## Handoffs

- **Phase 1 (R1)** owns the tap actually working. Note for the reconciler and for Phase 1: once
  this phase lands, `notificationclick`'s `url.pathname === target` comparison in
  `lib/service-worker.js` can never match a chat push again — `target` now carries a query string
  and `url.pathname` never does. That branch is Phase 1's (the "already on the right screen, focus
  without navigating" case) and this phase does not touch it. Phase 1's exit criteria already cover
  "a window that already shows the exact target (pathname *and* query) is focused without a
  redundant navigation", which is the correct repair. **Verified by the reconciler against
  `lib/service-worker.js:151-166` and Phase 1's Step 3: that phase's comparison really is written
  over `pathname + search`, not asserted to be.**
- **MERGE ORDER: not before Phase 1 (reconciler).** No `depends_on` edge — this phase builds and
  tests green alone — but merging it *first* costs the one case that works on `main` today. A
  runner standing on bare `/nina` currently matches `url.pathname === target` (`'/nina' ===
  '/nina'`) and gets a focus; once this phase's `target` carries `?s=…&jump=…` that branch stops
  matching and the tap falls into the rejecting `navigate()` call, so the tap breaks there too
  until Phase 1 lands. Land Phase 1 first, or land the two together. Nothing in this phase changes
  to accommodate that — it is a merge-order note, not a scope change.
- **`tests/nina.proactive.test.ts` is deliberately absent from the Files table, and that was
  checked, not assumed (reconciler).** The analysis's impact point 14 lists it as "if applicable".
  It contains no `notify` reference and no `toHaveBeenCalledWith` against the notifier at all, so
  widening `ProactiveNotifier` and passing a 4th argument at `:703` moves nothing in it. Every
  other call-site test that *does* pin notifier arity is in the table above.
- **Docs.** `scripts/.workflows/package_readme.md:210` quotes `sendWorkerPush`'s signature and
  `:245` its seam convention; `lib/push`'s own package readme, if it names `sendNinaPush`'s
  parameters, is in the same position. Left to the readme-updater at completion rather than edited
  here.
- **Not done, deliberately (R1's territory, and out of this phase's `satisfies`):** nothing in this
  phase makes the tap reach the app from `/nina/about`'s photo overlay. Payloads get the right
  destination; delivering the tap is Phase 1.
- **Not done, deliberately (no requirement):** `lib/push/actions.ts`'s `manual_test` push keeps
  landing on bare `/nina`. It is a "does my phone work" button with no conversation behind it, and
  giving it a session would be inventing one.

## Rollback

`git revert` this phase's commit(s). The nine source files return to passing no session, every
payload's `url` returns to bare `/nina` (still a correct, if unhelpful, destination — the chat
opens on the most recently active session with no scroll), and `duplicate_image` is unaffected in
either direction because it never participated. Nothing here writes to the database, changes a
migration, or alters the wire version (`v` stays `1`), so a service worker registered against the
new payloads keeps working against the old ones without a re-registration: it has always read `url`
as an opaque same-origin path.
