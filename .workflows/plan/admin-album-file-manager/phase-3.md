# Phase 3: The chat side of "share link to Nina" — the `?photo=` idiom, composer chip, `attachExisting`

**Plan set:** `ADMIN_ALBUM_FILE_MANAGER_PLAN.md`
**Analysis:** `20260904-131215-A3F7_code_analyzer.md`
**Satisfies:** R2 — "share link to Nina": the chat opens with the photo already attached *as a pointer*, an optional question can be typed, and Nina answers it
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/nina`, `app/nina`, `components/nina`

---

## Goal

After this phase, `/nina?photo=avatar:<id>` is a working deep link: the page resolves the id
owner-scoped, arms the composer with a chip showing the photo, lets the runner type an optional
question (or nothing), and the send writes **one `nina_message_images` row pointing at the blob the
server already owns** — zero new bytes in Blob and zero vision calls. A forged, foreign or vanished
id arms nothing and paints the ordinary empty composer, not an error page.

Nothing under `/admin` changes. Phase 7 is the only consumer that will ever build the URL, and the
grammar it builds it from is exported here.

## What already exists, and is deliberately NOT rebuilt

The server half of R2 landed with F33 phase 13 and is correct. Verified in the worktree:

- `lib/nina/actions.ts:237` — `sendNinaMessage` already accepts
  `attachExisting?: NinaAttachExisting | null`, where
  `NinaAttachExisting = { kind: 'avatar' | 'image'; id: string }` (`lib/nina/actions.ts:128-130`).
- `lib/nina/actions.ts:141` — `resolveAttachment` resolves it **owner-scoped**, copies the existing
  `description` onto the new row, and makes **no** vision call (its own docstring, lines 135-140).
- `lib/nina/actions.ts:277` — the refusal rule is
  `text.length === 0 && tickets.length === 0 && requestedRunId === null && attach === null`.
  `attach === null` is already the fourth disjunct and RULING B1 declares the rule complete.
  **This phase adds no clause to it** and does not open that file.
- `lib/nina/actions.ts:442-457` — the R26 row insert, at `sortOrder: images.length`, i.e. **after**
  anything picked in the same message. The optimistic bubble below matches that order exactly.
- `lib/nina/albumActions.ts:43` — `attachNinaPhotoToChat`, the *only* existing caller, used by the
  mobile `/nina/about` screen, which sends immediately and `router.push('/nina')`. **A different
  flow. It keeps working untouched.**

So the whole of this phase is: a URL grammar, one owner-scoped read on the page, and composer state.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

**Deletes:** none.

**Renames:** none.

**Creates:**
- `lib/nina/attach.ts` — `PHOTO_PARAM` (`'photo'`), `NinaPhotoKind`, `NinaPhotoPointer`,
  `NinaExistingPhoto`, `formatNinaPhotoParam`, `parseNinaPhotoParam` (appended after line 69).
- `lib/nina/queries.ts` — `getNinaMessageImage(userId, id)` (inserted after line 580, in §6, the
  message-images section — **not** in §9, the avatars section phase 1 edits).
- `components/nina/PhotoAttachmentChip.tsx` — new file, `PhotoAttachmentChip`.
- `tests/nina.attach.test.ts` — new file.

**Signature changes:**
- `ChatScreen` gains a required prop: `pendingPhoto: NinaExistingPhoto | null`
  (`components/nina/ChatScreen.tsx:78-100`). Required, not optional, per RULING E2b's habit: the one
  caller is `app/nina/page.tsx` and `tsc` should say so if it forgets.
- `Composer` gains two optional props: `photo?: NinaExistingPhoto | null` and
  `onClearPhoto?: () => void` (`components/nina/Composer.tsx:129-176`), mirroring `attachment` /
  `onClearAttachment` exactly.
- `sendNinaMessage`'s call site in `ChatScreen.handleSend` now passes `attachExisting`. **The action's
  own signature is unchanged** — the field has existed since F33 phase 13.

**Requires (from earlier phases):** nothing. This phase is deliberately unhooked from the
file-manager chain (plan index, line 108-109) and compiles against `main`'s schema as it stands.

**The contract phase 7 builds on — exact and load-bearing.** *(Reconciled: phase 7's draft assumed
`NINA_PHOTO_PARAM`, `formatNinaPhotoPointer`, `parseNinaPhotoPointer` and `NinaPhotoPointerKind`.
`lib/nina/attach.ts` is this phase's file, so the names below win and phase 7 was rewritten onto
them — three import lines and one call, exactly as phase 7 predicted.)*

```ts
import { PHOTO_PARAM, formatNinaPhotoParam } from '@/lib/nina/attach'

// `origin` is shareOrigin()'s value, passed down as a prop (invariant 9).
const href = `${origin}/nina?${PHOTO_PARAM}=${encodeURIComponent(
  formatNinaPhotoParam({ kind: 'avatar', id: photo.id }),
)}`
window.open(href, '_blank', 'noopener')
```

`formatNinaPhotoParam({ kind: 'avatar', id: 'abc123XYZ_-0' })` returns the string
`'avatar:abc123XYZ_-0'`. The `:` is a legal query character unencoded, but `encodeURIComponent`
is spelled above so there is exactly one right answer; `parseNinaPhotoParam` reads either, because
Next decodes `searchParams` before the page sees them.

**Leaves alone (owned by others):**
- `lib/nina/actions.ts` — already correct; **must not be opened by this phase.**
- `lib/nina/albumActions.ts`, `components/nina/NinaAboutScreen.tsx` — the mobile album's
  send-and-navigate flow (phase index: "R2 is a *second* entry point, not a replacement").
- `lib/db/schema.ts`, `drizzle/**` — phase 1.
- `components/admin/**`, `app/admin/**` — phases 5, 6, 7.
- `lib/nina/queries.ts` §9 (avatars, lines 898-1127) — phase 1 edits that region. This phase's one
  addition goes in §6 instead, ~320 lines earlier, so the two diffs do not overlap.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/attach.ts` | modify | append the `?photo=` idiom: the param constant, the pointer types, and the pure format/parse pair (after line 69) |
| `tests/nina.attach.test.ts` | create | round-trip, rejection and hostile-input cases for the pair |
| `lib/nina/queries.ts` | modify | add `getNinaMessageImage` after line 580 — one single-row, owner-scoped read; **nothing else** |
| `app/nina/page.tsx` | modify | read `?photo=`, resolve it as a fourth concurrent read, pass `pendingPhoto` to `ChatScreen` (lines 57, 88, 105, 118-120, 220) |
| `components/nina/PhotoAttachmentChip.tsx` | create | the chip: 56 px thumbnail + a 44 px clear button, `AttachmentChip.tsx`'s shape |
| `components/nina/ChatScreen.tsx` | modify | hold the pointer as composer state, consume the param off the URL, pass `attachExisting` in `handleSend`, render it in the optimistic bubble (lines 10, 78-111, 126-132, 321-446, 477-486) |
| `components/nina/Composer.tsx` | modify | render the chip, one more disjunct in `canSend`, and the placeholder (lines 15, 129-176, 195-201, 355-359, 457) |

Seven files. No file is shared with phase 1 or 2 except `lib/nina/queries.ts`, and the insertion
point there is chosen to be in a different section from phase 1's edits.

## Implementation Steps

### Step 1: The `?photo=` idiom in `lib/nina/attach.ts`

**File:** `lib/nina/attach.ts` — append after line 69 (the end of `indexAttachments`). The existing
import line 1 also changes.

**Change:** a second query-parameter idiom beside `ATTACH_PARAM` (line 46), for a photo the server
already owns. Pure, dependency-light, and unit-tested — it is the only thing standing between the
admin page and the chat page spelling the deep link differently.

**Code — the import line at the top of the file becomes two lines:**

```ts
import { formatDay, formatDistanceM, formatDuration, formatPace } from '@/lib/format'
import { isValidId } from '@/lib/id'
```

**Code — appended verbatim to the end of the file:**

```ts
/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE SECOND IDIOM: `/nina?photo=avatar:<id>` — F34 R2
 * ──────────────────────────────────────────────────────────────────────────────────────────────*/

