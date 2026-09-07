# Phase 2 — The carrier marker: a photo bubble free text cannot hide

**Plan set:** `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md`
**Satisfies:** R1, R2
**Depends on:** —
**Package:** `lib/db` + `lib/nina` + `lib/admin` + `scripts`
**Difficulty:** NORMAL
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-caption-from-image` (branch `feature/nina-photo-caption-from-image`)

---

## What this phase is, and why it must land before any caption is freed

`isNinaPhotoCarrierMessage` (`lib/admin/chatPhotos.ts:274-275`) is today:

```ts
return message.role === 'nina' && NINA_IMAGE_CAPTIONS.includes(message.body)
```

`removeChatPhotoAction` uses it to decide whether taking the last photograph off a message should
take the message with it. Its own docstring states why the caption clause is there:
*"`role === 'nina'` ALONE would delete a real sentence of hers the day some later path attaches a
photograph to one."*

**Phases 3 and 4 make the caption free text, which makes that clause return `false`** — and Remove
then leaves exactly the empty caption bubble the predicate exists to prevent. So the identifier has
to stop being the words and start being a fact about the row, and it has to happen **before** the
words change.

**No caption text changes in this phase.** It is the schema half: additive, behaviour-neutral, and
shippable on its own.

## Files

| File | Change |
|---|---|
| `drizzle/00NN_nina_message_photo_only.sql` + `drizzle/meta/*` | **generated** — see Step 1 |
| `lib/db/schema.ts` | edit — the column |
| `lib/nina/queries.ts` | edit — `NinaMessageInsert.photoOnly`, `messageColumns`, `NinaMessageRow` |
| `lib/admin/chatPhotos.ts` | edit — the predicate reads the marker |
| `lib/admin/chatPhotoActions.ts` | edit — `addChatPhotoAction` sets it (one field) |
| `lib/nina/imagerun.ts` | edit — `finishSelfie` sets it (one field) |
| `scripts/nina-image-worker.ts` | edit — the raw INSERT sets the column |
| `tests/admin.chatPhotos.test.ts` | edit — predicate cases |

**Do not touch:** `lib/nina/imagefail.ts`, `lib/nina/caption.ts`, `lib/nina/vision.ts`,
`lib/nina/prompts/*`, `scripts/check-llm-payload-boundary.mjs`, `tests/nina.imagefail.test.ts`,
`tests/nina.caption.test.ts`, `lib/nina/vision.test.ts`. Those are phase 1's, running concurrently.

---

## Step 1 — The migration. GENERATE it. Do not write it and do not number it.

```bash
cd /home/miftah/.worktrees/run-insights/nina-photo-caption-from-image
# .env.local was written into this worktree at setup; drizzle.config.ts loads lib/env.ts, which
# validates 14 variables AT MODULE LOAD, so without it this command dies before your code runs.
npm run db:generate -- --name nina_message_photo_only
npm run db:check
```

Then **read the emitted `.sql`** and confirm it is exactly the additive statement below — a
`drizzle-kit` diff against a schema you have also just edited can emit more than you meant:

```sql
ALTER TABLE "nina_messages" ADD COLUMN "photo_only" boolean DEFAULT false NOT NULL;
```

Then append the backfill **to the same generated file**, below the generated statement, separated by
drizzle's `--> statement-breakpoint` marker (the journal entry has `"breakpoints": true`):

```sql
--> statement-breakpoint
-- Backfill: every bubble that is a carrier under the pre-marker rule.
-- The rule is `role = 'nina' AND text IN (the five canned captions)`, and it is spelled out here
-- rather than imported because a migration is a historical record: this is the list as it stood on
-- 2026-09-07, and it must NOT follow later edits to lib/nina/imagefail.ts.
-- `AND EXISTS (an image row)` is a tightening the TypeScript predicate cannot afford: it takes a
-- message id from a client and answers before reading images, whereas here every row is in hand. A
-- nina message whose text happens to be `nih` and which carries no photograph is not a carrier.
UPDATE "nina_messages" m
   SET "photo_only" = true
 WHERE m."role" = 'nina'
   AND m."text" IN (
     'nih',
     'nih, puas?',
     'ini gw abis lari tadi',
     'foto gw. jangan di-zoom',
     'udah nih, jangan minta lagi'
   )
   AND EXISTS (SELECT 1 FROM "nina_message_images" i WHERE i."message_id" = m."id");
```

### The collision, and it is not hypothetical

**A second orchestrated set is in flight on this repo from the same base `f839116`:**
`nina-job-redo-and-soft-delete`, whose phase 2 adds `nina_turns.deleted_at`. Both sets will mint
`0008`. That is fine while the branches are separate and it is a defect the moment they meet.

- **Whoever merges second regenerates.** Not renames. `when` is the migrator's ordering key, so a
  renamed entry keeps its old timestamp, falls below the applied watermark, and is **skipped with no
  error** — `db:migrate` exits 0 and the column is never created.
- The repair is: keep `main`'s `_journal.json` and snapshot, delete this branch's `0008_*.sql`, and
  re-run `npm run db:generate -- --name nina_message_photo_only` against the **merged** `schema.ts`.
- This is the merger's job, not this phase's. **Do not try to pre-empt it by picking a higher
  number** — a hand-numbered migration is the failure mode above, arrived at deliberately.

## Step 2 — `lib/db/schema.ts`: the column

Add to `ninaMessages`, immediately after `source` (it is the field it is most often confused with,
and a reader comparing them should not have to scroll):

```ts
    /**
     * **This bubble exists ONLY to carry a photograph.** Set by every path that writes one; read by
     * `isNinaPhotoCarrierMessage`, which is what lets Remove delete the message along with the last
     * picture on it instead of leaving a caption with nothing under it.
     *
     * ── WHY A COLUMN AND NOT A SIXTH `NinaMessageSource` ────────────────────────────────────
     * The cheap answer was `source = 'photo'`: this is a plain `text` column with a TS union, no
     * database enum and no check constraint, and exactly one query in the repo compares it
     * (`lib/nina/queries.ts`, `= 'run_committed'`). So widening the union needs no migration at all,
     * and that is precisely what makes it the wrong answer — it would overwrite two recorded
     * rulings to save one DDL statement. `NinaMessageSource`'s own docstring calls a column domain
     * *"the hardest thing in the schema to widen later"* and rejects `'operator'` for having no
     * writer; `finishSelfie`'s says *"`source = 'chat'` on purpose and NOT a sixth
     * `NinaMessageSource`: she is answering something he said in an open conversation, minutes
     * ago."* Both are still true. A photograph she sends in reply to him IS a chat message; what is
     * new is not where the row came from but that its TEXT is disposable.
     *
     * ── AND WHY NOT A HEURISTIC ────────────────────────────────────────────────────────────
     * "role = 'nina' and every image on it is generated and the text is short" re-introduces the
     * false positive the caption-array clause was written to prevent, and it fails silently: the
     * cost is a real sentence of hers deleted, which nothing can recover.
     *
     * `NOT NULL DEFAULT false` so no reader needs a null branch, and additive so a revert of the
     * code leaves a column nothing consults. Migration 00NN backfills the pre-marker carriers.
     */
    photoOnly: boolean('photo_only').notNull().default(false),
