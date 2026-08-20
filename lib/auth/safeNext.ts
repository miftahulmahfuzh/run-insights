/**
 * Sanitise a post-sign-in redirect target.
 *
 * `next` arrives straight from the query string — `proxy.ts` puts it there, but anyone can type it
 * — and an open redirect on a sign-in path is a real phishing primitive: a link on our own domain
 * that deposits the user on someone else's login form in the same breath as they typed a Google
 * password.
 *
 * Only same-origin, path-relative targets survive. Rejected:
 *   - absolute URLs             `https://evil.com`
 *   - protocol-relative URLs    `//evil.com`    (a browser reads this as a host, not a path)
 *   - anything with a backslash `/\evil.com`    (some URL parsers fold `\` into `/`)
 *
 * Lives in its own module rather than inside `lib/auth/actions.ts` because that file is
 * `'use server'`, where every export must be an async function — a plain guard cannot live there,
 * and both the actions and `app/page.tsx` need it. Unit-tested in `tests/auth.safeNext.test.ts`.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  if (value.includes('\\')) return '/'
  return value
}
