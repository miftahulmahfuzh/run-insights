> Adopted from `PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md` phase 1. Source: `.workflows/plan/photo-reference-dedup-album-adoption/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Exclude album-adopted photographs from the chat side of the reference picker

**Plan set:** `PHOTO_REFERENCE_DEDUP_ALBUM_ADOPTION_PLAN.md`
**Analysis:** `20260912-115848-A7F3_code_analyzer.md`
**Satisfies:** R1 — Photo reference on `/admin/image-generation` stops showing the same photograph twice once it has been adopted into her album
**Depends on:** none (single-phase set)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

`generatedChatPhotoScope(userId)` — the one predicate behind `listNinaPhotoReferences`' chat page,
`countNinaChatPhotos` and `resolveNinaPhotoReference` — gains a fourth arm: a correlated
`NOT EXISTS` against `nina_avatars` on `source_key = 'chat-photo:' || <the chat row's id>`. After
this phase a chat photograph that an operator adopted into the album with **"Set as her profile
picture"** is offered by the picker exactly once — as its album copy — instead of twice, and the
total in the picker's footer stops over-counting it. Nothing else changes: the Media view,
`/nina/about`'s gallery, every bubble render and the album explorer all still show the row they
show today.

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:** none (no new exported symbol; the new subquery is a `const` local to
`generatedChatPhotoScope`)
**Signature changes:** none — `generatedChatPhotoScope(userId: string)` keeps its shape and its
`SQL | undefined` return
**New import:** `notExists` from `drizzle-orm` (`lib/nina/queries.ts:1-17`), added to the existing
sorted named-import list
**Behaviour change (not a type change):** `generatedChatPhotoScope` now binds `userId` **twice** —
once on `nina_message_images.user_id`, once inside the subquery on `nina_avatars.user_id`. Every
statement built from it grows one parameter. `countNinaChatPhotos`' parameter list goes from
`['u1', 'generated']` to `['u1', 'generated', 'u1']`.
**Requires (from earlier phases):** nothing — this is the only phase in the set
**Leaves alone (owned by nobody in this set, and must stay byte-identical):**
`isOriginalPhoto()` (`lib/nina/queries.ts:1984-1986`), `mediaCollectionScope()`
(`lib/nina/queries.ts:2072-2074`), `lib/admin/ninaAlbumActions.ts`, `lib/db/schema.ts`,
`drizzle/*`, every component under `components/admin/`

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries.ts` | modify | `notExists` joins the drizzle import (`:1-17`); `generatedChatPhotoScope`'s docstring (`:1988-2017`) gains a section; its body (`:2018-2024`) gains the correlated `NOT EXISTS` arm; `isOriginalPhoto`'s docstring (`:1956-1963`) gains one line naming what it does *not* catch |
| `tests/nina.photoRefs.test.ts` | modify | one new `ADOPTED_SKIPPED` constant after `REFERENCE_SKIPPED` (`:57`) and one new `describe` block after the first one (`:94`) — four generated-SQL cases |
| `tests/nina.imageprefs.test.ts` | modify | one new `it` inside the existing "plan invariant 13" `describe` (`:539-553`) — the source-text half |

## Implementation Steps

### Step 1: Import `notExists`
**File:** `lib/nina/queries.ts:1-17`
**Change:** add `notExists` to the drizzle-orm named imports, in the list's existing alphabetical
position (`ne` < `notExists` < `or`). Verified present in `drizzle-orm@0.45.2`
(`node_modules/drizzle-orm/sql/expressions/conditions.d.ts:266`), where it is
`notExists(subquery) => sql\`not exists ${subquery}\`` — i.e. it emits the keyword and then its
argument's chunks **verbatim**, exactly like `exists()`, which is why Step 2's subquery brings its
own parentheses.
**Code:**
```ts
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
```
**Impact:** none on its own. `ninaAvatars` is already imported (`:23`), so no second import line is
needed.