/**
 * Which table the id addresses. **Structurally identical to `NinaAttachExisting`'s `kind`** in
 * `lib/nina/actions.ts:128`, and declared here rather than imported for the reason
 * `RunAttachmentInput` gives forty lines up: this module is read by a client component
 * (`Composer`), a Server Component (`app/nina/page.tsx`) and a unit suite, and it stays pure by
 * stating what it needs instead of reaching into a `'use server'` module for it. A widening of
 * that union without a widening of this one is then a compile error at the one call site that
 * bridges them, which is exactly where it should be.
 */
export type NinaPhotoKind = 'avatar' | 'image'

/** What the URL carries: a kind and an id, and nothing that could be a claim. */
export interface NinaPhotoPointer {
  kind: NinaPhotoKind
  id: string
}

/**
 * The pointer once the server has proved it owns the row: the same two fields plus the URL the
 * chip renders.
 *
 * ── WHY THE URL IS RESOLVED ON THE SERVER AND NOT FETCHED BY THE CHIP ─────────────────────────
 * A URL arriving from a client is a claim; an id resolved against `user_id` is a fact — the same
 * sentence `NinaAttachExisting`'s docstring opens with. So `app/nina/page.tsx` does one
 * owner-scoped single-row read and hands down a URL that is already known to be his. The client
 * never learns of a blob it does not own, and the chip needs no effect, no loading state and no
 * second round trip.
 *
 * **`description` is deliberately absent and must never be added.** Invariant 5: it is
 * `glm-4.6v`'s private text, the only consumer is Nina's prompt, and nothing in `components/` may
 * read it. The chip renders `alt=""` for the same reason `NinaPhotoGrid` does
 * (`components/nina/NinaPhotoGrid.tsx:19-23`).
 */
export interface NinaExistingPhoto extends NinaPhotoPointer {
  /** A public Blob URL, read off the row the server just proved is his. */
  url: string
}

/**
 * The query parameter that arms the composer with a photo the server ALREADY OWNS:
 * `/nina?photo=avatar:<id>`.
 *
 * ── WHY A SECOND PARAMETER AND NOT A SECOND VALUE OF `ATTACH_PARAM` ──────────────────────────
 * `?attach=` carries a bare `runId` and `app/nina/page.tsx` resolves it through
 * `listRunAttachments`. Overloading it would mean sniffing a colon to decide which table to read,
 * and the first id that ever contains a colon (or the first kind added) turns a deep link into a
 * silent miss. Two parameters, two grammars, two reads — and they can appear on the same URL
 * without either one having to know about the other, which is why `ChatScreen` deletes both in one
 * `replaceState`.
 */
export const PHOTO_PARAM = 'photo'

/**
 * `pointer -> 'avatar:<id>'`. **Phase 7 builds the share link out of this**, so this function and
 * `parseNinaPhotoParam` are the entire contract between `/admin/nina` and `/nina`. The separator
 * is a colon, which no id can contain (`lib/id.ts`'s alphabet is `[0-9A-Za-z_-]`), so the parse
 * below can split on the first one and be sure it split in the right place.
 *
 * It does NOT url-encode. The caller owns the URL; see this phase's plan for the one expression
 * phase 7 should use.
 */
export function formatNinaPhotoParam(pointer: NinaPhotoPointer): string {
  return `${pointer.kind}:${pointer.id}`
}

/**
 * `unknown -> pointer | null`. **Takes `unknown` on purpose**: the caller is
 * `app/nina/page.tsx`, where a `searchParams` value is `string | string[] | undefined`, and a
 * repeated `?photo=a&photo=b` is a malformed link rather than an interesting case. `isValidId` sets
 * the same precedent one file over (`lib/id.ts:44`) and for the same reason — a shape check that
 * refuses to be handed the wrong shape is a shape check with a second bug in it.
 *
 * A miss is `null`, and `null` is NOT an error: the page paints the ordinary empty composer. That
 * is the deliberate difference from `resolveAttachment`'s refusal (invariant 10). A refusal there
 * is about a *send* whose whole subject was a photo he cannot see; a miss here is about a *link*,
 * which anyone can type, and answering a stale bookmark with an error page would be the app
 * telling a runner his own chat is broken.
 */
