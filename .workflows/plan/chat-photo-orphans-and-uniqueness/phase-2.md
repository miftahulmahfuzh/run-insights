# Phase 2: One photograph per collection row: the reference marker and adopt-or-reference

**Plan set:** `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md`
**Analysis:** `20260907-201920-P4H0_code_analyzer.md`
**Satisfies:** R2 (no album photograph in the Chat photos collection), R3 (no duplicates in it), R4 (an orphan gets a parent again when it is re-attached)
**Depends on:** Phase 1
**Difficulty:** HARD
**Package:** `lib/nina` (+ `lib/admin`)

---

## Goal

After this phase the **Chat photos collection** is `kind = 'generated' AND is_reference = false`, and
the two paths that used to violate that are the paths that now maintain it. `resolveAttachment` plus
the attached-photo block in `sendNinaMessage` become **adopt-or-reference**: an `image` pointer at an
orphaned row of his re-parents THAT row onto the new message (R4, and no second row, so R3 cannot be
violated by the path that used to violate it), while an `image` pointer at a live row and every
`avatar` pointer write one row marked `isReference: true` — still rendered in the bubble, in
`/nina/about` and in `loadNinaContext` (invariant 9), simply not a member of the collection. The
admin replace and remove actions can no longer reach a reference row, because a reference row is not
a member of the thing `/admin/photos` shows.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no column, no config key, no row, no Blob object (plan invariant 2).

**Renames:** none.

**Creates:**
- `lib/nina/queries.ts` — `adoptNinaMessageImage(userId, id, into: { messageId, sortOrder })`, exported, placed in §5 immediately after `insertNinaMessageImages` (after the current `:1455`).
- `tests/nina.chatPhotoUniqueness.test.ts` — new file.
- `tests/nina.chatPhotoAdoption.test.ts` — new file.

**Signature changes:**
- `resolveAttachment` (`lib/nina/actions.ts:183`) — its resolved object gains `adoptableId: string | null`. Module-private; no other caller exists.
- `NinaImageInsert` (`lib/nina/queries.ts:205`) — gains `isReference?: boolean`. **Optional, defaulting FALSE**, so the three honest writers are untouched at their call sites: `lib/nina/actions.ts:534` (his uploads), `lib/nina/imagerun.ts:203` (`finishSelfie`), `lib/admin/chatPhotoActions.ts:206` (admin add).
- `NinaImageRow` (`lib/nina/queries.ts:190`) — gains `isReference: boolean` (required, non-null; the column is `NOT NULL DEFAULT false`).
- `imageColumns` (`lib/nina/queries.ts:503`) — gains `isReference: ninaMessageImages.isReference`, placed between `sortOrder` and `createdAt`.
- `generatedChatPhotoScope` (`lib/nina/queries.ts:1548`) — same signature, third predicate `eq(ninaMessageImages.isReference, false)`. Stays un-parameterised, for the reason its own header gives.
- `updateNinaChatPhotoBlob` (`lib/nina/queries.ts:1663`) — same signature; its WHERE gains `eq(ninaMessageImages.isReference, false)`, mirroring the `kind = 'generated'` predicate that is already there for the identical reason.

**Requires (from earlier phases) — this phase does NOT typecheck without them:**
- `ninaMessageImages.isReference` exists on the drizzle table, spelled **`isReference`** in TypeScript for column **`is_reference`**, `boolean('is_reference').notNull().default(false)` (Phase 1). If Phase 1 spells the property differently, every reference to `ninaMessageImages.isReference` and `row.isReference` in this plan renames with it.
- `ninaMessageImages.messageId` is **nullable** (Phase 1). `resolveAttachment`'s new line `row.messageId === null ? row.id : null` is a TS2367 error while `NinaImageRow.messageId` is still `string`, and `isNull(ninaMessageImages.messageId)` in `adoptNinaMessageImage` is only meaningful once the column is nullable. **Do not start this phase before Phase 1's commit is on the branch.**
- `NinaImageRow.messageId: string | null` (Phase 1). This phase adds a field to the same interface and to the same `imageColumns` object; the two edits are on different lines and compose, but the reconciler should expect both phases to have touched `lib/nina/queries.ts:190-216` and `:503-516`.
- `lib/admin/chatPhotoActions.ts` — Phase 1 rewrites `removeChatPhotoAction`'s carrier-message half
  for a null `messageId` (`:276-288` today, replaced by a `loadPhotoCarrier` call) and owns
  `isNinaPhotoCarrierMessage`'s caller, `addChatPhotoAction`'s docstring, the module header and the
  `@/lib/nina/queries` import block. This phase inserts the `row.isReference` guard **above** that
  block, immediately after the `if (row == null) return` line, and the `existing.isReference` guard
  in `replaceChatPhotoAction` after its `kind` guard. **Its header paragraph goes at the END of
  `removeChatPhotoAction`'s docstring, after the `── ROW FIRST, BLOB SECOND ──` paragraph** — Phase 1
  rewrites the three paragraphs above that one, so appending is the only edit that cannot revert it.
  Same file, same two functions, non-overlapping regions. Step 9 restates this where it bites.

**Leaves alone (owned by others):**
- `lib/db/schema.ts`, `drizzle/**`, `drizzle/meta/_journal.json` — Phase 1's single migration (invariant 3). **This phase must never run `npm run db:generate`.**
- `deleteNinaMessage`, `removeNinaSession`, `imageColumns`'s `messageId` nullability, `lib/nina/album.ts` (`ImageLike`, `galleryPhotos`), `app/nina/about/page.tsx`, `app/admin/photos/page.tsx`, `components/admin/chatPhotoModel.ts`, `components/nina/**` — Phase 1's.
- `tests/db.schema.nina.test.ts` — Phase 1's (it asserts the schema).
- `scripts/**` and `package.json` — Phase 3's.
- `deleteNinaMessageImage` (`:1699`) — deliberately gets no `is_reference` predicate; see Handoffs.
- `listNinaMessageImages`, `getNinaMessageImagesForMessages`, `getNinaMessageImage`, `isBlobPathnameReferenced` — unchanged. Invariant 9: a reference row is a real photograph everywhere except `/admin/photos`, and it still counts as a Blob reference.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries.ts:190-216` | modify | `NinaImageRow` gains `isReference: boolean`; `NinaImageInsert` gains `isReference?: boolean` |
| `lib/nina/queries.ts:503-516` | modify | `imageColumns` projects `is_reference` |
| `lib/nina/queries.ts:1414-1455` | modify | `insertNinaMessageImages` writes `isReference ?? false`; header records the default |
| `lib/nina/queries.ts:1455` (after) | add | new `adoptNinaMessageImage` — the R4 statement |
| `lib/nina/queries.ts:1526-1550` | modify | `generatedChatPhotoScope` gains `is_reference = false`; header records why |
| `lib/nina/queries.ts:1633-1689` | modify | `updateNinaChatPhotoBlob`'s WHERE gains `is_reference = false`; one header bullet |
| `lib/nina/actions.ts:26-36` | modify | import `adoptNinaMessageImage` |
| `lib/nina/actions.ts:174-233` | modify | `resolveAttachment` returns `adoptableId` |
| `lib/nina/actions.ts:553-577` | modify | the attached-photo block becomes adopt-or-reference |
| `lib/admin/chatPhotoActions.ts:117-121` | modify | `replaceChatPhotoAction` refuses a reference row |
| `lib/admin/chatPhotoActions.ts:273-275` | modify | `removeChatPhotoAction` refuses a reference row |
| `tests/nina.chatPhotoUniqueness.test.ts` | create | the predicate, the two writers, the adopting UPDATE, the admin guards |
| `tests/nina.chatPhotoAdoption.test.ts` | create | `sendNinaMessage`'s four attachment outcomes |

**FIVE distinct files** — `lib/nina/queries.ts`, `lib/nina/actions.ts`,
`lib/admin/chatPhotoActions.ts` and the two new test files. (The table has eleven rows because
`queries.ts` and `actions.ts` are each edited in several places; an earlier draft of this plan said
"eight files" in Step 12 and in Verification, and that number was wrong.)

> **RECONCILED — EVERY LINE NUMBER IN THIS PLAN IS PRE-PHASE-1 AND WILL HAVE MOVED.** Phase 1 edits
> `lib/nina/queries.ts` above everything this phase touches: it widens `NinaImageRow` (`:190-203` →
> ~10 lines longer), rewrites two paragraphs of `removeNinaSession`'s header (~+17 lines) and
> replaces `deleteNinaMessage` header and body (`:1346-1383` → ~+40 lines). By the time this phase
> runs, `insertNinaMessageImages` is near `:1487` rather than `:1420`, `generatedChatPhotoScope` near
> `:1615` rather than `:1548`, and `updateNinaChatPhotoBlob` near `:1730` rather than `:1663`. Phase 1
> also adds ~40 lines to `lib/admin/chatPhotoActions.ts` above `removeChatPhotoAction`'s body. **Every
> location in this plan is to be found by SYMBOL NAME**, which no phase renames (Phase 1's Interface
> Contract declares `Renames: none`, as does this one). The numbers are kept only as a sanity check on
> which function you are looking at.

## Implementation Steps

Steps 1-6 are `lib/nina/queries.ts`, bottom-up so the file compiles between them. Do them in order.

### Step 1: `NinaImageRow` and `NinaImageInsert` carry the marker

**File:** `lib/nina/queries.ts:190-216`
**Change:** Replace both interfaces. `NinaImageRow.isReference` is required and non-null because the
column is `NOT NULL DEFAULT false`; `NinaImageInsert.isReference` is optional because three of the
four writers must not have to name it. Quote Phase 1's `messageId: string | null` — it has already
landed.

**Code:**

```ts
export interface NinaImageRow {
  id: string
  messageId: string | null
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width: number | null
  height: number | null
  bytes: number | null
  description: string | null
  prompt: string | null
  sortOrder: number
  /**
   * **True when this row RE-SHOWS a photograph that already exists elsewhere** — so it is not itself
   * a member of the Chat photos collection (R2, R3). Written by exactly one path: the attached-photo
   * block in `lib/nina/actions.ts`, for an album share and for a re-attached photograph that still
   * has a bubble of its own.
   *
   * It is NOT "hidden". Plan invariant 9: a reference row renders in the chat bubble, appears in
   * `/nina/about`'s gallery and reaches `loadNinaContext` exactly like any other row. The one
   * surface it is absent from is `/admin/photos`, whose whole subject is the collection —
   * `generatedChatPhotoScope` is where that exclusion lives and it is the only place it lives.
   *
   * Non-null and required, because the column is `NOT NULL DEFAULT false`: every row in the table
   * has an answer, and a reader that has to handle `undefined` is a reader that will forget to.
   */
  isReference: boolean
  createdAt: Date
}

