> Adopted from `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md` phase 2. Source: `.workflows/plan/nina-photo-refs-and-bubble-actions/phase-2.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 2: "What she can see in it", editable

**Plan set:** `NINA_PHOTO_REFS_AND_BUBBLE_ACTIONS_PLAN.md`
**Analysis:** `20260907-125041-PHRF_code_analyzer.md`
**Satisfies:** R2 — *"there is a 'what she can see in it' field. make this field editable by user"*
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/admin` (with one statement in `lib/nina/queries.ts` §5b and one new component under `components/admin/`)

---

## Goal

`nina_message_images.description` — `glm-4.6v`'s prose, the only text on a chat-photo row that
reaches Nina's prompt — becomes writable by hand from `/admin/photos`. After this phase an operator
can correct a wrong description, or clear it so she stops claiming anything about the picture at
all, and the next turn that carries the photograph reads what he typed with no invalidation step.
Before it, the field was read-only and a wrong description was a wrong belief with no correction
available.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**

- `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000` (`lib/admin/chatPhotos.ts`)
- `chatPhotoDescriptionSchema` (`lib/admin/chatPhotoSchema.ts`) — zod, `{ id: string; description: string }` in, `{ id: string; description: string }` out (normalised)
- `ChatPhotoDescriptionInput` (`lib/admin/chatPhotoSchema.ts`) — `z.infer` of the above
- `updateNinaChatPhotoDescription(userId: string, id: string, description: string | null): Promise<NinaImageRow | null>` (`lib/nina/queries.ts`, §5b)
- `editChatPhotoDescriptionAction(input: unknown): Promise<ChatPhotoActionResult>` (`lib/admin/chatPhotoActions.ts`)
- `ChatPhotoDescription({ photoId: string; description: string | null })` (`components/admin/ChatPhotoDescription.tsx`, new file)

**Signature changes:** none. In particular `setNinaMessageImageDescription(userId, id, description: string): Promise<boolean>` is **left exactly as it is** — see Step 3's docstring for the three reasons a second statement is correct rather than a wider signature on that one.

**Requires (from earlier phases):** nothing. `depends_on` is empty and no symbol below is introduced by another phase.

**Leaves alone (owned by others):**

- `lib/db/schema.ts`, `drizzle/**` — Phase 1, and invariant 8 (no DDL here; `description` already exists and is nullable `text`)
- `lib/nina/queries.ts`: `NinaImageRow` (:203), `NinaImageInsert` (:218), `imageColumns` (:517), `insertNinaMessageImages` (:1435), `listNinaMessageImages` (:1477), `generatedChatPhotoScope` (:1563), `updateNinaChatPhotoBlob`'s `.set()` (:1678) — Phase 1. (`listNinaChatPhotos` :1589 and `countNinaChatPhotos` :1623 are edited by NOBODY: they inherit Phase 1's filter through `generatedChatPhotoScope`.)
- `lib/nina/actions.ts` — Phase 1 (`resolveAttachment`, the attach INSERT) and Phase 4 (`resendNinaMessage`)
- `components/admin/chatPhotoModel.ts` — **not touched at all**, by this phase or by any phase in this set; `description: string | null` is already on `ChatPhoto` (:56) and already mapped by `app/admin/photos/page.tsx:91`. **Phase 1 adds no field to `ChatPhoto`** — reconciled, see below.
- `components/admin/ChatPhotoControls.tsx`, `ChatPhotoAdd.tsx`, `ChatPhotoGrid.tsx`, `app/admin/photos/page.tsx` — unchanged
- `nina_avatars` and its `description`, `components/admin/explorer/SelectionPane.tsx` — out of scope for the whole set
- `describeNinaImages`, `scheduleChatPhotoCaption`, `lib/nina/vision.ts`, `lib/nina/caption.ts` — read for constants only, not edited
- `components/nina/**`, `lib/nina/edit.ts`, `lib/nina/messageActions.ts` — Phases 3 and 4, and invariant 3

**`components/admin/ChatPhotoDetail.tsx` is MINE OUTRIGHT — there is no shared-file boundary and
no coordination to do.** RECONCILED (D8): Phase 1 does not touch this file, `chatPhotoModel.ts`, or
`app/admin/photos/page.tsx`. The draft plan index offered Phase 1 an *optional* read-only provenance
line here; it is **withdrawn**, because after Phase 1's own Step 7c `/admin/photos` lists only rows
where **both** provenance columns are NULL, so a "came from her album" line on this rail could never
render — it would be dead markup in a file this phase is rewriting. Phase 1's Handoff H1 reaches the
same conclusion independently and refuses it. Quoted at `origin/main` @ `e6c68d6`, my three hunks
are: one appended paragraph at the **end** of the header docstring (after :34, before the `*/` on
:35); one added import line after :8; and the `<div>` at **:155-172**. The `<dl>` at :114-152 and
the action stack at :190-214 are untouched, and nothing else in the set will touch them either.

**Shared-file boundary with Phase 1 (`lib/nina/queries.ts`) — CONCURRENT AND DISJOINT, verified
line by line.** My only hunk is an **insertion between :1838 and :1840** — the tail of §5b, after
`setNinaMessageImageDescription`'s closing brace (it begins at :1826) and before the `§6 Memory`
banner at :1841.

Phase 1 has **seven** footprints in this file, not six, and the draft claim that they are "all above
:1631" was WRONG — Phase 1's Step 7d edits `updateNinaChatPhotoBlob`'s `.set()` at **:1678-1704**,
which is *below* the §5b banner (:1632), inside §5b with me. It is still disjoint: its hunk ends
around :1704 and mine begins at :1838, ~134 lines apart, so git merges both cleanly and **no
dependency edge is needed between phases 1 and 2**. The full list, verified against
`origin/main` @ `e6c68d6`: `NinaImageRow` :203, `NinaImageInsert` :218, `imageColumns` :517,
`insertNinaMessageImages` :1435, `listNinaMessageImages` :1477, `isOriginalPhoto` +
`generatedChatPhotoScope` :1563, `updateNinaChatPhotoBlob` :1678.

