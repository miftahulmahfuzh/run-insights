import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { z } from 'zod'

import { getUserId } from '@/lib/auth/requireUserId'
import { blobEnv } from '@/lib/env'
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  BLOB_CACHE_MAX_AGE,
  MAX_UPLOAD_BYTES,
  SCREEN_KINDS,
  SHOT_REQUEST_PATHNAME_RE,
  UPLOAD_TOKEN_TTL_MS,
} from '@/lib/extract/constants'
import {
  NINA_CHAT_ALLOWED_CONTENT_TYPES,
  NINA_CHAT_MAX_UPLOAD_BYTES,
  isNinaChatRequestPathname,
} from '@/lib/nina/images'

/**
 * `POST /api/upload` — the Vercel Blob client-upload handshake (roadmap §4.8).
 *
 * THIS ROUTE NEVER RECEIVES IMAGE BYTES. It mints a short-lived signed token and the browser PUTs
 * straight to Blob. Three reasons, all still true here: a Vercel Function rejects bodies over
 * ~4.5 MB, streaming an upload through a function bills wall-clock for zero computation, and only
 * a direct browser PUT can report honest per-file progress.
 *
 * It is also a security boundary in its own right. `proxy.ts` deliberately does not match
 * `/api/*` (a 307 to an HTML sign-in page is a terrible answer to `fetch()`), so the
 * `getUserId()` check below is the only thing between the open internet and a writable blob
 * store. Structurally ported from `expense-tracking/app/api/photos/upload/route.ts`.
 *
 * WHAT IS DIFFERENT FROM THAT PORT: there is no parent row to authorise against. R-1 says no
 * `runs` row exists at upload time and no `extractions` row exists yet either — the extraction is
 * created by `POST /api/extract`, after the bytes have landed. So ownership here is simply "this
 * authenticated user", and `kind` is the only client-chosen value that has to survive into the
 * signed token.
 *
 * F33 PHASE 6 ADDED A SECOND BRANCH. `nina/<userId>/chat/<id>.jpg` mints a chat-photo token with
 * its own size ceiling. It is discriminated by the PATHNAME rather than by a widened
 * `clientPayload`, so this file and `UploadPicker.tsx` keep the shapes they had, and its check is
 * strictly stronger than the shots branch's: `isNinaChatRequestPathname` binds the path to the
 * authenticated user, not merely to an alphabet.
 */

export const runtime = 'nodejs'

/** What the browser may tell us. Validated, never trusted. */
const ClientPayload = z.object({
  kind: z.enum(SCREEN_KINDS),
})

export async function POST(request: Request): Promise<Response> {
  // Fail loudly here if the Blob store was never linked, rather than at token-mint time with an
  // SDK message about a missing store.
  blobEnv()

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
        // AUTH. Without this line the route is an open upload endpoint for the internet.
        // getUserId(), not requireUserId(): the latter redirects, and handleUpload turns this
        // throw into a 400 the fetch caller can actually read.
        const userId = await getUserId()
        if (!userId) throw new Error('Not authenticated')

        /*
         * ── TWO BRANCHES, DISCRIMINATED BY THE PATHNAME ─────────────────────────────────────
         * The pathname is the value the token authorises a write to, so it is the honest
         * discriminator — and using it means `ClientPayload` and `UploadPicker.tsx` need no
         * change at all to admit a second kind of upload (F33 phase 6).
         *
         * A chat photo is not a run screenshot and does not share its limits: 768 px/q75
         * photographs land near 120-200 KB and a dense frame can reach 400, so the ceiling is
         * 900 KB rather than 600. See `lib/nina/images.ts`.
         */
        if (isNinaChatRequestPathname(pathname, userId)) {
          return {
            allowedContentTypes: [...NINA_CHAT_ALLOWED_CONTENT_TYPES],
            maximumSizeInBytes: NINA_CHAT_MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
            validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
            // No client JSON is parsed on this branch: there is nothing a chat photo needs to
            // declare. The owner is in the pathname and re-derived from the session anyway.
            tokenPayload: JSON.stringify({ userId, target: 'nina-chat' }),
          }
        }

        // The client picks its own pathname, so constrain it hard: our prefix, our alphabet, our
        // extension. This is the path-traversal defence and the "don't write beside anything
        // else in the store" defence, in one regex.
        if (!SHOT_REQUEST_PATHNAME_RE.test(pathname)) throw new Error('Invalid pathname')

        const payload = ClientPayload.parse(JSON.parse(clientPayload || '{}'))

        return {
          // Compression always outputs JPEG, so exactly one type is allowed through.
          allowedContentTypes: [...ALLOWED_UPLOAD_CONTENT_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true, // collision-proof; rewrites the stored pathname
          allowOverwrite: false, // never clobber an existing blob
          cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
          validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
          // Carried in the SIGNED token, so the completion webhook cannot be spoofed into
          // claiming a different kind (or a different owner) than the authenticated upload
          // session declared. The webhook has no cookies and cannot re-authorise.
          tokenPayload: JSON.stringify({ userId, kind: payload.kind }),
        }
      },

      /**
       * Vercel calls this server-to-server once the bytes land. It is a production-only
       * observability net and NOT a writer: it never fires against localhost (Blob cannot reach
       * a laptop), and under R-1 there is nothing for it to write anyway — no extraction row
       * exists yet, and `POST /api/extract` is the primary writer for both `extractions` and
       * `run_photos`. Keeping it inert is what keeps the whole flow developable locally.
       */
      onUploadCompleted: async ({ blob }) => {
        console.log('[f04] blob landed', { pathname: blob.pathname })
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    // 400 for both phases. The message is deliberately terse — "Not authenticated", "Invalid
    // pathname" — and echoes nothing back that a probe could use to learn what exists.
    console.error('[f04] upload route refused', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload rejected' },
      { status: 400 },
    )
  }
}