export function parseNinaPhotoParam(raw: unknown): NinaPhotoPointer | null {
  if (typeof raw !== 'string') return null
  const separator = raw.indexOf(':')
  if (separator <= 0) return null
  const kind = raw.slice(0, separator)
  const id = raw.slice(separator + 1)
  if (kind !== 'avatar' && kind !== 'image') return null
  if (!isValidId(id)) return null
  return { kind, id }
}
```

**Impact:** five new exports on a module already imported by the page, `ChatScreen`, `Composer` and
`components/nina/types.ts`. Nothing existing changes behaviour. `lib/id.ts` is dependency-free, so
the module stays importable from Vitest and from a client bundle alike.

---

### Step 2: The test suite for the pair

**File:** `tests/nina.attach.test.ts` — new file.

**Change:** the round trip, the rejections, and the hostile inputs. Invariant 6: this is the phase's
only testable pure surface, and it is the one that must not drift, because phase 7 writes the URL
and this file reads it.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import { newId } from '@/lib/id'
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  formatNinaPhotoParam,
  parseNinaPhotoParam,
} from '@/lib/nina/attach'

/**
 * The `?photo=` grammar — F34 R2's contract between `/admin/nina` (which writes the URL) and
 * `/nina` (which reads it). Two modules, one string format, and nothing but this suite keeping
 * them in step.
 *
 * `app/nina/page.tsx` hands the raw `searchParams` value straight to `parseNinaPhotoParam`, so the
 * hostile cases below are not hypothetical: a `string[]`, an `undefined` and a hand-typed URL are
 * all reachable from a browser address bar.
 */

describe('the two query-parameter idioms are distinct', () => {
  it('does not collide with the run idiom', () => {
    /* If these are ever equal, one deep link silently eats the other's parameter and
     * `ChatScreen`'s single `replaceState` deletes a parameter it was not asked to. */
    expect(PHOTO_PARAM).not.toBe(ATTACH_PARAM)
  })
})

describe('formatNinaPhotoParam / parseNinaPhotoParam', () => {
  it('round-trips an avatar pointer', () => {
    const id = newId()
    const formatted = formatNinaPhotoParam({ kind: 'avatar', id })
    expect(formatted).toBe(`avatar:${id}`)
    expect(parseNinaPhotoParam(formatted)).toEqual({ kind: 'avatar', id })
  })

  it('round-trips an image pointer', () => {
    const id = newId()
    expect(parseNinaPhotoParam(formatNinaPhotoParam({ kind: 'image', id }))).toEqual({
      kind: 'image',
      id,
    })
  })

  it('round-trips ids containing the alphabet edges', () => {
    /* `lib/id.ts`'s alphabet ends `-_`, and both are legal in a query string unencoded. An id
     * made entirely of them is the case a regex written from memory gets wrong. */
    for (const id of ['------------', '____________', '-_-_-_-_-_-_', '000000000000']) {
      expect(parseNinaPhotoParam(formatNinaPhotoParam({ kind: 'avatar', id }))).toEqual({
        kind: 'avatar',
        id,
      })
    }
  })

  it('refuses an unknown kind', () => {
    const id = newId()
    expect(parseNinaPhotoParam(`run:${id}`)).toBeNull()
    expect(parseNinaPhotoParam(`AVATAR:${id}`)).toBeNull()
    expect(parseNinaPhotoParam(`avatars:${id}`)).toBeNull()
  })

  it('refuses an id that cannot be one of ours', () => {
    expect(parseNinaPhotoParam('avatar:short')).toBeNull()
    expect(parseNinaPhotoParam('avatar:thirteencharsx')).toBeNull()
    expect(parseNinaPhotoParam('avatar:has a space')).toBeNull()
    expect(parseNinaPhotoParam('avatar:../../etc/pw')).toBeNull()
    expect(parseNinaPhotoParam('avatar:')).toBeNull()
  })

  it('refuses a missing or misplaced separator', () => {
    const id = newId()
    expect(parseNinaPhotoParam(id)).toBeNull()
    expect(parseNinaPhotoParam(`:${id}`)).toBeNull()
    expect(parseNinaPhotoParam(`:avatar:${id}`)).toBeNull()
  })

  it('refuses a second colon inside the id rather than trimming it', () => {
    /* Split on the FIRST colon, then validate the whole tail. `avatar:abc:def` must not resolve to
     * `abc` — a link that half-parses is a link that arms the composer with the wrong photo. */
    expect(parseNinaPhotoParam('avatar:abcdefghijk:l')).toBeNull()
  })

  it('refuses anything that is not a string', () => {
    /* Exactly what `searchParams` can hand it: a repeated parameter, and an absent one. */
    expect(parseNinaPhotoParam(['avatar:abcdefghijkl'])).toBeNull()
    expect(parseNinaPhotoParam(undefined)).toBeNull()
    expect(parseNinaPhotoParam(null)).toBeNull()
    expect(parseNinaPhotoParam(42)).toBeNull()
    expect(parseNinaPhotoParam({ kind: 'avatar', id: 'abcdefghijkl' })).toBeNull()
  })
})
```

**Impact:** one new suite, ~10 cases, `environment: 'node'`, no database and no network.

---

### Step 3: One single-row read for a chat photo

**File:** `lib/nina/queries.ts` — insert immediately after line 580 (the closing brace of
`listNinaMessageImages`) and before the docstring of `getNinaMessageImagesForMessages` at line 582.

**Change:** the `'avatar'` half of the resolve already has its query — `getNinaAvatar`
(`lib/nina/queries.ts:1057`) is a single-row owner-scoped lookup and is used as-is. The `'image'`
half has none: the only reader is `listNinaMessageImages(userId, { limit: 200 })` followed by a
`.find(...)`. Two hundred rows to answer one id, in a render path, is exactly the "no unindexed
query" line this phase is not allowed to cross, so it gets a getter of its own.

**Code — appended after line 580:**

```ts
/**
 * One conversation photo by id, ownership-scoped. The mirror of `getNinaAvatar` in §9, and it
 * exists for the same reason: `app/nina/page.tsx` has to turn ONE id from a URL into ONE blob URL
 * during a render, and `listNinaMessageImages(...).find(...)` reads up to `NINA_GALLERY_LIMIT`
 * rows to answer it.
 *
 * `null` for "not yours" and for "does not exist" alike — this module's stated rule, and here it is
 * also the security property: a page that distinguishes them is a page that tells a stranger which
 * ids exist.
 *
 * The projection is `imageColumns`, so the row carries `description`. **The caller reads `blobUrl`
 * and nothing else** (invariant 5); the description is `glm-4.6v`'s private text and its only
 * consumer is Nina's prompt.
 */
export async function getNinaMessageImage(userId: string, id: string): Promise<NinaImageRow | null> {
  const rows = await db
    .select(imageColumns)
    .from(ninaMessageImages)
    .where(and(eq(ninaMessageImages.userId, userId), eq(ninaMessageImages.id, id)))
    .limit(1)
  return rows[0] ?? null
}
```

**Impact:** one new export. `userId` is the first parameter, so `ci:data-layer-guard`'s rule (which
inspects `lib/db/queries.ts` only, but whose principle this module's header restates as having "NO
exception") holds. `id` is the table's primary key, so this is an index lookup. No existing function
changes.

**Conflict note for the reconciler:** phase 1 also edits this file, in §9 (avatars, lines 898-1127).
This insertion is at line 580 in §6. If phase 1's diff turns out to touch §6 as well, this function
moves rather than merges — it has no dependency on anything phase 1 adds.

---

### Step 4: Resolve the pointer on the server

**File:** `app/nina/page.tsx` — four edits: the import block (lines 12-20), the header docstring
(before the `*/` at line 57), line 88, line 105, and lines 118-120.

**Change 4a — the imports.** Replace lines 13 and 15-20:

```ts
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  indexAttachments,
  parseNinaPhotoParam,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
import { listOpenNinaImageJobs } from '@/lib/nina/imagejobs'
import {
  getCurrentNinaAvatar,
  getNinaAvatar,
  getNinaMessageImage,
  getNinaMessageImagesForMessages,
  listNinaMessages,
  markNinaMessagesRead,
} from '@/lib/nina/queries'
```

**Change 4b — the header docstring.** Insert this section immediately before the closing `*/` at
line 57, after the "WHY THE ROWS ARE MAPPED RATHER THAN PASSED" paragraph:

```
 * ── `?photo=` IS A FOURTH READ, AND IT IS FREE WHEN THE PARAMETER IS ABSENT ───────────────────
 * F34 R2. `/nina?photo=avatar:<id>` is the link `/admin/nina`'s file explorer opens in a new tab,
 * and the whole optimisation the requirement asks for is that the photo is NOT re-uploaded: what
 * crosses is an id, and what this page does with it is one owner-scoped single-row read
 * (`getNinaAvatar` / `getNinaMessageImage`, both primary-key lookups) whose only output is a blob
 * URL. It joins the `Promise.all` below as a fourth element, and when the parameter is absent that
 * element is `Promise.resolve(null)` — so a runner who just opened the chat pays nothing at all.
 * Invariant 4 is untouched: still no model call, still nothing unindexed.
 *
 * A MISS IS NOT AN ERROR PAGE. A forged, foreign or since-deleted id resolves to `null` and the
 * composer simply opens empty — the same degradation `?attach=` takes when a run is not the
 * runner's. The hard refusal lives one layer down in `resolveAttachment`, where the id is about to
 * become a persisted row (invariant 10), and it is right that the two differ: a bad *link* is
 * something anyone can type, a bad *send* is a message about a photo he cannot see.
 *
 * `description` is NOT read out of either row. It is `glm-4.6v`'s private text, Nina's prompt is
 * its only consumer, and `resolveAttachment` copies it server-side at send time without it ever
 * touching a component (invariant 5).
```

**Change 4c — read both parameters.** Replace line 88:

```ts
  const { [ATTACH_PARAM]: attachParam, [PHOTO_PARAM]: photoParam } = await searchParams
  /* Parsed BEFORE the reads, because which table to read is what the grammar decides. Pure, so it
   * costs nothing and cannot fail; `null` means "no photo on this link" and every branch below
   * short-circuits on it. */
  const photoPointer = parseNinaPhotoParam(photoParam)
```

**Change 4d — widen the destructure.** Replace line 105:

```ts
  const [rows, , avatarRow, photoRow] = await Promise.all([
```

**Change 4e — the fourth read, and the resolution.** Replace lines 118-120 (from
`getCurrentNinaAvatar(userId),` through `const avatar = ninaAvatarView(avatarRow)`):

```ts
    getCurrentNinaAvatar(userId),
    /*
     * F34 R2. A FOURTH indexed read, and only when the link asked for one — see the header. Both
     * branches are single-row primary-key lookups scoped to `user_id`, so "not his" and "gone" come
     * back as the same `null` and neither leaks which ids exist.
     *
     * `Promise.resolve(null)` rather than a conditional `await` after the block: keeping it inside
     * the `Promise.all` means the read overlaps the other three instead of adding a round trip to
     * the critical path of a link that was clicked from another tab.
     */
    photoPointer === null
      ? Promise.resolve(null)
      : photoPointer.kind === 'avatar'
        ? getNinaAvatar(userId, photoPointer.id)
        : getNinaMessageImage(userId, photoPointer.id),
  ])
  const avatar = ninaAvatarView(avatarRow)

  /*
   * The one place a row becomes a URL, which is what makes the thumbnail a one-line change later:
   * phase 1's column is `nina_avatars.thumb_url`, surfaced as `NinaAvatarRow.thumbUrl`, so
   * preferring it is `photoRow.thumbUrl ?? photoRow.blobUrl` HERE and nowhere else — on the
   * `'avatar'` branch only, since `NinaImageRow` has no thumbnail. **Not written in this phase**,
   * because `depends_on` is empty and the column does not exist on `main`. It reads `blobUrl` and
   * `kind`/`id` and NOTHING ELSE off the row — in particular not `description` (invariant 5) and
   * not `pathname`, which is Blob's own suffixed spelling and no business of a client's.
   */
  const pendingPhoto: NinaExistingPhoto | null =
    photoPointer === null || photoRow == null
      ? null
      : { kind: photoPointer.kind, id: photoPointer.id, url: photoRow.blobUrl }
```

**Change 4f — hand it down.** Replace line 220:

```tsx
      <ChatScreen
        initial={initial}
        todayISO={todayInJakarta()}
        userId={userId}
        pending={pending}
        pendingPhoto={pendingPhoto}
      />
```

**Impact:** the page gains one conditional read and one prop. `photoRow` is
`NinaAvatarRow | NinaImageRow | null`; both members carry `blobUrl: string`, so the property access
narrows without a cast. `PageProps<'/nina'>` is unchanged — `/nina` is a static route, so
`searchParams` resolves to `{ [key: string]: string | string[] | undefined }` and the computed-key
destructure of two `const` strings type-checks exactly as line 88's one did.

---

### Step 5: The chip

**File:** `components/nina/PhotoAttachmentChip.tsx` — new file.

**Change:** a chip for a photo the server already owns. `AttachmentChip.tsx` is the shape precedent
and this deliberately reuses its geometry, its clear button and its reasoning, differing only in
what fills the left-hand box: a thumbnail instead of two lines of formatted run numbers.

**Code:**

```tsx
import type { NinaExistingPhoto } from '@/lib/nina/attach'

/**
 * The photo the next message will carry, sitting on top of the composer until it is sent — F34 R2.
 *
 * ── WHY IT IS NOT `AttachmentChip` WITH A UNION PROP ──────────────────────────────────────────
 * They share a bottom margin, a clear button and a row layout, and nothing else. `AttachmentChip`
 * renders two lines of strings that `lib/format.ts` produced on the server (invariant 8); this
 * renders one `<img>` and no text at all. A union prop would put a discriminant check inside a
 * component whose whole body is JSX, and the two can legitimately appear TOGETHER — a run pinned
 * and a photo pinned in the same draft — which a single component could not express.
 *
 * ── A PLAIN `<img>`, AND `alt=""` ────────────────────────────────────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rules `next/image` out for Blob-hosted photos: they
 * are already compressed by whoever wrote the row, and optimising them again spends a paid
 * transform quota on a finished file. The same ruling covers this thumbnail.
 *
 * `alt=""` for that file's other reason, which is invariant 5: the only description that exists for
 * an album photo is `nina_avatars.description`, that text is `glm-4.6v`'s and is her prompt's
 * private input, and it never crosses into a component. The accessible name lives on the clear
 * BUTTON, which is the only thing here a screen reader can act on.
 *
 * ── NO `'use client'` OF ITS OWN ─────────────────────────────────────────────────────────────
 * It takes a callback and renders, so it compiles into whichever graph imports it — `Composer`,
 * which is already a client component. `AttachmentChip`'s reasoning, verbatim.
 *
 * The photo is NOT a link and NOT a tap target: tapping it should not throw the runner out of a
 * message they are in the middle of writing, and they were just looking at it in the other tab.
 * The geometry — `max-w-[470px]`, `px-5` — belongs to the composer's own inner wrapper, which this
 * sits inside; only the bottom margin is this component's.
 */
export function PhotoAttachmentChip({
  photo,
  onClear,
}: {
  photo: NinaExistingPhoto
  onClear: () => void
}) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
            dimensions, already compressed by whoever wrote the row. See the header. */}
        <img
          src={photo.url}
          alt=""
          className="size-14 rounded-field bg-ink-3/20 object-cover"
        />
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove the attached photo"
        className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
```