### Step 2: Add the adoption exclusion to `generatedChatPhotoScope`, and say why
**File:** `lib/nina/queries.ts:1988-2024` (the docstring and the function, replaced as one block)
**Change:** replace the whole docstring + function. The three existing arms are unchanged and in
the same order; the fourth is appended. The docstring's three existing sections are preserved
verbatim and a fourth is added in the same voice as `── AND SINCE F37, NOT A REFERENCE ──`.

The subquery is a raw `sql` template with **hand-written outer parentheses**, following this
file's own measured precedent at `:1025-1040` (`promisesFromThisSession` + `exists(...)` at
`:1117`): a subquery *builder* brackets itself, a raw template does not, and without the pair the
statement reads `... and not exists select 1 from ...`, which Postgres rejects.

`and()` accepts it directly — its signature is
`and(...conditions: (SQLWrapper | undefined)[]): SQL | undefined`
(`node_modules/drizzle-orm/sql/expressions/conditions.d.ts:63`), and `notExists()` returns `SQL`,
which is narrower than the `SQL | undefined` that `isOriginalPhoto()` already contributes to this
same `and(...)`. No type assertion, no lint exception.

**Code:**
```ts
/**
 * The predicate that DEFINES "her chat photographs", written once so the listing and the count
 * cannot drift apart.
 *
 * ── `kind`, NEVER `message.role`. THIS IS THE PHASE'S WHOLE CORRECTNESS ──────────────────────
 * R2 says *"nina generated images"*, and `kind = 'generated'` is what that means. It is NOT the
 * same set as "images on messages where role = 'nina'": `lib/nina/actions.ts:512-531` is R26's
 * re-attach path, and when the runner re-attaches one of her selfies it writes
 * `kind: attached.kind` — resolved to `'generated'` at `:167-172` — onto a message whose `role` is
 * `'runner'`. `photoSideOf` (`lib/nina/album.ts:146`) exists for that case and
 * `lib/nina/chatphotos.ts:30-37` documents it in as many words. A `role`-filtered admin listing
 * would silently omit those rows and would then disagree with `/nina/about`'s gallery about which
 * photographs are hers, which is the one failure mode this surface cannot have.
 *
 * ── `kind` IS A RESIDUAL PREDICATE AND THAT IS CORRECT HERE ──────────────────────────────────
 * There is no `(user_id, kind, created_at)` index. Both statements below read
 * `nina_message_images_user_created_idx` — equality on `user_id`, `(created_at desc, id desc)`
 * already in index order — and filter `kind` on the rows that come back. At this table's size (one
 * user, phase 12's six generations a day, single-digit thousands of rows at the horizon) that is a
 * bounded index range scan and the correct read. **An index is not being added:** invariant 10 of
 * this plan forbids a migration, and nothing has measured a need for one.
 *
 * ── AND SINCE F37, NOT A REFERENCE ───────────────────────────────────────────
 * `isOriginalPhoto()` joins the `and(...)` here rather than at the call sites, which is the same
 * argument this docstring already makes for `kind`: every statement that reads this scope reads the
 * same set by construction. After the image-collection merge the scope's callers are the
 * image-reference picker's — `listNinaPhotoReferences` (page side) and `countNinaChatPhotos` (its
 * total) and `resolveNinaPhotoReference` (the stored selection) — a picker grid that shows her
 * GENERATED photographs only, which is the one set this scope still names.
 *
 * ── AND NOT ONE THE ALBUM HAS ALREADY ADOPTED. THIS IS THE SAME DUPLICATE, MIRRORED ──────────
 * `isOriginalPhoto()` catches ALBUM → CHAT: a chat row that POINTS at a photograph living
 * elsewhere. It cannot catch CHAT → ALBUM, and that is not an oversight in it — it is a fact about
 * how the adoption is written. `setChatPhotoAsAvatarAction` (`lib/admin/ninaAlbumActions.ts:278`)
 * COPIES the bytes (`copyChatPhotoIntoAlbum`, `:332`) into a brand-new `nina_avatars` row and
 * writes the only link there is onto the COPY — `source_key = 'chat-photo:' + <the chat row's
 * id>`, `:301`. The chat row it copied from is never touched: both provenance columns stay NULL,
 * `isOriginalPhoto()` keeps (correctly, by its own definition) calling it original, and the picker
 * showed the photograph twice — once as the chat row, once as its album twin, adjacent at the top
 * of a newest-first list because the two were written seconds apart. Measured in production on
 * 2026-09-12: 5 `nina_avatars` rows carry a `chat-photo:` key, and all 5 of the chat rows they name
 * still have both columns NULL.
 *
 * So the exclusion has to read the link from the side that HAS it, which is what the correlated
 * `NOT EXISTS` below does. The copy is the survivor and the original is the one hidden, because
 * the copy is the row the operator just made current and the one the picker can keep offering
 * after the chat row is deleted.
 *
 * **The copy is not being un-copied, and no back-reference column is being added.** "Bytes copied,
 * not shared" is deliberate (an album delete calls `del` with no reference check, so a shared
 * object would blank the chat bubble the day the album row went away), and a new column would be a
 * migration for a fact `nina_avatars.source_key` already states.
 *
 * **It is scoped and it is indexed.** `nina_avatars.user_id` is spelled inside the subquery — an
 * unscoped subquery would let another operator's album hide this one's photographs — and the pair
 * `(user_id, source_key)` is `nina_avatars_user_source_key_unq` (`lib/db/schema.ts:1781`), so this
 * is an index-backed equality probe per candidate row, not a scan. **No index is being added.**
 *
 * **The literal `'chat-photo:'` is spelled here and at `lib/admin/ninaAlbumActions.ts:301`, with
 * no shared constant between them** — a `'use server'` module may export only async actions, so it
 * cannot export the prefix, and the db layer must not import from an actions module. The two
 * spellings are held together by `tests/nina.photoRefs.test.ts`, which pins this exact text, and by
 * `tests/admin.chatPhotoAdoption.test.ts:132`, which pins the writer's.
 *
 * ── WHY THE OTHER TWO SCOPES DO NOT GET THIS ARM ─────────────────────────────────────────────
 * `mediaCollectionScope` and `listNinaMessageImages` must NOT grow it. An adopted chat row is
 * still a real photograph in a real bubble, and the Media view is where the operator goes to
 * Replace or Remove it; hiding it there would take away the only handle on it. The user asked for
 * the PICKER to deduplicate, and the picker is the only surface that changes.
 */
function generatedChatPhotoScope(userId: string) {
  /* The outer parentheses are load-bearing and hand-written, for `removeNinaSession`'s measured
   * reason (:1025-1030): `notExists()` emits `not exists ` followed by its argument's chunks
   * verbatim — it only LOOKS like it brackets them, because a subquery BUILDER serialises itself
   * with brackets. A raw `sql` template does not, and without the pair below the generated
   * statement is `... and not exists select 1 from ...`, which Postgres rejects. */
  const alreadyAdoptedIntoAlbum = sql`(
    select 1
      from ${ninaAvatars}
     where ${ninaAvatars.userId} = ${userId}
       and ${ninaAvatars.sourceKey} = 'chat-photo:' || ${ninaMessageImages.id}
  )`

  return and(
    eq(ninaMessageImages.userId, userId),
    eq(ninaMessageImages.kind, 'generated'),
    isOriginalPhoto(),
    notExists(alreadyAdoptedIntoAlbum),
  )
}
```
**Impact:** all three callers change behaviour together, which is the point of the shared scope.
The SQL this emits was **measured**, not predicted — built against this worktree's
`drizzle-orm@0.45.2` through `tests/support/fakeDb.ts` and recorded verbatim:

```
select count(*) from "nina_message_images" where ("nina_message_images"."user_id" = $1 and "nina_message_images"."kind" = $2 and not exists (
    select 1
      from "nina_avatars"
     where "nina_avatars"."user_id" = $3
       and "nina_avatars"."source_key" = 'chat-photo:' || "nina_message_images"."id"
  ))
```
with params `["u1","generated","u1"]`. Note the template's newlines and indentation survive into
the statement text — Step 3's assertions are therefore written against **single-line fragments
only**, never against a multi-line slice whose indentation would pin the author's formatting.

One row of the 5 found in production has `kind = 'upload'`; it never reaches the new arm, because
`eq(kind, 'generated')` already removed it. A chat row that was never adopted probes the unique
index, misses, and passes — no behaviour change, which is plan invariant 4.

### Step 3: Say what `isOriginalPhoto()` does not catch, where a reader will look for it
**File:** `lib/nina/queries.ts:1956-1963` (inside the existing
`── THE COLLECTION READS IT FILTERS, AND THE ONES IT MUST NEVER ──` section)
**Change:** `isOriginalPhoto`'s **definition is untouched** (invariant 3). Only the one bullet list
that enumerates the collection reads gains a closing line, so that the next person who reaches for
this predicate to fix a duplicate learns here that it only covers one direction.
**Code:** replace
```ts
 * ── THE COLLECTION READS IT FILTERS, AND THE ONES IT MUST NEVER ───────────────────────
 * Filtered — the COLLECTION reads, which describe a set of photographs to a human:
 *   · `listNinaMessageImages`   → /nina/about's Media feed
 *   · `countNinaChatPhotos`     → the reference picker's chat-side total, via the same scope
 *   · `listNinaMediaPhotos` + `countNinaMediaPhotos` → /admin/nina?view=media and its tree badge,
 *                                 via `mediaCollectionScope` — the all-kinds superset of the
 *                                 generated pair, sharing THIS predicate so a reference cannot
 *                                 sneak into one view while another hides it.
```
with
```ts
 * ── THE COLLECTION READS IT FILTERS, AND THE ONES IT MUST NEVER ───────────────────────
 * Filtered — the COLLECTION reads, which describe a set of photographs to a human:
 *   · `listNinaMessageImages`   → /nina/about's Media feed
 *   · `countNinaChatPhotos`     → the reference picker's chat-side total, via the same scope
 *   · `listNinaMediaPhotos` + `countNinaMediaPhotos` → /admin/nina?view=media and its tree badge,
 *                                 via `mediaCollectionScope` — the all-kinds superset of the
 *                                 generated pair, sharing THIS predicate so a reference cannot
 *                                 sneak into one view while another hides it.
 *
 * ONE DIRECTION ONLY, and the gap is by design rather than by omission: this reads columns on the
 * CHAT row, so it catches a chat row pointing at an album face (album → chat) and cannot catch a
 * chat photograph the album COPIED (chat → album), where the only link is `source_key` on the new
 * `nina_avatars` row. That second direction is excluded one caller up, in
 * `generatedChatPhotoScope` and nowhere else — see its docstring. Do not "complete" this predicate
 * by adding the album lookup here: `mediaCollectionScope` and `/nina/about` read it too, and an
 * adopted photograph must keep its tile in the Media view.
```
**Impact:** prose only. `isOriginalPhoto()`'s body is byte-identical, so
`tests/nina.photoRefs.test.ts`'s `REFERENCE_SKIPPED` assertions and every non-picker caller are
untouched.

