# Phase 2: `/admin/nina` honours a media deep link

**Plan set:** `COPY_ADMIN_MEDIA_LINK_PLAN.md`
**Analysis:** `20261001-104938-K7P2_code_analyzer.md`
**Satisfies:** R2 — the copied link opens `/admin/nina?view=media` with that photograph already
selected, so the operator's next click is Replace.
**Depends on:** Phase 1 (the parameter key)
**Difficulty:** HARD
**Package:** `lib/nina/queries` (primary), with `app/admin` and `components/admin` edits

---

## Goal

After this phase, `/admin/nina?view=media&image=<id>` resolves that id server-side into the page of
the Media collection that holds the photograph, renders that page, and lands with the row
**selected** — which is what mounts `SelectionPane` → `MediaPane` → `MediaControls`' Replace. A
re-shared chat row resolves through `source_image_id` to the original whose bytes a Replace would
change. A foreign, malformed, deleted or non-original id changes nothing and says nothing. The
album's `?avatar=` arm is byte-identical in behaviour.

## Interface Contract

**Creates:**

- `lib/nina/queries/images.ts` → `locateNinaMediaPhoto(userId, id): Promise<NinaMediaPhotoLocation | null>`
- `lib/nina/queries/images.ts` → `interface NinaMediaPhotoLocation { id: string; offset: number }`
- `app/admin/nina/page.tsx` → module-private `readMediaPhotoId(raw: string | null): string | null`
- `tests/nina.mediaLocate.test.ts` (new file)

**Signature changes:**

- `app/admin/nina/page.tsx` module-private `pageOfOffset(offset: number)` →
  `pageOfOffset(offset: number, pageSize: number)`. Private to the file; no external caller.

**Barrel: `lib/nina/queries.ts` NEEDS NO EDIT, and must not be in this phase's diff.** Measured in
the worktree: that barrel is seventeen `export *` lines (`lib/nina/queries.ts:64-80`) and nothing
else, so `locateNinaMediaPhoto` re-exports itself the moment it is declared in
`lib/nina/queries/images.ts`. The analysis document's Impact Points row 3 ("`lib/nina/queries.ts`
(barrel) — re-export the new query") is therefore **satisfied by doing nothing to that file**; the
reconciler has recorded the re-mapping.

**The real coupled file is `lib/nina/queries.test.ts`**, the barrel's frozen contract test.
`BARREL_VALUE_EXPORTS` is asserted with `toEqual` against `Object.keys(barrel).sort()`, so the
moment `locateNinaMediaPhoto` exists that suite goes RED until the list grows **110 → 111 names,
sorted, in the same commit as the query** — `'locateNinaMediaPhoto'` sorts immediately after
`'locateNinaAvatar'`. That file's own header also demands the growth be documented in the same
commit with a pointer to the decision; Step 2 does both. This is not optional housekeeping: it is
the only thing standing between this phase and a red `npm test`.

**Requires (from earlier phases):** `lib/admin/albumDeepLink.ts` must export the media parameter
key (Phase 1).

**The constant is `NINA_MEDIA_PHOTO_PARAM`, and its value is `'image'`.** This plan's first draft
guessed `NINA_MEDIA_IMAGE_PARAM` while phase 1 was still unlanded (`lib/admin/albumDeepLink.ts` then
still ended at `hrefForMediaView()` on line 76) and flagged the guess as an assumption. The
reconciler has pinned phase 1's actual spelling: phase 1 owns that module and declares

```ts
export const NINA_MEDIA_PHOTO_PARAM = 'image'
```

The **value** was never in dispute — both plans wrote `'image'` — so nothing about the URL grammar,
the `?image=<id>` literals in the comments, or `components/admin/FileExplorer.test.tsx`'s
`replaceState` setup URL changes. Only the imported **binding** moves, and this file now spells it
`NINA_MEDIA_PHOTO_PARAM` everywhere (Step 4a's import line and Step 4b's one `params[...]`
subscript). **Import the constant; never re-spell the string `'image'` locally** — exactly as
`app/admin/nina/page.tsx:9` already imports `NINA_AVATAR_PARAM` rather than writing `'avatar'`.

**Leaves alone (owned by others):**

- `lib/admin/albumDeepLink.ts` — Phase 1. Imported from, never edited.
- `lib/nina/queries.ts` — not owned by anyone in this set, because nothing in this set needs to
  change it (seventeen `export *` lines). It must not appear in any phase's diff.
- `components/ui/PhotoViewer.tsx`, `components/ui/CopyAdminLinkButton.tsx` — Phase 3.
- `components/nina/*`, `components/photo/*`, `app/nina/*`, `app/photo/*`, `lib/nina/chatphotos.ts` — Phase 4.
- `components/admin/explorer/*` — read and confirmed unchanged (see Step 6).