`bg-ink-3/20` behind the image is `NinaPhotoGrid`'s cell ground, settled there after phases 4, 7 and
8 argued it: `ink-3` is a mid-grey in both schemes, so an alpha of it composites correctly over
`bg-card` and `bg-ink` alike. `size-14` matches the composer's own picked-photo tiles (line 371), so
a pinned album photo and a picked one are the same size in the same bar.

**Impact:** new file, no imports beyond a type. `prettier-plugin-tailwindcss` may reorder the class
strings; run `npm run format` rather than hand-sorting them.

---

### Step 6: `ChatScreen` holds it, consumes the URL, and sends it

**File:** `components/nina/ChatScreen.tsx` — five edits.

**Change 6a — the import.** Replace line 10:

```ts
import {
  ATTACH_PARAM,
  PHOTO_PARAM,
  type NinaExistingPhoto,
  type RunAttachment,
} from '@/lib/nina/attach'
```

**Change 6b — the prop and the state.** Replace lines 78-111 (the component head through the
`attachment` state declaration):

```tsx
export function ChatScreen({
  initial,
  todayISO,
  userId,
  pending,
  pendingPhoto,
}: {
  /** The stored conversation, oldest first, mapped on the server. */
  initial: readonly ChatMessage[]
  /** From the server, so "Today" cannot differ between render and hydration. */
  todayISO: string
  /**
   * Phase 6. Passed straight through to `Composer`, which needs it to build
   * `nina/<userId>/chat/<id>.jpg`. Not a secret and not a capability: `/api/upload` re-derives the
   * owner from the session and refuses any pathname that does not match it.
   */
  userId: string
  /**
   * Phase 8 (R13). The run `/r/[id]`'s icon just handed over, resolved and formatted on the server
   * from `?attach=<runId>`, or null. It becomes composer state immediately — see the cleanup
   * below.
   */
  pending: RunAttachment | null
  /**
   * F34 R2. The album photo `/admin/nina` handed over on `?photo=avatar:<id>`, resolved
   * OWNER-SCOPED on the server to `{ kind, id, url }`, or null. It becomes composer state
   * immediately, exactly as `pending` does, and it is cleared off the URL by the same effect.
   *
   * REQUIRED rather than optional, on RULING E2b's habit: `app/nina/page.tsx` is the one caller,
   * and `tsc` should be the thing that notices if it stops passing it — an optional prop that
   * silently defaults to `null` would turn a broken deep link into a composer that just never arms
   * and never says why.
   *
   * The `url` is all the client gets. `description` stays on the server, where the send copies it
   * onto the new row (invariant 5).
   */
  pendingPhoto: NinaExistingPhoto | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [overlap, setOverlap] = useState(0)
  /** Phase 7 (R12). The message being replied to, or null for an ordinary send. */
  const [draftQuote, setDraftQuote] = useState<QuoteView | null>(null)
  /** Phase 7. The message a jump just landed on. Held for `QUOTE_FLASH_MS`, then cleared. */
  const [flashId, setFlashId] = useState<string | null>(null)
  /** Phase 8 (R13). The run the next message will carry. Seeded from the server's `?attach=`. */
  const [attachment, setAttachment] = useState<RunAttachment | null>(pending)
  /**
   * F34 R2. The already-owned photo the next message will carry. Seeded from the server's
   * `?photo=`, and held BESIDE `attachment` rather than in a union with it: a run and a photo can
   * legitimately be pinned to the same message, and `sendNinaMessage` takes both fields in one
   * call.
   */
  const [photo, setPhoto] = useState<NinaExistingPhoto | null>(pendingPhoto)
```

**Change 6c — consume both parameters.** Replace lines 117-132 (the comment block and the
`useLayoutEffect`):

```tsx
  /*
   * **`?attach=` AND `?photo=` are consumed, not left lying on the entry.** They have done their
   * job the moment they are in state, and leaving them would re-arm the composer on the way back:
   * send the message, tap its card, come back with the back-swipe, and the POP would re-render this
   * page from a URL still asking for the same run — pinning a run the runner already sent. `?photo=`
   * has the sharper version of the same problem, because the tab it opened in stays open: a reload
   * of that tab would re-arm the same album photo and invite a second send of it.
   *
   * ONE effect deleting both, not two: `replaceState` on a `URLSearchParams` copy so R14's `at`
   * (which may be written onto this same entry later, or may already be on it) survives untouched,
   * and two independent `replaceState` calls in the same commit would race to decide which of them
   * wrote the surviving URL. The F24 idiom, and the reason it is `replace`: this entry is where we
   * already are.
   */
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(ATTACH_PARAM) && !params.has(PHOTO_PARAM)) return
    params.delete(ATTACH_PARAM)
    params.delete(PHOTO_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])
```

**Change 6d — `handleSend`.** Replace lines 321-446 in full:

```tsx
  const handleSend = useCallback(
    async (draft: { body: string; images: readonly ComposerDraftImage[] }) => {
      if (busy) return
      /* R13's floor, and the client half of RULING B1's ONE refusal rule: a message with no words,
       * no photo, no run and no pinned album photo is a mis-tap. `canSend` already refuses it; this
       * is the guard that means the action can trust its own input. The four disjuncts here are the
       * same four `sendNinaMessage` checks at `lib/nina/actions.ts:277`, in the same order, and
       * they must stay that way — a fifth on one side only is an enabled Send button that silently
       * refuses. */
      if (
        draft.body.length === 0 &&
        draft.images.length === 0 &&
        attachment === null &&
        photo === null
      ) {
        return
      }

      const body = draft.body
      const imageUrls = draft.images.map((image) => image.url)
      /* Read once, then unpinned below — the same shape `draftQuote` uses, and for the same
       * reason: the optimistic row has to carry what the action will persist. */
      const sending = attachment
      const sendingPhoto = photo
      const localId = `local-${crypto.randomUUID()}`
      const dayISO = todayInJakarta()
      /* Read once and cleared immediately: the strip must disappear the moment the message is in
       * the log, and the optimistic row has to carry the same pointer the action will persist. */
      const replyToMessageId = draftQuote?.targetId ?? null
      setDraftQuote(null)
      /*
       * Unpinned the moment it joins the conversation, even though the send may still fail. The
       * failed bubble keeps its card — that is where the run is now — and showing the chip as well
       * would put the same run on screen twice and invite a second send of it.
       */
      setAttachment(null)
      /* The same argument, and it is stronger here: the photo is in the album either way, so a
       * chip left armed after a failed send is an invitation to attach it twice. */
      setPhoto(null)
      setNotice(null)
      /*
       * The already-owned photo goes AFTER anything he picked, because that is where the server
       * puts it: `lib/nina/actions.ts:451` inserts its row at `sortOrder: images.length`. One
       * array, so the optimistic bubble and every later server render of the same message agree
       * about the order inside it.
       */
      const optimisticUrls =
        sendingPhoto === null ? imageUrls : [...imageUrls, sendingPhoto.url]
      setMessages((current) => [
        ...current,
        {
          id: localId,
          role: 'user',
          body,
          dayISO,
          state: 'sending',
          replyToId: replyToMessageId,
          /* Already on the CDN — the describe pre-pass uploaded the picked ones before send was
           * possible, and the pinned one has been in Blob since it was uploaded to the album — so
           * the optimistic row shows the same URLs the server row will carry. No object URL to
           * revoke, and no flicker when the real row lands. */
          imageUrls: optimisticUrls.length > 0 ? optimisticUrls : undefined,
          /* R13. The card renders from client state on this row and from `nina_messages.run_id` on
           * every later load; both go through the same `RunAttachment`, so there is no lag and no
           * second shape. */
          attachment: sending,
        },
      ])
      setBusy(true)
      setTyping(true)

      let result: Awaited<ReturnType<typeof sendNinaMessage>> | null = null
      try {
        result = await sendNinaMessage({
          body,
          imageTickets: draft.images.map((image) => image.ticket),
          replyToMessageId,
          runId: sending?.runId ?? null,
          /*
           * F34 R2, and the whole of "we dont actually reupload the photo into the chat, but just
           * some kind of pointer to the existing file". An id and a kind, never a URL: the field
           * has existed since F33 phase 13 and `resolveAttachment` proves ownership against
           * `user_id` before a row is written, which is strictly more than a signed ticket could
           * prove. The `url` this component holds is for the chip and for the optimistic bubble;
           * it is not sent, and a tampered one buys nothing.
           */
          attachExisting:
            sendingPhoto === null ? null : { kind: sendingPhoto.kind, id: sendingPhoto.id },
        })
      } catch {
        result = null
      }
      if (!alive.current) return

      if (result === null || !result.ok) {
        setTyping(false)
        setBusy(false)
        setMessages((current) =>
          current.map((m) => (m.id === localId ? { ...m, state: 'failed' } : m)),
        )
        setNotice('send-failed')
        return
      }

      // Adopt the server's id for the runner's own row, so phase 7 can quote it and phase 8 can
      // anchor to it. Until this point it carried a client-minted `local-` id.
      const confirmedId = result.userMessageId
      setMessages((current) =>
        current.map((m) =>
          m.id === localId ? { ...m, id: confirmedId ?? m.id, state: 'sent' } : m,
        ),
      )

      const bubbles = result.bubbles
      if (bubbles.length === 0) {
        // `unavailable` and a merely empty reply read the same to the runner — he does not care
        // *why* she said nothing. The distinction stays in the result type, not in the copy.
        setTyping(false)
        setBusy(false)
        setNotice('no-reply')
        return
      }

      const plan = planReveal(bubbles.map((b) => b.body))
      for (const [index, bubble] of bubbles.entries()) {
        const gap = plan[index] ?? 0
        if (gap > 0) {
          setTyping(true)
          await sleep(gap)
          if (!alive.current) return
        }
        // The indicator stays up while there is another thought coming, and drops with the last.
        setTyping(index < bubbles.length - 1)
        setMessages((current) => [
          ...current,
          {
            id: bubble.id,
            role: 'nina',
            body: bubble.body,
            dayISO: todayInJakarta(),
            state: 'sent',
            /*
             * HER OWN QUOTE, ON THE OPTIMISTIC REVEAL. She may have replied to a specific message,
             * and phase 3 puts her `reply_to_id` on the FIRST bubble only ("a four-bubble reply is
             * one answer to one message"). A hard `null` here would mean the quote only appeared on
             * the next server render of `/nina` — R12's UI lagging the database by a page load, for
             * two lines. RULING B1 assigned those two lines to phase 7, which already edits
             * `lib/nina/actions.ts` where `SentBubble` is declared.
             */
            replyToId: bubble.replyToId,
          },
        ])
      }

      setTyping(false)
      setBusy(false)
    },
    [busy, draftQuote, attachment, photo],
  )
```

**Change 6e — hand it to the composer.** Replace lines 477-486:

```tsx
      <Composer
        onSend={handleSend}
        busy={busy}
        bottomCss={composerBottomCss(overlap, COMPOSER_CLEARANCE_PX)}
        userId={userId}
        reply={draftQuote}
        onCancelReply={() => setDraftQuote(null)}
        attachment={attachment}
        onClearAttachment={() => setAttachment(null)}
        photo={photo}
        onClearPhoto={() => setPhoto(null)}
      />
```

**Impact:** one required prop, one piece of state, one field on the action call, one entry in the
`useCallback` dependency list. Nothing decides inside a `setState` updater (invariant 6, and F17's
measured double-upload bug): `optimisticUrls` is computed before `setMessages` is called.

---

### Step 7: `Composer` renders the chip and agrees with the server

**File:** `components/nina/Composer.tsx` — five edits.

**Change 7a — the imports.** Replace line 15 and add the chip import beside `AttachmentChip`
(line 18):

```ts
import type { NinaExistingPhoto, RunAttachment } from '@/lib/nina/attach'
import type { QuoteView } from '@/lib/nina/reply'
import { compressForNina } from '@/lib/photos/compressForNina'
import { AttachmentChip } from './AttachmentChip'
import { PhotoAttachmentChip } from './PhotoAttachmentChip'
import { QuoteStub } from './QuoteStub'
```

**Change 7b — the props.** Replace lines 129-176 (the whole parameter list, destructure and type):

