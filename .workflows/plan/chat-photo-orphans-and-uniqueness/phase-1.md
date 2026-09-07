# Phase 1: Orphan-able photographs: the FK, the migration, and every reader that assumed a message

**Plan set:** `CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md`
**Analysis:** `20260907-201920-P4H0_code_analyzer.md`
**Satisfies:** R1 — deleting a chat session stops deleting the chat photographs. *"just let the photos be"*, the hand-replaced ones included.
**Depends on:** none
**Difficulty:** HARD
**Package:** `lib/db` + `lib/nina`

---

## Goal

After this phase `nina_message_images.message_id` is nullable with `ON DELETE SET NULL`, so the
`nina_chat_sessions -> nina_messages -> nina_message_images` chain stops at the last hop: deleting a
session removes the conversation and leaves every photograph row standing, orphaned, still listed by
`/admin/photos` and still in `/nina/about`'s gallery. `deleteNinaMessage` keeps taking its own
photographs — explicitly, in one transaction, instead of by cascade — so a single-message delete is
observably unchanged. Every type, DTO and renderer that assumed a photograph has a message now
carries `string | null` and degrades, and the two schema headers that argued for the old shape say
what is now true and why it changed.

The `is_reference` column is **declared** here so the set has exactly one migration. Nothing in this
phase reads it, writes it, or puts it in a projection.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no column, no config key, no row, no Blob object.

**Renames:** none.

**Creates:**
- column `nina_message_images.is_reference` `boolean NOT NULL DEFAULT false`
  (`lib/db/schema.ts` — declaration only, no reader and no writer in this phase)
- `drizzle/0009_nina_photo_orphans.sql` (generated)
- `drizzle/meta/0009_snapshot.json` (generated)
- `loadPhotoCarrier` — module-local, non-exported async helper in `lib/admin/chatPhotoActions.ts`
- `NO_MESSAGE_LABEL` — module-local const in `components/admin/ChatPhotoDetail.tsx`
- `tests/nina.photoOrphans.test.ts` (new test file)

**Runner-facing copy changed (one string, Step 18):** `components/nina/SessionRow.tsx`'s
`mode === 'remove'` confirmation. It currently promises that a session delete takes the photographs;
after Step 2 that is false. No other user-visible string in the repo changes, and
`MessageActionsSheet`'s message-delete copy is deliberately left alone because that behaviour is
unchanged.

**Signature changes (type-level, no arity change anywhere):**
- `nina_message_images.message_id`: `NOT NULL ON DELETE CASCADE` -> `NULL ON DELETE SET NULL`
  (`lib/db/schema.ts:1040-1042`)
- `NinaImageRow.messageId`: `string` -> `string | null` (`lib/nina/queries.ts:192`)
- `ImageLike.messageId`: `string` -> `string | null` (`lib/nina/album.ts:195`)
- `NinaGalleryPhoto.messageId`: `string` -> `string | null` (`lib/nina/album.ts:225`)
- `ChatPhoto.messageId`: `string` -> `string | null` (`components/admin/chatPhotoModel.ts:24`)
- `deleteNinaMessage(userId, id)` — **signature and return type unchanged**
  (`Promise<NinaMessageRow | null>`); the body becomes a two-statement `db.batch`.

**Explicitly NOT changed (so phase 2 can rely on it):**
- `NinaImageInsert.messageId` stays `string` (required, non-nullable). No writer in this set
  inserts a null `message_id`; an orphan is only ever *produced* by a delete. This is what keeps
  `insertNinaMessageImages`'s hand-rolled FK check and all four of its call sites untouched.
- `imageColumns` gains **no** `isReference` entry. Phase 2 adds it when it needs to read it.
- `generatedChatPhotoScope`, `insertNinaMessageImages`, `resolveAttachment`, `updateNinaChatPhotoBlob`,
  `deleteNinaMessageImage`, `isBlobPathnameReferenced`, `setNinaMessageImageDescription`,
  `listNinaChatPhotos`, `countNinaChatPhotos` — bodies all unchanged.

**Requires (from earlier phases):** none. This phase is the root of the set.

**Leaves alone (owned by others):**
- `generatedChatPhotoScope` and the collection predicate (Phase 2)
- `insertNinaMessageImages`' parameter shape and any `is_reference` VALUE (Phase 2)
- **`lib/admin/chatPhotoActions.ts`' two `isReference` refusal guards (Phase 2)** — one in
  `replaceChatPhotoAction` after its `kind` guard, one in `removeChatPhotoAction` immediately after
  its `if (row == null) return` line, plus one header paragraph on each. Phase 2 edits this same
  file directly after this phase, so the region split matters: **this phase must not touch
  `replaceChatPhotoAction` at all**, and the paragraph order Step 13c produces in
  `removeChatPhotoAction`'s docstring is what Phase 2 appends after. Phase 2's plan quotes this
  phase's after-state for both.
- `resolveAttachment` / the attached-photo block in `sendNinaMessage` (Phase 2)
- a new `adoptNinaMessageImage` (Phase 2)
- `scripts/` and `package.json` (Phase 3)
- statements 1-3 of `removeNinaSession` — the memory-ledger purge (nobody; untouched by this set)

## Files

| File | Action | What changes |
|---|---|---|
| `lib/db/schema.ts` | modify | `:902-905`/`:918-920` the `session_id` cascade argument rewritten; `:1039-1042` `message_id` nullable + `set null` + its comment rewritten; `is_reference` declared after `:1054` |
| `drizzle/0009_nina_photo_orphans.sql` | create (generated) | `DROP NOT NULL`, FK drop+add as `set null`, `ADD COLUMN is_reference` |
| `drizzle/meta/0009_snapshot.json` | create (generated) | snapshot |
| `drizzle/meta/_journal.json` | modify (generated) | the `idx: 9` entry |
| `lib/nina/queries.ts` | modify | `:192` nullable `messageId`; `:810-812`/`:845-849` `removeNinaSession` header; `:1295-1298` §4c banner; `:1346-1383` `deleteNinaMessage` header + body; `:3172` one docstring line |
| `lib/nina/album.ts` | modify | `:195`, `:225` nullable; `:298-302` `galleryPhotos` docstring |
| `app/nina/page.tsx` | modify | `:341` a null guard so the Map stays keyed by `string` |
| `components/admin/chatPhotoModel.ts` | modify | `:20-26` `ChatPhoto.messageId` nullable + its doc |
| `components/admin/ChatPhotoDetail.tsx` | modify | `:136-141` render an orphan instead of passing `null` to `title=` |
| `lib/admin/chatPhotoActions.ts` | modify | module header, `addChatPhotoAction` doc, `removeChatPhotoAction` null-carrier branch, new `loadPhotoCarrier` helper |
| `lib/nina/messageActions.ts` | modify | `:146-147` comment: the rows go by an explicit delete now, not a cascade |
| `components/nina/SessionRow.tsx` | modify | `:298-299` the delete confirmation stops threatening the photographs, + one new paragraph; `:63` the R11 header argument (Step 18) |
| `components/nina/NinaJobActions.tsx` | modify | `:17-18` comment only — stops citing "two cascades" for the session delete (Step 18) |
| `components/nina/ChatScreen.tsx` | modify | `:1166` comment only — the mechanism behind a MESSAGE delete's photo removal; the copy and behaviour are unchanged (Step 18) |
| `tests/db.schema.nina.test.ts` | modify | `:145-150` and `:346-359` — `set null`, nullable, and the new column |
| `lib/nina/album.test.ts` | modify | one added case: a null `messageId` survives `galleryPhotos` |
| `tests/nina.photoOrphans.test.ts` | create | R1's exit test: session delete touches no image row; message delete takes its own, images first |

**Verified as needing NO change** (read, confirmed, listed so the executor does not go looking):
`app/admin/photos/page.tsx` (the mapping `messageId: row.messageId` at `:83` widens with the DTO and
still compiles), `components/admin/ChatPhotoGrid.tsx` (renders no message id),
`components/nina/NinaAboutScreen.tsx` (`toCell` reads `id`/`url`/`label` only —
`NinaGalleryPhoto.messageId` has **no component consumer today**; the deep-link affordance the field
was carried for was never built, so making it nullable reaches no JSX),
`app/nina/about/page.tsx` (its only image line is `gallery={galleryPhotos(images)}` at `:99` — it
never names `messageId`, so the widened type flows straight through it),
`lib/admin/chatPhotos.ts` (`isNinaPhotoCarrierMessage` is typed
`(message: { role: string; body: string })` at `:274` — it never sees a `messageId`, so only its
CALLER moves, in Step 13d; the pathname grammar beside it is untouched too),
`lib/nina/actions.ts` (both `insertNinaMessageImages` call sites still pass a real
`runnerMessageId`), `scripts/nina-image-worker.ts` (raw SQL insert with a real message id),
`replaceChatPhotoAction` (never touches `messageId`; already correct on an orphan because
`updateNinaChatPhotoBlob` addresses the row by `(user_id, id)` — and **phase 2 adds a guard and a
header paragraph to this function, so this phase must leave it byte-identical**).