export interface NinaImageInsert {
  messageId: string
  kind: NinaImageKind
  blobUrl: string
  pathname: string
  width?: number | null
  height?: number | null
  bytes?: number | null
  description?: string | null
  prompt?: string | null
  sortOrder?: number
  /**
   * **Optional, and FALSE is the default, which is the whole point of it being optional.** Three of
   * this table's four writers produce a genuinely new photograph — his uploads
   * (`lib/nina/actions.ts`), `finishSelfie` (`lib/nina/imagerun.ts`) and the admin ADD
   * (`lib/admin/chatPhotoActions.ts`) — and not one of them mentions this field. The fourth, the
   * album share / live re-attach fallback, passes `true`. Making the honest majority silent is what
   * keeps a future writer honest by default: a new INSERT that forgets this field creates a
   * collection member, which is almost always what a new INSERT means.
   */
  isReference?: boolean
}
```

**Impact:** `NinaImageRow` is produced only by this module and consumed structurally
(`lib/nina/album.ts:192`'s `ImageLike` is a subset, `components/admin/chatPhotoModel.ts` narrows).
Adding a field breaks no consumer. No object literal of this type exists outside `queries.ts`.

### Step 2: `imageColumns` projects the column

**File:** `lib/nina/queries.ts:503-516`
**Change:** Replace the whole object. `isReference` sits between `sortOrder` and `createdAt`, which
is the column's position in the table and therefore the position every `arrayMode` row mapping and
every `.returning(imageColumns)` will use.

**Code:**

```ts
const imageColumns = {
  id: ninaMessageImages.id,
  messageId: ninaMessageImages.messageId,
  kind: ninaMessageImages.kind,
  blobUrl: ninaMessageImages.blobUrl,
  pathname: ninaMessageImages.pathname,
  width: ninaMessageImages.width,
  height: ninaMessageImages.height,
  bytes: ninaMessageImages.bytes,
  description: ninaMessageImages.description,
  prompt: ninaMessageImages.prompt,
  sortOrder: ninaMessageImages.sortOrder,
  /* The collection-membership marker (R2, R3). In the ONE projection, not in a second one, for the
   * reason §2's header gives: `db.select()` widens silently and two of these rows go to a model.
   * `replaceChatPhotoAction` and `removeChatPhotoAction` read it off the row they re-read before
   * they change anything, which is only possible because it is here. */
  isReference: ninaMessageImages.isReference,
  createdAt: ninaMessageImages.createdAt,
}
```

**Impact:** every reader of this table now carries the marker. `/nina/about`, the chat bubble and
`loadNinaContext` ignore it (invariant 9); the two admin actions read it.

### Step 3: `insertNinaMessageImages` writes it, defaulting FALSE

**File:** `lib/nina/queries.ts:1414-1455`
**Change:** Replace the header and the function. One line in the `values` map, one paragraph in the
header. Nothing else about this function moves — the by-hand FK check stays exactly where it is.

**Code:**

```ts
/**
 * Phase 6 writes uploads, phase 12 writes generations. `messageId` is checked against the
 * caller's own messages first: the FK only proves the message EXISTS, and an attacker-supplied
 * message id that exists is exactly what invariant 7 is about. One extra statement, and it is
 * the only place in this file where a write validates a foreign key by hand.
 *
 * ── `isReference` DEFAULTS TO FALSE, AND THAT DEFAULT IS A DECISION (R2, R3) ─────────────────
 * A row written here is a member of the Chat photos collection unless the caller says otherwise.
 * Three of the four call sites say nothing and are correct saying nothing — his uploads
 * (`lib/nina/actions.ts`), `finishSelfie` (`lib/nina/imagerun.ts`) and the admin ADD
 * (`lib/admin/chatPhotoActions.ts`) each produce a photograph that exists nowhere else. The fourth
 * is the attached-photo fallback in `sendNinaMessage`, which passes `true` because the photograph it
 * points at is ALREADY in the album or already in the collection, and a second member would be the
 * carry-over R2 names or the duplicate R3 forbids.
 *
 * `?? false` rather than leaving the key out and relying on the column default: this table's inserts
 * are spelled column by column on purpose (see §2), and a value that is sometimes absent is a value
 * a reader has to go and look up in the schema.
 */
export async function insertNinaMessageImages(
  userId: string,
  rows: readonly NinaImageInsert[],
): Promise<NinaImageRow[]> {
  if (rows.length === 0) return []

  const messageIds = [...new Set(rows.map((row) => row.messageId))]
  const owned = await db
    .select({ id: ninaMessages.id })
    .from(ninaMessages)
    .where(and(eq(ninaMessages.userId, userId), inArray(ninaMessages.id, messageIds)))

  if (owned.length !== messageIds.length) return []

  const inserted = await db
    .insert(ninaMessageImages)
    .values(
      rows.map((row) => ({
        id: newId(),
        userId,
        messageId: row.messageId,
        kind: row.kind,
        blobUrl: row.blobUrl,
        pathname: row.pathname,
        width: row.width ?? null,
        height: row.height ?? null,
        bytes: row.bytes ?? null,
        description: row.description ?? null,
        prompt: row.prompt ?? null,
        sortOrder: row.sortOrder ?? 0,
        isReference: row.isReference ?? false,
      })),
    )
    .returning(imageColumns)

  return inserted
}
```

**Impact:** none at the three honest call sites. The fourth is Step 8.

### Step 4: `adoptNinaMessageImage` — the R4 statement

**File:** `lib/nina/queries.ts` — insert immediately after `insertNinaMessageImages` closes (after
the current `:1455`), before the `listNinaMessageImages` header at `:1457`. It belongs beside the
other writer of this table, in §5, not in §5b: §5b is *"what the operator changes"* and this is a
runner-facing write.

**Change:** New exported function. `isNull` is already imported (`:12`); no import changes.

**Code:**

```ts
/**
 * **R4: an orphan gets a parent again.** The runner's own words — *"make sure these 'orphaned'
 * photos got 'parent' chat session again if user attach a photo to another chat session"*. One
 * UPDATE, and the row that was already there is the row that lands in the new bubble.
 *
 * ── WHY AN UPDATE AND NOT AN INSERT ─────────────────────────────────────────────────────────
 * `insertNinaMessageImages` is one function away and it is the WRONG statement. A second row with
 * the same `pathname` is precisely the duplicate R3 forbids, and copying a reference onto a new row
 * is exactly how the collection filled up with them (`resolveAttachment`'s old image branch).
 * Adopting keeps the id — so `/nina`'s deep link and `attachableIdAt` (`lib/nina/chatphotos.ts`)
 * still resolve to it — keeps the Blob object, and keeps the collection at one member per
 * photograph.
 *
 * ── `message_id IS NULL` IS IN THE WHERE, NOT IN A BRANCH ABOVE IT ──────────────────────────
 * The caller has just read the row and already knows whether it had a message. Asking again HERE,
 * inside the statement, is what makes "adopt an orphan" and "leave a live bubble alone" one atomic
 * decision instead of a branch on a value read a moment earlier: a row that gained a message between
 * that read and this UPDATE is NOT adopted, and the `null` sends the caller to its fallback rather
 * than emptying a bubble the runner never touched (plan Decisions, row 5 — *"the same class of loss
 * this whole plan exists to stop"*). So `null` means exactly one thing to a caller — **"not his, or
 * not an orphan"** — and both of those answers want identical handling.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ─────────────────────────────────────────────────────
 *   · `created_at` — plan invariant 6. `/nina/about` and `/admin/photos` are both ordered by it, and
 *     `updateNinaChatPhotoBlob`'s header below records the same argument for replace: *"replacing a
 *     photograph is not taking a new one"*. Adopting one is not taking a new one either, and a
 *     bumped `created_at` would silently re-sort both surfaces.
 *   · `is_reference` — whatever the row was, it stays. An orphan that was a collection member comes
 *     back as a member; an orphan that was a re-share comes back as a re-share. Either way the
 *     collection holds this photograph exactly once, which is the whole of R3, and re-parenting is
 *     not a claim about provenance.
 *   · `description` — it describes this picture, and this is the same picture. Nina is handed it
 *     through `imageDescriptions` on this very turn.
 *   · `kind` — an orphaned upload of his, re-attached, is still his upload. `photoSideOf`
 *     (`lib/nina/album.ts`) has to keep telling the truth.
 *
 * ── OWNER SCOPE, AND WHY THERE IS NO SECOND OWNERSHIP READ ──────────────────────────────────
 * `user_id` is in the WHERE (plan invariant 4): a photograph id from a client is a claim, and this
 * module's standing rule makes "not yours" and "does not exist" one outcome. `into.messageId` is NOT
 * re-checked against `nina_messages` the way `insertNinaMessageImages` checks its `messageId`, and
 * the reason is that the one caller INSERTED that message itself, in the same request, under the same
 * `userId`, thirty lines above — with the foreign key behind that, so an id that is not a row fails
 * this statement loudly instead of landing quietly. Next 16.3.1's Server Actions guide asks for the
 * shape the caller already has: *"Send a reference (typically an ID) plus the user's change, and
 * re-read the rest from a trusted source using the session."* The reference was re-read,
 * owner-scoped, by `getNinaMessageImage` before this ran.
 *
 * `sortOrder` is a parameter and not derived, because "where in the new bubble" is the caller's
 * question: it is the count of the photographs he picked in the same message.
 */