```tsx
export function Composer({
  onSend,
  busy,
  bottomCss,
  userId,
  reply = null,
  onCancelReply,
  attachment = null,
  onClearAttachment,
  photo = null,
  onClearPhoto,
}: {
  /**
   * Receives the trimmed body and whatever photos are ready. Must be referentially stable — see
   * the docstring.
   *
   * `void | Promise<void>` rather than `void`: `ChatScreen`'s handler is async, and while an
   * async function is assignable to a `void`-returning type, spelling the union means nobody has
   * to know that to read this signature.
   */
  onSend: (draft: { body: string; images: readonly ComposerDraftImage[] }) => void | Promise<void>
  /** A turn is in flight. The box stays editable; only sending is held. */
  busy: boolean
  /** From `composerBottomCss`. A CSS length, because `var(--safe-bottom)` is CSS-only. */
  bottomCss: string
  /** Needed to build `nina/<userId>/chat/<id>.jpg`. Not a capability — see the header. */
  userId: string
  /** Phase 7 (R12). The message this draft answers. Null is the ordinary composer. */
  reply?: QuoteView | null
  /** Drop the reply and keep the draft text. Required whenever `reply` can be non-null. */
  onCancelReply?: () => void
  /**
   * Phase 8 (R13). The run pinned to the next message, or null. **Its presence is what makes an
   * empty message sendable**: "then user can ask something, or not include any text at all, then
   * nina will respond accordingly."
   *
   * This is the client half of RULING B1's ONE refusal rule, and it must stay the same predicate
   * as the server's: `body.trim() === '' && !hasAttachment`, where `hasAttachment` is
   * `imageTickets.length > 0` (phase 6) `|| runId != null` (phase 8) `|| attachExisting != null`
   * (phase 13). Adding a clause on one side only produces an enabled Send button that silently
   * refuses — the exact bug the single-rule ruling exists to prevent. `reply` is deliberately not
   * a clause on either side: a quote with no words is not a message.
   *
   * The attachment itself is NOT passed back through `onSend`. `ChatScreen` owns the state and
   * reads it from there, so the composer's callback keeps the one shape it had.
   */
  attachment?: RunAttachment | null
  /** Unpin it. `ChatScreen` owns the state; this only reports the tap. */
  onClearAttachment?: () => void
  /**
   * F34 R2. The album photo pinned to the next message, or null — a blob the server already owns,
   * arrived on `?photo=avatar:<id>` and resolved owner-scoped by `app/nina/page.tsx`.
   *
   * **This is the FOURTH and LAST disjunct of the refusal rule printed above**, and the rule is
   * now complete on both sides: `attachExisting != null` was already the server's fourth clause
   * (`lib/nina/actions.ts:277`) and had no client counterpart until this phase, because the only
   * caller so far — `/nina/about`'s "Kirim ke chat" — never went through this composer. It does
   * now, so `canSend` gains the matching clause in the same commit. Nobody rewrites that
   * condition, they extend it; there is nothing left to extend it with.
   *
   * Held separately from `attachment` rather than in a union with it: a run and a photo can be
   * pinned to the same message, and `sendNinaMessage` takes both fields in one call.
   *
   * Like `attachment`, it is NOT passed back through `onSend` — `ChatScreen` owns the state and
   * reads it there, so this component's callback keeps the one shape it has had since phase 6.
   */
  photo?: NinaExistingPhoto | null
  /** Unpin it. `ChatScreen` owns the state; this only reports the tap. */
  onClearPhoto?: () => void
}) {
```

**Change 7c — `canSend`.** Replace lines 197-201:

```ts
  /* `|| attachment !== null` is phase 8's clause and `|| photo !== null` is F34 R2's — the fourth
   * and final one. Phase 6's image clause was already in the disjunction when it landed; nobody
   * rewrites this condition, they extend it. Mirrors the server rule in `sendNinaMessage`
   * (`lib/nina/actions.ts:277`) exactly, clause for clause: text, tickets, run, existing blob. */
  const canSend =
    (value.trim().length > 0 || ready.length > 0 || attachment !== null || photo !== null) &&
    !inFlight &&
    !busy
```

**Change 7d — render it.** Replace lines 355-359:

```tsx
        {/* Phase 8 (R13). Below the reply strip and above the tiles, which is the order the bubble
            itself renders in: what he is answering, then what he is handing over. */}
        {attachment !== null && onClearAttachment !== undefined && (
          <AttachmentChip attachment={attachment} onClear={onClearAttachment} />
        )}

        {/* F34 R2. Between the run chip and the picked tiles, because that is the order the message
            carries: the run, then the photo already in the album, then anything picked here — the
            same order `lib/nina/actions.ts` writes the image rows in (`sortOrder: images.length`
            puts the pinned one after the picked ones, and this strip is above the tile row). */}
        {photo !== null && onClearPhoto !== undefined && (
          <PhotoAttachmentChip photo={photo} onClear={onClearPhoto} />
        )}
```

**Change 7e — the placeholder.** Replace line 457:

```tsx
            /* The placeholder carries the hint; the accessible NAME stays "Message Nina" so the
               field is not renamed under the runner mid-message. With something pinned it becomes
               the requirement's own words — "user can input additional text question / comment
               (optional)" — so the box says out loud that typing is not required. */
            placeholder={
              attachment === null && photo === null
                ? 'Message Nina'
                : 'Add a note, or just send it'
            }
```

**Impact:** two optional props, one disjunct, one strip, one placeholder branch. `submit()` is
unchanged and still passes only `{ body, images }`; the pinned photo never travels through `onSend`.

## Verification

The worktree has `node_modules` (`npm ci`, exit 0) and a gitignored copy of `.env.local`. Nothing
to install.

**Build:** `npm run typecheck` (which is `next typegen && tsc --noEmit` — the typegen step is what
makes `PageProps<'/nina'>` exist), then `npm run build`.

**Tests:**

```
npm test
npm run lint
npm run format:check
npm run ci:f08-guard
npm run ci:llm-payload-guard
npm run ci:client-secret-guard
npm run ci:data-layer-guard
```

- `ci:f08-guard` walks `app/ lib/ components/` for hand-rolled units. Nothing added here renders a
  measurement — the chip renders an image and no text.
- `ci:llm-payload-guard` asserts no model call is awaited in a render path. The page's new element
  is a database read; no `describeNinaImage`, no `runNinaTurn`.