Two consequences for me, both no-ops: Phase 1 adds two keys to `imageColumns`, which widens my
function's return type additively; and Phase 1 nulls `source_avatar_id` / `source_image_id` inside
`updateNinaChatPhotoBlob`, not inside mine — **I must not add those columns to my own `.set()`**
(Phase 1's Handoff H2 asks for exactly this: an operator retyping "what she can see in it" does not
change where the bytes came from).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/chatPhotos.ts` | modify | one constant after :159 — `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS` |
| `lib/admin/chatPhotoSchema.ts` | modify | import at :3-8; `chatPhotoDescriptionSchema` after :71; type export after :75 |
| `lib/nina/queries.ts` | modify | one owner-scoped UPDATE inserted between :1838 and :1840 (§5b tail, after `setNinaMessageImageDescription` and before the `§6 Memory` banner at :1841) — disjoint from Phase 1's seven hunks, the lowest of which ends near :1704 |
| `lib/admin/chatPhotoActions.ts` | modify | two import lines (:7-11, :12-17, :22-35); `editChatPhotoDescriptionAction` inserted between :323 and :325 |
| `components/admin/ChatPhotoDescription.tsx` | create | the editable control, a sibling of `ChatPhotoAdd` / `ChatPhotoControls` |
| `components/admin/ChatPhotoDetail.tsx` | modify | header paragraph; import after :8; the block at :155-172 becomes the control's mount |
| `tests/admin.chatPhotos.test.ts` | modify | two imports; a schema `describe` after :292; one mock key + one spy + one default; an action `describe` appended |
| `tests/nina.chatPhotoDescription.test.ts` | create | the statement's SQL, through `installFakeDb` |

---

## Decisions this phase settles (do not re-open)

**D1 — An empty save CLEARS the description to `NULL`. It does not refuse.**

Three reasons, in order of weight.

1. `NULL` is not a new state for this row. `updateNinaChatPhotoBlob` (`lib/nina/queries.ts:1691`)
   writes it in the same statement as a Replace, and every `addChatPhotoAction` row starts there
   (`lib/admin/chatPhotoActions.ts:238`). So every downstream reader already handles it:
   `lib/nina/actions.ts:635-636` substitutes `NINA_DESCRIPTION_UNAVAILABLE`, and
   `ChatPhotoDetail`'s fallback already renders. Nothing new can break.
2. Refusing empty would make a wrong description **un-erasable** — replaceable with different prose,
   never retractable. The operator could not say "she has no business claiming anything about this
   picture", which is a legitimate thing to want for exactly the photograph whose description is
   wrong.
3. The consequence is small, bounded and known: `NINA_DESCRIPTION_UNAVAILABLE`
   (`lib/nina/prompts/describe.ts:79-82`) is *"He attached a photo, but you could not see it — your
   eyes failed on this one. Do not guess what is in it and do not pretend you saw it. Ask him what
   it is…"*. She asks rather than invents.

**It is a consequence, so it is reported, not documented.** The action returns
`note: 'Cleared. If this photo comes up again she will say she could not see it and ask him what it
is.'` — `ChatPhotoActionResult.note` exists for exactly this ("a true thing about the outcome that
is NOT a failure", `lib/admin/chatPhotos.ts:297-301`), so no new vocabulary is invented. And a clear
does **not** re-arm the describe pass: `scheduleChatPhotoCaption`'s `description == null` skip is
only reached from Add and Replace, and nothing polls for null descriptions. A cleared field stays
cleared until a human or a Replace changes it.

**D2 — An explicit **Save** button, not commit-on-blur, and not a plain `<form>` submit.**

- **Match, not invention.** `ChatPhotoControls` calls the action imperatively with a local
  `busy` / `error` / `note` state and no `router.refresh()`, quoting Next 16's Server Actions guide
  for why: *"When `updateTag`, `revalidatePath`, or `refresh` runs, Next.js re-renders the current
  route server-side and includes a newly rendered RSC Payload in the action's response, so the page
  reflects the change in the same roundtrip."* `/admin/photos` is `force-dynamic` and the action
  ends with `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)`, so the saved text comes back in the same
  round trip.
- **Not `<form action={…}>`**, which would need `useActionState` to surface the inline validation
  error — a second error-reporting vocabulary on a screen that already has one.
- **Not commit-on-blur.** `MemoryTable.tsx:445-467` is right to do that for forty cells of 400
  characters with `Escape` to revert. For one 2000-character paragraph, a stray blur that silently
  stores a half-finished sentence into Nina's prompt is worse than a click.
- **A Save button is not a confirmation.** R1's ruling — *"no need for all these bullshit
  confirmation"* — is about a **second** click on something. This is the first click of the write,
  the distinction `MemoryTable.tsx:553-558` makes in as many words for its own `+`.

**D3 — 2000 characters, and the number is measured.**

MEASURED against production 2026-09-07 (`node --env-file=.env.local`, `@neondatabase/serverless`
over `DATABASE_URL`):

| Table | rows | described | min | mean | max |
|---|---|---|---|---|---|
| `nina_message_images` | 4 | 3 | 85 | 303 | **461** |
| `nina_avatars` | 17 | 13 | — | 415 | **550** |

So every description in the store today is under 40% of the proposed ceiling. The ceiling above the
measurement is the vendor's and it is hard: `NINA_DESCRIBE_SYSTEM_PROMPT` asks for *"60 to 140
words. One paragraph"* (~1000 chars) and `NINA_DESCRIBE_MAX_TOKENS = 500`
(`lib/nina/vision.ts:57`) caps the completion, which at this repo's own
`NINA_DESCRIBE_CHARS_PER_TOKEN = 3` is **1500 characters the describe pass can never exceed**. 2000
therefore lets an operator say more than `glm-4.6v` ever could, without inventing a new size for
this surface: `NINA_NOTES_MAX` is also 2000, for the reason spelled at its declaration
(`lib/nina/tuning.ts:713-718`) — *"roughly a screen of notes … small enough that it cannot drown
the canon it is appended to."* And it is prompt text that is paid for on every turn carrying the
photograph (~670 tokens at the same conversion, versus the ~150 a real row costs today), so it is a
real bound and not decoration.

**D4 — The rail keeps its "imports no Server Action itself" boundary.**

`ChatPhotoDetail`'s header states it: *"this file still imports no Server Action itself: the
controls own that, so a prop rename here cannot reach a mutation."* Honoured, not argued away. The
editor is a new sibling client component — `ChatPhotoAdd` (the collection verb), `ChatPhotoControls`
(the two per-row verbs), `ChatPhotoDescription` (the third per-row verb). `ChatPhotoDetail` gains one
component import and no action import.

**D5 — The fallback copy's honesty survives, and moves rather than disappearing.**

The read-only `<p>` printed *"Not described yet. She cannot talk about this photo until it is —
reload in a moment if it was just added or replaced."* That sentence is deliberately about the
**row's state** and not a permanent defect, because `after()`'s describe pass fills the field in
seconds after an Add or Replace. It cannot become the textarea's **value** (the operator would save
the sentence). It splits:

- `placeholder="Not described yet."` — shown exactly while `description` is null, gone the instant a
  key is pressed, never saved.
- the full explanation as a hint line **under** the field, rendered only when
  `description === null && !dirty`, with one clause added: *"…or write it yourself."* — which is the
  affordance this phase adds and is the honest thing to say now that it exists.

## Implementation Steps

### Step 1: The ceiling, spelled once

**File:** `lib/admin/chatPhotos.ts:159` — insert immediately after `ADMIN_CHAT_PHOTO_MAX_URL_CHARS`,
before the `adminChatPhotoPathname` docstring at :161.

**Change:** one exported constant, in the block that already holds the other three ceilings. That
file's own header states the rule this obeys: *"`app/api/admin/nina/upload/route.ts` (a Route
Handler), `lib/admin/chatPhotoActions.ts` (Server Actions) and `tests/admin.chatPhotos.test.ts` all
have to agree, and a constant that is agreed rather than shared is a constant that will one day
disagree."* It is pure and zero-import, so the zod schema, the action, the browser component and the
suite all read the same number.

**Code:**

