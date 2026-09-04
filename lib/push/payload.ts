import { z } from 'zod'

/**
 * Everything that crosses the Web Push boundary, and nothing that touches a browser API or a
 * database. This file is the reason phase 11 is testable at all: `vitest` runs
 * `environment: 'node'` with no jsdom (plan invariant 6), so `self`, `navigator` and
 * `PushSubscription` are all unavailable in a test. What IS testable is the shape of the message,
 * the parse of the subscription, and the decision to give up on an endpoint — and those are the
 * three things in this phase that can be wrong in a way nobody notices for a week.
 *
 * **No `server-only`.** This module is imported by the Server Actions, by the sender, by the
 * service worker's counterpart logic and by its own test. `server-only` would be a lie in a file
 * with no secrets and no I/O.
 */

/** The notification's title. Not the message body — see `buildNinaPushPayload`. */
export const PUSH_TITLE = 'Nina'

/** Where a tap lands. Also the URL the service worker looks for among open windows to focus. */
export const PUSH_TARGET_URL = '/nina'

/**
 * One tag for every Nina notification, so a second one REPLACES the first in the tray instead of
 * stacking. Nina sends 1–4 bubbles per turn (RU-5) and four separate notifications for one thought
 * is the behaviour that makes people turn notifications off. `renotify` is set alongside it in the
 * worker so a replacement still buzzes rather than landing silently.
 */
export const PUSH_NOTIFICATION_TAG = 'nina'

/**
 * A notification body is truncated by the OS anyway — iOS shows roughly four lines on a locked
 * XS Max — and the encrypted payload has a hard ceiling around 4 KB that a long bubble plus a UTF-8
 * Indonesian sentence can approach. Truncating HERE rather than letting the platform do it means
 * the cut lands on a word boundary with an ellipsis instead of mid-syllable.
 */
export const PUSH_BODY_MAX_CHARS = 180

/**
 * Consecutive failures before a subscription is revoked even though no single failure was
 * terminal. Five is a number, not a discovery: a real outage at Apple or Google is measured in
 * minutes and Nina speaks a handful of times a day, so five straight failures spans days and is
 * evidence about the subscription rather than about the weather.
 */
export const PUSH_FAILURE_LIMIT = 5

/**
 * **The pruning rule, and the whole of it.** RFC 8030 §7.3: a push service answers `404 Not Found`
 * for an endpoint it has never heard of and `410 Gone` for one that has been deleted — a browser
 * that cleared its site data, an app that was deleted from the home screen, a subscription the
 * user revoked in Settings. Both are permanent by specification and neither will ever succeed
 * again.
 *
 * **Everything else is retryable, and the omissions are deliberate:**
 *   - `429 Too Many Requests` — rate limiting. The subscription is alive; we were noisy.
 *   - `5xx` — the push service is having a day.
 *   - `401` / `403` — a VAPID problem, which is OUR configuration and not their subscription.
 *     A rotated key pair, a bad `VAPID_SUBJECT` or a mismatched public key all land here, and
 *     pruning on 403 would delete every subscription in the table because of a typo in an
 *     environment variable.
 *   - `400` — a malformed request, which is a bug in this code. Retrying is wrong but so is
 *     deleting the runner's subscription to hide it; the failure count will surface it.
 *   - no status code at all (DNS, socket, timeout) — the network, not the endpoint.
 */
export const TERMINAL_PUSH_STATUS_CODES = [404, 410] as const

/** What a failed send tells us about the subscription itself. */
export type PushFailureVerdict = 'gone' | 'retry'

export function classifyPushFailure(statusCode: number | null | undefined): PushFailureVerdict {
  if (typeof statusCode !== 'number') return 'retry'
  return (TERMINAL_PUSH_STATUS_CODES as readonly number[]).includes(statusCode) ? 'gone' : 'retry'
}

/**
 * The second half of the pruning rule: a subscription that has never worked and keeps not working
 * is also gone, it just never said so. `failureCount` is the count BEFORE this failure, so the
 * comparison is against the incremented value.
 *
 * `lastSuccessAt` is not consulted on purpose. A subscription that succeeded once and has failed
 * five times since is exactly as dead as one that never succeeded, and adding "but it worked in
 * March" to the condition only keeps corpses in the table.
 */
export function shouldRevokeSubscription(input: {
  verdict: PushFailureVerdict
  failureCount: number
}): boolean {
  return input.verdict === 'gone' || input.failureCount + 1 >= PUSH_FAILURE_LIMIT
}