- `ci:client-secret-guard` forbids `NEXT_PUBLIC_` and any secret name in a client module. Nothing
  added names one; the origin never crosses in this phase at all (that is phase 7's prop).
- `ci:data-layer-guard` inspects `lib/db/queries.ts`, which this phase does not touch; run it to
  prove that.

**Manual check** — the five things that actually matter, in order:

1. `SELECT id FROM nina_avatars WHERE user_id = <you> LIMIT 1`, then open
   `/nina?photo=avatar:<that id>`. The composer paints with the photo chipped above the text box and
   the placeholder reads "Add a note, or just send it". The address bar shows `/nina` — the parameter
   is gone.
2. Press Send with the box empty. One user bubble appears carrying the photo, and Nina answers it.
3. **Count the objects in the Blob store before and after step 2.** The count must be unchanged —
   that is the requirement's "we dont actually reupload the photo into the chat". Then
   `SELECT blob_url, description FROM nina_message_images ORDER BY created_at DESC LIMIT 1`: the URL
   is the album row's own blob URL, and `description` is a copy of the album row's (or `null`, if
   the photo has not been described yet — which is fine, and is the case phase 4 creates).
4. Reload the tab. The chip is gone (the parameter was consumed) and the sent bubble still shows the
   photo. Hit the back-swipe from a run page and come back: still not re-armed.
5. `/nina?photo=avatar:aaaaaaaaaaaa` (a well-formed id that is not yours) and
   `/nina?photo=nonsense`: both paint the ordinary empty composer. No error page, no chip, no
   500 in the log.
6. `/nina?attach=<a reviewed runId>&photo=avatar:<id>` arms both chips and one send carries both.
7. `/nina/about` → open a photo → "Kirim ke chat" still sends immediately and lands on `/nina` with
   her reply already there. **This flow must be unchanged**; it does not go through the composer.

**Exit criteria:** `/nina?photo=avatar:<id>` arms the composer with the photo; sending with an empty
box works and writes exactly one `nina_message_images` row pointing at the existing blob with **zero**
new objects in Blob and zero vision calls; a forged or foreign id arms nothing and is not an error
page; `/nina/about`'s attach flow is untouched; `npm test`, `npm run typecheck`, `npm run lint`,
`npm run format:check` and the four `ci:*-guard` scripts are green.

## Handoffs

1. **`resolveAttachment` reads the whole album to find one row — and phase 4 makes that hurt.**
   `lib/nina/actions.ts:151-166` does `listNinaAvatars(userId).find(...)` for `'avatar'` and
   `listNinaMessageImages(userId, { limit: NINA_GALLERY_LIMIT }).find(...)` for `'image'`. Both are
   correct and both were cheap when the album held "the handful of faces F33 R23 described". The
   user's stated requirement is *"i will put hundreds of profile pics in there"*, so every send with
   a pinned photo will read hundreds of rows to answer one id. The fix is two lines — swap in
   `getNinaAvatar(userId, attach.id)` and this phase's `getNinaMessageImage(userId, attach.id)`,
   both already exported and both single-row primary-key lookups. **Deliberately not done here:**
   this phase's scope forbids opening `lib/nina/actions.ts`, and that file is the one place the
   refusal rule lives, so it should be edited by whoever is allowed to.

   **ASSIGNED (round 1): phase 4.** It already owns "the describe pre-pass off the hot path" — the
   same kind of cleanup, in the same requirement's neighbourhood — and it is the phase whose
   thumbnails and batch registers make the album big. Because the `'image'` branch needs
   `getNinaMessageImage`, which this phase creates, **phase 4's `Depends on` gains phase 3**; the
   plan index's declared concurrency is unchanged, since it already runs `{1, 2, 3}` together and
   then 4. Phase 7 independently escalated the same finding as *"breaks R2 with a green CI"*, on
   the condition that phase 1 caps `listNinaAvatars`. Verified: phase 1 does **not** cap it — it
   adds `listNinaAvatarsInFolder` beside it and leaves every one of its three callers' behaviour
   alone — so the hazard is efficiency today rather than a broken share link. It is fixed anyway,
   and phase 1 now carries an explicit "do not cap `listNinaAvatars`" line so it stays that way.

2. **The thumbnail, once phase 1's column exists — a follow-up card, not a phase.**
   `app/nina/page.tsx` resolves the row to a URL in exactly one expression (step 4e), so preferring
   a derived thumbnail is a one-site change: on the `'avatar'` branch, `photoRow.blobUrl` becomes
   `photoRow.thumbUrl ?? photoRow.blobUrl` (phase 1's column is `thumb_url`; `NinaImageRow` has no
   equivalent, so the `'image'` branch is unchanged). Deliberately **not** assigned to a phase by
   the reconciler: it is a 56 px chip on a mobile chat screen, the fallback is what every row uses
   today, and touching `app/nina/page.tsx` after this phase has landed buys one thumbnail-sized
   download. Worth a card; not worth widening a phase.

3. **Phase 7 owns the URL.** The exact expression is in the Interface Contract above. Phase 7 also
   owns firing phase 4's on-demand describe before opening the tab, non-fatally, so *"nina will
   respond to it accordingly"* has something to work from. This phase's resolve path deliberately
   does **not** assume a description exists: it reads only `blobUrl`, and `resolveAttachment` copies
   `null` happily, so a freshly uploaded photo with no description still sends and Nina is simply
   told nothing about what is in it.

4. **`/nina/about` still has its own send path.** `attachNinaPhotoToChat` +
   `router.push('/nina')` (`components/nina/NinaAboutScreen.tsx:176-199`) sends immediately with no
   chance to type a question, which is the WhatsApp behaviour that screen was built for. Unifying it
   onto the `?photo=` idiom would give the mobile album the same optional-question affordance for
   free, and would leave one send path instead of two. Not touched: the plan's Scope section rules
   it out explicitly ("R2 is a *second* entry point, not a replacement"), and it is a UX change the
   user did not ask for. A card, if anyone wants it.

5. **`ChatScreen` now has five props and two of them are pinned-attachment state.** If a third
   pinnable thing ever appears, the pair-of-props-per-thing pattern stops paying and the right shape
   is one `pinned: { run, photo }` object. Two is not yet that moment; three would be.

## Rollback

`git revert` the phase's commit (or `git checkout main -- <the seven files>`). Nothing to undo
beyond code:

- **No migration, no schema change, no backfill.** The phase adds columns to nothing.
- **No data is orphaned.** A message sent through the new path is an ordinary `nina_messages` row
  with an ordinary `nina_message_images` row pointing at a blob that was already in the store and
  stays there — indistinguishable from one sent through `/nina/about`'s existing flow, and rendered
  by the same `imageUrls` code. Reverting this phase does not break a single row it wrote.
- **No blob is written or deleted**, so `scripts/blob-reap.mjs` is unaffected either way.
- After the revert, `/nina?photo=avatar:<id>` is an unknown query parameter: the page ignores it and
  paints the ordinary chat. Any link phase 7 already put in the explorer degrades to "opens the chat
  in a new tab", which is a mild disappointment rather than a broken page.
- The one asymmetry worth naming: if phase 7 has landed and phase 3 is reverted alone, the explorer
  keeps offering "Share link to Nina" and the tab that opens arms nothing. Revert in dependency
  order — 7 before 3 — as the plan index's Rollback section says.