```ts
/**
 * **How long a hand-written "what she can see in it" may be.** 2000 characters.
 *
 * MEASURED against production 2026-09-07, not chosen. `nina_message_images` holds three described
 * rows, at 85 / 362 / 461 characters (mean 303); `nina_avatars` holds thirteen, mean 415, max 550.
 * Every description in the store today is under 40% of this.
 *
 * The ceiling above the measurement is the VENDOR's, and it is a hard one:
 * `NINA_DESCRIBE_SYSTEM_PROMPT` asks for "60 to 140 words. One paragraph" (~1000 characters) and
 * `NINA_DESCRIBE_MAX_TOKENS` (500) caps the completion, which at this repo's own
 * `NINA_DESCRIBE_CHARS_PER_TOKEN = 3` is 1500 characters the describe pass can never exceed. So
 * 2000 lets an operator say MORE than `glm-4.6v` ever could — without inventing a new size for this
 * surface, because `NINA_NOTES_MAX` is also 2000 for the reason given at its declaration:
 * "roughly a screen of notes … small enough that it cannot drown the canon it is appended to."
 *
 * It is not decoration. `lib/nina/actions.ts:634-637` puts this string into
 * `NinaBackgroundTurnInput.imageDescriptions` verbatim, so it is prompt text paid for on every turn
 * that carries the photograph — ~670 tokens at the conversion above, against the ~150 a real row
 * costs today.
 */
export const ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000
```

**Impact:** none on its own. Nothing reads it until Step 2.

---

### Step 2: The payload shape

**File:** `lib/admin/chatPhotoSchema.ts` — the import at :3-8, then an append after :71
(`chatPhotoRemoveSchema`), then the type export after :75.

**Change:** a fourth schema on the same shape as the three that are there. `.max()` sits **before**
`.transform()` on purpose: an over-long paste is refused and reported inline rather than silently
truncated into range, which is the one outcome that would put half a sentence into Nina's prompt and
tell the operator it saved fine. There is no `.min(1)` — an empty result is legal here and means
something in the action (D1), which is this file's stated division of labour.

**Code — replace the import at :3-8 with:**

```ts
import {
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  ADMIN_CHAT_PHOTO_MAX_EDGE_PX,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  ADMIN_CHAT_PHOTO_MAX_URL_CHARS,
  blobUrlMatchesPathname,
} from '@/lib/admin/chatPhotos'
```

**Code — append after :71 (after `chatPhotoRemoveSchema`):**

```ts
/**
 * **"Rewrite what she can see in it."** R2 of `nina-photo-refs-and-bubble-actions`, verbatim:
 * *"there is a 'what she can see in it' field. make this field editable by user"*.
 *
 * ── THE MAX IS ON THE RAW STRING, THE NORMALISE COMES AFTER IT ──────────────────────────────
 * `.max()` before `.transform()`, deliberately. A 4000-character paste is REFUSED and reported
 * inline — this file's rule: a Zod refusal is a validation failure, not a confirmation — rather than
 * silently truncated into range, which is the one outcome that would put half a sentence into Nina's
 * prompt and tell the operator it saved fine. `coerceNinaNotes` (`lib/nina/tuning.ts:742-748`)
 * slices instead, and is right to: it coerces a stored blob at read time and has no operator to
 * report to.
 *
 * ── WHAT THE TRANSFORM DOES, AND WHY IT IS ALL IT DOES ──────────────────────────────────────
 * `coerceNinaNotes` minus the slice: CRLF to LF so a Windows paste does not store carriage returns
 * in prompt text, three-or-more newlines collapsed to one blank line, then trimmed. Nothing else.
 * No sentence casing, no digit stripping, no length floor. The model's own rules
 * (`lib/nina/prompts/describe.ts` — no digits, 60-140 words, one paragraph) are instructions to a
 * vendor, not validation of a human: this description is a WITNESS statement and here the operator
 * IS the witness. He is allowed to write a number if the number is true.
 *
 * ── AN EMPTY RESULT IS LEGAL AND MEANS SOMETHING IN THE ACTION ──────────────────────────────
 * No `.min(1)`. An all-whitespace box normalises to `''`, this accepts it, and
 * `editChatPhotoDescriptionAction` turns it into `NULL` — the phase's D1. That split is this file's
 * stated division of labour: the schema knows shapes, the action owns policy and ownership.
 */
export const chatPhotoDescriptionSchema = z.object({
  id: chatPhotoId,
  description: z
    .string()
    .max(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS)
    .transform((value) =>
      value
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    ),
})
```

**Code — append after :75 (the existing type exports):**

```ts
export type ChatPhotoDescriptionInput = z.infer<typeof chatPhotoDescriptionSchema>
```

**Impact:** additive. The three existing schemas and their inferred types are untouched, so nothing
that imports this module changes behaviour.

---

### Step 3: The one owner-scoped UPDATE

**File:** `lib/nina/queries.ts` — insert **between :1838 and :1840**, i.e. after
`setNinaMessageImageDescription`'s closing brace and before the
`/* ===== §6 Memory — slots and the ledger (RU-6) ===== */` banner (:1841). That is the tail of §5b,
the "admin write side" block, and it is the point in the file furthest from Phase 1's footprint.
Phase 1's lowest hunk in this file is `updateNinaChatPhotoBlob`'s `.set()` at :1678-1704 — which is
*inside* §5b, not above it as the draft claimed — leaving ~134 clear lines between the two phases'
edits. See the Interface Contract's boundary note for the verified list.

**Change:** one statement in §5b's existing style — `updateNinaChatPhotoBlob`'s shape, not
`setNinaMessageImageDescription`'s. No new import is needed: `db`, `and`, `eq`,
`ninaMessageImages`, `imageColumns` and `NinaImageRow` are all already in scope in this file.

**Code:**

