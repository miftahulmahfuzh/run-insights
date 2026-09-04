import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A signed carrier for one image's description, so it can cross from `describeNinaImage` to
 * `sendNinaMessage` through the browser without becoming something the browser can write.
 *
 * WHY THIS EXISTS AT ALL: the two actions are two invocations (the phase-6 plan's latency
 * verdict), and `nina_message_images.message_id` is NOT NULL, so there is no row to park the
 * description in until the message exists. It has to round-trip through the client, and a
 * description arrives in Nina's turn framed as "this is what is in the picture" — ground truth.
 * Ground truth that the client can author is not ground truth, so it is signed.
 *
 * The three alternatives, and why each lost: returning the raw description and taking it back on
 * send lets the client write anything into her prompt (not a privacy problem — one user, RU — but
 * a correctness one); a server-side cache keyed by pathname does not survive serverless, where the
 * next invocation is a different instance; a nullable `message_id` is a schema change to a written
 * phase, for a row that would be garbage the moment a send is abandoned.
 *
 * NOT a session token, NOT an auth token, and not a substitute for `requireUserId()`. It carries
 * no capability: it proves only that this server produced this description for this user and this
 * pathname, recently.
 *
 * The signing/verifying pair takes the secret as an ARGUMENT, so it is testable without env
 * (invariant 6) — `tests/support/setup.ts` deliberately does not seed `AUTH_SECRET` — and
 * `authEnv()` is read only at the call site.
 */

/** Bumped if `NinaImageClaims` ever changes shape, so an old ticket fails closed rather than open. */
export const NINA_TICKET_VERSION = 1

/**
 * Half an hour. Long enough to pick a photo, get distracted, come back and send; short enough that
 * a ticket found in a log is worthless. `UPLOAD_TOKEN_TTL_MS` is 10 minutes for the upload itself,
 * and this is deliberately longer: composing a message is a slower act than a PUT.
 */
export const NINA_TICKET_TTL_MS = 30 * 60 * 1000

/** A description is 60-140 words; 4,000 characters of ticket is generous and bounds the parse. */
export const NINA_MAX_TICKET_CHARS = 4_000

export interface NinaImageClaims {
  v: number
  /** The owner. Compared against `requireUserId()` on the way back in. */
  userId: string
  /** The STORED blob pathname, after Vercel's random suffix. */
  pathname: string
  blobUrl: string
  width: number
  height: number
  bytes: number
  /** `glm-4.6v`'s output, or `null` when the describe call failed and we signed the failure. */
  description: string | null
  /** Epoch ms. */
  exp: number
}

export interface NinaTicketExpectation {
  userId: string
  now?: number
}

export type NinaTicketVerdict =
  | { ok: true; claims: NinaImageClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_user' | 'bad_version' }

function b64url(input: Buffer): string {
  return input.toString('base64url')
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest())
}

export function signNinaImageTicket(
  claims: Omit<NinaImageClaims, 'v' | 'exp'>,
  secret: string,
  now: number = Date.now(),
): string {
  const full: NinaImageClaims = {
    ...claims,
    v: NINA_TICKET_VERSION,
    exp: now + NINA_TICKET_TTL_MS,
  }
  const payload = b64url(Buffer.from(JSON.stringify(full), 'utf8'))
  return `${payload}.${sign(payload, secret)}`
}

export function verifyNinaImageTicket(
  ticket: string,
  expect: NinaTicketExpectation,
  secret: string,
): NinaTicketVerdict {
  if (typeof ticket !== 'string' || ticket.length === 0 || ticket.length > NINA_MAX_TICKET_CHARS) {
    return { ok: false, reason: 'malformed' }
  }
  const dot = ticket.indexOf('.')
  if (dot <= 0 || dot === ticket.length - 1) return { ok: false, reason: 'malformed' }

  const payload = ticket.slice(0, dot)
  const given = ticket.slice(dot + 1)
  const expected = sign(payload, secret)

  /* Length-checked first: `timingSafeEqual` throws on a length mismatch rather than returning
   * false, and a forged ticket of the wrong length must be a verdict, not an exception. */
  const givenBytes = Buffer.from(given, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  if (givenBytes.length !== expectedBytes.length) return { ok: false, reason: 'bad_signature' }
  if (!timingSafeEqual(givenBytes, expectedBytes)) return { ok: false, reason: 'bad_signature' }

  let claims: NinaImageClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as NinaImageClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  /* Shape-checked even though the signature already proves we wrote it: a deploy that changed the
   * shape would otherwise hand a stale ticket's fields straight into an INSERT. */
  if (claims == null || typeof claims !== 'object') return { ok: false, reason: 'malformed' }
  if (claims.v !== NINA_TICKET_VERSION) return { ok: false, reason: 'bad_version' }
  if (typeof claims.userId !== 'string' || typeof claims.pathname !== 'string') {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof claims.blobUrl !== 'string' || typeof claims.exp !== 'number') {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.description !== null && typeof claims.description !== 'string') {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.userId !== expect.userId) return { ok: false, reason: 'wrong_user' }
  if ((expect.now ?? Date.now()) > claims.exp) return { ok: false, reason: 'expired' }

  return { ok: true, claims }
}