> **RECONCILED — the two entries above that name a file rather than a symbol close analysis impact
> points 5 and 8 by name.** The analysis assigned `app/nina/about/page.tsx` + the gallery deep link
> (point 5) and `lib/admin/chatPhotos.ts` (point 8) to this phase; both were read and both need no
> edit. They are listed here rather than left out so that no impact point in
> `20260907-201920-P4H0_code_analyzer.md` is unowned, and so that a later phase cannot claim them.

---

## Implementation Steps

### Step 1: Rewrite the `nina_messages.session_id` cascade argument

**File:** `lib/db/schema.ts:902-905` and `:918-920`
**Change:** Two paragraphs inside the `sessionId` docstring currently state destroying the
photographs as a *requirement* of R11. That is the sentence the user measured as a bug. Replace the
first paragraph, and amend the third so it stops claiming `deleteNinaMessage` is unchanged by the
FK.

Replace lines 902-905 (the block that begins `* **Cascade, and it is a requirement rather than a
detail (R11).**` and ends `* behind those image rows (the rows go, the bytes stay, exactly as for a
deleted message).`) with:

```ts
     * **Cascade, and it is a requirement rather than a detail (R11) — but it now stops one hop
     * short.** Removing a session must take its messages, and Postgres chains that from one DELETE.
     * What it must NOT take any more is their PHOTOGRAPHS. This comment used to say the opposite:
     * *"and through `nina_message_images.message_id`'s cascade their image rows"*, stated as part of
     * what R11 asked for. The runner measured that as loss — *"photos collection that were
     * painstakingly generated by llm, will be deleted if user delete chat session … just let the
     * photos be"*, and separately for the photographs he had replaced by hand in `/admin/photos`,
     * which are the same rows with new bytes under them (`updateNinaChatPhotoBlob`). So
     * `nina_message_images.message_id` is `ON DELETE SET NULL` and nullable, and that column's own
     * comment carries the full argument. The chain is: session -> messages (cascade) -> image rows
     * ORPHANED, not deleted.
     *
     * What this delete still deliberately does NOT take: the Blob objects behind those image rows.
     * That used to be a note about bytes outliving rows; now the rows outlive the conversation too,
     * which is the point.
```

Then replace lines 918-920 (the paragraph beginning `* The old sentence still holds for a deleted
MESSAGE`) with:

```ts
     * The old sentence still holds for a deleted MESSAGE, which is why `deleteNinaMessage` still
     * removes the memory ledger's evidence for nothing and neither memory column gained an FK: an
     * `ON DELETE CASCADE` here could not tell a deleted sentence from a deleted conversation, and
     * only one of those two was ever the problem. The photographs are the same shape of argument
     * with the same answer — a deleted BUBBLE still takes its photographs and a deleted
     * CONVERSATION does not, the FK cannot tell those apart either, so the preserving behaviour
     * lives on the FK and the deleting behaviour lives inside `deleteNinaMessage` as an explicit
     * statement.
```

**Impact:** Comment only. No generated SQL, no behaviour.

---

### Step 2: `message_id` becomes nullable with `ON DELETE SET NULL`

**File:** `lib/db/schema.ts:1039-1042`
**Change:** Replace the one-line comment and the three-line column declaration.

```ts
    /**
     * **The bubble this photograph appears in, or NULL because it has outlived one.**
     *
     * This comment used to read *"Cascade: an image with no message is nothing. Unlike a badge, it
     * is not a fact."* That is now false, and the reversal is the whole of R1. A chat photograph IS
     * a fact: `finishSelfie` spends a model call and real money to make one, `/admin/photos` is a
     * COLLECTION of them with its own name, and the operator replaces them by hand there. A
     * conversation is one place a photograph can be shown, not the reason it exists — so the
     * pointer is optional and `ON DELETE SET NULL` is what makes a deleted session leave the
     * collection intact. The runner's words: *"we must allow 'orphaned' photos in Chat photos
     * collection"*, and *"don't delete existing photos, if user delete a chat session, just let the
     * photos be"*.
     *
     * `SET NULL` rather than `NO ACTION`, because a session delete must not be BLOCKED by its
     * photographs — that would turn one bug into a worse one. `SET NULL` never blocks a delete, so
     * it cannot deadlock the cascade above it either.
     *
     * A deleted single MESSAGE still takes its photographs. That is not this FK's doing any more:
     * `lib/nina/queries.ts`'s `deleteNinaMessage` deletes the rows explicitly in the same
     * transaction, and its header argues why the two delete paths get different answers from one
     * column.
     *
     * NULL is therefore a real, reachable, permanent state and every reader must degrade rather
     * than assume: `NinaImageRow`, `ImageLike`, `NinaGalleryPhoto`, `ChatPhoto` and
     * `removeChatPhotoAction`'s carrier lookup all carry `string | null`. What CANNOT produce a
     * NULL is an insert — `NinaImageInsert.messageId` is still required, because nothing in the app
     * creates a floating photograph on purpose.
     */
    messageId: text('message_id').references(() => ninaMessages.id, { onDelete: 'set null' }),
```

**Impact:** Generates `ALTER COLUMN … DROP NOT NULL` plus an FK drop-and-add. Every consumer of
`NinaImageRow.messageId` becomes a type error until Steps 5, 9-13 land — which is why they are all
in this phase.

---

### Step 3: Declare `is_reference` — declaration only

