import type { DefaultSession } from 'next-auth'

/**
 * F02's contract with every other feature: `session.user.id` is a non-optional `string`.
 *
 * It is true because `auth.config.ts` runs two callbacks — `jwt` writes the adapter user's primary
 * key onto `token.sub` at sign-in, and `session` copies it back onto `session.user.id` on every
 * read. Without this augmentation the id is `string | undefined` and `requireUserId()` would push
 * a narrowing branch onto every call site in the app.
 *
 * See docs/plans/F02-auth-profile.md §1 (INVARIANT A).
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** `user.id` — written once at sign-in, carried for the life of the cookie. */
    sub?: string
  }
}
