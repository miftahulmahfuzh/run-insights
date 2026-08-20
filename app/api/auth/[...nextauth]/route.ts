import { handlers } from '@/auth'

/**
 * Roadmap D7 lists this among the four sanctioned Route Handlers. It serves the whole Auth.js
 * surface:
 *
 *   GET      /api/auth/providers
 *   GET      /api/auth/csrf
 *   GET      /api/auth/session
 *   GET|POST /api/auth/signin/google
 *   GET      /api/auth/callback/google   <- the URI registered in the Google Cloud Console
 *   POST     /api/auth/signout
 *
 * The directory name must stay exactly `[...nextauth]` (catch-all, lowercase) or the callback path
 * does not exist and Google answers every sign-in with `redirect_uri_mismatch`.
 *
 * Node runtime, which is the Next 16 default — the Drizzle adapter needs it. And `proxy.ts` must
 * never match `/api/auth/*`, or the sign-in flow redirects to itself.
 */
export const { GET, POST } = handlers