**Deletes:** none. **Renames:** none. **Schema:** none — no migration, no `db:generate`, no backfill.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/images.ts` | modify | header line `:40`; new `NinaMediaPhotoLocation` + `locateNinaMediaPhoto` inserted at `:756` (after `countNinaMediaPhotos`, inside §5a-2) |
| `lib/nina/queries.test.ts` | modify | header paragraph + `'locateNinaMediaPhoto'` into `BARREL_VALUE_EXPORTS` at `:198` — **110 → 111, sorted, same commit as the query** |
| `tests/nina.mediaLocate.test.ts` | create | the query's SQL contract: scope, full sort key, re-share resolution, the three nulls |
| `app/admin/nina/page.tsx` | modify | imports `:9-28`; the deep-link block `:131-159`; `deepLinkId` prop `:420`; `pageOfOffset` `:467`; new `readMediaPhotoId` after `readAvatarId` `:457` |
| `components/admin/FileExplorer.tsx` | modify | the landing effect's comment `:240` (rewritten — plan invariant 11) and its `replaceState` call `:250` |
| `components/admin/FileExplorer.test.tsx` | modify | a new `describe` block for the media arm's landing, appended after `:540` |

Six files, as the plan index says. **`lib/nina/queries.ts` is deliberately not one of them** — see
the Barrel paragraph above.

## Implementation Steps

### Step 1: `locateNinaMediaPhoto` — the id → offset read

**File:** `lib/nina/queries/images.ts:756` (immediately after `countNinaMediaPhotos`'s closing
brace on `:755`, before the `§5b` banner on `:758`)

**Change:** Add the interface and the query. Two statements, deliberately — argued in the docstring.

**The three correctness constraints, up front:**

1. The offset must mirror **`mediaCollectionScope`** (`:682` — `userId AND isOriginalPhoto()`), and
   the second statement therefore calls that function rather than restating it.
2. The offset must mirror the **full** sort key `listNinaMediaPhotos` reads with (`:727-730`) —
   `coalesce(last_replaced_at, created_at) DESC, id DESC`. `created_at` alone computes the wrong
   page, and a *replaced* row is exactly the row whose position has moved, which is the row this
   whole feature exists to reach.
3. A row with `source_image_id` set is **not** in the collection (`isOriginalPhoto()` excludes it),
   so it has no tile to select. It resolves through that column to its original — `:673` already
   states "a re-show is the same photograph, not a second one", and the original is the row whose
   bytes a Replace would change.

**Code:**

```ts
/**
 * Where one conversation photograph sits in the Media collection — the answer
 * `/admin/nina?view=media&image=<id>` needs before a page can be rendered. See
 * `locateNinaMediaPhoto`. `NinaAvatarLocation`'s twin, minus `folder`: Media is not a folder, has
 * no path, and the media arm never consults one (`app/admin/nina/page.tsx:121-127`).
 */
export interface NinaMediaPhotoLocation {
  /**
   * The ORIGINAL's id, which is not necessarily the id that was asked for: a re-share resolves
   * through `source_image_id` to the row it re-shows. The caller selects THIS id, because this is
   * the row the grid holds a tile for and the row a Replace would rewrite.
   */
  id: string
  /**
   * 0-based position in the Media collection under
   * `coalesce(last_replaced_at, created_at) desc, id desc`. A row count, not a page — the page
   * SIZE is the caller's policy, exactly as `locateNinaAvatar` argues for its own offset.
   */
  offset: number
}

/**
 * Which page of the Media collection holds a photograph, and which row the operator meant.
 *
 * ── WHY THIS READ HAS TO EXIST AT ALL ───────────────────────────────────────────────────────
 * `locateNinaAvatar`'s argument, one collection over: `/admin/nina` holds ONE page at a time and
 * the explorer's selection is a `photos.find(...)` over that array
 * (`components/admin/FileExplorer.tsx:209`). A link minted in the client app carries an id and
 * nothing else — where that row sits in a recency-ordered collection is a database question, and
 * only the server can answer it. `lib/admin/albumDeepLink.ts`'s header used to say that adding
 * this read was "a query-layer change rather than a URL grammar"; this is that change.
 *
 * ── TWO STATEMENTS, AND THE SECOND ONE IS WHY ───────────────────────────────────────────────
 * `locateNinaAvatar` is one statement because an avatar id is always its own answer. A message
 * image's id is not: F37's `source_image_id` makes a re-show a SECOND row naming the first, and
 * `isOriginalPhoto()` keeps that second row out of the collection entirely — so the id a chat
 * overlay holds can legitimately name a row with no tile. Resolving it needs the asked row's
 * `source_image_id` before the scope can be applied at all.
 *
 * It could be folded into one self-joined statement, and is not, for a correctness reason rather
 * than a style one: `mediaCollectionScope` is written against the UN-ALIASED `nina_message_images`,
 * so a self-join would force this function to hand-spell the collection predicate on an alias — a
 * second opinion about what the Media view IS, and the one thing the brief for this read forbids.
 * Statement two calls `mediaCollectionScope(userId)` verbatim instead. Statement one is a primary
 * key lookup with a `user_id` equality beside it; it costs one index probe on a page that already
 * issues several.
 *
 * ── THE OFFSET MIRRORS BOTH HALVES OF `listNinaMediaPhotos`, AND BOTH HALVES MATTER ─────────
 * The PREDICATE is `mediaCollectionScope`, called. The SORT KEY is
 * `coalesce(last_replaced_at, created_at) desc, id desc` — media-recency-sort, 2026-09-19 — and
 * `created_at` alone would compute the wrong page for precisely the rows this feature is for: a
 * photograph the operator already replaced once has moved to the top of the collection while its
 * `created_at` deliberately did not move (`updateNinaChatPhotoBlob`'s header).
 *
 * Under a DESCENDING order a row's position is how many rows sort BEFORE it, which is how many
 * compare GREATER as the tuple. Postgres compares row values left to right, so
 * `(coalesce(…), id) > (coalesce(…), id)` is that predicate in one expression and cannot drift
 * from the `ORDER BY` the way a hand-expanded `OR` chain could — `locateNinaAvatar`'s reasoning,
 * applied to a two-column key whose first column is an expression.
 *
 * **The correlated subquery hand-spells `earlier`'s columns**, including `isOriginalPhoto()`'s two
 * null checks, because a drizzle predicate built over `ninaMessageImages` names the OUTER table and
 * cannot be re-pointed at an alias. That is `locateNinaAvatar`'s shape too (it spells
 * `earlier.user_id` and `earlier.folder` by hand). The pairing is therefore a comment's
 * responsibility and this is the comment: **`earlier.source_avatar_id is null and
 * earlier.source_image_id is null` IS `isOriginalPhoto()` (`:523`), and the two must be changed
 * together.** `tests/nina.mediaLocate.test.ts` asserts both spellings appear in one statement.
 *
 * ── WHAT ANSWERS `null`, AND WHY IT IS SILENT ───────────────────────────────────────────────
 * Not this user's row; no such row; a re-share whose original has gone; and a row that is not an
 * original and names no image either — a re-SHOW of an album avatar (`source_avatar_id` set,
 * `source_image_id` null) has no Media tile and no media original to stand in for it, so it
 * resolves to nothing rather than to a guess. All four are one answer, per `lib/nina/queries.ts`'s
 * rule 1: a page that distinguished "deleted" from "not yours" would be telling a stranger which
 * ids exist.
 */