```

`boolean` must be in the `drizzle-orm/pg-core` import list at the top of the file — check before
adding, several tables already use it.

## Step 3 — `lib/nina/queries.ts`: carry it in and read it back

Three edits, all mechanical.

1. `NinaMessageInsert` (`:154`):

```ts
export interface NinaMessageInsert {
  role: NinaRole
  body: string
  source?: NinaMessageSource
  turnId?: string | null
  replyToId?: string | null
  runId?: string | null
  /**
   * **`true` when this row exists only to carry a photograph** — see the column's own note.
   * Optional and defaulting to `false`, so the four existing writers of ordinary messages are
   * unchanged and a new writer has to opt in deliberately rather than inherit a flag.
   */
  photoOnly?: boolean
}
```

2. The `.values(...)` mapping inside `insertNinaMessages` (`:1192-1204`) gains one line, in the same
   `?? null` / `?? 'chat'` style as its neighbours:

```ts
        runId: row.runId ?? null,
        photoOnly: row.photoOnly ?? false,
```

3. `messageColumns` (`:489`) gains the projection, and `NinaMessageRow` picks it up from there:

```ts
  readAt: ninaMessages.readAt,
  photoOnly: ninaMessages.photoOnly,
```

**Check how `NinaMessageRow` is declared before editing** — if it is a hand-written interface rather
than inferred from `messageColumns`, add the field there too. Every consumer of the row type must
still compile; `npm run typecheck` is the check, and a widening like this should produce no errors.

## Step 4 — `lib/admin/chatPhotos.ts`: the predicate stops reading the words

Replace the body of `isNinaPhotoCarrierMessage` and rewrite the docstring's second clause. **Keep
the first clause and its argument exactly** — the `role === 'nina'` half is protecting his message
and nothing about it changed.

```ts
/**
 * **Does this message exist ONLY to carry a photograph?** The whole of the empty-bubble rule.
 *
 * TWO clauses, and both are load-bearing:
 *
 *   · `role === 'nina'` protects HIS message. The R26 re-attach path
 *     (`lib/nina/actions.ts:518-530`) writes a `kind = 'generated'` image row onto a `role =
 *     'runner'` message that carries his own words. That message is his; only the image row goes.
 *   · `photoOnly` protects HER words — and it is a fact about the row now, not a guess about its
 *     text. Every writer of a photo bubble sets it: `addChatPhotoAction`, `finishSelfie`, and
 *     `scripts/nina-image-worker.ts`.
 *
 * ── THE CAPTION TEST IS STILL HERE, AS A LEGACY CLAUSE, AND IT IS NOT DEAD CODE ─────────────
 * It used to be the whole rule: *"`NINA_IMAGE_CAPTIONS` is a closed five-string array;
 * `finishSelfie` and `addChatPhotoAction` both draw from it through `pickLine`, so the rule
 * recognises both writers exactly."* That stopped being true the moment a caption could be written
 * by a model, which is why the marker exists. But every row written **before** migration 00NN has
 * `photo_only = false` on it unless the backfill reached it, and a backfill run against a database
 * is not a guarantee about a database restored from an older dump. The clause costs one array scan
 * over five short strings and it is the difference between an old bubble being removable and not.
 *
 * It is safe in a way it was not before: a free-text caption can never collide with the array,
 * because `NINA_IMAGE_CAPTIONS` is now closed by definition — `lib/nina/imagefail.ts` documents it
 * as a historical set that must not grow, and `ninaImageCaption` draws from a subset.
 *
 * The parameter stays structural so this module keeps out of `lib/nina/queries.ts` and remains
 * importable from a browser bundle and from the suite. `body` is the DTO spelling of the `text`
 * column (RULING A1); `photoOnly` is optional so a caller holding a row from before this column
 * existed — or a test fixture written by hand — still typechecks and lands on the legacy clause.
 */