**File:** `lib/db/schema.ts` — insert between line 1054 (`prompt: text('prompt'),`) and line 1055
(the `sortOrder` comment)
**Change:** Add the column with its own header, on the `pushSubscriptions` precedent
(`lib/db/schema.ts:1509-1512`, *"DECLARATION ONLY — phase 11 owns every write against this
table"*).

```ts
    /**
     * **DECLARATION ONLY — phase 2 of this set owns every read and every write of this column.**
     * It is declared here because a migration per phase is a migration per phase, and because two
     * concurrent `db:generate` runs collide in `drizzle/meta/_journal.json`. Phase 1 adds the
     * column and leaves it `false` on every row, which is exactly today's behaviour: nothing
     * selects on it, nothing sets it, and `imageColumns` does not project it yet.
     *
     * **What it means: "this row re-shows a photograph that already exists elsewhere; it is not
     * itself a member of the Chat photos collection".** Two paths produce one:
     * `resolveAttachment`'s avatar branch, which points a new chat row at a `nina_avatars` object
     * (R2's carry-over), and its image branch when the row it was handed still has a message (R3's
     * duplicate). Phase 2 makes `generatedChatPhotoScope` read
     * `kind = 'generated' AND is_reference = false`, and phase 3 stamps the rows that already
     * violate R2/R3 without deleting any of them.
     *
     * **A boolean, not a nullable FK to the origin row**, and the plan set's Decisions table
     * records why: with `ON DELETE SET NULL` a provenance FK would put the row back INTO the
     * collection the day its origin was deleted, resurrecting the duplicate R3 forbids; with
     * `NO ACTION` it would block an album delete instead. The exclusion has to be permanent, and
     * provenance is not a requirement of any R.
     *
     * **`NOT NULL DEFAULT false` is what lets this be added to a populated table** with no
     * backfill — the `nina_avatars.folder` argument one table over. It also makes the default the
     * honest one: a row nobody has classified is a real member of the collection until phase 3
     * says otherwise.
     *
     * **A reference row is still a real photograph in the conversation.** It is excluded from
     * `/admin/photos` and from nothing else — not from a chat bubble, not from `/nina/about`, not
     * from `loadNinaContext`. That is invariant 9 of the plan set and it is why this is one boolean
     * on the collection predicate rather than a `kind`.
     */
    isReference: boolean('is_reference').notNull().default(false),
```

**Impact:** One `ADD COLUMN` in the migration. Zero behaviour: no query names the column.
`boolean` is already imported in this file (`ninaAvatars.isCurrent` uses it) — do not add an import.

---

### Step 4: Generate the one migration

**File:** `drizzle/0009_nina_photo_orphans.sql`, `drizzle/meta/0009_snapshot.json`,
`drizzle/meta/_journal.json`
**Change:** Run, from the worktree root:

```bash
npm run db:generate -- --name nina_photo_orphans
```

**NEVER hand-edit the result and NEVER rename it** — a renamed migration is skipped silently
because `_journal.json` keys on the tag. If the output is wrong, delete all three artefacts
(`git checkout drizzle/meta/_journal.json` for the third), fix `lib/db/schema.ts`, and regenerate;
diff old against new before deleting anything.

The file must contain exactly these three changes and nothing else. `drizzle-kit` 0.31.10 records
`onDelete` per foreign key in the snapshot (verified in `drizzle/meta/0008_snapshot.json`), so it
does detect the cascade change:

```sql
ALTER TABLE "nina_message_images" DROP CONSTRAINT "nina_message_images_message_id_nina_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "nina_message_images" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD COLUMN "is_reference" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nina_message_images" ADD CONSTRAINT "nina_message_images_message_id_nina_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."nina_messages"("id") ON DELETE set null ON UPDATE no action;
```

Statement order and formatting are `drizzle-kit`'s to choose; the four statements are not. Check
with:

```bash
grep -c 'ON DELETE set null' drizzle/0009_nina_photo_orphans.sql   # must be 1
grep -c 'DROP NOT NULL'      drizzle/0009_nina_photo_orphans.sql   # must be 1
grep -c 'is_reference'       drizzle/0009_nina_photo_orphans.sql   # must be 1
grep -c 'nina_message_images' drizzle/0009_nina_photo_orphans.sql  # must equal the line count
grep -Ei 'DROP COLUMN|DROP TABLE|DELETE FROM|TRUNCATE' drizzle/0009_nina_photo_orphans.sql
```

**STOP and do not commit** if the last grep matches anything, if any table other than
`nina_message_images` is named, or if `ON DELETE set null` is absent (that last one would mean the
differ missed the FK change and the phase needs a decision, not a hand-edit).

`git status --porcelain drizzle/` must then show exactly three paths and no fourth:

```
?? drizzle/0009_nina_photo_orphans.sql
?? drizzle/meta/0009_snapshot.json
 M drizzle/meta/_journal.json
```

(The worktree root already carries untracked `20260907-201920-P4H0_code_analyzer.md`,
`CHAT_PHOTO_ORPHANS_AND_UNIQUENESS_PLAN.md` and `.workflows/plan/…` — scope the check to `drizzle/`
so those do not read as noise.)

Then:

```bash
npm run db:check
```

**Do NOT run `npm run db:migrate`.** Applying it to production is the landing step for the whole
set, not this phase, and the plan index's rollback note is the reason: re-tightening `message_id`
to `NOT NULL` fails once orphaned rows exist.

**Impact:** The one DDL change of the set. `is_reference` exists in the database from here on, and
no other phase may run `db:generate` (plan invariant 3).

---

### Step 5: `NinaImageRow.messageId` becomes nullable

**File:** `lib/nina/queries.ts:190-203`
**Change:** Replace the interface.

```ts
export interface NinaImageRow {
  id: string
  /**
   * NULL when the photograph has outlived its bubble — a session delete now orphans these rows
   * instead of destroying them (R1). See `nina_message_images.message_id`'s own comment for the
   * argument. Every reader downstream degrades: `/nina/about`'s gallery renders the photograph with
   * no way back into a conversation, `/admin/photos` prints "no message", and
   * `removeChatPhotoAction` skips its carrier-message lookup entirely.
   *
   * `NinaImageInsert.messageId` below is deliberately NOT nullable: a NULL here is only ever the
   * residue of a delete, never something a writer asks for.
   */
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
  createdAt: Date
}
```

`imageColumns` (`:503-516`) is **not touched** — it projects the column, and the column's type now
flows through on its own. `NinaImageInsert` (`:205-217`) is **not touched**.

**Impact:** Surfaces every consumer as a type error. Steps 9-13 clear them.

---

### Step 6: `removeNinaSession`'s header records what it now leaves behind

**File:** `lib/nina/queries.ts:810-812` and `:845-849`
**Change:** The body of `removeNinaSession` (its four `db.batch` statements) is **not touched at
all** — that is R1's whole point: the fix is on the FK, and this function becomes correct by not
changing. Only the docstring changes, in two places.

Replace lines 810-812:

```
 * `nina_chat_sessions` -> `nina_messages.session_id` (cascade) -> `nina_message_images.message_id`
 * (cascade, and it predates this feature). Postgres chains both, so the last statement below
 * removes the conversation and its photo ROWS.
```

with:

```
 * `nina_chat_sessions` -> `nina_messages.session_id` (cascade) -> `nina_message_images.message_id`
 * (**`set null`**). Postgres chains the first hop, so the last statement below removes the
 * conversation and its messages — and then STOPS. The photograph rows survive with
 * `message_id = NULL`.
 *
 * **That last sentence is the fix for R1 and this function did not change to get it.** It used to
 * read "removes the conversation and its photo ROWS", and that was the defect the runner reported
 * twice: *"photos collection that were painstakingly generated by llm, will be deleted if user
 * delete chat session"*, and *"i have replaced some photos in Chat photos, but when i delete chat
 * sessions, these photos … got deleted as well"*. The second case is the same bug because
 * `updateNinaChatPhotoBlob` deliberately keeps the row on its original message and swaps the bytes
 * underneath it. Both are cured by the FK, in `lib/db/schema.ts`, which is where a rule about what
 * a delete may reach belongs — not by a statement here.
```

Replace the first bullet at lines 846-849:

```
 *   - the Blob objects those image rows pointed at. The rows go, the bytes stay — the same call
 *     `deleteNinaMessage` makes, and the `reap-orphaned-blobs` skill does not cover the `nina/`
 *     prefix yet. This function does NOT pre-read the image rows to hand their pathnames back: a
 *     return value nothing consumes is a promise this set has not made.
```

with:

```
 *   - **`nina_message_images` — every row of it, now (R1).** The rows are orphaned, not deleted:
 *     they keep their id, their `created_at`, their `pathname` and their Blob object, and they keep
 *     appearing in `/admin/photos` and in `/nina/about`'s gallery. What they lose is the pointer
 *     into a conversation that no longer exists. This function issues no statement against that
 *     table and must not gain one — `nina_message_images` appearing anywhere in this function's
 *     body is the regression, and `tests/nina.photoOrphans.test.ts` asserts its absence from all
 *     four statements.
 *   - the Blob objects behind those rows, which were never this function's to delete and are now
 *     not even orphaned: a live row still points at each one. `isBlobPathnameReferenced` will keep
 *     answering `true` for them, which is what stops `scripts/blob-reap.mjs` reaping a photograph
 *     whose conversation is gone.
```

**Impact:** Comment only. `removeNinaSession`'s generated SQL is byte-identical, which is why
`tests/nina.sessionPurge.test.ts` needs no edit.

---

### Step 7: `deleteNinaMessage` takes its own photographs, explicitly

**File:** `lib/nina/queries.ts:1295-1298` (the §4c banner) and `:1346-1383`
**Change:** First, the banner. Replace lines 1295-1298:

```
 * Two facts they inherit from this phase rather than deciding for themselves: `nina_message_images`
 * cascades from `message_id` so a deleted message takes its photo ROWS (never its blobs), and
 * `reply_to_id` is `ON DELETE SET NULL` so a quote pointing at a deleted message degrades to plain
 * text — which `resolveQuote` already handles.
```

with:

```
 * Two facts they inherit rather than deciding for themselves: a deleted message still takes its
 * photo ROWS (never its blobs) — **no longer by cascade, but by an explicit statement inside
 * `deleteNinaMessage`; see its header** — and `reply_to_id` is `ON DELETE SET NULL` so a quote
 * pointing at a deleted message degrades to plain text, which `resolveQuote` already handles.
```

Then replace the whole of `deleteNinaMessage`, header and body (lines 1346-1383):

```ts
/**
 * R8's delete. Owner-scoped, returning the row as it was so the caller can report exactly which id
 * is gone — and now TWO statements in one transaction rather than one.
 *
 * ── WHY THE SECOND STATEMENT EXISTS (R1 of the orphans set) ───────────────────────────────────
 * `nina_message_images.message_id` used to be `ON DELETE CASCADE`, and this function relied on it:
 * item 2 below read *"`nina_message_images` rows CASCADE away ('an image with no message is
 * nothing')"*. R1 changed the column to `ON DELETE SET NULL`, because a deleted SESSION must leave
 * its photographs standing. That FK fires for both delete paths and cannot tell them apart, so
 * without the statement below a deleted BUBBLE would silently start leaving a floating photograph
 * behind — a visible change to `/admin/photos` that nobody asked for.
 *
 * So the two paths get different answers from one column, and the split is deliberate: the
 * preserving behaviour lives on the FK, where `removeNinaSession` gets it for free by not changing,
 * and the deleting behaviour lives here, in the one function that wants it. The plan set's
 * Decisions table records the ruling and its rung — the runner's raw input names the session delete
 * only, twice, and a bubble whose only content is a photograph is the operator saying "delete this
 * photograph".
 *
 * ── THE ORDER IS LOAD-BEARING ─────────────────────────────────────────────────────────────────
 * Images FIRST. If the message went first, the FK would set every one of its image rows'
 * `message_id` to NULL, and the image delete's `message_id = $2` would then match nothing and leave
 * the photographs behind — the exact regression this function exists to prevent, and it would ship
 * green because the message delete still returns the row. `db.batch` runs the array in order inside
 * ONE transaction (`db.transaction()` throws on the neon-http driver), so there is no window
 * between them and neither can land without the other.
 *
 * `user_id` is in the WHERE of both statements (invariant 4): a message id from a client is a
 * claim, and the image delete must not be reachable with somebody else's message id even though
 * the message delete beside it would refuse.
 *
 * ── THREE THINGS THE DATABASE STILL DOES ON ITS OWN ───────────────────────────────────────────
 *   1. **`reply_to_id` is nulled** on every message that quoted this one — the self-FK's
 *      `ON DELETE SET NULL`. `resolveQuote` already documents a null pointer as "render it as a
 *      plain message", so a quote degrades instead of throwing.
 *   2. **`nina_message_images.message_id` would be nulled** — which is exactly what the first
 *      statement below pre-empts. The Blob bytes are NOT deleted and nothing in this tree reaps
 *      them; `lib/nina/messageActions.ts` logs the orphaned pathnames on the way out so they are at
 *      least findable, and it reads them BEFORE calling this function, which is still the only
 *      order that works.
 *   3. **`nina_memory_slots.source_message_id` and `nina_memory_facts.source_message_id` are left
 *      DANGLING**, because neither is a foreign key and nothing cascades. The only readers collapse
 *      the column to a boolean, and the fact-permission rule uses it to keep in-place editing of a
 *      distilled fact barred — still the right answer once the evidence is gone. A distilled fact
 *      may be true after the sentence that produced it is gone; cascading it away would let one
 *      deleted message quietly rewrite her long-term memory. (A deleted SESSION is the opposite
 *      case and `removeNinaSession` purges the ledger itself.)
 *
 * `nina_turns` is untouched for the reason `updateNinaMessage` gives: deleting a message must not
 * retroactively make her cheaper. `turn_id` has no FK precisely so "an audit pointer must not be
 * able to block a delete", and the inverse holds too.
 *
 * The return value is unchanged — the message row, or `null` for "not yours, or already gone".
 * The image delete's count is deliberately not surfaced: a return value nothing consumes is a
 * promise this set has not made, and `messageActions` already has the pathnames it wanted.
 */
export async function deleteNinaMessage(
  userId: string,
  id: string,
): Promise<NinaMessageRow | null> {
  const [, deleted] = await db.batch([
    /* 1. The photographs on this bubble, while it still exists. See the header on the order. */
    db
      .delete(ninaMessageImages)
      .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.messageId, id))),

    /* 2. And only now the message. `RETURNING` is what makes ownership a fact rather than a
     *    claim — and if it comes back empty, statement 1 selected nothing either, because both
     *    carry the same `user_id`. */
    db
      .delete(ninaMessages)
      .where(and(eq(ninaMessages.userId, userId), eq(ninaMessages.id, id)))
      .returning(messageColumns),
  ])

  return deleted[0] ?? null
}
```

`and`, `eq`, `db`, `ninaMessageImages`, `ninaMessages` and `messageColumns` are all already in scope
in this file — add no imports. The `db.batch` shape with a non-returning `delete` first and a
destructure of the last result is `removeNinaSession`'s, four hundred lines up.

**Impact:** One extra statement per message delete, in the same round trip. Observable behaviour
identical: the photographs still go. `removeChatPhotoAction`'s carrier-message branch and
`addChatPhotoAction`'s undo path both keep working unchanged.

---

### Step 8: One docstring line on `listNinaSelfieJobIdsSince`

**File:** `lib/nina/queries.ts:3172` — inside the docstring, after the paragraph ending
*"`kind = 'generated'` excludes HIS uploads, which share the table."*
**Change:** Append one paragraph. The `innerJoin` on a now-nullable `message_id` silently drops
orphans, and that is correct — but silently.

```
 * ── AN ORPHANED PHOTOGRAPH IS NOT COUNTED, AND THAT IS THE OLD ANSWER ─────────────────────────
 * `message_id` is nullable since R1 of the orphans set, and the `innerJoin` below drops a row whose
 * message is gone. That is not a behaviour change: before R1 the row itself was deleted with the
 * session, so the answer was the same. A photograph whose conversation the runner deleted is not
 * evidence that a promised selfie landed in a conversation.
```

**Impact:** Comment only. No code change; the join already does the right thing.

---

### Step 9: `ImageLike`, `NinaGalleryPhoto` and `galleryPhotos`

**File:** `lib/nina/album.ts:192-199`, `:222-230`, `:296-315`
**Change:** Three edits in one file.

Replace the `ImageLike` block (`:192-199`):

```ts
/** A `nina_message_images` row, structurally. `NinaImageRow` assigns to this. */
export interface ImageLike {
  id: string
  /** NULL once the photograph has outlived its bubble (R1). See `galleryPhotos`. */
  messageId: string | null
  kind: string
  blobUrl: string
  createdAt: Date
}
```

Replace the `NinaGalleryPhoto` block (`:222-230`):

```ts
/** One conversation photo, ready for both the grid and `ViewerPhoto`. */
export interface NinaGalleryPhoto {
  id: string
  /**
   * The bubble to jump to, or NULL for an orphan — a photograph whose conversation was deleted
   * (R1). A consumer that offers "go to the message" must hide the affordance on a NULL rather than
   * link into a session that does not exist. Nothing renders it today; see `galleryPhotos`.
   */
  messageId: string | null
  url: string
  kind: string
  side: NinaPhotoSide
  label: string
}
```

Replace the `galleryPhotos` docstring paragraph at `:296-302` (the one beginning
`* `messageId` is carried because it is the only thing that makes a gallery photo reachable`) with:

```
 * `messageId` is carried because it is the only thing that could make a gallery photo reachable:
 * the viewer's "go to the message" affordance would need phase 8's `?at=` idiom rather than a
 * second scroll mechanism. **It is nullable and, today, unread.** No component consumes it —
 * `NinaAboutScreen`'s `toCell` takes `id`, `url` and `label` — so a NULL reaches no JSX and there is
 * nothing to degrade yet. The field is passed through unchanged, NULL included, so that whoever
 * builds the affordance is handed the orphan case in the type instead of discovering it: an
 * orphaned photograph has no bubble to jump to, and the affordance must be absent rather than
 * broken. `photoSideOf` still decides his-or-hers from `kind` alone, which is what keeps an orphan
 * in the gallery on the correct side of the conversation it no longer belongs to.
```

The body of `galleryPhotos` is **not touched**: `messageId: row.messageId` already forwards whatever
it is given.

**Impact:** Type-only. `lib/nina/album.test.ts:144` keeps passing.

---

### Step 10: `/nina` keeps its photo Map keyed by `string`

**File:** `app/nina/page.tsx:340-353`
**Change:** `photosByMessage` is a `Map<string, …>` and `image.messageId` is now `string | null`, so
`.get()` and `.set()` no longer typecheck. Guard once, at the top of the loop.

Replace the loop (currently lines 341-353) with:

```ts
  for (const image of images) {
    /*
     * `message_id` is nullable since R1 (a deleted session orphans its photographs instead of
     * destroying them), but this list came out of
     * `getNinaMessageImagesForMessages(userId, rows.map(...))`, whose WHERE is
     * `message_id IN (…)` — so every row here matched one of those ids and cannot be an orphan.
     * The guard is for the type system, not for a case that happens: it is what keeps the Map
     * keyed by `string` instead of widening the bubble grouping to accept a photograph that
     * belongs to no bubble.
     */
    if (image.messageId === null) continue
    const group = photosByMessage.get(image.messageId)
    if (group == null) {
      photosByMessage.set(image.messageId, {
        urls: [image.blobUrl],
        ids: [image.id],
        kinds: [image.kind],
      })
    } else {
      group.urls.push(image.blobUrl)
      group.ids.push(image.id)
      group.kinds.push(image.kind)
    }
  }
```

**Impact:** No behaviour change — the `continue` is unreachable given the query that fed the list.
The chat renders exactly as it does today (plan invariant 8).

---

### Step 11: the `/admin/photos` DTO

**File:** `components/admin/chatPhotoModel.ts:19-26`
**Change:** Replace the `id` + `messageId` head of the `ChatPhoto` interface.

```ts
export interface ChatPhoto {
  id: string
  /**
   * The message this photograph hangs off, or NULL because it no longer hangs off one.
   *
   * This doc used to read *"`nina_message_images.message_id` is `NOT NULL` with `ON DELETE CASCADE`
   * and the column's own comment says why — 'an image with no message is nothing' — so this is
   * never absent"*. R1 reversed exactly that: the column is nullable with `ON DELETE SET NULL`, so
   * deleting a chat session leaves the photograph in this collection with no bubble behind it. An
   * ORPHAN is a first-class member of the Chat photos collection and the rail says so in words
   * rather than printing an empty cell.
   *
   * Still non-null for everything phase 3's "add" mints, because `addChatPhotoAction` writes a
   * carrier message first and `NinaImageInsert.messageId` is required.
   */
  messageId: string | null
```

Everything from `url` down is unchanged.

`app/admin/photos/page.tsx:83` (`messageId: row.messageId`) needs **no edit** — the source and the
target widened together. Do not touch that file.

**Impact:** Type-only across the RSC boundary. `null` serialises fine.

---

### Step 12: the rail renders an orphan

**File:** `components/admin/ChatPhotoDetail.tsx:136-141`
**Change:** `title={photo.messageId}` accepts `string | undefined`, not `string | null`, so this is a
real type error and not just a cosmetic one. Add a module-local label and use it in both slots.

Insert the constant immediately above `export function ChatPhotoDetail({` — after the closing `*/`
of the component's docstring at line 35, before the blank line and the export at line 37:

```ts
/**
 * What the Message row shows when the photograph has outlived its bubble (R1). Words, not an empty
 * cell: an orphan is a member of this collection in good standing — a deleted conversation is not a
 * missing value — and an operator looking at a blank field would go hunting for a bug.
 */
const NO_MESSAGE_LABEL = 'None — the conversation was deleted'
```

Then replace the Message row (lines 136-141):

```tsx
        <div className="flex gap-2">
          <dt>Message</dt>
          <dd className="truncate text-ink-2" title={photo.messageId ?? NO_MESSAGE_LABEL}>
            {photo.messageId ?? NO_MESSAGE_LABEL}
          </dd>
        </div>
```

**Impact:** One cell on the admin rail reads a sentence instead of an id for an orphaned row.
Nothing else in the rail depends on `messageId`.

---

### Step 13: `removeChatPhotoAction` stops assuming a carrier message

**File:** `lib/admin/chatPhotoActions.ts` — three doc edits, one branch, one new helper
**Change:**

**13a.** In the module header, the paragraph beginning
`* ── A BLOB OBJECT MAY BE SHARED. NOTHING HERE CALLS `del` DIRECTLY. ──` is unchanged. Insert a new
paragraph immediately **before** `* ── WHAT THIS FILE DOES NOT DO ──`:

```
 * ── A CHAT PHOTOGRAPH MAY HAVE NO MESSAGE (R1) ──────────────────────────────────────────────
 * `nina_message_images.message_id` is nullable with `ON DELETE SET NULL`, so deleting a chat
 * session orphans its photographs instead of destroying them — including the ones the operator
 * replaced through this file, which is the specific loss the runner reported. Every action here
 * works on an orphan: Replace addresses the row by `(user_id, id)` and never reads `message_id`;
 * Add always mints a carrier message, so it cannot produce one; Remove asks whether there is a
 * carrier at all before it asks whether it may delete it.
```

**13b.** In `addChatPhotoAction`'s docstring, replace the paragraph:

```
 * `nina_message_images.message_id` is `NOT NULL` and the column's own comment says why — *"an image
 * with no message is nothing"* — so there is no floating chat photo and "add a photo" is
 * unavoidably "add a message with a photo on it". No third shape is invented.
```

with:

```
 * `message_id` is NULLABLE since R1, so a floating chat photo is now representable — but ADD does
 * not make one, and that is a decision rather than a leftover. NULL is the residue of a delete: the
 * conversation that held the photograph is gone. A photograph the operator adds on purpose has
 * never been in a conversation, and putting it straight into the orphan state would make it
 * invisible in the chat forever with no way back. So "add a photo" is still "add a message with a
 * photo on it", `NinaImageInsert.messageId` is still required, and no third shape is invented.
```

**13c.** Replace the paragraph in `removeChatPhotoAction`'s docstring that begins
`* ── THE EMPTY BUBBLE, RESOLVED ──`, through the sentence ending
`* clauses of that rule live in `isNinaPhotoCarrierMessage` and are argued at its definition.`, with:

```
 * ── THE EMPTY BUBBLE, RESOLVED ──────────────────────────────────────────────────────────────
 * `finishSelfie`'s message exists ONLY to carry the photograph, so removing its last image would
 * leave a caption bubble with no picture in the runner's chat, forever. When this is the last image
 * on such a message, the MESSAGE is deleted and `deleteNinaMessage` removes the image row in the
 * same transaction. (That used to be `message_id`'s `ON DELETE CASCADE` doing the work; since R1
 * the column is `ON DELETE SET NULL` and `deleteNinaMessage` deletes its own image rows explicitly.
 * Same one transaction, same outcome, and the reason for the change is in that function's header:
 * a deleted SESSION must not take the photographs, and one FK cannot tell the two paths apart.)
 *
 * It must NOT delete a RUNNER message that merely carried her re-attached photograph (the R26
 * path): that message is his and carries his text. Both clauses of that rule live in
 * `isNinaPhotoCarrierMessage` and are argued at its definition.
 *
 * ── AND THE PHOTOGRAPH MAY HAVE NO MESSAGE AT ALL (R1) ──────────────────────────────────────
 * An orphan's `row.messageId` is NULL. There is no carrier to look up, nothing to protect from an
 * empty bubble, and no `getNinaMessagesByIds(userId, [null])` to write — so `loadPhotoCarrier`
 * short-circuits to `{ message: null, siblings: [] }` and Remove takes the plain
 * `deleteNinaMessageImage` branch. This is the case the collection is now FULL of: every photograph
 * from every conversation the runner has deleted.
```

**The result is four paragraphs, in this order:** the summary, `── THE EMPTY BUBBLE, RESOLVED ──`,
the *"must NOT delete a RUNNER message"* paragraph, `── AND THE PHOTOGRAPH MAY HAVE NO MESSAGE AT
ALL (R1) ──`, and then the pre-existing `── ROW FIRST, BLOB SECOND ──` paragraph, which this phase
does not touch. **Phase 2 appends one more paragraph AFTER that last one** and changes nothing
above it, so this order is load-bearing across the two phases — do not fold the R1 paragraph into
the one above it, and do not move it below `── ROW FIRST, BLOB SECOND ──`.

**13d.** Replace the body of `removeChatPhotoAction`, from `const row = await getNinaMessageImage`
through the `if (isLastImage && …) { … } else { … }` block, with:

```ts
  const row = await getNinaMessageImage(userId, id)
  if (row == null) return { ok: false, error: 'That photo is not in the collection.' }

  const carrier = await loadPhotoCarrier(userId, row.messageId)
  const isLastImage = carrier.siblings.every((sibling) => sibling.id === id)

  if (isLastImage && carrier.message != null && isNinaPhotoCarrierMessage(carrier.message)) {
    const gone = await deleteNinaMessage(userId, carrier.message.id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  } else {
    const gone = await deleteNinaMessageImage(userId, id)
    if (gone == null) return { ok: false, error: 'That photo is not in the collection.' }
  }
```

Note that `carrier.siblings.every(...)` on the orphan's empty array is `true`, and the
`carrier.message != null` clause is what routes it to the else branch. Both guards are needed; do
not collapse them.

**13e.** Add the helper in the `/* ── The two helpers ── */` section — put it **above**
`releaseChatPhotoBlob`. It is not exported (a `'use server'` module may only export async
functions, and this one has no business being an entry point).

```ts
/**
 * The bubble a photograph sits in, and the photographs beside it — or neither, when there is no
 * bubble.
 *
 * Two reads or none. Since R1 a chat photograph's `message_id` may be NULL, which means the
 * conversation that held it was deleted and the row was orphaned rather than destroyed. In that
 * case there is nothing to look up: an orphan has no carrier message to protect from an empty
 * bubble and no siblings inside a bubble it is not in. Returning the empty answer here rather than
 * branching at the call site is what keeps `removeChatPhotoAction`'s decision — carrier or plain
 * row — one expression, and what makes it impossible to pass a `null` id into an owner-scoped
 * query that would then look like it had refused.
 *
 * `siblings` is EVERY image on that message, including this one; the caller's `isLastImage` test is
 * "they are all me". `getNinaMessagesByIds` and `getNinaMessageImagesForMessages` are both
 * owner-scoped, so a `message_id` read off a row we already proved is his cannot widen anything.
 */
async function loadPhotoCarrier(
  userId: string,
  messageId: string | null,
): Promise<{ message: NinaMessageRow | null; siblings: NinaImageRow[] }> {
  if (messageId === null) return { message: null, siblings: [] }

  const [messages, siblings] = await Promise.all([
    getNinaMessagesByIds(userId, [messageId]),
    getNinaMessageImagesForMessages(userId, [messageId]),
  ])

  return { message: messages[0] ?? null, siblings }
}
```

**13f.** Add the two types to the existing `@/lib/nina/queries` import block (which is already a
multi-line named import at the top of the file). Both are exported from that module
(`NinaMessageRow` at `lib/nina/queries.ts:133`, `NinaImageRow` at `:190`). Append to the same
statement, keeping alphabetical order within it:

```ts
import {
  deleteNinaMessage,
  deleteNinaMessageImage,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  insertNinaMessageImages,
  insertNinaMessages,
  isBlobPathnameReferenced,
  setNinaMessageImageDescription,
  updateNinaChatPhotoBlob,
  type NinaImageRow,
  type NinaMessageRow,
} from '@/lib/nina/queries'
```

**Impact:** Removing an orphaned photograph from `/admin/photos` now works instead of issuing
`getNinaMessagesByIds(userId, [null])`. Removing a photograph that still has a carrier message
behaves exactly as it does today.

---

### Step 14: `messageActions`' comment stops naming a cascade

**File:** `lib/nina/messageActions.ts:146-147`
**Change:** The comment reads:

```
 * `nina_message_images.message_id` cascades, so after the delete those rows do not exist and their
 * `pathname`s — the reaper's future handle, per that column's own note — are unrecoverable. The
```

Replace those two lines with:

```
 * `deleteNinaMessage` deletes this message's `nina_message_images` rows in its own transaction (it
 * used to be `message_id`'s cascade; R1 made the column `ON DELETE SET NULL` so a deleted SESSION
 * stops taking the photographs, and that function's header argues the split). Either way, after
 * the delete those rows do not exist and their `pathname`s — the reaper's future handle, per that
 * column's own note — are unrecoverable. The
```

The `getNinaMessageImagesForMessages` read at `:162` stays exactly where it is: it must run
**before** `deleteNinaMessage`, and it still does.

**Impact:** Comment only.

---

### Step 15: the schema tests

**File:** `tests/db.schema.nina.test.ts:145-151` and `:351-359`
**Change:** Two blocks assert the old cascade. Replace the whole `nina_message_images` describe
(lines 145-151) with:

```ts
describe('nina_message_images', () => {
  it('is its own table with a description column, because phase 13 queries it directly', () => {
    expect(sqlType(schema.ninaMessageImages, 'description')).toBe('text')
    expect(columns(schema.ninaMessageImages).get('description')?.notNull).toBe(false)
  })

  it('message_id is NULLABLE and SETS NULL, so a deleted session orphans a photograph (R1)', () => {
    // The reversal this whole plan set exists for. The column's comment used to read "an image with
    // no message is nothing"; the runner measured that as loss — "photos collection that were
    // painstakingly generated by llm, will be deleted if user delete chat session … just let the
    // photos be". `set null` rather than `no action` because a session delete must not be BLOCKED
    // by its photographs, which would be a worse bug than the one being fixed.
    expect(columns(schema.ninaMessageImages).get('message_id')?.notNull).toBe(false)
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('set null')
  })

  it('declares is_reference NOT NULL DEFAULT false, written by nobody yet', () => {
    // Phase 1 declares it so the set has ONE migration (a second `db:generate` in a parallel phase
    // collides in _journal.json). Phase 2 owns every read and write. `NOT NULL DEFAULT false` is
    // what lets it be added to a populated table with no backfill, and false is the honest default:
    // a row nobody has classified is a real member of the collection.
    expect(sqlType(schema.ninaMessageImages, 'is_reference')).toBe('boolean')
    expect(columns(schema.ninaMessageImages).get('is_reference')?.notNull).toBe(true)
    expect(columns(schema.ninaMessageImages).get('is_reference')?.hasDefault).toBe(true)
    expect(columns(schema.ninaMessageImages).get('is_reference')?.default).toBe(false)
  })
})
```

The four property names above were **measured** against this repo's `drizzle-orm` 0.45.2, not
remembered: for `ninaAvatars.isCurrent` (the same `boolean(...).notNull().default(false)` shape)
`getTableConfig` reports `getSQLType() === 'boolean'`, `notNull === true`, `hasDefault === true` and
`default === false`. Use them as written.

Then replace the second `it` of the `nina_messages.session_id` block (lines 351-359, the one titled
`'CASCADES, which is what makes removing a session take its messages (R11)'`) with:

```ts
  it('CASCADES to the messages — and STOPS at their photographs (R11, then R1)', () => {
    // The cascade takes the messages. It used to chain one hop further through
    // nina_message_images.message_id and destroy the photograph rows, and the schema header stated
    // that as part of what R11 asked for. R1 reversed it: the photographs are orphaned, not
    // deleted, and `removeNinaSession` did not change to get that — the FK did.
    // The Blob bytes are still deliberately left, and are now not even orphaned, because a live row
    // still points at each one. The memory ledger's source_message_id pointers are NOT left: R8
    // made removeNinaSession purge them in the same transaction, without a foreign key — see the
    // schema header and tests/nina.sessionPurge.test.ts.
    expect(fkFor(schema.ninaMessages, 'session_id')?.onDelete).toBe('cascade')
    expect(fkFor(schema.ninaMessageImages, 'message_id')?.onDelete).toBe('set null')
  })
```

**Impact:** These assertions are the schema half of R1's exit criteria.

---

### Step 16: `galleryPhotos` passes a null through

**File:** `lib/nina/album.test.ts` — inside the existing `describe('galleryPhotos', …)`, immediately
after the case at line 143-145
**Change:** Add one case. The `image()` factory at `:34-43` already spreads `Partial<ImageLike>`, so
`image({ messageId: null })` typechecks the moment Step 9 lands and needs no factory change.

```ts
  it('passes an ORPHAN through with a null messageId, so nothing can deep-link into a deleted session (R1)', () => {
    // A session delete now orphans its photographs instead of destroying them. The photograph still
    // belongs in the gallery and still knows whose side it is on; what it has lost is the bubble to
    // jump to, and whoever builds that affordance must get the null rather than a plausible id.
    const [orphan] = galleryPhotos([image({ id: 'i9', kind: 'generated', messageId: null })])
    expect(orphan!.messageId).toBeNull()
    expect(orphan!.id).toBe('i9')
    expect(orphan!.side).toBe('hers')
    expect(orphan!.label).toBe('Foto Nina')
  })
```

**Impact:** Locks the degradation into a unit test rather than an intention.

---

### Step 17: R1's exit test — the two delete paths, in generated SQL

**File:** `tests/nina.photoOrphans.test.ts` (new)
**Change:** Create the file. It uses `installFakeDb`, which records the REAL generated SQL with real
parameter binding and real batching (`tests/support/fakeDb.ts`) — the only way to assert statement
ORDER, which is what makes `deleteNinaMessage` correct. `tests/nina.sessionPurge.test.ts` is the
precedent for the whole shape and is left untouched, because `removeNinaSession`'s SQL does not
change.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readRepoCode } from './support/importGraph'
import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **R1's exit test.** The runner's words were *"don't delete existing photos, if user delete a chat
 * session, just let the photos be"* — twice, the second time about photographs he had replaced by
 * hand in `/admin/photos`, which are the same rows with new bytes underneath them.
 *
 * The property under test is a pair, and the pair is the whole design:
 *
 *   1. a SESSION delete issues no statement against `nina_message_images` at all. The photographs
 *      survive because the foreign key is `ON DELETE SET NULL`, and `removeNinaSession` gets that
 *      by NOT changing — so what a test can assert is the absence of the table from its SQL.
 *   2. a MESSAGE delete still takes its own photographs, now explicitly, and the IMAGES GO FIRST.
 *      Reverse those two statements and the FK nulls the pointers before the image delete looks for
 *      them, which leaves the photographs behind and still returns the deleted message — a
 *      regression that ships green. Order is why this is asserted against generated SQL and not
 *      against a spy.
 *
 * The schema half (nullable, `set null`, `is_reference` declared) lives in
 * `tests/db.schema.nina.test.ts`. The admin half is a source claim and is at the bottom of this
 * file, on `tests/nina.chatPhoto.test.ts`'s pattern: `removeChatPhotoAction` is a `'use server'`
 * export that reaches `requireAdmin`, `next/cache` and `next/server`, and the null-carrier branch
 * is a property of the source rather than of any one rendered scenario.
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

