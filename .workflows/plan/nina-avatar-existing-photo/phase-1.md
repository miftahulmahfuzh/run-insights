# Phase 1: Add `set_avatar_from_photo` — adopt an existing photo as Nina's avatar from chat

**Plan set:** `NINA_AVATAR_EXISTING_PHOTO_PLAN.md`
**Analysis:** `20260917-100827-K9F2_code_analyzer.md`
**Satisfies:** R2 — Nina changes her profile picture to a **specific existing photo** the runner selects, with no new generation job
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

After this phase there is a third avatar-shaped tool in `NINA_FULL_TOOL_SET`: `set_avatar_from_photo`.
Calling it takes a photograph that **already exists** — attached to the runner's current message, or
the most recent original photo shown earlier in the same chat session — copies its bytes into a fresh
`nina_avatars` row (`source: 'operator'`, `source_key = 'chat-photo:<imageId>'`), makes it current and
marks it announced in the same synchronous operation, so she can truthfully say "sudah gw pasang" in
the same reply. No image-generation job, no vendor LLM call, no GitHub dispatch, no migration.

---

## Interface Contract

**Deletes:** none
**Renames:** none

**Creates:**
- `lib/nina/queries/images.ts` → `getLatestOriginalNinaSessionPhoto(userId, sessionId)` (exported through the `lib/nina/queries.ts` barrel by its existing `export * from './queries/images'`)
- `lib/nina/avatarAdopt.ts` (new file) → `NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX`, `type NinaAdoptTarget`, `type NinaAvatarAdoptResult`, `resolveNinaAdoptTarget`, `adoptNinaChatPhotoAsAvatar`, `promoteNinaAvatarAsCurrent`, `setNinaAvatarFromExistingPhoto`
- `lib/nina/prompts/tools.ts` → `SET_AVATAR_FROM_PHOTO_TOOL` (`tools.ts:403`, after `SET_AVATAR_TOOL`)
- `lib/nina/avatartools.ts` → `SetAvatarFromPhotoArgsSchema`, `SET_AVATAR_FROM_PHOTO_ANSWERS`, `handleSetAvatarFromPhoto`
- `tests/nina.avatarFromPhoto.test.ts` (new file)

**Signature changes:** none. Every existing exported signature is untouched.

**Value changes (additive):**
- `NINA_TOOLS` (`lib/nina/prompts/tools.ts:409`) grows from 7 entries to 8 — `set_avatar_from_photo` appended last.
- `NINA_FULL_TOOL_SET` (`lib/nina/avatartools.ts:114`) grows from 7 tools / 6 handlers to 8 / 7.
- `SET_AVATAR_TOOL.description` (`lib/nina/prompts/tools.ts:381`) gains **one appended sentence**; the two existing sentences stay byte-identical.
- `NINA_PROMPT_VERSION` (`lib/nina/prompts/index.ts:127`) `10` -> `11`. Required by that file's own standing rule ("a schema edit is a prompt edit; bump by hand in the same commit"). This is the set's single bump.

**Requires (from earlier phases):** none — this phase is first and last in the set.

**Leaves alone (owned by nobody in this set; do not touch):**
`lib/admin/**` (read-only reference; `lib/nina/` must never import from `lib/admin/`), `lib/nina/tools.ts`,
`lib/nina/turn.ts`, `lib/nina/turnrun.ts`, `lib/nina/context.ts`, `lib/nina/imagetools.ts`,
`lib/nina/avatargen.ts`, `lib/nina/promises.ts`, `lib/nina/actions/send.ts`, `drizzle/**` (no migration).

### Flagged deviation from the phase brief — reference rows

The brief's exit criterion *"calling it against a reference row (re-share) refuses cleanly"* is kept
**verbatim, at the adoption core**: `adoptNinaChatPhotoAsAvatar(userId, <a reference row's id>)`
returns `{ ok: false, kind: 'reference' }` and moves no bytes — the same rule
`setChatPhotoAsAvatarAction` enforces.

But taken as the *tool's* behaviour it would defeat one third of R2. `resolveAttachment`
(`lib/nina/actions/send.ts:188-256`) writes a **reference row for every Media/album attach** — its own
docstring says so: *"it is only ever called for a photograph the server ALREADY owns, so the row it
writes is a reference by definition"*. So the user's own second R2 example ("i just attached an image
from Media, with message 'ganti profpic lu pake ini'") would always refuse.

The resolution is a **resolver** that flattens before the core is ever called, and never copies a
reference's bytes:

| Row the current message carries | What the resolver hands back | Bytes copied |
|---|---|---|
| original (fresh upload, or her generation) | `{ kind: 'image', imageId: row.id }` | one copy, once, then deduped by `source_key` |
| `sourceImageId` set (a re-shown chat photo) | `{ kind: 'image', imageId: row.sourceImageId }` — `ninaPhotoProvenance` (`lib/nina/attach.ts:221`) guarantees this already names the ORIGINAL, never another reference | one copy of the *original*, deduped by its `source_key` |
| `sourceAvatarId` set (attached from Media/album) | `{ kind: 'avatar', avatarId: row.sourceAvatarId }` — those bytes are **already** a `nina_avatars` row | **zero** — just promote it |

This is strictly more conservative than the brief (the avatar branch writes no blob and no row at
all), it keeps invariant 4's actual purpose ("refused rather than *copied*"), and it is two `if`s in
one function if a reviewer wants it reverted. Test case 8 pins it.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/queries/images.ts` | modify | new `getLatestOriginalNinaSessionPhoto` inserted at `:309`, in §5, after `getNinaMessageImagesForMessages` (ends `:308`) |
| `lib/nina/avatarAdopt.ts` | create | the adoption core: resolve → refuse-if-reference → dedupe-by-`source_key` → copy bytes → set current → mark announced |
| `lib/nina/prompts/tools.ts` | modify | `:381` one appended sentence on `SET_AVATAR_TOOL.description`; `:403` new `SET_AVATAR_FROM_PHOTO_TOOL`; `:409-417` append it to `NINA_TOOLS` |
| `lib/nina/prompts/index.ts` | modify | `:127` `NINA_PROMPT_VERSION` `10` -> `11`, with the changelog comment the file's convention requires |
| `lib/nina/avatartools.ts` | modify | `:5-9` imports; `:58` `SetAvatarFromPhotoArgsSchema` + `SET_AVATAR_FROM_PHOTO_ANSWERS`; `:106` `handleSetAvatarFromPhoto`; `:114-116` extend `NINA_FULL_TOOL_SET` |
| `tests/nina.prompts.test.ts` | modify | `:415-425` the exact-tool-name list grows to eight |
| `tests/nina.avatarFromPhoto.test.ts` | create | the phase's own suite |

---

## Implementation Steps

### Step 1: The session-scoped "most recent original photo" query

**File:** `lib/nina/queries/images.ts:309` — insert immediately after `getNinaMessageImagesForMessages`
(which closes at `:308`) and before the `findNinaImageByContentHash` docstring that opens at `:310`.

**Change:** one new exported read. No import changes are needed — `and`, `desc`, `eq` and
`ninaMessages` are already imported at `:1-16`, and `isOriginalPhoto` is a hoisted function
declaration at `:490` (this file already calls it from above its definition, at `:253`).

**Code:**

```ts
/**
 * **"What photograph is he pointing at?"** — the fallback half of R2's resolution, and the only new
 * read the chat-side avatar adoption needs.
 *
 * `set_avatar_from_photo` (`lib/nina/avatarAdopt.ts`) prefers whatever is attached to the runner's
 * CURRENT message. When he attached nothing — "ganti profpic lu pake foto ini", two minutes after
 * the photo itself, which is exactly the production turn this feature was written for — the
 * referent is the most recent photograph the conversation has shown. This answers that, and nothing
 * wider: one session, one row.
 *
 * ── ORIGINALS ONLY, AND THE PREDICATE IS THIS MODULE'S OWN ───────────────────────────────────
 * `isOriginalPhoto()` is in the WHERE for `listNinaMessageImages`' reason and one sharper one: the
 * caller's next act is to COPY these bytes into `nina_avatars`, and a reference renders bytes that
 * already live somewhere else — copying one would file a second copy of a photograph the original
 * still owns. That is `setChatPhotoAsAvatarAction`'s rule, enforced here at the read so the chat
 * path cannot reach a reference by accident.
 *
 * ── THE SESSION COMES FROM `nina_messages`, SO THIS JOINS ────────────────────────────────────
 * `nina_message_images` carries no `session_id` — a photograph is scoped by the bubble that holds
 * it. The `innerJoin` is on `nina_messages`' primary key, and it also drops an ORPHANED photograph
 * (`message_id IS NULL` after a session delete, `ON DELETE SET NULL`), which is correct: a
 * photograph whose bubble is gone is not something "this conversation just showed".
 *
 * `user_id` is spelled on BOTH tables. The image-side predicate is the indexed one
 * (`nina_message_images_user_created_idx`); the message-side one is the ownership belt-and-braces
 * this module's rule 2 asks for, and it costs nothing on a primary-key join.
 *
 * `(created_at desc, id desc)` is `listNinaMessageImages`' ordering with the same `id` tiebreak,
 * because rows written in one statement tie on `created_at`. The projection is `imageColumns`, so
 * the caller gets `pathname` (it needs the container), `description` (it seeds the album row's) and
 * the measurements, in the one row shape this module has.
 *
 * `null` for "no such session", "not yours" and "nothing original in it" alike — this module's
 * standing rule, and here all three want the same next step: refuse, and ask him which photo.
 */