export async function locateNinaMediaPhoto(
  userId: string,
  id: string,
): Promise<NinaMediaPhotoLocation | null> {
  const asked = await db
    .select({ id: ninaMessageImages.id, sourceImageId: ninaMessageImages.sourceImageId })
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .limit(1)

  const row = asked[0]
  if (row === undefined) return null

  /* A re-share IS the photograph it re-shows, so the original is what gets located and selected. */
  const originalId = row.sourceImageId ?? row.id

  const located = await db
    .select({
      id: ninaMessageImages.id,
      offset: sql<number>`(
        select count(*)
        from ${ninaMessageImages} as earlier
        where earlier.user_id = ${ninaMessageImages.userId}
          and earlier.source_avatar_id is null
          and earlier.source_image_id is null
          and (
            coalesce(earlier.last_replaced_at, earlier.created_at),
            earlier.id
          ) > (
            coalesce(${ninaMessageImages.lastReplacedAt}, ${ninaMessageImages.createdAt}),
            ${ninaMessageImages.id}
          )
      )`.mapWith(Number),
    })
    .from(ninaMessageImages)
    .where(and(mediaCollectionScope(userId), eq(ninaMessageImages.id, originalId)))
    .limit(1)

  return located[0] ?? null
}
```

**Impact:** One new export on `lib/nina/queries`'s runtime surface (Step 2 records it). No existing
statement changes. Every import the function needs — `and`, `eq`, `sql`, `db`, `ninaMessageImages` —
is already at the top of the file (`:1-16`); **no import line is added.**

---

### Step 2: the barrel contract test admits the new name

**File:** `lib/nina/queries.test.ts:85` (header) and `:198` (the list)

**Change:** `BARREL_VALUE_EXPORTS` is asserted with `toEqual` against `Object.keys(barrel).sort()`,
so adding an export fails this suite until the list grows. The file's own header demands the growth
be documented in the same commit, sorted, with a pointer to the decision. `'locateNinaMediaPhoto'`
sorts immediately after `'locateNinaAvatar'`.

**Code — append this paragraph to the header block, directly above the closing ` */` on `:85`:**

```ts
 *
 * copy-admin-media-link phase 2 takes it 110 → 111: `locateNinaMediaPhoto`, the MEDIA twin of
 * `locateNinaAvatar`. `/admin/nina?view=media&image=<id>` is the destination of the client
 * overlay's new copy-admin-link button (R2), and the media arm had no id → page read at all —
 * `lib/admin/albumDeepLink.ts`'s header said so in as many words until this set. It resolves a
 * re-share through `source_image_id` to its original, because `isOriginalPhoto()` keeps a re-show
 * out of the collection and the original is the row a Replace would rewrite. Documented growth,
 * one name; see the plan set's Phase 2 Interface Contract.
```

**Code — the list entry, replacing `:197-198`:**

```ts
  // nina-album-search-relevance-tools phase 1 (R1): the id -> folder(+offset) read the album's
  // `?avatar=` deep link resolves through. Documented growth, one name.
  'locateNinaAvatar',
  // copy-admin-media-link phase 2 (R2): its MEDIA twin — the id -> offset read
  // `?view=media&image=<id>` resolves through, mirroring `mediaCollectionScope` and the
  // `coalesce(last_replaced_at, created_at) desc, id desc` sort key. Documented growth, one name.
  'locateNinaMediaPhoto',
  'markNinaAvatarAnnounced',
