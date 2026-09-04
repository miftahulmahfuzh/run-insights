import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { z } from 'zod'

import {
  ADMIN_AVATAR_CACHE_MAX_AGE,
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_TOKEN_TTL_MS,
  isAdminAvatarRequestPathname,
} from '@/lib/admin/avatars'
import { forbiddenJson, requireAdminApi, type AdminIdentity } from '@/lib/admin/requireAdmin'
import { UnauthorizedError, unauthorizedJson } from '@/lib/auth/requireUserId'
import { blobEnv } from '@/lib/env'

/**
 * `POST /api/admin/nina/upload` — the Vercel Blob client-upload handshake for F33 R23's album.
 *
 * THIS ROUTE NEVER RECEIVES IMAGE BYTES. It mints a short-lived signed token and the browser PUTs
 * straight to Blob, for the three reasons `app/api/upload/route.ts` lists — a Function rejects
 * bodies over ~4.5 MB, streaming an upload through one bills wall-clock for no computation, and
 * only a direct PUT reports honest progress. Here the first reason is load-bearing rather than
 * incidental: an admin avatar is deliberately NOT downscaled, so an 8 MB original is normal.
 *
 * ── WHY A SEPARATE ROUTE AND NOT A THIRD BRANCH IN `/api/upload` ────────────────────────────
 * Every one of the four values that matter here differs from both of that route's branches: the
 * authorisation rule (**admin**, not merely signed-in), `maximumSizeInBytes` (8 MB, not 600 KB or
 * 900 KB), `allowedContentTypes` (three, not one) and the pathname regex. A shared route would
 * have made all four conditional on a branch discriminator.
 *
 * ── IT IS A SECURITY BOUNDARY IN ITS OWN RIGHT ──────────────────────────────────────────────
 * `proxy.ts` deliberately does not match `/api/*` (a 307 to an HTML sign-in page is a terrible
 * answer to `fetch()`), so `getAdminIdentity()` below is the ONLY thing between the open internet
 * and a writable blob store — and specifically the only thing stopping a signed-in non-admin from
 * writing into Nina's folder. Two rules, both enforced here:
 *
 *   1. Admin or nothing. Not "signed in": `/admin/nina` is the only screen that uses this route.
 *   2. The user id in the pathname is INTERPOLATED FROM THE SESSION, never read from the request.
 *      There is one user today; the scoping rule (invariant 7) does not care.
 *
 * The gate runs BEFORE `handleUpload`, not inside `onBeforeGenerateToken`, so that a refusal is
 * the same 404 the pages give (`forbiddenJson()`) rather than the 400 `handleUpload` turns every
 * thrown error into. `/admin/nina` and this route therefore answer a signed-in stranger
 * identically, which is the whole point of choosing `notFound()` over `forbidden()` in
 * `requireAdmin()`. Signed out is still the 401 `requireUserIdApi()`'s callers already answer —
 * `fetch()` deserves a status, not a redirect to HTML.
 *
 * The token also carries `{ userId }` so that if `onUploadCompleted` is ever made a writer, it
 * cannot be spoofed into claiming a different owner than the authenticated session declared. It is
 * inert today, exactly as F04's is, and for the same reason: the row is written by a Server Action
 * after the bytes land, and Blob cannot reach a laptop during local development.
 */

export const runtime = 'nodejs'

/** What the browser may tell us. Validated, never trusted. */
const ClientPayload = z.object({
  contentType: z.enum(ADMIN_AVATAR_CONTENT_TYPES),
})

export async function POST(request: Request): Promise<Response> {
  // Fail loudly here if the Blob store was never linked, rather than at token-mint time with an
  // SDK message about a missing store.
  blobEnv()

  // AUTH, first and outside the SDK. Without this the route is an open upload endpoint.
  let identity: AdminIdentity
  try {
    identity = await requireAdminApi()
  } catch (error) {
    return error instanceof UnauthorizedError ? unauthorizedJson() : forbiddenJson()
  }

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // The pathname check has to be here — it is the one input only the SDK has. A throw
        // becomes a 400, which is the right shape for "your request was malformed".
        if (!isAdminAvatarRequestPathname(pathname, identity.userId)) {
          throw new Error('Invalid pathname')
        }

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        return {
          allowedContentTypes: [payload.contentType],
          maximumSizeInBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES,
          addRandomSuffix: true, // collision-proof; rewrites the stored pathname
          allowOverwrite: false, // never clobber an existing blob
          cacheControlMaxAge: ADMIN_AVATAR_CACHE_MAX_AGE,
          validUntil: Date.now() + ADMIN_AVATAR_TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({ userId: identity.userId }),
        }
      },

      /** Production-only observability. NOT a writer — `registerNinaAvatarAction` is. */
      onUploadCompleted: async ({ blob }) => {
        console.log('[f33] admin avatar blob landed', { pathname: blob.pathname })
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    // Terse on purpose, and it echoes nothing a probe could use to learn what exists.
    console.error('[f33] admin avatar upload refused', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload rejected' },
      { status: 400 },
    )
  }
}