export async function getLatestOriginalNinaSessionPhoto(
  userId: string,
  sessionId: string,
): Promise<NinaImageRow | null> {
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .innerJoin(ninaMessages, eq(ninaMessages.id, ninaMessageImages.messageId))
    .where(
      and(
        eq(ninaMessageImages.userId, userId),
        eq(ninaMessages.userId, userId),
        eq(ninaMessages.sessionId, sessionId),
        isOriginalPhoto(),
      ),
    )
    .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:** one new public name on the `lib/nina/queries.ts` barrel (it already carries
`export * from './queries/images'` at `queries.ts:64`, so no barrel edit). No index is added; the read
is the `nina_message_images_user_created_idx` range scan plus a primary-key probe per candidate, with
`session_id` and the two provenance columns residual — the same shape `mediaCollectionScope` already
argues for at `:610-614`.

---

### Step 2: The adoption core

**File:** `lib/nina/avatarAdopt.ts` — new file.

**Change:** the whole module. It is a plain server module (not `'use server'`), so it may export
predicates and helpers as well as async work — the rule `lib/admin/ninaAlbumAvatarActions.ts:44-48`
states is about `'use server'` modules and does not reach this one.

**Code:**

```ts
import 'server-only'

import { put } from '@vercel/blob'

import { newId } from '@/lib/id'
import { NINA_BLOB_PREFIX } from '@/lib/nina/images'
import {
  getNinaAvatar,
  getNinaAvatarBySourceKey,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  getNinaMessagesByIds,
  getLatestOriginalNinaSessionPhoto,
  insertNinaAvatars,
  markNinaAvatarAnnounced,
  setCurrentNinaAvatar,
  type NinaAvatarRow,
  type NinaImageRow,
} from '@/lib/nina/queries'

/**
 * **R2: a photograph that already exists becomes her face, unchanged.** The chat-side counterpart of
 * `/admin/photos`' `setChatPhotoAsAvatarAction`, and the third avatar path in the app:
 *
 *   · `generateNinaAvatar` (`avatargen.ts`) — a NEW photograph, minutes later, announced by the cron.
 *   · `setChatPhotoAsAvatarAction` (`lib/admin/`) — an operator adopts one from `/admin/photos`.
 *   · this — the runner points at one mid-conversation and she adopts it before the reply goes out.
 *
 * ── WHY THIS DOES NOT IMPORT THE ADMIN ONE ────────────────────────────────────────────────────
 * `lib/admin` depends on `lib/nina`, never the reverse — every file read while planning this phase
 * obeys it, and `setChatPhotoAsAvatarAction` is a `'use server'` action behind `requireAdmin()`
 * besides, so it is not callable from a chat turn even if the layering allowed it. What is
 * duplicated is a CLOSED three-case lookup table (`jpg|png|webp` -> content type) and one pathname
 * template. That is a bounded, stable copy of a pure mapping, not of a business rule; the two are
 * held together by tests, exactly as `'chat-photo:'` already is across
 * `lib/nina/queries/images.ts:578` and `lib/admin/ninaAlbumAvatarActions.ts:145`.
 *
 * ── AND WHY IT MARKS THE ROW ANNOUNCED IN THE SAME BREATH ─────────────────────────────────────
 * `set_avatar` must NOT let her claim the change happened: the photograph does not exist yet, and
 * `announced_at IS NULL` is what `getUnannouncedCurrentNinaAvatar` polls so phase 10's cron can
 * speak once the camera lands. Here there is no camera. The bytes exist, the copy is synchronous,
 * and she answers in the same turn — so leaving `announced_at` NULL would queue the cron to announce
 * a change she has already described a moment earlier. `setCurrentNinaAvatar` re-arms it to NULL by
 * design; `markNinaAvatarAnnounced` immediately after is what closes it, and the order matters.
 */

/**
 * The dedupe key every adopted row carries, and the whole of invariant 5's idempotence. **The third
 * spelling of this prefix in the repo** — `lib/nina/queries/images.ts:578` reads it inside
 * `generatedChatPhotoScope`'s `NOT EXISTS`, `lib/admin/ninaAlbumAvatarActions.ts:145` writes it —
 * and the three cannot be one import (a db module must not import an actions module, a `'use
 * server'` module may not export a constant, and `queries/images.ts` builds it in SQL, not in TS).
 * They are pinned by test instead: `tests/nina.photoRefs.test.ts`, `tests/admin.chatPhotoAdoption.test.ts:132`
 * and this phase's `tests/nina.avatarFromPhoto.test.ts`.
 *
 * Exported so the test can pin it against the literal rather than re-spell it.
 */
export const NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX = 'chat-photo:'

/** The three containers the album accepts — `ADMIN_AVATAR_EXTS`' set, spelled on this side of the
 * layering. See the module header for why it is copied and not imported. */
const NINA_AVATAR_EXTS = ['jpg', 'png', 'webp'] as const
type NinaAvatarExt = (typeof NINA_AVATAR_EXTS)[number]

/** `contentTypeForAvatarExt`'s three pairs, so the `put` names the type the container actually is. */
function contentTypeForNinaAvatarExt(ext: NinaAvatarExt): string {
  switch (ext) {
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
  }
}

/** The container a chat photograph arrives in, or `null` if it is not one the album accepts. */
function ninaAvatarExtFor(pathname: string): NinaAvatarExt | null {
  const ext = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase()
  return (NINA_AVATAR_EXTS as readonly string[]).includes(ext) ? (ext as NinaAvatarExt) : null
}

/**
 * `nina/<userId>/avatar-<id>.<ext>` — `adminAvatarPathname`'s form, same prefix, same `avatar-`
 * segment, same id length, so `scripts/blob-reap.mjs` will one day be taught one pattern and not
 * two. `NINA_BLOB_PREFIX` is IMPORTED (ruling A6: one definition, in `lib/nina/images.ts`).
 */
function ninaAdoptedAvatarPathname(userId: string, id: string, ext: NinaAvatarExt): string {
  return `${NINA_BLOB_PREFIX}${userId}/avatar-${id}.${ext}`
}

/**
 * Which photograph "this one" is, resolved from STRUCTURE and never from a model-supplied id — the
 * model has never seen one (`lib/nina/context.ts` hands it `imageDescriptions: string[]`, prose
 * only), so an id-shaped tool argument could only ever be a guess.
 *
 * `'avatar'` is the Media/album re-share: those bytes are ALREADY a `nina_avatars` row, so the
 * adoption is a promotion and nothing is copied. See the phase plan's flagged-deviation table.
 */
export type NinaAdoptTarget =
  | { kind: 'image'; imageId: string }
  | { kind: 'avatar'; avatarId: string }
  | { kind: 'none' }

/**
 * What the adoption did, or why it did not. Every `ok: false` is a TRUE answer to a legitimate
 * request — the caller returns them with `isError: false`, per `lib/nina/tools.ts`' ruling (g).
 *
 * `changed` distinguishes "it is hers now" from "it already was", so she does not pretend to have
 * just changed a picture that has been current since yesterday.
 */
export type NinaAvatarAdoptResult =
  | { ok: true; avatarId: string; changed: boolean }
  | { ok: false; kind: 'missing' | 'reference' | 'unsupported' | 'copy_failed' }

/**
 * Resolve the referent, in the one order that matches how a person points at a photograph:
 *
 *   1. **Attached to the message he just sent.** "ganti profpic lu pake ini" with a tile above it.
 *      `getNinaMessageImagesForMessages` deliberately does NOT filter references (it is the bubble
 *      renderer's read), which is exactly what this needs — a Media attach IS a reference and is
 *      still a photograph he pointed at. It comes back ordered by `sort_order`, so the first entry
 *      is the leftmost tile, which is what "ini" means when he attached several.
 *   2. **Otherwise, the last photograph this conversation showed.** The production turn: the photo
 *      landed at 02:41:08 and "ganti profpic lu pake foto ini" at 02:43:47, on a message with no
 *      attachment of its own.
 *
 * A proactive turn has no runner message and therefore no referent — `{ kind: 'none' }`, and she
 * asks which one.
 */
export async function resolveNinaAdoptTarget(
  userId: string,
  sourceMessageId: string | null,
): Promise<NinaAdoptTarget> {
  if (sourceMessageId == null) return { kind: 'none' }

  const attached = await getNinaMessageImagesForMessages(userId, [sourceMessageId])
  const first = attached[0]
  if (first != null) return flattenToOriginal(first)

  const [message] = await getNinaMessagesByIds(userId, [sourceMessageId])
  if (message == null) return { kind: 'none' }

  const photo = await getLatestOriginalNinaSessionPhoto(userId, message.sessionId)
  if (photo == null) return { kind: 'none' }
  return { kind: 'image', imageId: photo.id }
}

/**
 * A reference row names bytes that live elsewhere; the adoption must act on wherever they live, not
 * on the pointer. `ninaPhotoProvenance` (`lib/nina/attach.ts:221`) guarantees `sourceImageId` always
 * names an ORIGINAL — it flattens a re-attached reference to its own source — so this is one hop and
 * never a chain. `sourceAvatarId` wins when both are set, because an album face re-attached twice
 * carries both and the album row is the copy that already exists.
 */
function flattenToOriginal(row: NinaImageRow): NinaAdoptTarget {
  if (row.sourceAvatarId != null) return { kind: 'avatar', avatarId: row.sourceAvatarId }
  if (row.sourceImageId != null) return { kind: 'image', imageId: row.sourceImageId }
  return { kind: 'image', imageId: row.id }
}

/**
 * **The core, and the function the phase's exit criteria are written against.** Given ONE
 * `nina_message_images.id`: refuse a reference, find-or-copy into `nina_avatars`, promote, announce.
 *
 * The row is re-read here even when the resolver just held it. One extra indexed point read per
 * adoption buys a core that is correct when called with an id from anywhere — and an id is a claim
 * until `getNinaMessageImage`'s `user_id` predicate has proved it.
 */
export async function adoptNinaChatPhotoAsAvatar(
  userId: string,
  imageId: string,
): Promise<NinaAvatarAdoptResult> {
  const row = await getNinaMessageImage(userId, imageId)
  if (row == null) return { ok: false, kind: 'missing' }

  /* Invariant 4, and `setChatPhotoAsAvatarAction`'s rule verbatim: a row carrying either provenance
   * column re-SHOWS a photograph that lives elsewhere, and adopting it would file a second copy of
   * bytes the original still owns. The tool never reaches this branch — `resolveNinaAdoptTarget`
   * flattens first — but the core must be correct on its own. */
  if (row.sourceAvatarId != null || row.sourceImageId != null) {
    return { ok: false, kind: 'reference' }
  }

  const ext = ninaAvatarExtFor(row.pathname)
  if (ext == null) return { ok: false, kind: 'unsupported' }

  const sourceKey = `${NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX}${row.id}`

  /* RE-ADOPTION IS A CONSTRAINT DECISION, NOT A COUNT. The lookup is the policy — a second "pakai
   * foto ini" finds the first copy BEFORE any bytes move and just re-wears it. The
   * `nina_avatars_user_source_key_unq` index is the backstop for the race the lookup cannot close;
   * `copyChatPhotoIntoNinaAlbum` re-reads by key when the INSERT conflicts away. */
  const existing = await getNinaAvatarBySourceKey(userId, sourceKey)
  const avatar = existing ?? (await copyChatPhotoIntoNinaAlbum(userId, row, sourceKey, ext))
  if (avatar == null) return { ok: false, kind: 'copy_failed' }

  return promoteAndAnnounce(userId, avatar)
}

/**
 * The Media/album branch: the bytes are already a `nina_avatars` row, so there is nothing to copy
 * and nothing to dedupe — only the crown to move. Zero blob calls, zero inserts.
 */
export async function promoteNinaAvatarAsCurrent(
  userId: string,
  avatarId: string,
): Promise<NinaAvatarAdoptResult> {
  const row = await getNinaAvatar(userId, avatarId)
  if (row == null) return { ok: false, kind: 'missing' }
  return promoteAndAnnounce(userId, row)
}

/**
 * The shared tail, and the two statements invariant 6 is about.
 *
 * `setCurrentNinaAvatar` re-arms `announced_at` to NULL (its own docstring: "a hand-changed avatar
 * makes her speak") and is idempotent when the row is already current. `markNinaAvatarAnnounced`
 * then closes it, in this same request, because she is about to say so in this same reply. Its
 * return is ignored on purpose: `false` means the row was already announced, which is the state we
 * wanted anyway.
 *
 * `changed` is read BEFORE the promotion, since after it the answer is always "current".
 */
async function promoteAndAnnounce(
  userId: string,
  avatar: NinaAvatarRow,
): Promise<NinaAvatarAdoptResult> {
  const changed = !avatar.isCurrent
  const promoted = await setCurrentNinaAvatar(userId, avatar.id)
  if (!promoted) return { ok: false, kind: 'missing' }
  await markNinaAvatarAnnounced(userId, avatar.id)
  return { ok: true, avatarId: avatar.id, changed }
}

/**
 * `fetch` the chat photograph and `put` it beside her album as `avatar-`, then insert the row.
 * **BYTES FIRST, ROWS SECOND** — a failed copy writes nothing, while a failed insert at worst leaves
 * an orphan object, which is the recoverable direction and `scripts/blob-reap.mjs`' domain.
 *
 * The row records `put`'s RETURN and never the requested pathname: `addRandomSuffix: true` rewrites
 * it, and a row pointing at the requested form would point at an object that does not exist.
 *
 * `source: 'operator'` — the `NinaAvatarSource` member that had zero writers until now
 * (`lib/db/schema/nina/avatars.ts:16`), and the semantically exact one: a PERSON, not the generator,
 * picked this exact photograph. `'generated'` is the model-authored path and `'admin'` is
 * `/admin`'s; neither is true here.
 *
 * `description` is seeded from the chat row — the same bytes `glm-4.6v` already described, so
 * adopting a described photograph costs no second vendor call. A NULL simply stays NULL: the album's
 * deferred describe lives in `lib/admin/ninaAlbumDeferredDescribe.ts` and this layer must not reach
 * for it. See Handoffs.
 *
 * Never throws. A vendor-shaped failure becomes `null`, becomes `{ ok: false, kind: 'copy_failed' }`,
 * becomes one sentence she says in her own voice — an unhandled rejection inside a chat turn would
 * cost the whole reply over one tool call.
 */
async function copyChatPhotoIntoNinaAlbum(
  userId: string,
  row: NinaImageRow,
  sourceKey: string,
  ext: NinaAvatarExt,
): Promise<NinaAvatarRow | null> {
  try {
    const response = await fetch(row.blobUrl)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()

    const stored = await put(ninaAdoptedAvatarPathname(userId, newId(), ext), bytes, {
      access: 'public',
      addRandomSuffix: true,
      contentType: contentTypeForNinaAvatarExt(ext),
    })

    const [inserted] = await insertNinaAvatars(userId, [
      {
        blobUrl: stored.url,
        pathname: stored.pathname,
        source: 'operator',
        folder: '',
        filename: null,
        sourceKey,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        description: row.description,
      },
    ])
    if (inserted != null) return inserted

    /* The unique index raced the lookup — something adopted this photograph between the read and the
     * insert. The existing row is what he meant; the second object is the reaper's. */
    return getNinaAvatarBySourceKey(userId, sourceKey)
  } catch (cause) {
    console.error(
      '[nina] chat-photo avatar adoption copy failed',
      { id: row.id, pathname: row.pathname },
      cause,
    )
    return null
  }
}

/**
 * Resolve, then adopt. The one function `handleSetAvatarFromPhoto` calls, so the handler stays what
 * a handler should be: validate, call, decide what she is told.
 */
export async function setNinaAvatarFromExistingPhoto(
  userId: string,
  sourceMessageId: string | null,
): Promise<NinaAvatarAdoptResult | { ok: false; kind: 'none' }> {
  const target = await resolveNinaAdoptTarget(userId, sourceMessageId)
  if (target.kind === 'none') return { ok: false, kind: 'none' }
  if (target.kind === 'avatar') return promoteNinaAvatarAsCurrent(userId, target.avatarId)
  return adoptNinaChatPhotoAsAvatar(userId, target.imageId)
}
```

**Impact:** a new module with no importers until Step 5. It reads and writes only through
`lib/nina/queries`, `@vercel/blob` and `fetch`. No LLM call, no job row, no `after()`, no
`revalidatePath` (a chat turn re-renders through its own path).

---

### Step 3: The tool schema, and the one disambiguating clause each

**File:** `lib/nina/prompts/tools.ts`

**Change 3a — `:381`.** Append one sentence to `SET_AVATAR_TOOL.description`. The two existing
sentences stay byte-identical; this file's header measured that one extra clause can cost a schema
5/6 -> 2/4, so the edit is one short sentence and nothing else.

Replace line 381:

```ts
  description: 'Change your profile picture. Use it when a promise you made has come true.',
```

with:

```ts
  description:
    'Change your profile picture. Use it when a promise you made has come true. ' +
    'This takes a NEW photo — not one already in the chat.',
```

**Change 3b — `:403`.** Insert the new tool between `SET_AVATAR_TOOL` (closes at `:401`) and the
`NINA_TOOLS` docstring (opens at `:403`).

**Code:**

```ts
/**
 * R2, the nina-avatar-existing-photo set. **The tool that takes NO photo.**
 *
 * `set_avatar` and `generate_image` both start a camera; this one moves a photograph that already
 * exists. The production turn that made it necessary is on the record: "ganti profpic lu pake foto
 * ini" produced `tool_calls = set_avatar`, an invented `scene` about a Tebet alleyway, and a
 * brand-new picture — because the ONLY avatar tool that existed was the one that generates. The
 * model formed the right intent and had no tool matching it.
 *
 * ── NO PHOTO ARGUMENT, AND THAT IS NOT AN OVERSIGHT ──────────────────────────────────────────
 * The model never sees a photograph's id. `lib/nina/context.ts` hands it `imageDescriptions` —
 * prose — so an id-shaped property could only ever be hallucinated. The HANDLER resolves the
 * referent from structure: what is attached to the message it is answering, else the last
 * photograph the conversation showed.
 *
 * `because` is the only property, and it is OPTIONAL in the Zod that validates
 * (`SetAvatarFromPhotoArgsSchema`) while being `required` here. That is this file's documented split
 * — *"`required` is documentation and not enforcement"* — applied deliberately: the schema asks her
 * for a reason so the reply can be honest about why, and a call that omits it still works instead of
 * costing a repair round.
 */
export const SET_AVATAR_FROM_PHOTO_TOOL: Anthropic.Tool = {
  name: 'set_avatar_from_photo',
  description:
    'Make a photo already in this chat your profile picture, unchanged. Use it when he points at ' +
    'one — "pakai foto ini" — and does not ask for a new photo.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['because'],
    properties: {
      because: {
        type: 'string',
        description: 'REQUIRED. Why this one, e.g. "he told me to use the photo he just sent".',
      },
    },
  },
}
```

**Change 3c — `:409-417`.** Append it to `NINA_TOOLS`, and correct the count in that constant's
docstring (`:404` says "All seven").

Replace the docstring + array at `:403-417` with:

```ts
/**
 * All eight. **The dispatched set is a SUBSET**: `NINA_CORE_TOOL_SET` (`lib/nina/tools.ts`) ships
 * `send`, `lookup_runs`, `compare_runs`, `aggregate_runs` and `save_memory`; phase 12 adds
 * `generate_image`, phase 13 `set_avatar`, and the nina-avatar-existing-photo set
 * `set_avatar_from_photo` — all three through `extendToolSet`. The array exists so
 * `tests/nina.prompts.test.ts` can walk every schema, not so a caller sends all of it.
 */