```

**Impact:** the barrel suite goes green again at 111 names. The second test in that file ("nothing
at runtime except functions") passes unchanged — `NinaMediaPhotoLocation` is a type and is erased.

---

### Step 3: the query's own suite

**File:** `tests/nina.mediaLocate.test.ts` (new)

**Change:** Assert the generated SQL, which is this repo's pattern for the recording fake driver
(`tests/nina.avatarsPage.test.ts`'s header: *"a clamp bug is invisible to a `vi.fn()` spy but not
to the bound Postgres actually receives"*). A scope or sort-key drift here is invisible to a
behavioural test against a fake that does not actually filter — the SQL text is the only witness.

**Code (complete file):**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * `locateNinaMediaPhoto` — the read behind `/admin/nina?view=media&image=<id>` (copy-admin-media-link
 * R2). Asserted against generated SQL rather than behaviour, for `tests/nina.avatarsPage.test.ts`'s
 * reason: the fake driver returns what it is handed and filters nothing, so a wrong PREDICATE or a
 * wrong SORT KEY produces a perfectly green behavioural test and a wrong page in production.
 *
 * The two things that can be subtly wrong, and are therefore pinned here:
 *   · the offset must count over `mediaCollectionScope` — `user_id` AND `isOriginalPhoto()`'s two
 *     null checks — not over the whole table;
 *   · the offset must compare the FULL sort key `listNinaMediaPhotos` reads with,
 *     `coalesce(last_replaced_at, created_at)` then `id`. A photograph someone already replaced is
 *     exactly the row whose position moved, and exactly the row this feature exists to reach.
 */

type Queries = typeof import('@/lib/nina/queries')

let fake: FakeDb
let queries: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  queries = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/** Generated SQL is pretty-printed across lines; the clause is what matters, not the whitespace. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, ' ')
}

describe('locateNinaMediaPhoto — the Media collection deep link', () => {
  it('resolves an ORIGINAL to itself and returns its 0-based offset', async () => {
    fake.enqueue([projectedRow('img1', null)], [projectedRow('img1', 7)])

    const found = await queries.locateNinaMediaPhoto('u1', 'img1')

    expect(found).toEqual({ id: 'img1', offset: 7 })
    expect(fake.queries).toHaveLength(2)
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['u1', 'img1']))
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['u1', 'img1']))
  })

  it('resolves a RE-SHARE through source_image_id and locates the original instead', async () => {
    // F37: a re-show is a second row naming the first, and `isOriginalPhoto()` keeps it out of the
    // collection — so it has no tile. The original is the row a Replace would rewrite.
    fake.enqueue([projectedRow('reshare1', 'orig1')], [projectedRow('orig1', 3)])

    const found = await queries.locateNinaMediaPhoto('u1', 'reshare1')

    expect(found).toEqual({ id: 'orig1', offset: 3 })
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['reshare1']))
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['orig1']))
    expect(fake.queries[1]?.params).not.toEqual(expect.arrayContaining(['reshare1']))
  })

  it('counts over mediaCollectionScope — user_id AND isOriginalPhoto’s two null checks', async () => {
    fake.enqueue([projectedRow('img1', null)], [projectedRow('img1', 0)])
    await queries.locateNinaMediaPhoto('u1', 'img1')
    const locate = flat(fake.sqlAt(1))

    // The OUTER predicate is `mediaCollectionScope(userId)`, called rather than restated.
    expect(locate).toContain('"nina_message_images"."user_id" = $')
    expect(locate).toContain('"nina_message_images"."source_avatar_id" is null')
    expect(locate).toContain('"nina_message_images"."source_image_id" is null')

    // The correlated count carries the same three arms on the alias. These are hand-spelled in the
    // query (a drizzle predicate cannot be re-pointed at an alias), which is why they are pinned.
    expect(locate).toContain('earlier.user_id = "nina_message_images"."user_id"')
    expect(locate).toContain('earlier.source_avatar_id is null')
    expect(locate).toContain('earlier.source_image_id is null')
  })

  it('compares the FULL sort key listNinaMediaPhotos orders by — coalesce first, then id', async () => {
    fake.enqueue([[3]], [])
    await queries.listNinaMediaPhotos('u1')
    // `listNinaMediaPhotos` runs its count and its page in one `Promise.all`; the count lands at
    // index 0 and the rows at index 1 (`tests/nina.avatarsPage.test.ts` records the same ordering).
    const listing = flat(fake.sqlAt(1))

    fake.reset()
    fake.enqueue([projectedRow('img1', null)], [projectedRow('img1', 0)])
    await queries.locateNinaMediaPhoto('u1', 'img1')
    const locate = flat(fake.sqlAt(1))

    expect(listing).toContain(
      'coalesce("nina_message_images"."last_replaced_at", "nina_message_images"."created_at") desc',
    )
    expect(listing).toContain('"nina_message_images"."id" desc')

    // Both sides of the tuple comparison, so neither half can quietly become `created_at` alone.
    expect(locate).toContain('coalesce(earlier.last_replaced_at, earlier.created_at)')
    expect(locate).toContain(
      'coalesce("nina_message_images"."last_replaced_at", "nina_message_images"."created_at")',
    )
    expect(locate).toContain('earlier.id')
  })

  it('answers null for a row that is not this user’s, without a second statement', async () => {
    fake.enqueue([])

    expect(await queries.locateNinaMediaPhoto('u1', 'someone-else')).toBeNull()
    expect(fake.queries).toHaveLength(1)
  })

  it('answers null when a re-share’s original is gone', async () => {
    fake.enqueue([projectedRow('reshare1', 'orig1')], [])

    expect(await queries.locateNinaMediaPhoto('u1', 'reshare1')).toBeNull()
    expect(fake.queries).toHaveLength(2)
  })

  it('answers null for a re-show of an ALBUM avatar — no tile, and no media original either', async () => {
    // `source_avatar_id` set, `source_image_id` null: the resolution falls back to the row's own id
    // and `mediaCollectionScope` excludes it, so the second statement matches nothing.
    fake.enqueue([projectedRow('reshow1', null)], [])

    expect(await queries.locateNinaMediaPhoto('u1', 'reshow1')).toBeNull()
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['reshow1']))
  })
})
```

**Impact:** a new suite, no existing test touched. Runs under the default `node` environment with
the fake driver — no Postgres, no network.

---

### Step 4: `/admin/nina` reads the parameter on the media arm

**File:** `app/admin/nina/page.tsx`

**4a — imports.** `:9` currently imports `NINA_AVATAR_PARAM` alone; `:19-27` imports the query set.
Add the key, `isValidId`, and the query. `@/lib/id` sorts between `@/lib/admin/requireAdmin` and
`@/lib/nina/album`.

```ts
import { NINA_AVATAR_PARAM, NINA_MEDIA_PHOTO_PARAM } from '@/lib/admin/albumDeepLink'
import { ADMIN_AVATAR_ID_RE } from '@/lib/admin/avatars'
import { NINA_FOLDER_ROOT, readExplorerView, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { isValidId } from '@/lib/id'
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
  locateNinaAvatar,
  locateNinaMediaPhoto,
  resolveNinaAvatarLinkedText,
  type NinaAvatarFolderCount,
} from '@/lib/nina/queries'
import { shareOrigin } from '@/lib/share/origin'
```

**4b — the deep-link block.** Replace `:131-159` (the `── R1's DEEP LINK ──` comment through the
`page` assignment) in full. `requireAdmin()` stays the first statement of the function, untouched
on `:117`.

