import { FileExplorer } from '@/components/admin/FileExplorer'
import type {
  AlbumExplorerPhoto,
  ExplorerFolder,
  ExplorerPageInfo,
  ExplorerPhoto,
  MediaExplorerPhoto,
} from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, readExplorerView, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  NINA_ADMIN_PAGE_SIZE,
  NINA_AVATAR_FALLBACK_SRC,
  NINA_CHAT_PHOTO_PAGE_SIZE,
  photoSideOf,
} from '@/lib/nina/album'
import {
  countNinaMediaPhotos,
  listNinaAvatarFolders,
  listNinaAvatarsInFolder,
  listNinaMediaPhotos,
  type NinaAvatarFolderCount,
} from '@/lib/nina/queries'
import { shareOrigin } from '@/lib/share/origin'

/**
 * `/admin/nina` — the Image collection (R4's rename of F33 R23's album), still the file manager
 * that round's R1 asked for: *"can we make it
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
  /*
   * The view is read FIRST, because it decides which table this page reads at all. `?view=media`
   * ignores `?folder=` by construction: Media is not a folder and has no path, so a folder on a
   * media URL is a stale parameter, not a destination — the media arm never consults `folder`, and
   * the breadcrumb draws "Album / Media" from `view` alone. The folder is still VALIDATED
   * unconditionally, because the album arm below needs it and because a refused path must fall
   * back to the root on both arms rather than throw.
   */
  const view = readExplorerView(params.view)
  const requested = validateFolderPath(readOne(params.folder) ?? NINA_FOLDER_ROOT)
  const folder = requested.ok ? requested.path : NINA_FOLDER_ROOT
  const page = readPage(readOne(params.page))

  /*
   * The two arms fill the same four slots and fall through to ONE render, because the header, the
   * tree and the explorer are the same chrome over either table. `folders` (the tree's read) is
   * unconditional: BOTH views draw the same tree pane, Media pinned under "Album", so the tree
   * must be built even while the grid is showing the other collection.
   */
  let folders: NinaAvatarFolderCount[]
  let photos: ExplorerPhoto[]
  let pageInfo: ExplorerPageInfo
  let mediaTotal: number

  if (view === 'media') {
    /*
     * One page of every ORIGINAL conversation photograph, both kinds, orphans included. No
     * `limit` argument on purpose: `NINA_CHAT_PHOTO_PAGE_SIZE` is the read's own default AND
     * ceiling, so the constant's one spelling governs the page size and no call site can quietly
     * widen it into the unpaginated read it exists to prevent.
     */
    const [listed, treeFolders] = await Promise.all([
      listNinaMediaPhotos(userId, { offset: (page - 1) * NINA_CHAT_PHOTO_PAGE_SIZE }),
      listNinaAvatarFolders(userId),
    ])
    folders = treeFolders

    /*
     * Row -> prop on the server, for the same reason as the album arm below: plain serializable
     * props and nothing else. `side` is `photoSideOf(kind)` computed HERE, which is what keeps the
     * his/hers discriminator in one place (`lib/nina/album.ts`) — the same call `galleryPhotos`
     * makes for the same reason.
     *
     * `filename` is DERIVED, because the table has no filename column: the day the photograph was
     * made plus its id, so two same-day photographs still sort apart in a `title=` and in the pane
     * header. Not parsed out of `pathname` — the pathname is displayed, never read
     * (`chatPhotoModel.ts`'s rule, which this arm inherits with the rows).
     */
    photos = listed.rows.map((row): MediaExplorerPhoto => ({
      origin: 'media',
      id: row.id,
      url: row.blobUrl,
      /* `null`, permanently: the table has no thumbnail column (`lib/nina/album.ts:80-105`), so
         the grid's `thumbUrl ?? url` fallback is the only render path. */
      thumbUrl: null,
      /* A message image is filed nowhere. The value is the album root's path — but nothing links
         into it: the breadcrumb and the pane draw their trail from `view`, and folder verbs never
         see a media row. */
      folder: NINA_FOLDER_ROOT,
      filename: `${row.createdAt.toISOString().slice(0, 10)} ${row.id}`,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      /* On this table the kind IS the provenance: 'generated' from her worker, 'upload' from his
         composer. Rendered as the pane's Source row, never assumed. */
      source: row.kind,
      /* Never her current face: adoption COPIES the bytes into `nina_avatars`, and it is the copy
         that carries `is_current`. */
      isCurrent: false,
      description: row.description,
      /* Identity crop — `resolveCrop` folds the three nulls to centred object-cover. Framing
         arrives only when adoption mints an avatar row that can store one. */
      crop: { scale: null, x: null, y: null },
      createdAt: row.createdAt.toISOString(),
      kind: row.kind,
      side: photoSideOf(row.kind),
      prompt: row.prompt,
      messageId: row.messageId,
      sortOrder: row.sortOrder,
    }))

    pageInfo = {
      folder: NINA_FOLDER_ROOT,
      page,
      pageSize: NINA_CHAT_PHOTO_PAGE_SIZE,
      total: listed.total,
    }
    mediaTotal = listed.total
  } else {
    /*
     * The media badge's count rides along on the album arm too: the tree pane shows "Media <n>" on
     * every view, and one aggregate answers it — the same single `count(*)` the /admin hub card
     * runs, and the exact shape `countNinaAvatars` was written to make cheap.
     */
    const [listed, treeFolders, mediaCount] = await Promise.all([
      listNinaAvatarsInFolder(userId, folder, {
        limit: NINA_ADMIN_PAGE_SIZE,
        offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
      }),
      listNinaAvatarFolders(userId),
      countNinaMediaPhotos(userId),
    ])
    folders = treeFolders

    /* The row -> prop mapping is here rather than in the client component for the reason it always
     * was: `NinaAvatarRow` carries `announcedAt`, `pathname`, `sourceKey` and `thumbPathname`, none
     * of which a browser has any use for, and none of which should cross the serialization boundary
     * wholesale.
     *
     * `filename` falls back to the id because every row written before the column existed has
     * none, and a grid tile with no label under it is worse than a tile labelled by its id.
     * The `(row): AlbumExplorerPhoto` annotation is what keeps `origin: 'album'` a literal —
     * without it the string widens and the union stops being discriminable. */
    photos = listed.rows.map((row): AlbumExplorerPhoto => ({
      origin: 'album',
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

    pageInfo = {
      folder,
      page,
      pageSize: NINA_ADMIN_PAGE_SIZE,
      total: listed.total,
    }
    mediaTotal = mediaCount
  }

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
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Image collection</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          {/*
           * The body copy follows the view; the h1 does not (its rename is a later phase's edit,
           * kept out of here so this phase ships no label churn). The media sentence says what the
           * view IS and nothing about verbs that have not landed yet.
           */}
          {view === 'media'
            ? 'Every photograph of the conversation — hers and his, uploads included — newest first, the same set the Media section shows.'
            : 'Drop a folder straight out of Explorer and only the new files upload. Click a photo to frame her face and make it her profile picture. Folders are metadata, not blob paths, so moving a photo moves no bytes.'}
        </p>
      </header>

      {/* The empty-ALBUM notice is an album-view fact (it is about her committed face and about
          dropping folders). On the media arm the grid's own empty state speaks instead, so the
          operator is never told to drop a folder over a grid of conversation photographs. */}
      {view === 'album' && albumTotal === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album folder is empty, so she is still showing the committed photo (
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
       * `view` and `mediaCount` are the media arm's thread: which collection the URL has open, and
       * how many photographs it holds in total — the tree badge needs the count on BOTH views,
       * which is why the album arm ran the aggregate.
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
        page={pageInfo}
        view={view}
        mediaCount={mediaTotal}
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