export const NINA_TOOLS: readonly Anthropic.Tool[] = [
  SEND_TOOL,
  LOOKUP_RUNS_TOOL,
  COMPARE_RUNS_TOOL,
  AGGREGATE_RUNS_TOOL,
  SAVE_MEMORY_TOOL,
  GENERATE_IMAGE_TOOL,
  SET_AVATAR_TOOL,
  SET_AVATAR_FROM_PHOTO_TOOL,
]
```

**Impact:** `tests/nina.prompts.test.ts:415` pins the exact name list and fails until Step 6.
`tests/integration/ninaImageE2E.int.test.ts:749-752` uses `expect.arrayContaining`, so it is
unaffected. `lib/nina/tools.test.ts:222-251` pins the CORE set only (5 tools, 4 handlers) — unaffected.
`SET_AVATAR_FROM_PHOTO_TOOL` is deliberately **not** added to `lib/nina/prompts/index.ts`' re-export
list (`:143-151`), because `SET_AVATAR_TOOL` is not there either — `avatartools.ts` imports both
straight from `./prompts/tools`.

---

### Step 4: Bump `NINA_PROMPT_VERSION`

**File:** `lib/nina/prompts/index.ts:127`

**Change:** the file header's standing rule — *"`NINA_PROMPT_VERSION` covers the system text AND every
tool schema in `./tools.ts`. Bump it by hand in the same commit"* — and every prior schema-only edit
(9 for `outfit`, 10 for `reminders`) took the bump. Insert the changelog comment above the constant
and change the value.

**Code:** replace `export const NINA_PROMPT_VERSION = 10` at `:127` with:

```ts
/* 11 — the nina-avatar-existing-photo set, R2. **A NEW TOOL, and no system text.** `./tools.ts`
 * gained `SET_AVATAR_FROM_PHOTO_TOOL` (`set_avatar_from_photo`, one optional-in-Zod `because`) and
 * one appended sentence on `SET_AVATAR_TOOL.description`; `./system.ts` was not opened, so
 * `buildNinaSystemPrompt` is byte-identical to version 10's at every tuning and
 * `tests/__snapshots__/nina.prompts.test.ts.snap` passes UNREGENERATED (the snapshot does not cover
 * tool schemas).
 *
 * What she can now do that she could not before: make a photograph that ALREADY EXISTS her profile
 * picture — the one he just attached, or the last one this conversation showed — instead of being
 * forced through `set_avatar`, whose only mode is to invent a scene and start a generation. The
 * production turn on 2026-09-17 02:43 is the evidence: "ganti profpic lu pake foto ini" produced
 * `tool_calls = set_avatar` and a brand-new alleyway photo. A turn whose `body.tools` carries an
 * eighth tool is a turn `nina_turns` has to be able to tell from version 10's, which is the whole job
 * of this constant. This is the SINGLE bump for the set: it is a one-phase set and no other file
 * touches the constant. */
