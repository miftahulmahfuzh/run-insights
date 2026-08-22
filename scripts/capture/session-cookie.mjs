/**
 * F19 — mint an Auth.js session cookie for the seeded demo user.
 *
 *   node --env-file=.env.local scripts/capture/session-cookie.mjs [origin]
 *
 * WHY THIS IS POSSIBLE AT ALL, and why it is not a back door.
 *
 * `auth.config.ts` chooses `strategy: 'jwt'`, and `auth.ts` states the consequence outright: *"No
 * `session` rows are ever written, because the session lives in the cookie."* So there is no
 * session record to forge — the session **is** the cookie, and anything holding `AUTH_SECRET` can
 * mint one. That is not a weakness this script introduces; it is the documented trade F02 took
 * (`requireUserId()` becomes a decrypt with zero round trips) and its stated break-glass is
 * rotating `AUTH_SECRET`.
 *
 * What it buys here is the difference between a capture run that works and one that cannot exist:
 * the alternative is driving Google's OAuth consent screen in headless chromium, with a real
 * account, a real password and a real second factor, on every run.
 *
 * The one contract that matters is `token.sub`. `authConfig.callbacks.session` copies it to
 * `session.user.id`, and that is what `requireUserId()` returns and what every query scopes by.
 * Everything else in the payload is cosmetic.
 */
import { encode } from 'next-auth/jwt'

/**
 * Auth.js uses the cookie's own NAME as the JWE salt, and the name depends on the scheme: the
 * `__Secure-` prefix is only legal over https. Getting this wrong fails closed — the cookie will
 * not decrypt, `requireUserId()` redirects to `/`, and the capture lands on the sign-in screen
 * instead of quietly capturing a half-authenticated page.
 */
export function cookieNameFor(origin) {
  return new URL(origin).protocol === 'https:'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'
}

export async function mintSessionCookie({
  userId,
  name,
  email,
  origin,
  maxAgeSec = 60 * 60 * 24 * 30,
}) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set — run with --env-file=.env.local')

  const cookieName = cookieNameFor(origin)
  const now = Math.floor(Date.now() / 1000)

  const value = await encode({
    secret,
    salt: cookieName,
    maxAge: maxAgeSec,
    token: {
      name,
      email,
      picture: null,
      /** THE contract. Everything else here is decoration. */
      sub: userId,
      iat: now,
      exp: now + maxAgeSec,
      jti: crypto.randomUUID(),
    },
  })

  return { name: cookieName, value }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const origin = process.argv[2] ?? 'http://localhost:3000'
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const [user] = await sql.query(
    `select id, name, email from "user" where id like 'demo-%' order by id limit 1`,
  )
  if (!user) {
    console.error('FAIL  no demo user. Run scripts/capture/seed-demo.mjs first.')
    process.exit(1)
  }
  const cookie = await mintSessionCookie({
    userId: user.id,
    name: user.name,
    email: user.email,
    origin,
  })
  console.log(`${cookie.name}=${cookie.value}`)
  console.error(
    `\n(minted for ${user.id} at ${origin} — paste into a browser cookie to look around)`,
  )
}