describe('removeNinaSession leaves every photograph standing (R1)', () => {
  it('names nina_message_images in none of its four statements', async () => {
    fake.enqueue([], [], [], [['sessionAAAAA']])
    await q.removeNinaSession('u1', 'sessionAAAAA')

    expect(fake.queries).toHaveLength(4)
    for (const query of fake.queries) {
      expect(query.sql).not.toContain('nina_message_images')
    }
  })

  it('still sends exactly the four statements it always did, session last', async () => {
    // Guards the other direction: "leave the photos be" must not have been implemented by removing
    // the memory purge (R8 of the sessions set) or by reordering the batch.
    fake.enqueue([], [], [], [['sessionAAAAA']])
    await q.removeNinaSession('u1', 'sessionAAAAA')

    const sql = fake.queries.map((query) => query.sql)
    expect(fake.batches).toEqual([4])
    expect(sql[0]).toMatch(/^delete from "nina_memory_facts"/)
    expect(sql[1]).toMatch(/^delete from "nina_memory_slots"/)
    expect(sql[2]).toMatch(/^update "nina_memory_slots"/)
    expect(sql[3]).toMatch(/^delete from "nina_chat_sessions"/)
  })
})

describe('deleteNinaMessage still takes its own photographs (the Decisions table, row 1)', () => {
  it('deletes the image rows FIRST and the message SECOND, in one batch', async () => {
    /* Two empty results for two statements. The return value is not asserted here, so there is no
     * reason to hand `messageColumns` a hand-built row array — thirteen columns' worth of driver
     * mapping is not what this test is about. */
    fake.enqueue([], [])
    await q.deleteNinaMessage('u1', 'ms000000000a')

    const sql = fake.queries.map((query) => query.sql)
    expect(sql).toHaveLength(2)
    expect(fake.batches).toEqual([2])
    expect(fake.queries.every((query) => query.batched)).toBe(true)

    // The order IS the correctness. Message-first would let ON DELETE SET NULL blank the pointers
    // before the image delete looked for them.
    expect(sql[0]).toMatch(/^delete from "nina_message_images"/)
    expect(sql[1]).toMatch(/^delete from "nina_messages"/)
  })

  it('scopes both statements by owner, and the image delete by message (invariant 4)', async () => {
    fake.enqueue([], [])
    await q.deleteNinaMessage('u1', 'ms000000000a')

    for (const query of fake.queries) {
      expect(query.sql).toContain('"user_id" = $')
      expect(query.params).toContain('u1')
      expect(query.params).toContain('ms000000000a')
    }
    expect(fake.queries[0]!.sql).toContain('"message_id" = $')
  })

  it('reports ownership from the MESSAGE delete alone', async () => {
    fake.enqueue([], [])
    await expect(q.deleteNinaMessage('u2', 'ms000000000a')).resolves.toBeNull()
  })
})