export const NINA_PROMPT_VERSION = 11
```

**Impact:** `tests/nina.prompts.test.ts:553-562` only asserts the constant is a positive integer `>= 3`
— it passes unchanged. `nina_turns.prompt_version` starts recording `11`, which is the point.

---

### Step 5: The handler, and the tool set

**File:** `lib/nina/avatartools.ts`

**Change 5a — `:5-9`.** Widen the imports.

Replace lines 5-9:

```ts
import { SET_AVATAR_TOOL } from './prompts/tools'
import { extendToolSet, type NinaToolAnswer, type NinaToolHandler, type NinaToolSet } from './tools'
import { NINA_CHAT_TOOL_SET } from './imagetools'
import { generateNinaAvatar } from './avatargen'
import { getCurrentNinaAvatar } from './queries'
```

with:

```ts
import { SET_AVATAR_FROM_PHOTO_TOOL, SET_AVATAR_TOOL } from './prompts/tools'
import { extendToolSet, type NinaToolAnswer, type NinaToolHandler, type NinaToolSet } from './tools'
import { NINA_CHAT_TOOL_SET } from './imagetools'
import { setNinaAvatarFromExistingPhoto } from './avatarAdopt'
import { generateNinaAvatar } from './avatargen'
import { getCurrentNinaAvatar } from './queries'
```

**Change 5b — `:58`.** Insert the new schema and answers after `SET_AVATAR_ANSWERS` closes at `:57`
and before the `handleSetAvatar` docstring at `:59`.

**Code:**

```ts
/**
 * `set_avatar_from_photo`'s arguments. `because` is OPTIONAL here while the JSON schema marks it
 * `required` — the deliberate split `lib/nina/prompts/tools.ts` documents (*"`required` is
 * documentation and not enforcement"*). The schema asks her for a reason; Zod refusing a call that
 * omitted one would spend a whole tool round to punish her for a field nothing reads.
 *
 * It stays `z.object` rather than `z.any()` so a non-object payload is still caught, which is the
 * one case that genuinely earns `isError: true`.
 */