```ts
/**
 * **EDIT: the operator rewrites what she can see in a photograph.** R2 of
 * `nina-photo-refs-and-bubble-actions`, verbatim: *"there is a 'what she can see in it' field. make
 * this field editable by user"*.
 *
 * ── WHY THIS IS NOT `setNinaMessageImageDescription` WITH A WIDER SIGNATURE ─────────────────
 * Three differences, and each one is load-bearing:
 *
 *   · `kind = 'generated'` is in the WHERE, exactly as `updateNinaChatPhotoBlob` carries it, and
 *     that sibling's reason applies unchanged: `/admin/photos` lists only HERS, so a write reachable
 *     from that screen must not be able to land on one of HIS composer uploads even if an id for one
 *     arrives. `getNinaMessageImage` does not filter on `kind`, so this clause is not redundant with
 *     the action's guard — it is the second of the two agreeing checks this admin surface uses
 *     everywhere. `setNinaMessageImageDescription` has no such clause and must NOT grow one: its
 *     caller is `after()`'s describe pass, which legitimately describes both sides.
 *   · `description` is `string | null` here. NULL is the operator CLEARING the field (the phase's
 *     D1), and it is not a new state for the row — `updateNinaChatPhotoBlob` writes it in the same
 *     breath as a replace, and every `addChatPhotoAction` row starts there.
 *     `setNinaMessageImageDescription` takes a `string` because a vision pass that produced nothing
 *     writes nothing.
 *   · It returns the ROW rather than a boolean, because its caller reports on what it wrote. That is
 *     `updateNinaChatPhotoBlob`'s shape; the boolean is the `after()`-callback shape, for a caller
 *     whose only options are "log a miss" and "log a write".
 *
 * ── IT TOUCHES ONE COLUMN, AND THE ABSENCES ARE THE CONTRACT ───────────────────────────────
 *   · NOT `prompt` — the generation sidecar for bytes that have not changed.
 *   · NOT `created_at` — `nina_message_images_user_created_idx` orders both `/nina/about` and
 *     `/admin/photos` by it. Correcting a sentence about a photograph is not taking a new one.
 *   · NOT `blob_url`, `pathname`, or the four measurements — the picture is the same picture.
 *   · NOTHING on `nina_messages`. The bubble's caption is what she SAID; this column is what she
 *     SAW. Rewriting the second from `/admin` must not silently rewrite the first in the runner's
 *     conversation — see the action's docstring.
 *
 * ── NO INVALIDATION STEP, BY CONSTRUCTION ──────────────────────────────────────────────────
 * `resolveAttachment` re-reads this row with `getNinaMessageImage` on every send, and
 * `lib/nina/actions.ts:634-637` hands the value straight to
 * `NinaBackgroundTurnInput.imageDescriptions`. So the next turn that carries this photograph reads
 * what was just written, with no cache to bust. A NULL degrades exactly as a replace's NULL does:
 * `NINA_DESCRIPTION_UNAVAILABLE` is substituted and she asks him what the picture is.
 */
export async function updateNinaChatPhotoDescription(
  userId: string,
  id: string,
  description: string | null,
): Promise<NinaImageRow | null> {
  const updated = await db
    .update(ninaMessageImages)
    .set({ description })
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessageImages.id, id),
        eq(ninaMessageImages.kind, 'generated'),
      ),
    )
    .returning(imageColumns)

  return updated[0] ?? null
}
```

**Impact:** additive. No existing statement changes. When Phase 1 adds `sourceAvatarId` /
`sourceImageId` to `imageColumns`, this function's return type widens with every other reader of
that projection and needs no edit here.

---

### Step 4: The Server Action

**File:** `lib/admin/chatPhotoActions.ts` — three import edits, then insert the action **between
:323 and :325**, i.e. after `removeChatPhotoAction`'s closing brace and before the
`/* ── The two helpers ── */` banner, so the file stays "the verbs, then the helpers".

**Change:** `replaceChatPhotoAction` / `removeChatPhotoAction` line for line — `requireAdmin()`
FIRST above any use of the argument, zod parse, owner-scoped read, write, `revalidatePath`, a
`ChatPhotoActionResult`. Two things it deliberately does **not** do: no `after()` and no model call
(invariant 5 — `scripts/check-llm-payload-boundary.mjs` gains no entry), and no re-caption of the
bubble.

**Code — replace the import at :7-11 with:**

```ts
import {
  chatPhotoAddSchema,
  chatPhotoDescriptionSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
```

**Code — replace the import at :12-17 with:**

```ts
import {
  ADMIN_CHAT_PHOTOS_PATH,
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  isAdminChatPhotoPathname,
  isNinaPhotoCarrierMessage,
  type ChatPhotoActionResult,
} from '@/lib/admin/chatPhotos'
```

**Code — replace the import at :22-35 with:**

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
  readNinaTuning,
  setNinaMessageImageDescription,
  updateNinaChatPhotoBlob,
  updateNinaChatPhotoDescription,
  updateNinaMessage,
} from '@/lib/nina/queries'
```

**Code — insert between :323 and :325:**

```ts
/* ── DESCRIBE ────────────────────────────────────────────────────────────────────────────── */

/**
 * **Rewrite what she can see in a photograph, by hand.** R2 of
 * `nina-photo-refs-and-bubble-actions`, verbatim: *"there is a 'what she can see in it' field. make
 * this field editable by user"*.
 *
 * `nina_message_images.description` is `glm-4.6v`'s prose and it is the only text on that row that
 * reaches Nina's prompt (`lib/nina/actions.ts:634-637`). Until now nothing could write it by hand,
 * so a wrong description was a wrong belief with no correction available. This is the correction.
 *
 * ── NO MODEL CALL, NO `after()`, AND THAT IS THE POINT ─────────────────────────────────────
 * The other three actions in this file schedule `scheduleChatPhotoCaption` because they changed the
 * BYTES and the prose had to be re-earned. This one changes the prose, so re-earning it would
 * overwrite the human who just typed it. Invariant 5 of the plan set:
 * `scripts/check-llm-payload-boundary.mjs` gains no entry.
 *
 * It also deliberately does NOT re-caption the bubble. `scheduleChatPhotoCaption` writes
 * `nina_messages.text` from the description, and running it here would rewrite a sentence Nina has
 * already said in the runner's conversation because an operator fixed a private note the runner
 * never saw. **Editing what she SAW is not editing what she SAID.** If that is ever wanted it is one
 * line, and it needs its own decision.
 *
 * ── AN EMPTY BOX CLEARS THE FIELD (D1) ─────────────────────────────────────────────────────
 * The normalised string is empty -> `NULL`, and the operator is TOLD, in the `note`. Refusing empty
 * was the alternative and it is the worse one: it would make a wrong description un-erasable —
 * replaceable with different prose, never retractable. NULL is not a new state (a Replace writes it,
 * every Add starts there) and it degrades honestly on the send path, where
 * `NINA_DESCRIPTION_UNAVAILABLE` is substituted and she asks him what the picture is rather than
 * inventing something. A real consequence belongs in a sentence the operator reads, not in a
 * docstring only I will read.
 *
 * ── THE TWO CHECKS, AGAIN AND FOR THE SAME REASON ──────────────────────────────────────────
 * `requireAdmin()` first, above any use of the argument. Then the SHAPE (Zod, which knows no user
 * id — *"A well-formed `Item` object can still refer to a row the caller does not own"*), then the
 * owner-scoped re-read, then a write whose own WHERE carries `user_id` AND `kind = 'generated'`.
 *
 * The `existing.kind` guard is not decoration: `getNinaMessageImage` does not filter on `kind`, so
 * without it an id for one of HIS composer uploads would reach a write nobody can see or undo from
 * this screen. `replaceChatPhotoAction` refuses the same case with the same sentence, on purpose.
 *
 * And there is no `isAdminChatPhotoPathname` call here, with nothing missing: that predicate binds
 * an UPLOADED BLOB to the session, and this action receives no blob, no pathname and no URL.
 */