export async function adoptNinaMessageImage(
  userId: string,
  id: string,
  into: { messageId: string; sortOrder: number },
): Promise<NinaImageRow | null> {
  const adopted = await db
    .update(ninaMessageImages)
    .set({ messageId: into.messageId, sortOrder: into.sortOrder })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        isNull(ninaMessageImages.messageId),
      ),
    )
    .returning(imageColumns)

  return adopted[0] ?? null
}
```

**Impact:** a new write path on `nina_message_images` that inserts nothing and deletes nothing
(invariant 2). It is unreachable until Step 8 calls it.

### Step 5: the collection predicate excludes a reference row

**File:** `lib/nina/queries.ts:1526-1550`
**Change:** Replace the header and the function. `listNinaChatPhotos` (`:1574`) and
`countNinaChatPhotos` (`:1608`) both call it and both therefore follow with **no edit of their own** —
which is the reason the predicate is written once.

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
 * ── `is_reference = false` — THE SECOND HALF OF THE DEFINITION (R2 + R3) ─────────────────────
 * `kind` alone was never enough and the two reported defects are the proof. The album share
 * (F34 R2) writes a row whose `pathname` is `nina/<userId>/avatar-<id>.jpg` — an ALBUM object — and
 * forces `kind: 'generated'` so the gallery's his/hers discriminator keeps telling the truth. A
 * `kind`-only predicate therefore put her album photograph into the Chat photos collection, which is
 * the carry-over R2 forbids. The re-attach of a photograph that still has a bubble wrote a second
 * row with the same `pathname`, which is the duplicate R3 forbids. Both are now marked
 * `is_reference = true` at the moment they are written, and both drop out of the collection here.
 *
 * **This is an exclusion from ONE surface, not a hiding.** Plan invariant 9: a reference row is a
 * real photograph in the conversation. It renders in its bubble, it is in `/nina/about`'s gallery
 * (`listNinaMessageImages` has no such predicate and must not gain one), it reaches
 * `loadNinaContext`, and it still counts as a live reference to its Blob object in
 * `isBlobPathnameReferenced`. What it is not is a MEMBER of the collection — because the photograph
 * it re-shows is already a member, or is an album row that was never one.
 *
 * ── STILL NOT PARAMETERISED, AND NOW FOR TWO REASONS ────────────────────────────────────────
 * The original stands: widening this is how an admin listing quietly becomes "the whole
 * conversation" without anyone deciding to. The new one is stronger — an `includeReferences` flag
 * would make R2 and R3 a caller's option, and there is no caller that wants it. The backfill
 * (phase 3) does not read this function: it classifies rows against `nina_avatars` and against
 * `pathname` groups and writes the marker, which is the same definition approached from the other
 * side.
 *
 * ── `kind` IS A RESIDUAL PREDICATE AND THAT IS CORRECT HERE ──────────────────────────────────
 * There is no `(user_id, kind, created_at)` index, and none is added for `is_reference` either.
 * Both statements below read `nina_message_images_user_created_idx` — equality on `user_id`,
 * `(created_at desc, id desc)` already in index order — and filter the other two columns on the rows
 * that come back. At this table's size (one user, phase 12's six generations a day, single-digit
 * thousands of rows at the horizon) that is a bounded index range scan and the correct read. **No
 * index is being added:** plan invariant 3 gives the one migration to phase 1, and nothing has
 * measured a need.
 */
function generatedChatPhotoScope(userId: string) {
  return and(
    eq(ninaMessageImages.userId, userId),
    eq(ninaMessageImages.kind, 'generated'),
    eq(ninaMessageImages.isReference, false),
  )
}
```

**Impact:** `/admin/photos` and `/admin`'s hub card now list and count the collection. Both change
behaviour with no edit of their own.

### Step 6: the replace statement cannot reach a reference row either

**File:** `lib/nina/queries.ts:1633-1689`
**Change:** Add one bullet to the header's "what it deliberately does not touch" list and one
predicate to the WHERE. This mirrors the `kind = 'generated'` predicate already there, for the
identical reason, and it is the reason Step 9's action guard can be a plain sentence rather than the
guarantee.

**Code:** replace the bullet list item for `kind` and the `.where(...)` call. The complete function
after the edit:

```ts
/**
 * **REPLACE: new bytes behind an existing row.** R2, verbatim: *"replace a photo in there with a
 * new photo"*.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH, AND WHY EACH ONE MATTERS ───────────────────────────
 *   · `id` — the row is the same row. `/nina` deep links to it and `attachableIdAt`
 *     (`lib/nina/chatphotos.ts:93`) hands it to the re-attach path.
 *   · `message_id` — the bubble that already exists keeps existing and now shows the new picture.
 *     This IS the requirement; a delete-and-insert would move the photograph to the bottom of the
 *     conversation. **And a NULL one stays NULL:** an orphaned photograph is still replaceable, which
 *     is the second half of the user's own bug report — *"i have replaced some photos in Chat
 *     photos, but when i delete chat sessions, these photos got deleted as well"*.
 *   · `created_at` — the gallery is ordered by it (`nina_message_images_user_created_idx`), so
 *     bumping it would silently re-sort `/nina/about`. Replacing a photograph is not taking a new
 *     one. `adoptNinaMessageImage` cites this same argument for adoption.
 *   · `sort_order` — its place inside a multi-image bubble.
 *   · `kind` — and the WHERE below carries `kind = 'generated'` as well, so this statement cannot
 *     reach one of HIS uploads even if an id for one arrives. `/admin/photos` lists only hers.
 *   · `is_reference` — and the WHERE below carries `is_reference = false` for exactly the same
 *     reason, one requirement later. A reference row is NOT a member of the collection, so it is not
 *     on `/admin/photos` and an id for one is a stale link or a hand-typed claim. Swapping its bytes
 *     would change what a bubble shows while the photograph it re-shows stayed as it was — two
 *     pictures where the operator asked for one. `replaceChatPhotoAction` refuses it with a sentence
 *     before it gets here; this predicate is what makes the refusal a property of the statement
 *     rather than of the caller.
 *
 * ── WHY `description` AND `prompt` GO TO NULL IN THE SAME STATEMENT ─────────────────────────
 * They described the OLD picture. `description` is not decorative: `lib/nina/gateway.ts:162` puts
 * it in `MessageInput.imageDescriptions` and `lib/nina/actions.ts:604` feeds it to Nina, so a stale
 * one is a sentence she will confidently say about a photograph that is not there — invariant 6's
 * exact failure. Nulling it HERE rather than in a second statement means there is no window in
 * which the row points at new bytes and old prose. NULL degrades honestly: the send path
 * substitutes `NINA_DESCRIPTION_UNAVAILABLE`, the instruction written for it.
 * `lib/admin/chatPhotoActions.ts` earns a fresh description in `after()`.
 *
 * `prompt` is the generation sidecar for bytes that are gone. It has no reader anywhere in the repo
 * (only this file's projection and `insertNinaMessageImages`), and it is already NULL on every
 * `kind = 'upload'` row, so NULL is honest and invisible rather than a marker.
 */
export async function updateNinaChatPhotoBlob(
  userId: string,
  id: string,
  patch: NinaChatPhotoBlobPatch,
): Promise<NinaImageRow | null> {
  const updated = await db
    .update(ninaMessageImages)
    .set({
      blobUrl: patch.blobUrl,
      pathname: patch.pathname,
      width: patch.width,
      height: patch.height,
      bytes: patch.bytes,
      description: null,
      prompt: null,
    })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        eq(ninaMessageImages.kind, 'generated'),
        eq(ninaMessageImages.isReference, false),
      ),
    )
    .returning(imageColumns)

  return updated[0] ?? null
}
```

**Impact:** an id for a reference row now returns `null` from this query, which
`replaceChatPhotoAction` already turns into *"That photo is not in the collection."* at `:130`.
Step 9 adds the earlier, more specific sentence.

### Step 7: `resolveAttachment` reports whether the pointer is adoptable