export function isNinaPhotoCarrierMessage(message: {
  role: string
  body: string
  photoOnly?: boolean
}): boolean {
  if (message.role !== 'nina') return false
  return message.photoOnly === true || NINA_IMAGE_CAPTIONS.includes(message.body)
}
```

`removeChatPhotoAction`'s call site (`lib/admin/chatPhotoActions.ts:282`) passes the whole
`NinaMessageRow`, which now carries `photoOnly` from Step 3's projection. **No change is needed at
the call site** — verify that by reading it rather than by editing it.

## Step 5 — The three writers set it

### `lib/admin/chatPhotoActions.ts` — `addChatPhotoAction` (`:186-198`)

One field. **The `body:` expression is untouched in this phase** — phase 3 owns it.

```ts
      {
        role: 'nina',
        body: ninaImageCaption(newId()),
        source: 'chat',
        turnId: null,
        replyToId: null,
        runId: null,
        /* This bubble is the photograph and nothing else. Remove deletes it with the last picture
         * on it, and from this row forward that no longer depends on what its text says. */
        photoOnly: true,
      },
```

Also correct the file header's bullet: it currently claims *"It writes no new `kind`, no new
`NinaMessageSource` and no admin column."* Still true of `kind` and `source`; add one sentence
saying `photo_only` is written here and is **not** an admin column — the worker and `finishSelfie`
write it too, so it does not make an admin-added row distinguishable (invariant 7 of that phase).

### `lib/nina/imagerun.ts` — `finishSelfie` (`:184-192`)

Same one field, same rule: **do not touch `body:` in this phase**, phase 4 owns it.

```ts
      {
        role: 'nina',
        /* Never empty. … (leave the existing comment verbatim) */
        body: ninaImageCaption(jobId),
        source: 'chat',
        turnId: jobId,
        replyToId: quoted?.id ?? null,
        /* Same fact as the admin path's: the row is the photograph. */
        photoOnly: true,
      },
```

### `scripts/nina-image-worker.ts` — the raw INSERT (`:676-683`)

The worker imports `lib/nina/imagefail.ts` by relative path and **may not import anything else**, so
this is a column name in SQL and nothing more:

```ts
  await sql`
    insert into nina_messages
      (id, user_id, session_id, role, text, source, turn_id, reply_to_id, photo_only)
    values (
      ${messageId}, ${userId}, ${sessionId}, 'nina', ${ninaImageCaption(jobId)}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId}),
      true
    )
  `