```ts
  /*
   * ── THE DEEP LINK, NOW ON BOTH ARMS ─────────────────────────────────────────────────────────
   * `?avatar=<id>` says "open whichever folder and page this photograph is on, and select it", and
   * only the server can answer it: the album search ranks across every folder
   * (`lib/nina/queries/avatarsearch.ts`) while the explorer holds one folder and one page, so the
   * id has to become a folder and an offset before the client has a row to select at all
   * (`components/admin/FileExplorer.tsx:209`'s `photos.find(...)`).
   *
   * `?image=<id>` is its MEDIA twin — copy-admin-media-link R2. The client app's full-view overlay
   * mints it for a conversation photograph, and the operator pastes it into WhatsApp and opens it
   * on a desktop to Replace the photo. The Media collection is not a folder, so there is no folder
   * to derive: `locateNinaMediaPhoto` answers an offset alone, under the same
   * `coalesce(last_replaced_at, created_at) desc, id desc` key the grid is listed with.
   *
   * ── TWO KEYS, TWO ARMS, NO CROSSOVER ────────────────────────────────────────────────────────
   * Each arm reads ONE parameter and ignores the other, by construction rather than by precedence.
   * `?avatar=` on a media URL would name an album row the media grid does not hold; `?image=` on an
   * album URL would name a message image that is filed in no folder. Neither is a destination the
   * other arm can honour, so neither is consulted there — the same rule the media arm already
   * applies to `?folder=`.
   *
   * ── SHAPE, NEVER EXISTENCE, AND TWO DIFFERENT SPELLINGS OF THE SAME SHAPE ───────────────────
   * Both are validated exactly like `?folder=` and `?page=` above: a value that is not the shape
   * `newId()` mints is not an id and is dropped rather than handed to a query. Whether the row
   * exists, and whether it is this user's, is the locate query's answer and nobody else's.
   *
   * The album arm keeps `ADMIN_AVATAR_ID_RE` and the media arm uses `isValidId` (`lib/id.ts`), and
   * that is deliberate rather than untidy. The two regexes are the same twelve-symbol alphabet, but
   * they are not the same CLAIM: `ADMIN_AVATAR_ID_RE` lives in `lib/admin/avatars.ts` beside the
   * avatar upload's byte caps and pathname builder, and a `nina_message_images` id is not an avatar
   * id. `isValidId` is `newId()`'s own module's shape check, table-agnostic and already the
   * predicate every `/r/[id]`-style route segment uses — so the media arm borrows nothing from a
   * module about avatars, and `lib/admin/avatars.ts` does not quietly become the shape authority
   * for a table it knows nothing about. It is also a type guard, which is why the helper below
   * needs no cast.
   */
  const wantedAvatarId = view === 'media' ? null : readAvatarId(readOne(params[NINA_AVATAR_PARAM]))
  const wantedMediaId =
    view === 'media' ? readMediaPhotoId(readOne(params[NINA_MEDIA_PHOTO_PARAM])) : null

  /*
   * At most one of these is ever non-null — `view` decides which — so the second `await` is never
   * reached with work to do, and the sequential spelling costs nothing a `Promise.all` would save.
   */
  const located = wantedAvatarId === null ? null : await locateNinaAvatar(userId, wantedAvatarId)
  const locatedMedia =
    wantedMediaId === null ? null : await locateNinaMediaPhoto(userId, wantedMediaId)

  /*
   * A RESOLVED deep link wins over `?folder=` and `?page=`; a failed one changes nothing. Both arms
   * behave identically here, which is the point.
   *
   * The link carries only an id — where the row sits is DERIVED — so any folder or page travelling
   * beside it is a leftover from wherever the operator happened to be, and honouring it would open
   * the wrong page and then fail to find the photograph on it. A locate answering `null` means
   * "not yours, or gone" (`lib/nina/queries.ts`'s rule 1): the ordinary parameters take over,
   * nothing is selected, and the operator lands where the URL says. Silent, deliberately: a page
   * that distinguished "deleted" from "not yours" would be telling a stranger which ids exist.
   *
   * `folder` is the album arm's alone. The media arm never consults it (see the `view` comment
   * above), so `locatedMedia` has nothing to say about it and says nothing.
   *
   * The two page sizes are NOT interchangeable and that is why `pageOfOffset` takes one: the album
   * arm lists `NINA_ADMIN_PAGE_SIZE` rows and the media arm `NINA_CHAT_PHOTO_PAGE_SIZE`, and each
   * offset must be divided by the size of the page it was counted for. The page size is this
   * file's policy — it is the `limit` each arm spends below — which is exactly why both locate
   * queries return a row count and the division happens here.
   */
  const folder = located?.folder ?? (requested.ok ? requested.path : NINA_FOLDER_ROOT)
  const deepLinkPage =
    located != null
      ? pageOfOffset(located.offset, NINA_ADMIN_PAGE_SIZE)
      : locatedMedia != null
        ? pageOfOffset(locatedMedia.offset, NINA_CHAT_PHOTO_PAGE_SIZE)
        : null
  const page = deepLinkPage ?? readPage(readOne(params.page))

  /* Either arm's resolved id, handed to the client as the row to select. Exactly one can be
   * non-null, so there is no precedence to argue about. */
  const deepLinkId = located?.id ?? locatedMedia?.id ?? null
```

**4c — the prop.** `:420` currently reads `deepLinkId={located?.id ?? null}`. Replace that one line:

```tsx
        deepLinkId={deepLinkId}
```

The surrounding JSX comment block (`:397-415`) is unchanged — it is about `shareOrigin`, `view` and
`mediaCount`, all still true, and it already carries the leading `*` on every continuation line
that `ci:client-secret-guard` requires. **No JSX comment is added or edited in this phase**, so the
guard's Rule 3 has nothing new to inspect; the prose above lives in ordinary body comments, which
already use the ` * ` continuation style.

