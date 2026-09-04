import { describe, expect, it } from 'vitest'

import {
  PUSH_BODY_MAX_CHARS,
  PUSH_FAILURE_LIMIT,
  buildNinaPushPayload,
  classifyPushFailure,
  decodeNinaPushPayload,
  encodeNinaPushPayload,
  parsePushSubscription,
  shouldRevokeSubscription,
  truncateForNotification,
} from './payload'

/**
 * The three things in this phase that can be quietly wrong for a week: the payload shape, the
 * subscription parse, and the decision to give up on an endpoint. Everything else here needs a
 * browser, a push service or a phone, and invariant 6 (`environment: 'node'`, no jsdom) is what
 * decides that this is the whole testable surface rather than a shortfall.
 */

describe('classifyPushFailure', () => {
  it('treats 404 and 410 as terminal — RFC 8030 §7.3', () => {
    expect(classifyPushFailure(404)).toBe('gone')
    expect(classifyPushFailure(410)).toBe('gone')
  })

  it('A ROTATED VAPID KEY MUST NOT DELETE EVERY SUBSCRIPTION: 403 is retryable', () => {
    /* 401/403 mean OUR credentials are wrong, not that THEIR subscription is dead. A rotated key
     * pair, a bad VAPID_SUBJECT or a mismatched public key all answer 403 on every endpoint at
     * once — pruning on it would empty the table because of a typo in an environment variable.
     * If you are here to add 403 to TERMINAL_PUSH_STATUS_CODES: this is why you must not. */
    expect(classifyPushFailure(403)).toBe('retry')
    expect(classifyPushFailure(401)).toBe('retry')
  })

  it('treats rate limits, server errors and bad requests as retryable', () => {
    expect(classifyPushFailure(429)).toBe('retry')
    expect(classifyPushFailure(500)).toBe('retry')
    expect(classifyPushFailure(503)).toBe('retry')
    expect(classifyPushFailure(400)).toBe('retry')
  })

  it('treats a missing status code — DNS, socket, timeout — as retryable', () => {
    expect(classifyPushFailure(null)).toBe('retry')
    expect(classifyPushFailure(undefined)).toBe('retry')
  })
})

describe('shouldRevokeSubscription', () => {
  it('revokes on a terminal verdict regardless of the counter', () => {
    expect(shouldRevokeSubscription({ verdict: 'gone', failureCount: 0 })).toBe(true)
  })

  it('keeps a subscription whose first failure was retryable', () => {
    expect(shouldRevokeSubscription({ verdict: 'retry', failureCount: 0 })).toBe(false)
  })

  it('revokes on the fifth consecutive failure, and not the fourth', () => {
    /* `failureCount` is the count BEFORE this failure, and PUSH_FAILURE_LIMIT is 5: at 3 this is
     * the fourth failure and the row lives; at 4 it is the fifth and the row is revoked. */
    expect(PUSH_FAILURE_LIMIT).toBe(5)
    expect(shouldRevokeSubscription({ verdict: 'retry', failureCount: 3 })).toBe(false)
    expect(shouldRevokeSubscription({ verdict: 'retry', failureCount: 4 })).toBe(true)
  })
})

describe('parsePushSubscription', () => {
  const REAL = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/dGhpcy1pcy1hLWZha2UtZW5kcG9pbnQ',
    expirationTime: null,
    keys: { p256dh: 'BK9-fake-public-key', auth: 'fake-auth-secret' },
  }

  it('flattens a real-shaped subscription to three columns and IGNORES expirationTime', () => {
    expect(parsePushSubscription(REAL)).toEqual({
      endpoint: REAL.endpoint,
      p256dh: 'BK9-fake-public-key',
      auth: 'fake-auth-secret',
    })
  })

  it('rejects a non-https endpoint — this is a security claim, not a validation one', () => {
    /* A Server Action is a public HTTP endpoint. An attacker-supplied `endpoint` would turn
     * `webpush.sendNotification` into a request-forgery primitive. */
    expect(parsePushSubscription({ ...REAL, endpoint: 'http://evil.example/push' })).toBeNull()
  })

  it('rejects the malformed shapes', () => {
    expect(parsePushSubscription(null)).toBeNull()
    expect(parsePushSubscription({})).toBeNull()
    expect(parsePushSubscription({ endpoint: REAL.endpoint })).toBeNull()
    expect(parsePushSubscription({ ...REAL, keys: { p256dh: '', auth: 'a' } })).toBeNull()
    expect(parsePushSubscription({ ...REAL, endpoint: 'not-a-url' })).toBeNull()
  })
})