/**
 * A subscription as the browser hands it over. `PushSubscription.toJSON()` produces
 * `{ endpoint, expirationTime, keys: { p256dh, auth } }`; `expirationTime` is ignored because no
 * shipping browser sets it to anything but `null` and a column for it would be a column of nulls.
 *
 * **This is parsed rather than trusted** even though the only caller is our own client component,
 * for the ordinary Server Action reason: the argument arrives over the wire from a browser and a
 * Server Action is a public HTTP endpoint. Writing an attacker-supplied string into `endpoint`
 * would turn `webpush.sendNotification` into a request-forgery primitive, which is why the scheme
 * check below is `https:` and not a regex over the whole URL.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .min(1, 'endpoint is required')
    .max(2048, 'endpoint is implausibly long')
    .refine((value) => {
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    }, 'endpoint must be an https:// URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'keys.p256dh is required'),
    auth: z.string().min(1, 'keys.auth is required'),
  }),
})

/** The three columns a subscription becomes. Flat, because `push_subscriptions` is flat. */
export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * `unknown` in, a flat row or `null` out. No throw: the caller is a Server Action whose honest
 * answer to a malformed subscription is `{ ok: false }`, not a 500 in the browser console.
 */
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  const parsed = pushSubscriptionSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  }
}

/**
 * ── THE PAYLOAD CONTRACT WITH `lib/service-worker.js` ─────────────────────────────────────────
 * This type and that file are two halves of one wire format, and the service worker is the half
 * that cannot be type-checked (it is plain JS, it runs in a worker global, and it may be a version
 * older than the server that is pushing to it — a registered worker survives a deploy).
 *
 * Hence `v`. A worker from last week receiving a `v: 2` payload it does not understand must still
 * show *something*, so the worker reads `title` and `body` defensively and ignores fields it does
 * not know. **If a field's meaning ever changes rather than being added, bump `v` and branch in
 * the worker** — do not silently repurpose a name.
 */
export interface NinaPushPayload {
  /** Wire version. Bump only on an incompatible change, never on an addition. */
  v: 1
  title: string
  body: string
  /** Where a tap goes. Always same-origin and always a path, never an absolute URL. */
  url: string
  tag: string
  /** The `nina_messages.id` of the first bubble, or null. Diagnostics only; nothing reads it yet. */
  messageId: string | null
  /** Phase 10's `ProactiveTriggerKind`, as an opaque string. Diagnostics only. */
  kind: string
}

/**
 * Cut to a word boundary and add an ellipsis. A body that already fits comes back untouched and
 * un-ellipsised, which is the case that matters — Nina's bubbles are short by design (RU-5).
 */
export function truncateForNotification(body: string, max: number = PUSH_BODY_MAX_CHARS): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  const hard = trimmed.slice(0, max)
  const lastSpace = hard.lastIndexOf(' ')
  /* Only respect a word boundary if it is not absurdly early — a 180-character CJK or hashtag
   * blob has no spaces, and cutting at char 3 to honour the one space in it is worse than cutting
   * mid-word. */
  const cut = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard
  return `${cut.trimEnd()}…`
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
}): NinaPushPayload | null {
  const first = input.messages.find((message) => message.body.trim().length > 0)
  if (!first) return null
  return {
    v: 1,
    title: PUSH_TITLE,
    body: truncateForNotification(first.body),
    url: PUSH_TARGET_URL,
    tag: PUSH_NOTIFICATION_TAG,
    messageId: first.id,
    kind: input.kind,
  }
}

export function encodeNinaPushPayload(payload: NinaPushPayload): string {
  return JSON.stringify(payload)
}

/**
 * The inverse, for the test and for anybody debugging a payload out of a log line. The service
 * worker does NOT use this — it cannot import from `lib/` in a way that survives being a separate
 * bundle entry, and duplicating six lines of defensive reads there is cheaper than a shared module
 * that has to be safe in three runtimes.
 */
export function decodeNinaPushPayload(raw: string): NinaPushPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<NinaPushPayload>
    if (typeof candidate.title !== 'string' || typeof candidate.body !== 'string') return null
    return {
      v: 1,
      title: candidate.title,
      body: candidate.body,
      url: typeof candidate.url === 'string' ? candidate.url : PUSH_TARGET_URL,
      tag: typeof candidate.tag === 'string' ? candidate.tag : PUSH_NOTIFICATION_TAG,
      messageId: typeof candidate.messageId === 'string' ? candidate.messageId : null,
      kind: typeof candidate.kind === 'string' ? candidate.kind : 'unknown',
    }
  } catch {
    return null
  }
}
