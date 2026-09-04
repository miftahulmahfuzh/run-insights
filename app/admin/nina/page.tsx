import { FileExplorer } from '@/components/admin/FileExplorer'
import type { ExplorerFolder, ExplorerPhoto } from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_ADMIN_PAGE_SIZE, NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { listNinaAvatarFolders, listNinaAvatarsInFolder } from '@/lib/nina/queries'
import { shareOrigin } from '@/lib/share/origin'

/**
 * `/admin/nina` — F33 R23's album, now the file manager this round's R1 asked for: *"can we make it
 * so that the in /admin/nina profile album, it looks like a file manager instead? this way i can
 * upload nested folders, and make the photos much more structured and easier to maintain. i will
 * put hundreds of profile pics in there."*
 *
 * Still a Server Component that does two things: gate, and hand one client component what it needs.
 * Every mutation is a Server Action in `lib/admin/ninaAlbumActions.ts`, so there is no `/api` route
 * on the write path and no client-side data fetching. What changed is the shape of the read.
 *
 * ── "HUNDREDS" IS WHY THIS PAGE IS PAGINATED AND FOLDER-SCOPED ──────────────────────────────
 * `listNinaAvatars(userId)` was unpaginated by design — F33's `NINA_ALBUM_MAX = 60` was a render cap
 * over rows already in hand, which was right for six generations a day. It is wrong for hundreds of
 * uploaded files: the query would return all of them, the RSC payload would carry all of them, and
 * the browser would lay out all of them. So the read is now `listNinaAvatarsInFolder`, one folder
 * and one page of `NINA_ADMIN_PAGE_SIZE` at a time, driven by `searchParams`.
 *
 * ── `searchParams` IS A PROMISE, AND `PageProps` IS HOW THIS REPO TYPES IT ──────────────────
 * Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" — *"You can type pages with `PageProps` to get strongly typed `params` and `searchParams`
 * from the route literal. `PageProps` is a globally available helper."* It also states, twice, that
 * `searchParams` is a promise and must be awaited, and that reading it opts the page into dynamic
 * rendering. `app/admin/layout.tsx:44` already uses the sibling `LayoutProps<'/admin'>`.
 *
 * `force-dynamic` therefore stays, but its job is unchanged and is not about `searchParams`: the
 * album is per-request state that must reflect the action that just ran, and
 * `revalidatePath('/admin/nina')` in every action is what makes that immediate.
 *
 * ── BOTH PARAMETERS ARE VALIDATED, NOT TRUSTED ──────────────────────────────────────────────
 * `?folder=` goes through phase 2's **`validateFolderPath`**, not through `normaliseFolderPath`,
 * and the difference is the whole point: the normaliser deliberately PRESERVES a `..` segment so
 * that exactly one function decides its fate, so normalising alone would hand `../../etc` to a
 * query as a folder name. It would not be a vulnerability (the read is `folder = $2`, exact-match
 * and `user_id`-scoped, so it returns nothing) but it would put an unrepresentable path in the
 * breadcrumb and in every link built from it. A refused path falls back to the album root, which is
 * the only sensible answer to a folder that cannot exist. `?page=` is parsed, floored at 1 and
 * capped, so `?page=99999999` cannot ask the database for a hundred-million-row offset. Neither is
 * a security boundary — `requireAdmin()` on line 1 is, and every read below is scoped to the id it
 * returns — but a page that hands unvalidated strings to a query is a page that will one day hand
 * it something worse.
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is even awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's
 * and each action's are the only gates; `app/admin/layout.tsx:29-35` explains why all three exist
 * rather than one.
 *
 * SEAM — PHASE 7. `shareOrigin()` (`lib/share/origin.ts:25`) is read HERE and passed down as a prop.
 * It is `server-only` and invariant 9 forbids a `NEXT_PUBLIC_` for it, so the origin crosses to the
 * client the same way `userId` does: `<FileExplorer shareOrigin={shareOrigin()} … />`.
 */