describe('truncateForNotification', () => {
  it('leaves a short body identical and un-ellipsised — the case that actually happens', () => {
    const body = 'Kamu belum lari empat hari. Mau jalan sebentar?'
    expect(truncateForNotification(body)).toBe(body)
    expect(truncateForNotification(body)).not.toContain('…')
  })

  it('truncates a long body to the limit plus the ellipsis, cutting on a space', () => {
    const body = 'lorem ipsum dolor sit amet '.repeat(20)
    const out = truncateForNotification(body)
    expect(out.length).toBeLessThanOrEqual(PUSH_BODY_MAX_CHARS + 1)
    expect(out.endsWith('…')).toBe(true)
    expect(out.slice(0, -1).endsWith(' ')).toBe(false)
    expect(body.startsWith(out.slice(0, -1))).toBe(true)
  })

  it('still truncates a body with no spaces at all, and does not return three characters', () => {
    /* The branch the `max * 0.6` guard exists for: a CJK or hashtag blob has no word boundary,
     * and honouring the one space at index 3 would produce a three-character notification. */
    const body = 'x'.repeat(400)
    const out = truncateForNotification(body)
    expect(out.length).toBe(PUSH_BODY_MAX_CHARS + 1)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('buildNinaPushPayload', () => {
  const FOUR = [
    { id: 'm1', body: 'eh' },
    { id: 'm2', body: 'kamu udah lari belum hari ini' },
    { id: 'm3', body: 'soalnya biasanya selasa' },
    { id: 'm4', body: 'ya kan' },
  ]

  it('takes ONLY the first bubble — a notification is a knock on the door', () => {
    /* Deliberate and load-bearing: concatenating four bubbles into one lock-screen wall of text
     * destroys the staggered reveal RU-5 chose on purpose. A later change that "helpfully" joins
     * them must fail here. */
    const payload = buildNinaPushPayload({ messages: FOUR, kind: 'silence' })
    expect(payload?.body).toBe('eh')
    expect(payload?.messageId).toBe('m1')
  })

  it('fills the fixed fields and passes an unknown kind through opaquely', () => {
    const payload = buildNinaPushPayload({ messages: FOUR, kind: 'some_future_trigger' })
    expect(payload).toMatchObject({
      v: 1,
      title: 'Nina',
      url: '/nina',
      tag: 'nina',
      kind: 'some_future_trigger',
    })
  })

  it('returns null for an empty turn and for an all-blank one', () => {
    expect(buildNinaPushPayload({ messages: [], kind: 'silence' })).toBeNull()
    expect(
      buildNinaPushPayload({ messages: [{ id: 'a', body: '   ' }], kind: 'silence' }),
    ).toBeNull()
  })

  it('skips a leading blank bubble and takes the first bubble with words in it', () => {
    const payload = buildNinaPushPayload({
      messages: [
        { id: 'a', body: '  ' },
        { id: 'b', body: 'real' },
      ],
      kind: 'silence',
    })
    expect(payload?.body).toBe('real')
    expect(payload?.messageId).toBe('b')
  })
})

describe('encode/decodeNinaPushPayload', () => {
  it('round-trips', () => {
    const payload = buildNinaPushPayload({ messages: [{ id: 'm1', body: 'hi' }], kind: 'silence' })!
    expect(decodeNinaPushPayload(encodeNinaPushPayload(payload))).toEqual(payload)
  })

  it('survives an unknown field and fills the defaults — the compatibility claim `v` exists for', () => {
    /* A registered worker outlives the deploy that shipped it, so a phone can meet a payload from
     * a newer server. An added field must be ignored, not fatal. */
    expect(decodeNinaPushPayload('{"title":"Nina","body":"hi","future":42}')).toEqual({
      v: 1,
      title: 'Nina',
      body: 'hi',
      url: '/nina',
      tag: 'nina',
      messageId: null,
      kind: 'unknown',
    })
  })

  it('returns null on unparseable input and on a payload with no title', () => {
    expect(decodeNinaPushPayload('not json')).toBeNull()
    expect(decodeNinaPushPayload('{"body":"no title"}')).toBeNull()
  })
})