**4d — `readMediaPhotoId`.** Insert directly after `readAvatarId`'s closing brace (`:457`), before
`pageOfOffset`'s docstring.

```ts
/**
 * The `?image=` value if it is the SHAPE an id has, and `null` otherwise.
 *
 * `isValidId` (`lib/id.ts`) rather than `ADMIN_AVATAR_ID_RE`: see the deep-link block above for why
 * the two arms deliberately spell the same twelve-symbol alphabet through two different modules. A
 * shape check and never an existence check — whether the row exists, whether it is this user's, and
 * whether it is an original or a re-share is `locateNinaMediaPhoto`'s answer and nobody else's.
 */
function readMediaPhotoId(raw: string | null): string | null {
  return isValidId(raw) ? raw : null
}
```

**4e — `pageOfOffset` takes the page size.** Replace `:459-469` (its docstring and body) in full.

```ts
/**
 * Which 1-based page holds the row at `offset`, given the size of the pages being listed.
 *
 * The page SIZE is this file's policy — it is the `limit` each arm spends above — which is exactly
 * why `locateNinaAvatar` and `locateNinaMediaPhoto` both return a row count and this division
 * happens here rather than in the query layer. It is a PARAMETER and not a constant because the two
 * arms page differently: `NINA_ADMIN_PAGE_SIZE` for the album, `NINA_CHAT_PHOTO_PAGE_SIZE` for
 * Media (`lib/nina/album.ts:83-105` argues why the two numbers differ). Capped at `PAGE_CEILING`
 * for `readPage`'s reason, so the two ways a page number can arrive cannot disagree about how deep
 * a page may be.
 */
function pageOfOffset(offset: number, pageSize: number): number {
  return Math.min(Math.floor(offset / pageSize) + 1, PAGE_CEILING)
}
```

**Impact:** `?view=media&image=<id>` now resolves to a page and a selected id. The album arm's
behaviour is unchanged in every case — same validator, same query, same `pageOfOffset` arithmetic
with the size it always used, now passed explicitly. A media URL carrying `?avatar=` still ignores
it; an album URL carrying `?image=` still ignores that.

---

### Step 5: `FileExplorer` spends the parameter with the media href

**File:** `components/admin/FileExplorer.tsx:211-251`

**Change:** Two things, and only two. The comment on `:240` currently asserts what this phase makes
false and must be rewritten (plan invariant 11); the `replaceState` on `:250` must branch on `view`,
because `hrefForFolder(page.folder, page.page)` on the media arm rewrites the URL to
`/admin/nina` — throwing the operator out of the Media collection and back into the album the
instant the link lands.

**Everything else in the effect is load-bearing and survives untouched:** the `spentDeepLink` ref
(`history.replaceState` re-runs parameter watchers synchronously, so the effect can be entered twice
for one id), the `setSearch(null)`, and the absence of any cleanup that would undo the landing.

Replace from the `── R1: THE DEEP LINK LANDS HERE ──` comment (`:211`) through the effect's
dependency array (`:251`):

```tsx
  /*
   * ── THE DEEP LINK LANDS HERE ────────────────────────────────────────────────────────────────
   * Two links arrive here now. The album's `?avatar=<id>` — minted by the viewer over a search
   * result — and, since copy-admin-media-link (R2), the media arm's `?image=<id>`, minted by the
   * copy-admin-link button in the CLIENT app's full-view overlay so the operator can paste a
   * photograph's admin address into WhatsApp and open it on a desktop. Either way the page has
   * already resolved the id to the page this render is showing and handed the id back as
   * `deepLinkId`. Three things happen on arrival and all three are needed:
   *
   *   1. **The photograph is selected**, which is what mounts `SelectionPane` — the album rail on
   *      an album row, `MediaPane` and its Replace control on a media row. The requirement, in one
   *      line, on both arms.
   *   2. **The search is cleared.** A landed search is what the content pane draws (`activeSearch`
   *      above), so leaving it up would put the operator's ranked sheet over the folder the link
   *      just opened, and would break this file's standing pairing that a selection and a result
   *      set are never on screen together (`onSearchResults`, and the reason `PhotoMoveBar` needs
   *      no branch of its own). It is also what makes the landing IDENTICAL whether or not React
   *      preserved this component's state across the navigation — a soft navigation to the same
   *      route keeps it, a remount does not, and a feature must not depend on which.
   *   3. **The parameter is spent**, replaced with the canonical URL of where we actually are, so a
   *      reload, a copied link and the back button all describe this collection and this page
   *      rather than re-running a resolution that has already happened. `history.replaceState` and
   *      not `router.replace` for `components/ui/usePanelParam.ts`'s measured reason: the page is
   *      two database reads, and rewriting its own URL must not re-run them. REPLACE and never push
   *      — a spent parameter that became a history entry would cost the operator a back press to
   *      get past a URL that no longer means anything.
   *
   * The ref is what makes this idempotent, and that is load-bearing rather than tidy: a
   * `history.replaceState` re-runs parameter watchers synchronously, so this effect can be entered
   * a second time for the same id — and a second entry must not re-open a pane the operator has
   * since closed. For the same reason there is **no cleanup here that undoes anything**: a cleanup
   * that cleared the selection would cancel the landing on that second pass.
   *
   * ── WHICH CANONICAL URL, AND WHY THE BRANCH REPLACED A SENTENCE ─────────────────────────────
   * This comment used to end: *"`hrefForFolder` and not `hrefForMediaView`: the page resolves
   * `?avatar=` on the ALBUM arm only (a message image is not an album row), so `deepLinkId` is
   * never non-null under `?view=media`."* copy-admin-media-link phase 2 made that false —
   * `app/admin/nina/page.tsx` now resolves `?image=` on the media arm and `deepLinkId` is routinely
   * non-null there. So the href follows the VIEW, and it has to: `hrefForFolder` spells no
   * `?view=`, so spending a media link through it would rewrite the URL to the ALBUM's canonical
   * address and drop the operator out of the collection the link named, one frame after landing on
   * it. `hrefForMediaView(page.page)` keeps `?view=media` and the page we are on, and page 1 is the
   * absence of `?page=` on both arms alike.
   */
  const spentDeepLink = useRef<string | null>(null)
  useEffect(() => {
    if (deepLinkId === null) return
    if (spentDeepLink.current === deepLinkId) return
    spentDeepLink.current = deepLinkId
    setSelectedId(deepLinkId)
    setSearch(null)
    window.history.replaceState(
      null,
      '',
      isMediaView ? hrefForMediaView(page.page) : hrefForFolder(page.folder, page.page),
    )
  }, [deepLinkId, isMediaView, page.folder, page.page])
```