describe('the admin collection handles a photograph with no message', () => {
  const ACTIONS = 'lib/admin/chatPhotoActions.ts'

  it('asks for a carrier through the helper that short-circuits on a null', () => {
    // Comments are stripped by readRepoCode, so these are claims about code.
    const source = readRepoCode(ACTIONS)
    expect(source).toContain('loadPhotoCarrier(userId, row.messageId)')
    expect(source).toContain('if (messageId === null) return { message: null, siblings: [] }')
  })

  it('never passes a possibly-null message id straight into an owner-scoped query', () => {
    // The defect this replaces: `getNinaMessagesByIds(userId, [row.messageId])`, which on an orphan
    // asks the database for the message with id NULL and gets back a refusal-shaped empty answer.
    expect(readRepoCode(ACTIONS)).not.toContain('[row.messageId]')
  })

  it('still refuses to delete a bubble it has not proved is a carrier', () => {
    expect(readRepoCode(ACTIONS)).toContain(
      'carrier.message != null && isNinaPhotoCarrierMessage(carrier.message)',
    )
  })
})
```

**Impact:** This file is R1's proof. If the second `describe` ever goes red because the batch has one
statement, `deleteNinaMessage` has silently started leaving photographs behind.

---

### Step 18: the delete confirmation stops threatening the photographs

> **RECONCILED — ASSIGNED GAP.** No planner owned this and it is the most visible consequence of R1
> in the whole set. It is added to phase 1 because phase 1 is the phase that makes the sentence
> false, and because this phase already owns the mirror-image copy change on the admin rail
> (Step 12, `NO_MESSAGE_LABEL`). Phases 2 and 3 both exclude `components/**`.

**File:** `components/nina/SessionRow.tsx:296-306`, plus two stale comments named at the end of this
step.

**Change:** The confirmation panel the runner actually reads before deleting a chat says, at
`:298-299`:

```
            Hapus “{session.title}”? Semua pesan di chat ini dan semua foto di dalamnya ikut
            terhapus, permanen — tidak bisa dibatalkan.
```

*"All messages in this chat and all photos in it are deleted too, permanently — cannot be undone."*
After Step 2 that is **false, in the exact direction the runner complained about**: he is told the
photographs will be destroyed at the moment he is deciding, when they will now survive. Leaving it
would make the fix invisible to the one person who asked for it, and would keep deterring him from
deleting sessions — which is the behaviour R1 exists to make safe. It is not a doc nit; it is R1's
user-facing half.

Replace the red paragraph, and add a second paragraph immediately after it. Everything else in the
`mode === 'remove'` block — the `active` note, the error line, the two buttons and their order — is
**unchanged**:

```tsx
        <div className="mt-2 rounded-card border border-red/40 bg-paper-2 p-3.5">
          <p className="max-w-[54ch] text-[13px] leading-[1.5] font-semibold text-red">
            Hapus “{session.title}”? Semua pesan di chat ini ikut terhapus, permanen — tidak bisa
            dibatalkan.
          </p>
          {/* R1. This used to read "…dan semua foto di dalamnya ikut terhapus", and that sentence
              was the bug as the runner experienced it: the copy threatened the photographs and the
              cascade then took them. `nina_message_images.message_id` is `ON DELETE SET NULL` now,
              so the photographs outlive the conversation. Saying so here, in the panel he is
              reading while he decides, is the difference between a fix and a fix nobody can see —
              and it stays a SEPARATE, non-red paragraph so the red text keeps naming only what is
              actually lost. "Chat photos" is the name `/admin/photos` uses for the collection
              (`CHAT_PHOTO_COLLECTION_LABEL`), which is where he goes looking for them. */}
          <p className="mt-2 max-w-[54ch] text-[12px] leading-[1.5] font-medium text-ink-2">
            Fotonya tidak ikut terhapus — semua foto di chat ini tetap tersimpan di koleksi Chat
            photos.
          </p>
