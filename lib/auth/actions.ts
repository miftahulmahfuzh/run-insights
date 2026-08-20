'use server'

import { signIn, signOut } from '@/auth'
import { safeNext } from './safeNext'

/**
 * Sign-in / sign-out as Server Actions, so a client component can pass them straight to
 * `<form action={…}>` without `signIn`/`signOut` — which are server-only — ever appearing near a
 * `'use client'` boundary.
 *
 * Deliberately NOT in `app/actions/`: that directory is for data mutations. These are navigation.
 */

/** Bound to the sign-in form on `/`. Redirects to Google, then back to `next`. */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  // signIn() throws NEXT_REDIRECT internally — the requireUserId() rule applies here too: never
  // wrap this in a try/catch.
  await signIn('google', { redirectTo: safeNext(formData.get('next')) })
}

/** Bound to the sign-out button. Clears the session cookie, lands on `/`. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' })
}
