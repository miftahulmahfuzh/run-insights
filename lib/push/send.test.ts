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