**File:** `lib/nina/actions.ts:174-233`, plus the `./queries` import at `:26-36`
**Change:** two edits in one file.

**7a — the import.** Replace `lib/nina/actions.ts:26-36`:

```ts
import {
  adoptNinaMessageImage,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessagesByIds,
  getNinaSession,
  insertNinaMessageImages,
  insertNinaMessages,
  listNinaMessages,
  listNinaMessagesAfter,
  readNinaTuning,
} from './queries'
```

**7b — the function.** Replace `lib/nina/actions.ts:174-233` in full:

```ts
/**
 * Resolved once, BEFORE the runner's row is written, so a bad id costs nothing.
 *
 * ── WHY NO VISION CALL ────────────────────────────────────────────────────────────────────────
 * We already know what is in the picture. `nina_avatars.description` and
 * `nina_message_images.description` are exactly what phase 6's `glm-4.6v` pass would have
 * produced, and already paid for — so the description is copied onto the new row and reaches her
 * through `imageDescriptions`, as text (invariant 5).
 *
 * ── `adoptableId` — WHAT THIS PHASE ADDED, AND WHY THE DECISION IS MADE HERE ──────────────────
 * R2 says no album photograph may appear in the Chat photos collection, R3 says no photograph may
 * appear in it twice, and BOTH defects were this function copying a reference onto a new row. The
 * fix is not a new read: it is one more field on what these two reads already learned.
 *
 *   · an `image` pointer at a row of his with **no message** -> `adoptableId = row.id`. The caller
 *     re-parents THAT row onto the new message (R4) and inserts nothing, so this path can no longer
 *     produce the duplicate it used to produce.
 *   · an `image` pointer at a row that **still has** a message -> `null`. Moving it would empty a
 *     bubble the runner never touched (plan Decisions, row 5), so the caller writes a REFERENCE row
 *     and the original bubble is untouched.
 *   · every `avatar` pointer -> `null`, always. An album photograph is a `nina_avatars` row; there is
 *     no `nina_message_images` row here to adopt. The reference row the caller writes is what keeps
 *     F34 R2's "Kirim ke chat" working while keeping her album out of the collection (Decisions,
 *     row 4).
 *
 * `adoptableId` is a **candidate, not a promise**. `message_id IS NULL` is in the adopting UPDATE's
 * own WHERE, so a row that gains a message between this read and that statement is not adopted and
 * the caller falls back to the reference row. This function reads; it decides nothing that the
 * statement cannot re-check.
 */
async function resolveAttachment(
  userId: string,
  attach: NinaAttachExisting,
): Promise<{
  blobUrl: string
  pathname: string
  kind: NinaImageKind
  description: string | null
  /** The `nina_message_images.id` to re-parent, or null to write a reference row. See the header. */
  adoptableId: string | null
} | null> {
  if (attach.kind === 'avatar') {
    /*
     * ONE ROW, BY PRIMARY KEY, SCOPED TO `user_id` (F34). This was
     * `listNinaAvatars(userId).find((candidate) => candidate.id === attach.id)`, which was correct
     * and was cheap when the album held the handful of faces F33 R23 described. F34 R1's stated
     * requirement is *"i will put hundreds of profile pics in there"*, and this runs on every send
     * that carries a shared photo — so it read the whole album, every column and every
     * `description`, to answer a question about one id.
     *
     * `getNinaAvatar` proves strictly the same thing: `user_id` is in its WHERE, so "not his" and
     * "does not exist" come back as the same `null`, which is what the refusal below needs. The
     * ownership property is not being relaxed; the read is.
     */
    const row = await getNinaAvatar(userId, attach.id)
    if (row == null) return null
    /* Her own photograph, so `kind: 'generated'` — the gallery's his/hers discriminator has to
     * keep telling the truth about a photo that has now appeared twice. `kind` is deliberately
     * UNCHANGED by this phase: invariant 8 says the chat renders exactly as it does today, and
     * `photoSideOf` reads this value. What changed is that `is_reference` now carries the
     * "appeared twice" fact, so `kind` no longer has to be the collection's only filter. */
    return {
      blobUrl: row.blobUrl,
      pathname: row.pathname,
      kind: 'generated',
      description: row.description,
      /* An album row is not a chat row. There is nothing to adopt, ever. */
      adoptableId: null,
    }
  }

  /*
   * The same substitution on the conversation-photo branch. `listNinaMessageImages(userId, {
   * limit: NINA_GALLERY_LIMIT }).find(...)` read up to 200 rows to answer one id;
   * `getNinaMessageImage` is phase 3's mirror of `getNinaAvatar` and is why this phase depends on
   * phase 3. Bounded before, so this is a smaller win than the avatar branch — done in the same
   * commit because leaving one of two identical mistakes in place is how it grows back.
   *
   * The read is owner-scoped, which is what makes the id below safe to hand to an UPDATE: by this
   * line the row has been PROVED to be his. Next 16.3.1's Server Actions guide, on exactly this
   * shape: *"Send a reference (typically an ID) plus the user's change, and re-read the rest from a
   * trusted source using the session."*
   */
  const row = await getNinaMessageImage(userId, attach.id)
  if (row == null) return null
  /* A re-attached chat photo keeps whoever's it was. */
  return {
    blobUrl: row.blobUrl,
    pathname: row.pathname,
    kind: row.kind,
    description: row.description,
    /* R4. A row with no message is an orphan, and an orphan is the ONLY thing adoption may move —
     * `message_id IS NULL` is re-asserted inside the UPDATE, so this is a candidate and not a
     * decision. A row that still has a message is left exactly where it is. */
    adoptableId: row.messageId === null ? row.id : null,
  }
}
```

**Impact:** `resolveAttachment` has one caller (`:462`) and it destructures nothing, so the widened
return type is additive. **`row.messageId === null` is a TS2367 error until Phase 1's nullable
`messageId` has landed** — that is the hard dependency, stated once more where it bites.

### Step 8: the attached-photo block becomes adopt-or-reference

**File:** `lib/nina/actions.ts:553-577`
**Change:** Replace the comment block and the `if (attached !== null)` body. **The ordering around it
does not move**: the runner message is still inserted at `:502-518` before this runs, so
`runnerMessageId` is already in hand — the file's header calls that ordering part of its contract.
The `images` block at `:532-551` is untouched.

**Code:**

```ts
  /*
   * R26's row — now **ADOPT-OR-REFERENCE** (R2, R3, R4).
   *
   * ── WHY THIS BLOCK CHANGED AT ALL ───────────────────────────────────────────────────────────
   * It used to INSERT, unconditionally, and that one statement was both of the reported defects: an
   * `avatar` pointer put an album photograph into the Chat photos collection (R2), and an `image`
   * pointer put the same photograph into it twice (R3). Nothing about the BUBBLE changes here —
   * plan invariant 8 — only which row the conversation shows the photograph through.
   *
   *   · `attached.adoptableId != null` -> the pointer named an ORPHANED row of his, so that row is
   *     RE-PARENTED onto this message. That is R4, and it is why R3 cannot be violated by this path
   *     any more: no row is written, so no row can be a duplicate. Same id, same `created_at`
   *     (invariant 6), same Blob object, same `is_reference`.
   *   · adoption came back `null` -> the row gained a message between the read and the UPDATE, or it
   *     was not his after all. Fall through to the reference row: the photograph is in the
   *     conversation either way, and the collection is unharmed either way. Every branch of that
   *     race has an honest outcome, which is the reason the check lives in the WHERE.
   *   · anything else — every album share, and every re-attach of a photograph that still has a
   *     bubble — -> ONE row with `isReference: true`. It renders in the bubble, it reaches
   *     `loadNinaContext`, it appears in `/nina/about` (invariant 9). It is simply not a MEMBER of
   *     the Chat photos collection, because the photograph it re-shows already lives somewhere.
   *
   * `sortOrder: images.length` puts it after anything he picked in the same message, in BOTH arms,
   * so the adopted row and the reference row land in the same place. Today the album sends exactly
   * one photo and no tickets, so that is 0; spelling it as the count rather than as 0 keeps the two
   * blocks composable if a later card ever lets him do both.
   *
   * ── THE FAILURE DISCIPLINE IS UNCHANGED, AND DELIBERATELY ───────────────────────────────────
   * Warned and swallowed, as before. The message and the reply are worth more than a gallery row,
   * and `imageDescriptions` below is built from `attached.description` rather than from either
   * statement's return value — so the turn she takes is identical whichever arm ran, and identical
   * if both failed.
   */
  if (attached !== null) {
    try {
      const adopted =
        attached.adoptableId === null
          ? null
          : await adoptNinaMessageImage(userId, attached.adoptableId, {
              messageId: runnerMessageId,
              sortOrder: images.length,
            })

      if (adopted === null) {
        await insertNinaMessageImages(userId, [
          {
            messageId: runnerMessageId,
            kind: attached.kind,
            blobUrl: attached.blobUrl,
            pathname: attached.pathname,
            description: attached.description,
            sortOrder: images.length,
            isReference: true,
          },
        ])
      }
    } catch (cause) {
      console.warn('[nina] could not persist the attached photo', { error: String(cause) })
    }
  }
```

**Impact:** the two carry-over paths stop adding collection members; the orphan path re-parents
instead of copying. `startNinaBackgroundTurn`'s `imageDescriptions` at `:634-637` is unchanged and
still reads `attached.description`, so the turn is byte-identical in both arms.