export const SetAvatarFromPhotoArgsSchema = z.object({
  because: z.string().trim().max(600).optional(),
})

export type SetAvatarFromPhotoArgs = z.infer<typeof SetAvatarFromPhotoArgsSchema>

/**
 * What she is told, per outcome. Written for a MODEL, never rendered — the same contract as
 * `SET_AVATAR_ANSWERS`, and the deliberate INVERSE of its `queued` line: this change is already
 * done when the handler returns, so she must say so plainly instead of saying the camera is running.
 */
export const SET_AVATAR_FROM_PHOTO_ANSWERS = {
  done:
    'Foto itu sudah jadi profpic lo, beneran, sekarang juga — bukan lagi diproses. ' +
    'Bilang ke dia kalau sudah lo pasang, satu bubble, pakai kalimat lo sendiri. ' +
    'JANGAN bilang lo lagi ambil foto atau lagi nunggu apa-apa.',
  already:
    'Foto itu memang sudah jadi profpic lo dari sebelumnya. Bilang apa adanya, santai, ' +
    'jangan pura-pura baru ganti.',
  reference:
    'Foto itu cuma tampilan ulang dari foto yang aslinya ada di tempat lain, jadi nggak bisa ' +
    'dipakai langsung. Minta dia tunjuk atau kirim foto aslinya. Tanpa istilah teknis.',
  none:
    'Nggak ketahuan foto mana yang dia maksud di obrolan ini. Tanya balik fotonya yang mana, ' +
    'santai, satu kalimat. JANGAN mulai ambil foto baru.',
  unsupported:
    'Bentuk file foto itu nggak bisa dipakai buat profpic. Bilang apa adanya, singkat, ' +
    'tanpa istilah teknis.',
  failed:
    'Gagal masang fotonya. Bilang apa adanya, singkat, tanpa istilah teknis, dan jangan ' +
    'janji ulang di kalimat yang sama.',
} as const
```

**Change 5c — `:106`.** Insert the handler after `handleSetAvatar` closes at `:105` and before the
`NINA_FULL_TOOL_SET` docstring at `:107`.

**Code:**

```ts
/**
 * `set_avatar_from_photo` dispatch — R2. **Never throws**, for `handleSetAvatar`'s reason.
 *
 * ── THE ONE THING IT DOES THAT `handleSetAvatar` MUST NOT ─────────────────────────────────────
 * It lets her say the change has happened, because it has. There is no generation, no job row and
 * no worker: `setNinaAvatarFromExistingPhoto` copies bytes and writes two rows inside this request,
 * and `lib/nina/avatarAdopt.ts` marks the row announced in the same breath so phase 10's
 * `avatar_changed` cron cannot announce it a second time tomorrow.
 *
 * ── AND THE `in_flight` GUARD IS DELIBERATELY ABSENT ─────────────────────────────────────────
 * `handleSetAvatar` refuses while an unannounced GENERATED avatar is in the air, because a second
 * generation would queue two announcements for one conversation. This tool queues none — it
 * announces inline — so the guard has nothing to protect, and applying it would refuse a legitimate
 * "pakai foto ini" just because a selfie happened to be developing.
 *
 * Every refusal below is `isError: false`: these are true answers to a legitimate request, not
 * malformed calls (ruling (g)). The one `isError: true` is a payload that is not an object at all.
 */
export const handleSetAvatarFromPhoto: NinaToolHandler = async (
  args,
  ctx,
): Promise<NinaToolAnswer> => {
  const parsed = SetAvatarFromPhotoArgsSchema.safeParse(args ?? {})
  if (!parsed.success) {
    return {
      answer: { ok: false, why: 'set_avatar_from_photo cuma menerima `because`, berupa teks.' },
      isError: true,
    }
  }

  const result = await setNinaAvatarFromExistingPhoto(ctx.userId, ctx.sourceMessageId)

  if (result.ok) {
    return {
      answer: {
        ok: true,
        note: result.changed
          ? SET_AVATAR_FROM_PHOTO_ANSWERS.done
          : SET_AVATAR_FROM_PHOTO_ANSWERS.already,
      },
      isError: false,
    }
  }

  const note =
    result.kind === 'reference'
      ? SET_AVATAR_FROM_PHOTO_ANSWERS.reference
      : result.kind === 'unsupported'
        ? SET_AVATAR_FROM_PHOTO_ANSWERS.unsupported
        : result.kind === 'none' || result.kind === 'missing'
          ? SET_AVATAR_FROM_PHOTO_ANSWERS.none
          : SET_AVATAR_FROM_PHOTO_ANSWERS.failed

  return { answer: { ok: false, note }, isError: false }
}
```

**Change 5d — `:107-116`.** Extend the set.

Replace the docstring and constant at `:107-116` with:

```ts
/**
 * All eight tools, and the set `lib/nina/turnrun.ts` actually passes.
 *
 * Layered rather than redefined: phase 3 ships four, phase 12 adds `generate_image`, phase 13
 * `set_avatar`, and the nina-avatar-existing-photo set `set_avatar_from_photo`. `extendToolSet`
 * throws at module load on a duplicate name, in the phase that added it — which is the only time
 * anyone can fix it.
 *
 * `set_avatar_from_photo` is added HERE and in the same call as `set_avatar`, so the pair that the
 * model has to choose between can never be split across two sets: a build in which only one of them
 * is dispatchable is the exact failure this feature exists to remove.
 */
export const NINA_FULL_TOOL_SET: NinaToolSet = extendToolSet(NINA_CHAT_TOOL_SET, [
  { tool: SET_AVATAR_TOOL, handler: handleSetAvatar },
  { tool: SET_AVATAR_FROM_PHOTO_TOOL, handler: handleSetAvatarFromPhoto },
])
```

**Impact:** `lib/nina/turnrun.ts` needs no edit — it already passes `NINA_FULL_TOOL_SET`. Every chat
turn now offers eight tools.

---

### Step 6: Update the one test that pins the tool list

**File:** `tests/nina.prompts.test.ts:415-425`

**Change:** the list grows by one.

**Code:** replace

```ts
  it('defines the seven tools phases 3, 12 and 13 expect, under these exact names', () => {
    expect(NINA_TOOLS.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'aggregate_runs',
      'save_memory',
      'generate_image',
      'set_avatar',
    ])
  })
```

with

```ts
  it('defines the eight tools phases 3, 12, 13 and R2 expect, under these exact names', () => {
    expect(NINA_TOOLS.map((t) => t.name)).toEqual([
      'send',
      'lookup_runs',
      'compare_runs',
      'aggregate_runs',
      'save_memory',
      'generate_image',
      'set_avatar',
      'set_avatar_from_photo',
    ])
  })
