import { ChatPhotoGrid, CHAT_PHOTO_COLLECTION_LABEL } from '@/components/admin/ChatPhotoGrid'
import type { ChatPhoto } from '@/components/admin/chatPhotoModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_CHAT_PHOTO_PAGE_SIZE, photoSideOf } from '@/lib/nina/album'
import { listNinaChatPhotos } from '@/lib/nina/queries'

/**
 * `/admin/photos` — R2: *"make sure all the photos in in user chat collection with nina (nina
 * generated images) are shown in admin page as well. just put them into a folder or something."*
 *
 * A Server Component that does two things: gate, and hand one client component what it needs. The
 * same shape as `app/admin/nina/page.tsx`, over a different table.
 *
 * ── IT IS A DIFFERENT TABLE, AND THAT IS THE WHOLE REASON THIS ROUTE EXISTS ─────────────────
 * `/admin/nina` is `nina_avatars` — her PROFILE album, which has a real `folder` column, a
 * `nina_folders` table, thumbnails and an `is_current` row. This is `nina_message_images`, the
 * conversation's photographs, which has none of those. R2 is about the second one and the admin
 * page showed only the first.
 *
 * ── THE SET IS `kind = 'generated'`, NOT `role = 'nina'` ────────────────────────────────────
 * `listNinaChatPhotos` filters on `kind` for the reason its own docstring gives: R26's re-attach
 * path (`lib/nina/actions.ts:512-531`) writes `kind: 'generated'` onto a message whose `role` is
 * `'runner'`, so a role filter would omit her re-attached selfies and this page would disagree with
 * `/nina/about`'s gallery about which photographs are hers.
 *
 * ── `searchParams` IS A PROMISE, AND `PageProps` IS HOW THIS REPO TYPES IT ──────────────────
 * Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" — *"You can type pages with `PageProps` to get strongly typed `params` and `searchParams`
 * from the route literal. `PageProps` is a globally available helper."* The same page states that
 * `searchParams` is a promise that must be awaited, that a repeated parameter arrives as an array
 * (hence `readOne`), and that reading it opts the page into dynamic rendering. Types are generated
 * by `next dev` / `next build` / `next typegen`, so `npm run typecheck` — which runs typegen first
 * — is the command that proves this file, and a bare `tsc --noEmit` is not.
 *
 * `force-dynamic` therefore stays and its job is NOT `searchParams`: it is what
 * `app/admin/nina/page.tsx:33-36` says it is — the collection is per-request state that must
 * reflect the action that just ran, and phase 3's `revalidatePath('/admin/photos')` is what will
 * make that immediate.
 *
 * ── `?page=` IS VALIDATED, NOT TRUSTED ──────────────────────────────────────────────────────
 * Parsed, floored at 1, capped at `PAGE_CEILING`, exactly as `/admin/nina` does it, so a hand-typed
 * `?page=99999999` cannot ask the database for a hundred-million-row offset. It is not a security
 * boundary — `requireAdmin()` on line 1 is, and the read below is scoped to the id it returns.
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is even awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's
 * are the only gates on a read-only page; `app/admin/layout.tsx:150-156` explains why both exist.
 *
 * ── READ-ONLY ───────────────────────────────────────────────────────────────────────────────
 * Phase 2 renders no control that writes. Phase 3 adds replace / add / remove as Server Actions in
 * `lib/admin/chatPhotoActions.ts` and wires them at the seams named in `ChatPhotoDetail` and
 * `ChatPhotoGrid`.
 */

export const dynamic = 'force-dynamic'

/** A hand-typed `?page=` cannot ask for an offset no collection will ever reach. */
const PAGE_CEILING = 1000

export default async function AdminChatPhotosPage(props: PageProps<'/admin/photos'>) {
  const { userId } = await requireAdmin()

  const params = await props.searchParams
  const page = readPage(readOne(params.page))

  const listed = await listNinaChatPhotos(userId, {
    limit: NINA_CHAT_PHOTO_PAGE_SIZE,
    offset: (page - 1) * NINA_CHAT_PHOTO_PAGE_SIZE,
  })

  /*
   * The row -> prop mapping is HERE, on the server, for `app/admin/nina/page.tsx:83-91`'s reason:
   * a client component receives plain serializable props and nothing else. `createdAt` is a `Date`
   * on `NinaImageRow` and does not cross the boundary as one, so it is rendered to ISO here;
   * `side` is `photoSideOf(kind)` computed here rather than in the browser, which is what
   * `galleryPhotos` does with the same field for the same reason. No drizzle type and no zod schema
   * crosses this line.
   */
  const photos: ChatPhoto[] = listed.rows.map((row) => ({
    id: row.id,
    messageId: row.messageId,
    url: row.blobUrl,
    kind: row.kind,
    side: photoSideOf(row.kind),
    pathname: row.pathname,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    description: row.description,
    prompt: row.prompt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Chat photos</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every photograph Nina has generated in the conversation, newest first, in one collection
          called {CHAT_PHOTO_COLLECTION_LABEL}. This is not her profile album &mdash; that lives
          under Nina&rsquo;s album and is a different set of pictures. Click one to read what she
          sees in it and what she was asked to draw.
        </p>
      </header>

      {/*
       * `userId` is handed down from `requireAdmin()` above and is rendered nowhere. SEAM — PHASE
       * 3: its Add and Replace build `adminChatPhotoPathname(userId, id)` out of it, and a user id
       * that reaches a Blob pathname must come from the server. `app/admin/nina/page.tsx:57-59`
       * threads `shareOrigin` into `FileExplorer` the same way.
       */}
      <ChatPhotoGrid
        photos={photos}
        userId={userId}
        page={{
          page,
          pageSize: NINA_CHAT_PHOTO_PAGE_SIZE,
          total: listed.total,
        }}
      />
    </div>
  )
}

/**
 * `searchParams` values are `string | string[] | undefined` — a repeated parameter arrives as an
 * array, which the framework doc's own table spells out (`/shop?a=1&a=2` -> `Promise<{ a: ['1','2'] }>`).
 * The first wins; there is no meaning to assign to a second `?page=`.
 */
function readOne(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** 1-based, floored at 1, capped at `PAGE_CEILING`. Garbage reads as page 1. */
function readPage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, PAGE_CEILING)
}