### Step 9: the admin actions refuse a reference row

**File:** `lib/admin/chatPhotoActions.ts`
**Change:** two guards, and two header paragraphs. Nothing else in this file moves.

> **RECONCILED — Phase 1 edits this same file, and the two phases' regions are now stated
> explicitly.** Phase 1 owns: the module header's new `── A CHAT PHOTOGRAPH MAY HAVE NO MESSAGE
> (R1) ──` paragraph, `addChatPhotoAction`'s docstring, `removeChatPhotoAction`'s header paragraphs
> 2–4 and its carrier-lookup body, the new module-local `loadPhotoCarrier` helper, and the
> `@/lib/nina/queries` import block. **This phase owns exactly four things and nothing else:** one
> header paragraph and one guard in `replaceChatPhotoAction` (which Phase 1 does not touch at all),
> and one header paragraph and one guard in `removeChatPhotoAction`.
>
> **Every line number in this step is pre-Phase-1 and will have moved.** Phase 1's Step 13a/13c
> insert roughly forty lines of prose above `removeChatPhotoAction`'s body. Locate by SYMBOL —
> `export async function replaceChatPhotoAction`, `export async function removeChatPhotoAction`,
> and the `if (row == null) return` line inside the latter — never by line number.

**9a — `replaceChatPhotoAction`.** Add a paragraph to the header (`:91-105` today) and one guard
after the existing `kind` guard (`:119-121` today). **Phase 1 leaves this function completely
alone** — it is listed in Phase 1's *"Verified as needing NO change"* block — so the pre-change
state quoted below is also the post-Phase-1 state, and this is the one place in this step where the
whole function may safely be pasted. The complete function after the edit:

```ts
/**
 * Swap the bytes behind an existing photograph, keeping the row, its message, its `created_at` and
 * its place in the conversation — so the bubble that already exists shows the new picture.
 *
 * ── ROW FIRST, OLD BLOB SECOND ──────────────────────────────────────────────────────────────
 * `deleteNinaAvatarAction`'s rule (`lib/admin/ninaAlbumActions.ts:186-191`), and it points the same
 * way here: a failed `del` leaves an orphan, which is recoverable; a deleted blob under a live row
 * is a permanently broken image in the runner's chat. It also does a second job — by the time the
 * release runs, this row already points at the NEW pathname, so it is out of the reference answer
 * and no "except this row" parameter is needed.
 *
 * The `existing.pathname !== pathname` guard is not paranoia: `addRandomSuffix` makes a collision
 * impossible in practice, and deleting the object the row now points at would be unrecoverable, so
 * the one comparison that rules it out is worth making.
 *
 * ── A REFERENCE ROW IS NOT A MEMBER, SO IT IS NOT REPLACEABLE ───────────────────────────────
 * `is_reference = true` means this row RE-SHOWS a photograph that already exists elsewhere — an
 * album row (F34 R2's share) or another chat row. `generatedChatPhotoScope` excludes it, so it is
 * not on `/admin/photos` at all and an id for one is a stale link or a hand-typed claim. Replacing
 * its bytes would change what one bubble shows while the photograph it re-shows stayed as it was:
 * two pictures where the operator asked for one, and no way to see the second one from this screen.
 * The refusal is a sentence, in the same shape as the `kind` refusal above it, and
 * `updateNinaChatPhotoBlob`'s WHERE carries `is_reference = false` behind it so the statement itself
 * cannot reach the row either.
 */
export async function replaceChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoReplaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That upload did not describe a photo.' }
  const { id, blobUrl, pathname, width, height, bytes } = parsed.data

  if (!isAdminChatPhotoPathname(pathname, userId)) {
    return { ok: false, error: 'That file did not land in her photo folder.' }
  }

  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }
  if (existing.isReference) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Replace the original instead.',
    }
  }

  const updated = await updateNinaChatPhotoBlob(userId, id, {
    blobUrl,
    pathname,
    width,
    height,
    bytes,
  })
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  let note: string | undefined
  if (existing.pathname !== pathname) {
    const outcome = await releaseChatPhotoBlob(userId, existing)
    if (outcome === 'shared') note = 'The old file is still used elsewhere, so it was kept.'
  }

  scheduleChatPhotoDescribe(userId, id)

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return { ok: true, id, ...(note === undefined ? {} : { note }) }
}
```

**9b — `removeChatPhotoAction`.** Add ONE paragraph at the END of the header, and ONE guard
immediately after the `row == null` check. **Only those two edits.**

> **RECONCILED — this block quotes Phase 1's AFTER-state, not the branch as it is today.** Phase 1's
> Step 13c rewrites this header's `── THE EMPTY BUBBLE, RESOLVED ──` and `It must NOT delete a
> RUNNER message` paragraphs and inserts a third, `── AND THE PHOTOGRAPH MAY HAVE NO MESSAGE AT ALL
> (R1) ──`, and its Step 13d replaces the body's carrier lookup with `loadPhotoCarrier`. The text
> below is what you will find on the branch once Phase 1 is committed. **Do not paste this whole
> block over the file** — the four paragraphs before the new one, and every line under
> `if (row.isReference)`, are Phase 1's and are shown here only so you can see where the two edits
> land. If what you find does not look like this, Phase 1 has not landed; stop and check.

The header, after Phase 1, ends with the `── ROW FIRST, BLOB SECOND ──` paragraph. Append the new
one after it:

```ts
/**
 * Take a photograph out of the collection, its Blob object with it when nothing else needs it —
 * and, when the message existed only to carry it, the message too.
 *
 * ── THE EMPTY BUBBLE, RESOLVED ──────────────────────────────────────────────────────────────
 * [PHASE 1'S TEXT — `deleteNinaMessage` removes the image row explicitly, since R1 made the column
 * `ON DELETE SET NULL`. Do not restore the old `ON DELETE CASCADE` sentence: it is false after
 * Phase 1's `lib/db/schema.ts` change.]
 *
 * [PHASE 1'S TEXT — it must NOT delete a RUNNER message that merely carried her re-attached
 * photograph (the R26 path).]
 *
 * ── AND THE PHOTOGRAPH MAY HAVE NO MESSAGE AT ALL (R1) ──────────────────────────────────────
 * [PHASE 1'S TEXT — an orphan's `row.messageId` is NULL, so `loadPhotoCarrier` short-circuits.]
 *
 * ── ROW FIRST, BLOB SECOND, AND ONLY IF NOTHING ELSE POINTS AT IT ───────────────────────────
 * [UNCHANGED BY BOTH PHASES.]
 *
 * ── A REFERENCE ROW IS NOT A MEMBER, SO IT IS NOT REMOVABLE FROM HERE ───────────────────────
 * ^^^ THIS PARAGRAPH IS THE ONLY HEADER EDIT THIS PHASE MAKES. ^^^
 * `is_reference = true` marks a row that re-shows a photograph that already exists elsewhere.
 * `generatedChatPhotoScope` excludes it, so it never appears on `/admin/photos` and an id for one is
 * a stale link or a hand-typed claim. Acting on it would be worse than useless: the photograph the
 * operator can SEE on the screen would still be there afterwards, and `releaseChatPhotoBlob` would
 * be asked about an object the original member still points at. The refusal is first, above every
 * read and every delete, and it is a sentence rather than the generic miss so the operator knows the
 * id was real and the answer was still no. Removing a re-share from a bubble is the runner's own
 * message-edit path, not this screen's.
 *
 * It sits ABOVE `loadPhotoCarrier` for a reason worth one line: an orphaned reference row would
 * otherwise take Phase 1's `{ message: null, siblings: [] }` short-circuit straight into
 * `deleteNinaMessageImage`, which is exactly the delete this paragraph forbids.
 */