```

**Impact:** the schema walk at `:395-413` picks the new tool up automatically and requires its
`description` and its `because.description` to be non-empty — both are, by Step 3.

---

### Step 7: The phase's own suite

**File:** `tests/nina.avatarFromPhoto.test.ts` — new file.

**Change:** the whole file. Posture is `tests/admin.chatPhotoAdoption.test.ts`': the REAL queries run
against the recording driver (`tests/support/fakeDb.ts` — real dialect, real parameter binding, real
`db.batch`), with only the edges mocked (`@vercel/blob`'s `put`, global `fetch`).

**Two fixture hazards this file must not repeat.** `projectedRow` is POSITIONAL against the query's
projection. `imageColumns` (`lib/nina/queries/columns.ts:50-69`) is **17** columns today —
`admin.chatPhotoAdoption.test.ts`' `imageRow` still supplies 14 and silently mis-binds its last two;
this file supplies all 17, in order. `avatarColumns` (`:71-100`) is **20**.

**Code:**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeDb, projectedRow, uninstallFakeDb, type FakeDb } from './support/fakeDb'
import { NINA_TOOLS, SET_AVATAR_FROM_PHOTO_TOOL } from '@/lib/nina/prompts/tools'

/**
 * **R2: an existing photograph becomes her profile picture, from inside a chat turn.**
 *
 * The production turn this is written against is on the record (2026-09-17 02:43 WIB): "ganti profpic
 * lu pake foto ini" reached `set_avatar`, the only avatar tool that existed, which invented a scene
 * and started a generation. The properties below are what makes that impossible now, in the order
 * they would hurt if they were wrong:
 *
 *   1. **No generation, ever.** The adoption is a `fetch` + `put` + two row writes inside the
 *      request. Nothing in this file may reach `avatargen.ts` or a job row.
 *   2. **The referent is resolved from STRUCTURE.** The current message's attachment first; failing
 *      that, the most recent original photograph in the same session — a JOIN, not a guess.
 *   3. **A reference row is never copied.** The core refuses one outright; the resolver flattens one
 *      to whatever it points at, so a Media attach promotes the album row it re-shows and copies
 *      nothing at all.
 *   4. **Re-adoption is a constraint decision.** `source_key = 'chat-photo:<imageId>'`, found before
 *      any bytes move.
 *   5. **`announced_at` is written in the same operation.** The adoption is synchronous, she says so
 *      in the same reply, and the `avatar_changed` cron must not say it again tomorrow.
 */

const USER = 'abc123XYZ_-9'
const IMAGE_ID = 'img123XYZ_-9'
const ORIGINAL_ID = 'org123XYZ_-9'
const MESSAGE_ID = 'msg123XYZ_-9'
const SESSION_ID = 'ses123XYZ_-9'
const AVATAR_ID = 'ava123XYZ_-9'
const ALBUM_ID = 'alb123XYZ_-9'
const STORE = 'https://abc123store.public.blob.vercel-storage.com'
const SOURCE_DESCRIPTION = 'A woman in ripped jeans leaning on a brick wall in an alleyway.'

const sourcePathname = `nina/${USER}/selfie-${IMAGE_ID}.png`
const sourceUrl = `${STORE}/${sourcePathname}`
const adoptedPathname = `nina/${USER}/avatar-${AVATAR_ID}-yUFwuTN7o1ZNWvKU9FonuesJQKHQcQ.png`
const adoptedUrl = `${STORE}/${adoptedPathname}`

const put = vi.fn()
const fetchMock = vi.fn()

vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args) }))

type AvatarTools = typeof import('@/lib/nina/avatartools')
type AvatarAdopt = typeof import('@/lib/nina/avatarAdopt')

let avatarTools: AvatarTools
let avatarAdopt: AvatarAdopt
let fake: FakeDb

/**
 * An override that can express NULL. `overrides.key ?? fallback` would read a deliberate
 * `{ description: null }` as "no opinion" — `in` is the only honest test.
 */
function pick<T>(overrides: Record<string, unknown>, key: string, fallback: T): T {
  return (key in overrides ? overrides[key] : fallback) as T
}

/** `imageColumns` in projection order — SEVENTEEN values. See the header's fixture note. */
function imageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', IMAGE_ID),
    pick(overrides, 'messageId', MESSAGE_ID),
    pick(overrides, 'kind', 'generated'),
    pick(overrides, 'blobUrl', sourceUrl),
    pick(overrides, 'pathname', sourcePathname),
    pick(overrides, 'width', 768),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 240_000),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'prompt', 'a selfie in an alleyway'),
    pick(overrides, 'sourceAvatarId', null),
    pick(overrides, 'sourceImageId', null),
    pick(overrides, 'contentHash', null),
    pick(overrides, 'perceptualHash', null),
    pick(overrides, 'perceptualSig', null),
    pick(overrides, 'sortOrder', 0),
    pick(overrides, 'createdAt', '2026-09-17 02:41:08+00'),
  )
}

/** `avatarColumns` in projection order — TWENTY values. */
function avatarRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', AVATAR_ID),
    pick(overrides, 'blobUrl', adoptedUrl),
    pick(overrides, 'pathname', adoptedPathname),
    pick(overrides, 'folder', ''),
    pick(overrides, 'filename', null),
    pick(overrides, 'thumbUrl', null),
    pick(overrides, 'thumbPathname', null),
    pick(overrides, 'width', 768),
    pick(overrides, 'height', 1024),
    pick(overrides, 'bytes', 240_000),
    pick(overrides, 'source', 'operator'),
    pick(overrides, 'cropScale', null),
    pick(overrides, 'cropX', null),
    pick(overrides, 'cropY', null),
    pick(overrides, 'description', SOURCE_DESCRIPTION),
    pick(overrides, 'searchKeywords', null),
    pick(overrides, 'negativeSearchKeywords', null),
    pick(overrides, 'isCurrent', false),
    pick(overrides, 'announcedAt', null),
    pick(overrides, 'createdAt', '2026-09-17 02:44:00+00'),
  )
}

/** `messageColumns` in projection order — TWELVE values. */
function messageRow(overrides: Record<string, unknown> = {}): unknown[] {
  return projectedRow(
    pick(overrides, 'id', MESSAGE_ID),
    pick(overrides, 'seq', 42),
    pick(overrides, 'sessionId', SESSION_ID),
    pick(overrides, 'role', 'runner'),
    pick(overrides, 'body', 'ganti profpic lu pake foto ini'),
    pick(overrides, 'createdAt', '2026-09-17 02:43:47+00'),
    pick(overrides, 'source', 'chat'),
    pick(overrides, 'turnId', null),
    pick(overrides, 'replyToId', null),
    pick(overrides, 'runId', null),
    pick(overrides, 'readAt', null),
    pick(overrides, 'photoOnly', false),
  )
}

/** The dispatch context a chat turn hands a handler. Only two fields are read by this tool. */
function ctx(sourceMessageId: string | null = MESSAGE_ID) {
  return {
    userId: USER,
    todayISO: '2026-09-17',
    history: {},
    gateway: {},
    sourceMessageId,
  } as unknown as Parameters<AvatarTools['handleSetAvatarFromPhoto']>[1]
}

function insertStatement() {
  return fake.queries.find((query) => query.sql.startsWith('insert into "nina_avatars"'))
}

function announceStatement() {
  return fake.queries.find(
    (query) => query.sql.includes('update "nina_avatars"') && query.sql.includes('"announced_at" ='),
  )
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', fetchMock)
  put.mockReset().mockResolvedValue({ url: adoptedUrl, pathname: adoptedPathname })
  fetchMock.mockReset().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  fake = installFakeDb()
  avatarAdopt = await import('@/lib/nina/avatarAdopt')
  avatarTools = await import('@/lib/nina/avatartools')
})

afterEach(() => {
  vi.unstubAllGlobals()
  uninstallFakeDb()
  vi.resetModules()
})

describe('SET_AVATAR_FROM_PHOTO_TOOL — the schema the model reads', () => {
  it('is the eighth tool, named set_avatar_from_photo, with no photo-id argument', () => {
    expect(SET_AVATAR_FROM_PHOTO_TOOL.name).toBe('set_avatar_from_photo')
    expect(NINA_TOOLS.at(-1)).toBe(SET_AVATAR_FROM_PHOTO_TOOL)

    const schema = SET_AVATAR_FROM_PHOTO_TOOL.input_schema as unknown as {
      properties: Record<string, unknown>
    }
    /* The model never sees a photograph's id (`lib/nina/context.ts` gives it prose), so an
     * id-shaped property could only ever be hallucinated. `because` is the only one. */
    expect(Object.keys(schema.properties)).toEqual(['because'])
  })

  it('is dispatched by NINA_FULL_TOOL_SET, beside set_avatar and generate_image', () => {
    const names = avatarTools.NINA_FULL_TOOL_SET.tools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['generate_image', 'set_avatar', 'set_avatar_from_photo']),
    )
    expect(Object.keys(avatarTools.NINA_FULL_TOOL_SET.handlers)).toEqual(
      expect.arrayContaining(['generate_image', 'set_avatar', 'set_avatar_from_photo']),
    )
    expect(avatarTools.NINA_FULL_TOOL_SET.handlers).not.toHaveProperty('send')
  })

  it('pins the source-key prefix the album and the picker both spell by hand', () => {
    expect(avatarAdopt.NINA_CHAT_PHOTO_SOURCE_KEY_PREFIX).toBe('chat-photo:')
  })
})

describe('adoptNinaChatPhotoAsAvatar — the fresh adoption', () => {
  it('copies the bytes into a new avatar- object and records the STORED refs as operator', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage
    fake.enqueue([]) // getNinaAvatarBySourceKey — never adopted
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(fetchMock).toHaveBeenCalledWith(sourceUrl)
    expect(put).toHaveBeenCalledTimes(1)

    const [pathname, body, options] = put.mock.calls[0] as unknown as [
      string,
      ArrayBuffer,
      Record<string, unknown>,
    ]
    expect(pathname).toMatch(/^nina\/abc123XYZ_-9\/avatar-[A-Za-z0-9_-]{12}\.png$/)
    expect(body).toBeInstanceOf(ArrayBuffer)
    expect(options).toEqual({ access: 'public', addRandomSuffix: true, contentType: 'image/png' })

    const insert = insertStatement()
    expect(insert).toBeDefined()
    expect(insert?.params).toContain(adoptedUrl) // put's RETURN, not the requested pathname
    expect(insert?.params).toContain(adoptedPathname)
    expect(insert?.params).toContain('operator') // the member with no previous writer
    expect(insert?.params).toContain(`chat-photo:${IMAGE_ID}`)
    expect(insert?.params).toContain(SOURCE_DESCRIPTION) // seeded, no second vendor call
    expect(insert?.params).toContain(768)
    expect(insert?.params).toContain(240_000)
  })

  it('derives the container from the SOURCE pathname, not a hard-coded png', async () => {
    fake.enqueue([imageRow({ pathname: `nina/${USER}/chat-${IMAGE_ID}.jpg` })])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    const options = put.mock.calls[0]?.[2] as Record<string, unknown>
    expect(options.contentType).toBe('image/jpeg')
    expect(String(put.mock.calls[0]?.[0])).toMatch(/\.jpg$/)
  })

  it('sets announced_at in the SAME operation that promotes it, so the cron cannot re-announce', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    /* `setCurrentNinaAvatar` re-arms `announced_at` to NULL inside its batch; this is the statement
     * that closes it, and it must exist and it must run after the batch. */
    const announce = announceStatement()
    expect(announce).toBeDefined()
    expect(announce?.params).toContain(AVATAR_ID)
    expect(announce?.sql).toContain('"announced_at" is null')
    expect(fake.queries.indexOf(announce!)).toBeGreaterThan(
      fake.queries.findIndex((query) => query.batched),
    )
  })

  it('refuses a re-share reference before any byte moves', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: ALBUM_ID })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: false, kind: 'reference' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(insertStatement()).toBeUndefined()
  })

  it('refuses a container the album does not accept, before any byte moves', async () => {
    fake.enqueue([imageRow({ pathname: `nina/${USER}/chat-${IMAGE_ID}.gif` })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: false, kind: 'unsupported' })
    expect(put).not.toHaveBeenCalled()
  })

  it('re-adopting the same photo copies nothing and inserts nothing', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImage
    fake.enqueue([avatarRow()]) // getNinaAvatarBySourceKey — already adopted
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(insertStatement()).toBeUndefined()
  })

  it('reports changed: false when that photo is already her current face', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([avatarRow({ isCurrent: true })])
    fake.enqueue([avatarRow({ isCurrent: true })])

    const result = await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)

    expect(result).toEqual({ ok: true, avatarId: AVATAR_ID, changed: false })
    /* Idempotent: `setCurrentNinaAvatar` returns early on an already-current row, so no batch runs. */
    expect(fake.batches).toHaveLength(0)
  })

  it('answers missing for an id that is not his', async () => {
    fake.enqueue([]) // getNinaMessageImage → null

    expect(await avatarAdopt.adoptNinaChatPhotoAsAvatar(USER, IMAGE_ID)).toEqual({
      ok: false,
      kind: 'missing',
    })
  })
})

describe('resolveNinaAdoptTarget — which photograph "ini" is', () => {
  it('prefers the photo attached to the message the turn is answering', async () => {
    fake.enqueue([imageRow()]) // getNinaMessageImagesForMessages

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'image',
      imageId: IMAGE_ID,
    })
    /* One statement: no session lookup is bought when the answer is already on the message. */
    expect(fake.queries).toHaveLength(1)
  })

  it('flattens a re-shown chat photo to the ORIGINAL it points at', async () => {
    fake.enqueue([imageRow({ sourceImageId: ORIGINAL_ID })])

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'image',
      imageId: ORIGINAL_ID,
    })
  })

  it('flattens a Media attach to the album row whose bytes it re-shows', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: ALBUM_ID })])

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'avatar',
      avatarId: ALBUM_ID,
    })
  })

  it('falls back to the most recent original photo in the SAME session', async () => {
    fake.enqueue([]) // no attachment on the current message
    fake.enqueue([messageRow()]) // getNinaMessagesByIds
    fake.enqueue([imageRow({ id: ORIGINAL_ID })]) // getLatestOriginalNinaSessionPhoto

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({
      kind: 'image',
      imageId: ORIGINAL_ID,
    })

    const sql = fake.sqlAt(2)
    expect(sql).toContain('inner join "nina_messages"')
    expect(sql).toContain('"session_id"')
    expect(sql).toContain('"source_avatar_id" is null')
    expect(sql).toContain('"source_image_id" is null')
    expect(fake.queries[2]?.params).toContain(SESSION_ID)
    expect(fake.queries[2]?.params).toContain(USER)
  })

  it('answers none on a proactive turn, and asks no questions of the database', async () => {
    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, null)).toEqual({ kind: 'none' })
    expect(fake.queries).toHaveLength(0)
  })

  it('answers none when the session has shown no original photograph', async () => {
    fake.enqueue([])
    fake.enqueue([messageRow()])
    fake.enqueue([])

    expect(await avatarAdopt.resolveNinaAdoptTarget(USER, MESSAGE_ID)).toEqual({ kind: 'none' })
  })
})

describe('handleSetAvatarFromPhoto — what she is told', () => {
  it('adopts the attached photo and tells her it is DONE, never "the camera is running"', async () => {
    fake.enqueue([imageRow()]) // resolve: attachment on the current message
    fake.enqueue([imageRow()]) // core: getNinaMessageImage
    fake.enqueue([]) // getNinaAvatarBySourceKey
    fake.enqueue([avatarRow()]) // insertNinaAvatars RETURNING
    fake.enqueue([avatarRow()]) // setCurrentNinaAvatar's pre-read

    const answer = await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(answer.isError).toBe(false)
    expect(answer.answer).toEqual({
      ok: true,
      note: avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.done,
    })
    expect(avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.done).not.toContain('Kamera')
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('promotes the album row a Media attach re-shows, copying nothing at all', async () => {
    fake.enqueue([imageRow({ sourceAvatarId: ALBUM_ID })]) // resolve → avatar branch
    fake.enqueue([avatarRow({ id: ALBUM_ID, source: 'admin' })]) // getNinaAvatar
    fake.enqueue([avatarRow({ id: ALBUM_ID, source: 'admin' })]) // setCurrentNinaAvatar's pre-read

    const answer = await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(answer).toEqual({
      answer: { ok: true, note: avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.done },
      isError: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(insertStatement()).toBeUndefined()
    expect(announceStatement()?.params).toContain(ALBUM_ID)
  })

  it('refuses cleanly with isError false when nothing in the session can be meant', async () => {
    fake.enqueue([]) // no attachment
    fake.enqueue([messageRow()]) // the message, for its session
    fake.enqueue([]) // no original photo in it

    const answer = await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(answer).toEqual({
      answer: { ok: false, note: avatarTools.SET_AVATAR_FROM_PHOTO_ANSWERS.none },
      isError: false,
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('tolerates a call with no arguments at all, because `because` reads nothing', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    const answer = await avatarTools.handleSetAvatarFromPhoto({}, ctx())

    expect(answer.isError).toBe(false)
    expect((answer.answer as { ok: boolean }).ok).toBe(true)
  })

  it('answers isError only for a payload that is not an object', async () => {
    const answer = await avatarTools.handleSetAvatarFromPhoto('pakai foto ini', ctx())

    expect(answer.isError).toBe(true)
    expect(fake.queries).toHaveLength(0)
  })

  it('never reaches the generator: no image job row is opened', async () => {
    fake.enqueue([imageRow()])
    fake.enqueue([imageRow()])
    fake.enqueue([])
    fake.enqueue([avatarRow()])
    fake.enqueue([avatarRow()])

    await avatarTools.handleSetAvatarFromPhoto({ because: 'he asked' }, ctx())

    expect(fake.queries.some((query) => query.sql.includes('"nina_turns"'))).toBe(false)
  })
})
```