`isMediaView` is the derived `const` already declared on `:173` (`view === 'media'`), so no new
state and no new prop. It joins the dependency array because `react-hooks/exhaustive-deps` requires
every value read in the effect body; it is a boolean derived from a prop, so it never re-fires the
effect on its own.

`hrefForMediaView(page: number)` is the module-private builder at `:688` — unchanged, and already
exercised by `FileExplorer.test.tsx`'s URL-grammar block.

**Impact:** a media deep link lands on `?view=media` (or `?view=media&page=N`) instead of being
rewritten into the album. The album arm's spend is byte-identical — `FileExplorer.test.tsx`'s
existing *"spends the parameter: the URL becomes the canonical folder+page"* test still asserts
`?folder=bali&page=3` and still passes.

---

### Step 6: the media landing's component tests

**File:** `components/admin/FileExplorer.test.tsx` — append after the closing `})` of the
`FileExplorer — R1's deep link (?avatar=<id>)` describe (`:540`, end of file)

**Change:** Prove the media arm's landing and prove the album arm did not acquire the media href by
accident. The existing album block above is untouched.

**Code:**

```tsx
/*
 * copy-admin-media-link R2's landing. `app/admin/nina/page.tsx` resolves `?image=<id>` on the MEDIA
 * arm into the page of the Media collection that holds the row and hands the id back as
 * `deepLinkId` — the same prop, the other collection. What this component owes in return is the
 * same three things, with one difference that is the whole reason this block exists: the URL it
 * spends the parameter into must keep `?view=media`. Spent through `hrefForFolder` the operator
 * would land on the photograph and be rewritten into the ALBUM in the same frame.
 */
describe('FileExplorer — the media arm’s deep link (?image=<id>)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/admin/nina?view=media&image=m1')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  function mediaProps(pageNumber: number) {
    return baseProps({
      view: 'media' as const,
      photos: [photo({ id: 'm1', origin: 'media' })],
      page: page({ folder: '', page: pageNumber }),
      deepLinkId: 'm1',
    })
  }

  it('selects the resolved photograph on arrival, with no click', () => {
    render(<FileExplorer {...mediaProps(1)} />)
    expect(screen.getByTestId('selection-pane')).toHaveAttribute('data-photo', 'm1')
  })

  it('spends the parameter with the MEDIA href, so the collection survives the landing', () => {
    render(<FileExplorer {...mediaProps(1)} />)
    expect(window.location.search).toBe('?view=media')
  })

  it('keeps the page the row was found on', () => {
    render(<FileExplorer {...mediaProps(4)} />)
    expect(window.location.search).toBe('?view=media&page=4')
  })

  it('a spent media link stays spent — it does not re-open a pane the operator closed', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FileExplorer {...mediaProps(1)} />)
    await user.click(screen.getByRole('button', { name: 'close-pane' }))
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()

    // The re-render the `replaceState` above provokes, synchronously, for the same id.
    rerender(<FileExplorer {...mediaProps(1)} />)
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
  })

  it('a resolved id this page does not hold opens nothing, rather than throwing', () => {
    render(
      <FileExplorer
        {...baseProps({
          view: 'media' as const,
          photos: [photo({ id: 'm1', origin: 'media' })],
          deepLinkId: 'gone',
        })}
      />,
    )
    expect(screen.queryByTestId('selection-pane')).not.toBeInTheDocument()
  })

  it('the album arm still spends into the folder href, with no ?view=media', () => {
    window.history.replaceState(null, '', '/admin/nina?avatar=p1')
    render(
      <FileExplorer
        {...baseProps({
          view: 'album' as const,
          photos: [photo({ id: 'p1' })],
          page: page({ folder: 'bali', page: 2 }),
          deepLinkId: 'p1',
        })}
      />,
    )
    expect(window.location.search).toBe('?folder=bali&page=2')
  })
})
```

`photo()` (`:168`) ends in `as ExplorerPhoto`, so `origin: 'media'` is accepted without building a
full `MediaExplorerPhoto`; `SelectionPane` is mocked at `:122` and reads `photo.id` alone, so no
media-only field is needed. `userEvent`, `fireEvent`, `beforeEach`, `afterEach` and `page()` are all
already imported/declared in the file.

**Impact:** six new cases. No existing case changes.

---

### Step 7: confirm the downstream chain needs nothing (read-only)

Read and verified in the worktree — stated here because the phase brief asks for the finding, and
because "it turns out something downstream is needed" would have been mine to fix:

1. `FileExplorer.tsx:209` — `const selected = photos.find((photo) => photo.id === selectedId) ?? null`.
   On the media arm `photos` is built at `app/admin/nina/page.tsx:196-233` with `id: row.id`, the
   `nina_message_images` row id — **the same id `locateNinaMediaPhoto` returns**. The find matches.