export async function removeChatPhotoAction(input: unknown): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Not a photo id.' }
  const { id } = parsed.data

  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }

  /* ^^^ THIS GUARD IS THE ONLY BODY EDIT THIS PHASE MAKES. ^^^ */
  if (row.isReference) {
    return {
      ok: false,
      error: 'That one re-shows a photo that lives elsewhere. Remove the original instead.',
    }
  }

  /* ── Everything below is Phase 1's Step 13d, verbatim. Shown so the insertion point above is
   *    unambiguous; do not retype it, and do not "restore" the pre-Phase-1 `getNinaMessagesByIds(
   *    userId, [row.messageId])` pair — that call is what Phase 1 removed, and Phase 1's own test
   *    asserts the string `[row.messageId]` is absent from this file. ── */
  const carrier = await loadPhotoCarrier(userId, row.messageId)
  const isLastImage = carrier.siblings.every((sibling) => sibling.id === id)

  if (isLastImage && carrier.message != null && isNinaPhotoCarrierMessage(carrier.message)) {
    const gone = await deleteNinaMessage(userId, carrier.message.id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  } else {
    const gone = await deleteNinaMessageImage(userId, id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  }

  // …the blob release, the revalidate and the return are unchanged by both phases.
}
```

**Impact:** neither action can reach a reference row. `addChatPhotoAction` is **not touched** — it
writes a genuinely new photograph, so `insertNinaMessageImages`' `false` default is exactly right for
it and it must keep saying nothing about the field.

### Step 10: `tests/nina.chatPhotoUniqueness.test.ts` — the predicate, the writers, the statement

**File:** `tests/nina.chatPhotoUniqueness.test.ts` (new)
**Change:** create. Asserts the real generated SQL through the `fakeDb` recorder — the
`tests/nina.sessionPurge.test.ts` shape, for its stated reason: a spy cannot tell a missing predicate
from a present one.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { readRepoCode } from './support/importGraph'

/**
 * **R2, R3 and R4 at the statement level.**
 *
 * The properties, in the order they would hurt if they were wrong:
 *
 *   1. **The Chat photos collection is `kind = 'generated' AND is_reference = false`**, in the
 *      listing AND in the count, because both read one predicate and a drifted pair is how
 *      `/admin/photos` and `/admin`'s hub card would start disagreeing about how many photographs
 *      exist.
 *   2. **`insertNinaMessageImages` defaults the marker to FALSE.** That default is what leaves the
 *      three honest writers correct while saying nothing, and it is what makes a future INSERT
 *      create a collection member unless it deliberately does not.
 *   3. **Adoption is ONE `UPDATE`, owner-scoped, and only ever reaches an orphan.** `message_id is
 *      null` has to be in the WHERE and not in a branch above it; `created_at` and `is_reference`
 *      must not be in the SET (plan invariant 6, and R3).
 *   4. **Replace cannot reach a reference row** — the predicate is in the statement, not only in the
 *      action.
 *
 * Asserted against generated SQL rather than against a spy: a spy would pass with the predicate
 * deleted.
 */

type Queries = typeof import('@/lib/nina/queries')

let fake: FakeDb
let q: Queries

beforeEach(async () => {
  vi.resetModules()
  fake = installFakeDb()
  q = await import('@/lib/nina/queries')
})

afterEach(() => {
  uninstallFakeDb()
  vi.resetModules()
})

/**
 * Whether a boolean literal was BOUND rather than inlined. Both spellings are accepted because the
 * driver boundary is allowed to serialise a boolean either way and this suite is asserting that the
 * value reached the parameter list, not how neon spells it.
 */
function boundBoolean(params: unknown[], value: boolean): boolean {
  return params.some((param) => param === value || param === String(value))
}

/** `imageColumns` in projection order, as an arrayMode row. */
function imageRow(overrides: { id?: string; messageId?: string | null } = {}): unknown[] {
  return projectedRow(
    overrides.id ?? 'imgAAAAAAAAA',
    overrides.messageId === undefined ? 'msgBBBBBBBBB' : overrides.messageId,
    'generated',
    'https://blob.example/nina/u1/selfie-1.jpg',
    'nina/u1/selfie-1.jpg',
    1024,
    1536,
    240_000,
    null,
    null,
    0,
    false,
    '2026-09-01 09:00:00+00',
  )
}

describe('the Chat photos collection excludes a reference row (R2, R3)', () => {
  it('puts all three predicates in the listing AND in the count', async () => {
    fake.enqueue([], [[0]])
    await q.listNinaChatPhotos('u1')

    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      expect(query.sql).toContain('from "nina_message_images"')
      expect(query.sql).toContain('"user_id" = $')
      expect(query.sql).toContain('"kind" = $')
      expect(query.sql).toContain('"is_reference" = $')
      expect(query.params).toContain('u1')
      expect(query.params).toContain('generated')
      expect(boundBoolean(query.params, false)).toBe(true)
    }
  })

  it('counts the same set, from the same predicate', async () => {
    fake.enqueue([[7]])
    await expect(q.countNinaChatPhotos('u1')).resolves.toBe(7)

    const { sql, params } = fake.only()
    expect(sql).toContain('count(*)')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"kind" = $')
    expect(sql).toContain('"is_reference" = $')
    expect(boundBoolean(params, false)).toBe(true)
  })

  it('leaves the gallery read alone — invariant 9', async () => {
    /* `/nina/about` shows every photograph in the conversation, reference rows included. A
     * predicate here would hide a picture the runner can see in his own chat. */
    fake.enqueue([])
    await q.listNinaMessageImages('u1', { limit: 200 })
    expect(fake.only().sql).not.toContain('"is_reference"')
  })
})

describe('insertNinaMessageImages — FALSE unless asked (R2, R3)', () => {
  const row = {
    messageId: 'msgBBBBBBBBB',
    kind: 'generated' as const,
    blobUrl: 'https://blob.example/nina/u1/selfie-1.jpg',
    pathname: 'nina/u1/selfie-1.jpg',
  }

  it('writes a collection member when nobody says otherwise', async () => {
    fake.enqueue([['msgBBBBBBBBB']], [imageRow()])
    await q.insertNinaMessageImages('u1', [row])

    const insert = fake.last()
    expect(insert.sql).toContain('insert into "nina_message_images"')
    expect(insert.sql).toContain('"is_reference"')
    expect(boundBoolean(insert.params, false)).toBe(true)
  })

  it('writes a reference row when the caller says so', async () => {
    fake.enqueue([['msgBBBBBBBBB']], [imageRow()])
    await q.insertNinaMessageImages('u1', [{ ...row, isReference: true }])

    expect(boundBoolean(fake.last().params, true)).toBe(true)
  })
})

describe('adoptNinaMessageImage — R4, in one statement', () => {
  const into = { messageId: 'msgRUNNER001', sortOrder: 0 }

  it('is a single owner-scoped UPDATE that only matches an ORPHAN', async () => {
    fake.enqueue([])
    await expect(q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', into)).resolves.toBeNull()

    const update = fake.only()
    expect(update.sql).toMatch(/^update "nina_message_images" set/)
    expect(update.sql).toContain('"message_id" = $')
    expect(update.sql).toContain('"sort_order" = $')
    expect(update.sql).toContain('"user_id" = $')
    expect(update.sql).toContain('"id" = $')
    expect(update.sql).toContain('"message_id" is null')
    expect(update.sql).toContain('returning')
    expect(update.params).toContain('u1')
    expect(update.params).toContain('imgAAAAAAAAA')
    expect(update.params).toContain('msgRUNNER001')
    expect(fake.batches).toEqual([])
  })

  it('never bumps created_at and never rewrites is_reference', async () => {
    fake.enqueue([])
    await q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', { ...into, sortOrder: 3 })

    /* The SET clause only. `"message_id" is null` and the RETURNING list live past the WHERE. */
    const setClause = fake.only().sql.split(' where ')[0]!
    expect(setClause).not.toContain('created_at')
    expect(setClause).not.toContain('is_reference')
    expect(setClause).not.toContain('description')
    expect(setClause).not.toContain('"kind"')
  })

  it('returns the adopted row, so the caller needs no second read', async () => {
    fake.enqueue([imageRow({ id: 'imgAAAAAAAAA', messageId: 'msgRUNNER001' })])
    const adopted = await q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', into)

    expect(adopted?.id).toBe('imgAAAAAAAAA')
    expect(adopted?.messageId).toBe('msgRUNNER001')
    expect(adopted?.isReference).toBe(false)
  })

  it('inserts nothing and deletes nothing — plan invariant 2', async () => {
    fake.enqueue([])
    await q.adoptNinaMessageImage('u1', 'imgAAAAAAAAA', into)
    for (const query of fake.queries) {
      expect(query.sql).not.toContain('insert into')
      expect(query.sql).not.toContain('delete from')
    }
  })
})

describe('replace cannot reach a reference row either', () => {
  it('carries the predicate in the statement, beside the kind predicate', async () => {
    fake.enqueue([])
    await q.updateNinaChatPhotoBlob('u1', 'imgAAAAAAAAA', {
      blobUrl: 'https://blob.example/nina/u1/selfie-2.jpg',
      pathname: 'nina/u1/selfie-2.jpg',
      width: 1024,
      height: 1536,
      bytes: 240_000,
    })

    const where = fake.only().sql.split(' where ')[1]!
    expect(where).toContain('"kind" = $')
    expect(where).toContain('"is_reference" = $')
  })
})

describe('exactly one path writes a reference row', () => {
  it('is the attached-photo fallback in the send action, and nothing else', () => {
    const actions = readRepoCode('lib/nina/actions.ts')
    expect(actions.match(/isReference: true/g) ?? []).toHaveLength(1)
  })

  it('leaves finishSelfie and the admin ADD saying nothing about it', () => {
    expect(readRepoCode('lib/nina/imagerun.ts')).not.toContain('isReference')
    expect(readRepoCode('lib/admin/chatPhotoActions.ts')).not.toContain('isReference: true')
  })
})

describe('a reference row is not a member, so replace and remove refuse it', () => {
  const source = readRepoCode('lib/admin/chatPhotoActions.ts')

  function bodyOf(name: string): string {
    const after = source.split(`export async function ${name}`)[1]
    expect(after).toBeDefined()
    return after!.split('export async function')[0]!
  }

  it('refuses in replace, before the UPDATE is issued', () => {
    const body = bodyOf('replaceChatPhotoAction')
    expect(body).toContain('existing.isReference')
    expect(body.indexOf('existing.isReference')).toBeLessThan(
      body.indexOf('updateNinaChatPhotoBlob('),
    )
  })

  it('refuses in remove, before anything is deleted', () => {
    const body = bodyOf('removeChatPhotoAction')
    expect(body).toContain('row.isReference')
    expect(body.indexOf('row.isReference')).toBeLessThan(body.indexOf('deleteNinaMessage'))
  })

  it('says which of the two "no"s it is, rather than the generic miss', () => {
    expect(source).toContain('lives elsewhere')
  })
})
```

**Impact:** none on shipped code. If `boundBoolean` fails on both spellings, the driver inlined the
literal — assert `sql` contains `"is_reference" = false` instead and delete the helper; do not weaken
the SQL-text assertions.

### Step 11: `tests/nina.chatPhotoAdoption.test.ts` — the four outcomes of an attachment

**File:** `tests/nina.chatPhotoAdoption.test.ts` (new)
**Change:** create. Drives the real `sendNinaMessage` with only its EDGES mocked — the
`tests/nina.jobActions.test.ts` arrangement and its stated reason. `importOriginal` is spread into
every module mock so that the many other modules importing `./queries` and `./chatturn` keep every
export they name.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **R2, R3 and R4 as the send path actually behaves.**
 *
 * Four outcomes, and the pointer is the only thing that differs between them:
 *
 *   1. an `avatar` pointer — the album's "Kirim ke chat" — adds a REFERENCE row, so F34 R2 keeps
 *      working and her album photograph does not become a Chat photos member (R2);
 *   2. an `image` pointer at an ORPHANED row of his ADOPTS that row and inserts nothing, so the
 *      photograph comes back into a conversation as the same row (R4) and cannot become a duplicate
 *      (R3);
 *   3. an `image` pointer at a row that STILL HAS a message leaves that bubble alone and adds a
 *      reference row (plan Decisions, row 5);
 *   4. the race — the row was an orphan at the read and had a message by the UPDATE — falls back to
 *      the reference row, because `message_id IS NULL` is in the statement's own WHERE.
 *
 * ── WHAT IS MOCKED, AND WHY IT IS ONLY THE EDGES ──────────────────────────────────────────────
 * `@/lib/auth/requireUserId`, `next/server`, and — SPREAD OVER THE REAL MODULE —
 * `@/lib/nina/queries` and `@/lib/nina/chatturn`. Everything in between is the shipping
 * `sendNinaMessage`: the refusal rule, the write order, `resolveAttachment`, and the adopt-or-
 * reference block. The spread matters: a dozen modules in this import graph name exports of
 * `./queries`, and a factory that returned only the six functions this suite drives would fail at
 * import time on the first one it left out.
 *
 * `openNinaChatTurn` is stubbed to `null` — the ORDINARY burst outcome, documented at
 * `lib/nina/actions.ts:619` — so the background turn never starts and this suite never reaches a
 * model, a context load or an `after()` callback.
 */

const spies = vi.hoisted(() => ({
  getNinaAvatar: vi.fn(),
  getNinaMessageImage: vi.fn(),
  getNinaSession: vi.fn(),
  insertNinaMessages: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  adoptNinaMessageImage: vi.fn(),
}))

vi.mock('@/lib/auth/requireUserId', () => ({ requireUserId: async () => 'u1' }))

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

vi.mock('@/lib/nina/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/queries')>()
  return { ...actual, ...spies }
})