**Impact:** a new suite, no change to any existing one beyond Step 6.

**One recording-driver note for whoever implements this.** `tests/support/fakeDb.ts`' client shifts
`pending` for **every** statement, batch members included. `setCurrentNinaAvatar`'s two batched
UPDATEs and `markNinaAvatarAnnounced`'s UPDATE therefore consume from the queue — which is why no
test above enqueues rows past `setCurrentNinaAvatar`'s pre-read: those three statements get `[]`, and
none of the three return values is branched on.

---

## Verification

**Typecheck:** `npx tsc --noEmit` — run it; `vitest` does not typecheck, and `next build` is the only
other thing that would catch a bad import.

**Tests:**
```
npx vitest run tests/nina.avatarFromPhoto.test.ts tests/nina.prompts.test.ts lib/nina/tools.test.ts tests/admin.chatPhotoAdoption.test.ts tests/nina.photoRefs.test.ts
npm test
```
The three existing suites are named explicitly because they are the ones with a claim on what this
phase changed: the tool list, the core tool set, the admin adoption path (which must be byte-for-byte
unregressed), and the `'chat-photo:'` prefix.

**Build:** `npm run build` (Turbopack rejects a `node_modules` symlink, so the worktree needs a real
`npm install` and its own `.env.local`).

**Manual check (optional, production-writing — do not run unattended):** in a chat session, attach a
photo and say *"ganti profpic lu pake ini"*. Then check `nina_turns.tool_calls` for
`set_avatar_from_photo` and confirm:
```sql
select id, source, source_key, is_current, announced_at
  from nina_avatars
 where user_id = '<uid>' and source = 'operator'
 order by created_at desc limit 3;
```
`source_key` starts `chat-photo:`, `is_current` is true, `announced_at` is **not** null, and no
`nina_turns` row of `kind = 'image'` was opened by that turn.