### Step 4: Prove the predicate reaches the generated SQL — and prove where it does not
**File:** `tests/nina.photoRefs.test.ts` — insert `ADOPTED_SKIPPED` immediately after
`REFERENCE_SKIPPED` (`:57`), and the new `describe` immediately after the existing
`describe('the collection listings skip a reference (R1, R3)', …)` block closes at `:94`.
**Change:** add one constant and one describe block. The file's existing harness
(`installFakeDb`/`uninstallFakeDb` in `beforeEach`/`afterEach`, `fake`, `queries`, `whereOf`,
`IMAGE`) is reused as-is; no new imports are needed.
**Code:**
```ts
/**
 * The album-adoption half of the same duplicate class, pinned as text for `REFERENCE_SKIPPED`'s
 * reason. `setChatPhotoAsAvatarAction` COPIES a chat photograph into `nina_avatars` and writes
 * `source_key = 'chat-photo:<image id>'` on the COPY, never on the original — so `isOriginalPhoto()`
 * still calls the chat row original and the picker's union offered the photograph twice.
 *
 * Single-line fragments only: the predicate is a raw `sql` template, so its newlines and
 * indentation reach the statement verbatim and a multi-line expectation would pin the author's
 * formatting rather than the meaning.
 *
 * The `'chat-photo:'` literal is the coupling this file exists to hold: the writer spells it at
 * `lib/admin/ninaAlbumActions.ts:301` and the reader spells it in `generatedChatPhotoScope`, with
 * no shared constant possible between a `'use server'` module and the db layer.
 */
const ADOPTED_SKIPPED = [
  'not exists (',
  'from "nina_avatars"',
  '"nina_avatars"."user_id" = $',
  `"nina_avatars"."source_key" = 'chat-photo:' || "nina_message_images"."id"`,
] as const
```
and
```ts
describe('the picker drops a photograph her album has already adopted', () => {
  it('countNinaChatPhotos — the chat-side total stops counting an adopted photograph', async () => {
    fake.enqueue([[0]])
    await expect(queries.countNinaChatPhotos('u1')).resolves.toBe(0)

    const { sql, params } = fake.only()
    const where = whereOf(sql)
    for (const predicate of ADOPTED_SKIPPED) expect(where, predicate).toContain(predicate)
    /* BOTH halves, in one scope: the F37 reference filter and the adoption filter. The bug was
     * that the first one alone looked like the whole rule. */
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
    /* The owner id is bound TWICE — once on the outer table, once inside the subquery. An
     * unscoped subquery would let another operator's album hide this operator's photographs, and
     * a missing third parameter is exactly what that regression would look like from here. */
    expect(params).toEqual(['u1', 'generated', 'u1'])
  })

  it('listNinaPhotoReferences — the chat page carries it and the ALBUM page must not', async () => {
    /* Four statements. Q0 `countNinaAvatars` and Q1 `countNinaChatPhotos` are function CALLS and
     * dispatch while the `Promise.all` array is being built; Q2 the album page and Q3 the chat
     * page are lazy drizzle thenables that only run when `Promise.all` awaits them, in array
     * order. Recorded, not assumed. */
    fake.enqueue([[3]], [[4]], [], [])
    await queries.listNinaPhotoReferences('u1')

    expect(fake.queries).toHaveLength(4)
    const chat = whereOf(fake.sqlAt(3))
    for (const predicate of ADOPTED_SKIPPED) expect(chat, predicate).toContain(predicate)
    /* The page and the total read one scope, so they cannot disagree about who is adopted. */
    const count = whereOf(fake.sqlAt(1))
    for (const predicate of ADOPTED_SKIPPED) expect(count, predicate).toContain(predicate)

    /* An ABSENCE, and it is the user's other half: the album COPY is the row that SURVIVES the
     * dedup, so the album statement must keep listing it. Filtering both sides "for consistency"
     * would delete the photograph from the picker entirely. */
    const album = whereOf(fake.sqlAt(2))
    expect(album).not.toContain('source_key')
    expect(album).not.toContain('not exists')
  })

  it('resolveNinaPhotoReference — a saved chat id resolves through the same scope', async () => {
    /* The shared scope makes this free, which is why it is worth asserting: a selection saved
     * before the adoption must not resolve to a tile the picker can no longer offer. The function
     * already degrades an unresolvable reference to `null` (an unanchored generation) — its own
     * documented contract for "the photograph was deleted", and an adoption gets the same
     * treatment on purpose. */
    fake.enqueue([])
    await expect(
      queries.resolveNinaPhotoReference('u1', { source: 'chat', id: IMAGE }),
    ).resolves.toBeNull()

    const where = whereOf(fake.only().sql)
    for (const predicate of ADOPTED_SKIPPED) expect(where, predicate).toContain(predicate)
  })

  it('the Media view and /nina/about keep the adopted photograph — absence on purpose', async () => {
    /* The user asked for the PICKER to deduplicate, and only the picker. These reads take
     * `isOriginalPhoto()` directly (`listNinaMessageImages`) or through `mediaCollectionScope`
     * (`listNinaMediaPhotos`), and must not grow the album lookup: an adopted chat row is still a
     * real photograph in a real bubble, and the Media view is the only place it can be Replaced
     * or Removed. */
    fake.enqueue([])
    await queries.listNinaMessageImages('u1', { limit: 200 })
    expect(whereOf(fake.only().sql)).not.toContain('source_key')

    fake.reset()
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1')
    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      expect(whereOf(query.sql), query.sql).not.toContain('source_key')
    }
  })
})
```
**Impact:** four new cases, no existing case edited. `IMAGE` (`:37`) and `whereOf` (`:67`) are
already defined in this file; `REFERENCE_SKIPPED` is reused rather than re-spelled.