export const dynamic = 'force-dynamic'

/** A hand-typed `?page=` cannot ask for an offset no album will ever reach. */
const PAGE_CEILING = 1000

export default async function AdminNinaPage(props: PageProps<'/admin/nina'>) {
  const { userId } = await requireAdmin()

  const params = await props.searchParams
  const requested = validateFolderPath(readOne(params.folder) ?? NINA_FOLDER_ROOT)
  const folder = requested.ok ? requested.path : NINA_FOLDER_ROOT
  const page = readPage(readOne(params.page))

  const [listed, folders] = await Promise.all([
    listNinaAvatarsInFolder(userId, folder, {
      limit: NINA_ADMIN_PAGE_SIZE,
      offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
    }),
    listNinaAvatarFolders(userId),
  ])

  /*
   * The row -> prop mapping is here rather than in the client component for the reason it always
   * was: `NinaAvatarRow` carries `announcedAt`, `pathname`, `sourceKey` and `thumbPathname`, none of
   * which a browser has any use for, and none of which should cross the serialization boundary
   * wholesale.
   *
   * `filename` falls back to the id because every row written before phase 1 added the column has
   * none, and a grid tile with no label under it is worse than a tile labelled by its id.
   */
  const photos: ExplorerPhoto[] = listed.rows.map((row) => ({
    id: row.id,
    url: row.blobUrl,
    thumbUrl: row.thumbUrl,
    folder: row.folder,
    filename: row.filename ?? row.id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    source: row.source,
    isCurrent: row.isCurrent,
    description: row.description,
    crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
    createdAt: row.createdAt.toISOString(),
  }))

  /* `NinaAvatarFolderCount`'s count field is `photos` (phase 1's name; this phase's draft assumed
   * `count`). `ExplorerFolder` keeps `count`, because that is what makes it structurally
   * assignable to phase 2's `FolderCount` and `buildTree` therefore needs no adapter. */
  const folderList: ExplorerFolder[] = folders.map((entry) => ({
    folder: entry.folder,
    count: entry.photos,
  }))

  const albumTotal = folderList.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Nina&rsquo;s album</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Drop a folder straight out of Explorer and only the new files upload. Click a photo to
          frame her face and make it her profile picture. Folders are metadata, not blob paths, so
          moving a photo moves no bytes.
        </p>
      </header>

      {albumTotal === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album is empty, so she is still showing the committed photo (
          <code className="text-ink">{NINA_AVATAR_FALLBACK_SRC}</code>). Add a folder below and the
          first photo you make hers becomes her face.
        </p>
      ) : null}

      {/*
       * `shareOrigin()` is resolved HERE, on the server, and handed down as a string — phase 7 /
       * R2. `lib/share/origin.ts` opens with `import 'server-only'`, so no client component can
       * call it, and invariant 9 (roadmap §4.1) forbids exporting it as a build-time public
       * environment variable. That is not a limitation being worked around; it is the mechanism.
       * In production this is `AUTH_URL` — `https://runins.site`, the origin the user named in the
       * requirement — and on a preview deployment it is the project's stable production hostname
       * rather than the per-deployment one, so a link minted on a preview still opens the real
       * chat instead of a hostname that dies at the next push.
       *
       * The leading `*` on every line is the same load-bearing detail `SelectionPane`'s seam
       * comment records: `ci:client-secret-guard`'s Rule 3 exempts only lines a comment scanner
       * recognises, and a JSX comment with bare prose continuation lines fails the guard while
       * explaining why it is being obeyed.
       */}
      <FileExplorer
        userId={userId}
        folders={folderList}
        photos={photos}
        page={{
          folder,
          page,
          pageSize: NINA_ADMIN_PAGE_SIZE,
          total: listed.total,
        }}
        shareOrigin={shareOrigin()}
      />
    </div>
  )
}

/**
 * `searchParams` values are `string | string[] | undefined` — a repeated parameter arrives as an
 * array. The first wins; there is no meaning to assign to a second `?folder=`.
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