**Exit criteria:**
1. A photo attached to the current runner message is adopted, and it is *that* photo.
2. With no attachment on the current message, the most recent original photo in the same session is
   adopted.
3. `adoptNinaChatPhotoAsAvatar` called against a reference row returns `{ ok: false, kind:
   'reference' }` with no `fetch`, no `put` and no INSERT; the handler renders it `isError: false`.
4. With no eligible photo anywhere in the session, the handler refuses `isError: false` with the
   `none` note and starts no generation.
5. Re-calling for the same photo produces no second Blob object and no second `nina_avatars` row —
   the `source_key` lookup short-circuits before any bytes move.
6. The adopted row is `is_current = true` **and** `announced_at IS NOT NULL` when the handler returns.
7. `npx tsc --noEmit` clean; the full `vitest` suite green; `tests/__snapshots__/nina.prompts.test.ts.snap`
   passes **unregenerated** (no system-prompt text changed).

---

## Handoffs

Found while planning, deliberately **not** done here. Each is its own card.

1. **The adopted row gets no `description_embedding`, so it is invisible to the album's semantic
   search.** `setChatPhotoAsAvatarAction` calls `scheduleDescribe` for exactly this reason
   (`lib/admin/ninaAlbumAvatarActions.ts:160-173`), but that module lives in `lib/admin/` and
   `lib/nina/` must not import it. A chat-adopted row therefore carries a seeded `description` and a
   NULL vector. Fix belongs with whoever moves the describe/embed scheduler into a layer both sides
   can reach, or with an `/admin/nina` backfill sweep. Not R2.
2. **`contentHash` is not written on the adopted row.** `NinaAvatarBatchInsert.contentHash` is
   optional and the admin adoption does not write one either (`queries/shapes.ts:443-454` says so
   explicitly), so the cross-table duplicate finder cannot see these rows. Matching the admin path is
   the conservative choice for this phase; making both write it is one card for both.
3. **`tests/admin.chatPhotoAdoption.test.ts`' `imageRow` fixture is stale** — 14 positional values
   against a 17-column `imageColumns` projection, so its last two (`sortOrder`, `createdAt`) bind to
   `contentHash`/`perceptualHash` and the real ones come back `undefined`. Nothing it asserts depends
   on them, so it passes for the wrong reason. Untouched here (it is an admin-layer test and this
   phase must leave `lib/admin/**` and its suite alone). One card.
4. **Crop/framing is never set on a chat-adopted row.** The admin path takes a crop draft from the
   framing panel; a chat turn has no such UI, so the three crop columns stay NULL and the face renders
   centred `object-cover`. That is the correct default and the operator can re-frame it in
   `/admin/nina` — noted so nobody reads it as a gap.
5. **The session fallback skips a re-share.** `getLatestOriginalNinaSessionPhoto` filters to
   originals, so if the most recently *shown* thing in the session was a Media re-share, the query
   walks past it to the older original beneath. Correct by `isOriginalPhoto`'s definition (a re-show
   is the same photograph), but if "the last thing on screen" ever needs to win, that is a
   flatten-in-SQL change to this one query.

---

## Rollback

Purely additive plus three in-place edits, so a wholesale revert of the phase's commit(s) is complete
and safe:

- `lib/nina/avatarAdopt.ts` and `tests/nina.avatarFromPhoto.test.ts` — delete.
- `lib/nina/queries/images.ts` — remove `getLatestOriginalNinaSessionPhoto`; it has no other caller.
- `lib/nina/prompts/tools.ts` — drop `SET_AVATAR_FROM_PHOTO_TOOL`, drop it from `NINA_TOOLS`, restore
  `SET_AVATAR_TOOL.description` to its two original sentences.
- `lib/nina/prompts/index.ts` — `NINA_PROMPT_VERSION` back to `10` (or leave it at `11`; it is a
  monotonic label, and turns already stamped `11` stay legible either way).
- `lib/nina/avatartools.ts` — drop the second `extendToolSet` entry, the handler, the answers and the
  schema.
- `tests/nina.prompts.test.ts` — the name list back to seven.

No migration to reverse. `nina_avatars` rows the phase created are ordinary album rows with
`source = 'operator'` and a `chat-photo:` key; they remain renderable, and the existing `/admin/nina`
delete removes one exactly like any other (reference-checked blob release included). If the current
avatar is one of them, promote another row first — `deleteNinaAvatar`'s WHERE refuses the current one
by design.