export async function editChatPhotoDescriptionAction(
  input: unknown,
): Promise<ChatPhotoActionResult> {
  const { userId } = await requireAdmin()

  const parsed = chatPhotoDescriptionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `That description did not fit the field — ${ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS} characters at most.`,
    }
  }
  const { id, description } = parsed.data

  const existing = await getNinaMessageImage(userId, id)
  if (existing == null) return { ok: false, error: 'That photo is not in the collection.' }
  if (existing.kind !== 'generated') {
    return { ok: false, error: 'That one is his upload, not hers.' }
  }

  /* The empty box IS the clear. D1, and this line is the only place that policy lives. */
  const next = description.length === 0 ? null : description

  const updated = await updateNinaChatPhotoDescription(userId, id, next)
  if (updated == null) return { ok: false, error: 'That photo is not in the collection.' }

  revalidatePath(ADMIN_CHAT_PHOTOS_PATH)
  return {
    ok: true,
    id,
    ...(next === null
      ? {
          note: 'Cleared. If this photo comes up again she will say she could not see it and ask him what it is.',
        }
      : {}),
  }
}
```

**Impact:** a fourth exported action on `/admin/photos`. The three existing ones are untouched; the
module's `'use server'` contract is unchanged (every export is still an async function).

---

### Step 5: The control

**File:** `components/admin/ChatPhotoDescription.tsx` — **new file.**

**Change:** the third per-row verb, in its own file for the reason `ChatPhotoAdd` and
`ChatPhotoControls` are in theirs (D4). Two pieces of state design are load-bearing and are argued
in the docstring: `draft === null` means untouched, and the caller keys the component by `photo.id`.

**Code:**

```tsx
'use client'

import { useState } from 'react'