```

**The worker keeps the canned caption, permanently.** It runs on a GitHub runner with no z.ai key,
and `lib/nina/imagefail.ts`'s header forbids the import that a caption call would need. Phase 1's
narrowed pool is what makes that acceptable: the line it picks is true of any photograph. Leave a
comment at this INSERT saying so, so the next reader does not "fix" the inconsistency by importing
`@/lib/nina/caption` and breaking the worker's boot.

**Deploy-order note for the merger:** the worker writes `photo_only` and the column is created by
this phase's migration. A worker deployed against an un-migrated database fails its INSERT. The
column is additive and the migration runs before the deploy in the normal order; say so in the
commit message rather than assuming it.

## Step 6 — `tests/admin.chatPhotos.test.ts`

Keep the existing cases — they pin the legacy clause and must keep passing. Add:

```ts
describe('isNinaPhotoCarrierMessage — the marker', () => {
  it('is true for a marked message whatever its text says', () => {
    // This is the case phases 3 and 4 create and the whole reason the column exists.
    expect(
      isNinaPhotoCarrierMessage({
        role: 'nina',
        body: 'eh gw nyelam tadi, airnya bening banget',
        photoOnly: true,
      }),
    ).toBe(true)
  })

  it('is true for an unmarked legacy bubble carrying one of the five', () => {
    for (const caption of NINA_IMAGE_CAPTIONS) {
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: caption })).toBe(true)
      expect(isNinaPhotoCarrierMessage({ role: 'nina', body: caption, photoOnly: false })).toBe(true)
    }
  })

  it('is false for HIS message however it is marked', () => {
    // The R26 re-attach path: a generated image row on a runner message that carries his words.
    expect(isNinaPhotoCarrierMessage({ role: 'runner', body: 'nih', photoOnly: true })).toBe(false)
    expect(isNinaPhotoCarrierMessage({ role: 'runner', body: NINA_IMAGE_CAPTIONS[0]! })).toBe(false)
  })

  it('is false for an unmarked nina message carrying her own sentence', () => {
    expect(
      isNinaPhotoCarrierMessage({ role: 'nina', body: 'eh gimana lutut lo hari ini' }),
    ).toBe(false)
  })
})
```

## Verification

```bash
cd /home/miftah/.worktrees/run-insights/nina-photo-caption-from-image
npm run db:generate -- --name nina_message_photo_only   # once, in Step 1
npm run db:check
npm run lint
npm run typecheck
npm run test
git diff --stat drizzle/                                # exactly one new .sql + meta updates
```

`npm run db:migrate` is **not** part of this phase's verification: it writes the real database that
`main` is deployed against, and a feature branch may not do that. The DDL is reviewed by reading it
(Step 1) and the SQL is exercised against the shape by `db:check`.

## Exit criteria

1. `drizzle/` holds exactly one new generated migration, whose generated half is the single
   `ADD COLUMN` above and whose appended half is the backfill. Nothing was hand-numbered or renamed.
2. `npm run db:check` passes.
3. `isNinaPhotoCarrierMessage` returns `true` for a marked message with arbitrary text, `true` for
   an unmarked legacy message whose text is one of the five, `false` for a `role: 'runner'` message
   however marked, and `false` for an unmarked nina message with her own sentence.
4. All three writers set the marker: two through `NinaMessageInsert.photoOnly`, the worker in SQL.
5. `npm run typecheck` passes with no consumer of `NinaMessageRow` edited beyond the projection.
6. **No caption text changed anywhere in this phase**, and `lib/nina/imagefail.ts` is untouched.
7. The whole suite passes, including phase 1's files if that phase has already landed on the branch.

## Interface contract for phases 3 and 4

```ts
// lib/nina/queries.ts
interface NinaMessageInsert { …; photoOnly?: boolean }     // both writers already pass `true`
NinaMessageRow.photoOnly: boolean                          // projected

// lib/admin/chatPhotos.ts
isNinaPhotoCarrierMessage({ role, body, photoOnly? }): boolean
```

Phase 3 quotes `addChatPhotoAction` **as this phase leaves it** — the insert already carrying
`photoOnly: true` — and changes only `scheduleChatPhotoDescribe` and the import block. Phase 4
quotes `finishSelfie` as this phase leaves it and changes only the `body:` expression and an import.
Neither phase needs to touch the schema, the queries or the predicate again.