2. `FileExplorer.tsx:648-655` — `{selected != null && (<SelectionPane photo={selected} userId={userId} shareOrigin={shareOrigin} … />)}`.
   No branch on `view`; a media row reaches it exactly as an album row does.
3. `SelectionPane.tsx:125` — `if (isMediaRow(photo)) { return <MediaPane key={photo.id} … /> }`, and
   `isMediaRow` (`MediaPane.tsx:107`) is `photo.origin === 'media'`, which the media arm's mapper
   sets as a literal.
4. `MediaControls.tsx:109` — the Replace button (`aria-label="Replace this photo"`, firing
   `replaceChatPhotoAction` through the hidden file input) and the Remove button are already mounted
   by `MediaPane`, unconditionally.

**Conclusion: nothing downstream of `setSelectedId` needs a line.** Selecting the row is the entire
remaining distance to the Replace control, which is why this phase's whole surface is a query, a
parameter and an href. No file under `components/admin/explorer/` is modified.

## Verification

**Build:** `npm run build`
**Typecheck:** `npm run typecheck` (this is the real gate — vitest does not typecheck)
**Tests:**

```bash
npx vitest run tests/nina.mediaLocate.test.ts
npx vitest run lib/nina/queries.test.ts
npx vitest run components/admin/FileExplorer.test.tsx
npm test
```

**Gates (the phase brief's list, in order):**

```bash
npm run typecheck && npm test && npm run lint && npm run format:check \
  && npm run ci:data-layer-guard && npm run ci:client-secret-guard && npm run ci:schema-drift-guard
```

`ci:schema-drift-guard` reads `.env.local` and talks to the one (production) database to compare
schemas — it is a **read**, and this phase changes no schema, so it must pass unchanged. **Do not
run `db:migrate`, `db:generate`, or any backfill script in this phase.**

**Manual check** (local only — `/admin/nina` is unreachable on a Vercel preview, because
`ADMIN_EMAILS` is Production-scope only):

1. `ADMIN_EMAILS=<the admin address> npm run dev`, sign in as the admin.
2. Open `/admin/nina?view=media`, note an id from a tile on **page 2 or later** (the pager is 48
   rows a page), and open `/admin/nina?view=media&image=<that id>`. The grid must show that page
   with the photograph selected, the Media pane open, Replace one click away, and the address bar
   must read `/admin/nina?view=media&page=N` — **not** `/admin/nina`.
3. Replace one photograph's bytes (so `last_replaced_at` is set), reload `?view=media` and confirm
   it has jumped to page 1, then deep-link to it again. It must land on page 1. This is the case a
   `created_at`-only offset gets wrong.
4. `/admin/nina?view=media&image=<an id that does not exist>` → page 1, nothing selected, no error.
5. `/admin/nina?view=media&avatar=<a real avatar id>` → ignored; ordinary Media page 1.
6. `/admin/nina?image=<a real media id>` (no `?view=`) → ignored; ordinary album root.
7. `/admin/nina?avatar=<a real avatar id>` → unchanged from today.

**Exit criteria:** `/admin/nina?view=media&image=<id>` lands on the page of the Media collection
holding that photograph with it selected and `MediaPane` mounted; the offset mirrors
`mediaCollectionScope` **and** `coalesce(last_replaced_at, created_at) DESC, id DESC`; a re-share id
resolves through `source_image_id` to its original; a foreign, malformed, deleted or non-original id
changes nothing and says nothing; the album `?avatar=` path is unchanged; `FileExplorer.tsx:240`'s
comment no longer contradicts the code below it; all gates green.

## Handoffs

- **Phase 1 (`lib/admin/albumDeepLink.ts`).** The parameter key and the absolute-link minter. This
  phase imports the key and edits nothing in that module — including the header paragraph at
  `:59-71`, which says a media deep link is "a query-layer change rather than a URL grammar"
  and which plan invariant 11 requires rewriting. **It is Phase 1's to rewrite**, in the commit that
  adds the key. I rewrote only the second of the two shipped comments the plan names,
  `FileExplorer.tsx:240`, because that one is in a file I own.
- **Phase 3 / Phase 4 (R1, R3, R4).** Nothing here mints a link, renders a button, or decides who is
  an admin. The destination exists after this phase and is reachable by hand-typing the URL; the
  copy control that produces it is Phase 3's component and Phase 4's mount points and admin gate.
- **`countNinaMediaPhotos`'s second call site.** `locateNinaMediaPhoto` deliberately does **not**
  return a total, so a deep-linked media render still issues exactly the two statements
  `listNinaMediaPhotos` already runs. Nothing to do; recorded so a later reader does not "optimise"
  a total into the locate and give the page two opinions about how many photographs exist.
- **knip.** `NinaMediaPhotoLocation` is exported and consumed only as this function's return type,
  which `knip`'s `ignoreExportsUsedInFile: false` will report — exactly as it already reports the
  shipped `NinaAvatarLocation` for the same reason. `knip` is not in the CI gate (it is a manual
  YAGNI sweep); the new entry is the accepted precedent's twin and should be triaged with it, not
  suppressed.
- **Package docs.** `components/admin/.workflows/package_readme.md` and `lib/nina/.workflows/` name
  the deep link as album-only in prose. Not touched here — doc refresh belongs to the set's
  completion handler, after the reconciler, so four phases do not each rewrite the same paragraph.

## Rollback

`git revert` this phase's commit. Nothing in it writes to the database, the blob store or any
Vercel environment variable, and no migration exists to unwind.

Reverted alone, the album's `?avatar=` path is untouched and a media link minted by phases 1/3/4
degrades to today's behaviour: `/admin/nina?view=media&image=<id>` serves `/admin/nina?view=media`
page 1 with nothing selected (the unknown parameter is simply never read), and the operator finds
the photograph by eye. No client surface errors, because no client surface reads this phase's
output — only `deepLinkId`, which returns to being album-only.