import { Button, CONTROL_CLASS } from '@/components/ui'
import { editChatPhotoDescriptionAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **"What she can see in it", editable.** R2 of `nina-photo-refs-and-bubble-actions`, verbatim:
 * *"there is a 'what she can see in it' field. make this field editable by user"*.
 *
 * A sibling of `ChatPhotoAdd` (the collection verb) and `ChatPhotoControls` (the two per-row verbs),
 * and it is its own file for the reason those two are: `ChatPhotoDetail`'s header states that it
 * *"imports no Server Action itself: the controls own that, so a prop rename here cannot reach a
 * mutation."* That boundary is kept exactly — the rail mounts this and reads nothing back from it.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ──────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write, the distinction `MemoryTable.tsx:553-558` makes
 * in as many words for its own `+`. Commit-on-blur is right for that file (forty cells of 400
 * characters, `Escape` to revert); it is wrong for one 2000-character paragraph, where a stray blur
 * would silently store a half-finished sentence into Nina's prompt with nothing to say it happened.
 *
 * ── NO `<form>`, NO `router.refresh()` ─────────────────────────────────────────────────────
 * `ChatPhotoControls`'s shape and its cited reason. The action ends with
 * `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)`, and Next 16 *"re-renders the current route server-side
 * and includes a newly rendered RSC Payload in the action's response"*, so the rail gets the saved
 * text back in the same round trip. A `<form action={…}>` would need `useActionState` to surface the
 * inline error, which is a second error vocabulary on a screen that already has one.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ──────────────────────
 * The box shows the SERVER's prose until the operator types. So when `after()`'s describe pass lands
 * while the rail is open, the next payload's text simply appears; and once he has typed, nothing
 * from the server can overwrite him. No `useEffect`, no sync, no dependency array. After a
 * successful save the draft is dropped back to `null`, which is also what makes the "unsaved" marker
 * clear itself when the saved text comes back.
 *
 * The caller still keys this by `photo.id` — see the mount in `ChatPhotoDetail`. That covers the
 * OTHER direction, which an untouched-means-server rule cannot: switching tiles with unsaved text in
 * the box.
 *
 * ── THE FONT SIZE IS `CONTROL_CLASS`'s AND IS NOT SHRUNK ───────────────────────────────────
 * `text-base` comes from `CONTROL_CLASS` and stays. `MemoryTable.tsx:71-80` and
 * `components/ui/Field.tsx:85-92` both state the rule: Safari zooms the viewport when a control
 * smaller than 16 px takes focus and leaves it zoomed, and the design brief makes that one of the
 * rules that beats the design. The recipe below is `CharacterPanel.tsx:401-409`'s, with a taller
 * `min-h` and the `leading-relaxed` the read-only paragraph had.
 */
export function ChatPhotoDescription({
  photoId,
  description,
}: {
  photoId: string
  /** The row's stored prose, straight from the server. `null` is "not described yet". */
  description: string | null
}) {
  const stored = description ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const text = draft ?? stored
  const dirty = draft !== null && draft !== stored
  /* Mirrors the schema's transform, which trims before it decides, so the label cannot lie. */
  const willClear = text.trim().length === 0

  const onSave = async () => {
    if (busy || !dirty) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const result = await editChatPhotoDescriptionAction({ id: photoId, description: text })
      if (!result.ok) {
        setError(result.error ?? 'That description did not stick.')
      } else {
        setNote(result.note ?? null)
        /* Back to "untouched", so the box follows the server again — and so the payload that
         * `revalidatePath` just produced, which carries exactly what was written, does not read as
         * an unsaved edit. */
        setDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <textarea
        aria-label="What she can see in it"
        className={cn(CONTROL_CLASS, 'min-h-[104px] resize-y py-2 leading-relaxed')}
        value={text}
        maxLength={ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        disabled={busy}
        placeholder="Not described yet."
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
          setNote(null)
        }}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {/* `Clear` when an emptied box would null a row that HAS prose. Not a confirmation: one
            click, the first click, and the label says what the click does. */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          loading={busy}
          disabled={busy || !dirty}
          onClick={() => void onSave()}
        >
          {willClear && description !== null ? 'Clear' : 'Save'}
        </Button>
        <span className="text-[11px] font-medium text-ink-3 tabular-nums">
          {text.length}/{ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        </span>
        {dirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
      </div>

      {/*
       * The honest sentence about the ROW's state, kept from the read-only version and kept for its
       * original reason: after an admin Add or Replace this field is NULL for the few seconds
       * `scheduleChatPhotoCaption`'s `after()` pass takes, and then fills in on the next load. A
       * field that is merely empty would read as a permanent defect for a photograph that is about
       * to be fine. The last clause is all this phase changes about it — he no longer has to wait
       * for the model if he would rather say it himself.
       */}
      {description === null && !dirty && (
        <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">
          She cannot talk about this photo until it is described &mdash; reload in a moment if it was
          just added or replaced, or write it yourself.
        </p>
      )}

      {error !== null && <p className="mt-1.5 text-[12px] font-medium text-red">{error}</p>}
      {note !== null && <p className="mt-1.5 text-[12px] font-medium text-ink-3">{note}</p>}
    </div>
  )
}
```

**Impact:** a new client component. Nothing imports it until Step 6.

---

### Step 6: Mount it in the rail

**File:** `components/admin/ChatPhotoDetail.tsx` — a header paragraph after :34, an import after :8,
and the `<div>` at **:155-172**.

**Change:** the eyebrow `<p>` stays exactly where it is (so the heading does not move on screen, and
so a sibling block added near it does not have to touch these lines); the read-only `<p>` becomes the
mount. The `key` is not cosmetic and the comment says why.

**Code — append this paragraph at the end of the header docstring, after :34 and before the `*/` on :35:**

```
 *
 * ── AND THE DESCRIPTION IS EDITABLE NOW (R2, `nina-photo-refs-and-bubble-actions`) ──────────
 * *"there is a 'what she can see in it' field. make this field editable by user"*. The block under
 * the second divider now mounts `ChatPhotoDescription`, which owns the Server Action. Everything
 * above still holds, including the last sentence of it: this file imports a COMPONENT, not a
 * mutation.
```

**Code — insert after :8 (`import { ChatPhotoControls } from './ChatPhotoControls'`):**

```tsx
import { ChatPhotoDescription } from './ChatPhotoDescription'
```

**Code — replace lines 155-172 (the whole first `<div>` inside the `mt-4 space-y-3` block, from
`<div>` through its closing `</div>`) with:**

```tsx
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            What she can see in it
          </p>
          {/*
           * EDITABLE AS OF R2 — *"make this field editable by user"*. The heading stays a `<p>` here
           * and the control labels itself with `aria-label`, which is `MemoryTable.tsx:446`'s call
           * for the same reason: the visible heading lives in the parent, so a `<label htmlFor>`
           * would need an id threaded across a component boundary to say what one attribute says.
           *
           * The fallback copy did NOT disappear. It split — see `ChatPhotoDescription`: the short
           * half is the textarea's placeholder, the honest half about `after()`'s few-second window
           * is a hint line under the field, shown for exactly the same rows it was shown for before.
           * An editable field must not paper over that window and it does not.
           *
           * `key={photo.id}` IS LOAD-BEARING. `ChatPhotoGrid.tsx:240-250` renders this rail UNKEYED,
           * so selecting a different tile re-renders the same instance with different props. Without
           * the key, unsaved text in the box would survive onto another photograph's row and the
           * next Save would write one picture's prose onto another picture. That is data corruption,
           * not a stale render.
           */}
          <ChatPhotoDescription key={photo.id} photoId={photo.id} description={photo.description} />
        </div>
```

**Impact:** the rail can now write. `photo.description` was already a prop and already mapped by
`app/admin/photos/page.tsx:91`, so neither `chatPhotoModel.ts` nor the page changes. `ChatPhotoControls`
is untouched, so its "props are two strings and a callback on purpose" note still holds.

---

### Step 7: Extend the admin action suite

**File:** `tests/admin.chatPhotos.test.ts` — five edits.

**7a — the schema import at :5-9:**

```ts
import {
  chatPhotoAddSchema,
  chatPhotoDescriptionSchema,
  chatPhotoRemoveSchema,
  chatPhotoReplaceSchema,
} from '@/lib/admin/chatPhotoSchema'
```

**7b — the constants import at :10-17:**

```ts
import {
  ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS,
  ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES,
  adminChatPhotoPathname,
  blobUrlMatchesPathname,
  isAdminChatPhotoPathname,
  isHttpsBlobUrl,
  isNinaPhotoCarrierMessage,
} from '@/lib/admin/chatPhotos'
```

**7c — insert after :292 (after the `chatPhotoRemoveSchema` describe), still in the pure half:**

```ts
describe('chatPhotoDescriptionSchema', () => {
  const CEILING = 'x'.repeat(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS)

  it('accepts prose at the ceiling and refuses one character more', () => {
    expect(chatPhotoDescriptionSchema.safeParse({ id: ID, description: CEILING }).success).toBe(true)
    expect(
      chatPhotoDescriptionSchema.safeParse({ id: ID, description: `${CEILING}x` }).success,
    ).toBe(false)
  })

  it('refuses rather than truncates, so half a sentence never reaches her prompt', () => {
    // `.max()` BEFORE `.transform()`, asserted rather than reviewed. `coerceNinaNotes` slices,
    // because it coerces a stored blob and has nobody to tell; this has an operator to tell.
    const parsed = chatPhotoDescriptionSchema.safeParse({ id: ID, description: `${CEILING}x` })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('unreachable')
  })

  it('normalises the way coerceNinaNotes does, minus the slice', () => {
    const parsed = chatPhotoDescriptionSchema.parse({
      id: ID,
      description: '  she is underwater\r\n\r\n\r\n\r\nfins on  ',
    })
    expect(parsed.description).toBe('she is underwater\n\nfins on')
  })

  it('accepts an empty box, because the clear is the action policy and not the schema shape', () => {
    // No `.min(1)`. Whitespace normalises to '' and parses; the action turns that into NULL (D1).
    expect(chatPhotoDescriptionSchema.parse({ id: ID, description: '   \n  ' }).description).toBe('')
  })

  it('refuses an id that is not nanoid(12), a missing description and a non-string', () => {
    expect(chatPhotoDescriptionSchema.safeParse({ id: 'short', description: 'x' }).success).toBe(
      false,
    )
    expect(chatPhotoDescriptionSchema.safeParse({ id: ID }).success).toBe(false)
    expect(chatPhotoDescriptionSchema.safeParse({ id: ID, description: 7 }).success).toBe(false)
  })

  it('does not police what the model was told to write', () => {
    // The describe prompt forbids digits, caps the length at 140 words and demands one paragraph.
    // Those are instructions to a VENDOR. Here the operator is the witness, and he is allowed to
    // write a number if the number is true.
    const parsed = chatPhotoDescriptionSchema.safeParse({
      id: ID,
      description: 'his watch reads 42.2 km\n\nand the sign behind him says Tebet',
    })
    expect(parsed.success).toBe(true)
  })
})
```

**7d — the mocked half's wiring.** Add the spy beside its siblings at :326, add the key to the
`@/lib/nina/queries` factory at :369, and add the default in `beforeEach` at :421.

Insert after `const updateNinaChatPhotoBlob = vi.fn()` (:326):

```ts
const updateNinaChatPhotoDescription = vi.fn()
```

Insert into the `vi.mock('@/lib/nina/queries', …)` factory, after the `updateNinaChatPhotoBlob`
line (:369):

```ts
  updateNinaChatPhotoDescription: (...args: unknown[]) => updateNinaChatPhotoDescription(...args),
```

Insert into `beforeEach`, after `updateNinaChatPhotoBlob.mockResolvedValue({ id: IMAGE_ID })` (:421):

```ts
  updateNinaChatPhotoDescription.mockResolvedValue({ id: IMAGE_ID })
```

**7e — append at the end of the file, after :566:**

```ts
/**
 * `editChatPhotoDescriptionAction` — R2's write.
 *
 * `@/lib/admin/chatPhotoSchema` stays REAL in this file (the mock header at :304-306 says so and
 * why), so these cases exercise the actual normalisation and the actual ceiling, not a stub of them.
 * The SQL the action ends up issuing is asserted separately, in
 * `tests/nina.chatPhotoDescription.test.ts`, for the reason `tests/nina.softDelete.test.ts`'s header
 * gives: a spy cannot tell "the function was called" from "the predicate was in the WHERE".
 */
describe('editChatPhotoDescriptionAction', () => {
  const PROSE = 'She is sitting on a kerb in low orange light, a bottle in one hand, jacket open.'

  it('writes the trimmed prose and revalidates the collection', async () => {
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: `  ${PROSE}  `,
    })

    expect(updateNinaChatPhotoDescription).toHaveBeenCalledWith(USER, IMAGE_ID, PROSE)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/photos')
    expect(result).toEqual({ ok: true, id: IMAGE_ID })
  })

  it('clears the field to NULL on an empty box, and says what that costs', async () => {
    // D1. NULL is not a new state for the row, and the send path substitutes
    // NINA_DESCRIPTION_UNAVAILABLE for it — so the operator is told, in the `note`.
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: '  \n ',
    })

    expect(updateNinaChatPhotoDescription).toHaveBeenCalledWith(USER, IMAGE_ID, null)
    expect(result.ok).toBe(true)
    expect(result.note).toMatch(/could not see it/)
  })

  it('pays for no model call, schedules no after() pass, and does not re-caption the bubble', async () => {
    // Invariant 5 of the plan set, asserted rather than reviewed. And the last assertion is the
    // phase's own rule: editing what she SAW is not editing what she SAID.
    await actions.editChatPhotoDescriptionAction({ id: IMAGE_ID, description: PROSE })

    expect(afterCallbacks).toHaveLength(0)
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(captionNinaPhoto).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
    expect(setNinaMessageImageDescription).not.toHaveBeenCalled()
  })

  it('refuses a row that is not in the collection', async () => {
    getNinaMessageImage.mockResolvedValue(null)
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses one of HIS uploads, because this screen lists only hers', async () => {
    // `getNinaMessageImage` does not filter on `kind`, so this guard is what stops an id for a
    // composer upload reaching a write nobody could see or undo from /admin/photos.
    getNinaMessageImage.mockResolvedValue({ ...imageRow, kind: 'upload' })
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(result).toEqual({ ok: false, error: 'That one is his upload, not hers.' })
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
  })

  it('refuses an over-long description without reading the row at all', async () => {
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: 'x'.repeat(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS + 1),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain(String(ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS))
    expect(getNinaMessageImage).not.toHaveBeenCalled()
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
  })

  it('gates on requireAdmin BEFORE it looks at the payload', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'))

    await expect(
      actions.editChatPhotoDescriptionAction({ id: IMAGE_ID, description: PROSE }),
    ).rejects.toThrow('not an admin')

    expect(getNinaMessageImage).not.toHaveBeenCalled()
    expect(updateNinaChatPhotoDescription).not.toHaveBeenCalled()
  })

  it('reports a lost race as a miss rather than a success', async () => {
    // The row was there at the re-read and gone (or no longer `generated`) by the write.
    updateNinaChatPhotoDescription.mockResolvedValue(null)
    const result = await actions.editChatPhotoDescriptionAction({
      id: IMAGE_ID,
      description: PROSE,
    })

    expect(result).toEqual({ ok: false, error: 'That photo is not in the collection.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
```

**Impact:** the existing 40 cases in this file are untouched. The one edit inside shared machinery is
a new key in the `@/lib/nina/queries` mock factory, which is additive — an unmocked export becomes
`undefined` in a factory mock, so the key has to be there for the action to be callable.

---

### Step 8: Assert the statement, not the spy

**File:** `tests/nina.chatPhotoDescription.test.ts` — **new file.**

**Change:** the `installFakeDb` half of the guard. `tests/admin.chatPhotos.test.ts` mocks
`@/lib/nina/queries` wholesale, so by construction it cannot answer "was `kind = 'generated'` in the
WHERE" — and that clause is the difference between this write being reachable from `/admin/photos`'s
set and being reachable from the whole table. `tests/nina.softDelete.test.ts`'s header states the
split and the reason two owners of `@/lib/db` cannot live in one file.

**It deliberately enqueues NO rows.** `.returning(imageColumns)` is a positional projection, so a
fixture row would encode `imageColumns`'s arity — and Phase 1 adds two columns to it. The miss
branch is the branch the action's refusal depends on, and it stays true whatever Phase 1 does.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, uninstallFakeDb, type FakeDb } from './support/fakeDb'

/**
 * **The one statement R2 adds, read as SQL rather than as a spy.**
 *
 * `tests/admin.chatPhotos.test.ts` asserts the ACTION's branching with `@/lib/nina/queries` mocked,
 * which by construction cannot answer "was `kind = 'generated'` in the WHERE". That clause is the
 * whole difference between a write reachable from `/admin/photos`'s set and a write reachable from
 * the whole table, so it is asserted here, against generated SQL.
 *
 * The split — and the reason it is a second FILE and not a second `describe` — is
 * `tests/nina.softDelete.test.ts`'s, verbatim in shape: `installFakeDb()` seeds
 * `globalThis.__runInsightsDb` BEFORE `lib/db` is first imported, and two owners of `@/lib/db` in
 * one file is not a thing.
 *
 * ── IT ASSERTS THE PREDICATE AND THE SET LIST, AND NOT THE RETURNED ROW ────────────────────
 * `.returning(imageColumns)` is a positional projection, so a fixture row would have to encode
 * `imageColumns`'s arity — and phase 1 of this plan set adds two columns to it. Enqueuing NO rows
 * asserts the MISS branch instead, which is the branch the action's refusal depends on, and it stays
 * true whatever phase 1 does to the projection. Do not "fix" this by adding a fixture row.
 *
 * ── THE UNQUALIFIED SPELLINGS ARE DELIBERATE ───────────────────────────────────────────────
 * `'"user_id" = $'` matches both `"user_id" = $1` and `"nina_message_images"."user_id" = $1`,
 * because drizzle qualifies a column in a SELECT and may not in an UPDATE and neither spelling is
 * the point. `tests/nina.softDelete.test.ts:56-60` makes the same note about `HIDDEN_SKIPPED`.
 */

type Queries = typeof import('@/lib/nina/queries')

const USER = 'abc123XYZ_-9'
const ID = 'aB3_dEf-hI9k'

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

describe('updateNinaChatPhotoDescription', () => {
  it('is owner-scoped, id-scoped and generated-only, in ONE statement', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'she is underwater, fins on')

    const { sql, params } = fake.only()
    expect(sql).toContain('update "nina_message_images"')
    expect(sql).toContain('"user_id" = $')
    expect(sql).toContain('"id" = $')
    // The clause `setNinaMessageImageDescription` does NOT have, and the reason this is a second
    // statement rather than a wider signature on that one: /admin/photos lists only hers.
    expect(sql).toContain('"kind" = $')
    expect(params).toContain('generated')
    expect(params).toContain(USER)
    expect(params).toContain(ID)
  })

  it('touches `description` and nothing else', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, 'x')

    const { sql } = fake.only()
    expect(sql).toContain('set "description" = $')
    // Correcting a sentence about a photograph is not taking a new one, and it is not re-pointing
    // the row at new bytes either. `created_at` in particular orders /nina/about and /admin/photos.
    expect(sql).not.toContain('"created_at" =')
    expect(sql).not.toContain('"blob_url" =')
    expect(sql).not.toContain('"pathname" =')
    expect(sql).not.toContain('"prompt" =')
    expect(sql).not.toContain('"sort_order" =')
  })

  it('carries a NULL through as a bound parameter — the clear (D1)', async () => {
    fake.enqueue([])
    await queries.updateNinaChatPhotoDescription(USER, ID, null)

    const { sql, params } = fake.only()
    expect(sql).toContain('set "description" = $')
    expect(params[0]).toBeNull()
  })

  it('returns null when no row matched, so the action can refuse', async () => {
    fake.enqueue([])
    await expect(queries.updateNinaChatPhotoDescription(USER, ID, 'x')).resolves.toBeNull()
  })
})
```

**Impact:** a new test file, no production code touched.

> **Note for the implementer:** the four `toContain` string literals are drizzle-dialect spellings.
> If one does not match, print `fake.only().sql` once and correct the literal — do **not** weaken the
> assertion to `toContain('description')`, which would pass on a statement with no WHERE at all.

---

## Verification

**Build:** `npm run lint && npm run typecheck`
(`npm run typecheck` runs `next typegen` first, which is what proves `app/admin/photos/page.tsx`'s
`PageProps<'/admin/photos'>`; a bare `tsc --noEmit` does not.)

**Tests:**

```
npx vitest run tests/admin.chatPhotos.test.ts tests/nina.chatPhotoDescription.test.ts
npx vitest run
```

Baseline confirmed before planning: `tests/admin.chatPhotos.test.ts` is **40 passed** at
`origin/main` @ `e6c68d6`, so the count after this phase should be 40 + 6 (schema) + 8 (action) = 54,
plus 4 in the new file.

**Manual check.** `.env.local` and `node_modules` are already in place in this worktree, so:

1. `npm run dev -- -p 3100` (**not 3000** — that port is held by a stranger that 302s everything to
   `/login`, and `EADDRINUSE` hides in the log).
   Note that `/admin` needs `ADMIN_EMAILS`, `VAPID_*` and `AUTH_URL`, which are Production-scope on
   Vercel — so this check is a **local** one, not a preview one.
2. Open `/admin/photos`, click a tile. The rail's "What she can see in it" is now a textarea holding
   the row's prose, with `Save` disabled until something changes.
3. Edit a word, press Save. The button spins, the "unsaved" marker clears, and the text stays after
   a hard reload — proving `revalidatePath` plus `force-dynamic` and not local state.
4. Select the box, delete everything, press the button — it reads **Clear** — and confirm the note
   *"Cleared. If this photo comes up again she will say she could not see it and ask him what it
   is."* Reload: the hint line about `after()`'s window is back and the placeholder reads "Not
   described yet."
5. Type into one tile's box **without saving**, then click a different tile. The second tile shows
   its own prose, not the first's. (This is the `key={photo.id}` case; without it, Save on the second
   tile would write the first tile's text.)
6. Paste more than 2000 characters. The browser stops at 2000 (`maxLength`) — the zod refusal is the
   second agreeing check and is only reachable by calling the action directly.
7. `/nina/about` and the chat itself are unchanged: the photograph renders, the viewer opens, and no
   description text appears anywhere outside `/admin` (invariant 3).

**Exit criteria:**

- An operator can rewrite `nina_message_images.description` on `/admin/photos`, and the new text
  survives a reload.
- An empty save is a **decided** outcome: it clears the field to `NULL` and says so on screen.
- The next turn that **attaches** that photograph reads the new text with no invalidation step —
  `resolveAttachment` re-reads the row per send and `lib/nina/actions.ts:634-637` passes the value
  straight through. (A photograph already sitting in the history window does **not** carry its
  description; `dbNinaSourceGateway.readConversation` hardcodes `imageDescriptions: []`, which the
  plan index puts out of scope for the whole set. See Handoffs.)
- No model call, no `after()`, no DDL, no migration, no `nina_messages` write, nothing under
  `components/nina/`.
- `npm run lint`, `npm run typecheck` and `npx vitest run` are all green.

## Handoffs

**To Phase 1 — `components/admin/ChatPhotoDetail.tsx`: nothing. I own it outright.** RECONCILED
(D8). The draft index's optional provenance line is withdrawn from Phase 1's scope, so this file,
`components/admin/chatPhotoModel.ts` and `app/admin/photos/page.tsx` are edited by this phase and no
other. Phases 1 and 2 have no dependency edge and run **concurrently**; that is only safe because
this file now has exactly one owner. Do not add a provenance row to the `<dl>` at :114-152 later
either — after Phase 1's Step 7c this rail lists only rows where both provenance columns are NULL,
so such a row could never render.

**To Phase 1 — `lib/nina/queries.ts`.** My only hunk is an insertion between :1838 and :1840.
Your seven footprints (`NinaImageRow` :203, `NinaImageInsert` :218, `imageColumns` :517,
`insertNinaMessageImages` :1435, `listNinaMessageImages` :1477, `isOriginalPhoto` +
`generatedChatPhotoScope` :1563, `updateNinaChatPhotoBlob` :1678) do not overlap mine — the lowest
ends near :1704, ~134 lines above me. `listNinaChatPhotos` (:1589) and `countNinaChatPhotos`
(:1623) are edited by neither of us; they inherit your filter through the scope helper. Your two new
keys on `imageColumns` widen `updateNinaChatPhotoDescription`'s return type additively; no edit from
me is needed and none should be made on my behalf. And per your Handoff H2, my `.set()` touches
`description` **only** — the provenance columns stay out of it.

**To Phase 1 — `tests/nina.chatPhotoDescription.test.ts`.** It deliberately enqueues no rows so it
does not encode `imageColumns`'s arity. When you add the two columns, this file keeps passing. Do not
add a fixture row to "complete" it.

**Left for a card — `nina_avatars.description`.** The plan index rules the album's description out of
scope ("the user named one field on one screen"). Making `components/admin/explorer/SelectionPane.tsx`
editable would need its own schema, its own action and its own `setNinaAvatarDescription`-shaped
statement; nothing here generalises to it and nothing here should be widened to try.

**Left for a card — the history window's `imageDescriptions`.** `dbNinaSourceGateway.readConversation`
hardcodes `imageDescriptions: []` for window rows, so a description corrected here reaches Nina only
on a turn that re-**attaches** the photograph. The plan index records this as out of scope for the
whole set, for the stated reason that fixing it changes what she knows in every conversation and
nobody asked for it. My exit criterion is worded to the attach path only, on purpose.

**Left for a card — re-captioning the bubble from an edited description.** One line
(`scheduleChatPhotoCaption(userId, id)`) and deliberately absent: it rewrites a sentence Nina already
said in the runner's visible conversation because an operator fixed a private note. It needs its own
decision, not a drive-by.

**Not done, and not to be done by anyone as a "cleanup" — widening
`setNinaMessageImageDescription`.** Its signature stays `(userId, id, description: string) =>
Promise<boolean>` with no `kind` clause. Step 3's docstring gives the three reasons; collapsing the
two statements would silently make the admin write reachable for his composer uploads.

**Not done — an index on `nina_message_images.kind`.** `generatedChatPhotoScope`'s docstring already
argues the residual predicate is correct at this table's size, and invariant 8 forbids the migration
either way.

## Rollback

`git revert` the commit. That is the whole of it — there is no migration, no meta journal entry and
no schema change, so the tree goes straight back to a read-only field and every existing description
is exactly where it was.

Two things the revert does **not** undo, and neither needs undoing:

- **A description an operator typed** stays in the column. `description` is nullable `text` and has
  always been free prose; a human's paragraph is indistinguishable from `glm-4.6v`'s to every reader.
- **A description an operator cleared** stays `NULL`. That is the same state a Replace produces and
  the same state a fresh Add starts in, and it degrades through `NINA_DESCRIPTION_UNAVAILABLE`
  exactly as those do. Re-earning it is `scheduleChatPhotoCaption`'s job on the next Replace, or a
  hand-written line once the phase is back.