vi.mock('@/lib/nina/chatturn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nina/chatturn')>()
  return {
    ...actual,
    sweepStaleNinaChatTurns: async () => 0,
    /* The burst case: a turn is already running for this conversation. His message is saved and
     * nothing else happens, which is exactly the surface this suite wants. */
    openNinaChatTurn: async () => null,
  }
})

/* `authEnv()` parses eagerly on first call and `sendNinaMessage` calls it before the ticket loop. */
process.env.AUTH_SECRET ??= 'unit-secret'
process.env.AUTH_GOOGLE_ID ??= 'unit-id'
process.env.AUTH_GOOGLE_SECRET ??= 'unit-secret'

const SESSION_ID = 'sesAAAAAAAAA'
const RUNNER_MESSAGE_ID = 'msgRUNNER001'

type Actions = typeof import('@/lib/nina/actions')

let actions: Actions

beforeEach(async () => {
  vi.resetModules()
  for (const spy of Object.values(spies)) spy.mockReset()

  spies.getNinaSession.mockResolvedValue({
    id: SESSION_ID,
    title: null,
    titleSource: null,
    pinnedAt: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
  })
  spies.insertNinaMessages.mockResolvedValue([{ id: RUNNER_MESSAGE_ID, seq: 41 }])
  spies.insertNinaMessageImages.mockResolvedValue([])
  spies.adoptNinaMessageImage.mockResolvedValue(null)

  actions = await import('@/lib/nina/actions')
})

afterEach(() => {
  vi.resetModules()
})

/** The single row handed to `insertNinaMessageImages`, asserting there was exactly one call. */
function insertedRow(): Record<string, unknown> {
  expect(spies.insertNinaMessageImages).toHaveBeenCalledTimes(1)
  const call = spies.insertNinaMessageImages.mock.calls[0]!
  expect(call[0]).toBe('u1')
  const rows = call[1] as Record<string, unknown>[]
  expect(rows).toHaveLength(1)
  return rows[0]!
}

async function send(attachExisting: { kind: 'avatar' | 'image'; id: string }) {
  return actions.sendNinaMessage({ body: 'lihat ini', sessionId: SESSION_ID, attachExisting })
}

describe('an album share adds no collection member (R2)', () => {
  beforeEach(() => {
    spies.getNinaAvatar.mockResolvedValue({
      id: 'avaAAAAAAAAA',
      blobUrl: 'https://blob.example/nina/u1/avatar-avaAAAAAAAAA.jpg',
      pathname: 'nina/u1/avatar-avaAAAAAAAAA.jpg',
      description: 'her, on a bridge at dusk',
    })
  })

  it('writes one reference row and adopts nothing', async () => {
    const result = await send({ kind: 'avatar', id: 'avaAAAAAAAAA' })

    expect(result.ok).toBe(true)
    expect(result.userMessageId).toBe(RUNNER_MESSAGE_ID)
    expect(spies.adoptNinaMessageImage).not.toHaveBeenCalled()
    expect(insertedRow()).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      kind: 'generated',
      pathname: 'nina/u1/avatar-avaAAAAAAAAA.jpg',
      isReference: true,
      sortOrder: 0,
    })
  })

  it('keeps the bubble identical — same kind, same description (invariants 8 and 9)', async () => {
    await send({ kind: 'avatar', id: 'avaAAAAAAAAA' })
    expect(insertedRow()).toMatchObject({
      kind: 'generated',
      description: 'her, on a bridge at dusk',
    })
  })
})

describe('a re-attached ORPHAN is adopted, not copied (R4, R3)', () => {
  beforeEach(() => {
    spies.getNinaMessageImage.mockResolvedValue({
      id: 'imgORPHAN001',
      messageId: null,
      kind: 'generated',
      blobUrl: 'https://blob.example/nina/u1/selfie-1.jpg',
      pathname: 'nina/u1/selfie-1.jpg',
      description: 'she is holding a coffee',
      isReference: false,
      sortOrder: 0,
      width: 1024,
      height: 1536,
      bytes: 240_000,
      prompt: null,
      createdAt: new Date('2026-08-01T09:00:00Z'),
    })
    spies.adoptNinaMessageImage.mockResolvedValue({
      id: 'imgORPHAN001',
      messageId: RUNNER_MESSAGE_ID,
      kind: 'generated',
      isReference: false,
      createdAt: new Date('2026-08-01T09:00:00Z'),
    })
  })

  it('re-parents the row it already has and inserts nothing', async () => {
    const result = await send({ kind: 'image', id: 'imgORPHAN001' })

    expect(result.ok).toBe(true)
    expect(spies.adoptNinaMessageImage).toHaveBeenCalledTimes(1)
    expect(spies.adoptNinaMessageImage).toHaveBeenCalledWith('u1', 'imgORPHAN001', {
      messageId: RUNNER_MESSAGE_ID,
      sortOrder: 0,
    })
    expect(spies.insertNinaMessageImages).not.toHaveBeenCalled()
  })
})

describe('a re-attached LIVE photograph leaves its bubble alone (Decisions, row 5)', () => {
  beforeEach(() => {
    spies.getNinaMessageImage.mockResolvedValue({
      id: 'imgLIVE00001',
      messageId: 'msgOLD000001',
      kind: 'generated',
      blobUrl: 'https://blob.example/nina/u1/selfie-2.jpg',
      pathname: 'nina/u1/selfie-2.jpg',
      description: 'she is on the pier',
      isReference: false,
      sortOrder: 0,
      width: 1024,
      height: 1536,
      bytes: 240_000,
      prompt: null,
      createdAt: new Date('2026-08-02T09:00:00Z'),
    })
  })

  it('never calls the adoption, and adds a reference row instead', async () => {
    const result = await send({ kind: 'image', id: 'imgLIVE00001' })

    expect(result.ok).toBe(true)
    expect(spies.adoptNinaMessageImage).not.toHaveBeenCalled()
    expect(insertedRow()).toMatchObject({
      messageId: RUNNER_MESSAGE_ID,
      pathname: 'nina/u1/selfie-2.jpg',
      isReference: true,
    })
  })
})

describe('the race is not a special case', () => {
  beforeEach(() => {
    spies.getNinaMessageImage.mockResolvedValue({
      id: 'imgORPHAN001',
      messageId: null,
      kind: 'generated',
      blobUrl: 'https://blob.example/nina/u1/selfie-1.jpg',
      pathname: 'nina/u1/selfie-1.jpg',
      description: null,
      isReference: false,
      sortOrder: 0,
      width: null,
      height: null,
      bytes: null,
      prompt: null,
      createdAt: new Date('2026-08-01T09:00:00Z'),
    })
    /* The row gained a message between the read and the UPDATE, so `message_id IS NULL` matched
     * nothing. */
    spies.adoptNinaMessageImage.mockResolvedValue(null)
  })

  it('falls back to a reference row rather than losing the photograph', async () => {
    const result = await send({ kind: 'image', id: 'imgORPHAN001' })

    expect(result.ok).toBe(true)
    expect(spies.adoptNinaMessageImage).toHaveBeenCalledTimes(1)
    expect(insertedRow()).toMatchObject({ isReference: true })
  })
})