### Step 5: Extend plan invariant 13 with the direction it did not anticipate
**File:** `tests/nina.imageprefs.test.ts:539-553` — add one `it` inside the existing `describe`,
after the current `it` that ends at `:552`.
**Change:** this file holds **no database harness** — it imports only `lib/nina/imageprefs` and
`lib/nina/tuning` and asserts through `readSource` (`:72-74`). Installing `fakeDb` here would mean
a `vi.resetModules()` in a file whose other 40-odd cases rely on its static top-level imports, so
the generated-SQL proof lives in Step 4's file (the established precedent for that) and this file
keeps its own job: the predicate must stay on the SHARED scope and must not be copied into a
caller.
**Code:**
```ts
  it('and the shared scope itself excludes a photograph already copied into her album', () => {
    /* THE SAME INVARIANT, THE OTHER DIRECTION. `isOriginalPhoto()` catches album → chat (a chat
     * row that POINTS at an album face). It cannot catch chat → album:
     * `setChatPhotoAsAvatarAction` copies the bytes into a new `nina_avatars` row and leaves the
     * chat row's provenance NULL, so the photograph came back as two tiles — which is what the
     * user reported on 2026-09-12 ("the first 2 are duplicates").
     *
     * The fix is one more arm on `generatedChatPhotoScope`, and it must STAY there: a copy of it
     * inside `listNinaPhotoReferences` would let `countNinaChatPhotos` disagree with the page it
     * is the total for. Asserted as source text like the case above, because this file has no
     * database harness — the generated-SQL proof is `tests/nina.photoRefs.test.ts`'s
     * `ADOPTED_SKIPPED`. */
    const source = readSource('lib/nina/queries.ts')
    const fn = source.slice(source.indexOf('\nfunction generatedChatPhotoScope(userId: string) {'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('notExists(')
    expect(body).toContain('ninaAvatars.sourceKey')
    expect(body).toContain("'chat-photo:'")
    /* And the F37 arm is still there — the new one is an ADDITION, not a swap. */
    expect(body).toContain('isOriginalPhoto()')
  })
```
**Impact:** the slice is unambiguous — `'\nfunction generatedChatPhotoScope(userId: string) {'`
occurs exactly once in `lib/nina/queries.ts` (the docstrings that mention the function by name
never spell its signature), and the first `'\n}\n'` after it is the function's closing brace,
because the `sql` template's own lines end in `)` and a backtick, never in a brace at column 0.
**Whoever edits Step 2's docstring must not introduce that exact signature string into prose**, or
this slice moves.

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`) — `vitest` does not typecheck, and
the only type-shaped risk here is `notExists()`'s `SQL` inside `and()`, which must compile without
an assertion.
**Tests:**
```
npx vitest run tests/nina.photoRefs.test.ts tests/nina.imageprefs.test.ts tests/admin.chatPhotoAdoption.test.ts tests/db.schema.nina.test.ts
npm test
```
**Lint/format:** `npm run lint` and `npx prettier --check lib/nina/queries.ts tests/nina.photoRefs.test.ts tests/nina.imageprefs.test.ts` (prettier does not reformat template-literal contents, so the subquery's hand-aligned SQL survives; run it anyway before committing).

**Manual check:**
- `tests/nina.photoRefs.test.ts`'s two pre-existing cases —
  `'listNinaMessageImages — /nina/about loses the duplicate and the album face'` (`:74`) and
  `'countNinaChatPhotos — the reference picker's chat-side total still skips a reference'` (`:87`)
  — must pass **unmodified**. Confirmed by reading, and this is the reason:
  - both assert with `.toContain` on the `REFERENCE_SKIPPED` substrings, never with an exact
    match or a length, so a longer WHERE clause cannot break them;
  - `listNinaMessageImages` does not use `generatedChatPhotoScope` at all — it calls
    `isOriginalPhoto()` directly (`lib/nina/queries.ts:1756`), which this phase does not touch —
    so it is entirely unaffected;
  - `countNinaChatPhotos` does read the changed scope, and gains the new arm alongside the two it
    already asserts. Its `whereOf()` helper slices at the FIRST `' where '`, which is still the
    outer one (the subquery's own `where` comes later in the string), so the slice is unchanged
    in meaning.
- The Media-view cases at `:375-403` assert `not.toContain('"kind" =')` on
  `listNinaMediaPhotos`/`countNinaMediaPhotos`. `mediaCollectionScope` is untouched, so they are
  unaffected; Step 4's fourth case locks that in as an explicit absence.
- Optional, read-only, against the real database (the analysis already ran the first half):
  ```
  psql "$DATABASE_URL" -c "select count(*) from nina_message_images i where i.kind='generated' and i.source_avatar_id is null and i.source_image_id is null and exists (select 1 from nina_avatars a where a.user_id=i.user_id and a.source_key='chat-photo:'||i.id);"
  ```
  A non-zero answer is the number of tiles the picker stops showing. On 2026-09-12 the adopted set
  was 5 rows, one of them `kind='upload'` (already excluded by the `kind` arm), so expect 4.

**Exit criteria:** `countNinaChatPhotos`' generated WHERE clause contains the correlated
`not exists (… "nina_avatars"."source_key" = 'chat-photo:' || "nina_message_images"."id")` and
binds `userId` twice; `listNinaPhotoReferences`' chat statement carries the same predicate and its
album statement does not; `listNinaMessageImages` and both `listNinaMediaPhotos` statements carry
no `source_key` at all; `npm test` and `npm run typecheck` are green.

## Handoffs

- **`lib/nina/.workflows/package_readme.md` / `lib/admin/.workflows/package_readme.md`** — the
  latter describes the adoption's `chat-photo:<id>` key at `:363` and neither mentions the picker's
  new exclusion. Left to the `readme-updater` pass that runs after implementation, per the repo's
  usual split; not edited here.
- **A shared `chat-photo:` prefix constant.** The literal is now spelled in two modules
  (`lib/admin/ninaAlbumActions.ts:301` writes it, `generatedChatPhotoScope` reads it) with tests
  pinning both. Hoisting it into a neutral module (`lib/nina/album.ts` is the natural home) would
  touch `lib/admin/ninaAlbumActions.ts`, which this phase's scope forbids. Deliberately left — the
  tests are the seam, and the cleanup belongs to whoever next opens that action file.
- **Back-filling `source_image_id` on already-adopted chat rows.** Not done, and not wanted: the
  chat row is not a *reference* in F37's sense (its bytes are the originals; the album row is the
  copy), so writing that column would also hide it from the Media view and from `/nina/about`,
  which the user did not ask for. Recorded so a future reader does not mistake the omission for an
  oversight.
- **The picker's footer total.** `listNinaPhotoReferences.total` is `albumCount + chatCount`, and
  `chatCount` now excludes adopted rows, so the over-count the analysis noted
  (`20260912-115848-A7F3_code_analyzer.md:208-210`) is fixed by this phase with no separate change.
  No handoff — noted because it looks like one.
- **`tests/admin.chatPhotoAdoption.test.ts`** — has no assertion about the original chat row's
  visibility in the picker after adoption, and still does not need one: the picker's behaviour is
  asserted where the predicate lives. Left unchanged.

## Rollback

`git revert` the single commit. It touches three files, adds no exported symbol, writes no data and
runs no migration, so reverting restores the previous read path exactly — the duplicate tile comes
back and nothing else moves. There is no database state to unwind: `nina_avatars.source_key` was
already being written by the adoption path before this phase and is only *read* by it.