```

Then the header's R11 paragraph at `:63`, which argues for the confirmation, states the old
behaviour as its justification. Replace the sentence

```
 * Removing a chat hard-deletes its messages and, through the cascades, their photo rows. There is
```

with

```
 * Removing a chat hard-deletes its messages. There is
```

and append to that same paragraph, after the four numbered properties:

```
 * Since R1 of the orphans set it does NOT delete their photo rows —
 * `nina_message_images.message_id` is `ON DELETE SET NULL`, so the photographs are orphaned and
 * stay in the Chat photos collection. Property 2 below ("the copy names the chat and says what
 * goes") is why that had to be a copy change and not only a schema change: a confirmation that
 * over-states the loss is as wrong as one that under-states it, and this one over-stated it in the
 * exact way the runner reported.
```

**Two comment-only follow-ons in the same step**, because they are the other two places in
`components/` that assert the cascade and would otherwise be left claiming something untrue:

- `components/nina/NinaJobActions.tsx:17-18` — *"that control hard-deletes a conversation and,
  through two cascades, its photographs"*. Change to *"hard-deletes a conversation and its
  messages — its photographs survive it since R1"*. The paragraph's actual point (**"None of that
  transfers here"**) is unaffected.
- `components/nina/ChatScreen.tsx:1166` — *"disclose that the photos go with the message
  (`nina_message_images` cascades)"*. The BEHAVIOUR here is unchanged and must stay unchanged (a
  MESSAGE delete still takes its photographs — plan Decisions, row 1), so **`MessageActionsSheet`'s
  copy is not touched**; only the mechanism in parentheses is stale. Change to
  *"(`deleteNinaMessage` deletes them explicitly; the FK is `set null` since R1)"*.

**Impact:** the one runner-visible change of this phase, and it is the point of the phase.
`components/nina/SessionRow.tsx` has no test asserting this copy (checked: no file under `tests/`
references `SessionRow`), so nothing goes red. `npm run lint` and `npm run format:check` cover the
JSX.

---

## Verification

The worktree at `/home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness` was
checked and is **fully provisioned**: `.env.local` is present (4355 bytes) and `node_modules` holds
400 packages including `next`, `vitest` and `drizzle-kit` — `npx vitest run lib/nina/album.test.ts`
passes 18/18 there today. So `npm install` is **not** required. Confirm before starting anyway,
because a fresh worktree of this repo has neither and then every command below dies on `lib/env.ts`
validating fourteen variables at load:

```bash
cd /home/miftah/.worktrees/run-insights/chat-photo-orphans-and-uniqueness
ls -d node_modules/next node_modules/vitest node_modules/drizzle-kit && ls .env.local || npm install
```

**Build:**

```bash
npm run typecheck
```

`typecheck` runs `next typegen` first and that is what proves the `PageProps<'/admin/photos'>` type
in `app/admin/photos/page.tsx`. A bare `tsc --noEmit` does not, so do not substitute it.

**Migration:**

```bash
npm run db:check
```

Plus the five greps in Step 4 over `drizzle/0009_nina_photo_orphans.sql`. **Do not run
`npm run db:migrate`** — see Step 4.

**Tests:**

```bash
npm test
npx vitest run tests/nina.photoOrphans.test.ts tests/db.schema.nina.test.ts tests/nina.sessionPurge.test.ts lib/nina/album.test.ts tests/admin.chatPhotos.test.ts
```

`tests/nina.sessionPurge.test.ts` and `tests/admin.chatPhotos.test.ts` must pass **unedited**. If
either needs a change, something outside this phase's contract moved.

**Lint / format:**

```bash
npm run lint
npm run format:check
```

`npm run format` is repo-wide — if it is needed, run it and commit by pathspec rather than adding
everything it touched.

**Manual check** (optional, and only against a database that has had migration 0009 applied — which
is not this phase's job):

1. `/admin/photos` lists a photograph. Note its id and its Message cell.
2. Delete the chat session that photograph appeared in, from `/nina`'s sidebar. **Read the
   confirmation panel before confirming** (Step 18): the red line names the messages only, and the
   line under it says the photographs stay in the Chat photos collection.
3. `/admin/photos` still lists it, in the same position (`created_at` is untouched), and its Message
   cell now reads *"None — the conversation was deleted"*.
4. `/nina/about`'s gallery still shows it, on Nina's side.
5. Delete a single photograph bubble from the chat instead. That photograph leaves both surfaces —
   unchanged behaviour.

**Exit criteria:**

- `removeNinaSession` issues no statement against `nina_message_images`, asserted over generated
  SQL, and its four statements are otherwise byte-identical to today's.
- `deleteNinaMessage` issues two batched statements, images first, both owner-scoped, and its
  observable behaviour is unchanged.
- `nina_message_images.message_id` is nullable with `onDelete: 'set null'`;
  `nina_message_images.is_reference` exists as `boolean NOT NULL DEFAULT false` and is named by no
  query in the repo.
- Exactly one new migration, `0009`, touching only `nina_message_images`, containing no `DROP
  COLUMN`, no `DELETE`, and no `TRUNCATE`.
- `typecheck`, `lint`, `format:check`, `test` and `db:check` all green.
- No occurrence of the string `an image with no message is nothing` remains in the repo outside
  `.workflows/` and the two plan documents:
  `grep -rn "an image with no message is nothing" lib app components tests scripts` returns nothing.
  (It is at `lib/db/schema.ts:1039` and `lib/nina/queries.ts:1355` today — Steps 2 and 7.)
- **No surface claims a session delete takes the photographs.**
  `grep -rn "semua foto di dalamnya ikut" components` returns nothing, and
  `grep -rn "cascade" components/nina/SessionRow.tsx components/nina/NinaJobActions.tsx` returns
  nothing. `components/nina/SessionRow.tsx`'s confirmation names what is lost and, separately, that
  the photographs are not.

## Handoffs

**To Phase 2 (R2, R3, R4) — everything about the new column's meaning:**
- **The TypeScript spelling is fixed here and Phase 2 depends on it verbatim:** the drizzle property
  is `isReference` for column `is_reference`, declared
  `isReference: boolean('is_reference').notNull().default(false)` in Step 3. Phase 2 names
  `ninaMessageImages.isReference` and `row.isReference` at roughly seven sites and Phase 3's SQL
  names `is_reference`; if this declaration is spelled any other way, all of them rename with it.
  Do not deviate.
- `imageColumns` / `NinaImageRow` gain an `isReference` entry — **in Phase 2, not here.** Phase 1
  deliberately does not add it, because a projected column with no reader is a column a reviewer
  cannot check. Phase 2 needs it to make admin remove/replace refuse a reference row, so Phase 2
  adds it, positioned **between `sortOrder` and `createdAt`** in both the interface and the
  projection — the column's own position in the table, and therefore the position every `arrayMode`
  row mapping and every `.returning(imageColumns)` will use. Phase 2's test fixtures are built on
  that order, so it is stated in both plans rather than in one.
- **This split is deliberate and both plans state it identically.** Phase 1 declares the column and
  nothing else; Phase 1's `imageColumns` (`:503-516`) and `NinaImageRow` (`:190-203`) are edited by
  Step 5 for `messageId` only, and Phase 2's Step 1 and Step 2 replace the same two blocks to add
  `isReference` on top of Phase 1's `messageId: string | null`. The two edits are on different lines
  of the same blocks and compose; Phase 2 quotes Phase 1's `messageId: string | null` in its own
  replacement, which is what makes the composition explicit rather than hoped for.
- `generatedChatPhotoScope` gains `eq(ninaMessageImages.isReference, false)`.
- `insertNinaMessageImages` / `NinaImageInsert` gain an optional `isReference` defaulting to false.
  Phase 1 leaves `NinaImageInsert.messageId` non-nullable on purpose; if Phase 2's adopt-or-reference
  ever needs to INSERT a null `message_id`, that is a contract change Phase 2 must declare, and the
  reconciler should know it was not left implicitly open.
- `adoptNinaMessageImage(userId, imageId, { messageId, sortOrder })` with
  `… AND message_id IS NULL` in the WHERE. Phase 1 makes that predicate expressible and writes
  nothing that uses it. `isNull` is **already** imported in `lib/nina/queries.ts`
  (`lib/nina/queries.ts:11`, from `drizzle-orm`), so Phase 2 adds no import for it.
- `resolveAttachment` and the attached-photo insert at `lib/nina/actions.ts:564-576`.

**To Phase 3 (the backfill):** `scripts/`, `package.json`, and the readme line. Phase 1 touches none
of them.

**Left for a later card, deliberately not done here:**
- **The `/nina/about` "go to the message" affordance does not exist.** `NinaGalleryPhoto.messageId`
  has no component consumer — `NinaAboutScreen`'s `toCell` reads `id`, `url` and `label` only. The
  field has been carried since F33 phase 13 for an affordance nobody built. Phase 1 makes it
  nullable and documents the orphan case in the type and the docstring so that whoever builds it is
  handed the case; building the affordance is not R1 and is not in scope.
- **A unique index on `(user_id, pathname)`** — refused in the plan set's Decisions table: DDL that
  cannot be applied while violating rows exist is DDL that fails on `db:migrate` in production, and
  a hand-written pre-clean `DELETE` inside a generated migration is what invariant 3 forbids.
  Revisit as a follow-up card once Phase 3 has been applied.
- **Reaping `nina/` Blob objects.** `scripts/blob-reap.mjs` is untouched and
  **must not be run against `nina/` until Phase 3 has been applied** — the bytes of every photograph
  already lost to this bug are still in the store, unreferenced, and a reap would make R1
  retroactively unrecoverable. That is the plan set's out-of-scope note and it is repeated here
  because this is the phase somebody reads while thinking about orphans.
- **Surfacing the orphan state in `/admin/photos`' grid** (a badge on the tile, a filter). Only the
  detail rail says anything. Not asked for.

## Rollback

This phase alone, before any of it has been applied to a database:

```bash
git revert <phase-1 commit>
```

or, if it is not yet committed:

```bash
git checkout -- lib/db/schema.ts lib/nina/queries.ts lib/nina/album.ts lib/nina/messageActions.ts \
  app/nina/page.tsx components/admin/chatPhotoModel.ts components/admin/ChatPhotoDetail.tsx \
  components/nina/SessionRow.tsx components/nina/NinaJobActions.tsx components/nina/ChatScreen.tsx \
  lib/admin/chatPhotoActions.ts tests/db.schema.nina.test.ts lib/nina/album.test.ts
rm -f drizzle/0009_nina_photo_orphans.sql drizzle/meta/0009_snapshot.json tests/nina.photoOrphans.test.ts
git checkout -- drizzle/meta/_journal.json
```

Nothing depends on this phase at the point it lands, and `main` is unaffected until the branch
merges.

**After migration 0009 has been applied to a database, the code rollback is clean but the DDL
rollback is NOT.** Re-tightening `message_id` to `NOT NULL` **fails while orphaned rows exist**, so a
rollback taken after any session has been deleted needs those rows re-parented or removed first —
and removing them is the data loss this whole plan exists to stop. Say it out loud now rather than
discovering it on a bad night: the honest recovery after a session delete is to roll the CODE back
and leave the column nullable. A nullable column with `ON DELETE SET NULL` is harmless to code that
never produces a NULL; the reverted `deleteNinaMessage` would then rely on a cascade that is no
longer declared and would start leaving a floating row per deleted bubble, so if the code is
reverted while the DDL stands, revert the FK to `cascade` on its own and leave `DROP NOT NULL` and
`is_reference` in place.