describe('a pointer that is not his is still a refusal, not a text-only send', () => {
  it('refuses the whole send when the image id resolves to nothing', async () => {
    spies.getNinaMessageImage.mockResolvedValue(null)
    const result = await send({ kind: 'image', id: 'imgNOTHIS001' })

    expect(result.ok).toBe(false)
    expect(spies.insertNinaMessages).not.toHaveBeenCalled()
    expect(spies.adoptNinaMessageImage).not.toHaveBeenCalled()
    expect(spies.insertNinaMessageImages).not.toHaveBeenCalled()
  })
})
```

**Impact:** none on shipped code. Note the fixture ids are all exactly 12 symbols of
`[0-9A-Za-z_-]`, because `sendNinaMessage` runs `isValidId` on `attachExisting.id` and on
`sessionId` before anything else (`lib/id.ts`); a 13-character fixture would refuse and every
assertion would pass for the wrong reason.

### Step 12: format only what this phase touched

**File:** the five files above
**Change:** `npx prettier --write` on the exact list. **Do not run `npm run format`** — it is
repo-wide, and a concurrent phase's files would be reformatted into this phase's commit.

**Code:**

```bash
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && npx prettier --write \
  lib/nina/queries.ts \
  lib/nina/actions.ts \
  lib/admin/chatPhotoActions.ts \
  tests/nina.chatPhotoUniqueness.test.ts \
  tests/nina.chatPhotoAdoption.test.ts
```

**Impact:** a clean `npm run format:check` for these files without touching anyone else's.

## Verification

**Prerequisite:** Phase 1's commit must be on the branch. Check it before anything else — this phase
does not compile without it:

```bash
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && \
  grep -n "is_reference" lib/db/schema.ts && ls drizzle/0009_*.sql
```

If either is missing, stop. Do not add the column yourself (plan invariant 3), and do not run
`npm run db:generate`.

**Dependencies:** `node_modules` was present in this worktree at planning time. Confirm and install
only if it is not:

```bash
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && \
  ls node_modules/.bin/vitest >/dev/null 2>&1 || npm install
```

**Build:** `cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && npm run typecheck`
(`next typegen && tsc --noEmit`)

**Lint:** `cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && npm run lint`

**Tests:**

```bash
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && \
  npx vitest run tests/nina.chatPhotoUniqueness.test.ts tests/nina.chatPhotoAdoption.test.ts
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness && npm test
```

**Manual check:** none is required, and none is possible from this phase alone — `/admin/photos`
cannot show the difference until phase 3 has stamped the rows that already violate R2/R3. What CAN be
read off the source, and is worth reading:

- `grep -c "isReference" lib/nina/queries.ts lib/nina/actions.ts lib/admin/chatPhotoActions.ts` —
  **6, 1, 2** matching lines and no more. In `queries.ts`: the `NinaImageRow` field, the
  `NinaImageInsert` field, the `imageColumns` entry, the insert default, the scope predicate, the
  replace WHERE. In `actions.ts`: only `isReference: true`, in the fallback. In
  `chatPhotoActions.ts`: only `existing.isReference` and `row.isReference`, the two guards. A
  seventh line in `queries.ts` or a second in `actions.ts` means a writer or a reader was added that
  this phase did not plan.
- `grep -n "adoptableId" lib/nina/actions.ts` — four lines: the return-type field, the avatar
  branch's `null`, the image branch's conditional, and the send block's test. Nowhere else; it is a
  module-private field.
- `grep -rn "is_reference" lib/nina/queries.ts` returns nothing. The column is only ever named
  through drizzle.
- `git diff --stat` names exactly the **five** files in the Files table — `lib/nina/queries.ts`,
  `lib/nina/actions.ts`, `lib/admin/chatPhotoActions.ts`,
  `tests/nina.chatPhotoUniqueness.test.ts`, `tests/nina.chatPhotoAdoption.test.ts` — and nothing
  under `drizzle/`, `lib/db/`, `scripts/`, `app/` or `components/`.
- `grep -c "loadPhotoCarrier\|deleteNinaMessage" lib/admin/chatPhotoActions.ts` is unchanged from
  what Phase 1 left. If this phase's diff touched Phase 1's carrier block, the 9b guard was pasted
  as a whole function instead of inserted.

**Exit criteria:**

1. `generatedChatPhotoScope` is `user_id AND kind = 'generated' AND is_reference = false`, and both
   `listNinaChatPhotos` and `countNinaChatPhotos` read it unchanged.
2. `adoptNinaMessageImage` exists, is owner-scoped, carries `message_id IS NULL`, and has
   `created_at` and `is_reference` in neither its SET nor its `returning` mutation.
3. Sending with an `avatar` pointer writes exactly one row and it has `is_reference = true`.
4. Sending with an `image` pointer at an orphan issues exactly one UPDATE and zero INSERTs on
   `nina_message_images`.
5. Sending with an `image` pointer at a live row issues zero UPDATEs and one reference INSERT.
6. `replaceChatPhotoAction` and `removeChatPhotoAction` each refuse a reference row with a sentence,
   before they read or delete anything.
7. `lib/nina/imagerun.ts`, `lib/nina/actions.ts:534` and `lib/admin/chatPhotoActions.ts:206` are
   unchanged at their `insertNinaMessageImages` call sites.
8. `npm run typecheck`, `npm run lint`, `npm test` green.

## Handoffs

- **Phase 3 (the backfill) consumes what this phase defines.** `is_reference` and the predicate above
  are its contract: it stamps `is_reference = true` on (a) chat rows whose `pathname`/`blob_url`
  matches a `nina_avatars` row of the same user, and (b) every row but the oldest of each
  same-`pathname` group. Nothing here classifies an existing row, and nothing here runs against
  production. **Until phase 3 has been applied, `/admin/photos` still lists the album carry-overs and
  the duplicates that were written before today** — this phase stops the bleeding, phase 3 cleans the
  floor. Also inherited unchanged: `scripts/blob-reap.mjs` must not be run against `nina/` before
  phase 3 lands (plan Scope, out of scope).
- **Phase 1 owns the null-`messageId` half of `removeChatPhotoAction`** (`:276-288`) and
  `isNinaPhotoCarrierMessage`'s caller. This phase inserts its guard above that block and touches
  nothing inside it. If Phase 1's rewrite moved the block, the guard still belongs immediately after
  the `row == null` check.
- **`deleteNinaMessageImage` (`:1699`) gets no `is_reference` predicate, deliberately.** Its one
  caller now refuses a reference row before reaching it, and — unlike `updateNinaChatPhotoBlob` —
  there is no pre-existing `kind` predicate in that DELETE to mirror. Adding one would be inventing a
  precedent inside a statement whose whole subject is removal, on a phase whose invariant 2 says
  nothing is deleted. Left as it is, on purpose, and recorded here so it reads as a decision.
- **`components/admin/chatPhotoModel.ts` gets no `isReference` field.** No reference row can reach
  that DTO — `generatedChatPhotoScope` is the only read behind `/admin/photos` — so the field would be
  a constant `false` crossing a boundary. Phase 1 owns that DTO for the nullable `messageId`; it
  should not add this.
- **A unique index on `(user_id, pathname)`** stays out of scope (plan Decisions, row 3): DDL that
  cannot be applied while violating rows exist fails on `db:migrate` in production. It is a follow-up
  card to open **after phase 3 has been applied**, not work for this phase.
- **`addChatPhotoAction` writes into whatever session `resolveNinaWriteSession` returns**, and after
  Phase 1 a session delete no longer takes its photographs. Nothing to do; noted because an operator
  reading `/admin/photos` after phase 3 will see rows whose conversation is gone, and that is now
  correct rather than a bug.

## Rollback

`git revert` this phase's commit, alone. Nothing else is needed and nothing is lost:

- **No DDL and no data.** This phase adds no migration and writes no row on any developer machine.
  `is_reference` is Phase 1's column and stays declared, `NOT NULL DEFAULT false`, which is exactly
  Phase 1's state — every row is a collection member again and `/admin/photos` lists what it listed
  before, album carry-overs and duplicates included.
- **Rows written while this phase was live keep their marker.** Any `is_reference = true` row is a
  row that is still a real photograph in its bubble, in `/nina/about` and in `loadNinaContext`
  (invariant 9); after a revert it simply also reappears on `/admin/photos`. That is a cosmetic
  regression to the pre-phase behaviour, not data loss.
- **Adopted rows stay adopted.** An adoption moved a `message_id` and a `sort_order` on a row that
  had none; reverting the code does not un-adopt it, and it should not — the photograph is in a
  conversation, which is what the runner asked for, and `created_at` was never touched so nothing
  re-sorts.
- **Do NOT revert this phase while leaving Phase 3 in place.** Phase 3's stamps are only meaningful
  against the predicate this phase writes; with this phase reverted they mark rows that nothing
  excludes. Revert phase 3 first, or revert neither.
